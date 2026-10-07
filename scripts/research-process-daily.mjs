import fs from "node:fs"
import { parseArgs } from "node:util"
import { processDailyCandidates } from "./research/daily-processing.mjs"
import { processDailyEditorial } from "./research/daily-editorial.mjs"
import { DEFAULT_ROOT } from "./research/run-state.mjs"

const { values: v } = parseArgs({
  strict: true,
  options: {
    root: { type: "string" },
    run: { type: "string" },
    "daily-run": { type: "string" },
    "collection-basis": { type: "string" },
    "from-processing": { type: "string" },
    "candidate-keys": { type: "string", multiple: true },
    "model-policy": { type: "string" },
    vault: { type: "string" },
    backlog: { type: "string" },
    "review-files": { type: "string" },
    "editorial-review-files": { type: "string" },
    "editorial-processing-runs": { type: "string" },
    "source-revision-reviews": { type: "string" },
    "processing-runs": { type: "string" },
    "evidence-think": { type: "string" },
    "plan-only": { type: "boolean", default: false },
    execute: { type: "boolean", default: false },
    resume: { type: "boolean", default: false },
  },
})
if ([v["plan-only"], v.execute, v.resume].filter(Boolean).length !== 1)
  throw Error("Use --plan-only, --execute or --resume with --run, --daily-run and --candidate-keys")
if (v.root && !v.backlog) throw Error("A custom processing root requires an explicit --backlog")
if (v["editorial-review-files"] && !v["from-processing"])
  throw Error("Editorial reviews require --from-processing")
if (v["editorial-processing-runs"] && !v["from-processing"])
  throw Error("Editorial processing runs require --from-processing")
if (v["source-revision-reviews"] && !v["from-processing"])
  throw Error("Source revision reviews require --from-processing")
if (
  v["from-processing"] &&
  (v["daily-run"] || v["processing-runs"] || v["evidence-think"] || v["collection-basis"])
)
  throw Error("Stored editorial continuation uses the frozen processing input")
console.log(
  JSON.stringify(
    v["from-processing"]
      ? await processDailyEditorial({
          root: v.root || DEFAULT_ROOT,
          runId: v.run,
          processingRun: v["from-processing"],
          candidateKeys: v["candidate-keys"],
          policyFile: v["model-policy"],
          vault: v.vault,
          backlogFile: v.backlog,
          execute: v.execute || v.resume,
          reviewFiles: v["review-files"]
            ? JSON.parse(fs.readFileSync(v["review-files"], "utf8"))
            : {},
          editorialReviewFiles: v["editorial-review-files"]
            ? JSON.parse(fs.readFileSync(v["editorial-review-files"], "utf8"))
            : {},
          editorialProcessingRuns: v["editorial-processing-runs"]
            ? JSON.parse(fs.readFileSync(v["editorial-processing-runs"], "utf8"))
            : {},
          sourceRevisionReviews: v["source-revision-reviews"]
            ? JSON.parse(fs.readFileSync(v["source-revision-reviews"], "utf8"))
            : {},
        })
      : await processDailyCandidates({
          root: v.root || DEFAULT_ROOT,
          runId: v.run,
          dailyRunId: v["daily-run"],
          collectionBasis: v["collection-basis"],
          candidateKeys: v["candidate-keys"],
          policyFile: v["model-policy"],
          vault: v.vault,
          backlogFile: v.backlog,
          execute: v.execute || v.resume,
          reviewFiles: v["review-files"]
            ? JSON.parse(fs.readFileSync(v["review-files"], "utf8"))
            : {},
          processingRuns: v["processing-runs"]
            ? JSON.parse(fs.readFileSync(v["processing-runs"], "utf8"))
            : {},
          evidenceThink:
            v["evidence-think"] === "false"
              ? false
              : v["evidence-think"] === "true"
                ? true
                : v["evidence-think"],
        }),
    null,
    2,
  ),
)
