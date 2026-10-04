import test from "node:test"
import assert from "node:assert/strict"
import { draftFingerprint } from "../scripts/research/editor.mjs"
import {
  readerSentences,
  inspectReaderQuality,
  assertReaderQuality,
} from "../scripts/research/reader-quality.mjs"

const claim = { claim_id: "a", review: { status: "verified" }, published_at: "2026-10-01" }
const row = (text, ids = ["a"]) => ({ text, claim_ids: ids })
function record(change = {}) {
  const draft = {
    lead: [row("기업은 10월 1일 API를 공개했다."), row("사용자는 상태를 조회할 수 있다.")],
    explanations: [],
    facts: { when: "2026-10-01" },
    ...change,
  }
  return { draft, draft_id: draftFingerprint(draft) }
}
test("reader sentence boundaries preserve numbers, versions, URLs and reported Korean quotes", () => {
  assert.equal(readerSentences("API v1.2.3은 지연이 0.5초다. 주소는 https://a.com/x다.").length, 2)
  assert.equal(readerSentences("“공개했다.”라고 밝혔다. 상태 조회를 제공한다.").length, 2)
  assert.equal(readerSentences("“가능하다!”고 밝혔다. 다음 요청을 받는다.").length, 2)
})
test("actual lead sentences and length block approval regardless of array length", () => {
  const r = inspectReaderQuality(
    record({ lead: [row("출시했다. 조회한다. 처리한다."), row("공개했다. 완료했다.")] }),
    [claim],
  )
  assert.equal(r.lead_sentences, 5)
  assert.ok(r.findings.some((f) => f.code === "lead_sentence_count"))
  assert.throws(() => assertReaderQuality(r, {}), /lead_sentence_count/)
  const long = inspectReaderQuality(
    record({ lead: [row("10월 1일 " + "가".repeat(901) + "다."), row("공개했다.")] }),
    [claim],
  )
  assert.ok(long.findings.some((f) => f.code === "lead_length"))
})
test("known dates must appear in reader prose, not only in facts metadata", () => {
  for (const date of ["10월 1일", "2026년 10월 1일", "2026-10-01", "2026.10.1", "2026/10/01"]) {
    const r = inspectReaderQuality(
      record({ lead: [row(`기업은 ${date} API를 공개했다.`), row("상태를 조회한다.")] }),
      [claim],
    )
    assert.equal(r.blocked, false)
  }
  const r = inspectReaderQuality(
    record({ lead: [row("기업은 10월 11일 API를 공개했다."), row("상태를 조회한다.")] }),
    [claim],
  )
  assert.ok(r.findings.some((f) => f.code === "lead_date_missing"))
  const undated = inspectReaderQuality(record({ facts: { when: null } }), [
    { ...claim, published_at: null },
  ])
  assert.ok(!undated.findings.some((f) => f.code === "lead_date_missing"))
})
test("exact repeated sentences are blocked and new explanation detail sharing a fact needs direct review", () => {
  const duplicate = inspectReaderQuality(
    record({ explanations: [{ paragraphs: [row("사용자는 상태를 조회할 수 있다.")] }] }),
    [claim],
  )
  assert.ok(duplicate.findings.some((f) => f.code === "repeated_sentence"))
  assert.throws(
    () => assertReaderQuality(duplicate, { reader_quality_review: { repetition_checked: true } }),
    /repeated_sentence/,
  )
  const detail = inspectReaderQuality(
    record({
      explanations: [{ paragraphs: [row("PUT 요청 뒤 반환된 식별자로 GET을 호출한다.")] }],
    }),
    [claim],
  )
  assert.equal(detail.blocked, false)
  assert.equal(detail.requires_repetition_review, true)
  assert.throws(() => assertReaderQuality(detail, {}), /Explicit repetition review/)
  assert.doesNotThrow(() =>
    assertReaderQuality(detail, { reader_quality_review: { repetition_checked: true } }),
  )
})
test("quality inspection preserves input and rejects a changed draft", () => {
  const r = record(),
    before = JSON.stringify(r)
  inspectReaderQuality(r, [claim])
  assert.equal(JSON.stringify(r), before)
  r.draft.lead[0].text = "변경했다."
  assert.throws(() => inspectReaderQuality(r, [claim]), /exact draft/)
})
