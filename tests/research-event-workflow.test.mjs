import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { editionFixture, selectedFixture } from "./fixtures/research-event-fixtures.mjs"
import { executeModule } from "../scripts/research/module-registry.mjs"
import {
  extractEditionEventProposals,
  extractSelectedEventEvidence,
} from "../scripts/research/event-inference.mjs"
import { advanceEventWorkflow } from "../scripts/research/event-workflow.mjs"
import { approveSelectedEvent } from "../scripts/research/event-publication.mjs"
import { draftFingerprint } from "../scripts/research/editor.mjs"
import {
  loadApprovedOntologyInput,
  projectEvidenceOntology,
  extendEvidenceOntology,
} from "../scripts/research/ontology.mjs"
import { atomicWrite, readJSON, safePath } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { advanceDailyCore } from "../scripts/research/daily-core.mjs"

function fakeProvider({ events = false } = {}) {
  let calls = 0
  return {
    get calls() {
      return calls
    },
    async metadata(model) {
      return {
        model,
        digest: sha256("test-installed-model"),
        runtime: "test-runtime",
        capabilities: ["completion"],
        thinking: { values: [false, "medium"] },
      }
    },
    async structured(request) {
      calls++
      const docs = JSON.parse(request.messages[1].content)
      const output = events
        ? {
            events: docs.flatMap((d) =>
              d.blocks.map((b) => ({
                who: "Fixture Robotics",
                action: "announced",
                object: b.text.includes("different") ? "Other customer" : "Contract-123",
                occurred_at: "2026-09-27",
                effective_at: null,
                external_id: null,
                block_keys: [b.block_key],
                quantities: [],
              })),
            ),
          }
        : {
            claims: docs.flatMap((d) =>
              d.blocks.map((b) => ({
                statement: b.text.includes("different")
                  ? "다른 고객에 대한 후속 일정이 별도로 제시됐다."
                  : "Fixture Robotics와 Partner가 2026년 9월 27일 Contract-123 로봇 주문을 발표했다.",
                claim_kind: "fact",
                subject: "Fixture Robotics",
                event_state: "completed",
                published_at: "2026-09-27",
                effective_period: null,
                numbers: [],
                evidence: [{ block_key: b.block_key, support: "direct" }],
              })),
            ),
          }
      return {
        output,
        provenance: {
          model: request.model,
          think: request.think,
          digest: sha256("test-installed-model"),
          prompt_sha256: sha256(JSON.stringify(request.messages)),
        },
      }
    },
  }
}
const fileInRepo = (f, name, value) => {
  atomicWrite(f.root, name, value)
  return path.relative(f.ctx.repo, safePath(f.root, name))
}
async function verifyFacts(f, run) {
  const claims = readJSON(f.root, `runs/${run}/claims.json`).claims
  const review_file = fileInRepo(f, `facts-${run}.json`, {
    reviewer: "test-original-reader",
    reviewed_at: "2026-09-29T01:00:00Z",
    claims: claims.map((c) => ({
      claim_id: c.claim_id,
      status: "verified",
      reason: "Explicitly compared with the exact fixture original block",
      source_read: true,
      entailment_checked: true,
      identity_checked: true,
      numbers_checked: true,
      time_checked: true,
    })),
  })
  await executeModule(f.ctx, "evidence", "review", { run_id: run, review_file })
}
function draftAndReview(f, run, event_id = "abcdef0123456789") {
  const claims = readJSON(f.root, `runs/${run}/reviewed-claims.json`).claims.filter(
    (c) => c.review.status === "verified",
  )
  const ids = claims.map((c) => c.claim_id)
  const draft = {
    title: "Fixture Robotics, Partner와 로봇 주문 발표",
    lead: [
      {
        text: "Fixture Robotics와 Partner는 2026년 9월 27일 Contract-123 로봇 주문을 발표했다.",
        claim_ids: ids,
      },
      {
        text: "이번 발표는 해당 계약을 대상으로 하며 각 원문에 같은 주문이 명시돼 있다.",
        claim_ids: ids,
      },
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
        heading: "계약 대상",
        paragraphs: [
          {
            text: "각 원문은 Contract-123 주문의 주체와 발표 시점을 명시한다. 다른 고객의 별도 일정은 이번 계약의 완료 내용으로 포함하지 않았다.",
            claim_ids: ids,
          },
        ],
      },
    ],
  }
  // Controlled test prose, never a production/model response.
  const record = {
    draft_id: draftFingerprint(draft),
    draft,
    status: "editorial_review",
    problems: [],
    public_approved: false,
  }
  atomicWrite(f.root, `runs/${run}/draft.json`, record)
  const review = {
    status: "approved",
    draft_id: record.draft_id,
    event_id,
    published_at: "2026-09-27",
    reviewed_at: "2026-09-29",
    region: "해외",
    reviewer: "test-final-reader",
    source_read: true,
    final_prose_read: true,
    title_checked: true,
    dates_checked: true,
    numbers_checked: true,
    analysis_checked: true,
    concept_ids: [],
    reader_quality_review: { repetition_checked: true },
  }
  const review_file = fileInRepo(f, `editorial-${run}.json`, review)
  return { record, review, review_file, claims }
}

