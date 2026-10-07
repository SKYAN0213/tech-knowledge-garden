import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { acquireLock } from "../scripts/research/run-state.mjs"
import { authorizeAuthoringTransfer } from "../scripts/research/authoring-release.mjs"
import {
  authoringDelta,
  compareAuthoringRemote,
  DRIVE_AUTHORING_ROOTS,
  prepareAuthoringTransfer,
} from "../scripts/research/authoring-transfer.mjs"

test("preparation shares the existing preview run lock", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-authoring-lock-")))
  const release = acquireLock(root, "run-busy")
  try {
    await assert.rejects(prepareAuthoringTransfer({ root, previewRun: "busy" }), /EEXIST.*run-busy/)
    assert.equal(fs.existsSync(path.join(root, "locks/garden-operation.json")), false)
  } finally {
    release()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("authoring preparation and release revalidate the frozen daily handoff before writing", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-authoring-handoff-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const base = path.join(root, "runs/reader")
  fs.mkdirSync(base, { recursive: true })
  fs.writeFileSync(
    path.join(base, "preview-manifest.json"),
    JSON.stringify({
      schema: "private-reader-preview/v1",
      run_id: "reader",
      approved_runs: ["stored-approved"],
      knowledge_runs: [],
      daily_editorial_handoff: {
        path: "handoff.json",
        sha256: "0".repeat(64),
        run_id: "editorial",
      },
    }),
  )
  // A forged/empty selection must reach the existing selection validator rather
  // than being silently replaced by the cached approved-run list.
  fs.writeFileSync(
    path.join(root, "handoff.json"),
    JSON.stringify({
      schema: "research-daily-publication-handoff/v1",
      run_id: "editorial",
      approved_runs: [],
    }),
  )
  await assert.rejects(
    prepareAuthoringTransfer({ root, previewRun: "reader" }),
    /Nonempty exact daily publication selection/,
  )
  await assert.rejects(
    authorizeAuthoringTransfer({ root, previewRun: "reader" }),
    /Nonempty exact daily publication selection/,
  )
  assert.equal(fs.existsSync(path.join(base, "drive-authoring")), false)
  assert.equal(fs.existsSync(path.join(root, "runs/stored-approved")), false)
})
import { sha256 } from "../scripts/research/contracts.mjs"

const row = (text) => ({ bytes: Buffer.from(text), sha256: sha256(text) })
const updatePath = "Knowledge/topic.md",
  createPath = "Signals/new.md"
function fixture() {
  const before = new Map([
    [updatePath, row("old")],
    ["Editions/old.md", row("unchanged")],
  ])
  const after = new Map([
    [updatePath, row("new")],
    ["Editions/old.md", row("unchanged")],
    [createPath, row("signals")],
  ])
  const manifest = {
    schema: "private-reader-preview/v1",
    editions: [],
    knowledge: [
      { path: updatePath, sha256: sha256("new") },
      { path: createPath, sha256: sha256("signals") },
    ],
  }
  const plan = {
    schema: "research-authoring-transfer/v1",
    preview_run: "test",
    destination_folder_id: "root",
    roots: DRIVE_AUTHORING_ROOTS,
    files: authoringDelta(manifest, before, after),
  }
  const observation = {
    schema: "research-authoring-remote-observation/v1",
    root_folder_id: "root",
    observed_at: "2026-10-04T00:00:00Z",
    folders: [],
    listings: [
      {
        path: "Knowledge",
        id: DRIVE_AUTHORING_ROOTS.Knowledge,
        complete: true,
        files: [
          {
            name: "topic.md",
            id: "existing",
            parent_id: DRIVE_AUTHORING_ROOTS.Knowledge,
            modified_at: "2026-10-03T00:00:00Z",
            sha256: sha256("old"),
          },
        ],
      },
      { path: "Signals", id: DRIVE_AUTHORING_ROOTS.Signals, complete: true, files: [] },
    ],
  }
  return {
    before,
    after,
    manifest,
    plan,
    observation,
    options: { now: Date.parse(observation.observed_at) },
  }
}
test("only explicitly approved changed authoring bytes are exported", () => {
  const f = fixture()
  assert.equal(f.plan.files.length, 2)
  assert.equal(f.plan.files[0].operation, "update")
  assert.equal(f.plan.files[1].operation, "create")
  assert.equal(f.before.get(updatePath).sha256, sha256("old"))
  assert.equal(
    f.plan.files.some((row) => row.path.includes("old.md")),
    false,
  )
})
test("undeclared changes, deletions, private roots, duplicates and altered approvals are rejected", () => {
  for (const change of [
    (f) => f.after.set("Editions/old.md", row("unreviewed")),
    (f) => f.after.delete("Editions/old.md"),
    (f) => f.after.set("Research/private.md", row("private")),
    (f) => f.manifest.knowledge.push(f.manifest.knowledge[0]),
    (f) => f.after.set(updatePath, row("changed")),
    (f) => (f.manifest.knowledge[0].path = "Knowledge/../Research/private.md"),
  ]) {
    const f = fixture()
    change(f)
    assert.throws(() => authoringDelta(f.manifest, f.before, f.after))
  }
})
test("remote updates retain ID, new files require complete parent listings", () => {
  const f = fixture(),
    result = compareAuthoringRemote(f.plan, f.observation, f.options)
  assert.deepEqual(
    result.operations.map((row) => row.action),
    ["update", "create"],
  )
  assert.equal(result.operations[0].file_id, "existing")
  assert.equal(result.operations[1].parent_id, DRIVE_AUTHORING_ROOTS.Signals)
  assert.equal(result.upload_allowed, false)
  assert.equal(result.drive_written, false)
})
test("unknown write outcome is resolved by same bytes instead of duplicate write", () => {
  const f = fixture()
  f.observation.listings[0].files[0].sha256 = sha256("new")
  f.observation.listings[1].files.push({
    name: "new.md",
    id: "created-on-first-attempt",
    parent_id: DRIVE_AUTHORING_ROOTS.Signals,
    modified_at: f.observation.observed_at,
    sha256: sha256("signals"),
  })
  assert.deepEqual(
    compareAuthoringRemote(f.plan, f.observation, f.options).operations.map((row) => row.action),
    ["already_applied", "already_applied"],
  )
})
test("remote changes, missing raw hashes, stale receipts and ambiguous listings fail closed", () => {
  for (const change of [
    (f) => (f.observation.listings[0].files[0].sha256 = sha256("other edit")),
    (f) => delete f.observation.listings[0].files[0].sha256,
    (f) => (f.observation.listings[0].files = []),
    (f) => (f.observation.listings[1].complete = false),
    (f) =>
      f.observation.listings[0].files.push({
        ...f.observation.listings[0].files[0],
        id: "duplicate-name",
      }),
    (f) => (f.observation.listings[0].files[0].parent_id = "wrong"),
    (f) => f.observation.listings.pop(),
    (f) => (f.observation.observed_at = "2026-10-03T00:00:00Z"),
    (f) =>
      f.observation.folders.push({
        path: "Editions/2026/10",
        id: "month",
        parent_id: DRIVE_AUTHORING_ROOTS.Editions,
      }),
    (f) => f.plan.files.push({ ...f.plan.files[0] }),
  ]) {
    const f = fixture()
    change(f)
    assert.throws(() => compareAuthoringRemote(f.plan, f.observation, f.options))
  }
})
test("nested destinations require a verified parent chain", () => {
  const f = fixture()
  f.plan.files = [{ ...f.plan.files[1], path: "Editions/2026/10/new.md" }]
  f.observation.folders = [
    { path: "Editions/2026", id: "year", parent_id: DRIVE_AUTHORING_ROOTS.Editions },
    { path: "Editions/2026/10", id: "month", parent_id: "year" },
  ]
  f.observation.listings = [{ path: "Editions/2026/10", id: "month", complete: true, files: [] }]
  assert.equal(
    compareAuthoringRemote(f.plan, f.observation, f.options).operations[0].parent_id,
    "month",
  )
})
