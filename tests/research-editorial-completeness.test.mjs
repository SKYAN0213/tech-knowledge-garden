import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { fixture } from "./fixtures/research-event-fixtures.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { validateEvidence, recordFactReview } from "../scripts/research/claims.mjs"
import { atomicWrite, readJSON, safePath } from "../scripts/research/run-state.mjs"
import {
  draftFingerprint,
  draftProblems,
  writeDraft,
  correctDraft,
} from "../scripts/research/editor.mjs"
import { writeDraftCheckpoint, loadDraftCheckpoint } from "../scripts/research/draft-checkpoint.mjs"
import { loadProcessedDraft } from "../scripts/research/processed-draft.mjs"
import { inspectReaderQuality, assertReaderQuality } from "../scripts/research/reader-quality.mjs"
import { approvedArticle } from "../scripts/research/publish-adapter.mjs"
import { loadCurrentApproval } from "../scripts/research/preview.mjs"
import { prepareEditorialDraft } from "../scripts/research/editorial-authoring.mjs"
import { main as editorialAuthor } from "../scripts/research-editorial-author.mjs"
import { main as research } from "../scripts/research.mjs"
import {
  prepareEditorialCompleteness,
  recordEditorialCompleteness,
  assertCompletenessContext,
  bindEditorialCompleteness,
  inspectEditorialCompleteness,
  assertEditorialCoverage,
} from "../scripts/research/editorial-completeness.mjs"

function setup(t) {
  const f = fixture(t),
    run = "completeness"
  const texts = [
    "Example announced a robot API on 2026-09-26. Users can inspect request status.",
    "Example said the trial reduced latency by 30% compared with the prior API in the same laboratory. Production access is planned for October.",
    "Example published a company profile alongside the announcement.",
  ]
  const body = texts.join("\n"),
    source_id = sourceId("https://fixture.example/completeness")
  const document = {
    schema_version: "source-document/v1",
    source_id,
    source_version_id: source_id + ":" + sha256(body),
    original_url: "https://fixture.example/completeness",
    final_url: "https://fixture.example/completeness",
    observed_at: "2026-09-27T00:00:00Z",
    fetch_status: "captured",
    body_sha256: sha256(body),
    body_path: `documents/${source_id}/${sha256(body)}/body.bin`,
  }
  const parse_id = sha256("complete-source-" + body)
  const parse = {
    schema_version: "source-parse/v1",
    source_id,
    source_version_id: document.source_version_id,
    parse_id,
    status: "extracted",
    title: "Robot API announcement",
    dates: { published_at: "2026-09-26", observed_at: document.observed_at },
    blocks: texts.map((text, index) => ({
      block_id: parse_id + ":b" + index,
      text,
      locator: { text_hash: sha256(text) },
    })),
    quality: { missing_pages: [] },
  }
  const raw = texts.map((statement, index) => {
    const row = {
      claim_id: sha256(statement).slice(0, 24),
      candidate_key: "source-" + source_id,
      subject: "Example",
      statement,
      claim_kind: index === 1 ? "attributed_fact" : "fact",
      event_state: index === 1 ? "planned" : "reported",
      published_at: "2026-09-26",
      effective_period: null,
      numbers:
        index === 1
          ? [
              {
                literal: "30",
                unit: "%",
                condition: "compared with the prior API in the same laboratory",
              },
            ]
          : [],
      evidence: [
        {
          source_id,
          source_version_id: document.source_version_id,
          parse_id,
          block_id: parse.blocks[index].block_id,
          quote: statement,
          support: "direct",
        },
      ],
    }
    return { ...row, review: validateEvidence(row, [parse]) }
  })
  const claims = recordFactReview(
    raw,
    raw.map((claim) => ({
      claim_id: claim.claim_id,
      status: "verified",
      reason: "Compared with the exact fixture original and numeric condition",
      source_read: true,
      entailment_checked: true,
      identity_checked: true,
      numbers_checked: true,
      time_checked: true,
    })),
    { reviewer: "fixture source reader", reviewed_at: "2026-09-28" },
    [parse],
  )
  atomicWrite(f.root, document.body_path, body)
  atomicWrite(f.root, `parses/${parse_id}/parse.json`, parse)
  atomicWrite(f.root, `runs/${run}/documents.json`, [document])
  atomicWrite(f.root, `runs/${run}/parses.json`, [parse])
  atomicWrite(f.root, `runs/${run}/claims.json`, { claims: raw })
  atomicWrite(f.root, `runs/${run}/reviewed-claims.json`, { claims })
  const draft = {
    title: "Example, 로봇 API 공개",
    sector: "소프트웨어·클라우드",
    theme: "제품·서비스",
    tags: ["기능 추가"],
    entities: ["Example"],
    facts: {
      who: "Example",
      when: "2026-09-26",
      where: null,
      what: "로봇 API 공개",
      how: null,
      why: null,
    },
    lead: [
      { text: "Example은 2026년 9월 26일 로봇 API를 공개했다.", claim_ids: [claims[0].claim_id] },
      { text: "사용자는 요청 상태를 조회할 수 있다.", claim_ids: [claims[0].claim_id] },
    ],
    explanations: [
      {
        heading: "시험 조건과 제공 일정",
        paragraphs: [
          {
            text: "Example은 같은 실험실에서 이전 API와 비교한 시험에서 지연이 30% 줄었다고 밝혔다. 운영 환경의 접근은 10월로 계획했다.",
            claim_ids: [claims[1].claim_id],
          },
        ],
      },
    ],
  }
  return { ...f, run, document, parse, claims, draft }
}

