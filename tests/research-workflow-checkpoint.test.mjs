import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fixture } from "./fixtures/publication-operation.mjs"
import {
  preparePublicationOperation,
  recordPublicationPush,
  recordPublicationDeployment,
  recordPublicationReadback,
} from "../scripts/research/publication-operation.mjs"
import {
  verifyPublicReadback,
  archivePublicReadback,
} from "../scripts/research/public-readback.mjs"
import {
  freezeShadowCollectionInputs,
  freezeShadowHandoffBasis,
} from "../scripts/research/shadow-collection-basis.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { registerArchiveLocation } from "../scripts/research/archive-locations.mjs"
import {
  workflowCheckpointPlan,
  createWorkflowCheckpoint,
  restoreWorkflowCheckpoint,
} from "../scripts/research/workflow-checkpoint.mjs"

async function setup(t) {
  const f = await fixture(t)
  await preparePublicationOperation({ ...f.options, releasePath: f.releasePath })
  await recordPublicationPush({ ...f.options, pushPath: f.pushPath })
  await recordPublicationDeployment({ ...f.options, deployment: f.deployment })
  await verifyPublicReadback({ ...f.rbOptions, fetchImpl: f.fetchImpl })
  await recordPublicationReadback({ ...f.options, readbackRun: "readback" })
  await archivePublicReadback(f.rbOptions)
  const config = path.join(f.repository, "route-fixture.json")
  fs.writeFileSync(config, "controlled fixture config")
  const configHash = sha256(`${config}:${sha256(fs.readFileSync(config))}`)
  const plan = {
    schema: "research-daily-plan/v1",
    run_id: "daily",
    config_sha256: configHash,
    windows: [],
  }
  atomicWrite(f.root, "daily/runs/daily/plan.json", plan)
  atomicWrite(f.root, "daily/runs/daily/summary.json", {
    schema: "research-daily-summary/v1",
    run_id: "daily",
    receipts: 0,
  })
  await freezeShadowCollectionInputs({
    root: f.root,
    plan,
    activeRoutes: ["controlled"],
    sourcePaths: [config],
    configFile: config,
  })
  const backlogFile = path.join(f.repository, "backlog.json")
  fs.writeFileSync(
    backlogFile,
    JSON.stringify({
      schema: "research-candidates/v1",
      candidates: [{ key: "one", review_status: "unreviewed" }],
    }),
  )
  const inputs = {
    plan_sha256: sha256(fs.readFileSync(path.join(f.root, "daily/runs/daily/plan.json"))),
    backlog_sha256: sha256(fs.readFileSync(backlogFile)),
    daily_coverage_sha256: null,
    receipts_sha256: sha256(JSON.stringify([])),
  }
  const handoffPath = `daily/runs/daily/handoffs/${sha256(JSON.stringify(inputs))}.json`
  atomicWrite(f.root, handoffPath, {
    schema: "research-editorial-handoff/v1",
    daily_run: "daily",
    inputs,
    pending: [],
  })
  await freezeShadowHandoffBasis({
    root: f.root,
    dailyRun: "daily",
    handoffPath,
    backlogFile,
    receipts: [],
  })
  return {
    f,
    options: {
      root: f.root,
      run: "snapshot",
      dailyRun: "daily",
      publicationRun: "operation",
      backlogFile,
      vault: path.join(f.repository, "vault"),
      repository: f.repository,
    },
  }
}

test("workflow checkpoint restores frozen daily inputs, candidate ledger, nested authoring and native archived publication without network", async (t) => {
  const { f, options } = await setup(t),
    calls = f.calls()
  const created = await createWorkflowCheckpoint(options)
  const newRoot = path.join(f.repository, "new-worker")
  atomicWrite(newRoot, "runtime/keep.txt", "existing environment")
  const restoreOptions = {
    root: newRoot,
    checkpointRoot: f.root,
    run: "snapshot",
    destination: "workflow-restores/recovered",
  }
  const restored = await restoreWorkflowCheckpoint(restoreOptions)
  assert.equal(restored.candidates, 1)
  assert.equal(restored.publication.status, "public_bytes_verified")
  assert.equal(restored.publication.observation_basis, "archived_observation")
  assert.equal(restored.full_runtime_recovered, false)
  assert.equal(restored.candidate_published, false)
  assert.equal(fs.readFileSync(path.join(restored.vault, f.edition), "utf8"), "# Reviewed news\n")
  assert.deepEqual(await restoreWorkflowCheckpoint(restoreOptions), restored)
  assert.equal(
    fs.readFileSync(path.join(newRoot, "runtime/keep.txt"), "utf8"),
    "existing environment",
  )
  assert.equal((await createWorkflowCheckpoint(options)).package.sha256, created.package.sha256)
  assert.equal(f.calls(), calls)
  fs.writeFileSync(path.join(restored.root, "daily/runs/daily/plan.json"), "changed")
  await assert.rejects(restoreWorkflowCheckpoint(restoreOptions), /conflict/)
  assert.equal(
    fs.readFileSync(path.join(restored.root, "daily/runs/daily/plan.json"), "utf8"),
    "changed",
  )
})

