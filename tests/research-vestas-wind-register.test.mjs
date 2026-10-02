import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { parseDocument } from "../scripts/research/parser.mjs"

const profile = JSON.parse(
  fs.readFileSync("data/research-acquisition.json", "utf8"),
).article_profiles.find((entry) => entry.id === "vestas-wind-order-register-v1")

test("Vestas order register profile reads the current-year quarter tables only", async (t) => {
  assert.ok(profile)
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-vestas-register-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const url = "https://www.vestas.com/en/investor/announcements/wind-turbines-orders"
  assert.match(url, new RegExp(profile.url_pattern))
  const html = `<html><body><main>
    <h1>Wind turbine orders</h1>
    <div class="cmp-accordion">
      <div class="cmp-accordion__item"><h2>Third quarter 2026</h2><table>
        <tr><td>Date</td><td>Title</td><td>MW</td></tr>
        <tr><td>16-09-26</td><td>Vestas announces three new orders for a total of 119 MW</td><td>119</td></tr>
      </table></div>
      <div class="cmp-accordion__item"><h2>Fourth quarter 2026</h2><table>
        <tr><td>22-09-26</td><td>Vestas announces new order in Germany</td><td>48</td></tr>
      </table></div>
    </div>
    <div class="cmp-accordion"><div class="cmp-accordion__item"><h2>2025 archive</h2><table>
      <tr><td>30-09-25</td><td>Archived order</td><td>25</td></tr>
    </table></div></div>
  </main></body></html>`
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
  assert.equal(parsed.title, "Wind turbine orders")
  assert.equal(parsed.blocks.length, 2)
  assert.match(parsed.blocks[0].text, /16-09-26.*119 MW/s)
  assert.match(parsed.blocks[1].text, /22-09-26.*48/s)
  assert.ok(parsed.blocks.every((block) => !block.text.includes("Archived order")))
})
