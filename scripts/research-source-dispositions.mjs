import { parseArgs } from "node:util"
import { applyRouteDispositions } from "./research/source-route-disposition.mjs"
const { values } = parseArgs({ options: { run: { type: "string" }, root: { type: "string" }, input: { type: "string" }, apply: { type: "boolean", default: false } } })
try {
  console.log(JSON.stringify(await applyRouteDispositions({ runId: values.run, decisionsFile: values.input, root: values.root, apply: values.apply }), null, 2))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
