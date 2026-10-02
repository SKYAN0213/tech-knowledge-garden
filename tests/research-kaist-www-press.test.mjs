import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { parseDocument } from "../scripts/research/parser.mjs"

const profile = JSON.parse(
  fs.readFileSync("data/research-acquisition.json", "utf8"),
).article_profiles.find((entry) => entry.id === "kaist-www-research-article-v1")

test("KAIST research article profile reads the official registration date", async (t) => {
  assert.ok(profile)
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-kaist-www-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const url = "https://www.kaist.ac.kr/news/html/news/?mode=V&mng_no=67370"
  assert.match(url, new RegExp(profile.url_pattern))
  const html = `<html><body>
    <div class="prog_bord_view">
      <div class="prog_tit"><h1>필요한 곳만 쏙쏙 도핑… 손상 없이 성능 260배 끌어올렸다</h1>
        <div class="prog_stit"><span class="views">조회수: 2803</span><span class="date">등록일: 2026-09-21</span><span class="writer">작성자: 홍보실</span></div>
      </div>
      <div class="prog_contents"><p>KAIST 연구진이 선택적 도핑 기술을 발표했다.</p><p>연구 결과는 2차원 반도체 소자에 적용됐다.</p></div>
    </div>
    <aside><span class="date">등록일: 2026-09-23</span></aside>
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
  assert.equal(parsed.title, "필요한 곳만 쏙쏙 도핑… 손상 없이 성능 260배 끌어올렸다")
  assert.equal(parsed.dates.published_at, "2026-09-21")
  assert.equal(parsed.dates.profile_status, "matched")
  assert.ok(parsed.blocks.some((block) => block.text.includes("KAIST 연구진이 선택적 도핑")))
})
