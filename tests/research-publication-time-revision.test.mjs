import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { preparePublicationTimeRevision } from "../scripts/research/publication-time-revision.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { approvedArticle } from "../scripts/research/publish-adapter.mjs"
import { recordArticleApproval } from "../scripts/research/article-approval.mjs"
import { loadCurrentApproval } from "../scripts/research/preview.mjs"
import { recordCandidateApproval } from "../scripts/research/candidate-approval.mjs"
import { resolveSourceRevision } from "../scripts/research/source-revision-resolution.mjs"
import { articleContentFingerprint } from "../scripts/research/parser.mjs"
import { archiveClosure } from "../scripts/research/archive-closure.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "publication-time-revision-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const url = "https://example.org/announcement",
    text = "Example Lab announced a robot material and demonstrated sensing."
  const source_id = sourceId(url),
    hash = sha256(text),
    source_version_id = source_id + ":" + hash
  const document = {
    source_id,
    source_version_id,
    original_url: url,
    final_url: url,
    body_path: `documents/${source_id}/${hash}/body.bin`,
    body_sha256: hash,
    fetch_status: "captured",
    observed_at: "2026-10-01T13:00:00Z",
  }
  const id = sha256("old parse"),
    parse = {
      schema_version: "source-parse/v1",
      source_id,
      source_version_id,
      parse_id: id,
      title: "Robot material",
      language: "en",
      status: "extracted",
      dates: { published_at: "2026-10-01", observed_at: document.observed_at },
      blocks: [
        {
          kind: "paragraph",
          block_id: id + ":b1",
          text,
          locator: { dom_path: "/article/p", text_hash: hash },
        },
      ],
      quality: { missing_pages: [] },
    }
  const c = {
    claim_id: "c1",
    candidate_key: "source-" + source_id,
    statement: text,
    claim_kind: "attributed_fact",
    subject: "Example Lab",
    event_state: "reported",
    published_at: "2026-10-01",
    effective_period: null,
    numbers: [],
    evidence: [
      {
        source_id,
        source_version_id,
        parse_id: id,
        block_id: id + ":b1",
        quote: text,
        support: "direct",
      },
    ],
  }
  const claims = recordFactReview(
    [c],
    [
      {
        claim_id: "c1",
        status: "verified",
        reason: "Read source",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      },
    ],
    { reviewer: "test reviewer", reviewed_at: "2026-10-02" },
    [parse],
  )
  const draft = {
    title: "Example Lab, 로봇 소재 발표",
    lead: [
      { text: "Example Lab은 2026년 10월 1일 로봇 소재를 발표했다.", claim_ids: ["c1"] },
      { text: "연구팀은 감지 기능을 시연했다.", claim_ids: ["c1"] },
    ],
    facts: {
      who: "Example Lab",
      when: "2026-10-01",
      where: null,
      what: "로봇 소재 발표",
      how: null,
      why: null,
    },
    sector: "로봇·제조",
    theme: "연구·기술",
    tags: ["새로운 방법"],
    entities: ["Example Lab"],
    explanations: [],
  }
  const record = { draft, draft_id: sha256(JSON.stringify(draft)) }
  const decision = {
    status: "approved",
    draft_id: record.draft_id,
    reviewer: "test reviewer",
    source_read: true,
    final_prose_read: true,
    title_checked: true,
    dates_checked: true,
    numbers_checked: true,
    analysis_checked: true,
    event_id: "abcdef0123456789",
    published_at: "2026-10-01",
    reviewed_at: "2026-10-02",
    region: "해외",
  }
  const article = approvedArticle(record, claims, [document], decision, [parse])
  atomicWrite(root, document.body_path, text)
  atomicWrite(root, `parses/${id}/parse.json`, parse)
  for (const [name, value] of Object.entries({
    "documents.json": [document],
    "parses.json": [parse],
    "reviewed-claims.json": { claims },
    "draft.json": record,
  }))
    atomicWrite(root, "runs/prior/" + name, value)
  recordArticleApproval(root, "prior", decision, article)
  const precise = structuredClone(parse),
    preciseId = sha256("precise parse")
  precise.parse_id = preciseId
  precise.blocks[0].block_id = preciseId + ":b1"
  precise.dates = {
    published_at: "2026-10-01T08:15:23-04:00",
    observed_at: document.observed_at,
    precision: "timestamp",
    profile_status: "matched",
    basis: { type: "json-ld", dom_path: "/head/script", text: "2026-10-01T08:15:23-04:00" },
  }
  const putPrecise = () => {
    atomicWrite(root, `parses/${preciseId}/parse.json`, precise)
    atomicWrite(root, "runs/precise/documents.json", [document])
    atomicWrite(root, "runs/precise/parses.json", [precise])
  }
  putPrecise()
  const review = {
    schema: "research-publication-time-revision-review/v1",
    reviewer: "test reviewer",
    reason: "Read unchanged source, all facts and prose; retain explicit publication time.",
    reviewed_at: "2026-10-02",
    event_id: article.event_id,
    prior_article_sha256: sha256(JSON.stringify(article)),
    parse_id: preciseId,
    source_read: true,
    claims_read: true,
    prose_read: true,
    identity_checked: true,
    dates_checked: true,
    numbers_checked: true,
    new_article: false,
    candidate_published: false,
  }
  const putReview = () => atomicWrite(root, "review.json", review)
  putReview()
  const prepare = (runId = "revision") =>
    preparePublicationTimeRevision({
      root,
      runId,
      priorRunId: "prior",
      sourceRunId: "precise",
      reviewPath: "review.json",
    })
  return { root, prepare, article, parse, precise, document, putPrecise, review, putReview }
}