async function twoEventPlan(f) {
  const other = structuredClone(f.review.events[0])
  other.group_id = "another-customer"
  other.identity = { ...other.identity, object: "Another customer", external_id: null }
  other.materials = [structuredClone(other.materials[0])]
  other.materials[0].block_ids = [f.sources[0].parsed.blocks[1].block_id]
  other.materials[0].evidence.forEach((evidence) => {
    evidence.block_id = f.sources[0].parsed.blocks[1].block_id
    evidence.quote = f.sources[0].parsed.blocks[1].text
  })
  // This progression fixture uses two selected events. Deferred-event identity
  // and writer exclusion are covered by the original module fixtures.
  f.review.events = [f.review.events[0], other]
  atomicWrite(f.root, "review.json", f.review)
  return executeModule(f.ctx, "classification", "review", f.parameters)
}

test("completed and waiting events leave a bounded slot for the next selected event", async (t) => {
  for (const priorStatus of ["fact_review", "approved"]) {
    const f = editionFixture(t),
      provider = fakeProvider(),
      plan = await twoEventPlan(f)
    const p = {
      run_id: "bounded-events",
      edition_path: f.editionRef.path,
      edition_sha256: f.editionRef.sha256,
      plan_path: plan.path,
      plan_sha256: plan.sha256,
      execute: true,
      max_items: 1,
    }
    const first = await advanceEventWorkflow(f.ctx, p, { baseProvider: provider })
    const writer = first.rows.find((row) => row.group_id === "order").writer_run
    assert.equal(first.rows.find((row) => row.group_id === "another-customer").status, "queued")
    if (priorStatus === "approved") {
      await verifyFacts(f, writer)
      const { review_file } = draftAndReview(f, writer)
      await approveSelectedEvent(f.ctx, { run_id: writer, review_file })
    }
    const second = await advanceEventWorkflow(f.ctx, p, { baseProvider: provider })
    assert.equal(second.rows.find((row) => row.group_id === "order").status, priorStatus)
    assert.equal(
      second.rows.find((row) => row.group_id === "another-customer").status,
      "fact_review",
    )
    const calls = provider.calls
    const again = await advanceEventWorkflow(f.ctx, p, { baseProvider: provider })
    assert.equal(again.model_calls, 0)
    assert.equal(provider.calls, calls)
  }
})

test("failed events require explicit retry and do not starve another selected event", async (t) => {
  const f = editionFixture(t),
    provider = fakeProvider(),
    plan = await twoEventPlan(f)
  const badReview = fileInRepo(f, "invalid-fact-review.json", {})
  const p = {
    run_id: "failure-progress",
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
    plan_path: plan.path,
    plan_sha256: plan.sha256,
    fact_reviews: { order: badReview },
    execute: true,
    max_items: 1,
  }
  const first = await advanceEventWorkflow(f.ctx, p, { baseProvider: provider })
  assert.equal(first.rows.find((row) => row.group_id === "order").status, "failed")
  const second = await advanceEventWorkflow(f.ctx, p, { baseProvider: provider })
  assert.equal(second.rows.find((row) => row.group_id === "order").retry_skipped, true)
  assert.equal(second.rows.find((row) => row.group_id === "another-customer").status, "fact_review")
  const retried = await advanceEventWorkflow(
    f.ctx,
    { ...p, retry_groups: ["order"] },
    { baseProvider: provider },
  )
  assert.equal(retried.rows.find((row) => row.group_id === "order").retry_skipped, undefined)
  assert.equal(retried.rows.find((row) => row.group_id === "order").status, "failed")
})

