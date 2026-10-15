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

test("stock and company counts require the exact cited verified count", () => {
  const unsupported = record({
    title: "35개 종목 시세 공개",
    lead: [
      row("기업은 10월 1일 35개 로봇 관련 기업의 시세를 공개했다."),
      row("지표를 표로 제시했다."),
    ],
    facts: { when: "2026-10-01", what: "35개 로봇 관련 기업 시세 공개" },
  })
  const c = {
    ...claim,
    statement: "기업은 시세를 공개했다.",
    numbers: [],
    evidence: [{ quote: "35개 종목" }],
  }
  const report = inspectReaderQuality(unsupported, [c])
  assert.deepEqual(
    report.findings.filter((f) => f.code === "unsupported_count").map((f) => f.locations[0]),
    ["lead[0]", "title", "facts.what"],
  )
  const valid = { ...c, statement: "35개 로봇 관련 기업의 시세를 공개했다." }
  const checked = inspectReaderQuality(unsupported, [valid])
  assert.deepEqual(
    checked.findings.filter((f) => f.code === "unsupported_count").map((f) => f.locations[0]),
    ["title"],
  )
  const stocks = { ...c, statement: "35개 종목의 시세를 공개했다." }
  const countClaim = { ...stocks, claim_id: "b" }
  assert.ok(
    inspectReaderQuality(unsupported, [c, countClaim]).findings.some(
      (f) => f.locations[0] === "title" && f.code === "unsupported_count",
    ),
  )
  assert.ok(
    inspectReaderQuality(unsupported, [
      { ...valid, review: { status: "unreviewed" } },
    ]).findings.some((f) => f.code === "unsupported_count"),
  )
})
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

const amountFindings = (r, claims) =>
  inspectReaderQuality(r, claims).findings.filter((f) => f.code === "unsupported_amount")
const amountClaim = (literal, unit = "원", status = "verified") => ({
  ...claim,
  statement: "기업이 자금 조달을 발표했다.",
  numbers: [{ literal, unit }],
  review: { status },
})

test("reader amounts reject changed currencies, scale and facts even with an editorial check", () => {
  const r = record({
    lead: [row("기업은 10월 1일 5억 달러를 조달했다."), row("투자자를 발표했다.")],
  })
  assert.equal(amountFindings(r, [amountClaim("5억", "원")]).length, 1)
  assert.equal(amountFindings(r, [amountClaim("5", "달러")]).length, 1)
  const other = { ...amountClaim("5억", "달러"), claim_id: "other" }
  assert.equal(amountFindings(r, [amountClaim("5억", "원"), other]).length, 1)
  assert.throws(
    () =>
      assertReaderQuality(inspectReaderQuality(r, [amountClaim("5억", "원")]), {
        numbers_checked: true,
        reader_quality_review: { repetition_checked: true },
      }),
    /unsupported_amount/,
  )
})

test("reader amounts use exact Korean and English scales without floating point or exchange rates", () => {
  for (const [text, value, unit] of [
    ["1,923억원", "192300000000", "KRW"],
    ["4조7000억 원", "4700000000000", "원"],
    ["€0.5 billion", "5억", "유로"],
    ["$5 million,", "5000000", "달러"],
    ["US$5.5.", "5.5", "USD"],
    ["30億円", "30억", "JPY"],
    ["5亿元", "5억", "CNY"],
    ["500만 달러", "5 million", "달러"],
    ["ＵＳ＄１．５０ｍｉｌｌｉｏｎ", "1500000.00", "USD"],
    ["1조 2000억 3000만 원", "1200030000000", "원"],
    ["-2만 원", "−20000", "원"],
    ["0.12345678901234567892 유로", "0.12345678901234567892", "EUR"],
  ]) {
    const r = record({
      lead: [row(`기업은 10월 1일 금액을 ${text}으로 발표했다.`), row("조달을 완료했다.")],
    })
    assert.equal(amountFindings(r, [amountClaim(value, unit)]).length, 0, text)
  }
  const r = record({
    lead: [row("기업은 10월 1일 0.12345678901234567892유로를 발표했다."), row("조달을 완료했다.")],
  })
  assert.equal(amountFindings(r, [amountClaim("0.12345678901234567891", "유로")]).length, 1)
})

