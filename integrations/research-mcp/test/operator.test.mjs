import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { sha256 } from "../../../scripts/research/contracts.mjs"
import { moduleContext } from "../../../scripts/research/module-runtime.mjs"
import { connectResearchClient, readOperatorCheckpoint, runLocalOperator } from "../operator.mjs"

import { isolatedMCPFixtureParent } from "./storage-fixture.mjs"

const repo = fs.realpathSync(fileURLToPath(new URL("../../../", import.meta.url)))
const object = (properties = {}, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
})
const text = { type: "string" }
const result = (data) => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
  structuredContent: data,
})
const common = [
  { name: "research_modules", inputSchema: object() },
  {
    name: "research_execute",
    inputSchema: object(
      { module: text, operation: text, parameters: { type: "object" }, job_id: text },
      ["module", "operation", "parameters"],
    ),
  },
  { name: "research_job_status", inputSchema: object({ job_id: text }, ["job_id"]) },
  {
    name: "research_job_result",
    inputSchema: object(
      {
        job_id: text,
        offset: { type: "integer", minimum: 0 },
        limit: { type: "integer", minimum: 1, maximum: 64000 },
      },
      ["job_id"],
    ),
  },
  { name: "research_job_resume", inputSchema: object({ job_id: text }, ["job_id"]) },
]
const catalog = {
  modules: [
    {
      id: "collection",
      operations: [
        {
          id: "inventory",
          tool_name: "collection_inventory",
          inputSchema: object(),
          readOnly: true,
        },
        {
          id: "daily",
          tool_name: "collection_daily",
          inputSchema: object({ run_id: text }, ["run_id"]),
          network: true,
        },
      ],
    },
    {
      id: "edition",
      operations: [
        {
          id: "advance",
          tool_name: "edition_advance",
          inputSchema: object(
            {
              run_id: text,
              retry_groups: { type: "array", items: text },
              revision_reviews: { type: "object", additionalProperties: text },
              require_curation: { type: "boolean" },
            },
            ["run_id"],
          ),
        },
      ],
    },
    {
      id: "curation",
      operations: [
        {
          id: "evaluate",
          tool_name: "curation_evaluate",
          inputSchema: object(
            { pool_path: text, pool_sha256: text, execute: { type: "boolean" }, review_file: text },
            ["pool_path", "pool_sha256"],
          ),
        },
        {
          id: "advance",
          tool_name: "curation_advance",
          inputSchema: object(
            {
              run_id: text,
              selection_path: text,
              selection_sha256: text,
              retry_candidates: { type: "array", items: text },
            },
            ["run_id", "selection_path", "selection_sha256"],
          ),
        },
      ],
    },
    {
      id: "validation",
      operations: [
        {
          id: "approve",
          tool_name: "validation_approve",
          inputSchema: object({ run_id: text }, ["run_id"]),
        },
        {
          id: "evaluation_import",
          tool_name: "validation_evaluation_import",
          inputSchema: object({ packet_run: text, review_file: text }, [
            "packet_run",
            "review_file",
          ]),
        },
      ],
    },
    {
      id: "publication",
      operations: ["deliver", "delivery_receipt", "shadow_record", "fallback"].map((id) => ({
        id,
        tool_name: "publication_" + id,
        inputSchema: object({ run_id: text }, ["run_id"]),
      })),
    },
    {
      id: "reasoning",
      operations: [
        {
          id: "execute",
          tool_name: "reasoning_execute",
          inputSchema: object({ task_id: text, request_sha256: text }, [
            "task_id",
            "request_sha256",
          ]),
          model: true,
        },
      ],
    },
  ],
}

function fixture(t, run = "fixture-operator") {
  const root = fs.mkdtempSync(path.join(isolatedMCPFixtureParent(repo), "operator-test-"))
  fs.mkdirSync(path.join(root, ".storage"))
  fs.writeFileSync(
    path.join(root, ".storage/policy.json"),
    JSON.stringify({ schema: "research-cold-storage/v1", root, enabled: false }),
  )
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return {
    repo,
    root,
    run,
    task: "등록된 수집 경로의 목록만 확인한다.",
    timeoutMs: 5000,
    maxSteps: 4,
  }
}

