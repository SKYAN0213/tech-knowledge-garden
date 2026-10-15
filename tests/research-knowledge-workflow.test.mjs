import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { knowledgeFixture, addKnowledgeArticle } from "./fixtures/research-knowledge-fixtures.mjs"
import { noteText, parseNote } from "../scripts/garden.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { atomicCreate, atomicWrite } from "../scripts/research/run-state.mjs"
import { approveNoteReview } from "../scripts/research/note-review.mjs"
import {
  approveKnowledgeConnections,
  loadKnowledgeConnectionApproval,
  loadHistoricalKnowledgeConnectionApproval,
} from "../scripts/research/ontology-knowledge.mjs"
import {
  projectEvidenceOntology,
  extendEvidenceOntology,
  loadApprovedOntologyInput,
} from "../scripts/research/ontology.mjs"
import {
  syncKnowledgeWorkflow,
  readKnowledgeWorkflow,
} from "../scripts/research/knowledge-workflow.mjs"
import { executeModule } from "../scripts/research/module-registry.mjs"
import { moduleContext, submitModuleJob } from "../scripts/research/module-runtime.mjs"

function writeBasis(f, graph = f.graph) {
  const file = `graphs/${graph.sha256}.json`
  if (!fs.existsSync(path.join(f.root, file))) atomicCreate(f.root, file, graph)
  atomicWrite(f.root, "basis.json", {
    schema: "research-event-workflow/v1",
    ontology: { path: file, sha256: sha256(fs.readFileSync(path.join(f.root, file))) },
  })
}
async function setup(t, options) {
  const f = await knowledgeFixture(t, options)
  f.workflowId = "continuous-knowledge"
  writeBasis(f)
  f.sync = (extra = {}) =>
    syncKnowledgeWorkflow({
      root: f.root,
      vault: f.vault,
      workflowId: f.workflowId,
      maxItems: 256,
      ...extra,
    })
  return f
}
function storedIndex(f, state) {
  assert(state.index, state.projection_error)
  const bytes = fs.readFileSync(path.join(f.root, state.index.path))
  assert.equal(sha256(bytes), state.index.sha256)
  return JSON.parse(bytes)
}
async function nativeNote(
  f,
  relative,
  content,
  run,
  {
    create = false,
    claim = "selected",
    evidence = [{ run_id: "source", claim_ids: [claim] }],
  } = {},
) {
  const before = create ? null : sha256(fs.readFileSync(path.join(f.vault, relative)))
  const decision = {
    schema: "knowledge-note-review/v2",
    reviewer: "Fixture native review",
    reviewed_at: "2026-09-28",
    reason: "Read and checked the source-backed fixture note",
    source_read: true,
    final_prose_read: true,
    aliases_checked: true,
    connections_checked: true,
    histories_checked: true,
    notes: [
      {
        path: relative,
        operation: create ? "create" : "replace",
        previous_sha256: before,
        content,
        evidence,
      },
    ],
  }
  await approveNoteReview(f.root, run, decision, { vault: f.vault })
  atomicWrite(f.vault, relative, content)
  return { run, path: relative, sha256: sha256(content) }
}

async function singleSignal(f) {
  const article = loadApprovedOntologyInput(f.root, "source", { vault: f.vault }).article
  atomicWrite(
    f.vault,
    "Editions/one.md",
    noteText(
      {
        title: "one",
        type: "briefing",
        scheduled_at: "2026-09-25T08:00:00+09:00",
        article_reviews: [{ event_id: article.event_id }],
      },
      "Fixture edition.",
    ),
  )
  const path = "Signals/one.md",
    meta = {
      schema_version: "tech-signals/v1",
      type: "trend-observations",
      edition: "Editions/one",
      date: "2026-09-25",
      reviewed: "2026-09-27",
      review_basis: "primary-research",
      observations: [],
    }
  atomicWrite(f.vault, path, noteText(meta, "Reviewed fixture ledger."))
  await nativeNote(
    f,
    path,
    noteText({ ...meta, reviewed: "2026-09-28" }, "Reviewed fixture ledger."),
    "signal",
    { claim: "unassigned" },
  )
}

