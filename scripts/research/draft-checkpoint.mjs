import fs from "node:fs"
import { sha256, assertSchema } from "./contracts.mjs"
import { atomicCreate, readJSON, safePath } from "./run-state.mjs"
import {
  draftFingerprint,
  draftProblems,
  schemaForDraft,
  selectAuthoringClaims,
  writeDraft,
} from "./editor.mjs"
import { assertDeepDiveContext } from "./deep-dive.mjs"
import { loadRoleBudget } from "./model-policy.mjs"
import { loadProcessedDraft } from "./processed-draft.mjs"
import { assertCompletenessContext } from "./editorial-completeness.mjs"
import { structuredRequestBudget } from "./ollama.mjs"
import { assertReviewDate } from "./dates.mjs"

// A migration is opt-in and only versions preparation that never reached a
// provider. The original input and failed attempt bytes are never replaced.
export function loadDraftInput(root, runId) {
  const base = `runs/${runId}/`
  const migration = readJSON(root, base + "model-draft-input-migration.json")
  if (!migration) return readJSON(root, base + "model-draft-input.json")
  const { sha256: seal, ...value } = migration
  if (
    migration.schema !== "research-draft-input-migration/v1" ||
    migration.run_id !== runId ||
    seal !== sha256(JSON.stringify(value)) ||
    migration.candidate_published !== false
  )
    throw Error("Draft input migration receipt changed")
  for (const reference of [
    migration.original,
    migration.input,
    migration.authoring_scope,
    migration.review_file,
    ...migration.failure,
  ]) {
    const bytes = fs.readFileSync(safePath(root, reference.path))
    if (sha256(bytes) !== reference.sha256) throw Error("Draft migration bytes changed")
  }
  if (migration.original.path !== base + "model-draft-input.json")
    throw Error("Draft migration original input differs")
  const input = readJSON(root, migration.input.path)
  if (migration.input.path !== base + "draft-inputs/" + sha256(JSON.stringify(input)) + ".json")
    throw Error("Draft migration version differs")
  if (
    JSON.stringify(readJSON(root, migration.review_file.path)) !== JSON.stringify(migration.review)
  )
    throw Error("Draft migration review bytes differ from the recorded decision")
  return input
}

export function loadDraftAuthoringScope(root, runId, input = loadDraftInput(root, runId)) {
  if (!input?.authoring_scope_sha256) return null
  const bytes = fs.readFileSync(
    safePath(root, `runs/${runId}/authoring-scopes/${input.authoring_scope_sha256}.json`),
  )
  if (sha256(bytes) !== input.authoring_scope_sha256) throw Error("Stored authoring scope changed")
  const scope = JSON.parse(bytes)
  if (scope.run_id !== runId) throw Error("Stored authoring scope run differs")
  return scope
}