test("tampered bytes, traversal and symlink destinations fail before any restore output; changed source ledger cannot reuse checkpoint", async (t) => {
  const { f, options } = await setup(t)
  await createWorkflowCheckpoint(options)
  const manifestFile = path.join(f.root, "runs/snapshot/workflow-checkpoint/manifest.json"),
    original = fs.readFileSync(manifestFile),
    m = JSON.parse(original)
  const file = path.join(f.root, m.files.at(-1).stored_path),
    bytes = fs.readFileSync(file)
  fs.writeFileSync(file, "corrupt")
  await assert.rejects(
    restoreWorkflowCheckpoint({
      root: f.root,
      run: "snapshot",
      destination: "workflow-restores/corrupt",
    }),
    /hash mismatch/,
  )
  assert.equal(fs.existsSync(path.join(f.root, "workflow-restores/corrupt")), false)
  fs.writeFileSync(file, bytes)
  m.files[0].destination = "root/daily/../../escape"
  fs.writeFileSync(manifestFile, JSON.stringify(m))
  await assert.rejects(
    restoreWorkflowCheckpoint({
      root: f.root,
      run: "snapshot",
      destination: "workflow-restores/escape",
    }),
    /escaping/,
  )
  assert.equal(fs.existsSync(path.join(f.root, "workflow-restores/escape")), false)
  fs.writeFileSync(manifestFile, original)
  fs.mkdirSync(path.join(f.root, "workflow-restores"), { recursive: true })
  fs.symlinkSync(f.repository, path.join(f.root, "workflow-restores/link"))
  await assert.rejects(
    restoreWorkflowCheckpoint({
      root: f.root,
      run: "snapshot",
      destination: "workflow-restores/link",
    }),
    /Symlink/,
  )
  fs.writeFileSync(
    options.backlogFile,
    JSON.stringify({ schema: "research-candidates/v1", candidates: [] }),
  )
  await assert.rejects(createWorkflowCheckpoint(options), /inputs changed/)
})

test("large coordinator inventories split automatically; no missing part is treated as recovered", async (t) => {
  const { f, options } = await setup(t)
  for (let i = 0; i < 1001; i++)
    atomicWrite(f.root, `daily/runs/daily/controlled-evidence/${i}.txt`, "controlled fixture")
  const created = await createWorkflowCheckpoint(options)
  assert.ok(created.parts.length >= 2)
  const m = JSON.parse(
    fs.readFileSync(path.join(f.root, "runs/snapshot/workflow-checkpoint/manifest.json")),
  )
  const lost = path.join(f.root, m.files.at(-1).stored_path)
  fs.unlinkSync(lost)
  await assert.rejects(
    restoreWorkflowCheckpoint({
      root: f.root,
      run: "snapshot",
      destination: "workflow-restores/missing",
    }),
    /ENOENT/,
  )
  assert.equal(fs.existsSync(path.join(f.root, "workflow-restores/missing")), false)
})

test("unfrozen daily coordinator state cannot become a checkpoint", async (t) => {
  const { f, options } = await setup(t)
  fs.unlinkSync(path.join(f.root, "daily/runs/daily/shadow-basis.json"))
  assert.throws(() => workflowCheckpointPlan(options), /Frozen daily handoff/)
})

test("workflow archive custody registers exact private bytes without granting dependency closure or a source index", async (t) => {
  const { f, options } = await setup(t),
    created = await createWorkflowCheckpoint(options)
  for (const p of [...created.parts, { ...created.package, run_id: created.run_id }]) {
    const metadata = {
      schema: "research-drive-archive-observation/v1",
      observed_at: new Date().toISOString(),
      file_id: "controlled-file",
      name: p.run_id + ".zip",
      mime_type: "application/zip",
      shared: false,
      parent_ids: ["controlled-parent"],
      size: p.bytes,
    }
    const metadataFile = path.join(f.repository, "metadata.json")
    fs.writeFileSync(metadataFile, JSON.stringify(metadata))
    const input = {
      root: f.root,
      runId: p.run_id,
      metadataFile,
      remotePackageFile: path.join(f.root, p.path),
      expectedParentId: "controlled-parent",
    }
    const registered = await registerArchiveLocation(input)
    assert.equal(registered.storage_kind, "workflow_checkpoint")
    assert.equal(registered.dependency_closed, false)
    assert.equal(registered.candidate_approved, false)
    assert.deepEqual(registered.sources, [])
    await assert.rejects(
      registerArchiveLocation({ ...input, reindex: true }),
      /no source or article index/,
    )
  }
})
