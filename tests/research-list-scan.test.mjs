import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  assessSinglePageIndex,
  loadReusableSinglePageListing,
  scanSinglePageRoute,
} from "../scripts/research/list-scan.mjs"
import { mergeCompletedScan } from "../scripts/research/scan-completion.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { storeParseArtifact } from "../scripts/research/parser.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"

const base = "https://www.fanuc.co.jp/en/profile/pr/newsrelease/"
const channel = {
  channel_id: "fanuc-en",
  publisher_id: "fanuc.co.jp",
  url: base,
  method: "html-list",
  language: "en",
  region: "해외",
  axis: "기술·제품",
  sectors: ["로봇·제조"],
  allowed_hosts: ["www.fanuc.co.jp"],
  item_pattern:
    "^https://www\\.fanuc\\.co\\.jp/en/profile/pr/newsrelease/20\\d\\d/notice\\d{8}\\.html$",
  listing_profile: { rule_id: "fanuc-index", pagination: "single-page" },
}
const link = (day, title) => ({
  url: base + `2026/notice${day.replaceAll("-", "")}.html`,
  text: title,
  published_at: day,
  listed_date_text: `2026 ${day}`,
  dom_path: "/html/body/main/ul/li/a",
  profile_id: "fanuc-index",
})
const links = [
  link("2026-09-11", "New welding robot announced"),
  link("2026-09-02", "Collaborative robot announced"),
  link("2026-08-27", "Older robot announcement"),
]

const temporary = (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-list-scan-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}
const listing = {
  status: "extracted",
  quality: { required_fields_present: true },
  parse_id: "listing-parse",
  links: [...links, ...links.map(({ profile_id, ...item }) => item)],
  link_profiles: [
    { id: "fanuc-index", status: "matched", selected_items: 3, matched_links: 3, truncated: false },
  ],
}

test("a dated full index covers a window only after reaching an older entry", () => {
  const result = assessSinglePageIndex(listing, channel, "2026-09-01", "2026-09-28")
  assert.equal(result.status, "window_covered")
  assert.equal(result.window_items, 2)
  assert.equal(result.older_items, 1)
  assert.deepEqual(
    result.links.map((item) => item.published_at),
    ["2026-09-11", "2026-09-02"],
  )
  const missingDate = structuredClone(listing)
  missingDate.links[0].published_at = null
  assert.equal(
    assessSinglePageIndex(missingDate, channel, "2026-09-01", "2026-09-28").reason,
    "listing_item_missing_identity_or_date",
  )
  const missingItem = structuredClone(listing)
  missingItem.link_profiles[0].matched_links = 2
  assert.equal(
    assessSinglePageIndex(missingItem, channel, "2026-09-01", "2026-09-28").reason,
    "listing_profile_incomplete",
  )
  assert.equal(
    assessSinglePageIndex(listing, channel, "2026-08-01", "2026-09-28").reason,
    "cutoff_not_reached",
  )
  assert.equal(
    assessSinglePageIndex({ ...listing, status: "partial" }, channel, "2026-09-01", "2026-09-28")
      .reason,
    "listing_parse_incomplete",
  )
})

test("accepted-only journal cards are accounted for without becoming published articles", () => {
  const published = [link("2026-09-25", "Published research"), link("2026-09-14", "Older research")]
  const accepted = link("2026-09-26", "Accepted manuscript")
  const journal = {
    ...channel,
    listing_profile: {
      ...channel.listing_profile,
      ignored_rule_ids: ["accepted-cards"],
    },
  }
  const parsed = {
    ...listing,
    links: [
      ...published,
      { ...accepted, profile_id: "accepted-cards" },
      ...[...published, accepted].map(({ profile_id, ...item }) => item),
    ],
    link_profiles: [
      {
        id: "fanuc-index",
        status: "matched",
        selected_items: 2,
        matched_links: 2,
        truncated: false,
      },
      {
        id: "accepted-cards",
        status: "matched",
        selected_items: 1,
        matched_links: 1,
        truncated: false,
      },
    ],
  }
  const covered = assessSinglePageIndex(parsed, journal, "2026-09-22", "2026-09-29")
  assert.equal(covered.status, "window_covered")
  assert.equal(covered.window_items, 1)
  assert.deepEqual(
    covered.links.map((item) => item.text),
    ["Published research"],
  )
  const missingAccepted = structuredClone(parsed)
  missingAccepted.links.splice(2, 1)
  assert.equal(
    assessSinglePageIndex(missingAccepted, journal, "2026-09-22", "2026-09-29").reason,
    "listing_ignored_profile_incomplete",
  )
  const unexpectedArticle = structuredClone(parsed)
  const { profile_id: _profileId, ...unclassified } = link("2026-09-27", "Unclassified article")
  unexpectedArticle.links.push(unclassified)
  assert.equal(
    assessSinglePageIndex(unexpectedArticle, journal, "2026-09-22", "2026-09-29").reason,
    "unprofiled_article_link",
  )
})

