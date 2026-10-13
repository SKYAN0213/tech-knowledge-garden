import test from "node:test"
import assert from "node:assert/strict"
import { fromHtml } from "hast-util-from-html"
import {
  newsToday,
  newsDatePlacement,
  groupNewsDates,
  firstBriefingDates,
  newsArticleDates,
  refreshNewsChronology,
  bindNewsChronology,
} from "../web/news-chronology.mjs"
import { newsView } from "../scripts/reader-views.mjs"

const today = "2026-10-14"
const records = [
  { id: "recent", publishedAt: "2026-10-07", briefingDate: "2026-10-08" },
  { id: "boundary", publishedAt: "2026-10-05", briefingDate: "2026-10-07" },
  { id: "older", publishedAt: "2026-10-05", briefingDate: "2026-10-06" },
]
const article = (record) => ({
  id: record.id,
  title: "확인한 제품 발표 " + record.id,
  summary: "회사가 제품을 공개했다.",
  sector: "로봇·제조",
  urls: ["https://fixture.example/" + record.id],
  review: { published_at: record.publishedAt },
  edition: { meta: { date: record.briefingDate } },
  classification: { theme: "제품·서비스", entities: ["FANUC"], event_tags: [] },
})
function elements(html, tag) {
  const found = []
  function visit(node) {
    if (node.tagName === tag) found.push(node)
    for (const child of node.children || []) visit(child)
  }
  visit(fromHtml(html))
  return found
}
const text = (node) =>
  node.type === "text" ? node.value : (node.children || []).map(text).join("")

test("six calendar days retain the briefing date and exactly seven use the original announcement", () => {
  assert.deepEqual(newsDatePlacement(records[0], today), {
    key: "briefing:2026-10-08",
    basis: "briefing",
    date: "2026-10-08",
    label: "브리핑 발행",
  })
  assert.deepEqual(newsDatePlacement(records[1], today), {
    key: "announcement:2026-10-05",
    basis: "announcement",
    date: "2026-10-05",
    label: "발표",
  })
  assert.equal(newsDatePlacement(records[0], "2026-10-15").date, "2026-10-07")
})

test("older announcements from different briefings share one descending date group without losing articles", () => {
  const groups = groupNewsDates(records.toReversed(), { today })
  assert.deepEqual(
    groups.map((g) => g.key),
    ["briefing:2026-10-08", "announcement:2026-10-05"],
  )
  assert.deepEqual(
    groups[1].items.map((a) => a.id),
    ["boundary", "older"],
  )
  assert.equal(groups.flatMap((g) => g.items).length, records.length)
  const sameDate = groupNewsDates(
    [records[0], { id: "a", publishedAt: "2026-10-08", briefingDate: "2026-10-01" }],
    { today },
  )
  assert.deepEqual(
    sameDate.map((g) => g.basis),
    ["briefing", "announcement"],
  )
})

test("repeat introduction and later review do not reset the original publication week", () => {
  const a = article({ id: "repeat", publishedAt: "2026-09-30", briefingDate: "2026-10-01" })
  const repeat = {
    ...a,
    review: { ...a.review, reviewed_at: "2026-10-14" },
    edition: { meta: { date: "2026-10-14" } },
  }
  const first = firstBriefingDates([repeat, a])
  const projected = { ...repeat, firstBriefingDate: first.get(repeat.id) }
  assert.equal(first.get(a.id), "2026-10-01")
  assert.equal(newsDatePlacement(newsArticleDates(projected), today).date, "2026-09-30")
  assert.equal(projected.review.reviewed_at, "2026-10-14")
  assert.equal(a.firstBriefingDate, undefined)
})

test("missing or malformed announcement dates never acquire a briefing date labeled as an announcement", () => {
  for (const value of ["", "2026-02-30", "wrong"])
    assert.equal(
      newsDatePlacement({ publishedAt: value, briefingDate: "2026-10-01" }, today).basis,
      "briefing",
    )
  assert.equal(
    newsDatePlacement({ publishedAt: "2026-10-05", briefingDate: "" }, today).basis,
    "announcement",
  )
  assert.equal(newsDatePlacement({}, today).label, "")
  assert.throws(() => newsDatePlacement(records[0], "2026-02-30"), /valid news reading day/)
})

test("the day boundary is Korean midnight even with a UTC build or a reader abroad", () => {
  assert.equal(newsToday(new Date("2026-10-14T14:59:59Z")), "2026-10-14")
  assert.equal(newsToday(new Date("2026-10-14T15:00:00Z")), "2026-10-15")
})

