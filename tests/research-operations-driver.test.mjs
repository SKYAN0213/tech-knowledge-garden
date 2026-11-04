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
import { sha256 } from "../scripts/research/contracts.mjs"

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

test("a row waiting for storage does not block another ready article", async (t) => {
  const ctx = setup(t), bytes = Buffer.from("exact archived payload")
  const file = atomicWrite(ctx.root, "payload/archived.bin", bytes)
  fs.unlinkSync(path.join(ctx.root, file.path))
  const request = { schema: "research-storage-download-request/v1", root: ctx.root,
    requests: [{ path: file.path, sha256: file.sha256, bytes: bytes.length }], request_count: 1 }
  let current = { ...settled("module-before-archive", 0), status: "partial",
    pending_reasoning: { total: 0 }, next_inputs: [
      { stage: "storage", storage_request: request },
      { stage: "events", required: ["execute"] },
    ] }
  let calls = 0
  const result = await driveOperationalRound(ctx, { run_id: "daily-unit" }, {
    status: () => current,
    advance: async (_ctx, p) => {
      calls++
      assert.equal(p.stage, "processing")
      current = { ...settled("module-after-independent", 0), status: "partial",
        pending_reasoning: { total: 0 }, next_inputs: [{ stage: "storage", storage_request: request }] }
      return { status: "completed", job: { job_id: "module-after-independent" } }
    },
  })
  assert.equal(calls, 1)
  assert.equal(result.status, "requires_storage")
  assert.equal(result.completed, false)
})

