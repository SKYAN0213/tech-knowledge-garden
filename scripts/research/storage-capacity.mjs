import fs from "node:fs"
import path from "node:path"

// Capacity is an operational storage wait, not a parser or development bug.
// Keep the set explicit so arbitrary subprocess output cannot reclassify work.
const capacityCodes = new Set([
  "STORAGE_CAPACITY_UNKNOWN",
  "STORAGE_CAPACITY_LOCKED",
  "STORAGE_CAPACITY_INSUFFICIENT",
  "STORAGE_CAPACITY_UNAVAILABLE",
  "STORAGE_CACHE_LIMIT",
  "ENOSPC",
])
export const STORAGE_FREE_RESERVE_BYTES = 10 * 1024 ** 3

export function isStorageCapacityCode(code) {
  return typeof code === "string" && capacityCodes.has(code)
}

export function isStorageCapacityNeed(need) {
  const keys = ["schema", "root", "bundle_id", "paths", "required_free_bytes",
    "additional_cache_bytes", "required_cache_bytes", "cache_limit_bytes"]
  if (!need || typeof need !== "object" || Array.isArray(need) ||
      JSON.stringify(Object.keys(need).sort()) !== JSON.stringify([...keys].sort()) ||
      need.schema !== "research-storage-capacity-need/v1" ||
      typeof need.root !== "string" || !path.isAbsolute(need.root) || path.resolve(need.root) !== need.root ||
      typeof need.bundle_id !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(need.bundle_id) ||
      !Array.isArray(need.paths) || !need.paths.length || need.paths.length > 1000 ||
      new Set(need.paths).size !== need.paths.length) return false
  if (need.paths.some((value) => typeof value !== "string" || !value || value === "." || value.includes("\\") ||
      path.posix.isAbsolute(value) || path.posix.normalize(value) !== value ||
      value.split("/").some((component) => component === ".."))) return false
  if (["required_free_bytes", "additional_cache_bytes", "required_cache_bytes", "cache_limit_bytes"]
      .some((key) => !Number.isSafeInteger(need[key]) || need[key] < 0)) return false
  return need.required_free_bytes >= STORAGE_FREE_RESERVE_BYTES &&
    need.additional_cache_bytes <= need.required_cache_bytes
}

// Only the bound native hydrate operation is known to be a local write. A
// remote-pull may do local writes, but its remote side is read-only. Generic
// ENOSPC can have happened anywhere in a larger operation and stays uncertain.
export function isReadOnlyHydrationCapacity(input, error) {
  if (!input || input.module !== "collection" || input.operation !== "storage" ||
      !["hydrate", "remote-pull"].includes(input.parameters?.action) ||
      !isStorageCapacityCode(error?.code) || error.code === "ENOSPC" ||
      error.storage_failure?.action !== "hydrate" || error.storage_failure?.code !== error.code ||
      !isStorageCapacityNeed(error.storage_capacity_need)) return false
  try {
    const root = fs.realpathSync(path.join(input.context.repo, ".local"))
    return error.storage_capacity_need.root === root &&
      fs.realpathSync(error.storage_failure.root) === root &&
      (!input.parameters.bundle_id || input.parameters.bundle_id === error.storage_capacity_need.bundle_id)
  } catch {
    return false
  }
}