function sameSourceRevision(f) {
  const before = loadApprovedOntologyInput(f.root, "source", { vault: f.vault }),
    after = addKnowledgeArticle(f, { run: "replacement", url: f.doc.original_url })
  const reviewPath = "runs/revision/review.json",
    candidateHash = sha256("fixture existing event"),
    review = {
      schema: "research-existing-editorial-approval-review/v1",
      candidate_key: "fixture-event",
      event_id: before.article.event_id,
      prior_approved_run: before.run,
      approved_run: after.run,
      expected_candidate_sha256: candidateHash,
      prior_article_sha256: sha256(JSON.stringify(before.article)),
      article_sha256: sha256(JSON.stringify(after.article)),
      reviewer: "Fixture reviewer",
      reviewed_at: "2026-09-29",
      reason: "Read unchanged original source and both article versions",
      decision: "attach_reverified_approval",
      source_read: true,
      prior_article_read: true,
      article_read: true,
      identity_checked: true,
      dates_checked: true,
      numbers_checked: true,
      new_article: false,
      candidate_published: false,
    }
  atomicWrite(f.root, reviewPath, review)
  atomicWrite(f.root, "runs/revision/candidate-approval.json", {
    schema: "research-candidate-approval/v1",
    candidate_key: review.candidate_key,
    event_id: review.event_id,
    approved_run: after.run,
    article_sha256: review.article_sha256,
    candidate_published: false,
    existing_editorial_approval: {
      prior_approved_run: before.run,
      prior_article_sha256: review.prior_article_sha256,
      prior_artifacts_sha256: before.file_hashes,
      review_path: reviewPath,
      review_sha256: sha256(fs.readFileSync(path.join(f.root, reviewPath))),
      candidate_before_sha256: candidateHash,
      reviewer: review.reviewer,
      reviewed_at: review.reviewed_at,
    },
  })
  return extendEvidenceOntology(f.root, f.graph, [after.run], { vault: f.vault })
}

function legacyWorkflowState(f, original) {
  const input = JSON.parse(fs.readFileSync(path.join(f.root, original.input.path)))
  input.implementation["knowledge-workflow.mjs"] = sha256("fixture v1 workflow implementation")
  const hashes = new Map(),
    byPath = new Map()
  for (const task of input.tasks) {
    const { key, dependencies } = structuredClone(input.task_dependencies[task.id])
    for (const ref of dependencies?.articles || []) ref.input = null
    for (const ref of dependencies?.related_notes || [])
      ref.task_sha256 = byPath.get(ref.path) || null
    const digest = sha256(
      JSON.stringify({
        key,
        canonical_sha256: task.note_sha256,
        dependencies,
        implementation: input.implementation,
      }),
    )
    task.task_sha256 = digest
    hashes.set(task.id, digest)
    if (["definition", "signal"].includes(task.kind)) byPath.set(task.path, digest)
  }
  delete input.task_dependency_schema
  delete input.task_dependencies
  const inputHash = sha256(JSON.stringify(input)),
    cycle = `runs/${f.workflowId}/knowledge-linking/cycles/${inputHash}/`,
    inputRef = atomicCreate(f.root, cycle + "input.json", input)
  const state = {
    ...original,
    input_sha256: inputHash,
    input: inputRef,
    sequence: 1,
    previous: null,
    tasks: original.tasks.map((task) => ({ ...task, task_sha256: hashes.get(task.id) })),
  }
  delete state.migrated_items
  delete state.checkpoint
  delete state.reused
  delete state.processed_items
  const checkpoint = atomicCreate(f.root, cycle + "checkpoint-1.json", state)
  atomicWrite(f.root, `runs/${f.workflowId}/knowledge-linking/latest.json`, {
    schema: "research-knowledge-linking-pointer/v1",
    workflow_id: f.workflowId,
    checkpoint,
  })
  return { ...state, checkpoint }
}

