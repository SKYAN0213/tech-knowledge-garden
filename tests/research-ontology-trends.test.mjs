import test from "node:test"
import assert from "node:assert/strict"
import { noteText, parseNote } from "../scripts/garden.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { projectEvidenceOntology } from "../scripts/research/ontology.mjs"
import { ontologyKnowledgeIndex } from "../scripts/research/ontology-knowledge.mjs"
import {
  prepareTrendReviewRuns,
  projectApprovedTrends,
} from "../scripts/research/ontology-trends.mjs"

function fixture(firstPublished) {
  const inputs = ["2026-09-20", "2026-09-21"].map((date, i) => {
    const sourceDate = i === 0 && firstPublished ? firstPublished : date
    const run = `article-${i}`,
      text = `Source ${i} reports ${i ? "completed" : "planned"} deployment.`
    const evidence = {
      source_id: run,
      source_version_id: run,
      parse_id: run,
      block_id: run + ":block-1",
      quote: text,
      support: "direct",
    }
    const parse = {
      schema_version: "source-parse/v1",
      source_id: run,
      source_version_id: run,
      parse_id: run,
      status: "extracted",
      title: run,
      dates: { published_at: sourceDate },
      quality: { missing_pages: [] },
      blocks: [{ block_id: run + ":block-1", text, locator: { text_hash: sha256(text) } }],
    }
    const claims = recordFactReview(
      [
        {
          schema: "research-claim/v1",
          claim_id: run,
          candidate_key: run,
          event_id: null,
          subject_id: null,
          statement: text,
          claim_kind: "attributed_fact",
          subject: "A Corp",
          event_state: i ? "completed" : "planned",
          published_at: sourceDate,
          effective_period: i ? null : "2027",
          numbers: [],
          evidence: [evidence],
        },
      ],
      [
        {
          claim_id: run,
          status: "verified",
          reason: "Source read",
          source_read: true,
          entailment_checked: true,
          identity_checked: true,
          numbers_checked: true,
          time_checked: true,
        },
      ],
      { reviewer: "test", reviewed_at: "2026-09-22" },
      [parse],
    )
    return {
      run,
      file_hashes: { "approved-article.json": sha256(run) },
      article: {
        event_id: String(i + 1).repeat(16),
        title: run,
        source_urls: [`https://example.org/${run}`],
        sector: "AI",
        theme: "기업 전략",
        tags: [],
        entities: [],
        article_review: {
          review_status: "verified",
          published_at: date,
          reviewed_at: "2026-09-22",
          concept_ids: [],
        },
      },
      draft: { draft: { lead: [{ claim_ids: [run] }], explanations: [] } },
      claims,
      parses: [parse],
      documents: [
        {
          source_id: run,
          source_version_id: run,
          original_url: `https://example.org/${run}`,
          final_url: `https://example.org/${run}`,
          body_sha256: sha256(text),
          observed_at: date + "T08:00:00Z",
        },
      ],
    }
  })
  const topic = {
    schema_version: "tech-trend/v1",
    type: "trend-topic-source",
    id: "deployment",
    title: "배포 계획과 실행",
    question: "공식 발표에서 확인한 단계는 무엇인가?",
    thesis: "INTERNAL THESIS",
    watch_for: "INTERNAL NEXT",
    disconfirming: "INTERNAL LIMIT",
    reviewed: "2026-09-22",
    reader_format: "source-events/v1",
    knowledge_notes: [],
    lessons: [],
  }
  const notes = [
    { path: "TrendTopics/deployment.md", meta: topic },
    ...inputs.map((input) => {
      const date = input.article.article_review.published_at
      const edition = `Editions/2026/09/${date}_0800_Tech_AI_Briefing`
      return {
        path: `Signals/${date}_0800_Tech_AI_Briefing.md`,
        meta: {
          schema_version: "tech-signals/v1",
          type: "trend-observations",
          edition,
          date,
          reviewed: "2026-09-22",
          review_basis: "primary-research",
          observations: [
            {
              id: input.run,
              topic_id: "deployment",
              event_id: input.article.event_id,
              event_date: date,
              stance: "support",
              change: input.claims[0].statement,
              meaning: "INTERNAL MEANING",
              limit: "INTERNAL LIMIT",
              next_check: "INTERNAL NEXT",
            },
          ],
        },
      }
    }),
  ].map(({ path, meta }) => {
    const content = noteText(meta, "Reviewed source notes")
    return {
      path,
      content,
      sha256: sha256(content),
      previous_sha256: null,
      evidence: inputs.map((input) => ({ run_id: input.run, claim_ids: [input.run] })),
    }
  })
  const approvals = new Map([["review", { notes }]])
  const options = {
    noteApprovalLoader: (_root, run) => ({
      run,
      approval: approvals.get(run),
      files: { approval_sha256: sha256(JSON.stringify(approvals.get(run))) },
    }),
    inputLoader: (_root, run) => inputs.find((input) => input.run === run),
  }
  return { inputs, graph: projectEvidenceOntology(inputs), approvals, notes, topic, options }
}
const read = (f, runs = ["review"]) =>
  projectApprovedTrends("unused", f.graph, f.inputs, [], runs, f.options)
