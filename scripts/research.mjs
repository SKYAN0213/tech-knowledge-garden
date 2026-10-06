import fs from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"
import { SourceFetcher } from "./research/fetch.mjs"
import { executeListScan } from "./research/list-scan-command.mjs"
import { writeDraftCheckpoint } from "./research/draft-checkpoint.mjs"
import { processSourceRun } from "./research/source-processing.mjs"
import { recordEmptyExtractionReview } from "./research/empty-extraction-review.mjs"
import {
  reviewProcessedClaims,
  assertProcessedFactReview,
  isProcessedRun,
} from "./research/evidence-review-packet.mjs"
export { scanListImplementationFingerprints } from "./research/scan-basis.mjs"
import {
  parseDocument,
  assertStoredEvidence,
  loadStoredSourceRun,
  loadCapturedStagesForReparse,
  bundleStoredSourceRuns,
  selectStoredSources,
  retainParse,
} from "./research/parser.mjs"
import { Ollama, localOllamaURL, DEFAULT_LOCAL_OLLAMA_MODEL } from "./research/ollama.mjs"
import { OpenAIResponses } from "./research/openai.mjs"
import {
  extractClaims,
  recordFactReview,
  extractionBudget,
  extractionCandidateKey,
} from "./research/claims.mjs"
import { draftMarkdown, correctDraft, draftFingerprint } from "./research/editor.mjs"
import { registry, discoverChannel, mergeBacklog, coverageGrid } from "./research/discovery.mjs"
import { saveBaseline } from "./research/baseline.mjs"
import {
  DEFAULT_ROOT,
  atomicCreate,
  atomicWrite,
  readJSON,
  RunState,
  recoverLock,
  withLock,
  safePath,
} from "./research/run-state.mjs"
import { canonicalURL, editions, extractArticles } from "./garden.mjs"
import { briefingLibrary } from "./briefings.mjs"
import { BACKLOG_PATH, readBacklog, researchWindow } from "./research-window.mjs"
import { sourceId } from "./research/contracts.mjs"
import { sha256 } from "./research/contracts.mjs"
import {
  planSearchQueries,
  loadSearchPlan,
  validateSearchQueries,
  SearxSearch,
  discoverSearch,
  buildSearchContext,
  validateCompleteSearchPlan,
} from "./research/search.mjs"
import { approvedArticle } from "./research/publish-adapter.mjs"
import { recordArticleApproval } from "./research/article-approval.mjs"
import { inspectReaderQuality, assertReaderQuality } from "./research/reader-quality.mjs"
import { evaluateArticleConceptReview } from "./research/article-concept-review.mjs"
import { loadProcessedDraft } from "./research/processed-draft.mjs"
import {
  archiveManifest,
  packageResearchArchive,
  buildSourceRegister,
  inspectManualCapture,
  storeManualCapture,
} from "./research/archive.mjs"
import { withLocalSearch } from "./research/search-runtime.mjs"
import { fetchWithPolicy } from "./research/source-policy.mjs"
import {
  importEvaluationCandidate,
  saveEvaluationAdjudication,
  saveEvaluationCase,
} from "./research/evaluation.mjs"
import { recordDeepDiveReview } from "./research/deep-dive.mjs"
import { assertReviewDate } from "./research/dates.mjs"
import { privatePreview } from "./research/preview.mjs"
import { approveNoteReview } from "./research/note-review.mjs"
import { retrospectiveInventory, saveRetrospectiveInventory } from "./research/retrospective.mjs"
import { saveEmptyLegacyReview } from "./research/legacy-review.mjs"
import { legacyTransitionBatch } from "./research/legacy-transition.mjs"
import { buildApprovedInventoryReconciliation } from "./research/approved-inventory-reconcile.mjs"
import { buildCandidateEvidenceReviewBatch } from "./research/candidate-evidence-review.mjs"
import { buildHistoricalSourceReconciliation } from "./research/historical-source-reconciliation.mjs"
import { writeKnowledgeDraft } from "./research/knowledge-editor.mjs"
import { prepareRoleProvider } from "./research/model-policy.mjs"
import { recordCandidateDisposition } from "./research/candidate-disposition.mjs"
import { recordCandidateIdentity } from "./research/candidate-identity.mjs"
import { recordCandidateApproval } from "./research/candidate-approval.mjs"
import { importLegacyCandidateApproval } from "./research/legacy-candidate-approval.mjs"
import { recordCandidateSourceAlternative } from "./research/candidate-source-alternative.mjs"
import { recordScheduledEventMaterialLink } from "./research/event-material-link.mjs"
import { loadDailySearchBasis } from "./research/daily-search-basis.mjs"
import { generateDailyHandoff, selectCandidateSource } from "./research/editorial-handoff.mjs"
import { buildDeliveryStatus, renderDeliveryStatusHTML } from "./research/delivery-status.mjs"
import {
  intakeSearchCandidate,
  selectIntakenSearchCandidate,
} from "./research/search-candidate-intake.mjs"
import { intakeSearchCandidateBatch } from "./research/search-candidate-batch-intake.mjs"
import { collectSearchCandidates } from "./research/search-candidate-collection.mjs"
import { processSearchCandidates } from "./research/search-candidate-workflow.mjs"
import { saveSourceSelection } from "./research/source-selection.mjs"
import { reuseExtraction } from "./research/extraction-reuse.mjs"
import { archiveClosure } from "./research/archive-closure.mjs"
import {
  buildCandidateContentFingerprintEvidence,
  candidateSourceInventoryFingerprint,
  projectVerifiedCandidateContentFingerprints,
} from "./research/candidate-content-fingerprint.mjs"