function fakeClient({
  state = "completed",
  nativeStatus = "complete",
  data = { data: { active_daily: 62 } },
  loseResponse = false,
  badHash = false,
  detailed = false,
} = {}) {
  const calls = []
  const bytes = JSON.stringify(data, null, 2) + "\n"
  const saved = {
    path: "module-jobs/fixture/result.json",
    sha256: badHash ? "a".repeat(64) : sha256(bytes),
  }
  let submittedJob = null,
    lost = false
  const controls = { state, nativeStatus }
  const client = {
    calls,
    controls,
    async listTools() {
      return {
        tools: detailed
          ? [
              ...common.filter((tool) => tool.name !== "research_execute"),
              { name: "collection_inventory", inputSchema: object({ job_id: text }) },
            ]
          : common,
      }
    },
    async callTool({ name, arguments: args }) {
      calls.push({ name, arguments: args })
      if (name === "research_modules") return result(catalog)
      if (name === "research_execute" || name === "collection_inventory") {
        submittedJob = args.job_id
        if (loseResponse && !lost) {
          lost = true
          throw Error("Lost submission response")
        }
        return result({ job_id: submittedJob, state: "queued" })
      }
      if (name === "research_job_status") {
        assert.equal(args.job_id, submittedJob)
        return result({
          job_id: submittedJob,
          state: controls.state,
          native_status: controls.nativeStatus,
          ...(controls.state === "failed" ? { error: "Original source failed" } : {}),
          ...(controls.state === "waiting_for_reasoning"
            ? { reasoning_task: { task_id: "reasoning-task-1", request_sha256: "b".repeat(64) } }
            : {}),
        })
      }
      if (name === "research_job_result") {
        const offset = args.offset ?? 0,
          next = Math.min(bytes.length, offset + (args.limit ?? 64000))
        return result({
          job_id: submittedJob,
          result: saved,
          offset,
          chunk: bytes.slice(offset, next),
          next_offset: next < bytes.length ? next : null,
          total_characters: bytes.length,
        })
      }
      throw Error("Unexpected fixture tool: " + name)
    },
  }
  return client
}

function sequence(...decisions) {
  let next = 0
  const planner = async ({ manifest }) => {
    assert.ok(manifest.tools.every((tool) => tool.name !== "research_job_resume"))
    assert.ok(
      !manifest.operations?.some((operation) =>
        [
          "approve",
          "deliver",
          "delivery_receipt",
          "evaluation_import",
          "shadow_record",
          "fallback",
        ].includes(operation.operation),
      ),
    )
    if (!decisions[next]) throw Error("Unexpected extra planner call")
    const decision = decisions[next++]
    return {
      output: {
        action: decision.action,
        tool_name: decision.tool_name || null,
        arguments: decision.arguments,
        reason: decision.reason,
      },
      provenance: { model: "test-fixture" },
    }
  }
  planner.count = () => next
  return planner
}
const inventory = {
  action: "call",
  tool_name: "research_execute",
  arguments: { module: "collection", operation: "inventory", parameters: {} },
  reason: "경로 목록 조회",
}
const finish = {
  action: "finish",
  tool_name: "",
  arguments: {},
  reason: "요청한 목록 조회를 마쳤다.",
}

test("local planner executes compact tools, saves hash-bound results and hands the checkpoint to Codex", async (t) => {
  const options = fixture(t),
    client = fakeClient(),
    planner = sequence(inventory, finish)
  const output = await runLocalOperator(options, { client, planner })
  assert.equal(output.state, "completed")
  assert.equal(output.steps_completed, 1)
  assert.equal(output.operator.kind, "ollama")
  assert.equal(output.candidate_published, false)
  assert.equal(path.isAbsolute(output.checkpoint.path), false)
  const saved = readOperatorCheckpoint(options)
  assert.equal(saved.state.steps[0].tool_name, "research_execute")
  assert.equal(saved.state.steps[0].arguments.module, "collection")
  assert.match(saved.state.steps[0].job_id, /^module-operator-/)
  assert.equal(saved.state.steps[0].observation.data.data.active_daily, 62)
  assert.equal(
    sha256(fs.readFileSync(path.join(repo, output.checkpoint.path))),
    output.checkpoint.sha256,
  )
  const resumed = await runLocalOperator({ ...options, resume: true }, { client, planner })
  assert.equal(resumed.state, "completed")
  assert.equal(planner.count(), 2)
  assert.equal(client.calls.filter((call) => call.name === "research_execute").length, 1)
})

