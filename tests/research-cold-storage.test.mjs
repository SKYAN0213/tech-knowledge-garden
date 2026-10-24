import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { once } from "node:events"
import { spawn, spawnSync } from "node:child_process"
import { executeModule, moduleCatalog } from "../scripts/research/module-registry.mjs"
import { moduleContext, submitModuleJob } from "../scripts/research/module-runtime.mjs"
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

function mutationFixture(t, pid = 2147483647) {
  const f = fixture(t)
  const lock = path.join(f.root, ".storage/mutation.lock")
  const bytes = Buffer.from(JSON.stringify({ pid, started_at: new Date().toISOString() }))
  fs.writeFileSync(lock, bytes)
  return {
    ...f,
    lock,
    bytes,
    parameters: {
      expected_root: f.root,
      expected_pid: pid,
      expected_lock_sha256: hash(bytes),
      operator: "unit-test",
      reason: "Recover the exact terminated native writer",
    },
  }
}

test("explicit mutation recovery preserves the exact dead owner and a native receipt", (t) => {
  const f = mutationFixture(t)
  const result = storageAction(f.root, "recover-mutation-lock", f.parameters)
  assert.equal(result.status, "recovered")
  assert.equal(fs.existsSync(f.lock), false)
  const receipt = JSON.parse(fs.readFileSync(path.join(f.root, result.receipt_path)))
  assert.equal(receipt.original_lock_sha256, hash(f.bytes))
  assert.equal(receipt.original_lock_text, f.bytes.toString())
  assert.equal(receipt.verification.kill_probe, "ESRCH")
  assert.equal(receipt.operator, "unit-test")
  assert.equal(receipt.expected_pid, f.parameters.expected_pid)
  assert.deepEqual(fs.readFileSync(path.join(f.root, receipt.original_lock_path)), f.bytes)
})

for (const rejection of ["alive", "sha", "pid", "root", "symlink"]) {
  test(`mutation recovery rejects ${rejection} and preserves the lock`, (t) => {
    const f = mutationFixture(t, rejection === "alive" ? process.pid : 2147483647)
    const parameters = { ...f.parameters }
    if (rejection === "sha") parameters.expected_lock_sha256 = "0".repeat(64)
    if (rejection === "pid") parameters.expected_pid -= 1
    if (rejection === "root") parameters.expected_root = path.dirname(f.root)
    if (rejection === "symlink") {
      fs.renameSync(f.lock, f.lock + ".original")
      fs.symlinkSync(f.lock + ".original", f.lock)
    }
    assert.throws(() => storageAction(f.root, "recover-mutation-lock", parameters))
    assert.deepEqual(fs.readFileSync(f.lock), f.bytes)
  })
}

function largeHydrationFixture(t) {
  const f = verified(t)
  const result = spawnSync(
    "python3",
    [
      "-c",
      `import sqlite3,sys
c=sqlite3.connect(sys.argv[1]); row=c.execute("SELECT sha256,bytes,mode,mtime_ns FROM files LIMIT 1").fetchone()
for i in range(1001): c.execute("INSERT INTO files(path,sha256,bytes,mode,mtime_ns) VALUES(?,?,?,?,?)",(f"research/local-ai/documents/bounded/{i:04d}.bin",*row))
c.commit()`,
      path.join(f.root, ".storage/catalog.sqlite"),
    ],
    { encoding: "utf8" },
  )
  assert.equal(result.status, 0, result.stderr)
  return {
    ...f,
    paths: Array.from(
      { length: 1001 },
      (_, i) => `research/local-ai/documents/bounded/${String(i).padStart(4, "0")}.bin`,
    ),
  }
}

test("large native hydration commits bounded batches and preserves path order", (t) => {
  const f = largeHydrationFixture(t)
  const result = storageAction(f.root, "hydrate", {
    bundle_id: f.bundle.id,
    download_path: f.bundle.local_path,
    paths: f.paths,
  })
  assert.equal(result.restored, 1001)
  assert.equal(result.bytes, f.body.length * 1001)
  assert.deepEqual(result.paths, f.paths)
  const attempts = path.join(f.root, ".storage/hydration-attempts")
  const directory = path.join(attempts, fs.readdirSync(attempts)[0])
  const inputs = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith("-input.json"))
    .sort()
  assert.deepEqual(
    inputs.map((name) => JSON.parse(fs.readFileSync(path.join(directory, name))).paths.length),
    [1000, 1],
  )
})

