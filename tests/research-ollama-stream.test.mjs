import test from "node:test"
import assert from "node:assert/strict"
import { Ollama } from "../scripts/research/ollama.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"

const schema = {
  type: "object",
  required: ["value"],
  additionalProperties: false,
  properties: { value: { type: "string" } },
}
const request = { model: "local", think: false, messages: [], schema }
const metadata = (url) =>
  url.endsWith("/show")
    ? { capabilities: ["completion"], thinking: { values: [false] } }
    : url.endsWith("/tags")
      ? { models: [{ name: "local", digest: "pinned" }] }
      : { version: "test" }
const frame = (content, done = false, extra = {}) =>
  JSON.stringify({ message: { content }, done, ...extra }) + "\n"
const ndjson = (text) => new Response(text, { headers: { "content-type": "application/x-ndjson" } })
const apiFor = (response) =>
  new Ollama({
    fetchImpl: async (url) => (url.endsWith("/chat") ? response : Response.json(metadata(url))),
  })

test("fragmented UTF-8 streams retain exact content and final timing statistics", async () => {
  const content = '{"value":"한국어"}',
    progress = []
  const bytes = new TextEncoder().encode(
    frame(content.slice(0, 11)) +
      frame(content.slice(11)) +
      frame("", true, { done_reason: "stop", eval_count: 12 }),
  )
  let index = 0
  const response = new Response(
    new ReadableStream({
      pull(controller) {
        if (index === bytes.length) controller.close()
        else controller.enqueue(bytes.slice(index, ++index))
      },
    }),
    { headers: { "content-type": "application/x-ndjson" } },
  )
  const result = await apiFor(response).structured({
    ...request,
    on_progress: (p) => progress.push(p),
  })
  assert.deepEqual(result.output, { value: "한국어" })
  assert.equal(result.artifacts.response_content, content)
  assert.equal(result.artifacts.response_content_sha256, sha256(content))
  assert.equal(result.artifacts.request.stream, true)
  assert.equal(result.provenance.eval_count, 12)
  assert.ok(progress.some((p) => p.status === "generating"))
  assert.equal(progress.at(-1).status, "received")
})

test("truncated, errored, extra, tool-call and invalid-schema streams remain failures", async () => {
  for (const [text, pattern] of [
    [frame('{"value":"partial'), /Incomplete model stream/],
    [frame('{"value":"x"}') + JSON.stringify({ error: "model unavailable" }), /unavailable/],
    [frame('{"value":"x"}', true) + frame(""), /after model completion/],
    [JSON.stringify({ done: false, message: { tool_calls: [{}] } }), /unexpected/],
    [frame('{"value":123}', true), /Invalid type at \$\.value/],
    [frame('{"value":"x"}', true, { done_reason: "length" }), /Incomplete/],
  ]) {
    let failed
    const progress = []
    await assert.rejects(
      apiFor(ndjson(text)).structured({ ...request, on_progress: (p) => progress.push(p) }),
      (e) => {
        failed = e
        return pattern.test(e.message)
      },
    )
    assert.ok(failed.model_artifacts)
    assert.equal(progress.at(-1).status, "failed")
    assert.equal(failed.model_artifacts.progress.status, "failed")
    assert.equal(
      failed.model_artifacts.partial_response_content_sha256,
      sha256(failed.model_artifacts.partial_response_content),
    )
  }
})

test("a stalled stream retains partial output and a fixed deadline", async () => {
  let keepAlive
  const api = new Ollama({
    fetchImpl: async (url, { signal }) => {
      if (!url.endsWith("/chat")) return Response.json(metadata(url))
      keepAlive = setTimeout(() => {}, 1000)
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(frame('{"value":"partial')))
            signal.addEventListener(
              "abort",
              () => {
                clearTimeout(keepAlive)
                controller.error(signal.reason)
              },
              { once: true },
            )
          },
        }),
        { headers: { "content-type": "application/x-ndjson" } },
      )
    },
  })
  const progress = []
  await assert.rejects(
    api.structured({ ...request, timeout_ms: 40, on_progress: (p) => progress.push(p) }),
    (error) => {
      assert.equal(error.name, "TimeoutError")
      assert.equal(error.model_artifacts.partial_response_content, '{"value":"partial')
      assert.equal(error.model_artifacts.done, false)
      return true
    },
  )
  assert.equal(progress.at(-1).status, "failed")
})
