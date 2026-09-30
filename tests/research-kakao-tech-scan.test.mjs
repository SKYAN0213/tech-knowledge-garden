import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { registry } from "../scripts/research/discovery.mjs"
import { scanBoundedRSSRoute } from "../scripts/research/rss-scan.mjs"
import { validateDailyRoutes } from "../scripts/research/daily-plan.mjs"

const acquisition = JSON.parse(fs.readFileSync("data/research-acquisition.json", "utf8"))
const channels = JSON.parse(fs.readFileSync("data/research-source-channels.json", "utf8"))
const watchlist = JSON.parse(fs.readFileSync("data/research-watchlist.json", "utf8"))
const routes = registry(channels, watchlist, acquisition)
const route = routes.find((item) => item.channel_id === "kakao-tech-blog")
const profile = acquisition.article_profiles.find(
  (item) => item.id === "kakao-tech-blog-article-v1",
)
const articleURL = "https://tech.kakao.com/posts/837"

function stored(root, url, body) {
  const bytes = Buffer.from(body)
  const id = sourceId(url)
  const hash = sha256(bytes)
  const body_path = `source-${id}-${hash}.bin`
  fs.writeFileSync(path.join(root, body_path), bytes)
  return {
    original_url: url,
    final_url: url,
    source_id: id,
    source_version_id: `${id}:${hash}`,
    body_path,
    body_sha256: hash,
    observed_at: "2026-09-30T00:00:00Z",
    fetch_status: "captured",
  }
}

test("Kakao Tech reuses the bounded RSS scanner and checks its indexed article body", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-kakao-tech-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const previous = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previous || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (previous === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previous
  })
  assert.equal(route.listing_profile.date_timezone, "Asia/Seoul")
  assert.equal(route.method, "rss")
  assert.equal(
    validateDailyRoutes(
      JSON.parse(fs.readFileSync("data/research-daily-routes.json", "utf8")),
      routes,
    ).find((item) => item.channel_id === route.channel_id).baseline_run,
    "20260930-kakao-tech-sep23-window-v2",
  )
  assert.match(articleURL, new RegExp(profile.url_pattern))
  const feed = `<rss version="2.0"><channel><title>tech.kakao.com</title>
    <item><title>개인화 추천을 위한 랭킹 모델 개발기</title><link>${articleURL}</link><guid>${articleURL}</guid><pubDate>Tue, 22 Sep 2026 15:00:00 GMT</pubDate></item>
    <item><title>이전 기술 글</title><link>https://tech.kakao.com/posts/836</link><guid>https://tech.kakao.com/posts/836</guid><pubDate>Thu, 17 Sep 2026 01:00:00 GMT</pubDate></item>
  </channel></rss>`
  const values = [
    null,
    { id: 2, title: 3, releaseDate: 4, content: 5 },
    837,
    "개인화 추천을 위한 랭킹 모델 개발기",
    "2026.09.23",
    "<p>카카오가 개인화 추천 랭킹 모델을 설명했다.</p><h2>시스템 구조</h2><p>피처 파이프라인과 추론 서버를 구성했다.</p>",
  ]
  const article = (items) => `<html lang="ko"><head><title>기술 블로그</title></head><body>
    <main><h1>개인화 추천을 위한 랭킹 모델 개발기</h1><div class="preview"></div></main>
    <script id="__NUXT_DATA__" type="application/json">${JSON.stringify(items)}</script></body></html>`
  const documents = new Map([
    [route.url, stored(root, route.url, feed)],
    [articleURL, stored(root, articleURL, article(values))],
  ])
  const scan = (since, until) =>
    scanBoundedRSSRoute(
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
      "카카오가 개인화 추천 랭킹 모델을 설명했다.",
      "시스템 구조",
      "피처 파이프라인과 추론 서버를 구성했다.",
    ],
  )
  const empty = await scan("2026-09-30", "2026-10-01")
  assert.equal(empty.summary.status, "window_scanned")
  assert.equal(empty.candidates.length, 0)
  const changed = [...values]
  changed[4] = "2026.09.24"
  documents.set(articleURL, stored(root, articleURL, article(changed)))
  const conflict = await scan("2026-09-23", "2026-09-30")
  assert.equal(conflict.summary.status, "incomplete")
  assert.equal(conflict.summary.details[0].status, "date_conflict")
})