test("bounded hydration preserves partial commits and explicit resume rejects changed local bytes", (t) => {
  const f = largeHydrationFixture(t),
    last = f.paths.at(-1)
  fs.mkdirSync(path.dirname(path.join(f.root, last)), { recursive: true })
  fs.writeFileSync(path.join(f.root, last), "local correction")
  const parameters = { bundle_id: f.bundle.id, download_path: f.bundle.local_path, paths: f.paths }
  assert.throws(
    () => storageAction(f.root, "hydrate", parameters),
    (error) => {
      assert.equal(error.hydration_partial.restored, 1000)
      assert.equal(error.hydration_partial.bytes, f.body.length * 1000)
      return /Preserve changed/.test(error.message)
    },
  )
  assert.deepEqual(fs.readFileSync(path.join(f.root, last)), Buffer.from("local correction"))
  const readback = spawnSync(
    "python3",
    [
      "-c",
      `import sqlite3,sys
c=sqlite3.connect(sys.argv[1]);print(c.execute("SELECT COUNT(*) FROM files WHERE path LIKE '%/bounded/%' AND cached_at IS NOT NULL").fetchone()[0])`,
      path.join(f.root, ".storage/catalog.sqlite"),
    ],
    { encoding: "utf8" },
  )
  assert.equal(Number(readback.stdout), 1000)
  const attempts = path.join(f.root, ".storage/hydration-attempts")
  const first = path.join(attempts, fs.readdirSync(attempts)[0], "000002-failure.json")
  const failureBytes = fs.readFileSync(first)
  // Explicitly restore the reviewed local bytes before resuming the same paths.
  fs.writeFileSync(path.join(f.root, last), f.body)
  const resumed = storageAction(f.root, "hydrate", parameters)
  assert.equal(resumed.restored, 1001)
  assert.equal(resumed.bytes, 0)
  assert.deepEqual(resumed.paths, f.paths)
  assert.deepEqual(fs.readFileSync(first), failureBytes)
  fs.appendFileSync(path.join(f.root, f.bundle.local_path), "changed package")
  assert.throws(() => storageAction(f.root, "hydrate", parameters), /hash mismatch/)
})

for (const probe of ["EPERM", "unknown", "changed-lock", "changed-guard"]) {
  test(`native mutation recovery refuses ${probe} without unlinking the owner`, (t) => {
    const f = mutationFixture(t)
    const program = `import importlib.util,json,os,pathlib,sys
spec=importlib.util.spec_from_file_location("cold",sys.argv[1]); m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
root=pathlib.Path(sys.argv[2]); p=json.loads(sys.argv[3]); mode=sys.argv[4]
def kill(pid,signal):
 if mode=="EPERM": raise PermissionError("denied")
 if mode=="unknown": raise OSError("visibility unavailable")
 if mode=="changed-guard":
  target=root/".storage/mutation-recovery.lock"; replacement=root/".storage/replaced-guard"; replacement.write_text("changed inode");os.replace(replacement,target);raise ProcessLookupError("exited")
 target=root/".storage/mutation.lock"; altered=json.loads(target.read_text());altered["started_at"]="2026-10-22T01:00:00+00:00";target.write_text(json.dumps(altered));raise ProcessLookupError("exited")
m.os.kill=kill
try: m.recover_mutation_lock(root,p)
except (ValueError,OSError) as e: print(str(e));sys.exit(2)
sys.exit(0)`
    const observed = spawnSync(
      "python3",
      [
        "-c",
        program,
        new URL("../scripts/research/cold-storage.py", import.meta.url).pathname,
        f.root,
        JSON.stringify(f.parameters),
        probe,
      ],
      { encoding: "utf8" },
    )
    assert.equal(observed.status, 2, observed.stderr)
    assert.match(
      observed.stdout,
      probe === "changed-lock"
        ? /changed during/
        : probe === "changed-guard"
          ? /guard changed/
          : /visibility unknown/,
    )
    assert.equal(fs.existsSync(f.lock), true)
    if (probe !== "changed-lock") assert.deepEqual(fs.readFileSync(f.lock), f.bytes)
    assert.equal(fs.statSync(path.join(f.root, ".storage/mutation-recovery.lock")).isFile(), true)
  })
}

