import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
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
  auditCurationFrontier,
  runOperationalRound,
  relayOperationalReasoning,
} from "../scripts/research/operations-runtime.mjs"
import { driveOperationalRound } from "../scripts/research/operations-driver.mjs"
import { atomicCreate, atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { continueOperationalRound } from "../scripts/research/operations-continuation.mjs"
import { createReasoningTask, submitReasoningResult } from "../scripts/research/reasoning-tasks.mjs"
import { editionFixture } from "./fixtures/research-event-fixtures.mjs"
import { executeModule } from "../scripts/research/module-registry.mjs"
import { advanceRoundWorkflow } from "../scripts/research/round-workflow.mjs"
import { moduleCLI } from "../scripts/research/module-cli.mjs"
import {
  activateOperationsRuntime,
  operationsReadiness,
  assertNoOperationalWriter,
} from "../scripts/research/operations-deployment.mjs"
import {
  captureManualInvocation,
  captureScheduledInvocation,
  checkedOperationalInvocation,
} from "../scripts/research/schedule-contract.mjs"
const repo = fs.realpathSync(fileURLToPath(new URL("../", import.meta.url)))
async function setup(t, { commonAssets = false, rendererAssets = false, retiredWorkspace } = {}) {
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
  if (retiredWorkspace)
    fs.writeFileSync(
      path.join(source, "data/research-retired-workspaces.json"),
      JSON.stringify({ schema: "research-retired-workspaces/v1", workspaces: [retiredWorkspace] }),
    )
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
  if (rendererAssets) {
    for (const file of [
      "quartz.config.yaml",
      "quartz.config.default.yaml",
      "quartz.ts",
      ".quartz/plugins/index.ts",
      "quartz/static/icon.png",
      "quartz/static/og-image.png",
    ]) {
      const target = path.join(source, file)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(
        target,
        file.endsWith(".png")
          ? Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff])
          : `renderer fixture: ${file}\n`,
      )
    }
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

async function pendingProposalFixture(t) {
  const f = await setup(t)
  await pinOperationalRound(f.ctx, f.p)
  const run = f.p.run_id
  const parent = readJSON(f.root, `operations/rounds/${run}/input.json`)
  const workflow = {
    run_id: run,
    source: { kind: "daily", daily_run: "daily-original" },
    collection_config: evidenceReference(f.runtime, "data/research-source-channels.json"),
    policy: evidenceReference(f.runtime, "data/research-model-policy-codex.json"),
  }
  atomicCreate(f.root, `round-workflows/${run}/input.json`, workflow)
  const report = atomicCreate(f.root, "proposal-partial-report.json", {
    schema: "research-collection-report/v1", daily_run: "daily-original", status: "partial",
    candidate_approved: false, candidate_published: false, counts: { pending_windows: 0 },
  })
  const edition = atomicCreate(f.root, "proposal-frozen-edition.json", {
    schema: "research-edition-materials/v1", daily_run: "daily-original", status: "partial",
    report, candidate_approved: false, candidate_published: false,
  })
  const jobId = "module-event-proposal-fixture"
  const parameters = { execute: true, propose: true, review_mode: "combined/v1",
    run_id: run, round: true, collect: false }
  const jobInput = { job_id: jobId, module: "edition", operation: "advance", parameters,
    context: { operationalRound: { round_id: run, round_input_sha256: sha256(JSON.stringify(parent)) } } }
  const jobInputSha = sha256(JSON.stringify(jobInput))
  atomicCreate(f.root, `module-jobs/${jobId}/input.json`, jobInput)
  const stopped = spawnSync(process.execPath, ["-e", ""], { stdio: "ignore" })
  assert.equal(stopped.status, 0)
  assert.ok(stopped.pid > 0)
  const jobState = { job_id: jobId, input_sha256: jobInputSha,
    state: "waiting_for_reasoning", pid: stopped.pid }
  atomicCreate(f.root, `module-jobs/${jobId}/state.json`, jobState)
  const owner = { job_id: jobId, input_sha256: jobInputSha,
    round_id: run, round_input_sha256: sha256(JSON.stringify(parent)) }
  const created = createReasoningTask(f.root, {
    run: "ev-prop-" + "a".repeat(40), role: "search_plan",
    binding: { settings: { model: "gpt-6-luna", provider: "codex", think: "medium" } },
    input: { schema: { type: "object", required: ["events"],
      properties: { events: { type: "array" } }, additionalProperties: false } },
    owner,
  })
  const task = { task_id: created.task_id, request_sha256: created.request_sha256 }
  atomicWrite(f.root, `module-jobs/${jobId}/state.json`, { ...jobState, reasoning_task: task })
  atomicCreate(f.root, `operations/rounds/${run}/commands/proposal.json`, {
    stage: "processing", module: "edition", operation: "advance", parameters, job_id: jobId,
  })
  const state = { status: "waiting_for_reasoning", input_sha256: sha256(JSON.stringify(workflow)),
    edition, article_writes: 0, canonical_writes: 0, candidate_published: false,
    stages: { collection: { status: "partial", reference: report },
      edition: { status: "frozen", reference: edition },
      events: { status: "waiting_for_reasoning", reasoning_task: task } },
    next_inputs: [{ stage: "reasoning", reasoning_task: task, required: ["reasoning_result", "resume"] }] }
  atomicCreate(f.root, `round-workflows/${run}/latest.json`, state)
  return { ...f, run, parent, workflow, report, edition, jobId, jobInput, jobState, task, state }
}

async function curationRequiredFixture(t, { continued = false } = {}) {
  const f = await setup(t)
  const source = editionFixture(t)
  const reviewed = await executeModule(source.ctx, "classification", "review", source.parameters)
  fs.cpSync(source.root, f.root, { recursive: true, force: false,
    filter: (file) => !path.relative(source.root, file).split(path.sep).includes(".storage") })
  await pinOperationalRound(f.ctx, f.p)
  const run = f.p.run_id
  const plan = { path: reviewed.path, sha256: reviewed.sha256 }
  const edition = source.editionRef
  const origin = {
    run_id: run,
    source: { kind: "daily", daily_run: "daily-fixture" },
    collection_config: evidenceReference(f.runtime, "data/research-source-channels.json"),
    policy: evidenceReference(f.runtime, "data/research-model-policy-codex.json"),
  }
  if (continued) {
    const originalPin = atomicCreate(f.root, "operations/rounds/unit-origin/input.json", { run_id: "unit-origin" })
    const originalWorkflow = atomicCreate(f.root, "round-workflows/unit-origin/input.json", origin)
    const link = atomicCreate(f.root, "operations/rounds/unit-origin/continuation-evidence.json", {
      parent: originalPin, workflow: originalWorkflow,
    })
    const parentPath = `operations/rounds/${run}/input.json`
    atomicWrite(f.root, parentPath, { ...readJSON(f.root, parentPath), continuation: link })
  }
  const workflow = continued ? { ...origin, source: { kind: "edition", edition } } : origin
  atomicCreate(f.root, `round-workflows/${run}/input.json`, workflow)
  const events = atomicCreate(f.root, "event-workflows/unit-events/latest.json", {
    schema: "research-event-workflow/v1", run_id: "unit-events", status: "relationship_review",
    edition, article_writes: 0, candidate_published: false,
  })
  const snapshot = atomicCreate(f.root, "runs/unit-handoff/event-publication/workflow.json",
    readJSON(f.root, events.path))
  const handoff = atomicCreate(f.root, "runs/unit-handoff/event-publication/handoff.json", {
    schema: "research-daily-publication-handoff/v3", run_id: "unit-handoff",
    workflow: { source: events, snapshot }, edition, plan: null, status: "relationship_review",
    workflow_status: "relationship_review", approved_runs: [],
    reused_runs: [], candidate_published: false, drive_verified: false, public_verified: false,
  })
  const state = {
    status: "curation_required", input_sha256: sha256(JSON.stringify(workflow)), edition, plan,
    event_workflow: events, publication_handoff: handoff,
    article_writes: 0, canonical_writes: 0, candidate_published: false,
    stages: { collection: { status: "partial", reference: source.report &&
      readJSON(f.root, edition.path).report }, edition: { status: "frozen", reference: edition },
      events: { status: "relationship_review", reference: events },
      publication: { status: "relationship_review", reference: handoff },
      curation: { status: "curation_required", plan } },
    next_inputs: [{ stage: "curation", module: "curation", operation: "prepare", plans: [plan],
      required: ["briefing_date", "reviewed_scores", "curation_path", "curation_sha256"] }],
  }
  atomicCreate(f.root, `round-workflows/${run}/latest.json`, state)
  const parent = readJSON(f.root, `operations/rounds/${run}/input.json`)
  const jobId = "module-curation-parent"
  const parameters = { run_id: run, execute: true, round: true }
  const jobInput = { job_id: jobId, module: "edition", operation: "advance", parameters,
    context: { operationalRound: { round_id: run, round_input_sha256: sha256(JSON.stringify(parent)) } } }
  const input = atomicCreate(f.root, `module-jobs/${jobId}/input.json`, jobInput)
  const result = atomicCreate(f.root, `module-jobs/${jobId}/result.json`, { status: "curation_required" })
  const stopped = spawnSync(process.execPath, ["-e", ""], { stdio: "ignore" })
  assert.equal(stopped.status, 0)
  const jobState = { job_id: jobId, state: "completed", pid: stopped.pid,
    input_sha256: sha256(JSON.stringify(jobInput)), result }
  const job = atomicCreate(f.root, `module-jobs/${jobId}/state.json`, jobState)
  const command = atomicCreate(f.root, `operations/rounds/${run}/commands/processing.json`, {
    stage: "processing", module: "edition", operation: "advance", parameters, job_id: jobId,
  })
  return { ...f, run, plan, edition, events, handoff, workflow, state,
    job: { input, result, state: job, jobState, command } }
}

test("runtime cutover refuses the real submission lock and a terminal worker still cleaning up", async (t) => {
  const f = await setup(t)
  const root = path.join(f.source, ".local/research/local-ai")
  atomicWrite(root, "locks/module-job-submit.json", { owner: "test", pid: process.pid })
  assert.throws(() => assertNoOperationalWriter(f.source), /lock|submission/i)
  fs.unlinkSync(path.join(root, "locks/module-job-submit.json"))
  atomicWrite(root, "module-jobs/module-cleanup/state.json", {
    job_id: "module-cleanup",
    state: "completed",
    pid: process.pid,
  })
  atomicWrite(root, "locks/module-worker-module-cleanup.json", { owner: "test", pid: process.pid })
  assert.throws(() => assertNoOperationalWriter(f.source), /worker|writer/i)
})

test("activation serializes with submissions and only accepts the current process's exact held lock", async (t) => {
  const f = await setup(t)
  for (const dir of ["node_modules", "integrations/research-mcp/node_modules"])
    fs.mkdirSync(path.join(f.source, dir), { recursive: true })
  const root = path.join(f.source, ".local/research/local-ai")
  const owner = "a8db0841-08ce-4ee9-b7a0-073055532e52"
  atomicWrite(root, "locks/module-job-submit.json", { owner, pid: process.pid })
  await assert.rejects(activateOperationsRuntime(f.runtime, f.source), /EEXIST|lock/i)
  await assert.rejects(
    activateOperationsRuntime(f.runtime, f.source, { ownedSubmission: "wrong-owner" }),
    /submission lock/i,
  )
  assert.equal(
    (await activateOperationsRuntime(f.runtime, f.source, { ownedSubmission: owner }))
      .operational_ready,
    true,
  )
  fs.unlinkSync(path.join(root, "locks/module-job-submit.json"))
  await assert.rejects(
    activateOperationsRuntime(f.runtime, f.source, { ownedSubmission: owner }),
    /submission lock/i,
  )
})
test("runtime installation and workspace activation bind actual renderer configuration bytes", async (t) => {
  const f = await setup(t, { rendererAssets: true })
  const rendererFiles = [
    "quartz.config.yaml",
    "quartz.config.default.yaml",
    "quartz.ts",
    ".quartz/plugins/index.ts",
    "quartz/static/icon.png",
    "quartz/static/og-image.png",
  ]
  for (const file of rendererFiles)
    assert.deepEqual(
      fs.readFileSync(path.join(f.runtime, file)),
      fs.readFileSync(path.join(f.source, file)),
    )
  for (const dir of ["node_modules", "integrations/research-mcp/node_modules"])
    fs.mkdirSync(path.join(f.source, dir), { recursive: true })
  assert.equal((await activateOperationsRuntime(f.runtime, f.source)).operational_ready, true)
  for (const file of rendererFiles) {
    const target = path.join(f.source, file)
    const original = fs.readFileSync(target)
    fs.writeFileSync(target, "changed renderer configuration\n")
    assert.throws(() => operationsReadiness(f.source), /workspace implementation changed/)
    fs.writeFileSync(target, original)
  }
  assert.equal(operationsReadiness(f.source).runtime, f.runtime)
})
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
test("a hash-bound old curation frontier reports missing selections and rejects changed children", async (t) => {
  const f = await setup(t)
  const first = { path: "plans/a.json", sha256: "a".repeat(64) }
  const second = { path: "plans/b.json", sha256: "b".repeat(64) }
  const selection = atomicWrite(f.root, "selection.json", { schema: "research-curation-selection/v1", selected: [
    { candidate_id: "a", execution: { plan: first, group_id: "one" } },
    { candidate_id: "b", execution: { plan: second, group_id: "two" } },
  ] })
  const child = atomicWrite(f.root, "child.json", { schema: "research-event-workflow/v1", run_id: "child",
    plan: first, curation: selection, rows: [{ group_id: "one", status: "approved" }] })
  const workflow = atomicWrite(f.root, "workflow.json", { schema: "research-curation-workflow/v1",
    selection, workflows: [{ plan: first, run_id: "child", workflow: child }] })
  const audit = auditCurationFrontier(f.root, selection, workflow)
  assert.equal(audit.verification, "pinned_hashes_only")
  assert.equal(audit.selected, 2)
  assert.equal(audit.recorded, 1)
  assert.equal(audit.missing[0].group_id, "two")
  assert.equal(audit.missing[0].queue_reason, "batch_not_in_checkpoint")
  atomicWrite(f.root, "child.json", { changed: true })
  assert.throws(() => auditCurationFrontier(f.root, selection, workflow), /evidence changed/)
})

test("read-only status can inspect a pinned earlier runtime without permitting its execution", async (t) => {
  const f = await setup(t)
  const root = path.join(f.source, ".local/research/local-ai")
  fs.mkdirSync(root, { recursive: true })
  for (const file of ["scheduler-event.json", "invocation.json"])
    fs.copyFileSync(path.join(f.root, file), path.join(root, file))
  const original = { ...f.ctx, repo: f.source, root, executionRepo: f.runtime,
    policy: path.join(f.source, "data/research-model-policy-codex.json") }
  await pinOperationalRound(original, f.p)
  fs.writeFileSync(path.join(f.source, "scripts/unit.mjs"), "// new operational release\n")
  assert.throws(() => operationalRoundStatus(original, f.p.run_id), /workspace implementation changed/)
  const current = { ...original, executionRepo: f.source }
  const workflowInput = { run_id: f.p.run_id, source: "fixture" }
  atomicWrite(root, `round-workflows/${f.p.run_id}/input.json`, workflowInput)
  atomicWrite(root, `round-workflows/${f.p.run_id}/latest.json`,
    { status: "partial", input_sha256: sha256(JSON.stringify(workflowInput)) })
  const audit = operationalRoundStatus(current, f.p.run_id, { readOnly: true })
  assert.equal(audit.status, "partial")
  assert.equal(audit.audit_only, true)
  assert.equal(audit.execution_readiness, "requires_explicit_continuation")
  assert.throws(() => inspectOperationalPin(original, f.p.run_id), /workspace implementation changed/)
  const command = { stage: "processing", module: "edition", operation: "advance", parameters: {} }
  const digest = sha256(JSON.stringify(command)), job = "module-operation-" + digest.slice(0, 48)
  atomicWrite(root, `operations/rounds/${f.p.run_id}/commands/${digest}.json`, { ...command, job_id: job })
  const input = { job_id: job, module: command.module, operation: command.operation,
    context: { repo: f.source, root } }
  atomicWrite(root, `module-jobs/${job}/input.json`, input)
  atomicWrite(root, `module-jobs/${job}/state.json`, { job_id: job, input_sha256: sha256(JSON.stringify(input)),
    state: "completed", pid: process.pid })
  atomicWrite(root, `module-jobs/${job}/launch.json`, { pid: process.pid })
  const uncertain = operationalRoundStatus(current, f.p.run_id, { readOnly: true }).commands[0].job
  assert.equal(uncertain.state, "completed")
  assert.equal(uncertain.worker_alive, null)
  assert.equal(uncertain.resume_available, false)
  assert.equal(uncertain.recovery.action, "restore_process_visibility")
  const queuedCommand = { ...command, parameters: { fixture: "queued-before-launch" } }
  const queuedDigest = sha256(JSON.stringify(queuedCommand)), queuedJob = "module-operation-" + queuedDigest.slice(0, 48)
  atomicWrite(root, `operations/rounds/${f.p.run_id}/commands/${queuedDigest}.json`, { ...queuedCommand, job_id: queuedJob })
  const queuedInput = { ...input, job_id: queuedJob }
  atomicWrite(root, `module-jobs/${queuedJob}/input.json`, queuedInput)
  atomicWrite(root, `module-jobs/${queuedJob}/state.json`, { job_id: queuedJob,
    input_sha256: sha256(JSON.stringify(queuedInput)), state: "queued", pid: null })
  const queued = operationalRoundStatus(current, f.p.run_id, { readOnly: true }).commands
    .find((entry) => entry.job_id === queuedJob).job
  assert.equal(queued.state, "worker_status_unknown")
  assert.equal(queued.worker_alive, null)
  assert.equal(queued.resume_available, false)
  atomicWrite(root, `module-jobs/${queuedJob}/state.json`, { job_id: queuedJob,
    input_sha256: sha256(JSON.stringify(queuedInput)), state: "queued", attempt: 2, pid: null })
  atomicWrite(root, `module-jobs/${queuedJob}/launch.json`, { job_id: queuedJob, attempt: 1, pid: 99999999 })
  const previousAttempt = operationalRoundStatus(current, f.p.run_id, { readOnly: true }).commands
    .find((entry) => entry.job_id === queuedJob).job
  assert.equal(previousAttempt.state, "worker_status_unknown")
  assert.equal(previousAttempt.worker_alive, null)
  assert.equal(previousAttempt.resume_available, false)
  assert.equal(previousAttempt.recovery.action, "restore_process_visibility")
  atomicWrite(root, `round-workflows/${f.p.run_id}/input.json`, { ...workflowInput, changed: true })
  assert.throws(() => operationalRoundStatus(current, f.p.run_id, { readOnly: true }), /workflow input changed/)
  atomicWrite(root, `round-workflows/${f.p.run_id}/input.json`, workflowInput)
  fs.chmodSync(path.join(f.runtime, "scripts/unit.mjs"), 0o644)
  fs.writeFileSync(path.join(f.runtime, "scripts/unit.mjs"), "// old runtime tampered\n")
  assert.throws(() => operationalRoundStatus(current, f.p.run_id, { readOnly: true }), /execution changed/)
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

test("a settled collection slice creates a checkpoint-bound successor instead of replaying the completed job", async (t) => {
  const f = await setup(t)
  await pinOperationalRound(f.ctx, f.p)
  const command = {
    stage: "collection",
    module: "edition",
    operation: "advance",
    parameters: {
      execute: true,
      run_id: f.p.run_id,
      round: true,
      collect: true,
      stop_after_collection: true,
      daily_run: f.p.run_id,
      collection_max_windows: 6,
      collection_time_budget_ms: 600000,
    },
  }
  const digest = sha256(JSON.stringify(command))
  const job = "module-operation-" + digest.slice(0, 48)
  const input = {
    job_id: job,
    module: "edition",
    operation: "advance",
    parameters: command.parameters,
    context: f.ctx,
  }
  atomicCreate(f.root, `module-jobs/${job}/input.json`, input)
  const result = atomicCreate(f.root, `module-jobs/${job}/result.json`, {
    status: "collection_pending",
  })
  atomicCreate(f.root, `module-jobs/${job}/state.json`, {
    job_id: job,
    input_sha256: sha256(JSON.stringify(input)),
    state: "completed",
    attempt: 1,
    result,
    submitted_at: "2026-10-24T19:00:01Z",
  })
  atomicCreate(f.root, `operations/rounds/${f.p.run_id}/commands/${digest}.json`, {
    ...command,
    job_id: job,
    submitted_at: "2026-10-24T19:00:01Z",
  })
  const checkpoint = {
    status: "collection_pending",
    stages: {
      collection: {
        counts: { pending_windows: 127 },
        reference: { path: "report.json", sha256: "1".repeat(64) },
      },
    },
    next_inputs: [{ stage: "collection", required: ["collect", "execute"] }],
  }
  atomicWrite(f.root, `round-workflows/${f.p.run_id}/latest.json`, checkpoint)
  let submitted = 0
  const next = await runOperationalRound(
    f.ctx,
    { run_id: f.p.run_id },
    {
      resume: true,
      submit: async (context, module, operation, parameters, options) => {
        submitted++
        assert.equal(module, "edition")
        assert.equal(operation, "advance")
        assert.deepEqual(parameters, command.parameters)
        const input = { job_id: options.jobId, module, operation, parameters, context }
        atomicCreate(f.root, `module-jobs/${options.jobId}/input.json`, input)
        const state = {
          job_id: options.jobId,
          state: "queued",
          input_sha256: sha256(JSON.stringify(input)),
        }
        atomicCreate(f.root, `module-jobs/${options.jobId}/state.json`, state)
        return state
      },
    },
  )
  assert.notEqual(next.job.job_id, job)
  assert.equal(submitted, 1)
  const commands = fs
    .readdirSync(path.join(f.root, `operations/rounds/${f.p.run_id}/commands`))
    .map((file) => readJSON(f.root, `operations/rounds/${f.p.run_id}/commands/${file}`))
  const successor = commands.find((row) => row.job_id === next.job.job_id)
  assert.equal(successor.continuation.previous_job.job_id, job)
  assert.deepEqual(readJSON(f.root, successor.continuation.checkpoint.path), checkpoint)
  assert.equal(readJSON(f.root, `module-jobs/${job}/state.json`).attempt, 1)
  const saved = readJSON(f.root, `operations/rounds/${f.p.run_id}/commands/${digest}.json`)
  assert.equal(saved.job_id, job)
  // Simulate process termination after durable command creation but before dispatch.
  for (const name of ["input.json", "state.json"])
    fs.unlinkSync(path.join(f.root, `module-jobs/${next.job.job_id}/${name}`))
  assert.equal(operationalRoundStatus(f.ctx, f.p.run_id).commands.at(-1).job.state, "not_submitted")
  await assert.rejects(
    runOperationalRound(f.ctx, { run_id: f.p.run_id, stage: "collection" },
      { resume: true, expectedJobId: "module-wrong", submit: async () => { throw Error("must not submit") } }),
    /resume job does not match/,
  )
  const redispatch = await runOperationalRound(
    f.ctx,
    { run_id: f.p.run_id },
    {
      resume: true,
      expectedJobId: next.job.job_id,
      submit: async (_ctx, _module, _operation, _parameters, options) => {
        assert.equal(options.jobId, next.job.job_id)
        const input = { job_id: options.jobId, context: _ctx }
        atomicCreate(f.root, `module-jobs/${options.jobId}/input.json`, input)
        atomicCreate(f.root, `module-jobs/${options.jobId}/state.json`, {
          state: "queued",
          input_sha256: sha256(JSON.stringify(input)),
        })
        return { job_id: options.jobId, state: "queued" }
      },
    },
  )
  assert.equal(redispatch.job.job_id, next.job.job_id)
  fs.appendFileSync(path.join(f.root, successor.continuation.checkpoint.path), " ")
  assert.throws(() => operationalRoundStatus(f.ctx, f.p.run_id), /continuation evidence changed/)
})

test("explicit continuation preserves the frozen parent, scheduler claim and original daily input; new segment is manual", async (t) => {
  const f = await setup(t)
  await pinOperationalRound(f.ctx, f.p)
  const parentPath = `operations/rounds/${f.p.run_id}/input.json`
  const before = fs.readFileSync(path.join(f.root, parentPath))
  const workflow = {
    run_id: f.p.run_id,
    source: { kind: "daily", daily_run: "daily-original" },
    collection_config: evidenceReference(f.runtime, "data/research-source-channels.json"),
    policy: evidenceReference(f.runtime, "data/research-model-policy-codex.json"),
  }
  atomicCreate(f.root, `round-workflows/${f.p.run_id}/input.json`, workflow)
  atomicCreate(f.root, `round-workflows/${f.p.run_id}/latest.json`, {
    status: "collection_pending",
    input_sha256: sha256(JSON.stringify(workflow)),
  })
  const p = { run_id: f.p.run_id, successor: "unit-recovery", reason: "Explicit test recovery" }
  const continuation = await continueOperationalRound(f.ctx, p)
  assert.equal(continuation.status, "continuation_ready")
  assert.equal(continuation.daily_run, "daily-original")
  assert.equal(continuation.scheduled_runs_counted, 0)
  assert.deepEqual(await continueOperationalRound(f.ctx, p), continuation)
  assert.deepEqual(fs.readFileSync(path.join(f.root, parentPath)), before)
  const child = inspectOperationalPin(f.ctx, p.successor)
  assert.equal(child.continuation.sha256, continuation.source.sha256)
  assert.equal(checkedOperationalInvocation(f.ctx, child.invocation).kind, "manual")
  assert.equal(fs.readdirSync(path.join(f.root, "operations/scheduled-executions")).length, 1)
  await assert.rejects(
    continueOperationalRound(f.ctx, { ...p, successor: "other-recovery" }),
    /another continuation/,
  )
  const evidence = path.join(f.root, continuation.source.path)
  fs.appendFileSync(evidence, " ")
  assert.throws(() => inspectOperationalPin(f.ctx, p.successor), /evidence changed/)
})

test("a failed collection-only round can continue from its exact preserved partial report", async (t) => {
  const f = await setup(t)
  await pinOperationalRound(f.ctx, f.p)
  const workflow = {
    run_id: f.p.run_id,
    source: { kind: "daily", daily_run: "daily-original" },
    collection_config: evidenceReference(f.runtime, "data/research-source-channels.json"),
    policy: evidenceReference(f.runtime, "data/research-model-policy-codex.json"),
  }
  atomicCreate(f.root, `round-workflows/${f.p.run_id}/input.json`, workflow)
  const report = atomicCreate(f.root, "daily/failed-report.json", {
    schema: "research-collection-report/v1",
    daily_run: "daily-original",
    status: "partial",
    candidate_approved: false,
    candidate_published: false,
  })
  const state = {
    status: "partial",
    input_sha256: sha256(JSON.stringify(workflow)),
    article_writes: 0,
    canonical_writes: 0,
    candidate_published: false,
    stages: { collection: { status: "failed", reference: report } },
    next_inputs: [{ stage: "collection", error: "ENOSPC", required: ["resume"] }],
  }
  const statePath = `round-workflows/${f.p.run_id}/latest.json`
  atomicCreate(f.root, statePath, { ...state, article_writes: 1 })
  const p = {
    run_id: f.p.run_id,
    successor: "failed-recovery",
    reason: "Resume preserved collection failure",
  }
  await assert.rejects(continueOperationalRound(f.ctx, p), /continuation/i)
  atomicWrite(f.root, statePath, state)
  const result = await continueOperationalRound(f.ctx, p)
  assert.equal(result.status, "continuation_ready")
  assert.equal(result.daily_run, "daily-original")
  assert.equal(result.scheduled_runs_counted, 0)
})

test("a frozen uncurated edition continues without recollection or changing its partial report", async (t) => {
  const f = await setup(t)
  await pinOperationalRound(f.ctx, f.p)
  const workflow = {
    run_id: f.p.run_id,
    source: { kind: "daily", daily_run: "daily-original" },
    collection_config: evidenceReference(f.runtime, "data/research-source-channels.json"),
    policy: evidenceReference(f.runtime, "data/research-model-policy-codex.json"),
  }
  atomicCreate(f.root, `round-workflows/${f.p.run_id}/input.json`, workflow)
  const report = atomicCreate(f.root, "unit-partial-report.json", {
    schema: "research-collection-report/v1", daily_run: "daily-original", status: "partial",
    candidate_approved: false, candidate_published: false, counts: { pending_windows: 0 },
  })
  const edition = atomicCreate(f.root, "unit-frozen-edition.json", {
    schema: "research-edition-materials/v1", daily_run: "daily-original", status: "partial",
    report, candidate_approved: false, candidate_published: false,
  })
  const state = {
    status: "collection_frozen", input_sha256: sha256(JSON.stringify(workflow)), edition,
    article_writes: 0, canonical_writes: 0, candidate_published: false,
    stages: { collection: { status: "partial", reference: report }, edition: { status: "frozen", reference: edition } },
  }
  atomicCreate(f.root, `round-workflows/${f.p.run_id}/latest.json`, state)
  atomicWrite(f.root, `round-workflows/${f.p.run_id}/latest.json`, { ...state, article_writes: 1 })
  await assert.rejects(
    continueOperationalRound(f.ctx, { run_id: f.p.run_id, successor: "frozen-recovery", reason: "Continue the frozen edition" }),
    /Continuation requires/,
  )
  atomicWrite(f.root, `round-workflows/${f.p.run_id}/latest.json`, state)
  const result = await continueOperationalRound(f.ctx, {
    run_id: f.p.run_id, successor: "frozen-recovery", reason: "Continue the frozen edition",
  })
  assert.deepEqual(readJSON(f.root, result.source.path).processing, { edition })
  const args = JSON.parse(result.next_command[result.next_command.indexOf("--json") + 1])
  assert.equal(args.parameters.edition_path, edition.path)
  assert.equal(args.parameters.edition_sha256, edition.sha256)
  assert.notEqual(args.parameters.propose, false)
  await assert.rejects(
    runOperationalRound(f.ctx, { run_id: result.run_id, stage: "collection", parameters: { collect: true } }),
    /Selected continuation/,
  )
  assert.equal(fs.existsSync(path.join(f.root, "module-jobs")), false)
  atomicCreate(f.root, `round-workflows/${result.run_id}/latest.json`, { edition })
  let seen
  await runOperationalRound(f.ctx, { run_id: result.run_id, stage: "processing" }, {
    submit: async (_ctx, module, operation, parameters, options) => {
      seen = parameters
      const input = { job_id: options.jobId, module, operation, parameters, context: _ctx }
      atomicCreate(f.root, `module-jobs/${options.jobId}/input.json`, input)
      const state = { job_id: options.jobId, state: "queued", input_sha256: sha256(JSON.stringify(input)) }
      atomicCreate(f.root, `module-jobs/${options.jobId}/state.json`, state)
      return state
    },
  })
  assert.equal(seen.edition_path, edition.path)
  assert.equal(seen.edition_sha256, edition.sha256)
  assert.equal(seen.propose, true)
  assert.equal(seen.collect, false)
})

test("a stopped pending event proposal continues the same frozen edition and retires only its old request", async (t) => {
  const f = await pendingProposalFixture(t)
  const parentPath = `operations/rounds/${f.run}/input.json`
  const originalParent = fs.readFileSync(path.join(f.root, parentPath))
  const requestPath = `reasoning-tasks/${f.task.task_id}/request.json`
  const originalRequest = fs.readFileSync(path.join(f.root, requestPath))
  const parameters = { run_id: f.run, successor: "proposal-successor", reason: "Switch verified runtime" }
  const result = await continueOperationalRound(f.ctx, parameters)
  assert.equal(result.status, "continuation_ready")
  assert.equal(result.daily_run, "daily-original")
  assert.equal(result.scheduled_runs_counted, 0)
  const continuation = readJSON(f.root, result.source.path)
  const restart = readJSON(f.root, continuation.proposal_restart.path)
  const retirement = readJSON(f.root, continuation.proposal_retirement.path)
  assert.deepEqual(continuation.processing, { edition: f.edition })
  assert.deepEqual(restart.task, f.task)
  assert.deepEqual(restart.collection_report, f.report)
  assert.equal(retirement.task_id, f.task.task_id)
  assert.equal(retirement.reason, `Restart ${f.run} as ${parameters.successor}`)
  assert.deepEqual(fs.readFileSync(path.join(f.root, parentPath)), originalParent)
  assert.deepEqual(fs.readFileSync(path.join(f.root, requestPath)), originalRequest)
  assert.equal(inspectOperationalPin(f.ctx, result.run_id).run_id, result.run_id)
  assert.deepEqual(await continueOperationalRound(f.ctx, parameters), result)
  await assert.rejects(submitReasoningResult(f.root, { ...f.task, output: { events: [] },
    executor: "codex", model: "gpt-6-luna" }), /retired/)
  const args = JSON.parse(result.next_command[result.next_command.indexOf("--json") + 1])
  assert.equal(args.parameters.edition_path, f.edition.path)
  assert.equal(args.parameters.edition_sha256, f.edition.sha256)
  await assert.rejects(runOperationalRound(f.ctx, { run_id: result.run_id, stage: "collection",
    parameters: { collect: true } }), /Selected continuation/)
  atomicCreate(f.root, `round-workflows/${result.run_id}/latest.json`, { edition: f.edition })
  let seen
  await runOperationalRound(f.ctx, { run_id: result.run_id, stage: "processing" }, {
    submit: async (_ctx, module, operation, values, options) => {
      seen = values
      const input = { job_id: options.jobId, module, operation, parameters: values, context: _ctx }
      atomicCreate(f.root, `module-jobs/${options.jobId}/input.json`, input)
      const state = { job_id: options.jobId, state: "queued", input_sha256: sha256(JSON.stringify(input)) }
      atomicCreate(f.root, `module-jobs/${options.jobId}/state.json`, state)
      return state
    },
  })
  assert.equal(seen.edition_path, f.edition.path)
  assert.equal(seen.edition_sha256, f.edition.sha256)
  assert.equal(seen.propose, true)
  assert.equal(seen.collect, false)
})

test("pending proposal restart rejects live workers, later work and completed old results", async (t) => {
  const f = await pendingProposalFixture(t)
  const p = { run_id: f.run, successor: "guarded-proposal", reason: "Switch verified runtime" }
  const statePath = `module-jobs/${f.jobId}/state.json`
  atomicWrite(f.root, statePath, { ...f.jobState, reasoning_task: f.task, pid: process.pid })
  await assert.rejects(continueOperationalRound(f.ctx, p), /worker is still alive/)
  atomicWrite(f.root, statePath, { ...f.jobState, reasoning_task: f.task })
  const extra = `operations/rounds/${f.run}/commands/publication.json`
  atomicCreate(f.root, extra, { stage: "publication", job_id: "module-unrelated" })
  await assert.rejects(continueOperationalRound(f.ctx, p), /other operational work/)
  fs.unlinkSync(path.join(f.root, extra))
  const workflowState = `round-workflows/${f.run}/latest.json`
  atomicWrite(f.root, workflowState, { ...f.state, article_writes: 1 })
  await assert.rejects(continueOperationalRound(f.ctx, p), /Continuation requires/)
  atomicWrite(f.root, workflowState, f.state)
  assert.equal(readJSON(f.root, `reasoning-tasks/${f.task.task_id}/retired.json`), null)
  await submitReasoningResult(f.root, { ...f.task, output: { events: [] },
    executor: "codex", model: "gpt-6-luna" })
  await assert.rejects(continueOperationalRound(f.ctx, p), /Completed event proposal/)
  assert.equal(readJSON(f.root, `reasoning-tasks/${f.task.task_id}/retired.json`), null)
})

test("a continued event proposal detects changed original request, job or retirement evidence", async (t) => {
  const f = await pendingProposalFixture(t)
  const result = await continueOperationalRound(f.ctx, {
    run_id: f.run, successor: "proposal-proof", reason: "Switch verified runtime",
  })
  const continuation = readJSON(f.root, result.source.path)
  const restart = readJSON(f.root, continuation.proposal_restart.path)
  for (const ref of [restart.request, restart.job_input, restart.job_state, continuation.proposal_retirement]) {
    const file = path.join(f.root, ref.path), original = fs.readFileSync(file)
    fs.appendFileSync(file, " ")
    assert.throws(() => inspectOperationalPin(f.ctx, result.run_id), /evidence changed/)
    fs.writeFileSync(file, original)
  }
  assert.equal(inspectOperationalPin(f.ctx, result.run_id).run_id, result.run_id)
})

test("a curation-required continuation keeps the exact reviewed plan, edition and parent evidence", async (t) => {
  const f = await curationRequiredFixture(t)
  const p = { run_id: f.run, successor: "curation-successor", reason: "Resume reviewed plan" }
  const before = fs.readFileSync(path.join(f.root, `round-workflows/${f.run}/latest.json`))
  const result = await continueOperationalRound(f.ctx, p)
  assert.equal(result.status, "continuation_ready")
  assert.equal(result.scheduled_runs_counted, 0)
  const continuation = readJSON(f.root, result.source.path)
  assert.deepEqual(continuation.processing, { edition: f.edition, plan: f.plan })
  assert.deepEqual(fs.readFileSync(path.join(f.root, `round-workflows/${f.run}/latest.json`)), before)
  assert.equal(inspectOperationalPin(f.ctx, result.run_id).run_id, result.run_id)
  assert.deepEqual(await continueOperationalRound(f.ctx, p), result)
  const args = JSON.parse(result.next_command[result.next_command.indexOf("--json") + 1])
  assert.equal(args.parameters.plan_path, f.plan.path)
  assert.equal(args.parameters.plan_sha256, f.plan.sha256)
  assert.equal(args.parameters.edition_sha256, f.edition.sha256)
  assert.equal(args.parameters.propose, false)
  for (const ref of [f.plan, f.events, f.handoff, f.job.input, f.job.state, f.job.result, f.job.command]) {
    const file = path.join(f.root, ref.path), original = fs.readFileSync(file)
    fs.appendFileSync(file, " ")
    assert.throws(() => inspectOperationalPin(f.ctx, result.run_id), /evidence changed/)
    fs.writeFileSync(file, original)
  }
  assert.equal(inspectOperationalPin(f.ctx, result.run_id).run_id, result.run_id)
  fs.mkdirSync(f.ctx.vault, { recursive: true })
  const resumed = await advanceRoundWorkflow(f.ctx, { run_id: result.run_id,
    ...args.parameters, require_curation: true, execute: true })
  assert.equal(resumed.status, "curation_required")
  assert.deepEqual(resumed.next_inputs[0].plans, [f.plan])
  assert.equal(resumed.article_writes, 0)
  assert.equal(resumed.candidate_published, false)
  for (const parameters of [
    { collect: true }, { plan_path: "foreign.json" }, { plan_sha256: "a".repeat(64) },
  ])
    await assert.rejects(
      runOperationalRound(f.ctx, { run_id: result.run_id, stage: "processing", parameters }),
      /Selected continuation/,
    )
})

test("a curation-required continuation rejects changed plan, pending work and publication writes", async (t) => {
  const f = await curationRequiredFixture(t)
  const statePath = `round-workflows/${f.run}/latest.json`
  const p = { run_id: f.run, successor: "curation-guarded", reason: "Resume reviewed plan" }
  for (const changed of [
    { ...f.state, article_writes: 1 },
    { ...f.state, canonical_writes: 1 },
    { ...f.state, candidate_published: true },
    { ...f.state, curation: { path: "other.json", sha256: "a".repeat(64) } },
    { ...f.state, next_inputs: [{ stage: "reasoning", reasoning_task: { task_id: "pending" } }] },
    { ...f.state, stages: { ...f.state.stages, curation: { status: "curation_required", plan: f.edition } } },
  ]) {
    atomicWrite(f.root, statePath, changed)
    await assert.rejects(continueOperationalRound(f.ctx, p), /continuation|curation|required|evidence/i)
  }
  atomicWrite(f.root, statePath, f.state)
  atomicWrite(f.root, f.job.state.path, { ...f.job.jobState, pid: process.pid })
  await assert.rejects(continueOperationalRound(f.ctx, p), /worker.*alive/i)
  atomicWrite(f.root, f.job.state.path, f.job.jobState)
  atomicCreate(f.root, `operations/rounds/${f.run}/commands/publication.json`, {
    stage: "publication", operation: "advance", job_id: "module-unrelated",
  })
  await assert.rejects(continueOperationalRound(f.ctx, p), /publication/i)
})

test("a curation-required continuation follows the preserved daily lineage of an earlier continuation", async (t) => {
  const f = await curationRequiredFixture(t, { continued: true })
  const result = await continueOperationalRound(f.ctx, {
    run_id: f.run, successor: "curation-nested", reason: "Resume reviewed plan",
  })
  assert.equal(result.daily_run, "daily-fixture")
  assert.equal(result.scheduled_runs_counted, 0)
  assert.deepEqual(readJSON(f.root, result.source.path).processing, { edition: f.edition, plan: f.plan })
  assert.equal(inspectOperationalPin(f.ctx, result.run_id).run_id, result.run_id)
})

test("an explicit selected-handoff recovery pins a new manual segment and rejects changed or recollected inputs", async (t) => {
  const f = await setup(t)
  await pinOperationalRound(f.ctx, f.p)
  const parentPath = `operations/rounds/${f.p.run_id}/input.json`
  const before = fs.readFileSync(path.join(f.root, parentPath))
  const workflow = {
    run_id: f.p.run_id,
    source: { kind: "daily", daily_run: "daily-original" },
    collection_config: evidenceReference(f.runtime, "data/research-source-channels.json"),
    policy: evidenceReference(f.runtime, "data/research-model-policy-codex.json"),
  }
  atomicCreate(f.root, `round-workflows/${f.p.run_id}/input.json`, workflow)
  const edition = atomicCreate(f.root, "unit-edition.json", {
    unit_only: true,
    daily_run: "daily-original",
  })
  const curation = atomicCreate(f.root, "unit-selection.json", { unit_only: true, selected: [] })
  atomicCreate(f.root, `round-workflows/${f.p.run_id}/latest.json`, {
    status: "curation_ready",
    input_sha256: sha256(JSON.stringify(workflow)),
    edition,
    curation,
    article_writes: 0,
    canonical_writes: 0,
    candidate_published: false,
  })
  const p = {
    run_id: f.p.run_id,
    successor: "selected-recovery",
    reason: "Recover the reviewed immutable selection",
  }
  const result = await continueOperationalRound(f.ctx, p)
  const proof = readJSON(f.root, result.source.path)
  assert.deepEqual(proof.processing, { edition, curation })
  assert.deepEqual(fs.readFileSync(path.join(f.root, parentPath)), before)
  const child = inspectOperationalPin(f.ctx, p.successor)
  assert.equal(checkedOperationalInvocation(f.ctx, child.invocation).kind, "manual")
  assert.equal(result.scheduled_runs_counted, 0)
  for (const parameters of [
    { collect: true },
    { daily_run: "daily-original" },
    { edition_path: "foreign.json" },
    { curation_sha256: "a".repeat(64) },
  ])
    await assert.rejects(
      runOperationalRound(f.ctx, { run_id: p.successor, stage: "collection", parameters }),
      /Selected continuation/,
    )
  assert.equal(fs.existsSync(path.join(f.root, "module-jobs")), false)
})

test("pre-review extraction recovery follows the frozen daily lineage without changing either parent pin", async (t) => {
  const f = await setup(t)
  await pinOperationalRound(f.ctx, f.p)
  const workflow = {
    run_id: f.p.run_id,
    source: { kind: "daily", daily_run: "daily-original" },
    collection_config: evidenceReference(f.runtime, "data/research-source-channels.json"),
    policy: evidenceReference(f.runtime, "data/research-model-policy-codex.json"),
  }
  atomicCreate(f.root, `round-workflows/${f.p.run_id}/input.json`, workflow)
  const edition = atomicCreate(f.root, "lineage-edition.json", { daily_run: "daily-original" })
  const curation = atomicCreate(f.root, "lineage-selection.json", { selected: [] })
  const flags = {
    edition,
    curation,
    article_writes: 0,
    canonical_writes: 0,
    candidate_published: false,
  }
  atomicCreate(f.root, `round-workflows/${f.p.run_id}/latest.json`, {
    ...flags,
    status: "curation_ready",
    input_sha256: sha256(JSON.stringify(workflow)),
  })
  await continueOperationalRound(f.ctx, {
    run_id: f.p.run_id,
    successor: "lineage-child",
    reason: "Explicit selected recovery",
  })
  const childInput = {
    run_id: "lineage-child",
    source: { kind: "edition", edition },
    policy: workflow.policy,
  }
  atomicCreate(f.root, "round-workflows/lineage-child/input.json", childInput)
  const event_workflow = atomicCreate(f.root, "lineage-wait.json", { rows: [], unit_only: true })
  const publication_handoff = atomicCreate(f.root, "lineage-unwritten-handoff.json", {
    unit_only: true,
  })
  atomicCreate(f.root, "round-workflows/lineage-child/latest.json", {
    ...flags,
    status: "waiting_for_reasoning",
    input_sha256: sha256(JSON.stringify(childInput)),
    event_workflow,
    publication_handoff,
  })
  const before = fs.readFileSync(path.join(f.root, "operations/rounds/lineage-child/input.json"))
  const next = await continueOperationalRound(f.ctx, {
    run_id: "lineage-child",
    successor: "lineage-next",
    reason: "Explicit pre-review controller correction",
  })
  assert.equal(next.daily_run, "daily-original")
  assert.equal(next.scheduled_runs_counted, 0)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "operations/rounds/lineage-child/input.json")),
    before,
  )
  assert.deepEqual(readJSON(f.root, next.source.path).processing, { edition, curation })
})

