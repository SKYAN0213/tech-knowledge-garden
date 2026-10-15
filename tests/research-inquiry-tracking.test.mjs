import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { editionFixture } from "./fixtures/research-event-fixtures.mjs"
import {
  advanceInquiries,
  inquiryHistory,
  loadInquirySearchPlan,
  loadInquiryNativeParent,
} from "../scripts/research/inquiry-tracking.mjs"
import { reviewEditionEvents } from "../scripts/research/event-pipeline.mjs"
import { summarizeCollection } from "../scripts/research/collection-report.mjs"
import { executeTargetedSourceSearch } from "../scripts/research/source-targeted-search.mjs"
import { executeCandidateFollowups } from "../scripts/research/source-followups.mjs"
import { discoverSearch } from "../scripts/research/search.mjs"
import { articleContentFingerprint, selectStoredSources } from "../scripts/research/parser.mjs"
import { saveSourceSelection } from "../scripts/research/source-selection.mjs"
import { noteText } from "../scripts/garden.mjs"
import { atomicWrite, RunState, safePath } from "../scripts/research/run-state.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"

async function fixture(t, { followupIndex = 1 } = {}) {
  const f = editionFixture(t)
  f.reviewAt = new Date().toISOString()
  f.ctx.vault = path.join(f.root, "test-vault")
  f.ctx.backlog = path.join(f.root, "backlog.json")
  atomicWrite(f.root, "backlog.json", { schema: "research-candidates/v1", candidates: [] })
  for (const name of ["TrendTopics", "Signals"])
    fs.mkdirSync(path.join(f.ctx.vault, name), { recursive: true })
  fs.writeFileSync(
    path.join(f.ctx.vault, "TrendTopics/order-delivery.md"),
    noteText(
      {
        schema_version: "tech-trend/v1",
        id: "order-delivery",
        title: "계약 이후 실제 설치",
        reviewed: "2026-09-28",
        watch_for: "Contract-123 로봇의 고객 현장 설치 완료를 확인한다.",
        disconfirming: "계약 취소나 납품 지연이 있는지 확인한다.",
      },
      "# 계약 이후 설치",
    ),
  )
  fs.writeFileSync(
    path.join(f.ctx.vault, "Signals/fixture.md"),
    noteText(
      {
        schema_version: "tech-signals/v1",
        edition: "Editions/fixture",
        reviewed: "2026-09-28",
        observations: [
          {
            id: "order-signal",
            topic_id: "order-delivery",
            event_id: "fixture-event-id",
            next_check: "Contract-123의 출하와 설치 일자를 확인한다.",
          },
        ],
      },
      "# 관측 기록",
    ),
  )
  // Controlled original and parser fixtures: a distinct later source explicitly
  // describes delivery; no reused order announcement can complete the milestone.
  const follow = f.sources[3],
    body =
      "Fixture Robotics and Partner completed delivery and installed Contract-123 robots on 2026-09-28."
  follow.document.body_sha256 = sha256(body)
  follow.document.source_version_id = `${follow.document.source_id}:${sha256(body)}`
  follow.document.body_path = `documents/${follow.document.source_id}/${sha256(body)}/body.bin`
  follow.parsed.source_version_id = follow.document.source_version_id
  follow.parsed.parse_id = sha256(follow.document.source_version_id + "test-parser")
  follow.parsed.dates.published_at = "2026-09-28"
  follow.parsed.blocks = [
    { block_id: follow.parsed.parse_id + ":b1", text: body, locator: { text_hash: sha256(body) } },
  ]
  for (const source of f.sources) source.parsed.quality.required_fields_present = true
  const parent = f.sources[0]
  parent.parsed.blocks[0].locator.dom_path = "/html/body/article/p[1]"
  parent.parsed.links = [
    {
      url: f.sources[followupIndex].document.original_url,
      text: "robot order",
      dom_path: "/html/body/article/p[1]/a[1]",
    },
  ]
  for (const source of f.sources) {
    if (source === follow) atomicWrite(f.root, source.document.body_path, body)
    atomicWrite(f.root, `parses/${source.parsed.parse_id}/parse.json`, source.parsed)
  }
  for (const origin of new Set(f.sources.map((source) => source.origin))) {
    const rows = f.sources.filter((source) => source.origin === origin)
    atomicWrite(
      f.root,
      `runs/${origin}/documents.json`,
      rows.map((source) => source.document),
    )
    atomicWrite(
      f.root,
      `runs/${origin}/parses.json`,
      rows.map((source) => source.parsed),
    )
  }
  const windows = [{ channel_id: "fixture", since: "2026-09-27", until_exclusive: "2026-09-29" }]
  f.report = summarizeCollection({
    plan: { run_id: "daily-fixture", windows },
    receipts: [{ ...windows[0], attempt_id: "attempt", status: "incomplete" }],
    scans: f.sources.map((source) => ({
      run_id: source.origin,
      indexDocuments: [],
      documents: [source.document],
      parses: [source.parsed],
      candidates: [
        {
          article_source_version_id: source.document.source_version_id,
          article_parse_id: source.parsed.parse_id,
        },
      ],
    })),
    sizeOf: (file) => fs.statSync(safePath(f.root, file)).size,
  })
  f.report.materials.forEach((material) => {
    material.parse_sha256 = sha256(fs.readFileSync(safePath(f.root, material.parse_path)))
  })
  const bytes = JSON.stringify(f.report, null, 2) + "\n",
    reportRef = atomicWrite(
      f.root,
      `daily/runs/daily-fixture/collection-reports/${sha256(bytes)}.json`,
      bytes,
    )
  f.editionRef = atomicWrite(f.root, "editions/fixture-edition/materials.json", {
    schema: "research-edition-materials/v1",
    run_id: "fixture-edition",
    daily_run: "daily-fixture",
    report: reportRef,
    status: "partial",
    frozen_at: "2026-09-28T01:00:00Z",
    candidate_approved: false,
    candidate_published: false,
  })
  const materialOf = (source) =>
    f.report.materials.find(
      (material) => material.source_version_id === source.document.source_version_id,
    )
  for (const event of f.review.events)
    for (const material of event.materials) {
      const index = event.group_id === "order" ? event.materials.indexOf(material) : 3,
        source = f.sources[index]
      material.material_id = materialOf(source).id
      material.block_ids = [source.parsed.blocks[0].block_id]
      material.evidence = ["identity_marker", "event_action"].map((aspect) => ({
        aspect,
        block_id: source.parsed.blocks[0].block_id,
        quote: source.parsed.blocks[0].text,
      }))
    }
  f.review.events[1].identity = {
    who: "Fixture Robotics",
    action: "completed delivery",
    object: "Contract-123",
    occurred_at: "2026-09-28",
    external_id: "Contract-123",
  }
  atomicWrite(f.root, "inquiry-event-review.json", f.review)
  f.plan = await reviewEditionEvents(f.ctx, {
    ...f.parameters,
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
    review_file: path.relative(f.ctx.repo, path.join(f.root, "inquiry-event-review.json")),
  })
  f.pool = await advanceInquiries(f.ctx, { mode: "prepare", run_id: "question-pool" })
  f.question = f.pool.candidates.find((row) => row.source.field === "watch_for")
  f.poolRef = { path: f.pool.path, sha256: f.pool.sha256 }
  const channels = JSON.parse(
    fs.readFileSync(path.join(f.ctx.repo, "data/research-source-channels.json")),
  ).channels
  const route = channels.find((row) => row.id === "aws-whats-new-rss")
  f.activation = {
    question_id: f.question.question_id,
    decision: "activate",
    previous_review: null,
    target_stage: "customer_adoption",
    criterion: "Contract-123 로봇이 고객 현장에 실제 설치됐다는 발표",
    basis_reason: "계약 발표 원문에서 확인된 주문을 고객 설치 단계까지 추적한다.",
    baseline: eventEvidence(f, "order", f.sources[0]),
    baseline_state: "planned",
    next_check_at: null,
    sector: "로봇·제조",
    source_targets: [
      {
        channel_id: route.id,
        role: "customer",
        reason: "고객 측 제품 도입 발표를 찾아 비교하는 조사 의도이며 고객 관계 승인이 아니다.",
        search_terms: "Contract-123 robot deployment installed",
      },
    ],
  }
  return f
}
function eventEvidence(f, group, source) {
  const material = f.report.materials.find(
    (row) => row.source_version_id === source.document.source_version_id,
  )
  return {
    plan: { path: f.plan.path, sha256: f.plan.sha256 },
    group_id: group,
    evidence: [
      {
        material_id: material.id,
        block_id: source.parsed.blocks[0].block_id,
        quote: source.parsed.blocks[0].text,
        published_at: source.parsed.dates.published_at,
      },
    ],
  }
}
async function review(f, rows, run = "activate-questions", at = f.reviewAt) {
  const file = `input-${run}.json`
  atomicWrite(f.root, file, {
    schema: "research-inquiry-review-input/v1",
    pool: f.poolRef,
    reviewer: "test-original-reviewer",
    reviewed_at: at,
    questions: rows,
  })
  return advanceInquiries(f.ctx, {
    mode: "review",
    run_id: run,
    pool_path: f.pool.path,
    pool_sha256: f.pool.sha256,
    review_file: path.relative(f.ctx.repo, path.join(f.root, file)),
  })
}
async function activated(f) {
  return review(f, [f.activation])
}
const status = (f) =>
  advanceInquiries(f.ctx, { mode: "status", question_ids: [f.question.question_id] })
