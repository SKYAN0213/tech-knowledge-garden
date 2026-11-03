import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { spawn } from "node:child_process"
import { once } from "node:events"
import {
  driveOperationalRound,
  operationalNextAction,
  savedStorageRequestReady,
} from "../scripts/research/operations-driver.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"

function setup(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tkg-driver-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return { root, repo: root }
}
const settled = (id, pending) => ({
  run_id: "daily-unit",
  status: "collection_pending",
  stages: { collection: { counts: { pending_windows: pending } } },
  next_inputs: [],
  commands: [{ stage: "collection", job_id: id, job: { state: "completed", worker_alive: false } }],
})

test("an owned child checkpoint failure resumes the same job with a strict retry bound", () => {
  const status = { ...settled("module-owned", 0), commands: [{ stage: "processing",
    job_id: "module-owned", job: { state: "failed", worker_alive: false,
      error_code: "OWNED_CHILD_RETRY", attempt: 1 } }] }
  assert.deepEqual(operationalNextAction(status), { action: "resume", job_id: "module-owned",
    stage: "processing", reason: "resume_exact_owned_child_checkpoint" })
  status.commands[0].job.attempt = 3
  assert.equal(operationalNextAction(status).action, "failed")
  status.commands[0].job.attempt = 1
  status.commands[0].job.worker_alive = null
  assert.equal(operationalNextAction(status).action, "worker_status_unknown")
})

test("interrupted or waiting work retains its original stage even after the handoff is complete", () => {
  const status = { ...settled("module-interrupted", 0), status: "complete",
    stages: { events: { status: "complete" }, publication: { reference: { path: "handoff" } } },
    commands: [{ stage: "processing", job_id: "module-interrupted",
      job: { state: "interrupted", worker_alive: false } }] }
  assert.deepEqual(operationalNextAction(status), {
    action: "resume", job_id: "module-interrupted", stage: "processing",
  })
  status.commands[0].job.state = "waiting_for_storage"
  assert.equal(operationalNextAction(status).stage, "processing")
  status.commands[0].job.state = "waiting_for_reasoning"
  assert.equal(operationalNextAction(status).stage, "processing")
})

test("a ready article is consumed while independent articles still await reasoning; worker liveness wins", () => {
  const request = { task_id: "reasoning-a", request_sha256: "a".repeat(64) }
  const status = {
    ...settled("module-ready", 0),
    pending_reasoning: { total: 2, tasks: ["other"] },
    ready_items: [{ candidate_id: "a", request_refs: [request] }],
  }
  assert.deepEqual(operationalNextAction(status), {
    action: "consume_reasoning",
    ready_items: status.ready_items,
    requests: [request],
  })
  status.commands[0].job.worker_alive = true
  assert.equal(operationalNextAction(status).action, "wait")
  status.commands[0].job.worker_alive = null
  assert.equal(operationalNextAction(status).action, "worker_status_unknown")
})

test("a storage request is ready only after exact local bytes have been restored", (t) => {
  const ctx = setup(t)
  const payload = Buffer.from("restored payload")
  const stored = atomicWrite(ctx.root, "payload/source.bin", payload)
  const request = { schema: "research-storage-download-request/v1", root: ctx.root, requests: [{ path: stored.path, sha256: stored.sha256, bytes: payload.length }], request_count: 1 }
  assert.equal(savedStorageRequestReady(ctx.root, request), true)
  fs.writeFileSync(path.join(ctx.root, stored.path), "changed")
  assert.equal(savedStorageRequestReady(ctx.root, request), false)
  assert.equal(savedStorageRequestReady(ctx.root, { ...request, root: path.dirname(ctx.root) }), false)
})