test("rendered news groups state the date basis and retain original dates, links, tags and IDs", () => {
  const html = newsView(
    records.map(article),
    { key: "Editions/example", date: today },
    (p) => "/garden/" + p,
    { today },
  )
  assert.deepEqual(elements(html, "h2").map(text), ["2026.10.08브리핑 발행", "2026.10.05발표"])
  assert.equal(elements(html, "article").length, 3)
  assert.match(html, /data-news-stream="rolling"/)
  assert.match(html, /data-news-today="2026-10-14"/)
  assert.match(html, /발표 2026.10.05/)
  assert.match(html, /브리핑 발행 2026.10.07/)
  assert.match(html, /https:\/\/fixture.example\/boundary/)
  assert.match(html, /#FANUC/)
  assert.match(html, /data-event-id="boundary"/)
})

test("fixed historical briefing streams keep their original edition grouping and do not bind rolling updates", () => {
  const html = newsView(
    records.map(article),
    { key: "Editions/example", date: today },
    (p) => "/garden/" + p,
    { today, dateGrouping: "briefing" },
  )
  assert.deepEqual(elements(html, "h2").map(text), ["2026.10.08", "2026.10.07", "2026.10.06"])
  assert.doesNotMatch(html, /data-news-stream="rolling"/)
  assert.equal(elements(html, "article").length, 3)
})

class Node {
  constructor(tag) {
    this.tag = tag
    this.children = []
    this.dataset = {}
    this.attributes = {}
    this.hidden = false
  }
  append(...nodes) {
    for (const node of nodes) {
      if (node.parent) node.parent.children = node.parent.children.filter((child) => child !== node)
      node.parent = this
      this.children.push(node)
    }
  }
  setAttribute(name, value) {
    this.attributes[name] = value
  }
  replaceChildren(fragment) {
    this.children = []
    this.append(...[...fragment.children])
  }
  querySelectorAll(selector) {
    const found = []
    for (const child of this.children) {
      if (selector === "[data-news-row]" && child.attributes["data-news-row"] !== undefined)
        found.push(child)
      found.push(...child.querySelectorAll(selector))
    }
    return found
  }
}
function browserFixture() {
  const rows = records.map((record) => {
    const node = new Node("article")
    node.setAttribute("data-news-row", "")
    node.dataset = {
      eventId: record.id,
      publishedAt: record.publishedAt,
      briefingDate: record.briefingDate,
    }
    return node
  })
  rows[1].hidden = rows[2].hidden = true
  const stream = new Node("div")
  stream.dataset.newsToday = "2026-10-12"
  stream.append(...rows)
  const document = {
    querySelector: () => stream,
    createElement: (tag) => new Node(tag),
    createDocumentFragment: () => new Node("fragment"),
    handlers: {},
    addEventListener(name, fn) {
      this.handlers[name] = fn
    },
  }
  const window = {
    handlers: {},
    timers: [],
    cleared: [],
    addEventListener(name, fn) {
      this.handlers[name] = fn
    },
    setTimeout(fn, delay) {
      this.timers.push({ fn, delay })
      return this.timers.length
    },
    clearTimeout(id) {
      this.cleared.push(id)
    },
  }
  return { rows, stream, document, window }
}

test("a stale built page reuses the same filtered cards and hides empty new groups", () => {
  const f = browserFixture()
  assert.equal(
    refreshNewsChronology({ document: f.document, now: new Date("2026-10-14T00:00:00Z") }),
    true,
  )
  assert.deepEqual(
    f.stream.children.map((section) => section.attributes["data-date-basis"]),
    ["briefing", "announcement"],
  )
  assert.deepEqual(
    f.stream.children.map((section) => section.hidden),
    [false, true],
  )
  assert.deepEqual(f.stream.querySelectorAll("[data-news-row]"), f.rows)
  assert.equal(
    refreshNewsChronology({ document: f.document, now: new Date("2026-10-14T01:00:00Z") }),
    false,
  )
  assert.equal(refreshNewsChronology({ document: { querySelector: () => null } }), false)
})

test("Korean midnight, restored pages and foreground return update dates with a single scheduled timer", () => {
  const f = browserFixture()
  let current = new Date("2026-10-14T14:59:59Z")
  bindNewsChronology({ document: f.document, window: f.window, now: () => current })
  assert.equal(f.window.timers[0].delay, 1000)
  current = new Date("2026-10-14T15:00:00Z")
  f.window.timers[0].fn()
  assert.equal(f.stream.dataset.newsToday, "2026-10-15")
  assert.deepEqual(
    f.stream.children.map((section) => section.attributes["data-date-basis"]),
    ["announcement", "announcement"],
  )
  assert.deepEqual(f.stream.querySelectorAll("[data-news-row]"), f.rows)
  assert.equal(f.window.timers[1].delay, 86400000)
  f.window.handlers.pageshow()
  f.document.hidden = false
  f.document.handlers.visibilitychange()
  assert.deepEqual(f.window.cleared.slice(1), [1, 2, 3])
})