function observation(f, previous, changes = {}) {
  return {
    question_id: f.question.question_id,
    decision: "observe",
    previous_review: previous,
    observation_kind: "answer",
    event: eventEvidence(f, "deferred", f.sources[3]),
    event_state: "completed",
    occurred_at: "2026-09-28",
    effective_at: null,
    comparison: {
      baseline_quote: f.sources[0].parsed.blocks[0].text,
      followup_quote: f.sources[3].parsed.blocks[0].text,
      criterion_match:
        "같은 Contract-123 계약의 고객 설치 완료라는 서로 다른 발표를 양쪽 원문에서 확인했다.",
      conclusion: "계약 발표 뒤 실제 설치 완료가 발표됐다.",
    },
    next_check_at: null,
    ...changes,
  }
}

test("existing note questions are an unreviewed private queue without model or source collection", async (t) => {
  const f = await fixture(t),
    before = fs.readFileSync(path.join(f.ctx.vault, "Signals/fixture.md"))
  assert.equal(f.pool.candidate_count, 3)
  assert.ok(
    f.pool.candidates.every((row) => row.status === "unreviewed" && row.source_read === false),
  )
  await assert.rejects(
    advanceInquiries(f.ctx, {
      mode: "plan",
      run_id: "unreviewed",
      question_ids: [f.question.question_id],
      observation_day: "2026-10-12",
    }),
    /explicit source-backed review/,
  )
  assert.deepEqual(fs.readFileSync(path.join(f.ctx.vault, "Signals/fixture.md")), before)
  assert.equal(f.pool.network_requests, 0)
  assert.equal(f.pool.publication_approved, false)
})

