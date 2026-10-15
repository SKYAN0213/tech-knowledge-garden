import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { advanceDailyCore, sourceRevisionImpactRequests } from "../scripts/research/daily-core.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"

// Coordination fixtures only. Native processing/editorial gates and real stored
// approvals are checked in their own tests and the live core smoke.
function fixture(t, { count = 3, complete = false, pointer = true } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "daily-core-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const basis = {
    path: "basis.json",
    sha256: atomicWrite(root, "basis.json", { daily_run: "daily" }).sha256,
  }
  if (pointer) atomicWrite(root, "daily/runs/daily/shadow-basis.json", { basis })
  const policy = path.join(root, "policy.json"),
    config = path.join(root, "config.json")
  fs.writeFileSync(policy, "{}")
  fs.writeFileSync(config, "{}")
  const keys = Array.from({ length: count }, (_, i) => "candidate-" + i),
    calls = { collection: 0, collectionOptions: [], queue: [], editorial: [], newEditorial: 0 }
  let processed = complete ? count : 0
  const options = {
    root,
    runId: "core",
    // These fixtures exercise explicitly retained legacy queue continuation.
    queueRun: "core-queue",
    dailyRunId: "daily",
    configFile: config,
    policyFile: policy,
    vault: path.join(root, "vault"),
    backlogFile: path.join(root, "backlog.json"),
    basisLoader: () => ({ daily_run: "daily" }),
    collector: async (opts) => {
      calls.collection++
      calls.collectionOptions.push(opts)
      assert.equal(opts.runId, "daily")
      return { shadow_collection_basis: basis }
    },
    queueProcessor: async (opts) => {
      calls.queue.push(opts)
      if (opts.execute) processed = Math.min(count, processed + opts.maxItems)
      const results = keys.map((key, i) => ({
        candidate_key: key,
        status: i < processed ? "processed" : "pending",
      }))
      atomicWrite(root, `runs/${opts.runId}/daily-queue-input.json`, {
        candidate_keys: keys,
        collection_basis: basis,
        limit: opts.limit,
      })
      const receipt = {
        run_id: opts.runId,
        daily_run: "daily",
        status: processed < count ? "yielded" : "review_pending",
        candidate_published: false,
        counts: { processed, pending: count - processed, failed: 0 },
        results,
        routed: [],
        selection_summary: {
          strategy: "priority-source-round-robin/v1",
          eligible_sources: 2,
          selected_sources: 2,
          sources: [],
          verified_coverage: false,
        },
        next_candidate_key: processed < count ? keys[processed] : null,
      }
      atomicWrite(root, `runs/${opts.runId}/daily-queue.json`, receipt)
      return receipt
    },
    editorialProcessor: async (opts) => {
      calls.editorial.push(opts)
      const file = `runs/${opts.runId}/queue-editorial/latest.json`,
        old = readJSON(root, file)
      const byKey = new Map((old?.results || []).map((row) => [row.candidate_key, row]))
      let attempted = 0
      for (const key of opts.candidateKeys)
        if ((!byKey.has(key) || byKey.get(key).status === "pending") && attempted < opts.maxItems) {
          attempted++
          calls.newEditorial++
          byKey.set(key, {
            candidate_key: key,
            status: "fact_review",
            native_receipt: { sha256: sha256(key) },
          })
        }
      const results = opts.candidateKeys.map(
        (key) => byKey.get(key) || { candidate_key: key, status: "pending" },
      )
      atomicWrite(root, `runs/${opts.runId}/queue-editorial/input.json`, {})
      const receipt = {
        run_id: opts.runId,
        candidate_published: false,
        status: results.some((row) => row.status === "pending") ? "yielded" : "review_pending",
        results,
        counts: {
          fact_review: results.filter((row) => row.status === "fact_review").length,
          pending: results.filter((row) => row.status === "pending").length,
        },
      }
      atomicWrite(root, file, receipt)
      return receipt
    },
  }
  return { root, options, calls, keys, basis }
}

