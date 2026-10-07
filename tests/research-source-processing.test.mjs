import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { editionProjection } from "../scripts/research/publish-adapter.mjs"
import { loadDailyPublicationSelection } from "../scripts/research/daily-publication-handoff.mjs"
import { processSourceRun } from "../scripts/research/source-processing.mjs"
import {
  loadFactReviewPacket,
  reviewProcessedClaims,
  assertProcessedFactReview,
} from "../scripts/research/evidence-review-packet.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { validateEvidence } from "../scripts/research/claims.mjs"
import { main } from "../scripts/research.mjs"
import { loadProcessedSourceResult } from "../scripts/research/processed-source-result.mjs"
import { processDailyCandidates } from "../scripts/research/daily-processing.mjs"
import { processDailyEditorial } from "../scripts/research/daily-editorial.mjs"
import { loadDailyProcessingStatus } from "../scripts/research/daily-processing-status.mjs"
import { articleContentFingerprint } from "../scripts/research/parser.mjs"
import { draftFingerprint } from "../scripts/research/editor.mjs"
import { loadBoundDraftCheckpoint } from "../scripts/research/draft-checkpoint.mjs"
import { buildArchiveClosure } from "../scripts/research/archive-closure.mjs"
import {
  inspectEmptyExtraction,
  loadEmptyExtractionResult,
  recordEmptyExtractionReview,
} from "../scripts/research/empty-extraction-review.mjs"
import { recordDeepDiveReview } from "../scripts/research/deep-dive.mjs"

function fixture(
  t,
  { extracted = true, concern = false, empty = false, sourceURL = "https://example.org/plan" } = {},
) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "source-process-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const url = sourceURL,
    text = "Example plans to ship 50 units in 2027."
  const source_id = sourceId(url),
    hash = sha256(text),
    parse_id = sha256("parse")
  const document = {
    source_id,
    source_version_id: `${source_id}:${hash}`,
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
    source_version_id: document.source_version_id,
    parse_id,
    title: "Shipment plans",
    status: "extracted",
    dates: { published_at: "2026-10-02", observed_at: document.observed_at },
    blocks: [{ block_id: `${parse_id}:b1`, text, locator: { text_hash: hash } }],
    quality: { missing_pages: [] },
  }
  atomicWrite(root, document.body_path, text)
  atomicWrite(root, `parses/${parse_id}/parse.json`, parse)
  atomicWrite(root, "runs/source/documents.json", [document])
  atomicWrite(root, "runs/source/parses.json", [parse])
  const fields = {
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
        source_version_id: document.source_version_id,
        parse_id,
        block_id: parse.blocks[0].block_id,
        quote: text,
        support: "direct",
      },
    ],
  }
  const candidate_key = `source-${source_id}`
  const claim = {
    schema: "research-claim/v1",
    ...fields,
    candidate_key,
    event_id: null,
    claim_id: sha256(JSON.stringify([candidate_key, text, fields.evidence])).slice(0, 24),
    subject_id: null,
    review: validateEvidence(fields, [parse]),
  }
  if (extracted)
    atomicWrite(root, "runs/source/claims.json", {
      claims: [claim],
      provenance: { model: "fixture-local" },
      requires_fact_review: true,
    })
  const settings = {
    model: "fixture:27b",
    think: false,
    num_ctx: 16384,
    num_predict: 4096,
    call_timeout_ms: 1000,
    total_timeout_ms: 5000,
  }
  const policy = {
    schema: "model-execution-policy/v1",
    roles: {
      fact_extract: {
        ...settings,
        input_char_budget: 20000,
        facts_per_batch: 6,
        extraction_timeout_ms: 5000,
      },
      evidence_compare: settings,
      article_write: settings,
    },
  }
  const policyFile = path.join(root, "policy.json")
  fs.writeFileSync(policyFile, JSON.stringify(policy))
  const calls = []
  const provider = {
    async metadata(model) {
      return {
        model,
        digest: "e".repeat(64),
        runtime: "fixture",
        capabilities: ["completion"],
        thinking: { values: [false] },
      }
    },
    async structured(request) {
      const role = this.executionPolicy.role
      calls.push(role)
      let output
      const data = JSON.parse(request.messages[1].content)
      if (role === "fact_extract") {
        output = {
          claims: [
            {
              ...fields,
              evidence: [
                {
                  block_key: data[0].blocks[0].block_key,
                  ...(this.executionPolicy.settings.evidence_quote_mode === "source_block"
                    ? {}
                    : { quote: text }),
                  support: "direct",
                },
              ],
            },
          ],
        }
      } else if (role === "evidence_compare") {
        output = {
          assessments: data.claims.map((c) => ({
            claim_id: c.claim_id,
            verdict: concern ? "insufficient" : "supported",
            checks: {
              meaning: concern ? "insufficient" : "supported",
              identity: "supported",
              numbers: "supported",
              time: "supported",
              attribution: "supported",
            },
            explanation: "원문은 출하 계획을 명시한다.",
            evidence: [{ evidence_ref: data.sources[0].blocks[0].evidence_refs[0].evidence_ref }],
          })),
        }
      } else if (role === "article_write") {
        const id = data.claims[0].claim_id
        output = {
          title: "Example 출하 계획",
          sector: "로봇·제조",
          theme: "제품·서비스",
          tags: ["신제품"],
          entities: ["Example"],
          lead: [
            { text: "Example은 10월 2일 2027년 제품 50대 출하 계획을 발표했다.", claim_ids: [id] },
            { text: "계획된 출하 수량은 50대다.", claim_ids: [id] },
          ],
          facts: {
            who: "Example",
            when: "2026-10-02",
            where: null,
            what: text,
            how: null,
            why: null,
          },
          explanations: [],
        }
      } else throw Error("Unexpected fixture role")
      if (role === "fact_extract" && empty) output = { claims: [] }
      return {
        output,
        provenance: { model: request.model, digest: "e".repeat(64), runtime: "fixture" },
      }
    },
  }
  const options = { root, run: "processed", sourceRun: "source", policyFile, provider }
  return { root, options, calls, provider, parse, claim, policy, policyFile }
}

async function decision(f, status = "verified") {
  const context = await loadFactReviewPacket(f.root, "processed")
  return {
    reviewer: "explicit fixture reviewer",
    reviewed_at: new Date().toISOString(),
    claims: context.extracted.claims.map((c) => ({
      claim_id: c.claim_id,
      status,
      reason: "출하 계획과 수량·기간을 원문과 대조했다.",
      source_read: true,
      entailment_checked: true,
      identity_checked: true,
      numbers_checked: true,
      time_checked: true,
    })),
    model_assessment: { packet_sha256: context.packet_sha256, resolutions: [] },
  }
}

test("processing reuses raw extraction and pauses at explicit fact review without writing", async (t) => {
  const f = fixture(t)
  const original = fs.readFileSync(path.join(f.root, "runs/source/claims.json"))
  const first = await processSourceRun(f.options)
  assert.equal(first.status, "fact_review")
  assert.deepEqual(f.calls, ["evidence_compare"])
  assert.equal(readJSON(f.root, "runs/processed/claims.json").claims[0].review.status, "unreviewed")
  assert.equal(readJSON(f.root, "runs/processed/draft.json"), null)
  await processSourceRun(f.options)
  assert.deepEqual(f.calls, ["evidence_compare"])
  assert.deepEqual(fs.readFileSync(path.join(f.root, "runs/source/claims.json")), original)
})

test("fresh-source processing invokes extraction then assessment but never auto-verifies", async (t) => {
  const f = fixture(t, { extracted: false })
  f.policy.roles.fact_extract.max_blocks_per_batch = 4
  fs.writeFileSync(f.policyFile, JSON.stringify(f.policy))
  const result = await processSourceRun(f.options)
  assert.equal(result.status, "fact_review")
  assert.deepEqual(f.calls, ["fact_extract", "evidence_compare"])
  assert.equal(readJSON(f.root, "runs/processed/reviewed-claims.json"), null)
  assert.equal(
    readJSON(f.root, "runs/processed/claims.json").provenance.extraction_budget
      .max_blocks_per_batch,
    4,
  )
})

test("fresh-source block selection flows through assessment and explicit review without re-generation", async (t) => {
  const f = fixture(t, { extracted: false })
  f.policy.roles.fact_extract.evidence_quote_mode = "source_block"
  fs.writeFileSync(f.policyFile, JSON.stringify(f.policy))
  const result = await processSourceRun(f.options)
  assert.equal(result.status, "fact_review")
  assert.deepEqual(f.calls, ["fact_extract", "evidence_compare"])
  const extracted = readJSON(f.root, "runs/processed/claims.json")
  assert.equal(extracted.provenance.extraction_budget.evidence_quote_mode, "source_block")
  assert.equal(extracted.claims[0].evidence[0].quote, f.claim.evidence[0].quote)
  assert.equal(extracted.claims[0].review.status, "unreviewed")
  assert.equal(readJSON(f.root, "runs/processed/reviewed-claims.json"), null)
  const { packet } = await loadFactReviewPacket(f.root, "processed")
  assert.deepEqual(packet.source_coverage, extracted.provenance.source_coverage)
  await processSourceRun(f.options)
  assert.deepEqual(f.calls, ["fact_extract", "evidence_compare"])
})

test("long-source processing retains all blocks and requires full-context resolution before writing", async (t) => {
  const f = fixture(t)
  configureLongSource(f)
  const parse = readJSON(f.root, "runs/source/parses.json")[0]
  const documents = readJSON(f.root, "runs/source/documents.json")
  const extracted = readJSON(f.root, "runs/source/claims.json")
  const body = parse.blocks.map((b) => b.text).join("\n\n")
  const first = await processSourceRun(f.options)
  assert.equal(first.status, "fact_review")
  assert.ok(f.calls.length > 1)
  assert.ok(f.calls.every((role) => role === "evidence_compare"))
  const context = await loadFactReviewPacket(f.root, "processed")
  assert.deepEqual(context.packet.sources[0].blocks, parse.blocks)
  assert.equal(context.packet.claims[0].model_assessment.requires_attention, true)
  const review = await decision(f)
  await assert.rejects(reviewProcessedClaims(f.root, "processed", review), /Resolve each/)
  const evidence = extracted.claims[0].evidence[0]
  review.model_assessment.resolutions.push({
    claim_id: extracted.claims[0].claim_id,
    outcome: "confirmed",
    reason: "전체 문단을 읽고 출하 수량은 2027년 계획이며 완료 실적이 아님을 확인했다.",
    evidence: [{ parse_id: evidence.parse_id, block_id: evidence.block_id, quote: evidence.quote }],
  })
  await reviewProcessedClaims(f.root, "processed", review)
  const compared = f.calls.length
  const result = await processSourceRun(f.options)
  assert.equal(result.status, "editorial_review")
  assert.equal(f.calls.length, compared + 1)
  assert.equal(f.calls.at(-1), "article_write")
  await processSourceRun(f.options)
  assert.equal(f.calls.length, compared + 1)
  assert.deepEqual(fs.readFileSync(path.join(f.root, documents[0].body_path)), Buffer.from(body))
})