export async function main(argv = process.argv.slice(2)) {
  const { values: v, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      root: { type: "string", default: DEFAULT_ROOT },
      url: { type: "string", multiple: true },
      channel: { type: "string", multiple: true },
      run: { type: "string" },
      model: { type: "string", default: DEFAULT_LOCAL_OLLAMA_MODEL },
      think: { type: "string", default: "medium" },
      "model-policy": { type: "string" },
      "assessment-run": { type: "string" },
      "extraction-run": { type: "string" },
      "draft-run": { type: "string" },
      "evidence-think": { type: "string" },
      review: { type: "string" },
      provisional: { type: "boolean", default: false },
      "merge-backlog": { type: "boolean", default: false },
      query: { type: "string" },
      date: { type: "string" },
      "daily-run": { type: "string" },
      "drive-snapshot": { type: "string" },
      "drive-readback": { type: "string" },
      reconciliation: { type: "string" },
      "review-batch": { type: "string" },
      inventory: { type: "string" },
      "candidate-key": { type: "string" },
      "candidate-keys": { type: "string", multiple: true },
      backlog: { type: "string" },
      "batch-manifest": { type: "string" },
      "source-run": { type: "string" },
      "retain-previous-parses": { type: "boolean", default: false },
      "retain-unsupported-claims": { type: "boolean", default: false },
      "approved-root": { type: "string" },
      "candidate-source-run": { type: "string" },
      "source-revision-review": { type: "string" },
      "existing-editorial-review": { type: "string" },
      "source-alternative-run": { type: "string" },
      "article-readback": { type: "string" },
      "edition-readback": { type: "string" },
      "published-source-run": { type: "string" },
      "candidate-run": { type: "string" },
      "case-id": { type: "string" },
      since: { type: "string" },
      until: { type: "string" },
      "reuse-listing-run": { type: "string" },
      "repair-source-run": { type: "string" },
      "additional-source-run": { type: "string", multiple: true },
      "related-run": { type: "string", multiple: true },
      deep: { type: "boolean", default: false },
      "num-ctx": { type: "string" },
      "input-char-budget": { type: "string" },
      "num-predict": { type: "string" },
      "call-timeout-ms": { type: "string" },
      "extraction-timeout-ms": { type: "string" },
      "facts-per-batch": { type: "string" },
      "extraction-scope": { type: "string" },
      "resume-local-budget-ms": { type: "string" },
      "approved-run": { type: "string", multiple: true },
      "knowledge-run": { type: "string", multiple: true },
      vault: { type: "string" },
      format: { type: "string", default: "json" },
      lock: { type: "string" },
      "expected-owner": { type: "string" },
    },
  })
  const command = positionals[0],
    root = v.root
  if (
    !command ||
    ![
      "baseline",
      "inventory",
      "review-legacy-empty",
      "reconcile-approved-inventory",
      "prepare-identity-review-batch",
      "reconcile-historical-source-evidence",
      "discover",
      "scan-list",
      "collect",
      "extract",
      "process-source",
      "review-empty-extraction",
      "reuse-extraction",
      "review",
      "draft",
      "correct",
      "preview",
      "note-review",
      "knowledge-draft",
      "model-info",
      "queries",
      "localize-queries",
      "search",
      "approve",
      "editorial-check",
      "archive",
      "archive-closure",
      "gold-case",
      "evaluation-import-candidate",
      "evaluation-review",
      "deep-review",
      "reparse",
      "bundle",
      "select-source",
      "select-candidate",
      "candidate-approval",
      "legacy-candidate-approval",
      "intake-search-candidate",
      "intake-search-batch",
      "collect-search-candidates",
      "process-search-candidates",
      "select-search-candidate",
      "source-register",
      "import-capture",
      "candidate-disposition",
      "candidate-identity",
      "candidate-source-alternative",
      "event-material-link",
      "reconcile-content-fingerprint-evidence",
      "status",
      "recover-lock",
    ].includes(command)
  )
    throw Error(
      "Usage: research.mjs baseline|inventory|review-legacy-empty|reconcile-approved-inventory|prepare-identity-review-batch|reconcile-historical-source-evidence|reconcile-content-fingerprint-evidence|discover|scan-list|collect|collect-search-candidates|process-search-candidates|reparse|bundle|select-source|select-candidate|intake-search-candidate|intake-search-batch|select-search-candidate|candidate-approval|legacy-candidate-approval|candidate-source-alternative|event-material-link|import-capture|candidate-disposition|candidate-identity|extract|process-source|review-empty-extraction|review|deep-review|draft|correct|preview|note-review|knowledge-draft|model-info|queries|localize-queries|search|editorial-check|approve|archive|archive-closure|gold-case|evaluation-import-candidate|evaluation-review|source-register --run ID; recover-lock --lock NAME --expected-owner UUID [--root PATH]; review-legacy-empty requires --review [--vault PATH]; reconcile-approved-inventory requires --daily-run --drive-snapshot --drive-readback --inventory; prepare-identity-review-batch requires --daily-run --reconciliation; reconcile-historical-source-evidence requires --daily-run --reconciliation --review-batch; evaluation-import-candidate requires --case-id --candidate-run; evaluation-review requires --case-id --candidate-run --review",
    )
  const budgetFields = [
    "num-ctx",
    "input-char-budget",
    "num-predict",
    "call-timeout-ms",
    "extraction-timeout-ms",
    "facts-per-batch",
  ]
  if (v["retain-previous-parses"] && (command !== "reparse" || !v["source-run"] || v.url?.length))
    throw Error("--retain-previous-parses requires reparse --source-run without --url")
  if (v["retain-unsupported-claims"] && command !== "reuse-extraction")
    throw Error("--retain-unsupported-claims is only supported for reuse-extraction")
  if (v["resume-local-budget-ms"] !== undefined) {
    if (command !== "extract") throw Error("--resume-local-budget-ms is only supported for extract")
    if (!/^\d+$/.test(v["resume-local-budget-ms"]))
      throw Error("Local resume budget must be an integer")
    const value = Number(v["resume-local-budget-ms"])
    if (!Number.isInteger(value) || value < 1 || value > 3600000)
      throw Error("Local resume budget must be between 1 and 3600000 ms")
    if (!v["model-policy"])
      throw Error("--resume-local-budget-ms requires an explicit --model-policy")
  }
  if (v["extraction-scope"] !== undefined) {
    if (command !== "extract") throw Error("--extraction-scope is only supported for extract")
    if (!["full_source", "research_key_findings"].includes(v["extraction-scope"]))
      throw Error("--extraction-scope must be full_source or research_key_findings")
  }
  if (command !== "extract" && budgetFields.some((field) => v[field] !== undefined))
    throw Error("Extraction budgets are only supported for extract")
  if (
    !["evaluation-import-candidate", "evaluation-review"].includes(command) &&
    v["case-id"] !== undefined
  )
    throw Error("--case-id is only supported for evaluation commands")
  if (
    command !== "reconcile-approved-inventory" &&
    ["drive-snapshot", "drive-readback", "inventory"].some((field) => v[field] !== undefined)
  )
    throw Error("Drive reconciliation inputs are only supported for reconcile-approved-inventory")
  if (
    !["prepare-identity-review-batch", "reconcile-historical-source-evidence"].includes(command) &&
    v.reconciliation !== undefined
  )
    throw Error("--reconciliation is only supported for identity evidence commands")
  if (command !== "reconcile-historical-source-evidence" && v["review-batch"] !== undefined)
    throw Error("--review-batch is only supported for reconcile-historical-source-evidence")
  const configuredBudget = {}
  for (const field of budgetFields)
    if (v[field] !== undefined) {
      if (!/^\d+$/.test(v[field])) throw Error("Extraction budget must be an integer: " + field)
      configuredBudget[field.replaceAll("-", "_")] = Number(v[field])
    }
  let budget =
    command === "extract" && !v["model-policy"] ? extractionBudget(configuredBudget) : null
  let extractionScope = v["extraction-scope"] ?? "full_source"
  const policyRole = {
    queries: "search_plan",
    "localize-queries": "search_plan",
    extract: "fact_extract",
    draft: "article_write",
    "knowledge-draft": "concept_write",
  }[command]
  let ollama =
    (policyRole || command === "model-info") && !v["model-policy"]
      ? new Ollama({ url: localOllamaURL() })
      : null
  if (v["model-policy"] && !policyRole && command !== "process-source")
    throw Error("Model policy is only supported for model-generating commands")
  if (v.deep && command !== "draft") throw Error("--deep is only supported for draft")
  if (command !== "scan-list" && (v.since || v.until))
    throw Error("--since and --until are only supported for scan-list")
  if (command !== "scan-list" && v["repair-source-run"])
    throw Error("--repair-source-run is only supported for scan-list")
  if (command === "discover" && v.url?.length)
    throw Error("discover does not accept --url; use --channel to limit route discovery")
  if (
    v["daily-run"] &&
    ![
      "queries",
      "select-candidate",
      "reconcile-approved-inventory",
      "prepare-identity-review-batch",
      "reconcile-historical-source-evidence",
    ].includes(command)
  )
    throw Error(
      "--daily-run is only supported for queries, select-candidate or identity evidence commands",
    )
  if (
    v["candidate-key"] &&
    ![
      "extract",
      "process-source",
      "select-candidate",
      "candidate-approval",
      "legacy-candidate-approval",
      "intake-search-candidate",
      "intake-search-batch",
      "process-search-candidates",
      "select-search-candidate",
      "candidate-source-alternative",
    ].includes(command)
  )
    throw Error("--candidate-key is only supported for extraction, candidate selection or approval")
  if (
    v.backlog &&
    ![
      "select-candidate",
      "candidate-approval",
      "legacy-candidate-approval",
      "intake-search-candidate",
      "intake-search-batch",
      "process-search-candidates",
      "select-search-candidate",
      "candidate-source-alternative",
      "reconcile-content-fingerprint-evidence",
    ].includes(command)
  )
    throw Error("--backlog is only supported for candidate selection or approval")
  if (command !== "preview" && (v["approved-run"] || v["knowledge-run"]))
    throw Error("--approved-run and --knowledge-run are only supported for preview")
  if (
    ![
      "preview",
      "approve",
      "archive-closure",
      "note-review",
      "inventory",
      "review-legacy-empty",
      "reconcile-approved-inventory",
      "prepare-identity-review-batch",
      "knowledge-draft",
      "select-candidate",
      "candidate-approval",
      "legacy-candidate-approval",
      "intake-search-candidate",
      "intake-search-batch",
      "select-search-candidate",
    ].includes(command) &&
    v.vault
  )
    throw Error(
      "--vault is only supported for preview, approve, archive-closure, note-review, inventory, review-legacy-empty, reconcile-approved-inventory, prepare-identity-review-batch, knowledge-draft, select-candidate or candidate-approval",
    )
  if (
    v["source-run"] &&
    ![
      "extract",
      "process-source",
      "review-empty-extraction",
      "reuse-extraction",
      "gold-case",
      "archive-closure",
      "reparse",
      "bundle",
      "select-source",
      "candidate-approval",
      "legacy-candidate-approval",
      "intake-search-candidate",
      "select-search-candidate",
      "import-capture",
      "candidate-disposition",
      "candidate-identity",
      "candidate-source-alternative",
    ].includes(command)
  )
    throw Error(
      "--source-run is only supported for extract, reuse-extraction, archive-closure, gold-case, reparse, bundle, select-source, candidate-approval, candidate-source-alternative, intake-search-candidate, select-search-candidate, import-capture, candidate-disposition or candidate-identity",
    )
  if (v["published-source-run"] && command !== "candidate-identity")
    throw Error("--published-source-run is only supported for candidate-identity")
  if (v["existing-editorial-review"] && command !== "candidate-approval")
    throw Error("--existing-editorial-review is only supported for candidate-approval")
  if (v["source-alternative-run"] && command !== "candidate-approval")
    throw Error("--source-alternative-run is only supported for candidate-approval")
  if ((v["article-readback"] || v["edition-readback"]) && command !== "legacy-candidate-approval")
    throw Error("Drive publication readbacks are only supported for legacy-candidate-approval")
  if (
    (v["approved-root"] || v["candidate-source-run"] || v["source-revision-review"]) &&
    command !== "candidate-approval"
  )
    throw Error("Same-source revision options are only supported for candidate-approval")
  if (Boolean(v["candidate-source-run"]) !== Boolean(v["source-revision-review"]))
    throw Error("--candidate-source-run and --source-revision-review must be used together")
  if (v["additional-source-run"] && command !== "bundle")
    throw Error("--additional-source-run is only supported for bundle")
  if (v["related-run"] && command !== "archive-closure")
    throw Error("--related-run is only supported for archive-closure")
  if (
    v["candidate-run"] &&
    ![
      "candidate-disposition",
      "candidate-identity",
      "intake-search-candidate",
      "intake-search-batch",
      "collect-search-candidates",
      "process-search-candidates",
      "select-search-candidate",
      "evaluation-review",
      "evaluation-import-candidate",
    ].includes(command)
  )
    throw Error(
      "--candidate-run is only supported for candidate-disposition, candidate-identity, intake-search-candidate, intake-search-batch, collect-search-candidates, process-search-candidates, select-search-candidate or evaluation commands",
    )
  if (v["batch-manifest"] && command !== "intake-search-batch")
    throw Error("--batch-manifest is only supported for intake-search-batch")
  if (
    v["candidate-keys"] &&
    !["collect-search-candidates", "process-search-candidates"].includes(command)
  )
    throw Error("--candidate-keys is only supported for search candidate collection workflows")
  if (command !== "status" && v.format !== "json")
    throw Error("--format is only supported for status")
  if (command !== "recover-lock" && (v.lock !== undefined || v["expected-owner"] !== undefined))
    throw Error("--lock and --expected-owner are only supported for recover-lock")
  if (command === "recover-lock") {
    if (
      v.run ||
      v.url?.length ||
      v.channel?.length ||
      v.since ||
      v.until ||
      v["source-run"] ||
      v["candidate-run"]
    )
      throw Error("recover-lock accepts only --root, --lock and --expected-owner")
    if (!v.lock || !v["expected-owner"])
      throw Error("recover-lock requires --lock NAME and --expected-owner UUID")
    return recoverLock(root, v.lock, v["expected-owner"])
  }
  if (command === "reconcile-content-fingerprint-evidence") {
    if (
      !v.run ||
      !/^[a-zA-Z0-9_-]+$/.test(v.run) ||
      v.url?.length ||
      v.channel?.length ||
      v["source-run"] ||
      v["candidate-run"] ||
      v["candidate-key"] ||
      v.review ||
      v["merge-backlog"]
    )
      throw Error("Content fingerprint evidence requires --run and a local backlog")
    const backlogPath = path.resolve(v.backlog || BACKLOG_PATH)
    const backlogBytes = fs.readFileSync(backlogPath)
    const backlog = JSON.parse(backlogBytes.toString("utf8"))
    if (backlog?.schema !== "research-candidates/v1" || !Array.isArray(backlog.candidates))
      throw Error("Valid candidate backlog required")
    const backlogSha256 = sha256(backlogBytes)
    const receiptPath = `runs/${v.run}/candidate-content-fingerprint-evidence.json`
    return withLock(root, "run-" + v.run, () => {
      const sourceInventoryBefore = candidateSourceInventoryFingerprint({
        root,
        candidates: backlog.candidates,
      })
      const previous = readJSON(root, receiptPath)
      if (previous) {
        if (previous.backlog_sha256 !== backlogSha256)
          throw Error("Candidate backlog changed; create a new evidence run")
        if (previous.source_inventory_sha256 !== sourceInventoryBefore)
          throw Error("Source inventory changed or is unpinned; create a new evidence run")
        const projection = projectVerifiedCandidateContentFingerprints({
          root,
          candidates: backlog.candidates,
          backlogSha256,
        })
        if (projection.invalid_receipt_count)
          throw Error("Stored content fingerprint evidence failed integrity validation")
        const sourceInventoryAfter = candidateSourceInventoryFingerprint({
          root,
          candidates: backlog.candidates,
        })
        if (sourceInventoryAfter !== sourceInventoryBefore)
          throw Error("Source inventory changed during reconciliation; create a new evidence run")
        return {
          path: receiptPath,
          candidate_count: previous.candidate_count,
          status_counts: previous.status_counts,
          receipt_sha256: sha256(fs.readFileSync(safePath(root, receiptPath))),
          reused: true,
          candidate_published: false,
        }
      }
      const receipt = buildCandidateContentFingerprintEvidence({
        root,
        runId: v.run,
        candidates: backlog.candidates,
        backlogSha256,
      })
      const sourceInventoryAfter = candidateSourceInventoryFingerprint({
        root,
        candidates: backlog.candidates,
      })
      if (
        sourceInventoryBefore !== sourceInventoryAfter ||
        receipt.source_inventory_sha256 !== sourceInventoryBefore
      )
        throw Error("Source inventory changed during reconciliation; create a new evidence run")
      const saved = atomicCreate(root, receiptPath, receipt)
      return {
        path: saved.path,
        receipt_sha256: saved.sha256,
        candidate_count: receipt.candidate_count,
        status_counts: receipt.status_counts,
        candidate_published: false,
      }
    })
  }
  if (v["source-run"] && (v.channel?.length || (v.url?.length && command !== "select-source")))
    throw Error("Stored source input cannot be combined with live URLs or channels")
  if (command === "model-info") return ollama.metadata(v.model)
  if (command === "status") {
    if (!["json", "html"].includes(v.format)) throw Error("Status accepts --format json|html")
    const status = await buildDeliveryStatus({ root })
    if (v.format === "html") {
      const html = renderDeliveryStatusHTML(status)
      const receipt = atomicWrite(root, "delivery-status.html", html)
      return { path: receipt.path, sha256: receipt.sha256, access: "local_private" }
    }
    return status
  }
  if (
    !v.run &&
    ![
      "reconcile-approved-inventory",
      "prepare-identity-review-batch",
      "reconcile-historical-source-evidence",
      "recover-lock",
    ].includes(command)
  )
    throw Error("Explicit --run ID required")
  if (v.run && !/^[a-zA-Z0-9_-]+$/.test(v.run)) throw Error("Invalid run id")
  if (command === "collect-search-candidates" || command === "process-search-candidates") {
    if (
      !v["candidate-run"] ||
      !v["candidate-keys"]?.length ||
      v["candidate-key"] ||
      (v.backlog && command === "collect-search-candidates") ||
      v["batch-manifest"] ||
      v["source-run"] ||
      v.url?.length ||
      v.channel?.length ||
      v.review ||
      v["merge-backlog"] ||
      v.provisional
    )
      throw Error(
        "Search candidate collection requires --candidate-run and one to twelve --candidate-keys",
      )
    const profiles =
      JSON.parse(fs.readFileSync("data/research-acquisition.json", "utf8")).article_profiles || []
    if (command === "process-search-candidates")
      return processSearchCandidates({
        root,
        runId: v.run,
        searchRunId: v["candidate-run"],
        candidateKeys: v["candidate-keys"],
        articleProfiles: profiles,
        backlogFile: v.backlog || BACKLOG_PATH,
        saveSelection: saveSourceSelection,
      })
    return collectSearchCandidates({
      root,
      runId: v.run,
      searchRunId: v["candidate-run"],
      candidateKeys: v["candidate-keys"],
      articleProfiles: profiles,
    })
  }
  if (command === "select-candidate") {
    if (
      !v["daily-run"] ||
      !/^[a-zA-Z0-9_-]+$/.test(v["daily-run"]) ||
      !v["candidate-key"] ||
      v.run === v["daily-run"] ||
      v["source-run"] ||
      v.url?.length ||
      v.channel?.length ||
      v.review ||
      v["merge-backlog"] ||
      v.provisional
    )
      throw Error("Select candidate requires one daily run, candidate key and new output run")
    const handoffRef = await withLock(root, "daily-acquisition", () =>
      generateDailyHandoff({
        root,
        runId: v["daily-run"],
        vault: v.vault || "vault",
        backlogFile: v.backlog || BACKLOG_PATH,
      }),
    )
    const handoff = readJSON(root, handoffRef.path)
    const { candidate, source_attempt_id, selected } = selectCandidateSource(
      root,
      handoff,
      v["candidate-key"],
    )
    if (v.run === source_attempt_id) throw Error("Output run must differ from source attempt")
    const result = await saveSourceSelection(root, v.run, selected, {
      candidate_key: candidate.key,
      candidate_source_version_id: candidate.article_source_version_id,
      candidate_parse_id: candidate.article_parse_id,
      next_route: candidate.next_route,
      daily_run: v["daily-run"],
      handoff_path: handoffRef.path,
      handoff_sha256: sha256(fs.readFileSync(safePath(root, handoffRef.path))),
    })
    return { ...result, candidate_key: candidate.key, source_attempt_id }
  }
  if (command === "candidate-approval") {
    if (
      !v["source-run"] ||
      !v["candidate-key"] ||
      (v["source-alternative-run"] && v["source-alternative-run"] === v.run) ||
      v.url?.length ||
      v.channel?.length ||
      v.review ||
      v["merge-backlog"] ||
      v.provisional
    )
      throw Error("Candidate approval requires an approved --source-run and candidate key")
    const publishedArticles = editions(v.vault || "vault").flatMap((edition) =>
      extractArticles(edition).map((article) => ({
        event_id: article.id,
        title: article.title,
        published_at: article.review?.published_at,
        source_urls: article.urls,
      })),
    )
    return recordCandidateApproval({
      root,
      approvedRoot: v["approved-root"] || root,
      runId: v.run,
      approvedRunId: v["source-run"],
      candidateKey: v["candidate-key"],
      candidateSourceRunId: v["candidate-source-run"] || null,
      sourceRevisionReviewPath: v["source-revision-review"] || null,
      existingEditorialReviewPath: v["existing-editorial-review"] || null,
      sourceAlternativeResolutionRunId: v["source-alternative-run"] || null,
      backlogFile: v.backlog || BACKLOG_PATH,
      publishedArticles,
    })
  }
  if (command === "legacy-candidate-approval") {
    if (
      !v["source-run"] ||
      !v["candidate-key"] ||
      !v["article-readback"] ||
      !v["edition-readback"] ||
      !v.review ||
      v.url?.length ||
      v.channel?.length ||
      v["merge-backlog"] ||
      v.provisional
    )
      throw Error(
        "Legacy approval requires source run, candidate key, both Drive readbacks and private review",
      )
    return importLegacyCandidateApproval({
      root,
      runId: v.run,
      sourceRunId: v["source-run"],
      candidateKey: v["candidate-key"],
      articleReadbackPath: v["article-readback"],
      editionReadbackPath: v["edition-readback"],
      reviewPath: v.review,
      backlogFile: v.backlog || BACKLOG_PATH,
    })
  }
  if (command === "intake-search-candidate") {
    if (
      !v["candidate-run"] ||
      !v["source-run"] ||
      !v["candidate-key"] ||
      v.url?.length ||
      v.channel?.length ||
      v.review ||
      v["merge-backlog"] ||
      v.provisional
    )
      throw Error(
        "Search candidate intake requires --candidate-run, --source-run and --candidate-key",
      )
    return intakeSearchCandidate({
      root,
      runId: v.run,
      searchRunId: v["candidate-run"],
      sourceRunId: v["source-run"],
      candidateKey: v["candidate-key"],
      backlogFile: v.backlog || BACKLOG_PATH,
    })
  }
  if (command === "intake-search-batch") {
    if (
      !v["candidate-run"] ||
      !v["batch-manifest"] ||
      v["candidate-key"] ||
      v["source-run"] ||
      v.url?.length ||
      v.channel?.length ||
      v.review ||
      v["merge-backlog"] ||
      v.provisional
    )
      throw Error("Search candidate batch intake requires --candidate-run and --batch-manifest")
    const manifest = readJSON(root, v["batch-manifest"])
    if (!manifest) throw Error("Private search candidate batch manifest not found")
    return intakeSearchCandidateBatch({
      root,
      runId: v.run,
      searchRunId: v["candidate-run"],
      manifest,
      backlogFile: v.backlog || BACKLOG_PATH,
    })
  }
  if (command === "select-search-candidate") {
    if (
      !v["candidate-run"] ||
      !v["source-run"] ||
      !v["candidate-key"] ||
      v.run === v["candidate-run"] ||
      v.run === v["source-run"] ||
      v.url?.length ||
      v.channel?.length ||
      v.review ||
      v["merge-backlog"] ||
      v.provisional
    )
      throw Error(
        "Search candidate selection requires distinct output, intake and source runs plus --candidate-key",
      )
    const { candidate, selected } = selectIntakenSearchCandidate({
      root,
      intakeRunId: v["candidate-run"],
      sourceRunId: v["source-run"],
      candidateKey: v["candidate-key"],
      backlogFile: v.backlog || BACKLOG_PATH,
    })
    return saveSourceSelection(root, v.run, selected, {
      candidate_key: candidate.key,
      candidate_source_version_id: candidate.article_source_version_id,
      candidate_parse_id: candidate.article_parse_id,
      intake_run: v["candidate-run"],
      selection_basis: "exact_search_intake",
    }).then((result) => ({ ...result, candidate_key: candidate.key }))
  }
  if (command === "candidate-disposition") {
    if (
      !v["source-run"] ||
      !v.review ||
      v.url?.length ||
      v.channel?.length ||
      v["merge-backlog"] ||
      v.provisional
    )
      throw Error("Candidate disposition requires --source-run and private --review only")
    const all = editions("vault")
    return recordCandidateDisposition({
      root,
      runId: v.run,
      sourceRunId: v["source-run"],
      candidateRunId: v["candidate-run"] || v["source-run"],
      reviewPath: v.review,
      publishedURLs: all.flatMap((edition) => extractArticles(edition).flatMap((a) => a.urls)),
      publishedContent: all.map((edition) => edition.body),
    })
  }
  if (command === "candidate-identity") {
    if (
      !v["source-run"] ||
      !v["published-source-run"] ||
      !v.review ||
      v.url?.length ||
      v.channel?.length ||
      v["merge-backlog"] ||
      v.provisional
    )
      throw Error("Candidate identity requires both stored source runs and private --review only")
    const all = editions("vault")
    return recordCandidateIdentity({
      root,
      runId: v.run,
      sourceRunId: v["source-run"],
      publishedSourceRunId: v["published-source-run"],
      candidateRunId: v["candidate-run"] || v["source-run"],
      reviewPath: v.review,
      publishedArticles: all.flatMap((edition) =>
        extractArticles(edition).map((article) => ({
          event_id: article.id,
          title: article.title,
          published_at: article.review?.published_at,
          review_status: article.review?.review_status,
          source_urls: article.urls,
        })),
      ),
    })
  }
  if (command === "candidate-source-alternative") {
    if (
      !v["source-run"] ||
      !v["candidate-key"] ||
      !v.review ||
      v.url?.length ||
      v.channel?.length ||
      v["candidate-run"] ||
      v["merge-backlog"] ||
      v.provisional
    )
      throw Error(
        "Candidate source alternative requires stored --source-run, --candidate-key and private --review only",
      )
    return recordCandidateSourceAlternative({
      root,
      runId: v.run,
      sourceRunId: v["source-run"],
      candidateKey: v["candidate-key"],
      reviewPath: v.review,
      backlogFile: v.backlog || BACKLOG_PATH,
    })
  }
  if (command === "event-material-link") {
    if (!v.review || v.url?.length || v.channel?.length || v["source-run"] || v["merge-backlog"])
      throw Error("Event/material link requires only a private --review file")
    return recordScheduledEventMaterialLink({ root, runId: v.run, reviewPath: v.review })
  }
  if (command === "bundle") {
    if (!v["source-run"] || !v["additional-source-run"]?.length)
      throw Error("Bundle requires --source-run and --additional-source-run")
    const ids = [v["source-run"], ...v["additional-source-run"]]
    if (ids.includes(v.run)) throw Error("Bundle output run must differ from source runs")
    return withLock(root, "run-" + v.run, async () => {
      const bundle = bundleStoredSourceRuns(root, ids)
      const manifest = {
        schema: "research-source-bundle/v1",
        ...bundle.identity,
        candidate_published: false,
      }
      const existing = readJSON(root, `runs/${v.run}/source-bundle.json`)
      if (existing && sha256(JSON.stringify(existing)) !== sha256(JSON.stringify(manifest)))
        throw Error("Source bundle input changed; use a new run")
      if (existing) {
        const current = loadStoredSourceRun(root, v.run)
        if (
          current.identity.documents_sha256 !== bundle.identity.documents_sha256 ||
          current.identity.parses_sha256 !== bundle.identity.parses_sha256
        )
          throw Error("Stored source bundle changed after creation")
      }
      atomicWrite(root, `runs/${v.run}/documents.json`, bundle.documents)
      atomicWrite(root, `runs/${v.run}/parses.json`, bundle.parses)
      atomicWrite(root, `runs/${v.run}/source-bundle.json`, manifest)
      return {
        sources: bundle.documents.length,
        parses: bundle.parses.length,
        candidate_published: false,
      }
    })
  }
  if (command === "select-source") {
    if (!v["source-run"] || v["source-run"] === v.run || !v.url?.length)
      throw Error("Select source requires a different --source-run and one or more --url values")
    return saveSourceSelection(root, v.run, selectStoredSources(root, v["source-run"], v.url))
  }
  if (command === "reuse-extraction") {
    if (
      !v["source-run"] ||
      v.url?.length ||
      v.channel?.length ||
      v.review ||
      v.provisional ||
      v["merge-backlog"]
    )
      throw Error("Extraction reuse requires only a stored source run and destination run")
    return reuseExtraction(root, v.run, v["source-run"], {
      retainUnsupportedClaims: v["retain-unsupported-claims"],
    })
  }
  if (command === "archive-closure") {
    if (
      !v["source-run"] ||
      v.url?.length ||
      v.channel?.length ||
      v.review ||
      v.provisional ||
      v["merge-backlog"]
    )
      throw Error("Archive closure requires a stored source run and optional related approval runs")
    return archiveClosure(root, v.run, v["source-run"], v["related-run"] || [], {
      vault: v.vault || "vault",
    })
  }
  if (command === "import-capture") {
    if (!v.review || !v["source-run"] || v["source-run"] === v.run)
      throw Error("Import requires a root-relative --review manifest and a different --source-run")
    return withLock(root, "run-" + v.run, async () => {
      const inspected = inspectManualCapture(root, v.review, v["source-run"])
      const registryBytes = fs.readFileSync("data/research-acquisition.json")
      const profiles = JSON.parse(registryBytes).article_profiles || []
      const run = new RunState(root, v.run, {
        command,
        capture: inspected.identity,
        registry_sha256: sha256(registryBytes),
        worker_sha256: sha256(fs.readFileSync("integrations/research-worker/worker.py")),
        importer_sha256: sha256(fs.readFileSync("scripts/research/archive.mjs")),
      })
      const selectedProfiles = inspected.entries.map(({ source }) => {
        if (inspected.identity.capture_schema === "manual-readable-capture/v1")
          return { id: "readable-source/v1", options: source.parse_options }
        const matching = profiles.filter((profile) =>
          new RegExp(profile.url_pattern).test(source.final_url),
        )
        if (matching.length !== 1) throw Error("Manual capture needs one exact article profile")
        return matching[0]
      })
      if (inspected.identity.capture_schema === "manual-readable-capture/v1") {
        const evidencePaths = [`runs/${v.run}/capture-evidence/manifest.json`]
        const manifestBytes = fs.readFileSync(safePath(root, v.review))
        if (fs.existsSync(safePath(root, evidencePaths[0]))) {
          if (!fs.readFileSync(safePath(root, evidencePaths[0])).equals(manifestBytes))
            throw Error("Stored readable manifest changed")
        } else atomicCreate(root, evidencePaths[0], manifestBytes)
        const blockedPath = `runs/${v.run}/capture-evidence/blocked-documents.json`
        const blockedBytes = fs.readFileSync(
          safePath(root, `runs/${v["source-run"]}/documents.json`),
        )
        if (fs.existsSync(safePath(root, blockedPath))) {
          if (!fs.readFileSync(safePath(root, blockedPath)).equals(blockedBytes))
            throw Error("Stored readable blocked observation changed")
        } else atomicCreate(root, blockedPath, blockedBytes)
        evidencePaths.push(blockedPath)
        for (const entry of inspected.entries) {
          const relative = `runs/${v.run}/capture-evidence/${entry.source.name}.txt`
          if (fs.existsSync(safePath(root, relative))) {
            if (sha256(fs.readFileSync(safePath(root, relative))) !== entry.readableEvidence.sha256)
              throw Error("Stored readable transcript changed")
          } else atomicCreate(root, relative, entry.readableEvidence.body)
          evidencePaths.push(relative)
        }
        inspected.identity.evidence_paths = evidencePaths
      }
      const documents = storeManualCapture(root, inspected)
      const parses = []
      for (const [index, document] of documents.entries()) {
        const profile = selectedProfiles[index]
        parses.push(
          await run.stage(`parse-${document.source_id}`, { document, profile }, () =>
            parseDocument(root, document, profile.options),
          ),
        )
      }
      assertStoredEvidence(root, documents, parses)
      atomicWrite(root, `runs/${v.run}/documents.json`, documents)
      atomicWrite(root, `runs/${v.run}/parses.json`, parses)
      atomicWrite(root, `runs/${v.run}/manual-capture-import.json`, {
        schema: "manual-capture-import/v1",
        ...inspected.identity,
        documents_sha256: sha256(JSON.stringify(documents)),
        parses_sha256: sha256(JSON.stringify(parses)),
        candidate_published: false,
      })
      return {
        sources: documents.length,
        parses: parses.map((parse) => ({
          id: parse.parse_id,
          status: parse.status,
          blocks: parse.blocks.length,
        })),
        candidate_published: false,
      }
    })
  }
  if (
    (v["extraction-run"] ||
      v["assessment-run"] ||
      v["draft-run"] ||
      v["evidence-think"] !== undefined) &&
    command !== "process-source"
  )
    throw Error("Assessment processing options are only supported for process-source")
  if (command === "review-empty-extraction") {
    const allowed = ["root", "run", "source-run", "review"]
    if (
      !v["source-run"] ||
      !v.review ||
      positionals.length !== 1 ||
      argv.some((arg) => arg.startsWith("--") && !allowed.includes(arg.slice(2).split("=")[0]))
    )
      throw Error("review-empty-extraction requires --source-run and private --review only")
    return recordEmptyExtractionReview({
      root,
      run: v.run,
      sourceRun: v["source-run"],
      reviewFile: v.review,
    })
  }
  if (command === "process-source") {
    const allowed = [
      "root",
      "run",
      "source-run",
      "model-policy",
      "extraction-run",
      "assessment-run",
      "draft-run",
      "evidence-think",
      "review",
      "candidate-key",
    ]
    if (
      positionals.length !== 1 ||
      argv.some((arg) => arg.startsWith("--") && !allowed.includes(arg.slice(2).split("=")[0]))
    )
      throw Error("Unsupported process-source option; configure local roles with --model-policy")
    if (!v["source-run"] || v.url || v.provisional || v.deep)
      throw Error(
        "process-source requires one stored --source-run without provisional or deep overrides",
      )
    return processSourceRun({
      root,
      run: v.run,
      sourceRun: v["source-run"],
      policyFile: v["model-policy"],
      extractionRun: v["extraction-run"],
      assessmentRun: v["assessment-run"],
      draftRun: v["draft-run"],
      reviewFile: v.review,
      candidateKey: v["candidate-key"],
      evidenceThink:
        v["evidence-think"] === "false"
          ? false
          : v["evidence-think"] === "true"
            ? true
            : v["evidence-think"],
    })
  }
  if (v["model-policy"]) {
    const explicit = (key) =>
      argv.some((arg) => arg === "--" + key || arg.startsWith("--" + key + "="))
    const overrides = {
      ...configuredBudget,
      ...(explicit("extraction-scope") ? { extraction_scope: extractionScope } : {}),
      ...(explicit("model") ? { model: v.model } : {}),
      ...(explicit("think")
        ? { think: v.think === "false" ? false : v.think === "true" ? true : v.think }
        : {}),
    }
    let modelPolicy = JSON.parse(fs.readFileSync(v["model-policy"], "utf8"))
    const configuredProvider = modelPolicy.roles?.[policyRole]?.provider ?? "ollama"
    if (configuredProvider === "openai") ollama = new OpenAIResponses()
    else if (configuredProvider === "ollama") {
      const environmentEndpoint = process.env.TECH_KNOWLEDGE_OLLAMA_URL
      const endpoint = environmentEndpoint ?? modelPolicy.runtime?.ollama_url
      ollama = new Ollama(endpoint === undefined ? undefined : { url: endpoint })
      if (environmentEndpoint !== undefined)
        modelPolicy = {
          ...modelPolicy,
          runtime: { ...(modelPolicy.runtime || {}), ollama_url: ollama.url },
        }
    } else throw Error("Unknown model provider")
    ollama = await prepareRoleProvider(ollama, modelPolicy, policyRole, {
      root,
      run: v.run,
      overrides,
      ...(v["resume-local-budget-ms"]
        ? {
            additionalBudgetMs: Number(v["resume-local-budget-ms"]),
            extensionReason:
              "Resume preserved extraction checkpoints after the configured local inference budget expired.",
          }
        : {}),
    })
    const settings = ollama.executionPolicy.settings
    v.model = settings.model
    v.think = settings.think
    if (command === "extract") {
      extractionScope = settings.extraction_scope ?? extractionScope
      budget = extractionBudget(
        Object.fromEntries(
          budgetFields
            .map((field) => field.replaceAll("-", "_"))
            .map((key) => [key, settings[key]]),
        ),
      )
    }
  }
  if (command === "knowledge-draft")
    return withLock(root, "run-" + v.run, () => {
      if (!v.review) throw Error("Explicit knowledge draft input JSON required")
      return writeKnowledgeDraft(root, v.run, JSON.parse(fs.readFileSync(v.review, "utf8")), {
        vault: v.vault || "vault",
        ollama,
        model: v.model,
      })
    })
  if (command === "inventory")
    return withLock(root, "run-" + v.run, () =>
      saveRetrospectiveInventory(root, v.run, v.vault || "vault"),
    )
  if (command === "review-legacy-empty") {
    if (!v.review || v.url || v.channel || v["source-run"] || v["approved-run"])
      throw Error("Explicit empty-record review JSON and source vault required")
    return withLock(root, "legacy-empty-review", () =>
      saveEmptyLegacyReview(
        root,
        v.run,
        v.vault || "vault",
        JSON.parse(fs.readFileSync(v.review, "utf8")),
      ),
    )
  }
  if (command === "reconcile-approved-inventory") {
    const runId = v["daily-run"]
    if (
      !runId ||
      !/^[a-zA-Z0-9_-]+$/.test(runId) ||
      !v["drive-snapshot"] ||
      !v["drive-readback"] ||
      !v.inventory
    )
      throw Error(
        "Drive reconciliation requires --daily-run --drive-snapshot --drive-readback --inventory",
      )
    const privateBase = path.resolve(root),
      driveBase = path.resolve(".local/drive-sync"),
      snapshotPath = path.resolve(v["drive-snapshot"]),
      readbackPath = path.resolve(v["drive-readback"]),
      inventoryPath = path.resolve(v.inventory)
    for (const [label, file, base] of [
      ["Drive snapshot", snapshotPath, driveBase],
      ["Drive readback", readbackPath, driveBase],
      ["Authoring inventory", inventoryPath, privateBase],
    ]) {
      if (file === base || !file.startsWith(base + path.sep))
        throw Error(`${label} must be an existing file inside its private evidence directory`)
      const securedPath = safePath(base, path.relative(base, file))
      if (!fs.statSync(securedPath).isFile())
        throw Error(`${label} must be an existing file inside its private evidence directory`)
    }
    return withLock(root, "daily-acquisition", async () => {
      const currentInventory = await retrospectiveInventory(v.vault || "vault", {
        reviewRoot: root,
      })
      const storedInventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"))
      const comparable = (value) => sha256(JSON.stringify({ ...value, observed_at: null }))
      if (comparable(currentInventory) !== comparable(storedInventory))
        throw Error("Stored authoring inventory differs from the current vault")

      const handoffRef = generateDailyHandoff({
        root,
        runId,
        vault: v.vault || "vault",
        backlogFile: v.backlog || BACKLOG_PATH,
      })
      const handoff = readJSON(root, handoffRef.path)
      const snapshotBytes = fs.readFileSync(snapshotPath),
        readbackBytes = fs.readFileSync(readbackPath)
      const snapshot = JSON.parse(snapshotBytes),
        readback = JSON.parse(readbackBytes)
      const reconciliation = buildApprovedInventoryReconciliation({
        handoff,
        inventory: storedInventory,
        driveSnapshot: snapshot,
        driveReadback: readback,
        driveReadbackSha256: sha256(readbackBytes),
      })
      reconciliation.inputs = {
        handoff_sha256: sha256(fs.readFileSync(safePath(root, handoffRef.path))),
        inventory_sha256: sha256(fs.readFileSync(inventoryPath)),
        drive_snapshot_file_sha256: sha256(snapshotBytes),
        drive_readback_sha256: sha256(readbackBytes),
      }
      const receiptIdentity = sha256(JSON.stringify(reconciliation.inputs))
      const output = `daily/runs/${runId}/drive-reconciliations/${receiptIdentity}.json`
      const existing = readJSON(root, output)
      if (existing && JSON.stringify(existing.inputs) !== JSON.stringify(reconciliation.inputs))
        throw Error("Drive reconciliation input identity collision")
      const receipt = existing
        ? { path: output, sha256: sha256(fs.readFileSync(safePath(root, output))) }
        : atomicCreate(root, output, reconciliation)
      const stored = existing || reconciliation
      return {
        ...stored.drive_snapshot,
        candidate_count: stored.candidate_count,
        classification_counts: stored.classification_counts,
        duplicate_source_groups: stored.duplicate_source_groups.length,
        candidate_published: stored.candidate_published,
        drive_written: stored.drive_written,
        public_verified: stored.public_verified,
        receipt: receipt.path,
        receipt_sha256: receipt.sha256,
      }
    })
  }
  if (command === "prepare-identity-review-batch") {
    const runId = v["daily-run"]
    if (!runId || !/^[a-zA-Z0-9_-]+$/.test(runId) || !v.reconciliation)
      throw Error("Identity review batch requires --daily-run and --reconciliation")
    const reconciliationPath = path.resolve(v.reconciliation),
      privateBase = path.resolve(root)
    if (
      reconciliationPath === privateBase ||
      !reconciliationPath.startsWith(privateBase + path.sep)
    )
      throw Error(
        "Reconciliation receipt must be an existing file inside the private research root",
      )
    const securedReconciliationPath = safePath(root, path.relative(privateBase, reconciliationPath))
    if (!fs.statSync(securedReconciliationPath).isFile())
      throw Error(
        "Reconciliation receipt must be an existing file inside the private research root",
      )

    return withLock(root, "daily-acquisition", () => {
      const reconciliationBytes = fs.readFileSync(securedReconciliationPath)
      const reconciliation = JSON.parse(reconciliationBytes)
      if (
        reconciliation.schema !== "research-drive-approval-reconciliation/v1" ||
        reconciliation.daily_run !== runId
      )
        throw Error("A reconciliation receipt for the requested daily run is required")
      const handoffDirectory = safePath(root, `daily/runs/${runId}/handoffs`)
      const handoffMatches = fs
        .readdirSync(handoffDirectory)
        .filter((name) => name.endsWith(".json"))
        .map((name) => {
          const relative = `daily/runs/${runId}/handoffs/${name}`,
            bytes = fs.readFileSync(safePath(root, relative))
          return { relative, bytes, sha256: sha256(bytes) }
        })
        .filter((entry) => entry.sha256 === reconciliation.inputs?.handoff_sha256)
      if (handoffMatches.length !== 1)
        throw Error(
          "Pinned editorial handoff for the reconciliation receipt is missing or ambiguous",
        )
      const handoff = JSON.parse(handoffMatches[0].bytes)
      const batch = buildCandidateEvidenceReviewBatch({
        root,
        handoff,
        handoffSha256: handoffMatches[0].sha256,
        reconciliation,
        reconciliationSha256: sha256(reconciliationBytes),
      })
      const identity = sha256(JSON.stringify(batch.inputs))
      const output = `daily/runs/${runId}/identity-review-batches/${identity}.json`
      const existing = readJSON(root, output)
      if (existing && JSON.stringify(existing.inputs) !== JSON.stringify(batch.inputs))
        throw Error("Identity review batch input identity collision")
      const receipt = existing
        ? { path: output, sha256: sha256(fs.readFileSync(safePath(root, output))) }
        : atomicCreate(root, output, batch)
      const stored = existing || batch
      return {
        candidate_count: stored.candidate_count,
        source_attempt_count: stored.source_attempt_count,
        source_attempt_counts: stored.source_attempt_counts,
        candidate_approved: stored.candidate_approved,
        candidate_published: stored.candidate_published,
        drive_written: stored.drive_written,
        public_verified: stored.public_verified,
        receipt: receipt.path,
        receipt_sha256: receipt.sha256,
      }
    })
  }
  if (command === "reconcile-historical-source-evidence") {
    const runId = v["daily-run"]
    if (!runId || !/^[a-zA-Z0-9_-]+$/.test(runId) || !v.reconciliation || !v["review-batch"])
      throw Error(
        "Historical source reconciliation requires --daily-run --reconciliation --review-batch",
      )
    const privateBase = path.resolve(root)
    const resolveReceipt = (inputPath, label) => {
      const absolute = path.resolve(inputPath)
      if (absolute === privateBase || !absolute.startsWith(privateBase + path.sep))
        throw Error(`${label} must be an existing file inside the private research root`)
      const secured = safePath(root, path.relative(privateBase, absolute))
      if (!fs.statSync(secured).isFile()) throw Error(`${label} must be an existing file`)
      return secured
    }
    const reconciliationPath = resolveReceipt(v.reconciliation, "Reconciliation receipt"),
      reviewBatchPath = resolveReceipt(v["review-batch"], "Source-evidence batch")

    return withLock(root, "daily-acquisition", () => {
      const reconciliationBytes = fs.readFileSync(reconciliationPath)
      const reconciliation = JSON.parse(reconciliationBytes)
      const reviewBatchBytes = fs.readFileSync(reviewBatchPath)
      const reviewBatch = JSON.parse(reviewBatchBytes)
      if (
        reconciliation.schema !== "research-drive-approval-reconciliation/v1" ||
        reconciliation.daily_run !== runId ||
        reviewBatch.schema !== "research-candidate-source-evidence-review/v1" ||
        reviewBatch.daily_run !== runId
      )
        throw Error("Pinned reconciliation and source-evidence batch for the daily run required")

      const handoffDirectory = safePath(root, `daily/runs/${runId}/handoffs`)
      const handoffMatches = fs
        .readdirSync(handoffDirectory)
        .filter((name) => name.endsWith(".json"))
        .map((name) => {
          const relative = `daily/runs/${runId}/handoffs/${name}`,
            bytes = fs.readFileSync(safePath(root, relative))
          return { bytes, sha256: sha256(bytes) }
        })
        .filter((entry) => entry.sha256 === reconciliation.inputs?.handoff_sha256)
      if (handoffMatches.length !== 1)
        throw Error(
          "Pinned editorial handoff for the reconciliation receipt is missing or ambiguous",
        )

      const handoff = JSON.parse(handoffMatches[0].bytes)
      const result = buildHistoricalSourceReconciliation({
        root,
        handoff,
        handoffSha256: handoffMatches[0].sha256,
        reconciliation,
        reconciliationSha256: sha256(reconciliationBytes),
        reviewBatch,
        reviewBatchSha256: sha256(reviewBatchBytes),
        reconcilerSha256: sha256(
          fs.readFileSync("scripts/research/historical-source-reconciliation.mjs"),
        ),
      })
      const identity = sha256(JSON.stringify(result.inputs))
      const output = `daily/runs/${runId}/historical-source-reconciliations/${identity}.json`
      const existing = readJSON(root, output)
      if (existing && JSON.stringify(existing.inputs) !== JSON.stringify(result.inputs))
        throw Error("Historical source reconciliation input identity collision")
      const receipt = existing
        ? { path: output, sha256: sha256(fs.readFileSync(safePath(root, output))) }
        : atomicCreate(root, output, result)
      const stored = existing || result
      return {
        candidate_count: stored.candidate_count,
        candidates_with_historical_sources: stored.candidates_with_historical_sources,
        historical_source_version_count: stored.historical_source_version_count,
        historical_parse_count: stored.historical_parse_count,
        candidate_status_counts: stored.candidate_status_counts,
        comparison_counts: stored.comparison_counts,
        run_validation_failure_count: stored.run_validation_failure_count,
        candidate_approved: stored.candidate_approved,
        candidate_published: stored.candidate_published,
        drive_written: stored.drive_written,
        public_verified: stored.public_verified,
        receipt: receipt.path,
        receipt_sha256: receipt.sha256,
      }
    })
  }
  if (command === "note-review")
    return withLock(root, "run-" + v.run, () => {
      if (!v.review) throw Error("Explicit canonical note review JSON required")
      return approveNoteReview(root, v.run, JSON.parse(fs.readFileSync(v.review, "utf8")), {
        vault: v.vault || "vault",
      })
    })
  if (command === "preview") {
    const specification = v.review ? JSON.parse(fs.readFileSync(v.review, "utf8")) : null
    return withLock(root, "run-" + v.run, () =>
      privatePreview(root, v.run, v["approved-run"] || [], {
        vault: v.vault || "vault",
        knowledgeRuns: v["knowledge-run"] || [],
        ...(specification
          ? specification.schema === "research-legacy-transition-batch/v1"
            ? { legacyReviews: legacyTransitionBatch(specification) }
            : { editionSpec: specification }
          : {}),
      }),
    )
  }
  if (command === "source-register")
    return withLock(root, "run-" + v.run, async () => {
      const urls = new Set(),
        inputFiles = []
      const visit = (value) => {
        if (typeof value === "string" && /^https?:\/\//.test(value)) urls.add(value)
        else if (Array.isArray(value)) value.forEach(visit)
        else if (value && typeof value === "object") Object.values(value).forEach(visit)
      }
      for (const file of [
        "data/research-source-channels.json",
        "data/research-watchlist.json",
        "data/research-acquisition.json",
      ]) {
        const bytes = fs.readFileSync(file)
        visit(JSON.parse(bytes))
        inputFiles.push({ path: file, sha256: sha256(bytes) })
      }
      const renders = safePath(root, "renders")
      for (const item of fs.existsSync(renders)
        ? fs.readdirSync(renders, { withFileTypes: true })
        : []) {
        if (item.isSymbolicLink()) throw Error("Symlink in render source references")
        if (!item.isDirectory()) continue
        const relative = `renders/${item.name}/manifest.json`,
          file = safePath(root, relative)
        const bytes = fs.readFileSync(file),
          manifest = JSON.parse(bytes)
        if (
          manifest.capture_id !== item.name ||
          sha256(fs.readFileSync(safePath(root, `renders/${item.name}/body.html`))) !==
            manifest.body_sha256 ||
          sha256(
            JSON.stringify([
              manifest.original_source_version_id,
              manifest.body_sha256,
              manifest.resources,
            ]),
          ) !== item.name
        )
          throw Error("Render source reference hash mismatch")
        for (const resource of manifest.resources)
          if (
            ["captured", "not_modified"].includes(resource.status) &&
            resource.source_version_id?.startsWith(sourceId(resource.url) + ":")
          )
            urls.add(resource.url)
        inputFiles.push({ path: relative, sha256: sha256(bytes) })
      }
      const referencePath = `runs/${v.run}/source-url-inputs.json`
      atomicWrite(root, referencePath, {
        schema: "source-url-inputs/v1",
        observed_at: new Date().toISOString(),
        urls: [...urls].sort(),
        input_files: inputFiles,
      })
      const register = buildSourceRegister(root, { url_reference_path: referencePath })
      atomicWrite(root, `runs/${v.run}/source-register.json`, register)
      return {
        path: path.resolve(root, `runs/${v.run}/source-register.json`),
        versions: register.sources.length,
        unresolved: register.unresolved_versions.length,
        metadata_complete: register.metadata_complete,
        candidate_published: false,
      }
    })
  if (command === "reparse" && !v["source-run"]) throw Error("Reparse requires --source-run")
  if (command === "gold-case") {
    if (!v["source-run"] || !v.review) throw Error("--source-run and --review required")
    return saveEvaluationCase(
      root,
      v.run,
      v["source-run"],
      JSON.parse(fs.readFileSync(v.review, "utf8")),
    )
  }
  if (command === "evaluation-import-candidate") {
    if (!v["case-id"] || !v["candidate-run"]) throw Error("--case-id and --candidate-run required")
    return importEvaluationCandidate(root, v.run, v["case-id"], v["candidate-run"])
  }
  if (command === "evaluation-review") {
    if (!v["case-id"] || !v["candidate-run"] || !v.review)
      throw Error("--case-id, --candidate-run and --review required")
    return saveEvaluationAdjudication(
      root,
      v.run,
      v["case-id"],
      v["candidate-run"],
      JSON.parse(fs.readFileSync(v.review, "utf8")),
    )
  }
  if (command === "queries") {
    const watchlist = JSON.parse(fs.readFileSync("data/research-watchlist.json"))
    const dailyBasis = v["daily-run"] ? loadDailySearchBasis(root, v["daily-run"]) : null
    const date =
      v.date || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date())
    if (dailyBasis && date !== dailyBasis.reference.kst_day)
      throw Error("Search date must match the verified daily acquisition day")
    const all = editions("vault")
    const library = briefingLibrary(
      "vault",
      all,
      new Map(all.map((i) => [i.slug, extractArticles(i)])),
      { requireLatest: false },
    )
    const observedAt =
      readJSON(root, `runs/${v.run}/search-plan/context.json`)?.window?.discovery_end ||
      new Date().toISOString()
    const window = researchWindow(
      library.latest.cutoff,
      observedAt,
      readBacklog(),
      library.issues,
      { approvalRoot: root },
    )
    const context = buildSearchContext(
      watchlist,
      window,
      dailyBasis?.coverage || readJSON(root, `runs/${v.run}/coverage.json`) || [],
    )
    if (dailyBasis) context.daily_basis = dailyBasis.reference
    const q = await planSearchQueries(root, v.run, ollama, {
      model: v.model,
      date,
      context,
      manufacturers: watchlist.robot_manufacturers || [],
      dailyBasis: dailyBasis?.reference,
    })
    return { queries: q.queries.length, candidate_published: false }
  }
  if (command === "localize-queries") {
    const q = v.query
      ? JSON.parse(fs.readFileSync(v.query, "utf8"))
      : readJSON(root, `runs/${v.run}/queries.json`)
    if (!q?.queries?.length) throw Error("Source queries are required")
    const watchlist = JSON.parse(fs.readFileSync("data/research-watchlist.json"))
    const result = await planSearchQueries(root, v.run, ollama, {
      sourcePlan: q,
      model: v.model,
      manufacturers: watchlist.robot_manufacturers || [],
      date:
        v.date ||
        q.observation_date ||
        new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()),
    })
    return {
      queries: result.queries.length,
      localized: result.localization?.slots.length || 0,
      candidate_published: false,
    }
  }
  if (command === "search") {
    const result = await withLock(root, "run-" + v.run, async () => {
      const q = v.query ? JSON.parse(fs.readFileSync(v.query, "utf8")) : loadSearchPlan(root, v.run)
      if (!q?.queries?.length) throw Error("Generate or supply search queries first")
      if (["research-search-plan/v1", "research-search-plan/v2"].includes(q.schema))
        validateCompleteSearchPlan(q)
      if (
        q.daily_basis &&
        JSON.stringify(q.daily_basis) !==
          JSON.stringify(loadDailySearchBasis(root, q.daily_basis.daily_run).reference)
      )
        throw Error("Daily acquisition basis changed after search planning")
      validateSearchQueries(q.queries)
      const state = new RunState(
        root,
        v.run,
        {
          queries_sha256: sha256(JSON.stringify(q.queries)),
          daily_basis_sha256: q.daily_basis ? sha256(JSON.stringify(q.daily_basis)) : null,
          module_sha256: sha256(fs.readFileSync("scripts/research/search.mjs")),
          service: process.env.SEARXNG_URL || "managed-local",
        },
        { scope: "search" },
      )
      return process.env.SEARXNG_URL
        ? discoverSearch(root, v.run, new SearxSearch(), q.queries, { state })
        : withLocalSearch(root, (search, health) => {
            atomicWrite(root, `runs/${v.run}/search-runtime-${health.owner}.json`, health)
            atomicWrite(root, `runs/${v.run}/search-runtime.json`, health)
            return discoverSearch(root, v.run, search, q.queries, { state })
          })
    })
    if (v["merge-backlog"])
      await mergeBacklog(".local/research/candidate-backlog.json", result.candidates)
    return {
      queries: result.records.length,
      discovered: result.candidates.length,
      failures: result.records.filter((r) => r.status === "failed"),
      engine_failures: result.records
        .filter((r) => r.failures?.length)
        .map((r) => ({ query: r.query, failures: r.failures })),
      candidate_published: false,
    }
  }
  if (command === "archive") {
    return withLock(root, "run-" + v.run, async () => {
      const existing = readJSON(root, `runs/${v.run}/archive-manifest.json`)
      if (existing?.schema === "research-archive/v2")
        throw Error("Use archive-closure to preserve an existing portable dependency archive")
      const manifest = archiveManifest(root, v.run)
      if (
        existing?.schema === manifest.schema &&
        existing.run_id === manifest.run_id &&
        JSON.stringify(existing.files) === JSON.stringify(manifest.files)
      )
        manifest.created_at = existing.created_at
      atomicWrite(root, `runs/${v.run}/archive-manifest.json`, manifest)
      const packageReceipt = packageResearchArchive(root, v.run)
      const packageReceiptPath = `archive-staging/${v.run}/package-receipt.json`
      const existingPackageReceipt = readJSON(root, packageReceiptPath)
      if (
        existingPackageReceipt &&
        JSON.stringify(existingPackageReceipt) !== JSON.stringify(packageReceipt)
      )
        throw Error("Research package receipt changed; use a new run ID")
      if (!existingPackageReceipt) atomicWrite(root, packageReceiptPath, packageReceipt)
      return {
        files: manifest.files.length,
        source_versions: manifest.files.filter((file) => file.drive_root === "Sources").length,
        package: packageReceipt,
        drive_verified: false,
      }
    })
  }
  if (command === "baseline") {
    const b = saveBaseline(root, v.run, "vault")
    return {
      notes: b.notes,
      editions: b.editions,
      counts: b.counts,
      snapshot: `baselines/${v.run}/inventory.json`,
    }
  }
  if (["review", "deep-review", "draft", "correct", "approve", "editorial-check"].includes(command))
    return withLock(root, "run-" + v.run, async () => {
      const extracted = readJSON(root, `runs/${v.run}/claims.json`),
        documents = readJSON(root, `runs/${v.run}/documents.json`),
        parses = readJSON(root, `runs/${v.run}/parses.json`)
      if (!extracted || !documents) throw Error("Extract sources first")
      assertStoredEvidence(root, documents, parses)
      if (command === "editorial-check") {
        const reviewed = readJSON(root, `runs/${v.run}/reviewed-claims.json`)
        if (!reviewed) throw Error("Reviewed claims required for editorial quality checks")
        await assertProcessedFactReview(root, v.run, reviewed)
        const processed = isProcessedRun(root, v.run)
        const draft = processed
          ? loadProcessedDraft(root, v.run, reviewed, documents, parses)
          : readJSON(root, `runs/${v.run}/draft.json`)
        if (!draft) throw Error("Exact draft required for editorial quality checks")
        const decision = readJSON(root, `runs/${v.run}/editorial-review.json`)
        const current = inspectReaderQuality(draft, reviewed.claims, {
          publishedAt: decision?.published_at,
        })
        const reference =
          processed && readJSON(root, `runs/${v.run}/draft-generation-reference.json`)
        const checkpoint =
          reference && readJSON(root, `runs/${reference.run}/model-draft-checkpoint.json`)
        const original = checkpoint && readJSON(root, checkpoint.output_path)
        return {
          current,
          original: original ? inspectReaderQuality(original, reviewed.claims) : null,
          model_calls: 0,
          approval_changed: false,
          candidate_published: false,
        }
      }
      if (command === "correct") {
        if (!v.review) throw Error("Explicit draft correction JSON required")
        const decision = JSON.parse(fs.readFileSync(v.review, "utf8")),
          originalPath = `runs/${v.run}/draft.json`,
          originalBytes = fs.readFileSync(safePath(root, originalPath)),
          original = JSON.parse(originalBytes),
          reviewed = readJSON(root, `runs/${v.run}/reviewed-claims.json`)
        if (!reviewed) throw Error("Reviewed claims required for correction")
        await assertProcessedFactReview(root, v.run, reviewed)
        const allowed = ["draft_id", "reviewer", "reason", "reviewed_at", "draft"]
        if (Object.keys(decision).some((key) => !allowed.includes(key)))
          throw Error("Unknown draft correction field")
        assertReviewDate(decision.reviewed_at, {
          notBefore: reviewed.claims.map((c) => c.review.reviewed_at),
        })
        if (original.draft_id !== draftFingerprint(original.draft, original.deep_context))
          throw Error("Original draft changed before correction")
        const inputHash = sha256(JSON.stringify(decision))
        if (original.correction_input_sha256 === inputHash)
          return { status: "editorial_review", draft_id: original.draft_id, reused: true }
        const { draft: replacement, ...review } = decision,
          corrected = {
            ...correctDraft(original, replacement, reviewed.claims, review),
            correction_input_sha256: inputHash,
          },
          historyPath = `runs/${v.run}/drafts/${original.draft_id}.json`,
          existingHistory = safePath(root, historyPath)
        if (
          fs.existsSync(existingHistory) &&
          sha256(fs.readFileSync(existingHistory)) !== sha256(originalBytes)
        )
          throw Error("Original draft history differs; use a separate review")
        atomicWrite(root, historyPath, originalBytes)
        atomicWrite(root, `runs/${v.run}/corrections/${inputHash}.json`, decision)
        atomicWrite(root, originalPath, corrected)
        atomicWrite(
          root,
          `runs/${v.run}/preview.md`,
          draftMarkdown(corrected, reviewed.claims, documents),
        )
        return {
          status: corrected.status,
          draft_id: corrected.draft_id,
          previous_draft_id: original.draft_id,
          problems: corrected.problems,
          candidate_published: false,
        }
      }
      if (command === "approve") {
        if (!v.review) throw Error("Explicit editorial review JSON required")
        let draft = readJSON(root, `runs/${v.run}/draft.json`)
        const reviewed = readJSON(root, `runs/${v.run}/reviewed-claims.json`)
        if (!draft || !reviewed) throw Error("Reviewed claims and exact draft required")
        await assertProcessedFactReview(root, v.run, reviewed)
        if (isProcessedRun(root, v.run))
          draft = loadProcessedDraft(root, v.run, reviewed, documents, parses)
        const decision = JSON.parse(fs.readFileSync(v.review, "utf8")),
          article = approvedArticle(draft, reviewed.claims, documents, decision, parses)
        // Existing immutable approvals remain readable. A new approval checks
        // current reader rules without rewriting historical model checkpoints.
        const existing = readJSON(root, `runs/${v.run}/approved-article.json`)
        const conceptReceipt =
          !existing || decision.concept_review
            ? evaluateArticleConceptReview(
                root,
                article,
                draft,
                reviewed.claims,
                parses,
                decision,
                { vault: v.vault || "vault" },
              )
            : null
        const conceptPath = `runs/${v.run}/article-concept-review.json`
        const previousConcepts = readJSON(root, conceptPath)
        if (previousConcepts && JSON.stringify(previousConcepts) !== JSON.stringify(conceptReceipt))
          throw Error("Article concept review receipt changed; use a new run")
        const quality = existing
          ? null
          : inspectReaderQuality(draft, reviewed.claims, {
              publishedAt: decision.published_at,
            })
        if (quality) assertReaderQuality(quality, decision)
        let qualityPath = null
        if (quality) {
          const implementationHash = sha256(
            fs.readFileSync(new URL("./research/reader-quality.mjs", import.meta.url)),
          )
          qualityPath = `runs/${v.run}/editorial-quality/${draft.draft_id}-${implementationHash}.json`
          const receipt = {
            ...quality,
            implementation_sha256: implementationHash,
            editorial_decision_sha256: sha256(JSON.stringify(decision)),
            repetition_checked: decision.reader_quality_review?.repetition_checked === true,
          }
          const previous = readJSON(root, qualityPath)
          if (previous && sha256(JSON.stringify(previous)) !== sha256(JSON.stringify(receipt)))
            throw Error("Reader quality approval receipt changed; use a new run")
          if (!previous) atomicCreate(root, qualityPath, receipt)
        }
        if (conceptReceipt && !previousConcepts) atomicCreate(root, conceptPath, conceptReceipt)
        return {
          ...recordArticleApproval(root, v.run, decision, article),
          reader_quality: quality,
          reader_quality_receipt: qualityPath,
          concept_review_receipt: conceptReceipt ? conceptPath : null,
          candidate_published: false,
        }
      }
      if (command === "review") {
        if (!v.review) throw Error("--review JSON decision file required")
        const decisions = JSON.parse(fs.readFileSync(v.review, "utf8"))
        const processed = isProcessedRun(root, v.run)
        const envelope = processed
          ? await reviewProcessedClaims(root, v.run, decisions)
          : {
              ...extracted,
              claims: recordFactReview(extracted.claims, decisions.claims, decisions, parses),
            }
        const claims = envelope.claims
        if (!processed) atomicWrite(root, `runs/${v.run}/reviewed-claims.json`, envelope)
        return {
          verified: claims.filter((c) => c.review.status === "verified").length,
          deferred: claims.filter((c) => c.review.status === "deferred").length,
          rejected: claims.filter((c) => c.review.status === "rejected").length,
        }
      }
      const reviewed = readJSON(root, `runs/${v.run}/reviewed-claims.json`)
      await assertProcessedFactReview(root, v.run, reviewed)
      if (command === "deep-review") {
        if (!reviewed || !v.review)
          throw Error("Reviewed claims and explicit deep review JSON required")
        const decision = JSON.parse(fs.readFileSync(v.review, "utf8"))
        const context = recordDeepDiveReview(
          decision.input,
          reviewed.claims,
          parses,
          documents,
          decision.review,
        )
        atomicWrite(root, `runs/${v.run}/deep-context.json`, context)
        return { kind: context.input.kind, status: "basis_reviewed", candidate_published: false }
      }
      const claims = (reviewed || extracted).claims
      if (command === "draft") {
        const previous = readJSON(root, `runs/${v.run}/draft.json`)
        if (
          previous?.correction_review ||
          fs.existsSync(safePath(root, `runs/${v.run}/approved-article.json`))
        )
          throw Error("Draft is already corrected or approved; use a new run for model drafting")
      }
      const deepContext = v.deep ? readJSON(root, `runs/${v.run}/deep-context.json`) : null
      if (v.deep && !deepContext) throw Error("Review deep-dive source context first")
      const generated = await writeDraftCheckpoint(
        root,
        v.run,
        ollama,
        claims,
        {
          model: v.model,
          think: false,
          provisional: v.provisional,
          deepContext,
          parses,
          documents,
        },
        await ollama.metadata(v.model),
      )
      const draft = generated.record
      atomicWrite(root, `runs/${v.run}/draft.json`, draft)
      atomicWrite(root, `runs/${v.run}/preview.md`, draftMarkdown(draft, claims, documents))
      return {
        status: draft.status,
        problems: draft.problems,
        reused: generated.reused,
        candidate_published: false,
        preview: path.resolve(root, `runs/${v.run}/preview.md`),
      }
    })
  if (command === "scan-list") return executeListScan(v)
  return withLock(root, "run-" + v.run, async () => {
    if (v["source-run"] === v.run) throw Error("Output run must differ from source run")
    const stored = v["source-run"]
      ? command === "reparse"
        ? loadCapturedStagesForReparse(root, v["source-run"])
        : loadStoredSourceRun(root, v["source-run"], { allowUnacquired: false })
      : null
    const input = {
      command,
      urls: v.url || [],
      channels: v.channel || [],
      model: v.model,
      think: v.think,
      ...(ollama?.executionPolicy ? { model_policy: ollama.executionPolicy } : {}),
      ...(budget ? { extraction_budget: budget } : {}),
      ...(stored ? { stored_source: stored.identity } : {}),
      ...(v["retain-previous-parses"]
        ? {
            retain_previous_parses: true,
            parser_sha256: sha256(fs.readFileSync("scripts/research/parser.mjs")),
          }
        : {}),
      ...(!stored ? { fetcher_sha256: sha256(fs.readFileSync("scripts/research/fetch.mjs")) } : {}),
      registry_sha256: sha256(fs.readFileSync("data/research-acquisition.json")),
      watchlist_sha256: sha256(fs.readFileSync("data/research-watchlist.json")),
      channels_sha256: sha256(fs.readFileSync("data/research-source-channels.json")),
      source_recipes_sha256: sha256(fs.readFileSync("data/research-source-recipes.json")),
      source_recipe_resolver_sha256: sha256(fs.readFileSync("scripts/research/source-recipes.mjs")),
      collector_sha256: sha256(fs.readFileSync("scripts/research/discovery.mjs")),
      policy_sha256: sha256(fs.readFileSync("scripts/research/source-policy.mjs")),
      worker_sha256: sha256(fs.readFileSync("integrations/research-worker/worker.py")),
    }
    const run = new RunState(root, v.run, input),
      fetcher = new SourceFetcher(root)
    if (command === "discover") {
      const routes = registry(
        JSON.parse(fs.readFileSync("data/research-source-channels.json")),
        JSON.parse(fs.readFileSync("data/research-watchlist.json")),
        JSON.parse(fs.readFileSync("data/research-acquisition.json")),
      )
      const wanted = v.channel?.length
        ? v.channel.map((id) => {
            const c = routes.find((r) => r.channel_id === id)
            if (!c) throw Error("Unknown channel: " + id)
            return c
          })
        : routes
      const results = []
      // Bounded four-host discovery; SourceFetcher serializes each host.
      for (let i = 0; i < wanted.length; i += 4)
        results.push(
          ...(await Promise.all(
            wanted
              .slice(i, i + 4)
              .map((c) =>
                run.stage("channel-" + c.channel_id, c, () => discoverChannel(root, fetcher, c)),
              ),
          )),
        )
      const candidates = results.flatMap((r) => r.candidates)
      atomicWrite(root, `runs/${v.run}/coverage.json`, coverageGrid(results))
      atomicWrite(root, `runs/${v.run}/candidates.json`, candidates)
      if (v["merge-backlog"])
        await mergeBacklog(".local/research/candidate-backlog.json", candidates)
      return {
        routes: results.length,
        discovered: candidates.length,
        failures: results
          .filter((r) => r.status !== "partial")
          .map((r) => ({ id: r.channel_id, status: r.status })),
        candidate_published: false,
      }
    }
    if (!stored && !v.url?.length) throw Error("At least one --url or --source-run required")
    const documents = stored?.documents || [],
      parses =
        command === "reparse" && !v["retain-previous-parses"]
          ? []
          : structuredClone(stored?.parses || [])
    if (command === "reparse") {
      const profiles =
        JSON.parse(fs.readFileSync("data/research-acquisition.json")).article_profiles || []
      // Failed captures remain in documents.json; only readable stored bodies
      // are reparsed. Extraction and evaluation still require acquired sources.
      for (const document of documents.filter((d) =>
        ["captured", "not_modified"].includes(d.fetch_status),
      )) {
        const options =
          profiles.find((p) => new RegExp(p.url_pattern).test(document.final_url))?.options || {}
        retainParse(
          parses,
          await run.stage(
            `parse-${document.source_id}-${document.body_sha256.slice(0, 12)}`,
            {
              document,
              options,
              worker_sha256: sha256(fs.readFileSync("integrations/research-worker/worker.py")),
            },
            () => parseDocument(root, document, options),
          ),
        )
      }
    }
    for (const url of v.url || []) {
      const id = sourceId(url)
      const document = await run.stage("fetch-" + id, { url }, () =>
        fetchWithPolicy(root, fetcher, url),
      )
      documents.push(document)
      const profiles =
        JSON.parse(fs.readFileSync("data/research-acquisition.json")).article_profiles || []
      const options =
        profiles.find((p) => new RegExp(p.url_pattern).test(document.final_url))?.options || {}
      if (["captured", "not_modified"].includes(document.fetch_status))
        parses.push(
          await run.stage(
            "parse-" + id,
            {
              document,
              options,
              worker_sha256: sha256(fs.readFileSync("integrations/research-worker/worker.py")),
            },
            () => parseDocument(root, document, options),
          ),
        )
    }
    if (v["retain-previous-parses"]) assertStoredEvidence(root, documents, parses)
    atomicWrite(root, `runs/${v.run}/documents.json`, documents)
    atomicWrite(root, `runs/${v.run}/parses.json`, parses)
    if (command === "extract") {
      if (documents.some((d) => !["captured", "not_modified"].includes(d.fetch_status)))
        throw Error("A source was not acquired; inspect documents.json")
      assertStoredEvidence(root, documents, parses)
      const sourceSelection = v["source-run"]
        ? readJSON(root, `runs/${v["source-run"]}/source-selection.json`)
        : null
      const sourceBundle = v["source-run"]
        ? readJSON(root, `runs/${v["source-run"]}/source-bundle.json`)
        : null
      const sourceHashes = {
        documents_sha256: sha256(JSON.stringify(documents)),
        parses_sha256: sha256(JSON.stringify(parses)),
      }
      const explicitlyGrouped =
        !v.url?.length &&
        [sourceSelection, sourceBundle].some(
          (manifest) =>
            manifest &&
            manifest.documents_sha256 === sourceHashes.documents_sha256 &&
            manifest.parses_sha256 === sourceHashes.parses_sha256,
        )
      const candidateKey = extractionCandidateKey(documents, {
        candidateKey: v["candidate-key"],
        explicitlyGrouped,
      })
      const metadata = await ollama.metadata(v.model)
      const claims = await run.stage(
        "claims",
        {
          parse_ids: parses.map((p) => p.parse_id),
          metadata,
          prompt_module_sha256: sha256(fs.readFileSync("scripts/research/claims.mjs")),
          model: v.model,
          think: v.think,
          ...(ollama.executionPolicy ? { model_policy: ollama.executionPolicy } : {}),
          budget,
          extraction_scope: extractionScope,
        },
        () =>
          extractClaims(ollama, parses, {
            ...budget,
            extraction_scope: extractionScope,
            candidate_key: candidateKey,
            model: v.model,
            think: v.think === "false" ? false : v.think === "true" ? true : v.think,
            checkpoint: (id, request, action) =>
              run.stage(
                "claims-batch-" + id,
                {
                  metadata,
                  ...(ollama.executionPolicy ? { model_policy: ollama.executionPolicy } : {}),
                  candidate_key: candidateKey,
                  request,
                },
                action,
              ),
          }),
      )
      return {
        claims: claims.claims.length,
        structural_pass: claims.claims.filter((c) => c.review.structural_pass).length,
        fact_review_required: true,
        candidate_published: false,
      }
    }
    return {
      sources: documents.map((d) => ({ url: d.original_url, status: d.fetch_status })),
      parses: parses.map((p) => ({ id: p.parse_id, status: p.status, blocks: p.blocks.length })),
      candidate_published: false,
    }
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("scripts/research.mjs")) {
  main()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((e) => {
      console.error(e.message)
      process.exitCode = 1
    })
}
