import test from "node:test"
import assert from "node:assert/strict"
import { sha256 } from "../scripts/research/contracts.mjs"
import { Ollama } from "../scripts/research/ollama.mjs"

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["status"],
  properties: { status: { type: "string", enum: ["ready"] } },
}
const request = {
  model: "local",
  think: false,
  messages: [{ role: "user", content: "Return the stored status using the exact schema." }],
  schema,
}
const metadata = (url) =>
  url.endsWith("/show")
    ? { capabilities: ["completion"], thinking: { values: [false] } }
    : url.endsWith("/tags")
      ? { models: [{ name: "local", digest: "pinned" }] }
      : { version: "test" }

test("malformed, schema-invalid and unexpected local outputs never become usable articles", async () => {
  for (const [response, pattern] of [
    [{ done: true, message: { content: '{"status":' } }, /invalid JSON/],
    [{ done: true, message: { content: '{"status":"invented"}' } }, /schema|enum/i],
    [{ done: true, message: { content: "{}" } }, /Missing field at \$\.status/],
    [{ done: false, message: { content: '{"status":"ready"}' } }, /Incomplete/],
    [{ done: true, message: { content: '{"status":"ready"}', tool_calls: [{}] } }, /Incomplete/],
  ]) {
    const api = new Ollama({
      fetchImpl: async (url) => Response.json(url.endsWith("/chat") ? response : metadata(url)),
    })
    await assert.rejects(api.structured(request), pattern)
  }
})

test("local transport failures and abort budgets remain explicit failures", async () => {
  const unavailable = new Ollama({
    fetchImpl: async () => {
      throw new TypeError("endpoint unavailable")
    },
  })
  await assert.rejects(unavailable.structured(request), /endpoint unavailable/)
  const httpError = new Ollama({ fetchImpl: async () => new Response("", { status: 503 }) })
  await assert.rejects(httpError.structured(request), /HTTP 503/)
  const noModel = new Ollama({
    fetchImpl: async (url) => Response.json(url.endsWith("/tags") ? { models: [] } : metadata(url)),
  })
  await assert.rejects(noModel.structured(request), /not installed/)
  // A live timer keeps this fixture alive while AbortSignal's timer fires.
  const stalled = new Ollama({
    timeout_ms: 20,
    fetchImpl: async (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        const keepAlive = setTimeout(() => reject(Error("abort did not fire")), 1000)
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(keepAlive)
            reject(signal.reason)
          },
          { once: true },
        )
      }),
  })
  await assert.rejects(stalled.structured(request), { name: "TimeoutError" })
})

test("non-stream completion failures retain original response and exact request for diagnosis", async () => {
  for (const response of [
    { done: true, done_reason: "length", message: { content: '{"status":' } },
    { done: true, done_reason: "stop", message: { content: "invalid JSON" } },
  ]) {
    const api = new Ollama({
      fetchImpl: async (url) => Response.json(url.endsWith("/chat") ? response : metadata(url)),
    })
    await assert.rejects(api.structured(request), (error) => {
      const artifacts = error.model_artifacts
      assert.equal(artifacts.request.stream, false)
      assert.equal(artifacts.request_sha256, sha256(JSON.stringify(artifacts.request)))
      assert.equal(artifacts.partial_response_content, response.message.content)
      assert.equal(artifacts.partial_response_content_sha256, sha256(response.message.content))
      assert.equal(artifacts.done_reason, response.done_reason)
      assert.equal(artifacts.done, true)
      assert.equal(artifacts.tool_calls_count, 0)
      assert.equal(artifacts.progress, undefined)
      return true
    })
  }
})
