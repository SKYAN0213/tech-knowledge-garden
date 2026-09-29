import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { draftFingerprint } from "../scripts/research/editor.mjs"
import { approvedArticle, editionProjection } from "../scripts/research/publish-adapter.mjs"
import { loadCurrentApproval } from "../scripts/research/preview.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { main } from "../scripts/research.mjs"
import { parseNote, extractArticles } from "../scripts/garden.mjs"
import { sectorTabs } from "../scripts/reader-cards.mjs"
import { paperKey, reconcilePaperVersions } from "../scripts/research/knowledge-links.mjs"
import { validateIdentities } from "../scripts/editorial.mjs"

// Synthetic contract cases, never research evidence or publication inputs.
function fixture({ abstract = false, missingMath = false, doi = false, sourceURL = null } = {}) {
  const url = sourceURL || `https://arxiv.org/${abstract ? "abs" : "html"}/2609.12345v1`
  const lines = [
    "Research Lab released its study on September 2, 2026. arXiv:2609.12345v1" +
      (doi ? " doi:10.1234/scheduler" : ""),
    "The study describes a scheduling method evaluated on fixed workloads.",
    "The authors separately describe a workload generator.",
  ]
  const body = Buffer.from(lines.join("\n")),
    sid = sourceId(url),
    pid = sha256(url + "parse")
  const document = {
    source_id: sid,
    source_version_id: `${sid}:${sha256(body)}`,
    original_url: url,
    final_url: url,
    fetch_status: "captured",
    observed_at: "2026-09-26T00:00:00Z",
    body_path: `sources/${sid}/${sha256(body)}/body.bin`,
    body_sha256: sha256(body),
    mime: "text/html",
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id: sid,
    source_version_id: document.source_version_id,
    parse_id: pid,
    title: "Synthetic paper",
    status: missingMath ? "partial" : "extracted",
    dates: { published_at: "2026-09-02" },
    blocks: lines.map((text, i) => ({
      block_id: pid + ":b" + i,
      text,
      locator: { text_hash: sha256(text) },
    })),
    quality: {
      required_fields_present: !missingMath,
      missing_pages: [],
      ...(missingMath
        ? { missing_math: [{ dom_path: "/math", reason: "unsupported-presentation" }] }
        : {}),
    },
  }
  const raw = lines.map((statement, i) => ({
    claim_id: sha256("paper-ref-claim" + i).slice(0, 24),
    candidate_key: "fixture-paper-event",
    statement,
    subject: "Research Lab",
    claim_kind: "attributed_fact",
    event_state: "reported",
    published_at: "2026-09-02",
    effective_period: null,
    numbers: [],
    evidence: [
      {
        source_id: sid,
        source_version_id: document.source_version_id,
        parse_id: pid,
        block_id: parse.blocks[i].block_id,
        quote: statement,
        support: "direct",
      },
    ],
  }))
  const reviewed = recordFactReview(
    raw,
    raw.map((c) => ({
      claim_id: c.claim_id,
      status: "verified",
      reason: "Synthetic direct review",
      source_read: true,
      entailment_checked: true,
      identity_checked: true,
      numbers_checked: true,
      time_checked: true,
    })),
    { reviewer: "fixture-reviewer", reviewed_at: "2026-09-27" },
    [parse],
  )
  const draft = {
    title: "Research Lab, 일정 조정 연구 공개",
    lead: [
      {
        text: "Research Lab은 2026년 9월 2일 일정 조정 연구를 공개했다.",
        claim_ids: [raw[0].claim_id],
      },
      {
        text: "연구팀은 고정된 작업량으로 일정 조정 방법을 시험했다.",
        claim_ids: [raw[1].claim_id],
      },
    ],
    facts: {
      who: "Research Lab",
      when: "2026-09-02",
      where: null,
      what: "일정 조정 연구 공개",
      how: null,
      why: null,
    },
    sector: "AI",
    theme: "연구·기술",
    tags: ["새로운 방법"],
    entities: ["Research Lab"],
    explanations: [],
  }
  const record = {
    schema: "research-draft/v1",
    draft_id: draftFingerprint(draft),
    draft,
    claim_ids: raw.slice(0, 2).map((c) => c.claim_id),
    problems: [],
    public_approved: false,
  }
  const review = {
    status: "approved",
    draft_id: record.draft_id,
    reviewer: "fixture-reviewer",
    source_read: true,
    final_prose_read: true,
    title_checked: true,
    dates_checked: true,
    numbers_checked: true,
    analysis_checked: true,
    event_id: "1234567890abcdef",
    published_at: "2026-09-02",
    reviewed_at: "2026-09-28",
    region: "해외",
    concept_ids: [],
  }
  const paperReview = {
    schema: "article-paper-review/v1",
    reviewer: "fixture-reviewer",
    reviewed_at: "2026-09-28",
    papers: [
      {
        work_id: "fixture-study",
        identifiers: ["arxiv:2609.12345v1"],
        access: abstract ? "초록" : "전문",
        scope: abstract ? "abstract_only" : "full_document",
        status: "사전공개",
        evidence_url: url,
        source_version_id: document.source_version_id,
        parse_id: pid,
        claim_ids: [raw[0].claim_id],
        checks: {
          source_read: true,
          identity_and_version_checked: true,
          access_scope_checked: true,
          publication_status_checked: true,
        },
      },
    ],
  }
  return {
    document,
    parse,
    body,
    record,
    review,
    paperReview,
    reviewed: { claims: reviewed },
    claims: reviewed,
    documents: [document],
    parses: [parse],
  }
}
function approve(s, review = { ...s.review, paper_review: s.paperReview }) {
  return approvedArticle(s.record, s.claims, s.documents, review, s.parses)
}

