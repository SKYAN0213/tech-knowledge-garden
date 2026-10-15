import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Ollama, structuredRequestBudget } from "../scripts/research/ollama.mjs"
import { planExtractionBatches, extractClaims } from "../scripts/research/claims.mjs"
import { writeDraft } from "../scripts/research/editor.mjs"
import { prepareRoleProvider } from "../scripts/research/model-policy.mjs"
import { createModelExecutionWindow } from "../scripts/research/model-provider.mjs"
import { extractEditionEventProposals } from "../scripts/research/event-inference.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { RunState, atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { editionFixture } from "./fixtures/research-event-fixtures.mjs"

const model = "qwen3.8:27b-mlx"
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["ok"],
  properties: { ok: { type: "boolean" } },
}
const request = {
  model,
  think: false,
  num_ctx: 8192,
  num_predict: 1024,
  schema,
  messages: [{ role: "user", content: "An exact original condition." }],
}
const settings = {
  model,
  think: false,
  num_ctx: 8192,
  num_predict: 1024,
  call_timeout_ms: 1000,
  total_timeout_ms: 5000,
}
const policy = (role = "article_write") => ({
  schema: "model-execution-policy/v1",
  roles: { [role]: settings },
})
const metadata = async () => ({
  model,
  digest: "a".repeat(64),
  runtime: "0.34.4",
  capabilities: ["completion"],
  thinking: { values: [false] },
})
function temporary(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-request-budget-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}
function source(count = 3, size = 300) {
  const parse_id = sha256("budget-fixture")
  return {
    schema_version: "source-parse/v1",
    source_id: "budget-fixture",
    source_version_id: "budget-fixture:v1",
    parse_id,
    status: "extracted",
    title: "Stored conditions",
    dates: { published_at: "2026-09-27", observed_at: "2026-09-28T00:00:00Z" },
    quality: { missing_pages: [] },
    blocks: Array.from({ length: count }, (_, i) => {
      const text =
        `Condition ${i}: limit applies only in this test. ` +
        "original text ".repeat(Math.ceil(size / 14))
      return {
        block_id: `${parse_id}:b${i}`,
        kind: "paragraph",
        text,
        locator: { text_hash: sha256(text) },
      }
    }),
  }
}
function factResponse(req) {
  const d = JSON.parse(req.messages[1].content)[0],
    b = d.blocks[0]
  return {
    output: {
      claims: [
        {
          statement: b.text,
          claim_kind: "fact",
          subject: "Research team",
          event_state: "reported",
          published_at: d.dates.published_at,
          effective_period: null,
          numbers: [],
          evidence: [{ block_key: b.block_key, quote: b.text, support: "direct" }],
        },
      ],
    },
    provenance: { model },
    artifacts: { request: req },
  }
}

test("actual serialized schema/messages reserve output and distinguish estimated from measured tokens", () => {
  const p = {
    ...request,
    num_ctx: 4096,
    num_predict: 3072,
    messages: [{ role: "user", content: "x".repeat(1900) }],
  }
  const b = structuredRequestBudget(p)
  assert.equal(b.input_chars, JSON.stringify({ messages: p.messages, format: p.schema }).length)
  assert.equal(b.fits, false)
  assert.equal(b.input_char_limit, (4096 - 3072 - 256) * 2)
  assert.equal(b.tokenizer_verified, false)
  assert.equal(b.source_truncation_allowed, false)
  assert.equal(
    structuredRequestBudget({ ...request, schema: { ...schema, description: "x".repeat(15000) } })
      .fits,
    false,
  )
})

