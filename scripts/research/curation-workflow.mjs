import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { checkedPlan, eventWorkKey, eventWriterBinding } from "./event-pipeline.mjs"
import { partialRecoveryItem, partialRecoveryManifest, recoveryProducerPath } from "./replacement-scope.mjs"
import { inspectSavedStorageRequest } from "./storage-request.mjs"
import { currentRequestOwner } from "./request-ownership.mjs"
import { completeCurationFrontier, loadCurationSelection } from "./curation.mjs"
import { advanceEventWorkflow } from "./event-workflow.mjs"
import { createModelExecutionWindow } from "./model-provider.mjs"
import { projectEvidenceOntology, loadApprovedOntologyInput } from "./ontology.mjs"
import { loadPublicationNoteReferences } from "./daily-publication-handoff.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"
import { withVerifiedInputSession, assertVerifiedInputBoundary } from "./verified-inputs.mjs"
import { readReasoningTask, readyArticleItems } from "./reasoning-tasks.mjs"
import { openArticleTiming, observeArticleStart, observeArticleApproval } from "./article-timing.mjs"

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
  if (p.review_repair_mode !== undefined &&
      (p.review_repair_mode !== "components/v1" || p.review_mode !== "combined/v1"))
    throw Error("Bound combined review repair mode required")
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
    ...(p.review_repair_mode ? { review_repair_mode: p.review_repair_mode } : {}),
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
    // Timing is diagnostic only: it must never interfere with native recovery.
    // A missing or damaged observation is exposed as unavailable by status.
    const observe = (fn) => {
      try { return fn() }
      catch (error) { process.emitWarning("Article timing unavailable: " + error.message); return null }
    }
    const timing = observe(() => openArticleTiming(ctx, {
      owner: currentRequestOwner(), inputPath: base + "input.json", selectionRef, selection,
      created: !before, execute: p.execute === true,
    }))
    const window = createModelExecutionWindow({
      time_budget_ms: p.time_budget_ms ?? 600000,
      max_model_calls: p.max_model_calls ?? 4,
      now: clock,
    })
    const previous = readJSON(ctx.root, base + "latest.json")
    const childRun = (item) => "cur-events-" + sha256(JSON.stringify([input, item.execution.plan])).slice(0, 40)
    const owner = currentRequestOwner()
    const ownedChild = (run, group, parentRef = null) => {
      if (!partialRecoveryManifest(ctx) || !owner || owner.round_id !== ctx.operationalRound?.round_id)
        return null
      const producer = readJSON(ctx.root, recoveryProducerPath(run, owner, group))
      if (!producer || producer.schema !== "research-event-recovery-producer/v1" ||
          producer.run_id !== run || producer.focus_group !== group ||
          JSON.stringify(producer.owner) !== JSON.stringify(owner)) return null
      const childBase = `event-workflows/${run}/`
      const childInput = readJSON(ctx.root, childBase + "input.json")
      if (childInput && sha256(JSON.stringify(childInput)) !== producer.input_sha256)
        throw Error("Owned child input differs from its producer")
      const progress = readJSON(ctx.root, childBase + "progress.json")
      const latestFile = safePath(ctx.root, childBase + "latest.json")
      const latest = fs.existsSync(latestFile) ? readJSON(ctx.root, childBase + "latest.json") : null
      const checkpoint = latest ? ref(ctx.root, childBase + "latest.json") : null
      const parentPinned = checkpoint && parentRef?.path === checkpoint.path && parentRef.sha256 === checkpoint.sha256
      if (latest && (JSON.stringify(latest.producer_owner) !== JSON.stringify(owner) ||
          latest.producer_focus_group !== group) && !parentPinned)
        return null
      if (progress && (JSON.stringify(progress.request_owner) !== JSON.stringify(owner) ||
          progress.producer_focus_group !== group) &&
          (!parentPinned || JSON.stringify(progress.rows) !== JSON.stringify(latest?.rows))) return null
      return { checkpoint, latest, progress }
    }
    const recoverablePlans = new Set()
    const workflows = new Map(
        (previous?.workflows || []).map((w) => {
          const actual = ref(ctx.root, w.workflow.path)
          if (actual.sha256 !== w.workflow.sha256) {
            const latest = readJSON(ctx.root, w.workflow.path)
            const focus = latest?.producer_focus_group
            if (!selection.selected.some((item) => item.execution.plan.path === w.plan.path &&
                item.execution.group_id === focus))
              throw Error("Changed child is outside the selected recovery focus")
            const child = ownedChild(w.run_id, focus)
            const snapshot = `event-workflows/${w.run_id}/checkpoint-outcomes/${w.workflow.sha256}.json`
            if (!child?.checkpoint || child.checkpoint.sha256 !== actual.sha256 ||
                JSON.stringify(child.latest?.producer_owner) !== JSON.stringify(owner) ||
                ref(ctx.root, snapshot).sha256 !== w.workflow.sha256)
              throw Error("Saved curated workflow checkpoint changed")
            recoverablePlans.add(w.plan.path)
            return [w.plan.path, { ...w, workflow: actual, status: "owned_recovery" }]
          }
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
    const checkpointBlocked = new Map((previous?.rows || [])
      .filter((row) => row.status === "frontier_inconsistent")
      .map((row) => [row.candidate_id, row]))
    const initialPlans = new Set(workflows.keys())
    const processedCandidates = new Set()
    const unstarted = (item, { allowCurrentChild = false } = {}) => {
      const plan = checkedPlan(ctx, item.execution.plan, item.execution.group_id)
      const event = plan.events.find((entry) => entry.group_id === item.execution.group_id)
      const recovery = partialRecoveryItem(ctx, item.execution.plan, item.execution.group_id, eventWorkKey(event))
      if (recovery?.action === "reuse") {
        if (event.action === "reuse") return event.prior?.run_id === recovery.writer_run
        const binding = eventWriterBinding(ctx, item.execution.plan, event)
        return binding?.writer_run === recovery.writer_run &&
          ref(ctx.root, `runs/${recovery.writer_run}/approved-article.json`).sha256 === recovery.approval.sha256
      }
      const writer = recovery?.action === "restart" ? recovery.writer_run
        : "event-" + sha256(JSON.stringify([item.execution.plan, item.execution.group_id])).slice(0, 36)
      if (allowCurrentChild) {
        const childRef = workflows.get(item.execution.plan.path)?.workflow
        if (!childRef || ref(ctx.root, childRef.path).sha256 !== childRef.sha256) return false
        const child = readJSON(ctx.root, childRef.path)
        const matches = child?.rows?.filter((row) => row.group_id === item.execution.group_id) || []
        if (matches.length !== 1 || matches[0].status !== "queued" || matches[0].writer_run ||
            matches[0].reasoning_task) return false
      }
      const bindings = [
        ...(recovery?.action === "restart" ? [recovery.binding_path] : [
          `event-plans/${plan.run_id}/selections/${event.group_id}.json`,
          `event-work/${eventWorkKey(event)}/selection.json`,
        ]),
        `event-selections/${writer}/input.json`,
        `runs/${writer}/event-selection.json`,
        ...(!allowCurrentChild ? [
          `event-workflows/${childRun(item)}/input.json`,
          `event-workflows/${childRun(item)}/latest.json`,
          `event-workflows/${childRun(item)}/progress.json`,
        ] : []),
      ]
      if (bindings.some((file) => readJSON(ctx.root, file))) return false
      return ![`runs/${writer}`, `event-selections/${writer}`,
        ...(!allowCurrentChild ? [`event-workflows/${childRun(item)}`] : [])]
        .some((dir) => fs.existsSync(safePath(ctx.root, dir)))
    }
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
    const safelyUnstarted = (item, options) => {
      if (blockedItems.has(item.candidate_id)) return false
      try { return unstarted(item, options) }
      catch (error) {
        if (error.code !== "STORAGE_PENDING") throw error
        recordBlocked(item, error, priorFor(item))
        return false
      }
    }
    const ownedOrphan = (item) => ownedChild(childRun(item), item.execution.group_id,
      workflows.get(item.execution.plan.path)?.workflow)
    const ownedRetry = (item, error) => {
      if (!item || !ownedOrphan(item)) return error
      if (["STORAGE_PENDING", "REASONING_PENDING"].includes(error.code)) return error
      const wrapped = Error("Owned child checkpoint needs the same native job to resume: " + error.message,
        { cause: error })
      wrapped.code = "OWNED_CHILD_RETRY"
      return wrapped
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
    const isStoragePending = (item) => {
      const row = priorFor(item)
      if (row?.status !== "waiting_for_storage") return false
      const saved = inspectSavedStorageRequest(ctx.root, row.storage_request)
      if (saved.status === "invalid") throw Error("Invalid saved article storage request")
      return saved.status === "pending"
    }
    const settledArticle = (row) =>
      ["approved", "reused", "failed", "deferred", "not_selected", "waiting_for_storage"].includes(row?.status)
    // A completed response or an applied correction still owns its article
    // slot until approval/failure. A local boundary is not a vacant model slot.
    const activeArticles = new Set(
      p.review_mode === "combined/v1"
        ? selection.selected
            .filter((item) => priorFor(item)?.writer_run && !settledArticle(priorFor(item)))
            .map((item) => item.candidate_id)
        : [],
    )
    const ownedRecoveryItems = new Set()
    if ((before || previous) && owner && partialRecoveryManifest(ctx)) {
      for (const item of selection.selected) {
        try {
          const child = ownedOrphan(item), saved = workflows.get(item.execution.plan.path), prior = priorFor(item)
          if (child && (!saved || recoverablePlans.has(item.execution.plan.path) ||
              (child.progress?.producer_focus_group === item.execution.group_id &&
                JSON.stringify(child.progress.rows) !== JSON.stringify(child.latest?.rows)) ||
              (prior?.status === "queued" && !prior.writer_run &&
                child.latest?.producer_focus_group !== item.execution.group_id)))
            ownedRecoveryItems.add(item.candidate_id)
        } catch (error) {
          if (error.code !== "STORAGE_PENDING") throw error
          recordBlocked(item, error, priorFor(item))
        }
      }
    }
    const ordered =
      p.review_mode === "combined/v1" || ownedRecoveryItems.size
        ? [...selection.selected].sort((a, b) => {
            const score = (item) => {
              return ownedRecoveryItems.has(item.candidate_id) ? -1 : activeArticles.has(item.candidate_id) ? 0 : 1
            }
            return score(a) - score(b)
          })
        : selection.selected
    let handled = 0,
      writes = 0,
      lastOwnedItem = null
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
      try { atomicWrite(ctx.root, base + "latest.json", result) }
      catch (error) { throw ownedRetry(lastOwnedItem, error) }
      return result
    }
    for (const item of ordered) {
      let orphan = null
      if (ownedRecoveryItems.has(item.candidate_id)) {
        try { orphan = ownedOrphan(item) }
        catch (error) {
          if (error.code !== "STORAGE_PENDING") throw error
          recordBlocked(item, error, priorFor(item))
          continue
        }
      }
      if (checkpointBlocked.has(item.candidate_id) && !orphan) continue
      if (isStoragePending(item)) continue
      if (
        handled >= (p.max_items ?? 4) ||
        window.remainingMs() <= 0 ||
        window.model_calls >= (p.max_model_calls ?? 4)
      )
        break
      // A saved parent checkpoint can be missing work that already wrote a
      // child checkpoint or writer. Never dispatch such a candidate based on
      // the missing parent row alone.
      const recoveryBoundary = Boolean(before || previous)
      const missingPrior = recoveryBoundary && !priorFor(item)
      if (missingPrior && initialPlans.has(item.execution.plan.path) && !orphan) continue
      const prior = priorFor(item)
      const inspectUnrecorded = Boolean(missingPrior ||
        (recoveryBoundary && prior?.status === "queued" && !prior.writer_run))
      if (inspectUnrecorded && !orphan && !safelyUnstarted(item, { allowCurrentChild: workflows.has(item.execution.plan.path) })) continue
      const scopedPlan = inspectUnrecorded ? checkedPlan(ctx, item.execution.plan, item.execution.group_id) : null
      const scopedEvent = scopedPlan?.events.find((entry) => entry.group_id === item.execution.group_id)
      const recoveryItem = scopedEvent && partialRecoveryItem(ctx, item.execution.plan,
        item.execution.group_id, eventWorkKey(scopedEvent))
      // One native checkpoint can already contain every approved selected
      // group in this plan. Do not dispatch it again for each ranked item.
      if (workflows.get(item.execution.plan.path)?.status === "complete" && !recoverablePlans.has(item.execution.plan.path)) continue
      if (p.review_mode === "combined/v1") {
        if (!orphan && isPending(item)) continue
        if (!activeArticles.has(item.candidate_id) && activeArticles.size >= 3) continue
      }
      const plan = checkedPlan(ctx, item.execution.plan)
      const parameters = {
        run_id: childRun(item),
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
        ...(p.review_repair_mode ? { review_repair_mode: p.review_repair_mode } : {}),
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
      if (timing && p.execute === true) observe(() => observeArticleStart(timing, item.candidate_id,
        new Date().toISOString()))
      try {
        const outcome = await eventProcessor(ctx, parameters, {
          baseProvider,
          clock,
          executionWindow: window,
          unrecordedFocusMustBeUnbound: Boolean(inspectUnrecorded && !orphan && recoveryItem?.action !== "reuse"),
          expectedCurationCheckpoint: workflows.get(item.execution.plan.path)?.workflow || orphan?.checkpoint,
          parentPinnedCheckpoint: Boolean(workflows.has(item.execution.plan.path)),
          requireEmptyCurationCheckpoint: !workflows.has(item.execution.plan.path) && !orphan,
          recoverOwnedChild: Boolean(orphan),
        })
        lastOwnedItem = item
        workflows.set(item.execution.plan.path, {
          plan: item.execution.plan,
          run_id: parameters.run_id,
          status: outcome.status,
          workflow: ref(ctx.root, `event-workflows/${parameters.run_id}/latest.json`),
          publication_handoff: outcome.publication_handoff,
        })
        if (timing) {
          const checkpoint = workflows.get(item.execution.plan.path).workflow
          const snapshot = { path: `event-workflows/${parameters.run_id}/checkpoint-outcomes/${checkpoint.sha256}.json`,
            sha256: checkpoint.sha256 }
          const selected = new Map(selection.selected.filter((candidate) =>
            candidate.execution.plan.path === item.execution.plan.path)
            .map((candidate) => [candidate.execution.group_id, candidate]))
          for (const row of outcome.rows || []) {
            const candidate = selected.get(row.group_id)
            if (!candidate || !["approved", "reused"].includes(row.status)) continue
            observe(() => observeArticleApproval(timing, candidate.candidate_id, parameters.run_id,
              snapshot, new Date().toISOString()))
          }
        }
        recoverablePlans.delete(item.execution.plan.path)
        processedCandidates.add(item.candidate_id)
        if (p.review_mode === "combined/v1") {
          const focused = outcome.rows?.find((row) => row.group_id === item.execution.group_id)
          if (focused?.writer_run && !settledArticle(focused)) activeArticles.add(item.candidate_id)
          else activeArticles.delete(item.candidate_id)
        }
        handled += outcome.handled_items || 0
        writes += outcome.article_writes || 0
      } catch (error) {
        const recoverable = ownedRetry(item, error)
        if (recoverable !== error || ["STORAGE_PENDING", "REASONING_PENDING"].includes(error.code) && ownedOrphan(item))
          throw recoverable
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
    let rows = savedOutcomes.flatMap(({ workflow, value }) =>
      value.rows.flatMap((row) => {
        const item = selectedByKey.get(JSON.stringify([workflow.plan.path, row.group_id]))
        return item ? [{ ...row, origin_plan: workflow.plan, candidate_id: item.candidate_id,
          ...(blockedItems.has(item.candidate_id) ? { ...blockedItems.get(item.candidate_id), reasoning_task: undefined } : {}) }] : []
      }),
    )
    rows = rows.map((row) => {
      const item = selection.selected.find((candidate) => candidate.candidate_id === row.candidate_id)
      const blocked = checkpointBlocked.get(row.candidate_id)
      if (blocked && !processedCandidates.has(row.candidate_id))
        return { ...row, status: "frontier_inconsistent", queue_reason: blocked.queue_reason }
      if (previous && item && !processedCandidates.has(item.candidate_id) && row.status === "queued" &&
          !row.writer_run &&
          !safelyUnstarted(item, { allowCurrentChild: true }))
        return blockedItems.has(item.candidate_id) ? { ...row, ...blockedItems.get(item.candidate_id) }
          : { ...row, status: "frontier_inconsistent", queue_reason: "unrecorded_writer_or_checkpoint" }
      return row
    })
    const recorded = new Set(rows.map((row) => row.candidate_id))
    const unstartedCandidates = selection.selected.filter((item) =>
      !recorded.has(item.candidate_id) && !workflows.has(item.execution.plan.path) && safelyUnstarted(item),
    ).map((item) => item.candidate_id)
    for (const [candidateId, blocked] of blockedItems)
      if (!rows.some((row) => row.candidate_id === candidateId)) rows.push(blocked)
    rows = completeCurationFrontier(selection, rows, [...workflows.values()].map((entry) => entry.plan),
      { unstartedCandidates })
    const blockedTaskIds = new Set([...blockedItems.values()].map((row) => row.blocked_reasoning_task?.task_id).filter(Boolean))
    const reasoningTasks = outcomes.flatMap((w) => w.reasoning_tasks || [])
      .filter((task) => !blockedTaskIds.has(task.task_id))
    const finalStatus =
      errors.length || outcomes.some((w) => w.status === "partial") ||
      rows.some((row) => row.status === "frontier_inconsistent")
        ? "partial"
        : reasoningTasks.length || outcomes.some((w) => w.status === "waiting_for_reasoning")
          ? "waiting_for_reasoning"
          : selection.batches.length === workflows.size && !rows.some((row) => row.queue_reason === "batch_not_in_checkpoint") &&
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
    try { result.publication_handoff = atomicWrite(ctx.root, base + "publication-handoff.json", {
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
    }) } catch (error) { throw ownedRetry(lastOwnedItem, error) }
    result.status = errors.length ? "partial" : finalStatus
    result.failures = [...errors, ...outcomes.flatMap((w) => w.failures || [])]
    try { atomicWrite(ctx.root, base + "latest.json", result) }
    catch (error) { throw ownedRetry(lastOwnedItem, error) }
    return result
  })
}
