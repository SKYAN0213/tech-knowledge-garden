import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { storageAction } from "../scripts/research/cold-storage.mjs"
import { safePath, readJSON, atomicWrite, RunState } from "../scripts/research/run-state.mjs"
import { packageResearchArchive } from "../scripts/research/archive.mjs"

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex")
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-storage-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const body = Buffer.from("preserved original evidence.\n".repeat(3000))
  for (const rel of [
    "research/local-ai/documents/a/body.bin",
    "research/local-ai/runs/r1/copy.bin",
  ]) {
    const file = path.join(root, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, body)
  }
  storageAction(root, "prepare", { parent_id: "private-parent" })
  const bundles = storageAction(root, "pending").uploads
  assert.equal(bundles.length, 1)
  const bundle = bundles[0]
  return {
    root,
    body,
    bundle,
    metadata: {
      id: "private-file",
      title: bundle.name,
      mime_type: "application/zip",
      size: String(bundle.bytes),
      parent_ids: ["private-parent"],
      modified_time: new Date().toISOString(),
      shared: false,
    },
    observed_at: new Date().toISOString(),
  }
}
function verified(t) {
  const f = fixture(t)
  storageAction(f.root, "verify", {
    bundle_id: f.bundle.id,
    metadata: f.metadata,
    observed_at: f.observed_at,
    download_path: f.bundle.local_path,
  })
  storageAction(f.root, "enable")
  return f
}

test("storage deduplicates equal bytes across original paths without changing evidence", (t) => {
  const f = fixture(t)
  const s = storageAction(f.root, "status")
  assert.equal(s.files, 2)
  assert.equal(s.distinct_contents, 1)
  assert.equal(s.unarchived_files, 2)
  assert.equal(
    hash(fs.readFileSync(path.join(f.root, "research/local-ai/documents/a/body.bin"))),
    hash(f.body),
  )
})

test("unverified uploads cannot enable eviction", (t) => {
  const f = fixture(t)
  assert.throws(() => storageAction(f.root, "enable"), /Verify remote bundles/)
  assert.throws(
    () =>
      storageAction(f.root, "verify", {
        bundle_id: f.bundle.id,
        metadata: f.metadata,
        observed_at: f.observed_at,
      }),
    /Actual downloaded/,
  )
})

test("fresh private Drive parent and raw bytes are mandatory", (t) => {
  const f = fixture(t)
  for (const metadata of [
    { ...f.metadata, shared: true },
    { ...f.metadata, parent_ids: ["other"] },
  ])
    assert.throws(
      () =>
        storageAction(f.root, "verify", {
          bundle_id: f.bundle.id,
          metadata,
          observed_at: f.observed_at,
          download_path: f.bundle.local_path,
        }),
      /does not match/,
    )
  assert.throws(
    () =>
      storageAction(f.root, "verify", {
        bundle_id: f.bundle.id,
        metadata: f.metadata,
        observed_at: "2000-01-01T00:00:00Z",
        download_path: f.bundle.local_path,
      }),
    /Fresh remote/,
  )
})

test("cold reads request the exact Drive object and restore the original bytes", (t) => {
  const f = verified(t)
  const result = storageAction(f.root, "evict", { cache_bytes: 0 })
  assert.equal(result.evicted, 2)
  const relative = "research/local-ai/documents/a/body.bin"
  const read = () => safePath(path.join(f.root, "research/local-ai"), "documents/a/body.bin")
  assert.throws(
    read,
    (error) =>
      error.code === "STORAGE_PENDING" &&
      error.storage_request.requests[0].file_id === "private-file" &&
      error.storage_request.requests[0].sha256 === hash(f.body),
  )
  assert.equal(storageAction(f.root, "pending").downloads.length, 1)
  const restored = storageAction(f.root, "hydrate", {
    bundle_id: f.bundle.id,
    download_path: f.bundle.local_path,
    paths: [relative],
  })
  assert.equal(restored.restored, 1)
  assert.deepEqual(fs.readFileSync(read()), f.body)
  assert.equal(storageAction(f.root, "pending").downloads.length, 0)
})

test("remote request cannot turn a missing indexed JSON into an empty result", (t) => {
  const f = verified(t)
  const file = "research/local-ai/runs/r1/facts.json"
  atomicWrite(f.root, file, { content: "x".repeat(50000) })
  fs.unlinkSync(path.join(f.root, file))
  assert.throws(() => readJSON(f.root, file), /Indexed payload is missing/)
})

