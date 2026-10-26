import test from "node:test"
import assert from "node:assert/strict"
import { fixture } from "./fixtures/research-event-fixtures.mjs"
import { atomicCreate, readJSON, safePath } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { withRequestOwner } from "../scripts/research/request-ownership.mjs"
import {
  createReasoningTask,
  reasoningTasks,
  readReasoningBatch,
  submitReasoningBatch,
  retireReasoningTask,
  submitReasoningResult,
  readReasoningTask,
} from "../scripts/research/reasoning-tasks.mjs"
import { checkedScheduledInvocation } from "../scripts/research/schedule-contract.mjs"
import fs from "node:fs"
const schema = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false,
}
function task(f, i, owned = true) {
  const job_id = `module-batch-${i}`
  const input = { job_id, parameters: { run_id: "batch" } }
  const owner = { job_id, input_sha256: sha256(JSON.stringify(input)) }
  if (owned) {
    atomicCreate(f.root, `module-jobs/${job_id}/input.json`, input)
    atomicCreate(f.root, `module-jobs/${job_id}/state.json`, {
      state: "waiting_for_reasoning",
      input_sha256: owner.input_sha256,
    })
  }
  const make = () =>
    createReasoningTask(f.root, {
      run: `batch-${i}`,
      role: "article_write",
      binding: { settings: { model: "gpt-6-luna" } },
      input: { schema },
    })
  const request = owned ? withRequestOwner(owner, make) : make()
  if (owned)
    fs.writeFileSync(
      safePath(f.root, `module-jobs/${job_id}/state.json`),
      JSON.stringify({
        state: "waiting_for_reasoning",
        input_sha256: owner.input_sha256,
        reasoning_task: { task_id: request.task_id, request_sha256: request.request_sha256 },
      }),
    )
  return {
    task_id: request.task_id,
    request_sha256: request.request_sha256,
    executor: "codex",
    model: "gpt-6-luna",
    output: { answer: "bound" },
  }
}
test("batch max3 preserves partial success, owner binding, duplicate/model/SHA rejection and retirement", async (t) => {
  const f = fixture(t),
    a = task(f, 1),
    b = task(f, 2),
    c = task(f, 3),
    unowned = task(f, 4, false)
  assert.equal(reasoningTasks(f.root).total, 3)
  assert.equal(reasoningTasks(f.root, { run_id: "batch-4" }).total, 1)
  await assert.rejects(submitReasoningBatch(f.root, { results: [a, b, c, unowned] }), /three/)
  await assert.rejects(submitReasoningBatch(f.root, { results: [a, a] }), /distinct/)
  const partial = await submitReasoningBatch(f.root, {
    results: [a, { ...b, model: "wrong" }, { ...c, request_sha256: "0".repeat(64) }],
  })
  assert.equal(partial.status, "partial")
  assert.deepEqual(partial.ready_job_ids, ["module-batch-1"])
  assert.equal(readReasoningTask(f.root, a).status, "completed")
  assert.equal((await submitReasoningBatch(f.root, { results: [a, b] })).results[0].reused, true)
  await retireReasoningTask(f.root, { ...c, reason: "discarded experiment" })
  assert.equal(reasoningTasks(f.root).total, 0)
  assert.equal(readReasoningBatch(f.root, { requests: [a, c] }).results[1].status, "rejected")
  await assert.rejects(submitReasoningResult(f.root, c), /retired/)
  assert.equal(readJSON(f.root, `reasoning-tasks/${c.task_id}/result.json`), null)
})
test("pending excludes a changed owner input and requests cannot be submitted after owner retirement", async (t) => {
  const f = fixture(t),
    a = task(f, 1),
    b = task(f, 2)
  fs.writeFileSync(safePath(f.root, "module-jobs/module-batch-1/input.json"), "{}")
  atomicCreate(f.root, "module-jobs/module-batch-2/retired.json", { reason: "discarded" })
  assert.equal(reasoningTasks(f.root).total, 0)
  await assert.rejects(submitReasoningResult(f.root, a), /owner job input/)
  await assert.rejects(submitReasoningResult(f.root, b), /retired/)
})
test("new schedule evidence binds real event fields; legacy requires an explicit read flag", (t) => {
  const f = fixture(t)
  const event = {
    kind: "scheduled",
    schedule_id: "tech-knowledge-garden-04",
    execution_id: "unit-only",
    started_at: "2026-10-24T19:00:00Z",
  }
  const evidence = atomicCreate(f.root, "event.json", event)
  const invocation = {
    schema: "research-scheduled-invocation/v2",
    ...event,
    reason: "unit fixture only",
    evidence,
  }
  const ref = atomicCreate(f.root, "invocation.json", invocation)
  assert.equal(checkedScheduledInvocation(f.ctx, ref).execution_id, "unit-only")
  const wrong = atomicCreate(f.root, "wrong.json", { ...invocation, execution_id: "other" })
  assert.throws(() => checkedScheduledInvocation(f.ctx, wrong), /actual scheduler/)
  const legacy = atomicCreate(f.root, "legacy.json", {
    ...invocation,
    schema: "research-scheduled-invocation/v1",
  })
  assert.throws(() => checkedScheduledInvocation(f.ctx, legacy), /v2/)
  assert.equal(
    checkedScheduledInvocation(f.ctx, legacy, { allowLegacy: true }).execution_id,
    "unit-only",
  )
})