test("review preserves original publication date, stage criterion, quote and explicit question revision", async (t) => {
  const f = await fixture(t),
    reviewed = await activated(f),
    history = inquiryHistory(f.ctx, f.question.question_id)
  assert.equal(history.length, 1)
  assert.equal(history[0].record.activation.baseline_event.evidence[0].published_at, "2026-09-27")
  assert.equal(history[0].record.activation.baseline_state, "planned")
  assert.equal(history[0].record.publication_approved, false)
  const repeated = await activated(f)
  assert.equal(repeated.reused, true)
  assert.deepEqual(repeated.reviews, reviewed.reviews)
  assert.equal((await status(f)).items[0].status, "active")
})

test("source/date/quote mismatches and unregistered targets cannot activate questions", async (t) => {
  const f = await fixture(t)
  const invalidQuote = structuredClone(f.activation)
  invalidQuote.baseline.evidence[0].quote = "invented deployment fact"
  const invalidDate = structuredClone(f.activation)
  invalidDate.baseline.evidence[0].published_at = "2026-09-28"
  const invalidRoute = structuredClone(f.activation)
  invalidRoute.source_targets[0].channel_id = "not-registered"
  const unknown = { ...structuredClone(f.activation), bypass_review: true }
  for (const [n, value] of [invalidQuote, invalidDate, invalidRoute, unknown].entries())
    await assert.rejects(review(f, [value], "reject-" + n))
  assert.equal(inquiryHistory(f.ctx, f.question.question_id).length, 0)
})

