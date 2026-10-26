import fs from "node:fs"
import { parseArgs } from "node:util"
import { moduleCatalog } from "./module-registry.mjs"
import {
  moduleContext,
  submitModuleJob,
  moduleJobStatus,
  resumeModuleJob,
  readModuleResult,
} from "./module-runtime.mjs"
import { safePath } from "./run-state.mjs"

export async function moduleCLI(args, selectedModule) {
  const { values: v, positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      repo: { type: "string" },
      root: { type: "string" },
      vault: { type: "string" },
      backlog: { type: "string" },
      policy: { type: "string" },
      input: { type: "string" },
      json: { type: "string" },
      job: { type: "string" },
      background: { type: "boolean", default: false },
      offset: { type: "string" },
      limit: { type: "string" },
      round: { type: "string" },
      stage: { type: "string" },
      destination: { type: "string" },
      invocation: { type: "string" },
      "invocation-sha256": { type: "string" },
      sha256: { type: "string" },
    },
  })
  const ctx = moduleContext({
    repo: v.repo,
    root: v.root,
    vault: v.vault,
    backlog: v.backlog,
    policy: v.policy,
  })
  if (v.input && v.json) throw Error("Choose --input FILE or --json JSON")
  if (!selectedModule && positionals[0] === "scheduled-invocation") {
    if (positionals.length !== 1 || v.round || v.input || v.json || v.background)
      throw Error("Scheduled invocation uses only the configured scheduler's actual dispatch")
    const { captureScheduledInvocation } = await import("./schedule-contract.mjs")
    return captureScheduledInvocation(ctx)
  }
  if (!selectedModule && positionals[0] === "timing-benchmark") {
    if (positionals.length !== 1 || !v.input || !v.sha256 || v.json || v.background)
      throw Error("Use timing-benchmark --input FILE --sha256 SHA")
    const { benchmarkReasoningControl } = await import("./operations-benchmark.mjs")
    return benchmarkReasoningControl(ctx, { path: v.input, sha256: v.sha256 })
  }
  if (!selectedModule && positionals[0] === "readiness") {
    if (positionals.length !== 1 || v.input || v.json || v.background)
      throw Error("Readiness is read-only")
    const { operationsReadiness } = await import("./operations-deployment.mjs")
    return operationsReadiness(ctx.repo)
  }
  if (!selectedModule && positionals[0] === "activate-runtime") {
    if (positionals.length !== 1 || !v.destination || v.input || v.json || v.background)
      throw Error("Use activate-runtime --repo WORKSPACE --destination INSTALLED_RUNTIME")
    const { activateOperationsRuntime } = await import("./operations-deployment.mjs")
    return activateOperationsRuntime(v.destination, ctx.repo)
  }
  if (!selectedModule && positionals[0] === "manual-invocation") {
    if (positionals.length !== 1 || !v.round || !v.json || v.input || v.background)
      throw Error('Use manual-invocation --round ID --json \'{"reason":"..."}\'')
    const { captureManualInvocation } = await import("./schedule-contract.mjs")
    const parameters = JSON.parse(v.json)
    if (Object.keys(parameters).some((key) => key !== "reason"))
      throw Error("Manual invocation accepts only reason")
    return captureManualInvocation(ctx, { execution_id: v.round, reason: parameters.reason })
  }
  if (!selectedModule && positionals[0] === "timing-replay") {
    if (positionals.length !== 1 || !v.input || !v.sha256 || v.json || v.background)
      throw Error("Use timing-replay --input FILE --sha256 SHA")
    const { runControlTimingReplay } = await import("./operations-timing.mjs")
    return runControlTimingReplay(ctx, { path: v.input, sha256: v.sha256 })
  }
  if (!selectedModule && positionals[0] === "defects") {
    if (positionals.length !== 1 || v.input || v.json || v.background)
      throw Error("Defect status is read-only")
    const { developmentPendingStatus } = await import("./development-pending.mjs")
    return developmentPendingStatus(ctx.root, {
      round_id: v.round,
      offset: v.offset === undefined ? 0 : Number(v.offset),
      limit: v.limit === undefined ? 20 : Number(v.limit),
    })
  }
  if (!selectedModule && positionals[0] === "install-runtime") {
    if (!v.destination || positionals.length !== 1) throw Error("Runtime destination required")
    const { installOperationsRelease } = await import("./operations-release.mjs")
    return installOperationsRelease(ctx.repo, v.destination)
  }
  if (!selectedModule && v.round) {
    if (positionals.length !== 1 || !["run", "resume", "status", "relay"].includes(positionals[0]))
      throw Error("Use run/resume/status/relay --round ID")
    const { operationalRoundStatus, runOperationalRound, relayOperationalReasoning } =
      await import("./operations-runtime.mjs")
    if (positionals[0] === "status") {
      if (v.json || v.input || v.stage || v.invocation || v.background)
        throw Error("Round status is read-only")
      return operationalRoundStatus(ctx, v.round)
    }
    const parameters = v.json
      ? JSON.parse(v.json)
      : v.input
        ? JSON.parse(fs.readFileSync(v.input === "-" ? 0 : safePath(ctx.repo, v.input)))
        : {}
    if (positionals[0] === "relay")
      return relayOperationalReasoning(ctx, { ...parameters, run_id: v.round })
    return runOperationalRound(
      ctx,
      {
        ...parameters,
        run_id: v.round,
        stage: v.stage,
        invocation_path: v.invocation,
        invocation_sha256: v["invocation-sha256"],
      },
      { resume: positionals[0] === "resume", background: v.background },
    )
  }
  if (
    (selectedModule && positionals[0] === "list") ||
    (!selectedModule && positionals[0] === "list")
  ) {
    if (
      positionals.length !== 1 ||
      v.input ||
      v.json ||
      v.job ||
      v.background ||
      v.offset ||
      v.limit
    )
      throw Error("list accepts no execution arguments")
    return moduleCatalog(selectedModule ? [selectedModule] : undefined)
  }
  if (!selectedModule && ["status", "result", "resume"].includes(positionals[0])) {
    if (positionals.length !== 1 || !v.job || v.input || v.json)
      throw Error("status/result/resume requires only a --job and applicable result options")
    if (positionals[0] !== "result" && (v.offset || v.limit))
      throw Error("offset/limit apply only to result")
    if (positionals[0] !== "resume" && v.background)
      throw Error("background applies only to execution/resume")
    if (positionals[0] === "status") return moduleJobStatus(ctx, v.job)
    if (positionals[0] === "resume")
      return resumeModuleJob(ctx, v.job, { background: v.background })
    return readModuleResult(ctx, v.job, {
      offset: v.offset === undefined ? 0 : Number(v.offset),
      limit: v.limit === undefined ? 16000 : Number(v.limit),
    })
  }
  const [module, operation] = selectedModule
    ? [selectedModule, positionals[0]]
    : positionals[0] === "run"
      ? positionals.slice(1)
      : []
  if (
    !module ||
    !operation ||
    positionals.length !== (selectedModule ? 1 : 3) ||
    v.offset ||
    v.limit
  )
    throw Error(
      "Use list | run MODULE OPERATION [--input FILE|--json JSON] [--job module-ID] [--background] | status/result/resume --job module-ID",
    )
  const parameters = v.json
    ? JSON.parse(v.json)
    : v.input
      ? JSON.parse(fs.readFileSync(v.input === "-" ? 0 : safePath(ctx.repo, v.input), "utf8"))
      : {}
  const job = await submitModuleJob(ctx, module, operation, parameters, {
    ...(v.job ? { jobId: v.job } : {}),
    background: v.background,
  })
  if (v.background || job.state !== "completed") return job
  const result = readModuleResult(ctx, job.job_id, { limit: 64000 })
  if (result.next_offset !== null) return { ...job, result_page: result }
  return { job, ...JSON.parse(result.chunk) }
}