test("failed model attempts remain counted and are not repeated by an unchanged workflow", async (t) => {
  const f = editionFixture(t),
    plan = await executeModule(f.ctx, "classification", "review", f.parameters)
  const provider = fakeProvider()
  provider.structured = async () => {
    throw Error("controlled local model failure")
  }
  const parameters = {
    run_id: "failed-model-ledger",
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
    plan_path: plan.path,
    plan_sha256: plan.sha256,
    execute: true,
    max_items: 1,
  }
  const first = await advanceEventWorkflow(f.ctx, parameters, { baseProvider: provider })
  assert.equal(first.status, "partial")
  assert.equal(first.model_calls, 1)
  assert.equal(first.article_writes, 0)
  assert.equal(first.publication.status, "partial")
  assert.deepEqual(first.publication.approved_runs, [])
  assert.equal(first.publication.collection_status, "partial")
  const again = await advanceEventWorkflow(f.ctx, parameters, { baseProvider: provider })
  assert.equal(again.model_calls, 0)
  assert.equal(again.rows.find((row) => row.group_id === "order").retry_skipped, true)
})

test("minimal source-grounded event proposals are paged, unreviewed and reused without model calls", async (t) => {
  const f = editionFixture(t),
    provider = fakeProvider({ events: true })
  const p = {
    run_id: "auto-events",
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
    max_items: 1,
  }
  const first = await extractEditionEventProposals(f.ctx, p, { baseProvider: provider })
  assert.equal(first.writer_allowed, false)
  assert.equal(first.proposals.length, 2)
  assert.ok(first.next_offset)
  assert.equal(first.proposals[0].review_status, "unreviewed")
  const count = provider.calls
  const again = await extractEditionEventProposals(f.ctx, p, { baseProvider: provider })
  assert.equal(provider.calls, count)
  assert.equal(again.model_calls, 0)
  assert.deepEqual(again.proposals, first.proposals)
  assert.equal(fs.existsSync(safePath(f.root, "runs/auto-events/draft.json")), false)
})

test("event proposal pagination preserves every page and reports the whole edition frontier", async (t) => {
  const f = editionFixture(t),
    provider = fakeProvider({ events: true })
  const p = {
    run_id: "paged-events",
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
    max_items: 1,
  }
  const first = await extractEditionEventProposals(f.ctx, p, { baseProvider: provider })
  const second = await extractEditionEventProposals(
    f.ctx,
    { ...p, offset: first.next_offset },
    { baseProvider: provider },
  )
  const firstPageBytes = fs.readFileSync(safePath(f.root, first.page_result.path))
  assert.equal(first.overall.processed_material_ids.length, 1)
  assert.equal(first.overall.remaining_material_ids.length, 3)
  assert.equal(readJSON(f.root, "event-proposals/paged-events/result.json"), null)
  let result = second
  while (result.next_offset !== null) {
    result = await extractEditionEventProposals(
      f.ctx,
      { ...p, offset: result.next_offset },
      { baseProvider: provider },
    )
  }
  assert.equal(result.overall.processed_material_ids.length, 4)
  assert.deepEqual(result.overall.remaining_material_ids, [])
  assert.equal(result.overall.next_offset, null)
  assert.deepEqual(fs.readFileSync(safePath(f.root, first.page_result.path)), firstPageBytes)
  const complete = readJSON(f.root, "event-proposals/paged-events/result.json")
  assert.equal(complete.processed_material_ids.length, 4)
  assert.equal(complete.proposals.length, 8)
  assert.equal(complete.writer_allowed, false)
  assert.ok(complete.proposals.every((event) => event.review_status === "unreviewed"))
  const calls = provider.calls
  const repeated = await extractEditionEventProposals(f.ctx, p, { baseProvider: provider })
  assert.equal(provider.calls, calls)
  assert.equal(repeated.model_calls, 0)
  assert.deepEqual(repeated.overall.remaining_material_ids, [])
  await assert.rejects(
    extractEditionEventProposals(
      f.ctx,
      { ...p, material_ids: [first.processed_material_ids[0]] },
      { baseProvider: provider },
    ),
    /input changed/,
  )
})

