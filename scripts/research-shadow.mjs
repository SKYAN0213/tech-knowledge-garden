import { parseArgs } from "node:util"
import { DEFAULT_ROOT } from "./research/run-state.mjs"
import {
  recordShadowOperation,
  auditShadowOperations,
  saveShadowCollectionBasis,
} from "./research/shadow-operations.mjs"

try {
  const { values: v, positionals } = parseArgs({
    strict: true,
    allowPositionals: true,
    options: {
      root: { type: "string", default: DEFAULT_ROOT },
      run: { type: "string" },
      review: { type: "string" },
      handoff: { type: "string" },
      config: { type: "string" },
      backlog: { type: "string" },
    },
  })
  const mode = positionals[0]
  if (
    positionals.length !== 1 ||
    !["basis", "record", "status"].includes(mode) ||
    (mode === "status" && (v.run || v.review || v.config || v.backlog || v.handoff)) ||
    (mode === "record" && (!v.run || !v.review || v.config || v.backlog || v.handoff)) ||
    (mode === "basis" && (!v.run || v.review))
  )
    throw Error("Use basis --run DAILY, record --run ID --review ROOT_RELATIVE_JSON, or status")
  const result =
    mode === "status"
      ? await auditShadowOperations(v.root)
      : mode === "record"
        ? await recordShadowOperation({ root: v.root, run: v.run, reviewPath: v.review })
        : await saveShadowCollectionBasis({
            root: v.root,
            dailyRun: v.run,
            configFile: v.config,
            handoffPath: v.handoff,
            backlogFile: v.backlog || ".local/research/candidate-backlog.json",
          })
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
