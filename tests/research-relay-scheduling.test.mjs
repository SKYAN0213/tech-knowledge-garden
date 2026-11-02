import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { fixture } from "./fixtures/research-event-fixtures.mjs"
import { executeModule } from "../scripts/research/module-registry.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { atomicCreate, atomicWrite, safePath } from "../scripts/research/run-state.mjs"
import { withRequestOwner } from "../scripts/research/request-ownership.mjs"
import { createReasoningTask, submitReasoningResult } from "../scripts/research/reasoning-tasks.mjs"
import {
  relayPhase,
  selectRelayAction,
  selectRelayBatch,
  recordRelayActor,
  assertRelayRecovery,
} from "../scripts/research/relay-scheduling.mjs"

const task = (run, role = "article_write", kind = "combined_review_correction") => ({
  writer_run: run,
  role,
  kind,
})
const slot = (id, agent, phase = null, busy = false, retiring = false) => ({
  id,
  agent,
  phase,
  busy,
  retiring,
})

test("an idle slot can rotate to a fresh actor rather than waiting for an old author lane", () => {
  const t = task("article-a")
  const slots = [
    slot(1, "author-a", "writing|article-a", true),
    slot(2, "reviewer-a", "final_review|article-a"),
    slot(3, "reviewer-b", "final_review|article-b", true),
  ]
  const history = {
    writers: { "article-a": ["author-a"] },
    reviewers: { "article-a": ["reviewer-a"] },
  }
  assert.deepEqual(selectRelayAction(t, slots, history), {
    action: "rotate",
    lane: 2,
    phase: "writing|article-a",
    role: "writing",
  })
  slots[1] = slot(2, "new-actor")
  assert.deepEqual(selectRelayAction(t, slots, history), {
    action: "assign",
    lane: 2,
    phase: "writing|article-a",
    role: "writing",
  })
  recordRelayActor(history, t, slots[1])
  assert.deepEqual(history.writers["article-a"], ["author-a", "new-actor"])
  assert.throws(() => recordRelayActor(history, t, slot(2, "reviewer-a")), /same actor/)
})

test("final review excludes every actual author and permits a fresh actor on the same slot", () => {
  const t = task("article-a", "evidence_compare", "editorial")
  const history = { writers: { "article-a": ["old-author", "correction-author"] }, reviewers: {} }
  const slots = [slot(1, "old-author", "writing|article-a"), slot(2, "other", null, true)]
  assert.equal(selectRelayAction(t, slots, history).action, "rotate")
  slots[0] = slot(1, "fresh-reviewer")
  assert.equal(selectRelayAction(t, slots, history).action, "assign")
  recordRelayActor(history, t, slots[0])
  assert.throws(() => recordRelayActor(history, t, slot(3, "correction-author")), /same actor/)
})

test("an in-progress phase is preferred; a busy or retiring slot is never reused", () => {
  const t = task("article-b", "evidence_compare", "evidence")
  const phase = relayPhase(t).phase
  const slots = [slot(1, "a"), slot(2, "b", phase), slot(3, "c", phase, true)]
  assert.equal(selectRelayAction(t, slots).lane, 2)
  slots[1].retiring = true
  assert.equal(selectRelayAction(t, slots).lane, 1)
  slots[0].busy = true
  assert.equal(selectRelayAction(t, slots).action, "wait")
})

test("a ready same-phase continuation reserves its actor before an earlier unrelated rotation", () => {
  const tasks = [
    { ...task("article-b"), task_id: "writer-b" },
    { ...task("article-a", "evidence_compare", "evidence"), task_id: "source-a" },
  ]
  const slots = [
    slot(1, "reader-a", "source_review|article-a"),
    slot(2, "reader-b", "source_review|article-b"),
    slot(3, "busy", "final_review|article-c", true),
  ]
  const result = selectRelayBatch(tasks, slots)
  assert.deepEqual(
    result.map(({ task_id, action, lane }) => ({ task_id, action, lane })),
    [
      { task_id: "source-a", action: "assign", lane: 1 },
      { task_id: "writer-b", action: "rotate", lane: 2 },
    ],
  )
  assert.equal(slots[0].busy, false, "a proposal must not change live lane state")
})

