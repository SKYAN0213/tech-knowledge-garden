import { parseArgs } from "node:util"
import { DEFAULT_ROOT } from "./research/run-state.mjs"
import { preparePublicationTimeRevision } from "./research/publication-time-revision.mjs"

try {
  const { values } = parseArgs({
    options: {
      root: { type: "string", default: DEFAULT_ROOT },
      run: { type: "string" },
      "prior-run": { type: "string" },
      "source-run": { type: "string" },
      review: { type: "string" },
    },
  })
  console.log(
    JSON.stringify(
      await preparePublicationTimeRevision({
        root: values.root,
        runId: values.run,
        priorRunId: values["prior-run"],
        sourceRunId: values["source-run"],
        reviewPath: values.review,
      }),
      null,
      2,
    ),
  )
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