function sourceImpactFixture(t) {
  const f = fixture(t)
  const version = "source:prior-version"
  const input = {
    article: { event_id: "1111111111111111", title: "Prior approved article" },
    documents: [{ source_version_id: version }],
    file_hashes: { "approved-article.json": "a".repeat(64) },
  }
  const candidate = {
    key: "candidate-0",
    event_id: input.article.event_id,
    approval: {
      approved_run: "prior-approved",
      article_sha256: sha256(JSON.stringify(input.article)),
      source_version_id: version,
    },
    source_revision_alert: { reviewed_source_version_id: version },
  }
  const observation = atomicWrite(f.root, "runs/current-source/documents.json", { changed: true })
  const receipt = {
    schema: "research-queue-source-revision/v1",
    candidate_key: candidate.key,
    candidate_sha256: sha256(JSON.stringify(candidate)),
    candidate,
    prior_approval: {
      decision: "same_approved_event",
      approved_run: candidate.approval.approved_run,
      event_id: candidate.event_id,
      article_sha256: candidate.approval.article_sha256,
      approved_files: input.file_hashes,
    },
    current_source_files: { "runs/current-source/documents.json": observation.sha256 },
  }
  const row = {
    candidate_key: candidate.key,
    status: "source_review",
    source_revision: { candidate_sha256: receipt.candidate_sha256 },
    native_receipt: {
      path: "revision.json",
      sha256: atomicWrite(f.root, "revision.json", receipt).sha256,
    },
  }
  return { ...f, input, row, receipt, version, options: { inputLoader: () => input } }
}

test("source revision impacts select the approved original and ignore supplementary reading", (t) => {
  const f = sourceImpactFixture(t)
  const requests = sourceRevisionImpactRequests(
    f.root,
    [
      f.row,
      {
        status: "source_review",
        source_review: { source_version_id: "supplementary:source" },
      },
    ],
    f.options,
  )
  assert.deepEqual(requests, [
    {
      candidate_key: "candidate-0",
      source_revision_receipt: f.row.native_receipt,
      query: { source_version_id: f.version },
    },
  ])
  assert.deepEqual(sourceRevisionImpactRequests(f.root, [], f.options), [])
})

test("source revision impacts reject changed native receipts and source observations", (t) => {
  const f = sourceImpactFixture(t)
  atomicWrite(f.root, "revision.json", { ...f.receipt, candidate_key: "other" })
  assert.throws(() => sourceRevisionImpactRequests(f.root, [f.row], f.options), /reference changed/)
  atomicWrite(f.root, "revision.json", f.receipt)
  atomicWrite(f.root, "runs/current-source/documents.json", { changed: "again" })
  assert.throws(
    () => sourceRevisionImpactRequests(f.root, [f.row], f.options),
    /observation changed/,
  )
})

test("source revision impacts reject a different approved article or frozen candidate", (t) => {
  const f = sourceImpactFixture(t)
  const input = structuredClone(f.input)
  input.article.title = "Different approved article"
  assert.throws(
    () =>
      sourceRevisionImpactRequests(f.root, [f.row], {
        inputLoader: () => input,
      }),
    /native prior approval/,
  )
  assert.throws(
    () =>
      sourceRevisionImpactRequests(
        f.root,
        [
          {
            ...f.row,
            source_revision: { candidate_sha256: "b".repeat(64) },
          },
        ],
        f.options,
      ),
    /Exact native source revision/,
  )
})

test("bounded collection hands its partial native basis directly to processing and editorial", async (t) => {
  const f = fixture(t, { pointer: false, count: 1 })
  const result = await advanceDailyCore({
    ...f.options,
    collect: true,
    execute: true,
    collectionMaxWindows: 2,
    collectionTimeBudgetMs: 120000,
    collector: async (options) => {
      await f.options.collector(options)
      return { status: "partial", shadow_collection_basis: f.basis }
    },
  })
  assert.equal(f.calls.collectionOptions[0].maxWindows, 2)
  assert.equal(f.calls.collectionOptions[0].timeBudgetMs, 120000)
  assert.equal(f.calls.queue[0].collectionBasis, f.basis.path)
  assert.equal(result.collection_reused, false)
  assert.equal(result.processing_counts.processed, 1)
  assert.equal(result.editorial_counts.fact_review, 1)
  assert.equal(result.candidate_published, false)
  assert.equal(result.new_regular_operation_counted, false)
  await advanceDailyCore({
    ...f.options,
    collect: true,
    execute: true,
    collectionMaxWindows: 1,
    collectionTimeBudgetMs: 1000,
  })
  assert.equal(f.calls.collection, 1)
})

