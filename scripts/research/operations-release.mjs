import fs from "node:fs"
import path from "node:path"
import { sha256 } from "./contracts.mjs"
import { readOperationGate } from "./operation-policy.mjs"
import { evidenceReference, inspectDevelopmentCompletion } from "./development-release.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { checkedOperationalInvocation } from "./schedule-contract.mjs"
import { executionRepository, inspectRuntimeWorkspace } from "./operations-deployment.mjs"
import { assertRetiredWorkspaceFences } from "./retired-workspace-fence.mjs"

const installationPath = ".local/.storage/runtime-release.json"
export const operationalBase = (run) => {
  if (!/^[A-Za-z0-9_-]{1,70}$/.test(run || "")) throw Error("Safe operational round ID required")
  return `operations/rounds/${run}/`
}
const checked = (repo, ref) => {
  if (!ref || evidenceReference(repo, ref.path).sha256 !== ref.sha256)
    throw Error("Operational release evidence changed")
  return readJSON(repo, ref.path)
}

// An explicit post-review local installation, never a scheduler side effect.
// No npm install, source collection, credentials, content copy or promotion.
export function installOperationsRelease(repo, destination) {
  repo = fs.realpathSync(repo)
  const gate = readOperationGate(repo)
  if (!gate.regular_execution_allowed) return { status: gate.status, operation_gate: gate }
  const target = path.resolve(destination)
  if (
    fs.existsSync(target) ||
    fs.realpathSync(path.dirname(target)) !== path.dirname(target) ||
    target === repo ||
    target.startsWith(repo + path.sep)
  )
    throw Error("Use an absent runtime destination outside the development repository")
  const policy = readJSON(repo, "data/research-operation-policy.json")
  const { record, manifest } = inspectDevelopmentCompletion(
    repo,
    policy.development_completion,
    policy,
  )
  const files = [
    ...manifest.files.map((f) => f.path),
    "data/research-operation-policy.json",
    policy.development_completion.path,
    record.release_manifest.path,
  ]
  fs.mkdirSync(target, { mode: 0o700 })
  // Interrupted installations retain their bytes but lack the final seal.
  for (const relative of [...new Set(files)]) {
    const source = safePath(repo, relative),
      dest = safePath(target, relative, { materialize: false })
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(source, dest, fs.constants.COPYFILE_EXCL)
    if (sha256(fs.readFileSync(dest)) !== sha256(fs.readFileSync(source)))
      throw Error("Runtime source changed during installation")
    fs.chmodSync(dest, 0o444)
  }
  atomicCreate(target, installationPath, {
    schema: "research-runtime-installation/v1",
    repo_root: fs.realpathSync(target),
    source_repo: manifest.repo_root,
    release_id: record.release_id,
    release_manifest: record.release_manifest,
    development_completion: policy.development_completion,
    operation_policy_sha256: evidenceReference(target, "data/research-operation-policy.json")
      .sha256,
  })
  const installedGate = readOperationGate(target)
  if (!installedGate.regular_execution_allowed)
    throw Error("Installed release failed its original gate")
  return {
    status: "installed",
    repo: target,
    release_id: record.release_id,
    content_initialized: false,
    dependencies_initialized: false,
    scheduled_runs_counted: 0,
  }
}

