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

// A reviewed relationship plan can move only before selection, article or
// external publication work. The earlier proposal handoff is diagnostic;
// it is not an approved publication and must remain tied to its exact bytes.
export function curationRequiredRestart(ctx, state, run, successor) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  const next = state.next_inputs
  if (
    state.status !== "curation_required" || !state.edition || !state.plan || state.curation ||
    !state.event_workflow || !state.publication_handoff || state.article_writes !== 0 ||
    state.canonical_writes !== 0 || state.candidate_published !== false ||
    state.stages?.curation?.status !== "curation_required" ||
    !same(state.stages.curation.plan, state.plan) ||
    !same(state.stages?.edition?.reference, state.edition) ||
    state.stages.edition.status !== "frozen" ||
    !same(state.stages?.events?.reference, state.event_workflow) ||
    state.stages.events.status !== "relationship_review" ||
    !same(state.stages?.publication?.reference, state.publication_handoff) ||
    state.stages.publication.status !== "relationship_review" ||
    !Array.isArray(next) || next.length !== 1 || next[0].stage !== "curation" ||
    next[0].module !== "curation" || next[0].operation !== "prepare" ||
    !same(next[0].plans, [state.plan]) || !Array.isArray(next[0].required) ||
    !["briefing_date", "reviewed_scores", "curation_path", "curation_sha256"].every(
      (name) => next[0].required.includes(name),
    )
  ) throw Error("Exact unwritten curation-required continuation required")
  assertNoPublicationExecution(ctx, run)
  if (readJSON(ctx.root, `round-workflows/${run}/curation.json`))
    throw Error("Curation continuation already has a saved selection")
  const parent = readJSON(ctx.root, operationalBase(run) + "input.json")
  const commandBase = operationalBase(run) + "commands/"
  const commandDir = safePath(ctx.root, commandBase, { materialize: false })
  const jobs = []
  for (const name of (fs.existsSync(commandDir) ? fs.readdirSync(commandDir) : []).sort()) {
    if (!name.endsWith(".json")) continue
    const command = readJSON(ctx.root, commandBase + name)
    if (!["collection", "processing"].includes(command?.stage) ||
        !/^module-[A-Za-z0-9_-]{1,100}$/.test(command.job_id || ""))
      throw Error("Curation continuation contains other operational work")
    const jobBase = `module-jobs/${command.job_id}/`
    const input = readJSON(ctx.root, jobBase + "input.json")
    const job = readJSON(ctx.root, jobBase + "state.json")
    if (!input || !job || job.state !== "completed" || job.job_id !== command.job_id ||
        input.job_id !== command.job_id || job.input_sha256 !== sha256(JSON.stringify(input)) ||
        input.context?.operationalRound?.round_id !== run ||
        input.context.operationalRound.round_input_sha256 !== sha256(JSON.stringify(parent)) ||
        input.module !== command.module || input.operation !== command.operation ||
        !same(input.parameters, command.parameters) || job.result?.path !== jobBase + "result.json")
      throw Error("Curation continuation requires completed owned jobs")
    assertStoppedProcess(job.pid, "Curation continuation worker")
    checked(ctx.root, job.result)
    jobs.push({ command: reference(ctx.root, commandBase + name),
      input: reference(ctx.root, jobBase + "input.json"),
      state: reference(ctx.root, jobBase + "state.json"), result: job.result })
  }
  const plan = checkedPlan(ctx, state.plan)
  const edition = checked(ctx.root, state.edition)
  const reportRef = state.stages?.collection?.reference
  const report = checked(ctx.root, reportRef)
  const events = checked(ctx.root, state.event_workflow)
  const handoff = checked(ctx.root, state.publication_handoff)
  const snapshot = handoff?.workflow?.snapshot
  const captured = checked(ctx.root, snapshot)
  if (
    !same(plan.edition, state.edition) || !same(edition.report, reportRef) ||
    edition.schema !== "research-edition-materials/v1" ||
    report.schema !== "research-collection-report/v1" ||
    edition.daily_run !== report.daily_run || edition.status !== report.status ||
    !["partial", "complete"].includes(report.status) || report.counts?.pending_windows !== 0 ||
    edition.candidate_approved !== false || edition.candidate_published !== false ||
    report.candidate_approved !== false || report.candidate_published !== false ||
    state.stages.collection.status !== report.status ||
    events.schema !== "research-event-workflow/v1" || events.status !== "relationship_review" ||
    !same(events.edition, state.edition) || events.article_writes !== 0 ||
    events.candidate_published !== false || !same(events, captured) ||
    handoff.schema !== "research-daily-publication-handoff/v3" ||
    handoff.status !== "relationship_review" || handoff.workflow_status !== "relationship_review" ||
    !same(handoff.workflow?.source, state.event_workflow) ||
    snapshot.sha256 !== state.event_workflow.sha256 || !same(handoff.edition, state.edition) ||
    handoff.plan !== null || !Array.isArray(handoff.approved_runs) || handoff.approved_runs.length ||
    !Array.isArray(handoff.reused_runs) || handoff.reused_runs.length ||
    handoff.candidate_published !== false || handoff.drive_verified !== false ||
    handoff.public_verified !== false
  ) throw Error("Curation continuation source evidence changed")
  return {
    schema: "research-curation-required-restart/v1", successor,
    parent: reference(ctx.root, operationalBase(run) + "input.json"),
    checkpoint: reference(ctx.root, `round-workflows/${run}/latest.json`),
    edition: state.edition, report: reportRef, plan: state.plan, review: plan.review,
    event_workflow: state.event_workflow, publication_handoff: state.publication_handoff,
    event_snapshot: snapshot, jobs,
  }
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

