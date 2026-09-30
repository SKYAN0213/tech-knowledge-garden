import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { validateDailyRoutes } from "../scripts/research/daily-plan.mjs"
import { registry } from "../scripts/research/discovery.mjs"
import { scanBoundedRSSRoute } from "../scripts/research/rss-scan.mjs"

const acquisition = JSON.parse(fs.readFileSync("data/research-acquisition.json", "utf8"))
const channels = JSON.parse(fs.readFileSync("data/research-source-channels.json", "utf8"))
const watchlist = JSON.parse(fs.readFileSync("data/research-watchlist.json", "utf8"))
const routes = registry(channels, watchlist, acquisition)
const route = routes.find((entry) => entry.channel_id === "amd-ir-press")
const profile = acquisition.article_profiles.find((entry) => entry.id === "amd-ir-press-article-v1")
const articleURL = "https://ir.amd.com/news-events/press-releases/detail/1300/amd-expands-compute"
const olderURL = "https://ir.amd.com/news-events/press-releases/detail/1299/older-release"

function stored(root, url, body) {
  const bytes = Buffer.from(body)
  const id = sourceId(url)
  const digest = sha256(bytes)
  const body_path = `source-${id}-${digest}.bin`
  fs.writeFileSync(path.join(root, body_path), bytes)
  return {
    original_url: url,
    final_url: url,
    source_id: id,
    source_version_id: `${id}:${digest}`,
    body_path,
    body_sha256: digest,
    observed_at: "2026-09-30T01:00:00Z",
    fetch_status: "captured",
  }
}

const item = (url, title, date, guid = url) =>
  `<item><title>${title}</title><link>${url}</link><guid>${guid}</guid><pubDate>${date}</pubDate></item>`
const feed = (guid = articleURL, date = "Tue, 29 Sep 26 23:30:00 -0400") =>
  `<rss version="2.0"><channel><title>Advanced Micro Devices, Inc. (AMD) Press Releases</title>
  ${item(articleURL, "AMD Expands Compute", date, guid)}
  ${item(olderURL, "Older Release", "Mon, 21 Sep 26 08:00:00 -0400")}
  </channel></rss>`
const article = (title = "AMD Expands Compute", day = "2026-09-29") =>
  `<html lang="en"><body><main><article class="full-news-article"><h1>${title}</h1>
  <div class="related-documents-line"><time datetime="${day}T23:30:00">September 29, 2026 11:30 pm EDT</time><p>Related documents</p></div>
  <h3>New manufacturing capacity</h3><p>AMD announced an investment plan.</p>
  <ul><li>Factory construction is planned.</li></ul>
  <table><tr><th>Period</th><th>Amount</th></tr><tr><td>2026</td><td>$2 billion</td></tr></table>
  <p>Contact AMD Press press@example.com</p><p class="spr-ir-news-article-date">Released September 29, 2026</p>
  </article></main><aside><p>Unrelated release</p></aside></body></html>`

test("AMD IR reuses bounded RSS and preserves local publication day and financial tables", async (t) => {
  const previous = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previous || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-amd-ir-")))
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true })
    if (previous === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previous
  })
  assert.equal(route.method, "rss")
  assert.equal(route.region, "해외")
  assert.equal(route.axis, "기업·운영")
  assert.deepEqual(route.sectors, ["반도체·컴퓨팅"])
  assert.equal(route.listing_profile.pagination, "bounded-feed")
  assert.equal(route.listing_profile.date_timezone, "America/New_York")
  assert.equal(route.listing_profile.guid_is_permalink, true)
  assert.match(articleURL, new RegExp(profile.url_pattern))
  assert.equal(
    validateDailyRoutes(
      JSON.parse(fs.readFileSync("data/research-daily-routes.json", "utf8")),
      routes,
    ).find((entry) => entry.channel_id === route.channel_id).baseline_run,
    "20260930-amd-ir-sep23-window-v1",
  )

  const documents = new Map([
    [route.url, stored(root, route.url, feed())],
    [articleURL, stored(root, articleURL, article())],
  ])
  const scan = (since, until) =>
    scanBoundedRSSRoute(
      root,
      { stage: (_name, _input, action) => action() },
      {},
      route,
      [profile],
      { since, until },
      { fetchPolicy: async (_root, _fetcher, url) => documents.get(url) },
    )

  const current = await scan("2026-09-29", "2026-09-30")
  assert.equal(current.summary.status, "window_scanned", JSON.stringify(current.summary))
  assert.equal(current.summary.assessment.older_items, 1)
  assert.equal(current.candidates.length, 1)
  assert.equal(current.candidates[0].source_published_at, "2026-09-29")
  assert.equal(current.candidates[0].source_urls[0], articleURL)
  const parsed = current.parses.find((entry) => entry.source_id === sourceId(articleURL))
  assert.equal(parsed.title, "AMD Expands Compute")
  assert.equal(parsed.dates.profile_status, "matched")
  assert.equal(parsed.dates.published_at, "2026-09-29")
  assert.deepEqual(
    parsed.blocks.map((block) => block.text),
    [
      "New manufacturing capacity",
      "AMD announced an investment plan.",
      "Factory construction is planned.",
      "Period Amount 2026 $2 billion",
    ],
  )
  assert.deepEqual(parsed.blocks.at(-1).rows, [
    ["Period", "Amount"],
    ["2026", "$2 billion"],
  ])
  const empty = await scan("2026-09-30", "2026-10-01")
  assert.equal(empty.summary.status, "window_scanned")
  assert.equal(empty.candidates.length, 0)
  assert.equal((await scan("2026-09-21", "2026-09-30")).summary.reason, "feed_cutoff_not_reached")

  documents.set(route.url, stored(root, route.url, feed(olderURL)))
  assert.equal(
    (await scan("2026-09-29", "2026-09-30")).summary.reason,
    "feed_item_identity_or_date_invalid",
  )
  documents.set(route.url, stored(root, route.url, feed()))
  documents.set(articleURL, stored(root, articleURL, article("Different Title")))
  const wrongTitle = await scan("2026-09-29", "2026-09-30")
  assert.equal(wrongTitle.summary.status, "incomplete")
  assert.equal(wrongTitle.summary.details[0].status, "title_conflict")
  documents.set(articleURL, stored(root, articleURL, article("AMD Expands Compute", "2026-09-28")))
  const wrongDate = await scan("2026-09-29", "2026-09-30")
  assert.equal(wrongDate.summary.status, "incomplete")
  assert.equal(wrongDate.summary.details[0].status, "date_conflict")
})
