import fs from "node:fs"
import crypto from "node:crypto"
import { performance } from "node:perf_hooks"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, safePath } from "./run-state.mjs"

export const SEMANTIC_OBSERVATION_SCHEMA = "research-semantic-observation/v1"
export const SEMANTIC_METRICS_SCHEMA = "research-semantic-metrics/v1"
export const SEMANTIC_METRIC_STAGES = Object.freeze([
  "concept_index",
  "query_embedding",
  "candidate_selection",
  "luna",
  "storage_wait",
  "semantic_task",
])
const statuses = ["completed", "pending", "failure"]
const temperatures = ["cold", "warm", "unknown"]
const hash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
const safeId = (value, max = 160) =>
  typeof value === "string" && new RegExp(`^[A-Za-z0-9_-]{1,${max}}$`).test(value)
const nullableHashes = [
  "semantic_input_sha256",
  "request_sha256",
  "result_sha256",
  "article_public_sha256",
  "approval_files_sha256",
  "retrieval_policy_sha256",
  "embedding_digest",
  "index_sha256",
  "query_sha256",
  "inventory_sha256",
]
const requiredHashes = ["implementation_sha256", "concept_registry_sha256", "policy_sha256"]
const versionHashes = [
  ...requiredHashes,
  "retrieval_policy_sha256",
  "embedding_digest",
  "index_sha256",
]
const versionKeys = [...versionHashes, "model", "executor"]
const provenanceKeys = [
  "workflow_id",
  "event_id",
  "approved_run",
  "task_id",
  "operation_id",
  "model",
  "executor",
  ...requiredHashes,
  ...nullableHashes,
]
const observationKeys = [
  "schema",
  "observation_id",
  "observed_at",
  "provenance",
  "stage",
  "status",
  "temperature",
  "duration_ms",
  "duration_source",
  "cache",
  "fallback",
  "input_bytes",
  "full_concept_bytes",
  "selected_concept_bytes",
]
function onlyKeys(value, keys, label, exact = true) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    (exact && keys.some((key) => !Object.hasOwn(value, key)))
  )
    throw Error("Invalid semantic " + label + " fields")
}
function assertProvenance(value) {
  onlyKeys(value, provenanceKeys, "provenance")
  if (
    !safeId(value.workflow_id, 100) ||
    requiredHashes.some((key) => !hash(value[key])) ||
    nullableHashes.some((key) => value[key] !== null && !hash(value[key])) ||
    (value.event_id !== null &&
      (typeof value.event_id !== "string" || !/^[a-f0-9]{16}$/.test(value.event_id))) ||
    (value.approved_run !== null && !safeId(value.approved_run)) ||
    (value.operation_id !== null && !safeId(value.operation_id)) ||
    (value.task_id !== null &&
      (typeof value.task_id !== "string" || !/^reasoning-[a-f0-9]{64}$/.test(value.task_id))) ||
    (value.executor !== null && value.executor !== "codex") ||
    (value.model !== null && value.model !== "gpt-6-luna")
  )
    throw Error("Invalid semantic observation provenance")
}
function normalizeProvenance(value) {
  onlyKeys(value, provenanceKeys, "provenance", false)
  const normalized = Object.fromEntries(provenanceKeys.map((key) => [key, value[key] ?? null]))
  assertProvenance(normalized)
  return normalized
}

