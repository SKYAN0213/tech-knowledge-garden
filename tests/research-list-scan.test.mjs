import test from "node:test"
import assert from "node:assert/strict"
import { assessSinglePageIndex, scanSinglePageRoute } from "../scripts/research/list-scan.mjs"
import { mergeCompletedScan } from "../scripts/research/scan-completion.mjs"

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
