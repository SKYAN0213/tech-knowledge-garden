import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { fixture, editionFixture, selectedFixture } from "./fixtures/research-event-fixtures.mjs"
import { executeModule } from "../scripts/research/module-registry.mjs"
import {
  submitModuleJob,
  resumeModuleJob,
  readModuleResult,
} from "../scripts/research/module-runtime.mjs"
import {
  prepareRoleProvider,
  MODEL_ROLES,
  loadRoleBudget,
} from "../scripts/research/model-policy.mjs"
import { createModelProvider } from "../scripts/research/model-provider.mjs"
import {
  reasoningTasks,
  createReasoningTask,
  readReasoningTask,
  submitReasoningResult,
  executeReasoningTask,
} from "../scripts/research/reasoning-tasks.mjs"
import { readJSON, atomicWrite, safePath } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { Ollama, DEFAULT_LOCAL_OLLAMA_MODEL } from "../scripts/research/ollama.mjs"

const repo = fs.realpathSync(fileURLToPath(new URL("../", import.meta.url)))
const policy = JSON.parse(fs.readFileSync(path.join(repo, "data/research-model-policy-codex.json")))
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["answer"],
  properties: { answer: { type: "string", maxLength: 100 } },
}
const requestOf = (f, task) =>
  JSON.parse(readReasoningTask(f.root, { ...task, limit: 64000 }).chunk)

test("all five roles delegate identical bound input, wait without generation reservations, and reuse Codex results", async (t) => {
  const f = fixture(t)
  for (const role of MODEL_ROLES) {
    const run = "exchange-" + role
    const scoped = await prepareRoleProvider(
      createModelProvider(policy, role, { root: f.root, run }),
      policy,
      role,
      { root: f.root, run },
    )
    const input = {
      model: "gpt-6-luna",
      messages: [{ role: "user", content: "Source: robots operate on factory lines." }],
      schema,
    }
    await assert.rejects(scoped.structured(input), (e) => e.code === "REASONING_PENDING")
    assert.equal(readJSON(f.root, `runs/${run}/model-policy/${role}/budget.json`), null)
    const [task] = reasoningTasks(f.root, { run_id: run }).tasks
    assert.equal(task.requested_model, "gpt-6-luna")
    const packet = requestOf(f, task)
    assert.deepEqual(packet.input.messages, input.messages)
    assert.deepEqual(packet.input.schema, schema)
    await assert.rejects(
      submitReasoningResult(f.root, { ...task, executor: "codex", model: "gpt-6-luna", output: { wrong: 1 } }),
    )
    await assert.rejects(
      submitReasoningResult(f.root, {
        ...task,
        request_sha256: "a".repeat(64),
        executor: "codex", model: "gpt-6-luna",
        output: { answer: "factory lines" },
      }),
      /hash/,
    )
    const output = { answer: "factory lines" }
    for (const model of [undefined, "gpt-6.1-sol"]) {
      await assert.rejects(
        submitReasoningResult(f.root, { ...task, executor: "codex", model, output }),
        /must match requested model: gpt-6-luna/,
      )
      assert.equal(readJSON(f.root, `reasoning-tasks/${task.task_id}/result.json`), null)
    }
    await submitReasoningResult(f.root, { ...task, executor: "codex", model: "gpt-6-luna", output })
    const completed = await scoped.structured(input)
    assert.deepEqual(completed.output, output)
    assert.equal(completed.provenance.executor, "codex")
    assert.equal(completed.provenance.public_approved, false)
    await scoped.structured(input)
    assert.equal(loadRoleBudget(f.root, run, role).attempts.length, 1)
    await assert.rejects(
      submitReasoningResult(f.root, {
        ...task,
        executor: "codex", model: "gpt-6-luna",
        output: { answer: "overwrite" },
      }),
      /immutable/,
    )
    assert.equal(reasoningTasks(f.root, { run_id: run }).total, 0)
  }
})

test("legacy generic Codex tasks preserve their original model-independent result contract", async (t) => {
  const f = fixture(t)
  const task = createReasoningTask(f.root, {
    run: "legacy-generic-model",
    role: "article_write",
    binding: { settings: { model: "codex", provider: "codex", think: false } },
    input: { schema, messages: [{ role: "user", content: "Preserved original input" }] },
  })
  await submitReasoningResult(f.root, {
    task_id: task.task_id, request_sha256: task.request_sha256,
    executor: "codex", output: { answer: "legacy result" },
  })
  assert.equal(readReasoningTask(f.root, task).status, "completed")
})

