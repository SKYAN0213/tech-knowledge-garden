import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"
import { moduleCatalog, executeModule } from "../scripts/research/module-registry.mjs"
import {
  moduleContext,
  submitModuleJob,
  moduleJobStatus,
  resumeModuleJob,
  readModuleResult,
} from "../scripts/research/module-runtime.mjs"
import { moduleCLI } from "../scripts/research/module-cli.mjs"
import { summarizeCollection } from "../scripts/research/collection-report.mjs"
import { loadSelectedEvent } from "../scripts/research/event-pipeline.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON, safePath } from "../scripts/research/run-state.mjs"

const repo = fs.realpathSync(fileURLToPath(new URL("../", import.meta.url)))
import {
  fixture,
  source,
  editionFixture,
  selectedFixture,
} from "./fixtures/research-event-fixtures.mjs"

test("twelve independently selectable modules share 67 strict operation contracts", () => {
  const catalog = moduleCatalog()
  assert.equal(catalog.modules.length, 12)
  assert.equal(catalog.modules.flatMap((m) => m.operations).length, 67)
  assert.deepEqual(
    moduleCatalog(["publication"]).modules[0].operations.map((operation) => ({
      name: operation.tool_name,
      readOnly: operation.readOnly,
      model: operation.model,
      network: operation.network,
    })),
    [
      { name: "publication_prepare", readOnly: false, model: false, network: false },
      { name: "publication_status", readOnly: true, model: false, network: false },
      { name: "publication_request_delivery", readOnly: false, model: false, network: false },
      { name: "publication_deliver", readOnly: false, model: false, network: true },
      { name: "publication_delivery_receipt", readOnly: false, model: false, network: false },
      { name: "publication_delivery_status", readOnly: true, model: false, network: false },
      { name: "publication_fallback", readOnly: false, model: false, network: false },
      { name: "publication_shadow_basis", readOnly: false, model: false, network: false },
      { name: "publication_shadow_record", readOnly: false, model: false, network: false },
      { name: "publication_shadow_status", readOnly: true, model: false, network: false },
    ],
  )
  assert.equal(moduleCatalog(["collection"]).modules.length, 1)
  for (const operation of ["targeted", "followups"])
    assert.equal(
      catalog.modules
        .find((m) => m.id === "collection")
        .operations.find((op) => op.id === operation)?.network,
      true,
    )
  assert.throws(() => moduleCatalog(["collection", "collection"]), /duplicate/)
  assert.equal(
    catalog.modules
      .find((m) => m.id === "writing")
      .operations[0].inputSchema.required.includes("selection_sha256"),
    true,
  )
})

test("module contract rejects shell flags, traversal, inherited required fields and numeric overflow", async (t) => {
  const { ctx } = fixture(t)
  await assert.rejects(
    () => executeModule(ctx, "collection", "audit", { run_id: "x", concurrency: 7 }),
    /bound/,
  )
  await assert.rejects(
    () => executeModule(ctx, "collection", "inventory", { command: "arbitrary shell" }),
    /Unknown module field/,
  )
  await assert.rejects(
    () => executeModule(ctx, "classification", "inspect", { candidate_key: "   " }),
    /Invalid pattern/,
  )
  await assert.rejects(
    () => executeModule(ctx, "evidence", "review", { run_id: "x", review_file: "../secret" }),
    /escapes/,
  )
  await assert.rejects(
    () => executeModule(ctx, "parsing", "inspect", Object.create({ run_id: "x" })),
    /Missing module field/,
  )
  await assert.rejects(() => executeModule(ctx, "collection", "constructor", {}), /Unknown/)
})