const edit = (note, update) => {
  const meta = JSON.parse(JSON.stringify(update))
  note.content = noteText(meta, "Reviewed source notes")
  note.sha256 = sha256(note.content)
}

test("native trend notes join the knowledge index without growth inference or internal copy", () => {
  const f = fixture()
  const result = ontologyKnowledgeIndex("unused", f.graph, {
    ...f.options,
    trendReviewRuns: ["review"],
  })
  assert.equal(result.trend_topics.length, 1)
  const topic = result.trend_topics[0]
  assert.equal(topic.history.length, 2)
  assert.equal(topic.history[0].published_at, "2026-09-21")
  assert.equal(topic.history[1].facts[0].event_state, "planned")
  assert.equal(topic.history[1].facts[0].effective_period, "2027")
  assert.equal(topic.history[0].facts[0].evidence[0].quote, f.inputs[1].claims[0].statement)
  assert.ok(!JSON.stringify(topic).includes("INTERNAL"))
  assert.ok(!Object.hasOwn(topic, "analyses"))
  assert.equal(result.concepts.length, 0)
  assert.deepEqual(result.trend_topics, read(f))
  assert.equal(ontologyKnowledgeIndex("unused", f.graph, f.options).trend_topics, undefined)
})

test("excluded events, unused facts and mismatched source dates cannot enter trends", () => {
  const f = fixture()
  f.notes[1].evidence[0].claim_ids = ["unverified"]
  assert.throws(() => read(f), /claim/i)
  f.notes[1].evidence[0].claim_ids = [f.inputs[0].run]
  f.notes[1].evidence[0].run_id = "excluded"
  assert.throws(() => read(f), /current approved/)
  f.notes[1].evidence[0].run_id = f.inputs[0].run
  const meta = parseNote(f.notes[1].content).meta
  meta.observations[0].event_date = "2026-09-19"
  edit(f.notes[1], meta)
  assert.throws(() => read(f), /exact approved event/)
})

test("single events have a history while lessons require two distinct dates and events", () => {
  const f = fixture()
  const lesson = {
    id: "tested",
    claim: "검토자가 확인한 비교",
    limit: "비공개 적용 범위",
    reviewed: "2026-09-22",
    signal_ids: ["article-0", "article-1"],
  }
  edit(f.notes[0], { ...f.topic, lessons: [lesson] })
  assert.equal(read(f)[0].analyses[0].text, lesson.claim)
  assert.ok(!JSON.stringify(read(f)).includes(lesson.limit))
  edit(f.notes[0], { ...f.topic, lessons: [{ ...lesson, signal_ids: ["article-0", "article-0"] }] })
  assert.throws(() => read(f), /two distinct/)
  edit(f.notes[0], f.topic)
  f.notes.pop()
  assert.equal(read(f)[0].history.length, 1)
})

