import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { storageAction } from "../scripts/research/cold-storage.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
const native = fileURLToPath(new URL("../scripts/research/cold-storage.py", import.meta.url))
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-delta-test-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  storageAction(root, "prepare")
  const write = (relative, body) => {
    const f = path.join(root, relative)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, body)
    return relative
  }
  const read = (ref) => JSON.parse(fs.readFileSync(path.join(root, ref.path)))
  return { root, write, read }
}
function verifyBundle(f, bundle) {
  const actual = storageAction(f.root, "status", { bundle_id: bundle.bundle_id }).bundle
  return storageAction(f.root, "verify", {
    bundle_id: actual.id,
    download_path: actual.local_path,
    observed_at: new Date().toISOString(),
    metadata: {
      id: "unit-drive-file",
      name: actual.name,
      size: String(actual.bytes),
      mimeType: "application/zip",
      parents: ["unit-parent"],
      shared: false,
      modifiedTime: new Date().toISOString(),
    },
  })
}
test("full audit freezes all aliases once, waits for raw verification and finalizes the same immutable receipt", (t) => {
  const f = fixture(t)
  f.write("documents/a/body.bin", "Original immutable evidence")
  f.write("documents/b/body.bin", "Original immutable evidence")
  const input = { run_id: "full", parent_id: "unit-parent" }
  const first = storageAction(f.root, "prepare-full", input)
  assert.equal(first.status, "waiting_for_storage")
  assert.equal(first.files, 2)
  assert.equal(first.bundles.length, 1)
  assert.equal(f.read(first.manifest).mode, "full_audit")
  verifyBundle(f, first.bundles[0])
  assert.equal(
    storageAction(f.root, "archive-status", { run_id: "full" }).status,
    "verification_ready",
  )
  const completed = storageAction(f.root, "prepare-full", input)
  assert.equal(completed.status, "verified")
  assert.ok(completed.receipt.sha256)
  assert.deepEqual(storageAction(f.root, "prepare-full", input).receipt, completed.receipt)
  assert.throws(
    () => storageAction(f.root, "prepare-full", { ...input, parent_id: "changed" }),
    /Immutable/,
  )
})
test("delta consumes exact bound paths without os.walk and reuses an already prepared content object", (t) => {
  const f = fixture(t),
    body = "same source bytes"
  const one = f.write("documents/one/body.bin", body)
  const other = f.write("documents/unrelated/body.bin", "must remain outside this delta")
  const change = storageAction(f.root, "change-manifest", { run_id: "changes", paths: [one] })
  const input = {
    run_id: "delta",
    parent_id: "unit-parent",
    changes_path: change.manifest.path,
    changes_sha256: change.manifest.sha256,
  }
  const script =
    "import importlib.util,json,sys;from pathlib import Path;s=importlib.util.spec_from_file_location('cold',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);m.os.walk=lambda *a,**k:(_ for _ in ()).throw(AssertionError('whole walk forbidden'));root=Path(sys.argv[2]);db=m.connect(root);print(json.dumps(m.prepare_scoped_archive(root,db,json.load(sys.stdin),'daily_delta')));db.close()"
  const run = spawnSync("python3", ["-c", script, native, f.root], {
    input: JSON.stringify(input),
    encoding: "utf8",
  })
  assert.equal(run.status, 0, run.stderr)
  const delta = JSON.parse(run.stdout)
  assert.equal(delta.files, 1)
  assert.equal(delta.scope.kind, "exact_changed_paths")
  assert.deepEqual(
    f.read(delta.manifest).files.map((r) => r.path),
    [one],
  )
  assert.equal(storageAction(f.root, "status").files, 1)
  assert.equal(fs.readFileSync(path.join(f.root, other), "utf8"), "must remain outside this delta")
  const alias = f.write("documents/alias/body.bin", body)
  const aliasChange = storageAction(f.root, "change-manifest", { run_id: "alias", paths: [alias] })
  const aliasDelta = storageAction(f.root, "prepare-delta", {
    ...input,
    run_id: "delta-alias",
    changes_path: aliasChange.manifest.path,
    changes_sha256: aliasChange.manifest.sha256,
  })
  assert.equal(aliasDelta.bundles[0].bundle_id, delta.bundles[0].bundle_id)
  assert.equal(storageAction(f.root, "status").bundles, 1)
  fs.writeFileSync(path.join(f.root, change.manifest.path), "{}")
  assert.throws(() => storageAction(f.root, "prepare-delta", input), /SHA changed/)
})
test("cache, backups, secrets, symlinks and escaped delta paths are rejected before selection", (t) => {
  const f = fixture(t)
  for (const rel of [
    ".storage/incoming/body.bin",
    "transfer-cache/body.bin",
    "backups/body.bin",
    "documents/secret/body.bin",
  ]) {
    f.write(rel, "never archive transport/secret bytes")
    assert.throws(
      () => storageAction(f.root, "change-manifest", { run_id: "blocked", paths: [rel] }),
      /outside archive selection/,
    )
  }
  const raw = f.write("documents/real/body.bin", "real")
  fs.symlinkSync(path.join(f.root, raw), path.join(f.root, "linked"))
  assert.throws(
    () => storageAction(f.root, "change-manifest", { run_id: "linked", paths: ["linked"] }),
    /Symlink/,
  )
  assert.throws(
    () => storageAction(f.root, "change-manifest", { run_id: "escape", paths: ["../foreign"] }),
    /normalized|relative/,
  )
  const change = storageAction(f.root, "change-manifest", { run_id: "real", paths: [raw] })
  fs.writeFileSync(path.join(f.root, raw), "changed")
  assert.throws(
    () =>
      storageAction(f.root, "prepare-delta", {
        run_id: "changed",
        changes_path: change.manifest.path,
        changes_sha256: change.manifest.sha256,
      }),
    /SHA changed/,
  )
})
test("full audit detects missing unarchived bytes and can resume after exact restoration without deleting catalog history", (t) => {
  const f = fixture(t),
    raw = f.write("documents/source/body.bin", "restore the same source")
  storageAction(f.root, "prepare")
  fs.unlinkSync(path.join(f.root, raw))
  const input = { run_id: "missing", parent_id: "unit-parent" }
  const blocked = storageAction(f.root, "prepare-full", input)
  assert.equal(blocked.status, "requires_repair")
  assert.deepEqual(blocked.missing_unarchived_paths, [raw])
  f.write(raw, "restore the same source")
  const resumed = storageAction(f.root, "prepare-full", input)
  assert.equal(resumed.status, "waiting_for_storage")
  assert.equal(storageAction(f.root, "status").files, 1)
})
