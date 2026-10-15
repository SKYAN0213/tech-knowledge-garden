import fs from "node:fs"
import { safePath } from "./run-state.mjs"
import { sha256 } from "./contracts.mjs"

export const ROBOTS_MAX_AGE_MS = 24 * 60 * 60 * 1000
export function policyNow(fetcher) {
  const now = fetcher.options?.policy_now?.() ?? Date.now()
  if (!Number.isSafeInteger(now) || now < 0) throw Error("Invalid policy clock")
  return now
}

export function robotsPolicy(text, userAgent, url) {
  const groups = []
  let current = { agents: [], rules: [], delay: 0 },
    hasRule = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim(),
      n = line.indexOf(":")
    if (n < 0) continue
    const field = line.slice(0, n).trim().toLowerCase(),
      value = line.slice(n + 1).trim()
    if (field === "user-agent") {
      if (hasRule) {
        groups.push(current)
        current = { agents: [], rules: [], delay: 0 }
        hasRule = false
      }
      current.agents.push(value.toLowerCase())
    } else if (current.agents.length && ["allow", "disallow"].includes(field)) {
      hasRule = true
      if (value) current.rules.push({ allow: field === "allow", value })
    } else if (field === "crawl-delay" && current.agents.length) {
      hasRule = true
      current.delay = Number(value) || 0
    }
  }
  groups.push(current)
  const ua = userAgent.toLowerCase(),
    ranked = groups.map((g) => ({
      ...g,
      rank: Math.max(-1, ...g.agents.map((a) => (a === "*" ? 0 : ua.includes(a) ? a.length : -1))),
    }))
  const rank = Math.max(-1, ...ranked.map((g) => g.rank)),
    matching = ranked.filter((g) => g.rank === rank && rank >= 0)
  const u = new URL(url),
    target = u.pathname + u.search
  const rules = matching
    .flatMap((g) => g.rules)
    .filter((r) => {
      const anchor = r.value.endsWith("$")
      const value = anchor ? r.value.slice(0, -1) : r.value
      const pattern = value
        .split("*")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*")
      return new RegExp("^" + pattern + (anchor ? "$" : "")).test(target)
    })
    .sort(
      (a, b) =>
        b.value.replace(/[*$]/g, "").length - a.value.replace(/[*$]/g, "").length ||
        Number(b.allow) - Number(a.allow),
    )
  return {
    allowed: rules[0]?.allow ?? true,
    delay_ms: Math.min(60000, Math.max(0, ...matching.map((g) => g.delay * 1000))),
    matched_rule: rules[0] || null,
  }
}
export async function checkRobots(root, fetcher, url, { allowed_hosts } = {}) {
  const origin = new URL(url).origin
  const hosts = allowed_hosts || [new URL(url).hostname]
  const now = policyNow(fetcher)
  const ttl = fetcher.options?.robots_cache_ttl_ms ?? ROBOTS_MAX_AGE_MS
  if (!Number.isSafeInteger(ttl) || ttl < 0 || ttl > ROBOTS_MAX_AGE_MS)
    throw Error("Robots cache lifetime must be within 24 hours")
  fetcher.robotsCache ||= new Map()
  fetcher.robotsCacheTimes ||= new Map()
  if (now - (fetcher.robotsCacheTimes.get(origin) ?? -Infinity) >= ttl)
    fetcher.robotsCache.delete(origin)
  if (!fetcher.robotsCache.has(origin)) {
    fetcher.robotsCacheTimes.set(origin, now)
    fetcher.robotsCache.set(
      origin,
      (async () => {
        const record = await fetcher.fetch(origin + "/robots.txt", { allowed_hosts: hosts })
        if (record.fetch_status === "not_found") return { text: "", record }
        if (["captured", "not_modified"].includes(record.fetch_status)) {
          const body = fs.readFileSync(safePath(root, record.body_path))
          if (body.length > 512 * 1024) throw Error("Robots policy is too large")
          if (sha256(body) !== record.body_sha256) throw Error("Robots policy hash mismatch")
          if (/<(?:!doctype\s+html|html)\b/i.test(body.toString("utf8")))
            throw Error("Robots response is an HTML page")
          return { text: body.toString("utf8"), record }
        }
        const error = Error(
          "Robots policy could not be checked: " +
            record.fetch_status +
            (record.http_status ? ` (HTTP ${record.http_status})` : ""),
        )
        error.fetch_status = record.fetch_status
        error.policy_document = {
          url: record.original_url,
          final_url: record.final_url || null,
          observed_at: record.observed_at,
          fetch_status: record.fetch_status,
          http_status: record.http_status || null,
          error: record.error || null,
          retry_after: record.retry_after || null,
          error_code: record.error_code || null,
          request_performed: record.request_performed ?? true,
        }
        throw error
      })(),
    )
  }
  const { text, record } = await fetcher.robotsCache.get(origin)
  return {
    ...robotsPolicy(text, fetcher.options.user_agent || "TechKnowledgeGarden/1.0", url),
    policy_source_id: record.source_id || null,
    policy_source_version_id: record.source_version_id || null,
    policy_observed_at: record.observed_at || null,
    policy_fetch_status: record.fetch_status,
    policy_document: record,
  }
}
