import fs from "node:fs"
import { randomUUID } from "node:crypto"
import { sha256 } from "./contracts.mjs"
import { extractionBudget } from "./claims.mjs"
import { atomicWrite, readJSON, safePath } from "./run-state.mjs"
import { validateLocalOllamaURL } from "./ollama.mjs"

export const MODEL_ROLES = [
  "search_plan",
  "fact_extract",
  "article_write",
  "concept_write",
  "evidence_compare",
]
const PRE_BUDGET_EXTENSION_IMPLEMENTATION_SHA256 =
  "ee4340ca6445b140f02b74cbfcb3c8bfd6532ab7a4f5ff7591a65d7339f46260"
const commonFields = [
  "provider",
  "model",
  "think",
  "num_ctx",
  "num_predict",
  "temperature",
  "call_timeout_ms",
  "total_timeout_ms",
]
const extractionFields = [
  "input_char_budget",
  "facts_per_batch",
  "extraction_timeout_ms",
  "extraction_scope",
]
const object = (value) => value && typeof value === "object" && !Array.isArray(value)

function roleSettings(role, input) {
  const allowed = [...commonFields, ...(role === "fact_extract" ? extractionFields : [])]
  if (!object(input) || Object.keys(input).some((k) => !allowed.includes(k)))
    throw Error("Unknown model role setting")
  for (const key of ["model", "think", "num_ctx", "num_predict"])
    if (!Object.hasOwn(input, key)) throw Error("Required model role setting: " + key)
  const provider = input.provider ?? "ollama"
  if (!["ollama", "openai"].includes(provider)) throw Error("Unknown model provider")
  if (typeof input.model !== "string" || !/^[\w./:-]{1,200}$/.test(input.model))
    throw Error("Invalid model identifier")
  if (provider === "ollama" && /:cloud$/i.test(input.model))
    throw Error("Installed local model required")
  if (provider === "openai" && !/^[\w.-]{1,100}$/.test(input.model))
    throw Error("Invalid OpenAI model identifier")
  if (
    typeof input.think !== "boolean" &&
    !(
      typeof input.think === "string" &&
      /^[a-z][a-z_-]{0,31}$/.test(input.think) &&
      !["false", "true"].includes(input.think)
    )
  )
    throw Error("Typed think setting required")
  const settings = {
    ...input,
    provider,
    temperature: input.temperature ?? 0,
    call_timeout_ms: input.call_timeout_ms ?? 300000,
    total_timeout_ms: input.total_timeout_ms ?? (role === "fact_extract" ? 900000 : 600000),
  }
  for (const [key, min, max] of [
    ["num_ctx", 4096, 32768],
    ["num_predict", 128, 8192],
    ["call_timeout_ms", 1, 3600000],
    ["total_timeout_ms", 1, 7200000],
  ])
    if (!Number.isInteger(settings[key]) || settings[key] < min || settings[key] > max)
      throw Error("Model policy budget out of range: " + key)
  if (
    !Number.isFinite(settings.temperature) ||
    settings.temperature < 0 ||
    settings.temperature > 2
  )
    throw Error("Model policy temperature out of range")
  if (role === "fact_extract")
    settings.extraction_scope = settings.extraction_scope ?? "full_source"
  if (
    role === "fact_extract" &&
    !["full_source", "research_key_findings"].includes(settings.extraction_scope)
  )
    throw Error("Invalid fact extraction scope")
  if (role === "fact_extract")
    Object.assign(
      settings,
      extractionBudget({
        num_ctx: settings.num_ctx,
        num_predict: settings.num_predict,
        call_timeout_ms: settings.call_timeout_ms,
        input_char_budget: settings.input_char_budget,
        facts_per_batch: settings.facts_per_batch,
        extraction_timeout_ms: settings.extraction_timeout_ms ?? settings.total_timeout_ms,
      }),
    )
  return settings
}

export function validateModelPolicy(policy) {
  if (
    !object(policy) ||
    policy.schema !== "model-execution-policy/v1" ||
    Object.keys(policy).some((k) => !["schema", "roles", "runtime"].includes(k)) ||
    !object(policy.roles) ||
    !Object.keys(policy.roles).length ||
    Object.keys(policy.roles).some((r) => !MODEL_ROLES.includes(r)) ||
    (policy.runtime !== undefined &&
      (!object(policy.runtime) ||
        Object.keys(policy.runtime).some((key) => key !== "ollama_url") ||
        typeof policy.runtime.ollama_url !== "string"))
  )
    throw Error("Invalid model execution policy")
  if (policy.runtime?.ollama_url !== undefined) validateLocalOllamaURL(policy.runtime.ollama_url)
  for (const [role, settings] of Object.entries(policy.roles)) roleSettings(role, settings)
  return structuredClone(policy)
}