test("legacy task dependencies upgrade against exact unchanged graph without repeating ready work", async (t) => {
  const f = await setup(t)
  await singleSignal(f)
  await approveKnowledgeConnections(f.root, "connection", f.decision, f.selections, {
    vault: f.vault,
  })
  const old = legacyWorkflowState(f, await f.sync({ basisFile: "basis.json" }))
  const upgraded = await f.sync()
  assert.equal(upgraded.counts.ready, 4)
  assert.equal(upgraded.migrated_items, 4)
  assert.equal(upgraded.processed_items, 0)
  assert.equal(upgraded.index.sha256, old.index.sha256)
  assert.equal(upgraded.previous.sha256, old.checkpoint.sha256)
  const next = await f.sync()
  assert.equal(next.reused, true)
  assert.equal(next.migrated_items, 0)
  const input = JSON.parse(fs.readFileSync(path.join(f.root, upgraded.input.path)))
  const signal = upgraded.tasks.find((row) => row.kind === "signal")
  assert.equal(input.task_dependencies[signal.id].dependencies.articles[0].input.run, "source")
  assert.match(
    input.task_dependencies[signal.id].dependencies.articles[0].input.files[
      "approved-article.json"
    ],
    /^[a-f0-9]{64}$/,
  )

  const changed = await setup(t)
  await singleSignal(changed)
  await approveKnowledgeConnections(
    changed.root,
    "connection",
    changed.decision,
    changed.selections,
    { vault: changed.vault },
  )
  legacyWorkflowState(changed, await changed.sync({ basisFile: "basis.json" }))
  atomicWrite(
    changed.vault,
    changed.notes[1].path,
    changed.notes[1].content + "\n검토하지 않은 변경.\n",
  )
  const audited = await changed.sync()
  assert.equal(audited.migrated_items, 2)
  assert.equal(audited.processed_items, 2)
  assert.equal(audited.tasks.find((row) => row.kind === "connection").status, "blocked")
  assert.equal(
    audited.tasks.find((row) => row.path === changed.notes[1].path && row.kind === "definition")
      .status,
    "review_pending",
  )
  assert.equal(audited.projection_error, null)

  const changedBasis = await setup(t)
  await singleSignal(changedBasis)
  const oldBasis = legacyWorkflowState(
    changedBasis,
    await changedBasis.sync({ basisFile: "basis.json" }),
  )
  writeBasis(changedBasis, sameSourceRevision(changedBasis))
  await assert.rejects(changedBasis.sync(), /migration requires its unchanged native basis/)
  assert.equal(
    readKnowledgeWorkflow(changedBasis.root, changedBasis.workflowId).checkpoint.sha256,
    oldBasis.checkpoint.sha256,
  )
})

test("native article revision invalidates signal provenance even when original source bytes are unchanged", async (t) => {
  const f = await setup(t)
  await singleSignal(f)
  await approveKnowledgeConnections(f.root, "connection", f.decision, f.selections, {
    vault: f.vault,
  })
  const first = await f.sync({ basisFile: "basis.json" })
  assert.equal(first.tasks.find((row) => row.kind === "signal").status, "ready")
  writeBasis(f, sameSourceRevision(f))
  const changed = await f.sync()
  const signal = changed.tasks.find((row) => row.kind === "signal")
  assert.equal(signal.status, "review_pending")
  assert.equal(signal.reason, "current_article_fact_rebinding_required")
  assert.equal(changed.processed_items, 1)
  assert.equal(changed.projection_error, null)
  assert.equal(
    changed.tasks.filter(
      (row) => ["definition", "connection"].includes(row.kind) && row.status === "ready",
    ).length,
    3,
  )
})

test("persistent workflow yields, resumes, discovers a new native review and reuses identical input", async (t) => {
  const f = await setup(t)
  const first = await f.sync({ basisFile: "basis.json", maxItems: 1 })
  assert.equal(first.status, "yielded")
  assert.equal(first.counts.pending, 2)
  assert.equal(first.index, null)
  const second = await f.sync()
  assert.equal(second.counts.ready, 2)
  assert.equal(second.counts.review_pending, 1)
  assert.equal(storedIndex(f, second).knowledge_connections.length, 0)
  assert.equal(second.previous.sha256, first.checkpoint.sha256)
  await approveKnowledgeConnections(f.root, "first-connection", f.decision, f.selections, {
    vault: f.vault,
  })
  const third = await f.sync()
  assert.equal(third.status, "complete", third.projection_error)
  assert.equal(third.processed_items, 1)
  assert.equal(third.counts.ready, 3)
  assert.equal(storedIndex(f, third).knowledge_connections.length, 1)
  assert.notEqual(third.input_sha256, second.input_sha256)
  const noOp = await f.sync()
  assert.equal(noOp.reused, true)
  assert.equal(noOp.processed_items, 0)
  assert.deepEqual(noOp.checkpoint, third.checkpoint)
  assert.equal(noOp.canonical_writes, 0)
  assert.equal(noOp.approvals_created, false)
  assert.equal(noOp.model_calls, 0)
})

