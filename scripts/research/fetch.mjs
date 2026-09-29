import http from "node:http"
import https from "node:https"
import dns from "node:dns/promises"
import net from "node:net"
import zlib from "node:zlib"
import fs from "node:fs"
import { sha256, sourceId, sourceVersionId } from "./contracts.mjs"
import { atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"

export function isPublicIP(raw) {
  const address = raw.replace(/^\[|\]$/g, "").toLowerCase()
  if (address.includes("%")) return false
  if (address.startsWith("::ffff:")) {
    const tail = address.slice(7)
    if (net.isIP(tail) === 4) return isPublicIP(tail)
    const p = tail.split(":")
    if (p.length === 2) {
      const n = parseInt(p[0], 16) * 65536 + parseInt(p[1], 16)
      return isPublicIP([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."))
    }
  }
  if (net.isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number)
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 &&
        (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2) || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    )
  }
  if (net.isIP(address) === 6) {
    const first = parseInt(address.split(":")[0], 16)
    const second = parseInt(address.split(":")[1] || "0", 16)
    return (
      first >= 0x2000 &&
      first < 0x3fff &&
      first !== 0x2002 &&
      !(first === 0x2001 && (second < 0x200 || second === 0xdb8))
    )
  }
  return false
}
export function assertURL(raw, allowedHosts) {
  const u = new URL(raw)
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    (u.port && !["80", "443"].includes(u.port))
  )
    throw Error("Only public HTTP(S) URLs on standard ports are allowed")
  if (allowedHosts && !allowedHosts.includes(u.hostname)) throw Error("Host outside channel policy")
  if (net.isIP(u.hostname.replace(/^\[|\]$/g, "")) && !isPublicIP(u.hostname))
    throw Error("Non-public IP")
  return u
}
export async function pinnedAddresses(host, resolver = dns.lookup) {
  const addresses = await resolver(host.replace(/^\[|\]$/g, ""), { all: true, verbatim: true })
  if (!addresses.length || addresses.some((a) => !isPublicIP(a.address)))
    throw Error("DNS includes non-public address")
  return addresses
}
function requestPinned(u, addresses, headers, budget, request = { method: "GET" }) {
  return new Promise((resolve, reject) => {
    const selected = addresses[0]
    const req = (u.protocol === "https:" ? https : http).request(u, {
      agent: false,
      headers,
      method: request.method,
      lookup: (_host, options, cb) =>
        options.all ? cb(null, [selected]) : cb(null, selected.address, selected.family),
    })
    const timer = setTimeout(() => req.destroy(Error("Fetch deadline exceeded")), budget.timeout_ms)
    req.on("socket", (s) => {
      s.once("connect", () => {
        if (
          !isPublicIP(s.remoteAddress || "") ||
          s.remoteAddress?.replace(/^::ffff:/, "") !== selected.address.replace(/^::ffff:/, "")
        )
          req.destroy(Error("Connected IP differs from pinned public address"))
      })
    })
    req.once("error", (e) => {
      clearTimeout(timer)
      reject(e)
    })
    req.once("response", (res) => {
      const h = res.headers,
        status = res.statusCode
      if ([301, 302, 303, 307, 308, 304, 403, 404, 410, 429].includes(status)) {
        res.destroy()
        clearTimeout(timer)
        resolve({ status, headers: h, body: Buffer.alloc(0) })
        return
      }
      const limit = /pdf/i.test(h["content-type"] || "") ? budget.pdf_bytes : budget.html_bytes
      let size = 0,
        wire = 0
      res.on("data", (c) => {
        wire += c.length
        if (wire > limit) req.destroy(Error("BODY_TOO_LARGE"))
      })
      const encoding = h["content-encoding"]?.toLowerCase()
      const body =
        encoding === "gzip"
          ? res.pipe(zlib.createGunzip())
          : encoding === "br"
            ? res.pipe(zlib.createBrotliDecompress())
            : encoding === "deflate"
              ? res.pipe(zlib.createInflate())
              : res
      const chunks = []
      body.on("error", (e) => req.destroy(e))
      body.on("data", (c) => {
        size += c.length
        if (size > limit) req.destroy(Error("BODY_TOO_LARGE"))
        else chunks.push(c)
      })
      body.on("end", () => {
        clearTimeout(timer)
        resolve({ status, headers: h, body: Buffer.concat(chunks) })
      })
    })
    req.end(request.body)
  })
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const hostQueues = new Map(),
  lastHostRequest = new Map()
async function hostRequest(host, interval, action) {
  const previous = hostQueues.get(host) || Promise.resolve()
  const next = previous
    .catch(() => {})
    .then(async () => {
      await sleep(Math.max(0, (lastHostRequest.get(host) || 0) + interval - Date.now()))
      lastHostRequest.set(host, Date.now())
      return action()
    })
  hostQueues.set(host, next)
  try {
    return await next
  } finally {
    if (hostQueues.get(host) === next) hostQueues.delete(host)
  }
}
export function retryDelay(value, attempt, now = Date.now()) {
  const explicit = /^\d+$/.test(value || "") ? Number(value) * 1000 : Date.parse(value || "") - now
  return Math.min(60000, Math.max(0, Number.isFinite(explicit) ? explicit : 1000 * 2 ** attempt))
}
export class SourceFetcher {
  constructor(root, options = {}) {
    this.root = root
    this.options = {
      timeout_ms: 20000,
      html_bytes: 10 * 1024 ** 2,
      pdf_bytes: 50 * 1024 ** 2,
      redirects: 5,
      attempts: 3,
      interval_ms: 3000,
      ...options,
    }
    this.resolve = options.resolve || dns.lookup
    this.transport = options.transport || requestPinned
  }
  async fetch(raw, { allowed_hosts, conditional = true, source_id, method = "GET", form } = {}) {
    if (!["GET", "POST"].includes(method)) throw Error("Unsupported fetch method")
    if (method === "GET" && form !== undefined) throw Error("GET request cannot carry a form")
    if (method === "POST") {
      if (typeof form !== "string" || !form.length || Buffer.byteLength(form) > 4096)
        throw Error("POST requires a bounded URL-encoded form")
      const urlFields = new URL(raw).searchParams,
        bodyFields = new URLSearchParams(form),
        seen = new Set()
      for (const [name, value] of bodyFields) {
        if (seen.has(name) || urlFields.getAll(name).length !== 1 || urlFields.get(name) !== value)
          throw Error("POST form fields must match source URL")
        seen.add(name)
      }
      if (!seen.size) throw Error("POST requires form fields")
    }
    // Identity follows the submitted URL spelling, as in prepare-drive.py.
    // Preserve the path spelling on the wire: some publishers route a trailing
    // slash to the article and the path without it to an unrelated page.
    const request = new URL(raw)
    request.hash = ""
    const original_url = raw,
      request_url = request.toString(),
      id = source_id || sourceId(raw)
    if (!/^[a-f0-9]{20}$/.test(id)) throw Error("Invalid source identity")
    if (method === "POST" && id !== sourceId(raw))
      throw Error("POST source identity must include its form-bound URL")
    return withLock(this.root, "source-" + id, async () => {
      const cache = readJSON(this.root, `documents/${id}/latest.json`)
      let cachedBody = null
      if (cache?.body_path) {
        cachedBody = fs.readFileSync(safePath(this.root, cache.body_path))
        if (sha256(cachedBody) !== cache.body_sha256) throw Error("Cached source hash mismatch")
      }
      let current = request_url,
        redirect_chain = [],
        response
      const observed_at = new Date().toISOString()
      try {
        for (let hop = 0; hop <= this.options.redirects; hop++) {
          const u = assertURL(current, allowed_hosts)
          const headers = {
            "user-agent": this.options.user_agent || "TechKnowledgeGarden/1.0",
            accept: "text/html,application/pdf,application/xml,application/json,text/plain;q=0.8",
            "accept-encoding": "gzip, br, deflate",
          }
          if (method === "POST") {
            headers.accept = "application/json"
            headers["content-type"] = "application/x-www-form-urlencoded; charset=UTF-8"
            headers["content-length"] = Buffer.byteLength(form)
            headers["x-requested-with"] = "XMLHttpRequest"
          }
          if (method === "GET" && conditional && cachedBody && current === cache.final_url) {
            if (cache.etag) headers["if-none-match"] = cache.etag
            if (cache.last_modified) headers["if-modified-since"] = cache.last_modified
          }
          // Form endpoints are used only for read-only discovery, but a POST
          // should still require a fresh run decision before another attempt.
          const attempts = method === "POST" ? 1 : this.options.attempts
          for (let attempt = 0; attempt < attempts; attempt++) {
            const addresses = await pinnedAddresses(u.hostname, this.resolve)
            response = await hostRequest(u.hostname, this.options.interval_ms, () =>
              this.transport(u, addresses, headers, this.options, { method, body: form }),
            )
            if (response.status !== 429 && response.status < 500) break
            if (attempt + 1 < attempts)
              await sleep(retryDelay(response.headers["retry-after"], attempt))
          }
          if (![301, 302, 303, 307, 308].includes(response.status)) break
          if (method === "POST") throw Error("POST redirect requires a new explicit source URL")
          if (!response.headers.location || hop === this.options.redirects)
            throw Error("Redirect limit or missing destination")
          const next = new URL(response.headers.location, current).toString()
          assertURL(next, allowed_hosts)
          redirect_chain.push({ from: current, to: next, status: response.status })
          current = next
        }
        const status =
          response.status === 304
            ? "not_modified"
            : response.status === 403
              ? "blocked"
              : [404, 410].includes(response.status)
                ? "not_found"
                : response.status === 429
                  ? "rate_limited"
                  : response.status >= 200 && response.status < 300
                    ? "captured"
                    : "failed"
        if (status === "not_modified" && (method === "POST" || !cachedBody))
          throw Error("304 without verified GET cache")
        const body = status === "not_modified" ? cachedBody : response.body
        const record = {
          schema_version: "source-document/v1",
          source_id: id,
          original_url,
          request_method: method,
          ...(method === "POST" ? { request_body_sha256: sha256(form) } : {}),
          final_url: current,
          observed_at,
          fetch_status: status,
          http_status: response.status,
          redirect_chain,
          mime_type: response.headers["content-type"] || cache?.mime_type || null,
          etag: response.headers.etag || (status === "not_modified" ? cache?.etag : null),
          last_modified:
            response.headers["last-modified"] ||
            (status === "not_modified" ? cache?.last_modified : null),
        }
        if (["captured", "not_modified"].includes(status)) {
          if (!body.length) throw Error("Empty source response")
          record.body_sha256 = sha256(body)
          record.source_version_id = sourceVersionId(id, record.body_sha256)
          record.body_path = `documents/${id}/${record.body_sha256}/body.bin`
          const existing = safePath(this.root, record.body_path)
          if (fs.existsSync(existing) && sha256(fs.readFileSync(existing)) !== record.body_sha256)
            throw Error("Stored source version corrupted")
          if (!fs.existsSync(existing)) atomicWrite(this.root, record.body_path, body)
          if (
            !fs.existsSync(
              safePath(this.root, `documents/${id}/${record.body_sha256}/document.json`),
            )
          )
            atomicWrite(this.root, `documents/${id}/${record.body_sha256}/document.json`, record)
          atomicWrite(this.root, `documents/${id}/latest.json`, record)
        }
        atomicWrite(
          this.root,
          `documents/${id}/attempts/${observed_at.replace(/[:.]/g, "-")}.json`,
          record,
        )
        return record
      } catch (e) {
        const record = {
          schema_version: "source-document/v1",
          source_id: id,
          original_url,
          request_method: method,
          ...(method === "POST" ? { request_body_sha256: sha256(form) } : {}),
          final_url: current,
          observed_at,
          fetch_status: e.message === "BODY_TOO_LARGE" ? "too_large" : "failed",
          error: e.message,
          redirect_chain,
        }
        atomicWrite(
          this.root,
          `documents/${id}/attempts/${observed_at.replace(/[:.]/g, "-")}.json`,
          record,
        )
        return record
      }
    })
  }
}
