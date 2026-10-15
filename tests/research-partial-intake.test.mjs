import { loadPartialCandidateIntakeEvidence } from "../scripts/research/delivery-status.mjs"
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { articleContentFingerprint, storeParseArtifact } from "../scripts/research/parser.mjs"
import {
  mergeCompletedScan,
  mergePartialScan,
  intakePartialScan,
} from "../scripts/research/scan-completion.mjs"
import {
  verifyStoredPartialCandidates,
  verifyStoredListScan,
} from "../scripts/research/scan-evidence.mjs"
import {
  executeDailyPlan,
  verifyDailyReceipts,
  storedListScan,
} from "../scripts/research/daily-scan.mjs"
import {
  buildEditorialHandoff,
  selectCandidateSource,
} from "../scripts/research/editorial-handoff.mjs"
import { scanBoundedRSSRoute } from "../scripts/research/rss-scan.mjs"
import { createArchiveSourceReuse } from "../scripts/research/list-scan-command.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "partial-source-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const makeDocument = (url, text) => {
    const id = sourceId(url),
      hash = sha256(text),
      body_path = `documents/${id}/${hash}/body.bin`
    atomicWrite(root, body_path, Buffer.from(text))
    return {
      original_url: url,
      final_url: url,
      source_id: id,
      source_version_id: `${id}:${hash}`,
      body_path,
      body_sha256: hash,
      observed_at: "2026-10-04T00:00:00Z",
      fetch_status: "captured",
      policy_status: "checked",
    }
  }
  const listing = makeDocument("https://example.com/feed", "Covered dated listing")
  const doc = makeDocument("https://example.com/news/one", "Confirmed source article")
  const parse_id = sha256("parse fixture")
  const parsed = {
    schema_version: "source-parse/v1",
    source_id: doc.source_id,
    source_version_id: doc.source_version_id,
    parse_id,
    parser: { id: "controlled-fixture" },
    status: "extracted",
    title: "Confirmed article",
    dates: { published_at: "2026-10-02", observed_at: doc.observed_at },
    quality: { required_fields_present: true, missing_pages: [] },
    blocks: [
      {
        block_id: parse_id + ":block-0001",
        kind: "paragraph",
        text: "Confirmed source article",
        locator: {
          type: "html",
          dom_path: "/html/body/article/p",
          text_hash: sha256("Confirmed source article"),
        },
      },
    ],
  }
  storeParseArtifact(root, parsed)
  const candidate = {
    key: "source-" + doc.source_id,
    title: parsed.title,
    source_urls: [doc.original_url],
    source_published_at: parsed.dates.published_at,
    discovered_at: doc.observed_at,
    article_observed_at: doc.observed_at,
    article_source_version_id: doc.source_version_id,
    article_parse_id: parse_id,
    article_content_sha256: articleContentFingerprint(parsed),
    review_status: "unreviewed",
    priority: "normal",
    discovery: [],
  }
  const window = {
    channel_id: "partial-source",
    since: "2026-10-02",
    until_exclusive: "2026-10-03",
  }
  const result = {
    summary: {
      status: "incomplete",
      reason: "detail_incomplete",
      ...window,
      window,
      listing_source_version_id: listing.source_version_id,
      assessment: { status: "window_covered" },
      candidate_count: 1,
      details: [
        {
          url: doc.original_url,
          status: "source_parsed_unreviewed",
          source_version_id: doc.source_version_id,
          parse_id,
        },
        { url: "https://example.com/news/image", status: "article_image_body_requires_review" },
      ],
    },
    documents: [doc],
    indexDocuments: [listing],
    parses: [parsed],
    candidates: [candidate],
  }
  const save = (id) => {
    for (const [name, value] of Object.entries({
      "list-scan.json": result.summary,
      "documents.json": result.documents,
      "list-pages.json": result.indexDocuments,
      "parses.json": result.parses,
      "candidates.json": result.candidates,
    }))
      atomicWrite(root, `runs/${id}/${name}`, value)
  }
  return { root, result, window, save, candidate }
}

