import fs from "node:fs"
import { randomUUID } from "node:crypto"
import { sha256 } from "./contracts.mjs"
import { extractionBudget } from "./claims.mjs"
import { atomicWrite, readJSON, safePath } from "./run-state.mjs"

export const MODEL_ROLES = [
  "search_plan",
  "fact_extract",
  "article_write",
  "concept_write",
  "evidence_compare",
]
const commonFields = [
  "model",
  "think",
  "num_ctx",
  "num_predict",
  "temperature",
  "call_timeout_ms",
  "total_timeout_ms",
]
const extractionFields = ["input_char_budget", "facts_per_batch", "extraction_timeout_ms"]
const object = (value) => value && typeof value === "object" && !Array.isArray(value)

function roleSettings(role, input) {
  const allowed = [...commonFields, ...(role === "fact_extract" ? extractionFields : [])]
  if (!object(input) || Object.keys(input).some((k) => !allowed.includes(k)))
    throw Error("Unknown model role setting")
  for (const key of ["model", "think", "num_ctx", "num_predict"])
    if (!Object.hasOwn(input, key)) throw Error("Required model role setting: " + key)
  if (
    typeof input.model !== "string" ||
    !/^[\w./:-]{1,200}$/.test(input.model) ||
    /:cloud$/i.test(input.model)
  )
    throw Error("Installed local model required")
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
    Object.keys(policy).some((k) => !["schema", "roles"].includes(k)) ||
    !object(policy.roles) ||
    !Object.keys(policy.roles).length ||
    Object.keys(policy.roles).some((r) => !MODEL_ROLES.includes(r))
  )
    throw Error("Invalid model execution policy")
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
  if (!stored) return { schema: "model-budget/v1", binding, attempts: [] }
  const { sha256: checksum, ...ledger } = stored
  if (checksum !== sha256(JSON.stringify(ledger))) throw Error("Model budget hash mismatch")
  if (
    ledger.schema !== "model-budget/v1" ||
    JSON.stringify(ledger.binding) !== JSON.stringify(binding)
  )
    throw Error("Model policy or installed model changed; use a new run id")
  if (!Array.isArray(ledger.attempts)) throw Error("Invalid model attempt ledger")
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
        (!attempt.result || attempt.result_sha256 !== sha256(JSON.stringify(attempt.result))))
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

// The caller owns its run lock. The private budget records reservations before
// inference so a killed process cannot reset its total allowance on restart.
export async function prepareRoleOllama(
  base,
  policy,
  role,
  { root, run, overrides = {}, now = () => performance.now() } = {},
) {
  const settings = resolveRolePolicy(policy, role, overrides)
  if (!root || !/^[a-zA-Z0-9_-]+$/.test(run || "")) throw Error("Policy root and run required")
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
  const executionPolicy = { ...identity, fingerprint: sha256(JSON.stringify(identity)) }
  readBudget(root, file, executionPolicy)
  const deadline = started + settings.total_timeout_ms
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
      think: settings.think,
      num_ctx: settings.num_ctx,
      num_predict: settings.num_predict,
      temperature: settings.temperature,
    }
    const requestFingerprint = sha256(
      JSON.stringify({
        binding: executionPolicy.fingerprint,
        model: configured.model,
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
    const allowance = Math.floor(
      Math.min(
        settings.call_timeout_ms,
        request.timeout_ms ?? settings.call_timeout_ms,
        settings.total_timeout_ms - spent(ledger),
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
    try {
      const result = await base.structured.call(scoped, { ...configured, timeout_ms: allowance })
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
      saveBudget(root, file, ledger)
      return recorded
    } catch (error) {
      Object.assign(attempt, {
        status: "failed",
        wall_ms: Math.max(0, Math.ceil(now() - callStart)),
        finished_at: new Date().toISOString(),
        error: error.message,
      })
      delete attempt.result
      delete attempt.result_sha256
      saveBudget(root, file, ledger)
      throw error
    }
  }
  return scoped
}
