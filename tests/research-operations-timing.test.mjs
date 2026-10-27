import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import fs from "node:fs"
import { fixture } from "./fixtures/research-event-fixtures.mjs"
import { atomicCreate, safePath } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import {
  measureJobTimestamps,
  summarizeStageTiming,
  replayControlTiming,
  runControlTimingReplay,
  recordOperationalJobTiming,
} from "../scripts/research/operations-timing.mjs"
import { moduleCLI } from "../scripts/research/module-cli.mjs"
const at = (n) => new Date(Date.UTC(2026, 9, 25, 0, 0, 0, n)).toISOString()
test("timestamp arithmetic keeps unavailable components null and measures zero explicitly", () => {
  const timing = measureJobTimestamps(
    { submitted_at: at(0), started_at: at(50), finished_at: at(150) },
    [{ created_at: at(10), submitted_at: at(610) }],
  )
  assert.equal(timing.dispatch_wait_ms, 50)
  assert.equal(timing.native_execution_ms, 100)
  assert.equal(timing.reasoning_external_wait_ms, 600)
  assert.equal(timing.model_execution_ms, null)
  assert.equal(timing.actual_review_ms, null)
  assert.equal(timing.fixed_input_replay_verified, false)
  assert.equal(measureJobTimestamps({ submitted_at: at(0), started_at: at(0) }).dispatch_wait_ms, 0)
  assert.equal(
    measureJobTimestamps({ submitted_at: at(100), started_at: at(0) }).dispatch_wait_ms,
    null,
  )
  assert.equal(measureJobTimestamps({}, [{ created_at: at(0) }]).reasoning_external_wait_ms, null)
  const stages = summarizeStageTiming([
    { stage: "collection", job: { timing } },
    { stage: "collection", job: { timing } },
  ])
  assert.equal(stages.collection.dispatch_wait_ms, 100)
  assert.equal(stages.collection.aggregation, "sum_of_job_durations_not_wall_clock")
})
function replayInput() {
  const identity = { input_sha256: sha256("fixed input"), output_sha256: sha256("fixed output") }
  return {
    schema: "research-control-timing-replay/v1",
    fixed_input_sha256: identity.input_sha256,
    expected_output_sha256: identity.output_sha256,
    baseline: {
      ...identity,
      stages: [
        { stage: "controller", category: "control", start_ms: 0, end_ms: 1000 },
        { stage: "reason", category: "model", start_ms: 100, end_ms: 500 },
        { stage: "transfer", category: "external", start_ms: 300, end_ms: 700 },
        { stage: "review", category: "review", start_ms: 900, end_ms: 1000 },
      ],
    },
    candidate: {
      ...identity,
      stages: [
        { stage: "controller", category: "control", start_ms: 0, end_ms: 600 },
        { stage: "reason", category: "model", start_ms: 50, end_ms: 300 },
        { stage: "transfer", category: "external", start_ms: 200, end_ms: 450 },
        { stage: "review", category: "review", start_ms: 550, end_ms: 600 },
      ],
    },
  }
}
test("fixed timestamp replay unions overlapping exclusions and never promotes a synthetic 50 percent reduction", () => {
  const input = replayInput(),
    result = replayControlTiming(input)
  assert.equal(result.baseline.control_wait_ms, 300)
  assert.equal(result.candidate.control_wait_ms, 150)
  assert.equal(result.observed_reduction, 0.5)
  assert.equal(result.control_wait_reduction, null)
  assert.equal(result.fixed_input_replay_verified, false)
  assert.equal(result.acceptance, "actual_baseline_execution_required")
  assert.throws(
    () =>
      replayControlTiming({
        ...input,
        candidate: { ...input.candidate, output_sha256: sha256("different") },
      }),
    /input\/output/,
  )
  assert.throws(
    () =>
      replayControlTiming({
        ...input,
        candidate: { ...input.candidate, stages: input.candidate.stages.slice(1) },
      }),
    /coverage/,
  )
})
test("replay CLI binds exact JSON bytes, preserves one local receipt and rejects input drift", async (t) => {
  const f = fixture(t),
    ref = atomicCreate(f.root, "timing-fixture.json", replayInput()),
    relative = path.relative(f.ctx.repo, safePath(f.root, ref.path))
  const args = [
    "timing-replay",
    "--repo",
    f.ctx.repo,
    "--root",
    f.root,
    "--input",
    relative,
    "--sha256",
    ref.sha256,
  ]
  const first = await moduleCLI(args),
    next = await moduleCLI(args)
  assert.equal(first.reused, false)
  assert.equal(next.reused, true)
  assert.equal(first.fixed_input_replay_verified, false)
  fs.writeFileSync(safePath(f.root, ref.path), "{}")
  assert.throws(
    () => runControlTimingReplay(f.ctx, { path: relative, sha256: ref.sha256 }),
    /SHA changed/,
  )
})
test("resume queue timing starts at the latest queue admission rather than the original request submission", () => {
  const resumed = measureJobTimestamps({
    attempt: 2,
    submitted_at: at(0),
    queued_at: at(900),
    started_at: at(950),
    finished_at: at(1000),
  })
  assert.equal(resumed.dispatch_wait_ms, 50)
  assert.equal(resumed.native_execution_ms, 50)
  assert.equal(
    measureJobTimestamps({ attempt: 2, submitted_at: at(0), started_at: at(950) }).dispatch_wait_ms,
    null,
  )
})

function settledTimingFixture(t) {
  const f = fixture(t),
    job = "module-timing-race",
    operationalRound = { round_id: "timing-race" },
    input = { module: "edition", parameters: {}, context: { operationalRound } }
  f.ctx.operationalRound = operationalRound
  atomicCreate(f.root, `module-jobs/${job}/input.json`, input)
  atomicCreate(f.root, `module-jobs/${job}/state.json`, {
    job_id: job,
    input_sha256: sha256(JSON.stringify(input)),
    state: "completed",
    attempt: 1,
    submitted_at: at(0),
    started_at: at(10),
    finished_at: at(20),
  })
  return { ...f, job }
}

test("concurrent timing receipt creation reuses the identical winning bytes", (t) => {
  const f = settledTimingFixture(t),
    expected = recordOperationalJobTiming(f.ctx, f.job),
    file = safePath(f.root, expected.path),
    bytes = fs.readFileSync(file),
    exists = fs.existsSync
  fs.unlinkSync(file)
  let raced = false
  t.mock.method(fs, "existsSync", (target) => {
    if (target === file && !raced) {
      raced = true
      // Another writer wins after the initial absence observation.
      fs.writeFileSync(file, bytes, { flag: "wx" })
      return false
    }
    return exists(target)
  })
  assert.deepEqual(recordOperationalJobTiming(f.ctx, f.job), expected)
  assert.equal(raced, true)
  assert.deepEqual(fs.readFileSync(file), bytes)
})

test("an existing timing receipt with changed bytes cannot be reused", (t) => {
  const f = settledTimingFixture(t),
    expected = recordOperationalJobTiming(f.ctx, f.job)
  fs.writeFileSync(safePath(f.root, expected.path), JSON.stringify({ changed: true }))
  assert.throws(() => recordOperationalJobTiming(f.ctx, f.job), /timing receipt bytes changed/)
})
