import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { selectedFixture } from "./fixtures/research-event-fixtures.mjs"
import { executeModule, moduleCatalog } from "../scripts/research/module-registry.mjs"
import { extractSelectedEventEvidence } from "../scripts/research/event-inference.mjs"
import {
  prepareCuration,
  loadCurationPool,
  curationCandidatePacket,
  evaluateCuration,
  selectCuration,
} from "../scripts/research/curation.mjs"
import { advanceCuration } from "../scripts/research/curation-workflow.mjs"
import { advanceRoundWorkflow } from "../scripts/research/round-workflow.mjs"
import { readCurationInsights } from "../scripts/research/curation-insights.mjs"
import { inspectEditorialCompleteness } from "../scripts/research/editorial-completeness.mjs"
import { atomicWrite, readJSON, safePath } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"

const file = (f, name, value) => {
  atomicWrite(f.root, name, value)
  return path.relative(f.ctx.repo, safePath(f.root, name))
}
const ref = (f, name) => ({ path: name, sha256: sha256(fs.readFileSync(safePath(f.root, name))) })

async function setup(t) {
  const f = await selectedFixture(t)
  f.ctx.vault = path.join(f.root, "isolated-vault")
  fs.mkdirSync(f.ctx.vault, { recursive: true })
  f.ctx.backlog = path.join(f.root, "candidate-backlog.json")
  atomicWrite(f.root, "candidate-backlog.json", {
    schema: "research-candidates/v1",
    candidates: [],
  })
  let calls = 0
  const provider = {
    get calls() {
      return calls
    },
    async metadata(model) {
      return {
        model,
        digest: sha256("purpose fixture"),
        runtime: "fixture",
        capabilities: ["completion"],
        thinking: { values: [false, "medium"] },
      }
    },
    async structured(request) {
      calls++
      let output
      if (request.schema.properties.claims) {
        const docs = JSON.parse(request.messages[1].content)
        output = {
          claims: docs.flatMap((doc) =>
            doc.blocks.map((block) => ({
              statement:
                "Fixture Robotics와 Partner가 2026년 9월 27일 Contract-123 로봇 주문을 발표했다.",
              claim_kind: "fact",
              subject: "Fixture Robotics",
              event_state: "reported",
              published_at: "2026-09-27",
              effective_period: null,
              numbers: [],
              evidence: [{ block_key: block.block_key, support: "direct" }],
            })),
          ),
        }
      } else {
        const claims = readJSON(
          f.root,
          `runs/${f.selectedParameters.run_id}/reviewed-claims.json`,
        ).claims
        output = {
          title: "Fixture Robotics와 Partner, Contract-123 로봇 주문 발표",
          sector: "로봇·제조",
          theme: "사업·고객",
          tags: ["수주·계약"],
          entities: ["Fixture Robotics", "Partner"],
          facts: {
            who: "Fixture Robotics와 Partner",
            when: "2026-09-27",
            where: null,
            what: "로봇 주문 발표",
            how: null,
            why: null,
          },
          lead: [
            {
              text: "Fixture Robotics와 Partner는 2026년 9월 27일 로봇 주문을 발표했다.",
              claim_ids: [claims[0].claim_id],
            },
            { text: "주문의 계약 식별자는 Contract-123이다.", claim_ids: [claims[0].claim_id] },
          ],
          explanations: [],
        }
      }
      return {
        output,
        provenance: {
          model: request.model,
          think: request.think,
          digest: sha256("purpose fixture"),
          prompt_sha256: sha256(JSON.stringify(request.messages)),
        },
      }
    },
  }
  await extractSelectedEventEvidence(f.ctx, f.selectedParameters, { baseProvider: provider })
  const run = f.selectedParameters.run_id
  const claims = readJSON(f.root, `runs/${run}/claims.json`).claims
  await executeModule(f.ctx, "evidence", "review", {
    run_id: run,
    review_file: file(f, "facts.json", {
      reviewer: "fixture original reader",
      reviewed_at: "2026-10-12",
      claims: claims.map((c) => ({
        claim_id: c.claim_id,
        status: "verified",
        reason: "Read the same Contract-123 event in each exact fixture source",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      })),
    }),
  })
  const prepared = await prepareCuration(f.ctx, {
    run_id: "purpose-curation",
    briefing_date: "2026-10-12",
    plans: [{ path: f.plan.path, sha256: f.plan.sha256 }],
    include_backlog: false,
    max_articles: 1,
  })
  const candidate = loadCurationPool(f.ctx, prepared).candidates.find((c) => c.group_id === "order")
  const source = curationCandidatePacket(f.ctx, candidate).sources[0],
    block = source.blocks[0]
  await evaluateCuration(f.ctx, {
    pool_path: prepared.path,
    pool_sha256: prepared.sha256,
    review_file: file(f, "curation.json", {
      schema: "research-curation-review/v1",
      pool_sha256: prepared.sha256,
      reviewer: "fixture source reader",
      reviewed_at: "2026-10-12",
      evaluations: [
        {
          candidate_id: candidate.candidate_id,
          sector: "로봇·제조",
          checks: {
            source_verified: true,
            scope_relevant: true,
            new_information: true,
            current_valid: true,
            history_compared: true,
          },
          ratings: Object.fromEntries(
            ["novelty", "impact", "specificity", "knowledge_value", "timeliness"].map((name) => [
              name,
              { value: 5, reason: "Read exact reviewed event and isolated article history" },
            ]),
          ),
          evidence: [
            { material_id: source.material_id, block_id: block.block_id, quote: block.text },
          ],
          compared_article_ids: [],
          valid_until: null,
        },
      ],
    }),
  })
  const selection = await selectCuration(f.ctx, {
    pool_path: prepared.path,
    pool_sha256: prepared.sha256,
  })
  assert.equal(selection.selected, 1, JSON.stringify(selection))
  return {
    ...f,
    run,
    provider,
    candidate,
    selection,
    p: {
      run_id: "purpose-native",
      selection_path: selection.path,
      selection_sha256: selection.sha256,
      execute: true,
      max_items: 1,
    },
  }
}