test("zero-candidate detail repair reuses stored originals without admitting a partial article or completing coverage", async (t) => {
  const { root, result, window, save } = fixture(t)
  result.candidates = []
  result.summary.candidate_count = 0
  result.summary.details[0].status = "title_conflict"
  for (const doc of [...result.documents, ...result.indexDocuments]) doc.policy = { allowed: true }
  save("zero-candidate")
  const channel = { channel_id: window.channel_id, allowed_hosts: ["example.com"] }
  const basis = {
    route_sha256: sha256(JSON.stringify(channel)),
    dependencies: {},
    implementation: {},
  }
  atomicWrite(root, "runs/zero-candidate/collection-basis.json", basis)
  atomicWrite(root, "runs/zero-candidate/state.json", {
    input_hash: sha256(
      JSON.stringify({
        schema: "research-list-run-input/v2",
        channel_id: window.channel_id,
        since: window.since,
        until_exclusive: window.until_exclusive,
        reuse_listing_run: null,
        collection_basis: basis,
      }),
    ),
  })
  const before = fs.readFileSync(path.join(root, "runs/zero-candidate/list-scan.json"))
  const options = {
    detailRepair: true,
    now: Date.parse("2026-10-04T00:10:00Z"),
    fetchPolicy: () => {
      throw Error("No new HTTP request allowed")
    },
  }
  const reuse = createArchiveSourceReuse(
    root,
    "zero-candidate",
    channel,
    basis,
    { since: window.since, until: window.until_exclusive },
    options,
  )
  const document = await reuse.fetchPolicy(root, {}, result.documents[0].original_url, {
    allowed_hosts: channel.allowed_hosts,
  })
  assert.deepEqual(document, result.documents[0])
  assert.throws(
    () => verifyStoredPartialCandidates(root, result, window),
    /Partial candidate intake/,
  )
  const backlog = path.join(root, "empty-repair-backlog.json")
  await assert.rejects(mergePartialScan(root, result, backlog), /Partial candidate intake/)
  assert.equal(fs.existsSync(backlog), false)
  assert.deepEqual(fs.readFileSync(path.join(root, "runs/zero-candidate/list-scan.json")), before)
  assert.equal(result.summary.status, "incomplete")
  fs.writeFileSync(path.join(root, document.body_path), "changed")
  assert.throws(
    () =>
      createArchiveSourceReuse(
        root,
        "zero-candidate",
        channel,
        basis,
        { since: window.since, until: window.until_exclusive },
        options,
      ),
    /hash mismatch/,
  )
})

test("partial intake preserves the failed detail, refuses complete-window merge and deduplicates valid articles", async (t) => {
  const { root, result } = fixture(t)
  const backlog = path.join(root, "backlog.json")
  assert.equal((await mergeCompletedScan(result, backlog)).status, "skipped")
  assert.equal(fs.existsSync(backlog), false)
  const first = await mergePartialScan(root, result, backlog)
  assert.equal(first.status, "merged_partial")
  assert.equal(first.window_complete, false)
  const bytes = fs.readFileSync(backlog)
  assert.equal(readJSON(root, "backlog.json").candidates.length, 1)
  assert.equal((await mergePartialScan(root, result, backlog)).changed, false)
  assert.deepEqual(fs.readFileSync(backlog), bytes)
  assert.equal(result.summary.status, "incomplete")
  assert.equal(result.summary.details[1].status, "article_image_body_requires_review")
})

test("mixed RSS reuses native partial candidate intake without claiming external source coverage", async (t) => {
  const { root, result, window } = fixture(t)
  const listing = result.indexDocuments[0]
  const source = result.documents[0]
  const route = {
    channel_id: window.channel_id,
    method: "rss",
    url: listing.original_url,
    allowed_hosts: ["example.com"],
    item_pattern: "^https://example\\.com/news/[^/?#]+$",
    listing_profile: {
      pagination: "bounded-feed",
      rule_id: "feed",
      feed_title: "Official Feed",
      guid_is_permalink: true,
      outside_policy_items: "retain_uncollected",
    },
  }
  const link = (url, day) => ({
    url,
    guid: url,
    text: "Confirmed article",
    published_at: day,
    published_timestamp: day + "T00:00:00Z",
    listed_date_text: day + " 00:00:00 GMT",
  })
  const parsedListing = {
    ...result.parses[0],
    source_id: listing.source_id,
    source_version_id: listing.source_version_id,
    parse_id: sha256("mixed feed fixture"),
    title: "Official Feed",
    links: [
      link(source.original_url, "2026-10-02"),
      link("https://outside.example/research", "2026-10-02"),
      link("https://example.com/news/older", "2026-10-01"),
    ],
  }
  parsedListing.blocks = [
    {
      ...result.parses[0].blocks[0],
      block_id: parsedListing.parse_id + ":block-0001",
      text: "Covered dated listing",
      locator: { type: "rss", item_index: 0, text_hash: sha256("Covered dated listing") },
    },
  ]
  storeParseArtifact(root, parsedListing)
  let selected
  const scan = await scanBoundedRSSRoute(
    root,
    { stage: (_n, _i, fn) => fn() },
    {},
    route,
    [],
    { since: window.since, until: window.until_exclusive },
    {
      fetchPolicy: async () => listing,
      parseFeed: async () => parsedListing,
      collectDetails: async (_r, _run, _fetcher, _channel, _profiles, links) => {
        selected = links
        return {
          documents: result.documents,
          parses: result.parses,
          candidates: result.candidates,
          details: result.summary.details.slice(0, 1),
        }
      },
    },
  )
  assert.deepEqual(
    selected.map((l) => l.url),
    [source.original_url],
  )
  assert.equal(scan.summary.status, "incomplete")
  assert.equal(scan.summary.details[1].fetched, false)
  assert.equal(verifyStoredPartialCandidates(root, scan, window), true)
  assert.throws(() => verifyStoredListScan(root, scan, window), /does not prove/)
  const backlog = path.join(root, "rss-backlog.json")
  const intake = await mergePartialScan(root, scan, backlog)
  assert.equal(intake.status, "merged_partial")
  assert.equal(intake.window_complete, false)
  assert.equal(readJSON(root, "rss-backlog.json").candidates.length, 1)
  assert.equal(readJSON(root, "rss-backlog.json").candidates[0].review_status, "unreviewed")
})

