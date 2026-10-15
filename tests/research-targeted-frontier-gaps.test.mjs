import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { coverageGrid } from "../scripts/research/discovery.mjs"
import { targetedSourceQueries, executeTargetedSourceSearch } from "../scripts/research/source-targeted-search.mjs"
import { loadDailySearchBasis, loadStoredReportSearchBasis } from "../scripts/research/daily-search-basis.mjs"
import { freezeStoredSourceFrontier, saveCollectionReport } from "../scripts/research/collection-report.mjs"
import { module as collection } from "../scripts/research/modules/collection.mjs"
import { validateArguments } from "../scripts/research/modules/contracts.mjs"
import { RunState, atomicWrite } from "../scripts/research/run-state.mjs"
import { scanBoundedRSSRoute } from "../scripts/research/rss-scan.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"

const repo = fileURLToPath(new URL("../", import.meta.url))

async function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "targeted-frontier-gap-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sourceRuns = [], heldSources = []
  let bodyPath
  for (const [id, channelId, blocked, old] of [
    ["good", "aws-whats-new-rss", false, false],
    ["blocked", "google-cloud-threat-intelligence", true, false],
    ["held", "ieee-spectrum-robotics", true, true],
  ]) {
    const url = `https://example.org/${id}/feed`
    const channel = { channel_id: channelId, method: "rss", url, language: "en", allowed_hosts: ["example.org"], item_pattern: "^https://example\\.org/articles/[^/?#]+$", scan_max_details: 10, sectors: ["AI"], region: "해외", axis: "기술·제품", publisher_id: "example.org", listing_profile: { pagination: "bounded-feed", rule_id: "fixture-feed-v1", feed_title: "Fixture", max_items: 20, guid_is_permalink: true } }
    const basis = { schema: "research-collection-basis/v1", channel_id: channelId, route_sha256: sha256(JSON.stringify(channel)) }
    const window = old ? { since: "2026-10-07", until: "2026-10-10" } : { since: "2026-10-09", until: "2026-10-12" }
    const input = { schema: "research-list-run-input/v2", channel_id: channelId, since: window.since, until_exclusive: window.until, reuse_listing_run: null, collection_basis: basis, ...(old ? {} : { policy_recheck_limit: 0 }) }
    const run = new RunState(root, id, input)
    await run.stage("collection-basis", basis, async () => basis)
    const xml = '<rss version="2.0"><channel><title>Fixture</title><description>Controlled test feed</description><link>https://example.org</link><item><title>Older test article</title><link>https://example.org/articles/old</link><guid>https://example.org/articles/old</guid><pubDate>Tue, 06 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>'
    const sid = sourceId(url), bodyHash = sha256(xml)
    const document = { ...(blocked ? { request_performed: false } : { schema_version: "source-document/v1" }), source_id: sid, original_url: url, final_url: url, observed_at: old ? "2026-10-08T01:00:01Z" : "2026-10-11T02:00:01Z", request_method: "GET", fetch_status: blocked ? "blocked" : "captured", policy_status: "checked", policy: { allowed: !blocked }, ...(blocked ? {} : { http_status: 200, mime_type: "application/rss+xml", source_version_id: `${sid}:${bodyHash}`, body_sha256: bodyHash, body_path: `documents/${sid}/${bodyHash}/body.bin` }) }
    if (!blocked) { atomicWrite(root, document.body_path, xml); bodyPath = document.body_path }
    const scan = await scanBoundedRSSRoute(root, run, {}, channel, [], window, { fetchPolicy: async () => document, parseArticle: () => { throw Error("Source or model request is forbidden") } })
    for (const [name, value] of Object.entries({ "list-scan": scan.summary, documents: scan.documents, parses: scan.parses, candidates: scan.candidates, "list-pages": scan.indexDocuments })) atomicWrite(root, `runs/${id}/${name}.json`, value)
    const declaration = { run_id: id, ...(old ? {} : { policy_recheck_limit: 0 }) }
    if (old) heldSources.push({ ...declaration, requested_window: { since: "2026-10-07", until_exclusive: "2026-10-12" }, reason: "No new permitted source input; preserve the failed interval" })
    else sourceRuns.push(declaration)
  }
  const options = { root, runId: "targeted-frontier-fixture", sourceRuns, heldSources }
  await freezeStoredSourceFrontier(options)
  const saved = await saveCollectionReport(options)
  return { root, saved, bodyPath, ctx: { repo, root, vault: path.join(repo, "vault"), backlog: path.join(root, "backlog.json") } }
}

test("mixed partial cells recover only failed or pending routes, deduplicate hosts and retain the source gaps", () => {
  const base = { sectors: ["AI"], region: "해외", axis: "기술·제품", language: "en", kind: "research" }
  const routes = [
    { ...base, channel_id: "healthy", url: "https://healthy.example/news", status: "partial" },
    { ...base, channel_id: "failed", url: "https://failed.example/news", status: "failed" },
    { ...base, channel_id: "failed-alias", url: "https://failed.example/press", status: "failed" },
    { ...base, channel_id: "pending", url: "https://pending.example/news", status: "incomplete" },
    { ...base, channel_id: "excluded", url: "https://excluded.example/news", status: "failed", collection_mode: "excluded" },
  ]
  const coverage = coverageGrid(routes), before = JSON.stringify(coverage)
  const result = targetedSourceQueries(coverage, routes, "2026-10-11", { slotIds: ["0-1-0"], maxQueries: 1 })
  const queries = [...result.queries, ...result.deferred]
  assert.equal(queries.length, 2)
  assert.ok(queries.every((query) => ["failed", "failed-alias", "pending"].includes(query.source_channel_id)))
  assert.ok(queries.every((query) => query.coverage_status === "partial"))
  assert.equal(queries.find((query) => query.source_url.startsWith("https://failed.example")).recovery_route_ids.length, 2)
  assert.equal(JSON.stringify(coverage), before)
  const healthy = coverageGrid([routes[0]])
  assert.equal(targetedSourceQueries(healthy, routes, "2026-10-11", { slotIds: ["0-1-0"] }).queries.length, 0)
})