test("reviewed questions create bounded native-language source searches and preserve deferred questions", async (t) => {
  const f = await fixture(t)
  f.activation.source_targets.push({
    channel_id: "github-changelog",
    role: "local_press",
    reason: "후속 개발 발표의 독립 경로를 대조한다.",
    search_terms: "Contract-123 robot deployment installed",
  })
  await activated(f)
  const plan = await advanceInquiries(f.ctx, {
    mode: "plan",
    run_id: "question-search",
    observation_day: "2026-10-12",
    max_queries: 1,
  })
  const saved = loadInquirySearchPlan(f.ctx, { path: plan.path, sha256: plan.sha256 })
  assert.equal(plan.query_count, 1)
  assert.equal(plan.deferred_queries, 1)
  assert.equal(saved.queries[0].scope, "registered-source")
  assert.equal(saved.queries[0].inquiry_intents[0].question_id, f.question.question_id)
  assert.equal(saved.queries[0].role_is_search_intent, true)
  assert.equal(saved.progress_confirmed, false)
  assert.equal(plan.network_requests, 0)
})

test("question plans reach the existing native targeted executor and resume without another search", async (t) => {
  const f = await fixture(t)
  await activated(f)
  const plan = await advanceInquiries(f.ctx, {
    mode: "plan",
    run_id: "target-inquiry",
    observation_day: "2026-10-12",
  })
  let calls = 0
  const p = {
    ...f.ctx,
    runId: "target-execution",
    mode: "plan-only",
    inquiryPlanPath: plan.path,
    inquiryPlanSha256: plan.sha256,
    backlogFile: f.ctx.backlog,
    maxQueries: 8,
    runSearch: async (input) => {
      calls++
      const q = JSON.parse(fs.readFileSync(input.query_path)),
        state = new RunState(
          f.root,
          input.run_id,
          {
            queries_sha256: sha256(JSON.stringify(q.queries)),
            daily_basis_sha256: null,
            module_sha256: q.search_sha256,
            service: q.service,
          },
          { scope: "search" },
        )
      return discoverSearch(
        f.root,
        input.run_id,
        {
          search: async (query) => ({
            links: [
              {
                url: new URL("/news/contract-123-installation", query.source_url).href,
                text: "Contract-123 installation source",
              },
            ],
            failures: [],
            engines: ["controlled-test-provider"],
            primary_engines: [],
            provider_requests: [],
            supplemental_engines: [],
            engine_count: 1,
          }),
        },
        q.queries,
        { state },
      )
    },
  }
  const planned = await executeTargetedSourceSearch(p)
  assert.equal(planned.status, "planned")
  assert.equal(calls, 0)
  const first = await executeTargetedSourceSearch({ ...p, mode: "execute" })
  assert.equal(first.candidate_count, 1)
  assert.equal(calls, 1)
  assert.equal(first.progress_confirmed, false)
  assert.equal(first.candidate_published, false)
  const candidates = JSON.parse(fs.readFileSync(f.ctx.backlog)).candidates
  assert.ok(
    candidates[0].discovery.some(
      (row) => row.question_id === f.question.question_id && row.progress_confirmed === false,
    ),
  )
  const resumed = await executeTargetedSourceSearch({
    ...p,
    mode: "resume",
    runSearch: () => {
      throw Error("duplicate query forbidden")
    },
  })
  assert.equal(resumed.reused, true)
  assert.equal(calls, 1)
  assert.equal((await status(f)).items[0].history.length, 1)
})

