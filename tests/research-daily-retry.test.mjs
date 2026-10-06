import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sourceFailureRetry, combineRetryFailures } from "../scripts/research/source-retry.mjs"
import {
  dailyRetryAssessment,
  dailyRetryQueue,
  executeDailyPlan,
} from "../scripts/research/daily-scan.mjs"
import { RunState, atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { storeParseArtifact } from "../scripts/research/parser.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "daily-retry-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const window = { channel_id: "official", since: "2026-10-01", until_exclusive: "2026-10-06" }
  const plan = {
    schema: "research-daily-plan/v1",
    run_id: "daily-retry",
    kst_day: "2026-10-07",
    windows: [window],
    retry_policy: { max_attempts_per_window: 2, blocked_requires_new_observation: true },
  }
  return { root, window, plan }
}

async function storedFailure(
  root,
  window,
  runId,
  { fetch_status = "captured", parse_status = "blocked", error, http_status } = {},
) {
  const url = "https://example.com/article",
    id = sourceId(url),
    body = "Controlled login wall",
    hash = sha256(body)
  const doc = {
    source_id: id,
    original_url: url,
    final_url: url,
    observed_at: "2026-10-07T00:00:00Z",
    fetch_status,
    policy_status: "checked",
    ...(error ? { error } : {}),
    ...(http_status ? { http_status } : {}),
    ...(["captured", "not_modified"].includes(fetch_status)
      ? {
          body_sha256: hash,
          source_version_id: id + ":" + hash,
          body_path: `documents/${id}/${hash}/body.bin`,
        }
      : {}),
  }
  const state = new RunState(root, runId, { purpose: "controlled retry fixture" })
  await state.stage("detail-" + id, { url }, async () => doc)
  const documents = [],
    parses = [],
    detail = { url, status: "fetch_failed", fetch_status }
  if (doc.body_path) {
    atomicWrite(root, doc.body_path, body)
    documents.push(doc)
    const parse_id = sha256(runId + parse_status),
      parsed = {
        schema_version: "source-parse/v1",
        source_id: id,
        source_version_id: doc.source_version_id,
        parse_id,
        title: "Controlled fixture",
        status: parse_status,
        dates: { published_at: "2026-10-05" },
        blocks: [],
        quality: { required_fields_present: false, reason: "authentication-page" },
      }
    storeParseArtifact(root, parsed)
    parses.push(parsed)
    Object.assign(detail, {
      status: "article_parse_incomplete",
      parse_id,
      source_version_id: doc.source_version_id,
    })
  }
  const scan = {
    summary: {
      schema: "research-list-scan/v1",
      channel_id: window.channel_id,
      window: { since: window.since, until_exclusive: window.until_exclusive },
      status: "incomplete",
      reason: "detail_incomplete",
      details: [detail],
    },
    documents,
    parses,
    indexDocuments: [],
    candidates: [],
  }
  for (const [name, value] of Object.entries({
    "list-scan": scan.summary,
    documents,
    parses,
    "list-pages": [],
    candidates: [],
  }))
    atomicWrite(root, `runs/${runId}/${name}.json`, value)
  return scan
}

function receiptFor(plan, scan, runId) {
  return {
    schema: "research-daily-receipt/v2",
    daily_run: plan.run_id,
    attempt_id: runId,
    ...plan.windows[0],
    status: "incomplete",
    reason: scan.summary.reason,
    candidate_keys: [],
    scan_evidence: { list_scan_run: runId },
    candidate_published: false,
  }
}

test("common source retry distinguishes temporary failures from policy, access and repair work", () => {
  for (const d of [
    { fetch_status: "failed", error: "Fetch deadline exceeded" },
    { fetch_status: "failed", error: "getaddrinfo EAI_AGAIN example.com" },
    { fetch_status: "rate_limited", http_status: 429 },
    { fetch_status: "failed", http_status: 503 },
  ])
    assert.equal(sourceFailureRetry(d).state, "retryable")
  for (const d of [
    { fetch_status: "blocked" },
    { fetch_status: "not_found", http_status: 404 },
    { fetch_status: "failed", http_status: 401 },
    { fetch_status: "failed", policy_status: "denied" },
  ])
    assert.equal(sourceFailureRetry(d).state, "awaiting_new_observation")
  for (const d of [
    { fetch_status: "too_large" },
    { fetch_status: "failed", error: "certificate verification failed" },
    { fetch_status: "failed", http_status: 400 },
    { fetch_status: "captured" },
  ])
    assert.equal(sourceFailureRetry(d).state, "requires_repair")
  assert.equal(
    sourceFailureRetry({ fetch_status: "captured" }, { status: "blocked" }).state,
    "awaiting_new_observation",
  )
  assert.equal(
    combineRetryFailures([
      sourceFailureRetry({ fetch_status: "blocked" }),
      sourceFailureRetry({ fetch_status: "failed", http_status: 503 }),
    ]).state,
    "requires_repair",
  )
  assert.equal(combineRetryFailures([]).kind, "unclassified_legacy_failure")
})

