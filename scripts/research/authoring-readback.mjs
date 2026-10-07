import fs from "node:fs"
import path from "node:path"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, safePath } from "./run-state.mjs"

// Normalize scoped connector reads; signed download URLs and readable duplicates are not retained.
export function materializeAuthoringReadback(
  root,
  binding,
  acquisitionFile,
  now,
  { allowListedFolders = false } = {},
) {
  const acquisitionBytes = fs.readFileSync(acquisitionFile),
    capture = JSON.parse(acquisitionBytes)
  if (
    capture?.schema !== "research-authoring-drive-acquisition/v1" ||
    !Number.isFinite(Date.parse(capture.observed_at)) ||
    Date.parse(capture.observed_at) > now ||
    now - Date.parse(capture.observed_at) > 600000 ||
    !Array.isArray(capture.folders) ||
    !Array.isArray(capture.listings) ||
    !Array.isArray(capture.files)
  )
    throw Error("Fresh complete connector acquisition required")
  const observation = {
    schema: "research-authoring-remote-observation/v1",
    root_folder_id: binding.plan.destination_folder_id,
    observed_at: capture.observed_at,
    folders: capture.folders.map(({ path, metadata }) => {
      if (
        metadata?.mime_type !== "application/vnd.google-apps.folder" ||
        !Array.isArray(metadata.parent_ids) ||
        metadata.parent_ids.length !== 1
      )
        throw Error("Actual folder metadata required")
      return { path, id: metadata.id, parent_id: metadata.parent_ids[0] }
    }),
    listings: [],
  }
  const readback = {
    schema: "research-authoring-readback/v1",
    observed_at: capture.observed_at,
    files: [],
  }
  const directory = `${binding.base}/acquisitions/${sha256(acquisitionBytes)}`,
    rawFiles = new Map()
  for (const listing of capture.listings) {
    const normalize = (files) => {
      if (
        !Array.isArray(files) ||
        files.length >= listing.limit ||
        !Number.isSafeInteger(listing.limit) ||
        listing.limit < 1
      )
        throw Error("Connector listing may be truncated")
      const names = new Set(),
        ids = new Set()
      for (const file of files) {
        if (!file?.title || !file.id || names.has(file.title) || ids.has(file.id))
          throw Error("Ambiguous connector listing identity")
        names.add(file.title)
        ids.add(file.id)
      }
      return files
        .map((f) => {
          if (
            f.parent_ids != null &&
            (!Array.isArray(f.parent_ids) ||
              f.parent_ids.length !== 1 ||
              f.parent_ids[0] !== listing.id)
          )
            throw Error("Unexpected file or parent in scoped listing")
          if (!allowListedFolders && f.mime_type === "application/vnd.google-apps.folder") {
            const folder = capture.folders.find(
              (r) =>
                r.path === listing.path + "/" + f.title &&
                r.metadata.id === f.id &&
                r.metadata.title === f.title &&
                r.metadata.modified_time === f.modified_time &&
                r.metadata.shared === false &&
                JSON.stringify(r.metadata.parent_ids) === JSON.stringify([listing.id]),
            )
            if (!folder || binding.plan.files.some((r) => r.path === folder.path))
              throw Error("Unexpected file or parent in scoped listing")
            // Retain the verified folder in the folder chain. It is not a
            // Markdown file and must not duplicate its ID in the file listing.
            return null
          }
          return { name: f.title, id: f.id, parent_id: listing.id, modified_at: f.modified_time }
        })
        .filter(Boolean)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    }
    const before = normalize(listing.before),
      after = normalize(listing.after)
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw Error("Drive listing changed during raw acquisition")
    observation.listings.push({ path: listing.path, id: listing.id, complete: true, files: after })
  }
  for (const [i, file] of capture.files.entries()) {
    const metadata = file.metadata,
      raw = file.raw
    if (
      !metadata ||
      !raw ||
      !binding.plan.files.some((r) => r.path === file.path) ||
      rawFiles.has(file.path) ||
      metadata.shared !== false ||
      !Array.isArray(metadata.parent_ids) ||
      metadata.parent_ids.length !== 1 ||
      raw.id !== metadata.id ||
      raw.mime_type !== metadata.mime_type ||
      raw.modified_time !== metadata.modified_time ||
      JSON.stringify(raw.parent_ids) !== JSON.stringify(metadata.parent_ids) ||
      typeof raw.b64_string !== "string" ||
      raw.b64_string.length > 14_000_000
    )
      throw Error("Actual scoped raw file and metadata required")
    const bytes = Buffer.from(raw.b64_string, "base64")
    if (
      bytes.toString("base64") !== raw.b64_string ||
      bytes.length !== raw.file_size_bytes ||
      !/^\d+$/.test(String(metadata.size)) ||
      Number(metadata.size) !== bytes.length
    )
      throw Error("Complete raw base64 bytes required")
    const parent = observation.listings.find((l) => l.path === path.posix.dirname(file.path))
    const listed = parent?.files.find((f) => f.name === path.posix.basename(file.path))
    if (
      !listed ||
      listed.id !== metadata.id ||
      listed.parent_id !== metadata.parent_ids[0] ||
      listed.modified_at !== metadata.modified_time ||
      metadata.title !== listed.name
    )
      throw Error("Raw metadata differs from the stable parent listing")
    listed.sha256 = sha256(bytes)
    const proof = {
      path: file.path,
      file_id: metadata.id,
      parent_id: metadata.parent_ids[0],
      modified_at: metadata.modified_time,
      mime_type: metadata.mime_type,
      shared: false,
      raw_path: `${directory}/raw/${i}.bin`,
      bytes: bytes.length,
      sha256: sha256(bytes),
    }
    readback.files.push(proof)
    rawFiles.set(file.path, bytes)
  }
  return { observation, readback, rawFiles, directory }
}

export function storeAuthoringReadback(root, { observation, readback, rawFiles, directory }) {
  const install = (relative, bytes) => {
    const file = safePath(root, relative)
    if (!fs.existsSync(file)) atomicCreate(root, relative, bytes)
    else if (!fs.readFileSync(file).equals(bytes))
      throw Error("Connector acquisition evidence changed")
  }
  readback.files.forEach((r) => install(r.raw_path, rawFiles.get(r.path)))
  install(directory + "/observation.json", Buffer.from(JSON.stringify(observation, null, 2) + "\n"))
  install(directory + "/readback.json", Buffer.from(JSON.stringify(readback, null, 2) + "\n"))
  return {
    observation_file: safePath(root, directory + "/observation.json"),
    readback_file: safePath(root, directory + "/readback.json"),
    files: readback.files.length,
    write_performed: false,
  }
}
