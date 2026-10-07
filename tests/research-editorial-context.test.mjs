import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  editorialInventory,
  loadEditorialContext,
  reconcileEditorialContext,
} from "../scripts/research/editorial-context.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"

function fixture(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "editorial-context-")))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const root = path.join(directory, "research"),
    vault = path.join(directory, "vault")
  const file = path.join(vault, "Editions/2026-10-07.md")
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    "---\ndate: 2026-10-07\ncoverage_end: 2026-10-06T23:00:00Z\n---\nOriginal article.\n",
  )
  const plan = {
    schema: "research-daily-plan/v1",
    run_id: "daily-test",
    edition: {
      ...editorialInventory(vault).snapshot,
      authority: "provided_drive_snapshot_matched",
    },
  }
  atomicWrite(root, "daily/runs/daily-test/plan.json", plan)
  return { root, vault, file, plan, options: { root, vault, runId: plan.run_id } }
}

test("same-period body changes need an explicit context, preserving acquisition bytes and approval boundaries", (t) => {
  const f = fixture(t)
  const before = fs.readFileSync(path.join(f.root, "daily/runs/daily-test/plan.json"))
  fs.appendFileSync(f.file, "Corrected article.\n")
  const inventory = editorialInventory(f.vault).snapshot.inventory_sha256
  assert.throws(() => loadEditorialContext(f.root, f.plan, inventory), /reconcile/)
  const ref = reconcileEditorialContext(f.options)
  const { value } = loadEditorialContext(f.root, f.plan, inventory)
  assert.equal(value.current_edition.authority, "local_vault_unreconciled")
  for (const key of ["network_used", "candidate_approved", "candidate_published", "drive_verified"])
    assert.equal(value[key], false)
  assert.deepEqual(fs.readFileSync(path.join(f.root, "daily/runs/daily-test/plan.json")), before)
  assert.equal(reconcileEditorialContext(f.options).reused, true)
  fs.appendFileSync(f.file, "Another correction.\n")
  assert.throws(
    () =>
      loadEditorialContext(f.root, f.plan, editorialInventory(f.vault).snapshot.inventory_sha256),
    /changed/,
  )
  const next = reconcileEditorialContext(f.options)
  assert.notEqual(next.path, ref.path)
  assert.deepEqual(
    loadEditorialContext(f.root, f.plan, inventory, ref).value,
    value,
    "frozen handoffs keep their exact context after pointer changes",
  )
})

test("a changed cutoff or new issue requires a new acquisition plan", (t) => {
  const f = fixture(t)
  fs.writeFileSync(
    f.file,
    fs.readFileSync(f.file, "utf8").replace("2026-10-06T23:00:00Z", "2026-10-07T23:00:00Z"),
  )
  assert.throws(() => reconcileEditorialContext(f.options), /new acquisition plan/)
  fs.writeFileSync(
    path.join(f.vault, "Editions/2026-10-08.md"),
    "---\ndate: 2026-10-08\ncoverage_end: 2026-10-07T23:00:00Z\n---\n",
  )
  assert.throws(() => reconcileEditorialContext(f.options), /new acquisition plan/)
})

test("changed context bytes, plan bytes and malformed pointers cannot be silently repaired", (t) => {
  const f = fixture(t),
    inventory = editorialInventory(f.vault).snapshot.inventory_sha256
  const ref = reconcileEditorialContext(f.options)
  const file = path.join(f.root, ref.path),
    original = fs.readFileSync(file)
  fs.appendFileSync(file, "\n")
  assert.throws(() => loadEditorialContext(f.root, f.plan, inventory), /bytes changed/)
  assert.throws(() => reconcileEditorialContext(f.options), /bytes changed/)
  fs.writeFileSync(file, original)
  atomicWrite(f.root, "daily/runs/daily-test/plan.json", { ...f.plan, changed: true })
  assert.throws(() => loadEditorialContext(f.root, f.plan, inventory), /changed/)
  atomicWrite(f.root, "daily/runs/daily-test/editorial-context.json", { schema: "wrong" })
  assert.throws(() => reconcileEditorialContext(f.options), /pointer changed/)
  assert.equal(readJSON(f.root, ref.path).drive_verified, false)
})
