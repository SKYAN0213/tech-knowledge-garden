import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { registry } from "../scripts/research/discovery.mjs"
import { scanSinglePageRoute } from "../scripts/research/list-scan.mjs"
import { validateDailyRoutes } from "../scripts/research/daily-plan.mjs"

const acquisition = JSON.parse(fs.readFileSync("data/research-acquisition.json", "utf8"))
const channels = JSON.parse(fs.readFileSync("data/research-source-channels.json", "utf8"))
const watchlist = JSON.parse(fs.readFileSync("data/research-watchlist.json", "utf8"))
const routes = registry(channels, watchlist, acquisition)
const route = routes.find((entry) => entry.channel_id === "kier-energy-press")
const profile = acquisition.article_profiles.find(
  (entry) => entry.id === "kier-energy-press-article-v1",
)
const articleURL =
  "https://energium.kier.re.kr/sub040101/articles/view/tableid/news/category/2/id/6809"

function stored(root, url, body) {
  const bytes = Buffer.from(body)
  const id = sourceId(url)
  const digest = sha256(bytes)
  const body_path = `source-${id}-${digest}.html`
  fs.writeFileSync(path.join(root, body_path), bytes)
  return {
    original_url: url,
    final_url: url,
    source_id: id,
    source_version_id: `${id}:${digest}`,
    body_path,
    body_sha256: digest,
    observed_at: "2026-09-30T00:00:00Z",
    fetch_status: "captured",
  }
}

const listing = `<html><head><title>KIER 보도자료</title></head><body>
  <div class="board-list"><table class="board_table"><tbody>
    <tr><td><a href="/sub040101/articles/view/tableid/news/category/2/id/6809">에너지연, 제20대 정학근 원장 취임</a></td><td class="icon-date">2026.09.23</td></tr>
    <tr><td><a href="/sub040101/articles/view/tableid/news/category/2/id/6790">이전 보도자료</a></td><td class="icon-date">2026.09.15</td></tr>
  </tbody></table></div></body></html>`
const article = (date = "2026.09.23", title = "에너지연, 제20대 정학근 원장 취임") =>
  `<html><head><title>KIER 보도자료</title></head><body>
  <div class="board_view"><h2 class="th_stitle">${title}</h2>
    <ul class="basic_info"><li><span>작성일</span> ${date}</li></ul>
    <div class="view_content"><table class="txc-wrapper"><tr><td>
      <p>한국에너지기술연구원이 새 원장 취임식을 열었다.</p>
      <p>연구원은 대전 본원에서 행사를 진행했다고 밝혔다.</p>
    </td></tr></table></div>
  </div></body></html>`

test("KIER press route reuses the dated-list scanner and rejects conflicting details", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-kier-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const previous = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previous || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (previous === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previous
  })

  assert.equal(route.listing_profile.pagination, "single-page")
  assert.equal(route.listing_profile.require_title_match, true)
  assert.deepEqual(route.sectors, ["에너지·기후기술"])
  assert.match(articleURL, new RegExp(profile.url_pattern))
  assert.equal(
    validateDailyRoutes(
      JSON.parse(fs.readFileSync("data/research-daily-routes.json", "utf8")),
      routes,
    ).find((entry) => entry.channel_id === route.channel_id).baseline_run,
    "20260930-kier-energy-sep23-window-v1",
  )

  const documents = new Map([
    [route.url, stored(root, route.url, listing)],
    [articleURL, stored(root, articleURL, article())],
  ])
  const scan = (since, until) =>
    scanSinglePageRoute(
      root,
      { stage: (_name, _input, action) => action() },
      {},
      route,
      [profile],
      { since, until },
      { fetchPolicy: async (_root, _fetcher, url) => documents.get(url) },
    )

  const covered = await scan("2026-09-23", "2026-09-30")
  assert.equal(covered.summary.status, "window_scanned")
  assert.equal(covered.summary.assessment.older_items, 1)
  assert.equal(covered.candidates.length, 1)
  assert.equal(covered.candidates[0].source_published_at, "2026-09-23")
  assert.deepEqual(
    covered.parses.at(-1).blocks.map((block) => block.text),
    [
      "한국에너지기술연구원이 새 원장 취임식을 열었다.",
      "연구원은 대전 본원에서 행사를 진행했다고 밝혔다.",
    ],
  )
  const empty = await scan("2026-09-30", "2026-10-01")
  assert.equal(empty.summary.status, "window_scanned")
  assert.equal(empty.candidates.length, 0)
  assert.equal((await scan("2026-09-15", "2026-09-30")).summary.reason, "cutoff_not_reached")

  documents.set(articleURL, stored(root, articleURL, article("2026.09.22")))
  const wrongDate = await scan("2026-09-23", "2026-09-30")
  assert.equal(wrongDate.summary.status, "incomplete")
  assert.equal(wrongDate.summary.details[0].status, "date_conflict")
  documents.set(articleURL, stored(root, articleURL, article("2026.09.23", "다른 제목")))
  const wrongTitle = await scan("2026-09-23", "2026-09-30")
  assert.equal(wrongTitle.summary.status, "incomplete")
  assert.equal(wrongTitle.summary.details[0].status, "title_conflict")
})
