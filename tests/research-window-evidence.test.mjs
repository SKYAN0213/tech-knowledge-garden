import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import {
  evidenceWindowPlan,
  assessWindowEvidenceCheckpoint,
  assertSegmentableSource,
} from "../scripts/research/window-evidence-assessment.mjs"
import { loadBoundAssessment } from "../scripts/research/evidence-review-packet.mjs"
import { reviewEvidenceQuotes } from "../scripts/research/evidence-quote-review.mjs"
import { REFERENCE_PROTOCOL } from "../scripts/research/assessment-references.mjs"

function fixture(t, { article = false } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "window-evidence-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const parse_id = sha256("window-parse")
  const sentence = article
    ? "a study announced plans to ship 50 units in 2027."
    : "Example announced plans to ship 50 units in 2027."
  const blocks = Array.from({ length: 5 }, (_, i) => ({
    block_id: `${parse_id}:b${i}`,
    text: `${sentence} Section ${i}. ` + "source context ".repeat(240),
  }))
  const body = blocks.map((b) => b.text).join("\n\n"),
    hash = sha256(body),
    source_id = sourceId("https://example.org/research")
  const d = {
    source_id,
    source_version_id: `${source_id}:${hash}`,
    body_sha256: hash,
    body_path: "source/body.bin",
    original_url: "https://example.org/research",
    fetch_status: "captured",
    observed_at: "2026-10-04T00:00:00Z",
  }
  const p = {
    schema_version: "source-parse/v1",
    source_id,
    source_version_id: d.source_version_id,
    parse_id,
    title: "Shipment research",
    status: "extracted",
    dates: { published_at: "2026-10-02", observed_at: d.observed_at },
    quality: { missing_pages: [] },
    blocks: blocks.map((b) => ({ ...b, locator: { text_hash: sha256(b.text) } })),
  }
  atomicWrite(root, d.body_path, body)
  atomicWrite(root, `parses/${parse_id}/parse.json`, p)
  const claim = {
    claim_id: "c1",
    statement: "Example plans to ship 50 units in 2027.",
    claim_kind: "attributed_fact",
    subject: "Example",
    event_state: "planned",
    published_at: "2026-10-02",
    effective_period: "2027",
    numbers: [{ literal: "50", unit: "units", condition: "in 2027" }],
    evidence: [
      {
        source_id,
        source_version_id: d.source_version_id,
        parse_id,
        block_id: blocks[0].block_id,
        quote: sentence,
        support: "direct",
      },
    ],
    review: { status: "unreviewed" },
  }
  let calls = 0,
    failAt = null,
    outside = false,
    uppercase = false,
    elision = false,
    adjacentLocator = false,
    missingCited = false
  const requests = []
  const provider = {
    executionPolicy: {
      role: "evidence_compare",
      settings: { model: "fixture-local", num_ctx: 8192, num_predict: 256, provider: "ollama" },
      model_digest: "a".repeat(64),
    },
    async structured(request) {
      calls++
      requests.push(request)
      if (calls === failAt) throw Error("Fixture interruption")
      const data = JSON.parse(request.messages[1].content),
        block = data.sources[0].blocks[0]
      return {
        output: {
          assessments: data.claims.map((c) => ({
            claim_id: c.claim_id,
            verdict: missingCited ? "insufficient" : "supported",
            checks: {
              meaning: "supported",
              identity: "supported",
              numbers: "supported",
              time: "supported",
              attribution: "supported",
            },
            explanation: "계획과 수량 조건을 해당 창의 원문에서 확인했다.",
            evidence: missingCited
              ? []
              : [
                  {
                    parse_id,
                    block_id: adjacentLocator
                      ? data.sources[0].blocks[1].block_id
                      : outside
                        ? blocks[4].block_id
                        : block.block_id,
                    quote: uppercase
                      ? sentence.replace(/^a /, "A ")
                      : elision
                        ? sentence.replace("plans to ship", "...")
                        : adjacentLocator
                          ? sentence + " Section 0."
                          : sentence,
                  },
                ],
          })),
        },
      }
    },
  }
  return {
    root,
    documents: [d],
    parses: [p],
    claims: [claim],
    provider,
    requests,
    uppercase: (value) => {
      uppercase = value
    },
    elision: (value) => {
      elision = value
    },
    adjacentLocator: (value) => {
      adjacentLocator = value
    },
    missingCited: (value) => {
      missingCited = value
    },
    calls: () => calls,
    fail: (at) => {
      failAt = at
    },
    outside: () => {
      outside = true
    },
  }
}
const run = (f, id = "windowed") =>
  assessWindowEvidenceCheckpoint(f.root, id, f.provider, f.claims, f.documents, f.parses)