function assertStoppedProcess(pid, description) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw Error(description + " status is unknown")
  try {
    process.kill(pid, 0)
  } catch (error) {
    if (error.code === "ESRCH") return
    throw Error(description + " status is unknown")
  }
  throw Error(description + " is still alive")
}

// Only an unconsumed, stopped event-proposal request can be replaced when a
// frozen edition moves to a new release. Completed responses stay on the old
// job; previously completed content-addressed proposal results remain reusable.
function pendingEventProposalRestart(ctx, state, run, successor, base) {
  const rows = state.next_inputs
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].stage !== "reasoning")
    throw Error("Exactly one pending event proposal is required for this continuation")
  const task = rows[0].reasoning_task
  if (
    !task ||
    !/^reasoning-[a-f0-9]{64}$/.test(task.task_id || "") ||
    !/^[a-f0-9]{64}$/.test(task.request_sha256 || "") ||
    JSON.stringify(task) !== JSON.stringify(state.stages?.events?.reasoning_task)
  )
    throw Error("Exact pending event proposal request required")
  const retirementReason = `Restart ${run} as ${successor}`
  const requestStatus = restartReasoningStatus(ctx.root, {
    ...task,
    expected_round: run,
    reason: retirementReason,
  })
  if (!["pending", "retired"].includes(requestStatus.status))
    throw Error("Completed event proposal must remain with its original round")
  const requestPath = `reasoning-tasks/${task.task_id}/request.json`
  const request = readJSON(ctx.root, requestPath)
  if (
    request?.owner?.round_id !== run ||
    !/^ev-prop-[a-f0-9]{40}$/.test(request.run || "") ||
    request.role !== "search_plan" ||
    !request.input?.schema?.properties?.events
  )
    throw Error("Only the original source-bound event proposal can be restarted")
  assertRelayTaskQuiescent(ctx.root, run, task.task_id)
  const jobId = request.owner.job_id
  const inputPath = `module-jobs/${jobId}/input.json`
  const statePath = `module-jobs/${jobId}/state.json`
  const jobInput = readJSON(ctx.root, inputPath)
  const jobState = readJSON(ctx.root, statePath)
  if (
    jobInput?.module !== "edition" ||
    jobInput.operation !== "advance" ||
    jobInput.parameters?.run_id !== run ||
    jobInput.parameters.round !== true ||
    jobInput.parameters.collect !== false ||
    jobInput.parameters.propose !== true ||
    jobInput.parameters.plan_path || jobInput.parameters.curation_path ||
    jobInput.context?.operationalRound?.round_id !== run ||
    jobInput.context.operationalRound.round_input_sha256 !== request.owner.round_input_sha256 ||
    jobState?.state !== "waiting_for_reasoning" ||
    JSON.stringify(jobState.reasoning_task) !== JSON.stringify(task)
  )
    throw Error("Exact stopped proposal owner job required")
  assertStoppedProcess(jobState.pid, "Proposal worker")
  const commandDir = safePath(ctx.root, base + "commands", { materialize: false })
  const commands = fs.existsSync(commandDir)
    ? fs.readdirSync(commandDir).filter((name) => name.endsWith(".json"))
        .map((name) => readJSON(ctx.root, base + "commands/" + name))
    : []
  const processing = commands.filter((command) => command?.stage === "processing")
  if (
    commands.some((command) => !["collection", "processing"].includes(command?.stage)) ||
    processing.length !== 1 ||
    processing[0].job_id !== jobId ||
    processing[0].module !== "edition" ||
    processing[0].operation !== "advance" ||
    JSON.stringify(processing[0].parameters) !== JSON.stringify(jobInput.parameters) ||
    commands.some((command) => command.job_id !== jobId &&
      readJSON(ctx.root, `module-jobs/${command.job_id}/state.json`)?.state === "waiting_for_reasoning")
  )
    throw Error("Proposal continuation cannot supersede other operational work")
  for (const command of commands.filter((row) => row.stage === "collection")) {
    const prior = readJSON(ctx.root, `module-jobs/${command.job_id}/state.json`)
    if (!prior || !["completed", "failed"].includes(prior.state))
      throw Error("Collection job is not settled for proposal continuation")
    assertStoppedProcess(prior.pid, "Collection worker")
  }
  assertNoPublicationExecution(ctx, run)
  return {
    task,
    owner: request.owner,
    request: reference(ctx.root, requestPath),
    job_input: reference(ctx.root, inputPath),
    job_state: reference(ctx.root, statePath),
    retirement_reason: retirementReason,
  }
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
    const pendingProposal =
      state?.status === "waiting_for_reasoning" && !state.curation && !state.plan &&
      !state.event_workflow && !state.publication_handoff &&
      state.stages?.events?.status === "waiting_for_reasoning"
    const frozenHandoff =
      (state?.status === "collection_frozen" || pendingProposal) && workflow?.source?.kind === "daily" &&
      state.edition && !state.curation && !state.plan && !state.event_workflow &&
      !state.publication_handoff && state.article_writes === 0 && state.canonical_writes === 0 &&
      state.candidate_published === false
    let proposalRestart = null
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
      if (pendingProposal) {
        if (approved_handoff || restart_partial)
          throw Error("Event proposal restart cannot use another handoff mode")
        proposalRestart = pendingEventProposalRestart(ctx, state, run_id, successor, base)
      } else {
        const commandDir = safePath(ctx.root, base + "commands", { materialize: false })
        const commands = fs.existsSync(commandDir) ? fs.readdirSync(commandDir).filter((name) => name.endsWith(".json")) : []
        if (commands.some((name) => readJSON(ctx.root, base + "commands/" + name)?.stage !== "collection"))
          throw Error("Frozen collection continuation cannot supersede later operational work")
      }
    }
    const selectedHandoff =
      ["curation_ready", "waiting_for_reasoning"].includes(state?.status) &&
      state.edition &&
      state.curation &&
      state.article_writes === 0 &&
      state.canonical_writes === 0 &&
      state.candidate_published === false
    const curationHandoff = state?.status === "curation_required" && !approved_handoff &&
      !restart_partial ? curationRequiredRestart(ctx, state, run_id, successor) : null
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
      (!selectedHandoff && !frozenHandoff && !curationHandoff &&
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
      selectedHandoff || frozenHandoff || approvedHandoff || partialHandoff || curationHandoff
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
    let restartRef = null, restart = null, curationRestartRef = null
    if (curationHandoff) {
      const manifestPath = base + `curation-restarts/${successor}.json`
      const existing = readJSON(ctx.root, manifestPath)
      if (existing && JSON.stringify(existing) !== JSON.stringify(curationHandoff))
        throw Error("Curation continuation evidence changed")
      if (!existing) atomicCreate(ctx.root, manifestPath, curationHandoff)
      curationRestartRef = reference(ctx.root, manifestPath)
    }
    if (partialHandoff) {
      restart = partialRestartManifest(ctx, state, run_id, successor, processing.curation)
      const manifestPath = base + `partial-restarts/${successor}.json`
      const existing = readJSON(ctx.root, manifestPath)
      if (existing && JSON.stringify(existing) !== JSON.stringify(restart))
        throw Error("Partial recovery manifest changed")
      if (!existing) atomicCreate(ctx.root, manifestPath, restart)
      restartRef = reference(ctx.root, manifestPath)
    }
    let proposalRestartRef = null, proposalRetirementRef = null
    if (proposalRestart) {
      const manifestPath = base + `proposal-restarts/${successor}.json`
      const proposal = {
        schema: "research-event-proposal-restart/v1",
        successor,
        parent: reference(ctx.root, base + "input.json"),
        checkpoint: reference(ctx.root, `round-workflows/${run_id}/latest.json`),
        edition: state.edition,
        collection_report: state.stages.collection.reference,
        ...proposalRestart,
      }
      const existing = readJSON(ctx.root, manifestPath)
      if (existing && JSON.stringify(existing) !== JSON.stringify(proposal))
        throw Error("Event proposal restart evidence changed")
      if (!existing) atomicCreate(ctx.root, manifestPath, proposal)
      proposalRestartRef = reference(ctx.root, manifestPath)
      const settled = await settleReasoningForRestart(ctx.root, {
        ...proposalRestart.task,
        expected_round: run_id,
        reason: proposalRestart.retirement_reason,
      })
      if (settled.status !== "retired")
        throw Error("Completed event proposal must remain with its original round")
      proposalRetirementRef = reference(
        ctx.root,
        `reasoning-tasks/${proposalRestart.task.task_id}/retired.json`,
      )
      if (reference(ctx.root, `round-workflows/${run_id}/latest.json`).sha256 !== proposal.checkpoint.sha256)
        throw Error("Event proposal checkpoint changed during continuation")
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
      ...(curationRestartRef ? { curation_restart: curationRestartRef } : {}),
      ...(proposalRestartRef ? { proposal_restart: proposalRestartRef } : {}),
      ...(proposalRetirementRef ? { proposal_retirement: proposalRetirementRef } : {}),
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
