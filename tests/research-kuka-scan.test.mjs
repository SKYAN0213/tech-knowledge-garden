import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  kukaPageRequest,
  kukaPublicationDay,
  parseKUKAPage,
  scanPaginatedKUKARoute,
} from "../scripts/research/kuka-scan.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"

const channel = {
  channel_id: "route-kuka-news-de",
  publisher_id: "kuka",
  url: "https://www.kuka.com/de-de/unternehmen/presse/news",
  method: "html-list",
  language: "de",
  region: "해외",
  axis: "기술·제품",
  sectors: ["로봇·제조"],
  allowed_hosts: ["www.kuka.com"],
  item_pattern:
    "^https://www\\.kuka\\.com/de-de/unternehmen/presse/news/20\\d\\d/[0-9]{2}/[^/?#]+/?$",
  api_profile: {
    id: "kuka-news-form-pages-v1",
    endpoint: "https://www.kuka.com/api/news/GetPublications",
    sc_lang: "de-DE",
    context_id: "8EB48479F62C4292AC0D890B766155AD",
    captions_facet_id: "891D284932A749069DF2E148B255CA6D",
    page_size: 2,
    max_pages: 3,
    max_details: 3,
  },
}
const item = (slug, date) => ({
  headline: `KUKA announcement: ${slug}`,
  date,
  href: `https://www.kuka.com/de-de/unternehmen/presse/news/2026/${slug}`,
})
const englishChannel = {
  ...channel,
  channel_id: "route-kuka-news-en",
  url: "https://www.kuka.com/en-us/company/press/news",
  language: "en",
  item_pattern:
    "^https://www\\.kuka\\.com/en-[a-z]{2}/company/press/news/20\\d\\d/[0-9]{2}/[^/?#]+/?$",
  api_profile: {
    ...channel.api_profile,
    sc_lang: "en-US",
  },
}
const englishItem = (slug, date) => ({
  itemId: "721a32dc-e7ee-4438-a8e2-f6d15e09880a",
  headline: `KUKA announcement: ${slug}`,
  date,
  dateISO: "2026-09-10T09:52:00.0000000+02:00",
  href: `https://www.kuka.com/en-us/company/press/news/2026/${slug}`,
})

test("KUKA form request binds locale and page cursor to its archived URL", () => {
  const request = kukaPageRequest(channel, 2),
    url = new URL(request.url),
    form = new URLSearchParams(request.form)
  assert.equal(url.pathname, "/api/news/GetPublications")
  assert.equal(url.searchParams.get("sc_lang"), "de-DE")
  assert.equal(form.get("offset"), "2")
  assert.equal(form.get("count"), "2")
  assert.equal(form.get("contextid"), channel.api_profile.context_id)
  assert.equal(kukaPublicationDay("5. März 2026"), "2026-03-05")
  assert.equal(kukaPublicationDay("31. Februar 2026"), null)
  assert.equal(kukaPublicationDay("10 September 2026", "en-US"), "2026-09-10")
  assert.equal(kukaPublicationDay("31 February 2026", "en-US"), null)
  const englishRequest = kukaPageRequest(englishChannel, 0)
  assert.equal(new URL(englishRequest.url).searchParams.get("sc_lang"), "en-US")
  const englishRows = [englishItem("09/kuka-mobile-forklift-launch", "September 10, 2026")]
  const parsedEnglish = parseKUKAPage({ count: 1, items: englishRows, facets: [] }, englishChannel, 0)
  assert.equal(parsedEnglish.items[0].published_at, "2026-09-10")
  assert.equal(parsedEnglish.items[0].source_item_id, englishRows[0].itemId)
  assert.throws(
    () =>
      parseKUKAPage(
        { count: 2, items: [englishRows[0], { ...englishRows[0], href: englishRows[0].href + "-duplicate" }], facets: [] },
        englishChannel,
        0,
      ),
    /locale-matched URL/,
  )
  const mismatch = englishItem("09/kuka-mobile-forklift-launch", "September 11, 2026")
  assert.throws(
    () => parseKUKAPage({ count: 1, items: [mismatch], facets: [] }, englishChannel, 0),
    /publication date/,
  )
  assert.throws(
    () =>
      parseKUKAPage(
        { count: 1, items: [item("09/forklift", "10 September 2026")], facets: [] },
        englishChannel,
        0,
      ),
    /locale-matched URL/,
  )
  assert.throws(
    () =>
      kukaPageRequest({ ...channel, api_profile: { ...channel.api_profile, sc_lang: "ko-KR" } }, 0),
    /Invalid KUKA/,
  )
})

