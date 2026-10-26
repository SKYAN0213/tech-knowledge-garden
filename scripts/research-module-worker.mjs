import fs from "node:fs"
import { parseArgs } from "node:util"
import { moduleContext, loadModuleJobForWorker } from "./research/module-runtime.mjs"
import { executeModule } from "./research/module-registry.mjs"
import { atomicCreate, atomicWrite, readJSON, withLock } from "./research/run-state.mjs"
import { safePath } from "./research/run-state.mjs"
import { sha256 } from "./research/contracts.mjs"
import { trimColdStorage } from "./research/cold-storage.mjs"
import { withRequestOwner } from "./research/request-ownership.mjs"
import { inspectOperationalPin } from "./research/operations-release.mjs"
import { recordJobDevelopmentFailure } from "./research/development-pending.mjs"
import { recordOperationalJobTiming } from "./research/operations-timing.mjs"

const { values } = parseArgs({
  options: { repo: { type: "string" }, root: { type: "string" }, job: { type: "string" } },
})
let workerContext
try {
  const initial = moduleContext({ repo: values.repo, root: values.root })
  workerContext = initial
  const { input } = loadModuleJobForWorker(initial, values.job)
  const ctx = moduleContext(input.context)
  workerContext = ctx
  if (
    ctx.operationalRound &&
    sha256(JSON.stringify(inspectOperationalPin(ctx, ctx.operationalRound.round_id))) !==
      ctx.operationalRound.round_input_sha256
  )
    throw Error("Operational worker round pin changed")
  if (process.cwd() !== ctx.repo) throw Error("Module worker must use the selected repository cwd")
  await withLock(ctx.root, "module-worker-" + values.job, async () => {
    const { state } = loadModuleJobForWorker(ctx, values.job)
    const base = `module-jobs/${values.job}/`
    if (state.result && fs.existsSync(safePath(ctx.root, state.result.path))) {
      const bytes = fs.readFileSync(safePath(ctx.root, state.result.path))
      if (
        sha256(bytes) !== state.result.sha256 ||
        JSON.parse(bytes).input_sha256 !== state.input_sha256
      )
        throw Error("Interrupted module result changed")
      atomicWrite(ctx.root, base + "state.json", {
        ...state,
        state: "completed",
        finished_at: new Date().toISOString(),
        result_recovered: true,
      })
      return
    }
    const started = Date.now()
    const running = {
      ...state,
      state: "running",
      pid: process.pid,
      started_at: new Date().toISOString(),
    }
    atomicWrite(ctx.root, base + "state.json", running)
    try {
      const data = await withRequestOwner(
        { job_id: values.job, input_sha256: state.input_sha256, ...(ctx.operationalRound || {}) },
        () => executeModule(ctx, input.module, input.operation, input.parameters),
      )
      const envelope = {
        schema: "research-module-result/v1",
        input_sha256: running.input_sha256,
        module: input.module,
        operation: input.operation,
        native_status: data?.status ?? null,
        run_id: input.parameters.run_id ?? null,
        observed_at: new Date().toISOString(),
        data,
      }
      const bytes = JSON.stringify(envelope, null, 2) + "\n"
      atomicWrite(ctx.root, base + "state.json", {
        ...running,
        state: "finishing",
        result: { path: base + "result.json", sha256: sha256(bytes) },
      })
      const result = atomicCreate(ctx.root, base + "result.json", bytes)
      atomicWrite(ctx.root, base + "state.json", {
        ...running,
        state: "completed",
        finished_at: new Date().toISOString(),
        elapsed_ms: Date.now() - started,
        native_status: envelope.native_status,
        result,
        error: null,
      })
    } catch (error) {
      const latest = readJSON(ctx.root, base + "state.json")
      const failure = {
        ...running,
        ...(latest?.state === "finishing" ? { result: latest.result } : {}),
        state:
          error.code === "REASONING_PENDING"
            ? "waiting_for_reasoning"
            : error.code === "STORAGE_PENDING"
              ? "waiting_for_storage"
              : "failed",
        finished_at: new Date().toISOString(),
        elapsed_ms: Date.now() - started,
        error: error.message,
        error_code: error.code ?? null,
        ...(error.reasoning_task ? { reasoning_task: error.reasoning_task } : {}),
        ...(error.storage_request ? { storage_request: error.storage_request } : {}),
      }
      let captureError
      if (!["REASONING_PENDING", "STORAGE_PENDING"].includes(error.code)) {
        try {
          failure.development_pending = recordJobDevelopmentFailure(ctx, input, running, error)
        } catch (problem) {
          captureError = problem
          failure.development_pending = {
            status: "capture_failed",
            error: problem.message,
            automatic_retry: false,
          }
        }
      }
      atomicWrite(ctx.root, base + "state.json", failure)
      console.error(error.message)
      if (captureError) throw captureError
      if (!["REASONING_PENDING", "STORAGE_PENDING"].includes(error.code)) process.exitCode = 1
    }
  })
  recordOperationalJobTiming(ctx, values.job)
  if (readJSON(ctx.root, `module-jobs/${values.job}/state.json`)?.state === "completed")
    trimColdStorage(ctx.root)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
  if (workerContext && /^module-[A-Za-z0-9_-]{1,100}$/.test(values.job || "")) {
    const base = `module-jobs/${values.job}/`,
      state = readJSON(workerContext.root, base + "state.json")
    // Do not overwrite a result or another active attempt if lock acquisition failed.
    const lock = readJSON(workerContext.root, `locks/module-worker-${values.job}.json`)
    if (state?.state === "queued" && !lock)
      atomicWrite(workerContext.root, base + "state.json", {
        ...state,
        state: "failed",
        error: error.message,
        finished_at: new Date().toISOString(),
      })
  }
}
