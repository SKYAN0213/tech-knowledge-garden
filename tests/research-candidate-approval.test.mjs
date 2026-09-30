import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { canonicalURL } from "../scripts/garden.mjs"
import { researchWindow } from "../scripts/research-window.mjs"
import { recordCandidateApproval } from "../scripts/research/candidate-approval.mjs"
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
})
