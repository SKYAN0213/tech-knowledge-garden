import fs from "node:fs"
import { parseArgs } from "node:util"
import { createInterface } from "node:readline"
import { DEFAULT_ROOT } from "./research/run-state.mjs"
import { prepareAuthoringTransfer, compareAuthoringRemote } from "./research/authoring-transfer.mjs"
import { authorizeAuthoringTransfer } from "./research/authoring-release.mjs"
import {
  reconcileAuthoringExecution,
  loadAuthoringExecutionStatus,
  stageAuthoringReadback,
  authoringWriteSession,
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
      "wait-ms": { type: "string" },
      "resume-intent": { type: "string" },
    },
  })
  let result
  if (positionals.length !== 1)
    throw Error("Use prepare, compare, release, capture, reconcile, write-session or status")
  if (!["capture", "reconcile", "write-session"].includes(positionals[0]) && values.release)
    throw Error("Release receipt requires capture, reconcile or write-session")
  if (positionals[0] !== "reconcile" && values.readback)
    throw Error("Release receipt and raw readback require reconcile")
  if (!["capture", "write-session"].includes(positionals[0]) && values.acquisition)
    throw Error("Connector acquisition requires capture or write-session")
  if (positionals[0] !== "write-session" && values["wait-ms"])
    throw Error("Wait budget requires write-session")
  if (positionals[0] !== "write-session" && values["resume-intent"])
    throw Error("Explicit update resumption requires write-session")
  if (positionals[0] !== "release" && (values.review || values.snapshot))
    throw Error("Review and snapshot require release")
  if (
    positionals[0] === "write-session" &&
    values.release &&
    values.acquisition &&
    !values["preview-run"] &&
    !values.plan &&
    !values.observation &&
    !values.readback
  ) {
    const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
    const queue = [],
      keepAlive = setInterval(() => {}, 1000)
    let waiting,
      closed = false
    const stop = () => lines.close()
    lines.on("line", (line) => {
      if (waiting) {
        const current = waiting
        waiting = null
        current.resolve(line)
      } else queue.push(line)
    })
    lines.on("close", () => {
      closed = true
      if (waiting) {
        waiting.reject(Error("Writer input closed"))
        waiting = null
      }
    })
    process.once("SIGTERM", stop)
    process.once("SIGINT", stop)
    try {
      result = await authoringWriteSession({
        root: values.root,
        releasePath: values.release,
        acquisitionFile: values.acquisition,
        waitMs: values["wait-ms"] ? Number(values["wait-ms"]) : 300000,
        resumeIntent: values["resume-intent"] || null,
        emit: (event) => console.log(JSON.stringify(event)),
        nextCapture: async () => {
          const line = queue.length
            ? queue.shift()
            : closed
              ? (() => {
                  throw Error("Writer input closed")
                })()
              : await new Promise((resolve, reject) => {
                  waiting = { resolve, reject }
                })
          if (line.length > 4096) throw Error("Writer message too long")
          const message = JSON.parse(line)
          if (
            message?.type !== "readback" ||
            typeof message.acquisition_file !== "string" ||
            Object.keys(message).sort().join() !== "acquisition_file,type"
          )
            throw Error("Post-write acquisition required")
          return message.acquisition_file
        },
      })
    } finally {
      clearInterval(keepAlive)
      lines.close()
      process.removeListener("SIGTERM", stop)
      process.removeListener("SIGINT", stop)
    }
  } else if (
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
      "prepare --preview-run ID; compare --plan FILE --observation FILE; release --preview-run ID --review FILE --snapshot FILE --observation FILE; capture --release ROOT_RELATIVE_RECEIPT --acquisition FILE; reconcile --release ROOT_RELATIVE_RECEIPT --observation FILE --readback FILE; write-session --release ROOT_RELATIVE_RECEIPT --acquisition FILE [--wait-ms 300000] [--resume-intent ROOT_RELATIVE_UPDATE_INTENT]; status",
    )
  console.log(
    JSON.stringify(
      positionals[0] === "write-session" ? { type: "session_result", ...result } : result,
      null,
      positionals[0] === "write-session" ? undefined : 2,
    ),
  )
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