test("publication time revision reuses prose and immutable approval but still requires new editorial approval", async (t) => {
  const f = fixture(t),
    before = loadCurrentApproval(f.root, "prior")
  const result = await f.prepare()
  assert.equal(result.model_calls, 0)
  assert.equal(result.status, "editorial_review")
  assert.deepEqual(loadCurrentApproval(f.root, "prior"), before)
  const draft = readJSON(f.root, "runs/revision/draft.json")
  assert.deepEqual(
    draft.draft.lead.map((s) => s.text),
    readJSON(f.root, "runs/prior/draft.json").draft.lead.map((s) => s.text),
  )
  const template = readJSON(f.root, "runs/revision/editorial-review-template.json")
  const claims = readJSON(f.root, "runs/revision/reviewed-claims.json").claims
  const parses = readJSON(f.root, "runs/revision/parses.json")
  assert.equal(template.status, "pending")
  assert.equal(readJSON(f.root, "runs/revision/approved-article.json"), null)
  assert.throws(
    () => approvedArticle(draft, claims, [f.document], template, parses),
    /Explicit editorial approval/,
  )
  assert.deepEqual(await f.prepare(), result)
})

test("explicit revised approval keeps the same event and adds precise time with candidate approval history", async (t) => {
  const f = fixture(t),
    file = path.join(f.root, "backlog.json")
  const candidate = {
    key: "source-" + f.document.source_id,
    title: f.parse.title,
    source_urls: [f.document.original_url],
    source_published_at: "2026-10-01",
    discovered_at: f.document.observed_at,
    review_status: "unreviewed",
    article_source_version_id: f.document.source_version_id,
    article_parse_id: f.parse.parse_id,
    article_content_sha256: articleContentFingerprint(f.parse),
  }
  fs.writeFileSync(
    file,
    JSON.stringify({ schema: "research-candidates/v1", candidates: [candidate] }),
  )
  await recordCandidateApproval({
    root: f.root,
    runId: "prior-link",
    approvedRunId: "prior",
    candidateKey: candidate.key,
    backlogFile: file,
  })
  await f.prepare()
  const template = readJSON(f.root, "runs/revision/editorial-review-template.json")
  const decision = {
    ...template,
    status: "approved",
    source_read: true,
    final_prose_read: true,
    title_checked: true,
    dates_checked: true,
    numbers_checked: true,
    analysis_checked: true,
  }
  const article = approvedArticle(
    readJSON(f.root, "runs/revision/draft.json"),
    readJSON(f.root, "runs/revision/reviewed-claims.json").claims,
    [f.document],
    decision,
    readJSON(f.root, "runs/revision/parses.json"),
  )
  assert.equal(article.article_review.date_kind, "source-publication-time")
  assert.equal(article.article_review.source_published_at, f.precise.dates.published_at)
  recordArticleApproval(f.root, "revision", decision, article)
  const before = JSON.parse(fs.readFileSync(file)).candidates[0]
  atomicWrite(f.root, "resolution.json", {
    schema: "research-source-revision-resolution-review/v1",
    action: "replace_approval",
    prior_approved_run: "prior",
    current_source_run: "revision",
    new_approved_run: "revision",
    candidate_key: candidate.key,
    publication_time_revision_run: "revision",
    expected_candidate_sha256: sha256(JSON.stringify(before)),
    reviewer: "test reviewer",
    reason: "Publication precision reviewed",
    reviewed_at: "2026-10-02",
    source_read: true,
    revision_read: true,
    identity_checked: true,
    dates_checked: true,
    numbers_checked: true,
    dependencies_checked: true,
    new_article: false,
    candidate_published: false,
  })
  await resolveSourceRevision({
    root: f.root,
    runId: "resolution",
    backlogFile: file,
    reviewPath: "resolution.json",
  })
  const after = JSON.parse(fs.readFileSync(file)).candidates[0]
  assert.equal(after.event_id, f.article.event_id)
  assert.equal(after.approval.approved_run, "revision")
  assert.equal(after.article_parse_id, f.precise.parse_id)
  assert.equal(after.source_published_at, f.precise.dates.published_at)
  assert.equal(after.article_observed_at, f.document.observed_at)
  assert.deepEqual(after.approval_history[0].approval, before.approval)
  assert.equal(JSON.parse(fs.readFileSync(file)).candidates.length, 1)
  const saved = fs.readFileSync(file)
  const repeated = await resolveSourceRevision({
    root: f.root,
    runId: "resolution",
    backlogFile: file,
    reviewPath: "resolution.json",
  })
  assert.equal(repeated.reused, true)
  assert.deepEqual(fs.readFileSync(file), saved)
  const archive = await archiveClosure(f.root, "portable", "revision")
  assert.ok(archive.bound_runs.includes("prior"))
  assert.ok(archive.bound_runs.includes("precise"))
  const manifest = readJSON(f.root, "runs/portable/archive-manifest.json")
  assert.ok(manifest.dependencies.some((e) => e.kind === "publication_precision_prior"))
  assert.ok(manifest.dependencies.some((e) => e.kind === "publication_precision_source"))
  const precision = readJSON(f.root, "runs/revision/publication-time-revision.json")
  precision.source_identity.parses_sha256 = sha256("changed source")
  atomicWrite(f.root, "runs/revision/publication-time-revision.json", precision)
  await assert.rejects(
    resolveSourceRevision({
      root: f.root,
      runId: "resolution",
      backlogFile: file,
      reviewPath: "resolution.json",
    }),
    /Resolved publication precision lineage changed/,
  )
  assert.deepEqual(fs.readFileSync(file), saved)
})

