import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fixture, source } from "./fixtures/research-event-fixtures.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { validateEvidence } from "../scripts/research/claims.mjs"
import { draftFingerprint, draftProblems } from "../scripts/research/editor.mjs"
import { THEMES } from "../scripts/themes.mjs"
import { noteText } from "../scripts/garden.mjs"
import { inspectEditorialCompleteness } from "../scripts/research/editorial-completeness.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath } from "../scripts/research/run-state.mjs"
import { withRequestOwner } from "../scripts/research/request-ownership.mjs"
import { createReasoningTask, submitReasoningResult } from "../scripts/research/reasoning-tasks.mjs"
import { assertSelectedEventFactScope } from "../scripts/research/event-pipeline.mjs"
import { loadStoredSourceRun } from "../scripts/research/parser.mjs"
import { reviseDraftFromReview } from "../scripts/research/modules/validation.mjs"
import {
  reviewPacketPages,
  prepareCombinedReview,
  assertCombinedReviewSources,
  modelReviewPacket,
  projectCombinedEvidence,
  runCombinedReview,
  runCombinedDraftCorrection,
} from "../scripts/research/combined-review.mjs"
const aspects = [
  "fact",
  "numbers",
  "comparison_conditions",
  "availability",
  "plan_execution",
  "attribution",
]
function setup(t) {
  const f = fixture(t),
    item = source(f.root, 1, "review-source"),
    run = item.origin
  const claim = {
    schema: "research-claim/v1",
    claim_id: "original-claim",
    candidate_key: "source-" + item.document.source_id,
    subject: "Fixture Robotics",
    statement: item.parsed.blocks[0].text,
    claim_kind: "fact",
    event_state: "reported",
    published_at: "2026-09-27",
    effective_period: null,
    numbers: [],
    evidence: [
      {
        source_id: item.document.source_id,
        source_version_id: item.document.source_version_id,
        parse_id: item.parsed.parse_id,
        block_id: item.parsed.blocks[0].block_id,
        quote: item.parsed.blocks[0].text,
        support: "direct",
      },
    ],
  }
  claim.review = validateEvidence(claim, [item.parsed])
  atomicWrite(f.root, `runs/${run}/claims.json`, { claims: [claim] })
  return { ...f, run, claim }
}
async function submitOwnedFixtureResponse(f, request, value, suffix) {
  const job_id = "module-partial-evidence-" + suffix
  const ownerInput = { job_id, parameters: { run_id: f.run } }
  const owner = { job_id, input_sha256: sha256(JSON.stringify(ownerInput)) }
  atomicCreate(f.root, `module-jobs/${job_id}/input.json`, ownerInput)
  atomicCreate(f.root, `module-jobs/${job_id}/state.json`, {
    state: "running",
    input_sha256: owner.input_sha256,
  })
  const task = withRequestOwner(owner, () =>
    createReasoningTask(f.root, {
      run: f.run,
      role: "evidence_compare",
      binding: { settings: { model: "gpt-6-luna" } },
      input: { schema: request.schema },
    }),
  )
  atomicWrite(f.root, `module-jobs/${job_id}/state.json`, {
    state: "waiting_for_reasoning",
    input_sha256: owner.input_sha256,
    reasoning_task: { task_id: task.task_id, request_sha256: task.request_sha256 },
  })
  await submitReasoningResult(f.root, {
    task_id: task.task_id,
    request_sha256: task.request_sha256,
    output: value,
    executor: "codex",
    model: "gpt-6-luna",
  })
  assert.deepEqual(readJSON(f.root, `reasoning-tasks/${task.task_id}/result.json`).output, value)
}
function output(p, { replacement = false } = {}) {
  return {
    schema: "research-evidence-review-bundle/v1",
    input_sha256: p.input_sha256,
    read_manifest_sha256: p.manifest.sha256,
    part: 0,
    reviewer: "fixture-reviewer",
    reviewed_at: "2026-10-26",
    importance_reviewed_at: "2026-10-26",
    source_read: true,
    all_relevant_facts_checked: true,
    fact_review: {
      claims: p.packet.claims.map((c) => ({
        claim_id: c.claim_id,
        status: "verified",
        reason: "Compared with the complete fixture source",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
        ...(replacement ? { replacement: { statement: c.statement } } : {}),
      })),
      additions: [],
    },
    important_facts: p.packet.claims.map((c) => ({
      claim_ref: c.claim_id,
      important: true,
      reason: "The announced event is a core source fact",
      required_aspects: aspects,
    })),
  }
}

const fixtureMetadata = async (model) => ({
  model,
  digest: sha256("fixture-provider"),
  runtime: "fixture",
  capabilities: ["completion"],
  thinking: { values: [false, true, "medium", "high"] },
})
async function editorialSetup(
  t,
  { missingReference = false, claimCount = 3, nonImportantLast = false } = {},
) {
  const f = setup(t)
  f.ctx.vault = path.join(f.root, "vault")
  fs.mkdirSync(f.ctx.vault)
  const claims = Array.from({ length: claimCount }, (_, i) => ({
    ...structuredClone(f.claim),
    claim_id: "corroborating-claim-" + i,
  }))
  atomicWrite(f.root, `runs/${f.run}/claims.json`, { claims })
  await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "evidence" },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async (request) => {
          const input = JSON.parse(request.messages[1].content)
          const value = output(prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }))
          value.part = input.part
          value.fact_review.claims = value.fact_review.claims.filter((row) =>
            input.assigned_claim_ids.includes(row.claim_id),
          )
          value.important_facts = value.important_facts
            .filter((row) => input.assigned_claim_ids.includes(row.claim_ref))
            .map((row) =>
              nonImportantLast && row.claim_ref === claims.at(-1).claim_id
                ? { ...row, important: false }
                : row,
            )
          return { output: value }
        },
      },
    },
  )
  const ids = claims.map((c) => c.claim_id),
    linked = missingReference ? ids.slice(0, 2) : ids
  const draft = {
    title: "Fixture Robotics, Partner와 로봇 주문 발표",
    lead: [
      {
        text: "Fixture Robotics와 Partner는 2026년 9월 27일 Contract-123 로봇 주문을 발표했다.",
        claim_ids: linked,
      },
      { text: "이번 발표는 해당 계약의 주문 대상을 설명한다.", claim_ids: [ids[0]] },
    ],
    facts: {
      who: "Fixture Robotics와 Partner",
      when: "2026-09-27",
      where: null,
      what: "로봇 주문 발표",
      how: null,
      why: null,
    },
    sector: "로봇·제조",
    theme: "사업·고객",
    tags: ["수주·계약"],
    entities: ["Fixture Robotics", "Partner"],
    explanations: [
      {
        heading: "계약의 원문 범위",
        paragraphs: [
          {
            text: "원문에는 양사의 명칭과 계약 이름이 명시됐다. 다른 고객의 별도 일정은 이번 주문에 포함하지 않았다.",
            claim_ids: linked,
          },
        ],
      },
    ],
  }
  const record = {
    draft_id: draftFingerprint(draft),
    draft,
    status: "editorial_review",
    problems: [],
    public_approved: false,
    completeness_context: readJSON(f.root, `runs/${f.run}/editorial-completeness/context.json`),
  }
  atomicWrite(f.root, `runs/${f.run}/draft.json`, record)
  return { ...f, ids, record }
}
function editorialOutput(p) {
  const coverage = p.packet.completeness.coverage_template.coverage.map((row) => ({
    ...row,
    reason: "Direct fixture source and prose comparison",
    meaning_checked: true,
    preserved_aspects: aspects,
  }))
  return {
    schema: "research-editorial-review-bundle/v1",
    input_sha256: p.input_sha256,
    read_manifest_sha256: p.manifest.sha256,
    part: 0,
    reviewer: "fixture-independent-reader",
    reviewed_at: "2026-10-26",
    coverage_reviewed_at: "2026-10-26",
    source_read: true,
    all_relevant_facts_checked: true,
    editorial_review: {
      status: "approved",
      draft_id: p.packet.draft.draft_id,
      event_id: "abcdef0123456789",
      published_at: "2026-09-27",
      reviewed_at: "2026-10-26",
      region: "해외",
      reviewer: "fixture-independent-reader",
      source_read: true,
      final_prose_read: true,
      title_checked: true,
      dates_checked: true,
      numbers_checked: true,
      analysis_checked: true,
      concept_ids: [],
      reader_quality_review: { repetition_checked: true },
      concept_review: {
        schema: "article-concept-review/v2",
        outcome: "reviewed_none",
        reason: "No concept definitions exist in this isolated fixture",
        reviewer: "fixture-independent-reader",
        reviewed_at: "2026-10-26",
        article_source_read: true,
        concept_registry_read: true,
        aliases_checked: true,
        assignments: [],
      },
    },
    coverage,
    coverage_decisions: coverage.map((row) => ({
      claim_id: row.claim_id,
      decision: "preserved",
      reason: null,
    })),
  }
}

for (const variant of ["missing", "false"])
  test(`native editorial ${variant} checks are explicit in the schema and repaired without healthy fields`, async (t) => {
    const f = await editorialSetup(t),
      calls = []
    const result = await runCombinedReview(
      f.ctx,
      { run_id: f.run, kind: "editorial" },
      {
        baseProvider: {
          metadata: fixtureMetadata,
          structured: async (request) => {
            const input = JSON.parse(request.messages[1].content)
            calls.push(input)
            const p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
            const valid = editorialOutput(p)
            if (calls.length === 1) {
              const schema = request.schema.properties.editorial_review
              assert.ok(schema.then.required.includes("source_read"))
              assert.deepEqual(schema.properties.draft_id.enum, [p.packet.draft.draft_id])
              if (variant === "missing")
                valid.editorial_review = Object.fromEntries(
                  Object.entries(valid.editorial_review).filter(([k]) =>
                    ["status", "draft_id", "reviewer", "reviewed_at"].includes(k),
                  ),
                )
              else valid.editorial_review.numbers_checked = false
              return { output: valid }
            }
            const patch = request.schema.properties.editorial_review
            assert.ok(
              patch.required.includes(variant === "missing" ? "source_read" : "numbers_checked"),
            )
            assert.ok(
              !("draft_id" in patch.properties),
              "unchanged native draft binding is retained",
            )
            assert.ok(
              !("reviewer" in patch.properties),
              "valid reviewer judgment is not requested again",
            )
            return {
              output: {
                editorial_review: Object.fromEntries(
                  patch.required.map((k) => [k, valid.editorial_review[k]]),
                ),
              },
            }
          },
        },
      },
    )
    assert.equal(calls.length, 2)
    assert.equal(result.needs_revision, false)
    const p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(f.ctx.repo, result.coverage_review_file))).coverage,
      editorialOutput(p).coverage,
    )
  })

test("a negative editorial decision retains the historical minimal revision contract without approval fields", async (t) => {
  const f = await editorialSetup(t)
  let calls = 0
  const result = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async () => {
          calls++
          const output = editorialOutput(
            prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
          )
          output.editorial_review = {
            status: "needs_revision",
            draft_id: output.editorial_review.draft_id,
            reviewer: "fixture-independent-reader",
            reviewed_at: "2026-10-26",
            reason: "The source condition needs an explicit reader sentence",
          }
          output.coverage = []
          return { output }
        },
      },
    },
  )
  assert.equal(
    calls,
    1,
    "a correction finding must not invent approval checks or repeat healthy facts",
  )
  assert.equal(result.needs_revision, true)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("a later split coverage part can explicitly require revision without approving or repeating other decisions", async (t) => {
  const f = await editorialSetup(t, { claimCount: 15 }),
    calls = [],
    prepared = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
    finding =
      "The assigned source fact and its condition are missing from the cited reader paragraph"
  const result = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async (request) => {
          const input = JSON.parse(request.messages[1].content)
          calls.push(input)
          assert.equal(input.task, "combined_review", "valid parts must not be re-requested")
          const value = editorialOutput(
            prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
          )
          value.part = input.part
          if (input.part) value.editorial_review = null
          value.coverage = value.coverage.filter((row) =>
            input.assigned_claim_ids.includes(row.claim_id),
          )
          value.coverage_decisions = value.coverage_decisions
            .filter((row) => input.assigned_claim_ids.includes(row.claim_id))
            .map((row) => ({
              ...row,
              decision:
                input.part === 1 && row.claim_id === f.ids[12] ? "needs_revision" : "preserved",
              ...(input.part === 1 && row.claim_id === f.ids[12] ? { reason: finding } : {}),
            }))
          return { output: value }
        },
      },
    },
  )
  assert.deepEqual(
    calls.map((input) => input.part),
    [0, 1],
  )
  assert.equal(result.needs_revision, true)
  const editorial = JSON.parse(fs.readFileSync(path.join(f.ctx.repo, result.editorial_review_file)))
  assert.equal(editorial.status, "needs_revision")
  assert.match(editorial.reason, new RegExp(f.ids[12]))
  assert.ok(editorial.reason.includes(finding))
  const response = readJSON(f.root, result.response.path)
  assert.equal(
    response.outputs[1].coverage_decisions.find((row) => row.claim_id === f.ids[12]).decision,
    "needs_revision",
  )
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
  let writerCalls = 0
  await runCombinedDraftCorrection(
    f.ctx,
    {
      run_id: f.run,
      review_file: result.editorial_review_file,
      revision_evidence: result.revision_evidence,
    },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async (request) => {
          writerCalls++
          const input = JSON.parse(request.messages[1].content)
          const bytes = fs.readFileSync(input.revision_evidence.file)
          assert.equal(sha256(bytes), input.revision_evidence.sha256)
          const evidence = JSON.parse(bytes)
          const { response: origin, ...findingMapping } = evidence.coverage_decision_mapping.find(
            (row) => row.claim_id === f.ids[12],
          )
          assert.deepEqual(findingMapping, {
            part: 1,
            reviewer: response.outputs[1].reviewer,
            claim_id: f.ids[12],
            decision: "needs_revision",
            reason: finding,
          })
          assert.equal(sha256(fs.readFileSync(safePath(f.root, origin.path))), origin.sha256)
          assert.equal(
            readJSON(f.root, origin.path).output.coverage_decisions.find(
              (row) => row.claim_id === f.ids[12],
            ).reason,
            finding,
          )
          assert.deepEqual(readJSON(f.root, evidence.response.path).outputs, response.outputs)
          const draft = structuredClone(prepared.packet.draft.draft)
          draft.explanations[0].paragraphs[0].text += " 해당 조건은 원문 범위에 따른다."
          return {
            output: {
              reviewer: "fixture-writer",
              reviewed_at: "2026-10-26",
              reason: finding,
              draft,
            },
          }
        },
      },
    },
  )
  assert.equal(writerCalls, 1)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

async function revisedCoverageFixture(t, { changeLead = false } = {}) {
  const f = await editorialSetup(t, { claimCount: 15 })
  const draftRecord = structuredClone(f.record)
  draftRecord.draft.lead[0].claim_ids = f.ids.slice(0, 12)
  draftRecord.draft.explanations[0].paragraphs[0].claim_ids = f.ids.slice(12)
  draftRecord.draft_id = draftFingerprint(draftRecord.draft)
  atomicWrite(f.root, `runs/${f.run}/draft.json`, draftRecord)
  const prepared = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
  const first = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async (request) => {
          const input = JSON.parse(request.messages[1].content)
          const value = editorialOutput(prepared)
          value.part = input.part
          if (input.part) value.editorial_review = null
          value.coverage = value.coverage.filter((row) =>
            input.assigned_claim_ids.includes(row.claim_id),
          )
          value.coverage_decisions = value.coverage_decisions
            .filter((row) => input.assigned_claim_ids.includes(row.claim_id))
            .map((row) =>
              row.claim_id === f.ids[12]
                ? {
                    ...row,
                    decision: "needs_revision",
                    reason: "The explanation needs its source condition.",
                  }
                : row,
            )
          return { output: value }
        },
      },
    },
  )
  assert.equal(first.needs_revision, true)
  await runCombinedDraftCorrection(
    f.ctx,
    {
      run_id: f.run,
      review_file: first.editorial_review_file,
      revision_evidence: first.revision_evidence,
    },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async () => {
          const draft = structuredClone(prepared.packet.draft.draft)
          draft.explanations[0].paragraphs[0].text += " 해당 조건은 원문 범위에 따른다."
          if (changeLead)
            draft.lead[0].text = draft.lead[0].text.replace("로봇 주문을", "로봇 발주를")
          return {
            output: {
              reviewer: "fixture-writer",
              reviewed_at: "2026-10-26",
              reason: "The source condition is now explicit.",
              draft,
            },
          }
        },
      },
    },
  )
  return { f, prepared, first }
}

test("a correction reuses only unchanged, source-bound coverage while independently reviewing the changed draft", async (t) => {
  const { f } = await revisedCoverageFixture(t)
  const calls = []
  const second = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async (request) => {
          const input = JSON.parse(request.messages[1].content)
          calls.push(input)
          const current = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
          const value = editorialOutput(current)
          value.part = input.part
          if (input.part) value.editorial_review = null
          value.coverage = value.coverage.filter((row) =>
            input.assigned_claim_ids.includes(row.claim_id),
          )
          value.coverage_decisions = value.coverage_decisions.filter((row) =>
            input.assigned_claim_ids.includes(row.claim_id),
          )
          return { output: value }
        },
      },
    },
  )
  assert.equal(second.needs_revision, false)
  assert.deepEqual(
    calls.map((input) => input.assigned_claim_ids),
    [f.ids.slice(12)],
  )
  const current = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
  const applied = readJSON(f.root, current.base + "application.json")
  const reused = applied.coverage_decision_mapping.filter((row) => row.reused === true)
  assert.deepEqual(
    reused.map((row) => row.claim_id),
    f.ids.slice(0, 12),
  )
  for (const row of reused) {
    assert.equal(sha256(fs.readFileSync(safePath(f.root, row.response.path))), row.response.sha256)
    assert.equal(
      readJSON(f.root, row.response.path).output.coverage_decisions.find(
        (decision) => decision.claim_id === row.claim_id,
      ).decision,
      "preserved",
    )
  }
  const coverage = JSON.parse(fs.readFileSync(path.join(f.ctx.repo, second.coverage_review_file)))
  assert.equal(coverage.coverage.length, f.ids.length)
  assert.equal(coverage.draft_id, current.packet.draft.draft_id)
  const resumed = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async () => {
          throw Error("unexpected repeated model call")
        },
      },
    },
  )
  assert.equal(resumed.needs_revision, false)
  assert.deepEqual(resumed.response, second.response)

  const policy = fs.readFileSync(f.ctx.policy)
  const policyCalls = []
  try {
    fs.appendFileSync(f.ctx.policy, "\n")
    const changed = await runCombinedReview(
      f.ctx,
      { run_id: f.run, kind: "editorial" },
      {
        baseProvider: {
          metadata: fixtureMetadata,
          structured: async (request) => {
            const input = JSON.parse(request.messages[1].content)
            policyCalls.push(input)
            const value = editorialOutput(
              prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
            )
            value.part = input.part
            if (input.part) value.editorial_review = null
            value.coverage = value.coverage.filter((row) =>
              input.assigned_claim_ids.includes(row.claim_id),
            )
            value.coverage_decisions = value.coverage_decisions.filter((row) =>
              input.assigned_claim_ids.includes(row.claim_id),
            )
            return { output: value }
          },
        },
      },
    )
    assert.equal(changed.needs_revision, false)
    assert.deepEqual(
      policyCalls.map((input) => input.assigned_claim_ids),
      [f.ids.slice(0, 12), f.ids.slice(12)],
    )
  } finally {
    fs.writeFileSync(f.ctx.policy, policy)
  }

  const raw = readJSON(f.root, reused[0].response.path)
  raw.output.coverage[0].reason += " altered"
  atomicWrite(f.root, reused[0].response.path, raw)
  await assert.rejects(
    () =>
      runCombinedReview(
        f.ctx,
        { run_id: f.run, kind: "editorial" },
        {
          baseProvider: {
            metadata: fixtureMetadata,
            structured: async () => {
              throw Error("unexpected model call")
            },
          },
        },
      ),
    /Prior coverage model result changed/,
  )
})

