import { parseArgs } from "node:util"
import fs from "node:fs"
import { DEFAULT_ROOT, readJSON, safePath } from "./research/run-state.mjs"
import { sha256 } from "./research/contracts.mjs"
import {
  saveCollectionReport,
  sourceCollectionInventory,
  readCollectionMaterial,
} from "./research/collection-report.mjs"
const { values } = parseArgs({
  options: {
    run: { type: "string" },
    root: { type: "string" },
    "supplement-run": { type: "string", multiple: true },
    inventory: { type: "boolean", default: false },
    report: { type: "string" },
    sha256: { type: "string" },
    material: { type: "string" },
  },
})
try {
  if (values.inventory) {
    if (
      values.run ||
      values["supplement-run"] ||
      values.report ||
      values.sha256 ||
      values.material
    )
      throw Error("--inventory cannot be combined with collection-run arguments")
    const read = (name) => JSON.parse(fs.readFileSync(`data/research-${name}.json`))
    const root = values.root || DEFAULT_ROOT
    const reference = readJSON(root, "source-route-reviews/latest.json")
    let review
    if (reference) {
      const bytes = fs.readFileSync(safePath(root, reference.path))
      if (sha256(bytes) !== reference.sha256) throw Error("Route review changed")
      review = JSON.parse(bytes)
    }
    console.log(
      JSON.stringify(
        sourceCollectionInventory({
          channels: read("source-channels"),
          watchlist: read("watchlist"),
          acquisition: read("acquisition"),
          recipes: read("source-recipes"),
          daily: read("daily-routes"),
          catalog: read("source-catalog"),
          review,
        }),
        null,
        2,
      ),
    )
  } else if (values.report || values.sha256 || values.material) {
    if (
      !values.report ||
      !values.sha256 ||
      !values.material ||
      values.run ||
      values["supplement-run"]
    )
      throw Error("Material read requires --report PATH --sha256 SHA --material ID")
    console.log(
      JSON.stringify(
        readCollectionMaterial({
          root: values.root,
          reportPath: values.report,
          reportSha256: values.sha256,
          materialId: values.material,
        }),
        null,
        2,
      ),
    )
  } else
    console.log(
      JSON.stringify(
        await saveCollectionReport({
          runId: values.run,
          root: values.root,
          supplementalRuns: values["supplement-run"] || [],
        }),
        null,
        2,
      ),
    )
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
