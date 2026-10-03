import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { canonicalURL } from "../scripts/garden.mjs"
import { researchWindow } from "../scripts/research-window.mjs"
import { recordCandidateApproval } from "../scripts/research/candidate-approval.mjs"
import { recordCandidateSourceAlternative } from "../scripts/research/candidate-source-alternative.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { approvedArticle } from "../scripts/research/publish-adapter.mjs"
import { articleContentFingerprint } from "../scripts/research/parser.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { selectCandidateSource } from "../scripts/research/editorial-handoff.mjs"

function fixture(t) {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "candidate-approval-")))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const root = path.join(workspace, "research")
  const backlogFile = path.join(workspace, "candidate-backlog.json")
  const originalURL = "https://example.org/article?mode=V&id=1"
  const candidateURL = canonicalURL(originalURL)
  const key = `source-${sourceId(candidateURL)}`
  const body = "Example Lab developed a soft robot material and demonstrated sensing."
  const source_id = sourceId(originalURL)
  const body_sha256 = sha256(body)
  const source_version_id = `${source_id}:${body_sha256}`
  const parse_id = sha256("approved parse")
  const document = {
    source_id,
    source_version_id,
    original_url: originalURL,
    final_url: originalURL,
    body_path: `documents/${source_id}/${body_sha256}/body.bin`,
    body_sha256,
    fetch_status: "captured",
    observed_at: "2026-09-30T00:00:00Z",
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id,
    source_version_id,
    parse_id,
    title: "Soft robot material",
    status: "extracted",
    dates: { published_at: "2026-09-30", observed_at: document.observed_at },
    blocks: [{ block_id: `${parse_id}:b1`, text: body, locator: { text_hash: body_sha256 } }],
    quality: { missing_pages: [] },
  }
  const claim = {
    claim_id: "c1",
    candidate_key: key,
    statement: "Example Lab developed a soft robot material and demonstrated sensing.",
    claim_kind: "attributed_fact",
    subject: "Example Lab",
    event_state: "completed",
    published_at: "2026-09-30",
    effective_period: null,
    numbers: [],
    evidence: [
      {
        source_id,
        source_version_id,
        parse_id,
        block_id: `${parse_id}:b1`,
        quote: body,
        support: "direct",
      },
    ],
  }
  const claims = recordFactReview(
    [claim],
    [
      {
        claim_id: "c1",
        status: "verified",
        reason: "Stored source read",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      },
    ],
    { reviewer: "fixture reviewer", reviewed_at: "2026-09-30" },
    [parse],
  )
  const draft = {
    title: "Example Lab, 소프트 로봇 소재 발표",
    lead: [
      { text: "Example Lab이 소프트 로봇 소재를 개발했다.", claim_ids: ["c1"] },
      { text: "연구팀은 감지 기능을 시연했다.", claim_ids: ["c1"] },
    ],
    facts: {
      who: "Example Lab",
      when: "2026-09-30",
      where: null,
      what: "소프트 로봇 소재 개발",
      how: null,
      why: null,
    },
    sector: "로봇·제조",
    theme: "연구·기술",
    tags: ["새로운 방법"],
    entities: ["Example Lab"],
    explanations: [],
  }
  const draftRecord = { draft, draft_id: sha256(JSON.stringify(draft)) }
  const decision = {
    status: "approved",
    draft_id: draftRecord.draft_id,
    reviewer: "fixture reviewer",
    source_read: true,
    final_prose_read: true,
    title_checked: true,
    dates_checked: true,
    numbers_checked: true,
    analysis_checked: true,
    event_id: "abcdef0123456789",
    published_at: "2026-09-30",
    reviewed_at: "2026-09-30",
    region: "국내",
  }
  const article = approvedArticle(draftRecord, claims, [document], decision, [parse])
  atomicWrite(root, document.body_path, body)
  atomicWrite(root, `parses/${parse_id}/parse.json`, parse)
  for (const [file, value] of Object.entries({
    "documents.json": [document],
    "parses.json": [parse],
    "reviewed-claims.json": { claims },
    "draft.json": draftRecord,
    "editorial-review.json": decision,
    "approved-article.json": article,
  }))
    atomicWrite(root, `runs/approved/${file}`, value)
  const candidate = {
    key,
    title: parse.title,
    source_urls: [candidateURL],
    source_published_at: "2026-09-30",
    discovered_at: document.observed_at,
    review_status: "unreviewed",
    priority: "normal",
    article_source_version_id: source_version_id,
    article_parse_id: parse_id,
    article_content_sha256: articleContentFingerprint(parse),
  }
  fs.writeFileSync(
    backlogFile,
    JSON.stringify({ schema: "research-candidates/v1", candidates: [candidate] }),
  )
  return { root, backlogFile, candidate, document, article }
}

