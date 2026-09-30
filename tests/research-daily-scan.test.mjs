import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { planDailyWindows } from "../scripts/research/daily-plan.mjs"
import { storeParseArtifact } from "../scripts/research/parser.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import {
  applyDailyReceipts,
  bootstrapCoverage,
  dailyPlanningBasis,
  executeDailyPlan,
  repairDailyCoverageState,
  storedListScan,
  validateStoredDailyPlan,
  verifiedDriveEdition,
  verifyStoredListScan,
} from "../scripts/research/daily-scan.mjs"

const temporary = (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-daily-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}
const route = (channel_id, region) => ({
  channel_id,
  region,
  axis: "기술·제품",
  sectors: ["로봇·제조"],
})
const initialCoverage = () => ({
  schema: "research-daily-coverage/v1",
  routes: Object.fromEntries(
    ["fanuc-en", "route-hd-news-ko"].map((id) => [
      id,
      {
        baseline_run: "baseline",
        anchor_since: "2026-09-01",
        covered: [
          {
            since: "2026-09-01",
            until_exclusive: "2026-09-21",
            source_run: "baseline",
          },
        ],
        unresolved: [],
        last_contiguous_until: "2026-09-21",
      },
    ]),
  ),
})
const plan = {
  schema: "research-daily-plan/v1",
  run_id: "daily-20260929",
  kst_day: "2026-09-29",
  windows: [
    { channel_id: "fanuc-en", since: "2026-09-21", until_exclusive: "2026-09-28" },
    { channel_id: "route-hd-news-ko", since: "2026-09-21", until_exclusive: "2026-09-28" },
  ],
}

test("stored daily windows must match their frozen verified coverage basis", () => {
  const config = { lookback_days: 7, max_window_days: 7 }
  const activeRoutes = [
    { channel_id: "fanuc-en", baseline_run: "baseline" },
    { channel_id: "route-hd-news-ko", baseline_run: "baseline" },
  ]
  const edition = {
    cutoff: "2026-09-21T08:00:00+09:00",
    edition: "2026-09-21_0800",
    file_sha256: "edition-sha",
    authority: "local_vault_unreconciled",
  }
  const coverage = initialCoverage()
  const coverage_basis = dailyPlanningBasis(coverage, activeRoutes)
  const created_at = "2026-09-29T00:00:00.000Z"
  const storedPlan = {
    ...planDailyWindows({
      runId: "daily-20260929",
      now: created_at,
      cutoff: edition.cutoff,
      config,
      activeRoutes,
      coverage: coverage_basis,
    }),
    created_at,
    config_sha256: "config-sha",
    edition,
    coverage_basis,
    coverage_basis_sha256: sha256(JSON.stringify(coverage_basis)),
  }
  const inputs = {
    runId: storedPlan.run_id,
    config,
    activeRoutes,
    configSha: "config-sha",
    edition,
  }
  assert.equal(validateStoredDailyPlan(storedPlan, inputs), true)
  coverage.routes["fanuc-en"].last_contiguous_until = "2026-09-29"
  assert.equal(validateStoredDailyPlan(storedPlan, inputs), true)
  const missing = structuredClone(storedPlan)
  missing.windows.shift()
  assert.throws(() => validateStoredDailyPlan(missing, inputs), /windows differ/)
  const changed = structuredClone(storedPlan)
  changed.windows[0].since = "2026-09-22"
  assert.throws(() => validateStoredDailyPlan(changed, inputs), /windows differ/)
  const tamperedBasis = structuredClone(storedPlan)
  tamperedBasis.coverage_basis.routes["fanuc-en"].last_contiguous_until = "2026-09-22"
  assert.throws(() => validateStoredDailyPlan(tamperedBasis, inputs), /inputs changed/)
  assert.throws(
    () =>
      validateStoredDailyPlan(storedPlan, { ...inputs, activeRoutes: activeRoutes.toReversed() }),
    /windows differ/,
  )
})

