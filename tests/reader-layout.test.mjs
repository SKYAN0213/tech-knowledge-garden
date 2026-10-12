import test from "node:test"
import assert from "node:assert/strict"
import { fromHtml } from "hast-util-from-html"
import {
  homeView,
  newsView,
  briefingHub,
  publicationLinks,
  issueView,
} from "../scripts/reader-views.mjs"
import { articlePreview, articleTags } from "../scripts/reader-cards.mjs"
import { SECTORS } from "../scripts/sectors.mjs"

const href = (path) => "/garden/" + path
const base = "https://fixture.example/garden"
function article(index, sector = "AI", overrides = {}) {
  return {
    id: (index + 1).toString(16).padStart(16, "0"),
    title: `검토한 사건 ${index}`,
    summary: `기업은 장비 ${index}를 공개하고 연말 공급 계획을 발표했다.`,
    sector,
    urls: [`https://fixture.example/news/${index}`],
    edition: { meta: { date: "2026-10-12" } },
    review: {
      review_status: "verified",
      published_at: "2026-10-11",
      concept_ids: index === 0 ? ["bin-picking"] : [],
    },
    classification: { theme: "제품·서비스", entities: ["FANUC"], event_tags: ["신제품"] },
    conceptLinks: index === 0 ? [{ path: "Knowledge/Robotics/Bin Picking", label: "빈 피킹" }] : [],
    ...overrides,
  }
}
function fixture() {
  const articles = SECTORS.flatMap((sector, i) => [0, 1, 2].map((j) => article(i * 3 + j, sector)))
  const latest = {
    key: "Editions/2026/10/2026-10-12_0800_Tech_AI_Briefing",
    date: "2026-10-12",
    lead: "기업의 장비 발표와 공급 계획",
    items: articles.slice(0, 7),
    original: {
      meta: {
        editorial_format: "six-w/v1",
        headlines: [articles[6].title, articles[4].title, articles[0].title],
      },
    },
    snapshot: { review: null, today: [], topics: [] },
  }
  const previous = {
    ...latest,
    key: "Editions/2026/10/2026-10-11_0800_Tech_AI_Briefing",
    date: "2026-10-11",
    lead: "전날의 제품 발표",
  }
  const knowledge = [
    {
      path: "Knowledge/Robotics/Bin Picking",
      meta: {
        entry_type: "concept",
        concept_id: "bin-picking",
        title: "Bin Picking",
        label: "빈 피킹",
        map_review: { decision: "include" },
        verified_sources: ["https://fixture.example/definition"],
        last_reviewed: "2026-10-10",
      },
      body: "## 한 문장 정의\n\n빈 피킹은 무작위로 배치된 물체를 인식하고 집어 다른 위치에 놓는 로봇 작업이다. [원문](https://fixture.example/definition)\n\n## 작동 원리\n\n확인한 정의의 작동 원리.",
    },
  ]
  const topic = {
    id: "robot-production",
    title: "로봇 제품과 현장 도입",
    history: [{ article: articles[12] }],
    watch_for: "PRIVATE FOLLOWUP",
    disconfirming: "PRIVATE REASON",
  }
  return {
    articles,
    latest,
    knowledge,
    topic,
    library: {
      latest,
      issues: [previous, latest],
      current: { date: latest.date, topics: [topic] },
    },
  }
}
function nodes(html, predicate) {
  const result = []
  const visit = (node) => {
    if (predicate(node)) result.push(node)
    for (const child of node.children || []) visit(child)
  }
  visit(fromHtml(html))
  return result
}
const hasClass = (node, name) => node.properties?.className?.includes(name)
const text = (node) =>
  node.type === "text" ? node.value : (node.children || []).map(text).join("")

