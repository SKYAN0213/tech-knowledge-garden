import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { atomicCreate, readJSON, safePath } from "./run-state.mjs"
import { sha256, sourceId } from "./contracts.mjs"
import { assertURL } from "./fetch.mjs"
import { fetchWithPolicy } from "./source-policy.mjs"

export async function renderDocument(root, fetcher, document, options = {}) {
  if (!["captured", "not_modified"].includes(document.fetch_status))
    throw Error("Browser requires a captured source; access blocks are not bypassed")
  assertURL(document.final_url, options.allowed_hosts)
  if (document.rendered_from) throw Error("Nested browser captures are not supported")
  if (sha256(fs.readFileSync(safePath(root, document.body_path))) !== document.body_sha256)
    throw Error("Browser original body hash mismatch")
  const result = await new Promise((resolve, reject) => {
    const python = process.env.RESEARCH_PYTHON || path.resolve(root, "runtime/venv/bin/python")
    const child = spawn(python, ["integrations/research-worker/browser.py"], {
      stdio: ["pipe", "pipe", "pipe"],
    })
    const lines = createInterface({ input: child.stdout }),
      failures = [],
      resources = []
    let received = false,
      stderr = ""
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      reject(Error("Browser time budget exceeded"))
    }, options.timeout_ms || 60000)
    child.stderr.on("data", (b) => {
      stderr = (stderr + b).slice(-2000)
    })
    child.once("error", (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.once("close", () => {
      clearTimeout(timer)
      if (!received) reject(Error("Browser exited before result: " + stderr))
    })
    lines.on("line", async (line) => {
      try {
        if (line.length > 10 * 1024 ** 2) throw Error("Browser output exceeds HTML budget")
        const message = JSON.parse(line)
        if (message.type === "fetch") {
          const resource = await fetchWithPolicy(root, fetcher, message.url, {
            allowed_hosts: options.allowed_hosts,
          })
          resources.push({
            url: message.url,
            source_version_id: resource.source_version_id,
            status: resource.fetch_status,
            document: resource,
          })
          if (child.stdin.writable)
            child.stdin.write(
              JSON.stringify({
                request_id: message.request_id,
                status: ["captured", "not_modified"].includes(resource.fetch_status)
                  ? "captured"
                  : resource.fetch_status,
                body_path: resource.body_path,
                body_sha256: resource.body_sha256,
                mime_type: resource.mime_type,
                error: resource.error,
              }) + "\n",
            )
        } else if (message.type === "result") {
          received = true
          clearTimeout(timer)
          child.stdin.end()
          resolve({ ...message, resources, failures })
        } else if (message.type === "error") {
          received = true
          clearTimeout(timer)
          child.stdin.end()
          child.kill("SIGKILL")
          reject(Error(message.error))
        } else throw Error("Invalid browser protocol")
      } catch (e) {
        failures.push(e.message)
        child.kill("SIGKILL")
        clearTimeout(timer)
        reject(e)
      }
    })
    child.stdin.write(
      JSON.stringify({
        root: path.resolve(root),
        url: document.final_url,
        document: {
          body_path: document.body_path,
          body_sha256: document.body_sha256,
          mime_type: document.mime_type,
        },
        request_limit: 80,
        wait_selector: options.wait_selector,
      }) + "\n",
    )
  })
  const bytes = Buffer.from(result.html),
    hash = sha256(bytes)
  if (bytes.length > 10 * 1024 ** 2) throw Error("Browser HTML exceeds body budget")
  const capture_id = sha256(JSON.stringify([document.source_version_id, hash, result.resources]))
  const manifest_path = `renders/${capture_id}/manifest.json`
  const observed_at = new Date().toISOString()
  const manifest = {
    schema: "browser-render-capture/v2",
    capture_id,
    observed_at,
    original_document: document,
    original_source_version_id: document.source_version_id,
    body_path: `documents/${document.source_id}/${hash}/body.bin`,
    body_sha256: hash,
    ...result,
    html: undefined,
  }
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n")
  const body_path = `documents/${document.source_id}/${hash}/body.bin`
  // Derived bytes use the shared content-addressed contract. Provenance keeps
  // them distinct from an HTTP response; no latest/conditional cache is changed.
  const rendered = {
    ...document,
    source_version_id: `${document.source_id}:${hash}`,
    body_path,
    body_sha256: hash,
    body_bytes: bytes.length,
    observed_at,
    http_status: null,
    fetch_status: "captured",
    mime_type: "text/html; charset=utf-8",
    capture_method: "browser-render",
    rendered_from: document.source_version_id,
    render_id: capture_id,
    capture_provenance: { manifest_path, manifest_sha256: sha256(manifestBytes) },
    resource_failures: result.resource_failures,
  }
  for (const [relative, body] of [
    [body_path, bytes],
    [manifest_path, manifestBytes],
  ]) {
    if (fs.existsSync(safePath(root, relative))) {
      if (!fs.readFileSync(safePath(root, relative)).equals(body))
        throw Error("Stored browser capture changed")
    } else atomicCreate(root, relative, body)
  }
  const recordPath = `documents/${document.source_id}/${hash}/document.json`
  if (!fs.existsSync(safePath(root, recordPath))) atomicCreate(root, recordPath, rendered)
  return rendered
}

