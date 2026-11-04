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
import { moduleJobTiming } from "./operations-timing.mjs"
import { assertRetiredWorkspaceFences } from "./retired-workspace-fence.mjs"
import { partialRecoveryManifest } from "./replacement-scope.mjs"

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
  operationalRound,
  executionRepo,
} = {}) {
  repo = fs.realpathSync(repo)
  const loadedRepo = fs.realpathSync(defaultRepo)
  executionRepo = fs.realpathSync(
    executionRepo ||
      (fs.existsSync(path.join(loadedRepo, ".local/.storage/runtime-release.json"))
        ? loadedRepo
        : repo),
  )
  if (executionRepo !== repo && executionRepo !== loadedRepo)
    throw Error("Module execution must use its loaded immutable runtime")
  if (
    operationalRound &&
    (Object.keys(operationalRound).sort().join(",") !== "round_id,round_input_sha256" ||
      !/^[A-Za-z0-9_-]{1,70}$/.test(operationalRound.round_id || "") ||
      !/^[a-f0-9]{64}$/.test(operationalRound.round_input_sha256 || ""))
  )
    throw Error("Exact operational round identity required")
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
    ...(executionRepo !== repo ? { executionRepo } : {}),
    ...(operationalRound ? { operationalRound } : {}),
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
        "combined-review.mjs",
        "concept-candidate-index.mjs",
        "verified-inputs.mjs",
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
        "recovered-daily-report.mjs",
        "source-run-recovery.mjs",
        "collection-resilience.mjs",
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
          "recovered-daily-report.mjs",
          "storage-request.mjs",
          "source-run-recovery.mjs",
          "collection-resilience.mjs",
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
                "article-semantic-review.mjs",
                "concept-candidate-index.mjs",
                "semantic-review-metrics.mjs",
                "article-concept-review.mjs",
                "../../data/research-semantic-retrieval-policy.json",
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
                "claims.mjs",
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
                "../knowledge.mjs",
                "../explanations.mjs",
                "../../web/graph-model.mjs",
                "../../web/article-semantic-index.mjs",
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
        "request-ownership.mjs",
        "relay-ledger.mjs",
        "relay-scheduling.mjs",
        "schedule-contract.mjs",
        "operations-release.mjs",
        "operations-runtime.mjs",
        "operations-driver.mjs",
        "operations-continuation.mjs",
        "development-pending.mjs",
        "operations-timing.mjs",
        "operations-deployment.mjs",
        "retired-workspace-fence.mjs",
        "../../data/research-retired-workspaces.json",
        "storage-selection.mjs",
        "../../data/research-storage-exclusions.json",
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
function processPresent(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === "ESRCH" ? false : null
  }
}
function workerAlive(ctx, id, state) {
  const launch = readJSON(ctx.root, base(id) + "launch.json")
  const pid = state.state === "running" ? state.pid : launch?.pid
  if (!Number.isInteger(pid) || pid <= 0) return false
  const present = processPresent(pid)
  if (present !== true) return present
  try {
    // Read kernel state and untruncated argv in one snapshot. A zombie still
    // passes kill(pid, 0), but cannot write or retain its original command line.
    const output = execFileSync("ps", ["-ww", "-p", String(pid), "-o", "stat=", "-o", "command="], {
      encoding: "utf8",
    })
    const states = process.platform === "darwin" ? "IRSTUZ" : "DIRSTtWXZ"
    const observed = output
      .trim()
      .match(new RegExp(String.raw`^([${states}][+<>AELNSVWXsl]*)[ \t]+([\s\S]+)$`))
    if (observed) {
      const [, status, command] = observed
      if (status[0] === "Z" || (process.platform === "linux" && status[0] === "X")) return false
      const jobArgument = new RegExp(String.raw`(?:^|\s)--job\s+${id}(?=\s|$)`)
      if (command.includes(worker) && jobArgument.test(command)) return true
    }
  } catch {
    // ps failure is not exit evidence; only a fresh ESRCH can establish that
    // the worker vanished after the initial successful existence probe.
  }
  // Live/reused PIDs, EPERM, malformed output and inaccessible argv stay unknown.
  return processPresent(pid) === false ? false : null
}
function terminalWorkerAlive(ctx, id, state) {
  let lock
  try {
    lock = readJSON(ctx.root, `locks/module-worker-${id}.json`)
  } catch (error) {
    // A worker can release the lock between its existence check and read.
    // Re-observe later; this race does not prove that the worker exited.
    if (error.code === "ENOENT") return null
    throw error
  }
  if (!lock) {
    // Once the worker releases its lock, it has no further cleanup to write.
    // Preserve an uncertain process probe instead of treating it as exited.
    return workerAlive(ctx, id, state)
  }
  if (Number.isSafeInteger(lock.pid) && lock.pid > 0 && processPresent(lock.pid) === false)
    // A stale lock alone is not enough: the recorded worker may still be
    // alive under a different PID, or its identity may be unobservable.
    return workerAlive(ctx, id, state) === false ? false : null
  const launch = readJSON(ctx.root, base(id) + "launch.json")
  if (
    !Number.isSafeInteger(lock.pid) ||
    lock.pid <= 0 ||
    lock.pid !== launch?.pid ||
    (Number.isSafeInteger(state.pid) && state.pid > 0 && state.pid !== lock.pid)
  )
    return null
  return workerAlive(ctx, id, state)
}
export function moduleJobStatus(ctx, id) {
  let { input, state } = checkedInput(ctx, id)
  const active = ["queued", "running", "finishing"].includes(state.state)
  let alive = active ? workerAlive(ctx, id, state) : terminalWorkerAlive(ctx, id, state)
  if (active) {
    // The worker can save its final state and exit during the process probe.
    // Only a freshly validated native state can supersede an uncertain probe.
    const latest = checkedInput(ctx, id)
    if (
      ["completed", "failed", "waiting_for_reasoning", "waiting_for_storage"].includes(
        latest.state.state,
      )
    ) {
      input = latest.input
      state = latest.state
      alive = terminalWorkerAlive(ctx, id, state)
    }
  }
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
  return {
    ...status,
    timing: moduleJobTiming(ctx.root, state),
    recovery: moduleRecoveryPlan(status),
  }
}
function activeJobs(ctx) {
  const directory = safePath(ctx.root, "module-jobs")
  if (!fs.existsSync(directory)) return []
  return fs
    .readdirSync(directory)
    .filter(validJob)
    .flatMap((id) => {
      // Completed historical jobs can belong to the repository's former
      // location. Only probe terminal jobs if a worker still owns cleanup.
      // A foreign active or cleanup owner still fails closed below.
      const { state } = checkedInput(ctx, id, { requireContext: false })
      if (
        !["queued", "running", "finishing"].includes(state.state) &&
        !fs.existsSync(safePath(ctx.root, `locks/module-worker-${id}.json`))
      )
        return []
      return [moduleJobStatus(ctx, id)]
    })
    .filter((job) => job.worker_alive !== false)
}