test("pre-review continuation rejects any reviewed writer and publication execution despite a stale queued row", async (t) => {
  const f = await setup(t)
  await pinOperationalRound(f.ctx, f.p)
  const workflow = {
    run_id: f.p.run_id,
    source: { kind: "daily", daily_run: "daily-original" },
    collection_config: evidenceReference(f.runtime, "data/research-source-channels.json"),
    policy: evidenceReference(f.runtime, "data/research-model-policy-codex.json"),
  }
  atomicCreate(f.root, `round-workflows/${f.p.run_id}/input.json`, workflow)
  const edition = atomicCreate(f.root, "guard-edition.json", { daily_run: "daily-original" })
  const plan = atomicCreate(f.root, "guard-plan.json", {
    run_id: "selected-plan",
    events: [{ group_id: "selected-a", action: "write" }],
  })
  const curation = atomicCreate(f.root, "guard-selection.json", {
    selected: [{ execution: { plan, group_id: "selected-a" } }],
  })
  atomicCreate(f.root, "event-plans/selected-plan/selections/selected-a.json", {
    writer_run: "original-writer",
  })
  const event_workflow = atomicCreate(f.root, "guard-event-workflow.json", {
    rows: [{ group_id: "selected-a", status: "queued" }],
  })
  atomicCreate(f.root, `round-workflows/${f.p.run_id}/latest.json`, {
    status: "waiting_for_reasoning",
    input_sha256: sha256(JSON.stringify(workflow)),
    edition,
    curation,
    event_workflow,
    article_writes: 0,
    canonical_writes: 0,
    candidate_published: false,
  })
  const p = {
    run_id: f.p.run_id,
    successor: "forbidden-child",
    reason: "Explicit guarded recovery",
  }
  for (const name of ["reviewed-claims", "draft", "approved-article"]) {
    const file = `runs/original-writer/${name}.json`
    atomicCreate(f.root, file, { unit_only: true })
    await assert.rejects(continueOperationalRound(f.ctx, p), /Reviewed or drafted/)
    fs.unlinkSync(path.join(f.root, file))
  }
  atomicCreate(f.root, `operations/rounds/${f.p.run_id}/commands/publication.json`, {
    stage: "publication",
  })
  await assert.rejects(continueOperationalRound(f.ctx, p), /Publication work/)
  assert.equal(
    fs.existsSync(path.join(f.root, "operations/rounds/forbidden-child/input.json")),
    false,
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

test("activation, readiness, dispatch, continuation and relay require the retired-root fence", async (t) => {
  const base = fs.realpathSync(
    fs.mkdtempSync(path.join(repo, ".local/research/retired-fence-release-")),
  )
  const volume = path.join(base, "volume"),
    retired = path.join(volume, "old")
  const locks = path.join(retired, ".local/research/local-ai/locks")
  const storage = path.join(retired, ".local/.storage")
  fs.mkdirSync(locks, { recursive: true })
  fs.mkdirSync(storage, { recursive: true })
  for (const name of ["catalog.sqlite", "catalog.sqlite-wal", "catalog.sqlite-shm"]) {
    const file = path.join(storage, name)
    fs.writeFileSync(file, name === "catalog.sqlite-wal" ? "" : "unit")
    fs.chmodSync(file, 0o444)
  }
  fs.chmodSync(storage, 0o555)
  fs.chmodSync(locks, 0o555)
  t.after(() => {
    fs.chmodSync(locks, 0o755)
    fs.chmodSync(storage, 0o755)
    fs.rmSync(base, { recursive: true, force: true })
  })
  const f = await setup(t, { retiredWorkspace: { volume, workspace: retired } })
  for (const dir of ["node_modules", "integrations/research-mcp/node_modules"])
    fs.mkdirSync(path.join(f.source, dir), { recursive: true })
  fs.chmodSync(locks, 0o755)
  await assert.rejects(activateOperationsRuntime(f.runtime, f.source), /writable/)
  assert.equal(fs.existsSync(path.join(f.source, ".local/.storage/active-runtime.json")), false)
  await assert.rejects(pinOperationalRound(f.ctx, f.p), /writable/)
  await assert.rejects(driveOperationalRound(f.ctx, f.p), /writable/)
  await assert.rejects(
    continueOperationalRound(f.ctx, { run_id: f.p.run_id, successor: "unit-next", reason: "unit" }),
    /writable/,
  )
  await assert.rejects(
    relayOperationalReasoning(f.ctx, { run_id: f.p.run_id, results: [] }),
    /writable/,
  )
  assert.throws(() => captureScheduledInvocation(f.ctx), /writable/)
  assert.equal(
    fs.existsSync(path.join(f.root, `operations/rounds/${f.p.run_id}/input.json`)),
    false,
  )
  fs.chmodSync(locks, 0o555)
  assert.equal((await activateOperationsRuntime(f.runtime, f.source)).operational_ready, true)
  assert.equal(operationsReadiness(f.source).retired_fence.status, "protected")
  assert.equal((await pinOperationalRound(f.ctx, f.p)).status, "pinned")
  fs.chmodSync(locks, 0o755)
  assert.equal(operationsReadiness(f.source).status, "retired_root_fence_missing")
  assert.equal(operationsReadiness(f.source).operational_ready, false)
  assert.equal(operationalRoundStatus(f.ctx, f.p.run_id).status, "pinned")
})
