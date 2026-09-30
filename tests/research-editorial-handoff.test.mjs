import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { buildEditorialHandoff } from "../scripts/research/editorial-handoff.mjs"
import { main } from "../scripts/research.mjs"
import { researchWindow } from "../scripts/research-window.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { dailyScan, storedListScan } from "../scripts/research/daily-scan.mjs"
import { articleContentFingerprint, storeParseArtifact } from "../scripts/research/parser.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"

const candidate = (key, date, more = {}) => ({
  key,
  title: `Article ${key}`,
  source_urls: [`https://example.com/${key}`],
  source_published_at: date,
  discovered_at: "2026-09-29T01:00:00Z",
  review_status: "unreviewed",
  priority: "normal",
  ...more,
})
const plan = {
  run_id: "daily-20260929",
  cutoff: "2026-09-22T23:00:00Z",
  windows: [
    { channel_id: "first", since: "2026-09-22", until_exclusive: "2026-09-29" },
    { channel_id: "failed", since: "2026-09-22", until_exclusive: "2026-09-29" },
  ],
}
const receipts = [
  {
    status: "window_scanned",
    attempt_id: "complete-a1",
    channel_id: "first",
    since: "2026-09-22",
    until_exclusive: "2026-09-29",
    candidate_keys: ["published", "url-only", "revision", "new", "unverified", "rejected"],
  },
  {
    status: "incomplete",
    attempt_id: "failed-a1",
    channel_id: "failed",
    since: "2026-09-22",
    until_exclusive: "2026-09-29",
    candidate_keys: ["old"],
  },
]
const observations = receipts[0].candidate_keys.map((key) => ({
  attempt_id: "complete-a1",
  key,
  article_source_version_id: `source-version-${key}`,
  article_parse_id: `parse-${key}`,
  article_content_sha256: `content-${key}`,
}))
const backlog = {
  candidates: [
    candidate("published", "2026-09-25", { event_id: "published-id" }),
    candidate("url-only", "2026-09-25", {
      source_urls: ["https://example.com/published"],
    }),
    candidate("revision", "2026-09-25", {
      event_id: "published-id",
      source_revision_alert: true,
      review_status: "deferred",
      reason: "Changed original",
      article_source_version_id: "later-source-version",
      article_parse_id: "later-parse",
      article_content_sha256: "later-content",
    }),
    candidate("new", "2026-09-28", {
      article_source_version_id: "source-version-new",
      article_parse_id: "parse-new",
      article_content_sha256: "content-new",
    }),
    candidate("unverified", "2026-09-28"),
    candidate("old", "2026-09-19"),
    candidate("rejected", "2026-09-28", {
      review_status: "rejected",
      reason: "Not a new event",
    }),
  ],
}
const issues = [
  {
    key: "Editions/2026/09/2026-09-25",
    items: [
      {
        id: "published-id",
        urls: ["https://example.com/published"],
        review: { review_status: "verified", published_at: "2026-09-25" },
      },
      {
        id: "local-unverified-id",
        urls: ["https://example.com/unverified"],
        review: { review_status: "unreviewed", published_at: "2026-09-28" },
      },
    ],
  },
]

