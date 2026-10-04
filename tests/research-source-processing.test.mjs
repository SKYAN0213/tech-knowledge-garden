import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
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
import { loadDailyProcessingStatus } from "../scripts/research/daily-processing-status.mjs"
import { articleContentFingerprint } from "../scripts/research/parser.mjs"
import { draftFingerprint } from "../scripts/research/editor.mjs"

function fixture(
  t,
  { extracted = true, concern = false, sourceURL = "https://example.org/plan" } = {},
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
                { block_key: data[0].blocks[0].block_key, quote: text, support: "direct" },
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
            evidence: [{ parse_id, block_id: parse.blocks[0].block_id, quote: text }],
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
  const result = await processSourceRun(f.options)
  assert.equal(result.status, "fact_review")
  assert.deepEqual(f.calls, ["fact_extract", "evidence_compare"])
  assert.equal(readJSON(f.root, "runs/processed/reviewed-claims.json"), null)
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

test("editorial correction survives processing resume without another model call", async (t) => {
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
  atomicWrite(f.root, `runs/processed/corrections/${sha256(JSON.stringify(correction))}.json`, {
    ...correction,
    reason: "tampered",
  })
  await assert.rejects(() => processSourceRun(f.options), /correction history changed/)
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
