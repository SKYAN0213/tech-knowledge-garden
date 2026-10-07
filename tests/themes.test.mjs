import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import Parser from "rss-parser"
import { extractArticles, refresh, noteText, parseNote, walk } from "../scripts/garden.mjs"
import {
  classifyArticle,
  classificationMeta,
  classificationHistory,
  THEMES,
  entityListText,
} from "../scripts/themes.mjs"
import { newsView } from "../scripts/reader-views.mjs"
import { articleSearchText } from "../scripts/knowledge.mjs"
import { matchesNews } from "../web/news-filter.mjs"
import { draftSchema, draftProblems } from "../scripts/research/editor.mjs"
import { assertSchema } from "../scripts/research/contracts.mjs"

const body = `**분야:** 로봇·제조
**테마:** 투자·기업거래
**보조 테마:** 인력·조직
**세부 태그:** 투자 유치, 채용 확대
**기업·기관:** Example Robotics

**핵심:** 조달 완료와 연구 조직 채용 계획을 발표했다. [S1]

**의미:** 투자 집행과 실제 인원 증가는 다음 보고에서 확인할 수 있다.

**확인할 점:** 채용 계획의 실행 여부.
`
const fixture = () => ({
  file: "fixture.md",
  slug: "Editions/2026/09/2026-09-14_0800_Tech_AI_Briefing",
  meta: {
    schema_version: "tech-ai-magazine/v2",
    briefing_format: "sector-five/v1",
    theme_format: "news-themes/v1",
    date: "2026-09-14",
    coverage_end: "2026-09-14T08:00:00+09:00",
  },
  body: `# 뉴스 데스크\n\n## 투자 유치와 채용 계획\n\n${body}\n# Source List\n\n- [S1] https://example.org/funding\n`,
})

test("A business model announcement is classified without claiming a contract or market entry", () => {
  const prose =
    "**분야:** 소프트웨어·클라우드\n**테마:** 사업·고객\n**보조 테마:** 없음\n**세부 태그:** 사업 모델\n**기업·기관:** NVIDIA\n"
  const classification = classifyArticle(prose, "수익 공유 모델 발표")
  assert.equal(classification.theme, "사업·고객")
  assert.deepEqual(classification.event_tags, ["사업 모델"])
  assert.throws(() =>
    classifyArticle(prose.replace("사업·고객", "실적·재무"), "수익 공유 모델 발표"),
  )
})

test("Reviewed themes, event tags and entities retain the real summary and stable source identity", () => {
  const issue = fixture(),
    a = extractArticles(issue)[0]
  assert.equal(a.summary, "조달 완료와 연구 조직 채용 계획을 발표했다.")
  assert.deepEqual(a.classification, {
    theme: "투자·기업거래",
    secondary_theme: "인력·조직",
    event_tags: ["투자 유치", "채용 확대"],
    entities: ["Example Robotics"],
  })
  const meta = classificationMeta(a)
  assert.equal(meta.sector, "로봇·제조")
  assert.deepEqual(meta.tags, [
    "sector/robotics-manufacturing",
    "theme/capital",
    "theme/people",
    "event/투자-유치",
    "event/채용-확대",
  ])
  const old = fixture()
  old.meta.date = "2026-09-13"
  delete old.meta.theme_format
  assert.equal(extractArticles(old)[0].id, a.id)
  assert.equal(extractArticles(old)[0].classification, undefined)
  assert.deepEqual(classificationMeta(extractArticles(old)[0]), {})
  assert.deepEqual(classifyArticle(body.replaceAll("\n", "\r\n"), "CRLF"), a.classification)
})

test("implementation guidance retains its source identity without claiming a product feature", () => {
  const issue = fixture()
  const original = extractArticles(issue)[0]
  issue.body = issue.body
    .replace("**테마:** 투자·기업거래", "**테마:** 연구·기술")
    .replace("**보조 테마:** 인력·조직", "**보조 테마:** 없음")
    .replace("투자 유치, 채용 확대", "구현·운영 지침")
  const article = extractArticles(issue)[0]
  assert.equal(article.id, original.id)
  assert.equal(article.classification.theme, "연구·기술")
  assert.deepEqual(article.classification.event_tags, ["구현·운영 지침"])
  assert.deepEqual(classificationMeta(article).tags, [
    "sector/robotics-manufacturing",
    "theme/research",
    "event/구현-운영-지침",
  ])
  assert.throws(
    () =>
      classifyArticle(issue.body.replace("**테마:** 연구·기술", "**테마:** 제품·서비스"), "Guide"),
    /Invalid or excessive/,
  )
})

