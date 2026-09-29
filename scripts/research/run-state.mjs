import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { sha256 } from "./contracts.mjs"

export const DEFAULT_ROOT = ".local/research/local-ai"
export function safePath(root, relative) {
  const base = path.resolve(root),
    target = path.resolve(base, relative)
  if (path.isAbsolute(relative) || target === base || !target.startsWith(base + path.sep))
    throw Error("Private path escapes working root")
  let current = path.parse(target).root
  for (const segment of target.slice(current.length).split(path.sep)) {
    current = path.join(current, segment)
    if (fs.lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink())
      throw Error("Symlink in private path")
  }
  return target
}
export function assertAbsent(root, relative) {
  const file = safePath(root, relative)
  if (fs.lstatSync(file, { throwIfNoEntry: false }))
    throw Error("New note destination already exists: " + relative)
  return file
}
// A hard-link installs fully written bytes atomically and fails if the target
// appeared meanwhile. Never fall back to rename, which would replace that file.
export function atomicCreate(root, relative, value) {
  const file = assertAbsent(root, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  assertAbsent(root, relative)
  const tmp = file + "." + crypto.randomUUID() + ".tmp"
  const data =
    Buffer.isBuffer(value) || typeof value === "string"
      ? value
      : JSON.stringify(value, null, 2) + "\n"
  const fd = fs.openSync(tmp, "wx", 0o600)
  try {
    try {
      fs.writeFileSync(fd, data)
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    assertAbsent(root, relative)
    fs.linkSync(tmp, file)
  } finally {
    fs.unlinkSync(tmp)
  }
  const dir = fs.openSync(path.dirname(file), "r")
  try {
    fs.fsyncSync(dir)
  } finally {
    fs.closeSync(dir)
  }
  return { path: relative, sha256: sha256(data) }
}
export function atomicWrite(root, relative, value) {
  const file = safePath(root, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + "." + crypto.randomUUID() + ".tmp"
  const data =
    Buffer.isBuffer(value) || typeof value === "string"
      ? value
      : JSON.stringify(value, null, 2) + "\n"
  const fd = fs.openSync(tmp, "wx", 0o600)
  try {
    fs.writeFileSync(fd, data)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  fs.renameSync(tmp, file)
  const dir = fs.openSync(path.dirname(file), "r")
  try {
    fs.fsyncSync(dir)
  } finally {
    fs.closeSync(dir)
  }
  return { path: relative, sha256: sha256(data) }
}
export function readJSON(root, relative) {
  const file = safePath(root, relative)
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null
}
export function acquireLock(root, name) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw Error("Invalid lock name")
  const file = safePath(root, `locks/${name}.json`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  // Stale locks are never stolen implicitly. A killed process requires explicit recovery.
  const fd = fs.openSync(file, "wx", 0o600)
  const owner = crypto.randomUUID()
  fs.writeFileSync(
    fd,
    JSON.stringify({ owner, pid: process.pid, started_at: new Date().toISOString() }),
  )
  fs.fsyncSync(fd)
  fs.closeSync(fd)
  return () => {
    if (JSON.parse(fs.readFileSync(file, "utf8")).owner !== owner) throw Error("Lock owner changed")
    fs.unlinkSync(file)
  }
}
export async function withLock(root, name, action) {
  const release = acquireLock(root, name)
  try {
    return await action()
  } finally {
    release()
  }
}
export class RunState {
  constructor(root, id, input, { scope = "" } = {}) {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw Error("Invalid run id")
    if (scope && !/^[a-zA-Z0-9_-]+$/.test(scope)) throw Error("Invalid run scope")
    this.root = root
    this.id = id
    this.directory = `runs/${id}/${scope ? scope + "/" : ""}`
    this.file = this.directory + "state.json"
    const input_hash = sha256(JSON.stringify(input))
    this.state = readJSON(root, this.file) || {
      schema: "research-run/v1",
      run_id: id,
      input_hash,
      started_at: new Date().toISOString(),
      stages: {},
      published_by: null,
      candidate_published: false,
    }
    if (this.state.input_hash !== input_hash) throw Error("Run input changed; use a new run id")
    atomicWrite(root, this.file, this.state)
  }
  async stage(name, input, action) {
    if (!/^[a-zA-Z0-9_-]+$/.test(name) || ["constructor", "__proto__"].includes(name))
      throw Error("Invalid stage name")
    const hash = sha256(JSON.stringify(input)),
      previous = this.state.stages[name]
    if (previous?.status === "complete" && previous.input_hash === hash) {
      const result = readJSON(this.root, previous.result_path)
      if (!result || sha256(JSON.stringify(result)) !== previous.result_hash)
        throw Error("Stage checkpoint hash mismatch")
      return result
    }
    const record = { input_hash: hash, status: "running", started_at: new Date().toISOString() }
    this.record(name, record)
    try {
      const result = await action()
      const result_path = this.directory + name + ".json"
      atomicWrite(this.root, result_path, result)
      this.record(name, {
        ...record,
        status: "complete",
        finished_at: new Date().toISOString(),
        result_path,
        result_hash: sha256(JSON.stringify(result)),
      })
      return result
    } catch (e) {
      this.record(name, {
        ...record,
        status: "failed",
        finished_at: new Date().toISOString(),
        error: e.message,
      })
      throw e
    }
  }
  record(stage, record) {
    this.state.stages[stage] = record
    const journal = safePath(this.root, this.directory + "journal.jsonl")
    const fd = fs.openSync(journal, "a", 0o600)
    try {
      fs.writeSync(fd, JSON.stringify({ stage, ...record }) + "\n")
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    atomicWrite(this.root, this.file, this.state)
  }
}