test("batch planning keeps article ownership, actor independence, and priority on scarce lanes", () => {
  const requests = [
    { ...task("article-a", "evidence_compare", "editorial"), task_id: "review-a" },
    { ...task("article-b", "evidence_compare", "evidence"), task_id: "source-b" },
    { ...task("article-c"), task_id: "write-c" },
  ]
  const slots = [
    slot(1, "old-author", "final_review|article-a"),
    slot(2, "reader-b", "source_review|article-b", true),
    slot(3, "retiring", null, false, true),
  ]
  const history = { writers: { "article-a": ["old-author"] }, reviewers: {} }
  const result = selectRelayBatch(requests, slots, history)
  assert.deepEqual(
    result.map(({ task_id, action, lane }) => ({ task_id, action, lane })),
    [
      { task_id: "review-a", action: "rotate", lane: 1 },
      { task_id: "source-b", action: "wait", lane: undefined },
      { task_id: "write-c", action: "wait", lane: undefined },
    ],
  )
  assert.throws(() => selectRelayBatch([requests[0], requests[0]], slots, history), /Duplicate/)
})

test("scheduler rejects an unbound task, duplicate actors and more than three slots", () => {
  assert.throws(() => relayPhase({ role: "article_write" }), /article/)
  assert.throws(() => selectRelayAction(task("a"), [slot(1, "a"), slot(2, "a")]), /Unique/)
  assert.throws(
    () =>
      selectRelayAction(
        task("a"),
        [1, 2, 3, 4].map((n) => slot(n, String(n))),
      ),
    /three/,
  )
})

test("the correction resolution is independent review even when its model policy is article_write", () => {
  assert.equal(
    relayPhase(task("article-a", "article_write", "combined_review_correction_resolution")).role,
    "final_review",
  )
})

test("restart stops when an assignment or retirement transition is not confirmed", () => {
  const lane = { ...slot(1, "actor", "writing|article-a", "request-1"), generation: 1 }
  const entry = {
    task_id: "request-1",
    request_sha256: "exact",
    lane: 1,
    agent: "actor",
    generation: 1,
    status: "assigned",
  }
  const state = { lanes: [lane], executions: [entry] }
  assert.throws(() => assertRelayRecovery(state, {}), /assignment status unknown/)
  assert.throws(() => assertRelayRecovery(state, { 1: entry }), /actor liveness unknown/)
  assert.doesNotThrow(() =>
    assertRelayRecovery(state, { 1: entry }, { confirmedActiveActors: ["actor"] }),
  )
  assert.throws(
    () => assertRelayRecovery(state, { 1: { ...entry, request_sha256: "changed" } }),
    /assignment status unknown/,
  )
  lane.busy = false
  assert.throws(() => assertRelayRecovery(state, { 1: entry }), /assignment status unknown/)
  entry.status = "submitted"
  lane.retiring = true
  assert.throws(() => assertRelayRecovery(state, {}), /retirement status unknown/)
  assert.doesNotThrow(() =>
    assertRelayRecovery(state, { 1: { status: "retire", lane: 1, agent: "actor", generation: 1 } }),
  )
  state.writers = { "article-a": ["same-actor"] }
  state.reviewers = { "article-a": ["same-actor"] }
  assert.throws(() => assertRelayRecovery(state, {}), /history overlaps/)
})

