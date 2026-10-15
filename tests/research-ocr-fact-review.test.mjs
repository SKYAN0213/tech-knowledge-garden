import test from "node:test"
import assert from "node:assert/strict"
import { sha256 } from "../scripts/research/contracts.mjs"
import {
  ocrEvidenceRequirements,
  recordFactReview,
  assertVerifiedClaim,
} from "../scripts/research/claims.mjs"
import { factReviewPacket } from "../scripts/research/evidence-review-packet.mjs"
import { approvedArticle } from "../scripts/research/publish-adapter.mjs"
import { draftFingerprint } from "../scripts/research/editor.mjs"

function fixture() {
  const text = "Example plans to ship 50 units in 2027."
  const parse = {
    schema_version: "source-parse/v1",
    source_id: "source",
    source_version_id: "source:version",
    parse_id: "parse",
    status: "partial",
    title: "Synthetic original plan",
    dates: { published_at: "2026-09-27", observed_at: "2026-09-27T01:00:00Z" },
    quality: { missing_pages: [1], ocr_pages: [1], numeric_verification: "unreviewed" },
    blocks: [
      {
        block_id: "parse:block-1",
        kind: "paragraph",
        text,
        locator: {
          type: "image",
          method: "ocr",
          coordinate_space: "source-pixels",
          bbox: [10, 10, 200, 40],
          confidence: 0.99,
          text_hash: sha256(text),
        },
      },
    ],
  }
  const claim = {
    claim_id: "claim",
    candidate_key: "candidate",
    statement: text,
    claim_kind: "attributed_fact",
    subject: "Example",
    event_state: "planned",
    published_at: "2026-09-27",
    effective_period: "2027",
    numbers: [{ literal: "50", unit: "units", condition: "in 2027" }],
    evidence: [
      {
        source_id: parse.source_id,
        source_version_id: parse.source_version_id,
        parse_id: parse.parse_id,
        block_id: parse.blocks[0].block_id,
        quote: text,
        support: "direct",
      },
    ],
  }
  const decision = {
    claim_id: claim.claim_id,
    status: "verified",
    reason: "Synthetic original reviewed",
    source_read: true,
    entailment_checked: true,
    identity_checked: true,
    numbers_checked: true,
    time_checked: true,
  }
  const review = { reviewer: "Synthetic reviewer", reviewed_at: "2026-09-28" }
  const visual = (fact = claim, source = parse) =>
    ocrEvidenceRequirements(fact, [source]).map((row) => ({
      evidence_ref: row.evidence_ref,
      visual_checked: true,
      layout_checked: true,
      numbers_checked: true,
      reason: "Original value, row identity and unit checked in synthetic raster",
    }))
  return { claim, parse, decision, review, visual }
}

test("OCR numeric facts require location-bound visual review even at high confidence", () => {
  const f = fixture()
  assert.throws(
    () => recordFactReview([f.claim], [f.decision], f.review, [f.parse]),
    /OCR fact requires/,
  )
  const decisions = { ...f.decision, ocr_evidence: f.visual() }
  const [verified] = recordFactReview([f.claim], [decisions], f.review, [f.parse])
  assert.equal(assertVerifiedClaim(verified, [f.parse]), verified)
  assert.equal(verified.event_state, "planned")
  assert.equal(f.parse.status, "partial")
  const stripped = structuredClone(verified)
  delete stripped.review.checks.ocr_evidence
  assert.throws(() => assertVerifiedClaim(stripped, [f.parse]), /OCR fact requires/)
})

test("every cited OCR location requires its own complete review", () => {
  const f = fixture()
  f.parse.blocks.push({
    ...structuredClone(f.parse.blocks[0]),
    block_id: "parse:block-2",
    locator: { ...f.parse.blocks[0].locator, bbox: [10, 50, 200, 80] },
  })
  f.claim.evidence.push({ ...f.claim.evidence[0], block_id: "parse:block-2" })
  const all = f.visual()
  assert.equal(all.length, 2)
  for (const rows of [all.slice(0, 1), [all[0], all[0]], [...all, all[0]]])
    assert.throws(
      () =>
        recordFactReview([f.claim], [{ ...f.decision, ocr_evidence: rows }], f.review, [f.parse]),
      /OCR fact requires/,
    )
  for (const key of ["visual_checked", "layout_checked", "numbers_checked"])
    assert.throws(
      () =>
        recordFactReview(
          [f.claim],
          [{ ...f.decision, ocr_evidence: all.map((r, i) => (i ? r : { ...r, [key]: false })) }],
          f.review,
          [f.parse],
        ),
      /explicit image/,
    )
})

test("visual review cannot be reused for a different fact, quote or source position", () => {
  const f = fixture(),
    original = f.visual()
  for (const mutate of [
    (g) => {
      g.claim.statement += " The source reports this."
    },
    (g) => {
      g.claim.evidence[0].quote = "50 units in 2027"
    },
    (g) => {
      g.parse.blocks[0].locator.bbox[0] = 11
    },
  ]) {
    const changed = fixture()
    mutate(changed)
    assert.throws(
      () =>
        recordFactReview(
          [changed.claim],
          [{ ...changed.decision, ocr_evidence: original }],
          changed.review,
          [changed.parse],
        ),
      /OCR fact requires/,
    )
  }
})

