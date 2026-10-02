import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { parseDocument } from "../scripts/research/parser.mjs"

const profile = JSON.parse(
  fs.readFileSync("data/research-acquisition.json", "utf8"),
).article_profiles.find((entry) => entry.id === "navercorp-press-release-v1")

test("NAVER corporate press profile reads the printed date and article body only", async (t) => {
  assert.ok(profile)
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-navercorp-press-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const url = "https://navercorp.com/media/pressReleasesDetail?seq=10034680"
  assert.match(url, new RegExp(profile.url_pattern))
  const html = `<html><body>
    <div class="navercorp" data-page="press">
      <main id="content"><section class="board-view-wrap">
        <div class="board-view-header"><h2 class="media-press-detail__title">네이버클라우드, 통합 보안 서비스 출시</h2>
          <div class="options"><div class="date media-detail__date">2026.09.22</div><a class="btn-share">공유</a></div>
        </div>
        <div class="board-view-detail"><div id="one-viewer"><div class="se-viewer"><div class="se-main-container">
          <div class="se-component"><p class="se-text-paragraph-align-justify">제품 요약 문장.</p></div>
          <div class="se-component"><p class="se-text-paragraph-align-right">2026-09-22</p></div>
          <div class="se-component"><p class="se-text-paragraph-align-justify">네이버클라우드는 기업용 DB·서버 접근제어 서비스를 출시했다고 밝혔다.</p></div>
        </div></div></div></div>
      </section></main>
    </div>
    <aside class="related"><h2>관련 기사</h2><p>다른 발표 내용.</p><span class="media-detail__date">2026.09.23</span></aside>
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
  assert.equal(parsed.title, "네이버클라우드, 통합 보안 서비스 출시")
  assert.equal(parsed.dates.published_at, "2026-09-22")
  assert.equal(parsed.dates.profile_status, "matched")
  assert.deepEqual(
    parsed.blocks.map((block) => block.text),
    ["제품 요약 문장.", "네이버클라우드는 기업용 DB·서버 접근제어 서비스를 출시했다고 밝혔다."],
  )
})