test("single-page total must cover every dated item when a publisher exposes counts", () => {
  const counted = {
    ...channel,
    listing_profile: { ...channel.listing_profile, require_complete_count: true },
  }
  const complete = {
    ...listing,
    listing_page_summary: { status: "matched", total: 3, page: 1, pages: 1 },
  }
  assert.equal(
    assessSinglePageIndex(complete, counted, "2026-09-01", "2026-09-28").status,
    "window_covered",
  )
  for (const summary of [
    { status: "missing" },
    { status: "matched", total: 4, page: 1, pages: 1 },
    { status: "matched", total: 3, page: 1, pages: 2 },
  ]) {
    const result = assessSinglePageIndex(
      { ...complete, listing_page_summary: summary },
      counted,
      "2026-09-01",
      "2026-09-28",
    )
    assert.equal(result.status, "incomplete")
    assert.equal(result.reason, "listing_count_or_pages_incomplete")
  }
})

test("the scan keeps article-date conflicts out of candidates and reuses completed stages", async () => {
  const values = new Map()
  const calls = []
  const run = {
    async stage(name, _input, action) {
      if (!values.has(name)) values.set(name, await action())
      return values.get(name)
    },
  }
  const fetchPolicy = async (_root, _fetcher, url) => {
    calls.push(url)
    return {
      source_id: url === base ? "listing" : "detail",
      source_version_id: url === base ? "listing:v1" : "detail:v1",
      original_url: url,
      final_url: url,
      fetch_status: "captured",
      observed_at: "2026-09-28T00:00:00Z",
    }
  }
  const parse = async (_root, document) => {
    if (document.original_url === base) return listing
    const published_at = document.original_url.includes("20260902") ? "2026-09-03" : "2026-09-11"
    return {
      parse_id: document.original_url,
      status: "extracted",
      title: "Official robot release",
      quality: { required_fields_present: true },
      blocks: [{ text: "Official release body" }],
      dates: { published_at },
    }
  }
  const profiles = [
    {
      id: "fanuc-release",
      url_pattern: "^https://www\\.fanuc\\.co\\.jp/en/profile/pr/newsrelease/2026/notice",
      options: { language: "en" },
    },
  ]
  const options = { since: "2026-09-01", until: "2026-09-28" }
  const first = await scanSinglePageRoute("private", run, {}, channel, profiles, options, {
    fetchPolicy,
    parse,
  })
  assert.equal(first.summary.status, "incomplete")
  assert.equal(first.summary.reason, "detail_incomplete")
  assert.deepEqual(
    first.summary.details.map((detail) => detail.status),
    ["source_parsed_unreviewed", "date_conflict"],
  )
  assert.equal(first.candidates.length, 1)
  assert.equal(first.candidates[0].source_published_at, "2026-09-11")
  assert.equal(first.candidates[0].article_source_version_id, "detail:v1")
  assert.equal(first.candidates[0].article_observed_at, "2026-09-28T00:00:00Z")
  assert.match(first.candidates[0].article_content_sha256, /^[a-f0-9]{64}$/)
  let merges = 0
  const merge = async () => {
    merges++
    return { changed: true }
  }
  assert.deepEqual(await mergeCompletedScan(first, "private/backlog.json", merge), {
    status: "skipped",
    reason: "detail_incomplete",
  })
  assert.equal(merges, 0)
  const second = await scanSinglePageRoute("private", run, {}, channel, profiles, options, {
    fetchPolicy,
    parse,
  })
  assert.equal(second.summary.status, "incomplete")
  assert.equal(calls.length, 3)
})

