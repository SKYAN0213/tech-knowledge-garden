import fs from "node:fs"
import { parseArgs } from "node:util"
import { DEFAULT_ROOT } from "./research/run-state.mjs"
import { prepareAuthoringTransfer, compareAuthoringRemote } from "./research/authoring-transfer.mjs"
import { authorizeAuthoringTransfer } from "./research/authoring-release.mjs"

try {
  const { values, positionals } = parseArgs({
    strict: true,
    allowPositionals: true,
    options: {
      root: { type: "string", default: DEFAULT_ROOT },
      "preview-run": { type: "string" },
      vault: { type: "string", default: "vault" },
      plan: { type: "string" },
      observation: { type: "string" },
      review: { type: "string" },
      snapshot: { type: "string" },
    },
  })
  let result
  if (positionals.length !== 1) throw Error("Use prepare, compare or release")
  if (positionals[0] !== "release" && (values.review || values.snapshot))
    throw Error("Review and snapshot require release")
  if (positionals[0] === "prepare" && values["preview-run"] && !values.plan && !values.observation)
    result = await prepareAuthoringTransfer({
      root: values.root,
      previewRun: values["preview-run"],
      vault: values.vault,
    })
  else if (
    positionals[0] === "compare" &&
    values.plan &&
    values.observation &&
    !values["preview-run"]
  )
    result = compareAuthoringRemote(
      JSON.parse(fs.readFileSync(values.plan)),
      JSON.parse(fs.readFileSync(values.observation)),
    )
  else if (
    positionals[0] === "release" &&
    values["preview-run"] &&
    values.review &&
    values.snapshot &&
    values.observation &&
    !values.plan
  )
    result = await authorizeAuthoringTransfer({
      root: values.root,
      previewRun: values["preview-run"],
      reviewFile: values.review,
      snapshotFile: values.snapshot,
      observationFile: values.observation,
      vault: values.vault,
    })
  else
    throw Error(
      "prepare --preview-run ID; compare --plan FILE --observation FILE; release --preview-run ID --review FILE --snapshot FILE --observation FILE",
    )
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
