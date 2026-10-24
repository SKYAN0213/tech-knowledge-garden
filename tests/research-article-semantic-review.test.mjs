import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { knowledgeFixture, addKnowledgeArticle } from "./fixtures/research-knowledge-fixtures.mjs"
import { loadApprovedOntologyInput } from "../scripts/research/ontology.mjs"
import { noteText, canonicalURL } from "../scripts/garden.mjs"
import { markdownProse } from "../scripts/explanations.mjs"
import { readReasoningTask, submitReasoningResult } from "../scripts/research/reasoning-tasks.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import {
  articleSemanticReviewStatus,
  exportArticleSemanticReviewIndex,
  prepareArticleSemanticReviews,
  retryInvalidArticleSemanticReview,
  resumeArticleSemanticReviews,
  nativeApprovalSelectionCandidateSetSha256,
} from "../scripts/research/article-semantic-review.mjs"
import { buildGraph, articleSearchText } from "../scripts/knowledge.mjs"
import { articlePublicFingerprint } from "../web/article-semantic-index.mjs"
import { articleReview } from "../scripts/article-review.mjs"
import { readSemanticObservations } from "../scripts/research/semantic-review-metrics.mjs"
import { evaluateArticleConceptReview } from "../scripts/research/article-concept-review.mjs"
import { approvedArticle } from "../scripts/research/publish-adapter.mjs"
import { draftFingerprint } from "../scripts/research/editor.mjs"
import { SECTORS } from "../scripts/sectors.mjs"
import { storageAction } from "../scripts/research/cold-storage.mjs"
import { parseNote } from "../scripts/garden.mjs"
import { conceptCandidateGoldSha256 } from "../scripts/research/concept-candidate-index.mjs"

const gateReady = () => ({ regular_execution_allowed: true })

function fullRegistryReviewRef(f, eventId, name = "targeted-registry-review") {
  const relative = `inputs/${name}-${eventId}.md`,
    bytes = `Synthetic source review for ${eventId}: an existing specialist concept was outside the shortlist.\n`
  fs.writeFileSync(path.join(f.root, relative), bytes)
  return { event_id: eventId, path: relative, sha256: sha256(bytes) }
}

test("targeted full registry expands one contextual12 receipt and preserves C7 provenance", async (t) => {
  // The existing validated hybrid pilot is fixture support; A/B are the two
  // completed articles under test and C remains blocked. No model is executed.
  const { f, args, a, b, refs, original, tasks } = await completedPrivateReuseFixture(t, {
      hybrid: true,
    }),
    target = tasks.find((task) => task.event_id === b.event_id),
    priorRequest = readFixtureRequest(f.root, target),
    pointerPath = path.join(f.root, "runs", args.workflowId, "article-semantic-review/latest.json"),
    pointer = JSON.parse(fs.readFileSync(pointerPath)),
    inventoryPath = path.join(f.root, pointer.inventory.path),
    inventoryBytes = fs.readFileSync(inventoryPath),
    protectedFiles = [
      ...original.map((row) => path.join(f.root, row.ref.path)),
      ...JSON.parse(inventoryBytes)
        .items.filter((row) => tasks.some((task) => task.event_id === row.event_id))
        .map((row) =>
          path.join(
            f.root,
            "runs",
            args.workflowId,
            "article-semantic-review/candidate-selections",
            `${row.event_id}-${row.approval_files_sha256}.json`,
          ),
        ),
      ...tasks.flatMap((task) =>
        ["request.json", "result.json"].map((name) =>
          path.join(f.root, "reasoning-tasks", task.task_id, name),
        ),
      ),
    ].map((file) => ({ file, bytes: fs.readFileSync(file) })),
    reviewRef = fullRegistryReviewRef(f, b.event_id)
  assert.equal(priorRequest.input.context.reviewed_concept_registry.length, 12)
  assert.equal(Object.hasOwn(JSON.parse(inventoryBytes), "full_registry_event_ids"), false)
  assert.equal(
    Object.hasOwn(priorRequest.input.context.candidate_retrieval, "full_registry_review_refs"),
    false,
  )
  assert.equal(
    JSON.parse(original.find((row) => row.ref.path.includes(b.event_id)).bytes).status,
    "reviewed_none",
  )
  const empty = await prepareArticleSemanticReviews({
    ...args,
    full_registry_event_ids: [],
    full_registry_review_refs: [],
  })
  assert.equal(empty.inventory_sha256, JSON.parse(inventoryBytes).inventory_sha256)
  assert.ok(fs.readFileSync(inventoryPath).equals(inventoryBytes))
  assert.deepEqual(readFixtureRequest(f.root, target), priorRequest)

  const expandedArgs = {
      ...args,
      workflowId: "targeted-full-registry-next",
      completedReviewRefs: refs,
      eventIds: [b.event_id],
      fullRegistryEventIds: [b.event_id],
      fullRegistryReviewRefs: [reviewRef],
      limit: 1,
    },
    expanded = await prepareArticleSemanticReviews(expandedArgs)
  assert.equal(expanded.prepared, 1, "Only the expanded article needs a new native request")
  assert.equal(expanded.tasks[0].event_id, b.event_id)
  assert.notEqual(expanded.tasks[0].task_id, target.task_id)
  assert.notEqual(expanded.tasks[0].semantic_input_sha256, target.semantic_input_sha256)
  const request = readFixtureRequest(f.root, expanded.tasks[0]),
    context = request.input.context,
    status = articleSemanticReviewStatus({ ...expandedArgs, limit: 100 }),
    unchanged = status.items.find((row) => row.event_id === a.event_id),
    prior = JSON.parse(original.find((row) => row.ref.path.includes(a.event_id)).bytes)
  assert.equal(context.candidate_retrieval.mode, "full_registry_fallback")
  assert.equal(context.candidate_retrieval.fallback_reason, "explicit_full_registry_review")
  assert.equal(context.reviewed_concept_registry.length, context.candidate_retrieval.total_concepts)
  assert.ok(context.reviewed_concept_registry.length > 12)
  assert.deepEqual(context.candidate_retrieval.full_registry_review_refs, [reviewRef])
  assert.deepEqual(context.article, priorRequest.input.context.article)
  assert.deepEqual(
    context.verified_public_claims,
    priorRequest.input.context.verified_public_claims,
  )
  for (const concept of priorRequest.input.context.reviewed_concept_registry)
    assert.deepEqual(
      context.reviewed_concept_registry.find((row) => row.concept_id === concept.concept_id),
      concept,
    )
  assert.equal(unchanged.task_id, prior.task_id)
  assert.equal(unchanged.request_sha256, prior.request_sha256)
  assert.equal(unchanged.reused_receipt_review.result_sha256, prior.result_sha256)
  assert.equal(unchanged.reused_receipt_review.reviewed_at, prior.reviewed_at)
  assert.deepEqual(
    unchanged.receipt_ref,
    refs.find((ref) => ref.path.includes(a.event_id)),
  )
  const repeated = await prepareArticleSemanticReviews({
    ...expandedArgs,
    fullRegistryEventIds: undefined,
    fullRegistryReviewRefs: undefined,
  })
  assert.equal(repeated.tasks[0].request_sha256, expanded.tasks[0].request_sha256)
  await assert.rejects(
    prepareArticleSemanticReviews({
      ...expandedArgs,
      fullRegistryEventIds: [],
      fullRegistryReviewRefs: [],
    }),
    /Full.registry.*changed|full.registry.*changed/,
  )
  assert.equal(status.status_counts.blocked, 1)
  await assert.rejects(
    exportArticleSemanticReviewIndex(expandedArgs),
    /Complete every article's exact native approval\/storage review before export/,
  )
  await submitReasoningResult(f.root, {
    ...expanded.tasks[0],
    executor: "codex",
    model: "gpt-6-luna",
    output: fixtureOutput(request, true),
  })
  const expandedPointer = JSON.parse(
      fs.readFileSync(
        path.join(f.root, "runs", expandedArgs.workflowId, "article-semantic-review/latest.json"),
      ),
    ),
    expandedInventory = JSON.parse(
      fs.readFileSync(path.join(f.root, expandedPointer.inventory.path)),
    ),
    readyOffset = expandedInventory.items
      .filter((row) => row.status === "ready")
      .findIndex((row) => row.event_id === b.event_id)
  assert.ok(readyOffset >= 0)
  const resumed = await resumeArticleSemanticReviews({ ...expandedArgs, offset: readyOffset }),
    widenedRef = resumed.completed[0].receipt_ref,
    widenedBytes = fs.readFileSync(path.join(f.root, widenedRef.path)),
    carried = await prepareArticleSemanticReviews({
      ...args,
      workflowId: "targeted-full-origin-reused",
      completedReviewRefs: [refs.find((ref) => ref.path.includes(a.event_id)), widenedRef],
      fullRegistryEventIds: [b.event_id],
      fullRegistryReviewRefs: [reviewRef],
    })
  assert.equal(carried.prepared, 0)
  await assert.rejects(
    prepareArticleSemanticReviews({
      ...args,
      workflowId: "targeted-full-missing-event-proof",
      fullRegistryEventIds: [a.event_id, b.event_id],
      fullRegistryReviewRefs: [reviewRef],
    }),
    /review references required for every expanded event/,
  )
  const aRef = fullRegistryReviewRef(f, a.event_id),
    multiArgs = {
      ...args,
      workflowId: "targeted-full-multiple",
      completedReviewRefs: [refs.find((ref) => ref.path.includes(a.event_id)), widenedRef],
      fullRegistryEventIds: [b.event_id, a.event_id],
      fullRegistryReviewRefs: [reviewRef, aRef],
    },
    multiple = await prepareArticleSemanticReviews(multiArgs),
    multipleStatus = articleSemanticReviewStatus({ ...multiArgs, limit: 100 }),
    preservedB = multipleStatus.items.find((row) => row.event_id === b.event_id)
  assert.deepEqual(
    multiple.tasks.map((row) => row.event_id),
    [a.event_id],
  )
  assert.equal(preservedB.task_id, expanded.tasks[0].task_id)
  const widenedReceipt = JSON.parse(widenedBytes)
  assert.equal(preservedB.request_sha256, widenedReceipt.request_sha256)
  assert.equal(preservedB.reused_receipt_review.result_sha256, widenedReceipt.result_sha256)
  assert.equal(preservedB.reused_receipt_review.reviewed_at, widenedReceipt.reviewed_at)
  assert.deepEqual(preservedB.receipt_ref, widenedRef)
  assert.deepEqual(
    readFixtureRequest(f.root, multiple.tasks[0]).input.context.candidate_retrieval
      .full_registry_review_refs,
    [aRef],
  )
  // A new current workflow may choose the original shortlist again. Validation
  // of its full-registry source must still use that source workflow's context.
  const narrowedArgs = {
      ...args,
      workflowId: "targeted-full-origin-shortlisted-again",
      completedReviewRefs: [refs.find((ref) => ref.path.includes(a.event_id)), widenedRef],
      eventIds: [b.event_id],
    },
    narrowed = await prepareArticleSemanticReviews(narrowedArgs)
  assert.equal(narrowed.prepared, 1)
  assert.equal(
    readFixtureRequest(f.root, narrowed.tasks[0]).input.context.reviewed_concept_registry.length,
    12,
  )
  assert.equal(
    articleSemanticReviewStatus(narrowedArgs).items.find((row) => row.event_id === a.event_id)
      .task_id,
    prior.task_id,
  )
  assert.ok(fs.readFileSync(path.join(f.root, widenedRef.path)).equals(widenedBytes))
  for (const row of protectedFiles) assert.ok(fs.readFileSync(row.file).equals(row.bytes))
  assert.ok(fs.readFileSync(inventoryPath).equals(inventoryBytes))
  const retry = await retryInvalidArticleSemanticReview({ ...expandedArgs, eventId: b.event_id })
  assert.equal(retry.retried, false)
  assert.equal(retry.task_id, expanded.tasks[0].task_id)
  fs.appendFileSync(path.join(f.root, reviewRef.path), "Changed provenance bytes.\n")
  assert.throws(
    () => articleSemanticReviewStatus(expandedArgs),
    /Full.registry.*SHA|full.registry.*SHA/,
  )
  assert.throws(
    () => articleSemanticReviewStatus(narrowedArgs),
    /Full.registry.*SHA|full.registry.*SHA/,
  )
})

test("targeted full registry rejects invalid scope and provenance without freezing a workflow", async (t) => {
  const { f, args, article } = await completedSourceFixture(t),
    ref = fullRegistryReviewRef(f, article.event_id),
    valid = { fullRegistryEventIds: [article.event_id], fullRegistryReviewRefs: [ref] },
    cases = [
      { extra: { fullRegistryEventIds: null }, error: /full_registry_event_ids/ },
      { extra: { fullRegistryEventIds: "bad" }, error: /full_registry_event_ids/ },
      {
        extra: { fullRegistryEventIds: [article.event_id, article.event_id] },
        error: /full_registry_event_ids/,
      },
      { extra: { fullRegistryEventIds: ["not-an-event"] }, error: /full_registry_event_ids/ },
      {
        extra: {
          fullRegistryEventIds: ["f".repeat(16)],
          fullRegistryReviewRefs: [{ ...ref, event_id: "f".repeat(16) }],
        },
        error: /full_registry_event_ids.*outside/,
      },
      { extra: { fullRegistryReviewRefs: [] }, error: /supplied together/ },
      { extra: { fullRegistryEventIds: [] }, error: /supplied together/ },
      { extra: { fullRegistryReviewRefs: null }, error: /full_registry_review_refs/ },
      {
        extra: { fullRegistryReviewRefs: [ref, ref] },
        error: /Distinct full_registry_review_refs/,
      },
      {
        extra: { fullRegistryReviewRefs: [ref, { ...ref, sha256: "0".repeat(64) }] },
        error: /Distinct full_registry_review_refs/,
      },
      {
        extra: { fullRegistryReviewRefs: [{ ...ref, sha256: "0".repeat(64) }] },
        error: /review artifact SHA/,
      },
      {
        extra: { fullRegistryReviewRefs: [{ ...ref, path: "../outside.md" }] },
        error: /full_registry_review_refs/,
      },
      { extra: { full_registry_event_ids: [] }, error: /Conflicting semantic review aliases/ },
      { extra: { full_registry_review_refs: [] }, error: /Conflicting semantic review aliases/ },
      {
        extra: { fullRegistryReviewRefs: [{ ...ref, event_id: "f".repeat(16) }] },
        error: /review refs.*declared|review references.*event/,
      },
      {
        extra: { fullRegistryReviewRefs: [{ path: ref.path, sha256: ref.sha256 }] },
        error: /full_registry_review_refs/,
      },
    ]
  for (const [index, row] of cases.entries()) {
    const next = { ...args, workflowId: `invalid-full-registry-${index}`, ...valid, ...row.extra }
    await assert.rejects(prepareArticleSemanticReviews(next), row.error)
    assert.equal(
      fs.existsSync(
        path.join(f.root, "runs", next.workflowId, "article-semantic-review/latest.json"),
      ),
      false,
    )
  }
  await assert.rejects(
    prepareArticleSemanticReviews({ ...args, ...valid }),
    /Full registry expansion changed after freeze/,
  )
})

test("targeted full registry rejects unknown frozen scope even after coherent inventory rehash", async (t) => {
  const { f, args, article } = await completedSourceFixture(t),
    ref = fullRegistryReviewRef(f, article.event_id),
    nextArgs = {
      ...args,
      workflowId: "full-registry-frozen-scope",
      fullRegistryEventIds: [article.event_id],
      fullRegistryReviewRefs: [ref],
    }
  await prepareArticleSemanticReviews(nextArgs)
  const pointerFile = path.join(
      f.root,
      "runs",
      nextArgs.workflowId,
      "article-semantic-review/latest.json",
    ),
    pointer = JSON.parse(fs.readFileSync(pointerFile)),
    inventoryFile = path.join(f.root, pointer.inventory.path),
    { inventory_sha256, ...body } = JSON.parse(fs.readFileSync(inventoryFile))
  body.full_registry_event_ids.push("f".repeat(16))
  body.full_registry_event_ids.sort()
  const bytes = JSON.stringify({ ...body, inventory_sha256: sha256(JSON.stringify(body)) }) + "\n"
  fs.writeFileSync(inventoryFile, bytes)
  pointer.inventory.sha256 = sha256(bytes)
  fs.writeFileSync(pointerFile, JSON.stringify(pointer) + "\n")
  assert.throws(() => articleSemanticReviewStatus(nextArgs), /full_registry_event_ids.*outside/)
})

