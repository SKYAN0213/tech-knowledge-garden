import { parseArgs } from "node:util"
import { importNativeApproval } from "./research/native-approval-import.mjs"
import { DEFAULT_ROOT } from "./research/run-state.mjs"

const { values: v } = parseArgs({
  strict: true,
  options: {
    root: { type: "string", default: DEFAULT_ROOT },
    "source-root": { type: "string" },
    run: { type: "string" },
    "approved-run": { type: "string" },
    "related-run": { type: "string", multiple: true },
    vault: { type: "string", default: "vault" },
    "plan-only": { type: "boolean", default: false },
    execute: { type: "boolean", default: false },
  },
})
if (!v["source-root"] || [v["plan-only"], v.execute].filter(Boolean).length !== 1)
  throw Error("Explicit --source-root and --plan-only or --execute required")
console.log(
  JSON.stringify(
    await importNativeApproval({
      sourceRoot: v["source-root"],
      root: v.root,
      run: v.run,
      approvedRun: v["approved-run"],
      relatedRuns: v["related-run"] || [],
      vault: v.vault,
      execute: v.execute,
    }),
    null,
    2,
  ),
)
