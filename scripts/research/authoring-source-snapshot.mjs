import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { PUBLIC_ROOTS, sha256 } from "./contracts.mjs"
import { atomicCreate, safePath } from "./run-state.mjs"
import { DRIVE_AUTHORING_ROOTS, authoringInventory } from "./authoring-transfer.mjs"
import { materializeAuthoringReadback, storeAuthoringReadback } from "./authoring-readback.mjs"

const ROOT_ID = "1VKWSC2IYOtOd__3NKEzD-BK34qVqtlAD"
const folderMime = "application/vnd.google-apps.folder"
const jsonBytes = (value) => Buffer.from(JSON.stringify(value, null, 2) + "\n")

// Read the complete remote authority independently of the editing copy. These
// are observations; no transfer plan, release, import or publication is created.
export function captureAuthoringSourceSnapshot({
  root,
  runId,
  acquisitionFile,
  repository = process.cwd(),
  vault = "vault",
  now = Date.now(),
}) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(runId || "")) throw Error("Exact source capture run required")
  const input = fs.readFileSync(acquisitionFile)
  if (input.length > 48 * 1048576) throw Error("Bounded complete source acquisition required")
  const capture = JSON.parse(input)
  if (
    capture.root_metadata?.id !== ROOT_ID ||
    capture.root_metadata.mime_type !== folderMime ||
    capture.root_metadata.shared !== false ||
    JSON.stringify(capture.root_metadata.parent_ids) !==
      JSON.stringify(["1psoNS5hryuS9YGJg7JTK4AhG6X6B2LZE"]) ||
    !Array.isArray(capture.folders) ||
    !Array.isArray(capture.listings) ||
    !Array.isArray(capture.files) ||
    new Set(capture.folders.map((f) => f.path)).size !== capture.folders.length ||
    new Set(capture.listings.map((l) => l.path)).size !== capture.listings.length
  )
    throw Error("Complete fixed Drive authority scope required")
  const folders = new Map(capture.folders.map((f) => [f.path, f.metadata]))
  for (const [name, id] of Object.entries(DRIVE_AUTHORING_ROOTS)) {
    const metadata = folders.get(name)
    if (
      metadata?.id !== id ||
      metadata.title !== name ||
      JSON.stringify(metadata.parent_ids) !== JSON.stringify([ROOT_ID])
    )
      throw Error("Actual authoring root metadata required")
  }
  const expected = new Set()
  const identity = (rows) =>
    rows
      .map(({ id, title, mime_type, size, modified_time, shared }) => ({
        id,
        title,
        mime_type,
        size,
        modified_time,
        shared,
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  for (const [relative, metadata] of folders) {
    const parent = PUBLIC_ROOTS.includes(relative)
      ? ROOT_ID
      : folders.get(path.posix.dirname(relative))?.id
    const listing = capture.listings.find((l) => l.path === relative)
    if (
      !PUBLIC_ROOTS.includes(relative.split("/")[0]) ||
      metadata.mime_type !== folderMime ||
      metadata.shared !== false ||
      metadata.title !== path.posix.basename(relative) ||
      !parent ||
      JSON.stringify(metadata.parent_ids) !== JSON.stringify([parent]) ||
      listing?.id !== metadata.id ||
      !Array.isArray(listing.before) ||
      !Array.isArray(listing.after) ||
      JSON.stringify(identity(listing.before)) !== JSON.stringify(identity(listing.after))
    )
      throw Error("Complete stable authoring folder chain required")
    for (const file of listing.after) {
      const relativeFile = relative + "/" + file.title
      if (file.mime_type === folderMime) {
        if (folders.get(relativeFile)?.id !== file.id) throw Error("Unvisited authoring folder")
      } else {
        if (
          !relativeFile.endsWith(".md") ||
          file.mime_type !== "text/markdown" ||
          file.shared !== false ||
          expected.has(relativeFile)
        )
          throw Error("Unexpected complete authoring file inventory")
        expected.add(relativeFile)
      }
    }
  }
  if (
    capture.listings.length !== folders.size ||
    expected.size !== capture.files.length ||
    capture.files.some((f) => !expected.has(f.path))
  )
    throw Error("Complete raw authoring inventory required")
  for (const file of capture.files) {
    const listing = capture.listings.find((l) => l.path === path.posix.dirname(file.path))
    const listed = listing.after.find((r) => r.title === path.posix.basename(file.path))
    if (
      ["id", "title", "mime_type", "size", "modified_time", "shared"].some(
        (key) => listed[key] !== file.metadata[key],
      )
    )
      throw Error("Raw file metadata differs from complete source inventory")
  }
  const base = `drive-source/${runId}`
  const normalized = materializeAuthoringReadback(
    root,
    {
      base,
      plan: { destination_folder_id: ROOT_ID, files: capture.files.map((f) => ({ path: f.path })) },
    },
    acquisitionFile,
    now,
    { allowListedFolders: true },
  )
  const receipt = {
    schema: "tech-drive-connector-readback/v1",
    root_folder_id: ROOT_ID,
    roots: Object.entries(DRIVE_AUTHORING_ROOTS).map(([name, id]) => ({ name, id })),
    verified_at: capture.observed_at,
    source_acquisition_sha256: sha256(input),
    folders: capture.folders
      .filter((f) => !PUBLIC_ROOTS.includes(f.path))
      .map((f) => ({
        path: f.path,
        id: f.metadata.id,
        parent_ids: f.metadata.parent_ids,
      })),
    files: normalized.readback.files.map((f) => ({
      path: f.path,
      file_id: f.file_id,
      parent_ids: [f.parent_id],
      modified_time: f.modified_at,
      size: f.bytes,
      sha256: f.sha256,
      raw_path: f.raw_path,
    })),
  }
  const source = [...normalized.rawFiles].map(([relative, bytes]) => {
    const content = bytes.toString("utf8")
    if (!Buffer.from(content).equals(bytes))
      throw Error("Authoring source must retain exact UTF-8 bytes")
    return { path: relative, content }
  })
  const receiptBytes = jsonBytes(receipt)
  // Reuse the same validator as pull-drive instead of bypassing its scope,
  // portability, parent-chain, byte/hash and source-count requirements.
  const program = `import importlib.util,json,sys\nfrom pathlib import Path\nfrom datetime import datetime,timezone\ns=importlib.util.spec_from_file_location('builder',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nv=json.load(sys.stdin);raw=v['receipt_bytes'].encode();sources={r['path']:r['content'].encode() for r in v['files']}\nprint(json.dumps(m.build_snapshot(v['receipt'],Path(sys.argv[2]),raw,now=datetime.fromtimestamp(v['now']/1000,timezone.utc),source_contents=sources),ensure_ascii=False))`
  const built = spawnSync(
    "python3",
    ["-c", program, path.join(repository, "scripts/build-connector-snapshot.py"), repository],
    {
      input: JSON.stringify({
        receipt,
        receipt_bytes: receiptBytes.toString("utf8"),
        files: source,
        now,
      }),
      encoding: "utf8",
      maxBuffer: 40 * 1048576,
    },
  )
  if (built.error || built.status !== 0)
    throw Error(
      "Native source snapshot validation failed: " + (built.error?.message || built.stderr.trim()),
    )
  const snapshot = JSON.parse(built.stdout),
    local = authoringInventory(path.resolve(repository, vault))
  const incoming = new Map(snapshot.files.map((f) => [f.path, f]))
  const diff = {
    local_files: local.size,
    remote_files: incoming.size,
    remote_only: [...incoming.keys()].filter((f) => !local.has(f)),
    local_only: [...local.keys()].filter((f) => !incoming.has(f)),
    changed: [...incoming]
      .filter(([f, r]) => local.has(f) && local.get(f).sha256 !== r.sha256)
      .map(([f, r]) => ({
        path: f,
        local_sha256: local.get(f).sha256,
        remote_sha256: r.sha256,
      })),
  }
  const workingCopyMatches =
    !diff.remote_only.length && !diff.local_only.length && !diff.changed.length
  const install = (relative, bytes) => {
    const target = safePath(root, relative)
    if (!fs.existsSync(target)) atomicCreate(root, relative, bytes)
    else if (!fs.readFileSync(target).equals(bytes))
      throw Error("Pinned source capture changed; use a new run")
    return { path: relative, sha256: sha256(bytes) }
  }
  // Validate all source bytes before preserving normalized raw files or results.
  const raw = storeAuthoringReadback(root, normalized)
  const result = {
    schema: "research-authoring-source-capture/v1",
    run_id: runId,
    observed_at: capture.observed_at,
    acquisition_sha256: sha256(input),
    generation_implementation_sha256: sha256(fs.readFileSync(new URL(import.meta.url))),
    source_snapshot: install(base + "/source-snapshot.json", jsonBytes(snapshot)),
    source_readback: install(base + "/source-readback.json", receiptBytes),
    remote_observation: install(base + "/observation.json", jsonBytes(normalized.observation)),
    raw_readback: {
      path: path.relative(root, raw.readback_file).split(path.sep).join("/"),
      sha256: sha256(fs.readFileSync(raw.readback_file)),
    },
    difference: install(base + "/working-copy-diff.json", jsonBytes(diff)),
    source_files: incoming.size,
    source_bytes: receipt.files.reduce((n, f) => n + f.size, 0),
    remote_raw_verified: true,
    working_copy_matches: workingCopyMatches,
    release_baseline_ready: workingCopyMatches,
    approval_granted: false,
    canonical_applied: false,
    remote_write_performed: false,
    publication_performed: false,
  }
  return { ...result, capture: install(base + "/capture.json", jsonBytes(result)) }
}

// Stored evidence remains readable after freshness expires. Freshness controls
// eligibility for a future operation, never rewrites the original observation.
export function loadAuthoringSourceCapture(
  root,
  runId,
  { now = Date.now(), repository = process.cwd(), vault = "vault" } = {},
) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(runId || "")) throw Error("Exact source capture run required")
  const base = `drive-source/${runId}`,
    capturePath = base + "/capture.json"
  const captureBytes = fs.readFileSync(safePath(root, capturePath)),
    capture = JSON.parse(captureBytes)
  if (
    capture.schema !== "research-authoring-source-capture/v1" ||
    capture.run_id !== runId ||
    !/^[a-f0-9]{64}$/.test(capture.acquisition_sha256 || "") ||
    capture.approval_granted !== false ||
    capture.canonical_applied !== false ||
    capture.remote_write_performed !== false ||
    capture.publication_performed !== false ||
    capture.remote_raw_verified !== true ||
    !/^[a-f0-9]{64}$/.test(capture.generation_implementation_sha256 || "")
  )
    throw Error("Pinned source capture observation required")
  const read = (ref, expected) => {
    if (ref?.path !== expected) throw Error("Source capture reference scope changed")
    const bytes = fs.readFileSync(safePath(root, expected))
    if (sha256(bytes) !== ref.sha256) throw Error("Source capture bytes changed")
    return { bytes, value: JSON.parse(bytes) }
  }
  const snapshot = read(capture.source_snapshot, base + "/source-snapshot.json").value
  const receipt = read(capture.source_readback, base + "/source-readback.json")
  const observation = read(capture.remote_observation, base + "/observation.json").value
  read(capture.difference, base + "/working-copy-diff.json")
  const raw = read(
    capture.raw_readback,
    `${base}/acquisitions/${capture.acquisition_sha256}/readback.json`,
  ).value
  if (
    receipt.value.source_acquisition_sha256 !== capture.acquisition_sha256 ||
    capture.observed_at !== snapshot.exported_at ||
    raw.schema !== "research-authoring-readback/v1" ||
    raw.observed_at !== snapshot.exported_at ||
    observation.schema !== "research-authoring-remote-observation/v1" ||
    observation.root_folder_id !== ROOT_ID ||
    observation.observed_at !== snapshot.exported_at ||
    capture.source_files !== receipt.value.files?.length ||
    capture.source_bytes !== receipt.value.files.reduce((n, f) => n + f.size, 0) ||
    raw.files?.length !== receipt.value.files?.length ||
    new Set(raw.files.map((f) => f.path)).size !== raw.files.length
  )
    throw Error("Source capture manifest and raw inventory disagree")
  for (const file of receipt.value.files) {
    const native = raw.files.find((f) => f.path === file.path)
    const listing = observation.listings?.find((l) => l.path === path.posix.dirname(file.path))
    const listed = listing?.files?.find((f) => f.name === path.posix.basename(file.path))
    if (
      !native ||
      listing?.complete !== true ||
      listed?.id !== file.file_id ||
      listed.parent_id !== native.parent_id ||
      listed.modified_at !== native.modified_at ||
      listed.sha256 !== file.sha256 ||
      native.file_id !== file.file_id ||
      native.parent_id !== file.parent_ids?.[0] ||
      native.modified_at !== file.modified_time ||
      native.sha256 !== file.sha256 ||
      native.bytes !== file.size ||
      native.raw_path !== file.raw_path ||
      !file.raw_path.startsWith(`${base}/acquisitions/${capture.acquisition_sha256}/raw/`)
    )
      throw Error("Source capture raw identity changed")
    const bytes = fs.readFileSync(safePath(root, file.raw_path))
    if (bytes.length !== file.size || sha256(bytes) !== file.sha256)
      throw Error("Source capture raw bytes changed")
  }
  const program = `import importlib.util,json,sys\nfrom pathlib import Path\ns=importlib.util.spec_from_file_location('builder',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nv=json.load(sys.stdin);raw=v['receipt_bytes'].encode();sources={r['path']:r['content'].encode() for r in v['snapshot']['files']}\nbuilt=m.build_snapshot(v['receipt'],Path(sys.argv[2]),raw,max_age_seconds=None,source_contents=sources)\nassert built==v['snapshot'],'Stored native source snapshot changed'`
  const native = spawnSync(
    "python3",
    ["-c", program, path.join(repository, "scripts/build-connector-snapshot.py"), repository],
    {
      input: JSON.stringify({
        receipt: receipt.value,
        receipt_bytes: receipt.bytes.toString("utf8"),
        snapshot,
      }),
      encoding: "utf8",
      maxBuffer: 1048576,
    },
  )
  if (native.error || native.status !== 0)
    throw Error(
      "Stored source snapshot validation failed: " +
        (native.error?.message || native.stderr.trim()),
    )
  const incoming = new Map(snapshot.files.map((f) => [f.path, f.sha256])),
    local = authoringInventory(path.resolve(repository, vault))
  const drift = {
    local_files: local.size,
    remote_files: incoming.size,
    local_only: [...local.keys()].filter((f) => !incoming.has(f)).length,
    remote_only: [...incoming.keys()].filter((f) => !local.has(f)).length,
    changed: [...incoming].filter(([f, digest]) => local.has(f) && local.get(f).sha256 !== digest)
      .length,
  }
  const age = now - Date.parse(snapshot.exported_at),
    fresh = Number.isFinite(age) && age >= 0 && age <= 600000
  if (!Number.isFinite(age) || age < 0) throw Error("Stored source observation time is invalid")
  return {
    schema: "research-authoring-source-capture-status/v1",
    run_id: runId,
    capture: { path: capturePath, sha256: sha256(captureBytes) },
    source_snapshot: capture.source_snapshot,
    source_readback: capture.source_readback,
    observed_at: snapshot.exported_at,
    observed_age_ms: age,
    freshness: fresh ? "fresh" : "stale",
    fresh,
    source_files: incoming.size,
    source_bytes: receipt.value.files.reduce((n, f) => n + f.size, 0),
    remote_raw_verified: true,
    drift,
    working_copy_matches: !drift.local_only && !drift.remote_only && !drift.changed,
    release_baseline_ready: fresh && !drift.local_only && !drift.remote_only && !drift.changed,
    generation_implementation_sha256: capture.generation_implementation_sha256 || null,
    read_only: true,
    approvals_created: false,
    acquisition_reexecuted: false,
  }
}
