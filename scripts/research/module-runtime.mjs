import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { spawn, execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { moduleOperation } from "./module-registry.mjs"
import { validateArguments } from "./modules/contracts.mjs"
import {
  atomicCreate,
  atomicWrite,
  readJSON,
  safePath,
  acquireLock,
  recoverLock,
} from "./run-state.mjs"
import { sha256 } from "./contracts.mjs"
import { moduleRecoveryPlan } from "./operation-policy.mjs"

const defaultRepo = fileURLToPath(new URL("../../", import.meta.url))
const worker = fileURLToPath(new URL("../research-module-worker.mjs", import.meta.url))
const validJob = (id) => typeof id === "string" && /^module-[A-Za-z0-9_-]{1,100}$/.test(id)
const base = (id) => {
  if (!validJob(id)) throw Error("Safe module job ID required (module- prefix)")
  return `module-jobs/${id}/`
}
export function moduleContext({
  repo = defaultRepo,
  root,
  vault,
  backlog,
  policy,
  maxActiveJobs = 4,
} = {}) {
  repo = fs.realpathSync(repo)
  for (const file of ["data/research-source-channels.json", "data/research-model-policy.json"])
    fs.accessSync(safePath(repo, file))
  const relative = (file) => path.resolve(repo, file)
  const context = {
    repo,
    root: relative(root || ".local/research/local-ai"),
    vault: relative(vault || "vault"),
    backlog: relative(
      backlog ||
        (root
          ? path.join(root, "candidate-backlog.json")
          : ".local/research/candidate-backlog.json"),
    ),
    policy: relative(policy || "data/research-model-policy-codex.json"),
    maxActiveJobs,
  }
  if (!Number.isInteger(maxActiveJobs) || maxActiveJobs < 1 || maxActiveJobs > 6)
    throw Error("Module concurrency must be between one and six")
  // Startup paths are operator-controlled. Tool parameters never change them.
  for (const value of [context.root, context.vault, context.backlog, context.policy]) {
    if (path.relative(repo, value).startsWith("..") || value === repo)
      throw Error("Module startup paths must stay inside the selected repository")
    safePath(repo, path.relative(repo, value))
  }
  return context
}

function inputFingerprint(moduleId) {
  const publicationFiles = [
    "daily-publication-handoff.mjs",
    "authoring-delivery-request.mjs",
    "authoring-transfer.mjs",
    "authoring-execution.mjs",
    "authoring-readback.mjs",
    "authoring-source-snapshot.mjs",
    "authoring-source-reconcile.mjs",
    "legacy-transition.mjs",
    "legacy-review.mjs",
    "legacy-citation.mjs",
    "../sectors.mjs",
    "../build-connector-snapshot.py",
    "../research-authoring.mjs",
    "authoring-import.mjs",
    "authoring-release.mjs",
    "authoring-delivery.mjs",
    "delivery-run.mjs",
    "delivery-status.mjs",
    "plan-progress.mjs",
    "publication-operation.mjs",
    "remote-delivery.mjs",
    "shadow-operations.mjs",
    "shadow-collection-basis.mjs",
    "daily-plan.mjs",
    "daily-scan.mjs",
    "discovery.mjs",
    "parser.mjs",
    "evaluation.mjs",
    "model-policy.mjs",
    "processed-source-result.mjs",
    "editorial-context.mjs",
    "editorial-completeness.mjs",
    "public-readback.mjs",
    "archive-locations.mjs",
    "../publish.mjs",
    "../garden.mjs",
    "../historical-coverage.mjs",
    "../validate_encyclopedia.py",
    "event-pipeline.mjs",
    "event-publication.mjs",
    "collection-report.mjs",
    "list-scan-command.mjs",
    "scan-evidence.mjs",
    "scan-basis.mjs",
    "preview.mjs",
    "ontology.mjs",
    "note-review.mjs",
    "signal-dates.mjs",
    "dates.mjs",
    "publish-adapter.mjs",
    "event-date.mjs",
    "article-concept-review.mjs",
    "knowledge-links.mjs",
    "contracts.mjs",
    "run-state.mjs",
  ]
  const extra = [
    "edition",
    "classification",
    "curation",
    "selection",
    "evidence",
    "writing",
    "validation",
  ].includes(moduleId)
    ? [
        "event-pipeline.mjs",
        "../garden.mjs",
        "event-inference.mjs",
        "event-publication.mjs",
        "event-date.mjs",
        "event-workflow.mjs",
        "curation.mjs",
        "curation-workflow.mjs",
        "briefing-composition.mjs",
        "curation-insights.mjs",
        "editorial-completeness.mjs",
        "draft-checkpoint.mjs",
        "processed-draft.mjs",
        "source-processing.mjs",
        "editorial-authoring.mjs",
        "../../data/research-curation-policy.json",
        "../../data/research-briefing-composition-policy.json",
        "ontology-knowledge.mjs",
        "signal-dates.mjs",
        "dates.mjs",
        "ontology.mjs",
        "knowledge-links.mjs",
        "claims.mjs",
        "editor.mjs",
        "reader-quality.mjs",
        "model-provider.mjs",
        "model-policy.mjs",
        "reasoning-tasks.mjs",
        "ollama.mjs",
        "openai.mjs",
        "run-state.mjs",
        "../research.mjs",
        "collection-report.mjs",
        "list-scan-command.mjs",
        "scan-evidence.mjs",
        "scan-basis.mjs",
        "modules/edition.mjs",
        "modules/selection.mjs",
        ...(moduleId === "edition"
          ? ["round-workflow.mjs", "daily-scan.mjs", "ontology-trends.mjs", ...publicationFiles]
          : []),
        ...(moduleId === "validation"
          ? [
              "plan-progress.mjs",
              "knowledge-workflow.mjs",
              "evaluation.mjs",
              "evaluation-review-packet.mjs",
              "parser.mjs",
              ...publicationFiles,
            ]
          : []),
      ]
    : moduleId === "collection"
      ? [
          "collection-report.mjs",
          "collection-recovery.mjs",
          "source-run-recovery.mjs",
          "publication-date-reconciliation.mjs",
          "drive-auth.mjs",
          "drive-client.mjs",
          "drive-storage.mjs",
          "../../data/research-drive-policy.json",
          "list-scan-command.mjs",
          "../research-scan.mjs",
          "daily-scan.mjs",
          "scan-basis.mjs",
          "scan-evidence.mjs",
          "source-targeted-search.mjs",
          "inquiry-tracking.mjs",
          "source-followups.mjs",
          "source-selection.mjs",
          "../research-followups.mjs",
          "daily-search-basis.mjs",
          "search.mjs",
          "discovery.mjs",
          "parser.mjs",
          "source-policy.mjs",
          "fetch.mjs",
          "source-recipes.mjs",
          "dates.mjs",
          "editorial-handoff.mjs",
          "../research.mjs",
          "../research-window.mjs",
          "../../integrations/research-worker/worker.py",
        ]
      : moduleId === "publication"
        ? publicationFiles
        : moduleId === "reasoning"
          ? ["reasoning-tasks.mjs", "model-policy.mjs", "ollama.mjs"]
          : moduleId === "knowledge"
            ? [
                "knowledge-workflow.mjs",
                "knowledge-explorer.mjs",
                "knowledge-explorer-view.mjs",
                "editorial-completeness.mjs",
                "../garden.mjs",
                "../trends.mjs",
                "knowledge-article-links.mjs",
                "preview.mjs",
                "publish-adapter.mjs",
                "event-date.mjs",
                "ontology-knowledge.mjs",
                "ontology.mjs",
                "knowledge-links.mjs",
                "ontology-trends.mjs",
                "knowledge-editor.mjs",
                "note-review.mjs",
                "signal-dates.mjs",
                "dates.mjs",
                "model-provider.mjs",
                "model-policy.mjs",
                "reasoning-tasks.mjs",
                "ollama.mjs",
                "openai.mjs",
                "run-state.mjs",
                "../research.mjs",
              ]
            : moduleId === "parsing"
              ? [
                  "parser.mjs",
                  "article-image-review-cache.mjs",
                  "article-image-source.mjs",
                  "../../integrations/research-worker/worker.py",
                ]
              : []
  return Object.fromEntries(
    [
      ...new Set([
        "../research-module-worker.mjs",
        "module-registry.mjs",
        "module-runtime.mjs",
        "modules/contracts.mjs",
        "contracts.mjs",
        "run-state.mjs",
        `modules/${moduleId}.mjs`,
        "cold-storage.mjs",
        "cold-storage.py",
        "operation-policy.mjs",
        "development-release.mjs",
        ...extra,
      ]),
    ].map((file) => [file, sha256(fs.readFileSync(new URL(file, import.meta.url)))]),
  )
}
function fileFingerprints(ctx, parameters, schema) {
  const files = []
  const visit = (value, contract) => {
    if (contract["x-path-scope"])
      files.push({
        scope: contract["x-path-scope"],
        path: value,
        sha256: sha256(fs.readFileSync(safePath(ctx[contract["x-path-scope"]], value))),
      })
    if (Array.isArray(value)) value.forEach((entry) => visit(entry, contract.items || {}))
    else if (value && typeof value === "object")
      for (const [key, entry] of Object.entries(value))
        visit(
          entry,
          contract.properties?.[key] ||
            (typeof contract.additionalProperties === "object"
              ? contract.additionalProperties
              : {}),
        )
  }
  visit(parameters, schema)
  return files
}
function checkedInput(ctx, id, { requireContext = true } = {}) {
  const input = readJSON(ctx.root, base(id) + "input.json")
  const state = readJSON(ctx.root, base(id) + "state.json")
  if (
    !input ||
    !state ||
    state.input_sha256 !== sha256(JSON.stringify(input)) ||
    input.job_id !== id ||
    (requireContext && (input.context.repo !== ctx.repo || input.context.root !== ctx.root))
  )
    throw Error("Module job input or context changed")
  return { input, state }
}
function workerAlive(ctx, id, state) {
  const launch = readJSON(ctx.root, base(id) + "launch.json")
  const pid = state.state === "running" ? state.pid : launch?.pid
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
  } catch (error) {
    return error.code === "ESRCH" ? false : null
  }
  try {
    const command = execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" })
    return command.includes(worker) && command.includes(`--job ${id}`)
  } catch {
    // An inaccessible process table does not establish that the writer exited.
    return null
  }
}
export function moduleJobStatus(ctx, id) {
  const { input, state } = checkedInput(ctx, id)
  const alive =
    ["queued", "running", "finishing"].includes(state.state) && workerAlive(ctx, id, state)
  const status = {
    ...state,
    module: input.module,
    operation: input.operation,
    state:
      alive === null
        ? "worker_status_unknown"
        : ["queued", "running", "finishing"].includes(state.state) && !alive
          ? "interrupted"
          : state.state,
    worker_alive: alive === null ? null : Boolean(alive),
    resume_available: alive === false && state.state !== "completed",
  }
  return { ...status, recovery: moduleRecoveryPlan(status) }
}
function activeJobs(ctx) {
  const directory = safePath(ctx.root, "module-jobs")
  if (!fs.existsSync(directory)) return []
  return fs
    .readdirSync(directory)
    .filter(validJob)
    .flatMap((id) => {
      // Completed historical jobs can belong to the repository's former
      // location. Verify their saved identity without treating them as live
      // workers. A foreign queued/running owner still fails closed below.
      const { state } = checkedInput(ctx, id, { requireContext: false })
      if (!["queued", "running", "finishing"].includes(state.state)) return []
      return [moduleJobStatus(ctx, id)]
    })
    .filter((job) => job.worker_alive !== false)
}