async function reviewedContext(f) {
  const packet = await prepareEditorialCompleteness(f.ctx, { run_id: f.run })
  const review = {
    ...packet.review_template,
    reviewer: "fixture important fact reader",
    reviewed_at: "2026-09-29",
    source_read: true,
    all_relevant_facts_checked: true,
    fact_decisions: packet.review_template.fact_decisions.map((row, index) => ({
      ...row,
      important: index < 2,
      reason:
        index < 2
          ? "Action, direct comparison conditions and announced access state are required"
          : "Company profile is background and adds no event information",
    })),
  }
  const context = recordEditorialCompleteness(review, f.claims, [f.document], [f.parse])
  return { packet, review, context }
}
function draftRecord(f, context, draft = f.draft) {
  return {
    schema: "research-draft/v1",
    draft,
    draft_id: draftFingerprint(draft),
    ...(context ? { completeness_context: context } : {}),
    claim_ids: f.claims.map((claim) => claim.claim_id),
    status: "editorial_review",
    public_approved: false,
    problems: draftProblems(draft, f.claims, null, context),
  }
}
function coverageFor(record, claims) {
  const template = inspectEditorialCompleteness(record, claims).coverage_template
  return {
    ...template,
    reviewer: "fixture final source reader",
    reviewed_at: "2026-09-30",
    source_read: true,
    final_prose_read: true,
    coverage: template.coverage.map((row) => ({
      ...row,
      meaning_checked: true,
      reason:
        "Read each exact paragraph against original action, attributed comparison and planned availability",
    })),
  }
}
function editorial(record, coverage) {
  return {
    status: "approved",
    draft_id: record.draft_id,
    reviewer: "fixture final source reader",
    source_read: true,
    final_prose_read: true,
    title_checked: true,
    dates_checked: true,
    numbers_checked: true,
    analysis_checked: true,
    event_id: "abcdef0123456789",
    published_at: "2026-09-26",
    reviewed_at: "2026-09-30",
    region: "해외",
    concept_ids: [],
    reader_quality_review: { repetition_checked: true },
    ...(coverage ? { completeness_review: coverage } : {}),
  }
}
function writer(draft) {
  let calls = 0
  return {
    get calls() {
      return calls
    },
    request: null,
    async structured(request) {
      this.request = request
      calls++
      return {
        output: structuredClone(draft),
        provenance: {
          model: request.model,
          think: request.think,
          digest: sha256("fixture writer"),
          prompt_sha256: sha256(JSON.stringify(request.messages)),
        },
      }
    },
  }
}

