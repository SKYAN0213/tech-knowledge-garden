import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { sha256 } from "./contracts.mjs"
import {
  atomicCreate,
  atomicWrite,
  readJSON,
  safePath,
  withLock,
  withGardenOperationLock,
} from "./run-state.mjs"
import { materializeAuthoringReadback, storeAuthoringReadback } from "./authoring-readback.mjs"
import { registerArchiveLocation } from "./archive-locations.mjs"

export const REMOTE_DELIVERY_ROOTS = {
  Research: "11Mu9qSiR8Pk32k53-i032qSRPTdsozV7",
  WebsiteData: "1PmB8hL5LXQ4lSr6NVeLUktf0LYwpfb1d",
}
const OWNER = "1VKWSC2IYOtOd__3NKEzD-BK34qVqtlAD"
const WEBSITE_FILES = [
  "README.md",
  "articles.csv",
  "briefing.xml",
  "catalog.json",
  "concepts.csv",
  "connections.csv",
  "contentIndex.json",
  "knowledge-graph.json",
  "pages.csv",
  "reader-index.json",
  "snapshot.json",
]
const ASSETS = {
  "reader-index.json": "reader-index.json",
  "knowledge-graph.json": "knowledge-graph.json",
  "contentIndex.json": "static/contentIndex.json",
  "briefing.xml": "briefing.xml",
}
const bytes = (root, relative) => fs.readFileSync(safePath(root, relative))
const ref = (root, relative) => ({ path: relative, sha256: sha256(bytes(root, relative)) })
function pinned(root, reference) {
  const value = bytes(root, reference.path)
  if (sha256(value) !== reference.sha256) throw Error("Remote delivery evidence changed")
  return JSON.parse(value)
}
function install(root, relative, value) {
  const data = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value, null, 2) + "\n")
  if (!fs.existsSync(safePath(root, relative))) atomicCreate(root, relative, data)
  else if (!bytes(root, relative).equals(data))
    throw Error("Remote delivery immutable input changed")
  return ref(root, relative)
}

async function recordWebsiteMapping(root, run, repository, latest) {
  const base = `runs/${run}/remote-delivery`,
    existing = readJSON(root, base + "/website-mapping.json")
  if (existing) {
    if (existing.receipt.sha256 !== latest.receipt.sha256)
      throw Error("WebsiteData mapping receipt changed")
    pinned(root, existing.before)
    return { ...existing, reused: true }
  }
  return withGardenOperationLock(root, async () => {
    const relative = ".local/drive-sync/receipt.json",
      source = readJSON(repository, relative)
    if (source?.schema !== "tech-drive-receipt/v1" || !Array.isArray(source.files))
      throw Error("Existing canonical Drive receipt required for WebsiteData mapping")
    const receipt = pinned(root, latest.receipt),
      readback = pinned(root, receipt.readback)
    if (
      Date.parse(source.website_data_delivery?.verified_at || "") > Date.parse(readback.observed_at)
    )
      throw Error("Newer WebsiteData mapping requires preserving this historical receipt")
    const backup = base + "/website-mapping-before.json"
    const before = fs.existsSync(safePath(root, backup))
      ? ref(root, backup)
      : install(root, backup, bytes(repository, relative))
    const rows = readback.files
      .filter((r) => r.path.startsWith("WebsiteData/"))
      .map((r) => ({
        path: r.path,
        id: r.file_id,
        url: `https://drive.google.com/file/d/${r.file_id}/view`,
        sha256: r.sha256,
        bytes: r.bytes,
        modified_time: r.modified_at,
        shared: false,
      }))
    for (const row of rows) {
      const same = source.files.filter((f) => f.path === row.path)
      if (same.length > 1 || (same[0] && same[0].id !== row.id))
        throw Error("Canonical WebsiteData file identity conflict")
      const index = source.files.findIndex((f) => f.path === row.path)
      if (index < 0) source.files.push(row)
      else source.files[index] = { ...source.files[index], ...row }
    }
    source.website_data_delivery = {
      run_id: run,
      verified_at: readback.observed_at,
      receipt: latest.receipt,
    }
    // Preserve original-source rows and their observation time. This is only a
    // WebsiteData mapping update, never a fresh authoring-root snapshot.
    const desired = Buffer.from(JSON.stringify(source, null, 2) + "\n")
    if (!bytes(repository, relative).equals(desired)) atomicWrite(repository, relative, desired)
    const result = {
      schema: "research-website-mapping/v1",
      run_id: run,
      before,
      receipt: latest.receipt,
      rows_sha256: sha256(JSON.stringify(rows)),
      updated_paths: rows.map((r) => r.path),
    }
    install(root, base + "/website-mapping.json", result)
    return result
  })
}