test("new approved articles create a new cycle without inventing or repeating semantic connections", async (t) => {
  const f = await setup(t)
  await approveKnowledgeConnections(f.root, "connection", f.decision, f.selections, {
    vault: f.vault,
  })
  const original = await f.sync({ basisFile: "basis.json" })
  const additional = addKnowledgeArticle(f)
  writeBasis(
    f,
    projectEvidenceOntology([
      loadApprovedOntologyInput(f.root, "source", { vault: f.vault }),
      additional,
    ]),
  )
  const next = await f.sync()
  assert.equal(next.status, "complete", next.projection_error)
  assert.equal(next.processed_items, 0)
  assert.notEqual(next.input_sha256, original.input_sha256)
  assert.equal(next.previous.sha256, original.checkpoint.sha256)
  const index = storedIndex(f, next)
  assert.equal(index.events.length, 2)
  assert.equal(index.knowledge_connections.length, 1)
  assert.equal(index.concepts.length, 2)
  assert.equal(index.concepts[0].events.length, 0)
  assert(fs.existsSync(path.join(f.root, original.index.path)))
  assert.equal(next.source_requests, 0)
})

test("an unrelated definition change retains the independently reviewed connection and its historical native proof", async (t) => {
  const f = await setup(t)
  const existing = parseNote(f.notes[1].content)
  const thirdPath = "Knowledge/third-concept.md",
    content = noteText(
      {
        ...existing.meta,
        title: "third-concept",
        label: "third-concept",
        concept_id: "third-concept",
        last_reviewed: "2026-09-28",
        map_review: { ...existing.meta.map_review, reviewed: "2026-09-28" },
      },
      existing.body,
    )
  atomicWrite(f.vault, thirdPath, content)
  const third = await nativeNote(f, thirdPath, content, "third-definition")
  const selections = [...f.selections, third]
  const decision = { ...f.decision, reviewed_at: "2026-09-29" }
  await approveKnowledgeConnections(f.root, "connection-all-selections", decision, selections, {
    vault: f.vault,
  })
  await f.sync({ basisFile: "basis.json" })
  atomicWrite(f.vault, thirdPath, content + "\n새 검토를 기다리는 설명.\n")
  assert.throws(
    () => loadKnowledgeConnectionApproval(f.root, "connection-all-selections", { vault: f.vault }),
    /applied authority/,
  )
  assert.equal(
    loadHistoricalKnowledgeConnectionApproval(f.root, "connection-all-selections", {
      vault: f.vault,
    }).approval.connections.length,
    1,
  )
  const next = await f.sync()
  assert.equal(next.counts.review_pending, 1)
  assert.equal(next.tasks.find((r) => r.kind === "connection").status, "ready")
  assert.equal(storedIndex(f, next).knowledge_connections.length, 1)
  assert.equal(next.processed_items, 1)
})

test("changed endpoints await definition and connection review while old receipts and cycles remain intact", async (t) => {
  const f = await setup(t)
  await approveKnowledgeConnections(f.root, "original-connection", f.decision, f.selections, {
    vault: f.vault,
  })
  const initial = await f.sync({ basisFile: "basis.json" })
  const receiptFile = "runs/original-connection/approved-connections.json",
    receiptHash = sha256(fs.readFileSync(path.join(f.root, receiptFile)))
  const target = f.notes[1],
    changed = target.content + "\n추가 설명의 검토가 필요하다.\n"
  atomicWrite(f.vault, target.path, changed)
  const waiting = await f.sync()
  assert.equal(waiting.tasks.find((r) => r.kind === "connection").status, "blocked")
  assert.equal(storedIndex(f, waiting).knowledge_connections.length, 0)
  const parsed = parseNote(changed),
    approvedContent = noteText(
      {
        ...parsed.meta,
        last_reviewed: "2026-09-28",
        map_review: { ...parsed.meta.map_review, reviewed: "2026-09-28" },
      },
      parsed.body,
    )
  const selected = await nativeNote(f, target.path, approvedContent, "replacement-target")
  const reviewed = await f.sync()
  assert.equal(reviewed.tasks.find((r) => r.kind === "connection").status, "review_pending")
  await approveKnowledgeConnections(
    f.root,
    "replacement-connection",
    {
      ...f.decision,
      reviewed_at: "2026-09-29",
      connections: [{ ...f.decision.connections[0], target_sha256: selected.sha256 }],
    },
    [f.selections[0], selected],
    { vault: f.vault },
  )
  const complete = await f.sync()
  assert.equal(complete.status, "complete", complete.projection_error)
  assert.equal(
    storedIndex(f, complete).knowledge_connections[0].approval_run,
    "replacement-connection",
  )
  assert.equal(sha256(fs.readFileSync(path.join(f.root, receiptFile))), receiptHash)
  assert(fs.existsSync(path.join(f.root, initial.checkpoint.path)))
})

