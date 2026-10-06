import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { buildContextPage, contextHash } from "./research/context-page.mjs"

export function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      input: { type: "string" },
      sha256: { type: "string" },
      section: { type: "string" },
      offset: { type: "string" },
      limit: { type: "string" },
      route: { type: "string" },
      candidate: { type: "string" },
    },
  })
  let input = values.input
  let bytes
  if (input) bytes = fs.readFileSync(input)
  else {
    if (values.sha256) throw Error("--sha256 requires --input")
    bytes = execFileSync(
      process.execPath,
      [fileURLToPath(new URL("./garden.mjs", import.meta.url)), "context"],
      {
        cwd: process.cwd(),
        maxBuffer: 32 * 1024 * 1024,
      },
    )
    const directory = ".local/research/local-ai/context"
    fs.mkdirSync(directory, { recursive: true })
    input = path.join(directory, contextHash(bytes) + ".json")
    try {
      fs.writeFileSync(input, bytes, { flag: "wx", mode: 0o600 })
    } catch (error) {
      if (error.code !== "EEXIST") throw error
      if (!fs.readFileSync(input).equals(bytes))
        throw Error("Stored context snapshot differs from captured bytes")
    }
  }
  const sha256 = contextHash(bytes)
  if (values.sha256 && values.sha256 !== sha256) throw Error("Context snapshot SHA-256 mismatch")
  return buildContextPage(JSON.parse(bytes), {
    input,
    sha256,
    section: values.section,
    offset: values.offset === undefined ? 0 : Number(values.offset),
    limit: values.limit === undefined ? 20 : Number(values.limit),
    route: values.route,
    candidate: values.candidate,
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(main(), null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
