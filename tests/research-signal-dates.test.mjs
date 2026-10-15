import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { noteText, parseNote } from "../scripts/garden.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"
import { evaluateNoteReview, loadHistoricalNoteApproval } from "../scripts/research/note-review.mjs"
import { assertSignalOccurredAt } from "../scripts/research/signal-dates.mjs"
import { projectEvidenceOntology } from "../scripts/research/ontology.mjs"
import { projectApprovedTrends } from "../scripts/research/ontology-trends.mjs"
import { validateTrendRecords, trendSnapshot } from "../scripts/trends.mjs"
import { topicMarkdown } from "../scripts/briefings.mjs"

function fixture(t, { firstOccurred = "2026-06-27", firstState = "reported" } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "signal-dates-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const vault = path.join(root, "vault")
  fs.mkdirSync(vault)
  const inputs = [
    ["source-a", "2026-06-28", firstOccurred, firstState],
    ["source-b", "2026-06-27", "2026-06-26", "completed"],
  ].map(([run, published, occurred, state]) => {
    const url = `https://example.org/${run}`,
      text = `The ${run} deployment ${state} on ${occurred}.`,
      source_id = sourceId(url),
      source_version_id = source_id + ":" + sha256(text),
      parse_id = sha256(run)
    const doc = {
      source_id,
      source_version_id,
      original_url: url,
      final_url: url,
      body_sha256: sha256(text),
      body_path: `documents/${run}.html`,
      fetch_status: "captured",
      observed_at: "2026-06-29T00:00:00Z",
    }
    const parse = {
      schema_version: "source-parse/v1",
      source_id,
      source_version_id,
      parse_id,
      title: run,
      status: "extracted",
      dates: { published_at: published, observed_at: doc.observed_at },
      quality: { missing_pages: [] },
      blocks: [{ block_id: parse_id + ":b1", text, locator: { text_hash: sha256(text) } }],
    }
    const claims = recordFactReview(
      [
        {
          claim_id: run,
          statement: text,
          claim_kind: "attributed_fact",
          subject: run,
          event_state: state,
          published_at: published,
          effective_period: occurred,
          numbers: [],
          evidence: [
            {
              source_id,
              source_version_id,
              parse_id,
              block_id: parse.blocks[0].block_id,
              quote: text,
              support: "direct",
            },
          ],
        },
      ],
      [
        {
          claim_id: run,
          status: "verified",
          reason: "Synthetic source date checked",
          source_read: true,
          entailment_checked: true,
          identity_checked: true,
          numbers_checked: true,
          time_checked: true,
        },
      ],
      { reviewer: "Fixture reviewer", reviewed_at: "2026-06-29" },
      [parse],
    )
    atomicWrite(root, doc.body_path, text)
    atomicWrite(root, `parses/${parse_id}/parse.json`, parse)
    atomicWrite(root, `runs/${run}/documents.json`, [doc])
    atomicWrite(root, `runs/${run}/parses.json`, [parse])
    atomicWrite(root, `runs/${run}/reviewed-claims.json`, { claims })
    return {
      run,
      file_hashes: { "approved-article.json": sha256(run) },
      article: {
        event_id: sha256(url).slice(0, 16),
        title: run,
        source_urls: [url],
        sector: "AI",
        theme: "기업 전략",
        tags: [],
        entities: [],
        article_review: {
          review_status: "verified",
          published_at: published,
          reviewed_at: "2026-06-29",
          concept_ids: [],
        },
      },
      draft: { draft: { lead: [{ claim_ids: [run] }], explanations: [] } },
      claims,
      parses: [parse],
      documents: [doc],
    }
  })
  const topic = {
    schema_version: "tech-trend/v1",
    type: "trend-topic-source",
    id: "deployment",
    title: "배포 이력",
    question: "무엇이 실행됐나?",
    thesis: "원문으로 확인한 배포 이력.",
    watch_for: "후속 배포",
    disconfirming: "원문 정정",
    reviewed: "2026-06-29",
    reader_format: "source-events/v1",
    knowledge_notes: [],
    lessons: [],
  }
  const reviews = inputs.map((input) => {
    const date = input.article.article_review.published_at
    return {
      schema_version: "tech-signals/v1",
      type: "trend-observations",
      edition: `Editions/2026/06/${date}_0800_Tech_AI_Briefing`,
      date,
      reviewed: "2026-06-29",
      review_basis: "primary-research",
      observations: [
        {
          id: input.run,
          topic_id: topic.id,
          event_id: input.article.event_id,
          event_date: date,
          stance: "support",
          change: input.claims[0].statement,
          meaning: "원문에 기록된 배포 사건.",
          limit: "원문 범위에 한정.",
          next_check: "후속 원문 확인.",
        },
      ],
    }
  })
  const decision = (meta = reviews[0], { replace = false, v1 = false } = {}) => {
    const relative = `Signals/${meta.edition.split("/").at(-1)}.md`,
      before = noteText(reviews[0], `[[${reviews[0].edition}|수록 원고]]`)
    if (replace) atomicWrite(vault, relative, before)
    return {
      schema: v1 ? "knowledge-note-review/v1" : "knowledge-note-review/v2",
      reviewer: "Fixture reviewer",
      reason: "Actual day checked without changing publication",
      reviewed_at: "2026-06-29",
      source_read: true,
      final_prose_read: true,
      aliases_checked: true,
      connections_checked: true,
      histories_checked: true,
      notes: [
        {
          ...(v1 ? {} : { operation: replace ? "replace" : "create" }),
          path: relative,
          previous_sha256: replace ? sha256(before) : null,
          content: noteText(meta, `[[${meta.edition}|수록 원고]]`),
          evidence: [{ run_id: inputs[0].run, claim_ids: [inputs[0].run] }],
        },
      ],
    }
  }
  const project = () => {
    const notes = [
      { path: `TrendTopics/${topic.id}.md`, meta: topic },
      ...reviews.map((meta) => ({ path: `Signals/${meta.edition.split("/").at(-1)}.md`, meta })),
    ].map(({ path: relative, meta }) => {
      const content = noteText(meta, "Reviewed fixture source notes")
      return {
        path: relative,
        content,
        sha256: sha256(content),
        previous_sha256: null,
        evidence: inputs.map((input) => ({ run_id: input.run, claim_ids: [input.run] })),
      }
    })
    return projectApprovedTrends(root, projectEvidenceOntology(inputs), inputs, [], ["notes"], {
      noteApprovalLoader: () => ({
        approval: { notes },
        files: { approval_sha256: sha256("fixture") },
      }),
    })
  }
  return { root, vault, inputs, reviews, topic, decision, project }
}

