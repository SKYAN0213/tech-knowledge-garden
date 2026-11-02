import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"

const configPath = "data/research-retired-workspaces.json"
const sealPath = ".local/.storage/runtime-release.json"

function blocked(message) {
  const error = Error("Retired workspace fence: " + message)
  error.code = "RETIRED_ROOT_FENCE_MISSING"
  return error
}

function readBytes(file, description) {
  try {
    return fs.readFileSync(file)
  } catch (error) {
    if (error.code === "ENOENT") throw blocked(description + " is missing")
    throw blocked(description + " cannot be read")
  }
}

function json(bytes, description) {
  try {
    return JSON.parse(bytes)
  } catch {
    throw blocked(description + " is invalid")
  }
}

function existing(file, description) {
  try {
    return fs.lstatSync(file)
  } catch (error) {
    if (error.code === "ENOENT") return null
    throw blocked(description + " cannot be inspected")
  }
}

function requireCanonical(file, expected, description) {
  const stat = existing(file, description)
  if (!stat) throw blocked(description + " is missing: " + file)
  if (stat.isSymbolicLink() || !stat[expected]())
    throw blocked(
      description + " is not a canonical " + (expected === "isFile" ? "file" : "directory"),
    )
  try {
    if (fs.realpathSync(file) !== file) throw blocked(description + " contains a symlink")
  } catch (error) {
    if (error.code === "RETIRED_ROOT_FENCE_MISSING") throw error
    throw blocked(description + " cannot be resolved")
  }
  return stat
}

function requireNotWritable(file, expected, description) {
  const stat = requireCanonical(file, expected, description)
  try {
    fs.accessSync(file, fs.constants.W_OK)
  } catch (error) {
    if (error.code === "EACCES" || error.code === "EPERM") return stat
    throw blocked(description + " permissions cannot be inspected")
  }
  throw blocked(description + " is writable: " + file)
}

function requireNoLiveLocks(directory) {
  let names
  try {
    names = fs.readdirSync(directory).sort()
  } catch {
    throw blocked("retired lock ownership cannot be inspected")
  }
  for (const name of names) {
    if (!/^[A-Za-z0-9_.-]+\.json$/.test(name))
      throw blocked("retired lock ownership is unknown: " + name)
    const file = path.join(directory, name)
    const stat = requireCanonical(file, "isFile", "retired lock")
    if (stat.size > 16384) throw blocked("retired lock ownership is unknown: " + name)
    const owner = json(readBytes(file, "retired lock"), "retired lock")
    if (!Number.isSafeInteger(owner?.pid) || owner.pid <= 0)
      throw blocked("retired lock ownership is unknown: " + name)
    try {
      process.kill(owner.pid, 0)
    } catch (error) {
      if (error.code === "ESRCH") continue
      throw blocked("retired lock owner status is unknown: " + name)
    }
    throw blocked("retired lock owner is active: " + name)
  }
}

