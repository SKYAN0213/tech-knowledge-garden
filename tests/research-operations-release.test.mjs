import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  evidenceReference,
  finalizeDevelopmentRelease,
} from "../scripts/research/development-release.mjs"
import { readOperationGate, DEVELOPMENT_CHECKS } from "../scripts/research/operation-policy.mjs"
import {
  installOperationsRelease,
  pinOperationalRound,
  inspectOperationalPin,
} from "../scripts/research/operations-release.mjs"
import {
  operationalRoundStatus,
  runOperationalRound,
} from "../scripts/research/operations-runtime.mjs"
import { atomicCreate } from "../scripts/research/run-state.mjs"
import { moduleCLI } from "../scripts/research/module-cli.mjs"
import {
  activateOperationsRuntime,
  operationsReadiness,
} from "../scripts/research/operations-deployment.mjs"
import {
  captureManualInvocation,
  checkedOperationalInvocation,
} from "../scripts/research/schedule-contract.mjs"
const repo = fs.realpathSync(fileURLToPath(new URL("../", import.meta.url)))
async function setup(t, { commonAssets = false } = {}) {
  fs.mkdirSync(path.join(repo, ".local/research"), { recursive: true })
  const base = fs.mkdtempSync(path.join(repo, ".local/research/operations-release-test-"))
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  const source = path.join(base, "source"),
    runtime = path.join(base, "runtime")
  for (const dir of ["data", "docs", "scripts", ".local/research"])
    fs.mkdirSync(path.join(source, dir), { recursive: true })
  for (const name of [
    "research-model-policy.json",
    "research-model-policy-codex.json",
    "research-source-channels.json",
    "research-operation-policy.json",
  ])
    fs.copyFileSync(path.join(repo, "data", name), path.join(source, "data", name))
  fs.copyFileSync(
    path.join(repo, "docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md"),
    path.join(source, "docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md"),
  )
  fs.writeFileSync(
    path.join(source, "scripts/unit.mjs"),
    "// Unit only, never an operational release.\n",
  )
  if (commonAssets) {
    const vendor = "scripts/vendor/semantic-common/0.1.1"
    fs.cpSync(path.join(repo, vendor), path.join(source, vendor), { recursive: true })
    fs.writeFileSync(path.join(source, "scripts/unrelated.md"), "Not a runtime asset.\n")
  }
  atomicCreate(source, ".local/research/proof.json", { unit_fixture_only: true })
  const proof = evidenceReference(source, ".local/research/proof.json")
  const review = atomicCreate(source, ".local/research/review.json", {
    schema: "research-development-review/v1",
    release_id: "unit-operations-only",
    executor: "codex",
    storage_backend: "connected_drive",
    checks: Object.fromEntries(
      DEVELOPMENT_CHECKS.map((k) => [k, { status: "passed", evidence: [proof] }]),
    ),
  })
  await finalizeDevelopmentRelease(source, review)
  assert.equal(installOperationsRelease(source, runtime).status, "installed")
  const root = path.join(runtime, ".local/research/local-ai")
  fs.mkdirSync(root, { recursive: true })
  const ctx = {
    repo: runtime,
    root,
    vault: path.join(runtime, "vault"),
    policy: path.join(runtime, "data/research-model-policy-codex.json"),
  }
  const event = {
    kind: "scheduled",
    schedule_id: "tech-knowledge-garden-04",
    execution_id: "unit-only",
    started_at: "2026-10-24T19:00:00Z",
  }
  const evidence = atomicCreate(root, "scheduler-event.json", event)
  const invocation = atomicCreate(root, "invocation.json", {
    schema: "research-scheduled-invocation/v2",
    ...event,
    reason: "unit fixture only",
    evidence,
  })
  return {
    source,
    runtime,
    root,
    ctx,
    p: {
      run_id: "unit-round",
      invocation_path: invocation.path,
      invocation_sha256: invocation.sha256,
    },
  }
}
test("installed release preserves and pins every frozen common asset, including raw CRLF and specifications", async (t) => {
  const f = await setup(t, { commonAssets: true })
  const vendor = "scripts/vendor/semantic-common/0.1.1"
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(f.runtime, ".local/.storage/releases/unit-operations-only/manifest.json"),
    ),
  )
  const common = JSON.parse(fs.readFileSync(path.join(f.source, vendor, "artifact-manifest.json")))
  for (const [relative, expected] of Object.entries(common.files)) {
    const file = vendor + "/" + relative
    assert.ok(
      manifest.files.some((entry) => entry.path === file),
      file,
    )
    assert.deepEqual(
      fs.readFileSync(path.join(f.runtime, file)),
      fs.readFileSync(path.join(f.source, file)),
    )
    assert.equal(evidenceReference(f.runtime, file).sha256, expected.sha256)
  }
  assert.ok(!manifest.files.some((entry) => entry.path === "scripts/unrelated.md"))
  assert.equal(readOperationGate(f.runtime).status, "ready")
  const raw = vendor + "/fixtures/sources/crlf-nfd.txt"
  fs.chmodSync(path.join(f.runtime, raw), 0o644)
  fs.writeFileSync(path.join(f.runtime, raw), "changed raw bytes\n")
  const gate = readOperationGate(f.runtime)
  assert.equal(gate.reason, "development_implementation_changed")
  assert.equal(gate.changed_path, raw)
})
test("installed execution survives source edits; round pin is idempotent, duplicate execution and runtime drift fail closed", async (t) => {
  const f = await setup(t)
  fs.writeFileSync(path.join(f.source, "scripts/unit.mjs"), "// development changed\n")
  assert.equal(readOperationGate(f.runtime).status, "ready")
  assert.equal(readOperationGate(f.source).status, "development_pending")
  assert.equal((await pinOperationalRound(f.ctx, f.p)).reused, false)
  assert.equal((await pinOperationalRound(f.ctx, f.p)).reused, true)
  await assert.rejects(
    pinOperationalRound(f.ctx, { ...f.p, run_id: "another-round" }),
    /already belongs/,
  )
  assert.equal(inspectOperationalPin(f.ctx, f.p.run_id).release_id, "unit-operations-only")
  const before = fs.readdirSync(f.root, { recursive: true }).sort()
  const status = operationalRoundStatus(f.ctx, f.p.run_id)
  assert.equal(status.status, "pinned")
  assert.equal(status.timing.acceptance, "fixed_input_replay_required")
  assert.deepEqual(fs.readdirSync(f.root, { recursive: true }).sort(), before)
  fs.chmodSync(path.join(f.runtime, "scripts/unit.mjs"), 0o644)
  fs.writeFileSync(path.join(f.runtime, "scripts/unit.mjs"), "// tampered\n")
  assert.throws(() => operationalRoundStatus(f.ctx, f.p.run_id), /execution changed/)
})
test("existing module CLI exposes read-only round status and development hold without creating a run", async (t) => {
  const f = await setup(t)
  // Simulate an unpromoted source edit. The round must stop at the development
  // gate before it can require an installed runtime or create operational state.
  fs.writeFileSync(path.join(f.source, "scripts/unit.mjs"), "// pending development\n")
  const root = path.join(f.source, ".local/research/never-created-operations-test")
  assert.equal(fs.existsSync(root), false)
  const args = ["--repo", f.source, "--root", root, "--round", "development-test"]
  const status = await moduleCLI(["status", ...args])
  assert.equal(status.status, "not_started")
  const run = await moduleCLI(["run", ...args, "--stage", "collection"])
  assert.equal(run.status, "development_pending")
  assert.equal(fs.existsSync(root), false)
})
test("processing cannot start without a frozen collection handoff", async (t) => {
  const f = await setup(t)
  await assert.rejects(
    runOperationalRound(f.ctx, { ...f.p, stage: "processing" }),
    /immutable collection handoff/,
  )
})

