import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { parseDocument } from "../scripts/research/parser.mjs"

const profiles = JSON.parse(
  fs.readFileSync("data/research-acquisition.json", "utf8"),
).article_profiles
const doe = profiles.find((profile) => profile.id === "doe-spark-grid-investment-20260924")
const esa = profiles.find((profile) => profile.id === "esa-juice-earth-flyby-20260928")
const doeURL =
  "https://www.energy.gov/articles/energy-department-announces-speed-power-investments-across-26-states-lower-electricity"
const esaURL =
  "https://www.esa.int/Science_Exploration/Space_Science/Juice/Successful_Earth_flyby_improves_Juice_s_course_to_Jupiter"

async function parseFixture(t, url, html, profile) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-date-profile-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const previous = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previous || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (previous === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previous
  })
  const bytes = Buffer.from(html)
  const id = sourceId(url)
  fs.writeFileSync(path.join(root, "source.html"), bytes)
  return parseDocument(
    root,
    {
      original_url: url,
      final_url: url,
      source_id: id,
      source_version_id: `${id}:${sha256(bytes)}`,
      body_path: "source.html",
      body_sha256: sha256(bytes),
      observed_at: "2026-09-30T00:00:00Z",
      fetch_status: "captured",
    },
    profile.options,
  )
}

test("DOE article uses its own displayed date and body, not neighboring releases", async (t) => {
  assert.match(doeURL, new RegExp(doe.url_pattern))
  const parsed = await parseFixture(
    t,
    doeURL,
    `<html><head><title>DOE News</title><meta property="article:published_time" content="2026-09-24T10:30:17-0400"></head><body>
      <main><h1>DOE announces grid investment plan</h1><article>
        <div class="beneath-title"><span class="display-date">September 24, 2026</span></div>
        <div><section><div class="field--name-field-text">
          <p>DOE announced an intention to fund 31 grid projects in 26 states.</p>
          <p>Selected recipients are expected to rebuild transmission lines.</p>
        </div></section></div>
        <aside><time>September 25, 2026</time><p>View next release</p></aside>
      </article></main></body></html>`,
    doe,
  )
  assert.equal(parsed.status, "extracted")
  assert.equal(parsed.title, "DOE announces grid investment plan")
  assert.equal(parsed.dates.published_at, "2026-09-24")
  assert.equal(parsed.dates.profile_status, "matched")
  assert.deepEqual(
    parsed.blocks.map((block) => block.text),
    [
      "DOE announced an intention to fund 31 grid projects in 26 states.",
      "Selected recipients are expected to rebuild transmission lines.",
    ],
  )
})

test("ESA Juice article reads its day-first release date from the article header", async (t) => {
  assert.match(esaURL, new RegExp(esa.url_pattern))
  const parsed = await parseFixture(
    t,
    esaURL,
    `<html><head><title>ESA - Successful Earth flyby</title></head><body>
      <article class="exploring-discovering"><header><h1>Successful Earth flyby improves Juice’s course to Jupiter</h1>
        <div><span>28/09/2026</span><span>views</span></div></header>
        <div class="abstract"><p>ESA's Juice spacecraft flew past Earth to alter its course toward Jupiter.</p></div>
        <div class="article__block"><p>The flyby deflected its course and gave scientists a chance to test its instruments.</p>
          <p>Operators will continue tracking the spacecraft after the Earth flyby.</p></div>
      </article><aside><p>Related ESA missions and navigation links.</p></aside>
    </body></html>`,
    esa,
  )
  assert.equal(parsed.status, "extracted")
  assert.equal(parsed.title, "Successful Earth flyby improves Juice’s course to Jupiter")
  assert.equal(parsed.dates.published_at, "2026-09-28")
  assert.equal(parsed.dates.profile_status, "matched")
  assert.ok(parsed.blocks.some((block) => block.text.includes("alter its course")))
  assert.ok(parsed.blocks.every((block) => !block.text.includes("Related ESA missions")))
})
