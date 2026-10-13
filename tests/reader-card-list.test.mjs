import test from "node:test"
import assert from "node:assert/strict"
import { fromHtml } from "hast-util-from-html"
import { articleCard } from "../scripts/reader-cards.mjs"
import { weeklyView } from "../scripts/reader-knowledge-views.mjs"
import { readerListLimit, bindReaderList } from "../web/reader-list.mjs"
import { bindReaderExplore } from "../web/reader-explore.mjs"

const href = (path) => "/garden/" + path
const a = {
  id: "1234567890abcdef",
  title: "회사의 확인한 로봇 발표",
  summary: "회사는 2026년 10월 7일 로봇을 발표했다. 고객 시험은 12회이며 생산 확대는 계획 단계다.",
  sector: "로봇·제조",
  urls: ["https://fixture.example/source"],
  review: { published_at: "2026-10-07" },
  edition: { meta: { date: "2026-10-08" } },
  classification: { theme: "제품·서비스", entities: ["FANUC", "고객"], event_tags: ["실증·재현"] },
  conceptLinks: [{ path: "Knowledge/Robotics/Control", label: "제어 기법" }],
}
function nodes(html, predicate) {
  const found = []
  const visit = (node) => {
    if (predicate(node)) found.push(node)
    for (const child of node.children || []) visit(child)
  }
  visit(fromHtml(html))
  return found
}
const text = (node) =>
  node.type === "text" ? node.value : (node.children || []).map(text).join("")

