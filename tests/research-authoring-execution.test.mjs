import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { sha256 } from "../scripts/research/contracts.mjs"
import { acquireLock } from "../scripts/research/run-state.mjs"
import {
  compareAuthoringRemote,
  DRIVE_AUTHORING_ROOTS,
} from "../scripts/research/authoring-transfer.mjs"
import {
  reconcileAuthoringExecution,
  loadAuthoringExecutionStatus,
  stageAuthoringReadback,
} from "../scripts/research/authoring-execution.mjs"

function fixture(t, { nested = false } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "authoring-execution-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const run = "verified-preview",
    base = `runs/${run}/drive-authoring`,
    now = Date.now()
  const observed_at = new Date(now).toISOString(),
    modified_at = new Date(now - 3600000).toISOString()
  const updatePath = nested ? "Knowledge/sub/topic.md" : "Knowledge/topic.md"
  const updateParent = nested ? "original-sub-folder" : DRIVE_AUTHORING_ROOTS.Knowledge
  const put = (relative, value) => {
    const file = path.join(root, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + "\n")
    return file
  }
  const manifest = put(`runs/${run}/preview-manifest.json`, { schema: "private-reader-preview/v1" })
  const plan = {
    schema: "research-authoring-transfer/v1",
    preview_run: run,
    preview_sha256: sha256(fs.readFileSync(manifest)),
    destination_folder_id: "root",
    roots: DRIVE_AUTHORING_ROOTS,
    files: [
      {
        path: updatePath,
        operation: "update",
        previous_sha256: sha256("old"),
        sha256: sha256("new"),
        bytes: 3,
      },
      {
        path: "Signals/new.md",
        operation: "create",
        previous_sha256: null,
        sha256: sha256("signals"),
        bytes: 7,
      },
    ].map((r) => ({ ...r, staged_path: `${base}/files/${r.path}` })),
  }
  put(base + "/transfer-plan.json", plan)
  plan.files.forEach((r, i) => put(r.staged_path, Buffer.from(i ? "signals" : "new")))
  const observation = {
    schema: "research-authoring-remote-observation/v1",
    root_folder_id: "root",
    observed_at,
    folders: nested
      ? [{ path: "Knowledge/sub", id: updateParent, parent_id: DRIVE_AUTHORING_ROOTS.Knowledge }]
      : [],
    listings: [
      {
        path: nested ? "Knowledge/sub" : "Knowledge",
        id: updateParent,
        complete: true,
        files: [
          {
            name: "topic.md",
            id: "existing",
            parent_id: updateParent,
            modified_at,
            sha256: sha256("old"),
          },
        ],
      },
      { path: "Signals", id: DRIVE_AUTHORING_ROOTS.Signals, complete: true, files: [] },
    ],
  }
  const input_sha256 = {
    plan: sha256(fs.readFileSync(path.join(root, base + "/transfer-plan.json"))),
    manifest: plan.preview_sha256,
    review: sha256("review"),
    snapshot: sha256("snapshot"),
    observation: sha256("observation"),
  }
  const release = {
    schema: "research-authoring-release/v1",
    preview_run: run,
    input_sha256,
    operations: compareAuthoringRemote(plan, observation, { now }).operations,
    release_approved: true,
    upload_allowed: true,
  }
  const releasePath = `${base}/releases/${sha256(JSON.stringify(input_sha256))}.json`
  put(releasePath, release)
  let version = 0
  const capture = (contents = new Map([[updatePath, "old"]])) => {
    const prefix = `captures/${++version}`
    const readback = {
      schema: "research-authoring-readback/v1",
      observed_at: observation.observed_at,
      files: [],
    }
    for (const listing of observation.listings)
      for (const file of listing.files) {
        const relative = listing.path + "/" + file.name,
          text = contents.get(relative)
        if (text === undefined) continue
        const raw = Buffer.from(text),
          raw_path = `${prefix}/raw-${readback.files.length}.bin`
        put(raw_path, raw)
        readback.files.push({
          path: relative,
          file_id: file.id,
          parent_id: file.parent_id,
          modified_at: file.modified_at,
          mime_type: "text/markdown",
          shared: false,
          raw_path,
          bytes: raw.length,
          sha256: sha256(raw),
        })
      }
    return {
      observationFile: put(prefix + "/observation.json", observation),
      readbackFile: put(prefix + "/readback.json", readback),
      readback,
    }
  }
  const apply = (which = "both", id = "created") => {
    if (which === "both" || which === "update")
      Object.assign(observation.listings[0].files[0], {
        sha256: sha256("new"),
        modified_at: observed_at,
      })
    if (which === "both" || which === "create")
      observation.listings[1].files = [
        {
          name: "new.md",
          id,
          parent_id: DRIVE_AUTHORING_ROOTS.Signals,
          modified_at: observed_at,
          sha256: sha256("signals"),
        },
      ]
  }
  const reconcile = (captureArgs) =>
    reconcileAuthoringExecution({ root, releasePath, now, ...captureArgs })
  return {
    root,
    base,
    run,
    now,
    plan,
    release,
    releasePath,
    observation,
    put,
    capture,
    apply,
    reconcile,
  }
}