test("a failed proposal page remains visible after later pages complete and clears only on explicit retry", async (t) => {
  const f = editionFixture(t),
    provider = fakeProvider({ events: true })
  const original = provider.structured.bind(provider)
  let fail = true
  provider.structured = async (request) => {
    if (fail && JSON.parse(request.messages[1].content)[0].title.endsWith("0")) {
      const error = Error("controlled first-page timeout")
      error.name = "TimeoutError"
      throw error
    }
    return original(request)
  }
  const ids = f.sources
    .slice(0, 2)
    .map(
      (source) =>
        f.report.materials.find(
          (material) => material.source_version_id === source.document.source_version_id,
        ).id,
    )
  const p = {
    run_id: "paged-failure",
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
    material_ids: ids,
    max_items: 1,
  }
  const first = await extractEditionEventProposals(f.ctx, p, { baseProvider: provider })
  assert.equal(first.failures.length, 1)
  const second = await extractEditionEventProposals(
    f.ctx,
    { ...p, offset: first.next_offset },
    { baseProvider: provider },
  )
  assert.equal(second.status, "partial")
  assert.equal(second.failures[0].material_id, ids[0])
  assert.deepEqual(second.overall.remaining_material_ids, [ids[0]])
  assert.equal(second.overall.next_offset, 0)
  assert.equal(readJSON(f.root, "event-proposals/paged-failure/result.json"), null)
  fail = false
  const resumed = await extractEditionEventProposals(f.ctx, p, {
    baseProvider: provider,
    retry_failed: true,
  })
  assert.deepEqual(resumed.failures, [])
  assert.deepEqual(resumed.overall.remaining_material_ids, [])
  assert.equal(readJSON(f.root, "event-proposals/paged-failure/result.json").proposals.length, 4)
})

test("one IR source shares fact-only extraction across selected events while preserving the complete parse", async (t) => {
  const f = editionFixture(t),
    provider = fakeProvider()
  const second = structuredClone(f.review.events[0])
  second.group_id = "other-customer"
  second.identity = { ...second.identity, object: "Other customer", external_id: null }
  second.materials = [structuredClone(second.materials[0])]
  second.materials[0].block_ids = [f.sources[0].parsed.blocks[1].block_id]
  second.materials[0].evidence.forEach((e) => {
    e.block_id = f.sources[0].parsed.blocks[1].block_id
    e.quote = f.sources[0].parsed.blocks[1].text
  })
  f.review.events.push(second)
  atomicWrite(f.root, "review.json", f.review)
  const plan = await executeModule(f.ctx, "classification", "review", f.parameters)
  const extract = async (group, run) => {
    const selection = await executeModule(f.ctx, "selection", "prepare", {
      run_id: run,
      plan_path: plan.path,
      plan_sha256: plan.sha256,
      group_id: group,
    })
    return {
      selection,
      result: await extractSelectedEventEvidence(
        f.ctx,
        {
          run_id: selection.writer_run,
          selection_path: selection.path,
          selection_sha256: selection.sha256,
        },
        { baseProvider: provider },
      ),
    }
  }
  const first = await extract("order", "first")
  assert.equal(first.result.model_calls, 3)
  assert.equal(first.result.claims, 3)
  const calls = provider.calls
  const next = await extract("other-customer", "second")
  assert.equal(provider.calls, calls)
  assert.equal(next.result.model_calls, 0)
  assert.equal(next.result.claims, 1)
  const nextClaims = readJSON(f.root, "runs/second/claims.json").claims
  assert.equal(nextClaims[0].evidence[0].block_id, f.sources[0].parsed.blocks[1].block_id)
  assert.equal(readJSON(f.root, "runs/second/parses.json")[0].blocks.length, 2)
  assert.ok(nextClaims.every((c) => c.review.status === "unreviewed"))
  assert.equal(fs.existsSync(safePath(f.root, "runs/second/draft.json")), false)
})

