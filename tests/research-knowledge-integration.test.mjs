import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite, atomicCreate } from "../scripts/research/run-state.mjs"
import { executeModule } from "../scripts/research/module-registry.mjs"
import { moduleContext, submitModuleJob } from "../scripts/research/module-runtime.mjs"
import {
  evaluateKnowledgeConnectionReview,
  approveKnowledgeConnections,
  loadKnowledgeConnectionApproval,
  ontologyImpact,
} from "../scripts/research/ontology-knowledge.mjs"

import { knowledgeFixture as fixture } from "./fixtures/research-knowledge-fixtures.mjs"

test("connections reuse both native definition approvals and exact facts without rewriting definitions", async (t) => {
  const f = await fixture(t),
    before = f.notes.map((note) => fs.readFileSync(path.join(f.vault, note.path)))
  const result = await executeModule(f.ctx, "knowledge", "connections", {
    run_id: "connections",
    review_file: "inputs/connections.json",
    knowledge_selections_file: "inputs/selections.json",
  })
  assert.equal(result.approval.connections.length, 1)
  assert.equal(result.approval.definitions_reapproved, false)
  assert.equal(result.approval.connections[0].facts[0].event_state, "planned")
  assert.equal(result.approval.connections[0].facts[0].effective_period, "2027")
  assert.equal(result.approval.connections[0].facts[0].evidence[0].body_sha256, f.doc.body_sha256)
  assert.deepEqual(
    f.notes.map((note) => fs.readFileSync(path.join(f.vault, note.path))),
    before,
  )
  assert.deepEqual(
    loadKnowledgeConnectionApproval(f.root, "connections", { vault: f.vault }).approval,
    result.approval,
  )
})

test("new, excluded, changed or cooccurrence-only connections fail before approval", async (t) => {
  const f = await fixture(t),
    options = { vault: f.vault }
  for (const mutate of [
    (d) => (d.cooccurrence_rejected = false),
    (d) => (d.connections[0].target_sha256 = sha256("stale")),
    (d) => (d.connections[0].field = "relations"),
    (d) => (d.connections[0].target = "unselected-company"),
    (d) => d.connections.push(structuredClone(d.connections[0])),
    (d) => (d.connections[0].evidence[0].claim_ids = ["unassigned"]),
  ]) {
    const decision = structuredClone(f.decision)
    mutate(decision)
    assert.throws(
      () => evaluateKnowledgeConnectionReview(f.root, decision, f.selections, options),
      /review|endpoint|authored|dependency|connection/i,
    )
  }
  atomicWrite(f.vault, f.notes[1].path, "Changed canonical bytes")
  assert.throws(
    () => evaluateKnowledgeConnectionReview(f.root, f.decision, f.selections, options),
    /authority bytes/,
  )
})

test("connection review resumes an exact interrupted input and rejects changed input or original bytes", async (t) => {
  const f = await fixture(t),
    options = { vault: f.vault }
  atomicCreate(f.root, "runs/recover/connection-review.json", {
    decision: f.decision,
    knowledge_selections: f.selections,
  })
  const first = await approveKnowledgeConnections(
    f.root,
    "recover",
    f.decision,
    f.selections,
    options,
  )
  assert.equal(first.reused, false)
  assert.equal(
    (await approveKnowledgeConnections(f.root, "recover", f.decision, f.selections, options))
      .reused,
    true,
  )
  await assert.rejects(
    approveKnowledgeConnections(
      f.root,
      "recover",
      { ...f.decision, reason: "Changed review" },
      f.selections,
      options,
    ),
    /input changed/,
  )
  atomicWrite(f.root, f.doc.body_path, "Changed original bytes")
  assert.throws(
    () => loadKnowledgeConnectionApproval(f.root, "recover", options),
    /source|hash|body/i,
  )
})

test("independent knowledge index and saved pages preserve hashes without reloading or regenerating sources", async (t) => {
  const f = await fixture(t)
  await approveKnowledgeConnections(f.root, "connections", f.decision, f.selections, {
    vault: f.vault,
  })
  const params = {
    graph_file: "graph.json",
    graph_sha256: sha256(fs.readFileSync(path.join(f.root, "graph.json"))),
    knowledge_selections_file: "inputs/selections.json",
    connection_review_run: "connections",
  }
  const index = await executeModule(f.ctx, "knowledge", "index", params)
  assert.equal(index.concepts.length, 2)
  assert.equal(index.knowledge_connections.length, 1)
  atomicWrite(f.root, "saved-index.json", index)
  const result_sha256 = sha256(fs.readFileSync(path.join(f.root, "saved-index.json")))
  fs.unlinkSync(path.join(f.root, f.doc.body_path))
  const page = await executeModule(f.ctx, "knowledge", "read", {
    result_file: "saved-index.json",
    result_sha256,
    section: "concepts",
    limit: 1,
  })
  assert.equal(page.page.total, 2)
  assert.equal(page.page.next_offset, 1)
  assert.equal(page.approvals_created, false)
  const end = await executeModule(f.ctx, "knowledge", "read", {
    result_file: "saved-index.json",
    result_sha256,
    section: "concepts",
    offset: page.page.next_offset,
    limit: 1,
  })
  assert.equal(end.page.next_offset, null)
  assert.notEqual(page.page.items[0].concept_id, end.page.items[0].concept_id)
  await assert.rejects(
    executeModule(f.ctx, "knowledge", "read", {
      result_file: "saved-index.json",
      result_sha256: sha256("wrong"),
    }),
    /SHA-256 mismatch/,
  )
  await assert.rejects(
    executeModule(f.ctx, "knowledge", "read", {
      result_file: "saved-index.json",
      result_sha256,
      offset: 3,
    }),
    /offset exceeds/,
  )
  await assert.rejects(
    executeModule(f.ctx, "knowledge", "read", { result_file: "../outside.json", result_sha256 }),
    /path|root|scope|escape/i,
  )
})

