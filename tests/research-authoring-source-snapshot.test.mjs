import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import {
  captureAuthoringSourceSnapshot,
  loadAuthoringSourceCapture,
} from "../scripts/research/authoring-source-snapshot.mjs"
import { DRIVE_AUTHORING_ROOTS } from "../scripts/research/authoring-transfer.mjs"
import { sha256, PUBLIC_ROOTS } from "../scripts/research/contracts.mjs"

const repository = process.cwd(),
  rootId = "1VKWSC2IYOtOd__3NKEzD-BK34qVqtlAD"
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "source-capture-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const now = Date.now(),
    observed_at = new Date(now).toISOString(),
    vault = path.join(root, "vault")
  const folders = Object.entries(DRIVE_AUTHORING_ROOTS).map(([name, id]) => ({
    path: name,
    metadata: {
      id,
      title: name,
      mime_type: "application/vnd.google-apps.folder",
      parent_ids: [rootId],
      modified_time: observed_at,
      shared: false,
    },
  }))
  const files = PUBLIC_ROOTS.map((name, i) => {
    const content = `# Exact remote ${name}\r\n한국어 원본\n`,
      bytes = Buffer.from(content)
    const metadata = {
      id: "file-" + i,
      title: "fixture.md",
      mime_type: "text/markdown",
      size: String(bytes.length),
      modified_time: observed_at,
      parent_ids: [DRIVE_AUTHORING_ROOTS[name]],
      shared: false,
    }
    fs.mkdirSync(path.join(vault, name), { recursive: true })
    fs.writeFileSync(path.join(vault, name, "fixture.md"), content)
    return {
      path: name + "/fixture.md",
      metadata,
      raw: { ...metadata, b64_string: bytes.toString("base64"), file_size_bytes: bytes.length },
    }
  })
  const acquisition = {
    schema: "research-authoring-drive-acquisition/v1",
    observed_at,
    root_metadata: {
      id: rootId,
      mime_type: "application/vnd.google-apps.folder",
      shared: false,
      parent_ids: ["1psoNS5hryuS9YGJg7JTK4AhG6X6B2LZE"],
    },
    folders,
    files,
    listings: folders.map((f) => ({
      path: f.path,
      id: f.metadata.id,
      limit: 500,
      before: files.filter((r) => r.path.startsWith(f.path + "/")).map((r) => r.metadata),
      after: files.filter((r) => r.path.startsWith(f.path + "/")).map((r) => r.metadata),
    })),
  }
  const file = path.join(root, "acquisition.json")
  const write = () => fs.writeFileSync(file, JSON.stringify(acquisition))
  write()
  const run = (runId = "source") =>
    captureAuthoringSourceSnapshot({ root, runId, acquisitionFile: file, repository, vault, now })
  return { root, vault, now, acquisition, file, write, run }
}

test("complete remote source bytes form a native snapshot despite a different editing copy, without apply or approval", (t) => {
  const f = fixture(t),
    original = fs.readFileSync(f.file)
  const changed = path.join(f.vault, "Knowledge/fixture.md")
  fs.writeFileSync(changed, "# Local revision\n")
  fs.writeFileSync(path.join(f.vault, "Signals/local-only.md"), "# Local only\n")
  const localBefore = sha256(fs.readFileSync(changed))
  const result = f.run()
  assert.equal(result.source_files, 4)
  assert.equal(result.remote_raw_verified, true)
  assert.equal(result.working_copy_matches, false)
  assert.equal(result.release_baseline_ready, false)
  assert.equal(result.approval_granted, false)
  assert.equal(result.canonical_applied, false)
  assert.equal(result.remote_write_performed, false)
  const snapshot = JSON.parse(fs.readFileSync(path.join(f.root, result.source_snapshot.path)))
  const receiptBytes = fs.readFileSync(path.join(f.root, result.source_readback.path))
  assert.equal(snapshot.readback.receipt_sha256, sha256(receiptBytes))
  const receipt = JSON.parse(receiptBytes)
  for (const row of snapshot.files) {
    const proof = receipt.files.find((r) => r.path === row.path)
    assert.equal(sha256(Buffer.from(row.content)), proof.sha256)
    assert.equal(sha256(fs.readFileSync(path.join(f.root, proof.raw_path))), proof.sha256)
    assert.match(row.content, /\r\n/)
  }
  const diff = JSON.parse(fs.readFileSync(path.join(f.root, result.difference.path)))
  assert.equal(diff.changed[0].path, "Knowledge/fixture.md")
  assert.deepEqual(diff.local_only, ["Signals/local-only.md"])
  assert.equal(sha256(fs.readFileSync(changed)), localBefore)
  assert.ok(fs.readFileSync(f.file).equals(original))
  assert.deepEqual(f.run(), result)
})