test("event core stops at fact review, resumes native approval and writes no duplicate article", async (t) => {
  const f = editionFixture(t),
    provider = fakeProvider()
  const plan = await executeModule(f.ctx, "classification", "review", f.parameters)
  const p = {
    run_id: "core-events",
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
    plan_path: plan.path,
    plan_sha256: plan.sha256,
    execute: true,
  }
  const first = await advanceEventWorkflow(f.ctx, p, { baseProvider: provider })
  assert.equal(first.status, "review_pending")
  assert.equal(first.article_writes, 0)
  assert.equal(first.publication.status, "review_pending")
  assert.deepEqual(first.publication.approved_runs, [])
  assert.equal(first.publication.collection_status, "partial")
  const run = first.rows[0].writer_run
  await verifyFacts(f, run)
  const { review_file } = draftAndReview(f, run)
  const second = await advanceEventWorkflow(
    f.ctx,
    { ...p, editorial_reviews: { order: review_file } },
    { baseProvider: provider },
  )
  assert.equal(second.status, "complete")
  assert.equal(second.approved_runs.length, 1)
  assert.ok(second.ontology)
  assert.equal(second.publication.status, "approval_ready")
  assert.deepEqual(second.publication.approved_runs, second.approved_runs)
  assert.equal(second.publication.workflow_status, "complete")
  assert.equal(second.publication.candidate_published, false)
  const before = provider.calls
  const third = await advanceEventWorkflow(
    f.ctx,
    { ...p, editorial_reviews: { order: review_file } },
    { baseProvider: provider },
  )
  assert.equal(third.status, "complete")
  assert.equal(third.model_calls, 0)
  assert.equal(third.article_writes, 0)
  assert.equal(provider.calls, before)
  assert.deepEqual(third.approved_runs, second.approved_runs)
})

test("explicit event update preserves ID/date, accounts for prior facts and replaces only its ontology event", async (t) => {
  const f = await selectedFixture(t),
    provider = fakeProvider()
  await extractSelectedEventEvidence(f.ctx, f.selectedParameters, { baseProvider: provider })
  await verifyFacts(f, "writer")
  const original = draftAndReview(f, "writer")
  await approveSelectedEvent(f.ctx, { run_id: "writer", review_file: original.review_file })
  const old = loadApprovedOntologyInput(f.root, "writer", { vault: f.ctx.vault })
  const review = structuredClone(f.review)
  review.events = [review.events[0]]
  const event = review.events[0]
  event.action = "update"
  event.prior_run = "writer"
  event.prior_matches = ["identity_marker", "event_action"].map((aspect) => ({
    aspect,
    parse_id: f.sources[0].parsed.parse_id,
    block_id: f.sources[0].parsed.blocks[0].block_id,
    quote: f.sources[0].parsed.blocks[0].text,
    primary_block_id: f.sources[0].parsed.blocks[0].block_id,
    primary_quote: f.sources[0].parsed.blocks[0].text,
    conclusion: "Exact same contract and action; additional editorial detail",
  }))
  const review_file = fileInRepo(f, "update-plan-review.json", review)
  const plan = await executeModule(f.ctx, "classification", "review", {
    ...f.parameters,
    run_id: "update-plan",
    review_file,
  })
  const selection = await executeModule(f.ctx, "selection", "prepare", {
    run_id: "revision-writer",
    plan_path: plan.path,
    plan_sha256: plan.sha256,
    group_id: "order",
  })
  await extractSelectedEventEvidence(
    f.ctx,
    {
      run_id: "revision-writer",
      selection_path: selection.path,
      selection_sha256: selection.sha256,
    },
    { baseProvider: provider },
  )
  await verifyFacts(f, "revision-writer")
  const next = draftAndReview(f, "revision-writer")
  await assert.rejects(
    approveSelectedEvent(f.ctx, { run_id: "revision-writer", review_file: next.review_file }),
    /lineage review/,
  )
  const changes = original.claims.map((c) => ({
    prior_claim_id: c.claim_id,
    disposition: "retained",
    current_claim_ids: [c.claim_id],
    reason: "Exact original fact and conditions retained",
  }))
  const revision_file = fileInRepo(f, "revision-review.json", {
    schema: "research-event-revision-review/v1",
    action: "update",
    prior_run: "writer",
    current_run: "revision-writer",
    event_id: old.article.event_id,
    selection_sha256: selection.sha256,
    prior_article_sha256: sha256(JSON.stringify(old.article)),
    draft_id: next.record.draft_id,
    reviewer: "test-lineage-reader",
    reason: "Rechecked editorial detail without a new event",
    reviewed_at: "2026-09-29T02:00:00Z",
    source_read: true,
    prior_article_read: true,
    final_prose_read: true,
    identity_checked: true,
    dates_checked: true,
    numbers_checked: true,
    changes,
  })
  const result = await approveSelectedEvent(f.ctx, {
    run_id: "revision-writer",
    review_file: next.review_file,
    revision_file,
  })
  assert.equal(result.event_id, old.article.event_id)
  assert.equal(result.published_at, "2026-09-27")
  const graph = extendEvidenceOntology(
    f.root,
    projectEvidenceOntology([old]),
    ["revision-writer"],
    { vault: f.ctx.vault },
  )
  assert.equal(graph.inputs.length, 1)
  assert.equal(graph.inputs[0].run, "revision-writer")
  assert.equal(graph.revision_history.length, 1)
  assert.ok(fs.existsSync(safePath(f.root, "runs/writer/approved-article.json")))
})

