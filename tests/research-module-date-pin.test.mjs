import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fixture } from "./fixtures/research-event-fixtures.mjs"
import { submitModuleJob, loadModuleJobForWorker } from "../scripts/research/module-runtime.mjs"
import { readJSON, atomicWrite } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"

test("collection and stored progress jobs pin their exact shared consumers", async (t) => {
  const f = fixture(t)
  for (const [module, operation, parameters, dependencies] of [
    [
      "collection",
      "inventory",
      {},
      [
        "contracts.mjs",
        "run-state.mjs",
        "source-targeted-search.mjs",
        "source-followups.mjs",
        "source-selection.mjs",
        "../research-followups.mjs",
        "daily-search-basis.mjs",
        "search.mjs",
        "fetch.mjs",
        "../research.mjs",
        "../../integrations/research-worker/worker.py",
      ],
    ],
    [
      "validation",
      "progress",
      { plan_file: "docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md" },
      [
        "contracts.mjs",
        "run-state.mjs",
        "knowledge-workflow.mjs",
        "editor.mjs",
        "reader-quality.mjs",
      ],
    ],
  ]) {
    const job = await submitModuleJob(f.ctx, module, operation, parameters, {
      jobId: `module-consumer-pin-${module}`,
      background: false,
    })
    assert.equal(job.state, "completed", job.error)
    const prefix = `module-jobs/${job.job_id}/`
    const input = readJSON(f.root, prefix + "input.json")
    const originalInput = structuredClone(input)
    for (const key of dependencies) {
      const bytes = fs.readFileSync(path.join(f.ctx.repo, "scripts/research", key))
      assert.equal(input.implementation[key], sha256(bytes), key)
      assert.equal(
        loadModuleJobForWorker(f.ctx, job.job_id).input.implementation[key],
        sha256(bytes),
      )
      input.implementation[key] = "0".repeat(64)
      atomicWrite(f.root, prefix + "input.json", input)
      atomicWrite(f.root, prefix + "state.json", {
        ...readJSON(f.root, prefix + "state.json"),
        input_sha256: sha256(JSON.stringify(input)),
      })
      assert.throws(
        () => loadModuleJobForWorker(f.ctx, job.job_id),
        /Module implementation changed/,
      )
      input.implementation[key] = originalInput.implementation[key]
      atomicWrite(f.root, prefix + "input.json", input)
      atomicWrite(f.root, prefix + "state.json", {
        ...readJSON(f.root, prefix + "state.json"),
        input_sha256: sha256(JSON.stringify(input)),
      })
      assert.deepEqual(fs.readFileSync(path.join(f.ctx.repo, "scripts/research", key)), bytes)
    }
  }
})

test("approval, knowledge and publication jobs reject a changed event-date implementation", async (t) => {
  const f = fixture(t)
  const key = "event-date.mjs"
  const bytes = fs.readFileSync(path.join(f.ctx.repo, "scripts/research", key))
  for (const [module, operation, parameters] of [
    ["validation", "progress", { plan_file: "docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md" }],
    ["knowledge", "status", { workflow_id: "unstarted-date-pin" }],
    ["publication", "shadow_status", {}],
  ]) {
    const job = await submitModuleJob(f.ctx, module, operation, parameters, {
      jobId: "module-date-pin-" + module,
      background: false,
    })
    assert.equal(job.state, "completed", job.error)
    const prefix = `module-jobs/${job.job_id}/`
    const input = readJSON(f.root, prefix + "input.json")
    assert.equal(input.implementation[key], sha256(bytes))
    assert.equal(loadModuleJobForWorker(f.ctx, job.job_id).input.implementation[key], sha256(bytes))
    // Change only the fixture's recorded implementation, never the real file
    // or an approved source, to simulate an obsolete date validator.
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
  }
  assert.deepEqual(fs.readFileSync(path.join(f.ctx.repo, "scripts/research", key)), bytes)
})