test("a supplied Drive export must be fresh and byte-identical to all local authoring roots", (t) => {
  const repository = temporary(t)
  const vault = path.join(repository, "vault")
  const files = Object.fromEntries(
    ["Editions", "Knowledge", "Signals", "TrendTopics"].map((root) => [
      `${root}/sample.md`,
      root === "Editions"
        ? "---\ndate: 2026-09-29\ncoverage_end: 2026-09-28T23:00:00Z\n---\n\n# Briefing\n"
        : `# ${root}\n`,
    ]),
  )
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(vault, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }
  const snapshot = {
    schema: "tech-drive-source/v1",
    root_folder_id: "1VKWSC2IYOtOd__3NKEzD-BK34qVqtlAD",
    roots: ["Editions", "Knowledge", "Signals", "TrendTopics"],
    complete: true,
    exported_at: new Date().toISOString(),
    files: Object.entries(files).map(([name, content]) => ({
      path: name,
      content,
      sha256: sha256(content),
    })),
  }
  const snapshotFile = path.join(repository, "drive-snapshot.json")
  fs.writeFileSync(snapshotFile, JSON.stringify(snapshot))
  const edition = verifiedDriveEdition(snapshotFile, vault)
  assert.equal(edition.authority, "provided_drive_snapshot_matched")
  assert.equal(edition.source_files, 4)
  assert.match(edition.snapshot_file_sha256, /^[a-f0-9]{64}$/)
  fs.writeFileSync(path.join(vault, "Knowledge/sample.md"), "local edit")
  assert.throws(() => verifiedDriveEdition(snapshotFile, vault), /differs from the supplied/)
  fs.writeFileSync(path.join(vault, "Knowledge/sample.md"), files["Knowledge/sample.md"])
  snapshot.exported_at = "2020-01-01T00:00:00Z"
  fs.writeFileSync(snapshotFile, JSON.stringify(snapshot))
  assert.throws(() => verifiedDriveEdition(snapshotFile, vault), /stale/)
})

test("daily plan freezes the supplied Drive snapshot identity", () => {
  const config = { lookback_days: 7, max_window_days: 7 }
  const activeRoutes = [{ channel_id: "fanuc-en", baseline_run: "baseline" }]
  const edition = {
    cutoff: "2026-09-21T08:00:00+09:00",
    edition: "2026-09-21_0800",
    file_sha256: "edition-sha",
    authority: "provided_drive_snapshot_matched",
    snapshot_sha256: "a".repeat(64),
    snapshot_file_sha256: "b".repeat(64),
    exported_at: "2026-09-29T00:00:00Z",
    source_files: 4,
  }
  const coverage_basis = dailyPlanningBasis(initialCoverage(), activeRoutes)
  const created_at = "2026-09-29T00:00:00.000Z"
  const plan = {
    ...planDailyWindows({
      runId: "daily-20260929",
      now: created_at,
      cutoff: edition.cutoff,
      cutoffBasis: edition.authority,
      config,
      activeRoutes,
      coverage: coverage_basis,
    }),
    created_at,
    config_sha256: "config-sha",
    edition,
    coverage_basis,
    coverage_basis_sha256: sha256(JSON.stringify(coverage_basis)),
  }
  const inputs = { runId: plan.run_id, config, activeRoutes, configSha: "config-sha", edition }
  assert.equal(validateStoredDailyPlan(plan, inputs), true)
  const changed = { ...edition, snapshot_file_sha256: "c".repeat(64) }
  assert.throws(
    () => validateStoredDailyPlan(plan, { ...inputs, edition: changed }),
    /inputs changed/,
  )
})

test("stored scan accepts a canonical candidate URL matching its exact article source version", (t) => {
  const root = temporary(t)
  const original_url = "https://example.com/blog/topics/security/article/"
  const body = Buffer.from("<article>Verified article</article>")
  const source_id = sourceId(original_url)
  const body_sha256 = sha256(body)
  const source_version_id = `${source_id}:${body_sha256}`
  const body_path = `sources/${source_id}/body.html`
  atomicWrite(root, body_path, body)
  const document = {
    original_url,
    source_id,
    source_version_id,
    fetch_status: "captured",
    body_path,
    body_sha256,
    observed_at: "2026-09-29T00:00:00Z",
  }
  const parse_id = sha256(source_version_id + ":test-parse")
  const parse = storeParseArtifact(root, {
    schema_version: "source-parse/v1",
    status: "extracted",
    title: "Verified article",
    source_id,
    source_version_id,
    parse_id,
    dates: { published_at: "2026-09-25", observed_at: document.observed_at },
    blocks: [
      {
        block_id: parse_id + ":block-1",
        text: "Verified article",
        locator: { text_hash: sha256("Verified article") },
      },
    ],
    quality: { required_fields_present: true, missing_pages: [] },
  })
  const scan = {
    summary: {
      status: "window_scanned",
      channel_id: "official-feed",
      window: { since: "2026-09-22", until_exclusive: "2026-09-29" },
      candidate_count: 1,
    },
    indexDocuments: [document],
    documents: [document],
    parses: [parse],
    candidates: [
      {
        source_urls: ["https://example.com/blog/topics/security/article"],
        source_published_at: "2026-09-25",
        article_source_version_id: source_version_id,
        article_parse_id: parse_id,
      },
    ],
  }
  assert.equal(
    verifyStoredListScan(root, scan, {
      channel_id: "official-feed",
      since: "2026-09-22",
      until_exclusive: "2026-09-29",
    }),
    true,
  )
  scan.candidates[0].source_urls = ["https://example.com/blog/topics/security/another"]
  assert.throws(
    () =>
      verifyStoredListScan(root, scan, {
        channel_id: "official-feed",
        since: "2026-09-22",
        until_exclusive: "2026-09-29",
      }),
    /matching stored detail/,
  )
})