test("detailed profile uses the same validated operations and fixed native job identity", async (t) => {
  const options = { ...fixture(t), toolProfile: "detailed" },
    client = fakeClient({ detailed: true })
  const output = await runLocalOperator(options, {
    client,
    planner: sequence({ ...inventory, tool_name: "collection_inventory", arguments: {} }, finish),
  })
  assert.equal(output.state, "completed")
  assert.equal(client.calls.filter((call) => call.name === "collection_inventory").length, 1)
})

test("local planner cannot attest independent evaluation, scheduled comparison or fallback selection", async (t) => {
  for (const [module, operation, parameters] of [
    ["validation", "evaluation_import", { packet_run: "packet", review_file: "review.json" }],
    ["publication", "shadow_record", { run_id: "operation" }],
    ["publication", "fallback", { run_id: "operation" }],
  ]) {
    const options = fixture(t, "explicit-" + operation)
    const client = fakeClient()
    const output = await runLocalOperator(options, {
      client,
      planner: sequence({ ...inventory, arguments: { module, operation, parameters } }),
    })
    assert.equal(output.state, "failed")
    assert.match(output.error, /Invalid operator decision:|requires explicit review/)
    assert.equal(client.calls.filter((call) => call.name === "research_execute").length, 0)
  }
})

test("unknown tools, semantic approvals and invalid operation arguments fail before any domain call", async (t) => {
  const decisions = [
    { ...inventory, tool_name: "run_shell", arguments: { command: "true" } },
    {
      ...inventory,
      arguments: {
        module: "validation",
        operation: "approve",
        parameters: { run_id: "unreviewed" },
      },
    },
    ...["deliver", "delivery_receipt"].map((operation) => ({
      ...inventory,
      arguments: { module: "publication", operation, parameters: { run_id: "unreleased" } },
    })),
    {
      ...inventory,
      arguments: { module: "collection", operation: "inventory", parameters: { arbitrary: true } },
    },
    { ...inventory, arguments: { module: "collection", operation: "daily", parameters: {} } },
    {
      ...inventory,
      arguments: {
        module: "collection",
        operation: "inventory",
        parameters: {},
        job_id: "module-another-job",
      },
    },
  ]
  for (let index = 0; index < decisions.length; index++) {
    const options = fixture(t, "invalid-" + index),
      client = fakeClient()
    const output = await runLocalOperator(options, { client, planner: sequence(decisions[index]) })
    assert.equal(output.state, "failed")
    assert.equal(client.calls.filter((call) => call.name === "research_execute").length, 0)
  }
})

test("failed native jobs never retry; Codex can fix and explicitly resume the job before the local operator continues", async (t) => {
  const options = fixture(t),
    client = fakeClient({ state: "failed", nativeStatus: "failed" })
  const first = await runLocalOperator(options, { client, planner: sequence(inventory) })
  assert.equal(first.state, "failed")
  assert.match(first.handoff.error, /Original source failed/)
  const unchanged = await runLocalOperator(
    { ...options, resume: true },
    { client, planner: sequence() },
  )
  assert.equal(unchanged.state, "failed")
  assert.equal(client.calls.filter((call) => call.name === "research_execute").length, 1)
  client.controls.state = "completed"
  client.controls.nativeStatus = "complete"
  const continued = await runLocalOperator(
    { ...options, resume: true },
    { client, planner: sequence(finish) },
  )
  assert.equal(continued.state, "completed")
  assert.equal(client.calls.filter((call) => call.name === "research_execute").length, 1)
})

