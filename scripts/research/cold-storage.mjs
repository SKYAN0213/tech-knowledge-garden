import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { createRequire } from "node:module"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const runner = fileURLToPath(new URL("./cold-storage.py", import.meta.url))
const roots = new Map()
const databases = new Map()
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex")
const hotNames = new Set([
  "state.json",
  "summary.json",
  "input.json",
  "manifest.json",
  "archive-manifest.json",
  "package-receipt.json",
  "drive-location.json",
  "drive-location-v2.json",
  "receipt.json",
  "candidate-backlog.json",
  "stdout.log",
  "stderr.log",
  "journal.jsonl",
  "verification.json",
])

function fileDigest(file) {
  const hash = crypto.createHash("sha256")
  const fd = fs.openSync(file, "r")
  const block = Buffer.allocUnsafe(1024 * 1024)
  try {
    let read
    while ((read = fs.readSync(fd, block, 0, block.length, null)) > 0)
      hash.update(block.subarray(0, read))
  } finally {
    fs.closeSync(fd)
  }
  return hash.digest("hex")
}

function safeBasePath(base, relative) {
  const root = path.resolve(base)
  const target = path.resolve(root, relative)
  if (
    typeof relative !== "string" ||
    path.isAbsolute(relative) ||
    target === root ||
    !target.startsWith(root + path.sep)
  )
    throw Error("Cold-storage evidence path escapes its root")
  let current = path.parse(target).root
  for (const segment of target.slice(current.length).split(path.sep)) {
    current = path.join(current, segment)
    if (fs.lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink())
      throw Error("Symlink in cold-storage evidence path")
  }
  return { root, target }
}

function storageEvidenceRow(db, relative) {
  return db
    .prepare(
      "SELECT f.path,f.sha256,f.bytes,f.mode,f.mtime_ns,f.scope,o.bundle_id,o.member,b.kind,b.sha256 package_sha256,b.bytes package_bytes,b.file_id,b.parent_id,b.name,b.modified_time,b.verified_at FROM files f LEFT JOIN objects o ON f.sha256=o.sha256 LEFT JOIN bundles b ON o.bundle_id=b.id WHERE f.path=?",
    )
    .get(relative)
}

function manifestEntry(base, relative, root, db, { verifyBytes = true } = {}) {
  const { target } = safeBasePath(base, relative)
  const file = fs.statSync(target, { bigint: true, throwIfNoEntry: false })
  if (file && !file.isFile()) return null
  const storageRelative = root ? path.relative(root, target).split(path.sep).join("/") : null
  const row = root ? storageEvidenceRow(db, storageRelative) : null
  // A present input is cheap to validate against its actual bytes. Once it is
  // evicted, only the immutable catalog-to-Drive package binding is available.
  const actualSha = file ? fileDigest(target) : null
  if (verifyBytes && file && row && (Number(file.size) !== row.bytes || actualSha !== row.sha256))
    throw Error("Cold-storage evidence bytes disagree with catalog: " + relative)
  return {
    path: relative,
    exists: Boolean(file),
    sha256: file ? actualSha : row?.sha256 || null,
    bytes: row?.bytes ?? (file ? Number(file.size) : null),
    catalog: row
      ? {
          path: row.path,
          mode: row.mode,
          scope: row.scope || null,
          bundle_id: row.bundle_id || null,
          member: row.member || null,
          kind: row.kind || null,
          package_sha256: row.package_sha256 || null,
          package_bytes: row.package_bytes ?? null,
          file_id: row.file_id || null,
          parent_id: row.parent_id || null,
          name: row.name || null,
          modified_time: row.modified_time || null,
          mtime_ns: String(row.mtime_ns),
          verified_at: row.verified_at || null,
          verified: Boolean(row.verified_at),
        }
      : null,
  }
}

// Capture the exact files touched by one successful semantic scan verification.
// The manifest binds each path to its content digest and, for evictable files,
// to the already-verified immutable Drive package that preserves those bytes.
export function coldStorageManifest(base, relativePaths) {
  if (!Array.isArray(relativePaths)) throw Error("Cold-storage evidence paths are required")
  const configured = configuredRoot(base)
  const root = configured || null
  const db = root ? catalog(root) : null
  return [...new Set(relativePaths)].sort().flatMap((relative) => {
    const entry = manifestEntry(base, relative, root, db)
    if (!entry?.exists && entry?.catalog) {
      const { target } = safeBasePath(base, relative)
      // Verification may have raced with eviction. Do not mint a proof from
      // catalog metadata alone; ask the normal cold-read path for these bytes.
      resolveColdStorageRead(base, target)
    }
    return entry ? [entry] : []
  })
}

