import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { readOperationGate } from "./operation-policy.mjs"
import { executionRepository, assertNoOperationalWriter } from "./operations-deployment.mjs"
import { pinOperationalRound, operationalBase } from "./operations-release.mjs"
import { checkedOperationalInvocation, captureManualInvocation } from "./schedule-contract.mjs"
import { loadDailyPublicationSelection } from "./daily-publication-handoff.mjs"
import { assertRetiredWorkspaceFences } from "./retired-workspace-fence.mjs"
import { loadCurationSelection } from "./curation.mjs"
import { checkedPlan, eventWorkKey, loadSelectedEvent, eventWriterBinding } from "./event-pipeline.mjs"
import { loadCurrentApproval } from "./preview.mjs"
import { restartReasoningStatus, settleReasoningForRestart } from "./reasoning-tasks.mjs"
import { assertRelayTaskQuiescent } from "./relay-ledger.mjs"

export function assertUnwrittenApprovedHandoff(ctx, state, run) {
  if (
    state?.status !== "complete" ||
    !state.edition ||
    !state.curation ||
    !state.publication_handoff ||
    state.canonical_writes !== 0 ||
    state.candidate_published !== false ||
    state.stages?.events?.status !== "complete"
  )
    throw Error("Publication recovery requires a complete approved, unwritten handoff")
  checked(ctx.root, state.publication_handoff)
  const handoff = loadDailyPublicationSelection(ctx.root, state.publication_handoff.path, {
    vault: ctx.vault,
  })
  if (
    !handoff.approvedRuns.length ||
    JSON.stringify(handoff.curation) !== JSON.stringify(state.curation)
  )
    throw Error("Publication recovery must retain its exact curated approvals")
  assertNoPublicationExecution(ctx, run)
  return state.publication_handoff
}

// A request alone has no external effects. Any release binding, execution or
// publication command beyond that request must remain on its original code.
function assertNoPublicationExecution(ctx, run) {
  const commands = safePath(ctx.root, operationalBase(run) + "commands", { materialize: false })
  const deliveries = new Set([run + "-delivery"])
  for (const name of fs.existsSync(commands) ? fs.readdirSync(commands) : []) {
    if (!name.endsWith(".json")) continue
    const command = readJSON(ctx.root, operationalBase(run) + "commands/" + name)
    if (command.stage !== "publication") continue
    if (command.operation !== "request_delivery")
      throw Error("External publication execution cannot move to another release")
    const id = command.parameters?.run_id
    if (id) deliveries.add(id)
  }
  for (const id of deliveries) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw Error("Exact delivery identity required")
    const delivery = `runs/${id}/publication-delivery/`
    for (const file of ["binding.json", "latest.json"])
      if (readJSON(ctx.root, delivery + file))
        throw Error("External publication execution cannot move to another release")
    const executions = safePath(ctx.root, delivery + "executions", { materialize: false })
    if (fs.existsSync(executions) && fs.readdirSync(executions).length)
      throw Error("External publication execution cannot move to another release")
    if (readJSON(ctx.root, `runs/${id}/publication-operation/input.json`))
      throw Error("External publication execution cannot move to another release")
  }
}

function reference(root, file) {
  return { path: file, sha256: sha256(fs.readFileSync(safePath(root, file))) }
}
function checked(root, ref) {
  if (!ref || reference(root, ref.path).sha256 !== ref.sha256)
    throw Error("Continuation evidence changed")
  return readJSON(root, ref.path)
}

