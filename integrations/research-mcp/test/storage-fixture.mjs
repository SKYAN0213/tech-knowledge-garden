import fs from "node:fs"
import path from "node:path"

// This parent outlives per-test cleanup and is outside the production research payload tree.
export function isolatedMCPFixtureParent(repo) {
  const branch = path.join(fs.realpathSync(repo), ".local/research-test-fixtures")
  fs.mkdirSync(branch, { recursive: true, mode: 0o700 })
  if (fs.lstatSync(branch).isSymbolicLink() || fs.realpathSync(branch) !== branch)
    throw Error("MCP fixture branch must not follow symlinks")
  // A private parent per fixture avoids partially published shared policy races.
  const parent = fs.mkdtempSync(path.join(branch, "guard-"))
  for (const directory of [parent, path.join(parent, ".storage")]) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    if (fs.lstatSync(directory).isSymbolicLink() || fs.realpathSync(directory) !== directory)
      throw Error("MCP fixture parent must not follow symlinks")
  }
  const policy = path.join(parent, ".storage/policy.json")
  const expected = { schema: "research-cold-storage/v1", root: parent, enabled: false }
  try {
    fs.writeFileSync(policy, JSON.stringify(expected) + "\n", { flag: "wx", mode: 0o600 })
  } catch (error) {
    if (error.code !== "EEXIST") throw error
  }
  const fd = fs.openSync(policy, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try {
    const info = fs.fstatSync(fd)
    if (!info.isFile() || info.nlink !== 1) throw Error("Aliased MCP fixture policy")
    const actual = JSON.parse(fs.readFileSync(fd, "utf8"))
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw Error("MCP fixture parent storage policy changed")
  } finally {
    fs.closeSync(fd)
  }
  return parent
}