test("implicit pending hydration uses the same bounded exact-bundle path batches", (t) => {
  const f = largeHydrationFixture(t)
  const inserted = spawnSync(
    "python3",
    [
      "-c",
      `import sqlite3,sys
c=sqlite3.connect(sys.argv[1]);b=sys.argv[2];h=c.execute("SELECT sha256 FROM files LIMIT 1").fetchone()[0]
for i in range(1001): c.execute("INSERT INTO requests VALUES(?,?,?,?,?,?)",(f"pending-{i}",f"research/local-ai/documents/bounded/{i:04d}.bin",h,b,"2026-10-22T00:00:00+00:00","pending"))
c.execute("INSERT INTO requests VALUES(?,?,?,?,?,?)",("foreign","foreign.bin",h,"another-bundle","2026-10-22T00:00:00+00:00","pending"));c.commit()`,
      path.join(f.root, ".storage/catalog.sqlite"),
      f.bundle.id,
    ],
    { encoding: "utf8" },
  )
  assert.equal(inserted.status, 0, inserted.stderr)
  const result = storageAction(f.root, "hydrate", {
    bundle_id: f.bundle.id,
    download_path: f.bundle.local_path,
  })
  assert.equal(result.restored, 1001)
  assert.deepEqual(result.paths, f.paths)
  const pending = storageAction(f.root, "pending").downloads
  assert.equal(pending.filter((r) => r.bundle_id === f.bundle.id).length, 0)
})

test("hydration rechecks package SHA at every bounded native invocation", (t) => {
  const f = largeHydrationFixture(t)
  const wrapper = path.join(f.root, "native-wrapper.py")
  const nativePython = spawnSync("python3", ["-c", "import sys;print(sys.executable)"], {
    encoding: "utf8",
  }).stdout.trim()
  fs.writeFileSync(
    wrapper,
    `#!${nativePython}
import json,pathlib,subprocess,sys
raw=sys.stdin.read();p=json.loads(raw);result=subprocess.run([sys.executable,*sys.argv[1:]],input=raw,text=True,capture_output=True)
if result.returncode==0 and sys.argv[2]=="hydrate" and len(p.get("paths",[]))==1000:
 root=pathlib.Path(sys.argv[sys.argv.index("--root")+1]);target=root/p["download_path"]
 with target.open("ab") as out:out.write(b"changed package")
sys.stdout.write(result.stdout);sys.stderr.write(result.stderr);sys.exit(result.returncode)
`,
    { mode: 0o700 },
  )
  const oldPython = process.env.RESEARCH_STORAGE_PYTHON
  try {
    process.env.RESEARCH_STORAGE_PYTHON = wrapper
    assert.throws(
      () =>
        storageAction(f.root, "hydrate", {
          bundle_id: f.bundle.id,
          download_path: f.bundle.local_path,
          paths: f.paths,
        }),
      (error) => error.hydration_partial.restored === 1000 && /hash mismatch/.test(error.message),
    )
  } finally {
    if (oldPython === undefined) delete process.env.RESEARCH_STORAGE_PYTHON
    else process.env.RESEARCH_STORAGE_PYTHON = oldPython
  }
  assert.equal(fs.existsSync(path.join(f.root, f.paths.at(-1))), false)
})

test("MCP collection storage cannot select explicit mutation lock recovery", async () => {
  const contract = moduleCatalog(["collection"]).modules[0].operations.find(
    (operation) => operation.id === "storage",
  )
  assert.equal(contract.inputSchema.properties.action.enum.includes("recover-mutation-lock"), false)
  await assert.rejects(
    () => executeModule({}, "collection", "storage", { action: "recover-mutation-lock" }),
    /action|enum|allowed/,
  )
})

function recoverCLI(f) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        new URL("../scripts/research-storage.mjs", import.meta.url).pathname,
        "recover-mutation-lock",
        "--root",
        f.root,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    )
    let stdout = "",
      stderr = ""
    child.stdout.on("data", (bytes) => {
      stdout += bytes
    })
    child.stderr.on("data", (bytes) => {
      stderr += bytes
    })
    child.on("error", reject)
    child.on("exit", (code) => resolve({ code, stdout, stderr }))
    child.stdin.end(JSON.stringify(f.parameters))
  })
}

test("concurrent explicit mutation recovery produces exactly one recovered owner receipt", async (t) => {
  const f = mutationFixture(t)
  const results = await Promise.all([recoverCLI(f), recoverCLI(f)])
  assert.equal(results.filter((r) => r.code === 0).length, 1)
  assert.equal(results.filter((r) => r.code !== 0).length, 1)
  const directory = path.join(f.root, ".storage/mutation-lock-recoveries")
  assert.equal(fs.readdirSync(directory).length, 1)
  assert.equal(fs.existsSync(f.lock), false)
})

