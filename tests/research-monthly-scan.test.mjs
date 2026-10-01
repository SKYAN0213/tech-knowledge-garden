import test from "node:test"
import assert from "node:assert/strict"
import {
  assessCalendarMonthIndex,
  scanCalendarMonthRoute,
} from "../scripts/research/monthly-scan.mjs"

const channel = {
  channel_id: "github-changelog",
  publisher_id: "github.blog",
  url: "https://github.blog/changelog/",
  method: "html-list",
  language: "en",
  region: "해외",
  axis: "기술·제품",
  sectors: ["소프트웨어·클라우드"],
  item_pattern: "^https://github\\.blog/changelog/20[0-9]{2}-[0-9]{2}-[0-9]{2}-[^/?#]+/?$",
  allowed_hosts: ["github.blog"],
  listing_profile: {
    rule_id: "github-changelog-month-v1",
    pagination: "calendar-month",
    url_template: "https://github.blog/changelog/{year}/{month}/",
    empty_state: { text_pattern: "^Nothing to see here\\.\\.\\. yet!$" },
  },
}
const article = (day, slug) => ({
  url: `https://github.blog/changelog/${day}-${slug}`,
  text: `GitHub ${slug} announcement`,
  published_at: day,
  listed_date_text: day,
  profile_id: "github-changelog-month-v1",
})
const archive = (year, month, items) => {
  const name = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(
    new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00Z`),
  )
  const url = `https://github.blog/changelog/${year}/${month}/`
  return {
    parse_id: `archive-${year}-${month}`,
    status: "extracted",
    title: `${name} ${year}`,
    quality: { required_fields_present: true },
    links: [
      ...items,
      { url, text: `${name} ${year}` },
      ...items.map(({ profile_id, ...item }) => item),
    ],
    link_profiles: [
      {
        id: "github-changelog-month-v1",
        status: items.length ? "matched" : "no-match",
        selected_items: items.length,
        matched_links: items.length,
        truncated: false,
      },
    ],
  }
}

test("calendar archive requires its month marker and exact article dates", () => {
  const month = { year: 2026, month: 9, key: "2026-09" }
  const url = "https://github.blog/changelog/2026/9/"
  const parsed = archive(2026, 9, [
    article("2026-09-28", "new-feature"),
    article("2026-09-03", "older-feature"),
  ])
  assert.equal(assessCalendarMonthIndex(parsed, channel, url, month).status, "month_scanned")
  const missingMarker = structuredClone(parsed)
  missingMarker.links = missingMarker.links.filter((link) => link.url !== url)
  assert.equal(
    assessCalendarMonthIndex(missingMarker, channel, url, month).reason,
    "archive_month_marker_missing",
  )
  const wrongDate = structuredClone(parsed)
  wrongDate.links[0].published_at = "2026-09-27"
  assert.equal(
    assessCalendarMonthIndex(wrongDate, channel, url, month).reason,
    "archive_article_identity_or_date_invalid",
  )
  const unseenArticle = structuredClone(parsed)
  unseenArticle.links.push({ url: article("2026-09-01", "unprofiled").url, text: "Unprofiled" })
  assert.equal(
    assessCalendarMonthIndex(unseenArticle, channel, url, month).reason,
    "archive_unprofiled_article_link",
  )
})

test("calendar archive accepts only its explicitly configured empty state", () => {
  const month = { year: 2026, month: 10, key: "2026-10" }
  const url = "https://github.blog/changelog/2026/10/"
  const parsed = {
    parse_id: "empty-2026-10",
    status: "extracted",
    title: "Nothing to see here... yet!",
    quality: { required_fields_present: true },
    blocks: [
      { kind: "heading", text: "Nothing to see here... yet!" },
      { kind: "paragraph", text: "Try adjusting your filters or check back later." },
    ],
    links: [],
    link_profiles: [
      {
        id: "github-changelog-month-v1",
        status: "no-match",
        selected_items: 0,
        matched_links: 0,
        truncated: false,
      },
    ],
  }
  const accepted = assessCalendarMonthIndex(parsed, channel, url, month)
  assert.equal(accepted.status, "month_scanned")
  assert.equal(accepted.confirmed_empty, true)
  assert.deepEqual(accepted.links, [])
  const unmarked = structuredClone(parsed)
  unmarked.blocks[0].text = "No announcements"
  assert.equal(
    assessCalendarMonthIndex(unmarked, channel, url, month).reason,
    "archive_month_marker_missing",
  )
  const hiddenArticle = structuredClone(parsed)
  hiddenArticle.links.push({
    url: "https://github.blog/changelog/2026-10-01-hidden-entry",
    text: "Unprofiled article",
  })
  assert.equal(
    assessCalendarMonthIndex(hiddenArticle, channel, url, month).reason,
    "archive_month_marker_missing",
  )
})

test("a window across months reads both full archives before selecting details", async () => {
  const pages = new Map([
    [
      "https://github.blog/changelog/2026/9/",
      archive(2026, 9, [article("2026-09-30", "september"), article("2026-09-20", "old")]),
    ],
    [
      "https://github.blog/changelog/2026/10/",
      archive(2026, 10, [article("2026-10-02", "later"), article("2026-10-01", "october")]),
    ],
  ])
  const fetched = [],
    selected = []
  const fetchPolicy = async (_root, _fetcher, url) => {
    fetched.push(url)
    return {
      original_url: url,
      final_url: url,
      fetch_status: "captured",
      source_version_id: url + ":version",
      observed_at: "2026-10-02T00:00:00Z",
    }
  }
  const parse = async (_root, document) => pages.get(document.original_url)
  const run = { stage: async (_stage, _input, action) => action() }
  const collectDetails = async (_root, _run, _fetcher, _channel, _profiles, links) => {
    selected.push(...links)
    return {
      documents: [],
      parses: [],
      candidates: links.map((link) => ({ key: link.url })),
      details: links.map((link) => ({ url: link.url, status: "source_parsed_unreviewed" })),
    }
  }
  const result = await scanCalendarMonthRoute(
    "private",
    run,
    {},
    channel,
    [],
    { since: "2026-09-29", until: "2026-10-02" },
    { fetchPolicy, parse, collectDetails },
  )
  assert.deepEqual(fetched, [...pages.keys()])
  assert.deepEqual(
    selected.map((link) => link.published_at),
    ["2026-09-30", "2026-10-01"],
  )
  assert.equal(result.summary.status, "window_scanned")
  assert.equal(result.indexDocuments.length, 2)
  assert.equal(result.candidates.length, 2)
  const broken = new Map(pages)
  broken.set("https://github.blog/changelog/2026/10/", {
    ...pages.get("https://github.blog/changelog/2026/10/"),
    title: "Wrong archive",
  })
  selected.length = 0
  const incomplete = await scanCalendarMonthRoute(
    "private",
    run,
    {},
    channel,
    [],
    { since: "2026-09-29", until: "2026-10-02" },
    {
      fetchPolicy,
      parse: async (_root, document) => broken.get(document.original_url),
      collectDetails,
    },
  )
  assert.equal(incomplete.summary.status, "incomplete")
  assert.equal(incomplete.summary.reason, "archive_month_marker_missing")
  assert.equal(selected.length, 0)
})

test("calendar scan records a confirmed empty month without inventing details", async () => {
  const url = "https://github.blog/changelog/2026/10/"
  const document = {
    original_url: url,
    final_url: url,
    fetch_status: "captured",
    source_version_id: `${url}:empty-version`,
    observed_at: "2026-10-01T00:00:00Z",
  }
  const parse = {
    parse_id: "empty-2026-10",
    status: "extracted",
    title: "Nothing to see here... yet!",
    quality: { required_fields_present: true },
    blocks: [{ kind: "heading", text: "Nothing to see here... yet!" }],
    links: [],
    link_profiles: [
      {
        id: "github-changelog-month-v1",
        status: "no-match",
        selected_items: 0,
        matched_links: 0,
        truncated: false,
      },
    ],
  }
  const result = await scanCalendarMonthRoute(
    "private",
    { stage: async (_stage, _input, action) => action() },
    {},
    channel,
    [],
    { since: "2026-10-01", until: "2026-10-02" },
    {
      fetchPolicy: async () => document,
      parse: async () => parse,
      collectDetails: async () => assert.fail("empty month must not request article details"),
    },
  )
  assert.equal(result.summary.status, "window_scanned")
  assert.equal(result.summary.candidate_count, 0)
  assert.equal(result.summary.pages[0].confirmed_empty, true)
  assert.deepEqual(result.candidates, [])
})
