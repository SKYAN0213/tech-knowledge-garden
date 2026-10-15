import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { main as author } from "../scripts/research-editorial-author.mjs"
import { main as research } from "../scripts/research.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { prepareEditorialDraft } from "../scripts/research/editorial-authoring.mjs"
import { approvedArticle } from "../scripts/research/publish-adapter.mjs"

function fixture(text = "Example released an API. Users can inspect request status.") {
  const source_id = sourceId("https://example.org/api"),
    parse_id = sha256(text)
  const parse = {
    schema_version: "source-parse/v1",
    source_id,
    source_version_id: source_id + ":" + sha256(text),
    parse_id,
    status: "extracted",
    title: "API release",
    dates: { published_at: "2026-09-26", observed_at: "2026-09-27T00:00:00Z" },
    blocks: [{ block_id: parse_id + ":b0", text, locator: { text_hash: sha256(text) } }],
    quality: { missing_pages: [] },
  }
  const claim = {
    claim_id: "example-api",
    candidate_key: "source-" + source_id,
    statement: text,
    claim_kind: "attributed_fact",
    subject: "Example",
    event_state: "reported",
    published_at: "2026-09-26",
    effective_period: null,
    numbers: [],
    evidence: [
      {
        source_id,
        source_version_id: parse.source_version_id,
        parse_id,
        block_id: parse.blocks[0].block_id,
        quote: text,
        support: "direct",
      },
    ],
  }
  const claims = recordFactReview(
    [claim],
    [
      {
        claim_id: claim.claim_id,
        status: "verified",
        reason: "Fixture source review",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      },
    ],
    { reviewer: "fixture", reviewed_at: "2026-09-28" },
    [parse],
  )
  const input = {
    reviewer: "fixture GPT editor",
    reason: "Read source and final prose",
    reviewed_at: "2026-09-29",
    source_read: true,
    final_prose_read: true,
    draft: {
      title: "Example, 요청 상태 조회 API 공개",
      sector: "소프트웨어·클라우드",
      theme: "제품·서비스",
      tags: ["기능 추가"],
      entities: ["Example"],
      facts: { who: null, when: "2026-09-26", where: null, what: null, how: null, why: null },
      lead: [
        { text: "Example은 API를 공개했다.", claim_ids: [claim.claim_id] },
        { text: "사용자는 요청 상태를 조회할 수 있다.", claim_ids: [claim.claim_id] },
      ],
      explanations: [],
    },
  }
  return { input, claims, parses: [parse] }
}

test("reviewed secondary themes preserve both tag families through approval", () => {
  const f = fixture(
    "Example released an API through a technical partnership. Users can inspect request status.",
  )
  f.input.draft.secondary_theme = "표준·생태계"
  f.input.draft.tags = ["기능 추가", "기술 제휴"]
  const record = prepareEditorialDraft(f.input, f.claims, f.parses)
  const review = {
    status: "approved",
    draft_id: record.draft_id,
    reviewer: "fixture",
    source_read: true,
    final_prose_read: true,
    title_checked: true,
    dates_checked: true,
    numbers_checked: true,
    analysis_checked: true,
    event_id: "abcdef1234567890",
    published_at: "2026-09-26",
    reviewed_at: "2026-09-29",
    region: "해외",
    concept_ids: [],
  }
  const documents = [
    {
      source_id: f.parses[0].source_id,
      source_version_id: f.parses[0].source_version_id,
      original_url: "https://example.org/api",
      observed_at: "2026-09-27T00:00:00Z",
    },
  ]
  const article = approvedArticle(record, f.claims, documents, review, f.parses)
  assert.equal(article.secondary_theme, "표준·생태계")
  assert.deepEqual(article.tags, ["기능 추가", "기술 제휴"])
  const legacy = fixture()
  const legacyRecord = prepareEditorialDraft(legacy.input, legacy.claims, legacy.parses)
  const legacyDocuments = [
    { ...documents[0], source_version_id: legacy.parses[0].source_version_id },
  ]
  const legacyArticle = approvedArticle(
    legacyRecord,
    legacy.claims,
    legacyDocuments,
    { ...review, draft_id: legacyRecord.draft_id },
    legacy.parses,
  )
  assert.equal(Object.hasOwn(legacyArticle, "secondary_theme"), false)
})

test("secondary themes cannot authorize unrelated tags or repeat the primary theme", () => {
  const f = fixture()
  f.input.draft.secondary_theme = "표준·생태계"
  f.input.draft.tags = ["기능 추가", "매출"]
  assert.throws(() => prepareEditorialDraft(f.input, f.claims, f.parses), /tag_theme_mismatch/)
  f.input.draft.tags = ["기능 추가"]
  f.input.draft.secondary_theme = f.input.draft.theme
  assert.throws(
    () => prepareEditorialDraft(f.input, f.claims, f.parses),
    /secondary_theme_repeats_primary/,
  )
  f.input.draft.secondary_theme = "unknown"
  assert.throws(() => prepareEditorialDraft(f.input, f.claims, f.parses))
})

