import test from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import { Agent } from "undici"
import { Ollama, modelFailureWithCode } from "../scripts/research/ollama.mjs"

test("local model dispatch preserves each explicit HTTP header and body budget", async () => {
  const seen = []
  const dispatcher = {
    dispatch(options, handler) {
      seen.push({ options, handler })
      return true
    },
  }
  const handler = {}
  const api = new Ollama({
    dispatcher,
    fetchImpl: async (url, options) => {
      assert.equal(options.signal.aborted, false)
      options.dispatcher.dispatch(
        { path: new URL(url).pathname, headersTimeout: 300000, bodyTimeout: 300000 },
        handler,
      )
      return url.endsWith("/chat")
        ? new Response('{"message":{"content":"{}"},"done":true}\n', {
            headers: { "content-type": "application/x-ndjson" },
          })
        : Response.json({ ok: true })
    },
  })
  await api.json("/api/version", undefined, { timeout_ms: 600000 })
  await api.streamedChat({ stream: true }, { timeout_ms: 900000, on_progress: () => {} })
  await api.json("/api/version", undefined, { timeout_ms: 25 })
  assert.deepEqual(
    seen.map(({ options }) => [options.headersTimeout, options.bodyTimeout]),
    [
      [600000, 600000],
      [900000, 900000],
      [25, 25],
    ],
  )
  assert.ok(seen.every((value) => value.handler === handler))
  assert.deepEqual(
    seen.map(({ options }) => options.path),
    ["/api/version", "/api/chat", "/api/version"],
  )
  const cause = Object.assign(new Error("Headers Timeout Error"), {
    code: "UND_ERR_HEADERS_TIMEOUT",
  })
  const wrapped = modelFailureWithCode(
    new TypeError("fetch failed", { cause }),
    "MODEL_ATTEMPT_FAILED",
  )
  assert.equal(wrapped.code, "MODEL_CALL_TIMEOUT")
  assert.equal(wrapped.native_error.cause.code, "UND_ERR_HEADERS_TIMEOUT")
  assert.equal(wrapped.native_error.cause.message, "Headers Timeout Error")
})

test("native loopback fetch receives delayed headers and still aborts at its explicit deadline", async (t) => {
  const calls = []
  const server = http.createServer((req, res) => {
    calls.push(req.url)
    req.resume()
    setTimeout(() => {
      if (res.destroyed) return
      if (req.url === "/api/chat") {
        res.writeHead(200, { "content-type": "application/x-ndjson" })
        res.end('{"message":{"content":"{}"},"done":true}\n')
      } else {
        res.writeHead(200, { "content-type": "application/json" })
        res.end('{"ok":true}')
      }
    }, 80)
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const agent = new Agent({ headersTimeout: 1, bodyTimeout: 1 })
  const timers = []
  const dispatcher = {
    dispatch(options, handler) {
      timers.push([options.headersTimeout, options.bodyTimeout])
      return agent.dispatch(options, handler)
    },
  }
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    await agent.close()
  })
  const api = new Ollama({ url: `http://127.0.0.1:${server.address().port}`, dispatcher })
  assert.deepEqual(await api.json("/api/version", undefined, { timeout_ms: 600000 }), { ok: true })
  await api.streamedChat({ stream: true }, { timeout_ms: 900000, on_progress: () => {} })
  await assert.rejects(
    api.json("/api/version", undefined, { timeout_ms: 20 }),
    (e) => e.name === "TimeoutError",
  )
  assert.deepEqual(timers, [
    [600000, 600000],
    [900000, 900000],
    [20, 20],
  ])
  assert.deepEqual(calls, ["/api/version", "/api/chat", "/api/version"])
})
