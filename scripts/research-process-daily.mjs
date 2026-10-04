import fs from "node:fs"
import { parseArgs } from "node:util"
import { processDailyCandidates } from "./research/daily-processing.mjs"
import { DEFAULT_ROOT } from "./research/run-state.mjs"

const { values: v } = parseArgs({
  strict: true,
  options: {
    root: { type: "string" },
    run: { type: "string" },
    "daily-run": { type: "string" },
    "candidate-keys": { type: "string", multiple: true },
    "model-policy": { type: "string" },
    vault: { type: "string" },
    backlog: { type: "string" },
    "review-files": { type: "string" },
    "processing-runs": { type: "string" },
    "plan-only": { type: "boolean", default: false },
    execute: { type: "boolean", default: false },
    resume: { type: "boolean", default: false },
  },
})
if ([v["plan-only"], v.execute, v.resume].filter(Boolean).length !== 1)
  throw Error("Use --plan-only, --execute or --resume with --run, --daily-run and --candidate-keys")
if (v.root && !v.backlog) throw Error("A custom processing root requires an explicit --backlog")
console.log(
  JSON.stringify(
    await processDailyCandidates({
      root: v.root || DEFAULT_ROOT,
      runId: v.run,
      dailyRunId: v["daily-run"],
      candidateKeys: v["candidate-keys"],
      policyFile: v["model-policy"],
      vault: v.vault,
      backlogFile: v.backlog,
      execute: v.execute || v.resume,
      reviewFiles: v["review-files"] ? JSON.parse(fs.readFileSync(v["review-files"], "utf8")) : {},
      processingRuns: v["processing-runs"]
        ? JSON.parse(fs.readFileSync(v["processing-runs"], "utf8"))
        : {},
    }),
    null,
    2,
  ),
)
