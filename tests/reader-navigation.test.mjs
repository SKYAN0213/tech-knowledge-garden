import test from "node:test"
import assert from "node:assert/strict"
import { fromHtml } from "hast-util-from-html"
import { primaryNavigation, briefingOverview } from "../scripts/reader-views.mjs"
import { knowledgeHubView, companiesView, weeklyView } from "../scripts/reader-knowledge-views.mjs"

const href = (path) => "/garden/" + path
const mapPath = "Knowledge Maps/AI Technology Knowledge Map"
function nodes(html, predicate) {
  const found = []
  function visit(node) {
    if (predicate(node)) found.push(node)
    for (const child of node.children || []) visit(child)
  }
  visit(fromHtml(html))
  return found
}
const text = (node) =>
  node.type === "text" ? node.value : (node.children || []).map(text).join("")
function fixture() {
  const article = {
    id: "0123456789abcdef",
    title: "로봇 제품 발표",
    summary: "회사는 로봇 제품을 발표했다.",
    sector: "로봇·제조",
    urls: ["https://fixture.example/announcement"],
    review: { review_status: "verified", published_at: "2026-10-07", concept_ids: [] },
    edition: { meta: { date: "2026-10-08" } },
    classification: { theme: "제품·서비스", entities: ["FANUC"], event_tags: [] },
  }
  const latest = {
    key: "Editions/2026/10/2026-10-08_0800_Tech_AI_Briefing",
    date: "2026-10-08",
    lead: article.title,
    items: [article],
    original: { meta: { editorial_format: "six-w/v1", headlines: [article.title] } },
    snapshot: { topics: [], today: [] },
  }
  const previous = {
    ...latest,
    key: "Editions/2026/09/2026-09-30_0800_Tech_AI_Briefing",
    date: "2026-09-30",
    lead: "이전 브리핑",
  }
  const topic = {
    id: "robot-products",
    title: "로봇 제품과 현장 도입",
    thesis: "확인한 제품 발표 기록",
    reader_format: "source-events/v1",
    reviewed: "2026-10-08",
    events: 1,
    lessons: [],
    latest: { date: "2026-10-07", meaning: "확인한 관측" },
    history: [{ article }],
    watch_for: "PRIVATE FOLLOWUP",
  }
  const event = {
    event_id: article.id,
    title: article.title,
    published_at: "2026-10-07",
    article_path: "News/" + article.id,
    url: href("News/" + article.id),
    lead: article.summary,
    sector: article.sector,
    theme: "제품·서비스",
    entities: ["FANUC"],
    tags: [],
    explanations: [],
    source_urls: article.urls,
  }
  const model = {
    schema: "reader-knowledge/v1",
    events: [event],
    terms: [],
    topics: [],
    companies: [{ label: "FANUC", event_ids: [event.event_id] }],
    periods: [
      { from: "2026-10-05", to: "2026-10-11" },
      { from: "2026-09-28", to: "2026-10-04" },
    ],
  }
  return {
    article,
    latest,
    library: {
      latest,
      issues: [previous, latest],
      current: { date: latest.date, topics: [topic] },
    },
    model,
  }
}

test("one primary navigation reaches every reader area and highlights only the actual current view", () => {
  const expected = {
    home: "브리핑",
    "briefing-hub": "브리핑",
    "briefing-issue": "브리핑",
    "briefing-topic": "브리핑",
    "news-index": "뉴스",
    news: "뉴스",
    "knowledge-hub": "지식",
    knowledge: "지식",
    companies: "기업",
    "briefing-weekly": "기간별 소식",
    "map-page": "연결 지도",
  }
  for (const [kind, label] of Object.entries(expected)) {
    const html = primaryNavigation(href, kind, mapPath)
    assert.equal(nodes(html, (n) => n.tagName === "nav").length, 1)
    const links = nodes(html, (n) => n.tagName === "a")
    assert.deepEqual(links.map(text), [
      "브리핑",
      "뉴스",
      "지식",
      "기업",
      "기간별 소식",
      "연결 지도",
    ])
    const selected = links.filter((n) => n.properties.ariaCurrent === "page")
    assert.equal(selected.length, 1)
    assert.equal(text(selected[0]), label)
    assert.equal(links[0].properties.href, href("index"))
    assert.equal(links[4].properties.href, href("Briefings/weekly"))
    assert.doesNotMatch(html, /최근 브리핑|rail-links/)
  }
})

test("unified briefing contains recent news, cumulative topics and all past issues without a second menu", () => {
  const f = fixture(),
    html = briefingOverview([f.article], f.library, href, "https://fixture.example/garden")
  assert.equal(nodes(html, (n) => n.tagName === "h1").length, 1)
  for (const id of ["ongoing-topics", "briefing-archive"])
    assert.equal(nodes(html, (n) => n.properties?.id === id).length, 1)
  assert.match(html, /확인한 제품 발표 기록/)
  assert.ok(html.includes(href("Briefings/2026/09/2026-09-30_0800_Tech_AI_Briefing")))
  assert.ok(html.includes(href("index") + "#briefing-archive"))
  assert.equal(nodes(html, (n) => n.tagName === "nav").length, 0)
  assert.doesNotMatch(html, /PRIVATE FOLLOWUP|RSS 구독/)
})

test("unified briefing omits empty history headings while retaining old fragment targets", () => {
  const f = fixture()
  const html = briefingOverview(
    [],
    { latest: { ...f.latest, items: [] }, issues: [], current: { topics: [] } },
    href,
    "https://fixture.example/garden",
  )
  assert.equal(nodes(html, (n) => n.tagName === "h2").length, 0)
  for (const id of ["ongoing-topics", "briefing-archive"])
    assert.equal(nodes(html, (n) => n.properties?.id === id).length, 1)
})

test("knowledge, company and weekly pages rely on the single global navigation", () => {
  const { model } = fixture()
  for (const html of [
    knowledgeHubView(model, href),
    companiesView(model, href),
    weeklyView(model, href),
  ]) {
    assert.equal(nodes(html, (n) => n.tagName === "nav").length, 0)
    assert.doesNotMatch(html, /reading-tabs|지식 탐색|data-explore-view/)
  }
})

test("weekly presets are individual select options, never concatenated link text", () => {
  const { model } = fixture(),
    html = weeklyView(model, href)
  const select = nodes(html, (n) => n.properties?.id === "weekly-period")[0]
  assert.ok(select)
  const options = nodes(html, (n) => n.tagName === "option")
  assert.equal(options.length, model.periods.length + 1)
  assert.equal(options[1].properties.value, "2026-10-05/2026-10-11")
  assert.equal(options[1].properties.selected, true)
  assert.equal(text(options[1]), "2026.10.05 – 2026.10.11")
  assert.doesNotMatch(html, /reader-explore-periods|data-weekly-period/)
  assert.equal(nodes(html, (n) => n.properties?.id === "weekly-from").length, 1)
  assert.equal(nodes(html, (n) => n.properties?.id === "weekly-to").length, 1)
})
