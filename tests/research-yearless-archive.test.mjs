import test from "node:test"
import assert from "node:assert/strict"
import { resolveYearlessArchiveDates, scanPathPagesRoute } from "../scripts/research/list-scan.mjs"
import { validateDailyRoutes } from "../scripts/research/daily-plan.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"

const route = {
  channel_id: "yearless-news",
  method: "html-list",
  language: "en",
  region: "해외",
  publisher_id: "example.org",
  sectors: ["AI"],
  axis: "기술·제품",
  url: "https://example.org/news?page=1",
  allowed_hosts: ["example.org"],
  item_pattern: "^https://example\\.org/article/[a-z]+$",
  scan_max_details: 10,
  listing_profile: {
    pagination: "path-pages",
    url_template: "https://example.org/news?page={page}",
    max_pages: 3,
    rule_id: "archive",
    excluded_categories: [],
    require_title_match: true,
    article_date_resolution: "yearless-month-day",
    max_date_resolution_details: 10,
  },
}
const profiles = [
  {
    id: "exact-article",
    url_pattern: route.item_pattern,
    options: { publication_date_policy: "explicit-authoritative" },
  },
]
const link = (slug, date) => ({
  url: "https://example.org/article/" + slug,
  text: "Article " + slug,
  profile_id: "archive",
  listed_date_text: date,
  published_at: null,
})
const listing = (links, page = 1) => ({
  status: "extracted",
  parse_id: sha256("listing" + page),
  source_version_id: sourceId(route.url) + ":" + sha256("listing" + page),
  title: "News",
  quality: { required_fields_present: true },
  links,
  link_profiles: [
    {
      id: "archive",
      status: "matched",
      selected_items: links.length,
      matched_links: links.length,
      truncated: false,
    },
  ],
})
const document = (url) => ({
  original_url: url,
  final_url: url,
  fetch_status: "captured",
  source_id: sourceId(url),
  source_version_id: sourceId(url) + ":" + sha256(url),
  observed_at: "2026-10-04T00:00:00Z",
})
const article = (url, date) => ({
  status: "extracted",
  title: "Article " + url.split("/").at(-1),
  source_version_id: document(url).source_version_id,
  parse_id: sha256("parse" + url),
  quality: { required_fields_present: true },
  dates: { published_at: date },
  blocks: [{ text: "Reported information." }],
})
const run = { stage: async (_name, _input, operation) => operation() }

test("yearless archive dates use the exact original across a year boundary and retain both sources", async () => {
  const old = link("old", "12-31 08:30")
  const result = await resolveYearlessArchiveDates(
    "unused",
    run,
    {},
    route,
    profiles,
    listing([old]),
    10,
    {
      fetchPolicy: async (_r, _f, url) => document(url),
      parse: async (_r, d) => article(d.original_url, "2025-12-31"),
    },
  )
  assert.equal(result.reason, null)
  assert.equal(result.listing.links[0].published_at, "2025-12-31")
  assert.equal(old.published_at, null)
  assert.equal(result.resolutions[0].listed_date_text, "12-31 08:30")
  assert.equal(result.resolutions[0].parse_id, result.parses[0].parse_id)
  assert.equal(result.resolutions[0].listing_parse_id, listing([old]).parse_id)
})

test("yearless archive rejects a mismatched day, unreadable original, title conflict or invented listing year", async () => {
  const original = link("one", "10-03 09:00")
  for (const change of [
    { dates: { published_at: "2026-10-02" } },
    { status: "partial" },
    { title: "A different article" },
    { dates: {} },
  ]) {
    const result = await resolveYearlessArchiveDates(
      "unused",
      run,
      {},
      route,
      profiles,
      listing([original]),
      10,
      {
        fetchPolicy: async (_r, _f, url) => document(url),
        parse: async (_r, d) => ({ ...article(d.original_url, "2026-10-03"), ...change }),
      },
    )
    assert.equal(result.reason, "archive_article_date_missing_or_conflict")
    assert.equal(result.resolutions.length, 0)
  }
  const result = await resolveYearlessArchiveDates(
    "unused",
    run,
    {},
    route,
    profiles,
    listing([{ ...original, published_at: "2026-10-03" }]),
    10,
    {
      fetchPolicy: async () => {
        throw Error("Must not fetch an invented year")
      },
    },
  )
  assert.equal(result.reason, "archive_yearless_date_invalid")
})

