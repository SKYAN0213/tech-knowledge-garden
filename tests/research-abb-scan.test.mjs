import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { abbPageURL, parseABBPage, scanPaginatedABBRoute } from "../scripts/research/abb-scan.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"

const channel = {
  channel_id: "route-abb-robotics-en",
  publisher_id: "abb-robotics",
  url: "https://www.abb.com/global/en/areas/robotics/news-and-media/news-archive",
  method: "html-list",
  language: "en",
  region: "해외",
  axis: "기술·제품",
  sectors: ["로봇·제조"],
  allowed_hosts: ["www.abb.com"],
  item_pattern: "^https://www\\.abb\\.com/global/en/news/[0-9]+/[a-z0-9-]+/?$",
  api_profile: {
    id: "abb-newsbank-json-pages-v1",
    endpoint: "https://www.abb.com/conf/abbcommon/services/newsbank.json",
    feed_id: "cbcceb45d7e74cfe9a4601cee01344df",
    culture_info: "en",
    page_size: 2,
    max_pages: 3,
    max_details: 3,
  },
}
const item = (id, day) => ({
  id,
  title: "ABB Robotics announcement " + id,
  newsUrlTitleSlug: "abb-robotics-announcement-" + id,
  scheduledPublishDate: day + "T05:56:33.5300000Z",
  languageCode: "en",
  cultureCode: "en-US",
  internal: false,
})
const page = (number, count, items) => ({
  news: {
    page: number,
    size: channel.api_profile.page_size,
    count,
    hasPrevious: number > 1,
    hasNext: number * channel.api_profile.page_size < count,
    items,
  },
})

test("ABB request uses a configured NewsBank feed and bounded page cursor", () => {
  const url = new URL(abbPageURL(channel, 2))
  assert.equal(url.pathname, "/conf/abbcommon/services/newsbank.json")
  assert.deepEqual(
    [...url.searchParams],
    [
      ["requestType", "getNewsList"],
      ["feedId", channel.api_profile.feed_id],
      ["pageNumber", "2"],
      ["cultureInfo", "en"],
      ["pageSize", "2"],
    ],
  )
  assert.throws(
    () => abbPageURL({ ...channel, api_profile: { ...channel.api_profile, feed_id: "group" } }, 1),
    /Invalid ABB/,
  )
  assert.throws(
    () => abbPageURL({ ...channel, url: "https://www.abb.com/global/en/company/media" }, 1),
    /Unexpected ABB/,
  )

  const investor = {
    ...channel,
    channel_id: "route-abb-investor-releases-en",
    url: "https://www.abb.com/global/en/company/media/selected",
    api_profile: {
      ...channel.api_profile,
      archive_path: "/global/en/company/media/selected",
      feed_id: "8de2033e3c8e49ef84794a00bf45af69",
      endpoint: "https://www.abb.com/conf/abbcommon/services/newsbank.json",
    },
  }
  const investorRequest = new URL(abbPageURL(investor, 1))
  assert.equal(investorRequest.pathname, "/conf/abbcommon/services/newsbank.json")
  assert.equal(investorRequest.searchParams.get("feedId"), investor.api_profile.feed_id)
  assert.throws(
    () =>
      abbPageURL({
        ...investor,
        api_profile: { ...investor.api_profile, archive_path: "/wrong" },
      }, 1),
    /Unexpected ABB/,
  )
})

test("ABB page requires a complete cursor, public English identity and source timestamp", () => {
  const rows = [item(138831, "2026-09-21"), item(138370, "2026-09-02")]
  const parsed = parseABBPage(page(1, 2, rows), channel, 1)
  assert.equal(parsed.total, 2)
  assert.deepEqual(
    parsed.items.map((value) => value.published_at),
    ["2026-09-21", "2026-09-02"],
  )
  assert.equal(parsed.items[0].json_pointer, "/news/items/0")
  assert.equal(
    parsed.items[0].url,
    "https://www.abb.com/global/en/news/138831/abb-robotics-announcement-138831",
  )
  assert.throws(() => parseABBPage(page(1, 1, rows), channel, 1), /count or cursor/)
  assert.throws(
    () => parseABBPage({ news: { ...page(1, 2, rows).news, hasNext: true } }, channel, 1),
    /count or cursor/,
  )
  assert.throws(
    () => parseABBPage(page(1, 2, [{ ...rows[0], internal: true }, rows[1]]), channel, 1),
    /public English identity/,
  )
  assert.throws(
    () =>
      parseABBPage(
        page(1, 2, [{ ...rows[0], scheduledPublishDate: "2026-09-32T05:56:33.5300000Z" }, rows[1]]),
        channel,
        1,
      ),
    /public English identity/,
  )
})

