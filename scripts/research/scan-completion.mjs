import { mergeBacklog } from "./discovery.mjs"
import { canonicalURL } from "../garden.mjs"

export function sameEventAliasSuppressions(candidates, sameEventAliases = new Map()) {
  const suppressed = []
  for (const candidate of candidates) {
    const matches = [
      ...new Map(
        (candidate.source_urls || [])
          .map((url) => sameEventAliases.get(canonicalURL(url)))
          .filter(Boolean)
          .map((alias) => [alias.candidate_key, alias]),
      ).values(),
    ]
    if (matches.length > 1)
      throw Error(`Candidate source maps to multiple same-event targets: ${candidate.key}`)
    if (matches.length === 1 && matches[0].candidate_key !== candidate.key) {
      suppressed.push({
        candidate_key: candidate.key,
        candidate_url: (candidate.source_urls || []).find((url) =>
          sameEventAliases.has(canonicalURL(url)),
        ),
        target_candidate_key: matches[0].candidate_key,
        resolution_run: matches[0].resolution_run,
      })
    }
  }
  return suppressed
}

export async function mergeCompletedScan(
  result,
  backlogFile,
  merge = mergeBacklog,
  sameEventAliases = new Map(),
) {
  if (!result?.summary || !Array.isArray(result.candidates))
    throw Error("Stored list scan summary and candidates required")
  if (result.summary.status !== "window_scanned")
    return { status: "skipped", reason: result.summary.reason || "window_incomplete" }
  const suppressedSameEventSources = sameEventAliasSuppressions(result.candidates, sameEventAliases)
  const suppressedKeys = new Set(suppressedSameEventSources.map((item) => item.candidate_key))
  const candidates = result.candidates.filter((candidate) => !suppressedKeys.has(candidate.key))
  return {
    status: "merged",
    ...(await merge(backlogFile, candidates)),
    same_event_aliases: suppressedSameEventSources,
  }
}
