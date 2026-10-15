import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  summarizeCollection,
  readCollectionMaterial,
  createCollectionMaterialReader,
  sourceCollectionInventory,
} from "../scripts/research/collection-report.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"

function fixture() {
  const windows = ["a", "b", "c"].map((channel_id) => ({
    channel_id,
    since: "2026-10-01",
    until_exclusive: "2026-10-08",
  }))
  const plan = { run_id: "daily-20261009-test", windows }
  const receipt = (index, status) => ({
    ...windows[index],
    attempt_id: "attempt-" + index,
    status,
    started_at: "2026-10-09T01:00:00Z",
    finished_at: "2026-10-09T01:00:10Z",
    timing_ms: { total: 10000, scan: 9990, verify: 4, backlog_merge: 6 },
  })
  const document = {
    source_id: "source",
    source_version_id: "source:v1",
    observed_at: "2026-10-09T01:00:01Z",
    fetch_status: "captured",
    body_path: "body-v1.bin",
    body_sha256: "v1",
    original_url: "https://example.org/article",
  }
  const parsed = {
    source_version_id: document.source_version_id,
    parse_id: "parse-v1",
    title: "Article",
    dates: { published_at: "2026-10-02" },
    status: "extracted",
    blocks: [{ text: "Details" }],
  }
  const candidate = {
    article_source_version_id: document.source_version_id,
    article_parse_id: parsed.parse_id,
  }
  const scan = (channel_id) => ({
    run_id: channel_id,
    channel_id,
    documents: [document],
    parses: [parsed],
    candidates: [candidate],
    indexDocuments: [],
    summary: { details: [] },
  })
  return { plan, receipt, document, parsed, scan, sizeOf: () => 100 }
}

test("one source/parse across routes retains observations without duplicating materials or bytes", () => {
  const f = fixture(),
    receipts = [f.receipt(0, "window_scanned"), f.receipt(1, "incomplete")]
  const result = summarizeCollection({ ...f, receipts, scans: [f.scan("a"), f.scan("b")] })
  assert.equal(result.status, "partial")
  assert.equal(result.counts.collected_routes, 1)
  assert.equal(result.counts.incomplete_routes, 1)
  assert.equal(result.counts.pending_routes, 1)
  assert.equal(result.counts.materials, 1)
  assert.equal(result.materials[0].observations.length, 2)
  assert.equal(result.resources.referenced_raw_body_bytes, 100)
  assert.equal(result.resources.captured_response_body_bytes, 100)
  assert.equal(result.timing.wall_clock_ms, 10000)
  assert.equal(result.timing.summed_worker_elapsed_ms, 20000)
})

test("changed versions and parser results remain distinct and supplement does not complete a failed route", () => {
  const f = fixture(),
    second = f.scan("b")
  second.documents = [{ ...f.document, source_version_id: "source:v2", body_path: "body-v2.bin" }]
  second.parses = [{ ...f.parsed, source_version_id: "source:v2", parse_id: "parse-v2" }]
  second.candidates = []
  const result = summarizeCollection({
    ...f,
    receipts: [f.receipt(0, "incomplete")],
    scans: [f.scan("a")],
    supplemental: [second],
  })
  assert.equal(result.counts.materials, 2)
  assert.equal(result.counts.collected_routes, 0)
  assert.equal(result.resources.referenced_raw_body_bytes, 200)
  assert.equal(result.resources.network_wire_bytes, null)
  assert.equal(result.resources.full_run_peak_rss_bytes, null)
  assert.equal(result.resources.llm_calls, 0)
  assert.equal(result.candidate_approved, false)
})

test("a later successful attempt resolves the window while original failed details remain recorded", () => {
  const f = fixture(),
    failed = f.scan("a")
  failed.summary.details = [
    {
      url: "https://example.org/whitepaper",
      status: "article_outside_source_policy",
      fetched: false,
    },
  ]
  const receipts = [
    f.receipt(0, "incomplete"),
    f.receipt(0, "window_scanned"),
    f.receipt(1, "window_scanned"),
    f.receipt(2, "window_scanned"),
  ]
  const result = summarizeCollection({ ...f, receipts, scans: [failed] })
  assert.equal(result.status, "collected")
  assert.equal(result.routes[0].windows[0].attempts.length, 2)
  assert.equal(result.missing[0].fetched, false)
})

test("material reader rejects changed body, parse and report instead of serving stale evidence", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "collection-material-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const body = Buffer.from("source"),
    parsed = {
      source_id: "s",
      source_version_id: "s:v1",
      parse_id: "p",
      blocks: [{ text: "Original detail" }],
      links: [],
    },
    parseBytes = Buffer.from(JSON.stringify(parsed))
  fs.writeFileSync(path.join(root, "body.bin"), body)
  fs.writeFileSync(path.join(root, "parse.json"), parseBytes)
  const material = {
    id: "m",
    source_id: "s",
    source_version_id: "s:v1",
    parse_id: "p",
    body_path: "body.bin",
    body_sha256: sha256(body),
    parse_path: "parse.json",
    parse_sha256: sha256(parseBytes),
  }
  const reportBytes = Buffer.from(
    JSON.stringify({
      schema: "research-collection-report/v1",
      daily_run: "d",
      materials: [material],
    }),
  )
  fs.writeFileSync(path.join(root, "report.json"), reportBytes)
  const options = {
    root,
    reportPath: "report.json",
    reportSha256: sha256(reportBytes),
    materialId: "m",
  }
  const nativeRead = fs.readFileSync
  let reportReads = 0
  const watchedRead = t.mock.method(fs, "readFileSync", (file, ...args) => {
    if (file === path.join(root, "report.json")) reportReads++
    return nativeRead(file, ...args)
  })
  const cached = createCollectionMaterialReader(options)
  assert.equal(cached("m").blocks[0].text, "Original detail")
  assert.equal(cached("m").blocks[0].text, "Original detail")
  assert.equal(reportReads, 1, "one immutable report read per invocation, not one per material")
  watchedRead.mock.restore()
  assert.equal(readCollectionMaterial(options).blocks[0].text, "Original detail")
  assert.throws(() => readCollectionMaterial({ ...options, materialId: "other" }), /absent/)
  fs.writeFileSync(path.join(root, "body.bin"), "changed")
  assert.throws(() => readCollectionMaterial(options), /source or parse changed/)
  assert.throws(() => cached("m"), /source or parse changed/)
  fs.writeFileSync(path.join(root, "body.bin"), body)
  fs.writeFileSync(path.join(root, "parse.json"), JSON.stringify({ ...parsed, blocks: [] }))
  assert.throws(() => readCollectionMaterial(options), /source or parse changed/)
  fs.writeFileSync(path.join(root, "report.json"), "{}")
  assert.throws(() => readCollectionMaterial(options), /report SHA-256/)
})

