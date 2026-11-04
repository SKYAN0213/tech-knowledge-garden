import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { fixture } from "./fixtures/research-event-fixtures.mjs"
import { executeModule } from "../scripts/research/module-registry.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath } from "../scripts/research/run-state.mjs"
import { withRequestOwner } from "../scripts/research/request-ownership.mjs"
import { createReasoningTask, reasoningFrontier } from "../scripts/research/reasoning-tasks.mjs"
import { verifyRelayHistory } from "../scripts/research/relay-ledger.mjs"
import { summarizeRelayTiming } from "../scripts/research/relay-timing.mjs"

function articleRequests(t) {
  const f = fixture(t),
    round = { run_id: "round-ledger", relay_provenance: "v1" }
  atomicCreate(f.root, `operations/rounds/${round.run_id}/input.json`, round)
  const input = { job_id: "module-ledger", parameters: { run_id: round.run_id } }
  const owner = {
    job_id: input.job_id,
    input_sha256: sha256(JSON.stringify(input)),
    round_id: round.run_id,
    round_input_sha256: sha256(JSON.stringify(round)),
  }
  atomicCreate(f.root, `module-jobs/${owner.job_id}/input.json`, input)
  atomicCreate(f.root, `module-jobs/${owner.job_id}/state.json`, {
    state: "running",
    input_sha256: owner.input_sha256,
  })
  const create = (role, kind) =>
    withRequestOwner(owner, () =>
      createReasoningTask(f.root, {
        run: "article-a",
        role,
        binding: { settings: { model: "gpt-6-luna", think: "high" } },
        input: {
          messages: [
            { role: "system", content: "work" },
            { role: "user", content: JSON.stringify({ kind }) },
          ],
          schema: {
            type: "object",
            properties: { answer: { type: "string" } },
            required: ["answer"],
          },
        },
      }),
    )
  const write = create("article_write", ""),
    review = create("evidence_compare", "editorial")
  const ref = (request) => ({ task_id: request.task_id, request_sha256: request.request_sha256 })
  const result = atomicCreate(f.root, `module-jobs/${owner.job_id}/result.json`, {
    schema: "research-module-result/v1",
    input_sha256: owner.input_sha256,
    data: {
      rows: [write, review].map((request) => ({
        writer_run: "article-a",
        candidate_id: "candidate-a",
        reasoning_task: ref(request),
      })),
    },
  })
  atomicWrite(f.root, `module-jobs/${owner.job_id}/state.json`, {
    state: "completed",
    input_sha256: owner.input_sha256,
    result,
  })
  return { ...f, round, owner, write: ref(write), review: ref(review) }
}

function observedStart(f, agent, lane, generation) {
  return atomicCreate(f.root, `test-start-${lane}-${generation}.json`, {
    schema: "research-codex-actor-observation/v1",
    event: "started",
    agent,
    lane,
    generation,
    model: "gpt-6-luna",
    thinking: "high",
    observed_at: "2026-11-02T00:00:00Z",
  })
}