test("bounded references retain full context and resolve only the supplied window", async (t) => {
  const f = fixture(t),
    generate = f.provider.structured
  f.provider.structured = async function (request) {
    const raw = await generate.call(this, request)
    const data = JSON.parse(request.messages[1].content)
    for (const row of raw.output.assessments)
      row.evidence = [{ evidence_ref: data.sources[0].blocks[0].evidence_refs[0].evidence_ref }]
    return raw
  }
  const options = { responseProtocol: REFERENCE_PROTOCOL }
  const result = await assessWindowEvidenceCheckpoint(
    f.root,
    "refs",
    f.provider,
    f.claims,
    f.documents,
    f.parses,
    options,
  )
  assert.ok(result.generated_batches > 1)
  const input = readJSON(f.root, "runs/refs/evidence-assessment/input.json")
  assert.equal(input.response_protocol, REFERENCE_PROTOCOL)
  for (const row of result.record.assessments[0].window_assessments) {
    const supplied = JSON.parse(f.requests[row.batch - 1].messages[1].content)
    const block = supplied.sources[0].blocks[0]
    assert.equal(row.evidence[0].block_id, block.block_id)
    assert.equal(row.evidence[0].quote, block.text.slice(0, 3000))
  }
  assert.equal(result.record.assessments[0].requires_attention, true)
  assert.equal(result.record.public_approved, false)
  const again = await assessWindowEvidenceCheckpoint(
    f.root,
    "refs",
    f.provider,
    f.claims,
    f.documents,
    f.parses,
    options,
  )
  assert.equal(again.generated_batches, 0)
  assert.equal(f.calls(), result.generated_batches)
})

test("every source block is retained in order for each bounded claim group", (t) => {
  const f = fixture(t),
    claims = Array.from({ length: 7 }, (_, i) => ({ ...f.claims[0], claim_id: `c${i}` }))
  const plan = evidenceWindowPlan(
    claims,
    f.documents,
    f.parses,
    f.provider.executionPolicy.settings,
  )
  for (const group of [0, 1]) {
    const rows = plan.filter((b) => b.group === group)
    assert.ok(rows.length > 1)
    assert.deepEqual(
      rows.flatMap((b) => b.entries.map((e) => e.block)),
      f.parses[0].blocks.map(({ block_id, text }) => ({ block_id, text })),
    )
    assert.ok(rows.every((b) => b.claims.length <= 6))
  }
  assert.doesNotThrow(() => assertSegmentableSource(f.parses, f.provider.executionPolicy.settings))
  assert.throws(
    () =>
      assertSegmentableSource(
        [{ blocks: [{ block_id: "large", text: "x".repeat(20000) }] }],
        f.provider.executionPolicy.settings,
      ),
    /atomic block/,
  )
})

test("window results require whole-document review and resume without model calls", async (t) => {
  const f = fixture(t),
    before = JSON.stringify(f.claims),
    result = await run(f)
  assert.ok(f.calls() > 1)
  const row = result.record.assessments[0]
  assert.equal(row.verdict, "insufficient")
  assert.equal(row.requires_attention, true)
  assert.ok(row.window_assessments.every((r) => r.verdict === "supported"))
  assert.equal(row.window_assessments.length, result.generated_batches)
  assert.equal(result.record.public_approved, false)
  assert.equal(JSON.stringify(f.claims), before)
  const calls = f.calls(),
    resumed = await run(f)
  assert.equal(f.calls(), calls)
  assert.equal(resumed.generated_batches, 0)
  const payload = { binding: f.provider.executionPolicy, attempts: [] }
  atomicWrite(f.root, "runs/windowed/model-policy/evidence_compare/budget.json", {
    ...payload,
    sha256: sha256(JSON.stringify(payload)),
  })
  assert.deepEqual(
    await loadBoundAssessment(f.root, "windowed", f.claims, f.documents, f.parses),
    result.record,
  )
})

