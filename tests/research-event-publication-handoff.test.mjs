import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { editionFixture, selectedFixture } from "./fixtures/research-event-fixtures.mjs"
import { executeModule } from "../scripts/research/module-registry.mjs"
import { extractSelectedEventEvidence } from "../scripts/research/event-inference.mjs"
import { advanceEventWorkflow } from "../scripts/research/event-workflow.mjs"
import { approveSelectedEvent } from "../scripts/research/event-publication.mjs"
import { draftFingerprint } from "../scripts/research/editor.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON, safePath } from "../scripts/research/run-state.mjs"
import {
  loadCurrentApproval,
  loadPreviewPublicationInputs,
  retrospectiveProjections,
} from "../scripts/research/preview.mjs"
import { submitModuleJob, readModuleResult } from "../scripts/research/module-runtime.mjs"
import { editionProjection } from "../scripts/research/publish-adapter.mjs"
import {
  prepareEventPublicationHandoff,
  eventPublicationStatus,
  loadDailyPublicationSelection,
} from "../scripts/research/daily-publication-handoff.mjs"
import { module as publication } from "../scripts/research/modules/publication.mjs"
import { validateArguments } from "../scripts/research/modules/contracts.mjs"

const repoFile = (f, name, value) => {
  atomicWrite(f.root, name, value)
  return path.relative(f.ctx.repo, safePath(f.root, name))
}
const ref = (f, relative) => ({
  path: relative,
  sha256: sha256(fs.readFileSync(safePath(f.root, relative))),
})
const handoffParameters = (f, workflow = "workflow", run = "publication") => {
  const native = ref(f, `event-workflows/${workflow}/latest.json`)
  return { run_id: run, workflow_path: native.path, workflow_sha256: native.sha256 }
}
function provider() {
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
      return {
        output: {
          claims: docs.flatMap((d) =>
            d.blocks.map((b) => ({
              statement:
                "Fixture Robotics와 Partner가 2026년 9월 27일 Contract-123 로봇 주문을 발표했다.",
              claim_kind: "fact",
              subject: "Fixture Robotics",
              event_state: "completed",
              published_at: "2026-09-27",
              effective_period: null,
              numbers: [],
              evidence: [{ block_key: b.block_key, support: "direct" }],
            })),
          ),
        },
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
async function approve(f, run, selected = f.selectedParameters, revisionFile) {
  await extractSelectedEventEvidence(f.ctx, selected, { baseProvider: f.provider })
  const claims = readJSON(f.root, `runs/${run}/claims.json`).claims
  const review_file = repoFile(f, `facts-${run}.json`, {
    reviewer: "test-original-reader",
    reviewed_at: "2026-09-29T01:00:00Z",
    claims: claims.map((c) => ({
      claim_id: c.claim_id,
      status: "verified",
      reason: "Compared with the exact test original",
      source_read: true,
      entailment_checked: true,
      identity_checked: true,
      numbers_checked: true,
      time_checked: true,
    })),
  })
  await executeModule(f.ctx, "evidence", "review", { run_id: run, review_file })
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
        heading: run === "writer" ? "계약 대상" : "대조한 계약 내용",
        paragraphs: [
          {
            text: "각 원문은 Contract-123 주문의 주체와 발표 시점을 명시한다. 다른 고객의 별도 일정은 이번 계약의 완료 내용으로 포함하지 않았다.",
            claim_ids: ids,
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
  }
  atomicWrite(f.root, `runs/${run}/draft.json`, record)
  const editorial = repoFile(f, `editorial-${run}.json`, {
    status: "approved",
    draft_id: record.draft_id,
    event_id: "abcdef0123456789",
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
  })
  if (revisionFile) revisionFile = revisionFile(record, claims)
  await approveSelectedEvent(f.ctx, {
    run_id: run,
    review_file: editorial,
    ...(revisionFile ? { revision_file: revisionFile } : {}),
  })
}
async function advance(f, workflow = "workflow", plan = f.plan, execute = true) {
  return advanceEventWorkflow(f.ctx, {
    run_id: workflow,
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
    plan_path: plan.path,
    plan_sha256: plan.sha256,
    execute,
  })
}
async function ready(t) {
  const f = await selectedFixture(t)
  f.provider = provider()
  await approve(f, "writer")
  f.workflow = await advance(f)
  return f
}
async function relationPlan(f, action) {
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
    conclusion: "Rechecked the same counterparties, contract identifier and action",
  }))
  return executeModule(f.ctx, "classification", "review", {
    ...f.parameters,
    run_id: `plan-${action}`,
    review_file: repoFile(f, `relation-${action}.json`, review),
  })
}

