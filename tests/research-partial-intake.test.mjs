import { loadPartialCandidateIntakeEvidence } from "../scripts/research/delivery-status.mjs"
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { articleContentFingerprint, storeParseArtifact } from "../scripts/research/parser.mjs"
import {
  mergeCompletedScan,
  mergePartialScan,
  intakePartialScan,
} from "../scripts/research/scan-completion.mjs"
import { verifyStoredPartialCandidates } from "../scripts/research/scan-evidence.mjs"
import {
  executeDailyPlan,
  verifyDailyReceipts,
  storedListScan,
} from "../scripts/research/daily-scan.mjs"
import {
  buildEditorialHandoff,
  selectCandidateSource,
} from "../scripts/research/editorial-handoff.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "partial-source-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const makeDocument = (url, text) => {
    const id = sourceId(url),
      hash = sha256(text),
      body_path = `documents/${id}/${hash}/body.bin`
    atomicWrite(root, body_path, Buffer.from(text))
    return {
      original_url: url,
      final_url: url,
      source_id: id,
      source_version_id: `${id}:${hash}`,
      body_path,
      body_sha256: hash,
      observed_at: "2026-10-04T00:00:00Z",
      fetch_status: "captured",
      policy_status: "checked",
    }
  }
  const listing = makeDocument("https://example.com/feed", "Covered dated listing")
  const doc = makeDocument("https://example.com/news/one", "Confirmed source article")
  const parse_id = sha256("parse fixture")
  const parsed = {
    schema_version: "source-parse/v1",
    source_id: doc.source_id,
    source_version_id: doc.source_version_id,
    parse_id,
    parser: { id: "controlled-fixture" },
    status: "extracted",
    title: "Confirmed article",
    dates: { published_at: "2026-10-02", observed_at: doc.observed_at },
    quality: { required_fields_present: true, missing_pages: [] },
    blocks: [
      {
        block_id: parse_id + ":block-0001",
        kind: "paragraph",
        text: "Confirmed source article",
        locator: {
          type: "html",
          dom_path: "/html/body/article/p",
          text_hash: sha256("Confirmed source article"),
        },
      },
    ],
  }
  storeParseArtifact(root, parsed)
  const candidate = {
    key: "source-" + doc.source_id,
    title: parsed.title,
    source_urls: [doc.original_url],
    source_published_at: parsed.dates.published_at,
    discovered_at: doc.observed_at,
    article_observed_at: doc.observed_at,
    article_source_version_id: doc.source_version_id,
    article_parse_id: parse_id,
    article_content_sha256: articleContentFingerprint(parsed),
    review_status: "unreviewed",
    priority: "normal",
    discovery: [],
  }
  const window = {
    channel_id: "partial-source",
    since: "2026-10-02",
    until_exclusive: "2026-10-03",
  }
  const result = {
    summary: {
      status: "incomplete",
      reason: "detail_incomplete",
      ...window,
      window,
      listing_source_version_id: listing.source_version_id,
      assessment: { status: "window_covered" },
      candidate_count: 1,
      details: [
        {
          url: doc.original_url,
          status: "source_parsed_unreviewed",
          source_version_id: doc.source_version_id,
          parse_id,
        },
        { url: "https://example.com/news/image", status: "article_image_body_requires_review" },
      ],
    },
    documents: [doc],
    indexDocuments: [listing],
    parses: [parsed],
    candidates: [candidate],
  }
  const save = (id) => {
    for (const [name, value] of Object.entries({
      "list-scan.json": result.summary,
      "documents.json": result.documents,
      "list-pages.json": result.indexDocuments,
      "parses.json": result.parses,
      "candidates.json": result.candidates,
    }))
      atomicWrite(root, `runs/${id}/${name}`, value)
  }
  return { root, result, window, save, candidate }
}

test("partial intake preserves the failed detail, refuses complete-window merge and deduplicates valid articles", async (t) => {
  const { root, result } = fixture(t)
  const backlog = path.join(root, "backlog.json")
  assert.equal((await mergeCompletedScan(result, backlog)).status, "skipped")
  assert.equal(fs.existsSync(backlog), false)
  const first = await mergePartialScan(root, result, backlog)
  assert.equal(first.status, "merged_partial")
  assert.equal(first.window_complete, false)
  const bytes = fs.readFileSync(backlog)
  assert.equal(readJSON(root, "backlog.json").candidates.length, 1)
  assert.equal((await mergePartialScan(root, result, backlog)).changed, false)
  assert.deepEqual(fs.readFileSync(backlog), bytes)
  assert.equal(result.summary.status, "incomplete")
  assert.equal(result.summary.details[1].status, "article_image_body_requires_review")
})

