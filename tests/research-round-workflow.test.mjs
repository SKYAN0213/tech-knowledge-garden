import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { execFileSync } from "node:child_process"
import { editionFixture, selectedFixture } from "./fixtures/research-event-fixtures.mjs"
import { advanceRoundWorkflow } from "../scripts/research/round-workflow.mjs"
import { advanceEventWorkflow } from "../scripts/research/event-workflow.mjs"
import { executeModule } from "../scripts/research/module-registry.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { draftFingerprint } from "../scripts/research/editor.mjs"
import { approvedArticle } from "../scripts/research/publish-adapter.mjs"
import { loadCurrentApproval } from "../scripts/research/preview.mjs"
import { loadDailyPublicationSelection } from "../scripts/research/daily-publication-handoff.mjs"
import { atomicWrite, readJSON, safePath } from "../scripts/research/run-state.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"

const reference = (root, file) => ({
  path: file,
  sha256: sha256(fs.readFileSync(safePath(root, file))),
})
const sourceReport = (f) => readJSON(f.root, f.editionRef.path).report
const roundParameters = (f, run_id) => ({
  run_id,
  edition_path: f.editionRef.path,
  edition_sha256: f.editionRef.sha256,
  execute: true,
  max_items: 1,
  time_budget_ms: 10000,
})
const withPlan = (p, plan) => ({ ...p, plan_path: plan.path, plan_sha256: plan.sha256 })

function isolateContext(f) {
  const vault = path.join(f.root, "test-vault")
  fs.mkdirSync(vault, { recursive: true })
  const policy = path.join(f.root, "test-model-policy.json")
  fs.writeFileSync(policy, fs.readFileSync(f.ctx.policy))
  f.ctx = { ...f.ctx, vault, policy }
  return f
}

function assertPrivate(result) {
  assert.equal(result.schema, "research-round-workflow/v1")
  assert.equal(result.candidate_published, false)
  assert.equal(result.canonical_writes, 0)
  assert.equal(result.new_regular_operation_counted, false)
}

function checkedReference(root, ref) {
  assert.ok(ref?.path)
  assert.equal(reference(root, ref.path).sha256, ref.sha256)
  return readJSON(root, ref.path)
}

async function reviewedPlan(f, { defer = false, run = "fixture-plan", reason } = {}) {
  const review = structuredClone(f.review)
  if (defer) review.events.forEach((event) => (event.action = "defer"))
  if (reason) review.events[0].reason = reason
  const file = `reviews/${run}.json`
  atomicWrite(f.root, file, review)
  return executeModule(f.ctx, "classification", "review", {
    ...f.parameters,
    run_id: run,
    review_file: path.relative(f.ctx.repo, safePath(f.root, file)),
  })
}

