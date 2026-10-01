import fs from "node:fs"
import path from "node:path"
import { registry } from "./discovery.mjs"
import {
  dailyRetryQueue,
  dailySources,
  storedListScan,
  verifyStoredListScan,
} from "./daily-scan.mjs"
import { DEFAULT_DAILY_RETRY_POLICY, kstDay } from "./daily-plan.mjs"
import { auditRuns } from "../research-audit.mjs"
import { sha256, sourceId } from "./contracts.mjs"
import { canonicalURL, editions, extractArticles } from "../garden.mjs"
import { titleDayKey } from "../article-identity.mjs"
import { projectIntakeOntology, summarizeIntakeOntology } from "./intake-ontology.mjs"
import { auditEvaluationCases } from "./evaluation.mjs"
import { articleContentFingerprint } from "./parser.mjs"

const readJSON = (file) => JSON.parse(fs.readFileSync(file, "utf8"))
const safeCanonical = (url) => {
  try {
    return canonicalURL(url)
  } catch {
    return null
  }
}
const filesUnder = (root, suffix) => {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name)
    return entry.isDirectory() ? filesUnder(file, suffix) : file.endsWith(suffix) ? [file] : []
  })
}
const counter = (values) =>
  Object.fromEntries(
    [...new Set(values)].sort().map((value) => [value, values.filter((x) => x === value).length]),
  )

export function loadSupplementalCoverageEvidence(root, activeRoutes = []) {
  const routeIds = new Set(activeRoutes.map((route) => route.channel_id))
  const coverageFile = path.join(root, "daily/route-coverage.json")
  const coverage = fs.existsSync(coverageFile) ? readJSON(coverageFile) : null
  const files = filesUnder(path.join(root, "daily/reconciliations"), ".json")
  const entries = []
  let invalid_receipt_count = 0
  for (const file of files) {
    try {
      const bytes = fs.readFileSync(file)
      const receipt = JSON.parse(bytes.toString("utf8"))
      if (
        receipt?.schema !== "research-supplemental-coverage/v1" ||
        !/^[a-zA-Z0-9_-]+$/.test(receipt.reconciliation_run || "") ||
        !/^[a-zA-Z0-9_-]+$/.test(receipt.scan_run || "") ||
        !routeIds.has(receipt.channel_id) ||
        !Number.isFinite(Date.parse(receipt.reconciled_at || "")) ||
        !Array.isArray(receipt.candidate_keys) ||
        receipt.candidate_published !== false ||
        receipt.backlog_merge?.status !== "merged"
      )
        throw Error("invalid supplemental receipt")
      const scan = storedListScan(root, receipt.scan_run)
      const window = scan.summary.window
      const coverageUntil = [window?.until_exclusive || "", kstDay(receipt.reconciled_at)].sort()[0]
      verifyStoredListScan(root, scan, { channel_id: receipt.channel_id, ...window })
      const state = coverage?.routes?.[receipt.channel_id]
      const hasCoverage = state?.covered?.some(
        (span) =>
          span.kind === "verified_supplemental_scan" &&
          span.reconciliation_run === receipt.reconciliation_run &&
          span.source_run === receipt.scan_run &&
          span.since === receipt.since &&
          span.until_exclusive === receipt.coverage_until,
      )
      if (
        scan.summary.status !== "window_scanned" ||
        receipt.since !== window.since ||
        receipt.scan_until_exclusive !== window.until_exclusive ||
        receipt.coverage_until !== coverageUntil ||
        JSON.stringify(receipt.candidate_keys) !==
          JSON.stringify(scan.candidates.map((candidate) => candidate.key)) ||
        !hasCoverage
      )
        throw Error("supplemental receipt does not match verified coverage")
      entries.push({
        reconciliation_run: receipt.reconciliation_run,
        scan_run: receipt.scan_run,
        channel_id: receipt.channel_id,
        since: receipt.since,
        scan_until_exclusive: receipt.scan_until_exclusive,
        coverage_until: receipt.coverage_until,
        candidate_count: receipt.candidate_keys.length,
        receipt_sha256: sha256(bytes),
        reconciled_at: receipt.reconciled_at,
        candidate_published: false,
      })
    } catch {
      invalid_receipt_count += 1
    }
  }
  const candidateKeys = new Set()
  for (const file of files) {
    try {
      const receipt = readJSON(file)
      if (entries.some((entry) => entry.reconciliation_run === receipt.reconciliation_run))
        receipt.candidate_keys.forEach((key) => candidateKeys.add(key))
    } catch {
      // Invalid receipts are counted above and do not enter any successful totals.
    }
  }
  return {
    status: !files.length
      ? "no_receipts"
      : invalid_receipt_count
        ? "partial_or_invalid"
        : "verified",
    receipt_count: entries.length,
    invalid_receipt_count,
    candidate_count: entries.reduce((total, entry) => total + entry.candidate_count, 0),
    unique_candidate_count: candidateKeys.size,
    entries: entries.sort((a, b) => a.reconciled_at.localeCompare(b.reconciled_at)),
    candidate_published: false,
  }
}

export function loadDailyModelTiming(root, dailyRunId) {
  if (!/^[a-zA-Z0-9_-]+$/.test(dailyRunId || ""))
    throw Error("Valid daily run ID required for model timing")
  const runsRoot = path.join(root, "runs")
  const aggregate = {
    daily_run: dailyRunId,
    status: "no_linked_model_runs",
    linked_selection_runs: 0,
    measured_runs: 0,
    unmeasured_runs: 0,
    invalid_receipts: 0,
    attempts: { complete: 0, failed: 0, running: 0 },
    model_wall_ms: 0,
    reserved_running_ms: 0,
    local_phase_timing: emptyLocalPhaseTiming(),
    by_role: {},
    by_provider: {},
  }
  if (!fs.existsSync(runsRoot)) return aggregate
  const runDirectories = fs
    .readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[a-zA-Z0-9_-]+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
  const selections = []
  for (const runId of runDirectories) {
    const runDirectory = path.join(runsRoot, runId)
    const selectionFile = path.join(runDirectory, "source-selection.json")
    if (!fs.existsSync(selectionFile)) continue
    let selection
    try {
      selection = readJSON(selectionFile)
    } catch {
      continue
    }
    if (
      selection.schema !== "research-source-selection/v1" ||
      !/^[a-zA-Z0-9_-]+$/.test(selection.daily_run || "") ||
      !selection.candidate_key ||
      selection.candidate_published !== false ||
      !/^[a-f0-9]{64}$/.test(selection.documents_sha256 || "") ||
      !/^[a-f0-9]{64}$/.test(selection.parses_sha256 || "")
    ) {
      if (selection.daily_run === dailyRunId) aggregate.invalid_receipts++
      continue
    }
    try {
      const documents = readJSON(path.join(runDirectory, "documents.json"))
      const parses = readJSON(path.join(runDirectory, "parses.json"))
      if (
        sha256(JSON.stringify(documents)) !== selection.documents_sha256 ||
        sha256(JSON.stringify(parses)) !== selection.parses_sha256
      )
        throw Error("source selection fingerprint mismatch")
    } catch {
      if (selection.daily_run === dailyRunId) aggregate.invalid_receipts++
      continue
    }
    selections.push({
      daily_run: selection.daily_run,
      run_id: runId,
      documents_sha256: selection.documents_sha256,
      parses_sha256: selection.parses_sha256,
    })
    if (selection.daily_run === dailyRunId) aggregate.linked_selection_runs++
  }

  for (const runId of runDirectories) {
    const runDirectory = path.join(runsRoot, runId)
    const roleRoot = path.join(runDirectory, "model-policy")
    const roleDirectories = fs.existsSync(roleRoot)
      ? fs
          .readdirSync(roleRoot, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && /^[a-zA-Z0-9_-]+$/.test(entry.name))
          .map((entry) => entry.name)
          .sort()
      : []
    if (roleDirectories.length === 0) continue
    let identity
    try {
      const documents = readJSON(path.join(runDirectory, "documents.json"))
      const parses = readJSON(path.join(runDirectory, "parses.json"))
      identity = {
        documents_sha256: sha256(JSON.stringify(documents)),
        parses_sha256: sha256(JSON.stringify(parses)),
      }
    } catch {
      continue
    }
    const matchedSelections = selections.filter(
      (selection) =>
        selection.documents_sha256 === identity.documents_sha256 &&
        selection.parses_sha256 === identity.parses_sha256,
    )
    if (!matchedSelections.length) continue
    if (matchedSelections.length !== 1) {
      if (matchedSelections.some((selection) => selection.daily_run === dailyRunId))
        aggregate.invalid_receipts++
      continue
    }
    if (matchedSelections[0].daily_run !== dailyRunId) continue
    let runMeasured = false
    for (const role of roleDirectories) {
      const budgetFile = path.join(roleRoot, role, "budget.json")
      if (!fs.existsSync(budgetFile)) continue
      try {
        const stored = readJSON(budgetFile)
        const { sha256: checksum, ...ledger } = stored
        const settings = ledger.binding?.settings
        if (
          checksum !== sha256(JSON.stringify(ledger)) ||
          ledger.schema !== "model-budget/v1" ||
          ledger.binding?.role !== role ||
          typeof settings?.model !== "string" ||
          !Array.isArray(ledger.attempts)
        )
          throw Error("invalid model budget")
        const provider = settings.provider || "ollama"
        const roleSummary = (aggregate.by_role[role] ||= {
          attempts: { complete: 0, failed: 0, running: 0 },
          model_wall_ms: 0,
          reserved_running_ms: 0,
          local_phase_timing: emptyLocalPhaseTiming(),
        })
        const providerSummary = (aggregate.by_provider[provider] ||= {
          attempts: { complete: 0, failed: 0, running: 0 },
          model_wall_ms: 0,
          reserved_running_ms: 0,
          local_phase_timing: emptyLocalPhaseTiming(),
        })
        for (const attempt of ledger.attempts) {
          if (
            !["complete", "failed", "running"].includes(attempt.status) ||
            !Number.isSafeInteger(attempt.reserved_ms) ||
            attempt.reserved_ms < 1 ||
            (attempt.status === "running"
              ? attempt.wall_ms !== undefined
              : !Number.isSafeInteger(attempt.wall_ms) || attempt.wall_ms < 0) ||
            (attempt.status === "complete" &&
              (!attempt.result || attempt.result_sha256 !== sha256(JSON.stringify(attempt.result))))
          )
            throw Error("invalid model attempt")
          aggregate.attempts[attempt.status]++
          roleSummary.attempts[attempt.status]++
          providerSummary.attempts[attempt.status]++
          if (attempt.status === "running") {
            aggregate.reserved_running_ms += attempt.reserved_ms
            roleSummary.reserved_running_ms += attempt.reserved_ms
            providerSummary.reserved_running_ms += attempt.reserved_ms
          } else {
            aggregate.model_wall_ms += attempt.wall_ms
            roleSummary.model_wall_ms += attempt.wall_ms
            providerSummary.model_wall_ms += attempt.wall_ms
            if (attempt.status === "complete") {
              addLocalPhaseTiming(aggregate.local_phase_timing, attempt.result.provenance)
              addLocalPhaseTiming(roleSummary.local_phase_timing, attempt.result.provenance)
              addLocalPhaseTiming(providerSummary.local_phase_timing, attempt.result.provenance)
            }
          }
        }
        runMeasured ||= ledger.attempts.length > 0
      } catch {
        aggregate.invalid_receipts++
      }
    }
    if (runMeasured) aggregate.measured_runs++
    else aggregate.unmeasured_runs++
  }
  aggregate.status = aggregate.invalid_receipts
    ? "partial_invalid_receipts"
    : aggregate.linked_selection_runs === 0
      ? "no_linked_model_runs"
      : aggregate.unmeasured_runs
        ? "partial_unmeasured_runs"
        : "measured"
  return aggregate
}

