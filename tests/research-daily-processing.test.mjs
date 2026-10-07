import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { processDailyCandidates } from "../scripts/research/daily-processing.mjs"
import { articleContentFingerprint, loadStoredSourceRun } from "../scripts/research/parser.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { extractionCandidateKey } from "../scripts/research/claims.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { loadDailyProcessingStatus } from "../scripts/research/daily-processing-status.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "daily-processing-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const handoff = { schema: "research-editorial-handoff/v1", daily_run: "daily", pending: [] }
  for (let i = 0; i < 2; i++) {
    const url = `https://example.org/article-${i}`,
      text = `Original article ${i}`,
      source_id = sourceId(url),
      hash = sha256(text),
      parse_id = sha256("parse" + i),
      version = source_id + ":" + hash
    const document = {
      source_id,
      source_version_id: version,
      original_url: url,
      final_url: url,
      body_sha256: hash,
      body_path: `documents/${source_id}/${hash}/body.bin`,
      fetch_status: "captured",
      observed_at: "2026-10-04T00:00:00Z",
    }
    const parse = {
      schema_version: "source-parse/v1",
      source_id,
      source_version_id: version,
      parse_id,
      title: `Article ${i}`,
      status: "extracted",
      dates: { published_at: "2026-10-02", observed_at: document.observed_at },
      blocks: [{ block_id: parse_id + ":b1", text, locator: { text_hash: hash } }],
      quality: { missing_pages: [] },
    }
    atomicWrite(root, document.body_path, text)
    atomicWrite(root, `parses/${parse_id}/parse.json`, parse)
    atomicWrite(root, `runs/source-${i}/documents.json`, [document])
    atomicWrite(root, `runs/source-${i}/parses.json`, [parse])
    const content = articleContentFingerprint(parse)
    handoff.pending.push({
      key: `candidate-${i}`,
      next_route: "historical-review",
      event_id: null,
      source_evidence_state: "exact",
      source_urls: [url],
      article_source_version_id: version,
      article_parse_id: parse_id,
      article_content_sha256: content,
      source_attempts: [
        {
          attempt_id: `source-${i}`,
          article_source_version_id: version,
          article_parse_id: parse_id,
          article_content_sha256: content,
        },
      ],
    })
  }
  atomicWrite(root, "handoff.json", handoff)
  const policyFile = path.join(root, "policy.json")
  fs.writeFileSync(policyFile, "{}")
  const calls = [],
    processor = async (options) => {
      calls.push(options)
      return {
        status: options.reviewFile ? "editorial_review" : "fact_review",
        candidate_published: false,
      }
    }
  const options = {
    root,
    runId: "batch",
    dailyRunId: "daily",
    candidateKeys: ["candidate-0", "candidate-1"],
    policyFile,
    processor,
    handoffLoader: async () => ({ path: "handoff.json", value: readJSON(root, "handoff.json") }),
  }
  return { root, handoff, options, calls }
}

test("frozen collection cannot be combined with review or approval reuse inputs", async (t) => {
  const f = fixture(t)
  for (const extra of [
    { reviewFiles: { "candidate-0": "review.json" } },
    { processingRuns: { "candidate-0": "approved" } },
  ]) {
    await assert.rejects(
      processDailyCandidates({ ...f.options, collectionBasis: "basis.json", ...extra }),
      /fact extraction/,
    )
  }
  assert.equal(f.calls.length, 0)
})

test("legacy verified events require identity review before model processing", async (t) => {
  const f = fixture(t)
  f.handoff.pending[0].review_status = "verified"
  f.handoff.pending[0].event_id = "a0c307de02d0e03b"
  atomicWrite(f.root, "handoff.json", f.handoff)
  const result = await processDailyCandidates({ ...f.options, execute: true })
  assert.equal(result.results[0].status, "identity_review")
  assert.equal(result.results[1].status, "fact_review")
  assert.equal(f.calls.length, 1)
  assert.equal(
    readJSON(f.root, `runs/${result.results[0].processing_run}/source-processing-input.json`),
    null,
  )
})