test("path archive partial intake requires an original dated boundary and exact discovery linkage", async (t) => {
  const { root, result, window } = fixture(t)
  const listingDocument = result.indexDocuments[0]
  const parse_id = sha256("path listing fixture")
  const dom_path = "/html/body/main/a[1]"
  const parsed = {
    schema_version: "source-parse/v1",
    source_id: listingDocument.source_id,
    source_version_id: listingDocument.source_version_id,
    parse_id,
    parser: { id: "controlled-fixture" },
    status: "extracted",
    title: "Archive",
    title_profile_status: "matched",
    quality: { required_fields_present: true },
    dates: {},
    blocks: [
      {
        block_id: parse_id + ":block-0001",
        text: "Covered dated listing",
        kind: "paragraph",
        locator: {
          type: "html",
          dom_path: "/html/body/main",
          text_hash: sha256("Covered dated listing"),
        },
      },
    ],
    links: [
      {
        url: result.candidates[0].source_urls[0],
        text: "Confirmed article",
        profile_id: "archive",
        dom_path,
        published_at: "2026-10-02",
        listed_date_text: "2026-10-02",
      },
      {
        url: "https://example.com/news/older",
        text: "Older article",
        profile_id: "archive",
        dom_path: "/html/body/main/a[2]",
        published_at: "2026-10-01",
        listed_date_text: "2026-10-01",
      },
    ],
    link_profiles: [
      { id: "archive", status: "matched", selected_items: 2, matched_links: 2, truncated: false },
    ],
  }
  storeParseArtifact(root, parsed)
  result.documents.push(listingDocument)
  result.parses.push(parsed)
  result.summary.pagination = "path-pages"
  result.summary.assessment.rule_id = "archive"
  result.summary.pages = [
    { page: 1, url: listingDocument.original_url, parse_id, status: "window_boundary_reached" },
  ]
  result.candidates[0].discovery = [
    {
      source_version_id: listingDocument.source_version_id,
      parse_id,
      dom_path,
      profile_id: "archive",
    },
  ]
  assert.equal(verifyStoredPartialCandidates(root, result, window), true)
  for (const mutate of [
    (s) => {
      s.summary.pages[0].status = "page_scanned"
    },
    (s) => {
      s.summary.assessment.rule_id = "unproved"
    },
    (s) => {
      s.candidates[0].discovery[0].dom_path = "/unrelated"
    },
    (s) => {
      s.summary.pages[0].url = "https://example.com/other"
    },
  ]) {
    const changed = structuredClone(result)
    mutate(changed)
    assert.throws(() => verifyStoredPartialCandidates(root, changed, window))
  }
  const first = await mergePartialScan(root, result, path.join(root, "path-backlog.json"))
  assert.equal(first.status, "merged_partial")
  assert.equal(first.window_complete, false)
})

