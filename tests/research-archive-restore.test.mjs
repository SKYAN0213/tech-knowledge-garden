import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { archiveManifest, packageResearchArchive } from "../scripts/research/archive.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"
import { sourceId, sourceVersionId, sha256 } from "../scripts/research/contracts.mjs"

const script = path.resolve("scripts/research/package-archive.py")

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ordinary-restore-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const body = Buffer.from("Controlled source fixture"),
    id = sourceId("https://example.org/source"),
    hash = sha256(body),
    sourcePath = `documents/${id}/${hash}/body.bin`,
    evidencePath = "runs/evidence/readback.json"
  atomicWrite(root, sourcePath, body)
  atomicWrite(root, evidencePath, { controlled_fixture: true, published: false })
  atomicWrite(root, "runs/evidence/documents.json", [
    {
      source_id: id,
      source_version_id: sourceVersionId(id, hash),
      body_sha256: hash,
      body_path: sourcePath,
      fetch_status: "captured",
    },
  ])
  const manifest = archiveManifest(root, "evidence")
  atomicWrite(root, "runs/evidence/archive-manifest.json", manifest)
  // Retain only the explicitly pinned manifest; source caches are not needed.
  atomicWrite(
    root,
    "original-manifest.json",
    fs.readFileSync(path.join(root, "runs/evidence/archive-manifest.json")),
  )
  const receipt = packageResearchArchive(root, "evidence")
  fs.rmSync(path.join(root, "runs"), { recursive: true })
  fs.rmSync(path.join(root, "documents"), { recursive: true })
  return { root, manifest, receipt, sourcePath, body, evidencePath }
}

function restore(
  f,
  { destination = "restored", manifest = "original-manifest.json", hash = f.receipt.sha256 } = {},
) {
  return spawnSync(
    "python3",
    [
      script,
      "--root",
      f.root,
      "--package",
      f.receipt.path,
      "--restore-to",
      destination,
      "--expected-sha256",
      hash,
      ...(manifest === null ? [] : ["--source-manifest", manifest]),
    ],
    { encoding: "utf8" },
  )
}

function rewriteZip(f, { bodyPath, body, packedPatch = {}, extra = false } = {}) {
  const result = spawnSync(
    "python3",
    [
      "-c",
      `
import json,sys,zipfile,os
x=json.load(sys.stdin)
p=x['path']
with zipfile.ZipFile(p) as z: files={n:z.read(n) for n in z.namelist()}
m=next(n for n in files if n.endswith('/archive-package-manifest.json'))
packed=json.loads(files[m]); packed.update(x['packedPatch'])
files[m]=(json.dumps(packed)+'\\n').encode()
if x.get('bodyPath'): files[x['bodyPath']]=x['body'].encode()
if x['extra']: files['Research/LocalAI/unlisted.txt']=b'unlisted'
with zipfile.ZipFile(p+'.tmp','w',zipfile.ZIP_DEFLATED) as z:
 for n,b in files.items(): z.writestr(n,b)
os.replace(p+'.tmp',p)
`,
    ],
    {
      encoding: "utf8",
      input: JSON.stringify({
        path: path.join(f.root, f.receipt.path),
        bodyPath,
        body,
        packedPatch,
        extra,
      }),
    },
  )
  assert.equal(result.status, 0, result.stderr)
  return sha256(fs.readFileSync(path.join(f.root, f.receipt.path)))
}

test("ordinary archive restores exact original sources and evidence after caches are removed without promoting dependency closure", (t) => {
  const f = fixture(t),
    result = restore(f)
  assert.equal(result.status, 0, result.stderr)
  const receipt = JSON.parse(result.stdout)
  assert.equal(receipt.archive_schema, "research-archive/v1")
  assert.equal(receipt.dependency_closed, false)
  assert.equal(receipt.candidate_published, false)
  assert.equal(receipt.drive_verified, false)
  assert.equal(receipt.network_used, false)
  assert.deepEqual(receipt.bound_runs, ["evidence"])
  assert.equal(
    receipt.source_manifest_sha256,
    sha256(fs.readFileSync(path.join(f.root, "original-manifest.json"))),
  )
  assert.deepEqual(fs.readFileSync(path.join(f.root, "restored", f.sourcePath)), f.body)
  for (const item of f.manifest.files)
    assert.equal(sha256(fs.readFileSync(path.join(f.root, "restored", item.path))), item.sha256)
  assert.notEqual(restore(f).status, 0)
})

test("ordinary restore requires exact original manifest and package SHA before writing", (t) => {
  const f = fixture(t)
  for (const options of [{ manifest: null }, { hash: "0".repeat(64) }]) {
    assert.notEqual(restore(f, options).status, 0)
    assert.equal(fs.existsSync(path.join(f.root, "restored")), false)
  }
  atomicWrite(f.root, "original-manifest.json", { ...f.manifest, observed_at: "changed" })
  assert.match(restore(f).stderr, /Archive source manifest mismatch/)
  assert.equal(fs.existsSync(path.join(f.root, "restored")), false)
})

test("ordinary restore rejects changed run identity, file inventory, bytes and unlisted members before writing", (t) => {
  for (const change of [
    { packedPatch: { run_id: "other" } },
    { packedPatch: { files: [] } },
    { bodyPath: "Research/LocalAI/runs/evidence/readback.json", body: "changed" },
    { extra: true },
  ]) {
    const f = fixture(t),
      hash = rewriteZip(f, change)
    assert.notEqual(restore(f, { hash }).status, 0)
    assert.equal(fs.existsSync(path.join(f.root, "restored")), false)
  }
})

test("ordinary restore rejects public, traversal and cross-run paths even with consistent manifest hashes", (t) => {
  for (const patch of [
    { public: true },
    { path: "runs/evidence/../../escaped" },
    { path: "runs/other/readback.json" },
  ]) {
    const f = fixture(t)
    const manifest = {
      ...f.manifest,
      files: f.manifest.files.map((item) =>
        item.path === f.evidencePath ? { ...item, ...patch } : item,
      ),
    }
    atomicWrite(f.root, "original-manifest.json", manifest)
    const hash = rewriteZip(f, {
      packedPatch: {
        files: manifest.files,
        source_manifest_sha256: sha256(
          fs.readFileSync(path.join(f.root, "original-manifest.json")),
        ),
      },
    })
    assert.notEqual(restore(f, { hash }).status, 0)
    assert.equal(fs.existsSync(path.join(f.root, "restored")), false)
  }
})

test("ordinary restore cannot follow a manifest symlink or use manifest-only creation arguments", (t) => {
  const f = fixture(t)
  fs.symlinkSync(
    path.join(f.root, "original-manifest.json"),
    path.join(f.root, "linked-manifest.json"),
  )
  assert.notEqual(restore(f, { manifest: "linked-manifest.json" }).status, 0)
  const result = spawnSync(
    "python3",
    [script, "--root", f.root, "--run", "evidence", "--source-manifest", "original-manifest.json"],
    { encoding: "utf8" },
  )
  assert.notEqual(result.status, 0)
  assert.equal(fs.existsSync(path.join(f.root, "restored")), false)
})