test("a paper without DOI or arXiv uses its exact reviewed HTTPS source as an identifier", () => {
  const s = fixture({ sourceURL: "https://papers.example.org/Study.pdf?version=1" })
  s.paperReview.papers[0].identifiers = ["url:" + s.document.original_url]
  const article = approve(s),
    paper = article.record.papers[0]
  assert.deepEqual(paper.identifiers, ["url:https://papers.example.org/Study.pdf?version=1"])
  assert.equal(paper.access, "전문")
  assert.equal(paper.status, "사전공개")
  const projected = editionProjection([article], {
    key: "2026-09-03_0800_Tech_AI_Briefing",
    date: "2026-09-03",
    coverage_start: "2026-09-02T23:00:00Z",
    coverage_end: "2026-09-02T23:10:00Z",
  })
  const parsed = parseNote(projected.content)
  const items = extractArticles({ file: "vault/" + projected.path, ...parsed })
  assert.deepEqual(items[0].editorial.papers, article.record.papers)
  assert.doesNotThrow(() => validateIdentities([{ items }]))
})

test("unknown publication status stays null from review through canonical news projection", () => {
  const s = fixture({ sourceURL: "https://papers.example.org/Study.pdf" })
  s.paperReview.papers[0].identifiers = ["url:" + s.document.original_url]
  s.paperReview.papers[0].status = null
  const article = approve(s)
  assert.equal(article.record.papers[0].status, null)
  assert.equal(article.record.kind, "사건 뉴스")
  const projection = editionProjection([article], {
    key: "2026-09-03_0800_Tech_AI_Briefing",
    date: "2026-09-03",
    coverage_start: "2026-09-02T23:00:00Z",
    coverage_end: "2026-09-02T23:10:00Z",
  })
  const note = parseNote(projection.content)
  const items = extractArticles({ file: "vault/" + projection.path, ...note })
  assert.deepEqual(items[0].editorial.papers, article.record.papers)
  assert.equal(sectorTabs(items).includes("심층 분석"), false)
  for (const change of [
    (p) => (p.status = "미확인"),
    (p) => (p.status = ""),
    (p) => delete p.status,
    (p) => (p.checks.publication_status_checked = false),
    (p) => (p.scope = "abstract_only"),
  ]) {
    const review = structuredClone(s.paperReview)
    change(review.papers[0])
    assert.throws(() => approve(s, { ...s.review, paper_review: review }))
  }
})

