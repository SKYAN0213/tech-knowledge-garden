import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256 } from "../scripts/research/contracts.mjs"
import {
  assertDeploymentProof,
  publicReadbackPlan,
  verifyPublicReadback,
} from "../scripts/research/public-readback.mjs"

function fixture(t) {
  const repository = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "public-readback-")))
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }))
  const root = path.join(repository, ".local/research")
  const write = (file, data) => {
    fs.mkdirSync(path.dirname(path.join(repository, file)), { recursive: true })
    fs.writeFileSync(path.join(repository, file), data)
  }
  const commit = "a".repeat(40)
  const deployment = {
    status: "completed",
    conclusion: "success",
    headSha: commit,
    url: "https://github.com/SKYAN0213/tech-knowledge-garden/actions/runs/123",
    jobs: ["build", "deploy"].map((name) => ({ name, status: "completed", conclusion: "success" })),
  }
  const authoring = [
    "Editions/2026/01/issue.md",
    "Knowledge/AI Systems/Term.md",
    "Signals/issue.md",
  ]
  for (const file of authoring) write("vault/" + file, "approved:" + file)
  write(
    ".local/site-notes.json",
    JSON.stringify([{ path: "Knowledge/AI Systems/Term", slug: "knowledge/ai-systems/term" }]),
  )
  const article = "1".repeat(16)
  const preview = {
    schema: "private-reader-preview/v1",
    run_id: "preview",
    editions: [{ path: authoring[0], sha256: sha256(Buffer.from("approved:" + authoring[0])) }],
    knowledge: authoring
      .slice(1)
      .map((file) => ({ path: file, sha256: sha256(Buffer.from("approved:" + file)) })),
    consistency: {
      articles: [
        {
          event_id: article,
          appearances: [
            { html: "public/briefings/2026/01/issue.html", digest: "digest/2026/01/issue.md" },
          ],
        },
      ],
    },
  }
  write(".local/research/runs/preview/preview-manifest.json", JSON.stringify(preview))
  for (const file of [
    "drive-sync.json",
    "briefing.xml",
    "reader-index.json",
    "knowledge-graph.json",
    "static/contentIndex.json",
    "reader.css",
    "knowledge/ai-systems/term.html",
    "news/" + article + ".html",
    "briefings/2026/01/issue.html",
  ])
    write("public/" + file, "public:" + file)
  write("public/reader.js", 'import("./chunks/connection-map-AAA111.js");')
  write("public/chunks/connection-map-AAA111.js", "reviewed map module")
  write("vault/News/" + article + ".md", "reviewed article")
  write("digest/2026/01/issue.md", "reviewed digest")
  const options = { root, run: "verify", previewRun: "preview", repository, commit, deployment }
  const plan = publicReadbackPlan({ repository, preview, commit, deployment })
  let calls = 0
  const fetchImpl = async (url, config) => {
    calls++
    assert.equal(config.redirect, "error")
    const row = plan.files.find((x) => x.url === url)
    const file = row?.local || plan.reader_module.local
    return new Response(fs.readFileSync(path.join(repository, file)))
  }
  return { ...options, options, plan, preview, write, fetchImpl, calls: () => calls }
}

test("public readback checks all channels and resumes without duplicate network reads", async (t) => {
  const f = fixture(t)
  const result = await verifyPublicReadback({ ...f.options, fetchImpl: f.fetchImpl })
  assert.equal(result.status, "public_artifact_bytes_verified")
  assert.equal(result.files.length, f.plan.files.length)
  assert.equal(result.drive_verified, false)
  assert.equal(result.browser_verified, false)
  assert.equal(result.approval_created, false)
  assert.equal(result.public_written, false)
  assert.ok(result.files.some((x) => x.path.startsWith("vault/Signals/")))
  assert.ok(!result.files.some((x) => x.path.startsWith("signals/") && x.kind === "web"))
  const count = f.calls()
  const resumed = await verifyPublicReadback({ ...f.options, fetchImpl: f.fetchImpl })
  assert.equal(f.calls(), count)
  assert.deepEqual(result, resumed)
})

test("mismatch retains exact remote bytes and never records a successful verification", async (t) => {
  const f = fixture(t)
  const fetchImpl = (url, config) =>
    url.endsWith("briefing.xml")
      ? Promise.resolve(new Response("old RSS"))
      : f.fetchImpl(url, config)
  await assert.rejects(verifyPublicReadback({ ...f.options, fetchImpl }), /differ from the pinned/)
  const receipt = JSON.parse(
    fs.readFileSync(path.join(f.root, "runs/verify/public-readback/receipt.json")),
  )
  assert.equal(receipt.verified, false)
  assert.equal(receipt.status, "public_artifact_mismatch")
  const index = f.plan.files.findIndex((x) => x.path === "briefing.xml")
  assert.equal(
    fs.readFileSync(path.join(f.root, `runs/verify/public-readback/files/${index}.bin`), "utf8"),
    "old RSS",
  )
})