test("a first-part revision retains independently valid positive coverage and rechecks only changed or invalid facts", async (t) => {
  const f = await editorialSetup(t, { claimCount: 15 })
  const record = structuredClone(f.record)
  record.draft.lead[0].claim_ids = f.ids.slice(0, 11)
  record.draft.explanations[0].paragraphs[0].claim_ids = f.ids.slice(11)
  record.draft_id = draftFingerprint(record.draft)
  atomicWrite(f.root, `runs/${f.run}/draft.json`, record)
  const prepared = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
  const first = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async (request) => {
          const input = JSON.parse(request.messages[1].content)
          const value = editorialOutput(prepared)
          value.editorial_review = {
            status: "needs_revision",
            draft_id: prepared.packet.draft.draft_id,
            reviewer: "fixture-independent-reader",
            reviewed_at: "2026-10-26",
            reason: "The explanation omits the comparison condition.",
          }
          value.coverage = value.coverage.filter((row) =>
            input.assigned_claim_ids.includes(row.claim_id),
          )
          value.coverage.find((row) => row.claim_id === f.ids[10]).preserved_aspects = ["fact"]
          value.coverage_decisions = value.coverage_decisions
            .filter((row) => input.assigned_claim_ids.includes(row.claim_id))
            .map((row) =>
              row.claim_id === f.ids[11]
                ? {
                    ...row,
                    decision: "needs_revision",
                    reason: "The comparison condition is missing.",
                  }
                : row,
            )
          return { output: value }
        },
      },
    },
  )
  assert.equal(first.needs_revision, true)
  const evidence = readJSON(f.root, first.revision_evidence.path)
  assert.deepEqual(
    evidence.coverage_decision_mapping.map((row) => row.claim_id),
    f.ids.slice(0, 10),
  )
  assert.ok(evidence.coverage_decision_mapping.every((row) => row.decision === "preserved"))
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
  await runCombinedDraftCorrection(
    f.ctx,
    {
      run_id: f.run,
      review_file: first.editorial_review_file,
      revision_evidence: first.revision_evidence,
    },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async () => {
          const draft = structuredClone(prepared.packet.draft.draft)
          draft.explanations[0].paragraphs[0].text += " 해당 비교 조건은 원문 범위에 따른다."
          return {
            output: {
              reviewer: "fixture-writer",
              reviewed_at: "2026-10-26",
              reason: "The comparison condition is explicit.",
              draft,
            },
          }
        },
      },
    },
  )
  const calls = []
  const second = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async (request) => {
          const input = JSON.parse(request.messages[1].content)
          calls.push(input)
          const value = editorialOutput(
            prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
          )
          value.part = input.part
          if (input.part) value.editorial_review = null
          value.coverage = value.coverage.filter((row) =>
            input.assigned_claim_ids.includes(row.claim_id),
          )
          value.coverage_decisions = value.coverage_decisions.filter((row) =>
            input.assigned_claim_ids.includes(row.claim_id),
          )
          return { output: value }
        },
      },
    },
  )
  assert.equal(second.needs_revision, false)
  assert.deepEqual(
    calls.map((input) => input.assigned_claim_ids),
    [f.ids.slice(10)],
  )
  const current = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
  const mapping = readJSON(f.root, current.base + "application.json").coverage_decision_mapping
  assert.deepEqual(
    mapping.filter((row) => row.reused === true).map((row) => row.claim_id),
    f.ids.slice(0, 10),
  )
})

async function allReusableCoverageFixture(t) {
  const f = await editorialSetup(t, { claimCount: 16, nonImportantLast: true })
  const draftRecord = structuredClone(f.record)
  draftRecord.draft.lead[0].claim_ids = f.ids.slice(0, 15)
  draftRecord.draft.explanations[0].paragraphs[0].claim_ids = [f.ids[15]]
  draftRecord.draft_id = draftFingerprint(draftRecord.draft)
  atomicWrite(f.root, `runs/${f.run}/draft.json`, draftRecord)
  const prepared = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      const value = editorialOutput(
        prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
      )
      value.part = input.part
      if (input.part) value.editorial_review = null
      value.coverage = value.coverage.filter((row) =>
        input.assigned_claim_ids.includes(row.claim_id),
      )
      value.coverage_decisions = value.coverage_decisions.filter((row) =>
        input.assigned_claim_ids.includes(row.claim_id),
      )
      return { output: value }
    },
  }
  const first = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    { baseProvider: provider },
  )
  assert.equal(first.needs_revision, false)
  await runCombinedDraftCorrection(
    f.ctx,
    {
      run_id: f.run,
      structural_validation: { findings: [{ code: "fixture_nonimportant_prose" }] },
    },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async () => {
          const draft = structuredClone(prepared.packet.draft.draft)
          draft.explanations[0].paragraphs[0].text += " 추가 설명은 원문에 따른다."
          return {
            output: {
              reviewer: "fixture-writer",
              reviewed_at: "2026-10-26",
              reason: "The additional explanation is clarified.",
              draft,
            },
          }
        },
      },
    },
  )
  return { f, provider }
}

test("a change outside all important-fact contexts still gets a fresh whole-draft decision", async (t) => {
  const { f, provider } = await allReusableCoverageFixture(t)
  const calls = []
  const result = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: {
        ...provider,
        structured: async (request) => {
          const input = JSON.parse(request.messages[1].content)
          calls.push(input)
          assert.equal(request.schema.properties.coverage.maxItems, 0)
          return provider.structured(request)
        },
      },
    },
  )
  assert.equal(result.needs_revision, false)
  assert.deepEqual(
    calls.map((input) => input.assigned_claim_ids),
    [[]],
  )
  const current = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
  const application = readJSON(f.root, current.base + "application.json")
  assert.equal(
    application.coverage_decision_mapping.filter((row) => row.reused === true).length,
    15,
  )
})

test("an empty assigned scope repairs extraneous judgments without replacing the whole-draft decision", async (t) => {
  const { f } = await allReusableCoverageFixture(t)
  const calls = []
  const result = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async (request) => {
          const input = JSON.parse(request.messages[1].content)
          calls.push(input.task === "combined_review" ? input.task : input.component)
          if (input.task === "combined_review") {
            assert.deepEqual(input.assigned_claim_ids, [])
            return {
              output: editorialOutput(
                prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
              ),
            }
          }
          assert.equal(input.component, "empty-coverage-scope-part-0")
          return { output: { coverage: [], coverage_decisions: [] } }
        },
      },
    },
  )
  assert.equal(result.needs_revision, false)
  assert.deepEqual(calls, ["combined_review", "empty-coverage-scope-part-0"])
  const current = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
  const application = readJSON(f.root, current.base + "application.json")
  assert.equal(
    application.coverage_decision_mapping.filter((row) => row.reused === true).length,
    15,
  )
  assert.equal(application.repairs.length, 1)
  assert.equal(
    readJSON(f.root, result.response.path).outputs[0].editorial_review.status,
    "approved",
  )
})

test("unresolved judgments outside an empty scope cannot create an approval", async (t) => {
  const { f } = await allReusableCoverageFixture(t)
  await assert.rejects(
    () =>
      runCombinedReview(
        f.ctx,
        { run_id: f.run, kind: "editorial" },
        {
          baseProvider: {
            metadata: fixtureMetadata,
            structured: async (request) => {
              const input = JSON.parse(request.messages[1].content)
              const value = editorialOutput(
                prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
              )
              if (input.task === "combined_review") return { output: value }
              return { output: { coverage: value.coverage.slice(0, 1), coverage_decisions: [] } }
            },
          },
        },
      ),
    /Unassigned coverage remains outside the empty scope/,
  )
  const current = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
  assert.equal(readJSON(f.root, current.base + "application.json"), null)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("a change to shared lead context invalidates all prior claim coverage", async (t) => {
  const { f } = await revisedCoverageFixture(t, { changeLead: true })
  const calls = []
  const result = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async (request) => {
          const input = JSON.parse(request.messages[1].content)
          calls.push(input)
          const value = editorialOutput(
            prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
          )
          value.part = input.part
          if (input.part) value.editorial_review = null
          value.coverage = value.coverage.filter((row) =>
            input.assigned_claim_ids.includes(row.claim_id),
          )
          value.coverage_decisions = value.coverage_decisions.filter((row) =>
            input.assigned_claim_ids.includes(row.claim_id),
          )
          return { output: value }
        },
      },
    },
  )
  assert.equal(result.needs_revision, false)
  assert.deepEqual(
    calls.map((input) => input.assigned_claim_ids),
    [f.ids.slice(0, 12), f.ids.slice(12)],
  )
  const current = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
  assert.deepEqual(readJSON(f.root, current.base + "coverage-reuse.json").judgments, [])
})

test("an empty reuse plan remains frozen when an earlier review appears after interruption", async (t) => {
  const { f, prepared } = await revisedCoverageFixture(t)
  const priorFile = safePath(f.root, prepared.base + "application.json")
  const heldFile = priorFile + ".held-for-fixture"
  fs.renameSync(priorFile, heldFile)
  try {
    await assert.rejects(
      () =>
        runCombinedReview(
          f.ctx,
          { run_id: f.run, kind: "editorial" },
          {
            baseProvider: {
              metadata: fixtureMetadata,
              prepareStructured: async () => {
                const error = Error("fixture interruption")
                error.code = "REASONING_PENDING"
                throw error
              },
              structured: async () => {
                throw Error("unexpected model call")
              },
            },
          },
        ),
      /fixture interruption/,
    )
  } finally {
    fs.renameSync(heldFile, priorFile)
  }
  const calls = []
  const result = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async (request) => {
          const input = JSON.parse(request.messages[1].content)
          calls.push(input)
          const value = editorialOutput(
            prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
          )
          value.part = input.part
          if (input.part) value.editorial_review = null
          value.coverage = value.coverage.filter((row) =>
            input.assigned_claim_ids.includes(row.claim_id),
          )
          value.coverage_decisions = value.coverage_decisions.filter((row) =>
            input.assigned_claim_ids.includes(row.claim_id),
          )
          return { output: value }
        },
      },
    },
  )
  assert.equal(result.needs_revision, false)
  assert.deepEqual(
    calls.map((input) => input.assigned_claim_ids),
    [f.ids.slice(0, 12), f.ids.slice(12)],
  )
})

test("unchanged coverage stays bound to its original response across successive corrections", async (t) => {
  const { f, first } = await revisedCoverageFixture(t)
  const prior = readJSON(f.root, first.revision_evidence.path)
  const original = prior.coverage_decision_mapping.find((row) => row.claim_id === f.ids[0]).response
  const intermediate = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async (request) => {
          const input = JSON.parse(request.messages[1].content)
          const value = editorialOutput(
            prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
          )
          value.coverage = value.coverage.filter((row) =>
            input.assigned_claim_ids.includes(row.claim_id),
          )
          value.coverage_decisions = value.coverage_decisions.filter((row) =>
            input.assigned_claim_ids.includes(row.claim_id),
          )
          value.editorial_review = {
            status: "needs_revision",
            draft_id: value.editorial_review.draft_id,
            reviewer: "fixture-independent-reader",
            reviewed_at: "2026-10-26",
            reason: "The same explanation needs one further source condition.",
          }
          return { output: value }
        },
      },
    },
  )
  assert.equal(intermediate.needs_revision, true)
  const middle = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
  await runCombinedDraftCorrection(
    f.ctx,
    {
      run_id: f.run,
      review_file: intermediate.editorial_review_file,
      revision_evidence: intermediate.revision_evidence,
    },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async () => {
          const draft = structuredClone(middle.packet.draft.draft)
          draft.explanations[0].paragraphs[0].text += " 발표 범위도 함께 확인했다."
          return {
            output: {
              reviewer: "fixture-writer",
              reviewed_at: "2026-10-26",
              reason: "The remaining condition is explicit.",
              draft,
            },
          }
        },
      },
    },
  )
  const calls = []
  const final = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async (request) => {
          const input = JSON.parse(request.messages[1].content)
          calls.push(input)
          const value = editorialOutput(
            prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
          )
          value.coverage = value.coverage.filter((row) =>
            input.assigned_claim_ids.includes(row.claim_id),
          )
          value.coverage_decisions = value.coverage_decisions.filter((row) =>
            input.assigned_claim_ids.includes(row.claim_id),
          )
          return { output: value }
        },
      },
    },
  )
  assert.equal(final.needs_revision, false)
  assert.deepEqual(
    calls.map((input) => input.assigned_claim_ids),
    [f.ids.slice(12)],
  )
  const current = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
  const app = readJSON(f.root, current.base + "application.json")
  const reused = app.coverage_decision_mapping.filter((row) => row.reused === true)
  assert.equal(reused.length, 12)
  assert.deepEqual(reused.find((row) => row.claim_id === f.ids[0]).response, original)
})

test("changed prior evidence during a model call blocks application of reused coverage", async (t) => {
  const { f, first } = await revisedCoverageFixture(t)
  const prior = readJSON(f.root, first.revision_evidence.path)
  const rawRef = prior.coverage_decision_mapping.find((row) => row.claim_id === f.ids[0]).response
  await assert.rejects(
    () =>
      runCombinedReview(
        f.ctx,
        { run_id: f.run, kind: "editorial" },
        {
          baseProvider: {
            metadata: fixtureMetadata,
            structured: async (request) => {
              const input = JSON.parse(request.messages[1].content)
              const value = editorialOutput(
                prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
              )
              value.coverage = value.coverage.filter((row) =>
                input.assigned_claim_ids.includes(row.claim_id),
              )
              value.coverage_decisions = value.coverage_decisions.filter((row) =>
                input.assigned_claim_ids.includes(row.claim_id),
              )
              const raw = readJSON(f.root, rawRef.path)
              raw.output.coverage[0].reason += " altered during the current review"
              atomicWrite(f.root, rawRef.path, raw)
              return { output: value }
            },
          },
        },
      ),
    /Prior coverage model result changed/,
  )
  const current = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
  assert.equal(readJSON(f.root, current.base + "editorial-review.json"), null)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("a missing coverage decision repairs only its claim and retains the other model judgments", async (t) => {
  const f = await editorialSetup(t),
    calls = []
  const result = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async (request) => {
          const input = JSON.parse(request.messages[1].content)
          calls.push(input)
          const value = editorialOutput(
            prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
          )
          if (input.task === "combined_review") {
            value.coverage_decisions = value.coverage_decisions.filter(
              (row) => row.claim_id !== f.ids[1],
            )
            return { output: value }
          }
          assert.equal(input.component, "coverage-decisions-part-0")
          assert.deepEqual(input.assigned_claim_ids, [f.ids[1]])
          return {
            output: {
              coverage_decisions: value.coverage_decisions.filter(
                (row) => row.claim_id === f.ids[1],
              ),
            },
          }
        },
      },
    },
  )
  assert.equal(calls.length, 2)
  assert.equal(result.needs_revision, false)
  const application = readJSON(
    f.root,
    prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }).base + "application.json",
  )
  assert.deepEqual(
    application.coverage_decision_mapping.map((row) => row.claim_id),
    f.ids,
  )
  assert.ok(application.repairs.length)
  const healthy = application.coverage_decision_mapping.find((row) => row.claim_id === f.ids[0])
  const repaired = application.coverage_decision_mapping.find((row) => row.claim_id === f.ids[1])
  assert.notEqual(healthy.response.path, repaired.response.path)
  assert.equal(
    sha256(fs.readFileSync(safePath(f.root, repaired.response.path))),
    repaired.response.sha256,
  )
  assert.equal(
    readJSON(f.root, repaired.response.path).output.coverage_decisions[0].claim_id,
    f.ids[1],
  )
})

test("the owned reasoning transport preserves a malformed individual decision for targeted repair", async (t) => {
  const f = await editorialSetup(t),
    calls = [],
    job_id = "module-partial-coverage-transport",
    ownerInput = { job_id, parameters: { run_id: f.run } },
    owner = { job_id, input_sha256: sha256(JSON.stringify(ownerInput)) }
  atomicCreate(f.root, `module-jobs/${job_id}/input.json`, ownerInput)
  atomicCreate(f.root, `module-jobs/${job_id}/state.json`, {
    state: "running",
    input_sha256: owner.input_sha256,
  })
  const result = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async (request) => {
          const input = JSON.parse(request.messages[1].content)
          calls.push(input)
          const value = editorialOutput(
            prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
          )
          if (input.task === "combined_review") {
            assert.deepEqual(input.native_coverage_decision_schema.items.required, [
              "claim_id",
              "decision",
              "reason",
            ])
            delete value.coverage_decisions[1].reason
            const task = withRequestOwner(owner, () =>
              createReasoningTask(f.root, {
                run: f.run,
                role: "evidence_compare",
                binding: { settings: { model: "gpt-6-luna" } },
                input: { schema: request.schema },
              }),
            )
            atomicWrite(f.root, `module-jobs/${job_id}/state.json`, {
              state: "waiting_for_reasoning",
              input_sha256: owner.input_sha256,
              reasoning_task: { task_id: task.task_id, request_sha256: task.request_sha256 },
            })
            const submission = {
              task_id: task.task_id,
              request_sha256: task.request_sha256,
              output: value,
              executor: "codex",
              model: "gpt-6-luna",
            }
            await assert.rejects(
              submitReasoningResult(f.root, { ...submission, request_sha256: "0".repeat(64) }),
              /hash changed/,
            )
            await assert.rejects(
              submitReasoningResult(f.root, { ...submission, model: "different-model" }),
              /executor model/,
            )
            const stored = await submitReasoningResult(f.root, submission)
            assert.equal(stored.status, "completed")
            assert.deepEqual(
              readJSON(f.root, `reasoning-tasks/${task.task_id}/result.json`).output,
              value,
            )
            return { output: value }
          }
          assert.equal(input.component, "coverage-decisions-part-0")
          assert.deepEqual(input.assigned_claim_ids, [f.ids[1]])
          return {
            output: {
              coverage_decisions: value.coverage_decisions.filter(
                (row) => row.claim_id === f.ids[1],
              ),
            },
          }
        },
      },
    },
  )
  assert.equal(calls.length, 2)
  assert.equal(result.needs_revision, false)
  const application = readJSON(
    f.root,
    prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }).base + "application.json",
  )
  assert.deepEqual(
    application.coverage_decision_mapping.map((row) => row.claim_id),
    f.ids,
  )
  assert.ok(application.repairs.length)
})

