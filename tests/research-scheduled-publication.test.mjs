// Test-only acquisition artifacts and grouping rows, never operational receipts.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { execFileSync, spawnSync } from "node:child_process"
import { editionFixture } from "./fixtures/research-event-fixtures.mjs"
import { deliveryFixture } from "./fixtures/publication-delivery.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON, safePath } from "../scripts/research/run-state.mjs"
import {
  freezeShadowCollectionInputs,
  freezeShadowHandoffBasis,
  loadShadowHandoffBasis,
} from "../scripts/research/shadow-collection-basis.mjs"
import {
  loadScheduledPublicationInputs,
  requestPublicationDelivery,
} from "../scripts/research/authoring-delivery-request.mjs"
import {
  recordShadowOperation,
  auditShadowOperations,
  summarizeShadowOperations,
  SHADOW_CRITERIA,
} from "../scripts/research/shadow-operations.mjs"
import { module as publication } from "../scripts/research/modules/publication.mjs"
import { validateArguments } from "../scripts/research/modules/contracts.mjs"

async function scheduledFixture(t) {
  const f = editionFixture(t)
  const put = (file, value) => atomicWrite(f.root, file, value)
  const ref = (file) => ({ path: file, sha256: sha256(fs.readFileSync(safePath(f.root, file))) })
  const dailyRun = "daily-fixture"
  const configFile = safePath(f.root, "routes.json")
  fs.writeFileSync(configFile, JSON.stringify({ routes: [] }))
  const plan = {
    run_id: dailyRun,
    kst_day: "2026-09-28",
    created_at: "2026-09-27T23:01:00Z",
    config_sha256: sha256(`${configFile}:${sha256(fs.readFileSync(configFile))}`),
  }
  put(`daily/runs/${dailyRun}/plan.json`, plan)
  const acquisition = await freezeShadowCollectionInputs({
    root: f.root,
    plan,
    configFile,
    sourcePaths: [configFile],
    activeRoutes: [{ channel_id: "fixture" }],
  })
  const backlogFile = safePath(f.root, "backlog.json")
  fs.writeFileSync(backlogFile, JSON.stringify({ candidates: [] }))
  const receipts = [
    {
      daily_run: dailyRun,
      status: "incomplete",
      started_at: "2026-09-27T23:02:00Z",
      finished_at: "2026-09-28T00:10:00Z",
    },
  ]
  const inputs = {
    plan_sha256: ref(`daily/runs/${dailyRun}/plan.json`).sha256,
    receipts_sha256: sha256(JSON.stringify(receipts)),
    backlog_sha256: sha256(fs.readFileSync(backlogFile)),
    daily_coverage_sha256: null,
  }
  const handoffPath = `daily/runs/${dailyRun}/handoffs/${sha256(JSON.stringify(inputs))}.json`
  put(handoffPath, {
    schema: "research-editorial-handoff/v1",
    daily_run: dailyRun,
    inputs,
    incomplete_windows: [{ channel_id: "fixture", reason: "test-only incomplete collection" }],
  })
  put(`daily/runs/${dailyRun}/summary.json`, {
    schema: "research-daily-summary/v1",
    run_id: dailyRun,
    receipts: receipts.length,
  })
  const collectionBasis = await freezeShadowHandoffBasis({
    root: f.root,
    dailyRun,
    handoffPath,
    receipts,
    backlogFile,
  })
  const basis = loadShadowHandoffBasis(f.root, collectionBasis)
  const report = {
    ...f.report,
    evidence: [
      acquisition,
      basis.plan,
      ref(`daily/runs/${dailyRun}/summary.json`),
      collectionBasis,
    ],
  }
  const reportRef = put("scheduled-report.json", report)
  const edition = readJSON(f.root, f.editionRef.path)
  const editionRef = put(f.editionRef.path, { ...edition, report: reportRef })
  const invocation = {
    schema: "research-scheduled-invocation/v2",
    kind: "scheduled",
    schedule_id: "tech-knowledge-garden-04",
    execution_id: "test-only-scheduled-execution",
    started_at: "2026-09-27T23:00:00Z",
    reason: "Test-only attributed scheduler evidence",
    evidence: put("scheduler-evidence.json", {
      fixture: true,
      kind: "scheduled",
      schedule_id: "tech-knowledge-garden-04",
      started_at: "2026-09-27T23:00:00Z",
      execution_id: "test-only-scheduled-execution",
    }),
  }
  const input = {
    invocation: put("invocation.json", invocation),
    collection_basis: collectionBasis,
  }
  const selection = {
    schema: "research-daily-publication-handoff/v3",
    edition: editionRef,
    approved_runs: [
      {
        source_revisions: f.sources.slice(0, 3).map((source) => ({
          source_version_id: source.document.source_version_id,
          parse_id: source.parsed.parse_id,
        })),
      },
    ],
  }
  return { ...f, put, ref, dailyRun, input, selection, report, invocation }
}

