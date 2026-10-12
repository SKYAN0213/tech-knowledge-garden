import test from "node:test"
import assert from "node:assert/strict"
import {
  readerSearchTerms,
  searchReaderEntries,
  readerSearchEvidence,
} from "../web/reader-search.mjs"

const articles = [
  {
    url: "/news/fanuc",
    title: "FANUC·Hitachi 협력 발표",
    type: "뉴스",
    date: "2026-09-30",
    aliases: [],
    keywords: ["FANUC"],
    text: "로봇 자동화 사업 협력",
    source_urls: ["https://fixture.example/original"],
    facts: [
      {
        text: "FANUC은 자동화 사업 협력을 발표했다. 실행은 2027년으로 계획했다.",
        source_urls: ["https://fixture.example/original"],
      },
    ],
  },
  {
    url: "/knowledge/mcp",
    title: "MCP",
    type: "지식",
    date: "2026-10-01",
    aliases: ["Model Context Protocol"],
    keywords: ["권한"],
    text: "도구와 권한 연결 규격",
    facts: [{ text: "MCP는 연결 규격이다.", source_urls: ["https://fixture.example/spec"] }],
  },
  {
    url: "/news/other",
    title: "다른 기업",
    type: "뉴스",
    date: "2026-10-02",
    aliases: [],
    keywords: [],
    text: "자동화 소식",
  },
]
test("question grammar retrieves the same published facts and retains source conditions without generating prose", () => {
  assert.deepEqual(readerSearchTerms("FANUC의 최근 협력은?"), ["fanuc", "협력"])
  const rows = searchReaderEntries(articles, "FANUC의 최근 협력은?")
  assert.equal(rows.length, 1)
  assert.equal(rows[0].url, "/news/fanuc")
  assert.equal(rows[0].matched_facts[0].text, articles[0].facts[0].text)
  assert.deepEqual(rows[0].matched_facts[0].source_urls, articles[0].source_urls)
})
test("search requires every content term, respects type and avoids duplicate URLs", () => {
  assert.equal(searchReaderEntries(articles, "FANUC 성능").length, 0)
  assert.equal(searchReaderEntries(articles, "MCP 권한", { type: "뉴스" }).length, 0)
  assert.equal(searchReaderEntries([...articles, articles[0]], "FANUC").length, 1)
  assert.equal(searchReaderEntries(articles, "알려줘").length, 0)
})
test("registered term aliases retrieve the original entry without inventing a relation or newer date", () => {
  const rows = searchReaderEntries(articles, "Model Context Protocol")
  assert.equal(rows.length, 1)
  assert.equal(rows[0].date, "2026-10-01")
  assert.deepEqual(rows[0].matched_facts[0], articles[1].facts[0])
  assert.equal(rows[0].type, "지식")
})

test("displayed aggregate evidence retains each event date and excludes unrelated original sources", () => {
  const fact = {
    text: "이전 투자 계획",
    published_at: "2026-09-01",
    article_url: "/news/old",
    source_urls: ["https://fixture.example/old"],
  }
  const evidence = readerSearchEvidence({
    type: "기업",
    date: "2026-10-08",
    matched_facts: [fact],
    source_urls: ["https://fixture.example/latest"],
  })
  assert.equal(evidence.dateLabel, "최근 기사 2026-10-08")
  assert.deepEqual(evidence.sourceUrls, ["https://fixture.example/old"])
  assert.deepEqual(evidence.facts, [fact])
})

test("term review dates are labeled as review and facts without dates acquire no publication date", () => {
  const fact = { text: "용어 정의", source_urls: ["https://fixture.example/spec"] }
  const evidence = readerSearchEvidence({
    type: "키워드",
    date: "2026-10-01",
    matched_facts: [fact],
  })
  assert.equal(evidence.dateLabel, "검토 2026-10-01")
  assert.equal(evidence.facts[0].published_at, undefined)
})
