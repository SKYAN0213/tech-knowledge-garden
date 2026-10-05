import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { noteText, parseNote } from "../scripts/garden.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import {
  approveNoteReview,
  evaluateNoteReview,
  loadNoteApproval,
  loadAppliedNoteApproval,
  loadReferencedNoteApproval,
} from "../scripts/research/note-review.mjs"
import { main } from "../scripts/research.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-review-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const vault = path.join(root, "vault"),
    url = "https://example.org/research",
    source_id = sourceId(url)
  const body = "The model learns observations and actions jointly."
  const source_version_id = source_id + ":" + sha256(body),
    parse_id = sha256("parse")
  const doc = {
    source_id,
    source_version_id,
    original_url: url,
    body_sha256: sha256(body),
    body_path: "documents/body.html",
    fetch_status: "captured",
    observed_at: "2026-09-26T00:00:00Z",
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id,
    source_version_id,
    parse_id,
    title: "Research",
    status: "extracted",
    dates: { published_at: "2026-09-25", observed_at: doc.observed_at },
    blocks: [{ block_id: parse_id + ":b1", text: body, locator: { text_hash: sha256(body) } }],
    quality: { missing_pages: [] },
  }
  const claim = {
    claim_id: "fact-1",
    statement: body,
    claim_kind: "fact",
    subject: "The model",
    event_state: "completed",
    published_at: "2026-09-25",
    effective_period: null,
    numbers: [],
    evidence: [
      {
        source_id,
        source_version_id,
        parse_id,
        block_id: parse.blocks[0].block_id,
        quote: body,
        support: "direct",
      },
    ],
  }
  const reviewed = recordFactReview(
    [claim],
    [
      {
        claim_id: claim.claim_id,
        status: "verified",
        reason: "Synthetic source review",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      },
    ],
    { reviewer: "Synthetic reviewer", reviewed_at: "2026-09-26" },
    [parse],
  )
  atomicWrite(root, doc.body_path, body)
  atomicWrite(root, "parses/" + parse_id + "/parse.json", parse)
  atomicWrite(root, "runs/source/documents.json", [doc])
  atomicWrite(root, "runs/source/parses.json", [parse])
  atomicWrite(root, "runs/source/reviewed-claims.json", { claims: reviewed })
  const meta = {
    title: "Action model",
    type: "knowledge",
    entry_type: "concept",
    schema_version: "tech-encyclopedia/v2",
    concept_id: "action-model",
    label: "행동 모델",
    last_reviewed: "2026-09-26",
    aliases: ["AM"],
    verified_sources: [url],
    connections: [],
    map_review: {
      decision: "include",
      kind: "model",
      reason: "행동 출력 원리",
      reviewed: "2026-09-26",
    },
  }
  const relative = "Knowledge/Action Model.md",
    before = noteText(meta, "## 한 문장 정의\n\n기존 정의.\n")
  atomicWrite(vault, relative, before)
  const decision = {
    schema: "knowledge-note-review/v1",
    reviewer: "Synthetic reviewer",
    reviewed_at: "2026-09-27",
    reason: "Synthetic correction",
    source_read: true,
    final_prose_read: true,
    aliases_checked: true,
    connections_checked: true,
    histories_checked: true,
    notes: [
      {
        path: relative,
        previous_sha256: sha256(before),
        content: noteText(
          {
            ...meta,
            last_reviewed: "2026-09-27",
            map_review: { ...meta.map_review, reviewed: "2026-09-27" },
          },
          "## 한 문장 정의\n\n관측과 행동을 함께 학습하는 모델.\n",
        ),
        evidence: [{ run_id: "source", claim_ids: [claim.claim_id] }],
      },
    ],
  }
  return { root, vault, doc, parse, meta, relative, before, decision }
}