async function verifyRegistryLifecycle(t, expanded) {
  const { f, args, article, task } = await completedSourceFixture(t),
    originalRef = fixtureReceiptRef(f, args, task),
    reviewRef = fullRegistryReviewRef(f, article.event_id, "private-expansion-proof"),
    nextArgs = {
      ...args,
      workflowId: expanded ? "full-registry-lifecycle" : "legacy-active-retry-lifecycle",
      ...(expanded
        ? {
            completedReviewRefs: [originalRef],
            fullRegistryEventIds: [article.event_id],
            fullRegistryReviewRefs: [reviewRef],
          }
        : {}),
    },
    next = await prepareArticleSemanticReviews(nextArgs),
    request = readFixtureRequest(f.root, next.tasks[0])
  assert.equal(next.prepared, 1)
  assert.equal(
    (await retryInvalidArticleSemanticReview({ ...nextArgs, eventId: article.event_id })).retried,
    false,
  )
  // Preserve an invalid historical fixture result, as in the existing native
  // retry regression. This writes synthetic bytes and executes no model.
  const badOutput = fixtureOutput(request, true)
  badOutput.relation_candidates = [
    {
      concept_id: "source-concept",
      role: "context_background",
      reason: "Synthetic historical proposal uses a claim outside the public article.",
      evidence_claim_ids: ["not-a-verified-claim"],
    },
  ]
  const oldBody = {
      schema: "research-reasoning-result/v1",
      task_id: next.tasks[0].task_id,
      request_sha256: next.tasks[0].request_sha256,
      output: badOutput,
      executor: "codex",
      model: "gpt-6-luna",
      submitted_at: "2026-10-22T00:00:00.000Z",
      attribution: "caller_declared",
      public_approved: false,
    },
    oldFile = path.join(f.root, "reasoning-tasks", next.tasks[0].task_id, "result.json")
  fs.writeFileSync(
    oldFile,
    JSON.stringify({ ...oldBody, result_sha256: sha256(JSON.stringify(oldBody)) }) + "\n",
    { flag: "wx" },
  )
  const oldBytes = fs.readFileSync(oldFile),
    retry = await retryInvalidArticleSemanticReview({ ...nextArgs, eventId: article.event_id }),
    retryRequest = readFixtureRequest(f.root, retry)
  assert.equal(retry.retried, true)
  assert.deepEqual(retryRequest.input, request.input)
  assert.deepEqual(retryRequest.binding, request.binding)
  await submitReasoningResult(f.root, {
    ...retry,
    executor: "codex",
    model: "gpt-6-luna",
    output: fixtureOutput(retryRequest),
  })
  await resumeArticleSemanticReviews(nextArgs)
  await exportArticleSemanticReviewIndex(nextArgs)
  const published = fs.readFileSync(
    path.join(f.root, "data/article-semantic-review-index.json"),
    "utf8",
  )
  assert.equal(published.includes(reviewRef.path), false, "Expansion provenance remains private")
  const reused = await prepareArticleSemanticReviews({
    ...nextArgs,
    workflowId: expanded ? "full-registry-published-reuse" : "legacy-published-active-retry-reuse",
    completedReviewRefs: [],
  })
  assert.equal(reused.prepared, 0)
  assert.equal(reused.status_counts.reviewed_links, 1)
  assert.ok(fs.readFileSync(oldFile).equals(oldBytes))
  if (expanded) {
    const otherRef = fullRegistryReviewRef(f, article.event_id, "other-expansion-proof")
    await assert.rejects(
      prepareArticleSemanticReviews({
        ...nextArgs,
        fullRegistryReviewRefs: [otherRef],
      }),
      /Full registry expansion changed after freeze/,
    )
  }
}

test("targeted full registry preserves its context through retry resume export and publication reuse", async (t) =>
  verifyRegistryLifecycle(t, true))
test("legacy published reuse selects the active retry without expansion", async (t) =>
  verifyRegistryLifecycle(t, false))

test("targeted full registry scope is independent of requested event_ids", async (t) => {
  const { f, args, a, b, tasks, refs } = await completedPrivateReuseFixture(t),
    ref = fullRegistryReviewRef(f, b.event_id),
    nextArgs = {
      ...args,
      workflowId: "full-scope-independent-of-requests",
      eventIds: [a.event_id],
      full_registry_event_ids: [b.event_id],
      full_registry_review_refs: [ref],
      completedReviewRefs: [refs.find((row) => row.path.includes(b.event_id))],
    },
    first = await prepareArticleSemanticReviews(nextArgs)
  assert.deepEqual(
    first.tasks.map((row) => row.event_id),
    [a.event_id],
  )
  assert.deepEqual(
    readFixtureRequest(f.root, first.tasks[0]).input,
    readFixtureRequest(
      f.root,
      tasks.find((row) => row.event_id === a.event_id),
    ).input,
  )
  assert.equal(
    fs.existsSync(
      path.join(
        f.root,
        "runs",
        nextArgs.workflowId,
        "article-semantic-review/prepared",
        b.event_id + ".json",
      ),
    ),
    false,
  )
  const later = await prepareArticleSemanticReviews({
    ...nextArgs,
    eventIds: [b.event_id],
    full_registry_event_ids: undefined,
    full_registry_review_refs: undefined,
  })
  assert.deepEqual(
    later.tasks.map((row) => row.event_id),
    [b.event_id],
  )
  assert.equal(
    readFixtureRequest(f.root, later.tasks[0]).input.context.candidate_retrieval.fallback_reason,
    "explicit_full_registry_review",
  )
})

test("semantic native URL matching accepts canonical-equivalent sources and rejects source or prose changes", async (t) => {
  // Reuse the reported public URL spelling with synthetic native fixture bytes;
  // the tests perform no fetch and do not load or alter operational approvals.
  const reportedURL =
      "https://github.blog/changelog/2026-07-29-copilot-code-review-agent-skills-and-mcp-now-generally-available/",
    cases = [
      {
        name: "reported trailing slash",
        nativeURL: reportedURL,
        publicURL: canonicalURL(reportedURL),
        accepted: true,
      },
      {
        name: "root trailing slash",
        nativeURL: "https://fixture.example/",
        publicURL: "https://fixture.example",
        accepted: true,
      },
      {
        name: "canonical tracking and fragment",
        nativeURL: "https://fixture.example/release/?utm_source=fixture#details",
        publicURL: "https://fixture.example/release",
        accepted: true,
      },
      {
        name: "different source path",
        nativeURL: reportedURL,
        publicURL: "https://github.blog/changelog/",
        accepted: false,
      },
      {
        name: "different source host",
        nativeURL: reportedURL,
        publicURL: "https://docs.github.com/en/copilot",
        accepted: false,
      },
      {
        name: "different substantive query",
        nativeURL: "https://fixture.example/release?edition=1",
        publicURL: "https://fixture.example/release?edition=2",
        accepted: false,
      },
      {
        name: "different source scheme",
        nativeURL: reportedURL,
        publicURL: reportedURL.replace("https:", "http:"),
        accepted: false,
      },
      {
        name: "changed public prose",
        nativeURL: reportedURL,
        publicURL: canonicalURL(reportedURL),
        changedProse: true,
        accepted: false,
      },
    ]
  for (const [index, row] of cases.entries()) {
    await t.test(row.name, async (t) => {
      const f = await knowledgeFixture(t),
        policyFile = copyCodexPolicy(f.root),
        run = "native-url-spelling",
        approval = addKnowledgeArticle(f, { run, url: row.nativeURL }),
        article = publishFixtureArticle(f, run),
        file = path.join(f.vault, "News", article.event_id + ".md"),
        note = parseNote(fs.readFileSync(file, "utf8"))
      note.meta.sources = [row.publicURL]
      note.body = note.body.replace(row.nativeURL, row.publicURL)
      if (row.changedProse) {
        assert.ok(note.body.includes(article.record.lead))
        note.body = note.body.replace(
          article.record.lead,
          "공개 기사 본문을 승인된 원문과 다른 내용으로 바꾼 합성 사례다.",
        )
      }
      fs.writeFileSync(file, noteText(note.meta, note.body))
      const result = await prepareArticleSemanticReviews({
        root: f.root,
        vault: f.vault,
        repo: f.root,
        policyFile,
        workflowId: `native-url-comparison-${index}`,
        gateReader: gateReady,
        embeddingClient: fakeEmbeddingClient(),
      })
      assert.equal(result.status_counts.total, 1)
      assert.equal(result.prepared, row.accepted ? 1 : 0)
      assert.equal(result.status_counts.blocked, row.accepted ? 0 : 1)
      if (row.accepted) {
        assert.equal(result.tasks[0].event_id, approval.article.event_id)
        const request = readFixtureRequest(f.root, result.tasks[0])
        assert.equal(request.input.context.article.event_id, article.event_id)
      }
    })
  }
})

test("semantic native prose matching restores renderer escapes without accepting changed facts", async (t) => {
  const identifier = "문서는 require_secret_scanning_alert_resolution 설정을 설명했다.",
    range = "실험 결과는 10~90백분위 범위로 보고됐다.",
    cases = [
      { name: "escaped underscore identifier", approved: identifier, accepted: true },
      { name: "escaped numeric tilde", approved: range, accepted: true },
      {
        name: "escaped hash label",
        approved: "문서는 #security 레이블을 명시했다.",
        accepted: true,
      },
      {
        name: "changed identifier",
        approved: identifier,
        publicText: identifier.replace("resolution", "resolutions"),
        accepted: false,
      },
      {
        name: "changed numeric endpoint",
        approved: range,
        publicText: range.replace("90", "95"),
        accepted: false,
      },
      {
        name: "changed sentence",
        approved: identifier,
        publicText: identifier.replace("설명했다", "삭제했다"),
        accepted: false,
      },
      {
        name: "changed range punctuation",
        approved: range,
        publicText: range.replace("~", "-"),
        accepted: false,
      },
    ]
  for (const [index, row] of cases.entries()) {
    await t.test(row.name, async (t) => {
      const f = await knowledgeFixture(t),
        policyFile = copyCodexPolicy(f.root),
        run = "native-markdown-prose"
      addKnowledgeArticle(f, {
        run,
        url: "https://fixture.example/markdown-release",
        text: row.approved,
      })
      const article = reviseFixtureApproval(f, run, (record) => {
          record.draft.lead[0].text = row.approved
          record.draft.explanations[0].paragraphs[0].text = row.approved
        }),
        file = path.join(f.vault, "News", article.event_id + ".md"),
        note = parseNote(fs.readFileSync(file, "utf8")),
        renderedMarkdown = markdownProse(row.publicText || row.approved),
        nativeFile = path.join(f.root, `runs/${run}/approved-article.json`),
        nativeSha = sha256(fs.readFileSync(nativeFile))
      assert.ok(note.body.includes(row.approved))
      note.body = note.body.replaceAll(row.approved, renderedMarkdown)
      fs.writeFileSync(file, noteText(note.meta, note.body))
      const publicSha = sha256(fs.readFileSync(file)),
        result = await prepareArticleSemanticReviews({
          root: f.root,
          vault: f.vault,
          repo: f.root,
          policyFile,
          workflowId: `native-prose-representation-${index}`,
          gateReader: gateReady,
          embeddingClient: fakeEmbeddingClient(),
        })
      assert.equal(result.prepared, row.accepted ? 1 : 0)
      assert.equal(result.status_counts.blocked, row.accepted ? 0 : 1)
      assert.equal(sha256(fs.readFileSync(file)), publicSha)
      assert.equal(sha256(fs.readFileSync(nativeFile)), nativeSha)
      if (row.accepted) {
        const request = readFixtureRequest(f.root, result.tasks[0])
        assert.ok(request.input.context.article.prose.includes(renderedMarkdown))
      }
    })
  }
})

test("native article review preserves typed relations and explicit reviewed-empty outcomes", () => {
  const common = {
    event_id: "0123456789abcdef",
    review_status: "verified",
    published_at: "2026-10-20",
    reviewed_at: "2026-10-21",
  }
  const linked = articleReview(
    {
      meta: {
        article_reviews: [
          {
            ...common,
            title: "기사",
            concept_ids: ["kv-cache"],
            concept_links: [{ concept_id: "kv-cache", role: "topic" }],
            semantic_review_status: "reviewed_links",
          },
        ],
      },
    },
    "기사",
    "fallback",
  )
  assert.deepEqual(linked.concept_links, [{ concept_id: "kv-cache", role: "topic" }])
  assert.equal(linked.semantic_review_status, "reviewed_links")
  const reviewedNone = articleReview(
    {
      meta: {
        article_reviews: [
          {
            ...common,
            title: "기사",
            concept_ids: [],
            concept_links: [],
            semantic_review_status: "reviewed_none",
          },
        ],
      },
    },
    "기사",
    "fallback",
  )
  assert.equal(reviewedNone.semantic_review_status, "reviewed_none")
  assert.throws(
    () =>
      articleReview(
        {
          meta: {
            article_reviews: [
              {
                ...common,
                title: "기사",
                concept_ids: ["other"],
                concept_links: [{ concept_id: "kv-cache", role: "topic" }],
                semantic_review_status: "reviewed_links",
              },
            ],
          },
        },
        "기사",
        "fallback",
      ),
    /Role-based article links must match/,
  )
})

function publishFixtureArticle(f, run = "source") {
  const approval = loadApprovedOntologyInput(f.root, run, { vault: f.vault }),
    article = approval.article,
    paragraphs = [
      article.record.lead,
      ...article.record.explanations.flatMap((section) => section.paragraphs),
    ],
    body = [
      `# ${article.title}`,
      ...paragraphs,
      `## 출처\n\n- [원문](${article.source_urls[0]})`,
    ].join("\n\n"),
    file = path.join(f.vault, "News", article.event_id + ".md")
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    noteText(
      {
        type: "news",
        event_id: article.event_id,
        title: article.title,
        published_at: article.article_review.published_at,
        reviewed_at: article.article_review.reviewed_at,
        review_status: "verified",
        sector: article.sector,
        sources: article.source_urls,
        concept_ids: article.article_review.concept_ids,
      },
      body,
    ),
  )
  return article
}

function copyCodexPolicy(repo) {
  const directory = path.join(repo, "data")
  fs.mkdirSync(directory, { recursive: true })
  const policyFile = path.join(directory, "research-model-policy-codex.json")
  fs.copyFileSync("data/research-model-policy-codex.json", policyFile)
  fs.copyFileSync(
    "data/research-semantic-retrieval-policy.json",
    path.join(directory, "research-semantic-retrieval-policy.json"),
  )
  return policyFile
}

function fakeEmbeddingClient() {
  const digest = "a".repeat(64)
  const vectorFor = (text) => {
    const bytes = Buffer.from(sha256(text), "hex").subarray(0, 8),
      vector = Array.from(bytes, (value) => (value - 127.5) / 127.5)
    return vector
  }
  return {
    async metadata(model) {
      return { model, digest, runtime: "fixture", capabilities: ["embedding"] }
    },
    async embed({ model, inputs, expected_digest }) {
      assert.equal(model, "qwen3-embedding:8b")
      assert.equal(expected_digest, digest)
      const vectors = inputs.map(vectorFor)
      return { model, digest, dimensions: vectors[0].length, vectors }
    },
  }
}