// These processors are explicit coordination fixtures. They never create a
// production approval or stand in for the separately checked native route.
function coordinationFixture(t, { pending = false, eventStatus = "complete" } = {}) {
  const f = isolateContext(editionFixture(t))
  f.report.routes[0].windows[0].attempts[0].reason = "Explicit fixture original access failed"
  const reportBytes = JSON.stringify(f.report, null, 2) + "\n"
  const edition = readJSON(f.root, f.editionRef.path)
  edition.report = atomicWrite(
    f.root,
    `daily/runs/daily-fixture/collection-reports/${sha256(reportBytes)}.json`,
    reportBytes,
  )
  f.editionRef = atomicWrite(f.root, f.editionRef.path, edition)
  f.parameters.edition_sha256 = f.editionRef.sha256
  const settled = sourceReport(f)
  const pendingReport = structuredClone(f.report)
  pendingReport.counts.pending_windows = 1
  pendingReport.counts.incomplete_windows = 0
  pendingReport.routes.forEach((route) => {
    route.status = "pending"
    route.windows.forEach((window) => {
      window.status = "pending"
      window.attempts = []
    })
  })
  const pendingBytes = JSON.stringify(pendingReport, null, 2) + "\n"
  const pendingRef = atomicWrite(
    f.root,
    `daily/runs/daily-fixture/collection-reports/${sha256(pendingBytes)}.json`,
    pendingBytes,
  )
  const state = {
    pending,
    eventStatus,
    rowStatus: "fact_review",
    interruptEvents: false,
    interruptPublication: false,
  }
  const calls = {
    collector: [],
    reporter: [],
    freezer: [],
    events: [],
    knowledge: [],
    publication: [],
  }
  const dependencies = {
    clock: () => 1000,
    collector: async (p) => {
      calls.collector.push(p)
      return { status: "partial", fixture_only: true }
    },
    reporter: async (p) => {
      calls.reporter.push(p)
      const ref = state.pending ? pendingRef : settled
      const report = readJSON(f.root, ref.path)
      return { ...ref, status: report.status, counts: report.counts }
    },
    freezer: async (ctx, p) => {
      calls.freezer.push(p)
      assert.equal(ctx.root, f.root)
      assert.deepEqual({ path: p.report_path, sha256: p.report_sha256 }, settled)
      return { ...f.editionRef, status: "partial", reused: false }
    },
    eventProcessor: async (ctx, p) => {
      calls.events.push(p)
      if (state.interruptEvents) {
        state.interruptEvents = false
        throw Error("Explicit test fixture interruption after the edition was frozen")
      }
      const edition = { path: p.edition_path, sha256: p.edition_sha256 }
      const plan = p.plan_path ? { path: p.plan_path, sha256: p.plan_sha256 } : null
      atomicWrite(ctx.root, `event-workflows/${p.run_id}/input.json`, {
        schema: "research-event-workflow-input/v1",
        run_id: p.run_id,
        edition,
        plan,
        policy_sha256: sha256(fs.readFileSync(ctx.policy)),
      })
      const status = plan ? state.eventStatus : "relationship_review"
      const events = plan ? readJSON(ctx.root, plan.path).events : []
      const rows = events.map((event) => ({
        group_id: event.group_id,
        action: event.action,
        status:
          event.action === "defer"
            ? "deferred"
            : status === "planned"
              ? "queued"
              : status === "waiting_for_reasoning"
                ? "waiting_for_reasoning"
                : state.rowStatus,
        ...(event.action !== "defer" ? { writer_run: "fixture-writer" } : {}),
        ...(state.rowStatus === "editorial_review" && event.action !== "defer"
          ? {
              next_input: {
                module: "validation",
                operation: "reader",
                parameters: { run_id: "fixture-writer" },
              },
            }
          : {}),
        ...(status === "waiting_for_reasoning" && event.action !== "defer"
          ? {
              reasoning_task: {
                task_id: "fixture-reasoning",
                request_sha256: sha256("fixture-request"),
              },
            }
          : {}),
      }))
      const ontology =
        status === "complete"
          ? atomicWrite(ctx.root, `event-workflows/${p.run_id}/ontology.json`, {
              schema: "test-round-coordination-ontology/v1",
              sha256: sha256("explicit coordination fixture, never a native approval"),
              inputs: [],
              fixture_only: true,
            })
          : null
      const result = {
        schema: "research-event-workflow/v1",
        run_id: p.run_id,
        status,
        edition,
        ...(plan ? { plan } : {}),
        collection_status: "partial",
        rows,
        failures: [],
        approved_runs: [],
        ...(ontology ? { ontology } : {}),
        model_calls: 0,
        article_writes: 0,
        candidate_published: false,
      }
      atomicWrite(ctx.root, `event-workflows/${p.run_id}/latest.json`, result)
      return result
    },
    knowledgeProcessor: async (ctx, p) => {
      calls.knowledge.push(p)
      const graph = checkedReference(ctx.root, p.ontology)
      return {
        schema: "research-ontology-knowledge-index/v1",
        graph_sha256: graph.sha256,
        events: [],
        concepts: [],
        fixture_only: true,
      }
    },
    publicationProcessor: async (ctx, p) => {
      calls.publication.push(p)
      if (state.interruptPublication) {
        state.interruptPublication = false
        throw Error("Explicit test fixture interruption after knowledge projection")
      }
      const events = checkedReference(ctx.root, {
        path: p.workflow_path,
        sha256: p.workflow_sha256,
      })
      const publication_handoff = atomicWrite(ctx.root, `fixture-handoffs/${p.run_id}.json`, {
        schema: "research-daily-publication-handoff/v3",
        workflow: { path: p.workflow_path, sha256: p.workflow_sha256 },
        approved_runs: [],
        reused_runs: [],
        candidate_published: false,
        fixture_only: true,
      })
      return {
        publication_handoff,
        status: events.status === "complete" ? "no_authoring_changes" : events.status,
      }
    },
  }
  return { ...f, state, calls, dependencies, settled, pendingRef }
}

