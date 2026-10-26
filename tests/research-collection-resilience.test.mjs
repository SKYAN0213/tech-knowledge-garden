import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  collectionOutcome,
  recordCollectionOutcome,
  readCollectionHealth,
  collectionSourceDecision,
  collectionHealthInventory,
  checkedSourceWait,
  collectionRecoveryRequest,
} from "../scripts/research/collection-resilience.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "collection-health-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const basis = { route_sha256: "fixed-route" },
    now = Date.parse("2026-10-26T00:00:00Z")
  return { root, basis, now }
}
const blocked = {
  summary: { status: "incomplete", reason: "listing_blocked" },
  documents: [],
  indexDocuments: [],
}

test("recovery requests stay bound to an incomplete report and its owner", () => {
  const report = {
    schema: "research-collection-report/v1",
    daily_run: "daily-one",
    routes: [{ windows: [{ status: "incomplete" }] }],
  }
  const ref = { path: "daily/runs/daily-one/report.json", sha256: "a".repeat(64) }
  const request = collectionRecoveryRequest(report, ref, { round_id: "round-one" })
  assert.deepEqual(request.owner, { daily_run: "daily-one", round_id: "round-one" })
  assert.equal(request.parameters.report_sha256, ref.sha256)
  assert.equal(request.parameters.report_path, ref.path)
  assert.equal(request.parameters.reconcile_coverage, true)
  assert.deepEqual(collectionRecoveryRequest(report, ref, { round_id: "round-one" }), request)
  assert.deepEqual(
    collectionRecoveryRequest(report, { ...ref, counts: {} }, { round_id: "round-one" }),
    request,
  )
  assert.notEqual(
    collectionRecoveryRequest(report, { ...ref, sha256: "b".repeat(64) }).parameters.run_id,
    request.parameters.run_id,
  )
  assert.equal(
    collectionRecoveryRequest({ ...report, routes: [{ windows: [{ status: "pending" }] }] }, ref),
    null,
  )
  assert.equal(collectionRecoveryRequest({ ...report, routes: [] }, ref), null)
})

async function observe(root, p) {
  const result = {
    ...p.result,
    summary: { schema: "research-list-scan/v1", ...p.result.summary, channel_id: p.channel_id },
  }
  const file = `runs/${p.run_id}/list-scan.json`
  atomicWrite(root, file, result.summary)
  return recordCollectionOutcome(root, {
    ...p,
    result,
    evidence: { path: file, sha256: sha256(fs.readFileSync(path.join(root, file))) },
  })
}

test("budget, review, storage and actual request failures have different recovery actions", () => {
  const mixed = collectionOutcome({
    summary: {
      status: "incomplete",
      reason: "detail_incomplete",
      details: [
        { url: "https://a.test/one", status: "deferred_by_budget" },
        { url: "https://a.test/one", status: "deferred_by_budget" },
        { url: "https://a.test/image", status: "article_image_body_requires_review" },
      ],
    },
  })
  assert.equal(mixed.kind, "budget_pending")
  assert.equal(mixed.deferred_details, 1)
  assert.equal(mixed.failure, false)
  assert.equal(collectionOutcome(null, { code: "STORAGE_PENDING" }).kind, "storage_wait")
  assert.equal(
    collectionOutcome({ summary: { status: "incomplete", reason: "page_parse_failed" } }).kind,
    "parser_or_request_error",
  )
  assert.equal(
    collectionOutcome({
      summary: {
        status: "incomplete",
        reason: "page_fetch_failed",
        error: "Fetch deadline exceeded",
      },
    }).kind,
    "temporary_failure",
  )
  assert.equal(collectionOutcome(blocked).kind, "access_restricted")
})