test("native event publication preserves exact approval/source/edition refs and resumes offline", async (t) => {
  const f = await ready(t),
    p = handoffParameters(f)
  const prepared = await executeModule(f.ctx, "publication", "prepare", p)
  assert.equal(prepared.status, "approval_ready")
  assert.equal(prepared.workflow_status, "complete")
  assert.equal(prepared.collection_status, "partial")
  assert.deepEqual(prepared.approved_runs, ["writer"])
  assert.deepEqual(prepared.excluded_groups, [
    { group_id: "deferred", action: "defer", status: "deferred" },
  ])
  const selected = loadDailyPublicationSelection(f.root, prepared.publication_handoff.path, {
    vault: f.ctx.vault,
  })
  assert.deepEqual(selected.approvedRuns, ["writer"])
  assert.equal(f.workflow.publication.status, "approval_ready")
  assert.deepEqual(f.workflow.publication.approved_runs, ["writer"])
  assert.equal(f.workflow.publication.collection_status, "partial")
  assert.equal(f.workflow.publication.candidate_published, false)
  const automatic = loadDailyPublicationSelection(f.root, f.workflow.publication_handoff.path, {
    vault: f.ctx.vault,
  })
  assert.deepEqual(automatic.approvedRuns, ["writer"])
  assert.equal(automatic.selection.workflow.source.sha256, p.workflow_sha256)
  assert.equal(readJSON(f.root, p.workflow_path).publication_handoff, undefined)
  const preflight = loadPreviewPublicationInputs(f.root, "preview", [], {
    vault: f.ctx.vault,
    publicationHandoff: prepared.publication_handoff.path,
  })
  assert.deepEqual(preflight.approvedRuns, ["writer"])
  assert.equal(preflight.dailySelection.sha256, prepared.publication_handoff.sha256)
  assert.equal(preflight.approvals[0].article.event_id, "abcdef0123456789")
  const approval = loadCurrentApproval(f.root, "writer", { vault: f.ctx.vault })
  const row = selected.selection.approved_runs[0]
  assert.equal(row.action, "write")
  assert.equal(row.published_at, "2026-09-27")
  assert.deepEqual(row.files, approval.files)
  assert.equal(row.source_revisions.length, 3)
  assert.equal(row.source_revisions[0].body_sha256, f.sources[0].document.body_sha256)
  assert.equal(row.source_revisions[0].parse_id, f.sources[0].parsed.parse_id)
  assert.deepEqual(selected.selection.edition, f.editionRef)
  const calls = f.provider.calls
  assert.deepEqual(await prepareEventPublicationHandoff(f.ctx, p), prepared)
  assert.equal(f.provider.calls, calls)
  const bytesBefore = fs.readFileSync(
    safePath(f.root, "runs/publication/event-publication/latest.json"),
  )
  const inspected = eventPublicationStatus(f.ctx, { run_id: "publication" })
  assert.deepEqual(inspected, prepared)
  assert.deepEqual(
    fs.readFileSync(safePath(f.root, "runs/publication/event-publication/latest.json")),
    bytesBefore,
  )
  for (const key of [
    "candidate_published",
    "drive_verified",
    "public_verified",
    "new_regular_operation_counted",
  ])
    assert.equal(inspected[key], false)
  const cli = JSON.parse(
    execFileSync(
      process.execPath,
      [
        path.join(f.ctx.repo, "scripts/research-publication.mjs"),
        "handoff-status",
        "--root",
        f.root,
        "--repo",
        f.ctx.repo,
        "--run",
        "publication",
      ],
      { cwd: os.tmpdir(), encoding: "utf8" },
    ),
  )
  assert.deepEqual(cli, prepared)
  const standalone = JSON.parse(
    execFileSync(
      process.execPath,
      [path.join(f.ctx.repo, "scripts/research/modules/publication.mjs"), "list"],
      { cwd: os.tmpdir(), encoding: "utf8" },
    ),
  )
  assert.deepEqual(
    standalone.modules.map((module) => module.id),
    ["publication"],
  )
  assert.deepEqual(
    standalone.modules[0].operations.map((operation) => operation.tool_name),
    [
      "publication_prepare",
      "publication_status",
      "publication_request_delivery",
      "publication_deliver",
      "publication_delivery_receipt",
      "publication_delivery_status",
      "publication_fallback",
      "publication_shadow_basis",
      "publication_shadow_record",
      "publication_shadow_status",
    ],
  )
  const workflow = readJSON(f.root, p.workflow_path)
  atomicWrite(f.root, p.workflow_path, { ...workflow, elapsed_ms: workflow.elapsed_ms + 1 })
  assert.deepEqual(
    loadDailyPublicationSelection(f.root, prepared.publication_handoff.path, { vault: f.ctx.vault })
      .approvedRuns,
    ["writer"],
  )
})

