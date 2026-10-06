import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { assessEvidenceCheckpoint } from "../scripts/research/evidence-assessment.mjs"
import { reviewEvidenceQuotes } from "../scripts/research/evidence-quote-review.mjs"
import { loadBoundAssessment } from "../scripts/research/evidence-review-packet.mjs"
import {
  assessmentReferences,
  REFERENCE_PROTOCOL,
} from "../scripts/research/assessment-references.mjs"

function fixture(t, { text = "Example announced plans to ship 50 units in 2027." } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "evidence-assess-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source_id = sourceId("https://example.org/plans")
  const body_sha256 = sha256(text)
  const source_version_id = `${source_id}:${body_sha256}`
  const parse_id = sha256("parse")
  const document = {
    source_id,
    source_version_id,
    body_sha256,
    original_url: "https://example.org/plans",
    body_path: "source/body.bin",
    fetch_status: "captured",
    observed_at: "2026-10-04T00:00:00Z",
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id,
    source_version_id,
    parse_id,
    status: "extracted",
    title: "Shipment plans",
    dates: { published_at: "2026-10-02", observed_at: document.observed_at },
    blocks: [{ block_id: `${parse_id}:b1`, text, locator: { text_hash: body_sha256 } }],
    quality: { missing_pages: [] },
  }
  atomicWrite(root, document.body_path, text)
  atomicWrite(root, `parses/${parse_id}/parse.json`, parse)
  const claim = {
    claim_id: "c1",
    statement: text,
    claim_kind: "attributed_fact",
    subject: "Example",
    event_state: "planned",
    published_at: "2026-10-02",
    effective_period: "2027",
    numbers: [{ literal: "50", unit: "units", condition: "in 2027" }],
    evidence: [
      {
        source_id,
        source_version_id,
        parse_id,
        block_id: parse.blocks[0].block_id,
        quote: text,
        support: "direct",
      },
    ],
    review: { status: "unreviewed" },
  }
  const row = {
    claim_id: "c1",
    verdict: "supported",
    checks: {
      meaning: "supported",
      identity: "supported",
      numbers: "supported",
      time: "supported",
      attribution: "supported",
    },
    explanation: "2027년 출하 계획이며 완료된 출하를 뜻하지 않는다.",
    evidence: [{ parse_id, block_id: parse.blocks[0].block_id, quote: text }],
  }
  let calls = 0
  const provider = {
    executionPolicy: {
      role: "evidence_compare",
      settings: { model: "fixture-local", num_ctx: 16384 },
      model_digest: "a".repeat(64),
    },
    async structured(request) {
      calls++
      assert.equal(request.model, "fixture-local")
      assert.ok(request.messages[0].content.includes("not fact approval"))
      const supplied = JSON.parse(request.messages[1].content)
      assert.equal(supplied.sources[0].blocks[0].text, text)
      return {
        output: {
          assessments: supplied.claims.map((c) => ({
            ...structuredClone(row),
            claim_id: row.claim_id === "c1" ? c.claim_id : row.claim_id,
            ...(request.schema.properties.assessments.items.properties.evidence.items.properties
              .evidence_ref
              ? {
                  evidence: [
                    { evidence_ref: supplied.sources[0].blocks[0].evidence_refs[0].evidence_ref },
                  ],
                }
              : {}),
          })),
        },
        provenance: { model: "test fixture" },
      }
    },
  }
  return {
    root,
    documents: [document],
    parses: [parse],
    claims: [claim],
    provider,
    row,
    calls: () => calls,
  }
}
const run = (f, id = "assessment") =>
  assessEvidenceCheckpoint(f.root, id, f.provider, f.claims, f.documents, f.parses)

const referenceRun = (f, id = "referenced", options = {}) =>
  assessEvidenceCheckpoint(f.root, id, f.provider, f.claims, f.documents, f.parses, {
    responseProtocol: REFERENCE_PROTOCOL,
    ...options,
  })

test("reference output resolves exact source typography and reuses immutable model response", async (t) => {
  const f = fixture(t, { text: "Example’s ‘plans’ are to ship 50 units in 2027." })
  const first = await referenceRun(f)
  assert.deepEqual(first.record.assessments[0].evidence, f.row.evidence)
  const raw = readJSON(f.root, "runs/referenced/evidence-assessment/batch-1.json")
  assert.deepEqual(raw.output.assessments[0].evidence, [{ evidence_ref: "e1" }])
  const input = readJSON(f.root, "runs/referenced/evidence-assessment/input.json")
  assert.equal(input.response_protocol, REFERENCE_PROTOCOL)
  assert.match(input.batches[0].catalog_sha256, /^[a-f0-9]{64}$/)
  const second = await referenceRun(f)
  assert.equal(second.reused_batches, 1)
  assert.equal(f.calls(), 1)
  assert.equal(first.record.public_approved, false)
  assert.equal(f.claims[0].review.status, "unreviewed")
})