test("interruption preserves earlier window checkpoints and resumes only missing windows", async (t) => {
  const f = fixture(t)
  f.fail(2)
  await assert.rejects(() => run(f), /Fixture interruption/)
  assert.ok(readJSON(f.root, "runs/windowed/evidence-assessment/batch-1-checkpoint.json"))
  assert.equal(readJSON(f.root, "runs/windowed/evidence-assessment/assessment.json"), null)
  f.fail(null)
  const result = await run(f)
  assert.equal(result.reused_batches, 1)
  assert.ok(result.generated_batches >= 1)
})

test("an exact quote outside the supplied window is rejected and its raw output preserved", async (t) => {
  const f = fixture(t)
  f.outside()
  await assert.rejects(() => run(f), /supplied exact source block/)
  assert.ok(readJSON(f.root, "runs/windowed/evidence-assessment/batch-1.json"))
  assert.equal(readJSON(f.root, "runs/windowed/evidence-assessment/batch-1-checkpoint.json"), null)
  await assert.rejects(() => run(f), /Unfinished window output/)
  assert.equal(f.calls(), 1)
})

test("tampered window output and source bytes cannot become completed review", async (t) => {
  const f = fixture(t)
  await run(f)
  const target = "runs/windowed/evidence-assessment/batch-1.json",
    raw = readJSON(f.root, target)
  raw.output.assessments[0].explanation = "Altered"
  atomicWrite(f.root, target, raw)
  await assert.rejects(() => run(f), /checkpoint changed/)
  atomicWrite(f.root, f.documents[0].body_path, "Changed source")
  await assert.rejects(() => run(f, "new-window"), /body hash mismatch/)
})

