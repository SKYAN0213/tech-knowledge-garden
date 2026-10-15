import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { draftFingerprint } from "../scripts/research/editor.mjs"
import { noteText, parseNote } from "../scripts/garden.mjs"
import { loadStoredSourceRun, articleContentFingerprint } from "../scripts/research/parser.mjs"
import {
  recordCandidateApproval,
  loadCurrentCandidateApproval,
} from "../scripts/research/candidate-approval.mjs"
import { approvedArticle } from "../scripts/research/publish-adapter.mjs"
import { evaluateArticleConceptReview } from "../scripts/research/article-concept-review.mjs"
import { main } from "../scripts/research.mjs"
import {
  loadCurrentApproval,
  loadHistoricalApproval,
  assertPreviewConceptNotes,
  loadPreviewPublicationInputs,
} from "../scripts/research/preview.mjs"
import { ontologyKnowledgeIndex } from "../scripts/research/ontology-knowledge.mjs"
import { approveNoteReview, loadNoteApproval } from "../scripts/research/note-review.mjs"
import { CONCEPT_NOTE_HEADINGS } from "../scripts/research/knowledge-links.mjs"
import { archiveClosure } from "../scripts/research/archive-closure.mjs"
import { loadArchivedConceptApproval } from "../scripts/research/concept-archive.mjs"
import {
  registerArchiveLocation,
  lookupArchiveLocations,
} from "../scripts/research/archive-locations.mjs"
import {
  loadApprovedOntologyInput,
  projectEvidenceOntology,
} from "../scripts/research/ontology.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "article-concepts-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const vault = path.join(root, "vault"),
    run = "article"
  const url = "https://example.org/runtime",
    text = "Example released software that traces agent actions and enforces policy."
  const id = sourceId(url),
    hash = sha256(text),
    parseId = sha256("parse"),
    claimId = "c1"
  const document = {
    source_id: id,
    source_version_id: `${id}:${hash}`,
    original_url: url,
    final_url: url,
    body_sha256: hash,
    body_path: `documents/${id}/${hash}/body.bin`,
    fetch_status: "captured",
    observed_at: "2026-10-01T00:00:00Z",
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id: id,
    source_version_id: document.source_version_id,
    parse_id: parseId,
    title: "Runtime",
    status: "extracted",
    dates: { published_at: "2026-10-01", observed_at: document.observed_at },
    blocks: [{ block_id: `${parseId}:b1`, text, locator: { text_hash: hash } }],
    quality: { missing_pages: [] },
  }
  const claims = recordFactReview(
    [
      {
        claim_id: claimId,
        statement: text,
        claim_kind: "attributed_fact",
        subject: "Example",
        event_state: "completed",
        published_at: "2026-10-01",
        effective_period: null,
        numbers: [],
        evidence: [
          {
            source_id: id,
            source_version_id: document.source_version_id,
            parse_id: parseId,
            block_id: parse.blocks[0].block_id,
            quote: text,
            support: "direct",
          },
        ],
      },
    ],
    [
      {
        claim_id: claimId,
        status: "verified",
        reason: "Direct source review",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      },
    ],
    { reviewer: "fixture editor", reviewed_at: "2026-10-02" },
    [parse],
  )
  const draft = {
    title: "Example, 에이전트 실행 정책 소프트웨어 공개",
    sector: "사이버보안",
    theme: "제품·서비스",
    tags: ["신제품"],
    entities: ["Example"],
    lead: [
      {
        text: "Example은 10월 1일 에이전트 실행을 추적하고 정책을 적용하는 소프트웨어를 공개했다.",
        claim_ids: [claimId],
      },
      { text: "이 소프트웨어는 회사가 설명한 에이전트 실행 통제 방식이다.", claim_ids: [claimId] },
    ],
    explanations: [],
    facts: { who: "Example", when: "2026-10-01", where: null, what: text, how: null, why: null },
  }
  const record = {
    schema: "research-draft/v1",
    draft_id: draftFingerprint(draft),
    draft,
    public_approved: false,
  }
  const notePath = "Knowledge/Agent Security.md"
  const content = noteText(
    {
      title: "Agent Security",
      entry_type: "concept",
      schema_version: "tech-encyclopedia/v2",
      concept_id: "agent-security",
      label: "에이전트 보안",
      last_reviewed: "2026-10-02",
      aliases: ["에이전트 보안"],
      verified_sources: [url],
      map_review: {
        decision: "include",
        kind: "security",
        reason: "실행 권한과 경계를 보호하는 전문 통제다.",
        reviewed: "2026-10-02",
      },
    },
    "# Agent Security\n\n## 한 문장 정의\n\n에이전트 도구 실행 경계를 보호하는 통제다.\n",
  )
  fs.mkdirSync(path.dirname(path.join(vault, notePath)), { recursive: true })
  fs.writeFileSync(path.join(vault, notePath), content)
  const review = {
    status: "approved",
    draft_id: record.draft_id,
    reviewer: "fixture editor",
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
    reader_quality_review: { repetition_checked: true },
    concept_ids: ["agent-security"],
    concept_review: {
      schema: "article-concept-review/v1",
      assignments: [
        {
          concept_id: "agent-security",
          status: "verified",
          reason: "공개 기사에 사용한 실행 정책 사실을 용어 정의의 실행 경계 통제와 직접 대조했다.",
          reviewer: "fixture editor",
          reviewed_at: "2026-10-03",
          definition_read: true,
          article_source_read: true,
          relationship_checked: true,
          aliases_checked: true,
          evidence: [{ event_id: "0123456789abcdef", claim_id: claimId }],
          note: { path: notePath, sha256: sha256(content) },
        },
      ],
    },
  }
  for (const [file, value] of Object.entries({
    "draft.json": record,
    "claims.json": { claims },
    "reviewed-claims.json": { claims },
    "documents.json": [document],
    "parses.json": [parse],
  }))
    atomicWrite(root, `runs/${run}/${file}`, value)
  atomicWrite(root, document.body_path, text)
  atomicWrite(root, `parses/${parseId}/parse.json`, parse)
  const reviewFile = path.join(root, "review.json")
  fs.writeFileSync(reviewFile, JSON.stringify(review))
  const project = () => approvedArticle(record, claims, [document], review, [parse])
  return {
    root,
    vault,
    run,
    claims,
    parse,
    record,
    review,
    reviewFile,
    content,
    notePath,
    project,
    evaluate: () =>
      evaluateArticleConceptReview(root, project(), record, claims, [parse], review, { vault }),
  }
}

function restoreArchive(f, result, destination = "restore/concepts") {
  const restored = spawnSync(
    "python3",
    [
      "scripts/research/package-archive.py",
      "--root",
      f.root,
      "--package",
      result.package.path,
      "--expected-sha256",
      result.package.sha256,
      "--restore-to",
      destination,
    ],
    { encoding: "utf8" },
  )
  assert.equal(restored.status, 0, restored.stderr)
  return path.join(f.root, destination)
}