test("semantic review freezes exact native evidence, resumes one Luna result, exports roles, and reuses unchanged reviews", async (t) => {
  const f = await knowledgeFixture(t),
    policyFile = copyCodexPolicy(f.root),
    first = publishFixtureArticle(f),
    workflowId = "semantic-backfill-test-v1"
  const prepared = await prepareArticleSemanticReviews({
    root: f.root,
    vault: f.vault,
    repo: f.root,
    policyFile,
    workflowId,
    gateReader: gateReady,
    embeddingClient: fakeEmbeddingClient(),
  })
  assert.equal(prepared.prepared, 1)
  assert.equal(prepared.tasks[0].requested_model, "gpt-6-luna")
  assert.equal(prepared.tasks[0].requested_thinking, "high")
  assert.equal(prepared.candidate_published, false)
  assert.equal(prepared.candidate_retrieval.mode, "full_registry_fallback")
  assert.equal(prepared.candidate_retrieval.pilot.status, "waiting_for_24_native_reviewed_articles")
  assert.equal(prepared.status_counts.waiting_for_reasoning, 1)
  const observations = () => readSemanticObservations({ root: f.root, workflow_id: workflowId })
  const initialObservations = observations()
  for (const stage of [
    "concept_index",
    "query_embedding",
    "candidate_selection",
    "luna",
    "semantic_task",
  ])
    assert.ok(initialObservations.some((observation) => observation.stage === stage))
  assert.ok(
    initialObservations
      .filter((observation) => observation.stage === "luna")
      .every((observation) => observation.duration_ms === null),
  )

  const task = prepared.tasks[0],
    requestPage = readReasoningTask(f.root, {
      task_id: task.task_id,
      request_sha256: task.request_sha256,
      offset: 0,
      limit: 64000,
    }),
    request = JSON.parse(requestPage.chunk),
    claimId = request.input.context.verified_public_claims[0].claim_id
  assert.equal(request.role, "evidence_compare")
  assert.equal(request.binding.settings.model, "gpt-6-luna")
  assert.equal(request.binding.settings.think, "high")
  assert.equal(requestPage.requested_thinking, "high")
  assert.ok(request.input.context.verified_public_claims.length)
  assert.ok(request.input.context.reviewed_concept_registry.length)
  assert.equal(request.input.context.candidate_retrieval.mode, "full_registry_fallback")
  assert.equal(request.input.context.reviewed_concept_registry[0].keywords.length > 0, true)

  const submit = (output) =>
      submitReasoningResult(f.root, {
        task_id: task.task_id,
        request_sha256: task.request_sha256,
        executor: "codex",
        model: "gpt-6-luna",
        output,
      }),
    resultFile = path.join(f.root, "reasoning-tasks", task.task_id, "result.json"),
    validOutput = {
      schema: "article-semantic-proposal/v2",
      event_id: first.event_id,
      outcome: "reviewed_links",
      review_reason: "원문이 설명하는 재사용 메커니즘을 검토한 용어 정의와 대조했다.",
      links: [
        {
          concept_id: "source-concept",
          role: "topic",
          reason: "기사의 검증 사실이 개념 노트의 재사용 원리를 직접 설명한다.",
          evidence_claim_ids: [claimId],
        },
      ],
      relation_candidates: [],
      concept_candidates: [],
      keyword_candidates: [
        {
          keyword: "검증 키워드",
          reason: "기사의 공개 근거에서 직접 확인되는 검색용 용어다.",
          evidence_claim_ids: [claimId],
        },
      ],
    }
  await assert.rejects(
    submit({ ...validOutput, event_id: "fedcba9876543210" }),
    /does not match its bound article/,
  )
  assert.equal(fs.existsSync(resultFile), false)
  await assert.rejects(
    submit({
      ...validOutput,
      links: [{ ...validOutput.links[0], evidence_claim_ids: ["unknown-claim"] }],
    }),
    /outside its bound public article/,
  )
  assert.equal(fs.existsSync(resultFile), false)
  await assert.rejects(
    submit({
      ...validOutput,
      links: [{ ...validOutput.links[0], concept_id: "unknown-concept" }],
    }),
    /outside its bound registry/,
  )
  assert.equal(fs.existsSync(resultFile), false)
  await submit(validOutput)
  const resultReady = articleSemanticReviewStatus({
    root: f.root,
    vault: f.vault,
    repo: f.root,
    policyFile,
    workflowId,
  })
  assert.equal(resultReady.status_counts.ready, 0)
  assert.equal(resultReady.status_counts.result_ready, 1)
  assert.equal(
    JSON.parse(fs.readFileSync(resultFile, "utf8")).output.keyword_candidates[0].keyword,
    "검증 키워드",
  )
  assert.equal(resultReady.items[0].status, "result_ready")
  assert.equal(resultReady.next_action.operation, "semantic_resume")
  assert.equal(resultReady.next_action.parameters.offset, 0)
  assert.equal(observations().length, initialObservations.length)
  const immutableResultSha = sha256(fs.readFileSync(resultFile))
  const resumed = await resumeArticleSemanticReviews({
    root: f.root,
    vault: f.vault,
    repo: f.root,
    policyFile,
    workflowId,
    gateReader: gateReady,
  })
  assert.deepEqual(resumed.completed, [
    {
      event_id: first.event_id,
      status: "reviewed_links",
      receipt_ref: fixtureReceiptRef(f, { workflowId }, { event_id: first.event_id }),
    },
  ])
  assert.equal(resumed.status_counts.reviewed_links, 1)
  const readback = articleSemanticReviewStatus({
    root: f.root,
    vault: f.vault,
    repo: f.root,
    policyFile,
    workflowId,
  })
  assert.equal(readback.status_counts.reviewed_links, 1)
  assert.equal(readback.next_action.operation, "semantic_export")
  assert.equal(readback.metrics.by_stage.luna.duration_ms.count, 0)
  assert.equal(readback.metrics.task_counts.completed, 1)
  const completedObservationCount = observations().length
  await resumeArticleSemanticReviews({
    root: f.root,
    vault: f.vault,
    repo: f.root,
    policyFile,
    workflowId,
    gateReader: gateReady,
  })
  assert.equal(observations().length, completedObservationCount)
  assert.equal(sha256(fs.readFileSync(resultFile)), immutableResultSha)

  const exported = await exportArticleSemanticReviewIndex({
    root: f.root,
    vault: f.vault,
    repo: f.root,
    policyFile,
    workflowId,
    gateReader: gateReady,
  })
  assert.equal(exported.articles, 1)
  const publicIndex = JSON.parse(
    fs.readFileSync(path.join(f.root, "data/article-semantic-review-index.json"), "utf8"),
  )
  assert.equal(Object.hasOwn(publicIndex.reviews[0], "keyword_candidates"), false)
  assert.equal(JSON.stringify(publicIndex).includes("metrics"), false)
  const graph = buildGraph(f.vault),
    linked = graph.articles.find((article) => article.id === "news:" + first.event_id)
  assert.deepEqual(linked.matches, [
    {
      termId: "source-concept",
      basis: "semantic_review",
      role: "topic",
      evidenceClaimIds: [claimId],
    },
  ])

  const second = addKnowledgeArticle(f, { run: "next-article" })
  publishFixtureArticle(f, "next-article")
  const next = await prepareArticleSemanticReviews({
    root: f.root,
    vault: f.vault,
    repo: f.root,
    policyFile,
    workflowId: "semantic-daily-next-v1",
    gateReader: gateReady,
    embeddingClient: fakeEmbeddingClient(),
  })
  assert.equal(next.prepared, 1)
  assert.equal(next.tasks[0].event_id, second.article.event_id)
  assert.equal(next.status_counts.reviewed_links, 1)
  const nextTask = next.tasks[0]
  const nextRequestPage = readReasoningTask(f.root, {
    task_id: nextTask.task_id,
    request_sha256: nextTask.request_sha256,
    offset: 0,
    limit: 64000,
  })
  const nextRequest = JSON.parse(nextRequestPage.chunk)
  assert.equal(nextRequest.input.context.article.event_id, second.article.event_id)
  assert.equal(JSON.stringify(nextRequest.input.context).includes(first.event_id), false)
  await submitReasoningResult(f.root, {
    task_id: nextTask.task_id,
    request_sha256: nextTask.request_sha256,
    executor: "codex",
    model: "gpt-6-luna",
    output: {
      schema: "article-semantic-proposal/v2",
      event_id: second.article.event_id,
      outcome: "reviewed_none",
      review_reason: "검토한 전문 개념 중 원문 근거가 연결을 뒷받침하는 항목이 없다.",
      links: [],
      relation_candidates: [],
      concept_candidates: [],
      keyword_candidates: [],
    },
  })
  const nextResumed = await resumeArticleSemanticReviews({
    root: f.root,
    vault: f.vault,
    repo: f.root,
    policyFile,
    workflowId: "semantic-daily-next-v1",
    gateReader: gateReady,
  })
  assert.deepEqual(nextResumed.completed, [
    {
      event_id: second.article.event_id,
      status: "reviewed_none",
      receipt_ref: fixtureReceiptRef(
        f,
        { workflowId: "semantic-daily-next-v1" },
        { event_id: second.article.event_id },
      ),
    },
  ])
  const nextExport = await exportArticleSemanticReviewIndex({
    root: f.root,
    vault: f.vault,
    repo: f.root,
    policyFile,
    workflowId: "semantic-daily-next-v1",
    gateReader: gateReady,
  })
  assert.equal(nextExport.articles, 2)
  const nextGraph = buildGraph(f.vault),
    unlinked = nextGraph.articles.find(
      (article) => article.id === "news:" + second.article.event_id,
    )
  assert.deepEqual(unlinked.matches, [])
})

test("invalid immutable semantic output receives a new exact request without rewriting the old result", async (t) => {
  const f = await knowledgeFixture(t),
    policyFile = copyCodexPolicy(f.root),
    article = publishFixtureArticle(f),
    workflowId = "semantic-invalid-result-retry-v1",
    prepared = await prepareArticleSemanticReviews({
      root: f.root,
      vault: f.vault,
      repo: f.root,
      policyFile,
      workflowId,
      gateReader: gateReady,
      embeddingClient: fakeEmbeddingClient(),
    }),
    original = prepared.tasks[0],
    originalPage = readReasoningTask(f.root, {
      task_id: original.task_id,
      request_sha256: original.request_sha256,
      offset: 0,
      limit: 64000,
    }),
    originalRequest = JSON.parse(originalPage.chunk),
    badOutput = {
      schema: "article-semantic-proposal/v2",
      event_id: article.event_id,
      outcome: "reviewed_none",
      review_reason: "응답이 공개 claim 식별자를 잘못 참조한다.",
      links: [],
      relation_candidates: [
        {
          concept_id: "source-concept",
          role: "context_background",
          reason: "기사와 개념의 관계를 후보로 남겼다.",
          evidence_claim_ids: ["not-a-verified-claim"],
        },
      ],
      concept_candidates: [],
      keyword_candidates: [],
    },
    oldResultBody = {
      schema: "research-reasoning-result/v1",
      task_id: original.task_id,
      request_sha256: original.request_sha256,
      output: badOutput,
      executor: "codex",
      model: "gpt-6-luna",
      submitted_at: "2026-10-22T00:00:00.000Z",
      attribution: "caller_declared",
      public_approved: false,
    },
    oldResult = {
      ...oldResultBody,
      result_sha256: sha256(JSON.stringify(oldResultBody)),
    },
    oldResultFile = path.join(f.root, "reasoning-tasks", original.task_id, "result.json")
  fs.writeFileSync(oldResultFile, JSON.stringify(oldResult, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  })
  const oldBytes = fs.readFileSync(oldResultFile)
  const retried = await retryInvalidArticleSemanticReview({
    root: f.root,
    vault: f.vault,
    repo: f.root,
    policyFile,
    workflowId,
    eventId: article.event_id,
    gateReader: gateReady,
  })
  assert.equal(retried.status, "waiting_for_reasoning")
  assert.equal(retried.retried, true)
  assert.equal(retried.attempt_number, 1)
  assert.notEqual(retried.task_id, original.task_id)
  assert.equal(fs.readFileSync(oldResultFile).equals(oldBytes), true)

  const retryPage = readReasoningTask(f.root, {
    task_id: retried.task_id,
    request_sha256: retried.request_sha256,
    offset: 0,
    limit: 64000,
  })
  assert.equal(retryPage.status, "reasoning_pending")
  const retryRequest = JSON.parse(retryPage.chunk)
  assert.equal(retryRequest.run, originalRequest.run + "-retry-1")
  assert.equal(retryRequest.role, originalRequest.role)
  assert.deepEqual(retryRequest.binding, originalRequest.binding)
  assert.deepEqual(retryRequest.input, originalRequest.input)

  const repeated = await retryInvalidArticleSemanticReview({
    root: f.root,
    vault: f.vault,
    repo: f.root,
    policyFile,
    workflowId,
    eventId: article.event_id,
    gateReader: gateReady,
  })
  assert.equal(repeated.task_id, retried.task_id)
  assert.equal(repeated.retried, false)
  assert.equal(fs.readFileSync(oldResultFile).equals(oldBytes), true)

  const claimId = retryRequest.input.context.verified_public_claims[0].claim_id
  await submitReasoningResult(f.root, {
    task_id: retried.task_id,
    request_sha256: retried.request_sha256,
    executor: "codex",
    model: "gpt-6-luna",
    output: {
      schema: "article-semantic-proposal/v2",
      event_id: article.event_id,
      outcome: "reviewed_links",
      review_reason: "공개 사실과 전문 개념의 기술적 관계를 원문까지 대조했다.",
      links: [
        {
          concept_id: "source-concept",
          role: "topic",
          reason: "검증된 공개 사실이 개념의 핵심 메커니즘을 설명한다.",
          evidence_claim_ids: [claimId],
        },
      ],
      relation_candidates: [],
      concept_candidates: [],
      keyword_candidates: [],
    },
  })
  const resumed = await resumeArticleSemanticReviews({
    root: f.root,
    vault: f.vault,
    repo: f.root,
    policyFile,
    workflowId,
    gateReader: gateReady,
  })
  assert.deepEqual(resumed.completed, [
    {
      event_id: article.event_id,
      status: "reviewed_links",
      receipt_ref: fixtureReceiptRef(f, { workflowId }, { event_id: article.event_id }),
    },
  ])
  assert.equal(fs.readFileSync(oldResultFile).equals(oldBytes), true)
})

test("semantic preparation stops before creating a lock or queue when the development gate is closed", async (t) => {
  const f = await knowledgeFixture(t),
    policyFile = copyCodexPolicy(f.root)
  await assert.rejects(
    prepareArticleSemanticReviews({
      root: f.root,
      vault: f.vault,
      repo: f.root,
      policyFile,
      workflowId: "semantic-held-test-v1",
      gateReader: () => ({ regular_execution_allowed: false }),
    }),
    /development-completion gate/,
  )
  assert.equal(
    fs.existsSync(path.join(f.root, "locks/article-semantic-semantic-held-test-v1.json")),
    false,
  )
  assert.equal(fs.existsSync(path.join(f.root, "runs/semantic-held-test-v1")), false)
})

test("an article without an exact native approval remains blocked and prevents full-index export", async (t) => {
  const f = await knowledgeFixture(t),
    policyFile = copyCodexPolicy(f.root),
    file = path.join(f.vault, "News/0123456789abcdef.md")
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    noteText(
      {
        type: "news",
        event_id: "0123456789abcdef",
        title: "승인 원문이 없는 과거 기사",
        published_at: "2026-10-20",
        review_status: "verified",
        sources: ["https://fixture.example/unapproved"],
      },
      "검증 claim에 연결된 native 승인 run은 존재하지 않는다.",
    ),
  )
  const prepared = await prepareArticleSemanticReviews({
    root: f.root,
    vault: f.vault,
    repo: f.root,
    policyFile,
    workflowId: "semantic-unapproved-article-v1",
    gateReader: gateReady,
  })
  assert.equal(prepared.prepared, 0)
  assert.equal(prepared.status_counts.blocked, 1)
  assert.equal(prepared.tasks.length, 0)
  await assert.rejects(
    exportArticleSemanticReviewIndex({
      root: f.root,
      vault: f.vault,
      repo: f.root,
      policyFile,
      workflowId: "semantic-unapproved-article-v1",
      gateReader: gateReady,
    }),
    /Complete every article's exact native approval\/storage review/,
  )
  assert.equal(fs.existsSync(path.join(f.root, "data/article-semantic-review-index.json")), false)
})

test("a development gate that closes after lock acquisition leaves no semantic checkpoint", async (t) => {
  const f = await knowledgeFixture(t),
    policyFile = copyCodexPolicy(f.root)
  let reads = 0
  await assert.rejects(
    prepareArticleSemanticReviews({
      root: f.root,
      vault: f.vault,
      repo: f.root,
      policyFile,
      workflowId: "semantic-gate-race-v1",
      gateReader: () => ({ regular_execution_allowed: ++reads === 1 }),
    }),
    /development-completion gate/,
  )
  assert.equal(reads, 2)
  assert.equal(
    fs.existsSync(path.join(f.root, "locks/article-semantic-semantic-gate-race-v1.json")),
    false,
  )
  assert.equal(fs.existsSync(path.join(f.root, "runs/semantic-gate-race-v1")), false)
})

test("selected event IDs prepare only that request page and preserve the full export inventory", async (t) => {
  const f = await knowledgeFixture(t),
    policyFile = copyCodexPolicy(f.root),
    first = publishFixtureArticle(f),
    second = addKnowledgeArticle(f, { run: "selected-second" })
  publishFixtureArticle(f, "selected-second")
  const args = {
      root: f.root,
      vault: f.vault,
      repo: f.root,
      policyFile,
      workflowId: "semantic-selected-events-v1",
      gateReader: gateReady,
      embeddingClient: fakeEmbeddingClient(),
    },
    selected = await prepareArticleSemanticReviews({
      ...args,
      event_ids: [second.article.event_id],
    })
  assert.deepEqual(
    selected.tasks.map((task) => task.event_id),
    [second.article.event_id],
  )
  assert.equal(selected.status_counts.total, 2)
  assert.equal(selected.status_counts.ready, 1)
  assert.equal(selected.status_counts.waiting_for_reasoning, 1)
  assert.equal(selected.next_offset, null)
  await assert.rejects(
    exportArticleSemanticReviewIndex(args),
    /Every public article needs|still waiting/,
  )
  const remainder = await prepareArticleSemanticReviews({ ...args, eventIds: [first.event_id] })
  assert.deepEqual(
    remainder.tasks.map((task) => task.event_id),
    [first.event_id],
  )
  assert.equal(remainder.inventory_sha256, selected.inventory_sha256)
})

function readFixtureRequest(root, task) {
  const chunks = []
  let offset = 0
  while (true) {
    const page = readReasoningTask(root, { ...task, offset, limit: 64000 })
    chunks.push(page.chunk)
    if (page.next_offset === null) return JSON.parse(chunks.join(""))
    offset = page.next_offset
  }
}

function fixtureOutput(request, reviewedNone = false) {
  return {
    schema: "article-semantic-proposal/v2",
    event_id: request.input.context.article.event_id,
    outcome: reviewedNone ? "reviewed_none" : "reviewed_links",
    review_reason:
      "Synthetic fixture compares the planned reuse claim with the existing definition.",
    links: reviewedNone
      ? []
      : [
          {
            concept_id: "source-concept",
            role: "topic",
            reason: "The synthetic source describes the mechanism in the reviewed definition.",
            evidence_claim_ids: [request.input.context.verified_public_claims[0].claim_id],
          },
        ],
    relation_candidates: [],
    concept_candidates: [],
    keyword_candidates: [],
  }
}