test("a native job waiting for storage is never replaced by an independent successor", async (t) => {
  const ctx = setup(t), request = { schema: "research-storage-download-request/v1", root: ctx.root,
    requests: [{ path: "payload/missing.bin", sha256: "a".repeat(64), bytes: 1 }], request_count: 1 }
  const current = { ...settled("module-held-job", 0), status: "partial",
    commands: [{ stage: "processing", job_id: "module-held-job", job: {
      state: "waiting_for_storage", worker_alive: false, storage_request: request } }],
    pending_reasoning: { total: 0 }, next_inputs: [{ stage: "events", required: ["execute"] }] }
  const result = await driveOperationalRound(ctx, { run_id: "daily-unit" }, {
    status: () => current, advance: () => assert.fail("the original native job must remain the owner"),
  })
  assert.equal(result.status, "requires_storage")
  assert.equal(result.next_action.job_id, "module-held-job")
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

const capacityNeed = (root) => ({ schema: "research-storage-capacity-need/v1", root,
  bundle_id: "bundle-original", paths: ["payload/source.bin"], required_free_bytes: 10 * 1024 ** 3 + 4,
  additional_cache_bytes: 4, required_cache_bytes: 4, cache_limit_bytes: 32 * 1024 ** 3 })

test("storage capacity waits stay distinct from Drive downloads and resume the same job", (t) => {
  const s = settled("module-capacity", 0)
  const need = capacityNeed(setup(t).root)
  s.commands[0].job = { job_id: "module-capacity", input_sha256: "a".repeat(64),
    state: "waiting_for_storage", worker_alive: false, error_code: "STORAGE_CAPACITY_INSUFFICIENT",
    capacity_recovery: { schema: "research-storage-capacity-wait/v1", code: "STORAGE_CAPACITY_INSUFFICIENT",
      job_id: "module-capacity", input_sha256: "a".repeat(64), reason: "capacity low", uncertain_write: false,
      need, need_sha256: sha256(JSON.stringify(need)) } }
  assert.equal(operationalNextAction(s).action, "storage_capacity")
  assert.deepEqual(operationalNextAction(s, null, { capacityReady: true }),
    { action: "resume", job_id: "module-capacity", stage: "collection" })
  s.commands[0].job.capacity_recovery.input_sha256 = "b".repeat(64)
  assert.equal(operationalNextAction(s, null, { capacityReady: true }).action, "failed")
  s.commands[0].job.capacity_recovery.input_sha256 = "a".repeat(64)
  s.commands[0].job.capacity_recovery.need_sha256 = "f".repeat(64)
  assert.equal(operationalNextAction(s, null, { capacityReady: true }).action, "failed")
  s.commands[0].job.capacity_recovery.need_sha256 = sha256(JSON.stringify(need))
  s.commands[0].job.error_code = s.commands[0].job.capacity_recovery.code = "STORAGE_CACHE_LIMIT"
  assert.equal(operationalNextAction(s, null, { capacityReady: true }).requires_resolution, true)
  s.commands[0].job.error_code = s.commands[0].job.capacity_recovery.code = "ENOSPC"
  s.commands[0].job.capacity_recovery.uncertain_write = true
  assert.equal(operationalNextAction(s, null, { capacityReady: true }).required_action,
    "readback_same_remote_target")
  s.commands[0].job.capacity_recovery.uncertain_write = false
  assert.equal(operationalNextAction(s, null, { capacityReady: true }).requires_resolution, true)
  delete s.commands[0].job.capacity_recovery.need
  delete s.commands[0].job.capacity_recovery.need_sha256
  s.commands[0].job.error_code = s.commands[0].job.capacity_recovery.code = "STORAGE_CAPACITY_INSUFFICIENT"
  assert.equal(operationalNextAction(s, null, { capacityReady: true }).requires_resolution, true)
  s.commands[0].job = { state: "completed", worker_alive: false, timing: {
    storage_cleanup_status: "blocked", storage_cleanup_reason: "active_native_locks",
    storage_cleanup_trigger: "interval_elapsed" } }
  assert.notEqual(operationalNextAction(s).action, "storage_capacity")
  s.commands[0].job.timing.storage_cleanup_trigger = "low_free_space"
  assert.equal(operationalNextAction(s).action, "storage_capacity")
  s.commands[0].job.timing.storage_cleanup_status = "failed"
  assert.equal(operationalNextAction(s).action, "storage_capacity")
})

test("a hydration resumes only after fresh free-space and cache checks cover its exact need", async (t) => {
  const ctx = setup(t), need = capacityNeed(ctx.root)
  const current = { ...settled("module-capacity", 0), status: "partial" }
  current.commands[0].job = { job_id: "module-capacity", input_sha256: "a".repeat(64),
    state: "waiting_for_storage", worker_alive: false, error_code: "STORAGE_CAPACITY_INSUFFICIENT",
    capacity_recovery: { schema: "research-storage-capacity-wait/v1", code: "STORAGE_CAPACITY_INSUFFICIENT",
      job_id: "module-capacity", input_sha256: "a".repeat(64), reason: "capacity low", uncertain_write: false,
      need, need_sha256: sha256(JSON.stringify(need)) } }
  const valid = { status: "skipped", configured: true, free_bytes: 10 * 1024 ** 3 + 4,
    reserve_bytes: 10 * 1024 ** 3, required_free_bytes: 10 * 1024 ** 3 + 4,
    estimated_cache_bytes: 100, additional_cache_bytes: 4, required_cache_bytes: 4,
    cache_limit_bytes: 32 * 1024 ** 3 }
  for (const unavailable of [
    { ...valid, free_bytes: valid.free_bytes - 1 },
    { ...valid, estimated_cache_bytes: valid.cache_limit_bytes - 3 },
    { ...valid, required_free_bytes: undefined },
  ]) {
    let checks = 0
    const held = await driveOperationalRound(ctx, { run_id: "daily-unit" }, {
      status: () => current,
      checkCapacity: (_root, exactNeed) => { checks++; assert.deepEqual(exactNeed, need); return unavailable },
      advance: () => assert.fail("must not resume without enough verified capacity"),
    })
    assert.equal(held.status, "requires_storage_capacity")
    assert.equal(checks, 1)
  }
  let calls = 0
  const resumed = await driveOperationalRound(ctx, { run_id: "daily-unit" }, {
    status: () => current,
    checkCapacity: (_root, exactNeed) => { assert.deepEqual(exactNeed, need); return valid },
    advance: (_ctx, _parameters, options) => {
      calls++
      assert.equal(options.expectedJobId, "module-capacity")
      current.commands[0].job = { state: "completed", worker_alive: false }
      current.next_inputs = [{ required: ["fact_reviews"] }]
      return { status: "completed", job: { job_id: "module-capacity" } }
    },
  })
  assert.equal(calls, 1)
  assert.equal(resumed.status, "requires_review")
})

test("a capacity check never advances when space is blocked, and continues after a fresh safe check", async (t) => {
  const ctx = setup(t), current = { ...settled("module-capacity", 0), status: "fact_review",
    next_inputs: [{ required: ["fact_reviews"] }] }
  current.commands[0].job.timing = { storage_cleanup_status: "blocked",
    storage_cleanup_reason: "insufficient_capacity" }
  let checked = 0
  const blocked = await driveOperationalRound(ctx, { run_id: "daily-unit" }, {
    status: () => current,
    checkCapacity: () => { checked++; return { status: "blocked", reason: "insufficient_capacity" } },
    advance: () => assert.fail("capacity blocked"),
  })
  assert.equal(blocked.status, "requires_storage_capacity")
  assert.equal(checked, 1)
  const checkFailed = await driveOperationalRound(ctx, { run_id: "daily-unit" }, {
    status: () => current, checkCapacity: () => { throw Error("catalog unavailable") },
    advance: () => assert.fail("unverified capacity"),
  })
  assert.equal(checkFailed.status, "requires_storage_capacity")
  assert.equal(checkFailed.next_action.capacity.error, "catalog unavailable")
  const recovered = await driveOperationalRound(ctx, { run_id: "daily-unit" }, {
    status: () => current,
    checkCapacity: () => ({ status: "skipped", configured: true,
      free_bytes: 20 * 1024 ** 3, reserve_bytes: 10 * 1024 ** 3,
      estimated_cache_bytes: 1024, cache_limit_bytes: 32 * 1024 ** 3 }),
    advance: () => assert.fail("review still required"),
  })
  assert.equal(recovered.status, "requires_review")
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
