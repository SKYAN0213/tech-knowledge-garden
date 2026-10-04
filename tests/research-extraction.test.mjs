import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import {
  planExtractionBatches,
  extractClaims,
  extractionCandidateKey,
  selectExtractionScope,
  validateEvidence,
} from "../scripts/research/claims.mjs"
import { atomicWrite, RunState } from "../scripts/research/run-state.mjs"
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
test("numeric evidence comparison ignores English capitalization but still requires the quoted condition", () => {
  const source = parse("case-fold")
  const quote =
    "From January 2026 to August 2026, GTIG recorded 141 distinct vulnerabilities disclosed and exploited."
  source.blocks[0].text = quote
  source.blocks[0].locator.text_hash = sha256(quote)
  const claim = {
    numbers: [
      {
        literal: "141",
        unit: "distinct vulnerabilities",
        condition: "from January 2026 to August 2026",
      },
    ],
    evidence: [
      {
        source_id: source.source_id,
        source_version_id: source.source_version_id,
        parse_id: source.parse_id,
        block_id: source.blocks[0].block_id,
        quote,
        support: "direct",
      },
    ],
  }

  assert.equal(validateEvidence(claim, [source]).structural_pass, true)
  assert.ok(
    validateEvidence(
      { ...claim, numbers: [{ ...claim.numbers[0], condition: "September 2026" }] },
      [source],
    ).problems.includes("condition_not_in_evidence"),
  )
})

test("ongoing source activity cannot be marked as completed", () => {
  const source = parse("ongoing-state")
  const quote = "안랩은 지난 2013년부터 AV-TEST 평가에 꾸준히 참여하고 있고"
  source.blocks[0].text = quote
  source.blocks[0].locator.text_hash = sha256(quote)
  const claim = {
    statement: "안랩은 AV-TEST 평가에 꾸준히 참여하고 있다.",
    event_state: "completed",
    numbers: [],
    evidence: [
      {
        source_id: source.source_id,
        source_version_id: source.source_version_id,
        parse_id: source.parse_id,
        block_id: source.blocks[0].block_id,
        quote,
        support: "direct",
      },
    ],
  }

  assert.ok(validateEvidence(claim, [source]).problems.includes("ongoing_source_marked_completed"))
  assert.ok(
    !validateEvidence({ ...claim, event_state: "reported" }, [source]).problems.includes(
      "ongoing_source_marked_completed",
    ),
  )
})
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