function link(f, more = {}) {
  return recordCandidateApproval({
    root: f.root,
    runId: "candidate-link",
    approvedRunId: "approved",
    candidateKey: f.candidate.key,
    backlogFile: f.backlogFile,
    publishedArticles: [],
    ...more,
  })
}

async function makeAlternativeResolution(
  f,
  { decision = "same_event", originalPublishedAt = "2026-09-30" } = {},
) {
  const backlog = readJSON(path.dirname(f.backlogFile), path.basename(f.backlogFile))
  const candidate = backlog.candidates[0]
  candidate.source_urls = ["https://example.org/original-release"]
  candidate.source_published_at = originalPublishedAt
  fs.writeFileSync(f.backlogFile, JSON.stringify(backlog))
  const reviewPath = path.join(path.dirname(f.backlogFile), "alternative-review.json")
  fs.writeFileSync(
    reviewPath,
    JSON.stringify({
      schema: "research-candidate-source-alternative-review/v1",
      candidate_key: candidate.key,
      original_url: candidate.source_urls[0],
      alternative_url: f.document.original_url,
      decision,
      reviewer: "fixture reviewer",
      reviewed_at: "2026-09-30",
      reason: "The official source confirms the same event and date.",
      claim_ids: ["c1"],
      new_article: false,
      candidate_published: false,
    }),
  )
  await recordCandidateSourceAlternative({
    root: f.root,
    runId: "alternative-resolution",
    sourceRunId: "approved",
    candidateKey: candidate.key,
    reviewPath,
    backlogFile: f.backlogFile,
  })
  return {
    originalURL: candidate.source_urls[0],
    originalVersion: candidate.article_source_version_id,
  }
}

test("exact approved article closes a candidate without publishing and is idempotent", async (t) => {
  const f = fixture(t)
  const first = await link(f)
  assert.equal(first.event_id, f.article.event_id)
  assert.equal(first.candidate_published, false)
  const before = fs.readFileSync(f.backlogFile)
  assert.deepEqual(await link(f), first)
  assert.deepEqual(fs.readFileSync(f.backlogFile), before)
  const backlog = JSON.parse(before)
  const candidate = backlog.candidates[0]
  assert.equal(candidate.review_status, "verified")
  assert.equal(candidate.event_id, f.article.event_id)
  assert.equal(candidate.approval.approved_run, "approved")
  assert.equal(
    readJSON(f.root, "runs/candidate-link/candidate-approval.json").candidate_published,
    false,
  )
  const window = researchWindow("2026-09-29T00:00:00Z", "2026-09-30T12:00:00Z", backlog, [])
  assert.equal(window.pending[0].next_route, "approved-unpublished")
  const changed = structuredClone(backlog)
  changed.candidates[0].source_revision_alert = true
  changed.candidates[0].review_status = "deferred"
  changed.candidates[0].reason = "New source content needs review"
  assert.equal(
    researchWindow("2026-09-29T00:00:00Z", "2026-09-30T12:00:00Z", changed, []).pending[0]
      .next_route,
    "review-source-revision",
  )
  assert.throws(
    () =>
      selectCandidateSource(
        f.root,
        {
          schema: "research-editorial-handoff/v1",
          pending: [{ ...candidate, next_route: "approved-unpublished" }],
        },
        candidate.key,
      ),
    /approved article awaiting publication/,
  )
})