test("killing the recovery guard owner releases its OS lock for explicit recovery", async (t) => {
  const f = mutationFixture(t),
    guard = path.join(f.root, ".storage/mutation-recovery.lock")
  const child = spawn(
    "python3",
    [
      "-u",
      "-c",
      `import fcntl,os,sys,time
f=open(sys.argv[1],"a+");fcntl.flock(f.fileno(),fcntl.LOCK_EX);print("ready",flush=True);time.sleep(60)`,
      guard,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  )
  t.after(() => {
    if (child.exitCode === null) child.kill("SIGKILL")
  })
  await once(child.stdout, "data")
  const inode = fs.statSync(guard).ino
  const held = await recoverCLI(f)
  assert.notEqual(held.code, 0)
  assert.deepEqual(fs.readFileSync(f.lock), f.bytes)
  const ended = once(child, "exit")
  child.kill("SIGKILL")
  await ended
  const result = await recoverCLI(f)
  assert.equal(result.code, 0, result.stderr)
  assert.equal(fs.statSync(guard).ino, inode)
  assert.equal(fs.existsSync(f.lock), false)
})

for (const alias of ["symlink", "hardlink"]) {
  test(`mutation recovery rejects a ${alias} recovery guard`, (t) => {
    const f = mutationFixture(t),
      guard = path.join(f.root, ".storage/mutation-recovery.lock")
    const target = path.join(f.root, "guard-target")
    fs.writeFileSync(target, "preserve guard")
    if (alias === "symlink") fs.symlinkSync(target, guard)
    else fs.linkSync(target, guard)
    assert.throws(() => storageAction(f.root, "recover-mutation-lock", f.parameters))
    assert.deepEqual(fs.readFileSync(f.lock), f.bytes)
    assert.equal(fs.readFileSync(target, "utf8"), "preserve guard")
  })
}

test("explicit mutation recovery rejects a symlinked root and changed policy root", (t) => {
  const f = mutationFixture(t),
    alias = f.root + "-alias"
  fs.symlinkSync(f.root, alias)
  t.after(() => fs.unlinkSync(alias))
  assert.throws(() => storageAction(alias, "recover-mutation-lock", f.parameters), /Symlink/)
  const policy = path.join(f.root, ".storage/policy.json")
  const saved = JSON.parse(fs.readFileSync(policy))
  fs.writeFileSync(policy, JSON.stringify({ ...saved, root: path.dirname(f.root) }))
  assert.throws(
    () => storageAction(f.root, "recover-mutation-lock", f.parameters),
    /policy root changed/,
  )
  assert.deepEqual(fs.readFileSync(f.lock), f.bytes)
})

test("small implicit hydration freezes exact pending paths before native execution", (t) => {
  const f = verified(t),
    relative = "research/local-ai/documents/a/body.bin"
  fs.unlinkSync(path.join(f.root, relative))
  const inserted = spawnSync(
    "python3",
    [
      "-c",
      `import sqlite3,sys
c=sqlite3.connect(sys.argv[1]);h=c.execute("SELECT sha256 FROM files WHERE path=?",(sys.argv[3],)).fetchone()[0]
c.execute("INSERT INTO requests VALUES(?,?,?,?,?,?)",("first",sys.argv[3],h,sys.argv[2],"2026-10-22T00:00:00+00:00","pending"));c.commit()`,
      path.join(f.root, ".storage/catalog.sqlite"),
      f.bundle.id,
      relative,
    ],
    { encoding: "utf8" },
  )
  assert.equal(inserted.status, 0, inserted.stderr)
  const wrapper = path.join(f.root, "pending-wrapper.py")
  const nativePython = spawnSync("python3", ["-c", "import sys;print(sys.executable)"], {
    encoding: "utf8",
  }).stdout.trim()
  fs.writeFileSync(
    wrapper,
    `#!${nativePython}
import json,pathlib,sqlite3,subprocess,sys
raw=sys.stdin.read();result=subprocess.run([sys.executable,*sys.argv[1:]],input=raw,text=True,capture_output=True)
if result.returncode==0 and sys.argv[2]=="pending":
 root=pathlib.Path(sys.argv[sys.argv.index("--root")+1]);c=sqlite3.connect(root/".storage/catalog.sqlite");row=c.execute("SELECT f.sha256,f.bytes,f.mode,f.mtime_ns,o.bundle_id FROM files f JOIN objects o ON f.sha256=o.sha256 LIMIT 1").fetchone()
 c.execute("INSERT INTO files(path,sha256,bytes,mode,mtime_ns) VALUES(?,?,?,?,?)",("research/local-ai/documents/late.bin",*row[:4]));c.execute("INSERT INTO requests VALUES(?,?,?,?,?,?)",("late","research/local-ai/documents/late.bin",row[0],row[4],"2026-10-22T00:00:01+00:00","pending"));c.commit();c.close()
sys.stdout.write(result.stdout);sys.stderr.write(result.stderr);sys.exit(result.returncode)
`,
    { mode: 0o700 },
  )
  const oldPython = process.env.RESEARCH_STORAGE_PYTHON
  let observed
  try {
    process.env.RESEARCH_STORAGE_PYTHON = wrapper
    observed = storageAction(f.root, "hydrate", {
      bundle_id: f.bundle.id,
      download_path: f.bundle.local_path,
    })
  } finally {
    if (oldPython === undefined) delete process.env.RESEARCH_STORAGE_PYTHON
    else process.env.RESEARCH_STORAGE_PYTHON = oldPython
  }
  assert.deepEqual(observed.paths, [relative])
  assert.equal(observed.restored, 1)
  assert.equal(fs.existsSync(path.join(f.root, "research/local-ai/documents/late.bin")), false)
  assert.deepEqual(
    storageAction(f.root, "pending").downloads.map((row) => row.path),
    ["research/local-ai/documents/late.bin"],
  )
})

test("native storage receives complete large input through a private regular descriptor and cleans it", (t) => {
  const f = largeHydrationFixture(t),
    temporary = path.join(f.root, "transport-temp")
  fs.mkdirSync(temporary, { mode: 0o700 })
  const wrapper = path.join(f.root, "regular-stdin.py")
  const nativePython = spawnSync("python3", ["-c", "import sys;print(sys.executable)"], {
    encoding: "utf8",
  }).stdout.trim()
  fs.writeFileSync(
    wrapper,
    `#!${nativePython}
import json,os,pathlib,runpy,stat,sys
assert stat.S_ISREG(os.fstat(0).st_mode),"native stdin must have a definite regular-file EOF"
assert os.lseek(0,0,os.SEEK_CUR)==0
directories=list(pathlib.Path(os.environ["TMPDIR"]).iterdir());assert len(directories)==1
d=directories[0];p=d/"input.json";assert not d.is_symlink() and not p.is_symlink()
assert stat.S_IMODE(d.stat().st_mode)==0o700 and stat.S_IMODE(p.stat().st_mode)==0o600
assert p.stat().st_ino==os.fstat(0).st_ino
sys.argv=sys.argv[1:];runpy.run_path(sys.argv[0],run_name="__main__")
`,
    { mode: 0o700 },
  )
  const oldPython = process.env.RESEARCH_STORAGE_PYTHON,
    oldTemporary = process.env.TMPDIR
  try {
    process.env.RESEARCH_STORAGE_PYTHON = wrapper
    process.env.TMPDIR = temporary
    const result = storageAction(f.root, "hydrate", {
      bundle_id: f.bundle.id,
      download_path: f.bundle.local_path,
      paths: f.paths,
      transport_probe: "large complete JSON input ".repeat(10000),
    })
    assert.equal(result.restored, 1001)
    assert.deepEqual(result.paths, f.paths)
    assert.deepEqual(fs.readdirSync(temporary), [])
    assert.throws(() =>
      storageAction(f.root, "hydrate", {
        bundle_id: f.bundle.id,
        download_path: "wrong.zip",
        paths: f.paths.slice(0, 1),
      }),
    )
    assert.deepEqual(fs.readdirSync(temporary), [])
  } finally {
    if (oldPython === undefined) delete process.env.RESEARCH_STORAGE_PYTHON
    else process.env.RESEARCH_STORAGE_PYTHON = oldPython
    if (oldTemporary === undefined) delete process.env.TMPDIR
    else process.env.TMPDIR = oldTemporary
  }
})

test("native storage failures preserve original stdout and stderr through the CLI", (t) => {
  const f = fixture(t),
    wrapper = path.join(f.root, "failed-native.py")
  const nativePython = spawnSync("python3", ["-c", "import sys;print(sys.executable)"], {
    encoding: "utf8",
  }).stdout.trim()
  fs.writeFileSync(
    wrapper,
    `#!${nativePython}
import sys
print("preserved native stdout")
print("preserved native stderr",file=sys.stderr)
sys.exit(7)
`,
    { mode: 0o700 },
  )
  const oldPython = process.env.RESEARCH_STORAGE_PYTHON
  try {
    process.env.RESEARCH_STORAGE_PYTHON = wrapper
    assert.throws(
      () => storageAction(f.root, "status"),
      (error) => {
        assert.equal(error.status, 7)
        assert.equal(error.storage_failure.stdout, "preserved native stdout\n")
        assert.equal(error.storage_failure.stderr, "preserved native stderr\n")
        return true
      },
    )
    const input = path.join(f.root, "diagnostic-input.json")
    fs.writeFileSync(input, "{}")
    const result = spawnSync(
      process.execPath,
      [
        new URL("../scripts/research-storage.mjs", import.meta.url).pathname,
        "status",
        "--root",
        f.root,
        "--input",
        input,
      ],
      { encoding: "utf8", env: { ...process.env } },
    )
    assert.equal(result.status, 1)
    const diagnostic = result.stderr
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .find((value) => value?.schema === "research-storage-native-failure/v1")
    assert.equal(diagnostic.status, 7)
    assert.equal(diagnostic.stdout, "preserved native stdout\n")
    assert.equal(diagnostic.stderr, "preserved native stderr\n")
  } finally {
    if (oldPython === undefined) delete process.env.RESEARCH_STORAGE_PYTHON
    else process.env.RESEARCH_STORAGE_PYTHON = oldPython
  }
})

function storageWorkerFixture(t, { eviction = false } = {}) {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "storage-module-worker-")))
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }))
  fs.mkdirSync(path.join(repo, "data"))
  for (const name of [
    "research-source-channels.json",
    "research-model-policy.json",
    "research-model-policy-codex.json",
  ]) {
    fs.copyFileSync(new URL("../data/" + name, import.meta.url), path.join(repo, "data", name))
  }
  const root = path.join(repo, ".local")
  const relative = "research/local-ai/documents/worker-original/body.bin"
  const body = Buffer.from("synthetic module storage evidence.\n".repeat(4000))
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true })
  fs.writeFileSync(path.join(root, relative), body)
  const ctx = moduleContext({ repo, root: ".local/research/local-ai" })
  if (eviction) {
    storageAction(root, "prepare", { parent_id: "synthetic-parent" })
    const bundle = storageAction(root, "pending").uploads[0]
    storageAction(root, "verify", {
      bundle_id: bundle.id,
      metadata: {
        id: "synthetic-file",
        title: bundle.name,
        mime_type: "application/zip",
        size: String(bundle.bytes),
        parent_ids: ["synthetic-parent"],
        modified_time: new Date().toISOString(),
        shared: false,
      },
      observed_at: new Date().toISOString(),
      download_path: bundle.local_path,
    })
    storageAction(root, "enable")
  }
  return { repo, root, ctx, body, relative }
}