test("daily module forwards a repo-scoped Drive snapshot to native verification before planning", async (t) => {
  const { ctx, root } = fixture(t)
  const snapshot = path.relative(ctx.repo, path.join(root, "invalid-drive-snapshot.json"))
  fs.writeFileSync(path.join(ctx.repo, snapshot), JSON.stringify({ complete: false }))
  await assert.rejects(
    executeModule(ctx, "collection", "daily", {
      run_id: "drive-preflight",
      mode: "plan-only",
      drive_snapshot_file: snapshot,
    }),
    /Drive snapshot verification failed/,
  )
  assert.equal(readJSON(root, "daily/runs/drive-preflight/plan.json"), null)
  await assert.rejects(
    executeModule(ctx, "collection", "daily", {
      run_id: "drive-preflight",
      mode: "plan-only",
      drive_snapshot_file: "../outside.json",
    }),
    /escapes/,
  )
})

test("collection input remains partial and unreviewed proposals cannot call a writer", async (t) => {
  const f = editionFixture(t)
  const result = await executeModule(f.ctx, "edition", "read", {
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
  })
  assert.equal(result.edition.status, "partial")
  const proposals = await executeModule(f.ctx, "classification", "plan", {
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
  })
  assert.equal(proposals.candidates.length, 4)
  assert.equal(proposals.writer_allowed, false)
  await assert.rejects(
    () => executeModule(f.ctx, "writing", "draft", { run_id: "unselected" }),
    /Missing module field/,
  )
  await assert.rejects(
    () =>
      executeModule(f.ctx, "edition", "freeze", {
        run_id: "fake",
        report_path: f.report.materials[0].parse_path,
        report_sha256: f.report.materials[0].parse_sha256,
      }),
    /Native immutable/,
  )
})

test("relation review requires original quotes and both identity/action comparisons before grouping", async (t) => {
  const f = editionFixture(t)
  f.review.events[0].materials[1].matches[0].quote =
    "A forged original quotation that was never captured"
  atomicWrite(f.root, "review.json", f.review)
  await assert.rejects(
    () => executeModule(f.ctx, "classification", "review", f.parameters),
    /exact original/,
  )
  f.review.events[0].materials[1].matches = undefined
  delete f.review.events[0].materials[1].matches
  atomicWrite(f.root, "review.json", f.review)
  await assert.rejects(
    () => executeModule(f.ctx, "classification", "review", f.parameters),
    /identity-marker/,
  )
  assert.equal(fs.existsSync(path.join(f.root, "event-plans/fixture-plan")), false)
})

test("different publication dates cannot merge without source-bound event-date comparison", async (t) => {
  const f = editionFixture(t, { differentDate: true })
  await assert.rejects(
    () => executeModule(f.ctx, "classification", "review", f.parameters),
    /event-date comparison/,
  )
  const sameEvent = f.review.events[0].materials[1]
  sameEvent.matches.push({
    ...sameEvent.matches[0],
    aspect: "event_date",
    quote: f.sources[1].parsed.blocks[0].text,
    primary_quote: f.sources[0].parsed.blocks[0].text,
    conclusion:
      "Both originals explicitly date the contract announcement to 2026-09-27; one page was published a day later",
  })
  atomicWrite(f.root, "review.json", f.review)
  const reviewed = await executeModule(f.ctx, "classification", "review", f.parameters)
  assert.equal(reviewed.status, "relationship_reviewed")
})

test("duplicate event identities are rejected and unmatched prior approvals cannot authorize reuse", async (t) => {
  const f = editionFixture(t)
  f.review.events[1].identity = f.review.events[0].identity
  atomicWrite(f.root, "review.json", f.review)
  await assert.rejects(
    () => executeModule(f.ctx, "classification", "review", f.parameters),
    /Duplicate event identity/,
  )
  f.review.events = [f.review.events[0]]
  f.review.events[0].action = "reuse"
  atomicWrite(f.root, "review.json", f.review)
  await assert.rejects(
    () => executeModule(f.ctx, "classification", "review", f.parameters),
    /native approval/,
  )
})

