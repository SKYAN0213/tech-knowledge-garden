import test from "node:test"
import assert from "node:assert/strict"
import { readerSemanticConcepts, withReaderSemanticConcepts } from "../scripts/site.mjs"
import { articleTags } from "../scripts/reader-cards.mjs"
import { buildReaderKnowledge } from "../scripts/reader-knowledge.mjs"

const eventId = "0123456789abcdef"
const href = (p) => "/garden/" + p.toLowerCase()
const source = {
  id: eventId, title: "로봇 제어 API 발표", urls: ["https://example.org/news"],
  review: { event_id: eventId, review_status: "verified", published_at: "2026-10-20", reviewed_at: "2026-10-25", concept_ids: [] },
  edition: { slug: "Editions/2026/10/issue", meta: { schema_version: "tech-ai-magazine/v2", date: "2026-10-25" } },
  editorial: { lead: "회사는 로봇 명령과 상태 확인 API를 발표했다.", explanations: [] },
}
const note = {
  path: "Knowledge/Robotics/Robot API",
  meta: { schema_version: "tech-encyclopedia/v2", entry_type: "concept", concept_id: "robot-api", label: "로봇 제어 API", keywords: ["로봇 제어"], aliases: [], last_reviewed: "2026-10-25", verified_sources: ["https://example.org/definition"], map_review: { decision: "include", kind: "protocol", reviewed: "2026-10-25", reason: "제어 요청과 응답의 전문 작동 원리를 직접 검토했다." } },
  body: "## 한 문장 정의\n\n로봇에 명령을 보내고 실행 상태를 받는 인터페이스다. [원문](https://example.org/definition)\n",
}
const graph = (termIds = ["robot-api"], status = "reviewed_links") => ({
  nodes: [{ id: "robot-api" }],
  articles: [{ id: "news:" + eventId, semanticReviewStatus: status, termIds, relation_candidates: [{ concept_id: "private-candidate" }] }],
})

test("reader projects reviewed graph links into tags and term histories without editing native metadata", () => {
  const before = JSON.stringify(source)
  const projected = withReaderSemanticConcepts(source, readerSemanticConcepts(graph()))
  assert.deepEqual(projected.review.concept_ids, ["robot-api"])
  const links = projected.review.concept_ids.map(() => ({ path: note.path, label: note.meta.label }))
  assert.match(articleTags({ ...projected, conceptLinks: links }, href), /href="\/garden\/knowledge\/robotics\/robot api"/)
  const model = buildReaderKnowledge({ articles: [projected], knowledge: [note], href })
  assert.deepEqual(model.events[0].concept_ids, ["robot-api"])
  assert.deepEqual(model.terms[0].event_ids, [eventId])
  assert.equal(JSON.stringify(source), before)
  assert.equal(JSON.stringify(model).includes("private-candidate"), false)
})

test("reviewed-none and missing graph articles cannot revive legacy metadata concepts", () => {
  const old = { ...source, review: { ...source.review, concept_ids: ["robot-api"] } }
  for (const byEvent of [readerSemanticConcepts(graph([], "reviewed_none")), new Map()]) {
    const projected = withReaderSemanticConcepts(old, byEvent)
    assert.deepEqual(projected.review.concept_ids, [])
    const model = buildReaderKnowledge({ articles: [projected], knowledge: [note], href })
    assert.deepEqual(model.terms[0].event_ids, [])
    assert.deepEqual(old.review.concept_ids, ["robot-api"])
  }
})

test("reader rejects inconsistent graph assignments rather than falling back to old IDs", () => {
  for (const value of [graph(["missing"]), graph(["robot-api", "robot-api"]), graph(["robot-api"], "reviewed_none"), { ...graph(), articles: [...graph().articles, ...graph().articles] }])
    assert.throws(() => readerSemanticConcepts(value), /Invalid reader semantic concept projection/)
})