test("source version changes become explicit revalidation tasks rather than automatic new approvals", async (t) => {
  const f = await setup(t)
  const current = addKnowledgeArticle(f, {
    run: "changed-source",
    url: f.doc.original_url,
    text: "The mechanism now uses an updated planned deployment method.",
  })
  writeBasis(f, projectEvidenceOntology([current]))
  const state = await f.sync({ basisFile: "basis.json" })
  assert.equal(state.counts.review_pending, 2)
  assert.equal(state.counts.blocked, 1)
  for (const row of state.tasks.filter((r) => r.kind === "definition")) {
    assert.equal(row.reason, "source_version_revalidation_required")
    assert.equal(row.changed_sources[0].previous, f.doc.source_version_id)
    assert.notEqual(row.changed_sources[0].current[0], f.doc.source_version_id)
  }
  assert.equal(state.approvals_created, false)
  assert.equal(state.canonical_writes, 0)
})

test("native signal batches project only current approved note selections without hiding pending ledgers", async (t) => {
  const f = await setup(t)
  const event_id = loadApprovedOntologyInput(f.root, "source", { vault: f.vault }).article.event_id
  for (const name of ["one", "two"]) {
    atomicWrite(
      f.vault,
      `Editions/${name}.md`,
      noteText(
        {
          title: name,
          type: "briefing",
          schema_version: "tech-ai-magazine/v2",
          date: "2026-09-25",
          article_reviews: [{ event_id }],
        },
        "Fixture edition.",
      ),
    )
    atomicWrite(
      f.vault,
      `Signals/${name}.md`,
      noteText(
        {
          schema_version: "tech-signals/v1",
          type: "trend-observations",
          edition: `Editions/${name}`,
          date: "2026-09-25",
          reviewed: "2026-09-27",
          review_basis: "primary-research",
          observations: [],
        },
        "Reviewed fixture ledger.",
      ),
    )
  }
  const replacements = ["one", "two"].map((name) => {
    const relative = `Signals/${name}.md`,
      before = fs.readFileSync(path.join(f.vault, relative), "utf8")
    return {
      path: relative,
      operation: "replace",
      previous_sha256: sha256(before),
      content: before.replace("reviewed: 2026-09-27", "reviewed: 2026-09-28"),
      evidence: [{ run_id: "source", claim_ids: ["unassigned"] }],
    }
  })
  await approveNoteReview(
    f.root,
    "signal-batch",
    {
      schema: "knowledge-note-review/v2",
      reviewer: "Fixture reviewer",
      reviewed_at: "2026-09-28",
      reason: "Read the complete edition and reviewed empty ledgers",
      source_read: true,
      final_prose_read: true,
      aliases_checked: true,
      connections_checked: true,
      histories_checked: true,
      notes: replacements,
    },
    { vault: f.vault },
  )
  for (const row of replacements) atomicWrite(f.vault, row.path, row.content)
  atomicWrite(f.vault, replacements[1].path, replacements[1].content + "\n대기 중인 변경.\n")
  const result = await f.sync({ basisFile: "basis.json" })
  assert.equal(result.tasks.find((r) => r.path === replacements[0].path).status, "ready")
  assert.equal(result.tasks.find((r) => r.path === replacements[1].path).status, "review_pending")
  assert.equal(result.projection_error, null)
  assert.equal(storedIndex(f, result).linking_scope.current_native_signals, 1)
})