export async function submitModuleJob(
  ctx,
  moduleId,
  operationId,
  parameters = {},
  { jobId = "module-" + crypto.randomUUID(), resume = false, background = true } = {},
) {
  const { operation } = moduleOperation(moduleId, operationId)
  validateArguments(parameters, operation.inputSchema, ctx)
  const dir = base(jobId)
  const input = {
    schema: "research-module-job-input/v1",
    job_id: jobId,
    module: moduleId,
    operation: operationId,
    parameters,
    files: fileFingerprints(ctx, parameters, operation.inputSchema),
    context: ctx,
    implementation: inputFingerprint(moduleId),
    ...(operation.model ? { policy_sha256: sha256(fs.readFileSync(ctx.policy)) } : {}),
  }
  await submissionLock(ctx.root, async () => {
    const old = readJSON(ctx.root, dir + "input.json")
    if (old && JSON.stringify(old) !== JSON.stringify(input))
      throw Error("Module job input changed; use another job ID")
    if (old) {
      const status = moduleJobStatus(ctx, jobId)
      if (status.state === "completed" || status.worker_alive !== false || !resume) return
      // Only an explicit resume may recover this job's own dead worker lock.
      // Native run/source locks are preserved for their existing recovery tools.
      const lock = readJSON(ctx.root, `locks/module-worker-${jobId}.json`)
      if (lock) recoverLock(ctx.root, "module-worker-" + jobId, lock.owner)
    } else if (resume) throw Error("No stored module job to resume")
    const active = activeJobs(ctx)
    if (active.length >= ctx.maxActiveJobs)
      throw Error("Module worker capacity reached; poll running jobs before submitting")
    if (
      operation.model &&
      active.some((job) => moduleOperation(job.module, job.operation).operation.model)
    )
      throw Error(
        "A model module is already running; collection and read-only modules remain available",
      )
    if (
      operation.network &&
      active.some((job) => moduleOperation(job.module, job.operation).operation.network)
    )
      throw Error("A collection network module is already running; reuse or poll its job")
    if (!old) {
      atomicCreate(ctx.root, dir + "input.json", input)
      atomicWrite(ctx.root, dir + "state.json", {
        schema: "research-module-job/v1",
        job_id: jobId,
        input_sha256: sha256(JSON.stringify(input)),
        state: "queued",
        attempt: 0,
        submitted_at: new Date().toISOString(),
      })
    }
    const state = readJSON(ctx.root, dir + "state.json")
    if (old && resume) {
      const ref = dir + `attempts/${String(state.attempt).padStart(6, "0")}-before-resume.json`
      const snapshot = {
        schema: "research-module-attempt/v1",
        job_id: jobId,
        input_sha256: state.input_sha256,
        state_sha256: sha256(fs.readFileSync(safePath(ctx.root, dir + "state.json"))),
        state,
      }
      const saved = readJSON(ctx.root, ref)
      if (saved && JSON.stringify(saved) !== JSON.stringify(snapshot))
        throw Error("Prior module attempt changed; preserve its recovery history")
      if (!saved) atomicCreate(ctx.root, ref, snapshot)
    }
    atomicWrite(ctx.root, dir + "state.json", {
      ...state,
      state: "queued",
      attempt: state.attempt + 1,
      pid: null,
      error: null,
      error_code: null,
      reasoning_task: null,
      storage_request: null,
    })
    const out = fs.openSync(safePath(ctx.root, dir + "stdout.log"), "a", 0o600)
    const err = fs.openSync(safePath(ctx.root, dir + "stderr.log"), "a", 0o600)
    try {
      const child = spawn(
        process.execPath,
        [worker, "--repo", ctx.repo, "--root", ctx.root, "--job", jobId],
        { cwd: ctx.repo, detached: true, stdio: ["ignore", out, err] },
      )
      await new Promise((resolve, reject) => {
        child.once("spawn", resolve)
        child.once("error", reject)
      })
      atomicWrite(ctx.root, dir + "launch.json", {
        pid: child.pid,
        job_id: jobId,
        attempt: state.attempt + 1,
        launched_at: new Date().toISOString(),
      })
      child.unref()
    } catch (error) {
      atomicWrite(ctx.root, dir + "state.json", {
        ...state,
        state: "failed",
        attempt: state.attempt + 1,
        error: error.message,
        error_code: error.code ?? null,
        finished_at: new Date().toISOString(),
      })
      throw error
    } finally {
      fs.closeSync(out)
      fs.closeSync(err)
    }
  })
  if (!background) {
    while (moduleJobStatus(ctx, jobId).worker_alive)
      await new Promise((resolve) => setTimeout(resolve, 80))
  }
  return moduleJobStatus(ctx, jobId)
}

