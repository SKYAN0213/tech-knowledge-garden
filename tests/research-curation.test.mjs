import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { editionFixture } from "./fixtures/research-event-fixtures.mjs"
import { approveDeliveryFixture, deliveryFixture } from "./fixtures/publication-delivery.mjs"
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
import { recoverCurationCheckpoint } from "../scripts/research/curation-checkpoint-recovery.mjs"
import { assertNoOperationalWriter } from "../scripts/research/operations-deployment.mjs"
import { withRequestOwner } from "../scripts/research/request-ownership.mjs"
import {
  loadDailyPublicationSelection,
  prepareEventPublicationHandoff,
  reviseCuratedPublicationHandoff,
} from "../scripts/research/daily-publication-handoff.mjs"
import {
  loadCurrentApproval,
  newEditionProjections,
  loadPreviewPublicationInputs,
  previewEditionProjections,
} from "../scripts/research/preview.mjs"
import { advanceEventWorkflow } from "../scripts/research/event-workflow.mjs"
import { approveNoteReview } from "../scripts/research/note-review.mjs"
import { requestPublicationDelivery } from "../scripts/research/authoring-delivery-request.mjs"
import { reviewEditionEvents } from "../scripts/research/event-pipeline.mjs"
import { executeModule, moduleCatalog } from "../scripts/research/module-registry.mjs"
import { moduleCLI } from "../scripts/research/module-cli.mjs"
import { submitModuleJob } from "../scripts/research/module-runtime.mjs"
import {
  readReasoningTask,
  createReasoningTask,
  submitReasoningResult,
} from "../scripts/research/reasoning-tasks.mjs"
import { atomicWrite, readJSON, safePath } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { assertUnwrittenApprovedHandoff } from "../scripts/research/operations-continuation.mjs"
import { noteText, parseNote, canonicalURL } from "../scripts/garden.mjs"
import { withVerifiedInputSession, assertVerifiedInputBoundary } from "../scripts/research/verified-inputs.mjs"