test("Signal approval keeps publication and identity while accepting a separately verified actual day", (t) => {
  const f = fixture(t),
    meta = structuredClone(f.reviews[0]),
    signal = meta.observations[0]
  signal.occurred_at = "2026-06-27"
  signal.source_published_at = signal.event_date
  const created = evaluateNoteReview(f.root, f.decision(meta), { vault: f.vault })
  assert.equal(created.notes[0].operation, "create")
  assert.deepEqual(parseNote(created.notes[0].content).meta.observations[0], signal)
  const replacement = f.decision(meta, { replace: true })
  const approved = evaluateNoteReview(f.root, replacement, { vault: f.vault })
  assert.equal(approved.notes[0].previous_sha256, replacement.notes[0].previous_sha256)
  const before = parseNote(approved.notes[0].before_content).meta.observations[0]
  assert.equal(before.event_date, signal.event_date)
  assert.equal(before.event_id, signal.event_id)
  assert.equal(before.id, signal.id)
  assert.equal(Object.hasOwn(before, "occurred_at"), false)
  assert.equal(fs.existsSync(path.join(f.root, "runs/source-a/approved-article.json")), false)
  assert.equal(approved.candidate_published, false)
})

test("Signals reject unsupported, unverified, other-event and planned dates and native article conflicts", (t) => {
  const f = fixture(t),
    meta = structuredClone(f.reviews[0]),
    signal = meta.observations[0]
  signal.occurred_at = "2026-06-26"
  assert.throws(
    () => evaluateNoteReview(f.root, f.decision(meta), { vault: f.vault }),
    /exact verified effective_period/,
  )
  signal.occurred_at = "2026-06-27"
  const fact = { event_id: signal.event_id, claim: f.inputs[0].claims[0] }
  assert.throws(
    () =>
      assertSignalOccurredAt(signal, {
        facts: [{ ...fact, event_id: f.inputs[1].article.event_id }],
      }),
    /same event/,
  )
  assert.throws(
    () =>
      assertSignalOccurredAt(signal, {
        facts: [{ ...fact, claim: { ...fact.claim, review: { status: "deferred" } } }],
      }),
    /exact verified/,
  )
  assert.throws(
    () =>
      assertSignalOccurredAt(signal, {
        facts: [{ ...fact, claim: { ...fact.claim, event_state: "planned" } }],
      }),
    /exact verified/,
  )
  signal.occurred_at = "2026-06-29"
  assert.throws(
    () => evaluateNoteReview(f.root, f.decision(meta), { vault: f.vault }),
    /actual calendar day/,
  )
  signal.occurred_at = ""
  assert.throws(
    () => evaluateNoteReview(f.root, f.decision(meta), { vault: f.vault }),
    /actual calendar day/,
  )
  signal.occurred_at = "2026-06-27"
  f.inputs[0].article.article_review.occurred_at = "2026-06-26"
  atomicWrite(f.root, "runs/source-a/approved-article.json", f.inputs[0].article)
  assert.throws(
    () => evaluateNoteReview(f.root, f.decision(meta), { vault: f.vault }),
    /conflicts with the native article/,
  )
  f.reviews[0].observations[0].occurred_at = signal.occurred_at
  assert.throws(f.project, /conflicts with the native article/)
})