function writeStoredEmptyScan(root, runId, { channel_id, since, until_exclusive, url }) {
  const body = Buffer.from('{"items":[]}')
  const body_sha256 = sha256(body)
  const body_path = `sources/${sourceId(url)}.html`
  atomicWrite(root, body_path, body)
  const result = {
    summary: {
      status: "window_scanned",
      channel_id,
      window: { since, until_exclusive },
      candidate_count: 0,
    },
    indexDocuments: [
      {
        original_url: url,
        source_id: sourceId(url),
        source_version_id: `${sourceId(url)}:${body_sha256}`,
        fetch_status: "captured",
        body_path,
        body_sha256,
      },
    ],
    documents: [],
    parses: [],
    candidates: [],
  }
  for (const [file, value] of Object.entries({
    "list-scan.json": result.summary,
    "list-pages.json": result.indexDocuments,
    "documents.json": result.documents,
    "parses.json": result.parses,
    "candidates.json": result.candidates,
  }))
    atomicWrite(root, `runs/${runId}/${file}`, value)
  return { result, body_path }
}

test("a failed route is retried without rescanning a completed route or advancing its coverage", async (t) => {
  const root = temporary(t)
  const calls = [],
    merges = []
  const stored = new Map()
  let hdAttempts = 0
  const scan = async (window, id) => {
    calls.push(id)
    const fail = window.channel_id === "route-hd-news-ko" && hdAttempts++ === 0
    const result = {
      summary: {
        status: fail ? "incomplete" : "window_scanned",
        reason: fail ? "detail_incomplete" : null,
      },
      candidates: [{ key: `source-${window.channel_id}` }],
    }
    stored.set(id, result)
    return result
  }
  const merge = async (result) => {
    merges.push(result.candidates[0].key)
    return { status: "merged", changed: true }
  }
  const args = {
    root,
    plan,
    coverage: initialCoverage(),
    activeRoutes: [
      { route: route("fanuc-en", "해외") },
      { route: route("route-hd-news-ko", "국내") },
    ],
    scan,
    loadStored: (_, id) => stored.get(id),
    verify: () => true,
    merge,
  }
  const first = await executeDailyPlan(args)
  assert.equal(first.status, "partial")
  assert.equal(first.receipts, 2)
  assert.equal(
    readJSON(root, "daily/route-coverage.json").routes["fanuc-en"].last_contiguous_until,
    "2026-09-28",
  )
  assert.equal(
    readJSON(root, "daily/route-coverage.json").routes["route-hd-news-ko"].last_contiguous_until,
    "2026-09-21",
  )
  assert.equal(
    readJSON(root, "daily/route-coverage.json").routes["route-hd-news-ko"].unresolved.length,
    1,
  )
  assert.deepEqual(merges, ["source-fanuc-en"])

  const second = await executeDailyPlan(args)
  assert.equal(second.status, "configured_routes_scanned")
  assert.equal(second.receipts, 3)
  assert.equal(
    readJSON(root, "daily/route-coverage.json").routes["route-hd-news-ko"].last_contiguous_until,
    "2026-09-28",
  )
  assert.equal(
    readJSON(root, "daily/route-coverage.json").routes["route-hd-news-ko"].unresolved.length,
    0,
  )
  assert.deepEqual(merges, ["source-fanuc-en", "source-route-hd-news-ko"])
  const third = await executeDailyPlan(args)
  assert.deepEqual(third, second)
  assert.equal(calls.length, 3)
})

