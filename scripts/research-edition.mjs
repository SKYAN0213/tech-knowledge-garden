import { parseArgs } from "node:util"
import { DEFAULT_ROOT } from "./research/run-state.mjs"
import { prepareDailyEdition } from "./research/edition-preparation.mjs"

try {
  const { values } = parseArgs({
    strict: true,
    options: {
      run: { type: "string" },
      "daily-run": { type: "string" },
      review: { type: "string" },
      root: { type: "string", default: DEFAULT_ROOT },
      vault: { type: "string", default: "vault" },
      backlog: { type: "string" },
    },
  })
  if (!values.run || !values["daily-run"] || !values.review)
    throw Error("Usage: research-edition.mjs --run ID --daily-run ID --review SELECTION.json")
  if (values.root !== DEFAULT_ROOT && !values.backlog)
    throw Error("A custom research root requires an explicit --backlog")
  const result = await prepareDailyEdition({
    root: values.root,
    runId: values.run,
    dailyRunId: values["daily-run"],
    reviewPath: values.review,
    vault: values.vault,
    ...(values.backlog ? { backlogFile: values.backlog } : {}),
  })
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