test("reviewed note lineage keeps prior dates and rejects competing versions", () => {
  const f = fixture(),
    original = structuredClone(f.notes[0])
  const updated = structuredClone(original)
  edit(updated, { ...f.topic, reviewed: "2026-09-23", title: "배포 단계 기록" })
  updated.previous_sha256 = original.sha256
  f.approvals.set("later", { notes: [updated] })
  const topic = read(f, ["later", "review"])[0]
  assert.equal(topic.title, "배포 단계 기록")
  assert.equal(topic.previous_versions[0].reviewed_at, "2026-09-22")
  updated.previous_sha256 = null
  assert.throws(() => read(f, ["review", "later"]), /Competing|Disconnected/)
})

test("source timestamp and Korean article day stay separate and exactly source-bound", () => {
  const instant = "2026-09-19T23:00:00Z"
  const f = fixture(instant)
  const meta = parseNote(f.notes[1].content).meta
  meta.observations[0].event_date = instant
  edit(f.notes[1], meta)
  const event = read(f)[0].history.find((row) => row.event_id === f.inputs[0].article.event_id)
  assert.equal(event.published_at, "2026-09-20")
  assert.equal(event.source_published_at, instant)
  meta.observations[0].event_date = "2026-09-19T22:00:00Z"
  edit(f.notes[1], meta)
  assert.throws(() => read(f), /exact approved event/)
})

test("trend projection accepts the source timestamp for its approved calendar-day observation", () => {
  const f = fixture("2026-09-20T08:00:00+09:00")
  const result = read(f)
  const event = result[0].history.find((row) => row.event_id === f.inputs[0].article.event_id)
  assert.equal(event.published_at, "2026-09-20")
  assert.equal(event.source_published_at, "2026-09-20")
  assert.equal(event.facts[0].claim_id, f.inputs[0].claims[0].claim_id)

  const signal = parseNote(f.notes[1].content).meta
  signal.observations[0].event_date = "2026-09-19"
  edit(f.notes[1], signal)
  assert.throws(() => read(f), /exact approved event/)

  signal.observations[0].event_date = "2026-09-20"
  signal.observations[0].event_id = f.inputs[1].article.event_id
  edit(f.notes[1], signal)
  assert.throws(() => read(f), /exact approved event/)
})

test("explicit evidence-only reapproval preserves note bytes without a false lineage cycle", () => {
  const f = fixture(),
    expected = read(f)
  for (const note of f.notes) note.previous_sha256 = note.sha256
  const reapproved = read(f)
  // Provenance changes with the evidence-only native ledger. Approved prose,
  // observations and facts remain identical, with no false lineage version.
  assert.notEqual(
    reapproved[0].note_approval.files.approval_sha256,
    expected[0].note_approval.files.approval_sha256,
  )
  const content = (topics) =>
    topics.map((topic) => ({
      ...topic,
      note_approval: { ...topic.note_approval, files: undefined },
    }))
  assert.deepEqual(content(reapproved), content(expected))
  const competing = structuredClone(f.notes[0])
  edit(competing, { ...f.topic, title: "서로 연결되지 않은 판본" })
  competing.previous_sha256 = competing.sha256
  f.approvals.set("competing", { notes: [competing] })
  assert.throws(() => read(f, ["review", "competing"]), /Competing|Disconnected/)
  // Reapproval cannot add a fact outside the actual graph article.
  f.notes[1].evidence[0].claim_ids.push("unused-fact")
  assert.throws(() => read(f), /Claim not found/)
})

test("publisher calendar day survives a source timestamp crossing the Korean midnight", () => {
  const instant = "2026-09-20T23:00:00Z",
    f = fixture(instant)
  const meta = parseNote(f.notes[1].content).meta
  meta.observations[0].event_date = instant
  edit(f.notes[1], meta)
  const event = read(f)[0].history.find((row) => row.event_id === f.inputs[0].article.event_id)
  assert.equal(event.published_at, "2026-09-20")
  assert.equal(event.source_published_at, instant)
  meta.observations[0].event_date = "2026-09-20"
  edit(f.notes[1], meta)
  const day = read(f)[0].history.find((row) => row.event_id === f.inputs[0].article.event_id)
  assert.equal(day.published_at, "2026-09-20")
  assert.equal(day.source_published_at, "2026-09-20")
})

