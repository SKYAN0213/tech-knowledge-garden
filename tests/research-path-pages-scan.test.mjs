import test from "node:test"
import assert from "node:assert/strict"
import { assessPathPage, scanPathPagesRoute } from "../scripts/research/list-scan.mjs"

const channel = {
  channel_id: "skhynix-newsroom-en",
  publisher_id: "news.skhynix.com",
  url: "https://news.skhynix.com/en/all/page/1/",
  method: "html-list",
  language: "en",
  region: "국내",
  axis: "기술·제품",
  sectors: ["반도체·컴퓨팅"],
  allowed_hosts: ["news.skhynix.com"],
  item_pattern:
    "^https://news\\.skhynix\\.com/en/(?!all(?:/|$)|category(?:/|$)|page(?:/|$)|tag(?:/|$))[^/?#]+/?$",
  scan_max_details: 10,
  listing_profile: {
    pagination: "path-pages",
    url_template: "https://news.skhynix.com/en/all/page/{page}/",
    max_pages: 4,
    rule_id: "skhynix-archive",
    excluded_categories: ["MEDIA"],
    require_title_match: true,
  },
  parse_options: {
    language: "en",
    listing_link_rules: [{ id: "skhynix-archive", category_xpath: ".//div[@class='category']/a" }],
  },
}
const item = (day, slug, categories = ["TECH&AI"]) => ({
  url: `https://news.skhynix.com/en/${slug}/`,
  text: `SK hynix ${slug} announcement`,
  published_at: day,
  listed_date_text: `September ${Number(day.slice(-2))}, 2026`,
  profile_id: "skhynix-archive",
  categories,
})
const parsed = (items, page = 1) => ({
  parse_id: `parse-${page}`,
  status: "extracted",
  quality: { required_fields_present: true },
  links: [...items, ...items.map(({ profile_id, ...link }) => link)],
  link_profiles: [
    {
      id: "skhynix-archive",
      status: "matched",
      selected_items: items.length,
      matched_links: items.length,
      truncated: false,
    },
  ],
})
const run = { stage: async (_name, _input, action) => action() }

test("path-page assessment requires complete dated entries and archive categories", () => {
  const valid = parsed([item("2026-09-30", "new"), item("2026-09-21", "older")])
  assert.equal(assessPathPage(valid, channel).status, "page_scanned")
  const missingCategory = structuredClone(valid)
  delete missingCategory.links[0].categories
  assert.equal(assessPathPage(missingCategory, channel).reason, "archive_categories_missing")
  const ascending = parsed([item("2026-09-21", "older"), item("2026-09-30", "new")])
  assert.equal(assessPathPage(ascending, channel).reason, "archive_not_newest_first")
})

test("bounded path pagination reaches an older boundary and omits excluded media details", async () => {
  const pages = new Map([
    [1, parsed([item("2026-09-30", "today"), item("2026-09-28", "media", ["MEDIA"])], 1)],
    [2, parsed([item("2026-09-21", "boundary"), item("2026-09-18", "older")], 2)],
  ])
  const fetched = [],
    detailed = []
  const fetchPolicy = async (_root, _fetcher, url) => {
    fetched.push(url)
    return {
      original_url: url,
      final_url: url,
      fetch_status: "captured",
      source_version_id: `${url}:v1`,
      observed_at: "2026-09-30T00:00:00Z",
    }
  }
  const collectDetails = async (_root, _run, _fetcher, _channel, _profiles, selected) => {
    detailed.push(...selected)
    return {
      documents: [],
      parses: [],
      candidates: selected.map((link) => ({ url: link.url })),
      details: selected.map(() => ({ status: "source_parsed_unreviewed" })),
    }
  }
  const result = await scanPathPagesRoute(
    "private",
    run,
    {},
    channel,
    [],
    { since: "2026-09-23", until: "2026-10-01" },
    {
      fetchPolicy,
      parse: async (_root, document) =>
        pages.get(Number(new URL(document.original_url).pathname.match(/page\/(\d+)/)[1])),
      collectDetails,
    },
  )
  assert.equal(result.summary.status, "window_scanned")
  assert.equal(result.summary.reason, null)
  assert.equal(result.summary.pages.length, 2)
  assert.equal(fetched.length, 2)
  assert.deepEqual(
    detailed.map((link) => link.text),
    ["SK hynix today announcement"],
  )
  assert.equal(result.candidates.length, 1)
})

