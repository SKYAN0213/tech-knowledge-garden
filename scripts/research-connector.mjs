import fs from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"
import { materializeConnectorFile } from "./research/connector-transport.mjs"

try {
  const { values } = parseArgs({
    options: { root: { type: "string" }, input: { type: "string", default: "-" } },
    strict: true,
  })
  if (!values.root) throw Error("Explicit private storage root required")
  const input = JSON.parse(fs.readFileSync(values.input === "-" ? 0 : values.input, "utf8"))
  console.log(
    JSON.stringify(await materializeConnectorFile(path.resolve(values.root), input), null, 2),
  )
} catch (error) {
  console.error(JSON.stringify({ status: "failed", message: error.message }))
  process.exitCode = 1
}