test("invalid collection limits fail before state writes, collection or processing", async (t) => {
  const f = fixture(t, { pointer: false })
  for (const overrides of [
    { collectionMaxWindows: 0 },
    { collectionMaxWindows: -1 },
    { collectionMaxWindows: 1.5 },
    { collectionTimeBudgetMs: NaN },
    { collectionTimeBudgetMs: Infinity },
    { collectionTimeBudgetMs: Number.MAX_SAFE_INTEGER + 1 },
    { collectionMaxWindows: 1, collect: false },
    { collectionTimeBudgetMs: 1, execute: false },
  ])
    await assert.rejects(
      advanceDailyCore({ ...f.options, collect: true, execute: true, ...overrides }),
      /Collection limits/,
    )
  assert.equal(f.calls.collection, 0)
  assert.equal(f.calls.queue.length, 0)
  assert.equal(fs.existsSync(path.join(f.root, "runs/core/daily-core/request.json")), false)
})

test("core forwards an explicit deep review only to its selected candidate", async (t) => {
  const f = fixture(t, { count: 2, complete: true })
  const file = path.join(f.root, "deep.json")
  fs.writeFileSync(
    file,
    JSON.stringify({
      input: {
        schema: "deep-dive-input/v1",
        kind: "기업 전략",
        topic_ids: ["strategy"],
        event_claim_ids: ["fact-1"],
        basis: ["goal", "allocation", "comparison"].map((role) => ({
          role,
          claim_ids: ["fact-1"],
        })),
        sources: [
          {
            source_version_id: "source:version",
            organization_id: "company",
            organization_kind: "company",
            scope: "full_document",
          },
        ],
        papers: [],
        relations: [],
      },
      review: {
        reviewer: "orchestration fixture",
        reviewed_at: new Date().toISOString(),
        source_read: true,
        source_roles_checked: true,
        basis_checked: true,
        identities_checked: true,
        scope_checked: true,
      },
    }),
  )
  await advanceDailyCore({
    ...f.options,
    execute: true,
    maxItems: 2,
    deepReviewFiles: { [f.keys[1]]: file },
  })
  assert.ok(f.calls.editorial.length > 0)
  const delivered = f.calls.editorial.flatMap((call) => Object.entries(call.deepReviewFiles))
  assert.deepEqual(delivered, [[f.keys[1], file]])
})

test("core rejects malformed deep input before collection or model work", async (t) => {
  const f = fixture(t)
  const file = path.join(f.root, "deep.json")
  fs.writeFileSync(file, "{}")
  await assert.rejects(
    advanceDailyCore({
      ...f.options,
      execute: true,
      collect: true,
      deepReviewFiles: { [f.keys[0]]: file },
    }),
  )
  assert.equal(f.calls.collection, 0)
  assert.deepEqual(f.calls.queue, [])
  assert.deepEqual(f.calls.editorial, [])
})

test("core rejects malformed specialist inputs before collection or model work", async (t) => {
  const f = fixture(t)
  for (const knowledgeInputFiles of [[], null, { "../unsafe": "missing.json" }]) {
    await assert.rejects(
      advanceDailyCore({ ...f.options, execute: true, collect: true, knowledgeInputFiles }),
    )
  }
  for (const knowledgeSelections of [
    null,
    {},
    [{ run: "../unsafe", path: "Knowledge/X.md", sha256: "x" }],
  ]) {
    await assert.rejects(
      advanceDailyCore({ ...f.options, execute: true, collect: true, knowledgeSelections }),
      /knowledge note approval selections/,
    )
  }
  assert.equal(f.calls.collection, 0)
  assert.deepEqual(f.calls.queue, [])
  assert.deepEqual(f.calls.editorial, [])
})

