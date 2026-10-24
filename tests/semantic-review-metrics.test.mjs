import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { sha256 } from "../scripts/research/contracts.mjs"
import {
  SEMANTIC_METRIC_STAGES,
  assertSemanticObservation,
  recordSemanticObservation,
  readSemanticObservations,
  startSemanticStageTimer,
  summarizeSemanticObservations,
} from "../scripts/research/semantic-review-metrics.mjs"

const provenance = (extra = {}) => ({
  workflow_id: "semantic-metrics-fixture-v1",
  implementation_sha256: "a".repeat(64),
  concept_registry_sha256: "b".repeat(64),
  policy_sha256: "c".repeat(64),
  event_id: "0123456789abcdef",
  task_id: "reasoning-" + "d".repeat(64),
  request_sha256: "e".repeat(64),
  ...extra,
})
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "semantic-metrics-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const record = (options = {}) =>
    recordSemanticObservation({
      root,
      provenance: provenance(),
      stage: "query_embedding",
      status: "completed",
      ...options,
    })
  return { root, record }
}
function sample(f, options, at = "2026-10-23T06:00:00.000Z") {
  // These are deterministic aggregation fixtures, not evidence of model latency.
  return { ...f.record(options).observation, observed_at: at }
}

test("immutable observations keep result bytes/fingerprints untouched and preserve exact provenance", (t) => {
  const f = fixture(t),
    result = Buffer.from('{"links":[]}\n'),
    hash = sha256(result),
    resultFile = path.join(f.root, "result.json")
  fs.writeFileSync(resultFile, result)
  const options = {
      stage: "luna",
      provenance: provenance({
        result_sha256: hash,
        model: "gpt-6-luna",
        executor: "codex",
        approved_run: "native-fixture",
      }),
    },
    first = f.record(options),
    firstBytes = fs.readFileSync(path.join(f.root, first.path)),
    second = f.record(options)
  assert.notEqual(first.path, second.path)
  assert.equal(first.sha256, sha256(firstBytes))
  assert.equal(firstBytes.equals(fs.readFileSync(path.join(f.root, first.path))), true)
  assert.equal(fs.statSync(path.join(f.root, first.path)).mode & 0o777, 0o600)
  assert.equal(fs.readFileSync(resultFile).equals(result), true)
  assert.equal(sha256(fs.readFileSync(resultFile)), hash)
  const rows = readSemanticObservations({
    root: f.root,
    workflow_id: options.provenance.workflow_id,
  })
  assert.equal(rows.length, 2)
  assert.ok(rows.every((o) => o.duration_ms === null && o.duration_source === "unmeasured"))
  assert.deepEqual(rows[0].provenance, first.observation.provenance)
  assert.equal(rows[0].provenance.semantic_input_sha256, null)
  const summary = summarizeSemanticObservations(rows)
  assert.equal(summary.raw_observation_count, 2)
  assert.equal(summary.observation_count, 1)
  assert.equal(summary.duplicate_observation_count, 1)
  assert.equal(summary.by_stage.luna.status_counts.completed, 1)
  assert.deepEqual(summary.by_stage.luna.duration_ms, {
    count: 0,
    total: null,
    median: null,
    p95: null,
  })
})

test("monotonic timer freezes the measured interval and rejects invalid clocks", () => {
  const times = [100, 112.5, 200],
    finish = startSemanticStageTimer({ now: () => times.shift() })
  assert.deepEqual(finish(), { duration_ms: 12.5, duration_source: "monotonic" })
  assert.deepEqual(finish(), { duration_ms: 12.5, duration_source: "monotonic" })
  assert.equal(times.length, 1)
  assert.throws(() => startSemanticStageTimer({ now: () => NaN }), /clock/)
  const backwards = [2, 1]
  assert.throws(startSemanticStageTimer({ now: () => backwards.shift() }), /backwards/)
})