test("unknown worker visibility pauses a local operator without retrying or requesting another plan", async (t) => {
  const options = fixture(t)
  const client = fakeClient({ state: "worker_status_unknown" })
  const planner = sequence(inventory)
  const first = await runLocalOperator(options, { client, planner })
  assert.equal(first.state, "worker_status_unknown")
  assert.equal(planner.count(), 1)
  assert.equal(client.calls.filter((call) => call.name === "research_execute").length, 1)
  const same = await runLocalOperator({ ...options, resume: true }, { client, planner: sequence() })
  assert.equal(same.state, "worker_status_unknown")
  assert.equal(client.calls.filter((call) => call.name === "research_execute").length, 1)
})

test("edition advance cannot bypass explicit failed-event retry or revision review gates", async (t) => {
  for (const extra of [
    { retry_groups: ["failed-group"] },
    { revision_reviews: { group: "review.json" } },
  ]) {
    const client = fakeClient()
    const output = await runLocalOperator(fixture(t), {
      client,
      planner: sequence({
        ...inventory,
        arguments: {
          module: "edition",
          operation: "advance",
          parameters: { run_id: "existing", ...extra },
        },
      }),
    })
    assert.equal(output.state, "failed")
    assert.match(output.error, /approval|failed-event retry/)
    assert.equal(client.calls.filter((call) => call.name === "research_execute").length, 0)
  }
})

test("mixed partial workflows pause once and preserve every reasoning task, review group and failure", async (t) => {
  const tasks = [1, 2].map((n) => ({
    group_id: `reasoning-${n}`,
    task_id: `task-${n}`,
    request_sha256: String(n).repeat(64),
  }))
  const failures = [{ group_id: "failed-group", error: "original failure" }]
  const reviewRow = { group_id: "needs-review", status: "fact_review" }
  const data = {
    data: {
      status: "partial",
      failures,
      reasoning_tasks: tasks,
      rows: [
        { group_id: "failed-group", status: "failed" },
        reviewRow,
        ...tasks.map((task) => ({
          group_id: task.group_id,
          status: "waiting_for_reasoning",
          reasoning_task: task,
        })),
      ],
    },
  }
  const client = fakeClient({ nativeStatus: "partial", data })
  const planner = sequence(inventory, finish)
  const paused = await runLocalOperator(fixture(t, "mixed-partial"), { client, planner })
  assert.equal(paused.state, "waiting_for_reasoning")
  assert.equal(planner.count(), 1)
  assert.deepEqual(paused.handoff.reasoning_tasks, tasks)
  assert.deepEqual(paused.handoff.review_rows, [reviewRow])
  assert.deepEqual(paused.handoff.failures, failures)
  const review = await runLocalOperator(fixture(t, "partial-review"), {
    client: fakeClient({
      nativeStatus: "partial",
      data: { data: { status: "partial", rows: [reviewRow], failures } },
    }),
    planner: sequence(inventory, finish),
  })
  assert.equal(review.state, "waiting_for_review")
  assert.deepEqual(review.handoff.failures, failures)
})

test("a lost submission response resumes by looking up the original job instead of replaying its side effects", async (t) => {
  const options = fixture(t),
    client = fakeClient({ loseResponse: true })
  const first = await runLocalOperator(options, { client, planner: sequence(inventory) })
  assert.equal(first.state, "failed")
  const continued = await runLocalOperator(
    { ...options, resume: true },
    { client, planner: sequence(finish) },
  )
  assert.equal(continued.state, "completed")
  assert.equal(client.calls.filter((call) => call.name === "research_execute").length, 1)
})

