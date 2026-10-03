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
      "merge-backlog": { type: "boolean", default: false },
    },
  })
  if (positionals.length !== 1 || positionals[0] !== "scan-list")
    throw Error("Usage: research-scan.mjs scan-list --run ID --channel ID --since DAY --until DAY")
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