test("core reports unresolved source detail without promoting it to editorial or completion", async (t) => {
  const f = fixture(t, { count: 1 })
  const file = "followups/detail-review.json"
  atomicWrite(f.root, file, { schema: "test-private-source-review" })
  const result = await advanceDailyCore({
    ...f.options,
    execute: true,
    sourceReviewFiles: { [f.keys[0]]: file },
    queueProcessor: async (options) => {
      assert.deepEqual(options.sourceReviewFiles, { [f.keys[0]]: file })
      const queue = {
        run_id: options.runId,
        daily_run: "daily",
        status: "source_review_pending",
        candidate_published: false,
        counts: { processed: 0, pending: 0, failed: 0, source_review: 1 },
        results: [{ candidate_key: f.keys[0], status: "source_review", model_calls: 0 }],
        routed: [],
        next_candidate_key: null,
      }
      atomicWrite(f.root, `runs/${options.runId}/daily-queue.json`, queue)
      return queue
    },
  })
  assert.equal(result.status, "source_review_pending")
  assert.equal(result.processing_counts.source_review, 1)
  assert.equal(f.calls.editorial.length, 0)
})

test("core coordinates the stored collection and reuses frozen input even when the latest pointer changes", async (t) => {
  const f = fixture(t)
  const first = await advanceDailyCore({ ...f.options, execute: true, maxItems: 1 })
  assert.equal(first.status, "yielded")
  assert.equal(first.processing_counts.processed, 1)
  assert.equal(first.editorial_counts.fact_review, 1)
  assert.equal(first.source_selection.selected_sources, 2)
  assert.equal(first.source_selection.verified_coverage, false)
  assert.equal(f.calls.collection, 0)
  atomicWrite(f.root, "daily/runs/daily/shadow-basis.json", {
    basis: { path: "wrong.json", sha256: "changed" },
  })
  const second = await advanceDailyCore({ ...f.options, execute: true, maxItems: 2 })
  assert.equal(second.processing_counts.processed, 3)
  assert.equal(second.collection_basis.sha256, f.basis.sha256)
  assert.equal(second.candidate_published, false)
  const before = f.calls.newEditorial
  await advanceDailyCore({ ...f.options, execute: true, maxItems: 4 })
  const replay = await advanceDailyCore({ ...f.options, execute: true, maxItems: 4 })
  assert.equal(f.calls.newEditorial, before + 1)
  assert.equal(replay.status, "review_pending")
  assert.equal(f.calls.collection, 0)
})

test("core collects only on explicit request and resumes without collection calls", async (t) => {
  const f = fixture(t, { pointer: false })
  await assert.rejects(
    advanceDailyCore({ ...f.options, execute: true }),
    /Completed collection basis/,
  )
  assert.equal(f.calls.collection, 0)
  await advanceDailyCore({ ...f.options, collect: true, execute: true })
  assert.equal(f.calls.collection, 1)
  await advanceDailyCore({ ...f.options, collect: true, execute: true })
  assert.equal(f.calls.collection, 1)
})

test("all explicitly resolved candidates finish without an editorial call", async (t) => {
  const f = fixture(t, { count: 1 })
  const native = f.options.queueProcessor
  f.options.queueProcessor = async (options) => {
    const result = await native(options)
    result.status = "resolved"
    result.counts = { processed: 0, pending: 0, failed: 0, resolved: 1 }
    result.results[0].status = "resolved"
    atomicWrite(f.root, `runs/${options.runId}/daily-queue.json`, result)
    return result
  }
  const result = await advanceDailyCore({ ...f.options, execute: true })
  assert.equal(result.status, "resolved")
  assert.equal(result.processing_counts.resolved, 1)
  assert.equal(f.calls.editorial.length, 0)
  assert.equal(result.candidate_published, false)
})

