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
