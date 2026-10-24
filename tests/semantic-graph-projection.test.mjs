import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { assembleGraph, relatedNews } from "../web/graph-model.mjs"
import {
  ARTICLE_SEMANTIC_INDEX_SCHEMA,
  articlePublicFingerprint,
  articleRelationRoles,
  assertArticleSemanticReviewIndex,
} from "../web/article-semantic-index.mjs"
import { articleSearchText, buildGraph } from "../scripts/knowledge.mjs"
import { noteText } from "../scripts/garden.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"

const privateText = "PRIVATE_SOURCE_KEYWORD_TIMING_REVIEW"
const concept = (id, decision = "include") => ({
  id,
  label: id,
  title: id,
  aliases: [],
  slug: "knowledge/" + id,
  definition: "공식 원문으로 작동 방식과 사용 조건을 설명한 전문 개념이다.",
  sources: ["https://example.org/" + id],
  keywords: [privateText],
  source_text: privateText,
  metrics: { note: privateText },
  mapReview:
    decision === "unreviewed"
      ? undefined
      : {
          decision,
          kind: "mechanism",
          reason: privateText,
          reviewed: "2026-10-23",
        },
})
const article = (id, extra = {}) => ({
  id: "news:" + id,
  title: id,
  date: "2026-10-23",
  slug: "news/" + id,
  description: "검증된 공개 설명이다.",
  conceptIds: [],
  text: privateText,
  ...extra,
})

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "semantic-graph-")),
    vault = path.join(root, "vault"),
    indexFile = path.join(root, "index.json"),
    notes = new Map()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const directory of ["Knowledge", "News"])
    fs.mkdirSync(path.join(vault, directory), { recursive: true })
  for (const [id, decision] of [
    ["mechanism", "include"],
    ["excluded", "exclude"],
    ["pending", "unreviewed"],
  ]) {
    const n = concept(id, decision),
      bytes = noteText(
        {
          entry_type: "concept",
          concept_id: id,
          title: n.title,
          label: n.label,
          keywords: n.keywords,
          aliases: n.aliases,
          verified_sources: n.sources,
          ...(n.mapReview ? { map_review: n.mapReview } : {}),
        },
        "## 한 문장 정의\n\n" + n.definition,
      )
    fs.writeFileSync(path.join(vault, "Knowledge", id + ".md"), bytes)
    notes.set(id, sha256(bytes))
  }
  const reviews = []
  const writeArticle = (eventId, extra = {}) => {
    const title = "확인한 메커니즘 발표 " + eventId,
      body = "# " + title + "\n\n검증한 사실의 작동 방식을 공개 문장으로 설명한다.",
      sources = ["https://example.org/article/" + eventId]
    fs.writeFileSync(
      path.join(vault, "News", eventId + ".md"),
      noteText(
        {
          type: "news",
          event_id: eventId,
          title,
          published_at: "2026-10-23",
          review_status: "verified",
          sources,
          ...extra,
        },
        body,
      ),
    )
    return {
      event_id: eventId,
      title,
      published_at: "2026-10-23",
      source_urls: sources,
      prose: [title, articleSearchText(body)].join("\n"),
    }
  }
  const addReview = (eventId, links, extra = {}) => {
    const publicArticle = writeArticle(eventId, extra)
    const review = {
      event_id: eventId,
      status: links.length ? "reviewed_links" : "reviewed_none",
      reviewed_at: "2026-10-23T06:00:00Z",
      workflow_id: "semantic-graph-fixture-v1",
      approved_run: "native-fixture",
      semantic_input_sha256: "a".repeat(64),
      executor: "codex",
      model: "gpt-6-luna",
      task_id: "reasoning-" + "b".repeat(64),
      request_sha256: "c".repeat(64),
      result_sha256: "d".repeat(64),
      receipt_sha256: "e".repeat(64),
      article_public_sha256: sha256(articlePublicFingerprint(publicArticle)),
      approval_files_sha256: "f".repeat(64),
      concept_registry_sha256: "0".repeat(64),
      policy_sha256: "1".repeat(64),
      links: links.map(
        ({
          concept_id = "mechanism",
          role = "topic",
          evidence_claim_ids = ["public-claim-1"],
        }) => ({
          concept_id,
          role,
          evidence_claim_ids,
          reason: "공개 검증 주장으로 이 개념의 역할을 확인했다.",
          concept_path: "Knowledge/" + concept_id + ".md",
          concept_sha256: notes.get(concept_id),
        }),
      ),
    }
    reviews.push(review)
    fs.writeFileSync(indexFile, JSON.stringify({ schema: ARTICLE_SEMANTIC_INDEX_SCHEMA, reviews }))
    return review
  }
  return { vault, indexFile, writeArticle, addReview }
}