for (const [name, change] of [
  [
    "unknown reference",
    (row) => {
      row.evidence[0].evidence_ref = "e999999"
    },
  ],
  [
    "duplicate reference",
    (row) => {
      row.evidence.push({ ...row.evidence[0] })
    },
  ],
  [
    "invented quote field",
    (row) => {
      row.evidence[0].quote = "invented"
    },
  ],
  [
    "incorrect verdict",
    (row) => {
      row.checks.time = "contradicted"
    },
  ],
  [
    "missing required evidence",
    (row) => {
      row.evidence = []
    },
  ],
])
  test(`reference contract rejects ${name} without retry or approval`, async (t) => {
    const f = fixture(t),
      generate = f.provider.structured
    f.provider.structured = async function (request) {
      const raw = await generate.call(this, request)
      change(raw.output.assessments[0])
      return raw
    }
    await assert.rejects(() => referenceRun(f))
    assert.ok(readJSON(f.root, "runs/referenced/evidence-assessment/batch-1.json"))
    assert.equal(readJSON(f.root, "runs/referenced/evidence-assessment/assessment.json"), null)
    await assert.rejects(() => referenceRun(f), /Unfinished assessment/)
    assert.equal(f.calls(), 1)
  })

test("historical read validates sealed checkpoint across code changes without inference", async (t) => {
  const f = fixture(t)
  await run(f)
  const base = "runs/assessment/evidence-assessment/"
  const input = readJSON(f.root, base + "input.json")
  input.implementation_sha256 = "f".repeat(64)
  atomicWrite(f.root, base + "input.json", input)
  const checkpoint = readJSON(f.root, base + "batch-1-checkpoint.json")
  checkpoint.input_sha256 = sha256(JSON.stringify(input))
  atomicWrite(f.root, base + "batch-1-checkpoint.json", checkpoint)
  const record = readJSON(f.root, base + "assessment.json")
  record.input_sha256 = checkpoint.input_sha256
  atomicWrite(f.root, base + "assessment.json", record)
  const payload = {
    schema: "model-budget/v2",
    binding: f.provider.executionPolicy,
    attempts: [],
    extensions: [],
  }
  atomicWrite(f.root, "runs/assessment/model-policy/evidence_compare/budget.json", {
    ...payload,
    sha256: sha256(JSON.stringify(payload)),
  })
  assert.deepEqual(
    await loadBoundAssessment(f.root, "assessment", f.claims, f.documents, f.parses),
    record,
  )
  assert.equal(f.calls(), 1)
  await assert.rejects(() => run(f), /input changed/)
  f.claims[0].statement = "Example has shipped the units."
  await assert.rejects(
    () => loadBoundAssessment(f.root, "assessment", f.claims, f.documents, f.parses),
    /Historical assessment/,
  )
  f.claims[0].statement = f.parses[0].blocks[0].text
  fs.unlinkSync(path.join(f.root, base + "batch-1-checkpoint.json"))
  await assert.rejects(
    () => loadBoundAssessment(f.root, "assessment", f.claims, f.documents, f.parses),
    /Missing assessment checkpoint/,
  )
  assert.equal(f.calls(), 1)
})

test("a known reference belonging to another claim source is rejected", async (t) => {
  const f = fixture(t),
    p = structuredClone(f.parses[0]),
    d = structuredClone(f.documents[0])
  d.source_id = sourceId("https://example.org/another")
  d.source_version_id = `${d.source_id}:${d.body_sha256}`
  d.original_url = "https://example.org/another"
  d.body_path = "source/another.bin"
  p.parse_id = sha256("another-parse")
  p.source_id = d.source_id
  p.source_version_id = d.source_version_id
  p.blocks[0].block_id = `${p.parse_id}:b1`
  atomicWrite(f.root, d.body_path, p.blocks[0].text)
  atomicWrite(f.root, `parses/${p.parse_id}/parse.json`, p)
  f.documents.push(d)
  f.parses.push(p)
  const claim = structuredClone(f.claims[0])
  claim.claim_id = "c2"
  Object.assign(claim.evidence[0], {
    source_id: d.source_id,
    source_version_id: d.source_version_id,
    parse_id: p.parse_id,
    block_id: p.blocks[0].block_id,
  })
  f.claims.push(claim)
  const generate = f.provider.structured
  f.provider.structured = async function (request) {
    const raw = await generate.call(this, request)
    raw.output.assessments[0].evidence = [{ evidence_ref: "e2" }]
    return raw
  }
  await assert.rejects(() => referenceRun(f), /exact stored source block/)
  assert.equal(f.calls(), 1)
})

