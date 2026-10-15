import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { editionFixture } from "./fixtures/research-event-fixtures.mjs"
import { deliveryFixture } from "./fixtures/publication-delivery.mjs"
import {
  prepareCuration,
  evaluateCuration,
  selectCuration,
  loadCurationSelection,
  loadCurationPool,
  curationCandidatePacket,
  CURATION_METRICS,
} from "../scripts/research/curation.mjs"
import { advanceCuration } from "../scripts/research/curation-workflow.mjs"
import { loadDailyPublicationSelection } from "../scripts/research/daily-publication-handoff.mjs"
import { loadCurrentApproval, newEditionProjections } from "../scripts/research/preview.mjs"
import { reviewEditionEvents } from "../scripts/research/event-pipeline.mjs"
import { executeModule, moduleCatalog } from "../scripts/research/module-registry.mjs"
import { moduleCLI } from "../scripts/research/module-cli.mjs"
import { atomicWrite, readJSON, safePath } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { noteText, parseNote } from "../scripts/garden.mjs"

function setup(t) {
  const f = editionFixture(t)
  f.event = f.review.events.find((e) => e.action === "write")
  f.deferred = f.review.events.find((e) => e.action === "defer")
  f.ctx.vault = path.join(f.root, "vault")
  fs.mkdirSync(f.ctx.vault, { recursive: true })
  f.ctx.backlog = path.join(f.root, "candidate-backlog.json")
  atomicWrite(f.root, "candidate-backlog.json", {
    schema: "research-candidates/v1",
    candidates: [],
  })
  return f
}
async function plan(f, name, events) {
  const file = "review-" + name + ".json"
  atomicWrite(f.root, file, { ...f.review, events })
  return reviewEditionEvents(f.ctx, {
    ...f.parameters,
    run_id: name,
    review_file: path.relative(f.ctx.repo, path.join(f.root, file)),
  })
}
const ref = (value) => ({ path: value.path, sha256: value.sha256 })
async function pool(f, name, plans, max_articles = 40) {
  const prepared = await prepareCuration(f.ctx, {
    run_id: name,
    briefing_date: "2026-10-12",
    plans: plans.map(ref),
    max_articles,
  })
  return { ...prepared, value: loadCurationPool(f.ctx, ref(prepared)) }
}
function rating(f, candidate, value = 4, patch = {}) {
  const packet = curationCandidatePacket(f.ctx, candidate)
  const source = packet.sources[0],
    block = source.blocks[0]
  return {
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
      CURATION_METRICS.map((metric) => [
        metric,
        { value, reason: "Compared this original and the supplied history for " + metric },
      ]),
    ),
    evidence: [{ material_id: source.material_id, block_id: block.block_id, quote: block.text }],
    compared_article_ids: candidate.related_articles.map((a) => a.id),
    valid_until: null,
    ...patch,
  }
}
async function review(f, p, evaluations, stamp = new Date().toISOString()) {
  const name = "curation-review-" + sha256(JSON.stringify(evaluations)).slice(0, 12) + ".json"
  atomicWrite(f.root, name, {
    schema: "research-curation-review/v1",
    pool_sha256: p.sha256,
    reviewer: "test-source-and-history-reader",
    reviewed_at: stamp,
    evaluations,
  })
  return evaluateCuration(f.ctx, {
    pool_path: p.path,
    pool_sha256: p.sha256,
    review_file: path.relative(f.ctx.repo, path.join(f.root, name)),
  })
}
const choose = (f, p) => selectCuration(f.ctx, { pool_path: p.path, pool_sha256: p.sha256 })

