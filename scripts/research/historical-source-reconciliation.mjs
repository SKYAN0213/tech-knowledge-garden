import fs from "node:fs"
import path from "node:path"
import { canonicalURL } from "../garden.mjs"
import { articleContentFingerprint, loadStoredSourceRun } from "./parser.mjs"
import { safePath } from "./run-state.mjs"
import { sha256, sourceId } from "./contracts.mjs"

const canonicalSources = (values) => {
  const urls = new Set()
  for (const value of Array.isArray(values) ? values : []) {
    try {
      urls.add(canonicalURL(value))
    } catch {
      // Invalid URLs cannot provide exact-source evidence.
    }
  }
  return urls
}

const parserRecord = (parse) => ({
  parse_id: parse.parse_id,
  status: parse.status,
  article_content_sha256: (() => {
    try {
      return articleContentFingerprint(parse)
    } catch {
      return null
    }
  })(),
  parser: parse.parser
    ? {
        id: parse.parser.id || null,
        version: parse.parser.version || null,
        config_hash: parse.parser.config_hash || null,
        adapter_sha256: parse.parser.adapter_sha256 || null,
      }
    : null,
})

function compareCandidateVersion(candidate, sourceVersionId, parse) {
  const contentSha = parserRecord(parse).article_content_sha256
  if (!candidate.article_source_version_id || !candidate.article_content_sha256 || !contentSha)
    return "candidate_content_unavailable"
  const sameVersion = sourceVersionId === candidate.article_source_version_id
  const sameContent = contentSha === candidate.article_content_sha256
  const sameParse = parse.parse_id === candidate.article_parse_id
  if (sameVersion && sameParse && sameContent) return "same_source_version_parse_and_content"
  if (sameVersion && sameContent) return "same_source_version_different_parse_same_content"
  if (sameVersion) return "same_source_version_content_differs"
  if (sameContent) return "prior_source_version_same_content"
  return "prior_source_version_different_content"
}

