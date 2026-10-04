import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { assertReviewDate, parseResearchDate } from "./dates.mjs"
import { loadStoredSourceRun } from "./parser.mjs"
import { assessEvidenceCheckpoint } from "./evidence-assessment.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"

// Explicit, source-bound typography repair. Never normalize the evidence
// validator itself or change a model verdict, entity, number or source locator.
const typography = (value) =>
  value.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim()
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function applyCorrections({
  root,
  base,
  review,
  sourceRun,
  inputSha,
  claims,
  parses,
  rawBatches,
  correctedBatches,
  originals,
  rejectCheckpoint = true,
}) {
  const touched = new Set()
  for (const correction of review.corrections) {
    const allowed = [
      "batch",
      "claim_id",
      "evidence_index",
      "original_quote",
      "quote",
      "raw_sha256",
      "reason",
    ]
    const batch = correctedBatches[correction.batch - 1]
    const original = rawBatches[correction.batch - 1]
    const row = batch?.output?.assessments?.find((r) => r.claim_id === correction.claim_id)
    const citation = row?.evidence?.[correction.evidence_index]
    const key = JSON.stringify([correction.batch, correction.claim_id, correction.evidence_index])
    const claim = claims.find((c) => c.claim_id === correction.claim_id)
    const block = parses
      .find(
        (p) =>
          p.parse_id === citation?.parse_id &&
          claim?.evidence.some((e) => e.parse_id === p.parse_id),
      )
      ?.blocks.find((b) => b.block_id === citation?.block_id)
    if (
      Object.keys(correction).some((field) => !allowed.includes(field)) ||
      !Number.isInteger(correction.batch) ||
      !Number.isInteger(correction.evidence_index) ||
      correction.evidence_index < 0 ||
      !citation ||
      !block ||
      touched.has(key) ||
      correction.raw_sha256 !== originals[correction.batch - 1]?.sha256 ||
      typeof correction.reason !== "string" ||
      !correction.reason.trim() ||
      typeof correction.quote !== "string" ||
      !correction.quote.trim() ||
      citation.quote !== correction.original_quote ||
      block.text.includes(citation.quote) ||
      !block.text.includes(correction.quote) ||
      typography(citation.quote) !== typography(correction.quote) ||
      (rejectCheckpoint && readJSON(root, base + `batch-${correction.batch}-checkpoint.json`))
    )
      throw Error("Only invalid typography quotes can be explicitly repaired in the same block")
    touched.add(key)
    citation.quote = correction.quote
    batch.quote_review = {
      schema: review.schema,
      source_run: sourceRun,
      input_sha256: inputSha,
      original_response_sha256: sha256(JSON.stringify(original)),
      review_sha256: sha256(JSON.stringify(review)),
      reviewer: review.reviewer,
      reviewed_at: review.reviewed_at,
    }
  }
  return touched.size
}

