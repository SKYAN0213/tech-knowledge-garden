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
  createDailySourceScanner,
  dailyPlanningBasis,
  executeDailyPlan,
  reconcileSupplementalScan,
  supplementalCoverageReceiptForWindow,
  repairDailyCoverageState,
  storedListScan,
  validateStoredDailyPlan,
  verifiedDriveEdition,
  verifyDailyReceipts,
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
    dates: { published_at: "2026-09-25T13:10:02+00:00", observed_at: document.observed_at },
    blocks: [
      {
        block_id: parse_id + ":block-1",
        text: "Verified article",
        locator: { text_hash: sha256("Verified article") },
      },
    ],
    quality: { required_fields_present: true, missing_pages: [] },
    attachments: [{ url: "https://example.com/blog/strategy.pdf", role: "unreviewed" }],
  })
  const supportingURL = "https://example.com/blog/strategy.pdf"
  const supportingBody = Buffer.from("Verified supporting report")
  const supportingId = sourceId(supportingURL)
  const supportingBodyHash = sha256(supportingBody)
  const supportingVersion = `${supportingId}:${supportingBodyHash}`
  const supportingPath = `sources/${supportingId}/body.pdf`
  atomicWrite(root, supportingPath, supportingBody)
  const supportingParseId = sha256(supportingVersion + ":supporting-parse")
  const supportingParse = storeParseArtifact(root, {
    schema_version: "source-parse/v1",
    status: "extracted",
    title: "Verified supporting report",
    source_id: supportingId,
    source_version_id: supportingVersion,
    parse_id: supportingParseId,
    dates: { published_at: null, observed_at: document.observed_at },
    blocks: [
      {
        block_id: supportingParseId + ":block-1",
        text: "Verified supporting report",
        locator: { text_hash: sha256("Verified supporting report") },
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
    documents: [
      document,
      {
        original_url: supportingURL,
        source_id: supportingId,
        source_version_id: supportingVersion,
        fetch_status: "captured",
        body_path: supportingPath,
        body_sha256: supportingBodyHash,
        observed_at: document.observed_at,
      },
    ],
    parses: [parse, supportingParse],
    candidates: [
      {
        source_urls: ["https://example.com/blog/topics/security/article"],
        source_published_at: "2026-09-25",
        article_source_version_id: source_version_id,
        article_parse_id: parse_id,
        supporting_source_urls: [supportingURL],
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
  const supportingDocuments = scan.documents
  const supportingParses = scan.parses
  scan.documents = [document]
  scan.parses = [parse]
  assert.throws(
    () =>
      verifyStoredListScan(root, scan, {
        channel_id: "official-feed",
        since: "2026-09-22",
        until_exclusive: "2026-09-29",
      }),
    /supporting source document is missing/,
  )
  scan.documents = supportingDocuments
  scan.parses = supportingParses
  scan.candidates[0].source_published_at = "2026-09-26"
  assert.throws(
    () =>
      verifyStoredListScan(root, scan, {
        channel_id: "official-feed",
        since: "2026-09-22",
        until_exclusive: "2026-09-29",
      }),
    /publication day/,
  )
  scan.candidates[0].source_published_at = "2026-09-25"
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

test("daily receipts measure scan, verification and candidate merge time across resume", async (t) => {
  const root = temporary(t)
  const oneWindowPlan = { ...plan, windows: [plan.windows[0]] }
  let scans = 0
  const stored = new Map()
  const args = {
    root,
    sameEventAliases: new Map(),
    plan: oneWindowPlan,
    coverage: initialCoverage(),
    activeRoutes: [{ route: route("fanuc-en", "해외") }],
    scan: async (window, id) => {
      scans++
      await new Promise((resolve) => setTimeout(resolve, 12))
      const result = {
        summary: { status: "window_scanned" },
        candidates: [{ key: "candidate-one" }],
      }
      stored.set(id, result)
      return result
    },
    verify: async () => new Promise((resolve) => setTimeout(resolve, 12)),
    loadStored: (_, id) => stored.get(id),
    merge: async () => {
      await new Promise((resolve) => setTimeout(resolve, 12))
      return { status: "merged", changed: true }
    },
  }

  const first = await executeDailyPlan(args)
  const receipt = readJSON(
    root,
    `daily/runs/${plan.run_id}/receipts/${plan.run_id}_fanuc-en_20260921_20260928_a1.json`,
  )
  assert.equal(first.timing.unit, "ms")
  assert.equal(first.timing.measured_receipts, 1)
  assert.equal(first.timing.unmeasured_receipts, 0)
  assert.ok(receipt.timing_ms.scan >= 8)
  assert.ok(receipt.timing_ms.verify >= 8)
  assert.ok(receipt.timing_ms.backlog_merge >= 8)
  assert.equal(
    receipt.timing_ms.total,
    receipt.timing_ms.scan + receipt.timing_ms.verify + receipt.timing_ms.backlog_merge,
  )
  assert.ok(first.timing.wall_clock_ms > 0)
  assert.equal(first.timing.by_route["fanuc-en"].measured_attempts, 1)
  assert.ok(first.timing.phases.backlog_merge_ms >= 8)

  const resumed = await executeDailyPlan(args)
  assert.equal(scans, 1)
  assert.equal(resumed.timing.measured_receipts, 1)
  assert.equal(resumed.timing.receipt_elapsed_ms, receipt.timing_ms.total)
  assert.equal(resumed.timing.by_route["fanuc-en"].total_ms, receipt.timing_ms.total)
})

test("daily plan connects its successful predecessor receipt to production listing reuse", async (t) => {
  const root = temporary(t)
  const calls = []
  const routeConfig = {
    channel_id: "route-a",
    method: "html-list",
    listing_profile: { pagination: "single-page" },
  }
  const firstWindow = {
    channel_id: routeConfig.channel_id,
    since: "2026-09-30",
    until_exclusive: "2026-10-01",
  }
  const secondWindow = {
    channel_id: routeConfig.channel_id,
    since: "2026-10-01",
    until_exclusive: "2026-10-02",
  }
  const runId = "daily-20261002-reuse-integration"
  const expectedFirstAttempt = `${runId}_route-a_20260930_20261001_a1`
  const scanner = createDailySourceScanner({
    root,
    activeRoutes: [{ channel_id: routeConfig.channel_id, route: routeConfig }],
    runResearch: async (args) => {
      calls.push(args)
      const runId = args[args.indexOf("--run") + 1]
      const since = args[args.indexOf("--since") + 1]
      const until = args[args.indexOf("--until") + 1]
      const reusedAt = args.indexOf("--reuse-listing-run")
      atomicWrite(root, `runs/${runId}/list-scan.json`, {
        status: "window_scanned",
        channel_id: routeConfig.channel_id,
        window: { since, until_exclusive: until },
        listing_source_version_id: "source-version",
        ...(reusedAt >= 0 ? { listing_reused_from_run: args[reusedAt + 1] } : {}),
      })
      atomicWrite(root, `runs/${runId}/documents.json`, [])
      atomicWrite(root, `runs/${runId}/parses.json`, [])
      atomicWrite(root, `runs/${runId}/candidates.json`, [])
      atomicWrite(root, `runs/${runId}/list-pages.json`, [])
    },
  })
  const coverage = {
    schema: "research-daily-coverage/v1",
    routes: {
      [routeConfig.channel_id]: {
        baseline_run: "baseline",
        anchor_since: firstWindow.since,
        covered: [],
        unresolved: [],
        last_contiguous_until: firstWindow.since,
      },
    },
  }
  const result = await executeDailyPlan({
    root,
    plan: { ...plan, run_id: runId, windows: [firstWindow, secondWindow] },
    coverage,
    activeRoutes: [{ channel_id: routeConfig.channel_id, route: routeConfig }],
    scan: scanner,
    verify: async () => {},
    merge: async () => ({ status: "merged", changed: false }),
  })

  assert.equal(result.status, "configured_routes_scanned")
  assert.equal(result.receipts, 2)
  assert.equal(calls[0].includes("--reuse-listing-run"), false)
  assert.deepEqual(calls[1].slice(-2), ["--reuse-listing-run", expectedFirstAttempt])
  const second = readJSON(root, `runs/${runId}_route-a_20261001_20261002_a1/list-scan.json`)
  assert.equal(second.listing_reused_from_run, expectedFirstAttempt)
})

test("daily scans run distinct routes concurrently, serialize each route and commit backlog in order", async (t) => {
  const root = temporary(t)
  const routeIds = ["route-a", "route-b", "route-c", "route-d", "route-e", "route-f", "route-g"]
  const windows = [
    { channel_id: "route-a", since: "2026-09-21", until_exclusive: "2026-09-24" },
    { channel_id: "route-a", since: "2026-09-24", until_exclusive: "2026-09-28" },
    ...routeIds.slice(1).map((channel_id) => ({
      channel_id,
      since: "2026-09-21",
      until_exclusive: "2026-09-28",
    })),
  ]
  const coverage = initialCoverage()
  coverage.routes = Object.fromEntries(
    routeIds.map((channel_id) => [
      channel_id,
      {
        baseline_run: "baseline",
        anchor_since: "2026-09-01",
        covered: [{ since: "2026-09-01", until_exclusive: "2026-09-21", source_run: "baseline" }],
        unresolved: [],
        last_contiguous_until: "2026-09-21",
      },
    ]),
  )
  const stored = new Map()
  const activeByRoute = new Map()
  const completedRouteA = []
  const reusedListingRuns = []
  let activeScans = 0,
    maxActiveScans = 0,
    activeMerges = 0,
    maxActiveMerges = 0
  const args = {
    root,
    plan: { ...plan, windows },
    coverage,
    activeRoutes: routeIds.map((channel_id) => ({ route: route(channel_id, "해외") })),
    scan: async (window, id, reuseListingRun) => {
      reusedListingRuns.push([window.channel_id, window.since, reuseListingRun])
      activeScans++
      maxActiveScans = Math.max(maxActiveScans, activeScans)
      activeByRoute.set(window.channel_id, (activeByRoute.get(window.channel_id) || 0) + 1)
      assert.equal(activeByRoute.get(window.channel_id), 1)
      await new Promise((resolve) => setTimeout(resolve, window.channel_id === "route-a" ? 20 : 8))
      activeByRoute.set(window.channel_id, activeByRoute.get(window.channel_id) - 1)
      activeScans--
      if (window.channel_id === "route-a") completedRouteA.push(window.since)
      const result = {
        summary: { status: "window_scanned", channel_id: window.channel_id },
        candidates: [{ key: `${window.channel_id}-${window.since}` }],
      }
      stored.set(id, result)
      return result
    },
    verify: async () => {},
    loadStored: (_, id) => stored.get(id),
    merge: async () => {
      activeMerges++
      maxActiveMerges = Math.max(maxActiveMerges, activeMerges)
      await new Promise((resolve) => setTimeout(resolve, 2))
      activeMerges--
      return { status: "merged" }
    },
  }

  const result = await executeDailyPlan(args)
  assert.equal(result.receipts, windows.length)
  assert.ok(maxActiveScans > 1)
  assert.equal(maxActiveScans, 6)
  assert.deepEqual(completedRouteA, ["2026-09-21", "2026-09-24"])
  assert.deepEqual(
    reusedListingRuns
      .filter(([channel_id]) => channel_id === "route-a")
      .map(([, , runId]) => runId),
    [null, `${plan.run_id}_route-a_20260921_20260924_a1`],
  )
  assert.equal(maxActiveMerges, 1)
  assert.deepEqual(result.execution, {
    max_parallel_routes: 6,
    scheduling: "rolling-route-pool",
    route_windows_serialized: true,
    candidate_merges_serialized: true,
  })
})

test("a slow route does not hold finished slots or delay their durable receipts", async (t) => {
  const root = temporary(t)
  const routeIds = ["route-a", "route-b", "route-c", "route-d", "route-e", "route-f", "route-g"]
  const windows = routeIds.map((channel_id) => ({
    channel_id,
    since: "2026-09-21",
    until_exclusive: "2026-09-28",
  }))
  const coverage = initialCoverage()
  coverage.routes = Object.fromEntries(
    routeIds.map((id) => [id, structuredClone(coverage.routes["fanuc-en"])]),
  )
  let releaseSlow
  const slow = new Promise((resolve) => {
    releaseSlow = resolve
  })
  let slowReleased = false
  const release = () => {
    slowReleased = true
    releaseSlow()
  }
  // A deadline lets the old batch barrier finish so the regression reports a
  // failure instead of hanging; successful scheduling releases the gate itself.
  const deadline = setTimeout(release, 1000)
  t.after(() => clearTimeout(deadline))
  let nextStartedWhileSlow = false
  let receiptExistedWhileSlow = false
  let activeScans = 0
  let maxActiveScans = 0
  const stored = new Map()
  const summary = await executeDailyPlan({
    root,
    plan: { ...plan, windows },
    coverage,
    activeRoutes: routeIds.map((id) => ({ route: route(id, "해외") })),
    scan: async (window, id) => {
      activeScans++
      maxActiveScans = Math.max(maxActiveScans, activeScans)
      await Promise.resolve()
      if (window.channel_id === "route-a") await slow
      else if (window.channel_id === "route-g") {
        nextStartedWhileSlow = !slowReleased
        receiptExistedWhileSlow =
          fs.readdirSync(path.join(root, "daily/runs", plan.run_id, "receipts")).length > 0
        release()
      }
      activeScans--
      const result = {
        summary: { status: "window_scanned", channel_id: window.channel_id },
        candidates: [],
      }
      stored.set(id, result)
      return result
    },
    verify: async () => {},
    loadStored: (_, id) => stored.get(id),
    merge: async () => ({ status: "merged" }),
  })
  assert.equal(
    nextStartedWhileSlow,
    true,
    "the seventh route must start before the slow route finishes",
  )
  assert.equal(
    receiptExistedWhileSlow,
    true,
    "finished scans must have durable receipts before the slow route finishes",
  )
  assert.equal(maxActiveScans, 6)
  assert.equal(summary.receipts, 7)
  assert.equal(summary.status, "configured_routes_scanned")
})

test("a receipt failure drains live routes before rejecting the executor", async (t) => {
  const root = temporary(t)
  let releaseSlow, signalCommit
  const slow = new Promise((resolve) => {
    releaseSlow = resolve
  })
  const commitAttempted = new Promise((resolve) => {
    signalCommit = resolve
  })
  const deadline = setTimeout(() => {
    releaseSlow()
    signalCommit()
  }, 1000)
  t.after(() => clearTimeout(deadline))
  let settled = false
  const execution = executeDailyPlan({
    root,
    plan,
    coverage: initialCoverage(),
    activeRoutes: [
      { route: route("fanuc-en", "해외") },
      { route: route("route-hd-news-ko", "국내") },
    ],
    scan: async (window, id) => {
      if (window.channel_id === "fanuc-en") await slow
      return {
        summary: { status: "window_scanned", channel_id: window.channel_id },
        candidates: [],
        attempt_id: id,
      }
    },
    verify: async () => {},
    merge: async (result) => {
      if (result.summary.channel_id === "route-hd-news-ko") {
        atomicWrite(root, `daily/runs/${plan.run_id}/receipts/${result.attempt_id}.json`, {
          tampered: true,
        })
        signalCommit()
      }
      return { status: "merged" }
    },
  })
  execution.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    },
  )
  await commitAttempted
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(settled, false, "the operation must remain live until its other writer drains")
  releaseSlow()
  await assert.rejects(execution, /already exists/)
  assert.equal(fs.readdirSync(path.join(root, "daily/runs", plan.run_id, "receipts")).length, 2)
})

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
    sameEventAliases: new Map(),
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

test("blocked windows wait for a new observation instead of repeating the same request", async (t) => {
  const root = temporary(t)
  let calls = 0
  const oneWindowPlan = {
    ...plan,
    windows: [plan.windows[1]],
    retry_policy: {
      max_attempts_per_window: 2,
      blocked_requires_new_observation: true,
    },
  }
  const args = {
    root,
    plan: oneWindowPlan,
    coverage: initialCoverage(),
    activeRoutes: [{ route: route("route-hd-news-ko", "국내") }],
    scan: async () => {
      calls++
      return { summary: { status: "blocked", reason: "robots_observation_failed" }, candidates: [] }
    },
    verify: () => true,
    merge: async () => ({ status: "merged" }),
  }

  const first = await executeDailyPlan(args)
  assert.equal(first.retry_queue[0].state, "awaiting_new_observation")
  assert.equal(first.retry_queue[0].attempts, 1)
  const second = await executeDailyPlan(args)
  assert.equal(second.retry_queue[0].state, "awaiting_new_observation")
  assert.equal(second.receipts, 1)
  assert.equal(calls, 1)
})

test("incomplete windows stop at the retry cap and remain visible in the failure queue", async (t) => {
  const root = temporary(t)
  let calls = 0
  const oneWindowPlan = {
    ...plan,
    windows: [plan.windows[1]],
    retry_policy: {
      max_attempts_per_window: 2,
      blocked_requires_new_observation: true,
    },
  }
  const args = {
    root,
    plan: oneWindowPlan,
    coverage: initialCoverage(),
    activeRoutes: [{ route: route("route-hd-news-ko", "국내") }],
    scan: async () => {
      calls++
      return { summary: { status: "incomplete", reason: "detail_incomplete" }, candidates: [] }
    },
    verify: () => true,
    merge: async () => ({ status: "merged" }),
  }

  await executeDailyPlan(args)
  const exhausted = await executeDailyPlan(args)
  assert.equal(exhausted.retry_queue[0].state, "exhausted")
  assert.equal(exhausted.retry_queue[0].attempts, 2)
  assert.equal(exhausted.retry_queue[0].attempts_remaining, 0)
  const resumed = await executeDailyPlan(args)
  assert.equal(resumed.receipts, 2)
  assert.equal(resumed.retry_queue[0].state, "exhausted")
  assert.equal(calls, 2)
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

test("v2 daily receipts require an intact same-event suppression record", () => {
  const window = plan.windows[0]
  const attempt_id = `${plan.run_id}_${window.channel_id}_${window.since.replaceAll("-", "")}_${window.until_exclusive.replaceAll("-", "")}_a1`
  const stored = {
    summary: {},
    candidates: [],
    indexDocuments: [],
    documents: [],
    parses: [],
  }
  const receipt = {
    schema: "research-daily-receipt/v2",
    daily_run: plan.run_id,
    attempt_id,
    ...window,
    status: "window_scanned",
    candidate_keys: [],
    scan_evidence: {
      list_scan_run: attempt_id,
      listing_source_version_id: null,
      index_documents: 0,
      documents: 0,
      parses: 0,
    },
    backlog_merge: { status: "merged", same_event_aliases: [] },
  }
  const options = {
    loadStored: () => stored,
    verify: () => true,
    sameEventAliases: new Map(),
  }
  assert.equal(verifyDailyReceipts("unused", plan, [receipt], options), true)
  delete receipt.backlog_merge.same_event_aliases
  assert.throws(
    () => verifyDailyReceipts("unused", plan, [receipt], options),
    /missing its same-event candidate suppression record/,
  )
})

test("a verified independent scan advances only confirmed coverage and preserves its prior failure receipt", async (t) => {
  const root = temporary(t)
  atomicWrite(root, ".local/research/local-ai/candidate-backlog.json", {
    schema: "research-candidates/v1",
    candidates: [],
  })
  const baseline = {
    channel_id: "fanuc-en",
    since: "2026-09-20",
    until_exclusive: "2026-09-30",
  }
  const supplemental = {
    channel_id: "fanuc-en",
    since: "2026-09-30",
    until_exclusive: "2026-10-02",
  }
  writeStoredEmptyScan(root, "baseline", { ...baseline, url: "https://example.com/base" })
  writeStoredEmptyScan(root, "independent-scan", {
    ...supplemental,
    url: "https://example.com/independent",
  })
  const previousFailure = Buffer.from('{"status":"blocked","reason":"old failure"}')
  atomicWrite(root, "daily/runs/old-run/receipts/old-attempt.json", previousFailure)
  const coverage = {
    schema: "research-daily-coverage/v1",
    routes: {
      "fanuc-en": {
        baseline_run: "baseline",
        anchor_since: baseline.since,
        covered: [{ ...baseline, source_run: "baseline", kind: "verified_baseline" }],
        unresolved: [{ ...supplemental, reason: "page_blocked", last_attempt: "old-attempt" }],
      },
    },
  }
  atomicWrite(root, "daily/route-coverage.json", coverage)
  const configFile = path.join(root, "daily-routes.json")
  fs.writeFileSync(
    configFile,
    JSON.stringify({
      schema: "research-daily-routes/v1",
      lookback_days: 7,
      max_window_days: 7,
      routes: [{ channel_id: "fanuc-en", enabled: true, baseline_run: "baseline" }],
    }),
  )
  let merges = 0
  const merge = async () => {
    merges += 1
    return { status: "merged", changed: true }
  }
  const reconciled = await reconcileSupplementalScan({
    root,
    configFile,
    scanRun: "independent-scan",
    reconciliationRun: "coverage-reconcile",
    backlogFile: path.join(root, ".local/research/local-ai/candidate-backlog.json"),
    now: "2026-10-01T00:30:00+09:00",
    merge,
  })
  assert.equal(reconciled.status, "reconciled")
  assert.equal(reconciled.coverage_until, "2026-10-01")
  assert.equal(merges, 1)
  const updated = readJSON(root, "daily/route-coverage.json").routes["fanuc-en"]
  assert.equal(updated.last_contiguous_until, "2026-10-01")
  assert.deepEqual(updated.unresolved, [
    {
      channel_id: "fanuc-en",
      since: "2026-10-01",
      until_exclusive: "2026-10-02",
      reason: "page_blocked",
      last_attempt: "old-attempt",
    },
  ])
  const verifiedReceipt = supplementalCoverageReceiptForWindow(root, updated, {
    channel_id: "fanuc-en",
    since: supplemental.since,
    until_exclusive: supplemental.until_exclusive,
  })
  assert.equal(verifiedReceipt.schema, "research-supplemental-coverage/v2")
  assert.deepEqual(verifiedReceipt.backlog_merge.same_event_aliases, [])
  const widerWindow = { ...supplemental, until_exclusive: "2026-10-04" }
  assert.equal(supplementalCoverageReceiptForWindow(root, updated, widerWindow), null)
  const aliasReceiptFile = "daily/reconciliations/coverage-reconcile.json"
  const receiptWithMissingAliases = readJSON(root, aliasReceiptFile)
  delete receiptWithMissingAliases.backlog_merge.same_event_aliases
  atomicWrite(root, aliasReceiptFile, receiptWithMissingAliases)
  assert.throws(
    () =>
      supplementalCoverageReceiptForWindow(root, updated, {
        channel_id: "fanuc-en",
        since: supplemental.since,
        until_exclusive: supplemental.until_exclusive,
      }),
    /missing its same-event candidate suppression record/,
  )
  assert.throws(
    () => supplementalCoverageReceiptForWindow(root, updated, widerWindow),
    /missing its same-event candidate suppression record/,
  )
  atomicWrite(root, aliasReceiptFile, verifiedReceipt)
  assert.equal(verifiedReceipt.scan_run, "independent-scan")
  assert.deepEqual(
    fs.readFileSync(path.join(root, "daily/runs/old-run/receipts/old-attempt.json")),
    previousFailure,
  )
  assert.equal(
    (
      await reconcileSupplementalScan({
        root,
        configFile,
        scanRun: "independent-scan",
        reconciliationRun: "coverage-reconcile",
        backlogFile: path.join(root, ".local/research/local-ai/candidate-backlog.json"),
        now: "2026-10-01T00:30:00+09:00",
        merge,
      })
    ).status,
    "already_reconciled",
  )
  assert.equal(merges, 1)

  const resumePlan = {
    schema: "research-daily-plan/v1",
    run_id: "daily-20261001-supplemental-resume",
    kst_day: "2026-10-01",
    windows: [supplemental],
  }
  const attemptId = `${resumePlan.run_id}_fanuc-en_20260930_20261002_a1`
  atomicWrite(root, `daily/runs/${resumePlan.run_id}/receipts/${attemptId}.json`, {
    schema: "research-daily-receipt/v1",
    daily_run: resumePlan.run_id,
    attempt_id: attemptId,
    ...supplemental,
    started_at: "2026-10-01T00:10:00+09:00",
    finished_at: "2026-10-01T00:11:00+09:00",
    status: "blocked",
    reason: "old failure",
    candidate_published: false,
  })
  let scans = 0
  const resumed = await executeDailyPlan({
    root,
    plan: resumePlan,
    coverage: readJSON(root, "daily/route-coverage.json"),
    activeRoutes: [{ route: route("fanuc-en", "해외") }],
    scan: async () => {
      scans += 1
      throw Error("covered window should not be fetched again")
    },
    merge,
  })
  assert.equal(scans, 0)
  assert.equal(resumed.status, "configured_routes_scanned")
  assert.deepEqual(
    readJSON(root, "daily/route-coverage.json").routes["fanuc-en"].unresolved.map((gap) => [
      gap.since,
      gap.until_exclusive,
    ]),
    [["2026-10-01", "2026-10-02"]],
  )
  const widerPlan = {
    ...resumePlan,
    run_id: "daily-20261003-supplemental-wider",
    kst_day: "2026-10-03",
    windows: [widerWindow],
  }
  const originalSupplemental = fs.readFileSync(path.join(root, aliasReceiptFile))
  const widerResult = await executeDailyPlan({
    root,
    plan: widerPlan,
    coverage: readJSON(root, "daily/route-coverage.json"),
    activeRoutes: [{ route: route("fanuc-en", "해외") }],
    scan: async (window, id) => {
      scans += 1
      return writeStoredEmptyScan(root, id, {
        ...window,
        url: "https://example.com/wider",
      }).result
    },
    merge,
  })
  assert.equal(scans, 1)
  assert.equal(widerResult.status, "configured_routes_scanned")
  assert.deepEqual(fs.readFileSync(path.join(root, aliasReceiptFile)), originalSupplemental)
  assert.equal(
    readJSON(root, "daily/route-coverage.json").routes["fanuc-en"].last_contiguous_until,
    "2026-10-03",
  )
  const receiptFile = "daily/reconciliations/coverage-reconcile.json"
  const tamperedReceipt = readJSON(root, receiptFile)
  tamperedReceipt.candidate_keys = ["forged-candidate"]
  atomicWrite(root, receiptFile, tamperedReceipt)
  assert.throws(
    () =>
      supplementalCoverageReceiptForWindow(root, updated, {
        channel_id: "fanuc-en",
        since: supplemental.since,
        until_exclusive: supplemental.until_exclusive,
      }),
    /does not match its completed scan window/,
  )
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

test("a baseline coverage record does not skip its first candidate backlog reconciliation", async (t) => {
  const root = temporary(t)
  const window = { channel_id: "fanuc-en", since: "2026-10-02", until_exclusive: "2026-10-04" }
  writeStoredEmptyScan(root, "baseline-onboarding", {
    ...window,
    url: "https://example.com/new-source",
  })
  const configFile = path.join(root, "daily-routes.json")
  fs.writeFileSync(
    configFile,
    JSON.stringify({
      schema: "research-daily-routes/v1",
      lookback_days: 7,
      max_window_days: 7,
      routes: [{ channel_id: "fanuc-en", enabled: true, baseline_run: "baseline-onboarding" }],
    }),
  )
  let merges = 0
  const merge = async () => {
    merges += 1
    return { status: "merged", changed: false, same_event_aliases: [] }
  }
  const options = {
    root,
    configFile,
    scanRun: "baseline-onboarding",
    reconciliationRun: "baseline-intake",
    backlogFile: path.join(root, "candidate-backlog.json"),
    now: "2026-10-04T00:30:00+09:00",
    merge,
  }
  const first = await reconcileSupplementalScan(options)
  assert.equal(first.status, "reconciled")
  assert.equal(merges, 1)
  const state = readJSON(root, "daily/route-coverage.json").routes["fanuc-en"]
  assert.equal(state.covered.filter((s) => s.kind === "verified_baseline").length, 1)
  assert.equal(state.covered.filter((s) => s.kind === "verified_supplemental_scan").length, 1)
  assert.equal(
    readJSON(root, "daily/reconciliations/baseline-intake.json").backlog_merge.status,
    "merged",
  )
  assert.equal((await reconcileSupplementalScan(options)).status, "already_reconciled")
  assert.equal(merges, 1)
})