test("MCP relay planning derives article and role from the exact pending owner result", async (t) => {
  const f = fixture(t)
  const job_id = "module-relay-owner"
  const input = { job_id, parameters: { run_id: "fixture" } }
  const owner = { job_id, input_sha256: sha256(JSON.stringify(input)) }
  atomicCreate(f.root, `module-jobs/${job_id}/input.json`, input)
  atomicCreate(f.root, `module-jobs/${job_id}/state.json`, {
    state: "running",
    input_sha256: owner.input_sha256,
  })
  const request = withRequestOwner(owner, () =>
    createReasoningTask(f.root, {
      run: "article-a",
      role: "evidence_compare",
      binding: { settings: { model: "gpt-6-luna", think: "high" } },
      input: {
        messages: [
          { role: "system", content: "review" },
          { role: "user", content: '{"kind":"editorial"}' },
        ],
        schema: {
          type: "object",
          properties: { answer: { type: "string" } },
          required: ["answer"],
        },
      },
    }),
  )
  const ref = { task_id: request.task_id, request_sha256: request.request_sha256 }
  const secondRequest = withRequestOwner(owner, () =>
    createReasoningTask(f.root, {
      run: "article-b",
      role: "evidence_compare",
      binding: { settings: { model: "gpt-6-luna", think: "high" } },
      input: {
        messages: [
          { role: "system", content: "review" },
          { role: "user", content: '{"kind":"evidence"}' },
        ],
        schema: { type: "object" },
      },
    }),
  )
  const secondRef = {
    task_id: secondRequest.task_id,
    request_sha256: secondRequest.request_sha256,
  }
  const result = atomicCreate(f.root, `module-jobs/${job_id}/result.json`, {
    schema: "research-module-result/v1",
    input_sha256: owner.input_sha256,
    data: {
      rows: [
        { writer_run: "article-a", candidate_id: "candidate-a", reasoning_task: ref },
        { writer_run: "article-b", candidate_id: "candidate-b", reasoning_task: secondRef },
      ],
    },
  })
  atomicWrite(f.root, `module-jobs/${job_id}/state.json`, {
    state: "completed",
    input_sha256: owner.input_sha256,
    result,
  })
  const params = {
    ...ref,
    lanes: [slot(1, "old-author", "writing|article-a"), slot(2, "other", null, true)],
    writers: [{ writer_run: "article-a", actors: ["old-author"] }],
    reviewers: [],
  }
  const planned = await executeModule(f.ctx, "reasoning", "plan_relay", params)
  assert.equal(planned.action, "rotate")
  assert.equal(planned.lane, 1)
  assert.equal(planned.phase_role, "final_review")
  assert.equal(planned.role, "evidence_compare")
  assert.deepEqual(planned.owner, owner)
  assert.equal(planned.writer_run, "article-a")
  const batchParams = {
    requests: [ref],
    lanes: params.lanes,
    writers: params.writers,
    reviewers: params.reviewers,
  }
  const batch = await executeModule(f.ctx, "reasoning", "plan_relay_batch", batchParams)
  assert.equal(batch.native_state_changed, false)
  assert.equal(batch.plans[0].action, "rotate")
  assert.equal(batch.plans[0].role, "evidence_compare")
  assert.deepEqual(batch.plans[0].owner, owner)
  const mixedBatch = await executeModule(f.ctx, "reasoning", "plan_relay_batch", {
    ...batchParams,
    requests: [ref, secondRef],
    lanes: [
      slot(1, "reader-b", "source_review|article-b"),
      slot(2, "old-author", "writing|article-a"),
    ],
  })
  assert.deepEqual(
    mixedBatch.plans.map(({ task_id, action, lane }) => ({ task_id, action, lane })),
    [
      { task_id: secondRef.task_id, action: "assign", lane: 1 },
      { task_id: ref.task_id, action: "rotate", lane: 2 },
    ],
  )
  assert.equal(mixedBatch.plans[0].writer_run, "article-b")
  assert.deepEqual(mixedBatch.plans[0].owner, owner)
  const scarceBatch = await executeModule(f.ctx, "reasoning", "plan_relay_batch", {
    ...batchParams,
    requests: [ref, secondRef],
    lanes: [slot(1, "reader-b", "source_review|article-b")],
  })
  assert.equal(scarceBatch.plans[0].task_id, secondRef.task_id)
  assert.equal(scarceBatch.plans[1].action, "wait")
  assert.equal(Object.hasOwn(scarceBatch.plans[1], "lane"), false)
  await assert.rejects(
    executeModule(f.ctx, "reasoning", "plan_relay_batch", {
      ...batchParams,
      requests: [ref, ref],
    }),
    /Duplicate/,
  )
  await assert.rejects(
    executeModule(f.ctx, "reasoning", "plan_relay_batch", {
      ...batchParams,
      requests: [{ ...ref, request_sha256: "0".repeat(64) }],
    }),
    /hash changed/,
  )
  await assert.rejects(
    executeModule(f.ctx, "reasoning", "plan_relay", { ...params, request_sha256: "0".repeat(64) }),
    /hash changed/,
  )
  await assert.rejects(
    executeModule(f.ctx, "reasoning", "plan_relay", {
      ...params,
      writers: [...params.writers, ...params.writers],
    }),
    /Duplicate/,
  )
  await assert.rejects(
    executeModule(f.ctx, "reasoning", "plan_relay", {
      ...params,
      reviewers: [{ writer_run: "article-a", actors: ["old-author"] }],
    }),
    /overlaps/,
  )
  await assert.rejects(
    executeModule(f.ctx, "reasoning", "plan_relay", { ...params, writer_run: "other-article" }),
    /Unknown module field/,
  )
  const originalResult = fs.readFileSync(safePath(f.root, result.path))
  fs.writeFileSync(safePath(f.root, result.path), "{}")
  await assert.rejects(executeModule(f.ctx, "reasoning", "plan_relay", params), /SHA changed/)
  fs.writeFileSync(safePath(f.root, result.path), originalResult)
  const nestedResult = atomicCreate(f.root, `module-jobs/${job_id}/nested-result.json`, {
    schema: "research-module-result/v1",
    input_sha256: owner.input_sha256,
    data: {
      processing: {
        rows: [{ writer_run: "article-a", candidate_id: "candidate-a", reasoning_task: ref }],
      },
    },
  })
  atomicWrite(f.root, `module-jobs/${job_id}/state.json`, {
    state: "completed",
    input_sha256: owner.input_sha256,
    result: nestedResult,
  })
  assert.equal(
    (await executeModule(f.ctx, "reasoning", "plan_relay", params)).writer_run,
    "article-a",
  )
  const conflictingResult = atomicCreate(f.root, `module-jobs/${job_id}/conflicting-result.json`, {
    schema: "research-module-result/v1",
    input_sha256: owner.input_sha256,
    data: {
      rows: [
        { writer_run: "article-a", candidate_id: "candidate-a", reasoning_task: ref },
        { writer_run: "article-b", candidate_id: "candidate-b", reasoning_task: ref },
      ],
    },
  })
  atomicWrite(f.root, `module-jobs/${job_id}/state.json`, {
    state: "completed",
    input_sha256: owner.input_sha256,
    result: conflictingResult,
  })
  await assert.rejects(
    executeModule(f.ctx, "reasoning", "plan_relay", params),
    /One exact owner article/,
  )
  atomicWrite(f.root, `module-jobs/${job_id}/state.json`, {
    state: "completed",
    input_sha256: owner.input_sha256,
    result: nestedResult,
  })
  await submitReasoningResult(f.root, {
    ...ref,
    output: { answer: "done" },
    executor: "codex",
    model: "gpt-6-luna",
  })
  await assert.rejects(executeModule(f.ctx, "reasoning", "plan_relay", params), /pending/)
  assert.equal(
    fs.existsSync(safePath(f.root, `reasoning-tasks/${request.task_id}/result.json`)),
    true,
  )
})

