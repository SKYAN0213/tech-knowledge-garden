import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { freezeStoredSourceFrontier, buildCollectionReport, saveCollectionReport, readCollectionMaterial } from "../scripts/research/collection-report.mjs"
import { scanBoundedRSSRoute } from "../scripts/research/rss-scan.mjs"
import { freezeEdition } from "../scripts/research/event-pipeline.mjs"
import { freezeShadowCollectionInputs } from "../scripts/research/shadow-collection-basis.mjs"
import { RunState, atomicWrite } from "../scripts/research/run-state.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"

async function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "stored-frontier-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const make = async (id, channelId, blocked, old = false) => {
    const url = `https://example.org/${id}/feed`, channel = { channel_id: channelId, method: "rss", url, language: "en", allowed_hosts: ["example.org"], item_pattern: "^https://example\\.org/articles/[^/?#]+$", scan_max_details: 10, sectors: ["AI"], region: "해외", axis: "기술·제품", publisher_id: "example.org", listing_profile: { pagination: "bounded-feed", rule_id: "fixture-feed-v1", feed_title: "Fixture", max_items: 20, guid_is_permalink: true } }
    const basis = { schema: "research-collection-basis/v1", channel_id: channelId, route_sha256: sha256(JSON.stringify(channel)) }
    const window = old ? { since: "2026-10-07", until: "2026-10-10" } : { since: "2026-10-09", until: "2026-10-12" }
    const input = { schema: "research-list-run-input/v2", channel_id: channelId, since: window.since, until_exclusive: window.until, reuse_listing_run: null, collection_basis: basis, ...(old ? {} : { policy_recheck_limit: 0 }) }
    const run = new RunState(root, id, input)
    await run.stage("collection-basis", basis, async () => basis)
    const xml = `<rss version="2.0"><channel><title>Fixture</title><description>Controlled test feed</description><link>https://example.org</link><item><title>Older test article</title><link>https://example.org/articles/old</link><guid>https://example.org/articles/old</guid><pubDate>Tue, 06 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>`
    const sid = sourceId(url), bodyHash = sha256(xml), observed = old ? "2026-10-08T01:00:01Z" : new Date().toISOString()
    const document = { ...(blocked ? { request_performed: false } : { schema_version: "source-document/v1" }), source_id: sid, original_url: url, final_url: url, observed_at: observed, request_method: "GET", fetch_status: blocked ? "blocked" : "captured", policy_status: "checked", policy: { allowed: !blocked }, ...(blocked ? {} : { http_status: 200, mime_type: "application/rss+xml", source_version_id: `${sid}:${bodyHash}`, body_sha256: bodyHash, body_path: `documents/${sid}/${bodyHash}/body.bin` }) }
    if (!blocked) atomicWrite(root, document.body_path, xml)
    const scan = await scanBoundedRSSRoute(root, run, {}, channel, [], window, { fetchPolicy: async () => document, parseArticle: () => { throw Error("Unexpected source or model request") } })
    for (const [name, value] of Object.entries({ "list-scan": scan.summary, documents: scan.documents, parses: scan.parses, candidates: scan.candidates, "list-pages": scan.indexDocuments })) atomicWrite(root, `runs/${id}/${name}.json`, value)
    if (old) {
      const state = JSON.parse(fs.readFileSync(path.join(root, `runs/${id}/state.json`)))
      state.started_at = "2026-10-08T01:00:00Z"
      for (const stage of Object.values(state.stages)) { stage.started_at = state.started_at; stage.finished_at = "2026-10-08T01:00:02Z" }
      atomicWrite(root, `runs/${id}/state.json`, state)
    }
    return { run_id: id, ...(old ? {} : { policy_recheck_limit: 0 }), document, scan }
  }
  const good = await make("current-good", "aws-whats-new-rss", false)
  const failed = await make("current-blocked", "google-cloud-threat-intelligence", true)
  const held = await make("old-held", "ieee-spectrum-robotics", true, true)
  const declaration = (row) => ({ run_id: row.run_id, ...(row.policy_recheck_limit === undefined ? {} : { policy_recheck_limit: row.policy_recheck_limit }) })
  const options = { root, runId: "daily-20261011-frontier-fixture", sourceRuns: [declaration(good), declaration(failed)], heldSources: [{ ...declaration(held), requested_window: { since: "2026-10-07", until_exclusive: "2026-10-12" }, reason: "No new permitted source input for the old failed interval" }] }
  return { root, good, failed, held, options }
}

