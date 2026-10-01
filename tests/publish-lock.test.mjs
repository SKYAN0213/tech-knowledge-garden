import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { withLock } from "../scripts/research/run-state.mjs"

test("content publication lock rejects overlapping runs and releases after failure", async (t) => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "garden-content-publication-lock-")),
  )
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  let unblock
  const held = withLock(
    root,
    "content-publication",
    () => new Promise((resolve) => (unblock = resolve)),
  )
  await new Promise((resolve) => setImmediate(resolve))

  let duplicateStarted = false
  await assert.rejects(
    withLock(root, "content-publication", async () => {
      duplicateStarted = true
    }),
    { code: "EEXIST" },
  )
  assert.equal(duplicateStarted, false)
  unblock()
  await held

  await assert.rejects(
    withLock(root, "content-publication", async () => {
      throw Error("simulated preflight failure")
    }),
    /simulated preflight failure/,
  )
  assert.equal(fs.existsSync(path.join(root, "locks", "content-publication.json")), false)
})
