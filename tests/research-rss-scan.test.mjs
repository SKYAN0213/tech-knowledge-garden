import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { candidatesFromLinks } from "../scripts/research/discovery.mjs"
import { collectWindowDetails } from "../scripts/research/list-scan.mjs"
import { assertStoredEvidence } from "../scripts/research/parser.mjs"
import {
  assessBoundedRSSFeed,
  parseStoredRSSFeed,
  scanBoundedRSSRoute,
} from "../scripts/research/rss-scan.mjs"

const channel = {
  channel_id: "official-feed",
  method: "rss",
  url: "https://feeds.example.com/news.xml",
  language: "en",
  allowed_hosts: ["feeds.example.com", "example.com"],
  item_pattern: "^https://example\\.com/articles/[^/?#]+/?$",
  scan_max_details: 10,
  listing_profile: {
    pagination: "bounded-feed",
    rule_id: "official-feed-v1",
    feed_title: "Official Feed",
    max_items: 20,
    guid_is_permalink: true,
  },
}
const item = (date, slug) => ({
  url: `https://example.com/articles/${slug}/`,
  guid: `https://example.com/articles/${slug}/`,
  text: `Verified article ${slug}`,
  listed_date_text: date + " 12:00:00 GMT",
  published_at: date,
  published_timestamp: date + "T12:00:00.000Z",
})
const links = [item("2026-09-25", "recent"), item("2026-09-08", "older")]
const parse = {
  status: "extracted",
  title: "Official Feed",
  quality: { required_fields_present: true },
  links,
}