export function partialRestartManifest(ctx, state, run, successor, replacementSelection) {
  const original = loadCurationSelection(ctx, state.curation)
  const selection = loadCurationSelection(ctx, replacementSelection)
  if (selection.briefing_date !== original.briefing_date ||
      (JSON.stringify(replacementSelection) !== JSON.stringify(state.curation) && !selection.identity_review))
    throw Error("A source-reviewed replacement selection for the original briefing is required")
  const selectedIds = new Set(selection.selected.map((item) => item.candidate_id))
  for (const item of original.selected)
    if (!selectedIds.has(item.candidate_id) && !selection.held.some((held) =>
      held.candidate_id === item.candidate_id && held.reason === "reviewed_same_event" &&
      selectedIds.has(held.preferred_candidate_id)))
      throw Error("Partial recovery cannot omit an original selected event without identity review")
  const seen = new Set(), items = []
  for (const item of selection.selected) {
    const plan = checkedPlan(ctx, item.execution.plan, item.execution.group_id)
    const event = plan.events.find((entry) => entry.group_id === item.execution.group_id)
    const workKey = eventWorkKey(event)
    if (seen.has(workKey)) throw Error("Partial recovery selection contains duplicate events")
    seen.add(workKey)
    const paths = [`event-plans/${plan.run_id}/selections/${event.group_id}.json`,
      `event-work/${workKey}/selection.json`]
    const original_bindings = paths.map((file) => {
      const absolute = safePath(ctx.root, file)
      return { path: file, sha256: fs.existsSync(absolute) ? sha256(fs.readFileSync(absolute)) : null }
    })
    const binding = eventWriterBinding(ctx, item.execution.plan, event, { useRecoveryScope: false })
    let writer_run = null, approval = null
    if (event.action === "reuse") {
      writer_run = event.prior?.run_id
      if (!writer_run) throw Error("Exact existing reused approval required")
      loadCurrentApproval(ctx.root, writer_run, { vault: ctx.vault })
      approval = reference(ctx.root, `runs/${writer_run}/approved-article.json`)
    } else if (binding) {
      const selected = loadSelectedEvent(ctx, { run_id: binding.writer_run,
        selection_path: binding.selection.path, selection_sha256: binding.selection.sha256 })
      if (JSON.stringify(selected.plan) !== JSON.stringify(item.execution.plan) ||
          selected.group_id !== item.execution.group_id)
        throw Error("Partial recovery writer differs from its exact selected event")
      if (readJSON(ctx.root, `runs/${binding.writer_run}/approved-article.json`)) {
        loadSelectedEvent(ctx, { run_id: binding.writer_run, selection_path: binding.selection.path,
          selection_sha256: binding.selection.sha256 }, { requireProcessed: true })
        loadCurrentApproval(ctx.root, binding.writer_run, { vault: ctx.vault })
        writer_run = binding.writer_run
        approval = reference(ctx.root, `runs/${writer_run}/approved-article.json`)
      }
    }
    items.push({ candidate_id: item.candidate_id, plan: item.execution.plan,
      group_id: item.execution.group_id, work_key: workKey,
      action: approval ? "reuse" : "restart", original_bindings,
      ...(writer_run ? { writer_run, approval } : {}) })
  }
  const pending = []
  for (const row of state.next_inputs || []) {
    const task = row.stage === "reasoning" && row.reasoning_task
    if (!task || pending.some((entry) => entry.task_id === task.task_id)) continue
    assertRelayTaskQuiescent(ctx.root, run, task.task_id)
    restartReasoningStatus(ctx.root, { ...task, expected_round: run,
      reason: `Restart ${run} as ${successor}` })
    pending.push(task)
  }
  return { schema: "research-partial-restart/v1", successor,
    parent: reference(ctx.root, operationalBase(run) + "input.json"),
    checkpoint: reference(ctx.root, `round-workflows/${run}/latest.json`),
    original_selection: state.curation, selection: replacementSelection,
    identity_review: selection.identity_review, items, settled_requests: pending }
}

function requireUnreviewedSelection(ctx, state, run) {
  if (state.event_workflow) checked(ctx.root, state.event_workflow)
  const selection = checked(ctx.root, state.curation)
  if (!Array.isArray(selection.selected) || selection.selected.length > 40)
    throw Error("Exact native selected handoff required")
  for (const item of selection.selected) {
    const plan = checked(ctx.root, item.execution?.plan)
    const group = item.execution?.group_id
    if (
      !/^[A-Za-z0-9_-]{1,100}$/.test(plan.run_id || "") ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(group || "")
    )
      throw Error("Exact native selected group required")
    const event = plan.events?.find((event) => event.group_id === group)
    if (!event) throw Error("Selected group is missing from its original plan")
    if (event.action === "reuse") continue
    const binding = readJSON(ctx.root, `event-plans/${plan.run_id}/selections/${group}.json`)
    if (!binding) continue
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(binding.writer_run || ""))
      throw Error("Exact native selected writer required")
    for (const name of ["reviewed-claims", "draft", "approved-article"])
      if (readJSON(ctx.root, `runs/${binding.writer_run}/${name}.json`))
        throw Error("Reviewed or drafted work must stay with its immutable execution")
  }
  const commands = safePath(ctx.root, operationalBase(run) + "commands", { materialize: false })
  for (const name of fs.existsSync(commands) ? fs.readdirSync(commands) : [])
    if (
      name.endsWith(".json") &&
      readJSON(ctx.root, operationalBase(run) + "commands/" + name)?.stage === "publication"
    )
      throw Error("Publication work cannot move to another execution")
  if (readJSON(ctx.root, `runs/${run}-delivery/publication-delivery/input.json`))
    throw Error("Publication work cannot move to another execution")
}