test("an oversized atomic source block stops before extraction without changing stored source bytes", async (t) => {
  const f = fixture(t, { extracted: false })
  const documents = readJSON(f.root, "runs/source/documents.json")
  const parse = readJSON(f.root, "runs/source/parses.json")[0]
  const text = "Example plans to ship 50 units in 2027. " + "A long source paragraph. ".repeat(3360)
  const original = Buffer.from(text)
  const bodyHash = sha256(original)
  documents[0].body_sha256 = bodyHash
  documents[0].source_version_id = `${documents[0].source_id}:${bodyHash}`
  documents[0].body_path = `documents/${documents[0].source_id}/${bodyHash}/body.bin`
  parse.source_version_id = documents[0].source_version_id
  parse.parse_id = sha256("long-source-parse")
  parse.blocks = Array.from({ length: 1 }, (_, i) => ({
    block_id: `${parse.parse_id}:b${i + 1}`,
    text,
    locator: { text_hash: sha256(text) },
  }))
  atomicWrite(f.root, `parses/${parse.parse_id}/parse.json`, parse)
  atomicWrite(f.root, documents[0].body_path, original)
  atomicWrite(f.root, "runs/source/documents.json", documents)
  atomicWrite(f.root, "runs/source/parses.json", [parse])
  await assert.rejects(
    processSourceRun(f.options),
    /Full source assessment exceeds context budget before extraction/,
  )
  assert.deepEqual(f.calls, [])
  assert.equal(readJSON(f.root, "runs/processed/claims.json"), null)
  assert.deepEqual(fs.readFileSync(path.join(f.root, documents[0].body_path)), original)
})

test("completed extraction survives failed assessment and is reused under a new policy", async (t) => {
  const f = fixture(t, { extracted: false })
  const generate = f.provider.structured
  f.provider.structured = function (request) {
    if (this.executionPolicy.role === "evidence_compare")
      throw Error("Deliberate assessment failure after completed extraction")
    return generate.call(this, request)
  }
  await assert.rejects(() => processSourceRun(f.options), /Deliberate assessment failure/)
  const before = fs.readFileSync(path.join(f.root, "runs/processed/claims.json"))
  assert.equal(
    readJSON(f.root, "runs/processed/processing/state.json").stages.extraction.status,
    "complete",
  )
  f.provider.structured = generate
  f.policy.roles.evidence_compare = { ...f.policy.roles.evidence_compare, num_ctx: 32768 }
  fs.writeFileSync(f.policyFile, JSON.stringify(f.policy))
  const options = { ...f.options, run: "continued", extractionRun: "processed" }
  const result = await processSourceRun(options)
  assert.equal(result.status, "fact_review")
  assert.deepEqual(f.calls, ["fact_extract", "evidence_compare"])
  await processSourceRun(options)
  assert.deepEqual(f.calls, ["fact_extract", "evidence_compare"])
  assert.deepEqual(fs.readFileSync(path.join(f.root, "runs/processed/claims.json")), before)
  assert.equal(readJSON(f.root, "runs/continued/draft.json"), null)
  assert.equal(readJSON(f.root, "runs/continued/claims.json").claims[0].review.status, "unreviewed")
  assert.equal(
    readJSON(f.root, "runs/continued/source-processing-input.json").extraction_run,
    "processed",
  )
  const entry = {
    candidate_key: f.claim.candidate_key,
    parse_id: f.parse.parse_id,
    source_version_id: f.parse.source_version_id,
    content_sha256: articleContentFingerprint(f.parse),
    source_urls: ["https://example.org/plan"],
  }
  const reused = await loadProcessedSourceResult(f.root, "continued", entry)
  assert.equal(reused.status, "fact_review")
  assert.equal(reused.extraction_run, "processed")
  const closure = buildArchiveClosure(f.root, "portable", "continued")
  assert.ok(
    closure.dependencies.some(
      (edge) => edge.kind === "processing_extraction" && edge.to === "processed",
    ),
  )
  assert.ok(closure.files.some((file) => file.path === "runs/processed/processing/extraction.json"))
  const changed = readJSON(f.root, "runs/processed/processing/state.json")
  changed.stages.extraction.status = "failed"
  atomicWrite(f.root, "runs/processed/processing/state.json", changed)
  await assert.rejects(
    () => loadProcessedSourceResult(f.root, "continued", entry),
    /Completed source-bound extraction/,
  )
  assert.throws(
    () => buildArchiveClosure(f.root, "portable-invalid", "continued"),
    /Completed source-bound extraction/,
  )
})

test("extraction reuse rejects changed source, incomplete checkpoints and altered claims before inference", async (t) => {
  const f = fixture(t)
  await processSourceRun(f.options)
  const options = { ...f.options, run: "continued", extractionRun: "processed" }
  const originalParse = structuredClone(f.parse)
  const changed = { ...f.parse, parse_id: sha256("another-parse"), title: "Another document" }
  changed.blocks = f.parse.blocks.map((block) => ({ ...block, block_id: `${changed.parse_id}:b1` }))
  atomicWrite(f.root, `parses/${changed.parse_id}/parse.json`, changed)
  atomicWrite(f.root, "runs/source/parses.json", [changed])
  await assert.rejects(() => processSourceRun(options), /exact selected documents/)
  atomicWrite(f.root, `parses/${f.parse.parse_id}/parse.json`, originalParse)
  atomicWrite(f.root, "runs/source/parses.json", [originalParse])
  const state = readJSON(f.root, "runs/processed/processing/state.json")
  const originalState = structuredClone(state)
  state.stages.extraction.status = "failed"
  atomicWrite(f.root, "runs/processed/processing/state.json", state)
  await assert.rejects(() => processSourceRun(options), /Completed source-bound extraction/)
  atomicWrite(f.root, "runs/processed/processing/state.json", originalState)
  const claims = readJSON(f.root, "runs/processed/claims.json")
  claims.claims[0].statement = "Invented replacement"
  atomicWrite(f.root, "runs/processed/claims.json", claims)
  await assert.rejects(() => processSourceRun(options), /Completed source-bound extraction/)
  assert.deepEqual(f.calls, ["evidence_compare"])
  assert.equal(readJSON(f.root, "runs/continued/source-processing-input.json"), null)
})

test("processed paper retains reviewed deep basis through writing and resume", async (t) => {
  // Synthetic source tests the binding pipeline; it is never a research case.
  const f = fixture(t, { sourceURL: "https://research.example.edu/paper" })
  await processSourceRun(f.options)
  const factDecision = await decision(f)
  const reviewed = await reviewProcessedClaims(f.root, "processed", factDecision)
  const documents = readJSON(f.root, "runs/processed/documents.json")
  const parses = readJSON(f.root, "runs/processed/parses.json")
  const ids = reviewed.claims.map((c) => c.claim_id)
  const roles = ["problem", "method", "conditions", "comparison", "results"]
  const input = {
    schema: "deep-dive-input/v1",
    kind: "논문 해설",
    topic_ids: ["synthetic-paper-topic"],
    event_claim_ids: ids,
    basis: roles.map((role) => ({ role, claim_ids: ids })),
    sources: [
      {
        source_version_id: documents[0].source_version_id,
        organization_id: "example-university",
        organization_kind: "university",
        scope: "full_document",
      },
    ],
    papers: [
      {
        work_id: "synthetic-paper",
        identifiers: ["url:" + documents[0].original_url],
        access: "전문",
        status: null,
        evidence_url: documents[0].original_url,
        full_text_source_version_id: documents[0].source_version_id,
        claim_ids: ids,
      },
    ],
    relations: [],
  }
  const context = recordDeepDiveReview(input, reviewed.claims, parses, documents, {
    reviewer: "synthetic source reviewer",
    reviewed_at: new Date().toISOString(),
    source_read: true,
    source_roles_checked: true,
    basis_checked: true,
    identities_checked: true,
    scope_checked: true,
  })
  atomicWrite(f.root, "runs/processed/deep-context.json", context)
  const generate = f.provider.structured
  f.provider.structured = async function (request) {
    const result = await generate.call(this, request)
    if (this.executionPolicy.role === "article_write") {
      assert.equal(JSON.parse(request.messages[1].content).deep_basis.kind, "논문 해설")
      result.output.analysis = null
      result.output.explanations = roles.map((role) => ({
        role,
        heading: "Synthetic " + role,
        paragraphs: [{ text: f.claim.statement, claim_ids: ids }],
      }))
    }
    return result
  }
  assert.equal((await processSourceRun(f.options)).status, "editorial_review")
  const draft = readJSON(f.root, "runs/processed/draft.json")
  assert.deepEqual(draft.deep_context, context)
  assert.deepEqual(draft.problems, [])
  assert.equal((await processSourceRun(f.options)).draft_reused, true)
  assert.deepEqual(f.calls, ["evidence_compare", "article_write"])
  const reusedOptions = {
    ...f.options,
    run: "deep-reuse",
    assessmentRun: "processed",
    draftRun: "processed",
  }
  assert.equal((await processSourceRun(reusedOptions)).status, "fact_review")
  const reusedPacket = await loadFactReviewPacket(f.root, "deep-reuse")
  await reviewProcessedClaims(f.root, "deep-reuse", {
    ...factDecision,
    model_assessment: {
      ...factDecision.model_assessment,
      packet_sha256: reusedPacket.packet_sha256,
    },
  })
  atomicWrite(f.root, "runs/deep-reuse/deep-context.json", context)
  assert.equal((await processSourceRun(reusedOptions)).draft_reused, true)
  assert.deepEqual(readJSON(f.root, "runs/deep-reuse/draft.json"), draft)
  assert.deepEqual(f.calls, ["evidence_compare", "article_write"])
  const changed = structuredClone(context)
  changed.review.scope_checked = false
  atomicWrite(f.root, "runs/processed/deep-context.json", changed)
  await assert.rejects(processSourceRun(f.options), /Explicit deep-dive|deep.*changed/i)
  assert.deepEqual(f.calls, ["evidence_compare", "article_write"])
})

