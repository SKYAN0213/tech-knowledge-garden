import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { readOperationGate, moduleRecoveryPlan } from "./operation-policy.mjs"
import {
  pinOperationalRound,
  inspectOperationalPin,
  operationalBase,
} from "./operations-release.mjs"
import { moduleJobStatus, submitModuleJob, resumeModuleJob } from "./module-runtime.mjs"
import { reasoningTasks, reasoningFrontier, submitReasoningBatch, readyArticleItems } from "./reasoning-tasks.mjs"
import { summarizeStageTiming, recordOperationalJobTiming } from "./operations-timing.mjs"
import { executionRepository } from "./operations-deployment.mjs"
import { checkedOperationalInvocation } from "./schedule-contract.mjs"
import { assertUnwrittenApprovedHandoff } from "./operations-continuation.mjs"
import { verifyRelayHistory } from "./relay-ledger.mjs"
import { assertRetiredWorkspaceFences } from "./retired-workspace-fence.mjs"
import { completeCurationFrontier } from "./curation.mjs"
import { withReadOnlyStorageReads } from "./cold-storage.mjs"
import { assertPartialRestartSettled } from "./replacement-scope.mjs"

// Read the pinned selection and child checkpoints only. This is a status
// projection, not native approval verification or permission to execute.
export function auditCurationFrontier(root, selectionRef, workflowRef) {
  return withReadOnlyStorageReads(() => auditCurationFrontierNative(root, selectionRef, workflowRef))
}

function auditCurationFrontierNative(root, selectionRef, workflowRef) {
  const refs = []
  const checked = (ref) => {
    if (!ref || !/^[a-f0-9]{64}$/.test(ref.sha256 || "")) throw Error("Exact frontier evidence required")
    const bytes = fs.readFileSync(safePath(root, ref.path))
    if (sha256(bytes) !== ref.sha256) throw Error("Curation frontier evidence changed")
    refs.push(ref)
    return JSON.parse(bytes)
  }
  const selection = checked(selectionRef), workflow = checked(workflowRef)
  if (selection.schema !== "research-curation-selection/v1" || !Array.isArray(selection.selected) ||
      workflow.schema !== "research-curation-workflow/v1" ||
      JSON.stringify(workflow.selection) !== JSON.stringify(selectionRef) || !Array.isArray(workflow.workflows))
    throw Error("Exact selected curation workflow required for frontier audit")
  const selected = new Map(selection.selected.map((item) =>
    [JSON.stringify([item.execution.plan, item.execution.group_id]), item]))
  const plans = [], rows = []
  for (const entry of workflow.workflows) {
    const child = checked(entry.workflow)
    if (child.schema !== "research-event-workflow/v1" || child.run_id !== entry.run_id ||
        JSON.stringify(child.plan) !== JSON.stringify(entry.plan) ||
        JSON.stringify(child.curation) !== JSON.stringify(selectionRef) || !Array.isArray(child.rows))
      throw Error("Curation frontier child binding changed")
    plans.push(entry.plan)
    for (const row of child.rows) {
      const item = selected.get(JSON.stringify([entry.plan, row.group_id]))
      if (item) rows.push({ ...row, candidate_id: item.candidate_id, origin_plan: entry.plan })
    }
  }
  const frontier = completeCurationFrontier(selection, rows, plans)
  const missing = frontier.filter((row) => row.queue_reason)
  for (const ref of refs)
    if (sha256(fs.readFileSync(safePath(root, ref.path))) !== ref.sha256)
      throw Error("Curation frontier evidence changed during audit")
  return { verification: "pinned_hashes_only", selected: selection.selected.length,
    recorded: selection.selected.length - missing.length,
    missing: missing.map(({ candidate_id, group_id, origin_plan, status, queue_reason }) =>
      ({ candidate_id, group_id, origin_plan, status, queue_reason })) }
}

