import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import {
  checkRetiredWorkspaceFences,
  assertRetiredWorkspaceFences,
} from "../scripts/research/retired-workspace-fence.mjs"
import { moduleContext, submitModuleJob } from "../scripts/research/module-runtime.mjs"

const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex")

function fixture(t) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tkg-retired-fence-")))
  const volume = path.join(base, "volume")
  const retired = path.join(volume, "old")
  const current = path.join(base, "current")
  const locks = path.join(retired, ".local/research/local-ai/locks")
  const storage = path.join(retired, ".local/.storage")
  fs.mkdirSync(locks, { recursive: true })
  fs.mkdirSync(storage, { recursive: true })
  fs.mkdirSync(current)
  for (const name of ["catalog.sqlite", "catalog.sqlite-wal", "catalog.sqlite-shm"])
    fs.writeFileSync(path.join(storage, name), name === "catalog.sqlite-wal" ? "" : "fixture")
  const protect = () => {
    for (const name of ["catalog.sqlite", "catalog.sqlite-wal", "catalog.sqlite-shm"])
      fs.chmodSync(path.join(storage, name), 0o444)
    fs.chmodSync(storage, 0o555)
    fs.chmodSync(locks, 0o555)
  }
  protect()
  t.after(() => {
    for (const directory of [locks, storage])
      if (fs.existsSync(directory) && !fs.lstatSync(directory).isSymbolicLink())
        fs.chmodSync(directory, 0o755)
    fs.rmSync(base, { recursive: true, force: true })
  })
  return {
    base,
    volume,
    retired,
    current,
    locks,
    storage,
    protect,
    config: {
      schema: "research-retired-workspaces/v1",
      workspaces: [{ volume, workspace: retired }],
    },
  }
}

test("a protected retired workspace is checked without changing its files", (t) => {
  const f = fixture(t)
  const before = fs.statSync(path.join(f.storage, "catalog.sqlite")).mtimeMs
  assert.deepEqual(checkRetiredWorkspaceFences(f.config, f.current), {
    status: "protected",
    checked: 1,
    unmounted: 0,
  })
  assert.equal(fs.statSync(path.join(f.storage, "catalog.sqlite")).mtimeMs, before)
})

test("writable locks or catalog, missing sidecars and a nonempty WAL fail closed", (t) => {
  const f = fixture(t)
  fs.chmodSync(f.locks, 0o755)
  assert.throws(() => checkRetiredWorkspaceFences(f.config, f.current), /writable/i)
  f.protect()
  const db = path.join(f.storage, "catalog.sqlite")
  fs.chmodSync(db, 0o644)
  assert.throws(() => checkRetiredWorkspaceFences(f.config, f.current), /writable/i)
  f.protect()
  fs.chmodSync(f.storage, 0o755)
  const wal = path.join(f.storage, "catalog.sqlite-wal")
  fs.chmodSync(wal, 0o644)
  fs.writeFileSync(wal, "uncheckpointed")
  f.protect()
  assert.throws(() => checkRetiredWorkspaceFences(f.config, f.current), /WAL/i)
  fs.chmodSync(f.storage, 0o755)
  fs.chmodSync(wal, 0o644)
  fs.writeFileSync(wal, "")
  fs.chmodSync(wal, 0o444)
  fs.unlinkSync(path.join(f.storage, "catalog.sqlite-shm"))
  fs.chmodSync(f.storage, 0o555)
  assert.throws(() => checkRetiredWorkspaceFences(f.config, f.current), /missing/i)
})