test("scheduled native inputs require this execution's exact frozen material and preserve its retained summary", async (t) => {
  const f = await scheduledFixture(t)
  const verified = loadScheduledPublicationInputs(f.ctx, f.input, f.selection, {
    notAfter: "2026-09-28T02:00:00Z",
  })
  assert.equal(verified.plan.kst_day, "2026-09-28")
  assert.equal(verified.report.status, "partial")
  assert.equal(verified.summary.receipts, 1)
  f.put(`daily/runs/${f.dailyRun}/summary.json`, { receipts: 999 })
  assert.equal(loadScheduledPublicationInputs(f.ctx, f.input, f.selection).summary.receipts, 1)
  const manual = f.put("manual-invocation.json", { ...f.invocation, kind: "manual" })
  assert.throws(
    () => loadScheduledPublicationInputs(f.ctx, { ...f.input, invocation: manual }, f.selection),
    /scheduled invocation capture/,
  )
  const wrongDay = f.put("wrong-day-invocation.json", {
    ...f.invocation,
    started_at: "2026-09-26T23:00:00Z",
    evidence: f.put("wrong-day-evidence.json", {
      fixture: true,
      kind: "scheduled",
      schedule_id: f.invocation.schedule_id,
      execution_id: f.invocation.execution_id,
      started_at: "2026-09-26T23:00:00Z",
    }),
  })
  assert.throws(
    () => loadScheduledPublicationInputs(f.ctx, { ...f.input, invocation: wrongDay }, f.selection),
    /scheduled collection and frozen basis/,
  )
  const otherMaterial = structuredClone(f.selection)
  otherMaterial.approved_runs[0].source_revisions[0].source_version_id = "another-version"
  assert.throws(
    () => loadScheduledPublicationInputs(f.ctx, f.input, otherMaterial),
    /exact material observed in this execution/,
  )
  assert.throws(
    () =>
      loadScheduledPublicationInputs(f.ctx, f.input, f.selection, {
        notAfter: "2026-09-28T00:01:00Z",
      }),
    /scheduled collection and frozen basis/,
  )
  const unboundReport = f.put("unbound-report.json", { ...f.report, evidence: [] })
  const unboundEdition = f.put("editions/unbound/materials.json", {
    schema: "research-edition-materials/v1",
    run_id: "unbound",
    daily_run: f.dailyRun,
    report: unboundReport,
  })
  assert.throws(
    () =>
      loadScheduledPublicationInputs(f.ctx, f.input, { ...f.selection, edition: unboundEdition }),
    /scheduled collection and frozen basis/,
  )
  fs.writeFileSync(safePath(f.root, f.invocation.evidence.path), "changed actual evidence")
  assert.throws(
    () => loadScheduledPublicationInputs(f.ctx, f.input, f.selection),
    /scheduled invocation capture/,
  )
  assert.equal((await auditShadowOperations(f.root)).completed_runs, 0)
})