test("a directly compared follow-up completes only the reviewed milestone and keeps both event dates", async (t) => {
  const f = await fixture(t),
    activation = await activated(f)
  const next = await review(f, [observation(f, activation.reviews[0])], "review-followup")
  const current = (await status(f)).items[0]
  assert.equal(current.status, "answered")
  assert.equal(current.history.length, 2)
  assert.equal(current.baseline.evidence[0].published_at, "2026-09-27")
  assert.equal(current.history[1].event.evidence[0].published_at, "2026-09-28")
  assert.equal(current.history[1].occurred_at, "2026-09-28")
  const plan = await advanceInquiries(f.ctx, {
    mode: "plan",
    run_id: "answered-search",
    observation_day: "2026-10-12",
  })
  assert.equal(plan.query_count, 0)
  assert.equal(plan.held[0].reason, "answered")
  assert.equal(next.publication_approved, false)
})

test("planned action, repeated evidence, stale revision and future occurrence cannot masquerade as progress", async (t) => {
  const f = await fixture(t),
    activatedResult = await activated(f),
    previous = activatedResult.reviews[0]
  const inputs = [
    observation(f, previous, { event_state: "planned", occurred_at: null }),
    observation(f, previous, {
      event: f.activation.baseline,
      occurred_at: null,
      observation_kind: "progress",
      comparison: {
        baseline_quote: f.sources[0].parsed.blocks[0].text,
        followup_quote: f.sources[0].parsed.blocks[0].text,
        criterion_match: "동일 발표를 재확인했다.",
        conclusion: "다른 사건이 아니다.",
      },
    }),
    observation(f, { ...previous, sha256: "0".repeat(64) }),
    observation(f, previous, { occurred_at: "2099-01-01" }),
  ]
  for (const [n, input] of inputs.entries())
    await assert.rejects(review(f, [input], "bad-progress-" + n))
  assert.equal(inquiryHistory(f.ctx, f.question.question_id).length, 1)
})

test("changed source note invalidates new searches but leaves past review receipts intact", async (t) => {
  const f = await fixture(t),
    reviewed = await activated(f),
    before = fs.readFileSync(safePath(f.root, reviewed.reviews[0].path))
  const plan = await advanceInquiries(f.ctx, {
    mode: "plan",
    run_id: "before-note-change",
    observation_day: "2026-10-12",
  })
  fs.appendFileSync(path.join(f.ctx.vault, f.question.source.note_path), "\n다음 검토 기록 변경\n")
  assert.throws(
    () => loadInquirySearchPlan(f.ctx, { path: plan.path, sha256: plan.sha256 }),
    /source note changed/,
  )
  assert.equal((await status(f)).items[0].status, "requires_recheck")
  assert.deepEqual(fs.readFileSync(safePath(f.root, reviewed.reviews[0].path)), before)
})