test("pending and partial uploads retain the original release and only propose remaining writes", async (t) => {
  const f = fixture(t),
    releaseBefore = fs.readFileSync(path.join(f.root, f.releasePath))
  const pending = await f.reconcile(f.capture())
  assert.deepEqual(pending.counts, { verified: 0, pending: 2, conflict: 0 })
  assert.deepEqual(
    pending.next_operations.map((r) => r.action),
    ["update", "create"],
  )
  assert.equal(pending.drive_verified, false)
  f.apply("update")
  const partial = await f.reconcile(f.capture(new Map([["Knowledge/topic.md", "new"]])))
  assert.deepEqual(partial.counts, { verified: 1, pending: 1, conflict: 0 })
  assert.equal(partial.next_operations[0].path, "Signals/new.md")
  assert.deepEqual(fs.readFileSync(path.join(f.root, f.releasePath)), releaseBefore)
})

test("lost successful create response is recovered from actual bytes without another upload", async (t) => {
  const f = fixture(t)
  f.apply()
  const capture = f.capture(
    new Map([
      ["Knowledge/topic.md", "new"],
      ["Signals/new.md", "signals"],
    ]),
  )
  const r = await f.reconcile(capture)
  assert.equal(r.status, "verified_complete")
  assert.deepEqual(r.next_operations, [])
  assert.equal(r.drive_verified, true)
  assert.equal(r.write_performed, false)
  assert.equal(r.candidate_published, false)
  assert.equal(r.new_operational_run, false)
  assert.deepEqual(await f.reconcile(capture), r)
  const status = loadAuthoringExecutionStatus(f.root).releases[0]
  assert.equal(status.status, "verified_complete")
  assert.equal(status.drive_verified_at_observation, true)
  assert.equal(status.remote_current_verified, false)
  assert.equal(status.public_deployment_verified, false)
})

test("same desired bytes cannot conceal a changed update ID or transfer", async (t) => {
  for (const kind of ["id", "parent"]) {
    const f = fixture(t)
    f.apply("update")
    if (kind === "id") f.observation.listings[0].files[0].id = "replacement"
    else {
      // A valid folder chain still cannot move an approved target to another parent.
      f.observation.folders.push({
        path: "Knowledge/sub",
        id: "sub-folder",
        parent_id: DRIVE_AUTHORING_ROOTS.Knowledge,
      })
      f.plan.files[0].path = "Knowledge/sub/topic.md"
      f.plan.files[0].staged_path = f.base + "/files/Knowledge/sub/topic.md"
      f.put(f.plan.files[0].staged_path, Buffer.from("new"))
      f.put(f.base + "/transfer-plan.json", f.plan)
      await assert.rejects(f.reconcile(f.capture()), /inputs changed/)
      continue
    }
    const r = await f.reconcile(f.capture(new Map([["Knowledge/topic.md", "new"]])))
    assert.equal(r.status, "conflict")
    assert.equal(r.rows[0].reason, "file_identity_changed")
    assert.deepEqual(r.next_operations, [])
  }
})

test("a changed nested parent cannot inherit the original write permission", async (t) => {
  const f = fixture(t, { nested: true })
  f.apply("update")
  f.observation.folders[0].id = "replacement-sub-folder"
  f.observation.listings[0].id = "replacement-sub-folder"
  f.observation.listings[0].files[0].parent_id = "replacement-sub-folder"
  const r = await f.reconcile(f.capture(new Map([["Knowledge/sub/topic.md", "new"]])))
  assert.equal(r.rows[0].reason, "parent_changed")
  assert.deepEqual(r.next_operations, [])
})

test("reverted content with a new revision does not authorize overwriting a later editor", async (t) => {
  const f = fixture(t)
  f.observation.listings[0].files[0].modified_at = f.observation.observed_at
  const r = await f.reconcile(f.capture())
  assert.equal(r.rows[0].reason, "revision_changed")
  assert.deepEqual(r.next_operations, [])
})

