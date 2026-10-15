import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { noteText, parseNote } from "../scripts/garden.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { draftFingerprint } from "../scripts/research/editor.mjs"
import { approvedArticle } from "../scripts/research/publish-adapter.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"
import { approveNoteReview } from "../scripts/research/note-review.mjs"
import { loadApprovedOntologyInput, projectEvidenceOntology } from "../scripts/research/ontology.mjs"
import { syncKnowledgeWorkflow } from "../scripts/research/knowledge-workflow.mjs"

const publishedAt = "2026-09-29T08:00:00+09:00"
const publishedDay = "2026-09-29"

function approvedNativeArticle(root, vault, run, company) {
  const url = `https://fixture.example/${run}`
  const quote = `${company} announced a research program on September 29, 2026.`
  const sid = sourceId(url)
  const version = `${sid}:${sha256(quote)}`
  const parseId = sha256(`parse-${run}`)
  const blockId = `${parseId}:block-0001`
  const eventId = sid.slice(0, 16)
  const doc = {
    source_id: sid,
    source_version_id: version,
    original_url: url,
    final_url: url,
    body_sha256: sha256(quote),
    body_path: `documents/${run}.bin`,
    fetch_status: "captured",
    observed_at: "2026-09-30T00:00:00Z",
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id: sid,
    source_version_id: version,
    parse_id: parseId,
    title: `${company} research program announcement`,
    status: "extracted",
    dates: { published_at: publishedAt, observed_at: doc.observed_at },
    quality: { missing_pages: [] },
    blocks: [{ block_id: blockId, text: quote, locator: { text_hash: sha256(quote) } }],
  }
  const claimId = `${run}-claim`
  const claims = recordFactReview(
    [
      {
        claim_id: claimId,
        statement: quote,
        claim_kind: "attributed_fact",
        subject: company,
        event_state: "reported",
        published_at: publishedAt,
        effective_period: null,
        numbers: [],
        evidence: [
          {
            source_id: sid,
            source_version_id: version,
            parse_id: parseId,
            block_id: blockId,
            quote,
            support: "direct",
          },
        ],
      },
    ],
    [
      {
        claim_id: claimId,
        status: "verified",
        reason: "The exact stored source block supports the announcement and source timestamp.",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      },
    ],
    { reviewer: "Fixture reviewer", reviewed_at: "2026-09-30" },
    [parse],
  )
  const draft = {
    title: `${company} 연구 프로그램 발표`,
    lead: [
      { text: `${company}는 9월 29일 연구 프로그램을 발표했다.`, claim_ids: [claimId] },
      { text: "회사는 공개 자료에서 프로그램을 설명했다.", claim_ids: [claimId] },
    ],
    facts: {
      who: company,
      when: publishedDay,
      where: null,
      what: "A research program announcement",
      how: null,
      why: null,
    },
    sector: "AI",
    theme: "연구·기술",
    tags: ["새로운 방법"],
    entities: [company],
    explanations: [],
  }
  const draftRecord = {
    draft_id: draftFingerprint(draft),
    draft,
    status: "editorial_review",
    problems: [],
    public_approved: false,
  }
  const editorialReview = {
    status: "approved",
    draft_id: draftRecord.draft_id,
    event_id: eventId,
    published_at: publishedDay,
    reviewed_at: "2026-09-30",
    region: "해외",
    reviewer: "Fixture reviewer",
    source_read: true,
    final_prose_read: true,
    title_checked: true,
    dates_checked: true,
    numbers_checked: true,
    analysis_checked: true,
    concept_ids: [],
  }
  atomicWrite(root, doc.body_path, quote)
  atomicWrite(root, `parses/${parseId}/parse.json`, parse)
  for (const [name, value] of [
    ["documents.json", [doc]],
    ["parses.json", [parse]],
    ["reviewed-claims.json", { claims }],
    ["draft.json", draftRecord],
    ["editorial-review.json", editorialReview],
    ["approved-article.json", approvedArticle(draftRecord, claims, [doc], editorialReview, [parse])],
  ])
    atomicWrite(root, `runs/${run}/${name}`, value)
  return loadApprovedOntologyInput(root, run, { vault })
}

