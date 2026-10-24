import test from "node:test"
import assert from "node:assert/strict"
import { Ollama } from "../scripts/research/ollama.mjs"

const model = "qwen3-embedding:8b"
const digest = "a".repeat(64)
const metadata = { model, digest, runtime: "test-runtime", capabilities: ["embedding"] }

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function fakeClient(
  embedResponse,
  { installedDigest = digest, afterDigest = installedDigest } = {},
) {
  const calls = []
  let tagReads = 0
  const client = new Ollama({
    fetchImpl: async (url, init) => {
      const pathname = new URL(url).pathname,
        body = init.body === undefined ? undefined : JSON.parse(init.body)
      calls.push({ pathname, init, body })
      if (pathname === "/api/tags") {
        tagReads++
        return response({
          models: [{ name: model, model, digest: tagReads > 1 ? afterDigest : installedDigest }],
        })
      }
      assert.equal(pathname, "/api/embed")
      return response(typeof embedResponse === "function" ? embedResponse(body) : embedResponse)
    },
  })
  return { client, calls }
}

test("embedding uses a pinned local embed batch and observes its installed digest before and after", async () => {
  const { client, calls } = fakeClient({
      model,
      embeddings: [
        [1, 0, 0],
        [0, 1, 0],
      ],
      total_duration: 17,
    }),
    result = await client.embed({
      model,
      inputs: ["first article", "reviewed concept"],
      metadata,
      expected_digest: digest,
      expected_dimensions: 3,
    })
  assert.deepEqual(
    calls.map((call) => call.pathname),
    ["/api/tags", "/api/embed", "/api/tags"],
  )
  assert.deepEqual(calls[1].body, {
    model,
    input: ["first article", "reviewed concept"],
    truncate: false,
    keep_alive: "5m",
  })
  assert.ok(calls.every((call) => call.init.redirect === "error"))
  assert.deepEqual(result.vectors, [
    [1, 0, 0],
    [0, 1, 0],
  ])
  assert.equal(result.digest, digest)
  assert.equal(result.total_duration, 17)
})

test("embedding rejects changed metadata, missing capability, and malformed vectors", async () => {
  const { client, calls } = fakeClient({ model, embeddings: [[0, 0]] })
  await assert.rejects(
    client.embed({ model, inputs: ["query"], metadata, expected_digest: "b".repeat(64) }),
    /capability\/digest/,
  )
  for (const capabilities of [["completion"], "embedding"]) {
    await assert.rejects(
      client.embed({
        model,
        inputs: ["query"],
        metadata: { ...metadata, capabilities },
        expected_digest: digest,
      }),
      /capability\/digest/,
    )
  }
  await assert.rejects(
    client.embed({
      model,
      inputs: ["query"],
      metadata: { ...metadata, endpoint: "http://127.0.0.1:11435" },
      expected_digest: digest,
    }),
    /capability\/digest/,
  )
  assert.equal(calls.length, 0)
  await assert.rejects(
    client.embed({ model, inputs: ["query"], metadata, expected_digest: digest }),
    /Finite, non-zero, dimension-consistent embeddings/,
  )
  assert.equal(calls.filter((call) => call.pathname === "/api/embed").length, 1)
})

test("stale pinned metadata cannot hide a missing or retagged installed embedding model", async () => {
  for (const options of [{ installedDigest: "b".repeat(64) }, { afterDigest: "b".repeat(64) }]) {
    const { client, calls } = fakeClient({ model, embeddings: [[1, 0]] }, options)
    await assert.rejects(
      client.embed({ model, inputs: ["query"], metadata, expected_digest: digest }),
      /capability\/digest changed/,
    )
    assert.equal(
      calls.filter((call) => call.pathname === "/api/embed").length,
      options.installedDigest ? 0 : 1,
    )
  }
  for (const models of [
    [],
    [
      { name: model, digest },
      { model, digest },
    ],
  ]) {
    const client = new Ollama({
      fetchImpl: async (url) => {
        assert.equal(new URL(url).pathname, "/api/tags")
        return response({ models })
      },
    })
    await assert.rejects(
      client.embed({ model, inputs: ["query"], metadata, expected_digest: digest }),
      /digest changed/,
    )
  }
})

test("embedding keeps the 64-input limit and rejects larger batches before network activity", async () => {
  const { client, calls } = fakeClient((body) => ({
      model,
      embeddings: body.input.map(() => [1, 0]),
    })),
    inputs = Array.from({ length: 64 }, (_, i) => `reviewed concept ${i}`),
    result = await client.embed({
      model,
      inputs,
      metadata,
      expected_digest: digest,
      expected_dimensions: 2,
    })
  assert.equal(result.vectors.length, 64)
  assert.equal(calls.filter((call) => call.pathname === "/api/embed").length, 1)
  const priorCalls = calls.length
  await assert.rejects(
    client.embed({ model, inputs: [...inputs, "one more"], metadata, expected_digest: digest }),
    /Bounded local embedding-only/,
  )
  assert.equal(calls.length, priorCalls)
})

test("embedding rejects changed output dimensions, counts, identity, and finite vector shape", async () => {
  for (const body of [
    { model, embeddings: [[1, 0, 0]] },
    {
      model,
      embeddings: [
        [1, 0],
        [0, 1],
      ],
    },
    { model: "another-model", embeddings: [[1, 0]] },
    { model, embeddings: [[null, 1]] },
    { model, embeddings: [[]] },
  ]) {
    const { client } = fakeClient(body)
    await assert.rejects(
      client.embed({
        model,
        inputs: ["query"],
        metadata,
        expected_digest: digest,
        expected_dimensions: 2,
      }),
      /identity\/count mismatch|dimension-consistent/,
    )
  }
  const { client, calls } = fakeClient({ model, embeddings: [[1, 0]] })
  await assert.rejects(
    client.embed({
      model,
      inputs: ["query"],
      metadata,
      expected_digest: digest,
      expected_dimensions: 1,
    }),
    /Bounded/,
  )
  assert.equal(calls.length, 0)
})