test("a validated existing window contributes source material without another receipt or changing live timing", () => {
  const f = fixture()
  const result = summarizeCollection({
    ...f,
    receipts: [f.receipt(0, "window_scanned")],
    scans: [f.scan("a"), f.scan("b")],
    reusedWindows: [
      { window: f.plan.windows[1], source_run: "existing", reconciliation_run: "reconciled" },
    ],
  })
  assert.equal(result.counts.collected_windows, 2)
  assert.equal(result.counts.reused_windows, 1)
  assert.equal(result.counts.pending_windows, 1)
  assert.equal(result.timing.summed_worker_elapsed_ms, 10000)
  assert.equal(result.routes[1].windows[0].reused_coverage.source_run, "existing")
  assert.equal(result.materials[0].observations.length, 2)
})

test("inventory preserves route metadata and separates access observations from article selection", () => {
  const channels = {
    channels: [
      {
        id: "a",
        name: "A",
        url: "https://example.org/news",
        language: "de",
        region: "해외",
        axis: "기업·운영",
        kind: "company",
        sectors: ["로봇·제조"],
      },
    ],
  }
  const args = {
    channels,
    watchlist: {},
    acquisition: {},
    recipes: { recipes: {} },
    daily: { routes: [] },
    catalog: { entries: [] },
  }
  const unseen = sourceCollectionInventory(args)
  assert.equal(unseen.routes[0].language, "de")
  assert.equal(unseen.routes[0].axis, "기업·운영")
  assert.equal(unseen.routes[0].kind, "company")
  assert.deepEqual(unseen.routes[0].coverage_sectors, ["로봇·제조"])
  assert.equal(unseen.routes[0].access_observation, null)
  assert.equal(unseen.routes[0].article_evidence_status, "not_evaluated_in_inventory")
  assert.equal(unseen.routes[0].event_selection_status, "not_evaluated_in_inventory")
  const review = {
    reviewed_at: "2026-10-11T00:00:00Z",
    routes: [
      {
        channel_id: "a",
        url: "https://example.org/previous",
        role: "listing",
        observed_status: "accessible",
        audit_reference: { path: "audit.json", sha256: "a".repeat(64) },
      },
    ],
  }
  const historic = sourceCollectionInventory({ ...args, review })
  assert.equal(historic.routes[0].access_observation.url_matches_current, false)
  assert.equal(historic.routes[0].access_observation.role, "listing")
  assert.equal(historic.routes[0].access_observation.reviewed_at, review.reviewed_at)
  assert.equal(historic.routes[0].access_observation.status, "accessible")
  assert.equal(historic.routes[0].daily_enabled, false)
  assert.deepEqual(
    historic.routes[0].access_observation.audit_reference,
    review.routes[0].audit_reference,
  )
  review.routes[0].url = channels.channels[0].url
  const current = sourceCollectionInventory({ ...args, review })
  assert.equal(current.routes[0].access_observation.url_matches_current, true)
  assert.equal(current.routes[0].article_evidence_status, "not_evaluated_in_inventory")
})

test("inventory reports overlapping counts and does not promote registered entries to daily routes", () => {
  const channels = {
    channels: [
      {
        id: "a",
        name: "A",
        url: "https://example.org",
        language: "en",
        sectors: ["로봇·제조"],
        kind: "company",
      },
    ],
  }
  const result = sourceCollectionInventory({
    channels,
    watchlist: {},
    acquisition: {},
    recipes: { recipes: {} },
    daily: { routes: [] },
    catalog: { entries: [{ id: "X01" }] },
  })
  assert.equal(result.registered_routes, 1)
  assert.equal(result.active_daily_routes, 0)
  assert.equal(result.catalog_entries, 1)
  assert.equal(result.counts_overlap, true)
  assert.equal(result.routes[0].collection_configuration_present, false)
  assert.equal(result.routes[0].access_resolution, null)
  const resolution = {
    state: "policy_endpoint_failed",
    http_status: 400,
    evidence_run: "failed-policy",
  }
  channels.channels[0].onboarding = {
    status: "configured",
    collection_enabled: true,
    access_resolution: resolution,
  }
  const blocked = sourceCollectionInventory({
    channels,
    watchlist: {},
    acquisition: {},
    recipes: { recipes: {} },
    daily: { routes: [] },
    catalog: { entries: [] },
  })
  assert.deepEqual(blocked.routes[0].access_resolution, resolution)
  assert.equal(blocked.routes[0].daily_enabled, false)
  assert.equal(blocked.routes[0].phase, "validation_pending")
})