for (const kind of ["article-case", "elision", "adjacent-locator"])
  test(`explicit ${kind} quote review reuses a window response and completes exact missing windows`, async (t) => {
    const f = fixture(t, { article: kind === "article-case" })
    const flag =
      kind === "article-case"
        ? "sentence_initial_article_checked"
        : kind === "elision"
          ? "elision_expansion_checked"
          : "adjacent_locator_checked"
    if (kind === "article-case") f.uppercase(true)
    else if (kind === "elision") f.elision(true)
    else f.adjacentLocator(true)
    await assert.rejects(() => run(f), /supplied exact source block/)
    const base = "runs/windowed/",
      rawPath = base + "evidence-assessment/batch-1.json"
    const raw = readJSON(f.root, rawPath),
      input = readJSON(f.root, base + "evidence-assessment/input.json")
    atomicWrite(f.root, base + "documents.json", f.documents)
    atomicWrite(f.root, base + "parses.json", f.parses)
    atomicWrite(f.root, base + "claims.json", { claims: f.claims })
    const payload = {
      schema: "model-budget/v2",
      binding: f.provider.executionPolicy,
      attempts: [
        {
          status: "complete",
          request: f.requests[0],
          result: raw,
          result_sha256: sha256(JSON.stringify(raw)),
          finished_at: new Date(Date.now() - 1000).toISOString(),
        },
      ],
      extensions: [],
    }
    atomicWrite(f.root, base + "model-policy/evidence_compare/budget.json", {
      ...payload,
      sha256: sha256(JSON.stringify(payload)),
    })
    const correction = {
      batch: 1,
      claim_id: "c1",
      evidence_index: 0,
      original_quote: raw.output.assessments[0].evidence[0].quote,
      quote:
        kind === "adjacent-locator"
          ? raw.output.assessments[0].evidence[0].quote
          : f.claims[0].evidence[0].quote,
      raw_sha256: sha256(fs.readFileSync(path.join(f.root, rawPath))),
      reason: "문장 첫 부정관사만 원문의 소문자로 맞췄다.",
      [flag]: true,
      ...(kind === "adjacent-locator"
        ? {
            original_block_id: raw.output.assessments[0].evidence[0].block_id,
            block_id: f.parses[0].blocks[0].block_id,
          }
        : {}),
    }
    const review = {
      schema:
        kind === "adjacent-locator"
          ? "research-evidence-citation-review/v1"
          : "research-evidence-quote-review/v1",
      source_run: "windowed",
      input_sha256: sha256(JSON.stringify(input)),
      reviewer: "explicit fixture reviewer",
      reviewed_at: new Date().toISOString(),
      source_read: true,
      ...(kind === "adjacent-locator" ? { citation_only: true } : { quote_only: true }),
      meaning_unchanged: true,
      corrections: [correction],
    }
    const options = {
      root: f.root,
      run: "quote-reviewed",
      sourceRun: "windowed",
      review,
      completeMissing: true,
      createMissingProvider: async () => f.provider,
    }
    const before = f.calls()
    await assert.rejects(
      reviewEvidenceQuotes({
        ...options,
        review: {
          ...review,
          corrections: [{ ...correction, [flag]: undefined }],
        },
      }),
      /typography|adjacent/,
    )
    if (kind === "adjacent-locator") {
      for (const changes of [
        { block_id: f.parses[0].blocks[4].block_id },
        { quote: correction.quote + " altered" },
        { verdict: "insufficient" },
        { block_id: "other-parse:block-1" },
      ])
        await assert.rejects(
          reviewEvidenceQuotes({
            ...options,
            review: { ...review, corrections: [{ ...correction, ...changes }] },
          }),
          /adjacent|typography/,
        )
    }
    assert.equal(f.calls(), before)
    f.uppercase(false)
    f.elision(false)
    f.adjacentLocator(false)
    const result = await reviewEvidenceQuotes(options)
    const total = evidenceWindowPlan(
      f.claims,
      f.documents,
      f.parses,
      f.provider.executionPolicy.settings,
    ).length
    assert.equal(result.materialized_batches, 1)
    assert.equal(result.generated_batches, total - 1)
    assert.equal(f.calls() - before, total - 1)
    assert.equal(result.record.assessments[0].requires_attention, true)
    assert.equal(result.record.assessments[0].window_assessments.length, total)
    assert.deepEqual(readJSON(f.root, rawPath), raw)
    const calls = f.calls()
    const resumed = await reviewEvidenceQuotes(options)
    assert.equal(resumed.generated_batches, 0)
    assert.equal(f.calls(), calls)
    const response = readJSON(f.root, "runs/quote-reviewed/evidence-assessment/batch-1.json")
    if (kind === "adjacent-locator") {
      assert.equal(result.repaired_quotes, 0)
      assert.equal(result.repaired_locators, 1)
      assert.equal(response.output.assessments[0].evidence[0].quote, correction.original_quote)
      assert.equal(response.output.assessments[0].evidence[0].block_id, correction.block_id)
    }
    assert.equal(response.output.assessments[0].verdict, raw.output.assessments[0].verdict)
    assert.equal(response.output.assessments[0].explanation, raw.output.assessments[0].explanation)
  })