test("missing raw, shared sources, changed or truncated listings and corrupt bytes cannot create complete source proof", (t) => {
  const f = fixture(t),
    clean = structuredClone(f.acquisition)
  for (const mutate of [
    (a) => a.files.pop(),
    (a) => (a.files[0].raw.b64_string = "YWJj"),
    (a) => (a.files[0].metadata.shared = true),
    (a) => (a.listings[0].after = []),
    (a) => (a.listings[0].limit = 1),
    (a) => (a.folders[0].metadata.parent_ids = ["outside"]),
  ]) {
    Object.assign(f.acquisition, structuredClone(clean))
    mutate(f.acquisition)
    f.write()
    assert.throws(() => f.run())
    assert.equal(
      fs.existsSync(path.join(f.root, "drive-source/source/source-snapshot.json")),
      false,
    )
  }
})

test("capture-source CLI consumes the existing acquisition into private proof only", (t) => {
  const f = fixture(t)
  const command = spawnSync(
    process.execPath,
    [
      "scripts/research-authoring.mjs",
      "capture-source",
      "--root",
      f.root,
      "--vault",
      f.vault,
      "--capture-run",
      "cli-source",
      "--acquisition",
      f.file,
    ],
    { cwd: repository, encoding: "utf8" },
  )
  assert.equal(command.status, 0, command.stderr)
  const result = JSON.parse(command.stdout)
  assert.equal(result.working_copy_matches, true)
  assert.equal(result.approval_granted, false)
  assert.equal(result.publication_performed, false)
  assert.equal(fs.existsSync(path.join(f.root, "runs")), false)
})

test("stored source reader validates pinned raw bytes and reports stale current drift without writes or payload", (t) => {
  const f = fixture(t),
    result = f.run()
  const stored = [
    result.capture,
    result.source_snapshot,
    result.source_readback,
    result.raw_readback,
    result.remote_observation,
    result.difference,
  ].map((ref) => ({
    path: ref.path,
    bytes: fs.readFileSync(path.join(f.root, ref.path)),
  }))
  const load = (now) =>
    loadAuthoringSourceCapture(f.root, "source", {
      now,
      repository,
      vault: f.vault,
    })
  const fresh = load(f.now)
  assert.equal(fresh.freshness, "fresh")
  assert.equal(fresh.release_baseline_ready, true)
  assert.equal(fresh.source_files, 4)
  assert.equal(fresh.acquisition_reexecuted, false)
  assert.equal(fresh.approvals_created, false)
  assert.equal(fresh.read_only, true)
  assert.ok(!JSON.stringify(fresh).includes("한국어 원본"))
  fs.writeFileSync(path.join(f.vault, "Knowledge/fixture.md"), "# Later local revision\n")
  const stale = load(f.now + 600001)
  assert.equal(stale.freshness, "stale")
  assert.equal(stale.remote_raw_verified, true)
  assert.equal(stale.release_baseline_ready, false)
  assert.equal(stale.drift.changed, 1)
  assert.equal(stale.observed_at, fresh.observed_at)
  for (const ref of stored)
    assert.ok(fs.readFileSync(path.join(f.root, ref.path)).equals(ref.bytes))
  const receipt = JSON.parse(fs.readFileSync(path.join(f.root, result.source_readback.path)))
  fs.writeFileSync(path.join(f.root, receipt.files[0].raw_path), "corrupt")
  assert.throws(() => load(f.now + 600001), /raw bytes changed/)
  assert.equal(fs.existsSync(path.join(f.root, "runs")), false)
})