test("question-bound body links reach native stored-source reuse and remain unapproved leads", async (t) => {
  const f = await fixture(t)
  await activated(f)
  const plan = await advanceInquiries(f.ctx, {
    mode: "plan",
    run_id: "body-inquiry",
    observation_day: "2026-10-12",
  })
  const parent = f.sources[0]
  atomicWrite(f.root, "backlog.json", {
    schema: "research-candidates/v1",
    candidates: [
      {
        key: "source-" + sourceId(parent.document.original_url),
        title: parent.parsed.title,
        source_urls: [parent.document.original_url],
        source_published_at: parent.parsed.dates.published_at,
        discovered_at: parent.document.observed_at,
        article_source_version_id: parent.document.source_version_id,
        article_parse_id: parent.parsed.parse_id,
        article_content_sha256: articleContentFingerprint(parent.parsed),
        review_status: "unreviewed",
        discovery: [],
      },
    ],
  })
  let requests = 0
  const p = {
    ...f.ctx,
    runId: "question-body-followup",
    mode: "plan-only",
    candidateKey: "source-" + sourceId(parent.document.original_url),
    parentSourceRun: parent.origin,
    backlogFile: f.ctx.backlog,
    sourceRun: f.sources[1].origin,
    inquiryPlanPath: plan.path,
    inquiryPlanSha256: plan.sha256,
    questionId: f.question.question_id,
    runNative: async (command, input) => {
      requests++
      assert.equal(command, "select-source")
      return saveSourceSelection(
        f.root,
        input.run_id,
        selectStoredSources(f.root, input.source_run, input.urls),
      )
    },
  }
  const planned = await executeCandidateFollowups(p)
  assert.equal(requests, 0)
  assert.equal(planned.selected_leads.length, 1)
  const result = await executeCandidateFollowups({ ...p, mode: "reuse" })
  assert.equal(requests, 1)
  assert.equal(result.readable_source_count, 1)
  assert.equal(result.inquiry.progress_confirmed, false)
  assert.equal(result.publication_approved, false)
  const repeat = await executeCandidateFollowups({
    ...p,
    mode: "reuse",
    runNative: () => {
      throw Error("repeat collection forbidden")
    },
  })
  assert.equal(repeat.reused, true)
  const backlog = JSON.parse(fs.readFileSync(f.ctx.backlog))
  assert.ok(
    backlog.candidates
      .find((row) => row.source_urls[0] === f.sources[1].document.original_url)
      .discovery.some((row) => row.question_id === f.question.question_id),
  )
})

test("old and future-check questions remain in history without date expiry or fabricated empty news", async (t) => {
  const f = await fixture(t)
  f.activation.next_check_at = "2026-10-20"
  await activated(f)
  const early = await advanceInquiries(f.ctx, {
    mode: "plan",
    run_id: "not-yet-due",
    observation_day: "2026-10-12",
  })
  assert.equal(early.query_count, 0)
  assert.equal(early.held[0].reason, "scheduled_future_check")
  const later = await advanceInquiries(f.ctx, {
    mode: "plan",
    run_id: "due-later",
    observation_day: "2026-10-20",
  })
  assert.equal(later.query_count, 1)
  assert.equal(later.progress_confirmed, false)
  assert.equal((await status(f)).items[0].status, "active")
})

test("a provider bootstrap interruption cannot repeat requests when no query checkpoint was recorded", async (t) => {
  const f = await fixture(t)
  await activated(f)
  const plan = await advanceInquiries(f.ctx, {
    mode: "plan",
    run_id: "bootstrap-question-plan",
    observation_day: "2026-10-12",
  })
  const parameters = {
    ...f.ctx,
    runId: "bootstrap-search",
    inquiryPlanPath: plan.path,
    inquiryPlanSha256: plan.sha256,
    maxQueries: 1,
  }
  const prepared = await executeTargetedSourceSearch({ ...parameters, mode: "plan-only" })
  const native = JSON.parse(fs.readFileSync(safePath(f.root, prepared.plan.path)))
  new RunState(
    f.root,
    parameters.runId,
    {
      queries_sha256: sha256(JSON.stringify(native.queries)),
      daily_basis_sha256: null,
      module_sha256: native.search_sha256,
      service: native.service,
    },
    { scope: "search" },
  )
  let requests = 0
  const before = fs.readFileSync(safePath(f.root, `runs/${parameters.runId}/search/state.json`))
  const resumed = await executeTargetedSourceSearch({
    ...parameters,
    mode: "resume",
    runSearch: () => {
      requests++
      throw Error("Provider bootstrap must not be repeated")
    },
  })
  assert.equal(resumed.status, "interrupted")
  assert.equal(requests, 0)
  assert.deepEqual(
    fs.readFileSync(safePath(f.root, `runs/${parameters.runId}/search/state.json`)),
    before,
  )
  assert.equal(resumed.candidate_published, false)
})