test("partial intake rejects unsupported evidence, conflicting dates, duplicate keys and incomplete listing coverage before writing", async (t) => {
  const { root, result, window } = fixture(t)
  const mutations = [
    (s) => {
      s.candidates[0].article_content_sha256 = "0".repeat(64)
    },
    (s) => {
      s.summary.details[0].status = "title_conflict"
    },
    (s) => {
      s.documents[0].policy_status = "unverified"
    },
    (s) => {
      s.indexDocuments[0].policy_status = "unverified"
    },
    (s) => {
      s.candidates[0].source_published_at = "2026-10-03"
    },
    (s) => {
      s.candidates.push(s.candidates[0])
    },
    (s) => {
      s.summary.assessment.status = "window_incomplete"
    },
    (s) => {
      s.parses[0].status = "partial"
    },
    (s) => {
      const other = s.indexDocuments[0]
      s.documents.push(other)
      s.candidates[0].article_source_version_id = other.source_version_id
      s.candidates[0].source_urls = [other.original_url]
      s.summary.details[0].source_version_id = other.source_version_id
      s.summary.details[0].url = other.original_url
    },
  ]
  for (const mutate of mutations) {
    const changed = structuredClone(result)
    mutate(changed)
    assert.throws(() => verifyStoredPartialCandidates(root, changed, window))
    await assert.rejects(() => mergePartialScan(root, changed, path.join(root, "rejected.json")))
    assert.equal(fs.existsSync(path.join(root, "rejected.json")), false)
  }
  fs.writeFileSync(path.join(root, result.documents[0].body_path), "changed source bytes")
  assert.throws(() => verifyStoredPartialCandidates(root, result, window), /hash mismatch/)
})

test("daily partial intake supplies exact sources to editorial handoff while leaving coverage unresolved across resume", async (t) => {
  const { root, result, window, save, candidate } = fixture(t)
  const plan = {
    schema: "research-daily-plan/v1",
    run_id: "daily-20261004-partial",
    kst_day: "2026-10-04",
    cutoff: "2026-10-01T00:00:00Z",
    windows: [window],
    retry_policy: { max_attempts_per_window: 1, blocked_requires_new_observation: true },
  }
  const coverage = {
    schema: "research-daily-coverage/v1",
    routes: {
      "partial-source": {
        anchor_since: "2026-10-02",
        last_contiguous_until: "2026-10-02",
        covered: [],
        unresolved: [],
      },
    },
  }
  let scans = 0
  const backlogFile = path.join(root, "backlog.json")
  const options = {
    root,
    plan,
    coverage,
    backlogFile,
    activeRoutes: [
      {
        channel_id: window.channel_id,
        route: {
          channel_id: window.channel_id,
          sectors: ["로봇·제조"],
          region: "국내",
          axis: "기술·제품",
        },
      },
    ],
    sameEventAliases: new Map(),
    scan: async (_, id) => {
      scans++
      save(id)
      return result
    },
  }
  const summary = await executeDailyPlan(options)
  assert.equal(summary.status, "partial")
  assert.equal(summary.routes[0].status, "incomplete")
  const state = readJSON(root, "daily/route-coverage.json").routes[window.channel_id]
  assert.equal(state.covered.length, 0)
  assert.equal(state.last_contiguous_until, "2026-10-02")
  assert.equal(state.unresolved.length, 1)
  const receiptFile = fs.readdirSync(path.join(root, `daily/runs/${plan.run_id}/receipts`))[0]
  const receipt = readJSON(root, `daily/runs/${plan.run_id}/receipts/${receiptFile}`)
  assert.equal(receipt.status, "incomplete")
  assert.equal(receipt.backlog_merge.status, "merged_partial")
  assert.equal(verifyDailyReceipts(root, plan, [receipt], { sameEventAliases: new Map() }), true)
  const observation = {
    attempt_id: receipt.attempt_id,
    key: candidate.key,
    source_urls: candidate.source_urls,
    article_source_version_id: candidate.article_source_version_id,
    article_parse_id: candidate.article_parse_id,
    article_content_sha256: candidate.article_content_sha256,
  }
  const handoff = buildEditorialHandoff({
    plan,
    receipts: [receipt],
    observations: [observation],
    backlog: readJSON(root, "backlog.json"),
    issues: [],
    observedAt: receipt.finished_at,
  })
  assert.equal(handoff.incomplete_windows.length, 1)
  assert.equal(handoff.pending[0].source_evidence_state, "exact")
  assert.equal(
    selectCandidateSource(root, handoff, candidate.key).selected.parses[0].parse_id,
    candidate.article_parse_id,
  )
  const bytes = fs.readFileSync(backlogFile)
  await executeDailyPlan(options)
  assert.equal(scans, 1)
  assert.deepEqual(fs.readFileSync(backlogFile), bytes)
  const wrong = structuredClone(receipt)
  wrong.candidate_keys = ["unrelated"]
  assert.throws(
    () => verifyDailyReceipts(root, plan, [wrong], { sameEventAliases: new Map() }),
    /no longer matches/,
  )
  const promoted = structuredClone(receipt)
  promoted.status = "window_scanned"
  assert.throws(() => verifyDailyReceipts(root, plan, [promoted]), /cannot complete/)
})