function creation(f) {
  const meta = {
    ...f.meta,
    title: "Observation Action Prediction",
    concept_id: "observation-action-prediction",
    label: "관측 행동 예측",
    aliases: ["OAP"],
    keywords: ["관측 행동 예측"],
    parent_concepts: [],
    related_concepts: [],
    tags: [],
    status: "evergreen",
    domain: "AI Systems",
    group: "AI",
    created: "2026-09-27",
    updated: "2026-09-27",
    last_reviewed: "2026-09-27",
    map_review: {
      ...f.meta.map_review,
      reason: "관측과 행동을 함께 학습하는 전문 모델 원리",
      reviewed: "2026-09-27",
    },
  }
  const body =
    [
      "한 문장 정의",
      "용어 카드",
      "범위",
      "왜 중요한가",
      "핵심 구성 요소",
      "작동 원리",
      "실제 예시",
      "한계와 실패 조건",
      "혼동하기 쉬운 개념",
      "관련 개념",
      "최근 변화",
      "출처",
    ]
      .map(
        (heading, i) =>
          `## ${heading}\n\n${i === 0 ? "관측과 행동을 함께 학습하는 모델이다." : heading === "범위" ? "**포함:** 관측과 행동의 공동 학습.\n\n**포함하지 않음:** 기업이나 제품 소개." : heading === "출처" ? `[원문](${f.doc.original_url})` : "없음"}`,
      )
      .join("\n\n") + "\n"
  const note = {
    ...f.decision.notes[0],
    operation: "create",
    path: "Knowledge/Observation Action Prediction.md",
    previous_sha256: null,
    content: noteText(meta, `# ${meta.title}\n\n${body}`),
  }
  return { ...f.decision, schema: "knowledge-note-review/v2", notes: [note] }
}

test("v2 creates a source-bound private approval without an artificial authority note and keeps v1 bytes", async (t) => {
  const f = fixture(t),
    decision = creation(f),
    options = { vault: f.vault }
  const prior = evaluateNoteReview(f.root, f.decision, options)
  await approveNoteReview(f.root, "creation", decision, options)
  const loaded = loadNoteApproval(f.root, "creation", options).approval
  assert.equal(loaded.schema, "approved-knowledge-notes/v2")
  assert.equal(loaded.notes[0].operation, "create")
  assert.equal(loaded.notes[0].previous_sha256, null)
  assert.equal(loaded.notes[0].before_content, null)
  assert.equal(fs.existsSync(path.join(f.vault, decision.notes[0].path)), false)
  assert.deepEqual(evaluateNoteReview(f.root, f.decision, options), prior)
  assert.equal(prior.schema, "approved-knowledge-notes/v1")
  assert.equal(Object.hasOwn(prior.notes[0], "operation"), false)
  const bytes = fs.readFileSync(path.join(f.root, "runs/creation/approved-notes.json"))
  await approveNoteReview(f.root, "creation", decision, options)
  assert.deepEqual(fs.readFileSync(path.join(f.root, "runs/creation/approved-notes.json")), bytes)
})

test("v2 creates a new Signals review only for the exact source-backed event", (t) => {
  const f = fixture(t)
  const edition = "Editions/2026/09/2026-09-27_0800_Tech_AI_Briefing"
  const decision = {
    ...f.decision,
    schema: "knowledge-note-review/v2",
    notes: [
      {
        operation: "create",
        path: "Signals/2026-09-27_0800_Tech_AI_Briefing.md",
        previous_sha256: null,
        content: noteText(
          {
            schema_version: "tech-signals/v1",
            type: "trend-observations",
            edition,
            date: "2026-09-27",
            reviewed: "2026-09-27",
            review_basis: "primary-research",
            observations: [
              {
                id: "20260927-action-model",
                topic_id: "agent-runtime",
                event_id: sha256(f.doc.original_url).slice(0, 16),
                event_date: "2026-09-25",
                stance: "context",
                change: "관측과 행동을 함께 학습하는 모델을 발표했다.",
                meaning: "행동 모델 연구의 새 사례다.",
                limit: "원문은 연구 결과만 설명한다.",
                next_check: "후속 실험을 확인한다.",
              },
            ],
          },
          `# 2026-09-27 관측 기록\n\n[[${edition}|수록 원고]]\n`,
        ),
        evidence: [{ run_id: "source", claim_ids: ["fact-1"] }],
      },
    ],
  }
  const reviewed = evaluateNoteReview(f.root, decision, { vault: f.vault })
  assert.equal(reviewed.notes[0].operation, "create")
  assert.equal(fs.existsSync(path.join(f.vault, decision.notes[0].path)), false)
  const changed = structuredClone(decision)
  const note = parseNote(changed.notes[0].content)
  note.meta.observations[0].event_id = "0000000000000000"
  changed.notes[0].content = noteText(note.meta, note.body)
  assert.throws(() => evaluateNoteReview(f.root, changed, { vault: f.vault }), /source event/)
})

