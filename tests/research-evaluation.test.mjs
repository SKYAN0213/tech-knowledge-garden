import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { loadStoredSourceRun } from "../scripts/research/parser.mjs"
import { loadEvaluationCase, saveEvaluationCase } from "../scripts/research/evaluation.mjs"
import { main } from "../scripts/research.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "research-evaluation-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const url = "https://example.com/announcement",
    source_id = sourceId(url),
    text = "Example plans to ship 50 units in 2027.",
    body = Buffer.from(`<html><article>${text}</article></html>`),
    source_version_id = source_id + ":" + sha256(body),
    parse_id = sha256("fixture-parser")
  const document = {
    source_id,
    source_version_id,
    original_url: url,
    final_url: url,
    fetch_status: "captured",
    observed_at: "2026-09-26T01:00:00Z",
    body_path: `sources/${source_id}/${sha256(body)}/body.bin`,
    body_sha256: sha256(body),
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id,
    source_version_id,
    parse_id,
    title: "Example production plan",
    status: "extracted",
    language: "en",
    dates: { published_at: "2026-09-11", observed_at: document.observed_at },
    blocks: [{ block_id: parse_id + ":block-0001", text, locator: { text_hash: sha256(text) } }],
    quality: { missing_pages: [] },
  }
  atomicWrite(root, document.body_path, body)
  atomicWrite(root, `parses/${parse_id}/parse.json`, parse)
  atomicWrite(root, "runs/source/documents.json", [document])
  atomicWrite(root, "runs/source/parses.json", [parse])
  const claim = {
    statement: text,
    subject: "Example",
    claim_kind: "attributed_fact",
    event_state: "planned",
    published_at: "2026-09-11",
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
  }
  const spec = {
    schema: "evaluation-spec/v1",
    case_id: "source-plan-01",
    origin: "synthetic-fixture",
    split: "development",
    event_id: "0123456789abcdef",
    sectors: ["로봇·제조"],
    languages: ["en"],
    article_kind: "사건 뉴스",
    document_scope: "full_document",
    review: {
      reviewer: "test-reviewer",
      reviewer_kind: "codex",
      reviewed_at: "2026-09-27",
      source_read: true,
      candidate_output_seen: false,
      independent_of_candidate_output: true,
      notes: "Unit-test source only, never an operational gold case.",
    },
    facts: [{ fact_id: "planned-shipment", importance: "core", claim }],
    required_explanations: [
      { id: "planned-time", text: "Shipping is planned for 2027.", fact_ids: ["planned-shipment"] },
    ],
    forbidden_transformations: [
      {
        id: "no-completion",
        text: "Do not claim that shipment was completed.",
        fact_ids: ["planned-shipment"],
      },
    ],
  }
  return { root, spec, document, parse, claim }
}

test("frozen evaluation sources survive working-cache changes and replay without adding cases", async (t) => {
  const { root, spec, document } = fixture(t)
  const first = await saveEvaluationCase(root, "import", "source", spec)
  const originalManifest = fs.readFileSync(
    path.join(root, "evaluation/fixtures/source-plan-01/manifest.json"),
  )
  assert.equal(first.status, "synthetic")
  assert.equal(first.model_evaluated, false)
  assert.deepEqual(await saveEvaluationCase(root, "import", "source", spec), first)
  assert.deepEqual(
    fs.readFileSync(path.join(root, "evaluation/fixtures/source-plan-01/manifest.json")),
    originalManifest,
  )
  atomicWrite(root, document.body_path, "A corrupt working source")
  const frozen = loadEvaluationCase(root, spec.case_id)
  assert.equal(frozen.documents[0].body_sha256, document.body_sha256)
  await assert.rejects(saveEvaluationCase(root, "import", "source", spec), /body hash/)
})

test("source-first Codex cases never become independent human gold", async (t) => {
  const { root, spec } = fixture(t)
  const direct = { ...spec, origin: "actual-source" }
  assert.equal(
    (await saveEvaluationCase(root, "import", "source", direct)).status,
    "source_reviewed_candidate",
  )
  const independent = {
    ...direct,
    case_id: "human-gold-01",
    review: { ...direct.review, reviewer_kind: "human" },
  }
  assert.equal(
    (await saveEvaluationCase(root, "import", "source", independent)).status,
    "independent_gold",
  )
  assert.equal(
    (
      await saveEvaluationCase(root, "import", "source", {
        ...independent,
        case_id: "exposed-human-01",
        review: {
          ...independent.review,
          candidate_output_seen: true,
          independent_of_candidate_output: false,
        },
      })
    ).status,
    "source_reviewed_candidate",
  )
})

