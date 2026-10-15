import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import {
  draftFingerprint,
  draftProblems,
  inspectLeadRepetition,
  writeDraft,
} from "../scripts/research/editor.mjs"
import { inspectReaderQuality, assertReaderQuality } from "../scripts/research/reader-quality.mjs"
import { prepareEditorialDraft } from "../scripts/research/editorial-authoring.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { loadDraftCheckpoint } from "../scripts/research/draft-checkpoint.mjs"
import { approvedArticle } from "../scripts/research/publish-adapter.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"
import { inspectModelContextObservation } from "../scripts/research/evaluation-cost.mjs"

// The repeated prose is from the two stored development responses. Fixture
// evidence below exercises contracts only; it is neither an approval nor gold.
const deployment =
  "AirJoule Core 시스템 2대는 텍사스 Corpus Christi와 캘리포니아 Irvine 인근 현장에 배치되며, 배치는 2026년 3분기에 시작할 계획이다."
const restatement =
  "AirJoule Core 시스템 2대의 배치는 2026년 3분기에 시작할 계획이며, 대상 지역은 텍사스 Corpus Christi와 캘리포니아 Irvine 인근 현장이다."
const ids = ["announcement", "deployment"]
function fixture(additionalDetail = false) {
  const quotes = [
    "AirJoule announced a business update on August 13, 2026.",
    "Two AirJoule Core systems will be deployed at sites near Corpus Christi, Texas, and Irvine, California, with deployment commencing in the third quarter of 2026." +
      (additionalDetail ? " Each system will use reclaimed water after an inspection." : ""),
  ]
  const source_id = sourceId("https://example.test/source-contract")
  const parse_id = sha256(quotes.join("\n"))
  const parse = {
    schema_version: "source-parse/v1",
    source_id,
    source_version_id: source_id + ":" + parse_id,
    parse_id,
    status: "extracted",
    title: "Contract fixture",
    dates: { published_at: "2026-08-13", observed_at: "2026-10-10T00:00:00Z" },
    blocks: quotes.map((text, i) => ({
      block_id: `${parse_id}:b${i}`,
      text,
      locator: { text_hash: sha256(text) },
    })),
    quality: { missing_pages: [] },
  }
  const claims = recordFactReview(
    ids.map((claim_id, i) => ({
      claim_id,
      candidate_key: "source-" + source_id,
      subject: "AirJoule",
      statement: i
        ? deployment + (additionalDetail ? " 각 시스템은 점검 뒤 회수한 물을 사용할 계획이다." : "")
        : "AirJoule은 2026년 8월 13일 사업 현황을 발표했다.",
      claim_kind: "attributed_fact",
      event_state: i ? "planned" : "completed",
      published_at: "2026-08-13",
      effective_period: null,
      numbers: [],
      evidence: [
        {
          source_id,
          source_version_id: parse.source_version_id,
          parse_id,
          block_id: `${parse_id}:b${i}`,
          quote: quotes[i],
          support: "direct",
        },
      ],
    })),
    ids.map((claim_id) => ({
      claim_id,
      status: "verified",
      reason: "Contract fixture",
      source_read: true,
      entailment_checked: true,
      identity_checked: true,
      numbers_checked: true,
      time_checked: true,
    })),
    { reviewer: "fixture", reviewed_at: "2026-10-10" },
    [parse],
  )
  const draft = {
    title: "AirJoule, 시스템 배치 계획 발표",
    lead: [
      { text: "AirJoule은 2026년 8월 13일 사업 현황을 발표했다.", claim_ids: [ids[0]] },
      { text: deployment, claim_ids: [ids[1]] },
    ],
    facts: {
      who: "AirJoule",
      when: "2026-08-13",
      where: "텍사스·캘리포니아",
      what: "시스템 배치 계획",
      how: null,
      why: null,
    },
    sector: "에너지·기후기술",
    theme: "사업·고객",
    tags: ["시장 진출"],
    entities: ["AirJoule"],
    explanations: [
      { heading: "배치 지역 및 일정", paragraphs: [{ text: restatement, claim_ids: [ids[1]] }] },
    ],
  }
  return {
    draft,
    claims,
    parses: [parse],
    documents: [
      {
        source_id,
        source_version_id: parse.source_version_id,
        original_url: "https://example.test/source-contract",
      },
    ],
  }
}
const record = (draft) => ({ draft, draft_id: draftFingerprint(draft) })