test("local request rejects oversize before metadata and explicitly disables server truncation and shifting", async () => {
  const seen = [],
    api = new Ollama({
      fetchImpl: async (url, options) => {
        const endpoint = new URL(url).pathname,
          body = options.body && JSON.parse(options.body)
        seen.push({ endpoint, body })
        if (endpoint === "/api/show")
          return Response.json({
            capabilities: ["completion"],
            thinking: { values: [false] },
            details: {},
          })
        if (endpoint === "/api/tags")
          return Response.json({ models: [{ name: model, digest: "a".repeat(64) }] })
        if (endpoint === "/api/version") return Response.json({ version: "0.34.4" })
        assert.equal(endpoint, "/api/chat")
        assert.equal(body.truncate, false)
        assert.equal(body.shift, false)
        return Response.json({
          done: true,
          done_reason: "stop",
          message: { content: '{"ok":true}' },
          prompt_eval_count: 30,
          eval_count: 5,
        })
      },
    })
  await assert.rejects(
    api.structured({ ...request, messages: [{ role: "user", content: "x".repeat(20000) }] }),
    (e) => e.code === "MODEL_INPUT_BUDGET_EXCEEDED" && e.model_budget.request_sent === false,
  )
  assert.equal(seen.length, 0)
  const r = await api.structured(request)
  assert.equal(r.provenance.request_budget.output_reserved_tokens, 1024)
  assert.equal(r.provenance.prompt_eval_count, 30)
})

test("role-specific request factory splits by its own schema and preserves every source condition exactly", () => {
  const s = source(6, 1300),
    p = planExtractionBatches([s], {
      num_ctx: 8192,
      num_predict: 1024,
      input_char_budget: 12000,
      request_factory: (sections) => ({
        num_ctx: 8192,
        num_predict: 1024,
        schema: { ...schema, description: "role overhead ".repeat(350) },
        messages: [
          { role: "system", content: "actual event role" },
          { role: "user", content: JSON.stringify(sections) },
        ],
      }),
    })
  assert.ok(p.batches.length > 1)
  assert.equal(
    p.batches.every((b) => b.input_chars <= p.input_char_limit && b.request_budget.fits),
    true,
  )
  const sent = p.batches.flatMap((b) =>
    JSON.parse(b.request.messages[1].content).flatMap((d) => d.blocks.map((b) => b.text)),
  )
  assert.deepEqual(
    sent,
    s.blocks.map((b) => b.text),
  )
  assert.equal(
    p.batches.every((b) => b.request.messages[0].content === "actual event role"),
    true,
  )
  assert.throws(
    () =>
      planExtractionBatches([s], {
        request_factory: (sections) => ({
          ...request,
          num_ctx: 16384,
          num_predict: 4096,
          messages: [{ role: "user", content: JSON.stringify(sections) }],
        }),
      }),
    /preserve exact source/,
  )
  assert.throws(
    () => planExtractionBatches([source(1, 50000)]),
    (e) => e.code === "MODEL_INPUT_BUDGET_EXCEEDED",
  )
})

test("bounded extraction persists completed batch and resumes pending batches without another first call", async (t) => {
  const root = temporary(t),
    s = source(),
    state = new RunState(root, "batch-budget", { parse_id: s.parse_id })
  let calls = 0
  const api = {
    structured: async (req) => {
      calls++
      return factResponse(req)
    },
  }
  const opts = {
    model,
    think: false,
    candidate_key: "fixture",
    max_blocks_per_batch: 1,
    checkpoint: (id, input, action) => state.stage("claims-" + id, input, action),
  }
  await assert.rejects(extractClaims(api, [s], { ...opts, max_model_calls: 1 }), (e) => {
    assert.equal(e.code, "MODEL_CALL_LIMIT")
    assert.equal(e.extraction_checkpoint.completed_batch_ids.length, 1)
    assert.equal(e.extraction_checkpoint.pending_batches.length, 2)
    assert.equal(e.extraction_checkpoint.partial_claims_approved, false)
    return true
  })
  const complete = await extractClaims(api, [s], opts)
  assert.equal(calls, 3)
  assert.equal(complete.claims.length, 3)
  assert.equal(
    complete.claims.every((c) => c.review.status === "unreviewed"),
    true,
  )
})