async function createSignal(root, vault, { id, time, eventId, eventIds, eventDate, evidenceRun }) {
  const edition = `Editions/2026/09/2026-09-30_${time}_Tech_AI_Briefing`
  const relative = `Signals/${edition.split("/").at(-1)}.md`
  const meta = {
    schema_version: "tech-signals/v1",
    type: "trend-observations",
    edition,
    date: "2026-09-30",
    reviewed: "2026-10-12",
    review_basis: "primary-research",
    observations: [
      {
        id,
        topic_id: "research-programs",
        event_id: eventId,
        event_date: eventDate,
        stance: "context",
        change: "회사가 연구 프로그램을 발표했다.",
        meaning: "회사의 연구 활동을 추적할 관측이다.",
        limit: "회사 발표 범위에 한정한다.",
        next_check: "후속 연구 공개를 확인한다.",
      },
    ],
  }
  atomicWrite(
    vault,
    `${edition}.md`,
    noteText(
      {
        title: "Fixture issue",
        type: "briefing",
        scheduled_at: `2026-09-30T${time.slice(0, 2)}:${time.slice(2)}:00+09:00`,
        article_reviews: eventIds.map((id) => ({ event_id: id })),
      },
      "Fixture issue with native approved articles.",
    ),
  )
  const originalContent = noteText({ ...meta, reviewed: "2026-10-11" }, `[[${edition}|수록 원고]]`)
  const content = noteText(meta, `[[${edition}|수록 원고]]`)
  atomicWrite(vault, relative, originalContent)
  await approveNoteReview(
    root,
    `review-${id}`,
    {
      schema: "knowledge-note-review/v2",
      reviewer: "Fixture reviewer",
      reviewed_at: "2026-10-12",
      reason: "Read the native source parse, exact claim and signal note.",
      source_read: true,
      final_prose_read: true,
      aliases_checked: true,
      connections_checked: true,
      histories_checked: true,
      notes: [
        {
          operation: "replace",
          path: relative,
          previous_sha256: sha256(Buffer.from(originalContent)),
          content,
          evidence: [{ run_id: evidenceRun.run, claim_ids: [evidenceRun.claims[0].claim_id] }],
        },
      ],
    },
    { vault },
  )
  atomicWrite(vault, relative, content)
  return relative
}

test("Signal day precision matches a timestamp claim only for the same approved event", async (t) => {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "signal-publication-precision-")))
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const root = path.join(temp, "native"), vault = path.join(root, "vault")
  const first = approvedNativeArticle(root, vault, "source-a", "Example Company")
  const second = approvedNativeArticle(root, vault, "source-b", "Other Company")
  assert.equal(first.claims[0].published_at, publishedAt)
  assert.equal(first.article.article_review.published_at, publishedDay)
  const graph = projectEvidenceOntology([first, second])
  atomicWrite(root, "graph.json", graph)
  atomicWrite(root, "basis.json", {
    schema: "research-event-workflow/v1",
    ontology: { path: "graph.json", sha256: sha256(fs.readFileSync(path.join(root, "graph.json"))) },
  })
  const valid = await createSignal(root, vault, {
    id: "valid-same-source-day",
    time: "0800",
    eventIds: [first.article.event_id, second.article.event_id],
    eventId: first.article.event_id,
    eventDate: publishedDay,
    evidenceRun: first,
  })
  const validNote = parseNote(fs.readFileSync(path.join(vault, valid), "utf8"))
  assert.equal(validNote.meta.observations[0].event_date, publishedDay)
  const wrongDay = await createSignal(root, vault, {
    id: "wrong-source-day",
    time: "0801",
    eventIds: [first.article.event_id, second.article.event_id],
    eventId: first.article.event_id,
    eventDate: "2026-09-28",
    evidenceRun: first,
  })
  const wrongEvent = await createSignal(root, vault, {
    id: "wrong-event-binding",
    time: "0802",
    eventIds: [first.article.event_id, second.article.event_id],
    eventId: second.article.event_id,
    eventDate: publishedDay,
    evidenceRun: first,
  })

  const state = await syncKnowledgeWorkflow({
    root,
    vault,
    workflowId: "publication-precision",
    basisFile: "basis.json",
    maxItems: 16,
  })
  const taskFor = (relative) => state.tasks.find((row) => row.kind === "signal" && row.path === relative)
  const validTask = taskFor(valid)
  const wrongDayTask = taskFor(wrongDay)
  const wrongEventTask = taskFor(wrongEvent)
  assert.ok(validTask, "valid signal task exists")
  assert.ok(wrongDayTask, "wrong-day signal task exists")
  assert.ok(wrongEventTask, "wrong-event signal task exists")
  assert.equal(validTask.status, "ready", validTask.reason)
  assert.equal(validTask.approval_run, "review-valid-same-source-day")
  assert.equal(wrongDayTask.status, "blocked")
  assert.equal(wrongDayTask.reason, "signal_fact_event_or_date_mismatch")
  assert.equal(wrongEventTask.status, "blocked")
  assert.equal(wrongEventTask.reason, "signal_fact_event_or_date_mismatch")
  assert.equal(state.native_errors.length, 0)
  assert.equal(state.canonical_writes, 0)
  assert.equal(state.approvals_created, false)
  assert.equal(state.model_calls, 0)
  assert.equal(state.source_requests, 0)
})