for (const sameIDs of [false, true])
  test(`published specialist ${sameIDs ? "definition revision" : "linkage"} preserves the event and prose and requires native prior approval`, async (t) => {
    const f = fixture(t)
    for (const name of [
      "documents.json",
      "parses.json",
      "draft.json",
      "claims.json",
      "reviewed-claims.json",
    ])
      atomicWrite(f.root, `runs/prior/${name}`, readJSON(f.root, `runs/${f.run}/${name}`))
    const { concept_review, ...priorReview } = f.review
    atomicWrite(f.root, "prior-review.json", {
      ...priorReview,
      ...(sameIDs ? { concept_review } : {}),
      concept_ids: sameIDs ? f.review.concept_ids : [],
      reviewed_at: sameIDs ? "2026-10-03" : "2026-10-02",
    })
    await main([
      "approve",
      "--root",
      f.root,
      "--run",
      "prior",
      "--review",
      path.join(f.root, "prior-review.json"),
      "--vault",
      f.vault,
    ])
    if (sameIDs) {
      const old = parseNote(f.content)
      const content = noteText(
        {
          ...old.meta,
          type: "knowledge",
          status: "evergreen",
          domain: "AI Systems",
          group: "실행 통제",
          created: "2026-10-02",
          updated: "2026-10-03",
          last_reviewed: "2026-10-03",
          keywords: ["Agent Security"],
          parent_concepts: [],
          related_concepts: [],
          tags: ["Security"],
          map_review: { ...old.meta.map_review, reviewed: "2026-10-03" },
        },
        "# Agent Security\n\n" +
          CONCEPT_NOTE_HEADINGS.map(
            (heading) =>
              "## " +
              heading +
              "\n\n" +
              ({
                "한 문장 정의": "에이전트 동작을 추적하고 정책을 적용하는 실행 통제다.",
                범위: "**포함:** 실행 추적과 정책 적용.\n\n**포함하지 않음:** 회사와 제품 이름.",
                출처: "[원문](https://example.org/runtime)",
              }[heading] || "없음"),
          ).join("\n\n") +
          "\n",
      )
      await approveNoteReview(
        f.root,
        "definition",
        {
          schema: "knowledge-note-review/v2",
          reviewer: "fixture editor",
          reason: "원문과 정의의 실행 추적 및 정책 적용을 대조했다.",
          reviewed_at: "2026-10-03",
          source_read: true,
          final_prose_read: true,
          aliases_checked: true,
          connections_checked: true,
          histories_checked: true,
          notes: [
            {
              operation: "replace",
              path: f.notePath,
              previous_sha256: sha256(f.content),
              content,
              evidence: [{ run_id: f.run, claim_ids: ["c1"] }],
            },
          ],
        },
        { vault: f.vault },
      )
      f.review.concept_review.assignments[0].note = {
        path: f.notePath,
        sha256: sha256(content),
        approval_run: "definition",
      }
      fs.writeFileSync(f.reviewFile, JSON.stringify(f.review))
    }
    await main([
      "approve",
      "--root",
      f.root,
      "--run",
      f.run,
      "--review",
      f.reviewFile,
      "--vault",
      f.vault,
    ])
    const candidate = {
      key: "source-" + f.parse.source_id,
      title: "Runtime",
      source_urls: ["https://example.org/runtime"],
      source_published_at: "2026-10-01",
      review_status: "unreviewed",
      article_source_version_id: f.parse.source_version_id,
      article_parse_id: f.parse.parse_id,
      article_content_sha256: articleContentFingerprint(f.parse),
    }
    const backlogFile = path.join(f.root, "backlog.json")
    fs.writeFileSync(
      backlogFile,
      JSON.stringify({ schema: "research-candidates/v1", candidates: [candidate] }),
    )
    const options = { root: f.root, backlogFile, candidateKey: candidate.key }
    await recordCandidateApproval({ ...options, runId: "prior-link", approvedRunId: "prior" })
    const before = fs.readFileSync(backlogFile)
    const linked = JSON.parse(before).candidates[0]
    const prior = readJSON(f.root, "runs/prior/approved-article.json")
    const current = readJSON(f.root, `runs/${f.run}/approved-article.json`)
    atomicWrite(f.root, "published-concept-review.json", {
      schema: "research-existing-editorial-approval-review/v1",
      candidate_key: candidate.key,
      event_id: current.event_id,
      prior_approved_run: "prior",
      approved_run: f.run,
      expected_candidate_sha256: sha256(JSON.stringify(linked)),
      prior_article_sha256: sha256(JSON.stringify(prior)),
      article_sha256: sha256(JSON.stringify(current)),
      reviewer: "fixture primary-source editor",
      reviewed_at: "2026-10-03",
      reason:
        "Preserve the published event and full prose while attaching a source-backed specialist definition.",
      decision: "attach_reverified_approval",
      source_read: true,
      prior_article_read: true,
      article_read: true,
      identity_checked: true,
      dates_checked: true,
      numbers_checked: true,
      new_article: false,
      candidate_published: false,
    })
    const published = {
      event_id: prior.event_id,
      title: prior.title,
      source_urls: prior.source_urls,
      published_at: "2026-10-01",
      edition: "Editions/2026/10/issue",
    }
    const revision = {
      ...options,
      runId: "concept-link",
      approvedRunId: f.run,
      existingEditorialReviewPath: "published-concept-review.json",
    }
    for (const patch of [
      { event_id: "1111111111111111" },
      { title: "Another event" },
      { published_at: "2026-10-02" },
      { edition: undefined },
    ]) {
      await assert.rejects(
        recordCandidateApproval({ ...revision, publishedArticles: [{ ...published, ...patch }] }),
        /already appears/,
      )
      assert.deepEqual(fs.readFileSync(backlogFile), before)
    }
    const conceptFile = `runs/${f.run}/article-concept-review.json`
    const receipt = readJSON(f.root, conceptFile)
    atomicWrite(f.root, conceptFile, { ...receipt, links: [] })
    await assert.rejects(
      recordCandidateApproval({ ...revision, publishedArticles: [published] }),
      /already appears/,
    )
    assert.deepEqual(fs.readFileSync(backlogFile), before)
    atomicWrite(f.root, conceptFile, receipt)
    if (sameIDs) {
      const unchanged = readJSON(f.root, "runs/prior/article-concept-review.json")
      atomicWrite(f.root, conceptFile, { ...receipt, notes: unchanged.notes })
      await assert.rejects(
        recordCandidateApproval({ ...revision, publishedArticles: [published] }),
        /already appears/,
      )
      assert.deepEqual(fs.readFileSync(backlogFile), before)
      atomicWrite(f.root, conceptFile, receipt)
    }
    const priorReceiptPath = path.join(f.root, "runs/prior-link/candidate-approval.json")
    const priorReceiptBytes = fs.readFileSync(priorReceiptPath)
    fs.unlinkSync(priorReceiptPath)
    await assert.rejects(
      recordCandidateApproval({ ...revision, publishedArticles: [published] }),
      /native.*receipt|native prior approval|native approval/i,
    )
    assert.deepEqual(fs.readFileSync(backlogFile), before)
    fs.writeFileSync(priorReceiptPath, priorReceiptBytes)
    await recordCandidateApproval({ ...revision, publishedArticles: [published] })
    const result = JSON.parse(fs.readFileSync(backlogFile)).candidates[0]
    assert.equal(result.event_id, prior.event_id)
    assert.equal(result.approval.approved_run, f.run)
    assert.deepEqual(result.approval_history[0].approval, linked.approval)
    assert.deepEqual(readJSON(f.root, "runs/prior/approved-article.json"), prior)
    assert.deepEqual(current.record, prior.record)
    const bytes = fs.readFileSync(backlogFile)
    await recordCandidateApproval({ ...revision, publishedArticles: [published] })
    assert.deepEqual(fs.readFileSync(backlogFile), bytes)
  })

