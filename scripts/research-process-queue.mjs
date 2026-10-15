import fs from "node:fs"
import { parseArgs } from "node:util"
import { processDailyQueue } from "./research/daily-processing-queue.mjs"
import { DEFAULT_ROOT } from "./research/run-state.mjs"

const { values: v } = parseArgs({
  strict: true,
  options: {
    root: { type: "string" },
    run: { type: "string" },
    "daily-run": { type: "string" },
    "collection-basis": { type: "string" },
    "model-policy": { type: "string" },
    "processing-recoveries": { type: "string" },
    "source-review-files": { type: "string" },
    backlog: { type: "string" },
    vault: { type: "string" },
    limit: { type: "string", default: "40" },
    "max-items": { type: "string", default: "4" },
    "time-budget-ms": { type: "string", default: "1800000" },
    "plan-only": { type: "boolean", default: false },
    execute: { type: "boolean", default: false },
    resume: { type: "boolean", default: false },
  },
})
if ([v["plan-only"], v.execute, v.resume].filter(Boolean).length !== 1)
  throw Error("Use --plan-only, --execute or --resume with a frozen collection basis")
if (v.root && !v.backlog) throw Error("A custom processing root requires an explicit --backlog")
console.log(
  JSON.stringify(
    await processDailyQueue({
      root: v.root || DEFAULT_ROOT,
      runId: v.run,
      dailyRunId: v["daily-run"],
      collectionBasis: v["collection-basis"],
      policyFile: v["model-policy"],
      processingRecoveries: v["processing-recoveries"]
        ? JSON.parse(fs.readFileSync(v["processing-recoveries"], "utf8"))
        : undefined,
      sourceReviewFiles: v["source-review-files"]
        ? JSON.parse(fs.readFileSync(v["source-review-files"], "utf8"))
        : undefined,
      backlogFile: v.backlog,
      vault: v.vault,
      limit: Number(v.limit),
      maxItems: Number(v["max-items"]),
      timeBudgetMs: Number(v["time-budget-ms"]),
      execute: v.execute || v.resume,
    }),
    null,
    2,
  ),
)
