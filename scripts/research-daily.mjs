import { parseArgs } from "node:util"
import {
  dailyScan,
  reconcileSupplementalScan,
  reconcileDailyEdition,
} from "./research/daily-scan.mjs"
import { DEFAULT_ROOT, withGardenOperationLock } from "./research/run-state.mjs"

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
    "reconcile-scan": { type: "string" },
    "reconcile-edition": { type: "boolean", default: false },
    "plan-only": { type: "boolean", default: false },
    execute: { type: "boolean", default: false },
    resume: { type: "boolean", default: false },
    handoff: { type: "boolean", default: false },
  },
})
const modes = ["plan-only", "execute", "resume", "handoff"].filter((mode) => values[mode])
if (values["reconcile-scan"]) modes.push("reconcile")
if (values["reconcile-edition"]) modes.push("reconcile-edition")
if (!values.run || modes.length !== 1)
  throw Error(
    "Usage: research-daily.mjs --run ID --plan-only|--execute|--resume|--handoff [--drive-snapshot complete-export.json] | --run ID --reconcile-scan STORED_SCAN_RUN | --run ID --reconcile-edition --vault PATH",
  )
if (["reconcile", "reconcile-edition"].includes(modes[0]) && values["drive-snapshot"])
  throw Error("Drive snapshot is not supported for reconciliation")
if (modes[0] !== "reconcile" && values["reconcile-scan"])
  throw Error("--reconcile-scan is only supported for scan reconciliation")
const root = values.root || DEFAULT_ROOT
await withGardenOperationLock(root, async () => {
  if (modes[0] === "reconcile-edition") {
    console.log(
      JSON.stringify(
        await reconcileDailyEdition({ root, runId: values.run, vault: values.vault || "vault" }),
        null,
        2,
      ),
    )
  } else if (modes[0] === "reconcile") {
    const options = {
      reconciliationRun: values.run,
      scanRun: values["reconcile-scan"],
    }
    if (values.root) options.root = values.root
    if (values.config) options.configFile = values.config
    if (values.backlog) options.backlogFile = values.backlog
    console.log(JSON.stringify(await reconcileSupplementalScan(options), null, 2))
  } else {
    const options = { runId: values.run, mode: modes[0] }
    if (values.root) options.root = values.root
    if (values.config) options.configFile = values.config
    if (values.vault) options.vault = values.vault
    if (values.backlog) options.backlogFile = values.backlog
    if (values["drive-snapshot"]) options.driveSnapshotFile = values["drive-snapshot"]
    console.log(JSON.stringify(await dailyScan(options), null, 2))
  }
})
