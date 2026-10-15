import fs from "node:fs"
import { createApprovalReceiptSnapshot } from "./approval-receipts.mjs"
import { loadExistingEditorialRevision } from "./existing-editorial-approval.mjs"
import path from "node:path"
import { sha256 } from "./contracts.mjs"
import { dailyScan, DAILY_CONFIG } from "./daily-scan.mjs"
import { assertProcessingRecoveryRequest } from "./processing-reuse.mjs"
import { processDailyQueue } from "./daily-processing-queue.mjs"
import { advanceEventWorkflow } from "./event-workflow.mjs"
import { advanceRoundWorkflow } from "./round-workflow.mjs"
import { saveCollectionReport } from "./collection-report.mjs"
import { freezeEdition } from "./event-pipeline.mjs"
import { fileURLToPath } from "node:url"
import { processDailyQueueEditorial } from "./daily-queue-editorial.mjs"
import {
  ontologyKnowledgeIndex,
  ontologyImpact,
  prepareKnowledgeReviewSelections,
  loadKnowledgeConnectionApproval,
} from "./ontology-knowledge.mjs"
import { prepareTrendReviewRuns } from "./ontology-trends.mjs"
import { assertDeepReviewDecision } from "./deep-dive.mjs"
import { assertCompanyIdentityReview } from "./knowledge-links.mjs"
import { prepareKnowledgeJobs, processKnowledgeQueue } from "./knowledge-queue.mjs"
import { readBacklog } from "../research-window.mjs"
import {
  loadCurrentCandidateApproval,
  resolveFrozenCandidateApproval,
} from "./candidate-approval.mjs"
import {
  extendEvidenceOntology,
  loadApprovedOntologyInput,
  projectEvidenceOntology,
} from "./ontology.mjs"
import { loadShadowHandoffBasis } from "./shadow-collection-basis.mjs"
import {
  atomicCreate,
  atomicWrite,
  readJSON,
  safePath,
  withLock,
  withGardenOperationLock,
} from "./run-state.mjs"

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const reference = (root, file) => ({
  path: file,
  sha256: sha256(fs.readFileSync(safePath(root, file))),
})
const checked = (root, ref) => {
  if (!ref || reference(root, ref.path).sha256 !== ref.sha256)
    throw Error("Core checkpoint reference changed")
  return readJSON(root, ref.path)
}
const count = (rows) =>
  Object.fromEntries(
    [...new Set(rows.map((row) => row.status))].map((status) => [
      status,
      rows.filter((row) => row.status === status).length,
    ]),
  )

// Only native source-revision receipts select the formerly approved version.
// A request for supplementary reading is not a correction of an old source.
export function sourceRevisionImpactRequests(
  root,
  rows,
  { vault = "vault", inputLoader = loadApprovedOntologyInput } = {},
) {
  return rows
    .filter((row) => row.status === "source_review" && row.source_revision)
    .map((row) => {
      const receipt = checked(root, row.native_receipt)
      const prior = receipt.prior_approval,
        candidate = receipt.candidate
      if (
        receipt.schema !== "research-queue-source-revision/v1" ||
        receipt.candidate_key !== row.candidate_key ||
        !candidate ||
        receipt.candidate_sha256 !== row.source_revision.candidate_sha256 ||
        receipt.candidate_sha256 !== sha256(JSON.stringify(candidate)) ||
        prior?.decision !== "same_approved_event" ||
        !candidate?.source_revision_alert ||
        candidate.approval?.approved_run !== prior.approved_run ||
        candidate.event_id !== prior.event_id ||
        candidate.approval?.article_sha256 !== prior.article_sha256 ||
        candidate.source_revision_alert.reviewed_source_version_id !==
          candidate.approval.source_version_id ||
        !receipt.current_source_files ||
        !Object.keys(receipt.current_source_files).length
      )
        throw Error("Exact native source revision impact receipt required")
      for (const [file, hash] of Object.entries(receipt.current_source_files))
        if (reference(root, file).sha256 !== hash)
          throw Error("Source revision observation changed")
      const input = inputLoader(root, prior.approved_run, { vault })
      if (
        !same(input.file_hashes, prior.approved_files) ||
        input.article.event_id !== prior.event_id ||
        sha256(JSON.stringify(input.article)) !== prior.article_sha256 ||
        !input.documents.some(
          (doc) => doc.source_version_id === candidate.approval.source_version_id,
        )
      )
        throw Error("Source revision impact differs from its native prior approval")
      return {
        candidate_key: row.candidate_key,
        source_revision_receipt: row.native_receipt,
        query: { source_version_id: candidate.approval.source_version_id },
      }
    })
}

