import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { parseDocument } from "../scripts/research/parser.mjs"

const profile = JSON.parse(
  fs.readFileSync("data/research-acquisition.json", "utf8"),
).article_profiles.find((entry) => entry.id === "kakao-press-detail-v1")

test("Kakao press profile reads its own date and body, excluding related articles", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-kakao-press-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const url = "https://www.kakaocorp.com/page/detail/12150"
  const html = `<html><body><main><article>
    <div class="wrap_title"><div><span class="text_date">2026.09.29</span><h3 class="tit_detail">AI 안전성 평가 협약</h3></div></div>
    <div class="content"><div class="wrap_cont"><p>카카오는 28일 연구소와 업무협약을 체결했다고 29일 발표했다.</p><p>양측은 평가 도구를 개발할 계획이다.</p></div></div>
    <div class="related"><span class="text_date">2026.09.28</span><h3>다른 기사</h3><p>관련 기사 설명</p></div>
  </article></main></body></html>`
  const bytes = Buffer.from(html)
  const id = sourceId(url)
  const hash = sha256(bytes)
  fs.mkdirSync(path.join(root, "originals"))
  fs.writeFileSync(path.join(root, "originals/article.html"), bytes)
  const previousPython = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previousPython || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (previousPython === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previousPython
  })
  assert.match(url, new RegExp(profile.url_pattern))
  const parsed = await parseDocument(
    root,
    {
      original_url: url,
      final_url: url,
      source_id: id,
      source_version_id: `${id}:${hash}`,
      body_path: "originals/article.html",
      body_sha256: hash,
      observed_at: "2026-09-29T12:00:00Z",
      fetch_status: "captured",
    },
    profile.options,
  )
  assert.equal(parsed.status, "extracted")
  assert.equal(parsed.title, "AI 안전성 평가 협약")
  assert.equal(parsed.dates.published_at, "2026-09-29")
  assert.equal(parsed.dates.profile_status, "matched")
  assert.deepEqual(
    parsed.blocks.map((block) => block.text),
    [
      "카카오는 28일 연구소와 업무협약을 체결했다고 29일 발표했다.",
      "양측은 평가 도구를 개발할 계획이다.",
    ],
  )
})
