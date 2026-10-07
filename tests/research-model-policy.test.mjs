import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Ollama } from "../scripts/research/ollama.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import {
  validateModelPolicy,
  resolveRolePolicy,
  prepareRoleProvider,
  prepareRoleOllama,
} from "../scripts/research/model-policy.mjs"

const model = "qwen3.8:27b"
const role = {
  model,
  think: false,
  num_ctx: 16384,
  num_predict: 2048,
  call_timeout_ms: 1000,
  total_timeout_ms: 3000,
}
const policy = (settings = {}) => ({
  schema: "model-execution-policy/v1",
  roles: { article_write: { ...role, ...settings } },
})
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["ok"],
  properties: { ok: { type: "boolean" } },
}
const request = {
  model,
  think: "medium",
  num_ctx: 8192,
  schema,
  messages: [{ role: "user", content: "verified source facts" }],
}
function temporary(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-model-policy-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}
function runtime({ mutateMetadata, chat, clock } = {}) {
  const requests = []
  let digest = "a".repeat(64)
  const api = new Ollama({
    fetchImpl: async (url, options) => {
      const endpoint = new URL(url).pathname
      const body = options.body ? JSON.parse(options.body) : null
      requests.push({ endpoint, body })
      let value
      if (endpoint === "/api/version") value = { version: "0.34.4" }
      else if (endpoint === "/api/tags") value = { models: [{ name: model, digest }] }
      else if (endpoint === "/api/show")
        value = mutateMetadata?.() ?? {
          capabilities: ["completion"],
          thinking: { values: [false, "medium"], default: "medium" },
          details: {},
        }
      else if (endpoint === "/api/chat") {
        if (clock) clock.value += 200
        value = chat?.(body) ?? {
          done: true,
          done_reason: "stop",
          message: { content: '{"ok":true}' },
        }
      } else throw Error("Unexpected endpoint")
      return endpoint === "/api/chat" && body.stream
        ? new Response(JSON.stringify(value) + "\n", {
            headers: { "content-type": "application/x-ndjson" },
          })
        : Response.json(value)
    },
  })
  return {
    api,
    requests,
    changeDigest: () => {
      digest = "b".repeat(64)
    },
  }
}
test("source-block evidence is an explicit extraction-only policy with legacy defaults preserved", () => {
  const p = {
    schema: "model-execution-policy/v1",
    roles: { fact_extract: { ...role, evidence_quote_mode: "source_block" } },
  }
  assert.equal(validateModelPolicy(p).roles.fact_extract.evidence_quote_mode, "source_block")
  assert.equal(
    Object.hasOwn(
      validateModelPolicy({ schema: p.schema, roles: { fact_extract: { ...role } } }).roles
        .fact_extract,
      "evidence_quote_mode",
    ),
    false,
  )
  assert.throws(
    () =>
      validateModelPolicy({
        ...p,
        roles: { fact_extract: { ...role, evidence_quote_mode: "repair" } },
      }),
    /quote mode/,
  )
  assert.throws(
    () => validateModelPolicy(policy({ evidence_quote_mode: "source_block" })),
    /Unknown model role setting/,
  )
})

