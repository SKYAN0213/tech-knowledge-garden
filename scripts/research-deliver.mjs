import { parseArgs } from "node:util"
import { deliverApprovedPublication } from "./research/delivery-run.mjs"
import { DEFAULT_ROOT } from "./research/run-state.mjs"

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
    },
  })
  if (!/^\d+$/.test(v["wait-seconds"])) throw Error("Integer --wait-seconds required")
  const result = await deliverApprovedPublication({
    root: v.root,
    run: v.run,
    releasePath: v.release,
    statusOnly: v.status,
    retryPublish: v["retry-publish"],
    actionsRun: v["actions-run"],
    waitSeconds: Number(v["wait-seconds"]),
    emit: (state) =>
      console.error(JSON.stringify({ stage: state.status, commit: state.publication.commit })),
  })
  console.log(JSON.stringify(result, null, 2))
  if (
    [
      "publication_recovery_required",
      "deployment_failed",
      "deployment_observation_failed",
      "public_readback_failed",
    ].includes(result.status)
  )
    process.exitCode = 2
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