test("a shared source URL never confirms an event without a reviewed event ID", () => {
  const source = "https://example.com/rolling-announcements"
  const issueInventory = [
    {
      key: "Editions/2026/09/2026-09-24",
      items: [
        { id: "event-one", urls: [source], review: { review_status: "verified" } },
        { id: "event-two", urls: [source], review: { review_status: "verified" } },
      ],
    },
  ]
  const input = {
    candidates: [
      candidate("shared", "2026-09-28", { source_urls: [source] }),
      candidate("identified", "2026-09-28", {
        event_id: "event-two",
        source_urls: [source],
      }),
    ],
  }
  const result = researchWindow(
    "2026-09-22T23:00:00Z",
    "2026-09-29T02:00:00Z",
    input,
    issueInventory,
  )
  assert.equal(result.pending.length, 1)
  assert.equal(result.pending[0].next_route, "review-existing-identity")
  assert.equal(result.pending[0].publication, null)
  assert.deepEqual(
    result.pending[0].possible_publications.map((entry) => entry.event_id),
    ["event-one", "event-two"],
  )
  assert.equal(result.resolved[0].next_route, "already-published")
  assert.equal(result.resolved[0].publication.event_id, "event-two")
  assert.throws(
    () =>
      researchWindow(
        "2026-09-22T23:00:00Z",
        "2026-09-29T02:00:00Z",
        {
          candidates: [
            candidate("conflict", "2026-09-28", {
              event_id: "event-two",
              source_urls: ["https://example.com/only-event-one"],
            }),
          ],
        },
        [
          {
            key: "Editions/2026/09/2026-09-24",
            items: [
              {
                id: "event-one",
                urls: ["https://example.com/only-event-one"],
                review: { review_status: "verified" },
              },
              { id: "event-two", urls: [source], review: { review_status: "verified" } },
            ],
          },
        ],
      ),
    /Candidate combines different published events: conflict/,
  )
})

test("unverified local articles are not publication evidence in a research window", () => {
  const result = researchWindow(
    "2026-09-22T23:00:00Z",
    "2026-09-29T02:00:00Z",
    { candidates: [candidate("unverified-source", "2026-09-28")] },
    [
      {
        key: "Editions/2026/09/2026-09-28",
        items: [
          {
            id: "unverified-event",
            urls: ["https://example.com/unverified-source"],
            review: { review_status: "unreviewed" },
          },
        ],
      },
    ],
  )
  assert.equal(result.pending[0].next_route, "review-publication-time")
  assert.deepEqual(result.pending[0].possible_publications, [])
})

test("daily handoff connects matching source content without declaring a shared event", () => {
  const shared = "a".repeat(64)
  const input = {
    candidates: [
      candidate("first", "2026-09-28", {
        article_content_sha256: shared,
        event_id: "abcdef0123456789",
        review_status: "verified",
      }),
      candidate("second", "2026-09-28", { article_content_sha256: shared }),
    ],
  }
  const handoff = buildEditorialHandoff({
    plan: { ...plan, windows: [plan.windows[0]] },
    receipts: [{ ...receipts[0], candidate_keys: ["first", "second"] }],
    observations: [
      { attempt_id: "complete-a1", key: "first", article_content_sha256: shared },
      { attempt_id: "complete-a1", key: "second", article_content_sha256: shared },
    ],
    backlog: input,
    issues: [],
    observedAt: "2026-09-29T02:00:00Z",
  })
  const second = handoff.pending.find((entry) => entry.key === "second")
  assert.deepEqual(second.related_candidates, ["first"])
  assert.equal(second.next_route, "review-related-candidate")
  assert.equal(second.event_id, null)
  assert.equal(
    handoff.intake_ontology.relations.find(
      (relation) => relation.type === "sameExtractedContentCandidate",
    ).decision,
    "review_required",
  )
})

