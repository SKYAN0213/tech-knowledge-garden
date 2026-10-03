import path from "node:path"
import { parseArgs } from "node:util"
import { DEFAULT_ROOT } from "./research/run-state.mjs"
import { registerArchiveLocation, lookupArchiveLocations } from "./research/archive-locations.mjs"

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args,
    strict: true,
    allowPositionals: true,
    options: {
      root: { type: "string", default: DEFAULT_ROOT },
      run: { type: "string" },
      metadata: { type: "string" },
      "remote-package": { type: "string" },
      parent: { type: "string" },
      "source-version": { type: "string" },
      event: { type: "string" },
    },
  })
  if (positionals.length !== 1) throw Error("Use register or lookup")
  if (
    positionals[0] === "lookup" &&
    !values.run &&
    !values.metadata &&
    !values["remote-package"] &&
    !values.parent
  )
    return lookupArchiveLocations(values.root, {
      sourceVersionId: values["source-version"],
      eventId: values.event,
    })
  if (
    positionals[0] === "register" &&
    values.run &&
    values.metadata &&
    values["remote-package"] &&
    values.parent &&
    !values.event &&
    !values["source-version"]
  )
    return registerArchiveLocation({
      root: values.root,
      runId: values.run,
      metadataFile: values.metadata,
      remotePackageFile: values["remote-package"],
      expectedParentId: values.parent,
    })
  throw Error(
    "register --run ID --metadata FILE --remote-package FILE --parent ID; lookup --source-version ID or --event ID",
  )
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve("scripts/research-archives.mjs")
)
  main()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