test("explicit missing cited blocks review only lowers a check and preserves the insufficient verdict", async (t) => {
  const f = fixture(t)
  f.claims[0].evidence[0].block_id = f.parses[0].blocks[4].block_id
  f.missingCited(true)
  await assert.rejects(() => run(f), /Inconsistent window assessment/)
  const base = "runs/windowed/",
    rawPath = base + "evidence-assessment/batch-1.json"
  const raw = readJSON(f.root, rawPath),
    input = readJSON(f.root, base + "evidence-assessment/input.json")
  atomicWrite(f.root, base + "documents.json", f.documents)
  atomicWrite(f.root, base + "parses.json", f.parses)
  atomicWrite(f.root, base + "claims.json", { claims: f.claims })
  const payload = {
    schema: "model-budget/v2",
    binding: f.provider.executionPolicy,
    extensions: [],
    attempts: [
      {
        status: "complete",
        request: f.requests[0],
        result: raw,
        result_sha256: sha256(JSON.stringify(raw)),
        finished_at: new Date(Date.now() - 1000).toISOString(),
      },
    ],
  }
  atomicWrite(f.root, base + "model-policy/evidence_compare/budget.json", {
    ...payload,
    sha256: sha256(JSON.stringify(payload)),
  })
  const correction = {
    batch: 1,
    claim_id: "c1",
    raw_sha256: sha256(fs.readFileSync(path.join(f.root, rawPath))),
    reason: "원래 인용한 블록이 현재 창에 없음을 확인해 의미 확인을 낮춘다.",
    missing_cited_blocks_checked: true,
  }
  const options = {
    root: f.root,
    run: "window-reviewed",
    sourceRun: "windowed",
    completeMissing: true,
    createMissingProvider: async () => f.provider,
    review: {
      schema: "research-evidence-window-review/v1",
      source_run: "windowed",
      input_sha256: sha256(JSON.stringify(input)),
      reviewer: "explicit fixture reviewer",
      reviewed_at: new Date().toISOString(),
      source_read: true,
      window_assessment_only: true,
      meaning_unchanged: true,
      corrections: [correction],
    },
  }
  for (const changes of [
    { missing_cited_blocks_checked: false },
    { verdict: "supported" },
    { check: "numbers" },
    { quote: "Invented" },
  ])
    await assert.rejects(
      reviewEvidenceQuotes({
        ...options,
        review: { ...options.review, corrections: [{ ...correction, ...changes }] },
      }),
      /only lower meaning/,
    )
  assert.equal(f.calls(), 1)
  f.missingCited(false)
  const result = await reviewEvidenceQuotes(options)
  assert.equal(result.lowered_checks, 1)
  assert.equal(result.repaired_quotes, 0)
  const revised = readJSON(f.root, "runs/window-reviewed/evidence-assessment/batch-1.json").output
    .assessments[0]
  assert.equal(revised.checks.meaning, "insufficient")
  assert.equal(revised.verdict, raw.output.assessments[0].verdict)
  assert.deepEqual(revised.evidence, raw.output.assessments[0].evidence)
  assert.equal(revised.explanation, raw.output.assessments[0].explanation)
  assert.deepEqual(readJSON(f.root, rawPath), raw)
  const before = f.calls()
  const resumed = await reviewEvidenceQuotes(options)
  assert.equal(resumed.generated_batches, 0)
  assert.equal(f.calls(), before)
})

function sealFixtureBudget(f, id) {
  const identity = { ...f.provider.executionPolicy, schema: "model-role-binding/v1" }
  delete identity.fingerprint
  const binding = { ...identity, fingerprint: sha256(JSON.stringify(identity)) }
  f.provider.executionPolicy = binding
  const ledger = { schema: "model-budget/v2", binding, attempts: [], extensions: [] }
  atomicWrite(f.root, `runs/${id}/model-policy/evidence_compare/budget.json`, {
    ...ledger,
    sha256: sha256(JSON.stringify(ledger)),
  })
}

async function interruptedQuoteFixture(t) {
  const f = fixture(t)
  f.provider.executionPolicy.settings.num_ctx = 32768
  f.claims = Array.from({ length: 7 }, (_, i) => ({ ...f.claims[0], claim_id: `c${i}` }))
  sealFixtureBudget(f, "old")
  f.fail(2)
  await assert.rejects(run(f, "old"), /Fixture interruption/)
  assert.equal(readJSON(f.root, "runs/old/evidence-assessment/batch-2-checkpoint.json"), null)
  const quoteGenerate = f.provider.structured
  f.provider.structured = async function (request) {
    const result = await quoteGenerate.call(this, request)
    const data = JSON.parse(request.messages[1].content)
    for (const row of result.output.assessments)
      row.evidence = [{ evidence_ref: data.sources[0].blocks[0].evidence_refs[0].evidence_ref }]
    return result
  }
  return f
}

const reuseWindow = (f, id = "new", options = {}) =>
  assessWindowEvidenceCheckpoint(f.root, id, f.provider, f.claims, f.documents, f.parses, {
    responseProtocol: REFERENCE_PROTOCOL,
    reuseRun: "old",
    ...options,
  })

