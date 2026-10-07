import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { execFileSync, spawnSync } from "node:child_process"
import { PassThrough } from "node:stream"
import { fixture } from "./fixtures/publication-operation.mjs"
import { sha256, PUBLIC_ROOTS } from "../scripts/research/contracts.mjs"
import { DRIVE_AUTHORING_ROOTS } from "../scripts/research/authoring-transfer.mjs"
import { inspectedAuthoringRelease } from "../scripts/research/authoring-execution.mjs"
import { importVerifiedAuthoring } from "../scripts/research/authoring-import.mjs"
import { deliverAuthoringSession } from "../scripts/research/authoring-delivery.mjs"
import { runDeliveryCommand } from "../scripts/research/delivery-run.mjs"
import { recordPublicationPush } from "../scripts/research/publication-operation.mjs"
import { connectorInput } from "../scripts/research/connector-input.mjs"

const repository = process.cwd(),
  ROOT_ID = "1VKWSC2IYOtOd__3NKEzD-BK34qVqtlAD"
async function input(t) {
  const f = await fixture(t, ".local/source-review", ROOT_ID)
  const sourceRoot = f.root,
    root = path.join(f.repository, ".local/research/local-ai")
  for (const name of PUBLIC_ROOTS)
    fs.mkdirSync(path.join(f.repository, "vault", name), { recursive: true })
  fs.mkdirSync(path.join(f.repository, "scripts"), { recursive: true })
  for (const file of ["pull-drive.py", "build-connector-snapshot.py"])
    fs.copyFileSync(
      path.join(repository, "scripts", file),
      path.join(f.repository, "scripts", file),
    )
  const native = inspectedAuthoringRelease(sourceRoot, f.releasePath)
  const raw = JSON.parse(
    fs.readFileSync(path.join(sourceRoot, path.dirname(native.execution_path), "readback.json")),
  )
  const proof = raw.files[0],
    content = fs.readFileSync(path.join(f.repository, "vault", f.edition), "utf8")
  const receipt = {
    schema: "tech-drive-connector-readback/v1",
    root_folder_id: ROOT_ID,
    roots: Object.entries(DRIVE_AUTHORING_ROOTS).map(([name, id]) => ({ name, id })),
    verified_at: new Date().toISOString(),
    folders: [
      { path: "Editions/2026", id: "year", parent_ids: [DRIVE_AUTHORING_ROOTS.Editions] },
      { path: "Editions/2026/01", id: "month", parent_ids: ["year"] },
    ],
    files: [
      {
        path: f.edition,
        file_id: proof.file_id,
        parent_ids: [proof.parent_id],
        modified_time: proof.modified_at,
        sha256: sha256(content),
        size: Buffer.byteLength(content),
      },
    ],
  }
  for (const name of PUBLIC_ROOTS.slice(1)) {
    const file = `${name}/baseline.md`,
      background = `# Background ${name}\n`
    f.put("vault/" + file, background)
    receipt.files.push({
      path: file,
      file_id: "background-" + name,
      parent_ids: [DRIVE_AUTHORING_ROOTS[name]],
      modified_time: receipt.verified_at,
      sha256: sha256(background),
      size: Buffer.byteLength(background),
    })
  }
  const readbackFile = f.put("capture/source-readback.json", receipt)
  const snapshot = {
    schema: "tech-drive-source/v1",
    transport: "codex-drive-connector",
    complete: true,
    root_folder_id: ROOT_ID,
    roots: PUBLIC_ROOTS,
    exported_at: receipt.verified_at,
    readback: {
      schema: receipt.schema,
      receipt_sha256: sha256(fs.readFileSync(readbackFile)),
      source_files: receipt.files.length,
    },
    files: [{ path: f.edition, content, sha256: sha256(content) }],
  }
  for (const row of receipt.files.slice(1))
    snapshot.files.push({
      path: row.path,
      content: fs.readFileSync(path.join(f.repository, "vault", row.path), "utf8"),
      sha256: row.sha256,
    })
  const snapshotFile = f.put("capture/source-snapshot.json", snapshot)
  f.put("vault/" + f.edition, "old")
  return {
    ...f,
    root,
    sourceRoot,
    receipt,
    snapshot,
    snapshotFile,
    readbackFile,
    importOptions: {
      root,
      sourceRoot,
      run: "delivery",
      repository: f.repository,
      releasePath: f.releasePath,
      snapshotFile,
      readbackFile,
    },
  }
}