test("only an unavailable volume is tolerated; a missing or symlinked workspace is rejected", (t) => {
  const f = fixture(t)
  const absentVolume = path.join(f.base, "unmounted")
  assert.deepEqual(
    checkRetiredWorkspaceFences(
      {
        schema: "research-retired-workspaces/v1",
        workspaces: [{ volume: absentVolume, workspace: path.join(absentVolume, "old") }],
      },
      f.current,
    ),
    { status: "protected", checked: 0, unmounted: 1 },
  )
  assert.throws(
    () =>
      checkRetiredWorkspaceFences(
        {
          schema: "research-retired-workspaces/v1",
          workspaces: [{ volume: f.volume, workspace: path.join(f.volume, "missing") }],
        },
        f.current,
      ),
    /missing/i,
  )
  const alias = path.join(f.volume, "alias")
  fs.symlinkSync(f.retired, alias, "dir")
  assert.throws(
    () =>
      checkRetiredWorkspaceFences(
        {
          schema: "research-retired-workspaces/v1",
          workspaces: [{ volume: f.volume, workspace: alias }],
        },
        f.current,
      ),
    /symlink|canonical/i,
  )
})

test("live or unknown retired lock owners and a storage mutation lock fail closed", (t) => {
  const f = fixture(t)
  fs.chmodSync(f.locks, 0o755)
  const lock = path.join(f.locks, "unit.json")
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid }))
  fs.chmodSync(f.locks, 0o555)
  assert.throws(() => checkRetiredWorkspaceFences(f.config, f.current), /active/i)
  fs.writeFileSync(lock, JSON.stringify({ pid: 2147483647 }))
  assert.equal(checkRetiredWorkspaceFences(f.config, f.current).status, "protected")
  fs.writeFileSync(lock, "{}")
  assert.throws(() => checkRetiredWorkspaceFences(f.config, f.current), /unknown/i)
  fs.chmodSync(f.locks, 0o755)
  fs.unlinkSync(lock)
  fs.chmodSync(f.locks, 0o555)
  fs.chmodSync(f.storage, 0o755)
  fs.writeFileSync(path.join(f.storage, "mutation.lock"), "preserve")
  fs.chmodSync(f.storage, 0o555)
  assert.throws(() => checkRetiredWorkspaceFences(f.config, f.current), /mutation lock/i)
})

test("configuration cannot target the active workspace or use an invalid contract", (t) => {
  const f = fixture(t)
  assert.throws(
    () =>
      checkRetiredWorkspaceFences(
        { ...f.config, workspaces: [{ volume: f.base, workspace: f.current }] },
        f.current,
      ),
    /active|current/i,
  )
  assert.throws(
    () => checkRetiredWorkspaceFences({ schema: "other", workspaces: [] }, f.current),
    /configuration/i,
  )
})

test("an installed release must retain the exact guard configuration bound by its manifest", (t) => {
  const f = fixture(t)
  const runtime = path.join(f.base, "runtime")
  const configPath = "data/research-retired-workspaces.json"
  const manifestPath = ".local/.storage/releases/test/manifest.json"
  fs.mkdirSync(path.join(runtime, "data"), { recursive: true })
  fs.mkdirSync(path.join(runtime, path.dirname(manifestPath)), { recursive: true })
  const configBytes = Buffer.from(JSON.stringify(f.config))
  fs.writeFileSync(path.join(runtime, configPath), configBytes)
  const manifestBytes = Buffer.from(
    JSON.stringify({
      schema: "research-development-release/v1",
      release_id: "test",
      files: [{ path: configPath, sha256: sha(configBytes) }],
    }),
  )
  fs.writeFileSync(path.join(runtime, manifestPath), manifestBytes)
  const sealPath = path.join(runtime, ".local/.storage/runtime-release.json")
  const seal = {
    schema: "research-runtime-installation/v1",
    repo_root: runtime,
    release_id: "test",
    release_manifest: { path: manifestPath, sha256: sha(manifestBytes) },
  }
  fs.writeFileSync(sealPath, JSON.stringify(seal))
  assert.equal(assertRetiredWorkspaceFences(runtime, f.current).status, "protected")
  fs.writeFileSync(sealPath, JSON.stringify({ ...seal, repo_root: f.current }))
  assert.throws(() => assertRetiredWorkspaceFences(runtime, f.current), /seal identity/i)
  fs.writeFileSync(sealPath, JSON.stringify(seal))
  fs.writeFileSync(path.join(runtime, "data/alternate.json"), configBytes)
  fs.unlinkSync(path.join(runtime, configPath))
  fs.symlinkSync(path.join(runtime, "data/alternate.json"), path.join(runtime, configPath))
  assert.throws(() => assertRetiredWorkspaceFences(runtime, f.current), /canonical|symlink/i)
  fs.unlinkSync(path.join(runtime, configPath))
  fs.writeFileSync(path.join(runtime, configPath), configBytes)
  fs.writeFileSync(path.join(runtime, configPath), "{}")
  assert.throws(() => assertRetiredWorkspaceFences(runtime, f.current), /manifest|configuration/i)
  fs.unlinkSync(path.join(runtime, configPath))
  assert.throws(() => assertRetiredWorkspaceFences(runtime, f.current), /missing|configuration/i)
})