test("topic dependencies follow only explicit definitions and native signal history across cycles", async (t) => {
  const f = await setup(t)
  const firstArticle = loadApprovedOntologyInput(f.root, "source", { vault: f.vault }),
    secondArticle = addKnowledgeArticle(f, { publishedAt: "2026-09-26" })
  writeBasis(f, projectEvidenceOntology([firstArticle, secondArticle]))
  const evidence = [
    { run_id: "source", claim_ids: ["unassigned"] },
    { run_id: "additional", claim_ids: ["additional-fact"] },
  ]
  const editions = []
  for (const [i, article] of [firstArticle, secondArticle].entries()) {
    const date = article.article.article_review.published_at,
      edition = `Editions/2026/09/${date}_0800_Tech_AI_Briefing.md`,
      content = noteText(
        {
          title: date,
          type: "briefing",
          scheduled_at: `${date}T08:00:00+09:00`,
          article_reviews: [{ event_id: article.article.event_id }],
        },
        "Fixture edition.",
      )
    atomicWrite(f.vault, edition, content)
    editions.push({ path: edition, content })
    const signalPath = `Signals/report-${i}.md`,
      meta = {
        schema_version: "tech-signals/v1",
        type: "trend-observations",
        edition: edition.replace(/\.md$/, ""),
        date,
        reviewed: "2026-09-27",
        review_basis: "primary-research",
        observations: [
          {
            id: `report-${i}`,
            topic_id: "deployment",
            event_id: article.article.event_id,
            event_date: date,
            stance: "support",
            change: "공식 배포 계획을 확인했다.",
            meaning: "두 자료의 계획을 비교한다.",
            limit: "실행 성과는 확인하지 않았다.",
            next_check: "후속 발표를 확인한다.",
          },
        ],
      }
    atomicWrite(f.vault, signalPath, noteText(meta, "Reviewed fixture signal."))
    await nativeNote(
      f,
      signalPath,
      noteText({ ...meta, reviewed: "2026-09-28" }, "Reviewed fixture signal."),
      `signal-${i}`,
      { evidence: [evidence[i]] },
    )
  }
  const topicPath = "TrendTopics/deployment.md",
    topic = {
      schema_version: "tech-trend/v1",
      type: "trend-topic-source",
      id: "deployment",
      title: "배포 계획과 근거",
      question: "각 자료에서 확인한 계획은 무엇인가?",
      thesis: "검토된 두 자료에서 계획을 확인했다.",
      watch_for: "후속 실행 발표를 확인한다.",
      disconfirming: "성과는 확인하지 않았다.",
      reviewed: "2026-09-27",
      reader_format: "source-events/v1",
      knowledge_notes: ["Knowledge/source-concept"],
      lessons: [
        {
          id: "two-reports",
          claim: "두 독립 자료에 배포 계획이 있다.",
          limit: "계획을 실행 성과로 보지 않는다.",
          reviewed: "2026-09-27",
          signal_ids: ["report-0", "report-1"],
        },
      ],
    }
  atomicWrite(f.vault, topicPath, noteText(topic, "Reviewed fixture topic."))
  await nativeNote(
    f,
    topicPath,
    noteText(
      {
        ...topic,
        reviewed: "2026-09-28",
        lessons: topic.lessons.map((lesson) => ({ ...lesson, reviewed: "2026-09-28" })),
      },
      "Reviewed fixture topic.",
    ),
    "topic",
    { evidence },
  )
  const initial = legacyWorkflowState(f, await f.sync({ basisFile: "basis.json" }))
  const first = await f.sync(),
    originalTopic = first.tasks.find((row) => row.kind === "topic")
  assert.equal(first.migrated_items, 6)
  assert.equal(first.processed_items, 0)
  assert.equal(first.index.sha256, initial.index.sha256)
  assert.equal(originalTopic.status, "ready", originalTopic.error)
  assert.equal(storedIndex(f, first).trend_topics[0].history.length, 2)
  atomicWrite(f.vault, f.notes[1].path, f.notes[1].content + "\n관련 없는 정의 변경.\n")
  const unrelated = await f.sync()
  assert.equal(
    unrelated.tasks.find((row) => row.kind === "topic").task_sha256,
    originalTopic.task_sha256,
  )
  assert.equal(unrelated.tasks.find((row) => row.kind === "topic").status, "ready")
  assert.equal(unrelated.processed_items, 2)
  const originalEdition = parseNote(editions[1].content)
  atomicWrite(
    f.vault,
    editions[1].path,
    noteText(
      {
        ...originalEdition.meta,
        article_reviews: [
          ...originalEdition.meta.article_reviews,
          { event_id: "0123456789abcdef" },
        ],
      },
      originalEdition.body,
    ),
  )
  const missingArticle = await f.sync()
  assert.equal(
    missingArticle.tasks.find((row) => row.path === "Signals/report-1.md").reason,
    "current_article_approvals_missing",
  )
  assert.equal(
    missingArticle.tasks.find((row) => row.kind === "topic").reason,
    "reviewed_signal_history_required",
  )
  assert.equal(missingArticle.processed_items, 2)
  assert.equal(storedIndex(f, missingArticle).trend_topics?.length || 0, 0)
  atomicWrite(f.vault, editions[1].path, editions[1].content)
  const restored = await f.sync()
  assert.equal(restored.input_sha256, unrelated.input_sha256)
  assert.equal(restored.sequence, unrelated.sequence + 1)
  assert.equal(restored.previous.sha256, missingArticle.checkpoint.sha256)
  assert.equal(restored.tasks.find((row) => row.kind === "topic").status, "ready")
  atomicWrite(f.vault, f.notes[0].path, f.notes[0].content + "\n연결된 정의의 검토 대기.\n")
  const missingDefinition = await f.sync()
  assert.equal(
    missingDefinition.tasks.find((row) => row.kind === "topic").reason,
    "reviewed_knowledge_definition_required",
  )
  assert.equal(missingDefinition.projection_error, null)
})