test("new curated workflow pauses before writing, resumes important-fact and coverage reviews, and reuses approved prose", async (t) => {
  const f = await setup(t)
  const before = f.provider.calls
  const first = await advanceCuration(f.ctx, f.p, { baseProvider: f.provider })
  assert.equal(first.rows.length, 1, JSON.stringify(first))
  assert.equal(first.rows[0].status, "completeness_review")
  assert.equal(first.rows[0].next_input.operation, "completeness")
  assert.equal(first.article_writes, 0)
  assert.equal(f.provider.calls, before)
  const cached = await advanceCuration(f.ctx, f.p, { baseProvider: f.provider })
  assert.equal(cached.rows[0].cached_stage, true)
  assert.equal(f.provider.calls, before)
  const packet = await executeModule(f.ctx, "validation", "completeness", { run_id: f.run })
  const important = file(f, "important.json", {
    ...packet.review_template,
    reviewer: "fixture important-fact reader",
    reviewed_at: "2026-10-12",
    source_read: true,
    all_relevant_facts_checked: true,
    fact_decisions: packet.review_template.fact_decisions.map((row, index) => ({
      ...row,
      important: index === 0,
      reason:
        index === 0
          ? "Keep action, date and Contract-123 identifier"
          : "The same announcement is repeated by another source",
    })),
  })
  const withImportant = { ...f.p, completeness_reviews: { [f.candidate.candidate_id]: important } }
  const written = await advanceCuration(f.ctx, withImportant, { baseProvider: f.provider })
  assert.equal(written.rows[0].status, "editorial_review", JSON.stringify(written))
  assert.equal(written.article_writes, 1)
  assert.deepEqual(written.rows[0].required_review_inputs, [
    "editorial_reviews",
    "coverage_reviews",
  ])
  const record = readJSON(f.root, `runs/${f.run}/draft.json`)
  assert.ok(record.completeness_context)
  const review = file(f, "editorial.json", {
    status: "approved",
    draft_id: record.draft_id,
    event_id: "abcdef0123456789",
    published_at: "2026-09-27",
    reviewed_at: "2026-10-12",
    region: "해외",
    reviewer: "fixture final reader",
    source_read: true,
    final_prose_read: true,
    title_checked: true,
    dates_checked: true,
    numbers_checked: true,
    analysis_checked: true,
    concept_ids: [],
    reader_quality_review: { repetition_checked: true },
  })
  const withoutCoverage = {
    ...withImportant,
    editorial_reviews: { [f.candidate.candidate_id]: review },
  }
  const pending = await advanceCuration(f.ctx, withoutCoverage, { baseProvider: f.provider })
  assert.equal(pending.rows[0].status, "coverage_review")
  assert.equal(pending.errors.length, 0)
  const coverageTemplate = inspectEditorialCompleteness(
    record,
    readJSON(f.root, `runs/${f.run}/reviewed-claims.json`).claims,
  ).coverage_template
  const coverage = file(f, "coverage.json", {
    ...coverageTemplate,
    reviewer: "fixture final reader",
    reviewed_at: "2026-10-12",
    source_read: true,
    final_prose_read: true,
    coverage: coverageTemplate.coverage.map((row) => ({
      ...row,
      meaning_checked: true,
      reason: "Read each exact sentence against the original announcement and contract identifier",
    })),
  })
  const ready = { ...withoutCoverage, coverage_reviews: { [f.candidate.candidate_id]: coverage } }
  const approved = await advanceCuration(f.ctx, ready, { baseProvider: f.provider })
  assert.equal(approved.status, "complete", JSON.stringify(approved))
  const callCount = f.provider.calls,
    draftBefore = ref(f, `runs/${f.run}/draft.json`)
  const again = await advanceCuration(f.ctx, f.p, { baseProvider: f.provider })
  assert.equal(again.status, "complete")
  assert.equal(again.model_calls, 0)
  assert.equal(again.article_writes, 0)
  assert.equal(f.provider.calls, callCount)
  assert.deepEqual(ref(f, draftBefore.path), draftBefore)
  assert.equal(again.candidate_published, false)
  const insights = readCurationInsights(f.ctx, {
    ...f.p,
    workflow_path: `curation/runs/purpose-curation/workflows/purpose-native/latest.json`,
    workflow_sha256: ref(f, "curation/runs/purpose-curation/workflows/purpose-native/latest.json")
      .sha256,
  })
  assert.equal(insights.execution.selected_rows[0].status, "approved")
  assert.equal(insights.execution.full_day_wall_ms, null)
})