test("canonical paper validation rejects invalid URLs and missing or unsupported status", () => {
  const s = fixture({ sourceURL: "https://papers.example.org/Study.pdf" })
  s.paperReview.papers[0].identifiers = ["url:" + s.document.original_url]
  const article = approve(s)
  const projected = editionProjection([article], {
    key: "2026-09-03_0800_Tech_AI_Briefing",
    date: "2026-09-03",
    coverage_start: "2026-09-02T23:00:00Z",
    coverage_end: "2026-09-02T23:10:00Z",
  })
  const original = parseNote(projected.content)
  for (const invalid of [
    "url:http://papers.example.org/Study.pdf",
    "url:https://reader:secret@papers.example.org/Study.pdf",
    "url:https://papers.example.org/Study.pdf#section",
    "url:https://papers.example.org/Study paper.pdf",
    "url:https://papers.example.org/Study.pdf\n",
    "doi:10.1234/scheduler ",
    "url:https://",
    42,
    null,
  ]) {
    const note = structuredClone(original)
    note.meta.article_records[0].papers[0].identifiers = [invalid]
    assert.throws(() => extractArticles({ file: projected.path, ...note }), String(invalid))
  }
  for (const status of [undefined, "미확인", "published", false]) {
    const note = structuredClone(original)
    note.meta.article_records[0].papers[0].status = status
    assert.throws(() => extractArticles({ file: projected.path, ...note }))
  }
})

test("cross-edition paper identity preserves URL path and query case", () => {
  const issue = (work_id, identifier) => ({
    items: [{ editorial: { papers: [{ work_id, identifiers: [identifier] }], relations: [] } }],
  })
  assert.doesNotThrow(() =>
    validateIdentities([
      issue("first", "url:https://papers.example.org/Study.pdf?version=A"),
      issue("second", "url:https://papers.example.org/study.pdf?version=A"),
      issue("third", "url:https://papers.example.org/Study.pdf?version=a"),
    ]),
  )
  for (const [first, second] of [
    ["url:https://PAPERS.example.org/Study.pdf", "url:https://papers.example.org/Study.pdf"],
    ["doi:10.1234/Study", "doi:10.1234/study"],
    ["arxiv:2609.12345v1", "arxiv:2609.12345v2"],
  ])
    assert.throws(
      () => validateIdentities([issue("first", first), issue("second", second)]),
      /different works/,
    )
})

test("a URL paper identifier cannot point at a cited related paper or carry credentials or a fragment", () => {
  const s = fixture({ sourceURL: "https://papers.example.org/Study.pdf" })
  const identifiers = [
    "url:https://papers.example.org/Related.pdf",
    "url:https://papers.example.org/study.pdf",
    "url:https://papers.example.org/Study.pdf#table-1",
    "url:https://reader:secret@papers.example.org/Study.pdf",
    "url:http://papers.example.org/Study.pdf",
    "url:file:///Study.pdf",
    "url:https://",
  ]
  // Co-occurrence of another paper's URL never proves work identity.
  s.parse.blocks[2].text += " https://papers.example.org/Related.pdf"
  for (const identifier of identifiers) {
    const review = structuredClone(s.paperReview)
    review.papers[0].identifiers = [identifier]
    assert.throws(() => approve(s, { ...s.review, paper_review: review }), identifier)
  }
})

test("URL paper keys preserve path case and version queries and do not merge different documents", () => {
  assert.equal(
    paperKey("url:https://PAPERS.example.org/Study.pdf"),
    "url:https://papers.example.org/Study.pdf",
  )
  assert.notEqual(
    paperKey("url:https://papers.example.org/Study.pdf"),
    paperKey("url:https://papers.example.org/study.pdf"),
  )
  assert.notEqual(
    paperKey("url:https://papers.example.org/Study.pdf?version=1"),
    paperKey("url:https://papers.example.org/Study.pdf?version=2"),
  )
  assert.throws(
    () =>
      reconcilePaperVersions([
        { work_id: "first", identifiers: ["url:https://PAPERS.example.org/Study.pdf"] },
        { work_id: "second", identifiers: ["url:https://papers.example.org/Study.pdf"] },
      ]),
    /identity conflict/,
  )
  for (const value of [
    "url:http://papers.example.org/Study.pdf",
    "url:https://reader:secret@papers.example.org/Study.pdf",
    "url:https://papers.example.org/Study.pdf#section",
    "url:https://papers.example.org/Study paper.pdf",
    "url:https://papers.example.org/Study.pdf\n",
  ])
    assert.throws(() => paperKey(value))
})

