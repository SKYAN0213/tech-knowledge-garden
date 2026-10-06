import { parseArgs } from "node:util"
import { DEFAULT_ROOT } from "./research/run-state.mjs"
import { recoverCandidateParse } from "./research/candidate-parse-recovery.mjs"

try {
  const { values: v } = parseArgs({
    strict: true,
    options: {
      root: { type: "string", default: DEFAULT_ROOT },
      run: { type: "string" },
      "source-run": { type: "string" },
      "reparse-run": { type: "string" },
      "candidate-key": { type: "string" },
      backlog: { type: "string" },
    },
  })
  if (v.root !== DEFAULT_ROOT && !v.backlog)
    throw Error("Custom research roots require an explicit backlog")
  console.log(
    JSON.stringify(
      await recoverCandidateParse({
        root: v.root,
        runId: v.run,
        sourceRunId: v["source-run"],
        reparseRunId: v["reparse-run"],
        candidateKey: v["candidate-key"],
        backlogFile: v.backlog || ".local/research/candidate-backlog.json",
      }),
      null,
      2,
    ),
  )
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