test("publication module workers pin native inputs and code and reuse a completed local handoff", async (t) => {
  const f = await ready(t),
    p = handoffParameters(f, "workflow", "worker-publication")
  const calls = f.provider.calls
  const job = await submitModuleJob(f.ctx, "publication", "prepare", p, {
    jobId: "module-publication-worker",
    background: false,
  })
  assert.equal(job.state, "completed")
  const result = JSON.parse(readModuleResult(f.ctx, job.job_id, { limit: 64000 }).chunk).data
  assert.equal(result.status, "approval_ready")
  assert.deepEqual(result.approved_runs, ["writer"])
  assert.deepEqual(result.knowledge_runs, [])
  assert.equal(result.candidate_published, false)
  const input = readJSON(f.root, `module-jobs/${job.job_id}/input.json`)
  for (const file of [
    "daily-publication-handoff.mjs",
    "event-pipeline.mjs",
    "preview.mjs",
    "note-review.mjs",
    "publish-adapter.mjs",
  ])
    assert.equal(
      input.implementation[file],
      sha256(fs.readFileSync(new URL(`../scripts/research/${file}`, import.meta.url))),
    )
  assert.ok(
    input.files.some((file) => file.path === p.workflow_path && file.sha256 === p.workflow_sha256),
  )
  const replay = await submitModuleJob(f.ctx, "publication", "prepare", p, {
    jobId: job.job_id,
    background: false,
  })
  assert.equal(replay.attempt, job.attempt)
  assert.equal(f.provider.calls, calls)
  const status = await executeModule(f.ctx, "publication", "status", { run_id: p.run_id })
  assert.equal(status.publication_handoff.sha256, result.publication_handoff.sha256)
  atomicWrite(f.root, p.workflow_path, { ...readJSON(f.root, p.workflow_path), elapsed_ms: 9999 })
  await assert.rejects(
    () =>
      submitModuleJob(f.ctx, "publication", "prepare", p, { jobId: job.job_id, background: false }),
    /changed/,
  )
})

test("native event publication waits for review and accepts a later native approval under the same run", async (t) => {
  const f = await selectedFixture(t)
  f.provider = provider()
  await advance(f, "workflow", f.plan, false)
  const first = await prepareEventPublicationHandoff(f.ctx, handoffParameters(f))
  assert.equal(first.public_input_ready, false)
  assert.equal(first.status, "planned")
  assert.throws(
    () =>
      loadDailyPublicationSelection(f.root, first.publication_handoff.path, { vault: f.ctx.vault }),
    /no approved authoring changes/,
  )
  await approve(f, "writer")
  await advance(f)
  const next = await prepareEventPublicationHandoff(f.ctx, handoffParameters(f))
  assert.equal(next.public_input_ready, true)
  assert.notEqual(next.publication_handoff.sha256, first.publication_handoff.sha256)
  assert.throws(
    () =>
      loadDailyPublicationSelection(f.root, first.publication_handoff.path, { vault: f.ctx.vault }),
    /no approved authoring changes/,
  )
  assert.equal(eventPublicationStatus(f.ctx, { run_id: "publication" }).status, "approval_ready")
})