test("explicit packet acknowledgment permits drafting and resumes without generation", async (t) => {
  const f = fixture(t)
  await processSourceRun(f.options)
  const reviewed = await reviewProcessedClaims(f.root, "processed", await decision(f))
  assert.equal(reviewed.claims[0].review.status, "verified")
  const result = await processSourceRun(f.options)
  assert.equal(result.status, "editorial_review")
  assert.equal(result.public_approved, false)
  await processSourceRun(f.options)
  assert.deepEqual(f.calls, ["evidence_compare", "article_write"])
})

test("model concerns require a concrete source resolution before verification", async (t) => {
  const f = fixture(t, { concern: true })
  await processSourceRun(f.options)
  const d = await decision(f)
  await assert.rejects(() => reviewProcessedClaims(f.root, "processed", d), /Resolve each/)
  d.model_assessment.resolutions = [
    {
      claim_id: f.claim.claim_id,
      outcome: "confirmed",
      reason: "원문은 미래 출하 계획을 직접 명시한다.",
      evidence: [
        {
          parse_id: f.parse.parse_id,
          block_id: f.parse.blocks[0].block_id,
          quote: f.parse.blocks[0].text,
        },
      ],
    },
  ]
  const invalid = structuredClone(d)
  invalid.model_assessment.resolutions[0].evidence[0].quote = "Invented evidence"
  await assert.rejects(() => reviewProcessedClaims(f.root, "processed", invalid), /exact source/)
  await reviewProcessedClaims(f.root, "processed", d)
  assert.equal((await processSourceRun(f.options)).status, "editorial_review")
})

test("legacy draft/provisional and review commands cannot bypass the processing packet", async (t) => {
  const f = fixture(t)
  await processSourceRun(f.options)
  await assert.rejects(
    main(["draft", "--root", f.root, "--run", "processed", "--provisional"]),
    /explicit processing fact review/,
  )
  const d = await decision(f)
  delete d.model_assessment
  const file = path.join(f.root, "review.json")
  fs.writeFileSync(file, JSON.stringify(d))
  await assert.rejects(
    main(["review", "--root", f.root, "--run", "processed", "--review", file]),
    /acknowledgment/,
  )
  assert.equal(readJSON(f.root, "runs/processed/reviewed-claims.json"), null)
  fs.unlinkSync(path.join(f.root, "runs/processed/source-processing-input.json"))
  await assert.rejects(
    main(["review", "--root", f.root, "--run", "processed", "--review", file]),
    /processing input/,
  )
  assert.equal(readJSON(f.root, "runs/processed/draft.json"), null)
})

test("modified packet, source, policy and reviewed facts cannot resume as valid", async (t) => {
  const f = fixture(t)
  await processSourceRun(f.options)
  const d = await decision(f)
  const reviewed = await reviewProcessedClaims(f.root, "processed", d)
  const altered = structuredClone(reviewed)
  altered.claims[0].statement = "Example finished shipping."
  atomicWrite(f.root, "runs/processed/reviewed-claims.json", altered)
  await assert.rejects(
    () => assertProcessedFactReview(f.root, "processed", altered),
    /review changed/,
  )
  atomicWrite(f.root, "runs/processed/reviewed-claims.json", reviewed)
  const packet = readJSON(f.root, "runs/processed/fact-review-packet.json")
  packet.claims[0].model_assessment.verdict = "contradicted"
  atomicWrite(f.root, "runs/processed/fact-review-packet.json", packet)
  await assert.rejects(
    () => loadFactReviewPacket(f.root, "processed"),
    /packet or source binding changed/,
  )
  f.policy.roles.article_write.num_predict = 2048
  fs.writeFileSync(f.policyFile, JSON.stringify(f.policy))
  await assert.rejects(() => processSourceRun(f.options), /artifact changed/)
  assert.deepEqual(f.calls, ["evidence_compare"])
})

test("failed semantic assessment cannot yield a review packet or draft", async (t) => {
  const f = fixture(t)
  f.provider.structured = async () => {
    throw Error("Fixture comparison failed")
  }
  await assert.rejects(() => processSourceRun(f.options), /Fixture comparison failed/)
  assert.equal(readJSON(f.root, "runs/processed/fact-review-packet.json"), null)
  assert.equal(readJSON(f.root, "runs/processed/draft.json"), null)
})

test("deferred facts never call the article writer", async (t) => {
  const f = fixture(t)
  await processSourceRun(f.options)
  await reviewProcessedClaims(f.root, "processed", await decision(f, "deferred"))
  assert.equal((await processSourceRun(f.options)).status, "reviewed_without_publishable_facts")
  assert.deepEqual(f.calls, ["evidence_compare"])
})

test("an exact prior assessment is reused without another comparison", async (t) => {
  const f = fixture(t)
  await processSourceRun(f.options)
  const result = await processSourceRun({ ...f.options, run: "reuse", assessmentRun: "processed" })
  assert.equal(result.status, "fact_review")
  assert.deepEqual(f.calls, ["evidence_compare"])
})

test("reuse of a completed assessment survives model replacement without metadata or ledger writes", async (t) => {
  const f = fixture(t)
  await processSourceRun(f.options)
  const file = path.join(f.root, "runs/processed/model-policy/evidence_compare/budget.json")
  const before = fs.readFileSync(file)
  const policy = JSON.parse(fs.readFileSync(f.options.policyFile))
  policy.roles.evidence_compare.model = "replacement-local-model"
  fs.writeFileSync(f.options.policyFile, JSON.stringify(policy))
  f.provider.metadata = async () => {
    throw Error("Deleted original model must not be requested")
  }
  const options = { ...f.options, run: "replacement-reuse", assessmentRun: "processed" }
  assert.equal((await processSourceRun(options)).status, "fact_review")
  assert.equal((await processSourceRun(options)).status, "fact_review")
  assert.deepEqual(fs.readFileSync(file), before)
  assert.equal(
    readJSON(f.root, "runs/replacement-reuse/model-policy/evidence_compare/budget.json"),
    null,
  )
  assert.deepEqual(f.calls, ["evidence_compare"])
})

test("editorial correction survives resume and immutable generation reuse without another model call", async (t) => {
  const f = fixture(t)
  await processSourceRun(f.options)
  await reviewProcessedClaims(f.root, "processed", await decision(f))
  await processSourceRun(f.options)
  const original = readJSON(f.root, "runs/processed/draft.json")
  const correction = {
    draft_id: original.draft_id,
    reviewer: "source editor",
    reason: "제목의 출하 계획 시점을 명시한다.",
    reviewed_at: new Date().toISOString(),
    draft: { ...original.draft, title: "Example, 2027년 50대 출하 계획" },
  }
  const file = path.join(f.root, "correction.json")
  fs.writeFileSync(file, JSON.stringify(correction))
  await main(["correct", "--root", f.root, "--run", "processed", "--review", file])
  const corrected = fs.readFileSync(path.join(f.root, "runs/processed/draft.json"))
  assert.equal((await processSourceRun(f.options)).draft_reused, true)
  assert.deepEqual(fs.readFileSync(path.join(f.root, "runs/processed/draft.json")), corrected)
  assert.deepEqual(f.calls, ["evidence_compare", "article_write"])
  const reviewed = readJSON(f.root, "runs/processed/reviewed-claims.json")
  const reuseOptions = {
    documents: readJSON(f.root, "runs/processed/documents.json"),
    parses: readJSON(f.root, "runs/processed/parses.json"),
  }
  const reused = loadBoundDraftCheckpoint(f.root, "processed", reviewed.claims, reuseOptions)
  assert.deepEqual(reused.record, original)
  assert.notEqual(reused.record.draft_id, JSON.parse(corrected).draft_id)
  assert.deepEqual(fs.readFileSync(path.join(f.root, "runs/processed/draft.json")), corrected)
  assert.deepEqual(f.calls, ["evidence_compare", "article_write"])
  atomicWrite(f.root, `runs/processed/corrections/${sha256(JSON.stringify(correction))}.json`, {
    ...correction,
    reason: "tampered",
  })
  await assert.rejects(() => processSourceRun(f.options), /correction history changed/)
  assert.throws(
    () => loadBoundDraftCheckpoint(f.root, "processed", reviewed.claims, reuseOptions),
    /correction history changed/,
  )
  assert.deepEqual(f.calls, ["evidence_compare", "article_write"])
})

test("a new processing run reuses exact reviewed generation without duplicate inference", async (t) => {
  const f = fixture(t)
  await processSourceRun(f.options)
  const review = await decision(f)
  await reviewProcessedClaims(f.root, "processed", review)
  await processSourceRun(f.options)
  const options = { ...f.options, run: "reuse", assessmentRun: "processed", draftRun: "processed" }
  await processSourceRun(options)
  review.model_assessment.packet_sha256 = (
    await loadFactReviewPacket(f.root, "reuse")
  ).packet_sha256
  await reviewProcessedClaims(f.root, "reuse", review)
  const result = await processSourceRun(options)
  assert.equal(result.draft_reused, true)
  assert.deepEqual(f.calls, ["evidence_compare", "article_write"])
  assert.equal((await processSourceRun(options)).draft_reused, true)
  const ref = readJSON(f.root, "runs/reuse/draft-generation-reference.json")
  ref.output_sha256 = "0".repeat(64)
  atomicWrite(f.root, "runs/reuse/draft-generation-reference.json", ref)
  await assert.rejects(() => processSourceRun(options), /generation binding changed/)
})

