import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { processDailyQueueEditorial } from "../scripts/research/daily-queue-editorial.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { storeParseArtifact, articleContentFingerprint } from "../scripts/research/parser.mjs"
import {
  planCandidateFollowups,
  recordSourceDetailReview,
} from "../scripts/research/source-followups.mjs"

// Dependency-controlled orchestration fixture; native source/approval gates
// are exercised separately in research-source-processing.test.mjs.
function fixture(t, count = 13) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "queue-editorial-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const keys = Array.from({ length: count }, (_, i) => `candidate-${i}`),
    queueRun = "queue"
  const candidates = keys.map((key, i) => ({
    key,
    review_status: "unreviewed",
    article_source_version_id: `version-${i}`,
    article_parse_id: `parse-${i}`,
    article_content_sha256: sha256(key),
  }))
  atomicWrite(root, "backlog.json", { candidates })
  const handoffPath = "runs/queue/frozen-handoff.json"
  atomicWrite(root, handoffPath, { pending: candidates })
  const input = {
    schema: "research-daily-processing-queue-input/v1",
    run_id: queueRun,
    candidate_keys: keys,
    handoff: {
      path: handoffPath,
      sha256: sha256(fs.readFileSync(path.join(root, handoffPath))),
    },
  }
  atomicWrite(root, "runs/queue/daily-queue-input.json", input)
  const hash = sha256(JSON.stringify(input)),
    results = keys.map((key, i) => {
      const child = `${queueRun}-${sha256(key).slice(0, 12)}`
      const native = `runs/${child}/daily-processing.json`
      atomicWrite(root, native, {
        schema: "research-daily-processing/v1",
        run_id: child,
        status: "review_pending",
        total: 1,
        results: [{ candidate_key: key, processing_run: `source-${i}` }],
      })
      const row = { candidate_key: key, processing_run: child, status: "processed" }
      atomicWrite(root, `runs/queue/queue-outcomes/${sha256(key)}.json`, {
        input_sha256: hash,
        row,
        native_receipt: { path: native, sha256: sha256(fs.readFileSync(path.join(root, native))) },
      })
      return row
    })
  atomicWrite(root, "runs/queue/daily-queue.json", {
    schema: "research-daily-processing-queue/v1",
    run_id: queueRun,
    status: "review_pending",
    input_sha256: hash,
    results,
  })
  const policyFile = path.join(root, "policy.json")
  fs.writeFileSync(policyFile, "{}")
  const calls = [],
    options = {
      root,
      runId: "editorial",
      queueRun,
      policyFile,
      vault: path.join(root, "vault"),
      backlogFile: path.join(root, "backlog.json"),
      processor: async (opts) => {
        calls.push(opts)
        const publicationPath = `runs/${opts.runId}/daily-editorial/selection.json`
        atomicWrite(root, publicationPath, {
          schema: "research-daily-publication-handoff/v1",
          approved_runs: [],
        })
        const receipt = {
          schema: "research-daily-editorial/v1",
          run_id: opts.runId,
          status: "review_pending",
          candidate_published: false,
          results: [{ candidate_key: opts.candidateKeys[0], status: "fact_review" }],
          publication_handoff: {
            path: publicationPath,
            sha256: sha256(fs.readFileSync(path.join(root, publicationPath))),
          },
        }
        atomicWrite(root, `runs/${opts.runId}/daily-editorial/latest.json`, receipt)
        return receipt
      },
    }
  return { root, keys, options, calls }
}

test("queue editorial handles thirteen candidates without truncation and only resumes unfinished native work", async (t) => {
  const f = fixture(t)
  const first = await processDailyQueueEditorial({ ...f.options, execute: true, maxItems: 3 })
  assert.equal(first.status, "yielded")
  assert.deepEqual(first.counts, { fact_review: 3, pending: 10 })
  const last = await processDailyQueueEditorial({ ...f.options, execute: true, maxItems: 13 })
  assert.equal(last.status, "review_pending")
  assert.equal(last.counts.fact_review, 13)
  assert.equal(f.calls.length, 13)
  assert.ok(f.calls.every((call) => call.candidateKeys.length === 1))
  await processDailyQueueEditorial({ ...f.options, execute: true })
  assert.equal(f.calls.length, 13)
  assert.equal(last.candidate_published, false)
})