test("curation carries older deferred news ahead of a lower-score later candidate without changing dates or source files", async (t) => {
  const f = setup(t)
  const old = await plan(f, "older-plan", [f.deferred])
  const before = fs.readFileSync(safePath(f.root, old.path))
  const older = await pool(f, "older-pool", [old])
  await review(f, older, [rating(f, older.value.candidates[0], 5)])
  const later = await plan(f, "later-plan", [f.event])
  const current = await pool(f, "mixed-pool", [later], 1)
  assert.equal(current.carried_plans, 1)
  const laterCandidate = current.value.candidates.find((c) => c.group_id === f.event.group_id)
  await review(f, current, [rating(f, laterCandidate, 4)])
  const selected = loadCurationSelection(f.ctx, ref(await choose(f, current)))
  assert.equal(selected.selected.length, 1)
  assert.equal(selected.selected[0].group_id, f.deferred.group_id)
  assert.equal(selected.selected[0].score, 100)
  assert.equal(selected.selected[0].source_published_at, "2026-09-27")
  assert.equal(selected.selected[0].briefing_date, "2026-10-12")
  assert.equal(selected.first_featured_marked, false)
  assert.ok(selected.held.some((c) => c.reason === "article_budget"))
  assert.deepEqual(fs.readFileSync(safePath(f.root, old.path)), before)
  assert.ok(!JSON.stringify(current.value).includes("Original test source"))
  assert.equal(selected.candidate_approved, false)
  assert.equal(selected.candidate_published, false)
})

test("curation reuses the exact approved writer selection when a deferred event is promoted again", async (t) => {
  const f = await deliveryFixture(t)
  f.ctx.vault = path.join(f.root, "vault")
  f.ctx.backlog = path.join(f.root, "candidate-backlog.json")
  fs.mkdirSync(f.ctx.vault, { recursive: true })
  atomicWrite(f.root, "candidate-backlog.json", {
    schema: "research-candidates/v1",
    candidates: [],
  })
  const approvedEvent = f.review.events.find((event) => event.action === "write")
  const deferred = { ...approvedEvent, group_id: "previously-approved-deferred", action: "defer" }
  const planned = await plan(f, "approved-deferred-promotion", [deferred])
  const p = await pool(f, "approved-deferred-pool", [planned], 1)
  await review(f, p, [rating(f, p.value.candidates[0], 5)])

  const selectedRef = await choose(f, p)
  const selected = loadCurationSelection(f.ctx, ref(selectedRef))
  assert.equal(selected.selected.length, 1)
  assert.equal(selected.selected[0].action, "defer")
  assert.deepEqual(selected.selected[0].execution, {
    plan: ref(f.plan),
    group_id: approvedEvent.group_id,
  })
  assert.equal(
    selected.batches.some((batch) => batch.plan.path.startsWith("event-plans/cur-promote-")),
    false,
    "the new curation selection must reference the immutable plan behind the approved writer",
  )
  const promotionRun =
    "cur-promote-" +
    sha256(
      JSON.stringify([{ path: p.path, sha256: p.sha256 }, p.value.candidates[0].candidate_id]),
    ).slice(0, 40)
  assert.equal(readJSON(f.root, `event-plans/${promotionRun}/plan.json`), null)
})

test("curation source/novelty gates beat high scores and unknown assessments remain queued", async (t) => {
  const f = setup(t),
    p = await pool(f, "gated", [await plan(f, "gated-plan", [f.event, f.deferred])])
  const first = rating(f, p.value.candidates[0], 5)
  first.checks.source_verified = false
  await review(f, p, [first])
  const chosen = loadCurationSelection(f.ctx, ref(await choose(f, p)))
  assert.equal(chosen.selected.length, 0)
  assert.ok(chosen.held.some((c) => c.reason === "ineligible_or_no_new_information"))
  assert.ok(chosen.held.some((c) => c.reason === "curator_review_required"))
  assert.equal(readJSON(f.root, "curation/queue.json").plans.length, 1)
})

test("the same reviewed identity is held once across plans even when JSON field order differs", async (t) => {
  const f = setup(t)
  const repeated = {
    ...f.event,
    group_id: "same-event-reordered",
    identity: Object.fromEntries(Object.entries(f.event.identity).reverse()),
  }
  const original = await plan(f, "identity-original", [f.event])
  const reordered = await plan(f, "identity-reordered", [repeated])
  const p = await pool(f, "identity-pool", [original, reordered])
  await review(
    f,
    p,
    p.value.candidates.map((c) => rating(f, c, 5)),
  )
  const selected = loadCurationSelection(f.ctx, ref(await choose(f, p)))
  assert.equal(selected.selected.length, 1)
  assert.equal(selected.held.length, 1)
  assert.equal(selected.held[0].reason, "event_identity_collision_requires_review")
  assert.equal(readJSON(f.root, "curation/queue.json").plans.length, 2)
})

