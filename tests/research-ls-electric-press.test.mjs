import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { parseDocument } from "../scripts/research/parser.mjs"

const profile = JSON.parse(
  fs.readFileSync("data/research-acquisition.json", "utf8"),
).article_profiles.find((entry) => entry.id === "ls-electric-press-detail-v1")

test("LS Electric press profile reads the article header date and excludes neighboring items", async (t) => {
  assert.ok(profile)
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-ls-electric-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const url =
    "https://lsholdings.co.kr/ko/media/news/306c38774167465a5137683163335633354a6952646459724d77734f74753645"
  assert.match(url, new RegExp(profile.url_pattern))
  const html = `<html><body><div class="newsView">
    <div class="titArea"><h3 class="tit">LS ELECTRIC, 4족 보행로봇으로 스마트팩토리 고도화 나선다</h3><span class="company">LS ELECTRIC</span><span class="date">2026-09-22</span></div>
    <div class="viewCon"><div class="wrap_editor">
      <p>LS일렉트릭이 생산 현장에 보행로봇을 도입한다고 밝혔다.</p>
      <p>부산사업장에서 Spot 2대를 정식 운용하고 있다.</p>
    </div><div class="share_sns"><button>공유</button></div></div>
  </div><div class="list_thumb"><p class="tit">다른 보도자료</p><span class="date">2026-09-23</span></div></body></html>`
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
  assert.equal(parsed.title, "LS ELECTRIC, 4족 보행로봇으로 스마트팩토리 고도화 나선다")
  assert.equal(parsed.dates.published_at, "2026-09-22")
  assert.equal(parsed.dates.profile_status, "matched")
  assert.deepEqual(
    parsed.blocks.map((block) => block.text),
    [
      "LS일렉트릭이 생산 현장에 보행로봇을 도입한다고 밝혔다.",
      "부산사업장에서 Spot 2대를 정식 운용하고 있다.",
    ],
  )
})