test("changed local bytes are retained and future payloads enter the archive queue", (t) => {
  const f = verified(t)
  const relative = "research/local-ai/documents/a/body.bin"
  atomicWrite(f.root, relative, Buffer.from("new verified source edition".repeat(4000)))
  const s = storageAction(f.root, "status")
  assert.equal(s.unarchived_files, 1)
  const trimmed = storageAction(f.root, "evict", { cache_bytes: 0 })
  assert.equal(trimmed.evicted, 1)
  assert.ok(fs.existsSync(path.join(f.root, relative)))
})

test("hydration rejects another package and preserves an edited working file", (t) => {
  const f = verified(t)
  const rel = "research/local-ai/documents/a/body.bin"
  fs.writeFileSync(path.join(f.root, "wrong.zip"), "wrong bytes")
  assert.throws(
    () =>
      storageAction(f.root, "hydrate", {
        bundle_id: f.bundle.id,
        download_path: "wrong.zip",
        paths: [rel],
      }),
    /hash mismatch/,
  )
  fs.writeFileSync(path.join(f.root, rel), "local correction")
  assert.throws(
    () =>
      storageAction(f.root, "hydrate", {
        bundle_id: f.bundle.id,
        download_path: f.bundle.local_path,
        paths: [rel],
      }),
    /Preserve changed/,
  )
})

test("active native writers hold cache eviction", (t) => {
  const f = verified(t)
  const lock = path.join(f.root, "research/local-ai/locks/source-live.json")
  fs.mkdirSync(path.dirname(lock), { recursive: true })
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid }))
  const result = storageAction(f.root, "evict", { cache_bytes: 0 })
  assert.equal(result.evicted, 0)
  assert.equal(result.held_by_active_locks.length, 1)
})

test("private path validation rejects traversal even when the target is cold", (t) => {
  const f = verified(t)
  assert.throws(() => safePath(f.root, "../escape"), /escapes/)
  assert.throws(
    () =>
      storageAction(f.root, "hydrate", {
        bundle_id: f.bundle.id,
        download_path: "../escape",
        paths: ["a"],
      }),
    /relative/,
  )
})

test("the cloud catalog restores path/Drive mappings without copying any original payload", (t) => {
  const f = verified(t)
  const snapshot = storageAction(f.root, "export")
  const destination = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-catalog-")))
  t.after(() => fs.rmSync(destination, { recursive: true, force: true }))
  fs.copyFileSync(path.join(f.root, snapshot.path), path.join(destination, "catalog.gz"))
  const restored = storageAction(destination, "import", {
    catalog_path: "catalog.gz",
    expected_sha256: snapshot.sha256,
  })
  assert.equal(restored.restored_catalog.files, 2)
  assert.equal(
    fs.existsSync(path.join(destination, "research/local-ai/documents/a/body.bin")),
    false,
  )
  assert.throws(
    () => safePath(destination, "research/local-ai/documents/a/body.bin"),
    (error) =>
      error.code === "STORAGE_PENDING" &&
      error.storage_request.requests[0].file_id === "private-file",
  )
})

test("workspace materialization requests all missing source files as a single scope", (t) => {
  const f = verified(t)
  const relative = "research/local-ai/runs/r1/preview-workspace"
  const dir = path.join(f.root, relative)
  fs.mkdirSync(path.join(dir, "vault"), { recursive: true })
  fs.writeFileSync(path.join(dir, "vault/article.md"), "small article")
  fs.writeFileSync(path.join(dir, "vault/term.md"), "small definition")
  storageAction(f.root, "prepare", { parent_id: "private-parent" })
  for (const b of storageAction(f.root, "pending").uploads)
    storageAction(f.root, "verify", {
      bundle_id: b.id,
      download_path: b.local_path,
      metadata: { ...f.metadata, id: b.id, title: b.name, size: String(b.bytes) },
      observed_at: new Date().toISOString(),
    })
  storageAction(f.root, "evict", { cache_bytes: 0 })
  assert.throws(
    () => safePath(f.root, relative),
    (error) => error.code === "STORAGE_PENDING" && error.storage_request.request_count === 2,
  )
})

test("repository-relative review paths discover a storage root below the repository", (t) => {
  const f = verified(t)
  storageAction(f.root, "evict", { cache_bytes: 0 })
  assert.throws(
    () =>
      safePath(
        path.dirname(f.root),
        path.basename(f.root) + "/research/local-ai/documents/a/body.bin",
      ),
    (error) => error.code === "STORAGE_PENDING",
  )
})