test("different edition plans reuse the same exact selected event writer binding", async (t) => {
  const f = await selectedFixture(t)
  const plan = await executeModule(f.ctx, "classification", "review", {
    ...f.parameters,
    run_id: "second-plan",
  })
  const again = await executeModule(f.ctx, "selection", "prepare", {
    run_id: "duplicate-writer",
    plan_path: plan.path,
    plan_sha256: plan.sha256,
    group_id: "order",
  })
  assert.equal(again.writer_run, "writer")
  assert.equal(again.sha256, f.selection.sha256)
  assert.equal(fs.existsSync(safePath(f.root, "runs/duplicate-writer/event-selection.json")), false)
})

test("native daily core uses frozen event inputs without starting the legacy candidate queue", async (t) => {
  const f = editionFixture(t),
    plan = await executeModule(f.ctx, "classification", "review", f.parameters)
  const result = await advanceDailyCore({
    root: f.root,
    runId: "native-event-core",
    editionReference: f.editionRef,
    eventPlanReference: { path: plan.path, sha256: plan.sha256 },
    vault: f.ctx.vault,
    policyFile: f.ctx.policy,
    execute: false,
    queueProcessor: () => {
      throw Error("Legacy per-candidate processing must not start")
    },
  })
  assert.equal(result.status, "planned")
  assert.equal(result.rows[0].status, "queued")
  assert.equal(result.collection_status, "partial")
  assert.equal(result.model_calls, 0)
  assert.equal(result.publication.status, "planned")
  assert.equal(result.publication.collection_status, "partial")
  assert.deepEqual(result.publication.approved_runs, [])
})

test("known approved sources need an original-based prior comparison before a new writer", async (t) => {
  const f = await selectedFixture(t),
    provider = fakeProvider()
  await extractSelectedEventEvidence(f.ctx, f.selectedParameters, { baseProvider: provider })
  await verifyFacts(f, "writer")
  const original = draftAndReview(f, "writer")
  await approveSelectedEvent(f.ctx, { run_id: "writer", review_file: original.review_file })
  const input = loadApprovedOntologyInput(f.root, "writer", { vault: f.ctx.vault })
  fs.writeFileSync(
    f.ctx.backlog,
    JSON.stringify({
      candidates: [
        {
          event_id: input.article.event_id,
          source_urls: [f.sources[0].document.original_url],
          approval: {
            approved_run: "writer",
            article_sha256: sha256(JSON.stringify(input.article)),
          },
        },
      ],
    }),
  )
  const parameters = { ...f.parameters, run_id: "known-source-plan" }
  await assert.rejects(
    executeModule(f.ctx, "classification", "review", parameters),
    /explicit prior-event comparison/,
  )
  assert.equal(fs.existsSync(safePath(f.root, "event-plans/known-source-plan/plan.json")), false)
  const review = structuredClone(f.review)
  review.events = [review.events[0]]
  review.events[0].prior_run = "writer"
  review.events[0].prior_matches = ["identity_marker", "event_action"].map((aspect) => ({
    aspect,
    parse_id: f.sources[0].parsed.parse_id,
    block_id: f.sources[0].parsed.blocks[0].block_id,
    quote: f.sources[0].parsed.blocks[0].text,
    primary_block_id: f.sources[0].parsed.blocks[0].block_id,
    primary_quote: f.sources[0].parsed.blocks[0].text,
    conclusion: "Explicit source comparison with the approved Contract-123 action",
  }))
  const review_file = fileInRepo(f, "known-source-review.json", review)
  const plan = await executeModule(f.ctx, "classification", "review", {
    ...parameters,
    review_file,
  })
  assert.equal(plan.status, "relationship_reviewed")
  assert.equal(fs.existsSync(safePath(f.root, "runs/known-source-plan/draft.json")), false)
})