function authenticateResponse(
  root,
  run,
  index,
  raw,
  input,
  claims,
  documents,
  parses,
  visited = new Set(),
) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(run || "") || visited.has(run) || visited.size >= 16)
    throw Error("Invalid or cyclic quote review provenance")
  visited.add(run)
  const base = `runs/${run}/`
  const ledgerPath = base + "model-policy/evidence_compare/budget.json"
  const ledger = readJSON(root, ledgerPath)
  const { sha256: seal, ...payload } = ledger || {}
  const stored = loadStoredSourceRun(root, run)
  if (
    seal !== sha256(JSON.stringify(payload)) ||
    !Array.isArray(ledger.attempts) ||
    ledger.attempts.some((a) => a.status === "running") ||
    !same(readJSON(root, base + "evidence-assessment/input.json"), input) ||
    !same(readJSON(root, base + "claims.json")?.claims, claims) ||
    !same(stored.documents, documents) ||
    !same(stored.parses, parses) ||
    input.execution_policy_sha256 !== sha256(JSON.stringify(ledger.binding))
  )
    throw Error("Inherited assessment inputs or model ledger changed")
  const direct = ledger.attempts.find(
    (a) =>
      a.status === "complete" &&
      a.result_sha256 === sha256(JSON.stringify(raw)) &&
      same(a.result, raw),
  )
  if (direct) return direct
  const origin = readJSON(root, base + "quote-review-input.json")
  const sourceRun = origin?.source_run
  const originalPath = `runs/${sourceRun}/evidence-assessment/batch-${index}.json`
  const original = origin?.original_responses?.[index - 1]
  if (
    origin?.schema !== "research-reviewed-assessment-input/v1" ||
    origin.original_input_sha256 !== sha256(JSON.stringify(input)) ||
    original?.path !== originalPath ||
    !original.sha256 ||
    !/^[A-Za-z0-9_-]{1,160}$/.test(sourceRun || "")
  )
    throw Error("Original response must match a completed model attempt or reviewed provenance")
  const originalBytes = fs.readFileSync(safePath(root, originalPath))
  const originalLedger = fs.readFileSync(
    safePath(root, `runs/${sourceRun}/model-policy/evidence_compare/budget.json`),
  )
  if (original.sha256 !== sha256(originalBytes) || origin.ledger_sha256 !== sha256(originalLedger))
    throw Error("Inherited quote review source response or ledger changed")
  const review = origin.review
  if (
    review?.schema !== "research-evidence-quote-review/v1" ||
    review.source_run !== sourceRun ||
    review.input_sha256 !== origin.original_input_sha256 ||
    typeof review.reviewer !== "string" ||
    !review.reviewer.trim() ||
    parseResearchDate(review.reviewed_at)?.precision !== "timestamp" ||
    ["source_read", "quote_only", "meaning_unchanged"].some((k) => review[k] !== true) ||
    !Array.isArray(review.corrections) ||
    !review.corrections.length
  )
    throw Error("Inherited quote review lacks explicit source review")
  const sourceRaw = JSON.parse(originalBytes)
  const attempt = authenticateResponse(
    root,
    sourceRun,
    index,
    sourceRaw,
    input,
    claims,
    documents,
    parses,
    visited,
  )
  const rawBatches = [],
    correctedBatches = [],
    originals = []
  rawBatches[index - 1] = sourceRaw
  correctedBatches[index - 1] = structuredClone(sourceRaw)
  originals[index - 1] = original
  const partialReview = {
    ...review,
    corrections: review.corrections.filter((c) => c.batch === index),
  }
  // Metadata pins the full review, not just this batch's corrections.
  applyCorrections({
    root,
    base: `runs/${sourceRun}/evidence-assessment/`,
    review: partialReview,
    sourceRun,
    inputSha: review.input_sha256,
    claims,
    parses,
    rawBatches,
    correctedBatches,
    originals,
    rejectCheckpoint: false,
  })
  const expected = correctedBatches[index - 1]
  if (partialReview.corrections.length)
    expected.quote_review.review_sha256 = sha256(JSON.stringify(review))
  if (!same(expected, raw)) throw Error("Inherited quote review changed non-quote output")
  return attempt
}

