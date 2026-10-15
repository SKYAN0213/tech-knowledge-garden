import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { editionFixture } from "./fixtures/research-event-fixtures.mjs"
import { knowledgeFixture } from "./fixtures/research-knowledge-fixtures.mjs"
import { moduleContext, submitModuleJob } from "../scripts/research/module-runtime.mjs"
import { executeModule } from "../scripts/research/module-registry.mjs"
import { advanceDailyCore } from "../scripts/research/daily-core.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { main as ontologyCLI } from "../scripts/research-ontology.mjs"

test("knowledge job replay binds ontology and link code and rejects changed implementations", async (t) => {
  const f = editionFixture(t)
  const state = await submitModuleJob(
    f.ctx,
    "knowledge",
    "status",
    { workflow_id: "not-created" },
    { jobId: "module-code-dependencies", background: false },
  )
  assert.equal(state.state, "completed")
  const base = `module-jobs/${state.job_id}/`
  const input = readJSON(f.root, base + "input.json")
  for (const file of ["ontology.mjs", "knowledge-links.mjs"]) {
    assert.equal(
      input.implementation[file],
      sha256(fs.readFileSync(new URL(`../scripts/research/${file}`, import.meta.url))),
    )
  }
  const previous = structuredClone(input)
  previous.implementation["knowledge-links.mjs"] = sha256("earlier link implementation")
  atomicWrite(f.root, base + "input.json", previous)
  const saved = readJSON(f.root, base + "state.json")
  atomicWrite(f.root, base + "state.json", {
    ...saved,
    input_sha256: sha256(JSON.stringify(previous)),
  })
  await assert.rejects(
    submitModuleJob(
      f.ctx,
      "knowledge",
      "status",
      { workflow_id: "not-created" },
      { jobId: state.job_id, background: false },
    ),
    /input changed/,
  )
})

test("ontology CLI returns explicitly approved connections and exact impact without creating approvals", async (t) => {
  const f = await knowledgeFixture(t)
  await executeModule(f.ctx, "knowledge", "connections", {
    run_id: "connections",
    review_file: "inputs/connections.json",
    knowledge_selections_file: "inputs/selections.json",
  })
  atomicWrite(f.root, "ontology/common-connections/graph.json", f.graph)
  const approvalPath = path.join(f.root, "runs/connections/approved-connections.json")
  const before = fs.readFileSync(approvalPath)
  const args = [
    "--root",
    f.root,
    "--vault",
    f.vault,
    "--snapshot",
    "common-connections",
    "--connection-review-run",
    "connections",
    "--knowledge-reviews",
    path.join(f.ctx.repo, "inputs/selections.json"),
  ]
  const index = ontologyCLI(["knowledge-index", ...args])
  assert.equal(index.knowledge_connections.length, 1)
  const event = f.graph.nodes.find((node) => node.type === "Event")
  const impact = ontologyCLI(["impact", ...args, "--event-id", event.id.slice("event:".length)])
  assert.deepEqual(impact.scope.explicit_connection_review_runs, ["connections"])
  assert.equal(impact.knowledge_connections.length, 1)
  assert.deepEqual(fs.readFileSync(approvalPath), before)
  assert.throws(
    () =>
      ontologyCLI([
        "trace",
        "--root",
        f.root,
        "--snapshot",
        "common-connections",
        "--connection-review-run",
        "connections",
      ]),
    /connection-review-run/,
  )
})

test("event core validates explicit connection approval before model calls or workflow writes", async (t) => {
  const f = editionFixture(t)
  const ctx = moduleContext(f.ctx)
  await assert.rejects(
    executeModule(ctx, "edition", "advance", {
      run_id: "missing-connection",
      edition_path: f.editionRef.path,
      edition_sha256: f.editionRef.sha256,
      connection_review_run: "missing-approval",
    }),
    /ENOENT|connection/,
  )
  await assert.rejects(
    advanceDailyCore({
      root: f.root,
      runId: "missing-core-connection",
      editionReference: { path: f.editionRef.path, sha256: f.editionRef.sha256 },
      vault: f.ctx.vault,
      policyFile: f.ctx.policy,
      connectionReviewRun: "missing-approval",
    }),
    /ENOENT|connection/,
  )
  assert.equal(fs.existsSync(path.join(f.root, "event-workflows/missing-connection")), false)
  assert.equal(fs.existsSync(path.join(f.root, "event-workflows/missing-core-connection")), false)
  for (const connectionReviewRun of ["", null, 1, "../approval"]) {
    await assert.rejects(
      advanceDailyCore({ root: f.root, runId: "invalid-connection", connectionReviewRun }),
      /Exact knowledge connection review/,
    )
  }
  assert.equal(fs.existsSync(path.join(f.root, "runs/invalid-connection")), false)
})
