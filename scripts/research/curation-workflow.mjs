import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { checkedPlan } from "./event-pipeline.mjs"
import { loadCurationSelection } from "./curation.mjs"
import { advanceEventWorkflow } from "./event-workflow.mjs"
import { createModelExecutionWindow } from "./model-provider.mjs"
import { projectEvidenceOntology, loadApprovedOntologyInput } from "./ontology.mjs"
import { loadPublicationNoteReferences } from "./daily-publication-handoff.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"
import { withVerifiedInputSession, assertVerifiedInputBoundary } from "./verified-inputs.mjs"
import { readReasoningTask, readyArticleItems } from "./reasoning-tasks.mjs"

const ref = (root, file) => ({ path: file, sha256: sha256(fs.readFileSync(safePath(root, file))) })
export async function advanceCuration(ctx, p, options = {}) {
  return withVerifiedInputSession(ctx, () => advanceCurationNative(ctx, p, options))
}
async function advanceCurationNative(
  ctx,
  p,
  { baseProvider, eventProcessor = advanceEventWorkflow, readTask = readReasoningTask, clock = Date.now } = {},
) {
  if (p.review_mode !== undefined && !["separate/v1", "combined/v1"].includes(p.review_mode))
    throw Error("Unknown article review mode")
  const selectionRef = { path: p.selection_path, sha256: p.selection_sha256 }
  const selection = loadCurationSelection(ctx, selectionRef)
  const noteReviewRuns = p.note_review_runs || []
  const noteRefs = loadPublicationNoteReferences(ctx, noteReviewRuns)
  const base = `curation/runs/${selection.run_id}/workflows/${p.run_id}/`
  const input = {
    schema: "research-curation-workflow-input/v1",
    run_id: p.run_id,
    selection: selectionRef,
    model_policy_sha256: sha256(fs.readFileSync(ctx.policy)),
    ...(p.review_mode ? { review_mode: p.review_mode } : {}),
    ...(noteRefs.length ? { note_review_runs: noteRefs } : {}),
  }
  return withLock(ctx.root, "curation-workflow-" + p.run_id, async () => {
    const before = readJSON(ctx.root, base + "input.json")
    const requireCompleteness =
      p.require_completeness ?? (before ? before.require_completeness === true : true)
    if (requireCompleteness) input.require_completeness = true
    if (before && JSON.stringify(before) !== JSON.stringify(input))
      throw Error("Curated workflow changed; use a new run")
    if (!before) atomicCreate(ctx.root, base + "input.json", input)
    const window = createModelExecutionWindow({
      time_budget_ms: p.time_budget_ms ?? 600000,
      max_model_calls: p.max_model_calls ?? 4,
      now: clock,
    })
    const previous = readJSON(ctx.root, base + "latest.json")
    const workflows = new Map(
        (previous?.workflows || []).map((w) => {
          if (ref(ctx.root, w.workflow.path).sha256 !== w.workflow.sha256)
            throw Error("Saved curated workflow checkpoint changed")
          return [w.plan.path, w]
        }),
      ),
      errors = []
    const priorRows = [...workflows.values()].flatMap(
      (w) =>
        readJSON(ctx.root, w.workflow.path)?.rows.map((row) => ({
          ...row,
          origin_plan_path: w.plan.path,
        })) || [],
    )
    const priorByKey = new Map([...priorRows].reverse().map((row) =>
      [JSON.stringify([row.origin_plan_path, row.group_id]), row],
    ))
    const priorFor = (item) => priorByKey.get(JSON.stringify([item.execution.plan.path, item.execution.group_id]))
    const blockedItems = new Map()
    const recordBlocked = (item, error, prior) => {
      const blocked = {
        candidate_id: item.candidate_id,
        group_id: item.execution.group_id,
        ...(prior?.writer_run ? { writer_run: prior.writer_run } : {}),
        status: error.code === "STORAGE_PENDING" ? "waiting_for_storage" : "failed",
        error: error.message,
        code: error.code || null,
        ...(error.storage_request ? { storage_request: error.storage_request } : {}),
        ...(prior?.reasoning_task ? { blocked_reasoning_task: prior.reasoning_task } : {}),
      }
      blockedItems.set(item.candidate_id, blocked)
      errors.push(blocked)
    }
    const isPending = (item) => {
      const row = priorFor(item)
      if (!row?.reasoning_task) return false
      try { return readTask(ctx.root, row.reasoning_task).status !== "completed" }
      catch (error) {
        recordBlocked(item, error, row)
        activeArticles.delete(item.candidate_id)
        return true
      }
    }
    const settledArticle = (row) =>
      ["approved", "reused", "failed", "deferred", "not_selected"].includes(row?.status)
    // A completed response or an applied correction still owns its article
    // slot until approval/failure. A local boundary is not a vacant model slot.
    const activeArticles = new Set(
      p.review_mode === "combined/v1"
        ? selection.selected
            .filter((item) => priorFor(item)?.writer_run && !settledArticle(priorFor(item)))
            .map((item) => item.candidate_id)
        : [],
    )
    const ordered =
      p.review_mode === "combined/v1"
        ? [...selection.selected].sort((a, b) => {
            const score = (item) => {
              return activeArticles.has(item.candidate_id) ? 0 : 1
            }
            return score(a) - score(b)
          })
        : selection.selected
    let handled = 0,
      writes = 0
    const save = (status) => {
      const result = {
        schema: "research-curation-workflow/v1",
        run_id: p.run_id,
        selection: selectionRef,
        briefing_date: selection.briefing_date,
        status,
        workflows: [...workflows.values()],
        errors,
        model_calls: window.model_calls,
        article_writes: writes,
        handled_items: handled,
        candidate_approved: false,
        candidate_published: false,
      }
      atomicWrite(ctx.root, base + "latest.json", result)
      return result
    }
    for (const item of ordered) {
      // One native checkpoint can already contain every approved selected
      // group in this plan. Do not dispatch it again for each ranked item.
      if (workflows.get(item.execution.plan.path)?.status === "complete") continue
      if (p.review_mode === "combined/v1") {
        if (isPending(item)) continue
        if (!activeArticles.has(item.candidate_id) && activeArticles.size >= 3) continue
      }
      if (
        handled >= (p.max_items ?? 4) ||
        window.remainingMs() <= 0 ||
        window.model_calls >= (p.max_model_calls ?? 4)
      )
        break
      const plan = checkedPlan(ctx, item.execution.plan)
      const parameters = {
        run_id: "cur-events-" + sha256(JSON.stringify([input, item.execution.plan])).slice(0, 40),
        edition_path: plan.edition.path,
        edition_sha256: plan.edition.sha256,
        plan_path: item.execution.plan.path,
        plan_sha256: item.execution.plan.sha256,
        curation_path: selectionRef.path,
        curation_sha256: selectionRef.sha256,
        curation_focus_group: item.execution.group_id,
        execute: p.execute === true,
        require_completeness: requireCompleteness,
        ...(p.review_mode ? { review_mode: p.review_mode } : {}),
        max_items: 1,
        time_budget_ms: Math.max(1, Math.floor(window.remainingMs())),
        max_model_calls: Math.max(1, (p.max_model_calls ?? 4) - window.model_calls),
        retry_failed: p.retry_failed === true,
        ...(noteRefs.length ? { note_review_runs: noteReviewRuns } : {}),
        ...(p.retry_candidates?.includes(item.candidate_id)
          ? { retry_groups: [item.execution.group_id] }
          : {}),
      }
      for (const name of [
        "fact_reviews",
        "editorial_reviews",
        "revision_reviews",
        "completeness_reviews",
        "coverage_reviews",
      ])
        parameters[name] = p[name]?.[item.candidate_id]
          ? { [item.execution.group_id]: p[name][item.candidate_id] }
          : {}
      try {
        const outcome = await eventProcessor(ctx, parameters, {
          baseProvider,
          clock,
          executionWindow: window,
        })
        workflows.set(item.execution.plan.path, {
          plan: item.execution.plan,
          run_id: parameters.run_id,
          status: outcome.status,
          workflow: ref(ctx.root, `event-workflows/${parameters.run_id}/latest.json`),
          publication_handoff: outcome.publication_handoff,
        })
        if (p.review_mode === "combined/v1") {
          const focused = outcome.rows?.find((row) => row.group_id === item.execution.group_id)
          if (focused?.writer_run && !settledArticle(focused)) activeArticles.add(item.candidate_id)
          else activeArticles.delete(item.candidate_id)
        }
        handled += outcome.handled_items || 0
        writes += outcome.article_writes || 0
      } catch (error) {
        recordBlocked(item, error, priorFor(item))
      }
      save("processing")
    }
    const savedOutcomes = [...workflows.values()].map((w) => ({
      workflow: w,
      value: readJSON(ctx.root, w.workflow.path),
    }))
    const outcomes = savedOutcomes.map((entry) => entry.value)
    const approved = [...new Set(outcomes.flatMap((w) => w.approved_runs || []))]
    const selectedByKey = new Map([...selection.selected].reverse().map((item) =>
      [JSON.stringify([item.execution.plan.path, item.execution.group_id]), item],
    ))
    const rows = savedOutcomes.flatMap(({ workflow, value }) =>
      value.rows.flatMap((row) => {
        const item = selectedByKey.get(JSON.stringify([workflow.plan.path, row.group_id]))
        return item ? [{ ...row, origin_plan: workflow.plan, candidate_id: item.candidate_id,
          ...(blockedItems.has(item.candidate_id) ? { ...blockedItems.get(item.candidate_id), reasoning_task: undefined } : {}) }] : []
      }),
    )
    for (const [candidateId, blocked] of blockedItems)
      if (!rows.some((row) => row.candidate_id === candidateId)) rows.push(blocked)
    const blockedTaskIds = new Set([...blockedItems.values()].map((row) => row.blocked_reasoning_task?.task_id).filter(Boolean))
    const reasoningTasks = outcomes.flatMap((w) => w.reasoning_tasks || [])
      .filter((task) => !blockedTaskIds.has(task.task_id))
    const finalStatus =
      errors.length || outcomes.some((w) => w.status === "partial")
        ? "partial"
        : reasoningTasks.length || outcomes.some((w) => w.status === "waiting_for_reasoning")
          ? "waiting_for_reasoning"
          : selection.batches.length === workflows.size &&
              outcomes.every((w) => w.status === "complete")
            ? "complete"
            : "review_pending"
    const result = save("processing")
    result.rows = rows
    result.reasoning_tasks = reasoningTasks
    if (p.review_mode === "combined/v1") result.ready_items = readyArticleItems(ctx.root, rows)
    result.approved_runs = approved
    result.publication_handoffs = [...workflows.values()]
      .map((w) => w.publication_handoff)
      .filter(Boolean)
    if (approved.length) {
      try {
        // A stable run ID does not guarantee that its approved files, source
        // evidence or concept assignment still have the same bytes. Validate
        // the actual inputs before reusing the previous projection.
        const inputs = approved.map((run) =>
          loadApprovedOntologyInput(ctx.root, run, { vault: ctx.vault }),
        )
        result.ontology_input_sha256 = sha256(JSON.stringify(inputs))
        const sameApprovals =
          JSON.stringify(previous?.approved_runs || []) === JSON.stringify(approved)
        if (
          sameApprovals &&
          previous?.ontology &&
          previous.ontology_input_sha256 === result.ontology_input_sha256
        ) {
          if (ref(ctx.root, previous.ontology.path).sha256 !== previous.ontology.sha256)
            throw Error("Saved curated ontology changed")
          result.ontology = previous.ontology
        } else {
          const graph = projectEvidenceOntology(inputs)
          result.ontology = atomicWrite(ctx.root, base + "ontology.json", graph)
        }
      } catch (error) {
        errors.push({ stage: "knowledge", error: error.message, code: error.code || null })
      }
    }
    // Readable by the existing publication module: each child still undergoes
    // its native source/approval/selection checks before any authoring or release.
    assertVerifiedInputBoundary()
    result.publication_handoff = atomicWrite(ctx.root, base + "publication-handoff.json", {
      schema: "research-curation-publication-handoff/v1",
      run_id: p.run_id,
      curation: selectionRef,
      workflow_input: ref(ctx.root, base + "input.json"),
      briefing_date: selection.briefing_date,
      children: result.publication_handoffs.filter((child) => {
        const handoff = readJSON(ctx.root, child.path)
        return handoff?.approved_runs?.length || handoff?.reused_runs?.length
      }),
      candidate_published: false,
    })
    result.status = errors.length ? "partial" : finalStatus
    result.failures = [...errors, ...outcomes.flatMap((w) => w.failures || [])]
    atomicWrite(ctx.root, base + "latest.json", result)
    return result
  })
}
