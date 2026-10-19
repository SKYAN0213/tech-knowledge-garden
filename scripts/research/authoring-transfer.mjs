import fs from "node:fs"
import path from "node:path"
import { PUBLIC_ROOTS, sha256 } from "./contracts.mjs"
import {
  privatePreview,
  loadPreviewPublicationInputs,
  previewEditionProjections,
  conceptIndexProjection,
} from "./preview.mjs"
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

// Consume completed generation evidence without regenerating it under today's code.
// Missing/partial checkpoints still take the existing preparation path.
export function inspectCompletedAuthoringPreview({
  root,
  previewRun,
  repo = process.cwd(),
  vault = "vault",
}) {
  validRun(previewRun)
  const manifestPath = `runs/${previewRun}/preview-manifest.json`
  const manifestBytes = fs.readFileSync(safePath(root, manifestPath))
  const manifest = JSON.parse(manifestBytes)
  const statePath = `runs/${previewRun}/preview/state.json`
  const state = readJSON(root, statePath)
  if (!state || state.stages?.outputs?.status !== "complete") return null
  const required = [
    "workspace",
    "refresh",
    "knowledge-sync",
    "knowledge-check",
    "validate",
    "build",
    "verify",
    "consistency",
    "outputs",
  ]
  if (
    state.schema !== "research-run/v1" ||
    state.run_id !== previewRun ||
    !/^[a-f0-9]{64}$/.test(state.input_hash || "") ||
    manifest.schema !== "private-reader-preview/v1" ||
    manifest.run_id !== previewRun ||
    manifest.workspace !== `runs/${previewRun}/preview-workspace` ||
    manifest.candidate_published !== false ||
    manifest.drive_verified !== false ||
    required.some((name) => state.stages[name]?.status !== "complete")
  )
    throw Error("Exact completed private preview checkpoints required")
  for (const [name, stage] of Object.entries(state.stages)) {
    if (
      stage.status !== "complete" ||
      stage.result_path !== `runs/${previewRun}/preview/${name}.json`
    )
      throw Error("Completed preview stage changed")
    const resultBytes = fs.readFileSync(safePath(root, stage.result_path)),
      result = JSON.parse(resultBytes)
    if (sha256(JSON.stringify(result)) !== stage.result_hash)
      throw Error("Completed preview checkpoint bytes changed")
    if (result.log && sha256(fs.readFileSync(safePath(root, result.log))) !== result.log_sha256)
      throw Error("Completed preview generation log changed")
    if (name === "outputs" && !resultBytes.equals(manifestBytes))
      throw Error("Completed preview manifest bytes changed")
  }
  const sourceVault = path.resolve(repo, vault)
  const selected = loadPreviewPublicationInputs(
    root,
    previewRun,
    manifest.daily_editorial_handoff ? [] : manifest.approved_runs,
    {
      vault: sourceVault,
      knowledgeRuns: manifest.knowledge_runs,
      publicationHandoff: manifest.daily_editorial_handoff?.path || null,
      editionSpec: manifest.edition_spec || null,
      legacyReviews: manifest.legacy_reviews || [],
      sourceAlternatives: manifest.source_alternatives || [],
      retrospectiveRuns: (manifest.retrospective_runs || []).map((row) => row.run_id),
    },
  )
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  if (
    !same(selected.approvedRuns, manifest.approved_runs) ||
    !same(selected.knowledgeRuns, manifest.knowledge_runs) ||
    !same(selected.dailySelection, manifest.daily_editorial_handoff || null) ||
    !same(selected.retrospectiveReferences, manifest.retrospective_runs || []) ||
    (selected.curation && !same(selected.newEditionRuns, manifest.new_edition_runs || []))
  )
    throw Error("Completed preview approval selection changed")
  const notes = selected.knowledge.flatMap((k) => k.approval.notes)
  const projections = selected.approvals.length || manifest.legacy_reviews?.length
    ? previewEditionProjections(sourceVault, selected, {
        editionSpec: manifest.edition_spec || null,
        notes,
        legacyReviews: manifest.legacy_reviews || [],
        root,
      })
    : []
  const projected = projections.map((p) => ({
    path: p.path,
    sha256: sha256(p.content),
    event_ids: p.event_ids,
  }))
  const navigation = conceptIndexProjection(sourceVault, notes)
  const navRef = navigation
    ? {
        path: navigation.path,
        previous_sha256: navigation.previous_sha256,
        sha256: navigation.sha256,
      }
    : null
  if (
    !same(projected, manifest.editions) ||
    !same(
      notes.map((n) => ({ path: n.path, sha256: n.sha256 })),
      manifest.knowledge,
    ) ||
    !same(navRef, manifest.navigation || null)
  )
    throw Error("Completed preview canonical source or approval bytes changed")
  const workspace = safePath(root, manifest.workspace)
  for (const [directory, rows] of [
    [
      "vault",
      [
        ...manifest.editions,
        ...manifest.knowledge,
        ...(manifest.navigation ? [manifest.navigation] : []),
      ],
    ],
    ["public", manifest.public],
    ["digest", manifest.digest],
  ]) {
    if (
      !Array.isArray(rows) ||
      !rows.length ||
      new Set(rows.map((r) => r.path)).size !== rows.length
    )
      throw Error("Completed preview exact outputs required")
    for (const row of rows)
      if (
        !/^[a-f0-9]{64}$/.test(row.sha256 || "") ||
        sha256(fs.readFileSync(safePath(path.join(workspace, directory), row.path))) !== row.sha256
      )
        throw Error("Completed preview output bytes changed")
  }
  authoringDelta(
    manifest,
    authoringInventory(sourceVault),
    authoringInventory(path.join(workspace, "vault")),
  )
  return {
    schema: "research-completed-preview-consumption/v1",
    preview: { path: manifestPath, sha256: sha256(manifestBytes) },
    generation: {
      observed_at: manifest.observed_at,
      input_hash: state.input_hash,
      state: { path: statePath, sha256: sha256(fs.readFileSync(safePath(root, statePath))) },
    },
    consumer: {
      observed_at: new Date().toISOString(),
      implementation_sha256: sha256(fs.readFileSync(new URL(import.meta.url))),
    },
    renderer_reexecuted: false,
    approval_granted: false,
  }
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
      const consumption = inspectCompletedAuthoringPreview({ root, previewRun, repo, vault })
      if (!consumption)
        await privatePreview(
          root,
          previewRun,
          initial.daily_editorial_handoff ? [] : initial.approved_runs,
          {
            repo,
            vault,
            publicationHandoff: initial.daily_editorial_handoff?.path || null,
            knowledgeRuns: initial.knowledge_runs,
            editionSpec: initial.edition_spec || null,
            legacyReviews: initial.legacy_reviews || [],
            sourceAlternatives: initial.source_alternatives || [],
            retrospectiveRuns: (initial.retrospective_runs || []).map((row) => row.run_id),
          },
        )
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
        ...(consumption ? { preview_consumption: consumption } : {}),
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
  const observedRoots = new Set()
  const listings = new Map()
  for (const folder of [...observation.folders].sort(
    (a, b) => a.path.split("/").length - b.path.split("/").length,
  )) {
    // Source captures include metadata for the four fixed roots. Their IDs are
    // already pinned by the transfer plan, so validate them against the fixed
    // destination instead of treating them as variable child folders.
    if (typeof folder.path === "string" && Object.hasOwn(DRIVE_AUTHORING_ROOTS, folder.path)) {
      if (
        observedRoots.has(folder.path) ||
        folder.id !== DRIVE_AUTHORING_ROOTS[folder.path] ||
        folder.parent_id !== plan.destination_folder_id
      )
        throw Error("Invalid Drive folder chain")
      observedRoots.add(folder.path)
      continue
    }
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
