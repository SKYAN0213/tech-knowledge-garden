import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fromHtml } from "hast-util-from-html"
import {
  buildReaderKnowledge,
  searchReaderKnowledge,
  readerKnowledgeText,
} from "../scripts/reader-knowledge.mjs"
import {
  knowledgeHubView,
  companiesView,
  weeklyView,
  termView,
} from "../scripts/reader-knowledge-views.mjs"
import { editions, extractArticles, parseNote, walk } from "../scripts/garden.mjs"
import { briefingLibrary } from "../scripts/briefings.mjs"

const href = (target) => "/garden/" + target.toLowerCase()
const id = (index) => index.toString(16).padStart(16, "0")
function article(index = 1, change = {}) {
  return {
    id: id(index),
    title: "FANUC, 로봇 제어 API 시험 공개",
    sector: "로봇·제조",
    review: {
      event_id: id(index),
      review_status: "verified",
      published_at: "2026-10-05",
      reviewed_at: "2026-10-06",
      concept_ids: ["robot-api"],
    },
    urls: ["https://fixture.example/robot-" + index],
    classification: {
      theme: "연구·기술",
      secondary_theme: null,
      event_tags: ["실증·재현"],
      entities: ["FANUC"],
    },
    editorial: {
      facts: {
        who: "FANUC",
        when: "2026-10-05",
        where: "미기재",
        what: "로봇 API 시험",
        how: "동일 시험 조건에서 지연을 비교",
        why: "미기재",
      },
      lead: "FANUC는 10월 5일 같은 시험 조건에서 로봇 제어 API의 지연을 비교했다고 발표했다. 고객 제공은 12월로 계획했다.",
      explanations: [
        {
          heading: "비교 조건",
          paragraphs: ["회사는 같은 로봇과 네트워크 조건에서 지연을 30% 줄였다고 밝혔다."],
          source_urls: ["https://fixture.example/robot-" + index],
        },
      ],
      topic_ids: ["robot-api-progress"],
    },
    edition: {
      file: "vault/Editions/2026/10/2026-10-06_0800.md",
      slug: "Editions/2026/10/2026-10-06_0800",
      meta: { schema_version: "tech-ai-magazine/v2", date: "2026-10-06" },
    },
    ...change,
  }
}
function term(conceptId = "robot-api", change = {}) {
  return {
    path: "Knowledge/Robotics/" + conceptId,
    meta: {
      schema_version: "tech-encyclopedia/v2",
      entry_type: "concept",
      concept_id: conceptId,
      label: conceptId === "robot-api" ? "로봇 제어 API" : "로봇 통신 규약",
      aliases: [conceptId],
      keywords: ["로봇 제어"],
      last_reviewed: "2026-10-06",
      verified_sources: ["https://fixture.example/definition-" + conceptId],
      map_review: {
        decision: "include",
        kind: "protocol",
        reviewed: "2026-10-06",
        reason: "PRIVATE_MAP_REVIEW_REASON_원문과 독립 정의를 읽어 검토했다.",
      },
      relations: [],
      connections: [],
    },
    body: "## 한 문장 정의\n\n로봇 API는 제어 명령을 주고 상태를 받는 인터페이스다. [원문](https://fixture.example/definition)\n\n## 작동 원리\n\n명령을 요청하면 응답으로 상태를 받는다.\n\n## 혼동하기 쉬운 개념\n\n[[Knowledge/Robotics/robot-protocol|통신 규약]]과 제어 인터페이스를 구분한다.\n\n## 한계와 실패 조건\n\n없음\n",
    ...change,
  }
}
function topic(change = {}) {
  return {
    schema_version: "tech-trend/v1",
    id: "robot-api-progress",
    title: "로봇 API의 시험과 제공 단계",
    reviewed: "2026-10-06",
    reader_format: "source-events/v1",
    thesis: "회사는 시험 결과를 발표했고 제공은 12월로 계획했다.",
    knowledge_notes: ["Knowledge/Robotics/robot-api"],
    lessons: [],
    watch_for: "PRIVATE_WATCH_QUESTION",
    disconfirming: "PRIVATE_REASON",
    question: "PRIVATE_RESEARCH_QUESTION",
    history: [
      {
        topic_id: "robot-api-progress",
        event_id: id(1),
        reviewed: "2026-10-06",
        change: "동일 조건 시험과 12월 제공 계획을 발표했다.",
        meaning: "PRIVATE_MEANING",
        limit: "PRIVATE_LIMIT",
        next_check: "PRIVATE_NEXT_CHECK",
      },
    ],
    ...change,
  }
}
function model(options = {}) {
  return buildReaderKnowledge({
    articles: [article()],
    knowledge: [term()],
    topics: [topic()],
    href,
    companyLabels: ["FANUC", "HD현대로보틱스", "KUKA", "두산로보틱스", "ABB"],
    ...options,
  })
}
function nodes(html, predicate) {
  const found = []
  const visit = (node) => {
    if (predicate(node)) found.push(node)
    ;(node.children || []).forEach(visit)
  }
  visit(fromHtml(html, { fragment: true }))
  return found
}