test("a delegated task can be handed to Ollama with its original schema and reused without another local call", async (t) => {
  const f = fixture(t),
    run = "local-handoff",
    role = "article_write"
  const scoped = await prepareRoleProvider(
    createModelProvider(policy, role, { root: f.root, run }),
    policy,
    role,
    { root: f.root, run },
  )
  const input = {
    model: "gpt-6-luna",
    messages: [{ role: "user", content: "Original source sentence." }],
    schema,
  }
  await assert.rejects(scoped.structured(input), (e) => e.code === "REASONING_PENDING")
  const [task] = reasoningTasks(f.root).tasks
  let calls = 0
  const local = new Ollama({
    fetchImpl: async (url, options) => {
      const endpoint = new URL(url).pathname
      if (endpoint === "/api/version") return Response.json({ version: "test-local-runtime" })
      if (endpoint === "/api/tags")
        return Response.json({
          models: [{ name: DEFAULT_LOCAL_OLLAMA_MODEL, digest: "a".repeat(64) }],
        })
      if (endpoint === "/api/show")
        return Response.json({ capabilities: ["completion"], thinking: { values: [false] } })
      assert.equal(endpoint, "/api/chat")
      const payload = JSON.parse(options.body)
      assert.deepEqual(payload.messages, input.messages)
      assert.deepEqual(payload.format, input.schema)
      assert.equal(payload.model, DEFAULT_LOCAL_OLLAMA_MODEL)
      calls++
      return Response.json({
        done: true,
        done_reason: "stop",
        message: { content: '{"answer":"Original source sentence."}' },
      })
    },
  })
  const first = await executeReasoningTask(
    { ...f.ctx, policy: path.join(repo, "data/research-model-policy-codex.json") },
    task,
    { provider: local },
  )
  assert.equal(first.model_calls, 1)
  const submitted = await scoped.structured(input)
  assert.equal(submitted.provenance.executor, "ollama")
  assert.equal(submitted.provenance.executed_model, DEFAULT_LOCAL_OLLAMA_MODEL)
  assert.equal(
    submitted.provenance.model,
    "gpt-6-luna",
    "request binding is distinct from the actual executor",
  )
  const second = await executeReasoningTask(
    { ...f.ctx, policy: path.join(repo, "data/research-model-policy-codex.json") },
    task,
    { provider: local },
  )
  assert.equal(second.model_calls, 0)
  assert.equal(calls, 1)
})

test("Gemma local handoff resolves boolean role thinking without changing the frozen Codex request or explicit Qwen choice", async (t) => {
  const f = fixture(t)
  for (const explicit of [false, true]) {
    const run = explicit ? "local-qwen-evidence" : "local-gemma-evidence"
    const role = "evidence_compare"
    const scoped = await prepareRoleProvider(
      createModelProvider(policy, role, { root: f.root, run }),
      policy,
      role,
      { root: f.root, run },
    )
    const input = {
      model: "gpt-6-luna",
      messages: [{ role: "user", content: "Original evidence for an announced robot order." }],
      schema,
    }
    await assert.rejects(scoped.structured(input), (e) => e.code === "REASONING_PENDING")
    const [task] = reasoningTasks(f.root, { run_id: run }).tasks
    const requestPath = `reasoning-tasks/${task.task_id}/request.json`
    const before = fs.readFileSync(safePath(f.root, requestPath))
    const packet = requestOf(f, task)
    assert.equal(packet.input.think, "high")
    const selectedModel = explicit ? "qwen3.8:27b-mlx" : DEFAULT_LOCAL_OLLAMA_MODEL
    const selectedThink = explicit ? "high" : true
    let calls = 0
    const local = new Ollama({
      fetchImpl: async (url, options) => {
        const endpoint = new URL(url).pathname
        if (endpoint === "/api/version") return Response.json({ version: "test-local-runtime" })
        if (endpoint === "/api/tags")
          return Response.json({ models: [{ name: selectedModel, digest: "a".repeat(64) }] })
        if (endpoint === "/api/show")
          return Response.json({
            capabilities: ["completion"],
            thinking: { values: explicit ? [false, "high"] : [false, true] },
          })
        assert.equal(endpoint, "/api/chat")
        const sent = JSON.parse(options.body)
        assert.equal(sent.model, selectedModel)
        assert.equal(sent.think, selectedThink)
        assert.deepEqual(sent.messages, packet.input.messages)
        assert.deepEqual(sent.format, packet.input.schema)
        assert.equal(sent.options.num_ctx, packet.input.num_ctx)
        assert.equal(sent.options.num_predict, packet.input.num_predict)
        calls++
        return Response.json({
          done: true,
          done_reason: "stop",
          message: { content: '{"answer":"source supports the announced order"}' },
        })
      },
    })
    const parameters = { ...task, ...(explicit ? { model: selectedModel } : {}) }
    const context = { ...f.ctx, policy: path.join(repo, "data/research-model-policy-codex.json") }
    const first = await executeReasoningTask(context, parameters, { provider: local })
    assert.equal(first.model_calls, 1)
    assert.equal(calls, 1)
    assert.deepEqual(fs.readFileSync(safePath(f.root, requestPath)), before)
    const execution = readJSON(f.root, `reasoning-tasks/${task.task_id}/local-execution.json`)
    assert.equal(execution.provenance.think, selectedThink)
    const completed = await scoped.structured(input)
    assert.equal(completed.provenance.model, "gpt-6-luna")
    assert.equal(completed.provenance.executed_model, selectedModel)
    assert.equal(completed.provenance.public_approved, false)
    const second = await executeReasoningTask(context, parameters, { provider: local })
    assert.equal(second.model_calls, 0)
    assert.equal(calls, 1)
  }
})

