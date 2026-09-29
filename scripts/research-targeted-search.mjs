import fs from "node:fs"
import { parseArgs } from "node:util"
import { registry } from "./research/discovery.mjs"
import { loadDailySearchBasis } from "./research/daily-search-basis.mjs"
import { targetedSourceQueries } from "./research/source-targeted-search.mjs"
import { atomicCreate, DEFAULT_ROOT, readJSON } from "./research/run-state.mjs"

const { values } = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  options: {
    run: { type: "string" },
    "daily-run": { type: "string" },
    root: { type: "string", default: DEFAULT_ROOT },
  },
})
if (!/^[a-zA-Z0-9_-]+$/.test(values.run || "") || !values["daily-run"])
  throw Error("Usage: research-targeted-search.mjs --run ID --daily-run DAILY_ID")
const basis = loadDailySearchBasis(values.root, values["daily-run"])
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"))
const routes = registry(
  read("data/research-source-channels.json"),
  read("data/research-watchlist.json"),
  read("data/research-acquisition.json"),
)
const selected = targetedSourceQueries(basis.coverage, routes, basis.reference.kst_day)
const plan = {
  schema: "research-source-targeted-plan/v1",
  run_id: values.run,
  daily_basis: basis.reference,
  queries: selected.queries,
  unresolved_slots: selected.unresolved,
  candidate_published: false,
}
const file = `runs/${values.run}/targeted-queries.json`
const previous = readJSON(values.root, file)
if (previous && JSON.stringify(previous) !== JSON.stringify(plan))
  throw Error("Targeted search inputs changed; use a new run ID")
if (!previous) atomicCreate(values.root, file, plan)
console.log(
  JSON.stringify(
    {
      run_id: values.run,
      daily_run: basis.reference.daily_run,
      queries: plan.queries.length,
      unresolved_slots: plan.unresolved_slots,
      plan_path: file,
      candidate_published: false,
    },
    null,
    2,
  ),
)