test("home is a bounded latest briefing with explicit headlines and no repeated event cards", () => {
  const f = fixture(),
    before = JSON.stringify(f)
  const html = homeView(f.articles, f.library, href, base, { knowledge: f.knowledge })
  const top = nodes(html, (node) => hasClass(node, "home-highlights"))[0]
  const ids = nodes(html, (node) => node.properties?.dataHomeStory !== undefined).map(
    (node) => node.properties.dataHomeStory,
  )
  assert.equal((text(top).match(/검토한 사건/g) || []).length, 3)
  assert.ok(text(top).indexOf(f.articles[6].title) < text(top).indexOf(f.articles[4].title))
  assert.ok(text(top).indexOf(f.articles[4].title) < text(top).indexOf(f.articles[0].title))
  assert.equal(ids.length, new Set(ids).size)
  assert.ok(ids.length <= 5 + SECTORS.length * 2)
  assert.ok(
    !ids.includes(f.articles[23].id),
    "the third older item in a sector remains in the news archive",
  )
  assert.equal(nodes(html, (node) => node.tagName === "h1").length, 1)
  assert.equal(nodes(html, (node) => hasClass(node, "home-layout")).length, 1)
  assert.equal(JSON.stringify(f), before)
})

test("all eight populated sectors link to the existing URL filters", () => {
  const f = fixture()
  const html = homeView(f.articles, f.library, href, base)
  for (const sector of SECTORS) {
    assert.ok(html.includes(href("News/index") + "?" + new URLSearchParams({ sector })))
  }
  assert.ok(html.includes(href("Briefings/weekly")))
  assert.ok(html.includes(href("Companies/index")))
  assert.equal(
    html.includes("data-news-row"),
    false,
    "home previews do not take over news-filter rows",
  )
})

test("excluded and unreviewed rows never become homepage highlights or sector previews", () => {
  const f = fixture()
  f.articles[0].review.review_status = "excluded"
  f.articles[4].review.review_status = "unreviewed"
  const excluded = article(23, "우주·기초과학", {
    title: "EXCLUDED LATEST REVISION",
    review: { review_status: "excluded" },
  })
  const html = homeView([...f.articles, excluded], f.library, href, base)
  assert.equal(html.includes(f.articles[0].title), false)
  assert.equal(html.includes(f.articles[4].title), false)
  assert.equal(html.includes("EXCLUDED LATEST REVISION"), false)
  assert.equal(html.includes(`data-home-story="${excluded.id}"`), false)
})

test("source publication date, complete approved lead and source URL survive a later briefing introduction", () => {
  const a = article(0, "로봇·제조", {
    review: { review_status: "verified", published_at: "2026-09-11T18:00:00-07:00" },
  })
  const html = articlePreview(a, href, { featured: true })
  assert.match(html, /datetime="2026-09-11T18:00:00-07:00"/)
  assert.ok(html.includes("2026.09.11"))
  assert.equal(html.includes("18:00:00.07:00"), false)
  assert.ok(html.includes(a.summary))
  assert.ok(html.includes(a.urls[0]))
  assert.ok(html.includes(href("News/" + a.id)))
  const compact = articlePreview(a, href, { compact: true })
  assert.ok(compact.includes(a.title))
  assert.ok(compact.includes(a.urls[0]))
  assert.ok(compact.includes(href("News/" + a.id)))
})

test("professional term entries use exact notes and source-backed definitions while private topic copy stays hidden", () => {
  const f = fixture()
  const general = {
    path: "Knowledge/Company",
    meta: {
      ...f.knowledge[0].meta,
      concept_id: "company",
      label: "GENERAL WORD",
      map_review: { decision: "exclude" },
    },
  }
  const unreviewed = {
    path: "Knowledge/Other",
    meta: { ...f.knowledge[0].meta, concept_id: "other", label: "UNREVIEWED WORD", map_review: {} },
  }
  const html = homeView(f.articles, f.library, href, base, {
    knowledge: [...f.knowledge, general, unreviewed],
  })
  assert.ok(html.includes(href(f.knowledge[0].path)))
  assert.ok(
    html.includes("빈 피킹은 무작위로 배치된 물체를 인식하고 집어 다른 위치에 놓는 로봇 작업이다."),
  )
  assert.equal(html.includes("[원문](https://"), false)
  assert.equal(html.includes("GENERAL WORD"), false)
  assert.equal(html.includes("UNREVIEWED WORD"), false)
  assert.equal(html.includes("PRIVATE FOLLOWUP"), false)
  assert.equal(html.includes("PRIVATE REASON"), false)
  assert.ok(html.includes(href("Briefings/Topics/robot-production")))
  assert.ok(html.includes(href("Knowledge/index")))
})