test("long repeated Unicode blocks keep every character and bounded exact spans", () => {
  const text = "a".repeat(2999) + "🤖" + "b".repeat(3000) + "b".repeat(3000)
  const quoteSchema = {
    type: "object",
    properties: {
      assessments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            claim_id: { type: "string" },
            evidence: { type: "array", items: { type: "object" } },
          },
        },
      },
    },
  }
  const refs = assessmentReferences(
    [{ parse_id: "p", blocks: [{ block_id: "b", text }] }],
    quoteSchema,
    REFERENCE_PROTOCOL,
  )
  assert.equal(refs.sources[0].blocks[0].text, text)
  const resolved = refs.resolve({
    assessments: [
      {
        claim_id: "c",
        evidence: refs.sources[0].blocks[0].evidence_refs.map(({ evidence_ref }) => ({
          evidence_ref,
        })),
      },
    ],
  })
  const quotes = resolved.assessments[0].evidence.map((e) => e.quote)
  assert.equal(quotes.join(""), text)
  assert.ok(quotes.every((q) => q.length <= 3000 && !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(q)))
})

test("assessment preserves candidate approval, full source context and cached output", async (t) => {
  const f = fixture(t)
  const before = JSON.stringify(f.claims)
  const first = await run(f)
  assert.equal(first.record.public_approved, false)
  assert.equal(first.record.requires_fact_review, true)
  assert.equal(first.record.assessments[0].requires_attention, false)
  assert.equal(first.record.assessments[0].fact_review_status, "unreviewed")
  assert.equal(JSON.stringify(f.claims), before)
  const second = await run(f)
  assert.equal(f.calls(), 1)
  assert.equal(second.reused_batches, 1)
})

test("embedded date provenance cannot duplicate page scripts in full-source model context", async (t) => {
  const f = fixture(t),
    parse = f.parses[0]
  parse.dates.modified_at = "2026-10-03"
  parse.dates.precision = "day"
  parse.dates.candidates = [{ raw: "embedded-script-marker " + "x".repeat(50000) }]
  atomicWrite(f.root, `parses/${parse.parse_id}/parse.json`, parse)
  const immutable = fs.readFileSync(path.join(f.root, `parses/${parse.parse_id}/parse.json`))
  const generate = f.provider.structured
  f.provider.structured = async function (request) {
    const supplied = JSON.parse(request.messages[1].content)
    assert.deepEqual(supplied.sources[0].dates, {
      published_at: "2026-10-02",
      modified_at: "2026-10-03",
      precision: "day",
      observed_at: "2026-10-04T00:00:00Z",
    })
    assert.deepEqual(
      supplied.sources[0].blocks,
      parse.blocks.map(({ block_id, text }) => ({ block_id, text })),
    )
    assert.equal(request.messages[1].content.includes("embedded-script-marker"), false)
    return generate.call(this, request)
  }
  await run(f)
  assert.equal(f.calls(), 1)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, `parses/${parse.parse_id}/parse.json`)),
    immutable,
  )
})

test("a model-supported claim cannot override structural source failures", async (t) => {
  const f = fixture(t)
  f.claims[0].evidence[0].quote = "Unrelated invented quote"
  const result = await run(f)
  assert.equal(result.record.assessments[0].requires_attention, true)
  assert.ok(result.record.assessments[0].structural.problems.includes("quote_not_in_block"))
  assert.equal(f.claims[0].review.status, "unreviewed")
})

for (const [name, change, pattern] of [
  [
    "fabricated quote",
    (row) => {
      row.evidence[0].quote = "Not in the original source"
    },
    /exact stored source/,
  ],
  [
    "unknown claim",
    (row) => {
      row.claim_id = "another"
    },
    /exact candidate/,
  ],
  [
    "inconsistent verdict",
    (row) => {
      row.checks.time = "contradicted"
    },
    /Inconsistent/,
  ],
  [
    "missing source quote",
    (row) => {
      row.evidence = []
    },
    /Inconsistent/,
  ],
]) {
  test(`invalid ${name} is preserved and cannot be silently retried`, async (t) => {
    const f = fixture(t)
    change(f.row)
    await assert.rejects(() => run(f), pattern)
    assert.ok(readJSON(f.root, "runs/assessment/evidence-assessment/batch-1.json"))
    assert.equal(readJSON(f.root, "runs/assessment/evidence-assessment/assessment.json"), null)
    await assert.rejects(() => run(f), /Unfinished assessment/)
    assert.equal(f.calls(), 1)
  })
}