test("standalone editorial event locations bind only cited versions and reindex without rewriting old evidence", async (t) => {
  const f = fixture(t)
  const original = readJSON(f.root, `runs/${f.run}/documents.json`)[0]
  const extraBody = "Later, unrelated text at the same URL."
  const hash = sha256(extraBody)
  const later = {
    ...original,
    body_sha256: hash,
    source_version_id: `${original.source_id}:${hash}`,
    body_path: `documents/${original.source_id}/${hash}/body.bin`,
  }
  atomicWrite(f.root, later.body_path, extraBody)
  atomicWrite(f.root, `runs/${f.run}/documents.json`, [original, later])
  await main([
    "approve",
    "--root",
    f.root,
    "--run",
    f.run,
    "--vault",
    f.vault,
    "--review",
    f.reviewFile,
  ])
  const packaged = await archiveClosure(f.root, "portable", f.run, [], { vault: f.vault })
  const metadataFile = path.join(f.root, "drive-metadata.json")
  fs.writeFileSync(
    metadataFile,
    JSON.stringify({
      schema: "research-drive-archive-observation/v1",
      observed_at: new Date().toISOString(),
      file_id: "editorial-archive",
      name: "portable.zip",
      mime_type: "application/zip",
      size: packaged.package.bytes,
      parent_ids: ["research-folder"],
      shared: false,
    }),
  )
  const args = {
    root: f.root,
    runId: "portable",
    metadataFile,
    remotePackageFile: path.join(f.root, packaged.package.path),
    expectedParentId: "research-folder",
  }
  fs.rmSync(f.vault, { recursive: true })
  const result = await registerArchiveLocation(args)
  assert.deepEqual(
    result.sources.find((s) => s.source_version_id === original.source_version_id).event_ids,
    [f.review.event_id],
  )
  assert.deepEqual(
    result.sources.find((s) => s.source_version_id === later.source_version_id).event_ids,
    [],
  )
  assert.equal(fs.existsSync(path.join(f.root, `runs/${f.run}/candidate-approval.json`)), false)
  assert.equal(lookupArchiveLocations(f.root, { eventId: f.review.event_id }).length, 1)
  const base = `archive-staging/portable/drive-location.json`
  const legacy = structuredClone(result)
  delete legacy.reused
  for (const source of legacy.sources) source.event_ids = []
  legacy.sources_sha256 = sha256(JSON.stringify(legacy.sources))
  atomicWrite(f.root, base, legacy)
  const before = fs.readFileSync(path.join(f.root, base))
  await assert.rejects(() => registerArchiveLocation(args), /explicitly reindex/)
  const current = await registerArchiveLocation({ ...args, reindex: true })
  assert.equal(current.schema, "research-drive-archive-location/v2")
  assert.equal(current.previous_location_sha256, sha256(before))
  assert.deepEqual(fs.readFileSync(path.join(f.root, base)), before)
  assert.equal((await registerArchiveLocation({ ...args, reindex: true })).reused, true)
  const located = lookupArchiveLocations(f.root, { eventId: f.review.event_id })
  assert.equal(located.length, 1)
  assert.deepEqual(
    located[0].sources.map((s) => s.source_version_id),
    [original.source_version_id],
  )
  fs.appendFileSync(path.join(f.root, base), "\n")
  assert.throws(
    () => lookupArchiveLocations(f.root, { eventId: f.review.event_id }),
    /Invalid reindexed/,
  )
})

test("standalone archive location cannot index an unapproved or changed editorial draft", async (t) => {
  const f = fixture(t)
  await main([
    "approve",
    "--root",
    f.root,
    "--run",
    f.run,
    "--vault",
    f.vault,
    "--review",
    f.reviewFile,
  ])
  const packaged = await archiveClosure(f.root, "portable", f.run, [], { vault: f.vault })
  const metadataFile = path.join(f.root, "drive-metadata.json")
  fs.writeFileSync(
    metadataFile,
    JSON.stringify({
      schema: "research-drive-archive-observation/v1",
      observed_at: new Date().toISOString(),
      file_id: "editorial-archive",
      name: "portable.zip",
      mime_type: "application/zip",
      size: packaged.package.bytes,
      parent_ids: ["research-folder"],
      shared: false,
    }),
  )
  const args = {
    root: f.root,
    runId: "portable",
    metadataFile,
    remotePackageFile: path.join(f.root, packaged.package.path),
    expectedParentId: "research-folder",
  }
  const draftFile = path.join(f.root, `runs/${f.run}/draft.json`)
  fs.appendFileSync(draftFile, "\n")
  await assert.rejects(() => registerArchiveLocation(args), /Archive dependency changed/)
  assert.equal(
    fs.existsSync(path.join(f.root, "archive-staging/portable/drive-location.json")),
    false,
  )
  await assert.rejects(
    () => registerArchiveLocation({ ...args, reindex: true }),
    /Archive dependency changed/,
  )
})

test("concept closure restores approval and ontology without the original vault or source cache", async (t) => {
  const f = fixture(t)
  const options = [
    "approve",
    "--root",
    f.root,
    "--run",
    f.run,
    "--vault",
    f.vault,
    "--review",
    f.reviewFile,
  ]
  await main(options)
  const original = loadCurrentApproval(f.root, f.run, { vault: f.vault })
  const graph = projectEvidenceOntology([
    loadApprovedOntologyInput(f.root, f.run, { vault: f.vault }),
  ])
  const result = await main([
    "archive-closure",
    "--root",
    f.root,
    "--run",
    "portable",
    "--source-run",
    f.run,
    "--vault",
    f.vault,
  ])
  assert.equal(
    (await archiveClosure(f.root, "portable", f.run, [], { vault: f.vault })).reused,
    true,
  )
  const restored = restoreArchive(f, result)
  fs.rmSync(f.vault, { recursive: true })
  fs.rmSync(path.join(f.root, "runs", f.run), { recursive: true })
  fs.rmSync(path.join(f.root, "documents"), { recursive: true })
  assert.deepEqual(loadArchivedConceptApproval(restored, "portable", f.run), original)
  const authority = readJSON(restored, "runs/portable/archive-manifest.json").concept_authorities[0]
  const vault = path.join(restored, authority.relative_vault)
  assert.deepEqual(
    projectEvidenceOntology([loadApprovedOntologyInput(restored, f.run, { vault })]),
    graph,
  )
  fs.writeFileSync(path.join(vault, "Knowledge/Injected.md"), f.content)
  assert.throws(() => loadArchivedConceptApproval(restored, "portable", f.run), /inventory changed/)
  fs.rmSync(path.join(vault, "Knowledge/Injected.md"))
  fs.appendFileSync(path.join(vault, f.notePath), "\nchanged\n")
  assert.throws(
    () => loadArchivedConceptApproval(restored, "portable", f.run),
    /dependency bytes changed/,
  )
})

