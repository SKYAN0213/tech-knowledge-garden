import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { knowledgeFixture, addKnowledgeArticle } from "./fixtures/research-knowledge-fixtures.mjs"
import { noteText, parseNote } from "../scripts/garden.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"
import { approveNoteReview } from "../scripts/research/note-review.mjs"
import {
  loadApprovedOntologyInput,
  projectEvidenceOntology,
} from "../scripts/research/ontology.mjs"
import { syncKnowledgeWorkflow } from "../scripts/research/knowledge-workflow.mjs"

async function nativeReplacement(f, relative, content, run, evidence) {
  await approveNoteReview(
    f.root,
    run,
    {
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
          operation: "replace",
          previous_sha256: sha256(fs.readFileSync(path.join(f.vault, relative))),
          content,
          evidence,
        },
      ],
    },
    { vault: f.vault },
  )
  atomicWrite(f.vault, relative, content)
}

function storedIndex(f, result) {
  assert(result.index, result.projection_error)
  const bytes = fs.readFileSync(path.join(f.root, result.index.path))
  assert.equal(sha256(bytes), result.index.sha256)
  return JSON.parse(bytes)
}

test("topic workflow blocks stale lesson reviews without losing ready definitions and signals", async (t) => {
  const f = await knowledgeFixture(t)
  const articles = [
    loadApprovedOntologyInput(f.root, "source", { vault: f.vault }),
    addKnowledgeArticle(f, { publishedAt: "2026-09-26" }),
  ]
  assert.equal(new Set(articles.map((a) => a.article.event_id)).size, 2)
  assert.deepEqual(
    articles.map((a) => a.article.article_review.published_at),
    ["2026-09-25", "2026-09-26"],
  )
  atomicWrite(f.root, "graph.json", projectEvidenceOntology(articles))
  atomicWrite(f.root, "basis.json", {
    schema: "research-event-workflow/v1",
    ontology: {
      path: "graph.json",
      sha256: sha256(fs.readFileSync(path.join(f.root, "graph.json"))),
    },
  })
  const evidence = [
    { run_id: "source", claim_ids: ["unassigned"] },
    { run_id: "additional", claim_ids: ["additional-fact"] },
  ]
  const unchangedVault = f.notes.map((note) => note.path)
  for (const [i, input] of articles.entries()) {
    const date = input.article.article_review.published_at
    const edition = `Editions/2026/09/${date}_0800_Tech_AI_Briefing.md`
    atomicWrite(
      f.vault,
      edition,
      noteText(
        {
          title: date,
          type: "briefing",
          scheduled_at: `${date}T08:00:00+09:00`,
          article_reviews: [{ event_id: input.article.event_id }],
        },
        "Fixture edition.",
      ),
    )
    const signalPath = `Signals/report-${i}.md`
    const meta = {
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
          event_id: input.article.event_id,
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
    await nativeReplacement(
      f,
      signalPath,
      noteText({ ...meta, reviewed: "2026-09-28" }, "Reviewed fixture signal."),
      `signal-${i}`,
      [evidence[i]],
    )
    unchangedVault.push(edition, signalPath)
  }
  const topicPath = "TrendTopics/deployment.md"
  const topic = {
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
  const staleTopic = noteText({ ...topic, reviewed: "2026-09-28" }, "Reviewed fixture topic.")
  await nativeReplacement(f, topicPath, staleTopic, "topic-stale", evidence)
  const immutable = [
    ...unchangedVault.map((relative) => path.join(f.vault, relative)),
    path.join(f.root, "graph.json"),
    path.join(f.root, "basis.json"),
    ...["notes", "signal-0", "signal-1", "topic-stale"].map((run) =>
      path.join(f.root, `runs/${run}/approved-notes.json`),
    ),
    ...articles.flatMap((input) =>
      ["documents.json", "parses.json", "reviewed-claims.json", "approved-article.json"].map(
        (name) => path.join(f.root, `runs/${input.run}/${name}`),
      ),
    ),
  ].map((file) => ({ file, bytes: fs.readFileSync(file) }))
  const sync = () =>
    syncKnowledgeWorkflow({
      root: f.root,
      vault: f.vault,
      workflowId: "topic-validation",
      basisFile: "basis.json",
      maxItems: 256,
    })
  const blocked = await sync()
  const blockedTopic = blocked.tasks.find((row) => row.kind === "topic")
  t.diagnostic(
    JSON.stringify({
      topic_status: blockedTopic.status,
      topic_reason: blockedTopic.reason,
      projection_error: blocked.projection_error,
      index_present: !!blocked.index,
      definitions: blocked.tasks
        .filter((row) => row.kind === "definition")
        .map((row) => row.status),
      signals: blocked.tasks.filter((row) => row.kind === "signal").map((row) => row.status),
    }),
  )
  assert.deepEqual(blocked.native_errors, [])
  assert.equal(blockedTopic.status, "blocked")
  assert.equal(blockedTopic.reason, "native_topic_projection_invalid")
  assert.equal(blocked.projection_error, null)
  const retained = storedIndex(f, blocked)
  assert.equal(retained.linking_scope.current_native_definitions, 2)
  assert.equal(retained.linking_scope.current_native_signals, 2)
  assert.equal(retained.linking_scope.current_native_topics, 0)
  assert.deepEqual(retained.linking_scope.pending_note_paths, [topicPath])
  assert.equal(retained.trend_topics?.length || 0, 0)
  assert.deepEqual(retained.concepts.map((concept) => concept.concept_id).sort(), [
    "source-concept",
    "target-concept",
  ])
  const unchangedTasks = blocked.tasks.filter((row) => ["definition", "signal"].includes(row.kind))
  assert.equal(unchangedTasks.length, 4)
  assert(unchangedTasks.every((row) => row.status === "ready"))
  assert.equal(fs.readFileSync(path.join(f.vault, topicPath), "utf8"), staleTopic)
  const checkpointBytes = fs.readFileSync(path.join(f.root, blocked.checkpoint.path))
  const indexBytes = fs.readFileSync(path.join(f.root, blocked.index.path))

  const correctedTopic = noteText(
    {
      ...topic,
      reviewed: "2026-09-28",
      lessons: topic.lessons.map((lesson) => ({ ...lesson, reviewed: "2026-09-28" })),
    },
    "Reviewed fixture topic.",
  )
  await nativeReplacement(f, topicPath, correctedTopic, "topic-corrected", evidence)
  const approved = JSON.parse(
    fs.readFileSync(path.join(f.root, "runs/topic-corrected/approved-notes.json")),
  ).notes[0]
  assert.equal(approved.previous_sha256, sha256(staleTopic))
  assert.equal(approved.before_content, staleTopic)
  assert.equal(parseNote(approved.before_content).meta.lessons[0].reviewed, "2026-09-27")
  assert.deepEqual(approved.evidence, evidence)
  const ready = await sync()
  const readyTopic = ready.tasks.find((row) => row.kind === "topic")
  assert.equal(readyTopic.status, "ready", readyTopic.error)
  assert.equal(readyTopic.approval_run, "topic-corrected")
  assert.equal(ready.projection_error, null)
  assert.deepEqual(ready.previous, blocked.checkpoint)
  for (const before of unchangedTasks) {
    const after = ready.tasks.find((row) => row.id === before.id)
    assert.equal(after.status, "ready")
    assert.equal(after.task_sha256, before.task_sha256)
    assert.equal(after.approval_run, before.approval_run)
    assert.equal(after.note_sha256, before.note_sha256)
  }
  const index = storedIndex(f, ready)
  assert.equal(index.linking_scope.current_native_topics, 1)
  const projectedTopic = index.trend_topics[0]
  assert.equal(projectedTopic.topic_id, "deployment")
  assert.equal(projectedTopic.note_approval.run, "topic-corrected")
  assert.equal(projectedTopic.analyses[0].reviewed_at, "2026-09-28")
  assert.deepEqual(projectedTopic.analyses[0].observation_ids, ["report-0", "report-1"])
  assert.deepEqual(
    projectedTopic.history
      .map((row) => [row.event_id, row.published_at, row.source_published_at])
      .sort(),
    articles
      .map((input) => [
        input.article.event_id,
        input.article.article_review.published_at,
        input.article.article_review.published_at,
      ])
      .sort(),
  )
  assert(projectedTopic.history.every((row) => row.reviewed_at === "2026-09-28"))
  assert(
    projectedTopic.history.every((row) =>
      row.facts.every((fact) => fact.event_state === "planned"),
    ),
  )
  assert.equal(projectedTopic.source_facts.length, 2)
  assert.deepEqual(projectedTopic.source_facts.map((fact) => fact.published_at).sort(), [
    "2026-09-25",
    "2026-09-26",
  ])
  assert.deepEqual(index.concepts, retained.concepts)
  assert.deepEqual(index.events, retained.events)
  for (const { file, bytes } of immutable) assert.deepEqual(fs.readFileSync(file), bytes, file)
  assert.deepEqual(fs.readFileSync(path.join(f.root, blocked.checkpoint.path)), checkpointBytes)
  assert.deepEqual(fs.readFileSync(path.join(f.root, blocked.index.path)), indexBytes)
  for (const result of [blocked, ready]) {
    assert.equal(result.canonical_writes, 0)
    assert.equal(result.approvals_created, false)
    assert.equal(result.candidate_published, false)
    assert.equal(result.model_calls, 0)
    assert.equal(result.source_requests, 0)
  }
})