test("a source-reviewed Signals creation may explicitly contain no trend observations", async (t) => {
  const f = fixture(t),
    edition = "Editions/2026/09/2026-09-27_0800_Tech_AI_Briefing",
    decision = {
      ...f.decision,
      schema: "knowledge-note-review/v2",
      notes: [
        {
          operation: "create",
          path: "Signals/2026-09-27_0800_Tech_AI_Briefing.md",
          previous_sha256: null,
          content: noteText(
            {
              schema_version: "tech-signals/v1",
              type: "trend-observations",
              edition,
              date: "2026-09-27",
              reviewed: "2026-09-27",
              review_basis: "primary-research",
              observations: [],
            },
            `# 2026-09-27 관측 기록\n\n[[${edition}|수록 원고]]\n`,
          ),
          evidence: [{ run_id: "source", claim_ids: ["fact-1"] }],
        },
      ],
    },
    options = { vault: f.vault }
  await approveNoteReview(f.root, "empty-signal", decision, options)
  const approval = loadNoteApproval(f.root, "empty-signal", options).approval
  assert.deepEqual(parseNote(approval.notes[0].content).meta.observations, [])
  assert.equal(approval.candidate_published, false)
  assert.equal(fs.existsSync(path.join(f.vault, decision.notes[0].path)), false)
  const bytes = fs.readFileSync(path.join(f.root, "runs/empty-signal/approved-notes.json"))
  await approveNoteReview(f.root, "empty-signal", decision, options)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/empty-signal/approved-notes.json")),
    bytes,
  )
  for (const change of [
    (d) => {
      d.source_read = false
    },
    (d) => {
      d.notes[0].evidence = []
    },
    (d) => {
      d.notes[0].evidence[0].claim_ids = ["unreviewed"]
    },
    (d) => {
      const n = parseNote(d.notes[0].content)
      delete n.meta.observations
      d.notes[0].content = noteText(n.meta, n.body)
    },
  ]) {
    const invalid = structuredClone(decision)
    change(invalid)
    assert.throws(() => evaluateNoteReview(f.root, invalid, options))
  }
})

test("Signals creation preserves valid historical edition clocks and rejects mismatched identities", (t) => {
  const f = fixture(t)
  const make = (clock) => {
    const key = `2026-09-27_${clock}_Tech_AI_Briefing`
    const edition = `Editions/2026/09/${key}`
    return {
      ...f.decision,
      schema: "knowledge-note-review/v2",
      notes: [
        {
          operation: "create",
          path: `Signals/${key}.md`,
          previous_sha256: null,
          content: noteText(
            {
              schema_version: "tech-signals/v1",
              type: "trend-observations",
              edition,
              date: "2026-09-27",
              reviewed: "2026-09-27",
              review_basis: "primary-research",
              observations: [],
            },
            `[[${edition}|수록 원고]]\n`,
          ),
          evidence: [{ run_id: "source", claim_ids: ["fact-1"] }],
        },
      ],
    }
  }
  for (const clock of ["0800", "0801", "0000", "2359"])
    assert.equal(
      evaluateNoteReview(f.root, make(clock), { vault: f.vault }).notes[0].path,
      `Signals/2026-09-27_${clock}_Tech_AI_Briefing.md`,
    )
  for (const clock of ["2400", "0860", "801"])
    assert.throws(
      () => evaluateNoteReview(f.root, make(clock), { vault: f.vault }),
      /Observation edition/,
    )
  const mismatched = make("0801")
  mismatched.notes[0].path = "Signals/2026-09-27_0800_Tech_AI_Briefing.md"
  assert.throws(
    () => evaluateNoteReview(f.root, mismatched, { vault: f.vault }),
    /Observation edition/,
  )
})

