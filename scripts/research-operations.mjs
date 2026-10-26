import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

// This stable launcher selects code only; the installed program owns all
// workflow state, schemas, approvals, transport requests and publication.
const workspace = fs.realpathSync(fileURLToPath(new URL("../", import.meta.url)))
try {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg === "--repo" || arg.startsWith("--repo=")))
    throw Error("The active runtime workspace cannot be overridden")
  const activeFile = path.join(workspace, ".local/.storage/active-runtime.json")
  if (!fs.existsSync(activeFile)) {
    console.log(JSON.stringify({ status: "development_pending", reason: "runtime_not_activated" }))
  } else {
    const active = JSON.parse(fs.readFileSync(activeFile))
    if (active.workspace !== workspace) throw Error("Active runtime workspace changed")
    let runtime = active.runtime
    const index = args.indexOf("--round")
    if (index >= 0 && args[0] !== "continue") {
      let round = args[index + 1]
      if (!/^[A-Za-z0-9_-]{1,70}$/.test(round || "")) throw Error("Safe round ID required")
      const root = path.join(workspace, ".local/research/local-ai")
      const visited = new Set()
      while (fs.existsSync(path.join(root, `operations/rounds/${round}/continuation.json`))) {
        if (visited.has(round) || visited.size >= 8) throw Error("Cyclic operational continuation")
        visited.add(round)
        const link = JSON.parse(
          fs.readFileSync(path.join(root, `operations/rounds/${round}/continuation.json`)),
        )
        if (
          !/^[A-Za-z0-9_-]{1,70}$/.test(link.successor || "") ||
          link.evidence?.path !== `operations/rounds/${round}/continuation-evidence.json` ||
          link.successor_pin?.path !== `operations/rounds/${link.successor}/input.json`
        )
          throw Error("Invalid operational continuation link")
        const checked = (ref) => {
          const bytes = fs.readFileSync(path.join(root, ref.path))
          if (crypto.createHash("sha256").update(bytes).digest("hex") !== ref.sha256)
            throw Error("Operational continuation evidence changed")
          return JSON.parse(bytes)
        }
        const evidence = checked(link.evidence),
          successor = checked(link.successor_pin)
        if (
          evidence.parent?.path !== `operations/rounds/${round}/input.json` ||
          evidence.successor !== link.successor ||
          successor.run_id !== link.successor ||
          JSON.stringify(successor.continuation) !== JSON.stringify(link.evidence)
        )
          throw Error("Operational continuation ownership changed")
        checked(evidence.parent)
        round = link.successor
      }
      args[index + 1] = round
      const pinFile = path.join(
        workspace,
        `.local/research/local-ai/operations/rounds/${round}/input.json`,
      )
      if (fs.existsSync(pinFile)) {
        const pin = JSON.parse(fs.readFileSync(pinFile))
        runtime = pin.execution_repository || pin.repository
      }
    }
    if (!path.isAbsolute(runtime) || fs.realpathSync(runtime) !== runtime)
      throw Error("An explicit installed runtime path is required")
    const seal = fs.readFileSync(path.join(runtime, ".local/.storage/runtime-release.json"))
    if (
      runtime === active.runtime &&
      crypto.createHash("sha256").update(seal).digest("hex") !== active.installation.sha256
    )
      throw Error("Active runtime installation changed")
    const result = spawnSync(
      process.execPath,
      [path.join(runtime, "scripts/research-module.mjs"), ...args, "--repo", workspace],
      {
        cwd: workspace,
        stdio: "inherit",
        env: {
          ...process.env,
          ...(active.python ? { RESEARCH_PYTHON: active.python.executable } : {}),
        },
      },
    )
    if (result.error) throw result.error
    process.exitCode = result.status ?? 1
  }
} catch (error) {
  console.error(JSON.stringify({ status: "development_pending", reason: error.message }))
  process.exitCode = 1
}