test("completed writer reuse survives model replacement without metadata or budget writes", async (t) => {
  const f = fixture(t)
  await processSourceRun(f.options)
  const review = await decision(f)
  await reviewProcessedClaims(f.root, "processed", review)
  await processSourceRun(f.options)
  const budget = path.join(f.root, "runs/processed/model-policy/article_write/budget.json")
  const before = fs.readFileSync(budget)
  const policy = JSON.parse(fs.readFileSync(f.policyFile))
  policy.roles.article_write.model = "replacement-local-model"
  fs.writeFileSync(f.policyFile, JSON.stringify(policy))
  f.provider.metadata = async () => {
    throw Error("Deleted writer model must not be requested")
  }
  const options = {
    ...f.options,
    run: "replacement-writer",
    assessmentRun: "processed",
    draftRun: "processed",
  }
  await processSourceRun(options)
  review.model_assessment.packet_sha256 = (
    await loadFactReviewPacket(f.root, options.run)
  ).packet_sha256
  await reviewProcessedClaims(f.root, options.run, review)
  assert.equal((await processSourceRun(options)).draft_reused, true)
  assert.equal((await processSourceRun(options)).draft_reused, true)
  assert.deepEqual(fs.readFileSync(budget), before)
  assert.equal(readJSON(f.root, `runs/${options.run}/model-policy/article_write/budget.json`), null)
  assert.deepEqual(f.calls, ["evidence_compare", "article_write"])
})

test("historical writer reuse rejects changed facts, source, output, budget and working edits", async (t) => {
  const cases = {
    facts: (f) => {
      const facts = readJSON(f.root, "runs/processed/reviewed-claims.json").claims
      facts[0].review.reason = "changed review"
      atomicWrite(f.root, "runs/processed/reviewed-claims.json", { claims: facts })
    },
    source: (f) => {
      const docs = readJSON(f.root, "runs/processed/documents.json")
      docs[0].original_url = "https://example.org/different"
      atomicWrite(f.root, "runs/processed/documents.json", docs)
    },
    output: (f) => {
      const receipt = readJSON(f.root, "runs/processed/model-draft-checkpoint.json")
      fs.appendFileSync(path.join(f.root, receipt.output_path), " ")
    },
    budget: (f) => {
      const ledger = readJSON(f.root, "runs/processed/model-policy/article_write/budget.json")
      ledger.attempts[0].wall_ms++
      atomicWrite(f.root, "runs/processed/model-policy/article_write/budget.json", ledger)
    },
    result: (f) => {
      const { sha256: seal, ...ledger } = readJSON(
        f.root,
        "runs/processed/model-policy/article_write/budget.json",
      )
      ledger.attempts[0].result.output.title = "Different recorded generation"
      ledger.attempts[0].result_sha256 = sha256(JSON.stringify(ledger.attempts[0].result))
      atomicWrite(f.root, "runs/processed/model-policy/article_write/budget.json", {
        ...ledger,
        sha256: sha256(JSON.stringify(ledger)),
      })
    },
    working: (f) => {
      const draft = readJSON(f.root, "runs/processed/draft.json")
      draft.draft.title = "Edited working draft"
      atomicWrite(f.root, "runs/processed/draft.json", draft)
    },
    incomplete: (f) =>
      fs.unlinkSync(path.join(f.root, "runs/processed/model-draft-checkpoint.json")),
  }
  for (const [name, mutate] of Object.entries(cases))
    await t.test(name, async (t) => {
      const f = fixture(t)
      await processSourceRun(f.options)
      await reviewProcessedClaims(f.root, "processed", await decision(f))
      await processSourceRun(f.options)
      const load = () =>
        loadBoundDraftCheckpoint(
          f.root,
          "processed",
          readJSON(f.root, "runs/processed/reviewed-claims.json").claims,
          {
            documents: readJSON(f.root, "runs/processed/documents.json"),
            parses: readJSON(f.root, "runs/processed/parses.json"),
          },
        )
      assert.equal(load().reused, true)
      mutate(f)
      assert.throws(
        load,
        name === "budget" ? /Model budget hash mismatch/ : /changed|differs|required/,
      )
      assert.deepEqual(f.calls, ["evidence_compare", "article_write"])
    })
})

test("development fixtures and irrelevant CLI flags are rejected", async (t) => {
  const f = fixture(t)
  await assert.rejects(
    main([
      "process-source",
      "--root",
      f.root,
      "--run",
      "x",
      "--source-run",
      "source",
      "--think",
      "false",
    ]),
    /Unsupported process-source option/,
  )
  const envelope = readJSON(f.root, "runs/source/claims.json")
  envelope.development_fixture = true
  atomicWrite(f.root, "runs/source/claims.json", envelope)
  await assert.rejects(() => processSourceRun(f.options), /Development fixtures/)
  assert.deepEqual(f.calls, [])
})

test("a headline-only subject requires identity resolution even when the model supports it", async (t) => {
  const f = fixture(t)
  f.parse.title = "Example Process ships products"
  atomicWrite(f.root, `parses/${f.parse.parse_id}/parse.json`, f.parse)
  atomicWrite(f.root, "runs/source/parses.json", [f.parse])
  const extraction = readJSON(f.root, "runs/source/claims.json")
  extraction.claims[0].subject = "Example Process"
  atomicWrite(f.root, "runs/source/claims.json", extraction)
  const result = await processSourceRun(f.options)
  assert.equal(result.requires_attention, 1)
  const context = await loadFactReviewPacket(f.root, "processed")
  assert.equal(context.packet.claims[0].model_assessment.requires_attention, false)
  assert.equal(context.packet.claims[0].identity_attention.reason, "subject_only_in_title")
  const d = await decision(f)
  await assert.rejects(() => reviewProcessedClaims(f.root, "processed", d), /Resolve each/)
  d.claims[0].replacement = { subject: "Example" }
  d.model_assessment.resolutions = [
    {
      claim_id: f.claim.claim_id,
      outcome: "corrected",
      reason: "제목 동사를 회사명으로 읽은 결과를 본문의 주체로 정정한다.",
      evidence: [
        {
          parse_id: f.parse.parse_id,
          block_id: f.parse.blocks[0].block_id,
          quote: f.parse.blocks[0].text,
        },
      ],
    },
  ]
  await reviewProcessedClaims(f.root, "processed", d)
  assert.equal((await processSourceRun(f.options)).status, "editorial_review")
})

function reuseEntry(f) {
  const document = readJSON(f.root, "runs/source/documents.json")[0]
  return {
    candidate_key: f.claim.candidate_key,
    next_route: "historical-review",
    event_id: null,
    source_evidence_state: "exact",
    source_version_id: document.source_version_id,
    parse_id: f.parse.parse_id,
    content_sha256: articleContentFingerprint(f.parse),
    source_urls: [document.original_url],
  }
}

function emptyReview(f, decision = "extraction_missed_event") {
  return {
    schema: "editorial-empty-extraction-review/v1",
    binding: inspectEmptyExtraction(f.root, "processed").binding,
    decision,
    reviewer: "explicit fixture reviewer",
    reviewed_at: new Date().toISOString(),
    source_read: true,
    reason: "원문에 출하 계획이 있지만 모델이 사건을 추출하지 않았다.",
    anchors: [
      {
        source_version_id: f.parse.source_version_id,
        parse_id: f.parse.parse_id,
        block_id: f.parse.blocks[0].block_id,
        quote: f.parse.blocks[0].text,
      },
    ],
    public_approved: false,
    candidate_published: false,
  }
}

test("empty extraction stops before assessment and reuses its completed checkpoint without a model", async (t) => {
  const f = fixture(t, { extracted: false, empty: true })
  const result = await processSourceRun(f.options)
  assert.equal(result.status, "empty_extraction_review")
  assert.equal(result.model_calls, 1)
  assert.deepEqual(f.calls, ["fact_extract"])
  assert.equal(readJSON(f.root, "runs/processed/fact-review-packet.json"), null)
  const before = fs.readFileSync(path.join(f.root, "runs/processed/claims.json"))
  assert.equal(
    (await loadProcessedSourceResult(f.root, "processed", reuseEntry(f))).status,
    "empty_extraction_review",
  )
  const reused = await processSourceRun({
    ...f.options,
    run: "reused-empty",
    extractionRun: "processed",
    provider: {
      metadata() {
        throw Error("No metadata calls allowed")
      },
    },
  })
  assert.equal(reused.status, "empty_extraction_review")
  assert.equal(reused.model_calls, 0)
  assert.deepEqual(fs.readFileSync(path.join(f.root, "runs/processed/claims.json")), before)
  assert.deepEqual(f.calls, ["fact_extract"])
})

test("empty extraction review connects exact completed recovery and is immutable", async (t) => {
  const f = fixture(t, { extracted: false, empty: true })
  await processSourceRun(f.options)
  const g = fixture(t, { extracted: false })
  await processSourceRun({ ...f.options, run: "positive", provider: g.provider })
  const review = { ...emptyReview(f), followup_run: "positive" }
  atomicWrite(f.root, "empty-review.json", review)
  const before = fs.readFileSync(path.join(f.root, "runs/processed/processing/state.json"))
  const result = await main([
    "review-empty-extraction",
    "--root",
    f.root,
    "--run",
    "reviewed-empty",
    "--source-run",
    "processed",
    "--review",
    "empty-review.json",
  ])
  assert.equal(result.status, "empty_extraction_recovered")
  assert.equal(result.recovery.claims, 1)
  assert.equal(result.model_calls, 0)
  assert.equal(result.public_approved, false)
  assert.deepEqual(
    await recordEmptyExtractionReview({
      root: f.root,
      run: "reviewed-empty",
      sourceRun: "processed",
      reviewFile: "empty-review.json",
    }),
    result,
  )
  assert.equal(
    (await loadProcessedSourceResult(f.root, "processed", reuseEntry(f))).status,
    "empty_extraction_recovered",
  )
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/processed/processing/state.json")),
    before,
  )
  await assert.rejects(
    () =>
      recordEmptyExtractionReview({
        root: f.root,
        run: "different-review",
        sourceRun: "processed",
        reviewFile: "empty-review.json",
      }),
    /already reviewed/,
  )
  const changed = readJSON(f.root, "runs/reviewed-empty/empty-extraction-review.json")
  changed.recovery.claims = 2
  atomicWrite(f.root, "runs/reviewed-empty/empty-extraction-review.json", changed)
  assert.throws(() => loadEmptyExtractionResult(f.root, "processed"), /reference changed/)
})