test("path pagination remains incomplete if no page reaches the requested date boundary", async () => {
  const result = await scanPathPagesRoute(
    "private",
    run,
    {},
    channel,
    [],
    { since: "2026-09-23", until: "2026-10-01" },
    {
      fetchPolicy: async (_root, _fetcher, url) => ({
        original_url: url,
        final_url: url,
        fetch_status: "captured",
        source_version_id: `${url}:v1`,
        observed_at: "2026-09-30T00:00:00Z",
      }),
      parse: async (_root, document) => {
        const page = Number(new URL(document.original_url).pathname.match(/page\/(\d+)/)[1])
        return parsed([item("2026-09-30", `today-${page}`)], page)
      },
      collectDetails: async () => {
        throw Error("Details must wait for a dated boundary")
      },
    },
  )
  assert.equal(result.summary.status, "incomplete")
  assert.equal(result.summary.reason, "archive_cutoff_not_reached")
  assert.equal(result.summary.pages.length, 4)
  assert.equal(result.candidates.length, 0)
})

const pinnedChannel = {
  ...channel,
  item_pattern: "^https://news\\.skhynix\\.com/en/[^/?#]+/?(?:\\?page=[0-9]+)?$",
  listing_profile: { ...channel.listing_profile, pinned_rule_ids: ["pinned-advisories"] },
}

test("explicit adjacent-prefix policy deduplicates only matching last-to-first rows", async () => {
  const overlapChannel = {
    ...channel,
    listing_profile: {
      ...channel.listing_profile,
      page_overlap_policy: { mode: "adjacent-prefix", max_items: 1 },
    },
  }
  const pages = new Map([
    [1, parsed([item("2026-09-30", "new"), item("2026-09-29", "overlap")], 1)],
    [2, parsed([item("2026-09-29", "overlap"), item("2026-09-21", "boundary")], 2)],
  ])
  const execute = () =>
    scanPathPagesRoute(
      "unused",
      run,
      {},
      overlapChannel,
      [],
      { since: "2026-09-23", until: "2026-10-01" },
      {
        fetchPolicy: async (_r, _f, url) => ({
          original_url: url,
          final_url: url,
          fetch_status: "captured",
          source_version_id: url + ":v1",
          observed_at: "2026-09-30T00:00:00Z",
        }),
        parse: async (_r, d) =>
          pages.get(Number(new URL(d.original_url).pathname.match(/page\/(\d+)/)[1])),
        collectDetails: async (_r, _run, _f, _c, _p, links) => ({
          documents: [],
          parses: [],
          candidates: links,
          details: links.map(() => ({ status: "source_parsed_unreviewed" })),
        }),
      },
    )
  const result = await execute()
  assert.equal(result.summary.status, "window_scanned")
  assert.equal(result.candidates.length, 2)
  assert.equal(result.summary.page_overlaps[0].urls.length, 1)
  pages.set(
    2,
    parsed(
      [
        item("2026-09-29", "overlap"),
        item("2026-09-29", "overlap-2"),
        item("2026-09-21", "boundary"),
      ],
      2,
    ),
  )
  pages.get(2).links[0].text = "Changed announcement"
  assert.equal((await execute()).summary.reason, "archive_duplicate_across_pages")
  pages.set(2, parsed([item("2026-09-29", "overlap")], 2))
  assert.equal((await execute()).summary.reason, "archive_duplicate_across_pages")
})
const pinned = (day, id, page = 1, categories) => ({
  ...item(day, `notice-${id}?page=${page}`, categories),
  url: `https://news.skhynix.com/en/notice-${id}/?page=${page}`,
  text: `SK hynix notice-${id} announcement`,
  source_item_id: id,
  profile_id: "pinned-advisories",
})
const withPins = (items, pins, page = 1) => ({
  ...parsed(items, page),
  links: [...parsed(items, page).links, ...pins],
  link_profiles: [
    ...parsed(items, page).link_profiles,
    {
      id: "pinned-advisories",
      status: pins.length ? "matched" : "no-match",
      selected_items: pins.length,
      matched_links: pins.length,
      truncated: false,
    },
  ],
})
async function scanPinned(pages, overrides = {}) {
  return scanPathPagesRoute(
    "private",
    run,
    {},
    pinnedChannel,
    [],
    { since: "2026-09-23", until: "2026-10-01" },
    {
      fetchPolicy: async (_root, _fetcher, url) => ({
        original_url: url,
        final_url: url,
        fetch_status: "captured",
        source_version_id: `${url}:v1`,
        observed_at: "2026-09-30T00:00:00Z",
      }),
      parse: async (_root, document) =>
        pages.get(Number(new URL(document.original_url).pathname.match(/page\/(\d+)/)[1])),
      collectDetails: async (_root, _run, _fetcher, _channel, _profiles, links) => ({
        documents: [],
        parses: [],
        candidates: links,
        details: links.map(() => ({ status: "source_parsed_unreviewed" })),
      }),
      ...overrides,
    },
  )
}