test("created file identity remains pinned across receipts and missing files are not recreated", async (t) => {
  for (const missing of [false, true]) {
    const f = fixture(t)
    f.apply()
    await f.reconcile(
      f.capture(
        new Map([
          ["Knowledge/topic.md", "new"],
          ["Signals/new.md", "signals"],
        ]),
      ),
    )
    if (missing) f.observation.listings[1].files = []
    else f.observation.listings[1].files[0].id = "different-created-file"
    const r = await f.reconcile(
      f.capture(
        new Map([
          ["Knowledge/topic.md", "new"],
          ["Signals/new.md", "signals"],
        ]),
      ),
    )
    assert.equal(r.rows[1].reason, "file_identity_changed")
    assert.deepEqual(r.next_operations, [])
    assert.equal(loadAuthoringExecutionStatus(f.root).releases[0].status, "conflict")
  }
})

test("raw hash, size, sharing, MIME and metadata proof cannot be substituted by upload success", async (t) => {
  for (const mutate of [
    (f, c) => f.put(c.readback.files[0].raw_path, Buffer.from("fake")),
    (_f, c) => (c.readback.files[0].bytes = 999),
    (_f, c) => (c.readback.files[0].shared = true),
    (_f, c) => delete c.readback.files[0].shared,
    (_f, c) => (c.readback.files[0].mime_type = "application/vnd.google-apps.document"),
    (_f, c) => (c.readback.files[0].file_id = "other"),
    (_f, c) => (c.readback.files[0].modified_at = "2020-01-01T00:00:00Z"),
    (_f, c) => (c.readback.files = []),
    (_f, c) => c.readback.files.push(c.readback.files[0]),
  ]) {
    const f = fixture(t),
      c = f.capture()
    mutate(f, c)
    fs.writeFileSync(c.readbackFile, JSON.stringify(c.readback))
    await assert.rejects(f.reconcile(c))
    assert.equal(loadAuthoringExecutionStatus(f.root).releases[0].status, "readback_required")
  }
})

test("stale, incomplete, duplicate and conflicting remote snapshots never enable retries", async (t) => {
  for (const mutate of [
    (f) => (f.observation.observed_at = new Date(f.now - 600001).toISOString()),
    (f) => (f.observation.observed_at = new Date(f.now + 1).toISOString()),
    (f) => (f.observation.listings[0].complete = false),
    (f) => f.observation.listings[0].files.push(f.observation.listings[0].files[0]),
  ]) {
    const f = fixture(t)
    mutate(f)
    await assert.rejects(f.reconcile(f.capture()))
  }
  const f = fixture(t)
  f.observation.listings[0].files[0].sha256 = sha256("someone else's edit")
  const r = await f.reconcile(f.capture(new Map([["Knowledge/topic.md", "someone else's edit"]])))
  assert.equal(r.status, "conflict")
  assert.equal(r.rows[0].reason, "remote_content_changed")
  assert.deepEqual(r.next_operations, [])
})

test("staged input mutation and stored raw proof corruption remain visible", async (t) => {
  const f = fixture(t),
    r = await f.reconcile(f.capture())
  f.put(path.posix.dirname(r.receipt) + "/raw/0.bin", Buffer.from("corrupt"))
  assert.equal(loadAuthoringExecutionStatus(f.root).releases[0].status, "invalid")
  await assert.rejects(f.reconcile(f.capture()), /raw bytes/)
  const g = fixture(t)
  g.put(g.plan.files[0].staged_path, Buffer.from("changed"))
  await assert.rejects(g.reconcile(g.capture()), /Staged authoring bytes changed/)
})

test("older observations cannot replace later execution evidence", async (t) => {
  const f = fixture(t)
  await f.reconcile(f.capture())
  f.observation.observed_at = new Date(f.now - 1).toISOString()
  await assert.rejects(f.reconcile(f.capture()), /predates/)
})

test("execution reconciliation shares the garden writer lock", async (t) => {
  const f = fixture(t),
    unlock = acquireLock(f.root, "garden-operation")
  try {
    await assert.rejects(f.reconcile(f.capture()), /EEXIST/)
  } finally {
    unlock()
  }
  assert.equal(loadAuthoringExecutionStatus(f.root).releases[0].status, "readback_required")
})