// Recover only collection locks created by this exact interrupted worker.
// Other rounds, legacy unbound locks, unknown owners, publication and Drive
// locks remain untouched. Each original lock is recorded before removal.
export function recoverInterruptedCollectionLocks(ctx, jobId) {
  return recoverInterruptedWorkflowLocks(ctx, jobId, "collection")
}

export function recoverInterruptedProcessingLocks(ctx, jobId) {
  return recoverInterruptedWorkflowLocks(ctx, jobId, "processing")
}

function recoverInterruptedWorkflowLocks(ctx, jobId, kind) {
  const { input, state } = checkedInput(ctx, jobId)
  const owner = input.context.operationalRound
  const params = input.parameters || {}
  const collection = kind === "collection"
  if (
    input.module !== "edition" ||
    input.operation !== "advance" ||
    params.round !== true ||
    (collection
      ? params.collect !== true || params.stop_after_collection !== true
      : params.collect !== false) ||
    !owner ||
    !/^[A-Za-z0-9_-]{1,70}$/.test(owner.round_id || "") ||
    !/^[a-f0-9]{64}$/.test(owner.round_input_sha256 || "") ||
    owner.round_id !== params.run_id ||
    (collection && owner.round_id !== params.daily_run) ||
    state.state !== "running" ||
    !Number.isSafeInteger(state.pid) ||
    state.pid <= 0 ||
    !Number.isFinite(Date.parse(state.started_at || ""))
  )
    throw Error("Exact interrupted " + kind + " job and round ownership required")
  const pin = readJSON(ctx.root, `operations/rounds/${owner.round_id}/input.json`)
  if (!pin || sha256(JSON.stringify(pin)) !== owner.round_input_sha256)
    throw Error("Interrupted collection round ownership changed; preserve locks")
  let curationRun
  if (!collection) {
    const manifest = partialRecoveryManifest({ ...ctx, operationalRound: owner })
    const launch = readJSON(ctx.root, `${base(jobId)}launch.json`)
    if (
      !manifest ||
      launch?.pid !== state.pid ||
      launch.job_id !== jobId ||
      launch.attempt !== state.attempt ||
      !Number.isFinite(Date.parse(launch.launched_at || ""))
    )
      throw Error("Exact interrupted partial recovery worker launch required; preserve locks")
    curationRun =
      "round-curation-" + sha256(JSON.stringify([owner.round_id, manifest.selection])).slice(0, 48)
  }
  const expectedOwner = {
    job_id: jobId,
    input_sha256: state.input_sha256,
    round_id: owner.round_id,
    round_input_sha256: owner.round_input_sha256,
  }
  function assertWorkerGroupGone() {
    if (processPresent(state.pid) !== false)
      throw Error("Collection worker is active or unknown; preserve locks")
    try {
      process.kill(-state.pid, 0)
      throw Error("Collection worker process group remains active; preserve locks")
    } catch (error) {
      if (error.code !== "ESRCH") throw error
    }
  }
  assertWorkerGroupGone()
  const directory = safePath(ctx.root, "locks")
  const names = fs.existsSync(directory)
    ? fs.readdirSync(directory).filter((name) => name.endsWith(".json"))
    : []
  const allow = (name) =>
    name === `round-workflow-${owner.round_id}` ||
    (collection
      ? ["garden-operation", "daily-acquisition"].includes(name) ||
        /^(?:collection-source|run)-[A-Za-z0-9_.-]+$/.test(name) ||
        /^(?:source|source-policy|policy-watch)-[a-f0-9]{20}$/.test(name) ||
        /^host-[a-f0-9]{32}$/.test(name)
      : name === `curation-workflow-${curationRun}` ||
        name === "event-selection" ||
        /^event-workflow-cur-events-[a-f0-9]{40}$/.test(name) ||
        /^run-event-[a-f0-9]{36}$/.test(name) ||
        /^(?:event-cache-|run-)ev-facts-[a-f0-9]{40}$/.test(name) ||
        /^run-sel-[a-f0-9]{24}-(?:[0-9]+|bundle)$/.test(name) ||
        /^event-publication-event-publication-[a-f0-9]{40}$/.test(name))
  const locks = []
  for (const filename of names) {
    const name = filename.slice(0, -5),
      file = safePath(ctx.root, `locks/${filename}`)
    let bytes, record
    try {
      bytes = fs.readFileSync(file)
      record = JSON.parse(bytes)
    } catch (error) {
      if (error.code === "ENOENT") continue
      throw Error("Unreadable lock ownership; preserve collection locks")
    }
    if (
      !record ||
      typeof record !== "object" ||
      Array.isArray(record) ||
      !Number.isSafeInteger(record.pid) ||
      record.pid <= 0
    )
      throw Error("Unknown lock ownership; preserve collection locks")
    if (record.pid !== state.pid) continue
    const moduleLock = name === `module-worker-${jobId}`
    const bound = record.request_owner
    const ownerMatches =
      bound &&
      Object.keys(bound).sort().join(",") === Object.keys(expectedOwner).sort().join(",") &&
      Object.entries(expectedOwner).every(([key, value]) => bound[key] === value)
    const lockStarted = Date.parse(record.started_at || "")
    if (
      (!moduleLock && (!allow(name) || !ownerMatches)) ||
      (moduleLock && bound && !ownerMatches) ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(record.owner || "") ||
      !Number.isFinite(lockStarted) ||
      (moduleLock
        ? !Number.isFinite(Date.parse(state.queued_at || "")) ||
          lockStarted < Date.parse(state.queued_at) ||
          lockStarted > Date.parse(state.started_at)
        : lockStarted < Date.parse(state.started_at))
    )
      throw Error("Collection lock ownership is unknown or changed; preserve all locks")
    locks.push({
      name,
      owner: record.owner,
      sha256: sha256(bytes),
      raw_base64: bytes.toString("base64"),
    })
  }
  if (!locks.length) return { recovered: [], receipt: null }
  locks.sort((a, b) => {
    const weight = (name) =>
      name === `module-worker-${jobId}`
        ? 4
        : name === "garden-operation"
          ? 3
          : name === "daily-acquisition"
            ? 2
            : name.startsWith("round-workflow-")
              ? 1
              : 0
    return weight(a.name) - weight(b.name) || a.name.localeCompare(b.name)
  })
  const receipt = atomicCreate(
    ctx.root,
    `module-jobs/${jobId}/lock-recovery/${crypto.randomUUID()}.json`,
    {
      schema: `research-interrupted-${kind}-lock-recovery/v1`,
      job_id: jobId,
      input_sha256: state.input_sha256,
      round_id: owner.round_id,
      round_input_sha256: owner.round_input_sha256,
      worker_pid: state.pid,
      worker_started_at: state.started_at,
      observed_at: new Date().toISOString(),
      locks,
    },
  )
  assertWorkerGroupGone()
  for (const lock of locks) {
    const current = fs.readFileSync(safePath(ctx.root, `locks/${lock.name}.json`))
    if (sha256(current) !== lock.sha256)
      throw Error("Collection lock changed; preserve remaining locks")
  }
  for (const lock of locks) recoverLock(ctx.root, lock.name, lock.owner)
  const result = atomicCreate(ctx.root, receipt.path.replace(/\.json$/, "-result.json"), {
    schema: `research-interrupted-${kind}-lock-recovery-result/v1`,
    receipt,
    recovered: locks.map((lock) => lock.name),
    completed_at: new Date().toISOString(),
  })
  return { recovered: locks.map((lock) => lock.name), receipt, result }
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
  assertRetiredWorkspaceFences(ctx.executionRepo || ctx.repo, ctx.repo)
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
    let priorStatus
    if (old) {
      priorStatus = moduleJobStatus(ctx, jobId)
      if (priorStatus.state === "completed" || priorStatus.worker_alive !== false || !resume) return
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
    if (old && resume) {
      // Only this exact job's dead worker lock may be recovered on resume.
      const lock = readJSON(ctx.root, `locks/module-worker-${jobId}.json`)
      let recovered = []
      if (
        lock &&
        priorStatus.state === "interrupted" &&
        priorStatus.pid &&
        lock.pid !== priorStatus.pid
      )
        throw Error("Module worker lock ownership changed; preserve locks")
      if (
        priorStatus.state === "interrupted" &&
        priorStatus.pid &&
        readJSON(ctx.root, dir + "state.json")?.state === "running" &&
        input.module === "edition" &&
        input.operation === "advance" &&
        input.parameters.round === true &&
        input.parameters.collect === true &&
        input.parameters.stop_after_collection === true &&
        input.context.operationalRound
      ) {
        if (active.length)
          throw Error("Another active or unknown worker; preserve collection locks")
        recovered = recoverInterruptedCollectionLocks(ctx, jobId).recovered
      }
      if (
        priorStatus.state === "interrupted" &&
        priorStatus.pid &&
        readJSON(ctx.root, dir + "state.json")?.state === "running" &&
        input.module === "edition" &&
        input.operation === "advance" &&
        input.parameters.round === true &&
        input.parameters.collect === false &&
        input.context.operationalRound &&
        partialRecoveryManifest(input.context)
      ) {
        if (active.length)
          throw Error("Another active or unknown worker; preserve processing locks")
        recovered = recoverInterruptedProcessingLocks(ctx, jobId).recovered
      }
      if (lock && !recovered.includes("module-worker-" + jobId))
        recoverLock(ctx.root, "module-worker-" + jobId, lock.owner)
    }
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
      queued_at: new Date().toISOString(),
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
    while (true) {
      const alive = moduleJobStatus(ctx, jobId).worker_alive
      if (alive === false) break
      // Do not launch a replacement when the owner cannot be observed. Return
      // the native recovery status so the controller can wait for visibility.
      if (alive === null) return moduleJobStatus(ctx, jobId)
      await new Promise((resolve) => setTimeout(resolve, 80))
    }
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
  return submitModuleJob(
    {
      ...ctx,
      ...(input.context.operationalRound
        ? { operationalRound: input.context.operationalRound }
        : {}),
    },
    input.module,
    input.operation,
    input.parameters,
    {
      jobId: id,
      resume: true,
      background,
    },
  )
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