test("candidate or policy changes prevent reuse before inference", async (t) => {
  const f = fixture(t)
  await run(f)
  f.claims[0].statement = "Example shipped 50 units."
  await assert.rejects(() => run(f), /input changed/)
  assert.equal(f.calls(), 1)
  f.claims[0].statement = f.parses[0].blocks[0].text
  f.provider.executionPolicy.model_digest = "b".repeat(64)
  await assert.rejects(() => run(f), /input changed/)
  assert.equal(f.calls(), 1)
})

test("source bytes and checkpoint modifications are rejected", async (t) => {
  const f = fixture(t)
  await run(f)
  const raw = readJSON(f.root, "runs/assessment/evidence-assessment/batch-1.json")
  raw.output.assessments[0].explanation = "Changed private assessment"
  atomicWrite(f.root, "runs/assessment/evidence-assessment/batch-1.json", raw)
  await assert.rejects(() => run(f), /checkpoint changed/)
  atomicWrite(f.root, f.documents[0].body_path, "Modified source")
  await assert.rejects(() => run(f), /body hash mismatch/)
  assert.equal(f.calls(), 1)
})

test("whole-source budget fails before generating any batch", async (t) => {
  const f = fixture(t)
  f.provider.executionPolicy.settings.num_ctx = 10
  await assert.rejects(() => run(f), /Full source assessment exceeds/)
  assert.equal(f.calls(), 0)
  assert.equal(readJSON(f.root, "runs/assessment/evidence-assessment/input.json"), null)
})

test("seven claims use three complete default batches and reuse them", async (t) => {
  const f = fixture(t)
  f.claims = Array.from({ length: 7 }, (_, n) => ({
    ...structuredClone(f.claims[0]),
    claim_id: `c${n + 1}`,
  }))
  const result = await run(f)
  assert.equal(result.record.assessments.length, 7)
  assert.equal(result.generated_batches, 3)
  await run(f)
  assert.equal(f.calls(), 3)
})

test("batch size changes require a new run and never truncate source blocks", async (t) => {
  const f = fixture(t)
  await run(f)
  await assert.rejects(
    () =>
      assessEvidenceCheckpoint(f.root, "assessment", f.provider, f.claims, f.documents, f.parses, {
        claimsPerBatch: 6,
      }),
    /input changed/,
  )
  await assert.rejects(
    () =>
      assessEvidenceCheckpoint(f.root, "bad-size", f.provider, f.claims, f.documents, f.parses, {
        claimsPerBatch: 0,
      }),
    /between one and six/,
  )
  assert.equal(f.calls(), 1)
})

test("source modified during inference cannot produce a completed assessment", async (t) => {
  const f = fixture(t)
  const generate = f.provider.structured.bind(f.provider)
  f.provider.structured = async (request) => {
    const output = await generate(request)
    atomicWrite(f.root, f.documents[0].body_path, "Concurrent source edit")
    return output
  }
  await assert.rejects(() => run(f), /body hash mismatch/)
  assert.equal(readJSON(f.root, "runs/assessment/evidence-assessment/assessment.json"), null)
})

