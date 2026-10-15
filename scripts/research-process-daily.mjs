import fs from "node:fs"
import { parseArgs } from "node:util"
import { processDailyCandidates } from "./research/daily-processing.mjs"
import { processDailyEditorial } from "./research/daily-editorial.mjs"
import { processDailyQueueEditorial } from "./research/daily-queue-editorial.mjs"
import { DEFAULT_ROOT } from "./research/run-state.mjs"

const { values: v } = parseArgs({
  strict: true,
  options: {
    root: { type: "string" },
    run: { type: "string" },
    "daily-run": { type: "string" },
    "collection-basis": { type: "string" },
    "article-image-intakes": { type: "string", multiple: true },
    "from-processing": { type: "string" },
    "from-queue": { type: "string" },
    "ontology-base": { type: "string" },
    "max-items": { type: "string" },
    "time-budget-ms": { type: "string" },
    "candidate-keys": { type: "string", multiple: true },
    "model-policy": { type: "string" },
    "processing-recoveries": { type: "string" },
    vault: { type: "string" },
    backlog: { type: "string" },
    "review-files": { type: "string" },
    "deep-review-files": { type: "string" },
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
if (v["from-processing"] && v["from-queue"]) throw Error("Choose --from-processing or --from-queue")
if ((v["max-items"] || v["time-budget-ms"]) && !v["from-queue"])
  throw Error("Editorial execution limits require --from-queue")
if (v["ontology-base"] && !v["from-queue"])
  throw Error("Ontology continuation requires --from-queue")
if (v["editorial-review-files"] && !v["from-processing"] && !v["from-queue"])
  throw Error("Editorial reviews require --from-processing or --from-queue")
if (v["deep-review-files"] && !v["from-processing"] && !v["from-queue"])
  throw Error("Deep source reviews require --from-processing or --from-queue")
if (v["editorial-processing-runs"] && !v["from-processing"])
  throw Error("Editorial processing runs require --from-processing")
if (v["source-revision-reviews"] && !v["from-processing"])
  throw Error("Source revision reviews require --from-processing")
if (
  (v["from-processing"] || v["from-queue"]) &&
  (v["daily-run"] ||
    v["processing-runs"] ||
    v["processing-recoveries"] ||
    v["evidence-think"] ||
    v["collection-basis"])
)
  throw Error("Stored editorial continuation uses the frozen processing input")
if (
  v["article-image-intakes"] &&
  (v["from-processing"] || v["from-queue"] || v["collection-basis"])
)
  throw Error("Native image intakes require a new daily processing handoff")
console.log(
  JSON.stringify(
    v["from-queue"]
      ? await processDailyQueueEditorial({
          root: v.root || DEFAULT_ROOT,
          runId: v.run,
          queueRun: v["from-queue"],
          ontologyBase: v["ontology-base"],
          candidateKeys: v["candidate-keys"],
          policyFile: v["model-policy"],
          vault: v.vault,
          backlogFile: v.backlog,
          execute: v.execute || v.resume,
          maxItems: v["max-items"] === undefined ? undefined : Number(v["max-items"]),
          timeBudgetMs: v["time-budget-ms"] === undefined ? undefined : Number(v["time-budget-ms"]),
          reviewFiles: v["review-files"]
            ? JSON.parse(fs.readFileSync(v["review-files"], "utf8"))
            : {},
          deepReviewFiles: v["deep-review-files"]
            ? JSON.parse(fs.readFileSync(v["deep-review-files"], "utf8"))
            : {},
          editorialReviewFiles: v["editorial-review-files"]
            ? JSON.parse(fs.readFileSync(v["editorial-review-files"], "utf8"))
            : {},
        })
      : v["from-processing"]
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
            deepReviewFiles: v["deep-review-files"]
              ? JSON.parse(fs.readFileSync(v["deep-review-files"], "utf8"))
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
            articleImageIntakes: v["article-image-intakes"],
            candidateKeys: v["candidate-keys"],
            policyFile: v["model-policy"],
            vault: v.vault,
            backlogFile: v.backlog,
            execute: v.execute || v.resume,
            reviewFiles: v["review-files"]
              ? JSON.parse(fs.readFileSync(v["review-files"], "utf8"))
              : {},
            processingRecoveries: v["processing-recoveries"]
              ? JSON.parse(fs.readFileSync(v["processing-recoveries"], "utf8"))
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