test("compact cards show three tags and retain complete lead, remaining tags and specialist links in a closed native disclosure", () => {
  const html = articleCard(a, href)
  const row = nodes(html, (n) => n.tagName === "article")[0]
  assert.ok(row.properties.className.includes("reader-card"))
  const tags = row.children.find((n) => n.properties?.className?.includes("news-labels"))
  assert.equal(tags.children.length, 3)
  const detail = nodes(html, (n) => n.tagName === "details")[0]
  assert.ok(detail)
  assert.equal(detail.properties.open, undefined)
  assert.match(text(detail), /생산 확대는 계획 단계다/)
  assert.match(text(detail), /#고객|#실증·재현|#제어기법/)
  assert.match(html, /href="\/garden\/Knowledge\/Robotics\/Control"/)
  assert.match(html, /datetime="2026-10-07"/)
  assert.match(html, /브리핑 발행 2026.10.08/)
  assert.match(html, /https:\/\/fixture.example\/source/)
})

test("expanded briefing articles retain the full reading format while unsafe source text remains escaped", () => {
  const expanded = articleCard(a, href, true)
  assert.doesNotMatch(expanded, /reader-card-preview|reader-card-detail/)
  assert.match(expanded, /생산 확대는 계획 단계다/)
  const html = articleCard(
    { ...a, title: '<img src=x onerror="x">', summary: "<script>source</script>" },
    href,
  )
  assert.doesNotMatch(html, /<script>|<img/)
  assert.match(html, /&lt;script&gt;/)
})

test("period cards reuse compact content without dropping detailed evidence, date conditions or source links", () => {
  const event = {
    event_id: a.id,
    title: a.title,
    published_at: "2026-10-07",
    article_path: "News/" + a.id,
    source_published_at: "2026-10-06T18:00:00-07:00",
    lead: a.summary,
    sector: a.sector,
    theme: "제품·서비스",
    entities: ["FANUC", "고객"],
    tags: ["실증·재현"],
    explanations: [{ heading: "확인한 시험 조건", paragraphs: ["통제된 환경에서 12회 시험했다."] }],
    source_urls: a.urls,
  }
  const html = weeklyView(
    {
      schema: "reader-knowledge/v1",
      events: [event],
      periods: [{ from: "2026-10-05", to: "2026-10-11" }],
    },
    href,
  )
  assert.match(html, /reader-card-preview/)
  assert.match(html, /원문 최초 게시 2026.10.06/)
  assert.match(html, /통제된 환경에서 12회 시험했다/)
  assert.match(
    html,
    /id="weekly-more"[^>]+aria-controls="weekly-results"|aria-controls="weekly-results"[^>]+hidden/,
  )
  assert.match(html, /data-weekly-event/)
})

const element = (value = "", dataset = {}) => ({
  value,
  dataset,
  hidden: false,
  textContent: "",
  handlers: {},
  addEventListener(name, handler) {
    this.handlers[name] = handler
  },
})
function listFixture(search = "") {
  const rows = Array.from({ length: 30 }, (_, index) => ({ ...element(), id: index }))
  const groups = [rows.slice(0, 20), rows.slice(20)].map((items) => ({
    hidden: false,
    querySelectorAll: () => items,
  }))
  const button = element(),
    location = { href: "https://fixture.example/news?sector=AI" + search },
    calls = []
  const history = {
    pushState(state, title, url) {
      location.href = String(url)
      calls.push("push")
    },
  }
  let list
  list = bindReaderList({
    button,
    location,
    history,
    rowSelector: "[data-news-row]",
    onChange: () => list.apply(rows, groups),
  })
  return { rows, groups, button, location, calls, list }
}
test("more reveals twelve at a time, keeps total and filters independent, and restores a smaller shared view", () => {
  const f = listFixture()
  assert.deepEqual(f.list.apply(f.rows, f.groups), { shown: 12, total: 30 })
  assert.equal(f.rows.filter((r) => !r.hidden).length, 12)
  assert.equal(f.groups[1].hidden, true)
  f.button.handlers.click()
  assert.equal(f.rows.filter((r) => !r.hidden).length, 24)
  assert.equal(new URL(f.location.href).searchParams.get("sector"), "AI")
  assert.equal(new URL(f.location.href).searchParams.get("show"), "24")
  assert.equal(f.groups[1].hidden, false)
  f.button.handlers.click()
  assert.equal(f.rows.filter((r) => !r.hidden).length, 30)
  assert.equal(f.button.hidden, true)
  f.location.href = "https://fixture.example/news?sector=AI"
  f.list.apply(f.rows, f.groups)
  assert.equal(f.rows.filter((r) => !r.hidden).length, 12)
})
test("bounded lists keep zero results empty and reject malformed expansion counts", () => {
  for (const value of [null, "", "-12", "Infinity", "bad", "9999999999999"])
    assert.equal(readerListLimit(value), 12)
  assert.equal(readerListLimit("24"), 24)
  const f = listFixture("&show=24")
  f.rows.forEach((row) => {
    row.hidden = true
  })
  assert.deepEqual(f.list.apply([], f.groups), { shown: 0, total: 0 })
  assert.equal(f.button.hidden, true)
  assert.ok(f.groups.every((g) => g.hidden))
  assert.ok(f.rows.every((r) => r.hidden))
})

test("weekly more, browser back and a changed period share the same real filter flow and do not alter total results", () => {
  const rows = Array.from({ length: 26 }, () => element("", { publishedDay: "2026-10-07" }))
  const from = element("2026-10-05"),
    to = element("2026-10-11"),
    more = element(),
    count = element(),
    empty = element()
  const group = { hidden: false, querySelectorAll: () => rows }
  const selectors = {
    "#weekly-from": from,
    "#weekly-to": to,
    "#weekly-more": more,
    "#weekly-count": count,
    "#weekly-empty": empty,
  }
  const location = { href: "https://fixture.example/briefings/weekly" }
  const window = {
    handlers: {},
    addEventListener(name, handler) {
      this.handlers[name] = handler
    },
  }
  const history = {
    pushState(state, title, url) {
      location.href = String(url)
    },
    replaceState(state, title, url) {
      location.href = String(url)
    },
  }
  const document = {
    querySelector: (key) => selectors[key] || null,
    querySelectorAll: (key) =>
      key === "[data-weekly-event]" ? rows : key === "[data-weekly-group]" ? [group] : [],
  }
  bindReaderExplore({ document, window, location, history })
  assert.equal(rows.filter((r) => !r.hidden).length, 12)
  assert.equal(count.textContent, "26건")
  more.handlers.click()
  assert.equal(rows.filter((r) => !r.hidden).length, 24)
  assert.equal(count.textContent, "26건")
  from.value = "2026-10-06"
  from.handlers.change()
  assert.equal(rows.filter((r) => !r.hidden).length, 12)
  assert.equal(new URL(location.href).searchParams.has("show"), false)
  location.href = "https://fixture.example/briefings/weekly?show=24"
  window.handlers.popstate()
  assert.equal(rows.filter((r) => !r.hidden).length, 24)
  location.href = "https://fixture.example/briefings/weekly?from=2026-10-01&to=2026-10-04"
  window.handlers.popstate()
  assert.equal(count.textContent, "0건")
  assert.equal(more.hidden, true)
  assert.equal(empty.hidden, false)
})