test("native event publication unreviewed workflow cannot become public input", async (t) => {
  const f = await selectedFixture(t)
  await advanceEventWorkflow(f.ctx, {
    run_id: "workflow",
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
  })
  const state = await prepareEventPublicationHandoff(f.ctx, handoffParameters(f))
  assert.equal(state.status, "relationship_review")
  assert.equal(state.public_input_ready, false)
  assert.deepEqual(state.approved_runs, [])
})

test("native event publication approved subset preserves the pending workflow status", async (t) => {
  const f = editionFixture(t)
  f.review.events[1].action = "write"
  f.plan = await executeModule(f.ctx, "classification", "review", {
    ...f.parameters,
    review_file: repoFile(f, "mixed-review.json", f.review),
  })
  const selection = await executeModule(f.ctx, "selection", "prepare", {
    run_id: "writer",
    plan_path: f.plan.path,
    plan_sha256: f.plan.sha256,
    group_id: "order",
  })
  f.selectedParameters = {
    run_id: "writer",
    selection_path: selection.path,
    selection_sha256: selection.sha256,
  }
  f.provider = provider()
  await approve(f, "writer")
  let time = 0
  const workflow = await advanceEventWorkflow(
    f.ctx,
    {
      run_id: "workflow",
      edition_path: f.editionRef.path,
      edition_sha256: f.editionRef.sha256,
      plan_path: f.plan.path,
      plan_sha256: f.plan.sha256,
      execute: true,
      time_budget_ms: 2,
    },
    { clock: () => ++time, baseProvider: f.provider },
  )
  assert.equal(workflow.status, "review_pending")
  const state = await prepareEventPublicationHandoff(f.ctx, handoffParameters(f))
  assert.equal(state.status, "partial_approval_ready")
  assert.equal(state.workflow_status, "review_pending")
  assert.deepEqual(state.approved_runs, ["writer"])
  assert.equal(state.excluded_groups[0].status, "queued")
  assert.equal(state.public_verified, false)
})

test("native event publication preserves delegated reasoning wait beside an approved event", async (t) => {
  const f = editionFixture(t)
  f.review.events[1].action = "write"
  f.plan = await executeModule(f.ctx, "classification", "review", {
    ...f.parameters,
    review_file: repoFile(f, "reasoning-review.json", f.review),
  })
  const selection = await executeModule(f.ctx, "selection", "prepare", {
    run_id: "writer",
    plan_path: f.plan.path,
    plan_sha256: f.plan.sha256,
    group_id: "order",
  })
  f.selectedParameters = {
    run_id: "writer",
    selection_path: selection.path,
    selection_sha256: selection.sha256,
  }
  f.provider = provider()
  await approve(f, "writer")
  const waitingProvider = provider()
  waitingProvider.prepareStructured = async () => {
    const error = Error("Test-only delegated result pending")
    error.code = "REASONING_PENDING"
    error.reasoning_task = {
      task_id: "fixture-reasoning",
      request_sha256: sha256("fixture-request"),
    }
    throw error
  }
  const workflow = await advanceEventWorkflow(
    f.ctx,
    {
      run_id: "workflow",
      edition_path: f.editionRef.path,
      edition_sha256: f.editionRef.sha256,
      plan_path: f.plan.path,
      plan_sha256: f.plan.sha256,
      execute: true,
    },
    { baseProvider: waitingProvider },
  )
  assert.equal(workflow.status, "waiting_for_reasoning")
  assert.equal(workflow.model_calls, 0)
  assert.equal(workflow.rows[1].status, "waiting_for_reasoning")
  assert.equal(workflow.reasoning_tasks[0].task_id, "fixture-reasoning")
  assert.deepEqual(workflow.approved_runs, ["writer"])
  const state = await prepareEventPublicationHandoff(f.ctx, handoffParameters(f))
  assert.equal(state.status, "partial_approval_ready")
  assert.equal(state.workflow_status, "waiting_for_reasoning")
  assert.equal(state.excluded_groups[0].status, "waiting_for_reasoning")
  assert.deepEqual(state.approved_runs, ["writer"])
  assert.equal(state.public_verified, false)
})

