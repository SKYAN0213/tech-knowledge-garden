import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { readOperationGate } from "./operation-policy.mjs"
import {
  pinOperationalRound,
  inspectOperationalPin,
  operationalBase,
} from "./operations-release.mjs"
import { moduleJobStatus, submitModuleJob, resumeModuleJob } from "./module-runtime.mjs"
import { reasoningTasks, submitReasoningBatch } from "./reasoning-tasks.mjs"
import { summarizeStageTiming, recordOperationalJobTiming } from "./operations-timing.mjs"
import { executionRepository } from "./operations-deployment.mjs"
import { checkedOperationalInvocation } from "./schedule-contract.mjs"
import { assertUnwrittenApprovedHandoff } from "./operations-continuation.mjs"

export function operationalRoundStatus(ctx, run) {
  const base = operationalBase(run)
  const input = readJSON(ctx.root, base + "input.json")
  if (!input)
    return { status: "not_started", operation_gate: readOperationGate(executionRepository(ctx)) }
  inspectOperationalPin(ctx, run)
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
              ? moduleJobStatus(ctx, command.job_id)
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
  return {
    schema: "research-operational-status/v1",
    status: round?.status || commands.at(-1)?.job.state || "pinned",
    run_id: run,
    release_id: input.release_id,
    started_at: input.started_at,
    ...(input.continuation ? { continuation: input.continuation } : {}),
    stages: round?.stages || {},
    next_inputs: round?.next_inputs || [],
    controller: readJSON(ctx.root, base + "controller.json"),
    commands,
    pending_reasoning: reasoningTasks(ctx.root, { round_id: run, limit: 3 }),
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
  { resume = false, background = true, submit = submitModuleJob, resumeJob = resumeModuleJob } = {},
) {
  const started = performance.now()
  const pinned = await pinOperationalRound(ctx, p)
  if (pinned.status !== "pinned") return pinned
  const run = p.run_id,
    base = operationalBase(run)
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
      supplied.propose = false
    }
    const collect = p.stage === "collection" && !supplied.report_path && !supplied.edition_path
    let parameters =
      module === "edition"
        ? {
            execute: true,
            ...(p.stage === "processing" ? { propose: true } : {}),
            ...supplied,
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
