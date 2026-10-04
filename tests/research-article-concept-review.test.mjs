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