test("partial intake reuses reviewed same-event aliases without adding a second candidate", async (t) => {
  const { root, result, candidate } = fixture(t)
  const backlogFile = path.join(root, "backlog.json")
  const target = {
    ...candidate,
    key: "existing-event",
    source_urls: ["https://example.com/original"],
  }
  atomicWrite(root, "backlog.json", { schema: "research-candidates/v1", candidates: [target] })
  const aliases = new Map([
    [
      candidate.source_urls[0],
      { candidate_key: target.key, resolution_run: "source-relation-review" },
    ],
  ])
  const merged = await mergePartialScan(root, result, backlogFile, undefined, aliases)
  assert.equal(merged.same_event_aliases[0].target_candidate_key, target.key)
  assert.deepEqual(readJSON(root, "backlog.json").candidates, [target])
})

test("explicit partial intake records immutable run-bound receipts and rejects modified source manifests", async (t) => {
  const { root, result, save } = fixture(t)
  save("partial-run")
  const backlogFile = path.join(root, "backlog.json")
  atomicWrite(root, "backlog.json", { schema: "research-candidates/v1", candidates: [] })
  const options = { root, result, runId: "partial-run", backlogFile }
  const first = await intakePartialScan(options)
  const receipt = readJSON(root, first.receipt)
  assert.equal(receipt.source_run, "partial-run")
  assert.equal(receipt.window_complete, false)
  assert.equal(receipt.candidate_approved, false)
  const bytes = fs.readFileSync(backlogFile)
  const second = await intakePartialScan(options)
  assert.notEqual(second.receipt, first.receipt)
  assert.equal(second.changed, false)
  assert.deepEqual(fs.readFileSync(backlogFile), bytes)
  atomicWrite(root, "runs/partial-run/candidates.json", [])
  await assert.rejects(() => intakePartialScan(options), /differs from its stored/)
  assert.deepEqual(fs.readFileSync(backlogFile), bytes)
})

test("private progress verifies partial intake receipts without counting unresolved details as completion", async (t) => {
  const { root, result, save } = fixture(t)
  save("partial-progress")
  const backlogFile = path.join(root, "backlog.json")
  atomicWrite(root, "backlog.json", { schema: "research-candidates/v1", candidates: [] })
  await intakePartialScan({ root, result, runId: "partial-progress", backlogFile })
  await intakePartialScan({ root, result, runId: "partial-progress", backlogFile })
  const audit = loadPartialCandidateIntakeEvidence(root, backlogFile)
  assert.equal(audit.receipt_count, 2)
  assert.equal(audit.unique_candidate_count, 1)
  assert.equal(audit.invalid_receipt_count, 0)
  assert.equal(audit.window_complete, false)
  assert.equal(audit.entries[0].unresolved_details.length, 1)
  const manifest = readJSON(root, "runs/partial-progress/list-scan.json")
  manifest.details[1].status = "source_parsed_unreviewed"
  atomicWrite(root, "runs/partial-progress/list-scan.json", manifest)
  const changed = loadPartialCandidateIntakeEvidence(root, backlogFile)
  assert.equal(changed.receipt_count, 0)
  assert.equal(changed.unique_candidate_count, 0)
  assert.equal(changed.invalid_receipt_count, 2)
})
