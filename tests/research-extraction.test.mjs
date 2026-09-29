import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256 } from "../scripts/research/contracts.mjs"
import { planExtractionBatches, extractClaims } from "../scripts/research/claims.mjs"
import { RunState } from "../scripts/research/run-state.mjs"
import { main } from "../scripts/research.mjs"

function parse(id, count = 1, length = 50) {
  return {
    schema_version: "source-parse/v1",
    source_id: id,
    source_version_id: `${id}:v1`,
    parse_id: `${id}-parse`,
    status: "extracted",
    title: "Scientific report",
    dates: { published_at: "2026-09-21", observed_at: "2026-09-27T00:00:00Z" },
    blocks: Array.from({ length: count }, (_, n) => {
      const text = `Paragraph ${n}: ` + "source content ".repeat(Math.ceil(length / 15))
      return { block_id: `${id}-parse:b${n}`, text, locator: { text_hash: sha256(text) } }
    }),
    quality: { missing_pages: [] },
  }
}
function response(request) {
  const doc = JSON.parse(request.messages[1].content)[0],
    block = doc.blocks[0]
  return {
    output: {
      claims: [
        {
          statement: block.text.slice(0, 40),
          claim_kind: "fact",
          subject: "Research team",
          event_state: "reported",
          published_at: doc.dates.published_at,
          effective_period: null,
          numbers: [],
          evidence: [
            { block_key: block.block_key, quote: block.text.slice(0, 40), support: "direct" },
          ],
        },
      ],
    },
    artifacts: { request },
    provenance: { model: request.model, think: request.think },
  }
}

test("long multi-document extraction covers each original block once within the real request bound", () => {
  const sources = [parse("paper", 120, 1200), parse("release", 12, 500)]
  const before = JSON.stringify(sources),
    a = planExtractionBatches(sources),
    b = planExtractionBatches(sources)
  assert.ok(a.batches.length > 1)
  assert.deepEqual(a.batches, b.batches)
  const expected = sources.flatMap((p, n) => p.blocks.map((_, i) => `d${n + 1}b${i + 1}`))
  assert.deepEqual(
    a.batches.flatMap((p) => p.block_keys),
    expected,
  )
  for (const batch of a.batches) {
    assert.ok(batch.input_chars <= a.input_char_limit)
    assert.equal(
      batch.input_chars,
      batch.request.messages.reduce((s, m) => s + m.content.length, 0) +
        JSON.stringify(batch.request.schema).length,
    )
    assert.deepEqual(
      batch.request.schema.properties.claims.items.properties.evidence.items.properties.block_key
        .enum,
      batch.block_keys,
    )
    for (const section of JSON.parse(batch.request.messages[1].content))
      for (const block of section.blocks) {
        const identity = a.blocks.get(block.block_key)
        assert.equal(
          block.text,
          sources
            .find((p) => p.parse_id === identity.parse_id)
            .blocks.find((b) => b.block_id === identity.block_id).text,
        )
      }
  }
  assert.equal(JSON.stringify(sources), before)
})

test("large date evidence stays in the stored parse without exhausting model context", () => {
  const source = parse("abb", 1, 800)
  source.dates.basis = { dom_path: "/html/head/script[3]", text: "dynamic page data ".repeat(1000) }
  source.dates.precision = "day"
  const before = JSON.stringify(source)
  const plan = planExtractionBatches([source], { input_char_budget: 8000 })
  assert.equal(plan.batches.length, 1)
  const document = JSON.parse(plan.batches[0].request.messages[1].content)[0]
  assert.equal(document.dates.published_at, "2026-09-21")
  assert.equal(document.dates.observed_at, "2026-09-27T00:00:00Z")
  assert.equal(document.dates.precision, "day")
  assert.equal(document.dates.basis, undefined)
  assert.equal(JSON.stringify(source), before)
})

test("short source runs keep one request and exact evidence identities", async () => {
  const sources = [parse("short")],
    requests = []
  const output = await extractClaims(
    {
      structured: async (request) => {
        requests.push(request)
        return response(request)
      },
    },
    sources,
    { candidate_key: "sample", think: false },
  )
  assert.equal(requests.length, 1)
  assert.equal(output.claims[0].evidence[0].block_id, "short-parse:b0")
  assert.equal(output.claims[0].review.structural_pass, true)
  assert.equal(output.claims[0].review.status, "unreviewed")
  assert.ok(output.model_artifacts.request)
  assert.equal(output.batches, undefined)
})

test("oversized blocks and invalid parse sets stop before any model request", async () => {
  let calls = 0
  const model = {
    structured: async () => {
      calls++
      throw Error("Unexpected model call")
    },
  }
  await assert.rejects(extractClaims(model, [parse("large", 1, 40000)]), /Source block exceeds/)
  await assert.rejects(extractClaims(model, [parse("dup"), parse("dup")]), /Unique source parse/)
  await assert.rejects(extractClaims(model, []), /Readable parses/)
  assert.equal(calls, 0)
})

