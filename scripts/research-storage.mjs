import fs from "node:fs"
import { parseArgs } from "node:util"
import { storageAction } from "./research/cold-storage.mjs"
import { driveStorageAction, remoteStorageActions } from "./research/drive-storage.mjs"
import { fileURLToPath } from "node:url"

const { values, positionals } = parseArgs({
  allowPositionals: true,
  strict: true,
  options: { root: { type: "string" }, input: { type: "string" } },
})
try {
  if (positionals.length !== 1 || !values.root)
    throw Error("Use ACTION --root PRIVATE_ROOT [--input JSON_FILE]")
  const source =
    !values.input && process.stdin.isTTY ? "" : fs.readFileSync(values.input || 0, "utf8").trim()
  const parameters = source ? JSON.parse(source) : {}
  const result = remoteStorageActions.includes(positionals[0])
    ? await driveStorageAction(
        fileURLToPath(new URL("../", import.meta.url)),
        values.root,
        positionals[0],
        parameters,
      )
    : storageAction(values.root, positionals[0], parameters)
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  console.error(error.message)
  if (error.storage_failure) console.error(JSON.stringify(error.storage_failure))
  process.exitCode = 1
}