test("KUKA page rejects localized mismatches and missing rows", () => {
  const rows = [
    item("09/research-platform", "24. September 2026"),
    item("09/forklift", "10. September 2026"),
  ]
  const result = parseKUKAPage({ count: 2, items: rows, facets: [] }, channel, 0)
  assert.deepEqual(
    result.items.map((value) => value.published_at),
    ["2026-09-24", "2026-09-10"],
  )
  assert.equal(result.items[0].json_pointer, "/items/0")
  assert.throws(
    () => parseKUKAPage({ count: 3, items: [rows[0]], facets: [] }, channel, 0),
    /count or items/,
  )
  assert.throws(
    () =>
      parseKUKAPage(
        {
          count: 1,
          items: [{ ...rows[0], href: rows[0].href.replace("de-de", "ko-kr") }],
          facets: [],
        },
        channel,
        0,
      ),
    /locale-matched URL/,
  )
  assert.throws(
    () =>
      parseKUKAPage(
        { count: 1, items: [{ ...rows[0], date: "2026-09-24" }], facets: [] },
        channel,
        0,
      ),
    /publication date/,
  )
})

test("KUKA scan reaches an older page, reads every selected original and resumes without refetch", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kuka-scan-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, "pages"))
  const pages = [
    [item("09/research-platform", "24. September 2026"), item("09/forklift", "10. September 2026")],
    [item("08/exhibition", "11. August 2026"), item("07/robot-cell", "1. Juli 2026")],
  ]
  const stages = new Map(),
    calls = []
  const run = {
    async stage(name, _input, action) {
      if (!stages.has(name)) stages.set(name, await action())
      return stages.get(name)
    },
  }
  const fetchPolicy = async (_root, _fetcher, url, options) => {
    calls.push({ url, options })
    if (!url.includes("/api/news/"))
      return {
        original_url: url,
        final_url: url,
        source_version_id: `detail:${url}`,
        fetch_status: "captured",
        observed_at: "2026-09-28T00:00:00Z",
      }
    assert.equal(options.method, "POST")
    const offset = Number(new URLSearchParams(options.form).get("offset"))
    const body = JSON.stringify({ count: 4, items: pages[offset / 2], facets: [] })
    const body_path = `pages/${offset}.json`
    fs.writeFileSync(path.join(root, body_path), body)
    return {
      original_url: url,
      final_url: url,
      source_version_id: `page:${offset}`,
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
    title: "KUKA official release",
    quality: { required_fields_present: true },
    blocks: [{ text: "KUKA official detail body" }],
    dates: {
      published_at: document.original_url.includes("research-platform")
        ? "2026-09-24"
        : "2026-09-10",
    },
  })
  const profiles = [
    { id: "kuka-de-news-detail", url_pattern: channel.item_pattern, options: { language: "de" } },
  ]
  const window = { since: "2026-09-01", until: "2026-09-28" }
  const first = await scanPaginatedKUKARoute(root, run, {}, channel, profiles, window, {
    fetchPolicy,
    parse,
  })
  assert.equal(first.summary.status, "window_scanned", JSON.stringify(first.summary))
  assert.equal(first.summary.pages.length, 2)
  assert.equal(first.summary.reached_older_item, true)
  assert.equal(first.summary.window_items, 2)
  assert.equal(first.candidates.length, 2)
  assert.equal(first.candidates[0].discovery[0].method, "form-json-page")
  assert.equal(first.candidates[0].discovery[0].json_pointer, "/items/0")
  assert.equal(calls.length, 4)
  const second = await scanPaginatedKUKARoute(root, run, {}, channel, profiles, window, {
    fetchPolicy,
    parse,
  })
  assert.equal(second.summary.status, "window_scanned")
  assert.equal(calls.length, 4)

  const changedTotalFetch = async (...args) => {
    const document = await fetchPolicy(...args)
    if (args[2].includes("offset=2")) {
      const body = JSON.stringify({ count: 5, items: pages[1], facets: [] })
      fs.writeFileSync(path.join(root, document.body_path), body)
      return { ...document, body_sha256: sha256(body) }
    }
    return document
  }
  const freshRun = { stage: async (_name, _input, action) => action() }
  const changed = await scanPaginatedKUKARoute(root, freshRun, {}, channel, profiles, window, {
    fetchPolicy: changedTotalFetch,
    parse,
  })
  assert.equal(changed.summary.status, "incomplete")
  assert.equal(changed.summary.reason, "listing_changed_during_scan")
  assert.equal(changed.candidates.length, 0)
})