export function coldStorageManifestMatches(base, manifest) {
  if (!Array.isArray(manifest)) return false
  const configured = configuredRoot(base)
  const root = configured || null
  const db = root ? catalog(root) : null
  for (const expected of manifest) {
    if (!expected || typeof expected.path !== "string") return false
    let current
    try {
      current = manifestEntry(base, expected.path, root, db, { verifyBytes: false })
    } catch {
      return false
    }
    if (!current) return false
    if (expected.catalog) {
      if (
        !current.catalog ||
        current.catalog.path !== expected.catalog.path ||
        current.catalog.mode !== expected.catalog.mode ||
        current.catalog.scope !== expected.catalog.scope ||
        current.sha256 !== expected.sha256 ||
        current.bytes !== expected.bytes ||
        current.catalog.bundle_id !== expected.catalog.bundle_id ||
        current.catalog.member !== expected.catalog.member ||
        current.catalog.kind !== expected.catalog.kind ||
        current.catalog.package_sha256 !== expected.catalog.package_sha256 ||
        current.catalog.package_bytes !== expected.catalog.package_bytes ||
        current.catalog.file_id !== expected.catalog.file_id ||
        current.catalog.parent_id !== expected.catalog.parent_id ||
        current.catalog.name !== expected.catalog.name ||
        current.catalog.modified_time !== expected.catalog.modified_time ||
        current.catalog.mtime_ns !== expected.catalog.mtime_ns ||
        current.catalog.verified_at !== expected.catalog.verified_at ||
        current.catalog.verified !== expected.catalog.verified
      )
        return false
      if (
        !current.exists &&
        (!current.catalog.verified ||
          !/^[a-f0-9]{64}$/.test(current.catalog.package_sha256 || "") ||
          !current.catalog.file_id ||
          !current.catalog.parent_id ||
          !current.catalog.name ||
          !current.catalog.kind ||
          !Number.isSafeInteger(current.catalog.package_bytes) ||
          current.catalog.package_bytes <= 0 ||
          !current.catalog.bundle_id)
      )
        return false
      if (
        current.exists &&
        (current.sha256 !== expected.sha256 || current.bytes !== expected.bytes)
      )
        return false
      continue
    }
    if (
      current.catalog ||
      current.exists !== expected.exists ||
      current.sha256 !== expected.sha256 ||
      current.bytes !== expected.bytes
    )
      return false
  }
  return true
}

export function combineStoragePendingErrors(errors) {
  const requests = new Map()
  let first = null
  let omittedRequests = 0
  for (const error of errors) {
    if (error?.code !== "STORAGE_PENDING" || !error.storage_request) continue
    const request = error.storage_request
    if (request.schema !== "research-storage-download-request/v1") continue
    if (first && request.root !== first.root)
      throw Error("Cannot combine storage requests from different roots")
    first ||= request
    const rows = Array.isArray(request.requests) ? request.requests : []
    for (const row of rows) {
      const key = `${row.path || ""}:${row.sha256 || ""}`
      if (row.path && row.sha256 && !requests.has(key)) requests.set(key, row)
    }
    omittedRequests += Math.max(0, Number(request.request_count || 0) - rows.length)
  }
  if (!first) throw Error("At least one storage-pending error is required")
  const rows = [...requests.values()]
  const combined = Error(
    "Drive payload download required; read collection.storage pending and hydrate exact requested bytes",
  )
  combined.code = "STORAGE_PENDING"
  combined.storage_request = {
    ...first,
    path: rows[0]?.path || first.path,
    requests: rows,
    request_count: rows.length + omittedRequests,
  }
  return combined
}

function configuredRoot(base) {
  const cached = roots.get(base)
  if (cached && Date.now() - cached.checked < 1000) return cached.value
  let current = path.resolve(base)
  let value = null
  while (current !== path.dirname(current)) {
    const policyFile = path.join(current, ".storage/policy.json")
    if (fs.existsSync(policyFile)) {
      for (const file of [path.join(current, ".storage"), policyFile])
        if (fs.lstatSync(file).isSymbolicLink()) throw Error("Symlink in cold storage control path")
      const policy = JSON.parse(fs.readFileSync(policyFile, "utf8"))
      if (policy.schema !== "research-cold-storage/v1" || policy.root !== current)
        throw Error("Cold storage policy root changed")
      value = policy.enabled ? current : null
      break
    }
    current = path.dirname(current)
  }
  roots.set(base, { checked: Date.now(), value })
  return value
}

function catalog(root) {
  if (!databases.has(root)) {
    const sqlite = require("node:sqlite")
    const Database = sqlite.Database || sqlite.DatabaseSync
    const file = path.join(root, ".storage/catalog.sqlite")
    if (fs.lstatSync(file).isSymbolicLink()) throw Error("Symlink in storage catalog")
    const db = new Database(file)
    db.exec("PRAGMA busy_timeout=5000")
    databases.set(root, db)
  }
  return databases.get(root)
}