test("stage/cold/warm distributions, known cache denominators, fallback and input reduction remain separate", (t) => {
  const f = fixture(t),
    rows = []
  for (let i = 1; i <= 20; i++)
    rows.push(
      sample(f, {
        stage: "query_embedding",
        temperature: i <= 10 ? "cold" : "warm",
        duration_ms: i,
        duration_source: "monotonic",
        provenance: provenance({ operation_id: "embed-attempt-" + i }),
        cache: { kind: "query_embedding", hit: i > 10 },
        input_bytes: i * 2,
      }),
    )
  rows.push(
    sample(f, {
      stage: "concept_index",
      status: "failure",
      duration_ms: 80,
      duration_source: "monotonic",
      cache: { kind: "concept_index", hit: false },
    }),
  )
  rows.push(sample(f, { stage: "storage_wait", status: "pending" }))
  rows.push(sample(f, { stage: "luna", status: "pending" }))
  rows.push(
    sample(f, {
      stage: "candidate_selection",
      fallback: { used: false, reason: null },
      input_bytes: 1200,
      full_concept_bytes: 1000,
      selected_concept_bytes: 100,
      provenance: provenance({ operation_id: "candidate-1" }),
    }),
  )
  rows.push(
    sample(f, {
      stage: "candidate_selection",
      fallback: { used: true, reason: "embedding_unavailable" },
      input_bytes: 2500,
      full_concept_bytes: 1000,
      selected_concept_bytes: 1000,
      provenance: provenance({ operation_id: "candidate-2" }),
    }),
  )
  const summary = summarizeSemanticObservations(rows),
    embeddings = summary.by_stage.query_embedding
  assert.deepEqual(embeddings.duration_ms, { count: 20, total: 210, median: 10.5, p95: 19 })
  assert.deepEqual(embeddings.by_temperature.cold.duration_ms, {
    count: 10,
    total: 55,
    median: 5.5,
    p95: 10,
  })
  assert.deepEqual(embeddings.by_temperature.warm.duration_ms, {
    count: 10,
    total: 155,
    median: 15.5,
    p95: 20,
  })
  assert.deepEqual(embeddings.cache, { lookups: 20, hits: 10, misses: 10, hit_ratio: 0.5 })
  assert.equal(summary.cache.lookups, 21)
  assert.equal(summary.cache_by_kind.query_embedding.lookups, 20)
  assert.deepEqual(summary.fallback, { decisions: 2, used: 1, unused: 1, ratio: 0.5 })
  assert.equal(summary.by_stage.candidate_selection.concept_payload.median_reduction, 0.45)
  assert.ok(
    Math.abs(summary.by_stage.candidate_selection.concept_payload.weighted_reduction - 0.45) <
      1e-12,
  )
  assert.equal(summary.by_stage.candidate_selection.input_bytes.total, 3700)
  assert.deepEqual(summary.status_counts, { completed: 22, pending: 2, failure: 1 })
  assert.equal(summary.by_stage.storage_wait.duration_ms.total, null)
  assert.equal(summary.by_stage.luna.measured_count, 0)
  assert.deepEqual(Object.keys(summary.by_stage), SEMANTIC_METRIC_STAGES)
})

test("latest exact task counts dedupe result readback, preserve version cohorts and flag timestamp conflicts", (t) => {
  const f = fixture(t),
    rows = [],
    result = "f".repeat(64)
  rows.push(sample(f, { stage: "semantic_task", status: "pending" }))
  rows.push(
    sample(
      f,
      {
        stage: "semantic_task",
        provenance: provenance({ result_sha256: result, model: "gpt-6-luna", executor: "codex" }),
      },
      "2026-10-23T06:01:00Z",
    ),
  )
  rows.push({
    ...rows[1],
    observation_id: crypto.randomUUID(),
    observed_at: "2026-10-23T06:02:00Z",
  })
  rows.push(
    sample(f, {
      stage: "semantic_task",
      status: "failure",
      provenance: provenance({ task_id: "reasoning-" + "9".repeat(64) }),
    }),
  )
  rows.push(
    sample(f, {
      stage: "semantic_task",
      status: "pending",
      provenance: provenance({ implementation_sha256: "8".repeat(64) }),
    }),
  )
  let summary = summarizeSemanticObservations(rows)
  assert.deepEqual(summary.task_counts, {
    total: 3,
    completed: 1,
    pending: 1,
    failure: 1,
    ambiguous: 0,
  })
  assert.equal(summary.duplicate_observation_count, 1)
  assert.equal(summary.cohorts.length, 3)
  rows.push({
    ...rows[1],
    observation_id: crypto.randomUUID(),
    status: "failure",
    observed_at: "2026-10-23T06:02:00Z",
  })
  summary = summarizeSemanticObservations(rows)
  assert.deepEqual(summary.task_counts, {
    total: 3,
    completed: 0,
    pending: 1,
    failure: 1,
    ambiguous: 1,
  })
})