test("yearless resolution keeps budgets, policy failures and circular listing dates visible", async () => {
  const source = listing([link("one", "10-03 09:00")])
  const exceeded = await resolveYearlessArchiveDates("unused", run, {}, route, profiles, source, 0)
  assert.equal(exceeded.reason, "archive_date_resolution_budget_exceeded")
  const blocked = await resolveYearlessArchiveDates(
    "unused",
    run,
    {},
    route,
    profiles,
    source,
    10,
    { fetchPolicy: async () => ({ fetch_status: "blocked" }) },
  )
  assert.equal(blocked.reason, "archive_date_source_blocked")
  const circular = await resolveYearlessArchiveDates(
    "unused",
    run,
    {},
    route,
    [{ ...profiles[0], options: { publication_date_from_listing: true } }],
    source,
    10,
    { fetchPolicy: async (_r, _f, url) => document(url) },
  )
  assert.equal(circular.reason, "archive_date_profile_missing_or_circular")
})

test("yearless pagination reuses originals for detail intake, retains boundary evidence and emits unique documents", async () => {
  const stages = new Map(),
    requested = []
  const cachedRun = {
    stage: async (name, _input, operation) => {
      if (!stages.has(name)) stages.set(name, await operation())
      return stages.get(name)
    },
  }
  const result = await scanPathPagesRoute(
    "unused",
    cachedRun,
    {},
    route,
    profiles,
    { since: "2025-12-30", until: "2026-01-02" },
    {
      fetchPolicy: async (_r, _f, url) => {
        requested.push(url)
        return document(url)
      },
      parse: async (_r, d) =>
        d.original_url.includes("news?page=")
          ? d.original_url.endsWith("=1")
            ? listing([link("new", "01-01 09:00"), link("old", "12-31 08:30")])
            : listing([link("boundary", "12-29 17:00")], 2)
          : article(
              d.original_url,
              d.original_url.endsWith("new")
                ? "2026-01-01"
                : d.original_url.endsWith("old")
                  ? "2025-12-31"
                  : "2025-12-29",
            ),
    },
  )
  assert.equal(result.summary.status, "window_scanned")
  assert.equal(result.summary.date_resolutions.length, 3)
  assert.equal(result.candidates.length, 2)
  assert.equal(result.documents.length, 5)
  assert.equal(result.parses.length, 5)
  assert.equal(requested.length, 5)
  assert.equal(new Set(requested).size, 5)
})

test("RSS fallback permits unfiltered archives and requires category evidence only for exclusions", () => {
  const fallback = {
    pagination: "path-pages",
    url_template: route.listing_profile.url_template,
    rule_id: "archive",
    max_pages: 3,
    excluded_categories: [],
    parse_options: { listing_link_rules: [{ id: "archive" }] },
  }
  const rss = {
    ...route,
    method: "rss",
    listing_profile: {
      pagination: "bounded-feed",
      rule_id: "feed",
      feed_title: "News",
      max_items: 50,
      guid_is_permalink: true,
      fallback_archive: fallback,
    },
  }
  const config = {
    schema: "research-daily-routes/v1",
    lookback_days: 7,
    max_window_days: 7,
    routes: [{ channel_id: route.channel_id, enabled: true, baseline_run: "baseline" }],
  }
  assert.equal(validateDailyRoutes(config, [rss]).length, 1)
  assert.throws(
    () =>
      validateDailyRoutes(config, [
        {
          ...rss,
          listing_profile: {
            ...rss.listing_profile,
            fallback_archive: { ...fallback, excluded_categories: ["MEDIA"] },
          },
        },
      ]),
    /fallback archive profile/,
  )
  assert.throws(
    () =>
      validateDailyRoutes(config, [
        {
          ...rss,
          listing_profile: {
            ...rss.listing_profile,
            fallback_archive: {
              ...fallback,
              article_date_resolution: "current-year",
              max_date_resolution_details: 10,
            },
          },
        },
      ]),
    /fallback archive profile/,
  )
})
