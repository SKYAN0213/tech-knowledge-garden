import { spawnSync } from "node:child_process"

export const publicationContentPaths = [
  "vault/Editions",
  "vault/Knowledge",
  "vault/Signals",
  "vault/TrendTopics",
  "vault/Briefings",
  "vault/News",
  "vault/Trends",
  "vault/Knowledge Maps",
  "vault/About.md",
  "vault/index.md",
  "vault/briefing.xml",
  "digest",
  "data/catalog.json",
  "data/drive-source-state.json",
]

export function nonContentChanges(cwd = process.cwd()) {
  const result = spawnSync(
    "git",
    [
      "status",
      "--porcelain",
      "--untracked-files=all",
      "--",
      ".",
      ...publicationContentPaths.map((entry) => `:(exclude)${entry}`),
    ],
    { cwd, encoding: "utf8" },
  )
  if (result.status !== 0)
    throw new Error(`Cannot inspect publication code state: ${result.stderr || result.stdout}`)
  return result.stdout.trim()
}