test("same-source revision reuses a reviewed article only when cited parsed content is identical", async (t) => {
  const f = fixture(t)
  const currentRun = "current-observation"
  const currentBody = `${fs.readFileSync(path.join(f.root, f.document.body_path), "utf8")}\nUpdated page chrome.`
  const currentHash = sha256(currentBody)
  const currentVersion = `${f.document.source_id}:${currentHash}`
  const currentParseId = sha256("current observed parse")
  const currentDocument = {
    ...f.document,
    source_version_id: currentVersion,
    body_path: `documents/${f.document.source_id}/${currentHash}/body.bin`,
    body_sha256: currentHash,
    observed_at: "2026-10-02T16:35:00Z",
  }
  const currentParse = {
    ...structuredClone(readJSON(f.root, "runs/approved/parses.json")[0]),
    source_version_id: currentVersion,
    parse_id: currentParseId,
    dates: { ...readJSON(f.root, "runs/approved/parses.json")[0].dates, observed_at: currentDocument.observed_at },
  }
  currentParse.blocks = currentParse.blocks.map((block, index) => ({
    ...block,
    block_id: `${currentParseId}:b${index + 1}`,
  }))
  atomicWrite(f.root, currentDocument.body_path, currentBody)
  atomicWrite(f.root, `parses/${currentParseId}/parse.json`, currentParse)
  atomicWrite(f.root, `runs/${currentRun}/documents.json`, [currentDocument])
  atomicWrite(f.root, `runs/${currentRun}/parses.json`, [currentParse])
  const currentCandidate = {
    ...f.candidate,
    article_source_version_id: currentVersion,
    article_parse_id: currentParseId,
    article_content_sha256: articleContentFingerprint(currentParse),
  }
  fs.writeFileSync(
    f.backlogFile,
    JSON.stringify({ schema: "research-candidates/v1", candidates: [currentCandidate] }),
  )
  atomicWrite(f.root, `runs/${currentRun}/candidates.json`, [currentCandidate])
  const reviewPath = "runs/current-observation/revision-review.json"
  atomicWrite(f.root, reviewPath, {
    schema: "research-candidate-approval-source-revision-review/v1",
    candidate_key: currentCandidate.key,
    event_id: f.article.event_id,
    approved_run: "approved",
    candidate_source_run: currentRun,
    reviewer: "fixture reviewer",
    reviewed_at: "2026-10-03",
    source_read: true,
    revision_read: true,
    title_checked: true,
    dates_checked: true,
    numbers_checked: true,
    new_article: false,
    candidate_published: false,
    same_content_reason: "The extracted article text and event date are unchanged.",
    source_urls: f.article.source_urls,
  })

  const result = await recordCandidateApproval({
    root: f.root,
    runId: "revision-link",
    approvedRunId: "approved",
    candidateSourceRunId: currentRun,
    sourceRevisionReviewPath: reviewPath,
    candidateKey: currentCandidate.key,
    backlogFile: f.backlogFile,
    publishedArticles: [],
  })
  const updated = readJSON(path.dirname(f.backlogFile), path.basename(f.backlogFile)).candidates[0]
  const receipt = readJSON(f.root, "runs/revision-link/candidate-approval.json")
  assert.equal(result.review_status, "verified")
  assert.equal(result.candidate_published, false)
  assert.equal(updated.article_source_version_id, currentVersion)
  assert.equal(updated.approval.source_version_id, currentVersion)
  assert.equal(updated.approval.parse_id, currentParseId)
  assert.equal(updated.approval.reviewed_source_version_id, f.document.source_version_id)
  assert.equal(receipt.source_revision.sources[0].body_bytes_identical, false)
  assert.equal(receipt.source_revision.sources[0].article_content_sha256, currentCandidate.article_content_sha256)
})