test("source completeness packet freezes full reviewed range and requires an explicit decision for every fact", async (t) => {
  const f = setup(t),
    { packet, review, context } = await reviewedContext(f)
  assert.equal(packet.model_calls, 0)
  assert.equal(packet.sources[0].blocks.length, 3)
  assert.equal(packet.review_template.source_read, false)
  assert.equal(context.review.fact_decisions.filter((row) => row.important).length, 2)
  assert.equal(readJSON(f.root, `runs/${f.run}/draft.json`), null)
  assert.throws(
    () =>
      recordEditorialCompleteness(
        { ...review, source_read: false },
        f.claims,
        [f.document],
        [f.parse],
      ),
    /Invalid enum/,
  )
  assert.throws(
    () =>
      recordEditorialCompleteness(
        { ...review, fact_decisions: review.fact_decisions.slice(0, 2) },
        f.claims,
        [f.document],
        [f.parse],
      ),
    /each verified fact/,
  )
  const changed = structuredClone(f.parse)
  changed.blocks[0].text += " changed"
  assert.throws(
    () =>
      assertCompletenessContext(context, f.claims, { documents: [f.document], parses: [changed] }),
    /source range/,
  )
})

test("important fact review requires numeric conditions, plan state and company attribution without selecting all facts", async (t) => {
  const f = setup(t),
    { review, context } = await reviewedContext(f)
  for (const aspect of ["numbers", "comparison_conditions", "plan_execution", "attribution"]) {
    const changed = structuredClone(review)
    changed.fact_decisions[1].required_aspects = changed.fact_decisions[1].required_aspects.filter(
      (item) => item !== aspect,
    )
    assert.throws(
      () => recordEditorialCompleteness(changed, f.claims, [f.document], [f.parse]),
      /preserve its numbers/,
    )
  }
  assert.equal(inspectEditorialCompleteness(draftRecord(f, context), f.claims).blocked, false)
  assert.ok(!f.draft.explanations[0].paragraphs[0].claim_ids.includes(f.claims[2].claim_id))
})

test("writing receives explicit important identities and a short draft cannot hide a missing condition fact", async (t) => {
  const f = setup(t),
    { context } = await reviewedContext(f)
  const short = structuredClone(f.draft)
  short.explanations = []
  short.facts.how = f.claims[1].statement
  const model = writer(short)
  const record = await writeDraft(model, f.claims, {
    model: "fixture-model",
    parses: [f.parse],
    documents: [f.document],
    completenessContext: context,
  })
  assert.equal(model.calls, 1)
  assert.deepEqual(
    JSON.parse(model.request.messages[1].content).important_facts.map((row) => row.claim_id),
    f.claims.slice(0, 2).map((claim) => claim.claim_id),
  )
  const quality = inspectReaderQuality(record, f.claims)
  assert.ok(record.problems.includes("important_fact_missing"))
  assert.ok(quality.findings.some((finding) => finding.code === "important_fact_missing"))
  assert.throws(() => assertReaderQuality(quality, editorial(record)), /important_fact_missing/)
  assert.throws(
    () => approvedArticle(record, f.claims, [f.document], editorial(record), [f.parse]),
    /Important fact missing/,
  )
  assert.equal(record.public_approved, false)
})

test("exact important paragraph references require separate meaning review and reject changed coverage", async (t) => {
  const f = setup(t),
    { context } = await reviewedContext(f),
    record = draftRecord(f, context),
    coverage = coverageFor(record, f.claims)
  const quality = inspectReaderQuality(record, f.claims)
  assert.equal(quality.blocked, false)
  assert.throws(() => assertReaderQuality(quality, editorial(record)), /coverage review/)
  assert.throws(() => assertEditorialCoverage(record, f.claims, undefined), /Invalid type/)
  for (const mutate of [
    (value) => {
      value.coverage[1].meaning_checked = false
    },
    (value) => {
      value.coverage[1].locations[0].text_sha256 = sha256("changed")
    },
    (value) => {
      value.coverage[1].preserved_aspects = ["fact"]
    },
    (value) => {
      value.coverage[1].locations[0].location = "facts.how"
    },
  ]) {
    const altered = structuredClone(coverage)
    mutate(altered)
    assert.throws(() => assertEditorialCoverage(record, f.claims, altered))
  }
  assert.doesNotThrow(() =>
    assertEditorialCoverage(record, f.claims, coverage, {
      documents: [f.document],
      parses: [f.parse],
    }),
  )
  const corrected = correctDraft(
    record,
    { ...f.draft, title: "Example, 로봇 상태 조회 API 공개" },
    f.claims,
    { draft_id: record.draft_id, reviewer: "fixture", reason: "Clarified the supported title" },
  )
  assert.throws(() => assertEditorialCoverage(corrected, f.claims, coverage), /exact draft/)
})

