import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { parseDocument } from "../scripts/research/parser.mjs"

const profile = JSON.parse(
  fs.readFileSync("data/research-acquisition.json", "utf8"),
).article_profiles.find((entry) => entry.id === "intrinsic-ai-for-industry-article-v1")

test("Intrinsic article profile reads the exact article date from its carousel label", async (t) => {
  assert.ok(profile)
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-intrinsic-press-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const url = "https://www.intrinsic.ai/blog/posts/ai-for-industry-challenge"
  assert.match(url, new RegExp(profile.url_pattern))
  const html = `<html><body>
    <div class="intr-full-media-carousel-label intr-spacing-200-margin-bottom">
      <p class="intr-eyebrow intr-spacing-100-margin-bottom">September 22, 2026</p>
      <h2 class="intr-heading-h1">Robotics is hard - it’s much easier when 5,000 developers get involved</h2>
    </div>
    <main><div class="intr-content"><p>Intrinsic described its AI for Industry Challenge.</p></div></main>
    <aside><p class="intr-eyebrow">Related story</p></aside>
  </body></html>`
  const bytes = Buffer.from(html)
  const id = sourceId(url)
  const hash = sha256(bytes)
  fs.writeFileSync(path.join(root, "source.html"), bytes)
  const previousPython = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previousPython || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (previousPython === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previousPython
  })

  const parsed = await parseDocument(
    root,
    {
      original_url: url,
      final_url: url,
      source_id: id,
      source_version_id: `${id}:${hash}`,
      body_path: "source.html",
      body_sha256: hash,
      observed_at: "2026-10-02T00:00:00Z",
      fetch_status: "captured",
    },
    profile.options,
  )

  assert.equal(parsed.status, "extracted")
  assert.equal(
    parsed.title,
    "Robotics is hard - it’s much easier when 5,000 developers get involved",
  )
  assert.equal(parsed.dates.published_at, "2026-09-22")
  assert.equal(parsed.dates.profile_status, "matched")
  assert.ok(
    parsed.blocks.some(
      (block) => block.text === "Intrinsic described its AI for Industry Challenge.",
    ),
  )
})