export function inspectOperationalPin(ctx, run, { readOnly = false } = {}) {
  const input = readJSON(ctx.root, operationalBase(run) + "input.json")
  if (!input) throw Error("Pinned operational round required")
  const runtime = readOnly
    ? fs.realpathSync(input.execution_repository || input.repository)
    : executionRepository(ctx)
  if (
    !input ||
    input.run_id !== run ||
    input.repository !== fs.realpathSync(ctx.repo) ||
    (input.execution_repository || input.repository) !== fs.realpathSync(runtime) ||
    input.root !== fs.realpathSync(ctx.root)
  )
    throw Error("Pinned operational round required")
  checked(runtime, input.completion)
  checked(runtime, input.manifest)
  checked(runtime, input.policy)
  const installation = checked(runtime, input.installation)
  const gate = readOperationGate(runtime)
  if (
    !gate.regular_execution_allowed ||
    gate.release_id !== input.release_id ||
    installation.release_id !== input.release_id
  )
    throw Error("Pinned operational execution changed; preserve this round")
  if (!readOnly && runtime !== ctx.repo) inspectRuntimeWorkspace(runtime, ctx.repo)
  checkedOperationalInvocation(ctx, input.invocation)
  if (input.continuation) {
    const continuation = checked(ctx.root, input.continuation)
    if (continuation.successor !== run || continuation.release_id !== input.release_id)
      throw Error("Operational continuation identity changed")
    for (const ref of [continuation.parent, continuation.workflow, continuation.checkpoint,
      ...(continuation.failed_collection_report ? [continuation.failed_collection_report] : []),
      ...(continuation.partial_restart ? [continuation.partial_restart] : []),
      ...(continuation.curation_restart ? [continuation.curation_restart] : [])])
      checked(ctx.root, ref)
    if (continuation.curation_restart) {
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
      const restart = checked(ctx.root, continuation.curation_restart)
      const checkpoint = checked(ctx.root, continuation.checkpoint)
      const parent = checked(ctx.root, continuation.parent)
      if (
        restart.schema !== "research-curation-required-restart/v1" || restart.successor !== run ||
        !same(restart.parent, continuation.parent) || !same(restart.checkpoint, continuation.checkpoint) ||
        !same(restart.edition, continuation.processing?.edition) ||
        !same(restart.plan, continuation.processing?.plan) ||
        !same(restart.edition, checkpoint.edition) || !same(restart.plan, checkpoint.plan) ||
        !same(restart.report, checkpoint.stages?.collection?.reference) ||
        !same(restart.event_workflow, checkpoint.event_workflow) ||
        !same(restart.publication_handoff, checkpoint.publication_handoff) ||
        checkpoint.status !== "curation_required" || checkpoint.curation ||
        checkpoint.article_writes !== 0 || checkpoint.canonical_writes !== 0 ||
        checkpoint.candidate_published !== false ||
        restart.checkpoint.path !== `round-workflows/${parent.run_id}/latest.json` ||
        !Array.isArray(restart.jobs) ||
        readJSON(ctx.root, `round-workflows/${parent.run_id}/curation.json`)
      ) throw Error("Curation continuation evidence changed")
      const commandBase = operationalBase(parent.run_id) + "commands/"
      const commandDir = safePath(ctx.root, commandBase, { materialize: false })
      const currentCommands = (fs.existsSync(commandDir) ? fs.readdirSync(commandDir) : [])
        .filter((name) => name.endsWith(".json")).sort().map((name) => commandBase + name)
      if (!same(currentCommands, restart.jobs.map((job) => job.command?.path)))
        throw Error("Curation continuation command evidence changed")
      for (const job of restart.jobs) {
        const command = checked(ctx.root, job.command)
        const input = checked(ctx.root, job.input)
        const state = checked(ctx.root, job.state)
        checked(ctx.root, job.result)
        const base = `module-jobs/${command.job_id}/`
        if (
          !["collection", "processing"].includes(command.stage) ||
          job.input.path !== base + "input.json" || job.state.path !== base + "state.json" ||
          job.result.path !== base + "result.json" || !same(job.result, state.result) ||
          state.state !== "completed" || state.job_id !== command.job_id ||
          input.job_id !== command.job_id || state.input_sha256 !== sha256(JSON.stringify(input)) ||
          input.context?.operationalRound?.round_id !== parent.run_id ||
          input.context.operationalRound.round_input_sha256 !== sha256(JSON.stringify(parent)) ||
          input.module !== command.module || input.operation !== command.operation ||
          !same(input.parameters, command.parameters)
        ) throw Error("Curation continuation job evidence changed")
      }
      const edition = checked(ctx.root, restart.edition)
      checked(ctx.root, restart.report)
      const plan = checked(ctx.root, restart.plan)
      checked(ctx.root, restart.review)
      const events = checked(ctx.root, restart.event_workflow)
      const handoff = checked(ctx.root, restart.publication_handoff)
      const snapshot = checked(ctx.root, restart.event_snapshot)
      if (
        !same(edition.report, restart.report) || !same(plan.edition, restart.edition) ||
        !same(plan.review, restart.review) || !same(events, snapshot) ||
        !same(handoff.workflow?.source, restart.event_workflow) ||
        !same(handoff.workflow?.snapshot, restart.event_snapshot) ||
        restart.event_snapshot.sha256 !== restart.event_workflow.sha256
      ) throw Error("Curation continuation source evidence changed")
    }
    if (Boolean(continuation.proposal_restart) !== Boolean(continuation.proposal_retirement))
      throw Error("Event proposal continuation evidence is incomplete")
    if (continuation.proposal_restart) {
      const restart = checked(ctx.root, continuation.proposal_restart)
      const retirement = checked(ctx.root, continuation.proposal_retirement)
      const task = restart?.task
      const parent = checked(ctx.root, continuation.parent)
      if (
        restart?.schema !== "research-event-proposal-restart/v1" ||
        restart.successor !== run ||
        JSON.stringify(restart.parent) !== JSON.stringify(continuation.parent) ||
        JSON.stringify(restart.checkpoint) !== JSON.stringify(continuation.checkpoint) ||
        JSON.stringify(restart.edition) !== JSON.stringify(continuation.processing?.edition) ||
        !/^reasoning-[a-f0-9]{64}$/.test(task?.task_id || "") ||
        restart.owner?.round_id !== parent.run_id ||
        restart.retirement_reason !== `Restart ${parent.run_id} as ${run}` ||
        restart.job_input?.path !== `module-jobs/${restart.owner?.job_id}/input.json` ||
        restart.job_state?.path !== `module-jobs/${restart.owner?.job_id}/state.json` ||
        continuation.proposal_retirement.path !== `reasoning-tasks/${task.task_id}/retired.json` ||
        restart.request?.path !== `reasoning-tasks/${task.task_id}/request.json` ||
        retirement?.task_id !== task.task_id ||
        retirement.request_sha256 !== task.request_sha256 ||
        retirement.reason !== restart.retirement_reason
      )
        throw Error("Event proposal continuation evidence changed")
      const edition = checked(ctx.root, restart.edition)
      checked(ctx.root, restart.collection_report)
      const request = checked(ctx.root, restart.request)
      const jobInput = checked(ctx.root, restart.job_input)
      const jobState = checked(ctx.root, restart.job_state)
      if (
        JSON.stringify(edition.report) !== JSON.stringify(restart.collection_report) ||
        request.request_sha256 !== task.request_sha256 ||
        JSON.stringify(request.owner) !== JSON.stringify(restart.owner) ||
        jobInput.job_id !== restart.owner.job_id ||
        jobState.job_id !== restart.owner.job_id ||
        jobState.state !== "waiting_for_reasoning" ||
        JSON.stringify(jobState.reasoning_task) !== JSON.stringify(task)
      )
        throw Error("Event proposal continuation source changed")
    }
    checkedOperationalInvocation(ctx, continuation.invocation)
  }
  return input
}