test("editorial handoff routes only exact published identities and keeps failed attempts out of today's observations", () => {
  const handoff = buildEditorialHandoff({
    plan,
    receipts,
    observations,
    backlog,
    issues,
    observedAt: "2026-09-29T02:00:00Z",
  })
  assert.equal(handoff.authority, "local_vault_unreconciled")
  assert.equal(handoff.completed_windows, 1)
  assert.equal(handoff.incomplete_windows[0].channel_id, "failed")
  assert.equal(handoff.counts.pending, 5)
  assert.equal(handoff.counts.pending_observed_in_run, 4)
  assert.equal(handoff.counts.observed_resolved, 2)
  assert.equal(handoff.counts.source_revision, 1)
  assert.equal(handoff.counts.existing_unverified, 1)
  assert.equal(handoff.counts.existing_identity, 1)
  assert.equal(handoff.counts.historical_review, 1)
  assert.equal(handoff.counts.review_publication_time, 1)
  assert.equal(handoff.counts.approved_unpublished, 0)
  const byKey = new Map(
    [...handoff.pending, ...handoff.observed_resolved].map((item) => [item.key, item]),
  )
  assert.equal(byKey.get("published").next_route, "already-published")
  assert.equal(byKey.get("url-only").next_route, "review-existing-identity")
  assert.equal(byKey.get("url-only").publication, null)
  assert.equal(byKey.get("url-only").possible_publications[0].event_id, "published-id")
  assert.equal(byKey.get("revision").next_route, "review-source-revision")
  assert.equal(byKey.get("revision").publication.event_id, "published-id")
  assert.equal(byKey.get("revision").current_source_version_observed_in_run, false)
  assert.equal(byKey.get("revision").source_evidence_state, "changed")
  assert.equal(byKey.get("new").next_route, "review-publication-time")
  assert.equal(byKey.get("new").publication, null)
  assert.equal(byKey.get("unverified").next_route, "review-existing-unverified")
  assert.equal(byKey.get("unverified").publication, null)
  assert.equal(byKey.get("unverified").possible_publications[0].event_id, "local-unverified-id")
  assert.equal(byKey.get("old").next_route, "historical-review")
  assert.equal(byKey.get("old").observed_in_run, false)
  assert.equal(byKey.get("old").source_evidence_state, "not_observed")
  assert.deepEqual(byKey.get("old").source_attempts, [])
  assert.deepEqual(byKey.get("new").source_attempts, [
    observations.find((item) => item.key === "new"),
  ])
  assert.equal(byKey.get("new").current_source_version_observed_in_run, true)
  assert.equal(byKey.get("new").source_evidence_state, "exact")
  assert.deepEqual(
    handoff.review_workstreams.map((group) => [group.route, group.candidate_keys]),
    [
      ["review-source-revision", ["revision"]],
      ["review-existing-identity", ["url-only"]],
      ["review-existing-unverified", ["unverified"]],
      ["review-publication-time", ["new"]],
      ["historical-review", ["old"]],
    ],
  )
  assert.equal(
    handoff.review_workstreams.find((group) => group.route === "review-publication-time")
      .exact_source_available,
    1,
  )
  assert.equal(byKey.get("rejected").next_route, "closed")
  assert.equal(handoff.candidate_published, false)
})

test("an approved but unpublished candidate is handed to edition assembly without repeating source review", () => {
  const approvedBacklog = structuredClone(backlog)
  const candidate = approvedBacklog.candidates.find((item) => item.key === "new")
  candidate.review_status = "verified"
  candidate.event_id = "abcdef0123456789"
  candidate.approval = {
    approved_run: "private-article",
    article_sha256: "a".repeat(64),
  }
  const handoff = buildEditorialHandoff({
    plan,
    receipts,
    observations,
    backlog: approvedBacklog,
    issues,
    observedAt: "2026-09-29T02:00:00Z",
  })
  const entry = handoff.pending.find((item) => item.key === "new")
  assert.equal(entry.next_route, "approved-unpublished")
  assert.deepEqual(entry.approval, candidate.approval)
  assert.equal(handoff.counts.approved_unpublished, 1)
  assert.equal(handoff.counts.review_publication_time, 0)
  assert.deepEqual(handoff.review_workstreams[1].candidate_keys, ["new"])
})

test("editorial handoff refuses a completed candidate missing from the current backlog", () => {
  assert.throws(
    () =>
      buildEditorialHandoff({
        plan,
        receipts,
        observations,
        backlog: { candidates: backlog.candidates.filter((item) => item.key !== "new") },
        issues,
        observedAt: "2026-09-29T02:00:00Z",
      }),
    /absent from the current backlog: new/,
  )
})

