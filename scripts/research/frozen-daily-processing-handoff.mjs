import fs from "node:fs"
import { readBacklog } from "../research-window.mjs"
import { sha256 } from "./contracts.mjs"
import { safePath } from "./run-state.mjs"
import { loadShadowHandoffBasis } from "./shadow-collection-basis.mjs"

// Only reuse an explicitly pinned collection for private fact extraction.
// Current candidate identity and source must still match; the existing source
// selector verifies raw bytes and parses before the processor can call a model.
export function loadFrozenDailyProcessingHandoff(
  root,
  { dailyRunId, collectionBasis, candidateKeys, backlogFile },
  basisLoader = loadShadowHandoffBasis,
) {
  const basisBytes = fs.readFileSync(safePath(root, collectionBasis))
  const reference = { path: collectionBasis, sha256: sha256(basisBytes) }
  const basis = basisLoader(root, reference)
  if (basis.daily_run !== dailyRunId) throw Error("Frozen handoff belongs to another daily run")
  const bytes = fs.readFileSync(safePath(root, basis.handoff.path))
  if (sha256(bytes) !== basis.handoff.sha256) throw Error("Frozen daily handoff changed")
  const value = JSON.parse(bytes)
  if (
    value.schema !== "research-editorial-handoff/v1" ||
    value.daily_run !== dailyRunId ||
    !Array.isArray(value.pending)
  )
    throw Error("Exact frozen daily handoff required")
  const backlog = readBacklog(backlogFile)
  const fields = [
    "key",
    "title",
    "review_status",
    "event_id",
    "source_published_at",
    "source_urls",
    "article_source_version_id",
    "article_parse_id",
    "article_content_sha256",
  ]
  for (const key of candidateKeys) {
    const old = value.pending.filter((row) => row.key === key)
    const current = backlog?.candidates.filter((row) => row.key === key)
    const row = old[0],
      candidate = current?.[0]
    if (
      old.length !== 1 ||
      current?.length !== 1 ||
      row.review_status !== "unreviewed" ||
      row.event_id ||
      row.source_evidence_state !== "exact" ||
      !["historical-review", "review-publication-time"].includes(row.next_route) ||
      fields.some(
        (field) => JSON.stringify(row[field] ?? null) !== JSON.stringify(candidate[field] ?? null),
      )
    )
      throw Error("Frozen fact candidate changed or requires identity review: " + key)
  }
  return { path: basis.handoff.path, value, collection_basis: reference }
}
