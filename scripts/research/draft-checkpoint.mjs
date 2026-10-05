import fs from "node:fs"
import { sha256, assertSchema } from "./contracts.mjs"
import { atomicCreate, readJSON, safePath } from "./run-state.mjs"
import { draftFingerprint, draftProblems, schemaForDraft, writeDraft } from "./editor.mjs"
import { assertDeepDiveContext } from "./deep-dive.mjs"
import { loadRoleBudget } from "./model-policy.mjs"
import { loadProcessedDraft } from "./processed-draft.mjs"

function validator(claims, options) {
  const usable = options.deepContext
    ? assertDeepDiveContext(
        options.deepContext,
        claims,
        options.parses || [],
        options.documents || [],
      )
    : claims.filter(
        (c) => c.review.status === "verified" || (options.provisional && c.review.structural_pass),
      )
  return (record) => {
    assertSchema(record?.draft, schemaForDraft(options.deepContext))
    if (
      record.schema !== "research-draft/v1" ||
      record.draft_id !== draftFingerprint(record.draft, options.deepContext) ||
      JSON.stringify(record.deep_context || null) !== JSON.stringify(options.deepContext || null) ||
      JSON.stringify(record.claim_ids) !== JSON.stringify(usable.map((c) => c.claim_id)) ||
      JSON.stringify(record.problems) !==
        JSON.stringify(draftProblems(record.draft, usable, options.deepContext)) ||
      record.public_approved !== false
    )
      throw Error("Stored model draft no longer matches its input")
  }
}

// Read a completed generation against its frozen input, without preparing a
// provider. Model replacement and implementation updates do not rewrite history.
export function loadDraftCheckpoint(root, runId, claims, options = {}) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(runId || "") || !Array.isArray(claims))
    throw Error("Exact draft run and reviewed claims required")
  const base = `runs/${runId}/`
  const input = readJSON(root, base + "model-draft-input.json")
  const receipt = readJSON(root, base + "model-draft-checkpoint.json")
  if (!input || !receipt) throw Error("Completed draft checkpoint required for reuse")
  const inputHash = sha256(JSON.stringify(input))
  if (
    input.schema !== "research-model-draft-input/v1" ||
    input.claims_sha256 !== sha256(JSON.stringify(claims)) ||
    input.documents_sha256 !== sha256(JSON.stringify(options.documents || [])) ||
    input.parses_sha256 !== sha256(JSON.stringify(options.parses || [])) ||
    input.deep_context_sha256 !== sha256(JSON.stringify(options.deepContext || null)) ||
    input.provisional !== (options.provisional === true)
  )
    throw Error("Draft source or reviewed input changed")
  if (
    receipt.schema !== "research-model-draft-checkpoint/v1" ||
    receipt.input_sha256 !== inputHash ||
    receipt.output_path !== base + "drafts/model-" + inputHash + ".json" ||
    receipt.candidate_published !== false
  )
    throw Error("Invalid model draft checkpoint")
  const bytes = fs.readFileSync(safePath(root, receipt.output_path))
  if (sha256(bytes) !== receipt.output_sha256) throw Error("Stored model draft bytes changed")
  const record = JSON.parse(bytes)
  validator(claims, options)(record)
  return { record, reused: true, input, checkpoint: receipt }
}

export function loadBoundDraftCheckpoint(root, runId, claims, options) {
  const result = loadDraftCheckpoint(root, runId, claims, options)
  const ledger = loadRoleBudget(root, runId, "article_write")
  if (
    result.input.execution_policy_sha256 !== sha256(JSON.stringify(ledger.binding)) ||
    result.input.model !== ledger.binding.settings?.model ||
    result.input.think !== ledger.binding.settings?.think ||
    !ledger.attempts.some(
      (attempt) =>
        attempt.status === "complete" &&
        JSON.stringify(attempt.result.output) === JSON.stringify(result.record.draft) &&
        JSON.stringify(attempt.result.provenance) === JSON.stringify(result.record.provenance),
    )
  )
    throw Error("Article writer role ledger changed")
  const current = readJSON(root, `runs/${runId}/draft.json`)
  if (current && JSON.stringify(current) !== JSON.stringify(result.record)) {
    // Reuse the immutable model output, never the other run's editorial approval.
    // A legitimate correction may coexist with that output; validate its full
    // history instead of forcing another model request after editing.
    if (!readJSON(root, `runs/${runId}/draft-generation-reference.json`))
      throw Error("Working draft differs from the generation checkpoint")
    loadProcessedDraft(root, runId, { claims }, options.documents || [], options.parses || [])
  }
  return result
}

// The caller owns the run lock. Cache generation only; fact and editorial
// approvals remain separate and are never inherited from this checkpoint.
export async function writeDraftCheckpoint(root, runId, ollama, claims, options, metadata) {
  if (!/^[A-Za-z0-9_-]+$/.test(runId || "") || !Array.isArray(claims) || !metadata)
    throw Error("Exact draft run, claims and model metadata required")
  const base = `runs/${runId}/`
  const input = {
    schema: "research-model-draft-input/v1",
    claims_sha256: sha256(JSON.stringify(claims)),
    documents_sha256: sha256(JSON.stringify(options.documents || [])),
    parses_sha256: sha256(JSON.stringify(options.parses || [])),
    deep_context_sha256: sha256(JSON.stringify(options.deepContext || null)),
    model: options.model,
    think: options.think ?? false,
    provisional: options.provisional === true,
    model_metadata_sha256: sha256(JSON.stringify(metadata)),
    execution_policy_sha256: sha256(JSON.stringify(ollama.executionPolicy || null)),
    implementation: Object.fromEntries(
      [
        "scripts/research/draft-checkpoint.mjs",
        "scripts/research/editor.mjs",
        "scripts/research/deep-dive.mjs",
        "scripts/research/contracts.mjs",
        "scripts/sectors.mjs",
        "scripts/themes.mjs",
      ].map((file) => [file, sha256(fs.readFileSync(file))]),
    ),
  }
  const inputHash = sha256(JSON.stringify(input))
  const previousInput = readJSON(root, base + "model-draft-input.json")
  if (previousInput && sha256(JSON.stringify(previousInput)) !== inputHash)
    throw Error("Draft input changed; use a new run")
  const receipt = readJSON(root, base + "model-draft-checkpoint.json")
  const current = readJSON(root, base + "draft.json")
  if (!previousInput && (receipt || current))
    throw Error("Existing draft has no generation checkpoint; preserve it and use a new run")
  const outputPath = base + "drafts/model-" + inputHash + ".json"
  const validate = validator(claims, options)
  if (receipt) {
    const { record } = loadDraftCheckpoint(root, runId, claims, options)
    if (current && JSON.stringify(current) !== JSON.stringify(record))
      throw Error("Working draft differs from the generation checkpoint")
    return { record, reused: true }
  }
  if (fs.existsSync(safePath(root, outputPath)))
    throw Error("Unfinished model draft checkpoint; inspect stored output before retrying")
  if (!previousInput) atomicCreate(root, base + "model-draft-input.json", input)
  const record = JSON.parse(JSON.stringify(await writeDraft(ollama, claims, options)))
  validate(record)
  const output = atomicCreate(root, outputPath, record)
  atomicCreate(root, base + "model-draft-checkpoint.json", {
    schema: "research-model-draft-checkpoint/v1",
    input_sha256: inputHash,
    output_path: outputPath,
    output_sha256: output.sha256,
    candidate_published: false,
  })
  return { record, reused: false }
}