test("empty extraction no-event and deferred outcomes require explicit source review", async (t) => {
  for (const decision of [
    "no_publishable_event",
    "source_review_deferred",
    "extraction_missed_event",
  ]) {
    const f = fixture(t, { extracted: false, empty: true })
    await processSourceRun(f.options)
    const review = emptyReview(f, decision)
    if (decision === "source_review_deferred")
      Object.assign(review, {
        source_read: false,
        anchors: [],
        reason: "원문 사건 여부는 추가 검토가 필요하다.",
      })
    if (decision === "no_publishable_event") {
      review.event_check = Object.fromEntries(
        [
          "new_product",
          "research_result",
          "customer_adoption",
          "contract",
          "strategy_change",
          "operating_result",
          "technical_change",
        ].map((key) => [key, false]),
      )
      review.event_check.notes = "테스트의 명시적 검토 입력이며 자동 판정이 아니다."
    }
    atomicWrite(f.root, "empty-review.json", review)
    const result = await recordEmptyExtractionReview({
      root: f.root,
      run: "review",
      sourceRun: "processed",
      reviewFile: "empty-review.json",
    })
    assert.equal(
      result.status,
      {
        no_publishable_event: "empty_extraction_no_event",
        source_review_deferred: "empty_extraction_source_deferred",
        extraction_missed_event: "empty_extraction_recovery_required",
      }[decision],
    )
    assert.equal(result.candidate_published, false)
    assert.equal(result.public_approved, false)
  }
})

test("empty extraction rejects unsealed sources, changed checkpoints and invented review evidence", async (t) => {
  for (const scenario of [
    "raw-empty",
    "checkpoint",
    "budget",
    "binding",
    "quote",
    "unread",
    "no-checks",
    "empty-followup",
    "approval",
  ]) {
    await t.test(scenario, async (t) => {
      const f = fixture(t, { extracted: false, empty: true })
      await processSourceRun(f.options)
      const review = emptyReview(f)
      if (scenario === "raw-empty") {
        atomicWrite(
          f.root,
          "runs/source/claims.json",
          readJSON(f.root, "runs/processed/claims.json"),
        )
        await assert.rejects(
          () => processSourceRun({ ...f.options, run: "unsealed" }),
          /completed --extraction-run/,
        )
        return
      }
      if (scenario === "checkpoint")
        atomicWrite(f.root, "runs/processed/processing/extraction.json", {
          claims: [],
          provenance: { model: "forged" },
        })
      if (scenario === "budget") {
        const budget = readJSON(f.root, "runs/processed/model-policy/fact_extract/budget.json")
        budget.attempts[0].wall_ms += 1
        atomicWrite(f.root, "runs/processed/model-policy/fact_extract/budget.json", budget)
      }
      if (scenario === "binding") review.binding.claims_sha256 = "a".repeat(64)
      if (scenario === "quote") review.anchors[0].quote = "This source says nothing."
      if (scenario === "unread") review.source_read = false
      if (scenario === "no-checks") review.decision = "no_publishable_event"
      if (scenario === "empty-followup") {
        await processSourceRun({ ...f.options, run: "still-empty", extractionRun: "processed" })
        review.followup_run = "still-empty"
      }
      if (scenario === "approval") atomicWrite(f.root, "runs/processed/approved-article.json", {})
      atomicWrite(f.root, "empty-review.json", review)
      await assert.rejects(() =>
        recordEmptyExtractionReview({
          root: f.root,
          run: "review",
          sourceRun: "processed",
          reviewFile: "empty-review.json",
        }),
      )
      assert.equal(readJSON(f.root, "runs/processed/empty-extraction-review-reference.json"), null)
    })
  }
})

test("empty extraction daily reuse exposes its review gate without processing or candidate approval", async (t) => {
  const f = fixture(t, { extracted: false, empty: true })
  await processSourceRun(f.options)
  const entry = reuseEntry(f),
    key = entry.candidate_key
  const handoff = {
    schema: "research-editorial-handoff/v1",
    daily_run: "daily",
    pending: [
      {
        ...entry,
        key,
        article_source_version_id: entry.source_version_id,
        article_parse_id: entry.parse_id,
        article_content_sha256: entry.content_sha256,
      },
    ],
  }
  atomicWrite(f.root, "handoff.json", handoff)
  const result = await processDailyCandidates({
    root: f.root,
    runId: "empty-daily",
    dailyRunId: "daily",
    candidateKeys: [key],
    policyFile: f.policyFile,
    processingRuns: { [key]: "processed" },
    handoffLoader: async () => ({ path: "handoff.json", value: handoff }),
    processor: async () => {
      throw Error("No retry allowed")
    },
    execute: true,
  })
  assert.deepEqual(result.counts, { empty_extraction_review: 1 })
  assert.equal(
    loadDailyProcessingStatus(f.root).runs[0].results[0].status,
    "empty_extraction_review",
  )
  assert.deepEqual(f.calls, ["fact_extract"])
})

test("empty extraction archive follows exact review and recovery from either entry point", async (t) => {
  const f = fixture(t, { extracted: false, empty: true })
  await processSourceRun(f.options)
  const g = fixture(t, { extracted: false })
  await processSourceRun({ ...f.options, run: "positive", provider: g.provider })
  atomicWrite(f.root, "empty-review.json", { ...emptyReview(f), followup_run: "positive" })
  await recordEmptyExtractionReview({
    root: f.root,
    run: "review",
    sourceRun: "processed",
    reviewFile: "empty-review.json",
  })
  for (const entry of ["processed", "review"]) {
    const closure = buildArchiveClosure(f.root, "portable-" + entry, entry)
    assert.ok(closure.files.some((file) => file.path === "runs/positive/claims.json"))
    assert.ok(
      closure.files.some((file) => file.path === "runs/review/empty-extraction-review.json"),
    )
  }
  atomicWrite(f.root, "runs/review/empty-extraction-review-input.json", {
    ...emptyReview(f),
    reason: "changed review",
  })
  assert.throws(() => buildArchiveClosure(f.root, "changed", "processed"), /reference changed/)
})

test("read-only reuse reports fact, writer and editorial gates without a model", async (t) => {
  const f = fixture(t)
  await processSourceRun(f.options)
  const entry = reuseEntry(f)
  const first = await loadProcessedSourceResult(f.root, "processed", entry)
  assert.equal(first.status, "fact_review")
  assert.equal(first.model_calls, 0)
  const d = await decision(f)
  await reviewProcessedClaims(f.root, "processed", d)
  assert.equal(
    (await loadProcessedSourceResult(f.root, "processed", entry)).status,
    "writer_required",
  )
  await processSourceRun(f.options)
  f.provider.metadata = async () => {
    throw Error("No installed model for this read")
  }
  const before = [...f.calls]
  const result = await loadProcessedSourceResult(f.root, "processed", entry)
  assert.equal(result.status, "editorial_review")
  assert.equal(result.model_calls, 0)
  assert.deepEqual(f.calls, before)
})

test("read-only reuse preserves raw source identity while accepting its canonical candidate URL", async (t) => {
  const f = fixture(t, { sourceURL: "https://example.org/plan/" })
  await processSourceRun(f.options)
  const entry = {
    ...reuseEntry(f),
    candidate_key: `source-${sourceId("https://example.org/plan")}`,
    source_urls: ["https://example.org/plan"],
  }
  const result = await loadProcessedSourceResult(f.root, "processed", entry)
  assert.equal(result.status, "fact_review")
  assert.equal(result.source_candidate_key, f.claim.candidate_key)
  assert.equal(result.candidate_url_identity, "canonical")
  assert.equal(result.model_calls, 0)
  await assert.rejects(
    () =>
      loadProcessedSourceResult(f.root, "processed", {
        ...entry,
        candidate_key: `source-${sourceId("https://example.org/other")}`,
      }),
    /same exact candidate/,
  )
  await assert.rejects(
    () =>
      loadProcessedSourceResult(f.root, "processed", {
        ...entry,
        source_urls: ["https://example.org/plan?edition=2"],
      }),
    /differs from the candidate/,
  )
  assert.deepEqual(f.calls, ["evidence_compare"])
})

test("reused results reject a different candidate, source, incomplete packet and changed source", async (t) => {
  const f = fixture(t)
  await processSourceRun(f.options)
  const entry = reuseEntry(f)
  await assert.rejects(
    () => loadProcessedSourceResult(f.root, "processed", { ...entry, candidate_key: "other" }),
    /same exact candidate/,
  )
  await assert.rejects(
    () => loadProcessedSourceResult(f.root, "processed", { ...entry, parse_id: "a".repeat(64) }),
    /differs from the candidate/,
  )
  const packet = readJSON(f.root, "runs/processed/fact-review-packet.json")
  fs.unlinkSync(path.join(f.root, "runs/processed/fact-review-packet.json"))
  await assert.rejects(() => loadProcessedSourceResult(f.root, "processed", entry))
  atomicWrite(f.root, "runs/processed/fact-review-packet.json", packet)
  atomicWrite(f.root, readJSON(f.root, "runs/source/documents.json")[0].body_path, "Changed source")
  await assert.rejects(
    () => loadProcessedSourceResult(f.root, "processed", entry),
    /body hash mismatch/,
  )
  assert.deepEqual(f.calls, ["evidence_compare"])
})