// Verify derived body, original bytes and every captured resource before any
// fact review, reuse or portable archive can consume a browser observation.
export function assertRenderedCaptureEvidence(root, document, body) {
  if (!document.rendered_from && document.capture_method !== "browser-render") return []
  const provenance = document.capture_provenance
  if (
    document.capture_method !== "browser-render" ||
    !/^[a-f0-9]{64}$/.test(document.render_id || "") ||
    provenance?.manifest_path !== `renders/${document.render_id}/manifest.json`
  )
    throw Error("Browser capture provenance required")
  const manifestBytes = fs.readFileSync(safePath(root, provenance.manifest_path))
  if (sha256(manifestBytes) !== provenance.manifest_sha256)
    throw Error("Browser capture manifest hash mismatch")
  const manifest = JSON.parse(manifestBytes)
  const original = manifest.original_document
  if (
    manifest.schema !== "browser-render-capture/v2" ||
    manifest.capture_id !== document.render_id ||
    original?.rendered_from ||
    original?.source_id !== document.source_id ||
    original?.original_url !== document.original_url ||
    original?.source_version_id !== document.rendered_from ||
    manifest.original_source_version_id !== document.rendered_from ||
    manifest.body_path !== document.body_path ||
    original?.final_url !== document.final_url ||
    manifest.url !== document.final_url ||
    manifest.observed_at !== document.observed_at ||
    document.http_status !== null ||
    document.mime_type !== "text/html; charset=utf-8" ||
    document.body_bytes !== body.length ||
    JSON.stringify(document.resource_failures) !== JSON.stringify(manifest.resource_failures) ||
    manifest.body_sha256 !== document.body_sha256 ||
    sha256(body) !== manifest.body_sha256 ||
    !Array.isArray(manifest.resources) ||
    sha256(JSON.stringify([document.rendered_from, manifest.body_sha256, manifest.resources])) !==
      document.render_id
  )
    throw Error("Browser capture identity mismatch")
  const paths = [provenance.manifest_path]
  const check = (record) => {
    if (!["captured", "not_modified"].includes(record.fetch_status)) return
    assertURL(record.original_url)
    if (
      record.rendered_from ||
      record.source_id !== sourceId(record.original_url) ||
      !/^[a-f0-9]{64}$/.test(record.body_sha256 || "") ||
      record.source_version_id !== `${record.source_id}:${record.body_sha256}` ||
      record.body_path !== `documents/${record.source_id}/${record.body_sha256}/body.bin` ||
      sha256(fs.readFileSync(safePath(root, record.body_path))) !== record.body_sha256
    )
      throw Error("Browser resource body hash mismatch")
    paths.push(record.body_path)
  }
  if (!["captured", "not_modified"].includes(original.fetch_status))
    throw Error("Browser original must be captured")
  check(original)
  for (const resource of manifest.resources) {
    if (
      resource.url !== resource.document?.original_url ||
      resource.status !== resource.document?.fetch_status ||
      resource.source_version_id !== resource.document?.source_version_id
    )
      throw Error("Browser resource URL mismatch")
    check(resource.document)
  }
  return [...new Set(paths)]
}