test("native event publication excludes failed rows even when an approval artifact exists", async (t) => {
  const f = await ready(t),
    native = readJSON(f.root, "event-workflows/workflow/latest.json")
  native.rows[0] = { ...native.rows[0], status: "failed", error: "Native stage failed" }
  native.failures = [{ group_id: "order", error: "Native stage failed" }]
  native.approved_runs = []
  native.status = "partial"
  atomicWrite(f.root, "event-workflows/workflow/latest.json", native)
  const state = await prepareEventPublicationHandoff(f.ctx, handoffParameters(f))
  assert.equal(state.status, "partial")
  assert.equal(state.public_input_ready, false)
  assert.equal(state.excluded_groups[0].status, "failed")
  native.status = "complete"
  atomicWrite(f.root, "event-workflows/workflow/latest.json", native)
  await assert.rejects(
    prepareEventPublicationHandoff(f.ctx, handoffParameters(f, "workflow", "invalid")),
    /Incomplete workflow cannot be marked complete/,
  )
  assert.equal(fs.existsSync(safePath(f.root, "runs/invalid/event-publication/input.json")), false)
})

for (const action of ["update", "correction"]) {
  test(`native event publication ${action} retains native lineage and reaches existing edition projection`, async (t) => {
    const f = await ready(t),
      old = loadCurrentApproval(f.root, "writer", { vault: f.ctx.vault })
    const plan = await relationPlan(f, action)
    const run = `${action}-writer`
    const selection = await executeModule(f.ctx, "selection", "prepare", {
      run_id: run,
      plan_path: plan.path,
      plan_sha256: plan.sha256,
      group_id: "order",
    })
    const selected = {
      run_id: run,
      selection_path: selection.path,
      selection_sha256: selection.sha256,
    }
    await approve(f, run, selected, (record, claims) =>
      repoFile(f, `${action}-lineage.json`, {
        schema: "research-event-revision-review/v1",
        action,
        prior_run: "writer",
        current_run: run,
        event_id: old.article.event_id,
        selection_sha256: selection.sha256,
        prior_article_sha256: sha256(JSON.stringify(old.article)),
        draft_id: record.draft_id,
        reviewer: "test-lineage-reader",
        reason: "Original facts and publication identity retained",
        reviewed_at: "2026-09-29T02:00:00Z",
        source_read: true,
        prior_article_read: true,
        final_prose_read: true,
        identity_checked: true,
        dates_checked: true,
        numbers_checked: true,
        changes: claims.map((c) => ({
          prior_claim_id: c.claim_id,
          disposition: "retained",
          current_claim_ids: [c.claim_id],
          reason: "Exact fact, conditions and state retained",
        })),
      }),
    )
    await advance(f, `${action}-workflow`, plan)
    const state = await prepareEventPublicationHandoff(
      f.ctx,
      handoffParameters(f, `${action}-workflow`),
    )
    const handoff = readJSON(f.root, state.publication_handoff.path)
    assert.equal(handoff.approved_runs[0].action, action)
    assert.equal(handoff.approved_runs[0].event_id, old.article.event_id)
    assert.equal(handoff.approved_runs[0].published_at, old.article.article_review.published_at)
    assert.equal(handoff.approved_runs[0].revision.previous.run, "writer")
    const native = loadCurrentApproval(f.root, run, { vault: f.ctx.vault })
    const vault = path.join(f.root, "projection-vault")
    fs.mkdirSync(path.join(vault, "Knowledge"), { recursive: true })
    const original = editionProjection([old.article], {
      key: "2026-09-27_0800_Tech_AI_Briefing",
      date: "2026-09-27",
      coverage_start: "2026-09-26T08:00:00+09:00",
      coverage_end: "2026-09-27T08:00:00+09:00",
    })
    atomicWrite(vault, original.path, original.content)
    const projected = retrospectiveProjections(vault, [native.article], [], [], { root: f.root })
    assert.equal(projected.length, 1)
    assert.deepEqual(projected[0].event_ids, [old.article.event_id])
    assert.match(projected[0].content, /대조한 계약 내용/)
    assert.match(projected[0].content, /2026-09-27/)
    atomicWrite(f.root, `runs/${run}/event-revision-review.json`, { invalid: true })
    assert.throws(
      () =>
        loadDailyPublicationSelection(f.root, state.publication_handoff.path, {
          vault: f.ctx.vault,
        }),
      /revision review changed/,
    )
  })
}

