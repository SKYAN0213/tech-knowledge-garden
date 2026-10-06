import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { loadDailyAcquisitionStatus } from "../scripts/research/daily-acquisition-status.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { main } from "../scripts/research.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "acquisition-status-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const run = "daily-20261007-progress-v1"
  const write = (file, data) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), JSON.stringify(data, null, 2) + "\n")
  }
  const windows = ["a", "b"].flatMap((channel_id) => [
    { channel_id, since: "2026-09-30", until_exclusive: "2026-10-07" },
    { channel_id, since: "2026-10-07", until_exclusive: "2026-10-08" },
  ])
  const plan = {
    schema: "research-daily-plan/v1",
    run_id: run,
    created_at: "2026-10-06T23:00:00Z",
    config_sha256: "a".repeat(64),
    windows,
  }
  const file = `daily/runs/${run}/plan.json`
  write(file, plan)
  const freeze = () =>
    write(`evaluation/shadow-inputs/${run}/inputs.json`, {
      schema: "research-shadow-collection-inputs/v1",
      daily_run: run,
      config_sha256: plan.config_sha256,
      plan: { path: file, sha256: sha256(fs.readFileSync(path.join(root, file))) },
    })
  const receipt = (index, number, status) => {
    const row = windows[index],
      id = `${run}_${row.channel_id}_${row.since.replaceAll("-", "")}_${row.until_exclusive.replaceAll("-", "")}_a${number}`
    const data = {
      schema: "research-daily-receipt/v2",
      daily_run: run,
      attempt_id: id,
      ...row,
      started_at: "2026-10-06T23:01:00Z",
      finished_at: "2026-10-06T23:02:00Z",
      status,
    }
    const file = `daily/runs/${run}/receipts/${id}.json`
    write(file, data)
    return { file, data }
  }
  return { root, run, write, plan, file, freeze, receipt }
}

test("fast progress includes an unfinished run absent from completed summaries and does not promote evidence", (t) => {
  const f = fixture(t)
  f.freeze()
  f.receipt(0, 1, "incomplete")
  f.receipt(0, 2, "window_scanned")
  f.receipt(1, 1, "window_scanned")
  f.receipt(2, 1, "blocked")
  const result = loadDailyAcquisitionStatus(f.root)
  assert.equal(result.run_id, f.run)
  assert.equal(result.status, "receipt_progress_observation")
  assert.equal(result.planned_windows, 4)
  assert.equal(result.observed_receipts, 4)
  assert.equal(result.observed_scanned_windows, 2)
  assert.equal(result.observed_incomplete_windows, 1)
  assert.equal(result.pending_windows, 1)
  assert.equal(result.recorded_summary, null)
  assert.deepEqual(
    result.routes.map((row) => [row.channel_id, row.observed_scanned_windows]),
    [
      ["a", 2],
      ["b", 0],
    ],
  )
  for (const key of [
    "source_evidence_verified",
    "candidate_approved",
    "candidate_published",
    "drive_verified",
    "public_verified",
  ])
    assert.equal(result[key], false)
})

test("a live global acquisition owner is not assigned to the queried run", (t) => {
  const f = fixture(t)
  f.write("locks/daily-acquisition.json", {
    pid: 123,
    started_at: "2026-10-06T23:03:00Z",
    owner: "00000000-0000-0000-0000-000000000000",
  })
  let calls = 0
  const result = loadDailyAcquisitionStatus(f.root, {
    runId: f.run,
    processState: (pid) => {
      assert.equal(pid, 123)
      calls++
      return "alive"
    },
  })
  assert.equal(calls, 1)
  assert.equal(result.acquisition_owner.state, "alive")
  assert.equal(result.acquisition_owner.bound_run, null)
  assert.equal(result.collection_inputs_frozen, false)
  assert.equal(result.pending_windows, 4)
})

test("dead and inaccessible lock handles remain distinct and are never recovered by reading status", (t) => {
  const f = fixture(t)
  f.write("locks/daily-acquisition.json", {
    pid: 123,
    started_at: "2026-10-06T23:03:00Z",
    owner: "00000000-0000-0000-0000-000000000000",
  })
  const before = fs.readFileSync(path.join(f.root, "locks/daily-acquisition.json"))
  for (const state of ["missing_handle", "unobservable"]) {
    const result = loadDailyAcquisitionStatus(f.root, { processState: () => state })
    assert.equal(result.acquisition_owner.state, state)
    assert.equal(result.acquisition_owner.bound_run, null)
  }
  assert.deepEqual(fs.readFileSync(path.join(f.root, "locks/daily-acquisition.json")), before)
})