test("restored payloads may use the verified parent cold-storage root", (t) => {
  const ctx = setup(t), child = path.join(ctx.root, "research/local-ai")
  fs.mkdirSync(child, { recursive: true })
  const bytes = Buffer.from("nested payload"), stored = atomicWrite(ctx.root, "research/local-ai/documents/a.bin", bytes)
  atomicWrite(ctx.root, ".storage/policy.json", { schema: "research-cold-storage/v1", root: ctx.root, enabled: true })
  const request = { schema: "research-storage-download-request/v1", root: ctx.root, requests: [{ path: stored.path, sha256: stored.sha256, bytes: bytes.length }], request_count: 1 }
  assert.equal(savedStorageRequestReady(child, request), true)
})

test("the controller resumes a storage-held article after exact bytes return", async (t) => {
  const ctx = setup(t), payload = Buffer.from("restored")
  const stored = atomicWrite(ctx.root, "payload/source.bin", payload)
  const request = { schema: "research-storage-download-request/v1", root: ctx.root, requests: [{ path: stored.path, sha256: stored.sha256, bytes: payload.length }], request_count: 1 }
  let current = { ...settled("module-before-storage", 0), status: "partial", pending_reasoning: { total: 0 }, next_inputs: [{ stage: "storage", storage_request: request }] }
  let calls = 0
  const result = await driveOperationalRound(ctx, { run_id: "daily-unit" }, {
    status: () => current,
    advance: async (_ctx, p) => {
      calls++
      assert.equal(p.stage, "processing")
      current = { ...settled("module-after-storage", 0), status: "relationship_review", pending_reasoning: { total: 0 }, next_inputs: [{ stage: "classification", required: ["plan_path"] }] }
      return { status: "completed", job: { job_id: "module-after-storage" } }
    },
  })
  assert.equal(calls, 1)
  assert.equal(result.status, "requires_review")
})

test("a repeated completed request stops even when timestamp-bound event references keep changing", async (t) => {
  const ctx = setup(t),
    request = { task_id: "reasoning-ready", request_sha256: "a".repeat(64) }
  let advances = 0
  let current = {
    ...settled("module-original", 0),
    stages: { events: { reference: { path: "current.json", sha256: "initial" } } },
    ready_items: [{ candidate_id: "a", request_refs: [request] }],
    pending_reasoning: { total: 2 },
    next_inputs: [{ stage: "reasoning", reasoning_task: request }],
  }
  const result = await driveOperationalRound(
    ctx,
    { run_id: "daily-unit", max_steps: 5 },
    {
      status: () => current,
      readTask: () => ({
        status: "completed",
        owner: { round_id: "daily-unit", job_id: "module-original" },
      }),
      advance: async () => {
        const job_id = "module-next-" + ++advances
        current = {
          ...current,
          stages: {
            events: { reference: { path: "current.json", sha256: "timestamp-" + advances } },
          },
          commands: [
            ...current.commands,
            { stage: "processing", job_id, job: { state: "completed", worker_alive: false } },
          ],
        }
        return { status: "completed", job: { job_id } }
      },
    },
  )
  assert.equal(result.status, "no_progress")
  assert.equal(advances, 1)
})

test("driver drains successive slices and waits for the exact worker before processing; external reviews stay explicit", async (t) => {
  const ctx = setup(t)
  let current = settled("module-first", 127),
    advances = 0,
    polls = 0
  const result = await driveOperationalRound(
    ctx,
    { run_id: "daily-unit", poll_ms: 25 },
    {
      status: () => current,
      advance: async (_ctx, p) => {
        advances++
        assert.equal(p.stage, advances <= 2 ? "collection" : "processing")
        const id = "module-next-" + advances
        current = {
          ...current,
          commands: [{ stage: p.stage, job_id: id, job: { state: "running", worker_alive: true } }],
        }
        return { status: "running", job: { job_id: id } }
      },
      wait: async () => {},
      jobStatus: (_ctx, id) => {
        polls++
        assert.equal(id, current.commands[0].job_id)
        if (advances === 1) current = settled(id, 125)
        if (advances === 2) current = { ...settled(id, 0), status: "collection_frozen" }
        if (advances === 3)
          current = {
            ...settled(id, 0),
            status: "relationship_review",
            next_inputs: [{ stage: "classification", required: ["plan_path", "plan_sha256"] }],
          }
        return { worker_alive: false, state: "completed" }
      },
    },
  )
  assert.equal(advances, 3)
  assert.equal(polls, 3)
  assert.equal(result.status, "requires_review")
  assert.equal(result.completed, false)
  assert.equal(result.keep_turn_open, true)
  assert.equal(fs.existsSync(path.join(ctx.root, "locks/operations-driver-daily-unit.json")), false)
})