test("collection planning omits execution-only limits and pins an in-repo absolute config", async (t) => {
  const f = coordinationFixture(t)
  const result = await advanceRoundWorkflow(
    f.ctx,
    {
      run_id: "collection-plan",
      daily_run: "daily-fixture",
      collect: true,
      execute: false,
      collection_config_file: path.join(f.ctx.repo, "data/research-daily-routes.json"),
      time_budget_ms: 10000,
    },
    f.dependencies,
  )
  assert.equal(result.status, "collection_planned")
  assert.equal(f.calls.collector[0].mode, "plan-only")
  assert.equal(Object.hasOwn(f.calls.collector[0], "maxWindows"), false)
  assert.equal(Object.hasOwn(f.calls.collector[0], "timeBudgetMs"), false)
  assert.equal(
    f.calls.collector[0].configFile,
    path.join(f.ctx.repo, "data/research-daily-routes.json"),
  )
  assert.equal(
    readJSON(f.root, "round-workflows/collection-plan/input.json").collection_config.path,
    "data/research-daily-routes.json",
  )
  for (const name of ["freezer", "events", "knowledge", "publication"])
    assert.equal(f.calls[name].length, 0)
  await assert.rejects(
    advanceRoundWorkflow(
      f.ctx,
      {
        run_id: "invalid-plan-limits",
        daily_run: "daily-fixture",
        collect: true,
        execute: false,
        collection_max_windows: 1,
      },
      f.dependencies,
    ),
    /limits require explicit collection execution/,
  )
})

test("native collection plan CLI runs outside the repo and resolves caller files before changing cwd", (t) => {
  const f = editionFixture(t)
  const caller = fs.realpathSync(os.tmpdir())
  const mapping = path.join(f.root, "caller-review-map.json")
  fs.writeFileSync(mapping, "{}\n")
  // A new private root needs its own explicit fixture baseline; production
  // coverage receipts are not available here and are never copied or changed.
  const baseline = "cli-fixture-baseline"
  const config = JSON.parse(
    fs.readFileSync(path.join(f.ctx.repo, "data/research-daily-routes.json")),
  )
  config.routes = [{ ...config.routes.find((row) => row.enabled), baseline_run: baseline }]
  const configFile = path.join(f.root, "cli-fixture-config.json")
  fs.writeFileSync(configFile, JSON.stringify(config))
  const url = "https://fixture.example/empty-list"
  const body = Buffer.from('{"items":[]}')
  const source_id = sourceId(url)
  const body_sha256 = sha256(body)
  const body_path = "cli-fixture-list.bin"
  atomicWrite(f.root, body_path, body)
  const artifacts = {
    "list-scan.json": {
      status: "window_scanned",
      channel_id: config.routes[0].channel_id,
      window: { since: "2026-09-01", until_exclusive: "2026-09-02" },
      candidate_count: 0,
      fixture_only: true,
    },
    "list-pages.json": [
      {
        original_url: url,
        source_id,
        source_version_id: `${source_id}:${body_sha256}`,
        fetch_status: "captured",
        body_path,
        body_sha256,
      },
    ],
    "documents.json": [],
    "parses.json": [],
    "candidates.json": [],
  }
  for (const [file, value] of Object.entries(artifacts))
    atomicWrite(f.root, `runs/${baseline}/${file}`, value)
  const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).replaceAll("-", "")
  const dailyRun = `daily-${day}-cli-native-collection`
  const stdout = execFileSync(
    process.execPath,
    [
      path.join(f.ctx.repo, "scripts/research-core.mjs"),
      "--round",
      "--run",
      "cli-native-plan",
      "--daily-run",
      dailyRun,
      "--root",
      f.root,
      "--collect",
      "--plan-only",
      "--config",
      path.relative(caller, configFile),
      "--event-fact-reviews",
      path.relative(caller, mapping),
    ],
    { cwd: caller, encoding: "utf8", timeout: 30000 },
  )
  const result = JSON.parse(stdout)
  assertPrivate(result)
  assert.equal(result.status, "collection_planned")
  const plan = readJSON(f.root, `daily/runs/${dailyRun}/plan.json`)
  assert.equal(plan.run_id, dailyRun)
  assert.equal(result.model_calls, 0)
  assert.equal(result.article_writes, 0)
  assert.equal(fs.existsSync(path.join(f.root, "event-workflows")), false)
})

test("pending collection leaves exact collection inputs and does not freeze or process events", async (t) => {
  const f = coordinationFixture(t, { pending: true })
  const p = {
    run_id: "pending-round",
    daily_run: "daily-fixture",
    collect: true,
    execute: true,
    collection_max_windows: 2,
    collection_time_budget_ms: 5000,
    time_budget_ms: 10000,
  }
  const result = await advanceRoundWorkflow(f.ctx, p, f.dependencies)
  assertPrivate(result)
  assert.equal(result.status, "collection_pending")
  assert.deepEqual(result.stages.collection.reference, f.pendingRef)
  assert.equal(result.stages.collection.counts.pending_windows, 1)
  assert.equal(f.calls.collector.length, 1)
  assert.equal(f.calls.collector[0].runId, "daily-fixture")
  assert.equal(f.calls.collector[0].maxWindows, 2)
  assert.equal(f.calls.collector[0].timeBudgetMs, 5000)
  for (const name of ["freezer", "events", "knowledge", "publication"])
    assert.equal(f.calls[name].length, 0)
  assert.deepEqual(result.next_inputs, [
    {
      stage: "collection",
      daily_run: "daily-fixture",
      required: ["daily_run", "collect", "execute"],
    },
  ])
  assert.equal(result.edition, undefined)
  assert.deepEqual(readJSON(f.root, "round-workflows/pending-round/latest.json"), result)
})

