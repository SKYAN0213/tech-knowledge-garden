import fs from "node:fs"
import { parseArgs } from "node:util"
import { DEFAULT_ROOT } from "./research/run-state.mjs"
import { prepareAuthoringTransfer, compareAuthoringRemote } from "./research/authoring-transfer.mjs"
import { authorizeAuthoringTransfer } from "./research/authoring-release.mjs"
import {
  reconcileAuthoringExecution,
  loadAuthoringExecutionStatus,
  stageAuthoringReadback,
} from "./research/authoring-execution.mjs"

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
      release: { type: "string" },
      readback: { type: "string" },
      acquisition: { type: "string" },
    },
  })
  let result
  if (positionals.length !== 1)
    throw Error("Use prepare, compare, release, capture, reconcile or status")
  if (!["capture", "reconcile"].includes(positionals[0]) && values.release)
    throw Error("Release receipt requires capture or reconcile")
  if (positionals[0] !== "reconcile" && values.readback)
    throw Error("Release receipt and raw readback require reconcile")
  if (positionals[0] !== "capture" && values.acquisition)
    throw Error("Connector acquisition requires capture")
  if (positionals[0] !== "release" && (values.review || values.snapshot))
    throw Error("Review and snapshot require release")
  if (
    positionals[0] === "capture" &&
    values.release &&
    values.acquisition &&
    !values["preview-run"] &&
    !values.plan &&
    !values.observation
  )
    result = await stageAuthoringReadback({
      root: values.root,
      releasePath: values.release,
      acquisitionFile: values.acquisition,
    })
  else if (
    positionals[0] === "status" &&
    !values["preview-run"] &&
    !values.plan &&
    !values.observation
  )
    result = loadAuthoringExecutionStatus(values.root)
  else if (
    positionals[0] === "reconcile" &&
    values.release &&
    values.observation &&
    values.readback &&
    !values["preview-run"] &&
    !values.plan
  )
    result = await reconcileAuthoringExecution({
      root: values.root,
      releasePath: values.release,
      observationFile: values.observation,
      readbackFile: values.readback,
    })
  else if (
    positionals[0] === "prepare" &&
    values["preview-run"] &&
    !values.plan &&
    !values.observation
  )
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
      "prepare --preview-run ID; compare --plan FILE --observation FILE; release --preview-run ID --review FILE --snapshot FILE --observation FILE; capture --release ROOT_RELATIVE_RECEIPT --acquisition FILE; reconcile --release ROOT_RELATIVE_RECEIPT --observation FILE --readback FILE; status",
    )
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