test("curation rejects unsupported evidence and fractional/out-of-range scores", async (t) => {
  const f = setup(t),
    p = await pool(f, "invalid", [await plan(f, "invalid-plan", [f.event])])
  const candidate = p.value.candidates[0]
  const unsupported = rating(f, candidate)
  unsupported.evidence[0].quote = "This text never appeared in the stored original."
  await assert.rejects(review(f, p, [unsupported]), /exact original block/)
  for (const value of [6, -1, 4.5]) {
    const invalid = rating(f, candidate)
    invalid.ratings.novelty.value = value
    await assert.rejects(review(f, p, [invalid]))
  }
})

test("already presented source events cannot get another article even with maximum ratings", async (t) => {
  const f = setup(t),
    planned = await plan(f, "featured-plan", [f.event])
  const material = f.report.materials.find((m) => m.id === f.event.materials[0].material_id)
  fs.mkdirSync(path.join(f.ctx.vault, "News"), { recursive: true })
  fs.writeFileSync(
    path.join(f.ctx.vault, "News", "1111111111111111.md"),
    noteText(
      {
        type: "news",
        event_id: "1111111111111111",
        title: "Existing robot order",
        date: "2026-09-27",
        published_at: "2026-09-27",
        review_status: "verified",
        sources: [material.url],
      },
      "The same original order is already presented.",
    ),
  )
  const p = await pool(f, "featured", [planned])
  assert.equal(p.value.candidates[0].already_featured, true)
  await review(f, p, [rating(f, p.value.candidates[0], 5)])
  const selected = loadCurationSelection(f.ctx, ref(await choose(f, p)))
  assert.equal(selected.selected.length, 0)
})

test("changed history or original bytes require re-evaluation rather than reusing a stale selection", async (t) => {
  const f = setup(t),
    p = await pool(f, "stale", [await plan(f, "stale-plan", [f.event])])
  await review(f, p, [rating(f, p.value.candidates[0])])
  const chosen = ref(await choose(f, p))
  atomicWrite(f.root, "candidate-backlog.json", {
    schema: "research-candidates/v1",
    candidates: [],
    changed: true,
  })
  assert.throws(() => loadCurationSelection(f.ctx, chosen), /history changed/)
  const frozen = loadCurationSelection(f.ctx, chosen, { checkHistory: false })
  assert.equal(
    frozen.selected.length,
    1,
    "a historical decision remains readable without granting a fresh selection",
  )
  const parse = p.value.candidates[0].sources[0].parse_id
  const stored = readJSON(f.root, `parses/${parse}/parse.json`)
  stored.blocks[0].text += " altered"
  atomicWrite(f.root, `parses/${parse}/parse.json`, stored)
  assert.throws(() => loadCurationSelection(f.ctx, chosen, { checkHistory: false }), /SHA|changed/)
})

test("reading selected articles does not reopen held candidates, while selected-source tampering still fails", async (t) => {
  const f = setup(t)
  const p = await pool(
    f,
    "selected-read-scope",
    [await plan(f, "scoped-plan", [f.event, f.deferred])],
    1,
  )
  await review(
    f,
    p,
    p.value.candidates.map((c) => rating(f, c, c.group_id === f.event.group_id ? 5 : 4)),
  )
  const chosen = ref(await choose(f, p))
  const selected = p.value.candidates.find((c) => c.group_id === f.event.group_id)
  const held = p.value.candidates.find((c) => c.group_id === f.deferred.group_id)
  const doc = readJSON(f.root, `runs/${held.sources[0].source_run}/documents.json`).find(
    (d) => d.source_id === held.sources[0].source_id,
  )
  fs.unlinkSync(safePath(f.root, doc.body_path))
  assert.equal(loadCurationSelection(f.ctx, chosen).selected[0].group_id, f.event.group_id)
  assert.throws(() => loadCurationPool(f.ctx, ref(p)), /ENOENT|missing|body|source/i)
  const parse = selected.sources[0].parse_id
  const stored = readJSON(f.root, `parses/${parse}/parse.json`)
  stored.blocks[0].text += " altered selected evidence"
  atomicWrite(f.root, `parses/${parse}/parse.json`, stored)
  assert.throws(() => loadCurationSelection(f.ctx, chosen), /SHA|changed/)
})