test("a full approved signal ledger waits for its topic approval without discarding or trusting its evidence", () => {
  const f = fixture(),
    meta = parseNote(f.notes[1].content).meta
  meta.observations[0].topic_id = "pending-topic"
  edit(f.notes[1], meta)
  const before = f.notes[1].content
  assert.equal(read(f)[0].history.length, 1)
  assert.equal(f.notes[1].content, before)
  f.notes[1].evidence[0].claim_ids.push("unused-fact")
  assert.throws(() => read(f), /Claim not found/)
  f.notes[1].evidence[0].claim_ids.pop()
  const pending = structuredClone(f.notes[0])
  pending.path = "TrendTopics/pending-topic.md"
  edit(pending, { ...f.topic, id: "pending-topic", title: "새 주제" })
  f.notes.push(pending)
  assert.equal(read(f).find((t) => t.topic_id === "pending-topic").history.length, 1)
  assert.equal(f.notes[1].content, before)
})

test("trend inputs require native approvals and distinct exact run IDs", () => {
  const f = fixture()
  for (const runs of [null, {}, ["review", "review"], ["../review"]])
    assert.throws(() => prepareTrendReviewRuns("unused", runs, f.options), /native trend/)
  f.approvals.set("empty", { notes: [] })
  assert.throws(() => prepareTrendReviewRuns("unused", ["empty"], f.options), /signal or topic/)
  f.notes[0].sha256 = "changed"
  assert.throws(() => read(f), /bytes changed/)
})

test("trend provenance uses an immutable graph snapshot and validates each new projection", () => {
  const f = fixture()
  const expected = read(f)
  const before = structuredClone(f.graph)
  const loader = f.options.noteApprovalLoader
  f.options.noteApprovalLoader = (...args) => {
    const source = f.graph.nodes.find((node) => node.type === "SourceVersion")
    source.original_url = "https://example.org/unreviewed-replacement"
    return loader(...args)
  }
  assert.deepEqual(read(f), expected)
  assert.throws(() => read(f), /hash|fingerprint|snapshot|source|ontology/i)
  f.graph = before
  f.options.noteApprovalLoader = loader
  assert.deepEqual(read(f), expected)
})

test("approved topics keep exact used article facts while Signals approvals are pending", () => {
  const f = fixture()
  f.notes.splice(1)
  const topic = read(f)[0]
  assert.equal(topic.history, undefined)
  assert.equal(topic.source_facts.length, 2)
  assert.equal(topic.source_facts[0].event_state, "planned")
  assert.equal(topic.source_facts[0].effective_period, "2027")
  assert.equal(topic.source_facts[0].evidence[0].quote, f.inputs[0].claims[0].statement)
  assert.equal(topic.note_approval.run, "review")
  assert.ok(!Object.hasOwn(topic, "analyses"))
  f.notes[0].evidence[0].claim_ids.push("unused-fact")
  assert.throws(() => read(f), /Claim not found/)
})

test("explicit trend note lineage retains retired dependencies as history, never as current facts", () => {
  const f = fixture(),
    original = f.notes[0]
  original.evidence = [{ run_id: "retired-article", claim_ids: ["retired-fact"] }]
  const next = structuredClone(original)
  edit(next, { ...f.topic, reviewed: "2026-09-23", title: "현재 배포 검토" })
  next.previous_sha256 = original.sha256
  next.evidence = [{ run_id: f.inputs[1].run, claim_ids: [f.inputs[1].run] }]
  f.approvals.set("later", { notes: [next] })
  const topic = read(f, ["review", "later"])[0]
  assert.equal(topic.previous_versions[0].sha256, original.sha256)
  assert.equal(topic.source_facts.length, 1)
  assert.equal(topic.source_facts[0].run, f.inputs[1].run)
  assert.ok(!JSON.stringify(topic.source_facts).includes("retired"))
  next.evidence = original.evidence
  assert.throws(() => read(f, ["review", "later"]), /current approved/)
})
