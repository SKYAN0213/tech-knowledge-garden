import test from "node:test"
import assert from "node:assert/strict"
import { draftFingerprint } from "../scripts/research/editor.mjs"
import { inspectReaderQuality } from "../scripts/research/reader-quality.mjs"

const fact = {
  claim_id: "annual-revenue",
  statement: "회사 매출은 1,331억 9천만 달러로 전년도 매출과 비교된다.",
  published_at: "2026-09-30",
  numbers: [],
  review: { status: "verified" },
}

function inspect(amount, claims = [fact], claimId = fact.claim_id) {
  const draft = {
    title: `회사, 매출 ${amount} 발표`,
    lead: [
      { text: `회사는 9월 30일 매출을 ${amount}로 발표했다.`, claim_ids: [claimId] },
      { text: "회사의 실적 자료에 담긴 수치다.", claim_ids: [claimId] },
    ],
    facts: { what: `매출 ${amount} 발표`, when: "2026-09-30" },
    explanations: [],
  }
  return inspectReaderQuality({ draft, draft_id: draftFingerprint(draft) }, claims)
}

test("currency amounts with the Korean particle 로 retain exact support in titles and prose", () => {
  const report = inspect("1,331억 9천만 달러")
  assert.equal(report.blocked, false)
  assert.deepEqual(report.findings, [])
})

test("recognizing 로 still rejects changed amounts, currencies and uncited or unreviewed facts", () => {
  for (const [amount, claims, claimId] of [
    ["1,332억 달러", [fact], fact.claim_id],
    ["1,331억 9천만 유로", [fact], fact.claim_id],
    ["1,331억 9천만 달러", [{ ...fact, review: { status: "unreviewed" } }], fact.claim_id],
    ["1,331억 9천만 달러", [fact], "different-fact"],
  ]) {
    const report = inspect(amount, claims, claimId)
    assert.equal(report.blocked, true)
    assert.deepEqual(
      report.findings.filter((f) => f.code === "unsupported_amount").map((f) => f.locations[0]),
      ["lead[0]", "title", "facts.what"],
    )
  }
})