test("a coverage decision outside the assigned article scope cannot authorize approval", async (t) => {
  const f = await editorialSetup(t)
  await assert.rejects(
    runCombinedReview(
      f.ctx,
      { run_id: f.run, kind: "editorial" },
      {
        baseProvider: {
          metadata: fixtureMetadata,
          structured: async () => {
            const value = editorialOutput(
              prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
            )
            value.coverage_decisions[0].claim_id = "other-article-claim"
            return { output: value }
          },
        },
      },
    ),
    /escaped its assigned claim scope/,
  )
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("an unbound coverage decision cannot be silently dropped from an otherwise complete review", async (t) => {
  const f = await editorialSetup(t)
  await assert.rejects(
    runCombinedReview(
      f.ctx,
      { run_id: f.run, kind: "editorial" },
      {
        baseProvider: {
          metadata: fixtureMetadata,
          structured: async () => {
            const value = editorialOutput(
              prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
            )
            value.coverage_decisions.push({
              decision: "needs_revision",
              reason: "An unattributed omission was detected",
            })
            return { output: value }
          },
        },
      },
    ),
    /unbound/,
  )
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("a first-part rejection preserves raw unvalidated decisions without presenting them as mapped findings", async (t) => {
  const f = await editorialSetup(t)
  const result = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async () => {
          const value = editorialOutput(
            prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
          )
          value.editorial_review = {
            status: "needs_revision",
            draft_id: value.editorial_review.draft_id,
            reviewer: "fixture-independent-reader",
            reviewed_at: "2026-10-26",
            reason: "The original article needs a source-backed correction",
          }
          value.coverage_decisions.push({
            claim_id: "other-article-claim",
            decision: "needs_revision",
            reason: "Unvalidated detail",
          })
          return { output: value }
        },
      },
    },
  )
  assert.equal(result.needs_revision, true)
  const evidence = readJSON(f.root, result.revision_evidence.path)
  assert.deepEqual(evidence.coverage_decision_mapping, [])
  assert.equal(
    readJSON(f.root, evidence.response.path).outputs[0].coverage_decisions.at(-1).claim_id,
    "other-article-claim",
  )
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("a revision decision without a concrete reason repairs only the affected claim", async (t) => {
  const f = await editorialSetup(t),
    calls = []
  const result = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async (request) => {
          const input = JSON.parse(request.messages[1].content)
          calls.push(input)
          const value = editorialOutput(
            prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
          )
          if (input.task === "combined_review") {
            value.coverage_decisions[1] = {
              claim_id: f.ids[1],
              decision: "needs_revision",
              reason: null,
            }
            return { output: value }
          }
          assert.equal(input.component, "coverage-decisions-part-0")
          assert.deepEqual(input.assigned_claim_ids, [f.ids[1]])
          return {
            output: {
              coverage_decisions: [
                {
                  claim_id: f.ids[1],
                  decision: "needs_revision",
                  reason: "The original condition is absent from the cited paragraph",
                },
              ],
            },
          }
        },
      },
    },
  )
  assert.equal(calls.length, 2)
  assert.equal(result.needs_revision, true)
  const application = readJSON(
    f.root,
    prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }).base + "application.json",
  )
  const repaired = application.coverage_decision_mapping.find((row) => row.claim_id === f.ids[1])
  assert.equal(repaired.decision, "needs_revision")
  assert.equal(
    readJSON(f.root, repaired.response.path).output.coverage_decisions[0].reason,
    "The original condition is absent from the cited paragraph",
  )
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("a future time on a later revision finding stays bound to the original response after resume", async (t) => {
  const f = await editorialSetup(t, { claimCount: 15 }),
    future = Date.now() + 60_000,
    calls = []
  let pending = true
  const provider = {
    metadata: fixtureMetadata,
    prepareStructured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      if (input.component === "coverage-finding-date-1-0" && pending) {
        pending = false
        const error = Error("Waiting for the explicit finding review time")
        error.code = "REASONING_PENDING"
        throw error
      }
    },
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input.component || `${input.task}-${input.part}`)
      if (input.task === "combined_review") {
        const value = editorialOutput(
          prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
        )
        value.part = input.part
        if (input.part) value.editorial_review = null
        value.coverage = value.coverage.filter((row) =>
          input.assigned_claim_ids.includes(row.claim_id),
        )
        value.coverage_decisions = value.coverage_decisions.filter((row) =>
          input.assigned_claim_ids.includes(row.claim_id),
        )
        if (input.part === 1) {
          value.reviewed_at = new Date(future).toISOString()
          value.coverage_decisions[0] = {
            ...value.coverage_decisions[0],
            decision: "needs_revision",
            reason: "The source condition must be restored in the reader paragraph",
          }
        }
        return { output: value }
      }
      assert.equal(input.component, "coverage-finding-date-1-0")
      return { output: { reviewed_at: "2026-10-26" } }
    },
  }
  await assert.rejects(
    runCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }, { baseProvider: provider }),
    (error) => error.code === "REASONING_PENDING",
  )
  const originalNow = Date.now
  Date.now = () => future + 1_000
  try {
    const result = await runCombinedReview(
      f.ctx,
      { run_id: f.run, kind: "editorial" },
      { baseProvider: provider },
    )
    assert.equal(result.needs_revision, true)
    const review = JSON.parse(fs.readFileSync(path.join(f.ctx.repo, result.editorial_review_file)))
    assert.equal(review.reviewed_at, "2026-10-26")
    assert.match(review.reason, /source condition must be restored/)
  } finally {
    Date.now = originalNow
  }
  assert.deepEqual(calls, ["combined_review-0", "combined_review-1", "coverage-finding-date-1-0"])
})

async function disputedEditorialFixture(t, { claimCount = 3 } = {}) {
  const f = await editorialSetup(t, { claimCount })
  const p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
  const negative = editorialOutput(p)
  negative.coverage = negative.coverage.slice(0, 12)
  negative.coverage_decisions = negative.coverage_decisions.slice(0, 12)
  negative.editorial_review = {
    status: "needs_revision",
    draft_id: p.packet.draft.draft_id,
    reviewer: "fixture-independent-reader",
    reviewed_at: "2026-10-26",
    reason: "Add an unrelated supplier capacity forecast from a different article",
  }
  const original = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: { metadata: fixtureMetadata, structured: async () => ({ output: negative }) },
    },
  )
  const decision = {
    reviewer: "fixture-writer",
    reviewed_at: "2026-10-26",
    reason: "No source-backed prose change is justified by this unrelated finding",
    draft: structuredClone(p.packet.draft.draft),
    review_dispute: {
      schema: "research-editorial-review-dispute/v1",
      input_sha256: p.input_sha256,
      draft_id: p.packet.draft.draft_id,
      editorial_review_sha256: sha256(
        fs.readFileSync(path.join(f.ctx.repo, original.editorial_review_file)),
      ),
      source_read: true,
      final_prose_read: true,
      reason:
        "The bound source concerns a robot order; it contains no supplier capacity forecast. The current prose already preserves its stated contract conditions.",
    },
  }
  return { ...f, p, original, decision }
}
const disputeCorrection = (f, decision = f.decision) =>
  runCombinedDraftCorrection(
    f.ctx,
    {
      run_id: f.run,
      review_file: f.original.editorial_review_file,
      revision_evidence: f.original.revision_evidence,
    },
    { baseProvider: { metadata: fixtureMetadata, structured: async () => ({ output: decision }) } },
  )

test("a changed mapped raw review result blocks correction before a model call", async (t) => {
  const f = await disputedEditorialFixture(t)
  const evidence = readJSON(f.root, f.original.revision_evidence.path)
  assert.ok(evidence.coverage_decision_mapping.length > 0)
  const reference = evidence.coverage_decision_mapping[0].response
  const raw = readJSON(f.root, reference.path)
  raw.output.coverage[0].reason += " altered"
  atomicWrite(f.root, reference.path, raw)
  const originalDraft = fs.readFileSync(safePath(f.root, `runs/${f.run}/draft.json`))
  let calls = 0
  await assert.rejects(
    () =>
      runCombinedDraftCorrection(
        f.ctx,
        {
          run_id: f.run,
          review_file: f.original.editorial_review_file,
          revision_evidence: f.original.revision_evidence,
        },
        {
          baseProvider: {
            metadata: fixtureMetadata,
            structured: async () => {
              calls++
              return { output: f.decision }
            },
          },
        },
      ),
    /Editorial revision evidence input or findings changed/,
  )
  assert.equal(calls, 0)
  assert.deepEqual(fs.readFileSync(safePath(f.root, `runs/${f.run}/draft.json`)), originalDraft)
})

test("a mapped raw review result changed during correction cannot be applied", async (t) => {
  const f = await disputedEditorialFixture(t)
  const evidence = readJSON(f.root, f.original.revision_evidence.path)
  const reference = evidence.coverage_decision_mapping[0].response
  const originalDraft = fs.readFileSync(safePath(f.root, `runs/${f.run}/draft.json`))
  await assert.rejects(
    () =>
      runCombinedDraftCorrection(
        f.ctx,
        {
          run_id: f.run,
          review_file: f.original.editorial_review_file,
          revision_evidence: f.original.revision_evidence,
        },
        {
          baseProvider: {
            metadata: fixtureMetadata,
            structured: async () => {
              const raw = readJSON(f.root, reference.path)
              raw.output.coverage[0].reason += " altered during correction"
              atomicWrite(f.root, reference.path, raw)
              return { output: f.decision }
            },
          },
        },
      ),
    /Editorial revision evidence input or findings changed/,
  )
  assert.deepEqual(fs.readFileSync(safePath(f.root, `runs/${f.run}/draft.json`)), originalDraft)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("a saved explicit revision finding can resume correction without granting approval", async (t) => {
  const f = await disputedEditorialFixture(t)
  const original = fs.readFileSync(safePath(f.root, `runs/${f.run}/draft.json`))
  const p = {
    run_id: f.run,
    review_file: f.original.editorial_review_file,
    revision_evidence_path: f.original.revision_evidence.path,
    revision_evidence_sha256: f.original.revision_evidence.sha256,
  }
  const provider = { metadata: fixtureMetadata, structured: async () => ({ output: f.decision }) }
  await assert.rejects(
    reviseDraftFromReview(
      f.ctx,
      { ...p, revision_evidence_sha256: "a".repeat(64) },
      { baseProvider: provider },
    ),
    /revision evidence SHA/,
  )
  const wrongReview = atomicWrite(f.root, "wrong-draft-review.json", {
    status: "needs_revision",
    draft_id: "wrong",
    reviewer: "independent",
    reviewed_at: "2026-10-26",
    reason: "A source condition needs a correction",
  })
  await assert.rejects(
    reviseDraftFromReview(
      f.ctx,
      { ...p, review_file: path.relative(f.ctx.repo, safePath(f.root, wrongReview.path)) },
      { baseProvider: provider },
    ),
    /Exact unpublished draft/,
  )
  const result = await reviseDraftFromReview(f.ctx, p, { baseProvider: provider })
  assert.equal(result.status, "review_disputed")
  assert.equal(result.candidate_published, false)
  assert.deepEqual(fs.readFileSync(safePath(f.root, `runs/${f.run}/draft.json`)), original)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("a future correction time is explicitly repaired on re-entry even after the clock passes it", async (t) => {
  const f = await disputedEditorialFixture(t)
  const original = fs.readFileSync(safePath(f.root, `runs/${f.run}/draft.json`))
  const future = Date.now() + 60_000
  const correction = {
    reviewer: "fixture-writer",
    reviewed_at: new Date(future).toISOString(),
    reason: "Correct the explicitly identified metadata while retaining the supported prose",
    draft: structuredClone(f.p.packet.draft.draft),
  }
  correction.draft.entities = ["Fixture Robotics"]
  const calls = []
  let pending = true
  const provider = {
    metadata: fixtureMetadata,
    prepareStructured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      if (input.task === "combined_review_correction_time_repair" && pending) {
        pending = false
        calls.push(input.task)
        const error = Error("Waiting for the explicit time-only model response")
        error.code = "REASONING_PENDING"
        throw error
      }
    },
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input.task)
      if (input.task === "combined_review_correction") return { output: correction }
      assert.equal(input.task, "combined_review_correction_time_repair")
      assert.equal(input.invalid_reviewed_at, correction.reviewed_at)
      assert.match(input.validation_error, /future/)
      return {
        output: {
          schema: "research-correction-time-repair/v1",
          input_sha256: input.input_sha256,
          original_output_sha256: input.original_output_sha256,
          reviewed_at: "2026-10-26",
          reviewer: "fixture-time-reader",
          reason: "The actual review occurred on the stated verified day",
        },
      }
    },
  }
  const parameters = {
    run_id: f.run,
    review_file: f.original.editorial_review_file,
    revision_evidence: f.original.revision_evidence,
  }
  await assert.rejects(
    runCombinedDraftCorrection(f.ctx, parameters, { baseProvider: provider }),
    (error) => error.code === "REASONING_PENDING",
  )
  assert.deepEqual(fs.readFileSync(safePath(f.root, `runs/${f.run}/draft.json`)), original)
  const fixRun = fs
    .readdirSync(safePath(f.root, "runs"))
    .find((name) => name.startsWith("bundle-fix-"))
  const marker = readJSON(f.root, `runs/${fixRun}/correction-time-repair-required.json`)
  assert.equal(marker.invalid_reviewed_at, correction.reviewed_at)
  assert.equal(readJSON(f.root, `runs/${fixRun}/correction-decision.json`), null)
  const originalOutput = fs.readFileSync(safePath(f.root, marker.original_output.path))
  fs.writeFileSync(safePath(f.root, marker.original_output.path), "{}")
  await assert.rejects(
    runCombinedDraftCorrection(f.ctx, parameters, { baseProvider: provider }),
    /Correction time repair binding changed/,
  )
  fs.writeFileSync(safePath(f.root, marker.original_output.path), originalOutput)
  const originalNow = Date.now
  Date.now = () => future + 1000
  try {
    await runCombinedDraftCorrection(f.ctx, parameters, { baseProvider: provider })
  } finally {
    Date.now = originalNow
  }
  assert.deepEqual(calls, [
    "combined_review_correction",
    "combined_review_correction_time_repair",
    "combined_review_correction_time_repair",
  ])
  assert.equal(
    readJSON(f.root, `runs/${fixRun}/correction.json`).output.reviewed_at,
    correction.reviewed_at,
  )
  const receipt = readJSON(f.root, `runs/${fixRun}/correction-time-repair-receipt.json`)
  assert.equal(receipt.reviewed_at, "2026-10-26")
  assert.equal(receipt.draft_or_factual_decisions_changed, false)
  assert.deepEqual(
    readJSON(f.root, `runs/${f.run}/draft.json`).draft.entities,
    correction.draft.entities,
  )
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("invalid correction-time repairs remain bounded and never apply the draft", async (t) => {
  const f = await disputedEditorialFixture(t)
  const before = fs.readFileSync(safePath(f.root, `runs/${f.run}/draft.json`))
  const future = new Date(Date.now() + 3_600_000).toISOString()
  const correction = {
    reviewer: "fixture-writer",
    reviewed_at: future,
    reason: "Correct the requested metadata only",
    draft: structuredClone(f.p.packet.draft.draft),
  }
  correction.draft.entities = ["Fixture Robotics"]
  let calls = 0
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      calls++
      const input = JSON.parse(request.messages[1].content)
      if (input.task === "combined_review_correction") return { output: correction }
      assert.equal(input.task, "combined_review_correction_time_repair")
      return {
        output: {
          schema: "research-correction-time-repair/v1",
          input_sha256: input.input_sha256,
          original_output_sha256: input.original_output_sha256,
          reviewed_at: future,
          reviewer: "fixture-time-reader",
          reason: "Intentionally invalid time to test the bounded recovery",
        },
      }
    },
  }
  const parameters = {
    run_id: f.run,
    review_file: f.original.editorial_review_file,
    revision_evidence: f.original.revision_evidence,
  }
  for (let entry = 0; entry < 2; entry++)
    await assert.rejects(
      runCombinedDraftCorrection(f.ctx, parameters, { baseProvider: provider }),
      (error) => error.code === "CORRECTION_TIME_REPAIR_EXHAUSTED",
    )
  assert.equal(calls, 3, "completed invalid responses are preserved rather than regenerated")
  assert.deepEqual(fs.readFileSync(safePath(f.root, `runs/${f.run}/draft.json`)), before)
  const fixRun = fs
    .readdirSync(safePath(f.root, "runs"))
    .find((name) => name.startsWith("bundle-fix-"))
  assert.equal(readJSON(f.root, `runs/${fixRun}/correction-decision.json`), null)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("a later retry cannot validate a review time after its recorded model completion", async (t) => {
  const f = await disputedEditorialFixture(t)
  const originalNow = Date.now
  const future = originalNow() + 60_000
  const correction = {
    reviewer: "fixture-writer",
    reviewed_at: new Date(future).toISOString(),
    reason: "Correct the requested metadata only",
    draft: structuredClone(f.p.packet.draft.draft),
  }
  correction.draft.entities = ["Fixture Robotics"]
  const calls = []
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input.task)
      if (input.task === "combined_review_correction") {
        // Simulate a delayed consumer: by validation the wall clock has passed
        // the model's false timestamp, but the stage finished before it.
        Date.now = () => future + 1000
        return { output: correction }
      }
      assert.equal(input.task, "combined_review_correction_time_repair")
      assert.match(input.validation_error, /recorded model result/)
      return {
        output: {
          schema: "research-correction-time-repair/v1",
          input_sha256: input.input_sha256,
          original_output_sha256: input.original_output_sha256,
          reviewed_at: "2026-10-26",
          reviewer: "fixture-time-reader",
          reason: "The correction was reviewed on the recorded day",
        },
      }
    },
  }
  try {
    await runCombinedDraftCorrection(
      f.ctx,
      {
        run_id: f.run,
        review_file: f.original.editorial_review_file,
        revision_evidence: f.original.revision_evidence,
      },
      { baseProvider: provider },
    )
  } finally {
    Date.now = originalNow
  }
  assert.deepEqual(calls, ["combined_review_correction", "combined_review_correction_time_repair"])
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("delegated correction time is bounded by the verified native result submission", async (t) => {
  const f = await disputedEditorialFixture(t)
  const originalNow = Date.now
  const future = originalNow() + 60_000
  const correction = {
    reviewer: "fixture-writer",
    reviewed_at: new Date(future).toISOString(),
    reason: "Correct the requested metadata only",
    draft: structuredClone(f.p.packet.draft.draft),
  }
  correction.draft.entities = ["Fixture Robotics"]
  const job_id = "module-time-origin"
  const ownerInput = { job_id, parameters: { run_id: f.run } }
  const owner = { job_id, input_sha256: sha256(JSON.stringify(ownerInput)) }
  atomicCreate(f.root, `module-jobs/${job_id}/input.json`, ownerInput)
  atomicCreate(f.root, `module-jobs/${job_id}/state.json`, {
    state: "running",
    input_sha256: owner.input_sha256,
  })
  const task = withRequestOwner(owner, () =>
    createReasoningTask(f.root, {
      run: f.run,
      role: "article_write",
      binding: { settings: { model: "gpt-6-luna" } },
      input: { schema: { type: "object" } },
    }),
  )
  atomicWrite(f.root, `module-jobs/${job_id}/state.json`, {
    state: "waiting_for_reasoning",
    input_sha256: owner.input_sha256,
    reasoning_task: { task_id: task.task_id, request_sha256: task.request_sha256 },
  })
  await submitReasoningResult(f.root, {
    task_id: task.task_id,
    request_sha256: task.request_sha256,
    output: correction,
    executor: "codex",
    model: "gpt-6-luna",
  })
  const submitted = readJSON(f.root, `reasoning-tasks/${task.task_id}/result.json`)
  const calls = []
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input.task)
      if (input.task === "combined_review_correction") {
        Date.now = () => future + 1000
        return {
          output: correction,
          provenance: {
            task_id: task.task_id,
            request_sha256: task.request_sha256,
            result_sha256: submitted.result_sha256,
          },
        }
      }
      assert.equal(input.task, "combined_review_correction_time_repair")
      assert.match(input.validation_error, /recorded model result/)
      return {
        output: {
          schema: "research-correction-time-repair/v1",
          input_sha256: input.input_sha256,
          original_output_sha256: input.original_output_sha256,
          reviewed_at: "2026-10-26",
          reviewer: "fixture-time-reader",
          reason: "The review occurred on its recorded day",
        },
      }
    },
  }
  try {
    await runCombinedDraftCorrection(
      f.ctx,
      {
        run_id: f.run,
        review_file: f.original.editorial_review_file,
        revision_evidence: f.original.revision_evidence,
      },
      { baseProvider: provider },
    )
  } finally {
    Date.now = originalNow
  }
  assert.deepEqual(calls, ["combined_review_correction", "combined_review_correction_time_repair"])
  assert.equal(
    readJSON(f.root, `reasoning-tasks/${task.task_id}/result.json`).submitted_at,
    submitted.submitted_at,
  )
})