// Observation files are private telemetry. Never append these fields to an input,
// reasoning result, semantic receipt, cache identity or public review index.
export function assertSemanticObservation(value) {
  onlyKeys(value, observationKeys, "observation")
  assertProvenance(value.provenance)
  if (
    value.schema !== SEMANTIC_OBSERVATION_SCHEMA ||
    typeof value.observation_id !== "string" ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value.observation_id) ||
    typeof value.observed_at !== "string" ||
    !Number.isFinite(Date.parse(value.observed_at)) ||
    !SEMANTIC_METRIC_STAGES.includes(value.stage) ||
    !statuses.includes(value.status) ||
    !temperatures.includes(value.temperature) ||
    !["monotonic", "provider", "unmeasured"].includes(value.duration_source) ||
    (value.duration_ms !== null &&
      (typeof value.duration_ms !== "number" ||
        !Number.isFinite(value.duration_ms) ||
        value.duration_ms < 0)) ||
    (value.duration_ms === null) !== (value.duration_source === "unmeasured")
  )
    throw Error("Invalid semantic observation measurement")
  if (
    ["semantic_task", "luna"].includes(value.stage) &&
    (!value.provenance.event_id || !value.provenance.task_id || !value.provenance.request_sha256)
  )
    throw Error("Semantic task outcome requires exact event, task and request provenance")
  if (
    ["semantic_task", "luna"].includes(value.stage) &&
    value.status === "completed" &&
    !value.provenance.result_sha256
  )
    throw Error("Completed semantic task observation requires its exact result hash")
  if (
    value.stage === "luna" &&
    value.duration_ms !== null &&
    (value.provenance.model !== "gpt-6-luna" || value.provenance.executor !== "codex")
  )
    throw Error("Measured Luna duration requires actual executor and model provenance")
  if (value.cache !== null) {
    onlyKeys(value.cache, ["kind", "hit"], "cache")
    if (
      !["concept_index", "query_embedding", "candidate_selection", "semantic_result"].includes(
        value.cache.kind,
      ) ||
      typeof value.cache.hit !== "boolean"
    )
      throw Error("Invalid semantic cache observation")
  }
  if (value.fallback !== null) {
    onlyKeys(value.fallback, ["used", "reason"], "fallback")
    if (
      value.stage !== "candidate_selection" ||
      typeof value.fallback.used !== "boolean" ||
      (value.fallback.used ? !safeId(value.fallback.reason) : value.fallback.reason !== null)
    )
      throw Error("Invalid semantic fallback observation")
  }
  for (const key of ["input_bytes", "full_concept_bytes", "selected_concept_bytes"])
    if (value[key] !== null && (!Number.isSafeInteger(value[key]) || value[key] < 0))
      throw Error("Invalid semantic byte count")
  if ((value.full_concept_bytes === null) !== (value.selected_concept_bytes === null))
    throw Error("Paired semantic concept byte counts required")
  return value
}

// Only measure the local interval that actually ran. Cross-session task waiting
// is not Luna execution time; use duration_source=unmeasured until supplied by a
// real executor/provider measurement. Clock injection is for deterministic tests.
export function startSemanticStageTimer({ now = () => performance.now() } = {}) {
  const started = now()
  if (!Number.isFinite(started)) throw Error("Invalid semantic monotonic clock")
  let finished = null
  return () => {
    if (finished) return { ...finished }
    const elapsed = now() - started
    if (!Number.isFinite(elapsed) || elapsed < 0)
      throw Error("Semantic monotonic clock moved backwards")
    finished = { duration_ms: elapsed, duration_source: "monotonic" }
    return { ...finished }
  }
}

export function recordSemanticObservation(options) {
  onlyKeys(
    options,
    [
      "root",
      ...observationKeys.filter(
        (key) => !["schema", "observation_id", "observed_at"].includes(key),
      ),
    ],
    "record options",
    false,
  )
  if (typeof options.root !== "string" || !options.root)
    throw Error("Explicit private semantic observation root required")
  const observation = assertSemanticObservation({
    schema: SEMANTIC_OBSERVATION_SCHEMA,
    observation_id: crypto.randomUUID(),
    observed_at: new Date().toISOString(),
    provenance: normalizeProvenance(options.provenance),
    stage: options.stage,
    status: options.status,
    temperature: options.temperature ?? "unknown",
    duration_ms: options.duration_ms ?? null,
    duration_source: options.duration_source ?? "unmeasured",
    cache: options.cache ?? null,
    fallback: options.fallback ?? null,
    input_bytes: options.input_bytes ?? null,
    full_concept_bytes: options.full_concept_bytes ?? null,
    selected_concept_bytes: options.selected_concept_bytes ?? null,
  })
  const bytes = JSON.stringify(observation, null, 2) + "\n",
    relative = `semantic-review-metrics/${observation.provenance.workflow_id}/observations/${sha256(bytes)}.json`,
    receipt = atomicCreate(options.root, relative, bytes)
  return { ...receipt, observation }
}

