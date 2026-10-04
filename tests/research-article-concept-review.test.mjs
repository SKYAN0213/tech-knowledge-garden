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
import { noteText } from "../scripts/garden.mjs"
import { approvedArticle } from "../scripts/research/publish-adapter.mjs"
import { evaluateArticleConceptReview } from "../scripts/research/article-concept-review.mjs"
import { main } from "../scripts/research.mjs"
import { loadCurrentApproval, assertPreviewConceptNotes } from "../scripts/research/preview.mjs"
import { approveNoteReview } from "../scripts/research/note-review.mjs"
import { CONCEPT_NOTE_HEADINGS } from "../scripts/research/knowledge-links.mjs"
import { archiveClosure } from "../scripts/research/archive-closure.mjs"
import { loadArchivedConceptApproval } from "../scripts/research/concept-archive.mjs"
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
  const portable = await archiveClosure(f.root, "private-note-portable", f.run, [], {
    vault: f.vault,
  })
  assert.ok(portable.bound_runs.includes(noteRun))
  const restored = restoreArchive(f, portable)
  assert.deepEqual(
    loadArchivedConceptApproval(restored, "private-note-portable", f.run).concept_review,
    receipt,
  )
  atomicWrite(f.root, `runs/${noteRun}/approved-notes.json`, { tampered: true })
  assert.throws(f.evaluate, /differs from current evidence/)
})