test("native stored report and daily-run lookup share one exact search basis, preserving original failed and held scope", async (t) => {
  const f = await fixture(t)
  const reportBefore = fs.readFileSync(path.join(f.root, f.saved.path))
  const basis = loadStoredReportSearchBasis(f.root, f.saved)
  assert.deepEqual(loadDailySearchBasis(f.root, "targeted-frontier-fixture"), basis)
  assert.equal(basis.reference.collection_status, "partial")
  assert.equal(basis.reference.latest_source_observed_at, "2026-10-11T02:00:01Z")
  assert.equal(basis.reference.kst_day, "2026-10-11")
  assert.equal(basis.reference.held_observations[0].observed_at, "2026-10-08T01:00:01Z")
  assert.equal(basis.reference.held_observations[0].window.until_exclusive, "2026-10-10")
  assert.equal(basis.reference.held_observations[0].requested_window.until_exclusive, "2026-10-12")
  assert.ok(basis.coverage.some((cell) => cell.failed_route_ids.includes("google-cloud-threat-intelligence")))
  assert.ok(basis.reference.route_geography.every((route) => route.publisher_country === null && route.publisher_country_status === "unknown"))
  const parameters = { run_id: "native-report-targeted", mode: "plan-only", report_path: f.saved.path, report_sha256: f.saved.sha256, max_queries: 2 }
  validateArguments(parameters, collection.operations.targeted.inputSchema, f.ctx)
  const result = await collection.operations.targeted.run(f.ctx, parameters)
  const plan = JSON.parse(fs.readFileSync(path.join(f.root, result.plan.path)))
  assert.equal(result.status, "planned")
  assert.equal(plan.basis_kind, "native-stored-frontier-report")
  assert.deepEqual(plan.daily_basis, basis.reference)
  assert.equal(result.coverage_complete, false)
  assert.equal(result.candidate_published, false)
  assert.equal(fs.existsSync(path.join(f.root, "runs/native-report-targeted/search.json")), false)
  assert.deepEqual(fs.readFileSync(path.join(f.root, f.saved.path)), reportBefore)
})

test("stored search report rejects wrong SHA, another root, copied path, self-hashed edits and native byte drift", async (t) => {
  const f = await fixture(t)
  assert.throws(() => loadStoredReportSearchBasis(f.root, { ...f.saved, sha256: "0".repeat(64) }), /SHA-256/)
  assert.throws(() => loadStoredReportSearchBasis(path.join(f.root, "other-root"), f.saved), /ENOENT/)
  atomicWrite(f.root, "copied-report.json", fs.readFileSync(path.join(f.root, f.saved.path)))
  assert.throws(() => loadStoredReportSearchBasis(f.root, { path: "copied-report.json", sha256: f.saved.sha256 }), /Native stored-frontier/)
  const edited = JSON.parse(fs.readFileSync(path.join(f.root, f.saved.path)))
  edited.status = "collected"
  const bytes = Buffer.from(JSON.stringify(edited, null, 2) + "\n"), digest = sha256(bytes)
  const editedPath = `daily/runs/targeted-frontier-fixture/collection-reports/${digest}.json`
  atomicWrite(f.root, editedPath, bytes)
  assert.throws(() => loadStoredReportSearchBasis(f.root, { path: editedPath, sha256: digest }), /differs from native/)
  fs.writeFileSync(path.join(f.root, f.bodyPath), "Changed raw bytes")
  assert.throws(() => loadStoredReportSearchBasis(f.root, f.saved), /hash mismatch|changed|differs/)
})

test("targeted report reference is paired, exclusive of day/daily bases and scoped to the selected root", async (t) => {
  const f = await fixture(t)
  const input = { repo, root: f.root, runId: "exclusive-input", mode: "plan-only", reportPath: f.saved.path, reportSha256: f.saved.sha256 }
  await assert.rejects(executeTargetedSourceSearch({ ...input, day: "2026-10-11" }), /one daily\/day\/report basis/)
  await assert.rejects(executeTargetedSourceSearch({ ...input, dailyRun: "targeted-frontier-fixture" }), /one daily\/day\/report basis/)
  await assert.rejects(executeTargetedSourceSearch({ ...input, reportSha256: undefined }), /one daily\/day\/report basis/)
  const p = { run_id: "scoped-input", mode: "plan-only", report_path: "../copied-report.json", report_sha256: f.saved.sha256 }
  assert.throws(() => validateArguments(p, collection.operations.targeted.inputSchema, f.ctx), /escapes working root/)
  assert.equal(fs.existsSync(path.join(f.root, "runs/exclusive-input/targeted-queries.json")), false)
})