test("same-fact Korean restatement blocks approval even after a boolean repetition review", () => {
  const f = fixture(),
    before = JSON.stringify(f)
  const report = inspectReaderQuality(record(f.draft), f.claims)
  assert.deepEqual(inspectLeadRepetition(f.draft)[0].locations, [
    "lead[1]",
    "explanations[0].paragraphs[0]",
  ])
  assert.equal(report.blocked, true)
  assert.throws(
    () => assertReaderQuality(report, { reader_quality_review: { repetition_checked: true } }),
    /lead_information_rephrased/,
  )
  assert.equal(JSON.stringify(f), before)
})

test("new writer preserves rejected response and exact references without silently deleting prose", async () => {
  const f = fixture(),
    content = JSON.stringify(f.draft),
    artifacts = { response_content: content, response_content_sha256: sha256(content) }
  let request
  await assert.rejects(
    writeDraft(
      {
        structured: async (input) => {
          request = input
          return { output: f.draft, artifacts }
        },
      },
      f.claims,
    ),
    (error) => {
      assert.match(error.message, /lead_information_rephrased/)
      assert.equal(error.model_artifacts, artifacts)
      return true
    },
  )
  assert.match(request.messages[0].content, /조사나 문장 순서/)
  assert.match(request.messages[0].content, /조건·방법·비교·세부 사항/)
  assert.deepEqual(request.schema.properties.lead.items.properties.claim_ids.items.enum, ids)
  assert.equal(JSON.stringify(f.draft), content)
})

test("source-bound editorial authoring rejects restatement before making a new draft", () => {
  const f = fixture(),
    input = {
      reviewer: "fixture",
      reviewed_at: "2026-10-11",
      reason: "Contract only",
      source_read: true,
      final_prose_read: true,
      draft: f.draft,
    }
  assert.throws(
    () => prepareEditorialDraft(input, f.claims, f.parses),
    /lead_information_rephrased/,
  )
  const completeLead = structuredClone(input)
  completeLead.draft.explanations = []
  const authored = prepareEditorialDraft(completeLead, f.claims, f.parses)
  assert.deepEqual(authored.draft.lead, f.draft.lead)
  assert.deepEqual(authored.draft.facts, f.draft.facts)
  assert.equal(authored.public_approved, false)
})

test("an extra reviewed condition or method remains for explicit source review", () => {
  const f = fixture(true)
  // This additional evidence is synthetic and intentionally separate from the
  // AirJoule source. A new word alone cannot establish source entailment.
  const detail = "각 시스템은 점검 뒤 회수한 물을 사용할 계획이다."
  f.draft.explanations[0].paragraphs[0].text = detail
  const report = inspectReaderQuality(record(f.draft), f.claims)
  assert.equal(report.blocked, false)
  assert.equal(report.requires_repetition_review, true)
  assert.throws(() => assertReaderQuality(report, {}), /Explicit repetition review/)
  assert.equal(report.candidate_published, false)
  assert.equal(f.draft.explanations[0].paragraphs[0].text, detail)
})

test("negation, numbers, bounds and plan/completion changes are not erased as grammar", () => {
  const f = fixture()
  for (const text of [
    restatement.replace("2대", "3대"),
    restatement.replace("2대", "최소 2대"),
    restatement.replace("인근 현장이다", "인근 현장은 아니다"),
    restatement.replace("시작할 계획이며", "이미 시작했으며"),
    restatement + " 각 시스템은 추가 점검 뒤 배치될 예정이다.",
  ]) {
    f.draft.explanations[0].paragraphs[0].text = text
    assert.deepEqual(inspectLeadRepetition(f.draft), [], text)
  }
  f.draft.explanations[0].paragraphs[0] = { text: restatement, claim_ids: [ids[0]] }
  assert.deepEqual(inspectLeadRepetition(f.draft), [])
})

test("numeric signs, percentage units, decimal boundaries and comparison operators remain content", () => {
  const f = fixture()
  const lead = "AirJoule 시스템은 텍사스 현장에서 -2.5% 조건의 배치 계획을 공개했다."
  f.draft.lead[1].text = lead
  f.draft.explanations[0].paragraphs[0].text = lead
  assert.equal(inspectLeadRepetition(f.draft).length, 1)
  for (const replacement of ["+2.5%", "-25%", "-2.5", "<-2.5%", ">-2.5%"]) {
    f.draft.explanations[0].paragraphs[0].text = lead.replace("-2.5%", replacement)
    assert.deepEqual(inspectLeadRepetition(f.draft), [], replacement)
  }
})