test("invalid bootstrap basis does not register persistent workflow authority", async (t) => {
  const f = await setup(t)
  atomicWrite(f.root, "invalid-basis.json", { schema: "unapproved-input/v1" })
  await assert.rejects(f.sync({ basisFile: "invalid-basis.json" }), /Native event workflow/)
  assert.equal(
    fs.existsSync(path.join(f.root, `runs/${f.workflowId}/knowledge-linking/config.json`)),
    false,
  )
  const first = await f.sync({ basisFile: "basis.json", maxItems: 0 })
  assert.equal(first.status, "yielded")
  assert.equal(first.processed_items, 0)
})

test("incomplete native approval inventory stays visible and returning to a prior input appends history", async (t) => {
  const f = await setup(t)
  const initial = await f.sync({ basisFile: "basis.json" })
  const invalid = "runs/broken-approval/approved-notes.json"
  atomicWrite(f.root, invalid, { notes: [] })
  const partial = await f.sync()
  assert.equal(partial.status, "partial")
  assert.equal(partial.native_errors[0].path, invalid)
  assert.equal(readKnowledgeWorkflow(f.root, f.workflowId).native_errors[0].path, invalid)
  fs.rmSync(path.join(f.root, invalid))
  const restored = await f.sync()
  assert.equal(restored.input_sha256, initial.input_sha256)
  assert.equal(restored.sequence, initial.sequence + 1)
  assert.equal(restored.previous.sha256, partial.checkpoint.sha256)
  assert.equal(restored.native_errors.length, 0)
  assert.equal(restored.processed_items, 0)
  assert(fs.existsSync(path.join(f.root, initial.checkpoint.path)))
})

test("interrupted checkpoint installation recovers from persisted configuration without repeating completed tasks", async (t) => {
  const f = await setup(t)
  await assert.rejects(
    f.sync({
      basisFile: "basis.json",
      maxItems: 1,
      afterCheckpoint: () => {
        throw Error("Stopped before latest pointer")
      },
    }),
    /Stopped before/,
  )
  const recovered = await f.sync()
  assert.equal(recovered.sequence, 2)
  assert.equal(recovered.processed_items, 2)
  assert.equal(recovered.counts.ready, 2)
  assert(recovered.previous.path.endsWith("checkpoint-1.json"))
  assert.equal(readKnowledgeWorkflow(f.root, f.workflowId).counts.ready, 2)
})