export function resolveRolePolicy(policy, role, overrides = {}) {
  validateModelPolicy(policy)
  if (!MODEL_ROLES.includes(role) || !policy.roles[role])
    throw Error("Model policy role missing: " + role)
  return roleSettings(role, { ...policy.roles[role], ...overrides })
}

function readBudget(root, file, binding) {
  const stored = readJSON(root, file)
  if (!stored) return { schema: "model-budget/v2", binding, attempts: [], extensions: [] }
  const { sha256: checksum, ...ledger } = stored
  if (checksum !== sha256(JSON.stringify(ledger))) throw Error("Model budget hash mismatch")
  const { fingerprint: previousFingerprint, ...previousIdentity } = ledger.binding ?? {}
  const { fingerprint: _requestedFingerprint, ...requestedIdentity } = binding
  const previousIdentityCompatible =
    previousFingerprint === sha256(JSON.stringify(previousIdentity)) &&
    previousIdentity.implementation_sha256 === PRE_BUDGET_EXTENSION_IMPLEMENTATION_SHA256 &&
    JSON.stringify({
      ...previousIdentity,
      implementation_sha256: requestedIdentity.implementation_sha256,
    }) === JSON.stringify(requestedIdentity)
  if (
    !["model-budget/v1", "model-budget/v2"].includes(ledger.schema) ||
    (JSON.stringify(ledger.binding) !== JSON.stringify(binding) && !previousIdentityCompatible)
  )
    throw Error("Model policy or installed model changed; use a new run id")
  if (!Array.isArray(ledger.attempts)) throw Error("Invalid model attempt ledger")
  if (ledger.extensions === undefined) ledger.extensions = []
  if (
    !Array.isArray(ledger.extensions) ||
    ledger.extensions.some(
      (extension) =>
        !extension ||
        !Number.isInteger(extension.additional_ms) ||
        extension.additional_ms <= 0 ||
        typeof extension.reason !== "string" ||
        !extension.reason.trim() ||
        !Number.isFinite(Date.parse(extension.created_at || "")),
    )
  )
    throw Error("Invalid model budget extension ledger")
  const ids = new Set()
  for (const attempt of ledger.attempts) {
    if (
      !attempt.id ||
      ids.has(attempt.id) ||
      !["running", "complete", "failed"].includes(attempt.status) ||
      !Number.isInteger(attempt.reserved_ms) ||
      attempt.reserved_ms < 1 ||
      (attempt.status !== "running" &&
        (!Number.isInteger(attempt.wall_ms) || attempt.wall_ms < 0)) ||
      (attempt.status === "complete" &&
        (!attempt.result || attempt.result_sha256 !== sha256(JSON.stringify(attempt.result)))) ||
      (attempt.failure_artifacts &&
        (attempt.status !== "failed" ||
          attempt.failure_artifacts_sha256 !== sha256(JSON.stringify(attempt.failure_artifacts))))
    )
      throw Error("Invalid model attempt receipt")
    ids.add(attempt.id)
  }
  return ledger
}
const spent = (ledger) =>
  ledger.attempts.reduce((n, a) => n + (a.status === "running" ? a.reserved_ms : a.wall_ms), 0)
function saveBudget(root, file, ledger) {
  atomicWrite(root, file, { ...ledger, sha256: sha256(JSON.stringify(ledger)) })
}

// Validate historical receipts using their original binding, without consulting
// installed models or reserving budget for a new call.
export function loadRoleBudget(root, run, role) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(run || "") || !MODEL_ROLES.includes(role))
    throw Error("Exact historical model role required")
  const file = `runs/${run}/model-policy/${role}/budget.json`
  const stored = readJSON(root, file)
  if (!stored) throw Error("Completed bound model role required")
  const { fingerprint, ...identity } = stored.binding || {}
  if (stored.binding?.role !== role || fingerprint !== sha256(JSON.stringify(identity)))
    throw Error("Historical model role binding changed")
  return readBudget(root, file, stored.binding)
}

