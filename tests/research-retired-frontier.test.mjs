import test from "node:test"
import assert from "node:assert/strict"
import { fixture } from "./fixtures/research-event-fixtures.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { atomicCreate, atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { withRequestOwner } from "../scripts/research/request-ownership.mjs"
import {
  createReasoningTask,
  readReasoningTask,
  readyArticleItems,
  reasoningFrontier,
  retireReasoningTask,
  submitReasoningResult,
} from "../scripts/research/reasoning-tasks.mjs"
import { driveOperationalRound, operationalNextAction } from "../scripts/research/operations-driver.mjs"

test("a retired article request stays blocked without hiding independent pending work", async (t) => {
  const f = fixture(t)
  const round = { run_id: "round-retired-test" }
  atomicCreate(f.root, `operations/rounds/${round.run_id}/input.json`, round)
  const input = { job_id: "module-retired-test", parameters: { run_id: round.run_id } }
  const owner = {
    job_id: input.job_id,
    input_sha256: sha256(JSON.stringify(input)),
    round_id: round.run_id,
    round_input_sha256: sha256(JSON.stringify(round)),
  }
  atomicCreate(f.root, `module-jobs/${owner.job_id}/input.json`, input)
  atomicCreate(f.root, `module-jobs/${owner.job_id}/state.json`, {
    state: "running", input_sha256: owner.input_sha256,
  })
  const request = (run) => withRequestOwner(owner, () => createReasoningTask(f.root, {
    run,
    role: "evidence_compare",
    binding: { settings: { model: "gpt-6-luna", think: "high" } },
    input: { schema: { type: "object" }, messages: [] },
  }))
  const held = request("held-article"), pending = request("independent-article"),
    ready = request("ready-article")
  const ref = ({ task_id, request_sha256 }) => ({ task_id, request_sha256 })
  const rows = [
    { stage: "reasoning", group_id: "held", reasoning_task: ref(held) },
    { stage: "reasoning", group_id: "independent", reasoning_task: ref(pending) },
    { stage: "reasoning", group_id: "ready", reasoning_task: ref(ready) },
  ]
  const result = atomicCreate(f.root, `module-jobs/${owner.job_id}/result.json`, {
    schema: "research-module-result/v1", input_sha256: owner.input_sha256, data: { rows },
  })
  atomicWrite(f.root, `module-jobs/${owner.job_id}/state.json`, {
    state: "completed", input_sha256: owner.input_sha256, result,
  })
  await retireReasoningTask(f.root, { ...ref(held), reason: "source conflict requires review" })
  await submitReasoningResult(f.root, { ...ref(ready), executor: "codex", model: "gpt-6-luna", output: {} })

  assert.throws(() => readReasoningTask(f.root, ref(held)), /retired/)
  const readyItems = readyArticleItems(f.root, rows, { round_id: round.run_id })
  assert.deepEqual(readyItems.map((item) => item.group_id), ["ready"])
  const frontier = reasoningFrontier(f.root, { round_id: round.run_id, rows })
  assert.deepEqual(frontier.tasks.map((task) => task.task_id), [pending.task_id])
  assert.deepEqual(frontier.retired_tasks.map((task) => task.task_id), [held.task_id])
  assert.equal(frontier.retired_tasks[0].reason, "source conflict requires review")
  assert.equal(operationalNextAction({
    pending_reasoning: frontier, ready_items: readyItems, next_inputs: rows,
    commands: [{ stage: "processing", job_id: owner.job_id,
      job: { state: "completed", worker_alive: false } }],
  }).action, "consume_reasoning")
  assert.deepEqual(operationalNextAction({
    status: "partial", pending_reasoning: frontier, ready_items: [], next_inputs: rows,
    commands: [{ stage: "processing", job_id: owner.job_id,
      job: { state: "completed", worker_alive: false } }],
  }), { action: "advance", stage: "processing", reason: "record_retired_article_request" })

  const retirement = readJSON(f.root, `reasoning-tasks/${held.task_id}/retired.json`)
  atomicWrite(f.root, `reasoning-tasks/${held.task_id}/retired.json`,
    { ...retirement, request_sha256: "0".repeat(64) })
  assert.throws(() => reasoningFrontier(f.root, { round_id: round.run_id, rows }), /retirement.*changed/i)
})

test("the controller records a held article before waiting on another article", async (t) => {
  const ctx = fixture(t).ctx
  const pending = { task_id: "reasoning-pending", request_sha256: "1".repeat(64) }
  const held = { task_id: "reasoning-held", request_sha256: "2".repeat(64), reason: "source conflict" }
  let current = {
    status: "partial", ready_items: [],
    pending_reasoning: { total: 1, tasks: [pending], retired_tasks: [held] },
    next_inputs: [{ stage: "reasoning", reasoning_task: held },
      { stage: "reasoning", reasoning_task: pending }],
    commands: [{ stage: "processing", job_id: "module-prior",
      job: { state: "completed", worker_alive: false } }],
  }
  let calls = 0
  const result = await driveOperationalRound(ctx, { run_id: "round-retired-test" }, {
    status: () => current,
    advance: async (_ctx, parameters) => {
      calls++
      assert.equal(parameters.stage, "processing")
      current = { ...current, pending_reasoning: { total: 1, tasks: [pending] },
        next_inputs: [{ stage: "events", group_id: "held", error: "request retired" },
          { stage: "reasoning", reasoning_task: pending }],
        commands: [{ stage: "processing", job_id: "module-next",
          job: { state: "completed", worker_alive: false } }] }
      return { status: "completed", job: { job_id: "module-next" } }
    },
  })
  assert.equal(calls, 1)
  assert.equal(result.status, "requires_reasoning")
  assert.deepEqual(result.next_action.requests, [pending])
  assert.equal(result.completed, false)
})
