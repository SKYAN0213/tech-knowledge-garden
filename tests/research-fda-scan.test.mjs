import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { registry } from "../scripts/research/discovery.mjs"
import { assessSinglePageIndex } from "../scripts/research/list-scan.mjs"
import { parseDocument } from "../scripts/research/parser.mjs"

const acquisition = JSON.parse(fs.readFileSync("data/research-acquisition.json", "utf8"))
const channels = JSON.parse(fs.readFileSync("data/research-source-channels.json", "utf8"))
const watchlist = JSON.parse(fs.readFileSync("data/research-watchlist.json", "utf8"))
const channel = registry(channels, watchlist, acquisition).find(
  (route) => route.channel_id === "fda-press-announcements",
)
const profile = acquisition.article_profiles.find(
  (item) => item.id === "fda-press-announcement-article-v1",
)

function temporary(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-fda-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const previous = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previous || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (previous === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previous
  })
  return root
}

function source(root, url, html) {
  const bytes = Buffer.from(html)
  const source_id = sourceId(url)
  const body_sha256 = sha256(bytes)
  const body_path = `originals/${source_id}-${body_sha256}.html`
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

test("FDA press list strips the date from titles and needs an older article boundary", async (t) => {
  const root = temporary(t)
  const article = (slug, title, date) =>
    `<li><div><span><a href="/news-events/press-announcements/${slug}"><time datetime="${date}T04:00:00Z">${new Date(date + "T04:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</time> - ${title}</a></span></div></li>`
  const body = `<html><body><main><h1>Press Announcements</h1><div class="view-press-announcements"><div class="view-content"><ul>
  ${article("new-treatment", "FDA Approves New Treatment", "2026-09-28")}
  ${article("new-device", "FDA Clears New Device", "2026-09-23")}
  ${article("older-study", "FDA Announces Earlier Study", "2026-09-21")}
  </ul></div></div></main></body></html>`
  const parsed = await parseDocument(root, source(root, channel.url, body), channel.parse_options)
  const covered = assessSinglePageIndex(parsed, channel, "2026-09-22", "2026-09-29")
  assert.equal(covered.status, "window_covered")
  assert.deepEqual(
    covered.links.map((link) => link.text),
    ["FDA Approves New Treatment", "FDA Clears New Device"],
  )
  assert.equal(covered.older_items, 1)
  assert.equal(
    assessSinglePageIndex(parsed, channel, "2026-09-01", "2026-09-29").reason,
    "cutoff_not_reached",
  )
  const wrongTitle = body.replace(" - FDA Clears New Device", "FDA Clears New Device")
  const changed = await parseDocument(
    root,
    source(root, channel.url, wrongTitle),
    channel.parse_options,
  )
  assert.equal(
    assessSinglePageIndex(changed, channel, "2026-09-22", "2026-09-29").reason,
    "listing_item_missing_identity_or_date",
  )
})

test("FDA detail keeps the release date and article body without contact boilerplate", async (t) => {
  const root = temporary(t)
  const url = "https://www.fda.gov/news-events/press-announcements/fda-approves-new-treatment"
  const html = `<html><head><meta property="article:published_time" content="Mon, 09/28/2026 - 17:43"></head><body><main><article id="main-content"><h1>FDA Approves New Treatment</h1><div role="main">
    <dl class="lcds-description-list--grid"><dd><time datetime="2026-09-28T21:45:00Z">September 28, 2026</time></dd></dl>
    <p>The FDA approved a treatment for a rare disease.</p><p>A clinical trial compared the treatment with placebo.</p>
    <hr><div class="inset-column"><p>Media contact</p></div><p>FDA boilerplate.</p>
  </div></article></main></body></html>`
  assert.match(url, new RegExp(profile.url_pattern))
  await assert.rejects(
    parseDocument(root, source(root, url, html), profile.options),
    /Official listing publication date is required/,
  )
  const options = {
    ...profile.options,
    listing_published_at: "2026-09-28",
    listing_source_url: "https://www.fda.gov/news-events/fda-newsroom/press-announcements",
    listing_source_version_id: "fixture-listing:" + sha256(Buffer.from("FDA listing fixture")),
    listing_date_text: "September 28, 2026",
  }
  const parsed = await parseDocument(root, source(root, url, html), options)
  assert.equal(parsed.status, "extracted")
  assert.equal(parsed.title, "FDA Approves New Treatment")
  assert.equal(parsed.dates.published_at, "2026-09-28")
  assert.equal(parsed.dates.profile_status, "official-listing-confirmed-by-display")
  assert.equal(parsed.dates.basis.source_version_id, options.listing_source_version_id)
  assert.deepEqual(
    parsed.blocks.map((block) => block.text),
    [
      "The FDA approved a treatment for a rare disease.",
      "A clinical trial compared the treatment with placebo.",
    ],
  )
  const conflicting = html.replace(
    '<time datetime="2026-09-28T21:45:00Z">September 28, 2026</time>',
    '<time datetime="2026-09-27T21:45:00Z">September 27, 2026</time>',
  )
  const conflict = await parseDocument(root, source(root, url, conflicting), options)
  assert.equal(conflict.dates.published_at, null)
  assert.equal(conflict.dates.profile_status, "listing-display-mismatch")
})
