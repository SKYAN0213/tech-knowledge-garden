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
test("Korean news sentences followed by lowercase technical names remain separate", () => {
  const prose =
    "GitHub는 7월 28일 악성 패키지 보고를 자동 반영한다고 발표했다. npm과 PyPI의 경보 범위가 넓어졌다."
  assert.equal(readerSentences(prose).length, 2)
  const r = inspectReaderQuality(record({ lead: [row(prose)] }), [
    { ...claim, published_at: "2026-07-28" },
  ])
  assert.equal(r.blocked, false)
  assert.equal(r.lead_sentences, 2)
  assert.equal(
    readerSentences("API v1.2.3은 지연이 0.5초다. npm 경로는 https://a.com/x다.").length,
    2,
  )
})
test("lowercase starts cannot conceal excessive or repeated Korean news sentences", () => {
  const excessive = inspectReaderQuality(
    record({
      lead: [row("공개했다. npm을 지원한다. api를 제공한다. sdk를 추가한다. cli를 출시한다.")],
    }),
    [],
  )
  assert.equal(excessive.lead_sentences, 5)
  assert.ok(excessive.findings.some((f) => f.code === "lead_sentence_count"))
  const duplicate = inspectReaderQuality(
    record({
      lead: [row("기업은 10월 1일 공개했다. npm을 지원한다.")],
      explanations: [{ paragraphs: [row("npm을 지원한다.")] }],
    }),
    [claim],
  )
  assert.ok(duplicate.findings.some((f) => f.code === "repeated_sentence"))
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

const rateClaim = (id, value, unit = "%", status = "verified") => ({
  ...claim,
  claim_id: id,
  statement: "시험 기업이 비교 결과를 발표했다.",
  numbers: [{ literal: value, unit, condition: "동일 조건에서 전년 대비" }],
  review: { status },
})
const rateFindings = (r, claims) =>
  inspectReaderQuality(r, claims).findings.filter((f) => f.code === "unsupported_percentage")

test("a percentage from another verified fact cannot support a paragraph's changed rate", () => {
  const r = record({
    lead: [
      row("시험 기업은 10월 1일 매출이 17.9% 증가했다고 밝혔다."),
      row("같은 조건을 적용했다."),
    ],
  })
  const facts = [rateClaim("a", "16.9"), rateClaim("other", "17.9")]
  const report = inspectReaderQuality(r, facts)
  assert.deepEqual(rateFindings(r, facts)[0].values, [{ value: "17.9", unit: "percent" }])
  assert.throws(
    () =>
      assertReaderQuality(report, {
        numbers_checked: true,
        reader_quality_review: { repetition_checked: true },
      }),
    /unsupported_percentage/,
  )
  r.draft.lead[0].claim_ids.push("other")
  r.draft_id = draftFingerprint(r.draft)
  assert.equal(rateFindings(r, facts).length, 0)
})

test("fullwidth values and exact decimal equivalents preserve reviewed percentages", () => {
  const r = record({
    lead: [
      row("시험 기업은 10월 1일 매출이 １６．９０％ 증가했다고 밝혔다."),
      row("같은 조건을 적용했다."),
    ],
  })
  assert.equal(rateFindings(r, [rateClaim("a", "+016.900", "％")]).length, 0)
  r.draft.lead[0].text = "시험 기업은 10월 1일 증가율을 0.12345678901234567892%로 발표했다."
  r.draft_id = draftFingerprint(r.draft)
  assert.equal(rateFindings(r, [rateClaim("a", "0.12345678901234567891")]).length, 1)
})

test("percentages and percentage points cannot substitute for each other", () => {
  for (const text of ["2%p", "2 퍼센트포인트", "2 percentage points"]) {
    const r = record({
      lead: [
        row(`시험 기업은 10월 1일 비율이 ${text} 늘었다고 밝혔다.`),
        row("같은 조건을 적용했다."),
      ],
    })
    assert.equal(rateFindings(r, [rateClaim("a", "2", "%p")]).length, 0)
    assert.equal(rateFindings(r, [rateClaim("a", "2", "%")]).length, 1)
  }
})

test("only verified statement or structured rate evidence supports reader percentages", () => {
  const r = record({
    lead: [row("시험 기업은 10월 1일 비율이 50%라고 밝혔다."), row("같은 조건을 적용했다.")],
  })
  assert.equal(
    rateFindings(r, [{ ...claim, statement: "시험 기업의 비율은 50 percent다." }]).length,
    0,
  )
  for (const c of [
    { ...rateClaim("a", "50"), review: { status: "deferred" } },
    {
      ...claim,
      statement: "비율은 공개하지 않았다.",
      evidence: [{ quote: "다른 부문의 비율은 50%다." }],
    },
    rateClaim("a", "50", "엔"),
  ])
    assert.equal(rateFindings(r, [c]).length, 1)
})

test("title, headings, explanation, analysis and six-W metadata use their own cited facts", () => {
  const facts = [rateClaim("a", "16.9"), rateClaim("b", "24.4")]
  const r = record({
    title: "시험 기업, 24.4% 연간 계획",
    explanations: [
      { heading: "24.4% 계획", paragraphs: [row("회사는 연간 24.4% 증가를 계획했다.", ["b"])] },
    ],
  })
  assert.equal(rateFindings(r, facts).length, 0)
  r.draft.explanations[0].heading = "16.9% 계획"
  r.draft.analysis = row("32% 성장을 확인했다.", ["a", "b"])
  r.draft.facts.how = "90% 투자"
  r.draft.title = "시험 기업, 100% 성장"
  r.draft_id = draftFingerprint(r.draft)
  assert.deepEqual(
    rateFindings(r, facts)
      .map((f) => f.locations[0])
      .sort(),
    ["analysis", "explanations[0].heading", "facts.how", "title"],
  )
})

test("URL encoding, publication dates and ordinary amounts are not percentage claims", () => {
  const r = record({
    lead: [
      row("시험 기업은 10월 1일 API v1.2.3을 공개했다."),
      row("주소는 https://example.org/20%25이고 금액은 1,923억 원이다."),
    ],
  })
  const before = JSON.stringify(r)
  assert.equal(rateFindings(r, [claim]).length, 0)
  assert.equal(JSON.stringify(r), before)
})

test("a minus sign is not dropped when checking a stated percentage", () => {
  const r = record({
    lead: [row("시험 기업은 10월 1일 변화율이 -2%라고 밝혔다."), row("같은 조건을 적용했다.")],
  })
  assert.equal(rateFindings(r, [rateClaim("a", "2")]).length, 1)
  assert.equal(rateFindings(r, [rateClaim("a", "−2")]).length, 0)
})

test("structured rate literals may retain the original percent sign", () => {
  const r = record({
    lead: [row("시험 기업은 10월 1일 비율을 16.9%로 발표했다."), row("같은 조건을 적용했다.")],
  })
  assert.equal(rateFindings(r, [rateClaim("a", "１６．９％", "%")]).length, 0)
  assert.equal(rateFindings(r, [rateClaim("a", "16.9%p", "%")]).length, 1)
})