test("daily explicit reuse pins the original processing run and never invokes a processor", async (t) => {
  const f = fixture(t)
  await processSourceRun(f.options)
  const entry = reuseEntry(f),
    key = entry.candidate_key
  const handoff = {
    schema: "research-editorial-handoff/v1",
    daily_run: "daily",
    pending: [
      {
        ...entry,
        key,
        article_source_version_id: entry.source_version_id,
        article_parse_id: entry.parse_id,
        article_content_sha256: entry.content_sha256,
      },
    ],
  }
  atomicWrite(f.root, "handoff.json", handoff)
  const options = {
    root: f.root,
    runId: "reuse-batch",
    dailyRunId: "daily",
    candidateKeys: [key],
    policyFile: f.policyFile,
    processingRuns: { [key]: "processed" },
    handoffLoader: async () => ({ path: "handoff.json", value: handoff }),
    processor: async () => {
      throw Error("Reused result must never invoke processing")
    },
  }
  const before = fs.readFileSync(path.join(f.root, "runs/processed/fact-review-packet.json"))
  const result = await processDailyCandidates({ ...options, execute: true })
  assert.equal(result.results[0].reused_processing, true)
  assert.equal(result.results[0].processing_run, "processed")
  assert.equal(result.results[0].status, "fact_review")
  assert.equal(result.results[0].result.model_calls, 0)
  const again = await processDailyCandidates({ ...options, execute: true })
  assert.deepEqual(again.counts, { fact_review: 1 })
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/processed/fact-review-packet.json")),
    before,
  )
  assert.deepEqual(f.calls, ["evidence_compare"])
  const status = loadDailyProcessingStatus(f.root).runs[0]
  assert.equal(status.results[0].reused_processing, true)
  assert.equal(status.results[0].model_calls, 0)
  assert.equal(status.results[0].assessment_run, "processed")
  await assert.rejects(
    () => processDailyCandidates({ ...options, processingRuns: {} }),
    /inputs changed/,
  )
  await assert.rejects(
    () => processDailyCandidates({ ...options, reviewFiles: { [key]: "ignored-review.json" } }),
    /unique candidate/,
  )
  const receipt = readJSON(f.root, "runs/reuse-batch/daily-processing.json")
  receipt.results[0].result.model_calls = 1
  atomicWrite(f.root, "runs/reuse-batch/daily-processing.json", receipt)
  assert.equal(loadDailyProcessingStatus(f.root).runs[0].status, "invalid")
})

test("daily reuse distinguishes private article approval from candidate approval routing", async (t) => {
  // Keep current-time fact reviews within this fixture's fixed editorial day.
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-04T01:00:00Z") })
  const f = fixture(t)
  await processSourceRun(f.options)
  await reviewProcessedClaims(f.root, "processed", await decision(f))
  await processSourceRun(f.options)
  const draft = readJSON(f.root, "runs/processed/draft.json")
  const review = {
    status: "approved",
    draft_id: draft.draft_id,
    reviewer: "Direct fixture editorial reviewer",
    source_read: true,
    final_prose_read: true,
    title_checked: true,
    dates_checked: true,
    numbers_checked: true,
    analysis_checked: true,
    event_id: "1234567890abcdef",
    published_at: "2026-10-02",
    reviewed_at: "2026-10-04",
    region: "해외",
  }
  const file = path.join(f.root, "editorial-review.json")
  fs.writeFileSync(file, JSON.stringify(review))
  await main(["approve", "--root", f.root, "--run", "processed", "--review", file])
  const entry = reuseEntry(f),
    key = entry.candidate_key
  const first = await loadProcessedSourceResult(f.root, "processed", entry)
  assert.equal(first.status, "approved")
  assert.equal(first.event_id, review.event_id)
  await assert.rejects(
    () =>
      loadProcessedSourceResult(f.root, "processed", { ...entry, event_id: "abcdef1234567890" }),
    /existing event/,
  )
  const handoff = {
    schema: "research-editorial-handoff/v1",
    daily_run: "daily",
    pending: [
      {
        ...entry,
        key,
        next_route: "approved-historical",
        event_id: review.event_id,
        review_status: "verified",
        article_source_version_id: entry.source_version_id,
        article_parse_id: entry.parse_id,
        article_content_sha256: entry.content_sha256,
      },
    ],
  }
  atomicWrite(f.root, "handoff.json", handoff)
  const r = await processDailyCandidates({
    root: f.root,
    runId: "reuse-approved",
    dailyRunId: "daily",
    candidateKeys: [key],
    policyFile: f.policyFile,
    processingRuns: { [key]: "processed" },
    execute: true,
    handoffLoader: async () => ({ path: "handoff.json", value: handoff }),
    processor: async () => {
      throw Error("No model for approved reuse")
    },
  })
  assert.deepEqual(r.counts, { approval_ready: 1 })
  assert.equal(r.candidate_published, false)
  assert.equal(r.results[0].result.model_calls, 0)
})

test("reused exact source suppresses duplicate generation in the same daily batch", async (t) => {
  const f = fixture(t)
  await processSourceRun(f.options)
  const entry = reuseEntry(f),
    key = entry.candidate_key
  const row = {
    ...entry,
    key,
    article_source_version_id: entry.source_version_id,
    article_parse_id: entry.parse_id,
    article_content_sha256: entry.content_sha256,
  }
  const handoff = {
    schema: "research-editorial-handoff/v1",
    daily_run: "daily",
    pending: [row, { ...row, key: "duplicate-source-candidate" }],
  }
  atomicWrite(f.root, "handoff.json", handoff)
  const result = await processDailyCandidates({
    root: f.root,
    runId: "reuse-dedup",
    dailyRunId: "daily",
    candidateKeys: [key, "duplicate-source-candidate"],
    policyFile: f.policyFile,
    processingRuns: { [key]: "processed" },
    execute: true,
    handoffLoader: async () => ({ path: "handoff.json", value: handoff }),
    processor: async () => {
      throw Error("Duplicate source must not be generated again")
    },
  })
  assert.deepEqual(result.counts, { fact_review: 1, same_source: 1 })
  assert.equal(result.results[1].primary_candidate_key, key)
  assert.deepEqual(f.calls, ["evidence_compare"])
  assert.equal(result.candidate_published, false)
})

test("new CLI approvals enforce reader quality while preserving original model drafts", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-04T01:00:00Z") })
  const f = fixture(t)
  await processSourceRun(f.options)
  await reviewProcessedClaims(f.root, "processed", await decision(f))
  await processSourceRun(f.options)
  const original = readJSON(f.root, "runs/processed/draft.json")
  const checkpoint = readJSON(f.root, "runs/processed/model-draft-checkpoint.json")
  const rawPath = path.join(f.root, checkpoint.output_path),
    raw = fs.readFileSync(rawPath)
  const editPath = path.join(f.root, "quality-edit.json"),
    reviewPath = path.join(f.root, "quality-approval.json")
  async function correct(draft) {
    fs.writeFileSync(
      editPath,
      JSON.stringify({
        draft_id: readJSON(f.root, "runs/processed/draft.json").draft_id,
        reviewer: "Fixture source and reader reviewer",
        reason: "Reader quality regression case",
        reviewed_at: new Date().toISOString(),
        draft,
      }),
    )
    await main(["correct", "--root", f.root, "--run", "processed", "--review", editPath])
  }
  async function approve(extra = {}) {
    fs.writeFileSync(
      reviewPath,
      JSON.stringify({
        status: "approved",
        draft_id: readJSON(f.root, "runs/processed/draft.json").draft_id,
        reviewer: "Fixture direct editorial review",
        source_read: true,
        final_prose_read: true,
        title_checked: true,
        dates_checked: true,
        numbers_checked: true,
        analysis_checked: true,
        event_id: "1234567890abcdef",
        published_at: "2026-10-02",
        reviewed_at: "2026-10-04",
        region: "해외",
        ...extra,
      }),
    )
    return main(["approve", "--root", f.root, "--run", "processed", "--review", reviewPath])
  }
  const bad = structuredClone(original.draft)
  bad.lead[0].text = "Example은 계획했다. 제품을 소개했다. 수량을 정했다."
  bad.lead[1].text = "출하를 준비한다. 제품은 50대다."
  await correct(bad)
  const check = await main(["editorial-check", "--root", f.root, "--run", "processed"])
  assert.equal(check.current.lead_sentences, 5)
  assert.equal(check.model_calls, 0)
  await assert.rejects(() => approve(), /lead_sentence_count.*lead_date_missing/)
  assert.equal(readJSON(f.root, "runs/processed/approved-article.json"), null)
  const detail = structuredClone(original.draft)
  detail.explanations = [
    {
      heading: "출하 계획",
      paragraphs: [{ text: "출하 예정 시점은 2027년이다.", claim_ids: [f.claim.claim_id] }],
    },
  ]
  await correct(detail)
  await assert.rejects(() => approve(), /Explicit repetition review/)
  const approved = await approve({ reader_quality_review: { repetition_checked: true } })
  assert.equal(approved.reader_quality.blocked, false)
  assert.equal(approved.reused, false)
  const qualityReceipt = readJSON(f.root, approved.reader_quality_receipt)
  assert.equal(qualityReceipt.repetition_checked, true)
  assert.equal(qualityReceipt.draft_id, readJSON(f.root, "runs/processed/draft.json").draft_id)
  const approvalBytes = fs.readFileSync(path.join(f.root, "runs/processed/approved-article.json"))
  assert.equal(
    (await approve({ reader_quality_review: { repetition_checked: true } })).reused,
    true,
  )
  assert.deepEqual(fs.readFileSync(rawPath), raw)
  assert.deepEqual(f.calls, ["evidence_compare", "article_write"])
  const tampered = readJSON(f.root, "runs/processed/draft.json")
  tampered.draft.lead[0].text = "Example은 10월 2일 제품 계획을 수정했다."
  tampered.draft_id = draftFingerprint(tampered.draft)
  atomicWrite(f.root, "runs/processed/draft.json", tampered)
  await assert.rejects(() => approve(), /Processing correction/)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/processed/approved-article.json")),
    approvalBytes,
  )
})

function configureLongSource(f) {
  const documents = readJSON(f.root, "runs/source/documents.json")
  const parse = readJSON(f.root, "runs/source/parses.json")[0]
  const extracted = readJSON(f.root, "runs/source/claims.json")
  parse.blocks = Array.from({ length: 12 }, (_, i) => {
    const text = f.claim.statement + " Source context. ".repeat(440)
    return { block_id: `${parse.parse_id}:b${i + 1}`, text, locator: { text_hash: sha256(text) } }
  })
  const body = parse.blocks.map((b) => b.text).join("\n\n")
  const hash = sha256(body)
  documents[0].body_sha256 = hash
  documents[0].source_version_id = `${documents[0].source_id}:${hash}`
  documents[0].body_path = `documents/${documents[0].source_id}/${hash}/body.bin`
  parse.source_version_id = documents[0].source_version_id
  extracted.claims[0].evidence[0].source_version_id = parse.source_version_id
  extracted.claims[0].claim_id = sha256(
    JSON.stringify([f.claim.candidate_key, f.claim.statement, extracted.claims[0].evidence]),
  ).slice(0, 24)
  atomicWrite(f.root, documents[0].body_path, body)
  atomicWrite(f.root, `parses/${parse.parse_id}/parse.json`, parse)
  atomicWrite(f.root, "runs/source/documents.json", documents)
  atomicWrite(f.root, "runs/source/parses.json", [parse])
  atomicWrite(f.root, "runs/source/claims.json", extracted)
  const generate = f.provider.structured
  f.provider.structured = async function (request) {
    const response = await generate.call(this, request)
    if (this.executionPolicy.role === "evidence_compare") {
      const data = JSON.parse(request.messages[1].content)
      for (const row of response.output.assessments)
        row.evidence[0].evidence_ref = data.sources[0].blocks[0].evidence_refs[0].evidence_ref
    }
    return response
  }
}