test("exact operation bindings distinguish real repeat timings and reject conflicting replays", (t) => {
  const f = fixture(t),
    one = sample(f, { duration_ms: 1, duration_source: "monotonic" }),
    replay = { ...one, observation_id: crypto.randomUUID(), observed_at: "2026-10-23T06:01:00Z" }
  assert.equal(summarizeSemanticObservations([one, one, replay]).observation_count, 1)
  assert.throws(
    () => summarizeSemanticObservations([one, { ...replay, duration_ms: 2 }]),
    /measurement binding/,
  )
  assert.throws(
    () => summarizeSemanticObservations([one, { ...one, status: "failure" }]),
    /observation identity/,
  )
  const independent = {
    ...replay,
    duration_ms: 2,
    provenance: { ...replay.provenance, operation_id: "independent-dispatch" },
  }
  assert.equal(summarizeSemanticObservations([one, independent]).observation_count, 2)
  const reordered = {
    ...replay,
    provenance: Object.fromEntries(Object.entries(replay.provenance).reverse()),
  }
  assert.equal(summarizeSemanticObservations([one, reordered]).observation_count, 1)
})

test("cache and fallback property order do not multiply persisted lookup metrics", (t) => {
  const f = fixture(t),
    options = {
      stage: "candidate_selection",
      provenance: provenance({ result_sha256: "f".repeat(64) }),
      temperature: "warm",
      duration_ms: 20,
      duration_source: "monotonic",
      input_bytes: 2000,
      full_concept_bytes: 1000,
      selected_concept_bytes: 1000,
    }
  for (const [reverseCache, reverseFallback] of [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ]) {
    f.record({
      ...options,
      cache: reverseCache
        ? { hit: true, kind: "candidate_selection" }
        : { kind: "candidate_selection", hit: true },
      fallback: reverseFallback
        ? { reason: "embedding_unavailable", used: true }
        : { used: true, reason: "embedding_unavailable" },
    })
  }
  const records = readSemanticObservations({ root: f.root, workflow_id: provenance().workflow_id }),
    summary = summarizeSemanticObservations(records)
  assert.equal(new Set(records.map((o) => o.observation_id)).size, 4)
  assert.equal(summary.raw_observation_count, 4)
  assert.equal(summary.observation_count, 1)
  assert.equal(summary.duplicate_observation_count, 3)
  assert.deepEqual(summary.status_counts, { completed: 1, pending: 0, failure: 0 })
  assert.deepEqual(summary.cache, { lookups: 1, hits: 1, misses: 0, hit_ratio: 1 })
  assert.deepEqual(summary.fallback, { decisions: 1, used: 1, unused: 0, ratio: 1 })
  assert.deepEqual(summary.duration_ms, { count: 1, total: 20, median: 20, p95: 20 })
  assert.equal(summary.input_bytes.total, 2000)
  assert.equal(summary.concept_payload.full_bytes, 1000)
  assert.equal(summary.by_stage.candidate_selection.by_temperature.warm.observation_count, 1)
  assert.equal(summary.cohorts[0].observation_count, 1)
})

test("semantic result cache readback dedupes property-order reversal for an exact task", (t) => {
  const f = fixture(t),
    options = {
      stage: "semantic_task",
      provenance: provenance({
        result_sha256: "f".repeat(64),
        model: "gpt-6-luna",
        executor: "codex",
      }),
    }
  f.record({ ...options, cache: { kind: "semantic_result", hit: true } })
  f.record({ ...options, cache: { hit: true, kind: "semantic_result" } })
  const records = readSemanticObservations({ root: f.root, workflow_id: provenance().workflow_id }),
    summary = summarizeSemanticObservations(records)
  assert.equal(records.length, 2)
  assert.notEqual(records[0].observation_id, records[1].observation_id)
  assert.equal(summary.observation_count, 1)
  assert.equal(summary.cache_by_kind.semantic_result.lookups, 1)
  assert.equal(summary.by_stage.semantic_task.status_counts.completed, 1)
  assert.deepEqual(summary.task_counts, {
    total: 1,
    completed: 1,
    pending: 0,
    failure: 0,
    ambiguous: 0,
  })
  assert.deepEqual(summary.duration_ms, { count: 0, total: null, median: null, p95: null })
})