test("three reviewed originals produce one native source bundle and one writer binding; deferred event creates none", async (t) => {
  const f = await selectedFixture(t)
  const selected = loadSelectedEvent(f.ctx, f.selectedParameters)
  assert.equal(selected.sources.length, 3)
  const documents = readJSON(f.root, `runs/${selected.source_run}/documents.json`),
    parses = readJSON(f.root, `runs/${selected.source_run}/parses.json`)
  assert.equal(documents.length, 3)
  assert.equal(
    documents.some((d) => d.source_id === f.sources[3].document.source_id),
    false,
  )
  assert.equal(
    parses.every((p) => p.blocks.length === 2),
    true,
    "complete stored parses are preserved, not truncated to identity quotes",
  )
  const repeat = await executeModule(f.ctx, "selection", "prepare", {
    run_id: "another-writer",
    plan_path: f.plan.path,
    plan_sha256: f.plan.sha256,
    group_id: "order",
  })
  assert.equal(repeat.writer_run, "writer")
  assert.equal(repeat.reused, true)
  assert.equal(fs.existsSync(path.join(f.root, "runs/another-writer")), false)
  await assert.rejects(
    () =>
      executeModule(f.ctx, "selection", "prepare", {
        run_id: "deferred-writer",
        plan_path: f.plan.path,
        plan_sha256: f.plan.sha256,
        group_id: "deferred",
      }),
    /reviewed write or revision event/,
  )
})

test("changed original evidence and verified facts from another event are blocked before model preparation", async (t) => {
  const f = await selectedFixture(t),
    stored = readJSON(f.root, `event-selections/writer/selection.json`)
  atomicWrite(
    f.root,
    "runs/writer/documents.json",
    readJSON(f.root, `runs/${stored.source_run}/documents.json`),
  )
  atomicWrite(
    f.root,
    "runs/writer/parses.json",
    readJSON(f.root, `runs/${stored.source_run}/parses.json`),
  )
  const s = f.sources[0]
  const claim = {
    claim_id: "test-claim",
    review: { status: "verified" },
    evidence: [
      {
        source_version_id: s.document.source_version_id,
        parse_id: s.parsed.parse_id,
        block_id: s.parsed.blocks[1].block_id,
      },
    ],
  }
  atomicWrite(f.root, "runs/writer/reviewed-claims.json", { claims: [claim] })
  await assert.rejects(
    () => executeModule(f.ctx, "writing", "draft", f.selectedParameters),
    /outside the selected event/,
  )
  assert.equal(fs.existsSync(path.join(f.root, "runs/writer/model-budget")), false)
  atomicWrite(f.root, s.document.body_path, "changed original bytes")
  await assert.rejects(
    () => executeModule(f.ctx, "evidence", "extract", f.selectedParameters),
    /changed|integrity|hash/,
  )
})

test("completed jobs from a former checkout do not block new work and foreign live owners stay protected", async (t) => {
  const { ctx, root } = fixture(t),
    id = "module-historical"
  const input = {
    job_id: id,
    context: { ...ctx, repo: ctx.repo + "-previous", root: ctx.root + "-previous" },
  }
  const state = {
    schema: "research-module-job/v1",
    job_id: id,
    input_sha256: sha256(JSON.stringify(input)),
    state: "completed",
  }
  atomicWrite(root, `module-jobs/${id}/input.json`, input)
  atomicWrite(root, `module-jobs/${id}/state.json`, state)
  const result = await submitModuleJob(
    ctx,
    "collection",
    "inventory",
    {},
    { jobId: "module-new-location", background: false },
  )
  assert.equal(result.state, "completed")
  assert.throws(() => moduleJobStatus(ctx, id), /context changed/)
  atomicWrite(root, `module-jobs/${id}/state.json`, {
    ...state,
    state: "running",
    pid: process.pid,
  })
  await assert.rejects(
    submitModuleJob(
      ctx,
      "collection",
      "inventory",
      {},
      { jobId: "module-protect-owner", background: false },
    ),
    /context changed/,
  )
  assert.deepEqual(readJSON(root, `module-jobs/${id}/input.json`), input)
})

