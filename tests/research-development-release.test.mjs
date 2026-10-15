import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { sha256 } from "../scripts/research/contracts.mjs"
import { moduleContext } from "../scripts/research/module-runtime.mjs"
import { operatorOptions, runLocalOperator } from "../integrations/research-mcp/operator.mjs"
import { driveStorageAction } from "../scripts/research/drive-storage.mjs"
import { readOperationGate, DEVELOPMENT_CHECKS } from "../scripts/research/operation-policy.mjs"
import {
  evidenceReference,
  finalizeDevelopmentRelease,
} from "../scripts/research/development-release.mjs"

const repo = fileURLToPath(new URL("../", import.meta.url))
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-gpt-release-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const dir of ["data", "docs", "scripts", ".local/research"])
    fs.mkdirSync(path.join(root, dir), { recursive: true })
  for (const name of [
    "research-model-policy.json",
    "research-model-policy-codex.json",
    "research-source-channels.json",
  ])
    fs.copyFileSync(path.join(repo, "data", name), path.join(root, "data", name))
  fs.copyFileSync(
    path.join(repo, "docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md"),
    path.join(root, "docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md"),
  )
  fs.writeFileSync(
    path.join(root, "scripts/fixture.mjs"),
    "// Unit fixture only; never an operational acceptance result.\n",
  )
  const policy = {
    ...JSON.parse(fs.readFileSync(path.join(repo, "data/research-operation-policy.json"))),
    phase: "development",
    development_completion: null,
  }
  const save = (p) =>
    fs.writeFileSync(path.join(root, "data/research-operation-policy.json"), JSON.stringify(p))
  save(policy)
  const proof = ".local/research/unit-evidence.json"
  fs.writeFileSync(path.join(root, proof), JSON.stringify({ fixture_only: true }))
  const review = {
    schema: "research-development-review/v1",
    release_id: "unit-gpt-release",
    executor: "codex",
    storage_backend: "connected_drive",
    checks: Object.fromEntries(
      DEVELOPMENT_CHECKS.map((key) => [
        key,
        { status: "passed", evidence: [evidenceReference(root, proof)] },
      ]),
    ),
  }
  function reviewRef() {
    const file = ".local/research/unit-review.json"
    fs.writeFileSync(path.join(root, file), JSON.stringify(review))
    return evidenceReference(root, file)
  }
  return { root, policy, save, review, reviewRef, proof }
}

test("GPT release needs six scoped checks; local OAuth and operating-day counts are separate", async (t) => {
  const f = fixture(t)
  assert.equal(DEVELOPMENT_CHECKS.length, 6)
  assert.equal(DEVELOPMENT_CHECKS.includes("local_execution_resume"), false)
  assert.equal(readOperationGate(f.root).regular_execution_allowed, false)
  const result = await finalizeDevelopmentRelease(f.root, f.reviewRef())
  assert.equal(result.status, "ready")
  assert.equal(result.production_release_verified, false)
  assert.equal(result.scheduled_runs_counted, 0)
  const gate = readOperationGate(f.root)
  assert.equal(gate.regular_execution_allowed, true)
  assert.equal(gate.default_executor, "codex")
  assert.equal(gate.storage_backend, "connected_drive")
  assert.equal(gate.local_execution_enabled, false)
  assert.equal(
    readOperationGate(f.root, { executor: "ollama" }).reason,
    "local_executor_not_enabled",
  )
  assert.deepEqual(await finalizeDevelopmentRelease(f.root, f.reviewRef()), result)
})

test("missing and changed review evidence never promote the operation policy", async (t) => {
  const f = fixture(t)
  f.review.checks.gpt_execution_resume.status = "pending"
  await assert.rejects(finalizeDevelopmentRelease(f.root, f.reviewRef()), /six GPT/)
  assert.equal(readOperationGate(f.root).regular_execution_allowed, false)
  f.review.checks.gpt_execution_resume.status = "passed"
  const ref = f.reviewRef()
  fs.writeFileSync(path.join(f.root, f.proof), '{"fixture_only":"changed"}')
  await assert.rejects(finalizeDevelopmentRelease(f.root, ref), /evidence changed/)
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(f.root, "data/research-operation-policy.json"))).phase,
    "development",
  )
})

