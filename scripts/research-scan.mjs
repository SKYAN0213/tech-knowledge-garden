import path from "node:path"
import { parseArgs } from "node:util"
import { DEFAULT_ROOT } from "./research/run-state.mjs"
import { executeListScan } from "./research/list-scan-command.mjs"

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      root: { type: "string", default: DEFAULT_ROOT },
      run: { type: "string" },
      channel: { type: "string", multiple: true },
      since: { type: "string" },
      until: { type: "string" },
      "reuse-listing-run": { type: "string" },
      "reuse-source-run": { type: "string" },
      "repair-source-run": { type: "string" },
      "recovery-source-run": { type: "string" },
      "merge-backlog": { type: "boolean", default: false },
      "policy-recheck-limit": { type: "string" },
    },
  })
  if (positionals.length !== 1 || positionals[0] !== "scan-list")
    throw Error("Usage: research-scan.mjs scan-list --run ID --channel ID --since DAY --until DAY")
  if (values["policy-recheck-limit"] !== undefined) {
    if (!/^[0-3]$/.test(values["policy-recheck-limit"]))
      throw Error("--policy-recheck-limit must be an integer between 0 and 3")
    values["policy-recheck-limit"] = Number(values["policy-recheck-limit"])
  }
  return executeListScan(values)
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve("scripts/research-scan.mjs")
) {
  main()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
