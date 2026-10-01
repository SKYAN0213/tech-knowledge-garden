import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { hdPageURL, parseHDPage, scanPaginatedHDRoute } from "../scripts/research/api-scan.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"

const channel = {
  channel_id: "route-hd-news-ko",
  publisher_id: "hd-robotics",
  url: "https://www.hd-hyundairobotics.com/company/news?type=90010001",
  method: "html-list",
  language: "ko",
  region: "국내",
  axis: "기술·제품",
  sectors: ["로봇·제조"],
  allowed_hosts: ["www.hd-hyundairobotics.com"],
  item_pattern: "^https://www\\.hd-hyundairobotics\\.com/company/news/[0-9]+$",
  api_profile: {
    id: "hd-press-json-pages-v1",
    endpoint: "https://www.hd-hyundairobotics.com/api/v1/company/page",
    page_size: 2,
    max_pages: 5,
    max_details: 5,
    query: { compIntrSubTypeCd: "90010001", bdSeq: "51" },
  },
}
const disclosureChannel = {
  ...channel,
  channel_id: "route-hd-disclosure-ko",
  url: "https://www.hd-hyundairobotics.com/company/disclosure",
  axis: "기업·운영",
  api_profile: {
    id: "hd-disclosure-json-pages-v1",
    endpoint: "https://www.hd-hyundairobotics.com/api/v1/company/page",
    page_size: 8,
    max_pages: 30,
    max_details: 25,
    detail_path: "/company/disclosure/",
    query: { bdSeq: "54" },
  },
}
const item = (id, day) => ({
  bdcSeq: id,
  compIntrSubTypeCd: "90010001",
  compIntrLink: null,
  bdContent: { bdcTitle: `Official robot announcement ${id}`, bdcRegDtShort: day },
})
const pageData = (number, content, total = 3, totalPages = 2) => ({
  resCd: 1,
  data: {
    number,
    size: 2,
    numberOfElements: content.length,
    totalElements: total,
    totalPages,
    first: number === 0,
    last: number === totalPages - 1,
    empty: content.length === 0,
    content,
  },
})

test("HD JSON page contract keeps exact route filters and rejects changed counts", () => {
  const url = new URL(hdPageURL(channel, 1))
  assert.equal(url.pathname, "/api/v1/company/page")
  assert.equal(url.searchParams.get("page"), "1")
  assert.equal(url.searchParams.get("compIntrSubTypeCd"), "90010001")
  const parsed = parseHDPage(
    pageData(0, [item(7499, "2026-09-14"), item(7430, "2026-08-25")]),
    channel,
    0,
  )
  assert.deepEqual(
    parsed.items.map((entry) => entry.published_at),
    ["2026-09-14", "2026-08-25"],
  )
  assert.equal(parsed.items[0].json_pointer, "/data/content/0")
  const mismatched = pageData(0, [item(7499, "2026-09-14")])
  mismatched.data.numberOfElements = 2
  assert.throws(() => parseHDPage(mismatched, channel, 0), /incomplete|inconsistent/)
  assert.throws(
    () => parseHDPage(pageData(0, [item(7499, "2026-09-31")]), channel, 0),
    /lacks title, date/,
  )
})

test("HD disclosure profile uses the official board and preserves empty and item identities", () => {
  const url = new URL(hdPageURL(disclosureChannel, 0))
  assert.equal(url.searchParams.get("bdSeq"), "54")
  assert.equal(url.searchParams.has("compIntrSubTypeCd"), false)
  assert.equal(
    parseHDPage(
      {
        resCd: 1,
        data: {
          number: 0,
          size: 8,
          numberOfElements: 0,
          totalElements: 0,
          totalPages: 0,
          first: true,
          last: true,
          empty: true,
          content: [],
        },
      },
      disclosureChannel,
      0,
    ).items.length,
    0,
  )
  const disclosure = parseHDPage(
    {
      resCd: 1,
      data: {
        number: 0,
        size: 8,
        numberOfElements: 1,
        totalElements: 1,
        totalPages: 1,
        first: true,
        last: true,
        empty: false,
        content: [
          {
            bdcSeq: 8501,
            compIntrLink: null,
            bdContent: { bdcTitle: "Official filing", bdcRegDtShort: "2026-09-30" },
          },
        ],
      },
    },
    disclosureChannel,
    0,
  )
  assert.equal(
    disclosure.items[0].url,
    "https://www.hd-hyundairobotics.com/company/disclosure/8501",
  )
  assert.throws(
    () =>
      hdPageURL(
        {
          ...disclosureChannel,
          api_profile: { ...disclosureChannel.api_profile, query: { bdSeq: "51" } },
        },
        0,
      ),
    /disclosure filter changed/,
  )
})