test("detached CLI worker persists results, pages by verified hash and reuses the same job without another attempt", async (t) => {
  const { ctx, root } = fixture(t)
  const completed = await submitModuleJob(
    ctx,
    "collection",
    "inventory",
    {},
    { jobId: "module-inventory", background: false },
  )
  assert.equal(completed.state, "completed")
  const first = readModuleResult(ctx, completed.job_id, { limit: 100 })
  assert.equal(first.next_offset, 100)
  const all = readModuleResult(ctx, completed.job_id, { limit: 64000 })
  assert.equal(all.chunk.startsWith("{"), true)
  const resultBytes = fs.readFileSync(safePath(root, completed.result.path))
  const full = JSON.parse(resultBytes)
  assert.equal(full.module, "collection")
  assert.equal(full.data.active_daily_routes > 0, true)
  const repeat = await submitModuleJob(
    ctx,
    "collection",
    "inventory",
    {},
    { jobId: completed.job_id, background: false },
  )
  assert.equal(repeat.attempt, completed.attempt)
  assert.equal(readModuleResult(ctx, repeat.job_id).result.sha256, completed.result.sha256)
  await assert.rejects(
    () =>
      submitModuleJob(
        ctx,
        "parsing",
        "inspect",
        { run_id: "changed" },
        { jobId: completed.job_id },
      ),
    /input changed/,
  )
  fs.appendFileSync(safePath(root, completed.result.path), " ")
  assert.throws(() => readModuleResult(ctx, completed.job_id), /hash changed/)
  fs.writeFileSync(safePath(root, completed.result.path), resultBytes)
  await assert.rejects(
    () => moduleCLI(["status", "--root", root, "--job", completed.job_id, "--offset", "1"]),
    /only to result/,
  )
})

test("failed jobs require explicit resume and only their dead module lock is recovered", async (t) => {
  const { ctx, root } = fixture(t)
  const failed = await submitModuleJob(
    ctx,
    "parsing",
    "inspect",
    { run_id: "origin-0" },
    { jobId: "module-resume", background: false },
  )
  assert.equal(failed.state, "failed")
  const repeat = await submitModuleJob(
    ctx,
    "parsing",
    "inspect",
    { run_id: "origin-0" },
    { jobId: failed.job_id, background: false },
  )
  assert.equal(repeat.attempt, 1)
  source(root, 0)
  atomicWrite(root, "locks/module-worker-module-resume.json", {
    owner: crypto.randomUUID(),
    pid: 2147483646,
    started_at: new Date().toISOString(),
  })
  atomicWrite(root, "locks/unrelated-native-run.json", {
    owner: crypto.randomUUID(),
    pid: 2147483646,
    started_at: new Date().toISOString(),
  })
  const recovered = await resumeModuleJob(ctx, failed.job_id, { background: false })
  assert.equal(recovered.state, "completed")
  assert.equal(recovered.attempt, 2)
  assert.equal(fs.existsSync(path.join(root, "locks/unrelated-native-run.json")), true)
  // Simulate the documented result-commit interruption boundary only.
  atomicWrite(root, "module-jobs/module-resume/state.json", {
    ...recovered,
    state: "finishing",
    pid: null,
  })
  assert.equal(moduleJobStatus(ctx, failed.job_id).state, "interrupted")
  const resultRecovered = await resumeModuleJob(ctx, failed.job_id, { background: false })
  assert.equal(resultRecovered.result_recovered, true)
  assert.equal(resultRecovered.result.sha256, recovered.result.sha256)
})

test("a changed review input file cannot be retried under its original job ID", async (t) => {
  const f = editionFixture(t)
  atomicWrite(f.root, "review.json", { ...f.review, schema: "bad-review" })
  const failed = await submitModuleJob(f.ctx, "classification", "review", f.parameters, {
    jobId: "module-file-change",
    background: false,
  })
  assert.equal(failed.state, "failed")
  atomicWrite(f.root, "review.json", f.review)
  await assert.rejects(
    () => resumeModuleJob(f.ctx, failed.job_id, { background: false }),
    /input changed/,
  )
})