function writeFixtureSidecar(
  f,
  args,
  task,
  request,
  { name = "pilot", challengeKind = null } = {},
) {
  const pointer = JSON.parse(
      fs.readFileSync(
        path.join(f.root, `runs/${args.workflowId}/article-semantic-review/latest.json`),
      ),
    ),
    inventory = JSON.parse(fs.readFileSync(path.join(f.root, pointer.inventory.path))),
    row = inventory.items.find((item) => item.event_id === task.event_id),
    receiptPath = `runs/${args.workflowId}/article-semantic-review/receipts/${row.event_id}-${row.semantic_input_sha256}.json`,
    receiptBytes = fs.readFileSync(path.join(f.root, receiptPath)),
    receipt = JSON.parse(receiptBytes),
    review = {
      schema: "semantic-retrieval-review/v1",
      event_id: row.event_id,
      article_public_sha256: row.article_public_sha256,
      approved_run: row.approved_run,
      approval_files_sha256: row.approval_files_sha256,
      concept_registry_sha256: row.concept_registry_sha256,
      case_kind: challengeKind ? "challenge" : "pilot",
      challenge_kind: challengeKind,
      semantic_review: {
        workflow_id: args.workflowId,
        receipt: { path: receiptPath, sha256: sha256(receiptBytes) },
      },
      outcome: receipt.output.outcome,
      reviewer: "Synthetic source comparison fixture; not an operational reviewer",
      reviewed_at: new Date().toISOString(),
      reason: "This synthetic fixture explicitly compares every public claim and full registry.",
      article_source_read: true,
      concept_registry_read: true,
      aliases_checked: true,
      public_claim_ids: request.input.context.verified_public_claims.map((claim) => claim.claim_id),
      links: receipt.output.links,
      source_comparisons: request.input.context.verified_public_claims.map((claim) => ({
        claim_id: claim.claim_id,
        source_refs: claim.evidence.map(({ source_block, ...ref }) => ref),
        comparison:
          "The exact synthetic source block describes planned reuse; the definitions were compared for that relationship.",
      })),
    },
    refPath = `inputs/${name}-${row.event_id}.json`,
    bytes = JSON.stringify(review, null, 2) + "\n"
  fs.writeFileSync(path.join(f.root, refPath), bytes, { flag: "wx" })
  return { review, ref: { path: refPath, sha256: sha256(bytes) }, bytes, receiptBytes }
}

async function completedSourceFixture(t, { challengeKind = null } = {}) {
  const f = await knowledgeFixture(t),
    policyFile = copyCodexPolicy(f.root),
    article = publishFixtureArticle(f),
    args = {
      root: f.root,
      vault: f.vault,
      repo: f.root,
      policyFile,
      workflowId: "full-registry-source",
      gateReader: gateReady,
      embeddingClient: fakeEmbeddingClient(),
    },
    prepared = await prepareArticleSemanticReviews(args),
    task = prepared.tasks[0],
    request = readFixtureRequest(f.root, task)
  await submitReasoningResult(f.root, {
    ...task,
    executor: "codex",
    model: "gpt-6-luna",
    output: fixtureOutput(request, challengeKind === "reviewed_none"),
  })
  await resumeArticleSemanticReviews(args)
  return {
    f,
    args,
    article,
    task,
    request,
    ...writeFixtureSidecar(f, args, task, request, { challengeKind }),
  }
}

test("source-reviewed sidecar refs freeze and revalidate without changing prior native approvals or receipts", async (t) => {
  const { f, args, ref, bytes, receiptBytes, task } = await completedSourceFixture(t),
    native = loadApprovedOntologyInput(f.root, "source", { vault: f.vault }).file_hashes,
    nextArgs = { ...args, workflowId: "supplementary-pilot-workflow", pilot_review_refs: [ref] },
    prepared = await prepareArticleSemanticReviews(nextArgs)
  assert.equal(prepared.prepared, 0)
  assert.equal(prepared.status_counts.reviewed_links, 1)
  assert.equal(prepared.candidate_retrieval.pilot.eligible_article_count, 1)
  assert.equal(prepared.candidate_retrieval.mode, "full_registry_fallback")
  const repeated = await prepareArticleSemanticReviews({ ...args, workflowId: nextArgs.workflowId })
  assert.equal(repeated.inventory_sha256, prepared.inventory_sha256)
  assert.equal(repeated.prepared, 0)
  const status = articleSemanticReviewStatus(nextArgs),
    reusedRow = status.items[0]
  assert.equal(reusedRow.task_id, task.task_id)
  assert.equal(reusedRow.request_sha256, task.request_sha256)
  assert.equal(reusedRow.reused_from_workflow_id, args.workflowId)
  assert.equal(reusedRow.reuse_basis, "pilot_source_receipt_same_full_input")
  assert.deepEqual(reusedRow.reused_receipt_ref, JSON.parse(bytes).semantic_review.receipt)
  assert.equal(
    fs.existsSync(
      path.join(f.root, `runs/${nextArgs.workflowId}/article-semantic-review/prepared`),
    ),
    false,
  )
  assert.equal(
    fs.existsSync(
      path.join(f.root, `runs/${nextArgs.workflowId}/article-semantic-review/receipts`),
    ),
    false,
  )
  assert.equal(fs.existsSync(path.join(f.root, "data/article-semantic-review-index.json")), false)
  await assert.rejects(
    prepareArticleSemanticReviews({ ...nextArgs, pilot_review_refs: [] }),
    /refs changed after freeze.*new workflow ID/,
  )
  assert.deepEqual(
    loadApprovedOntologyInput(f.root, "source", { vault: f.vault }).file_hashes,
    native,
  )
  assert.equal(fs.readFileSync(path.join(f.root, ref.path)).equals(Buffer.from(bytes)), true)
  const sidecar = JSON.parse(bytes)
  assert.equal(
    fs.readFileSync(path.join(f.root, sidecar.semantic_review.receipt.path)).equals(receiptBytes),
    true,
  )

  // Only an explicit complete-inventory export creates a public index. It keeps
  // the original source workflow/task/result/receipt references unchanged.
  await exportArticleSemanticReviewIndex(nextArgs)
  const publicIndex = JSON.parse(
    fs.readFileSync(path.join(f.root, "data/article-semantic-review-index.json")),
  )
  assert.equal(publicIndex.reviews[0].workflow_id, args.workflowId)
  assert.equal(publicIndex.reviews[0].task_id, task.task_id)
  const afterExport = articleSemanticReviewStatus(nextArgs)
  assert.equal(afterExport.inventory_sha256, prepared.inventory_sha256)
  assert.equal(afterExport.status_counts.reviewed_links, 1)
  const reusable = await prepareArticleSemanticReviews({
    ...args,
    workflowId: "sidecar-existing-completion",
    pilotReviewRefs: [ref],
  })
  assert.equal(reusable.prepared, 0)
  assert.equal(reusable.status_counts.reviewed_links, 1)

  fs.appendFileSync(path.join(f.root, ref.path), " ")
  assert.throws(() => articleSemanticReviewStatus(nextArgs), /Pilot source review.*SHA changed/)
  await assert.rejects(resumeArticleSemanticReviews(nextArgs), /Pilot source review.*SHA changed/)
  await assert.rejects(
    exportArticleSemanticReviewIndex(nextArgs),
    /Pilot source review.*SHA changed/,
  )
})

test("pilot source reviews reject raw model output, wrong provenance and incomplete or duplicated source comparisons", async (t) => {
  const { f, args, review } = await completedSourceFixture(t),
    cases = [
      [
        "raw-model",
        (value) =>
          fixtureOutput({
            input: {
              context: {
                article: { event_id: value.event_id },
                verified_public_claims: [{ claim_id: value.public_claim_ids[0] }],
              },
            },
          }),
        /Missing.*article_public_sha256|Unexpected.*review_reason|schema/,
      ],
      [
        "wrong-event",
        (value) => ({ ...value, event_id: "fedcba9876543210" }),
        /existing verified public article/,
      ],
      [
        "wrong-public",
        (value) => ({ ...value, article_public_sha256: "b".repeat(64) }),
        /exact article, approval, registry/,
      ],
      [
        "wrong-native",
        (value) => ({ ...value, approval_files_sha256: "c".repeat(64) }),
        /exact article, approval, registry/,
      ],
      [
        "wrong-registry",
        (value) => ({ ...value, concept_registry_sha256: "d".repeat(64) }),
        /exact article, approval, registry/,
      ],
      [
        "no-reviewer",
        (value) => ({ ...value, reviewer: " " }),
        /exact article, approval, registry/,
      ],
      [
        "missing-public-claim",
        (value) => ({ ...value, public_claim_ids: ["wrong-claim"] }),
        /exact article, approval, registry/,
      ],
      [
        "duplicate-public-claim",
        (value) => ({
          ...value,
          public_claim_ids: [...value.public_claim_ids, ...value.public_claim_ids],
        }),
        /exact article, approval, registry/,
      ],
      ["missing-comparison", (value) => ({ ...value, source_comparisons: [] }), /Missing items/],
      [
        "duplicate-comparison",
        (value) => ({
          ...value,
          source_comparisons: [...value.source_comparisons, ...value.source_comparisons],
        }),
        /exactly one pilot source comparison/,
      ],
      [
        "duplicate-ref",
        (value) => {
          value.source_comparisons[0].source_refs.push(value.source_comparisons[0].source_refs[0])
          return value
        },
        /every exact native source version/,
      ],
      [
        "changed-source",
        (value) => {
          value.source_comparisons[0].source_refs[0].source_version_id += "-changed"
          return value
        },
        /every exact native source version/,
      ],
      [
        "changed-block",
        (value) => {
          value.source_comparisons[0].source_refs[0].block_sha256 = "f".repeat(64)
          return value
        },
        /every exact native source version/,
      ],
      [
        "changed-quote",
        (value) => {
          value.source_comparisons[0].source_refs[0].exact_verified_quote = "A fabricated quote"
          return value
        },
        /every exact native source version/,
      ],
      [
        "empty-comparison",
        (value) => {
          value.source_comparisons[0].comparison = " ".repeat(20)
          return value
        },
        /every exact native source version/,
      ],
      [
        "invalid-concept",
        (value) => {
          value.links[0].concept_id = "unknown-concept"
          return value
        },
        /current concepts/,
      ],
      [
        "invalid-evidence",
        (value) => {
          value.links[0].evidence_claim_ids = ["wrong-claim"]
          return value
        },
        /verified public claim evidence/,
      ],
      [
        "duplicate-link",
        (value) => ({ ...value, links: [...value.links, ...value.links] }),
        /Distinct.*concept links/,
      ],
      ["false-passed", (value) => ({ ...value, passed: true }), /Unexpected.*passed/],
      [
        "prototype-root-key",
        (value) => ({ ...value, constructor: "forged-extra-field" }),
        /Unexpected.*constructor/,
      ],
      [
        "prototype-source-key",
        (value) => {
          value.source_comparisons[0].source_refs[0].constructor = "forged-extra-field"
          return value
        },
        /Unexpected.*constructor/,
      ],
      [
        "wrong-receipt-sha",
        (value) => {
          value.semantic_review.receipt.sha256 = "a".repeat(64)
          return value
        },
        /artifact SHA changed/,
      ],
    ]
  let calls = 0
  for (const [name, mutate, expected] of cases) {
    await t.test(name, async () => {
      const changed = mutate(structuredClone(review)),
        file = `inputs/${name}.json`,
        bytes = JSON.stringify(changed) + "\n"
      fs.writeFileSync(path.join(f.root, file), bytes, { flag: "wx" })
      const workflowId = `reject-${name}`
      await assert.rejects(
        prepareArticleSemanticReviews({
          ...args,
          workflowId,
          pilotReviewRefs: [{ path: file, sha256: sha256(bytes) }],
          embeddingClient: {
            async metadata() {
              calls++
              throw Error("Should not reach embeddings")
            },
          },
        }),
        expected,
      )
      assert.equal(
        fs.existsSync(path.join(f.root, `runs/${workflowId}/article-semantic-review/latest.json`)),
        false,
      )
    })
  }
  assert.equal(calls, 0)
})

test("reviewed-none source labels are accepted only as an explicit additional challenge", async (t) => {
  const { f, args, ref } = await completedSourceFixture(t, { challengeKind: "reviewed_none" }),
    prepared = await prepareArticleSemanticReviews({
      ...args,
      workflowId: "empty-source-challenge",
      pilotReviewRefs: [ref],
    })
  assert.equal(prepared.candidate_retrieval.pilot.eligible_article_count, 0)
  assert.equal(prepared.candidate_retrieval.pilot.eligible_challenge_count, 1)
  assert.equal(prepared.candidate_retrieval.mode, "full_registry_fallback")
})

test("changed article or concept bytes invalidate source-reviewed workflows without rewriting frozen records", async (t) => {
  for (const target of ["article", "concept"]) {
    await t.test(target, async (t) => {
      const { f, args, ref, article } = await completedSourceFixture(t),
        nextArgs = { ...args, workflowId: `source-${target}-changed`, pilotReviewRefs: [ref] }
      await prepareArticleSemanticReviews(nextArgs)
      const pointerPath = path.join(
          f.root,
          `runs/${nextArgs.workflowId}/article-semantic-review/latest.json`,
        ),
        frozenPointer = fs.readFileSync(pointerPath),
        file = path.join(
          f.vault,
          target === "article" ? `News/${article.event_id}.md` : "Knowledge/source-concept.md",
        )
      fs.appendFileSync(file, "\nChanged public source or definition bytes after freeze.\n")
      assert.throws(
        () => articleSemanticReviewStatus(nextArgs),
        /Pilot source review|Semantic review inputs changed/,
      )
      await assert.rejects(
        resumeArticleSemanticReviews(nextArgs),
        /Pilot source review|Semantic review inputs changed/,
      )
      assert.equal(fs.readFileSync(pointerPath).equals(frozenPointer), true)
    })
  }
})

test("a raw completed Luna result cannot mint a missing pilot review receipt", async (t) => {
  const { f, args, ref, review } = await completedSourceFixture(t),
    file = path.join(f.root, review.semantic_review.receipt.path)
  fs.unlinkSync(file)
  await assert.rejects(
    prepareArticleSemanticReviews({
      ...args,
      workflowId: "missing-native-pilot-receipt",
      pilotReviewRefs: [ref],
    }),
    /Pilot source review.*ENOENT/,
  )
  assert.equal(fs.existsSync(file), false)
})

test("unpublished pilot receipts are not reused when gold labels or the full input provenance differs", async (t) => {
  for (const difference of ["labels", "full-input"]) {
    await t.test(difference, async (t) => {
      const { f, args, ref, review, task } = await completedSourceFixture(t)
      let refs = [ref]
      if (difference === "labels") {
        review.links[0].concept_id = "target-concept"
        const bytes = JSON.stringify(review) + "\n",
          file = "inputs/corrected-labels.json"
        fs.writeFileSync(path.join(f.root, file), bytes, { flag: "wx" })
        refs = [{ path: file, sha256: sha256(bytes) }]
      } else {
        const file = path.join(f.root, "data/research-semantic-retrieval-policy.json"),
          policy = JSON.parse(fs.readFileSync(file))
        policy.enabled = false
        fs.writeFileSync(file, JSON.stringify(policy) + "\n")
      }
      const prepared = await prepareArticleSemanticReviews({
        ...args,
        workflowId: `no-reuse-${difference}`,
        pilotReviewRefs: refs,
      })
      assert.equal(prepared.prepared, 1)
      assert.notEqual(prepared.tasks[0].task_id, task.task_id)
      assert.equal(prepared.status_counts.reviewed_links, 0)
    })
  }
})

test("semantic selection validates aliases, event identity and private reference bounds before creating work", async (t) => {
  const f = await knowledgeFixture(t),
    policyFile = copyCodexPolicy(f.root),
    article = publishFixtureArticle(f),
    args = {
      root: f.root,
      vault: f.vault,
      repo: f.root,
      policyFile,
      gateReader: gateReady,
      embeddingClient: fakeEmbeddingClient(),
    },
    invalid = [
      { eventIds: [] },
      { eventIds: [article.event_id, article.event_id] },
      { eventIds: ["invalid"] },
      { eventIds: ["fedcba9876543210"] },
      { eventIds: [article.event_id], event_ids: ["fedcba9876543210"] },
      { pilotReviewRefs: [{ path: "../escape.json", sha256: "a".repeat(64) }] },
      { pilotReviewRefs: [{ path: "inputs/none.json", sha256: "invalid" }] },
      {
        pilotReviewRefs: [],
        pilot_review_refs: [{ path: "inputs/none.json", sha256: "a".repeat(64) }],
      },
    ]
  for (const [index, values] of invalid.entries()) {
    const workflowId = `invalid-selection-${index}`
    await assert.rejects(
      prepareArticleSemanticReviews({ ...args, workflowId, ...values }),
      /event_ids|pilot_review_refs|aliases/,
    )
    assert.equal(fs.existsSync(path.join(f.root, `runs/${workflowId}`)), false)
  }
})

test("an invalid native approval remains article-specific while another article prepares normally", async (t) => {
  const f = await knowledgeFixture(t),
    policyFile = copyCodexPolicy(f.root),
    first = publishFixtureArticle(f)
  addKnowledgeArticle(f, { run: "damaged-native" })
  const damaged = publishFixtureArticle(f, "damaged-native"),
    file = path.join(f.root, "runs/damaged-native/reviewed-claims.json"),
    changed = JSON.parse(fs.readFileSync(file))
  changed.claims[0].statement = "A fabricated claim after native review"
  fs.writeFileSync(file, JSON.stringify(changed) + "\n")
  const prepared = await prepareArticleSemanticReviews({
    root: f.root,
    vault: f.vault,
    repo: f.root,
    policyFile,
    workflowId: "article-integrity-isolation",
    gateReader: gateReady,
    embeddingClient: fakeEmbeddingClient(),
  })
  assert.deepEqual(
    prepared.tasks.map((task) => task.event_id),
    [first.event_id],
  )
  assert.equal(prepared.status_counts.blocked, 1)
  const status = articleSemanticReviewStatus({
      root: f.root,
      vault: f.vault,
      repo: f.root,
      policyFile,
      workflowId: prepared.workflow_id,
    }),
    blocked = status.items.find((item) => item.event_id === damaged.event_id)
  assert.equal(blocked.reason, "matching_native_approval_failed_integrity_validation")
  assert.ok(blocked.diagnostics.length)
})