export function resolveColdStorageRead(base, target) {
  const root = configuredRoot(base) || configuredRoot(path.dirname(target))
  if (!root) return target
  const relative = path.relative(root, target).split(path.sep).join("/")
  if (!relative || relative.startsWith("../") || relative.startsWith(".storage/")) return target
  const existing = fs.statSync(target, { throwIfNoEntry: false })
  if (existing?.isFile()) return target
  const db = catalog(root)
  const scope = existing?.isDirectory() && path.basename(target) === "preview-workspace"
  const rows = scope
    ? db
        .prepare(
          "SELECT f.*,o.bundle_id,o.member,b.file_id,b.sha256 package_sha256,b.bytes package_bytes,b.verified_at FROM files f LEFT JOIN objects o ON f.sha256=o.sha256 LEFT JOIN bundles b ON o.bundle_id=b.id WHERE f.scope=?",
        )
        .all(relative)
    : db
        .prepare(
          "SELECT f.*,o.bundle_id,o.member,b.file_id,b.sha256 package_sha256,b.bytes package_bytes,b.verified_at FROM files f LEFT JOIN objects o ON f.sha256=o.sha256 LEFT JOIN bundles b ON o.bundle_id=b.id WHERE f.path=?",
        )
        .all(relative)
  const missing = rows.filter((row) => !fs.existsSync(path.join(root, row.path)))
  const unverified = missing.find((row) => !row.verified_at)
  if (unverified)
    throw Error("Indexed payload is missing without a verified Drive copy: " + unverified.path)
  if (!missing.length) {
    if (!existing && db.prepare("SELECT path FROM files WHERE path=?").get(relative))
      throw Error("Indexed payload is missing without a verified Drive copy: " + relative)
    return target
  }
  const created = new Date().toISOString()
  const requests = []
  const insert = db.prepare("INSERT OR REPLACE INTO requests VALUES(?,?,?,?,?,?)")
  for (const row of missing) {
    const id = sha(row.path + ":" + row.sha256)
    insert.run(id, row.path, row.sha256, row.bundle_id, created, "pending")
    requests.push({
      request_id: id,
      path: row.path,
      sha256: row.sha256,
      bytes: row.bytes,
      bundle_id: row.bundle_id,
      file_id: row.file_id,
      package_sha256: row.package_sha256,
      package_bytes: row.package_bytes,
      member: row.member,
    })
  }
  const error = Error(
    "Drive payload download required; read collection.storage pending and hydrate exact requested bytes",
  )
  error.code = "STORAGE_PENDING"
  error.storage_request = {
    schema: "research-storage-download-request/v1",
    root,
    requests: requests.slice(0, 20),
    request_count: requests.length,
    path: relative,
  }
  throw error
}

export function storageAction(root, action, parameters = {}) {
  const result = execFileSync(
    process.env.RESEARCH_STORAGE_PYTHON || "python3",
    [runner, action, "--root", path.resolve(root)],
    {
      input: JSON.stringify(parameters),
      encoding: "utf8",
      maxBuffer: 128 * 1024 ** 2,
      timeout: ["prepare", "evict", "export", "import"].includes(action) ? 30 * 60 * 1000 : 120000,
    },
  )
  roots.clear()
  return JSON.parse(result)
}

export function trimColdStorage(base, ignorePid = process.pid) {
  const root = configuredRoot(base)
  return root ? storageAction(root, "evict", { ignore_pid: ignorePid }) : null
}

export function recordColdStorageWrite(base, target, digest, bytes) {
  const root = configuredRoot(base) || configuredRoot(path.dirname(target))
  if (!root) return
  const relative = path.relative(root, target).split(path.sep).join("/")
  if (!relative || relative.startsWith("../") || relative.startsWith(".storage/")) return
  const settings = JSON.parse(fs.readFileSync(path.join(root, ".storage/policy.json")))
  const parts = relative.split("/")
  const name = parts.at(-1)
  const i = parts.indexOf("preview-workspace")
  if (
    parts.some(
      (p) =>
        ["runtime", "node_modules", ".git", "venv", ".venv", "__pycache__"].includes(p) ||
        /credential|oauth|secret/i.test(p),
    ) ||
    hotNames.has(name) ||
    name.startsWith(".") ||
    /\.(tmp|lock)$/.test(name) ||
    (i < 0 && name !== "body.bin" && bytes < settings.minimum_payload_bytes)
  )
    return
  const st = fs.statSync(target, { bigint: true })
  catalog(root)
    .prepare("INSERT OR REPLACE INTO files VALUES(?,?,?,?,?,?,?)")
    .run(
      relative,
      digest,
      bytes,
      Number(st.mode & 0o777n),
      st.mtimeNs.toString(),
      i < 0 ? null : parts.slice(0, i + 1).join("/"),
      new Date().toISOString(),
    )
}
