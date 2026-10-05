import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { assertReviewDate } from "./dates.mjs"
import { loadStoredSourceRun, assertStoredEvidence } from "./parser.mjs"
import {
  loadCompletedExtraction,
  assertProcessingExtractionOrigin,
} from "./extraction-checkpoint.mjs"
import { loadRoleBudget } from "./model-policy.mjs"
import { readJSON, safePath, atomicCreate, withLock } from "./run-state.mjs"

const decisions = {
  extraction_missed_event: "empty_extraction_recovery_required",
  source_review_deferred: "empty_extraction_source_deferred",
  no_publishable_event: "empty_extraction_no_event",
}
const eventChecks = [
  "new_product",
  "research_result",
  "customer_adoption",
  "contract",
  "strategy_change",
  "operating_result",
  "technical_change",
]
function runId(run) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(run || "")) throw Error("Exact processing run required")
}

// Reuse the sealed extraction and the original model ledger, including when a
// later assessment failed. No installed model, retry or publication is involved.
export function inspectEmptyExtraction(root, run, seen = new Set()) {
  runId(run)
  if (seen.has(run) || seen.size >= 16) throw Error("Cyclic extraction origin")
  seen.add(run)
  const { documents, parses } = loadStoredSourceRun(root, run)
  const bytes = loadCompletedExtraction(root, run, documents, parses)
  const extracted = JSON.parse(bytes)
  const base = `runs/${run}/`
  const inputBytes = fs.readFileSync(safePath(root, base + "source-processing-input.json"))
  const input = JSON.parse(inputBytes)
  const state = readJSON(root, base + "processing/state.json")
  const origin = loadStoredSourceRun(root, input.source_run)
  if (
    ["reviewed-claims.json", "draft.json", "approved-article.json"].some((file) =>
      fs.existsSync(safePath(root, base + file)),
    )
  )
    throw Error("Empty extraction cannot carry fact review, draft or approval")
  if (
    !Array.isArray(extracted.claims) ||
    extracted.claims.length ||
    !extracted.provenance ||
    extracted.development_fixture ||
    state.candidate_published !== false ||
    input.source_identity?.source_run !== input.source_run ||
    input.source_identity.documents_sha256 !== sha256(JSON.stringify(documents)) ||
    input.source_identity.parses_sha256 !== sha256(JSON.stringify(parses)) ||
    origin.identity.documents_sha256 !== input.source_identity.documents_sha256 ||
    origin.identity.parses_sha256 !== input.source_identity.parses_sha256
  )
    throw Error("Completed empty extraction with exact source identity required")
  assertProcessingExtractionOrigin(root, input, documents, parses)
  assertStoredEvidence(root, documents, parses)
  let modelOrigin
  if (input.extraction_run) {
    modelOrigin = inspectEmptyExtraction(root, input.extraction_run, seen).binding.model_origin
  } else {
    if (input.source_extraction_sha256 !== null)
      throw Error("Unsealed empty source claims cannot establish a model extraction")
    const ledger = loadRoleBudget(root, run, "fact_extract")
    if (
      !ledger.attempts.length ||
      ledger.attempts.some((a) => a.status !== "complete") ||
      ledger.binding.model_digest !== extracted.provenance.digest
    )
      throw Error("Completed empty model ledger required")
    modelOrigin = {
      run,
      budget_sha256: sha256(
        fs.readFileSync(safePath(root, base + "model-policy/fact_extract/budget.json")),
      ),
      model: ledger.binding.settings.model,
      digest: ledger.binding.model_digest,
      think: ledger.binding.settings.think,
      calls: ledger.attempts.length,
      wall_ms: ledger.attempts.reduce((n, a) => n + a.wall_ms, 0),
    }
  }
  return {
    documents,
    parses,
    input,
    binding: {
      processing_run: run,
      processing_input_sha256: sha256(inputBytes),
      claims_sha256: sha256(bytes),
      extraction_checkpoint_sha256: state.stages.extraction.result_hash,
      documents_sha256: sha256(JSON.stringify(documents)),
      parses_sha256: sha256(JSON.stringify(parses)),
      model_origin: modelOrigin,
    },
    finished_at: state.stages.extraction.finished_at,
  }
}