test("Naming changes use a product tag without implying new detection behavior", () => {
  const classified = classifyArticle(
    body
      .replace("**테마:** 투자·기업거래", "**테마:** 제품·서비스")
      .replace("**보조 테마:** 인력·조직", "**보조 테마:** 없음")
      .replace("투자 유치, 채용 확대", "명칭 변경"),
    "Detector names",
  )
  assert.equal(classified.theme, "제품·서비스")
  assert.deepEqual(classified.event_tags, ["명칭 변경"])
  assert.deepEqual(THEMES.find((theme) => theme.id === "products").tags.includes("명칭 변경"), true)
})

test("Future issues require the theme and sector format, including empty editions", () => {
  const i = fixture()
  delete i.meta.theme_format
  assert.throws(() => extractArticles(i), /theme_format/)
  i.meta.theme_format = "news-themes/v2"
  assert.throws(() => extractArticles(i), /theme_format/)
  i.meta.theme_format = "news-themes/v1"
  delete i.meta.briefing_format
  assert.throws(() => extractArticles(i), /sector-five/)
  i.meta.briefing_format = "sector-five/v1"
  i.body = "# 뉴스 데스크\n\n없음\n\n# Source List\n\n없음"
  assert.deepEqual(extractArticles(i), [])
})

test("Classification rejects missing, unknown, duplicated and excessive labels without guessing", () => {
  for (const invalid of [
    body.replace("**테마:** 투자·기업거래\n", ""),
    body + "\n**테마:** 투자·기업거래",
    body.replace("**테마:** 투자·기업거래", "**테마:** 일반 뉴스"),
    body.replace("**테마:** 투자·기업거래", "**테마:**"),
    body.replace("**보조 테마:** 인력·조직", "**보조 테마:** 투자·기업거래"),
    body.replace("**보조 테마:** 인력·조직", "**보조 테마:** 인력·조직, 사업·고객"),
    body.replace("투자 유치, 채용 확대", "투자 유치, 투자 유치"),
    body.replace("투자 유치, 채용 확대", "투자 유치, 매출"),
    body.replace("투자 유치, 채용 확대", "투자 유치, 채용 확대, 인력 감축, 조직 개편"),
    body.replace("투자 유치, 채용 확대", ""),
    body.replace("Example Robotics", "Example Robotics, Example Robotics"),
    body.replace("Example Robotics", "Example Robotics, "),
    body.replace("Example Robotics", "[[Knowledge/Finance]]"),
  ])
    assert.throws(() => classifyArticle(invalid, "fixture"), /classification|theme|tags|entities/)
  const none = classifyArticle(
    body
      .replace("**보조 테마:** 인력·조직", "**보조 테마:** 없음")
      .replace("투자 유치, 채용 확대", "투자 유치")
      .replace("Example Robotics", "없음"),
    "none",
  )
  assert.equal(none.secondary_theme, null)
  assert.deepEqual(none.entities, [])
})

test("Every approved theme is usable and metadata cannot attach an article to a graph term", () => {
  for (const t of THEMES) {
    const candidate = body
      .replace("**테마:** 투자·기업거래", `**테마:** ${t.name}`)
      .replace("**보조 테마:** 인력·조직", "**보조 테마:** 없음")
      .replace("투자 유치, 채용 확대", t.tags[0])
    assert.equal(classifyArticle(candidate, t.name).theme, t.name)
  }
  const text = articleSearchText(body.replace("Example Robotics", "OpenID Connect"))
  assert.doesNotMatch(text, /OpenID Connect|테마|기업·기관|세부 태그|분야/)
  assert.match(text, /조달 완료/)
})

test("treasury share purchases use the capital theme without implying an operating result", () => {
  const text = body
    .replace("**보조 테마:** 인력·조직", "**보조 테마:** 없음")
    .replace("투자 유치, 채용 확대", "자기주식 취득")
  const result = classifyArticle(text, "FANUC 자기주식 취득")
  assert.equal(result.theme, "투자·기업거래")
  assert.deepEqual(result.event_tags, ["자기주식 취득"])
  assert.throws(
    () => classifyArticle(text.replace("**테마:** 투자·기업거래", "**테마:** 실적·재무"), "wrong"),
    /tags/,
  )
})

test("intellectual property disputes use an explicit ecosystem event tag", () => {
  const text = body
    .replace("**테마:** 투자·기업거래", "**테마:** 표준·생태계")
    .replace("**보조 테마:** 인력·조직", "**보조 테마:** 없음")
    .replace("투자 유치, 채용 확대", "지식재산권 분쟁")
  const result = classifyArticle(text, "Teradyne Robotics와 Elite Robots의 법적 분쟁")
  assert.equal(result.theme, "표준·생태계")
  assert.deepEqual(result.event_tags, ["지식재산권 분쟁"])
  const meta = classificationMeta({
    ...extractArticles(fixture())[0],
    classification: result,
  })
  assert.equal(meta.tags.at(-1), "event/지식재산권-분쟁")
})

