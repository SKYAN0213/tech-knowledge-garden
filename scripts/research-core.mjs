import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { advanceDailyCore } from "./research/daily-core.mjs"
import { DEFAULT_ROOT } from "./research/run-state.mjs"

const repo = fileURLToPath(new URL("../", import.meta.url))
const defaultFile = (value, fallback) => (value ? path.resolve(value) : path.join(repo, fallback))

const { values: v } = parseArgs({
  strict: true,
  options: {
    root: { type: "string" },
    run: { type: "string" },
    round: { type: "boolean", default: false },
    report: { type: "string" },
    "report-sha256": { type: "string" },
    "daily-run": { type: "string" },
    "queue-run": { type: "string" },
    edition: { type: "string" },
    "edition-sha256": { type: "string" },
    "event-plan": { type: "string" },
    "event-plan-sha256": { type: "string" },
    curation: { type: "string" },
    "curation-sha256": { type: "string" },
    "event-proposals": { type: "boolean", default: false },
    "event-offset": { type: "string" },
    "event-fact-reviews": { type: "string" },
    "event-editorial-reviews": { type: "string" },
    "event-revision-reviews": { type: "string" },
    "event-completeness-reviews": { type: "string" },
    "event-coverage-reviews": { type: "string" },
    "event-retry-groups": { type: "string" },
    "event-note-reviews": { type: "string" },
    "connection-review-run": { type: "string" },
    "collection-basis": { type: "string" },
    collect: { type: "boolean", default: false },
    "collection-max-windows": { type: "string" },
    "collection-time-budget-ms": { type: "string" },
    "editorial-only": { type: "boolean", default: false },
    config: { type: "string" },
    "model-policy": { type: "string" },
    "processing-recoveries": { type: "string" },
    "source-review-files": { type: "string" },
    vault: { type: "string" },
    backlog: { type: "string" },
    "drive-snapshot": { type: "string" },
    "ontology-base": { type: "string" },
    "company-review": { type: "string" },
    limit: { type: "string" },
    "max-items": { type: "string" },
    "time-budget-ms": { type: "string" },
    "max-model-calls": { type: "string" },
    "retry-failed": { type: "boolean", default: false },
    "review-files": { type: "string" },
    "deep-review-files": { type: "string" },
    "editorial-review-files": { type: "string" },
    "knowledge-inputs": { type: "string" },
    "knowledge-selections": { type: "string" },
    "knowledge-reviews": { type: "string" },
    "trend-reviews": { type: "string" },
    "plan-only": { type: "boolean", default: false },
    execute: { type: "boolean", default: false },
    resume: { type: "boolean", default: false },
  },
})
if ([v["plan-only"], v.execute, v.resume].filter(Boolean).length !== 1)
  throw Error("Choose --plan-only, --execute or --resume")
if (v.root && !v.backlog && !v.edition && !v.round && !v.report)
  throw Error("A custom legacy core root requires an explicit --backlog")
if (
  Boolean(v.edition) !== Boolean(v["edition-sha256"]) ||
  Boolean(v.report) !== Boolean(v["report-sha256"]) ||
  Boolean(v["event-plan"]) !== Boolean(v["event-plan-sha256"]) ||
  Boolean(v.curation) !== Boolean(v["curation-sha256"])
)
  throw Error("Event references require both path and SHA")
if (
  !v.edition &&
  !v.round &&
  !v.report &&
  (v["event-plan"] ||
    v["event-proposals"] ||
    v["event-fact-reviews"] ||
    v["event-editorial-reviews"] ||
    v["event-revision-reviews"] ||
    v["event-retry-groups"] ||
    v["event-note-reviews"])
)
  throw Error("Event core requires --edition")
if (v["drive-snapshot"] && !v.collect) throw Error("Drive snapshot requires explicit --collect")
if (v.curation && !v.round)
  throw Error("Curation reference requires --round; use module:curation for mixed-origin execution")