test("activation binds the actual Git workspace and existing dependency trees without copying content", async (t) => {
  const f = await setup(t)
  for (const dir of ["node_modules", "integrations/research-mcp/node_modules"])
    fs.mkdirSync(path.join(f.source, dir), { recursive: true })
  assert.equal((await activateOperationsRuntime(f.runtime, f.source)).operational_ready, true)
  assert.equal(operationsReadiness(f.source).runtime, f.runtime)
  assert.equal(fs.existsSync(path.join(f.runtime, "vault")), false)
  assert.equal(
    fs.realpathSync(path.join(f.runtime, "node_modules")),
    path.join(f.source, "node_modules"),
  )
  const root = path.join(f.source, ".local/research/local-ai")
  fs.mkdirSync(root, { recursive: true })
  const ctx = { ...f.ctx, repo: f.source, root, executionRepo: f.runtime }
  const ref = captureManualInvocation(ctx, {
    execution_id: "operator-verification",
    reason: "Explicit unit operator request",
  })
  assert.equal(checkedOperationalInvocation(ctx, ref).kind, "manual")
  assert.deepEqual(
    captureManualInvocation(ctx, {
      execution_id: "operator-verification",
      reason: "Explicit unit operator request",
    }),
    ref,
  )
  await pinOperationalRound(ctx, {
    run_id: "operator-verification",
    invocation_path: ref.path,
    invocation_sha256: ref.sha256,
  })
  assert.equal(inspectOperationalPin(ctx, "operator-verification").execution_repository, f.runtime)
  assert.equal(fs.existsSync(path.join(root, "operations/scheduled-executions")), false)
  fs.writeFileSync(path.join(f.source, "scripts/unit.mjs"), "// workspace publisher drift\n")
  assert.throws(() => operationsReadiness(f.source), /workspace implementation changed/)
  assert.equal(readOperationGate(f.runtime).status, "ready")
})

test("activation refuses a live or unknown writer and manual captures never accept scheduled attribution", async (t) => {
  const f = await setup(t)
  for (const dir of ["node_modules", "integrations/research-mcp/node_modules"])
    fs.mkdirSync(path.join(f.source, dir), { recursive: true })
  const root = path.join(f.source, ".local/research/local-ai")
  atomicCreate(root, "module-jobs/module-live/state.json", { state: "running", pid: process.pid })
  await assert.rejects(activateOperationsRuntime(f.runtime, f.source), /Active workspace writer/)
  assert.equal(fs.existsSync(path.join(f.source, ".local/.storage/active-runtime.json")), false)
  const ctx = { ...f.ctx, root }
  const ref = atomicCreate(root, "manual-pretending-to-be-scheduled.json", {
    schema: "research-manual-invocation/v1",
    kind: "manual",
    origin: "operator_cli",
    execution_id: "test",
    reason: "unit",
    started_at: new Date().toISOString(),
    schedule_id: "tech-knowledge-garden-04",
  })
  assert.throws(() => checkedOperationalInvocation(ctx, ref), /Exact manual/)
})
