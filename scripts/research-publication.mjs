import fs from "node:fs"
import { parseArgs } from "node:util"
import { DEFAULT_ROOT, withGardenOperationLock } from "./research/run-state.mjs"
import {
  preparePublicationOperation,
  recordPublicationPush,
  recordPublicationDeployment,
  recordPublicationReadback,
  publicationOperationStatus,
  loadPublicationOperations,
} from "./research/publication-operation.mjs"

try {
  const { values: v, positionals } = parseArgs({
    strict: true,
    allowPositionals: true,
    options: {
      root: { type: "string", default: DEFAULT_ROOT },
      run: { type: "string" },
      release: { type: "string" },
      push: { type: "string" },
      deployment: { type: "string" },
      "readback-run": { type: "string" },
    },
  })
  const mode = positionals[0]
  if (
    positionals.length !== 1 ||
    !["bind", "deployment", "public", "status"].includes(mode) ||
    (mode !== "bind" && (v.release || v.push)) ||
    (mode !== "deployment" && v.deployment) ||
    (mode !== "public" && v["readback-run"])
  )
    throw Error("Use bind, deployment, public or status with only that stage's evidence")
  const options = { root: v.root, run: v.run }
  let result
  if (mode === "status")
    result = v.run ? publicationOperationStatus(options) : loadPublicationOperations(v.root)
  else
    result = await withGardenOperationLock(v.root, async () => {
      if (mode === "bind" && v.release && v.push) {
        await preparePublicationOperation({ ...options, releasePath: v.release })
        return recordPublicationPush({ ...options, pushPath: v.push })
      }
      if (mode === "deployment" && v.deployment)
        return recordPublicationDeployment({
          ...options,
          deployment: JSON.parse(fs.readFileSync(v.deployment)),
        })
      if (mode === "public" && v["readback-run"])
        return recordPublicationReadback({ ...options, readbackRun: v["readback-run"] })
      throw Error("Exact operation and stage evidence required")
    })
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