test("legacy candidate with missing source identity is enriched from its exact approved source", async (t) => {
  const f = fixture(t)
  const original = readJSON(path.dirname(f.backlogFile), path.basename(f.backlogFile))
  delete original.candidates[0].article_source_version_id
  delete original.candidates[0].article_parse_id
  delete original.candidates[0].article_content_sha256
  fs.writeFileSync(f.backlogFile, JSON.stringify(original))

  const result = await link(f)
  const updated = readJSON(path.dirname(f.backlogFile), path.basename(f.backlogFile)).candidates[0]
  const parse = readJSON(f.root, "runs/approved/parses.json")[0]
  assert.equal(result.candidate_published, false)
  assert.equal(updated.article_source_version_id, f.document.source_version_id)
  assert.equal(updated.article_parse_id, parse.parse_id)
  assert.equal(updated.article_content_sha256, articleContentFingerprint(parse))
  assert.equal(updated.review_status, "verified")
})

test("approval link rejects changed evidence, article and conflicting identity before writing", async (t) => {
  const f = fixture(t)
  const original = fs.readFileSync(f.backlogFile)
  const wrongVersion = JSON.parse(original)
  wrongVersion.candidates[0].article_content_sha256 = sha256("changed content")
  fs.writeFileSync(f.backlogFile, JSON.stringify(wrongVersion))
  await assert.rejects(() => link(f), /differ in URL, date or source version/)
  fs.writeFileSync(f.backlogFile, original)
  await assert.rejects(
    () =>
      link(f, {
        publishedArticles: [
          { event_id: "0123456789abcdef", source_urls: [f.document.original_url] },
        ],
      }),
    /already appears in an edition/,
  )
  assert.deepEqual(fs.readFileSync(f.backlogFile), original)
  await assert.rejects(
    () =>
      link(f, {
        publishedArticles: [
          {
            event_id: "0123456789abcdef",
            title: f.candidate.title,
            published_at: f.candidate.source_published_at,
            source_urls: ["https://example.org/different-original"],
          },
        ],
      }),
    /same title and original day/,
  )
  const articlePath = path.join(f.root, "runs/approved/approved-article.json")
  const article = JSON.parse(fs.readFileSync(articlePath))
  article.title = "Unreviewed edit"
  fs.writeFileSync(articlePath, JSON.stringify(article))
  await assert.rejects(() => link(f), /differs from its reviewed source and draft/)
  assert.equal(readJSON(f.root, "runs/candidate-link/candidate-approval.json"), null)
  assert.deepEqual(fs.readFileSync(f.backlogFile), original)
})

test("the same extracted announcement cannot be approved as a different event", async (t) => {
  const f = fixture(t)
  const original = fs.readFileSync(f.backlogFile)
  const backlog = JSON.parse(original)
  backlog.candidates.push({
    ...structuredClone(f.candidate),
    key: "another-source",
    source_urls: ["https://example.org/translation"],
    event_id: "0123456789abcdef",
    review_status: "verified",
  })
  fs.writeFileSync(f.backlogFile, JSON.stringify(backlog))
  const before = fs.readFileSync(f.backlogFile)
  await assert.rejects(
    () => link(f),
    /Matching source content or title\/day belongs to another event/,
  )
  assert.deepEqual(fs.readFileSync(f.backlogFile), before)
  assert.equal(readJSON(f.root, "runs/candidate-link/candidate-approval.json"), null)
})