// Completed delivery is an archived raw-byte observation, not a fresh remote read.
export function inspectRemoteDelivery(root, run) {
  const base = `runs/${run}/remote-delivery`,
    input = readJSON(root, base + "/input.json")
  if (!input) return null
  const latest = readJSON(root, base + "/latest.json")
  if (
    input.schema !== "research-remote-delivery-input/v1" ||
    input.run_id !== run ||
    (latest && latest.input_sha256 !== sha256(JSON.stringify(input)))
  )
    throw Error("Invalid remote delivery checkpoint")
  const prepared = readJSON(root, base + "/prepared.json")
  if (prepared && prepared.input_sha256 !== sha256(JSON.stringify(input)))
    throw Error("Remote manifest input changed")
  const manifest = prepared ? pinned(root, prepared.manifest) : null
  if (
    manifest &&
    (manifest.schema !== "research-remote-delivery-files/v1" ||
      manifest.run_id !== run ||
      manifest.files
        .map((r) => r.path)
        .sort()
        .join() !==
        [
          ...WEBSITE_FILES.map((n) => "WebsiteData/" + n),
          ...input.archives.map((a) => "Research/" + a.run_id + ".zip"),
        ]
          .sort()
          .join())
  )
    throw Error("Remote delivery manifest scope changed")
  if (manifest)
    for (const row of manifest.files) {
      const data = bytes(root, row.staged_path)
      if (data.length !== row.bytes || sha256(data) !== row.sha256)
        throw Error("Remote delivery staged bytes changed")
    }
  if (latest?.receipt) {
    const receipt = pinned(root, latest.receipt)
    const readback = pinned(root, receipt.readback)
    if (
      receipt.input_sha256 !== sha256(JSON.stringify(input)) ||
      receipt.manifest_sha256 !== prepared?.manifest.sha256 ||
      !receipt.website_data_verified ||
      !receipt.source_archive_verified ||
      readback.files.length !== manifest.files.length ||
      receipt.archives.length !== input.archives.length ||
      receipt.archives.some(
        (a, i) =>
          a.run_id !== input.archives[i].run_id ||
          a.root !== input.archives[i].root ||
          a.package_sha256 !== input.archives[i].package_sha256,
      )
    )
      throw Error("Invalid remote delivery receipt")
    for (const row of manifest.files) {
      const remote = readback.files.find((r) => r.path === row.path)
      if (
        !remote ||
        remote.parent_id !== REMOTE_DELIVERY_ROOTS[row.path.split("/")[0]] ||
        remote.shared !== false ||
        remote.sha256 !== row.sha256 ||
        remote.bytes !== row.bytes ||
        sha256(bytes(root, remote.raw_path)) !== row.sha256
      )
        throw Error("Remote delivery raw proof changed")
    }
    for (const archive of receipt.archives) {
      const restore = pinned(root, archive.restore)
      const manifestBytes = bytes(archive.root, `runs/${archive.run_id}/archive-manifest.json`)
      if (
        sha256(manifestBytes) !== archive.manifest_sha256 ||
        restore.package_sha256 !== archive.package_sha256 ||
        restore.dependency_closed !== true
      )
        throw Error("Remote archive restore proof changed")
      const restored = safePath(root, archive.restore_directory)
      for (const row of JSON.parse(manifestBytes).files) {
        const value = bytes(restored, row.path)
        if (value.length !== row.bytes || sha256(value) !== row.sha256)
          throw Error("Restored remote archive dependency changed")
      }
      const location = bytes(archive.root, archive.location.path)
      const registry = JSON.parse(location)
      if (
        registry.sources_sha256 !== sha256(JSON.stringify(registry.sources)) ||
        registry.drive?.raw_sha256_verified !== true
      )
        throw Error("Native source index changed")
      if (sha256(location) !== archive.location.sha256)
        throw Error("Native archive location changed")
    }
    const sourceEvents = receipt.archives.flatMap((a) =>
      JSON.parse(bytes(a.root, a.location.path)).sources.flatMap((s) => s.event_ids),
    )
    if (input.event_ids.some((e) => !sourceEvents.includes(e)))
      throw Error("Remote sources no longer cover published events")
  }
  const mapping = readJSON(root, base + "/website-mapping.json")
  if (mapping) {
    if (
      mapping.schema !== "research-website-mapping/v1" ||
      mapping.run_id !== run ||
      mapping.receipt.sha256 !== latest?.receipt?.sha256
    )
      throw Error("WebsiteData mapping evidence changed")
    pinned(root, mapping.before)
  }
  return latest ? { ...latest, website_mapping: mapping } : null
}