test("planning never invokes a model or writes selections; execution links exact sources", async (t) => {
  const f = fixture(t)
  const plan = await processDailyCandidates(f.options)
  assert.equal(plan.status, "planned")
  assert.deepEqual(plan.counts, { ready: 2 })
  assert.equal(f.calls.length, 0)
  assert.equal(readJSON(f.root, `runs/${plan.results[0].source_run}/documents.json`), null)
  const run = await processDailyCandidates({ ...f.options, execute: true })
  assert.equal(run.status, "review_pending")
  assert.deepEqual(run.counts, { fact_review: 2 })
  assert.equal(f.calls.length, 2)
  assert.equal(run.candidate_published, false)
  for (const row of run.results)
    assert.equal(
      readJSON(f.root, `runs/${row.source_run}/source-selection.json`).candidate_key,
      row.candidate_key,
    )
})

test("publication-time review permits exact source fact processing without approving or inventing a time", async (t) => {
  const f = fixture(t)
  f.handoff.pending[0].next_route = "review-publication-time"
  f.handoff.pending[0].source_published_at = "2026-10-02"
  f.options.candidateKeys = ["candidate-0"]
  atomicWrite(f.root, "handoff.json", f.handoff)
  const result = await processDailyCandidates({ ...f.options, execute: true })
  assert.equal(f.calls.length, 1)
  assert.equal(result.results[0].status, "fact_review")
  assert.equal(result.results[0].next_route, "review-publication-time")
  assert.equal(result.candidate_published, false)
  assert.equal(result.public_approved, false)
  const selected = readJSON(f.root, `runs/${result.results[0].source_run}/parses.json`)
  assert.equal(selected[0].dates.published_at, "2026-10-02")
  assert.equal(
    readJSON(f.root, `runs/${result.results[0].processing_run}/approved-article.json`),
    null,
  )
})

test("one failed item is preserved while the next proceeds; resume does not retry it", async (t) => {
  const f = fixture(t)
  f.options.processor = async (opts) => {
    f.calls.push(opts)
    if (opts.sourceRun.includes(sha256("candidate-0").slice(0, 12)))
      throw Error("real processor failure")
    return { status: "fact_review" }
  }
  const first = await processDailyCandidates({ ...f.options, execute: true })
  assert.deepEqual(first.counts, { failed: 1, fact_review: 1 })
  assert.equal(first.status, "partial")
  await processDailyCandidates({ ...f.options, execute: true })
  assert.equal(f.calls.length, 3)
  assert.equal(
    readJSON(f.root, `runs/batch/failures/${sha256("candidate-0")}.json`).automatic_retry,
    false,
  )
})

test("identity, missing source and already approved items are routed without inference", async (t) => {
  const f = fixture(t)
  f.handoff.pending[0].next_route = "review-related-candidate"
  f.handoff.pending[1].source_evidence_state = "not_observed"
  atomicWrite(f.root, "handoff.json", f.handoff)
  const r = await processDailyCandidates({ ...f.options, execute: true })
  assert.deepEqual(r.counts, { identity_review: 1, source_required: 1 })
  assert.equal(f.calls.length, 0)
  const g = fixture(t)
  g.handoff.pending[0].next_route = "approved-historical"
  atomicWrite(g.root, "handoff.json", g.handoff)
  const approved = await processDailyCandidates({ ...g.options, execute: true })
  assert.equal(approved.counts.approval_ready, 1)
  assert.equal(g.calls.length, 1)
})

test("identical exact source is processed once without declaring same-event approval", async (t) => {
  const f = fixture(t)
  f.handoff.pending[1] = { ...f.handoff.pending[0], key: "candidate-1" }
  atomicWrite(f.root, "handoff.json", f.handoff)
  const r = await processDailyCandidates({ ...f.options, execute: true })
  assert.deepEqual(r.counts, { fact_review: 1, same_source: 1 })
  assert.equal(f.calls.length, 1)
  assert.equal(r.results[1].primary_candidate_key, "candidate-0")
  assert.equal(r.public_approved, false)
})

test("policy or candidate evidence changes require a new processing run", async (t) => {
  const f = fixture(t)
  await processDailyCandidates(f.options)
  fs.writeFileSync(f.options.policyFile, '{"changed":true}')
  await assert.rejects(
    () => processDailyCandidates({ ...f.options, execute: true }),
    /inputs changed/,
  )
  assert.equal(f.calls.length, 0)
})