test("stored RSS bytes become immutable parse evidence and a dated discovery list", async () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "research-rss-"))
  try {
    const xml = `<rss version="2.0"><channel><title>Official Feed</title><link>https://example.com/</link><description>News</description>
      <item><title>Verified article recent</title><link>https://example.com/articles/recent/</link><guid>https://example.com/articles/recent/</guid><pubDate>Fri, 25 Sep 2026 12:00:00 GMT</pubDate></item>
      <item><title>Verified article older</title><link>https://example.com/articles/older/</link><guid>https://example.com/articles/older/</guid><pubDate>Tue, 08 Sep 2026 12:00:00 GMT</pubDate></item>
      </channel></rss>`
    const raw = Buffer.from(xml)
    fs.writeFileSync(path.join(root, "feed.xml"), raw)
    const document = {
      fetch_status: "captured",
      original_url: channel.url,
      source_id: sourceId(channel.url),
      body_path: "feed.xml",
      body_sha256: sha256(raw),
      observed_at: "2026-09-29T00:00:00Z",
    }
    document.source_version_id = `${document.source_id}:${document.body_sha256}`
    const result = await parseStoredRSSFeed(root, document, channel)
    assert.equal(result.title, "Official Feed")
    assert.equal(result.links.length, 2)
    assert.equal(result.links[0].published_at, "2026-09-25")
    assert.equal(
      assessBoundedRSSFeed(result, channel, "2026-09-22", "2026-09-29").status,
      "window_covered",
    )
    assertStoredEvidence(root, [document], [result])
    fs.writeFileSync(path.join(root, "feed.xml"), "changed")
    await assert.rejects(() => parseStoredRSSFeed(root, document, channel), /hash mismatch/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("Airbus day-only RSS dates retain calendar precision and cover the older boundary", async () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "research-rss-day-only-"))
  const airbus = {
    ...channel,
    url: "https://www.airbus.com/en/rss-all-feeds/15601?tid=15601&fid=29726",
    allowed_hosts: ["www.airbus.com"],
    item_pattern: "^https://www\\.airbus\\.com/en/newsroom/(?:press-releases|stories)/[^?#]+$",
    listing_profile: {
      ...channel.listing_profile,
      feed_title: "Space",
      guid_is_permalink: false,
      pub_date_format: "weekday-mdy-day-v1",
      pub_date_precision: "day",
    },
  }
  try {
    const xml = `<rss version="2.0"><channel><title>Space</title>
      <item><title>Current release</title><link>https://www.airbus.com/en/newsroom/press-releases/2026-10-current</link><guid>release-20261002</guid><pubDate>Fri, 10/02/2026 - 09:58</pubDate></item>
      <item><title>Older release</title><link>https://www.airbus.com/en/newsroom/press-releases/2026-09-older</link><guid>release-20260910</guid><pubDate>Thu, 09/10/2026 - 09:58</pubDate></item>
      </channel></rss>`
    const raw = Buffer.from(xml)
    fs.writeFileSync(path.join(root, "feed.xml"), raw)
    const document = {
      fetch_status: "captured",
      original_url: airbus.url,
      source_id: sourceId(airbus.url),
      body_path: "feed.xml",
      body_sha256: sha256(raw),
      observed_at: "2026-10-03T00:00:00Z",
    }
    document.source_version_id = `${document.source_id}:${document.body_sha256}`
    const result = await parseStoredRSSFeed(root, document, airbus)
    assert.equal(result.links[0].published_at, "2026-10-02")
    assert.equal(result.links[0].published_timestamp, null)
    assert.equal(result.links[0].published_date_precision, "day")
    assert.equal(
      assessBoundedRSSFeed(result, airbus, "2026-09-26", "2026-10-04").status,
      "window_covered",
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("Korean localized RSS resolves relative permalinks and KST publication dates", async () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "research-rss-ko-localized-"))
  const korean = {
    ...channel,
    url: "https://example.com/kr/news/feed.xml",
    item_pattern: "^https://example\\.com/articles/[^/?#]+/?$",
    listing_profile: {
      ...channel.listing_profile,
      pub_date_format: "korean-local-ampm-v1",
      date_timezone: "Asia/Seoul",
    },
  }
  try {
    const xml = `<rss version="2.0"><channel><title>Official Feed</title>
      <item><title>  Current Korean release  </title><link> /articles/current/ </link><guid> /articles/current/ </guid><pubDate>2026-10-02 오후 15:10:00</pubDate></item>
      <item><title>Older Korean release</title><link>/articles/older/</link><guid>/articles/older/</guid><pubDate>2026-09-25 오전 08:00:00</pubDate></item>
      </channel></rss>`
    const raw = Buffer.from(xml)
    fs.writeFileSync(path.join(root, "feed.xml"), raw)
    const document = {
      fetch_status: "captured",
      original_url: korean.url,
      final_url: korean.url,
      source_id: sourceId(korean.url),
      body_path: "feed.xml",
      body_sha256: sha256(raw),
      observed_at: "2026-10-03T00:00:00Z",
    }
    document.source_version_id = `${document.source_id}:${document.body_sha256}`
    const result = await parseStoredRSSFeed(root, document, korean)
    assert.equal(result.links[0].url, "https://example.com/articles/current/")
    assert.equal(result.links[0].guid, result.links[0].url)
    assert.equal(result.links[0].text, "Current Korean release")
    assert.equal(result.links[0].published_at, "2026-10-02")
    assert.equal(result.links[0].published_timestamp, "2026-10-02T06:10:00.000Z")
    assert.equal(
      assessBoundedRSSFeed(result, korean, "2026-09-26", "2026-10-03").status,
      "window_covered",
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("RSS with short GUIDs preserves its stated UTC date across the boundary", async () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "research-rss-short-guid-"))
  const samsung = {
    ...channel,
    listing_profile: {
      ...channel.listing_profile,
      feed_title: "Press Releases – Samsung Global Newsroom",
      guid_is_permalink: false,
    },
  }
  try {
    const xml = `<rss version="2.0"><channel><title>Press Releases – Samsung Global Newsroom</title>
      <item><title>Current release</title><link>https://example.com/articles/current/</link><guid>https://bit.ly/current</guid><pubDate>Tue, 29 Sep 2026 08:00:00 +0000</pubDate></item>
      <item><title>Midnight release</title><link>https://example.com/articles/midnight/</link><guid>https://bit.ly/midnight</guid><pubDate>Wed, 23 Sep 2026 22:00:00 +0000</pubDate></item>
      <item><title>Older release</title><link>https://example.com/articles/older/</link><guid>https://bit.ly/older</guid><pubDate>Wed, 16 Sep 2026 08:00:00 +0000</pubDate></item>
      </channel></rss>`
    const raw = Buffer.from(xml)
    fs.writeFileSync(path.join(root, "feed.xml"), raw)
    const document = {
      fetch_status: "captured",
      original_url: channel.url,
      source_id: sourceId(channel.url),
      body_path: "feed.xml",
      body_sha256: sha256(raw),
      observed_at: "2026-09-29T12:00:00Z",
    }
    document.source_version_id = `${document.source_id}:${document.body_sha256}`
    const result = await parseStoredRSSFeed(root, document, samsung)
    assert.deepEqual(
      result.links.map((link) => link.published_at),
      ["2026-09-29", "2026-09-23", "2026-09-16"],
    )
    assert.equal(
      assessBoundedRSSFeed(result, samsung, "2026-09-23", "2026-09-30").status,
      "window_covered",
    )
    assert.equal(
      assessBoundedRSSFeed(
        {
          ...result,
          links: [{ ...result.links[0], published_at: "2026-09-28" }, ...result.links.slice(1)],
        },
        samsung,
        "2026-09-23",
        "2026-09-30",
      ).reason,
      "feed_item_identity_or_date_invalid",
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("a bounded RSS route can compare publication days in the publisher timezone", async (t) => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "research-rss-timezone-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const localChannel = {
    ...channel,
    listing_profile: { ...channel.listing_profile, date_timezone: "Asia/Seoul" },
  }
  const xml = `<rss version="2.0"><channel><title>Official Feed</title>
    <item><title>Local morning article</title><link>https://example.com/articles/morning/</link><guid>https://example.com/articles/morning/</guid><pubDate>Tue, 22 Sep 2026 15:00:00 GMT</pubDate></item>
    <item><title>Older article</title><link>https://example.com/articles/older/</link><guid>https://example.com/articles/older/</guid><pubDate>Sun, 20 Sep 2026 09:00:00 GMT</pubDate></item>
  </channel></rss>`
  const raw = Buffer.from(xml)
  fs.writeFileSync(path.join(root, "feed.xml"), raw)
  const document = {
    fetch_status: "captured",
    original_url: channel.url,
    source_id: sourceId(channel.url),
    body_path: "feed.xml",
    body_sha256: sha256(raw),
    observed_at: "2026-09-29T00:00:00Z",
  }
  document.source_version_id = `${document.source_id}:${document.body_sha256}`
  const parsed = await parseStoredRSSFeed(root, document, localChannel)
  assert.equal(parsed.links[0].published_at, "2026-09-23")
  assert.equal(parsed.links[0].published_timestamp, "2026-09-22T15:00:00.000Z")
  assert.equal(
    assessBoundedRSSFeed(parsed, localChannel, "2026-09-23", "2026-09-30").status,
    "window_covered",
  )
  assert.equal(
    assessBoundedRSSFeed(
      { ...parsed, links: [{ ...parsed.links[0], published_at: "2026-09-22" }, parsed.links[1]] },
      localChannel,
      "2026-09-23",
      "2026-09-30",
    ).reason,
    "feed_item_identity_or_date_invalid",
  )
  await assert.rejects(
    () =>
      parseStoredRSSFeed(root, document, {
        ...localChannel,
        listing_profile: { ...localChannel.listing_profile, date_timezone: "Not/AZone" },
      }),
    /time zone/i,
  )
})

test("a bounded RSS route retains dated media items but only inspects article categories", async (t) => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "research-rss-categories-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const mixedChannel = {
    ...channel,
    listing_profile: {
      ...channel.listing_profile,
      guid_is_permalink: false,
      date_timezone: "Asia/Seoul",
      ignored_categories: ["Media"],
      required_categories: ["TECH"],
    },
  }
  const xml = `<rss version="2.0"><channel><title>Official Feed</title>
    <item><title>Morning article</title><link>https://example.com/articles/morning/</link><guid>post-1</guid><pubDate>Tue, 29 Sep 2026 23:59:07 GMT</pubDate><category>TECH</category></item>
    <item><title>Article illustration</title><link>https://example.com/media/illustration/</link><guid>post-2</guid><pubDate>Mon, 28 Sep 2026 00:31:11 GMT</pubDate><category>Media</category></item>
    <item><title>Full article</title><link>https://example.com/articles/full/</link><guid>post-3</guid><pubDate>Mon, 28 Sep 2026 00:21:24 GMT</pubDate><category>TECH</category></item>
    <item><title>Older article</title><link>https://example.com/articles/older/</link><guid>post-4</guid><pubDate>Tue, 22 Sep 2026 02:35:04 GMT</pubDate><category>TECH</category></item>
  </channel></rss>`
  const raw = Buffer.from(xml)
  fs.writeFileSync(path.join(root, "feed.xml"), raw)
  const document = {
    fetch_status: "captured",
    original_url: channel.url,
    source_id: sourceId(channel.url),
    body_path: "feed.xml",
    body_sha256: sha256(raw),
    observed_at: "2026-09-30T00:00:00Z",
  }
  document.source_version_id = `${document.source_id}:${document.body_sha256}`
  const parsed = await parseStoredRSSFeed(root, document, mixedChannel)
  assert.deepEqual(parsed.links[1].categories, ["Media"])
  const prior = assessBoundedRSSFeed(parsed, mixedChannel, "2026-09-23", "2026-09-30")
  assert.equal(prior.status, "window_covered")
  assert.equal(prior.feed_items, 4)
  assert.equal(prior.ignored_in_window, 1)
  assert.deepEqual(
    prior.links.map((link) => link.url),
    ["https://example.com/articles/full/"],
  )
  const today = assessBoundedRSSFeed(parsed, mixedChannel, "2026-09-30", "2026-10-01")
  assert.equal(today.status, "window_covered")
  assert.deepEqual(
    today.links.map((link) => link.url),
    ["https://example.com/articles/morning/"],
  )
  assert.equal(
    assessBoundedRSSFeed(
      {
        ...parsed,
        links: parsed.links.map((link, index) =>
          index === 1 ? { ...link, categories: [] } : link,
        ),
      },
      mixedChannel,
      "2026-09-23",
      "2026-09-30",
    ).reason,
    "feed_item_category_missing",
  )
  assert.equal(
    assessBoundedRSSFeed(
      {
        ...parsed,
        links: parsed.links.map((link, index) =>
          index === 1 ? { ...link, categories: ["TECH"] } : link,
        ),
      },
      mixedChannel,
      "2026-09-23",
      "2026-09-30",
    ).reason,
    "feed_item_identity_or_date_invalid",
  )
  assert.equal(
    assessBoundedRSSFeed(
      {
        ...parsed,
        links: parsed.links.map((link, index) =>
          index === 2 ? { ...link, categories: ["OTHER"] } : link,
        ),
      },
      mixedChannel,
      "2026-09-23",
      "2026-09-30",
    ).reason,
    "feed_item_category_unexpected",
  )
  assert.equal(
    assessBoundedRSSFeed(
      {
        ...parsed,
        links: parsed.links.map((link, index) =>
          index === 2 ? { ...link, categories: ["TECH", "Media"] } : link,
        ),
      },
      mixedChannel,
      "2026-09-23",
      "2026-09-30",
    ).reason,
    "feed_item_category_conflict",
  )
})

test("RSS window coverage needs a valid older boundary and unique dated article identities", () => {
  const complete = assessBoundedRSSFeed(parse, channel, "2026-09-22", "2026-09-29")
  assert.equal(complete.status, "window_covered")
  assert.equal(complete.window_items, 1)
  assert.equal(complete.older_items, 1)
  assert.deepEqual(complete.links, [links[0]])
  assert.equal(
    assessBoundedRSSFeed(parse, channel, "2026-09-01", "2026-09-29").reason,
    "feed_cutoff_not_reached",
  )
  assert.equal(assessBoundedRSSFeed(parse, channel, "2026-09-27", "2026-09-29").window_items, 0)
  const sameDayOutOfOrder = {
    ...parse,
    links: [
      { ...item("2026-09-25", "recent-a"), published_timestamp: "2026-09-25T05:15:00.000Z" },
      { ...item("2026-09-25", "recent-b"), published_timestamp: "2026-09-25T05:00:00.000Z" },
      item("2026-09-08", "older"),
    ],
  }
  assert.equal(
    assessBoundedRSSFeed(sameDayOutOfOrder, channel, "2026-09-22", "2026-09-29").status,
    "window_covered",
  )
  for (const badLinks of [
    [links[0], { ...links[0] }],
    [links[0], { ...item("2026-09-24", "current-invalid-guid"), guid: "not-a-url" }],
    [links[0], { ...links[1], published_at: null }],
    [links[1], links[0]],
  ])
    assert.equal(
      assessBoundedRSSFeed({ ...parse, links: badLinks }, channel, "2026-09-22", "2026-09-29")
        .status,
      "incomplete",
    )
  const crowded = { ...parse, links: [links[0], item("2026-09-24", "second"), links[1]] }
  assert.equal(
    assessBoundedRSSFeed(crowded, { ...channel, scan_max_details: 1 }, "2026-09-22", "2026-09-29")
      .reason,
    "detail_budget_exceeded",
  )
})

test("old archive mirrors do not invalidate a current RSS window", () => {
  const current = item("2026-10-02", "current")
  const legacy = {
    ...item("2024-05-16", "legacy"),
    url: "https://example.com/legacy-without-html",
  }
  const repeatedLegacy = { ...legacy, text: "Archived duplicate mirror" }
  const result = assessBoundedRSSFeed(
    { ...parse, links: [current, legacy, repeatedLegacy] },
    channel,
    "2026-09-26",
    "2026-10-04",
  )

  assert.equal(result.status, "window_covered")
  assert.equal(result.window_items, 1)
  assert.equal(result.older_items, 2)
  assert.deepEqual(result.links, [current])
})

test("official business-day retention bounds a feed without an older item", () => {
  const dartChannel = {
    ...channel,
    listing_profile: {
      ...channel.listing_profile,
      date_timezone: "Asia/Seoul",
      retention_business_days: 5,
    },
  }
  const dartParse = {
    ...parse,
    dates: {
      observed_at: "2026-10-02T21:25:20.505Z",
      feed_updated_at: "2026-10-02T21:25:37.000Z",
    },
    links: [
      item("2026-10-02", "oct-02"),
      item("2026-10-01", "oct-01-a"),
      item("2026-10-01", "oct-01-b"),
    ],
  }
  const covered = assessBoundedRSSFeed(dartParse, dartChannel, "2026-09-26", "2026-10-03")
  assert.equal(covered.status, "window_covered")
  assert.equal(covered.older_items, 0)
  assert.equal(covered.retention_covered, true)
  assert.equal(
    assessBoundedRSSFeed(dartParse, dartChannel, "2026-09-25", "2026-10-03").reason,
    "feed_cutoff_not_reached",
  )
  assert.equal(
    assessBoundedRSSFeed(
      { ...dartParse, dates: { ...dartParse.dates, feed_updated_at: "2026-10-01T10:00:00Z" } },
      dartChannel,
      "2026-09-26",
      "2026-10-03",
    ).reason,
    "feed_cutoff_not_reached",
  )
})

test("an article nested below a topics path remains a discovery candidate", () => {
  const nested = {
    ...channel,
    item_pattern: "^https://example\\.com/blog/topics/security/[^/?#]+/?$",
    sectors: ["사이버보안"],
    region: "해외",
    axis: "기술·제품",
    publisher_id: "example.com",
  }
  const found = candidatesFromLinks(
    [
      {
        ...item("2026-09-25", "article"),
        url: "https://example.com/blog/topics/security/article/",
      },
    ],
    nested,
    "2026-09-29T00:00:00Z",
  )
  assert.equal(found.length, 1)
})

test("RSS scan keeps detail failures incomplete and only accepts a fully checked empty window", async () => {
  const root = "unused"
  const document = {
    fetch_status: "captured",
    source_version_id: "feed-version",
    observed_at: "2026-09-29T00:00:00Z",
  }
  const run = { stage: (_name, _input, operation) => operation() }
  const fetchPolicy = async () => document
  const parseFeed = async () => ({ ...parse, parse_id: "feed-parse" })
  const failed = await scanBoundedRSSRoute(
    root,
    run,
    {},
    channel,
    [],
    { since: "2026-09-22", until: "2026-09-29" },
    {
      fetchPolicy,
      parseFeed,
      collectDetails: async () => ({
        documents: [],
        parses: [],
        candidates: [],
        details: [{ status: "date_conflict" }],
      }),
    },
  )
  assert.equal(failed.summary.status, "incomplete")
  assert.equal(failed.summary.reason, "detail_incomplete")
  assert.deepEqual(failed.candidates, [])
  const empty = await scanBoundedRSSRoute(
    root,
    run,
    {},
    channel,
    [],
    { since: "2026-09-27", until: "2026-09-29" },
    {
      fetchPolicy,
      parseFeed,
      collectDetails: async () => ({ documents: [], parses: [], candidates: [], details: [] }),
    },
  )
  assert.equal(empty.summary.status, "window_scanned")
  assert.equal(empty.summary.assessment.older_items, 2)
  assert.equal(empty.candidates.length, 0)
})

test("RSS detail title conflict cannot become a candidate, while whitespace differences can", async () => {
  const link = {
    ...item("2026-09-25", "recent"),
    listing_source_version_id: "feed:v1",
    listing_parse_id: "feed-parse",
    discovered_at: "2026-09-29T00:00:00Z",
  }
  const document = {
    source_version_id: "article:v1",
    final_url: link.url,
    original_url: link.url,
    fetch_status: "captured",
    observed_at: "2026-09-29T00:00:00Z",
  }
  const articleProfiles = [
    { id: "test-article", url_pattern: "^https://example\\.com/articles/", options: {} },
  ]
  const run = { stage: (_name, _input, operation) => operation() }
  const parse = async (_root, _document, _options) => ({
    status: "extracted",
    quality: { required_fields_present: true },
    title: "A different article",
    dates: { published_at: "2026-09-25" },
    blocks: [{ text: "Article body" }],
    parse_id: "article-parse",
  })
  const options = {
    fetchPolicy: async () => document,
    parse,
  }
  const rejected = await collectWindowDetails(
    "unused",
    run,
    {},
    channel,
    articleProfiles,
    [link],
    options,
  )
  assert.equal(rejected.details[0].status, "title_conflict")
  assert.equal(rejected.candidates.length, 0)

  const accepted = await collectWindowDetails(
    "unused",
    run,
    {},
    {
      ...channel,
      publisher_id: "example.com",
      sectors: ["AI"],
      region: "해외",
      axis: "기술·제품",
      listing_profile: {
        ...channel.listing_profile,
        rss_title_policy: "source_title_authoritative",
      },
    },
    articleProfiles,
    [link],
    {
      ...options,
      parse: async () => ({ ...(await parse()), title: "Verified article with source headline" }),
    },
  )
  assert.equal(accepted.details[0].status, "source_parsed_unreviewed")
  assert.equal(accepted.details[0].title_relation, "rss_variant_source_title_authoritative")
  assert.equal(accepted.candidates[0].title, "Verified article with source headline")
  assert.equal(accepted.candidates[0].discovery[0].result_title, link.text)
  assert.equal(accepted.candidates.length, 1)
})

test("reviewed prefix-label brackets preserve exact headlines and reject other title changes", async () => {
  const listedTitle = "[단독] 금융권 AI 해킹, 1달러·22초만에 가능"
  const detailTitle = "단독 금융권 AI 해킹, 1달러·22초만에 가능"
  const link = {
    ...item("2026-10-05", "exclusive"),
    text: listedTitle,
    listing_source_version_id: "feed:v1",
    listing_parse_id: "feed-parse",
    discovered_at: "2026-10-06T00:00:00Z",
  }
  const run = { stage: (_name, _input, operation) => operation() }
  const document = {
    source_version_id: "article:v1",
    final_url: link.url,
    original_url: link.url,
    fetch_status: "captured",
    observed_at: link.discovered_at,
  }
  const profiles = [
    { id: "test-article", url_pattern: "^https://example\\.com/articles/", options: {} },
  ]
  const collect = (title, labels) =>
    collectWindowDetails(
      "unused",
      run,
      {},
      {
        ...channel,
        publisher_id: "example.com",
        sectors: ["보안"],
        region: "국내",
        axis: "기술·제품",
        listing_profile: {
          ...channel.listing_profile,
          ...(labels === undefined ? {} : { title_prefix_labels: labels }),
        },
      },
      profiles,
      [link],
      {
        fetchPolicy: async () => document,
        parse: async () => ({
          status: "extracted",
          quality: { required_fields_present: true },
          title,
          dates: { published_at: "2026-10-05" },
          blocks: [{ text: "Actual full article" }],
          parse_id: "article-parse",
        }),
      },
    )
  const accepted = await collect(detailTitle, ["단독"])
  assert.equal(accepted.details[0].status, "source_parsed_unreviewed")
  assert.equal(accepted.details[0].title_relation, "reviewed_prefix_label_brackets")
  assert.equal(accepted.details[0].listed_title, listedTitle)
  assert.equal(accepted.candidates[0].title, detailTitle)
  assert.equal(accepted.candidates[0].discovery[0].result_title, listedTitle)
  for (const [title, labels] of [
    [detailTitle, undefined],
    [detailTitle.replace("22초", "23초"), ["단독"]],
    [detailTitle.replace("단독 ", ""), ["단독"]],
    [detailTitle.replace("단독", "분석"), ["단독"]],
  ]) {
    const rejected = await collect(title, labels)
    assert.equal(rejected.details[0].status, "title_conflict")
    assert.equal(rejected.candidates.length, 0)
  }
  await assert.rejects(collect(detailTitle, ["단독", "단독"]), /Invalid title prefix labels/)
})
