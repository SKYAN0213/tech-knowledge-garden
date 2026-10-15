import test from "node:test"
import assert from "node:assert/strict"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { draftFingerprint } from "../scripts/research/editor.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { approvedArticle } from "../scripts/research/publish-adapter.mjs"
import { validateExistingBaselineReview } from "../scripts/research/existing-baseline-approval.mjs"

function fixture() {
  const url = "https://example.org/releases/tool",
    source = "Example published an agent control tool on October 1, 2026.",
    sourceHash = sha256(source),
    sourceIdValue = sourceId(url),
    sourceVersion = `${sourceIdValue}:${sourceHash}`,
    parseId = sha256("baseline-parse")
  const document = {
    source_id: sourceIdValue,
    source_version_id: sourceVersion,
    original_url: url,
    final_url: url,
    body_sha256: sourceHash,
    body_path: `documents/${sourceIdValue}/${sourceHash}/body.bin`,
    fetch_status: "captured",
    observed_at: "2026-10-02T00:00:00Z",
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id: sourceIdValue,
    source_version_id: sourceVersion,
    parse_id: parseId,
    title: "Example release",
    status: "extracted",
    dates: { published_at: "2026-10-01", observed_at: document.observed_at },
    blocks: [{ block_id: `${parseId}:b1`, text: source, locator: { text_hash: sourceHash } }],
    quality: { missing_pages: [] },
  }
  const claim = {
    claim_id: "claim-1",
    statement: source,
    claim_kind: "attributed_fact",
    subject: "Example",
    event_state: "completed",
    published_at: "2026-10-01",
    effective_period: null,
    numbers: [],
    evidence: [{
      source_id: sourceIdValue,
      source_version_id: sourceVersion,
      parse_id: parseId,
      block_id: parse.blocks[0].block_id,
      quote: source,
      support: "direct",
    }],
  }
  const claims = recordFactReview(
    [claim],
    [{
      claim_id: claim.claim_id,
      status: "verified",
      reason: "Exact primary source supports the statement.",
      source_read: true,
      entailment_checked: true,
      identity_checked: true,
      numbers_checked: true,
      time_checked: true,
    }],
    { reviewer: "Fixture reviewer", reviewed_at: "2026-10-02" },
    [parse],
  )
  const draft = {
    schema: "research-draft/v1",
    draft_id: "",
    draft: {
      title: "Example, agent control tool 공개",
      sector: "사이버보안",
      theme: "제품·서비스",
      tags: ["신제품"],
      entities: ["Example"],
      lead: [
        { text: "Example은 10월 1일 agent control tool을 공개했다.", claim_ids: [claim.claim_id] },
        { text: "회사는 이를 agent 실행 통제 도구로 설명했다.", claim_ids: [claim.claim_id] },
      ],
      explanations: [],
      facts: { who: "Example", when: "2026-10-01", where: null, what: source, how: null, why: null },
    },
    public_approved: false,
  }
  draft.draft_id = draftFingerprint(draft.draft)
  const oldDecision = {
    status: "approved",
    draft_id: draft.draft_id,
    reviewer: "Original reviewer",
    reason: "Original source review.",
    source_read: true,
    final_prose_read: true,
    title_checked: true,
    dates_checked: true,
    numbers_checked: true,
    analysis_checked: true,
    event_id: "0123456789abcdef",
    published_at: "2026-10-01",
    reviewed_at: "2026-10-03",
    region: "해외",
    concept_ids: [],
    reader_quality_review: { repetition_checked: true },
  }
  const priorArticle = approvedArticle(draft, claims, [document], oldDecision, [parse])
  const prior = { article: priorArticle }
  const reviewed = { claims }
  const review = {
    ...oldDecision,
    reviewer: "Baseline reviewer",
    reason: "Rebind the preserved approval to the exact current Drive edition bytes.",
    reviewed_at: "2026-10-13",
    retrospective_review: {
      schema_version: "retrospective-article-review/v1",
      event_id: oldDecision.event_id,
      reviewer: "Baseline reviewer",
      reviewed_at: "2026-10-13",
      reason: "Current Drive before bytes were read and compared with the preserved approval.",
      source_read: true,
      date_change_checked: true,
      ancillary_copy_read: true,
      appearances: [{
        path: "Editions/2026/10/2026-10-01_0800_Tech_AI_Briefing.md",
        sha256: sha256("current edition"),
        before_content: "current edition",
        previous_title: draft.draft.title,
        previous_published_at: "2026-10-01",
        sections: [],
      }],
    },
  }
  return { prior, oldDecision, review, draft, reviewed, documents: [document], parses: [parse] }
}

test("baseline approval rebind preserves exact source facts, source version, prose, ID, and event date", () => {
  const f = fixture()
  const article = validateExistingBaselineReview(
    f.prior, f.oldDecision, f.review, f.draft, f.reviewed, f.documents, f.parses,
  )
  assert.equal(article.event_id, f.prior.article.event_id)
  assert.equal(article.article_review.published_at, f.prior.article.article_review.published_at)
  assert.deepEqual(article.source_urls, f.prior.article.source_urls)
  assert.deepEqual(article.record, f.prior.article.record)
  assert.deepEqual(f.reviewed.claims, f.reviewed.claims)
  assert.deepEqual(f.documents, f.documents)
  assert.deepEqual(f.parses, f.parses)
  assert.deepEqual(article.retrospective_review, f.review.retrospective_review)
})

test("baseline approval rejects changed prose, source date, or claim references", () => {
  const f = fixture()
  const changed = structuredClone(f.draft)
  changed.draft.lead[0].text += " 추가 문장"
  changed.draft_id = draftFingerprint(changed.draft)
  assert.throws(
    () => validateExistingBaselineReview(f.prior, f.oldDecision, { ...f.review, draft_id: changed.draft_id }, changed, f.reviewed, f.documents, f.parses),
    /changed approved prose/,
  )

  assert.throws(
    () => validateExistingBaselineReview(f.prior, f.oldDecision, { ...f.review, published_at: "2026-10-02" }, f.draft, f.reviewed, f.documents, f.parses),
    /preserve the approved event/,
  )

  const changedClaims = { claims: f.reviewed.claims.map((claim) => ({ ...claim, statement: claim.statement + " changed" })) }
  assert.throws(
    () => validateExistingBaselineReview(f.prior, f.oldDecision, f.review, f.draft, changedClaims, f.documents, f.parses),
    /Reviewed fact or source parse changed|Draft has unresolved problems|changed approved prose/,
  )
})