test("concept closure refuses changed authority, symlinks and preexisting snapshot ownership without replacing a package", async (t) => {
  const f = fixture(t)
  await main([
    "approve",
    "--root",
    f.root,
    "--run",
    f.run,
    "--vault",
    f.vault,
    "--review",
    f.reviewFile,
  ])
  const result = await archiveClosure(f.root, "portable", f.run, [], { vault: f.vault })
  const before = fs.readFileSync(path.join(f.root, result.package.path))
  fs.appendFileSync(path.join(f.vault, f.notePath), "\nchanged\n")
  await assert.rejects(
    archiveClosure(f.root, "portable", f.run, [], { vault: f.vault }),
    /hash changed/,
  )
  fs.writeFileSync(path.join(f.vault, f.notePath), f.content)
  fs.symlinkSync(path.join(f.vault, f.notePath), path.join(f.vault, "Knowledge/Linked.md"))
  await assert.rejects(archiveClosure(f.root, "other", f.run, [], { vault: f.vault }), /[Ss]ymlink/)
  fs.rmSync(path.join(f.vault, "Knowledge/Linked.md"))
  const authority = readJSON(f.root, "runs/portable/archive-manifest.json").concept_authorities[0]
  fs.rmSync(path.join(f.root, `runs/${authority.run}/concept-authority.json`))
  await assert.rejects(
    archiveClosure(f.root, "portable", f.run, [], { vault: f.vault }),
    /archive ownership/,
  )
  assert.deepEqual(fs.readFileSync(path.join(f.root, result.package.path)), before)
})

test("article concept approval binds a specialist definition and public fact without exporting review reasons", async (t) => {
  const f = fixture(t)
  const receipt = f.evaluate()
  assert.equal(receipt.links[0].concept_id, "agent-security")
  assert.equal(receipt.notes[0].sha256, sha256(f.content))
  const options = [
    "approve",
    "--root",
    f.root,
    "--run",
    f.run,
    "--vault",
    f.vault,
    "--review",
    f.reviewFile,
  ]
  assert.equal((await main(options)).status, "approved")
  const before = fs.readFileSync(path.join(f.root, `runs/${f.run}/article-concept-review.json`))
  const approval = loadCurrentApproval(f.root, f.run, { vault: f.vault })
  assert.ok(approval.files["article-concept-review.json"])
  assert.equal(
    JSON.stringify(approval.article).includes(f.review.concept_review.assignments[0].reason),
    false,
  )
  assert.equal((await main(options)).reused, true)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, `runs/${f.run}/article-concept-review.json`)),
    before,
  )
  const receiptPath = path.join(f.root, `runs/${f.run}/article-concept-review.json`)
  fs.unlinkSync(receiptPath)
  assert.throws(() => loadCurrentApproval(f.root, f.run, { vault: f.vault }), /assignment differs/)
  fs.writeFileSync(receiptPath, before)
  const altered = JSON.parse(before)
  altered.links[0].reason = "Another editorial interpretation"
  fs.writeFileSync(receiptPath, JSON.stringify(altered))
  assert.throws(() => loadCurrentApproval(f.root, f.run, { vault: f.vault }), /assignment differs/)
  fs.writeFileSync(receiptPath, before)
  fs.appendFileSync(path.join(f.vault, f.notePath), "\nchanged definition\n")
  assert.throws(() => loadCurrentApproval(f.root, f.run, { vault: f.vault }), /hash changed/)
})

test("ontology concept edges retain reviewed claim and specialist note provenance", async (t) => {
  const f = fixture(t)
  await main([
    "approve",
    "--root",
    f.root,
    "--run",
    f.run,
    "--vault",
    f.vault,
    "--review",
    f.reviewFile,
  ])
  const input = loadApprovedOntologyInput(f.root, f.run, { vault: f.vault })
  assert.ok(input.file_hashes["article-concept-review.json"])
  const ontology = projectEvidenceOntology([input])
  const edge = ontology.edges.find((e) => e.property === "explains")
  assert.equal(edge.basis, "reviewed_article_concept_assignment")
  assert.deepEqual(edge.evidence_claim_ids, ["c1"])
  assert.equal(edge.note_sha256, sha256(f.content))
})

test("native concept history survives an approved canonical replacement while publication stays strict", async (t) => {
  const f = fixture(t),
    options = { vault: f.vault }
  const firstNote = parseNote(f.content)
  const version = (day, definition) =>
    noteText(
      {
        ...firstNote.meta,
        last_reviewed: day,
        map_review: { ...firstNote.meta.map_review, reviewed: day },
      },
      `# Agent Security\n\n## 한 문장 정의\n\n${definition}\n`,
    )
  const firstContent = version("2026-10-03", "에이전트 도구 실행 경계를 보호하는 통제다.")
  const noteReview = (day, before, content) => ({
    schema: "knowledge-note-review/v1",
    reviewer: "fixture editor",
    reason: "원문 실행 통제 근거와 정의 판본을 대조했다.",
    reviewed_at: day,
    source_read: true,
    final_prose_read: true,
    aliases_checked: true,
    connections_checked: true,
    histories_checked: true,
    notes: [
      {
        path: f.notePath,
        previous_sha256: sha256(before),
        content,
        evidence: [{ run_id: f.run, claim_ids: f.claims.map((c) => c.claim_id) }],
      },
    ],
  })
  await approveNoteReview(
    f.root,
    "definition-first",
    noteReview("2026-10-03", f.content, firstContent),
    options,
  )
  f.review.concept_review.assignments[0].note = {
    path: f.notePath,
    sha256: sha256(firstContent),
    approval_run: "definition-first",
  }
  fs.writeFileSync(f.reviewFile, JSON.stringify(f.review))
  await main([
    "approve",
    "--root",
    f.root,
    "--run",
    f.run,
    "--vault",
    f.vault,
    "--review",
    f.reviewFile,
  ])
  const approved = loadCurrentApproval(f.root, f.run, options)
  const source = loadStoredSourceRun(f.root, f.run)
  const document = source.documents[0]
  const key = `source-${document.source_id}`
  const backlogFile = path.join(f.root, "history-backlog.json")
  atomicWrite(f.root, "history-backlog.json", {
    schema: "research-candidates/v1",
    candidates: [
      {
        key,
        title: f.parse.title,
        source_urls: [document.original_url],
        source_published_at: f.parse.dates.published_at,
        discovered_at: document.observed_at,
        review_status: "unreviewed",
        priority: "normal",
        article_source_version_id: document.source_version_id,
        article_parse_id: f.parse.parse_id,
        article_content_sha256: articleContentFingerprint(f.parse),
      },
    ],
  })
  await recordCandidateApproval({
    root: f.root,
    runId: "candidate-history",
    approvedRunId: f.run,
    candidateKey: key,
    backlogFile,
  })
  const candidate = readJSON(f.root, "history-backlog.json").candidates[0]
  const candidateProof = await loadCurrentCandidateApproval(f.root, candidate, options)
  const input = loadApprovedOntologyInput(f.root, f.run, options)
  const graph = projectEvidenceOntology([input])
  const index = ontologyKnowledgeIndex(f.root, graph, options)
  atomicWrite(f.vault, f.notePath, firstContent)
  const nextContent = version("2026-10-04", "에이전트의 도구 실행에 정책을 적용하는 통제다.")
  await approveNoteReview(
    f.root,
    "definition-next",
    noteReview("2026-10-04", firstContent, nextContent),
    options,
  )
  atomicWrite(f.vault, f.notePath, nextContent)
  assert.throws(() => loadCurrentApproval(f.root, f.run, options), /Canonical note changed/)
  assert.deepEqual(loadHistoricalApproval(f.root, f.run, options), approved)
  assert.deepEqual(await loadCurrentCandidateApproval(f.root, candidate, options), candidateProof)
  assert.deepEqual(loadApprovedOntologyInput(f.root, f.run, options), input)
  assert.deepEqual(ontologyKnowledgeIndex(f.root, graph, options), index)
  assert.equal(index.events.length, 1)
  assert.equal(index.concepts[0].current.definition, "에이전트 도구 실행 경계를 보호하는 통제다.")
  assert.equal(fs.readFileSync(path.join(f.vault, f.notePath), "utf8"), nextContent)
  const altered = readJSON(f.root, "runs/definition-first/approved-notes.json")
  altered.notes[0].content += "Unreviewed archived edit"
  atomicWrite(f.root, "runs/definition-first/approved-notes.json", altered)
  assert.throws(() => loadHistoricalApproval(f.root, f.run, options), /bytes differ/)
  assert.throws(() => ontologyKnowledgeIndex(f.root, graph, options), /bytes differ/)
  await assert.rejects(loadCurrentCandidateApproval(f.root, candidate, options), /bytes differ/)
})