// An explicit, quiescent recovery creates a new execution segment. It never
// replaces the old immutable pin, its jobs, its workflow or scheduler claim.
export async function continueOperationalRound(
  ctx,
  { run_id, successor, reason, approved_handoff = false, restart_partial },
) {
  if (typeof approved_handoff !== "boolean")
    throw Error("Explicit boolean approved_handoff required")
  if (restart_partial && (typeof restart_partial !== "object" || Array.isArray(restart_partial) ||
      Object.keys(restart_partial).sort().join(",") !== "selection_path,selection_sha256" ||
      !/^[a-f0-9]{64}$/.test(restart_partial.selection_sha256 || "")))
    throw Error("Exact replacement selection path and SHA required")
  operationalBase(run_id)
  operationalBase(successor)
  if (run_id === successor || typeof reason !== "string" || !reason.trim() || reason.length > 1000)
    throw Error("Distinct successor and explicit continuation reason required")
  const runtime = executionRepository(ctx)
  const gate = readOperationGate(runtime)
  if (!gate.regular_execution_allowed) return { ...gate, completed: false }
  assertRetiredWorkspaceFences(runtime, ctx.repo)
  const base = operationalBase(run_id)
  return withLock(ctx.root, "operational-round-continuation", async () => withLock(ctx.root, "module-job-submit", async () => {
    const submissionOwner = readJSON(ctx.root, "locks/module-job-submit.json").owner
    assertNoOperationalWriter(ctx.repo, { researchRoot: ctx.root, ownedSubmission: submissionOwner })
    const parent = readJSON(ctx.root, base + "input.json")
    if (
      !parent ||
      parent.run_id !== run_id ||
      parent.repository !== fs.realpathSync(ctx.repo) ||
      parent.root !== fs.realpathSync(ctx.root)
    )
      throw Error("Exact original operational round required")
    const oldRuntime = parent.execution_repository || parent.repository
    const oldGate = readOperationGate(oldRuntime)
    if (!oldGate.regular_execution_allowed || oldGate.release_id !== parent.release_id)
      throw Error("Original immutable execution evidence is invalid")
    for (const ref of [parent.completion, parent.manifest, parent.policy, parent.installation])
      checked(oldRuntime, ref)
    const originalInvocation = checkedOperationalInvocation(ctx, parent.invocation)
    // Recovery never changes an existing pin. A frozen selected handoff may
    // start a separate manual segment; its original jobs and reviews stay put.
    const workflow = readJSON(ctx.root, `round-workflows/${run_id}/input.json`)
    const state = readJSON(ctx.root, `round-workflows/${run_id}/latest.json`)
    const failedCollection = state?.status === "partial" && !state.edition && !state.curation &&
      !state.event_workflow && !state.publication_handoff && state.article_writes === 0 &&
      state.canonical_writes === 0 && state.candidate_published === false &&
      state.stages?.collection?.status === "failed" && state.stages.collection.reference &&
      Array.isArray(state.next_inputs) && state.next_inputs.length > 0 &&
      state.next_inputs.every((item) => item.stage === "collection" && item.required?.includes("resume"))
    if (failedCollection) {
      const report = checked(ctx.root, state.stages.collection.reference)
      if (report.schema !== "research-collection-report/v1" || report.status !== "partial" ||
          report.daily_run !== workflow?.source?.daily_run || report.candidate_approved !== false ||
          report.candidate_published !== false)
        throw Error("Exact preserved failed-collection report required")
      const commandDir = safePath(ctx.root, base + "commands", { materialize: false })
      const commands = fs.existsSync(commandDir) ? fs.readdirSync(commandDir).filter((name) => name.endsWith(".json")) : []
      if (commands.some((name) => readJSON(ctx.root, base + "commands/" + name)?.stage !== "collection"))
        throw Error("Failed collection continuation cannot supersede later operational work")
    }
    const collectionOnly =
      (["collection_pending", "collection_planned"].includes(state?.status) && !state.edition) || failedCollection
    const frozenHandoff =
      state?.status === "collection_frozen" && workflow?.source?.kind === "daily" &&
      state.edition && !state.curation && !state.plan && !state.event_workflow &&
      !state.publication_handoff && state.article_writes === 0 && state.canonical_writes === 0 &&
      state.candidate_published === false
    if (frozenHandoff) {
      const edition = checked(ctx.root, state.edition)
      const report = checked(ctx.root, state.stages?.collection?.reference)
      if (edition.schema !== "research-edition-materials/v1" || edition.daily_run !== workflow.source.daily_run ||
          edition.candidate_approved !== false || edition.candidate_published !== false ||
          JSON.stringify(edition.report) !== JSON.stringify(state.stages.collection.reference) ||
          JSON.stringify(state.stages?.edition?.reference) !== JSON.stringify(state.edition) ||
          state.stages?.edition?.status !== "frozen" || report.schema !== "research-collection-report/v1" ||
          report.daily_run !== workflow.source.daily_run || report.candidate_approved !== false ||
          report.candidate_published !== false || !["partial", "complete"].includes(report.status) ||
          edition.status !== report.status || state.stages.collection.status !== report.status ||
          report.counts?.pending_windows !== 0)
        throw Error("Exact frozen collection edition and report required")
      const commandDir = safePath(ctx.root, base + "commands", { materialize: false })
      const commands = fs.existsSync(commandDir) ? fs.readdirSync(commandDir).filter((name) => name.endsWith(".json")) : []
      if (commands.some((name) => readJSON(ctx.root, base + "commands/" + name)?.stage !== "collection"))
        throw Error("Frozen collection continuation cannot supersede later operational work")
    }
    const selectedHandoff =
      ["curation_ready", "waiting_for_reasoning"].includes(state?.status) &&
      state.edition &&
      state.curation &&
      state.article_writes === 0 &&
      state.canonical_writes === 0 &&
      state.candidate_published === false
    const approvedHandoff =
      approved_handoff === true ? assertUnwrittenApprovedHandoff(ctx, state, run_id) : null
    const partialHandoff = restart_partial && state?.status === "partial" && state.edition && state.curation &&
      state.event_workflow && state.canonical_writes === 0 && state.candidate_published === false
    if (restart_partial && (!partialHandoff || approved_handoff))
      throw Error("Partial restart requires an unpublished, selected partial round")
    if (partialHandoff) {
      checked(ctx.root, state.event_workflow)
      assertNoPublicationExecution(ctx, run_id)
    }
    if (
      (!selectedHandoff && !frozenHandoff &&
        !approvedHandoff && !partialHandoff &&
        (!collectionOnly || workflow?.source?.kind !== "daily")) ||
      (collectionOnly && (state.event_workflow || state.publication_handoff))
    )
      throw Error(
        "Continuation requires a settled collection checkpoint or an unwritten selected handoff",
      )
    if (state.input_sha256 !== sha256(JSON.stringify(workflow)))
      throw Error("Original workflow input changed")
    let origin = workflow,
      originPin = parent,
      depth = 0
    while (origin.source?.kind !== "daily") {
      if (++depth > 8 || !originPin.continuation)
        throw Error("Exact original daily lineage required")
      const link = checked(ctx.root, originPin.continuation)
      origin = checked(ctx.root, link.workflow)
      originPin = checked(ctx.root, link.parent)
      if (partialHandoff) assertNoPublicationExecution(ctx, originPin.run_id)
    }
    const config = reference(ctx.repo, origin.collection_config.path)
    if (config.sha256 !== origin.collection_config.sha256)
      throw Error("Collection configuration changed; explicit replan required")
    if (
      reference(ctx.repo, "data/research-model-policy-codex.json").sha256 !== workflow.policy.sha256
    )
      throw Error("Collection model policy changed")
    const processing =
      selectedHandoff || frozenHandoff || approvedHandoff || partialHandoff
        ? {
            edition: state.edition,
            ...(state.curation ? { curation: partialHandoff
              ? { path: restart_partial.selection_path, sha256: restart_partial.selection_sha256 }
              : state.curation } : {}),
            ...(state.plan ? { plan: state.plan } : {}),
          }
        : null
    if (processing) for (const ref of Object.values(processing)) checked(ctx.root, ref)
    if (processing) {
      if (checked(ctx.root, state.edition).daily_run !== origin.source.daily_run)
        throw Error("Selected handoff belongs to another daily collection")
      if (selectedHandoff && !approvedHandoff) requireUnreviewedSelection(ctx, state, run_id)
    }
    const existingLink = readJSON(ctx.root, base + "continuation.json")
    if (existingLink && (existingLink.successor !== successor || existingLink.reason !== reason))
      throw Error("Round already has another continuation")
    let restartRef = null, restart = null
    if (partialHandoff) {
      restart = partialRestartManifest(ctx, state, run_id, successor, processing.curation)
      const manifestPath = base + `partial-restarts/${successor}.json`
      const existing = readJSON(ctx.root, manifestPath)
      if (existing && JSON.stringify(existing) !== JSON.stringify(restart))
        throw Error("Partial recovery manifest changed")
      if (!existing) atomicCreate(ctx.root, manifestPath, restart)
      restartRef = reference(ctx.root, manifestPath)
    }
    const evidenceFile = base + "continuation-evidence.json"
    const source = {
      parent: reference(ctx.root, base + "input.json"),
      workflow: reference(ctx.root, `round-workflows/${run_id}/input.json`),
      checkpoint: reference(ctx.root, `round-workflows/${run_id}/latest.json`),
      ...(failedCollection ? { failed_collection_report: state.stages.collection.reference } : {}),
      invocation: parent.invocation,
      daily_run: origin.source.daily_run,
      ...(processing ? { processing } : {}),
      ...(approvedHandoff ? { approved_handoff: approvedHandoff } : {}),
      ...(restartRef ? { partial_restart: restartRef } : {}),
      prior_release: parent.release_id,
      release_id: gate.release_id,
      successor,
      reason,
    }
    if (!readJSON(ctx.root, evidenceFile))
      atomicCreate(ctx.root, evidenceFile, {
        schema: "research-operational-continuation/v1",
        ...source,
      })
    const evidence = reference(ctx.root, evidenceFile)
    const saved = checked(ctx.root, evidence)
    for (const key of Object.keys(source))
      if (JSON.stringify(saved[key]) !== JSON.stringify(source[key]))
        throw Error("Continuation source changed")
    // Retire the original requests before any successor pin can be driven.
    // The manifest and original requests are immutable, so a partial failure
    // can safely repeat the remaining retirements on the next continue call.
    if (restart) for (const task of restart.settled_requests)
      await settleReasoningForRestart(ctx.root, { ...task, expected_round: run_id,
        reason: `Restart ${run_id} as ${successor}` })
    const invocation = captureManualInvocation(ctx, {
      execution_id: successor,
      reason: `Continue ${run_id}: ${reason}`.slice(0, 1000),
    })
    const pinned = await pinOperationalRound(ctx, {
      run_id: successor,
      invocation_path: invocation.path,
      invocation_sha256: invocation.sha256,
      continuation: evidence,
    })
    if (pinned.status !== "pinned") return pinned
    const link = {
      schema: "research-operational-continuation-link/v1",
      successor,
      reason,
      evidence,
      successor_pin: reference(ctx.root, operationalBase(successor) + "input.json"),
      original_invocation_kind: originalInvocation.kind,
      scheduled_runs_counted: 0,
    }
    if (!existingLink) atomicCreate(ctx.root, base + "continuation.json", link)
    else if (JSON.stringify(existingLink) !== JSON.stringify(link))
      throw Error("Continuation link changed")
    return {
      status: "continuation_ready",
      original_round: run_id,
      run_id: successor,
      daily_run: source.daily_run,
      source: evidence,
      scheduled_runs_counted: 0,
      next_command: [
        "node",
        "scripts/research-operations.mjs",
        "drive",
        "--round",
        successor,
        "--json",
        JSON.stringify({
          parameters: processing
            ? {
                ...Object.fromEntries(
                  Object.entries(processing).flatMap(([name, ref]) => [
                    [name + "_path", ref.path],
                    [name + "_sha256", ref.sha256],
                  ]),
                ),
                ...(processing.curation || processing.plan ? { propose: false } : {}),
              }
            : {
                daily_run: source.daily_run,
                collection_max_windows: 6,
                collection_time_budget_ms: 300000,
              },
        }),
      ],
    }
  }))
}
