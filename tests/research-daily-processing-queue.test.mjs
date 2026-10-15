import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  planDailyProcessingQueue,
  processDailyQueue,
} from "../scripts/research/daily-processing-queue.mjs"
import { processDailyCandidates } from "../scripts/research/daily-processing.mjs"
import { articleContentFingerprint } from "../scripts/research/parser.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { acquireLock, atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { processingSourceLockName } from "../scripts/research/processing-reuse.mjs"
import { recordCandidateDisposition } from "../scripts/research/candidate-disposition.mjs"
import {
  recordSourceDetailReview,
  findStoredSourceDetailReviewFiles,
} from "../scripts/research/source-followups.mjs"

function fixture(t, count = 3, sourceHosts = []) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "daily-queue-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const handoff = { schema: "research-editorial-handoff/v1", daily_run: "daily", pending: [] }
  for (let i = 0; i < count; i++) {
    const url = `https://${sourceHosts[i] || "example.org"}/article-${i}`,
      text = `Original event ${i}`,
      id = sourceId(url),
      hash = sha256(text),
      parseId = sha256("parse-" + i)
    const doc = {
      source_id: id,
      source_version_id: id + ":" + hash,
      original_url: url,
      final_url: url,
      body_sha256: hash,
      body_path: `documents/${id}/${hash}/body.bin`,
      fetch_status: "captured",
      observed_at: "2026-10-08T00:00:00Z",
    }
    const parse = {
      schema_version: "source-parse/v1",
      source_id: id,
      source_version_id: doc.source_version_id,
      parse_id: parseId,
      title: `Article ${i}`,
      status: "extracted",
      dates: { published_at: "2026-10-07", observed_at: doc.observed_at },
      blocks: [{ block_id: parseId + ":b1", text, locator: { text_hash: hash } }],
      quality: { missing_pages: [] },
    }
    atomicWrite(root, doc.body_path, text)
    atomicWrite(root, `parses/${parseId}/parse.json`, parse)
    atomicWrite(root, `runs/source-${i}/documents.json`, [doc])
    atomicWrite(root, `runs/source-${i}/parses.json`, [parse])
    const content = articleContentFingerprint(parse)
    handoff.pending.push({
      key: `candidate-${String(i).padStart(2, "0")}`,
      title: parse.title,
      priority: "normal",
      review_status: "unreviewed",
      event_id: null,
      next_route: "review-publication-time",
      source_evidence_state: "exact",
      source_published_at: "2026-10-07",
      discovered_at: "2026-10-08T00:00:00Z",
      source_urls: [url],
      article_source_version_id: doc.source_version_id,
      article_parse_id: parseId,
      article_content_sha256: content,
      source_attempts: [
        {
          attempt_id: `source-${i}`,
          article_source_version_id: doc.source_version_id,
          article_parse_id: parseId,
          article_content_sha256: content,
        },
      ],
    })
  }
  const policyFile = path.join(root, "policy.json")
  fs.writeFileSync(policyFile, "{}")
  const calls = [],
    options = {
      root,
      runId: "queue",
      dailyRunId: "daily",
      collectionBasis: "basis.json",
      policyFile,
      backlogFile: path.join(root, "backlog.json"),
      vault: path.join(root, "vault"),
      basisLoader: () => readJSON(root, "basis.json"),
      candidateLoader: () => ({ path: "handoff.json", value: readJSON(root, "handoff.json") }),
      processor: (opts) =>
        processDailyCandidates({
          ...opts,
          processor: async (child) => {
            calls.push(child)
            return { status: "fact_review", candidate_published: false }
          },
        }),
    }
  const save = () => {
    atomicWrite(root, "handoff.json", handoff)
    atomicWrite(root, "backlog.json", {
      schema: "research-candidates/v1",
      candidates: handoff.pending,
    })
    atomicWrite(root, "basis.json", {
      daily_run: "daily",
      handoff: {
        path: "handoff.json",
        sha256: sha256(fs.readFileSync(path.join(root, "handoff.json"))),
      },
    })
  }
  save()
  return { root, handoff, options, calls, save }
}

