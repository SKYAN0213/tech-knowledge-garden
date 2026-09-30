import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { registry, candidatesFromLinks } from "../scripts/research/discovery.mjs"
import { assessSinglePageIndex, scanSinglePageRoute } from "../scripts/research/list-scan.mjs"
import { parseDocument } from "../scripts/research/parser.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { validateDailyRoutes } from "../scripts/research/daily-plan.mjs"

const acquisition = JSON.parse(fs.readFileSync("data/research-acquisition.json", "utf8"))
const channels = JSON.parse(fs.readFileSync("data/research-source-channels.json", "utf8"))
const watchlist = JSON.parse(fs.readFileSync("data/research-watchlist.json", "utf8"))
const route = registry(channels, watchlist, acquisition).find(
  (entry) => entry.channel_id === "kaist-robotics-research",
)
const aiRoute = registry(channels, watchlist, acquisition).find(
  (entry) => entry.channel_id === "kaist-ai-research",
)
const profile = acquisition.article_profiles.find(
  (entry) => entry.id === "kaist-research-news-article-v1",
)
const articleURL = "https://news.kaist.ac.kr/researchnews/html/news/?mode=V&mng_no=67550&GotoPage=1"

function temporary(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-kaist-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const previous = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previous || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (previous === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previous
  })
  return root
}

function stored(root, url, html) {
  const bytes = Buffer.from(html)
  const id = sourceId(url)
  const digest = sha256(bytes)
  const body_path = `originals/${id}-${digest}.html`
  fs.mkdirSync(path.join(root, "originals"), { recursive: true })
  fs.writeFileSync(path.join(root, body_path), bytes)
  return {
    original_url: url,
    final_url: url,
    source_id: id,
    source_version_id: `${id}:${digest}`,
    body_path,
    body_sha256: digest,
    observed_at: "2026-09-29T00:00:00Z",
    fetch_status: "captured",
  }
}

const listing = `<html><head><title>연구뉴스</title></head><body>
  <div class="prog_bord prog_bord_list"><div class="board"><ul>
    <li><a class="lay" href="?mode=V&amp;mng_no=67550&amp;GotoPage=1&amp;skey=keyword&amp;sval=%eb%a1%9c%eb%b4%87">
      <strong class="tis">사족보행로봇, 마라톤 완주 기술 발표</strong><span class="date">2026.09.28</span></a></li>
    <li><a class="lay" href="?mode=V&amp;mng_no=67110&amp;GotoPage=1&amp;skey=keyword&amp;sval=%eb%a1%9c%eb%b4%87">
      <strong class="tis">이전 로봇 연구</strong><span class="date">2026.09.16</span></a></li>
  </ul></div></div></body></html>`
const detail = `<html><head><title>연구뉴스</title></head><body>
  <div class="prog_bord prog_bord_view"><div class="prog_tit">
    <strong>사족보행로봇, 마라톤 완주 기술 발표&#8203;</strong>
    <span class="date">등록일 : 2026-09-28</span></div>
    <div class="prog_contents"><div class="txt_box">
      <p>KAIST 연구팀이 사족보행로봇의 마라톤 완주 결과를 발표했다.</p>
      <p>연구팀은 전압과 온도, 배터리 상태를 기록했다.</p>
      <p><img src="image.jpg" alt="사진"></p>
    </div></div></div></body></html>`

test("KAIST robotics route uses a dated Korean research filter and exact article identity", async (t) => {
  const root = temporary(t)
  assert.equal(route.region, "국내")
  assert.equal(route.axis, "기술·제품")
  assert.deepEqual(route.sectors, ["로봇·제조"])
  assert.equal(route.listing_profile.require_title_match, true)
  const daily = JSON.parse(fs.readFileSync("data/research-daily-routes.json", "utf8"))
  assert.deepEqual(
    validateDailyRoutes(daily, registry(channels, watchlist, acquisition)).find(
      (entry) => entry.channel_id === route.channel_id,
    ),
    {
      channel_id: route.channel_id,
      enabled: true,
      baseline_run: "20260929-kaist-robotics-sep22-window-v4",
      route,
    },
  )
  assert.match(articleURL, new RegExp(profile.url_pattern))
  const parsed = await parseDocument(root, stored(root, route.url, listing), route.parse_options)
  const covered = assessSinglePageIndex(parsed, route, "2026-09-22", "2026-09-29")
  assert.equal(covered.status, "window_covered")
  assert.equal(covered.window_items, 1)
  assert.equal(covered.older_items, 1)
  assert.equal(covered.links[0].url, articleURL)
  const empty = assessSinglePageIndex(parsed, route, "2026-09-29", "2026-09-30")
  assert.equal(empty.status, "window_covered")
  assert.equal(empty.window_items, 0)
  assert.equal(
    assessSinglePageIndex(parsed, route, "2026-09-01", "2026-09-29").reason,
    "cutoff_not_reached",
  )
  const candidate = candidatesFromLinks(covered.links, route, "2026-09-29T00:00:00Z")
  assert.equal(candidate.length, 1)
  assert.equal(
    candidate[0].source_urls[0],
    "https://news.kaist.ac.kr/researchnews/html/news/?GotoPage=1&mng_no=67550&mode=V",
  )
  const bad = listing.replace("2026.09.28", "not a date")
  const invalid = await parseDocument(root, stored(root, route.url, bad), route.parse_options)
  assert.equal(
    assessSinglePageIndex(invalid, route, "2026-09-22", "2026-09-29").reason,
    "listing_item_missing_identity_or_date",
  )
})

