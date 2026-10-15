import fs from "node:fs"
import { sha256, assertSchema } from "./contracts.mjs"
import { loadCurationPool, loadCurationSelection } from "./curation.mjs"
import { checkedPlan, loadSelectedEvent } from "./event-pipeline.mjs"
import { assertReviewDate } from "./dates.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"

const ref = (root, file) => ({ path: file, sha256: sha256(fs.readFileSync(safePath(root, file))) })
function pinned(ctx, reference) {
  if (!reference || !/^[a-f0-9]{64}$/.test(reference.sha256 || ""))
    throw Error("Exact curation insight reference required")
  const bytes = fs.readFileSync(safePath(ctx.root, reference.path))
  if (sha256(bytes) !== reference.sha256) throw Error("Curation insight input changed")
  return JSON.parse(bytes)
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const selectionRef = (p) => ({ path: p.selection_path, sha256: p.selection_sha256 })
function selectedWriter(ctx, item) {
  const plan = checkedPlan(ctx, item.execution.plan)
  const binding = readJSON(
    ctx.root,
    `event-plans/${plan.run_id}/selections/${item.execution.group_id}.json`,
  )
  if (!binding) return null
  const selected = loadSelectedEvent(
    ctx,
    {
      run_id: binding.writer_run,
      selection_path: binding.selection.path,
      selection_sha256: binding.selection.sha256,
    },
    { requireProcessed: true },
  )
  if (!same(selected.plan, item.execution.plan) || selected.group_id !== item.execution.group_id)
    throw Error("Feedback writer belongs to a different selected event")
  return binding.writer_run
}
const feedbackSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schema", "selection", "reviewer", "reviewer_kind", "reviewed_at", "items"],
  properties: {
    schema: { type: "string", enum: ["research-curation-feedback/v1"] },
    selection: {
      type: "object",
      additionalProperties: false,
      required: ["path", "sha256"],
      properties: {
        path: { type: "string" },
        sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
      },
    },
    reviewer: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" },
    reviewer_kind: { type: "string", enum: ["user", "editor"] },
    reviewed_at: { type: "string" },
    items: {
      type: "array",
      minItems: 1,
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidate_id", "draft", "judgments", "reason"],
        properties: {
          candidate_id: { type: "string", pattern: "^[a-f0-9]{64}$" },
          draft: {
            type: "object",
            additionalProperties: false,
            required: ["path", "sha256"],
            properties: {
              path: { type: "string" },
              sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
            },
          },
          judgments: {
            type: "array",
            minItems: 1,
            maxItems: 5,
            uniqueItems: true,
            items: {
              type: "string",
              enum: [
                "useful",
                "already_known",
                "explanation_missing",
                "repetitive",
                "needs_followup",
              ],
            },
          },
          reason: { type: "string", minLength: 1, maxLength: 1500, pattern: "\\S" },
        },
      },
    },
  },
}

export async function recordCurationFeedback(ctx, p) {
  const reference = selectionRef(p),
    selection = loadCurationSelection(ctx, reference)
  const review = JSON.parse(fs.readFileSync(safePath(ctx.repo, p.review_file)))
  assertSchema(review, feedbackSchema)
  if (!same(review.selection, reference))
    throw Error("Feedback must bind the exact selected briefing")
  assertReviewDate(review.reviewed_at)
  if (new Set(review.items.map((item) => item.candidate_id)).size !== review.items.length)
    throw Error("Distinct feedback event IDs required")
  for (const row of review.items) {
    const item = selection.selected.find((item) => item.candidate_id === row.candidate_id)
    if (!item) throw Error("Feedback is outside selected events")
    const writer = selectedWriter(ctx, item)
    if (!writer || row.draft.path !== `runs/${writer}/draft.json`)
      throw Error("Feedback must reference the selected native draft")
    const draft = pinned(ctx, row.draft)
    if (!draft.draft_id || !draft.draft) throw Error("Native drafted content required for feedback")
    assertReviewDate(review.reviewed_at, { notBefore: [item.source_published_at] })
  }
  return withLock(ctx.root, "curation-feedback-" + p.run_id, () => {
    const file = `curation/feedback/${p.run_id}.json`
    const record = {
      schema: "research-curation-feedback-record/v1",
      run_id: p.run_id,
      review,
      score_policy_changed: false,
      article_approval_changed: false,
      public_analysis_created: false,
    }
    const before = readJSON(ctx.root, file)
    if (before && !same(before, record)) throw Error("Feedback record changed; use a new run")
    return {
      ...(before ? ref(ctx.root, file) : atomicCreate(ctx.root, file, record)),
      reused: !!before,
      items: review.items.length,
      score_policy_changed: false,
      article_approval_changed: false,
    }
  })
}