test("a failed deduplicated query embedding freezes full-registry fallbacks for every matching article", async (t) => {
  const f = await knowledgeFixture(t),
    policyFile = copyCodexPolicy(f.root)
  publishFixtureArticle(f)
  for (const run of ["same-query-one", "same-query-two"]) {
    addKnowledgeArticle(f, { run, url: `https://fixture.example/${run}` })
    publishFixtureArticle(f, run)
  }
  const client = fakeEmbeddingClient(),
    successfulEmbed = client.embed
  let batches = 0
  client.embed = async (options) => {
    if (++batches > 1) throw Error("Synthetic query embedding outage")
    return successfulEmbed(options)
  }
  const prepared = await prepareArticleSemanticReviews({
    root: f.root,
    vault: f.vault,
    repo: f.root,
    policyFile,
    workflowId: "deduplicated-query-failure",
    gateReader: gateReady,
    embeddingClient: client,
  })
  assert.equal(prepared.prepared, 3)
  assert.equal(prepared.status_counts.waiting_for_reasoning, 3)
  assert.equal(prepared.status_counts.blocked, 0)
  for (const task of prepared.tasks) {
    const request = readFixtureRequest(f.root, task)
    assert.equal(request.input.context.candidate_retrieval.mode, "full_registry_fallback")
    assert.equal(
      request.input.context.candidate_retrieval.fallback_reason,
      "query_embedding_failed",
    )
    assert.equal(request.input.context.reviewed_concept_registry.length, 2)
  }
})

function reviseFixtureApproval(f, run, mutate) {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(f.root, `runs/${run}/${name}`))),
    record = read("draft.json"),
    decision = read("editorial-review.json"),
    claims = read("reviewed-claims.json").claims,
    documents = read("documents.json"),
    parses = read("parses.json")
  mutate(record, decision, claims)
  record.draft_id = draftFingerprint(record.draft)
  decision.draft_id = record.draft_id
  const article = approvedArticle(record, claims, documents, decision, parses)
  for (const [name, value] of [
    ["draft.json", record],
    ["editorial-review.json", decision],
    ["approved-article.json", article],
  ])
    fs.writeFileSync(
      path.join(f.root, `runs/${run}/${name}`),
      JSON.stringify(value, null, 2) + "\n",
    )
  if (decision.concept_review) {
    const review = evaluateArticleConceptReview(f.root, article, record, claims, parses, decision, {
      vault: f.vault,
    })
    fs.writeFileSync(
      path.join(f.root, `runs/${run}/article-concept-review.json`),
      JSON.stringify(review, null, 2) + "\n",
    )
  }
  return publishFixtureArticle(f, run)
}

function addFixtureNativeConceptReview(f, run) {
  return reviseFixtureApproval(f, run, (record, decision, claims) => {
    const reviewer = "Synthetic native v2 reviewer",
      reviewedAt = decision.reviewed_at,
      conceptPath = "Knowledge/source-concept.md"
    decision.concept_ids = ["source-concept"]
    decision.concept_review = {
      schema: "article-concept-review/v2",
      outcome: "reviewed_links",
      reason: "The synthetic native source and specialist definitions were compared.",
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
          reason: "The native fixture source describes the reviewed reuse mechanism.",
          reviewer,
          reviewed_at: reviewedAt,
          evidence: [{ event_id: decision.event_id, claim_id: record.draft.lead[0].claim_ids[0] }],
          note: {
            path: conceptPath,
            sha256: sha256(fs.readFileSync(path.join(f.vault, conceptPath))),
          },
          definition_read: true,
          article_source_read: true,
          relationship_checked: true,
          aliases_checked: true,
        },
      ],
    }
  })
}

test("existing native v2 concept review remains eligible without a supplementary sidecar", async (t) => {
  const f = await knowledgeFixture(t),
    policyFile = copyCodexPolicy(f.root)
  addFixtureNativeConceptReview(f, "source")
  const prepared = await prepareArticleSemanticReviews({
    root: f.root,
    vault: f.vault,
    repo: f.root,
    policyFile,
    workflowId: "native-v2-pilot",
    gateReader: gateReady,
    embeddingClient: fakeEmbeddingClient(),
  })
  assert.equal(prepared.candidate_retrieval.pilot.eligible_article_count, 1)
  assert.equal(prepared.candidate_retrieval.pilot.eligible_strata, 0)
  assert.equal(prepared.candidate_retrieval.pilot.status, "waiting_for_24_native_reviewed_articles")
  assert.equal(prepared.prepared, 1)
})

test("an exact native storage wait is preserved per article and blocks full-index export", async (t) => {
  const f = await knowledgeFixture(t),
    policyFile = copyCodexPolicy(f.root),
    first = publishFixtureArticle(f)
  addKnowledgeArticle(f, { run: "cold-native" })
  const cold = publishFixtureArticle(f, "cold-native")
  // This is a local synthetic archive/readback, with no Drive API invocation.
  storageAction(f.root, "prepare", { parent_id: "synthetic-parent", minimum_payload_bytes: 0 })
  for (const bundle of storageAction(f.root, "pending").uploads)
    storageAction(f.root, "verify", {
      bundle_id: bundle.id,
      metadata: {
        id: `synthetic-${bundle.id}`,
        title: bundle.name,
        mime_type: "application/zip",
        size: String(bundle.bytes),
        parent_ids: ["synthetic-parent"],
        modified_time: new Date().toISOString(),
        shared: false,
      },
      observed_at: new Date().toISOString(),
      download_path: bundle.local_path,
    })
  storageAction(f.root, "enable")
  fs.unlinkSync(path.join(f.root, "runs/cold-native/reviewed-claims.json"))
  const args = {
      root: f.root,
      vault: f.vault,
      repo: f.root,
      policyFile,
      workflowId: "semantic-native-storage-wait",
      gateReader: gateReady,
      embeddingClient: fakeEmbeddingClient(),
    },
    prepared = await prepareArticleSemanticReviews(args),
    status = articleSemanticReviewStatus(args),
    waiting = status.items.find((item) => item.event_id === cold.event_id)
  assert.deepEqual(
    prepared.tasks.map((task) => task.event_id),
    [first.event_id],
  )
  assert.equal(prepared.status_counts.waiting_for_storage, 1)
  assert.equal(waiting.reason, "exact_native_approval_bytes_require_hydration")
  assert.ok(waiting.storage_requests[0].requests[0].file_id.startsWith("synthetic-"))
  await assert.rejects(
    exportArticleSemanticReviewIndex(args),
    /Complete every article's exact native approval\/storage review/,
  )
})

function addFixtureConcepts(f, count) {
  const original = parseNote(
    fs.readFileSync(path.join(f.vault, "Knowledge/target-concept.md"), "utf8"),
  )
  for (let index = 0; index < count; index++) {
    const id = `filler-${String(index).padStart(3, "0")}`
    fs.writeFileSync(
      path.join(f.vault, `Knowledge/${id}.md`),
      noteText(
        {
          ...original.meta,
          concept_id: id,
          title: id,
          label: id,
          keywords: [id],
          aliases: [],
          connections: [],
        },
        "## 한 문장 정의\n\n별도의 검증된 전문 개념을 표현하는 합성 테스트용 설명이다.\n",
      ),
      { flag: "wx" },
    )
  }
}

test("embedding dimension drift across 64-concept batches falls back before freezing a retrieval index", async (t) => {
  const f = await knowledgeFixture(t),
    policyFile = copyCodexPolicy(f.root)
  publishFixtureArticle(f)
  addFixtureConcepts(f, 64)
  const client = fakeEmbeddingClient(),
    embed = client.embed
  let batches = 0
  client.embed = async (options) => {
    const output = await embed(options)
    if (++batches === 2) {
      assert.equal(options.expected_dimensions, 8)
      output.vectors = output.vectors.map((vector) => [...vector, 0])
      output.dimensions = 9
    }
    return output
  }
  const prepared = await prepareArticleSemanticReviews({
    root: f.root,
    vault: f.vault,
    repo: f.root,
    policyFile,
    workflowId: "cross-batch-dimension-drift",
    gateReader: gateReady,
    embeddingClient: client,
  })
  assert.equal(prepared.prepared, 1)
  assert.equal(prepared.candidate_retrieval.failure_stage, "concept_index_embedding")
  assert.equal(prepared.candidate_retrieval.mode, "full_registry_fallback")
  const indexDirectory = path.join(f.root, "local-ai/semantic-candidate-retrieval/indexes")
  assert.equal(fs.existsSync(indexDirectory), false)
})

test("changed retrieval policy invalidates the frozen workflow on prepare, status, resume and export", async (t) => {
  const f = await knowledgeFixture(t),
    policyFile = copyCodexPolicy(f.root)
  publishFixtureArticle(f)
  const args = {
    root: f.root,
    vault: f.vault,
    repo: f.root,
    policyFile,
    workflowId: "retrieval-policy-freeze",
    gateReader: gateReady,
    embeddingClient: fakeEmbeddingClient(),
  }
  await prepareArticleSemanticReviews(args)
  const file = path.join(f.root, "data/research-semantic-retrieval-policy.json"),
    changed = JSON.parse(fs.readFileSync(file))
  changed.enabled = false
  fs.writeFileSync(file, JSON.stringify(changed) + "\n")
  assert.throws(() => articleSemanticReviewStatus(args), /Semantic review inputs changed/)
  for (const operation of [
    prepareArticleSemanticReviews,
    resumeArticleSemanticReviews,
    exportArticleSemanticReviewIndex,
  ])
    await assert.rejects(operation(args), /Semantic review inputs changed/)
})

test("automatic retrieval evaluates native and supplementary pilot24 plus distinct challenge8 and revalidates cached gold", async (t) => {
  const f = await knowledgeFixture(t),
    policyFile = copyCodexPolicy(f.root),
    articles = new Map(),
    runs = ["source", ...Array.from({ length: 31 }, (_, index) => `gold-${index + 1}`)]
  addFixtureConcepts(f, 40)
  for (const [index, run] of runs.entries()) {
    if (run !== "source") addKnowledgeArticle(f, { run, url: `https://fixture.example/${run}` })
    const article = reviseFixtureApproval(f, run, (record) => {
      record.draft.sector = SECTORS[index % 4]
    })
    articles.set(article.event_id, { run, index })
  }
  for (const run of runs.slice(0, 4)) addFixtureNativeConceptReview(f, run)
  const client = fakeEmbeddingClient()
  client.embed = async ({ model, inputs, expected_digest, expected_dimensions }) => {
    assert.equal(expected_digest, "a".repeat(64))
    if (expected_dimensions !== undefined) assert.equal(expected_dimensions, 2)
    // Deterministic synthetic vectors put the reused mechanism near the public
    // query and unrelated filler definitions in an orthogonal direction.
    return {
      model,
      digest: expected_digest,
      dimensions: 2,
      vectors: inputs.map((text) => (/^(filler-|target-concept)/.test(text) ? [0, 1] : [1, 0])),
    }
  }
  const args = {
      root: f.root,
      vault: f.vault,
      repo: f.root,
      policyFile,
      workflowId: "synthetic-full-registry-gold",
      gateReader: gateReady,
      embeddingClient: client,
      limit: 100,
    },
    prepared = await prepareArticleSemanticReviews(args),
    requests = new Map()
  assert.equal(prepared.prepared, 32)
  for (const task of prepared.tasks) {
    const request = readFixtureRequest(f.root, task),
      { index } = articles.get(task.event_id),
      reviewedNone = index >= 24 && (index - 24) % 3 === 2
    requests.set(task.event_id, request)
    await submitReasoningResult(f.root, {
      ...task,
      executor: "codex",
      model: "gpt-6-luna",
      output: fixtureOutput(request, reviewedNone),
    })
  }
  const resumed = await resumeArticleSemanticReviews(args)
  assert.equal(resumed.completed.length, 32)
  const refs = []
  for (const task of prepared.tasks) {
    const { index } = articles.get(task.event_id)
    if (index < 4) continue
    const challengeKind =
      index < 24 ? null : ["ambiguous", "homonym", "reviewed_none"][(index - 24) % 3]
    refs.push(
      writeFixtureSidecar(f, args, task, requests.get(task.event_id), {
        name: "mixed-gold",
        challengeKind,
      }).ref,
    )
  }
  const selectedEvent = prepared.tasks[0].event_id,
    nextArgs = {
      ...args,
      workflowId: "synthetic-evaluated-shortlist",
      pilotReviewRefs: refs,
      eventIds: [selectedEvent],
    },
    evaluated = await prepareArticleSemanticReviews(nextArgs)
  assert.equal(evaluated.prepared, 1)
  assert.equal(evaluated.status_counts.total, 32)
  assert.equal(
    evaluated.candidate_retrieval.mode,
    "hybrid_top_k",
    JSON.stringify(evaluated.candidate_retrieval),
  )
  assert.equal(evaluated.candidate_retrieval.pilot.sample_count, 24)
  assert.equal(evaluated.candidate_retrieval.pilot.challenge_sample_count, 8)
  assert.equal(evaluated.candidate_retrieval.pilot.recall_at_12, 1)
  assert.ok(evaluated.candidate_retrieval.pilot.median_concept_payload_reduction >= 0.6)
  const reducedRequest = readFixtureRequest(f.root, evaluated.tasks[0])
  assert.ok(reducedRequest.input.context.reviewed_concept_registry.length <= 12)
  const reused = await prepareArticleSemanticReviews({
    ...nextArgs,
    workflowId: "synthetic-cached-shortlist",
  })
  assert.equal(
    reused.candidate_retrieval.evaluation_sha256,
    evaluated.candidate_retrieval.evaluation_sha256,
  )

  const evaluationDirectory = path.join(
      f.root,
      "local-ai/semantic-candidate-retrieval/evaluations",
    ),
    files = fs.readdirSync(evaluationDirectory)
  assert.equal(files.length, 1)
  const evaluationPath = path.join(evaluationDirectory, files[0]),
    evaluation = JSON.parse(fs.readFileSync(evaluationPath))
  assert.equal(
    evaluation.cases.filter((row) => row.gold_source === "native_reviewed_article_concepts_v2")
      .length,
    4,
  )
  assert.equal(evaluation.challenge_cases.length, 8)

  const indexDirectory = path.join(f.root, "local-ai/semantic-candidate-retrieval/indexes"),
    indexPath = path.join(indexDirectory, fs.readdirSync(indexDirectory)[0]),
    indexBytes = fs.readFileSync(indexPath),
    index = JSON.parse(indexBytes)
  index.documents[0].embedding[0] = 0.5
  fs.writeFileSync(indexPath, JSON.stringify(index) + "\n")
  assert.throws(() => articleSemanticReviewStatus(nextArgs), /Semantic review inputs changed/)
  fs.writeFileSync(indexPath, indexBytes)

  const context = reducedRequest.input.context,
    querySha = sha256(
      [
        context.article.title,
        ...context.verified_public_claims.map((claim) => claim.statement),
      ].join("\n"),
    ),
    vectorPath = path.join(
      f.root,
      `local-ai/semantic-candidate-retrieval/query-vectors/${context.candidate_retrieval.index_sha256}/${querySha}.json`,
    ),
    vectorBytes = fs.readFileSync(vectorPath),
    vector = JSON.parse(vectorBytes)
  vector.vector = [0, 1]
  vector.vector_sha256 = sha256(JSON.stringify(vector.vector))
  fs.writeFileSync(vectorPath, JSON.stringify(vector) + "\n")
  assert.throws(() => articleSemanticReviewStatus(nextArgs), /Semantic review inputs changed/)
  await assert.rejects(exportArticleSemanticReviewIndex(nextArgs), /Semantic review inputs changed/)
  fs.writeFileSync(vectorPath, vectorBytes)

  // Rehashing a forged cache record must not replace source validation.
  evaluation.challenge_cases[0].concept_review_sha256 = "f".repeat(64)
  evaluation.challenge_cases[0].gold_sha256 = conceptCandidateGoldSha256(
    evaluation.challenge_cases[0],
  )
  const { evaluation_sha256, ...body } = evaluation
  evaluation.evaluation_sha256 = sha256(JSON.stringify(body))
  fs.writeFileSync(evaluationPath, JSON.stringify(evaluation) + "\n")
  assert.throws(() => articleSemanticReviewStatus(nextArgs), /Semantic review inputs changed/)
  await assert.rejects(resumeArticleSemanticReviews(nextArgs), /Semantic review inputs changed/)
  await assert.rejects(
    prepareArticleSemanticReviews({ ...nextArgs, workflowId: "synthetic-forged-gold-cache" }),
    /gold.*changed|source facts or reviewed links changed/,
  )
})

