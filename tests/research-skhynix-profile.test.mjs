import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { registry } from "../scripts/research/discovery.mjs"
import { parseDocument } from "../scripts/research/parser.mjs"
import { assessBoundedRSSFeed, parseStoredRSSFeed } from "../scripts/research/rss-scan.mjs"
import { validateDailyRoutes } from "../scripts/research/daily-plan.mjs"

const acquisition = JSON.parse(fs.readFileSync("data/research-acquisition.json", "utf8"))
const profile = acquisition.article_profiles.find(
  (item) => item.id === "skhynix-newsroom-en-article-v1",
)
const url = "https://news.skhynix.com/en/tsmc-oip-conference-2026/"
const routes = registry(
  JSON.parse(fs.readFileSync("data/research-source-channels.json", "utf8")),
  JSON.parse(fs.readFileSync("data/research-watchlist.json", "utf8")),
  acquisition,
)
const route = routes.find((item) => item.channel_id === "skhynix-newsroom-en")

test("SK hynix official RSS reaches an older date and remains a verified daily route", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-skhynix-rss-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  assert.equal(route.region, "국내")
  assert.equal(route.axis, "기술·제품")
  assert.deepEqual(route.sectors, ["반도체·컴퓨팅"])
  assert.equal(route.listing_profile.guid_is_permalink, false)
  assert.equal(route.listing_profile.date_timezone, "Asia/Seoul")
  assert.deepEqual(route.listing_profile.ignored_categories, ["Media"])
  const active = validateDailyRoutes(
    JSON.parse(fs.readFileSync("data/research-daily-routes.json", "utf8")),
    routes,
  )
  assert.equal(
    active.find((item) => item.channel_id === route.channel_id).baseline_run,
    "20260930-skhynix-mixed-feed-sep23-v1",
  )
  const feed = `<rss version="2.0"><channel><title>SK hynix Newsroom</title><link>https://news.skhynix.com/en/</link>
    <item><title>Morning article</title><link>https://news.skhynix.com/en/morning-article/</link><guid isPermaLink="false">https://news.skhynix.com/en/?p=13364</guid><pubDate>Tue, 29 Sep 2026 23:59:07 +0000</pubDate><category>TECH&amp;AI</category></item>
    <item><title>Article image</title><link>https://news.skhynix.com/en/article-image/</link><guid isPermaLink="false">https://news.skhynix.com/en/?p=13365</guid><pubDate>Mon, 28 Sep 2026 06:00:00 +0000</pubDate><category>Media</category></item>
    <item><title>SK hynix presents memory portfolio</title><link>${url}</link><guid isPermaLink="false">https://news.skhynix.com/en/?p=13363</guid><pubDate>Mon, 28 Sep 2026 05:23:44 +0000</pubDate><category>TECH&amp;AI</category></item>
    <item><title>Older news</title><link>https://news.skhynix.com/en/older-news/</link><guid isPermaLink="false">https://news.skhynix.com/en/?p=10000</guid><pubDate>Tue, 22 Sep 2026 02:36:18 +0000</pubDate><category>TECH&amp;AI</category></item>
  </channel></rss>`
  const bytes = Buffer.from(feed)
  fs.writeFileSync(path.join(root, "feed.xml"), bytes)
  const id = sourceId(route.url)
  const parsed = await parseStoredRSSFeed(
    root,
    {
      original_url: route.url,
      final_url: route.url,
      source_id: id,
      source_version_id: `${id}:${sha256(bytes)}`,
      body_path: "feed.xml",
      body_sha256: sha256(bytes),
      observed_at: "2026-09-30T00:00:00Z",
      fetch_status: "captured",
    },
    route,
  )
  const scanned = assessBoundedRSSFeed(parsed, route, "2026-09-23", "2026-09-30")
  assert.equal(scanned.status, "window_covered")
  assert.equal(scanned.window_items, 1)
  assert.equal(scanned.older_items, 1)
  assert.equal(scanned.later_items, 1)
  assert.equal(scanned.ignored_in_window, 1)
  assert.deepEqual(
    scanned.links.map((link) => link.url),
    [url],
  )
  const today = assessBoundedRSSFeed(parsed, route, "2026-09-30", "2026-10-01")
  assert.equal(today.status, "window_covered")
  assert.deepEqual(
    today.links.map((link) => link.url),
    ["https://news.skhynix.com/en/morning-article/"],
  )
  assert.equal(
    assessBoundedRSSFeed(parsed, route, "2026-09-22", "2026-09-30").reason,
    "feed_cutoff_not_reached",
  )
})

test("SK hynix article profile reads its printed date and body, excluding page chrome", async (t) => {
  assert.match(url, new RegExp(profile.url_pattern))
  assert.doesNotMatch("https://news.skhynix.com/en/", new RegExp(profile.url_pattern))
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-skhynix-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const previous = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previous || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (previous === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previous
  })
  const body = `<html><body><nav><p>Unrelated navigation</p></nav><main>
    <article class="post type-post"><header>
      <h2 class="post-title">SK hynix presents memory portfolio</h2>
      <ul class="post-info"><li><span class="date">September 28, 2026</span></li></ul>
    </header><div class="post-contents">
      <p>The company presented HBM and server memory at a forum.</p>
      <h3 class="sub-title">Product display</h3>
      <p>Its exhibition included a 12-layer 36GB HBM4 module.</p>
      <p class="caption">Image caption outside the article text.</p>
      <p><img src="photo.jpg" alt="Display"></p>
    </div></article><aside><p>Related articles and subscription prompts</p></aside>
  </main></body></html>`
  const bytes = Buffer.from(body)
  const id = sourceId(url)
  const digest = sha256(bytes)
  fs.writeFileSync(path.join(root, "source.html"), bytes)
  const parsed = await parseDocument(
    root,
    {
      original_url: url,
      final_url: url,
      source_id: id,
      source_version_id: `${id}:${digest}`,
      body_path: "source.html",
      body_sha256: digest,
      observed_at: "2026-09-29T00:00:00Z",
      fetch_status: "captured",
    },
    profile.options,
  )
  assert.equal(parsed.status, "extracted")
  assert.equal(parsed.title, "SK hynix presents memory portfolio")
  assert.equal(parsed.dates.published_at, "2026-09-28")
  assert.equal(parsed.dates.profile_status, "matched")
  assert.deepEqual(
    parsed.blocks.map((block) => block.text),
    [
      "The company presented HBM and server memory at a forum.",
      "Product display",
      "Its exhibition included a 12-layer 36GB HBM4 module.",
    ],
  )
})
