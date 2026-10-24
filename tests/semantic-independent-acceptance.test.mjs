import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { knowledgeFixture, addKnowledgeArticle } from "./fixtures/research-knowledge-fixtures.mjs"
import { noteText } from "../scripts/garden.mjs"
import { SECTORS } from "../scripts/sectors.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { draftFingerprint } from "../scripts/research/editor.mjs"
import { approvedArticle } from "../scripts/research/publish-adapter.mjs"
import { evaluateArticleConceptReview } from "../scripts/research/article-concept-review.mjs"
import { loadApprovedOntologyInput } from "../scripts/research/ontology.mjs"
import { storageAction } from "../scripts/research/cold-storage.mjs"
import { readReasoningTask, submitReasoningResult } from "../scripts/research/reasoning-tasks.mjs"
import {
  articleSemanticReviewStatus,
  exportArticleSemanticReviewIndex,
  prepareArticleSemanticReviews,
  resumeArticleSemanticReviews,
} from "../scripts/research/article-semantic-review.mjs"

// This suite uses native synthetic source/approval fixtures. It does not execute
// Luna, Qwen, Drive, publication, or development finalization.
const gateReady = () => ({ regular_execution_allowed: true })
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"))
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n")

function policyFor(f) {
  fs.mkdirSync(path.join(f.root, "data"), { recursive: true })
  for (const name of [
    "research-model-policy-codex.json",
    "research-semantic-retrieval-policy.json",
  ])
    fs.copyFileSync(path.join("data", name), path.join(f.root, "data", name))
  return path.join(f.root, "data/research-model-policy-codex.json")
}

function publish(f, run = "source") {
  const { article } = loadApprovedOntologyInput(f.root, run, { vault: f.vault })
  fs.mkdirSync(path.join(f.vault, "News"), { recursive: true })
  fs.writeFileSync(
    path.join(f.vault, "News", article.event_id + ".md"),
    noteText(
      {
        type: "news",
        event_id: article.event_id,
        title: article.title,
        sector: article.sector,
        published_at: article.article_review.published_at,
        review_status: "verified",
        sources: article.source_urls,
        concept_ids: article.article_review.concept_ids,
      },
      [
        "# " + article.title,
        article.record.lead,
        ...article.record.explanations.flatMap((section) => section.paragraphs),
        "## 출처\n\n- [원문](" + article.source_urls[0] + ")",
      ].join("\n\n"),
    ),
  )
  return article
}

function embeddingFixture({ failQueries = false } = {}) {
  const digest = "a".repeat(64)
  let calls = 0
  return {
    async metadata(model) {
      return { model, digest, capabilities: ["embedding"], runtime: "synthetic-q0-fixture" }
    },
    async embed({ model, inputs, expected_digest }) {
      assert.equal(model, "qwen3-embedding:8b")
      assert.equal(expected_digest, digest)
      calls += 1
      if (failQueries && calls > 1) throw Error("Q0 synthetic query embedding failure")
      return { model, digest, dimensions: 3, vectors: inputs.map(() => [1, 0, 0]) }
    },
  }
}

function params(f, policyFile, workflowId, extra = {}) {
  return {
    root: f.root,
    vault: f.vault,
    repo: f.root,
    policyFile,
    workflowId,
    gateReader: gateReady,
    ...extra,
  }
}

function reviewedNativeConcept(f, run, sector) {
  const directory = path.join(f.root, "runs", run),
    record = read(path.join(directory, "draft.json")),
    decision = read(path.join(directory, "editorial-review.json")),
    claims = read(path.join(directory, "reviewed-claims.json")).claims,
    documents = read(path.join(directory, "documents.json")),
    parses = read(path.join(directory, "parses.json")),
    reviewer = "Q0 synthetic native reviewer",
    reviewedAt = "2026-09-29"
  record.draft.sector = sector
  record.draft_id = draftFingerprint(record.draft)
  decision.draft_id = record.draft_id
  decision.reviewed_at = reviewedAt
  decision.concept_ids = ["source-concept"]
  decision.concept_review = {
    schema: "article-concept-review/v2",
    outcome: "reviewed_links",
    reason: "원문 주장의 재사용 원리를 현재 전문 개념 정의와 대조한 합성 검토다.",
    reviewer,
    reviewed_at: reviewedAt,
    article_source_read: true,
    concept_registry_read: true,
    aliases_checked: true,
    assignments: [
      {
        concept_id: "source-concept",
        role: "topic",
        status: "verified",
        reason: "공개 원고의 검증된 재사용 주장을 전문 개념 정의와 직접 대조했다.",
        reviewer,
        reviewed_at: reviewedAt,
        definition_read: true,
        article_source_read: true,
        relationship_checked: true,
        aliases_checked: true,
        evidence: [{ event_id: decision.event_id, claim_id: record.draft.lead[0].claim_ids[0] }],
        note: {
          path: "Knowledge/source-concept.md",
          sha256: sha256(fs.readFileSync(path.join(f.vault, "Knowledge/source-concept.md"))),
        },
      },
    ],
  }
  const article = approvedArticle(record, claims, documents, decision, parses),
    review = evaluateArticleConceptReview(f.root, article, record, claims, parses, decision, {
      vault: f.vault,
    })
  for (const [name, value] of Object.entries({
    "draft.json": record,
    "editorial-review.json": decision,
    "approved-article.json": article,
    "article-concept-review.json": review,
  }))
    write(path.join(directory, name), value)
  return publish(f, run)
}

