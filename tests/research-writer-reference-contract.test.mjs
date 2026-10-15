import test from "node:test"
import assert from "node:assert/strict"
import { assertSchema, sha256, sourceId } from "../scripts/research/contracts.mjs"
import {
  assertDraftReferences,
  draftFingerprint,
  draftProblems,
  draftSchema,
  schemaForDraft,
  writeDraft,
} from "../scripts/research/editor.mjs"
import { prepareEditorialDraft } from "../scripts/research/editorial-authoring.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { inspectReaderQuality, assertReaderQuality } from "../scripts/research/reader-quality.mjs"

// Contract regressions only; these synthetic inputs are not evaluation gold.
function fixture() {
  const source_id = sourceId("https://example.org/release")
  const text = "Example released a service. The service will support request inspection."
  const parse_id = sha256(text)
  const parse = {
    schema_version: "source-parse/v1",
    source_id,
    source_version_id: source_id + ":" + sha256(text),
    parse_id,
    status: "extracted",
    title: "Synthetic service announcement",
    dates: { published_at: "2026-10-09", observed_at: "2026-10-10T00:00:00Z" },
    blocks: [{ block_id: parse_id + ":b1", text, locator: { text_hash: sha256(text) } }],
    quality: { missing_pages: [] },
  }
  const ids = ["8b36d7740393891f2c7e3375", "54142c88fb6d96b1d4d47da4"]
  const claims = recordFactReview(
    ids.map((claim_id, index) => ({
      claim_id,
      candidate_key: "source-" + source_id,
      subject: "Example",
      statement: index ? "Example은 요청 조회를 지원할 계획이다." : "Example은 서비스를 공개했다.",
      claim_kind: "attributed_fact",
      event_state: index ? "planned" : "completed",
      published_at: "2026-10-09",
      effective_period: null,
      numbers: [],
      evidence: [
        {
          source_id,
          source_version_id: parse.source_version_id,
          parse_id,
          block_id: parse.blocks[0].block_id,
          quote: index
            ? "The service will support request inspection."
            : "Example released a service.",
          support: "direct",
        },
      ],
    })),
    ids.map((claim_id) => ({
      claim_id,
      status: "verified",
      reason: "Synthetic source contract",
      source_read: true,
      entailment_checked: true,
      identity_checked: true,
      numbers_checked: true,
      time_checked: true,
    })),
    { reviewer: "fixture", reviewed_at: "2026-10-10" },
    [parse],
  )
  const draft = {
    title: "Example, 서비스 공개",
    lead: [
      { text: "Example은 2026년 10월 9일 서비스를 공개했다.", claim_ids: [ids[0]] },
      { text: "회사는 요청 조회를 지원할 계획이다.", claim_ids: [ids[1]] },
    ],
    facts: {
      who: "Example",
      when: "2026-10-09",
      where: null,
      what: "서비스 공개",
      how: null,
      why: null,
    },
    sector: "소프트웨어·클라우드",
    theme: "제품·서비스",
    tags: ["신제품"],
    entities: ["Example"],
    explanations: [],
  }
  return { ids, claims, parses: [parse], draft }
}
const record = (draft) => ({ draft, draft_id: draftFingerprint(draft) })

test("new writer requests bind exact supplied IDs and preserve the historical output shape", async () => {
  const f = fixture(),
    original = structuredClone(f),
    before = structuredClone(draftSchema)
  let request
  const output = await writeDraft(
    {
      structured: async (input) => {
        request = input
        return { output: f.draft, provenance: { provider: "synthetic-contract" } }
      },
    },
    [...f.claims, { ...f.claims[0], claim_id: "unreviewed", review: { status: "unreviewed" } }],
  )
  assert.deepEqual(output.draft, original.draft)
  assert.deepEqual(output.claim_ids, f.ids)
  assert.equal(output.public_approved, false)
  for (const sentence of [
    request.schema.properties.lead.items,
    request.schema.properties.explanations.items.properties.paragraphs.items,
  ]) {
    assert.deepEqual(sentence.properties.claim_ids.items.enum, f.ids)
    assert.equal(sentence.properties.claim_ids.uniqueItems, true)
  }
  assert.match(request.messages[0].content, /표현만 바꿔 다시 쓰지/)
  assert.match(request.messages[0].content, /계획·회사 귀속·수치 조건을 생략하지/)
  assert.deepEqual(draftSchema, before)
  assert.deepEqual(schemaForDraft(), before)
  assert.deepEqual(f, original)
  const historical = structuredClone(f.draft)
  historical.lead[0].claim_ids = ["8b36d774039891f2c7e3375"]
  assertSchema(historical, schemaForDraft())
  assert.ok(draftProblems(historical, f.claims).includes("unknown_claim_reference"))
})

