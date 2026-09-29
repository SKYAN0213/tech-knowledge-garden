import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { registry } from "../scripts/research/discovery.mjs"
import { assessSinglePageIndex, collectWindowDetails } from "../scripts/research/list-scan.mjs"
import { parseDocument } from "../scripts/research/parser.mjs"

const acquisition = JSON.parse(fs.readFileSync("data/research-acquisition.json", "utf8"))
const route = registry(
  JSON.parse(fs.readFileSync("data/research-source-channels.json", "utf8")),
  JSON.parse(fs.readFileSync("data/research-watchlist.json", "utf8")),
  acquisition,
).find((entry) => entry.channel_id === "frontiers-robotics-papers")
const articleProfile = acquisition.article_profiles.find(
  (entry) => entry.id === "frontiers-frobt-paper-v1",
)

function temporary(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-frontiers-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

function stored(root, url, body) {
  const bytes = Buffer.from(body)
  const id = sourceId(url)
  const hash = sha256(bytes)
  const bodyPath = `originals/${id}.html`
  fs.mkdirSync(path.join(root, "originals"), { recursive: true })
  fs.writeFileSync(path.join(root, bodyPath), bytes)
  return {
    original_url: url,
    final_url: url,
    source_id: id,
    source_version_id: `${id}:${hash}`,
    body_path: bodyPath,
    body_sha256: hash,
    observed_at: "2026-09-29T05:00:00Z",
    fetch_status: "captured",
  }
}

const paper = (id) =>
  `https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.${id}/full`
const card = (status, day, title, id) =>
  `<article class="CardArticle"><a href="${paper(id)}"><p class="CardArticle__date">${status} on ${day}</p><h2 class="CardArticle__title">${title}</h2></a></article>`

test("Frontiers published papers form the window while accepted manuscripts stay excluded", async (t) => {
  assert.equal(route.method, "html-list")
  assert.deepEqual(route.listing_profile.ignored_rule_ids, ["frontiers-frobt-accepted-v1"])
  const root = temporary(t)
  const previousPython = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previousPython || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (previousPython === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previousPython
  })
  const html = `<html><head><title>Frontiers in Robotics and AI | Articles</title></head><body><main>
    ${card("Published", "28 Sep 2026", "Published robot paper", "1111111")}
    ${card("Accepted", "27 Sep 2026", "Unpublished robot manuscript", "2222222")}
    ${card("Published", "21 Sep 2026", "Older published paper", "3333333")}
  </main></body></html>`
  const parsed = await parseDocument(root, stored(root, route.url, html), route.parse_options)
  const covered = assessSinglePageIndex(parsed, route, "2026-09-22", "2026-09-29")
  assert.equal(covered.status, "window_covered")
  assert.equal(covered.window_items, 1)
  assert.equal(covered.older_items, 1)
  assert.deepEqual(
    covered.links.map((item) => item.text),
    ["Published robot paper"],
  )
  const unclassified = html.replace("Accepted on 27 Sep 2026", "Previewed on 27 Sep 2026")
  const changed = await parseDocument(
    root,
    stored(root, route.url, unclassified),
    route.parse_options,
  )
  assert.equal(
    assessSinglePageIndex(changed, route, "2026-09-22", "2026-09-29").reason,
    "unprofiled_article_link",
  )
})

test("Frontiers full-text profile keeps published date and methods but excludes references", async (t) => {
  const root = temporary(t)
  const previousPython = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previousPython || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (previousPython === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previousPython
  })
  const url = paper("1111111")
  assert.match(url, new RegExp(articleProfile.url_pattern))
  const html = `<html><head><meta name="citation_publication_date" content="2026/09/28"></head><body>
    <nav><p>Unrelated journal navigation</p></nav><h1 class="ArticleDetailsV4__main__title">Published robot paper</h1>
    <div class="ArticleContent"><div><h2>Abstract</h2><p>A robot was evaluated.</p></div>
      <div><h2>Methods</h2><p>Researchers compared two control methods.</p></div>
      <h2>Statements</h2><div><p>Administrative disclosure.</p></div>
      <div><h2>References</h2><p>Another paper.</p></div>
    </div></body></html>`
  const parsed = await parseDocument(root, stored(root, url, html), articleProfile.options)
  assert.equal(parsed.status, "extracted")
  assert.equal(parsed.title, "Published robot paper")
  assert.equal(parsed.dates.published_at, "2026-09-28")
  assert.equal(parsed.dates.profile_status, "matched")
  assert.deepEqual(
    parsed.blocks.map((block) => block.text),
    ["Abstract", "A robot was evaluated.", "Methods", "Researchers compared two control methods."],
  )
})

test("Frontiers title disagreement prevents a candidate even when the publication date matches", async () => {
  const url = paper("1111111")
  const link = {
    url,
    text: "Published robot paper",
    published_at: "2026-09-28",
    listing_source_version_id: "index:v1",
    listing_parse_id: "index-parse",
    discovered_at: "2026-09-29T05:00:00Z",
  }
  const document = {
    original_url: url,
    final_url: url,
    source_version_id: "paper:v1",
    fetch_status: "captured",
    observed_at: "2026-09-29T05:00:00Z",
  }
  const collected = await collectWindowDetails(
    "unused",
    { stage: (_name, _input, operation) => operation() },
    {},
    route,
    [articleProfile],
    [link],
    {
      fetchPolicy: async () => document,
      parse: async () => ({
        status: "extracted",
        title: "Different paper",
        dates: { published_at: "2026-09-28" },
        blocks: [{ text: "Full article text" }],
        quality: { required_fields_present: true },
        parse_id: "paper-parse",
      }),
    },
  )
  assert.equal(collected.details[0].status, "title_conflict")
  assert.deepEqual(collected.candidates, [])
})
