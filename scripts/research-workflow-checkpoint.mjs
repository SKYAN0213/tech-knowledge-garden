import path from "node:path"
import { parseArgs } from "node:util"
import { DEFAULT_ROOT } from "./research/run-state.mjs"
import {
  workflowCheckpointPlan,
  createWorkflowCheckpoint,
  restoreWorkflowCheckpoint,
} from "./research/workflow-checkpoint.mjs"

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      root: { type: "string", default: DEFAULT_ROOT },
      run: { type: "string" },
      daily: { type: "string" },
      publication: { type: "string" },
      backlog: { type: "string" },
      vault: { type: "string" },
      to: { type: "string" },
      "checkpoint-root": { type: "string" },
    },
  })
  if (positionals.length !== 1) throw Error("Use plan, create or restore")
  if (
    positionals[0] === "restore" &&
    values.run &&
    values.to &&
    !values.daily &&
    !values.publication &&
    !values.backlog &&
    !values.vault
  )
    return restoreWorkflowCheckpoint({
      root: values.root,
      checkpointRoot: values["checkpoint-root"] || values.root,
      run: values.run,
      destination: values.to,
    })
  if (
    ["plan", "create"].includes(positionals[0]) &&
    values.daily &&
    values.publication &&
    values.backlog &&
    values.vault &&
    !values.to &&
    !values["checkpoint-root"] &&
    (positionals[0] === "plan" ? !values.run : values.run)
  ) {
    const options = {
      root: values.root,
      run: values.run,
      dailyRun: values.daily,
      publicationRun: values.publication,
      backlogFile: values.backlog,
      vault: values.vault,
    }
    return positionals[0] === "plan"
      ? workflowCheckpointPlan(options)
      : createWorkflowCheckpoint(options)
  }
  throw Error(
    "plan|create --daily ID --publication ID --backlog FILE --vault DIR [create: --run ID]; restore --run ID --to workflow-restores/ID",
  )
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve("scripts/research-workflow-checkpoint.mjs")
)
  main()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error(e.message)
      process.exitCode = 1
    })
