import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { sha256 } from "./contracts.mjs"
import { evidenceReference } from "./development-release.mjs"
import { readOperationGate } from "./operation-policy.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"

export const activeRuntimePath = ".local/.storage/active-runtime.json"
export const executionRepository = (ctx) => ctx.executionRepo || ctx.repo

function pythonDependencies(runtime, workspace) {
  const requirements = path.join(runtime, "integrations/research-worker/requirements.txt")
  if (!fs.existsSync(requirements)) return null // Minimal unit release; real releases include this manifest file.
  const expected = Object.fromEntries(
    fs
      .readFileSync(requirements, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => {
        const row = /^([A-Za-z0-9_.-]+)==([0-9][A-Za-z0-9_.+-]*)$/.exec(line.trim())
        if (!row) throw Error("Pinned Python dependency required")
        return [row[1], row[2]]
      }),
  )
  const executable = path.join(workspace, ".local/research/local-ai/runtime/venv/bin/python")
  fs.accessSync(executable, fs.constants.X_OK)
  const versions = JSON.parse(
    execFileSync(
      executable,
      [
        "-c",
        "import importlib.metadata as m,json,sys;print(json.dumps({n:m.version(n) for n in json.loads(sys.argv[1])}))",
        JSON.stringify(Object.keys(expected)),
      ],
      { encoding: "utf8", timeout: 30000 },
    ),
  )
  if (Object.entries(expected).some(([name, version]) => versions[name] !== version))
    throw Error("Existing Python dependencies differ from the runtime requirements")
  return { executable, versions, requirements_sha256: sha256(fs.readFileSync(requirements)) }
}

export function inspectRuntimeWorkspace(runtime, workspace) {
  runtime = fs.realpathSync(runtime)
  workspace = fs.realpathSync(workspace)
  const gate = readOperationGate(runtime)
  if (!gate.regular_execution_allowed) throw Error("Immutable runtime is not ready: " + gate.reason)
  const installation = readJSON(runtime, ".local/.storage/runtime-release.json")
  if (
    !installation ||
    installation.repo_root !== runtime ||
    installation.release_id !== gate.release_id
  )
    throw Error("Installed immutable runtime required")
  const manifest = readJSON(runtime, installation.release_manifest.path)
  if (
    evidenceReference(runtime, installation.release_manifest.path).sha256 !==
    installation.release_manifest.sha256
  )
    throw Error("Installed runtime manifest changed")
  // The existing publisher runs against this Git workspace. Every executable
  // and configuration byte it can use must match the selected release.
  for (const file of manifest.files) {
    if (evidenceReference(workspace, file.path).sha256 !== file.sha256)
      throw Error("Runtime workspace implementation changed: " + file.path)
  }
  return { runtime, workspace, release_id: gate.release_id, gate, installation }
}

function assertNoWriter(workspace) {
  const root = path.join(workspace, ".local/research/local-ai")
  const jobs = path.join(root, "module-jobs")
  for (const name of fs.existsSync(jobs) ? fs.readdirSync(jobs) : []) {
    if (!/^module-[A-Za-z0-9_-]{1,100}$/.test(name)) continue
    const state = readJSON(root, `module-jobs/${name}/state.json`)
    if (!["queued", "running", "finishing"].includes(state?.state)) continue
    const launch = readJSON(root, `module-jobs/${name}/launch.json`)
    const pid = state.state === "running" ? state.pid : launch?.pid
    if (!Number.isSafeInteger(pid) || pid <= 0) throw Error("Unknown workspace writer: " + name)
    try {
      process.kill(pid, 0)
    } catch (error) {
      if (error.code === "ESRCH") continue
      throw Error("Unknown workspace writer: " + name)
    }
    throw Error("Active workspace writer: " + name)
  }
  for (const file of ["locks/garden-operation.json", "locks/module-submit.json"])
    if (readJSON(root, file)) throw Error("Workspace lock requires explicit inspection: " + file)
}

export async function activateOperationsRuntime(runtime, workspace) {
  const checked = inspectRuntimeWorkspace(runtime, workspace)
  const root = path.join(checked.workspace, ".local/.storage")
  fs.mkdirSync(root, { recursive: true, mode: 0o700 })
  return withLock(root, "activate-runtime", async () => {
    assertNoWriter(checked.workspace)
    const dependencies = []
    for (const relative of ["node_modules", "integrations/research-mcp/node_modules"]) {
      const existing = path.join(checked.workspace, relative),
        target = path.join(checked.runtime, relative)
      if (!fs.statSync(existing, { throwIfNoEntry: false })?.isDirectory())
        throw Error("Existing workspace dependencies required: " + relative)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      if (!fs.lstatSync(target, { throwIfNoEntry: false })) fs.symlinkSync(existing, target, "dir")
      if (
        !fs.lstatSync(target).isSymbolicLink() ||
        fs.realpathSync(target) !== fs.realpathSync(existing)
      )
        throw Error("Runtime dependency binding changed: " + relative)
      dependencies.push({ path: relative, target: fs.realpathSync(existing) })
    }
    const value = {
      schema: "research-active-runtime/v1",
      runtime: checked.runtime,
      workspace: checked.workspace,
      release_id: checked.release_id,
      installation: evidenceReference(checked.runtime, ".local/.storage/runtime-release.json"),
      dependencies,
      python: pythonDependencies(checked.runtime, checked.workspace),
    }
    const prior = readJSON(checked.workspace, activeRuntimePath)
    if (prior && JSON.stringify(prior) !== JSON.stringify(value)) {
      const archive = `.local/.storage/active-runtime-history/${sha256(JSON.stringify(prior))}.json`
      if (!readJSON(checked.workspace, archive)) atomicCreate(checked.workspace, archive, prior)
    }
    atomicWrite(checked.workspace, activeRuntimePath, value)
    return operationsReadiness(checked.workspace)
  })
}

export function operationsReadiness(workspace) {
  const active = readJSON(workspace, activeRuntimePath)
  if (!active)
    return {
      status: "development_pending",
      reason: "runtime_not_activated",
      operational_ready: false,
    }
  if (
    active.schema !== "research-active-runtime/v1" ||
    active.workspace !== fs.realpathSync(workspace)
  )
    throw Error("Active runtime workspace binding changed")
  const checked = inspectRuntimeWorkspace(active.runtime, workspace)
  if (
    active.release_id !== checked.release_id ||
    evidenceReference(active.runtime, active.installation.path).sha256 !==
      active.installation.sha256
  )
    throw Error("Active runtime installation changed")
  for (const binding of active.dependencies) {
    const target = path.join(active.runtime, binding.path)
    if (
      !fs.lstatSync(target).isSymbolicLink() ||
      fs.realpathSync(target) !== binding.target ||
      fs.realpathSync(path.join(workspace, binding.path)) !== binding.target
    )
      throw Error("Active runtime dependency changed")
  }
  if (
    JSON.stringify(active.python) !== JSON.stringify(pythonDependencies(active.runtime, workspace))
  )
    throw Error("Active Python dependency binding changed")
  return {
    status: "ready",
    operational_ready: true,
    runtime: active.runtime,
    workspace: active.workspace,
    release_id: active.release_id,
    schedule: "tech-knowledge-garden-04",
    production_cycle_counted: false,
  }
}