test("read-only queue preserves older implementation provenance without processing or rewriting", async (t) => {
  const f = fixture(t, 2)
  await processDailyQueue({ ...f.options, execute: true, maxItems: 2 })
  const inputPath = "runs/queue/daily-queue-input.json"
  const input = readJSON(f.root, inputPath)
  for (const field of [
    "implementation_sha256",
    "processor_sha256",
    "candidate_reader_sha256",
    "disposition_reader_sha256",
    "approval_reader_sha256",
    "source_review_reader_sha256",
  ]) input[field] = "a".repeat(64)
  atomicWrite(f.root, inputPath, input)
  const hash = sha256(JSON.stringify(input))
  const receiptPath = "runs/queue/daily-queue.json"
  const receipt = readJSON(f.root, receiptPath)
  receipt.input_sha256 = hash
  atomicWrite(f.root, receiptPath, receipt)
  const outcomePaths = input.candidate_keys.map(
    (key) => `runs/queue/queue-outcomes/${sha256(key)}.json`,
  )
  for (const file of outcomePaths) {
    const outcome = readJSON(f.root, file)
    outcome.input_sha256 = hash
    atomicWrite(f.root, file, outcome)
  }
  const files = [inputPath, receiptPath, ...outcomePaths]
  const before = files.map((file) => fs.readFileSync(path.join(f.root, file)))
  const calls = f.calls.length
  await assert.rejects(processDailyQueue({ ...f.options, execute: true }), /Queue inputs changed/)
  const read = await processDailyQueue({ ...f.options, readOnly: true })
  assert.equal(read.input_sha256, hash)
  assert.deepEqual(read.results, receipt.results)
  assert.equal(f.calls.length, calls)
  files.forEach((file, index) =>
    assert.deepEqual(fs.readFileSync(path.join(f.root, file)), before[index]),
  )
  await assert.rejects(
    processDailyQueue({ ...f.options, readOnly: true, execute: true }),
    /cannot process sources/,
  )
  fs.writeFileSync(f.options.policyFile, '{"changed":true}')
  await assert.rejects(processDailyQueue({ ...f.options, readOnly: true }), /Queue inputs changed/)
})

test("read-only queue rejects missing, active and changed native checkpoints", async (t) => {
  const f = fixture(t, 1)
  await assert.rejects(processDailyQueue({ ...f.options, readOnly: true }), /frozen input/)
  await processDailyQueue({ ...f.options, execute: true })
  const receiptPath = "runs/queue/daily-queue.json"
  const receipt = readJSON(f.root, receiptPath)
  atomicWrite(f.root, receiptPath, { ...receipt, status: "running" })
  await assert.rejects(processDailyQueue({ ...f.options, readOnly: true }), /stopped native/)
  atomicWrite(f.root, receiptPath, receipt)
  const outcome = readJSON(f.root, `runs/queue/queue-outcomes/${sha256(f.handoff.pending[0].key)}.json`)
  atomicWrite(f.root, outcome.native_receipt.path, { changed: true })
  await assert.rejects(processDailyQueue({ ...f.options, readOnly: true }), /native receipt changed/)
})