test("settled partial collection freezes successes without erasing the failed window", async (t) => {
  const f = coordinationFixture(t)
  const reportBefore = fs.readFileSync(safePath(f.root, f.settled.path))
  const p = { run_id: "partial-round", daily_run: "daily-fixture", execute: false }
  const result = await advanceRoundWorkflow(f.ctx, p, f.dependencies)
  assertPrivate(result)
  assert.equal(result.status, "relationship_review")
  assert.equal(result.collection_status, "partial")
  assert.equal(result.stages.collection.counts.incomplete_windows, 1)
  assert.equal(result.stages.collection.counts.pending_windows, 0)
  assert.equal(f.calls.collector.length, 0)
  assert.equal(f.calls.freezer.length, 1)
  assert.equal(f.calls.events.length, 1)
  assert.equal(f.calls.events[0].execute, false)
  assert.deepEqual(result.edition, f.editionRef)
  assert.deepEqual(result.next_inputs, [
    { stage: "classification", required: ["plan_path", "plan_sha256"] },
  ])
  assert.ok(fs.readFileSync(safePath(f.root, f.settled.path)).equals(reportBefore))
  const report = checkedReference(f.root, result.stages.collection.reference)
  assert.equal(report.routes[0].windows[0].status, "incomplete")
  assert.equal(
    report.routes[0].windows[0].attempts[0].reason,
    "Explicit fixture original access failed",
  )
  assert.deepEqual(report.routes[0].windows[0].attempts, f.report.routes[0].windows[0].attempts)
})

test("one reviewed plan can be attached after relationship review and cannot be replaced", async (t) => {
  const f = coordinationFixture(t)
  const p = roundParameters(f, "reviewed-round")
  const first = await advanceRoundWorkflow(f.ctx, p, f.dependencies)
  assert.equal(first.status, "relationship_review")
  const plan = await reviewedPlan(f, { defer: true })
  const connected = await advanceRoundWorkflow(f.ctx, withPlan(p, plan), f.dependencies)
  assertPrivate(connected)
  assert.equal(connected.status, "complete")
  assert.deepEqual(connected.plan, { path: plan.path, sha256: plan.sha256 })
  assert.notEqual(first.event_workflow.path, connected.event_workflow.path)
  assert.equal(f.calls.events[1].run_id, "round-reviewed-round-events-" + plan.sha256.slice(0, 16))
  const again = await advanceRoundWorkflow(f.ctx, p, f.dependencies)
  assert.deepEqual(again.plan, connected.plan)
  assert.equal(f.calls.events.length, 2)
  const other = await reviewedPlan(f, {
    defer: true,
    run: "different-plan",
    reason: "A separate explicit test review",
  })
  await assert.rejects(
    advanceRoundWorkflow(f.ctx, withPlan(p, other), f.dependencies),
    /reviewed plan changed/,
  )
  assert.deepEqual(
    readJSON(f.root, "round-workflows/reviewed-round/plan.json").reference,
    connected.plan,
  )
  assert.equal(f.calls.events.length, 2)
})

test("exact report and reviewed plan reuse the prior edition while another settled report is rejected", async (t) => {
  const f = coordinationFixture(t)
  const plan = await reviewedPlan(f, { defer: true })
  const p = withPlan(
    {
      run_id: "report-with-plan",
      report_path: f.settled.path,
      report_sha256: f.settled.sha256,
      execute: true,
    },
    plan,
  )
  const result = await advanceRoundWorkflow(f.ctx, p, f.dependencies)
  assertPrivate(result)
  assert.equal(result.status, "complete")
  assert.deepEqual(result.edition, f.editionRef)
  assert.equal(result.stages.edition.reused, true)
  assert.equal(f.calls.freezer.length, 0)
  const changed = structuredClone(f.report)
  changed.routes[0].windows[0].attempts[0].reason = "A different settled fixture report"
  const bytes = JSON.stringify(changed, null, 2) + "\n"
  const other = atomicWrite(
    f.root,
    `daily/runs/daily-fixture/collection-reports/${sha256(bytes)}.json`,
    bytes,
  )
  await assert.rejects(
    advanceRoundWorkflow(
      f.ctx,
      {
        ...p,
        run_id: "different-report-with-plan",
        report_path: other.path,
        report_sha256: other.sha256,
      },
      f.dependencies,
    ),
    /Round plan collection report changed/,
  )
  assert.equal(f.calls.freezer.length, 0)
  assert.equal(f.calls.events.length, 1)
})