test("workflow lock recovery requires the exact dead owner and never steals a live lock", async (t) => {
  const f = await setup(t),
    owner = crypto.randomUUID(),
    file = `locks/knowledge-linking-${f.workflowId}.json`
  atomicWrite(f.root, file, { owner, pid: 2147483646, started_at: "2026-09-29T00:00:00Z" })
  await assert.rejects(f.sync({ basisFile: "basis.json" }), /EEXIST/)
  await assert.rejects(
    f.sync({ basisFile: "basis.json", recoverLockOwner: crypto.randomUUID() }),
    /identity/,
  )
  assert.equal(readKnowledgeWorkflow(f.root, f.workflowId).lock.owner, owner)
  const state = await f.sync({ basisFile: "basis.json", recoverLockOwner: owner })
  assert.equal(state.counts.ready, 2)
  const liveOwner = crypto.randomUUID()
  atomicWrite(f.root, file, {
    owner: liveOwner,
    pid: process.pid,
    started_at: "2026-09-29T00:00:00Z",
  })
  await assert.rejects(f.sync({ recoverLockOwner: liveOwner }), /still running/)
  assert(fs.existsSync(path.join(f.root, file)))
})

test("stored queue and index pages remain readable without source reload while sync rejects damaged sources", async (t) => {
  const f = await setup(t)
  const state = await f.sync({ basisFile: "basis.json" })
  fs.unlinkSync(path.join(f.root, f.doc.body_path))
  const first = readKnowledgeWorkflow(f.root, f.workflowId, { limit: 2 })
  assert.equal(first.page.total, 3)
  assert.equal(first.page.next_offset, 2)
  const last = readKnowledgeWorkflow(f.root, f.workflowId, { offset: 2, limit: 2 })
  assert.equal(last.page.next_offset, null)
  const page = await executeModule(f.ctx, "knowledge", "read", {
    result_file: state.index.path,
    result_sha256: state.index.sha256,
    section: "concepts",
    limit: 1,
  })
  assert.equal(page.page.total, 2)
  await assert.rejects(f.sync(), /source|body|ENOENT/i)
  assert.equal(
    readKnowledgeWorkflow(f.root, f.workflowId).checkpoint.sha256,
    state.checkpoint.sha256,
  )
})

test("graph history loss and checkpoint tampering fail closed, and module parameters stay bounded", async (t) => {
  const f = await setup(t)
  const state = await f.sync({ basisFile: "basis.json" })
  writeBasis(f, projectEvidenceOntology([addKnowledgeArticle(f)]))
  await assert.rejects(f.sync(), /drops an already tracked event/)
  assert.equal(
    readKnowledgeWorkflow(f.root, f.workflowId).checkpoint.sha256,
    state.checkpoint.sha256,
  )
  for (const parameters of [
    { max_items: 257 },
    { basis_file: "../outside.json" },
    { command: "unsafe" },
  ])
    await assert.rejects(
      executeModule(f.ctx, "knowledge", "sync", { workflow_id: f.workflowId, ...parameters }),
      /bound|escapes|Unknown/,
    )
  assert.throws(() => readKnowledgeWorkflow(f.root, f.workflowId, { offset: 4 }), /offset exceeds/)
  atomicWrite(f.root, state.checkpoint.path, { ...state, status: "complete" })
  assert.throws(() => readKnowledgeWorkflow(f.root, f.workflowId), /SHA changed/)
})

test("native module workers sync and read the persistent workflow through the public knowledge operations", async (t) => {
  const f = await setup(t, { nativeJob: true })
  atomicWrite(f.ctx.repo, "data/research-source-channels.json", {})
  atomicWrite(f.ctx.repo, "data/research-model-policy.json", {})
  const ctx = moduleContext(f.ctx)
  const job = await submitModuleJob(
    ctx,
    "knowledge",
    "sync",
    { workflow_id: f.workflowId, basis_file: "basis.json", max_items: 256 },
    { jobId: "module-sync", background: false },
  )
  assert.equal(job.state, "completed", job.error)
  const data = JSON.parse(fs.readFileSync(path.join(f.root, job.result.path))).data
  assert.equal(data.schema, "research-knowledge-linking/v1")
  assert.equal(data.counts.ready, 2)
  const read = await submitModuleJob(
    ctx,
    "knowledge",
    "status",
    { workflow_id: f.workflowId, status: "review_pending", limit: 1 },
    { jobId: "module-workflow-status", background: false },
  )
  assert.equal(read.state, "completed", read.error)
  const page = JSON.parse(fs.readFileSync(path.join(f.root, read.result.path))).data
  assert.equal(page.page.returned, 1)
  assert.equal(page.page.items[0].kind, "connection")
  assert.equal(page.read_only, true)
})