async function storageWorkerJob(t, f, action) {
  const jobId = "module-storage-" + action + "-" + crypto.randomUUID()
  const lock = path.join(f.ctx.root, "locks/module-worker-" + jobId + ".json")
  await submitModuleJob(
    f.ctx,
    "collection",
    "storage",
    { action, ...(action === "evict" ? { cache_bytes: 0 } : {}) },
    { jobId },
  )
  let owner, state
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    state = readJSON(f.ctx.root, "module-jobs/" + jobId + "/state.json")
    if (state?.state === "running" && fs.existsSync(lock))
      owner = JSON.parse(fs.readFileSync(lock, "utf8"))
    if (["completed", "failed"].includes(state?.state) && !fs.existsSync(lock)) break
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.ok(["completed", "failed"].includes(state?.state), "module worker must finish")
  assert.ok(owner && Number.isInteger(owner.pid), "observe the actual worker-owned lock")
  assert.equal(owner.pid, state.pid)
  assert.equal(fs.existsSync(lock), false, "worker must release its own lock normally")
  const exitDeadline = Date.now() + 5000
  let alive = true
  while (alive && Date.now() < exitDeadline) {
    try {
      process.kill(state.pid, 0)
    } catch (error) {
      if (error.code === "ESRCH") alive = false
      else throw error
    }
    if (alive) await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.equal(alive, false, "owned worker must exit before fixture cleanup")
  const result = state.result ? readJSON(f.ctx.root, state.result.path) : null
  const input = readJSON(f.ctx.root, "module-jobs/" + jobId + "/input.json")
  assert.equal(Object.hasOwn(input.parameters, "ignore_pid"), false)
  assert.equal(Object.hasOwn(result?.data || {}, "ignore_pid"), false)
  return { state, result, jobId, lockRelative: path.relative(f.root, lock) }
}

async function foreignStorageOwner(t, f) {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })
  await once(child, "spawn")
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM")
      await once(child, "exit")
    }
  })
  const file = path.join(f.ctx.root, "locks/module-worker-foreign.json")
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const bytes = Buffer.from(
    JSON.stringify({ pid: child.pid, owner: "synthetic-foreign-live" }) + "\n",
  )
  fs.writeFileSync(file, bytes)
  return { child, file, bytes, relative: path.relative(f.root, file) }
}