test("graph output preserves all semantic roles and public claim refs while excluding private fields", () => {
  const graph = assembleGraph(
    [concept("mechanism")],
    articleRelationRoles.map((role) =>
      article(role, {
        conceptLinks: [
          {
            conceptId: "mechanism",
            role,
            evidenceClaimIds: ["public-claim-1"],
            reason: privateText,
          },
        ],
        semanticReviewStatus: "reviewed_links",
        keyword_candidates: [privateText],
        source_text: privateText,
        metrics: { elapsed_ms: 123, note: privateText },
        review_reason: privateText,
        workflow_id: privateText,
      }),
    ),
  )
  assert.equal(JSON.stringify(graph).includes(privateText), false)
  assert.ok(graph.nodes.every((node) => !Object.hasOwn(node, "learningReason")))
  for (const a of graph.articles) {
    assert.deepEqual(a.matches, [
      {
        termId: "mechanism",
        basis: "semantic_review",
        role: a.title,
        evidenceClaimIds: ["public-claim-1"],
      },
    ])
  }
  assert.deepEqual(
    relatedNews(graph, "mechanism").map((a) => a.relationRole),
    articleRelationRoles,
  )
})

test("reviewed relations cannot attach news to excluded or unreviewed map nodes", () => {
  const graph = assembleGraph(
    [concept("visible"), concept("excluded", "exclude"), concept("pending", "unreviewed")],
    [
      article("mixed", {
        semanticReviewStatus: "reviewed_links",
        conceptLinks: ["visible", "excluded", "pending"].map((conceptId) => ({
          conceptId,
          role: "topic",
          evidenceClaimIds: ["claim"],
        })),
      }),
      article("only-excluded", {
        semanticReviewStatus: "reviewed_links",
        conceptLinks: [{ conceptId: "excluded", role: "topic" }],
      }),
    ],
  )
  assert.deepEqual(
    graph.nodes.map((n) => n.id),
    ["visible"],
  )
  assert.deepEqual(graph.articles[0].termIds, ["visible"])
  assert.deepEqual(graph.articles[1].termIds, [])
})

test("unreviewed proposals never create relations and reviewed-none rejects stale assignments", () => {
  const graph = assembleGraph(
    [concept("mechanism")],
    [
      article("pending", {
        semanticReviewStatus: "unreviewed",
        conceptIds: ["mechanism"],
        conceptLinks: [{ conceptId: "mechanism", role: "topic" }],
        relation_candidates: [{ concept_id: "mechanism", role: "topic" }],
      }),
      article("none", {
        semanticReviewStatus: "reviewed_none",
        relation_candidates: [{ concept_id: "mechanism" }],
      }),
    ],
  )
  assert.ok(graph.articles.every((a) => !a.termIds.length))
  assert.equal(graph.articles[1].semanticReviewStatus, "reviewed_none")
  assert.throws(
    () =>
      assembleGraph(
        [concept("mechanism")],
        [
          article("invalid", {
            semanticReviewStatus: "reviewed_none",
            conceptIds: ["mechanism"],
          }),
        ],
      ),
    /Reviewed-empty/,
  )
  for (const evidenceClaimIds of [[], [""], ["same", "same"], "claim"]) {
    assert.throws(
      () =>
        assembleGraph(
          [concept("mechanism")],
          [
            article("bad-evidence", {
              conceptLinks: [{ conceptId: "mechanism", role: "topic", evidenceClaimIds }],
            }),
          ],
        ),
      /claim|evidence/i,
    )
  }
})

