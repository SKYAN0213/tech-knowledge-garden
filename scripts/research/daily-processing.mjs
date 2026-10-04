import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { generateDailyHandoff, selectCandidateSource } from "./editorial-handoff.mjs"
import { saveSourceSelection } from "./source-selection.mjs"
import { processSourceRun } from "./source-processing.mjs"
import { loadProcessedSourceResult } from "./processed-source-result.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"

const validId = (id) => /^[A-Za-z0-9_-]{1,100}$/.test(id || "")
const identityRoutes = new Set([
  "review-existing-identity",
  "review-related-candidate",
  "review-existing-unverified",
  "review-source-revision",
  "verify-original-date",
  "review-publication-time",
])

async function currentHandoff({ root, dailyRunId, vault, backlogFile }) {
  return withLock(root, "daily-acquisition", () => {
    const ref = generateDailyHandoff({ root, runId: dailyRunId, vault, backlogFile })
    return { path: ref.path, value: readJSON(root, ref.path) }
  })
}

// A daily handoff supplies the routing and exact stored source; the common
// processor supplies the model checkpoints and explicit review gates.
// Candidate/event approval and publication remain in their existing paths.
export async function processDailyCandidates({
  root,
  runId,
  dailyRunId,
  candidateKeys,
  policyFile = "data/research-model-policy.json",
  vault = "vault",
  backlogFile = ".local/research/candidate-backlog.json",
  execute = false,
  reviewFiles = {},
  processingRuns = {},
  provider,
  handoffLoader = currentHandoff,
  processor = processSourceRun,
}) {
  if (
    !validId(runId) ||
    !validId(dailyRunId) ||
    runId === dailyRunId ||
    !Array.isArray(candidateKeys) ||
    !candidateKeys.length ||
    candidateKeys.length > 12 ||
    candidateKeys.some((key) => typeof key !== "string" || !key.trim()) ||
    new Set(candidateKeys).size !== candidateKeys.length ||
    !reviewFiles ||
    typeof reviewFiles !== "object" ||
    Array.isArray(reviewFiles) ||
    Object.entries(reviewFiles).some(
      ([key, file]) => !candidateKeys.includes(key) || typeof file !== "string" || !file.trim(),
    ) ||
    !processingRuns ||
    typeof processingRuns !== "object" ||
    Array.isArray(processingRuns) ||
    Object.entries(processingRuns).some(
      ([key, id]) =>
        !candidateKeys.includes(key) ||
        !/^[A-Za-z0-9_-]{1,160}$/.test(id || "") ||
        id === runId ||
        reviewFiles[key],
    )
  )
    throw Error(
      "Daily processing requires distinct run IDs and one to twelve unique candidate keys",
    )
  const policyBytes = fs.readFileSync(policyFile)
  return withLock(root, "daily-processing-" + runId, async () => {
    const handoff = await handoffLoader({ root, dailyRunId, vault, backlogFile })
    if (
      handoff.value?.schema !== "research-editorial-handoff/v1" ||
      handoff.value.daily_run !== dailyRunId
    )
      throw Error("Exact daily editorial handoff required")
    const handoffBytes = fs.readFileSync(safePath(root, handoff.path))
    if (JSON.stringify(JSON.parse(handoffBytes)) !== JSON.stringify(handoff.value))
      throw Error("Daily handoff changed while loading")
    const entries = await Promise.all(
      candidateKeys.map(async (key) => {
        const matches = handoff.value.pending.filter((item) => item.key === key)
        if (matches.length !== 1) throw Error("Candidate is not uniquely pending: " + key)
        const row = matches[0]
        const entry = {
          candidate_key: key,
          next_route: row.next_route,
          review_status: row.review_status || null,
          event_id: row.event_id,
          source_evidence_state: row.source_evidence_state,
          source_version_id: row.article_source_version_id,
          parse_id: row.article_parse_id,
          content_sha256: row.article_content_sha256,
          source_urls: row.source_urls,
        }
        if (processingRuns[key]) {
          const reused = await loadProcessedSourceResult(root, processingRuns[key], entry)
          entry.reuse_run = processingRuns[key]
          entry.reuse_input_sha256 = reused.processing_input_sha256
        }
        return entry
      }),
    )
    const input = {
      schema: "research-daily-processing-input/v1",
      daily_run: dailyRunId,
      candidate_keys: candidateKeys,
      entries,
      policy_sha256: sha256(policyBytes),
      implementation_sha256: sha256(fs.readFileSync(new URL(import.meta.url))),
      reuse_reader_sha256: sha256(
        fs.readFileSync(new URL("./processed-source-result.mjs", import.meta.url)),
      ),
    }
    const base = `runs/${runId}/`
    const previousInput = readJSON(root, base + "daily-processing-input.json")
    if (previousInput && JSON.stringify(previousInput) !== JSON.stringify(input))
      throw Error("Daily processing inputs changed; preserve results and use a new run")
    if (!previousInput) {
      atomicCreate(root, base + "daily-processing-input.json", input)
      atomicCreate(root, base + "daily-handoff-reference.json", {
        path: handoff.path,
        sha256: sha256(handoffBytes),
      })
    }
    const reference = readJSON(root, base + "daily-handoff-reference.json")
    const pinnedBytes = fs.readFileSync(safePath(root, reference.path))
    if (sha256(pinnedBytes) !== reference.sha256) throw Error("Pinned daily handoff changed")
    const pinnedHandoff = JSON.parse(pinnedBytes)
    const previous = readJSON(root, base + "daily-processing.json")
    if (previous && previous.input_sha256 !== sha256(JSON.stringify(input)))
      throw Error("Daily processing receipt differs from its inputs")
    const rows = new Map((previous?.results || []).map((row) => [row.candidate_key, row]))
    const persist = (status) => {
      const results = candidateKeys.map(
        (key) => rows.get(key) || { candidate_key: key, status: "pending" },
      )
      const counts = Object.fromEntries(
        [...new Set(results.map((r) => r.status))].map((s) => [
          s,
          results.filter((r) => r.status === s).length,
        ]),
      )
      const receipt = {
        schema: "research-daily-processing/v1",
        run_id: runId,
        daily_run: dailyRunId,
        input_sha256: sha256(JSON.stringify(input)),
        status,
        total: results.length,
        counts,
        results,
        public_approved: false,
        candidate_published: false,
      }
      atomicWrite(root, base + "daily-processing.json", receipt)
      return { ...receipt, receipt: base + "daily-processing.json" }
    }
    const sourceOwners = new Map()
    for (const entry of entries) {
      const key = entry.candidate_key,
        prior = rows.get(key)
      const row = { candidate_key: key, next_route: entry.next_route }
      if (
        entry.reuse_run &&
        !identityRoutes.has(entry.next_route) &&
        !(
          entry.review_status === "verified" &&
          entry.event_id &&
          !["approved-unpublished", "approved-historical"].includes(entry.next_route)
        )
      ) {
        const sourceKey = JSON.stringify([
          entry.source_version_id,
          entry.parse_id,
          entry.content_sha256,
        ])
        if (sourceOwners.has(sourceKey)) {
          rows.set(key, {
            ...row,
            status: "same_source",
            primary_candidate_key: sourceOwners.get(sourceKey),
          })
          continue
        }
        sourceOwners.set(sourceKey, key)
        const result = await loadProcessedSourceResult(root, entry.reuse_run, entry)
        if (result.processing_input_sha256 !== entry.reuse_input_sha256)
          throw Error("Pinned reused processing input changed")
        const approvedRoute = ["approved-unpublished", "approved-historical"].includes(
          entry.next_route,
        )
        if (approvedRoute && result.status !== "approved")
          throw Error("Approved routing requires the exact completed processing approval")
        rows.set(key, {
          ...row,
          status: approvedRoute ? "approval_ready" : result.status,
          processing_run: entry.reuse_run,
          source_run: result.source_run,
          reused_processing: true,
          result,
        })
        continue
      }
      if (["approved-unpublished", "approved-historical"].includes(entry.next_route)) {
        rows.set(key, { ...row, status: "approval_ready" })
        continue
      }
      if (
        identityRoutes.has(entry.next_route) ||
        (entry.review_status === "verified" && entry.event_id)
      ) {
        rows.set(key, { ...row, status: "identity_review" })
        continue
      }
      if (entry.source_evidence_state !== "exact") {
        rows.set(key, { ...row, status: "source_required" })
        continue
      }
      const sourceKey = JSON.stringify([
        entry.source_version_id,
        entry.parse_id,
        entry.content_sha256,
      ])
      if (sourceOwners.has(sourceKey)) {
        rows.set(key, {
          ...row,
          status: "same_source",
          primary_candidate_key: sourceOwners.get(sourceKey),
        })
        continue
      }
      sourceOwners.set(sourceKey, key)
      const child = `${runId}-${sha256(key).slice(0, 12)}`,
        selectionRun = child + "-source"
      const storedFailure = readJSON(root, base + `failures/${sha256(key)}.json`)
      if (storedFailure) {
        if (
          storedFailure.input_sha256 !== sha256(JSON.stringify(input)) ||
          storedFailure.candidate_key !== key ||
          storedFailure.processing_run !== child ||
          storedFailure.automatic_retry !== false
        )
          throw Error("Daily processing failure receipt changed")
        rows.set(key, storedFailure)
        continue
      }
      if (prior?.status === "failed") throw Error("Daily processing failed state lacks its receipt")
      if (!execute) {
        rows.set(key, {
          ...prior,
          ...row,
          status: prior?.status || "ready",
          processing_run: child,
          source_run: selectionRun,
        })
        continue
      }
      const started = Date.now()
      rows.set(key, { ...row, status: "running", processing_run: child, source_run: selectionRun })
      persist("running")
      try {
        const selected = selectCandidateSource(root, pinnedHandoff, key)
        await saveSourceSelection(root, selectionRun, selected.selected, {
          candidate_key: key,
          candidate_source_version_id: entry.source_version_id,
          candidate_parse_id: entry.parse_id,
          next_route: entry.next_route,
          daily_run: dailyRunId,
          handoff_path: reference.path,
          handoff_sha256: reference.sha256,
        })
        const result = await processor({
          root,
          run: child,
          sourceRun: selectionRun,
          policyFile,
          reviewFile: reviewFiles[key],
          provider,
        })
        rows.set(key, {
          ...row,
          status: result.status,
          processing_run: child,
          source_run: selectionRun,
          elapsed_ms: Date.now() - started,
          result,
        })
      } catch (error) {
        const failure = {
          ...row,
          status: "failed",
          processing_run: child,
          source_run: selectionRun,
          input_sha256: sha256(JSON.stringify(input)),
          elapsed_ms: Date.now() - started,
          error: error instanceof Error ? error.message : String(error),
          automatic_retry: false,
          failed_at: new Date().toISOString(),
        }
        atomicCreate(root, base + `failures/${sha256(key)}.json`, failure)
        rows.set(key, failure)
      }
      persist("running")
    }
    return persist(
      execute
        ? Array.from(rows.values()).some((r) => r.status === "failed")
          ? "partial"
          : "review_pending"
        : "planned",
    )
  })
}
