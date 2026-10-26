import { sha256 } from "./contracts.mjs"
import { acquireLock, recoverLock, atomicWrite, readJSON } from "./run-state.mjs"
import { operationalBase } from "./operations-release.mjs"
import { operationalRoundStatus, runOperationalRound } from "./operations-runtime.mjs"
import { moduleJobStatus } from "./module-runtime.mjs"
import { readReasoningTask } from "./reasoning-tasks.mjs"
import { publicationDeliveryStatus } from "./authoring-delivery-request.mjs"

// A completed module job is a slice, never a completed daily publication.
// Only native delivery receipts can establish the latter.
export function operationalNextAction(status, delivery = null) {
  const active = status.commands?.find((c) => c.job.worker_alive !== false)
  if (active)
    return {
      action: active.job.worker_alive === true ? "wait" : "worker_status_unknown",
      job_id: active.job_id,
    }
  const last = status.commands?.at(-1)
  if (last?.job.state === "failed")
    return {
      action: "failed",
      job_id: last.job_id,
      error: last.job.error,
      recovery: last.job.recovery,
    }
  if (last?.job.state === "interrupted" || last?.job.state === "not_submitted")
    return { action: "resume", job_id: last.job_id }
  if (last?.job.state === "waiting_for_storage")
    return { action: "storage", job_id: last.job_id, request: last.job.storage_request }
  if (last?.job.state === "waiting_for_reasoning")
    return { action: "reasoning", job_id: last.job_id, request: last.job.reasoning_task }
  if (status.pending_reasoning?.total)
    return { action: "reasoning", requests: status.pending_reasoning.tasks }
  const submitted = (status.next_inputs || []).flatMap((row) =>
    row.stage === "reasoning" && row.reasoning_task ? [row.reasoning_task] : [],
  )
  if (last?.job.state === "completed" && submitted.length)
    return { action: "consume_reasoning", requests: submitted }
  if (delivery) {
    if (
      delivery.drive_verified &&
      delivery.public_verified &&
      delivery.website_data_verified &&
      delivery.source_archive_verified &&
      !delivery.pending_request &&
      !delivery.interrupted_request &&
      !delivery.execution?.worker_alive
    )
      return { action: "complete", delivery }
    return { action: "delivery", delivery }
  }
  if (status.status === "not_started" || status.status === "pinned") return { action: "advance" }
  if (status.status === "collection_pending") return { action: "advance", stage: "collection" }
  if (status.status === "collection_frozen") return { action: "advance", stage: "processing" }
  const continuation = (status.next_inputs || []).find(
    (x) => x.stage === "classification" && Number.isSafeInteger(x.offset),
  )
  if (continuation)
    return { action: "advance", stage: "processing", parameters: { offset: continuation.offset } }
  if (
    (status.next_inputs || []).some((x) => x.required?.length === 1 && x.required[0] === "execute")
  )
    return { action: "advance", stage: "processing" }
  if (status.stages?.events?.status === "complete" && status.stages?.publication?.reference)
    return { action: "advance", stage: "publication" }
  return { action: "review", next_inputs: status.next_inputs || [] }
}

function driverLock(root, run) {
  const name = "operations-driver-" + run
  const saved = readJSON(root, `locks/${name}.json`)
  if (saved) {
    if (!Number.isSafeInteger(saved.pid) || saved.pid <= 0) throw Error("Unknown controller owner")
    try {
      process.kill(saved.pid, 0)
    } catch (error) {
      if (error.code !== "ESRCH") throw Error("Unknown controller owner")
      // drive is an explicit recovery request. Only this dead controller's
      // lease is recovered; module, source and remote writer locks stay intact.
      recoverLock(root, name, saved.owner)
      return acquireLock(root, name)
    }
    const error = Error("Existing operational controller is active")
    error.code = "CONTROLLER_ACTIVE"
    throw error
  }
  return acquireLock(root, name)
}