test("same round rejects changed source, policy and vault before replaying native stages", async (t) => {
  const f = coordinationFixture(t)
  const p = roundParameters(f, "immutable-round")
  await advanceRoundWorkflow(f.ctx, p, f.dependencies)
  const latest = fs.readFileSync(safePath(f.root, "round-workflows/immutable-round/latest.json"))
  await assert.rejects(
    advanceRoundWorkflow(
      f.ctx,
      {
        run_id: p.run_id,
        report_path: f.settled.path,
        report_sha256: f.settled.sha256,
      },
      f.dependencies,
    ),
    /Round inputs changed/,
  )
  const policy = fs.readFileSync(f.ctx.policy)
  fs.writeFileSync(f.ctx.policy, Buffer.concat([policy, Buffer.from("\n")]))
  await assert.rejects(advanceRoundWorkflow(f.ctx, p, f.dependencies), /Round inputs changed/)
  fs.writeFileSync(f.ctx.policy, policy)
  const alternateVault = path.join(f.root, "other-test-vault")
  fs.mkdirSync(alternateVault)
  await assert.rejects(
    advanceRoundWorkflow({ ...f.ctx, vault: alternateVault }, p, f.dependencies),
    /Round inputs changed/,
  )
  const edition = fs.readFileSync(safePath(f.root, f.editionRef.path))
  fs.appendFileSync(safePath(f.root, f.editionRef.path), "\n")
  await assert.rejects(advanceRoundWorkflow(f.ctx, p, f.dependencies), /SHA.*changed/)
  fs.writeFileSync(safePath(f.root, f.editionRef.path), edition)
  assert.equal(f.calls.events.length, 1)
  assert.ok(
    fs.readFileSync(safePath(f.root, "round-workflows/immutable-round/latest.json")).equals(latest),
  )
})

test("interrupted event processing resumes the saved freeze and completed refs are never regenerated", async (t) => {
  const f = coordinationFixture(t)
  const plan = await reviewedPlan(f, { defer: true })
  const p = {
    run_id: "resumed-round",
    report_path: f.settled.path,
    report_sha256: f.settled.sha256,
    execute: true,
  }
  f.state.interruptEvents = true
  await assert.rejects(advanceRoundWorkflow(f.ctx, p, f.dependencies), /fixture interruption/)
  const interrupted = readJSON(f.root, "round-workflows/resumed-round/latest.json")
  assertPrivate(interrupted)
  assert.equal(interrupted.status, "partial")
  assert.deepEqual(interrupted.edition, f.editionRef)
  assert.equal(interrupted.stages.events.status, "failed")
  assert.deepEqual(interrupted.next_inputs[0].required, ["resume"])
  const result = await advanceRoundWorkflow(f.ctx, withPlan(p, plan), f.dependencies)
  assert.equal(result.status, "complete")
  assert.equal(f.calls.freezer.length, 1)
  assert.equal(f.calls.events.length, 2)
  assert.equal(f.calls.knowledge.length, 1)
  assert.equal(f.calls.publication.length, 1)
  const refs = [
    result.edition,
    result.event_workflow,
    result.knowledge_index,
    result.publication_handoff,
  ]
  const bytes = refs.map((ref) => fs.readFileSync(safePath(f.root, ref.path)))
  const reused = await advanceRoundWorkflow(f.ctx, p, f.dependencies)
  assertPrivate(reused)
  assert.equal(reused.status, "complete")
  assert.equal(reused.stages.events.reused, true)
  assert.equal(reused.stages.knowledge.reused, true)
  assert.equal(reused.stages.publication.reused, true)
  assert.equal(f.calls.freezer.length, 1)
  assert.equal(f.calls.events.length, 2)
  assert.equal(f.calls.knowledge.length, 1)
  assert.equal(f.calls.publication.length, 1)
  assert.deepEqual(
    [reused.edition, reused.event_workflow, reused.knowledge_index, reused.publication_handoff],
    refs,
  )
  refs.forEach((ref, i) => assert.ok(fs.readFileSync(safePath(f.root, ref.path)).equals(bytes[i])))
  fs.appendFileSync(safePath(f.root, result.knowledge_index.path), "\n")
  await assert.rejects(
    advanceRoundWorkflow(f.ctx, p, f.dependencies),
    /Round checkpoint SHA changed/,
  )
  assert.equal(f.calls.knowledge.length, 1)
})