test("native knowledge jobs page their stored index envelope without source revalidation", async (t) => {
  const f = await fixture(t, { nativeJob: true })
  atomicWrite(f.ctx.repo, "data/research-source-channels.json", {})
  atomicWrite(f.ctx.repo, "data/research-model-policy.json", {})
  const ctx = moduleContext(f.ctx)
  const indexJob = await submitModuleJob(
    ctx,
    "knowledge",
    "index",
    {
      graph_file: "graph.json",
      graph_sha256: sha256(fs.readFileSync(path.join(f.root, "graph.json"))),
      knowledge_selections_file: "inputs/selections.json",
    },
    { jobId: "module-fixture-knowledge-index", background: false },
  )
  assert.equal(indexJob.state, "completed", indexJob.error)
  const envelope = JSON.parse(fs.readFileSync(path.join(f.root, indexJob.result.path)))
  assert.equal(envelope.schema, "research-module-result/v1")
  assert.equal(envelope.operation, "index")
  assert.equal(envelope.data.concepts.length, 2)
  fs.unlinkSync(path.join(f.root, f.doc.body_path))
  const readJob = await submitModuleJob(
    ctx,
    "knowledge",
    "read",
    {
      result_file: indexJob.result.path,
      result_sha256: indexJob.result.sha256,
      section: "concepts",
      limit: 1,
    },
    { jobId: "module-fixture-knowledge-read", background: false },
  )
  assert.equal(readJob.state, "completed", readJob.error)
  const page = JSON.parse(fs.readFileSync(path.join(f.root, readJob.result.path))).data
  assert.equal(page.schema, "research-ontology-knowledge-page/v1")
  assert.equal(page.page.total, 2)
  assert.equal(page.page.returned, 1)
  assert.equal(page.page.next_offset, 1)
  assert.equal(page.snapshot.sha256, indexJob.result.sha256)
  assert.equal(page.approvals_created, false)
  for (const invalid of [
    { ...envelope, module: "classification" },
    { ...envelope, operation: "read" },
  ]) {
    atomicWrite(f.root, "wrong-result.json", invalid)
    await assert.rejects(
      executeModule(ctx, "knowledge", "read", {
        result_file: "wrong-result.json",
        result_sha256: sha256(fs.readFileSync(path.join(f.root, "wrong-result.json"))),
      }),
      /saved knowledge index/i,
    )
  }
})

test("impact returns only exact reviewed connection dependencies for a source or claim", async (t) => {
  const f = await fixture(t),
    options = {
      vault: f.vault,
      knowledgeSelections: f.selections,
      connectionReviewRun: "connections",
    }
  await approveKnowledgeConnections(f.root, "connections", f.decision, f.selections, options)
  const source = ontologyImpact(
    f.root,
    f.graph,
    { source_version_id: f.doc.source_version_id },
    options,
  )
  assert.equal(source.knowledge_connections.length, 1)
  assert.equal(source.articles.length, 1)
  assert.deepEqual(source.scope.explicit_connection_review_runs, ["connections"])
  assert.equal(
    ontologyImpact(f.root, f.graph, { claim_id: "unassigned", run: "source" }, options)
      .knowledge_connections.length,
    0,
  )
  assert.equal(
    ontologyImpact(f.root, f.graph, { claim_id: "selected", run: "source" }, options).articles
      .length,
    0,
  )
  assert.equal(
    ontologyImpact(f.root, f.graph, { claim_id: "selected", run: "source" }, options)
      .knowledge_connections[0].facts[0].claim_id,
    "selected",
  )
})

test("graph and module page contract failures do not create approvals", async (t) => {
  const f = await fixture(t)
  await assert.rejects(
    executeModule(f.ctx, "knowledge", "index", {
      graph_file: "graph.json",
      graph_sha256: sha256("wrong"),
    }),
    /graph file SHA/,
  )
  for (const extra of [{ limit: 0 }, { offset: -1 }, { section: "workflow" }, { guessed: true }])
    await assert.rejects(
      executeModule(f.ctx, "knowledge", "read", {
        result_file: "graph.json",
        result_sha256: sha256(fs.readFileSync(path.join(f.root, "graph.json"))),
        ...extra,
      }),
      /bound|schema|field|enum|integer/i,
    )
  assert.equal(
    fs.existsSync(path.join(f.root, "runs/connections/approved-connections.json")),
    false,
  )
})