export async function reviewEvidenceQuotes({
  root,
  run,
  sourceRun,
  review,
  completeMissing = false,
  createMissingProvider = null,
}) {
  if ([run, sourceRun].some((id) => !/^[A-Za-z0-9_-]{1,160}$/.test(id || "")) || run === sourceRun)
    throw Error("Quote review requires a distinct new assessment run")
  return withLock(root, "run-" + run, async () => {
    const { documents, parses } = loadStoredSourceRun(root, sourceRun)
    const claims = readJSON(root, `runs/${sourceRun}/claims.json`)?.claims
    const base = `runs/${sourceRun}/evidence-assessment/`
    const originalInput = readJSON(root, base + "input.json")
    const ledgerPath = `runs/${sourceRun}/model-policy/evidence_compare/budget.json`
    const ledger = readJSON(root, ledgerPath)
    const { sha256: ledgerSeal, ...ledgerPayload } = ledger || {}
    if (
      !claims?.length ||
      originalInput?.schema !== "research-evidence-assessment-input/v1" ||
      !Number.isInteger(originalInput.claims_per_batch) ||
      originalInput.claims_per_batch < 1 ||
      originalInput.claims_per_batch > 6 ||
      ledger?.binding?.role !== "evidence_compare" ||
      ledgerSeal !== sha256(JSON.stringify(ledgerPayload)) ||
      originalInput.claims_sha256 !== sha256(JSON.stringify(claims)) ||
      originalInput.documents_sha256 !== sha256(JSON.stringify(documents)) ||
      originalInput.parses_sha256 !== sha256(JSON.stringify(parses)) ||
      originalInput.execution_policy_sha256 !== sha256(JSON.stringify(ledger.binding)) ||
      !Array.isArray(ledger.attempts) ||
      ledger.attempts.some((attempt) => attempt.status === "running") ||
      readJSON(root, base + "assessment.json")
    )
      throw Error("Stopped incomplete assessment and sealed model ledger required")
    const inputSha = sha256(JSON.stringify(originalInput))
    const fields = [
      "schema",
      "source_run",
      "input_sha256",
      "reviewer",
      "reviewed_at",
      "source_read",
      "quote_only",
      "meaning_unchanged",
      "corrections",
    ]
    if (
      !review ||
      Object.keys(review).some((key) => !fields.includes(key)) ||
      review.schema !== "research-evidence-quote-review/v1" ||
      review.source_run !== sourceRun ||
      review.input_sha256 !== inputSha ||
      typeof review.reviewer !== "string" ||
      !review.reviewer.trim() ||
      parseResearchDate(review.reviewed_at)?.precision !== "timestamp" ||
      ["source_read", "quote_only", "meaning_unchanged"].some((key) => review[key] !== true) ||
      !Array.isArray(review.corrections) ||
      !review.corrections.length ||
      review.corrections.length > 216
    )
      throw Error("Explicit exact-input quote-only source review required")
    assertReviewDate(review.reviewed_at, {
      notBefore: ledger.attempts.filter((a) => a.status === "complete").map((a) => a.finished_at),
    })
    const count = Math.ceil(claims.length / originalInput.claims_per_batch)
    const rawBatches = [],
      correctedBatches = [],
      originals = [],
      requests = []
    for (let index = 1; index <= count; index++) {
      const file = base + `batch-${index}.json`
      if (!fs.existsSync(safePath(root, file))) {
        if (!completeMissing || typeof createMissingProvider !== "function")
          throw Error(
            "Missing original assessment batch; explicitly enable missing-batch completion",
          )
        rawBatches.push(null)
        correctedBatches.push(null)
        requests.push(null)
        originals.push({ path: file, sha256: null })
        continue
      }
      const bytes = fs.readFileSync(safePath(root, file))
      const raw = JSON.parse(bytes)
      const attempt = authenticateResponse(
        root,
        sourceRun,
        index,
        raw,
        originalInput,
        claims,
        documents,
        parses,
      )
      const supplied = JSON.parse(attempt.request.messages[1].content)
      const selected = claims.slice(
        (index - 1) * originalInput.claims_per_batch,
        index * originalInput.claims_per_batch,
      )
      if (
        !same(
          supplied.claims.map((c) => c.claim_id),
          selected.map((c) => c.claim_id),
        )
      )
        throw Error("Original response request must cover the exact batch claims")
      rawBatches.push(raw)
      requests.push(attempt.request)
      correctedBatches.push(structuredClone(raw))
      originals.push({ path: file, sha256: sha256(bytes) })
    }
    const repairedQuotes = applyCorrections({
      root,
      base,
      review,
      sourceRun,
      inputSha,
      claims,
      parses,
      rawBatches,
      correctedBatches,
      originals,
    })
    const target = `runs/${run}/`
    if (
      !readJSON(root, target + "quote-review-input.json") &&
      [
        "documents.json",
        "claims.json",
        "evidence-assessment/input.json",
        "model-policy/evidence_compare/budget.json",
      ].some((file) => fs.existsSync(safePath(root, target + file)))
    )
      throw Error("Existing run is not a quote review; use a new run")
    const input = {
      schema: "research-reviewed-assessment-input/v1",
      source_run: sourceRun,
      original_input_sha256: inputSha,
      original_responses: originals,
      ledger_sha256: sha256(fs.readFileSync(safePath(root, ledgerPath))),
      review,
      implementation_sha256: sha256(fs.readFileSync(new URL(import.meta.url))),
      ...(completeMissing ? { complete_missing_batches: true } : {}),
    }
    const create = (file, value) => {
      const current = readJSON(root, target + file)
      if (current && !same(current, value)) throw Error("Quote review artifact changed")
      if (!current) atomicCreate(root, target + file, value)
    }
    create("quote-review-input.json", input)
    create("documents.json", documents)
    create("parses.json", parses)
    create("claims.json", readJSON(root, `runs/${sourceRun}/claims.json`))
    // No inference took place in this new run. The original charged attempt
    // remains in its original ledger, explicitly pinned above.
    const emptyLedger = {
      schema: "model-budget/v2",
      binding: ledger.binding,
      attempts: [],
      extensions: [],
    }
    const currentLedger = readJSON(root, target + "model-policy/evidence_compare/budget.json")
    if (!currentLedger)
      create("model-policy/evidence_compare/budget.json", {
        ...emptyLedger,
        sha256: sha256(JSON.stringify(emptyLedger)),
      })
    else {
      const { sha256: seal, ...payload } = currentLedger
      if (!same(currentLedger.binding, ledger.binding) || seal !== sha256(JSON.stringify(payload)))
        throw Error("Quote review model ledger changed")
    }
    let materialized = 0,
      generatedMissing = 0,
      missingProvider = null
    const result = await assessEvidenceCheckpoint(
      root,
      run,
      {
        executionPolicy: ledger.binding,
        structured: async (request) => {
          if (!same(readJSON(root, target + "evidence-assessment/input.json"), originalInput))
            throw Error("Original assessment inputs or implementation changed")
          const requested = JSON.parse(request.messages[1].content).claims.map((c) => c.claim_id)
          const index = requests.findIndex((original, i) =>
            original
              ? same(original.messages, request.messages) && same(original.schema, request.schema)
              : same(
                  requested,
                  claims
                    .slice(
                      i * originalInput.claims_per_batch,
                      (i + 1) * originalInput.claims_per_batch,
                    )
                    .map((c) => c.claim_id),
                ),
          )
          if (index < 0) throw Error("Original assessment claim order changed")
          if (!correctedBatches[index]) {
            if (!completeMissing) throw Error("Missing assessment batch completion is not enabled")
            missingProvider ??= await createMissingProvider()
            if (
              !same(missingProvider.executionPolicy, ledger.binding) ||
              missingProvider.executionPolicy.settings.provider !== "ollama"
            )
              throw Error("Missing assessment must use the exact original local model policy")
            generatedMissing++
            return missingProvider.structured(request)
          }
          materialized++
          return correctedBatches[index]
        },
      },
      claims,
      documents,
      parses,
      { claimsPerBatch: originalInput.claims_per_batch },
    )
    const completedLedger = readJSON(root, target + "model-policy/evidence_compare/budget.json")
    create("quote-review-result.json", {
      schema: "research-evidence-quote-review-result/v1",
      source_run: sourceRun,
      review_sha256: sha256(JSON.stringify(review)),
      repaired_quotes: repairedQuotes,
      assessment_sha256: sha256(JSON.stringify(result.record)),
      model_calls: completedLedger.attempts.filter((a) => a.status === "complete").length,
      requires_fact_review: true,
      public_approved: false,
      candidate_published: false,
    })
    return {
      ...result,
      generated_batches: generatedMissing,
      materialized_batches: materialized,
      repaired_quotes: repairedQuotes,
      model_calls: generatedMissing,
    }
  })
}