test("held-out cases reject synthetic or exposed criteria and false independence", async (t) => {
  const { root, spec } = fixture(t)
  await assert.rejects(
    saveEvaluationCase(root, "import", "source", { ...spec, split: "heldout" }),
    /Held-out/,
  )
  await assert.rejects(
    saveEvaluationCase(root, "import", "source", {
      ...spec,
      origin: "actual-source",
      split: "heldout",
      review: {
        ...spec.review,
        candidate_output_seen: true,
        independent_of_candidate_output: false,
      },
    }),
    /Held-out/,
  )
  await assert.rejects(
    saveEvaluationCase(root, "import", "source", {
      ...spec,
      review: { ...spec.review, candidate_output_seen: true },
    }),
    /exposed/,
  )
})

test("gold rejects impossible dates, unsupported facts and disconnected explanations", async (t) => {
  const { root, spec } = fixture(t)
  for (const reviewed_at of ["2026-09-31", "2026-09-25", "2999-01-01"])
    await assert.rejects(
      saveEvaluationCase(root, "import", "source", {
        ...spec,
        review: { ...spec.review, reviewed_at },
      }),
      /date|precedes|future/i,
    )
  const unsupported = structuredClone(spec)
  unsupported.facts[0].claim.evidence[0].quote = "Already shipped"
  await assert.rejects(
    saveEvaluationCase(root, "import", "source", unsupported),
    /Invalid source-reviewed fact/,
  )
  const wrongDate = structuredClone(spec)
  wrongDate.facts[0].claim.published_at = "2026-09-12"
  await assert.rejects(saveEvaluationCase(root, "import", "source", wrongDate), /publication_date/)
  await assert.rejects(
    saveEvaluationCase(root, "import", "source", {
      ...spec,
      required_explanations: [
        { id: "unknown", text: "Unsupported explanation", fact_ids: ["other"] },
      ],
    }),
    /known/,
  )
  await assert.rejects(
    saveEvaluationCase(root, "import", "source", {
      ...spec,
      article_kind: "논문 해설",
      document_scope: "abstract_only",
    }),
    /full-paper/,
  )
})

test("changing criteria or tampering with a frozen case cannot replace its immutable record", async (t) => {
  const { root, spec } = fixture(t)
  await saveEvaluationCase(root, "import", "source", spec)
  const different = { ...spec, required_explanations: [] }
  await assert.rejects(saveEvaluationCase(root, "import", "source", different), /input changed/)
  const gold = readJSON(root, "evaluation/gold/source-plan-01.json")
  gold.specification.facts[0].claim.statement = "Example has shipped all units."
  atomicWrite(root, "evaluation/gold/source-plan-01.json", gold)
  assert.throws(() => loadEvaluationCase(root, spec.case_id), /manifest\/gold mismatch/)
  await assert.rejects(
    saveEvaluationCase(root, "import", "source", spec),
    /manifest\/gold mismatch/,
  )
  for (const caseId of ["../escape", "", "source/other"])
    assert.throws(() => loadEvaluationCase(root, caseId), /case id/)
})

test("source-run input refuses failed sources and copied parse changes", (t) => {
  const { root, parse } = fixture(t)
  assert.equal(loadStoredSourceRun(root, "source").parses.length, 1)
  assert.throws(() => loadStoredSourceRun(root, "../source"), /source run id/)
  const altered = { ...parse, dates: { published_at: "2026-09-12" } }
  atomicWrite(root, "runs/source/parses.json", [altered])
  assert.throws(() => loadStoredSourceRun(root, "source"), /differs/)
  atomicWrite(root, "runs/source/parses.json", [parse])
  const docs = readJSON(root, "runs/source/documents.json")
  atomicWrite(root, "runs/source/documents.json", [...docs, { fetch_status: "failed" }])
  assert.throws(() => loadStoredSourceRun(root, "source"), /unacquired/)
})

