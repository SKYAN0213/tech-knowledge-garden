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
import { saveRecoveredDailyReport } from "../scripts/research/recovered-daily-report.mjs"
import { freezeEdition } from "../scripts/research/event-pipeline.mjs"
import { freezeStoredSourceFrontier, saveCollectionReport } from "../scripts/research/collection-report.mjs"
import { freezeShadowCollectionInputs, freezeShadowHandoffBasis } from "../scripts/research/shadow-collection-basis.mjs"
import { reconcilePublicationDay } from "../scripts/research/publication-date-reconciliation.mjs"
import { module as collection } from "../scripts/research/modules/collection.mjs"
import { validateArguments } from "../scripts/research/modules/contracts.mjs"
import { kstDay, shiftDay } from "../scripts/research/daily-plan.mjs"
import { reconcileSupplementalScan } from "../scripts/research/daily-scan.mjs"

async function fixture(t, { mismatch = false, unreadable = false, policyBlocked = false, windowOverride } = {}) {
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
  const window = windowOverride || { since: "2026-10-10", until: "2026-10-17" }
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
      observed_at: new Date().toISOString(),
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
    if (policyBlocked && url.endsWith("/one"))
      return { original_url: url, fetch_status: "policy_blocked", request_performed: false }
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
    const recoveryRuns = v["recovery-source-runs"]
    const scanWindow = { since: v.since || window.since, until: v.until || window.until }
    const input = {
      schema: "research-list-run-input/v2",
      channel_id: channel.channel_id,
      since: scanWindow.since,
      until_exclusive: scanWindow.until,
      reuse_listing_run: null,
      collection_basis: basis,
      policy_recheck_limit: 0,
      ...(v["recovery-source-run"] ? { recovery_source_run: v["recovery-source-run"] } : {}),
      ...(recoveryRuns ? { recovery_source_runs: recoveryRuns } : {}),
    }
    const run = new RunState(root, v.run, input)
    atomicWrite(root, `runs/${v.run}/collection-input.json`, input)
    await run.stage("collection-basis", basis, () => basis)
    const reuse = v["recovery-source-run"] || recoveryRuns
      ? createRecoverySourceReuse(root, recoveryRuns || v["recovery-source-run"], channel, basis, scanWindow, {
          fetchPolicy,
          parse,
          ...(v["test-now"] ? { now: v["test-now"] } : {}),
        })
      : null
    const result = await scanBoundedRSSRoute(
      root,
      run,
      {},
      channel,
      acquisition.article_profiles,
      scanWindow,
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

test("recovery authenticates a listing reuse request that the scan explicitly skipped", async (t) => {
  const f = await fixture(t)
  const prefix = "runs/initial/"
  const input = readJSON(f.root, prefix + "collection-input.json")
  input.reuse_listing_run = "earlier-listing"
  const state = readJSON(f.root, prefix + "state.json")
  state.input_hash = sha256(JSON.stringify(input))
  const summary = readJSON(f.root, prefix + "list-scan.json")
  delete summary.listing_reused_from_run
  summary.listing_reuse_skipped = "Reusable listing observation is outside the freshness window"
  atomicWrite(f.root, prefix + "collection-input.json", input)
  atomicWrite(f.root, prefix + "state.json", state)
  atomicWrite(f.root, prefix + "list-scan.json", summary)

  const recovered = readRecoverySource(f.root, "initial")
  assert.deepEqual(recovered.input, input)
  assert.equal(recovered.reference.input_sha256, state.input_hash)
  assert.equal(recovered.summary.listing_reuse_skipped, summary.listing_reuse_skipped)

  const frontier = {
    root: f.root,
    runId: "skipped-listing-frontier",
    sourceRuns: [{ run_id: "initial", policy_recheck_limit: 0 }],
  }
  const frozen = await freezeStoredSourceFrontier(frontier)
  assert.equal(frozen.reused, false)

  atomicWrite(f.root, prefix + "collection-input.json", { ...input, reuse_listing_run: "tampered" })
  assert.throws(() => readRecoverySource(f.root, "initial"), /input|window/)
  await assert.rejects(freezeStoredSourceFrontier(frontier), /input|window|evidence/)
  atomicWrite(f.root, prefix + "collection-input.json", input)
  atomicWrite(f.root, prefix + "list-scan.json", { ...summary, listing_reuse_skipped: "" })
  assert.throws(() => readRecoverySource(f.root, "initial"), /input|window/)
  await assert.rejects(freezeStoredSourceFrontier(frontier), /input|window|evidence/)
  atomicWrite(f.root, prefix + "list-scan.json", { ...summary, listing_reused_from_run: "another-listing" })
  assert.throws(() => readRecoverySource(f.root, "initial"), /input|window/)
  await assert.rejects(freezeStoredSourceFrontier(frontier), /input|window|evidence/)
})

function addEarlierWindow(f) {
  const run = "earlier-window"
  fs.cpSync(path.join(f.root, "runs/initial"), path.join(f.root, "runs", run), { recursive: true })
  const input = readJSON(f.root, `runs/${run}/collection-input.json`)
  input.since = "2026-10-03"
  input.until_exclusive = "2026-10-10"
  atomicWrite(f.root, `runs/${run}/collection-input.json`, input)
  const state = readJSON(f.root, `runs/${run}/state.json`)
  state.run_id = run
  state.input_hash = sha256(JSON.stringify(input))
  for (const stage of Object.values(state.stages))
    if (stage.result_path) stage.result_path = stage.result_path.replace("runs/initial/", `runs/${run}/`)
  atomicWrite(f.root, `runs/${run}/state.json`, state)
  const summary = readJSON(f.root, `runs/${run}/list-scan.json`)
  summary.window = { since: input.since, until_exclusive: input.until_exclusive }
  atomicWrite(f.root, `runs/${run}/list-scan.json`, summary)
  const source = readRecoverySource(f.root, run)
  const report = readJSON(f.root, f.reportPath)
  report.routes[0].windows.unshift({
    since: input.since,
    until_exclusive: input.until_exclusive,
    status: "incomplete",
    attempts: [{ run_id: run, status: "incomplete" }],
  })
  report.evidence.push(...source.reference.evidence)
  atomicWrite(f.root, f.reportPath, report)
  return { run, input, reportSha256: sha256(fs.readFileSync(path.join(f.root, f.reportPath))) }
}

test("window-specific checkpoint overrides do not leak to another window of the same source", async (t) => {
  const f = await fixture(t), other = addEarlierWindow(f)
  const override = "earlier-checkpoint"
  fs.cpSync(path.join(f.root, "runs", other.run), path.join(f.root, "runs", override), { recursive: true })
  const state = readJSON(f.root, `runs/${override}/state.json`)
  state.run_id = override
  for (const stage of Object.values(state.stages))
    if (stage.result_path) stage.result_path = stage.result_path.replace(`runs/${other.run}/`, `runs/${override}/`)
  atomicWrite(f.root, `runs/${override}/state.json`, state)
  const plan = await recoverCollection({
    ...f,
    reportSha256: other.reportSha256,
    runId: "window-overrides",
    mode: "plan-only",
    sourceWindows: [
      { channel_id: f.channel.channel_id, since: other.input.since, until_exclusive: other.input.until_exclusive, source_runs: [override] },
      { channel_id: f.channel.channel_id, since: f.window.since, until_exclusive: f.window.until, source_runs: ["initial"] },
    ],
  })
  assert.deepEqual(plan.targets.map((target) => target.source_run), [override, "initial"])
})

test("an unavailable window preserves its error while another window continues", async (t) => {
  const f = await fixture(t), other = addEarlierWindow(f)
  atomicWrite(f.root, `locks/run-${other.run}.json`, { owner: "active" })
  const result = await recoverCollection({
    ...f,
    reportSha256: other.reportSha256,
    runId: "isolated-windows",
    mode: "execute",
    maxRoutes: 2,
  })
  assert.equal(result.status, "partial")
  assert.ok(result.waiting_sources.some((row) => row.since === other.input.since))
  assert.equal(result.attempts.length, 1)
  assert.equal(result.attempts[0].source_run, "initial")
  fs.unlinkSync(path.join(f.root, `locks/run-${other.run}.json`))
  const resumed = await recoverCollection({
    ...f,
    reportSha256: other.reportSha256,
    runId: "isolated-windows",
    mode: "resume",
    maxRoutes: 1,
    scan: async () => { throw Error("Controlled source wait") },
  })
  assert.equal(resumed.attempts.at(-1).source_run, other.run)
  assert.equal(resumed.attempts.at(-1).error.message, "Controlled source wait")
  const savedPlan = readJSON(f.root, "collection-recovery/isolated-windows/plan.json")
  assert.equal(savedPlan.targets[0].deferred_source, true)
  assert.equal(fs.readdirSync(path.join(f.root, "collection-recovery/isolated-windows/bindings")).length, 1)
})

test("a preparation budget pause resumes without inventing a failed source attempt", async (t) => {
  const f = await fixture(t)
  const first = await recoverCollection({ ...f, runId: "budget-before-plan", mode: "execute", timeBudgetMs: 1 })
  assert.equal(first.status, "partial")
  assert.equal(first.attempts.length, 0)
  assert.equal(first.waiting_sources[0].status, "budget_pending")
  assert.equal(first.next_actions.length, 1)
  const resumed = await recoverCollection({ ...f, runId: "budget-before-plan", mode: "resume", timeBudgetMs: 30000 })
  assert.equal(resumed.attempts.length, 1)
  assert.equal(resumed.attempts[0].source_run, "initial")
})

test("multiple authenticated attempts retain source provenance and reusable parses", async (t) => {
  const f = await fixture(t)
  await f.scan({ run: "additional-attempt", "recovery-source-run": "initial" })
  const reuse = createRecoverySourceReuse(
    f.root,
    ["initial", "additional-attempt"],
    f.channel,
    f.basis,
    f.window,
  )
  assert.deepEqual(reuse.reference.source_runs.map((source) => source.source_run), ["initial", "additional-attempt"])
  assert.equal(reuse.available.size, 3)
  const receiptRef = preserveRecoverySourceReuse(f.root, "multi-source", reuse)
  const receipt = readJSON(f.root, receiptRef.path)
  assert.equal(receipt.observation_times_preserved, true)
  assert.equal(receipt.coverage_reused, false)
  assert.equal(receipt.source_runs.length, 2)
})

test("window recovery uses every explicitly pinned checkpoint and preserves the combined receipt", async (t) => {
  const f = await fixture(t)
  await f.scan({ run: "additional-attempt", "recovery-source-run": "initial" })
  const report = readJSON(f.root, f.reportPath)
  report.routes[0].windows[0].attempts.push({ run_id: "additional-attempt", status: "incomplete" })
  report.evidence.push(...readRecoverySource(f.root, "additional-attempt").reference.evidence)
  atomicWrite(f.root, f.reportPath, report)
  const result = await recoverCollection({
    ...f,
    reportSha256: sha256(fs.readFileSync(path.join(f.root, f.reportPath))),
    runId: "combined-checkpoints",
    mode: "execute",
    sourceWindows: [{ channel_id: f.channel.channel_id, since: f.window.since, until_exclusive: f.window.until, source_runs: ["initial", "additional-attempt"] }],
  })
  assert.deepEqual(result.attempts[0].source_runs, ["initial", "additional-attempt"])
  const source = readRecoverySource(f.root, result.attempts[0].run_id)
  assert.equal(source.summary.status, "window_scanned")
  assert.equal(readJSON(f.root, `runs/${result.attempts[0].run_id}/source-recovery-reuse.json`).source_runs.length, 2)
})

test("window recovery automatically reuses eligible earlier attempts from the frozen report", async (t) => {
  const f = await fixture(t)
  await f.scan({ run: "additional-attempt", "recovery-source-run": "initial" })
  const report = readJSON(f.root, f.reportPath)
  report.routes[0].windows[0].attempts.push({ run_id: "additional-attempt", status: "incomplete" })
  report.evidence.push(...readRecoverySource(f.root, "additional-attempt").reference.evidence)
  atomicWrite(f.root, f.reportPath, report)
  const result = await recoverCollection({
    ...f,
    reportSha256: sha256(fs.readFileSync(path.join(f.root, f.reportPath))),
    runId: "automatic-checkpoints",
    mode: "execute",
  })
  assert.deepEqual(result.attempts[0].source_runs, ["initial", "additional-attempt"])
  assert.equal(result.attempts[0].status, "window_scanned")
})

test("a policy wait never consumes the new-request budget or starves later detail URLs", async (t) => {
  const f = await fixture(t, { policyBlocked: true })
  assert.equal(f.initial.candidates.length, 1)
  const original = fs.readFileSync(path.join(f.root, "runs/initial/list-scan.json"))
  const next = await f.scan({ run: "policy-continue", "recovery-source-run": "initial" })
  assert.equal(next.candidates.length, 2)
  assert.equal(next.summary.details.filter((d) => d.status === "deferred_by_budget").length, 0)
  assert.equal(next.summary.details.find((d) => d.url.endsWith("/one")).status, "fetch_failed")
  assert.equal(f.requested.filter((url) => url.endsWith("/two")).length, 1)
  assert.equal(f.requested.filter((url) => url.endsWith("/three")).length, 1)
  assert.deepEqual(fs.readFileSync(path.join(f.root, "runs/initial/list-scan.json")), original)
})

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

test("completed windows remain partial when the requested aggregate report is blocked", async (t) => {
  const f = await fixture(t)
  const report = readJSON(f.root, f.reportPath)
  report.routes.push({
    channel_id: "unavailable-source",
    windows: [{
      since: "2026-10-10",
      until_exclusive: "2026-10-17",
      status: "incomplete",
      attempts: [{ run_id: "blocked-before-scan", status: "blocked" }],
    }],
  })
  atomicWrite(f.root, f.reportPath, report)
  const options = {
    ...f,
    repo: process.cwd(),
    runId: "blocked-aggregate",
    reportSha256: sha256(fs.readFileSync(path.join(f.root, f.reportPath))),
    channels: [f.channel.channel_id],
    publishReport: true,
  }
  await recoverCollection({ ...options, mode: "execute" })
  const result = await recoverCollection({ ...options, mode: "resume" })
  assert.equal(result.counts.completed, 1)
  assert.equal(result.report, null)
  assert.equal(result.report_wait.status, "evidence_blocked")
  assert.equal(result.status, "partial")
  assert.ok(result.required_actions.some((item) => item.kind === "report_evidence_blocked"))
  assert.deepEqual(readJSON(f.root, f.reportPath), report)
})

test("a partial successful scan waits for the window end and resumes the same recovery", async (t) => {
  const tomorrow = shiftDay(kstDay(Date.now()), 1)
  const f = await fixture(t, { windowOverride: { since: "2026-10-10", until: tomorrow } })
  const past = { since: "2026-10-10", until: "2026-10-17" }
  await f.scan({ run: "baseline-a1", ...past })
  await f.scan({ run: "baseline-a2", ...past, "recovery-source-run": "baseline-a1" })
  const baseline = await f.scan({ run: "baseline-a3", ...past, "recovery-source-run": "baseline-a2" })
  assert.equal(baseline.summary.status, "window_scanned")
  const routeConfig = path.join(f.root, "test-daily-routes.json")
  fs.writeFileSync(routeConfig, JSON.stringify({ schema: "research-daily-routes/v1", lookback_days: 7,
    max_window_days: 7, routes: [{ channel_id: f.channel.channel_id, enabled: true, baseline_run: "baseline-a3" }] }))
  const backlog = path.join(f.root, "test-backlog.json")
  fs.writeFileSync(backlog, JSON.stringify({ schema: "research-candidates/v1", candidates: [] }))
  const due = Date.parse(`${tomorrow}T00:00:00+09:00`)
  let instant = Date.now(), calls = 0, failRefresh = true
  const options = { ...f, repo: process.cwd(), runId: "future-window", publishReport: false,
    reconcileCoverage: true, backlogFile: backlog,
    supplementalReconciler: (args) => reconcileSupplementalScan({ ...args, configFile: routeConfig,
      merge: async () => ({ status: "merged", changed: false, same_event_aliases: [] }) }),
    now: () => instant, scan: async (parameters) => {
      calls++
      if (instant >= due && failRefresh) throw Error("Controlled listing outage")
      if (instant >= due) {
        const previous = f.docs.get(f.channel.url)
        f.docs.set(f.channel.url, { ...previous, observed_at: new Date(instant).toISOString() })
      }
      const result = await f.scan({ ...parameters, "test-now": instant })
      if (instant >= due) {
        const statePath = `runs/${parameters.run}/state.json`
        const state = readJSON(f.root, statePath)
        atomicWrite(f.root, statePath, { ...state, started_at: new Date(instant).toISOString() })
      }
      return result
    } }
  await recoverCollection({ ...options, mode: "execute" })
  const partial = await recoverCollection({ ...options, mode: "resume" })
  assert.equal(partial.status, "partial")
  assert.equal(partial.counts.completed, 0)
  assert.equal(partial.counts.coverage_pending, 1)
  assert.ok(partial.attempts.at(-1).coverage_reconciliation?.reconciliation_run)
  assert.ok(partial.required_actions.some((item) => item.kind === "window_not_yet_elapsed"))
  assert.equal(partial.next_actions[0].not_before, new Date(due).toISOString())
  const before = calls
  const waiting = await recoverCollection({ ...options, mode: "resume" })
  assert.equal(waiting.status, "partial")
  assert.equal(calls, before)
  instant = due + 60000
  const failed = await recoverCollection({ ...options, mode: "resume" })
  assert.equal(failed.status, "partial")
  assert.equal(failed.counts.completed, 0)
  assert.equal(failed.counts.remaining, 1)
  assert.ok(failed.required_actions.some((item) => item.kind === "inspect_saved_error"))
  const listingRequests = f.requested.filter((url) => url === f.channel.url).length
  failRefresh = false
  let completed = await recoverCollection({ ...options, mode: "resume" })
  for (let i = 0; i < 4 && completed.status !== "complete"; i++)
    completed = await recoverCollection({ ...options, mode: "resume" })
  assert.ok(calls >= before + 2 && calls <= before + 5)
  assert.equal(completed.status, "complete")
  assert.equal(completed.counts.completed, 1)
  const reconciledAttempts = completed.attempts.filter((attempt) => attempt.coverage_reconciliation)
  assert.equal(reconciledAttempts.length, 2)
  assert.notEqual(reconciledAttempts[0].coverage_reconciliation.reconciliation_run,
    reconciledAttempts[1].coverage_reconciliation.reconciliation_run)
  for (const attempt of reconciledAttempts) {
    const receipt = readJSON(f.root, `daily/reconciliations/${attempt.coverage_reconciliation.reconciliation_run}.json`)
    assert.equal(receipt.scan_run, attempt.run_id)
    assert.equal(receipt.coverage_until, attempt.coverage_reconciliation.coverage_until)
  }
  assert.equal(f.requested.filter((url) => url === f.channel.url).length, listingRequests + 1)
  const finalRun = completed.attempts.at(-1).run_id
  const finalScan = readJSON(f.root, `runs/${finalRun}/list-scan.json`)
  const listing = readJSON(f.root, `runs/${finalRun}/documents.json`)
    .find((document) => document.source_version_id === finalScan.listing_source_version_id)
  assert.ok(Date.parse(listing.observed_at) >= due)
  const finishedCalls = calls
  const again = await recoverCollection({ ...options, mode: "resume" })
  assert.equal(again.status, "complete")
  assert.equal(calls, finishedCalls)
})

test("a recovered daily report retains blocked receipts and adds only the completed window", async (t) => {
  const f = await fixture(t)
  const daily = "daily-fixture"
  const selected = { channel_id: f.channel.channel_id, since: f.window.since,
    until_exclusive: f.window.until }
  const blocked = { channel_id: "unavailable-source", since: f.window.since,
    until_exclusive: f.window.until }
  const attemptId = (window) => `${daily}_${window.channel_id}_${window.since.replaceAll("-", "")}_${window.until_exclusive.replaceAll("-", "")}_a1`
  const selectedId = attemptId(selected), blockedId = attemptId(blocked)
  const configFile = path.join(f.root, "daily-config.json")
  fs.writeFileSync(configFile, "{}")
  const plan = { schema: "research-daily-plan/v1", run_id: daily,
    config_sha256: sha256(`${configFile}:${sha256(fs.readFileSync(configFile))}`), windows: [selected, blocked] }
  atomicWrite(f.root, `daily/runs/${daily}/plan.json`, plan)
  await freezeShadowCollectionInputs({ root: f.root, plan, configFile, sourcePaths: [configFile],
    activeRoutes: [selected.channel_id, blocked.channel_id] })
  await f.scan({ run: selectedId })
  const receipts = [
    { ...selected, schema: "research-daily-receipt/v1", daily_run: daily, attempt_id: selectedId,
      status: "failed", reason: "detail_incomplete", started_at: "2026-10-10T00:00:00Z",
      finished_at: "2026-10-11T00:00:00Z", candidate_keys: [], candidate_published: false },
    { ...blocked, schema: "research-daily-receipt/v1", daily_run: daily, attempt_id: blockedId,
      status: "blocked", reason: "source_wait", started_at: "2026-10-10T00:00:00Z",
      finished_at: "2026-10-11T00:00:00Z", candidate_keys: [], candidate_published: false },
  ]
  for (const receipt of receipts) {
    const file = `daily/runs/${daily}/receipts/${receipt.attempt_id}.json`
    atomicWrite(f.root, file, receipt)
  }
  atomicWrite(f.root, `daily/runs/${daily}/summary.json`, {
    schema: "research-daily-summary/v1", run_id: daily, receipts: receipts.length,
  })
  const backlogFile = path.join(f.root, "daily-backlog.json")
  fs.writeFileSync(backlogFile, JSON.stringify({ schema: "research-candidates/v1", candidates: [] }))
  const coverage = atomicWrite(f.root, "daily/route-coverage.json", { routes: {} })
  const inputs = { plan_sha256: sha256(fs.readFileSync(path.join(f.root, `daily/runs/${daily}/plan.json`))),
    receipts_sha256: sha256(JSON.stringify(receipts)), backlog_sha256: sha256(fs.readFileSync(backlogFile)),
    daily_coverage_sha256: coverage.sha256 }
  const handoffPath = `daily/runs/${daily}/handoffs/${sha256(JSON.stringify(inputs))}.json`
  atomicWrite(f.root, handoffPath, { schema: "research-editorial-handoff/v1", daily_run: daily, inputs })
  await freezeShadowHandoffBasis({ root: f.root, dailyRun: daily, handoffPath, backlogFile, receipts })
  const savedOriginal = await saveCollectionReport({ root: f.root, runId: daily })
  const reportPath = savedOriginal.path
  const report = readJSON(f.root, reportPath)
  const original = fs.readFileSync(path.join(f.root, reportPath))
  const options = { ...f, repo: process.cwd(), runId: "receipt-frontier",
    reportPath, reportSha256: sha256(original), channels: [f.channel.channel_id], publishReport: true }
  const initialPartial = await recoverCollection({ ...options, mode: "execute" })
  assert.equal(initialPartial.status, "partial")
  assert.ok(initialPartial.report)
  assert.equal(readJSON(f.root, initialPartial.report.path).counts.incomplete_windows, 2)
  assert.ok(readJSON(f.root, initialPartial.report.path).materials.some((material) =>
    material.observations.some((observation) => observation.scan_run === initialPartial.attempts[0].run_id &&
      observation.role === "article_candidate")))
  const result = await recoverCollection({ ...options, mode: "resume" })
  assert.equal(result.status, "complete")
  assert.equal(result.counts.completed, 1)
  const updated = readJSON(f.root, result.report.path)
  assert.equal(updated.status, "partial")
  assert.equal(updated.counts.collected_windows, 1)
  assert.equal(updated.counts.incomplete_windows, 1)
  assert.equal(updated.routes.find((r) => r.channel_id === blocked.channel_id).windows[0].attempts[0].status, "blocked")
  assert.equal(updated.recovery.base_report.sha256, sha256(original))
  assert.deepEqual(fs.readFileSync(path.join(f.root, reportPath)), original)

  const planPath = path.join(f.root, "collection-recovery/receipt-frontier/plan.json")
  const statePath = path.join(f.root, "collection-recovery/receipt-frontier/state.json")
  const originalPlan = fs.readFileSync(planPath), originalState = fs.readFileSync(statePath)
  const params = { run_id: "separate-report", recovery_run_id: "receipt-frontier",
    report_path: reportPath, report_sha256: sha256(original), plan_sha256: sha256(originalPlan),
    state_sha256: sha256(originalState) }
  const op = collection.operations.report_recovery
  validateArguments(params, op.inputSchema, { root: f.root, repo: process.cwd() })
  const separate = await op.run({ root: f.root }, params)
  assert.equal(separate.counts.collected_windows, 1)
  assert.equal(readJSON(f.root, separate.path).recovery.source_recovery_run, "receipt-frontier")
  const edition = await freezeEdition({ root: f.root }, { run_id: "recovered-edition",
    report_path: separate.path, report_sha256: separate.sha256 })
  assert.equal(edition.status, "partial")
  assert.equal(edition.daily_run, daily)
  assert.deepEqual(fs.readFileSync(planPath), originalPlan)
  assert.deepEqual(fs.readFileSync(statePath), originalState)
  await assert.rejects(op.run({ root: f.root }, { ...params, state_sha256: "a".repeat(64) }), /SHA changed/)
  await assert.rejects(op.run({ root: f.root }, { ...params, run_id: params.recovery_run_id }), /separate/)

  const completeAttempt = result.attempts.find((attempt) => attempt.status === "window_scanned")
  const fakeBase = structuredClone(report)
  assert.ok(fakeBase.materials.length > 0)
  fakeBase.materials[0].roles = ["article_candidate"]
  fakeBase.materials[0].observations.push({ scan_run: "foreign-unowned", channel_id: "foreign",
    observed_at: "2026-10-16T00:00:00Z", role: "article_candidate" })
  const fakeBytes = Buffer.from(JSON.stringify(fakeBase, null, 2) + "\n")
  const fakeSha = sha256(fakeBytes)
  const fakePath = `daily/runs/${daily}/collection-reports/${fakeSha}.json`
  atomicWrite(f.root, fakePath, fakeBytes)
  const fakePlan = { schema: "research-collection-recovery-plan/v1", run_id: "fake-frontier",
    report: { path: fakePath, sha256: fakeSha },
    targets: [{ ...selected, source_run: completeAttempt.source_run }] }
  atomicWrite(f.root, "collection-recovery/fake-frontier/plan.json", fakePlan)
  atomicWrite(f.root, "collection-recovery/fake-frontier/state.json", {
    schema: "research-collection-recovery-state/v1", plan_sha256: sha256(JSON.stringify(fakePlan)),
    attempts: [completeAttempt],
  })
  const fakeOverlay = await saveRecoveredDailyReport({ root: f.root, runId: "fake-frontier",
    baseReport: { path: fakePath, sha256: fakeSha }, attempts: [completeAttempt] })
  await assert.rejects(freezeEdition({ root: f.root }, { run_id: "fake-base-edition",
    report_path: fakeOverlay.path, report_sha256: fakeOverlay.sha256 }), /settled native collection report/)

  const omittedAttempt = { window_key: JSON.stringify([blocked.channel_id, blocked.since, blocked.until_exclusive]),
    run_id: "partial-elsewhere", status: "incomplete" }
  atomicWrite(f.root, "collection-recovery/fake-frontier/state.json", {
    schema: "research-collection-recovery-state/v1", plan_sha256: sha256(JSON.stringify(fakePlan)),
    attempts: [completeAttempt, omittedAttempt],
  })
  await assert.rejects(saveRecoveredDailyReport({ root: f.root, runId: "fake-frontier",
    baseReport: { path: fakePath, sha256: fakeSha }, attempts: [completeAttempt] }),
  /Recovery attempts.*partial-elsewhere/)

  // A different window's verified partial candidates must be handed off,
  // even when another window in the same recovery has completed.
  const multiDaily = "multi-daily"
  const second = { channel_id: selected.channel_id, since: "2026-10-11", until_exclusive: selected.until_exclusive }
  const multiId = (window) => `${multiDaily}_${window.channel_id}_${window.since.replaceAll("-", "")}_${window.until_exclusive.replaceAll("-", "")}_a1`
  const multiPlan = { schema: "research-daily-plan/v1", run_id: multiDaily,
    config_sha256: sha256(`${configFile}:${sha256(fs.readFileSync(configFile))}`), windows: [selected, second] }
  atomicWrite(f.root, `daily/runs/${multiDaily}/plan.json`, multiPlan)
  await freezeShadowCollectionInputs({ root: f.root, plan: multiPlan, configFile,
    sourcePaths: [configFile], activeRoutes: [selected.channel_id] })
  await f.scan({ run: multiId(selected), since: selected.since, until: selected.until_exclusive })
  await f.scan({ run: multiId(second), since: second.since, until: second.until_exclusive })
  const multiReceipts = [selected, second].map((window) => ({ ...window,
    schema: "research-daily-receipt/v1", daily_run: multiDaily, attempt_id: multiId(window),
    status: "failed", reason: "detail_incomplete", started_at: "2026-10-10T00:00:00Z",
    finished_at: "2026-10-11T00:00:00Z", candidate_keys: [], candidate_published: false }))
  for (const receipt of multiReceipts)
    atomicWrite(f.root, `daily/runs/${multiDaily}/receipts/${receipt.attempt_id}.json`, receipt)
  atomicWrite(f.root, `daily/runs/${multiDaily}/summary.json`, {
    schema: "research-daily-summary/v1", run_id: multiDaily, receipts: multiReceipts.length })
  const multiInputs = { plan_sha256: sha256(fs.readFileSync(path.join(f.root, `daily/runs/${multiDaily}/plan.json`))),
    receipts_sha256: sha256(JSON.stringify(multiReceipts)), backlog_sha256: sha256(fs.readFileSync(backlogFile)),
    daily_coverage_sha256: coverage.sha256 }
  const multiHandoff = `daily/runs/${multiDaily}/handoffs/${sha256(JSON.stringify(multiInputs))}.json`
  atomicWrite(f.root, multiHandoff, { schema: "research-editorial-handoff/v1", daily_run: multiDaily, inputs: multiInputs })
  await freezeShadowHandoffBasis({ root: f.root, dailyRun: multiDaily, handoffPath: multiHandoff,
    backlogFile, receipts: multiReceipts })
  const multiBase = await saveCollectionReport({ root: f.root, runId: multiDaily })
  const partialScan = await f.scan({ run: "partial-second-window", since: second.since,
    until: second.until_exclusive, "recovery-source-run": multiId(second) })
  assert.equal(partialScan.summary.status, "incomplete")
  const partialAttempt = { window_key: JSON.stringify([second.channel_id, second.since, second.until_exclusive]),
    run_id: "partial-second-window", source_run: multiId(second), status: "incomplete",
    reason: partialScan.summary.reason }
  const combinedPlan = { schema: "research-collection-recovery-plan/v1", run_id: "combined-frontier",
    report: { path: multiBase.path, sha256: multiBase.sha256 },
    targets: [{ ...selected, source_run: completeAttempt.source_run }, { ...second, source_run: multiId(second) }] }
  atomicWrite(f.root, "collection-recovery/combined-frontier/plan.json", combinedPlan)
  atomicWrite(f.root, "collection-recovery/combined-frontier/state.json", {
    schema: "research-collection-recovery-state/v1", plan_sha256: sha256(JSON.stringify(combinedPlan)),
    attempts: [completeAttempt, partialAttempt] })
  const combined = await saveRecoveredDailyReport({ root: f.root, runId: "combined-frontier",
    baseReport: combinedPlan.report, attempts: [completeAttempt, partialAttempt] })
  const combinedReport = readJSON(f.root, combined.path)
  assert.equal(combinedReport.counts.collected_windows, 1)
  assert.equal(combinedReport.counts.incomplete_windows, 1)
  assert.ok(combinedReport.materials.some((material) => material.observations.some((observation) =>
    observation.scan_run === partialAttempt.run_id && observation.role === "article_candidate")))
  assert.ok(combinedReport.pending_items.some((item) => item.scan_run === partialAttempt.run_id))
  const combinedEdition = await freezeEdition({ root: f.root }, { run_id: "combined-partial-edition",
    report_path: combined.path, report_sha256: combined.sha256 })
  assert.equal(combinedEdition.status, "partial")

  const reconciliationRun = `clip-frontier_coverage_${sha256(completeAttempt.window_key).slice(0, 12)}`
  const reconciliationPath = `daily/reconciliations/${reconciliationRun}.json`
  const reconciliation = {
    schema: "research-supplemental-coverage/v2", reconciliation_run: reconciliationRun,
    scan_run: completeAttempt.run_id, channel_id: selected.channel_id, since: selected.since,
    scan_until_exclusive: selected.until_exclusive, coverage_until: "2026-10-16", candidate_published: false,
    reconciled_at: "2026-10-16T03:00:00.000Z",
    candidate_keys: readJSON(f.root, `runs/${completeAttempt.run_id}/candidates.json`).map((c) => c.key),
    backlog_merge: { status: "merged", same_event_aliases: [] },
  }
  atomicWrite(f.root, reconciliationPath, reconciliation)
  const recoveryStatePath = "collection-recovery/receipt-frontier/state.json"
  const recoveryState = readJSON(f.root, recoveryStatePath)
  const clippedAttempt = { ...completeAttempt, coverage_reconciliation: { coverage_until: "2026-10-16" } }
  atomicWrite(f.root, recoveryStatePath, { ...recoveryState, later_checkpoint: true })
  const clipPlan = { schema: "research-collection-recovery-plan/v1", run_id: "clip-frontier",
    report: { path: reportPath, sha256: sha256(original) },
    targets: [{ ...selected, source_run: completeAttempt.source_run }],
    reconcile_coverage: true, backlog_file: backlogFile }
  atomicWrite(f.root, "collection-recovery/clip-frontier/plan.json", clipPlan)
  const clipStatePath = "collection-recovery/clip-frontier/state.json"
  const clipState = { schema: "research-collection-recovery-state/v1",
    plan_sha256: sha256(JSON.stringify(clipPlan)), attempts: [clippedAttempt] }
  atomicWrite(f.root, clipStatePath, clipState)
  const repeatedEdition = await freezeEdition({ root: f.root }, { run_id: "recovered-edition-again",
    report_path: separate.path, report_sha256: separate.sha256 })
  assert.equal(repeatedEdition.status, "partial")
  const forged = structuredClone(readJSON(f.root, separate.path))
  forged.counts.collected_windows = 999
  const forgedBytes = Buffer.from(JSON.stringify(forged, null, 2) + "\n")
  const forgedSha = sha256(forgedBytes)
  const forgedPath = `daily/runs/${daily}/collection-reports/${forgedSha}.json`
  atomicWrite(f.root, forgedPath, forgedBytes)
  await assert.rejects(freezeEdition({ root: f.root }, { run_id: "forged-edition",
    report_path: forgedPath, report_sha256: forgedSha }), /native projection/)
  const partial = await saveRecoveredDailyReport({ root: f.root, runId: "clip-frontier",
    baseReport: { path: reportPath, sha256: sha256(original) },
    attempts: [clippedAttempt] })
  const partialReport = readJSON(f.root, partial.path)
  assert.equal(partialReport.counts.collected_windows, 0)
  assert.equal(partialReport.counts.incomplete_windows, 2)
  assert.equal(partialReport.routes[0].windows[0].recovered_coverage.until_exclusive, "2026-10-16")
  assert.equal(partialReport.routes[0].windows[0].recovered_coverage.full_window, false)
  assert.ok(report.materials.every((material) => partialReport.materials.some((item) => item.id === material.id)))

  let prematureScans = 0
  const waitOptions = { ...f, repo: process.cwd(), runId: "partial-window-wait",
    reportPath: partial.path, reportSha256: partial.sha256, channels: [f.channel.channel_id],
    publishReport: false, now: () => Date.parse("2026-10-16T12:00:00+09:00"),
    scan: async (parameters) => { prematureScans++; return f.scan(parameters) } }
  const heldBody = path.join(f.root, f.docs.get(f.channel.url).body_path)
  fs.renameSync(heldBody, heldBody + ".held")
  const waitingPlan = await recoverCollection({ ...waitOptions, mode: "plan-only" })
  assert.equal(waitingPlan.waiting_sources[0].status, "window_not_yet_elapsed")
  assert.equal(waitingPlan.waiting_sources[0].next_check_at, "2026-10-16T15:00:00.000Z")
  const waiting = await recoverCollection({ ...waitOptions, mode: "execute" })
  assert.equal(waiting.counts.executed, 0)
  assert.equal(waiting.waiting_sources[0].status, "window_not_yet_elapsed")
  assert.equal(prematureScans, 0)
  fs.renameSync(heldBody + ".held", heldBody)
  const afterWindow = await recoverCollection({ ...waitOptions, mode: "resume",
    now: () => Date.parse("2026-10-17T00:01:00+09:00") })
  assert.equal(afterWindow.counts.executed, 1)
  assert.equal(prematureScans, 1)
  let settled = afterWindow
  for (let i = 0; i < 4 && settled.status !== "complete"; i++)
    settled = await recoverCollection({ ...waitOptions, mode: "resume",
      now: () => Date.parse("2026-10-17T00:02:00+09:00") })
  assert.equal(settled.status, "complete", JSON.stringify(settled))
  const settledScans = prematureScans
  const unchanged = await recoverCollection({ ...waitOptions, mode: "resume",
    now: () => Date.parse("2026-10-17T00:03:00+09:00") })
  assert.equal(unchanged.counts.executed, 0)
  assert.equal(prematureScans, settledScans)

  const nextBase = { path: partial.path, sha256: partial.sha256 }
  const nextPlan = { schema: "research-collection-recovery-plan/v1", run_id: "next-frontier",
    report: nextBase, targets: [{ ...selected, source_run: completeAttempt.run_id }] }
  atomicWrite(f.root, "collection-recovery/next-frontier/plan.json", nextPlan)
  atomicWrite(f.root, "collection-recovery/next-frontier/state.json", {
    schema: "research-collection-recovery-state/v1", plan_sha256: sha256(JSON.stringify(nextPlan)),
    attempts: [completeAttempt],
  })
  await assert.rejects(saveRecoveredDailyReport({ root: f.root, runId: "next-frontier",
    baseReport: nextBase, attempts: [completeAttempt] }),
  /incomplete original window/)
  const nextScan = await f.scan({ run: "later-recovery", "recovery-source-run": completeAttempt.run_id })
  assert.equal(nextScan.summary.status, "window_scanned")
  const nextAttempt = { ...completeAttempt, run_id: "later-recovery", source_run: completeAttempt.run_id,
    source_runs: undefined, coverage_reconciliation: undefined }
  const savedNextAttempt = JSON.parse(JSON.stringify(nextAttempt))
  atomicWrite(f.root, "collection-recovery/next-frontier/state.json", {
    schema: "research-collection-recovery-state/v1", plan_sha256: sha256(JSON.stringify(nextPlan)),
    attempts: [savedNextAttempt],
  })
  const next = await saveRecoveredDailyReport({ root: f.root, runId: "next-frontier",
    baseReport: nextBase, attempts: [savedNextAttempt] })
  const nextReport = readJSON(f.root, next.path)
  assert.equal(nextReport.counts.collected_windows, 1)
  assert.equal(nextReport.counts.incomplete_windows, 1)
  assert.equal(nextReport.recovery.history.length, 2)
  assert.equal(nextReport.routes[0].windows[0].attempts.length, 3)
  assert.equal(nextReport.routes[1].windows[0].attempts[0].status, "blocked")

  for (const invalid of [
    { ...reconciliation, candidate_keys: [] },
    { ...reconciliation, backlog_merge: { status: "failed", same_event_aliases: [] } },
  ]) {
    atomicWrite(f.root, reconciliationPath, invalid)
    await assert.rejects(saveRecoveredDailyReport({ root: f.root, runId: "clip-frontier",
      baseReport: { path: reportPath, sha256: sha256(original) }, attempts: [clippedAttempt] }),
    /Supplemental coverage receipt/)
  }
  const extended = { ...clippedAttempt, coverage_reconciliation: { coverage_until: selected.until_exclusive } }
  atomicWrite(f.root, clipStatePath, { ...clipState, attempts: [extended] })
  atomicWrite(f.root, reconciliationPath, { ...reconciliation, coverage_until: selected.until_exclusive })
  await assert.rejects(saveRecoveredDailyReport({ root: f.root, runId: "clip-frontier",
    baseReport: { path: reportPath, sha256: sha256(original) }, attempts: [extended] }),
  /Supplemental coverage receipt/)
  atomicWrite(f.root, clipStatePath, clipState)
  atomicWrite(f.root, reconciliationPath, reconciliation)
  const pinnedDocs = path.join(f.root, `runs/${selectedId}/documents.json`)
  fs.appendFileSync(pinnedDocs, " ")
  await assert.rejects(saveRecoveredDailyReport({ root: f.root, runId: "clip-frontier",
    baseReport: { path: reportPath, sha256: sha256(original) }, attempts: [clippedAttempt] }),
  /evidence changed/)
  await assert.rejects(freezeEdition({ root: f.root }, { run_id: "tampered-edition",
    report_path: separate.path, report_sha256: separate.sha256 }), /evidence changed|settled native collection report/)
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
  const options = {
    ...f,
    runId: "checkpoint-plan",
    mode: "resume",
    sourceRuns: { "nvidia-press-releases": "checkpoints" },
  }
  // A previously absent summary is not part of the frozen plan. A later
  // summary must not silently replace the original incomplete checkpoint.
  atomicWrite(f.root, "runs/checkpoints/list-scan.json", f.initial.summary)
  await assert.rejects(recoverCollection(options), /summary|metadata/)
  fs.unlinkSync(path.join(dir, "list-scan.json"))
  const resumed = await recoverCollection(options)
  assert.equal(resumed.attempts.length, 1)
  assert.equal(resumed.attempts[0].source_run, "checkpoints")
  assert.equal(fs.existsSync(path.join(dir, "list-scan.json")), false)
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
  await assert.rejects(recoverCollection(options), /metadata changed|input changed/)
})

test("an interrupted incomplete aggregate reuses only authenticated native checkpoints", async (t) => {
  const f = await fixture(t),
    dir = path.join(f.root, "runs/initial"),
    summary = fs.readFileSync(path.join(dir, "list-scan.json")),
    documents = fs.readFileSync(path.join(dir, "documents.json"))
  assert.equal(f.initial.summary.status, "incomplete")
  fs.unlinkSync(path.join(dir, "parses.json"))
  fs.unlinkSync(path.join(dir, "candidates.json"))

  const source = readRecoverySource(f.root, "initial")
  assert.equal(source.reference.incomplete_checkpoints, true)
  assert.equal(source.reference.coverage_reused, false)
  assert.equal(source.summary.reason, f.initial.summary.reason)
  assert.ok(source.documents.length > 0)
  const evidence = new Set(source.reference.evidence.map((item) => item.path))
  assert.ok(evidence.has("runs/initial/list-scan.json"))
  assert.ok(evidence.has("runs/initial/documents.json"))
  assert.equal(evidence.has("runs/initial/parses.json"), false)
  assert.equal(evidence.has("runs/initial/candidates.json"), false)
  const next = await f.scan({ run: "after-interrupted-aggregate", "recovery-source-run": "initial" })
  assert.ok(next.candidates.length > 0)
  assert.deepEqual(fs.readFileSync(path.join(dir, "list-scan.json")), summary)
  assert.deepEqual(fs.readFileSync(path.join(dir, "documents.json")), documents)
  assert.equal(fs.existsSync(path.join(dir, "parses.json")), false)
  assert.equal(fs.existsSync(path.join(dir, "candidates.json")), false)
})

test("a pinned failed daily receipt can resume its unsummarized storage checkpoint", async (t) => {
  const f = await fixture(t)
  const run = "initial", daily = "daily-test", base = `runs/${run}/`
  for (const name of ["list-scan.json", "documents.json", "parses.json", "candidates.json", "list-pages.json"])
    fs.unlinkSync(path.join(f.root, base + name))
  const body = Buffer.from("restored original payload")
  const request = {
    schema: "research-storage-download-request/v1", root: f.root,
    path: "documents/restored/body.bin", request_count: 1,
    requests: [{ path: "documents/restored/body.bin", sha256: sha256(body), bytes: body.length }],
  }
  const native = new RunState(f.root, run, readJSON(f.root, base + "collection-input.json"))
  await assert.rejects(native.stage("restoration-wait", {}, () => {
    throw Object.assign(Error("Stored payload required"), { code: "STORAGE_PENDING", storage_request: request })
  }), { code: "STORAGE_PENDING" })
  const receiptPath = `daily/runs/${daily}/receipts/${run}.json`
  const receipt = { schema: "research-daily-receipt/v2", daily_run: daily, attempt_id: run,
    channel_id: f.channel.channel_id, since: f.window.since, until_exclusive: f.window.until,
    status: "failed", reason: "Stored payload required", candidate_published: false }
  atomicWrite(f.root, receiptPath, receipt)
  const receiptSha = sha256(fs.readFileSync(path.join(f.root, receiptPath)))
  const report = { schema: "research-collection-report/v1", daily_run: daily,
    routes: [{ channel_id: f.channel.channel_id, windows: [{ channel_id: f.channel.channel_id,
      since: f.window.since, until_exclusive: f.window.until, status: "incomplete",
      attempts: [{ run_id: run, status: "failed", reason: receipt.reason }] }] }],
    evidence: [{ path: receiptPath, sha256: receiptSha }] }
  atomicWrite(f.root, "checkpoint-report.json", report)
  const options = { ...f, reportPath: "checkpoint-report.json",
    reportSha256: sha256(fs.readFileSync(path.join(f.root, "checkpoint-report.json"))),
    runId: "receipt-checkpoint", mode: "plan-only" }
  atomicWrite(f.root, receiptPath, { ...receipt, reason: "changed" })
  await assert.rejects(recoverCollection({ ...options, runId: "tampered-receipt" }), /receipt changed/)
  atomicWrite(f.root, receiptPath, receipt)
  const waiting = await recoverCollection(options)
  assert.equal(waiting.status, "partial")
  assert.equal(waiting.waiting_sources[0].status, "waiting_for_storage")
  assert.deepEqual(waiting.waiting_sources[0].error.storage_request, request)
  atomicWrite(f.root, request.path, Buffer.alloc(body.length, 0))
  await assert.rejects(recoverCollection({ ...options, mode: "resume" }), /restored bytes differ/)
  atomicWrite(f.root, request.path, body)
  const resumed = await recoverCollection({ ...options, mode: "resume" })
  assert.equal(resumed.waiting_sources.length, 0)
  assert.equal(resumed.attempts[0].source_run, run)
  assert.equal(fs.existsSync(path.join(f.root, base + "list-scan.json")), false)
  assert.equal(sha256(fs.readFileSync(path.join(f.root, receiptPath))), receiptSha)
})

test("a pinned source-cooling receipt remains a source wait without an invented scan", async (t) => {
  const f = await fixture(t), daily = "daily-cooling", run = "cooling-attempt"
  const after = { state: "cooling_down", next_check_at: "2099-01-01T00:00:00.000Z" }
  const observation = { binding: { channel_id: f.channel.channel_id }, after }
  const observationPath = `collection-health/observations/${"a".repeat(64)}.json`
  const observationRef = atomicWrite(f.root, observationPath,
    { ...observation, checksum_sha256: sha256(JSON.stringify(observation)) })
  const receiptPath = `daily/runs/${daily}/receipts/${run}.json`
  const receipt = { schema: "research-daily-receipt/v2", daily_run: daily, attempt_id: run,
    channel_id: f.channel.channel_id, since: f.window.since, until_exclusive: f.window.until,
    status: "blocked", reason: "source_cooling_down", candidate_published: false,
    source_wait: { request_performed: false, next_check_at: after.next_check_at,
      next_action: "recheck_access_policy", observation: observationRef } }
  const receiptRef = atomicWrite(f.root, receiptPath, receipt)
  const report = { schema: "research-collection-report/v1", daily_run: daily,
    routes: [{ channel_id: f.channel.channel_id, windows: [{ channel_id: f.channel.channel_id,
      since: f.window.since, until_exclusive: f.window.until, status: "incomplete",
      attempts: [{ run_id: run, status: receipt.status, reason: receipt.reason }] }] }],
    evidence: [receiptRef] }
  const reportRef = atomicWrite(f.root, "cooling-report.json", report)
  const options = { ...f, reportPath: reportRef.path, reportSha256: reportRef.sha256,
    runId: "cooling-checkpoint", mode: "execute", scan: () => { throw Error("must not scan") } }
  const planned = await recoverCollection({ ...options, runId: "cooling-plan", mode: "plan-only" })
  assert.equal(planned.waiting_sources[0].status, "source_cooling_down")
  assert.equal(planned.waiting_sources[0].next_check_at, after.next_check_at)
  const waiting = await recoverCollection(options)
  assert.equal(waiting.waiting_sources[0].status, "source_cooling_down")
  assert.equal(waiting.waiting_sources[0].next_check_at, after.next_check_at)
  assert.equal(waiting.attempts.length, 0)
  assert.equal(fs.existsSync(path.join(f.root, `runs/${run}`)), false)
  atomicWrite(f.root, observationPath, { ...observation, checksum_sha256: "changed" })
  await assert.rejects(recoverCollection({ ...options, runId: "cooling-tampered" }), /observation changed/)

  const invalidObservation = { binding: { channel_id: f.channel.channel_id },
    after: { state: "cooling_down", next_check_at: "not-a-date" } }
  const invalidRef = atomicWrite(f.root, observationPath,
    { ...invalidObservation, checksum_sha256: sha256(JSON.stringify(invalidObservation)) })
  const invalidReceiptRef = atomicWrite(f.root, receiptPath, { ...receipt, source_wait: {
    ...receipt.source_wait, next_check_at: "not-a-date", observation: invalidRef } })
  const invalidReportRef = atomicWrite(f.root, "cooling-invalid-report.json", { ...report, evidence: [invalidReceiptRef] })
  await assert.rejects(recoverCollection({ ...options, runId: "cooling-invalid",
    reportPath: invalidReportRef.path, reportSha256: invalidReportRef.sha256 }), /recheck time/)

  const dueAfter = { state: "cooling_down", next_check_at: "2001-01-01T00:00:00.000Z" }
  const dueObservation = { binding: { channel_id: f.channel.channel_id }, after: dueAfter }
  const dueRef = atomicWrite(f.root, observationPath,
    { ...dueObservation, checksum_sha256: sha256(JSON.stringify(dueObservation)) })
  const dueReceipt = { ...receipt, source_wait: { ...receipt.source_wait,
    next_check_at: dueAfter.next_check_at, observation: dueRef } }
  const dueReceiptRef = atomicWrite(f.root, receiptPath, dueReceipt)
  const dueReportRef = atomicWrite(f.root, "cooling-due-report.json", { ...report, evidence: [dueReceiptRef] })
  let scans = 0
  const due = await recoverCollection({ ...options, runId: "cooling-due",
    reportPath: dueReportRef.path, reportSha256: dueReportRef.sha256,
    publishReport: true,
    scan: (parameters) => {
      scans++
      assert.equal(parameters["recovery-source-run"], undefined)
      return f.scan(parameters)
    } })
  assert.equal(scans, 1)
  assert.equal(due.attempts[0].source_run, null)
  assert.equal(due.attempts[0].status, "incomplete")
  assert.equal(due.report?.status, "partial")
  assert.equal(due.report_wait, undefined)
})

test("an incomplete aggregate cannot hide a changed window, malformed array or checkpoint", async (t) => {
  const f = await fixture(t),
    base = "runs/initial/",
    summary = readJSON(f.root, base + "list-scan.json"),
    documents = readJSON(f.root, base + "documents.json"),
    parses = readJSON(f.root, base + "parses.json"),
    candidates = readJSON(f.root, base + "candidates.json")
  fs.unlinkSync(path.join(f.root, base, "parses.json"))
  atomicWrite(f.root, base + "candidates.json", { invalid: true })
  assert.throws(() => readRecoverySource(f.root, "initial"), /array|malformed/i)
  atomicWrite(f.root, base + "candidates.json", candidates)
  atomicWrite(f.root, base + "list-scan.json", {
    ...summary,
    window: { ...summary.window, since: "2026-01-01" },
  })
  assert.throws(() => readRecoverySource(f.root, "initial"), /input|window/i)
  atomicWrite(f.root, base + "list-scan.json", summary)
  atomicWrite(f.root, base + "parses.json", parses)
  fs.unlinkSync(path.join(f.root, base, "candidates.json"))
  assert.ok(documents.length && parses.length)
  atomicWrite(f.root, base + "documents.json", [{ ...documents[0], original_url: "https://changed.invalid/" }])
  assert.throws(() => readRecoverySource(f.root, "initial"), /aggregate document differs/i)
  atomicWrite(f.root, base + "documents.json", documents)
  atomicWrite(f.root, base + "parses.json", [{ ...parses[0], title: "changed" }])
  assert.throws(() => readRecoverySource(f.root, "initial"), /aggregate parse differs/i)
  atomicWrite(f.root, base + "parses.json", parses)
  const state = readJSON(f.root, base + "state.json"),
    checkpoint = Object.entries(state.stages).find(([name]) => name.startsWith("detail-"))?.[1]
  assert.ok(checkpoint?.result_path)
  atomicWrite(f.root, checkpoint.result_path, { changed: true })
  assert.throws(() => readRecoverySource(f.root, "initial"), /checkpoint hash changed/i)
})

test("a completed scan with a missing aggregate is not treated as incomplete recovery", async (t) => {
  const f = await fixture(t),
    base = "runs/initial/",
    summary = readJSON(f.root, base + "list-scan.json")
  atomicWrite(f.root, base + "list-scan.json", { ...summary, status: "window_scanned", reason: null })
  fs.unlinkSync(path.join(f.root, base, "parses.json"))
  assert.throws(() => readRecoverySource(f.root, "initial"), /missing|aggregate/i)
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
