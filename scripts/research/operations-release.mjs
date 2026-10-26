import fs from "node:fs"
import path from "node:path"
import { sha256 } from "./contracts.mjs"
import { readOperationGate } from "./operation-policy.mjs"
import { evidenceReference, inspectDevelopmentCompletion } from "./development-release.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { checkedOperationalInvocation } from "./schedule-contract.mjs"
import { executionRepository, inspectRuntimeWorkspace } from "./operations-deployment.mjs"

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

export function inspectOperationalPin(ctx, run) {
  const runtime = executionRepository(ctx)
  const input = readJSON(ctx.root, operationalBase(run) + "input.json")
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
  if (runtime !== ctx.repo) inspectRuntimeWorkspace(runtime, ctx.repo)
  checkedOperationalInvocation(ctx, input.invocation)
  return input
}

export async function pinOperationalRound(ctx, { run_id, invocation_path, invocation_sha256 }) {
  const runtime = executionRepository(ctx)
  const gate = readOperationGate(runtime)
  if (!gate.regular_execution_allowed) return { status: gate.status, operation_gate: gate }
  const base = operationalBase(run_id)
  const old = readJSON(ctx.root, base + "input.json")
  if (old) {
    const input = inspectOperationalPin(ctx, run_id)
    if (
      invocation_path &&
      (input.invocation.path !== invocation_path || input.invocation.sha256 !== invocation_sha256)
    )
      throw Error("Round invocation changed")
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
