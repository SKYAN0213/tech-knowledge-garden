import test from "node:test"
import assert from "node:assert/strict"
import { draftFingerprint } from "../scripts/research/editor.mjs"
import { inspectReaderQuality } from "../scripts/research/reader-quality.mjs"

function findings(text, unit, literal = "7.5") {
  const draft = {
    title: "비율 비교 결과",
    lead: [
      { text: `기업은 10월 1일 변화가 ${text}라고 밝혔다.`, claim_ids: ["a"] },
      { text: "같은 시험 조건에서 비교했다.", claim_ids: ["a"] },
    ],
    facts: {
      who: "기업",
      when: "2026-10-01",
      where: null,
      what: "비율 비교",
      how: null,
      why: null,
    },
    explanations: [],
  }
  const claim = {
    claim_id: "a",
    published_at: "2026-10-01",
    statement: "기업이 비교 결과를 발표했다.",
    numbers: [{ literal, unit }],
    review: { status: "verified" },
  }
  return inspectReaderQuality({ draft, draft_id: draftFingerprint(draft) }, [
    claim,
  ]).findings.filter((f) => f.code === "unsupported_percentage")
}

test("Korean percent-point and hyphenated English aliases preserve reviewed percentage points", () => {
  for (const alias of [
    "%포인트",
    "% 포인트",
    "percentage-point",
    "percentage-points",
    "percent-point",
    "percentage‑point",
    "pp",
  ])
    for (const unit of ["%p", "percentage-point", "percentage points", "pp"])
      assert.equal(findings("7.5" + alias, unit).length, 0, alias + " <- " + unit)
  assert.equal(findings("7.5%포인트", "percentage-point", "7.5%포인트").length, 0)
})

test("new aliases cannot substitute percent for points, change values, or consume ppm", () => {
  for (const alias of [
    "%포인트",
    "% 포인트",
    "percentage-point",
    "percentage-points",
    "percent-point",
    "percentage‑point",
    "pp",
  ]) {
    assert.equal(findings("7.5" + alias, "%").length, 1, alias + " is not percent")
    assert.equal(
      findings("7.6" + alias, "percentage-point").length,
      1,
      alias + " keeps exact value",
    )
  }
  for (const unit of ["percentage-point", "pp", "%p"])
    assert.equal(findings("7.5%", unit).length, 1, "percent is not " + unit)
  assert.equal(findings("7.5ppm", "%").length, 0)
})