test("Combined news filters match secondary themes and exact entities, with Unicode-safe tag search", () => {
  const a = {
    text: "투자 발표",
    sector: "로봇·제조",
    themes: ["투자·기업거래", "인력·조직"],
    tags: ["채용 확대"],
    entities: ["Example Robotics"],
  }
  assert.ok(
    matchesNews(a, {
      sector: "로봇·제조",
      theme: "인력·조직",
      entity: "example robotics",
      query: "채용 확대".normalize("NFD"),
    }),
  )
  assert.ok(!matchesNews(a, { sector: "AI" }))
  assert.ok(!matchesNews(a, { entity: "Example" }))
  assert.ok(!matchesNews(a, { theme: "일반어" }))
  assert.ok(matchesNews({ text: "과거 뉴스" }))
  assert.ok(!matchesNews({ text: "과거 뉴스" }, { theme: "인력·조직" }))
})

test("News filters expose reviewed metadata and escaped entity labels without adding a map", () => {
  const i = fixture(),
    a = extractArticles(i)[0]
  a.classification.entities = ['Example "A&B"']
  const html = newsView([a], { key: i.slug, date: i.meta.date }, (p) => "/" + p)
  assert.match(html, /id="news-sector"/)
  assert.match(html, /id="news-theme"/)
  assert.match(html, /id="news-entity"/)
  assert.match(html, /인력·조직/)
  assert.match(html, /Example &quot;A&amp;B&quot;/)
  assert.doesNotMatch(html, /data-connections|<canvas/)
  const legacy = newsView(
    [{ ...a, classification: undefined }],
    { key: i.slug, date: i.meta.date },
    (p) => "/" + p,
  )
  assert.doesNotMatch(legacy, /id="news-theme"/)
})

test("Research context keeps canonical entity names and latest distinct events without inferred history", () => {
  const a = extractArticles(fixture())[0]
  const context = classificationHistory([
    { date: "2026-09-13", items: [{ ...a, classification: undefined }] },
    { date: "2026-09-14", items: [a] },
    { date: "2026-09-15", items: [{ ...a, title: "후속 확인" }] },
  ])
  assert.deepEqual(context.known_entities, ["Example Robotics"])
  assert.equal(context.recent_classified_events.length, 1)
  assert.equal(context.recent_classified_events[0].title, "후속 확인")
  assert.equal(context.recent_classified_events[0].date, "2026-09-15")
})

test("One source edition carries tags through news, briefing, digest and decoded RSS, idempotently", async () => {
  const original = process.cwd(),
    temp = fs.mkdtempSync(path.join(os.tmpdir(), "garden-themes-"))
  let xml
  try {
    fs.copyFileSync(
      path.join(original, "quartz.config.yaml"),
      path.join(temp, "quartz.config.yaml"),
    )
    process.chdir(temp)
    const i = fixture(),
      filename = "vault/" + i.slug + ".md"
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, noteText(i.meta, i.body))
    const sourceBefore = fs.readFileSync(filename, "utf8")
    refresh()
    const a = extractArticles(i)[0]
    const news = parseNote(fs.readFileSync(`vault/News/${a.id}.md`, "utf8"))
    assert.equal(news.meta.theme, "투자·기업거래")
    assert.deepEqual(news.meta.entities, ["Example Robotics"])
    assert.ok(news.meta.tags.includes("theme/people"))
    for (const f of [
      "vault/" + i.slug.replace("Editions/", "Briefings/") + ".md",
      i.slug.replace("Editions/", "digest/") + ".md",
    ])
      assert.match(
        fs.readFileSync(f, "utf8"),
        /투자·기업거래 · 인력·조직 · 투자 유치 · 채용 확대 · Example Robotics/,
      )
    xml = fs.readFileSync("vault/briefing.xml", "utf8")
    const bytes = () =>
      Object.fromEntries(
        [...walk("vault"), ...walk("digest")].map((f) => [f, fs.readFileSync(f, "utf8")]),
      )
    const before = bytes()
    refresh()
    assert.deepEqual(bytes(), before)
    assert.equal(fs.readFileSync(filename, "utf8"), sourceBefore)
  } finally {
    process.chdir(original)
    fs.rmSync(temp, { recursive: true })
  }
  const feed = await new Parser().parseString(xml)
  assert.equal(feed.items.length, 1)
  assert.match(feed.items[0].content, /투자·기업거래 · 인력·조직/)
  assert.match(feed.items[0].content, /https:\/\/example.org\/funding/)
  assert.match(
    feed.items[0].content,
    /github.com\/SKYAN0213\/tech-knowledge-garden\/blob\/main\/digest/,
  )
  assert.equal(feed.items[0].guid, feed.items[0].link)
})

