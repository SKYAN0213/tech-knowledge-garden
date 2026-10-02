import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { parseDocument } from "../scripts/research/parser.mjs"
import { parseURPage, scanPaginatedURRoute, urPageURL } from "../scripts/research/ur-scan.mjs"

const channel = {
  channel_id: "route-ur-news-en",
  url: "https://www.universal-robots.com/news-and-media/news-center/",
  method: "html-list",
  language: "en",
  allowed_hosts: ["www.universal-robots.com"],
  item_pattern:
    "^https://www\\.universal-robots\\.com/news-and-media/news-center/[a-z0-9][a-z0-9-]+/?$",
  api_profile: {
    id: "ur-news-center-json-pages-v1",
    page_parameter: "page",
    json_parameter: "asjson",
    json_value: "1",
    page_size: 12,
    max_pages: 20,
    max_details: 25,
  },
}
const urProfiles = JSON.parse(
  fs.readFileSync("data/research-acquisition.json", "utf8"),
).article_profiles

function payload(items, { page = 1, total = items.length, pageSize = 12 } = {}) {
  return {
    getPageData: {
      content: {
        body: {
          rootComponent: {
            body: [
              { componentName: "text-header" },
              {
                componentName: "card-overview",
                result: {
                  paging: {
                    allowedSizes: [12, 36],
                    currentPage: page,
                    numberOfPages: Math.ceil(total / pageSize),
                    pageSize,
                    totalItems: total,
                  },
                  items: items.map(({ id, title, date, href }) => ({
                    id,
                    title,
                    date,
                    publishedAt: date,
                    link: { href },
                  })),
                },
              },
            ],
          },
        },
      },
    },
  }
}

const item = (id, title, date, slug) => ({
  id,
  title,
  date,
  href: `/news-and-media/news-center/${slug}/`,
})

test("Universal Robots paging URL and JSON item profile match the official page service contract", () => {
  assert.equal(
    urPageURL(channel, 1),
    "https://www.universal-robots.com/news-and-media/news-center/?asjson=1",
  )
  assert.equal(
    urPageURL(channel, 2),
    "https://www.universal-robots.com/news-and-media/news-center/?page=2&asjson=1",
  )
  const parsed = parseURPage(
    payload(
      Array.from({ length: 12 }, (_, index) =>
        item(
          `id-${index}`,
          index === 0 ? "UR Gen 7" : `Older article ${index}`,
          index === 0 ? "2026-09-14" : "2025-01-01",
          index === 0 ? "universal-robots-unveils-gen-7" : `older-article-${index}`,
        ),
      ),
      { total: 194 },
    ),
    channel,
    1,
  )
  assert.equal(parsed.total, 194)
  assert.equal(parsed.page_count, 17)
  assert.equal(parsed.items[0].published_at, "2026-09-14")
  assert.match(parsed.items[0].url, /universal-robots-unveils-gen-7/)
  assert.throws(
    () =>
      parseURPage(
        payload([item("abc", "UR Gen 7", "Sept 14", "universal-robots-unveils-gen-7")]),
        channel,
        1,
      ),
    /identity, title, date or article URL/,
  )
})