test("a reused single-page listing still gets an independent adjacent-window assessment", async () => {
  const calls = []
  const listingDocument = {
    source_id: "listing",
    source_version_id: "listing:v1",
    original_url: base,
    final_url: base,
    fetch_status: "captured",
    observed_at: "2026-09-28T00:00:00Z",
  }
  const listingParse = { ...listing, source_version_id: "listing:v1" }
  const run = {
    async stage(name, _input, action) {
      return action()
    },
  }
  const fetchPolicy = async (_root, _fetcher, url) => {
    calls.push(url)
    return {
      source_id: "detail",
      source_version_id: "detail:" + url.slice(-12),
      original_url: url,
      final_url: url,
      fetch_status: "captured",
      observed_at: "2026-09-28T00:00:00Z",
    }
  }
  const parse = async (_root, document) => ({
    parse_id: document.source_version_id,
    source_version_id: document.source_version_id,
    status: "extracted",
    title: "Official robot release",
    quality: { required_fields_present: true },
    blocks: [{ text: "Official release body" }],
    dates: {
      published_at: document.original_url.includes("20260911") ? "2026-09-11" : "2026-09-02",
    },
  })
  const result = await scanSinglePageRoute(
    "private",
    run,
    {},
    channel,
    [
      {
        id: "fanuc-release",
        url_pattern: "^https://www\\.fanuc\\.co\\.jp/en/profile/pr/newsrelease/2026/notice",
        options: { language: "en" },
      },
    ],
    { since: "2026-09-11", until: "2026-09-14" },
    {
      listingEvidence: { document: listingDocument, parse: listingParse, source_run: "prior-run" },
      fetchPolicy,
      parse,
    },
  )
  assert.equal(result.summary.status, "window_scanned")
  assert.equal(result.summary.listing_reused_from_run, "prior-run")
  assert.equal(result.summary.assessment.window_items, 1)
  assert.equal(result.candidates.length, 1)
  assert.equal(calls.length, 1)
  assert.match(calls[0], /notice20260911\.html$/u)
})

test("reusable listing requires adjacent completed window, matching config and fresh intact evidence", (t) => {
  const root = temporary(t)
  const runId = "prior-run"
  const body = Buffer.from("official listing snapshot")
  const body_sha256 = sha256(body)
  const listingSourceId = sourceId(base)
  const listingVersionId = `${listingSourceId}:${body_sha256}`
  const document = {
    original_url: base,
    source_id: listingSourceId,
    source_version_id: listingVersionId,
    fetch_status: "captured",
    body_path: `sources/${listingSourceId}/body.html`,
    body_sha256,
    observed_at: "2026-09-24T00:00:00Z",
  }
  atomicWrite(root, document.body_path, body)
  const parse_id = sha256(listingVersionId + ":listing-parse")
  const parsed = storeParseArtifact(root, {
    schema_version: "source-parse/v1",
    status: "extracted",
    title: "FANUC news",
    source_id: listingSourceId,
    source_version_id: listingVersionId,
    parse_id,
    dates: { published_at: null, observed_at: document.observed_at },
    links: listing.links,
    link_profiles: listing.link_profiles,
    quality: { required_fields_present: true, missing_pages: [] },
    blocks: [
      {
        block_id: `${parse_id}:block-1`,
        text: "FANUC news",
        locator: { text_hash: sha256("FANUC news") },
      },
    ],
  })
  const configHash = sha256(JSON.stringify(channel))
  atomicWrite(root, `runs/${runId}/list-scan.json`, {
    status: "window_scanned",
    channel_id: channel.channel_id,
    pagination: "single-page",
    channel_config_sha256: configHash,
    window: { since: "2026-09-21", until_exclusive: "2026-09-24" },
    observed_at: document.observed_at,
    listing_source_version_id: listingVersionId,
    listing_parse_id: parse_id,
  })
  atomicWrite(root, `runs/${runId}/documents.json`, [document])
  atomicWrite(root, `runs/${runId}/parses.json`, [parsed])

  const evidence = loadReusableSinglePageListing(
    root,
    runId,
    channel,
    { since: "2026-09-24", until_exclusive: "2026-09-28" },
    { now: Date.parse("2026-09-24T00:05:00Z") },
  )
  assert.equal(evidence.document.source_version_id, listingVersionId)
  assert.equal(evidence.parse.parse_id, parse_id)
  assert.throws(
    () =>
      loadReusableSinglePageListing(
        root,
        runId,
        channel,
        { since: "2026-09-25", until_exclusive: "2026-09-28" },
        { now: Date.parse("2026-09-24T00:05:00Z") },
      ),
    /adjacent completed/u,
  )
  assert.throws(
    () =>
      loadReusableSinglePageListing(
        root,
        runId,
        { ...channel, url: `${base}changed` },
        { since: "2026-09-24", until_exclusive: "2026-09-28" },
        { now: Date.parse("2026-09-24T00:05:00Z") },
      ),
    /adjacent completed/u,
  )
  assert.throws(
    () =>
      loadReusableSinglePageListing(
        root,
        runId,
        channel,
        { since: "2026-09-24", until_exclusive: "2026-09-28" },
        { now: Date.parse("2026-09-24T00:20:00Z") },
      ),
    /freshness/u,
  )
})

test("a completed empty window may merge while an incomplete window cannot", async () => {
  const calls = []
  const merge = async (file, candidates) => {
    calls.push({ file, candidates })
    return { changed: false }
  }
  const complete = { summary: { status: "window_scanned", reason: null }, candidates: [] }
  assert.deepEqual(await mergeCompletedScan(complete, "private/backlog.json", merge), {
    status: "merged",
    changed: false,
  })
  assert.deepEqual(calls, [{ file: "private/backlog.json", candidates: [] }])
})