test("Q0: 24 native source-bound pilot cases do not abort prepare", async (t) => {
  const f = await knowledgeFixture(t),
    policyFile = policyFor(f),
    runs = ["source"]
  for (let i = 1; i < 24; i++) {
    const run = "q0-pilot-" + i
    addKnowledgeArticle(f, { run, url: "https://fixture.example/q0-pilot/" + i })
    runs.push(run)
  }
  for (const [i, run] of runs.entries()) reviewedNativeConcept(f, run, SECTORS[i % 4])
  const prepared = await prepareArticleSemanticReviews(
    params(f, policyFile, "q0-native24-v1", { embeddingClient: embeddingFixture() }),
  )
  assert.equal(prepared.status_counts.total, 24)
  assert.equal(prepared.tasks.length, 20)
  // Two concepts cannot produce a 60% payload reduction. Neither insufficient
  // challenge coverage nor failed savings may silently enable shortlisting.
  const selections = path.join(
    f.root,
    "runs/q0-native24-v1/article-semantic-review/candidate-selections",
  )
  for (const file of fs.readdirSync(selections)) {
    assert.equal(read(path.join(selections, file)).mode, "full_registry_fallback")
  }
  assert.equal(fs.existsSync(path.join(f.root, "data/article-semantic-review-index.json")), false)
})

test("Q0: one damaged native source is blocked while other public articles remain in inventory", async (t) => {
  const f = await knowledgeFixture(t),
    policyFile = policyFor(f)
  const damaged = publish(f)
  addKnowledgeArticle(f, { run: "q0-healthy", url: "https://fixture.example/q0-healthy" })
  const healthy = publish(f, "q0-healthy")
  fs.unlinkSync(path.join(f.root, f.doc.body_path))
  const p = params(f, policyFile, "q0-source-integrity-v1", {
      embeddingClient: embeddingFixture(),
    }),
    prepared = await prepareArticleSemanticReviews(p)
  assert.equal(prepared.status_counts.total, 2)
  assert.equal(prepared.status_counts.blocked, 1)
  assert.deepEqual(
    prepared.tasks.map((task) => task.event_id),
    [healthy.event_id],
  )
  const status = articleSemanticReviewStatus(p)
  assert.equal(status.items.find((row) => row.event_id === damaged.event_id).status, "blocked")
  await assert.rejects(exportArticleSemanticReviewIndex(p))
})

test("Q0: failed query embedding gives every duplicate query its full registry fallback", async (t) => {
  const f = await knowledgeFixture(t),
    policyFile = policyFor(f)
  publish(f)
  for (let i = 1; i <= 2; i++) {
    const run = "q0-duplicate-" + i
    addKnowledgeArticle(f, { run, url: "https://fixture.example/duplicate/" + i })
    publish(f, run)
  }
  const prepared = await prepareArticleSemanticReviews(
    params(f, policyFile, "q0-query-failure-v1", {
      embeddingClient: embeddingFixture({ failQueries: true }),
    }),
  )
  assert.equal(prepared.status_counts.total, 3)
  assert.equal(prepared.status_counts.waiting_for_reasoning, 3)
  for (const task of prepared.tasks) {
    const request = read(path.join(f.root, "reasoning-tasks", task.task_id, "request.json"))
    assert.equal(request.input.context.candidate_retrieval.mode, "full_registry_fallback")
    assert.equal(request.input.context.reviewed_concept_registry.length, 2)
  }
})

function noneOutput(eventId, claimId) {
  return {
    schema: "article-semantic-proposal/v2",
    event_id: eventId,
    outcome: "reviewed_none",
    review_reason: "공개 주장과 검토된 전문 개념 사이에 확정할 수 있는 연결이 없다.",
    links: [],
    relation_candidates: [],
    concept_candidates: [],
    keyword_candidates: claimId
      ? [
          {
            keyword: "Q0_PRIVATE_KEYWORD_CANARY",
            reason: "검증 공개 주장에 연결된 비공개 검색 후보다.",
            evidence_claim_ids: [claimId],
          },
        ]
      : [],
  }
}