test("empty home sections and missing analysis do not become reader notices or map embeds", () => {
  const latest = {
    key: "Editions/2026/10/empty",
    date: "2026-10-12",
    items: [],
    original: { meta: { headlines: [] } },
    snapshot: { review: null, today: [], topics: [] },
  }
  const html = homeView([], { latest, issues: [latest], current: { topics: [] } }, href, base)
  for (const text of [
    "주요 소식",
    "분야별 최근 소식",
    "뉴스 속 전문용어",
    "누적 주제",
    "지난 브리핑",
    "새 소식 없음",
    "미정리",
    "분석 생략",
    "data-connections",
    "canvas",
    "home-map",
  ])
    assert.equal(html.includes(text), false)
  assert.ok(html.includes("아침 브리핑"))
  assert.equal(html.includes(base + "/rss"), false)
  assert.equal(html.includes("RSS"), false)
})

test("RSS calls to action are absent from home, briefing hub and both issue formats", () => {
  const f = fixture()
  const library = { ...f.library, current: { ...f.library.current, topics: [] } }
  for (const html of [
    homeView(f.articles, library, href, base, { knowledge: f.knowledge }),
    briefingHub(library, href, base),
    publicationLinks(f.latest, href, base),
    issueView(f.latest, href, base, "<article>확인한 본문</article>"),
    issueView(
      { ...f.latest, original: { meta: { ...f.latest.original.meta, article_reviews: [] } } },
      href,
      base,
      "",
    ),
  ]) {
    assert.equal(html.includes("RSS"), false)
    assert.equal(html.includes(base + "/rss"), false)
  }
})

test("default tag links remain complete while homepage chips can be bounded without changing News filters", () => {
  const a = article(0)
  const tags = articleTags(a, href)
  assert.ok(tags.includes(href("Knowledge/Robotics/Bin Picking")))
  assert.ok(tags.includes("#신제품"))
  assert.ok(tags.includes(href("News/index") + "?" + new URLSearchParams({ entity: "FANUC" })))
  const bounded = articleTags(a, href, { limit: 2 })
  assert.equal(nodes(bounded, (node) => node.tagName === "a").length, 2)
  const news = newsView([a], { key: "Editions/test", date: "2026-10-12" }, href)
  assert.ok(news.includes('id="news-query"'))
  assert.ok(news.includes("data-news-row"))
  assert.ok(news.includes(a.summary))
  assert.ok(news.includes(a.urls[0]))
  assert.equal(news.includes("data-deep-tab"), false)
})

test("source titles and term text cannot inject markup into dashboard previews", () => {
  const f = fixture()
  f.articles[0].title = "<img src=x onerror=alert(1)> 검토한 사건"
  f.latest.original.meta.headlines = [f.articles[0].title]
  f.knowledge[0].meta.label = "<script>TERM</script>"
  const html = homeView(f.articles, f.library, href, base, { knowledge: f.knowledge })
  assert.equal(html.includes("<img src=x"), false)
  assert.equal(html.includes("<script>TERM"), false)
  assert.ok(html.includes("&lt;img"))
  assert.ok(html.includes("&lt;script&gt;TERM"))
})

test("legacy briefing hub no longer outputs empty collection-status notices", () => {
  const f = fixture()
  f.latest.original.meta = {}
  const html = briefingHub({ ...f.library, current: { topics: [] } }, href, base)
  assert.equal(html.includes("트렌드 기록 미정리"), false)
  assert.equal(html.includes("새로 기록할 트렌드 변화 없음"), false)
})
