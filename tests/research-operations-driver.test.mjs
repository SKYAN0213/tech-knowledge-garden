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
} from "../scripts/research/operations-driver.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"

function setup(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tkg-driver-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return { root }
}
const settled = (id, pending) => ({
  run_id: "daily-unit",
  status: "collection_pending",
  stages: { collection: { counts: { pending_windows: pending } } },
  next_inputs: [],
  commands: [{ stage: "collection", job_id: id, job: { state: "completed", worker_alive: false } }],
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