test("KAIST full article date and title must agree before a candidate is accepted", async (t) => {
  const root = temporary(t)
  const documents = new Map([
    [route.url, stored(root, route.url, listing)],
    [articleURL, stored(root, articleURL, detail)],
  ])
  const scan = () =>
    scanSinglePageRoute(
      root,
      { stage: (_name, _input, action) => action() },
      {},
      route,
      [profile],
      { since: "2026-09-22", until: "2026-09-29" },
      { fetchPolicy: async (_root, _fetcher, url) => documents.get(url) },
    )
  const completed = await scan()
  assert.equal(completed.summary.status, "window_scanned")
  assert.equal(completed.candidates.length, 1)
  assert.deepEqual(
    completed.parses
      .find((item) => item.source_id === sourceId(articleURL))
      .blocks.map((block) => block.text),
    [
      "KAIST 연구팀이 사족보행로봇의 마라톤 완주 결과를 발표했다.",
      "연구팀은 전압과 온도, 배터리 상태를 기록했다.",
    ],
  )
  documents.set(articleURL, stored(root, articleURL, detail.replace("2026-09-28", "2026-09-27")))
  const wrongDate = await scan()
  assert.equal(wrongDate.summary.status, "incomplete")
  assert.equal(wrongDate.summary.details[0].status, "date_conflict")
  documents.set(
    articleURL,
    stored(root, articleURL, detail.replace("완주 기술 발표", "실험 결과 발표")),
  )
  const wrongTitle = await scan()
  assert.equal(wrongTitle.summary.status, "incomplete")
  assert.equal(wrongTitle.summary.details[0].status, "title_conflict")
})

test("KAIST AI keyword route reuses the dated-list scanner and shared article profile", async (t) => {
  const root = temporary(t)
  const aiArticleURL =
    "https://news.kaist.ac.kr/researchnews/html/news/?mode=V&mng_no=67670&GotoPage=1"
  const aiListing = `<html><head><title>연구뉴스</title></head><body>
    <div class="prog_bord prog_bord_list"><div class="board"><ul>
      <li><a class="lay" href="?mode=V&amp;mng_no=67670&amp;GotoPage=1&amp;skey=keyword&amp;sval=AI">
        <strong class="tis">움직임의 흐름 읽는 AI 반도체 개발</strong><span class="date">2026.09.29</span></a></li>
      <li><a class="lay" href="?mode=V&amp;mng_no=67310&amp;GotoPage=1&amp;skey=keyword&amp;sval=AI">
        <strong class="tis">이전 AI 연구</strong><span class="date">2026.09.21</span></a></li>
    </ul></div></div></body></html>`
  const aiDetail = `<html><head><title>연구뉴스</title></head><body>
    <div class="prog_bord prog_bord_view"><div class="prog_tit">
      <strong>움직임의 흐름 읽는 AI 반도체 개발&#8203;</strong>
      <span class="date">등록일 : 2026-09-29</span></div>
      <div class="prog_contents"><div class="txt_box">
        <p>KAIST 연구팀이 새로운 AI 반도체 연구 결과를 발표했다.</p>
      </div></div></div></body></html>`
  const documents = new Map([
    [aiRoute.url, stored(root, aiRoute.url, aiListing)],
    [aiArticleURL, stored(root, aiArticleURL, aiDetail)],
  ])
  const daily = JSON.parse(fs.readFileSync("data/research-daily-routes.json", "utf8"))
  assert.equal(aiRoute.region, "국내")
  assert.deepEqual(aiRoute.sectors, ["AI"])
  assert.equal(aiRoute.listing_profile.pagination, "single-page")
  assert.equal(
    validateDailyRoutes(daily, registry(channels, watchlist, acquisition)).find(
      (entry) => entry.channel_id === aiRoute.channel_id,
    ).baseline_run,
    "20260930-kaist-ai-sep22-window-v1",
  )
  assert.match(aiArticleURL, new RegExp(profile.url_pattern))
  const scan = (since, until) =>
    scanSinglePageRoute(
      root,
      { stage: (_name, _input, action) => action() },
      {},
      aiRoute,
      [profile],
      { since, until },
      { fetchPolicy: async (_root, _fetcher, url) => documents.get(url) },
    )
  const covered = await scan("2026-09-22", "2026-09-30")
  assert.equal(covered.summary.status, "window_scanned")
  assert.equal(covered.summary.assessment.older_items, 1)
  assert.equal(covered.candidates.length, 1)
  assert.equal(covered.candidates[0].source_published_at, "2026-09-29")
  assert.equal(covered.parses.at(-1).blocks.length, 1)
  const empty = await scan("2026-09-30", "2026-10-01")
  assert.equal(empty.summary.status, "window_scanned")
  assert.equal(empty.candidates.length, 0)
})