test("native inquiry material plans body follow-ups without registering a canonical parent", async (t) => {
  const f = await fixture(t)
  await activated(f)
  const planned = await advanceInquiries(f.ctx, {
    mode: "plan",
    run_id: "native-parent-inquiry",
    observation_day: "2026-10-12",
  })
  const next = planned.followup_parents[0].next_parameters
  assert.equal(next.parent_material_id, f.activation.baseline.evidence[0].material_id)
  assert.equal(next.candidate_key, undefined)
  const before = fs.readFileSync(f.ctx.backlog),
    parent = f.sources[0]
  const bodyBefore = fs.readFileSync(safePath(f.root, parent.document.body_path))
  const result = await executeCandidateFollowups({
    ...f.ctx,
    runId: next.run_id,
    mode: "plan-only",
    backlogFile: f.ctx.backlog,
    inquiryPlanPath: next.inquiry_plan_path,
    inquiryPlanSha256: next.inquiry_plan_sha256,
    questionId: next.question_id,
    parentMaterialId: next.parent_material_id,
    runNative: () => {
      throw Error("plan-only cannot collect")
    },
  })
  assert.equal(result.status, "planned")
  assert.equal(result.selected_leads.length, 1)
  assert.equal(result.native_parent.kind, "reviewed-inquiry-material")
  assert.equal(result.native_parent.source_published_at, "2026-09-27")
  assert.equal(result.native_parent.parent_registered, false)
  assert.equal(result.native_parent.event_refs[0].group_id, "order")
  assert.equal(result.native_parent.event_refs[0].evidence[0].quote, parent.parsed.blocks[0].text)
  assert.deepEqual(fs.readFileSync(f.ctx.backlog), before)
  assert.deepEqual(fs.readFileSync(safePath(f.root, parent.document.body_path)), bodyBefore)
})

test("native inquiry parent reuse preserves child dates and requires explicit reviewed observation for progress", async (t) => {
  const f = await fixture(t, { followupIndex: 3 })
  const activation = await activated(f)
  const planned = await advanceInquiries(f.ctx, {
    mode: "plan",
    run_id: "native-child-inquiry",
    observation_day: "2026-10-12",
  })
  const next = planned.followup_parents[0].next_parameters
  let selections = 0
  const parameters = {
    ...f.ctx,
    runId: next.run_id,
    mode: "reuse",
    backlogFile: f.ctx.backlog,
    inquiryPlanPath: next.inquiry_plan_path,
    inquiryPlanSha256: next.inquiry_plan_sha256,
    questionId: next.question_id,
    parentMaterialId: next.parent_material_id,
    sourceRun: f.sources[3].origin,
    runNative: async (command, input) => {
      selections++
      assert.equal(command, "select-source")
      return saveSourceSelection(
        f.root,
        input.run_id,
        selectStoredSources(f.root, input.source_run, input.urls),
      )
    },
  }
  const result = await executeCandidateFollowups(parameters)
  assert.equal(result.status, "source-ready-for-review")
  assert.equal(selections, 1)
  assert.equal(result.inquiry.progress_confirmed, false)
  assert.equal(result.publication_approved, false)
  const candidates = JSON.parse(fs.readFileSync(f.ctx.backlog)).candidates
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].source_urls[0], f.sources[3].document.original_url)
  assert.equal(candidates[0].source_published_at, "2026-09-28")
  assert.equal(candidates[0].event_id, undefined)
  assert.equal(candidates[0].review_status, "unreviewed")
  assert.ok(candidates[0].discovery.some((entry) => entry.question_id === f.question.question_id))
  assert.equal((await status(f)).items[0].history.length, 1)
  const repeated = await executeCandidateFollowups({
    ...parameters,
    runNative: () => {
      throw Error("duplicate source selection forbidden")
    },
  })
  assert.equal(repeated.reused, true)
  assert.equal(JSON.parse(fs.readFileSync(f.ctx.backlog)).candidates.length, 1)
  await review(f, [observation(f, activation.reviews[0])], "native-followup-observation")
  const latest = (await status(f)).items[0]
  assert.equal(latest.status, "answered")
  assert.equal(latest.history.length, 2)
  assert.equal(
    latest.history[1].event.evidence[0].source_version_id,
    candidates[0].article_source_version_id,
  )
})