test("Adding an actual date cannot rewrite an existing Signal publication timestamp or event identity", (t) => {
  const f = fixture(t),
    meta = structuredClone(f.reviews[0])
  meta.observations[0].occurred_at = "2026-06-27"
  meta.observations[0].event_date = "2026-06-27"
  const decision = f.decision(meta, { replace: true })
  assert.throws(
    () => evaluateNoteReview(f.root, decision, { vault: f.vault }),
    /source publication date must be retained/,
  )
  meta.observations[0].event_date = "2026-06-28"
  meta.observations[0].event_id = f.inputs[1].article.event_id
  assert.throws(
    () => evaluateNoteReview(f.root, f.decision(meta, { replace: true }), { vault: f.vault }),
    /event identity/,
  )
})

test("Native and public trend histories use the actual day while preserving publication and issue boundaries", (t) => {
  const f = fixture(t, { firstOccurred: "2026-06-25" })
  f.reviews.forEach((meta, i) => {
    meta.observations[0].occurred_at = f.inputs[i].claims[0].effective_period
  })
  const history = f.project()[0].history
  assert.deepEqual(
    history.map((row) => row.event_id),
    [f.inputs[1].article.event_id, f.inputs[0].article.event_id],
  )
  assert.equal(history[1].occurred_at, "2026-06-25")
  assert.equal(history[1].published_at, "2026-06-28")
  assert.equal(history[1].source_published_at, "2026-06-28")
  const issues = f.inputs
    .map((input, i) => ({
      key: f.reviews[i].edition,
      date: f.reviews[i].date,
      items: [
        {
          id: input.article.event_id,
          title: input.article.title,
          summary: "배포 원문.",
          urls: input.article.source_urls,
          review: input.article.article_review,
        },
      ],
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
  const data = validateTrendRecords([f.topic], f.reviews, issues)
  const current = trendSnapshot(data, f.reviews[0].edition).topics[0]
  assert.deepEqual(
    current.history.map((row) => row.date),
    ["2026-06-25", "2026-06-26"],
  )
  assert.equal(current.days, 2)
  assert.equal(current.latest.id, f.inputs[1].run)
  const markdown = topicMarkdown(current, "2026-06-29")
  assert.ok(markdown.indexOf("### 2026-06-26") < markdown.indexOf("### 2026-06-25"))
  assert.equal(markdown.includes("### 2026-06-28"), false)
  assert.deepEqual(
    trendSnapshot(data, f.reviews[1].edition).topics[0].history.map((row) => row.id),
    [f.inputs[1].run],
  )
})

test("An unspecified v1 stored approval and public history keep their previous shape and publication fallback", (t) => {
  const f = fixture(t, { firstOccurred: "2027", firstState: "planned" })
  const decision = f.decision(f.reviews[0], { replace: true, v1: true })
  const approval = evaluateNoteReview(f.root, decision, { vault: f.vault })
  assert.equal(approval.schema, "approved-knowledge-notes/v1")
  assert.equal(Object.hasOwn(approval.notes[0], "operation"), false)
  assert.deepEqual(Object.keys(approval.source_files[0].files), [
    "documents.json",
    "parses.json",
    "reviewed-claims.json",
  ])
  atomicWrite(f.root, "runs/v1/note-review.json", decision)
  atomicWrite(f.root, "runs/v1/approved-notes.json", approval)
  assert.deepEqual(loadHistoricalNoteApproval(f.root, "v1", { vault: f.vault }).approval, approval)
  const history = f.project()[0].history
  assert.equal(Object.hasOwn(history[0], "occurred_at"), false)
  assert.equal(history[0].published_at, "2026-06-28")
  const review = structuredClone(f.reviews[0])
  delete review.observations[0].event_date
  const issues = [
    {
      key: review.edition,
      date: review.date,
      items: [
        {
          id: review.observations[0].event_id,
          title: "old",
          urls: ["https://example.org/source-a"],
        },
      ],
    },
  ]
  const data = validateTrendRecords([f.topic], [review], issues)
  assert.equal(data.signals[0].date, review.date)
  assert.equal(Object.hasOwn(data.signals[0], "occurred_at"), false)
  assert.equal(approval.notes[0].sha256, sha256(decision.notes[0].content))
})