test("a future correction with a wrong delegated result SHA fails before any time repair", async (t) => {
  const f = await disputedEditorialFixture(t)
  const job_id = "module-time-sha-owner"
  const ownerInput = { job_id, parameters: { run_id: f.run } }
  const owner = { job_id, input_sha256: sha256(JSON.stringify(ownerInput)) }
  atomicCreate(f.root, `module-jobs/${job_id}/input.json`, ownerInput)
  atomicCreate(f.root, `module-jobs/${job_id}/state.json`, {
    state: "running",
    input_sha256: owner.input_sha256,
  })
  const task = withRequestOwner(owner, () =>
    createReasoningTask(f.root, {
      run: f.run,
      role: "article_write",
      binding: { settings: { model: "gpt-6-luna" } },
      input: { schema: { type: "object" } },
    }),
  )
  atomicWrite(f.root, `module-jobs/${job_id}/state.json`, {
    state: "waiting_for_reasoning",
    input_sha256: owner.input_sha256,
    reasoning_task: { task_id: task.task_id, request_sha256: task.request_sha256 },
  })
  const correction = {
    reviewer: "fixture-writer",
    reviewed_at: new Date(Date.now() + 60_000).toISOString(),
    reason: "Correct the requested metadata only",
    draft: structuredClone(f.p.packet.draft.draft),
  }
  correction.draft.entities = ["Fixture Robotics"]
  await submitReasoningResult(f.root, {
    task_id: task.task_id,
    request_sha256: task.request_sha256,
    output: correction,
    executor: "codex",
    model: "gpt-6-luna",
  })
  let calls = 0
  const provider = {
    metadata: fixtureMetadata,
    structured: async () => {
      calls++
      return {
        output: correction,
        provenance: {
          task_id: task.task_id,
          request_sha256: task.request_sha256,
          result_sha256: "0".repeat(64),
        },
      }
    },
  }
  await assert.rejects(
    runCombinedDraftCorrection(
      f.ctx,
      {
        run_id: f.run,
        review_file: f.original.editorial_review_file,
        revision_evidence: f.original.revision_evidence,
      },
      { baseProvider: provider },
    ),
    /Correction model result binding changed/,
  )
  const fixRun = fs
    .readdirSync(safePath(f.root, "runs"))
    .find((name) => name.startsWith("bundle-fix-"))
  assert.equal(readJSON(f.root, `runs/${fixRun}/correction-time-repair-required.json`), null)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
  assert.equal(calls, 1)
})

for (const action of ["keep_correction", "keep_dispute"])
  test(`a mixed correction and dispute requires an explicit ${action} decision without automatic prose changes`, async (t) => {
    const f = await disputedEditorialFixture(t)
    const original = fs.readFileSync(safePath(f.root, `runs/${f.run}/draft.json`))
    const mixed = structuredClone(f.decision)
    mixed.draft.entities = ["Fixture Robotics"]
    let calls = 0
    const provider = {
      metadata: fixtureMetadata,
      structured: async (request) => {
        calls++
        const input = JSON.parse(request.messages[1].content)
        if (input.task === "combined_review_correction") return { output: mixed }
        assert.equal(input.task, "combined_review_correction_resolution")
        assert.equal(input.input_sha256, f.p.input_sha256)
        assert.match(input.validation_error, /preserve the exact current draft/)
        assert.equal(input.original_decision_sha256, sha256(JSON.stringify(mixed)))
        assert.equal(
          fs.readFileSync(safePath(f.root, `runs/${f.run}/draft.json`), "utf8"),
          original.toString(),
        )
        return {
          output: {
            action,
            original_decision_sha256: input.original_decision_sha256,
            reviewer: "fixture-writer",
            reviewed_at: "2026-10-26",
            source_read: true,
            final_prose_read: true,
            reason:
              action === "keep_correction"
                ? "Apply only the explicitly chosen metadata correction and obtain a fresh independent source review"
                : "Retain the entire original draft and request the source-bound reassessment before any separate metadata correction",
          },
        }
      },
    }
    const result = await runCombinedDraftCorrection(
      f.ctx,
      {
        run_id: f.run,
        review_file: f.original.editorial_review_file,
        revision_evidence: f.original.revision_evidence,
      },
      { baseProvider: provider },
    )
    assert.equal(calls, 2)
    assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
    if (action === "keep_dispute") {
      assert.equal(result.status, "review_disputed")
      assert.deepEqual(fs.readFileSync(safePath(f.root, `runs/${f.run}/draft.json`)), original)
      await runCombinedDraftCorrection(
        f.ctx,
        {
          run_id: f.run,
          review_file: f.original.editorial_review_file,
          revision_evidence: f.original.revision_evidence,
        },
        { baseProvider: provider },
      )
      assert.equal(calls, 2, "resolution is durable across re-entry")
    } else {
      const after = readJSON(f.root, `runs/${f.run}/draft.json`).draft
      assert.deepEqual(after.entities, mixed.draft.entities)
      assert.deepEqual(after.lead, f.p.packet.draft.draft.lead)
      assert.deepEqual(after.explanations, f.p.packet.draft.draft.explanations)
      assert.equal(readJSON(f.root, f.p.base + "editorial-dispute.json"), null)
    }
  })

test("an unresolved mixed correction never chooses a branch after two invalid resolution requests", async (t) => {
  const f = await disputedEditorialFixture(t),
    before = fs.readFileSync(safePath(f.root, `runs/${f.run}/draft.json`))
  const mixed = structuredClone(f.decision)
  mixed.draft.entities = ["Fixture Robotics"]
  let calls = 0
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      calls++
      const input = JSON.parse(request.messages[1].content)
      return {
        output:
          input.task === "combined_review_correction" ? mixed : { action: "invent_an_approval" },
      }
    },
  }
  await assert.rejects(
    runCombinedDraftCorrection(
      f.ctx,
      {
        run_id: f.run,
        review_file: f.original.editorial_review_file,
        revision_evidence: f.original.revision_evidence,
      },
      { baseProvider: provider },
    ),
    (error) => error.code === "CORRECTION_RESOLUTION_EXHAUSTED",
  )
  assert.equal(calls, 3)
  assert.deepEqual(fs.readFileSync(safePath(f.root, `runs/${f.run}/draft.json`)), before)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("a source-bound writer dispute rechecks only the editorial decision and preserves valid prose and raw evidence", async (t) => {
  const f = await disputedEditorialFixture(t)
  const before = fs.readFileSync(safePath(f.root, `runs/${f.run}/draft.json`))
  const oldEditorial = fs.readFileSync(path.join(f.ctx.repo, f.original.editorial_review_file))
  const oldResponse = fs.readFileSync(safePath(f.root, f.original.response.path))
  const disputed = await disputeCorrection(f)
  assert.equal(disputed.status, "review_disputed")
  assert.deepEqual(fs.readFileSync(safePath(f.root, `runs/${f.run}/draft.json`)), before)
  assert.deepEqual(await disputeCorrection(f), disputed, "same dispute is idempotent")
  const calls = []
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input)
      assert.equal(input.task, "combined_review_repair")
      assert.match(input.component, /^editorial-dispute-/)
      assert.equal(input.writer_dispute.sha256, disputed.dispute.sha256)
      assert.deepEqual(input.assigned_claim_ids, [])
      return { output: { editorial_review: editorialOutput(f.p).editorial_review } }
    },
  }
  const resolved = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    { baseProvider: provider },
  )
  assert.equal(resolved.needs_revision, false)
  assert.notEqual(resolved.editorial_review_file, f.original.editorial_review_file)
  assert.deepEqual(
    fs.readFileSync(path.join(f.ctx.repo, f.original.editorial_review_file)),
    oldEditorial,
  )
  assert.deepEqual(fs.readFileSync(safePath(f.root, f.original.response.path)), oldResponse)
  assert.deepEqual(fs.readFileSync(safePath(f.root, `runs/${f.run}/draft.json`)), before)
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(f.ctx.repo, resolved.coverage_review_file))).coverage,
    editorialOutput(f.p).coverage,
  )
  const again = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    { baseProvider: provider },
  )
  assert.deepEqual(again, resolved)
  assert.equal(calls.length, 1)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("a reversed part-zero decision requests only the still-unread coverage parts", async (t) => {
  const f = await disputedEditorialFixture(t, { claimCount: 15 })
  await disputeCorrection(f)
  const calls = []
  const result = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async (request) => {
          const input = JSON.parse(request.messages[1].content)
          calls.push(input)
          const value = editorialOutput(f.p)
          if (input.task === "combined_review_repair")
            return { output: { editorial_review: value.editorial_review } }
          assert.equal(input.part, 1, "healthy part-zero coverage must not run again")
          value.part = input.part
          value.editorial_review = null
          value.coverage = value.coverage.filter((row) =>
            input.assigned_claim_ids.includes(row.claim_id),
          )
          value.coverage_decisions = value.coverage_decisions.filter((row) =>
            input.assigned_claim_ids.includes(row.claim_id),
          )
          return { output: value }
        },
      },
    },
  )
  assert.equal(result.needs_revision, false)
  assert.equal(calls.length, 2)
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(f.ctx.repo, result.coverage_review_file))).coverage.length,
    15,
  )
})

for (const variant of ["input_sha256", "draft_id", "editorial_review_sha256", "changed_prose"])
  test(`an editorial dispute rejects ${variant} before changing the native draft`, async (t) => {
    const f = await disputedEditorialFixture(t)
    const before = fs.readFileSync(safePath(f.root, `runs/${f.run}/draft.json`))
    if (variant === "changed_prose") f.decision.draft.lead[0].text += " Unrelated text."
    else f.decision.review_dispute[variant] = "0".repeat(64)
    await assert.rejects(disputeCorrection(f))
    assert.deepEqual(fs.readFileSync(safePath(f.root, `runs/${f.run}/draft.json`)), before)
    assert.equal(readJSON(f.root, f.p.base + "editorial-dispute.json"), null)
    assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
  })

test("a changed dispute decision is rejected before any reassessment model dispatch", async (t) => {
  const f = await disputedEditorialFixture(t)
  const result = await disputeCorrection(f)
  const record = readJSON(f.root, result.dispute.path)
  fs.appendFileSync(safePath(f.root, record.decision.path), " ")
  let calls = 0
  await assert.rejects(
    runCombinedReview(
      f.ctx,
      { run_id: f.run, kind: "editorial" },
      {
        baseProvider: {
          metadata: fixtureMetadata,
          structured: async () => {
            calls++
            throw Error("not called")
          },
        },
      },
    ),
    /dispute evidence changed/i,
  )
  assert.equal(calls, 0)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("a changed mapped review response blocks dispute reassessment before a model call", async (t) => {
  const f = await disputedEditorialFixture(t)
  await disputeCorrection(f)
  const evidence = readJSON(f.root, f.original.revision_evidence.path)
  const reference = evidence.coverage_decision_mapping[0].response
  const raw = readJSON(f.root, reference.path)
  raw.output.coverage[0].reason += " altered after dispute"
  atomicWrite(f.root, reference.path, raw)
  let calls = 0
  await assert.rejects(
    () =>
      runCombinedReview(
        f.ctx,
        { run_id: f.run, kind: "editorial" },
        {
          baseProvider: {
            metadata: fixtureMetadata,
            structured: async () => {
              calls++
              throw Error("not called")
            },
          },
        },
      ),
    /Editorial dispute evidence changed/,
  )
  assert.equal(calls, 0)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("a mapped review response changed during dispute reassessment cannot be applied", async (t) => {
  const f = await disputedEditorialFixture(t)
  await disputeCorrection(f)
  const evidence = readJSON(f.root, f.original.revision_evidence.path)
  const reference = evidence.coverage_decision_mapping[0].response
  let calls = 0
  await assert.rejects(
    () =>
      runCombinedReview(
        f.ctx,
        { run_id: f.run, kind: "editorial" },
        {
          baseProvider: {
            metadata: fixtureMetadata,
            structured: async () => {
              calls++
              const raw = readJSON(f.root, reference.path)
              raw.output.coverage[0].reason += " altered during reassessment"
              atomicWrite(f.root, reference.path, raw)
              return { output: { editorial_review: editorialOutput(f.p).editorial_review } }
            },
          },
        },
      ),
    /Editorial dispute evidence changed/,
  )
  assert.equal(calls, 1)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("a reassessment repairs only a missing native check while retaining its other explicit judgments", async (t) => {
  const f = await disputedEditorialFixture(t)
  await disputeCorrection(f)
  const components = []
  const result = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async (request) => {
          const input = JSON.parse(request.messages[1].content)
          components.push(input.component)
          if (components.length === 1) {
            const review = editorialOutput(f.p).editorial_review
            delete review.numbers_checked
            return { output: { editorial_review: review } }
          }
          assert.equal(input.component, "editorial-dispute-fields")
          assert.deepEqual(input.invalid_editorial_fields, ["numbers_checked"])
          assert.deepEqual(request.schema.properties.editorial_review.required, ["numbers_checked"])
          return { output: { editorial_review: { numbers_checked: true } } }
        },
      },
    },
  )
  assert.equal(result.needs_revision, false)
  assert.equal(components.length, 2)
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(f.ctx.repo, result.coverage_review_file))).coverage,
    editorialOutput(f.p).coverage,
  )
})

test("a confirmed revision after a dispute cannot become automatic approval or an unlimited loop", async (t) => {
  const f = await disputedEditorialFixture(t)
  const first = await disputeCorrection(f)
  const confirmed = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async () => ({
          output: {
            editorial_review: {
              status: "needs_revision",
              draft_id: f.p.packet.draft.draft_id,
              reviewer: "fixture-independent-reader",
              reviewed_at: "2026-10-26",
              reason:
                "The bound source still requires a concrete clarification of the contract scope",
            },
          },
        }),
      },
    },
  )
  assert.equal(confirmed.needs_revision, true)
  const decision = structuredClone(f.decision)
  decision.review_dispute.editorial_review_sha256 = sha256(
    fs.readFileSync(path.join(f.ctx.repo, confirmed.editorial_review_file)),
  )
  await assert.rejects(
    runCombinedDraftCorrection(
      f.ctx,
      {
        run_id: f.run,
        review_file: confirmed.editorial_review_file,
        revision_evidence: confirmed.revision_evidence,
      },
      {
        baseProvider: { metadata: fixtureMetadata, structured: async () => ({ output: decision }) },
      },
    ),
    (error) => error.code === "EDITORIAL_DISPUTE_EXHAUSTED",
  )
  assert.equal(sha256(fs.readFileSync(safePath(f.root, first.dispute.path))), first.dispute.sha256)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("editorial revisions forward exact source-bound coverage and raw decisions to the writer", async (t) => {
  const f = await editorialSetup(t)
  const p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
  const response = editorialOutput(p)
  response.editorial_review.status = "needs_revision"
  response.editorial_review.reason = "Clarify the source scope in the reader explanation"
  response.coverage[1].reason = "The exact contract scope needs an explicit reader explanation"
  const result = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: { metadata: fixtureMetadata, structured: async () => ({ output: response }) },
    },
  )
  assert.ok(result.revision_evidence?.sha256, "all revision observations must reach correction")
  let writerCalls = 0
  const writer = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      writerCalls++
      const input = JSON.parse(request.messages[1].content)
      const bytes = fs.readFileSync(input.revision_evidence.file)
      assert.equal(sha256(bytes), input.revision_evidence.sha256)
      const evidence = JSON.parse(bytes)
      assert.equal(evidence.input_sha256, p.input_sha256)
      assert.deepEqual(readJSON(f.root, evidence.coverage.path).coverage, response.coverage)
      assert.deepEqual(readJSON(f.root, evidence.response.path).outputs, [response])
      const draft = structuredClone(p.packet.draft.draft)
      draft.explanations[0].paragraphs[0].text += " 이 설명은 해당 계약의 원문 범위를 따른다."
      return {
        output: {
          reviewer: "fixture-writer",
          reviewed_at: "2026-10-26",
          reason: "Applied the explicit independent scope finding",
          draft,
        },
      }
    },
  }
  await assert.rejects(
    runCombinedDraftCorrection(
      f.ctx,
      {
        run_id: f.run,
        review_file: result.editorial_review_file,
        revision_evidence: { ...result.revision_evidence, sha256: "0".repeat(64) },
      },
      { baseProvider: writer },
    ),
    /revision evidence/i,
  )
  assert.equal(writerCalls, 0)
  await runCombinedDraftCorrection(
    f.ctx,
    {
      run_id: f.run,
      review_file: result.editorial_review_file,
      revision_evidence: result.revision_evidence,
    },
    { baseProvider: writer },
  )
  assert.equal(writerCalls, 1)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("a reason repair cannot turn an unresolved coverage rejection into editorial approval", async (t) => {
  const f = await editorialSetup(t)
  await assert.rejects(
    () =>
      runCombinedReview(
        f.ctx,
        { run_id: f.run, kind: "editorial" },
        {
          baseProvider: {
            metadata: fixtureMetadata,
            structured: async (request) => {
              const input = JSON.parse(request.messages[1].content)
              const value = editorialOutput(
                prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
              )
              if (input.task === "combined_review") {
                value.editorial_review.status = "needs_revision"
                value.coverage_decisions[0] = {
                  claim_id: f.ids[0],
                  decision: "needs_revision",
                  reason: "The source comparison is absent.",
                }
                return { output: value }
              }
              assert.equal(input.component, "editorial-revision-findings")
              return { output: { status: "approved", reason: "The original status was mistaken." } }
            },
          },
        },
      ),
    /Explicit positive coverage decisions are required before editorial approval/,
  )
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("a status-only editorial revision requests only its missing concrete reason", async (t) => {
  const f = await editorialSetup(t),
    calls = []
  const result = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    {
      baseProvider: {
        metadata: fixtureMetadata,
        structured: async (request) => {
          const input = JSON.parse(request.messages[1].content)
          calls.push(input)
          const p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
          const output = editorialOutput(p)
          output.editorial_review.status = "needs_revision"
          if (calls.length === 1) return { output }
          assert.equal(input.component, "editorial-revision-findings")
          assert.deepEqual(input.original_response.coverage, output.coverage)
          return {
            output: {
              status: "needs_revision",
              reason: "Explicit independent source scope correction required in explanations[0]",
            },
          }
        },
      },
    },
  )
  assert.equal(calls.length, 2)
  assert.equal(result.needs_revision, true)
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(f.ctx.repo, result.editorial_review_file))).reason,
    "Explicit independent source scope correction required in explanations[0]",
  )
  assert.deepEqual(readJSON(f.root, result.revision_evidence.path).response, result.response)
})