test("creation rejects existing and subsequently created destinations, including identical bytes", async (t) => {
  const f = fixture(t),
    decision = creation(f),
    options = { vault: f.vault }
  await approveNoteReview(f.root, "creation", decision, options)
  atomicWrite(f.vault, decision.notes[0].path, decision.notes[0].content)
  assert.throws(() => loadNoteApproval(f.root, "creation", options), /already exists/)
  assert.throws(() => evaluateNoteReview(f.root, decision, options), /already exists/)
  assert.equal(
    fs.readFileSync(path.join(f.vault, decision.notes[0].path), "utf8"),
    decision.notes[0].content,
  )
})

test("creation requires explicit operation and null, specialist identity, dates and complete sections", (t) => {
  const f = fixture(t),
    original = creation(f)
  for (const change of [
    (d) => {
      delete d.notes[0].operation
    },
    (d) => {
      d.notes[0].operation = "merge"
    },
    (d) => {
      delete d.notes[0].previous_sha256
    },
    (d) => {
      d.notes[0].previous_sha256 = sha256("invented before")
    },
    (d) => {
      d.notes[0].path = "Signals/New.md"
    },
    (d) => {
      d.notes[0].path = "Knowledge//Term.md"
    },
    (d) => {
      d.notes[0].path = "Knowledge/Term\u0000.md"
    },
    (d) => {
      d.notes[0].path = "Knowledge/Term#fragment.md"
    },
    (d) => {
      d.notes[0].path = "Knowledge/Term|label.md"
    },
    (d) => {
      const n = parseNote(d.notes[0].content)
      d.notes[0].content = noteText({ ...n.meta, private_notes: "must stay private" }, n.body)
    },
    (d) => {
      const n = parseNote(d.notes[0].content)
      d.notes[0].content = noteText({ ...n.meta, concept_id: "bad ID" }, n.body)
    },
    (d) => {
      const n = parseNote(d.notes[0].content)
      d.notes[0].content = noteText({ ...n.meta, created: "2026-08-27" }, n.body)
    },
    (d) => {
      const n = parseNote(d.notes[0].content)
      d.notes[0].content = noteText({ ...n.meta, keywords: [] }, n.body)
    },
    (d) => {
      const n = parseNote(d.notes[0].content)
      d.notes[0].content = noteText(
        { ...n.meta, map_review: { ...n.meta.map_review, kind: "company" } },
        n.body,
      )
    },
    (d) => {
      d.notes[0].content = d.notes[0].content.replace("## 작동 원리", "## 누락")
    },
    (d) => {
      d.notes[0].content = d.notes[0].content.replace(
        "# Observation Action Prediction",
        "# Incorrect title",
      )
    },
    (d) => {
      d.notes[0].content = d.notes[0].content.replace(
        "https://example.org/research)",
        "https://example.org/research-other)",
      )
    },
    (d) => {
      const n = parseNote(d.notes[0].content)
      d.notes[0].content = noteText(
        { ...n.meta, connections: [{ target: "unknown-concept", reason: "확인되지 않은 관계" }] },
        n.body,
      )
    },
  ]) {
    const d = structuredClone(original)
    change(d)
    assert.throws(() => evaluateNoteReview(f.root, d, { vault: f.vault }))
  }
})