test("a reviewed detail requirement yields its slot, preserves candidate and revalidates on resume", async (t) => {
  const f = fixture(t, 2),
    parent = f.handoff.pending[0]
  const parseFile = `parses/${parent.article_parse_id}/parse.json`
  const parse = readJSON(f.root, parseFile)
  parse.blocks[0].locator.dom_path = "/html/body/article/p"
  parse.links = [
    {
      url: "https://example.net/detail",
      text: parse.blocks[0].text,
      dom_path: "/html/body/article/p/a",
    },
  ]
  atomicWrite(f.root, parseFile, parse)
  atomicWrite(f.root, "runs/source-0/parses.json", [parse])
  f.save()
  const review = {
    schema: "research-source-detail-review-input/v1",
    candidate_key: parent.key,
    source_read: true,
    reviewer: "Direct source review",
    reviewed_at: "2026-10-08",
    source_version_id: parent.article_source_version_id,
    parse_id: parent.article_parse_id,
    required_details: [
      {
        candidate_key: "source-" + sourceId("https://example.net/detail"),
        block_id: parse.blocks[0].block_id,
        quote: parse.blocks[0].text,
        reason: "The parent is a headline pointing to an event detail report.",
      },
    ],
  }
  const receipt = recordSourceDetailReview({
    root: f.root,
    handoffFile: path.join(f.root, "handoff.json"),
    candidateKey: parent.key,
    review,
  })
  const options = {
    ...f.options,
    sourceReviewFiles: { [parent.key]: receipt.path },
    execute: true,
    maxItems: 1,
  }
  const before = fs.readFileSync(options.backlogFile)
  const first = await processDailyQueue(options)
  assert.equal(first.counts.source_review, 1)
  assert.equal(first.counts.processed, 1)
  assert.equal(first.status, "source_review_pending")
  assert.equal(first.results[0].model_calls, 0)
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].candidateKey, "source-" + sourceId(f.handoff.pending[1].source_urls[0]))
  assert.deepEqual(fs.readFileSync(options.backlogFile), before)
  const again = await processDailyQueue(options)
  assert.deepEqual(again, first)
  assert.equal(f.calls.length, 1)
  const automatic = await processDailyQueue({
    ...options,
    runId: "automatic-review-queue",
    sourceReviewFiles: undefined,
    timeBudgetMs: 1,
  })
  assert.equal(automatic.counts.source_review, 1)
  assert.equal(automatic.counts.processed, 0)
  assert.equal(automatic.results[0].source_review.receipt, receipt.path)
  assert.equal(f.calls.length, 1)
  assert.deepEqual(
    await processDailyQueue({
      ...options,
      runId: "automatic-review-queue",
      sourceReviewFiles: undefined,
      timeBudgetMs: 1,
    }),
    automatic,
  )
  const changedHandoff = path.join(f.root, "changed-handoff.json")
  fs.writeFileSync(
    changedHandoff,
    fs.readFileSync(path.join(f.root, "handoff.json"), "utf8") + "\n",
  )
  assert.deepEqual(
    findStoredSourceDetailReviewFiles({
      root: f.root,
      handoffFile: changedHandoff,
      candidateKeys: [parent.key],
    }),
    {},
  )
  assert.deepEqual(
    findStoredSourceDetailReviewFiles({
      root: f.root,
      handoffFile: path.join(f.root, "handoff.json"),
      candidateKeys: [],
    }),
    {},
  )
  fs.writeFileSync(path.join(f.root, receipt.path), "{}")
  await assert.rejects(processDailyQueue(options), /identity changed/)
  assert.equal(f.calls.length, 1)
})

test("automatic ordering uses priority, date and stable keys, never similarity", (t) => {
  const f = fixture(t)
  f.handoff.pending[2].priority = "high"
  f.handoff.pending[1].source_published_at = "2026-10-08"
  f.handoff.pending[1].title = f.handoff.pending[0].title
  assert.deepEqual(planDailyProcessingQueue(f.handoff).candidate_keys, [
    "candidate-02",
    "candidate-01",
    "candidate-00",
  ])
})

test("a native decision after planning resolves without consuming a model slot or rerunning on resume", async (t) => {
  const f = fixture(t, 2)
  const document = readJSON(f.root, "runs/source-0/documents.json")[0]
  const parse = readJSON(f.root, "runs/source-0/parses.json")[0]
  const candidate = f.handoff.pending[0]
  candidate.key = `source-${document.source_id}`
  candidate.priority = "high"
  f.save()
  atomicWrite(f.root, "runs/source-0/candidates.json", [candidate])
  await processDailyQueue(f.options)
  atomicWrite(f.root, "scope-decision.json", {
    schema: "editorial-candidate-disposition/v1",
    decision: "background_only_no_news_event",
    reviewed_at: "2026-10-08",
    reviewer: "Direct fixture reading",
    source_read: true,
    source_id: document.source_id,
    source_version_id: document.source_version_id,
    body_sha256: document.body_sha256,
    parse_id: parse.parse_id,
    source_url: candidate.source_urls[0],
    source_published_at: candidate.source_published_at,
    event_check: {
      new_product_release: false,
      new_customer_installation: false,
      new_contract_or_investment: false,
      new_measured_result: false,
      notes: "Background fixture only",
    },
    claims_not_promoted: [
      { block_id: parse.blocks[0].block_id, claim: "Original stored observation" },
    ],
    original_candidate_preserved: true,
    candidate_published: false,
    public_projection: {
      news: false,
      briefing: false,
      rss: false,
      digest: false,
      keyword_timeline: false,
      map_edge: false,
    },
  })
  await recordCandidateDisposition({
    root: f.root,
    runId: "scope-decision",
    sourceRunId: "source-0",
    reviewPath: "scope-decision.json",
    backlogFile: f.options.backlogFile,
  })
  const result = await processDailyQueue({ ...f.options, execute: true, maxItems: 1 })
  assert.deepEqual(result.counts, { pending: 0, running: 0, processed: 1, failed: 0, resolved: 1 })
  assert.equal(f.calls.length, 1)
  const resolved = result.results.find((row) => row.status === "resolved")
  assert.equal(resolved.model_calls, 0)
  await processDailyQueue({ ...f.options, execute: true, maxItems: 1 })
  assert.equal(f.calls.length, 1)
  const review = readJSON(f.root, "scope-decision.json")
  atomicWrite(f.root, "scope-decision.json", { ...review, reviewer: "changed" })
  await assert.rejects(processDailyQueue({ ...f.options, execute: true }), /native evidence/)
  assert.equal(f.calls.length, 1)
})

