import fs from "node:fs"
import path from "node:path"
import { PUBLIC_ROOTS, sha256 } from "./contracts.mjs"
import { readJSON, safePath } from "./run-state.mjs"
import { loadCurrentApproval } from "./preview.mjs"

// Preserve the source notes needed for definitions, alias conflicts and original
// note replacement checks. Generated vault folders and private operations are
// excluded. Planning reads bytes but does not write the archive or live vault.
export function planConceptAuthority(vault, archiveRun) {
  const notes = []
  function visit(relative) {
    const file = safePath(vault, relative)
    const stat = fs.lstatSync(file)
    if (stat.isSymbolicLink()) throw Error("Symlink in concept authority")
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) visit(relative + "/" + name)
    } else if (stat.isFile() && relative.endsWith(".md")) {
      const content = fs.readFileSync(file)
      notes.push({ relative, content, bytes: content.length, sha256: sha256(content) })
    }
  }
  for (const folder of PUBLIC_ROOTS) if (fs.existsSync(path.join(vault, folder))) visit(folder)
  notes.sort((a, b) => a.relative.localeCompare(b.relative))
  if (
    !notes.length ||
    notes.length > 1024 ||
    notes.reduce((s, n) => s + n.bytes, 0) > 64 * 1024 ** 2
  )
    throw Error("Concept authority snapshot file or byte budget exceeded")
  const identity = notes.map(({ content, ...file }) => file)
  const run = archiveRun + "-authority-" + sha256(JSON.stringify(identity)).slice(0, 16)
  const relativeVault = `runs/${run}/concept-vault`
  const markerPath = `runs/${run}/concept-authority.json`
  const marker =
    JSON.stringify(
      { schema: "research-concept-authority/v1", archive_run: archiveRun, files: identity },
      null,
      2,
    ) + "\n"
  return {
    run,
    relative_vault: relativeVault,
    writes: [
      { path: markerPath, content: marker },
      ...notes.map(({ relative, content }) => ({ path: `${relativeVault}/${relative}`, content })),
    ],
    files: [
      {
        path: markerPath,
        bytes: Buffer.byteLength(marker),
        sha256: sha256(marker),
        drive_root: "Research",
        public: false,
      },
      ...notes.map(({ relative, bytes, sha256 }) => ({
        path: `${relativeVault}/${relative}`,
        bytes,
        sha256,
        drive_root: "Research",
        public: false,
      })),
    ].sort((a, b) => a.path.localeCompare(b.path)),
  }
}

// Restored definitions are a historical authority copy. Revalidate every bound
// byte and the full note inventory before loading the original article approval.
export function loadArchivedConceptApproval(root, archiveRun, approvedRun) {
  if (
    ![archiveRun, approvedRun].every((id) => typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id))
  )
    throw Error("Valid archive and approved run IDs required")
  const manifest = readJSON(root, `runs/${archiveRun}/archive-manifest.json`)
  const authorities = manifest?.concept_authorities || []
  const authority = authorities.find((a) => a.approved_run === approvedRun)
  if (
    manifest?.schema !== "research-archive/v2" ||
    manifest.run_id !== archiveRun ||
    !authority ||
    authorities.filter((a) => a.approved_run === approvedRun).length !== 1 ||
    !manifest.bound_runs?.includes(approvedRun) ||
    !manifest.bound_runs.includes(authority.run) ||
    authority.relative_vault !== `runs/${authority.run}/concept-vault` ||
    !Array.isArray(manifest.files)
  )
    throw Error("Bound concept authority archive required")
  for (const file of manifest.files) {
    const bytes = fs.readFileSync(safePath(root, file.path))
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256)
      throw Error("Concept archive dependency bytes changed")
  }
  const vault = safePath(root, authority.relative_vault)
  const planned = planConceptAuthority(vault, archiveRun)
  const expected = manifest.files.filter((f) => f.path.startsWith(`runs/${authority.run}/`))
  if (planned.run !== authority.run || JSON.stringify(planned.files) !== JSON.stringify(expected))
    throw Error("Concept archive authority inventory changed")
  return loadCurrentApproval(root, approvedRun, { vault })
}
