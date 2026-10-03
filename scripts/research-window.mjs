import fs from "node:fs"
import { approvalSourceChange } from "./article-identity.mjs"

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
export function researchWindow(cutoff, now, backlog, issues, { includeUnverified = false } = {}) {
  const end = Date.parse(now),
    start = Date.parse(cutoff)
  if (!Number.isFinite(end) || !Number.isFinite(start) || start > end)
    throw Error("Invalid research window")
  const firstPublicationDay = new Date(start + 9 * 3600000).toISOString().slice(0, 10)
  const publishedByUrl = new Map(),
    publishedIds = new Map()
  for (const i of issues)
    for (const a of i.items) {
      if (a.review?.review_status === "excluded") continue
      if (!includeUnverified && a.review?.review_status !== "verified") continue
      const entry = { event_id: a.id, edition: i.key, published_at: a.review?.published_at }
      if (!publishedIds.has(a.id)) publishedIds.set(a.id, entry)
      for (const u of a.urls) {
        const url = canonical(u)
        if (!publishedByUrl.has(url)) publishedByUrl.set(url, new Map())
        if (!publishedByUrl.get(url).has(a.id)) publishedByUrl.get(url).set(a.id, entry)
      }
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
    const publication = c.event_id ? publishedIds.get(c.event_id) || null : null
    const urlMatches = c.source_urls.map((u) => publishedByUrl.get(canonical(u)))
    if (
      publication &&
      urlMatches.some((matches) => matches?.size && !matches.has(publication.event_id))
    )
      throw Error("Candidate combines different published events: " + c.key)
    const possible_publications =
      publication || c.review_status === "rejected"
        ? []
        : [
            ...new Map(
              urlMatches
                .flatMap((matches) => [...(matches?.values() || [])])
                .map((entry) => [entry.event_id, entry]),
            ).values(),
          ]
    return {
      ...c,
      publication,
      possible_publications,
      next_route:
        (c.source_revision_alert || approvalSourceChange(c)) && (publication || c.approval)
          ? "review-source-revision"
          : publication
            ? "already-published"
            : c.review_status === "rejected"
              ? "closed"
              : c.review_status === "verified" && c.approval
                ? !c.source_published_at
                  ? "verify-original-date"
                  : c.source_published_at.slice(0, 10) < firstPublicationDay
                    ? "approved-historical"
                    : "approved-unpublished"
                : possible_publications.length
                  ? "review-existing-identity"
                  : !c.source_published_at
                    ? "verify-original-date"
                    : c.source_published_at.slice(0, 10) < firstPublicationDay
                      ? "historical-review"
                      : "review-publication-time",
    }
  })
  const approvedGroups = new Map()
  for (const candidate of candidates) {
    if (
      !["approved-unpublished", "approved-historical"].includes(candidate.next_route) ||
      !candidate.event_id ||
      !candidate.approval?.approved_run ||
      !candidate.approval?.article_sha256
    )
      continue
    const groupKey = [
      candidate.event_id,
      candidate.approval.approved_run,
      candidate.approval.article_sha256,
    ].join("\u0000")
    if (!approvedGroups.has(groupKey)) approvedGroups.set(groupKey, [])
    approvedGroups.get(groupKey).push(candidate)
  }
  const primaryByKey = new Map()
  const relatedByPrimary = new Map()
  for (const group of approvedGroups.values()) {
    if (group.length < 2) continue
    group.sort(
      (a, b) =>
        Number(b.priority === "high") - Number(a.priority === "high") ||
        a.discovered_at.localeCompare(b.discovered_at) ||
        a.key.localeCompare(b.key),
    )
    const [primary, ...related] = group
    relatedByPrimary.set(
      primary.key,
      related.map((candidate) => candidate.key),
    )
    for (const candidate of related) primaryByKey.set(candidate.key, primary.key)
  }
  const routedCandidates = candidates.map((candidate) => {
    const primaryCandidateKey = primaryByKey.get(candidate.key)
    if (primaryCandidateKey)
      return {
        ...candidate,
        next_route: "same-approved-event",
        primary_candidate_key: primaryCandidateKey,
      }
    const relatedCandidateKeys = relatedByPrimary.get(candidate.key)
    return relatedCandidateKeys
      ? { ...candidate, same_approved_event_candidate_keys: relatedCandidateKeys }
      : candidate
  })
  return {
    publication_after: cutoff,
    discovery_start: new Date(Math.min(start, end - 7 * day)).toISOString(),
    discovery_end: new Date(end).toISOString(),
    backlog_state: backlog ? "loaded" : "missing",
    pending: routedCandidates
      .filter((c) => !["already-published", "closed", "same-approved-event"].includes(c.next_route))
      .sort(
        (a, b) =>
          Number(b.priority === "high") - Number(a.priority === "high") ||
          a.discovered_at.localeCompare(b.discovered_at),
      ),
    resolved: routedCandidates.filter((c) =>
      ["already-published", "closed", "same-approved-event"].includes(c.next_route),
    ),
  }
}