test("explicit per-candidate review paths continue through the common processor", async (t) => {
  const f = fixture(t)
  await processDailyCandidates({ ...f.options, execute: true })
  const r = await processDailyCandidates({
    ...f.options,
    execute: true,
    reviewFiles: { "candidate-1": "explicit.json" },
  })
  assert.deepEqual(r.counts, { fact_review: 1, editorial_review: 1 })
  assert.equal(f.calls.at(-1).reviewFile, "explicit.json")
  const planned = await processDailyCandidates(f.options)
  assert.equal(planned.results[1].result.status, "editorial_review")
})

test("unrelated handoff changes retain the pinned exact selection context", async (t) => {
  const f = fixture(t)
  await processDailyCandidates({ ...f.options, execute: true })
  const fresh = structuredClone(f.handoff)
  fresh.unrelated_updated = true
  atomicWrite(f.root, "new-handoff.json", fresh)
  const r = await processDailyCandidates({
    ...f.options,
    execute: true,
    handoffLoader: async () => ({ path: "new-handoff.json", value: fresh }),
  })
  assert.equal(r.counts.fact_review, 2)
  const ref = readJSON(f.root, `runs/${r.results[0].source_run}/source-selection.json`)
  assert.equal(ref.handoff_path, "handoff.json")
})

test("invalid keys, missing candidates and review paths fail before inference", async (t) => {
  const f = fixture(t)
  await assert.rejects(
    () => processDailyCandidates({ ...f.options, candidateKeys: ["candidate-0", "candidate-0"] }),
    /unique candidate/,
  )
  await assert.rejects(
    () => processDailyCandidates({ ...f.options, candidateKeys: ["absent"] }),
    /uniquely pending/,
  )
  await assert.rejects(
    () => processDailyCandidates({ ...f.options, reviewFiles: { absent: "file.json" } }),
    /unique candidate/,
  )
  assert.equal(f.calls.length, 0)
})

test("read-only processing status distinguishes source, review and a live model", async (t) => {
  const f = fixture(t)
  await processDailyCandidates(f.options)
  assert.deepEqual(loadDailyProcessingStatus(f.root).runs[0].counts, { ready: 2 })
  await processDailyCandidates({ ...f.options, execute: true })
  const value = readJSON(f.root, "runs/batch/daily-processing.json")
  value.status = "running"
  value.results[0].status = "running"
  value.counts = { running: 1, fact_review: 1 }
  atomicWrite(f.root, "runs/batch/daily-processing.json", value)
  atomicWrite(f.root, "locks/daily-processing-batch.json", { pid: 123 })
  const child = value.results[0].processing_run
  atomicWrite(f.root, `runs/${child}/processing/state.json`, {
    stages: { assessment: { status: "running" } },
  })
  atomicWrite(f.root, `runs/${child}/model-policy/evidence_compare/budget.json`, {
    attempts: [{ id: "attempt", status: "running" }],
  })
  atomicWrite(f.root, `runs/${child}/model-policy/evidence_compare/progress/attempt.json`, {
    status: "generating",
    frames: 21,
    elapsed_ms: 50,
    content_chars: 10,
  })
  const result = loadDailyProcessingStatus(f.root, { processState: () => "alive" }).runs[0]
  assert.equal(result.live_process, "alive")
  assert.equal(result.results[0].phase, "assessment")
  assert.equal(result.results[0].progress.frames, 21)
  assert.equal(result.results[0].implementation_status, "unrecorded")
  atomicWrite(f.root, `runs/${child}/source-processing-input.json`, {
    implementation: { "claims.mjs": "0".repeat(64) },
  })
  assert.equal(
    loadDailyProcessingStatus(f.root, { processState: () => "alive" }).runs[0].results[0]
      .implementation_status,
    "changed",
  )
  const invalid = structuredClone(value)
  invalid.counts = { ready: 2 }
  atomicWrite(f.root, "runs/batch/daily-processing.json", invalid)
  assert.equal(loadDailyProcessingStatus(f.root).runs[0].status, "invalid")
})