test("new notes participate in existing and same-batch identity, filename and alias collision checks", (t) => {
  const f = fixture(t),
    decision = creation(f),
    evaluate = (d) => evaluateNoteReview(f.root, d, { vault: f.vault })
  for (const metadata of [
    { concept_id: "action-model" },
    { aliases: ["AM"] },
    { aliases: ["Action Model"] },
  ]) {
    const d = structuredClone(decision),
      n = parseNote(d.notes[0].content)
    d.notes[0].content = noteText({ ...n.meta, ...metadata }, n.body)
    assert.throws(() => evaluate(d), /conflicts/)
  }
  const d = structuredClone(decision),
    n = parseNote(d.notes[0].content)
  d.notes.push({
    ...d.notes[0],
    path: "Knowledge/Second.md",
    content: noteText(
      { ...n.meta, title: "Second", label: "두 번째", concept_id: "second" },
      n.body.replace(`# ${n.meta.title}`, "# Second"),
    ),
  })
  assert.throws(() => evaluate(d), /conflicts/)
  d.notes[1].content = noteText(
    {
      ...n.meta,
      title: "Second",
      label: "두 번째",
      concept_id: "second",
      aliases: ["Second Prediction"],
    },
    n.body.replace(`# ${n.meta.title}`, "# Second"),
  )
  assert.equal(evaluate(d).notes.length, 2)
})

test("v2 can combine creation and replacement without changing the prior concept identity", (t) => {
  const f = fixture(t),
    d = creation(f)
  d.notes.push({ ...f.decision.notes[0], operation: "replace" })
  const approved = evaluateNoteReview(f.root, d, { vault: f.vault })
  assert.deepEqual(
    approved.notes.map((n) => n.operation),
    ["create", "replace"],
  )
  assert.equal(approved.notes[1].before_content, f.before)
  const changed = parseNote(d.notes[1].content)
  d.notes[1].content = noteText({ ...changed.meta, concept_id: "renamed" }, changed.body)
  assert.throws(() => evaluateNoteReview(f.root, d, { vault: f.vault }), /identity/)
})

test("creation never follows dangling destination or parent symlinks", (t) => {
  const f = fixture(t),
    d = creation(f),
    target = path.join(f.vault, d.notes[0].path)
  fs.symlinkSync(path.join(f.root, "missing"), target)
  assert.throws(() => evaluateNoteReview(f.root, d, { vault: f.vault }), /Symlink/)
  const parent = path.join(f.vault, "Knowledge", "Linked")
  fs.symlinkSync(path.join(f.root, "missing-parent"), parent)
  d.notes[0].path = "Knowledge/Linked/Term.md"
  assert.throws(() => evaluateNoteReview(f.root, d, { vault: f.vault }), /Symlink/)
})

test("canonical note approval preserves source authoring bytes and reuses only unchanged evidence", async (t) => {
  const f = fixture(t),
    options = { vault: f.vault }
  const result = await approveNoteReview(f.root, "notes", f.decision, options)
  assert.equal(result.notes, 1)
  assert.equal(result.candidate_published, false)
  assert.equal(fs.readFileSync(path.join(f.vault, f.relative), "utf8"), f.before)
  const approved = loadNoteApproval(f.root, "notes", options)
  assert.equal(approved.approval.notes[0].before_content, f.before)
  const bytes = fs.readFileSync(path.join(f.root, "runs/notes/approved-notes.json"))
  await approveNoteReview(f.root, "notes", f.decision, options)
  assert.deepEqual(fs.readFileSync(path.join(f.root, "runs/notes/approved-notes.json")), bytes)
  const altered = readJSON(f.root, "runs/notes/approved-notes.json")
  altered.notes[0].content = "Different unreviewed text"
  atomicWrite(f.root, "runs/notes/approved-notes.json", altered)
  assert.throws(
    () => loadNoteApproval(f.root, "notes", options),
    /Saved knowledge approval differs/,
  )
})

