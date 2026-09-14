import fs from "node:fs"

export const BACKLOG_PATH = ".local/research/candidate-backlog.json"
const day = 86400000
const canonical = (raw) => {
  const u = new URL(raw)
  if (!["http:", "https:"].includes(u.protocol)) throw Error("Invalid candidate source")
  u.hash = ""
  for (const k of [...u.searchParams.keys()])
    if (/^(utm_|fbclid|gclid)/.test(k)) u.searchParams.delete(k)
  u.searchParams.sort()
  return u.toString().replace(/\/$/, "")
}
export function readBacklog(file = BACKLOG_PATH) {
  if (!fs.existsSync(file)) return null
  const data = JSON.parse(fs.readFileSync(file, "utf8"))
  if (data.schema !== "research-candidates/v1" || !Array.isArray(data.candidates))
    throw Error("Invalid research candidate backlog")
  return data
}

// Discovery overlaps prior runs. Seen URLs and downloaded pages are not publication evidence.
export function researchWindow(cutoff, now, backlog, issues) {
  const end = Date.parse(now),
    start = Date.parse(cutoff)
  if (!Number.isFinite(end) || !Number.isFinite(start) || start > end)
    throw Error("Invalid research window")
  const published = new Map(),
    publishedIds = new Map()
  for (const i of issues)
    for (const a of i.items) {
      if (a.review?.review_status === "excluded") continue
      const entry = { event_id: a.id, edition: i.key, published_at: a.review?.published_at }
      if (!publishedIds.has(a.id)) publishedIds.set(a.id, entry)
      for (const u of a.urls) if (!published.has(canonical(u))) published.set(canonical(u), entry)
    }
  const keys = new Set()
  const candidates = (backlog?.candidates || []).map((c) => {
    if (
      !c.key ||
      keys.has(c.key) ||
      !c.title ||
      !Array.isArray(c.source_urls) ||
      !c.source_urls.length
    )
      throw Error("Candidate identity and sources required")
    keys.add(c.key)
    if (
      !["unreviewed", "verified", "deferred", "rejected"].includes(c.review_status) ||
      !Number.isFinite(Date.parse(c.discovered_at)) ||
      !["high", "normal"].includes(c.priority)
    )
      throw Error("Candidate review metadata required: " + c.key)
    if (["deferred", "rejected"].includes(c.review_status) && !c.reason?.trim())
      throw Error("Candidate disposition needs a private reason: " + c.key)
    const matches = [
      publishedIds.get(c.event_id),
      ...c.source_urls.map((u) => published.get(canonical(u))),
    ].filter(Boolean)
    if (new Set(matches.map((m) => m.event_id)).size > 1)
      throw Error("Candidate combines different published events: " + c.key)
    const publication = matches[0] || null
    return {
      ...c,
      publication,
      next_route: publication
        ? "already-published"
        : c.review_status === "rejected"
          ? "closed"
          : !c.source_published_at
            ? "verify-original-date"
            : c.source_published_at.slice(0, 10) <
                new Date(start + 9 * 3600000).toISOString().slice(0, 10)
              ? "historical-review"
              : "review-publication-time",
    }
  })
  return {
    publication_after: cutoff,
    discovery_start: new Date(Math.min(start, end - 7 * day)).toISOString(),
    discovery_end: new Date(end).toISOString(),
    backlog_state: backlog ? "loaded" : "missing",
    pending: candidates
      .filter((c) => !c.publication && c.review_status !== "rejected")
      .sort(
        (a, b) =>
          Number(b.priority === "high") - Number(a.priority === "high") ||
          a.discovered_at.localeCompare(b.discovered_at),
      ),
    resolved: candidates.filter((c) => c.publication || c.review_status === "rejected"),
  }
}