test("queue editorial soft budget retains a full candidate and yields before starting the next", async (t) => {
  const f = fixture(t, 2),
    native = f.options.processor
  let elapsed = 0
  f.options.processor = async (opts) => {
    const result = await native(opts)
    elapsed += 100
    return result
  }
  const result = await processDailyQueueEditorial({
    ...f.options,
    execute: true,
    clock: () => elapsed,
    timeBudgetMs: 50,
  })
  assert.equal(result.status, "yielded")
  assert.deepEqual(result.counts, { fact_review: 1, pending: 1 })
})

test("an explicit review reaches its native continuation before earlier stored reviewed facts", async (t) => {
  const f = fixture(t, 2)
  atomicWrite(f.root, "runs/source-0/reviewed-claims.json", { claims: [] })
  const reviewPath = path.join(f.root, "explicit-review.json")
  fs.writeFileSync(reviewPath, JSON.stringify({ reviewer: "Source reviewer" }))
  const result = await processDailyQueueEditorial({
    ...f.options,
    execute: true,
    maxItems: 1,
    reviewFiles: { [f.keys[1]]: reviewPath },
  })
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].candidateKeys[0], f.keys[1])
  assert.equal(f.calls[0].reviewFiles[f.keys[1]], reviewPath)
  assert.deepEqual(
    result.results.map((row) => row.candidate_key),
    f.keys,
  )
  assert.equal(result.results[0].status, "pending")
  assert.equal(result.results[1].status, "fact_review")
  const resumed = await processDailyQueueEditorial({ ...f.options, execute: true, maxItems: 1 })
  assert.equal(resumed.status, "review_pending")
  assert.equal(f.calls.length, 2)
  assert.equal(f.calls[1].candidateKeys[0], f.keys[0])
})

test("stored reviewed facts receive priority without granting an approval", async (t) => {
  const f = fixture(t, 3)
  atomicWrite(f.root, "runs/source-2/reviewed-claims.json", { claims: [] })
  const result = await processDailyQueueEditorial({ ...f.options, execute: true, maxItems: 1 })
  assert.equal(f.calls[0].candidateKeys[0], f.keys[2])
  assert.equal(result.results[2].status, "fact_review")
  assert.equal(result.candidate_published, false)
  assert.equal(result.counts.pending, 2)
})

test("a native failure is preserved and the next independent editorial candidate proceeds", async (t) => {
  const f = fixture(t, 2),
    native = f.options.processor
  f.options.processor = async (opts) => {
    const result = await native(opts)
    if (opts.candidateKeys[0] === f.keys[0]) {
      result.results[0] = {
        candidate_key: f.keys[0],
        status: "failed",
        error: "writer failed",
        automatic_retry: false,
      }
      atomicWrite(f.root, `runs/${opts.runId}/daily-editorial/latest.json`, result)
    }
    return result
  }
  const first = await processDailyQueueEditorial({ ...f.options, execute: true })
  assert.equal(first.status, "partial")
  assert.deepEqual(first.counts, { failed: 1, fact_review: 1 })
  const replay = await processDailyQueueEditorial({ ...f.options, execute: true })
  assert.equal(replay.results[0].automatic_retry, false)
  assert.equal(f.calls.length, 2)
})

test("invalid mappings and a modified completed source receipt fail before any native action", async (t) => {
  const f = fixture(t, 1)
  await assert.rejects(
    processDailyQueueEditorial({
      ...f.options,
      execute: true,
      reviewFiles: { other: "missing.json" },
    }),
    /Reviews must name/,
  )
  assert.equal(f.calls.length, 0)
  const outcome = readJSON(f.root, `runs/queue/queue-outcomes/${sha256(f.keys[0])}.json`)
  atomicWrite(f.root, outcome.native_receipt.path, { tampered: true })
  await assert.rejects(
    processDailyQueueEditorial({ ...f.options, execute: true }),
    /Queue reference changed/,
  )
  assert.equal(f.calls.length, 0)
})