test("historical checkpoint and approved projection keep their exact bytes and existing problems", (t) => {
  const f = fixture(),
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lead-history-"))),
    run = "old"
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const old = {
    ...record(f.draft),
    schema: "research-draft/v1",
    claim_ids: ids,
    problems: draftProblems(f.draft, f.claims),
    public_approved: false,
  }
  const input = {
    schema: "research-model-draft-input/v1",
    claims_sha256: sha256(JSON.stringify(f.claims)),
    documents_sha256: sha256(JSON.stringify(f.documents)),
    parses_sha256: sha256(JSON.stringify(f.parses)),
    deep_context_sha256: sha256(JSON.stringify(null)),
    provisional: false,
  }
  const output_path = `runs/${run}/drafts/model-${sha256(JSON.stringify(input))}.json`
  const output = atomicWrite(root, output_path, old)
  atomicWrite(root, `runs/${run}/model-draft-input.json`, input)
  atomicWrite(root, `runs/${run}/model-draft-checkpoint.json`, {
    schema: "research-model-draft-checkpoint/v1",
    input_sha256: sha256(JSON.stringify(input)),
    output_path,
    output_sha256: output.sha256,
    candidate_published: false,
  })
  const loaded = loadDraftCheckpoint(root, run, f.claims, {
    documents: f.documents,
    parses: f.parses,
  })
  assert.equal(loaded.reused, true)
  assert.deepEqual(loaded.record.problems, [])
  const projection = approvedArticle(
    loaded.record,
    f.claims,
    f.documents,
    {
      status: "approved",
      draft_id: old.draft_id,
      reviewer: "historical fixture",
      source_read: true,
      final_prose_read: true,
      title_checked: true,
      dates_checked: true,
      numbers_checked: true,
      analysis_checked: true,
      event_id: "0123456789abcdef",
      published_at: "2026-08-13",
      reviewed_at: "2026-10-11",
      region: "해외",
    },
    f.parses,
  )
  assert.equal(projection.record.explanations[0].paragraphs[0], restatement)
  assert.equal(sha256(fs.readFileSync(path.join(root, output_path))), output.sha256)
  // The historical projection is not a new approval; current reader still
  // blocks this content if it is submitted in a new approval run.
  assert.equal(inspectReaderQuality(loaded.record, f.claims).blocked, true)
})

function contextFixture(requested = 32768, observed = 16384) {
  const request = { model: "qwen", options: { num_ctx: requested } }
  return {
    record: {
      model_artifacts: { request, request_sha256: sha256(JSON.stringify(request)) },
      provenance: { model: "qwen", digest: "digest", num_ctx: requested },
    },
    resources: {
      schema: "evaluation-model-resource-observation/v1",
      samples: [
        {
          api: {
            status: "observed",
            target_loaded: true,
            target_model: "qwen",
            target: { digest: "digest" },
            context_length: observed,
            response_sha256: sha256("api"),
          },
        },
      ],
    },
  }
}
test("wire32k and loaded API16k stay distinct without inferring adapter failure or capacity", () => {
  const f = contextFixture(),
    before = JSON.stringify(f)
  const report = inspectModelContextObservation(f.record, f.resources)
  assert.equal(report.status, "mismatch")
  assert.equal(report.requested_num_ctx, 32768)
  assert.deepEqual(report.observed_context_lengths, [16384])
  assert.equal(report.adapter_request_preserved, true)
  assert.equal(report.full_context_window_verified, false)
  assert.equal(report.model_calls, 0)
  assert.equal(JSON.stringify(f), before)
  const matching = contextFixture(16384)
  assert.equal(
    inspectModelContextObservation(matching.record, matching.resources).status,
    "observed_match",
  )
})
test("missing API context stays unknown and mismatched native identity or wire SHA is rejected", () => {
  const f = contextFixture(16384, null)
  assert.equal(inspectModelContextObservation(f.record, f.resources).status, "unobserved")
  f.resources.samples[0].api.target.digest = "different"
  assert.throws(
    () => inspectModelContextObservation(f.record, f.resources),
    /model identity changed/,
  )
  const tampered = contextFixture()
  tampered.record.model_artifacts.request.options.num_ctx = 16384
  assert.throws(
    () => inspectModelContextObservation(tampered.record, tampered.resources),
    /Exact native request/,
  )
})