test("offline source bundle pins two independently captured versions and rejects changed evidence", async (t) => {
  const { root } = fixture(t)
  const url = "https://example.org/independent-investigation",
    source_id = sourceId(url),
    text = "Independent investigators examined the incident.",
    body = Buffer.from(`<html><article>${text}</article></html>`),
    body_sha256 = sha256(body),
    parse_id = sha256("independent-parse")
  const document = {
    source_id,
    source_version_id: `${source_id}:${body_sha256}`,
    original_url: url,
    final_url: url,
    fetch_status: "captured",
    observed_at: "2026-09-26T02:00:00Z",
    body_path: `sources/${source_id}/${body_sha256}/body.bin`,
    body_sha256,
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id,
    source_version_id: document.source_version_id,
    parse_id,
    title: "Independent investigation",
    status: "extracted",
    language: "en",
    dates: { published_at: "2026-09-12", observed_at: document.observed_at },
    blocks: [{ block_id: `${parse_id}:block-0001`, text, locator: { text_hash: sha256(text) } }],
    quality: { missing_pages: [] },
  }
  atomicWrite(root, document.body_path, body)
  atomicWrite(root, `parses/${parse_id}/parse.json`, parse)
  atomicWrite(root, "runs/independent/documents.json", [document])
  atomicWrite(root, "runs/independent/parses.json", [parse])
  const args = [
    "bundle",
    "--root",
    root,
    "--run",
    "combined",
    "--source-run",
    "source",
    "--additional-source-run",
    "independent",
  ]
  assert.deepEqual(await main(args), { sources: 2, parses: 2, candidate_published: false })
  assert.deepEqual(await main(args), { sources: 2, parses: 2, candidate_published: false })
  assert.equal(loadStoredSourceRun(root, "combined").parses.length, 2)
  const manifest = readJSON(root, "runs/combined/source-bundle.json")
  assert.deepEqual(
    manifest.source_runs.map((input) => input.source_run),
    ["source", "independent"],
  )
  await assert.rejects(
    main([
      "bundle",
      "--root",
      root,
      "--run",
      "duplicate",
      "--source-run",
      "source",
      "--additional-source-run",
      "source",
    ]),
    /unique/,
  )
  atomicWrite(root, "runs/independent/parses.json", [{ ...parse, title: "tampered" }])
  await assert.rejects(main(args), /differs/)
  atomicWrite(root, "runs/independent/parses.json", [parse])
  atomicWrite(root, document.body_path, "tampered original")
  await assert.rejects(main(args), /body hash/)
  atomicWrite(root, document.body_path, body)
  atomicWrite(root, "runs/independent/documents.json", [
    { ...document, observed_at: "2026-09-27T02:00:00Z" },
  ])
  await assert.rejects(main(args), /observation/)
  atomicWrite(root, "runs/independent/parses.json", [
    { ...parse, dates: { ...parse.dates, observed_at: "2026-09-27T02:00:00Z" } },
  ])
  await assert.rejects(main(args), /input changed/)
  assert.deepEqual(readJSON(root, "runs/combined/source-bundle.json"), manifest)
  atomicWrite(root, "runs/independent/documents.json", [document])
  atomicWrite(root, "runs/independent/parses.json", [parse])
  const outputDocuments = readJSON(root, "runs/combined/documents.json")
  atomicWrite(root, "runs/combined/documents.json", [
    outputDocuments[0],
    { ...outputDocuments[1], observed_at: "2026-09-27T02:00:00Z" },
  ])
  await assert.rejects(main(args), /observation/)
  const combinedParses = readJSON(root, "runs/combined/parses.json")
  atomicWrite(root, "runs/combined/parses.json", [
    combinedParses[0],
    {
      ...combinedParses[1],
      dates: { ...combinedParses[1].dates, observed_at: "2026-09-27T02:00:00Z" },
    },
  ])
  await assert.rejects(main(args), /Stored source bundle changed/)
  assert.equal(
    readJSON(root, "runs/combined/documents.json")[1].observed_at,
    "2026-09-27T02:00:00Z",
  )
})

test("offline reparse may retain failed captures without promoting them or weakening evidence checks", (t) => {
  const { root, parse, document } = fixture(t)
  const blocked = {
    source_id: sourceId("https://example.com/blocked"),
    original_url: "https://example.com/blocked",
    source_version_id: null,
    fetch_status: "blocked",
    observed_at: "2026-09-27T01:00:00Z",
    policy_status: "denied",
  }
  atomicWrite(root, "runs/source/documents.json", [document, blocked])
  assert.throws(() => loadStoredSourceRun(root, "source"), /unacquired/)
  const replay = loadStoredSourceRun(root, "source", { allowUnacquired: true })
  assert.deepEqual(replay.documents, [document, blocked])
  assert.deepEqual(replay.parses, [parse])
  const originalIdentity = replay.identity
  atomicWrite(root, "runs/source/documents.json", [
    document,
    { ...blocked, fetch_status: "failed" },
  ])
  assert.notDeepEqual(
    loadStoredSourceRun(root, "source", { allowUnacquired: true }).identity,
    originalIdentity,
  )
  atomicWrite(root, "runs/source/parses.json", [{ ...parse, title: "altered" }])
  assert.throws(() => loadStoredSourceRun(root, "source", { allowUnacquired: true }), /differs/)
  atomicWrite(root, "runs/source/parses.json", [parse])
  fs.writeFileSync(path.join(root, document.body_path), "tampered original")
  assert.throws(() => loadStoredSourceRun(root, "source", { allowUnacquired: true }), /body hash/)
})