// All selection records below belong to disposable synthetic fixtures. No
// operational native version or source comparison is selected by these tests.
function cloneFixtureNativeApproval(f, from, run) {
  const directory = path.join(f.root, "runs", run)
  fs.cpSync(path.join(f.root, "runs", from), directory, { recursive: true, errorOnExist: true })
  const file = path.join(directory, "editorial-review.json"),
    decision = JSON.parse(fs.readFileSync(file))
  decision.reviewer = "Independent synthetic native reviewer " + run
  fs.writeFileSync(file, JSON.stringify(decision, null, 2) + "\n")
  return loadApprovedOntologyInput(f.root, run, { vault: f.vault })
}

function fixtureNativeInputChoice(f, { eventId, runs, selectedRun, name = "native-choice" }) {
  const articleFile = path.join(f.vault, "News", eventId + ".md"),
    bytes = fs.readFileSync(articleFile),
    note = parseNote(bytes.toString()),
    article = {
      event_id: note.meta.event_id,
      title: note.meta.title,
      published_at: note.meta.published_at,
      sector: note.meta.sector,
      source_urls: [...new Set(note.meta.sources.map(canonicalURL))].sort(),
      prose: [note.meta.title, articleSearchText(note.body)].filter(Boolean).join("\n"),
    },
    approvals = runs.map((run) => loadApprovedOntologyInput(f.root, run, { vault: f.vault })),
    selected = approvals.find((row) => row.run === selectedRun),
    basisPath = `inputs/${name}-basis.json`,
    basisBytes =
      JSON.stringify({
        schema: "synthetic-native-input-comparison/v1",
        event_id: eventId,
        approved_run: selectedRun,
        reason: "Synthetic exact comparison only; no operational native selection.",
      }) + "\n"
  fs.writeFileSync(path.join(f.root, basisPath), basisBytes, { flag: "wx" })
  const record = {
    schema: "semantic-native-approval-selection/v1",
    purpose: "native_input_selection_only",
    event_id: eventId,
    article_sha256: sha256(bytes),
    article_public_sha256: sha256(articlePublicFingerprint(article)),
    approved_run: selectedRun,
    approval_files: selected.file_hashes,
    approval_files_sha256: sha256(JSON.stringify(selected.file_hashes)),
    candidate_set_sha256: nativeApprovalSelectionCandidateSetSha256(
      approvals.map((row) => ({
        run: row.run,
        approval_files_sha256: sha256(JSON.stringify(row.file_hashes)),
      })),
    ),
    basis: {
      kind: "explicit_artifact_comparison",
      refs: [{ path: basisPath, sha256: sha256(basisBytes) }],
    },
    reviewer: "Synthetic selection fixture; not an operational reviewer",
    reviewed_at: new Date().toISOString(),
    reason:
      "Explicitly choose the exact synthetic native artifacts after comparing every candidate.",
  }
  const file = `inputs/${name}.json`,
    encoded = JSON.stringify(record, null, 2) + "\n"
  fs.writeFileSync(path.join(f.root, file), encoded, { flag: "wx" })
  return { record, ref: { path: file, sha256: sha256(encoded) }, basisBytes, basisPath }
}

async function nativeInputChoiceFixture(t) {
  const f = await knowledgeFixture(t),
    policyFile = copyCodexPolicy(f.root),
    article = publishFixtureArticle(f)
  cloneFixtureNativeApproval(f, "source", "zz-explicit-native")
  const choice = fixtureNativeInputChoice(f, {
    eventId: article.event_id,
    runs: ["source", "zz-explicit-native"],
    selectedRun: "zz-explicit-native",
  })
  return {
    f,
    article,
    choice,
    args: {
      root: f.root,
      vault: f.vault,
      repo: f.root,
      policyFile,
      workflowId: "explicit-native-input",
      gateReader: gateReady,
      embeddingClient: fakeEmbeddingClient(),
    },
  }
}

test("native approval selection chooses only the exact run while other ambiguity still blocks full export", async (t) => {
  const { f, article, choice, args } = await nativeInputChoiceFixture(t)
  const other = addKnowledgeArticle(f, {
    run: "unselected-event",
    url: "https://fixture.example/unselected-native",
  })
  publishFixtureArticle(f, "unselected-event")
  cloneFixtureNativeApproval(f, "unselected-event", "zz-unselected-event")
  const before = await prepareArticleSemanticReviews({ ...args, workflowId: "no-native-choices" })
  assert.equal(before.status_counts.blocked, 2)
  const selectedArgs = {
      ...args,
      approval_selection_refs: [choice.ref],
      eventIds: [article.event_id],
    },
    selected = await prepareArticleSemanticReviews(selectedArgs),
    task = selected.tasks[0],
    request = readFixtureRequest(f.root, task)
  assert.equal(selected.status_counts.total, 2)
  assert.equal(selected.status_counts.blocked, 1)
  assert.equal(selected.prepared, 1)
  assert.equal(task.approved_run, "zz-explicit-native")
  assert.equal(request.binding.approval_run, "zz-explicit-native")
  assert.equal(request.binding.approval_selection_sha256, choice.ref.sha256)
  assert.equal(request.binding.approval_files_sha256, choice.record.approval_files_sha256)
  assert.equal(request.binding.settings.model, "gpt-6-luna")
  await assert.rejects(
    submitReasoningResult(f.root, {
      ...task,
      executor: "codex",
      model: "gpt-6-sol",
      output: fixtureOutput(request),
    }),
    /model|gpt-6-luna/,
  )
  await submitReasoningResult(f.root, {
    ...task,
    executor: "codex",
    model: "gpt-6-luna",
    output: fixtureOutput(request),
  })
  await resumeArticleSemanticReviews(args)
  await assert.rejects(
    exportArticleSemanticReviewIndex(args),
    /Complete every article's exact native approval/,
  )
  const originalResult = fs.readFileSync(
      path.join(f.root, "reasoning-tasks", task.task_id, "result.json"),
    ),
    gold = writeFixtureSidecar(f, args, task, request, { name: "chosen-native-gold" }),
    secondChoice = fixtureNativeInputChoice(f, {
      eventId: other.article.event_id,
      runs: ["unselected-event", "zz-unselected-event"],
      selectedRun: "zz-unselected-event",
      name: "second-choice",
    })
  await assert.rejects(
    prepareArticleSemanticReviews({
      ...selectedArgs,
      approval_selection_refs: [choice.ref, secondChoice.ref],
    }),
    /selection refs changed after freeze/,
  )
  const completeArgs = {
      ...args,
      workflowId: "all-explicit-native-inputs",
      approvalSelectionRefs: [choice.ref, secondChoice.ref],
      pilotReviewRefs: [gold.ref],
    },
    complete = await prepareArticleSemanticReviews(completeArgs)
  assert.equal(complete.prepared, 1)
  assert.equal(complete.tasks[0].event_id, other.article.event_id)
  assert.equal(complete.status_counts.reviewed_links, 1)
  const nextTask = complete.tasks[0],
    nextRequest = readFixtureRequest(f.root, nextTask)
  await submitReasoningResult(f.root, {
    ...nextTask,
    executor: "codex",
    model: "gpt-6-luna",
    output: fixtureOutput(nextRequest),
  })
  await resumeArticleSemanticReviews(completeArgs)
  const exported = await exportArticleSemanticReviewIndex(completeArgs),
    index = JSON.parse(
      fs.readFileSync(path.join(f.root, "data/article-semantic-review-index.json")),
    )
  assert.equal(exported.articles, 2)
  assert.equal(index.reviews.find((row) => row.event_id === article.event_id).task_id, task.task_id)
  assert.equal(Object.hasOwn(index.reviews[0], "approval_selection_refs"), false)
  assert.equal(
    fs
      .readFileSync(path.join(f.root, "reasoning-tasks", task.task_id, "result.json"))
      .equals(originalResult),
    true,
  )
})

test("native approval selection rejects altered identity, native files, candidate set and basis without fallback", async (t) => {
  const { f, args, choice } = await nativeInputChoiceFixture(t),
    cases = [
      [
        "purpose",
        (r) => {
          r.purpose = "native_approval"
        },
      ],
      [
        "event",
        (r) => {
          r.event_id = "fedcba9876543210"
        },
      ],
      [
        "public-bytes",
        (r) => {
          r.article_sha256 = "b".repeat(64)
        },
      ],
      [
        "public-fingerprint",
        (r) => {
          r.article_public_sha256 = "b".repeat(64)
        },
      ],
      [
        "unknown-run",
        (r) => {
          r.approved_run = "missing-native-run"
        },
      ],
      [
        "file-map",
        (r) => {
          r.approval_files["draft.json"] = "b".repeat(64)
          r.approval_files_sha256 = sha256(JSON.stringify(r.approval_files))
        },
      ],
      [
        "file-digest",
        (r) => {
          r.approval_files_sha256 = "c".repeat(64)
        },
      ],
      [
        "candidate-set",
        (r) => {
          r.candidate_set_sha256 = "d".repeat(64)
        },
      ],
      [
        "missing-file",
        (r) => {
          delete r.approval_files["parses.json"]
        },
      ],
      [
        "extra-key",
        (r) => {
          r.passed = true
        },
      ],
      [
        "missing-reviewer",
        (r) => {
          r.reviewer = " "
        },
      ],
      [
        "predates-native-review",
        (r) => {
          r.reviewed_at = "2026-09-25"
        },
      ],
      [
        "basis-sha",
        (r) => {
          r.basis.refs[0].sha256 = "e".repeat(64)
        },
      ],
      [
        "basis-traversal",
        (r) => {
          r.basis.refs[0].path = "../escape.json"
        },
      ],
      [
        "basis-empty",
        (r) => {
          r.basis.refs = []
        },
      ],
      [
        "basis-duplicate",
        (r) => {
          r.basis.refs.push(r.basis.refs[0])
        },
      ],
    ]
  let calls = 0
  for (const [name, mutate] of cases)
    await t.test(name, async () => {
      const record = structuredClone(choice.record)
      mutate(record)
      const file = `inputs/invalid-choice-${name}.json`,
        bytes = JSON.stringify(record) + "\n"
      fs.writeFileSync(path.join(f.root, file), bytes, { flag: "wx" })
      const workflowId = `invalid-native-choice-${name}`
      await assert.rejects(
        prepareArticleSemanticReviews({
          ...args,
          workflowId,
          approvalSelectionRefs: [{ path: file, sha256: sha256(bytes) }],
          embeddingClient: {
            async metadata() {
              calls++
              throw Error("No embedding for invalid selection")
            },
          },
        }),
        /Native input selection/,
      )
      assert.equal(
        fs.existsSync(path.join(f.root, `runs/${workflowId}/article-semantic-review/latest.json`)),
        false,
      )
    })
  assert.equal(calls, 0)
  const duplicate = { path: "inputs/duplicate-native-choice.json", sha256: choice.ref.sha256 }
  fs.copyFileSync(path.join(f.root, choice.ref.path), path.join(f.root, duplicate.path))
  for (const values of [
    { approvalSelectionRefs: [choice.ref, choice.ref] },
    { approvalSelectionRefs: [choice.ref, duplicate] },
    { approvalSelectionRefs: [choice.ref], approval_selection_refs: [] },
    { approvalSelectionRefs: [{ ...choice.ref, sha256: "a".repeat(64) }] },
    { approvalSelectionRefs: [{ ...choice.ref, path: "/tmp/escape.json" }] },
  ])
    await assert.rejects(
      prepareArticleSemanticReviews({ ...args, workflowId: "invalid-native-ref", ...values }),
      /selection|aliases/,
    )
  const basis = JSON.parse(choice.basisBytes)
  basis.event_id = "fedcba9876543210"
  const wrongBasis = JSON.stringify(basis) + "\n"
  fs.writeFileSync(path.join(f.root, choice.basisPath), wrongBasis)
  const changedRecord = structuredClone(choice.record)
  changedRecord.basis.refs[0].sha256 = sha256(wrongBasis)
  const bytes = JSON.stringify(changedRecord) + "\n",
    file = "inputs/unrelated-basis-choice.json"
  fs.writeFileSync(path.join(f.root, file), bytes)
  await assert.rejects(
    prepareArticleSemanticReviews({
      ...args,
      approvalSelectionRefs: [{ path: file, sha256: sha256(bytes) }],
    }),
    /basis belongs to another event or run/,
  )
})

test("native approval selection freezes refs and revalidates basis, public and candidate bytes", async (t) => {
  const { f, args, choice } = await nativeInputChoiceFixture(t),
    selectedArgs = { ...args, approvalSelectionRefs: [choice.ref] },
    prepared = await prepareArticleSemanticReviews(selectedArgs)
  const repeated = await prepareArticleSemanticReviews(args)
  assert.equal(repeated.tasks[0].task_id, prepared.tasks[0].task_id)
  assert.equal(repeated.inventory_sha256, prepared.inventory_sha256)
  await assert.rejects(
    prepareArticleSemanticReviews({ ...args, approvalSelectionRefs: [] }),
    /selection refs changed after freeze/,
  )
  fs.appendFileSync(path.join(f.root, choice.basisPath), " ")
  assert.throws(() => articleSemanticReviewStatus(args), /basis SHA changed/)
  await assert.rejects(resumeArticleSemanticReviews(args), /basis SHA changed/)
  await assert.rejects(exportArticleSemanticReviewIndex(args), /basis SHA changed/)
  fs.writeFileSync(path.join(f.root, choice.basisPath), choice.basisBytes)
  const refFile = path.join(f.root, choice.ref.path),
    refBytes = fs.readFileSync(refFile)
  fs.appendFileSync(refFile, " ")
  assert.throws(() => articleSemanticReviewStatus(args), /artifact SHA changed/)
  fs.writeFileSync(refFile, refBytes)
  const nativeFile = path.join(f.root, "runs/zz-explicit-native/editorial-review.json"),
    nativeBytes = fs.readFileSync(nativeFile),
    nativeReview = JSON.parse(nativeBytes)
  nativeReview.reviewer = "Changed synthetic native reviewer after freeze"
  fs.writeFileSync(nativeFile, JSON.stringify(nativeReview) + "\n")
  assert.throws(
    () => articleSemanticReviewStatus(args),
    /Selected native approval file bytes changed/,
  )
  fs.writeFileSync(nativeFile, nativeBytes)
  const publicFile = path.join(f.vault, "News", choice.record.event_id + ".md"),
    publicBytes = fs.readFileSync(publicFile)
  fs.appendFileSync(publicFile, "\nChanged public prose after selection freeze.\n")
  assert.throws(() => articleSemanticReviewStatus(args), /exact current public article/)
  fs.writeFileSync(publicFile, publicBytes)
  cloneFixtureNativeApproval(f, "source", "third-native-candidate")
  assert.throws(() => articleSemanticReviewStatus(args), /candidate set changed/)
})

test("native approval selection preserves selected cold storage wait and resumes only with a fresh frozen inventory", async (t) => {
  const { f, args, article, choice } = await nativeInputChoiceFixture(t)
  addKnowledgeArticle(f, { run: "other-ready", url: "https://fixture.example/other-ready" })
  const other = publishFixtureArticle(f, "other-ready")
  storageAction(f.root, "prepare", {
    parent_id: "synthetic-selection-parent",
    minimum_payload_bytes: 0,
  })
  const bundles = storageAction(f.root, "pending").uploads
  for (const bundle of bundles)
    storageAction(f.root, "verify", {
      bundle_id: bundle.id,
      metadata: {
        id: `synthetic-${bundle.id}`,
        title: bundle.name,
        mime_type: "application/zip",
        size: String(bundle.bytes),
        parent_ids: ["synthetic-selection-parent"],
        modified_time: new Date().toISOString(),
        shared: false,
      },
      observed_at: new Date().toISOString(),
      download_path: bundle.local_path,
    })
  storageAction(f.root, "enable")
  const coldPath = "runs/zz-explicit-native/reviewed-claims.json",
    coldBytes = fs.readFileSync(path.join(f.root, coldPath))
  fs.unlinkSync(path.join(f.root, coldPath))
  const selectedArgs = { ...args, approval_selection_refs: [choice.ref] },
    result = await prepareArticleSemanticReviews(selectedArgs),
    status = articleSemanticReviewStatus(args),
    waiting = status.items.find((row) => row.event_id === article.event_id)
  assert.deepEqual(
    result.tasks.map((task) => task.event_id),
    [other.event_id],
  )
  assert.equal(result.status_counts.waiting_for_storage, 1)
  assert.equal(waiting.approved_run, "zz-explicit-native")
  assert.equal(waiting.reason, "selected_native_approval_bytes_require_hydration")
  assert.equal(waiting.storage_requests[0].requests[0].path, coldPath)
  await assert.rejects(
    exportArticleSemanticReviewIndex(args),
    /Complete every article's exact native approval/,
  )
  const download = waiting.storage_requests[0].requests[0],
    bundle = bundles.find((row) => row.id === download.bundle_id)
  storageAction(f.root, "hydrate", {
    bundle_id: bundle.id,
    download_path: bundle.local_path,
    paths: [coldPath],
  })
  assert.equal(fs.readFileSync(path.join(f.root, coldPath)).equals(coldBytes), true)
  await assert.rejects(prepareArticleSemanticReviews(args), /inputs changed.*new workflow ID/)
  const fresh = await prepareArticleSemanticReviews({
    ...selectedArgs,
    workflowId: "restored-native-choice",
  })
  assert.equal(fresh.prepared, 2)
  assert.equal(
    fresh.tasks.find((task) => task.event_id === article.event_id).approved_run,
    "zz-explicit-native",
  )
})