test("timeout attempts retain receipt and require explicit local resume while completed requests reuse budget", async (t) => {
  const root = temporary(t),
    p = policy(),
    clock = { value: 0 },
    window = createModelExecutionWindow({ max_model_calls: 1, now: () => clock.value })
  let calls = 0,
    fail = true
  const api = {
    metadata,
    structured: async (req) => {
      calls++
      clock.value += 10
      if (fail) {
        const e = Error("bounded local timeout")
        e.name = "TimeoutError"
        e.model_artifacts = { request: req, partial_response_content: "{" }
        throw e
      }
      return { output: { ok: true }, provenance: {} }
    },
  }
  const make = (opts) =>
    prepareRoleProvider(api, p, "article_write", {
      root,
      run: "local-resume",
      now: () => clock.value,
      ...opts,
    })
  const first = await make({ executionWindow: window })
  await assert.rejects(
    first.structured(request),
    (e) => e.code === "MODEL_CALL_TIMEOUT" && e.model_budget.requires_explicit_resume,
  )
  const before = readJSON(root, "runs/local-resume/model-policy/article_write/budget.json")
  const stopped = await make({})
  await assert.rejects(stopped.structured(request), (e) => e.code === "MODEL_RETRY_REQUIRED")
  assert.equal(calls, 1)
  fail = false
  const resumed = await make({ retryFailed: true })
  const result = await resumed.structured(request)
  const after = readJSON(root, "runs/local-resume/model-policy/article_write/budget.json")
  assert.deepEqual(after.attempts[0], before.attempts[0])
  assert.equal(after.attempts[1].resumed_from_attempt_id, before.attempts[0].id)
  const cached = await make({ executionWindow: window })
  assert.deepEqual(await cached.structured(request), result)
  assert.equal(calls, 2)
  await assert.rejects(
    cached.structured({
      ...request,
      messages: [{ role: "user", content: "a different exact request" }],
    }),
    (e) => e.code === "MODEL_CALL_LIMIT",
  )
  assert.equal(calls, 2)
})

test("shared invocation wall budget reduces fresh provider timeout without altering role settings", async (t) => {
  const root = temporary(t),
    clock = { value: 0 },
    seen = []
  const window = createModelExecutionWindow({ time_budget_ms: 100, now: () => clock.value })
  const base = {
    metadata: async () => {
      clock.value += 20
      return metadata()
    },
    structured: async (req) => {
      seen.push(req.timeout_ms)
      clock.value += 90
      return { output: { ok: true }, provenance: {} }
    },
  }
  const model = await prepareRoleProvider(base, policy(), "article_write", {
    root,
    run: "time-bound",
    executionWindow: window,
    now: () => clock.value,
  })
  await model.structured(request)
  assert.deepEqual(seen, [80])
  assert.equal(model.executionPolicy.settings.total_timeout_ms, 5000)
  await assert.rejects(
    model.structured({ ...request, messages: [{ role: "user", content: "next event" }] }),
    (e) => e.code === "MODEL_TIME_BUDGET_EXCEEDED",
  )
  assert.equal(seen.length, 1)
})

test("delegated reasoning wait consumes no generation slot or failed local attempt", async (t) => {
  const root = temporary(t),
    p = policy(),
    window = createModelExecutionWindow({ max_model_calls: 1 })
  p.roles.article_write.provider = "codex"
  const base = {
    metadata,
    structured: async () => {
      throw Error("must not execute")
    },
    prepareStructured: async () => {
      const e = Error("waiting")
      e.code = "REASONING_PENDING"
      throw e
    },
  }
  const api = await prepareRoleProvider(base, p, "article_write", {
    root,
    run: "delegation",
    executionWindow: window,
  })
  await assert.rejects(api.structured(request), (e) => e.code === "REASONING_PENDING")
  assert.equal(window.model_calls, 0)
  assert.equal(readJSON(root, "runs/delegation/model-policy/article_write/budget.json"), null)
})