test("model evidence cannot borrow a key from another batch", async () => {
  const sources = [parse("paper", 80, 1200)]
  await assert.rejects(
    extractClaims(
      {
        structured: async (request) => {
          const result = response(request)
          result.output.claims[0].evidence[0].block_key = "d1b80"
          return result
        },
      },
      sources,
      { candidate_key: "test" },
    ),
    /Invalid|Unsupported|enum/,
  )
})

test("failed extraction resumes completed batches and preserves each raw model response", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "research-extraction-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sources = [parse("paper", 80, 1200)],
    input = { sources: sources.map((p) => p.parse_id) }
  let count = 0,
    fail = true
  const model = {
    structured: async (request) => {
      count++
      if (count === 2 && fail) throw Error("Model interrupted")
      return response(request)
    },
  }
  const run = new RunState(root, "trial", input)
  const checkpoint = (id, request, action) => run.stage("claims-batch-" + id, request, action)
  await assert.rejects(
    extractClaims(model, sources, { candidate_key: "paper", checkpoint }),
    /interrupted/,
  )
  fail = false
  const result = await extractClaims(model, sources, { candidate_key: "paper", checkpoint })
  assert.equal(count, result.batches.length + 1)
  assert.equal(result.claims.length, result.batches.length)
  assert.ok(
    result.claims.every((c) => c.review.structural_pass && c.review.status === "unreviewed"),
  )
  assert.ok(
    result.batches.every((b) => b.artifacts.request && b.output.claims[0].evidence[0].block_key),
  )
  const before = count
  const resumedRun = new RunState(root, "trial", input)
  const replay = await extractClaims(model, sources, {
    candidate_key: "paper",
    checkpoint: (id, request, action) => resumedRun.stage("claims-batch-" + id, request, action),
  })
  assert.deepEqual(replay, result)
  assert.equal(count, before)
})

test("explicit extraction budgets preserve all blocks and control each model request", async () => {
  const sources = [parse("paper", 30, 800)],
    requests = []
  const options = { num_ctx: 8192, input_char_budget: 9000, num_predict: 2048, facts_per_batch: 4 }
  const plan = planExtractionBatches(sources, options)
  assert.equal(plan.input_char_limit, 9000)
  assert.equal(plan.batches[0].request.schema.properties.claims.maxItems, 4)
  assert.ok(plan.batches.length > 1)
  assert.equal(plan.batches.flatMap((b) => b.block_keys).length, 30)
  const result = await extractClaims(
    {
      structured: async (request) => {
        requests.push(request)
        return response(request)
      },
    },
    sources,
    { ...options, candidate_key: "paper", call_timeout_ms: 5000, extraction_timeout_ms: 20000 },
  )
  assert.equal(requests.length, plan.batches.length)
  assert.ok(
    requests.every(
      (r) =>
        r.num_ctx === 8192 && r.num_predict === 2048 && r.timeout_ms > 0 && r.timeout_ms <= 5000,
    ),
  )
  assert.equal(result.provenance.extraction_plan.input_char_limit, 9000)
  assert.equal(result.provenance.extraction_budget.extraction_timeout_ms, 20000)
})

test("deadline expiry stops the next batch while retaining a completed checkpoint for resume", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "research-deadline-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sources = [parse("paper", 15, 1000)],
    run = new RunState(root, "deadline", { source: "paper" })
  const options = {
    candidate_key: "paper",
    input_char_budget: 9000,
    call_timeout_ms: 1000,
    extraction_timeout_ms: 1000,
  }
  let time = 0,
    calls = 0
  const checkpoint = (id, request, action) => run.stage("claims-batch-" + id, request, action)
  const model = {
    structured: async (request) => {
      calls++
      time += 1001
      return response(request)
    },
  }
  await assert.rejects(
    extractClaims(model, sources, { ...options, checkpoint, now: () => time }),
    /Extraction time budget exceeded/,
  )
  assert.equal(calls, 1)
  assert.equal(Object.values(run.state.stages).filter((s) => s.status === "complete").length, 1)
  time = 0
  const recovered = await extractClaims(
    {
      structured: async (request) => {
        calls++
        return response(request)
      },
    },
    sources,
    { ...options, checkpoint, now: () => time },
  )
  assert.equal(calls, recovered.batches.length)
})

test("invalid CLI extraction budgets are rejected before reading sources or starting a model", async () => {
  for (const args of [
    ["--num-ctx", "0"],
    ["--input-char-budget", "0"],
    ["--input-char-budget", "999999"],
    ["--num-predict=-1"],
    ["--call-timeout-ms", "NaN"],
    ["--extraction-timeout-ms", "0"],
    ["--facts-per-batch", "0"],
  ])
    await assert.rejects(
      main(["extract", "--run", "must-not-run", ...args]),
      /Extraction.*budget|extraction.*budget/,
    )
  await assert.rejects(
    main(["model-info", "--input-char-budget", "9000"]),
    /only supported for extract/,
  )
})
