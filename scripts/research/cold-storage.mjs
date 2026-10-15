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
])

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