test("news extraction preserves narrative and tables while giving the main announcement priority", () => {
  const source = parse("announcement-priority", 3)
  source.title = "Search service adds shared endpoints"
  const content = [
    ["paragraph", "Today the company announced a shared search endpoint for its service."],
    ["heading", "Preview pricing"],
    ["table", "Preview usage price: $0.75 per million tokens; shared free monthly allowance."],
  ]
  source.blocks.forEach((block, i) => {
    block.kind = content[i][0]
    block.text = content[i][1]
    block.locator.text_hash = sha256(block.text)
  })
  const plan = planExtractionBatches([source])
  assert.equal(plan.batches.length, 1)
  const request = plan.batches[0].request
  const doc = JSON.parse(request.messages[1].content)[0]
  assert.equal(doc.title, source.title)
  assert.deepEqual(
    doc.blocks.map((b) => [b.kind, b.text]),
    content,
  )
  assert.deepEqual(
    plan.batches[0].block_keys.map((key) => plan.blocks.get(key).block_id),
    source.blocks.map((b) => b.block_id),
  )
  assert.match(request.messages[0].content, /main announcement before ancillary/)
  assert.match(request.messages[0].content, /not in this batch/)
  assert.equal(request.schema.properties.claims.maxItems, 6)
})
function researchPaper(id = "paper") {
  const source = parse(id)
  const sections = [
    ["heading", "Abstract", "h2"],
    ["paragraph", "This study evaluates a model on a fixed benchmark."],
    ["heading", "1 Introduction", "h2"],
    ["paragraph", "General introduction background."],
    ["heading", "2 Related work", "h2"],
    ["paragraph", "Earlier studies are reviewed here."],
    ["heading", "3 Method", "h2"],
    ["paragraph", "Long detailed implementation procedure."],
    ["heading", "4 Planned deployment architecture", "h2"],
    ["paragraph", "The deployment remains planned and has not been tested."],
    ["heading", "5 Evaluation protocol", "h2"],
    ["paragraph", "Seven utterances were measured after one warmup pass."],
    ["heading", "6 Results", "h2"],
    ["paragraph", "Mean latency was 5,913 ms on the test hardware."],
    ["heading", "6.1 Latency by device", "h3"],
    ["table", "Device | Mean latency\nRobot | 5,913 ms"],
    ["heading", "7 Discussion", "h2"],
    ["paragraph", "This result does not establish conversational use."],
    ["heading", "8 Limitations", "h2"],
    ["paragraph", "Native-speaker evaluation remains future work."],
    ["heading", "9 Conclusion", "h2"],
    ["paragraph", "The experiment reports measured synthesis latency."],
    ["heading", "References", "h2"],
    ["paragraph", "Unrelated citation metadata."],
  ]
  source.blocks = sections.map(([kind, text, tag], index) => ({
    kind,
    text,
    block_id: `${source.parse_id}:b${index}`,
    locator: {
      type: "html",
      dom_path: tag ? `/html/body/article/${tag}` : `/html/body/article/p[${index}]`,
      text_hash: sha256(text),
    },
  }))
  for (const block of source.blocks) {
    if (
      [
        "General introduction background.",
        "Earlier studies are reviewed here.",
        "Long detailed implementation procedure.",
        "Unrelated citation metadata.",
      ].includes(block.text)
    ) {
      block.text += " " + "Supporting source details. ".repeat(750)
      block.locator.text_hash = sha256(block.text)
    }
  }
  return source
}

test("claim extraction keeps an explicit speaker separate from the claim subject", () => {
  const request = planExtractionBatches([parse("release")]).batches[0].request
  assert.match(request.messages[0].content, /preserve the named speaker/i)
  assert.match(request.messages[0].content, /Keep subject as the entity the claim is about/i)
  assert.match(
    request.messages[0].content,
    /same quote, preserving spelling, capitalization, and symbols/i,
  )
  assert.match(request.messages[0].content, /Do not paraphrase a condition/i)
  assert.match(request.messages[0].content, /use "ms", not "milliseconds"/i)
  assert.match(request.messages[0].content, /non-duplicate facts/i)
})

test("multi-source extraction requires a source selection or bundle and an explicit candidate identity", () => {
  const documents = [{ source_id: "primary" }, { source_id: "secondary" }]
  assert.throws(() => extractionCandidateKey(documents), /Select exact sources or bundle/)
  assert.throws(
    () => extractionCandidateKey(documents, { explicitlyGrouped: true }),
    /candidate key is required/,
  )
  assert.throws(
    () =>
      extractionCandidateKey(documents, {
        explicitlyGrouped: true,
        candidateKey: "source-unrelated",
      }),
    /must identify one of its acquired sources/,
  )
  assert.equal(
    extractionCandidateKey(documents, {
      explicitlyGrouped: true,
      candidateKey: "source-secondary",
    }),
    "source-secondary",
  )
  assert.equal(extractionCandidateKey([{ source_id: "only" }]), "source-only")
})

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

