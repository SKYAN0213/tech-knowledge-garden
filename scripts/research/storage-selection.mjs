import fs from "node:fs"
const policy = JSON.parse(fs.readFileSync(new URL("../../data/research-storage-exclusions.json", import.meta.url)))
export function backupExcluded(relative) {
  const parts = relative.split("/")
  return parts.some((p) => policy.directories.includes(p) || /credential|oauth|secret/i.test(p)) ||
    policy.sequences.some((sequence) => parts.some((_, i) =>
      sequence.every((part, j) => parts[i + j] === part)))
}