async function quoteFixture(
  t,
  { partial = false, citationMarkers = false, citationWrapper = false, claimEcho = false } = {},
) {
  const f = fixture(
    t,
    citationWrapper
      ? {
          text: "Example announced plans to ship 50 units in 2027. \uE200cite\uE2027†Official verification tool\uE201 and \uE200cite\uE2028†Other tool\u2060(opens in a new window)†example.org\uE201 , support this. Footnote^{\uE200cite\uE2029†3\uE201 }.",
        }
      : citationMarkers
        ? {
            text: "Example announced plans to ship 50 units in 2027. \uE200cite\uE2027†Official verification tool\uE201 supports this.",
          }
        : {},
  )
  if (partial) {
    f.claims.push({ ...structuredClone(f.claims[0]), claim_id: "c2" })
    f.provider.executionPolicy.settings.provider = "ollama"
  }
  if (claimEcho) {
    f.claims[0].claim_id = "a1".repeat(12)
    f.row.claim_id = f.claims[0].claim_id + f.claims[0].claim_id.slice(-8)
  }
  f.row.evidence[0].quote = claimEcho
    ? f.parses[0].blocks[0].text
    : citationWrapper
      ? "Example announced plans to ship 50 units in 2027. Official verification tool and Other tool, support this. Footnote^{†3† }."
      : citationMarkers
        ? f.row.evidence[0].quote.replace(
            /[\uE200\uE202\uE201]/g,
            citationMarkers === "spaces" ? " " : "\uFFFC",
          )
        : f.row.evidence[0].quote.replace("50 units", "50  units")
  const generate = f.provider.structured.bind(f.provider)
  let request
  f.provider.structured = async (value) => {
    request = value
    return generate(value)
  }
  await assert.rejects(
    () =>
      partial
        ? assessEvidenceCheckpoint(
            f.root,
            "assessment",
            f.provider,
            f.claims,
            f.documents,
            f.parses,
            { claimsPerBatch: 1 },
          )
        : run(f),
    claimEcho ? /cover each exact candidate/ : /exact stored source/,
  )
  atomicWrite(f.root, "runs/assessment/documents.json", f.documents)
  atomicWrite(f.root, "runs/assessment/parses.json", f.parses)
  atomicWrite(f.root, "runs/assessment/claims.json", { claims: f.claims })
  const rawPath = "runs/assessment/evidence-assessment/batch-1.json"
  const bytes = fs.readFileSync(path.join(f.root, rawPath))
  const raw = JSON.parse(bytes)
  const payload = {
    schema: "model-budget/v2",
    binding: f.provider.executionPolicy,
    attempts: [
      {
        status: "complete",
        finished_at: "2026-10-04T00:00:00Z",
        request,
        result: raw,
        result_sha256: sha256(JSON.stringify(raw)),
      },
    ],
    extensions: [],
  }
  atomicWrite(f.root, "runs/assessment/model-policy/evidence_compare/budget.json", {
    ...payload,
    sha256: sha256(JSON.stringify(payload)),
  })
  f.quoteReview = {
    schema: "research-evidence-quote-review/v1",
    source_run: "assessment",
    input_sha256: sha256(
      JSON.stringify(readJSON(f.root, "runs/assessment/evidence-assessment/input.json")),
    ),
    reviewer: "Explicit test source reviewer",
    reviewed_at: "2026-10-04T00:01:00Z",
    source_read: true,
    quote_only: true,
    meaning_unchanged: true,
    corrections: [
      {
        batch: 1,
        claim_id: "c1",
        evidence_index: 0,
        original_quote: f.row.evidence[0].quote,
        quote: f.parses[0].blocks[0].text,
        raw_sha256: sha256(bytes),
        reason: "Restore the exact single space in the source.",
      },
    ],
  }
  f.originalBytes = bytes
  return f
}
const repairQuotes = (f, run = "quote-reviewed") =>
  reviewEvidenceQuotes({
    root: f.root,
    run,
    sourceRun: "assessment",
    review: f.quoteReview,
  })

test("explicit quote repair preserves invalid output and verdict without new inference", async (t) => {
  const f = await quoteFixture(t)
  const result = await repairQuotes(f)
  assert.equal(result.model_calls, 0)
  assert.equal(result.materialized_batches, 1)
  assert.equal(result.record.assessments[0].verdict, "supported")
  assert.equal(result.record.requires_fact_review, true)
  assert.equal(result.record.public_approved, false)
  const raw = readJSON(f.root, "runs/quote-reviewed/evidence-assessment/batch-1.json")
  assert.equal(raw.output.assessments[0].evidence[0].quote, f.parses[0].blocks[0].text)
  assert.equal(raw.quote_review.source_run, "assessment")
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/assessment/evidence-assessment/batch-1.json")),
    f.originalBytes,
  )
  const before = fs.readFileSync(path.join(f.root, "runs/quote-reviewed/quote-review-result.json"))
  const again = await repairQuotes(f)
  assert.equal(again.materialized_batches, 0)
  assert.equal(again.reused_batches, 1)
  assert.equal(f.calls(), 1)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/quote-reviewed/quote-review-result.json")),
    before,
  )
  await loadBoundAssessment(f.root, "quote-reviewed", f.claims, f.documents, f.parses)
})

