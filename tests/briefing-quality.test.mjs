import test from "node:test"
import assert from "node:assert/strict"
import { researchWindow } from "../scripts/research-window.mjs"
import { attachRecentEvents } from "../scripts/recent-events.mjs"
import { digestMarkdown, feedDescription } from "../scripts/briefings.mjs"
import { issueView } from "../scripts/reader-views.mjs"
import { applyEditorial } from "../scripts/editorial.mjs"
const a = {
  id: "1234567890abcdef",
  title: "검증한 장비 발표",
  summary: "9월 10일 장비를 공개했다. 12월 출하할 예정이다.",
  sector: "로봇·제조",
  urls: ["https://example.com/event"],
  review: { review_status: "verified", published_at: "2026-09-10" },
  classification: { theme: "제품·서비스", entities: [], event_tags: ["신제품"] },
  editorial: {
    kind: "사건 뉴스",
    explanations: [
      {
        heading: "운반과 적재 방식",
        paragraphs: ["하중을 감지한 뒤 팔레트를 들어 올린다."],
        source_urls: ["https://example.com/event"],
      },
    ],
  },
  edition: { meta: { date: "2026-09-11" } },
}
const issue = (date, items, meta = {}) => ({
  key: "Editions/2026/09/" + date + "_0800_Tech_AI_Briefing",
  date,
  items,
  lead: "검증한 사건",
  analysis: "",
  snapshot: {},
  original: {
    body: "",
    meta: {
      date,
      editorial_format: "six-w/v1",
      briefing_format: "sector-five/v1",
      article_reviews: [],
      headlines: [],
      ...meta,
    },
  },
})
test("seven-day discovery retains unresolved old candidates and distinguishes seen from published", () => {
  const c = {
    key: "candidate",
    title: a.title,
    source_urls: [a.urls[0] + "?utm_source=reader"],
    source_published_at: "2026-08-01",
    discovered_at: "2026-09-01T00:00:00Z",
    review_status: "deferred",
    reason: "원문 재확인",
    priority: "high",
  }
  const b = { schema: "research-candidates/v1", candidates: [c] }
  const before = researchWindow("2026-09-13T23:00:00Z", "2026-09-14T02:00:00Z", b, [])
  assert.equal(before.discovery_start, "2026-09-07T02:00:00.000Z")
  assert.equal(before.pending[0].next_route, "historical-review")
  assert.equal(before.pending[0].publication, null)
  const after = researchWindow("2026-09-13T23:00:00Z", "2026-09-14T02:00:00Z", b, [
    issue("2026-09-11", [a]),
  ])
  assert.equal(after.pending.length, 0)
  assert.equal(after.resolved[0].publication.event_id, a.id)
  assert.equal(
    researchWindow("2026-09-01T00:00:00Z", "2026-09-14T02:00:00Z", null, []).discovery_start,
    "2026-09-01T00:00:00.000Z",
  )
})
test("dated recaps deliver the same explanation in web, RSS and Markdown without adding a current event", () => {
  const previous = issue("2026-09-11", [a]),
    current = issue("2026-09-14", [], { recent_event_ids: [a.id], briefing_highlights: [a.id] })
  attachRecentEvents([previous, current])
  assert.equal(current.items.length, 0)
  for (const rendered of [
    issueView(current, (p) => "/" + p, "https://example.org", ""),
    feedDescription(current, "https://example.org"),
    digestMarkdown(current, "https://example.org"),
  ]) {
    assert.ok(rendered.includes("지난 7일 주요 발표"))
    assert.ok(rendered.includes(a.editorial.explanations[0].paragraphs[0]))
    assert.match(rendered, /2026[-.]09[-.]10/)
    assert.match(rendered.split("지난 7일 주요 발표")[0], /2026[-.]09[-.]10/)
    assert.ok(rendered.includes(a.id))
    assert.ok(rendered.includes(a.urls[0]))
    assert.ok(!rendered.includes("오늘의 심층 분석"))
  }
})
test("recaps reject unknown, excluded, unreviewed, stale or duplicated current events", () => {
  for (const change of [
    (x) => (x.review.review_status = "unreviewed"),
    (x) => (x.review.review_status = "excluded"),
    (x) => (x.review.published_at = "2026-09-01"),
    (x) => (x.id = "different"),
  ]) {
    const copy = structuredClone(a)
    change(copy)
    assert.throws(() =>
      attachRecentEvents([
        issue("2026-09-11", [copy]),
        issue("2026-09-14", [], { recent_event_ids: [a.id] }),
      ]),
    )
  }
  assert.throws(() =>
    attachRecentEvents([
      issue("2026-09-11", [a]),
      issue("2026-09-14", [a], { recent_event_ids: [a.id] }),
    ]),
  )
})
test("explanations require matching article prose and article evidence", () => {
  const record = {
    ...a.editorial,
    title: a.title,
    region: "해외",
    lead: a.summary,
    papers: [],
    relations: [],
    topic_ids: [],
    facts: Object.fromEntries(
      ["who", "when", "where", "what", "how", "why"].map((k) => [k, "확인 사실"]),
    ),
  }
  const i = {
    meta: {
      editorial_format: "six-w/v1",
      article_reviews: [],
      headlines: [a.title],
      article_records: [record],
    },
  }
  const story = {
    ...a,
    body: a.summary + "\n### 운반과 적재 방식\n하중을 감지한 뒤 팔레트를 들어 올린다.",
  }
  assert.doesNotThrow(() => applyEditorial(i, [story]))
  const bad = structuredClone(i)
  bad.meta.article_records[0].explanations[0].source_urls = ["https://example.com/unread"]
  assert.throws(() => applyEditorial(bad, [story]), /article sources/)
  assert.throws(() => applyEditorial(i, [{ ...story, body: a.summary }]), /source prose/)
})