test("invalid ontology and event limits fail before workflow state or model calls", async (t) => {
  const f = editionFixture(t),
    provider = fakeProvider({ events: true })
  const parameters = {
    run_id: "invalid-event-input",
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
    execute: true,
    propose: true,
  }
  for (const override of [
    { ontology_path: "missing.json" },
    { ontology_sha256: "a".repeat(64) },
    { max_items: 0 },
    { time_budget_ms: Infinity },
    { offset: -1 },
    { offset: 1.5 },
    { note_review_runs: ["missing-approved-note"] },
  ])
    await assert.rejects(
      advanceEventWorkflow(f.ctx, { ...parameters, ...override }, { baseProvider: provider }),
    )
  const graphRef = atomicWrite(f.root, "invalid-graph.json", {})
  await assert.rejects(
    advanceEventWorkflow(
      f.ctx,
      { ...parameters, ontology_path: graphRef.path, ontology_sha256: graphRef.sha256 },
      { baseProvider: provider },
    ),
    /ontology schema/,
  )
  assert.equal(provider.calls, 0)
  assert.equal(
    fs.existsSync(safePath(f.root, "event-workflows/invalid-event-input/input.json")),
    false,
  )
  let requests = 0
  for (const override of [
    { collectionMaxWindows: 0 },
    { collectionTimeBudgetMs: NaN },
    { eventProposalOffset: -1 },
  ])
    await assert.rejects(
      advanceDailyCore({
        root: f.root,
        runId: "invalid-core",
        dailyRunId: "daily-fixture",
        collect: true,
        execute: true,
        collector: () => {
          requests++
          throw Error("must not collect")
        },
        ...override,
      }),
    )
  assert.equal(requests, 0)
})