test("native inquiry parent rejects unquoted same-event materials and mixed or altered authority inputs", async (t) => {
  const f = await fixture(t)
  await activated(f)
  const plan = await advanceInquiries(f.ctx, {
    mode: "plan",
    run_id: "native-guard-inquiry",
    observation_day: "2026-10-12",
  })
  const before = fs.readFileSync(f.ctx.backlog)
  const unquoted = f.report.materials.find(
    (row) => row.source_version_id === f.sources[1].document.source_version_id,
  ).id
  const parameters = {
    ...f.ctx,
    mode: "plan-only",
    backlogFile: f.ctx.backlog,
    inquiryPlanPath: plan.path,
    inquiryPlanSha256: plan.sha256,
    questionId: f.question.question_id,
    parentMaterialId: f.activation.baseline.evidence[0].material_id,
    runNative: () => {
      throw Error("invalid parent cannot collect")
    },
  }
  const invalid = [
    { parentMaterialId: unquoted },
    { inquiryPlanSha256: "0".repeat(64) },
    { questionId: "0".repeat(64) },
    { parentSourceRun: f.sources[0].origin },
    { candidateKey: "source-" + sourceId(f.sources[0].document.original_url) },
    { inquiryPlanPath: undefined, inquiryPlanSha256: undefined },
  ]
  for (const [index, changes] of invalid.entries())
    await assert.rejects(
      executeCandidateFollowups({ ...parameters, runId: "native-invalid-" + index, ...changes }),
    )
  assert.deepEqual(fs.readFileSync(f.ctx.backlog), before)
})

test("native inquiry parent rechecks original bytes before returning a cached child collection", async (t) => {
  const f = await fixture(t)
  await activated(f)
  const plan = await advanceInquiries(f.ctx, {
    mode: "plan",
    run_id: "native-byte-inquiry",
    observation_day: "2026-10-12",
  })
  const p = {
    ...f.ctx,
    runId: "native-byte-child",
    mode: "reuse",
    backlogFile: f.ctx.backlog,
    inquiryPlanPath: plan.path,
    inquiryPlanSha256: plan.sha256,
    questionId: f.question.question_id,
    parentMaterialId: f.activation.baseline.evidence[0].material_id,
    sourceRun: f.sources[1].origin,
    runNative: async (_command, input) =>
      saveSourceSelection(
        f.root,
        input.run_id,
        selectStoredSources(f.root, input.source_run, input.urls),
      ),
  }
  await executeCandidateFollowups(p)
  const before = fs.readFileSync(f.ctx.backlog)
  fs.appendFileSync(safePath(f.root, f.sources[0].document.body_path), "altered original")
  await assert.rejects(
    executeCandidateFollowups({
      ...p,
      runNative: () => {
        throw Error("no new source request after byte drift")
      },
    }),
    /hash|bytes|changed/i,
  )
  assert.deepEqual(fs.readFileSync(f.ctx.backlog), before)
})

test("native inquiry parent cannot reactivate sources from a superseded question basis", async (t) => {
  const f = await fixture(t)
  const first = await activated(f)
  const updated = {
    ...f.activation,
    previous_review: first.reviews[0],
    baseline: eventEvidence(f, "order", f.sources[1]),
  }
  await review(f, [updated], "native-revised-basis")
  const plan = await advanceInquiries(f.ctx, {
    mode: "plan",
    run_id: "native-current-basis",
    observation_day: "2026-10-12",
  })
  assert.equal(
    plan.followup_parents[0].parent_material_id,
    updated.baseline.evidence[0].material_id,
  )
  assert.throws(
    () =>
      loadInquiryNativeParent(
        f.ctx,
        { path: plan.path, sha256: plan.sha256 },
        f.question.question_id,
        f.activation.baseline.evidence[0].material_id,
      ),
    /directly cited material/,
  )
  const current = loadInquiryNativeParent(
    f.ctx,
    { path: plan.path, sha256: plan.sha256 },
    f.question.question_id,
    updated.baseline.evidence[0].material_id,
  )
  assert.equal(current.selected.parses[0].parse_id, f.sources[1].parsed.parse_id)
})