test("reconcile and status CLI expose real saved proof without performing writes", async (t) => {
  const f = fixture(t),
    c = f.capture()
  const invoke = (args) =>
    spawnSync(process.execPath, ["scripts/research-authoring.mjs", ...args, "--root", f.root], {
      encoding: "utf8",
    })
  const r = invoke([
    "reconcile",
    "--release",
    f.releasePath,
    "--observation",
    c.observationFile,
    "--readback",
    c.readbackFile,
  ])
  assert.equal(r.status, 0, r.stderr)
  assert.equal(JSON.parse(r.stdout).status, "pending")
  const s = invoke(["status"])
  assert.equal(s.status, 0, s.stderr)
  assert.equal(JSON.parse(s.stdout).releases[0].counts.pending, 2)
  assert.equal(invoke(["status", "--readback", c.readbackFile]).status, 1)
})

function connectorCapture(f) {
  const existing = f.observation.listings[0].files[0]
  const metadata = {
    id: existing.id,
    title: existing.name,
    mime_type: "text/markdown",
    size: "3",
    modified_time: existing.modified_at,
    parent_ids: [existing.parent_id],
    shared: false,
  }
  return {
    schema: "research-authoring-drive-acquisition/v1",
    observed_at: f.observation.observed_at,
    folders: [],
    listings: f.observation.listings.map((l) => ({
      path: l.path,
      id: l.id,
      limit: 1000,
      before: l.files.map((r) => ({
        id: r.id,
        title: r.name,
        modified_time: r.modified_at,
        mime_type: "text/markdown",
        parent_ids: null,
      })),
      after: l.files.map((r) => ({
        id: r.id,
        title: r.name,
        modified_time: r.modified_at,
        mime_type: "text/markdown",
        parent_ids: null,
      })),
    })),
    files: [
      {
        path: "Knowledge/topic.md",
        metadata,
        raw: {
          id: metadata.id,
          mime_type: metadata.mime_type,
          modified_time: metadata.modified_time,
          parent_ids: metadata.parent_ids,
          file_size_bytes: 3,
          b64_string: Buffer.from("old").toString("base64"),
          file_uri: { download_url: "opaque-download-reference" },
        },
      },
    ],
  }
}

test("connector capture normalizes actual scoped evidence and excludes download references", async (t) => {
  const f = fixture(t),
    acquisition = connectorCapture(f)
  const staged = await stageAuthoringReadback({
    root: f.root,
    releasePath: f.releasePath,
    acquisitionFile: f.put("connector.json", acquisition),
    now: f.now,
  })
  const r = await f.reconcile({
    observationFile: staged.observation_file,
    readbackFile: staged.readback_file,
  })
  assert.equal(r.status, "pending")
  assert.equal(staged.files, 1)
  assert.equal(
    fs.readFileSync(staged.readback_file, "utf8").includes("opaque-download-reference"),
    false,
  )
  const cli = spawnSync(
    process.execPath,
    [
      "scripts/research-authoring.mjs",
      "capture",
      "--root",
      f.root,
      "--release",
      f.releasePath,
      "--acquisition",
      path.join(f.root, "connector.json"),
    ],
    { encoding: "utf8" },
  )
  assert.equal(cli.status, 0, cli.stderr)
  assert.equal(JSON.parse(cli.stdout).files, 1)
})

test("connector capture rejects truncated, changing, corrupt or mismatched raw acquisitions", async (t) => {
  for (const mutate of [
    (c) => (c.listings[0].limit = 1),
    (c) => (c.listings[0].after[0].id = "other"),
    (c) => (c.listings[0].after = []),
    (c) => (c.files[0].raw.b64_string += "!"),
    (c) => (c.files[0].raw.file_size_bytes = 99),
    (c) => (c.files[0].metadata.size = "4"),
    (c) => (c.files[0].metadata.shared = true),
    (c) => (c.files[0].raw.parent_ids = ["different"]),
    (c) => (c.files[0].metadata.mime_type = "application/vnd.google-apps.document"),
    (c) =>
      c.folders.push({
        path: "Knowledge/sub",
        metadata: { id: "sub", mime_type: "text/plain", parent_ids: [] },
      }),
  ]) {
    const f = fixture(t),
      capture = connectorCapture(f)
    mutate(capture)
    await assert.rejects(
      stageAuthoringReadback({
        root: f.root,
        releasePath: f.releasePath,
        acquisitionFile: f.put("connector.json", capture),
        now: f.now,
      }),
    )
    assert.equal(loadAuthoringExecutionStatus(f.root).releases[0].status, "readback_required")
  }
})