test("research key-findings scope keeps results context and exact source identities while excluding background", () => {
  const source = researchPaper(),
    full = planExtractionBatches([source]),
    focused = planExtractionBatches([source], { extraction_scope: "research_key_findings" }),
    scope = selectExtractionScope([source], "research_key_findings").documents[0]
  assert.ok(focused.batches.length < full.batches.length)
  assert.match(
    focused.batches[0].request.messages[0].content,
    /preserve those conditions in the result claim instead of reporting only the mean/i,
  )
  assert.match(
    focused.batches[0].request.messages[0].content,
    /Capture stated study limitations and validations that remain planned or pending/i,
  )
  assert.equal(scope.source_block_count, source.blocks.length)
  assert.ok(scope.included_block_count < scope.source_block_count)
  assert.equal(scope.included_block_count + scope.excluded_block_count, source.blocks.length)
  const selected = new Set(focused.batches.flatMap((batch) => batch.block_keys))
  const sectionTexts = focused.batches.flatMap((batch) =>
    JSON.parse(batch.request.messages[1].content)[0].blocks.map((block) => block.text),
  )
  assert.ok(sectionTexts.includes("Mean latency was 5,913 ms on the test hardware."))
  assert.ok(sectionTexts.includes("Seven utterances were measured after one warmup pass."))
  assert.ok(sectionTexts.includes("The deployment remains planned and has not been tested."))
  assert.ok(!sectionTexts.includes("Earlier studies are reviewed here."))
  assert.ok(!sectionTexts.includes("Unrelated citation metadata."))
  assert.equal(selected.size, scope.included_block_count)
  assert.equal(focused.scope.profile, "research_key_findings")
  assert.ok(focused.scope.documents[0].excluded_block_count > 0)
})

test("research key-findings scope supports concept-review papers without an empirical Results section", () => {
  const source = parse("review-paper")
  const sections = [
    ["heading", "Abstract", "h2"],
    ["paragraph", "The review proposes an operational framework."],
    ["heading", "1 Introduction", "h2"],
    ["paragraph", "Broad background that is not needed for the findings."],
    ["heading", "3 Concept and definition", "h2"],
    ["paragraph", "The framework defines six operational criteria."],
    ["heading", "4 Enabling technologies", "h2"],
    ["paragraph", "A long catalogue of technologies."],
    ["heading", "6 Discussion", "h2"],
    ["paragraph", "The literature synthesis distinguishes worker-centered outcomes."],
    ["heading", "7 Conclusion", "h2"],
    ["paragraph", "The framework has not been empirically validated."],
    ["heading", "References", "h2"],
    ["paragraph", "Citation metadata."],
  ]
  source.blocks = sections.map(([kind, text, tag], index) => ({
    kind,
    text,
    block_id: `${source.parse_id}:review-${index}`,
    locator: {
      type: "html",
      dom_path: tag ? `/html/body/article/${tag}` : `/html/body/article/p[${index}]`,
      text_hash: sha256(text),
    },
  }))

  const plan = planExtractionBatches([source], { extraction_scope: "research_key_findings" })
  const scope = selectExtractionScope([source], "research_key_findings").documents[0]
  const selectedText = plan.batches.flatMap((batch) =>
    JSON.parse(batch.request.messages[1].content)[0].blocks.map((block) => block.text),
  )

  assert.deepEqual(
    scope.selected_sections.map(({ category, heading }) => [category, heading]),
    [
      ["abstract", "Abstract"],
      ["conceptual_framework", "3 Concept and definition"],
      ["discussion", "6 Discussion"],
      ["conclusion", "7 Conclusion"],
    ],
  )
  assert.ok(selectedText.includes("The framework defines six operational criteria."))
  assert.ok(
    selectedText.includes("The literature synthesis distinguishes worker-centered outcomes."),
  )
  assert.ok(selectedText.includes("The framework has not been empirically validated."))
  assert.ok(!selectedText.includes("A long catalogue of technologies."))
  assert.ok(!selectedText.includes("Broad background that is not needed for the findings."))
  assert.ok(scope.included_block_count < scope.source_block_count)
})

test("research scope extraction maps every retained quote to the immutable full parse", async () => {
  const source = researchPaper(),
    output = await extractClaims(
      {
        structured: async (request) => response(request),
      },
      [source],
      {
        candidate_key: "paper",
        extraction_scope: "research_key_findings",
      },
    )
  assert.equal(output.provenance.extraction_plan.scope.profile, "research_key_findings")
  assert.ok(
    output.claims.every((claim) =>
      source.blocks.some((block) => block.block_id === claim.evidence[0].block_id),
    ),
  )
  assert.ok(output.claims.every((claim) => claim.review.structural_pass))
})