// Coordinates native stages; no new collection, review or publication authority.
export async function advanceDailyCore({
  root,
  runId,
  round = false,
  collectionReportReference,
  editionReference,
  eventPlanReference,
  curationReference,
  requireCuration = false,
  eventFactReviews = {},
  eventEditorialReviews = {},
  eventRevisionReviews = {},
  eventCompletenessReviews = {},
  eventCoverageReviews = {},
  eventRetryGroups = [],
  eventNoteReviewRuns = [],
  connectionReviewRun,
  eventProposals = false,
  eventProposalOffset = 0,
  dailyRunId,
  queueRun,
  collectionBasis,
  collect = false,
  collectionMaxWindows,
  collectionTimeBudgetMs,
  editorialOnly = false,
  configFile = DAILY_CONFIG,
  policyFile = "data/research-model-policy.json",
  vault = "vault",
  backlogFile = ".local/research/candidate-backlog.json",
  driveSnapshotFile,
  ontologyBase,
  companyReviewFile,
  limit,
  maxItems = 4,
  timeBudgetMs = 1_800_000,
  maxModelCalls,
  retryFailed = false,
  processingRecoveries,
  sourceReviewFiles,
  reviewFiles = {},
  deepReviewFiles = {},
  editorialReviewFiles = {},
  knowledgeInputFiles = {},
  knowledgeSelections = [],
  knowledgeSelectionsFile,
  trendReviewRuns = [],
  execute = false,
  clock = Date.now,
  collector = (options) => withGardenOperationLock(options.root, () => dailyScan(options)),
  queueProcessor = processDailyQueue,
  editorialProcessor = processDailyQueueEditorial,
  knowledgeProcessor = processKnowledgeQueue,
  basisLoader = loadShadowHandoffBasis,
}) {
  if (
    !/^[A-Za-z0-9_-]{1,50}$/.test(runId || "") ||
    !Number.isSafeInteger(maxItems) ||
    maxItems < 1 ||
    maxItems > 40 ||
    !Number.isSafeInteger(timeBudgetMs) ||
    timeBudgetMs < 1 ||
    timeBudgetMs > 3600000
  )
    throw Error("Safe core ID and bounded event execution required")
  if (
    connectionReviewRun !== undefined &&
    (typeof connectionReviewRun !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(connectionReviewRun))
  )
    throw Error("Exact knowledge connection review run required")
  if (
    !Number.isSafeInteger(eventProposalOffset) ||
    eventProposalOffset < 0 ||
    eventProposalOffset > 1000000
  )
    throw Error("Bounded event proposal offset required")
  const boundedCollection =
    collectionMaxWindows !== undefined || collectionTimeBudgetMs !== undefined
  if (boundedCollection && (!collect || !execute))
    throw Error("Collection limits require explicit collection execution")
  for (const value of [collectionMaxWindows, collectionTimeBudgetMs])
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1))
      throw Error("Collection limits must be positive safe integers")
  if (driveSnapshotFile && !collect) throw Error("Drive snapshot requires explicit collection")
  if (collect && editorialOnly) throw Error("Editorial-only continuation cannot collect sources")
  const legacyInput = readJSON(root, `runs/${runId}/daily-core/input.json`)
  if (round || collectionReportReference) {
    if (queueRun || collectionBasis || editorialOnly || legacyInput)
      throw Error("Round coordinator requires event inputs without a legacy queue")
    if (
      [reviewFiles, deepReviewFiles, editorialReviewFiles, knowledgeInputFiles].some(
        (map) => Object.keys(map || {}).length,
      ) ||
      knowledgeSelections.length ||
      companyReviewFile ||
      processingRecoveries ||
      sourceReviewFiles ||
      driveSnapshotFile
    )
      throw Error(
        "Round coordinator requires event review mappings and native knowledge selections",
      )
    const repo = fileURLToPath(new URL("../../", import.meta.url))
    return advanceRoundWorkflow(
      {
        repo,
        root: path.resolve(root),
        vault: path.resolve(vault),
        policy: path.resolve(policyFile),
        backlog: path.resolve(backlogFile),
      },
      {
        run_id: runId,
        round: true,
        ...(editionReference
          ? { edition_path: editionReference.path, edition_sha256: editionReference.sha256 }
          : collectionReportReference
            ? {
                report_path: collectionReportReference.path,
                report_sha256: collectionReportReference.sha256,
              }
            : dailyRunId
              ? { daily_run: dailyRunId }
              : {}),
        ...(eventPlanReference
          ? { plan_path: eventPlanReference.path, plan_sha256: eventPlanReference.sha256 }
          : {}),
        ...(curationReference
          ? { curation_path: curationReference.path, curation_sha256: curationReference.sha256 }
          : {}),
        require_curation: requireCuration,
        execute,
        collect,
        propose: eventProposals,
        offset: eventProposalOffset,
        max_items: maxItems,
        time_budget_ms: timeBudgetMs,
        max_model_calls: maxModelCalls,
        retry_failed: retryFailed,
        collection_max_windows: collectionMaxWindows,
        collection_time_budget_ms: collectionTimeBudgetMs,
        collection_config_file: configFile,
        fact_reviews: eventFactReviews,
        editorial_reviews: eventEditorialReviews,
        revision_reviews: eventRevisionReviews,
        completeness_reviews: eventCompletenessReviews,
        coverage_reviews: eventCoverageReviews,
        retry_groups: eventRetryGroups,
        ...(eventNoteReviewRuns.length ? { note_review_runs: eventNoteReviewRuns } : {}),
        connection_review_run: connectionReviewRun,
        knowledge_selections_file: knowledgeSelectionsFile,
        ...(trendReviewRuns.length ? { trend_review_runs: trendReviewRuns } : {}),
        ...(ontologyBase
          ? { ontology_path: ontologyBase, ontology_sha256: reference(root, ontologyBase).sha256 }
          : {}),
      },
      { clock },
    )
  }
  if (!editionReference && !queueRun && !collectionBasis && !editorialOnly && !legacyInput) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(dailyRunId || ""))
      throw Error("Event collection requires a safe daily run")
    if (collect) {
      if (!execute)
        return {
          status: "collection_plan",
          run_id: runId,
          article_writes: 0,
          candidate_published: false,
        }
      await collector({
        root,
        runId: dailyRunId,
        configFile,
        vault,
        backlogFile,
        driveSnapshotFile,
        mode: "execute",
        maxWindows: collectionMaxWindows,
        timeBudgetMs: collectionTimeBudgetMs,
      })
    }
    const report = await saveCollectionReport({ root, runId: dailyRunId })
    if (report.counts.pending_windows)
      return {
        status: "collection_pending",
        run_id: runId,
        collection: report,
        article_writes: 0,
        candidate_published: false,
      }
    const frozen = await freezeEdition(
      { root },
      {
        run_id: "ed-" + sha256(JSON.stringify([dailyRunId, report.sha256])).slice(0, 40),
        report_path: report.path,
        report_sha256: report.sha256,
      },
    )
    editionReference = { path: frozen.path, sha256: frozen.sha256 }
    eventProposals = true
    collect = false
  }
  if (editionReference) {
    if (collect || editorialOnly || queueRun || collectionBasis)
      throw Error("Event core requires its frozen edition, without a legacy candidate queue")
    if (
      [reviewFiles, deepReviewFiles, editorialReviewFiles, knowledgeInputFiles].some(
        (map) => Object.keys(map || {}).length,
      ) ||
      knowledgeSelections.length ||
      trendReviewRuns.length ||
      companyReviewFile ||
      processingRecoveries ||
      sourceReviewFiles
    )
      throw Error(
        "Legacy candidate reviews require an explicit legacy queue; use event review mappings for this edition",
      )
    const ontologyReference = ontologyBase ? reference(root, ontologyBase) : null
    const repo = fileURLToPath(new URL("../../", import.meta.url))
    return advanceEventWorkflow(
      {
        repo,
        root: path.resolve(root),
        vault: path.resolve(vault),
        policy: path.resolve(policyFile),
        backlog: path.resolve(backlogFile),
      },
      {
        run_id: runId,
        edition_path: editionReference.path,
        edition_sha256: editionReference.sha256,
        ...(eventPlanReference
          ? { plan_path: eventPlanReference.path, plan_sha256: eventPlanReference.sha256 }
          : {}),
        fact_reviews: eventFactReviews,
        editorial_reviews: eventEditorialReviews,
        revision_reviews: eventRevisionReviews,
        retry_groups: eventRetryGroups,
        completeness_reviews: eventCompletenessReviews,
        coverage_reviews: eventCoverageReviews,
        note_review_runs: eventNoteReviewRuns,
        ...(connectionReviewRun !== undefined
          ? { connection_review_run: connectionReviewRun }
          : {}),
        propose: eventProposals,
        offset: eventProposalOffset,
        execute,
        max_items: maxItems,
        time_budget_ms: timeBudgetMs,
        max_model_calls: maxModelCalls,
        retry_failed: retryFailed,
        ...(ontologyReference
          ? { ontology_path: ontologyReference.path, ontology_sha256: ontologyReference.sha256 }
          : {}),
      },
      { clock },
    )
  }
  if (
    !/^[A-Za-z0-9_-]{1,50}$/.test(runId || "") ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(dailyRunId || "") ||
    !Number.isSafeInteger(maxItems) ||
    maxItems < 1 ||
    maxItems > 40 ||
    !Number.isSafeInteger(timeBudgetMs) ||
    timeBudgetMs < 1 ||
    timeBudgetMs > 3_600_000
  )
    throw Error("Safe core/daily IDs and bounded execution required")
  root = path.resolve(root)
  vault = path.resolve(vault)
  backlogFile = path.resolve(backlogFile)
  const companyReviewBytes =
    companyReviewFile === undefined ? null : fs.readFileSync(companyReviewFile)
  const companyReview =
    companyReviewBytes === null
      ? null
      : assertCompanyIdentityReview(JSON.parse(companyReviewBytes.toString("utf8")))
  if (
    !knowledgeInputFiles ||
    typeof knowledgeInputFiles !== "object" ||
    Array.isArray(knowledgeInputFiles)
  )
    throw Error("Core knowledge input mapping required")
  const knowledgeJobs = Object.keys(knowledgeInputFiles).length
    ? prepareKnowledgeJobs(root, knowledgeInputFiles, { vault })
    : []
  const trendReviews = prepareTrendReviewRuns(root, trendReviewRuns, { vault })
  const knowledgeReviews = prepareKnowledgeReviewSelections(root, knowledgeSelections, { vault })
  const connectionApproval =
    connectionReviewRun === undefined
      ? null
      : loadKnowledgeConnectionApproval(root, connectionReviewRun, { vault })
  // An unreadable review must not start source requests or expensive model work.
  for (const map of [reviewFiles, deepReviewFiles, editorialReviewFiles]) {
    if (!map || typeof map !== "object" || Array.isArray(map))
      throw Error("Core review mappings required")
    for (const file of Object.values(map)) {
      if (typeof file !== "string" || !file.trim()) throw Error("Core review file paths required")
      const decision = JSON.parse(fs.readFileSync(file, "utf8"))
      if (map === deepReviewFiles) assertDeepReviewDecision(decision)
    }
  }
  if (sourceReviewFiles !== undefined) {
    if (
      !sourceReviewFiles ||
      typeof sourceReviewFiles !== "object" ||
      Array.isArray(sourceReviewFiles)
    )
      throw Error("Core source review mapping required")
    for (const file of Object.values(sourceReviewFiles))
      JSON.parse(fs.readFileSync(safePath(root, file), "utf8"))
  }
  if (processingRecoveries !== undefined) {
    if (
      !processingRecoveries ||
      typeof processingRecoveries !== "object" ||
      Array.isArray(processingRecoveries)
    )
      throw Error("Core processing recovery mapping required")
    for (const request of Object.values(processingRecoveries))
      assertProcessingRecoveryRequest(request)
  }
  return withLock(root, "daily-core-" + runId, async () => {
    const base = `runs/${runId}/daily-core/`,
      previous = readJSON(root, base + "input.json")
    queueRun = queueRun || previous?.queue_run || `${runId}-queue`
    if (!/^[A-Za-z0-9_-]{1,70}$/.test(queueRun) || queueRun === dailyRunId)
      throw Error("Distinct safe core queue required")
    const request = {
      schema: "research-daily-core-request/v1",
      run_id: runId,
      daily_run: dailyRunId,
      queue_run: queueRun,
      config_file: path.resolve(configFile),
      config_sha256: sha256(fs.readFileSync(configFile)),
      policy_file: path.resolve(policyFile),
      policy_sha256: sha256(fs.readFileSync(policyFile)),
      vault,
      backlog_file: backlogFile,
      implementation_sha256: sha256(fs.readFileSync(new URL(import.meta.url))),
      approval_lookup_sha256: sha256(
        fs.readFileSync(new URL("./approval-receipts.mjs", import.meta.url)),
      ),
      knowledge_projector_sha256: sha256(
        fs.readFileSync(new URL("./ontology-knowledge.mjs", import.meta.url)),
      ),
      ontology_sha256: sha256(fs.readFileSync(new URL("./ontology.mjs", import.meta.url))),
      ...(trendReviews.length
        ? {
            trend_reviews: trendReviews,
            trend_projector_sha256: sha256(
              fs.readFileSync(new URL("./ontology-trends.mjs", import.meta.url)),
            ),
            trend_validator_sha256: sha256(
              fs.readFileSync(new URL("../trends.mjs", import.meta.url)),
            ),
          }
        : {}),
      ...(knowledgeJobs.length
        ? {
            knowledge_jobs: knowledgeJobs,
            knowledge_processor_sha256: sha256(
              fs.readFileSync(new URL("./knowledge-queue.mjs", import.meta.url)),
            ),
          }
        : {}),
      ...(knowledgeReviews.length ? { knowledge_reviews: knowledgeReviews } : {}),
      ...(connectionApproval
        ? { connection_review: { run: connectionReviewRun, files: connectionApproval.files } }
        : {}),
      ...(companyReviewBytes
        ? {
            company_review: {
              path: path.resolve(companyReviewFile),
              sha256: sha256(companyReviewBytes),
            },
          }
        : {}),
    }
    const priorRequest = readJSON(root, base + "request.json")
    if (priorRequest && !same(priorRequest, request))
      throw Error("Core request changed; use a new run")
    if (!priorRequest) atomicCreate(root, base + "request.json", request)
    if (previous && previous.daily_run !== dailyRunId)
      throw Error("Core collection identity changed")
    const nativeQueueInput = readJSON(root, `runs/${queueRun}/daily-queue-input.json`)
    if (editorialOnly && !nativeQueueInput)
      throw Error("Editorial-only continuation requires an existing queue")
    const pointer = previous ? null : readJSON(root, `daily/runs/${dailyRunId}/shadow-basis.json`)
    let basis = previous?.collection_basis || nativeQueueInput?.collection_basis || pointer?.basis
    if (collectionBasis) {
      const supplied = reference(root, collectionBasis)
      if (basis && !same(basis, supplied)) throw Error("Core collection basis changed")
      basis = supplied
    }
    let collection = null
    if (!basis && collect) {
      if (previous) throw Error("Frozen core collection basis missing")
      const result = await collector({
        root,
        runId: dailyRunId,
        mode: execute ? "execute" : "plan-only",
        configFile,
        vault,
        backlogFile,
        driveSnapshotFile,
        ...(boundedCollection
          ? { maxWindows: collectionMaxWindows, timeBudgetMs: collectionTimeBudgetMs }
          : {}),
      })
      if (!execute)
        return {
          schema: "research-daily-core/v1",
          run_id: runId,
          status: "collection_planned",
          collection: result,
          candidate_published: false,
        }
      basis = result.shadow_collection_basis
      collection = result
    }
    if (!basis)
      throw Error(
        "Completed collection basis required; collect explicitly or resume the existing daily collection",
      )
    const frozen = basisLoader(root, basis)
    if (frozen.daily_run !== dailyRunId) throw Error("Core basis belongs to another collection")
    limit = limit ?? previous?.limit ?? nativeQueueInput?.limit ?? 40
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500)
      throw Error("Core queue limit from 1 to 500 required")
    const initialOntology = ontologyBase ? reference(root, ontologyBase) : previous?.ontology_base
    const input = {
      ...request,
      schema: "research-daily-core-input/v1",
      collection_basis: basis,
      limit,
      ...(initialOntology ? { ontology_base: initialOntology } : {}),
    }
    if (previous && !same(previous, input)) throw Error("Core inputs changed; use a new run")
    if (initialOntology) checked(root, initialOntology)
    if (!previous) atomicCreate(root, base + "input.json", input)
    const inputHash = sha256(JSON.stringify(input)),
      old = readJSON(root, base + "latest.json")
    if (old && old.input_sha256 !== inputHash) throw Error("Core checkpoint input changed")
    // Check saved native evidence before starting the next expensive stage.
    for (const batch of old?.editorial_batches || []) checked(root, batch.receipt)
    if (old?.evidence_ontology) checked(root, old.evidence_ontology)
    if (old?.knowledge_index) checked(root, old.knowledge_index)
    if (old?.knowledge_drafts) checked(root, old.knowledge_drafts)
    if (old?.source_revision_impacts) checked(root, old.source_revision_impacts)
    const started = clock(),
      remaining = () => Math.max(1, timeBudgetMs - (clock() - started))
    const persist = (status, extra = {}) => {
      const receipt = {
        schema: "research-daily-core/v1",
        run_id: runId,
        daily_run: dailyRunId,
        queue_run: queueRun,
        input_sha256: inputHash,
        status,
        collection_basis: basis,
        collection_reused: !collection,
        editorial_batches: old?.editorial_batches || [],
        ...(old?.editorial_counts ? { editorial_counts: old.editorial_counts } : {}),
        ...(old?.evidence_ontology ? { evidence_ontology: old.evidence_ontology } : {}),
        ...(old?.knowledge_index
          ? { knowledge_index: old.knowledge_index, knowledge_counts: old.knowledge_counts }
          : {}),
        candidate_published: false,
        new_regular_operation_counted: false,
        ...(old?.knowledge_drafts
          ? {
              knowledge_drafts: old.knowledge_drafts,
              knowledge_draft_counts: old.knowledge_draft_counts,
            }
          : {}),
        ...extra,
      }
      atomicWrite(root, base + "latest.json", receipt)
      return receipt
    }
    persist(execute ? "processing" : "planned")
    try {
      const queueOptions = {
        root,
        runId: queueRun,
        dailyRunId,
        collectionBasis: basis.path,
        policyFile,
        vault,
        backlogFile,
        limit,
        processingRecoveries,
        sourceReviewFiles,
        maxItems,
        timeBudgetMs: remaining(),
        execute: execute && !editorialOnly,
        readOnly: editorialOnly,
      }
      const requestedKeys = [
        ...Object.keys(reviewFiles),
        ...Object.keys(deepReviewFiles),
        ...Object.keys(editorialReviewFiles),
      ]
      if (requestedKeys.length) {
        const selection =
          nativeQueueInput || (await queueProcessor({ ...queueOptions, execute: false }))
        const allowed = new Set(
          selection.candidate_keys || selection.results.map((row) => row.candidate_key),
        )
        if (requestedKeys.some((key) => !allowed.has(key)))
          throw Error("Core review is outside its frozen queue")
      }
      // Finish explicitly reviewed work before another slow raw extraction can
      // exhaust the shared budget. This only schedules work; native editorial
      // gates still validate every review and source before writing/approval.
      const stoppedQueue = readJSON(root, `runs/${queueRun}/daily-queue.json`)
      const reviewFirst =
        execute &&
        !editorialOnly &&
        stoppedQueue?.results?.some(
          (row) => row.status === "processed" && requestedKeys.includes(row.candidate_key),
        )
      const queue = await queueProcessor({
        ...queueOptions,
        execute: queueOptions.execute && !reviewFirst,
      })
      let queueRef = reference(root, `runs/${queueRun}/daily-queue.json`)
      let nativeQueue = checked(root, queueRef)
      const assertStoppedQueue = (result) => {
        if (
          nativeQueue.run_id !== queueRun ||
          nativeQueue.daily_run !== dailyRunId ||
          !same(nativeQueue.results, result.results) ||
          nativeQueue.candidate_published !== false ||
          nativeQueue.status === "running"
        )
          throw Error("Core requires the exact stopped native queue")
      }
      assertStoppedQueue(queue)
      const allowed = new Set(nativeQueue.results.map((row) => row.candidate_key))
      for (const key of requestedKeys)
        if (!allowed.has(key)) throw Error("Core review is outside its frozen queue")
      const keys = nativeQueue.results
        .filter((row) => row.status === "processed")
        .map((row) => row.candidate_key)
      const batches = [],
        outcomes = []
      let graphRef = old?.evidence_ontology || initialOntology,
        handled = 0,
        yielded = false
      const resolvedApprovals = nativeQueue.results
        .filter((row) => row.status === "resolved" && row.resolution?.approved_run)
        .map((row) => ({ ...row }))
      const approvalSnapshot = createApprovalReceiptSnapshot(root)
      const revisionLoader = (sourceRoot, previous, current) =>
        loadExistingEditorialRevision(sourceRoot, previous, current, { approvalSnapshot })
      if (execute && resolvedApprovals.length) {
        const candidates = readBacklog(backlogFile)?.candidates
        const resolvedApprovalRuns = []
        for (const row of resolvedApprovals) {
          const matches = candidates?.filter((candidate) => candidate.key === row.candidate_key)
          if (matches?.length !== 1)
            throw Error("Core resolved approval differs from native candidate evidence")
          const continuation = resolveFrozenCandidateApproval(
            root,
            row.resolution,
            await loadCurrentCandidateApproval(root, matches[0], { vault, approvalSnapshot }),
            { vault, withHistory: true, approvalSnapshot },
          )
          row.resolution = continuation.current
          resolvedApprovalRuns.push(...continuation.approved_runs)
        }
        const approvedRuns = [...new Set(resolvedApprovalRuns)]
        const frozenRuns = [
          ...new Set(
            nativeQueue.results
              .filter((row) => row.status === "resolved" && row.resolution?.approved_run)
              .map((row) => row.resolution.approved_run),
          ),
        ]
        const baseGraph = graphRef
          ? checked(root, graphRef)
          : projectEvidenceOntology(
              frozenRuns.map((run) => loadApprovedOntologyInput(root, run, { vault })),
            )
        const superseded = new Set(baseGraph.revision_history?.map((r) => r.previous.run) || [])
        const graph = extendEvidenceOntology(
          root,
          baseGraph,
          approvedRuns.filter((run) => !superseded.has(run)),
          { vault, revisionLoader },
        )
        const graphHash = sha256(JSON.stringify(graph, null, 2) + "\n")
        if (!graphRef || graphRef.sha256 !== graphHash) {
          const graphPath = `ontology/${runId}-resolved-${sha256(JSON.stringify(approvedRuns)).slice(0, 16)}/graph.json`
          const previousGraph = readJSON(root, graphPath)
          if (previousGraph && !same(previousGraph, graph))
            throw Error("Resolved approval ontology changed")
          if (!previousGraph) atomicCreate(root, graphPath, graph)
          graphRef = reference(root, graphPath)
        }
      }
      const pick = (map, selected) =>
        Object.fromEntries(selected.filter((key) => map[key]).map((key) => [key, map[key]]))
      for (let offset = 0; offset < keys.length; offset += 40) {
        const selected = keys.slice(offset, offset + 40)
        const editorialRun = `${runId}-ed-${sha256(JSON.stringify(selected)).slice(0, 12)}`
        const priorBatch = old?.editorial_batches?.find((batch) => batch.run_id === editorialRun)
        if (execute && (handled >= maxItems || clock() - started >= timeBudgetMs)) {
          yielded = true
          if (priorBatch) {
            batches.push(priorBatch)
            outcomes.push(...checked(root, priorBatch.receipt).results)
          }
          continue
        }
        persist(execute ? "editorial" : "planned", {
          processing: queueRef,
          processing_counts: nativeQueue.counts,
        })
        const existingBatchInput = readJSON(root, `runs/${editorialRun}/queue-editorial/input.json`)
        const previousBatch = readJSON(root, `runs/${editorialRun}/queue-editorial/latest.json`)
        const editorial = await editorialProcessor({
          root,
          runId: editorialRun,
          queueRun,
          candidateKeys: selected,
          policyFile,
          vault,
          backlogFile,
          approvalSnapshot,
          execute,
          maxItems: Math.max(1, maxItems - handled),
          timeBudgetMs: remaining(),
          reviewFiles: pick(reviewFiles, selected),
          deepReviewFiles: pick(deepReviewFiles, selected),
          editorialReviewFiles: pick(editorialReviewFiles, selected),
          ontologyBase: existingBatchInput?.ontology_base?.path || graphRef?.path,
        })
        const ref = reference(root, `runs/${editorialRun}/queue-editorial/latest.json`),
          native = checked(root, ref)
        if (
          !same(editorial, native) ||
          native.run_id !== editorialRun ||
          native.candidate_published !== false
        )
          throw Error("Core editorial checkpoint differs")
        const batch = {
          run_id: editorialRun,
          candidate_keys: selected,
          receipt: ref,
          status: native.status,
          counts: native.counts,
        }
        batches.push(batch)
        outcomes.push(...native.results)
        handled += native.results.filter(
          (row) =>
            row.status !== "pending" &&
            row.status !== "resolved" &&
            row.status !== "source_review" &&
            !same(
              row,
              previousBatch?.results.find((oldRow) => oldRow.candidate_key === row.candidate_key),
            ),
        ).length
        if (native.evidence_ontology) graphRef = native.evidence_ontology
        if (native.status === "yielded") yielded = true
      }
      if (reviewFirst && handled < maxItems && clock() - started < timeBudgetMs) {
        persist("processing", {
          processing: queueRef,
          processing_counts: nativeQueue.counts,
          editorial_batches: batches,
          editorial_counts: count(outcomes),
          ...(graphRef ? { evidence_ontology: graphRef } : {}),
        })
        const continued = await queueProcessor({
          ...queueOptions,
          maxItems: maxItems - handled,
          timeBudgetMs: remaining(),
        })
        queueRef = reference(root, `runs/${queueRun}/daily-queue.json`)
        nativeQueue = checked(root, queueRef)
        assertStoppedQueue(continued)
        // Newly processed sources enter editorial on the next continuation.
        // Never report the old editorial frontier as completing the new queue.
        if (
          nativeQueue.results.some(
            (row) => row.status === "processed" && !keys.includes(row.candidate_key),
          )
        )
          yielded = true
      }
      let knowledgeRef, knowledgeCounts, sourceRevisionImpacts
      if (execute && graphRef) {
        if (
          companyReviewBytes &&
          sha256(fs.readFileSync(companyReviewFile)) !== sha256(companyReviewBytes)
        )
          throw Error("Company identity review changed during core execution")
        const graph = checked(root, graphRef),
          inputs = new Map()
        const inputLoader = (sourceRoot, run, options) => {
          if (!inputs.has(run)) inputs.set(run, loadApprovedOntologyInput(sourceRoot, run, options))
          return inputs.get(run)
        }
        const knowledgeOptions = {
          vault,
          inputLoader,
          revisionLoader,
          trendReviewRuns,
          knowledgeSelections,
          connectionReviewRun,
          ...(companyReview ? { companyReview } : {}),
        }
        const knowledge = ontologyKnowledgeIndex(root, graph, knowledgeOptions)
        const knowledgePath = graphRef.path.replace(
          /graph\.json$/,
          `knowledge-${sha256(JSON.stringify(knowledge)).slice(0, 16)}.json`,
        )
        const existing = readJSON(root, knowledgePath)
        if (existing && !same(existing, knowledge)) throw Error("Generated knowledge index changed")
        if (!existing) atomicCreate(root, knowledgePath, knowledge)
        knowledgeRef = reference(root, knowledgePath)
        knowledgeCounts = {
          events: knowledge.events.length,
          verified_facts: knowledge.events.reduce((total, event) => total + event.facts.length, 0),
          specialist_concepts: knowledge.concepts.length,
          entity_timelines: knowledge.entity_timelines.length,
          ...(knowledge.trend_topics?.length
            ? { trend_topics: knowledge.trend_topics.length }
            : {}),
          ...(knowledge.company_timelines?.length
            ? { company_timelines: knowledge.company_timelines.length }
            : {}),
          ...(knowledge.research_papers?.length
            ? { research_papers: knowledge.research_papers.length }
            : {}),
          ...(knowledge.research_people?.length
            ? { research_people: knowledge.research_people.length }
            : {}),
        }
        const requests = sourceRevisionImpactRequests(root, [...nativeQueue.results, ...outcomes], {
          vault,
          inputLoader,
        })
        if (requests.length) {
          const results = new Map()
          const impacts = requests.map((request) => {
            const key = request.query.source_version_id
            if (!results.has(key))
              results.set(
                key,
                ontologyImpact(root, graph, request.query, {
                  ...knowledgeOptions,
                  noteReviewRuns: trendReviewRuns,
                }),
              )
            return { ...request, impact: results.get(key) }
          })
          const report = {
            schema: "research-core-source-revision-impacts/v1",
            evidence_ontology: graphRef,
            impacts,
            approvals_created: false,
            candidate_published: false,
          }
          const file =
            base + `source-revision-impacts-${sha256(JSON.stringify(report)).slice(0, 16)}.json`
          const prior = readJSON(root, file)
          if (prior && !same(prior, report)) throw Error("Source revision impact report changed")
          if (!prior) atomicCreate(root, file, report)
          sourceRevisionImpacts = reference(root, file)
        }
      }
      let knowledgeDrafts, knowledgeDraftCounts
      if (knowledgeJobs.length) {
        for (const job of knowledgeJobs)
          if (sha256(fs.readFileSync(job.input_file)) !== job.input_sha256)
            throw Error("Core knowledge selection changed before drafting")
        const queue = await knowledgeProcessor({
          root,
          runId: `${runId}-knowledge`,
          inputFiles: knowledgeInputFiles,
          vault,
          policyFile,
          execute,
          maxItems: clock() - started >= timeBudgetMs ? 0 : Math.max(0, maxItems - handled),
          timeBudgetMs: remaining(),
          clock,
        })
        const ref = reference(root, queue.receipt),
          native = checked(root, ref)
        const request = readJSON(root, `runs/${runId}-knowledge/knowledge-queue/input.json`)
        if (
          !same({ ...native, receipt: queue.receipt }, queue) ||
          !same(request?.jobs, knowledgeJobs) ||
          native.candidate_published !== false ||
          native.approvals_created !== false ||
          native.drive_verified !== false
        )
          throw Error("Core knowledge draft queue differs from native evidence")
        knowledgeDrafts = ref
        knowledgeDraftCounts = native.counts
      }
      approvalSnapshot.assertCurrent()
      if (!same(trendReviews, prepareTrendReviewRuns(root, trendReviewRuns, { vault })))
        throw Error("Trend review approvals changed during core execution")
      if (
        !same(
          knowledgeReviews,
          prepareKnowledgeReviewSelections(root, knowledgeSelections, { vault }),
        )
      )
        throw Error("Knowledge review approvals changed during core execution")
      return persist(
        !execute
          ? "planned"
          : yielded ||
              knowledgeDraftCounts?.pending ||
              nativeQueue.counts.pending ||
              outcomes.some((row) => row.status === "pending")
            ? "yielded"
            : nativeQueue.counts.failed ||
                knowledgeDraftCounts?.failed ||
                outcomes.some((row) => row.status === "failed")
              ? "partial"
              : nativeQueue.counts.source_review ||
                  outcomes.some((row) => row.status === "source_review")
                ? "source_review_pending"
                : !keys.length
                  ? nativeQueue.counts.resolved
                    ? resolvedApprovals.length
                      ? "approval_ready"
                      : "resolved"
                    : "no_eligible_candidates"
                  : outcomes.length === keys.length &&
                      outcomes.every((row) => ["approval_ready", "resolved"].includes(row.status))
                    ? outcomes.some((row) => row.status === "approval_ready")
                      ? "approval_ready"
                      : "resolved"
                    : "review_pending",
        {
          processing: queueRef,
          processing_counts: nativeQueue.counts,
          source_routing_counts: count(nativeQueue.routed || []),
          ...(nativeQueue.selection_summary
            ? { source_selection: nativeQueue.selection_summary }
            : {}),
          editorial_batches: batches,
          editorial_counts: count(outcomes),
          ...(resolvedApprovals.length
            ? { resolved_approval_count: resolvedApprovals.length }
            : {}),
          ...(graphRef ? { evidence_ontology: graphRef } : {}),
          ...(knowledgeRef
            ? { knowledge_index: knowledgeRef, knowledge_counts: knowledgeCounts }
            : {}),
          ...(sourceRevisionImpacts ? { source_revision_impacts: sourceRevisionImpacts } : {}),
          next_candidate_key: nativeQueue.next_candidate_key,
          ...(approvalSnapshot.statistics().lookups
            ? { approval_lookup_counts: approvalSnapshot.statistics() }
            : {}),
          ...(knowledgeDrafts
            ? { knowledge_drafts: knowledgeDrafts, knowledge_draft_counts: knowledgeDraftCounts }
            : {}),
        },
      )
    } catch (error) {
      const stage = readJSON(root, base + "latest.json")?.status
      persist("failed", {
        failed_stage: stage,
        error: error instanceof Error ? error.message : String(error),
        automatic_retry: false,
      })
      throw error
    }
  })
}