test("curation preserves old score revisions and reuses unchanged reviewed scores across days", async (t) => {
  const f = setup(t),
    planned = await plan(f, "history-plan", [f.event])
  const p = await pool(f, "score-first", [planned])
  const initial = await review(f, p, [rating(f, p.value.candidates[0], 4)])
  const previous = initial.evaluations[0]
  const bytes = fs.readFileSync(safePath(f.root, previous.path))
  const changed = rating(f, p.value.candidates[0], 5)
  const next = await review(f, p, [changed])
  assert.notEqual(next.evaluations[0].path, previous.path)
  assert.deepEqual(fs.readFileSync(safePath(f.root, previous.path)), bytes)
  const nextPool = await pool(f, "score-next", [])
  const selected = loadCurationSelection(f.ctx, ref(await choose(f, nextPool)))
  assert.equal(selected.selected[0].score, 100)
})

test("expired current-validity evidence is held without an arbitrary publication-age penalty", async (t) => {
  const f = setup(t),
    p = await pool(f, "expired", [await plan(f, "expired-plan", [f.event])])
  await review(f, p, [rating(f, p.value.candidates[0], 5, { valid_until: "2026-10-11" })])
  const selected = loadCurationSelection(f.ctx, ref(await choose(f, p)))
  assert.equal(selected.selected.length, 0)
  assert.equal(selected.held[0].score, 100)
})