test("Universal Robots news center profile parses general article dates and body exactly once", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "research-ur-article-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const previous = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previous || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (previous === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previous
  })
  const profile = urProfiles.find((item) => item.id === "universal-robots-news-center-article")
  const url = "https://www.universal-robots.com/news-and-media/news-center/example-settlement/"
  assert.ok(profile)
  assert.match(url, new RegExp(profile.url_pattern))
  assert.doesNotMatch(
    "https://www.universal-robots.com/news-and-media/news-center/",
    new RegExp(profile.url_pattern),
  )
  const gen7 =
    "https://www.universal-robots.com/news-and-media/news-center/universal-robots-unveils-gen-7-new-platform-industrial-automation-physical-ai/"
  assert.equal(urProfiles.filter((item) => new RegExp(item.url_pattern).test(gen7)).length, 1)
  const html = `<html><head><title>Example settlement</title></head><body>
    <sirius-heading><h1>Example settlement</h1></sirius-heading>
    <sirius-section class="article-info-bar"><time class="sir-date">October 1, 2026</time></sirius-section>
    <sirius-section class="text sir-default"><sirius-text-html>
      <p>Teradyne Robotics resolved the dispute through a mutual agreement.</p>
      <p>The agreement was announced on October 1, 2026.</p>
    </sirius-text-html></sirius-section>
    </body></html>`
  const bytes = Buffer.from(html),
    digest = sha256(bytes),
    id = sourceId(url),
    relative = `documents/${id}/${digest}/body.bin`
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true })
  fs.writeFileSync(path.join(root, relative), bytes)
  const parsed = await parseDocument(
    root,
    {
      original_url: url,
      final_url: url,
      source_id: id,
      source_version_id: `${id}:${digest}`,
      fetch_status: "captured",
      mime_type: "text/html",
      observed_at: "2026-10-01T00:00:00.000Z",
      body_path: relative,
      body_sha256: digest,
    },
    profile.options,
  )
  assert.equal(parsed.status, "extracted")
  assert.equal(parsed.title, "Example settlement")
  assert.equal(parsed.dates.published_at, "2026-10-01")
  assert.deepEqual(
    parsed.blocks.map((block) => block.text),
    [
      "Teradyne Robotics resolved the dispute through a mutual agreement.",
      "The agreement was announced on October 1, 2026.",
    ],
  )
})

test("Universal Robots current feature article layout uses the shared article profile", async (t) => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "research-ur-current-article-")),
  )
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const previous = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previous || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (previous === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previous
  })
  const profile = urProfiles.find((item) => item.id === "universal-robots-news-center-article")
  const url =
    "https://www.universal-robots.com/news-and-media/news-center/teradyne-robotics-appoints-jacob-pascual-pape-chief-commercial-officer/"
  const html = `<html><head><title>Teradyne Robotics appoints a CCO</title></head><body>
    <sirius-heading><h1>Teradyne Robotics appoints a CCO</h1></sirius-heading>
    <sirius-section class="article-info-bar"><time class="sir-date">September 15, 2026</time></sirius-section>
    <sirius-section class="feature sir-default"><article class="feature"><div class="feature-body">
      <p>Teradyne Robotics appoints a commercial leader for Universal Robots and MiR.</p>
      <p>The role covers the company’s global commercial organization across both units.</p>
    </div></article></sirius-section>
    </body></html>`
  const bytes = Buffer.from(html)
  const digest = sha256(bytes)
  const id = sourceId(url)
  const relative = `documents/${id}/${digest}/body.bin`
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true })
  fs.writeFileSync(path.join(root, relative), bytes)
  const parsed = await parseDocument(
    root,
    {
      original_url: url,
      final_url: url,
      source_id: id,
      source_version_id: `${id}:${digest}`,
      fetch_status: "captured",
      mime_type: "text/html",
      observed_at: "2026-10-02T00:00:00.000Z",
      body_path: relative,
      body_sha256: digest,
    },
    profile.options,
  )
  assert.equal(parsed.status, "extracted")
  assert.equal(parsed.dates.published_at, "2026-09-15")
  assert.deepEqual(
    parsed.blocks.map((block) => block.text),
    [
      "Teradyne Robotics appoints a commercial leader for Universal Robots and MiR.",
      "The role covers the company’s global commercial organization across both units.",
    ],
  )
})

