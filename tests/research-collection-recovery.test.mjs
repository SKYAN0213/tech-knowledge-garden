import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { registry } from "../scripts/research/discovery.mjs"
import { collectionBasis, collectionRoute } from "../scripts/research/scan-basis.mjs"
import { RunState, atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { storeParseArtifact } from "../scripts/research/parser.mjs"
import { scanBoundedRSSRoute } from "../scripts/research/rss-scan.mjs"
import { verifyStoredListScan } from "../scripts/research/scan-evidence.mjs"
import {
  createRecoverySourceReuse,
  preserveRecoverySourceReuse,
  readRecoverySource,
} from "../scripts/research/source-run-recovery.mjs"
import { recoverCollection } from "../scripts/research/collection-recovery.mjs"
import { reconcilePublicationDay } from "../scripts/research/publication-date-reconciliation.mjs"
import { module as collection } from "../scripts/research/modules/collection.mjs"
import { validateArguments } from "../scripts/research/modules/contracts.mjs"

async function fixture(t, { mismatch = false, unreadable = false } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "collection-recovery-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const config = (name) => JSON.parse(fs.readFileSync(`data/research-${name}.json`))
  const acquisition = config("acquisition")
  const channel = {
    ...collectionRoute(
      registry(config("source-channels"), config("watchlist"), acquisition).find(
        (r) => r.channel_id === "nvidia-press-releases",
      ),
    ),
    detail_batch_size: 1,
  }
  const basis = collectionBasis(channel, acquisition.article_profiles)
  const window = { since: "2026-10-10", until: "2026-10-17" }
  const docs = new Map(),
    requested = [],
    parsed = []
  function doc(url, text) {
    const bytes = Buffer.from(text),
      id = sourceId(url),
      digest = sha256(bytes)
    const document = {
      source_id: id,
      source_version_id: `${id}:${digest}`,
      original_url: url,
      final_url: url,
      body_path: `documents/${id}/${digest}/body.bin`,
      body_sha256: digest,
      observed_at: "2026-10-16T00:00:00Z",
      fetch_status: "captured",
      policy_status: "checked",
      policy: { allowed: true },
    }
    atomicWrite(root, document.body_path, bytes)
    docs.set(url, document)
    return document
  }
  doc(
    channel.url,
    `<rss version="2.0"><channel><title>${channel.listing_profile.feed_title}</title><description>Official</description><link>https://nvidianews.nvidia.com</link>${["one", "two", "three", "older"].map((slug) => `<item><title>Article ${slug}</title><link>https://nvidianews.nvidia.com/news/${slug}</link><guid>https://nvidianews.nvidia.com/news/${slug}</guid><pubDate>${slug === "older" ? "Fri, 09" : "Wed, 14"} Oct 2026 12:00:00 GMT</pubDate></item>`).join("")}</channel></rss>`,
  )
  const fetchPolicy = async (_r, _f, url) => {
    requested.push(url)
    return docs.get(url) || doc(url, "Original article " + url.split("/").at(-1))
  }
  const parse = async (_r, d) => {
    parsed.push(d.original_url)
    const slug = d.original_url.split("/").at(-1),
      day = mismatch && slug === "one" ? "2026-10-13" : "2026-10-14"
    const id = sha256(JSON.stringify([d.source_version_id, "article-parser"]))
    return storeParseArtifact(root, {
      schema_version: "source-parse/v1",
      status: unreadable && slug === "one" ? "partial" : "extracted",
      source_id: d.source_id,
      source_version_id: d.source_version_id,
      parse_id: id,
      title: "Article " + slug,
      dates: {
        published_at: day,
        observed_at: d.observed_at,
        profile_status: "matched",
        basis: { dom_path: "/html/body/time", text: day },
      },
      blocks:
        unreadable && slug === "one"
          ? []
          : [
              {
                block_id: id + ":block-0001",
                text: "Original " + slug,
                locator: { text_hash: sha256("Original " + slug) },
              },
            ],
      links: [],
      quality: { required_fields_present: !(unreadable && slug === "one") },
    })
  }
  const scan = async (v) => {
    const input = {
      schema: "research-list-run-input/v2",
      channel_id: channel.channel_id,
      since: window.since,
      until_exclusive: window.until,
      reuse_listing_run: null,
      collection_basis: basis,
      policy_recheck_limit: 0,
      ...(v["recovery-source-run"] ? { recovery_source_run: v["recovery-source-run"] } : {}),
    }
    const run = new RunState(root, v.run, input)
    atomicWrite(root, `runs/${v.run}/collection-input.json`, input)
    await run.stage("collection-basis", basis, () => basis)
    const reuse = v["recovery-source-run"]
      ? createRecoverySourceReuse(root, v["recovery-source-run"], channel, basis, window, {
          fetchPolicy,
          parse,
        })
      : null
    const result = await scanBoundedRSSRoute(
      root,
      run,
      {},
      channel,
      acquisition.article_profiles,
      window,
      {
        fetchPolicy: reuse?.fetchPolicy || fetchPolicy,
        parseArticle: reuse?.parse || parse,
      },
    )
    if (reuse) preserveRecoverySourceReuse(root, v.run, reuse)
    for (const [name, value] of Object.entries({
      "list-scan.json": result.summary,
      "documents.json": result.documents,
      "parses.json": result.parses,
      "candidates.json": result.candidates,
      "list-pages.json": result.indexDocuments,
    }))
      atomicWrite(root, `runs/${v.run}/${name}`, value)
    return result
  }
  const initial = await scan({ run: "initial" })
  const source = readRecoverySource(root, "initial")
  const report = {
    schema: "research-collection-report/v1",
    routes: [
      {
        channel_id: channel.channel_id,
        windows: [
          {
            since: window.since,
            until_exclusive: window.until,
            status: "incomplete",
            attempts: [{ run_id: "initial", status: "incomplete" }],
          },
        ],
      },
    ],
    evidence: source.reference.evidence,
  }
  atomicWrite(root, "report.json", report)
  return {
    root,
    channel,
    basis,
    window,
    docs,
    requested,
    parsed,
    scan,
    initial,
    reportPath: "report.json",
    reportSha256: sha256(fs.readFileSync(path.join(root, "report.json"))),
  }
}

test("bounded recovery continues missing details without repeating requests, parses, candidates or original observations", async (t) => {
  const f = await fixture(t)
  assert.equal(f.initial.summary.status, "incomplete")
  assert.equal(f.initial.candidates.length, 1)
  assert.equal(f.initial.summary.details.filter((d) => d.status === "deferred_by_budget").length, 2)
  const original = fs.readFileSync(path.join(f.root, "runs/initial/list-scan.json"))
  const first = await f.scan({ run: "repair1", "recovery-source-run": "initial" })
  assert.equal(first.candidates.length, 2)
  const second = await f.scan({ run: "repair2", "recovery-source-run": "repair1" })
  assert.equal(second.summary.status, "window_scanned")
  assert.equal(second.candidates.length, 3)
  assert.equal(new Set(second.candidates.map((c) => c.key)).size, 3)
  assert.equal(second.summary.observed_at, f.initial.summary.observed_at)
  assert.equal(f.requested.length, 4)
  assert.equal(f.parsed.length, 3)
  assert.deepEqual(fs.readFileSync(path.join(f.root, "runs/initial/list-scan.json")), original)
  verifyStoredListScan(f.root, second, {
    channel_id: f.channel.channel_id,
    since: f.window.since,
    until_exclusive: f.window.until,
  })
  const receipt = readJSON(f.root, "runs/repair2/source-recovery-reuse.json")
  assert.equal(receipt.reused_parse_ids.length, 2)
  assert.equal(receipt.candidate_approved, false)
})

test("legacy daily reports acquire a new authenticated checkpoint handoff without rewriting the old report", async (t) => {
  const f = await fixture(t)
  const legacy = readJSON(f.root, f.reportPath)
  legacy.evidence = legacy.evidence.filter((p) => p.path === "runs/initial/list-scan.json")
  atomicWrite(f.root, "legacy-report.json", legacy)
  const bytes = fs.readFileSync(path.join(f.root, "legacy-report.json"))
  const options = {
    ...f,
    repo: process.cwd(),
    runId: "legacy-recovery",
    mode: "plan-only",
    reportPath: "legacy-report.json",
    reportSha256: sha256(bytes),
  }
  const plan = await recoverCollection(options)
  assert.equal(
    plan.targets[0].source_evidence_scope,
    "report_plus_authenticated_native_checkpoints",
  )
  assert.ok(
    plan.targets[0].source_reference.evidence.some((p) => p.path === "runs/initial/state.json"),
  )
  assert.deepEqual(fs.readFileSync(path.join(f.root, "legacy-report.json")), bytes)
  const doc = f.docs.get(f.channel.url)
  fs.appendFileSync(path.join(f.root, doc.body_path), "tampered")
  await assert.rejects(
    recoverCollection({ ...options, runId: "legacy-corrupted" }),
    /hash mismatch/,
  )
})

test("report recovery plans only incomplete windows and resume never repeats a completed native scan", async (t) => {
  const f = await fixture(t)
  const options = { ...f, repo: process.cwd(), runId: "recover", publishReport: false }
  const plan = await recoverCollection({ ...options, mode: "plan-only" })
  assert.equal(plan.targets.length, 1)
  let calls = 0
  const scan = (v) => {
    calls++
    return f.scan(v)
  }
  assert.equal((await recoverCollection({ ...options, mode: "execute", scan })).counts.completed, 0)
  assert.equal((await recoverCollection({ ...options, mode: "resume", scan })).counts.completed, 1)
  assert.equal((await recoverCollection({ ...options, mode: "resume", scan })).counts.executed, 0)
  assert.equal(calls, 2)
  await assert.rejects(
    recoverCollection({ ...options, mode: "execute", channels: ["nasa-technology-rss"] }),
    /incomplete/,
  )
  fs.appendFileSync(path.join(f.root, "report.json"), " ")
  await assert.rejects(recoverCollection({ ...options, mode: "resume" }), /report changed/)
})

test("detail budget continuation does not consume the failure retry allowance", async (t) => {
  const f = await fixture(t)
  const options = {
    ...f,
    repo: process.cwd(),
    runId: "budget-allowance",
    publishReport: false,
    maxAttempts: 1,
  }
  const before = f.requested.length
  const first = await recoverCollection({ ...options, mode: "execute" })
  assert.equal(first.counts.completed, 0)
  const second = await recoverCollection({ ...options, mode: "resume" })
  assert.equal(second.counts.completed, 1)
  assert.equal(second.attempts.length, 2)
  assert.equal(f.requested.length - before, 2)
  assert.equal(new Set(f.requested).size, f.requested.length)
})

test("raw recovery accepts repaired selectors while rejecting changed checkpoints, tampered originals and different windows", async (t) => {
  const f = await fixture(t)
  const repairBasis = { ...f.basis, route_sha256: sha256("new-selector") }
  assert.equal(
    createRecoverySourceReuse(f.root, "initial", f.channel, repairBasis, f.window).available.size,
    2,
  )
  assert.throws(
    () =>
      createRecoverySourceReuse(f.root, "initial", f.channel, repairBasis, {
        ...f.window,
        until: "2026-10-18",
      }),
    /same route and window/,
  )
  const doc = f.docs.get(f.channel.url)
  fs.appendFileSync(path.join(f.root, doc.body_path), "tampered")
  assert.throws(() => readRecoverySource(f.root, "initial"), /hash mismatch/)
})

test("a storage wait preserves the native attempt and explicit payload request for resume", async (t) => {
  const f = await fixture(t),
    options = { ...f, repo: process.cwd(), runId: "storage-wait", publishReport: false }
  const result = await recoverCollection({
    ...options,
    mode: "execute",
    scan: async () => {
      throw Object.assign(Error("Exact stored payload required"), {
        code: "STORAGE_PENDING",
        storage_request: { path: "documents/missing/body.bin" },
      })
    },
  })
  assert.equal(result.status, "partial")
  assert.equal(result.attempts[0].status, "running")
  assert.equal(result.attempts[0].error.code, "STORAGE_PENDING")
  assert.equal(result.attempts[0].error.storage_request.path, "documents/missing/body.bin")
  const resumed = await recoverCollection({ ...options, mode: "resume" })
  assert.equal(resumed.attempts.length, 1)
  assert.equal(resumed.attempts[0].run_id, result.attempts[0].run_id)
  assert.equal(resumed.attempts[0].error, undefined)
})

test("NVIDIA original publication dates retain both independent dates and remain within the observed window", async (t) => {
  const f = await fixture(t, { mismatch: true })
  const candidate = f.initial.candidates[0]
  assert.equal(candidate.source_published_at, "2026-10-13")
  assert.equal(candidate.publication_date_reconciliation.listed_at, "2026-10-14")
  const parse = f.initial.parses.find((p) => p.parse_id === candidate.article_parse_id)
  const link = {
    published_at: "2026-10-14",
    listing_source_version_id: "feed:v1",
    listing_parse_id: "feed-parse",
  }
  for (const [article, window, policy] of [
    [
      { ...parse, dates: { ...parse.dates, published_at: "2026-10-15" } },
      f.window,
      "explicit-original-within-window",
    ],
    [parse, { since: "2026-10-14", until: "2026-10-17" }, "explicit-original-within-window"],
    [parse, f.window, undefined],
    [
      { ...parse, dates: { ...parse.dates, basis: null } },
      f.window,
      "explicit-original-within-window",
    ],
  ])
    assert.equal(reconcilePublicationDay(link, article, window, policy), null)
  await f.scan({ run: "more", "recovery-source-run": "initial" })
  const result = await f.scan({ run: "finished", "recovery-source-run": "more" })
  verifyStoredListScan(f.root, result, {
    channel_id: f.channel.channel_id,
    since: f.window.since,
    until_exclusive: f.window.until,
  })
  result.candidates[0].publication_date_reconciliation.listed_at = "2026-10-15"
  assert.throws(
    () =>
      verifyStoredListScan(f.root, result, {
        channel_id: f.channel.channel_id,
        since: f.window.since,
        until_exclusive: f.window.until,
      }),
    /reconciliation/,
  )
})

test("collection recovery is available through the existing MCP module with bounded inputs", () => {
  assert.equal(typeof collection.operations.recover.run, "function")
  const ctx = { root: "/private/research" }
  assert.throws(
    () =>
      validateArguments(
        { run_id: "recovery", mode: "execute", max_attempts: 999 },
        collection.operations.recover.inputSchema,
        ctx,
      ),
    /bound|maximum/,
  )
  assert.throws(
    () =>
      validateArguments(
        { run_id: "recovery", mode: "execute", report_path: "../escape" },
        collection.operations.recover.inputSchema,
        ctx,
      ),
    /escapes/,
  )
})

test("an unfinished native run retains hash-bound captured checkpoints across a code repair without inventing coverage", async (t) => {
  const f = await fixture(t),
    dir = path.join(f.root, "runs/checkpoints")
  fs.cpSync(path.join(f.root, "runs/initial"), dir, { recursive: true })
  const state = readJSON(f.root, "runs/checkpoints/state.json")
  state.run_id = "checkpoints"
  for (const s of Object.values(state.stages))
    if (s.result_path) s.result_path = s.result_path.replace("runs/initial/", "runs/checkpoints/")
  atomicWrite(f.root, "runs/checkpoints/state.json", state)
  for (const name of [
    "list-scan.json",
    "documents.json",
    "parses.json",
    "candidates.json",
    "list-pages.json",
  ])
    fs.unlinkSync(path.join(dir, name))
  const native = new RunState(
    f.root,
    "checkpoints",
    readJSON(f.root, "runs/checkpoints/collection-input.json"),
  )
  await assert.rejects(
    native.stage("parse-failure", {}, () => {
      throw Error("Parser interrupted")
    }),
    /interrupted/,
  )
  await assert.rejects(
    native.stage("storage-pending", {}, () => {
      throw Object.assign(Error("Stored payload required"), {
        code: "STORAGE_PENDING",
        storage_request: { path: "documents/missing/body.bin" },
      })
    }),
    { code: "STORAGE_PENDING" },
  )
  const saved = readRecoverySource(f.root, "checkpoints")
  assert.equal(saved.reference.incomplete_checkpoints, true)
  assert.equal(saved.summary.status, "incomplete")
  assert.equal(saved.documents.length, 2)
  const repaired = await f.scan({ run: "after-fix", "recovery-source-run": "checkpoints" })
  assert.equal(repaired.candidates.length, 2)
  assert.equal(fs.existsSync(path.join(dir, "list-scan.json")), false)
  const plan = await recoverCollection({
    ...f,
    runId: "checkpoint-plan",
    mode: "plan-only",
    sourceRuns: { "nvidia-press-releases": "checkpoints" },
  })
  assert.equal(plan.targets[0].source_run, "checkpoints")
  assert.equal(plan.targets[0].report_source_run, "initial")
  atomicWrite(f.root, "locks/run-checkpoints.json", {
    owner: "live-fixture-owner",
    pid: process.pid,
  })
  assert.throws(() => readRecoverySource(f.root, "checkpoints"), /native run owner/)
  fs.unlinkSync(path.join(f.root, "locks/run-checkpoints.json"))
  atomicWrite(f.root, "runs/checkpoints/collection-input.json", {
    ...readJSON(f.root, "runs/checkpoints/collection-input.json"),
    channel_id: "wrong",
  })
  assert.throws(() => readRecoverySource(f.root, "checkpoints"), /input|window/)
})

test("one unreadable article does not block later detail batches or repeat an identical partial parse", async (t) => {
  const f = await fixture(t, { unreadable: true }),
    options = { ...f, runId: "mixed", publishReport: false }
  const first = await recoverCollection({ ...options, mode: "execute" })
  assert.equal(first.attempts.at(-1).continuable, true)
  const next = await recoverCollection({ ...options, mode: "resume" })
  assert.equal(next.attempts.at(-1).candidate_count, 2)
  assert.equal(next.attempts.at(-1).deferred_details, 0)
  assert.equal(next.status, "partial")
  assert.equal(f.parsed.length, 3)
})

test("a failed parser checkpoint remains explicit without breaking report creation for settled observations", async (t) => {
  const f = await fixture(t)
  const result = await recoverCollection({
    ...f,
    runId: "parser-failure",
    mode: "execute",
    scan: async (v) => {
      const scan = await f.scan(v),
        input = readJSON(f.root, `runs/${v.run}/collection-input.json`)
      const native = new RunState(f.root, v.run, input)
      await assert.rejects(
        native.stage("listing-parser-failure", {}, () => {
          throw Error("Parser failed")
        }),
        /failed/,
      )
      return scan
    },
  })
  assert.equal(result.status, "partial")
  assert.equal(result.report, null)
  assert.equal(result.unreported_attempts[0].run_id, result.attempts[0].run_id)
  assert.equal(result.unreported_attempts[0].reason, "unsettled_native_checkpoints")
  assert.equal(readRecoverySource(f.root, result.attempts[0].run_id).summary.status, "incomplete")
})