test("a served typo or repeated ID is rejected without repairing its response bytes", async () => {
  const f = fixture()
  for (const references of [["8b36d774039891f2c7e3375"], [f.ids[0], f.ids[0]]]) {
    const draft = structuredClone(f.draft)
    draft.lead[0].claim_ids = references
    const before = JSON.stringify(draft)
    const artifacts = { response_content: before, response_content_sha256: sha256(before) }
    await assert.rejects(
      writeDraft({ structured: async () => ({ output: draft, artifacts }) }, f.claims),
      (error) =>
        /Invalid enum|Duplicate items/.test(error.message) && error.model_artifacts === artifacts,
    )
    assert.equal(JSON.stringify(draft), before)
  }
  // Two distinct sentences may cite the same fact; identity sharing is not repetition.
  f.draft.lead[1].claim_ids = [f.ids[0]]
  assertDraftReferences(f.draft, f.ids)
})

test("ambiguous input IDs are blocked before provider dispatch and deep references stay bounded", async () => {
  const f = fixture()
  let calls = 0
  await assert.rejects(
    writeDraft(
      {
        structured: async () => {
          calls++
          throw Error("Unexpected")
        },
      },
      [f.claims[0], f.claims[0]],
    ),
    /Distinct supplied claim IDs/,
  )
  assert.equal(calls, 0)
  const schema = schemaForDraft(
    { input: { basis: [{ role: "conditions" }, { role: "results" }] } },
    f.ids,
  )
  assert.deepEqual(schema.properties.analysis.properties.claim_ids.items.enum, f.ids)
  assert.equal(schema.properties.analysis.properties.claim_ids.uniqueItems, true)
  assert.equal(schema.properties.analysis.properties.claim_ids.minItems, 2)
  assert.deepEqual(schema.properties.explanations.items.properties.role.items.enum, [
    "conditions",
    "results",
  ])
  schema.properties.lead.items.properties.claim_ids.items.enum.push("mutated")
  assert.deepEqual(
    schemaForDraft(null, f.ids).properties.lead.items.properties.claim_ids.items.enum,
    f.ids,
  )
})

test("explicit editorial authoring uses the same supplied-reference rejection", () => {
  const f = fixture()
  const input = {
    reviewer: "fixture",
    reviewed_at: "2026-10-10",
    reason: "Synthetic prose contract",
    source_read: true,
    final_prose_read: true,
    draft: f.draft,
  }
  assert.deepEqual(prepareEditorialDraft(input, f.claims, f.parses).draft, f.draft)
  for (const references of [["8b36d774039891f2c7e3375"], [f.ids[0], f.ids[0]]]) {
    const edited = structuredClone(input)
    edited.draft.lead[0].claim_ids = references
    assert.throws(
      () => prepareEditorialDraft(edited, f.claims, f.parses),
      /Invalid enum|Duplicate items/,
    )
  }
})

test("known timestamp dates use KST and draft metadata cannot replace reviewed dates", () => {
  const f = fixture()
  for (const claim of f.claims) claim.published_at = "2026-10-08T18:00:00Z"
  f.draft.facts.when = null
  f.draft.lead[0].text = "Example은 서비스를 공개했다."
  let quality = inspectReaderQuality(record(f.draft), f.claims)
  assert.deepEqual(quality.findings.find((v) => v.code === "lead_date_missing").known_dates, [
    "2026-10-09",
  ])
  f.draft.facts.when = "2026-10-08"
  f.draft.lead[0].text = "Example은 2026년 10월 8일 서비스를 공개했다."
  assert.equal(inspectReaderQuality(record(f.draft), f.claims).blocked, true)
  f.draft.lead[0].text = "Example은 한국시간 2026년 10월 9일 서비스를 공개했다."
  assert.equal(inspectReaderQuality(record(f.draft), f.claims).blocked, false)
  for (const claim of f.claims) claim.published_at = "2026-10-08"
  f.draft.lead[0].text = "Example은 2026년 10월 8일 서비스를 공개했다."
  assert.equal(inspectReaderQuality(record(f.draft), f.claims).blocked, false)
  for (const claim of f.claims) claim.published_at = null
  f.draft.facts.when = null
  f.draft.lead[0].text = "Example은 서비스를 공개했다."
  assert.equal(inspectReaderQuality(record(f.draft), f.claims).blocked, false)
})

test("prompt guidance does not waive exact repetition or the explicit shared-fact review", () => {
  const f = fixture()
  f.draft.explanations = [{ heading: "지원 방식", paragraphs: [structuredClone(f.draft.lead[1])] }]
  let quality = inspectReaderQuality(record(f.draft), f.claims)
  assert.equal(quality.blocked, true)
  assert.throws(
    () => assertReaderQuality(quality, { reader_quality_review: { repetition_checked: true } }),
    /repeated_sentence/,
  )
  f.draft.explanations[0].paragraphs[0].text =
    "사용자는 요청의 처리 상태를 화면에서 조회할 예정이다."
  quality = inspectReaderQuality(record(f.draft), f.claims)
  assert.equal(quality.blocked, false)
  assert.equal(quality.requires_repetition_review, true)
  assert.throws(() => assertReaderQuality(quality, {}), /Explicit repetition review/)
})
