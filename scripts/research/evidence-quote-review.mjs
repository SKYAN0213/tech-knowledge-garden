import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { assertReviewDate, parseResearchDate } from "./dates.mjs"
import { loadStoredSourceRun } from "./parser.mjs"
import { assessEvidenceCheckpoint } from "./evidence-assessment.mjs"
import {
  assessWindowEvidenceCheckpoint,
  evidenceWindowPlan,
} from "./window-evidence-assessment.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"

// Explicit source-bound citation review. Quote repairs keep their locator.
// A separate review may fix one unique adjacent locator in the same window;
// neither path changes model verdicts, entities, numbers or explanations.
const typography = (value) =>
  value.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim()
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const reviewMode = (review) =>
  review?.schema === "research-evidence-quote-review/v1" &&
  review.quote_only === true &&
  review.citation_only === undefined &&
  review.window_assessment_only === undefined
    ? "quote"
    : review?.schema === "research-evidence-citation-review/v1" &&
        review.citation_only === true &&
        review.quote_only === undefined &&
        review.window_assessment_only === undefined
      ? "citation"
      : review?.schema === "research-evidence-window-review/v1" &&
          review.window_assessment_only === true &&
          review.quote_only === undefined &&
          review.citation_only === undefined
        ? "window"
        : null