test("reuse, follow-up and correction retain distinct event identities and explicit lineage", async (t) => {
  const f = await selectedFixture(t),
    provider = fakeProvider()
  await extractSelectedEventEvidence(f.ctx, f.selectedParameters, { baseProvider: provider })
  await verifyFacts(f, "writer")
  const original = draftAndReview(f, "writer")
  await approveSelectedEvent(f.ctx, { run_id: "writer", review_file: original.review_file })
  const old = loadApprovedOntologyInput(f.root, "writer", { vault: f.ctx.vault })
  const prepare = async (action) => {
    const review = structuredClone(f.review)
    review.events = [review.events[0]]
    const event = review.events[0]
    event.action = action
    event.prior_run = "writer"
    event.prior_matches = ["identity_marker", "event_action"].map((aspect) => ({
      aspect,
      parse_id: f.sources[0].parsed.parse_id,
      block_id: f.sources[0].parsed.blocks[0].block_id,
      quote: f.sources[0].parsed.blocks[0].text,
      primary_block_id: f.sources[0].parsed.blocks[0].block_id,
      primary_quote: f.sources[0].parsed.blocks[0].text,
      conclusion:
        "Explicit comparison of the fixture counterparties, contract identifier and action",
    }))
    const review_file = fileInRepo(f, `relation-${action}.json`, review)
    return executeModule(f.ctx, "classification", "review", {
      ...f.parameters,
      run_id: "plan-" + action,
      review_file,
    })
  }
  const reusePlan = await prepare("reuse")
  const reused = await executeModule(f.ctx, "selection", "reuse", {
    plan_path: reusePlan.path,
    plan_sha256: reusePlan.sha256,
    group_id: "order",
  })
  assert.equal(reused.approved_run, "writer")
  assert.equal(reused.writer_called, false)
  const correctionPlan = await prepare("correction")
  const selected = await executeModule(f.ctx, "selection", "prepare", {
    run_id: "corrected",
    plan_path: correctionPlan.path,
    plan_sha256: correctionPlan.sha256,
    group_id: "order",
  })
  await extractSelectedEventEvidence(
    f.ctx,
    {
      run_id: selected.writer_run,
      selection_path: selected.path,
      selection_sha256: selected.sha256,
    },
    { baseProvider: provider },
  )
  await verifyFacts(f, "corrected")
  const next = draftAndReview(f, "corrected")
  const revision = {
    schema: "research-event-revision-review/v1",
    action: "correction",
    prior_run: "writer",
    current_run: "corrected",
    event_id: old.article.event_id,
    selection_sha256: selected.sha256,
    prior_article_sha256: sha256(JSON.stringify(old.article)),
    draft_id: next.record.draft_id,
    reviewer: "test-correction-reader",
    reason: "Exact original recheck and editorial correction",
    reviewed_at: "2026-09-29T02:00:00Z",
    source_read: true,
    prior_article_read: true,
    final_prose_read: true,
    identity_checked: true,
    dates_checked: true,
    numbers_checked: true,
    changes: original.claims.map((c) => ({
      prior_claim_id: c.claim_id,
      disposition: "retained",
      current_claim_ids: [c.claim_id],
      reason: "Original fact and conditions unchanged",
    })),
  }
  const revision_file = fileInRepo(f, "correction-lineage.json", {
    ...revision,
    changes: revision.changes.slice(1),
  })
  await assert.rejects(
    approveSelectedEvent(f.ctx, {
      run_id: "corrected",
      review_file: next.review_file,
      revision_file,
    }),
    /every previously published fact/,
  )
  fileInRepo(f, "correction-lineage.json", revision)
  await approveSelectedEvent(f.ctx, {
    run_id: "corrected",
    review_file: next.review_file,
    revision_file,
  })
  const correctedGraph = extendEvidenceOntology(
    f.root,
    projectEvidenceOntology([old]),
    ["corrected"],
    { vault: f.ctx.vault },
  )
  assert.equal(correctedGraph.revision_history[0].event_id, old.article.event_id)

  // A separate action shares a primary original but uses a distinct block scope.
  const follow = structuredClone(f.review)
  follow.events = [follow.events[0]]
  follow.events[0].group_id = "followup"
  follow.events[0].prior_run = "writer"
  follow.events[0].identity.action = "announced another schedule"
  follow.events[0].materials = [follow.events[0].materials[0]]
  follow.events[0].materials[0].block_ids.push(f.sources[0].parsed.blocks[1].block_id)
  follow.events[0].prior_matches = revision
    ? ["identity_marker", "event_action"].map((aspect) => ({
        aspect,
        parse_id: f.sources[0].parsed.parse_id,
        block_id: f.sources[0].parsed.blocks[0].block_id,
        quote: f.sources[0].parsed.blocks[0].text,
        primary_block_id: f.sources[0].parsed.blocks[0].block_id,
        primary_quote: f.sources[0].parsed.blocks[0].text,
        conclusion:
          "Same project context; a separate explicitly reviewed action, not the same announcement",
      }))
    : []
  const followFile = fileInRepo(f, "followup-relation.json", follow)
  const followPlan = await executeModule(f.ctx, "classification", "review", {
    ...f.parameters,
    run_id: "follow-plan",
    review_file: followFile,
  })
  const followSelection = await executeModule(f.ctx, "selection", "prepare", {
    run_id: "follow-writer",
    plan_path: followPlan.path,
    plan_sha256: followPlan.sha256,
    group_id: "followup",
  })
  await extractSelectedEventEvidence(
    f.ctx,
    {
      run_id: "follow-writer",
      selection_path: followSelection.path,
      selection_sha256: followSelection.sha256,
    },
    { baseProvider: provider },
  )
  await verifyFacts(f, "follow-writer")
  const wrong = draftAndReview(f, "follow-writer")
  await assert.rejects(
    approveSelectedEvent(f.ctx, { run_id: "follow-writer", review_file: wrong.review_file }),
    /new event ID/,
  )
  const correct = draftAndReview(f, "follow-writer", "1234567890abcdef")
  await approveSelectedEvent(f.ctx, { run_id: "follow-writer", review_file: correct.review_file })
  const followGraph = projectEvidenceOntology([
    old,
    loadApprovedOntologyInput(f.root, "follow-writer", { vault: f.ctx.vault }),
  ])
  assert.equal(followGraph.inputs.length, 2)
  assert.equal(followGraph.event_relations[0].previous_event_id, old.article.event_id)
  assert.equal(followGraph.event_relations[0].current_event_id, "1234567890abcdef")
})