test("partial coverage repairs retain valid decisions and request only the still-missing assigned fact", async (t) => {
  const f = await editorialSetup(t),
    calls = []
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content),
        p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
        valid = editorialOutput(p)
      calls.push(input)
      if (input.task !== "combined_review_repair") {
        valid.coverage[1].preserved_aspects = ["fact"]
        valid.coverage[2].preserved_aspects = ["fact"]
        return { output: valid }
      }
      const ids = calls.length === 2 ? [f.ids[1]] : [f.ids[2]]
      return {
        output: {
          coverage: valid.coverage.filter((row) => ids.includes(row.claim_id)),
          revision_required: false,
          reason: "Explicit fixture-only source verification",
          reviewed_at: "2026-10-26",
        },
      }
    },
  }
  const result = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    { baseProvider: provider },
  )
  assert.equal(result.needs_revision, false)
  assert.deepEqual(calls[1].assigned_claim_ids, [f.ids[1], f.ids[2]])
  assert.deepEqual(calls[2].assigned_claim_ids, [f.ids[2]])
  assert.deepEqual(
    calls[2].coverage_requirements.map((row) => row.claim_id),
    [f.ids[2]],
  )
  assert.ok(calls[2].coverage_requirements[0].allowed_reader_locations.length)
  assert.equal(calls.length, 3)
  const coverage = JSON.parse(fs.readFileSync(path.join(f.ctx.repo, result.coverage_review_file)))
  assert.equal(coverage.coverage.length, 3)
  assert.deepEqual(
    coverage.coverage.find((row) => row.claim_id === f.ids[0]),
    editorialOutput(prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })).coverage[0],
  )
  await runCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }, { baseProvider: provider })
  assert.equal(calls.length, 3, "re-entry retains the original valid and repaired judgments")
})

test("native missing fact references are repaired by the writer before independent editorial review", async (t) => {
  const f = await editorialSetup(t, { missingReference: true }),
    calls = []
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input)
      const p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
      if (calls.length === 1) {
        assert.equal(
          input.task,
          "combined_review_correction",
          "structural author repair must precede whole editorial review",
        )
        assert.ok(
          input.structural_validation.findings.some((row) => row.claim_ids?.includes(f.ids[2])),
        )
        const draft = structuredClone(p.packet.draft.draft)
        draft.explanations[0].paragraphs[0].claim_ids.push(f.ids[2])
        return {
          output: {
            reviewer: "fixture-writer",
            reviewed_at: "2026-10-26",
            reason: "Directly verified corroborating source and linked its important fact ID",
            draft,
          },
        }
      }
      assert.equal(input.kind, "editorial")
      return { output: editorialOutput(p) }
    },
  }
  const result = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    { baseProvider: provider },
  )
  assert.equal(result.needs_revision, false)
  assert.equal(calls.length, 2)
  assert.equal(
    inspectEditorialCompleteness(
      readJSON(f.root, `runs/${f.run}/draft.json`),
      readJSON(f.root, `runs/${f.run}/reviewed-claims.json`).claims,
    ).blocked,
    false,
  )
  assert.equal(
    readJSON(f.root, `runs/${f.run}/approved-article.json`),
    null,
    "writer preflight never creates approval",
  )
})

test("native draft preflight caps persistent writer failures across process-style re-entry", async (t) => {
  const f = await editorialSetup(t, { missingReference: true })
  let calls = 0
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      assert.equal(input.task, "combined_review_correction")
      calls++
      const draft = structuredClone(readJSON(f.root, `runs/${f.run}/draft.json`).draft)
      draft.title = "Fixture Robotics 주문 확인 " + "내용 ".repeat(calls)
      return {
        output: {
          reviewer: "fixture-writer",
          reviewed_at: "2026-10-26",
          reason: "Intentionally incomplete fixture output exercises the bounded failure path",
          draft,
        },
      }
    },
  }
  for (let entry = 0; entry < 2; entry++)
    await assert.rejects(
      runCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }, { baseProvider: provider }),
      (error) => error.code === "DRAFT_PREFLIGHT_EXHAUSTED",
    )
  assert.equal(calls, 2)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})
test("unchanged native draft correction receives one bounded source-bound retry", async (t) => {
  const f = await editorialSetup(t, { missingReference: true }),
    calls = []
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input)
      const p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
      if (input.task === "combined_review_correction") {
        const draft = structuredClone(p.packet.draft.draft)
        if (input.structural_validation.attempt === 2)
          draft.explanations[0].paragraphs[0].claim_ids.push(f.ids[2])
        return {
          output: {
            reviewer: "fixture-writer",
            reviewed_at: "2026-10-26",
            reason:
              "Fixture writer first returns unchanged, then fixes the source-checked reference",
            draft,
          },
        }
      }
      assert.equal(input.kind, "editorial")
      return { output: editorialOutput(p) }
    },
  }
  const result = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    { baseProvider: provider },
  )
  assert.equal(result.needs_revision, false)
  const corrections = calls.filter((input) => input.task === "combined_review_correction")
  assert.deepEqual(
    corrections.map((input) => input.structural_validation.attempt),
    [1, 2],
  )
  assert.ok(corrections[1].structural_validation.previous_failure?.path)
  assert.ok(corrections[1].structural_validation.previous_failure?.sha256)
  const previous = readJSON(f.root, corrections[1].structural_validation.previous_failure.path)
  assert.equal(previous.outcome, "unchanged_draft")
  assert.equal(previous.attempt, 1)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
  await runCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }, { baseProvider: provider })
  assert.equal(
    calls.length,
    3,
    "re-entry must not repeat either correction or the editorial review",
  )
})
test("unchanged preflight retry survives re-entry and rejects changed failure evidence", async (t) => {
  const f = await editorialSetup(t, { missingReference: true }),
    calls = []
  let waiting = true
  const provider = {
    metadata: fixtureMetadata,
    prepareStructured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input)
      if (
        input.task === "combined_review_correction" &&
        input.structural_validation.attempt === 2 &&
        waiting
      ) {
        waiting = false
        throw Object.assign(Error("Fixture delegated model result pending"), {
          code: "REASONING_PENDING",
        })
      }
    },
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      const p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
      if (input.task === "combined_review_correction") {
        const draft = structuredClone(p.packet.draft.draft)
        if (input.structural_validation.attempt === 2)
          draft.explanations[0].paragraphs[0].claim_ids.push(f.ids[2])
        return {
          output: {
            reviewer: "fixture-writer",
            reviewed_at: "2026-10-26",
            reason: "Source-bound fixture correction",
            draft,
          },
        }
      }
      return { output: editorialOutput(p) }
    },
  }
  await assert.rejects(
    runCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }, { baseProvider: provider }),
    (error) => error.code === "REASONING_PENDING",
  )
  const latest = readJSON(f.root, `runs/${f.run}/draft-preflight/latest.json`)
  assert.equal(latest.attempt, 2)
  const markerPath = safePath(f.root, latest.previous_failure.path)
  const original = fs.readFileSync(markerPath)
  fs.writeFileSync(markerPath, Buffer.from("{}\n"))
  await assert.rejects(
    runCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }, { baseProvider: provider }),
    /preflight failure evidence changed/,
  )
  fs.writeFileSync(markerPath, original)
  const result = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "editorial" },
    { baseProvider: provider },
  )
  assert.equal(result.needs_revision, false)
  assert.deepEqual(
    calls
      .filter((input) => input.task === "combined_review_correction")
      .map((input) => input.structural_validation.attempt),
    [1, 2, 2],
  )
  assert.deepEqual(calls[1], calls[2], "the pending retry keeps its exact input and owner")
})
test("two unchanged preflight responses exhaust the retry without fabricating approval", async (t) => {
  const f = await editorialSetup(t, { missingReference: true }),
    calls = []
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input)
      assert.equal(input.task, "combined_review_correction")
      return {
        output: {
          reviewer: "fixture-writer",
          reviewed_at: "2026-10-26",
          reason: "Intentionally unchanged fixture draft",
          draft: structuredClone(readJSON(f.root, `runs/${f.run}/draft.json`).draft),
        },
      }
    },
  }
  for (let entry = 0; entry < 2; entry++)
    await assert.rejects(
      runCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }, { baseProvider: provider }),
      (error) => error.code === "DRAFT_PREFLIGHT_EXHAUSTED",
    )
  assert.deepEqual(
    calls.map((input) => input.structural_validation.attempt),
    [1, 2],
  )
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})
test("lossless pages retain UTF-16 offsets, astral characters and every byte", () => {
  const input = "문장😀".repeat(12001),
    pages = reviewPacketPages(input, 7)
  assert.equal(pages.map((p) => p.text).join(""), input)
  assert.equal(sha256(pages.map((p) => p.text).join("")), sha256(input))
  assert.equal(pages.at(-1).end, input.length)
  pages.forEach((p, i) => {
    assert.equal(p.start, i ? pages[i - 1].end : 0)
    assert.ok(p.text.length <= 7)
  })
})
test("native fact corrections map old claim refs to exact resulting completeness IDs", (t) => {
  const f = setup(t),
    p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" })
  const result = projectCombinedEvidence(p, [output(p, { replacement: true })])
  assert.notEqual(result.claims[0].claim_id, f.claim.claim_id)
  assert.equal(result.completeness.fact_decisions[0].claim_id, result.claims[0].claim_id)
  assert.equal(result.mapping[0].claim_ref, f.claim.claim_id)
  assert.equal(readJSON(f.root, `runs/${f.run}/reviewed-claims.json`), null)
})

function plannedFactSetup(t) {
  const f = setup(t)
  const parses = readJSON(f.root, `runs/${f.run}/parses.json`)
  const block = parses[0].blocks[1]
  block.text = "Fixture Robotics will deliver these robots in 2027."
  block.locator.text_hash = sha256(block.text)
  atomicWrite(f.root, `runs/${f.run}/parses.json`, parses)
  atomicWrite(f.root, `parses/${parses[0].parse_id}/parse.json`, parses[0])
  const planned = {
    ...structuredClone(f.claim),
    claim_id: "incorrectly-completed-plan",
    statement: block.text,
    event_state: "completed",
  }
  planned.evidence[0].block_id = block.block_id
  planned.evidence[0].quote = block.text
  planned.review = validateEvidence(planned, parses)
  assert.deepEqual(planned.review.problems, ["plan_promoted_to_completion"])
  atomicWrite(f.root, `runs/${f.run}/claims.json`, { claims: [f.claim, planned] })
  return { ...f, planned }
}

test("native fact repair names structural problems and retains healthy decisions through a second targeted correction", async (t) => {
  const f = plannedFactSetup(t),
    calls = []
  let healthy
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input)
      if (input.task === "combined_review") {
        assert.ok(
          input.native_fact_validation.some(
            (row) =>
              row.claim_id === f.planned.claim_id &&
              row.structural_problems.includes("plan_promoted_to_completion"),
          ),
        )
        const value = output(prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }))
        healthy = structuredClone(value.fact_review.claims[0])
        delete value.fact_review.claims[1].reason
        assert.ok(input.native_fact_decision_schemas.claims.required.includes("reason"))
        await submitOwnedFixtureResponse(f, request, value, "claims")
        return { output: value }
      }
      assert.deepEqual(input.assigned_claim_ids, [f.planned.claim_id])
      assert.equal(input.valid_decisions_retained, true)
      assert.deepEqual(input.native_fact_errors[0].structural_problems, [
        "plan_promoted_to_completion",
      ])
      assert.match(
        input.native_fact_errors[0].native_error,
        calls.length === 2 ? /Missing field.*reason/ : /Verified claim requires/,
      )
      const replacement = request.schema.properties.claims.items.properties.replacement
      assert.ok(replacement.properties.event_state.enum.includes("planned"))
      assert.equal(replacement.additionalProperties, false)
      assert.equal(replacement.properties.candidate_key, undefined)
      const decision = structuredClone(input.original_response[0])
      decision.reason = "Compared the exact planned event with its source"
      if (calls.length === 3) decision.replacement = { event_state: "planned" }
      return { output: { claims: [decision], reviewed_at: "2026-10-26" } }
    },
  }
  await runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider })
  assert.equal(calls.length, 3)
  assert.match(calls[2].component, /followup-1$/)
  const reviewed = readJSON(f.root, `runs/${f.run}/reviewed-claims.json`).claims
  assert.equal(reviewed[0].claim_id, healthy.claim_id)
  assert.deepEqual(reviewed[0].review.checks, healthy)
  assert.equal(reviewed[1].event_state, "planned")
  assert.equal(reviewed[1].previous_claim_id, f.planned.claim_id)
  assert.equal(reviewed[1].review.structural_pass, true)
  await runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider })
  assert.equal(calls.length, 3, "process-style re-entry reuses exact durable repairs")
})

test("persistent invalid fact decisions stop after two exact repairs without a reviewed or approved artifact", async (t) => {
  const f = plannedFactSetup(t)
  let calls = 0
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      calls++
      const input = JSON.parse(request.messages[1].content)
      if (input.task === "combined_review")
        return { output: output(prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" })) }
      assert.deepEqual(input.assigned_claim_ids, [f.planned.claim_id])
      return { output: { claims: input.original_response, reviewed_at: "2026-10-26" } }
    },
  }
  for (let entry = 0; entry < 2; entry++)
    await assert.rejects(
      runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider }),
      (error) => error.code === "FACT_DECISIONS_REPAIR_EXHAUSTED",
    )
  assert.equal(calls, 3)
  assert.equal(readJSON(f.root, `runs/${f.run}/reviewed-claims.json`), null)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

for (const code of [
  "korean_prose_required",
  "invalid_reader_prose",
  "entity_translation_requires_review",
  "secondary_theme_repeats_primary",
  "tag_theme_mismatch",
  "internal_claim_identity_in_prose",
  "operational_or_generic_prose",
  "unknown_claim_reference",
  "unsupported_time_zone_qualification",
])
  test(`native ${code} is corrected before independent editorial dispatch`, async (t) => {
    const f = await editorialSetup(t),
      calls = []
    const originalClaims = fs.readFileSync(safePath(f.root, `runs/${f.run}/reviewed-claims.json`))
    const record = readJSON(f.root, `runs/${f.run}/draft.json`)
    const good = structuredClone(record.draft)
    if (code === "korean_prose_required") {
      record.draft.title = "Fixture Robotics order"
      record.draft.lead.forEach((row, i) => {
        row.text = "Fixture Robotics announced this order. " + i
      })
      record.draft.explanations[0].heading = "Order details"
      record.draft.explanations[0].paragraphs[0].text =
        "The source names Fixture Robotics and Partner."
    } else if (code === "invalid_reader_prose")
      record.draft.explanations[0].paragraphs[0].text += " 원문의 비교 표기는 1<2다."
    else if (code === "entity_translation_requires_review")
      record.draft.entities[0] = "검토되지 않은 번역 명칭"
    else if (code === "secondary_theme_repeats_primary")
      record.draft.secondary_theme = record.draft.theme
    else if (code === "tag_theme_mismatch") {
      const allowed = THEMES.find((row) => row.name === record.draft.theme).tags
      record.draft.tags = [THEMES.flatMap((row) => row.tags).find((tag) => !allowed.includes(tag))]
    } else if (code === "internal_claim_identity_in_prose") record.draft.title += " " + f.ids[0]
    else if (code === "operational_or_generic_prose")
      record.draft.explanations[0].paragraphs[0].text += " 근거가 부족하다."
    else if (code === "unsupported_time_zone_qualification") {
      record.draft.lead[0].text += " 한국시간 기준이다."
      record.draft.facts.when = "2026-09-27(한국시간)"
    } else record.draft.explanations[0].paragraphs[0].claim_ids.push("unrelated-unverified-claim")
    record.draft_id = draftFingerprint(record.draft)
    atomicWrite(f.root, `runs/${f.run}/draft.json`, record)
    const packet = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }).packet
    assert.deepEqual(
      packet.native_draft_problems,
      draftProblems(
        record.draft,
        readJSON(f.root, `runs/${f.run}/reviewed-claims.json`).claims,
        record.deep_context,
        record.completeness_context,
      ),
      "preflight must use the full unchanged native blocker set without a separate whitelist",
    )
    await runCombinedReview(
      f.ctx,
      { run_id: f.run, kind: "editorial" },
      {
        baseProvider: {
          metadata: fixtureMetadata,
          structured: async (request) => {
            const input = JSON.parse(request.messages[1].content)
            calls.push(input)
            if (calls.length === 1) {
              assert.equal(input.task, "combined_review_correction")
              assert.ok(input.structural_validation.findings.some((row) => row.code === code))
              return {
                output: {
                  reviewer: "fixture-writer",
                  reviewed_at: "2026-10-26",
                  reason:
                    "Correct the explicitly reported native prose format while retaining source-backed content",
                  draft: good,
                },
              }
            }
            assert.equal(input.kind, "editorial")
            return {
              output: editorialOutput(
                prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
              ),
            }
          },
        },
      },
    )
    assert.equal(calls.length, 2)
    assert.deepEqual(
      fs.readFileSync(safePath(f.root, `runs/${f.run}/reviewed-claims.json`)),
      originalClaims,
    )
    assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
  })
test("missing importance or source checks cannot manufacture a completion", (t) => {
  const f = setup(t),
    p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" })
  const missing = output(p)
  missing.important_facts = []
  assert.throws(() => projectCombinedEvidence(p, [missing]), /each verified fact|Missing items/)
  const invalid = output(p)
  invalid.fact_review.claims[0].entailment_checked = false
  assert.throws(() => projectCombinedEvidence(p, [invalid]), /Verified claim requires/)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})