test("bound rounds persist writer identity and reject a missing assignment on submission", async (t) => {
  const f = articleRequests(t)
  const output = { answer: "source checked" }
  await assert.rejects(
    executeModule(f.ctx, "reasoning", "submit", {
      ...f.write,
      executor: "codex",
      model: "gpt-6-luna",
      output,
    }),
    /assignment/i,
  )
  assert.equal(
    fs.existsSync(safePath(f.root, `reasoning-tasks/${f.write.task_id}/result.json`)),
    false,
  )
  await assert.rejects(
    executeModule(f.ctx, "reasoning", "relay_assign", {
      ...f.write,
      agent: "author-a",
      lane: 1,
      generation: 1,
    }),
    /observation/i,
  )
  const authorStart = observedStart(f, "author-a", 1, 1)
  const assigned = await executeModule(f.ctx, "reasoning", "relay_assign", {
    ...f.write,
    agent: "author-a",
    lane: 1,
    generation: 1,
    observation: authorStart,
  })
  const savedAssignment = readJSON(f.root, assigned.assignment.path)
  assert.ok(Number.isFinite(Date.parse(savedAssignment.assigned_at)))
  const submitted = await executeModule(f.ctx, "reasoning", "submit", {
    ...f.write,
    executor: "codex",
    model: "gpt-6-luna",
    output,
    relay_assignment: assigned.assignment,
  })
  assert.equal(submitted.status, "completed")
  const result = readJSON(f.root, `reasoning-tasks/${f.write.task_id}/result.json`)
  assert.deepEqual(result.relay_assignment, assigned.assignment)
  assert.equal(result.attribution, "caller_declared")
  const observedTiming = summarizeRelayTiming(f.root, f.round.run_id)
  assert.equal(observedTiming.requests.length, 1)
  assert.equal(observedTiming.requests[0].task_id, f.write.task_id)
  assert.ok(Number.isFinite(observedTiming.requests[0].queue_wait_ms))
  assert.ok(Number.isFinite(observedTiming.requests[0].request_round_trip_ms))
  assert.equal(observedTiming.requests[0].model_execution_ms, null)
  assert.equal(observedTiming.articles[0].candidate_id, "candidate-a")
  assert.equal(observedTiming.articles[0].request_count, 1)
  const resultPath = safePath(f.root, `reasoning-tasks/${f.write.task_id}/result.json`)
  const resultBytes = fs.readFileSync(resultPath)
  fs.writeFileSync(resultPath, JSON.stringify({ ...result, submitted_at: "2020-01-01T00:00:00Z" }))
  assert.throws(() => summarizeRelayTiming(f.root, f.round.run_id), /result binding changed/)
  fs.writeFileSync(resultPath, resultBytes)
  const proposed = await executeModule(f.ctx, "reasoning", "plan_relay", {
    ...f.review,
    lanes: [{ id: 1, agent: "author-a", phase: null, busy: false, retiring: false }],
    writers: [],
    reviewers: [],
  })
  assert.equal(proposed.action, "rotate")
  await assert.rejects(
    executeModule(f.ctx, "reasoning", "relay_assign", {
      ...f.review,
      agent: "author-a",
      lane: 1,
      generation: 1,
      observation: authorStart,
    }),
    /same actor|independent|rotate/i,
  )
  const reviewerStart = observedStart(f, "reviewer-b", 1, 2)
  await assert.rejects(
    executeModule(f.ctx, "reasoning", "relay_assign", {
      ...f.review,
      agent: "reviewer-b",
      lane: 1,
      generation: 2,
      observation: reviewerStart,
    }),
    /exit/i,
  )
  const observation = atomicCreate(f.root, "test-observed-exit.json", {
    schema: "research-codex-actor-observation/v1",
    event: "completed",
    agent: "author-a",
    lane: 1,
    generation: 1,
    observed_at: "2026-11-02T00:00:00Z",
  })
  const exited = await executeModule(f.ctx, "reasoning", "relay_exit", {
    round_id: f.round.run_id,
    agent: "author-a",
    lane: 1,
    generation: 1,
    observation,
  })
  assert.equal(exited.attribution, "caller_declared")
  const reviewer = await executeModule(f.ctx, "reasoning", "relay_assign", {
    ...f.review,
    agent: "reviewer-b",
    lane: 1,
    generation: 2,
    observation: reviewerStart,
  })
  await assert.rejects(
    executeModule(f.ctx, "reasoning", "submit", {
      ...f.review,
      executor: "codex",
      model: "gpt-6-luna",
      output,
      relay_assignment: assigned.assignment,
    }),
    /assignment/i,
  )
  const accepted = await executeModule(f.ctx, "reasoning", "submit", {
    ...f.review,
    executor: "codex",
    model: "gpt-6-luna",
    output,
    relay_assignment: reviewer.assignment,
  })
  assert.equal(accepted.status, "completed")
  assert.equal(
    (
      await executeModule(f.ctx, "reasoning", "submit", {
        ...f.review,
        executor: "codex",
        model: "gpt-6-luna",
        output,
        relay_assignment: reviewer.assignment,
      })
    ).reused,
    true,
  )
})

test("missing previously recorded actor history is not treated as an empty history", async (t) => {
  const f = articleRequests(t)
  const observation = observedStart(f, "author-a", 1, 1)
  const assigned = await executeModule(f.ctx, "reasoning", "relay_assign", {
    ...f.write,
    agent: "author-a",
    lane: 1,
    generation: 1,
    observation,
  })
  fs.unlinkSync(safePath(f.root, assigned.assignment.path))
  await assert.rejects(
    executeModule(f.ctx, "reasoning", "plan_relay", {
      ...f.review,
      lanes: [{ id: 1, agent: "author-a", phase: null, busy: false, retiring: false }],
      writers: [],
      reviewers: [],
    }),
    /history|ledger|assignment/i,
  )
})

test("a crash after storing an assignment repairs only its exact uncommitted ledger entry", async (t) => {
  const f = articleRequests(t)
  const parameters = {
    ...f.write,
    agent: "author-a",
    lane: 1,
    generation: 1,
    observation: observedStart(f, "author-a", 1, 1),
  }
  const first = await executeModule(f.ctx, "reasoning", "relay_assign", parameters)
  fs.unlinkSync(safePath(f.root, `operations/rounds/${f.round.run_id}/relay/ledger.json`))
  await assert.rejects(
    executeModule(f.ctx, "reasoning", "plan_relay", {
      ...f.review,
      lanes: [{ id: 1, agent: "author-a", phase: null, busy: false, retiring: false }],
      writers: [],
      reviewers: [],
    }),
    /uncommitted/i,
  )
  const recovered = await executeModule(f.ctx, "reasoning", "relay_assign", parameters)
  assert.deepEqual(recovered.assignment, first.assignment)
  const proposed = await executeModule(f.ctx, "reasoning", "plan_relay", {
    ...f.review,
    lanes: [{ id: 1, agent: "author-a", phase: null, busy: false, retiring: false }],
    writers: [],
    reviewers: [],
  })
  assert.equal(proposed.action, "rotate")
})