test("current article approval can read an exact approved after-note over the unchanged before-vault", async (t) => {
  const f = fixture(t)
  const original = f.content
  const before = parseNote(original)
  const after = noteText(
    {
      ...before.meta,
      last_reviewed: "2026-10-04",
      map_review: { ...before.meta.map_review, reviewed: "2026-10-04" },
    },
    before.body + "\n\n승인된 판본의 원문 근거를 추가했다.\n",
  )
  await approveNoteReview(
    f.root,
    "overlay-note",
    {
      schema: "knowledge-note-review/v2",
      reviewer: "fixture editor",
      reason: "원문과 specialist 정의의 after 판본을 대조하고 승인했다.",
      reviewed_at: "2026-10-04",
      source_read: true,
      final_prose_read: true,
      aliases_checked: true,
      connections_checked: true,
      histories_checked: true,
      notes: [
        {
          operation: "replace",
          path: f.notePath,
          previous_sha256: sha256(original),
          content: after,
          evidence: [{ run_id: f.run, claim_ids: ["c1"] }],
        },
      ],
    },
    { vault: f.vault },
  )
  fs.writeFileSync(path.join(f.vault, f.notePath), after)
  f.review.concept_review.assignments[0].note.sha256 = sha256(after)
  f.review.concept_review.assignments[0].reviewed_at = "2026-10-04"
  f.review.reviewed_at = "2026-10-04"
  fs.writeFileSync(f.reviewFile, JSON.stringify(f.review))
  await main([
    "approve",
    "--root",
    f.root,
    "--run",
    f.run,
    "--vault",
    f.vault,
    "--review",
    f.reviewFile,
  ])
  fs.writeFileSync(path.join(f.vault, f.notePath), original)
  assert.throws(
    () => loadPreviewPublicationInputs(f.root, "preview", [f.run], { vault: f.vault }),
    /Specialist definition identity or reviewed note hash changed/,
  )
  const preflight = loadPreviewPublicationInputs(f.root, "preview", [f.run], {
    vault: f.vault,
    knowledgeRuns: ["overlay-note"],
  })
  assert.equal(preflight.approvals[0].concept_review.notes[0].sha256, sha256(after))
  assert.equal(preflight.knowledge[0].approval.notes[0].before_content, original)
  assert.equal(fs.readFileSync(path.join(f.vault, f.notePath), "utf8"), original)
})

test("private preview accepts a separately approved exact note binding and rejects altered provenance", async (t) => {
  const f = fixture(t)
  const before = parseNote(f.content)
  const after = noteText(
    {
      ...before.meta,
      last_reviewed: "2026-10-04",
      map_review: { ...before.meta.map_review, reviewed: "2026-10-04" },
    },
    before.body + "\n\n동일한 승인 판본이다.\n",
  )
  const review = {
    schema: "knowledge-note-review/v2",
    reviewer: "fixture editor",
    reason: "원문과 specialist 정의 판본의 내용과 근거를 검토했다.",
    reviewed_at: "2026-10-04",
    source_read: true,
    final_prose_read: true,
    aliases_checked: true,
    connections_checked: true,
    histories_checked: true,
    notes: [
      {
        operation: "replace",
        path: f.notePath,
        previous_sha256: sha256(f.content),
        content: after,
        evidence: [{ run_id: f.run, claim_ids: ["c1"] }],
      },
    ],
  }
  await approveNoteReview(f.root, "original-note", review, { vault: f.vault })
  await approveNoteReview(f.root, "overlay-note", review, { vault: f.vault })
  const original = loadNoteApproval(f.root, "original-note", { vault: f.vault })
  const overlay = loadNoteApproval(f.root, "overlay-note", { vault: f.vault })
  const approvals = [
    {
      concept_review: {
        notes: [
          {
            path: f.notePath,
            sha256: sha256(after),
            approval_run: "original-note",
            approval_files: original.files,
          },
        ],
      },
    },
  ]
  assert.doesNotThrow(() =>
    assertPreviewConceptNotes(approvals, [overlay], { root: f.root, vault: f.vault }),
  )
  const tampered = structuredClone(overlay)
  tampered.approval.notes[0].evidence = []
  assert.throws(
    () => assertPreviewConceptNotes(approvals, [tampered], { root: f.root, vault: f.vault }),
    /exact approved concept note/,
  )
})

test("historical concept reads never invent a snapshot for a changed canonical-only assignment", async (t) => {
  const f = fixture(t),
    options = { vault: f.vault }
  await main([
    "approve",
    "--root",
    f.root,
    "--run",
    f.run,
    "--vault",
    f.vault,
    "--review",
    f.reviewFile,
  ])
  assert.deepEqual(
    loadHistoricalApproval(f.root, f.run, options),
    loadCurrentApproval(f.root, f.run, options),
  )
  atomicWrite(f.vault, f.notePath, f.content + "Unreviewed new definition")
  assert.throws(
    () => loadHistoricalApproval(f.root, f.run, options),
    /definition identity|hash changed/,
  )
  assert.throws(
    () => loadApprovedOntologyInput(f.root, f.run, options),
    /definition identity|hash changed/,
  )
})

test("existing specialist assignments reject a conflicting canonical alias", (t) => {
  const f = fixture(t)
  assert.equal(f.evaluate().links.length, 1)
  const duplicate = f.content.replace("concept_id: agent-security", "concept_id: another-security")
  fs.writeFileSync(path.join(f.vault, "Knowledge/Another Security.md"), duplicate)
  assert.throws(f.evaluate, /identity or exact alias conflicts/)
})

test("new approvals cannot attach naked IDs while historical immutable decisions remain readable", async (t) => {
  const f = fixture(t)
  delete f.review.concept_review
  fs.writeFileSync(f.reviewFile, JSON.stringify(f.review))
  await assert.rejects(
    main([
      "approve",
      "--root",
      f.root,
      "--run",
      f.run,
      "--vault",
      f.vault,
      "--review",
      f.reviewFile,
    ]),
    /Explicit article concept assignments/,
  )
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
  atomicWrite(f.root, `runs/${f.run}/editorial-review.json`, f.review)
  atomicWrite(f.root, `runs/${f.run}/approved-article.json`, f.project())
  assert.deepEqual(
    loadCurrentApproval(f.root, f.run, { vault: f.vault }).article.article_review.concept_ids,
    ["agent-security"],
  )
  assert.equal(
    (await main(["approve", "--root", f.root, "--run", f.run, "--review", f.reviewFile])).reused,
    true,
  )
})

