import test from "node:test"
import assert from "node:assert/strict"
import { Ollama, inspectOllamaLoadedContext } from "../scripts/research/ollama.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"

const model = "development-mlx",
  digest = "a".repeat(64),
  schema = {
    type: "object",
    additionalProperties: false,
    required: ["status"],
    properties: { status: { type: "string", enum: ["ready"] } },
  },
  request = {
    model,
    think: false,
    num_ctx: 32768,
    num_predict: 128,
    messages: [{ role: "user", content: "Report the ready status as structured JSON." }],
    schema,
  },
  row = (context_length, extra = {}) => ({ name: model, digest, context_length, ...extra })

// Injected responses test the adapter contract only; they are not model trials.
function fixture(states, { format = "safetensors", psFailure = false } = {}) {
  const calls = []
  let index = 0
  const provider = new Ollama({
    fetchImpl: async (url, options) => {
      const endpoint = new URL(url).pathname
      calls.push({ endpoint, body: options.body && JSON.parse(options.body) })
      if (endpoint === "/api/show")
        return Response.json({
          details: { format },
          capabilities: ["completion"],
          thinking: { values: [false] },
        })
      if (endpoint === "/api/tags") return Response.json({ models: [{ name: model, digest }] })
      if (endpoint === "/api/version") return Response.json({ version: "injected-fixture" })
      if (endpoint === "/api/ps") {
        if (psFailure) return new Response("", { status: 503 })
        return Response.json(states[index++])
      }
      if (endpoint === "/api/chat")
        return Response.json({
          done: true,
          done_reason: "stop",
          message: { content: '{"status":"ready"}' },
        })
      throw Error("Unexpected fixture endpoint")
    },
  })
  return { provider, calls }
}

test("warm short MLX context blocks before inference and preserves the original larger request", async () => {
  const f = fixture([{ models: [row(16384)] }])
  await assert.rejects(f.provider.structured(request), (error) => {
    assert.match(error.message, /natural expiry/)
    assert.equal(error.model_artifacts.request_sent, false)
    assert.equal(error.model_artifacts.context_preflight.reported_context_length, 16384)
    assert.equal(error.model_artifacts.request.options.num_ctx, 32768)
    assert.equal(
      error.model_artifacts.request_sha256,
      sha256(JSON.stringify(error.model_artifacts.request)),
    )
    return true
  })
  assert.equal(
    f.calls.some((call) => call.endpoint === "/api/chat"),
    false,
  )
  assert.equal(
    f.calls.some((call) => call.body?.keep_alive === 0),
    false,
  )
})

test("cold MLX first-load records the native 32k report without claiming full-window validation", async () => {
  const f = fixture([{ models: [] }, { models: [row(32768)] }])
  const result = await f.provider.structured(request)
  assert.equal(result.artifacts.context_preflight.status, "not_loaded")
  assert.equal(result.artifacts.context_after.status, "sufficient")
  assert.equal(result.provenance.loaded_context_length, 32768)
  assert.equal(result.provenance.full_context_window_verified, false)
  assert.deepEqual(result.artifacts.request.format, schema)
  assert.equal(result.artifacts.request.options.num_ctx, 32768)
  assert.equal(f.calls.filter((call) => call.endpoint === "/api/chat").length, 1)
})

test("a warm larger MLX context can serve a smaller request without rewriting its budget", async () => {
  const f = fixture([{ models: [row(32768)] }, { models: [row(32768)] }])
  const result = await f.provider.structured({ ...request, num_ctx: 16384 })
  assert.equal(result.artifacts.request.options.num_ctx, 16384)
  assert.equal(result.provenance.num_ctx, 16384)
  assert.equal(result.provenance.loaded_context_length, 32768)
})

test("a short post-load report retains the actual served response as a failed context trial", async () => {
  const f = fixture([{ models: [] }, { models: [row(16384)] }])
  await assert.rejects(f.provider.structured(request), (error) => {
    assert.match(error.message, /did not report/)
    assert.equal(error.model_artifacts.partial_response_content, '{"status":"ready"}')
    assert.equal(
      error.model_artifacts.partial_response_content_sha256,
      sha256('{"status":"ready"}'),
    )
    assert.equal(error.model_artifacts.context_after.status, "insufficient")
    assert.equal(error.model_artifacts.done, true)
    return true
  })
  assert.equal(f.calls.filter((call) => call.endpoint === "/api/chat").length, 1)
})

test("another loaded model is distinct from the target and an alias of the same digest is not cold", () => {
  const binding = { model, digest, num_ctx: 32768 }
  const other = { name: "other", digest: "b".repeat(64), context_length: 16384 }
  const observation = inspectOllamaLoadedContext({ models: [other] }, binding)
  assert.equal(observation.status, "not_loaded")
  assert.equal(observation.other_loaded_models, 1)
  assert.throws(
    () => inspectOllamaLoadedContext({ models: [{ ...other, digest }] }, binding),
    /another model identity/,
  )
})

test("ambiguous, changed and missing native context identities never become accepted observations", () => {
  const binding = { model, digest, num_ctx: 32768 }
  for (const [models, pattern] of [
    [[row(32768), row(32768)], /Ambiguous/],
    [[row(32768, { digest: "b".repeat(64) })], /digest changed/],
    [[row(undefined)], /explicitly reported/],
    [[row(0)], /explicitly reported/],
  ])
    assert.throws(() => inspectOllamaLoadedContext({ models }, binding), pattern)
})

test("unavailable context API prevents MLX inference instead of reporting context success", async () => {
  const f = fixture([], { psFailure: true })
  await assert.rejects(f.provider.structured(request), (error) => {
    assert.match(error.message, /HTTP 503/)
    assert.equal(error.model_artifacts.request_sent, false)
    assert.equal(error.model_artifacts.context_preflight, undefined)
    return true
  })
  assert.equal(
    f.calls.some((call) => call.endpoint === "/api/chat"),
    false,
  )
})

test("generic GGUF completion preserves its existing wire and provenance shape", async () => {
  const f = fixture([], { format: "gguf" })
  const result = await f.provider.structured(request)
  assert.equal(
    f.calls.some((call) => call.endpoint === "/api/ps"),
    false,
  )
  assert.equal(result.artifacts.context_preflight, undefined)
  assert.equal(result.provenance.loaded_context_length, undefined)
  assert.deepEqual(result.output, { status: "ready" })
})