test("split review times are ordered by actual instant across explicit offsets", (t) => {
  const f = setup(t),
    prepared = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }),
    first = output(prepared),
    second = structuredClone(first)
  first.reviewed_at = first.importance_reviewed_at = "2026-10-25T22:54:23Z"
  second.reviewed_at = second.importance_reviewed_at = "2026-10-26T07:52:42+09:00"
  second.part = 1
  second.fact_review.claims = []
  second.important_facts = []
  const projected = projectCombinedEvidence(prepared, [first, second])
  assert.equal(projected.fact.reviewed_at, first.reviewed_at)
  assert.equal(projected.completeness.reviewed_at, first.importance_reviewed_at)
  first.reviewed_at = first.importance_reviewed_at = "2026-10-26"
  const mixed = projectCombinedEvidence(prepared, [first, second])
  assert.equal(mixed.fact.reviewed_at, "2026-10-26")
  assert.equal(mixed.completeness.reviewed_at, "2026-10-26")
})
test("source-page mutations and removed pages are rejected before native writes", (t) => {
  const f = setup(t),
    p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" })
  assertCombinedReviewSources(f.ctx, p)
  const manifest = readJSON(f.root, p.manifest.path)
  fs.appendFileSync(safePath(f.root, manifest.pages[0].path), "tamper")
  assert.throws(() => assertCombinedReviewSources(f.ctx, p), /page hash/)
  assert.equal(readJSON(f.root, `runs/${f.run}/reviewed-claims.json`), null)
})
test("model-facing review packet contains each original source passage only once", async (t) => {
  const f = await editorialSetup(t, { claimCount: 1 })
  const passage = f.claim.evidence[0].quote
  f.record.model_artifacts = {
    request: { messages: [{ role: "user", content: `Previous model input: ${passage}` }] },
    response_content: "Preserve the original previous response for native provenance",
  }
  atomicWrite(f.root, `runs/${f.run}/draft.json`, f.record)
  const prepared = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
  const manifest = readJSON(f.root, prepared.manifest.path)
  const modelPacket = readJSON(f.root, manifest.packet.path)
  const serialized = JSON.stringify(modelPacket)
  assert.equal(serialized.split(passage).length - 1, 1)
  assert.equal(modelPacket.draft.model_artifacts, undefined)
  assert.equal(
    prepared.packet.draft.model_artifacts.request.messages[0].content,
    `Previous model input: ${passage}`,
  )
  const source = modelPacket.parses[0].blocks[0].text
  for (const value of [modelPacket.claims[0].statement, modelPacket.claims[0].evidence[0].quote]) {
    const bound = value.$source_text
    assert.equal(source.slice(bound.start_utf16, bound.end_utf16), passage)
    assert.equal(bound.sha256, sha256(passage))
  }
  assert.equal(manifest.native_input_sha256, prepared.native_packet.sha256)
  assertCombinedReviewSources(f.ctx, prepared)
})
test("model source references preserve exact source identity and Unicode slices", (t) => {
  const f = setup(t)
  const other = source(f.root, 2, f.run)
  const parses = readJSON(f.root, `runs/${f.run}/parses.json`)
  const passage = "서문 😀 실제 원문에서 50% 증가했다고 밝혔다. 추가 설명"
  for (const parse of parses) {
    parse.blocks[0].text = passage
    parse.blocks[0].locator.text_hash = sha256(passage)
    atomicWrite(f.root, `parses/${parse.parse_id}/parse.json`, parse)
  }
  atomicWrite(f.root, `runs/${f.run}/parses.json`, parses)
  f.claim.evidence[0] = {
    ...f.claim.evidence[0],
    source_id: other.document.source_id,
    source_version_id: other.document.source_version_id,
    parse_id: other.parsed.parse_id,
    block_id: other.parsed.blocks[0].block_id,
    quote: "😀 실제 원문에서 50% 증가",
  }
  f.claim.statement = f.claim.evidence[0].quote
  atomicWrite(f.root, `runs/${f.run}/claims.json`, { claims: [f.claim] })
  const prepared = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" })
  const manifest = readJSON(f.root, prepared.manifest.path)
  const modelPacket = readJSON(f.root, manifest.packet.path)
  const bound = modelPacket.claims[0].evidence[0].quote.$source_text
  assert.equal(bound.source_version_id, other.document.source_version_id)
  assert.equal(bound.parse_id, other.parsed.parse_id)
  assert.equal(bound.block_id, other.parsed.blocks[0].block_id)
  const block = modelPacket.parses.find((parse) => parse.parse_id === bound.parse_id).blocks[0].text
  assert.equal(block.slice(bound.start_utf16, bound.end_utf16), f.claim.evidence[0].quote)
  assert.equal(bound.sha256, sha256(f.claim.evidence[0].quote))
  assertCombinedReviewSources(f.ctx, prepared)
  f.claim.evidence[0].quote = "This quotation is not in the bound source"
  atomicWrite(f.root, `runs/${f.run}/claims.json`, { claims: [f.claim] })
  assert.throws(() => assertCombinedReviewSources(f.ctx, prepared), /article input/)
  const changed = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" })
  const changedPacket = readJSON(f.root, readJSON(f.root, changed.manifest.path).packet.path)
  assert.notEqual(changed.input_sha256, prepared.input_sha256)
  assert.equal(changedPacket.claims[0].evidence[0].quote, f.claim.evidence[0].quote)
  // A quotation found in another block must not be rebound away from the
  // evidence's declared block simply to reduce duplicated text.
  f.claim.evidence[0].quote = parses[0].blocks[1].text
  atomicWrite(f.root, `runs/${f.run}/claims.json`, { claims: [f.claim] })
  const wrongBlock = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" })
  const wrongBlockPacket = readJSON(f.root, readJSON(f.root, wrongBlock.manifest.path).packet.path)
  assert.equal(wrongBlockPacket.claims[0].evidence[0].quote, f.claim.evidence[0].quote)
})
test("multiple verbatim source passages in one draft remain losslessly readable", (t) => {
  const f = setup(t)
  const prepared = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" })
  const native = structuredClone(prepared.packet)
  const [first, second] = native.parses[0].blocks.map((block) => block.text)
  const draftText = `Before ${first} between ${second} and again ${first} after`
  native.parses[0].links = [{ text: first }, { text: first }]
  native.draft = { draft: { text: draftText }, model_artifacts: { previous: first } }
  const model = modelReviewPacket(native, sha256(JSON.stringify(native, null, 2) + "\n"))
  const segments = model.draft.draft.text.$source_segments
  assert.ok(Array.isArray(segments))
  const restored = segments
    .map((segment) => {
      if (typeof segment === "string") return segment
      const bound = segment.$source_text
      const block = native.parses[0].blocks.find((item) => item.block_id === bound.block_id)
      return block.text.slice(bound.start_utf16, bound.end_utf16)
    })
    .join("")
  assert.equal(restored, draftText)
  assert.equal(
    model.parses[0].links[0].text.$source_text.block_id,
    native.parses[0].blocks[0].block_id,
  )
  assert.equal(JSON.stringify(model).split(first).length - 1, 1)
  assert.equal(JSON.stringify(model).split(second).length - 1, 1)
})
test("nested prior fact corrections and statements do not retransmit bound source blocks", (t) => {
  const f = setup(t),
    passage = f.claim.evidence[0].quote
  f.claim.statement = `${passage}!`
  f.claim.review.checks = {
    replacement: {
      statement: `${passage}?`,
      evidence: structuredClone(f.claim.evidence),
    },
  }
  atomicWrite(f.root, `runs/${f.run}/claims.json`, { claims: [f.claim] })
  const prepared = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" })
  const packet = readJSON(f.root, readJSON(f.root, prepared.manifest.path).packet.path)
  assert.equal(JSON.stringify(packet).split(passage).length - 1, 1)
  assert.ok(packet.claims[0].statement.$source_segments)
  assert.ok(packet.claims[0].review.checks.replacement.statement.$source_segments)
  assert.ok(packet.claims[0].review.checks.replacement.evidence[0].quote.$source_text)
  assert.equal(prepared.packet.claims[0].review.checks.replacement.evidence[0].quote, passage)
})
test("changed native input or stored draft cannot be applied through a saved model view", async (t) => {
  const f = await editorialSetup(t, { claimCount: 1 })
  const prepared = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
  const changedDraft = structuredClone(f.record)
  changedDraft.draft.title += " changed"
  atomicWrite(f.root, `runs/${f.run}/draft.json`, changedDraft)
  assert.throws(() => assertCombinedReviewSources(f.ctx, prepared), /article input/)
  atomicWrite(f.root, `runs/${f.run}/draft.json`, f.record)
  fs.appendFileSync(safePath(f.root, prepared.native_packet.path), " ")
  assert.throws(() => assertCombinedReviewSources(f.ctx, prepared), /native input changed/)
})
test("the exact selected-event reference and its bytes stay pinned across review", (t) => {
  const f = setup(t)
  const selected = atomicCreate(f.root, "event-selections/review-test/selection.json", {
    schema: "research-event-selection/v1",
    run_id: f.run,
    group_id: "fixture",
  })
  atomicWrite(f.root, `runs/${f.run}/event-selection.json`, selected)
  const prepared = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" })
  assertCombinedReviewSources(f.ctx, prepared)
  atomicWrite(f.root, `runs/${f.run}/event-selection.json`, { ...selected, sha256: "f".repeat(64) })
  assert.throws(() => assertCombinedReviewSources(f.ctx, prepared), /selection|selected/i)
  assert.throws(
    () => prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }),
    /selection|selected/i,
  )
  atomicWrite(f.root, `runs/${f.run}/event-selection.json`, selected)
  fs.appendFileSync(safePath(f.root, selected.path), " ")
  assert.throws(() => assertCombinedReviewSources(f.ctx, prepared), /selection|selected/i)
  assert.throws(
    () => prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }),
    /selection|selected/i,
  )
})
test("a newly eligible concept invalidates only the bound editorial registry", async (t) => {
  const f = await editorialSetup(t, { claimCount: 1 })
  const prepared = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })
  const directory = path.join(f.ctx.vault, "Knowledge")
  fs.mkdirSync(directory, { recursive: true })
  const unreviewed = path.join(directory, "Unreviewed.md")
  fs.writeFileSync(unreviewed, noteText({ title: "Unreviewed" }, "# Unreviewed\n"))
  assertCombinedReviewSources(f.ctx, prepared)
  const eligible = noteText(
    {
      title: "Reviewed concept",
      concept_id: "reviewed-concept",
      verified_sources: ["https://example.org/concept"],
      map_review: { decision: "include", kind: "security" },
    },
    "# Reviewed concept\n",
  )
  fs.writeFileSync(unreviewed, eligible)
  assert.throws(() => assertCombinedReviewSources(f.ctx, prepared), /registry changed/)
  fs.writeFileSync(unreviewed, noteText({ title: "Unreviewed" }, "# Unreviewed\n"))
  assertCombinedReviewSources(f.ctx, prepared)
  fs.writeFileSync(path.join(directory, "Reviewed.md"), eligible)
  assert.throws(() => assertCombinedReviewSources(f.ctx, prepared), /registry changed/)
})
test("one combined result passes both native validators and re-entry reuses its model output", async (t) => {
  const f = setup(t)
  let calls = 0
  const provider = {
    metadata: async (model) => ({
      model,
      digest: sha256("fixture-provider"),
      runtime: "fixture",
      capabilities: ["completion"],
      thinking: { values: [false, true, "medium", "high"] },
    }),
    structured: async (request) => {
      calls++
      const input = JSON.parse(request.messages[1].content)
      assert.ok(JSON.stringify(request).length <= 20000)
      const p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" })
      assert.equal(input.source_manifest.sha256, p.manifest.sha256)
      return { output: output(p) }
    },
  }
  const one = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "evidence" },
    { baseProvider: provider },
  )
  assert.equal(
    readJSON(f.root, `runs/${f.run}/reviewed-claims.json`).claims[0].review.status,
    "verified",
  )
  assert.equal(
    readJSON(f.root, `runs/${f.run}/editorial-completeness/context.json`).review.fact_decisions
      .length,
    1,
  )
  const two = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "evidence" },
    { baseProvider: provider },
  )
  assert.equal(calls, 1)
  assert.deepEqual(one, two)
})

test("split evidence reviewer labels require a bound reconciliation without repeating healthy decisions", async (t) => {
  const f = setup(t),
    calls = []
  const claims = Array.from({ length: 13 }, (_, i) => ({
    ...structuredClone(f.claim),
    claim_id: "split-claim-" + i,
  }))
  atomicWrite(f.root, `runs/${f.run}/claims.json`, { claims })
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input)
      if (input.task === "combined_review") {
        const value = output(prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }))
        value.part = input.part
        value.reviewer = input.part ? request.model : `${request.model} (true)`
        value.fact_review.claims = value.fact_review.claims.filter((r) =>
          input.assigned_claim_ids.includes(r.claim_id),
        )
        value.important_facts = value.important_facts.filter((r) =>
          input.assigned_claim_ids.includes(r.claim_ref),
        )
        return { output: value }
      }
      assert.equal(input.task, "combined_review_reviewer_reconciliation")
      assert.deepEqual(input.mismatched_parts, [1])
      assert.equal(input.valid_decisions_retained, true)
      return {
        output: {
          schema: "research-reviewer-reconciliation/v1",
          input_sha256: input.input_sha256,
          read_manifest_sha256: input.source_manifest.sha256,
          reviewer: input.reference_reviewer,
          reconciled_parts: [{ part: 1, original_reviewer: request.model }],
          same_bound_model: true,
          reason: "Both labels identify the same explicitly bound model and reasoning setting.",
        },
      }
    },
  }
  const result = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "evidence" },
    { baseProvider: provider },
  )
  assert.equal(calls.length, 3)
  const original = readJSON(f.root, result.response.path)
  assert.notEqual(original.outputs[0].reviewer, original.outputs[1].reviewer)
  const reviewed = readJSON(f.root, `runs/${f.run}/reviewed-claims.json`)
  assert.equal(reviewed.claims.length, 13)
  assert.ok(reviewed.claims.every((claim) => claim.review.status === "verified"))
  await runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider })
  assert.equal(calls.length, 3, "native re-entry reuses the exact reconciliation")
})

test("a different or unresolved reviewer identity cannot be silently reconciled", async (t) => {
  const f = setup(t),
    claims = Array.from({ length: 13 }, (_, i) => ({
      ...structuredClone(f.claim),
      claim_id: "different-reviewer-" + i,
    }))
  atomicWrite(f.root, `runs/${f.run}/claims.json`, { claims })
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      if (input.task === "combined_review") {
        const value = output(prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }))
        value.part = input.part
        value.reviewer = input.part ? request.model : `${request.model} (true)`
        value.fact_review.claims = value.fact_review.claims.filter((r) =>
          input.assigned_claim_ids.includes(r.claim_id),
        )
        value.important_facts = value.important_facts.filter((r) =>
          input.assigned_claim_ids.includes(r.claim_ref),
        )
        return { output: value }
      }
      return {
        output: {
          schema: "research-reviewer-reconciliation/v1",
          input_sha256: input.input_sha256,
          read_manifest_sha256: input.source_manifest.sha256,
          reviewer: input.reference_reviewer,
          reconciled_parts: [{ part: 1, original_reviewer: request.model }],
          same_bound_model: false,
          reason: "The two declared identities cannot be authenticated from this evidence.",
        },
      }
    },
  }
  await assert.rejects(
    runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider }),
    /reviewer identity could not be reconciled/i,
  )
  assert.equal(readJSON(f.root, `runs/${f.run}/reviewed-claims.json`), null)
})

test("a bound Codex reviewer label requires explicit reconciliation without changing part decisions", async (t) => {
  const f = setup(t),
    calls = []
  f.ctx.policy = path.join(f.root, "codex-model-policy.json")
  atomicWrite(
    f.root,
    "codex-model-policy.json",
    JSON.parse(fs.readFileSync("data/research-model-policy-codex.json")),
  )
  atomicWrite(f.root, `runs/${f.run}/claims.json`, {
    claims: Array.from({ length: 13 }, (_, i) => ({
      ...structuredClone(f.claim),
      claim_id: "bound-label-" + i,
    })),
  })
  const alias = "Codex GPT-6 Luna (independent evidence reviewer)"
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input.task)
      if (input.task === "combined_review") {
        const value = output(prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }))
        value.part = input.part
        value.reviewer = input.part ? alias : request.model
        value.fact_review.claims = value.fact_review.claims.filter((r) =>
          input.assigned_claim_ids.includes(r.claim_id),
        )
        value.important_facts = value.important_facts.filter((r) =>
          input.assigned_claim_ids.includes(r.claim_ref),
        )
        return { output: value }
      }
      assert.equal(input.task, "combined_review_reviewer_reconciliation")
      assert.equal(input.valid_decisions_retained, true)
      return {
        output: {
          schema: "research-reviewer-reconciliation/v1",
          input_sha256: input.input_sha256,
          read_manifest_sha256: input.source_manifest.sha256,
          reviewer: input.reference_reviewer,
          reconciled_parts: [{ part: 1, original_reviewer: alias }],
          same_bound_model: true,
          reason:
            "The explicit labels name the configured Codex model and preserve the review parts.",
        },
      }
    },
  }
  const result = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "evidence" },
    { baseProvider: provider },
  )
  assert.equal(calls.filter((x) => x === "combined_review").length, 2)
  assert.equal(calls.filter((x) => x === "combined_review_reviewer_reconciliation").length, 1)
  assert.equal(readJSON(f.root, result.response.path).outputs[1].reviewer, alias)
  assert.equal(readJSON(f.root, `runs/${f.run}/reviewed-claims.json`).claims.length, 13)
})

test("a Codex reviewer label naming a different model remains blocked", async (t) => {
  const f = setup(t)
  f.ctx.policy = path.join(f.root, "codex-model-policy.json")
  atomicWrite(
    f.root,
    "codex-model-policy.json",
    JSON.parse(fs.readFileSync("data/research-model-policy-codex.json")),
  )
  atomicWrite(f.root, `runs/${f.run}/claims.json`, {
    claims: Array.from({ length: 13 }, (_, i) => ({
      ...structuredClone(f.claim),
      claim_id: "different-bound-label-" + i,
    })),
  })
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      assert.equal(input.task, "combined_review")
      const value = output(prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }))
      value.part = input.part
      value.reviewer = input.part
        ? "Codex GPT-6 Astra (independent evidence reviewer)"
        : request.model
      value.fact_review.claims = value.fact_review.claims.filter((r) =>
        input.assigned_claim_ids.includes(r.claim_id),
      )
      value.important_facts = value.important_facts.filter((r) =>
        input.assigned_claim_ids.includes(r.claim_ref),
      )
      return { output: value }
    },
  }
  await assert.rejects(
    runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider }),
    /Reviewer identity could not be reconciled/,
  )
  assert.equal(readJSON(f.root, `runs/${f.run}/reviewed-claims.json`), null)
})

test("reviewer reconciliation rejects changed part evidence before recording native facts", async (t) => {
  const f = setup(t)
  const claims = Array.from({ length: 13 }, (_, i) => ({
    ...structuredClone(f.claim),
    claim_id: "tampered-review-part-" + i,
  }))
  atomicWrite(f.root, `runs/${f.run}/claims.json`, { claims })
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      if (input.task === "combined_review") {
        const value = output(prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }))
        value.part = input.part
        value.reviewer = input.part ? request.model : `${request.model} (true)`
        value.fact_review.claims = value.fact_review.claims.filter((row) =>
          input.assigned_claim_ids.includes(row.claim_id),
        )
        value.important_facts = value.important_facts.filter((row) =>
          input.assigned_claim_ids.includes(row.claim_ref),
        )
        return { output: value }
      }
      assert.equal(input.task, "combined_review_reviewer_reconciliation")
      fs.appendFileSync(input.part_responses[1].result.file, " ")
      return {
        output: {
          schema: "research-reviewer-reconciliation/v1",
          input_sha256: input.input_sha256,
          read_manifest_sha256: input.source_manifest.sha256,
          reviewer: input.reference_reviewer,
          reconciled_parts: [{ part: 1, original_reviewer: request.model }],
          same_bound_model: true,
          reason: "The declared labels identify the bound model and reasoning setting.",
        },
      }
    },
  }
  await assert.rejects(
    runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider }),
    /reviewer reconciliation source responses changed/i,
  )
  assert.equal(readJSON(f.root, `runs/${f.run}/reviewed-claims.json`), null)
})