test("paginated scan stops at an older date boundary and collects only the requested detail", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "research-ur-scan-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const body = JSON.stringify(
      payload(
        [
          item("1", "Newer announcement", "2026-09-15", "teradyne-robotics-news"),
          item(
            "2",
            "Universal Robots unveils Gen 7",
            "2026-09-14",
            "universal-robots-unveils-gen-7",
          ),
          item("3", "Older announcement", "2026-09-13", "older-announcement"),
        ],
        { total: 3 },
      ),
    ),
    relative = "documents/page-1/body.bin",
    destination = path.join(root, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, body)
  const sourceVersionId = "source:" + sha256(body)
  const document = {
    fetch_status: "captured",
    mime_type: "application/json; charset=utf-8",
    body_path: relative,
    body_sha256: sha256(body),
    source_version_id: sourceVersionId,
    observed_at: "2026-10-01T00:00:00.000Z",
  }
  const inputs = []
  const run = {
    async stage(name, input, action) {
      inputs.push({ name, input })
      return action()
    },
  }
  const result = await scanPaginatedURRoute(
    root,
    run,
    {},
    channel,
    [],
    { since: "2026-09-14", until: "2026-09-15" },
    {
      fetchPolicy: async (_root, _fetcher, url) => {
        assert.equal(url, urPageURL(channel, 1))
        return document
      },
      collectDetails: async (_root, _run, _fetcher, _channel, _profiles, links) => ({
        documents: [],
        parses: [],
        candidates: links.map((link) => ({ url: link.url, title: link.text })),
        details: links.map((link) => ({ url: link.url, status: "source_parsed_unreviewed" })),
      }),
    },
  )
  assert.equal(result.summary.status, "window_scanned", JSON.stringify(result.summary))
  assert.equal(result.summary.reached_older_item, true)
  assert.equal(result.summary.scanned_items, 3)
  assert.equal(result.candidates.length, 1)
  assert.match(result.candidates[0].url, /universal-robots-unveils-gen-7/)
  assert.equal(inputs.length, 1)
})

test("paginated scan follows the verified page cursor and checks the cross-page date boundary", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "research-ur-pages-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const pageItems = [
    [
      item("p1-1", "Recent one", "2026-10-01", "recent-one"),
      item("p1-2", "Recent two", "2026-09-30", "recent-two"),
      ...Array.from({ length: 10 }, (_, i) =>
        item(`p1-${i + 3}`, `Recent ${i}`, "2026-09-29", `recent-${i}`),
      ),
    ],
    [
      item("p2-1", "Boundary item", "2026-09-27", "boundary-item"),
      ...Array.from({ length: 11 }, (_, i) =>
        item(`p2-${i + 2}`, `Earlier ${i}`, "2025-09-29", `earlier-${i}`),
      ),
    ],
  ]
  const documents = pageItems.map((items, index) => {
    const body = JSON.stringify(payload(items, { page: index + 1, total: 194 }))
    const relative = `documents/page-${index + 1}/body.bin`
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true })
    fs.writeFileSync(path.join(root, relative), body)
    return {
      fetch_status: "captured",
      mime_type: "application/json",
      body_path: relative,
      body_sha256: sha256(body),
      source_version_id: `page-${index + 1}:${sha256(body)}`,
      observed_at: "2026-10-01T00:00:00.000Z",
    }
  })
  const calls = []
  const result = await scanPaginatedURRoute(
    root,
    {
      async stage(_name, _input, action) {
        return action()
      },
    },
    {},
    channel,
    [],
    { since: "2026-09-28", until: "2026-10-02" },
    {
      fetchPolicy: async (_root, _fetcher, url) => {
        calls.push(url)
        return documents[calls.length - 1]
      },
      collectDetails: async (_root, _run, _fetcher, _channel, _profiles, links) => ({
        documents: [],
        parses: [],
        candidates: links.map((link) => ({ url: link.url })),
        details: links.map((link) => ({ url: link.url, status: "source_parsed_unreviewed" })),
      }),
    },
  )
  assert.equal(result.summary.status, "window_scanned")
  assert.equal(result.summary.pages.length, 2)
  assert.equal(result.summary.reached_older_item, true)
  assert.deepEqual(calls, [urPageURL(channel, 1), urPageURL(channel, 2)])
  assert.equal(result.candidates.length, 12)
  assert.deepEqual(
    result.candidates.slice(0, 2).map((candidate) => candidate.url),
    [
      "https://www.universal-robots.com/news-and-media/news-center/recent-one/",
      "https://www.universal-robots.com/news-and-media/news-center/recent-two/",
    ],
  )
})