test("controller restart recovers its dead lease and observes a live job without submitting a duplicate", async (t) => {
  const ctx = setup(t)
  atomicWrite(ctx.root, "locks/operations-driver-daily-unit.json", {
    owner: "6adcfe25-87ad-40a8-9416-a1a7cfd71560",
    pid: 2147483647,
    started_at: "2026-10-24T19:00:00Z",
  })
  let current = {
      ...settled("module-live", 1),
      commands: [{ job_id: "module-live", job: { state: "running", worker_alive: true } }],
    },
    polls = 0
  const result = await driveOperationalRound(
    ctx,
    { run_id: "daily-unit" },
    {
      status: () => current,
      advance: () => assert.fail("must not duplicate worker"),
      wait: async () => {},
      jobStatus: () => {
        polls++
        current = {
          ...current,
          status: "fact_review",
          next_inputs: [{ required: ["fact_reviews"] }],
          commands: [],
        }
        return { state: "completed", worker_alive: false }
      },
    },
  )
  assert.equal(polls, 1)
  assert.equal(result.status, "requires_review")
  assert.equal(readJSON(ctx.root, "operations/rounds/daily-unit/controller.json").completed, false)
})

test("live and unknown controller owners cannot be replaced", async (t) => {
  const ctx = setup(t)
  const lock = "locks/operations-driver-daily-unit.json"
  atomicWrite(ctx.root, lock, { owner: "6adcfe25-87ad-40a8-9416-a1a7cfd71560", pid: process.pid })
  const result = await driveOperationalRound(
    ctx,
    { run_id: "daily-unit" },
    { status: () => settled("module-x", 1) },
  )
  assert.equal(result.status, "controller_active")
  assert.equal(result.keep_turn_open, true)
  atomicWrite(ctx.root, lock, { pid: null })
  await assert.rejects(
    driveOperationalRound(ctx, { run_id: "daily-unit" }, { status: () => settled("module-x", 1) }),
    /Unknown controller/,
  )
})

test("no-progress slices stop once, persist their checkpoint and never spin or repeat network work", async (t) => {
  const ctx = setup(t)
  let current = settled("module-first", 5),
    calls = 0
  const result = await driveOperationalRound(
    ctx,
    { run_id: "daily-unit" },
    {
      status: () => current,
      advance: async () => {
        calls++
        current = settled("module-second", 5)
        return { status: "completed", job: { job_id: "module-second" } }
      },
    },
  )
  assert.equal(result.status, "no_progress")
  assert.equal(result.completed, false)
  assert.equal(calls, 1)
})