test("concept assignments reject another event, unused facts, duplicate IDs, unchecked definitions and company nodes", (t) => {
  const changes = {
    event: (f) => (f.review.concept_review.assignments[0].evidence[0].event_id = "other"),
    unused: (f) => (f.review.concept_review.assignments[0].evidence[0].claim_id = "not-in-prose"),
    duplicate: (f) => f.review.concept_ids.push("agent-security"),
    unchecked: (f) => (f.review.concept_review.assignments[0].definition_read = false),
    company: (f) => {
      f.review.concept_ids = ["example"]
      f.review.concept_review.assignments[0].concept_id = "example"
    },
    traversal: (f) =>
      (f.review.concept_review.assignments[0].note.path = "Knowledge/../Agent Security.md"),
    unreviewed: (f) => (f.claims[0].review.status = "unreviewed"),
    date: (f) => (f.review.concept_review.assignments[0].reviewed_at = "2026-10-01"),
  }
  for (const change of Object.values(changes)) {
    const f = fixture(t)
    assert.equal(f.evaluate().links.length, 1)
    change(f)
    assert.throws(f.evaluate)
  }
})

test("pending specialist relations can target an approved sibling without assigning it to the article", async (t) => {
  const f = fixture(t),
    noteRun = "linked-specialists"
  const makeNote = (id, title, connections = []) => {
    const meta = {
      title,
      type: "knowledge",
      entry_type: "concept",
      schema_version: "tech-encyclopedia/v2",
      status: "evergreen",
      domain: "AI Systems",
      group: "실행 통제",
      concept_id: id,
      label: title,
      created: "2026-10-03",
      updated: "2026-10-03",
      last_reviewed: "2026-10-03",
      aliases: [],
      keywords: [title],
      parent_concepts: [],
      related_concepts: [],
      tags: ["Security"],
      verified_sources: ["https://example.org/runtime"],
      map_review: {
        decision: "include",
        kind: "security",
        reason: "원문에 근거해 실행을 통제하는 별도의 전문 방법이다.",
        reviewed: "2026-10-03",
      },
      connections,
    }
    const content = noteText(
      meta,
      "# " +
        title +
        "\n\n" +
        CONCEPT_NOTE_HEADINGS.map(
          (heading) =>
            "## " +
            heading +
            "\n\n" +
            ({
              "한 문장 정의": "에이전트 동작을 추적하고 정책을 적용하는 실행 통제다.",
              범위: "**포함:** 실행 통제.\n\n**포함하지 않음:** 회사와 제품 이름.",
              출처: "[원문](https://example.org/runtime)",
            }[heading] || "없음"),
        ).join("\n\n") +
        "\n",
    )
    return {
      operation: "create",
      path: "Knowledge/" + title + ".md",
      previous_sha256: null,
      content,
      evidence: [{ run_id: f.run, claim_ids: ["c1"] }],
    }
  }
  const sibling = makeNote("runtime-tracing", "Runtime Tracing")
  const selected = makeNote("runtime-policy", "Runtime Policy", [
    {
      target: "runtime-tracing",
      reason: "원문에서 정책 실행과 동작 추적을 연결한다.",
      evidence: ["https://example.org/runtime"],
    },
  ])
  await approveNoteReview(
    f.root,
    noteRun,
    {
      schema: "knowledge-note-review/v2",
      reviewer: "fixture editor",
      reason: "연결된 두 전문 방법을 함께 대조했다.",
      reviewed_at: "2026-10-03",
      source_read: true,
      final_prose_read: true,
      aliases_checked: true,
      connections_checked: true,
      histories_checked: true,
      notes: [selected, sibling],
    },
    { vault: f.vault },
  )
  f.review.concept_ids = ["runtime-policy"]
  const assignment = f.review.concept_review.assignments[0]
  assignment.concept_id = "runtime-policy"
  assignment.note = { path: selected.path, sha256: sha256(selected.content), approval_run: noteRun }
  const receipt = f.evaluate()
  assert.equal(receipt.links.length, 1)
  assert.equal(receipt.links[0].concept_id, "runtime-policy")
  assert.deepEqual(
    receipt.notes.map((note) => note.path),
    [selected.path],
  )
  assert.ok(receipt.notes[0].approval_files)
  assert.equal(fs.existsSync(path.join(f.vault, sibling.path)), false)
  assert.deepEqual(f.evaluate(), receipt)

  // Selecting both siblings must reuse their shared proposal set, not conflict
  // with duplicate paths or add any undeclared article assignment.
  f.review.concept_ids.push("runtime-tracing")
  f.review.concept_review.assignments.push({
    ...structuredClone(assignment),
    concept_id: "runtime-tracing",
    note: { path: sibling.path, sha256: sha256(sibling.content), approval_run: noteRun },
  })
  const both = f.evaluate()
  assert.deepEqual(
    both.links.map((link) => link.concept_id),
    ["runtime-policy", "runtime-tracing"],
  )

  const approved = readJSON(f.root, `runs/${noteRun}/approved-notes.json`)
  approved.notes[1].content += "\n이 승인 뒤 변경된 문장\n"
  atomicWrite(f.root, `runs/${noteRun}/approved-notes.json`, approved)
  assert.throws(() => f.evaluate(), /changed|differs|mismatch/i)
})

test("shared definition evidence closes across two selecting article runs and restores both approvals", async (t) => {
  const f = fixture(t),
    peerRun = "article-peer",
    noteRun = "shared-definition"
  for (const name of [
    "draft.json",
    "claims.json",
    "reviewed-claims.json",
    "documents.json",
    "parses.json",
  ])
    atomicWrite(f.root, `runs/${peerRun}/${name}`, readJSON(f.root, `runs/${f.run}/${name}`))
  const meta = {
    title: "Runtime Policy",
    type: "knowledge",
    entry_type: "concept",
    schema_version: "tech-encyclopedia/v2",
    status: "evergreen",
    domain: "AI Systems",
    group: "실행 통제",
    concept_id: "runtime-policy",
    label: "런타임 정책",
    created: "2026-10-03",
    updated: "2026-10-03",
    last_reviewed: "2026-10-03",
    aliases: [],
    keywords: ["Runtime policy"],
    parent_concepts: [],
    related_concepts: [],
    tags: [],
    verified_sources: ["https://example.org/runtime"],
    map_review: {
      decision: "include",
      kind: "security",
      reason: "도구 실행 경계의 전문 통제다.",
      reviewed: "2026-10-03",
    },
  }
  const content = noteText(
    meta,
    "# Runtime Policy\n\n" +
      CONCEPT_NOTE_HEADINGS.map(
        (heading) =>
          "## " +
          heading +
          "\n\n" +
          ({
            "한 문장 정의": "에이전트의 도구 실행 경계를 통제하는 정책이다.",
            범위: "**포함:** 도구 실행 통제.\n\n**포함하지 않음:** 회사나 제품 이름.",
            출처: "[원문](https://example.org/runtime)",
          }[heading] || "없음"),
      ).join("\n\n") +
      "\n",
  )
  const notePath = "Knowledge/Runtime Policy.md"
  await approveNoteReview(
    f.root,
    noteRun,
    {
      schema: "knowledge-note-review/v2",
      reviewer: "fixture editor",
      reason: "두 검토 판본의 사실로 같은 전문 정의를 대조했다.",
      reviewed_at: "2026-10-03",
      source_read: true,
      final_prose_read: true,
      aliases_checked: true,
      connections_checked: true,
      histories_checked: true,
      notes: [
        {
          operation: "create",
          path: notePath,
          previous_sha256: null,
          content,
          evidence: [f.run, peerRun].map((run_id) => ({ run_id, claim_ids: ["c1"] })),
        },
      ],
    },
    { vault: f.vault },
  )
  f.review.concept_ids = [meta.concept_id]
  const assignment = f.review.concept_review.assignments[0]
  assignment.concept_id = meta.concept_id
  assignment.note = { path: notePath, sha256: sha256(content), approval_run: noteRun }
  fs.writeFileSync(f.reviewFile, JSON.stringify(f.review))
  for (const run of [f.run, peerRun])
    await main([
      "approve",
      "--root",
      f.root,
      "--run",
      run,
      "--vault",
      f.vault,
      "--review",
      f.reviewFile,
    ])
  const portable = await archiveClosure(f.root, "shared-definition-portable", f.run, [], {
    vault: f.vault,
  })
  assert.ok([f.run, peerRun, noteRun].every((run) => portable.bound_runs.includes(run)))
  const manifest = readJSON(f.root, "runs/shared-definition-portable/archive-manifest.json")
  assert.ok(
    manifest.dependencies.some(
      (e) => e.from === peerRun && e.to === noteRun && e.kind === "concept_note_approval",
    ),
  )
  assert.ok(
    manifest.dependencies.some(
      (e) => e.from === noteRun && e.to === peerRun && e.kind === "knowledge_fact_source",
    ),
  )
  const restored = restoreArchive(f, portable, "restore/shared-definition")
  for (const run of [f.run, peerRun])
    assert.deepEqual(
      loadArchivedConceptApproval(restored, "shared-definition-portable", run),
      loadCurrentApproval(f.root, run, { vault: f.vault }),
    )
  const claims = readJSON(f.root, `runs/${peerRun}/reviewed-claims.json`)
  claims.claims[0].value = "Changed after approval"
  atomicWrite(f.root, `runs/${peerRun}/reviewed-claims.json`, claims)
  await assert.rejects(
    () => archiveClosure(f.root, "tampered-shared-definition", f.run, [], { vault: f.vault }),
    /changed|differs|mismatch/,
  )
})