function storedEmptyScan(root, runId, window) {
  const url = "https://example.com/official-feed"
  const body = Buffer.from("<rss><channel /></rss>")
  const bodySha = sha256(body)
  const source = sourceId(url)
  const bodyPath = `sources/${runId}.xml`
  atomicWrite(root, bodyPath, body)
  const scan = {
    summary: {
      status: "window_scanned",
      channel_id: window.channel_id,
      window: { since: window.since, until_exclusive: window.until_exclusive },
      candidate_count: 0,
    },
    indexDocuments: [
      {
        original_url: url,
        source_id: source,
        source_version_id: `${source}:${bodySha}`,
        fetch_status: "captured",
        body_path: bodyPath,
        body_sha256: bodySha,
      },
    ],
    documents: [],
    parses: [],
    candidates: [],
  }
  for (const [file, value] of Object.entries({
    "list-scan.json": scan.summary,
    "list-pages.json": scan.indexDocuments,
    "documents.json": scan.documents,
    "parses.json": scan.parses,
    "candidates.json": scan.candidates,
  }))
    atomicWrite(root, `runs/${runId}/${file}`, value)
  return storedListScan(root, runId)
}

function storedArticleScan(root, runId, window) {
  const originalURL = "https://example.com/chip?mode=V&id=1"
  const candidateURL = "https://example.com/chip?id=1&mode=V"
  const body = "A dated official chip announcement"
  const id = sourceId(originalURL)
  const bodySha = sha256(body)
  const version = `${id}:${bodySha}`
  const bodyPath = `sources/${id}/${bodySha}.html`
  atomicWrite(root, bodyPath, body)
  const document = {
    original_url: originalURL,
    final_url: originalURL,
    source_id: id,
    source_version_id: version,
    fetch_status: "captured",
    body_path: bodyPath,
    body_sha256: bodySha,
    observed_at: "2026-09-29T01:00:00Z",
  }
  const parseId = sha256(version + ":article")
  const parse = storeParseArtifact(root, {
    schema_version: "source-parse/v1",
    status: "extracted",
    title: "Official chip announcement",
    source_id: id,
    source_version_id: version,
    parse_id: parseId,
    dates: { published_at: "2026-09-27", observed_at: document.observed_at },
    blocks: [
      {
        block_id: parseId + ":b1",
        text: body,
        locator: { text_hash: sha256(body) },
      },
    ],
    quality: { required_fields_present: true, missing_pages: [] },
  })
  const candidate = {
    key: "source-" + sourceId(candidateURL),
    title: parse.title,
    source_urls: [candidateURL],
    source_published_at: parse.dates.published_at,
    discovered_at: document.observed_at,
    priority: "normal",
    review_status: "unreviewed",
    article_source_version_id: version,
    article_parse_id: parseId,
    article_content_sha256: articleContentFingerprint(parse),
  }
  const scan = {
    summary: {
      status: "window_scanned",
      channel_id: window.channel_id,
      window: { since: window.since, until_exclusive: window.until_exclusive },
      candidate_count: 1,
    },
    indexDocuments: [document],
    documents: [document],
    parses: [parse],
    candidates: [candidate],
  }
  for (const [file, value] of Object.entries({
    "list-scan.json": scan.summary,
    "list-pages.json": scan.indexDocuments,
    "documents.json": scan.documents,
    "parses.json": scan.parses,
    "candidates.json": scan.candidates,
  }))
    atomicWrite(root, `runs/${runId}/${file}`, value)
  return storedListScan(root, runId)
}