test("a prolific source cannot monopolize the queue; urgency and per-source recency remain", (t) => {
  const f = fixture(t, 6, ["www.a.test", "a.test", "a.test", "b.test", "c.test", "b.test"])
  f.handoff.pending[2].priority = "high"
  f.handoff.pending[3].source_published_at = "2026-10-06"
  const result = planDailyProcessingQueue(f.handoff, 4)
  assert.deepEqual(result.candidate_keys, [
    "candidate-02",
    "candidate-00",
    "candidate-04",
    "candidate-05",
  ])
  assert.equal(result.selection_summary.eligible_sources, 3)
  assert.equal(result.selection_summary.selected_sources, 3)
  assert.equal(result.selection_summary.verified_coverage, false)
  assert.deepEqual(
    result.selection_summary.sources.find((row) => row.source_host === "a.test"),
    {
      source_host: "a.test",
      eligible: 3,
      selected: 2,
    },
  )
  assert.deepEqual(
    planDailyProcessingQueue({ ...f.handoff, pending: [...f.handoff.pending].reverse() }, 4),
    result,
  )
  assert.equal(result.routed.filter((row) => row.status === "next_queue").length, 2)
})

test("source balancing never selects an identity conflict or changed source to fill a slot", (t) => {
  const f = fixture(t, 4, ["a.test", "b.test", "c.test", "d.test"])
  f.handoff.pending[1].next_route = "review-related-candidate"
  f.handoff.pending[2].source_evidence_state = "changed"
  f.handoff.pending[3] = { ...f.handoff.pending[0], key: "candidate-03" }
  const result = planDailyProcessingQueue(f.handoff)
  assert.deepEqual(result.candidate_keys, ["candidate-00"])
  assert.equal(result.selection_summary.selected_sources, 1)
  assert.deepEqual(
    result.routed.map((row) => row.status),
    ["review_required", "source_required", "same_source"],
  )
  f.handoff.pending[0].source_urls = ["file:///tmp/source"]
  assert.throws(() => planDailyProcessingQueue(f.handoff), /HTTP source URL/)
})

test("native bounded execution resumes the frozen interleaved order without repeating work", async (t) => {
  const f = fixture(t, 4, ["a.test", "a.test", "b.test", "c.test"])
  const plan = await processDailyQueue(f.options)
  assert.deepEqual(
    plan.results.map((row) => row.candidate_key),
    ["candidate-00", "candidate-02", "candidate-03", "candidate-01"],
  )
  const first = await processDailyQueue({ ...f.options, execute: true, maxItems: 2 })
  assert.equal(first.next_candidate_key, "candidate-03")
  assert.equal(first.selection_summary.selected_sources, 3)
  const last = await processDailyQueue({ ...f.options, execute: true, maxItems: 2 })
  assert.equal(last.counts.processed, 4)
  assert.equal(f.calls.length, 4)
  await processDailyQueue({ ...f.options, execute: true })
  assert.equal(f.calls.length, 4)
  assert.deepEqual(last.selection_summary, plan.selection_summary)
  assert.equal(last.candidate_published, false)
})

test("a shared source lease defers duplicate processing while another candidate advances", async (t) => {
  const f = fixture(t, 2),
    key = f.handoff.pending[0].key
  const lock = processingSourceLockName(
    f.handoff.pending[0],
    sha256(fs.readFileSync(f.options.policyFile)),
  )
  const release = acquireLock(f.root, lock)
  try {
    const waiting = await processDailyQueue({ ...f.options, execute: true, maxItems: 1 })
    assert.deepEqual(waiting.counts, { pending: 1, running: 0, processed: 1, failed: 0 })
    const row = waiting.results.find((r) => r.candidate_key === key)
    assert.equal(row.source_wait.process_observation, "alive")
    assert.equal(row.source_wait.model_calls, 0)
    assert.equal(row.source_wait.recovery_required, false)
    assert.equal(f.calls.length, 1)
  } finally {
    release()
  }
  const complete = await processDailyQueue({ ...f.options, execute: true, maxItems: 2 })
  assert.equal(complete.counts.processed, 2)
  assert.equal(f.calls.length, 2)
})