test("draft preflight blocks an unsupported Korean time-zone qualifier in prose and metadata", async (t) => {
  const f = await editorialSetup(t)
  const claims = readJSON(f.root, `runs/${f.run}/reviewed-claims.json`).claims
  const draft = structuredClone(f.record.draft)
  draft.lead[0].text = draft.lead[0].text.replace("2026년 9월 27일", "2026년 9월 27일(한국시간)")
  draft.lead[0].claim_ids = [f.ids[0]]
  draft.facts.when = "2026년 9월 27일(한국시간)"
  assert.ok(draftProblems(draft, claims).includes("unsupported_time_zone_qualification"))

  const metadataOnly = structuredClone(f.record.draft)
  metadataOnly.facts.when = draft.facts.when
  assert.ok(draftProblems(metadataOnly, claims).includes("unsupported_time_zone_qualification"))

  const proseOnly = structuredClone(draft)
  proseOnly.facts.when = "2026년 9월 27일"
  const unrelated = structuredClone(claims)
  unrelated[1].evidence[0].quote += " (KST)"
  assert.ok(
    draftProblems(proseOnly, unrelated).includes("unsupported_time_zone_qualification"),
    "a different claim's timezone cannot support this sentence",
  )
  const supported = structuredClone(claims)
  supported[0].evidence[0].quote += " (KST)"
  assert.ok(!draftProblems(draft, supported).includes("unsupported_time_zone_qualification"))
  const timestamped = structuredClone(claims)
  timestamped[0].published_at = "2026-09-26T16:00:00Z"
  assert.ok(
    !draftProblems(draft, timestamped).includes("unsupported_time_zone_qualification"),
    "a matching explicit source publication timestamp supports its Korean calendar day",
  )
  timestamped[0].evidence[0].quote = "As of September 27, 2026, the event was retired."
  assert.ok(
    draftProblems(draft, timestamped).includes("unsupported_time_zone_qualification"),
    "the publication timestamp cannot assign a time zone to a separate date-only event",
  )
  const publication = structuredClone(f.record.draft)
  publication.lead[0].text =
    "한국시간 2026년 9월 27일 게시한 안내에서 로봇 주문을 발표했다고 밝혔다."
  publication.lead[0].claim_ids = [f.ids[0]]
  assert.ok(
    !draftProblems(publication, timestamped).includes("unsupported_time_zone_qualification"),
    "an explicitly labelled publication time can coexist with a date-only event",
  )
  publication.lead[0].text = "공지 게시일은 2026년 9월 27일(한국시간)이다."
  publication.facts.when = "공지 게시일은 2026년 9월 27일(한국시간); 사건은 2026년 9월 28일"
  assert.ok(
    !draftProblems(publication, timestamped).includes("unsupported_time_zone_qualification"),
    "a preceding publication label supports the matching date without capturing a later event",
  )
  publication.lead[0].text = "2026년 9월 27일(한국시간) 공지에서 사건을 밝혔다."
  publication.facts.when = "2026-09-27 (한국시간; 원문 발표 2026-09-26T16:00:00Z)"
  assert.ok(
    !draftProblems(publication, timestamped).includes("unsupported_time_zone_qualification"),
    "a source timestamp following the Korean date is not another Korean date",
  )
  assert.ok(!draftProblems(f.record.draft, claims).includes("unsupported_time_zone_qualification"))
})

test("an importance-time repair remains required after its original future time passes", async (t) => {
  const f = setup(t),
    future = Date.now() + 60_000,
    calls = []
  let pending = true
  const provider = {
    metadata: fixtureMetadata,
    prepareStructured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      if (input.component === "importance-review-time" && pending) {
        pending = false
        const error = Error("Waiting for the explicit importance time repair")
        error.code = "REASONING_PENDING"
        throw error
      }
    },
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input.component || input.task)
      if (input.task === "combined_review") {
        const value = output(prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }))
        value.importance_reviewed_at = new Date(future).toISOString()
        return { output: value }
      }
      assert.equal(input.component, "importance-review-time")
      return { output: { importance_reviewed_at: "2026-10-26" } }
    },
  }
  await assert.rejects(
    runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider }),
    (error) => error.code === "REASONING_PENDING",
  )
  const originalNow = Date.now
  Date.now = () => future + 1_000
  try {
    await runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider })
  } finally {
    Date.now = originalNow
  }
  assert.deepEqual(calls, ["combined_review", "importance-review-time"])
  const context = readJSON(f.root, `runs/${f.run}/editorial-completeness/context.json`)
  assert.equal(context.review.reviewed_at, "2026-10-26")
})

test("an invalid importance time and a missing aspect receive separate resumable repairs", async (t) => {
  const f = setup(t)
  const other = { ...structuredClone(f.claim), claim_id: "other-claim" }
  atomicWrite(f.root, `runs/${f.run}/claims.json`, { claims: [f.claim, other] })
  const calls = []
  let pending = true
  const provider = {
    metadata: fixtureMetadata,
    prepareStructured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      if (input.component === "important_facts" && pending) {
        pending = false
        const error = Error("Waiting for the exact missing importance decision")
        error.code = "REASONING_PENDING"
        throw error
      }
    },
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input.component || input.task)
      if (input.task === "combined_review") {
        const value = output(prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }))
        value.importance_reviewed_at = "2026-10-26T12:00:00+0900"
        value.important_facts[0].required_aspects = ["fact"]
        return { output: value }
      }
      if (input.component === "importance-review-time")
        return { output: { importance_reviewed_at: "2026-10-26" } }
      assert.equal(input.component, "important_facts")
      assert.deepEqual(input.assigned_claim_ids, [f.claim.claim_id])
      assert.deepEqual(input.native_requirements[0].minimum_when_important, [
        "fact",
        "plan_execution",
      ])
      return {
        output: {
          important_facts: [
            {
              claim_ref: f.claim.claim_id,
              important: true,
              reason: "The original announcement is an important fact",
              required_aspects: ["fact", "plan_execution"],
            },
          ],
          importance_reviewed_at: "2026-10-26",
        },
      }
    },
  }
  await assert.rejects(
    runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider }),
    (error) => error.code === "REASONING_PENDING",
  )
  assert.equal(readJSON(f.root, `runs/${f.run}/editorial-completeness/context.json`), null)
  const reviewed = fs.readFileSync(safePath(f.root, `runs/${f.run}/reviewed-claims.json`))
  await runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider })
  assert.deepEqual(calls, ["combined_review", "importance-review-time", "important_facts"])
  assert.deepEqual(
    fs.readFileSync(safePath(f.root, `runs/${f.run}/reviewed-claims.json`)),
    reviewed,
  )
  const context = readJSON(f.root, `runs/${f.run}/editorial-completeness/context.json`)
  assert.equal(context.review.fact_decisions.length, 2)
  assert.deepEqual(
    context.review.fact_decisions.find((row) => row.claim_id === other.claim_id).required_aspects,
    aspects,
  )
})

test("an invalid repaired importance date cannot be hidden by an aspect repair", async (t) => {
  const f = setup(t),
    calls = []
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input.component || input.task)
      if (input.task === "combined_review") {
        const value = output(prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }))
        value.importance_reviewed_at = "2026-10-26T12:00:00+0900"
        value.important_facts[0].required_aspects = ["fact"]
        return { output: value }
      }
      assert.equal(input.component, "importance-review-time")
      return { output: { importance_reviewed_at: "2020-01-01" } }
    },
  }
  await assert.rejects(
    runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider }),
    /review date/i,
  )
  assert.deepEqual(calls, ["combined_review", "importance-review-time"])
  assert.equal(readJSON(f.root, `runs/${f.run}/editorial-completeness/context.json`), null)
})

test("an editorial time repair survives a day change without repeating valid decisions", async (t) => {
  const f = await editorialSetup(t, { claimCount: 1 }),
    future = Date.now() + 2 * 86_400_000,
    tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
      new Date(Date.now() + 86_400_000),
    ),
    calls = []
  let pending = true
  const provider = {
    metadata: fixtureMetadata,
    prepareStructured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      if (input.component === "editorial-review-date-0" && pending) {
        pending = false
        const error = Error("Waiting for the explicit editorial review date")
        error.code = "REASONING_PENDING"
        throw error
      }
    },
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input.component || input.task)
      if (input.task === "combined_review") {
        const value = editorialOutput(
          prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
        )
        value.editorial_review.reviewed_at = tomorrow
        return { output: value }
      }
      assert.equal(input.component, "editorial-review-date-0")
      return { output: { reviewed_at: "2026-10-26" } }
    },
  }
  await assert.rejects(
    runCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }, { baseProvider: provider }),
    (error) => error.code === "REASONING_PENDING",
  )
  const originalNow = Date.now
  Date.now = () => future
  try {
    const result = await runCombinedReview(
      f.ctx,
      { run_id: f.run, kind: "editorial" },
      { baseProvider: provider },
    )
    const review = JSON.parse(fs.readFileSync(path.join(f.ctx.repo, result.editorial_review_file)))
    assert.equal(review.reviewed_at, "2026-10-26")
    assert.equal(review.numbers_checked, true)
  } finally {
    Date.now = originalNow
  }
  assert.deepEqual(calls, ["combined_review", "editorial-review-date-0"])
})

test("a coverage time with an unverifiable model result is not repaired into an approval", async (t) => {
  const f = await editorialSetup(t, { claimCount: 1 })
  let calls = 0
  const provider = {
    metadata: fixtureMetadata,
    structured: async () => {
      calls++
      return {
        output: editorialOutput(prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" })),
        provenance: {
          task_id: "reasoning-" + "0".repeat(64),
          request_sha256: "0".repeat(64),
          result_sha256: "0".repeat(64),
        },
      }
    },
  }
  await assert.rejects(
    runCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }, { baseProvider: provider }),
    (error) => error.code === "REVIEW_TIME_BINDING_INVALID",
  )
  assert.equal(calls, 1)
  assert.equal(readJSON(f.root, `runs/${f.run}/editorial-review.json`), null)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("a coverage-time repair remains required after its original future time passes", async (t) => {
  const f = await editorialSetup(t, { claimCount: 1 }),
    future = Date.now() + 60_000,
    calls = []
  let pending = true
  const provider = {
    metadata: fixtureMetadata,
    prepareStructured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      if (input.component === "coverage-date-0" && pending) {
        pending = false
        const error = Error("Waiting for the explicit coverage time repair")
        error.code = "REASONING_PENDING"
        throw error
      }
    },
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input.component || input.task)
      if (input.task === "combined_review") {
        const value = editorialOutput(
          prepareCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }),
        )
        value.coverage_reviewed_at = new Date(future).toISOString()
        return { output: value }
      }
      assert.equal(input.component, "coverage-date-0")
      return { output: { reviewed_at: "2026-10-26" } }
    },
  }
  await assert.rejects(
    runCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }, { baseProvider: provider }),
    (error) => error.code === "REASONING_PENDING",
  )
  const originalNow = Date.now
  Date.now = () => future + 1_000
  try {
    await runCombinedReview(f.ctx, { run_id: f.run, kind: "editorial" }, { baseProvider: provider })
  } finally {
    Date.now = originalNow
  }
  assert.deepEqual(calls, ["combined_review", "coverage-date-0"])
})

test("a fact review time cannot be later than its saved model result", async (t) => {
  const f = setup(t),
    originalNow = Date.now,
    future = originalNow() + 60_000,
    calls = []
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input.component || input.task)
      if (input.task === "combined_review") {
        const value = output(prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }))
        value.reviewed_at = new Date(future).toISOString()
        // The local clock moves beyond the supplied time before the part is
        // applied; its saved model result is nevertheless from before it.
        Date.now = () => future + 1_000
        return { output: value }
      }
      assert.equal(input.component, "fact-decisions-part-0")
      assert.match(input.native_fact_errors[0].native_error, /recorded model result/)
      return { output: { claims: input.original_response, reviewed_at: "2026-10-26" } }
    },
  }
  try {
    await runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider })
  } finally {
    Date.now = originalNow
  }
  assert.deepEqual(calls, ["combined_review", "fact-decisions-part-0"])
  assert.equal(
    readJSON(f.root, `runs/${f.run}/reviewed-claims.json`).claims[0].review.reviewed_at,
    "2026-10-26",
  )
})

test("a pending fact-time repair cannot disappear when the clock passes the original time", async (t) => {
  const f = setup(t),
    future = Date.now() + 60_000,
    calls = []
  let pending = true
  const provider = {
    metadata: fixtureMetadata,
    prepareStructured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      if (input.component === "fact-decisions-part-0" && pending) {
        pending = false
        const error = Error("Waiting for the explicit fact repair")
        error.code = "REASONING_PENDING"
        throw error
      }
    },
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input.component || input.task)
      if (input.task === "combined_review") {
        const value = output(prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }))
        value.reviewed_at = new Date(future).toISOString()
        return { output: value }
      }
      assert.equal(input.component, "fact-decisions-part-0")
      assert.match(input.native_fact_errors[0].native_error, /future/)
      return { output: { claims: input.original_response, reviewed_at: "2026-10-26" } }
    },
  }
  await assert.rejects(
    runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider }),
    (error) => error.code === "REASONING_PENDING",
  )
  assert.equal(readJSON(f.root, `runs/${f.run}/reviewed-claims.json`), null)
  const originalNow = Date.now
  Date.now = () => future + 1_000
  try {
    await runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider })
  } finally {
    Date.now = originalNow
  }
  assert.deepEqual(calls, ["combined_review", "fact-decisions-part-0"])
  assert.equal(
    readJSON(f.root, `runs/${f.run}/reviewed-claims.json`).claims[0].review.reviewed_at,
    "2026-10-26",
  )
})

test("a fact-time repair remains bound after the clock passes the original review time", async (t) => {
  const f = setup(t),
    now = Date.now(),
    future = now + 60_000,
    calls = []
  let pendingImportance = true
  const provider = {
    metadata: fixtureMetadata,
    prepareStructured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      if (input.component === "important_facts" && pendingImportance) {
        pendingImportance = false
        const error = Error("Waiting for explicit importance repair")
        error.code = "REASONING_PENDING"
        throw error
      }
    },
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input.component || input.task)
      if (input.task === "combined_review") {
        const value = output(prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }))
        value.reviewed_at = new Date(future).toISOString()
        value.important_facts = []
        return { output: value }
      }
      if (input.component === "fact-decisions-part-0") {
        assert.match(input.native_fact_errors[0].native_error, /future/)
        return { output: { claims: input.original_response, reviewed_at: "2026-10-26" } }
      }
      assert.equal(input.component, "important_facts")
      return {
        output: {
          importance_reviewed_at: "2026-10-26",
          important_facts: [
            {
              claim_ref: f.claim.claim_id,
              important: true,
              reason: "The source announcement is a core fact",
              required_aspects: aspects,
            },
          ],
        },
      }
    },
  }
  await assert.rejects(
    runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider }),
    (error) => error.code === "REASONING_PENDING",
  )
  const original = fs.readFileSync(safePath(f.root, `runs/${f.run}/reviewed-claims.json`))
  const prepared = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" })
  const triggerPath = prepared.base + "repair-triggers/fact-decisions-part-0-0.json"
  const triggerBytes = fs.readFileSync(safePath(f.root, triggerPath))
  const changedTrigger = JSON.parse(triggerBytes)
  changedTrigger.input_sha256 = "0".repeat(64)
  fs.writeFileSync(safePath(f.root, triggerPath), JSON.stringify(changedTrigger))
  await assert.rejects(
    runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider }),
    /Fact repair trigger binding changed/,
  )
  fs.writeFileSync(safePath(f.root, triggerPath), triggerBytes)
  const originalNow = Date.now
  Date.now = () => future + 1_000
  try {
    await runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider })
  } finally {
    Date.now = originalNow
  }
  assert.deepEqual(calls, ["combined_review", "fact-decisions-part-0", "important_facts"])
  assert.deepEqual(
    fs.readFileSync(safePath(f.root, `runs/${f.run}/reviewed-claims.json`)),
    original,
  )
  assert.ok(readJSON(f.root, `runs/${f.run}/editorial-completeness/context.json`))
})

test("an invalid importance portion preserves native fact review and asks only for missing decisions", async (t) => {
  const f = setup(t),
    seen = []
  const provider = {
    metadata: async (model) => ({
      model,
      digest: sha256("partial-fixture"),
      runtime: "fixture",
      capabilities: ["completion"],
      thinking: { values: [false, true, "medium", "high"] },
    }),
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      seen.push(input)
      if (input.task === "combined_review") {
        const p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" })
        const value = output(p)
        delete value.important_facts[0].reason
        assert.ok(input.native_fact_decision_schemas.importance.required.includes("reason"))
        await submitOwnedFixtureResponse(f, request, value, "importance")
        return { output: value }
      }
      assert.equal(input.task, "combined_review_repair")
      assert.equal(input.component, "important_facts")
      assert.deepEqual(input.native_requirements[0].minimum_when_important, [
        "fact",
        "plan_execution",
      ])
      assert.deepEqual(input.assigned_claim_ids, [f.claim.claim_id])
      assert.equal(
        readJSON(f.root, `runs/${f.run}/reviewed-claims.json`).claims[0].review.status,
        "verified",
      )
      return {
        output: {
          important_facts: [
            {
              claim_ref: f.claim.claim_id,
              important: true,
              reason: "The source announcement is a core fact",
              required_aspects: aspects,
            },
          ],
          importance_reviewed_at: "2026-10-26",
        },
      }
    },
  }
  await runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider })
  const original = fs.readFileSync(safePath(f.root, `runs/${f.run}/reviewed-claims.json`))
  await runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider })
  assert.equal(seen.length, 2)
  assert.deepEqual(
    fs.readFileSync(safePath(f.root, `runs/${f.run}/reviewed-claims.json`)),
    original,
  )
  assert.ok(readJSON(f.root, `runs/${f.run}/editorial-completeness/context.json`))
})

test("a wrong combined input SHA cannot create native fact or approval artifacts", async (t) => {
  const f = setup(t)
  const provider = {
    metadata: async (model) => ({
      model,
      digest: sha256("wrong-sha-fixture"),
      runtime: "fixture",
      capabilities: ["completion"],
      thinking: { values: [false, true, "medium", "high"] },
    }),
    structured: async () => {
      const p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }),
        value = output(p)
      value.input_sha256 = "0".repeat(64)
      return { output: value }
    },
  }
  await assert.rejects(
    runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider }),
  )
  assert.equal(readJSON(f.root, `runs/${f.run}/reviewed-claims.json`), null)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("an unbound importance decision cannot be dropped or converted into a fact approval", async (t) => {
  const f = setup(t)
  await assert.rejects(
    runCombinedReview(
      f.ctx,
      { run_id: f.run, kind: "evidence" },
      {
        baseProvider: {
          metadata: fixtureMetadata,
          structured: async () => {
            const value = output(prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }))
            value.important_facts.push({
              important: true,
              reason: "Unbound fact",
              required_aspects: ["fact"],
            })
            return { output: value }
          },
        },
      },
    ),
    /Importance decision is unbound/,
  )
  assert.equal(readJSON(f.root, `runs/${f.run}/reviewed-claims.json`), null)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("reported attributed facts expose native minimums and a bounded follow-up retains valid fact review", async (t) => {
  const f = setup(t)
  f.claim.claim_kind = "attributed_fact"
  atomicWrite(f.root, `runs/${f.run}/claims.json`, { claims: [f.claim] })
  const components = []
  const provider = {
    metadata: async (model) => ({
      model,
      digest: sha256("native-aspects-fixture"),
      runtime: "fixture",
      capabilities: ["completion"],
      thinking: { values: [false, true, "medium", "high"] },
    }),
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      if (input.task === "combined_review") {
        const p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }),
          value = output(p)
        value.important_facts[0].required_aspects = ["fact", "attribution"]
        return { output: value }
      }
      components.push(input.component)
      const minimum = input.native_requirements[0].minimum_when_important
      assert.deepEqual(minimum, ["fact", "plan_execution", "attribution"])
      assert.equal(
        readJSON(f.root, `runs/${f.run}/reviewed-claims.json`).claims[0].review.status,
        "verified",
      )
      return {
        output: {
          importance_reviewed_at: "2026-10-26",
          important_facts: [
            {
              claim_ref: f.claim.claim_id,
              important: true,
              reason: "Original announcement and attribution preserved",
              required_aspects:
                components.length === 1 ? ["plan_execution", "attribution"] : minimum,
            },
          ],
        },
      }
    },
  }
  await runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider })
  assert.deepEqual(components, ["important_facts", "important_facts-followup"])
  await runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider })
  assert.equal(components.length, 2)
})

