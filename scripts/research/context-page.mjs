import { createHash } from "node:crypto"

export const CONTEXT_PAGE_BYTES = 120_000
const histories = new Set([
  "discovery",
  "source_observation_history",
  "related_source_observations",
  "source_attempts",
  "approval_history",
  "source_revision_resolutions",
])
const sections = {
  pending: ["discovery_window", "pending"],
  resolved: ["discovery_window", "resolved"],
  sources: ["discovery_sources", "channels"],
  companies: ["watchlist", "companies"],
  institutions: ["watchlist", "institutions"],
  "robot-manufacturers": ["watchlist", "robot_manufacturers"],
  "known-sources": ["known_sources"],
  entities: ["known_entities"],
  events: ["recent_classified_events"],
  terms: ["trend_topics"],
  evidence: ["editorial", "article_evidence"],
  deep: ["editorial", "recent_deep"],
}

export const contextHash = (bytes) => createHash("sha256").update(bytes).digest("hex")
const size = (value) => Buffer.byteLength(JSON.stringify(value, null, 2) + "\n")
const rows = (context, section) => {
  if (!Object.hasOwn(sections, section)) throw Error(`Unknown context section: ${section}`)
  const value = sections[section].reduce((v, key) => v?.[key], context)
  if (!Array.isArray(value)) throw Error(`Context section is not an array: ${section}`)
  return value
}

function candidateSummary(candidate) {
  const result = { ...candidate }
  const history = {}
  for (const key of histories) {
    if (!Array.isArray(candidate[key])) continue
    history[key] = { count: candidate[key].length, latest: candidate[key].at(-1) ?? null }
    delete result[key]
  }
  return {
    ...result,
    history_summary: history,
    detail_required_before_approval: true,
    detail_lookup: { candidate: candidate.key },
  }
}

export function buildContextPage(
  context,
  {
    input,
    sha256,
    section = "pending",
    offset = 0,
    limit = 20,
    route,
    candidate,
    maxBytes = CONTEXT_PAGE_BYTES,
  } = {},
) {
  if (!input || !/^[a-f0-9]{64}$/.test(sha256 ?? ""))
    throw Error("Pinned context input and SHA-256 are required")
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw Error("offset must be a nonnegative integer")
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw Error("limit must be between 1 and 100")
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1000) throw Error("Invalid context byte budget")
  if (candidate && (section !== "pending" || route || offset))
    throw Error("Candidate lookup cannot be combined with section, route or offset")
  if (route && section !== "pending")
    throw Error("Route filtering is supported only for pending candidates")
  const pending = rows(context, "pending")
  const counts = {}
  for (const row of pending)
    counts[row.next_route ?? "unassigned"] = (counts[row.next_route ?? "unassigned"] ?? 0) + 1
  if (route && !Object.hasOwn(counts, route)) throw Error(`Unknown pending route: ${route}`)
  const selected = candidate
    ? pending.filter((row) => row.key === candidate)
    : rows(context, section).filter((row) => !route || row.next_route === route)
  if (candidate && selected.length !== 1)
    throw Error(`Candidate lookup must match exactly one pending record: ${candidate}`)
  if (offset > selected.length) throw Error("offset exceeds section size")
  const base = {
    schema_version: "research-context-page/v1",
    snapshot: { input, sha256 },
    latest_cutoff: context.latest_cutoff,
    latest_issue: context.latest_issue,
    research_policy: context.research_policy,
    source_diversity: context.source_diversity,
    discovery_window: {
      publication_after: context.discovery_window.publication_after,
      discovery_start: context.discovery_window.discovery_start,
      discovery_end: context.discovery_window.discovery_end,
      backlog_state: context.discovery_window.backlog_state,
      pending_count: pending.length,
      pending_by_route: counts,
    },
    next_deep_kind: context.editorial?.next_deep_kind,
    available_sections: Object.keys(sections).map((name) => ({
      section: name,
      total: rows(context, name).length,
      json_pointer: "/" + sections[name].join("/"),
    })),
    page: {
      section,
      route: route ?? null,
      candidate: candidate ?? null,
      offset,
      total: selected.length,
    },
  }
  let count = Math.min(limit, selected.length - offset)
  while (true) {
    const items = selected
      .slice(offset, offset + count)
      .map((row) => (section === "pending" && !candidate ? candidateSummary(row) : row))
    const nextOffset = offset + count < selected.length ? offset + count : null
    const output = {
      ...base,
      page: { ...base.page, returned: count, next_offset: nextOffset, items },
    }
    if (size(output) <= maxBytes) return output
    // Pagination advances by returned rows, never by the requested limit.
    if (count <= 1 || candidate)
      throw Error("Context item exceeds byte budget; read the pinned snapshot directly")
    count--
  }
}