test("a changed pinned plan is rejected without falling back to an earlier success", (t) => {
  const f = fixture(t)
  f.freeze()
  f.write(f.file, { ...f.plan, created_at: "2026-10-06T23:00:01Z" })
  const result = loadDailyAcquisitionStatus(f.root)
  assert.equal(result.status, "evidence_invalid")
  assert.equal(result.observed_scanned_windows, null)
  assert.match(result.reason, /frozen input/)
})

test("wrong receipt window, run or filename cannot inflate progress", (t) => {
  const f = fixture(t)
  const { file, data } = f.receipt(0, 1, "window_scanned")
  for (const change of [
    { channel_id: "other" },
    { daily_run: "other" },
    { attempt_id: data.attempt_id + "_copy" },
  ]) {
    f.write(file, { ...data, ...change })
    const result = loadDailyAcquisitionStatus(f.root)
    assert.equal(result.status, "evidence_invalid")
    assert.equal(result.observed_scanned_windows, null)
  }
})

test("a stale summary during resume does not hide newer receipts", (t) => {
  const f = fixture(t)
  f.receipt(0, 1, "incomplete")
  f.write(`daily/runs/${f.run}/summary.json`, {
    schema: "research-daily-summary/v1",
    run_id: f.run,
    status: "partial",
    receipts: 1,
  })
  f.receipt(0, 2, "window_scanned")
  const result = loadDailyAcquisitionStatus(f.root)
  assert.equal(result.observed_scanned_windows, 1)
  assert.equal(result.recorded_summary.status, "partial")
  assert.equal(result.recorded_summary.matches_observed_receipt_count, false)
})

test("exact-run CLI is read-only and does not enumerate unrelated invalid history", async (t) => {
  const f = fixture(t)
  f.receipt(0, 1, "window_scanned")
  f.write("daily/runs/unrelated/plan.json", { not: "a valid plan" })
  const before = fs.readFileSync(path.join(f.root, f.file))
  const result = await main(["acquisition-status", "--root", f.root, "--run", f.run])
  assert.equal(result.observed_scanned_windows, 1)
  assert.equal(result.run_id, f.run)
  assert.deepEqual(fs.readFileSync(path.join(f.root, f.file)), before)
  assert.equal(fs.existsSync(path.join(f.root, "locks")), false)
  assert.equal(fs.existsSync(path.join(f.root, "delivery-status.html")), false)
  assert.throws(
    () => loadDailyAcquisitionStatus(f.root, { runId: "../outside" }),
    /Exact daily run/,
  )
})

test("checkpoint progress exposes stalled stage records without declaring a live worker", (t) => {
  const f = fixture(t)
  const { data } = f.receipt(0, 1, "window_scanned")
  fs.rmSync(path.join(f.root, `daily/runs/${f.run}/receipts`), { recursive: true })
  f.write(`runs/${data.attempt_id}/state.json`, {
    schema: "research-run/v1",
    run_id: data.attempt_id,
    input_hash: "b".repeat(64),
    stages: {
      listing: { status: "complete" },
      detail: { status: "running", started_at: "2026-10-06T23:02:00Z" },
    },
  })
  f.write(`runs/${data.attempt_id}_other/state.json`, { bad: "unrelated" })
  const result = loadDailyAcquisitionStatus(f.root)
  assert.equal(result.pending_windows, 4)
  assert.equal(result.observed_receipts, 0)
  assert.equal(result.acquisition_owner.state, "not_locked")
  assert.equal(result.checkpoints.length, 1)
  assert.equal(result.checkpoints[0].recorded_complete_stages, 1)
  assert.deepEqual(result.checkpoints[0].recorded_running_stages, [
    { stage: "detail", started_at: "2026-10-06T23:02:00Z" },
  ])
  f.write(`runs/${data.attempt_id}/state.json`, {
    schema: "research-run/v1",
    run_id: "other",
    input_hash: "b".repeat(64),
    stages: {},
  })
  assert.equal(loadDailyAcquisitionStatus(f.root).status, "evidence_invalid")
})