for (const action of ["prepare", "evict"]) {
  test("collection storage worker: " + action + " excludes only its own actual lock", async (t) => {
    const f = storageWorkerFixture(t, { eviction: action === "evict" })
    const { state, result } = await storageWorkerJob(t, f, action)
    assert.equal(state.state, "completed", state.error)
    if (action === "prepare") {
      const uploads = storageAction(f.root, "pending").uploads
      assert.equal(result.data.inventoried_files, 1)
      assert.equal(result.data.new_packages, 1)
      assert.equal(storageAction(f.root, "status").files, 1)
      assert.equal(uploads.length, 1)
      const bundle = uploads[0]
      const observed = spawnSync(
        process.env.RESEARCH_STORAGE_PYTHON || "python3",
        [
          "-c",
          "import zipfile,hashlib,json,sys;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()}))",
          path.join(f.root, bundle.local_path),
        ],
        { encoding: "utf8", timeout: 10000 },
      )
      assert.equal(observed.status, 0, observed.stderr)
      assert.deepEqual(JSON.parse(observed.stdout), { ["objects/" + hash(f.body)]: hash(f.body) })
      assert.deepEqual(fs.readFileSync(path.join(f.root, f.relative)), f.body)
    } else {
      assert.equal(result.data.evicted, 1)
      assert.equal(fs.existsSync(path.join(f.root, f.relative)), false)
    }
  })

  test("collection storage worker: " + action + " preserves a different live owner", async (t) => {
    const f = storageWorkerFixture(t, { eviction: action === "evict" })
    const other = await foreignStorageOwner(t, f)
    const { state, result, lockRelative } = await storageWorkerJob(t, f, action)
    if (action === "prepare") {
      assert.equal(state.state, "failed")
      assert.match(state.error, /Active native locks/)
      assert.ok(state.error.includes(other.relative))
      assert.equal(state.error.includes(lockRelative), false)
    } else {
      assert.equal(state.state, "completed", state.error)
      assert.equal(result.data.evicted, 0)
      assert.ok(result.data.held_by_active_locks.includes(other.relative))
      assert.equal(result.data.held_by_active_locks.includes(lockRelative), false)
    }
    assert.deepEqual(fs.readFileSync(other.file), other.bytes)
    assert.deepEqual(fs.readFileSync(path.join(f.root, f.relative)), f.body)
    process.kill(other.child.pid, 0)
  })

  test(
    "collection storage worker: " + action + " preserves an unreadable unknown owner",
    async (t) => {
      const f = storageWorkerFixture(t, { eviction: action === "evict" })
      const file = path.join(f.ctx.root, "locks/module-worker-unreadable.json")
      const relative = path.relative(f.root, file)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      const bytes = Buffer.from("{unreadable synthetic owner\n")
      fs.writeFileSync(file, bytes)
      const { state, result, lockRelative } = await storageWorkerJob(t, f, action)
      if (action === "prepare") {
        assert.equal(state.state, "failed")
        assert.ok(state.error.includes(relative))
        assert.equal(state.error.includes(lockRelative), false)
      } else {
        assert.equal(state.state, "completed", state.error)
        assert.equal(result.data.evicted, 0)
        assert.ok(result.data.held_by_active_locks.includes(relative))
        assert.equal(result.data.held_by_active_locks.includes(lockRelative), false)
      }
      assert.deepEqual(fs.readFileSync(file), bytes)
      assert.deepEqual(fs.readFileSync(path.join(f.root, f.relative)), f.body)
    },
  )

  test(
    "collection storage worker: " + action + " cannot trust forged context ownership",
    async (t) => {
      const f = storageWorkerFixture(t, { eviction: action === "evict" })
      const other = await foreignStorageOwner(t, f)
      const forged = {
        ...f.ctx,
        pid: other.child.pid,
        worker_pid: other.child.pid,
        owner_pid: other.child.pid,
        owner: { pid: other.child.pid },
      }
      if (action === "prepare")
        await assert.rejects(
          executeModule(forged, "collection", "storage", { action }),
          /Active native locks/,
        )
      else {
        const result = await executeModule(forged, "collection", "storage", {
          action,
          cache_bytes: 0,
        })
        assert.equal(result.evicted, 0)
        assert.ok(result.held_by_active_locks.includes(other.relative))
      }
      assert.deepEqual(fs.readFileSync(other.file), other.bytes)
      assert.deepEqual(fs.readFileSync(path.join(f.root, f.relative)), f.body)
    },
  )
}