// The caller owns its run lock. The private budget records reservations before
// inference so a killed process cannot reset its total allowance on restart.
export async function prepareRoleProvider(
  base,
  policy,
  role,
  {
    root,
    run,
    overrides = {},
    additionalBudgetMs = 0,
    extensionReason = "",
    now = () => performance.now(),
  } = {},
) {
  const settings = resolveRolePolicy(policy, role, overrides)
  if (typeof base?.metadata !== "function" || typeof base?.structured !== "function")
    throw Error("Model provider must implement metadata and structured")
  if (!root || !/^[a-zA-Z0-9_-]+$/.test(run || "")) throw Error("Policy root and run required")
  if (
    !Number.isInteger(additionalBudgetMs) ||
    additionalBudgetMs < 0 ||
    additionalBudgetMs > 3600000
  )
    throw Error("Model budget extension must be between 0 and 3600000 ms")
  if (additionalBudgetMs && settings.provider !== "ollama")
    throw Error("Explicit model budget extensions are only available for local Ollama runs")
  if (additionalBudgetMs && (typeof extensionReason !== "string" || !extensionReason.trim()))
    throw Error("A reason is required for a model budget extension")
  const file = `runs/${run}/model-policy/${role}/budget.json`
  safePath(root, file)
  const started = now()
  const metadata = await base.metadata(settings.model, {
    timeout_ms: Math.min(settings.call_timeout_ms, 20000),
  })
  function checkMetadata(value) {
    if (
      value.model !== settings.model ||
      !/^[a-f0-9]{64}$/.test(value.digest || "") ||
      !value.runtime
    )
      throw Error("Invalid installed model metadata")
    if (!value.capabilities?.includes("completion")) throw Error("Model cannot complete text")
    if (!value.thinking?.values?.some((v) => v === settings.think))
      throw Error("Unsupported think setting for role")
    if (value.digest !== metadata.digest || value.runtime !== metadata.runtime)
      throw Error("Installed policy model changed before inference")
    return value
  }
  checkMetadata(metadata)
  const identity = {
    schema: "model-role-binding/v1",
    role,
    settings,
    policy_sha256: sha256(JSON.stringify(policy)),
    implementation_sha256: sha256(fs.readFileSync(new URL(import.meta.url))),
    model_digest: metadata.digest,
    runtime: metadata.runtime,
  }
  let executionPolicy = { ...identity, fingerprint: sha256(JSON.stringify(identity)) }
  const ledger = readBudget(root, file, executionPolicy)
  if (ledger.binding.fingerprint !== executionPolicy.fingerprint) executionPolicy = ledger.binding
  if (additionalBudgetMs) {
    const currentExtensions = ledger.extensions.reduce((n, item) => n + item.additional_ms, 0)
    if (settings.total_timeout_ms + currentExtensions + additionalBudgetMs > 7200000)
      throw Error("Extended model role budget exceeds the 7200000 ms maximum")
    ledger.schema = "model-budget/v2"
    ledger.extensions.push({
      additional_ms: additionalBudgetMs,
      reason: extensionReason.trim(),
      created_at: new Date().toISOString(),
    })
    saveBudget(root, file, ledger)
  }
  const additionalBudget = ledger.extensions.reduce((n, item) => n + item.additional_ms, 0)
  const totalBudgetMs = settings.total_timeout_ms + additionalBudget
  const deadline = started + totalBudgetMs
  const scoped = Object.create(base)
  scoped.executionPolicy = executionPolicy
  scoped.metadata = async (model, options = {}) => {
    if (model !== settings.model) throw Error("Model does not match role policy")
    return checkMetadata(
      await base.metadata(model, {
        timeout_ms: Math.min(options.timeout_ms ?? settings.call_timeout_ms, 20000),
      }),
    )
  }
  scoped.json = (endpoint, body, options = {}) => {
    const remaining = Math.floor(deadline - now())
    if (remaining <= 0) throw Error("Role model time budget exceeded")
    return base.json(endpoint, body, {
      timeout_ms: Math.min(options.timeout_ms ?? settings.call_timeout_ms, remaining),
    })
  }
  scoped.structured = async (request) => {
    if (request.model !== settings.model) throw Error("Model does not match role policy")
    const configured = {
      ...request,
      model: settings.model,
      provider: settings.provider,
      think: settings.think,
      num_ctx: settings.num_ctx,
      num_predict: settings.num_predict,
      temperature: settings.temperature,
    }
    const requestFingerprint = sha256(
      JSON.stringify({
        binding: executionPolicy.fingerprint,
        model: configured.model,
        provider: configured.provider,
        think: configured.think,
        num_ctx: configured.num_ctx,
        num_predict: configured.num_predict,
        temperature: configured.temperature,
        messages: configured.messages,
        schema: configured.schema,
      }),
    )
    const ledger = readBudget(root, file, executionPolicy)
    const cached = ledger.attempts.find(
      (a) => a.status === "complete" && a.request_fingerprint === requestFingerprint,
    )
    if (cached) {
      await scoped.metadata(settings.model)
      return structuredClone(cached.result)
    }
    if (
      settings.provider === "openai" &&
      ledger.attempts.some(
        (attempt) =>
          attempt.status === "failed" && attempt.request_fingerprint === requestFingerprint,
      )
    )
      throw Error(
        "OpenAI attempt previously failed; inspect API usage before retrying with a new run ID",
      )
    const allowance = Math.floor(
      Math.min(
        settings.call_timeout_ms,
        request.timeout_ms ?? settings.call_timeout_ms,
        totalBudgetMs - spent(ledger),
        deadline - now(),
      ),
    )
    if (allowance <= 0) throw Error("Role model time budget exceeded; earlier attempts preserved")
    const callStart = now()
    const attempt = {
      id: randomUUID(),
      status: "running",
      reserved_ms: allowance,
      request_fingerprint: requestFingerprint,
      started_at: new Date().toISOString(),
      request: { ...configured, timeout_ms: allowance },
    }
    ledger.attempts.push(attempt)
    saveBudget(root, file, ledger)
    let latestProgress,
      lastProgressWrite = -Infinity
    const progressFile = `runs/${run}/model-policy/${role}/progress/${attempt.id}.json`
    const onProgress = (value, force = false) => {
      latestProgress = value
      if (!force && value.status === "generating" && now() - lastProgressWrite < 5000) return
      atomicWrite(root, progressFile, {
        ...value,
        attempt_id: attempt.id,
        request_fingerprint: requestFingerprint,
        observed_at: new Date().toISOString(),
      })
      lastProgressWrite = now()
    }
    try {
      const result = await base.structured.call(scoped, {
        ...configured,
        timeout_ms: allowance,
        ...(settings.provider === "ollama" ? { on_progress: onProgress } : {}),
      })
      // The first caller and a resumed caller must receive the same JSON value.
      // Optional provider statistics can be absent; do not invent zero counts.
      const recorded = JSON.parse(
        JSON.stringify({
          ...result,
          provenance: { ...result.provenance, model_policy: executionPolicy },
        }),
      )
      Object.assign(attempt, {
        status: "complete",
        wall_ms: Math.max(0, Math.ceil(now() - callStart)),
        finished_at: new Date().toISOString(),
        result: recorded,
        result_sha256: sha256(JSON.stringify(recorded)),
      })
      if (latestProgress) {
        onProgress({ ...latestProgress, status: "complete" }, true)
        attempt.progress_path = progressFile
      }
      saveBudget(root, file, ledger)
      return recorded
    } catch (error) {
      Object.assign(attempt, {
        status: "failed",
        wall_ms: Math.max(0, Math.ceil(now() - callStart)),
        finished_at: new Date().toISOString(),
        error: error.message,
      })
      if (latestProgress) {
        onProgress({ ...latestProgress, status: "failed", error: error.message }, true)
        attempt.progress_path = progressFile
      }
      if (error.model_artifacts) {
        attempt.failure_artifacts = error.model_artifacts
        attempt.failure_artifacts_sha256 = sha256(JSON.stringify(error.model_artifacts))
      }
      delete attempt.result
      delete attempt.result_sha256
      saveBudget(root, file, ledger)
      throw error
    }
  }
  return scoped
}

export async function prepareRoleOllama(base, policy, role, options = {}) {
  const settings = resolveRolePolicy(policy, role, options.overrides)
  if (settings.provider !== "ollama") throw Error("Role policy does not select Ollama")
  return prepareRoleProvider(base, policy, role, options)
}