test("resume rejects a completed receipt whose stored listing body is corrupted", async (t) => {
  const root = temporary(t)
  const url = "https://example.com/news"
  let bodyPath
  const oneRoutePlan = { ...plan, windows: [plan.windows[0]] }
  const args = {
    root,
    plan: oneRoutePlan,
    coverage: initialCoverage(),
    activeRoutes: [{ route: route("fanuc-en", "해외") }],
    scan: async (window, id) => {
      bodyPath = writeStoredEmptyScan(root, id, { ...window, url }).body_path
      return storedListScan(root, id)
    },
    merge: async () => ({ status: "merged", changed: false }),
  }
  await executeDailyPlan(args)
  const coverageBefore = fs.readFileSync(path.join(root, "daily/route-coverage.json"))
  fs.writeFileSync(path.join(root, bodyPath), "corrupted")
  await assert.rejects(() => executeDailyPlan(args), /hash mismatch/)
  assert.deepEqual(fs.readFileSync(path.join(root, "daily/route-coverage.json")), coverageBefore)
})

test("a new plan rejects old coverage when its completed source run has lost evidence", (t) => {
  const root = temporary(t)
  const baseline = "baseline-run"
  const prior = "daily-20260928_fanuc-en_20260921_20260928_a1"
  writeStoredEmptyScan(root, baseline, {
    channel_id: "fanuc-en",
    since: "2026-09-01",
    until_exclusive: "2026-09-21",
    url: "https://example.com/baseline",
  })
  const { body_path } = writeStoredEmptyScan(root, prior, {
    channel_id: "fanuc-en",
    since: "2026-09-21",
    until_exclusive: "2026-09-28",
    url: "https://example.com/daily",
  })
  const coverage = initialCoverage()
  coverage.routes = {
    "fanuc-en": {
      baseline_run: baseline,
      anchor_since: "2026-09-01",
      covered: [
        { since: "2026-09-01", until_exclusive: "2026-09-21", source_run: baseline },
        {
          since: "2026-09-21",
          until_exclusive: "2026-09-28",
          source_run: prior,
          kind: "daily_scan",
        },
      ],
      unresolved: [],
      last_contiguous_until: "2026-09-28",
    },
  }
  const routes = [{ channel_id: "fanuc-en", baseline_run: baseline }]
  assert.equal(
    bootstrapCoverage(root, routes, coverage).routes["fanuc-en"].last_contiguous_until,
    "2026-09-28",
  )
  fs.writeFileSync(path.join(root, body_path), "corrupted")
  assert.throws(() => bootstrapCoverage(root, routes, coverage), /hash mismatch/)
})

test("a verified baseline can replace the same window without losing daily evidence or failures", (t) => {
  const root = temporary(t)
  const previous = "baseline-previous"
  const replacement = "baseline-replacement"
  const base = {
    channel_id: "fanuc-en",
    since: "2026-09-23",
    until_exclusive: "2026-09-30",
  }
  const oldDocument = writeStoredEmptyScan(root, previous, {
    ...base,
    url: "https://example.com/previous",
  })
  writeStoredEmptyScan(root, replacement, {
    ...base,
    url: "https://example.com/replacement",
  })
  const daily = "daily-20260930_fanuc-en_20260923_20260930_a1"
  writeStoredEmptyScan(root, daily, { ...base, url: "https://example.com/daily" })
  const coverage = {
    schema: "research-daily-coverage/v1",
    routes: {
      "fanuc-en": {
        baseline_run: previous,
        anchor_since: base.since,
        covered: [
          {
            since: base.since,
            until_exclusive: base.until_exclusive,
            source_run: previous,
            kind: "verified_baseline",
          },
          {
            since: base.since,
            until_exclusive: base.until_exclusive,
            source_run: daily,
            kind: "daily_scan",
          },
        ],
        unresolved: [
          { since: base.since, until_exclusive: base.until_exclusive, reason: "detail_incomplete" },
        ],
      },
    },
  }
  const next = bootstrapCoverage(
    root,
    [{ channel_id: "fanuc-en", baseline_run: replacement }],
    coverage,
  )
  const state = next.routes["fanuc-en"]
  assert.equal(state.baseline_run, replacement)
  assert.equal(state.last_contiguous_until, base.until_exclusive)
  assert.deepEqual(
    state.covered.map((span) => span.source_run),
    [replacement, daily],
  )
  assert.deepEqual(state.unresolved, coverage.routes["fanuc-en"].unresolved)
  assert.equal(coverage.routes["fanuc-en"].baseline_run, previous)
  fs.writeFileSync(path.join(root, oldDocument.body_path), "corrupted")
  assert.throws(
    () =>
      bootstrapCoverage(root, [{ channel_id: "fanuc-en", baseline_run: replacement }], coverage),
    /hash mismatch/,
  )
})

