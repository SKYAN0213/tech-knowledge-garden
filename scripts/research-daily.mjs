import { parseArgs } from "node:util"
import { dailyScan } from "./research/daily-scan.mjs"

const { values } = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  options: {
    run: { type: "string" },
    root: { type: "string" },
    config: { type: "string" },
    vault: { type: "string" },
    backlog: { type: "string" },
    "drive-snapshot": { type: "string" },
    "plan-only": { type: "boolean", default: false },
    execute: { type: "boolean", default: false },
    resume: { type: "boolean", default: false },
    handoff: { type: "boolean", default: false },
  },
})
const modes = ["plan-only", "execute", "resume", "handoff"].filter((mode) => values[mode])
if (!values.run || modes.length !== 1)
  throw Error(
    "Usage: research-daily.mjs --run daily-YYYYMMDD --plan-only|--execute|--resume|--handoff [--drive-snapshot complete-export.json]",
  )
const options = { runId: values.run, mode: modes[0] }
if (values.root) options.root = values.root
if (values.config) options.configFile = values.config
if (values.vault) options.vault = values.vault
if (values.backlog) options.backlogFile = values.backlog
if (values["drive-snapshot"]) options.driveSnapshotFile = values["drive-snapshot"]
console.log(JSON.stringify(await dailyScan(options), null, 2))