test("repeated pinned native records keep the observed URL and never define the date boundary", async () => {
  const result = await scanPinned(
    new Map([
      [
        1,
        withPins(
          [item("2026-09-30", "today")],
          [pinned("2026-09-29", "72207"), pinned("2026-09-01", "old")],
          1,
        ),
      ],
      [
        2,
        withPins(
          [item("2026-09-21", "boundary")],
          [pinned("2026-09-29", "72207", 2), pinned("2026-09-01", "old", 2)],
          2,
        ),
      ],
    ]),
  )
  assert.equal(result.summary.status, "window_scanned")
  assert.equal(result.summary.pages.length, 2)
  assert.equal(result.candidates.length, 2)
  assert.equal(result.candidates[1].source_item_id, "72207")
  assert.equal(result.candidates[1].url, pinned("2026-09-29", "72207").url)
  assert.equal(result.candidates[1].listing_parse_id, "parse-1")
})

test("a pinned record appearing in chronological rows can prove an older boundary", async () => {
  const ordinary = { ...pinned("2026-09-21", "old", 2), profile_id: "skhynix-archive" }
  const result = await scanPinned(
    new Map([
      [1, withPins([item("2026-09-30", "today")], [pinned("2026-09-21", "old")], 1)],
      [2, withPins([ordinary], [pinned("2026-09-21", "old", 2)], 2)],
    ]),
  )
  assert.equal(result.summary.status, "window_scanned")
  assert.equal(result.candidates.length, 1)
})

test("pinned conflicts and unproved profiles are rejected; excluded categories apply to pins", async () => {
  const conflicting = await scanPinned(
    new Map([
      [1, withPins([item("2026-09-30", "today")], [pinned("2026-09-29", "72207")], 1)],
      [2, withPins([item("2026-09-21", "boundary")], [pinned("2026-09-28", "72207", 2)], 2)],
    ]),
  )
  assert.equal(conflicting.summary.reason, "archive_pinned_identity_conflict")
  assert.equal(conflicting.candidates.length, 0)
  const missing = withPins([item("2026-09-30", "today")], [], 1)
  missing.link_profiles.pop()
  assert.equal(assessPathPage(missing, pinnedChannel).reason, "archive_pinned_profile_incomplete")
  const badId = withPins(
    [item("2026-09-30", "today")],
    [{ ...pinned("2026-09-29", "72207"), source_item_id: 72207 }],
  )
  assert.equal(
    assessPathPage(badId, pinnedChannel).reason,
    "archive_article_identity_or_date_invalid",
  )
  const excluded = await scanPinned(
    new Map([
      [
        1,
        withPins([item("2026-09-21", "boundary")], [pinned("2026-09-29", "media", 1, ["MEDIA"])]),
      ],
    ]),
  )
  assert.equal(excluded.summary.status, "window_scanned")
  assert.equal(excluded.candidates.length, 0)
})

test("ordinary duplicates remain incomplete even when stable IDs match", async () => {
  const one = { ...item("2026-09-30", "record"), source_item_id: "72207" }
  const result = await scanPinned(
    new Map([
      [1, withPins([one], [], 1)],
      [
        2,
        withPins(
          [{ ...one, url: item("2026-09-30", "record-2").url }, item("2026-09-21", "boundary")],
          [],
          2,
        ),
      ],
    ]),
  )
  assert.equal(result.summary.reason, "archive_duplicate_across_pages")
})
