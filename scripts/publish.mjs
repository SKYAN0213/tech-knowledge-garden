import { spawnSync } from "node:child_process"
import fs from "node:fs"
import { nonContentChanges, publicationContentPaths } from "./publication-state.mjs"
import { DEFAULT_ROOT, withGardenOperationLock } from "./research/run-state.mjs"
import { pushAndVerify } from "./publication-receipt.mjs"
import { assertNoUnresolvedAuthoringWrites } from "./research/authoring-execution.mjs"

function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...options })
  if (r.status !== 0)
    throw new Error(`${cmd} ${args.join(" ")} failed\n${r.stderr || r.stdout || ""}`)
  return r.stdout?.trim() || ""
}
try {
  await withGardenOperationLock(DEFAULT_ROOT, async () => {
    assertNoUnresolvedAuthoringWrites(DEFAULT_ROOT)
    const branch = run("git", ["branch", "--show-current"])
    if (branch !== "main") throw new Error("Publish from main after reviewing and merging changes.")
    const remote = run("git", ["remote", "get-url", "origin"])
    if (!/^https:\/\/github\.com\/SKYAN0213\/tech-knowledge-garden(?:\.git)?$/.test(remote))
      throw new Error("Unexpected publication repository.")
    if (run("git", ["diff", "--cached", "--name-only"]))
      throw new Error(
        "Review the existing staged changes before publishing; they will not be committed automatically.",
      )
    if (nonContentChanges())
      throw new Error(
        "Uncommitted source, configuration, or documentation changes must be reviewed and committed before publishing content.",
      )
    run("python3", ["scripts/pull-drive.py", "--verify-working-copy"], { stdio: "inherit" })
    run("npm", ["run", "build"], { stdio: "inherit" })
    run("node", ["scripts/verify-site.mjs"], { stdio: "inherit" })
    run("git", ["add", "--", ...publicationContentPaths])
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
    const publication = pushAndVerify({
      root: DEFAULT_ROOT,
      runGit: (args, options) => run("git", args, options),
    })
    console.log(
      `Remote commit ${publication.local_commit} confirmed (${publication.status}). Check the Publish Garden workflow before reporting website publication.`,
    )
  })
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
}