test("reasoning and editorial review pauses preserve exact task IDs and do not authorize automatic approval", async (t) => {
  const options = fixture(t, "reasoning-pause"),
    client = fakeClient({ state: "waiting_for_reasoning" })
  const paused = await runLocalOperator(options, { client, planner: sequence(inventory) })
  assert.equal(paused.state, "waiting_for_reasoning")
  assert.equal(paused.handoff.reasoning_task.task_id, "reasoning-task-1")
  assert.equal(
    client.calls.some((call) => call.name === "research_job_resume"),
    false,
  )
  client.controls.state = "completed"
  client.controls.nativeStatus = "complete"
  const continued = await runLocalOperator(
    { ...options, resume: true },
    { client, planner: sequence(finish) },
  )
  assert.equal(continued.state, "completed")
  const reviewOptions = fixture(t, "review-pause")
  const review = await runLocalOperator(reviewOptions, {
    client: fakeClient({ nativeStatus: "fact_review" }),
    planner: sequence(inventory),
  })
  assert.equal(review.state, "waiting_for_review")
  assert.equal(review.steps_completed, 1)
})

test("curation proposals pause for source review and local planners cannot approve ratings, bypass curation or retry held candidates", async (t) => {
  const proposal = {
    candidate_id: "c".repeat(64),
    status: "curation_review",
    proposal: { path: "curation/proposals/exact.json", sha256: "d".repeat(64) },
  }
  const decision = {
    ...inventory,
    arguments: {
      module: "curation",
      operation: "evaluate",
      parameters: {
        pool_path: "curation/runs/exact/pool.json",
        pool_sha256: "a".repeat(64),
        execute: true,
      },
    },
  }
  const client = fakeClient({
    nativeStatus: "curation_review",
    data: { data: { status: "curation_review", rows: [proposal] } },
  })
  const paused = await runLocalOperator(fixture(t, "curation-score-pause"), {
    client,
    planner: sequence(decision),
  })
  assert.equal(paused.state, "waiting_for_review")
  assert.deepEqual(paused.handoff.review_rows, [proposal])
  assert.equal(client.calls.filter((call) => call.name === "research_execute").length, 1)
  const denied = [
    {
      ...decision.arguments,
      parameters: { ...decision.arguments.parameters, review_file: "unchecked-review.json" },
    },
    {
      module: "edition",
      operation: "advance",
      parameters: { run_id: "bypass", require_curation: false },
    },
    {
      module: "curation",
      operation: "advance",
      parameters: {
        run_id: "retry",
        selection_path: "curation/runs/exact/selection.json",
        selection_sha256: "a".repeat(64),
        retry_candidates: ["c".repeat(64)],
      },
    },
  ]
  for (const [index, args] of denied.entries()) {
    const deniedClient = fakeClient()
    const result = await runLocalOperator(fixture(t, "curation-denied-" + index), {
      client: deniedClient,
      planner: sequence({ ...inventory, arguments: args }),
    })
    assert.equal(result.state, "failed")
    assert.equal(deniedClient.calls.filter((call) => call.name === "research_execute").length, 0)
  }
})

test("reasoning.execute is available for a local performer without exposing reasoning.submit or semantic approvals", async (t) => {
  const options = fixture(t)
  const output = await runLocalOperator(options, {
    client: fakeClient(),
    planner: sequence(
      {
        ...inventory,
        arguments: {
          module: "reasoning",
          operation: "execute",
          parameters: { task_id: "task-1", request_sha256: "c".repeat(64) },
        },
      },
      finish,
    ),
  })
  assert.equal(output.state, "completed")
  assert.equal(readOperatorCheckpoint(options).state.steps[0].arguments.module, "reasoning")
})

test("saved-result hashes, frozen tasks and checkpoint integrity are checked before reuse", async (t) => {
  const bad = await runLocalOperator(fixture(t, "bad-result"), {
    client: fakeClient({ badHash: true }),
    planner: sequence(inventory),
  })
  assert.equal(bad.state, "failed")
  assert.match(bad.error, /result hash/)
  const options = fixture(t, "tampered")
  await runLocalOperator(options, { client: fakeClient(), planner: sequence(inventory, finish) })
  await assert.rejects(
    () =>
      runLocalOperator(
        { ...options, task: "A different task", resume: true },
        { client: fakeClient(), planner: sequence() },
      ),
    /immutable task/,
  )
  const checkpoint = path.join(options.root, `operator-runs/${options.run}/checkpoint.json`)
  const envelope = JSON.parse(fs.readFileSync(checkpoint))
  envelope.checkpoint.steps[0].tool_name = "altered"
  fs.writeFileSync(checkpoint, JSON.stringify(envelope))
  assert.throws(() => readOperatorCheckpoint(options), /checkpoint hash/)
})

