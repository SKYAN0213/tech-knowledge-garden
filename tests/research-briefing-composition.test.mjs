import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import {
  selectBriefingComposition,
  validateCompositionProfile,
} from "../scripts/research/briefing-composition.mjs"
import {
  readCurationInsights,
  recordCurationFeedback,
} from "../scripts/research/curation-insights.mjs"
import {
  prepareCuration,
  loadCurationPool,
  curationCandidatePacket,
  evaluateCuration,
  selectCuration,
} from "../scripts/research/curation.mjs"
import { advanceCuration } from "../scripts/research/curation-workflow.mjs"
import { deliveryFixture } from "./fixtures/publication-delivery.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON, safePath } from "../scripts/research/run-state.mjs"

const policy = {
  schema: "research-briefing-composition-policy/v1",
  version: "1",
  near_score_band: 3,
  organization_repeat_weight: 2,
  topic_repeat_weight: 1,
}
const limits = { max_articles: 2, max_per_sector: 5 }
const item = (id, score, sector = "AI") => ({
  candidate_id: id,
  score,
  priority: score >= 85 ? "high" : "normal",
  sector,
})
const candidate = (id, who) => ({ candidate_id: id, identity_key: id, identity: { who } })

test("equal-score approved reuse wins over another writer for the same event without changing scores", () => {
  const candidates = [
    { ...candidate("a", "A"), identity_key: "same-event", action: "write" },
    {
      ...candidate("z", "A"),
      identity_key: "same-event",
      action: "reuse",
      prior: { run_id: "approved" },
    },
  ]
  const selected = (scores, rows = candidates) =>
    selectBriefingComposition(
      [item("a", scores[0]), item("z", scores[1])],
      rows,
      new Map(),
      policy,
      limits,
    )
  const result = selected([80, 80])
  assert.equal(result.selected[0].candidate_id, "z")
  assert.equal(result.selected[0].score, 80)
  assert.equal(result.held[0].reason, "event_identity_collision_requires_review")
  assert.equal(result.composition.importance_scores_changed, false)
  assert.equal(selected([81, 80]).selected[0].candidate_id, "a")
  assert.equal(
    selected(
      [80, 80],
      candidates.map((c) => ({ ...c, prior: null })),
    ).selected[0].candidate_id,
    "a",
  )
})

test("briefing composition reduces same-organization repetition only inside a close importance band", () => {
  const rows = [item("a", 95), item("b", 91), item("c", 89)]
  const result = selectBriefingComposition(
    rows,
    [candidate("a", "A"), candidate("b", "A"), candidate("c", "B")],
    new Map(),
    policy,
    limits,
  )
  assert.deepEqual(
    result.selected.map((r) => r.candidate_id),
    ["a", "c"],
  )
  assert.deepEqual(
    result.selected.map((r) => r.score),
    [95, 89],
  )
  assert.equal(result.held[0].candidate_id, "b")
  assert.equal(result.held[0].reason, "article_budget")
  assert.equal(result.composition.importance_scores_changed, false)
  const largerGap = selectBriefingComposition(
    [item("a", 95), item("b", 91), item("c", 85)],
    [candidate("a", "A"), candidate("b", "A"), candidate("c", "B")],
    new Map(),
    policy,
    limits,
  )
  assert.deepEqual(
    largerGap.selected.map((r) => r.candidate_id),
    ["a", "b"],
  )
})