test("Korean won financial ranges preserve each reviewed endpoint without converting currencies", () => {
  const c = {
    ...claim,
    statement:
      "The operating profit estimate ranges from 107.3 trillion to 107.5 trillion Korean won.",
    numbers: [
      { literal: "107.3", unit: "trillion Korean won" },
      { literal: "107.5", unit: "trillion Korean won" },
    ],
  }
  const r = record({
    lead: [row("기업은 10월 1일 잠정 실적을 발표했다."), row("추정 범위를 제시했다.")],
    explanations: [{ paragraphs: [row("영업이익 추정치는 107.3조원~107.5조원이다.")] }],
  })
  assert.equal(amountFindings(r, [c]).length, 0)
  r.draft.explanations[0].paragraphs[0].text = "영업이익 추정치는 107.3조원~107.6조원이다."
  r.draft_id = draftFingerprint(r.draft)
  assert.equal(amountFindings(r, [c]).length, 1)
  r.draft.explanations[0].paragraphs[0].text = "영업이익 추정치는 107.3조달러~107.5조달러다."
  r.draft_id = draftFingerprint(r.draft)
  assert.equal(amountFindings(r, [c]).length, 1)
  r.draft.explanations[0].paragraphs[0].text = "영업이익 추정치는 107.3조원~107.5조원이다."
  r.draft_id = draftFingerprint(r.draft)
  assert.equal(amountFindings(r, [{ ...c, review: { status: "unreviewed" } }]).length, 1)
})

test("qualified dollar currencies and a negative amount keep their exact identity", () => {
  for (const [reader, value, unit] of [
    ["AU$5 million", "5 million", "USD"],
    ["5 캐나다 달러", "5", "달러"],
    ["-5 유로", "5", "EUR"],
  ]) {
    const r = record({
      lead: [row(`기업은 10월 1일 ${reader}를 발표했다.`), row("조달을 완료했다.")],
    })
    assert.equal(amountFindings(r, [amountClaim(value, unit)]).length, 1)
  }
})

test("reader amount locations stay bound to their own verified facts and do not use source quotes", () => {
  const facts = [amountClaim("5억"), { ...amountClaim("10억"), claim_id: "b" }]
  const r = record({
    title: "기업, 10억원 조달",
    explanations: [
      { heading: "10억원 계약", paragraphs: [row("회사는 10억원 계약을 체결했다.", ["b"])] },
    ],
  })
  assert.equal(amountFindings(r, facts).length, 0)
  r.draft.explanations[0].heading = "5억원 계약"
  r.draft.analysis = row("회사에는 100억원의 매출이 발생한다.")
  r.draft.facts.how = "20억 원 투자"
  r.draft.title = "기업, 30억원 조달"
  r.draft_id = draftFingerprint(r.draft)
  assert.deepEqual(
    amountFindings(r, facts)
      .map((f) => f.locations[0])
      .sort(),
    ["analysis", "explanations[0].heading", "facts.how", "title"],
  )
  const q = record({ lead: [row("기업은 10월 1일 5억원을 조달했다."), row("조달을 완료했다.")] })
  assert.equal(amountFindings(q, [amountClaim("5억", "원", "deferred")]).length, 1)
  assert.equal(
    amountFindings(q, [{ ...claim, evidence: [{ quote: "금액은 5억원이다." }] }]).length,
    1,
  )
  assert.equal(amountFindings(q, [{ ...claim, statement: "기업이 5억원을 조달했다." }]).length, 0)
})

test("ordinary dates, versions, units and URL money text do not create monetary claims", () => {
  const r = record({
    lead: [
      row("기업은 10월 1일 API v1.2.3을 공개했다."),
      row("GPU 5개와 300토큰으로 https://example.org/$500을 처리한다."),
    ],
  })
  assert.equal(amountFindings(r, [claim]).length, 0)
})

test("unapproved counts in quoted context or a different paragraph cannot enter reader prose", () => {
  const facts = [
    {
      ...claim,
      statement: "The company plans hands-on workshops.",
      numbers: [],
      evidence: [{ quote: "25+ hands-on workshops" }],
    },
    { ...claim, claim_id: "b", statement: "The company plans 25 workshops.", numbers: [] },
  ]
  const r = inspectReaderQuality(
    record({ explanations: [{ paragraphs: [row("25개 이상의 실습 워크숍을 마련한다.")] }] }),
    facts,
  )
  assert.ok(
    r.findings.some(
      (f) =>
        f.code === "unsupported_count" &&
        f.values[0].unit === "workshop" &&
        f.values[0].value === "25",
    ),
  )
  assert.throws(
    () => assertReaderQuality(r, { reader_quality_review: { repetition_checked: true } }),
    /unsupported_count/,
  )
  const allowed = inspectReaderQuality(
    record({ explanations: [{ paragraphs: [row("25개 이상의 실습 워크숍을 마련한다.", ["b"])] }] }),
    facts,
  )
  assert.ok(!allowed.findings.some((f) => f.code === "unsupported_count"))
})