test("Q0: event selection preserves full inventory and forbids partial export", async (t) => {
  const f = await knowledgeFixture(t),
    policyFile = policyFor(f),
    first = publish(f)
  addKnowledgeArticle(f, { run: "q0-unselected", url: "https://fixture.example/q0-unselected" })
  const second = publish(f, "q0-unselected"),
    p = params(f, policyFile, "q0-event-selection-v1", {
      eventIds: [first.event_id],
      embeddingClient: embeddingFixture(),
    }),
    prepared = await prepareArticleSemanticReviews(p)
  assert.equal(prepared.status_counts.total, 2)
  assert.deepEqual(
    prepared.tasks.map((task) => task.event_id),
    [first.event_id],
  )
  assert.deepEqual(
    articleSemanticReviewStatus(p)
      .items.map((row) => row.event_id)
      .sort(),
    [first.event_id, second.event_id].sort(),
  )
  const task = prepared.tasks[0]
  await submitReasoningResult(f.root, {
    task_id: task.task_id,
    request_sha256: task.request_sha256,
    executor: "codex",
    model: "gpt-6-luna",
    output: noneOutput(first.event_id),
  })
  await resumeArticleSemanticReviews(p)
  await assert.rejects(exportArticleSemanticReviewIndex(p), /Every public article|still waiting/)
  assert.equal(fs.existsSync(path.join(f.root, "data/article-semantic-review-index.json")), false)
})

test("Q0: exact model/result binding and private candidate exclusion survive resume/export", async (t) => {
  const f = await knowledgeFixture(t),
    policyFile = policyFor(f),
    article = publish(f),
    p = params(f, policyFile, "q0-private-boundary-v1", { embeddingClient: embeddingFixture() }),
    prepared = await prepareArticleSemanticReviews(p),
    task = prepared.tasks[0],
    page = readReasoningTask(f.root, {
      task_id: task.task_id,
      request_sha256: task.request_sha256,
      limit: 64000,
    }),
    request = JSON.parse(page.chunk),
    claimId = request.input.context.verified_public_claims[0].claim_id,
    output = noneOutput(article.event_id, claimId),
    submit = (overrides = {}) =>
      submitReasoningResult(f.root, {
        task_id: task.task_id,
        request_sha256: task.request_sha256,
        executor: "codex",
        model: "gpt-6-luna",
        output,
        ...overrides,
      }),
    resultFile = path.join(f.root, "reasoning-tasks", task.task_id, "result.json")
  assert.equal(request.input.context.reviewed_concept_registry.length, 2)
  await assert.rejects(submit({ model: "gpt-6.1-sol" }), /match requested model/)
  await assert.rejects(
    submit({ output: { ...output, event_id: "fedcba9876543210" } }),
    /bound article/,
  )
  assert.equal(fs.existsSync(resultFile), false)
  await submit()
  const immutableBytes = fs.readFileSync(resultFile)
  await assert.rejects(
    submit({
      output: {
        ...output,
        review_reason: "다른 검토 결과를 불변 파일에 덮어쓰려는 합성 입력이다.",
      },
    }),
    /immutable/,
  )
  assert.ok(fs.readFileSync(resultFile).equals(immutableBytes))
  const damaged = read(resultFile)
  damaged.output.review_reason += " altered"
  write(resultFile, damaged)
  await assert.rejects(resumeArticleSemanticReviews(p), /binding changed/)
  fs.writeFileSync(resultFile, immutableBytes)
  const resumed = await resumeArticleSemanticReviews(p)
  assert.equal(resumed.status_counts.reviewed_none, 1)
  await exportArticleSemanticReviewIndex(p)
  const publicBytes = fs.readFileSync(
    path.join(f.root, "data/article-semantic-review-index.json"),
    "utf8",
  )
  assert.equal(publicBytes.includes("Q0_PRIVATE_KEYWORD_CANARY"), false)
  assert.equal(publicBytes.includes("keyword_candidates"), false)
  assert.equal(publicBytes.includes("source_block"), false)
  assert.equal(JSON.parse(publicBytes).reviews[0].status, "reviewed_none")
})

test("Q0: a changed retrieval policy requires a new workflow before cached requests resume", async (t) => {
  const f = await knowledgeFixture(t),
    policyFile = policyFor(f)
  publish(f)
  const p = params(f, policyFile, "q0-retrieval-policy-v1", {
    embeddingClient: embeddingFixture(),
  })
  await prepareArticleSemanticReviews(p)
  const retrievalPolicy = path.join(f.root, "data/research-semantic-retrieval-policy.json"),
    policy = read(retrievalPolicy)
  policy.enabled = !policy.enabled
  write(retrievalPolicy, policy)
  await assert.rejects(
    resumeArticleSemanticReviews(p),
    /inputs changed|policy.*changed|policy.*match/i,
  )
})

