import test from "node:test"
import assert from "node:assert/strict"
import { articleCard, sectorTabs } from "../scripts/reader-cards.mjs"
const a = {
  id: "1234567890abcdef",
  title: "기사",
  summary: "사실",
  sector: "로봇·제조",
  urls: ["https://example.com/news"],
  classification: { theme: "제품·서비스", entities: ["A & B"], event_tags: ["신제품"] },
  review: { published_at: "2026-09-03" },
}
test("cards preserve publication date, sources and escaped filter links", () => {
  const s = articleCard(a, (p) => "/" + p)
  assert.match(s, /발표 2026.09.03/)
  assert.match(s, /#신제품/)
  assert.match(s, /A &amp; B/)
  assert.match(s, /entity=A/)
  assert.ok(s.indexOf("<h3>") < s.indexOf("<time"))
  assert.match(s, /https:\/\/example.com\/news/)
})
test("tabs include only populated sectors without inventing analysis", () => {
  assert.equal(sectorTabs([], "/news"), "")
  const s = sectorTabs([a, a], "/news")
  assert.equal((s.match(/data-sector-tab=/g) || []).length, 2)
  assert.ok(!s.includes("심층"))
})
import { makeResolver } from "../scripts/links.mjs"
test("literal percent in article titles remains a valid alias", () => {
  const r = makeResolver([{ path: "News/stable", meta: { title: "요청 95% 처리" } }])
  assert.equal(r("요청 95% 처리", "News/other").note.path, "News/stable")
})
import { matchesNews } from "../web/news-filter.mjs"
test("deep navigation only appears for authored analysis and composes with other filters", () => {
  const deep = { ...a, editorial: { kind: "기업 전략" } }
  assert.match(sectorTabs([deep], "/news"), /data-deep-tab/)
  assert.equal(matchesNews({ deep: false }, { kind: "deep" }), false)
  assert.equal(
    matchesNews({ deep: true, sector: a.sector }, { kind: "deep", sector: a.sector }),
    true,
  )
})
