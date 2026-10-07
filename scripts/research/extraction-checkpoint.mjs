import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { loadStoredSourceRun } from "./parser.mjs"
import { readJSON, safePath } from "./run-state.mjs"
import {
  extractionBudget,
  mapExtractionBatch,
  selectExtractionScope,
  describeExtractionCoverage,
} from "./claims.mjs"
import { modelSourceDates } from "./source-context.mjs"

// Validate the original CLI protocol rather than regenerating today's prompt.
// A prompt/policy update must not require repeating a completed model request.
function assertCompletedCLIExtraction(root, run, extracted, parses) {
  const base = `runs/${run}/`,
    state = readJSON(root, base + "state.json")
  const stage = state?.stages?.claims
  if (
    state?.schema !== "research-run/v1" ||
    state.run_id !== run ||
    !/^[a-f0-9]{64}$/.test(state.input_hash || "") ||
    Object.values(state.stages || {}).some((item) => item.status === "running") ||
    stage?.status !== "complete" ||
    stage.result_path !== base + "claims.json" ||
    !extracted ||
    stage.result_hash !== sha256(JSON.stringify(extracted)) ||
    extracted.development_fixture ||
    extracted.source_processing ||
    extracted.extraction_reuse
  )
    throw Error("Completed CLI extraction checkpoint required for reuse")
  const provenance = extracted.provenance,
    plan = provenance?.extraction_plan
  if (
    !provenance?.extraction_budget ||
    Array.isArray(provenance.extraction_budget) ||
    ![
      "num_ctx",
      "num_predict",
      "input_char_budget",
      "call_timeout_ms",
      "extraction_timeout_ms",
      "facts_per_batch",
    ].every((key) => Object.hasOwn(provenance.extraction_budget, key))
  )
    throw Error("Original CLI extraction budget required")
  const budget = extractionBudget(provenance?.extraction_budget)
  const scope = selectExtractionScope(parses, plan?.scope?.profile)
  if (
    !Array.isArray(plan?.batches) ||
    !plan.batches.length ||
    plan.batches.length > 64 ||
    plan.input_char_limit !== budget.input_char_budget ||
    JSON.stringify(plan.scope) !==
      JSON.stringify({ profile: scope.profile, documents: scope.documents })
  )
    throw Error("CLI extraction scope or batch plan changed")
  const blocks = new Map(),
    sourceContext = new Map()
  parses.forEach((parse, i) =>
    parse.blocks.forEach((block, j) => {
      if (!scope.includedByParse.get(parse.parse_id).has(block.block_id)) return
      const key = `d${i + 1}b${j + 1}`
      blocks.set(key, {
        source_id: parse.source_id,
        source_version_id: parse.source_version_id,
        parse_id: parse.parse_id,
        block_id: block.block_id,
      })
      sourceContext.set(key, { block, parse, document: i + 1 })
    }),
  )
  if (provenance.block_map_sha256 !== sha256(JSON.stringify([...blocks])))
    throw Error("CLI extraction source block map changed")
  const seen = new Set(),
    results = [],
    mapped = []
  for (const [index, batch] of plan.batches.entries()) {
    if (!/^\d{3}-[a-f0-9]{16}$/.test(batch.batch_id || ""))
      throw Error("CLI extraction batch identity required")
    const name = "claims-batch-" + batch.batch_id,
      checkpoint = state.stages[name]
    const result = readJSON(root, base + name + ".json")
    if (
      checkpoint?.status !== "complete" ||
      checkpoint.result_path !== base + name + ".json" ||
      !result ||
      checkpoint.result_hash !== sha256(JSON.stringify(result))
    )
      throw Error("Completed CLI extraction batch checkpoint required")
    const artifact = result.artifacts,
      request = artifact?.request,
      model = result.provenance
    if (
      artifact?.done !== true ||
      !["stop", null].includes(artifact.done_reason) ||
      artifact.request_sha256 !== sha256(JSON.stringify(request)) ||
      typeof artifact.response_content !== "string" ||
      artifact.response_content_sha256 !== sha256(artifact.response_content) ||
      JSON.stringify(JSON.parse(artifact.response_content)) !== JSON.stringify(result.output) ||
      !/^[a-f0-9]{64}$/.test(model?.digest || "") ||
      model.model !== request?.model ||
      model.think !== request?.think ||
      model.model !== provenance.model ||
      model.think !== provenance.think ||
      model.num_ctx !== budget.num_ctx ||
      model.num_predict !== budget.num_predict ||
      model.num_ctx !== request?.options?.num_ctx ||
      model.num_predict !== request?.options?.num_predict ||
      model.temperature !== request?.options?.temperature ||
      model.prompt_sha256 !== sha256(JSON.stringify(request?.messages)) ||
      model.schema_sha256 !== sha256(JSON.stringify(request?.format)) ||
      request.messages?.length !== 2 ||
      request.messages[0].role !== "system" ||
      request.messages[1].role !== "user" ||
      Object.hasOwn(
        request.format?.properties?.claims?.items?.properties?.evidence?.items?.properties || {},
        "quote",
      ) !==
        ((budget.evidence_quote_mode ?? "model_quote") === "model_quote") ||
      request.format?.properties?.claims?.maxItems !== budget.facts_per_batch
    )
      throw Error("CLI extraction model request/response provenance changed")
    const originalRequest = {
      schema: request.format,
      messages: request.messages,
      num_ctx: request.options.num_ctx,
      num_predict: request.options.num_predict,
    }
    const chars =
      request.messages.reduce((n, message) => n + message.content.length, 0) +
      JSON.stringify(request.format).length
    if (
      batch.batch_id !==
        `${String(index + 1).padStart(3, "0")}-${sha256(JSON.stringify(originalRequest)).slice(0, 16)}` ||
      batch.input_chars !== chars ||
      chars > plan.input_char_limit
    )
      throw Error("CLI extraction request budget or identity changed")
    const documents = JSON.parse(request.messages[1].content),
      keys = []
    if (!Array.isArray(documents) || !documents.length)
      throw Error("CLI extraction source context required")
    for (const document of documents) {
      const parse = parses[document.document - 1]
      if (
        !parse ||
        document.title !== parse.title ||
        JSON.stringify(document.dates) !== JSON.stringify(modelSourceDates(parse.dates)) ||
        !Array.isArray(document.blocks) ||
        !document.blocks.length
      )
        throw Error("CLI extraction document context changed")
      for (const block of document.blocks) {
        const source = sourceContext.get(block.block_key)
        if (
          !source ||
          source.document !== document.document ||
          seen.has(block.block_key) ||
          block.text !== source.block.text ||
          block.kind !== (source.block.kind ?? "paragraph") ||
          (Object.hasOwn(block, "source_field") &&
            (source.block.locator?.type !== "json" ||
              block.source_field !== source.block.locator.json_pointer))
        )
          throw Error("CLI extraction source block context changed")
        seen.add(block.block_key)
        keys.push(block.block_key)
      }
    }
    if (
      JSON.stringify(keys) !== JSON.stringify(batch.block_keys) ||
      (budget.max_blocks_per_batch && keys.length > budget.max_blocks_per_batch)
    )
      throw Error("CLI extraction batch block coverage changed")
    mapped.push(
      ...mapExtractionBatch(result.output, { block_keys: keys, request: originalRequest }, blocks),
    )
    results.push({ ...batch, ...result })
  }
  if (
    seen.size !== blocks.size ||
    !Array.isArray(extracted.claims) ||
    mapped.length !== extracted.claims.length
  )
    throw Error("CLI extraction has incomplete source or claim coverage")
  const claims = mapped.map((claim, i) => {
    const saved = extracted.claims[i]
    if (saved.review?.status !== "unreviewed" || saved.review.reviewed_at !== null)
      throw Error("CLI extraction cannot inherit fact verification")
    return {
      schema: "research-claim/v1",
      ...claim,
      candidate_key: saved.candidate_key,
      event_id: null,
      claim_id: sha256(
        JSON.stringify([saved.candidate_key, claim.statement, claim.evidence]),
      ).slice(0, 24),
      subject_id: null,
      review: saved.review,
    }
  })
  const expected = {
    claims,
    ...(results.length === 1 ? { model_artifacts: results[0].artifacts } : { batches: results }),
    provenance: {
      ...(results.length === 1
        ? results[0].provenance
        : {
            schema: "research-extraction-batches/v1",
            model: provenance.model,
            think: provenance.think,
            batch_count: results.length,
          }),
      block_map_sha256: provenance.block_map_sha256,
      extraction_budget: provenance.extraction_budget,
      ...(Object.hasOwn(provenance, "source_coverage")
        ? { source_coverage: describeExtractionCoverage(claims, parses, plan.scope.profile) }
        : {}),
      extraction_plan: plan,
    },
    requires_fact_review: true,
  }
  if (JSON.stringify(expected) !== JSON.stringify(extracted))
    throw Error("CLI extraction differs from completed model output")
}

