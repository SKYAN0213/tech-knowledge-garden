import fs from "node:fs"
import crypto from "node:crypto"
import { atomicCreate, safePath, readJSON, withGardenOperationLock } from "./run-state.mjs"
import { sha256 } from "./contracts.mjs"
import { loadSameEventSourceAliases } from "./candidate-source-alternative.mjs"
import { mergeBacklog } from "./discovery.mjs"
import { canonicalURL } from "../garden.mjs"
import { verifyStoredPartialCandidates } from "./scan-evidence.mjs"

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

// Standalone collection must use the same reviewed event aliases as daily intake.
export async function intakeCompletedScan({ root, result, backlogFile }) {
  return withGardenOperationLock(root, async () => {
    if (result?.summary?.status !== "window_scanned") return mergeCompletedScan(result, backlogFile)
    const aliases = fs.existsSync(backlogFile)
      ? loadSameEventSourceAliases(root, backlogFile)
      : new Map()
    return mergeCompletedScan(result, backlogFile, undefined, aliases)
  })
}

export function collectedCandidateReceipt(receipt) {
  return (
    receipt.status === "window_scanned" ||
    (receipt.status === "incomplete" && receipt.backlog_merge?.status === "merged_partial")
  )
}

export async function mergePartialScan(
  root,
  result,
  backlogFile,
  merge = mergeBacklog,
  sameEventAliases = new Map(),
) {
  verifyStoredPartialCandidates(root, result, {
    channel_id: result.summary.channel_id,
    ...result.summary.window,
  })
  const suppressed = sameEventAliasSuppressions(result.candidates, sameEventAliases)
  const keys = new Set(suppressed.map((s) => s.candidate_key))
  return {
    status: "merged_partial",
    ...(await merge(
      backlogFile,
      result.candidates.filter((c) => !keys.has(c.key)),
    )),
    same_event_aliases: suppressed,
    window_complete: false,
  }
}

// Explicit CLI intake keeps its own immutable receipt and does not create coverage.
export async function intakePartialScan({ root, result, runId, backlogFile }) {
  if (!/^[A-Za-z0-9_-]+$/.test(runId || "")) throw Error("Valid partial source run required")
  return withGardenOperationLock(root, async () => {
    const files = {
      "list-scan.json": result.summary,
      "candidates.json": result.candidates,
      "documents.json": result.documents,
      "parses.json": result.parses,
    }
    const artifacts = {}
    for (const [name, value] of Object.entries(files)) {
      const relative = `runs/${runId}/${name}`
      if (JSON.stringify(readJSON(root, relative)) !== JSON.stringify(value))
        throw Error("Partial intake differs from its stored source run")
      artifacts[name] = sha256(fs.readFileSync(safePath(root, relative)))
    }
    const aliases = loadSameEventSourceAliases(root, backlogFile)
    const before = sha256(fs.readFileSync(backlogFile))
    const merged = await mergePartialScan(root, result, backlogFile, undefined, aliases)
    const relative = `partial-candidate-intakes/${crypto.randomUUID()}/receipt.json`
    atomicCreate(root, relative, {
      schema: "research-partial-candidate-intake/v1",
      source_run: runId,
      generated_at: new Date().toISOString(),
      channel_id: result.summary.channel_id,
      window: result.summary.window,
      window_status: result.summary.status,
      reason: result.summary.reason,
      source_artifact_sha256: artifacts,
      candidate_keys: result.candidates.map((c) => c.key),
      backlog_before_sha256: before,
      backlog_merge: merged,
      window_complete: false,
      candidate_approved: false,
      candidate_published: false,
      drive_written: false,
      public_verified: false,
    })
    return { ...merged, receipt: relative }
  })
}