function migrateUnsentInput(root, runId, previousInput, input, options) {
  const review = options.draftInputMigration,
    base = `runs/${runId}/`
  const hashes = [
    "old_input_sha256",
    "failed_job_input_sha256",
    "failed_job_state_sha256",
    "policy_sha256",
    "claims_sha256",
    "documents_sha256",
    "parses_sha256",
    "completeness_context_sha256",
    "execution_policy_sha256",
    "authoring_scope_sha256",
  ]
  const keys = ["schema", "run_id", "reviewer", "reviewed_at", "reason", "failed_job_id", ...hashes]
  if (
    !review ||
    review.schema !== "research-draft-input-migration-review/v1" ||
    review.run_id !== runId ||
    Object.keys(review).some((k) => !keys.includes(k)) ||
    ![review.reviewer, review.reason].every((x) => typeof x === "string" && x.trim()) ||
    !/^[A-Za-z0-9_-]{1,160}$/.test(review.failed_job_id || "") ||
    hashes.some((k) => !/^[a-f0-9]{64}$/.test(review[k] || ""))
  )
    throw Error("Exact explicit never-sent draft migration review required")
  const originalPath = base + "model-draft-input.json"
  const originalBytes = fs.readFileSync(safePath(root, originalPath))
  const jobBase = `module-jobs/${review.failed_job_id}/`
  const jobBytes = fs.readFileSync(safePath(root, jobBase + "input.json"))
  const stateBytes = fs.readFileSync(safePath(root, jobBase + "state.json"))
  const job = JSON.parse(jobBytes),
    state = JSON.parse(stateBytes)
  if (
    sha256(originalBytes) !== review.old_input_sha256 ||
    sha256(jobBytes) !== review.failed_job_input_sha256 ||
    sha256(stateBytes) !== review.failed_job_state_sha256 ||
    state.input_sha256 !== sha256(JSON.stringify(job)) ||
    state.job_id !== review.failed_job_id ||
    state.state !== "failed" ||
    state.error_code !== "MODEL_INPUT_BUDGET_EXCEEDED" ||
    state.reasoning_task !== null ||
    job.module !== "writing" ||
    job.operation !== "draft" ||
    job.parameters?.run_id !== runId ||
    job.implementation?.["editor.mjs"] !==
      previousInput.implementation?.["scripts/research/editor.mjs"] ||
    job.implementation?.["draft-checkpoint.mjs"] !==
      previousInput.implementation?.["scripts/research/draft-checkpoint.mjs"] ||
    job.context?.root !== fs.realpathSync(root) ||
    job.policy_sha256 !== review.policy_sha256 ||
    !options.modelPolicyFile ||
    sha256(fs.readFileSync(options.modelPolicyFile)) !== review.policy_sha256
  )
    throw Error("Never-sent draft failure or policy binding differs")
  assertReviewDate(review.reviewed_at, { notBefore: [state.finished_at] })
  for (const field of [
    "claims_sha256",
    "documents_sha256",
    "parses_sha256",
    "completeness_context_sha256",
    "execution_policy_sha256",
  ])
    if (review[field] !== previousInput[field] || previousInput[field] !== input[field])
      throw Error("Draft migration source, facts or policy changed")
  const changed = Object.keys(input.implementation).filter(
    (k) => input.implementation[k] !== previousInput.implementation?.[k],
  )
  const { implementation: _oldCode, ...oldData } = previousInput
  const { implementation: _newCode, authoring_scope_sha256: scopeHash, ...newData } = input
  if (
    changed.some(
      (k) => !["scripts/research/editor.mjs", "scripts/research/draft-checkpoint.mjs"].includes(k),
    ) ||
    !options.authoringScope ||
    review.authoring_scope_sha256 !== scopeHash ||
    Object.keys(oldData).length !== Object.keys(newData).length ||
    Object.keys(oldData).some((k) => JSON.stringify(oldData[k]) !== JSON.stringify(newData[k])) ||
    JSON.stringify(Object.keys(previousInput.implementation)) !==
      JSON.stringify(Object.keys(input.implementation))
  )
    throw Error(
      "Draft migration only permits reviewed authoring scope and bounded implementation changes",
    )
  if (
    [
      "draft.json",
      "model-draft-checkpoint.json",
      "approved-article.json",
      "draft-generation-reference.json",
      "model-policy/article_write/budget.json",
    ].some((p) => fs.existsSync(safePath(root, base + p))) ||
    (fs.existsSync(safePath(root, base + "drafts")) &&
      fs.readdirSync(safePath(root, base + "drafts")).length)
  )
    throw Error("Executed, pending or approved draft cannot migrate")
  const tasks = safePath(root, "reasoning-tasks")
  for (const id of fs.existsSync(tasks) ? fs.readdirSync(tasks) : []) {
    if (!/^reasoning-[a-f0-9]{64}$/.test(id)) continue
    const task = readJSON(root, `reasoning-tasks/${id}/request.json`)
    if (task?.run === runId && task.role === "article_write")
      throw Error("Executed or pending reasoning request cannot migrate")
  }
  const store = (relative, bytes) => {
    const old = fs.existsSync(safePath(root, relative)) && fs.readFileSync(safePath(root, relative))
    if (old && !old.equals(bytes)) throw Error("Draft migration archive differs")
    return old ? { path: relative, sha256: sha256(bytes) } : atomicCreate(root, relative, bytes)
  }
  store(base + "draft-inputs/original-" + review.old_input_sha256 + ".json", originalBytes)
  const failure = [
    store(base + "draft-inputs/failed-input-" + review.failed_job_input_sha256 + ".json", jobBytes),
    store(
      base + "draft-inputs/failed-state-" + review.failed_job_state_sha256 + ".json",
      stateBytes,
    ),
  ]
  const version = store(
    base + "draft-inputs/" + sha256(JSON.stringify(input)) + ".json",
    Buffer.from(JSON.stringify(input, null, 2) + "\n"),
  )
  const authoringScope = store(
    base + "authoring-scopes/" + scopeHash + ".json",
    options.authoringScopeBytes || Buffer.from(JSON.stringify(options.authoringScope)),
  )
  const reviewBytes = options.draftInputMigrationBytes || Buffer.from(JSON.stringify(review))
  if (JSON.stringify(JSON.parse(reviewBytes)) !== JSON.stringify(review))
    throw Error("Exact migration review bytes required")
  const reviewFile = store(
    base + "draft-inputs/review-" + sha256(reviewBytes) + ".json",
    reviewBytes,
  )
  const value = {
    schema: "research-draft-input-migration/v1",
    run_id: runId,
    review: structuredClone(review),
    original: { path: originalPath, sha256: review.old_input_sha256 },
    input: version,
    failure,
    authoring_scope: authoringScope,
    review_file: reviewFile,
    candidate_published: false,
  }
  atomicCreate(root, base + "model-draft-input-migration.json", {
    ...value,
    sha256: sha256(JSON.stringify(value)),
  })
}