test("native classification worker waits, accepts source-bound Codex input, resumes, and preserves the relationship review gate", async (t) => {
  const f = editionFixture(t)
  f.ctx.policy = path.join(repo, "data/research-model-policy-codex.json")
  const parameters = {
    run_id: "native-delegation",
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
    material_ids: [f.report.materials[0].id],
  }
  const job = await submitModuleJob(f.ctx, "classification", "extract", parameters, {
    jobId: "module-native-delegation",
    background: false,
  })
  assert.equal(job.state, "waiting_for_reasoning")
  assert.equal(job.resume_available, true)
  const task = job.reasoning_task,
    packet = requestOf(f, task)
  const output = {
    events: [
      {
        who: "Fixture Robotics and Partner",
        action: "announced a robot order",
        object: "Contract-123",
        occurred_at: "2026-09-27",
        effective_at: null,
        external_id: "Contract-123",
        block_keys: [
          packet.input.schema.properties.events.items.properties.block_keys.items.enum[0],
        ],
        quantities: [],
      },
    ],
  }
  await executeModule(f.ctx, "reasoning", "submit", { ...task, executor: "codex", model: "gpt-6-luna", output })
  const completed = await resumeModuleJob(f.ctx, job.job_id, { background: false })
  assert.equal(completed.state, "completed")
  const result = JSON.parse(readModuleResult(f.ctx, job.job_id, { limit: 64000 }).chunk).data
  assert.equal(result.status, "relationship_review")
  assert.equal(result.proposals.length, 1)
  assert.equal(result.writer_allowed, false)
  assert.equal(result.candidate_published, false)
  assert.equal(
    (
      await submitModuleJob(f.ctx, "classification", "extract", parameters, {
        jobId: job.job_id,
        background: false,
      })
    ).attempt,
    2,
  )
})