test("changed captured sources route to native revision review without rewriting approved work", async (t) => {
  const f = fixture(t, 2)
  const frozen = readJSON(f.root, "backlog.json").candidates[0]
  const candidate = {
    ...frozen,
    review_status: "deferred",
    event_id: "event-0",
    approval: {
      approved_run: "source-0",
      source_version_id: frozen.article_source_version_id,
      parse_id: frozen.article_parse_id,
      article_content_sha256: frozen.article_content_sha256,
    },
    article_source_version_id: "changed-version",
    article_parse_id: "changed-parse",
    article_content_sha256: sha256("changed-body"),
    source_revision_alert: { change_basis: "content" },
  }
  atomicWrite(f.root, "backlog.json", {
    candidates: [candidate, readJSON(f.root, "backlog.json").candidates[1]],
  })
  const source = {
    source_run: "changed-source",
    files: { "changed-source/parses.json": sha256("captured") },
  }
  const result = await processDailyQueueEditorial({
    ...f.options,
    execute: true,
    maxItems: 1,
    approvalLoader: async (_root, row) =>
      row.key === candidate.key
        ? {
            decision: "same_approved_event",
            event_id: "event-0",
            approved_run: "source-0",
            receipt: "approved.json",
          }
        : null,
    revisionSourceLoader: () => new Map([[candidate.key, source]]),
  })
  assert.equal(result.status, "source_review_pending")
  assert.equal(result.results[0].status, "source_review")
  assert.equal(result.results[0].source_revision.next_route, "review-source-revision")
  assert.equal(result.results[0].model_calls, 0)
  assert.equal(f.calls.length, 1)
  assert.deepEqual(f.calls[0].candidateKeys, [f.keys[1]])
  const record = readJSON(f.root, result.results[0].native_receipt.path)
  assert.deepEqual(record.candidate, candidate)
  assert.deepEqual(record.current_source_files, source.files)
  assert.equal(record.publication_approved, false)
  const before = fs.readFileSync(path.join(f.root, "backlog.json"))
  await assert.rejects(
    processDailyQueueEditorial({
      ...f.options,
      runId: "missing-evidence",
      execute: true,
      approvalLoader: async () => ({ event_id: "event-0" }),
      revisionSourceLoader: () => new Map(),
    }),
    /stored current original/,
  )
  assert.deepEqual(fs.readFileSync(path.join(f.root, "backlog.json")), before)
})

test("native dispositions recorded after extraction resolve cached review without a writer slot", async (t) => {
  const f = fixture(t, 2)
  const dispositionLoader = (root, candidate) => {
    if (!candidate?.disposition) return null
    return {
      decision: "outside_editorial_scope",
      receipt: "runs/disposition/candidate-disposition.json",
      source_version_id: candidate.article_source_version_id,
      parse_id: candidate.article_parse_id,
      article_content_sha256: candidate.article_content_sha256,
    }
  }
  const options = { ...f.options, dispositionLoader }
  const first = await processDailyQueueEditorial({ ...options, execute: true, maxItems: 2 })
  assert.equal(first.counts.fact_review, 2)
  const backlog = JSON.parse(fs.readFileSync(f.options.backlogFile))
  backlog.candidates[0].review_status = "rejected"
  backlog.candidates[0].disposition = { resolution_run: "disposition" }
  fs.writeFileSync(f.options.backlogFile, JSON.stringify(backlog))
  atomicWrite(f.root, "runs/disposition/candidate-disposition.json", {
    candidate_key: f.keys[0],
    candidate_published: false,
  })
  const resumed = await processDailyQueueEditorial({ ...options, execute: true, maxItems: 1 })
  assert.deepEqual(resumed.counts, { resolved: 1, fact_review: 1 })
  assert.equal(f.calls.length, 2)
  assert.equal(resumed.results[0].model_calls, 0)
  assert.equal(resumed.results[0].candidate_published, false)
  assert.equal(
    resumed.results[0].native_receipt.sha256,
    sha256(fs.readFileSync(path.join(f.root, "runs/disposition/candidate-disposition.json"))),
  )
  await processDailyQueueEditorial({ ...options, execute: true })
  assert.equal(f.calls.length, 2)
})