test("core does not spend writer budget on editorial approval reuse or report it as publishable", async (t) => {
  const f = fixture(t, { count: 41, complete: true })
  const ordinary = f.options.editorialProcessor
  const options = {
    ...f.options,
    execute: true,
    limit: 50,
    maxItems: 1,
    editorialProcessor: async (opts) => {
      if (opts.candidateKeys.length < 40) return ordinary(opts)
      f.calls.editorial.push(opts)
      const results = opts.candidateKeys.map((key) => ({
        candidate_key: key,
        status: "resolved",
        model_calls: 0,
      }))
      const receipt = {
        run_id: opts.runId,
        status: "resolved",
        candidate_published: false,
        counts: { resolved: results.length },
        results,
      }
      atomicWrite(f.root, `runs/${opts.runId}/queue-editorial/latest.json`, receipt)
      return receipt
    },
  }
  const result = await advanceDailyCore(options)
  assert.equal(f.calls.editorial.length, 2)
  assert.equal(f.calls.editorial[1].maxItems, 1)
  assert.deepEqual(result.editorial_counts, { resolved: 40, fact_review: 1 })
  assert.equal(result.status, "review_pending")
  assert.equal(result.candidate_published, false)
  const resolved = fixture(t, { count: 1, complete: true })
  const final = await advanceDailyCore({
    ...resolved.options,
    execute: true,
    editorialProcessor: async (opts) => {
      const receipt = {
        run_id: opts.runId,
        status: "resolved",
        candidate_published: false,
        counts: { resolved: 1 },
        results: [{ candidate_key: resolved.keys[0], status: "resolved", model_calls: 0 }],
      }
      atomicWrite(resolved.root, `runs/${opts.runId}/queue-editorial/latest.json`, receipt)
      return receipt
    },
  })
  assert.equal(final.status, "resolved")
  assert.equal(final.new_regular_operation_counted, false)
})

test("source revision routing keeps the writer budget available for the next batch", async (t) => {
  const f = fixture(t, { count: 41, complete: true })
  const ordinary = f.options.editorialProcessor
  const result = await advanceDailyCore({
    ...f.options,
    execute: true,
    limit: 50,
    maxItems: 1,
    editorialProcessor: async (opts) => {
      if (opts.candidateKeys.length < 40) return ordinary(opts)
      f.calls.editorial.push(opts)
      const receipt = {
        run_id: opts.runId,
        status: "source_review_pending",
        candidate_published: false,
        counts: { source_review: opts.candidateKeys.length },
        results: opts.candidateKeys.map((key) => ({
          candidate_key: key,
          status: "source_review",
          model_calls: 0,
        })),
      }
      atomicWrite(f.root, `runs/${opts.runId}/queue-editorial/latest.json`, receipt)
      return receipt
    },
  })
  assert.equal(f.calls.editorial.length, 2)
  assert.equal(f.calls.editorial[1].maxItems, 1)
  assert.equal(result.status, "source_review_pending")
  assert.equal(result.candidate_published, false)
  assert.deepEqual(result.editorial_counts, { source_review: 40, fact_review: 1 })
})

test("completed editorial batches do not starve later batches in a queue larger than forty", async (t) => {
  const f = fixture(t, { count: 43, complete: true })
  for (let i = 0; i < 15; i++)
    await advanceDailyCore({ ...f.options, execute: true, limit: 50, maxItems: 4 })
  const last = await advanceDailyCore({ ...f.options, execute: true, limit: 50, maxItems: 4 })
  assert.equal(f.calls.newEditorial, 43)
  assert.equal(last.editorial_counts.fact_review, 43)
  assert.equal(last.editorial_batches.length, 2)
  assert.equal(last.status, "review_pending")
})

test("invalid reviews and changed frozen inputs fail before expensive native processing", async (t) => {
  const f = fixture(t)
  await assert.rejects(
    advanceDailyCore({
      ...f.options,
      execute: true,
      reviewFiles: { [f.keys[0]]: path.join(f.root, "missing.json") },
    }),
    /ENOENT/,
  )
  assert.equal(f.calls.queue.length, 0)
  const file = path.join(f.root, "review.json")
  fs.writeFileSync(file, "{}")
  await assert.rejects(
    advanceDailyCore({ ...f.options, execute: true, reviewFiles: { wrong: file } }),
    /outside its frozen queue/,
  )
  assert.ok(f.calls.queue.every((call) => !call.execute))
  await advanceDailyCore({ ...f.options, execute: true })
  fs.writeFileSync(f.options.policyFile, "changed")
  const before = f.calls.queue.length
  await assert.rejects(advanceDailyCore({ ...f.options, execute: true }), /request changed/)
  assert.equal(f.calls.queue.length, before)
})