test("publication interruption retains complete event and knowledge refs for the next resume", async (t) => {
  const f = coordinationFixture(t)
  const plan = await reviewedPlan(f, { defer: true })
  const p = withPlan(roundParameters(f, "publication-interruption"), plan)
  f.state.interruptPublication = true
  await assert.rejects(advanceRoundWorkflow(f.ctx, p, f.dependencies), /after knowledge projection/)
  const failed = readJSON(f.root, "round-workflows/publication-interruption/latest.json")
  assertPrivate(failed)
  assert.equal(failed.status, "partial")
  assert.equal(failed.stages.events.status, "complete")
  assert.equal(failed.stages.knowledge.status, "projected")
  assert.equal(failed.stages.publication.status, "failed")
  const refs = [failed.event_workflow, failed.knowledge_index]
  const bytes = refs.map((ref) => {
    checkedReference(f.root, ref)
    return fs.readFileSync(safePath(f.root, ref.path))
  })
  assert.equal(f.calls.events.length, 1)
  assert.equal(f.calls.knowledge.length, 1)
  assert.equal(f.calls.publication.length, 1)
  const resumed = await advanceRoundWorkflow(f.ctx, p, f.dependencies)
  assertPrivate(resumed)
  assert.equal(resumed.status, "complete")
  assert.equal(resumed.stages.events.reused, true)
  assert.equal(resumed.stages.knowledge.reused, true)
  assert.equal(f.calls.events.length, 1)
  assert.equal(f.calls.knowledge.length, 1)
  assert.equal(f.calls.publication.length, 2)
  assert.deepEqual([resumed.event_workflow, resumed.knowledge_index], refs)
  refs.forEach((ref, i) => assert.ok(fs.readFileSync(safePath(f.root, ref.path)).equals(bytes[i])))
  checkedReference(f.root, resumed.publication_handoff)
})

test("proposal delegation persists a reasoning wait before a reviewed plan and keeps the frozen edition on resume", async (t) => {
  const f = coordinationFixture(t)
  const p = roundParameters(f, "proposal-wait-round")
  const reasoning_task = {
    task_id: "fixture-proposal-reasoning",
    request_sha256: sha256("fixture-proposal-request"),
  }
  const pending = Error("Explicit fixture pending proposal inference")
  pending.code = "REASONING_PENDING"
  pending.reasoning_task = reasoning_task
  await assert.rejects(
    advanceRoundWorkflow(f.ctx, p, {
      ...f.dependencies,
      eventProcessor: async () => {
        throw pending
      },
    }),
    (error) => error === pending,
  )
  const checkpoint = readJSON(f.root, "round-workflows/proposal-wait-round/latest.json")
  assertPrivate(checkpoint)
  assert.equal(checkpoint.status, "waiting_for_reasoning")
  assert.equal(checkpoint.stages.events.status, "waiting_for_reasoning")
  assert.deepEqual(checkpoint.stages.events.reasoning_task, reasoning_task)
  assert.deepEqual(checkpoint.next_inputs, [
    { stage: "reasoning", reasoning_task, required: ["reasoning_result", "resume"] },
  ])
  const resumed = await advanceRoundWorkflow(f.ctx, p, f.dependencies)
  assert.equal(resumed.status, "relationship_review")
  assert.deepEqual(resumed.edition, checkpoint.edition)
  assert.equal(f.calls.freezer.length, 0)
  assert.equal(f.calls.knowledge.length, 0)
  assert.equal(resumed.model_calls, 0)
  assert.equal(resumed.article_writes, 0)
})

test("partial proposal extraction exposes exact failed material and the next page without approving either", async (t) => {
  const f = coordinationFixture(t)
  const p = roundParameters(f, "proposal-partial-round")
  const result = await advanceRoundWorkflow(f.ctx, p, {
    ...f.dependencies,
    eventProcessor: async (ctx, parameters) => {
      const events = await f.dependencies.eventProcessor(ctx, parameters)
      events.proposals = {
        status: "partial",
        next_offset: 4,
        failures: [
          {
            material_id: f.report.materials[0].id,
            run: "fixture-failed-proposal",
            code: "MODEL_CALL_TIMEOUT",
            error: "Explicit fixture original timeout",
          },
          {
            material_id: f.report.materials[1].id,
            run: "fixture-budget-proposal",
            code: "MODEL_CALL_LIMIT",
            error: "Explicit fixture invocation call budget",
          },
        ],
      }
      atomicWrite(ctx.root, `event-workflows/${parameters.run_id}/latest.json`, events)
      return events
    },
  })
  assertPrivate(result)
  assert.equal(result.status, "relationship_review")
  assert.deepEqual(result.next_inputs, [
    { stage: "classification", required: ["plan_path", "plan_sha256"] },
    {
      stage: "classification",
      material_id: f.report.materials[0].id,
      proposal_run: "fixture-failed-proposal",
      error: "Explicit fixture original timeout",
      code: "MODEL_CALL_TIMEOUT",
      required: ["execute", "retry_failed"],
    },
    {
      stage: "classification",
      material_id: f.report.materials[1].id,
      proposal_run: "fixture-budget-proposal",
      error: "Explicit fixture invocation call budget",
      code: "MODEL_CALL_LIMIT",
      required: ["execute"],
    },
    { stage: "classification", offset: 4, required: ["offset", "execute"] },
  ])
  assert.equal(f.calls.knowledge.length, 0)
  assert.equal(result.model_calls, 0)
  assert.equal(result.article_writes, 0)
})