// The caller owns authenticated connector calls. Reuse native scoped acquisition,
// portable archive registration/restoration and the deployed WebsiteData exporter.
export async function deliverRemoteArtifacts({
  root,
  run,
  repository = process.cwd(),
  publication,
  planFile,
  acquisitionFile,
  nextCapture,
  emit = () => {},
  execute,
  resumeIntent = null,
  waitMs = 300000,
  now = Date.now,
  statusOnly = false,
}) {
  if (
    !/^[A-Za-z0-9_-]{1,100}$/.test(run || "") ||
    !Number.isSafeInteger(waitMs) ||
    waitMs < 1 ||
    waitMs > 600000
  )
    throw Error("Exact remote delivery run and bounded wait required")
  repository = fs.realpathSync(repository)
  root = path.resolve(repository, root)
  const base = `runs/${run}/remote-delivery`
  if (statusOnly) return inspectRemoteDelivery(root, run)
  if (publication?.status !== "public_bytes_verified")
    throw Error("Verified publication required before remote delivery")
  return withLock(root, "remote-delivery-" + run, async () => {
    let input = readJSON(root, base + "/input.json")
    const operation = readJSON(root, `runs/${run}/publication-operation/input.json`)
    const publicProof = readJSON(root, `runs/${run}/publication-operation/public.json`)
    if (!operation || publicProof?.commit !== publication.commit)
      throw Error("Exact native publication required")
    if (input && planFile && sha256(fs.readFileSync(planFile)) !== input.plan.sha256)
      throw Error("Remote delivery plan changed; use a new operation")
    let manifest
    if (!input) {
      if (!planFile) throw Error("Explicit remote delivery plan required")
      const planBytes = fs.readFileSync(planFile),
        plan = JSON.parse(planBytes)
      if (
        plan.schema !== "research-remote-delivery-plan/v1" ||
        !path.isAbsolute(plan.website_stage || "") ||
        path.resolve(plan.website_stage) === repository ||
        path.resolve(plan.website_stage).startsWith(repository + path.sep) ||
        !Array.isArray(plan.archives) ||
        !plan.archives.length ||
        plan.archives.length > 64
      )
        throw Error("External WebsiteData stage and one to sixty-four portable archives required")
      safePath(path.dirname(plan.website_stage), path.basename(plan.website_stage))
      const preview = pinned(root, operation.preview),
        readback = pinned(root, publicProof.readback)
      const assets = Object.entries(ASSETS).map(([name, publicPath]) => {
        const row = readback.files.find((r) => r.kind === "web" && r.path === publicPath)
        if (!row || sha256(bytes(repository, "public/" + publicPath)) !== row.sha256)
          throw Error("WebsiteData differs from this native publication")
        return { name, public_path: publicPath, sha256: row.sha256, bytes: row.bytes }
      })
      const archives = plan.archives.map((row) => {
        if (!/^[A-Za-z0-9_-]+$/.test(row.run_id || "") || !path.isAbsolute(row.root || ""))
          throw Error("Exact portable archive root and run required")
        const archiveRoot = fs.realpathSync(row.root),
          archive = readJSON(archiveRoot, `runs/${row.run_id}/archive-manifest.json`)
        const receipt = readJSON(archiveRoot, `archive-staging/${row.run_id}/package-receipt.json`)
        if (
          archive?.schema !== "research-archive/v2" ||
          receipt?.manifest_sha256 !==
            sha256(bytes(archiveRoot, `runs/${row.run_id}/archive-manifest.json`)) ||
          archive.run_id !== row.run_id ||
          receipt.run_id !== row.run_id ||
          !archive.bound_runs.includes(archive.source_run)
        )
          throw Error("Native portable archive and package receipt required")
        const packageBytes = bytes(archiveRoot, receipt.path)
        if (sha256(packageBytes) !== receipt.sha256 || packageBytes.length !== receipt.bytes)
          throw Error("Portable archive package changed")
        for (const file of archive.files)
          if (sha256(bytes(archiveRoot, file.path)) !== file.sha256)
            throw Error("Portable archive dependency changed")
        return {
          root: archiveRoot,
          run_id: row.run_id,
          vault: path.resolve(repository, row.vault || "vault"),
          manifest_sha256: receipt.manifest_sha256,
          package_sha256: receipt.sha256,
          package_bytes: receipt.bytes,
          package_path: receipt.path,
          bound_runs: archive.bound_runs,
        }
      })
      if (
        new Set(archives.map((a) => a.run_id)).size !== archives.length ||
        (preview.approved_runs || []).some((r) => !archives.some((a) => a.bound_runs.includes(r)))
      )
        throw Error(
          "Portable archives must cover every approved article run without duplicate packages",
        )
      const archiveEvents = archives.flatMap((a) =>
        a.bound_runs
          .map((id) => readJSON(a.root, `runs/${id}/approved-article.json`)?.event_id)
          .filter(Boolean),
      )
      if (preview.consistency.articles.some((a) => !archiveEvents.includes(a.event_id)))
        throw Error("Portable archives must cover every published event before export or writes")
      install(root, base + "/plan.json", planBytes)
      input = {
        schema: "research-remote-delivery-input/v1",
        run_id: run,
        commit: publication.commit,
        publication: ref(root, `runs/${run}/publication-operation/public.json`),
        plan: ref(root, base + "/plan.json"),
        archives,
        assets,
        event_ids: preview.consistency.articles.map((a) => a.event_id),
        website_stage: path.join(plan.website_stage, run),
        previous_website_receipt: plan.previous_website_receipt
          ? install(
              root,
              base + "/previous-website-receipt.json",
              fs.readFileSync(plan.previous_website_receipt),
            )
          : null,
      }
      atomicCreate(root, base + "/input.json", input)
    }
    if (
      input.commit !== publication.commit ||
      pinned(root, input.publication).commit !== publication.commit
    )
      throw Error("Remote delivery publication changed")
    const prior = inspectRemoteDelivery(root, run)
    if (prior?.status === "remote_delivery_complete")
      return {
        ...prior,
        website_mapping: await recordWebsiteMapping(root, run, repository, prior),
        reused: true,
        observation: "archived_raw_bytes",
      }
    function checkpoint(status, extra = {}) {
      const value = {
        schema: "research-remote-delivery-checkpoint/v1",
        run_id: run,
        input_sha256: sha256(JSON.stringify(input)),
        observed_at: new Date(now()).toISOString(),
        status,
        website_data_verified: false,
        source_archive_verified: false,
        new_regular_operation_counted: false,
        ...extra,
      }
      atomicWrite(root, base + "/latest.json", value)
      emit({ type: "remote_delivery_stage", ...value })
      return value
    }
    const plan = pinned(root, input.plan)
    let prepared = readJSON(root, base + "/prepared.json")
    if (!prepared) {
      checkpoint("preparing_website_data")
      const stage = input.website_stage
      const exportIntent = readJSON(root, base + "/website-export-intent.json")
      if (!exportIntent) {
        if (fs.existsSync(stage)) throw Error("WebsiteData stage already exists without ownership")
        atomicCreate(root, base + "/website-export-intent.json", { stage, commit: input.commit })
        await execute("python3", ["scripts/export-website-data.py"], repository, {
          env: { TECH_GARDEN_DRIVE_STAGE_DIR: stage },
        })
      }
      const folder = path.join(stage, "WebsiteData")
      if (!fs.existsSync(folder)) return checkpoint("website_export_recovery_required")
      if (fs.readdirSync(folder).sort().join() !== [...WEBSITE_FILES].sort().join())
        throw Error("Complete native WebsiteData export required")
      const snapshot = JSON.parse(fs.readFileSync(safePath(folder, "snapshot.json")))
      if (
        snapshot.schema !== "website-data-archive/v1" ||
        input.assets.some((a) => {
          const source = snapshot.assets?.find((s) => s.file === a.name)
          return (
            !source ||
            source.origin !== "live-website" ||
            source.matches_local_build_bytes !== true ||
            source.sha256 !== a.sha256 ||
            source.bytes !== a.bytes ||
            sha256(fs.readFileSync(safePath(folder, a.name))) !== a.sha256
          )
        })
      )
        throw Error("Native WebsiteData export differs from verified public bytes")
      const files = WEBSITE_FILES.map((name) => {
        const value = fs.readFileSync(safePath(folder, name)),
          staged = base + "/files/WebsiteData/" + name
        install(root, staged, value)
        return {
          path: "WebsiteData/" + name,
          staged_path: staged,
          sha256: sha256(value),
          bytes: value.length,
        }
      })
      for (const archive of input.archives) {
        const staged = base + "/files/Research/" + archive.run_id + ".zip"
        install(root, staged, bytes(archive.root, archive.package_path))
        files.push({
          path: "Research/" + archive.run_id + ".zip",
          staged_path: staged,
          sha256: archive.package_sha256,
          bytes: archive.package_bytes,
        })
      }
      manifest = { schema: "research-remote-delivery-files/v1", run_id: run, files }
      prepared = {
        input_sha256: sha256(JSON.stringify(input)),
        manifest: install(root, base + "/manifest.json", manifest),
      }
      atomicCreate(root, base + "/prepared.json", prepared)
    } else manifest = pinned(root, prepared.manifest)

    if (!acquisitionFile)
      return checkpoint("remote_acquisition_required", { files: manifest.files.map((r) => r.path) })
    const capture = (file) => {
      const source = JSON.parse(fs.readFileSync(file))
      if (source.folders?.some((f) => f.metadata?.shared !== false))
        throw Error("Private remote folders required")
      const normalized = materializeAuthoringReadback(
        root,
        { base, plan: { destination_folder_id: OWNER, files: manifest.files } },
        file,
        now(),
        { allowListedFolders: true },
      )
      if (
        normalized.observation.listings.length !== 2 ||
        Object.entries(REMOTE_DELIVERY_ROOTS).some(
          ([name, id]) =>
            !normalized.observation.listings.some((l) => l.path === name && l.id === id) ||
            !normalized.observation.folders.some(
              (f) => f.path === name && f.id === id && f.parent_id === OWNER,
            ),
        ) ||
        normalized.observation.folders.length !== 2
      )
        throw Error("Exact private Research and WebsiteData parents required")
      if (
        new Set(normalized.observation.listings.flatMap((l) => l.files.map((f) => f.id))).size !==
          normalized.observation.listings.reduce((n, l) => n + l.files.length, 0) ||
        normalized.observation.listings.some(
          (l) => new Set(l.files.map((f) => f.name)).size !== l.files.length,
        )
      )
        throw Error("Ambiguous remote artifact identity")
      if (
        normalized.observation.listings.some((l) =>
          l.files.some(
            (f) =>
              !/^[A-Za-z0-9_-]+$/.test(f.id || "") ||
              typeof f.name !== "string" ||
              !f.name ||
              f.name.includes("/") ||
              f.name.includes("\\") ||
              !Number.isFinite(Date.parse(f.modified_at)),
          ),
        )
      )
        throw Error("Exact remote artifact metadata required")
      if (
        normalized.readback.files.some(
          (f) =>
            f.mime_type.startsWith("application/vnd.google-apps.") ||
            (f.path.startsWith("Research/") && f.mime_type !== "application/zip"),
        )
      )
        throw Error("Original artifact file formats required")
      const stored = storeAuthoringReadback(root, normalized)
      return { ...normalized, stored }
    }
    let current = capture(acquisitionFile)
    const previousRows = input.previous_website_receipt
      ? pinned(root, input.previous_website_receipt).files
      : []
    for (const row of manifest.files) {
      const parent = current.observation.listings.find(
        (l) => l.path === path.posix.dirname(row.path),
      )
      const existing = parent.files.find((f) => f.name === path.posix.basename(row.path))
      const proof = current.readback.files.find((f) => f.path === row.path)
      if (existing && !proof)
        throw Error("Raw pre-write bytes required for existing remote artifact")
      if (proof?.sha256 === row.sha256) continue
      const previous = previousRows.find((f) => f.path === row.path)
      if (previousRows.filter((f) => f.path === row.path).length > 1)
        throw Error("Ambiguous prior WebsiteData receipt")
      if (
        existing &&
        (row.path.startsWith("Research/") ||
          previous?.id !== existing.id ||
          previous?.sha256 !== proof.sha256)
      )
        throw Error("Remote artifact conflicts with previous verified bytes: " + row.path)
      const intentPath = base + "/intents/" + sha256(row.path) + ".json",
        oldIntent = readJSON(root, intentPath)
      const operation = {
        path: row.path,
        action: existing ? "update" : "create",
        file_id: existing?.id || null,
        parent_id: parent.id,
        expected_sha256: proof?.sha256 || null,
        desired_sha256: row.sha256,
        staged_file: safePath(root, row.staged_path),
        mime_type:
          proof?.mime_type ||
          (row.path.endsWith(".zip")
            ? "application/zip"
            : row.path.endsWith(".json")
              ? "application/json"
              : row.path.endsWith(".csv")
                ? "text/csv"
                : row.path.endsWith(".md")
                  ? "text/markdown"
                  : "application/xml"),
      }
      if (oldIntent && resumeIntent !== oldIntent.intent_id)
        return checkpoint("remote_write_recovery_required", {
          intent_id: oldIntent.intent_id,
          path: row.path,
        })
      if (typeof nextCapture !== "function") return checkpoint("remote_connector_required")
      const intent = oldIntent || {
        intent_id: sha256(JSON.stringify({ run, operation })),
        operation,
        input_sha256: sha256(JSON.stringify(input)),
      }
      if (JSON.stringify(intent.operation) !== JSON.stringify(operation))
        throw Error("Remote write intent changed")
      if (!oldIntent) atomicCreate(root, intentPath, intent)
      checkpoint("remote_write_pending", { intent_id: intent.intent_id, path: row.path })
      emit({ type: "remote_write_intent", ...intent })
      let timer
      try {
        const file = await Promise.race([
          Promise.resolve().then(nextCapture),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(Error("Remote readback timed out")), waitMs)
          }),
        ])
        current = capture(file)
      } catch {
        return checkpoint("remote_write_recovery_required", {
          intent_id: intent.intent_id,
          path: row.path,
        })
      } finally {
        clearTimeout(timer)
      }
      const updated = current.readback.files.find((f) => f.path === row.path)
      if (updated?.sha256 !== row.sha256 || (existing && updated.file_id !== existing.id))
        return checkpoint("remote_write_recovery_required", {
          intent_id: intent.intent_id,
          path: row.path,
        })
    }
    if (
      current.readback.files.length !== manifest.files.length ||
      manifest.files.some(
        (r) => current.readback.files.find((f) => f.path === r.path)?.sha256 !== r.sha256,
      )
    )
      throw Error("All remote artifact raw bytes must match the pinned manifest")
    const archives = []
    for (const archive of input.archives) {
      const remote = current.readback.files.find(
        (f) => f.path === "Research/" + archive.run_id + ".zip",
      )
      const restoreDirectory = base + "/restored/" + archive.run_id
      if (!fs.existsSync(safePath(root, restoreDirectory))) {
        const script = fileURLToPath(new URL("./package-archive.py", import.meta.url))
        await execute(
          "python3",
          [
            script,
            "--root",
            root,
            "--package",
            remote.raw_path,
            "--expected-sha256",
            archive.package_sha256,
            "--restore-to",
            restoreDirectory,
          ],
          repository,
        )
      }
      const restore = ref(root, restoreDirectory + "/restore-receipt.json")
      const restored = pinned(root, restore)
      if (restored.package_sha256 !== archive.package_sha256 || restored.dependency_closed !== true)
        throw Error("Native remote ZIP restoration required")
      const metadata = {
        schema: "research-drive-archive-observation/v1",
        observed_at: current.readback.observed_at,
        file_id: remote.file_id,
        name: archive.run_id + ".zip",
        mime_type: "application/zip",
        size: remote.bytes,
        parent_ids: [REMOTE_DELIVERY_ROOTS.Research],
        shared: false,
      }
      const metadataPath =
        base +
        "/archive-metadata/" +
        archive.run_id +
        "/" +
        sha256(JSON.stringify(metadata)) +
        ".json"
      install(root, metadataPath, metadata)
      const locationPath = `archive-staging/${archive.run_id}/drive-location.json`,
        location = readJSON(archive.root, locationPath)
      if (!location)
        await registerArchiveLocation({
          root: archive.root,
          runId: archive.run_id,
          metadataFile: safePath(root, metadataPath),
          remotePackageFile: safePath(root, remote.raw_path),
          expectedParentId: REMOTE_DELIVERY_ROOTS.Research,
          vault: archive.vault,
          now: new Date(now()).toISOString(),
        })
      else if (
        location.package_sha256 !== archive.package_sha256 ||
        location.manifest_sha256 !== archive.manifest_sha256 ||
        location.drive?.file_id !== remote.file_id ||
        location.drive?.parent_id !== REMOTE_DELIVERY_ROOTS.Research ||
        location.drive?.shared !== false ||
        location.drive?.raw_sha256_verified !== true
      )
        throw Error("Existing native archive location differs from current remote bytes")
      archives.push({
        ...archive,
        restore_directory: restoreDirectory,
        restore,
        location: ref(archive.root, locationPath),
      })
    }
    const sourceEvents = archives.flatMap((a) => {
      const location = readJSON(a.root, a.location.path)
      if (location.sources_sha256 !== sha256(JSON.stringify(location.sources)))
        throw Error("Native source index changed")
      return location.sources.flatMap((s) => s.event_ids)
    })
    if (input.event_ids.some((e) => !sourceEvents.includes(e)))
      throw Error("Remote archives must cover every published source event")
    const receipt = {
      schema: "research-remote-delivery-receipt/v1",
      run_id: run,
      input_sha256: sha256(JSON.stringify(input)),
      manifest_sha256: prepared.manifest.sha256,
      readback: ref(root, path.relative(root, current.stored.readback_file)),
      archives,
      website_data_verified: true,
      source_archive_verified: true,
      new_regular_operation_counted: false,
    }
    const receiptRef = install(root, base + "/receipt.json", receipt)
    const complete = checkpoint("remote_delivery_complete", {
      receipt: receiptRef,
      website_data_verified: true,
      source_archive_verified: true,
      files: manifest.files.length,
    })
    inspectRemoteDelivery(root, run)
    return {
      ...complete,
      website_mapping: await recordWebsiteMapping(root, run, repository, complete),
    }
  })
}