test("private metrics reject an exact-byte child belonging to a different curation", async (t) => {
  const f = await setup(t)
  const outcome = await advanceCuration(f.ctx, f.p, { baseProvider: f.provider })
  assert.equal(outcome.workflows.length, 1, JSON.stringify(outcome))
  const child = outcome.workflows[0],
    native = readJSON(f.root, child.workflow.path)
  native.curation = { path: "different.json", sha256: sha256("different") }
  atomicWrite(f.root, "forged-native.json", native)
  const forged = { ...outcome, workflows: [{ ...child, workflow: ref(f, "forged-native.json") }] }
  atomicWrite(f.root, "forged-parent.json", forged)
  assert.throws(
    () =>
      readCurationInsights(f.ctx, {
        ...f.p,
        workflow_path: "forged-parent.json",
        workflow_sha256: ref(f, "forged-parent.json").sha256,
      }),
    /different native binding/,
  )
})

test("new modules expose strict resumable inputs without expanding the compact MCP surface", () => {
  const catalog = moduleCatalog()
  const op = (m, id) =>
    catalog.modules.find((row) => row.id === m).operations.find((row) => row.id === id)
  assert.equal(op("knowledge", "explore").readOnly, true)
  assert.equal(op("curation", "status").readOnly, true)
  assert.equal(op("validation", "completeness").readOnly, true)
  assert.equal(
    op("writing", "draft").inputSchema.properties.completeness_review_file["x-path-scope"],
    "repo",
  )
  for (const m of ["curation", "edition"]) {
    assert.ok(op(m, "advance").inputSchema.properties.completeness_reviews)
    assert.ok(op(m, "advance").inputSchema.properties.coverage_reviews)
  }
  assert.ok(op("collection", "targeted").inputSchema.properties.inquiry_plan_path)
  assert.ok(op("collection", "followups").inputSchema.properties.inquiry_plan_sha256)
})

test("round coordinator retains the important-fact next input and detects an externally completed writing stage", async (t) => {
  const f = await setup(t)
  const p = {
    run_id: "purpose-round",
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
    plan_path: f.plan.path,
    plan_sha256: f.plan.sha256,
    curation_path: f.selection.path,
    curation_sha256: f.selection.sha256,
    require_completeness: true,
    execute: true,
    max_items: 1,
  }
  const first = await advanceRoundWorkflow(f.ctx, p, { baseProvider: f.provider })
  assert.equal(first.next_inputs[0].stage, "completeness", JSON.stringify(first.next_inputs))
  assert.deepEqual(first.next_inputs[0].required, ["completeness_reviews"])
  const packet = await executeModule(f.ctx, "validation", "completeness", { run_id: f.run })
  const important = file(f, "round-important.json", {
    ...packet.review_template,
    reviewer: "fixture important-fact reader",
    reviewed_at: "2026-10-12",
    source_read: true,
    all_relevant_facts_checked: true,
    fact_decisions: packet.review_template.fact_decisions.map((row, index) => ({
      ...row,
      important: index === 0,
      reason:
        index === 0
          ? "Keep direct announcement and contract identifier"
          : "Another source repeats the same announcement",
    })),
  })
  await advanceCuration(
    f.ctx,
    { ...f.p, completeness_reviews: { [f.candidate.candidate_id]: important } },
    { baseProvider: f.provider },
  )
  const before = f.provider.calls
  const resumed = await advanceRoundWorkflow(f.ctx, p, { baseProvider: f.provider })
  assert.equal(resumed.next_inputs[0].stage, "writing", JSON.stringify(resumed.next_inputs))
  assert.deepEqual(resumed.next_inputs[0].required, ["editorial_reviews", "coverage_reviews"])
  assert.equal(f.provider.calls, before)
  assert.equal(resumed.article_writes, 0)
})

test("a newly required important-fact review cannot be bypassed by an external draft without its binding", async (t) => {
  const f = await setup(t)
  const waiting = await advanceCuration(f.ctx, f.p, { baseProvider: f.provider })
  assert.equal(waiting.rows[0].requires_completeness, true)
  // Deliberately malformed private test input; never a model or public output.
  atomicWrite(f.root, `runs/${f.run}/draft.json`, {
    draft_id: sha256("unbound fixture"),
    draft: {},
    status: "editorial_review",
  })
  const before = f.provider.calls
  const result = await advanceCuration(f.ctx, f.p, { baseProvider: f.provider })
  assert.equal(result.status, "partial")
  assert.equal(result.rows[0].status, "failed")
  assert.match(result.rows[0].error, /required important-fact review/)
  assert.equal(f.provider.calls, before)
  assert.equal(result.article_writes, 0)
  assert.equal(result.candidate_published, false)
})
