import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { fixture } from "./fixtures/research-event-fixtures.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { withRequestOwner } from "../scripts/research/request-ownership.mjs"
import {
  createReasoningTask,
  reasoningTasks,
  submitReasoningResult,
} from "../scripts/research/reasoning-tasks.mjs"
import { driveArticleProcessingSession } from "../scripts/research/processing-session.mjs"

function setup(t) {
  const f = fixture(t),
    selection = atomicCreate(f.root, "test-selection.json", { selected: Array.from({ length: 32 }, (_, i) => ({ candidate_id: "fixture-" + i })) })
  return {
    ...f,
    p: {
      run_id: "private-processing",
      selection_path: selection.path,
      selection_sha256: selection.sha256,
      review_mode: "combined/v1",
    },
  }
}
test("session retains the deterministic writer and stops for a live or unknown worker", async (t) => {
  const f = setup(t)
  let submitted = 0,
    alive = true
  const deps = {
    submit: async (_ctx, module, operation, parameters, options) => {
      submitted++
      assert.equal(module, "curation")
      assert.equal(operation, "advance")
      assert.equal(parameters.review_mode, "combined/v1")
      assert.equal(parameters.require_completeness, true)
      assert.equal(options.background, true)
      return { job_id: options.jobId }
    },
    status: () => ({ worker_alive: alive, state: "running" }),
  }
  const first = await driveArticleProcessingSession(f.ctx, f.p, deps)
  assert.equal(first.jobs.length, 1)
  assert.equal((await driveArticleProcessingSession(f.ctx, f.p, deps)).status, "running")
  alive = null
  assert.equal(
    (await driveArticleProcessingSession(f.ctx, f.p, deps)).status,
    "worker_status_unknown",
  )
  assert.equal(submitted, 1)
  await assert.rejects(
    driveArticleProcessingSession(f.ctx, { ...f.p, selection_sha256: "0".repeat(64) }, deps),
    /changed/,
  )
})

test("a failed article does not block another ready article or independent pending owners", async (t) => {
  const f = setup(t)
  let submits = 0
  const deps = {
    submit: async () => {
      submits++
      return { state: "running" }
    },
  }
  const first = await driveArticleProcessingSession(f.ctx, f.p, deps),
    id = first.jobs[0].job_id
  const input = { job_id: id, parameters: { run_id: f.p.run_id } },
    fingerprint = sha256(JSON.stringify(input))
  atomicCreate(f.root, `module-jobs/${id}/input.json`, input)
  atomicCreate(f.root, `module-jobs/${id}/state.json`, {
    input_sha256: fingerprint,
    state: "running",
  })
  const schema = {
    type: "object",
    properties: { answer: { type: "string" } },
    required: ["answer"],
  }
  const requests = [0, 1, 2].map((i) =>
    withRequestOwner({ job_id: id, input_sha256: fingerprint }, () =>
      createReasoningTask(f.root, {
        run: "article-" + i,
        role: "article_write",
        binding: { settings: { model: "gpt-6-luna" } },
        input: { schema },
      }),
    ),
  )
  const native = {
    status: "partial",
    rows: [
      ...requests.map((r, i) => ({
        candidate_id: "candidate-" + i,
        writer_run: "writer-" + i,
        status: "waiting_for_reasoning",
        reasoning_task: { task_id: r.task_id, request_sha256: r.request_sha256 },
      })),
      { candidate_id: "candidate-failed", status: "failed" },
    ],
    failures: [{ candidate_id: "candidate-failed", code: "FACT_DECISIONS_REPAIR_EXHAUSTED" }],
    approved_runs: [],
  }
  const result = atomicCreate(f.root, `module-jobs/${id}/result.json`, {
    schema: "research-module-result/v1",
    input_sha256: fingerprint,
    data: native,
  })
  atomicWrite(f.root, `module-jobs/${id}/state.json`, {
    input_sha256: fingerprint,
    state: "completed",
    result,
  })
  const settled = {
    ...deps,
    status: () => ({ state: "completed", worker_alive: false, result, input_sha256: fingerprint }),
  }
  const waiting = await driveArticleProcessingSession(f.ctx, f.p, settled)
  assert.equal(waiting.status, "requires_reasoning")
  assert.equal(waiting.requests.length, 3)
  assert.deepEqual(waiting.failures, native.failures)
  await submitReasoningResult(f.root, {
    task_id: requests[0].task_id,
    request_sha256: requests[0].request_sha256,
    model: "gpt-6-luna",
    executor: "codex",
    output: { answer: "source checked" },
  })
  const next = await driveArticleProcessingSession(f.ctx, f.p, settled)
  assert.equal(next.jobs.length, 2)
  assert.equal(submits, 2)
  assert.equal(next.transitions[0].ready_items.length, 1)
  assert.equal(next.transitions[0].pending, 2)
  assert.equal(next.transitions[0].ready_items[0].owner.job_id, id)
  assert.equal(readJSON(f.root, `reasoning-tasks/${requests[1].task_id}/result.json`), null)
  const successor = next.jobs.at(-1).job_id
  const successorInput = { job_id: successor, parameters: { run_id: f.p.run_id } }
  const successorSHA = sha256(JSON.stringify(successorInput))
  atomicCreate(f.root, `module-jobs/${successor}/input.json`, successorInput)
  const unchanged = atomicCreate(f.root, `module-jobs/${successor}/result.json`, {
    schema: "research-module-result/v1",
    input_sha256: successorSHA,
    data: native,
  })
  atomicWrite(f.root, `module-jobs/${successor}/state.json`, {
    input_sha256: successorSHA,
    state: "completed",
    result: unchanged,
  })
  const stalled = await driveArticleProcessingSession(f.ctx, f.p, {
    ...deps,
    status: () => ({
      state: "completed",
      worker_alive: false,
      result: unchanged,
      input_sha256: successorSHA,
    }),
  })
  assert.equal(stalled.status, "no_progress")
  assert.equal(submits, 2, "an unchanged completed frontier must not create another writer")
  assert.equal(
    fs.existsSync(safePath(f.root, "locks/processing-session-" + f.p.run_id + ".json")),
    false,
  )
  const unknown = { ...deps, status: () => ({ state: "running", worker_alive: null }) }
  assert.equal(
    (await driveArticleProcessingSession(f.ctx, f.p, unknown)).status,
    "worker_status_unknown",
  )
  assert.equal(reasoningTasks(f.root, { job_id: id }).total, 2)
  await submitReasoningResult(f.root, {
    task_id: requests[1].task_id,
    request_sha256: requests[1].request_sha256,
    model: "gpt-6-luna",
    executor: "codex",
    output: { answer: "independent source checked" },
  })
  assert.equal(reasoningTasks(f.root, { job_id: id }).total, 1)
  assert.equal(
    (await driveArticleProcessingSession(f.ctx, f.p, unknown)).status,
    "worker_status_unknown",
  )
  assert.equal(submits, 2, "unknown worker must not trigger a replacement writer")
})