test("explicit count values preserve units, scaling, metadata and verified scope", () => {
  const facts = [
    {
      ...claim,
      statement:
        "More than 3,000 security leaders from over 1,200 organizations will attend 150 sessions and 25 hands-on workshops.",
      numbers: [],
    },
  ]
  for (const text of [
    "3,000명이 참가할 계획이다.",
    "1,200개가 넘는 조직이 참여한다.",
    "150개를 넘는 세션을 예정했다.",
    "25개 실습 워크숍을 마련한다.",
    "3천 명이 등록했다.",
  ]) {
    const r = inspectReaderQuality(record({ explanations: [{ paragraphs: [row(text)] }] }), facts)
    assert.ok(!r.findings.some((f) => f.code === "unsupported_count"), text)
  }
  const wrong = inspectReaderQuality(
    record({ explanations: [{ paragraphs: [row("25명이 참가한다. 120개 세션을 마련한다.")] }] }),
    facts,
  )
  assert.deepEqual(wrong.findings.find((f) => f.code === "unsupported_count").values, [
    { unit: "person", value: "25" },
    { unit: "session", value: "120" },
  ])
  for (const status of ["verified", "deferred"]) {
    const r = inspectReaderQuality(
      record({ explanations: [{ paragraphs: [row("4인 팀이 참가할 수 있다.")] }] }),
      [
        {
          ...claim,
          review: { status },
          statement: "The competition allows teams.",
          numbers: [{ literal: "4", unit: "persons", condition: "maximum" }],
        },
      ],
    )
    assert.equal(
      r.findings.some((f) => f.code === "unsupported_count"),
      status !== "verified",
    )
  }
})

test("plus counts remain numeric evidence without treating source quotes as approval", () => {
  const fact = { ...claim, statement: "There are 25+ hands-on workshops.", numbers: [] }
  const r = inspectReaderQuality(
    record({ explanations: [{ paragraphs: [row("25개 이상의 실습 워크숍을 마련한다.")] }] }),
    [fact],
  )
  assert.ok(!r.findings.some((f) => f.code === "unsupported_count"))
})

test("dates, technical versions, identifiers, length units and URLs are not explicit object counts", () => {
  const r = inspectReaderQuality(
    record({
      title: "2026년 행사와 API v1.2",
      explanations: [
        {
          heading: "11월 2~4일 행사",
          paragraphs: [
            row(
              "83개국에서 확인한 API v1.2와 27B 모델, URL https://example.org/25workshops 를 소개한다. NASA는 12인치(30cm)를 넘는 비를 보고했다.",
            ),
          ],
        },
      ],
    }),
    [claim],
  )
  assert.ok(!r.findings.some((f) => f.code === "unsupported_count"))
})

test("reader amounts distinguish currency suffixes from technical words", () => {
  for (const text of ["us-east-1 엔드포인트를 사용한다.", "모델 1 엔진을 실행한다.", "통화 1 원칙을 설명한다."]) {
    const r = record({ lead: [row(`기업은 10월 1일 API를 공개했다.`), row(text)] })
    assert.equal(amountFindings(r, [claim]).length, 0, text)
  }
  for (const text of ["금액은 1엔이다.", "금액은 1엔을 청구한다.", "금액은 1엔으로 정한다.", "금액은 1 엔."]) {
    const r = record({ lead: [row(`기업은 10월 1일 가격을 공개했다.`), row(text)] })
    assert.equal(amountFindings(r, [claim]).length, 1, text)
    assert.equal(amountFindings(r, [amountClaim("1", "엔")]).length, 0, text)
  }
})

test("verified worker counts support Korean person units without importing uncited figures", () => {
  const facts = [{ ...claim, statement: "The partnership supports the goal of training 10 million workers by 2030.", numbers: [] }, { ...claim, claim_id: "other", statement: "20 million workers", numbers: [] }]
  const r = inspectReaderQuality(record({ explanations: [{ paragraphs: [row("2030년까지 근로자 1,000만 명을 교육하는 목표를 지원한다.")] }] }), facts)
  assert.ok(!r.findings.some(f => f.code === "unsupported_count"))
  const wrong = inspectReaderQuality(record({ explanations: [{ paragraphs: [row("2,000만 명을 교육하는 목표를 지원한다.")] }] }), facts)
  assert.ok(wrong.findings.some(f => f.code === "unsupported_count"))
})