export function readCurationInsights(ctx, p) {
  const reference = selectionRef(p),
    selection = loadCurationSelection(ctx, reference)
  const pool = loadCurationPool(ctx, selection.pool)
  if (Boolean(p.workflow_path) !== Boolean(p.workflow_sha256))
    throw Error("Workflow path/SHA pair required")
  let workflow = null,
    workflowRef = null
  const native = []
  if (p.workflow_path) {
    workflowRef = { path: p.workflow_path, sha256: p.workflow_sha256 }
    workflow = pinned(ctx, workflowRef)
    if (workflow.schema === "research-curation-workflow/v1") {
      if (!same(workflow.selection, reference))
        throw Error("Curation insight workflow has a different selection")
      for (const child of workflow.workflows) {
        const result = pinned(ctx, child.workflow)
        if (
          result.schema !== "research-event-workflow/v1" ||
          !same(result.curation, reference) ||
          !same(result.plan, child.plan) ||
          result.run_id !== child.run_id
        )
          throw Error("Curation insight child has a different native binding")
        native.push(result)
      }
    } else if (
      workflow.schema === "research-event-workflow/v1" &&
      same(workflow.curation, reference)
    )
      native.push(workflow)
    else throw Error("Exact curated native workflow required")
  }
  const selectedGroups = new Set(
    selection.selected.map((i) => JSON.stringify([i.execution.plan, i.execution.group_id])),
  )
  const rows = native.flatMap((w) =>
    w.rows.filter((row) => selectedGroups.has(JSON.stringify([w.plan, row.group_id]))),
  )
  const writers = [...new Set(rows.map((row) => row.writer_run).filter(Boolean))]
  const budgets = []
  for (const writer of writers) {
    const directory = `runs/${writer}/model-policy`
    if (!fs.existsSync(safePath(ctx.root, directory))) continue
    for (const entry of fs.readdirSync(safePath(ctx.root, directory), { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw Error("Budget insight cannot follow symlinks")
      if (!entry.isDirectory()) continue
      const file = directory + "/" + entry.name + "/budget.json",
        value = readJSON(ctx.root, file)
      if (!value) continue
      if (!Array.isArray(value.attempts)) throw Error("Malformed native model budget")
      budgets.push({
        role: entry.name,
        writer_run: writer,
        reference: ref(ctx.root, file),
        attempts: value.attempts.length,
        complete: value.attempts.filter((a) => a.status === "complete").length,
        failed: value.attempts.filter((a) => a.status === "failed").length,
        wall_ms_sum:
          value.attempts.length && value.attempts.every((a) => Number.isFinite(a.wall_ms))
            ? value.attempts.reduce((sum, a) => sum + a.wall_ms, 0)
            : null,
      })
    }
  }
  const feedback = []
  const directory = "curation/feedback"
  if (fs.existsSync(safePath(ctx.root, directory)))
    for (const entry of fs.readdirSync(safePath(ctx.root, directory), { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw Error("Feedback insight cannot follow symlinks")
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue
      const file = directory + "/" + entry.name,
        record = readJSON(ctx.root, file)
      if (record.schema !== "research-curation-feedback-record/v1")
        throw Error("Invalid private feedback record")
      if (!same(record.review.selection, reference)) continue
      assertSchema(record.review, feedbackSchema)
      for (const row of record.review.items) pinned(ctx, row.draft)
      feedback.push({
        reference: ref(ctx.root, file),
        reviewer_kind: record.review.reviewer_kind,
        reviewed_at: record.review.reviewed_at,
        items: record.review.items.map(({ candidate_id, judgments, reason }) => ({
          candidate_id,
          judgments,
          reason,
        })),
      })
    }
  const counts = Object.fromEntries(
    [...new Set(selection.held.map((row) => row.reason))].map((reason) => [
      reason,
      selection.held.filter((row) => row.reason === reason).length,
    ]),
  )
  const reasons = new Set([
    "article_budget",
    "sector_budget",
    "no_additional_reviewed_information",
    "event_identity_collision_requires_review",
  ])
  return {
    schema: "research-curation-insights/v1",
    selection: reference,
    workflow: workflowRef,
    briefing_date: selection.briefing_date,
    scope: "private_saved_selection_and_exact_native_workflow",
    source_gets: 0,
    model_calls: 0,
    public_analysis_created: false,
    counts: {
      candidates: pool.candidates.length,
      selected: selection.selected.length,
      held: selection.held.length,
      held_by_reason: counts,
      reviewed_feedback_records: feedback.length,
    },
    pending_high_value: selection.held
      .filter((row) => row.score >= pool.policy.priority_score && reasons.has(row.reason))
      .sort((a, b) => b.score - a.score)
      .slice(0, p.limit ?? 20)
      .map(({ candidate_id, score, reason, group_id, source_published_at, origin_plan }) => ({
        candidate_id,
        score,
        reason,
        group_id,
        source_published_at,
        origin_plan,
      })),
    composition: selection.composition || null,
    execution: workflow
      ? {
          status: workflow.status,
          model_calls_last_invocation: workflow.model_calls ?? null,
          article_writes_last_invocation: workflow.article_writes ?? null,
          reused_selected_writers: rows.filter((row) => row.reused || row.cached_stage).length,
          selected_rows: rows.map(({ group_id, status, writer_run, reused, cached_stage }) => ({
            group_id,
            status,
            writer_run,
            reused: !!reused,
            cached_stage: !!cached_stage,
          })),
          native_worker_elapsed_sum_ms:
            native.length && native.every((w) => Number.isFinite(w.elapsed_ms))
              ? native.reduce((sum, w) => sum + w.elapsed_ms, 0)
              : null,
          collection_wall_ms: null,
          full_day_wall_ms: null,
          writer_model_budget_scope:
            "stored_writer_roles_only_not_shared_source_extraction_or_full_day",
          writer_model_budgets: budgets,
        }
      : null,
    feedback,
  }
}