test("collection storage worker: caller PID and owner fields remain outside the public schema", async (t) => {
  const f = storageWorkerFixture(t)
  storageAction(f.root, "status")
  const before = fs.readFileSync(path.join(f.root, ".storage/catalog.sqlite"))
  for (const action of ["prepare", "evict"]) {
    for (const field of ["ignore_pid", "pid", "worker_pid", "owner_pid", "owner"]) {
      await assert.rejects(
        executeModule(f.ctx, "collection", "storage", { action, [field]: process.pid }),
        new RegExp(field),
      )
    }
  }
  assert.deepEqual(fs.readFileSync(path.join(f.root, ".storage/catalog.sqlite")), before)
  assert.deepEqual(fs.readFileSync(path.join(f.root, f.relative)), f.body)
})

for (const action of ["prepare", "evict"]) {
  test(
    "collection storage worker: " +
      action +
      " fails closed on malformed PID and nonobject owner records",
    async (t) => {
      for (const [label, record] of [
        ["missing", {}],
        ["null", { pid: null }],
        ["string", { pid: "12345" }],
        ["bool", { pid: true }],
        ["zero", { pid: 0 }],
        ["negative", { pid: -1 }],
        ["array", []],
        ["number", 7],
        ["null-record", null],
      ]) {
        await t.test(label, async (t) => {
          const f = storageWorkerFixture(t, { eviction: action === "evict" })
          const file = path.join(f.ctx.root, "locks/module-worker-unknown-" + label + ".json")
          const relative = path.relative(f.root, file)
          fs.mkdirSync(path.dirname(file), { recursive: true })
          const bytes = Buffer.from(JSON.stringify(record) + "\n")
          fs.writeFileSync(file, bytes)
          const { state, result, lockRelative } = await storageWorkerJob(t, f, action)
          if (action === "prepare") {
            assert.equal(state.state, "failed")
            assert.match(state.error, /Active native locks/)
            assert.ok(state.error.includes(relative))
            assert.equal(state.error.includes(lockRelative), false)
          } else {
            assert.equal(state.state, "completed", state.error)
            assert.equal(result.data.evicted, 0)
            assert.ok(result.data.held_by_active_locks.includes(relative))
            assert.equal(result.data.held_by_active_locks.includes(lockRelative), false)
          }
          assert.deepEqual(fs.readFileSync(file), bytes)
          assert.deepEqual(fs.readFileSync(path.join(f.root, f.relative)), f.body)
        })
      }
    },
  )
}

