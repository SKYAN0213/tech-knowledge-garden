import fs from "node:fs"
import path from "node:path"
import { storageAction } from "./cold-storage.mjs"
import { safePath, atomicWrite, withLock } from "./run-state.mjs"
import { readOperationGate } from "./operation-policy.mjs"
import { DriveError, driveAuthStatus, driveLockRoot } from "./drive-auth.mjs"
import { LocalDriveClient, driveFileId } from "./drive-client.mjs"

export function readDrivePolicy(repo) {
  const policy = JSON.parse(
    fs.readFileSync(safePath(repo, "data/research-drive-policy.json"), "utf8"),
  )
  if (
    policy.schema !== "research-local-drive-policy/v1" ||
    policy.automatic_retry !== false ||
    !Number.isSafeInteger(policy.maximum_bundle_bytes) ||
    policy.maximum_bundle_bytes < 1024 ||
    policy.maximum_bundle_bytes > 1024 ** 3
  )
    throw Error("Invalid local Drive policy")
  driveFileId(policy.root_folder_id)
  driveFileId(policy.archive_parent_id)
  return policy
}
export const remoteStorageActions = ["remote-status", "remote-pull", "remote-push", "remote-import"]

// The caller explicitly chooses a development transfer or a gated regular run.
// Storage waits remain waits until the exact catalog bytes have been hydrated.
export async function driveStorageAction(repo, root, action, parameters = {}, options = {}) {
  if (!remoteStorageActions.includes(action)) throw Error("Unknown remote storage action")
  const allowed = new Set(["regular", "bundle_id", "limit", "file_id", "expected_sha256"])
  for (const key of Object.keys(parameters))
    if (!allowed.has(key)) throw Error("Unknown remote storage parameter: " + key)
  if (parameters.regular) {
    const gate = readOperationGate(repo, { executor: "ollama" })
    if (!gate.regular_execution_allowed)
      return {
        status: gate.status,
        operation_gate: gate,
        remote_requests: 0,
        remote_writes: 0,
      }
  }
  const policy = readDrivePolicy(repo)
  const auth = driveAuthStatus(root)
  if (action === "remote-status")
    return {
      schema: "research-drive-storage-status/v1",
      auth,
      root_folder_id: policy.root_folder_id,
      archive_parent_id: policy.archive_parent_id,
      regular_execution_allowed: readOperationGate(repo, { executor: "ollama" })
        .regular_execution_allowed,
      gpt_regular_execution_allowed: readOperationGate(repo).regular_execution_allowed,
      remote_requests: 0,
      remote_writes: 0,
    }
  if (auth.status !== "connected")
    throw new DriveError(
      auth.status === "setup_required" ? "DRIVE_SETUP_REQUIRED" : "DRIVE_REAUTH_REQUIRED",
      auth.status === "setup_required"
        ? "Configure a Google Desktop OAuth client before transferring Drive bytes"
        : "Google Drive login is required before resuming storage",
    )
  const limit = parameters.limit ?? 1
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20)
    throw Error("Drive transfer limit must be 1–20 bundles")
  if (parameters.bundle_id && !/^[A-Za-z0-9_-]{1,160}$/.test(parameters.bundle_id))
    throw Error("Invalid storage bundle ID")
  if (action !== "remote-import" && (parameters.file_id || parameters.expected_sha256))
    throw Error("Remote file ID and SHA are only accepted by remote-import")
  return withLock(driveLockRoot(root), "storage", async () => {
    const client = new LocalDriveClient(root, policy, options)
    const dispose = (result) => {
      // Only transport-owned raw readbacks; never evict the user's source files.
      if (!/^\.storage\/incoming\/local-[a-f0-9]{64}\.bin$/.test(result.path))
        throw Error("Unexpected Drive readback path")
      fs.unlinkSync(safePath(root, result.path, { materialize: false }))
    }
    const receipt = (value) =>
      atomicWrite(root, `.storage/transfers/local-${value.bundle_id}.json`, {
        schema: "research-drive-storage-transfer/v1",
        ...value,
      })
    if (action === "remote-import") {
      if (parameters.bundle_id || parameters.limit)
        throw Error("Catalog restore does not accept a bundle or limit")
      driveFileId(parameters.file_id)
      if (!/^[a-f0-9]{64}$/.test(parameters.expected_sha256 || ""))
        throw Error("A previously verified catalog SHA is required")
      const m = await client.inProject(parameters.file_id)
      if (m.mimeType !== "application/gzip" || !m.parents.includes(policy.archive_parent_id))
        throw Error("Catalog must be a private gzip file in the archive folder")
      const raw = await client.download(m.id, {
        sha256: parameters.expected_sha256,
        bytes: Number(m.size),
        parent_id: policy.archive_parent_id,
      })
      const result = storageAction(root, "import", {
        catalog_path: raw.path,
        expected_sha256: raw.sha256,
      })
      atomicWrite(root, ".storage/remote-catalog.json", {
        catalog: { sha256: raw.sha256, bytes: raw.bytes },
        metadata: raw.metadata,
        observed_at: raw.observed_at,
        raw_sha256_verified: true,
      })
      dispose(raw)
      return { status: "catalog_restored", ...result, file_id: m.id, sha256: raw.sha256 }
    }
    const pending = storageAction(root, "pending")
    const results = []
    if (action === "remote-pull") {
      const groups = new Map()
      for (const item of pending.downloads) {
        if (parameters.bundle_id && item.bundle_id !== parameters.bundle_id) continue
        if (!groups.has(item.bundle_id)) groups.set(item.bundle_id, [])
        groups.get(item.bundle_id).push(item)
      }
      if (parameters.bundle_id && !groups.has(parameters.bundle_id))
        storageAction(root, "status", { bundle_id: parameters.bundle_id })
      for (const [bundle, requests] of [...groups].slice(0, limit)) {
        const item = requests[0]
        const raw = await client.download(item.file_id, {
          sha256: item.package_sha256,
          bytes: item.package_bytes,
          parent_id: item.parent_id,
        })
        storageAction(root, "verify", {
          bundle_id: bundle,
          metadata: raw.metadata,
          observed_at: raw.observed_at,
          download_path: raw.path,
        })
        const restored = storageAction(root, "hydrate", {
          bundle_id: bundle,
          download_path: raw.path,
          paths: requests.map((r) => r.path),
        })
        const result = {
          bundle_id: bundle,
          file_id: item.file_id,
          sha256: raw.sha256,
          observed_at: raw.observed_at,
          ...restored,
        }
        receipt(result)
        dispose(raw)
        results.push(result)
      }
      return {
        status: results.length ? "hydrated" : "idle",
        results,
        remaining_downloads: storageAction(root, "pending").downloads.length,
        domain_job_resumed: false,
      }
    }
    if (auth.mode !== "readwrite")
      throw new DriveError(
        "DRIVE_WRITE_SCOPE_REQUIRED",
        "Use readwrite OAuth access for Drive archive storage",
      )
    const uploads = pending.uploads.filter(
      (b) => !parameters.bundle_id || b.id === parameters.bundle_id,
    )
    if (parameters.bundle_id && !uploads.length) {
      const { bundle } = storageAction(root, "status", { bundle_id: parameters.bundle_id })
      if (!bundle.verified_at || !bundle.file_id) throw Error("Bundle verification is incomplete")
      results.push({
        bundle_id: bundle.id,
        file_id: bundle.file_id,
        sha256: bundle.sha256,
        verified: true,
        reused: true,
      })
    }
    for (const bundle of uploads.slice(0, limit)) {
      if (!bundle.parent_id)
        throw Error("Bundle has no archive parent; prepare with an explicit parent_id")
      const raw = bundle.file_id
        ? await client.download(bundle.file_id, {
            sha256: bundle.sha256,
            bytes: bundle.bytes,
            parent_id: bundle.parent_id,
          })
        : await client.upload(bundle.local_path, {
            sha256: bundle.sha256,
            bytes: bundle.bytes,
            name: bundle.name,
            parent_id: bundle.parent_id,
            mime_type: "application/zip",
          })
      const verified = storageAction(root, "verify", {
        bundle_id: bundle.id,
        metadata: raw.metadata,
        observed_at: raw.observed_at,
        download_path: raw.path,
      })
      const result = { ...verified, sha256: raw.sha256, observed_at: raw.observed_at }
      receipt(result)
      dispose(raw)
      results.push(result)
    }
    // Even after a previous process stopped between verify and export, the same
    // command can finish the recovery catalog without creating another bundle.
    const catalog = storageAction(root, "export")
    const raw = await client.upload(catalog.path, {
      sha256: catalog.sha256,
      bytes: catalog.bytes,
      name: path.basename(catalog.path),
      parent_id: policy.archive_parent_id,
      mime_type: "application/gzip",
    })
    atomicWrite(root, ".storage/remote-catalog.json", {
      catalog,
      metadata: raw.metadata,
      observed_at: raw.observed_at,
      raw_sha256_verified: true,
    })
    dispose(raw)
    return {
      status: "archived",
      results,
      catalog: { file_id: raw.metadata.id, sha256: raw.sha256, bytes: raw.bytes },
      remaining_uploads: storageAction(root, "pending").uploads.length,
      cache_evicted: false,
    }
  })
}