function validator(claims, options) {
  const usable = options.deepContext
    ? assertDeepDiveContext(
        options.deepContext,
        claims,
        options.parses || [],
        options.documents || [],
      )
    : options.authoringScope
      ? selectAuthoringClaims(claims, options)
      : claims.filter(
          (c) =>
            c.review.status === "verified" || (options.provisional && c.review.structural_pass),
        )
  return (record) => {
    assertSchema(record?.draft, schemaForDraft(options.deepContext))
    if (record.completeness_context)
      assertCompletenessContext(record.completeness_context, claims, {
        documents: options.documents || [],
        parses: options.parses || [],
      })
    if (
      record.schema !== "research-draft/v1" ||
      record.draft_id !== draftFingerprint(record.draft, options.deepContext) ||
      JSON.stringify(record.deep_context || null) !== JSON.stringify(options.deepContext || null) ||
      JSON.stringify(record.completeness_context || null) !==
        JSON.stringify(options.completenessContext || null) ||
      JSON.stringify(record.authoring_scope || null) !==
        JSON.stringify(options.authoringScope || null) ||
      JSON.stringify(record.claim_ids) !== JSON.stringify(usable.map((c) => c.claim_id)) ||
      JSON.stringify(record.problems) !==
        JSON.stringify(
          draftProblems(
            record.draft,
            options.completenessContext ? claims : usable,
            options.deepContext,
            options.completenessContext,
          ),
        ) ||
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
  const input = loadDraftInput(root, runId)
  const authoringScope = loadDraftAuthoringScope(root, runId, input)
  if (
    options.authoringScope &&
    JSON.stringify(options.authoringScope) !== JSON.stringify(authoringScope)
  )
    throw Error("Draft authoring scope changed")
  options = { ...options, authoringScope }
  const receipt = readJSON(root, base + "model-draft-checkpoint.json")
  if (!input || !receipt) throw Error("Completed draft checkpoint required for reuse")
  const inputHash = sha256(JSON.stringify(input))
  if (
    input.schema !== "research-model-draft-input/v1" ||
    input.claims_sha256 !== sha256(JSON.stringify(claims)) ||
    input.documents_sha256 !== sha256(JSON.stringify(options.documents || [])) ||
    input.parses_sha256 !== sha256(JSON.stringify(options.parses || [])) ||
    input.deep_context_sha256 !== sha256(JSON.stringify(options.deepContext || null)) ||
    (input.completeness_context_sha256 || null) !== (options.completenessContext?.sha256 || null) ||
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
    !ledger.attempts.some((attempt) => {
      if (
        attempt.status !== "complete" ||
        JSON.stringify(attempt.result.output) !== JSON.stringify(result.record.draft)
      )
        return false
      let provenance = attempt.result.provenance
      if (attempt.request_budget) {
        // The editor adds admission accounting even when a delegated provider
        // omits it. Bind that addition to the original immutable role request;
        // provider provenance and the ledger budget must still agree exactly.
        const budget = structuredRequestBudget(attempt.request)
        if (
          JSON.stringify(attempt.request_budget) !== JSON.stringify(budget) ||
          (Object.hasOwn(provenance, "request_budget") &&
            JSON.stringify(provenance.request_budget) !== JSON.stringify(budget))
        )
          return false
        provenance = { ...provenance, request_budget: budget }
      }
      return JSON.stringify(provenance) === JSON.stringify(result.record.provenance)
    })
  )
    throw Error("Article writer role ledger changed")
  const current = readJSON(root, `runs/${runId}/draft.json`)
  if (current && JSON.stringify(current) !== JSON.stringify(result.record)) {
    // Reuse the immutable model output, never the other run's editorial approval.
    // A legitimate correction may coexist with that output; validate its full
    // history instead of forcing another model request after editing.
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
  const scopeBytes = options.authoringScope
    ? options.authoringScopeBytes || Buffer.from(JSON.stringify(options.authoringScope))
    : null
  if (scopeBytes) {
    if (
      options.authoringScope.run_id !== runId ||
      JSON.stringify(JSON.parse(scopeBytes)) !== JSON.stringify(options.authoringScope)
    )
      throw Error("Exact authoring scope bytes and writer run required")
    selectAuthoringClaims(claims, options)
  }
  const input = {
    schema: "research-model-draft-input/v1",
    claims_sha256: sha256(JSON.stringify(claims)),
    documents_sha256: sha256(JSON.stringify(options.documents || [])),
    parses_sha256: sha256(JSON.stringify(options.parses || [])),
    deep_context_sha256: sha256(JSON.stringify(options.deepContext || null)),
    ...(options.completenessContext
      ? { completeness_context_sha256: options.completenessContext.sha256 }
      : {}),
    model: options.model,
    think: options.think ?? false,
    provisional: options.provisional === true,
    ...(scopeBytes ? { authoring_scope_sha256: sha256(scopeBytes) } : {}),
    model_metadata_sha256: sha256(JSON.stringify(metadata)),
    execution_policy_sha256: sha256(JSON.stringify(ollama.executionPolicy || null)),
    implementation: Object.fromEntries(
      [
        "scripts/research/draft-checkpoint.mjs",
        "scripts/research/editor.mjs",
        ...(options.completenessContext ? ["scripts/research/editorial-completeness.mjs"] : []),
        "scripts/research/dates.mjs",
        "scripts/research/deep-dive.mjs",
        "scripts/research/contracts.mjs",
        "scripts/sectors.mjs",
        "scripts/themes.mjs",
      ].map((file) => [file, sha256(fs.readFileSync(file))]),
    ),
  }
  const inputHash = sha256(JSON.stringify(input))
  let previousInput = loadDraftInput(root, runId)
  const migrated = readJSON(root, base + "model-draft-input-migration.json")
  if (
    options.draftInputMigration &&
    (!previousInput ||
      (migrated && JSON.stringify(migrated.review) !== JSON.stringify(options.draftInputMigration)))
  )
    throw Error("Explicit draft migration review differs from stored preparation")
  const receipt = readJSON(root, base + "model-draft-checkpoint.json")
  if (previousInput && receipt) {
    // Historical completion is reused under its own implementation. A code
    // update must not regenerate or migrate an already executed request.
    if (
      Object.keys(previousInput).length !== Object.keys(input).length ||
      Object.keys(input).some(
        (k) =>
          k !== "implementation" && JSON.stringify(input[k]) !== JSON.stringify(previousInput[k]),
      )
    )
      throw Error("Draft input changed; preserve the completed generation")
    const { record } = loadDraftCheckpoint(root, runId, claims, options)
    const current = readJSON(root, base + "draft.json")
    if (current && JSON.stringify(current) !== JSON.stringify(record))
      throw Error("Working draft differs from the generation checkpoint")
    return { record, reused: true }
  }
  if (previousInput && sha256(JSON.stringify(previousInput)) !== inputHash) {
    if (!options.draftInputMigration || readJSON(root, base + "model-draft-input-migration.json"))
      throw Error("Draft input changed; use a new run or explicit never-sent migration")
    migrateUnsentInput(root, runId, previousInput, input, options)
    previousInput = loadDraftInput(root, runId)
  }
  const current = readJSON(root, base + "draft.json")
  if (!previousInput && (receipt || current))
    throw Error("Existing draft has no generation checkpoint; preserve it and use a new run")
  const outputPath = base + "drafts/model-" + inputHash + ".json"
  const validate = validator(claims, options)
  if (fs.existsSync(safePath(root, outputPath)))
    throw Error("Unfinished model draft checkpoint; inspect stored output before retrying")
  if (!previousInput) atomicCreate(root, base + "model-draft-input.json", input)
  if (scopeBytes) {
    const scopePath = base + "authoring-scopes/" + sha256(scopeBytes) + ".json"
    const stored =
      fs.existsSync(safePath(root, scopePath)) && fs.readFileSync(safePath(root, scopePath))
    if (stored && !stored.equals(scopeBytes)) throw Error("Stored authoring scope bytes differ")
    if (!stored) atomicCreate(root, scopePath, scopeBytes)
  }
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
