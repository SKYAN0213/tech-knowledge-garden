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
  DelegatedReasoning,
} from "../scripts/research/reasoning-tasks.mjs"
import { withRequestOwner } from "../scripts/research/request-ownership.mjs"
import { readJSON, atomicWrite, safePath } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import {
  Ollama,
  DEFAULT_LOCAL_OLLAMA_MODEL,
  structuredRequestBudget,
} from "../scripts/research/ollama.mjs"

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

test("a successor dispatcher consumes the original exact delegated response without generating another request", async (t) => {
  const f = fixture(t)
  const owner = (name) => {
    const input = { job_id: "module-" + name, parameters: { run_id: "same-workflow" } }
    const input_sha256 = sha256(JSON.stringify(input))
    atomicWrite(f.root, `module-jobs/${input.job_id}/input.json`, input)
    atomicWrite(f.root, `module-jobs/${input.job_id}/state.json`, {
      state: "running",
      input_sha256,
    })
    return { job_id: input.job_id, input_sha256 }
  }
  const first = owner("delegated-original"),
    next = owner("delegated-successor")
  const provider = new DelegatedReasoning({
    root: f.root,
    run: "stable-delegation",
    role: "fact_extract",
    settings: { model: "gpt-6-luna", think: "high" },
  })
  provider.executionPolicy = { settings: { model: "gpt-6-luna" } }
  const input = {
    model: "gpt-6-luna",
    think: "high",
    schema,
    messages: [{ role: "user", content: "Exact original source" }],
  }
  let original
  await assert.rejects(
    withRequestOwner(first, () => provider.prepareStructured(input)),
    (error) => {
      original = error.reasoning_task
      return error.code === "REASONING_PENDING"
    },
  )
  atomicWrite(f.root, `module-jobs/${first.job_id}/state.json`, {
    state: "waiting_for_reasoning",
    input_sha256: first.input_sha256,
    reasoning_task: original,
  })
  await submitReasoningResult(f.root, {
    ...original,
    executor: "codex",
    model: "gpt-6-luna",
    output: { answer: "Source verified" },
  })
  const response = await withRequestOwner(next, () => provider.structured(input))
  assert.deepEqual(response.output, { answer: "Source verified" })
  assert.equal(response.provenance.task_id, original.task_id)
  assert.equal(fs.readdirSync(safePath(f.root, "reasoning-tasks")).length, 1)
  await assert.rejects(
    withRequestOwner(next, () =>
      provider.prepareStructured({
        ...input,
        messages: [{ role: "user", content: "Changed original source" }],
      }),
    ),
    (e) => e.code === "REASONING_PENDING",
  )
  atomicWrite(f.root, `module-jobs/${first.job_id}/retired.json`, {
    reason: "Preserved discarded experiment",
  })
  assert.throws(() => provider.request(input), /owner job is retired/)
})

test("stable delegated references cannot be redirected to a different prompt", async (t) => {
  const f = fixture(t)
  const provider = new DelegatedReasoning({
    root: f.root,
    run: "stable-tamper",
    role: "fact_extract",
    settings: { model: "gpt-6-luna" },
  })
  provider.executionPolicy = { settings: { model: "gpt-6-luna" } }
  const input = { model: "gpt-6-luna", schema, messages: [{ role: "user", content: "Original" }] }
  const one = provider.request(input)
  const two = provider.request({ ...input, messages: [{ role: "user", content: "Other source" }] })
  const refs = fs.readdirSync(safePath(f.root, "runs/stable-tamper/delegated-requests"))
  const file = refs.find(
    (file) =>
      readJSON(f.root, `runs/stable-tamper/delegated-requests/${file}`).task_id === one.task_id,
  )
  atomicWrite(f.root, `runs/stable-tamper/delegated-requests/${file}`, {
    task_id: two.task_id,
    request_sha256: two.request_sha256,
  })
  assert.throws(() => provider.request(input), /Delegated request binding changed/)
})

test("an unfinished delegated request cannot lend its owner to another operational round", (t) => {
  const f = fixture(t)
  const owner = (name, round) => {
    const input = { job_id: "module-" + name }
    const input_sha256 = sha256(JSON.stringify(input))
    const roundInput = { run_id: round, unit_only: true }
    atomicWrite(f.root, `operations/rounds/${round}/input.json`, roundInput)
    atomicWrite(f.root, `module-jobs/${input.job_id}/input.json`, input)
    atomicWrite(f.root, `module-jobs/${input.job_id}/state.json`, {
      state: "running",
      input_sha256,
    })
    return {
      job_id: input.job_id,
      input_sha256,
      round_id: round,
      round_input_sha256: sha256(JSON.stringify(roundInput)),
    }
  }
  const first = owner("round-a-first", "round-a")
  const next = owner("round-b-first", "round-b")
  const successor = owner("round-b-successor", "round-b")
  const provider = new DelegatedReasoning({
    root: f.root,
    run: "scoped-delegation",
    role: "fact_extract",
    settings: { model: "gpt-6-luna" },
  })
  provider.executionPolicy = { settings: { model: "gpt-6-luna" } }
  const input = {
    model: "gpt-6-luna",
    schema,
    messages: [{ role: "user", content: "Same source, distinct round ownership" }],
  }
  const a = withRequestOwner(first, () => provider.request(input))
  atomicWrite(f.root, `module-jobs/${first.job_id}/state.json`, {
    state: "waiting_for_reasoning",
    input_sha256: first.input_sha256,
    reasoning_task: a,
  })
  const b = withRequestOwner(next, () => provider.request(input))
  assert.notEqual(a.task_id, b.task_id)
  assert.deepEqual(b.owner, next)
  atomicWrite(f.root, `module-jobs/${next.job_id}/state.json`, {
    state: "waiting_for_reasoning",
    input_sha256: next.input_sha256,
    reasoning_task: b,
  })
  assert.equal(withRequestOwner(successor, () => provider.request(input)).task_id, b.task_id)
  assert.equal(readJSON(f.root, `reasoning-tasks/${a.task_id}/result.json`), null)
})

