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
} from "../scripts/themes.mjs"
import { newsView } from "../scripts/reader-views.mjs"
import { articleSearchText } from "../scripts/knowledge.mjs"
import { matchesNews } from "../web/news-filter.mjs"

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