export function readSemanticObservations({ root, workflow_id }) {
  if (typeof root !== "string" || !root)
    throw Error("Explicit private semantic observation root required")
  if (!safeId(workflow_id, 100)) throw Error("Exact semantic metrics workflow ID required")
  const prefix = `semantic-review-metrics/${workflow_id}/observations/`,
    directory = safePath(root, prefix, { materialize: false })
  if (!fs.existsSync(directory)) return []
  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) throw Error("Invalid semantic observation filename")
      const bytes = fs.readFileSync(safePath(root, prefix + name)),
        observation = assertSemanticObservation(JSON.parse(bytes.toString("utf8")))
      if (sha256(bytes) !== name.slice(0, -5) || observation.provenance.workflow_id !== workflow_id)
        throw Error("Semantic observation bytes or workflow changed")
      return observation
    })
}

function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b),
    n = sorted.length
  return {
    count: n,
    total: n ? sorted.reduce((sum, value) => sum + value, 0) : null,
    median: n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null,
    // Nearest-rank empirical p95; this is a sample statistic, not a prediction.
    p95: n ? sorted[Math.ceil(n * 0.95) - 1] : null,
  }
}
function cacheSummary(records) {
  const lookups = records.filter((o) => o.cache !== null),
    hits = lookups.filter((o) => o.cache.hit).length
  return {
    lookups: lookups.length,
    hits,
    misses: lookups.length - hits,
    hit_ratio: lookups.length ? hits / lookups.length : null,
  }
}
function summarizeRecords(records) {
  const measured = records.filter((o) => o.duration_ms !== null),
    fallback = records.filter((o) => o.fallback !== null),
    used = fallback.filter((o) => o.fallback.used).length,
    payloads = records.filter((o) => o.full_concept_bytes > 0 && o.selected_concept_bytes !== null),
    fullBytes = payloads.reduce((sum, o) => sum + o.full_concept_bytes, 0),
    selectedBytes = payloads.reduce((sum, o) => sum + o.selected_concept_bytes, 0)
  return {
    observation_count: records.length,
    status_counts: Object.fromEntries(
      statuses.map((s) => [s, records.filter((o) => o.status === s).length]),
    ),
    measured_count: measured.length,
    unmeasured_count: records.length - measured.length,
    duration_ms: distribution(measured.map((o) => o.duration_ms)),
    cache: cacheSummary(records),
    cache_by_kind: Object.fromEntries(
      ["concept_index", "query_embedding", "candidate_selection", "semantic_result"].map((kind) => [
        kind,
        cacheSummary(records.filter((o) => o.cache?.kind === kind)),
      ]),
    ),
    fallback: {
      decisions: fallback.length,
      used,
      unused: fallback.length - used,
      ratio: fallback.length ? used / fallback.length : null,
    },
    input_bytes: distribution(
      records.filter((o) => o.input_bytes !== null).map((o) => o.input_bytes),
    ),
    concept_payload: {
      sample_count: payloads.length,
      full_bytes: payloads.length ? fullBytes : null,
      selected_bytes: payloads.length ? selectedBytes : null,
      median_reduction: distribution(
        payloads.map((o) => 1 - o.selected_concept_bytes / o.full_concept_bytes),
      ).median,
      weighted_reduction: fullBytes ? 1 - selectedBytes / fullBytes : null,
    },
  }
}
function stageSummary(records) {
  return Object.fromEntries(
    SEMANTIC_METRIC_STAGES.map((stage) => {
      const group = records.filter((o) => o.stage === stage)
      return [
        stage,
        {
          ...summarizeRecords(group),
          by_temperature: Object.fromEntries(
            temperatures.map((temperature) => [
              temperature,
              summarizeRecords(group.filter((o) => o.temperature === temperature)),
            ]),
          ),
        },
      ]
    }),
  )
}
function latestTaskCounts(records) {
  const tasks = new Map()
  for (const o of records.filter((o) => o.stage === "semantic_task")) {
    const p = o.provenance,
      key = JSON.stringify([
        p.workflow_id,
        p.event_id,
        p.task_id,
        p.request_sha256,
        ...versionHashes.map((k) => p[k]),
      ]),
      time = Date.parse(o.observed_at),
      previous = tasks.get(key)
    if (!previous || time > previous.time) tasks.set(key, { time, states: new Set([o.status]) })
    else if (time === previous.time) previous.states.add(o.status)
  }
  const counts = { total: tasks.size, completed: 0, pending: 0, failure: 0, ambiguous: 0 }
  for (const { states } of tasks.values())
    counts[states.size === 1 ? [...states][0] : "ambiguous"]++
  return counts
}