function auditForeignJob(ctx, id, status) {
  const state = readJSON(ctx.root, `module-jobs/${id}/state.json`)
  const launch = readJSON(ctx.root, `module-jobs/${id}/launch.json`)
  const lock = readJSON(ctx.root, `locks/module-worker-${id}.json`)
  const validPid = (pid) => Number.isSafeInteger(pid) && pid > 0
  const pids = [...new Set([state?.pid, launch?.pid, lock?.pid].filter(validPid))]
  const unknown = () => {
    const value = { ...status, state: "worker_status_unknown", worker_alive: null, resume_available: false }
    return { ...value, recovery: moduleRecoveryPlan(value) }
  }
  if (["queued", "running", "finishing"].includes(state?.state) &&
      (!Number.isSafeInteger(state.attempt) || launch?.attempt !== state.attempt)) return unknown()
  if (status.worker_alive !== false) return status
  if ((["queued", "running", "finishing"].includes(state?.state) && !pids.length) ||
      (lock && !validPid(lock.pid))) return unknown()
  for (const pid of pids) {
    try {
      process.kill(pid, 0)
      return unknown()
    } catch (error) {
      if (error.code !== "ESRCH") return unknown()
    }
  }
  return status
}

export function operationalRoundStatus(ctx, run, { readOnly = false } = {}) {
  return readOnly
    ? withReadOnlyStorageReads(() => operationalRoundStatusNative(ctx, run, { readOnly }))
    : operationalRoundStatusNative(ctx, run, { readOnly })
}

function operationalRoundStatusNative(ctx, run, { readOnly = false } = {}) {
  const base = operationalBase(run)
  const input = readJSON(ctx.root, base + "input.json")
  if (!input)
    return { status: "not_started", operation_gate: readOperationGate(executionRepository(ctx)) }
  inspectOperationalPin(ctx, run, { readOnly })
  const foreign = readOnly && fs.realpathSync(input.execution_repository || input.repository) !==
    fs.realpathSync(executionRepository(ctx))
  const directory = safePath(ctx.root, base + "commands", { materialize: false })
  const commands = fs.existsSync(directory)
    ? fs
        .readdirSync(directory)
        .filter((file) => /^[a-f0-9]{64}\.json$/.test(file))
        .sort()
        .map((file) => {
          const command = readJSON(ctx.root, base + "commands/" + file)
          const identity = {
            stage: command.stage,
            module: command.module,
            operation: command.operation,
            parameters: command.parameters,
            ...(command.continuation ? { continuation: command.continuation } : {}),
          }
          const digest = sha256(JSON.stringify(identity))
          if (
            file !== digest + ".json" ||
            command.job_id !== "module-operation-" + digest.slice(0, 48)
          )
            throw Error("Operational command identity changed")
          if (command.continuation) {
            for (const ref of [
              command.continuation.checkpoint,
              command.continuation.previous_job.result,
            ])
              if (sha256(fs.readFileSync(safePath(ctx.root, ref.path))) !== ref.sha256)
                throw Error("Operational continuation evidence changed")
          }
          const submitted = readJSON(ctx.root, `module-jobs/${command.job_id}/input.json`)
          return {
            ...command,
            job: submitted
              ? foreign ? auditForeignJob(ctx, command.job_id, moduleJobStatus(ctx, command.job_id))
                : moduleJobStatus(ctx, command.job_id)
              : {
                  job_id: command.job_id,
                  state: "not_submitted",
                  worker_alive: false,
                },
          }
        })
        .sort((a, b) => (a.submitted_at || "").localeCompare(b.submitted_at || ""))
    : []
  const round = readJSON(ctx.root, `round-workflows/${run}/latest.json`)
  if (readOnly && round) {
    const workflowInput = readJSON(ctx.root, `round-workflows/${run}/input.json`)
    if (!workflowInput || round.input_sha256 !== sha256(JSON.stringify(workflowInput)))
      throw Error("Read-only round workflow input changed")
  }
  const frontier = readOnly && foreign && round?.curation && round.stages?.events?.reference
    ? auditCurationFrontier(ctx.root, round.curation, round.stages.events.reference) : null
  return {
    schema: "research-operational-status/v1",
    status: round?.status || commands.at(-1)?.job.state || "pinned",
    run_id: run,
    release_id: input.release_id,
    ...(readOnly ? { audit_only: true,
      execution_readiness: foreign ? "requires_explicit_continuation" : "not_checked" } : {}),
    ...(frontier ? { curation_frontier: frontier } : {}),
    started_at: input.started_at,
    ...(input.continuation ? { continuation: input.continuation } : {}),
    stages: round?.stages || {},
    next_inputs: round?.next_inputs || [],
    ...(input.review_mode === "combined/v1"
      ? {
          ready_items: readyArticleItems(ctx.root, round?.next_inputs || [], { round_id: run }),
        }
      : {}),
    controller: readJSON(ctx.root, base + "controller.json"),
    commands,
    pending_reasoning: input.review_mode === "combined/v1"
      ? reasoningFrontier(ctx.root, { round_id: run, rows: round?.next_inputs || [], limit: 3 })
      : reasoningTasks(ctx.root, { round_id: run, limit: 3 }),
    ...(input.relay_provenance === "v1" ? { relay: {
      policy: "v1", scope: "owned_article_requests", max_parallel_models: 3,
      attribution: "caller_declared", host_authenticated: false,
      observe_operation: "reasoning.relay_observe", assign_operation: "reasoning.relay_assign",
      exit_operation: "reasoning.relay_exit", submission_field: "relay_assignment",
    } } : {}),
    timing: {
      stages: summarizeStageTiming(commands),
      native_elapsed_ms: commands.reduce((n, c) => n + (c.job.elapsed_ms || 0), 0),
      control_wait_reduction: null,
      acceptance: "fixed_input_replay_required",
    },
    operational_acceptance: "unverified",
    scheduled_runs_counted: 0,
  }
}