test("stored frontier feeds the native report and edition builder with failed and held observations still partial", async (t) => {
  const f = await fixture(t), original = fs.readFileSync(path.join(f.root, "runs/old-held/state.json"))
  const input = await freezeStoredSourceFrontier(f.options), saved = await saveCollectionReport(f.options)
  const report = buildCollectionReport(f.options)
  assert.equal(report.status, "partial")
  assert.equal(report.acquisition_basis.total_active_routes, 63)
  assert.equal(report.acquisition_basis.newly_executed_windows, 2)
  assert.equal(report.acquisition_basis.successful_new_windows, 1)
  assert.equal(report.acquisition_basis.failed_new_windows, 1)
  assert.equal(report.acquisition_basis.held_route_observations, 1)
  assert.equal(report.counts.planned_windows, 3)
  assert.equal(report.counts.incomplete_windows, 2)
  assert.equal(report.counts.pending_windows, 0)
  assert.equal(report.timing.measured_receipts, 2)
  assert.equal(report.held_observations[0].observed_at, "2026-10-08T01:00:01Z")
  assert.equal(report.held_observations[0].window.until_exclusive, "2026-10-10")
  assert.equal(report.held_observations[0].requested_window.until_exclusive, "2026-10-12")
  assert.equal(report.acquisition_basis.report_source_requests_performed, 0)
  assert.equal(report.candidate_approved, false)
  assert.equal(report.candidate_published, false)
  assert.equal(readCollectionMaterial({ root: f.root, reportPath: saved.path, reportSha256: saved.sha256, materialId: report.materials[0].id }).blocks.length > 0, true)
  const edition = await freezeEdition({ root: f.root }, { run_id: "frontier-fixture-edition", report_path: saved.path, report_sha256: saved.sha256 })
  assert.equal(edition.status, "partial")
  assert.equal((await freezeStoredSourceFrontier(f.options)).sha256, input.sha256)
  assert.deepEqual(fs.readFileSync(path.join(f.root, "runs/old-held/state.json")), original)
})

test("stored frontier rejects a wrong declared policy value and changes to the original state, checkpoint, body or parse", async (t) => {
  const f = await fixture(t)
  await assert.rejects(freezeStoredSourceFrontier({ ...f.options, sourceRuns: [{ run_id: f.good.run_id, policy_recheck_limit: 1 }] }), /input, status or window changed/)
  await freezeStoredSourceFrontier(f.options)
  for (const file of ["runs/current-good/state.json", "runs/current-good/listing-fetch.json", f.good.document.body_path, `parses/${f.good.scan.parses[0].parse_id}/parse.json`]) {
    const absolute = path.join(f.root, file), before = fs.readFileSync(absolute)
    const changed = file.endsWith("body.bin") ? Buffer.from("Changed fixture bytes") : Buffer.from(JSON.stringify({ ...JSON.parse(before), fixture_tampered: true }))
    fs.writeFileSync(absolute, changed)
    assert.throws(() => buildCollectionReport(f.options), /changed|hash mismatch|checkpoint|differs/)
    fs.writeFileSync(absolute, before)
  }
  await assert.rejects(freezeStoredSourceFrontier({ ...f.options, sourceRuns: [{ run_id: f.good.run_id }] }), /input changed/)
  assert.throws(() => buildCollectionReport({ ...f.options, supplementalRuns: ["unfrozen"] }), /frozen separately/)
})

test("a native daily shadow input cannot coexist with a stored frontier on the same run", async (t) => {
  const f = await fixture(t), configFile = path.join(f.root, "fixture-shadow-config.json")
  fs.writeFileSync(configFile, "{}\n")
  const plan = { run_id: f.options.runId, config_sha256: sha256(`${configFile}:${sha256(fs.readFileSync(configFile))}`) }
  atomicWrite(f.root, `daily/runs/${plan.run_id}/plan.json`, plan)
  await freezeShadowCollectionInputs({ root: f.root, plan, activeRoutes: [{ channel_id: "aws-whats-new-rss" }], sourcePaths: [configFile], configFile })
  await assert.rejects(freezeStoredSourceFrontier(f.options), /cannot share a run/)
  assert.equal(fs.existsSync(path.join(f.root, `daily/runs/${plan.run_id}/source-frontier-inputs.json`)), false)
})

test("page-index observations retain native times when the summary omits a timestamp and reject a later daily-shadow collision", async (t) => {
  const f = await fixture(t), summary = { ...f.good.scan.summary }
  delete summary.observed_at
  delete summary.listing_source_version_id
  summary.pages = [{ page: 1, source_version_id: f.good.document.source_version_id }]
  atomicWrite(f.root, "runs/current-good/list-scan.json", summary)
  atomicWrite(f.root, "runs/current-good/list-pages.json", [f.good.document])
  await freezeStoredSourceFrontier(f.options)
  const report = buildCollectionReport(f.options)
  assert.equal(report.materials[0].observations[0].observed_at, f.good.document.observed_at)
  const manifest = JSON.parse(fs.readFileSync(path.join(f.root, `daily/runs/${f.options.runId}/source-frontier-inputs.json`)))
  assert.equal(manifest.source_runs[0].observation_basis, "native_listing_pages")
  assert.equal(manifest.source_runs[0].observed_at, f.good.document.observed_at)
  assert.equal(manifest.source_runs[0].listing_observations[0].source_version_id, f.good.document.source_version_id)
  const configFile = path.join(f.root, "fixture-late-shadow-config.json")
  fs.writeFileSync(configFile, "{}\n")
  const plan = { run_id: f.options.runId, config_sha256: sha256(`${configFile}:${sha256(fs.readFileSync(configFile))}`) }
  atomicWrite(f.root, `daily/runs/${plan.run_id}/plan.json`, plan)
  await freezeShadowCollectionInputs({ root: f.root, plan, activeRoutes: [{ channel_id: "aws-whats-new-rss" }], sourcePaths: [configFile], configFile })
  assert.throws(() => buildCollectionReport(f.options), /cannot share a run/)
})