test("ordinary news preserves reviewed paper identity without inventing a deep analysis", () => {
  const s = fixture(),
    article = approve(s)
  assert.equal(article.record.kind, "사건 뉴스")
  assert.deepEqual(article.record.papers, [
    {
      work_id: "fixture-study",
      identifiers: ["arxiv:2609.12345v1"],
      access: "전문",
      status: "사전공개",
      evidence_url: s.document.original_url,
    },
  ])
  assert.equal(Object.hasOwn(article.record, "analysis_summary"), false)
  assert.deepEqual(article.record.topic_ids, [])
  const projected = editionProjection([article], {
    key: "2026-09-03_0800_Tech_AI_Briefing",
    date: "2026-09-03",
    coverage_start: "2026-09-02T23:00:00Z",
    coverage_end: "2026-09-02T23:10:00Z",
  })
  const parsed = parseNote(projected.content),
    articles = extractArticles({ file: "vault/" + projected.path, ...parsed })
  assert.deepEqual(articles[0].editorial.papers, article.record.papers)
  assert.equal(sectorTabs(articles).includes("심층 분석"), false)
  assert.equal(JSON.stringify(article).includes("paper_review"), false)
  assert.equal(JSON.stringify(article).includes("full_document"), false)
})

test("paper references are optional and do not change existing ordinary approvals", () => {
  const s = fixture(),
    article = approve(s, s.review)
  assert.deepEqual(article.record.papers, [])
  assert.deepEqual(Object.keys(article.record), [
    "title",
    "kind",
    "region",
    "facts",
    "lead",
    "explanations",
    "papers",
    "relations",
    "topic_ids",
  ])
  assert.equal(Object.hasOwn(article, "paper_review"), false)
  for (const value of [
    null,
    {},
    { ...s.paperReview, schema: "unknown" },
    { ...s.paperReview, unexpected: true },
    { ...s.paperReview, papers: [] },
  ])
    assert.throws(() => approve(s, { ...s.review, paper_review: value }))
})

test("paper metadata requires checked scope, exact version, used facts and evidence identity", () => {
  const s = fixture()
  const cases = [
    (p) => (p.identifiers = ["arxiv:2609.12345v12"]),
    (p) => (p.identifiers = ["arxiv:2609.12345"]),
    (p) => (p.identifiers = ["arxiv:2609.99999v1"]),
    (p) => (p.evidence_url = "https://arxiv.org/html/2609.12345v2"),
    (p) => (p.parse_id = sha256("unrelated")),
    (p) => (p.source_version_id = "unrelated:" + sha256("unrelated")),
    (p) => (p.claim_ids = [s.claims[2].claim_id]),
    (p) => (p.claim_ids = ["unknown"]),
    (p) => (p.claim_ids = [p.claim_ids[0], p.claim_ids[0]]),
    (p) => (p.checks.access_scope_checked = false),
    (p) => (p.checks.source_read = "true"),
    (p) => {
      p.access = "전문"
      p.scope = "abstract_only"
    },
    (p) => (p.status = "동료심사"),
  ]
  for (const mutate of cases) {
    const review = structuredClone(s.paperReview)
    mutate(review.papers[0])
    assert.throws(() => approve(s, { ...s.review, paper_review: review }), String(mutate))
  }
  for (const reviewed_at of ["2026-09-25", "2026-09-29", "2999-01-01", "2026-09-31"])
    assert.throws(
      () => approve(s, { ...s.review, paper_review: { ...s.paperReview, reviewed_at } }),
      /date|time/i,
    )
  const conflict = structuredClone(s.paperReview)
  conflict.papers.push({ ...conflict.papers[0], work_id: "different-study" })
  assert.throws(() => approve(s, { ...s.review, paper_review: conflict }), /identity conflict/i)
})