test("optional schedule pins keep the existing native request contract and an unbound request cannot count a review", async (t) => {
  const f = await deliveryFixture(t)
  const status = await requestPublicationDelivery(f.ctx, f.request)
  const original = readJSON(f.root, status.request.path)
  assert.equal(Object.hasOwn(original, "invocation"), false)
  assert.equal(Object.hasOwn(original, "collection_basis"), false)
  assert.equal(status.status, "release_required")
  const badRun = { ...f.request, run_id: "half-scheduled", invocation_path: "missing.json" }
  await assert.rejects(requestPublicationDelivery(f.ctx, badRun), /exact path\/SHA/)
  assert.equal(
    fs.existsSync(safePath(f.root, "runs/half-scheduled/publication-delivery/input.json")),
    false,
  )
  const evidence = f.ref(status.request.path)
  const review = {
    schema: "research-shadow-review/v2",
    run_id: "native-shadow",
    reviewer_kind: "human",
    reviewer: "test-only reviewer",
    reviewed_at: "2026-09-29T03:00:00Z",
    published_by: "legacy",
    candidate_published: false,
    processing_seconds: 1,
    delivery_run: f.request.run_id,
    legacy_publication_run: "legacy",
    delivery_request: evidence,
    comparison: Object.fromEntries(
      SHADOW_CRITERIA.map((key) => [
        key,
        {
          decision: "accepted",
          reason: "Test-only comparison",
          evidence,
        },
      ]),
    ),
  }
  f.put("review.json", review)
  const reviewRef = f.ref("review.json")
  await assert.rejects(
    recordShadowOperation({
      root: f.root,
      run: review.run_id,
      reviewPath: reviewRef.path,
      reviewSha256: "0".repeat(64),
      repository: f.ctx.repo,
    }),
    /Exact comparison review SHA/,
  )
  await assert.rejects(
    recordShadowOperation({
      root: f.root,
      run: review.run_id,
      reviewPath: reviewRef.path,
      reviewSha256: reviewRef.sha256,
      repository: f.ctx.repo,
    }),
    /Scheduled native delivery request required/,
  )
  assert.equal(
    fs.existsSync(safePath(f.root, `evaluation/shadow/${review.run_id}/receipt.json`)),
    false,
  )
  assert.equal((await auditShadowOperations(f.root)).completed_runs, 0)
})

test("native comparison grouping excludes reused raw invocation evidence across renamed executions without changing legacy grouping", () => {
  // Pure grouping rows. They are not written or accepted by the receipt auditor.
  const row = (run, day, raw) => ({
    run_id: run,
    day,
    edition: `issue-${day}`,
    execution_id: `execution-${run}`,
    reviewed_at: "2026-09-30T02:00:00Z",
    status: "completed_comparison",
    ...(raw ? { invocation_evidence_sha256: raw } : {}),
  })
  const result = summarizeShadowOperations([
    row("a", "2026-09-28", "a".repeat(64)),
    row("b", "2026-09-29", "a".repeat(64)),
    row("c", "2026-09-30", "b".repeat(64)),
    row("d", "2026-10-01"),
  ])
  assert.deepEqual(result.counted_runs, ["a", "c", "d"])
  assert.deepEqual(result.duplicate_runs, ["b"])
  assert.equal(result.target_runs, 7)
  assert.equal(result.operational_promotion_verified, false)
})

test("publication operational schemas and CLI enforce private path scopes, exact review SHA and stage flags", async (t) => {
  const f = await scheduledFixture(t)
  const p = { run_id: "shadow", review_path: "review.json", review_sha256: "a".repeat(64) }
  assert.deepEqual(validateArguments(p, publication.operations.shadow_record.inputSchema, f.ctx), p)
  assert.throws(
    () =>
      validateArguments(
        { ...p, review_path: "../outside.json" },
        publication.operations.shadow_record.inputSchema,
        f.ctx,
      ),
    /Unsafe|escape|relative/i,
  )
  assert.throws(
    () =>
      validateArguments(
        { run_id: "shadow", review_path: "review.json" },
        publication.operations.shadow_record.inputSchema,
        f.ctx,
      ),
    /review_sha256/,
  )
  assert.equal(publication.operations.shadow_status.readOnly, true)
  assert.equal(publication.operations.shadow_record.network, false)
  const basis = await publication.operations.shadow_basis.run(f.ctx, { daily_run: f.dailyRun })
  assert.deepEqual(basis, f.input.collection_basis)
  const cli = path.join(f.ctx.repo, "scripts/research-publication.mjs")
  const status = JSON.parse(
    execFileSync(process.execPath, [cli, "shadow-status", "--repo", f.ctx.repo, "--root", f.root], {
      encoding: "utf8",
      cwd: f.ctx.repo,
    }),
  )
  assert.equal(status.completed_runs, 0)
  assert.equal(status.operational_promotion_verified, false)
  const invalid = spawnSync(
    process.execPath,
    [cli, "shadow-status", "--repo", f.ctx.repo, "--root", f.root, "--review", "review.json"],
    { encoding: "utf8", cwd: f.ctx.repo },
  )
  assert.equal(invalid.status, 1)
  assert.match(invalid.stderr, /only that stage's exact evidence/)
})
