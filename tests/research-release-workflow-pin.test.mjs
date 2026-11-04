import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { implementationFiles } from "../scripts/research/development-release.mjs"

test("immutable release binds both publication workflows", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tkg-release-workflows-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, ".github/workflows"), { recursive: true })
  for (const name of ["publish.yaml", "drive-sync.yaml"])
    fs.writeFileSync(path.join(root, ".github/workflows", name), `name: ${name}\n`)
  const files = implementationFiles(root)
  assert.ok(files.includes(".github/workflows/publish.yaml"))
  assert.ok(files.includes(".github/workflows/drive-sync.yaml"))
})