test("three identical source failures suspend only that source and duplicate observations do not count", async (t) => {
  const f = fixture(t),
    events = []
  for (const id of ["one", "two", "three"]) {
    const r = await observe(f.root, { ...f, channel_id: "blocked", run_id: id, result: blocked })
    if (r.notification) events.push(r.notification.transition)
  }
  const duplicate = await observe(f.root, {
    ...f,
    channel_id: "blocked",
    run_id: "three",
    result: blocked,
  })
  assert.equal(duplicate.reused, true)
  assert.equal(duplicate.notification, null)
  assert.equal(duplicate.health.consecutive_failures, 3)
  assert.deepEqual(events, ["new_failure", "suspended"])
  assert.equal(collectionSourceDecision(f.root, "blocked", f.basis, { now: f.now }).allowed, false)
  assert.equal(collectionSourceDecision(f.root, "healthy", f.basis, { now: f.now }).allowed, true)
  assert.equal(
    collectionSourceDecision(f.root, "blocked", { route_sha256: "fixed-selector" }, { now: f.now })
      .allowed,
    true,
  )
  assert.equal(
    collectionSourceDecision(f.root, "blocked", f.basis, { now: f.now + 24 * 3600000 }).allowed,
    true,
  )
  assert.equal(collectionHealthInventory(f.root).cooling_down, 1)
})

test("server cooldown is honored, a changed failure starts a new streak and recovery emits once", async (t) => {
  const f = fixture(t),
    future = new Date(f.now + 36 * 3600000).toISOString()
  const result = {
    ...blocked,
    documents: [
      { fetch_status: "rate_limited", http_status: 429, availability: { next_check_at: future } },
    ],
  }
  for (const run_id of ["a", "b", "c"])
    await observe(f.root, { ...f, channel_id: "route", run_id, result })
  assert.equal(readCollectionHealth(f.root, "route").next_check_at, future)
  const repaired = await observe(f.root, {
    ...f,
    channel_id: "route",
    run_id: "done",
    result: { summary: { status: "window_scanned" } },
  })
  assert.equal(repaired.health.consecutive_failures, 0)
  assert.equal(repaired.notification.transition, "recovered")
  assert.equal(
    (
      await observe(f.root, {
        ...f,
        channel_id: "route",
        run_id: "done",
        result: { summary: { status: "window_scanned" } },
      })
    ).notification,
    null,
  )
  const changed = await observe(f.root, {
    ...f,
    channel_id: "route",
    run_id: "new",
    result: { summary: { status: "incomplete", reason: "page_parse_failed" } },
  })
  assert.equal(changed.health.consecutive_failures, 1)
})

test("arbitrarily many continuation batches do not trip the source circuit or repeat an alert", async (t) => {
  const f = fixture(t),
    result = {
      summary: {
        status: "incomplete",
        reason: "detail_incomplete",
        details: [{ url: "https://a.test/one", status: "deferred_by_budget" }],
      },
    }
  const notifications = []
  for (let n = 0; n < 5; n++) {
    const r = await observe(f.root, { ...f, channel_id: "route", run_id: "batch-" + n, result })
    if (r.notification) notifications.push(r.notification)
  }
  assert.equal(readCollectionHealth(f.root, "route").consecutive_failures, 0)
  assert.equal(notifications.length, 1)
  assert.equal(collectionSourceDecision(f.root, "route", f.basis, { now: f.now }).allowed, true)
})

test("an interrupted journal update is replayed and altered health or wait evidence is rejected", async (t) => {
  const f = fixture(t),
    p = { ...f, channel_id: "route", run_id: "first", result: blocked }
  await observe(f.root, p)
  fs.unlinkSync(path.join(f.root, "collection-health/routes/route.json"))
  assert.equal((await observe(f.root, p)).health.consecutive_failures, 1)
  for (const run_id of ["second", "third"]) await observe(f.root, { ...p, run_id })
  const health = readCollectionHealth(f.root, "route"),
    observation = health.latest_observation.path
  const receipt = {
    channel_id: "route",
    source_wait: {
      request_performed: false,
      next_check_at: health.next_check_at,
      observation: {
        path: observation,
        sha256: sha256(fs.readFileSync(path.join(f.root, observation))),
      },
    },
  }
  assert.equal(checkedSourceWait(f.root, receipt).request_performed, false)
  assert.throws(() => checkedSourceWait(f.root, { ...receipt, channel_id: "other" }), /differs/)
  atomicWrite(f.root, "collection-health/routes/route.json", { ...health, consecutive_failures: 0 })
  assert.throws(() => readCollectionHealth(f.root, "route"), /changed/)
})