test("abstract references remain abstracts and unresolved math cannot support full text approval", () => {
  const s = fixture({ abstract: true })
  assert.equal(approve(s).record.papers[0].access, "초록")
  const inflated = structuredClone(s.paperReview)
  inflated.papers[0].access = "전문"
  inflated.papers[0].scope = "full_document"
  assert.throws(() => approve(s, { ...s.review, paper_review: inflated }), /abstract|full.text/i)
  const full = fixture({ missingMath: true })
  assert.throws(() => approve(full), /complete parsed|full.text/i)
})

test("peer-reviewed status on arXiv requires a used publisher source for the same DOI", () => {
  const s = fixture({ doi: true }),
    url = "https://journal.example.org/doi/10.1234/scheduler"
  const statement = "The journal published Research Lab's study. DOI:10.1234/scheduler"
  const sid = sourceId(url),
    body = Buffer.from(statement),
    pid = sha256("publisher-parse")
  const doc = {
    ...s.document,
    source_id: sid,
    source_version_id: sid + ":" + sha256(body),
    original_url: url,
    final_url: url,
    body_sha256: sha256(body),
  }
  const parse = {
    ...s.parse,
    source_id: sid,
    source_version_id: doc.source_version_id,
    parse_id: pid,
    blocks: [{ block_id: pid + ":b1", text: statement, locator: { text_hash: sha256(statement) } }],
  }
  const raw = {
    ...s.claims[0],
    claim_id: sha256("publisher-claim").slice(0, 24),
    statement,
    evidence: [
      {
        source_id: sid,
        source_version_id: doc.source_version_id,
        parse_id: pid,
        block_id: pid + ":b1",
        quote: statement,
        support: "direct",
      },
    ],
  }
  delete raw.review
  const claims = recordFactReview(
    [raw],
    [
      {
        claim_id: raw.claim_id,
        status: "verified",
        reason: "Synthetic publisher review",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      },
    ],
    { reviewer: "fixture-reviewer", reviewed_at: "2026-09-27" },
    [parse],
  )
  s.documents.push(doc)
  s.parses.push(parse)
  s.claims.push(...claims)
  s.record.draft.lead.push({ text: "해당 논문은 학술지에 출판됐다.", claim_ids: [raw.claim_id] })
  s.record.draft_id = draftFingerprint(s.record.draft)
  s.review.draft_id = s.record.draft_id
  const paper = s.paperReview.papers[0]
  paper.identifiers.push("doi:10.1234/scheduler")
  paper.status = "동료심사"
  paper.publication_source_version_id = doc.source_version_id
  assert.equal(approve(s).record.papers[0].status, "동료심사")
  assert.ok(approve(s).source_urls.includes(url))
  const wrong = structuredClone(s.paperReview)
  wrong.papers[0].publication_source_version_id = s.document.source_version_id
  assert.throws(() => approve(s, { ...s.review, paper_review: wrong }), /publisher evidence/i)
  const noDoi = structuredClone(s.paperReview)
  noDoi.papers[0].identifiers = ["arxiv:2609.12345v1"]
  assert.throws(() => approve(s, { ...s.review, paper_review: noDoi }), /same DOI/i)
})

test("CLI approval and re-read preserve the exact paper review and reject metadata tampering", async (t) => {
  const s = fixture(),
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "paper-approval-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const run = "fixture-paper-v1",
    dir = "runs/" + run
  atomicWrite(root, s.document.body_path, s.body)
  atomicWrite(root, `parses/${s.parse.parse_id}/parse.json`, s.parse)
  for (const [name, value] of Object.entries({
    "documents.json": s.documents,
    "parses.json": s.parses,
    "claims.json": { claims: s.claims },
    "reviewed-claims.json": s.reviewed,
    "draft.json": s.record,
    "decision.json": { ...s.review, paper_review: s.paperReview },
  }))
    atomicWrite(root, dir + "/" + name, value)
  await main([
    "approve",
    "--run",
    run,
    "--root",
    root,
    "--review",
    path.join(root, dir, "decision.json"),
  ])
  const loaded = loadCurrentApproval(root, run)
  assert.equal(loaded.article.record.papers.length, 1)
  const stored = readJSON(root, dir + "/approved-article.json")
  stored.record.papers[0].status = "동료심사"
  atomicWrite(root, dir + "/approved-article.json", stored)
  assert.throws(() => loadCurrentApproval(root, run), /changed|mismatch|differ/i)
})
