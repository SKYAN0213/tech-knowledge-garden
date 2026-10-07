import { parseArgs } from "node:util"
import fs from "node:fs"
import { deliverAuthoringSession } from "./research/authoring-delivery.mjs"
import { connectorInput } from "./research/connector-input.mjs"
import { deliverApprovedPublication } from "./research/delivery-run.mjs"
import { DEFAULT_ROOT, safePath } from "./research/run-state.mjs"

try {
  const { values: v } = parseArgs({
    strict: true,
    options: {
      root: { type: "string", default: DEFAULT_ROOT },
      run: { type: "string" },
      release: { type: "string" },
      status: { type: "boolean", default: false },
      "retry-publish": { type: "boolean", default: false },
      "actions-run": { type: "string" },
      "wait-seconds": { type: "string", default: "0" },
      "authoring-root": { type: "string" },
      "source-snapshot": { type: "string" },
      "source-readback": { type: "string" },
      acquisition: { type: "string" },
      "resume-intent": { type: "string" },
      "connector-wait-ms": { type: "string", default: "300000" },
    },
  })
  if (!/^\d+$/.test(v["wait-seconds"])) throw Error("Integer --wait-seconds required")
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(v.run || "")) throw Error("Exact delivery run ID required")
  const options = {
    root: v.root,
    run: v.run,
    releasePath: v.release,
    statusOnly: v.status,
    retryPublish: v["retry-publish"],
    actionsRun: v["actions-run"],
    waitSeconds: Number(v["wait-seconds"]),
    emit: (state) =>
      console.error(JSON.stringify({ stage: state.status, commit: state.publication.commit })),
  }
  const authoring =
    v["authoring-root"] ||
    v.acquisition ||
    v["source-snapshot"] ||
    v["source-readback"] ||
    (/^[A-Za-z0-9_-]{1,100}$/.test(v.run || "") &&
      fs.existsSync(safePath(v.root, `runs/${v.run}/authoring-delivery/input.json`)))
  if (Boolean(v["source-snapshot"]) !== Boolean(v["source-readback"]))
    throw Error("Snapshot and exact source readback must be supplied together")
  if (
    v.status &&
    (v.acquisition || v["source-snapshot"] || v["source-readback"] || v["resume-intent"])
  )
    throw Error("Status is read-only")
  if (!authoring && v["resume-intent"]) throw Error("Authoring connector session required")
  let result
  if (authoring) {
    if (
      !/^\d+$/.test(v["connector-wait-ms"]) ||
      Number(v["connector-wait-ms"]) < 1 ||
      Number(v["connector-wait-ms"]) > 600000
    )
      throw Error("Connector wait must be from 1 to 600000 ms")
    const input = !v.status && (v.acquisition || !v["source-snapshot"]) ? connectorInput() : null
    const stop = () => input?.close()
    process.once("SIGINT", stop)
    process.once("SIGTERM", stop)
    const emit = (event) => console.log(JSON.stringify(event))
    try {
      if (v.acquisition) {
        // Confirm a live caller before the native writer can create an intent.
        emit({ type: "connector_ready", run_id: v.run })
        let timer
        try {
          await Promise.race([
            input.read("ready", []),
            new Promise((_, reject) => {
              timer = setTimeout(
                () => reject(Error("Connector readiness timed out")),
                Number(v["connector-wait-ms"]),
              )
            }),
          ])
        } finally {
          clearTimeout(timer)
        }
      }
      result = await deliverAuthoringSession({
        ...options,
        sourceRoot: v["authoring-root"],
        acquisitionFile: v.acquisition,
        snapshotFile: v["source-snapshot"],
        readbackFile: v["source-readback"],
        resumeIntent: v["resume-intent"] || null,
        waitMs: Number(v["connector-wait-ms"]),
        emit,
        nextCapture: input
          ? async () => (await input.read("readback", ["acquisition_file"])).acquisition_file
          : undefined,
        nextSnapshot: input
          ? () => input.read("source_snapshot", ["snapshot_file", "readback_file"])
          : undefined,
      })
    } finally {
      input?.close()
      process.removeListener("SIGINT", stop)
      process.removeListener("SIGTERM", stop)
    }
  } else result = await deliverApprovedPublication(options)
  console.log(JSON.stringify(result, null, 2))
  if (
    [
      "publication_recovery_required",
      "deployment_failed",
      "deployment_observation_failed",
      "public_readback_failed",
      "authoring_recovery_required",
    ].includes(result.status)
  )
    process.exitCode = 2
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