test("exact applied replacements stay readable without authorizing another write", async (t) => {
  const f = fixture(t),
    options = { vault: f.vault }
  await approveNoteReview(f.root, "notes", f.decision, options)
  const pending = loadReferencedNoteApproval(f.root, "notes", options)
  assert.deepEqual(pending, loadNoteApproval(f.root, "notes", options))
  assert.throws(() => loadAppliedNoteApproval(f.root, "notes", options), /not fully applied/)
  atomicWrite(f.vault, f.relative, f.decision.notes[0].content)
  const before = [
    path.join(f.vault, f.relative),
    path.join(f.root, "runs/notes/note-review.json"),
    path.join(f.root, "runs/notes/approved-notes.json"),
    path.join(f.root, f.doc.body_path),
  ].map((file) => [file, fs.readFileSync(file)])
  assert.deepEqual(loadAppliedNoteApproval(f.root, "notes", options), pending)
  assert.deepEqual(loadReferencedNoteApproval(f.root, "notes", options), pending)
  assert.throws(() => loadNoteApproval(f.root, "notes", options), /Canonical note changed/)
  await assert.rejects(
    approveNoteReview(f.root, "new-write", f.decision, options),
    /Canonical note changed/,
  )
  for (const [file, bytes] of before) assert.deepEqual(fs.readFileSync(file), bytes)
  assert.equal(pending.approval.candidate_published, false)
  assert.equal(pending.approval.drive_verified, false)
})

test("exact applied creations are readable while creation absence remains mandatory for approval", async (t) => {
  const f = fixture(t),
    decision = creation(f),
    options = { vault: f.vault }
  await approveNoteReview(f.root, "created", decision, options)
  const pending = loadReferencedNoteApproval(f.root, "created", options)
  atomicWrite(f.vault, decision.notes[0].path, decision.notes[0].content)
  assert.deepEqual(loadAppliedNoteApproval(f.root, "created", options), pending)
  assert.deepEqual(loadReferencedNoteApproval(f.root, "created", options), pending)
  assert.throws(() => loadNoteApproval(f.root, "created", options), /already exists/)
  await assert.rejects(approveNoteReview(f.root, "new-write", decision, options), /already exists/)
})

test("applied reads reject partial batches, drift and symlinks without changing saved receipts", async (t) => {
  const f = fixture(t),
    decision = creation(f),
    options = { vault: f.vault }
  decision.notes.push({ ...f.decision.notes[0], operation: "replace" })
  await approveNoteReview(f.root, "mixed", decision, options)
  const pending = loadReferencedNoteApproval(f.root, "mixed", options)
  atomicWrite(f.vault, decision.notes[0].path, decision.notes[0].content)
  assert.throws(() => loadAppliedNoteApproval(f.root, "mixed", options), /not fully applied/)
  assert.throws(() => loadReferencedNoteApproval(f.root, "mixed", options), /already exists/)
  atomicWrite(f.vault, f.relative, f.decision.notes[0].content)
  assert.deepEqual(loadReferencedNoteApproval(f.root, "mixed", options), pending)
  atomicWrite(f.vault, f.relative, f.decision.notes[0].content + "Unreviewed change")
  assert.throws(() => loadAppliedNoteApproval(f.root, "mixed", options), /not fully applied/)
  assert.throws(() => loadReferencedNoteApproval(f.root, "mixed", options))
  fs.unlinkSync(path.join(f.vault, f.relative))
  fs.symlinkSync(path.join(f.root, f.doc.body_path), path.join(f.vault, f.relative))
  assert.throws(() => loadAppliedNoteApproval(f.root, "mixed", options), /Symlink/)
  assert.throws(() => loadReferencedNoteApproval(f.root, "mixed", options), /Symlink/)
  assert.deepEqual(readJSON(f.root, "runs/mixed/approved-notes.json"), pending.approval)
})

