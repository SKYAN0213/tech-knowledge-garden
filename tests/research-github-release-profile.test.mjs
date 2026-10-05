import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { parseDocument } from "../scripts/research/parser.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"

const profiles = JSON.parse(fs.readFileSync("data/research-acquisition.json")).article_profiles
const profile = profiles.find((p) => p.id === "github-release-detail-v1")
const html = `<html><head><title>Release · repository</title></head><body>
<p>You signed in with another tab or window. Reload to refresh your session.</p>
<main><h1>ai@7.0.25</h1><dialog-helper><dialog><h1>Choose a tag to compare</h1></dialog></dialog-helper>
<relative-time class="no-wrap" datetime="2026-07-13T21:32:40Z">Release</relative-time>
<relative-time datetime="2026-07-13 21:26:28 UTC">Commit signature</relative-time>
<div class="markdown-body"><h2>Patch Changes</h2><ul><li>Cancellation aborts pending setup.</li><li>Tracing retains the parent span.</li></ul></div>
</main></body></html>`

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "github-release-profile-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return async (raw = html, url = "https://github.com/vercel/ai/releases/tag/ai%407.0.25") => {
    const bytes = Buffer.from(raw),
      hash = sha256(bytes),
      id = sourceId(url)
    atomicWrite(root, "body.html", bytes)
    return parseDocument(
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
        observed_at: "2026-10-05T07:00:00Z",
      },
      profile.options,
    )
  }
}

test("shared release profile isolates changelog and exact header timestamp for different repositories", async (t) => {
  const parse = fixture(t)
  for (const url of [
    "https://github.com/vercel/ai/releases/tag/ai%407.0.25",
    "https://github.com/openai/codex/releases/tag/rust-v0.145.0-alpha.7",
  ]) {
    assert.equal(profiles.filter((p) => new RegExp(p.url_pattern).test(url)).length, 1)
    const result = await parse(html, url)
    assert.equal(result.status, "extracted")
    assert.equal(result.title, "ai@7.0.25")
    assert.equal(result.dates.published_at, "2026-07-13T21:32:40Z")
    assert.equal(result.dates.precision, "timestamp")
    assert.deepEqual(
      result.blocks.map((b) => b.text),
      ["Patch Changes", "Cancellation aborts pending setup.", "Tracing retains the parent span."],
    )
    assert.ok(
      result.blocks.every((b) => b.locator.dom_path && b.locator.text_hash === sha256(b.text)),
    )
  }
  assert.equal(
    profiles.filter((p) =>
      new RegExp(p.url_pattern).test("https://github.com/NVIDIA/NemoClaw/releases/tag/v0.0.115"),
    )[0].id,
    "nemoclaw-github-v0-0-115-release",
  )
})

test("missing or ambiguous bodies, titles and release dates cannot fall back to the login banner", async (t) => {
  const parse = fixture(t)
  await assert.rejects(
    parse(html.replace('class="markdown-body"', 'class="missing-body"')),
    /Content selector/,
  )
  await assert.rejects(
    parse(html.replace("</main>", '<div class="markdown-body"><p>other body</p></div></main>')),
    /Content selector/,
  )
  const noTitle = await parse(html.replace("<h1>ai@7.0.25</h1>", ""))
  assert.equal(noTitle.status, "partial")
  assert.equal(noTitle.title, null)
  const missing = await parse(html.replace('class="no-wrap"', 'class="other"'))
  // Body extraction and date eligibility are separate existing contracts.
  // A missing header must retain null, never use the commit signature date.
  assert.equal(missing.dates.profile_status, "missing")
  assert.equal(missing.dates.published_at, null)
  const duplicate = await parse(
    html.replace(
      "</main>",
      '<relative-time class="no-wrap" datetime="2026-07-13T22:00:00Z">other</relative-time></main>',
    ),
  )
  assert.equal(duplicate.dates.profile_status, "ambiguous")
  assert.equal(duplicate.dates.published_at, null)
})