test("operator step and wall-time budgets stop without additional domain submissions", async (t) => {
  const options = { ...fixture(t, "step-budget"), maxSteps: 1 }
  const output = await runLocalOperator(options, {
    client: fakeClient(),
    planner: sequence(inventory),
  })
  assert.equal(output.state, "budget_exhausted")
  let time = 0
  const timedClient = fakeClient()
  const timed = await runLocalOperator(
    { ...fixture(t, "time-budget"), timeoutMs: 50 },
    {
      client: timedClient,
      now: () => time,
      planner: async () => {
        time = 100
        return inventory
      },
    },
  )
  assert.equal(timed.state, "budget_exhausted")
  assert.equal(timedClient.calls.filter((call) => call.name === "research_execute").length, 0)
})

test("official SDK client performs a real stdio handshake and reads the research catalog without a model or collection run", async (t) => {
  const options = fixture(t, "real-handshake"),
    ctx = moduleContext(options)
  const connection = await connectResearchClient({
    ctx,
    modules: ["collection"],
    toolProfile: "detailed",
    timeoutMs: 8000,
  })
  t.after(() => connection.close())
  assert.equal(connection.client.getServerVersion().name, "tech-knowledge-research")
  const listing = await connection.client.listTools()
  assert.ok(listing.tools.some((tool) => tool.name === "collection_inventory"))
  const response = await connection.client.callTool({ name: "research_modules", arguments: {} })
  assert.equal(response.structuredContent.modules.length, 1)
  assert.equal(response.structuredContent.modules[0].id, "collection")
  assert.equal(fs.existsSync(path.join(options.root, "module-jobs")), false)
})

test("operation-scoped local operator plans only the selected contract and freezes its scope on resume", async (t) => {
  const options = {
    ...fixture(t, "scoped-local"),
    modules: ["collection"],
    operations: ["collection.inventory"],
  }
  const next = sequence(inventory, finish)
  const completed = await runLocalOperator(options, {
    planner: async (request) => {
      assert.deepEqual(
        request.manifest.operations.map((op) => `${op.module}.${op.operation}`),
        ["collection.inventory"],
      )
      return next(request)
    },
  })
  assert.equal(completed.state, "completed")
  assert.equal(completed.steps_completed, 1)
  await assert.rejects(
    runLocalOperator({ ...options, resume: true, operations: ["collection.report"] }),
    /immutable task/,
  )
})

test("explicit resume retries only a failed planner when phase proofs preserve all completed native steps", async (t) => {
  const options = fixture(t, "planner-safe-resume"),
    client = fakeClient()
  const firstAction = sequence(inventory)
  let attempt = 0
  const first = await runLocalOperator(options, {
    client,
    planner: async (request) => {
      assert.deepEqual(request.schema.required, ["action", "tool_name", "arguments", "reason"])
      assert.equal(request.schema.properties.reason.maxLength, 160)
      assert.ok(request.messages[0].content.includes('"tool_name":null,"arguments":{}'))
      const inventorySchema = request.schema.properties.arguments.anyOf.find(
        (schema) =>
          schema.properties?.module?.enum?.[0] === "collection" &&
          schema.properties?.operation?.enum?.[0] === "inventory",
      )
      assert.equal(inventorySchema.additionalProperties, false)
      assert.deepEqual(
        inventorySchema.properties.parameters,
        catalog.modules[0].operations[0].inputSchema,
      )
      if (!attempt++) return firstAction(request)
      throw Object.assign(Error("Incomplete or unexpected model response"), {
        model_artifacts: {
          done: true,
          done_reason: "length",
          partial_response_content: '{"action":"finish"',
        },
      })
    },
  })
  assert.equal(first.state, "failed")
  assert.equal(first.phase, "planning")
  assert.equal(first.steps_completed, 1)
  assert.equal(first.handoff.planner_retry_available, true)
  assert.equal(first.handoff.planner_retry_proof.mcp_side_effect_started, false)
  const saved = readOperatorCheckpoint(options)
  const originalResult = saved.state.steps[0].result_ref
  const failureRef = saved.state.planner_failures[0]
  const failureBytes = fs.readFileSync(path.join(options.root, failureRef.path))
  assert.equal(JSON.parse(failureBytes).artifacts.done_reason, "length")
  const resumed = await runLocalOperator(
    { ...options, resume: true },
    { client, planner: sequence(finish) },
  )
  assert.equal(resumed.state, "completed")
  assert.equal(resumed.planner_calls, 3)
  assert.equal(client.calls.filter((call) => call.name === "research_execute").length, 1)
  assert.deepEqual(readOperatorCheckpoint(options).state.steps[0].result_ref, originalResult)
  assert.equal(
    sha256(fs.readFileSync(path.join(options.root, failureRef.path))),
    sha256(failureBytes),
  )
})