test("applied approval rechecks preserved bytes, evidence, identities and the complete receipt", async (t) => {
  for (const corrupt of [
    (f, stored) => {
      stored.notes[0].before_content += "Changed before bytes"
    },
    (f, stored) => {
      stored.notes[0].content += "Changed approved bytes"
    },
    (f, stored) => {
      stored.notes[0].sha256 = "0".repeat(64)
    },
    (f, stored) => {
      stored.notes[0].previous_sha256 = "0".repeat(64)
    },
    (f, stored) => {
      stored.notes.push(stored.notes[0])
    },
    (f, stored) => {
      stored.source_files[0].files["documents.json"] = "0".repeat(64)
    },
    (f, stored) => {
      stored.candidate_published = true
    },
    (f) => {
      atomicWrite(f.root, f.doc.body_path, "Changed source body")
    },
    (f) => {
      atomicWrite(
        f.vault,
        "Knowledge/Other.md",
        noteText(
          { ...f.meta, concept_id: "other", title: "Other", label: "다른 개념" },
          "Other definition",
        ),
      )
    },
  ]) {
    const f = fixture(t),
      options = { vault: f.vault }
    await approveNoteReview(f.root, "notes", f.decision, options)
    atomicWrite(f.vault, f.relative, f.decision.notes[0].content)
    const stored = readJSON(f.root, "runs/notes/approved-notes.json")
    corrupt(f, stored)
    atomicWrite(f.root, "runs/notes/approved-notes.json", stored)
    assert.throws(() => loadAppliedNoteApproval(f.root, "notes", options))
    assert.throws(() => loadReferencedNoteApproval(f.root, "notes", options))
  }
})

test("note review rejects stale canonical input, false review, foreign facts, aliases and source URLs", (t) => {
  const f = fixture(t),
    evaluate = (d) => evaluateNoteReview(f.root, d, { vault: f.vault })
  for (const mutate of [
    (d) => {
      d.source_read = "true"
    },
    (d) => {
      d.notes[0].previous_sha256 = sha256("changed")
    },
    (d) => {
      d.notes[0].path = "Knowledge/../private.md"
    },
    (d) => {
      d.notes[0].evidence[0].claim_ids = ["foreign"]
    },
    (d) => {
      d.notes[0].content = noteText(
        { ...f.meta, concept_id: "other", last_reviewed: "2026-09-27" },
        "Text",
      )
    },
    (d) => {
      d.notes[0].content = noteText(
        { ...f.meta, aliases: ["AM", "am"], last_reviewed: "2026-09-27" },
        "Text",
      )
    },
    (d) => {
      d.notes[0].content = noteText(
        { ...f.meta, verified_sources: ["https://other.org"], last_reviewed: "2026-09-27" },
        "Text",
      )
    },
  ]) {
    const d = structuredClone(f.decision)
    mutate(d)
    assert.throws(() => evaluate(d))
  }
  atomicWrite(f.root, f.doc.body_path, "corrupted source")
  assert.throws(() => evaluate(f.decision), /body hash mismatch/)
})

test("replacement note approvals validate typed relations, evidence and canonical targets before preview", (t) => {
  const f = fixture(t)
  atomicWrite(
    f.vault,
    "Knowledge/Other Model.md",
    noteText(
      {
        ...f.meta,
        title: "Other Model",
        concept_id: "other-model",
        label: "다른 모델",
        aliases: ["OM"],
      },
      "## 한 문장 정의\n\n다른 모델.\n",
    ),
  )
  const n = parseNote(f.decision.notes[0].content)
  const relation = {
    target: "other-model",
    type: "uses",
    reason: "직접 확인한 구성 관계",
    basis: "source",
    evidence: [f.doc.original_url],
  }
  const decision = structuredClone(f.decision)
  decision.notes[0].content = noteText({ ...n.meta, relations: [relation] }, n.body)
  assert.equal(evaluateNoteReview(f.root, decision, { vault: f.vault }).notes.length, 1)
  for (const mutate of [
    (r) => (r.basis = "explicit"),
    (r) => (r.type = "invented"),
    (r) => (r.target = "unknown-concept"),
    (r) => (r.target = n.meta.concept_id),
    (r) => (r.evidence = []),
    (r) => (r.evidence = ["https://example.org/uncited"]),
    (r) => (r.reason = " "),
    (r) => (r.extra = true),
  ]) {
    const changed = structuredClone(relation)
    mutate(changed)
    const d = structuredClone(decision)
    d.notes[0].content = noteText({ ...n.meta, relations: [changed] }, n.body)
    assert.throws(() => evaluateNoteReview(f.root, d, { vault: f.vault }), /concept connection/)
  }
  const duplicate = structuredClone(decision)
  duplicate.notes[0].content = noteText({ ...n.meta, relations: [relation, relation] }, n.body)
  assert.throws(
    () => evaluateNoteReview(f.root, duplicate, { vault: f.vault }),
    /concept connection/,
  )
})