test("daily execution creates a private handoff and resume leaves it unchanged", async (t) => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-handoff-")))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const root = path.join(directory, "research")
  const vault = path.join(directory, "vault")
  const configFile = path.join(directory, "daily-routes.json")
  const backlogFile = path.join(directory, "candidate-backlog.json")
  fs.mkdirSync(path.join(vault, "Editions"), { recursive: true })
  fs.writeFileSync(
    path.join(vault, "Editions", "2026-09-29.md"),
    "---\ndate: 2026-09-29\ncoverage_end: 2026-09-28T23:00:00Z\n---\n\n# Source List\n",
  )
  fs.writeFileSync(
    configFile,
    JSON.stringify({
      schema: "research-daily-routes/v1",
      lookback_days: 7,
      max_window_days: 7,
      routes: [{ channel_id: "fanuc-en", enabled: true, baseline_run: "baseline" }],
    }),
  )
  storedEmptyScan(root, "baseline", {
    channel_id: "fanuc-en",
    since: "2026-09-22",
    until_exclusive: "2026-09-29",
  })
  const calls = []
  const options = {
    runId: "daily-20260929-integration",
    root,
    vault,
    configFile,
    backlogFile,
    now: "2026-09-29T01:00:00Z",
    scan: async (window, id) => {
      calls.push(id)
      return storedEmptyScan(root, id, window)
    },
    merge: async () => ({ status: "merged", changed: false }),
  }
  const first = await dailyScan({ ...options, mode: "execute" })
  assert.equal(first.status, "configured_routes_scanned")
  assert.equal(first.editorial_handoff.pending, 0)
  const handoffPath = first.editorial_handoff.path
  const handoff = readJSON(root, handoffPath)
  assert.equal(handoff.authority, "local_vault_unreconciled")
  assert.equal(handoff.completed_windows, 2)
  assert.equal(handoff.candidate_published, false)
  const before = fs.readFileSync(path.join(root, handoffPath))
  const second = await dailyScan({ ...options, mode: "resume" })
  assert.equal(second.editorial_handoff.path, handoffPath)
  assert.deepEqual(fs.readFileSync(path.join(root, handoffPath)), before)
  assert.equal(calls.length, 2)

  const sourceFiles = {}
  for (const name of ["Knowledge", "Signals", "TrendTopics"]) {
    const file = path.join(vault, name, "sample.md")
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, `# ${name}\n`)
    sourceFiles[`${name}/sample.md`] = fs.readFileSync(file, "utf8")
  }
  sourceFiles["Editions/2026-09-29.md"] = fs.readFileSync(
    path.join(vault, "Editions/2026-09-29.md"),
    "utf8",
  )
  const snapshotFile = path.join(directory, "drive-snapshot.json")
  fs.writeFileSync(
    snapshotFile,
    JSON.stringify({
      schema: "tech-drive-source/v1",
      root_folder_id: "1VKWSC2IYOtOd__3NKEzD-BK34qVqtlAD",
      roots: ["Editions", "Knowledge", "Signals", "TrendTopics"],
      complete: true,
      exported_at: new Date().toISOString(),
      files: Object.entries(sourceFiles).map(([file, content]) => ({
        path: file,
        content,
        sha256: sha256(content),
      })),
    }),
  )
  const driveRun = "daily-20260929-drive"
  const driveOptions = {
    ...options,
    runId: driveRun,
    driveSnapshotFile: snapshotFile,
  }
  await dailyScan({ ...driveOptions, mode: "plan-only" })
  const drivePlan = readJSON(root, `daily/runs/${driveRun}/plan.json`)
  assert.equal(drivePlan.cutoff_basis, "provided_drive_snapshot_matched")
  assert.equal(drivePlan.edition.source_files, 4)
  const driveResult = await dailyScan({ ...driveOptions, mode: "execute" })
  const driveHandoff = readJSON(root, driveResult.editorial_handoff.path)
  assert.equal(driveHandoff.authority, "provided_drive_snapshot_matched")
  assert.equal(driveHandoff.drive_verified, false)
  assert.equal(driveHandoff.public_verified, false)
  const originalHandoff = fs.readFileSync(path.join(root, driveResult.editorial_handoff.path))
  fs.writeFileSync(
    path.join(vault, "Editions", "2026-09-27.md"),
    "---\ndate: 2026-09-27\ncoverage_end: 2026-09-26T23:00:00Z\n---\n",
  )
  await assert.rejects(
    () => dailyScan({ ...options, runId: driveRun, mode: "handoff" }),
    /Local edition inventory changed after daily planning/,
  )
  assert.deepEqual(
    fs.readFileSync(path.join(root, driveResult.editorial_handoff.path)),
    originalHandoff,
  )
})