export async function driveOperationalRound(
  ctx,
  p,
  {
    status = operationalRoundStatus,
    advance = runOperationalRound,
    jobStatus = moduleJobStatus,
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    deliveryStatus = publicationDeliveryStatus,
    readTask = readReasoningTask,
  } = {},
) {
  const run = p.run_id,
    base = operationalBase(run)
  const { parameters: initialParameters, ...control } = p
  const maxSteps = p.max_steps ?? 1000,
    pollMs = p.poll_ms ?? 2000
  if (
    !Number.isSafeInteger(maxSteps) ||
    maxSteps < 1 ||
    maxSteps > 10000 ||
    !Number.isSafeInteger(pollMs) ||
    pollMs < 25 ||
    pollMs > 30000
  )
    throw Error("Bounded controller steps and poll interval required")
  // Validate the immutable execution before creating a controller lease.
  const initial = status(ctx, run)
  if (initial.operation_gate && !initial.operation_gate.regular_execution_allowed)
    return { ...initial.operation_gate, completed: false, keep_turn_open: false }
  let release
  try {
    release = driverLock(ctx.root, run)
  } catch (error) {
    if (error.code !== "CONTROLLER_ACTIVE") throw error
    return {
      status: "controller_active",
      run_id: run,
      completed: false,
      keep_turn_open: true,
      next_command: ["node", "scripts/research-operations.mjs", "status", "--round", run],
    }
  }
  const file = base + "controller.json"
  const prior = readJSON(ctx.root, file)
  let progress = prior?.progress || null,
    lastDispatched = prior?.last_dispatched_job || null
  const save = (value) => {
    const result = {
      schema: "research-operational-controller/v1",
      run_id: run,
      pid: process.pid,
      observed_at: new Date().toISOString(),
      completed: false,
      keep_turn_open: true,
      progress,
      last_dispatched_job: lastDispatched,
      ...value,
    }
    atomicWrite(ctx.root, file, result)
    return result
  }
  try {
    for (let step = 0; step < maxSteps; step++) {
      const current = status(ctx, run)
      const deliveryRun = run + "-delivery"
      const delivery = readJSON(ctx.root, `runs/${deliveryRun}/publication-delivery/input.json`)
        ? deliveryStatus(ctx, { run_id: deliveryRun })
        : null
      const next = operationalNextAction(current, delivery)
      if (next.action === "wait") {
        save({ status: "running", next_action: next, transitions: step })
        // Poll only the bound job while it is live. Full immutable manifest and
        // workflow validation happens at transitions, not every two seconds.
        let job
        do {
          await wait(pollMs)
          job = jobStatus(ctx, next.job_id)
        } while (job.worker_alive === true)
        step--
        continue
      }
      if (
        next.action === "reasoning" &&
        next.job_id &&
        next.request &&
        readTask(ctx.root, next.request).status === "completed"
      ) {
        const result = await advance(ctx, { run_id: run }, { resume: true, background: true })
        if (result.status === "no_progress")
          return save({ status: "no_progress", next_action: result })
        continue
      }
      if (next.action === "consume_reasoning") {
        for (const request of next.requests) {
          const checked = readTask(ctx.root, request)
          if (
            checked.owner?.round_id !== run ||
            !current.commands.some((c) => c.job_id === checked.owner.job_id)
          )
            throw Error("Completed model result belongs to another operational round")
          if (checked.status !== "completed")
            return save({
              status: "requires_reasoning",
              next_action: { action: "reasoning", requests: next.requests },
            })
        }
        // Batched workflows can settle their module job while returning owned
        // model requests in its result. Consume those results in a successor;
        // resubmitting the completed module job would only replay its old page.
        next.action = "advance"
        next.stage = "processing"
      }
      if (next.action === "advance" || next.action === "resume") {
        const fingerprint = sha256(
          JSON.stringify({
            status: current.status,
            counts: current.stages?.collection?.counts,
            next_inputs: current.next_inputs,
            events: current.stages?.events,
            publication: current.stages?.publication,
          }),
        )
        const last = current.commands?.at(-1)
        if (
          next.action === "advance" &&
          lastDispatched === last?.job_id &&
          progress === fingerprint
        )
          return save({
            status: "no_progress",
            next_action: next,
            reason: "Native slice made no progress; inspect source holds instead of repeating it",
          })
        progress = fingerprint
        const inherited = current.commands?.filter((c) => c.stage === next.stage).at(-1)?.parameters
        const parameters = next.parameters
          ? { ...inherited, ...next.parameters }
          : !current.commands?.length
            ? initialParameters
            : undefined
        const result = await advance(
          ctx,
          { ...control, run_id: run, stage: next.stage, ...(parameters ? { parameters } : {}) },
          {
            resume: current.status !== "not_started",
            background: true,
          },
        )
        if (result.operation_gate || ["development_pending", "no_progress"].includes(result.status))
          return save({ status: result.status, next_action: result, keep_turn_open: false })
        lastDispatched = result.job?.job_id || null
        save({
          status: "running",
          next_action: { action: "wait", job_id: lastDispatched },
          transitions: step + 1,
        })
        continue
      }
      return save({
        status: next.action === "complete" ? "completed" : "requires_" + next.action,
        completed: next.action === "complete",
        keep_turn_open: next.action !== "complete",
        next_action: next,
        native_status: current.status,
        stages: current.stages,
        continuation: current.continuation || null,
        next_command: ["node", "scripts/research-operations.mjs", "drive", "--round", run],
      })
    }
    return save({
      status: "control_yield",
      reason: "bounded_transition_budget",
      next_command: ["node", "scripts/research-operations.mjs", "drive", "--round", run],
    })
  } catch (error) {
    save({ status: "failed", error: error.message, error_code: error.code || null })
    throw error
  } finally {
    release()
  }
}