const map = (file) => (file ? JSON.parse(fs.readFileSync(file, "utf8")) : {})
// Resolve caller-supplied files before the native collectors read repo-relative assets.
const parameters = {
  root: defaultFile(v.root, DEFAULT_ROOT),
  runId: v.run,
  round: v.round,
  collectionReportReference: v.report ? { path: v.report, sha256: v["report-sha256"] } : undefined,
  editionReference: v.edition ? { path: v.edition, sha256: v["edition-sha256"] } : undefined,
  eventPlanReference: v["event-plan"]
    ? { path: v["event-plan"], sha256: v["event-plan-sha256"] }
    : undefined,
  curationReference: v.curation ? { path: v.curation, sha256: v["curation-sha256"] } : undefined,
  requireCuration: v.round,
  eventFactReviews: map(v["event-fact-reviews"]),
  eventEditorialReviews: map(v["event-editorial-reviews"]),
  eventRevisionReviews: map(v["event-revision-reviews"]),
  eventCompletenessReviews: map(v["event-completeness-reviews"]),
  eventCoverageReviews: map(v["event-coverage-reviews"]),
  eventRetryGroups: v["event-retry-groups"] ? map(v["event-retry-groups"]) : [],
  eventNoteReviewRuns: v["event-note-reviews"] ? map(v["event-note-reviews"]) : [],
  connectionReviewRun: v["connection-review-run"],
  eventProposals: v["event-proposals"],
  eventProposalOffset: v["event-offset"] === undefined ? 0 : Number(v["event-offset"]),
  dailyRunId: v["daily-run"],
  queueRun: v["queue-run"],
  collectionBasis: v["collection-basis"],
  collect: v.collect,
  collectionMaxWindows:
    v["collection-max-windows"] === undefined ? undefined : Number(v["collection-max-windows"]),
  collectionTimeBudgetMs:
    v["collection-time-budget-ms"] === undefined
      ? undefined
      : Number(v["collection-time-budget-ms"]),
  editorialOnly: v["editorial-only"],
  configFile: defaultFile(v.config, "data/research-daily-routes.json"),
  policyFile: defaultFile(v["model-policy"], "data/research-model-policy.json"),
  processingRecoveries: v["processing-recoveries"]
    ? JSON.parse(fs.readFileSync(v["processing-recoveries"], "utf8"))
    : undefined,
  sourceReviewFiles: v["source-review-files"] ? map(v["source-review-files"]) : undefined,
  vault: defaultFile(v.vault, "vault"),
  backlogFile: defaultFile(v.backlog, ".local/research/candidate-backlog.json"),
  driveSnapshotFile: v["drive-snapshot"] ? path.resolve(v["drive-snapshot"]) : undefined,
  ontologyBase: v["ontology-base"],
  companyReviewFile: v["company-review"] ? path.resolve(v["company-review"]) : undefined,
  limit: v.limit === undefined ? undefined : Number(v.limit),
  maxItems: v["max-items"] === undefined ? undefined : Number(v["max-items"]),
  timeBudgetMs: v["time-budget-ms"] === undefined ? undefined : Number(v["time-budget-ms"]),
  maxModelCalls: v["max-model-calls"] === undefined ? undefined : Number(v["max-model-calls"]),
  retryFailed: v["retry-failed"],
  reviewFiles: map(v["review-files"]),
  deepReviewFiles: map(v["deep-review-files"]),
  editorialReviewFiles: map(v["editorial-review-files"]),
  knowledgeInputFiles: map(v["knowledge-inputs"]),
  knowledgeSelections: v["knowledge-reviews"] ? map(v["knowledge-reviews"]) : [],
  knowledgeSelectionsFile: v["knowledge-selections"],
  trendReviewRuns: v["trend-reviews"]
    ? JSON.parse(fs.readFileSync(v["trend-reviews"], "utf8"))
    : [],
  execute: v.execute || v.resume,
}
process.chdir(repo)
console.log(JSON.stringify(await advanceDailyCore(parameters), null, 2))
