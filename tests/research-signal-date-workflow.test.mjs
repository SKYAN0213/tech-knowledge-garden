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
import {
  approveNoteReview,
  evaluateNoteReview,
  loadHistoricalNoteApproval,
} from "../scripts/research/note-review.mjs"
import {
  loadApprovedOntologyInput,
  projectEvidenceOntology,
} from "../scripts/research/ontology.mjs"
import { syncKnowledgeWorkflow } from "../scripts/research/knowledge-workflow.mjs"

// One source page reports two explicitly separate events. URL identity alone
// cannot authorize the second event's date for the first native event.
function nativeDateInputs(root, vault) {
  const url = "https://fixture.example/jiyi-and-workshop",
    body = "Jiyi introduced Z-1 on 2026-06-27. Workshop held its demonstration on 2026-06-26.",
    sid = sourceId(url),
    version = `${sid}:${sha256(body)}`
  return [
    ["jiyi", "Jiyi", "2026-06-27", sha256(url).slice(0, 16), "Jiyi, Z-1 로봇 공개"],
    ["workshop", "Workshop", "2026-06-26", "b".repeat(16), "Workshop, 시연 행사 개최"],
  ].map(([run, subject, occurred, eventId, title]) => {
    const pid = sha256("date-parse-" + run),
      quote = body.split(". ")[run === "jiyi" ? 0 : 1],
      claim_id = `${run}-fact`
    const doc = {
      source_id: sid,
      source_version_id: version,
      original_url: url,
      final_url: url,
      body_sha256: sha256(body),
      body_path: `documents/${run}.bin`,
      fetch_status: "captured",
      observed_at: "2026-06-29T00:00:00Z",
    }
    const parse = {
      schema_version: "source-parse/v1",
      source_id: sid,
      source_version_id: version,
      parse_id: pid,
      title,
      status: "extracted",
      dates: { published_at: "2026-06-28", observed_at: doc.observed_at },
      quality: { missing_pages: [] },
      blocks: [{ block_id: `${pid}:b1`, text: body, locator: { text_hash: sha256(body) } }],
    }
    const claims = recordFactReview(
      [
        {
          claim_id,
          statement: quote,
          claim_kind: "attributed_fact",
          subject,
          event_state: "reported",
          published_at: "2026-06-28",
          effective_period: occurred,
          numbers: [],
          evidence: [
            {
              source_id: sid,
              source_version_id: version,
              parse_id: pid,
              block_id: `${pid}:b1`,
              quote,
              support: "direct",
            },
          ],
        },
      ],
      [
        {
          claim_id,
          status: "verified",
          reason: "Read the exact event date in the fixture source",
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
    const draft = {
      title,
      lead: [
        { text: `${subject}은 ${occurred}에 행사를 진행했다.`, claim_ids: [claim_id] },
        { text: "공개 자료는 해당 행사의 날짜와 내용을 설명했다.", claim_ids: [claim_id] },
      ],
      facts: { who: subject, when: occurred, where: null, what: "행사 개최", how: null, why: null },
      sector: "AI",
      theme: "연구·기술",
      tags: ["새로운 방법"],
      entities: [subject],
      explanations: [],
    }
    const record = {
      draft_id: draftFingerprint(draft),
      draft,
      status: "editorial_review",
      problems: [],
      public_approved: false,
    }
    const review = {
      status: "approved",
      draft_id: record.draft_id,
      event_id: eventId,
      published_at: "2026-06-28",
      reviewed_at: "2026-06-29",
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
    atomicWrite(root, doc.body_path, body)
    atomicWrite(root, `parses/${pid}/parse.json`, parse)
    for (const [name, value] of [
      ["documents.json", [doc]],
      ["parses.json", [parse]],
      ["reviewed-claims.json", { claims }],
      ["draft.json", record],
      ["editorial-review.json", review],
      ["approved-article.json", approvedArticle(record, claims, [doc], review, [parse])],
    ])
      atomicWrite(root, `runs/${run}/${name}`, value)
    return loadApprovedOntologyInput(root, run, { vault })
  })
}

test("Jiyi legacy date migration and workflow guard", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "signal-date-workflow-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const vault = path.join(root, "vault"),
    inputs = nativeDateInputs(root, vault),
    eventId = inputs[0].article.event_id
  const evidence = (selected) =>
    selected.map((input) => ({ run_id: input.run, claim_ids: [input.claims[0].claim_id] }))
  const signalMeta = (time, eventDate) => ({
    schema_version: "tech-signals/v1",
    type: "trend-observations",
    edition: `Editions/2026/06/2026-06-28_${time}_Tech_AI_Briefing`,
    date: "2026-06-28",
    reviewed: "2026-06-29",
    review_basis: "primary-research",
    observations: [
      {
        id: "jiyi-" + time,
        topic_id: "robotics",
        event_id: eventId,
        event_date: eventDate,
        stance: "support",
        change: "Jiyi가 Z-1을 공개했다.",
        meaning: "새 로봇 공개 사례.",
        limit: "원문 범위에 한정.",
        next_check: "후속 발표 확인.",
      },
    ],
  })
  const put = (meta) => {
    const relative = `Signals/${meta.edition.split("/").at(-1)}.md`,
      content = noteText(meta, `[[${meta.edition}|수록 원고]]`)
    atomicWrite(vault, relative, content)
    atomicWrite(
      vault,
      meta.edition + ".md",
      noteText(
        {
          title: "Fixture",
          type: "briefing",
          scheduled_at: "2026-06-28T12:04:00+09:00",
          article_reviews: [{ event_id: eventId }],
        },
        "Fixture edition.",
      ),
    )
    return { relative, content }
  }
  const decision = (before, meta, selected) => ({
    schema: "knowledge-note-review/v2",
    reviewer: "Fixture reviewer",
    reviewed_at: "2026-06-30",
    reason: "Separate publication and actual event day using exact reviewed facts",
    source_read: true,
    final_prose_read: true,
    aliases_checked: true,
    connections_checked: true,
    histories_checked: true,
    notes: [
      {
        operation: "replace",
        path: before.relative,
        previous_sha256: sha256(before.content),
        content: noteText(meta, `[[${meta.edition}|수록 원고]]`),
        evidence: evidence(selected),
      },
    ],
  })
  const legacy = signalMeta("1204", "2026-06-27"),
    before = put(legacy),
    corrected = structuredClone(legacy)
  corrected.reviewed = "2026-06-30"
  corrected.observations[0].event_date = "2026-06-28"
  corrected.observations[0].occurred_at = "2026-06-27"
  const approvedDecision = decision(before, corrected, [inputs[0]])
  await approveNoteReview(root, "jiyi-corrected", approvedDecision, { vault })
  const preserved = loadHistoricalNoteApproval(root, "jiyi-corrected", { vault }).approval.notes[0]
  assert.equal(preserved.previous_sha256, sha256(before.content))
  assert.equal(parseNote(preserved.before_content).meta.observations[0].event_date, "2026-06-27")
  assert.equal(parseNote(preserved.content).meta.observations[0].event_date, "2026-06-28")
  assert.equal(parseNote(preserved.content).meta.observations[0].occurred_at, "2026-06-27")
  assert.equal(parseNote(preserved.content).meta.observations[0].event_id, eventId)

  const unsupported = structuredClone(approvedDecision)
  unsupported.notes[0].content = noteText(
    { ...corrected, observations: [{ ...corrected.observations[0], event_date: "2026-06-29" }] },
    `[[${corrected.edition}|수록 원고]]`,
  )
  assert.throws(
    () => evaluateNoteReview(root, unsupported, { vault }),
    /exact verified effective_period/,
  )
  const movedIdentity = structuredClone(approvedDecision)
  movedIdentity.notes[0].content = noteText(
    {
      ...corrected,
      observations: [{ ...corrected.observations[0], event_id: inputs[1].article.event_id }],
    },
    `[[${corrected.edition}|수록 원고]]`,
  )
  assert.throws(() => evaluateNoteReview(root, movedIdentity, { vault }), /event identity/)
  const explicitBefore = {
    ...legacy,
    observations: [{ ...legacy.observations[0], source_published_at: "2026-06-27" }],
  }
  atomicWrite(vault, before.relative, noteText(explicitBefore, `[[${legacy.edition}|수록 원고]]`))
  const explicitDecision = structuredClone(approvedDecision)
  explicitDecision.notes[0].previous_sha256 = sha256(
    fs.readFileSync(path.join(vault, before.relative)),
  )
  assert.throws(
    () => evaluateNoteReview(root, explicitDecision, { vault }),
    /source publication date must be retained/,
  )
  atomicWrite(vault, before.relative, preserved.content)

  // The older publication value is already correct here. A different native
  // event on the same URL supplies June 26; reject it before note approval.
  const oldOther = signalMeta("1604", "2026-06-28"),
    otherBefore = put(oldOther),
    wrong = structuredClone(oldOther)
  wrong.reviewed = "2026-06-30"
  wrong.observations[0].occurred_at = "2026-06-26"
  const wrongDecision = decision(otherBefore, wrong, inputs)
  await assert.rejects(
    approveNoteReview(root, "jiyi-wrong-event-date", wrongDecision, { vault }),
    /exact verified effective_period from the same event/,
  )
  assert.equal(
    fs.existsSync(path.join(root, "runs/jiyi-wrong-event-date/approved-notes.json")),
    false,
  )
  assert.equal(fs.readFileSync(path.join(vault, otherBefore.relative), "utf8"), otherBefore.content)
  const graph = projectEvidenceOntology(inputs)
  atomicWrite(root, "graph.json", graph)
  atomicWrite(root, "basis.json", {
    schema: "research-event-workflow/v1",
    ontology: {
      path: "graph.json",
      sha256: sha256(fs.readFileSync(path.join(root, "graph.json"))),
    },
  })
  const canonical = [before.relative, otherBefore.relative].map((relative) =>
    fs.readFileSync(path.join(vault, relative)),
  )
  const synced = await syncKnowledgeWorkflow({
    root,
    vault,
    workflowId: "signal-dates",
    basisFile: "basis.json",
    maxItems: 256,
  })
  const accepted = synced.tasks.find(
      (row) => row.path === before.relative && row.kind === "signal",
    ),
    unreviewed = synced.tasks.find(
      (row) => row.path === otherBefore.relative && row.kind === "signal",
    )
  assert.equal(accepted.status, "ready", accepted.reason)
  assert.equal(accepted.approval_run, "jiyi-corrected")
  assert.equal(unreviewed.status, "review_pending")
  assert.equal(unreviewed.reason, "current_note_review_required")
  assert.equal(synced.canonical_writes, 0)
  assert.equal(synced.approvals_created, false)
  assert.equal(synced.model_calls, 0)
  assert.equal(synced.source_requests, 0)
  for (const [i, relative] of [before.relative, otherBefore.relative].entries())
    assert.deepEqual(fs.readFileSync(path.join(vault, relative)), canonical[i])
})