test("a timestamp-only correction repair keeps the source-bound writer role", async (t) => {
  const f = fixture(t)
  const job_id = "module-time-repair-owner"
  const input = { job_id, parameters: { run_id: "fixture" } }
  const owner = { job_id, input_sha256: sha256(JSON.stringify(input)) }
  atomicCreate(f.root, `module-jobs/${job_id}/input.json`, input)
  atomicCreate(f.root, `module-jobs/${job_id}/state.json`, {
    state: "running",
    input_sha256: owner.input_sha256,
  })
  const request = withRequestOwner(owner, () =>
    createReasoningTask(f.root, {
      run: "article-a",
      role: "article_write",
      binding: { settings: { model: "gpt-6-luna", think: "high" } },
      input: {
        messages: [
          { role: "system", content: "repair" },
          { role: "user", content: '{"task":"combined_review_correction_time_repair"}' },
        ],
        schema: { type: "object" },
      },
    }),
  )
  const ref = { task_id: request.task_id, request_sha256: request.request_sha256 }
  const result = atomicCreate(f.root, `module-jobs/${job_id}/result.json`, {
    schema: "research-module-result/v1",
    input_sha256: owner.input_sha256,
    data: { rows: [{ writer_run: "article-a", candidate_id: "candidate-a", reasoning_task: ref }] },
  })
  atomicWrite(f.root, `module-jobs/${job_id}/state.json`, {
    state: "completed",
    input_sha256: owner.input_sha256,
    result,
  })
  const planned = await executeModule(f.ctx, "reasoning", "plan_relay", {
    ...ref,
    lanes: [slot(1, "writer", "writing|article-a")],
    writers: [],
    reviewers: [],
  })
  assert.equal(planned.kind, "combined_review_correction_time_repair")
  assert.equal(planned.phase_role, "writing")
  assert.equal(planned.action, "assign")
})