test("rejected labels cannot resolve editorial work and foreign source dispositions are rejected", async (t) => {
  const f = fixture(t, 1)
  const backlog = JSON.parse(fs.readFileSync(f.options.backlogFile))
  backlog.candidates[0].review_status = "rejected"
  fs.writeFileSync(f.options.backlogFile, JSON.stringify(backlog))
  const labelsOnly = await processDailyQueueEditorial({ ...f.options, execute: true })
  assert.equal(labelsOnly.counts.fact_review, 1)
  assert.equal(f.calls.length, 1)
  await assert.rejects(
    processDailyQueueEditorial({
      ...f.options,
      execute: true,
      dispositionLoader: () => ({
        decision: "outside_editorial_scope",
        receipt: "runs/foreign/candidate-disposition.json",
        source_version_id: "different-version",
        parse_id: "parse-0",
        article_content_sha256: sha256(f.keys[0]),
      }),
    }),
    /differs from frozen editorial source/,
  )
  assert.equal(f.calls.length, 1)
})

function reviewedRevision(f) {
  const backlog = JSON.parse(fs.readFileSync(f.options.backlogFile))
  const candidate = backlog.candidates[0]
  candidate.review_status = "verified"
  candidate.source_urls = ["https://example.org/reviewed-source"]
  candidate.event_id = "event-0"
  candidate.approval = {
    approved_run: "revised-source",
    event_id: candidate.event_id,
    article_sha256: sha256("revised article"),
    source_version_id: candidate.article_source_version_id,
    parse_id: candidate.article_parse_id,
    article_content_sha256: candidate.article_content_sha256,
  }
  fs.writeFileSync(f.options.backlogFile, JSON.stringify(backlog))
  const receipt = "runs/revised-approval/candidate-approval.json"
  atomicWrite(f.root, receipt, { candidate_key: candidate.key, ...candidate.approval })
  return {
    candidate,
    approval: {
      ...candidate.approval,
      receipt,
      candidate_published: false,
    },
  }
}

test("same-run native approval resolves a stale extraction frontier without another writer slot", async (t) => {
  const f = fixture(t, 2)
  await processDailyQueueEditorial({ ...f.options, execute: true, maxItems: 1 })
  const queueBytes = fs.readFileSync(path.join(f.root, "runs/queue/daily-queue.json"))
  const outcomePath = `runs/queue/queue-outcomes/${sha256(f.keys[0])}.json`
  const outcomeBytes = fs.readFileSync(path.join(f.root, outcomePath))
  const { candidate, approval } = reviewedRevision(f)
  candidate.approval.approved_run = approval.approved_run = "source-0"
  const backlog = readJSON(f.root, "backlog.json")
  backlog.candidates[0] = candidate
  atomicWrite(f.root, "backlog.json", backlog)
  atomicWrite(f.root, approval.receipt, { candidate_key: candidate.key, ...candidate.approval })
  const result = await processDailyQueueEditorial({
    ...f.options,
    execute: true,
    maxItems: 1,
    approvalLoader: async (_root, row) => (row?.approval ? approval : null),
  })
  assert.deepEqual(result.counts, { resolved: 1, fact_review: 1 })
  assert.equal(result.results[0].resolution.approved_run, "source-0")
  assert.equal(result.results[0].model_calls, 0)
  assert.equal(f.calls.length, 2, "only the unfinished second candidate continues")
  assert.equal(f.calls[1].candidateKeys[0], f.keys[1])
  assert.ok(queueBytes.equals(fs.readFileSync(path.join(f.root, "runs/queue/daily-queue.json"))))
  assert.ok(outcomeBytes.equals(fs.readFileSync(path.join(f.root, outcomePath))))
  const handoff = readJSON(f.root, result.publication_handoff.path)
  assert.deepEqual(handoff.approved_runs, [], "approval reuse does not authorize publication")
  assert.equal(result.candidate_published, false)
})