// Serialize only submission, across both MCP clients and processes. Do not
// steal stale locks or retry side effects after the lock was acquired.
async function submissionLock(root, action) {
  const deadline = Date.now() + 5000
  let release
  while (!release) {
    try {
      release = acquireLock(root, "module-job-submit")
    } catch (error) {
      if (error.code !== "EEXIST") throw error
      if (Date.now() >= deadline)
        throw Error("Module submission lock busy; inspect owner before retrying")
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
  }
  try {
    return await action()
  } finally {
    release()
  }
}

export async function resumeModuleJob(ctx, id, { background = true } = {}) {
  const { input } = checkedInput(ctx, id)
  return submitModuleJob(ctx, input.module, input.operation, input.parameters, {
    jobId: id,
    resume: true,
    background,
  })
}
export function readModuleResult(ctx, id, { offset = 0, limit = 16000 } = {}) {
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 64000
  )
    throw Error("Bounded result offset/limit required")
  const status = moduleJobStatus(ctx, id)
  if (status.state !== "completed" || !status.result)
    throw Error("Completed module result required")
  const bytes = fs.readFileSync(safePath(ctx.root, status.result.path))
  if (sha256(bytes) !== status.result.sha256) throw Error("Module result hash changed")
  const content = bytes.toString("utf8")
  if (offset > content.length) throw Error("Result offset exceeds the stored result")
  const next = Math.min(content.length, offset + limit)
  return {
    job_id: id,
    result: status.result,
    chunk: content.slice(offset, next),
    offset,
    next_offset: next < content.length ? next : null,
    total_characters: content.length,
  }
}

export function loadModuleJobForWorker(ctx, id) {
  const loaded = checkedInput(ctx, id)
  if (
    JSON.stringify(loaded.input.implementation) !==
    JSON.stringify(inputFingerprint(loaded.input.module))
  )
    throw Error("Module implementation changed; use a new job ID")
  const { operation } = moduleOperation(loaded.input.module, loaded.input.operation)
  if (
    loaded.input.policy_sha256 &&
    loaded.input.policy_sha256 !== sha256(fs.readFileSync(loaded.input.context.policy))
  )
    throw Error("Module model policy changed after submission; use a new job ID")
  if (
    JSON.stringify(loaded.input.files) !==
    JSON.stringify(
      fileFingerprints(loaded.input.context, loaded.input.parameters, operation.inputSchema),
    )
  )
    throw Error("Module input file changed after submission")
  return loaded
}