test("Q0: a cold supplementary sidecar preserves the exact native storage request", async (t) => {
  const f = await knowledgeFixture(t),
    policyFile = policyFor(f),
    article = publish(f),
    p = params(f, policyFile, "q0-sidecar-source-v1", { embeddingClient: embeddingFixture() }),
    prepared = await prepareArticleSemanticReviews(p),
    task = prepared.tasks[0],
    request = read(path.join(f.root, "reasoning-tasks", task.task_id, "request.json"))
  await submitReasoningResult(f.root, {
    task_id: task.task_id,
    request_sha256: task.request_sha256,
    executor: "codex",
    model: "gpt-6-luna",
    output: noneOutput(article.event_id),
  })
  await resumeArticleSemanticReviews(p)
  const pointer = read(
      path.join(f.root, `runs/${p.workflowId}/article-semantic-review/latest.json`),
    ),
    inventory = read(path.join(f.root, pointer.inventory.path)),
    row = inventory.items[0],
    receiptPath = `runs/${p.workflowId}/article-semantic-review/receipts/${row.event_id}-${row.semantic_input_sha256}.json`,
    receiptBytes = fs.readFileSync(path.join(f.root, receiptPath)),
    claims = request.input.context.verified_public_claims,
    sidecarPath = "runs/q0-sidecar-cold/source-comparison.json",
    sidecar = {
      schema: "semantic-retrieval-review/v1",
      event_id: row.event_id,
      article_public_sha256: row.article_public_sha256,
      approved_run: row.approved_run,
      approval_files_sha256: row.approval_files_sha256,
      concept_registry_sha256: row.concept_registry_sha256,
      case_kind: "challenge",
      challenge_kind: "reviewed_none",
      semantic_review: {
        workflow_id: p.workflowId,
        receipt: { path: receiptPath, sha256: sha256(receiptBytes) },
      },
      outcome: "reviewed_none",
      reviewer: "Q0 synthetic source reviewer; no operational review",
      reviewed_at: new Date().toISOString(),
      reason: "합성 공개 claim과 모든 정의를 대조해 확정할 관계가 없음을 명시한 입력이다.",
      article_source_read: true,
      concept_registry_read: true,
      aliases_checked: true,
      public_claim_ids: claims.map((claim) => claim.claim_id),
      links: [],
      source_comparisons: claims.map((claim) => ({
        claim_id: claim.claim_id,
        source_refs: claim.evidence.map(({ source_block, ...ref }) => ref),
        comparison: "합성 원문 블록의 계획 상태와 공개 문장을 현재 개념 정의와 대조했다.",
      })),
    }
  fs.mkdirSync(path.dirname(path.join(f.root, sidecarPath)), { recursive: true })
  write(path.join(f.root, sidecarPath), sidecar)
  const refs = [
    { path: sidecarPath, sha256: sha256(fs.readFileSync(path.join(f.root, sidecarPath))) },
  ]
  const sourceArgs = { ...p, workflowId: "q0-cold-sidecar-target", pilotReviewRefs: refs }
  // Validate the source-bound sidecar while hot, then archive it using the
  // existing local synthetic package/readback path. No remote API is involved.
  await prepareArticleSemanticReviews({ ...sourceArgs, workflowId: "q0-hot-sidecar-control" })
  storageAction(f.root, "prepare", { parent_id: "q0-synthetic-parent", minimum_payload_bytes: 0 })
  for (const bundle of storageAction(f.root, "pending").uploads)
    storageAction(f.root, "verify", {
      bundle_id: bundle.id,
      metadata: {
        id: "q0-synthetic-" + bundle.id,
        title: bundle.name,
        mime_type: "application/zip",
        size: String(bundle.bytes),
        parent_ids: ["q0-synthetic-parent"],
        modified_time: new Date().toISOString(),
        shared: false,
      },
      observed_at: new Date().toISOString(),
      download_path: bundle.local_path,
    })
  storageAction(f.root, "enable")
  fs.unlinkSync(path.join(f.root, sidecarPath))
  await assert.rejects(prepareArticleSemanticReviews(sourceArgs), (error) => {
    assert.equal(error.code, "STORAGE_PENDING")
    assert.ok(error.storage_request.requests.some((request) => request.path === sidecarPath))
    assert.ok(error.storage_request.requests[0].file_id.startsWith("q0-synthetic-"))
    return true
  })
})