test("MCP relay planning binds a stopped standalone draft correction to its exact job input", async (t) => {
  const f = fixture(t)
  const pending = (
    job_id,
    jobRun,
    requestRun,
    operation = "revise_draft",
    kind = "combined_review_correction",
  ) => {
    const input = {
      schema: "research-module-job-input/v1",
      job_id,
      module: "validation",
      operation,
      parameters: { run_id: jobRun },
    }
    const owner = { job_id, input_sha256: sha256(JSON.stringify(input)) }
    atomicCreate(f.root, `module-jobs/${job_id}/input.json`, input)
    atomicCreate(f.root, `module-jobs/${job_id}/state.json`, {
      state: "running",
      input_sha256: owner.input_sha256,
    })
    const request = withRequestOwner(owner, () =>
      createReasoningTask(f.root, {
        run: "bundle-fix-1",
        role: "article_write",
        binding: { settings: { model: "gpt-6-luna", think: "high" } },
        input: {
          messages: [
            { role: "system", content: "fix the independent finding" },
            {
              role: "user",
              content: JSON.stringify({ task: kind, run_id: requestRun }),
            },
          ],
          schema: {
            type: "object",
            properties: { answer: { type: "string" } },
            required: ["answer"],
          },
        },
      }),
    )
    const ref = { task_id: request.task_id, request_sha256: request.request_sha256 }
    atomicWrite(f.root, `module-jobs/${job_id}/state.json`, {
      state: "waiting_for_reasoning",
      input_sha256: owner.input_sha256,
      reasoning_task: ref,
    })
    return { input, owner, ref }
  }
  const job = pending("module-standalone-fix", "article-a", "article-a")
  const params = {
    ...job.ref,
    lanes: [slot(1, "same-writer", "writing|article-a")],
    writers: [],
    reviewers: [],
  }
  const planned = await executeModule(f.ctx, "reasoning", "plan_relay", params)
  assert.equal(planned.action, "assign")
  assert.equal(planned.writer_run, "article-a")
  assert.equal(planned.phase_role, "writing")
  assert.deepEqual(planned.owner, job.owner)
  assert.equal(Object.hasOwn(planned, "candidate_id"), false)
  const batch = await executeModule(f.ctx, "reasoning", "plan_relay_batch", {
    requests: [job.ref],
    lanes: params.lanes,
    writers: params.writers,
    reviewers: params.reviewers,
  })
  assert.equal(batch.plans.length, 1)
  assert.equal(batch.plans[0].writer_run, "article-a")

  const resolution = pending(
    "module-standalone-resolution",
    "article-a",
    "article-a",
    "revise_draft",
    "combined_review_correction_resolution",
  )
  const resolutionPlan = await executeModule(f.ctx, "reasoning", "plan_relay", {
    ...params,
    ...resolution.ref,
    writers: [{ writer_run: "article-a", actors: ["same-writer"] }],
  })
  assert.equal(resolutionPlan.phase_role, "final_review")
  assert.equal(resolutionPlan.action, "rotate")

  const wrongArticle = pending("module-standalone-wrong-article", "article-b", "article-a")
  await assert.rejects(
    executeModule(f.ctx, "reasoning", "plan_relay", { ...params, ...wrongArticle.ref }),
    /Exact standalone correction owner/,
  )
  const wrongOperation = pending(
    "module-standalone-wrong-operation",
    "article-a",
    "article-a",
    "reader",
  )
  await assert.rejects(
    executeModule(f.ctx, "reasoning", "plan_relay", { ...params, ...wrongOperation.ref }),
    /Exact standalone correction owner/,
  )
  atomicWrite(f.root, `module-jobs/${job.owner.job_id}/input.json`, {
    ...job.input,
    parameters: { run_id: "changed" },
  })
  await assert.rejects(
    executeModule(f.ctx, "reasoning", "plan_relay", params),
    /owner job input changed/,
  )
  atomicWrite(f.root, `module-jobs/${job.owner.job_id}/input.json`, job.input)
  await submitReasoningResult(f.root, {
    ...job.ref,
    output: { answer: "done" },
    executor: "codex",
    model: "gpt-6-luna",
  })
  await assert.rejects(executeModule(f.ctx, "reasoning", "plan_relay", params), /pending/)
})