test("source-reviewed GPT authoring stays unapproved and has no fake local model receipt", () => {
  const f = fixture(),
    r = prepareEditorialDraft(f.input, f.claims, f.parses)
  assert.equal(r.public_approved, false)
  assert.equal(r.provenance.local_model_generated, false)
  assert.equal(r.provenance.provider, "gpt-editorial")
  assert.ok(r.provenance.claims_sha256)
  f.input.draft.title = "changed"
  assert.notEqual(r.draft.title, f.input.draft.title)
})
test("unknown paragraph facts and oversized explanations fail before a draft is stored", () => {
  const f = fixture()
  f.input.draft.lead[0].claim_ids = ["unknown"]
  assert.throws(() => prepareEditorialDraft(f.input, f.claims, f.parses), /correction/)
  const g = fixture()
  g.input.draft.explanations = [
    {
      heading: "세부 변경",
      paragraphs: Array.from({ length: 4 }, () => ({
        text: "요청 상태를 조회한다.",
        claim_ids: ["example-api"],
      })),
    },
  ]
  assert.throws(() => prepareEditorialDraft(g.input, g.claims, g.parses), /Too many items/)
})
test("changed source bytes, unreviewed facts and missing explicit review cannot be reused", () => {
  const f = fixture()
  f.parses[0].blocks[0].text = "Different source"
  assert.throws(() => prepareEditorialDraft(f.input, f.claims, f.parses))
  const g = fixture()
  g.claims[0].review.status = "unreviewed"
  assert.throws(() => prepareEditorialDraft(g.input, g.claims, g.parses), /verified/)
  const h = fixture()
  h.input.source_read = false
  assert.throws(() => prepareEditorialDraft(h.input, h.claims, h.parses), /Explicit/)
})

test("direct authoring can enter native approval without manufacturing model extraction", async (t) => {
  const f = fixture(),
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "editorial-author-"))),
    run = "direct"
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const p = f.parses[0],
    text = p.blocks[0].text,
    body = "documents/source/body.bin"
  fs.mkdirSync(path.join(root, "documents/source"), { recursive: true })
  fs.writeFileSync(path.join(root, body), text)
  atomicWrite(root, `parses/${p.parse_id}/parse.json`, p)
  atomicWrite(root, `runs/${run}/documents.json`, [
    {
      source_id: p.source_id,
      source_version_id: p.source_version_id,
      original_url: "https://example.org/api",
      final_url: "https://example.org/api",
      observed_at: p.dates.observed_at,
      fetch_status: "captured",
      body_sha256: sha256(text),
      body_path: body,
    },
  ])
  atomicWrite(root, `runs/${run}/parses.json`, f.parses)
  atomicWrite(root, `runs/${run}/reviewed-claims.json`, { claims: f.claims })
  f.input.draft.lead[0].text = "Example은 2026년 9월 26일 API를 공개했다."
  atomicWrite(root, "input.json", f.input)
  const args = ["--root", root, "--run", run, "--review", path.join(root, "input.json")]
  const first = await author(args),
    ledger = readJSON(root, `runs/${run}/claims.json`)
  assert.equal(first.status, "editorial_review")
  assert.equal(ledger.provenance.model_extraction_completed, false)
  assert.equal(ledger.provenance.local_model_generated, false)
  assert.deepEqual(ledger.claims, f.claims)
  assert.equal(readJSON(root, `runs/${run}/approved-article.json`), null)
  assert.equal((await author(args)).reused, true)
  assert.deepEqual(readJSON(root, `runs/${run}/claims.json`), ledger)
  atomicWrite(root, "review.json", {
    status: "approved",
    draft_id: first.draft_id,
    reviewer: "fixture final review",
    source_read: true,
    final_prose_read: true,
    title_checked: true,
    dates_checked: true,
    numbers_checked: true,
    analysis_checked: true,
    event_id: p.source_id.slice(0, 16),
    published_at: "2026-09-26",
    reviewed_at: "2026-09-30",
    region: "해외",
    concept_ids: [],
    reader_quality_review: { repetition_checked: true },
  })
  const result = await research([
    "approve",
    "--root",
    root,
    "--run",
    run,
    "--review",
    path.join(root, "review.json"),
  ])
  assert.equal(result.status, "approved")
  assert.ok(readJSON(root, `runs/${run}/approved-article.json`))
})