test("an unobservable stale source lease remains recovery-required without pretending to be active", async (t) => {
  const f = fixture(t, 2),
    key = f.handoff.pending[0].key
  const lock = processingSourceLockName(
    f.handoff.pending[0],
    sha256(fs.readFileSync(f.options.policyFile)),
  )
  const release = acquireLock(f.root, lock)
  try {
    const owner = readJSON(f.root, `locks/${lock}.json`)
    atomicWrite(f.root, `locks/${lock}.json`, { ...owner, pid: -1 })
    const result = await processDailyQueue({ ...f.options, execute: true })
    const wait = result.results.find((row) => row.candidate_key === key).source_wait
    assert.equal(wait.process_observation, "missing_handle")
    assert.equal(wait.recovery_required, true)
    assert.equal(result.counts.processed, 1)
    assert.equal(result.counts.failed, 0)
    assert.equal(f.calls.length, 1)
  } finally {
    release()
  }
})

test("only identical source/version/parse is deduplicated; conflicts and missing sources remain routed", (t) => {
  const f = fixture(t, 5)
  f.handoff.pending[1] = { ...f.handoff.pending[0], key: "candidate-01" }
  f.handoff.pending[2].next_route = "review-related-candidate"
  f.handoff.pending[3].source_evidence_state = "changed"
  f.handoff.pending[4].event_id = "1234567812345678"
  const result = planDailyProcessingQueue(f.handoff)
  assert.deepEqual(result.candidate_keys, ["candidate-00"])
  assert.deepEqual(
    result.routed.map((r) => r.status),
    ["same_source", "review_required", "source_required", "review_required"],
  )
  assert.equal(result.routed[0].primary_candidate_key, "candidate-00")
})

test("planning makes no processor call; bounded native execution resumes only untouched candidates", async (t) => {
  const f = fixture(t)
  const plan = await processDailyQueue(f.options)
  assert.equal(plan.counts.pending, 3)
  assert.equal(f.calls.length, 0)
  const first = await processDailyQueue({ ...f.options, execute: true, maxItems: 1 })
  assert.equal(first.status, "yielded")
  assert.deepEqual(first.counts, { pending: 2, running: 0, processed: 1, failed: 0 })
  const last = await processDailyQueue({ ...f.options, execute: true, maxItems: 2 })
  assert.equal(last.status, "review_pending")
  assert.equal(f.calls.length, 3)
  await processDailyQueue({ ...f.options, execute: true })
  assert.equal(f.calls.length, 3)
  assert.equal(last.public_approved, false)
  assert.equal(last.candidate_published, false)
  for (const row of last.results) {
    assert.equal(row.processing_status, "fact_review")
    assert.equal(readJSON(f.root, row.receipt).results[0].candidate_key, row.candidate_key)
  }
})

test("more than twelve candidates run through the existing bounded processor without truncation", async (t) => {
  const f = fixture(t, 13)
  const result = await processDailyQueue({ ...f.options, execute: true, maxItems: 13 })
  assert.equal(result.total, 13)
  assert.equal(result.counts.processed, 13)
  assert.equal(f.calls.length, 13)
})

test("a failed source never loops and does not block the next candidate", async (t) => {
  const f = fixture(t)
  const native = f.options.processor
  let failures = 0
  f.options.processor = (opts) => {
    if (opts.candidateKeys[0] === "candidate-00") {
      failures++
      throw Error("parser failure")
    }
    return native(opts)
  }
  const result = await processDailyQueue({ ...f.options, execute: true })
  assert.equal(result.status, "partial")
  assert.equal(result.counts.failed, 1)
  assert.equal(result.counts.processed, 2)
  assert.equal(result.results[0].automatic_retry, false)
  await processDailyQueue({ ...f.options, execute: true })
  assert.equal(failures, 1)
  assert.equal(f.calls.length, 2)
})

test("wall budget yields between candidates and preserves their complete output", async (t) => {
  const f = fixture(t)
  let time = 0
  const native = f.options.processor
  f.options.processor = async (opts) => {
    const value = await native(opts)
    time += 100
    return value
  }
  const first = await processDailyQueue({
    ...f.options,
    execute: true,
    clock: () => time,
    timeBudgetMs: 50,
  })
  assert.equal(first.status, "yielded")
  assert.equal(first.counts.processed, 1)
  assert.equal(first.next_candidate_key, "candidate-01")
})