for (const action of ["prepare", "evict"]) {
  test("collection storage worker: " + action + " preserves stale ESRCH run scopes", async (t) => {
    const f = storageWorkerFixture(t, { eviction: action === "evict" })
    const heldPath = "research/local-ai/runs/stale-held/original.bin"
    const heldBody = Buffer.from("preserved stale run evidence.\n".repeat(3000))
    fs.mkdirSync(path.dirname(path.join(f.root, heldPath)), { recursive: true })
    fs.writeFileSync(path.join(f.root, heldPath), heldBody)
    if (action === "evict") {
      storageAction(f.root, "prepare", { parent_id: "synthetic-parent" })
      for (const bundle of storageAction(f.root, "pending").uploads) {
        storageAction(f.root, "verify", {
          bundle_id: bundle.id,
          metadata: {
            id: "synthetic-stale-file",
            title: bundle.name,
            mime_type: "application/zip",
            size: String(bundle.bytes),
            parent_ids: ["synthetic-parent"],
            modified_time: new Date().toISOString(),
            shared: false,
          },
          observed_at: new Date().toISOString(),
          download_path: bundle.local_path,
        })
      }
    }
    const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" })
    await once(child, "exit")
    assert.throws(
      () => process.kill(child.pid, 0),
      (error) => error.code === "ESRCH",
    )
    const file = path.join(f.ctx.root, "locks/run-stale-held.json")
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const bytes = Buffer.from(
      JSON.stringify({ pid: child.pid, owner: "synthetic-exited-owner" }) + "\n",
    )
    fs.writeFileSync(file, bytes)
    const { state, result } = await storageWorkerJob(t, f, action)
    assert.equal(state.state, "completed", state.error)
    if (action === "prepare") assert.equal(result.data.inventoried_files, 1)
    else {
      assert.equal(result.data.evicted, 1)
      assert.equal(fs.existsSync(path.join(f.root, f.relative)), false)
    }
    assert.deepEqual(fs.readFileSync(file), bytes)
    assert.deepEqual(fs.readFileSync(path.join(f.root, heldPath)), heldBody)
  })
}
