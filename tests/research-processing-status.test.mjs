import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"
import {
  loadDailyProcessingStatus,
  loadProcessingRunStatus,
} from "../scripts/research/daily-processing-status.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "processing-status-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const input = { source_run: "source" }
  atomicWrite(root, "runs/selected/source-processing-input.json", input)
  const state = {
    schema: "research-run/v1",
    run_id: "selected",
    input_hash: sha256(JSON.stringify(input)),
    stages: {
      extraction: {
        status: "complete",
        started_at: "2026-10-08T00:00:00Z",
        finished_at: "2026-10-08T00:00:36Z",
      },
      assessment: { status: "running", started_at: "2026-10-08T00:00:36Z" },
    },
  }
  atomicWrite(root, "runs/selected/processing/state.json", state)
  atomicWrite(root, "locks/run-selected.json", { pid: 42 })
  return { root, state, now: Date.parse("2026-10-08T01:00:36Z") }
}

test("single source observation ignores corrupt unrelated history and never treats artifacts as approval", (t) => {
  const f = fixture(t)
  atomicWrite(f.root, "runs/unrelated/daily-processing.json", "not json")
  atomicWrite(f.root, "runs/selected/approved-article.json", "not an approval")
  const original = fs.readFileSync(path.join(f.root, "runs/selected/processing/state.json"))
  const result = loadProcessingRunStatus(f.root, "selected", {
    now: f.now,
    processState: () => "alive",
  })
  assert.equal(result.status, "running")
  assert.equal(result.phase, "assessment")
  assert.equal(result.stages[0].elapsed_ms, 36000)
  assert.equal(result.stalled_over_hour, true)
  assert.equal(result.saved_artifacts["approved-article"], true)
  assert.equal(result.approval_verified, false)
  assert.equal(result.publication_verified, false)
  assert.equal(result.automatic_retry, false)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/selected/processing/state.json")),
    original,
  )
})

test("dead running handle requires attention without restarting or growing failed-stage duration", (t) => {
  const f = fixture(t)
  let result = loadProcessingRunStatus(f.root, "selected", {
    now: f.now,
    processState: () => "missing_handle",
  })
  assert.equal(result.status, "requires_attention")
  assert.equal(result.automatic_retry, false)
  f.state.stages.assessment.status = "failed"
  atomicWrite(f.root, "runs/selected/processing/state.json", f.state)
  result = loadProcessingRunStatus(f.root, "selected", { now: f.now })
  assert.equal(result.stages[1].elapsed_ms, null)
  assert.equal(result.status, "requires_attention")
  assert.equal(result.stalled_over_hour, false)
})

test("completed extraction and comparison do not hide a live writer or expose its prompt", (t) => {
  const f = fixture(t)
  f.state.stages.assessment = {
    ...f.state.stages.assessment,
    status: "complete",
    finished_at: "2026-10-08T00:01:36Z",
  }
  atomicWrite(f.root, "runs/selected/processing/state.json", f.state)
  const budget = {
    attempts: [
      {
        id: "writer",
        status: "running",
        started_at: "2026-10-08T00:02:00Z",
        request: { prompt: "private source text" },
      },
    ],
  }
  const file = "runs/selected/model-policy/article_write/budget.json"
  atomicWrite(f.root, file, { ...budget, sha256: sha256(JSON.stringify(budget)) })
  const result = loadProcessingRunStatus(f.root, "selected", {
    now: f.now,
    processState: () => "alive",
  })
  assert.equal(result.status, "running")
  assert.equal(result.phase, "article_write")
  assert.equal(result.model_calls[0].elapsed_ms, 3516000)
  assert.equal(JSON.stringify(result).includes("private source text"), false)
  atomicWrite(f.root, file, { ...budget, sha256: "0".repeat(64) })
  assert.throws(() => loadProcessingRunStatus(f.root, "selected", { now: f.now }), /ledger changed/)
})

test("single daily status does not enumerate or inspect other runs", (t) => {
  const f = fixture(t)
  const input = { candidate_keys: [] }
  atomicWrite(f.root, "runs/batch/daily-processing-input.json", input)
  atomicWrite(f.root, "runs/batch/daily-processing.json", {
    schema: "research-daily-processing/v1",
    run_id: "batch",
    input_sha256: sha256(JSON.stringify(input)),
    status: "complete",
    total: 0,
    results: [],
    counts: {},
  })
  atomicWrite(f.root, "runs/unrelated/daily-processing.json", "not json")
  const result = loadDailyProcessingStatus(f.root, { runId: "batch" })
  assert.deepEqual(
    result.runs.map((r) => r.run_id),
    ["batch"],
  )
  assert.equal(result.runs[0].status, "complete")
  assert.equal(loadProcessingRunStatus(f.root, "batch").observation_only, true)
})

test("reused extraction reports the original model run without counting it as a fresh invocation", (t) => {
  const f = fixture(t)
  const input = { source_run: "source", extraction_run: "prior" }
  f.state.input_hash = sha256(JSON.stringify(input))
  atomicWrite(f.root, "runs/selected/source-processing-input.json", input)
  atomicWrite(f.root, "runs/selected/processing/state.json", f.state)
  const budget = {
    attempts: [
      {
        id: "prior-extraction",
        status: "complete",
        started_at: "2026-10-07T00:00:00Z",
        finished_at: "2026-10-07T00:00:30Z",
      },
    ],
  }
  atomicWrite(f.root, "runs/prior/model-policy/fact_extract/budget.json", {
    ...budget,
    sha256: sha256(JSON.stringify(budget)),
  })
  const result = loadProcessingRunStatus(f.root, "selected", {
    now: f.now,
    processState: () => "alive",
  })
  assert.equal(result.model_calls.length, 1)
  assert.equal(result.model_calls[0].run_id, "prior")
  assert.equal(result.model_calls[0].reused_run, true)
  assert.equal(result.model_calls[0].elapsed_ms, 30000)
})

test("changed input, invalid stage clock and path traversal cannot produce a successful observation", (t) => {
  const f = fixture(t)
  assert.throws(() => loadProcessingRunStatus(f.root, "../selected"), /Exact processing run/)
  assert.throws(
    () => loadDailyProcessingStatus(f.root, { runId: "../selected" }),
    /Exact processing run/,
  )
  f.state.stages.extraction.finished_at = "2026-10-07T23:00:00Z"
  atomicWrite(f.root, "runs/selected/processing/state.json", f.state)
  assert.throws(
    () => loadProcessingRunStatus(f.root, "selected", { now: f.now }),
    /Invalid processing stage time/,
  )
  atomicWrite(f.root, "runs/selected/source-processing-input.json", { source_run: "changed" })
  assert.throws(
    () => loadProcessingRunStatus(f.root, "selected", { now: f.now }),
    /differs from its pinned input/,
  )
})