test("event proposal timeout does not starve another material and resumes only the failed cache", async (t) => {
  const f = editionFixture(t),
    p = policy("search_plan")
  atomicWrite(f.root, "budget-policy.json", p)
  f.ctx.policy = path.join(f.root, "budget-policy.json")
  const ids = f.sources
    .slice(0, 2)
    .map(
      (s) =>
        f.report.materials.find((m) => m.source_version_id === s.document.source_version_id).id,
    )
  const params = {
    run_id: "budget-proposals",
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
    material_ids: ids,
  }
  let fail = true,
    calls = 0
  const baseProvider = {
    metadata,
    structured: async (req) => {
      calls++
      const doc = JSON.parse(req.messages[1].content)[0],
        b = doc.blocks[0]
      assert.equal(
        req.schema.properties.events.items.properties.block_keys.items.enum.includes(b.block_key),
        true,
      )
      if (fail && doc.title.endsWith("0")) {
        const e = Error("first material timeout")
        e.name = "TimeoutError"
        throw e
      }
      return {
        output: {
          events: [
            {
              who: "Fixture Robotics",
              action: "announced order",
              object: "Contract-123",
              occurred_at: null,
              effective_at: null,
              external_id: "Contract-123",
              quantities: [],
              block_keys: [b.block_key],
            },
          ],
        },
        provenance: {},
      }
    },
  }
  const partial = await extractEditionEventProposals(f.ctx, params, { baseProvider })
  assert.equal(partial.status, "partial")
  assert.equal(partial.processed_material_ids.length, 1)
  assert.equal(partial.failures.length, 1)
  assert.equal(partial.model_calls, 2)
  assert.equal(partial.writer_allowed, false)
  assert.equal(partial.failures[0].extraction_checkpoint.pending_batches.length, 1)
  assert.equal(readJSON(f.root, "event-proposals/budget-proposals/result.json"), null)
  const failedBudgetPath = `runs/${partial.failures[0].run}/model-policy/search_plan/budget.json`
  const beforeFailed = readJSON(f.root, failedBudgetPath)
  const completedRun = partial.cache[0].run
  const completedCacheSHA = sha256(
    fs.readFileSync(path.join(f.root, `runs/${completedRun}/event-proposals.json`)),
  )
  const again = await extractEditionEventProposals(f.ctx, params, { baseProvider })
  const trace = {
    original_failure: partial.failures[0],
    original_failed_budget: beforeFailed,
    second_failures: again.failures,
    second_cache: again.cache,
    second_failed_budget: readJSON(f.root, failedBudgetPath),
    completed_cache_sha256: completedCacheSHA,
    current_completed_cache_sha256: sha256(
      fs.readFileSync(path.join(f.root, `runs/${completedRun}/event-proposals.json`)),
    ),
  }
  if (process.env.RESEARCH_REQUEST_BUDGET_TEST_TRACE)
    fs.writeFileSync(
      process.env.RESEARCH_REQUEST_BUDGET_TEST_TRACE,
      JSON.stringify(trace, null, 2) + "\n",
    )
  assert.equal(
    again.model_calls,
    0,
    JSON.stringify({ cache: again.cache, failures: again.failures }),
  )
  assert.equal(again.failures[0].code, "MODEL_RETRY_REQUIRED")
  assert.equal(again.failures[0].run, partial.failures[0].run)
  assert.equal(
    again.failures[0].model_budget.request_fingerprint,
    beforeFailed.attempts[0].request_fingerprint,
  )
  assert.deepEqual(trace.second_failed_budget, beforeFailed)
  assert.equal(trace.current_completed_cache_sha256, completedCacheSHA)
  fail = false
  const done = await extractEditionEventProposals(f.ctx, params, {
    baseProvider,
    retry_failed: true,
  })
  assert.equal(done.status, "relationship_review")
  assert.equal(done.model_calls, 1)
  assert.equal(done.proposals.length, 2)
  assert.equal(calls, 3)
  assert.equal(
    done.proposals.every((e) => e.review_status === "unreviewed"),
    true,
  )
  const progress = readJSON(f.root, "event-proposals/budget-proposals/progress.json")
  atomicWrite(f.root, "event-proposals/budget-proposals/progress.json", {
    ...progress,
    input_sha256: "0".repeat(64),
  })
  await assert.rejects(
    extractEditionEventProposals(f.ctx, params, { baseProvider }),
    /progress binding changed/,
  )
})