test("unexpected native failure is recorded with its stage and never reported as a running success", async (t) => {
  const f = fixture(t)
  await assert.rejects(
    advanceDailyCore({
      ...f.options,
      execute: true,
      queueProcessor: async () => {
        throw Error("native mismatch")
      },
    }),
    /native mismatch/,
  )
  const receipt = readJSON(f.root, "runs/core/daily-core/latest.json")
  assert.equal(receipt.status, "failed")
  assert.equal(receipt.failed_stage, "processing")
  assert.equal(receipt.automatic_retry, false)
})

test("processing budget exhaustion retains prior editorial evidence for the next resume", async (t) => {
  const f = fixture(t, { count: 3, complete: true })
  const first = await advanceDailyCore({ ...f.options, execute: true, maxItems: 2 })
  let elapsed = 0
  const stopped = await advanceDailyCore({
    ...f.options,
    execute: true,
    clock: () => elapsed,
    timeBudgetMs: 10,
    queueProcessor: async (options) => {
      const result = await f.options.queueProcessor(options)
      elapsed += 20
      return result
    },
  })
  assert.equal(stopped.status, "yielded")
  assert.deepEqual(stopped.editorial_batches, first.editorial_batches)
  assert.deepEqual(stopped.editorial_counts, first.editorial_counts)
  const next = await advanceDailyCore({ ...f.options, execute: true })
  assert.equal(next.editorial_counts.fact_review, 3)
  assert.equal(next.status, "review_pending")
})

test("editorial-only continuation leaves the source processing frontier unchanged", async (t) => {
  const f = fixture(t)
  const first = await advanceDailyCore({ ...f.options, execute: true, maxItems: 1 })
  const next = await advanceDailyCore({ ...f.options, execute: true, editorialOnly: true })
  assert.deepEqual(next.processing_counts, first.processing_counts)
  assert.equal(f.calls.queue.at(-1).execute, false)
  assert.equal(f.calls.queue.at(-1).readOnly, true)
  assert.equal(next.editorial_counts.fact_review, 1)
})

test("explicit reviewed work reaches editorial before raw processing exhausts the budget", async (t) => {
  const f = fixture(t)
  await advanceDailyCore({ ...f.options, execute: true, maxItems: 1 })
  const file = path.join(f.root, "review.json")
  fs.writeFileSync(file, "{}")
  let elapsed = 0
  const order = []
  const result = await advanceDailyCore({
    ...f.options,
    execute: true,
    maxItems: 2,
    timeBudgetMs: 10,
    clock: () => elapsed,
    reviewFiles: { [f.keys[0]]: file },
    queueProcessor: async (options) => {
      order.push(options.execute ? "raw" : "stored-queue")
      if (options.execute) elapsed += 20
      return f.options.queueProcessor(options)
    },
    editorialProcessor: async (options) => {
      order.push("editorial")
      assert.equal(options.reviewFiles[f.keys[0]], file)
      const receipt = await f.options.editorialProcessor(options)
      elapsed += 20
      return receipt
    },
  })
  assert.deepEqual(order, ["stored-queue", "editorial"])
  assert.equal(result.processing_counts.processed, 1)
  assert.equal(result.editorial_counts.fact_review, 1)
  assert.equal(result.status, "yielded")
})