test("same-run approval reuse checks exact binding and does not swallow explicit review requests", async (t) => {
  const f = fixture(t, 1)
  const { candidate, approval } = reviewedRevision(f)
  candidate.approval.approved_run = approval.approved_run = "source-0"
  atomicWrite(f.root, "backlog.json", { candidates: [candidate] })
  atomicWrite(f.root, approval.receipt, { candidate_key: candidate.key, ...candidate.approval })
  await assert.rejects(
    processDailyQueueEditorial({
      ...f.options,
      execute: true,
      approvalLoader: async () => ({ ...approval, article_sha256: sha256("different") }),
    }),
    /differs from frozen editorial source or binding/,
  )
  assert.equal(f.calls.length, 0)
  const reviewPath = path.join(f.root, "explicit.json")
  fs.writeFileSync(reviewPath, JSON.stringify({ reviewer: "Explicit source review" }))
  const result = await processDailyQueueEditorial({
    ...f.options,
    execute: true,
    approvalLoader: async () => approval,
    reviewFiles: { [f.keys[0]]: reviewPath },
  })
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].reviewFiles[f.keys[0]], reviewPath)
  assert.equal(result.counts.fact_review, 1)
})

test("late cheap approvals are reconciled before an earlier unfinished row exhausts the budget", async (t) => {
  const f = fixture(t, 3)
  const backlog = readJSON(f.root, "backlog.json")
  const candidate = backlog.candidates[2]
  candidate.review_status = "verified"
  candidate.event_id = "event-2"
  candidate.approval = {
    approved_run: "source-2",
    event_id: candidate.event_id,
    article_sha256: sha256("source-2 article"),
    source_version_id: candidate.article_source_version_id,
    parse_id: candidate.article_parse_id,
    article_content_sha256: candidate.article_content_sha256,
  }
  atomicWrite(f.root, "backlog.json", backlog)
  const receipt = "runs/approved-two/candidate-approval.json"
  atomicWrite(f.root, receipt, { candidate_key: candidate.key, ...candidate.approval })
  const result = await processDailyQueueEditorial({
    ...f.options,
    execute: true,
    maxItems: 1,
    approvalLoader: async (_root, row) =>
      row?.approval ? { ...row.approval, receipt, candidate_published: false } : null,
  })
  assert.equal(result.results[2].status, "resolved")
  assert.equal(result.results[1].status, "pending")
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].candidateKeys[0], f.keys[0])
})

test("late native approvals replace cached source continuation without changing frozen queue input", async (t) => {
  const f = fixture(t, 1)
  await processDailyQueueEditorial({ ...f.options, execute: true })
  const inputBytes = fs.readFileSync(path.join(f.root, "runs/editorial/queue-editorial/input.json"))
  const oldChild = f.calls[0].runId
  const { approval } = reviewedRevision(f)
  const options = { ...f.options, approvalLoader: async () => approval, execute: true }
  const result = await processDailyQueueEditorial(options)
  assert.equal(f.calls.length, 2)
  assert.notEqual(f.calls[1].runId, oldChild)
  assert.deepEqual(f.calls[1].editorialProcessingRuns, { [f.keys[0]]: "revised-source" })
  assert.equal(f.calls[1].processingRun, f.calls[0].processingRun)
  assert.equal(result.results[0].processing_run, "revised-source")
  assert.equal(result.results[0].original_processing_run, "source-0")
  assert.equal(result.results[0].current_approval.path, approval.receipt)
  assert.ok(
    inputBytes.equals(
      fs.readFileSync(path.join(f.root, "runs/editorial/queue-editorial/input.json")),
    ),
  )
  await processDailyQueueEditorial(options)
  assert.equal(f.calls.length, 2)
})