test("only verified dated canonical public articles become knowledge evidence and native candidates stay excluded", () => {
  const baseline = article(1)
  const unreviewed = article(2, {
    title: "UNREVIEWED_CANDIDATE",
    review: { ...article(2).review, review_status: "unreviewed" },
  })
  const privateStory = article(3, { title: "PRIVATE_NATIVE_395", candidate_published: false })
  const privateFile = article(4, {
    title: "PRIVATE_FILE",
    edition: { ...article(4).edition, file: ".local/research/preview/vault/Editions/private.md" },
  })
  const native = {
    event_id: id(5),
    title: "NATIVE_ONLY",
    article_review: { review_status: "verified", published_at: "2026-10-05" },
    source_urls: ["https://fixture.example/native"],
  }
  const undated = article(6, {
    title: "UNDATED",
    review: { ...article(6).review, published_at: null },
  })
  const badSource = article(7, {
    title: "BAD_SOURCE",
    urls: ["file:///private/source.json", "javascript:alert(1)"],
  })
  const withdrawn = article(8, {
    title: "WITHDRAWN_ARTICLE",
    review: { ...article(8).review, review_status: "excluded" },
  })
  const olderWithdrawn = article(8, { title: "OLDER_WITHDRAWN" })
  const out = model({
    articles: [
      baseline,
      unreviewed,
      privateStory,
      privateFile,
      native,
      undated,
      badSource,
      withdrawn,
      olderWithdrawn,
    ],
  })
  assert.deepEqual(
    out.events.map((event) => event.event_id),
    [id(1)],
  )
  assert.doesNotMatch(
    JSON.stringify(out),
    /UNREVIEWED_CANDIDATE|PRIVATE_NATIVE_395|PRIVATE_FILE|NATIVE_ONLY|UNDATED|BAD_SOURCE|WITHDRAWN/,
  )
  assert.equal(out.events[0].url, "/garden/news/" + id(1))
  assert.deepEqual(out.events[0].source_urls, baseline.urls)
})

test("stable event IDs choose the latest reviewed prose and preserve original dates and literal information", () => {
  const older = article(),
    latest = structuredClone(older)
  latest.review.reviewed_at = "2026-10-07"
  latest.editorial.lead =
    "FANUC는 10월 5일 constructor, toString, __proto__ 및 30% 시험 결과를 설명했다. 12월 제공은 계획이다."
  latest.review.reason = "PRIVATE_REVIEW_REASON"
  latest.review.private_notes = "PRIVATE_NOTES"
  latest.editorial.reason = "PRIVATE_AUTHORING_REASON"
  const out = model({ articles: [latest, older] })
  assert.equal(out.events.length, 1)
  assert.equal(out.events[0].published_at, "2026-10-05")
  assert.equal(out.events[0].reviewed_at, "2026-10-07")
  assert.equal(out.events[0].lead, latest.editorial.lead)
  assert.equal(out.events[0].facts.where, undefined)
  assert.doesNotMatch(JSON.stringify(out), /PRIVATE_|미기재/)
  assert.equal(
    readerKnowledgeText("constructor, __proto__, [CLS], 2*3과 [[Knowledge/A|API]]를 읽는다."),
    "constructor, __proto__, [CLS], 2*3과 API를 읽는다.",
  )
})