test("native Drive import transfers approved bytes and proofs once, then only verifies the completed state", async (t) => {
  const f = await input(t),
    calls = []
  const execute = async (...args) => {
    calls.push(args[1])
    return runDeliveryCommand(...args)
  }
  const first = await importVerifiedAuthoring({ ...f.importOptions, execute })
  assert.equal(first.status, "canonical_verified")
  assert.equal(first.native_pull.updated.length, 1)
  assert.equal(first.native_pull.deleted.length, 0)
  assert.equal(
    fs.readFileSync(path.join(f.repository, "vault", f.edition), "utf8"),
    "# Reviewed news\n",
  )
  assert.equal(
    inspectedAuthoringRelease(f.root, f.releasePath).release_sha256,
    inspectedAuthoringRelease(f.sourceRoot, f.releasePath).release_sha256,
  )
  const again = await importVerifiedAuthoring({ ...f.importOptions, execute })
  assert.equal(again.reused, true)
  assert.equal(again.apply_performed, false)
  assert.equal(calls.filter((args) => args.includes("--apply")).length, 1)
  assert.ok(calls.at(-1).includes("--verify-working-copy"))
})

test("import rejects unapproved remote changes and unexpected canonical edits before running a command", async (t) => {
  const f = await input(t)
  let calls = 0
  f.put("vault/Knowledge/term.md", "reviewed definition")
  f.snapshot.files.push({
    path: "Knowledge/term.md",
    content: "unapproved definition",
    sha256: sha256("unapproved definition"),
  })
  f.put("capture/source-snapshot.json", f.snapshot)
  await assert.rejects(
    importVerifiedAuthoring({
      ...f.importOptions,
      execute: async () => {
        calls++
      },
    }),
    /Unapproved canonical or remote/,
  )
  assert.equal(calls, 0)
  assert.equal(fs.readFileSync(path.join(f.repository, "vault", f.edition), "utf8"), "old")
})

test("post-write metadata identity, freshness and complete inventory cannot be inferred from matching text", async (t) => {
  const f = await input(t)
  f.receipt.files[0].file_id = "replacement"
  f.put("capture/source-readback.json", f.receipt)
  f.snapshot.readback.receipt_sha256 = sha256(fs.readFileSync(f.readbackFile))
  f.put("capture/source-snapshot.json", f.snapshot)
  await assert.rejects(importVerifiedAuthoring(f.importOptions), /approved raw evidence/)
  f.receipt.files[0].file_id = "existing"
  f.put("capture/source-readback.json", f.receipt)
  f.snapshot.readback.receipt_sha256 = sha256(fs.readFileSync(f.readbackFile))
  f.put("capture/source-snapshot.json", f.snapshot)
  await assert.rejects(
    importVerifiedAuthoring({ ...f.importOptions, now: () => Date.now() + 600001 }),
    /Fresh authoring/,
  )
  f.snapshot.files = []
  f.put("capture/source-snapshot.json", f.snapshot)
  await assert.rejects(importVerifiedAuthoring(f.importOptions), /path inventory/)
})

test("proof collision is checked before applying the approved original; no stale or conflicting evidence is overwritten", async (t) => {
  const f = await input(t)
  const destination = path.join(f.root, f.releasePath)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, "other approval")
  await assert.rejects(importVerifiedAuthoring(f.importOptions), /evidence collision/)
  assert.equal(fs.readFileSync(destination, "utf8"), "other approval")
  assert.equal(fs.readFileSync(path.join(f.repository, "vault", f.edition), "utf8"), "old")
})