test("credential and runtime writes stay local and never enter the Drive archive queue", (t) => {
  const f = verified(t)
  const body = "private configuration".repeat(4000)
  for (const relative of [
    "research/credentials/private.json",
    "research/oauth.json",
    "research/secret-token.json",
    "research/.venv/runtime.bin",
    "research/local-ai/runs/r2/input.json",
    "research/local-ai/runs/r2/archive-manifest.json",
    "research/local-ai/runs/r2/stdout.log",
  ])
    atomicWrite(f.root, relative, body)
  const result = storageAction(f.root, "status")
  assert.equal(result.files, 2)
  assert.equal(result.unarchived_files, 0)
  storageAction(f.root, "evict", { cache_bytes: 0 })
  assert.equal(
    fs.readFileSync(path.join(f.root, "research/credentials/private.json"), "utf8"),
    body,
  )
  assert.equal(
    fs.readFileSync(path.join(f.root, "research/local-ai/runs/r2/archive-manifest.json"), "utf8"),
    body,
  )
})

test("Node and Python reject a symlink in the storage control directory", (t) => {
  const f = verified(t)
  fs.renameSync(path.join(f.root, ".storage"), path.join(f.root, "real-control"))
  fs.symlinkSync(path.join(f.root, "real-control"), path.join(f.root, ".storage"))
  assert.throws(() => safePath(f.root, "research/local-ai/documents/a/body.bin"), /Symlink/)
  assert.throws(() => storageAction(f.root, "status"), /Symlink/)
})

test("Node and Python reject a symlinked storage catalogue", (t) => {
  const f = verified(t)
  storageAction(f.root, "evict", { cache_bytes: 0 })
  const catalog = path.join(f.root, ".storage/catalog.sqlite")
  fs.renameSync(catalog, catalog + ".real")
  fs.symlinkSync(catalog + ".real", catalog)
  assert.throws(() => safePath(f.root, "research/local-ai/documents/a/body.bin"), /Symlink/)
  assert.throws(() => storageAction(f.root, "status"), /Symlink/)
})

test("archive packaging hands cold inputs to storage and resumes with the same preserved bytes", (t) => {
  const f = verified(t)
  const nativeRoot = path.join(f.root, "research/local-ai")
  atomicWrite(nativeRoot, "runs/r1/archive-manifest.json", {
    schema: "research-archive/v1",
    run_id: "r1",
    files: [
      {
        path: "runs/r1/copy.bin",
        bytes: f.body.length,
        sha256: hash(f.body),
        public: false,
        drive_root: "Research",
      },
    ],
  })
  storageAction(f.root, "evict", { cache_bytes: 0 })
  assert.throws(
    () => packageResearchArchive(nativeRoot, "r1"),
    (error) =>
      error.code === "STORAGE_PENDING" &&
      error.storage_request.requests[0].file_id === "private-file",
  )
  assert.equal(
    fs.existsSync(path.join(nativeRoot, "archive-staging/r1/research-source-bundle.zip")),
    false,
  )
  storageAction(f.root, "hydrate", {
    bundle_id: f.bundle.id,
    download_path: f.bundle.local_path,
    paths: ["research/local-ai/runs/r1/copy.bin"],
  })
  const result = packageResearchArchive(nativeRoot, "r1")
  assert.equal(result.sha256, hash(fs.readFileSync(path.join(nativeRoot, result.path))))
  assert.deepEqual(fs.readFileSync(path.join(nativeRoot, "runs/r1/copy.bin")), f.body)
})

test("native stages preserve storage waits and completed checkpoints during resumption", async (t) => {
  const f = verified(t)
  const nativeRoot = path.join(f.root, "research/local-ai")
  const state = new RunState(nativeRoot, "native-read", { source: "a" })
  let completedCalls = 0
  const prior = () => {
    completedCalls++
    return { preserved: true }
  }
  await state.stage("prior-work", {}, prior)
  storageAction(f.root, "evict", { cache_bytes: 0 })
  const read = () => ({
    digest: hash(fs.readFileSync(safePath(nativeRoot, "documents/a/body.bin"))),
  })
  await assert.rejects(
    state.stage("read-original", { source: "a" }, read),
    (error) => error.code === "STORAGE_PENDING",
  )
  const waiting = readJSON(nativeRoot, "runs/native-read/state.json").stages["read-original"]
  assert.equal(waiting.status, "waiting_for_storage")
  assert.equal(waiting.storage_request.requests[0].file_id, "private-file")
  storageAction(f.root, "hydrate", {
    bundle_id: f.bundle.id,
    download_path: f.bundle.local_path,
    paths: ["research/local-ai/documents/a/body.bin"],
  })
  const resumed = new RunState(nativeRoot, "native-read", { source: "a" })
  await resumed.stage("prior-work", {}, prior)
  assert.equal(completedCalls, 1)
  assert.deepEqual(await resumed.stage("read-original", { source: "a" }, read), {
    digest: hash(f.body),
  })
})