// Stage totals sum observed intervals and may overlap; they are not end-to-end
// wall time. Native semantic_status remains authoritative for workflow progress.
export function summarizeSemanticObservations(observations) {
  if (!Array.isArray(observations)) throw Error("Semantic observation array required")
  const ids = new Map()
  for (const observation of observations) {
    assertSemanticObservation(observation)
    const serialized = JSON.stringify(observation),
      existing = ids.get(observation.observation_id)
    if (existing && existing.serialized !== serialized)
      throw Error("Conflicting semantic observation identity")
    ids.set(observation.observation_id, { serialized, observation })
  }
  const bindings = new Map()
  for (const { observation: o } of ids.values()) {
    // A stable operation_id distinguishes real repeat dispatches from status readback.
    // Bind nested metadata by field values, independent of JSON property order.
    const key = JSON.stringify([
        provenanceKeys.map((key) => o.provenance[key]),
        o.stage,
        o.status,
        o.temperature,
        o.cache === null ? null : [o.cache.kind, o.cache.hit],
        o.fallback === null ? null : [o.fallback.used, o.fallback.reason],
      ]),
      payload = JSON.stringify([
        o.duration_ms,
        o.duration_source,
        o.input_bytes,
        o.full_concept_bytes,
        o.selected_concept_bytes,
      ]),
      previous = bindings.get(key)
    if (previous && previous.payload !== payload)
      throw Error(
        "Conflicting semantic measurement binding; distinguish actual attempts with operation_id",
      )
    if (!previous || Date.parse(o.observed_at) > Date.parse(previous.observation.observed_at))
      bindings.set(key, { payload, observation: o })
  }
  const records = [...bindings.values()].map((entry) => entry.observation),
    cohorts = new Map()
  for (const o of records) {
    const provenance = Object.fromEntries(
        ["workflow_id", ...versionKeys].map((key) => [key, o.provenance[key]]),
      ),
      key = JSON.stringify(provenance)
    if (!cohorts.has(key)) cohorts.set(key, { provenance, records: [] })
    cohorts.get(key).records.push(o)
  }
  return {
    schema: SEMANTIC_METRICS_SCHEMA,
    raw_observation_count: observations.length,
    duplicate_observation_count: observations.length - records.length,
    ...summarizeRecords(records),
    task_counts: latestTaskCounts(records),
    by_stage: stageSummary(records),
    cohorts: [...cohorts.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([, cohort]) => ({
        provenance: cohort.provenance,
        ...summarizeRecords(cohort.records),
        task_counts: latestTaskCounts(cohort.records),
        by_stage: stageSummary(cohort.records),
      })),
  }
}