function emptyLocalPhaseTiming() {
  return {
    instrumented_attempts: 0,
    phase_attempts: { load: 0, prompt_eval: 0, generation: 0 },
    load_ms: null,
    prompt_eval_ms: null,
    generation_ms: null,
    prompt_tokens: null,
    output_tokens: null,
  }
}

function addLocalPhaseTiming(summary, provenance) {
  if (!provenance || typeof provenance !== "object") return
  const phases = [
    ["load_duration", "load_ms"],
    ["prompt_eval_duration", "prompt_eval_ms"],
    ["eval_duration", "generation_ms"],
  ]
  const available = phases.filter(
    ([field]) => Number.isSafeInteger(provenance[field]) && provenance[field] >= 0,
  )
  if (!available.length) return
  summary.instrumented_attempts++
  for (const [field, total] of available) {
    const phase =
      field === "load_duration"
        ? "load"
        : field === "prompt_eval_duration"
          ? "prompt_eval"
          : "generation"
    summary.phase_attempts[phase]++
    summary[total] = (summary[total] ?? 0) + Math.round(provenance[field] / 1_000_000)
  }
  if (Number.isSafeInteger(provenance.prompt_eval_count) && provenance.prompt_eval_count >= 0)
    summary.prompt_tokens = (summary.prompt_tokens ?? 0) + provenance.prompt_eval_count
  if (Number.isSafeInteger(provenance.eval_count) && provenance.eval_count >= 0)
    summary.output_tokens = (summary.output_tokens ?? 0) + provenance.eval_count
}