test("late approval labels cannot replace work without native proof and exact frozen source", async (t) => {
  const f = fixture(t, 1)
  const { approval } = reviewedRevision(f)
  await assert.rejects(processDailyQueueEditorial({ ...f.options, execute: true }), /ENOENT/)
  assert.equal(f.calls.length, 0)
  await assert.rejects(
    processDailyQueueEditorial({
      ...f.options,
      execute: true,
      approvalLoader: async () => ({ ...approval, article_sha256: sha256("foreign article") }),
    }),
    /differs from frozen editorial source or binding/,
  )
  const backlog = JSON.parse(fs.readFileSync(f.options.backlogFile))
  backlog.candidates[0].approval.parse_id = "foreign-parse"
  fs.writeFileSync(f.options.backlogFile, JSON.stringify(backlog))
  await assert.rejects(
    processDailyQueueEditorial({
      ...f.options,
      execute: true,
      approvalLoader: async () => approval,
    }),
    /differs from frozen editorial source or binding/,
  )
  assert.equal(f.calls.length, 0)
})

test("new approved revision has a distinct attempt while preserving the original failed checkpoint", async (t) => {
  const f = fixture(t, 1)
  const initial = await processDailyQueueEditorial({
    ...f.options,
    execute: true,
    processor: async () => {
      throw Error("original draft failed")
    },
  })
  assert.equal(initial.counts.failed, 1)
  const failurePath = path.join(
    f.root,
    `runs/editorial/queue-editorial/failures/${sha256(f.keys[0])}.json`,
  )
  const failureBytes = fs.readFileSync(failurePath)
  const { approval } = reviewedRevision(f)
  const result = await processDailyQueueEditorial({
    ...f.options,
    execute: true,
    approvalLoader: async () => approval,
  })
  assert.equal(result.counts.fact_review, 1)
  assert.equal(f.calls.length, 1)
  assert.ok(failureBytes.equals(fs.readFileSync(failurePath)))
})

function lateDetailFixture(t) {
  const f = fixture(t, 2)
  const url = "https://example.org/weekly",
    id = sourceId(url),
    text = "Robot launch details",
    raw = sha256(text),
    parseId = sha256("detail-parse")
  const document = {
    source_id: id,
    source_version_id: `${id}:${raw}`,
    original_url: url,
    final_url: url,
    body_sha256: raw,
    body_path: "sources/detail.html",
    fetch_status: "captured",
    observed_at: "2026-10-08T00:00:00Z",
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id: id,
    source_version_id: document.source_version_id,
    parse_id: parseId,
    status: "extracted",
    title: "Weekly roundup",
    dates: { published_at: "2026-10-07" },
    quality: { required_fields_present: true, missing_pages: [] },
    blocks: [
      {
        block_id: `${parseId}:b1`,
        text,
        locator: { dom_path: "/html/body/article/p[1]", text_hash: sha256(text) },
      },
    ],
    links: [
      {
        url: "https://example.org/robot",
        text: "launch details",
        dom_path: "/html/body/article/p[1]/a[1]",
      },
    ],
  }
  atomicWrite(f.root, document.body_path, text)
  storeParseArtifact(f.root, parse)
  atomicWrite(f.root, "runs/parent/documents.json", [document])
  atomicWrite(f.root, "runs/parent/parses.json", [parse])
  const backlog = readJSON(f.root, "backlog.json")
  Object.assign(backlog.candidates[0], {
    source_urls: [url],
    source_evidence_state: "exact",
    article_source_version_id: document.source_version_id,
    article_parse_id: parseId,
    article_content_sha256: articleContentFingerprint(parse),
    source_attempts: [
      {
        attempt_id: "parent",
        article_source_version_id: document.source_version_id,
        article_parse_id: parseId,
        article_content_sha256: articleContentFingerprint(parse),
      },
    ],
  })
  atomicWrite(f.root, "backlog.json", backlog)
  const handoffFile = path.join(f.root, "runs/queue/frozen-handoff.json")
  atomicWrite(f.root, "runs/queue/frozen-handoff.json", {
    schema: "research-editorial-handoff/v1",
    pending: backlog.candidates,
  })
  const input = readJSON(f.root, "runs/queue/daily-queue-input.json")
  input.handoff.sha256 = sha256(fs.readFileSync(handoffFile))
  atomicWrite(f.root, "runs/queue/daily-queue-input.json", input)
  const inputHash = sha256(JSON.stringify(input))
  const queue = readJSON(f.root, "runs/queue/daily-queue.json")
  queue.input_sha256 = inputHash
  atomicWrite(f.root, "runs/queue/daily-queue.json", queue)
  for (const key of f.keys) {
    const file = `runs/queue/queue-outcomes/${sha256(key)}.json`
    const row = readJSON(f.root, file)
    row.input_sha256 = inputHash
    atomicWrite(f.root, file, row)
  }
  const options = { root: f.root, handoffFile, candidateKey: f.keys[0] }
  const plan = planCandidateFollowups(options).plan
  const evidence = plan.leads[0].provenance[0]
  const review = {
    schema: "research-source-detail-review-input/v1",
    candidate_key: f.keys[0],
    source_version_id: document.source_version_id,
    parse_id: parseId,
    source_read: true,
    reviewer: "Source reader",
    reviewed_at: "2026-10-08",
    required_details: [
      {
        candidate_key: plan.leads[0].key,
        block_id: evidence.block_id,
        quote: evidence.block_text,
        reason: "The launch report is needed for the actual event details.",
      },
    ],
  }
  return { ...f, record: () => recordSourceDetailReview({ ...options, review }), document }
}