test("native generation checkpoint binds important review and reuses completed output without a new writer call", async (t) => {
  const f = setup(t),
    { review, context } = await reviewedContext(f)
  const file = safePath(f.root, "important-review.json")
  atomicWrite(f.root, "important-review.json", review)
  assert.deepEqual(await bindEditorialCompleteness(f.root, f.run, file), context)
  const model = writer(f.draft),
    options = {
      model: "fixture-model",
      parses: [f.parse],
      documents: [f.document],
      completenessContext: context,
    }
  const metadata = { model: "fixture-model", digest: sha256("fixture writer") }
  const first = await writeDraftCheckpoint(f.root, f.run, model, f.claims, options, metadata)
  atomicWrite(f.root, `runs/${f.run}/draft.json`, first.record)
  const second = await writeDraftCheckpoint(f.root, f.run, model, f.claims, options, metadata)
  assert.equal(second.reused, true)
  assert.equal(model.calls, 1)
  assert.deepEqual(
    loadProcessedDraft(f.root, f.run, { claims: f.claims }, [f.document], [f.parse]),
    first.record,
  )
  assert.equal(
    readJSON(f.root, `runs/${f.run}/model-draft-input.json`).completeness_context_sha256,
    context.sha256,
  )
  assert.throws(
    () => loadDraftCheckpoint(f.root, f.run, f.claims, { ...options, completenessContext: null }),
    /input changed/,
  )
  const revised = { ...review, reviewer: "different source reader" }
  atomicWrite(f.root, "revised-review.json", revised)
  await assert.rejects(
    () => bindEditorialCompleteness(f.root, f.run, safePath(f.root, "revised-review.json")),
    /review changed/,
  )
})

test("approval preserves event and source links while completeness decisions stay private and legacy approvals remain valid", async (t) => {
  const f = setup(t),
    { context } = await reviewedContext(f),
    record = draftRecord(f, context)
  const approved = approvedArticle(
    record,
    f.claims,
    [f.document],
    editorial(record, coverageFor(record, f.claims)),
    [f.parse],
  )
  assert.equal(approved.event_id, "abcdef0123456789")
  assert.deepEqual(approved.source_urls, [f.document.original_url])
  assert.ok(!JSON.stringify(approved).includes("important fact reader"))
  assert.ok(!JSON.stringify(approved).includes("coverage"))
  const legacy = draftRecord(f, null)
  assert.deepEqual(
    approvedArticle(legacy, f.claims, [f.document], editorial(legacy), [f.parse]),
    approved,
  )
})

test("native approval accepts exact separate coverage and immutable readback preserves approvals without model calls", async (t) => {
  const f = setup(t),
    { review, context } = await reviewedContext(f)
  atomicWrite(f.root, "important-review.json", review)
  await bindEditorialCompleteness(f.root, f.run, safePath(f.root, "important-review.json"))
  const record = draftRecord(f, context)
  atomicWrite(f.root, `runs/${f.run}/draft.json`, record)
  atomicWrite(f.root, "editorial.json", editorial(record))
  atomicWrite(f.root, "coverage.json", coverageFor(record, f.claims))
  const args = [
    "approve",
    "--root",
    f.root,
    "--run",
    f.run,
    "--review",
    safePath(f.root, "editorial.json"),
    "--coverage-review",
    safePath(f.root, "coverage.json"),
  ]
  const first = await research(args)
  assert.equal(first.status, "approved")
  const original = fs.readFileSync(safePath(f.root, `runs/${f.run}/approved-article.json`))
  const loaded = loadCurrentApproval(f.root, f.run, { vault: f.ctx.vault })
  assert.equal(loaded.editorial_completeness.context_sha256, context.sha256)
  assert.equal((await research(args)).reused, true)
  assert.equal(
    sha256(fs.readFileSync(safePath(f.root, `runs/${f.run}/approved-article.json`))),
    sha256(original),
  )
  const edited = readJSON(f.root, "coverage.json")
  edited.coverage[1].locations[0].text_sha256 = sha256("wrong paragraph")
  atomicWrite(f.root, "coverage.json", edited)
  await assert.rejects(() => research(args), /exact reader paragraphs/)
})