function loadDailyRuns(root) {
  return filesUnder(path.join(root, "daily/runs"), "/summary.json")
    .map((file) => {
      const summary = readJSON(file)
      const planFile = path.join(path.dirname(file), "plan.json")
      const plan = fs.existsSync(planFile) ? readJSON(planFile) : null
      const receiptDirectory = path.join(path.dirname(file), "receipts")
      const receipts = fs.existsSync(receiptDirectory)
        ? fs
            .readdirSync(receiptDirectory)
            .filter((name) => name.endsWith(".json"))
            .map((name) => readJSON(path.join(receiptDirectory, name)))
        : []
      return { file, summary, plan, receipts, mtime: fs.statSync(file).mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
}

export function loadLatestDriveReconciliation(root) {
  const files = filesUnder(path.join(root, "daily/runs"), ".json")
    .filter((file) => file.includes(`${path.sep}drive-reconciliations${path.sep}`))
    .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  if (!files.length) return { status: "no_reconciliation_receipt" }

  const { file } = files[0]
  const bytes = fs.readFileSync(file)
  const receipt = JSON.parse(bytes.toString("utf8"))
  if (
    receipt?.schema !== "research-drive-approval-reconciliation/v1" ||
    !Number.isInteger(receipt.candidate_count) ||
    !receipt.classification_counts ||
    !Array.isArray(receipt.duplicate_source_groups) ||
    receipt.candidate_published !== false ||
    receipt.drive_written !== false ||
    receipt.public_verified !== false
  )
    return { status: "invalid_reconciliation_receipt", path: path.relative(root, file) }

  return {
    status: "reconciled_read_only",
    path: path.relative(root, file),
    receipt_sha256: sha256(bytes),
    generated_at: receipt.generated_at,
    daily_run: receipt.daily_run,
    drive_file_count: receipt.drive_snapshot?.file_count ?? null,
    drive_snapshot_age_ms: receipt.drive_snapshot?.age_ms ?? null,
    fresh_for_new_plan: receipt.drive_snapshot?.fresh_for_new_plan === true,
    candidate_count: receipt.candidate_count,
    classification_counts: receipt.classification_counts,
    duplicate_source_groups: receipt.duplicate_source_groups.length,
    candidate_published: false,
    drive_written: false,
    public_verified: false,
  }
}

export function loadLatestCandidateEvidenceReviewBatch(root) {
  const files = filesUnder(path.join(root, "daily/runs"), ".json")
    .filter((file) => file.includes(`${path.sep}identity-review-batches${path.sep}`))
    .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  if (!files.length) return { status: "no_evidence_review_batch" }

  const { file } = files[0]
  const bytes = fs.readFileSync(file)
  const batch = JSON.parse(bytes.toString("utf8"))
  if (
    batch?.schema !== "research-candidate-source-evidence-review/v1" ||
    !Number.isInteger(batch.candidate_count) ||
    batch.candidate_count !== batch.candidates?.length ||
    !batch.source_attempt_counts ||
    batch.candidate_approved !== false ||
    batch.candidate_published !== false ||
    batch.drive_written !== false ||
    batch.public_verified !== false
  )
    return { status: "invalid_evidence_review_batch", path: path.relative(root, file) }

  return {
    status: "source_evidence_reviewed",
    path: path.relative(root, file),
    receipt_sha256: sha256(bytes),
    generated_at: batch.generated_at,
    daily_run: batch.daily_run,
    candidate_count: batch.candidate_count,
    candidates_with_source_attempts: Object.values(batch.candidate_source_states || {}).filter(
      (state) => Object.values(state || {}).some((count) => count > 0),
    ).length,
    candidates_without_source_attempts: Object.values(batch.candidate_source_states || {}).filter(
      (state) => !Object.values(state || {}).some((count) => count > 0),
    ).length,
    source_attempt_count: batch.source_attempt_count,
    source_attempt_counts: batch.source_attempt_counts,
    candidate_approved: false,
    candidate_published: false,
    drive_written: false,
    public_verified: false,
  }
}

export function loadLatestHistoricalSourceReconciliation(root) {
  const files = filesUnder(path.join(root, "daily/runs"), ".json")
    .filter((file) => file.includes(`${path.sep}historical-source-reconciliations${path.sep}`))
    .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  if (!files.length) return { status: "no_historical_source_reconciliation" }

  const { file } = files[0]
  const bytes = fs.readFileSync(file)
  const receipt = JSON.parse(bytes.toString("utf8"))
  if (
    receipt?.schema !== "research-historical-source-reconciliation/v1" ||
    !Number.isInteger(receipt.candidate_count) ||
    receipt.candidate_count !== receipt.candidates?.length ||
    !receipt.candidate_status_counts ||
    receipt.candidate_approved !== false ||
    receipt.candidate_published !== false ||
    receipt.drive_written !== false ||
    receipt.public_verified !== false
  )
    return { status: "invalid_historical_source_reconciliation", path: path.relative(root, file) }

  return {
    status: "historical_sources_reconciled_read_only",
    path: path.relative(root, file),
    receipt_sha256: sha256(bytes),
    generated_at: receipt.generated_at,
    daily_run: receipt.daily_run,
    candidate_count: receipt.candidate_count,
    candidates_with_historical_sources: receipt.candidates_with_historical_sources,
    historical_source_version_count: receipt.historical_source_version_count,
    historical_parse_count: receipt.historical_parse_count,
    exact_url_attempt_count: receipt.exact_url_attempt_count || 0,
    candidate_status_counts: receipt.candidate_status_counts,
    comparison_counts: receipt.comparison_counts,
    run_validation_failure_count: receipt.run_validation_failure_count,
    candidate_approved: false,
    candidate_published: false,
    drive_written: false,
    public_verified: false,
  }
}

export function loadHistoricalSourceAdjudications(root, reconciliation) {
  const directory = path.join(root, "adjudications")
  if (!fs.existsSync(directory))
    return {
      status: "no_receipts",
      receipt_count: 0,
      invalid_receipt_count: 0,
      adjudicated_comparison_rows: 0,
      entries: [],
    }
  const files = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(directory, entry.name))
    .sort()
  const entries = []
  let invalid_receipt_count = 0
  let adjudicated_comparison_rows = 0
  const adjudicatedRowsByClass = new Map()
  const seenIds = new Set()
  const seenParseReferences = new Set()
  for (const file of files) {
    try {
      const bytes = fs.readFileSync(file)
      const receipt = JSON.parse(bytes.toString("utf8"))
      const decision = receipt?.decision
      const scope = receipt?.scope
      const baseline = receipt?.approved_baseline
      const ids = receipt?.incomplete_historical_parses
      const isCrossVersion = [
        "prior_version_parse_is_ordered_subset",
        "prior_version_parse_metadata_gap",
      ].includes(decision?.classification)
      if (
        receipt?.schema !== "historical-parse-adjudication/v1" ||
        !/^[a-zA-Z0-9_-]{1,160}$/.test(receipt.adjudication_id || "") ||
        seenIds.has(receipt.adjudication_id) ||
        !Number.isFinite(Date.parse(receipt.generated_at || "")) ||
        !scope?.candidate_key ||
        !/^[a-f0-9]{16}$/.test(scope.event_id || "") ||
        !/^[a-f0-9]{64}$/.test(scope.source_body_sha256 || "") ||
        scope.source_version_id !== `${sourceId(scope.source_url)}:${scope.source_body_sha256}` ||
        !Number.isSafeInteger(scope.source_bytes) ||
        !/^[a-f0-9]{64}$/.test(baseline?.parse_artifact_sha256 || "") ||
        !/^[a-f0-9]{64}$/.test(baseline?.article_content_sha256 || "") ||
        !/^[a-f0-9]{64}$/.test(receipt.approved_baseline?.approval_receipt_sha256 || "") ||
        !/^[a-zA-Z0-9_-]+$/.test(baseline?.run_id || "") ||
        !/^[a-f0-9]{64}$/.test(baseline.parse_id || "") ||
        !Number.isInteger(baseline.block_count) ||
        !Array.isArray(ids) ||
        ids.length === 0 ||
        ids.length !== decision?.affected_historical_parse_count ||
        ids.length !== decision?.raw_comparison_rows_resolved ||
        ![
          "same_source_parser_truncation",
          "same_source_parser_metadata_gap",
          "same_source_parser_metadata_blocks",
          "prior_version_parse_is_ordered_subset",
          "prior_version_parse_metadata_gap",
        ].includes(decision.classification) ||
        ![
          "same_source_version_content_differs",
          ...(isCrossVersion ? ["prior_source_version_different_content"] : []),
        ].includes(decision.raw_reconciliation_class) ||
        decision.source_content_changed !== isCrossVersion ||
        (isCrossVersion && decision.source_version_changed !== true) ||
        decision.candidate_identity_changed !== false ||
        decision.approval_changed !== false ||
        decision.publication_changed !== false ||
        receipt.constraints?.candidate_published !== false ||
        receipt.constraints?.drive_written !== false ||
        receipt.constraints?.public_verified !== false ||
        receipt.constraints?.source_and_approval_artifacts_mutated !== false ||
        new Set(ids.map((item) => item.parse_id)).size !== ids.length
      )
        throw Error("invalid adjudication fields")
      const candidate = reconciliation?.candidates?.find(
        (item) => item.candidate_key === scope.candidate_key,
      )
      const source = candidate?.historical_sources?.find(
        (item) =>
          item.source_version_id === scope.source_version_id &&
          item.body_sha256 === scope.source_body_sha256 &&
          safeCanonical(item.original_url) === safeCanonical(scope.source_url),
      )
      const baselineParse = source?.parses?.find(
        (item) =>
          item.parse_id === baseline.parse_id &&
          item.article_content_sha256 === baseline.article_content_sha256 &&
          item.comparison_to_candidate === "same_source_version_parse_and_content",
      )
      if (
        !candidate ||
        !source ||
        !baselineParse ||
        !ids.every((item) =>
          (candidate.historical_sources || []).some(
            (historicalSource) =>
              historicalSource.source_version_id ===
                (item.source_version_id || scope.source_version_id) &&
              historicalSource.body_sha256 ===
                (item.source_body_sha256 || scope.source_body_sha256) &&
              safeCanonical(historicalSource.original_url) === safeCanonical(scope.source_url) &&
              historicalSource.parses.some(
                (parse) =>
                  parse.parse_id === item.parse_id &&
                  parse.article_content_sha256 === item.article_content_sha256 &&
                  parse.comparison_to_candidate === decision.raw_reconciliation_class &&
                  item.parser?.id &&
                  item.block_count > 0 &&
                  item.blocks_exactly_present_in_approved_parse ===
                    (decision.classification === "same_source_parser_metadata_blocks"
                      ? item.block_count - 2
                      : item.block_count),
              ),
          ),
        ) ||
        ids.some((item) => item.parse_id === baseline.parse_id)
      )
        throw Error("adjudication does not match current reconciliation evidence")
      const parseReferenceKeys = ids.map(
        (item) =>
          `${scope.candidate_key}\u0000${item.source_version_id || scope.source_version_id}\u0000${item.parse_id}`,
      )
      if (
        parseReferenceKeys.some((key) => seenParseReferences.has(key)) ||
        (adjudicatedRowsByClass.get(decision.raw_reconciliation_class) || 0) +
          decision.raw_comparison_rows_resolved >
          (reconciliation?.comparison_counts?.[decision.raw_reconciliation_class] || 0)
      )
        throw Error("adjudication duplicates or exceeds raw comparison rows")
      const sourceBytes = fs.readFileSync(
        path.join(
          root,
          "documents",
          sourceId(scope.source_url),
          scope.source_body_sha256,
          "body.bin",
        ),
      )
      if (
        sha256(sourceBytes) !== scope.source_body_sha256 ||
        sourceBytes.length !== scope.source_bytes
      )
        throw Error("adjudication source bytes changed")
      const historicalSourceBytes = new Map([[scope.source_version_id, sourceBytes]])
      for (const item of ids) {
        const itemVersion = item.source_version_id || scope.source_version_id
        const itemSourceHash = item.source_body_sha256 || scope.source_body_sha256
        const itemSourceBytes = item.source_bytes || scope.source_bytes
        if (itemVersion === scope.source_version_id) continue
        const itemBytes = fs.readFileSync(
          path.join(root, "documents", sourceId(scope.source_url), itemSourceHash, "body.bin"),
        )
        if (sha256(itemBytes) !== itemSourceHash || itemBytes.length !== itemSourceBytes)
          throw Error("historical adjudication source bytes changed")
        historicalSourceBytes.set(itemVersion, itemBytes)
      }
      const readParseArtifact = (
        parseId,
        expectedSourceVersion,
        expectedSha,
        expectedFingerprint,
        expectedBlocks,
      ) => {
        const artifactBytes = fs.readFileSync(path.join(root, "parses", parseId, "parse.json"))
        const parse = JSON.parse(artifactBytes.toString("utf8"))
        if (
          sha256(artifactBytes) !== expectedSha ||
          parse.parse_id !== parseId ||
          parse.source_version_id !== expectedSourceVersion ||
          articleContentFingerprint(parse) !== expectedFingerprint ||
          parse.blocks.length !== expectedBlocks
        )
          throw Error("adjudication parse artifact changed")
        return parse
      }
      const approvedParse = readParseArtifact(
        baseline.parse_id,
        scope.source_version_id,
        baseline.parse_artifact_sha256,
        baseline.article_content_sha256,
        baseline.block_count,
      )
      const approvalMatches = filesUnder(path.join(root, "runs"), "candidate-approval.json")
        .filter((file) => sha256(fs.readFileSync(file)) === baseline.approval_receipt_sha256)
        .filter((file) => {
          const approval = readJSON(file)
          return (
            approval.candidate_key === scope.candidate_key &&
            approval.event_id === scope.event_id &&
            approval.source_version_id === scope.source_version_id &&
            approval.parse_id === baseline.parse_id &&
            approval.article_content_sha256 === baseline.article_content_sha256 &&
            approval.candidate_published === false
          )
        })
      if (approvalMatches.length !== 1) throw Error("adjudication approval binding changed")
      for (const item of ids) {
        const itemVersion = item.source_version_id || scope.source_version_id
        const historicalParse = readParseArtifact(
          item.parse_id,
          itemVersion,
          item.parse_artifact_sha256,
          item.article_content_sha256,
          item.block_count,
        )
        const historicalTexts = historicalParse.blocks.map((block) => block.text)
        const approvedTexts = approvedParse.blocks.map((block) => block.text)
        if (
          decision.classification === "same_source_parser_truncation" ||
          decision.classification === "prior_version_parse_is_ordered_subset"
        ) {
          let nextIndex = 0
          for (const text of historicalTexts) {
            const foundAt = approvedTexts.indexOf(text, nextIndex)
            if (foundAt < 0) throw Error("historical parse is not an ordered subset")
            nextIndex = foundAt + 1
          }
          if (historicalTexts.length >= approvedTexts.length)
            throw Error("truncation must omit approved article blocks")
          if (decision.classification === "prior_version_parse_is_ordered_subset") {
            const snippets = item.source_body_evidence
            const sourceText = historicalSourceBytes.get(itemVersion)?.toString("utf8") || ""
            if (
              !Array.isArray(snippets) ||
              snippets.length === 0 ||
              snippets.some(
                (snippet) =>
                  typeof snippet !== "string" ||
                  snippet.length < 12 ||
                  !sourceText.includes(snippet) ||
                  !approvedTexts.some((text) => text.includes(snippet)) ||
                  historicalTexts.some((text) => text.includes(snippet)),
              )
            )
              throw Error("prior source does not contain the recorded omitted article text")
          }
        } else if (
          decision.classification === "same_source_parser_metadata_gap" ||
          decision.classification === "prior_version_parse_metadata_gap"
        ) {
          if (
            decision.changed_field !== "dates.published_at" ||
            historicalParse.title.trim() !== approvedParse.title.trim() ||
            historicalParse.dates.published_at !== null ||
            typeof approvedParse.dates.published_at !== "string" ||
            JSON.stringify(historicalTexts) !== JSON.stringify(approvedTexts)
          )
            throw Error("parse metadata gap is not limited to recovered publication date")
          if (decision.classification === "prior_version_parse_metadata_gap") {
            const priorEvidence = item.source_body_evidence
            const approvedEvidence = baseline.source_body_evidence
            const priorText = historicalSourceBytes.get(itemVersion)?.toString("utf8") || ""
            const approvedText = sourceBytes.toString("utf8")
            if (
              !Array.isArray(priorEvidence) ||
              priorEvidence.length === 0 ||
              priorEvidence.some(
                (snippet) =>
                  typeof snippet !== "string" ||
                  snippet.length < 12 ||
                  !priorText.includes(snippet),
              ) ||
              !Array.isArray(approvedEvidence) ||
              approvedEvidence.length === 0 ||
              approvedEvidence.some(
                (snippet) =>
                  typeof snippet !== "string" ||
                  snippet.length < 12 ||
                  !approvedText.includes(snippet),
              ) ||
              !priorEvidence.some((snippet) => snippet.includes("datePublished")) ||
              !approvedEvidence.some((snippet) => snippet.includes("datePublished")) ||
              !priorEvidence.some((snippet) =>
                snippet.includes(approvedParse.dates.published_at),
              ) ||
              !approvedEvidence.some((snippet) =>
                snippet.includes(approvedParse.dates.published_at),
              )
            )
              throw Error(
                "prior and approved source bytes do not contain the recorded publication date",
              )
          }
        } else if (
          JSON.stringify(decision.metadata_block_indexes) !== JSON.stringify([0, 1]) ||
          JSON.stringify(decision.metadata_block_fields) !==
            JSON.stringify(["title", "published_at"]) ||
          historicalParse.title.trim() !== approvedParse.title.trim() ||
          historicalParse.dates.published_at !== null ||
          typeof approvedParse.dates.published_at !== "string" ||
          historicalTexts[0] !== approvedParse.title.trim() ||
          historicalTexts[1]?.replace(/\D/g, "") !==
            approvedParse.dates.published_at.replace(/\D/g, "").slice(0, 8) ||
          JSON.stringify(historicalTexts.slice(2)) !== JSON.stringify(approvedTexts)
        ) {
          throw Error("historical parse metadata blocks do not exactly match approved article")
        }
      }
      seenIds.add(receipt.adjudication_id)
      parseReferenceKeys.forEach((key) => seenParseReferences.add(key))
      adjudicated_comparison_rows += decision.raw_comparison_rows_resolved
      adjudicatedRowsByClass.set(
        decision.raw_reconciliation_class,
        (adjudicatedRowsByClass.get(decision.raw_reconciliation_class) || 0) +
          decision.raw_comparison_rows_resolved,
      )
      entries.push({
        adjudication_id: receipt.adjudication_id,
        candidate_key: scope.candidate_key,
        event_id: scope.event_id,
        source_version_id: scope.source_version_id,
        classification: decision.classification,
        raw_reconciliation_class: decision.raw_reconciliation_class,
        source_version_changed: isCrossVersion,
        adjudicated_comparison_rows: decision.raw_comparison_rows_resolved,
        receipt_sha256: sha256(bytes),
        path: path.relative(root, file),
        candidate_published: false,
        drive_written: false,
        public_verified: false,
      })
    } catch {
      invalid_receipt_count += 1
    }
  }
  return {
    status: invalid_receipt_count ? "partial_or_invalid" : "verified_read_only_projection",
    receipt_count: entries.length,
    invalid_receipt_count,
    adjudicated_comparison_rows,
    entries,
    candidate_published: false,
    drive_written: false,
    public_verified: false,
  }
}

export function summarizeCandidateSourceAlternativeResolutions(root) {
  const files = filesUnder(path.join(root, "runs"), "candidate-source-alternative.json")
  const decisions = []
  let invalid = 0
  for (const file of files) {
    try {
      const receipt = readJSON(file)
      if (
        receipt?.schema !== "research-candidate-source-alternative-resolution/v1" ||
        typeof receipt.candidate_key !== "string" ||
        !["same_event", "different_event", "unresolved"].includes(receipt.decision) ||
        !receipt.original_source?.url ||
        !receipt.alternative_source?.url ||
        !/^[a-f0-9]{64}$/.test(receipt.alternative_source?.body_sha256 || "") ||
        !/^[a-f0-9]{64}$/.test(receipt.alternative_source?.content_sha256 || "") ||
        !Array.isArray(receipt.claim_evidence) ||
        receipt.candidate_approved !== false ||
        receipt.candidate_published !== false ||
        receipt.backlog_written !== false ||
        receipt.drive_written !== false ||
        receipt.public_verified !== false
      ) {
        invalid += 1
        continue
      }
      decisions.push(receipt.decision)
    } catch {
      invalid += 1
    }
  }
  return {
    status: invalid ? "partial_or_invalid" : files.length ? "read_only" : "no_receipts",
    receipt_count: decisions.length,
    invalid_receipt_count: invalid,
    decision_counts: counter(decisions),
  }
}

function loadTargetedScans(root) {
  return filesUnder(root, "/list-scan.json")
    .map((file) => ({
      file,
      summary: readJSON(file),
      mtime: fs.statSync(file).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)
}

export function sourceBaselineEvidence(root, source, dailyRun, targetedScan) {
  if (dailyRun)
    return {
      exists: true,
      summary_status: dailyRun.summary.status,
      route_status:
        dailyRun.summary.routes?.find((route) => route.channel_id === source.id)?.status || null,
      evidence_type: "daily_run",
    }
  if (!targetedScan)
    return { exists: false, summary_status: null, route_status: null, evidence_type: null }
  const { summary } = targetedScan
  const result = {
    exists: false,
    summary_status: summary.status || null,
    route_status: summary.status || null,
    evidence_type: "targeted_list_scan",
  }
  if (
    summary.status !== "window_scanned" ||
    summary.channel_id !== source.id ||
    !summary.window?.since ||
    !summary.window?.until_exclusive
  )
    return result
  try {
    const scan = storedListScan(root, path.basename(path.dirname(targetedScan.file)))
    verifyStoredListScan(
      root,
      scan,
      { channel_id: source.id, ...summary.window },
      { allowLegacyCandidates: true },
    )
    return { ...result, exists: true }
  } catch (error) {
    return {
      ...result,
      summary_status: "invalid_evidence",
      route_status: "invalid_evidence",
      validation_error: error.message,
    }
  }
}

export function loadTargetedSearchRuns(root) {
  return filesUnder(root, "/targeted-queries.json")
    .flatMap((planFile) => {
      const plan = readJSON(planFile)
      const searchFile = path.join(path.dirname(planFile), "search.json")
      if (plan.schema !== "research-source-targeted-plan/v1" || !fs.existsSync(searchFile))
        return []
      const search = readJSON(searchFile)
      const queriesBySlot = new Map((plan.queries || []).map((query) => [query.slot_id, query]))
      const records = (search.records || []).map((record) => {
        const query = queriesBySlot.get(record.slot_id)
        return {
          run_id: plan.run_id || path.basename(path.dirname(planFile)),
          slot_id: record.slot_id || query?.slot_id || null,
          source_channel_id: record.source_channel_id || query?.source_channel_id || null,
          source_url: record.source_url || query?.source_url || null,
          status: record.status || "unknown",
          result_count: Number.isInteger(record.result_count) ? record.result_count : 0,
          candidate_count: Number.isInteger(record.candidate_count) ? record.candidate_count : 0,
          engine_failure_count: Array.isArray(record.failures) ? record.failures.length : 0,
          error: record.error || null,
        }
      })
      const candidates = Array.isArray(search.candidates) ? search.candidates : []
      const candidatesWithCanonicalUrl = candidates.filter((candidate) =>
        (candidate.source_urls || []).some((url) => safeCanonical(url)),
      )
      const uniqueCandidateUrls = new Set(
        candidatesWithCanonicalUrl.flatMap((candidate) =>
          (candidate.source_urls || []).map(safeCanonical).filter(Boolean),
        ),
      )
      const file = searchFile
      return [
        {
          file,
          plan,
          records,
          mtime: fs.statSync(file).mtimeMs,
          summary: {
            run_id: plan.run_id || path.basename(path.dirname(planFile)),
            daily_run: plan.daily_basis?.daily_run || null,
            planned_queries: (plan.queries || []).length,
            recorded_queries: records.length,
            query_statuses: counter(records.map((record) => record.status)),
            queries_with_candidates: records.filter((record) => record.candidate_count > 0).length,
            failed_queries: records.filter((record) => record.status === "failed").length,
            engine_failures: records.reduce(
              (total, record) => total + record.engine_failure_count,
              0,
            ),
            failed_queries_without_engine_details: records.filter(
              (record) =>
                record.status === "failed" &&
                record.engine_failure_count === 0 &&
                record.error?.includes("engines reported failures"),
            ).length,
            candidates: candidates.length,
            unique_candidate_urls: uniqueCandidateUrls.size,
            duplicate_candidate_rows: Math.max(
              0,
              candidatesWithCanonicalUrl.length - uniqueCandidateUrls.size,
            ),
            candidates_missing_canonical_url: candidates.length - candidatesWithCanonicalUrl.length,
            unresolved_slots: Array.isArray(plan.unresolved_slots) ? plan.unresolved_slots : [],
            candidate_published: plan.candidate_published === true,
          },
        },
      ]
    })
    .sort((a, b) => b.mtime - a.mtime)
}

function loadRunAudit(repo) {
  const directory = path.join(repo, ".local/research/runs")
  const records = fs.existsSync(directory)
    ? fs
        .readdirSync(directory)
        .filter((file) => file.endsWith(".json"))
        .map((file) => readJSON(path.join(directory, file)))
    : []
  return auditRuns(records)
}

function loadPlanProgress(repo) {
  const file = path.join(repo, "docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md")
  if (!fs.existsSync(file)) return { status: "missing", required: 0, completed: 0, rows: [] }
  const document = fs.readFileSync(file, "utf8")
  const sectionStart = document.indexOf("## 현재 진척과 다음 완료 증거")
  const sectionEnd = document.indexOf("## 5. P0", sectionStart)
  if (sectionStart < 0 || sectionEnd < 0)
    return { status: "unreadable", required: 0, completed: 0, rows: [] }
  const rows = document
    .slice(sectionStart, sectionEnd)
    .split("\n")
    .flatMap((line) => {
      const match = line.match(/^\|\s*(P[0-6]-\d{2})\s*\|\s*([^|]+)\|\s*([^|]+)\|/)
      if (!match) return []
      const [, id, detail, next] = match
      const label = detail.match(/^\s*(완료|부분|미완료|미승격)\s*:/)?.[1]
      if (!label) return []
      const status = {
        완료: "complete",
        부분: "partial",
        미완료: "not_started",
        미승격: "not_promoted",
      }[label]
      return [
        {
          id,
          status,
          required: status !== "not_promoted",
          evidence: detail.replace(/^\s*(?:완료|부분|미완료|미승격)\s*:\s*/, "").trim(),
          next: next.trim(),
        },
      ]
    })
  const expectedIds = Array.from({ length: 7 }, (_, phase) =>
    Array.from(
      { length: [3, 5].includes(phase) ? 4 : 3 },
      (_, index) => `P${phase}-${String(index + 1).padStart(2, "0")}`,
    ),
  ).flat()
  const valid =
    rows.length === expectedIds.length &&
    expectedIds.every((id) => rows.filter((row) => row.id === id).length === 1)
  if (!valid) return { status: "invalid_plan_rows", required: 0, completed: 0, rows }
  const requiredRows = rows.filter((row) => row.required)
  return {
    status: "current_plan_wbs",
    plan_as_of: document.match(/기준일[:：]?\s*(\d{4}-\d{2}-\d{2})/)?.[1] || null,
    required: requiredRows.length,
    completed: requiredRows.filter((row) => row.status === "complete").length,
    partial: requiredRows.filter((row) => row.status === "partial").length,
    not_started: requiredRows.filter((row) => row.status === "not_started").length,
    excluded_from_assisted_completion: rows.filter((row) => !row.required).map((row) => row.id),
    rows,
  }
}

function approvalReconciliation(
  repo,
  publishedArticles,
  backlogFile = ".local/research/candidate-backlog.json",
) {
  const absoluteBacklog = path.resolve(repo, backlogFile)
  if (!fs.existsSync(absoluteBacklog))
    return { status: "missing", counts: {}, candidates: [], source_sha256: null }
  const bytes = fs.readFileSync(absoluteBacklog)
  const backlog = JSON.parse(bytes.toString("utf8"))
  if (backlog?.schema !== "research-candidates/v1" || !Array.isArray(backlog.candidates))
    return { status: "invalid", counts: {}, candidates: [], source_sha256: sha256(bytes) }
  const candidates = backlog.candidates.map((candidate) => ({
    key: candidate.key,
    title: candidate.title,
    review_status: candidate.review_status || "unreviewed",
    has_approval_receipt: Boolean(
      candidate.approval?.approved_run && candidate.approval?.article_sha256,
    ),
    event_id: candidate.event_id || null,
    source_count: candidate.source_urls?.length || 0,
    disposition: candidate.disposition?.status || null,
    published_matches: {
      event_id: publishedArticles
        .filter((article) => candidate.event_id && article.event_id === candidate.event_id)
        .map((article) => article.edition),
      source_url: publishedArticles
        .filter((article) =>
          (candidate.source_urls || []).some((url) =>
            article.source_urls.some(
              (sourceURL) => safeCanonical(url) && safeCanonical(url) === safeCanonical(sourceURL),
            ),
          ),
        )
        .map((article) => article.edition),
      title_and_day: publishedArticles
        .filter(
          (article) =>
            titleDayKey(candidate.title, candidate.source_published_at) &&
            titleDayKey(article.title, article.published_at) ===
              titleDayKey(candidate.title, candidate.source_published_at),
        )
        .map((article) => article.edition),
    },
  }))
  const publishedRelation = (candidate) => {
    if (candidate.published_matches.event_id.length) return "event_id_match"
    if (candidate.published_matches.source_url.length) return "source_url_match_review_required"
    if (candidate.published_matches.title_and_day.length) return "title_day_match_review_required"
    return "no_published_match_found"
  }
  const relationCounts = counter(candidates.map(publishedRelation))
  const publishedEventCounts = new Map()
  for (const article of publishedArticles)
    if (article.event_id)
      publishedEventCounts.set(
        `${article.edition}:${article.event_id}`,
        (publishedEventCounts.get(`${article.edition}:${article.event_id}`) || 0) + 1,
      )
  return {
    status: "read_only_inventory",
    counts: {
      total: candidates.length,
      review_status: counter(candidates.map((candidate) => candidate.review_status)),
      approval_receipt_linked: candidates.filter((candidate) => candidate.has_approval_receipt)
        .length,
      event_id_linked: candidates.filter((candidate) => candidate.event_id).length,
      identity_or_disposition: candidates.filter((candidate) => candidate.disposition).length,
      published_relation: relationCounts,
      published_duplicate_events_within_editions: [...publishedEventCounts.values()].filter(
        (count) => count > 1,
      ).length,
    },
    candidates,
    source_sha256: sha256(bytes),
  }
}

export function buildIntakeOntologyAudit(
  repo,
  backlogFile = ".local/research/candidate-backlog.json",
) {
  const file = path.resolve(repo, backlogFile)
  if (!fs.existsSync(file))
    return { status: "missing", source_sha256: null, candidate_count: 0, ontology: null }
  const bytes = fs.readFileSync(file)
  const backlog = JSON.parse(bytes.toString("utf8"))
  if (backlog?.schema !== "research-candidates/v1" || !Array.isArray(backlog.candidates))
    return { status: "invalid", source_sha256: sha256(bytes), candidate_count: 0, ontology: null }
  return {
    status: "read_only_projection",
    source_sha256: sha256(bytes),
    candidate_count: backlog.candidates.length,
    ontology: summarizeIntakeOntology(projectIntakeOntology(backlog.candidates)),
  }
}

export function summarizeCurrentSnapshot(scope, approvalReconciliation) {
  if (approvalReconciliation?.status !== "read_only_inventory")
    return {
      status: approvalReconciliation?.status || "unavailable",
      candidate_count: 0,
      review_status: {},
      approval_receipt_linked: 0,
    }
  const counts = approvalReconciliation.counts
  return {
    status: "current_local_snapshot",
    acquisition_profiles: scope.acquisition_profiles,
    article_profiles: scope.article_profiles,
    candidate_count: counts.total,
    review_status: counts.review_status,
    approval_receipt_linked: counts.approval_receipt_linked,
    backlog_sha256: approvalReconciliation.source_sha256,
  }
}

function currentCodeEvidence(runs, currentFingerprint) {
  const latestIntegrated = runs.find(
    ({ summary, plan }) =>
      plan &&
      summary.routes?.length > 1 &&
      summary.routes.every((route) => route.status === "window_scanned"),
  )
  if (!latestIntegrated)
    return { status: "no_completed_integrated_run", current_fingerprint: currentFingerprint }
  return {
    status:
      latestIntegrated.plan.config_sha256 === currentFingerprint
        ? "verified_for_current_fingerprint"
        : "historical_success_requires_current_revalidation",
    run_id: latestIntegrated.summary.run_id,
    route_count: latestIntegrated.summary.routes.length,
    window_count: latestIntegrated.plan.windows.length,
    run_fingerprint: latestIntegrated.plan.config_sha256,
    current_fingerprint: currentFingerprint,
    coverage: counter(latestIntegrated.summary.coverage_grid.map((cell) => cell.status)),
    candidate_published: latestIntegrated.summary.candidate_published === true,
    drive_verified: latestIntegrated.summary.drive_verified === true,
    public_verified: latestIntegrated.summary.public_verified === true,
  }
}

export function buildSourceInventory({ knownRoutes, activeRoutes }) {
  const dailyById = new Map(activeRoutes.map((route) => [route.channel_id, route]))
  return knownRoutes
    .map((source) => {
      const id = source.id || source.channel_id
      if (typeof id !== "string" || !id) throw Error("Registered source ID required")
      const daily = dailyById.get(id)
      return {
        id,
        name: source.name || source.label || id,
        kind: source.kind || "미분류",
        language: source.language || "미분류",
        region: source.region || "미분류",
        sectors: source.sectors || [],
        axis: source.axis || "미분류",
        method: source.method || "미분류",
        verification: source.verification || "unverified",
        url: source.url || null,
        daily_enabled: Boolean(daily?.enabled),
        baseline_run: daily?.baseline_run || null,
        development_status: daily?.baseline_run ? "baseline_configured" : "registered_only",
      }
    })
    .sort(
      (a, b) =>
        Number(b.daily_enabled) - Number(a.daily_enabled) ||
        a.name.localeCompare(b.name, "ko") ||
        a.id.localeCompare(b.id),
    )
}

export function buildDeliveryStatus({
  repo = process.cwd(),
  root = ".local/research/local-ai",
} = {}) {
  const absoluteRoot = path.resolve(repo, root)
  const channelConfig = readJSON(path.resolve(repo, "data/research-source-channels.json"))
  const watchlist = readJSON(path.resolve(repo, "data/research-watchlist.json"))
  const acquisition = readJSON(path.resolve(repo, "data/research-acquisition.json"))
  const configFile = path.relative(
    process.cwd(),
    path.resolve(repo, "data/research-daily-routes.json"),
  )
  const { activeRoutes, config_sha256 } = dailySources(configFile)
  const knownRoutes = registry(channelConfig, watchlist, acquisition)
  const sourceRows = buildSourceInventory({ knownRoutes, activeRoutes })
  const dailyRuns = loadDailyRuns(absoluteRoot)
  const targetedScans = loadTargetedScans(absoluteRoot)
  const targetedSearchRuns = loadTargetedSearchRuns(absoluteRoot)
  const latest = dailyRuns[0] || null
  const latestCompleted = dailyRuns.find(
    ({ summary }) =>
      summary.routes?.length > 1 &&
      summary.routes.every((route) => route.status === "window_scanned"),
  )
  const publishedArticles = editions(path.resolve(repo, "vault")).flatMap((edition) =>
    extractArticles(edition).map((article) => ({
      event_id: article.id,
      title: article.title,
      published_at: article.review?.published_at,
      source_urls: article.urls,
      edition: edition.slug,
    })),
  )
  const backlog = approvalReconciliation(repo, publishedArticles)
  const intakeOntology = buildIntakeOntologyAudit(repo)
  const runAudit = loadRunAudit(repo)
  const sourceKinds = knownRoutes.map((route) => route.kind || "미분류")
  const runById = new Map(dailyRuns.map((run) => [run.summary.run_id, run]))
  const targetedScanById = new Map(
    targetedScans.map((scan) => [path.basename(path.dirname(scan.file)), scan]),
  )
  const sourceEvidence = sourceRows.map((source) => {
    const baseline = source.baseline_run ? runById.get(source.baseline_run) : null
    const targetedBaseline = source.baseline_run ? targetedScanById.get(source.baseline_run) : null
    return {
      ...source,
      baseline_evidence: sourceBaselineEvidence(absoluteRoot, source, baseline, targetedBaseline),
      last_run:
        dailyRuns
          .flatMap((run) =>
            (run.summary.routes || []).map((route) => ({
              ...route,
              run_id: run.summary.run_id,
              mtime: run.mtime,
              reason:
                [...run.receipts]
                  .filter((receipt) => receipt.channel_id === route.channel_id)
                  .sort((a, b) => (b.finished_at || "").localeCompare(a.finished_at || ""))
                  .find((receipt) => receipt.status !== "window_scanned")?.reason || null,
            })),
          )
          .filter((route) => route.channel_id === source.id)
          .sort((a, b) => b.mtime - a.mtime)[0] || null,
      latest_targeted_scan:
        targetedScans
          .filter(({ summary }) => summary.channel_id === source.id)
          .map(({ summary, file, mtime }) => ({
            run_id: path.basename(path.dirname(file)),
            status: summary.status,
            reason: summary.reason || null,
            window: summary.window || null,
            mtime,
          }))[0] || null,
      latest_targeted_search:
        targetedSearchRuns
          .flatMap((run) => run.records.map((record) => ({ ...record, mtime: run.mtime })))
          .filter((record) => record.source_channel_id === source.id)
          .sort((a, b) => b.mtime - a.mtime)[0] || null,
    }
  })
  for (const source of sourceEvidence) {
    if (
      source.latest_targeted_scan?.status === "window_scanned" ||
      source.last_run?.status === "window_scanned"
    )
      source.development_status = "collection_receipt_exists"
    else if (source.baseline_evidence.exists) source.development_status = "baseline_receipt_exists"
  }
  const completedCoverage = latestCompleted?.summary.coverage_grid || []
  const coverageGrid = completedCoverage.map((cell) => ({
    sector: cell.sector,
    region: cell.region,
    axis: cell.axis,
    status: cell.status,
    route_count: cell.usable_route_count,
    routes: cell.route_ids,
    failed_routes: cell.failed_route_ids,
  }))
  const sourceIndex = new Map(sourceEvidence.map((source) => [source.id, source]))
  const enrichedCoverage = coverageGrid.map((cell) => ({
    ...cell,
    development_statuses: [
      ...new Set(
        cell.routes.map((id) => sourceIndex.get(id)?.development_status || "not_in_daily_scope"),
      ),
    ],
  }))
  const legacyAudit = loadRunAudit(repo)
  const planProgress = loadPlanProgress(repo)
  const driveReconciliation = loadLatestDriveReconciliation(absoluteRoot)
  const candidateEvidenceReview = loadLatestCandidateEvidenceReviewBatch(absoluteRoot)
  const historicalSourceReconciliation = loadLatestHistoricalSourceReconciliation(absoluteRoot)
  const historicalSourceAdjudications = loadHistoricalSourceAdjudications(
    absoluteRoot,
    historicalSourceReconciliation.status === "historical_sources_reconciled_read_only"
      ? readJSON(path.join(absoluteRoot, historicalSourceReconciliation.path))
      : null,
  )
  const sourceAlternativeResolutions = summarizeCandidateSourceAlternativeResolutions(absoluteRoot)
  const supplementalCoverage = loadSupplementalCoverageEvidence(absoluteRoot, activeRoutes)
  const latestOntology = filesUnder(absoluteRoot, "/graph.json")
    .filter((file) => file.includes(`${path.sep}ontology${path.sep}`))
    .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs, graph: readJSON(file) }))
    .sort((a, b) => b.mtime - a.mtime)[0]

  const scope = {
    fixed_workstreams: [
      "현황·계측",
      "승인·사건 연결",
      "일일 전 구간",
      "출처 확대",
      "품질·소급",
      "평가·운영",
    ],
    total_registered_routes: knownRoutes.length,
    enabled_daily_routes: activeRoutes.filter((route) => route.enabled).length,
    acquisition_profiles: Object.keys(acquisition).filter((key) => key !== "article_profiles")
      .length,
    article_profiles: Object.keys(acquisition.article_profiles || {}).length,
    source_kind_distribution: counter(sourceKinds),
    fixed_coverage_cells: 32,
  }
  return {
    schema: "research-delivery-status/v1",
    generated_at: new Date().toISOString(),
    access: "local_private",
    scope,
    current_snapshot: summarizeCurrentSnapshot(scope, backlog),
    overall_completion: {
      numerator: planProgress.completed,
      denominator: planProgress.required,
      percent:
        planProgress.required > 0
          ? Math.round((100 * planProgress.completed) / planProgress.required)
          : null,
      partial: planProgress.partial,
      not_started: planProgress.not_started,
      plan_as_of: planProgress.plan_as_of,
      status: planProgress.status,
      excluded_from_assisted_completion: planProgress.excluded_from_assisted_completion,
      workstreams: planProgress.rows,
    },
    current_integrated_evidence: currentCodeEvidence(dailyRuns, config_sha256),
    latest_daily_run: latest
      ? {
          run_id: latest.summary.run_id,
          status: latest.summary.status,
          routes: latest.summary.routes?.length || 0,
          route_statuses: counter((latest.summary.routes || []).map((route) => route.status)),
          windows: latest.plan?.windows?.length || null,
          coverage: counter((latest.summary.coverage_grid || []).map((cell) => cell.status)),
          timing: latest.summary.timing || null,
          model_timing: loadDailyModelTiming(absoluteRoot, latest.summary.run_id),
          retry_policy: latest.plan?.retry_policy || DEFAULT_DAILY_RETRY_POLICY,
          retry_queue: latest.plan
            ? dailyRetryQueue(absoluteRoot, latest.plan, latest.receipts)
            : latest.summary.retry_queue || [],
          retry_queue_counts: counter(
            (latest.plan
              ? dailyRetryQueue(absoluteRoot, latest.plan, latest.receipts)
              : latest.summary.retry_queue || []
            ).map((entry) => entry.state),
          ),
          candidate_published: latest.summary.candidate_published === true,
          drive_verified: latest.summary.drive_verified === true,
          public_verified: latest.summary.public_verified === true,
        }
      : null,
    latest_complete_coverage: latestCompleted
      ? { run_id: latestCompleted.summary.run_id, grid: enrichedCoverage }
      : null,
    sources: sourceEvidence,
    targeted_search: {
      status: targetedSearchRuns.length ? "stored_search_receipts" : "no_targeted_search_runs",
      run_count: targetedSearchRuns.length,
      latest: targetedSearchRuns[0]?.summary || null,
    },
    source_inventory_counts: {
      registered: sourceEvidence.length,
      daily_enabled: sourceEvidence.filter((source) => source.daily_enabled).length,
      outside_daily_scope: sourceEvidence.filter((source) => !source.daily_enabled).length,
      with_collection_evidence: sourceEvidence.filter((source) =>
        ["collection_receipt_exists", "baseline_receipt_exists"].includes(
          source.development_status,
        ),
      ).length,
      registered_only: sourceEvidence.filter(
        (source) => source.development_status === "registered_only",
      ).length,
      unclassified_kind: sourceEvidence.filter((source) => source.kind === "미분류").length,
    },
    approvals_reconciliation: backlog,
    drive_approval_reconciliation: driveReconciliation,
    candidate_source_evidence_review: candidateEvidenceReview,
    historical_source_reconciliation: historicalSourceReconciliation,
    historical_source_adjudications: historicalSourceAdjudications,
    candidate_source_alternative_resolutions: sourceAlternativeResolutions,
    supplemental_coverage: supplementalCoverage,
    intake_ontology_audit: intakeOntology,
    existing_briefing_audit: {
      completed_runs: legacyAudit.completed_runs,
      target_runs: 7,
      ready: legacyAudit.first_seven_ready,
      rejected: legacyAudit.rejected,
      runs: legacyAudit.runs,
    },
    local_ai_shadow_operations: {
      completed_runs: filesUnder(path.join(absoluteRoot, "evaluation/shadow"), ".json").length,
      target_runs: 7,
      evaluation_cases: auditEvaluationCases(absoluteRoot),
      latest_ontology_snapshot: latestOntology
        ? {
            path: path.relative(repo, latestOntology.file),
            schema: latestOntology.graph.schema,
            events: latestOntology.graph.nodes?.filter((node) => node.type === "Event").length || 0,
            claims: latestOntology.graph.nodes?.filter((node) => node.type === "Claim").length || 0,
            source_versions:
              latestOntology.graph.nodes?.filter((node) => node.type === "SourceVersion").length ||
              0,
          }
        : null,
    },
  }
}

const htmlEscape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  )