test("definition facts may select exact source bytes from the article using that approved definition", async (t) => {
  const f = fixture(t),
    definitionRun = "definition-facts",
    noteRun = "selected-definition"
  await main([
    "select-source",
    "--root",
    f.root,
    "--run",
    definitionRun,
    "--source-run",
    f.run,
    "--url",
    "https://example.org/runtime",
  ])
  for (const name of ["claims.json", "reviewed-claims.json"])
    atomicWrite(f.root, `runs/${definitionRun}/${name}`, readJSON(f.root, `runs/${f.run}/${name}`))
  const note = parseNote(f.content)
  note.meta.last_reviewed = note.meta.map_review.reviewed = "2026-10-03"
  const content = noteText(note.meta, note.body)
  await approveNoteReview(
    f.root,
    noteRun,
    {
      schema: "knowledge-note-review/v1",
      reviewer: "fixture editor",
      reason: "Review the specialist definition against the selected exact source.",
      reviewed_at: "2026-10-03",
      source_read: true,
      final_prose_read: true,
      aliases_checked: true,
      connections_checked: true,
      histories_checked: true,
      notes: [
        {
          path: f.notePath,
          previous_sha256: sha256(f.content),
          content,
          evidence: [{ run_id: definitionRun, claim_ids: ["c1"] }],
        },
      ],
    },
    { vault: f.vault },
  )
  f.review.concept_review.assignments[0].note = {
    path: f.notePath,
    sha256: sha256(content),
    approval_run: noteRun,
  }
  fs.writeFileSync(f.reviewFile, JSON.stringify(f.review))
  await main([
    "approve",
    "--root",
    f.root,
    "--run",
    f.run,
    "--vault",
    f.vault,
    "--review",
    f.reviewFile,
  ])
  const portable = await archiveClosure(f.root, "selected-definition-portable", f.run, [], {
    vault: f.vault,
  })
  assert.ok(portable.bound_runs.includes(definitionRun))
  const manifest = readJSON(f.root, "runs/selected-definition-portable/archive-manifest.json")
  assert.ok(
    manifest.dependencies.some(
      (e) => e.from === definitionRun && e.to === f.run && e.kind === "source_selection",
    ),
  )
  const restored = restoreArchive(f, portable, "restore/selected-definition")
  assert.deepEqual(
    loadArchivedConceptApproval(restored, "selected-definition-portable", f.run),
    loadCurrentApproval(f.root, f.run, { vault: f.vault }),
  )
  const selection = readJSON(f.root, `runs/${definitionRun}/source-selection.json`)
  const changed = structuredClone(selection)
  changed.source_run.documents_sha256 = "0".repeat(64)
  atomicWrite(f.root, `runs/${definitionRun}/source-selection.json`, changed)
  await assert.rejects(
    archiveClosure(f.root, "changed-definition-selection", f.run, [], { vault: f.vault }),
    /changed/,
  )
  atomicWrite(f.root, `runs/${definitionRun}/source-selection.json`, selection)
  // A plain selection loop lacks the reviewed article -> note -> fact chain.
  atomicWrite(f.root, `runs/${f.run}/source-selection.json`, {
    ...selection,
    source_run: loadStoredSourceRun(f.root, definitionRun).identity,
  })
  await assert.rejects(
    archiveClosure(f.root, "plain-selection-loop", f.run, [], { vault: f.vault }),
    /Cyclic/,
  )
})