function runIndex(root) {
  const directory = safePath(root, "runs")
  if (!fs.existsSync(directory)) throw Error("Stored source runs directory is required")
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[a-zA-Z0-9_-]+$/.test(entry.name))
    .map((entry) => {
      const runId = entry.name
      const documentsPath = `runs/${runId}/documents.json`
      const parsesPath = `runs/${runId}/parses.json`
      const documentsFile = safePath(root, documentsPath)
      const parsesFile = safePath(root, parsesPath)
      if (!fs.existsSync(documentsFile)) return null
      const documentsBytes = fs.readFileSync(documentsFile)
      const parsesBytes = fs.existsSync(parsesFile) ? fs.readFileSync(parsesFile) : null
      const statePath = safePath(root, `runs/${runId}/state.json`)
      let hasFetchStage = null
      if (fs.existsSync(statePath)) {
        try {
          const state = JSON.parse(fs.readFileSync(statePath, "utf8"))
          hasFetchStage = Object.keys(state.stages || {}).some((key) => key.startsWith("fetch-"))
        } catch {
          hasFetchStage = null
        }
      }
      let documents
      try {
        documents = JSON.parse(documentsBytes.toString("utf8"))
      } catch {
        return {
          run_id: runId,
          documents_path: documentsPath,
          documents_sha256: sha256(documentsBytes),
          parses_sha256: parsesBytes ? sha256(parsesBytes) : null,
          documents: null,
          missing_parses: !parsesBytes,
          has_fetch_stage: hasFetchStage,
        }
      }
      return {
        run_id: runId,
        documents_path: documentsPath,
        documents_sha256: sha256(documentsBytes),
        parses_sha256: parsesBytes ? sha256(parsesBytes) : null,
        documents,
        missing_parses: !parsesBytes,
        has_fetch_stage: hasFetchStage,
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.run_id.localeCompare(right.run_id))
}

export function buildHistoricalSourceReconciliation({
  root,
  handoff,
  handoffSha256,
  reconciliation,
  reconciliationSha256,
  reviewBatch,
  reviewBatchSha256,
  reconcilerSha256,
  generatedAt = new Date().toISOString(),
}) {
  if (
    handoff?.schema !== "research-editorial-handoff/v1" ||
    reconciliation?.schema !== "research-drive-approval-reconciliation/v1" ||
    reviewBatch?.schema !== "research-candidate-source-evidence-review/v1" ||
    handoff.daily_run !== reconciliation.daily_run ||
    handoff.daily_run !== reviewBatch.daily_run ||
    handoffSha256 !== reconciliation.inputs?.handoff_sha256 ||
    reviewBatch.inputs?.handoff_sha256 !== handoffSha256 ||
    reviewBatch.inputs?.reconciliation_sha256 !== reconciliationSha256 ||
    !/^[a-f0-9]{64}$/.test(reconciliationSha256 || "") ||
    !/^[a-f0-9]{64}$/.test(reviewBatchSha256 || "") ||
    !/^[a-f0-9]{64}$/.test(reconcilerSha256 || "") ||
    reconciliation.candidate_published !== false ||
    reconciliation.drive_written !== false ||
    reconciliation.public_verified !== false ||
    reviewBatch.candidate_approved !== false ||
    reviewBatch.candidate_published !== false ||
    reviewBatch.drive_written !== false ||
    reviewBatch.public_verified !== false
  )
    throw Error("Pinned handoff, reconciliation, and source-evidence batch required")

  const handoffCandidates = new Map(
    [...handoff.pending, ...handoff.observed_resolved].map((candidate) => [
      candidate.key,
      candidate,
    ]),
  )
  const reviewedCandidates = new Map(
    (reviewBatch.candidates || []).map((candidate) => [candidate.candidate_key, candidate]),
  )
  if (reviewedCandidates.size !== reviewBatch.candidate_count)
    throw Error("Source-evidence candidate keys must be unique")

  const sourceRuns = runIndex(root)
  const runIndexSha256 = sha256(
    JSON.stringify(
      sourceRuns.map(
        ({ run_id, documents_sha256, parses_sha256, missing_parses, has_fetch_stage }) => ({
          run_id,
          documents_sha256,
          parses_sha256,
          missing_parses,
          has_fetch_stage,
        }),
      ),
    ),
  )
  const loadedRuns = new Map()
  const validationFailures = []
  const candidates = [...reviewedCandidates.values()].map((reviewed) => {
    const candidate = handoffCandidates.get(reviewed.candidate_key)
    const sourceURLs = canonicalSources(candidate?.source_urls)
    const alternateSourceURLs = canonicalSources(
      (candidate?.alternate_sources || []).map((source) => source.url),
    )
    const evidenceURLs = new Set([...sourceURLs, ...alternateSourceURLs])
    if (
      !candidate ||
      !sourceURLs.size ||
      JSON.stringify([...canonicalSources(reviewed.source_urls)].sort()) !==
        JSON.stringify([...sourceURLs].sort())
    )
      throw Error("Historical candidate identity does not match the pinned handoff")

    const sources = new Map()
    const attempts = new Map()
    for (const indexedRun of sourceRuns) {
      if (
        !Array.isArray(indexedRun.documents) ||
        !indexedRun.documents.some((document) => {
          try {
            return evidenceURLs.has(canonicalURL(document.original_url))
          } catch {
            return false
          }
        })
      )
        continue

      let stored
      try {
        stored = loadedRuns.get(indexedRun.run_id)
        if (!stored) {
          stored = loadStoredSourceRun(root, indexedRun.run_id, { allowUnacquired: true })
          loadedRuns.set(indexedRun.run_id, stored)
        }
      } catch (error) {
        validationFailures.push({
          run_id: indexedRun.run_id,
          error: String(error?.message || error),
        })
        continue
      }

      for (const [documentIndex, document] of stored.documents.entries()) {
        let sourceUrl
        try {
          sourceUrl = canonicalURL(document.original_url)
        } catch {
          continue
        }
        if (!evidenceURLs.has(sourceUrl)) continue
        const acquired = ["captured", "not_modified"].includes(document.fetch_status)
        if (!acquired || typeof document.source_version_id !== "string") {
          // Reparse runs inherit blocked documents from their source run. They
          // are not new network attempts and must not inflate source coverage.
          if (indexedRun.has_fetch_stage === false) continue
          const attemptKey = `${indexedRun.run_id}:${documentIndex}:${sourceUrl}:${document.fetch_status}`
          attempts.set(attemptKey, {
            original_url: sourceUrl,
            fetch_status: document.fetch_status || "unknown",
            run_id: indexedRun.run_id,
            document_index: documentIndex,
          })
          continue
        }
        let verifiedBody = false
        try {
          verifiedBody =
            document.source_id === sourceId(document.original_url) &&
            /^[a-f0-9]{64}$/.test(document.body_sha256 || "") &&
            document.source_version_id === `${document.source_id}:${document.body_sha256}` &&
            sha256(fs.readFileSync(safePath(root, document.body_path))) === document.body_sha256
        } catch {
          verifiedBody = false
        }
        if (!verifiedBody) {
          validationFailures.push({
            run_id: indexedRun.run_id,
            error: "Matched captured source identity or original body bytes did not verify",
          })
          attempts.set(
            `${indexedRun.run_id}:${documentIndex}:${sourceUrl}:invalid_source_version`,
            {
              original_url: sourceUrl,
              fetch_status: "invalid_source_version",
              run_id: indexedRun.run_id,
              document_index: documentIndex,
            },
          )
          continue
        }
        const sourceKey = document.source_version_id
        let source = sources.get(sourceKey)
        if (!source) {
          source = {
            original_url: sourceUrl,
            source_version_id: document.source_version_id,
            body_sha256: document.body_sha256,
            fetch_statuses: [],
            observed_run_ids: [],
            parses: new Map(),
          }
          sources.set(sourceKey, source)
        }
        source.fetch_statuses.push(document.fetch_status)
        source.observed_run_ids.push(indexedRun.run_id)
        const parses = stored.parses.filter(
          (parse) => parse.source_version_id === document.source_version_id,
        )
        for (const parse of parses) {
          const parseKey = parse.parse_id
          const record = {
            ...parserRecord(parse),
            comparison_to_candidate: compareCandidateVersion(candidate, sourceKey, parse),
            observed_run_ids: [],
          }
          const existing = source.parses.get(parseKey) || record
          existing.observed_run_ids.push(indexedRun.run_id)
          source.parses.set(parseKey, existing)
        }
      }
    }

    const history = [...sources.values()]
      .map((source) => ({
        ...source,
        fetch_statuses: [...new Set(source.fetch_statuses)].sort(),
        observed_run_ids: [...new Set(source.observed_run_ids)].sort(),
        parses: [...source.parses.values()].map((parse) => ({
          ...parse,
          observed_run_ids: [...new Set(parse.observed_run_ids)].sort(),
        })),
      }))
      .sort((left, right) => left.source_version_id.localeCompare(right.source_version_id))
    const unacquiredAttempts = [...attempts.values()].sort((left, right) =>
      `${left.original_url}:${left.run_id}`.localeCompare(`${right.original_url}:${right.run_id}`),
    )
    const parseCount = history.reduce((total, source) => total + source.parses.length, 0)
    return {
      candidate_key: candidate.key,
      source_urls: [...sourceURLs].sort(),
      alternate_source_urls: [...alternateSourceURLs].sort(),
      current_candidate_content_available: Boolean(candidate.article_content_sha256),
      historical_source_version_count: history.length,
      historical_parse_count: parseCount,
      exact_url_attempt_count: unacquiredAttempts.length,
      exact_url_attempts: unacquiredAttempts,
      status: parseCount
        ? "historical_source_and_parse_found"
        : history.length
          ? "historical_source_without_parse"
          : unacquiredAttempts.length
            ? "exact_url_attempt_without_captured_source"
            : "no_exact_url_in_stored_runs",
      historical_sources: history,
    }
  })

  const statusCounts = Object.fromEntries(
    [...new Set(candidates.map((candidate) => candidate.status))]
      .sort()
      .map((status) => [
        status,
        candidates.filter((candidate) => candidate.status === status).length,
      ]),
  )
  const comparisonCounts = Object.fromEntries(
    [
      ...new Set(
        candidates.flatMap((candidate) =>
          candidate.historical_sources.flatMap((source) =>
            source.parses.map((parse) => parse.comparison_to_candidate),
          ),
        ),
      ),
    ]
      .sort()
      .map((status) => [
        status,
        candidates.reduce(
          (total, candidate) =>
            total +
            candidate.historical_sources.reduce(
              (count, source) =>
                count +
                source.parses.filter((parse) => parse.comparison_to_candidate === status).length,
              0,
            ),
          0,
        ),
      ]),
  )
  const inputs = {
    handoff_sha256: handoffSha256,
    reconciliation_sha256: reconciliationSha256,
    review_batch_sha256: reviewBatchSha256,
    source_run_index_sha256: runIndexSha256,
    reconciler_sha256: reconcilerSha256,
  }
  return {
    schema: "research-historical-source-reconciliation/v1",
    generated_at: generatedAt,
    daily_run: handoff.daily_run,
    candidate_count: candidates.length,
    candidates_with_historical_sources: candidates.filter(
      (candidate) => candidate.historical_source_version_count > 0,
    ).length,
    historical_source_version_count: candidates.reduce(
      (total, candidate) => total + candidate.historical_source_version_count,
      0,
    ),
    historical_parse_count: candidates.reduce(
      (total, candidate) => total + candidate.historical_parse_count,
      0,
    ),
    exact_url_attempt_count: candidates.reduce(
      (total, candidate) => total + candidate.exact_url_attempt_count,
      0,
    ),
    candidate_status_counts: statusCounts,
    comparison_counts: comparisonCounts,
    run_validation_failure_count: validationFailures.length,
    run_validation_failures: validationFailures,
    candidates,
    inputs,
    candidate_approved: false,
    candidate_published: false,
    drive_written: false,
    public_verified: false,
  }
}