test("event review and delegated reasoning return exact next inputs without knowledge or publication approval", async (t) => {
  const f = coordinationFixture(t, { eventStatus: "review_pending" })
  const plan = await reviewedPlan(f)
  const p = withPlan(roundParameters(f, "waiting-round"), plan)
  const review = await advanceRoundWorkflow(f.ctx, p, f.dependencies)
  assertPrivate(review)
  assert.equal(review.status, "review_pending")
  assert.deepEqual(review.next_inputs, [
    {
      stage: "evidence",
      group_id: "order",
      writer_run: "fixture-writer",
      required: ["fact_reviews"],
    },
  ])
  assert.equal(review.stages.knowledge.status, "approval_pending")
  f.state.rowStatus = "editorial_review"
  const editorial = await advanceRoundWorkflow(f.ctx, p, f.dependencies)
  assertPrivate(editorial)
  assert.equal(editorial.status, "review_pending")
  assert.deepEqual(editorial.next_inputs, [
    {
      stage: "writing",
      group_id: "order",
      writer_run: "fixture-writer",
      next_input: {
        module: "validation",
        operation: "reader",
        parameters: { run_id: "fixture-writer" },
      },
      required: ["editorial_reviews"],
    },
  ])
  f.state.eventStatus = "waiting_for_reasoning"
  const waiting = await advanceRoundWorkflow(f.ctx, p, f.dependencies)
  assertPrivate(waiting)
  assert.equal(waiting.status, "waiting_for_reasoning")
  assert.deepEqual(waiting.next_inputs, [
    {
      stage: "reasoning",
      group_id: "order",
      writer_run: "fixture-writer",
      reasoning_task: { task_id: "fixture-reasoning", request_sha256: sha256("fixture-request") },
      required: ["reasoning_result"],
    },
  ])
  assert.equal(f.calls.knowledge.length, 0)
  const handoff = checkedReference(f.root, waiting.publication_handoff)
  assert.deepEqual(handoff.approved_runs, [])
  assert.equal(handoff.candidate_published, false)
})

