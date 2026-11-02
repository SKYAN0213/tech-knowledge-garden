import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { AsyncLocalStorage } from "node:async_hooks"

// Invocation-local only. Neither a persisted success bit nor file timestamps
// authorize reuse in a later process. Mutable checkpoints use the normal reader.
const sessions = new AsyncLocalStorage()
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex")
const scopeKey = (ctx) => JSON.stringify([ctx.root, ctx.repo, ctx.vault, ctx.backlog, ctx.policy])
const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
function observation(file) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false })
  if (!stat) return { kind: "absent" }
  if (stat.isSymbolicLink()) throw Error("Symlink in verified input")
  if (stat.isDirectory())
    return { kind: "directory", sha256: digest(JSON.stringify(fs.readdirSync(file).sort())) }
  if (!stat.isFile()) throw Error("Regular verified input required")
  const bytes = fs.readFileSync(file)
  return { kind: "file", sha256: digest(bytes), bytes: bytes.length }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export function trackVerifiedPath(file) {
  const s = sessions.getStore()
  if (s && s.frames.length) {
    if (!s.dependencies.has(file)) s.dependencies.set(file, observation(file))
    for (const frame of s.frames) frame.add(file)
    return true
  }
  return false
}

export function invalidateVerifiedWrite(file) {
  const s = sessions.getStore()
  if (!s) return
  if (s.pinned.has(file)) throw Error("Cannot rewrite a verified immutable input")
  const affected = new Set([file])
  for (const [parent, entry] of s.dependencies)
    if (entry.kind === "directory" && file.startsWith(parent + path.sep)) affected.add(parent)
  for (const changed of affected) s.dependencies.delete(changed)
  for (const [key, entry] of s.memo)
    if ([...affected].some((changed) => entry.dependencies.has(changed))) s.memo.delete(key)
  for (const [key, entry] of s.json) if (entry.file === file) s.json.delete(key)
}

export function verifiedJSON(
  file,
  expected,
  read = () => fs.readFileSync(file),
  mismatch = "Frozen input SHA-256 changed",
) {
  const s = sessions.getStore()
  if (!s) {
    const bytes = read()
    if (expected && digest(bytes) !== expected) throw Error(mismatch)
    return JSON.parse(bytes)
  }
  trackVerifiedPath(file)
  const key = JSON.stringify([file, expected || null])
  const old = s.json.get(key)
  if (old) {
    s.metrics.json_cache_hits++
    return old.value
  }
  const bytes = read(),
    sha256 = digest(bytes)
  if (expected && sha256 !== expected) throw Error(mismatch)
  const prior = s.dependencies.get(file)
  const current = { kind: "file", sha256, bytes: bytes.length }
  if (prior && !same(prior, current)) throw Error("Verified input changed during processing")
  s.dependencies.set(file, current)
  if (expected) s.pinned.add(file)
  s.metrics.json_reads++
  s.metrics.json_bytes += bytes.length
  const value = freeze(JSON.parse(bytes))
  s.json.set(key, { file, value })
  return value
}

export function immutableJSONPath(relative) {
  return /^(?:parses\/[a-f0-9]{64}\/parse\.json|editions\/[^/]+\/materials\.json|daily\/runs\/[^/]+\/collection-reports\/[a-f0-9]{64}\.json)$/.test(
    relative,
  )
}

export function memoizeVerifiedInput(ctx, key, operation) {
  const s = sessions.getStore()
  if (!s || s.key !== scopeKey(ctx)) return operation()
  return memoizeVerifiedArtifact(key, operation)
}

export function memoizeVerifiedArtifact(key, operation) {
  const s = sessions.getStore()
  if (!s) return operation()
  const old = s.memo.get(key)
  if (old) {
    for (const file of old.dependencies) trackVerifiedPath(file)
    s.metrics.validation_cache_hits++
    return old.value
  }
  const dependencies = new Set()
  const outer = s.frames.length === 0,
    started = performance.now()
  s.frames.push(dependencies)
  try {
    const value = operation()
    if (value && typeof value.then === "function")
      throw Error("Verified input memo requires synchronous validation")
    for (const file of dependencies) {
      const current = observation(file),
        prior = s.dependencies.get(file)
      if (prior && !same(prior, current)) throw Error("Verified input changed during validation")
      s.dependencies.set(file, current)
    }
    s.metrics.validations++
    s.memo.set(key, { value: freeze(value), dependencies })
    return value
  } finally {
    s.frames.pop()
    if (outer) s.metrics.validation_ms += performance.now() - started
  }
}

export function assertVerifiedInputBoundary() {
  const s = sessions.getStore()
  if (!s) return
  const started = performance.now()
  for (const [file, before] of s.dependencies)
    if (!same(before, observation(file)))
      throw Error("Verified input changed before commit: " + path.basename(file))
  s.metrics.boundary_checks++
  s.metrics.boundary_ms += performance.now() - started
}

export async function withVerifiedInputSession(ctx, operation) {
  const parent = sessions.getStore()
  if (parent?.key === scopeKey(ctx)) return operation()
  const s = {
    key: scopeKey(ctx),
    json: new Map(),
    memo: new Map(),
    dependencies: new Map(),
    pinned: new Set(),
    frames: [],
    metrics: {
      json_reads: 0,
      json_bytes: 0,
      json_cache_hits: 0,
      validations: 0,
      validation_cache_hits: 0,
      boundary_checks: 0,
      boundary_ms: 0,
      validation_ms: 0,
    },
  }
  return sessions.run(s, async () => {
    const result = await operation()
    assertVerifiedInputBoundary()
    return result && typeof result === "object"
      ? { ...result, validation_statistics: { ...s.metrics, invocation_local: true } }
      : result
  })
}