test("daily processing binds a multi-document event to the selected primary source identity", async (t) => {
  const f = fixture(t)
  const documents = [0, 1].map((i) => readJSON(f.root, `runs/source-${i}/documents.json`)[0])
  const parses = [0, 1].map((i) => readJSON(f.root, `runs/source-${i}/parses.json`)[0])
  parses[0].attachments = [{ url: documents[1].original_url }]
  parses[1].quality.required_fields_present = true
  for (const parse of parses) atomicWrite(f.root, `parses/${parse.parse_id}/parse.json`, parse)
  atomicWrite(f.root, "runs/source-0/documents.json", documents)
  atomicWrite(f.root, "runs/source-0/parses.json", parses)
  const primary = f.handoff.pending[0]
  primary.article_content_sha256 = articleContentFingerprint(parses[0])
  primary.source_attempts[0].article_content_sha256 = primary.article_content_sha256
  primary.source_attempts[0].supporting_source_urls = [documents[1].original_url]
  f.options.candidateKeys = [primary.key]
  atomicWrite(f.root, "handoff.json", f.handoff)
  f.options.processor = async (options) => {
    const selected = loadStoredSourceRun(f.root, options.sourceRun)
    assert.equal(selected.documents.length, 2)
    const key = extractionCandidateKey(selected.documents, {
      candidateKey: options.candidateKey,
      explicitlyGrouped: true,
    })
    assert.equal(key, `source-${documents[0].source_id}`)
    assert.notEqual(key, `source-${documents[1].source_id}`)
    return { status: "fact_review", candidate_published: false }
  }
  const result = await processDailyCandidates({ ...f.options, execute: true })
  assert.equal(result.results[0].status, "fact_review")
  assert.equal(result.results[0].candidate_key, primary.key)
  assert.equal(result.public_approved, false)
  assert.equal(
    readJSON(f.root, `runs/${result.results[0].source_run}/source-selection.json`).candidate_key,
    primary.key,
  )
})

test("new daily runs default to non-reasoning comparisons and preserve that choice on execution", async (t) => {
  const f = fixture(t)
  await processDailyCandidates(f.options)
  assert.deepEqual(readJSON(f.root, "runs/batch/daily-processing-input.json").evidence_overrides, {
    think: false,
  })
  await processDailyCandidates({ ...f.options, execute: true })
  assert.ok(f.calls.every((call) => call.evidenceThink === false))
})

test("continuations inherit an explicit reasoning level instead of applying the new default", async (t) => {
  const f = fixture(t)
  await processDailyCandidates({ ...f.options, evidenceThink: "medium" })
  await processDailyCandidates({ ...f.options, execute: true })
  assert.ok(f.calls.every((call) => call.evidenceThink === "medium"))
  assert.deepEqual(readJSON(f.root, "runs/batch/daily-processing-input.json").evidence_overrides, {
    think: "medium",
  })
})

test("legacy daily inputs without an override retain their original shared-policy comparison", async (t) => {
  const f = fixture(t)
  await processDailyCandidates(f.options)
  // Represent the earlier input contract, which did not store an override.
  const input = readJSON(f.root, "runs/batch/daily-processing-input.json")
  delete input.evidence_overrides
  atomicWrite(f.root, "runs/batch/daily-processing-input.json", input)
  const receipt = readJSON(f.root, "runs/batch/daily-processing.json")
  receipt.input_sha256 = sha256(JSON.stringify(input))
  atomicWrite(f.root, "runs/batch/daily-processing.json", receipt)
  await processDailyCandidates({ ...f.options, execute: true })
  assert.ok(f.calls.every((call) => call.evidenceThink === undefined))
  assert.equal(
    readJSON(f.root, "runs/batch/daily-processing-input.json").evidence_overrides,
    undefined,
  )
})

test("explicit daily evidence reasoning is forwarded and frozen without changing the shared policy", async (t) => {
  const f = fixture(t)
  const before = fs.readFileSync(f.options.policyFile)
  const run = await processDailyCandidates({ ...f.options, execute: true, evidenceThink: false })
  assert.equal(run.status, "review_pending")
  assert.ok(f.calls.every((call) => call.evidenceThink === false))
  assert.deepEqual(readJSON(f.root, "runs/batch/daily-processing-input.json").evidence_overrides, {
    think: false,
  })
  assert.deepEqual(fs.readFileSync(f.options.policyFile), before)
  await assert.rejects(
    () => processDailyCandidates({ ...f.options, execute: true, evidenceThink: "medium" }),
    /inputs changed/,
  )
  assert.equal(f.calls.length, 2)
})

test("daily reasoning overrides reject untyped string booleans before source selection", async (t) => {
  const f = fixture(t)
  for (const value of ["false", "true", {}, 0])
    await assert.rejects(() => processDailyCandidates({ ...f.options, evidenceThink: value }))
  assert.equal(f.calls.length, 0)
  assert.equal(readJSON(f.root, "runs/batch/daily-processing-input.json"), null)
})