test("two reviewed originals can link to one approved event without creating a second article", async (t) => {
  const f = fixture(t)
  const secondURL = "https://example.org/translation"
  const secondId = sourceId(secondURL)
  const firstDocument = readJSON(f.root, "runs/approved/documents.json")[0]
  const firstParse = readJSON(f.root, "runs/approved/parses.json")[0]
  const secondParseId = sha256("second approved parse")
  const secondDocument = {
    ...firstDocument,
    source_id: secondId,
    source_version_id: `${secondId}:${firstDocument.body_sha256}`,
    original_url: secondURL,
    final_url: secondURL,
    body_path: `documents/${secondId}/${firstDocument.body_sha256}/body.bin`,
  }
  const secondParse = {
    ...structuredClone(firstParse),
    source_id: secondId,
    source_version_id: secondDocument.source_version_id,
    parse_id: secondParseId,
    blocks: firstParse.blocks.map((block) => ({ ...block, block_id: `${secondParseId}:b1` })),
  }
  const firstClaim = readJSON(f.root, "runs/approved/reviewed-claims.json").claims[0]
  const secondClaimInput = {
    ...structuredClone(firstClaim),
    claim_id: "c2",
    candidate_key: `source-${secondId}`,
    evidence: [
      {
        ...firstClaim.evidence[0],
        source_id: secondId,
        source_version_id: secondDocument.source_version_id,
        parse_id: secondParseId,
        block_id: `${secondParseId}:b1`,
      },
    ],
  }
  delete secondClaimInput.review
  const secondClaim = recordFactReview(
    [secondClaimInput],
    [
      {
        claim_id: "c2",
        status: "verified",
        reason: "Second original read",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      },
    ],
    { reviewer: "fixture reviewer", reviewed_at: "2026-09-30" },
    [secondParse],
  )[0]
  const draft = readJSON(f.root, "runs/approved/draft.json")
  draft.draft.lead[1].claim_ids = ["c2"]
  draft.draft_id = sha256(JSON.stringify(draft.draft))
  const decision = readJSON(f.root, "runs/approved/editorial-review.json")
  decision.draft_id = draft.draft_id
  const claims = [firstClaim, secondClaim]
  const documents = [firstDocument, secondDocument]
  const parses = [firstParse, secondParse]
  const article = approvedArticle(draft, claims, documents, decision, parses)
  atomicWrite(
    f.root,
    secondDocument.body_path,
    fs.readFileSync(path.join(f.root, firstDocument.body_path)),
  )
  atomicWrite(f.root, `parses/${secondParseId}/parse.json`, secondParse)
  for (const [file, value] of Object.entries({
    "documents.json": documents,
    "parses.json": parses,
    "reviewed-claims.json": { claims },
    "draft.json": draft,
    "editorial-review.json": decision,
    "approved-article.json": article,
  }))
    atomicWrite(f.root, `runs/approved/${file}`, value)
  const secondCandidate = {
    ...structuredClone(f.candidate),
    key: `source-${secondId}`,
    source_urls: [secondURL],
    article_source_version_id: secondDocument.source_version_id,
    article_parse_id: secondParseId,
    article_content_sha256: articleContentFingerprint(secondParse),
  }
  fs.writeFileSync(
    f.backlogFile,
    JSON.stringify({
      schema: "research-candidates/v1",
      candidates: [f.candidate, secondCandidate],
    }),
  )
  await link(f)
  const second = await recordCandidateApproval({
    root: f.root,
    runId: "candidate-link-second",
    approvedRunId: "approved",
    candidateKey: secondCandidate.key,
    backlogFile: f.backlogFile,
    publishedArticles: [],
  })
  assert.equal(second.event_id, f.article.event_id)
  const backlog = readJSON(path.dirname(f.backlogFile), path.basename(f.backlogFile))
  assert.deepEqual(
    backlog.candidates.map((candidate) => candidate.event_id),
    [f.article.event_id, f.article.event_id],
  )
  assert.deepEqual(
    new Set(backlog.candidates.map((candidate) => candidate.approval.article_sha256)).size,
    1,
  )
  const window = researchWindow("2026-09-29T00:00:00Z", "2026-09-30T12:00:00Z", backlog, [])
  assert.equal(window.pending.length, 1)
  assert.equal(window.pending[0].same_approved_event_candidate_keys.length, 1)
  assert.notEqual(window.pending[0].key, window.pending[0].same_approved_event_candidate_keys[0])
  assert.equal(window.resolved[0].next_route, "same-approved-event")
  assert.equal(window.resolved[0].primary_candidate_key, window.pending[0].key)
})