for (const citationMarkers of ["replacement-glyph", "spaces"])
  test(`explicit citation marker repair (${citationMarkers}) preserves words, reference ID and original response`, async (t) => {
    const f = await quoteFixture(t, { citationMarkers })
    const correction = f.quoteReview.corrections[0]
    correction.citation_markers_checked = true
    for (const changes of [
      { citation_markers_checked: undefined },
      { sentence_initial_article_checked: true },
      { elision_expansion_checked: true },
      { quote: correction.quote.replace("7†", "8†") },
      { quote: correction.quote.replace("50 units", "51 units") },
      { quote: correction.quote.replace("Official", "Different") },
      { original_quote: correction.original_quote.replace("cite", "note") },
    ])
      await assert.rejects(
        () =>
          reviewEvidenceQuotes({
            root: f.root,
            run: "quote-reviewed",
            sourceRun: "assessment",
            review: { ...f.quoteReview, corrections: [{ ...correction, ...changes }] },
          }),
        /typography|adjacent/,
      )
    const result = await repairQuotes(f)
    assert.equal(result.model_calls, 0)
    assert.equal(result.repaired_quotes, 1)
    await loadBoundAssessment(f.root, "quote-reviewed", f.claims, f.documents, f.parses)
    assert.deepEqual(
      fs.readFileSync(path.join(f.root, "runs/assessment/evidence-assessment/batch-1.json")),
      f.originalBytes,
    )
    assert.equal(f.calls(), 1)
  })

test("explicit citation wrapper review restores exact source span without changing visible words", async (t) => {
  const f = await quoteFixture(t, { citationWrapper: true })
  const correction = f.quoteReview.corrections[0]
  correction.citation_wrapper_checked = true
  for (const changes of [
    { citation_wrapper_checked: undefined },
    { citation_markers_checked: true },
    { elision_expansion_checked: true },
    { quote: correction.quote.replace("7†", "9†") },
    { quote: correction.quote.replace("50 units", "51 units") },
    { quote: correction.quote.replace("Official", "Different") },
    { original_quote: correction.original_quote.replace("Other tool", "Other thing") },
  ])
    await assert.rejects(
      () =>
        reviewEvidenceQuotes({
          root: f.root,
          run: "quote-reviewed",
          sourceRun: "assessment",
          review: { ...f.quoteReview, corrections: [{ ...correction, ...changes }] },
        }),
      /typography|adjacent/,
    )
  const result = await repairQuotes(f)
  assert.equal(result.model_calls, 0)
  assert.equal(result.repaired_quotes, 1)
  await loadBoundAssessment(f.root, "quote-reviewed", f.claims, f.documents, f.parses)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/assessment/evidence-assessment/batch-1.json")),
    f.originalBytes,
  )
  assert.equal(f.calls(), 1)
})

test("explicit claim ID echo review reuses a uniquely bound assessment without changing its facts", async (t) => {
  const f = await quoteFixture(t, { claimEcho: true })
  const { quote_only, ...base } = f.quoteReview
  f.quoteReview = {
    ...base,
    schema: "research-evidence-claim-id-review/v1",
    claim_id_only: true,
    corrections: [
      {
        batch: 1,
        claim_id: f.claims[0].claim_id,
        original_claim_id: f.row.claim_id,
        claim_id_echo_checked: true,
        raw_sha256: sha256(f.originalBytes),
        reason:
          "Only the exact supplied ID suffix was echoed; source, quote and verdict were read unchanged.",
      },
    ],
  }
  const correction = f.quoteReview.corrections[0]
  for (const change of [
    { claim_id_echo_checked: false },
    { original_claim_id: f.row.claim_id + "ff" },
    { claim_id: "b1".repeat(12) },
    { verdict: "supported" },
    { raw_sha256: "f".repeat(64) },
  ])
    await assert.rejects(
      () =>
        reviewEvidenceQuotes({
          root: f.root,
          run: "quote-reviewed",
          sourceRun: "assessment",
          review: { ...f.quoteReview, corrections: [{ ...correction, ...change }] },
        }),
      /claim ID/,
    )
  const result = await repairQuotes(f)
  assert.equal(result.model_calls, 0)
  assert.equal(result.repaired_claim_ids, 1)
  assert.equal(result.repaired_quotes, 0)
  const raw = readJSON(f.root, "runs/quote-reviewed/evidence-assessment/batch-1.json")
  const original = JSON.parse(f.originalBytes)
  assert.deepEqual(raw.output.assessments[0], {
    ...original.output.assessments[0],
    claim_id: f.claims[0].claim_id,
  })
  await loadBoundAssessment(f.root, "quote-reviewed", f.claims, f.documents, f.parses)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/assessment/evidence-assessment/batch-1.json")),
    f.originalBytes,
  )
  assert.equal(f.calls(), 1)
})