test("all API pages and selected originals must agree before a window is scanned", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "hd-api-scan-")))
  try {
    fs.mkdirSync(path.join(root, "pages"))
    const sourcePages = [
      pageData(0, [item(7499, "2026-09-14"), item(7430, "2026-08-25")]),
      pageData(1, [item(7231, "2026-07-01")]),
    ]
    const cache = new Map(),
      calls = []
    const run = {
      async stage(name, _input, action) {
        if (!cache.has(name)) cache.set(name, await action())
        return cache.get(name)
      },
    }
    const fetchPolicy = async (_root, _fetcher, url) => {
      calls.push(url)
      const match = /[?&]page=(\d+)/.exec(url)
      if (!match)
        return {
          original_url: url,
          final_url: url,
          source_version_id: "detail:v1",
          fetch_status: "captured",
          observed_at: "2026-09-28T00:00:00Z",
        }
      const n = Number(match[1])
      const body = JSON.stringify(sourcePages[n])
      const body_path = `pages/${n}.json`
      fs.writeFileSync(path.join(root, body_path), body)
      return {
        original_url: url,
        final_url: url,
        source_version_id: `page-${n}:v1`,
        fetch_status: "captured",
        observed_at: "2026-09-28T00:00:00Z",
        body_path,
        body_sha256: sha256(body),
        mime_type: "application/json",
      }
    }
    const parse = async () => ({
      parse_id: "detail-parse",
      status: "extracted",
      title: "HD Robotics official release",
      quality: { required_fields_present: true },
      blocks: [{ text: "HD Robotics source body" }],
      dates: { published_at: "2026-09-14" },
    })
    const profiles = [
      {
        id: "hd-detail",
        url_pattern: "^https://www\\.hd-hyundairobotics\\.com/company/news/[0-9]+$",
        options: { language: "ko" },
      },
    ]
    const options = { since: "2026-09-01", until: "2026-09-28" }
    const first = await scanPaginatedHDRoute(root, run, {}, channel, profiles, options, {
      fetchPolicy,
      parse,
    })
    assert.equal(first.summary.status, "window_scanned", JSON.stringify(first.summary))
    assert.equal(first.summary.scanned_items, 3)
    assert.equal(first.summary.pages.length, 2)
    assert.equal(first.candidates.length, 1)
    assert.equal(first.candidates[0].source_published_at, "2026-09-14")
    assert.equal(first.candidates[0].discovery[0].method, "json-page")
    assert.equal(first.candidates[0].discovery[0].json_pointer, "/data/content/0")
    const second = await scanPaginatedHDRoute(root, run, {}, channel, profiles, options, {
      fetchPolicy,
      parse,
    })
    assert.equal(second.summary.status, "window_scanned")
    assert.equal(calls.length, 3)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("a confirmed empty HD board is a complete scan after one page", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "hd-empty-board-")))
  try {
    fs.mkdirSync(path.join(root, "pages"))
    const calls = []
    const run = {
      async stage(name, _input, action) {
        return action()
      },
    }
    const result = await scanPaginatedHDRoute(
      root,
      run,
      {},
      disclosureChannel,
      [],
      { since: "2026-09-24", until: "2026-10-02" },
      {
        fetchPolicy: async (_root, _fetcher, url) => {
          calls.push(url)
          const body = JSON.stringify({
            resCd: 1,
            data: {
              number: 0,
              size: 8,
              numberOfElements: 0,
              totalElements: 0,
              totalPages: 0,
              first: true,
              last: true,
              empty: true,
              content: [],
            },
          })
          const body_path = "pages/0.json"
          fs.writeFileSync(path.join(root, body_path), body)
          return {
            original_url: url,
            final_url: url,
            source_version_id: "empty-page:v1",
            fetch_status: "captured",
            mime_type: "application/json",
            body_path,
            body_sha256: sha256(body),
            observed_at: "2026-10-01T00:00:00Z",
          }
        },
      },
    )
    assert.equal(result.summary.status, "window_scanned")
    assert.equal(result.summary.total_elements, 0)
    assert.equal(result.summary.scanned_items, 0)
    assert.equal(calls.length, 1)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