test("stored-source extraction runs offline, reuses claims and refuses altered replay input", async (t) => {
  const { root, claim, document } = fixture(t)
  const previousFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = previousFetch
  })
  let modelCalls = 0
  globalThis.fetch = async (url, options) => {
    assert.ok(
      url.startsWith("http://127.0.0.1:11434/"),
      "Stored extraction must never fetch the publisher",
    )
    if (url.endsWith("/api/show"))
      return Response.json({ capabilities: ["completion"], thinking: { values: [false] } })
    if (url.endsWith("/api/tags"))
      return Response.json({ models: [{ name: "qwen3.8:27b", digest: "test-digest" }] })
    if (url.endsWith("/api/version")) return Response.json({ version: "test" })
    if (url.endsWith("/api/chat")) {
      modelCalls++
      const request = JSON.parse(options.body)
      assert.equal(request.think, false)
      assert.match(request.messages[1].content, /plans to ship/)
      const output = {
        ...claim,
        evidence: [{ block_key: "d1b1", quote: claim.evidence[0].quote, support: "direct" }],
      }
      return Response.json({
        done: true,
        done_reason: "stop",
        message: { content: JSON.stringify({ claims: [output] }) },
      })
    }
    throw Error("Unexpected local endpoint")
  }
  const args = [
    "extract",
    "--root",
    root,
    "--run",
    "model-test",
    "--source-run",
    "source",
    "--think",
    "false",
  ]
  const first = await main(args)
  assert.equal(first.claims, 1)
  assert.equal(first.candidate_published, false)
  assert.deepEqual(await main(args), first)
  assert.equal(modelCalls, 1)
  atomicWrite(root, "runs/source/documents.json", [
    { ...document, observed_at: "2026-09-26T02:00:00Z" },
  ])
  await assert.rejects(main(args), /observation/)
  const sourceParse = readJSON(root, "runs/source/parses.json")[0]
  atomicWrite(root, "runs/source/parses.json", [
    { ...sourceParse, dates: { ...sourceParse.dates, observed_at: "2026-09-26T02:00:00Z" } },
  ])
  await assert.rejects(main(args), /Run input changed/)
  assert.equal(modelCalls, 1)
  atomicWrite(root, "runs/source/documents.json", [document])
  atomicWrite(root, "runs/source/parses.json", [sourceParse])
  atomicWrite(root, document.body_path, "Corrupted source bytes")
  await assert.rejects(main(args), /body hash/)
  assert.equal(modelCalls, 1)
})

test("CLI rejects conflicting live and stored inputs before any fetch", async () => {
  await assert.rejects(
    main(["extract", "--run", "r", "--source-run", "s", "--url", "https://example.com"]),
    /combined/,
  )
  await assert.rejects(main(["collect", "--run", "r", "--source-run", "s"]), /only supported/)
  await assert.rejects(
    main(["extract", "--run", "r", "--additional-source-run", "s"]),
    /only supported/,
  )
  await assert.rejects(main(["bundle", "--run", "r", "--source-run", "s"]), /requires/)
  await assert.rejects(main(["gold-case", "--run", "r"]), /source-run and --review/)
})

test("case versions preserve the old criteria and require the identical source snapshot", async (t) => {
  const { root, spec } = fixture(t)
  await saveEvaluationCase(root, "import", "source", spec)
  const revised = {
    ...spec,
    case_id: "source-plan-02",
    supersedes: spec.case_id,
    event_id: "123456789abcdef0",
  }
  await saveEvaluationCase(root, "import", "source", revised)
  assert.equal(loadEvaluationCase(root, revised.case_id).specification.supersedes, spec.case_id)
  assert.equal(loadEvaluationCase(root, spec.case_id).specification.event_id, spec.event_id)
  await assert.rejects(
    saveEvaluationCase(root, "import", "source", { ...spec, supersedes: spec.case_id }),
    /different case/,
  )
})
