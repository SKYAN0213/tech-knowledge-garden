import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { parseDocument } from "../scripts/research/parser.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"

test("Anthropic news profile excludes sibling related stories and preserves the announcement date", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "anthropic-news-profile-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const url = "https://www.anthropic.com/news/hard-questions"
  const matches = JSON.parse(
    fs.readFileSync("data/research-acquisition.json"),
  ).article_profiles.filter((p) => new RegExp(p.url_pattern).test(url))
  assert.equal(matches.length, 1)
  const bytes = Buffer.from(
    '<html><head><meta property="article:published_time" content="2026-07-09T16:00:00.000Z"></head><body><main><article><div><h1>Inviting hard questions</h1></div><div class="page-wrapper"><article><p>Send questions about AI.</p><ul><li>Public surveys are prior work.</li></ul><table><tr><td>Survey</td><td>52,000 Americans</td></tr></table></article></div><section><h2>Related content</h2><p>Later investment: $100 million in 2027.</p></section></article></main></body></html>',
  )
  const hash = sha256(bytes),
    id = sourceId(url)
  atomicWrite(root, "body.html", bytes)
  const source = {
    original_url: url,
    final_url: url,
    source_id: id,
    source_version_id: `${id}:${hash}`,
    body_sha256: hash,
    body_path: "body.html",
    fetch_status: "captured",
    mime_type: "text/html",
    observed_at: "2026-10-06T00:00:00Z",
  }
  const parsed = await parseDocument(root, source, matches[0].options)
  assert.equal(parsed.title, "Inviting hard questions")
  assert.equal(parsed.dates.published_at, "2026-07-09T16:00:00.000Z")
  assert(parsed.blocks.some((b) => b.text.includes("52,000 Americans")))
  assert(!parsed.blocks.some((b) => /Related content|Later investment/.test(b.text)))
  const missing = bytes
    .toString()
    .replace("<article><p>Send questions", "<aside><p>Send questions")
    .replace("</table></article>", "</table></aside>")
  atomicWrite(root, "missing.html", Buffer.from(missing))
  const missingHash = sha256(Buffer.from(missing))
  await assert.rejects(
    () =>
      parseDocument(
        root,
        {
          ...source,
          body_path: "missing.html",
          body_sha256: missingHash,
          source_version_id: `${id}:${missingHash}`,
        },
        matches[0].options,
      ),
    /Content selector must identify exactly one element/,
  )
})

test("product profile selects robot control content instead of unrelated promotional copy and suppresses webpage creation dates", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "product-profile-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const oldPython = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    oldPython || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (oldPython === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = oldPython
  })
  const url = "https://toborlife.ai/teleoperations/",
    id = sourceId(url)
  const bytes = Buffer.from(
    '<html><head><meta charset="utf-8"><meta property="article:published_time" content="2026-06-02T13:17:26+00:00"></head><body><nav>Menus</nav><div id="boxed-layout-pro"><section class="tobor-phero"><h1>Tobor Harness™ Teleoperation System</h1><p>G1 Edu control.</p></section><div><section class="tobor-fsec"><h2>Operate</h2><p>Capture synchronized demonstrations for training.</p></section><section id="accessories"><p>Home Dog promotion</p></section></div></div><footer>Contact</footer></body></html>',
  )
  const hash = sha256(bytes)
  atomicWrite(root, "body.html", bytes)
  const matches = JSON.parse(
    fs.readFileSync("data/research-acquisition.json"),
  ).article_profiles.filter((p) => new RegExp(p.url_pattern).test(url))
  assert.equal(matches.length, 1)
  const parsed = await parseDocument(
    root,
    {
      original_url: url,
      final_url: url,
      source_id: id,
      source_version_id: `${id}:${hash}`,
      body_sha256: hash,
      body_path: "body.html",
      fetch_status: "captured",
      mime_type: "text/html",
      observed_at: "2026-10-04T00:00:00Z",
    },
    matches[0].options,
  )
  assert.equal(parsed.status, "extracted")
  assert.equal(parsed.title, "Tobor Harness™ Teleoperation System")
  assert.equal(parsed.dates.published_at, null)
  assert.equal(parsed.dates.modified_at, null)
  assert.deepEqual(
    parsed.blocks.map((b) => b.text),
    [
      "Tobor Harness™ Teleoperation System",
      "G1 Edu control.",
      "Operate",
      "Capture synchronized demonstrations for training.",
    ],
  )
  assert(parsed.blocks.every((b) => b.locator.dom_path && b.locator.text_hash === sha256(b.text)))
})