test("completed processing time remains frozen on a later status observation", async (t) => {
  const f = setup(t)
  let submits = 0
  const native = {
    status: "complete",
    rows: Array.from({ length: 32 }, (_, i) => ({
      candidate_id: "article-" + i,
      writer_run: "writer-" + i,
      status: "approved",
    })),
    approved_runs: Array.from({ length: 32 }, (_, i) => "writer-" + i),
    publication_handoff: { path: "handoff.json", sha256: "a".repeat(64) },
  }
  const deps = {
    submit: async () => {
      submits++
      return { state: "running" }
    },
    status: () => ({ state: "completed", worker_alive: false }),
    result: () => native,
  }
  await driveArticleProcessingSession(f.ctx, f.p, deps)
  const complete = await driveArticleProcessingSession(f.ctx, f.p, deps)
  await new Promise((resolve) => setTimeout(resolve, 15))
  const observed = await driveArticleProcessingSession(f.ctx, f.p, deps)
  assert.equal(observed.status, "complete")
  assert.equal(observed.completed_at, complete.completed_at)
  assert.equal(observed.total_elapsed_ms, complete.total_elapsed_ms)
  assert.equal(submits, 1)
})

test("completed request timing is reused between slices and rechecked at final handoff", async (t) => {
  const f = setup(t)
  let reads = 0
  let native = { status: "review_pending", rows: [], approved_runs: [] }
  const deps = {
    submit: async () => ({ state: "running" }),
    status: () => ({ state: "completed", worker_alive: false }),
    result: () => native,
    readTask: () => { reads++; return { status: "completed", result: { path: "timing-response.json" } } },
  }
  await driveArticleProcessingSession(f.ctx, f.p, deps)
  const statePath = `processing-sessions/${f.p.run_id}/latest.json`
  const state = readJSON(f.root, statePath)
  const taskId = "reasoning-" + "a".repeat(64)
  state.request_timing[taskId] = { task_id: taskId, request_sha256: "a".repeat(64), created_at: "2026-10-29T00:00:00Z", submitted_at: "2026-10-29T00:01:00Z" }
  atomicWrite(f.root, statePath, state)
  atomicCreate(f.root, "timing-response.json", { submitted_at: "2026-10-29T00:01:00Z" })
  await driveArticleProcessingSession(f.ctx, f.p, deps)
  assert.equal(reads, 0)
  native = { status: "complete", rows: Array.from({ length: 32 }, (_, i) => ({ candidate_id: "candidate-" + i, status: "approved", writer_run: "writer-" + i })), approved_runs: [], publication_handoff: { path: "handoff.json", sha256: "a".repeat(64) } }
  await driveArticleProcessingSession(f.ctx, f.p, deps)
  assert.equal(reads, 1)
})

test("a fresh session binds its actual selected count instead of requiring 32 articles", async (t) => {
  const f = setup(t)
  const selected = atomicCreate(f.root, "one-selection.json", { selected: [{ candidate_id: "only" }] })
  const p = { ...f.p, run_id: "one-article", selection_path: selected.path, selection_sha256: selected.sha256 }
  const native = { status: "complete", rows: [{ candidate_id: "only", status: "approved", writer_run: "writer-only" }], approved_runs: ["writer-only"], publication_handoff: { path: "handoff.json", sha256: "a".repeat(64) } }
  const deps = { submit: async () => ({ state: "running" }), status: () => ({ state: "completed", worker_alive: false }), result: () => native }
  await driveArticleProcessingSession(f.ctx, p, deps)
  const completed = await driveArticleProcessingSession(f.ctx, p, deps)
  assert.equal(completed.status, "complete")
  assert.equal(readJSON(f.root, `processing-sessions/${p.run_id}/input.json`).selected_count, 1)
})