test("GPT direct authoring uses the same frozen important facts and keeps its existing distinct provenance", async (t) => {
  const f = setup(t),
    { review, context } = await reviewedContext(f)
  const input = {
    reviewer: "fixture GPT editor",
    reviewed_at: "2026-09-29",
    reason: "Compared source facts with final article",
    source_read: true,
    final_prose_read: true,
    draft: f.draft,
  }
  const protectedRecord = prepareEditorialDraft(input, f.claims, [f.parse], {
    documents: [f.document],
    completenessContext: context,
  })
  assert.equal(protectedRecord.provenance.local_model_generated, false)
  assert.equal(protectedRecord.provenance.completeness_context_sha256, context.sha256)
  const short = { ...input, draft: { ...f.draft, explanations: [] } }
  assert.throws(
    () =>
      prepareEditorialDraft(short, f.claims, [f.parse], {
        documents: [f.document],
        completenessContext: context,
      }),
    /important_fact_missing/,
  )
  atomicWrite(f.root, "important-review.json", review)
  atomicWrite(f.root, "direct-input.json", input)
  const args = [
    "--root",
    f.root,
    "--run",
    f.run,
    "--review",
    safePath(f.root, "direct-input.json"),
    "--completeness-review",
    safePath(f.root, "important-review.json"),
  ]
  const first = await editorialAuthor(args),
    second = await editorialAuthor(args)
  assert.equal(first.reused, false)
  assert.equal(second.reused, true)
  assert.deepEqual(readJSON(f.root, `runs/${f.run}/draft.json`), protectedRecord)
  assert.equal(readJSON(f.root, `runs/${f.run}/model-draft-checkpoint.json`), null)
})

test("completed legacy draft is preserved instead of receiving a retroactive required review", async (t) => {
  const f = setup(t),
    { review } = await reviewedContext(f),
    model = writer(f.draft)
  const options = { model: "fixture-model", parses: [f.parse], documents: [f.document] }
  const { record } = await writeDraftCheckpoint(f.root, f.run, model, f.claims, options, {
    model: "fixture-model",
  })
  atomicWrite(f.root, `runs/${f.run}/draft.json`, record)
  const before = fs.readFileSync(safePath(f.root, `runs/${f.run}/draft.json`))
  atomicWrite(f.root, "important-review.json", review)
  await assert.rejects(
    () => bindEditorialCompleteness(f.root, f.run, safePath(f.root, "important-review.json")),
    /Existing draft generation/,
  )
  assert.deepEqual(loadDraftCheckpoint(f.root, f.run, f.claims, options).record, record)
  assert.equal(model.calls, 1)
  assert.equal(readJSON(f.root, `runs/${f.run}/editorial-completeness/context.json`), null)
  assert.equal(
    sha256(fs.readFileSync(safePath(f.root, `runs/${f.run}/draft.json`))),
    sha256(before),
  )
})

test("article review date cannot precede the new important fact or final coverage review", async (t) => {
  const f = setup(t),
    { context } = await reviewedContext(f),
    record = draftRecord(f, context)
  const decision = editorial(record, coverageFor(record, f.claims))
  decision.reviewed_at = "2026-09-29"
  assert.throws(
    () => approvedArticle(record, f.claims, [f.document], decision, [f.parse]),
    /precedes source/,
  )
})