test("native text facts and deferral keep existing checks without a visual declaration", () => {
  const f = fixture()
  assert.equal(
    recordFactReview(
      [f.claim],
      [{ claim_id: f.claim.claim_id, status: "deferred", reason: "Unreadable source row" }],
      f.review,
      [f.parse],
    )[0].review.status,
    "deferred",
  )
  f.parse.blocks[0].locator = {
    type: "pdf",
    page: 2,
    bbox: [0, 0, 100, 20],
    text_hash: sha256(f.parse.blocks[0].text),
  }
  const [verified] = recordFactReview([f.claim], [f.decision], f.review, [f.parse])
  assert.equal(assertVerifiedClaim(verified, [f.parse]), verified)
  assert.equal(ocrEvidenceRequirements(f.claim, [f.parse]).length, 0)
})

test("direct source additions pass the same OCR approval boundary", () => {
  const f = fixture(),
    { claim_id, ...claim } = f.claim
  const { claim_id: id, status, ...decision } = f.decision
  const approve = (d) =>
    recordFactReview([], [], { ...f.review, additions: [{ claim, decision: d }] }, [f.parse])
  assert.throws(() => approve(decision), /OCR fact requires/)
  const [verified] = approve({ ...decision, ocr_evidence: f.visual() })
  assert.equal(verified.review.origin, "direct_source_addition")
  assert.equal(assertVerifiedClaim(verified, [f.parse]), verified)
})

test("fact packets expose exact source bytes and location while older packet shape remains readable", () => {
  const f = fixture()
  const doc = {
    source_version_id: f.parse.source_version_id,
    original_url: "https://example.com/table.png",
    body_path: "documents/source/body.bin",
    body_sha256: sha256("synthetic-image"),
  }
  const args = [
    "review",
    { source_run: "stored", assessment_run: "compare" },
    { claims: [f.claim], provenance: {} },
    [doc],
    [f.parse],
    { input_sha256: "comparison", assessments: [] },
  ]
  const packet = factReviewPacket(...args)
  const attention = packet.claims[0].ocr_attention.evidence[0]
  assert.deepEqual(attention.locator, f.parse.blocks[0].locator)
  assert.equal(attention.source_body_path, doc.body_path)
  assert.equal(attention.source_body_sha256, doc.body_sha256)
  assert.equal(attention.evidence_ref, f.visual()[0].evidence_ref)
  assert.equal(
    Object.hasOwn(
      factReviewPacket(...args, { includeOCRAttention: false }).claims[0],
      "ocr_attention",
    ),
    false,
  )
})

test("article projection rechecks visual evidence and keeps OCR bookkeeping private", () => {
  const f = fixture()
  const [verified] = recordFactReview(
    [f.claim],
    [{ ...f.decision, ocr_evidence: f.visual() }],
    f.review,
    [f.parse],
  )
  const draft = {
    title: "Example, 2027년 50대 공급 계획",
    lead: [
      { text: "Example은 2027년에 50대를 공급할 계획이다.", claim_ids: [verified.claim_id] },
      { text: "공급 수량은 50대이며 계획 기간은 2027년이다.", claim_ids: [verified.claim_id] },
    ],
    facts: {
      who: "Example",
      what: "50대 공급 계획",
      when: "2027년",
      where: null,
      how: null,
      why: null,
    },
    sector: "로봇·제조",
    theme: "사업·고객",
    tags: ["시장 진출"],
    entities: ["Example"],
    explanations: [],
  }
  const record = { draft, draft_id: draftFingerprint(draft) }
  const review = {
    status: "approved",
    draft_id: record.draft_id,
    reviewer: "Synthetic editorial reviewer",
    source_read: true,
    final_prose_read: true,
    title_checked: true,
    dates_checked: true,
    numbers_checked: true,
    analysis_checked: true,
    event_id: "0123456789abcdef",
    published_at: "2026-09-27",
    reviewed_at: "2026-09-28",
    region: "해외",
  }
  const docs = [
    {
      source_id: f.parse.source_id,
      source_version_id: f.parse.source_version_id,
      original_url: "https://example.com/synthetic.png",
      observed_at: f.parse.dates.observed_at,
    },
  ]
  const article = approvedArticle(record, [verified], docs, review, [f.parse])
  assert.equal(article.event_id, review.event_id)
  assert.deepEqual(article.source_urls, [docs[0].original_url])
  assert.equal(JSON.stringify(article).includes("ocr_evidence"), false)
  const stripped = structuredClone(verified)
  delete stripped.review.checks.ocr_evidence
  assert.throws(
    () => approvedArticle(record, [stripped], docs, review, [f.parse]),
    /OCR fact requires/,
  )
})

test("OCR approval refuses missing, malformed or ambiguous source coordinates", () => {
  for (const patch of [
    { bbox: null },
    { bbox: [10, 10, 20] },
    { bbox: [20, 10, 10, 40] },
    { bbox: [10, 10, Infinity, 40] },
    { coordinate_space: "render-pixels" },
    { confidence: NaN },
    { type: "pdf", page: 0 },
  ]) {
    const f = fixture()
    Object.assign(f.parse.blocks[0].locator, patch)
    assert.throws(() => ocrEvidenceRequirements(f.claim, [f.parse]), /exact original image/)
  }
  const f = fixture()
  f.parse.blocks[0].locator = { ...f.parse.blocks[0].locator, type: "pdf", page: 3 }
  const [verified] = recordFactReview(
    [f.claim],
    [{ ...f.decision, ocr_evidence: f.visual() }],
    f.review,
    [f.parse],
  )
  assert.equal(assertVerifiedClaim(verified, [f.parse]), verified)
})