test("late native detail review defers a cached fact packet without changing queue or spending a writer slot", async (t) => {
  const f = lateDetailFixture(t)
  const before = fs.readFileSync(path.join(f.root, "runs/queue/daily-queue.json"))
  const inputBefore = fs.readFileSync(path.join(f.root, "runs/queue/daily-queue-input.json"))
  await processDailyQueueEditorial({ ...f.options, execute: true, maxItems: 2 })
  assert.equal(f.calls.length, 2)
  const stored = f.record()
  const second = await processDailyQueueEditorial({ ...f.options, execute: true, maxItems: 1 })
  assert.equal(second.status, "source_review_pending")
  assert.deepEqual(second.counts, { source_review: 1, fact_review: 1 })
  assert.equal(f.calls.length, 2)
  assert.equal(second.results[0].native_receipt.path, stored.path)
  assert.equal(second.results[0].model_calls, 0)
  assert.equal(second.results[0].candidate_published, false)
  assert.deepEqual(fs.readFileSync(path.join(f.root, "runs/queue/daily-queue.json")), before)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/queue/daily-queue-input.json")),
    inputBefore,
  )
  await processDailyQueueEditorial({ ...f.options, execute: true, maxItems: 1 })
  assert.equal(f.calls.length, 2)
})

test("a tampered late detail review fails before an independent candidate starts", async (t) => {
  const f = lateDetailFixture(t),
    stored = f.record()
  const receipt = readJSON(f.root, stored.path)
  receipt.review.required_details[0].quote = "Invented details"
  atomicWrite(f.root, stored.path, receipt)
  await assert.rejects(
    processDailyQueueEditorial({ ...f.options, execute: true }),
    /identity changed/,
  )
  assert.equal(f.calls.length, 0)
})

test("late detail review cannot replace an approved article or a concurrent fact review", async (t) => {
  const f = lateDetailFixture(t)
  f.record()
  atomicWrite(f.root, "runs/source-0/approved-article.json", { approved: true })
  await assert.rejects(processDailyQueueEditorial({ ...f.options, execute: true }), /conflicts/)
  assert.equal(f.calls.length, 0)
  fs.unlinkSync(path.join(f.root, "runs/source-0/approved-article.json"))
  const reviewFile = path.join(f.root, "facts.json")
  fs.writeFileSync(reviewFile, "{}")
  await assert.rejects(
    processDailyQueueEditorial({
      ...f.options,
      execute: true,
      reviewFiles: { [f.keys[0]]: reviewFile },
    }),
    /conflicts/,
  )
  assert.equal(f.calls.length, 0)
  const backlog = readJSON(f.root, "backlog.json")
  backlog.candidates[0].article_parse_id = sha256("new-parse")
  atomicWrite(f.root, "backlog.json", backlog)
  await assert.rejects(processDailyQueueEditorial({ ...f.options, execute: true }), /conflicts/)
  assert.equal(f.calls.length, 0)
})
