import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { registry } from "../scripts/research/discovery.mjs"
import { scanBoundedRSSRoute } from "../scripts/research/rss-scan.mjs"
import { validateDailyRoutes } from "../scripts/research/daily-plan.mjs"

const acquisition = JSON.parse(fs.readFileSync("data/research-acquisition.json", "utf8"))
const routes = registry(
  JSON.parse(fs.readFileSync("data/research-source-channels.json", "utf8")),
  JSON.parse(fs.readFileSync("data/research-watchlist.json", "utf8")),
  acquisition,
)
const route = routes.find((entry) => entry.channel_id === "samsung-global-press-releases")
const profile = acquisition.article_profiles.find(
  (entry) => entry.id === "samsung-global-press-release-v1",
)

function stored(root, url, body, extension) {
  const bytes = Buffer.from(body)
  const id = sourceId(url)
  const hash = sha256(bytes)
  const bodyPath = `originals/${id}.${extension}`
  fs.mkdirSync(path.join(root, "originals"), { recursive: true })
  fs.writeFileSync(path.join(root, bodyPath), bytes)
  return {
    original_url: url,
    final_url: url,
    source_id: id,
    source_version_id: `${id}:${hash}`,
    body_path: bodyPath,
    body_sha256: hash,
    observed_at: "2026-09-29T13:00:00Z",
    fetch_status: "captured",
  }
}

test("Samsung press RSS checks short GUID, article date and full body before accepting a window", async (t) => {
  const daily = JSON.parse(fs.readFileSync("data/research-daily-routes.json", "utf8"))
  assert.deepEqual(
    validateDailyRoutes(daily, routes).find(
      (entry) => entry.channel_id === "samsung-global-press-releases",
    ),
    {
      channel_id: "samsung-global-press-releases",
      enabled: true,
      baseline_run: "20260929-samsung-global-press-window-v2",
      route,
    },
  )
  assert.equal(route.region, "국내")
  assert.equal(route.axis, "기업·운영")
  assert.equal(route.method, "rss")
  assert.equal(route.listing_profile.guid_is_permalink, false)
  const previousPython = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previousPython || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-samsung-rss-")))
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true })
    if (previousPython === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previousPython
  })
  const url = "https://news.samsung.com/global/samsung-invests-in-ai-infrastructure"
  assert.match(url, new RegExp(profile.url_pattern))
  const feed = `<rss version="2.0"><channel><title>Press Releases – Samsung Global Newsroom</title>
    <item><title>Samsung Invests in AI Infrastructure</title><link>${url}</link><guid>https://bit.ly/new</guid><pubDate>Tue, 29 Sep 2026 08:00:00 +0000</pubDate></item>
    <item><title>Older Release</title><link>https://news.samsung.com/global/older-release</link><guid>https://bit.ly/old</guid><pubDate>Wed, 16 Sep 2026 08:00:00 +0000</pubDate></item>
  </channel></rss>`
  const html = `<html><body><main><div><div class="single_container">
    <div><h1>Samsung Invests in AI Infrastructure</h1><p class="single-date">Korea on September 29, 2026</p></div>
    <div class="single_contents"><p>Samsung announced an infrastructure investment.</p><h2>Power and data centers</h2><p>The project includes power networks.</p></div>
  </div></div></main><aside><p>Unrelated article</p></aside></body></html>`
  const documents = new Map([
    [route.url, stored(root, route.url, feed, "xml")],
    [url, stored(root, url, html, "html")],
  ])
  const result = await scanBoundedRSSRoute(
    root,
    { stage: (_name, _input, operation) => operation() },
    {},
    route,
    [profile],
    { since: "2026-09-23", until: "2026-09-30" },
    {
      fetchPolicy: async (_root, _fetcher, wanted) => documents.get(wanted),
    },
  )
  assert.equal(result.summary.status, "window_scanned")
  assert.equal(result.summary.assessment.older_items, 1)
  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].source_published_at, "2026-09-29")
  assert.equal(result.candidates[0].source_urls[0], url)
  const article = result.parses.find((parsed) => parsed.source_id === sourceId(url))
  assert.equal(article.title, "Samsung Invests in AI Infrastructure")
  assert.equal(article.dates.published_at, "2026-09-29")
  assert.equal(article.dates.profile_status, "matched")
  assert.deepEqual(
    article.blocks.map((block) => block.text),
    [
      "Samsung announced an infrastructure investment.",
      "Power and data centers",
      "The project includes power networks.",
    ],
  )
})
