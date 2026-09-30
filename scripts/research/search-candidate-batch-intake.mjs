import { readJSON, atomicWrite, withLock } from "./run-state.mjs"
import { sha256 } from "./contracts.mjs"
import { intakeSearchCandidate } from "./search-candidate-intake.mjs"

function validateManifest(manifest) {
  if (manifest?.schema !== "search-candidate-intake-batch/v1")
    throw Error("Search candidate batch manifest schema is invalid")
  if (!Array.isArray(manifest.candidates) || manifest.candidates.length === 0)
    throw Error("Search candidate batch must contain candidates")
  const keys = new Set()
  for (const item of manifest.candidates) {
    if (!/^[a-zA-Z0-9_-]+$/.test(item?.candidate_key || ""))
      throw Error("Every batch item needs an exact candidate_key")
    if (!/^[a-zA-Z0-9_-]+$/.test(item?.source_run || ""))
      throw Error("Every batch item needs a stored source_run")
    if (keys.has(item.candidate_key)) throw Error("Duplicate candidate_key in batch manifest")
    keys.add(item.candidate_key)
  }
}

// Reuses the single-candidate fail-closed intake contract while persisting each
// outcome, so interruption does not lose completed work and a retry is idempotent.
export async function intakeSearchCandidateBatch({
  root,
  runId,
  searchRunId,
  manifest,
  backlogFile,
}) {
  if (!/^[a-zA-Z0-9_-]+$/.test(runId || "")) throw Error("Valid batch run ID required")
  if (!/^[a-zA-Z0-9_-]+$/.test(searchRunId || "")) throw Error("Valid search run ID required")
  validateManifest(manifest)
  const manifestSha = sha256(JSON.stringify(manifest))
  if (
    runId === searchRunId ||
    manifest.candidates.some((item) => {
      const itemRunId = `${runId}-${sha256(item.candidate_key).slice(0, 12)}`
      return (
        item.source_run === runId ||
        item.source_run === searchRunId ||
        itemRunId === searchRunId ||
        itemRunId === item.source_run
      )
    })
  )
    throw Error("Batch, search and source runs must be distinct")

  return withLock(root, "search-intake-batch-" + runId, async () => {
    const receiptPath = `runs/${runId}/search-candidate-intake-batch.json`
    const previous = readJSON(root, receiptPath)
    if (previous && previous.manifest_sha256 !== manifestSha)
      throw Error("Batch manifest changed; use a new run ID")
    const results = new Map(
      (previous?.results || []).map((result) => [result.candidate_key, result]),
    )
    for (const item of manifest.candidates) {
      const itemRunId = `${runId}-${sha256(item.candidate_key).slice(0, 12)}`
      try {
        const result = await intakeSearchCandidate({
          root,
          runId: itemRunId,
          searchRunId,
          sourceRunId: item.source_run,
          candidateKey: item.candidate_key,
          backlogFile,
        })
        results.set(item.candidate_key, {
          candidate_key: item.candidate_key,
          source_run: item.source_run,
          status: result.status,
          backlog_changed: result.backlog_changed,
          candidate_published: false,
        })
      } catch (error) {
        results.set(item.candidate_key, {
          candidate_key: item.candidate_key,
          source_run: item.source_run,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          candidate_published: false,
        })
      }
      const ordered = manifest.candidates.map((candidate) => results.get(candidate.candidate_key))
      const failed = ordered.filter((result) => result?.status === "failed").length
      const sourceVerified = ordered.filter(
        (result) => result?.status === "source_verified_unreviewed",
      ).length
      const dateMissing = ordered.filter(
        (result) => result?.status === "source_date_missing",
      ).length
      atomicWrite(root, receiptPath, {
        schema: "research-search-candidate-intake-batch/v1",
        run_id: runId,
        search_run: searchRunId,
        manifest_sha256: manifestSha,
        status: failed ? "partial" : "complete",
        processed: ordered.filter(Boolean).length,
        total: manifest.candidates.length,
        failed,
        source_verified_unreviewed: sourceVerified,
        source_date_missing: dateMissing,
        candidate_published: false,
        results: ordered,
      })
    }
    const receipt = readJSON(root, receiptPath)
    return {
      status: receipt.status,
      processed: receipt.processed,
      total: receipt.total,
      failed: receipt.failed,
      source_verified_unreviewed: receipt.source_verified_unreviewed,
      source_date_missing: receipt.source_date_missing,
      candidate_published: false,
      receipt: receiptPath,
    }
  })
}