test("quote recovery generates only explicitly requested missing batches and resumes without metadata", async (t) => {
  const f = await quoteFixture(t, { partial: true })
  await assert.rejects(() => repairQuotes(f), /explicitly enable/)
  let calls = 0
  const options = {
    root: f.root,
    run: "quote-completed",
    sourceRun: "assessment",
    review: f.quoteReview,
    completeMissing: true,
    createMissingProvider: async () => ({
      executionPolicy: f.provider.executionPolicy,
      structured: async (request) => {
        calls++
        const supplied = JSON.parse(request.messages[1].content)
        assert.deepEqual(
          supplied.claims.map((c) => c.claim_id),
          ["c2"],
        )
        const raw = {
          output: {
            assessments: [
              {
                ...structuredClone(f.row),
                claim_id: "c2",
                evidence: [{ ...f.row.evidence[0], quote: f.parses[0].blocks[0].text }],
              },
            ],
          },
        }
        const file = "runs/quote-completed/model-policy/evidence_compare/budget.json"
        const old = readJSON(f.root, file),
          { sha256: _seal, ...payload } = old
        payload.attempts.push({
          status: "complete",
          request,
          result: raw,
          result_sha256: sha256(JSON.stringify(raw)),
        })
        atomicWrite(f.root, file, { ...payload, sha256: sha256(JSON.stringify(payload)) })
        return raw
      },
    }),
  }
  const result = await reviewEvidenceQuotes(options)
  assert.equal(result.materialized_batches, 1)
  assert.equal(result.model_calls, 1)
  assert.equal(result.record.assessments.length, 2)
  assert.equal(calls, 1)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/assessment/evidence-assessment/batch-1.json")),
    f.originalBytes,
  )
  const before = fs.readFileSync(path.join(f.root, "runs/quote-completed/quote-review-result.json"))
  const again = await reviewEvidenceQuotes({
    ...options,
    createMissingProvider: async () => {
      throw Error("No metadata on completed resume")
    },
  })
  assert.equal(again.model_calls, 0)
  assert.equal(again.reused_batches, 2)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/quote-completed/quote-review-result.json")),
    before,
  )
  await loadBoundAssessment(f.root, "quote-completed", f.claims, f.documents, f.parses)
})

test("a second quote repair authenticates inherited checkpoints and preserves both charged attempts", async (t) => {
  const f = await quoteFixture(t, { partial: true })
  let generated = 0
  await assert.rejects(
    () =>
      reviewEvidenceQuotes({
        root: f.root,
        run: "partial-repair",
        sourceRun: "assessment",
        review: f.quoteReview,
        completeMissing: true,
        createMissingProvider: async () => ({
          executionPolicy: f.provider.executionPolicy,
          structured: async (request) => {
            generated++
            const raw = { output: { assessments: [{ ...structuredClone(f.row), claim_id: "c2" }] } }
            const file = "runs/partial-repair/model-policy/evidence_compare/budget.json"
            const { sha256: _seal, ...payload } = readJSON(f.root, file)
            payload.attempts.push({
              status: "complete",
              finished_at: "2026-10-04T00:02:00Z",
              request,
              result: raw,
              result_sha256: sha256(JSON.stringify(raw)),
            })
            atomicWrite(f.root, file, { ...payload, sha256: sha256(JSON.stringify(payload)) })
            return raw
          },
        }),
      }),
    /exact stored source/,
  )
  assert.equal(generated, 1)
  const base = "runs/partial-repair/"
  const prefixBytes = fs.readFileSync(path.join(f.root, base + "evidence-assessment/batch-1.json"))
  const failedBytes = fs.readFileSync(path.join(f.root, base + "evidence-assessment/batch-2.json"))
  const ledgerBytes = fs.readFileSync(
    path.join(f.root, base + "model-policy/evidence_compare/budget.json"),
  )
  const review = {
    ...f.quoteReview,
    source_run: "partial-repair",
    reviewed_at: "2026-10-04T00:03:00Z",
    corrections: [
      {
        ...f.quoteReview.corrections[0],
        batch: 2,
        claim_id: "c2",
        raw_sha256: sha256(failedBytes),
      },
    ],
  }
  const options = { root: f.root, run: "second-repair", sourceRun: "partial-repair", review }
  const result = await reviewEvidenceQuotes(options)
  assert.equal(result.model_calls, 0)
  assert.equal(result.materialized_batches, 2)
  assert.equal(result.record.assessments.length, 2)
  for (const [file, bytes] of [
    ["evidence-assessment/batch-1.json", prefixBytes],
    ["evidence-assessment/batch-2.json", failedBytes],
    ["model-policy/evidence_compare/budget.json", ledgerBytes],
  ])
    assert.deepEqual(fs.readFileSync(path.join(f.root, base + file)), bytes)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/assessment/evidence-assessment/batch-1.json")),
    f.originalBytes,
  )
  const resumed = await reviewEvidenceQuotes(options)
  assert.equal(resumed.model_calls, 0)
  assert.equal(resumed.reused_batches, 2)
  await loadBoundAssessment(f.root, "second-repair", f.claims, f.documents, f.parses)
  const prefix = JSON.parse(prefixBytes)
  prefix.output.assessments[0].verdict = "insufficient"
  atomicWrite(f.root, base + "evidence-assessment/batch-1.json", prefix)
  await assert.rejects(
    () => reviewEvidenceQuotes({ ...options, run: "tampered-prefix" }),
    /changed non-quote/,
  )
  assert.equal(readJSON(f.root, "runs/tampered-prefix/documents.json"), null)
})

