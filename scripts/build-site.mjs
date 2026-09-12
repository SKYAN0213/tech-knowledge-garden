import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { prepare, finish } from "./site.mjs"
import { buildGraph } from "./knowledge.mjs"
import { feeds } from "./garden.mjs"
const input = fs.mkdtempSync(path.join(os.tmpdir(), "tech-garden-reader-"))
try {
  prepare("vault", input)
  const r = spawnSync("npx", ["quartz", "build", "-d", input], { stdio: "inherit" })
  if (r.status !== 0) throw Error("Quartz rendering failed")
  feeds()
  fs.writeFileSync("public/knowledge-graph.json", JSON.stringify(buildGraph()))
  await finish("public", input)
} finally {
  fs.rmSync(input, { recursive: true, force: true })
}
