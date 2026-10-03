import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { parseDocument } from "../scripts/research/parser.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"

const profiles = JSON.parse(fs.readFileSync("data/research-acquisition.json")).article_profiles
const python = path.resolve(".local/research/local-ai/runtime/venv/bin/python")

for (const [name, url, html] of [
  [
    "ndsoft-korean-news-article-v1",
    "https://www.irobotnews.com/news/articleView.html?idxno=1",
    '<meta property="article:published_time" content="2026-10-02T18:19:11+09:00"><h1 class="heading">확인한 기사 제목</h1><div class="article-body"><style>unrelated CSS</style><p>확인한 본문.</p><script>tracking code</script></div>',
  ],
  [
    "ndsoft-korean-news-article-v1",
    "https://www.thelec.kr/news/articleView.html?idxno=2",
    '<meta property="article:published_time" content="2026-10-02T09:00:00+09:00"><h1 class="heading"><strong class="user-point">단독</strong> 확인한 <em>기사</em> 제목</h1><div class="article-body"><p>확인한 본문.</p></div>',
  ],
  [
    "etnews-korean-news-article-v1",
    "https://www.etnews.com/20261002000001",
    '<meta property="article:published_time" content="2026-10-02T08:00:00+09:00"><h2 id="article_title_h2">확인한 기사 제목</h2><div id="articleBody"><p>확인한 본문.</p></div>',
  ],
  [
    "kisa-security-advisory-ko-v1",
    "https://www.krcert.or.kr/kr/bbs/view.do?bbsId=B0000133&nttId=1",
    '<div class="board"><header><div class="b_title"><h2>확인한 기사 제목</h2><span>2026-10-02</span></div></header><div class="content"><div><p>확인한 본문.</p></div><div>첨부 메뉴</div></div><ul><li>이전 기사</li></ul></div>',
  ],
  [
    "kitech-press-article-ko-v1",
    "https://www.kitech.re.kr/pages/61?id=1&menuMode=READ",
    '<div class="board-view"><p class="tit">확인한 기사 제목</p><span id="infoDate">2026-10-02</span><div class="ck-content"><p>확인한 본문.</p></div></div>',
  ],
]) {
  test(`${name} isolates title, original body and publication date for ${new URL(url).hostname}`, async (t) => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "korean-source-profile-")))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    const oldPython = process.env.RESEARCH_PYTHON
    process.env.RESEARCH_PYTHON = oldPython || python
    t.after(() => {
      if (oldPython === undefined) delete process.env.RESEARCH_PYTHON
      else process.env.RESEARCH_PYTHON = oldPython
    })
    const bytes = Buffer.from(
      `<html><head><meta charset="utf-8"><title>사이트 메뉴</title></head><body><nav>구독 안내</nav>${html}<footer>사이트 소개</footer></body></html>`,
    )
    fs.mkdirSync(path.join(root, "originals"))
    fs.writeFileSync(path.join(root, "originals/test.html"), bytes)
    const id = sourceId(url),
      hash = sha256(bytes)
    const document = {
      original_url: url,
      final_url: url,
      source_id: id,
      source_version_id: `${id}:${hash}`,
      body_path: "originals/test.html",
      body_sha256: hash,
      fetch_status: "captured",
      observed_at: "2026-10-03T00:00:00Z",
      mime_type: "text/html; charset=utf-8",
    }
    const matches = profiles.filter((profile) => new RegExp(profile.url_pattern).test(url))
    assert.equal(matches.length, 1)
    assert.equal(matches[0].id, name)
    const parsed = await parseDocument(root, document, matches[0].options)
    assert.equal(parsed.status, "extracted")
    assert.equal(parsed.title, "확인한 기사 제목")
    assert.equal(parsed.dates.published_at, "2026-10-02")
    assert.equal(parsed.dates.profile_status, "matched")
    assert.deepEqual(
      parsed.blocks.map((block) => block.text),
      ["확인한 본문."],
    )
  })
}