test("native approval selection reuses an exact old full-input source receipt without adding a new receipt or changing its binding", async (t) => {
  const { f, args, article, task, request, ref } = await completedSourceFixture(t)
  cloneFixtureNativeApproval(f, "source", "zz-later-native")
  const choice = fixtureNativeInputChoice(f, {
      eventId: article.event_id,
      runs: ["source", "zz-later-native"],
      selectedRun: "source",
      name: "reuse-old-native",
    }),
    before = fs.readFileSync(path.join(f.root, "reasoning-tasks", task.task_id, "request.json")),
    nextArgs = {
      ...args,
      workflowId: "reuse-old-native-with-choice",
      approvalSelectionRefs: [choice.ref],
      pilotReviewRefs: [ref],
    },
    next = await prepareArticleSemanticReviews(nextArgs)
  assert.equal(next.prepared, 0)
  assert.equal(next.status_counts.reviewed_links, 1)
  assert.equal(
    fs
      .readFileSync(path.join(f.root, "reasoning-tasks", task.task_id, "request.json"))
      .equals(before),
    true,
  )
  assert.equal(Object.hasOwn(request.binding, "approval_selection_sha256"), false)
  assert.equal(
    fs.existsSync(
      path.join(f.root, `runs/${nextArgs.workflowId}/article-semantic-review/receipts`),
    ),
    false,
  )
  const exported = await exportArticleSemanticReviewIndex(nextArgs)
  assert.equal(exported.articles, 1)
  assert.equal(articleSemanticReviewStatus(nextArgs).status_counts.reviewed_links, 1)
})

test("native approval selection cannot admit invalid native facts even when the record matches their changed file bytes", async (t) => {
  const { f, args, choice } = await nativeInputChoiceFixture(t),
    nativeFile = path.join(f.root, "runs/zz-explicit-native/reviewed-claims.json"),
    claims = JSON.parse(fs.readFileSync(nativeFile))
  claims.claims.find((claim) => claim.claim_id === "unassigned").statement =
    "A changed synthetic fact after its original review."
  const bytes = JSON.stringify(claims) + "\n"
  fs.writeFileSync(nativeFile, bytes)
  const record = structuredClone(choice.record)
  record.approval_files["reviewed-claims.json"] = sha256(bytes)
  record.approval_files_sha256 = sha256(JSON.stringify(record.approval_files))
  const file = "inputs/forged-native-integrity-choice.json",
    encoded = JSON.stringify(record) + "\n"
  fs.writeFileSync(path.join(f.root, file), encoded)
  await assert.rejects(
    prepareArticleSemanticReviews({
      ...args,
      approvalSelectionRefs: [{ path: file, sha256: sha256(encoded) }],
    }),
    /Native input selection/,
  )
  assert.equal(
    fs.existsSync(path.join(f.root, `runs/${args.workflowId}/article-semantic-review/latest.json`)),
    false,
  )
})

test("native approval selection preserves exact published-index reuse from an original request without selection metadata", async (t) => {
  const { f, args, article, task } = await completedSourceFixture(t)
  await exportArticleSemanticReviewIndex(args)
  cloneFixtureNativeApproval(f, "source", "zz-unselected-published-alias")
  const choice = fixtureNativeInputChoice(f, {
      eventId: article.event_id,
      runs: ["source", "zz-unselected-published-alias"],
      selectedRun: "source",
      name: "published-native-choice",
    }),
    nextArgs = {
      ...args,
      workflowId: "published-reuse-explicit-choice",
      approvalSelectionRefs: [choice.ref],
    },
    result = await prepareArticleSemanticReviews(nextArgs)
  assert.equal(result.prepared, 0)
  assert.equal(result.status_counts.reviewed_links, 1)
  await exportArticleSemanticReviewIndex(nextArgs)
  const index = JSON.parse(
    fs.readFileSync(path.join(f.root, "data/article-semantic-review-index.json")),
  )
  assert.equal(index.reviews[0].task_id, task.task_id)
  assert.equal(index.reviews[0].workflow_id, args.workflowId)
})

test("native approval selection omits absent and empty refs from existing inventory and request identity", async (t) => {
  const { f, args, task, request } = await completedSourceFixture(t),
    pointerFile = path.join(f.root, `runs/${args.workflowId}/article-semantic-review/latest.json`),
    pointer = JSON.parse(fs.readFileSync(pointerFile)),
    inventoryFile = path.join(f.root, pointer.inventory.path),
    inventoryBytes = fs.readFileSync(inventoryFile),
    inventory = JSON.parse(inventoryBytes)
  assert.equal(Object.hasOwn(inventory, "approval_selection_refs"), false)
  assert.equal(Object.hasOwn(inventory.items[0], "approval_selection_sha256"), false)
  assert.equal(Object.hasOwn(request.binding, "approval_selection_sha256"), false)
  const prepared = await prepareArticleSemanticReviews({ ...args, approvalSelectionRefs: [] })
  assert.equal(prepared.inventory_sha256, inventory.inventory_sha256)
  assert.equal(prepared.tasks[0].task_id, task.task_id)
  assert.equal(prepared.tasks[0].request_sha256, task.request_sha256)
  assert.equal(fs.readFileSync(inventoryFile).equals(inventoryBytes), true)
})

function fixtureReceiptRef(f, args, task) {
  const pointer = JSON.parse(
      fs.readFileSync(
        path.join(f.root, "runs", args.workflowId, "article-semantic-review/latest.json"),
      ),
    ),
    inventory = JSON.parse(fs.readFileSync(path.join(f.root, pointer.inventory.path))),
    row = inventory.items.find((item) => item.event_id === task.event_id),
    relative =
      "runs/" +
      args.workflowId +
      "/article-semantic-review/receipts/" +
      row.event_id +
      "-" +
      row.semantic_input_sha256 +
      ".json"
  return { path: relative, sha256: sha256(fs.readFileSync(path.join(f.root, relative))) }
}

async function completedPrivateReuseFixture(t, { hybrid = false, nativeChoice = false } = {}) {
  const f = await knowledgeFixture(t),
    policyFile = copyCodexPolicy(f.root),
    client = fakeEmbeddingClient(),
    goldRows = [],
    pilotRefs = []
  if (hybrid) {
    addFixtureConcepts(f, 40)
    const runs = [
      "source",
      ...Array.from({ length: 31 }, (_, index) => "reuse-gold-" + (index + 1)),
    ]
    for (const [index, run] of runs.entries()) {
      if (run !== "source") addKnowledgeArticle(f, { run, url: "https://fixture.example/" + run })
      const article = reviseFixtureApproval(f, run, (record) => {
        record.draft.sector = SECTORS[index % 4]
      })
      goldRows.push({ run, event_id: article.event_id, index })
    }
    client.embed = async ({ model, inputs, expected_digest }) => ({
      model,
      digest: expected_digest,
      dimensions: 2,
      vectors: inputs.map((text) => (/^(filler-|target-concept)/.test(text) ? [0, 1] : [1, 0])),
    })
    addKnowledgeArticle(f, { run: "reuse-a", url: "https://fixture.example/reuse-a" })
  }
  const a = publishFixtureArticle(f, hybrid ? "reuse-a" : "source")
  addKnowledgeArticle(f, { run: "reuse-b", url: "https://fixture.example/reuse-b" })
  const b = publishFixtureArticle(f, "reuse-b")
  addKnowledgeArticle(f, { run: "recover-c", url: "https://fixture.example/recover-c" })
  const c = publishFixtureArticle(f, "recover-c"),
    held = path.join(f.root, "inputs/held-recover-c")
  fs.renameSync(path.join(f.root, "runs/recover-c"), held)
  const common = {
    root: f.root,
    vault: f.vault,
    repo: f.root,
    policyFile,
    gateReader: gateReady,
    embeddingClient: client,
    limit: 100,
  }
  if (hybrid) {
    for (const row of goldRows.slice(0, 4)) addFixtureNativeConceptReview(f, row.run)
    const goldArgs = {
        ...common,
        workflowId: "private-reuse-full-gold",
        eventIds: goldRows.map((row) => row.event_id),
      },
      batch = await prepareArticleSemanticReviews(goldArgs),
      requests = new Map()
    assert.equal(batch.prepared, 32)
    for (const task of batch.tasks) {
      const request = readFixtureRequest(f.root, task),
        row = goldRows.find((row) => row.event_id === task.event_id),
        reviewedNone = row.index >= 24 && (row.index - 24) % 3 === 2
      requests.set(task.event_id, request)
      await submitReasoningResult(f.root, {
        ...task,
        executor: "codex",
        model: "gpt-6-luna",
        output: fixtureOutput(request, reviewedNone),
      })
    }
    await resumeArticleSemanticReviews(goldArgs)
    for (const task of batch.tasks) {
      const { index } = goldRows.find((row) => row.event_id === task.event_id)
      if (index < 4) continue
      pilotRefs.push(
        writeFixtureSidecar(f, goldArgs, task, requests.get(task.event_id), {
          name: "private-reuse-gold",
          challengeKind:
            index < 24 ? null : ["ambiguous", "homonym", "reviewed_none"][(index - 24) % 3],
        }).ref,
      )
    }
  }
  let choice
  if (nativeChoice) {
    cloneFixtureNativeApproval(f, hybrid ? "reuse-a" : "source", "original-choice-alias")
    choice = fixtureNativeInputChoice(f, {
      eventId: a.event_id,
      runs: [hybrid ? "reuse-a" : "source", "original-choice-alias"],
      selectedRun: hybrid ? "reuse-a" : "source",
      name: "original-completed-choice",
    })
  }
  const args = {
      ...common,
      workflowId: hybrid ? "private-reuse-hybrid-origin" : "private-reuse-full-origin",
      eventIds: [a.event_id, b.event_id],
      ...(pilotRefs.length ? { pilotReviewRefs: pilotRefs } : {}),
      ...(choice ? { approvalSelectionRefs: [choice.ref] } : {}),
    },
    batch = await prepareArticleSemanticReviews(args)
  assert.equal(batch.prepared, 2)
  assert.equal(batch.status_counts.blocked, 1)
  for (const task of batch.tasks) {
    const request = readFixtureRequest(f.root, task)
    assert.equal(
      request.input.context.candidate_retrieval.mode,
      hybrid ? "hybrid_top_k" : "full_registry_fallback",
    )
    await submitReasoningResult(f.root, {
      ...task,
      executor: "codex",
      model: "gpt-6-luna",
      output: fixtureOutput(request, task.event_id === b.event_id),
    })
  }
  const resumed = await resumeArticleSemanticReviews(args),
    refs = batch.tasks.map((task) => fixtureReceiptRef(f, args, task)),
    original = refs.map((ref) => ({ ref, bytes: fs.readFileSync(path.join(f.root, ref.path)) }))
  assert.equal(resumed.completed.length, 2)
  assert.equal(fs.existsSync(path.join(f.root, "data/article-semantic-review-index.json")), false)
  return { f, args, a, b, c, held, refs, original, tasks: batch.tasks, choice }
}

test("completed private receipts reuse hybrid tasks after unrelated native recovery", async (t) => {
  const fixture = await completedPrivateReuseFixture(t, { hybrid: true }),
    { f, args, a, b, c, held, refs, original, tasks } = fixture
  fs.renameSync(held, path.join(f.root, "runs/recover-c"))
  const nextArgs = {
      ...args,
      workflowId: "private-reuse-hybrid-recovered",
      eventIds: [a.event_id, b.event_id, c.event_id],
      completedReviewRefs: refs,
    },
    next = await prepareArticleSemanticReviews(nextArgs)
  assert.equal(
    next.prepared,
    1,
    "Only recovered C needs a new request; completed A/B must reuse their private receipts",
  )
  assert.deepEqual(
    next.tasks.map((task) => task.event_id),
    [c.event_id],
  )
  const status = articleSemanticReviewStatus(nextArgs)
  for (const item of status.items.filter((item) =>
    [a.event_id, b.event_id].includes(item.event_id),
  )) {
    const task = tasks.find((task) => task.event_id === item.event_id)
    assert.equal(item.task_id, task.task_id)
    assert.equal(item.reused_from_workflow_id, args.workflowId)
    assert.deepEqual(
      item.reused_receipt_ref,
      refs.find((ref) => ref.path.includes(item.event_id)),
    )
  }
  for (const item of original)
    assert.ok(fs.readFileSync(path.join(f.root, item.ref.path)).equals(item.bytes))
  assert.equal(
    fs.existsSync(
      path.join(f.root, "runs", nextArgs.workflowId, "article-semantic-review/receipts"),
    ),
    false,
  )
  await assert.rejects(
    exportArticleSemanticReviewIndex(nextArgs),
    /completed semantic review|still waiting/,
  )
  const sourceTask = tasks.find((task) => task.event_id === a.event_id),
    shortlistGold = writeFixtureSidecar(
      f,
      args,
      sourceTask,
      readFixtureRequest(f.root, sourceTask),
      {
        name: "shortlist-is-not-full-registry-gold",
      },
    )
  await assert.rejects(
    prepareArticleSemanticReviews({
      ...nextArgs,
      workflowId: "private-shortlist-cannot-mint-gold",
      pilotReviewRefs: [shortlistGold.ref],
    }),
    /full current registry/,
  )
  const pilotFile = path.join(f.root, "runs/source/reviewed-claims.json"),
    pilotBytes = fs.readFileSync(pilotFile)
  fs.appendFileSync(pilotFile, " ")
  assert.throws(
    () => articleSemanticReviewStatus(nextArgs),
    /pilot source facts or reviewed links changed/,
  )
  fs.writeFileSync(pilotFile, pilotBytes)
})

test("completed private receipts preserve full-registry origins and require complete current export", async (t) => {
  const { f, args, a, b, c, held, refs, original, tasks } = await completedPrivateReuseFixture(t)
  const originStatus = articleSemanticReviewStatus(args)
  for (const item of originStatus.items.filter((item) =>
    [a.event_id, b.event_id].includes(item.event_id),
  ))
    assert.deepEqual(
      item.receipt_ref,
      refs.find((ref) => ref.path.includes(item.event_id)),
    )
  fs.renameSync(held, path.join(f.root, "runs/recover-c"))
  assert.throws(() => articleSemanticReviewStatus(args), /inputs changed.*new workflow ID/)
  const nextArgs = {
      ...args,
      workflowId: "private-full-recovered",
      eventIds: [a.event_id, b.event_id, c.event_id],
      completed_review_refs: refs,
    },
    next = await prepareArticleSemanticReviews(nextArgs)
  assert.equal(next.prepared, 1)
  assert.deepEqual(
    next.tasks.map((task) => task.event_id),
    [c.event_id],
  )
  assert.equal(next.status_counts.total, 3)
  assert.equal(next.status_counts.reviewed_links, 1)
  assert.equal(next.status_counts.reviewed_none, 1)
  await assert.rejects(exportArticleSemanticReviewIndex(nextArgs), /still waiting/)
  const task = next.tasks[0],
    request = readFixtureRequest(f.root, task)
  await submitReasoningResult(f.root, {
    ...task,
    executor: "codex",
    model: "gpt-6-luna",
    output: fixtureOutput(request),
  })
  const resumed = await resumeArticleSemanticReviews(nextArgs)
  assert.deepEqual(resumed.completed, [
    {
      event_id: c.event_id,
      status: "reviewed_links",
      receipt_ref: fixtureReceiptRef(f, nextArgs, task),
    },
  ])
  await exportArticleSemanticReviewIndex(nextArgs)
  const index = JSON.parse(
    fs.readFileSync(path.join(f.root, "data/article-semantic-review-index.json")),
  )
  for (const prior of tasks) {
    const review = index.reviews.find((row) => row.event_id === prior.event_id),
      receipt = JSON.parse(original.find((item) => item.ref.path.includes(prior.event_id)).bytes)
    assert.equal(review.workflow_id, args.workflowId)
    assert.equal(review.task_id, prior.task_id)
    assert.equal(review.request_sha256, prior.request_sha256)
    assert.equal(review.result_sha256, receipt.result_sha256)
    assert.equal(review.reviewed_at, receipt.reviewed_at)
  }
  for (const item of original)
    assert.ok(fs.readFileSync(path.join(f.root, item.ref.path)).equals(item.bytes))
  const after = articleSemanticReviewStatus(nextArgs)
  for (const event of [a.event_id, b.event_id]) {
    const row = after.items.find((row) => row.event_id === event)
    assert.deepEqual(
      row.receipt_ref,
      refs.find((ref) => ref.path.includes(event)),
    )
    assert.equal(row.reuse_basis, "completed_private_receipt_same_full_input")
  }
})

