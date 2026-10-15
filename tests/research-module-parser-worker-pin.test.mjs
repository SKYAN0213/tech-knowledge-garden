import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fixture, source } from "./fixtures/research-event-fixtures.mjs"
import { submitModuleJob, loadModuleJobForWorker } from "../scripts/research/module-runtime.mjs"
import { readJSON, atomicWrite } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"

test("a parsing job pins the native Python worker even when the JS wrapper is unchanged", async (t) => {
  const f = fixture(t)
  const original = source(f.root, 1)
  const key = "../../integrations/research-worker/worker.py"
  const before = fs.readFileSync(path.join(f.ctx.repo, "integrations/research-worker/worker.py"))
  const job = await submitModuleJob(
    f.ctx,
    "parsing",
    "inspect",
    { run_id: original.origin },
    { jobId: "module-parser-worker-pin", background: false },
  )
  assert.equal(job.state, "completed", job.error)
  const prefix = `module-jobs/${job.job_id}/`
  const input = readJSON(f.root, prefix + "input.json")
  assert.equal(input.implementation[key], sha256(before))
  assert.equal(loadModuleJobForWorker(f.ctx, job.job_id).input.implementation[key], sha256(before))
  // Simulate a stored job from an older native parser without editing the
  // real worker, original source bytes, or an approved parse.
  input.implementation[key] = "0".repeat(64)
  atomicWrite(f.root, prefix + "input.json", input)
  atomicWrite(f.root, prefix + "state.json", {
    ...readJSON(f.root, prefix + "state.json"),
    input_sha256: sha256(JSON.stringify(input)),
  })
  assert.throws(
    () => loadModuleJobForWorker(f.ctx, job.job_id),
    /Module implementation changed; use a new job ID/,
  )
  assert.deepEqual(
    fs.readFileSync(path.join(f.ctx.repo, "integrations/research-worker/worker.py")),
    before,
  )
})