test("cached reviewed work leaves remaining slots for raw and yields its new editorial frontier", async (t) => {
  const f = fixture(t)
  await advanceDailyCore({ ...f.options, execute: true, maxItems: 1 })
  const file = path.join(f.root, "review.json")
  fs.writeFileSync(file, "{}")
  const order = []
  const result = await advanceDailyCore({
    ...f.options,
    execute: true,
    maxItems: 1,
    reviewFiles: { [f.keys[0]]: file },
    queueProcessor: async (options) => {
      order.push(options.execute ? "raw" : "stored-queue")
      return f.options.queueProcessor(options)
    },
    editorialProcessor: async (options) => {
      order.push("editorial")
      return f.options.editorialProcessor(options)
    },
  })
  assert.deepEqual(order, ["stored-queue", "editorial", "raw"])
  assert.equal(result.processing_counts.processed, 2)
  assert.equal(result.editorial_counts.fact_review, 1)
  assert.equal(result.status, "yielded")
  assert.equal(result.candidate_published, false)
  const next = await advanceDailyCore({ ...f.options, execute: true, editorialOnly: true })
  assert.equal(next.editorial_counts.fact_review, 2)
})

test("core forwards explicit recovery recipes through the common queue without extra collection", async (t) => {
  const f = fixture(t),
    recipes = { "candidate-0": { run: "failed-original", assessment: "partial" } }
  await advanceDailyCore({
    ...f.options,
    processingRecoveries: recipes,
    execute: true,
    maxItems: 1,
  })
  assert.deepEqual(f.calls.queue[0].processingRecoveries, recipes)
  assert.equal(f.calls.collection, 0)
  await assert.rejects(
    advanceDailyCore({
      ...f.options,
      runId: "invalid",
      collect: true,
      processingRecoveries: { "candidate-0": null },
      execute: true,
    }),
    /Explicit processing recovery/,
  )
  assert.equal(f.calls.collection, 0)
})

test("core freezes company identity review and rejects unreadable or changed input before work", async (t) => {
  const f = fixture(t, { count: 1, complete: true })
  const file = path.join(f.root, "company-review.json")
  const review = {
    schema: "research-company-identity-review/v1",
    reviewer: "test",
    reviewed_at: "2026-09-21",
    companies: [
      {
        company_id: "a-company",
        label: "A Corp",
        kind: "company",
        assignments: [
          {
            run: "approved",
            event_id: "1111111111111111",
            approval_files_sha256: "a".repeat(64),
            entity_label: "A Corp",
            source_names: ["A Corp"],
            claim_ids: ["claim-1"],
            as_of: "2026-09-20",
            identity_checked: true,
            kind_checked: true,
            reason: "Explicit identity checked.",
          },
        ],
      },
    ],
  }
  await assert.rejects(advanceDailyCore({ ...f.options, companyReviewFile: file }), /ENOENT/)
  assert.equal(f.calls.queue.length, 0)
  fs.writeFileSync(file, JSON.stringify(review))
  await advanceDailyCore({ ...f.options, companyReviewFile: file })
  const request = readJSON(f.root, "runs/core/daily-core/request.json")
  assert.equal(request.company_review.sha256, sha256(fs.readFileSync(file)))
  assert.equal(request.company_review.path, file)
  const calls = f.calls.queue.length
  review.reviewer = "different-reviewer"
  fs.writeFileSync(file, JSON.stringify(review))
  await assert.rejects(
    advanceDailyCore({ ...f.options, companyReviewFile: file }),
    /request changed/,
  )
  assert.equal(f.calls.queue.length, calls, "no repeated queue work after review input changed")
})

test("core reports late editorial source detail while preserving completed processing counts", async (t) => {
  const f = fixture(t, { count: 2, complete: true })
  const result = await advanceDailyCore({
    ...f.options,
    execute: true,
    maxItems: 2,
    editorialProcessor: async (options) => {
      const receipt = await f.options.editorialProcessor(options)
      receipt.results[0].status = "source_review"
      receipt.results[0].model_calls = 0
      receipt.status = "source_review_pending"
      receipt.counts = { source_review: 1, fact_review: 1 }
      atomicWrite(f.root, `runs/${options.runId}/queue-editorial/latest.json`, receipt)
      return receipt
    },
  })
  assert.equal(result.status, "source_review_pending")
  assert.equal(result.processing_counts.processed, 2)
  assert.equal(result.editorial_counts.source_review, 1)
  assert.equal(result.candidate_published, false)
  assert.equal(f.calls.collection, 0)
})