test("legacy failures without phase proof and ambiguous synchronous calls cannot replay on explicit resume", async (t) => {
  const legacy = fixture(t, "legacy-no-phase"),
    legacyClient = fakeClient()
  await runLocalOperator(legacy, {
    client: legacyClient,
    planner: async () => {
      throw Error("Planner unavailable")
    },
  })
  const checkpoint = path.join(legacy.root, `operator-runs/${legacy.run}/checkpoint.json`)
  const envelope = JSON.parse(fs.readFileSync(checkpoint))
  delete envelope.checkpoint.phase
  delete envelope.checkpoint.planner_intent_ref
  delete envelope.checkpoint.planner_failures
  envelope.checkpoint_sha256 = sha256(JSON.stringify(envelope.checkpoint))
  fs.writeFileSync(checkpoint, JSON.stringify(envelope))
  const legacyCallCount = legacyClient.calls.length
  const blocked = await runLocalOperator(
    { ...legacy, resume: true },
    { client: legacyClient, planner: sequence(finish) },
  )
  assert.equal(blocked.state, "failed")
  assert.equal(blocked.handoff.planner_retry_available, false)
  assert.equal(legacyClient.calls.length, legacyCallCount)

  const ambiguous = fixture(t, "ambiguous-sync"),
    client = fakeClient()
  const originalCall = client.callTool.bind(client)
  let catalogCalls = 0
  client.callTool = async (request) => {
    if (request.name === "research_modules" && ++catalogCalls === 2)
      throw Error("Lost synchronous response")
    return originalCall(request)
  }
  const failed = await runLocalOperator(ambiguous, {
    client,
    planner: sequence({
      action: "call",
      tool_name: "research_modules",
      arguments: {},
      reason: "목록 재조회",
    }),
  })
  assert.equal(failed.state, "failed")
  assert.equal(failed.phase, "submitting")
  assert.equal(failed.handoff.planner_retry_available, undefined)
  const callsBeforeResume = catalogCalls
  const replay = await runLocalOperator(
    { ...ambiguous, resume: true },
    { client, planner: sequence(finish) },
  )
  assert.equal(replay.state, "failed")
  assert.equal(catalogCalls, callsBeforeResume)
})

test("planner string arguments are rejected before MCP side effects instead of being repaired or parsed", async (t) => {
  const options = fixture(t, "string-arguments"),
    client = fakeClient()
  const output = await runLocalOperator(options, {
    client,
    planner: sequence({
      ...inventory,
      arguments: "{module: collection, operation: inventory, parameters: {}}",
    }),
  })
  assert.equal(output.state, "failed")
  assert.equal(output.phase, "decision_validation")
  assert.match(output.error, /Invalid operator decision/)
  assert.equal(output.handoff.planner_retry_available, true)
  assert.equal(client.calls.filter((call) => call.name === "research_execute").length, 0)
  const saved = readOperatorCheckpoint(options)
  assert.equal(saved.state.steps.length, 0)
  assert.equal(saved.state.active_step, null)
})