test("source processing resumes only missing windows and archives the completed ancestor", async (t) => {
  const f = fixture(t)
  configureLongSource(f)
  const generate = f.provider.structured
  let comparisons = 0
  f.provider.structured = async function (request) {
    if (this.executionPolicy.role === "evidence_compare" && ++comparisons === 2)
      throw Error("Interrupted comparison")
    return generate.call(this, request)
  }
  await assert.rejects(
    processSourceRun({ ...f.options, run: "interrupted" }),
    /Interrupted comparison/,
  )
  const raw = fs.readFileSync(
    path.join(f.root, "runs/interrupted/evidence-assessment/batch-1.json"),
  )
  const result = await processSourceRun({ ...f.options, assessmentReuseRun: "interrupted" })
  assert.equal(result.status, "fact_review")
  const assessment = readJSON(f.root, "runs/processed/evidence-assessment/input.json")
  assert.equal(assessment.reused_windows.length, 1)
  assert.equal(assessment.reused_windows[0].run, "interrupted")
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/processed/evidence-assessment/batch-1.json")),
    raw,
  )
  const packet = await loadFactReviewPacket(f.root, "processed")
  assert.equal(packet.packet.claims[0].model_assessment.requires_attention, true)
  const count = comparisons
  await processSourceRun({ ...f.options, assessmentReuseRun: "interrupted" })
  assert.equal(comparisons, count)
  const closure = buildArchiveClosure(f.root, "portable", "processed")
  assert.ok(closure.bound_runs.includes("interrupted"))
  assert.ok(
    closure.files.some((file) => file.path === "runs/interrupted/evidence-assessment/batch-1.json"),
  )
  assert.ok(
    closure.files.some(
      (file) => file.path === "runs/interrupted/model-policy/evidence_compare/budget.json",
    ),
  )
  assert.equal(f.calls.includes("article_write"), false)
})

test("complete assessment and partial reuse options cannot be combined or reuse the destination", async (t) => {
  const f = fixture(t)
  await assert.rejects(
    processSourceRun({ ...f.options, assessmentRun: "prior", assessmentReuseRun: "partial" }),
    /assessment|reuse/i,
  )
  await assert.rejects(
    processSourceRun({ ...f.options, assessmentReuseRun: "processed" }),
    /distinct|reuse/i,
  )
  assert.equal(f.calls.length, 0)
})

test("CLI accepts partial assessment reuse and forwards its conflict checks", async (t) => {
  const f = fixture(t)
  const args = [
    "process-source",
    "--root",
    f.root,
    "--run",
    "processed",
    "--source-run",
    "source",
    "--assessment-reuse-run",
    "partial",
  ]
  await assert.rejects(main([...args, "--assessment-run", "prior"]), /mutually exclusive/)
  await assert.rejects(main([...args.slice(0, -1), "processed"]), /Distinct source and processing/)
  assert.equal(readJSON(f.root, "runs/processed/source-processing-input.json"), null)
})

async function editorialFixture(t) {
  const f = fixture(t)
  await processSourceRun(f.options)
  const entry = { ...reuseEntry(f), next_route: "historical-review", reuse_run: "processed" }
  const key = entry.candidate_key
  const handoff = {
    schema: "research-editorial-handoff/v1",
    daily_run: "daily",
    pending: [
      {
        key,
        article_source_version_id: entry.source_version_id,
        article_parse_id: entry.parse_id,
        article_content_sha256: entry.content_sha256,
      },
    ],
  }
  atomicWrite(f.root, "handoff.json", handoff)
  const input = {
    schema: "research-daily-processing-input/v1",
    daily_run: "daily",
    candidate_keys: [key],
    entries: [entry],
  }
  atomicWrite(f.root, "runs/batch/daily-processing-input.json", input)
  atomicWrite(f.root, "runs/batch/daily-handoff-reference.json", {
    path: "handoff.json",
    sha256: sha256(fs.readFileSync(path.join(f.root, "handoff.json"))),
  })
  atomicWrite(f.root, "runs/batch/daily-processing.json", {
    schema: "research-daily-processing/v1",
    run_id: "batch",
    daily_run: "daily",
    input_sha256: sha256(JSON.stringify(input)),
    status: "review_pending",
    total: 1,
    counts: { fact_review: 1 },
    results: [{ candidate_key: key, processing_run: "processed", status: "fact_review" }],
  })
  const backlogFile = path.join(f.root, "backlog.json"),
    vault = path.join(f.root, "vault")
  fs.mkdirSync(vault)
  fs.writeFileSync(
    backlogFile,
    JSON.stringify({
      schema: "research-candidates/v1",
      candidates: [
        {
          key,
          title: f.parse.title,
          source_urls: entry.source_urls,
          source_published_at: "2026-10-02",
          review_status: "unreviewed",
          article_source_version_id: entry.source_version_id,
          article_parse_id: entry.parse_id,
          article_content_sha256: entry.content_sha256,
        },
      ],
    }),
  )
  const reviewFile = path.join(f.root, "explicit-facts.json")
  fs.writeFileSync(reviewFile, JSON.stringify(await decision(f)))
  const options = {
    root: f.root,
    runId: "editorial",
    processingRun: "batch",
    policyFile: f.policyFile,
    vault,
    backlogFile,
    provider: f.provider,
  }
  return { ...f, key, entry, reviewFile, options }
}

test("daily editorial uses frozen source checkpoints and never generates without reviewed facts", async (t) => {
  const f = await editorialFixture(t)
  const result = await processDailyEditorial({ ...f.options, execute: true })
  assert.equal(result.results[0].status, "fact_review")
  assert.deepEqual(f.calls, ["evidence_compare"])
  assert.deepEqual(readJSON(f.root, result.publication_handoff.path).approved_runs, [])
  const parent = readJSON(f.root, "runs/batch/daily-processing.json")
  assert.equal(parent.results[0].status, "fact_review")
})

test("daily editorial resumes native fact review, writing, explicit approval and candidate linkage once", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-04T01:00:00Z") })
  const f = await editorialFixture(t)
  f.options.processor = async (options) => {
    const status = loadDailyProcessingStatus(f.root).runs.find((r) => r.run_id === "editorial")
    assert.equal(status.status, "running")
    assert.equal(status.live_process, "alive")
    assert.equal(status.active_candidate.candidate_key, f.key)
    return processSourceRun(options)
  }
  const first = await processDailyEditorial({
    ...f.options,
    execute: true,
    reviewFiles: { [f.key]: f.reviewFile },
  })
  assert.equal(first.results[0].status, "editorial_review")
  assert.deepEqual(f.calls, ["evidence_compare", "article_write"])
  const draft = readJSON(f.root, "runs/processed/draft.json")
  const editorial = path.join(f.root, "explicit-editorial.json")
  fs.writeFileSync(
    editorial,
    JSON.stringify({
      status: "approved",
      draft_id: draft.draft_id,
      reviewer: "Direct fixture editor",
      source_read: true,
      final_prose_read: true,
      title_checked: true,
      dates_checked: true,
      numbers_checked: true,
      analysis_checked: true,
      event_id: "1234567890abcdef",
      published_at: "2026-10-02",
      reviewed_at: "2026-10-04",
      region: "해외",
    }),
  )
  const complete = await processDailyEditorial({
    ...f.options,
    execute: true,
    editorialReviewFiles: { [f.key]: editorial },
  })
  assert.equal(complete.results[0].status, "approval_ready")
  assert.equal(complete.status, "approval_ready")
  const approved = readJSON(f.root, complete.publication_handoff.path).approved_runs
  assert.equal(approved.length, 1)
  assert.equal(approved[0].event_id, "1234567890abcdef")
  const selected = loadDailyPublicationSelection(f.root, complete.publication_handoff.path, {
    vault: f.options.vault,
  })
  assert.deepEqual(selected.approvedRuns, ["processed"])
  assert.equal(selected.reference.sha256, complete.publication_handoff.sha256)
  const calls = f.calls.length
  const replay = await processDailyEditorial({
    ...f.options,
    execute: true,
    processor: () => {
      throw Error("Unexpected model work")
    },
  })
  assert.equal(replay.publication_handoff.path, complete.publication_handoff.path)
  assert.equal(f.calls.length, calls)
  assert.equal(replay.candidate_published, false)
  assert.equal(
    readJSON(f.root, "runs/processed/editorial-review.json").reviewer,
    "Direct fixture editor",
  )
  const backlog = JSON.parse(fs.readFileSync(f.options.backlogFile))
  backlog.candidates[0].article_parse_id = sha256("later unpublished revision")
  fs.writeFileSync(f.options.backlogFile, JSON.stringify(backlog))
  assert.throws(
    () =>
      loadDailyPublicationSelection(f.root, complete.publication_handoff.path, {
        vault: f.options.vault,
      }),
    /source changed/,
  )
})

test("daily editorial rejects changed selection and explicit review before native writes", async (t) => {
  const f = await editorialFixture(t)
  await processDailyEditorial({
    ...f.options,
    execute: true,
    reviewFiles: { [f.key]: f.reviewFile },
  })
  fs.appendFileSync(f.reviewFile, " ")
  await assert.rejects(
    processDailyEditorial({ ...f.options, execute: true }),
    /Pinned explicit review changed/,
  )
  const parent = readJSON(f.root, "runs/batch/daily-processing.json")
  parent.results[0].processing_run = "other"
  atomicWrite(f.root, "runs/batch/daily-processing.json", parent)
  await assert.rejects(processDailyEditorial(f.options), /frozen candidate selection/)
  assert.equal(readJSON(f.root, "runs/processed/approved-article.json"), null)
})