test("partial intake rejects unsupported evidence, conflicting dates, duplicate keys and incomplete listing coverage before writing", async (t) => {
  const { root, result, window } = fixture(t)
  const mutations = [
    (s) => {
      s.candidates[0].article_content_sha256 = "0".repeat(64)
    },
    (s) => {
      s.summary.details[0].status = "title_conflict"
    },
    (s) => {
      s.documents[0].policy_status = "unverified"
    },
    (s) => {
      s.indexDocuments[0].policy_status = "unverified"
    },
    (s) => {
      s.candidates[0].source_published_at = "2026-10-03"
    },
    (s) => {
      s.candidates.push(s.candidates[0])
    },
    (s) => {
      s.summary.assessment.status = "window_incomplete"
    },
    (s) => {
      s.parses[0].status = "partial"
    },
    (s) => {
      const other = s.indexDocuments[0]
      s.documents.push(other)
      s.candidates[0].article_source_version_id = other.source_version_id
      s.candidates[0].source_urls = [other.original_url]
      s.summary.details[0].source_version_id = other.source_version_id
      s.summary.details[0].url = other.original_url
    },
  ]
  for (const mutate of mutations) {
    const changed = structuredClone(result)
    mutate(changed)
    assert.throws(() => verifyStoredPartialCandidates(root, changed, window))
    await assert.rejects(() => mergePartialScan(root, changed, path.join(root, "rejected.json")))
    assert.equal(fs.existsSync(path.join(root, "rejected.json")), false)
  }
  fs.writeFileSync(path.join(root, result.documents[0].body_path), "changed source bytes")
  assert.throws(() => verifyStoredPartialCandidates(root, result, window), /hash mismatch/)
})

test("a blocked parse with a valid public date cannot become a completed scan candidate", (t) => {
  const { root, result, window } = fixture(t)
  const blocked = {
    ...result.parses[0],
    parse_id: sha256("blocked metadata fixture"),
    status: "blocked",
    blocks: [],
    title_profile_status: "matched",
    quality: { required_fields_present: false, reason: "authentication-page" },
    dates: {
      published_at: "2026-10-02",
      access_scope: "metadata-only",
      profile_status: "matched",
      basis: { dom_path: "/html/head/meta", text: "2026-10-02T08:30:00+09:00" },
    },
  }
  storeParseArtifact(root, blocked)
  result.parses = [blocked]
  result.candidates[0].article_parse_id = blocked.parse_id
  result.summary.status = "window_scanned"
  assert.throws(() => verifyStoredListScan(root, result, window), /complete readable article/)
})

test("daily partial intake supplies exact sources to editorial handoff while leaving coverage unresolved across resume", async (t) => {
  const { root, result, window, save, candidate } = fixture(t)
  const plan = {
    schema: "research-daily-plan/v1",
    run_id: "daily-20261004-partial",
    kst_day: "2026-10-04",
    cutoff: "2026-10-01T00:00:00Z",
    windows: [window],
    retry_policy: { max_attempts_per_window: 1, blocked_requires_new_observation: true },
  }
  const coverage = {
    schema: "research-daily-coverage/v1",
    routes: {
      "partial-source": {
        anchor_since: "2026-10-02",
        last_contiguous_until: "2026-10-02",
        covered: [],
        unresolved: [],
      },
    },
  }
  let scans = 0
  const backlogFile = path.join(root, "backlog.json")
  const options = {
    root,
    plan,
    coverage,
    backlogFile,
    activeRoutes: [
      {
        channel_id: window.channel_id,
        route: {
          channel_id: window.channel_id,
          sectors: ["로봇·제조"],
          region: "국내",
          axis: "기술·제품",
        },
      },
    ],
    sameEventAliases: new Map(),
    scan: async (_, id) => {
      scans++
      save(id)
      return result
    },
  }
  const summary = await executeDailyPlan(options)
  assert.equal(summary.status, "partial")
  assert.equal(summary.routes[0].status, "incomplete")
  const state = readJSON(root, "daily/route-coverage.json").routes[window.channel_id]
  assert.equal(state.covered.length, 0)
  assert.equal(state.last_contiguous_until, "2026-10-02")
  assert.equal(state.unresolved.length, 1)
  const receiptFile = fs.readdirSync(path.join(root, `daily/runs/${plan.run_id}/receipts`))[0]
  const receipt = readJSON(root, `daily/runs/${plan.run_id}/receipts/${receiptFile}`)
  assert.equal(receipt.status, "incomplete")
  assert.equal(receipt.backlog_merge.status, "merged_partial")
  assert.equal(verifyDailyReceipts(root, plan, [receipt], { sameEventAliases: new Map() }), true)
  const observation = {
    attempt_id: receipt.attempt_id,
    key: candidate.key,
    source_urls: candidate.source_urls,
    article_source_version_id: candidate.article_source_version_id,
    article_parse_id: candidate.article_parse_id,
    article_content_sha256: candidate.article_content_sha256,
  }
  const handoff = buildEditorialHandoff({
    plan,
    receipts: [receipt],
    observations: [observation],
    backlog: readJSON(root, "backlog.json"),
    issues: [],
    observedAt: receipt.finished_at,
  })
  assert.equal(handoff.incomplete_windows.length, 1)
  assert.equal(handoff.pending[0].source_evidence_state, "exact")
  assert.equal(
    selectCandidateSource(root, handoff, candidate.key).selected.parses[0].parse_id,
    candidate.article_parse_id,
  )
  const bytes = fs.readFileSync(backlogFile)
  await executeDailyPlan(options)
  assert.equal(scans, 1)
  assert.deepEqual(fs.readFileSync(backlogFile), bytes)
  const wrong = structuredClone(receipt)
  wrong.candidate_keys = ["unrelated"]
  assert.throws(
    () => verifyDailyReceipts(root, plan, [wrong], { sameEventAliases: new Map() }),
    /no longer matches/,
  )
  const promoted = structuredClone(receipt)
  promoted.status = "window_scanned"
  assert.throws(() => verifyDailyReceipts(root, plan, [promoted]), /cannot complete/)
})