test("persisted authentication detail stays incomplete without an automatic second scan", async (t) => {
  const { root, window, plan } = fixture(t)
  let calls = 0
  const coverage = {
    schema: "research-daily-coverage/v1",
    routes: {
      official: {
        anchor_since: window.since,
        covered: [],
        unresolved: [],
        last_contiguous_until: window.since,
      },
    },
  }
  const args = {
    root,
    plan,
    coverage,
    activeRoutes: [
      {
        route: {
          channel_id: "official",
          region: "해외",
          axis: "기술·제품",
          sectors: ["로봇·제조"],
        },
      },
    ],
    scan: async (w, id) => {
      calls++
      return storedFailure(root, w, id)
    },
    merge: () => {
      throw Error("Failed articles must never merge")
    },
  }
  const first = await executeDailyPlan(args)
  assert.equal(first.retry_queue[0].state, "awaiting_new_observation")
  assert.equal(first.retry_queue[0].retry_assessment.failure_kind_counts.access_restricted, 1)
  const second = await executeDailyPlan(args)
  assert.equal(calls, 1)
  assert.equal(second.receipts, 1)
  assert.equal(second.status, "partial")
  assert.equal(second.retry_queue[0].attempts_remaining, 0)
  assert.equal(readJSON(root, "daily/route-coverage.json").routes.official.unresolved.length, 1)
  assert.equal(second.candidate_published, false)
})

test("stored temporary source failure is eligible only up to the existing window cap", async (t) => {
  const { root, window, plan } = fixture(t)
  const runId = `${plan.run_id}_official_20261001_20261006_a1`
  const scan = await storedFailure(root, window, runId, {
    fetch_status: "failed",
    error: "Fetch deadline exceeded",
  })
  const receipt = receiptFor(plan, scan, runId)
  const queue = dailyRetryQueue(root, plan, [receipt], { routes: {} })
  assert.equal(queue[0].state, "retryable")
  assert.equal(queue[0].attempts_remaining, 1)
  assert.equal(queue[0].retry_assessment.failure_kind_counts.transient_transport, 1)
  assert.equal(
    dailyRetryQueue(
      root,
      plan,
      [
        receipt,
        {
          ...receipt,
          attempt_id: runId.replace("_a1", "_a2"),
          scan_evidence: receipt.scan_evidence,
        },
      ],
      { routes: {} },
    )[0].state,
    "requires_repair",
  )
  const secondId = runId.replace("_a1", "_a2"),
    second = await storedFailure(root, window, secondId, {
      fetch_status: "failed",
      http_status: 503,
    })
  assert.equal(
    dailyRetryQueue(root, plan, [receipt, receiptFor(plan, second, secondId)], { routes: {} })[0]
      .state,
    "exhausted",
  )
})

test("retry assessment rejects changed body, parse or checkpoint identity instead of replaying it", async (t) => {
  const { root, window, plan } = fixture(t),
    runId = `${plan.run_id}_official_20261001_20261006_a1`
  const scan = await storedFailure(root, window, runId),
    receipt = receiptFor(plan, scan, runId),
    doc = scan.documents[0]
  atomicWrite(root, doc.body_path, "changed body")
  assert.equal(dailyRetryAssessment(root, receipt).kind, "invalid_retry_evidence")
  atomicWrite(root, doc.body_path, "Controlled login wall")
  const copied = readJSON(root, `runs/${runId}/parses.json`)
  atomicWrite(root, `runs/${runId}/parses.json`, [{ ...copied[0], status: "partial" }])
  assert.equal(dailyRetryAssessment(root, receipt).kind, "invalid_retry_evidence")
  atomicWrite(root, `runs/${runId}/parses.json`, copied)
  const st = readJSON(root, `runs/${runId}/state.json`)
  st.stages["detail-" + doc.source_id].result_path = "../escape"
  atomicWrite(root, `runs/${runId}/state.json`, st)
  assert.equal(dailyRetryAssessment(root, receipt).state, "requires_repair")
  assert.equal(
    dailyRetryAssessment(root, { ...receipt, scan_evidence: { list_scan_run: "different" } }).kind,
    "invalid_retry_evidence",
  )
  fs.rmSync(path.join(root, `runs/${runId}/state.json`))
  assert.equal(dailyRetryAssessment(root, receipt).kind, "invalid_retry_evidence")
})