test("specialist learning notes require their own review and only explicit article concept IDs add event history", () => {
  const a = term(),
    b = term("robot-protocol")
  a.meta.connections = [
    {
      target: "robot-protocol",
      reason: "제어 명령은 이 통신 규약으로 전송된다.",
      evidence: ["https://fixture.example/relationship"],
    },
  ]
  const unreviewed = term("unreviewed", {
    meta: { ...term("unreviewed").meta, map_review: undefined },
  })
  const excluded = term("general-word", {
    meta: {
      ...term("general-word").meta,
      map_review: {
        decision: "exclude",
        reviewed: "2026-10-06",
        reason: "일반적인 회사나 제품 이름으로 지도에 추가하지 않는다.",
      },
    },
  })
  const company = {
    path: "Knowledge/FANUC",
    meta: { title: "FANUC", entry_type: "company" },
    body: "회사",
  }
  const mentionOnly = article(2, {
    review: { ...article(2).review, concept_ids: [] },
    editorial: { ...article(2).editorial, lead: "로봇 제어 API를 언급했다." },
  })
  const out = model({
    articles: [article(), mentionOnly],
    knowledge: [a, b, unreviewed, excluded, company],
  })
  assert.deepEqual(out.terms.map((row) => row.concept_id).sort(), ["robot-api", "robot-protocol"])
  assert.deepEqual(out.terms.find((row) => row.concept_id === "robot-api").event_ids, [id(1)])
  assert.equal(out.terms.find((row) => row.concept_id === "robot-api").relations.length, 1)
  assert.equal(out.terms.find((row) => row.concept_id === "robot-protocol").event_ids.length, 0)
  assert.doesNotMatch(
    JSON.stringify(out.terms),
    /PRIVATE_MAP_REVIEW_REASON|\[\[|한계와 실패 조건.*없음/,
  )
})

test("company profiles use explicit interest filters and exact public entity tags without alias or product promotion", () => {
  const mixed = article(1, {
    classification: {
      ...article().classification,
      entities: ["FANUC", "KUKA", "SANDO", "교수 김씨"],
    },
  })
  const otherName = article(2, {
    classification: {
      ...article().classification,
      entities: ["Fanuc", "KUKA Group", "HD현대로보틱스"],
    },
  })
  const out = model({
    articles: [mixed, otherName],
    companyLabels: ["FANUC", "Fanuc", "KUKA", "KUKA Group", "HD현대로보틱스", "ABB"],
  })
  assert.deepEqual(out.companies.find((row) => row.label === "FANUC").event_ids, [id(1)])
  assert.deepEqual(out.companies.find((row) => row.label === "Fanuc").event_ids, [id(2)])
  assert.deepEqual(out.companies.find((row) => row.label === "KUKA").event_ids, [id(1)])
  assert.ok(!out.companies.some((row) => ["SANDO", "교수 김씨", "ABB"].includes(row.label)))
  assert.equal(buildReaderKnowledge({ articles: [mixed], href }).companies.length, 0)
  assert.equal(
    out.companies.every((row) => row.classification_basis === "exact-published-entity-tag"),
    true,
  )
  const html = companiesView(out, href, "FANUC")
  const sections = nodes(
    html,
    (node) => node.tagName === "section" && node.properties?.dataCompany !== undefined,
  )
  assert.equal(sections.filter((node) => !node.properties.hidden).length, 1)
  assert.equal(sections.find((node) => !node.properties.hidden).properties.dataCompany, "FANUC")
  assert.ok(
    nodes(html, (node) => node.tagName === "select" && node.properties.id === "company-select")
      .length,
  )
})

test("topics retain reviewed published-event connections while withdrawal removes dependent summary and private judgments", () => {
  const partial = topic({
    thesis: "WITHDRAWN_TOPIC_FACT",
    history: [
      ...topic().history,
      {
        topic_id: "robot-api-progress",
        event_id: id(2),
        reviewed: "2026-10-06",
        change: "WITHDRAWN_CHANGE",
      },
    ],
  })
  const out = model({
    articles: [article(), article(2)],
    topics: [
      partial,
      topic({ id: "unlinked", history: [] }),
      topic({ id: "unreviewed-topic", reviewed: null }),
    ],
    excludedEventIds: [id(2)],
  })
  assert.equal(out.topics.length, 1)
  assert.equal(out.topics[0].summary, undefined)
  assert.deepEqual(out.topics[0].event_ids, [id(1)])
  assert.doesNotMatch(
    JSON.stringify(out),
    /WITHDRAWN_TOPIC_FACT|WITHDRAWN_CHANGE|PRIVATE_|unlinked|unreviewed-topic/,
  )
})

test("search returns existing grounded sentences and original sources with inclusive period and exact company filters", () => {
  const previous = article(2, {
    review: { ...article(2).review, published_at: "2026-09-28" },
    classification: { ...article().classification, entities: ["KUKA"] },
  })
  const out = model({ articles: [article(), previous] })
  const matches = searchReaderKnowledge(out, "30%", {
    from: "2026-10-05",
    to: "2026-10-05",
    company: "FANUC",
  })
  assert.equal(matches.length, 1)
  assert.equal(matches[0].event_id, id(1))
  assert.equal(matches[0].facts[1].text, article().editorial.explanations[0].paragraphs[0])
  assert.deepEqual(matches[0].facts[1].source_urls, article().urls)
  assert.deepEqual(searchReaderKnowledge(out, "존재하지 않는 결과"), [])
  assert.throws(
    () => searchReaderKnowledge(out, "로봇", { from: "2026-10-08", to: "2026-10-05" }),
    /Valid inclusive/,
  )
})

test("weekly periods and reader filters use announcement dates without interpreting article frequency as market growth", () => {
  const old = article(2, {
    review: { ...article(2).review, published_at: "2026-09-28" },
    edition: { ...article().edition, meta: { ...article().edition.meta, date: "2026-10-06" } },
  })
  const out = model({ articles: [article(), old] })
  assert.deepEqual(
    out.periods.map((period) => period.from),
    ["2026-10-05", "2026-09-28"],
  )
  const html = weeklyView(out, href)
  const rows = nodes(
    html,
    (node) => node.tagName === "article" && node.properties?.dataWeeklyEvent !== undefined,
  )
  assert.equal(rows.length, 2)
  assert.equal(
    rows.find((row) => row.properties.dataPublishedDay === "2026-09-28").properties.hidden,
    true,
  )
  assert.equal(
    rows.find((row) => row.properties.dataPublishedDay === "2026-10-05").properties.hidden,
    undefined,
  )
  assert.ok(nodes(html, (node) => node.properties?.id === "weekly-from").length)
  assert.ok(nodes(html, (node) => node.properties?.id === "weekly-to").length)
  assert.doesNotMatch(
    html,
    /시장 성장|시장점유율|분석.*생략|지식 지도|data-connections|못한다|미기재/,
  )
})

test("hub and term views preserve provided Quartz body, emit source links and omit empty explanations and unreviewed terms", () => {
  const out = model()
  const hub = knowledgeHubView(out, href)
  assert.ok(nodes(hub, (node) => node.properties?.id === "knowledge-query").length)
  assert.equal(nodes(hub, (node) => node.properties?.dataKnowledgeTerm !== undefined).length, 1)
  assert.match(hub, /href="\/garden\/knowledge\/robotics\/robot-api"/)
  assert.doesNotMatch(hub, /PRIVATE_|\[\[|미기재|비공개|원고/)
  const original =
    '<article id="quartz-definition"><h1>기존 용어</h1><p>기존 정의와 <a href="/garden/knowledge/existing">Obsidian 연결</a></p></article>'
  const rendered = termView(out, href, "robot-api", { renderedBody: original })
  assert.ok(rendered.includes(original))
  assert.equal(rendered.split("기존 정의와").length - 1, 1)
  assert.doesNotMatch(rendered, /명령을 요청하면 응답으로 상태를 받는다/)
  assert.match(rendered, /관련 사건/)
  assert.match(rendered, /https:\/\/fixture\.example\/robot-1/)
  assert.equal(termView(out, href, "not-reviewed"), "")
  const fallback = termView(out, href, "robot-api")
  assert.doesNotMatch(fallback, /\[\[|\]\]|한계와 실패 조건|없음/)
  const blank = buildReaderKnowledge({ articles: [], href })
  assert.doesNotMatch(knowledgeHubView(blank, href), /reading-tabs|term-grid|reader-explore-topics/)
})

test("HTML treats source text as text while retaining literal identifiers and original date variants", () => {
  const unsafe = article(1, {
    title: '<script>alert("x")</script>',
    review: { ...article().review, date_kind: "dated-update", source_published_at: "2026-09-20" },
  })
  unsafe.editorial.explanations[0].paragraphs[0] =
    'constructor, __proto__와 <img src="x" onerror="x">를 구분한다고 발표했다.'
  const out = model({ articles: [unsafe] }),
    html = weeklyView(out, href)
  assert.equal(nodes(html, (node) => node.tagName === "script" || node.tagName === "img").length, 0)
  assert.match(html, /constructor, __proto__/)
  assert.match(html, /업데이트 2026\.10\.05/)
  assert.match(html, /원문 최초 게시 2026\.09\.20/)
})

test("real canonical articles and reviewed installed notes produce a complete public model without private input artifacts", () => {
  const all = editions("vault"),
    issueArticles = new Map(all.map((issue) => [issue.slug, extractArticles(issue)]))
  const library = briefingLibrary("vault", all, issueArticles)
  const knowledge = walk("vault/Knowledge")
    .filter((file) => file.endsWith(".md"))
    .map((file) => ({
      path: path.relative("vault", file).replace(/\.md$/, ""),
      ...parseNote(fs.readFileSync(file, "utf8")),
    }))
  const input = [...issueArticles.values()].flat()
  const out = buildReaderKnowledge({
    articles: input,
    knowledge,
    topics: library.current.topics,
    href,
    companyLabels: ["FANUC", "KUKA", "KUKA Group", "HD현대로보틱스", "두산로보틱스", "ABB"],
  })
  assert.ok(out.events.length > 0)
  assert.ok(out.terms.length > 0)
  const canonicalIds = new Set(
    input.filter((row) => row.review?.review_status === "verified").map((row) => row.id),
  )
  assert.ok(out.events.every((event) => canonicalIds.has(event.event_id)))
  assert.ok(
    out.companies.every((company) =>
      out.events.some((event) => event.entities.includes(company.label)),
    ),
  )
  assert.equal(
    out.companies.some((company) => company.label === "ABB"),
    out.events.some((event) => event.entities.includes("ABB")),
  )
  assert.ok(
    out.search.every(
      (row) => row.source_urls.length && row.facts.every((fact) => fact.source_urls.length),
    ),
  )
  assert.doesNotMatch(
    JSON.stringify(out),
    /\.local\/research|source-processing-input|map_review|private_notes|candidate_published|budget\.json/,
  )
})

test("period-filtered questions return dated event evidence rather than mixed-date company aggregates", () => {
  const old = article(2, { review: { ...article(2).review, published_at: "2026-09-28" } })
  const out = model({ articles: [article(), old] })
  const company = out.search.find((row) => row.entity === "FANUC")
  assert.deepEqual(
    [...new Set(company.facts.map((fact) => fact.published_at))],
    ["2026-10-05", "2026-09-28"],
  )
  assert.ok(company.facts.every((fact) => fact.event_id && fact.article_url))
  const selected = searchReaderKnowledge(out, "로봇", {
    from: "2026-10-05",
    to: "2026-10-05",
    company: "FANUC",
  })
  assert.deepEqual(
    selected.map((row) => row.event_id),
    [id(1)],
  )
  assert.ok(selected.every((row) => row.facts.every((fact) => fact.published_at === "2026-10-05")))
})