test("private schema refuses source text, unknown metadata, fake model attribution and inconsistent measurements", (t) => {
  const f = fixture(t)
  for (const options of [
    { source_text: "private" },
    { metrics: {} },
    { provenance: { ...provenance(), keywords: ["private"] } },
    { provenance: provenance({ implementation_sha256: "unknown" }) },
    { provenance: provenance({ event_id: ["0123456789abcdef"] }) },
    { provenance: provenance({ task_id: ["reasoning-" + "d".repeat(64)] }) },
    { provenance: provenance({ workflow_id: "../escape" }) },
    { duration_ms: 0 },
    { duration_ms: -1, duration_source: "monotonic" },
    { duration_ms: NaN, duration_source: "provider" },
    { duration_source: "provider" },
    { input_bytes: -1 },
    { input_bytes: 0.1 },
    { full_concept_bytes: 1000 },
    { full_concept_bytes: "1000", selected_concept_bytes: 200 },
    { cache: { kind: "query_embedding", hit: null } },
    { cache: { kind: "query_embedding", hit: true, text: "private" } },
    { stage: "candidate_selection", fallback: { used: true, reason: "private source sentence" } },
    { stage: "candidate_selection", fallback: { used: false, reason: "unused_reason" } },
    { fallback: { used: true, reason: "embedding_unavailable" } },
    {
      stage: "luna",
      duration_ms: 1,
      duration_source: "provider",
      provenance: provenance({ result_sha256: "f".repeat(64) }),
    },
    { stage: "luna", provenance: provenance({ task_id: null, result_sha256: "f".repeat(64) }) },
    { stage: "semantic_task" },
    { stage: "luna", provenance: provenance({ model: "gpt-6-sol" }) },
  ])
    assert.throws(() => f.record(options), /semantic|Semantic|Luna/)
  assert.equal(
    readSemanticObservations({ root: f.root, workflow_id: provenance().workflow_id }).length,
    0,
  )
})

test("reader rejects modified bytes, mismatched workflow, path escapes and symlinked journal files", (t) => {
  const f = fixture(t),
    row = f.record(),
    file = path.join(f.root, row.path),
    bytes = fs.readFileSync(file)
  fs.writeFileSync(file, Buffer.concat([bytes, Buffer.from(" ")]))
  assert.throws(
    () => readSemanticObservations({ root: f.root, workflow_id: provenance().workflow_id }),
    /bytes or workflow changed/,
  )
  fs.writeFileSync(file, bytes)
  const changed = {
      ...row.observation,
      provenance: { ...row.observation.provenance, workflow_id: "other-workflow" },
    },
    changedBytes = JSON.stringify(changed, null, 2) + "\n",
    changedFile = path.join(path.dirname(file), sha256(changedBytes) + ".json")
  fs.writeFileSync(changedFile, changedBytes)
  assert.throws(
    () => readSemanticObservations({ root: f.root, workflow_id: provenance().workflow_id }),
    /workflow changed/,
  )
  fs.unlinkSync(changedFile)
  assert.throws(
    () => readSemanticObservations({ root: f.root, workflow_id: "../escape" }),
    /workflow ID/,
  )
  fs.unlinkSync(file)
  const outside = path.join(f.root, "outside.json")
  fs.writeFileSync(outside, bytes)
  fs.symlinkSync(outside, file)
  assert.throws(
    () => readSemanticObservations({ root: f.root, workflow_id: provenance().workflow_id }),
    /Symlink/,
  )
})

test("empty and unknown timing statistics stay null; measured zero stays explicit", (t) => {
  const f = fixture(t),
    empty = summarizeSemanticObservations([])
  assert.equal(empty.duration_ms.total, null)
  assert.equal(empty.cache.hit_ratio, null)
  assert.equal(empty.fallback.ratio, null)
  assert.equal(empty.input_bytes.total, null)
  assert.equal(empty.concept_payload.median_reduction, null)
  const observedZero = f.record({
    duration_ms: 0,
    duration_source: "monotonic",
    input_bytes: 0,
  }).observation
  assert.equal(summarizeSemanticObservations([observedZero]).duration_ms.median, 0)
  assert.equal(summarizeSemanticObservations([observedZero]).input_bytes.total, 0)
  assert.equal(assertSemanticObservation(observedZero), observedZero)
})