test("Codex article policy preserves complete long facts and schema beyond the old writing ceiling", async (t) => {
  const f = fixture(t)
  const run = "exchange-long-reviewed-article"
  assert.equal(policy.roles.article_write.num_ctx, 32768)
  assert.equal(policy.roles.article_write.model, "gpt-6-luna")
  assert.equal(policy.roles.article_write.think, "high")
  const messages = [
    { role: "user", content: "Exact reviewed condition and original quotation. ".repeat(650) },
  ]
  const input = { model: "gpt-6-luna", messages, schema }
  assert.equal(structuredRequestBudget({ ...input, num_ctx: 16384 }).fits, false)
  assert.equal(structuredRequestBudget({ ...input, num_ctx: 32768 }).fits, true)
  const scoped = await prepareRoleProvider(
    createModelProvider(policy, "article_write", { root: f.root, run }),
    policy,
    "article_write",
    { root: f.root, run },
  )
  await assert.rejects(scoped.structured(input), (e) => e.code === "REASONING_PENDING")
  const [task] = reasoningTasks(f.root, { run_id: run }).tasks
  let text = "",
    offset = 0
  do {
    const page = readReasoningTask(f.root, { ...task, offset, limit: 64000 })
    text += page.chunk
    offset = page.next_offset
  } while (offset !== null)
  const packet = JSON.parse(text)
  assert.equal(packet.input.num_ctx, 32768)
  assert.deepEqual(packet.input.messages, messages)
  assert.deepEqual(packet.input.schema, schema)
  assert.equal(task.requested_model, "gpt-6-luna")
  assert.equal(task.requested_thinking, "high")
  assert.equal(packet.input.num_predict, policy.roles.article_write.num_predict)
})

test("Codex preserves a complete long history comparison beyond the local context ceiling", async (t) => {
  const f = fixture(t)
  const p = structuredClone(policy)
  p.roles.search_plan.num_ctx = 131072
  const run = "exchange-long-history"
  const scoped = await prepareRoleProvider(
    createModelProvider(p, "search_plan", { root: f.root, run }),
    p,
    "search_plan",
    { root: f.root, run },
  )
  const messages = [{ role: "user", content: "Original historical evidence. ".repeat(3000) }]
  const input = { model: "gpt-6-luna", messages, schema }
  await assert.rejects(scoped.structured(input), (e) => e.code === "REASONING_PENDING")
  const [task] = reasoningTasks(f.root, { run_id: run }).tasks
  let text = "",
    offset = 0
  do {
    const page = readReasoningTask(f.root, { ...task, offset, limit: 64000 })
    text += page.chunk
    offset = page.next_offset
  } while (offset !== null)
  const packet = JSON.parse(text)
  assert.equal(packet.input.num_ctx, 131072)
  assert.deepEqual(packet.input.messages, messages)
  assert.deepEqual(packet.input.schema, schema)
  await submitReasoningResult(f.root, {
    ...task,
    executor: "codex",
    model: "gpt-6-luna",
    output: { answer: "history compared" },
  })
  assert.deepEqual((await scoped.structured(input)).output, { answer: "history compared" })
})

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
      submitReasoningResult(f.root, {
        ...task,
        executor: "codex",
        model: "gpt-6-luna",
        output: { wrong: 1 },
      }),
    )
    await assert.rejects(
      submitReasoningResult(f.root, {
        ...task,
        request_sha256: "a".repeat(64),
        executor: "codex",
        model: "gpt-6-luna",
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
        executor: "codex",
        model: "gpt-6-luna",
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
    task_id: task.task_id,
    request_sha256: task.request_sha256,
    executor: "codex",
    output: { answer: "legacy result" },
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
  const [task] = reasoningTasks(f.root, { run_id: run }).tasks
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
  await executeModule(f.ctx, "reasoning", "submit", {
    ...task,
    executor: "codex",
    model: "gpt-6-luna",
    output,
  })
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
      await submitReasoningResult(f.root, {
        ...error.reasoning_task,
        executor: "codex",
        model: "gpt-6-luna",
        output,
      })
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
  await submitReasoningResult(f.root, {
    ...task,
    executor: "codex",
    model: "gpt-6-luna",
    output: draft,
  })
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
    submitReasoningResult(f.root, {
      ...task,
      executor: "codex",
      model: "gpt-6-luna",
      output: { events: [] },
    }),
    /hash changed/,
  )
})