test("the same native selected-event scope gate rejects an out-of-scope verified fact", (t) => {
  const f = setup(t),
    p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" })
  const projected = projectCombinedEvidence(p, [output(p)])
  const proof = projected.claims[0].evidence[0]
  const selected = {
    sources: [
      {
        parse_id: proof.parse_id,
        source_version_id: proof.source_version_id,
        block_ids: [proof.block_id],
      },
    ],
  }
  assert.doesNotThrow(() => assertSelectedEventFactScope(selected, projected.claims))
  selected.sources[0].block_ids = []
  assert.throws(
    () => assertSelectedEventFactScope(selected, projected.claims),
    /outside the selected event block scope/,
  )
})

test("an addition repair with a future review time requires a time-only repair on re-entry", async (t) => {
  const f = setup(t),
    future = Date.now() + 60_000,
    calls = []
  let pending = true
  const provider = {
    metadata: fixtureMetadata,
    prepareStructured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      if (input.component === "source-additions-review-time-0" && pending) {
        pending = false
        const error = Error("Waiting for the explicit addition review time")
        error.code = "REASONING_PENDING"
        throw error
      }
    },
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input.component || input.task)
      if (input.task === "combined_review") {
        const value = output(prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }))
        const claim = Object.fromEntries(
          [
            "statement",
            "claim_kind",
            "subject",
            "event_state",
            "published_at",
            "effective_period",
            "numbers",
            "evidence",
            "candidate_key",
          ].map((key) => [key, structuredClone(f.claim[key])]),
        )
        claim.evidence[0].quote = "Not in the original source"
        value.fact_review.additions = [
          {
            claim,
            decision: {
              reason: "Invalid addition",
              source_read: true,
              entailment_checked: true,
              identity_checked: true,
              numbers_checked: true,
              time_checked: true,
            },
          },
        ]
        return { output: value }
      }
      if (input.component === "source-additions")
        return {
          output: {
            decisions: [{ index: 0, disposition: "omit", reason: "The quote is unsupported" }],
            reviewed_at: new Date(future).toISOString(),
          },
        }
      assert.equal(input.component, "source-additions-review-time-0")
      return { output: { reviewed_at: "2026-10-26" } }
    },
  }
  await assert.rejects(
    runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider }),
    (error) => error.code === "REASONING_PENDING",
  )
  assert.equal(readJSON(f.root, `runs/${f.run}/reviewed-claims.json`), null)
  const originalNow = Date.now
  Date.now = () => future + 1_000
  try {
    await runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider })
  } finally {
    Date.now = originalNow
  }
  assert.deepEqual(calls, ["combined_review", "source-additions", "source-additions-review-time-0"])
  assert.equal(readJSON(f.root, `runs/${f.run}/reviewed-claims.json`).claims.length, 1)
})

test("an invalid source addition receives an explicit omission while the valid fact and importance stay intact", async (t) => {
  const f = setup(t)
  let calls = 0
  const provider = {
    metadata: async (model) => ({
      model,
      digest: sha256("addition-fixture"),
      runtime: "fixture",
      capabilities: ["completion"],
      thinking: { values: [false, true, "medium", "high"] },
    }),
    structured: async (request) => {
      calls++
      const input = JSON.parse(request.messages[1].content)
      if (input.task === "combined_review") {
        const p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }),
          value = output(p)
        const claim = Object.fromEntries(
          [
            "statement",
            "claim_kind",
            "subject",
            "event_state",
            "published_at",
            "effective_period",
            "numbers",
            "evidence",
            "candidate_key",
          ].map((k) => [k, structuredClone(f.claim[k])]),
        )
        claim.evidence[0].quote = "This is not in the original source"
        value.fact_review.additions = [
          {
            claim,
            decision: {
              reason: "invalid fixture addition",
              source_read: true,
              entailment_checked: true,
              identity_checked: true,
              numbers_checked: true,
              time_checked: true,
            },
          },
        ]
        value.important_facts.push({
          claim_ref: "addition:0",
          important: true,
          reason: "invalid fixture",
          required_aspects: aspects,
        })
        return { output: value }
      }
      assert.equal(input.component, "source-additions")
      assert.deepEqual(input.assigned_claim_ids, ["addition:0"])
      return {
        output: {
          decisions: [
            {
              index: 0,
              disposition: "omit",
              reason: "The quote is absent; retain the original verified fact",
            },
          ],
          reviewed_at: "2026-10-26",
        },
      }
    },
  }
  await runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider })
  assert.equal(calls, 2)
  assert.equal(readJSON(f.root, `runs/${f.run}/reviewed-claims.json`).claims.length, 1)
  assert.equal(
    readJSON(f.root, `runs/${f.run}/editorial-completeness/context.json`).review.fact_decisions
      .length,
    1,
  )
})

function sourceAdditionFixture(f, p, index) {
  const { schema, claim_id, review, ...claim } = structuredClone(f.claim)
  const parse = p.packet.parses[0],
    block = parse.blocks[index]
  claim.statement = index ? block.text : "Fixture Robotics and Partner announced the robot order."
  claim.evidence = [
    {
      source_id: parse.source_id,
      source_version_id: parse.source_version_id,
      parse_id: parse.parse_id,
      block_id: block.block_id,
      quote: block.text,
      support: "direct",
    },
  ]
  return {
    claim,
    decision: {
      reason: "Directly checked the exact fixture source block",
      ...Object.fromEntries(
        [
          "source_read",
          "entailment_checked",
          "identity_checked",
          "numbers_checked",
          "time_checked",
        ].map((k) => [k, true]),
      ),
    },
  }
}

function emptySelectedEventFixture(t) {
  const f = setup(t)
  const source = loadStoredSourceRun(f.root, f.run)
  const parse = source.parses[0]
  const selection = {
    schema: "research-event-selection/v1",
    run_id: f.run,
    source_run: f.run,
    source_identity: source.identity,
    sources: [
      {
        role: "primary",
        source_id: parse.source_id,
        source_version_id: parse.source_version_id,
        parse_id: parse.parse_id,
        block_ids: [parse.blocks[0].block_id],
      },
    ],
  }
  const selectionPath = `event-selections/${f.run}/selection.json`
  atomicWrite(f.root, selectionPath, selection)
  const selectionSHA = sha256(fs.readFileSync(safePath(f.root, selectionPath)))
  atomicWrite(f.root, `runs/${f.run}/event-selection.json`, {
    path: selectionPath,
    sha256: selectionSHA,
  })
  const input = {
    schema: "research-selected-event-extraction-input/v1",
    selection_sha256: selectionSHA,
    source_identity: source.identity,
    candidate_key: f.claim.candidate_key,
    settings: {},
    dependencies: {},
  }
  atomicWrite(f.root, `runs/${f.run}/event-extraction-input.json`, input)
  atomicWrite(f.root, `runs/${f.run}/claims.json`, {
    claims: [],
    provenance: { schema: "research-event-fact-extraction/v1", input, sources: [] },
    requires_fact_review: true,
  })
  return f
}

test("an empty selected-event extraction requests a source-backed addition and resumes its exact time repair", async (t) => {
  const f = emptySelectedEventFixture(t)
  let originalCalls = 0,
    repairCalls = 0,
    pending = true
  const provider = {
    metadata: fixtureMetadata,
    prepareStructured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      if (input.component === "empty-evidence-review-time-0" && pending) {
        pending = false
        const error = Error("Waiting for the explicit source review time")
        error.code = "REASONING_PENDING"
        throw error
      }
    },
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      if (input.task === "combined_review") {
        originalCalls++
        assert.deepEqual(input.assigned_claim_ids, [])
        const p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" })
        const value = output(p)
        value.reviewed_at = "2026-10-26T12:00:00+0900"
        value.fact_review.additions = [sourceAdditionFixture(f, p, 0)]
        value.important_facts = [
          {
            claim_ref: "addition:0",
            important: true,
            reason: "The original source states the selected event",
            required_aspects: aspects,
          },
        ]
        assert.deepEqual(
          input.native_fact_decision_schemas.additions.properties.claim.properties.candidate_key
            .enum,
          [f.claim.candidate_key],
        )
        return { output: value }
      }
      repairCalls++
      assert.equal(input.component, "empty-evidence-review-time-0")
      assert.deepEqual(input.assigned_claim_ids, [])
      return { output: { reviewed_at: "2026-10-26" } }
    },
  }
  await assert.rejects(
    runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider }),
    (error) => error.code === "REASONING_PENDING",
  )
  assert.equal(readJSON(f.root, `runs/${f.run}/reviewed-claims.json`), null)
  await runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider })
  const reviewed = readJSON(f.root, `runs/${f.run}/reviewed-claims.json`)
  assert.equal(originalCalls, 1)
  assert.equal(repairCalls, 1)
  assert.equal(reviewed.claims.length, 1)
  assert.equal(reviewed.claims[0].candidate_key, f.claim.candidate_key)
  assert.equal(reviewed.claims[0].review.status, "verified")
  assert.equal(reviewed.claims[0].review.origin, "direct_source_addition")
  assert.equal(
    readJSON(f.root, `runs/${f.run}/editorial-completeness/context.json`).review.fact_decisions
      .length,
    1,
  )
})

test("an empty selected-event review without a supported addition never creates a reviewed or approved article", async (t) => {
  const f = emptySelectedEventFixture(t)
  const provider = {
    metadata: fixtureMetadata,
    structured: async () => ({
      output: output(prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" })),
    }),
  }
  await assert.rejects(
    runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider }),
    (error) => error.code === "SOURCE_REVIEW_EMPTY",
  )
  assert.equal(readJSON(f.root, `runs/${f.run}/reviewed-claims.json`), null)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("an empty extraction cannot supply a candidate from a changed or unbound source identity", async (t) => {
  const f = emptySelectedEventFixture(t)
  const input = readJSON(f.root, `runs/${f.run}/event-extraction-input.json`)
  atomicWrite(f.root, `runs/${f.run}/event-extraction-input.json`, {
    ...input,
    candidate_key: "source-unrelated",
  })
  let calls = 0
  await assert.rejects(
    runCombinedReview(
      f.ctx,
      { run_id: f.run, kind: "evidence" },
      { baseProvider: { metadata: fixtureMetadata, structured: async () => void calls++ } },
    ),
    /empty.*extraction.*binding/i,
  )
  assert.equal(calls, 0)
  assert.equal(readJSON(f.root, `runs/${f.run}/reviewed-claims.json`), null)
})

test("matching forged empty-extraction records cannot introduce an unrelated candidate", async (t) => {
  const f = emptySelectedEventFixture(t)
  const input = readJSON(f.root, `runs/${f.run}/event-extraction-input.json`)
  const extracted = readJSON(f.root, `runs/${f.run}/claims.json`)
  const forged = { ...input, candidate_key: "source-unrelated" }
  atomicWrite(f.root, `runs/${f.run}/event-extraction-input.json`, forged)
  atomicWrite(f.root, `runs/${f.run}/claims.json`, {
    ...extracted,
    provenance: { ...extracted.provenance, input: forged },
  })
  let calls = 0
  await assert.rejects(
    runCombinedReview(
      f.ctx,
      { run_id: f.run, kind: "evidence" },
      { baseProvider: { metadata: fixtureMetadata, structured: async () => void calls++ } },
    ),
    /empty.*extraction.*binding/i,
  )
  assert.equal(calls, 0)
  assert.equal(readJSON(f.root, `runs/${f.run}/reviewed-claims.json`), null)
})

test("a model cannot submit an original claim decision outside an empty assigned scope", async (t) => {
  const f = emptySelectedEventFixture(t)
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      if (input.component === "empty-evidence-claims-part-0")
        return { output: { claims: [{ claim_id: "unassigned" }] } }
      const value = output(prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }))
      value.fact_review.claims.push({ claim_id: "unassigned", status: "verified" })
      return { output: value }
    },
  }
  await assert.rejects(
    runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider }),
    /unassigned.*empty/i,
  )
  assert.equal(readJSON(f.root, `runs/${f.run}/reviewed-claims.json`), null)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
})

test("an empty-scope phantom claim is repaired without repeating a valid source addition", async (t) => {
  const f = emptySelectedEventFixture(t),
    calls = []
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input.component || input.task)
      if (input.component === "empty-evidence-claims-part-0") {
        assert.deepEqual(input.assigned_claim_ids, [])
        assert.equal(input.valid_decisions_retained, true)
        return { output: { claims: [] } }
      }
      const p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" })
      const value = output(p)
      value.fact_review.claims.push({ claim_id: "unassigned", status: "verified" })
      value.fact_review.additions = [sourceAdditionFixture(f, p, 0)]
      value.important_facts = [
        {
          claim_ref: "addition:0",
          important: true,
          reason: "The original source states the selected event",
          required_aspects: aspects,
        },
      ]
      return { output: value }
    },
  }
  await runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider })
  assert.deepEqual(calls, ["combined_review", "empty-evidence-claims-part-0"])
  const reviewed = readJSON(f.root, `runs/${f.run}/reviewed-claims.json`)
  assert.equal(reviewed.claims.length, 1)
  assert.equal(reviewed.claims[0].review.origin, "direct_source_addition")
})

test("an empty selected-event review cannot promote an unbound candidate or out-of-scope source addition", async (t) => {
  for (const variant of ["candidate", "source-scope"]) {
    await t.test(variant, async (t) => {
      const f = emptySelectedEventFixture(t)
      let repairs = 0
      const provider = {
        metadata: fixtureMetadata,
        structured: async (request) => {
          const input = JSON.parse(request.messages[1].content)
          if (input.task === "combined_review") {
            const p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" })
            const value = output(p)
            const addition = sourceAdditionFixture(f, p, variant === "source-scope" ? 1 : 0)
            if (variant === "candidate") addition.claim.candidate_key = "source-unrelated"
            value.fact_review.additions = [addition]
            value.important_facts = [
              {
                claim_ref: "addition:0",
                important: true,
                reason: "Proposed source fact for an explicit validity check",
                required_aspects: aspects,
              },
            ]
            return { output: value }
          }
          repairs++
          assert.equal(input.component, "source-additions")
          assert.deepEqual(input.assigned_claim_ids, ["addition:0"])
          assert.deepEqual(input.native_addition_contract.allowed_candidate_keys, [
            f.claim.candidate_key,
          ])
          return {
            output: {
              reviewed_at: "2026-10-26",
              decisions: [{ index: 0, disposition: "omit", reason: "The addition is not bound" }],
            },
          }
        },
      }
      await assert.rejects(
        runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider }),
        (error) => error.code === "SOURCE_REVIEW_EMPTY",
      )
      assert.equal(repairs, 1)
      assert.equal(readJSON(f.root, `runs/${f.run}/reviewed-claims.json`), null)
      assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
    })
  }
})

test("source additions expose native identities and repair only the still-invalid addition", async (t) => {
  const f = setup(t),
    calls = [],
    schemas = []
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      const input = JSON.parse(request.messages[1].content)
      calls.push(input)
      schemas.push(request.schema)
      const p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" })
      const corrected = sourceAdditionFixture(f, p, 0)
      if (calls.length === 1) {
        const value = output(p),
          bad = structuredClone(corrected)
        delete bad.claim.candidate_key
        bad.claim.evidence = [{ block_key: "d1b1", support: "direct" }]
        bad.decision.status = "verified"
        value.fact_review.additions = [bad, sourceAdditionFixture(f, p, 1)]
        value.important_facts.push(
          ...[0, 1].map((i) => ({
            claim_ref: "addition:" + i,
            important: false,
            reason: "The extra source detail is not a core announcement fact",
            required_aspects: ["fact"],
          })),
        )
        await submitOwnedFixtureResponse(f, request, value, "additions")
        return { output: value }
      }
      assert.deepEqual(input.assigned_claim_ids, ["addition:0"])
      assert.equal(input.original_response.length, 1)
      assert.deepEqual(input.native_addition_contract.allowed_candidate_keys, [
        f.claim.candidate_key,
      ])
      assert.ok(input.native_addition_errors[0].error.includes("candidate_key"))
      if (calls.length === 2) {
        assert.equal(input.component, "source-additions")
        delete corrected.claim.candidate_key
        corrected.decision.status = "verified"
      } else assert.equal(input.component, "source-additions-followup-1")
      return {
        output: {
          reviewed_at: "2026-10-26",
          decisions: [
            {
              index: 0,
              disposition: "replace",
              reason: "Retained valid facts and repaired only this source addition",
              addition: corrected,
            },
          ],
        },
      }
    },
  }
  const result = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "evidence" },
    { baseProvider: provider },
  )
  const claims = readJSON(f.root, `runs/${f.run}/reviewed-claims.json`).claims
  assert.equal(claims.length, 3)
  assert.equal(calls.length, 3)
  assert.deepEqual(schemas[0].properties.fact_review.properties.additions.items, { type: "object" })
  const additionSchema = calls[0].native_fact_decision_schemas.additions
  assert.ok(additionSchema.properties.claim.required.includes("candidate_key"))
  assert.deepEqual(additionSchema.properties.claim.properties.candidate_key.enum, [
    f.claim.candidate_key,
  ])
  assert.equal(additionSchema.properties.decision.additionalProperties, false)
  assert.equal("status" in additionSchema.properties.decision.properties, false)
  const healthy = sourceAdditionFixture(
    f,
    prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }),
    1,
  )
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(f.ctx.repo, result.fact_review_file))).additions[1],
    healthy,
  )
  const again = await runCombinedReview(
    f.ctx,
    { run_id: f.run, kind: "evidence" },
    { baseProvider: provider },
  )
  assert.deepEqual(again, result)
  assert.equal(calls.length, 3)
})

test("unresolved source addition repairs are bounded and preserve explicit failure evidence", async (t) => {
  const f = setup(t)
  let calls = 0
  const provider = {
    metadata: fixtureMetadata,
    structured: async (request) => {
      calls++
      const input = JSON.parse(request.messages[1].content)
      const p = prepareCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" })
      const bad = sourceAdditionFixture(f, p, 0)
      delete bad.claim.candidate_key
      if (input.task === "combined_review") {
        const value = output(p)
        value.fact_review.additions = [bad]
        value.important_facts.push({
          claim_ref: "addition:0",
          important: false,
          reason: "Fixture detail",
          required_aspects: ["fact"],
        })
        return { output: value }
      }
      return {
        output: {
          reviewed_at: "2026-10-26",
          decisions: [
            {
              index: 0,
              disposition: "replace",
              reason: "Intentionally invalid fixture recovery",
              addition: bad,
            },
          ],
        },
      }
    },
  }
  await assert.rejects(
    runCombinedReview(f.ctx, { run_id: f.run, kind: "evidence" }, { baseProvider: provider }),
    (error) => error.code === "SOURCE_ADDITIONS_REPAIR_EXHAUSTED",
  )
  assert.equal(calls, 3)
  assert.equal(readJSON(f.root, `runs/${f.run}/approved-article.json`), null)
  assert.equal(readJSON(f.root, `runs/${f.run}/reviewed-claims.json`), null)
})