test("native selected facts and article writing use Codex through the same evidence checks and immutable writer checkpoint", async (t) => {
  const f = await selectedFixture(t)
  f.ctx.policy = path.join(repo, "data/research-model-policy-codex.json")
  for (let index = 0; index < 4; index++) {
    try {
      await executeModule(f.ctx, "evidence", "extract", f.selectedParameters)
      break
    } catch (error) {
      assert.equal(error.code, "REASONING_PENDING")
      assert.ok(index < 3)
      const packet = requestOf(f, error.reasoning_task)
      const docs = JSON.parse(packet.input.messages[1].content)
      const output = {
        claims: docs.flatMap((d) =>
          d.blocks.map((b) => ({
            statement:
              "Fixture Robotics와 Partner는 2026년 9월 27일 Contract-123 로봇 주문을 발표했다.",
            claim_kind: "fact",
            subject: "Fixture Robotics",
            event_state: "completed",
            published_at: "2026-09-27",
            effective_period: null,
            numbers: [],
            evidence: [{ block_key: b.block_key, support: "direct" }],
          })),
        ),
      }
      await submitReasoningResult(f.root, { ...error.reasoning_task, executor: "codex", model: "gpt-6-luna", output })
    }
  }
  const run = f.selectedParameters.run_id,
    claims = readJSON(f.root, `runs/${run}/claims.json`).claims
  atomicWrite(f.root, "facts.json", {
    reviewer: "test-source-reader",
    reviewed_at: "2026-09-29T01:00:00Z",
    claims: claims.map((c) => ({
      claim_id: c.claim_id,
      status: "verified",
      reason: "Compared with exact original fixture blocks",
      source_read: true,
      entailment_checked: true,
      identity_checked: true,
      numbers_checked: true,
      time_checked: true,
    })),
  })
  await executeModule(f.ctx, "evidence", "review", {
    run_id: run,
    review_file: path.relative(repo, safePath(f.root, "facts.json")),
  })
  let task
  await assert.rejects(executeModule(f.ctx, "writing", "draft", f.selectedParameters), (e) => {
    task = e.reasoning_task
    return e.code === "REASONING_PENDING"
  })
  const ids = readJSON(f.root, `runs/${run}/reviewed-claims.json`).claims.map((c) => c.claim_id)
  const draft = {
    title: "Fixture Robotics, Partner와 로봇 주문 발표",
    lead: [
      {
        text: "Fixture Robotics와 Partner는 2026년 9월 27일 Contract-123 로봇 주문을 발표했다.",
        claim_ids: ids,
      },
      { text: "세 원문에는 같은 주문의 주체와 계약 식별자가 명시돼 있다.", claim_ids: ids },
    ],
    facts: {
      who: "Fixture Robotics와 Partner",
      when: "2026-09-27",
      where: null,
      what: "로봇 주문 발표",
      how: null,
      why: null,
    },
    sector: "로봇·제조",
    theme: "사업·고객",
    tags: ["수주·계약"],
    entities: ["Fixture Robotics", "Partner"],
    explanations: [
      {
        heading: "계약 식별자",
        paragraphs: [
          { text: "각 원문은 Contract-123 로봇 주문과 발표 시점을 명시한다.", claim_ids: ids },
        ],
      },
    ],
  }
  await submitReasoningResult(f.root, { ...task, executor: "codex", model: "gpt-6-luna", output: draft })
  await executeModule(f.ctx, "writing", "draft", f.selectedParameters)
  const saved = readJSON(f.root, `runs/${run}/draft.json`)
  assert.equal(saved.provenance.executor, "codex")
  assert.equal(saved.public_approved, false)
  assert.equal(readJSON(f.root, `runs/${run}/approved-article.json`), null)
  await executeModule(f.ctx, "writing", "draft", f.selectedParameters)
  assert.equal(loadRoleBudget(f.root, run, "article_write").attempts.length, 1)
})

test("independent concurrent MCP submissions serialize only registration and complete both jobs", async (t) => {
  const f = fixture(t)
  const jobs = await Promise.all([
    submitModuleJob(
      f.ctx,
      "collection",
      "inventory",
      {},
      { jobId: "module-concurrent-a", background: false },
    ),
    submitModuleJob(
      f.ctx,
      "publication",
      "status",
      { run_id: "not-published" },
      { jobId: "module-concurrent-b", background: false },
    ),
  ])
  assert.deepEqual(
    jobs.map((j) => j.state),
    ["completed", "completed"],
  )
})

test("changed role policies cannot resume a pending model job and altered stored requests cannot be submitted", async (t) => {
  const f = editionFixture(t)
  atomicWrite(f.root, "policy.json", policy)
  f.ctx.policy = safePath(f.root, "policy.json")
  const p = {
    run_id: "policy-bound-events",
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
    material_ids: [f.report.materials[0].id],
  }
  const job = await submitModuleJob(f.ctx, "classification", "extract", p, {
    jobId: "module-policy-bound",
    background: false,
  })
  assert.equal(job.state, "waiting_for_reasoning")
  const changed = structuredClone(policy)
  changed.roles.search_plan.num_predict = 2048
  atomicWrite(f.root, "policy.json", changed)
  await assert.rejects(resumeModuleJob(f.ctx, job.job_id, { background: false }), /input changed/)
  const task = job.reasoning_task,
    relative = `reasoning-tasks/${task.task_id}/request.json`
  const request = readJSON(f.root, relative)
  request.input.messages[0].content = "tampered source"
  atomicWrite(f.root, relative, request)
  await assert.rejects(
    submitReasoningResult(f.root, { ...task, executor: "codex", model: "gpt-6-luna", output: { events: [] } }),
    /hash changed/,
  )
})
