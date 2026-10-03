import fs from "node:fs"
import path from "node:path"
import { PUBLIC_ROOTS, sha256 } from "./contracts.mjs"
import { privatePreview } from "./preview.mjs"
import {
  atomicCreate,
  readJSON,
  safePath,
  withGardenOperationLock,
  withLock,
} from "./run-state.mjs"

export const DRIVE_AUTHORING_ROOTS = {
  Editions: "1cTY588ZYBPVNyuB41Tcu7OYyCqAZdSW-",
  Knowledge: "1Ykx3LoF6v8qyFcPQP0D9XKNVoOqM-v0Q",
  Signals: "14SbkTeQ1JMy-5PAoPwhSaFaNjwc8Ncnt",
  TrendTopics: "12JauFgbLZY-HvE8kW_DPFH4mFlclWlAX",
}
const validRun = (value) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value))
    throw Error("Invalid preview run")
}
const authoringPath = (value) => {
  if (
    typeof value !== "string" ||
    !PUBLIC_ROOTS.includes(value.split("/")[0]) ||
    !value.endsWith(".md") ||
    value.includes("\\") ||
    value.split("/").some((part) => !part || part.startsWith("."))
  )
    throw Error("Path is outside authoring Markdown roots")
  return value
}

export function authoringInventory(vault) {
  const entries = new Map()
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = safePath(vault, path.relative(vault, path.join(directory, entry.name)))
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        const relative = authoringPath(path.relative(vault, absolute).split(path.sep).join("/"))
        const bytes = fs.readFileSync(absolute)
        entries.set(relative, { bytes, sha256: sha256(bytes) })
      } else if (!entry.isFile()) throw Error("Non-regular authoring input")
    }
  }
  for (const root of PUBLIC_ROOTS) visit(safePath(vault, root))
  return entries
}

// Export only the delta of an already verified preview. This is never a release approval.
export function authoringDelta(manifest, before, after) {
  if (manifest?.schema !== "private-reader-preview/v1") throw Error("Verified preview required")
  const allowed = [
    ...manifest.editions,
    ...manifest.knowledge,
    ...(manifest.navigation ? [manifest.navigation] : []),
  ]
  const declared = new Map()
  for (const row of allowed) {
    authoringPath(row.path)
    if (declared.has(row.path) || !/^[a-f0-9]{64}$/.test(row.sha256 || ""))
      throw Error("Ambiguous preview authoring changes")
    declared.set(row.path, row.sha256)
    if (after.get(row.path)?.sha256 !== row.sha256) throw Error("Approved authoring bytes changed")
  }
  const changed = []
  for (const [relative, source] of before) {
    if (!after.has(relative)) throw Error("Authoring deletion requires a separate review")
    if (source.sha256 === after.get(relative).sha256) continue
    if (!declared.has(relative)) throw Error("Undeclared authoring change")
  }
  for (const [relative, source] of after) {
    authoringPath(relative)
    if (source.sha256 === before.get(relative)?.sha256) continue
    if (!declared.has(relative)) throw Error("Undeclared authoring change")
    changed.push({
      path: relative,
      operation: before.has(relative) ? "update" : "create",
      previous_sha256: before.get(relative)?.sha256 || null,
      sha256: source.sha256,
      bytes: source.bytes.length,
    })
  }
  return changed.sort((a, b) => a.path.localeCompare(b.path))
}

export async function prepareAuthoringTransfer({
  root,
  previewRun,
  vault = "vault",
  repo = process.cwd(),
}) {
  validRun(previewRun)
  return withGardenOperationLock(root, () =>
    withLock(root, "run-" + previewRun, async () => {
      const manifestPath = `runs/${previewRun}/preview-manifest.json`
      const initial = readJSON(root, manifestPath)
      if (initial?.run_id !== previewRun) throw Error("Existing verified preview required")
      // Reuse the existing evidence, approval, source snapshot, build and output checks.
      await privatePreview(root, previewRun, initial.approved_runs, {
        repo,
        vault,
        knowledgeRuns: initial.knowledge_runs,
        editionSpec: initial.edition_spec || null,
      })
      const manifestBytes = fs.readFileSync(safePath(root, manifestPath))
      const manifest = JSON.parse(manifestBytes)
      const sourceVault = path.resolve(repo, vault)
      const workspace = safePath(root, manifest.workspace)
      const before = authoringInventory(sourceVault),
        after = authoringInventory(path.join(workspace, "vault"))
      const delta = authoringDelta(manifest, before, after)
      const directory = `runs/${previewRun}/drive-authoring`
      const plan = {
        schema: "research-authoring-transfer/v1",
        preview_run: previewRun,
        preview_sha256: sha256(manifestBytes),
        source_vault: sourceVault,
        source_files: [...before]
          .map(([relative, row]) => ({ path: relative, sha256: row.sha256 }))
          .sort((a, b) => a.path.localeCompare(b.path)),
        destination_folder_id: "1VKWSC2IYOtOd__3NKEzD-BK34qVqtlAD",
        roots: DRIVE_AUTHORING_ROOTS,
        files: delta.map((row) => ({ ...row, staged_path: directory + "/files/" + row.path })),
        coverage_complete: manifest.coverage_complete === true,
        release_approved: false,
        upload_allowed: false,
        candidate_published: false,
        drive_written: false,
      }
      const receiptPath = directory + "/transfer-plan.json"
      const prior = readJSON(root, receiptPath)
      if (prior && JSON.stringify(prior) !== JSON.stringify(plan))
        throw Error("Authoring transfer inputs changed")
      for (const row of plan.files) {
        const file = safePath(root, row.staged_path)
        if (fs.existsSync(file)) {
          if (sha256(fs.readFileSync(file)) !== row.sha256)
            throw Error("Staged authoring bytes changed")
        } else atomicCreate(root, row.staged_path, after.get(row.path).bytes)
      }
      if (
        sha256(fs.readFileSync(safePath(root, manifestPath))) !== plan.preview_sha256 ||
        JSON.stringify([...authoringInventory(sourceVault)].map(([p, v]) => [p, v.sha256])) !==
          JSON.stringify([...before].map(([p, v]) => [p, v.sha256]))
      )
        throw Error("Authoring source changed during preparation")
      if (!prior) atomicCreate(root, receiptPath, plan)
      return {
        plan_path: receiptPath,
        files: plan.files.length,
        bytes: plan.files.reduce((sum, row) => sum + row.bytes, 0),
        changed: !prior,
        upload_allowed: false,
      }
    }),
  )
}