// Only a completed extraction is reusable. Later assessment failure does not
// erase it, and neither a reviewed claim copy nor an arbitrary JSON file seals it.
export function loadCompletedExtraction(root, run, documents, parses) {
  const source = loadStoredSourceRun(root, run)
  if (
    JSON.stringify(source.documents) !== JSON.stringify(documents) ||
    JSON.stringify(source.parses) !== JSON.stringify(parses)
  )
    throw Error("Reused extraction requires the exact selected documents and parses")
  const base = `runs/${run}/`
  const input = readJSON(root, base + "source-processing-input.json")
  const state = readJSON(root, base + "processing/state.json")
  const stage = state?.stages?.extraction
  const result = readJSON(root, base + "processing/extraction.json")
  const extracted = readJSON(root, base + "claims.json")
  if (!input && !state && !result) {
    assertCompletedCLIExtraction(root, run, extracted, parses)
    return fs.readFileSync(safePath(root, base + "claims.json"))
  }
  if (
    input?.schema !== "research-source-processing-input/v1" ||
    state?.run_id !== run ||
    state?.input_hash !== sha256(JSON.stringify(input)) ||
    stage?.status !== "complete" ||
    stage.result_path !== base + "processing/extraction.json" ||
    !result ||
    stage.result_hash !== sha256(JSON.stringify(result)) ||
    extracted?.source_processing?.run !== run ||
    extracted.source_processing.input_sha256 !== sha256(JSON.stringify(input)) ||
    JSON.stringify(extracted) !==
      JSON.stringify({
        ...result,
        source_processing: { run, input_sha256: sha256(JSON.stringify(input)) },
      })
  )
    throw Error("Completed source-bound extraction checkpoint required for reuse")
  return fs.readFileSync(safePath(root, base + "claims.json"))
}

export function assertProcessingExtractionOrigin(root, input, documents, parses) {
  const file = safePath(root, `runs/${input.source_run}/claims.json`)
  const bytes = input.extraction_run
    ? loadCompletedExtraction(root, input.extraction_run, documents, parses)
    : fs.existsSync(file)
      ? fs.readFileSync(file)
      : null
  if (input.source_extraction_sha256 !== (bytes ? sha256(bytes) : null))
    throw Error("Reused extraction origin changed")
}