async function nativeApprovedFixture(t) {
  const f = isolateContext(await selectedFixture(t))
  const run = f.selection.writer_run
  const documents = readJSON(f.root, `runs/${f.selection.source_run}/documents.json`)
  const parses = readJSON(f.root, `runs/${f.selection.source_run}/parses.json`)
  // Exact fixture originals and explicit test decisions pass the real approval
  // validator; no provider, source GET or production approval is invoked.
  const rawClaims = parses.map((parse, index) => ({
    claim_id: "fixture-fact-" + index,
    statement: "Fixture Robotics와 Partner가 2026년 9월 27일 Contract-123 로봇 주문을 발표했다.",
    claim_kind: "fact",
    subject: "Fixture Robotics",
    event_state: "completed",
    published_at: "2026-09-27",
    effective_period: null,
    numbers: [],
    evidence: [
      {
        source_id: parse.source_id,
        source_version_id: parse.source_version_id,
        parse_id: parse.parse_id,
        block_id: parse.blocks[0].block_id,
        quote: parse.blocks[0].text,
        support: "direct",
      },
    ],
  }))
  const claims = recordFactReview(
    rawClaims,
    rawClaims.map(({ claim_id }) => ({
      claim_id,
      status: "verified",
      reason: "Explicit test review against the selected exact original block",
      source_read: true,
      entailment_checked: true,
      identity_checked: true,
      numbers_checked: true,
      time_checked: true,
    })),
    { reviewer: "test-original-reader", reviewed_at: "2026-09-29" },
    parses,
  )
  const ids = claims.map((claim) => claim.claim_id)
  const draft = {
    title: "Fixture Robotics, Partner와 로봇 주문 발표",
    lead: [
      {
        text: "Fixture Robotics와 Partner는 2026년 9월 27일 Contract-123 로봇 주문을 발표했다.",
        claim_ids: ids,
      },
      {
        text: "이번 발표는 해당 계약을 대상으로 하며 각 원문에 같은 주문이 명시돼 있다.",
        claim_ids: ids,
      },
    ],
    facts: {
      who: "Fixture Robotics와 Partner",
      when: "2026-09-27",
      where: null,
      what: "로봇 주문 발표",
      how: null,
      why: null,
    },
    sector: "로봇·제조",
    theme: "사업·고객",
    tags: ["수주·계약"],
    entities: ["Fixture Robotics", "Partner"],
    explanations: [
      {
        heading: "계약 대상",
        paragraphs: [
          {
            text: "각 원문은 Contract-123 주문의 주체와 발표 시점을 명시한다. 다른 고객의 별도 일정은 이번 계약의 완료 내용으로 포함하지 않았다.",
            claim_ids: ids,
          },
        ],
      },
    ],
  }
  const record = {
    draft_id: draftFingerprint(draft),
    draft,
    status: "editorial_review",
    problems: [],
    public_approved: false,
  }
  const review = {
    status: "approved",
    draft_id: record.draft_id,
    event_id: "abcdef0123456789",
    published_at: "2026-09-27",
    reviewed_at: "2026-09-29",
    region: "해외",
    reviewer: "test-final-reader",
    source_read: true,
    final_prose_read: true,
    title_checked: true,
    dates_checked: true,
    numbers_checked: true,
    analysis_checked: true,
    concept_ids: [],
    reader_quality_review: { repetition_checked: true },
  }
  for (const [file, value] of Object.entries({
    "documents.json": documents,
    "parses.json": parses,
    "reviewed-claims.json": { claims },
    "draft.json": record,
    "editorial-review.json": review,
    "approved-article.json": approvedArticle(record, claims, documents, review, parses),
  }))
    atomicWrite(f.root, `runs/${run}/${file}`, value)
  return { ...f, approval: loadCurrentApproval(f.root, run, { vault: f.ctx.vault }) }
}

test("native round reuses an exact prior approval and returns pinned knowledge and handoff without publishing", async (t) => {
  const f = await nativeApprovedFixture(t)
  const p = withPlan(roundParameters(f, "native-round"), f.plan)
  const calls = { events: 0 }
  const options = {
    eventProcessor: async (...args) => {
      calls.events++
      return advanceEventWorkflow(...args)
    },
  }
  const originalFiles = Object.fromEntries(
    Object.keys(f.approval.files).map((file) => [
      file,
      fs.readFileSync(safePath(f.root, `runs/writer/${file}`)),
    ]),
  )
  const result = await advanceRoundWorkflow(f.ctx, p, options)
  assertPrivate(result)
  assert.equal(result.status, "complete")
  assert.deepEqual(result.approved_runs, ["writer"])
  assert.equal(result.model_calls, 0)
  assert.equal(result.article_writes, 0)
  assert.equal(result.collection_status, "partial")
  const selection = loadDailyPublicationSelection(f.root, result.publication_handoff.path, {
    vault: f.ctx.vault,
  })
  assert.deepEqual(selection.approvedRuns, ["writer"])
  assert.equal(selection.selection.approved_runs[0].event_id, f.approval.article.event_id)
  assert.equal(
    selection.selection.approved_runs[0].article_sha256,
    sha256(JSON.stringify(f.approval.article)),
  )
  const index = checkedReference(f.root, result.knowledge_index)
  assert.equal(index.schema, "research-ontology-knowledge-index/v1")
  assert.equal(index.events.length, 1)
  assert.equal(index.events[0].event_id, f.approval.article.event_id)
  const again = await advanceRoundWorkflow(f.ctx, { ...p, execute: false }, options)
  assertPrivate(again)
  assert.equal(again.status, "complete")
  assert.equal(calls.events, 1)
  assert.deepEqual(again.event_workflow, result.event_workflow)
  assert.deepEqual(again.knowledge_index, result.knowledge_index)
  assert.deepEqual(again.publication_handoff, result.publication_handoff)
  for (const [file, bytes] of Object.entries(originalFiles))
    assert.ok(fs.readFileSync(safePath(f.root, `runs/writer/${file}`)).equals(bytes))
  assert.deepEqual(fs.readdirSync(f.ctx.vault), [])
  const originalDocument = readJSON(f.root, "runs/writer/documents.json")[0]
  fs.appendFileSync(safePath(f.root, originalDocument.body_path), " changed fixture original")
  await assert.rejects(
    advanceRoundWorkflow(f.ctx, p, options),
    /Collection material source or parse changed/,
  )
  assert.equal(calls.events, 1)
})