// A fresh, complete listing plus raw-byte hashes resolves unknown upload outcomes.
// Desired bytes already present => no write. Original bytes => update the same ID.
// A new path absent from its fully listed parent => create. Anything else conflicts.
export function compareAuthoringRemote(plan, observation, { now = Date.now() } = {}) {
  if (
    plan?.schema !== "research-authoring-transfer/v1" ||
    observation?.schema !== "research-authoring-remote-observation/v1" ||
    observation.root_folder_id !== plan.destination_folder_id ||
    JSON.stringify(plan.roots) !== JSON.stringify(DRIVE_AUTHORING_ROOTS) ||
    !Number.isFinite(Date.parse(observation.observed_at)) ||
    Math.abs(now - Date.parse(observation.observed_at)) > 600000
  )
    throw Error("Fresh scoped Drive observation required")
  const folders = new Map(Object.entries(DRIVE_AUTHORING_ROOTS))
  const ids = new Set(folders.values())
  const listings = new Map()
  for (const folder of [...observation.folders].sort(
    (a, b) => a.path.split("/").length - b.path.split("/").length,
  )) {
    if (
      typeof folder.path !== "string" ||
      folder.path.split("/").some((p) => !p || p.startsWith(".")) ||
      folder.path.includes("\\") ||
      !folders.has(path.posix.dirname(folder.path)) ||
      folder.parent_id !== folders.get(path.posix.dirname(folder.path)) ||
      !folder.id ||
      ids.has(folder.id) ||
      folders.has(folder.path)
    )
      throw Error("Invalid Drive folder chain")
    folders.set(folder.path, folder.id)
    ids.add(folder.id)
  }
  for (const listing of observation.listings) {
    if (
      !folders.has(listing.path) ||
      listing.id !== folders.get(listing.path) ||
      listing.complete !== true ||
      listings.has(listing.path) ||
      !Array.isArray(listing.files)
    )
      throw Error("Incomplete or ambiguous Drive parent listing")
    const names = new Set()
    for (const file of listing.files) {
      if (
        typeof file.name !== "string" ||
        !file.name ||
        file.name.includes("/") ||
        file.name.includes("\\") ||
        names.has(file.name) ||
        !file.id ||
        ids.has(file.id) ||
        file.parent_id !== listing.id ||
        !Number.isFinite(Date.parse(file.modified_at))
      )
        throw Error("Ambiguous Drive file identity")
      names.add(file.name)
      ids.add(file.id)
    }
    listings.set(listing.path, listing)
  }
  const seen = new Set()
  const operations = plan.files.map((row) => {
    authoringPath(row.path)
    if (
      seen.has(row.path) ||
      !/^[a-f0-9]{64}$/.test(row.sha256 || "") ||
      !["create", "update"].includes(row.operation) ||
      (row.operation === "create"
        ? row.previous_sha256 !== null
        : !/^[a-f0-9]{64}$/.test(row.previous_sha256 || ""))
    )
      throw Error("Invalid transfer file")
    seen.add(row.path)
    const parent = listings.get(path.posix.dirname(row.path))
    if (!parent) throw Error("Missing complete Drive parent listing")
    const file = parent.files.find((file) => file.name === path.posix.basename(row.path))
    let action
    if (file && !/^[a-f0-9]{64}$/.test(file.sha256 || ""))
      throw Error("Drive raw-byte hash required")
    if (file?.sha256 === row.sha256) action = "already_applied"
    else if (file?.sha256 === row.previous_sha256) action = "update"
    else if (!file && row.operation === "create") action = "create"
    else throw Error("Drive authoring conflict: " + row.path)
    return {
      path: row.path,
      action,
      parent_id: parent.id,
      file_id: file?.id || null,
      modified_at: file?.modified_at || null,
      expected_sha256: file?.sha256 || null,
      desired_sha256: row.sha256,
    }
  })
  return {
    schema: "research-authoring-transfer-comparison/v1",
    preview_run: plan.preview_run,
    operations,
    upload_allowed: false,
    release_approved: false,
    drive_written: false,
  }
}