test("entity names containing commas survive classification and shared tag URLs", () => {
  const entities = [
    "Sheriff’s departments in Camden and Gloucester Counties, New Jersey",
    'Example \"A&B\"',
  ]
  const encoded = entityListText(entities)
  const result = classifyArticle(
    body.replace("Example Robotics", encoded),
    "Comma-bearing organizations",
  )
  assert.deepEqual(result.entities, entities)
  assert.equal(entityListText(["Example Robotics", "Other Lab"]), "Example Robotics, Other Lab")
  assert.equal(entityListText([]), "없음")
  for (const value of ["[null]", '[" "]', '["Example", "Example"]']) {
    assert.throws(() => classifyArticle(body.replace("Example Robotics", value), "Invalid"))
  }
})

test("bug fixes share the product tag across authoring, classification and stable event identity", () => {
  const issue = fixture()
  issue.body = issue.body
    .replace("**테마:** 투자·기업거래", "**테마:** 제품·서비스")
    .replace("**보조 테마:** 인력·조직", "**보조 테마:** 없음")
    .replace("투자 유치, 채용 확대", "오류 수정")
  const a = extractArticles(issue)[0]
  assert.deepEqual(a.classification.event_tags, ["오류 수정"])
  assert.ok(classificationMeta(a).tags.includes("event/오류-수정"))
  const before = structuredClone(issue)
  before.body = before.body.replace("오류 수정", "기능 추가")
  assert.equal(a.id, extractArticles(before)[0].id)
  const claim = {
    claim_id: "fix-claim",
    subject: "Example",
    event_state: "completed",
    evidence: [],
    review: { status: "verified" },
  }
  const draft = {
    title: "Example, 세션 시작 훅의 전송 오류 수정",
    lead: [
      {
        text: "Example은 9월 14일 훅 이벤트 전송 오류를 수정한 버전을 공개했다.",
        claim_ids: [claim.claim_id],
      },
      {
        text: "릴리스 노트는 이전 오류로 작업이 중간에 종료될 수 있었다고 설명했다.",
        claim_ids: [claim.claim_id],
      },
    ],
    facts: {
      who: "Example",
      when: "2026-09-14",
      where: null,
      what: "훅 이벤트 전송 오류 수정",
      how: null,
      why: null,
    },
    sector: "소프트웨어·클라우드",
    theme: "제품·서비스",
    tags: ["오류 수정"],
    entities: ["Example"],
    explanations: [],
  }
  assertSchema(draft, draftSchema)
  assert.deepEqual(draftProblems(draft, [claim]), [])
  const invalid = { ...draft, theme: "실적·재무" }
  assert.ok(draftProblems(invalid, [claim]).includes("tag_theme_mismatch"))
})

test("ordinary behavior changes retain product classification and event identity", () => {
  const issue = fixture()
  issue.body = issue.body
    .replace("**테마:** 투자·기업거래", "**테마:** 제품·서비스")
    .replace("**보조 테마:** 인력·조직", "**보조 테마:** 없음")
    .replace("투자 유치, 채용 확대", "기능 변경")
  const article = extractArticles(issue)[0]
  assert.deepEqual(article.classification.event_tags, ["기능 변경"])
  assert.ok(classificationMeta(article).tags.includes("event/기능-변경"))
  const prior = structuredClone(issue)
  prior.body = prior.body.replace("기능 변경", "기능 추가")
  assert.equal(article.id, extractArticles(prior)[0].id)

  const claim = {
    claim_id: "behavior-change",
    subject: "Example",
    evidence: [],
    review: { status: "verified" },
  }
  const draft = {
    title: "Example, 세션의 시스템 메시지 처리 변경",
    lead: [
      { text: "Example의 새 버전이 9월 14일 공개됐다.", claim_ids: [claim.claim_id] },
      { text: "이 버전은 대화 중간 안내의 메시지 역할을 변경했다.", claim_ids: [claim.claim_id] },
    ],
    facts: {
      who: "Example",
      when: "2026-09-14",
      where: null,
      what: "메시지 처리 변경",
      how: null,
      why: null,
    },
    sector: "소프트웨어·클라우드",
    theme: "제품·서비스",
    tags: ["기능 변경"],
    entities: ["Example"],
    explanations: [],
  }
  assertSchema(draft, draftSchema)
  assert.deepEqual(draftProblems(draft, [claim]), [])
  assert.ok(draftProblems({ ...draft, theme: "연구·기술" }, [claim]).includes("tag_theme_mismatch"))
})
