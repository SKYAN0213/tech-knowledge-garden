import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { registry } from "../scripts/research/discovery.mjs"
import { parseDocument } from "../scripts/research/parser.mjs"
import { assessBoundedRSSFeed, parseStoredRSSFeed } from "../scripts/research/rss-scan.mjs"

const acquisition = JSON.parse(fs.readFileSync("data/research-acquisition.json", "utf8"))
const routes = registry(
  JSON.parse(fs.readFileSync("data/research-source-channels.json", "utf8")),
  JSON.parse(fs.readFileSync("data/research-watchlist.json", "utf8")),
  acquisition,
)
const profile = acquisition.article_profiles.find((entry) => entry.id === "mit-news-article-v1")

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
    observed_at: "2026-09-29T04:00:00Z",
    fetch_status: "captured",
  }
}

function temporary(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-mit-rss-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

for (const [id, feedTitle] of [
  ["mit-robotics", "MIT News - Robotics"],
  ["mit-ai-research", "MIT News - Artificial intelligence"],
]) {
  test(`${id} requires unique official permalinks and an older dated boundary`, async (t) => {
    const route = routes.find((entry) => entry.channel_id === id)
    assert.equal(route.method, "rss")
    assert.equal(route.listing_profile.guid_is_permalink, true)
    const root = temporary(t)
    const recent = "https://news.mit.edu/2026/recent-research-0928"
    const older = "https://news.mit.edu/2026/older-research-0914"
    const feed = `<rss version="2.0"><channel><title>${feedTitle}</title><link>https://news.mit.edu/</link>
      <item><title>Recent research</title><link>${recent}</link><guid>${recent}</guid><pubDate>Mon, 28 Sep 2026 09:00:00 GMT</pubDate></item>
      <item><title>Older research</title><link>${older}</link><guid>${older}</guid><pubDate>Mon, 14 Sep 2026 09:00:00 GMT</pubDate></item>
    </channel></rss>`
    const parsed = await parseStoredRSSFeed(root, stored(root, route.url, feed, "xml"), route)
    const covered = assessBoundedRSSFeed(parsed, route, "2026-09-22", "2026-09-29")
    assert.equal(covered.status, "window_covered")
    assert.equal(covered.window_items, 1)
    assert.equal(covered.older_items, 1)
    assert.equal(
      assessBoundedRSSFeed(parsed, route, "2026-09-01", "2026-09-29").reason,
      "feed_cutoff_not_reached",
    )
    const changed = structuredClone(parsed)
    changed.links[0].guid = older
    assert.equal(
      assessBoundedRSSFeed(changed, route, "2026-09-22", "2026-09-29").reason,
      "feed_item_identity_or_date_invalid",
    )
  })
}

test("MIT article profile extracts body and date without sidebar or image-download notes", async (t) => {
  const root = temporary(t)
  const previousPython = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previousPython || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (previousPython === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previousPython
  })
  const url = "https://news.mit.edu/2026/sample-research-0928"
  assert.match(url, new RegExp(profile.url_pattern))
  const html = `<html><body><main id="main"><h1>Sample research</h1>
    <article><div class="news-article--publication-date"><time datetime="2026-09-28T04:00:00Z">September 28, 2026</time></div>
      <aside><p>Unrelated image download notice</p></aside>
      <div class="news-article--content--body--inner"><p>Researchers demonstrated a robot.</p><h2>Experiment</h2><p>The method was tested in water.</p></div>
    </article></main><footer><p>Subscribe to MIT News</p></footer></body></html>`
  const parsed = await parseDocument(root, stored(root, url, html, "html"), profile.options)
  assert.equal(parsed.status, "extracted")
  assert.equal(parsed.title, "Sample research")
  assert.equal(parsed.dates.published_at, "2026-09-28")
  assert.equal(parsed.dates.profile_status, "matched")
  assert.deepEqual(
    parsed.blocks.map((block) => block.text),
    ["Researchers demonstrated a robot.", "Experiment", "The method was tested in water."],
  )
})
