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
const channel = registry(
  JSON.parse(fs.readFileSync("data/research-source-channels.json", "utf8")),
  JSON.parse(fs.readFileSync("data/research-watchlist.json", "utf8")),
  acquisition,
).find((route) => route.channel_id === "nvidia-press-releases")
const profile = acquisition.article_profiles.find(
  (item) => item.id === "nvidia-newsroom-press-release-v1",
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
    observed_at: "2026-09-29T02:00:00Z",
    fetch_status: "captured",
  }
}

function temporary(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-nvidia-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

test("NVIDIA press feed needs matching permalinks, a dated window and an older boundary", async (t) => {
  assert.equal(channel.method, "rss")
  assert.equal(channel.listing_profile.guid_is_permalink, true)
  const root = temporary(t)
  const feed = `<rss version="2.0"><channel><title>Press Release - NVIDIA Newsroom</title><link>https://nvidianews.nvidia.com/</link>
    <item><title>New AI platform</title><link>https://nvidianews.nvidia.com/news/new-ai-platform</link><guid>https://nvidianews.nvidia.com/news/new-ai-platform</guid><pubDate>Mon, 28 Sep 2026 09:00:00 GMT</pubDate></item>
    <item><title>Older AI release</title><link>https://nvidianews.nvidia.com/news/older-ai-release</link><guid>https://nvidianews.nvidia.com/news/older-ai-release</guid><pubDate>Mon, 14 Sep 2026 13:00:00 GMT</pubDate></item>
  </channel></rss>`
  const parsed = await parseStoredRSSFeed(root, stored(root, channel.url, feed, "xml"), channel)
  const covered = assessBoundedRSSFeed(parsed, channel, "2026-09-22", "2026-09-29")
  assert.equal(covered.status, "window_covered")
  assert.equal(covered.window_items, 1)
  assert.equal(covered.older_items, 1)
  assert.equal(
    assessBoundedRSSFeed(parsed, channel, "2026-09-01", "2026-09-29").reason,
    "feed_cutoff_not_reached",
  )
  const changed = structuredClone(parsed)
  changed.links[0].guid = "https://nvidianews.nvidia.com/news/another-story"
  assert.equal(
    assessBoundedRSSFeed(changed, channel, "2026-09-22", "2026-09-29").reason,
    "feed_item_identity_or_date_invalid",
  )
})

test("NVIDIA article profile extracts its release date and body without page navigation", async (t) => {
  const root = temporary(t)
  const previousPython = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previousPython || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (previousPython === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previousPython
  })
  const url = "https://nvidianews.nvidia.com/news/new-ai-platform"
  assert.match(url, new RegExp(profile.url_pattern))
  const html = `<html><body><nav><p>Unrelated navigation</p></nav><main><div class="article"><h1 class="article-title">New AI platform</h1><div class="article-date">September 28, 2026</div><div class="article-body"><p>News Summary:</p><ul><li>The company announced a new platform.</li></ul><p>The release identifies the platform and its deployment plan.</p></div></div></main><footer><p>Subscribe for updates</p></footer></body></html>`
  const parsed = await parseDocument(root, stored(root, url, html, "html"), profile.options)
  assert.equal(parsed.status, "extracted")
  assert.equal(parsed.title, "New AI platform")
  assert.equal(parsed.dates.published_at, "2026-09-28")
  assert.equal(parsed.dates.profile_status, "matched")
  assert.deepEqual(
    parsed.blocks.map((block) => block.text),
    [
      "News Summary:",
      "The company announced a new platform.",
      "The release identifies the platform and its deployment plan.",
    ],
  )
})