test("an exited actor's unfinished request can be reassigned while its late result is rejected", async (t) => {
  const f = articleRequests(t)
  const first = await executeModule(f.ctx, "reasoning", "relay_assign", {
    ...f.write,
    agent: "author-a",
    lane: 1,
    generation: 1,
    observation: observedStart(f, "author-a", 1, 1),
  })
  const exit = atomicCreate(f.root, "test-interrupted-exit.json", {
    schema: "research-codex-actor-observation/v1",
    event: "completed",
    agent: "author-a",
    lane: 1,
    generation: 1,
    observed_at: "2026-11-02T00:00:00Z",
  })
  await executeModule(f.ctx, "reasoning", "relay_exit", {
    round_id: f.round.run_id,
    agent: "author-a",
    lane: 1,
    generation: 1,
    observation: exit,
  })
  const second = await executeModule(f.ctx, "reasoning", "relay_assign", {
    ...f.write,
    agent: "author-b",
    lane: 1,
    generation: 2,
    observation: observedStart(f, "author-b", 1, 2),
  })
  const output = { answer: "verified new attempt" }
  await assert.rejects(
    executeModule(f.ctx, "reasoning", "submit", {
      ...f.write,
      executor: "codex",
      model: "gpt-6-luna",
      output,
      relay_assignment: first.assignment,
    }),
    /late|superseded|exited/i,
  )
  assert.equal(
    (
      await executeModule(f.ctx, "reasoning", "submit", {
        ...f.write,
        executor: "codex",
        model: "gpt-6-luna",
        output,
        relay_assignment: second.assignment,
      })
    ).status,
    "completed",
  )
})

test("batch submission serializes shared round ledger mutations without losing either result", async (t) => {
  const f = articleRequests(t)
  const first = await executeModule(f.ctx, "reasoning", "relay_assign", {
    ...f.write,
    agent: "author-a",
    lane: 1,
    generation: 1,
    observation: observedStart(f, "author-a", 1, 1),
  })
  const second = await executeModule(f.ctx, "reasoning", "relay_assign", {
    ...f.review,
    agent: "reviewer-b",
    lane: 2,
    generation: 1,
    observation: observedStart(f, "reviewer-b", 2, 1),
  })
  const results = [
    {
      ...f.write,
      executor: "codex",
      model: "gpt-6-luna",
      output: { answer: "written" },
      relay_assignment: first.assignment,
    },
    {
      ...f.review,
      executor: "codex",
      model: "gpt-6-luna",
      output: { answer: "reviewed" },
      relay_assignment: second.assignment,
    },
  ]
  const submitted = await executeModule(f.ctx, "reasoning", "submit_batch", { results })
  assert.equal(submitted.status, "completed")
  assert.deepEqual(
    submitted.results.map((item) => item.status),
    ["completed", "completed"],
  )
})

test("relay observation records declared provenance without claiming host authentication", async (t) => {
  const f = articleRequests(t)
  const p = {
    round_id: f.round.run_id,
    event: "started",
    agent: "author-a",
    lane: 1,
    generation: 1,
    model: "gpt-6-luna",
    thinking: "high",
    observed_at: "2026-11-02T00:00:00Z",
  }
  const observed = await executeModule(f.ctx, "reasoning", "relay_observe", p)
  assert.equal(observed.attribution, "caller_declared")
  assert.equal(observed.host_authenticated, false)
  assert.deepEqual(
    (await executeModule(f.ctx, "reasoning", "relay_observe", p)).observation,
    observed.observation,
  )
  assert.equal(
    (
      await executeModule(f.ctx, "reasoning", "relay_assign", {
        ...f.write,
        agent: p.agent,
        lane: p.lane,
        generation: p.generation,
        observation: observed.observation,
      })
    ).status,
    "assigned",
  )
})

test("final handoff rechecks historical assignment and observation bytes", async (t) => {
  const f = articleRequests(t)
  const observation = observedStart(f, "author-a", 1, 1)
  await executeModule(f.ctx, "reasoning", "relay_assign", {
    ...f.write,
    agent: "author-a",
    lane: 1,
    generation: 1,
    observation,
  })
  assert.equal(verifyRelayHistory(f.root, f.round.run_id).assignments.length, 1)
  fs.appendFileSync(safePath(f.root, observation.path), " ")
  assert.throws(() => verifyRelayHistory(f.root, f.round.run_id), /observation changed/i)
})

test("the operational frontier excludes held and unrelated pending requests", async (t) => {
  const f = articleRequests(t)
  atomicCreate(f.root, `reasoning-tasks/reasoning-${"c".repeat(64)}/request.json`, {
    malformed: true,
  })
  const pending = reasoningFrontier(f.root, {
    round_id: f.round.run_id,
    rows: [
      { stage: "storage", blocked_reasoning_task: f.write },
      { stage: "reasoning", reasoning_task: f.review },
      { stage: "reasoning", reasoning_task: f.review },
    ],
  })
  assert.equal(pending.total, 1)
  assert.equal(pending.tasks[0].task_id, f.review.task_id)
})