test("composition holds explicitly reviewed repeated information without turning shared names into same-event evidence", () => {
  const rows = [item("a", 95), item("b", 94), item("c", 93)]
  const profiles = new Map([
    [
      "a",
      {
        organizations: [],
        topics: ["contracts"],
        information_units: [{ statement: "The exact same reviewed order" }],
      },
    ],
    [
      "b",
      {
        organizations: [],
        topics: ["contracts"],
        information_units: [{ statement: "The exact same reviewed order" }],
      },
    ],
    [
      "c",
      {
        organizations: [],
        topics: ["contracts"],
        information_units: [{ statement: "An additional reviewed customer deployment" }],
      },
    ],
  ])
  const result = selectBriefingComposition(
    rows,
    rows.map((r) => candidate(r.candidate_id, "Same company")),
    profiles,
    policy,
    { ...limits, max_articles: 3 },
  )
  assert.deepEqual(
    result.selected.map((r) => r.candidate_id),
    ["a", "c"],
  )
  assert.equal(result.held[0].reason, "no_additional_reviewed_information")
  const withoutReview = selectBriefingComposition(
    rows,
    rows.map((r) => candidate(r.candidate_id, "Same company")),
    new Map(),
    policy,
    { ...limits, max_articles: 3 },
  )
  assert.equal(withoutReview.selected.length, 3)
})

test("composition evidence rejects forged quotes and organizations absent from original source", () => {
  const source = {
    material_id: "material",
    blocks: [{ block_id: "block", text: "A announced a reviewed customer order." }],
  }
  const evidence = { material_id: "material", block_id: "block", quote: source.blocks[0].text }
  const profile = {
    organizations: [{ name: "A", evidence }],
    topics: ["orders"],
    information_units: [{ statement: "A customer order was announced", evidence }],
  }
  assert.doesNotThrow(() => validateCompositionProfile(profile, [source]))
  assert.throws(
    () =>
      validateCompositionProfile(
        { ...profile, organizations: [{ name: "Unmentioned company", evidence }] },
        [source],
      ),
    /must be named/,
  )
  assert.throws(
    () =>
      validateCompositionProfile(
        {
          ...profile,
          information_units: [
            {
              statement: "Forged",
              evidence: { ...evidence, quote: "A forged original that was not captured" },
            },
          ],
        },
        [source],
      ),
    /exact original/,
  )
})

test("composition does not force coverage quotas or demote priority-qualified news below lower-priority candidates", () => {
  const result = selectBriefingComposition(
    [item("a", 86), item("b", 85), item("c", 84, "로봇·제조")],
    [candidate("a", "A"), candidate("b", "A"), candidate("c", "B")],
    new Map(),
    policy,
    limits,
  )
  assert.deepEqual(
    result.selected.map((r) => r.candidate_id),
    ["a", "b"],
  )
  const sparse = selectBriefingComposition(
    [item("only", 95)],
    [candidate("only", "A")],
    new Map(),
    policy,
    { max_articles: 40, max_per_sector: 5 },
  )
  assert.equal(sparse.selected.length, 1)
})

async function native(t) {
  const f = await deliveryFixture(t)
  f.ctx.vault = path.join(f.root, "isolated-vault")
  fs.mkdirSync(f.ctx.vault, { recursive: true })
  f.ctx.backlog = path.join(f.root, "candidate-backlog.json")
  atomicWrite(f.root, "candidate-backlog.json", {
    schema: "research-candidates/v1",
    candidates: [],
  })
  const p = await prepareCuration(f.ctx, {
    run_id: "composition-native",
    briefing_date: "2026-10-12",
    plans: [{ path: f.plan.path, sha256: f.plan.sha256 }],
    max_articles: 1,
  })
  const pool = loadCurationPool(f.ctx, { path: p.path, sha256: p.sha256 })
  const c = pool.candidates.find((r) => r.group_id === "order"),
    packet = curationCandidatePacket(f.ctx, c)
  const source = packet.sources[0],
    block = source.blocks[0],
    evidence = { material_id: source.material_id, block_id: block.block_id, quote: block.text }
  const review = {
    schema: "research-curation-review/v1",
    pool_sha256: p.sha256,
    reviewer: "fixture source reader",
    reviewed_at: new Date().toISOString(),
    evaluations: [
      {
        candidate_id: c.candidate_id,
        sector: "로봇·제조",
        checks: {
          source_verified: true,
          scope_relevant: true,
          new_information: true,
          current_valid: true,
          history_compared: true,
        },
        ratings: Object.fromEntries(
          ["novelty", "impact", "specificity", "knowledge_value", "timeliness"].map((key) => [
            key,
            { value: 5, reason: "Controlled original and source comparison" },
          ]),
        ),
        evidence: [evidence],
        compared_article_ids: [],
        valid_until: null,
        composition: {
          organizations: [{ name: "Fixture Robotics", evidence }],
          topics: ["robot-order"],
          information_units: [{ statement: "Contract-123 robot order announced", evidence }],
        },
      },
    ],
  }
  atomicWrite(f.root, "composition-review.json", review)
  await evaluateCuration(f.ctx, {
    pool_path: p.path,
    pool_sha256: p.sha256,
    review_file: path.relative(f.ctx.repo, path.join(f.root, "composition-review.json")),
  })
  const selection = await selectCuration(f.ctx, { pool_path: p.path, pool_sha256: p.sha256 })
  const workflow = await advanceCuration(f.ctx, {
    run_id: "composition-native-workflow",
    selection_path: selection.path,
    selection_sha256: selection.sha256,
    execute: false,
  })
  return { ...f, p, c, selection, workflow }
}

