import fs from "node:fs"
import path from "node:path"
import { sha256 } from "./contracts.mjs"
import { safePath } from "./run-state.mjs"

// Inspect the exact bytes requested by a saved native storage checkpoint.
// A missing object is resumable; a conflicting object is not a valid restore.
export function inspectSavedStorageRequest(root, request) {
  if (
    request?.schema !== "research-storage-download-request/v1" ||
    typeof request.root !== "string" ||
    !Array.isArray(request.requests) ||
    !request.requests.length ||
    (request.request_count !== undefined &&
      (!Number.isSafeInteger(request.request_count) ||
        request.request_count < request.requests.length))
  )
    return { status: "invalid" }
  let actualRoot, requestedRoot
  try {
    actualRoot = fs.realpathSync(root)
    requestedRoot = fs.realpathSync(request.root)
  } catch (error) {
    if (error.code === "ENOENT") return { status: "pending" }
    throw error
  }
  if (actualRoot !== requestedRoot) {
    if (!actualRoot.startsWith(requestedRoot + path.sep)) return { status: "invalid" }
    const policyPath = safePath(requestedRoot, ".storage/policy.json", { materialize: false })
    if (!fs.existsSync(policyPath)) return { status: "invalid" }
    const policy = JSON.parse(fs.readFileSync(policyPath))
    if (
      policy.schema !== "research-cold-storage/v1" ||
      policy.root !== requestedRoot ||
      policy.enabled !== true
    )
      return { status: "invalid" }
  }
  let missing = request.request_count > request.requests.length
  for (const entry of request.requests) {
    if (
      typeof entry.path !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.sha256 || "") ||
      (entry.bytes !== undefined && (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0))
    )
      return { status: "invalid" }
    let file
    try {
      file = safePath(requestedRoot, entry.path, { materialize: false })
    } catch {
      return { status: "invalid" }
    }
    if (!file.startsWith(actualRoot + path.sep)) return { status: "invalid" }
    const stat = fs.statSync(file, { throwIfNoEntry: false })
    if (!stat) {
      missing = true
      continue
    }
    if (
      !stat.isFile() ||
      (entry.bytes !== undefined && stat.size !== entry.bytes) ||
      sha256(fs.readFileSync(file)) !== entry.sha256
    )
      return { status: "invalid" }
  }
  return { status: missing ? "pending" : "ready" }
}

export const savedStorageRequestReady = (root, request) =>
  inspectSavedStorageRequest(root, request).status === "ready"