test("network failure resumes only missing files and preserves completed observations", async (t) => {
  const f = fixture(t)
  let failed = false
  const fetchImpl = (url, config) => {
    if (url.endsWith("reader.css") && !failed) {
      failed = true
      return Promise.resolve(new Response("unavailable", { status: 503 }))
    }
    return f.fetchImpl(url, config)
  }
  await assert.rejects(verifyPublicReadback({ ...f.options, fetchImpl }), /incomplete/)
  const count = f.calls()
  const result = await verifyPublicReadback({ ...f.options, fetchImpl })
  assert.equal(result.verified, true)
  assert.equal(f.calls() - count, 2) // Missing CSS and the dependent map module.
})

test("wrong commit, pending jobs, failed deployment and other repositories are rejected before reads", (t) => {
  const f = fixture(t)
  for (const change of [
    { headSha: "b".repeat(40) },
    { status: "in_progress" },
    { conclusion: "failure" },
    { jobs: [{ name: "build", status: "completed", conclusion: "success" }] },
    { url: "https://github.com/other/repo/actions/runs/123" },
  ])
    assert.throws(
      () => assertDeploymentProof({ ...f.deployment, ...change }, f.commit),
      /exact commit/,
    )
})

test("authoring drift, traversal and private publication paths cannot enter the plan", (t) => {
  const f = fixture(t)
  for (const bad of ["../outside.md", "Research/private.md", "Knowledge/.secret.md"]) {
    const preview = structuredClone(f.preview)
    preview.knowledge[0].path = bad
    assert.throws(() => publicReadbackPlan({ ...f, preview }))
  }
  f.write("vault/" + f.preview.editions[0].path, "changed after approval")
  assert.throws(() => publicReadbackPlan(f), /Approved preview authoring bytes changed/)
})

test("bundle name may differ only when the reader and map module bytes remain equivalent", async (t) => {
  const f = fixture(t)
  const fetchImpl = (url, config) =>
    url.endsWith("reader.js")
      ? Promise.resolve(new Response('import("./chunks/connection-map-BBB222.js");'))
      : f.fetchImpl(url, config)
  const result = await verifyPublicReadback({ ...f.options, fetchImpl })
  assert.equal(result.verified, true)
  assert.equal(result.reader_equivalent, true)
  assert.equal(result.files.find((x) => x.path === "reader.js").matches_local, false)
  assert.equal(result.connection_map_module.path, "chunks/connection-map-BBB222.js")
})

test("changed inputs and corrupt cached bytes reject resume", async (t) => {
  const f = fixture(t)
  await verifyPublicReadback({ ...f.options, fetchImpl: f.fetchImpl })
  f.write("public/reader.css", "new CSS")
  await assert.rejects(
    verifyPublicReadback({ ...f.options, fetchImpl: f.fetchImpl }),
    /inputs changed/,
  )
  f.write("public/reader.css", "public:reader.css")
  fs.writeFileSync(path.join(f.root, "runs/verify/public-readback/files/0.bin"), "corrupt")
  await assert.rejects(verifyPublicReadback({ ...f.options, fetchImpl: f.fetchImpl }), /incomplete/)
  assert.equal(f.calls(), f.plan.files.length + 1)
})

test("response byte budgets fail closed and never save a partial response as complete", async (t) => {
  const f = fixture(t)
  const fetchImpl = (url, config) =>
    url.endsWith("reader.css")
      ? Promise.resolve(
          new Response("data", { headers: { "content-length": String(16 * 1024 * 1024 + 1) } }),
        )
      : f.fetchImpl(url, config)
  await assert.rejects(verifyPublicReadback({ ...f.options, fetchImpl }), /incomplete/)
  const index = f.plan.files.findIndex((x) => x.path === "reader.css")
  assert.equal(
    fs.existsSync(path.join(f.root, `runs/verify/public-readback/files/${index}.bin`)),
    false,
  )
})

test("stored equality flags and in-flight authoring changes cannot turn mismatches into success", async (t) => {
  const f = fixture(t)
  const fetchImpl = async (url, config) => {
    const result = await f.fetchImpl(url, config)
    if (url.endsWith("reader.css"))
      f.write("vault/" + f.preview.editions[0].path, "changed during readback")
    return result
  }
  await assert.rejects(
    verifyPublicReadback({ ...f.options, fetchImpl }),
    /Approved preview authoring bytes changed/,
  )
  f.write("vault/" + f.preview.editions[0].path, "approved:" + f.preview.editions[0].path)
  const file = path.join(f.root, "runs/verify/public-readback/files/0.json")
  const saved = JSON.parse(fs.readFileSync(file))
  saved.matches_local = false
  fs.writeFileSync(file, JSON.stringify(saved))
  await assert.rejects(verifyPublicReadback({ ...f.options, fetchImpl: f.fetchImpl }), /incomplete/)
  assert.equal(fs.existsSync(path.join(f.root, "runs/verify/public-readback/receipt.json")), false)
})