function modelForFixture() {
  let calls = 0
  return {
    get calls() {
      return calls
    },
    async metadata(model) {
      return {
        model,
        digest: sha256("curation-test-local-model"),
        runtime: "test",
        capabilities: ["completion"],
        thinking: { values: [false, true, "medium"] },
      }
    },
    async structured(request) {
      calls++
      const data = JSON.parse(request.messages[1].content)
      if (Array.isArray(data))
        return {
          output: {
            claims: data.flatMap((d) =>
              d.blocks.map((b) => ({
                statement: b.text,
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
            digest: sha256("curation-test-local-model"),
            prompt_sha256: sha256(JSON.stringify(request.messages)),
          },
        }
      const source = data.sources[0],
        block = source.blocks[0]
      return {
        output: {
          candidate_id: data.candidate_id,
          sector: "로봇·제조",
          checks: {
            source_verified: true,
            scope_relevant: true,
            new_information: true,
            current_valid: true,
            history_compared: true,
          },
          ratings: Object.fromEntries(
            CURATION_METRICS.map((m) => [
              m,
              { value: 5, reason: "Controlled model proposal for original " + m },
            ]),
          ),
          evidence: [
            { material_id: source.material_id, block_id: block.block_id, quote: block.text },
          ],
          compared_article_ids: data.related_articles.map((a) => a.id),
          valid_until: null,
        },
        provenance: { model: request.model, digest: sha256("curation-test-local-model") },
      }
    },
  }
}

test("model scores stay unreviewed and cached model proposals do not grant article approval", async (t) => {
  const f = setup(t),
    p = await pool(f, "model-score", [await plan(f, "model-score-plan", [f.event])])
  const model = modelForFixture()
  const result = await evaluateCuration(
    f.ctx,
    { pool_path: p.path, pool_sha256: p.sha256, execute: true },
    { baseProvider: model },
  )
  assert.equal(result.evaluations[0].status, "unreviewed")
  assert.equal(result.status, "curation_review")
  assert.equal(result.rows[0].status, "curation_review")
  assert.equal(result.rows[0].candidate_id, p.value.candidates[0].candidate_id)
  assert.equal(model.calls, 1)
  const cached = await evaluateCuration(
    f.ctx,
    { pool_path: p.path, pool_sha256: p.sha256, execute: true },
    { baseProvider: model },
  )
  assert.equal(model.calls, 1)
  assert.equal(cached.evaluations[0].sha256, result.evaluations[0].sha256)
  assert.equal((await choose(f, p)).selected, 0)
})

test("curation dispatches only selected events to native extraction and resumes without repeated model work", async (t) => {
  const f = setup(t),
    planned = await plan(f, "dispatch-plan", [f.event, f.deferred])
  const p = await pool(f, "dispatch", [planned], 1)
  await review(
    f,
    p,
    p.value.candidates.map((c) => rating(f, c, c.group_id === f.event.group_id ? 5 : 4)),
  )
  const chosen = await choose(f, p),
    provider = modelForFixture()
  const parameters = {
    run_id: "dispatch-workflow",
    selection_path: chosen.path,
    selection_sha256: chosen.sha256,
    execute: true,
  }
  const first = await advanceCuration(f.ctx, parameters, { baseProvider: provider })
  const selectedSourceCount = new Set(f.event.materials.map((m) => m.material_id)).size
  assert.equal(provider.calls, selectedSourceCount)
  assert.equal(first.article_writes, 0)
  const workflow = readJSON(f.root, first.workflows[0].workflow.path)
  assert.equal(workflow.rows.find((r) => r.group_id === f.event.group_id).status, "fact_review")
  assert.equal(workflow.rows.find((r) => r.group_id === f.deferred.group_id).status, "not_selected")
  assert.equal(first.candidate_published, false)
  const resumed = await advanceCuration(f.ctx, parameters, { baseProvider: provider })
  assert.equal(provider.calls, selectedSourceCount)
  assert.equal(resumed.model_calls, 0)
  assert.deepEqual(resumed.workflows[0].plan, ref(planned))
})

test("curation preserves real Codex delegation task references instead of treating reasoning wait as editorial review", async (t) => {
  const f = setup(t)
  f.ctx.policy = path.join(f.ctx.repo, "data/research-model-policy-codex.json")
  const p = await pool(f, "codex-curation", [await plan(f, "codex-curation-plan", [f.event])], 1)
  await review(f, p, [rating(f, p.value.candidates[0], 5)])
  const chosen = await choose(f, p)
  const result = await advanceCuration(f.ctx, {
    run_id: "codex-curation-wait",
    selection_path: chosen.path,
    selection_sha256: chosen.sha256,
    execute: true,
    max_items: 1,
    max_model_calls: 1,
  })
  assert.equal(result.status, "waiting_for_reasoning")
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].status, "waiting_for_reasoning")
  assert.ok(result.reasoning_tasks.length > 0)
  assert.equal(result.reasoning_tasks[0].task_id, result.rows[0].reasoning_task.task_id)
  assert.equal(
    result.reasoning_tasks[0].request_sha256,
    result.rows[0].reasoning_task.request_sha256,
  )
  assert.deepEqual(result.approved_runs, [])
  assert.equal(result.candidate_published, false)
})

test("new MCP round stops for curation before creating writers", async (t) => {
  const f = setup(t),
    planned = await plan(f, "round-plan", [f.event])
  const result = await executeModule(f.ctx, "edition", "advance", {
    run_id: "curation-round",
    round: true,
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
    plan_path: planned.path,
    plan_sha256: planned.sha256,
    execute: false,
  })
  assert.equal(result.status, "curation_required")
  assert.equal(result.next_inputs[0].module, "curation")
  assert.equal(fs.existsSync(path.join(f.root, "event-selections")), false)
})

test("curation is independently callable through the same strict CLI/MCP module contract", async (t) => {
  const f = setup(t),
    planned = await plan(f, "cli-plan", [f.event])
  const catalog = moduleCatalog(["curation"])
  assert.deepEqual(
    catalog.modules[0].operations.map((op) => op.id),
    ["prepare", "evaluate", "select", "advance"],
  )
  await assert.rejects(
    executeModule(f.ctx, "curation", "prepare", {
      run_id: "x",
      briefing_date: "2026-10-12",
      plans: [],
      max_articles: 41,
    }),
    /bound/,
  )
  const result = await moduleCLI(
    [
      "prepare",
      "--root",
      f.root,
      "--vault",
      f.ctx.vault,
      "--backlog",
      f.ctx.backlog,
      "--json",
      JSON.stringify({ run_id: "cli-pool", briefing_date: "2026-10-12", plans: [ref(planned)] }),
    ],
    "curation",
  )
  assert.equal(result.data.candidates, 1)
  assert.equal(result.job.state, "completed")
})

test("a waiting round accepts one curation binding and resumes it without rewriting its frozen collection input", async (t) => {
  const f = setup(t),
    planned = await plan(f, "attach-plan", [f.event])
  const parameters = {
    run_id: "attach-round",
    round: true,
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
    plan_path: planned.path,
    plan_sha256: planned.sha256,
    execute: false,
  }
  assert.equal(
    (await executeModule(f.ctx, "edition", "advance", parameters)).status,
    "curation_required",
  )
  const inputPath = "round-workflows/attach-round/input.json"
  const before = fs.readFileSync(safePath(f.root, inputPath))
  const p = await pool(f, "attach-pool", [planned], 1)
  await review(f, p, [rating(f, p.value.candidates[0], 5)])
  const selected = await choose(f, p)
  const attached = await executeModule(f.ctx, "edition", "advance", {
    ...parameters,
    curation_path: selected.path,
    curation_sha256: selected.sha256,
  })
  assert.deepEqual(attached.curation, ref(selected))
  assert.deepEqual(fs.readFileSync(safePath(f.root, inputPath)), before)
  const resumed = await executeModule(f.ctx, "edition", "advance", parameters)
  assert.deepEqual(resumed.curation, ref(selected))
  assert.deepEqual(resumed.event_workflow, attached.event_workflow)
  assert.equal(resumed.model_calls, 0)
})

test("mixed-age selected origins route to the curator dispatcher rather than losing the older winner", async (t) => {
  const f = setup(t),
    older = await plan(f, "mixed-old-plan", [f.deferred])
  const first = await pool(f, "mixed-old-pool", [older])
  await review(f, first, [rating(f, first.value.candidates[0], 5)])
  const later = await plan(f, "mixed-new-plan", [f.event])
  const p = await pool(f, "mixed-new-pool", [later], 1)
  await review(f, p, [
    rating(
      f,
      p.value.candidates.find((c) => c.group_id === f.event.group_id),
      4,
    ),
  ])
  const selected = await choose(f, p)
  const result = await executeModule(f.ctx, "edition", "advance", {
    run_id: "mixed-round",
    round: true,
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
    plan_path: later.path,
    plan_sha256: later.sha256,
    curation_path: selected.path,
    curation_sha256: selected.sha256,
    execute: false,
  })
  assert.equal(result.status, "curation_ready")
  assert.equal(result.next_inputs[0].operation, "advance")
  assert.equal(result.next_inputs[0].selection_path, selected.path)
  assert.equal(fs.existsSync(path.join(f.root, "event-selections")), false)
})

test("sector budgets hold excess high-quality candidates without filling other sectors or forgetting the queue", async (t) => {
  const f = setup(t)
  const events = Array.from({ length: 6 }, (_, i) => ({
    ...structuredClone(f.event),
    group_id: "different-" + i,
    identity: { ...f.event.identity, object: "Test customer " + i, external_id: "Contract-" + i },
  }))
  const p = await pool(f, "sector-budget", [await plan(f, "sector-budget-plan", events)])
  await review(
    f,
    p,
    p.value.candidates.map((c) => rating(f, c, 5)),
  )
  const selection = loadCurationSelection(f.ctx, ref(await choose(f, p)))
  assert.equal(selection.selected.length, 5)
  assert.equal(selection.held.filter((c) => c.reason === "sector_budget").length, 1)
  assert.ok(selection.selected.every((c) => c.sector === "로봇·제조"))
  assert.equal(readJSON(f.root, "curation/queue.json").plans.length, 1)
})

test("curated native approvals project knowledge and keep exact publication lineage after history changes", async (t) => {
  const f = await deliveryFixture(t)
  f.ctx.vault = path.join(f.root, "vault")
  fs.mkdirSync(f.ctx.vault, { recursive: true })
  f.ctx.backlog = path.join(f.root, "candidate-backlog.json")
  atomicWrite(f.root, "candidate-backlog.json", {
    schema: "research-candidates/v1",
    candidates: [],
  })
  atomicWrite(
    f.ctx.vault,
    "Editions/previous.md",
    noteText(
      {
        type: "briefing",
        schema_version: "tech-ai-magazine/v2",
        editorial_format: "six-w/v1",
        briefing_format: "sector-five/v1",
        theme_format: "news-themes/v1",
        article_records: [],
        article_reviews: [],
        headlines: [],
        date: "2026-10-11",
        coverage_start: "2026-10-09T15:00:00Z",
        coverage_end: "2026-10-10T15:00:00Z",
      },
      "## 오늘의 주요 소식\n\n",
    ),
  )
  const p = await pool(f, "approved-curation", [f.plan], 1)
  const candidate = p.value.candidates.find((c) => c.group_id === "order")
  await review(f, p, [rating(f, candidate, 5)])
  const chosen = await choose(f, p)
  const parameters = {
    run_id: "approved-curation-workflow",
    selection_path: chosen.path,
    selection_sha256: chosen.sha256,
    execute: false,
  }
  const callsBefore = f.provider.calls
  const result = await advanceCuration(f.ctx, parameters, { baseProvider: f.provider })
  assert.equal(result.status, "complete")
  assert.deepEqual(result.approved_runs, ["writer"])
  assert.equal(result.model_calls, 0)
  assert.equal(result.article_writes, 0)
  assert.equal(f.provider.calls, callsBefore)
  assert.ok(readJSON(f.root, result.ontology.path).nodes.length > 0)
  const heldOriginal = f.sources[3].document.body_path
  fs.unlinkSync(safePath(f.root, heldOriginal))
  const handoff = loadDailyPublicationSelection(f.root, result.publication_handoff.path, {
    vault: f.ctx.vault,
  })
  assert.deepEqual(handoff.approvedRuns, ["writer"])
  const article = loadCurrentApproval(f.root, "writer", { vault: f.ctx.vault }).article
  const spec = {
    schema: "research-private-edition/v1",
    intent: "private_slice",
    key: "2026-10-12_0800_Tech_AI_Briefing",
    date: "2026-10-12",
    coverage_start: "2026-10-10T15:00:00Z",
    coverage_end: "2026-10-11T15:00:00Z",
  }
  assert.throws(() => newEditionProjections(f.ctx.vault, [article], spec), /out-of-window/)
  const projected = newEditionProjections(f.ctx.vault, [article], spec, [], new Map(), {
    root: f.root,
    curation: handoff.curation,
  })
  assert.equal(parseNote(projected[0].content).meta.date, "2026-10-12")
  assert.ok(projected[0].content.includes("2026-09-27"))
  assert.deepEqual(projected[0].event_ids, [article.event_id])
  assert.throws(
    () =>
      newEditionProjections(
        f.ctx.vault,
        [{ ...article, title: "An unapproved alteration" }],
        spec,
        [],
        new Map(),
        {
          root: f.root,
          curation: handoff.curation,
        },
      ),
    /out-of-window/,
  )
  let repeated = 0
  const resumed = await advanceCuration(f.ctx, parameters, {
    eventProcessor: async () => {
      repeated++
      throw Error("Completed native workflow repeated")
    },
  })
  assert.equal(repeated, 0)
  assert.equal(resumed.status, "complete")

  // A later canonical publication changes current selection context, but the
  // pinned historical handoff remains readable under its original approval.
  atomicWrite(
    f.ctx.vault,
    "News/newly-featured.md",
    noteText(
      {
        type: "news",
        event_id: "abcdef0123456789",
        title: "Newly featured contract",
        date: "2026-10-12",
        published_at: "2026-09-27",
        review_status: "verified",
        sources: candidate.sources.map((s) => s.url),
      },
      "The original event is now in the canonical history.",
    ),
  )
  assert.throws(() => loadCurationSelection(f.ctx, ref(chosen)), /history changed/)
  assert.throws(
    () =>
      newEditionProjections(f.ctx.vault, [article], spec, [], new Map(), {
        root: f.root,
        curation: handoff.curation,
      }),
    /history changed/,
  )
  assert.deepEqual(
    loadDailyPublicationSelection(f.root, result.publication_handoff.path, {
      vault: f.ctx.vault,
    }).approvedRuns,
    ["writer"],
  )
  const childRef = result.workflows[0].publication_handoff
  const child = readJSON(f.root, childRef.path)
  const changedChild = { ...child, candidate_published: true }
  atomicWrite(f.root, childRef.path, changedChild)
  assert.throws(
    () =>
      loadDailyPublicationSelection(f.root, result.publication_handoff.path, {
        vault: f.ctx.vault,
      }),
    /child changed/,
  )
})
