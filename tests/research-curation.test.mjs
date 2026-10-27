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
import {
  loadCurrentApproval,
  newEditionProjections,
  loadPreviewPublicationInputs,
} from "../scripts/research/preview.mjs"
import { advanceEventWorkflow } from "../scripts/research/event-workflow.mjs"
import { approveNoteReview } from "../scripts/research/note-review.mjs"
import { requestPublicationDelivery } from "../scripts/research/authoring-delivery-request.mjs"
import { reviewEditionEvents } from "../scripts/research/event-pipeline.mjs"
import { executeModule, moduleCatalog } from "../scripts/research/module-registry.mjs"
import { moduleCLI } from "../scripts/research/module-cli.mjs"
import { submitModuleJob } from "../scripts/research/module-runtime.mjs"
import { readReasoningTask } from "../scripts/research/reasoning-tasks.mjs"
import { atomicWrite, readJSON, safePath } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { assertUnwrittenApprovedHandoff } from "../scripts/research/operations-continuation.mjs"
import { noteText, parseNote, canonicalURL } from "../scripts/garden.mjs"

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

test("an approved unpublished article can be curated once through its exact reuse lineage", async (t) => {
  const f = await deliveryFixture(t)
  f.ctx.vault = path.join(f.root, "vault")
  f.ctx.backlog = path.join(f.root, "candidate-backlog.json")
  fs.mkdirSync(f.ctx.vault, { recursive: true })
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
  const notes = await approvedPublicationNotes(f, "unpublished-reuse-notes")
  const original = f.review.events.find((event) => event.action === "write")
  const primary = f.sources[0].parsed
  const proof = primary.blocks[0]
  const reuse = {
    ...original,
    group_id: "approved-unpublished-reuse",
    action: "reuse",
    prior_run: "writer",
    prior_matches: ["identity_marker", "event_action"].map((aspect) => ({
      aspect,
      parse_id: primary.parse_id,
      block_id: proof.block_id,
      quote: proof.text,
      primary_block_id: proof.block_id,
      primary_quote: proof.text,
      conclusion: "The exact approved original describes the same contract and action",
    })),
  }
  const planned = await plan(f, "approved-unpublished-reuse-plan", [reuse])
  const p = await pool(f, "approved-unpublished-first-feature", [planned])
  assert.equal(p.value.candidates[0].already_featured, false)
  await review(f, p, [rating(f, p.value.candidates[0], 5)])
  const selection = await choose(f, p)
  const advanced = await advanceCuration(f.ctx, {
    run_id: "approved-unpublished-first-feature-workflow",
    selection_path: selection.path,
    selection_sha256: selection.sha256,
    execute: true,
    max_items: 4,
    note_review_runs: [notes.run],
  })
  assert.equal(advanced.status, "complete")
  assert.deepEqual(advanced.approved_runs, ["writer"])
  assert.equal(advanced.model_calls, 0)
  assert.equal(advanced.article_writes, 0)
  const approved = loadCurrentApproval(f.root, "writer", { vault: f.ctx.vault })
  const handoff = loadDailyPublicationSelection(f.root, advanced.publication_handoff.path, {
    vault: f.ctx.vault,
  })
  assert.deepEqual(handoff.approvedRuns, ["writer"])
  assert.deepEqual(handoff.knowledgeRuns, [notes.run])
  const spec = {
    schema: "research-private-edition/v1",
    intent: "private_slice",
    key: "2026-10-12_0800_Tech_AI_Briefing",
    date: "2026-10-12",
    coverage_start: "2026-10-10T15:00:00Z",
    coverage_end: "2026-10-11T15:00:00Z",
  }
  const preview = loadPreviewPublicationInputs(f.root, "first-feature-preview", [], {
    vault: f.ctx.vault,
    publicationHandoff: advanced.publication_handoff.path,
    editionSpec: spec,
  })
  assert.deepEqual(preview.newEditionRuns, ["writer"])
  assert.deepEqual(preview.knowledgeRuns, [notes.run])
  assert.deepEqual(preview.approvals[0].files, approved.files)
  const recoveryState = {
    status: "complete",
    edition: f.editionRef,
    curation: preview.curation,
    publication_handoff: advanced.publication_handoff,
    canonical_writes: 0,
    candidate_published: false,
    stages: { events: { status: "complete" } },
  }
  assert.deepEqual(
    assertUnwrittenApprovedHandoff(f.ctx, recoveryState, "parent"),
    advanced.publication_handoff,
  )
  for (const patch of [
    { canonical_writes: 1 },
    { candidate_published: true },
    { status: "review_pending" },
    { curation: { ...preview.curation, sha256: "0".repeat(64) } },
  ])
    assert.throws(() =>
      assertUnwrittenApprovedHandoff(f.ctx, { ...recoveryState, ...patch }, "parent"),
    )
  atomicWrite(f.root, "runs/parent-delivery/publication-delivery/binding.json", { unit_only: true })
  assert.throws(
    () => assertUnwrittenApprovedHandoff(f.ctx, recoveryState, "parent"),
    /External publication/,
  )
  fs.unlinkSync(safePath(f.root, "runs/parent-delivery/publication-delivery/binding.json"))
  atomicWrite(f.root, "runs/parent-delivery/publication-delivery/executions/partial/spec.json", {
    unit_only: true,
  })
  assert.throws(
    () => assertUnwrittenApprovedHandoff(f.ctx, recoveryState, "parent"),
    /External publication/,
  )
  fs.rmSync(safePath(f.root, "runs/parent-delivery/publication-delivery/executions"), {
    recursive: true,
  })
  const projected = newEditionProjections(
    f.ctx.vault,
    [preview.approvals[0].article],
    spec,
    [],
    new Map(),
    {
      root: f.root,
      curation: preview.curation,
    },
  )
  assert.deepEqual(projected[0].event_ids, [approved.article.event_id])
  assert.equal(parseNote(projected[0].content).meta.date, "2026-10-12")
  assert.ok(projected[0].content.includes("2026-09-27"))
  fs.mkdirSync(path.join(f.ctx.vault, "News"), { recursive: true })
  fs.writeFileSync(
    path.join(f.ctx.vault, "News", approved.article.event_id + ".md"),
    noteText(
      {
        type: "news",
        event_id: approved.article.event_id,
        title: approved.article.title,
        date: "2026-10-12",
        published_at: "2026-09-27",
        review_status: "verified",
        sources: approved.article.source_urls,
      },
      approved.article.record.lead,
    ),
  )
  const after = await pool(f, "approved-reuse-already-public", [planned])
  assert.equal(after.value.candidates[0].already_featured, true)
  await review(f, after, [rating(f, after.value.candidates[0], 5)])
  const second = loadCurationSelection(f.ctx, ref(await choose(f, after)))
  assert.equal(second.selected.length, 0)
  assert.equal(second.held[0].reason, "ineligible_or_no_new_information")
  // Delivery readbacks still use the original frozen selection after import.
  assert.deepEqual(
    loadDailyPublicationSelection(f.root, advanced.publication_handoff.path, {
      vault: f.ctx.vault,
    }).approvedRuns,
    ["writer"],
  )
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

test("curation retains every selected reasoning wait when ranked events share one plan", async (t) => {
  const f = setup(t)
  f.ctx.policy = path.join(f.ctx.repo, "data/research-model-policy-codex.json")
  const second = { ...f.deferred, action: "write" }
  const p = await pool(
    f,
    "codex-ranked-waits",
    [await plan(f, "codex-ranked-plan", [f.event, second])],
    2,
  )
  await review(
    f,
    p,
    p.value.candidates.map((c) => rating(f, c, c.group_id === f.event.group_id ? 4 : 5)),
  )
  const chosen = await choose(f, p)
  const result = await advanceCuration(f.ctx, {
    run_id: "codex-ranked-wait",
    selection_path: chosen.path,
    selection_sha256: chosen.sha256,
    execute: true,
    max_items: 2,
    max_model_calls: 2,
  })
  assert.equal(result.rows.length, 2)
  assert.deepEqual(
    result.rows.map((r) => r.status),
    ["waiting_for_reasoning", "waiting_for_reasoning"],
  )
  assert.equal(result.reasoning_tasks.length, 2)
  assert.deepEqual(
    new Set(result.reasoning_tasks.map((r) => r.group_id)),
    new Set([f.event.group_id, second.group_id]),
  )
  assert.equal(result.candidate_published, false)
  // The last ranked focus can finish before the end of the plan array. Its
  // partial progress must overlay, rather than replace, the full saved frontier.
  const replay = await advanceEventWorkflow(f.ctx, {
    run_id: result.workflows[0].run_id,
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
    plan_path: result.workflows[0].plan.path,
    plan_sha256: result.workflows[0].plan.sha256,
    curation_path: chosen.path,
    curation_sha256: chosen.sha256,
    curation_focus_group: f.event.group_id,
    execute: true,
    require_completeness: true,
    max_items: 1,
  })
  assert.equal(replay.reasoning_tasks.length, 2)
})

test("a round drives selected events from multiple plans and exposes every owned review boundary", async (t) => {
  const f = setup(t)
  f.ctx.policy = path.join(f.ctx.repo, "data/research-model-policy-codex.json")
  const first = await plan(f, "round-multi-a", [f.event])
  const second = await plan(f, "round-multi-b", [{ ...f.deferred, action: "write" }])
  const p = await pool(f, "round-multi-selection", [first, second], 2)
  await review(
    f,
    p,
    p.value.candidates.map((candidate) => rating(f, candidate, 5)),
  )
  const chosen = await choose(f, p)
  const parameters = {
    run_id: "round-multi-owned",
    round: true,
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
    plan_path: first.path,
    plan_sha256: first.sha256,
    curation_path: chosen.path,
    curation_sha256: chosen.sha256,
    execute: true,
    max_items: 2,
    max_model_calls: 2,
  }
  const job = await submitModuleJob(f.ctx, "edition", "advance", parameters, {
    jobId: "module-round-multi-owned",
    background: false,
  })
  assert.equal(job.state, "completed")
  const result = readJSON(f.root, job.result.path).data
  assert.equal(result.status, "waiting_for_reasoning")
  assert.ok(result.event_workflow.path.startsWith("curation/runs/"))
  const requests = result.next_inputs.filter((row) => row.stage === "reasoning")
  assert.equal(requests.length, 2)
  assert.ok(requests.every((row) => row.candidate_id && row.reasoning_task))
  for (const row of requests) {
    const task = readReasoningTask(f.root, row.reasoning_task)
    assert.equal(task.status, "reasoning_pending")
    assert.equal(task.owner.job_id, job.job_id)
    assert.equal(task.owner.input_sha256, job.input_sha256)
  }
  assert.equal(result.canonical_writes, 0)
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
    ["prepare", "evaluate", "select", "status", "feedback", "advance"],
  )
  assert.equal(catalog.modules[0].operations.find((op) => op.id === "status").readOnly, true)
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

// Real native note approval against the fixture's exact reviewed source facts.
// These notes remain private; this helper never applies or publishes them.
async function approvedPublicationNotes(f, run) {
  const claims = readJSON(f.root, "runs/writer/reviewed-claims.json").claims
  const documents = readJSON(f.root, "runs/writer/documents.json")
  const edition = "Editions/2026/10/2026-10-12_0800_Tech_AI_Briefing"
  const signal = "Signals/2026-10-12_0800_Tech_AI_Briefing.md"
  const topic = "TrendTopics/fixture-contract.md"
  const source = documents.find(
    (doc) => doc.source_version_id === claims[0].evidence[0].source_version_id,
  )
  const article = loadCurrentApproval(f.root, "writer", { vault: f.ctx.vault }).article
  // The final approved event can differ from the source URL's fallback identity.
  // Keep this fixture on the same strict article binding as production Signals.
  assert.notEqual(article.event_id, sha256(canonicalURL(source.original_url)).slice(0, 16))
  const notes = [
    {
      path: signal,
      content: noteText(
        {
          schema_version: "tech-signals/v1",
          type: "trend-observations",
          edition,
          date: "2026-10-12",
          reviewed: "2026-10-12",
          review_basis: "primary-research",
          observations: [
            {
              id: "fixture-contract",
              topic_id: "fixture-contract",
              event_id: article.event_id,
              event_date: article.article_review.published_at,
              stance: "context",
              change: "Fixture Robotics와 Partner가 Contract-123 주문을 발표했다.",
              meaning: "계약 발표 이력에 연결한다.",
              limit: "공개된 계약 발표 범위다.",
              next_check: "후속 계약 공개를 확인한다.",
            },
          ],
        },
        `[[${edition}|회차]]\n`,
      ),
    },
    {
      path: topic,
      content: noteText(
        {
          schema_version: "tech-trend/v1",
          type: "trend-topic-source",
          id: "fixture-contract",
          title: "계약 발표 이력",
          question: "어떤 계약이 발표됐는가?",
          thesis: "원문은 Contract-123 주문을 발표했다.",
          watch_for: "후속 계약 발표",
          disconfirming: "원문의 계약 정정",
          reviewed: "2026-10-12",
          reader_format: "source-events/v1",
          knowledge_notes: [],
          lessons: [],
        },
        `[원문](${source.original_url})\n`,
      ),
    },
  ]
  await approveNoteReview(
    f.root,
    run,
    {
      schema: "knowledge-note-review/v2",
      reviewer: "test-original-and-trend-reader",
      reviewed_at: "2026-10-12",
      reason: "Read the exact original, verified facts and full signal/topic notes",
      source_read: true,
      final_prose_read: true,
      aliases_checked: true,
      connections_checked: true,
      histories_checked: true,
      notes: notes.map((note) => ({
        ...note,
        operation: "create",
        previous_sha256: null,
        evidence: [{ run_id: "writer", claim_ids: [claims[0].claim_id] }],
      })),
    },
    { vault: f.ctx.vault },
  )
  return { run, signal, topic }
}

test("explicit native signal approvals survive event handoff and delivery with exact approval hashes", async (t) => {
  const f = await deliveryFixture(t)
  f.ctx.vault = path.join(f.root, "notes-vault")
  fs.mkdirSync(f.ctx.vault, { recursive: true })
  const notes = await approvedPublicationNotes(f, "explicit-trend-notes")
  const calls = f.provider.calls
  const result = await advanceEventWorkflow(
    f.ctx,
    {
      run_id: "event-with-trends",
      edition_path: f.editionRef.path,
      edition_sha256: f.editionRef.sha256,
      plan_path: f.plan.path,
      plan_sha256: f.plan.sha256,
      execute: false,
      note_review_runs: [notes.run],
    },
    { baseProvider: f.provider },
  )
  const selection = loadDailyPublicationSelection(f.root, result.publication_handoff.path, {
    vault: f.ctx.vault,
  })
  assert.deepEqual(selection.approvedRuns, ["writer"])
  assert.deepEqual(selection.knowledgeRuns, [notes.run])
  const saved = readJSON(f.root, result.publication_handoff.path)
  assert.equal(
    saved.note_review_runs[0].files.approval_sha256,
    sha256(fs.readFileSync(safePath(f.root, `runs/${notes.run}/approved-notes.json`))),
  )
  const preview = loadPreviewPublicationInputs(f.root, "notes-reader", [], {
    vault: f.ctx.vault,
    publicationHandoff: result.publication_handoff.path,
  })
  assert.deepEqual(preview.knowledgeRuns, [notes.run])
  assert.deepEqual(
    preview.knowledge[0].approval.notes.map((note) => note.path),
    [notes.signal, notes.topic],
  )
  const parameters = {
    run_id: "notes-delivery",
    handoff_path: result.publication_handoff.path,
    handoff_sha256: result.publication_handoff.sha256,
  }
  await requestPublicationDelivery(f.ctx, parameters)
  assert.deepEqual(
    readJSON(f.root, "runs/notes-delivery/publication-delivery/input.json").knowledge_runs,
    [notes.run],
  )
  assert.equal(f.provider.calls, calls)
  assert.equal(fs.existsSync(path.join(f.ctx.vault, notes.signal)), false)
  const file = safePath(f.root, `runs/${notes.run}/approved-notes.json`)
  const before = fs.readFileSync(file)
  fs.writeFileSync(file, Buffer.concat([before, Buffer.from("\n")]))
  assert.throws(
    () =>
      loadDailyPublicationSelection(f.root, result.publication_handoff.path, {
        vault: f.ctx.vault,
      }),
    /approval files changed/,
  )
  await assert.rejects(
    requestPublicationDelivery(f.ctx, { ...parameters, run_id: "tampered-notes-delivery" }),
    /approval files changed/,
  )
  assert.equal(fs.existsSync(path.join(f.root, "runs/tampered-notes-delivery")), false)
  fs.writeFileSync(file, before)
})

test("curated native child handoffs retain explicit Signals and topic approval unions without rewriting articles", async (t) => {
  const f = await deliveryFixture(t)
  f.ctx.vault = path.join(f.root, "curated-notes-vault")
  fs.mkdirSync(f.ctx.vault, { recursive: true })
  f.ctx.backlog = path.join(f.root, "candidate-backlog.json")
  atomicWrite(f.root, "candidate-backlog.json", {
    schema: "research-candidates/v1",
    candidates: [],
  })
  const notes = await approvedPublicationNotes(f, "curated-trend-notes")
  const p = await pool(f, "curated-notes", [f.plan], 1)
  const candidate = p.value.candidates.find((row) => row.group_id === "order")
  await review(f, p, [rating(f, candidate, 5)])
  const selected = await choose(f, p)
  const parameters = {
    run_id: "curated-notes-workflow",
    selection_path: selected.path,
    selection_sha256: selected.sha256,
    execute: false,
    note_review_runs: [notes.run],
  }
  const calls = f.provider.calls
  const result = await executeModule(f.ctx, "curation", "advance", parameters)
  assert.equal(result.status, "complete")
  assert.equal(result.model_calls, 0)
  assert.equal(result.article_writes, 0)
  const nativeInput = readJSON(f.root, `event-workflows/${result.workflows[0].run_id}/input.json`)
  assert.equal(nativeInput.note_review_runs[0].run, notes.run)
  const child = loadDailyPublicationSelection(
    f.root,
    result.workflows[0].publication_handoff.path,
    { vault: f.ctx.vault },
  )
  const combined = loadDailyPublicationSelection(f.root, result.publication_handoff.path, {
    vault: f.ctx.vault,
  })
  assert.deepEqual(child.knowledgeRuns, [notes.run])
  assert.deepEqual(combined.knowledgeRuns, [...new Set(child.knowledgeRuns)])
  assert.deepEqual(combined.approvedRuns, ["writer"])
  const preview = loadPreviewPublicationInputs(f.root, "curated-notes-reader", [], {
    vault: f.ctx.vault,
    publicationHandoff: result.publication_handoff.path,
    editionSpec: {
      schema: "research-private-edition/v1",
      intent: "private_slice",
      key: "2026-10-12_0800_Tech_AI_Briefing",
      date: "2026-10-12",
      coverage_start: "2026-10-10T15:00:00Z",
      coverage_end: "2026-10-11T15:00:00Z",
    },
  })
  assert.deepEqual(
    preview.knowledge[0].approval.notes.map((note) => note.path),
    [notes.signal, notes.topic],
  )
  assert.equal(f.provider.calls, calls)
  const file = safePath(f.root, `runs/${notes.run}/note-review.json`)
  fs.appendFileSync(file, "\n")
  assert.throws(
    () =>
      loadDailyPublicationSelection(f.root, result.publication_handoff.path, {
        vault: f.ctx.vault,
      }),
    /approval files changed/,
  )
})
