import path from "node:path"
import fs from "node:fs"
import { parseArgs } from "node:util"
import { spawnSync } from "node:child_process"
import { DEFAULT_ROOT } from "./research/run-state.mjs"
import {
  planCandidateFollowups,
  intakeCandidateFollowups,
  registerCollectedFollowups,
  recordSourceDetailReview,
  selectFollowupLeads,
} from "./research/source-followups.mjs"

const { values: v } = parseArgs({
  strict: true,
  options: {
    root: { type: "string", default: DEFAULT_ROOT },
    handoff: { type: "string" },
    "parent-source-run": { type: "string" },
    target: { type: "string", multiple: true },
    candidate: { type: "string" },
    intake: { type: "boolean", default: false },
    backlog: { type: "string" },
    "collect-run": { type: "string" },
    limit: { type: "string", default: "3" },
    review: { type: "string" },
  },
})
if (!v.candidate || !!v.handoff === !!v["parent-source-run"])
  throw Error("Choose --handoff or --parent-source-run with --candidate")
if (v["parent-source-run"] && !v.backlog)
  throw Error("--parent-source-run requires explicit --backlog")
if (v.intake && !v.backlog) throw Error("--intake requires explicit --backlog")
if (v["collect-run"] && !v.intake) throw Error("Collection requires --intake")
if (v["collect-run"] && !/^[a-zA-Z0-9_-]+$/.test(v["collect-run"]))
  throw Error("Invalid --collect-run")
const limit = Number(v.limit)
if (!Number.isInteger(limit) || limit < 1 || limit > 8) throw Error("--limit must be 1..8")
const options = {
  root: v.root,
  handoffFile: v.handoff,
  parentSourceRun: v["parent-source-run"],
  targetURLs: v.target,
  candidateKey: v.candidate,
  backlogFile: v.backlog,
  limit,
}
const result = v.intake ? await intakeCandidateFollowups(options) : planCandidateFollowups(options)
const selectedLeads = selectFollowupLeads(result.plan, { targetURLs: v.target, limit })
console.log(JSON.stringify(result, null, 2))
if (v.review)
  console.log(
    JSON.stringify(
      recordSourceDetailReview({
        ...options,
        review: JSON.parse(fs.readFileSync(v.review, "utf8")),
      }),
      null,
      2,
    ),
  )
if (v["collect-run"] && selectedLeads.length) {
  // Native collection enforces robots, public-IP pinning, rate/byte budgets,
  // access restrictions and the shared parser. No shell or new site adapter.
  const args = [
    path.resolve(import.meta.dirname, "research.mjs"),
    "collect",
    "--root",
    path.resolve(v.root),
    "--run",
    v["collect-run"],
    ...selectedLeads.flatMap((lead) => ["--url", lead.url]),
  ]
  const child = spawnSync(process.execPath, args, { stdio: "inherit" })
  if (child.error) throw child.error
  if (child.signal || child.status !== 0)
    throw Error("Native follow-up collection did not complete")
  console.log(
    JSON.stringify(
      await registerCollectedFollowups({ ...options, sourceRun: v["collect-run"], limit }),
      null,
      2,
    ),
  )
}
