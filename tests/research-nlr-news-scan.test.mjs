import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { validateDailyRoutes } from "../scripts/research/daily-plan.mjs"
import { registry } from "../scripts/research/discovery.mjs"
import { scanSinglePageRoute } from "../scripts/research/list-scan.mjs"

const acquisition = JSON.parse(fs.readFileSync("data/research-acquisition.json", "utf8"))
const channels = JSON.parse(fs.readFileSync("data/research-source-channels.json", "utf8"))
const watchlist = JSON.parse(fs.readFileSync("data/research-watchlist.json", "utf8"))
const route = registry(channels, watchlist, acquisition).find(
  (entry) => entry.channel_id === "nlr-energy-news",
)
const profiles = acquisition.article_profiles.filter((entry) => entry.id.startsWith("nlr-news-"))
const programURL = "https://www.nlr.gov/news/detail/program/2026/gas-grid-planning"
const pressURL = "https://www.nlr.gov/news/detail/press/2026/laboratory-appointment"
const featureURL = "https://www.nlr.gov/news/feature/2026/wave-energy-field-test"
const olderURL = "https://www.nlr.gov/news/detail/program/2026/older-research"

function stored(root, url, body) {
  const bytes = Buffer.from(body)
  const id = sourceId(url)
  const digest = sha256(bytes)
  const body_path = `source-${id}-${digest}.html`
  fs.writeFileSync(path.join(root, body_path), bytes)
  return {
    original_url: url,
    final_url: url,
    source_id: id,
    source_version_id: `${id}:${digest}`,
    body_path,
    body_sha256: digest,
    observed_at: "2026-09-30T00:00:00Z",
    fetch_status: "captured",
  }
}

const card = (url, date, title) =>
  `<div class="news-card"><span class="date">${date}</span><h3><a href="${url}">${title}</a></h3><p>Teaser only.</p></div>`
const listing = (featureDate = "Sept. 2, 2026", featureURLValue = featureURL) =>
  `<html lang="en"><head><title>News and Feature Stories</title></head><body><main>${[
    card(programURL, "Sept. 22, 2026", "Gas-Grid Planning"),
    card(pressURL, "Sept. 8, 2026", "Laboratory Appointment"),
    card(featureURLValue, featureDate, "Wave Energy Field Test"),
    card(olderURL, "Aug. 28, 2026", "Older Research"),
  ].join("")}</main></body></html>`
const standard = (title, date) =>
  `<html lang="en"><body><main><div class="generic-content"><h1>${title}</h1><div id="byline" class="row mt-3"><div class="col-md-8">${date} | Contact media relations</div></div><p>Researchers completed a field test.</p></div><aside><p>Other news</p></aside></main></body></html>`
const feature = (date = "Sept. 2, 2026") =>
  `<html lang="en"><body><main><section class="parallax-hero"><div><h1>Wave Energy Field Test</h1><p>Field deployment results</p></div></section><div class="sf_colsIn"><div class="sf-Long-text"><p>${date} | By Researcher | Contact media relations</p><p>The team deployed the wave device.</p><p class="caption">Image caption</p></div></div><div class="sf_colsIn"><div class="sf-Long-text"><h2>At sea</h2><p>They collected field data.</p><p>Interested in learning more? Subscribe to the newsletter.</p></div></div><aside><p>Unrelated story</p></aside></main></body></html>`

test("NLR mixed news uses one dated-list scanner and full program, press and feature profiles", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-nlr-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const previous = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previous || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (previous === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previous
  })
  assert.equal(route.listing_profile.pagination, "single-page")
  assert.equal(route.listing_profile.require_title_match, true)
  assert.deepEqual(route.sectors, ["에너지·기후기술"])
  assert.equal(profiles.length, 2)
  assert.equal(
    validateDailyRoutes(
      JSON.parse(fs.readFileSync("data/research-daily-routes.json", "utf8")),
      registry(channels, watchlist, acquisition),
    ).find((entry) => entry.channel_id === route.channel_id).baseline_run,
    "20260930-nlr-energy-sep16-window-v1",
  )
  const documents = new Map([
    [route.url, stored(root, route.url, listing())],
    [programURL, stored(root, programURL, standard("Gas-Grid Planning", "Sept. 22, 2026"))],
    [pressURL, stored(root, pressURL, standard("Laboratory Appointment", "Sept. 8, 2026"))],
    [featureURL, stored(root, featureURL, feature())],
  ])
  const scan = (since, until) =>
    scanSinglePageRoute(
      root,
      { stage: (_name, _input, action) => action() },
      {},
      route,
      profiles,
      { since, until },
      { fetchPolicy: async (_root, _fetcher, url) => documents.get(url) },
    )
  const recent = await scan("2026-09-16", "2026-09-23")
  assert.equal(recent.summary.status, "window_scanned", JSON.stringify(recent.summary))
  assert.equal(recent.summary.assessment.older_items, 3)
  assert.deepEqual(
    recent.candidates.map((item) => item.source_published_at),
    ["2026-09-22"],
  )
  const mixed = await scan("2026-09-01", "2026-09-09")
  assert.equal(mixed.summary.status, "window_scanned")
  assert.deepEqual(
    mixed.candidates.map((item) => item.source_published_at),
    ["2026-09-08", "2026-09-02"],
  )
  const featureParse = mixed.parses.find((item) => item.title === "Wave Energy Field Test")
  assert.deepEqual(
    featureParse.blocks.map((item) => item.text),
    [
      "Field deployment results",
      "The team deployed the wave device.",
      "At sea",
      "They collected field data.",
    ],
  )
  const empty = await scan("2026-09-23", "2026-09-30")
  assert.equal(empty.summary.status, "window_scanned")
  assert.equal(empty.candidates.length, 0)
  assert.equal((await scan("2026-08-28", "2026-09-23")).summary.reason, "cutoff_not_reached")

  documents.set(featureURL, stored(root, featureURL, feature("Sept. 3, 2026")))
  const wrongDate = await scan("2026-09-01", "2026-09-09")
  assert.equal(wrongDate.summary.status, "incomplete")
  assert.equal(
    wrongDate.summary.details.find((item) => item.url === featureURL).status,
    "date_conflict",
  )
  documents.set(featureURL, stored(root, featureURL, feature()))
  documents.set(pressURL, stored(root, pressURL, standard("Different Title", "Sept. 8, 2026")))
  const wrongTitle = await scan("2026-09-01", "2026-09-09")
  assert.equal(wrongTitle.summary.status, "incomplete")
  assert.equal(
    wrongTitle.summary.details.find((item) => item.url === pressURL).status,
    "title_conflict",
  )
  documents.set(route.url, stored(root, route.url, listing("Sept. 32, 2026")))
  assert.equal(
    (await scan("2026-09-01", "2026-09-09")).summary.reason,
    "listing_item_missing_identity_or_date",
  )
  const unknownURL = featureURL.replace("/feature/", "/detail/other/")
  documents.set(
    unknownURL,
    stored(root, unknownURL, standard("Wave Energy Field Test", "Sept. 2, 2026")),
  )
  documents.set(route.url, stored(root, route.url, listing("Sept. 2, 2026", unknownURL)))
  const unknown = await scan("2026-09-01", "2026-09-09")
  assert.equal(unknown.summary.reason, "detail_incomplete")
  assert.equal(
    unknown.summary.details.find((item) => item.url === unknownURL).status,
    "article_profile_missing_or_ambiguous",
  )
})