export function renderDeliveryStatusHTML(status) {
  const snapshot = status.current_snapshot || {}
  const review = snapshot.review_status || {}
  const rows = status.sources
    .map((source) => {
      const sourceLink = source.url
        ? `<a href='${htmlEscape(source.url)}'>${htmlEscape(source.name)}</a>`
        : htmlEscape(source.name)
      return `<tr><td>${sourceLink}<small>${htmlEscape(source.id)}</small></td><td>${htmlEscape(source.verification)} · ${htmlEscape(source.method)}</td><td>${htmlEscape(source.sectors.join(", ") || "미분류")}</td><td>${htmlEscape(source.region)} · ${htmlEscape(source.axis)}</td><td>${htmlEscape(source.kind)} · ${htmlEscape(source.language)}</td><td>${source.daily_enabled ? "활성" : "비활성"}<small>${htmlEscape(source.baseline_run || "기준선 없음")}</small></td><td>${htmlEscape(source.development_status)}</td><td>${htmlEscape(source.last_run?.status || "미실행")}${source.last_run?.reason ? `<small>${htmlEscape(source.last_run.reason)}</small>` : ""}</td><td>${htmlEscape(source.latest_targeted_search?.status || "—")}<small>${htmlEscape(source.latest_targeted_search?.run_id || "")}${source.latest_targeted_search ? ` · 결과 ${source.latest_targeted_search.result_count} · 후보 ${source.latest_targeted_search.candidate_count}` : ""}</small></td><td>${htmlEscape(source.latest_targeted_scan?.status || "—")}<small>${htmlEscape(source.latest_targeted_scan?.run_id || "")}${source.latest_targeted_scan?.reason ? " · " + htmlEscape(source.latest_targeted_scan.reason) : ""}</small></td></tr>`
    })
    .join("")
  const cards = [
    [
      "전체 완료 기준",
      `${status.overall_completion.percent ?? "—"}% · ${status.overall_completion.numerator}/${status.overall_completion.denominator}`,
    ],
    ["등록 경로", status.scope.total_registered_routes],
    ["일일 활성 경로", status.scope.enabled_daily_routes],
    ["후보 원장", status.approvals_reconciliation.counts.total || 0],
    ["승인 연결", status.approvals_reconciliation.counts.approval_receipt_linked || 0],
    [
      "설정 프로필",
      `${snapshot.acquisition_profiles || 0} 수집 · ${snapshot.article_profiles || 0} 기사`,
    ],
    [
      "후보 검토 현황",
      `검증 ${review.verified || 0} · 보류 ${review.deferred || 0} · 기각 ${review.rejected || 0} · 미검토 ${review.unreviewed || 0}`,
    ],
    [
      "Drive 사건 대조",
      status.drive_approval_reconciliation?.status === "reconciled_read_only"
        ? `${status.drive_approval_reconciliation.candidate_count}건 · ${status.drive_approval_reconciliation.classification_counts.new_event_identity_review || 0}건 검토`
        : "기록 없음",
    ],
    [
      "원문 근거 확인",
      status.candidate_source_evidence_review?.status === "source_evidence_reviewed"
        ? `${status.candidate_source_evidence_review.candidates_with_source_attempts}/${status.candidate_source_evidence_review.candidate_count}후보 · ${status.candidate_source_evidence_review.source_attempt_count}영수증`
        : "기록 없음",
    ],
    [
      "과거 원문 연결",
      status.historical_source_reconciliation?.status === "historical_sources_reconciled_read_only"
        ? `${status.historical_source_reconciliation.candidates_with_historical_sources}/${status.historical_source_reconciliation.candidate_count}후보 · ${status.historical_source_reconciliation.historical_source_version_count}판본`
        : "기록 없음",
    ],
    [
      "대체 출처 판정",
      status.candidate_source_alternative_resolutions?.status === "read_only"
        ? `${status.candidate_source_alternative_resolutions.receipt_count}건 · same-event ${status.candidate_source_alternative_resolutions.decision_counts.same_event || 0}`
        : status.candidate_source_alternative_resolutions?.status === "no_receipts"
          ? "기록 없음"
          : `${status.candidate_source_alternative_resolutions?.receipt_count || 0}건 · 무결성 확인 필요`,
    ],
    ["기존 발행 감사", `${status.existing_briefing_audit.completed_runs}/7`],
    ["로컬 비교 운영", `${status.local_ai_shadow_operations.completed_runs}/7`],
    [
      "독립 수집 재개",
      `${status.supplemental_coverage?.receipt_count || 0}건 · 후보 ${status.supplemental_coverage?.unique_candidate_count || 0}`,
    ],
    [
      "평가 원문 세트",
      `${status.local_ai_shadow_operations.evaluation_cases?.unique_actual_by_split?.development || 0}/40 개발 · ${status.local_ai_shadow_operations.evaluation_cases?.unique_actual_by_split?.heldout || 0}/20 보류`,
    ],
  ]
    .map(
      ([label, value]) =>
        `<article><span>${htmlEscape(label)}</span><strong>${htmlEscape(value)}</strong></article>`,
    )
    .join("")
  const grid = (status.latest_complete_coverage?.grid || [])
    .map(
      (cell) =>
        `<tr><td>${htmlEscape(cell.sector)}</td><td>${htmlEscape(cell.region)}</td><td>${htmlEscape(cell.axis)}</td><td>${htmlEscape(cell.status)}</td><td>${htmlEscape(cell.routes.join(", ") || "—")}</td></tr>`,
    )
    .join("")
  const planRows = status.overall_completion.workstreams
    .filter((row) => row.required)
    .map(
      (row) =>
        `<tr><td>${htmlEscape(row.id)}</td><td>${htmlEscape(row.status)}</td><td>${htmlEscape(row.evidence)}</td><td>${htmlEscape(row.next)}</td></tr>`,
    )
    .join("")
  const latest = status.latest_daily_run
  const integrated = status.current_integrated_evidence
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>수집·온톨로지 개발 현황</title><style>
    :root{color-scheme:dark;--bg:#10151b;--panel:#171f28;--line:#2b3743;--muted:#9eacb9;--text:#e8edf2;--accent:#79c8b0}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1280px;margin:auto;padding:32px 22px 70px}h1{font-size:28px;margin:4px 0}h2{font-size:19px;margin:30px 0 12px}p,.muted,small{color:var(--muted)}.top{display:flex;justify-content:space-between;gap:20px;align-items:start}.stamp{font-size:12px;color:var(--muted)}.cards{display:grid;grid-template-columns:repeat(6,minmax(110px,1fr));gap:10px;margin:24px 0}.cards article,.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:15px}.cards span{display:block;color:var(--muted);font-size:12px}.cards strong{display:block;font-size:25px;margin-top:7px}.tabs{display:flex;gap:8px;border-bottom:1px solid var(--line)}button{border:1px solid var(--line);border-radius:8px 8px 0 0;background:var(--panel);color:var(--text);padding:10px 14px;cursor:pointer}button[aria-selected=true]{border-color:var(--accent);color:var(--accent)}section[hidden]{display:none}.tablewrap{overflow:auto;border:1px solid var(--line);border-radius:10px}table{border-collapse:collapse;width:100%;min-width:760px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:10px 12px}th{color:var(--muted);font-weight:500;position:sticky;top:0;background:var(--panel)}td small{display:block;font-size:11px}.status{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.pill{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:3px 8px;margin:3px;color:var(--accent)}pre{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--muted)}@media(max-width:850px){.cards{grid-template-columns:repeat(3,1fr)}.status{grid-template-columns:1fr}}@media(max-width:480px){main{padding:22px 14px}.cards{grid-template-columns:repeat(2,1fr)}h1{font-size:23px}.tabs{overflow:auto}button{white-space:nowrap}}
    </style><main><div class="top"><div><h1>수집·온톨로지 개발 현황</h1><div class="muted">비공개 로컬 운영 현황 · 독자용 뉴스 화면과 분리</div></div><div class="stamp">계획 기준 ${htmlEscape(status.overall_completion.plan_as_of || "확인 불가")} · 생성 ${htmlEscape(status.generated_at)}</div></div><div class="cards">${cards}</div><nav class="tabs" role="tablist"><button role="tab" aria-selected="true" aria-controls="overview" id="tab-overview">전체</button><button role="tab" aria-selected="false" aria-controls="source" id="tab-source">출처 개발</button><button role="tab" aria-selected="false" aria-controls="coverage" id="tab-coverage">조사 범위</button><button role="tab" aria-selected="false" aria-controls="pipeline" id="tab-pipeline">승인·발행</button></nav>
    <section role="tabpanel" id="overview" aria-labelledby="tab-overview"><h2>필수 작업 ${status.overall_completion.numerator}/${status.overall_completion.denominator} 완료 (${status.overall_completion.percent ?? "—"}%)</h2><p>부분 진행 ${status.overall_completion.partial ?? "—"}개 · 미착수 ${status.overall_completion.not_started ?? "—"}개. WBS는 전체 완료로 닫힐 때만 분자에 반영합니다.</p><div class="status"><article class="panel"><strong>현재 버전 통합 수집</strong><p>${htmlEscape(integrated.status)}</p><small>${htmlEscape(integrated.run_id || "완료 영수증 없음")} · ${integrated.route_count || 0}개 경로 / ${integrated.window_count || 0}개 기간 창</small></article><article class="panel"><strong>최근 일일 수집</strong><p>${htmlEscape(latest?.status || "기록 없음")}</p><small>${htmlEscape(latest?.run_id || "")} · ${latest?.routes || 0}개 경로 / ${latest?.windows || 0}개 창 · 실패 큐 ${latest?.retry_queue?.length || 0}개</small></article><article class="panel"><strong>조사 대상 32칸</strong><p>${htmlEscape(
      Object.entries(latest?.coverage || {})
        .map(([key, value]) => `${key} ${value}`)
        .join(" · ") || "기록 없음",
    )}</p></article></div><h2>계획 작업 상태</h2><div class="tablewrap"><table><thead><tr><th>작업 ID</th><th>상태</th><th>현재 증거</th><th>다음 완료 항목</th></tr></thead><tbody>${planRows}</tbody></table></div></section>
    <section role="tabpanel" id="source" aria-labelledby="tab-source" hidden><h2>출처 등록부 (${status.source_inventory_counts.registered})</h2><p>일일 활성 ${status.source_inventory_counts.daily_enabled}개 · 일일 범위 밖 ${status.source_inventory_counts.outside_daily_scope}개 · 수집 영수증/기준선 보유 ${status.source_inventory_counts.with_collection_evidence}개 · 등록만 된 출처 ${status.source_inventory_counts.registered_only}개 · 유형 미분류 ${status.source_inventory_counts.unclassified_kind}개. 기본 출처 등록과 날짜 경계를 확인한 수집 영수증을 구분합니다.</p><div class="tablewrap"><table><thead><tr><th>출처</th><th>등록 검증·방식</th><th>분야</th><th>지역·축</th><th>유형·언어</th><th>일일 활성·기준선</th><th>개발 상태</th><th>최근 일일 결과</th><th>최근 보완 검색</th><th>최근 개별 검증</th></tr></thead><tbody>${rows}</tbody></table></div></section>
    <section role="tabpanel" id="coverage" aria-labelledby="tab-coverage" hidden><h2>최근 완료 수집의 조사 범위</h2><p>${htmlEscape(status.latest_complete_coverage?.run_id || "완료된 통합 범위 기록 없음")}</p><div class="tablewrap"><table><thead><tr><th>분야</th><th>지역</th><th>축</th><th>상태</th><th>경로</th></tr></thead><tbody>${grid}</tbody></table></div><h2>일일 실행시간 계측</h2><p>실제 receipt에 저장된 단계 시간만 집계합니다. 기존 미계측 receipt는 시간을 추정하지 않습니다.</p><pre>${htmlEscape(JSON.stringify(status.latest_daily_run?.timing || null, null, 2))}</pre><h2>후보별 모델 추론시간</h2><p>정확한 일일 실행 ID가 source selection에 기록된 예산 receipt만 합산합니다. 원문·프롬프트·모델 응답은 표시하지 않습니다.</p><pre>${htmlEscape(JSON.stringify(status.latest_daily_run?.model_timing || null, null, 2))}</pre><h2>일일 실패·재시도 큐</h2><p>창당 자동 시도는 최대 ${status.latest_daily_run?.retry_policy?.max_attempts_per_window || "—"}회입니다. blocked 상태는 새 출처 관측을 얻을 때까지 자동 재요청하지 않습니다.</p><pre>${htmlEscape(JSON.stringify({ policy: status.latest_daily_run?.retry_policy || null, queue: status.latest_daily_run?.retry_queue || [] }, null, 2))}</pre><h2>독립 완료 스캔 재개</h2><p>저장 원문·파싱·후보와 coverage가 일치하는 재조정 영수증만 집계합니다. 후보 장부 병합은 기사 승인·발행을 뜻하지 않습니다.</p><pre>${htmlEscape(JSON.stringify(status.supplemental_coverage, null, 2))}</pre><h2>보완 검색 영수증</h2><p>일일 수집 범위와 분리한 등록 출처 질의 결과입니다. 검색 결과는 원문 수집·기사 검증·후보 승인으로 계산하지 않습니다.</p><pre>${htmlEscape(JSON.stringify(status.targeted_search, null, 2))}</pre></section>
    <section role="tabpanel" id="pipeline" aria-labelledby="tab-pipeline" hidden><h2>후보 승인 대조</h2><p>아래 집계는 원장 읽기 결과입니다. 자동 승인이나 백로그 변경을 하지 않았습니다.</p><pre>${htmlEscape(JSON.stringify(status.approvals_reconciliation.counts, null, 2))}</pre><p>원장 SHA-256: ${htmlEscape(status.approvals_reconciliation.source_sha256)}</p><h2>Drive 작성본과 일일 후보 대조</h2><p>고정 사건 ID·원문 URL 대조의 비공개 receipt 집계입니다. 사건 승인·병합·Drive 쓰기나 공개 완료로 계산하지 않습니다.</p><pre>${htmlEscape(JSON.stringify(status.drive_approval_reconciliation, null, 2))}</pre><h2>저장 원문 receipt 검증</h2><p>후보 판본·parse·내용 지문과 저장 원문의 정확한 URL을 대조한 집계입니다. 근거 검증은 기사 사실 승인이나 공개 허가가 아닙니다.</p><pre>${htmlEscape(JSON.stringify(status.candidate_source_evidence_review, null, 2))}</pre><h2>저장 과거 원문 연결</h2><p>고정된 원문 URL과 판본의 비공개 수집 이력을 대조합니다. 원문 bytes·parse 무결성 확인은 현재 후보 승인이나 같은 사건 판정이 아닙니다.</p><pre>${htmlEscape(JSON.stringify(status.historical_source_reconciliation, null, 2))}</pre><h2>과거 parse 판정</h2><p>원문 bytes·후보 identity와 정확히 결속된 비공개 판정만 표시합니다. 원본 reconciliation 수치나 공개 상태를 소급 변경하지 않습니다.</p><pre>${htmlEscape(JSON.stringify(status.historical_source_adjudications, null, 2))}</pre><h2>후보 원문 온톨로지</h2><p>원문 URL·본문 지문·제목과 날짜의 관계를 읽기 전용으로 계산합니다. 관계는 검토 신호이며 사건 병합이나 발행 판정이 아닙니다.</p><pre>${htmlEscape(JSON.stringify(status.intake_ontology_audit, null, 2))}</pre><h2>평가 원문 세트</h2><p>원문·기준안의 무결성을 확인한 읽기 전용 집계입니다. 같은 고정 원문을 기준안 버전으로 중복 계산하지 않으며 개발/보류 수와 언어·분야 공백을 추적합니다.</p><pre>${htmlEscape(JSON.stringify(status.local_ai_shadow_operations.evaluation_cases, null, 2))}</pre><h2>발행·운영 증거</h2><pre>${htmlEscape(JSON.stringify({ existing_briefing_audit: status.existing_briefing_audit, local_ai_shadow_operations: status.local_ai_shadow_operations, latest_daily_run: status.latest_daily_run }, null, 2))}</pre></section>
    </main><script>const tabs=[...document.querySelectorAll('[role=tab]')];for(const [i,tab] of tabs.entries()){tab.addEventListener('click',()=>{tabs.forEach((t,j)=>{const active=i===j;t.setAttribute('aria-selected',String(active));document.getElementById(t.getAttribute('aria-controls')).hidden=!active});history.replaceState(null,'','#'+tab.id)});tab.addEventListener('keydown',e=>{let j=i;if(e.key==='ArrowRight')j=(i+1)%tabs.length;else if(e.key==='ArrowLeft')j=(i+tabs.length-1)%tabs.length;else return;e.preventDefault();tabs[j].focus();tabs[j].click()})}</script></html>`
}