const reviewedTypography = (correction, original, replacement) => {
  const before = typography(original),
    after = typography(replacement)
  if (correction.citation_markers_checked === true) {
    // Restore only the three transport glyphs of an explicitly checked web
    // citation. Reference numbers, link labels and all prose remain unchanged.
    const marker = /\uE200cite\uE202[0-9]+†[^\uE200\uE202\uE201\uFFFC]+\uE201/g
    return (
      correction.sentence_initial_article_checked === undefined &&
      correction.elision_expansion_checked === undefined &&
      /(?:\uFFFCcite\uFFFC| cite )[0-9]+†/.test(before) &&
      marker.test(after) &&
      ["\uFFFC", " "].some(
        (glyph) =>
          typography(
            after.replace(marker, (value) => value.replace(/[\uE200\uE202\uE201]/g, glyph)),
          ) === before,
      )
    )
  }
  if (correction.citation_markers_checked !== undefined) return false
  if (before === after)
    return (
      correction.sentence_initial_article_checked === undefined &&
      correction.elision_expansion_checked === undefined
    )
  if (
    correction.elision_expansion_checked === true &&
    correction.sentence_initial_article_checked === undefined
  ) {
    // Expand one explicitly reviewed editorial ellipsis into the unchanged
    // contiguous source span. Never remove text or select a different locator.
    const parts = before.split(" ... ")
    return (
      parts.length === 2 &&
      parts.every(Boolean) &&
      !after.includes(" ... ") &&
      after.startsWith(parts[0]) &&
      after.endsWith(parts[1]) &&
      after.length > parts[0].length + parts[1].length
    )
  }
  // Only an explicitly checked indefinite article may change sentence-initial
  // case. Proper names, other letters and the remainder of the quote stay exact.
  return (
    correction.sentence_initial_article_checked === true &&
    correction.elision_expansion_checked === undefined &&
    /^[Aa] /.test(before) &&
    /^[Aa] /.test(after) &&
    before.slice(1) === after.slice(1)
  )
}

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
  originalInput,
  rejectCheckpoint = true,
}) {
  const touched = new Set()
  for (const correction of review.corrections) {
    if (reviewMode(review) === "window") {
      const allowed = ["batch", "claim_id", "raw_sha256", "reason", "missing_cited_blocks_checked"]
      const batch = correctedBatches[correction.batch - 1]
      const original = rawBatches[correction.batch - 1]
      const row = batch?.output?.assessments?.find((r) => r.claim_id === correction.claim_id)
      const claim = claims.find((c) => c.claim_id === correction.claim_id)
      const supplied = originalInput.windows?.[correction.batch - 1]
      const key = JSON.stringify([correction.batch, correction.claim_id, "meaning"])
      if (
        Object.keys(correction).some((k) => !allowed.includes(k)) ||
        !Number.isInteger(correction.batch) ||
        correction.batch < 1 ||
        originalInput.schema !== "research-window-evidence-assessment-input/v1" ||
        !supplied?.claim_ids.includes(correction.claim_id) ||
        correction.missing_cited_blocks_checked !== true ||
        !row ||
        row.verdict !== "insufficient" ||
        row.evidence.length !== 0 ||
        row.checks.meaning !== "supported" ||
        Object.values(row.checks).includes("contradicted") ||
        !claim?.evidence.length ||
        claim.evidence.some((e) =>
          supplied.blocks.some((b) => b.parse_id === e.parse_id && b.block_id === e.block_id),
        ) ||
        touched.has(key) ||
        correction.raw_sha256 !== originals[correction.batch - 1]?.sha256 ||
        typeof correction.reason !== "string" ||
        !correction.reason.trim() ||
        (rejectCheckpoint && readJSON(root, base + `batch-${correction.batch}-checkpoint.json`))
      )
        throw Error(
          "Explicit missing cited blocks review required; only lower meaning to insufficient",
        )
      touched.add(key)
      row.checks.meaning = "insufficient"
      batch.window_review = {
        schema: review.schema,
        source_run: sourceRun,
        input_sha256: inputSha,
        original_response_sha256: sha256(JSON.stringify(original)),
        review_sha256: sha256(JSON.stringify(review)),
        reviewer: review.reviewer,
        reviewed_at: review.reviewed_at,
      }
      continue
    }
    const allowed = [
      "batch",
      "claim_id",
      "evidence_index",
      "original_quote",
      "quote",
      "raw_sha256",
      "reason",
      "sentence_initial_article_checked",
      "elision_expansion_checked",
      "citation_markers_checked",
      ...(reviewMode(review) === "citation"
        ? ["original_block_id", "block_id", "adjacent_locator_checked"]
        : []),
    ]
    const batch = correctedBatches[correction.batch - 1]
    const original = rawBatches[correction.batch - 1]
    const row = batch?.output?.assessments?.find((r) => r.claim_id === correction.claim_id)
    const citation = row?.evidence?.[correction.evidence_index]
    const key = JSON.stringify([correction.batch, correction.claim_id, correction.evidence_index])
    const claim = claims.find((c) => c.claim_id === correction.claim_id)
    const parse = parses.find(
      (p) =>
        p.parse_id === citation?.parse_id && claim?.evidence.some((e) => e.parse_id === p.parse_id),
    )
    const block = parse?.blocks.find((b) => b.block_id === citation?.block_id)
    let replacementBlock = null
    if (reviewMode(review) === "citation") {
      const originalIndex = parse?.blocks.findIndex((b) => b.block_id === citation?.block_id)
      const replacementIndex = parse?.blocks.findIndex((b) => b.block_id === correction.block_id)
      replacementBlock = parse?.blocks[replacementIndex]
      const supplied =
        originalInput.schema === "research-window-evidence-assessment-input/v1"
          ? originalInput.windows[correction.batch - 1]?.blocks
          : parse?.blocks.map((b) => ({ parse_id: parse.parse_id, block_id: b.block_id }))
      if (
        correction.adjacent_locator_checked !== true ||
        correction.original_block_id !== citation?.block_id ||
        correction.quote !== correction.original_quote ||
        correction.sentence_initial_article_checked !== undefined ||
        correction.elision_expansion_checked !== undefined ||
        correction.citation_markers_checked !== undefined ||
        !Number.isInteger(originalIndex) ||
        originalIndex < 0 ||
        !Number.isInteger(replacementIndex) ||
        replacementIndex < 0 ||
        Math.abs(originalIndex - replacementIndex) !== 1 ||
        !replacementBlock?.text.includes(correction.quote) ||
        parse.blocks.filter((b) => b.text.includes(correction.quote)).length !== 1 ||
        ![block, replacementBlock].every((b) =>
          supplied?.some(
            (entry) => entry.parse_id === parse.parse_id && entry.block_id === b?.block_id,
          ),
        )
      )
        throw Error("Explicit unique same-window adjacent citation locator review required")
    }
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
      (!replacementBlock && !block.text.includes(correction.quote)) ||
      (!replacementBlock && !reviewedTypography(correction, citation.quote, correction.quote)) ||
      (rejectCheckpoint && readJSON(root, base + `batch-${correction.batch}-checkpoint.json`))
    )
      throw Error(
        "Only invalid typography quotes or explicitly checked adjacent locators can be explicitly repaired",
      )
    touched.add(key)
    if (replacementBlock) citation.block_id = replacementBlock.block_id
    else citation.quote = correction.quote
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
    !reviewMode(review) ||
    review.source_run !== sourceRun ||
    review.input_sha256 !== origin.original_input_sha256 ||
    typeof review.reviewer !== "string" ||
    !review.reviewer.trim() ||
    parseResearchDate(review.reviewed_at)?.precision !== "timestamp" ||
    ["source_read", "meaning_unchanged"].some((k) => review[k] !== true) ||
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
    originalInput: input,
    rejectCheckpoint: false,
  })
  const expected = correctedBatches[index - 1]
  if (partialReview.corrections.length)
    expected[reviewMode(review) === "window" ? "window_review" : "quote_review"].review_sha256 =
      sha256(JSON.stringify(review))
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
      ![
        "research-evidence-assessment-input/v1",
        "research-window-evidence-assessment-input/v1",
      ].includes(originalInput?.schema) ||
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
      "citation_only",
      "window_assessment_only",
      "meaning_unchanged",
      "corrections",
    ]
    if (
      !review ||
      Object.keys(review).some((key) => !fields.includes(key)) ||
      !reviewMode(review) ||
      review.source_run !== sourceRun ||
      review.input_sha256 !== inputSha ||
      typeof review.reviewer !== "string" ||
      !review.reviewer.trim() ||
      parseResearchDate(review.reviewed_at)?.precision !== "timestamp" ||
      ["source_read", "meaning_unchanged"].some((key) => review[key] !== true) ||
      !Array.isArray(review.corrections) ||
      !review.corrections.length ||
      review.corrections.length > 216
    )
      throw Error("Explicit exact-input quote-only source review required")
    assertReviewDate(review.reviewed_at, {
      notBefore: ledger.attempts.filter((a) => a.status === "complete").map((a) => a.finished_at),
    })
    const windowed = originalInput.schema === "research-window-evidence-assessment-input/v1"
    const windowPlan = windowed
      ? evidenceWindowPlan(
          claims,
          documents,
          parses,
          ledger.binding.settings,
          originalInput.claims_per_batch,
        )
      : null
    const count = windowed
      ? windowPlan.length
      : Math.ceil(claims.length / originalInput.claims_per_batch)
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
      const selected = windowed
        ? windowPlan[index - 1].claims
        : claims.slice(
            (index - 1) * originalInput.claims_per_batch,
            index * originalInput.claims_per_batch,
          )
      if (
        (windowed && !same(attempt.request.messages, windowPlan[index - 1].messages)) ||
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
      originalInput,
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
    const assess = windowed ? assessWindowEvidenceCheckpoint : assessEvidenceCheckpoint
    const result = await assess(
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
              : windowed
                ? same(request.messages, windowPlan[i].messages)
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
      schema:
        reviewMode(review) === "window"
          ? "research-evidence-window-review-result/v1"
          : reviewMode(review) === "citation"
            ? "research-evidence-citation-review-result/v1"
            : "research-evidence-quote-review-result/v1",
      source_run: sourceRun,
      review_sha256: sha256(JSON.stringify(review)),
      repaired_quotes: reviewMode(review) === "quote" ? repairedQuotes : 0,
      ...(reviewMode(review) === "citation" ? { repaired_locators: repairedQuotes } : {}),
      ...(reviewMode(review) === "window" ? { lowered_checks: repairedQuotes } : {}),
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
      repaired_quotes: reviewMode(review) === "quote" ? repairedQuotes : 0,
      ...(reviewMode(review) === "citation" ? { repaired_locators: repairedQuotes } : {}),
      ...(reviewMode(review) === "window" ? { lowered_checks: repairedQuotes } : {}),
      model_calls: generatedMissing,
    }
  })
}