test("an actually terminated controller is recovered while its persisted job remains the resume target", async (t) => {
  const ctx = setup(t)
  const source = new URL("../scripts/research/run-state.mjs", import.meta.url).href
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { acquireLock } from ${JSON.stringify(source)}; acquireLock(process.argv[1], 'operations-driver-daily-unit'); process.stdout.write('owned'); setInterval(() => {}, 1000)`,
      ctx.root,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  )
  t.after(() => {
    if (child.exitCode === null) child.kill("SIGKILL")
  })
  await once(child.stdout, "data")
  const exited = once(child, "exit")
  child.kill("SIGKILL")
  await exited
  const current = {
    ...settled("module-preserved", 5),
    status: "fact_review",
    next_inputs: [{ required: ["fact_reviews"] }],
  }
  const result = await driveOperationalRound(
    ctx,
    { run_id: "daily-unit" },
    {
      status: () => current,
      advance: () => assert.fail("no new job at review boundary"),
    },
  )
  assert.equal(result.status, "requires_review")
  assert.equal(result.completed, false)
  assert.equal(fs.existsSync(path.join(ctx.root, "locks/operations-driver-daily-unit.json")), false)
})

test("initial parameters apply once; later slices use their stored command and continuation", async (t) => {
  const ctx = setup(t)
  let current = { status: "pinned", commands: [] },
    calls = 0
  const result = await driveOperationalRound(
    ctx,
    {
      run_id: "daily-unit",
      parameters: { daily_run: "daily-original", collection_max_windows: 6 },
    },
    {
      status: () => current,
      advance: async (_ctx, p) => {
        calls++
        if (calls === 1) assert.equal(p.parameters.daily_run, "daily-original")
        else assert.equal(p.parameters, undefined)
        current =
          calls === 1
            ? settled("module-first", 5)
            : { ...settled("module-second", 0), status: "review_required" }
        return { status: "completed", job: { job_id: current.commands[0].job_id } }
      },
    },
  )
  assert.equal(calls, 2)
  assert.equal(result.status, "requires_review")
})

test("unknown worker, storage, model, native failure and publication receipts remain distinct", () => {
  const s = settled("module-x", 0)
  for (const [state, action] of [
    ["failed", "failed"],
    ["waiting_for_storage", "storage"],
    ["waiting_for_reasoning", "reasoning"],
    ["interrupted", "resume"],
    ["not_submitted", "resume"],
  ]) {
    assert.equal(
      operationalNextAction({ ...s, commands: [{ job: { state, worker_alive: false } }] }).action,
      action,
    )
  }
  assert.equal(
    operationalNextAction({ ...s, commands: [{ job: { worker_alive: null } }] }).action,
    "worker_status_unknown",
  )
  assert.equal(operationalNextAction({ ...s, status: "complete" }).action, "review")
  const delivery = {
    drive_verified: true,
    public_verified: true,
    website_data_verified: true,
    source_archive_verified: true,
  }
  assert.equal(operationalNextAction(s, delivery).action, "complete")
  for (const field of Object.keys(delivery))
    assert.equal(operationalNextAction(s, { ...delivery, [field]: false }).action, "delivery")
  assert.equal(
    operationalNextAction(s, { ...delivery, pending_request: { event: "unverified" } }).action,
    "delivery",
  )
})

test("completed batches consume their submitted model results before requesting fact review", async (t) => {
  const ctx = setup(t)
  const request = { task_id: "reasoning-unit", request_sha256: "a".repeat(64) }
  let current = {
    ...settled("module-batch", 0),
    status: "waiting_for_reasoning",
    pending_reasoning: { total: 0 },
    next_inputs: [{ stage: "reasoning", reasoning_task: request }],
  }
  let calls = 0,
    reads = 0
  const result = await driveOperationalRound(
    ctx,
    { run_id: "daily-unit" },
    {
      status: () => current,
      readTask: (_root, ref) => {
        reads++
        assert.deepEqual(ref, request)
        return { status: "completed", owner: { round_id: "daily-unit", job_id: "module-batch" } }
      },
      advance: async (_ctx, p) => {
        calls++
        assert.equal(p.stage, "processing")
        current = {
          ...settled("module-consumed", 0),
          status: "review_pending",
          next_inputs: [{ stage: "evidence", required: ["fact_reviews"] }],
        }
        return { status: "completed", job: { job_id: "module-consumed" } }
      },
    },
  )
  assert.equal(calls, 1)
  assert.equal(reads, 1)
  assert.equal(result.status, "requires_review")
  assert.equal(result.next_action.next_inputs[0].stage, "evidence")
  assert.equal(result.completed, false)
})

test("an explicit relationship review takes priority over optional extraction of the next page", () => {
  const status = {
    ...settled("module-page", 0),
    status: "relationship_review",
    next_inputs: [
      { stage: "classification", required: ["plan_path", "plan_sha256"] },
      { stage: "classification", offset: 20, required: ["offset", "execute"] },
    ],
  }
  const next = operationalNextAction(status)
  assert.equal(next.action, "review")
  assert.deepEqual(next.next_inputs, status.next_inputs)
})