test("a daily candidate selects its exact stored source without rediscovery or publication", async (t) => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-candidate-")))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const root = path.join(directory, "research")
  const vault = path.join(directory, "vault")
  const backlogFile = path.join(directory, "candidate-backlog.json")
  const configFile = path.join(directory, "routes.json")
  fs.mkdirSync(path.join(vault, "Editions"), { recursive: true })
  fs.writeFileSync(
    path.join(vault, "Editions", "2026-09-29.md"),
    "---\ndate: 2026-09-29\ncoverage_end: 2026-09-28T23:00:00Z\n---\n\n# Sources\n",
  )
  fs.writeFileSync(
    configFile,
    JSON.stringify({
      schema: "research-daily-routes/v1",
      lookback_days: 7,
      max_window_days: 7,
      routes: [{ channel_id: "fanuc-en", enabled: true, baseline_run: "baseline" }],
    }),
  )
  storedEmptyScan(root, "baseline", {
    channel_id: "fanuc-en",
    since: "2026-09-22",
    until_exclusive: "2026-09-29",
  })
  let requests = 0
  const daily = await dailyScan({
    runId: "daily-20260929-candidate",
    mode: "execute",
    root,
    vault,
    configFile,
    backlogFile,
    now: "2026-09-29T01:00:00Z",
    scan: async (window, id) => {
      requests++
      return window.since === "2026-09-22"
        ? storedArticleScan(root, id, window)
        : storedEmptyScan(root, id, window)
    },
    merge: async (scan) => {
      if (scan.candidates.length)
        fs.writeFileSync(
          backlogFile,
          JSON.stringify({ schema: "research-candidates/v1", candidates: scan.candidates }),
        )
      return { status: "merged", changed: Boolean(scan.candidates.length) }
    },
  })
  assert.equal(daily.status, "configured_routes_scanned")
  const handoff = readJSON(root, daily.editorial_handoff.path)
  const key = handoff.pending[0].key
  assert.equal(handoff.pending[0].source_evidence_state, "exact")
  const args = [
    "select-candidate",
    "--root",
    root,
    "--run",
    "selected-candidate",
    "--daily-run",
    "daily-20260929-candidate",
    "--candidate-key",
    key,
    "--vault",
    vault,
    "--backlog",
    backlogFile,
  ]
  const result = await main(args)
  assert.equal(result.candidate_key, key)
  assert.equal(result.sources, 1)
  assert.equal(result.candidate_published, false)
  const selected = readJSON(root, "runs/selected-candidate/source-selection.json")
  assert.equal(selected.candidate_key, key)
  assert.equal(selected.selected_urls[0], "https://example.com/chip?mode=V&id=1")
  assert.equal(selected.daily_run, "daily-20260929-candidate")
  assert.equal(selected.candidate_published, false)
  const before = fs.readFileSync(path.join(root, "runs/selected-candidate/source-selection.json"))
  assert.deepEqual(await main(args), result)
  assert.deepEqual(
    fs.readFileSync(path.join(root, "runs/selected-candidate/source-selection.json")),
    before,
  )
  assert.equal(requests, 2)
  fs.writeFileSync(
    backlogFile,
    JSON.stringify({ schema: "research-candidates/v1", candidates: [] }),
  )
  await assert.rejects(() => main(args), /absent from the current backlog/)
  assert.deepEqual(
    fs.readFileSync(path.join(root, "runs/selected-candidate/source-selection.json")),
    before,
  )
})