test("daily editorial preserves a failed explicit review and never retries it automatically", async (t) => {
  const f = await editorialFixture(t)
  const broken = JSON.parse(fs.readFileSync(f.reviewFile))
  delete broken.model_assessment
  fs.writeFileSync(f.reviewFile, JSON.stringify(broken))
  const first = await processDailyEditorial({
    ...f.options,
    execute: true,
    reviewFiles: { [f.key]: f.reviewFile },
  })
  assert.equal(first.status, "partial")
  assert.equal(first.results[0].automatic_retry, false)
  let nativeCalls = 0
  const replay = await processDailyEditorial({
    ...f.options,
    execute: true,
    command: () => {
      nativeCalls++
      throw Error("Unexpected retry")
    },
  })
  assert.equal(replay.results[0].status, "failed")
  assert.equal(nativeCalls, 0)
  assert.equal(readJSON(f.root, "runs/processed/reviewed-claims.json"), null)
})

test("daily editorial reuses prior native candidate approvals and excludes articles already in editions", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-04T01:00:00Z") })
  const f = await editorialFixture(t)
  await reviewProcessedClaims(f.root, "processed", JSON.parse(fs.readFileSync(f.reviewFile)))
  await processSourceRun({
    root: f.root,
    run: "processed",
    sourceRun: "source",
    policyFile: f.policyFile,
    provider: f.provider,
  })
  const draft = readJSON(f.root, "runs/processed/draft.json")
  const editorial = path.join(f.root, "prior-editorial.json")
  fs.writeFileSync(
    editorial,
    JSON.stringify({
      status: "approved",
      draft_id: draft.draft_id,
      reviewer: "Prior fixture editor",
      source_read: true,
      final_prose_read: true,
      title_checked: true,
      dates_checked: true,
      numbers_checked: true,
      analysis_checked: true,
      event_id: "1234567890abcdef",
      published_at: "2026-10-02",
      reviewed_at: "2026-10-04",
      region: "해외",
    }),
  )
  await main(["approve", "--root", f.root, "--run", "processed", "--review", editorial])
  await main([
    "candidate-approval",
    "--root",
    f.root,
    "--run",
    "prior-link",
    "--source-run",
    "processed",
    "--candidate-key",
    f.key,
    "--backlog",
    f.options.backlogFile,
    "--vault",
    f.options.vault,
  ])
  const article = readJSON(f.root, "runs/processed/approved-article.json")
  const projection = editionProjection([article], {
    key: "2026-10-04_0800_Tech_AI_Briefing",
    date: "2026-10-04",
    coverage_start: "2026-10-01T23:00:00Z",
    coverage_end: "2026-10-03T23:00:00Z",
  })
  const file = path.join(f.options.vault, projection.path)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, projection.content)
  const changed = JSON.parse(fs.readFileSync(f.options.backlogFile))
  changed.candidates[0].article_parse_id = sha256("later parse")
  changed.candidates[0].article_source_version_id = f.parse.source_id + ":" + sha256("later page")
  fs.writeFileSync(f.options.backlogFile, JSON.stringify(changed))
  const before = fs.readFileSync(f.options.backlogFile)
  fs.unlinkSync(file)
  const pendingRevision = await processDailyEditorial({
    ...f.options,
    runId: "revision-editorial",
    execute: true,
    command: () => {
      throw Error("A revision must not repeat native approval")
    },
    processor: () => {
      throw Error("A revision must not generate again")
    },
  })
  assert.equal(pendingRevision.results[0].status, "source_revision_review")
  assert.deepEqual(readJSON(f.root, pendingRevision.publication_handoff.path).approved_runs, [])
  fs.writeFileSync(file, projection.content)
  const result = await processDailyEditorial({
    ...f.options,
    execute: true,
    command: () => {
      throw Error("Existing approval must not repeat a native command")
    },
    processor: () => {
      throw Error("Existing approval must not generate again")
    },
  })
  assert.equal(result.results[0].status, "already_in_edition")
  assert.equal(result.status, "completed_no_new_articles")
  assert.equal(result.results[0].approval.current_source_matches, false)
  assert.equal(
    result.results[0].approval.candidate_approval.path,
    "runs/prior-link/candidate-approval.json",
  )
  assert.deepEqual(readJSON(f.root, result.publication_handoff.path).approved_runs, [])
  assert.deepEqual(fs.readFileSync(f.options.backlogFile), before)
  const status = loadDailyProcessingStatus(f.root).runs.find((r) => r.run_id === "editorial")
  assert.equal(status.stage_kind, "editorial")
  assert.equal(status.counts.already_in_edition, 1)
  assert.equal(status.status, "completed_no_new_articles")
  const handoff = readJSON(f.root, result.publication_handoff.path)
  handoff.input_sha256 = "0".repeat(64)
  atomicWrite(f.root, result.publication_handoff.path, handoff)
  assert.equal(
    loadDailyProcessingStatus(f.root).runs.find((r) => r.run_id === "editorial").status,
    "invalid",
  )
})

test("daily editorial CLI reads frozen processing without invoking local models", async (t) => {
  const f = await editorialFixture(t)
  const output = execFileSync(
    process.execPath,
    [
      "scripts/research-process-daily.mjs",
      "--root",
      f.root,
      "--run",
      "cli-editorial",
      "--from-processing",
      "batch",
      "--plan-only",
      "--backlog",
      f.options.backlogFile,
      "--vault",
      f.options.vault,
      "--model-policy",
      f.policyFile,
    ],
    { encoding: "utf8" },
  )
  const result = JSON.parse(output)
  assert.equal(result.status, "planned")
  assert.equal(result.results[0].status, "fact_review")
  assert.equal(readJSON(f.root, "runs/processed/draft.json"), null)
})

async function reviewedEditorialContinuation(f) {
  const review = await decision(f)
  await reviewProcessedClaims(f.root, "processed", review)
  await processSourceRun({ ...f.options, run: "processed", sourceRun: "source" })
  const options = {
    ...f.options,
    run: "continued",
    sourceRun: "source",
    assessmentRun: "processed",
    draftRun: "processed",
  }
  await processSourceRun(options)
  review.model_assessment.packet_sha256 = (
    await loadFactReviewPacket(f.root, "continued")
  ).packet_sha256
  await reviewProcessedClaims(f.root, "continued", review)
  await processSourceRun(options)
}

test("daily editorial pins a separately reviewed continuation without repeating model work", async (t) => {
  const f = await editorialFixture(t)
  await reviewedEditorialContinuation(f)
  const parentFiles = ["daily-processing-input.json", "daily-processing.json"].map((name) =>
    path.join(f.root, "runs/batch", name),
  )
  const before = parentFiles.map((file) => fs.readFileSync(file))
  const calls = f.calls.length
  const options = {
    ...f.options,
    editorialProcessingRuns: { [f.key]: "continued" },
    execute: true,
    processor: () => {
      throw Error("Unexpected model generation")
    },
    command: () => {
      throw Error("Unexpected native approval")
    },
  }
  const result = await processDailyEditorial(options)
  assert.equal(result.results[0].processing_run, "continued")
  assert.equal(result.results[0].status, "editorial_review")
  const entry = readJSON(f.root, "runs/editorial/daily-editorial/input.json").entries[0]
  assert.equal(entry.original_processing_run, "processed")
  assert.equal(
    entry.processing_input_sha256,
    sha256(fs.readFileSync(path.join(f.root, "runs/continued/source-processing-input.json"))),
  )
  const replay = await processDailyEditorial(options)
  assert.equal(replay.publication_handoff.sha256, result.publication_handoff.sha256)
  assert.equal(f.calls.length, calls)
  parentFiles.forEach((file, i) => assert.deepEqual(fs.readFileSync(file), before[i]))
  await assert.rejects(processDailyEditorial(f.options), /input changed/)
})

test("daily editorial rejects unreviewed or mismatched replacements before creating its input", async (t) => {
  const f = await editorialFixture(t)
  await processSourceRun({
    ...f.options,
    run: "unreviewed",
    sourceRun: "source",
    assessmentRun: "processed",
  })
  await assert.rejects(
    processDailyEditorial({
      ...f.options,
      editorialProcessingRuns: { [f.key]: "unreviewed" },
    }),
    /own reviewed facts/,
  )
  assert.equal(readJSON(f.root, "runs/editorial/daily-editorial/input.json"), null)
  await reviewedEditorialContinuation(f)
  const binding = readJSON(f.root, "runs/continued/source-processing-input.json")
  binding.candidate_key = "source-other"
  atomicWrite(f.root, "runs/continued/source-processing-input.json", binding)
  await assert.rejects(
    processDailyEditorial({
      ...f.options,
      editorialProcessingRuns: { [f.key]: "continued" },
    }),
    /same exact candidate/,
  )
  await assert.rejects(
    processDailyEditorial({
      ...f.options,
      editorialProcessingRuns: { unselected: "continued" },
    }),
    /selected daily candidates/,
  )
  assert.equal(readJSON(f.root, "runs/editorial/daily-editorial/input.json"), null)
  assert.equal(readJSON(f.root, "runs/continued/approved-article.json"), null)
})

test("daily editorial CLI accepts an exact reviewed continuation map", async (t) => {
  const f = await editorialFixture(t)
  await reviewedEditorialContinuation(f)
  const mapping = path.join(f.root, "continuations.json")
  fs.writeFileSync(mapping, JSON.stringify({ [f.key]: "continued" }))
  const args = [
    "scripts/research-process-daily.mjs",
    "--root",
    f.root,
    "--run",
    "cli-continuation",
    "--from-processing",
    "batch",
    "--plan-only",
    "--backlog",
    f.options.backlogFile,
    "--vault",
    f.options.vault,
    "--model-policy",
    f.policyFile,
    "--editorial-processing-runs",
    mapping,
  ]
  const result = JSON.parse(execFileSync(process.execPath, args, { encoding: "utf8" }))
  assert.equal(result.results[0].processing_run, "continued")
  assert.equal(result.results[0].status, "editorial_review")
})