function setup(t, options) {
  const f = editionFixture(t, options)
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

test("curation reuses a native approval with unused selected sources and a timestamped primary", async (t) => {
  const f = await deliveryFixture(t, {
    primaryPublishedAt: "2026-09-27T03:29:09-07:00",
    usedSourceIndices: [0, 1],
  })
  f.ctx.vault = path.join(f.root, "vault")
  f.ctx.backlog = path.join(f.root, "candidate-backlog.json")
  fs.mkdirSync(f.ctx.vault, { recursive: true })
  atomicWrite(f.root, "candidate-backlog.json", {
    schema: "research-candidates/v1",
    candidates: [],
  })
  const approved = loadCurrentApproval(f.root, "writer", { vault: f.ctx.vault }).article
  assert.deepEqual(
    approved.source_urls.map(canonicalURL).sort(),
    f.sources
      .slice(0, 2)
      .map((source) => canonicalURL(source.document.original_url))
      .sort(),
  )
  assert.equal(approved.article_review.published_at, "2026-09-27")
  const original = f.review.events.find((event) => event.action === "write")
  const deferred = { ...original, group_id: "subset-source-deferred", action: "defer" }
  const planned = await plan(f, "subset-source-promotion", [deferred])
  const p = await pool(f, "subset-source-pool", [planned], 1)
  await review(f, p, [rating(f, p.value.candidates[0], 5)])
  const chosen = loadCurationSelection(f.ctx, ref(await choose(f, p)))
  assert.deepEqual(chosen.selected[0].execution, { plan: ref(f.plan), group_id: original.group_id })
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

test("an explicitly reviewed same-event pair is selected once without altering scores or source evidence", async (t) => {
  const f = setup(t)
  const variant = { ...structuredClone(f.event), group_id: "same-event-other-wording",
    identity: { ...f.event.identity, object: "Contract 123 order" } }
  const first = await plan(f, "pair-first", [f.event])
  const second = await plan(f, "pair-second", [variant])
  const unreviewed = await pool(f, "pair-unreviewed", [first, second])
  assert.notEqual(unreviewed.value.candidates[0].identity_key, unreviewed.value.candidates[1].identity_key)
  await review(f, unreviewed, unreviewed.value.candidates.map((c, i) => rating(f, c, i ? 5 : 4)))
  assert.equal(loadCurationSelection(f.ctx, ref(await choose(f, unreviewed))).selected.length, 2)
  const p = await pool(f, "pair-reviewed", [first, second])
  const [preferred, alternate] = p.value.candidates
  const evidence = [preferred, alternate].map((candidate) => {
    const source = curationCandidatePacket(f.ctx, candidate).sources[0], block = source.blocks[0]
    return { candidate_id: candidate.candidate_id, material_id: source.material_id,
      block_id: block.block_id, quote: block.text }
  })
  const reviewFile = "pair-identity-review.json"
  const identityReview = { schema: "research-curation-identity-review/v1", pool_sha256: p.sha256,
    reviewer: "test-source-comparison", reviewed_at: new Date().toISOString(), pairs: [{
      candidate_ids: [preferred.candidate_id, alternate.candidate_id],
      preferred_candidate_id: preferred.candidate_id, verdict: "same_event",
      reason: "Both original passages describe the same Contract-123 announcement; preserve the fuller source scope.",
      evidence,
    }] }
  atomicWrite(f.root, reviewFile, identityReview)
  const args = { pool_path: p.path, pool_sha256: p.sha256,
    identity_review_file: path.relative(f.ctx.repo, path.join(f.root, reviewFile)) }
  for (const [changed, expected] of [
    [{ ...identityReview, pool_sha256: "0".repeat(64) }, /another pool/],
    [{ ...identityReview, pairs: [{ ...identityReview.pairs[0], verdict: "different_event" }] }, /schema|const|verdict/i],
    [{ ...identityReview, pairs: [{ ...identityReview.pairs[0], evidence: [evidence[0]] }] }, /schema|evidence|minItems/i],
    [{ ...identityReview, pairs: [{ ...identityReview.pairs[0], evidence: [evidence[0], { ...evidence[1], quote: "not in the original" }] }] }, /exact original block/],
    [{ ...identityReview, pairs: [identityReview.pairs[0], identityReview.pairs[0]] }, /distinct reviewed identity/i],
  ]) {
    atomicWrite(f.root, reviewFile, changed)
    await assert.rejects(selectCuration(f.ctx, args), expected)
  }
  atomicWrite(f.root, reviewFile, identityReview)
  const selectedRef = await selectCuration(f.ctx, args)
  const selected = loadCurationSelection(f.ctx, ref(selectedRef))
  assert.deepEqual(selected.selected.map((x) => x.candidate_id), [preferred.candidate_id])
  assert.equal(selected.selected[0].score, 80)
  assert.ok(selected.held.some((x) => x.candidate_id === alternate.candidate_id &&
    x.reason === "reviewed_same_event" && x.score === 100))
  assert.equal(selected.composition.importance_scores_changed, false)
  assert.equal(selected.candidate_published, false)
  assert.ok(selected.identity_review?.sha256)
  assert.equal((await selectCuration(f.ctx, args)).reused, true)
  atomicWrite(f.root, selected.identity_review.path, { ...identityReview, reviewer: "tampered" })
  assert.throws(() => loadCurationSelection(f.ctx, ref(selectedRef)), /hash|changed|digest/i)
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

test("an explicit history receipt reuses a frozen pool only when the backlog change affects no candidate", async (t) => {
  const f = setup(t),
    p = await pool(f, "history-revalidation", [await plan(f, "history-revalidation-plan", [f.event])])
  await review(f, p, [rating(f, p.value.candidates[0])])
  const chosen = ref(await choose(f, p)),
    selectionBefore = fs.readFileSync(safePath(f.root, chosen.path)),
    poolBefore = fs.readFileSync(safePath(f.root, p.path))
  atomicWrite(f.root, "candidate-backlog.json", {
    schema: "research-candidates/v1",
    candidates: [],
    changed: true,
  })
  assert.throws(() => loadCurationSelection(f.ctx, chosen), /history changed/)
  const preview = await executeModule(f.ctx, "curation", "revalidate_history", { pool_path: p.path, pool_sha256: p.sha256 })
  assert.equal(preview.status, "revalidation_ready")
  assert.throws(() => loadCurationSelection(f.ctx, chosen), /history changed/)
  const receipt = await executeModule(f.ctx, "curation", "revalidate_history", { pool_path: p.path, pool_sha256: p.sha256, apply: true })
  assert.equal(receipt.status, "revalidated")
  assert.equal(receipt.changed_candidates, 0)
  assert.equal(receipt.candidate_approved, false)
  assert.equal(loadCurationSelection(f.ctx, chosen).selected.length, 1)
  const repeated = await executeModule(f.ctx, "curation", "revalidate_history", { pool_path: p.path, pool_sha256: p.sha256, apply: true })
  assert.deepEqual(ref(repeated), ref(receipt))
  assert.deepEqual(fs.readFileSync(safePath(f.root, chosen.path)), selectionBefore)
  assert.deepEqual(fs.readFileSync(safePath(f.root, p.path)), poolBefore)

  const parsedPath = safePath(f.root, `parses/${p.value.candidates[0].sources[0].parse_id}/parse.json`)
  const parsedBefore = fs.readFileSync(parsedPath)
  const tampered = JSON.parse(parsedBefore)
  tampered.blocks[0].text += " altered after revalidation"
  fs.writeFileSync(parsedPath, JSON.stringify(tampered))
  assert.throws(() => loadCurationSelection(f.ctx, chosen), /SHA|changed/)
  fs.writeFileSync(parsedPath, parsedBefore)
  assert.equal(loadCurationSelection(f.ctx, chosen).selected.length, 1)

  const news = path.join(f.ctx.vault, "News")
  fs.mkdirSync(news, { recursive: true })
  const changedHistory = path.join(news, "new-after-revalidation.md")
  fs.writeFileSync(changedHistory, noteText({ type: "news", event_id: "2222222222222222", title: "Later event", date: "2026-10-13", review_status: "verified" }, "Later evidence."))
  assert.throws(() => loadCurationSelection(f.ctx, chosen), /history changed/)
  fs.unlinkSync(changedHistory)
  assert.equal(loadCurationSelection(f.ctx, chosen).selected.length, 1)

  atomicWrite(f.root, "candidate-backlog.json", { schema: "research-candidates/v1", candidates: [], changed: "again" })
  assert.throws(() => loadCurationSelection(f.ctx, chosen), /history changed/)
  const latest = await executeModule(f.ctx, "curation", "revalidate_history", { pool_path: p.path, pool_sha256: p.sha256, apply: true })
  assert.notEqual(latest.path, receipt.path)
  assert.equal(loadCurationSelection(f.ctx, chosen).selected.length, 1)
  const saved = readJSON(f.root, latest.path)
  atomicWrite(f.root, latest.path, { ...saved, changed_candidates: 1 })
  assert.throws(() => loadCurationSelection(f.ctx, chosen), /history|revalidation/i)
})

test("history revalidation rejects an impacted candidate and never bypasses new publication evidence", async (t) => {
  const { revalidateCurationHistory } = await import("../scripts/research/curation.mjs")
  const f = setup(t),
    news = path.join(f.ctx.vault, "News")
  fs.mkdirSync(news, { recursive: true })
  fs.writeFileSync(
    path.join(news, "unrelated.md"),
    noteText({ type: "news", event_id: "1111111111111111", title: "Earlier event", date: "2026-09-01", review_status: "verified", sources: ["https://example.invalid/unrelated"] }, "Previously published."),
  )
  const p = await pool(f, "history-impacted", [await plan(f, "history-impacted-plan", [f.event])])
  assert.equal(p.value.candidates[0].already_featured, false)
  await review(f, p, [rating(f, p.value.candidates[0])])
  const chosen = ref(await choose(f, p))
  atomicWrite(f.root, "candidate-backlog.json", {
    schema: "research-candidates/v1",
    candidates: [{ key: "different-key", event_id: "1111111111111111", source_urls: [p.value.candidates[0].sources[0].url] }],
  })
  await assert.rejects(
    revalidateCurationHistory(f.ctx, { pool_path: p.path, pool_sha256: p.sha256, apply: true }),
    /candidate.*changed|history.*affect/i,
  )
  assert.throws(() => loadCurationSelection(f.ctx, chosen), /history changed/)
  fs.writeFileSync(path.join(news, "new.md"), noteText({ type: "news", event_id: "2222222222222222", title: "New event", date: "2026-10-13", review_status: "verified" }, "New evidence."))
  await assert.rejects(
    revalidateCurationHistory(f.ctx, { pool_path: p.path, pool_sha256: p.sha256, apply: true }),
    /published.*history.*changed/i,
  )
})

test("verified selection notices backlog and nested publication changes before committing", async (t) => {
  const f = setup(t),
    p = await pool(f, "tracked-history", [await plan(f, "tracked-history-plan", [f.event])])
  await review(f, p, [rating(f, p.value.candidates[0])])
  const chosen = ref(await choose(f, p)),
    backlogBefore = fs.readFileSync(f.ctx.backlog),
    nested = path.join(f.ctx.vault, "News", "nested"),
    editions = path.join(f.ctx.vault, "Editions", "2026", "10")
  fs.mkdirSync(nested, { recursive: true })
  fs.mkdirSync(editions, { recursive: true })
  await withVerifiedInputSession(f.ctx, () => {
    assert.equal(loadCurationSelection(f.ctx, chosen).selected.length, 1)
    fs.writeFileSync(f.ctx.backlog, JSON.stringify({ schema: "research-candidates/v1", candidates: [], changed: true }))
    assert.throws(() => assertVerifiedInputBoundary(), /changed before commit/)
    fs.writeFileSync(f.ctx.backlog, backlogBefore)
    const added = path.join(nested, "added.md")
    fs.writeFileSync(added, noteText({ type: "news", event_id: "2222222222222222", title: "New event", date: "2026-10-13", review_status: "verified" }, "New evidence."))
    assert.throws(() => assertVerifiedInputBoundary(), /changed before commit/)
    fs.unlinkSync(added)
    const edition = path.join(editions, "new.md")
    fs.writeFileSync(edition, "---\ndate: 2026-10-13\n---\nNew edition.\n")
    assert.throws(() => assertVerifiedInputBoundary(), /changed before commit/)
    fs.unlinkSync(edition)
    return {}
  })
})

test("history revalidation refuses an active independent writer", async (t) => {
  const f = setup(t),
    p = await pool(f, "history-writer", [await plan(f, "history-writer-plan", [f.event])])
  atomicWrite(f.root, "candidate-backlog.json", { schema: "research-candidates/v1", candidates: [], changed: true })
  atomicWrite(f.root, "module-jobs/module-other/state.json", { state: "running", pid: process.pid })
  await assert.rejects(
    executeModule(f.ctx, "curation", "revalidate_history", { pool_path: p.path, pool_sha256: p.sha256, apply: true }),
    /Active workspace writer/,
  )
  assert.throws(() => loadCurationPool(f.ctx, ref(p), { candidateIds: [] }), /history changed/)
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

async function staleCheckpointFixture(t) {
  const f = setup(t)
  const p = await pool(f, "recovery-pool", [await plan(f, "recovery-plan", [f.event])], 1)
  await review(f, p, [rating(f, p.value.candidates[0], 5)])
  const chosen = await choose(f, p)
  const parameters = {
    run_id: "recovery-workflow",
    selection_path: chosen.path,
    selection_sha256: chosen.sha256,
    execute: true,
  }
  const provider = modelForFixture()
  const first = await advanceCuration(f.ctx, parameters, { baseProvider: provider })
  const parentPath = path.dirname(chosen.path) + "/workflows/" + parameters.run_id + "/latest.json"
  const child = first.workflows[0]
  const original = readJSON(f.root, child.workflow.path)
  const inputPath = `event-workflows/${child.run_id}/input.json`
  const inputBytes = fs.readFileSync(safePath(f.root, inputPath))
  const parentBytes = fs.readFileSync(safePath(f.root, parentPath))
  atomicWrite(f.root, child.workflow.path, {
    ...original,
    failures: [],
    status: "review_pending",
    rows: original.rows.map((r) =>
      r.group_id === f.event.group_id
        ? { ...r, status: "failed", error: "legacy checkpoint failure", code: "LEGACY_TEST" }
        : r,
    ),
  })
  const observed = sha256(fs.readFileSync(safePath(f.root, child.workflow.path)))
  return {
    ...f,
    parameters,
    provider,
    parentPath,
    parentBytes,
    child,
    inputPath,
    inputBytes,
    recovery: {
      run_id: parameters.run_id,
      selection_path: chosen.path,
      selection_sha256: chosen.sha256,
      expected_parent_sha256: sha256(parentBytes),
      reason: "Authenticated legacy checkpoint unit repair",
    },
    observed,
  }
}

test("legacy checkpoint recovery authenticates predecessor and resumes native work without repeated model calls", async (t) => {
  const f = await staleCheckpointFixture(t)
  const preview = await recoverCurationCheckpoint(f.ctx, f.recovery)
  assert.equal(preview.status, "recovery_review_ready")
  assert.deepEqual(fs.readFileSync(safePath(f.root, f.parentPath)), f.parentBytes)
  assert.deepEqual(preview.next_input.expected_children, { [f.child.run_id]: f.observed })
  const repaired = await recoverCurationCheckpoint(f.ctx, preview.next_input)
  assert.equal(repaired.status, "reconciled")
  const parent = readJSON(f.root, f.parentPath)
  const child = readJSON(f.root, f.child.workflow.path)
  assert.equal(child.failures[0].code, "LEGACY_TEST")
  assert.equal(
    parent.workflows[0].workflow.sha256,
    sha256(fs.readFileSync(safePath(f.root, f.child.workflow.path))),
  )
  assert.deepEqual(fs.readFileSync(safePath(f.root, f.inputPath)), f.inputBytes)
  assert.deepEqual(
    (await recoverCurationCheckpoint(f.ctx, preview.next_input)).receipt,
    repaired.receipt,
  )
  const calls = f.provider.calls
  const resumed = await advanceCuration(f.ctx, repaired.next_actions[0].parameters, {
    baseProvider: f.provider,
  })
  assert.equal(f.provider.calls, calls)
  assert.equal(resumed.rows.find((r) => r.group_id === f.event.group_id).status, "fact_review")
  const historical = await recoverCurationCheckpoint(f.ctx, preview.next_input)
  assert.equal(historical.progress_changed_since_recovery, true)
  assert.deepEqual(historical.next_actions, [])
})

test("legacy checkpoint recovery rejects unconfirmed SHA and corrupted predecessor without mutation", async (t) => {
  const f = await staleCheckpointFixture(t)
  await assert.rejects(
    recoverCurationCheckpoint(f.ctx, {
      ...f.recovery,
      expected_parent_sha256: "0".repeat(64),
    }),
    /parent SHA changed/,
  )
  await assert.rejects(
    recoverCurationCheckpoint(f.ctx, {
      ...f.recovery,
      apply: true,
      expected_children: { [f.child.run_id]: "0".repeat(64) },
    }),
    /explicitly confirmed/,
  )
  const publication = readJSON(f.root, f.child.publication_handoff.path)
  atomicWrite(f.root, publication.workflow.snapshot.path, { changed: true })
  await assert.rejects(recoverCurationCheckpoint(f.ctx, f.recovery), /Recovery evidence changed/)
  assert.deepEqual(fs.readFileSync(safePath(f.root, f.parentPath)), f.parentBytes)
  assert.equal(sha256(fs.readFileSync(safePath(f.root, f.child.workflow.path))), f.observed)
})

test("checkpoint recovery permits only its exact live owner and still blocks a second or unknown writer", async (t) => {
  const f = setup(t),
    job_id = "module-recovery-self",
    input = { job_id, unit: true }
  const input_sha256 = sha256(JSON.stringify(input))
  atomicWrite(f.root, `module-jobs/${job_id}/input.json`, input)
  atomicWrite(f.root, `module-jobs/${job_id}/state.json`, {
    state: "running",
    pid: process.pid,
    input_sha256,
  })
  const owner = { job_id, input_sha256 }
  const check = () =>
    assertNoOperationalWriter(f.ctx.repo, { researchRoot: f.root, ownedRequest: owner })
  assert.throws(
    () => assertNoOperationalWriter(f.ctx.repo, { researchRoot: f.root }),
    /Active workspace writer/,
  )
  await withRequestOwner(owner, async () => {
    check()
    atomicWrite(f.root, "module-jobs/module-other/state.json", {
      state: "running",
      pid: process.pid,
    })
    assert.throws(check, /Active workspace writer/)
    atomicWrite(f.root, "module-jobs/module-other/state.json", { state: "queued" })
    assert.throws(check, /Unknown workspace writer/)
  })
})

test("legacy checkpoint recovery resumes after parent commit when the final receipt write is lost", async (t) => {
  const f = await staleCheckpointFixture(t)
  const preview = await recoverCurationCheckpoint(f.ctx, f.recovery)
  const originalOpen = fs.openSync
  let injected = false
  fs.openSync = function (file, ...args) {
    if (
      !injected &&
      String(file).includes("checkpoint-recoveries/") &&
      /receipt\.json\./.test(String(file))
    ) {
      injected = true
      throw Error("Injected lost recovery receipt")
    }
    return originalOpen.call(this, file, ...args)
  }
  try {
    await assert.rejects(
      recoverCurationCheckpoint(f.ctx, preview.next_input),
      /Injected lost recovery receipt/,
    )
  } finally {
    fs.openSync = originalOpen
  }
  assert.equal(injected, true)
  const committed = fs.readFileSync(safePath(f.root, f.parentPath))
  assert.notEqual(sha256(committed), f.recovery.expected_parent_sha256)
  const recovered = await recoverCurationCheckpoint(f.ctx, preview.next_input)
  assert.equal(recovered.status, "reconciled")
  assert.deepEqual(fs.readFileSync(safePath(f.root, f.parentPath)), committed)
  assert.deepEqual(fs.readFileSync(safePath(f.root, f.inputPath)), f.inputBytes)
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
  const checkpointPath = result.workflows[0].workflow.path
  assert.deepEqual(
    readJSON(f.root, checkpointPath.replace(/latest\.json$/, "progress.json")).rows,
    readJSON(f.root, checkpointPath).rows,
    "a settled focus flushes the complete frontier before another focus can overlay progress",
  )
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

test("a corrected article retains its slot between requests while three other results cannot displace it", async (t) => {
  const f = setup(t, { independent: true })
  const events = f.sources.map((source, i) => ({
    ...f.event,
    group_id: "slot-event-" + i,
    identity: {
      ...f.event.identity,
      who: "Fixture Robotics " + i,
      object: "Contract-" + (123 + i),
      external_id: "Contract-" + (123 + i),
    },
    materials: [
      {
        material_id: f.report.materials.find(
          (m) => m.source_version_id === source.document.source_version_id,
        ).id,
        role: "primary",
        block_ids: [source.parsed.blocks[0].block_id],
        evidence: ["identity_marker", "event_action"].map((aspect) => ({
          aspect,
          block_id: source.parsed.blocks[0].block_id,
          quote: source.parsed.blocks[0].text,
        })),
      },
    ],
  }))
  const prepared = await pool(f, "reserved-slots", [await plan(f, "reserved-slot-plan", events)], 4)
  await review(
    f,
    prepared,
    prepared.value.candidates.map((c) => rating(f, c, 5)),
  )
  const chosen = await choose(f, prepared)
  const selection = loadCurationSelection(f.ctx, ref(chosen))
  assert.equal(selection.selected.length, 4)
  const rows = events.map((e) => ({ group_id: e.group_id, action: "write", status: "queued" }))
  const visits = new Map()
  const dependencies = {
    eventProcessor: async (_ctx, p) => {
      const row = rows.find((r) => r.group_id === p.curation_focus_group)
      const visit = (visits.get(row.group_id) || 0) + 1
      visits.set(row.group_id, visit)
      row.writer_run = "slot-writer-" + row.group_id
      if (visit === 2) {
        row.status = "editorial_review"
        row.correction_applied = true
        delete row.reasoning_task
      } else {
        const request = createReasoningTask(f.root, {
          run: row.writer_run + "-" + visit,
          role: "article_write",
          binding: { settings: { model: "gpt-6-luna" } },
          input: {
            schema: {
              type: "object",
              required: ["answer"],
              properties: { answer: { type: "string" } },
            },
          },
        })
        row.status = "waiting_for_reasoning"
        row.reasoning_task = { task_id: request.task_id, request_sha256: request.request_sha256 }
      }
      const value = {
        rows: structuredClone(rows),
        status: "waiting_for_reasoning",
        approved_runs: [],
        handled_items: 1,
      }
      atomicWrite(f.root, `event-workflows/${p.run_id}/latest.json`, value)
      return value
    },
  }
  const parameters = {
    run_id: "reserved-slot-workflow",
    selection_path: chosen.path,
    selection_sha256: chosen.sha256,
    execute: true,
    review_mode: "combined/v1",
    max_items: 40,
  }
  const first = await advanceCuration(f.ctx, parameters, dependencies)
  assert.equal(first.rows.filter((r) => r.reasoning_task).length, 3)
  const winner = selection.selected[0],
    fourth = selection.selected[3]
  const request = first.rows.find((r) => r.candidate_id === winner.candidate_id).reasoning_task
  await submitReasoningResult(f.root, {
    ...request,
    executor: "codex",
    model: "gpt-6-luna",
    output: { answer: "fixture-only source comparison" },
  })
  await advanceCuration(f.ctx, parameters, dependencies)
  assert.equal(
    visits.get(fourth.execution.group_id),
    undefined,
    "the corrected article still owns its slot",
  )
  const third = await advanceCuration(f.ctx, parameters, dependencies)
  assert.equal(visits.get(winner.execution.group_id), 3)
  assert.equal(visits.get(fourth.execution.group_id), undefined)
  assert.equal(third.rows.filter((r) => r.reasoning_task).length, 3)
})

test("an article waiting for storage does not occupy another article's execution slot", async (t) => {
  const f = setup(t, { independent: true })
  const events = f.sources.map((source, i) => ({
    ...f.event,
    group_id: "held-event-" + i,
    identity: { ...f.event.identity, who: "Held Robotics " + i, object: "Held-" + i, external_id: "Held-" + i },
    materials: [{
      material_id: f.report.materials.find((m) => m.source_version_id === source.document.source_version_id).id,
      role: "primary", block_ids: [source.parsed.blocks[0].block_id],
      evidence: ["identity_marker", "event_action"].map((aspect) => ({ aspect, block_id: source.parsed.blocks[0].block_id, quote: source.parsed.blocks[0].text })),
    }],
  }))
  const prepared = await pool(f, "held-slots", [await plan(f, "held-slot-plan", events)], 4)
  await review(f, prepared, prepared.value.candidates.map((c) => rating(f, c, 5)))
  const chosen = await choose(f, prepared), selection = readJSON(f.root, chosen.path)
  const rows = events.map((event) => ({ group_id: event.group_id, action: "write", status: "queued" }))
  const visits = new Set()
  const eventProcessor = async (_ctx, p) => {
    const row = rows.find((entry) => entry.group_id === p.curation_focus_group)
    visits.add(row.group_id)
    row.writer_run = "held-writer-" + row.group_id
    const request = createReasoningTask(f.root, { run: row.writer_run, role: "article_write", binding: { settings: { model: "gpt-6-luna" } }, input: { schema: { type: "object" } } })
    row.status = "waiting_for_reasoning"
    row.reasoning_task = { task_id: request.task_id, request_sha256: request.request_sha256 }
    const value = { rows: structuredClone(rows), status: "waiting_for_reasoning", approved_runs: [], handled_items: 1 }
    atomicWrite(f.root, `event-workflows/${p.run_id}/latest.json`, value)
    return value
  }
  const parameters = { run_id: "held-workflow", selection_path: chosen.path, selection_sha256: chosen.sha256, execute: true, review_mode: "combined/v1", max_items: 40 }
  const first = await advanceCuration(f.ctx, parameters, { eventProcessor })
  const held = first.rows.find((row) => row.candidate_id === selection.selected[0].candidate_id)
  const result = await advanceCuration(f.ctx, parameters, { eventProcessor, readTask: (root, task) => {
    if (task.task_id === held.reasoning_task.task_id)
      throw Object.assign(Error("Exact stored payload required"), { code: "STORAGE_PENDING", storage_request: { path: "documents/held/body.bin" } })
    return readReasoningTask(root, task)
  } })
  assert.ok(visits.has(selection.selected[3].execution.group_id))
  const waiting = result.rows.find((row) => row.candidate_id === held.candidate_id)
  assert.equal(waiting.status, "waiting_for_storage")
  assert.equal(waiting.storage_request.path, "documents/held/body.bin")
  assert.equal(result.candidate_published, false)
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
    [
      "revalidate_history",
      "revise_handoff",
      "recover_checkpoint",
      "prepare",
      "evaluate",
      "select",
      "status",
      "feedback",
      "advance",
    ],
  )
  const recovery = catalog.modules[0].operations.find((op) => op.id === "recover_checkpoint")
  assert.equal(recovery.readOnly, false)
  assert.equal(recovery.model, false)
  assert.equal(recovery.network, false)
  assert.ok(recovery.inputSchema.required.includes("expected_parent_sha256"))
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

test("a native correction replaces only its originally selected event without reranking", async (t) => {
  const f = await deliveryFixture(t)
  f.ctx.vault = path.join(f.root, "vault")
  fs.mkdirSync(f.ctx.vault, { recursive: true })
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
  f.ctx.backlog = path.join(f.root, "candidate-backlog.json")
  atomicWrite(f.root, "candidate-backlog.json", {
    schema: "research-candidates/v1",
    candidates: [],
  })
  const p = await pool(f, "frozen-revision-pool", [f.plan], 1)
  const candidate = p.value.candidates.find((row) => row.group_id === "order")
  await review(f, p, [rating(f, candidate, 5)])
  const selected = await choose(f, p)
  const original = await advanceCuration(f.ctx, {
    run_id: "frozen-revision-original",
    selection_path: selected.path,
    selection_sha256: selected.sha256,
    execute: false,
  })
  assert.deepEqual(original.approved_runs, ["writer"])
  const previous = loadCurrentApproval(f.root, "writer", { vault: f.ctx.vault })
  const decision = structuredClone(f.review)
  decision.events = [decision.events.find((row) => row.group_id === "order")]
  const event = decision.events[0]
  event.action = "correction"
  event.prior_run = "writer"
  event.prior_matches = ["identity_marker", "event_action"].map((aspect) => ({
    aspect,
    parse_id: f.sources[0].parsed.parse_id,
    block_id: f.sources[0].parsed.blocks[0].block_id,
    quote: f.sources[0].parsed.blocks[0].text,
    primary_block_id: f.sources[0].parsed.blocks[0].block_id,
    primary_quote: f.sources[0].parsed.blocks[0].text,
    conclusion: "The same original contract and action are explicitly corrected",
  }))
  atomicWrite(f.root, "revision-plan-review.json", decision)
  const plan = await reviewEditionEvents(f.ctx, {
    ...f.parameters,
    run_id: "frozen-revision-plan",
    review_file: path.relative(f.ctx.repo, safePath(f.root, "revision-plan-review.json")),
  })
  const eventSelection = await executeModule(f.ctx, "selection", "prepare", {
    run_id: "corrected-writer",
    plan_path: plan.path,
    plan_sha256: plan.sha256,
    group_id: "order",
  })
  const oldDraft = readJSON(f.root, "runs/writer/draft.json")
  const priorIds = [
    ...new Set(
      [...oldDraft.draft.lead, ...oldDraft.draft.explanations.flatMap((e) => e.paragraphs)].flatMap(
        (row) => row.claim_ids,
      ),
    ),
  ]
  await approveDeliveryFixture(
    f,
    eventSelection.writer_run,
    {
      run_id: eventSelection.writer_run,
      selection_path: eventSelection.path,
      selection_sha256: eventSelection.sha256,
    },
    (draft) => {
      const relative = "frozen-revision-review.json"
      atomicWrite(f.root, relative, {
        schema: "research-event-revision-review/v1",
        action: "correction",
        prior_run: "writer",
        current_run: eventSelection.writer_run,
        event_id: previous.article.event_id,
        selection_sha256: eventSelection.sha256,
        prior_article_sha256: sha256(JSON.stringify(previous.article)),
        draft_id: draft.draft_id,
        reviewer: "test-independent-lineage-reader",
        reason: "The same selected event was explicitly rechecked",
        reviewed_at: "2026-09-29T02:00:00Z",
        source_read: true,
        prior_article_read: true,
        final_prose_read: true,
        identity_checked: true,
        dates_checked: true,
        numbers_checked: true,
        changes: priorIds.map((id) => ({
          prior_claim_id: id,
          disposition: "retained",
          current_claim_ids: [id],
          reason: "The original fact and conditions remain unchanged",
        })),
      })
      return path.relative(f.ctx.repo, safePath(f.root, relative))
    },
  )
  await advanceEventWorkflow(f.ctx, {
    run_id: "frozen-revision-event-workflow",
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
    plan_path: plan.path,
    plan_sha256: plan.sha256,
    execute: false,
  })
  const workflow = "event-workflows/frozen-revision-event-workflow/latest.json"
  const corrected = await prepareEventPublicationHandoff(f.ctx, {
    run_id: "frozen-revision-event-handoff",
    workflow_path: workflow,
    workflow_sha256: sha256(fs.readFileSync(safePath(f.root, workflow))),
  })
  const parameters = {
    run_id: "frozen-revision-handoff",
    handoff_path: original.publication_handoff.path,
    handoff_sha256: original.publication_handoff.sha256,
    corrections: [{ previous_run: "writer", handoff: ref(corrected.publication_handoff) }],
  }
  const revised = await executeModule(f.ctx, "curation", "revise_handoff", parameters)
  assert.deepEqual(revised.approved_runs, [eventSelection.writer_run])
  assert.deepEqual(revised.curation, ref(selected))
  assert.equal(revised.candidate_published, false)
  const loaded = loadDailyPublicationSelection(f.root, revised.publication_handoff.path, {
    vault: f.ctx.vault,
  })
  assert.deepEqual(loaded.approvedRuns, [eventSelection.writer_run])
  assert.deepEqual(loaded.curation, ref(selected))
  assert.equal(loaded.briefingDate, "2026-10-12")
  assert.ok(
    loaded.nativeSelections.some((native) =>
      native.approved_runs.some((row) => row.approved_run === eventSelection.writer_run),
    ),
    "the exact validated correction handoff must reach scheduled delivery",
  )
  assert.ok(
    loaded.nativeSelections.some((native) =>
      [...native.approved_runs, ...native.reused_runs].some((row) => row.approved_run === "writer"),
    ),
    "the original frozen handoff must remain available for lineage validation",
  )
  const previewInputs = loadPreviewPublicationInputs(f.root, "corrected-private-preview", [], {
    vault: f.ctx.vault,
    publicationHandoff: revised.publication_handoff.path,
    editionSpec: {
      schema: "research-private-edition/v1",
      intent: "private_slice",
      key: "2026-10-12_0800_Tech_AI_Briefing",
      date: "2026-10-12",
      coverage_start: "2026-10-10T15:00:00Z",
      coverage_end: "2026-10-11T15:00:00Z",
    },
  })
  assert.deepEqual(previewInputs.approvedRuns, [eventSelection.writer_run])
  assert.deepEqual(previewInputs.curation, ref(selected))
  const previewSpec = {
    schema: "research-private-edition/v1",
    intent: "private_slice",
    key: "2026-10-12_0800_Tech_AI_Briefing",
    date: "2026-10-12",
    coverage_start: "2026-10-10T15:00:00Z",
    coverage_end: "2026-10-11T15:00:00Z",
  }
  const projections = previewEditionProjections(f.ctx.vault, previewInputs, {
    editionSpec: previewSpec,
    root: f.root,
  })
  assert.deepEqual(projections[0].event_ids, [previous.article.event_id])
  assert.throws(
    () =>
      previewEditionProjections(
        f.ctx.vault,
        { ...previewInputs, dailySelection: original.publication_handoff },
        { editionSpec: previewSpec, root: f.root },
      ),
    /out-of-window/,
  )
  assert.throws(
    () =>
      previewEditionProjections(
        f.ctx.vault,
        {
          ...previewInputs,
          dailySelection: { ...previewInputs.dailySelection, sha256: "0".repeat(64) },
        },
        { editionSpec: previewSpec, root: f.root },
      ),
    /handoff.*changed/i,
  )
  assert.equal(sha256(fs.readFileSync(safePath(f.root, selected.path))), selected.sha256)
  assert.equal(
    sha256(fs.readFileSync(safePath(f.root, original.publication_handoff.path))),
    original.publication_handoff.sha256,
  )
  assert.deepEqual(
    (await reviseCuratedPublicationHandoff(f.ctx, parameters)).publication_handoff,
    revised.publication_handoff,
  )
  await assert.rejects(
    reviseCuratedPublicationHandoff(f.ctx, {
      ...parameters,
      run_id: "wrong-prior",
      corrections: [{ ...parameters.corrections[0], previous_run: "unselected" }],
    }),
    /originally selected run/,
  )
  await assert.rejects(
    reviseCuratedPublicationHandoff(f.ctx, {
      ...parameters,
      run_id: "duplicate-prior",
      corrections: [...parameters.corrections, ...parameters.corrections],
    }),
    /distinct originally selected run/,
  )
  await assert.rejects(
    reviseCuratedPublicationHandoff(f.ctx, {
      ...parameters,
      run_id: "wrong-handoff-sha",
      handoff_sha256: "a".repeat(64),
    }),
    /evidence changed/,
  )
  const correctionFile = safePath(f.root, corrected.publication_handoff.path)
  fs.appendFileSync(correctionFile, " ")
  assert.throws(
    () =>
      loadDailyPublicationSelection(f.root, revised.publication_handoff.path, {
        vault: f.ctx.vault,
      }),
    /evidence changed/,
  )
  assert.throws(
    () =>
      previewEditionProjections(f.ctx.vault, previewInputs, {
        editionSpec: previewSpec,
        root: f.root,
      }),
    /evidence changed/,
  )
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

  // The approved run ID can remain the same while its source bytes change.
  // Reusing the previous ontology in that case would retain stale file hashes.
  const claimsFile = safePath(f.root, "runs/writer/reviewed-claims.json")
  const originalClaims = fs.readFileSync(claimsFile)
  fs.appendFileSync(claimsFile, " ")
  const refreshed = await advanceCuration(f.ctx, parameters)
  assert.equal(refreshed.status, "complete")
  assert.notEqual(refreshed.ontology.sha256, resumed.ontology.sha256)
  assert.notEqual(refreshed.ontology_input_sha256, resumed.ontology_input_sha256)
  fs.writeFileSync(claimsFile, originalClaims)
  const restored = await advanceCuration(f.ctx, parameters)
  assert.equal(restored.status, "complete")
  assert.equal(restored.ontology.sha256, resumed.ontology.sha256)

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
