import { spawnSync } from "node:child_process"
import fs from "node:fs"

function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...options })
  if (r.status !== 0)
    throw new Error(`${cmd} ${args.join(" ")} failed\n${r.stderr || r.stdout || ""}`)
  return r.stdout?.trim() || ""
}
try {
  const branch = run("git", ["branch", "--show-current"])
  if (branch !== "main") throw new Error("Publish from main after reviewing and merging changes.")
  const remote = run("git", ["remote", "get-url", "origin"])
  if (!/^https:\/\/github\.com\/SKYAN0213\/tech-knowledge-garden(?:\.git)?$/.test(remote))
    throw new Error("Unexpected publication repository.")
  if (run("git", ["diff", "--cached", "--name-only"]))
    throw new Error(
      "Review the existing staged changes before publishing; they will not be committed automatically.",
    )
  run("npm", ["run", "build"], { stdio: "inherit" })
  run("node", ["scripts/verify-site.mjs"], { stdio: "inherit" })
  run("git", ["add", "--", "vault", "data/catalog.json"])
  const changed = run("git", ["diff", "--cached", "--name-only"])
  if (changed)
    run(
      "git",
      [
        "commit",
        "-m",
        `Publish briefing through ${JSON.parse(fs.readFileSync("data/catalog.json")).latest_cutoff}`,
      ],
      { stdio: "inherit" },
    )
  // Normal push deliberately refuses divergence; never force-push or auto-resolve content conflicts.
  run("git", ["push", "origin", "main"], { stdio: "inherit" })
  console.log(
    "Pushed validated content. Check the Publish Garden workflow before reporting website publication.",
  )
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
}