test("interrupted quote comparisons reuse exact completed bytes and call only the missing reference frame", async (t) => {
  const f = await interruptedQuoteFixture(t)
  const oldRaw = fs.readFileSync(path.join(f.root, "runs/old/evidence-assessment/batch-1.json"))
  const result = await reuseWindow(f)
  assert.equal(f.calls(), 3)
  assert.equal(result.generated_batches, 1)
  assert.equal(result.inherited_batches, 1)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/new/evidence-assessment/batch-1.json")),
    oldRaw,
  )
  const input = readJSON(f.root, "runs/new/evidence-assessment/input.json")
  assert.equal(input.reused_windows[0].response_protocol, "verbatim-quote/v1")
  assert.equal(input.reused_windows[0].output_sha256, sha256(oldRaw))
  assert.equal(
    input.windows[0].request_sha256,
    readJSON(f.root, "runs/old/evidence-assessment/input.json").windows[0].request_sha256,
  )
  assert.ok(input.windows[1].catalog_sha256)
  assert.ok(
    result.record.assessments.every(
      (row) => row.requires_attention && row.verdict === "insufficient",
    ),
  )
  assert.equal(result.record.assessments[0].window_assessments[0].reused_from.run, "old")
  assert.deepEqual(
    readJSON(f.root, "runs/new/evidence-assessment/batch-2.json").output.assessments[0].evidence[0],
    {
      evidence_ref: JSON.parse(f.requests.at(-1).messages[1].content).sources[0].blocks[0]
        .evidence_refs[0].evidence_ref,
    },
  )
  sealFixtureBudget(f, "new")
  const actual = await loadBoundAssessment(f.root, "new", f.claims, f.documents, f.parses)
  assert.deepEqual(actual, result.record)
  assert.equal((await reuseWindow(f)).generated_batches, 0)
  assert.equal(f.calls(), 3)
  // The inherited run must remain independently verifiable after another reuse.
  const chained = await reuseWindow(f, "chained", { reuseRun: "new" })
  assert.equal(chained.generated_batches, 0)
  assert.equal(chained.inherited_batches, 2)
  assert.equal(f.calls(), 3)
})

for (const mutate of ["raw", "checkpoint", "binding", "claims", "request"])
  test(`partial inheritance rejects changed ${mutate} before new inference`, async (t) => {
    const f = await interruptedQuoteFixture(t)
    if (mutate === "claims") f.claims[0].statement += " changed"
    else {
      const file =
        mutate === "binding"
          ? "runs/old/model-policy/evidence_compare/budget.json"
          : `runs/old/evidence-assessment/${mutate === "raw" ? "batch-1.json" : mutate === "checkpoint" ? "batch-1-checkpoint.json" : "input.json"}`
      const stored = readJSON(f.root, file)
      if (mutate === "raw") stored.output.assessments[0].explanation += " changed"
      if (mutate === "checkpoint") stored.output_sha256 = "0".repeat(64)
      if (mutate === "binding") stored.binding.settings.model = "different-model"
      if (mutate === "request") stored.windows[0].request_sha256 = "0".repeat(64)
      atomicWrite(f.root, file, stored)
    }
    await assert.rejects(reuseWindow(f), /changed|differs|checkpoint/i)
    assert.equal(f.calls(), 2)
    assert.equal(readJSON(f.root, "runs/new/evidence-assessment/input.json"), null)
  })

test("partial readers skip unfinished output without changing files or invoking the model", async (t) => {
  const f = await interruptedQuoteFixture(t)
  const unfinished = "runs/old/evidence-assessment/batch-2.json"
  atomicWrite(f.root, unfinished, { unfinished: true })
  const before = fs.readFileSync(path.join(f.root, unfinished))
  const result = await assessWindowEvidenceCheckpoint(
    f.root,
    "old",
    f.provider,
    f.claims,
    f.documents,
    f.parses,
    { readOnly: true, partial: true },
  )
  assert.equal(result.completed_windows.length, 1)
  assert.equal(f.calls(), 2)
  assert.deepEqual(fs.readFileSync(path.join(f.root, unfinished)), before)
  assert.equal(readJSON(f.root, "runs/old/evidence-assessment/assessment.json"), null)
  await assert.rejects(
    assessWindowEvidenceCheckpoint(f.root, "old", f.provider, f.claims, f.documents, f.parses, {
      partial: true,
    }),
    /cannot generate/,
  )
})

test("a partial run with no completed frame cannot authorize inheritance", async (t) => {
  const f = fixture(t)
  sealFixtureBudget(f, "old")
  f.fail(1)
  await assert.rejects(run(f, "old"), /Fixture interruption/)
  await assert.rejects(reuseWindow(f), /No exact completed/)
  assert.equal(f.calls(), 1)
})