test("native event publication reuse retains the prior reference without preparing another article", async (t) => {
  const f = await ready(t),
    plan = await relationPlan(f, "reuse")
  const calls = f.provider.calls
  await advance(f, "reuse-workflow", plan)
  const state = await prepareEventPublicationHandoff(f.ctx, handoffParameters(f, "reuse-workflow"))
  assert.equal(state.status, "no_authoring_changes")
  assert.deepEqual(state.approved_runs, [])
  assert.deepEqual(state.reused_runs, ["writer"])
  assert.equal(state.public_input_ready, false)
  assert.equal(f.provider.calls, calls)
  const handoff = readJSON(f.root, state.publication_handoff.path)
  assert.equal(handoff.reused_runs[0].published_at, "2026-09-27")
  assert.equal(handoff.reused_runs[0].action, "reuse")
})

test("native event publication rejects changed bytes, vault and unrelated groups before promotion", async (t) => {
  const f = await ready(t),
    p = handoffParameters(f)
  validateArguments(p, publication.operations.prepare.inputSchema, f.ctx)
  assert.equal(publication.operations.status.readOnly, true)
  assert.throws(
    () =>
      validateArguments({ ...p, publish: true }, publication.operations.prepare.inputSchema, f.ctx),
    /Unknown module field/,
  )
  await assert.rejects(
    prepareEventPublicationHandoff(f.ctx, { ...p, workflow_sha256: "0".repeat(64) }),
    /evidence changed/,
  )
  await assert.rejects(
    prepareEventPublicationHandoff(f.ctx, { ...p, group_ids: ["unrelated"] }),
    /reviewed event plan/,
  )
  const state = await prepareEventPublicationHandoff(f.ctx, p)
  assert.throws(
    () =>
      loadDailyPublicationSelection(f.root, state.publication_handoff.path, {
        vault: path.join(f.root, "other-vault"),
      }),
    /another vault/,
  )
  const article = readJSON(f.root, "runs/writer/approved-article.json")
  atomicWrite(f.root, "runs/writer/approved-article.json", {
    ...article,
    title: "Unapproved title",
  })
  assert.throws(
    () =>
      loadDailyPublicationSelection(f.root, state.publication_handoff.path, { vault: f.ctx.vault }),
    /Saved approval differs/,
  )
  atomicWrite(f.root, "runs/writer/approved-article.json", article)
  fs.writeFileSync(safePath(f.root, f.sources[0].document.body_path), "Changed original bytes")
  assert.throws(
    () => eventPublicationStatus(f.ctx, { run_id: "publication" }),
    /Collection material source or parse changed/,
  )
})

test("native event publication status on an absent run is read-only and needs no authentication", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "event-publication-status-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const result = eventPublicationStatus(
    { root, vault: path.join(root, "vault") },
    { run_id: "missing" },
  )
  assert.equal(result.status, "handoff_pending")
  assert.equal(result.public_verified, false)
  assert.deepEqual(fs.readdirSync(root), [])
})