test("standalone storage, Drive and publication commands fail before writes without the fence", (t) => {
  const f = fixture(t)
  fs.cpSync(
    fileURLToPath(new URL("../scripts/", import.meta.url)),
    path.join(f.current, "scripts"),
    {
      recursive: true,
    },
  )
  fs.cpSync(fileURLToPath(new URL("../data/", import.meta.url)), path.join(f.current, "data"), {
    recursive: true,
  })
  fs.cpSync(fileURLToPath(new URL("../web/", import.meta.url)), path.join(f.current, "web"), {
    recursive: true,
  })
  fs.writeFileSync(
    path.join(f.current, "data/research-retired-workspaces.json"),
    JSON.stringify(f.config),
  )
  fs.symlinkSync(
    fileURLToPath(new URL("../node_modules/", import.meta.url)),
    path.join(f.current, "node_modules"),
    "dir",
  )
  fs.chmodSync(f.locks, 0o755)
  const commands = [
    ["scripts/research-storage.mjs", "prepare", "--root", path.join(f.current, ".local")],
    ["scripts/research-drive.mjs", "auth", "logout", "--root", path.join(f.current, ".local")],
    ["scripts/research-authoring.mjs", "write-session"],
    ["scripts/research-deliver.mjs", "--run", "unit-delivery"],
    ["scripts/research-publication.mjs", "bind", "--run", "unit-delivery"],
    ["scripts/publish.mjs"],
  ]
  for (const args of commands) {
    const result = spawnSync(process.execPath, args, {
      cwd: f.current,
      input: "{}",
      encoding: "utf8",
    })
    assert.equal(result.status, 1, `${args[0]}: ${result.stderr}`)
    assert.match(result.stderr, /Retired workspace fence.*writable/i)
  }
  assert.equal(fs.existsSync(path.join(f.current, ".local")), false)
})

test("module submission blocks an unprotected old root before creating a job and resumes after fencing", async (t) => {
  const f = fixture(t)
  const sourceData = fileURLToPath(new URL("../data/", import.meta.url))
  fs.mkdirSync(path.join(f.current, "data"))
  fs.mkdirSync(path.join(f.current, "vault"))
  for (const name of fs.readdirSync(sourceData).filter((name) => /^research-.*\.json$/.test(name)))
    fs.copyFileSync(path.join(sourceData, name), path.join(f.current, "data", name))
  fs.writeFileSync(
    path.join(f.current, "data/research-retired-workspaces.json"),
    JSON.stringify(f.config),
  )
  const ctx = moduleContext({ repo: f.current })
  fs.chmodSync(f.locks, 0o755)
  await assert.rejects(
    submitModuleJob(ctx, "collection", "inventory", {}, { jobId: "module-fence-unit" }),
    (error) => error.code === "RETIRED_ROOT_FENCE_MISSING",
  )
  assert.equal(fs.existsSync(path.join(ctx.root, "module-jobs/module-fence-unit")), false)
  f.protect()
  const result = await submitModuleJob(
    ctx,
    "collection",
    "inventory",
    {},
    {
      jobId: "module-fence-unit",
      background: false,
    },
  )
  assert.equal(result.state, "completed")
})