test("current canonical note and review day cannot change behind a saved approval", async (t) => {
  const f = fixture(t)
  await approveNoteReview(f.root, "notes", f.decision, { vault: f.vault })
  atomicWrite(f.vault, f.relative, f.before + "User edit")
  assert.throws(
    () => loadNoteApproval(f.root, "notes", { vault: f.vault }),
    /Canonical note changed/,
  )
  atomicWrite(f.vault, f.relative, f.before)
  const changed = structuredClone(f.decision)
  changed.reviewed_at = "2026-09-25"
  assert.throws(() => evaluateNoteReview(f.root, changed, { vault: f.vault }), /precedes/)
})

test("note approval rejects cross-note aliases and stale specialist-map review", (t) => {
  const f = fixture(t)
  const other = {
    ...f.meta,
    title: "Other action model",
    concept_id: "other-model",
    label: "다른 모델",
    aliases: ["am"],
  }
  atomicWrite(f.vault, "Knowledge/Other Model.md", noteText(other, "Other definition"))
  assert.throws(() => evaluateNoteReview(f.root, f.decision, { vault: f.vault }), /conflicts/)
  atomicWrite(
    f.vault,
    "Knowledge/Other Model.md",
    noteText({ ...other, aliases: ["OM"] }, "Other definition"),
  )
  assert.equal(evaluateNoteReview(f.root, f.decision, { vault: f.vault }).notes.length, 1)
  const filenameAlias = structuredClone(f.decision)
  const note = parseNote(filenameAlias.notes[0].content)
  filenameAlias.notes[0].content = noteText({ ...note.meta, aliases: ["Other Model"] }, note.body)
  assert.throws(() => evaluateNoteReview(f.root, filenameAlias, { vault: f.vault }), /conflicts/)
  const stale = structuredClone(f.decision)
  stale.notes[0].content = noteText(
    { ...f.meta, last_reviewed: "2026-09-27" },
    "Source-reviewed definition",
  )
  assert.throws(() => evaluateNoteReview(f.root, stale, { vault: f.vault }), /reviewed sources/)
})

test("note review CLI does not call models or mutate the authority and rejects preview-only options", async (t) => {
  const f = fixture(t),
    oldFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw Error("No external call permitted")
  }
  t.after(() => {
    globalThis.fetch = oldFetch
  })
  atomicWrite(f.root, "decision.json", f.decision)
  const args = [
    "note-review",
    "--root",
    f.root,
    "--run",
    "notes",
    "--vault",
    f.vault,
    "--review",
    path.join(f.root, "decision.json"),
  ]
  assert.equal((await main(args)).notes, 1)
  assert.equal(fs.readFileSync(path.join(f.vault, f.relative), "utf8"), f.before)
  await assert.rejects(main([...args, "--knowledge-run", "foreign"]), /only supported for preview/)
})

test("timestamp review keeps the KST review day rather than the UTC calendar date", (t) => {
  const f = fixture(t)
  const decision = structuredClone(f.decision)
  decision.reviewed_at = "2026-09-26T15:30:00Z"
  assert.equal(evaluateNoteReview(f.root, decision, { vault: f.vault }).notes.length, 1)
})