test("research key-findings scope refuses ambiguous or incomplete heading structures", () => {
  const source = researchPaper()
  source.blocks = source.blocks.filter(
    (block) => !["6 Results", "8 Limitations", "9 Conclusion"].includes(block.text),
  )
  assert.throws(
    () => planExtractionBatches([source], { extraction_scope: "research_key_findings" }),
    /sections cannot be resolved.*use full_source/i,
  )
  assert.throws(
    () => planExtractionBatches([researchPaper()], { extraction_scope: "unknown" }),
    /Unknown extraction scope/,
  )
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

test("claim extraction does not classify ongoing activity as completed", async () => {
  let request
  await extractClaims(
    {
      structured: async (value) => {
        request = value
        return response(value)
      },
    },
    [parse("ongoing-status")],
    { candidate_key: "source-ongoing-status", think: false },
  )
  assert.match(
    request.messages[0].content,
    /Use event_state "completed" only for a discrete action the source says has finished/i,
  )
  assert.match(
    request.messages[0].content,
    /"continues to participate" or "참여하고 있다" are reported facts, not completed actions/i,
  )
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
  await assert.rejects(
    main(["model-info", "--extraction-scope", "research_key_findings"]),
    /only supported for extract/,
  )
  await assert.rejects(
    main(["extract", "--run", "must-not-run", "--extraction-scope", "unknown"]),
    /extraction-scope must be/i,
  )
})

test("reparse recovers captured source bytes from a fetch stage when collection parsing failed", async (t) => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "research-reparse-fetch-stage-")),
  )
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const previous = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previous || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (previous === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previous
  })

  const url =
    "https://www.universal-robots.com/news-and-media/news-center/teradyne-robotics-appoints-jacob-pascual-pape-chief-commercial-officer/"
  const source = sourceId(url)
  const bytes = Buffer.from(`<html><head><title>Teradyne names a CCO</title></head><body>
    <sirius-heading><h1>Teradyne names a CCO</h1></sirius-heading>
    <sirius-section class="article-info-bar"><time class="sir-date">September 15, 2026</time></sirius-section>
    <sirius-section class="feature sir-default"><article class="feature"><div class="feature-body">
      <p>Teradyne Robotics appoints a commercial leader for Universal Robots and MiR.</p>
    </div></article></sirius-section>
    </body></html>`)
  const bodySha = sha256(bytes)
  const document = {
    schema_version: "source-document/v1",
    source_id: source,
    source_version_id: `${source}:${bodySha}`,
    original_url: url,
    final_url: url,
    body_path: `documents/${source}/${bodySha}/body.bin`,
    body_sha256: bodySha,
    fetch_status: "captured",
    mime_type: "text/html",
    observed_at: "2026-10-02T00:00:00.000Z",
  }
  atomicWrite(root, document.body_path, bytes)
  const failedCollect = new RunState(root, "failed-collect", { command: "collect", url })
  await failedCollect.stage(`fetch-${source}`, { url }, async () => document)

  const result = await main([
    "reparse",
    "--root",
    root,
    "--run",
    "reparse-after-parse-failure",
    "--source-run",
    "failed-collect",
  ])
  const recoveredDocuments = JSON.parse(
    fs.readFileSync(path.join(root, "runs/reparse-after-parse-failure/documents.json"), "utf8"),
  )
  const recoveredParses = JSON.parse(
    fs.readFileSync(path.join(root, "runs/reparse-after-parse-failure/parses.json"), "utf8"),
  )
  assert.equal(recoveredDocuments[0].body_sha256, bodySha)
  assert.equal(recoveredParses.length, 1)
  assert.equal(recoveredParses[0].status, "extracted")
  assert.equal(recoveredParses[0].dates.published_at, "2026-09-15")
  assert.equal(
    recoveredParses[0].blocks[0].text,
    "Teradyne Robotics appoints a commercial leader for Universal Robots and MiR.",
  )
  assert.equal(result.candidate_published, false)
})