test("partial intake reuses reviewed same-event aliases without adding a second candidate", async (t) => {
  const { root, result, candidate } = fixture(t)
  const backlogFile = path.join(root, "backlog.json")
  const target = {
    ...candidate,
    key: "existing-event",
    source_urls: ["https://example.com/original"],
  }
  atomicWrite(root, "backlog.json", { schema: "research-candidates/v1", candidates: [target] })
  const aliases = new Map([
    [
      candidate.source_urls[0],
      { candidate_key: target.key, resolution_run: "source-relation-review" },
    ],
  ])
  const merged = await mergePartialScan(root, result, backlogFile, undefined, aliases)
  assert.equal(merged.same_event_aliases[0].target_candidate_key, target.key)
  assert.deepEqual(readJSON(root, "backlog.json").candidates, [target])
})

test("explicit partial intake records immutable run-bound receipts and rejects modified source manifests", async (t) => {
  const { root, result, save } = fixture(t)
  save("partial-run")
  const backlogFile = path.join(root, "backlog.json")
  atomicWrite(root, "backlog.json", { schema: "research-candidates/v1", candidates: [] })
  const options = { root, result, runId: "partial-run", backlogFile }
  const first = await intakePartialScan(options)
  const receipt = readJSON(root, first.receipt)
  assert.equal(receipt.source_run, "partial-run")
  assert.equal(receipt.window_complete, false)
  assert.equal(receipt.candidate_approved, false)
  const bytes = fs.readFileSync(backlogFile)
  const second = await intakePartialScan(options)
  assert.notEqual(second.receipt, first.receipt)
  assert.equal(second.changed, false)
  assert.deepEqual(fs.readFileSync(backlogFile), bytes)
  atomicWrite(root, "runs/partial-run/candidates.json", [])
  await assert.rejects(() => intakePartialScan(options), /differs from its stored/)
  assert.deepEqual(fs.readFileSync(backlogFile), bytes)
})

test("private progress verifies partial intake receipts without counting unresolved details as completion", async (t) => {
  const { root, result, save } = fixture(t)
  save("partial-progress")
  const backlogFile = path.join(root, "backlog.json")
  atomicWrite(root, "backlog.json", { schema: "research-candidates/v1", candidates: [] })
  await intakePartialScan({ root, result, runId: "partial-progress", backlogFile })
  await intakePartialScan({ root, result, runId: "partial-progress", backlogFile })
  const audit = loadPartialCandidateIntakeEvidence(root, backlogFile)
  assert.equal(audit.receipt_count, 2)
  assert.equal(audit.unique_candidate_count, 1)
  assert.equal(audit.invalid_receipt_count, 0)
  assert.equal(audit.window_complete, false)
  assert.equal(audit.entries[0].unresolved_details.length, 1)
  const manifest = readJSON(root, "runs/partial-progress/list-scan.json")
  manifest.details[1].status = "source_parsed_unreviewed"
  atomicWrite(root, "runs/partial-progress/list-scan.json", manifest)
  const changed = loadPartialCandidateIntakeEvidence(root, backlogFile)
  assert.equal(changed.receipt_count, 0)
  assert.equal(changed.unique_candidate_count, 0)
  assert.equal(changed.invalid_receipt_count, 2)
})