// This controller submits existing module jobs; it never reimplements a native
// schema, approval, publisher, Drive transfer or recovery validator.
export async function runOperationalRound(
  ctx,
  p,
  { resume = false, background = true, expectedJobId, submit = submitModuleJob, resumeJob = resumeModuleJob } = {},
) {
  const started = performance.now()
  const pinned = await pinOperationalRound(ctx, p)
  if (pinned.status !== "pinned") return pinned
  const run = p.run_id,
    base = operationalBase(run)
  assertPartialRestartSettled({ ...ctx, operationalRound: { round_id: run,
    round_input_sha256: sha256(JSON.stringify(pinned.input)) } })
  const savedRound = readJSON(ctx.root, `round-workflows/${run}/latest.json`)
  p = {
    ...p,
    stage:
      p.stage ||
      (savedRound?.publication_handoff && savedRound?.stages?.events?.status === "complete"
        ? "publication"
        : savedRound?.edition
          ? "processing"
          : "collection"),
  }
  if (!["collection", "processing", "publication"].includes(p.stage))
    throw Error("Exact operational stage required")
  return withLock(ctx.root, "operations-control-" + run, async () => {
    const status = operationalRoundStatus(ctx, run)
    if (status.commands.some((c) => c.job.worker_alive !== false))
      throw Error("Active or unknown round writer; inspect its existing job")
    const round = readJSON(ctx.root, `round-workflows/${run}/latest.json`)
    if (p.stage !== "collection" && !round?.edition)
      throw Error("Processing requires an immutable collection handoff")
    const module = p.stage === "publication" ? "publication" : "edition"
    let prior =
      resume && !p.parameters ? status.commands.filter((c) => c.stage === p.stage).at(-1) : null
    let continuation = prior?.continuation
    if (prior?.job.state === "completed") {
      const checkpointPath = `round-workflows/${run}/latest.json`
      const bytes = fs.readFileSync(safePath(ctx.root, checkpointPath))
      const digest = sha256(bytes)
      if (prior.continuation?.checkpoint.sha256 === digest)
        return {
          status: "no_progress",
          run_id: run,
          job: prior.job,
          reason: "Completed command did not advance its checkpoint; inspect native next_inputs",
        }
      const snapshotPath = base + "checkpoints/" + digest + ".json"
      if (!readJSON(ctx.root, snapshotPath)) atomicCreate(ctx.root, snapshotPath, bytes)
      if (sha256(fs.readFileSync(safePath(ctx.root, snapshotPath))) !== digest)
        throw Error("Operational continuation checkpoint changed")
      const result = prior.job.result
      if (!result || sha256(fs.readFileSync(safePath(ctx.root, result.path))) !== result.sha256)
        throw Error("Completed operational result changed")
      continuation = {
        checkpoint: { path: snapshotPath, sha256: digest },
        previous_job: { job_id: prior.job_id, result },
      }
    }
    const operation =
      prior?.operation ||
      (p.stage === "publication" ? p.operation || "request_delivery" : "advance")
    if (
      module === "publication" &&
      !["request_delivery", "deliver", "delivery_receipt"].includes(operation)
    )
      throw Error("Unsupported publication transition")
    const supplied = p.parameters || {}
    const recovery = pinned.input.continuation && readJSON(ctx.root, pinned.input.continuation.path)
    if (recovery?.approved_handoff && module === "edition") {
      const checkpoint = readJSON(ctx.root, recovery.checkpoint.path)
      if (
        sha256(fs.readFileSync(safePath(ctx.root, recovery.checkpoint.path))) !==
        recovery.checkpoint.sha256
      )
        throw Error("Approved publication recovery checkpoint changed")
      assertUnwrittenApprovedHandoff(
        ctx,
        checkpoint,
        readJSON(ctx.root, recovery.parent.path).run_id,
      )
    }
    if (recovery && supplied.daily_run && supplied.daily_run !== recovery.daily_run)
      throw Error("Continuation must reuse its original daily collection")
    if (recovery?.processing && module === "edition") {
      if (supplied.daily_run || supplied.report_path || supplied.collect === true)
        throw Error("Selected continuation must reuse its immutable edition")
      for (const [name, ref] of Object.entries(recovery.processing)) {
        if (
          (supplied[name + "_path"] && supplied[name + "_path"] !== ref.path) ||
          (supplied[name + "_sha256"] && supplied[name + "_sha256"] !== ref.sha256)
        )
          throw Error("Selected continuation handoff changed")
        supplied[name + "_path"] = ref.path
        supplied[name + "_sha256"] = ref.sha256
      }
      supplied.propose = !(recovery.processing.curation || recovery.processing.plan)
    }
    const collect = p.stage === "collection" && !supplied.report_path && !supplied.edition_path
    let parameters =
      module === "edition"
        ? {
            execute: true,
            ...(p.stage === "processing" ? { propose: true } : {}),
            ...supplied,
            ...(pinned.input.review_mode ? { review_mode: pinned.input.review_mode } : {}),
            run_id: run,
            round: true,
            ...(p.stage === "collection"
              ? {
                  collect,
                  stop_after_collection: true,
                  ...(collect
                    ? {
                        daily_run: supplied.daily_run || recovery?.daily_run || run,
                        ...(supplied.execute !== false
                          ? {
                              collection_max_windows: supplied.collection_max_windows || 6,
                              collection_time_budget_ms:
                                supplied.collection_time_budget_ms || 600000,
                            }
                          : {}),
                      }
                    : {}),
                }
              : { collect: false }),
          }
        : { run_id: run + "-delivery", ...supplied }
    if (prior) parameters = prior.parameters
    if (module === "publication") {
      if (!round.publication_handoff) throw Error("Approved publication handoff required")
      if (pinned.input.relay_provenance === "v1") verifyRelayHistory(ctx.root, run)
      if (operation === "request_delivery") {
        const invocation = checkedOperationalInvocation(ctx, pinned.input.invocation)
        if (invocation.kind === "scheduled" && !parameters.collection_basis_path) {
          const workflowInput = readJSON(ctx.root, `round-workflows/${run}/input.json`)
          const edition = readJSON(ctx.root, round.edition.path)
          const daily = workflowInput?.source?.daily_run || edition?.daily_run
          const basis = daily && readJSON(ctx.root, `daily/runs/${daily}/shadow-basis.json`)?.basis
          if (!basis) throw Error("Exact frozen scheduled collection basis required")
          parameters = {
            ...parameters,
            collection_basis_path: basis.path,
            collection_basis_sha256: basis.sha256,
          }
        }
        parameters = {
          ...parameters,
          handoff_path: round.publication_handoff.path,
          handoff_sha256: round.publication_handoff.sha256,
          ...(checkedOperationalInvocation(ctx, pinned.input.invocation).kind === "scheduled"
            ? {
                invocation_path: pinned.input.invocation.path,
                invocation_sha256: pinned.input.invocation.sha256,
              }
            : {}),
        }
      } else {
        const delivery = readJSON(
          ctx.root,
          `runs/${parameters.run_id}/publication-delivery/input.json`,
        )
        if (JSON.stringify(delivery?.handoff) !== JSON.stringify(round.publication_handoff))
          throw Error("Publication request must belong to this round's approved handoff")
      }
    }
    const command = {
      stage: p.stage,
      module,
      operation,
      parameters,
      ...(continuation ? { continuation } : {}),
    }
    const digest = sha256(JSON.stringify(command)),
      job = "module-operation-" + digest.slice(0, 48)
    if (expectedJobId && (!resume || job !== expectedJobId))
      throw Error("Requested resume job does not match the pinned operational command")
    const commandPath = base + "commands/" + digest + ".json"
    const owner = { round_id: run, round_input_sha256: sha256(JSON.stringify(pinned.input)) }
    const jobContext = { ...ctx, operationalRound: owner }
    // A durable command is saved before dispatch, so a lost response resumes
    // the same job and attempt. Native dead-worker/unknown-worker rules apply.
    if (!readJSON(ctx.root, commandPath))
      atomicCreate(ctx.root, commandPath, {
        ...command,
        job_id: job,
        submitted_at: new Date().toISOString(),
      })
    const existing = readJSON(ctx.root, `module-jobs/${job}/input.json`)
    const result =
      existing && resume
        ? await resumeJob(jobContext, job, { background })
        : await submit(jobContext, module, operation, parameters, {
            jobId: job,
            background,
          })
    recordOperationalJobTiming(jobContext, job)
    return {
      status: result.state,
      run_id: run,
      stage: p.stage,
      job: result,
      timing: {
        controller_elapsed_ms: performance.now() - started,
        native_elapsed_ms: result.elapsed_ms ?? null,
        control_wait_reduction: null,
        fixed_input_replay_verified: false,
      },
    }
  })
}

export async function relayOperationalReasoning(ctx, { run_id, results, resume_ready = false }) {
  assertRetiredWorkspaceFences(executionRepository(ctx), ctx.repo)
  inspectOperationalPin(ctx, run_id)
  for (const result of results) {
    const request = readJSON(ctx.root, `reasoning-tasks/${result.task_id}/request.json`)
    if (request?.owner?.round_id !== run_id)
      throw Error("Reasoning request belongs to another round")
  }
  const batch = await submitReasoningBatch(ctx.root, { results })
  const resumed = []
  if (resume_ready)
    for (const id of batch.ready_job_ids) {
      // Deliberately sequential: a job or shared state never has two resumptions.
      resumed.push(await resumeModuleJob(ctx, id, { background: false }))
    }
  return { ...batch, resumed_jobs: resumed, jobs_resumed: resumed.length > 0 }
}