function validateReview(root, context, review) {
  if (
    review?.schema !== "editorial-empty-extraction-review/v1" ||
    !Object.hasOwn(decisions, review.decision) ||
    JSON.stringify(review.binding) !== JSON.stringify(context.binding) ||
    typeof review.reviewer !== "string" ||
    !review.reviewer.trim() ||
    typeof review.reason !== "string" ||
    !review.reason.trim() ||
    typeof review.source_read !== "boolean" ||
    review.candidate_published !== false ||
    review.public_approved !== false ||
    (review.decision !== "source_review_deferred" && review.source_read !== true)
  )
    throw Error("Explicit source-bound empty extraction review required")
  if (
    !Array.isArray(review.anchors) ||
    (review.decision !== "source_review_deferred" && !review.anchors.length)
  )
    throw Error("Read-source anchors required")
  for (const anchor of review.anchors) {
    const parse = context.parses.find(
      (p) => p.parse_id === anchor.parse_id && p.source_version_id === anchor.source_version_id,
    )
    const block = parse?.blocks.find((b) => b.block_id === anchor.block_id)
    if (
      !block ||
      typeof anchor.quote !== "string" ||
      !anchor.quote.trim() ||
      !block.text.includes(anchor.quote)
    )
      throw Error("Empty extraction review anchor differs from stored source")
  }
  if (
    review.decision === "no_publishable_event" &&
    (!eventChecks.every((key) => review.event_check?.[key] === false) ||
      typeof review.event_check?.notes !== "string" ||
      !review.event_check.notes.trim() ||
      context.parses.some((p) => p.status !== "extracted" || p.quality?.missing_pages?.length) ||
      context.parses.some((p) => !review.anchors.some((a) => a.parse_id === p.parse_id)))
  )
    throw Error("Complete source and explicit no-event checks required")
  let recovery = null
  if (review.followup_run) {
    if (
      review.decision !== "extraction_missed_event" ||
      review.followup_run === context.binding.processing_run
    )
      throw Error("Positive follow-up is only valid for a missed event")
    runId(review.followup_run)
    const bytes = loadCompletedExtraction(
      root,
      review.followup_run,
      context.documents,
      context.parses,
    )
    const input = readJSON(root, `runs/${review.followup_run}/source-processing-input.json`)
    assertProcessingExtractionOrigin(root, input, context.documents, context.parses)
    const extracted = JSON.parse(bytes)
    const state = readJSON(root, `runs/${review.followup_run}/processing/state.json`)
    if (
      !Array.isArray(extracted.claims) ||
      !extracted.claims.length ||
      extracted.development_fixture ||
      state.candidate_published !== false ||
      input.candidate_key !== context.input.candidate_key
    )
      throw Error("Completed nonempty follow-up extraction required")
    recovery = {
      run: review.followup_run,
      claims_sha256: sha256(bytes),
      claims: extracted.claims.length,
      finished_at: state.stages.extraction.finished_at,
    }
  }
  assertReviewDate(review.reviewed_at, {
    notBefore: [
      context.finished_at,
      ...context.documents.map((d) => d.observed_at),
      recovery?.finished_at,
    ],
  })
  return {
    schema: "research-empty-extraction-review/v1",
    binding: context.binding,
    decision: review.decision,
    status: recovery ? "empty_extraction_recovered" : decisions[review.decision],
    reviewer: review.reviewer,
    reviewed_at: review.reviewed_at,
    recovery,
    model_calls: 0,
    public_approved: false,
    candidate_published: false,
  }
}

export function loadEmptyExtractionResult(root, run) {
  const context = inspectEmptyExtraction(root, run)
  const reference = readJSON(root, `runs/${run}/empty-extraction-review-reference.json`)
  if (!reference)
    return {
      status: "empty_extraction_review",
      claims: 0,
      model_calls: 0,
      public_approved: false,
      candidate_published: false,
    }
  runId(reference.review_run)
  const base = `runs/${reference.review_run}/`
  const reviewBytes = fs.readFileSync(safePath(root, base + "empty-extraction-review-input.json"))
  const resultBytes = fs.readFileSync(safePath(root, base + "empty-extraction-review.json"))
  const expected = validateReview(root, context, JSON.parse(reviewBytes))
  if (
    reference.schema !== "research-empty-extraction-reference/v1" ||
    reference.processing_run !== run ||
    reference.review_sha256 !== sha256(reviewBytes) ||
    reference.result_sha256 !== sha256(resultBytes) ||
    JSON.stringify(JSON.parse(resultBytes)) !== JSON.stringify(expected)
  )
    throw Error("Empty extraction review reference changed")
  return { ...expected, claims: 0, review_run: reference.review_run }
}

function createOnce(root, relative, value) {
  if (fs.existsSync(safePath(root, relative))) {
    if (JSON.stringify(readJSON(root, relative)) !== JSON.stringify(value))
      throw Error("Empty extraction review is immutable")
    return
  }
  atomicCreate(root, relative, value)
}

export async function recordEmptyExtractionReview({ root, run, sourceRun, reviewFile }) {
  runId(run)
  runId(sourceRun)
  if (run === sourceRun) throw Error("Distinct empty extraction review run required")
  return withLock(root, "run-" + sourceRun, async () => {
    const context = inspectEmptyExtraction(root, sourceRun)
    const review = readJSON(root, reviewFile)
    const result = validateReview(root, context, review)
    const base = `runs/${run}/`
    const inputPath = base + "empty-extraction-review-input.json"
    const resultPath = base + "empty-extraction-review.json"
    const pointer = `runs/${sourceRun}/empty-extraction-review-reference.json`
    const previous = readJSON(root, pointer)
    if (previous && previous.review_run !== run)
      throw Error("Empty extraction already reviewed; preserve it and use a new processing run")
    createOnce(root, inputPath, review)
    createOnce(root, resultPath, result)
    createOnce(root, pointer, {
      schema: "research-empty-extraction-reference/v1",
      processing_run: sourceRun,
      review_run: run,
      review_sha256: sha256(fs.readFileSync(safePath(root, inputPath))),
      result_sha256: sha256(fs.readFileSync(safePath(root, resultPath))),
    })
    return loadEmptyExtractionResult(root, sourceRun)
  })
}
