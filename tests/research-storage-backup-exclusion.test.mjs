import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { storageAction } from "../scripts/research/cold-storage.mjs"

test("storage snapshots exclude transport caches and development-pending artifacts", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-storage-exclusion-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = Buffer.from("immutable source payload\n".repeat(2000))
  const write = (relative, bytes) => {
    const file = path.join(root, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, bytes)
  }
  write("research/local-ai/runs/daily-1/source.bin", source)
  write(".storage/incoming/local-transport-cache.bin", "temporary transfer bytes")
  write("research/local-ai/.storage/development-pending/artifacts/repro.bin", "private repro")
  write("node_modules/cache/metadata.bin", "dependency cache")

  const prepared = storageAction(root, "prepare", { parent_id: "private-parent" })
  const status = storageAction(root, "status")
  assert.equal(status.files, 1)
  assert.equal(status.unarchived_files, 1)
  const uploads = storageAction(root, "pending").uploads
  assert.equal(uploads.length, 1)
  const listing = spawnSync("python3", ["-c", "import json,sys,zipfile; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))", path.join(root, uploads[0].local_path)], { encoding: "utf8" })
  assert.equal(listing.status, 0, listing.stderr)
  const members = JSON.parse(listing.stdout)
  assert.equal(members.length, 1)
  assert.match(members[0], /^objects\/[a-f0-9]{64}$/)
  assert.ok(!members.some((member) => /\.storage|node_modules|incoming/.test(member)))
  assert.ok(fs.existsSync(path.join(root, "research/local-ai/.storage/development-pending/artifacts/repro.bin")))
})