test("oversize writing preserves reviewed facts and refuses before provider generation", async () => {
  let calls = 0
  const claim = {
    claim_id: "claim-a",
    subject: "Fixture company",
    statement: "conditions ".repeat(5000),
    claim_kind: "fact",
    event_state: "reported",
    published_at: "2026-09-27",
    effective_period: null,
    numbers: [],
    evidence: [],
    review: { status: "verified" },
  }
  await assert.rejects(
    writeDraft(
      {
        structured: async () => {
          calls++
          throw Error("must not generate")
        },
      },
      [claim],
    ),
    (e) => e.code === "MODEL_INPUT_BUDGET_EXCEEDED",
  )
  assert.equal(calls, 0)
  assert.equal(claim.statement.length, 55000)
})

test("native DOMException timeout keeps writable failure code and partial stream receipt", async (t) => {
  const root = temporary(t)
  const native = new DOMException("The operation timed out", "TimeoutError")
  assert.throws(() => {
    native.code = "MODEL_CALL_TIMEOUT"
  }, TypeError)
  let calls = 0
  const api = new Ollama({
    fetchImpl: async (url) => {
      const endpoint = new URL(url).pathname
      if (endpoint === "/api/show")
        return Response.json({
          capabilities: ["completion"],
          thinking: { values: [false] },
          details: {},
        })
      if (endpoint === "/api/tags")
        return Response.json({ models: [{ name: model, digest: "a".repeat(64) }] })
      if (endpoint === "/api/version") return Response.json({ version: "0.34.4" })
      assert.equal(endpoint, "/api/chat")
      calls++
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify({ done: false, message: { content: '{"ok":' } }) + "\n",
              ),
            )
            setTimeout(() => controller.error(native), 5)
          },
        }),
        { headers: { "content-type": "application/x-ndjson" } },
      )
    },
  })
  const scoped = await prepareRoleProvider(api, policy(), "article_write", {
    root,
    run: "native-timeout",
  })
  await assert.rejects(scoped.structured(request), (error) => {
    assert.equal(error.code, "MODEL_CALL_TIMEOUT")
    assert.equal(error.native_error.name, "TimeoutError")
    assert.equal(error.native_error.code, native.code)
    assert.equal(error.model_artifacts.partial_response_content, '{"ok":')
    assert.equal(error.model_artifacts.progress.status, "failed")
    return true
  })
  const ledger = readJSON(root, "runs/native-timeout/model-policy/article_write/budget.json")
  assert.equal(ledger.attempts[0].error_code, "MODEL_CALL_TIMEOUT")
  assert.equal(ledger.attempts[0].failure_artifacts.partial_response_content, '{"ok":')
  await assert.rejects(scoped.structured(request), (error) => error.code === "MODEL_RETRY_REQUIRED")
  assert.equal(calls, 1)
  const delegated = {
    metadata,
    structured: async () => {
      throw native
    },
  }
  const direct = await prepareRoleProvider(delegated, policy(), "article_write", {
    root,
    run: "direct-native-timeout",
  })
  await assert.rejects(
    direct.structured(request),
    (e) => e.code === "MODEL_CALL_TIMEOUT" && e.native_error.code === native.code,
  )
})