test("verified alternative links to the existing event while preserving original identity", async (t) => {
  const f = fixture(t)
  const { originalURL, originalVersion } = await makeAlternativeResolution(f)
  const result = await link(f, { sourceAlternativeResolutionRunId: "alternative-resolution" })
  const candidate = readJSON(path.dirname(f.backlogFile), path.basename(f.backlogFile))
    .candidates[0]
  assert.equal(result.candidate_published, false)
  assert.deepEqual(candidate.source_urls, [canonicalURL(originalURL)])
  assert.equal(candidate.article_source_version_id, originalVersion)
  assert.equal(candidate.review_status, "verified")
  assert.equal(candidate.event_id, f.article.event_id)
  assert.equal(candidate.alternate_sources[0].url, canonicalURL(f.document.original_url))
  assert.equal(candidate.source_attempts[0].source_role, "official_alternative")
  assert.equal(candidate.approval.source_url, canonicalURL(f.document.original_url))
  assert.equal(
    readJSON(f.root, "runs/candidate-link/candidate-approval.json").source_alternative.decision,
    "same_event",
  )
  const before = fs.readFileSync(f.backlogFile)
  assert.deepEqual(
    await link(f, { sourceAlternativeResolutionRunId: "alternative-resolution" }),
    result,
  )
  assert.deepEqual(fs.readFileSync(f.backlogFile), before)
  const receiptPath = path.join(f.root, "runs/candidate-link/candidate-approval.json")
  const legacyReceipt = readJSON(f.root, "runs/candidate-link/candidate-approval.json")
  delete legacyReceipt.source_alternative.published_at
  fs.writeFileSync(receiptPath, JSON.stringify(legacyReceipt))
  assert.deepEqual(
    await link(f, { sourceAlternativeResolutionRunId: "alternative-resolution" }),
    result,
  )
  assert.deepEqual(fs.readFileSync(f.backlogFile), before)
})

test("same-event alternate publication date can establish the event date", async (t) => {
  const f = fixture(t)
  await makeAlternativeResolution(f, { originalPublishedAt: "2026-10-01" })
  const result = await link(f, { sourceAlternativeResolutionRunId: "alternative-resolution" })
  const candidate = readJSON(path.dirname(f.backlogFile), path.basename(f.backlogFile))
    .candidates[0]
  assert.equal(result.event_id, f.article.event_id)
  assert.equal(candidate.source_published_at, "2026-10-01")
  assert.equal(candidate.event_id, f.article.event_id)
  assert.equal(candidate.approval.approved_run, "approved")
  assert.equal(
    readJSON(f.root, "runs/candidate-link/candidate-approval.json").source_alternative.published_at,
    f.article.article_review.published_at,
  )
})

test("alternative approval rejects a changed review receipt before mutating the candidate", async (t) => {
  const f = fixture(t)
  await makeAlternativeResolution(f)
  const reviewPath = path.join(
    f.root,
    "runs/alternative-resolution/candidate-source-alternative-review.json",
  )
  const review = readJSON(
    f.root,
    "runs/alternative-resolution/candidate-source-alternative-review.json",
  )
  review.reason = "Changed after resolution"
  fs.writeFileSync(reviewPath, JSON.stringify(review))
  const before = fs.readFileSync(f.backlogFile)
  await assert.rejects(
    () => link(f, { sourceAlternativeResolutionRunId: "alternative-resolution" }),
    /review input changed|does not match this candidate approval/,
  )
  assert.deepEqual(fs.readFileSync(f.backlogFile), before)
  assert.equal(readJSON(f.root, "runs/candidate-link/candidate-approval.json"), null)
})