// The old root remains readable for recovery, but its native submission and
// storage locks, catalog and SQLite sidecars must not be writable by this user.
export function checkRetiredWorkspaceFences(config, currentWorkspace) {
  if (
    !config ||
    config.schema !== "research-retired-workspaces/v1" ||
    Object.keys(config).sort().join(",") !== "schema,workspaces" ||
    !Array.isArray(config.workspaces) ||
    !config.workspaces.length ||
    config.workspaces.length > 8
  )
    throw blocked("configuration is invalid")
  const current = fs.realpathSync(currentWorkspace)
  let checked = 0,
    unmounted = 0
  const seen = new Set()
  for (const row of config.workspaces) {
    if (
      !row ||
      Object.keys(row).sort().join(",") !== "volume,workspace" ||
      typeof row.volume !== "string" ||
      typeof row.workspace !== "string" ||
      !path.isAbsolute(row.volume) ||
      !path.isAbsolute(row.workspace) ||
      path.resolve(row.volume) !== row.volume ||
      path.resolve(row.workspace) !== row.workspace ||
      !row.workspace.startsWith(row.volume + path.sep) ||
      seen.has(row.workspace)
    )
      throw blocked("configuration has an invalid workspace")
    if (
      current === row.workspace ||
      current.startsWith(row.workspace + path.sep) ||
      row.workspace.startsWith(current + path.sep)
    )
      throw blocked("retired workspace overlaps the current workspace")
    seen.add(row.workspace)
    const volume = existing(row.volume, "retired volume")
    if (!volume) {
      unmounted++
      continue
    }
    requireCanonical(row.volume, "isDirectory", "retired volume")
    requireCanonical(row.workspace, "isDirectory", "retired workspace")
    const locks = path.join(row.workspace, ".local/research/local-ai/locks")
    const storage = path.join(row.workspace, ".local/.storage")
    requireNotWritable(locks, "isDirectory", "retired native locks")
    requireNoLiveLocks(locks)
    requireNotWritable(storage, "isDirectory", "retired storage directory")
    if (existing(path.join(storage, "mutation.lock"), "retired storage mutation lock"))
      throw blocked("retired storage mutation lock requires inspection")
    requireNotWritable(path.join(storage, "catalog.sqlite"), "isFile", "retired catalog")
    const wal = requireNotWritable(
      path.join(storage, "catalog.sqlite-wal"),
      "isFile",
      "retired WAL",
    )
    requireNotWritable(path.join(storage, "catalog.sqlite-shm"), "isFile", "retired SHM")
    if (wal.size !== 0) throw blocked("retired WAL is not empty")
    checked++
  }
  return { status: "protected", checked, unmounted }
}

// A release that predates this contract remains readable. A release whose
// manifest names the contract cannot silently drop or change the config.
export function assertRetiredWorkspaceFences(runtime, currentWorkspace) {
  runtime = fs.realpathSync(runtime)
  const file = path.join(runtime, configPath)
  const configStat = existing(file, "retired workspace configuration")
  const sealStat = existing(path.join(runtime, sealPath), "runtime seal")
  let expected
  if (sealStat) {
    requireCanonical(path.join(runtime, sealPath), "isFile", "runtime seal")
    const seal = json(readBytes(path.join(runtime, sealPath), "runtime seal"), "runtime seal")
    if (
      seal.schema !== "research-runtime-installation/v1" ||
      seal.repo_root !== runtime ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(seal.release_id || "")
    )
      throw blocked("runtime seal identity is invalid")
    const ref = seal.release_manifest
    if (
      !ref ||
      !/^\.local\/\.storage\/releases\/[A-Za-z0-9_-]{1,100}\/manifest\.json$/.test(
        ref.path || "",
      ) ||
      ref.path !== `.local/.storage/releases/${seal.release_id}/manifest.json` ||
      !/^[a-f0-9]{64}$/.test(ref.sha256 || "")
    )
      throw blocked("runtime manifest reference is invalid")
    requireCanonical(path.join(runtime, ref.path), "isFile", "runtime manifest")
    const bytes = readBytes(path.join(runtime, ref.path), "runtime manifest")
    if (crypto.createHash("sha256").update(bytes).digest("hex") !== ref.sha256)
      throw blocked("runtime manifest changed")
    const manifest = json(bytes, "runtime manifest")
    if (
      manifest.schema !== "research-development-release/v1" ||
      manifest.release_id !== seal.release_id ||
      !Array.isArray(manifest.files)
    )
      throw blocked("runtime manifest identity is invalid")
    const entries = manifest.files.filter((entry) => entry.path === configPath)
    if (entries.length > 1) throw blocked("runtime manifest has duplicate fence configuration")
    expected = entries[0]?.sha256
    if (!expected && configStat) throw blocked("fence configuration is not bound to the manifest")
    if (expected && !/^[a-f0-9]{64}$/.test(expected))
      throw blocked("fence configuration hash is invalid")
  }
  if (!configStat) {
    if (expected) throw blocked("retired workspace configuration is missing")
    return { status: "not_configured", checked: 0, unmounted: 0 }
  }
  requireCanonical(file, "isFile", "fence configuration")
  const bytes = readBytes(file, "retired workspace configuration")
  if (expected && crypto.createHash("sha256").update(bytes).digest("hex") !== expected)
    throw blocked("fence configuration differs from the manifest")
  return checkRetiredWorkspaceFences(
    json(bytes, "retired workspace configuration"),
    currentWorkspace,
  )
}