export async function pinOperationalRound(
  ctx,
  { run_id, invocation_path, invocation_sha256, continuation },
) {
  const runtime = executionRepository(ctx)
  const gate = readOperationGate(runtime)
  if (!gate.regular_execution_allowed) return { status: gate.status, operation_gate: gate }
  assertRetiredWorkspaceFences(runtime, ctx.repo)
  const base = operationalBase(run_id)
  const old = readJSON(ctx.root, base + "input.json")
  if (old) {
    const input = inspectOperationalPin(ctx, run_id)
    if (
      invocation_path &&
      (input.invocation.path !== invocation_path || input.invocation.sha256 !== invocation_sha256)
    )
      throw Error("Round invocation changed")
    if (continuation && JSON.stringify(input.continuation) !== JSON.stringify(continuation))
      throw Error("Round continuation changed")
    return { status: "pinned", input, reused: true }
  }
  const installed = readJSON(runtime, installationPath)
  if (!installed) throw Error("Regular rounds require an explicitly installed immutable runtime")
  if (runtime !== ctx.repo) inspectRuntimeWorkspace(runtime, ctx.repo)
  const invocationRef = { path: invocation_path, sha256: invocation_sha256 }
  const invocation = checkedOperationalInvocation(ctx, invocationRef)
  const policy = readJSON(runtime, "data/research-operation-policy.json")
  const completion = checked(runtime, policy.development_completion)
  fs.mkdirSync(ctx.root, { recursive: true })
  return withLock(ctx.root, "operational-round-pin", async () => {
    const input = {
      schema: "research-operational-round/v1",
      review_mode: continuation
        ? checked(ctx.root, checked(ctx.root, continuation).parent).review_mode || "separate/v1"
        : "combined/v1",
      ...(continuation
        ? (checked(ctx.root, checked(ctx.root, continuation).parent).relay_provenance === "v1"
            ? { relay_provenance: "v1" } : {})
        : { relay_provenance: "v1" }),
      run_id,
      repository: fs.realpathSync(ctx.repo),
      ...(runtime !== ctx.repo ? { execution_repository: fs.realpathSync(runtime) } : {}),
      root: fs.realpathSync(ctx.root),
      release_id: gate.release_id,
      completion: policy.development_completion,
      manifest: completion.release_manifest,
      policy: evidenceReference(runtime, "data/research-operation-policy.json"),
      installation: evidenceReference(runtime, installationPath),
      invocation: invocationRef,
      ...(continuation ? { continuation } : {}),
      started_at: invocation.started_at,
    }
    const claim = `operations/${invocation.kind}-executions/${sha256((invocation.schedule_id || "manual") + ":" + invocation.execution_id)}.json`
    const prior = readJSON(ctx.root, claim)
    if (prior && (prior.run_id !== run_id || prior.input_sha256 !== sha256(JSON.stringify(input))))
      throw Error("Scheduled execution already belongs to another round")
    if (!prior)
      atomicCreate(ctx.root, claim, { run_id, input_sha256: sha256(JSON.stringify(input)) })
    if (!readJSON(ctx.root, base + "input.json")) atomicCreate(ctx.root, base + "input.json", input)
    inspectOperationalPin(ctx, run_id)
    return { status: "pinned", input, reused: false }
  })
}