test("source changes are rejected before inference while the remaining queue proceeds", async (t) => {
  const f = fixture(t)
  const loader = f.options.candidateLoader
  f.options.candidateLoader = (root, opts) => {
    if (opts.candidateKeys[0] === "candidate-00") throw Error("Frozen fact candidate changed")
    return loader(root, opts)
  }
  const result = await processDailyQueue({ ...f.options, execute: true })
  assert.equal(result.counts.failed, 1)
  assert.equal(f.calls.length, 2)
})

test("changed policy, collection or a completed native receipt cannot silently reuse work", async (t) => {
  const f = fixture(t)
  await processDailyQueue({ ...f.options, execute: true })
  const receipt = readJSON(f.root, "runs/queue/daily-queue.json")
  const child = receipt.results[0].receipt
  atomicWrite(f.root, child, { replaced: true })
  await assert.rejects(processDailyQueue({ ...f.options, execute: true }), /native receipt changed/)
  assert.equal(f.calls.length, 3)
  const g = fixture(t)
  await processDailyQueue(g.options)
  fs.writeFileSync(g.options.policyFile, '{"changed":true}')
  await assert.rejects(processDailyQueue({ ...g.options, execute: true }), /Queue inputs changed/)
  assert.equal(g.calls.length, 0)
})

test("a crash after an immutable outcome resumes without repeating its processor", async (t) => {
  const f = fixture(t)
  const first = await processDailyQueue({ ...f.options, execute: true, maxItems: 1 })
  const snapshot = readJSON(f.root, "runs/queue/daily-queue.json")
  snapshot.results[0] = {
    candidate_key: "candidate-00",
    status: "running",
    processing_run: first.results[0].processing_run,
  }
  atomicWrite(f.root, "runs/queue/daily-queue.json", snapshot)
  const last = await processDailyQueue({ ...f.options, execute: true })
  assert.equal(last.counts.processed, 3)
  assert.equal(f.calls.length, 3)
})

test("initial selection skips changed candidates before the limit; unrelated backlog updates do not rerank a resume", async (t) => {
  const f = fixture(t)
  const backlog = readJSON(f.root, "backlog.json")
  backlog.candidates[0].review_status = "verified"
  atomicWrite(f.root, "backlog.json", backlog)
  const plan = await processDailyQueue({ ...f.options, limit: 1 })
  assert.equal(plan.total, 1)
  assert.equal(plan.results[0].candidate_key, "candidate-01")
  assert.equal(
    plan.routed.find((r) => r.candidate_key === "candidate-00").status,
    "candidate_changed",
  )
  backlog.candidates[0].review_status = "unreviewed"
  backlog.candidates[2].title = "Unrelated corrected title"
  atomicWrite(f.root, "backlog.json", backlog)
  const result = await processDailyQueue({ ...f.options, limit: 1, execute: true })
  assert.equal(result.results[0].candidate_key, "candidate-01")
  assert.equal(f.calls.length, 1)
})

test("queue pins explicit recoveries, forwards only the selected key and rejects changed recipes", async (t) => {
  const f = fixture(t, 2),
    native = f.options.processor,
    seen = []
  f.options.processor = async (opts) => {
    seen.push(opts.processingRecoveries)
    return native({ ...opts, processingRecoveries: {} })
  }
  const recipes = { "candidate-00": { run: "failed-original", assessment: "partial" } }
  await processDailyQueue({ ...f.options, processingRecoveries: recipes })
  const first = await processDailyQueue({ ...f.options, execute: true, maxItems: 1 })
  assert.deepEqual(seen, [recipes])
  assert.equal(first.counts.processed, 1)
  await assert.rejects(
    processDailyQueue({
      ...f.options,
      processingRecoveries: {
        "candidate-00": { run: "different" },
      },
      execute: true,
    }),
    /Queue inputs changed/,
  )
  assert.equal(f.calls.length, 1)
  await processDailyQueue({ ...f.options, execute: true, maxItems: 1 })
  assert.deepEqual(seen[1], {})
  assert.equal(f.calls.length, 2)
  await assert.rejects(
    processDailyQueue({
      ...f.options,
      runId: "other",
      processingRecoveries: {
        missing: { run: "failed-original" },
      },
    }),
    /Recoveries must name selected/,
  )
})

test("queue rejects malformed recovery requests before starting any native processor", async (t) => {
  const f = fixture(t, 2)
  await assert.rejects(
    processDailyQueue({
      ...f.options,
      execute: true,
      processingRecoveries: {
        "candidate-01": null,
      },
    }),
    /Explicit processing recovery/,
  )
  assert.equal(f.calls.length, 0)
})