test("native Python validation rejects forged normalized readback metadata before changing canonical files", async (t) => {
  const f = await input(t)
  f.receipt.folders[0].parent_ids = ["wrong-parent"]
  f.put("capture/source-readback.json", f.receipt)
  f.snapshot.readback.receipt_sha256 = sha256(fs.readFileSync(f.readbackFile))
  f.put("capture/source-snapshot.json", f.snapshot)
  await assert.rejects(importVerifiedAuthoring(f.importOptions), /parent/)
  assert.equal(fs.readFileSync(path.join(f.repository, "vault", f.edition), "utf8"), "old")
  assert.equal(fs.existsSync(path.join(f.root, "runs/delivery/authoring-import/input.json")), false)
})

test("authoring delivery continues from external approved evidence to native import, publication and public bytes", async (t) => {
  const f = await input(t)
  const calls = []
  const execute = async (file, args, repo) => {
    calls.push([file, ...args])
    if (file === "python3") return runDeliveryCommand(file, args, repo)
    if (file === process.execPath) {
      const pushPath = "publication/push-attempts/actual-local-commit.json"
      fs.mkdirSync(path.dirname(path.join(f.root, pushPath)), { recursive: true })
      fs.copyFileSync(path.join(f.sourceRoot, f.pushPath), path.join(f.root, pushPath))
      await recordPublicationPush({
        root: f.root,
        run: "delivery",
        repository: f.repository,
        pushPath,
      })
      return ""
    }
    return JSON.stringify({ ...f.deployment, workflowName: "Publish Garden" })
  }
  const first = await deliverAuthoringSession({
    ...f.importOptions,
    actionsRun: "123",
    execute,
    fetchImpl: f.fetchImpl,
  })
  assert.equal(first.status, "public_bytes_verified")
  assert.equal(first.canonical_import.files, 4)
  assert.equal(first.new_regular_operation_counted, false)
  const count = calls.length,
    http = f.calls()
  const second = await deliverAuthoringSession({
    ...f.importOptions,
    execute,
    fetchImpl: f.fetchImpl,
  })
  assert.equal(second.status, "public_bytes_verified")
  assert.equal(calls.length, count)
  assert.equal(f.calls(), http)
})

test("connector input enforces exact messages, queues only metadata and rejects EOF", async () => {
  const stream = new PassThrough(),
    channel = connectorInput(stream)
  try {
    stream.write('{"type":"ready"}\n{"type":"readback","acquisition_file":"/private/post.json"}\n')
    assert.deepEqual(await channel.read("ready", []), { type: "ready" })
    assert.equal(
      (await channel.read("readback", ["acquisition_file"])).acquisition_file,
      "/private/post.json",
    )
    stream.end()
    await assert.rejects(
      channel.read("source_snapshot", ["snapshot_file", "readback_file"]),
      /input closed/,
    )
  } finally {
    channel.close()
  }
})

test("closed CLI connector input stops before creating a write intent or delivery input", async (t) => {
  const f = await input(t)
  const result = spawnSync(
    process.execPath,
    [
      path.join(repository, "scripts/research-deliver.mjs"),
      "--run",
      "closed",
      "--root",
      f.root,
      "--authoring-root",
      f.sourceRoot,
      "--release",
      f.releasePath,
      "--acquisition",
      "not-yet-read.json",
    ],
    { cwd: f.repository, encoding: "utf8", timeout: 5000 },
  )
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Connector input closed/)
  assert.equal(fs.existsSync(path.join(f.root, "runs/closed/authoring-delivery/input.json")), false)
  assert.equal(fs.existsSync(path.join(f.sourceRoot, "authoring-write-intents")), false)
})