test("a not-yet-installed specialist approval binds exact source facts and requires the same note in preview", async (t) => {
  const f = fixture(t),
    notePath = "Knowledge/Runtime Policy.md",
    noteRun = "knowledge"
  const meta = {
    title: "Runtime Policy",
    type: "knowledge",
    entry_type: "concept",
    schema_version: "tech-encyclopedia/v2",
    status: "evergreen",
    domain: "AI Systems",
    group: "실행 통제",
    concept_id: "runtime-policy",
    label: "런타임 정책",
    created: "2026-10-03",
    updated: "2026-10-03",
    last_reviewed: "2026-10-03",
    aliases: ["런타임 정책"],
    keywords: ["Runtime policy"],
    parent_concepts: [],
    related_concepts: [],
    tags: ["Security"],
    verified_sources: ["https://example.org/runtime"],
    map_review: {
      decision: "include",
      kind: "security",
      reason: "에이전트 동작을 추적하고 정책을 적용하는 실행 통제다.",
      reviewed: "2026-10-03",
    },
  }
  const content = noteText(
    meta,
    "# Runtime Policy\n\n" +
      CONCEPT_NOTE_HEADINGS.map(
        (heading) =>
          "## " +
          heading +
          "\n\n" +
          ({
            "한 문장 정의": "에이전트 동작을 추적하고 정책을 적용하는 실행 통제다.",
            범위: "**포함:** 에이전트 동작 추적과 정책 적용.\n\n**포함하지 않음:** 회사나 제품 이름.",
            출처: "[원문](https://example.org/runtime)",
          }[heading] || "없음"),
      ).join("\n\n") +
      "\n",
  )
  await approveNoteReview(
    f.root,
    noteRun,
    {
      schema: "knowledge-note-review/v2",
      reviewer: "fixture editor",
      reason: "원문에서 실행 정책을 확인했다.",
      reviewed_at: "2026-10-03",
      source_read: true,
      final_prose_read: true,
      aliases_checked: true,
      connections_checked: true,
      histories_checked: true,
      notes: [
        {
          operation: "create",
          path: notePath,
          previous_sha256: null,
          content,
          evidence: [{ run_id: f.run, claim_ids: ["c1"] }],
        },
      ],
    },
    { vault: f.vault },
  )
  f.review.concept_ids = [meta.concept_id]
  const assignment = f.review.concept_review.assignments[0]
  assignment.concept_id = meta.concept_id
  assignment.note = { path: notePath, sha256: sha256(content), approval_run: noteRun }
  assert.equal(fs.existsSync(path.join(f.vault, notePath)), false)
  const receipt = f.evaluate()
  assert.ok(receipt.notes[0].approval_files)
  const approvals = [{ concept_review: receipt }]
  assert.throws(() => assertPreviewConceptNotes(approvals, []), /exact approved concept/)
  assert.throws(
    () =>
      assertPreviewConceptNotes(approvals, [
        { run: noteRun, approval: { notes: [{ path: notePath, sha256: "0".repeat(64) }] } },
      ]),
    /exact approved concept/,
  )
  assert.doesNotThrow(() =>
    assertPreviewConceptNotes(approvals, [
      { run: noteRun, approval: { notes: [{ path: notePath, sha256: sha256(content) }] } },
    ]),
  )
  fs.writeFileSync(f.reviewFile, JSON.stringify(f.review))
  await main([
    "approve",
    "--root",
    f.root,
    "--run",
    f.run,
    "--vault",
    f.vault,
    "--review",
    f.reviewFile,
  ])
  assert.throws(
    () => loadPreviewPublicationInputs(f.root, "preview", [f.run], { vault: f.vault }),
    /exact approved concept/,
  )
  const preflight = loadPreviewPublicationInputs(f.root, "preview", [f.run], {
    vault: f.vault,
    knowledgeRuns: [noteRun],
  })
  assert.equal(preflight.approvals[0].article.event_id, f.review.event_id)
  assert.deepEqual(preflight.knowledgeRuns, [noteRun])
  assert.equal(preflight.knowledge[0].approval.notes[0].sha256, sha256(content))
  assert.throws(
    () =>
      loadPreviewPublicationInputs(f.root, "preview", [f.run], {
        vault: f.vault,
        knowledgeRuns: [noteRun, noteRun],
      }),
    /Distinct approved input/,
  )
  assert.equal(fs.existsSync(path.join(f.root, "runs/preview")), false)
  const portable = await archiveClosure(f.root, "private-note-portable", f.run, [], {
    vault: f.vault,
  })
  assert.ok(portable.bound_runs.includes(noteRun))
  const restored = restoreArchive(f, portable)
  assert.deepEqual(
    loadArchivedConceptApproval(restored, "private-note-portable", f.run).concept_review,
    receipt,
  )
  const savedNotes = fs.readFileSync(path.join(f.root, `runs/${noteRun}/approved-notes.json`))
  atomicWrite(f.root, `runs/${noteRun}/approved-notes.json`, { tampered: true })
  assert.throws(f.evaluate, /differs from current evidence/)
  atomicWrite(f.root, `runs/${noteRun}/approved-notes.json`, savedNotes)
  const pending = loadCurrentApproval(f.root, f.run, { vault: f.vault })
  const graph = projectEvidenceOntology([
    loadApprovedOntologyInput(f.root, f.run, { vault: f.vault }),
  ])
  atomicWrite(f.vault, notePath, content)
  assert.deepEqual(f.evaluate(), receipt)
  assert.deepEqual(loadCurrentApproval(f.root, f.run, { vault: f.vault }), pending)
  assert.deepEqual(
    projectEvidenceOntology([loadApprovedOntologyInput(f.root, f.run, { vault: f.vault })]),
    graph,
  )
  const appliedPortable = await archiveClosure(f.root, "applied-note-portable", f.run, [], {
    vault: f.vault,
  })
  const appliedRestored = restoreArchive(f, appliedPortable, "restore/applied-concepts")
  const appliedAuthority = readJSON(
    appliedRestored,
    "runs/applied-note-portable/archive-manifest.json",
  ).concept_authorities[0]
  assert.deepEqual(
    loadArchivedConceptApproval(appliedRestored, "applied-note-portable", f.run),
    pending,
  )
  assert.deepEqual(
    projectEvidenceOntology([
      loadApprovedOntologyInput(appliedRestored, f.run, {
        vault: path.join(appliedRestored, appliedAuthority.relative_vault),
      }),
    ]),
    graph,
  )
  const changedNotes = JSON.parse(savedNotes)
  changedNotes.source_files[0].files["documents.json"] = "0".repeat(64)
  atomicWrite(f.root, `runs/${noteRun}/approved-notes.json`, changedNotes)
  assert.throws(f.evaluate, /differs from current evidence/)
})

test("canonical-only historical assignments reuse the exact preserved native replacement bytes", async (t) => {
  const f = fixture(t),
    options = { vault: f.vault }
  await main([
    "approve",
    "--root",
    f.root,
    "--run",
    f.run,
    "--vault",
    f.vault,
    "--review",
    f.reviewFile,
  ])
  const original = loadHistoricalApproval(f.root, f.run, options),
    note = parseNote(f.content)
  const next = noteText(
    {
      ...note.meta,
      type: "knowledge",
      last_reviewed: "2026-10-04",
      map_review: { ...note.meta.map_review, reviewed: "2026-10-04" },
    },
    note.body + "\n\n원문에 따른 실행 정책 설명이다.\n",
  )
  await approveNoteReview(
    f.root,
    "canonical-replacement",
    {
      schema: "knowledge-note-review/v1",
      reviewer: "fixture editor",
      reason: "원문과 기존 정의 판본을 검토하여 교체한다.",
      reviewed_at: "2026-10-04",
      source_read: true,
      final_prose_read: true,
      aliases_checked: true,
      connections_checked: true,
      histories_checked: true,
      notes: [
        {
          path: f.notePath,
          previous_sha256: sha256(f.content),
          content: next,
          evidence: [{ run_id: f.run, claim_ids: ["c1"] }],
        },
      ],
    },
    options,
  )
  atomicWrite(f.vault, f.notePath, next)
  assert.deepEqual(loadHistoricalApproval(f.root, f.run, options), original)
  assert.equal(
    loadApprovedOntologyInput(f.root, f.run, options).article.event_id,
    original.article.event_id,
  )
  const graph = projectEvidenceOntology([loadApprovedOntologyInput(f.root, f.run, options)])
  const before = ontologyKnowledgeIndex(f.root, graph, options).concepts[0]
  assert.equal(before.current.sha256, sha256(f.content))
  const updated = ontologyKnowledgeIndex(f.root, graph, {
    ...options,
    knowledgeSelections: [{ run: "canonical-replacement", path: f.notePath, sha256: sha256(next) }],
  }).concepts[0]
  assert.equal(updated.current.sha256, sha256(next))
  assert.deepEqual(updated.events, before.events)
  assert.equal(updated.definition_versions[1].sha256, sha256(f.content))
  assert.throws(() => loadCurrentApproval(f.root, f.run, options), /identity|hash changed/)
  const stored = readJSON(f.root, "runs/canonical-replacement/approved-notes.json")
  stored.notes[0].content += "Tampered approved prose"
  atomicWrite(f.root, "runs/canonical-replacement/approved-notes.json", stored)
  assert.throws(() => loadHistoricalApproval(f.root, f.run, options), /bytes differ/)
})
