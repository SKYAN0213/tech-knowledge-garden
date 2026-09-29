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
const channel = routes.find((route) => route.channel_id === "nasa-technology-rss")
const profile = acquisition.article_profiles.find(
  (item) => item.id === "nasa-technology-article-v1",
)

function source(root, url, body, extension) {
  const bytes = Buffer.from(body)
  const body_sha256 = sha256(bytes)
  const source_id = sourceId(url)
  const body_path = `originals/${source_id}.${extension}`
  fs.mkdirSync(path.join(root, "originals"), { recursive: true })
  fs.writeFileSync(path.join(root, body_path), bytes)
  return {
    original_url: url,
    final_url: url,
    source_id,
    source_version_id: `${source_id}:${body_sha256}`,
    body_path,
    body_sha256,
    observed_at: "2026-09-29T02:00:00Z",
    fetch_status: "captured",
  }
}

test("NASA Technology accepts WordPress GUIDs while requiring dated permalinks and an older feed boundary", async (t) => {
  assert.equal(channel.method, "rss")
  assert.equal(channel.listing_profile.guid_is_permalink, false)
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-nasa-rss-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const feed = `<rss version="2.0"><channel><title>Technology – NASA</title><link>https://www.nasa.gov/technology/</link><description>Technology</description>
    <item><title>Robotics team</title><link>https://www.nasa.gov/centers-and-facilities/johnson/robotics-team/</link><guid>https://www.nasa.gov/?p=1050005</guid><pubDate>Mon, 28 Sep 2026 10:00:00 GMT</pubDate></item>
    <item><title>Earth observation</title><link>https://science.nasa.gov/earth/earth-observatory/clouds/</link><guid>https://science.nasa.gov/earth/earth-observatory/clouds/</guid><pubDate>Thu, 24 Sep 2026 04:01:00 GMT</pubDate></item>
    <item><title>Older technology</title><link>https://www.nasa.gov/technology/older-technology/</link><guid>https://www.nasa.gov/?p=1045713</guid><pubDate>Wed, 16 Sep 2026 16:12:01 GMT</pubDate></item>
    </channel></rss>`
  const parsed = await parseStoredRSSFeed(root, source(root, channel.url, feed, "xml"), channel)
  const covered = assessBoundedRSSFeed(parsed, channel, "2026-09-22", "2026-09-29")
  assert.equal(covered.status, "window_covered")
  assert.equal(covered.window_items, 2)
  assert.equal(covered.older_items, 1)
  assert.equal(assessBoundedRSSFeed(parsed, channel, "2026-09-29", "2026-09-30").window_items, 0)
  assert.equal(
    assessBoundedRSSFeed(parsed, channel, "2026-09-01", "2026-09-29").reason,
    "feed_cutoff_not_reached",
  )
  const repeated = structuredClone(parsed)
  repeated.links[1].guid = repeated.links[0].guid
  assert.equal(
    assessBoundedRSSFeed(repeated, channel, "2026-09-22", "2026-09-29").reason,
    "feed_item_identity_or_date_invalid",
  )
})

test("NASA article profile extracts one title, original local date and article-only body", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-nasa-article-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const previousPython = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previousPython || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (previousPython === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previousPython
  })
  const urls = [
    "https://www.nasa.gov/centers-and-facilities/johnson/robotics-team/",
    "https://science.nasa.gov/earth/earth-observatory/clouds/",
  ]
  for (const url of urls) {
    assert.match(url, new RegExp(profile.url_pattern))
    const original = source(
      root,
      url,
      `<html lang="en"><head><title>Robotics team - NASA</title><meta property="article:published_time" content="2026-09-28T06:00:00-04:00"></head><body><nav><p>Unrelated navigation</p></nav><main id="primary"><article class="post"><h1>Robotics team</h1><div class="usa-article-content"><div class="entry-content"><p>NASA tested a robotic arm with its Johnson team.</p><h2>Test conditions</h2><p>The team compared two control modes in a laboratory.</p></div></div></article></main></body></html>`,
      "html",
    )
    const parsed = await parseDocument(root, original, profile.options)
    assert.equal(parsed.status, "extracted")
    assert.equal(parsed.title, "Robotics team")
    assert.equal(parsed.dates.published_at, "2026-09-28")
    assert.equal(parsed.dates.profile_status, "matched")
    assert.deepEqual(
      parsed.blocks.map((block) => block.text),
      [
        "NASA tested a robotic arm with its Johnson team.",
        "Test conditions",
        "The team compared two control modes in a laboratory.",
      ],
    )
  }
})