test("baseline replacement rejects a different window", (t) => {
  const root = temporary(t)
  writeStoredEmptyScan(root, "baseline-previous", {
    channel_id: "fanuc-en",
    since: "2026-09-23",
    until_exclusive: "2026-09-30",
    url: "https://example.com/previous",
  })
  writeStoredEmptyScan(root, "baseline-replacement", {
    channel_id: "fanuc-en",
    since: "2026-09-24",
    until_exclusive: "2026-09-30",
    url: "https://example.com/replacement",
  })
  const coverage = {
    schema: "research-daily-coverage/v1",
    routes: {
      "fanuc-en": {
        baseline_run: "baseline-previous",
        anchor_since: "2026-09-23",
        covered: [
          {
            since: "2026-09-23",
            until_exclusive: "2026-09-30",
            source_run: "baseline-previous",
            kind: "verified_baseline",
          },
        ],
        unresolved: [],
      },
    },
  }
  assert.throws(
    () =>
      bootstrapCoverage(
        root,
        [{ channel_id: "fanuc-en", baseline_run: "baseline-replacement" }],
        coverage,
      ),
    /baseline changed/,
  )
})

test("a failed overlap scan stays unresolved even when an older baseline covers that date", () => {
  const coverage = initialCoverage()
  coverage.routes["fanuc-en"].covered[0].until_exclusive = "2026-09-28"
  coverage.routes["fanuc-en"].last_contiguous_until = "2026-09-28"
  const receipt = {
    schema: "research-daily-receipt/v1",
    daily_run: plan.run_id,
    attempt_id: "attempt-1",
    channel_id: "fanuc-en",
    since: "2026-09-21",
    until_exclusive: "2026-09-28",
    status: "incomplete",
    reason: "date_conflict",
  }
  const next = applyDailyReceipts(coverage, plan, [receipt])
  assert.equal(next.routes["fanuc-en"].last_contiguous_until, "2026-09-28")
  assert.equal(next.routes["fanuc-en"].unresolved.length, 1)
})

test("a scan made today cannot confirm the rest of today's calendar day", () => {
  const coverage = initialCoverage()
  coverage.routes["fanuc-en"].covered[0].until_exclusive = "2026-09-28"
  const today = {
    ...plan,
    windows: [{ channel_id: "fanuc-en", since: "2026-09-28", until_exclusive: "2026-09-30" }],
  }
  const receipt = {
    schema: "research-daily-receipt/v1",
    daily_run: today.run_id,
    attempt_id: "daily-20260929_fanuc-en_20260928_20260930_a1",
    channel_id: "fanuc-en",
    since: "2026-09-28",
    until_exclusive: "2026-09-30",
    status: "window_scanned",
  }
  const next = applyDailyReceipts(coverage, today, [receipt])
  assert.equal(next.routes["fanuc-en"].last_contiguous_until, "2026-09-29")
  assert.equal(next.routes["fanuc-en"].covered.at(-1).until_exclusive, "2026-09-29")
  const previouslySaved = structuredClone(next.routes["fanuc-en"])
  previouslySaved.covered.at(-1).until_exclusive = "2026-09-30"
  assert.equal(repairDailyCoverageState(previouslySaved).last_contiguous_until, "2026-09-29")
})

test("stored empty windows still need intact listing bytes", (t) => {
  const root = temporary(t)
  const url = "https://example.com/news"
  const body = Buffer.from('{"items":[]}')
  const body_sha256 = sha256(body)
  atomicWrite(root, "sources/listing.html", body)
  const document = {
    original_url: url,
    source_id: sourceId(url),
    source_version_id: `${sourceId(url)}:${body_sha256}`,
    fetch_status: "captured",
    body_path: "sources/listing.html",
    body_sha256,
  }
  const expected = {
    channel_id: "example",
    since: "2026-09-21",
    until_exclusive: "2026-09-28",
  }
  const scan = {
    summary: {
      status: "window_scanned",
      channel_id: "example",
      window: expected,
      candidate_count: 0,
    },
    indexDocuments: [document],
    documents: [],
    parses: [],
    candidates: [],
  }
  assert.equal(verifyStoredListScan(root, scan, expected), true)
  fs.writeFileSync(path.join(root, "sources/listing.html"), "altered")
  assert.throws(() => verifyStoredListScan(root, scan, expected), /hash mismatch/)
})