test("completed private receipts invalidate only changed article or claim inputs", async (t) => {
  for (const change of ["public-raw-bytes", "whole-input-prose", "claim-review-bytes"]) {
    await t.test(change, async (t) => {
      const { f, args, a, b, refs, original, tasks } = await completedPrivateReuseFixture(t)
      if (change === "claim-review-bytes") {
        const file = path.join(f.root, "runs/source/reviewed-claims.json"),
          record = JSON.parse(fs.readFileSync(file))
        record.claims.find((claim) => claim.review.status === "verified").review.reason =
          "A new exact synthetic claim review reason."
        fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n")
        loadApprovedOntologyInput(f.root, "source", { vault: f.vault })
      } else {
        const file = path.join(f.vault, "News", a.event_id + ".md")
        if (change === "public-raw-bytes") fs.appendFileSync(file, "\n")
        else {
          const note = parseNote(fs.readFileSync(file, "utf8"))
          note.body = note.body.replace(a.record.lead, a.record.lead + "\n\n")
          fs.writeFileSync(file, noteText(note.meta, note.body))
        }
      }
      const nextArgs = {
          ...args,
          workflowId: "private-stale-" + change,
          completedReviewRefs: refs,
        },
        next = await prepareArticleSemanticReviews(nextArgs),
        status = articleSemanticReviewStatus(nextArgs)
      assert.deepEqual(
        next.tasks.map((task) => task.event_id),
        [a.event_id],
      )
      if (change === "whole-input-prose")
        assert.notEqual(
          next.tasks[0].semantic_input_sha256,
          tasks.find((task) => task.event_id === a.event_id).semantic_input_sha256,
        )
      assert.equal(
        status.items.find((row) => row.event_id === b.event_id).reuse_basis,
        "completed_private_receipt_same_full_input",
      )
      for (const item of original)
        assert.ok(fs.readFileSync(path.join(f.root, item.ref.path)).equals(item.bytes))
    })
  }
})

test("completed private receipts invalidate exact model-policy and concept registry fingerprints", async (t) => {
  for (const change of ["policy", "registry"]) {
    await t.test(change, async (t) => {
      const { f, args, a, b, refs } = await completedPrivateReuseFixture(t)
      fs.appendFileSync(
        change === "policy" ? args.policyFile : path.join(f.vault, "Knowledge/target-concept.md"),
        "\n",
      )
      const result = await prepareArticleSemanticReviews({
        ...args,
        workflowId: "private-changed-" + change,
        completedReviewRefs: refs,
      })
      assert.deepEqual(
        result.tasks.map((task) => task.event_id).sort(),
        [a.event_id, b.event_id].sort(),
      )
      assert.equal(result.status_counts.reviewed_links + result.status_counts.reviewed_none, 0)
    })
  }
})

test("completed private refs preserve omitted identities and require a new workflow when frozen refs change", async (t) => {
  const { f, args, refs, tasks } = await completedPrivateReuseFixture(t),
    pointer = JSON.parse(
      fs.readFileSync(
        path.join(f.root, "runs", args.workflowId, "article-semantic-review/latest.json"),
      ),
    ),
    inventoryBytes = fs.readFileSync(path.join(f.root, pointer.inventory.path)),
    repeated = await prepareArticleSemanticReviews({ ...args, completedReviewRefs: [] })
  assert.equal(repeated.inventory_sha256, JSON.parse(inventoryBytes).inventory_sha256)
  assert.deepEqual(
    repeated.tasks.map((task) => task.task_id),
    tasks.map((task) => task.task_id),
  )
  assert.equal(Object.hasOwn(JSON.parse(inventoryBytes), "completed_review_refs"), false)
  assert.ok(fs.readFileSync(path.join(f.root, pointer.inventory.path)).equals(inventoryBytes))
  const nextArgs = { ...args, workflowId: "private-ref-freeze", completedReviewRefs: refs },
    frozen = await prepareArticleSemanticReviews(nextArgs),
    same = await prepareArticleSemanticReviews({ ...nextArgs, completedReviewRefs: undefined })
  assert.equal(frozen.prepared, 0)
  assert.equal(same.inventory_sha256, frozen.inventory_sha256)
  await assert.rejects(
    prepareArticleSemanticReviews({ ...nextArgs, completedReviewRefs: [] }),
    /Completed review refs changed after freeze/,
  )
  fs.appendFileSync(path.join(f.root, refs[0].path), " ")
  assert.throws(() => articleSemanticReviewStatus(nextArgs), /artifact SHA changed/)
  await assert.rejects(resumeArticleSemanticReviews(nextArgs), /artifact SHA changed/)
  await assert.rejects(exportArticleSemanticReviewIndex(nextArgs), /artifact SHA changed/)
})

function rewriteFixtureReceipt(f, ref, mutate) {
  const file = path.join(f.root, ref.path),
    value = JSON.parse(fs.readFileSync(file))
  mutate(value)
  const { receipt_sha256, ...body } = value
  value.receipt_sha256 = sha256(JSON.stringify(body))
  const bytes = JSON.stringify(value, null, 2) + "\n"
  fs.writeFileSync(file, bytes)
  return { path: ref.path, sha256: sha256(bytes) }
}

test("completed private refs reject altered artifacts, wrong identities and conflicting refs", async (t) => {
  for (const change of [
    "ref-sha",
    "receipt-schema",
    "receipt-event",
    "receipt-workflow",
    "receipt-task",
    "receipt-model",
    "receipt-executor",
    "native-result",
    "native-result-model",
    "native-result-executor",
    "native-result-schema",
    "missing-native-result",
    "native-request-schema",
    "original-prepared-marker",
    "original-row",
    "candidate-selection",
    "duplicate-path",
    "duplicate-event",
    "alias-conflict",
    "absolute-path",
    "too-many",
  ]) {
    await t.test(change, async (t) => {
      const { f, args, refs, tasks } = await completedPrivateReuseFixture(t)
      let supplied = [...refs],
        extras = {}
      const task = tasks.find((task) => refs[0].path.includes(task.event_id))
      if (change === "ref-sha") supplied[0] = { ...refs[0], sha256: "a".repeat(64) }
      else if (change.startsWith("receipt-")) {
        const field = change.slice("receipt-".length),
          values = {
            schema: "article-semantic-review/not-native",
            event: "0".repeat(16),
            workflow: "other-workflow",
            task: tasks.find((other) => other.event_id !== task.event_id).task_id,
            model: "gpt-6-sol",
            executor: "ollama",
          },
          key = { event: "event_id", workflow: "workflow_id", task: "task_id" }[field] || field
        supplied[0] = rewriteFixtureReceipt(f, refs[0], (receipt) => {
          receipt[key] = values[field]
        })
      } else if (change.startsWith("native-result")) {
        const file = path.join(f.root, "reasoning-tasks", task.task_id, "result.json"),
          value = JSON.parse(fs.readFileSync(file))
        if (change === "native-result-model") value.model = "gpt-6-sol"
        else if (change === "native-result-executor") value.executor = "ollama"
        else if (change === "native-result-schema")
          value.output.schema = "other-semantic-proposal/v1"
        else value.output.review_reason += " Changed after native receipt."
        const { result_sha256, ...body } = value
        value.result_sha256 = sha256(JSON.stringify(body))
        fs.writeFileSync(file, JSON.stringify(value) + "\n")
      } else if (change === "missing-native-result") {
        fs.unlinkSync(path.join(f.root, "reasoning-tasks", task.task_id, "result.json"))
      } else if (change === "native-request-schema") {
        const file = path.join(f.root, "reasoning-tasks", task.task_id, "request.json"),
          value = JSON.parse(fs.readFileSync(file))
        value.input.schema.properties.schema.enum = ["other-schema/v1"]
        fs.writeFileSync(file, JSON.stringify(value) + "\n")
      } else if (change === "original-prepared-marker") {
        const file = path.join(
            f.root,
            "runs",
            args.workflowId,
            "article-semantic-review/prepared",
            task.event_id + ".json",
          ),
          value = JSON.parse(fs.readFileSync(file))
        value.approval_selection_sha256 = "a".repeat(64)
        fs.writeFileSync(file, JSON.stringify(value) + "\n")
      } else if (change === "original-row" || change === "candidate-selection") {
        const pointerFile = path.join(
            f.root,
            "runs",
            args.workflowId,
            "article-semantic-review/latest.json",
          ),
          pointer = JSON.parse(fs.readFileSync(pointerFile)),
          file = path.join(f.root, pointer.inventory.path),
          value = JSON.parse(fs.readFileSync(file)),
          row = value.items.find((row) => row.event_id === task.event_id)
        if (change === "candidate-selection") {
          const candidateFile = path.join(
              f.root,
              "runs",
              args.workflowId,
              "article-semantic-review/candidate-selections",
              row.event_id + "-" + row.approval_files_sha256 + ".json",
            ),
            candidate = JSON.parse(fs.readFileSync(candidateFile))
          candidate.query_sha256 = "b".repeat(64)
          const { selection_sha256, ...body } = candidate
          candidate.selection_sha256 = sha256(JSON.stringify(body))
          fs.writeFileSync(candidateFile, JSON.stringify(candidate) + "\n")
        } else {
          row.task_id = tasks.find((other) => other.event_id !== task.event_id).task_id
          const { inventory_sha256, ...body } = value
          value.inventory_sha256 = sha256(JSON.stringify(body))
          const bytes = JSON.stringify(value) + "\n"
          fs.writeFileSync(file, bytes)
          pointer.inventory.sha256 = sha256(bytes)
          fs.writeFileSync(pointerFile, JSON.stringify(pointer) + "\n")
        }
      } else if (change === "duplicate-path") supplied.push(refs[0])
      else if (change === "duplicate-event") {
        const file = "inputs/copied-native-receipt.json",
          bytes = fs.readFileSync(path.join(f.root, refs[0].path))
        fs.writeFileSync(path.join(f.root, file), bytes)
        supplied.push({ path: file, sha256: sha256(bytes) })
      } else if (change === "alias-conflict") extras = { completed_review_refs: [] }
      else if (change === "absolute-path")
        supplied[0] = { ...refs[0], path: path.join(f.root, refs[0].path) }
      else if (change === "too-many") supplied = Array.from({ length: 1001 }, () => refs[0])
      const nextArgs = {
        ...args,
        workflowId: "private-reject-" + change,
        completedReviewRefs: supplied,
        ...extras,
      }
      await assert.rejects(
        prepareArticleSemanticReviews(nextArgs),
        /Completed|completed|semantic|Semantic|Reasoning|Prepared|Distinct|aliases|schema|Codex/,
      )
      assert.equal(
        fs.existsSync(
          path.join(f.root, "runs", nextArgs.workflowId, "article-semantic-review/latest.json"),
        ),
        false,
      )
      assert.equal(
        fs.existsSync(
          path.join(f.root, "runs", nextArgs.workflowId, "article-semantic-review/prepared"),
        ),
        false,
      )
    })
  }
})

test("completed private refs retain original optional native selection bindings", async (t) => {
  for (const originalMarker of [false, true]) {
    await t.test(String(originalMarker), async (t) => {
      const { f, args, a, refs, tasks, choice } = await completedPrivateReuseFixture(t, {
          nativeChoice: originalMarker,
        }),
        originalTask = tasks.find((task) => task.event_id === a.event_id),
        preparedFile = path.join(
          f.root,
          "runs",
          args.workflowId,
          "article-semantic-review/prepared",
          a.event_id + ".json",
        ),
        originalPrepared = fs.readFileSync(preparedFile),
        originalRequest = fs.readFileSync(
          path.join(f.root, "reasoning-tasks", originalTask.task_id, "request.json"),
        )
      if (!originalMarker) cloneFixtureNativeApproval(f, "source", "original-choice-alias")
      const current = fixtureNativeInputChoice(f, {
          eventId: a.event_id,
          runs: ["source", "original-choice-alias"],
          selectedRun: "source",
          name: "current-completed-choice",
        }),
        nextArgs = {
          ...args,
          workflowId: "private-marker-" + originalMarker,
          completedReviewRefs: refs,
          approvalSelectionRefs: [current.ref],
        },
        result = await prepareArticleSemanticReviews(nextArgs)
      assert.equal(result.prepared, 0)
      const status = articleSemanticReviewStatus(nextArgs),
        row = status.items.find((row) => row.event_id === a.event_id)
      assert.equal(row.approval_selection_sha256, current.ref.sha256)
      assert.equal(row.task_id, originalTask.task_id)
      assert.ok(fs.readFileSync(preparedFile).equals(originalPrepared))
      assert.ok(
        fs
          .readFileSync(path.join(f.root, "reasoning-tasks", originalTask.task_id, "request.json"))
          .equals(originalRequest),
      )
      assert.equal(
        JSON.parse(originalPrepared).approval_selection_sha256,
        originalMarker ? choice.ref.sha256 : undefined,
      )
      assert.notEqual(JSON.parse(originalPrepared).approval_selection_sha256, current.ref.sha256)
    })
  }
})

function archivePrivateReuseFixture(f) {
  const parent = "private-reuse-synthetic-parent"
  storageAction(f.root, "prepare", { parent_id: parent, minimum_payload_bytes: 0 })
  const bundles = storageAction(f.root, "pending").uploads
  for (const bundle of bundles)
    storageAction(f.root, "verify", {
      bundle_id: bundle.id,
      metadata: {
        id: "synthetic-" + bundle.id,
        title: bundle.name,
        mime_type: "application/zip",
        size: String(bundle.bytes),
        parent_ids: [parent],
        modified_time: new Date().toISOString(),
        shared: false,
      },
      observed_at: new Date().toISOString(),
      download_path: bundle.local_path,
    })
  storageAction(f.root, "enable")
  return bundles
}

test("completed private cold refs and native evidence require exact storage recovery without available-run fallback", async (t) => {
  for (const coldKind of ["receipt", "native-claims"]) {
    await t.test(coldKind, async (t) => {
      const { f, args, a, refs, original } = await completedPrivateReuseFixture(t)
      cloneFixtureNativeApproval(f, "source", "available-native-alias")
      const choice = fixtureNativeInputChoice(f, {
          eventId: a.event_id,
          runs: ["source", "available-native-alias"],
          selectedRun: "source",
          name: "cold-completed-choice",
        }),
        bundles = archivePrivateReuseFixture(f),
        target =
          coldKind === "receipt"
            ? refs.find((ref) => ref.path.includes(a.event_id)).path
            : "runs/source/reviewed-claims.json",
        bytes = fs.readFileSync(path.join(f.root, target))
      fs.unlinkSync(path.join(f.root, target))
      const waitingArgs = {
        ...args,
        workflowId: "private-cold-" + coldKind,
        completedReviewRefs: refs,
        ...(coldKind === "receipt" ? { approvalSelectionRefs: [choice.ref] } : {}),
      }
      let pending
      await assert.rejects(prepareArticleSemanticReviews(waitingArgs), (error) => {
        assert.equal(error.code, "STORAGE_PENDING")
        pending = error.storage_request.requests.find((request) => request.path === target)
        assert.ok(pending)
        assert.ok(pending.file_id.startsWith("synthetic-"))
        return true
      })
      assert.equal(
        fs.existsSync(
          path.join(f.root, "runs", waitingArgs.workflowId, "article-semantic-review/latest.json"),
        ),
        false,
      )
      const bundle = bundles.find((bundle) => bundle.id === pending.bundle_id)
      storageAction(f.root, "hydrate", {
        bundle_id: bundle.id,
        download_path: bundle.local_path,
        paths: [target],
      })
      assert.ok(fs.readFileSync(path.join(f.root, target)).equals(bytes))
      const restored = await prepareArticleSemanticReviews({
        ...waitingArgs,
        workflowId: "private-restored-" + coldKind,
        approvalSelectionRefs: [choice.ref],
      })
      assert.equal(restored.prepared, 0)
      assert.equal(restored.status_counts.reviewed_links, 1)
      assert.equal(restored.status_counts.reviewed_none, 1)
      for (const item of original)
        assert.ok(fs.readFileSync(path.join(f.root, item.ref.path)).equals(item.bytes))
    })
  }
})

test("completed private refs revalidate source claim grounding after coherent native result and receipt rehashing", async (t) => {
  const { f, args, a, refs, tasks } = await completedPrivateReuseFixture(t),
    task = tasks.find((task) => task.event_id === a.event_id),
    resultFile = path.join(f.root, "reasoning-tasks", task.task_id, "result.json"),
    result = JSON.parse(fs.readFileSync(resultFile))
  result.output.links[0].evidence_claim_ids = ["not-a-verified-public-claim"]
  const { result_sha256, ...body } = result
  result.result_sha256 = sha256(JSON.stringify(body))
  fs.writeFileSync(resultFile, JSON.stringify(result) + "\n")
  const changedRef = rewriteFixtureReceipt(
    f,
    refs.find((ref) => ref.path.includes(a.event_id)),
    (receipt) => {
      receipt.output = result.output
      receipt.links[0].evidence_claim_ids = [...result.output.links[0].evidence_claim_ids]
      receipt.result_sha256 = result.result_sha256
    },
  )
  await assert.rejects(
    prepareArticleSemanticReviews({
      ...args,
      workflowId: "private-rehashed-unbound-claim",
      completedReviewRefs: refs.map((ref) => (ref.path === changedRef.path ? changedRef : ref)),
    }),
    /Semantic relation cites a claim not verified in public prose/,
  )
})

test("completed private refs do not bypass corrected full-registry pilot labels", async (t) => {
  const { f, args, ref, review, task } = await completedSourceFixture(t)
  review.links[0].concept_id = "target-concept"
  const file = "inputs/corrected-full-registry-labels.json",
    bytes = JSON.stringify(review) + "\n"
  fs.writeFileSync(path.join(f.root, file), bytes)
  const result = await prepareArticleSemanticReviews({
    ...args,
    workflowId: "private-corrected-pilot-labels",
    pilotReviewRefs: [{ path: file, sha256: sha256(bytes) }],
    completedReviewRefs: [fixtureReceiptRef(f, args, task)],
  })
  assert.equal(result.prepared, 1)
  assert.notEqual(result.tasks[0].task_id, task.task_id)
  assert.equal(result.status_counts.reviewed_links, 0)
  assert.equal(ref.path.includes("pilot"), true)
})