test("precision revision rejects changed source content, inferred time and changed event day", async (t) => {
  for (const kind of ["body", "day", "naive", "conflict"]) {
    await t.test(kind, async (st) => {
      const f = fixture(st)
      if (kind === "body") {
        f.precise.blocks[0].text += " Changed fact."
        f.precise.blocks[0].locator.text_hash = sha256(f.precise.blocks[0].text)
      }
      if (kind === "day") f.precise.dates.published_at = "2026-10-01T23:15:23-04:00"
      if (kind === "naive") f.precise.dates.published_at = "2026-10-01T08:15:23"
      if (kind === "conflict") f.precise.dates.profile_status = "conflict"
      f.putPrecise()
      await assert.rejects(
        f.prepare(),
        /same original bytes|cannot infer a time|change the approved event day/,
      )
      assert.equal(fs.existsSync(path.join(f.root, "runs/revision")), false)
    })
  }
})

test("precision revision rejects missing reading checks and changed pinned approval", async (t) => {
  const f = fixture(t)
  f.review.prose_read = false
  f.putReview()
  await assert.rejects(f.prepare(), /Explicit source/)
  f.review.prose_read = true
  f.review.prior_article_sha256 = sha256("other article")
  f.putReview()
  await assert.rejects(f.prepare(), /pin the prior event/)
})

test("revision hands off to the existing approval CLI without inventing a new model extraction", async (t) => {
  const f = fixture(t)
  await f.prepare()
  const input = readJSON(f.root, "runs/revision/claims.json")
  assert.equal(input.schema, "research-approved-facts-reuse/v1")
  assert.equal(input.prior_run, "prior")
  assert.equal(input.model_artifacts, undefined)
  const result = spawnSync(
    process.execPath,
    [
      "scripts/research.mjs",
      "approve",
      "--root",
      f.root,
      "--run",
      "revision",
      "--review",
      path.join(f.root, "runs/revision/editorial-review-template.json"),
    ],
    { encoding: "utf8" },
  )
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Explicit editorial approval/)
  assert.equal(readJSON(f.root, "runs/revision/approved-article.json"), null)
})