test("ABB scan reaches the older boundary, reads selected details and resumes without refetch", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "abb-scan-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, "pages"))
  const rows = [
    [item(138831, "2026-09-21"), item(138370, "2026-09-02")],
    [item(137531, "2026-07-20"), item(137409, "2026-07-17")],
  ]
  const stages = new Map(),
    calls = []
  const run = {
    async stage(name, _input, action) {
      if (!stages.has(name)) stages.set(name, await action())
      return stages.get(name)
    },
  }
  const fetchPolicy = async (_root, _fetcher, url) => {
    calls.push(url)
    if (!url.includes("newsbank.json"))
      return {
        original_url: url,
        final_url: url,
        source_version_id: "detail:" + url,
        fetch_status: "captured",
        observed_at: "2026-09-28T00:00:00Z",
      }
    const number = Number(new URL(url).searchParams.get("pageNumber"))
    const body = JSON.stringify(page(number, 4, rows[number - 1]))
    const body_path = "pages/" + number + ".json"
    fs.writeFileSync(path.join(root, body_path), body)
    return {
      original_url: url,
      final_url: url,
      source_version_id: "page:" + number,
      fetch_status: "captured",
      observed_at: "2026-09-28T00:00:00Z",
      mime_type: "application/json",
      body_sha256: sha256(body),
      body_path,
    }
  }
  const parse = async (_root, document) => ({
    parse_id: document.original_url,
    status: "extracted",
    title: "ABB Robotics official release",
    quality: { required_fields_present: true },
    blocks: [{ text: "ABB Robotics official detail body" }],
    dates: {
      published_at: document.original_url.includes("138831") ? "2026-09-21" : "2026-09-02",
    },
  })
  const profiles = [
    {
      id: "abb-global-en-news-detail",
      url_pattern: channel.item_pattern,
      options: { language: "en" },
    },
  ]
  const window = { since: "2026-09-01", until: "2026-09-28" }
  const first = await scanPaginatedABBRoute(root, run, {}, channel, profiles, window, {
    fetchPolicy,
    parse,
  })
  assert.equal(first.summary.status, "window_scanned", JSON.stringify(first.summary))
  assert.equal(first.summary.pages.length, 2)
  assert.equal(first.summary.reached_older_item, true)
  assert.equal(first.summary.window_items, 2)
  assert.equal(first.candidates.length, 2)
  assert.equal(first.candidates[0].discovery[0].json_pointer, "/news/items/0")
  assert.equal(calls.length, 4)
  const second = await scanPaginatedABBRoute(root, run, {}, channel, profiles, window, {
    fetchPolicy,
    parse,
  })
  assert.equal(second.summary.status, "window_scanned")
  assert.equal(calls.length, 4)

  const changed = await scanPaginatedABBRoute(
    root,
    { stage: async (_name, _input, action) => action() },
    {},
    channel,
    profiles,
    window,
    {
      fetchPolicy: async (...args) => {
        const document = await fetchPolicy(...args)
        if (args[2].includes("pageNumber=2")) {
          const body = JSON.stringify(page(2, 5, rows[1]))
          fs.writeFileSync(path.join(root, document.body_path), body)
          return { ...document, body_sha256: sha256(body) }
        }
        return document
      },
      parse,
    },
  )
  assert.equal(changed.summary.status, "incomplete")
  assert.equal(changed.summary.reason, "listing_changed_during_scan")
  assert.equal(changed.candidates.length, 0)
})
