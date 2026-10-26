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
        .sort()
        .map((file) => {
          const command = readJSON(ctx.root, base + "commands/" + file)
          return { ...command, job: moduleJobStatus(ctx, command.job_id) }
        })
        .sort((a, b) => (a.job.submitted_at || "").localeCompare(b.job.submitted_at || ""))
    : []
  const round = readJSON(ctx.root, `round-workflows/${run}/latest.json`)
  return {
    schema: "research-operational-status/v1",
    status: round?.status || commands.at(-1)?.job.state || "pinned",
    run_id: run,
    release_id: input.release_id,
    started_at: input.started_at,
    stages: round?.stages || {},
    next_inputs: round?.next_inputs || [],
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
export async function runOperationalRound(ctx, p, { resume = false, background = true } = {}) {
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
      (savedRound?.publication_handoff
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
    const prior =
      resume && !p.parameters ? status.commands.filter((c) => c.stage === p.stage).at(-1) : null
    const operation =
      prior?.operation ||
      (p.stage === "publication" ? p.operation || "request_delivery" : "advance")
    if (
      module === "publication" &&
      !["request_delivery", "deliver", "delivery_receipt"].includes(operation)
    )
      throw Error("Unsupported publication transition")
    const supplied = p.parameters || {}
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
                        daily_run: supplied.daily_run || run,
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
    const command = { stage: p.stage, module, operation, parameters }
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
        ? await resumeModuleJob(jobContext, job, { background })
        : await submitModuleJob(jobContext, module, operation, parameters, {
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