test("actual buildGraph index path preserves roles, claims, explicit none and map exclusions", (t) => {
  const f = fixture(t)
  for (const [i, role] of articleRelationRoles.entries())
    f.addReview((i + 1).toString(16).padStart(16, "0"), [{ role }])
  f.addReview("0000000000000005", [], { concept_ids: ["mechanism"] })
  f.addReview("0000000000000006", [{ concept_id: "excluded" }, { concept_id: "pending" }])
  const graph = buildGraph(f.vault, { semanticIndexFile: f.indexFile })
  for (const [i, role] of articleRelationRoles.entries()) {
    const a = graph.articles.find(
      (row) => row.id === "news:" + (i + 1).toString(16).padStart(16, "0"),
    )
    assert.deepEqual(a.matches, [
      { termId: "mechanism", basis: "semantic_review", role, evidenceClaimIds: ["public-claim-1"] },
    ])
  }
  const none = graph.articles.find((a) => a.id === "news:0000000000000005")
  assert.equal(none.semanticReviewStatus, "reviewed_none")
  assert.deepEqual(none.termIds, [])
  assert.deepEqual(graph.articles.find((a) => a.id === "news:0000000000000006").termIds, [])
  assert.equal(JSON.stringify(graph).includes(privateText), false)
  assert.ok(graph.nodes.every((node) => !Object.hasOwn(node, "learningReason")))
})

test("actual native metadata path preserves verified claims and excludes pending proposals", (t) => {
  const f = fixture(t)
  f.writeArticle("0000000000000001", {
    concept_ids: ["mechanism"],
    semantic_review_status: "reviewed_links",
    concept_links: [
      { concept_id: "mechanism", role: "application", evidence_claim_ids: ["native-public-claim"] },
    ],
  })
  f.writeArticle("0000000000000002", {
    review_status: "unreviewed",
    concept_ids: ["mechanism"],
    semantic_review_status: "reviewed_links",
    concept_links: [
      { concept_id: "mechanism", role: "topic", evidence_claim_ids: ["pending-claim"] },
    ],
  })
  const graph = buildGraph(f.vault, { semanticIndexFile: f.indexFile })
  assert.deepEqual(graph.articles.find((a) => a.id === "news:0000000000000001").matches, [
    {
      termId: "mechanism",
      basis: "semantic_review",
      role: "application",
      evidenceClaimIds: ["native-public-claim"],
    },
  ])
  assert.deepEqual(graph.articles.find((a) => a.id === "news:0000000000000002").termIds, [])
})

test("semantic index rejects private fields and proposal-only data before public graph assembly", (t) => {
  const f = fixture(t),
    review = f.addReview("0000000000000001", [{ role: "topic" }]),
    index = { schema: ARTICLE_SEMANTIC_INDEX_SCHEMA, reviews: [review] }
  assert.equal(assertArticleSemanticReviewIndex(index), index)
  for (const extra of [
    { metrics: {} },
    { keyword_candidates: [] },
    { relation_candidates: [] },
    { source_text: privateText },
  ]) {
    assert.throws(
      () => assertArticleSemanticReviewIndex({ ...index, reviews: [{ ...review, ...extra }] }),
      /semantic review record/,
    )
  }
  assert.throws(
    () =>
      assertArticleSemanticReviewIndex({
        ...index,
        reviews: [{ ...review, status: "unreviewed" }],
      }),
    /semantic review record/,
  )
  assert.throws(
    () =>
      assertArticleSemanticReviewIndex({
        ...index,
        reviews: [{ ...review, links: [{ ...review.links[0], evidence_claim_ids: [] }] }],
      }),
    /concept relation/,
  )
})
