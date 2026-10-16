import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import {
  checkedEdition,
  checkedPlan,
  prepareEventSelection,
  reuseEventArticle,
  loadSelectedEvent,
  proposeEditionEvents,
} from "./event-pipeline.mjs"
import { extractEditionEventProposals, extractSelectedEventEvidence } from "./event-inference.mjs"
import { approveSelectedEvent } from "./event-publication.mjs"
import { prepareEditorialCompleteness } from "./editorial-completeness.mjs"
import {
  prepareEventPublicationHandoff,
  loadPublicationNoteReferences,
} from "./daily-publication-handoff.mjs"
import { nativeResearch } from "./modules/contracts.mjs"
import { loadCurrentApproval } from "./preview.mjs"
import {
  loadApprovedOntologyInput,
  projectEvidenceOntology,
  extendEvidenceOntology,
  assertEvidenceOntology,
} from "./ontology.mjs"
import { ontologyImpact, loadKnowledgeConnectionApproval } from "./ontology-knowledge.mjs"
import { createModelExecutionWindow } from "./model-provider.mjs"
import { writeSelectedEventDraft } from "./source-processing.mjs"
import { curationGroupsForPlan } from "./curation.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"

const ref = (root, path) => ({ path, sha256: sha256(fs.readFileSync(safePath(root, path))) })
async function saveWorkflowResult(ctx, base, result) {
  const workflowPath = base + "latest.json"
  atomicWrite(ctx.root, workflowPath, result)
  const workflow = ref(ctx.root, workflowPath)
  const publication = await prepareEventPublicationHandoff(ctx, {
    run_id: "event-publication-" + sha256(result.run_id).slice(0, 40),
    workflow_path: workflow.path,
    workflow_sha256: workflow.sha256,
  })
  // Keep the native checkpoint independent of the handoff that pins its bytes.
  return { ...result, publication_handoff: publication.publication_handoff, publication }
}
function checkedMapping(ctx, map) {
  if (!map || typeof map !== "object" || Array.isArray(map))
    throw Error("Event review mapping required")
  for (const [group, file] of Object.entries(map)) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(group) || typeof file !== "string")
      throw Error("Exact event group review files required")
    JSON.parse(fs.readFileSync(safePath(ctx.repo, file), "utf8"))
  }
}
export async function advanceEventWorkflow(
  ctx,
  p,
  { clock = Date.now, baseProvider, executionWindow: sharedWindow } = {},
) {
  for (const [value, maximum] of [
    [p.max_items ?? 4, 40],
    [p.time_budget_ms ?? 600000, 3600000],
  ])
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
      throw Error("Bounded event workflow execution required")
  if (
    p.max_model_calls !== undefined &&
    (!Number.isSafeInteger(p.max_model_calls) || p.max_model_calls < 1 || p.max_model_calls > 64)
  )
    throw Error("Bounded event model call count required")
  if (!Number.isSafeInteger(p.offset ?? 0) || (p.offset ?? 0) < 0 || (p.offset ?? 0) > 1000000)
    throw Error("Bounded event proposal offset required")
  if (Boolean(p.ontology_path) !== Boolean(p.ontology_sha256))
    throw Error("Exact ontology path and SHA required together")
  const ontologyRef = p.ontology_path ? { path: p.ontology_path, sha256: p.ontology_sha256 } : null
  let ontologyBase = null
  if (ontologyRef) {
    const bytes = fs.readFileSync(safePath(ctx.root, ontologyRef.path))
    if (sha256(bytes) !== ontologyRef.sha256) throw Error("Ontology input SHA changed")
    ontologyBase = JSON.parse(bytes)
    assertEvidenceOntology(ontologyBase)
  }
  const editionRef = { path: p.edition_path, sha256: p.edition_sha256 }
  const { report } = checkedEdition(ctx, editionRef)
  const planRef = p.plan_path ? { path: p.plan_path, sha256: p.plan_sha256 } : null
  if (Boolean(p.plan_path) !== Boolean(p.plan_sha256))
    throw Error("Exact event plan path and SHA required together")
  const plan = planRef ? checkedPlan(ctx, planRef) : null
  if (Boolean(p.curation_path) !== Boolean(p.curation_sha256))
    throw Error("Exact curation path and SHA required together")
  const curationRef = p.curation_path ? { path: p.curation_path, sha256: p.curation_sha256 } : null
  const curatedGroups = curationRef ? curationGroupsForPlan(ctx, curationRef, planRef) : null
  if (p.curation_focus_group && (!curationRef || !curatedGroups.includes(p.curation_focus_group)))
    throw Error("Curation focus must be a selected event")
  const retryGroups = p.retry_groups || []
  if (
    !Array.isArray(retryGroups) ||
    retryGroups.length > 40 ||
    new Set(retryGroups).size !== retryGroups.length ||
    retryGroups.some((group) => !plan?.events.some((event) => event.group_id === group))
  )
    throw Error("Exact reviewed event groups required for retry")
  const noteReviewRuns = p.note_review_runs || []
  const noteRefs = loadPublicationNoteReferences(ctx, noteReviewRuns)
  const connectionReviewRun = p.connection_review_run
  if (
    connectionReviewRun !== undefined &&
    (typeof connectionReviewRun !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(connectionReviewRun))
  )
    throw Error("Safe explicit connection approval run required")
  const connectionApproval = connectionReviewRun
    ? loadKnowledgeConnectionApproval(ctx.root, connectionReviewRun, { vault: ctx.vault })
    : null
  if (plan && JSON.stringify(plan.edition) !== JSON.stringify(editionRef))
    throw Error("Event plan belongs to another frozen edition")
  const maps = {
    fact: p.fact_reviews || {},
    editorial: p.editorial_reviews || {},
    revision: p.revision_reviews || {},
    completeness: p.completeness_reviews || {},
    coverage: p.coverage_reviews || {},
  }
  Object.values(maps).forEach((map) => checkedMapping(ctx, map))
  if (
    plan &&
    Object.values(maps).some((map) =>
      Object.keys(map).some((id) => !plan.events.some((e) => e.group_id === id)),
    )
  )
    throw Error("Review is outside the reviewed event plan")
  const input = {
    schema: "research-event-workflow-input/v1",
    run_id: p.run_id,
    edition: editionRef,
    plan: planRef,
    policy_sha256: sha256(fs.readFileSync(ctx.policy)),
    ...(curationRef ? { curation: curationRef } : {}),
    ...(ontologyRef ? { ontology_base: ontologyRef } : {}),
    ...(noteRefs.length ? { note_review_runs: noteRefs } : {}),
    ...(connectionApproval
      ? { connection_review: { run: connectionReviewRun, files: connectionApproval.files } }
      : {}),
  }
  const base = `event-workflows/${p.run_id}/`
  return withLock(ctx.root, "event-workflow-" + p.run_id, async () => {
    const previous = readJSON(ctx.root, base + "input.json")
    const requireCompleteness =
      p.require_completeness ??
      (previous ? previous.require_completeness === true : Boolean(curationRef))
    if (requireCompleteness) input.require_completeness = true
    if (previous && JSON.stringify(previous) !== JSON.stringify(input))
      throw Error("Frozen event workflow changed; use a new run")
    if (!previous) atomicCreate(ctx.root, base + "input.json", input)
    const started = clock()
    const executionWindow =
      sharedWindow ||
      createModelExecutionWindow({
        time_budget_ms: p.time_budget_ms || 600000,
        max_model_calls: p.max_model_calls,
        now: clock,
      })
    if (!plan) {
      const proposals =
        p.execute && p.propose
          ? await extractEditionEventProposals(
              ctx,
              { ...p, run_id: p.run_id + "-proposals-" + (p.offset || 0) },
              { baseProvider, executionWindow, retry_failed: p.retry_failed === true },
            )
          : proposeEditionEvents(ctx, p)
      const result = {
        schema: "research-event-workflow/v1",
        run_id: p.run_id,
        status: "relationship_review",
        edition: editionRef,
        collection_status: report.status,
        proposals,
        model_calls: proposals.model_calls || 0,
        article_writes: 0,
        candidate_published: false,
      }
      return saveWorkflowResult(ctx, base, result)
    }
    const rows = [],
      approvedRuns = [],
      failures = []
    const previousRows = new Map(
      (
        readJSON(ctx.root, base + "progress.json")?.rows ||
        readJSON(ctx.root, base + "latest.json")?.rows ||
        []
      ).map((row) => [row.group_id, row]),
    )
    let handled = 0,
      modelCalls = 0,
      articleWrites = 0
    for (const event of plan.events) {
      const row = { group_id: event.group_id, action: event.action }
      if (curatedGroups && !curatedGroups.includes(event.group_id)) {
        rows.push({ ...row, status: "not_selected" })
        continue
      }
      if (event.action === "defer") {
        rows.push({ ...row, status: "deferred" })
        continue
      }
      if (event.action === "reuse") {
        const reused = reuseEventArticle(ctx, { ...p, group_id: event.group_id })
        approvedRuns.push(reused.approved_run)
        rows.push({ ...row, status: "reused", approved_run: reused.approved_run })
        continue
      }
      // Selection already owns the writer identity. Reuse its exact native
      // approval before quotas, without preparing another writer or model call.
      const binding = readJSON(
        ctx.root,
        `event-plans/${plan.run_id}/selections/${event.group_id}.json`,
      )
      if (binding && readJSON(ctx.root, `runs/${binding.writer_run}/approved-article.json`)) {
        const selected = loadSelectedEvent(
          ctx,
          {
            run_id: binding.writer_run,
            selection_path: binding.selection.path,
            selection_sha256: binding.selection.sha256,
          },
          { requireProcessed: true },
        )
        if (
          JSON.stringify(selected.plan) !== JSON.stringify(planRef) ||
          selected.group_id !== event.group_id
        )
          throw Error("Completed event selection differs from its reviewed plan")
        const approval = loadCurrentApproval(ctx.root, binding.writer_run, { vault: ctx.vault })
        approvedRuns.push(binding.writer_run)
        rows.push({
          ...row,
          writer_run: binding.writer_run,
          status: "approved",
          event_id: approval.article.event_id,
          published_at: approval.article.article_review.published_at,
          reused: true,
        })
        continue
      }
      const priorRow = previousRows.get(event.group_id)
      if (p.execute && priorRow?.status === "failed" && !retryGroups.includes(event.group_id)) {
        failures.push({ group_id: event.group_id, error: priorRow.error })
        rows.push({ ...priorRow, retry_skipped: true })
        continue
      }
      if (
        p.execute &&
        priorRow?.writer_run &&
        !readJSON(ctx.root, `runs/${priorRow.writer_run}/approved-article.json`) &&
        ((priorRow.status === "fact_review" &&
          !maps.fact[event.group_id] &&
          !readJSON(ctx.root, `runs/${priorRow.writer_run}/reviewed-claims.json`)) ||
          (priorRow.status === "editorial_review" && !maps.editorial[event.group_id]) ||
          (priorRow.status === "completeness_review" &&
            !maps.completeness[event.group_id] &&
            !readJSON(ctx.root, `runs/${priorRow.writer_run}/draft.json`)) ||
          (priorRow.status === "coverage_review" && !maps.coverage[event.group_id]))
      ) {
        const selectionRef = readJSON(ctx.root, `runs/${priorRow.writer_run}/event-selection.json`)
        if (!selectionRef) throw Error("Waiting event has no native selection reference")
        loadSelectedEvent(ctx, {
          run_id: priorRow.writer_run,
          selection_path: selectionRef.path,
          selection_sha256: selectionRef.sha256,
        })
        rows.push({ ...priorRow, cached_stage: true })
        continue
      }
      if (
        !p.execute ||
        (p.curation_focus_group && p.curation_focus_group !== event.group_id) ||
        handled >= (p.max_items || 4) ||
        (p.max_model_calls !== undefined && modelCalls >= p.max_model_calls) ||
        clock() - started >= (p.time_budget_ms || 600000)
      ) {
        rows.push({ ...row, status: "queued" })
        continue
      }
      try {
        const selected = await prepareEventSelection(ctx, {
          ...p,
          run_id: "event-" + sha256(JSON.stringify([planRef, event.group_id])).slice(0, 36),
          group_id: event.group_id,
        })
        const run_id = selected.writer_run
        row.writer_run = run_id
        const selectedParameters = {
          run_id,
          selection_path: selected.path,
          selection_sha256: selected.sha256,
        }
        if (readJSON(ctx.root, `runs/${run_id}/approved-article.json`)) {
          const approval = loadCurrentApproval(ctx.root, run_id, { vault: ctx.vault })
          loadSelectedEvent(ctx, selectedParameters, { requireProcessed: true })
          approvedRuns.push(run_id)
          rows.push({
            ...row,
            status: "approved",
            event_id: approval.article.event_id,
            reused: true,
          })
          continue
        }
        handled++
        if (!readJSON(ctx.root, `runs/${run_id}/reviewed-claims.json`)) {
          const extracted = await extractSelectedEventEvidence(ctx, selectedParameters, {
            baseProvider,
            executionWindow,
            time_budget_ms: Math.max(1, (p.time_budget_ms || 600000) - (clock() - started)),
            max_model_calls:
              p.max_model_calls === undefined
                ? undefined
                : Math.max(1, p.max_model_calls - modelCalls),
            retry_failed: retryGroups.includes(event.group_id),
          })
          modelCalls += extracted.model_calls
          if (!maps.fact[event.group_id]) {
            rows.push({ ...row, status: "fact_review", extraction: extracted })
            atomicWrite(ctx.root, base + "progress.json", { rows, elapsed_ms: clock() - started })
            continue
          }
          await nativeResearch(
            ctx,
            "review",
            { run_id, review_file: maps.fact[event.group_id] },
            { run_id: "run", review_file: "review" },
          )
        }
        loadSelectedEvent(ctx, selectedParameters, { requireProcessed: true })
        if (!readJSON(ctx.root, `runs/${run_id}/draft.json`)) {
          if (requireCompleteness && !maps.completeness[event.group_id]) {
            await prepareEditorialCompleteness(ctx, { run_id })
            rows.push({
              ...row,
              status: "completeness_review",
              requires_completeness: true,
              next_input: {
                module: "validation",
                operation: "completeness",
                parameters: { run_id },
              },
              review_input: "completeness_reviews",
            })
            atomicWrite(ctx.root, base + "progress.json", { rows, elapsed_ms: clock() - started })
            continue
          }
          const beforeCalls =
            readJSON(ctx.root, `runs/${run_id}/model-policy/article_write/budget.json`)?.attempts
              .length || 0
          let drafted
          try {
            drafted = await writeSelectedEventDraft(
              ctx,
              {
                ...selectedParameters,
                completeness_review_file: maps.completeness[event.group_id],
              },
              {
                baseProvider,
                executionWindow,
                retryFailed: retryGroups.includes(event.group_id),
              },
            )
          } finally {
            modelCalls +=
              (readJSON(ctx.root, `runs/${run_id}/model-policy/article_write/budget.json`)?.attempts
                .length || 0) - beforeCalls
          }
          if (!drafted.draft_reused) articleWrites++
        }
        const needsCoverage = Boolean(
          readJSON(ctx.root, `runs/${run_id}/draft.json`)?.completeness_context,
        )
        if (requireCompleteness && priorRow?.requires_completeness && !needsCoverage)
          throw Error("New draft must bind the required important-fact review")
        if (!maps.editorial[event.group_id] || (needsCoverage && !maps.coverage[event.group_id])) {
          rows.push({
            ...row,
            status:
              maps.editorial[event.group_id] && needsCoverage
                ? "coverage_review"
                : "editorial_review",
            requires_coverage_review: needsCoverage,
            requires_completeness: needsCoverage || priorRow?.requires_completeness === true,
            required_review_inputs: [
              "editorial_reviews",
              ...(needsCoverage ? ["coverage_reviews"] : []),
            ],
            next_input: { module: "validation", operation: "reader", parameters: { run_id } },
          })
          atomicWrite(ctx.root, base + "progress.json", { rows, elapsed_ms: clock() - started })
          continue
        }
        const approved = await approveSelectedEvent(ctx, {
          run_id,
          review_file: maps.editorial[event.group_id],
          revision_file: maps.revision[event.group_id],
          coverage_review_file: maps.coverage[event.group_id],
        })
        approvedRuns.push(run_id)
        rows.push({
          ...row,
          status: "approved",
          event_id: approved.event_id,
          published_at: approved.published_at,
        })
      } catch (error) {
        if (Number.isSafeInteger(error.model_calls) && error.model_calls >= 0)
          modelCalls += error.model_calls
        if (error.code === "REASONING_PENDING")
          rows.push({
            ...row,
            status: "waiting_for_reasoning",
            reasoning_task: error.reasoning_task,
          })
        else {
          const details = {
            error: error.message,
            ...(error.code ? { code: error.code } : {}),
            ...(error.model_budget ? { model_budget: error.model_budget } : {}),
            ...(error.extraction_checkpoint
              ? { extraction_checkpoint: error.extraction_checkpoint }
              : {}),
          }
          failures.push({ group_id: event.group_id, ...details })
          rows.push({ ...row, status: "failed", ...details })
        }
      }
      atomicWrite(ctx.root, base + "progress.json", { rows, elapsed_ms: clock() - started })
    }
    const runs = [...new Set(approvedRuns)]
    let ontology = null,
      impact = []
    if (runs.length) {
      if (ontologyRef && ref(ctx.root, ontologyRef.path).sha256 !== ontologyRef.sha256)
        throw Error("Ontology input SHA changed")
      const next = ontologyBase
        ? extendEvidenceOntology(ctx.root, ontologyBase, runs, { vault: ctx.vault })
        : projectEvidenceOntology(
            runs.map((run) => loadApprovedOntologyInput(ctx.root, run, { vault: ctx.vault })),
          )
      const file = base + `ontology-${sha256(JSON.stringify(next))}.json`
      if (!readJSON(ctx.root, file)) atomicCreate(ctx.root, file, next)
      ontology = ref(ctx.root, file)
      impact = rows
        .filter((r) => r.status === "approved" && ["update", "correction"].includes(r.action))
        .map((r) => ({
          group_id: r.group_id,
          event_id: r.event_id,
          impact: ontologyImpact(
            ctx.root,
            next,
            { event_id: r.event_id },
            {
              vault: ctx.vault,
              noteReviewRuns,
              connectionReviewRun,
            },
          ),
        }))
    }
    const pending = rows.some(
      (r) => !["approved", "reused", "deferred", "not_selected"].includes(r.status),
    )
    const result = {
      schema: "research-event-workflow/v1",
      run_id: p.run_id,
      status:
        !p.execute && !runs.length
          ? "planned"
          : failures.length
            ? "partial"
            : rows.some((r) => r.status === "waiting_for_reasoning")
              ? "waiting_for_reasoning"
              : pending
                ? "review_pending"
                : "complete",
      collection_status: report.status,
      edition: editionRef,
      plan: planRef,
      ...(curationRef ? { curation: curationRef } : {}),
      rows,
      failures,
      reasoning_tasks: rows
        .filter((row) => row.status === "waiting_for_reasoning")
        .map(({ group_id, writer_run, reasoning_task }) => ({
          group_id,
          writer_run,
          ...reasoning_task,
        })),
      approved_runs: runs,
      ontology,
      impact,
      model_calls: modelCalls,
      article_writes: articleWrites,
      handled_items: handled,
      elapsed_ms: clock() - started,
      candidate_published: false,
    }
    return saveWorkflowResult(ctx, base, result)
  })
}