test("role policy rejects unknown fields, cloud models, strings as booleans and invalid budgets", () => {
  assert.equal(validateModelPolicy(policy()).roles.article_write.think, false)
  for (const settings of [
    { think: "false" },
    { model: "qwen:cloud" },
    { num_ctx: 1024 },
    { num_predict: 0 },
    { total_timeout_ms: 0 },
    { call_timeout_ms: 0 },
    { temperature: 3 },
    { extra: true },
  ])
    assert.throws(() => validateModelPolicy(policy(settings)))
  assert.throws(() => validateModelPolicy({ ...policy(), extra: true }))
  assert.throws(() => validateModelPolicy({ schema: policy().schema, roles: { made_up: role } }))
  assert.throws(() => resolveRolePolicy(policy(), "fact_extract"), /role/i)
})
test("fact extraction policy retains bounded segmentation and typed CLI overrides", () => {
  const p = {
    schema: policy().schema,
    roles: {
      fact_extract: {
        ...role,
        input_char_budget: 16000,
        facts_per_batch: 6,
        extraction_timeout_ms: 3000,
      },
    },
  }
  const resolved = resolveRolePolicy(p, "fact_extract", { think: "medium", num_predict: 4096 })
  assert.equal(resolved.think, "medium")
  assert.equal(resolved.input_char_budget, 16000)
  assert.equal(
    resolveRolePolicy(p, "fact_extract", { max_blocks_per_batch: 4 }).max_blocks_per_batch,
    4,
  )
  assert.equal(Object.hasOwn(resolved, "max_blocks_per_batch"), false)
  assert.throws(() => resolveRolePolicy(p, "fact_extract", { max_blocks_per_batch: 0 }), /budget/i)
  assert.equal(
    resolveRolePolicy(p, "fact_extract", { extraction_scope: "research_key_findings" })
      .extraction_scope,
    "research_key_findings",
  )
  assert.throws(() => resolveRolePolicy(p, "fact_extract", { extraction_scope: "guess" }), /scope/i)
  assert.equal(resolveRolePolicy(p, "fact_extract", { facts_per_batch: 16 }).facts_per_batch, 16)
  assert.throws(() => resolveRolePolicy(p, "fact_extract", { facts_per_batch: 17 }), /budget/i)
  assert.throws(() => resolveRolePolicy(p, "fact_extract", { input_char_budget: 40000 }), /budget/i)
})
test("role settings reach the actual Ollama request without replacing facts or schema", async (t) => {
  const root = temporary(t),
    r = runtime()
  const scoped = await prepareRoleOllama(r.api, policy(), "article_write", { root, run: "article" })
  const result = await scoped.structured(request)
  const sent = r.requests.find((r) => r.endpoint === "/api/chat").body
  assert.equal(sent.think, false)
  assert.deepEqual(sent.options, { num_ctx: 16384, num_predict: 2048, temperature: 0 })
  assert.deepEqual(sent.format, schema)
  assert.deepEqual(sent.messages, request.messages)
  assert.equal(result.provenance.model_policy.role, "article_write")
  assert.equal(result.provenance.model_policy.fingerprint, scoped.executionPolicy.fingerprint)
  assert.equal(
    readJSON(root, "runs/article/model-policy/article_write/budget.json").attempts.length,
    1,
  )
})
test("local role receipts preserve failed stream bytes without caching them as results", async (t) => {
  const root = temporary(t),
    r = runtime({
      chat: () => ({
        done: false,
        message: { content: '{"ok":' },
      }),
    })
  const scoped = await prepareRoleOllama(r.api, policy(), "article_write", { root, run: "partial" })
  await assert.rejects(scoped.structured(request), /Incomplete model stream/)
  const attempt = readJSON(root, "runs/partial/model-policy/article_write/budget.json").attempts[0]
  assert.equal(attempt.status, "failed")
  assert.equal(attempt.result, undefined)
  assert.equal(attempt.failure_artifacts.partial_response_content, '{"ok":')
  assert.equal(attempt.failure_artifacts_sha256, sha256(JSON.stringify(attempt.failure_artifacts)))
  const progress = readJSON(root, attempt.progress_path)
  assert.equal(progress.status, "failed")
  assert.equal(progress.content_chars, 6)
  assert.equal(progress.attempt_id, attempt.id)
  const stored = readJSON(root, "runs/partial/model-policy/article_write/budget.json")
  const { sha256: _checksum, ...ledger } = stored
  ledger.attempts[0].failure_artifacts.partial_response_content = "altered"
  atomicWrite(root, "runs/partial/model-policy/article_write/budget.json", {
    ...ledger,
    sha256: sha256(JSON.stringify(ledger)),
  })
  await assert.rejects(scoped.structured(request), /Invalid model attempt receipt/)
  assert.equal(r.requests.filter((r) => r.endpoint === "/api/chat").length, 1)
})
test("unsupported thinking or missing thinking metadata fails before inference", async (t) => {
  for (const values of [[false], null]) {
    const r = runtime({
      mutateMetadata: () => ({
        capabilities: ["completion"],
        ...(values ? { thinking: { values } } : {}),
      }),
    })
    await assert.rejects(
      () =>
        prepareRoleOllama(r.api, policy({ think: "medium" }), "article_write", {
          root: temporary(t),
          run: "unsupported",
        }),
      /think/i,
    )
    assert.equal(r.requests.filter((r) => r.endpoint === "/api/chat").length, 0)
  }
})
test("model digest changes fail before a chat and cannot reuse an earlier receipt", async (t) => {
  const root = temporary(t),
    r = runtime()
  const scoped = await prepareRoleOllama(r.api, policy(), "article_write", { root, run: "digest" })
  r.changeDigest()
  await assert.rejects(() => scoped.structured(request), /changed/i)
  assert.equal(r.requests.filter((r) => r.endpoint === "/api/chat").length, 0)
  await assert.rejects(
    () => prepareRoleOllama(r.api, policy(), "article_write", { root, run: "digest" }),
    /changed/i,
  )
})
test("same policy and same input reuse a checked result but changed prompts require a new call", async (t) => {
  const root = temporary(t),
    r = runtime()
  let scoped = await prepareRoleOllama(r.api, policy(), "article_write", { root, run: "reuse" })
  const first = await scoped.structured(request)
  scoped = await prepareRoleOllama(r.api, policy(), "article_write", { root, run: "reuse" })
  assert.deepEqual(await scoped.structured(request), first)
  await scoped.structured({
    ...request,
    messages: [{ role: "user", content: "different verified facts" }],
  })
  assert.equal(r.requests.filter((r) => r.endpoint === "/api/chat").length, 2)
  await assert.rejects(
    () =>
      prepareRoleOllama(r.api, policy({ num_predict: 4096 }), "article_write", {
        root,
        run: "reuse",
      }),
    /changed/i,
  )
})
test("prior settled cost survives restart and blocks new inference when exhausted", async (t) => {
  const root = temporary(t),
    clock = { value: 0 },
    r = runtime({ clock })
  const p = policy({ call_timeout_ms: 1000, total_timeout_ms: 200 })
  let scoped = await prepareRoleOllama(r.api, p, "article_write", {
    root,
    run: "cost",
    now: () => clock.value,
  })
  const first = await scoped.structured(request)
  scoped = await prepareRoleOllama(r.api, p, "article_write", {
    root,
    run: "cost",
    now: () => clock.value,
  })
  assert.deepEqual(await scoped.structured(request), first)
  await assert.rejects(
    () => scoped.structured({ ...request, messages: [{ role: "user", content: "new" }] }),
    /budget/i,
  )
  assert.equal(r.requests.filter((r) => r.endpoint === "/api/chat").length, 1)
})
test("an explicit local budget extension resumes from cached work without repeating it", async (t) => {
  const root = temporary(t),
    clock = { value: 0 },
    r = runtime({ clock }),
    p = policy({ total_timeout_ms: 200 })
  let scoped = await prepareRoleOllama(r.api, p, "article_write", {
    root,
    run: "extend",
    now: () => clock.value,
  })
  const first = await scoped.structured(request)
  scoped = await prepareRoleOllama(r.api, p, "article_write", {
    root,
    run: "extend",
    additionalBudgetMs: 200,
    extensionReason: "Finish remaining work after the configured local budget expired.",
    now: () => clock.value,
  })
  assert.deepEqual(await scoped.structured(request), first)
  await scoped.structured({
    ...request,
    messages: [{ role: "user", content: "remaining source section" }],
  })
  const ledger = readJSON(root, "runs/extend/model-policy/article_write/budget.json")
  assert.equal(ledger.schema, "model-budget/v2")
  assert.equal(ledger.extensions.length, 1)
  assert.equal(ledger.extensions[0].additional_ms, 200)
  assert.equal(ledger.attempts.length, 2)
  assert.equal(r.requests.filter((r) => r.endpoint === "/api/chat").length, 2)
})
test("budget extension requires a reason and cannot extend API provider runs", async (t) => {
  const root = temporary(t),
    r = runtime()
  await assert.rejects(
    () =>
      prepareRoleOllama(r.api, policy(), "article_write", {
        root,
        run: "reason",
        additionalBudgetMs: 100,
      }),
    /reason/i,
  )
  const apiPolicy = policy({ provider: "openai", model: "gpt-4.1-mini", total_timeout_ms: 3000 })
  let metadataCalls = 0
  const api = {
    metadata: async (name) => {
      metadataCalls++
      return {
        model: name,
        digest: "c".repeat(64),
        runtime: "openai-responses/v1",
        capabilities: ["completion"],
        thinking: { values: [false, "medium"] },
      }
    },
    structured: async () => ({ output: { ok: true }, provenance: {} }),
  }
  await assert.rejects(
    () =>
      prepareRoleProvider(api, apiPolicy, "article_write", {
        root,
        run: "api",
        additionalBudgetMs: 100,
        extensionReason: "No API budget extensions in this workflow.",
      }),
    /only available for local Ollama/i,
  )
  assert.equal(metadataCalls, 0)
})
test("budget extension can resume a ledger from the immediately previous implementation", async (t) => {
  const root = temporary(t),
    r = runtime(),
    scoped = await prepareRoleOllama(r.api, policy(), "article_write", {
      root,
      run: "legacy-budget",
    })
  const { fingerprint: _fingerprint, ...identity } = scoped.executionPolicy
  const previousIdentity = {
    ...identity,
    implementation_sha256: "ee4340ca6445b140f02b74cbfcb3c8bfd6532ab7a4f5ff7591a65d7339f46260",
  }
  const previousBinding = {
    ...previousIdentity,
    fingerprint: sha256(JSON.stringify(previousIdentity)),
  }
  const ledger = { schema: "model-budget/v1", binding: previousBinding, attempts: [] }
  atomicWrite(root, "runs/legacy-budget/model-policy/article_write/budget.json", {
    ...ledger,
    sha256: sha256(JSON.stringify(ledger)),
  })
  const resumed = await prepareRoleOllama(r.api, policy(), "article_write", {
    root,
    run: "legacy-budget",
    additionalBudgetMs: 100,
    extensionReason: "Preserve exact prior run checkpoints.",
  })
  assert.equal(resumed.executionPolicy.fingerprint, previousBinding.fingerprint)
  assert.equal(
    readJSON(root, "runs/legacy-budget/model-policy/article_write/budget.json").binding
      .implementation_sha256,
    previousBinding.implementation_sha256,
  )
})
test("unfinished reserved attempts are charged on restart and never counted as success", async (t) => {
  const root = temporary(t),
    r = runtime(),
    p = policy({ total_timeout_ms: 1000 })
  const scoped = await prepareRoleOllama(r.api, p, "article_write", { root, run: "interrupted" })
  const ledger = {
    schema: "model-budget/v1",
    binding: scoped.executionPolicy,
    attempts: [
      { id: "interrupted", status: "running", reserved_ms: 1000, request_fingerprint: "x" },
    ],
  }
  atomicWrite(root, "runs/interrupted/model-policy/article_write/budget.json", {
    ...ledger,
    sha256: sha256(JSON.stringify(ledger)),
  })
  const resumed = await prepareRoleOllama(r.api, p, "article_write", { root, run: "interrupted" })
  await assert.rejects(() => resumed.structured(request), /budget/i)
  assert.equal(r.requests.filter((r) => r.endpoint === "/api/chat").length, 0)
})
test("failed or incomplete responses retain cost and require a fresh successful attempt", async (t) => {
  const root = temporary(t),
    clock = { value: 0 },
    r = runtime({ clock, chat: () => ({ done: false, message: { content: '{"ok":true}' } }) })
  const scoped = await prepareRoleOllama(r.api, policy(), "article_write", {
    root,
    run: "failed",
    now: () => clock.value,
  })
  await assert.rejects(() => scoped.structured(request), /Incomplete/i)
  const ledger = readJSON(root, "runs/failed/model-policy/article_write/budget.json")
  assert.equal(ledger.attempts[0].status, "failed")
  assert.equal(ledger.attempts[0].wall_ms, 200)
  assert.equal(ledger.attempts[0].result, undefined)
})
test("tampered cost or cached result is rejected without model inference", async (t) => {
  const root = temporary(t),
    r = runtime()
  const scoped = await prepareRoleOllama(r.api, policy(), "article_write", { root, run: "tamper" })
  await scoped.structured(request)
  const file = path.join(root, "runs/tamper/model-policy/article_write/budget.json")
  const ledger = JSON.parse(fs.readFileSync(file, "utf8"))
  ledger.attempts[0].wall_ms = 0
  fs.writeFileSync(file, JSON.stringify(ledger))
  await assert.rejects(
    () => prepareRoleOllama(r.api, policy(), "article_write", { root, run: "tamper" }),
    /hash/i,
  )
  assert.equal(r.requests.filter((r) => r.endpoint === "/api/chat").length, 1)
})