test("native selected profiles, cached writers and explicit reader feedback expose private insights without changing score or approval", async (t) => {
  const f = await native(t),
    reference = { path: f.selection.path, sha256: f.selection.sha256 }
  const approvedBefore = fs.readFileSync(safePath(f.root, "runs/writer/approved-article.json"))
  const review = {
    schema: "research-curation-feedback/v1",
    selection: reference,
    reviewer: "fixture final reader",
    reviewer_kind: "editor",
    reviewed_at: new Date().toISOString(),
    items: [
      {
        candidate_id: f.c.candidate_id,
        draft: {
          path: "runs/writer/draft.json",
          sha256: sha256(fs.readFileSync(safePath(f.root, "runs/writer/draft.json"))),
        },
        judgments: ["useful", "needs_followup"],
        reason: "The source conditions are retained; later execution can be followed.",
      },
    ],
  }
  atomicWrite(f.root, "feedback-review.json", review)
  const parameters = {
    run_id: "feedback-native",
    selection_path: reference.path,
    selection_sha256: reference.sha256,
    review_file: path.relative(f.ctx.repo, path.join(f.root, "feedback-review.json")),
  }
  const recorded = await recordCurationFeedback(f.ctx, parameters)
  assert.equal(recorded.score_policy_changed, false)
  assert.equal((await recordCurationFeedback(f.ctx, parameters)).reused, true)
  const file = `curation/runs/composition-native/workflows/composition-native-workflow/latest.json`
  const result = readCurationInsights(f.ctx, {
    selection_path: reference.path,
    selection_sha256: reference.sha256,
    workflow_path: file,
    workflow_sha256: sha256(fs.readFileSync(safePath(f.root, file))),
  })
  assert.equal(result.counts.selected, 1)
  assert.equal(result.counts.reviewed_feedback_records, 1)
  assert.equal(result.execution.model_calls_last_invocation, 0)
  assert.equal(result.execution.article_writes_last_invocation, 0)
  assert.equal(result.execution.reused_selected_writers, 1)
  assert.equal(result.execution.full_day_wall_ms, null)
  assert.equal(result.model_calls, 0)
  assert.equal(result.public_analysis_created, false)
  assert.deepEqual(
    fs.readFileSync(safePath(f.root, "runs/writer/approved-article.json")),
    approvedBefore,
  )
  const bad = { ...review, items: [{ ...review.items[0], candidate_id: "c".repeat(64) }] }
  atomicWrite(f.root, "feedback-wrong.json", bad)
  await assert.rejects(
    recordCurationFeedback(f.ctx, {
      ...parameters,
      run_id: "bad-feedback",
      review_file: path.relative(f.ctx.repo, path.join(f.root, "feedback-wrong.json")),
    }),
    /outside selected/,
  )
  atomicWrite(f.root, "runs/writer/draft.json", {
    ...readJSON(f.root, "runs/writer/draft.json"),
    tampered: true,
  })
  assert.throws(
    () =>
      readCurationInsights(f.ctx, {
        selection_path: reference.path,
        selection_sha256: reference.sha256,
      }),
    /input changed/,
  )
})