test("ready receipt is invalidated by code bytes, added files and execution policy drift", async (t) => {
  const f = fixture(t)
  fs.mkdirSync(path.join(f.root, "web"))
  fs.writeFileSync(path.join(f.root, "web/reader.mjs"), "// Reader runtime must be pinned too.\n")
  fs.mkdirSync(path.join(f.root, "integrations/research-worker"), { recursive: true })
  fs.writeFileSync(
    path.join(f.root, "integrations/research-worker/worker.py"),
    "# Native parser runtime must be pinned.\n",
  )
  await finalizeDevelopmentRelease(f.root, f.reviewRef())
  const file = path.join(f.root, "scripts/fixture.mjs"),
    before = fs.readFileSync(file)
  fs.writeFileSync(file, "// changed implementation\n")
  assert.equal(readOperationGate(f.root).reason, "development_implementation_changed")
  fs.writeFileSync(file, before)
  fs.writeFileSync(path.join(f.root, "scripts/added.mjs"), "// new runtime dependency\n")
  assert.equal(readOperationGate(f.root).reason, "development_implementation_set_changed")
  fs.unlinkSync(path.join(f.root, "scripts/added.mjs"))
  fs.writeFileSync(path.join(f.root, "web/reader.mjs"), "// Reader changed.\n")
  assert.equal(readOperationGate(f.root).changed_path, "web/reader.mjs")
  fs.writeFileSync(path.join(f.root, "web/reader.mjs"), "// Reader runtime must be pinned too.\n")
  fs.writeFileSync(
    path.join(f.root, "integrations/research-worker/worker.py"),
    "# Parser changed.\n",
  )
  assert.equal(readOperationGate(f.root).changed_path, "integrations/research-worker/worker.py")
  const p = JSON.parse(fs.readFileSync(path.join(f.root, "data/research-operation-policy.json")))
  f.save({ ...p, recovery: { ...p.recovery, reuse_completed: false } })
  assert.throws(() => readOperationGate(f.root), /Invalid research operation policy/)
})

test("a ready GPT system cannot start the local operator or OAuth regular transfer", async (t) => {
  const f = fixture(t)
  await finalizeDevelopmentRelease(f.root, f.reviewRef())
  const result = await runLocalOperator(
    { repo: f.root, root: ".local/research/unstarted", run: "unit-local-block", regular: true },
    {
      planner: () => {
        throw Error("Must not call a local model")
      },
      client: {
        listTools: () => {
          throw Error("Must not connect MCP")
        },
      },
    },
  )
  assert.equal(result.operation_gate.reason, "local_executor_not_enabled")
  assert.equal(result.state, "executor_not_ready")
  assert.equal(result.checkpoint, null)
  assert.equal(fs.existsSync(path.join(f.root, ".local/research/unstarted")), false)
  const transfer = await driveStorageAction(
    f.root,
    path.join(f.root, ".local"),
    "remote-push",
    { regular: true },
    {
      fetchImpl: () => {
        throw Error("Must not access local OAuth or Drive")
      },
    },
  )
  assert.equal(transfer.operation_gate.reason, "local_executor_not_enabled")
  assert.equal(transfer.status, "executor_not_ready")
  assert.equal(transfer.remote_requests, 0)
  assert.equal(fs.existsSync(path.join(f.root, ".local/.storage/credentials")), false)
})

test("MCP defaults to GPT while an explicitly chosen local operator keeps its local policy", (t) => {
  const f = fixture(t)
  assert.equal(
    moduleContext({ repo: f.root }).policy,
    path.join(f.root, "data/research-model-policy-codex.json"),
  )
  assert.equal(
    operatorOptions({ repo: f.root, run: "unit-local-explicit" }).ctx.policy,
    path.join(f.root, "data/research-model-policy.json"),
  )
})

test("a success label without a pinned implementation cannot open a regular run", (t) => {
  const f = fixture(t)
  const relative = ".local/research/legacy-completion.json"
  const body = JSON.stringify({
    schema: "research-development-completion/v1",
    release_id: "old-label",
    development_complete: true,
    checks: Object.fromEntries(DEVELOPMENT_CHECKS.map((key) => [key, "passed"])),
  })
  fs.writeFileSync(path.join(f.root, relative), body)
  f.save({
    ...f.policy,
    phase: "ready",
    development_completion: { path: relative, sha256: sha256(body) },
  })
  assert.equal(readOperationGate(f.root).reason, "development_checks_incomplete")
})