test("missing-batch completion cannot switch the original local policy", async (t) => {
  const f = await quoteFixture(t, { partial: true })
  await assert.rejects(
    () =>
      reviewEvidenceQuotes({
        root: f.root,
        run: "quote-wrong-policy",
        sourceRun: "assessment",
        review: f.quoteReview,
        completeMissing: true,
        createMissingProvider: async () => ({
          executionPolicy: { ...f.provider.executionPolicy, model_digest: "f".repeat(64) },
          structured: async () => {
            throw Error("Must not generate")
          },
        }),
      }),
    /exact original local model policy/,
  )
  assert.equal(readJSON(f.root, "runs/quote-wrong-policy/evidence-assessment/batch-2.json"), null)
})

for (const [name, change] of [
  [
    "unacknowledged source",
    (f) => {
      f.quoteReview.source_read = false
    },
  ],
  [
    "different number",
    (f) => {
      f.quoteReview.corrections[0].quote = f.quoteReview.corrections[0].quote.replace("50", "60")
    },
  ],
  [
    "unknown verdict field",
    (f) => {
      f.quoteReview.corrections[0].verdict = "supported"
    },
  ],
  [
    "different raw response",
    (f) => {
      f.quoteReview.corrections[0].raw_sha256 = "a".repeat(64)
    },
  ],
]) {
  test(`quote recovery rejects ${name} without inference`, async (t) => {
    const f = await quoteFixture(t)
    change(f)
    await assert.rejects(() => repairQuotes(f), /review required|explicitly repaired/)
    assert.equal(f.calls(), 1)
    assert.equal(readJSON(f.root, "runs/quote-reviewed/evidence-assessment/assessment.json"), null)
  })
}

test("quote recovery rejects changed source and prior raw output on resume", async (t) => {
  const f = await quoteFixture(t)
  await repairQuotes(f)
  const raw = readJSON(f.root, "runs/assessment/evidence-assessment/batch-1.json")
  raw.output.assessments[0].checks.meaning = "contradicted"
  atomicWrite(f.root, "runs/assessment/evidence-assessment/batch-1.json", raw)
  await assert.rejects(() => repairQuotes(f), /completed model attempt/)
  atomicWrite(f.root, f.documents[0].body_path, "Changed body")
  await assert.rejects(() => repairQuotes(f), /body hash mismatch/)
  assert.equal(f.calls(), 1)
})

test("quote recovery preserves an occupied destination and rejects a running attempt", async (t) => {
  const f = await quoteFixture(t)
  atomicWrite(f.root, "runs/occupied/claims.json", { preserved: true })
  await assert.rejects(() => repairQuotes(f, "occupied"), /use a new run/)
  assert.equal(readJSON(f.root, "runs/occupied/quote-review-input.json"), null)
  const file = "runs/assessment/model-policy/evidence_compare/budget.json"
  const { sha256: seal, ...ledger } = readJSON(f.root, file)
  ledger.attempts[0].status = "running"
  atomicWrite(f.root, file, { ...ledger, sha256: sha256(JSON.stringify(ledger)) })
  await assert.rejects(() => repairQuotes(f), /Stopped incomplete/)
  assert.equal(f.calls(), 1)
})
