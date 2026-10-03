import test from "node:test"
import assert from "node:assert/strict"
import {
  projectIntakeOntology,
  relatedCandidateKeys,
  summarizeIntakeOntology,
} from "../scripts/research/intake-ontology.mjs"
import { validateIdentities } from "../scripts/editorial.mjs"

const candidate = (key, url, more = {}) => ({
  key,
  title: "One announcement",
  source_urls: [url],
  source_published_at: "2026-09-29",
  review_status: "unreviewed",
  article_source_version_id: `${key.padEnd(20, "0")}:${"a".repeat(64)}`,
  article_content_sha256: "b".repeat(64),
  ...more,
})

test("intake ontology keeps distinct originals and flags identical extracted content for review", () => {
  const graph = projectIntakeOntology([
    candidate("second", "https://example.org/en/story", {
      event_id: "abcdef0123456789",
      approval: { approved_run: "reviewed" },
    }),
    candidate("first", "https://example.org/ko/story"),
  ])
  assert.equal(graph.schema, "research-intake-ontology/v1")
  assert.equal(graph.nodes.filter((node) => node.type === "Source").length, 2)
  assert.deepEqual(relatedCandidateKeys(graph, "first"), ["second"])
  assert.deepEqual(relatedCandidateKeys(graph, "second"), ["first"])
  assert.deepEqual(
    graph.relations.filter((relation) => relation.type === "linkedEvent"),
    [
      {
        from: "candidate:second",
        type: "linkedEvent",
        to: "event:abcdef0123456789",
        basis: "editorial_approval",
      },
    ],
  )
  assert.equal(
    graph.relations.find((relation) => relation.type === "sameExtractedContentCandidate").decision,
    "review_required",
  )
  assert.deepEqual(
    graph,
    projectIntakeOntology([
      candidate("first", "https://example.org/ko/story"),
      candidate("second", "https://example.org/en/story", {
        event_id: "abcdef0123456789",
        approval: { approved_run: "reviewed" },
      }),
    ]),
  )
})

test("intake ontology surfaces one canonical URL in two candidate identities", () => {
  const graph = projectIntakeOntology([
    candidate("first", "https://example.org/story?utm_source=feed"),
    candidate("second", "https://example.org/story#section"),
  ])
  assert.equal(graph.nodes.filter((node) => node.type === "Source").length, 1)
  assert.deepEqual(
    graph.relations.filter((relation) => relation.type === "sharedCanonicalSourceCandidate"),
    [
      {
        from: "candidate:first",
        type: "sharedCanonicalSourceCandidate",
        to: "candidate:second",
        basis: "https://example.org/story",
        decision: "review_required",
      },
    ],
  )
})

test("invalid and missing content fingerprints are not treated as duplicate evidence", () => {
  const graph = projectIntakeOntology([
    candidate("valid", "https://example.org/valid", {
      article_content_sha256: "c".repeat(64),
    }),
    candidate("missing", "https://example.org/missing", {
      article_content_sha256: undefined,
    }),
    candidate("invalid", "https://example.org/invalid", {
      article_content_sha256: "same-invalid-value",
    }),
    candidate("non-string", "https://example.org/non-string", {
      article_content_sha256: 123,
    }),
  ])

  const summary = summarizeIntakeOntology(graph)
  assert.equal(
    graph.relations.some((relation) => relation.type === "sameExtractedContentCandidate"),
    false,
  )
  assert.deepEqual(
    {
      candidate_count: summary.candidate_count,
      fingerprinted_candidate_count: summary.fingerprinted_candidate_count,
      missing_content_fingerprint_count: summary.missing_content_fingerprint_count,
      invalid_content_fingerprint_count: summary.invalid_content_fingerprint_count,
    },
    {
      candidate_count: 4,
      fingerprinted_candidate_count: 1,
      missing_content_fingerprint_count: 1,
      invalid_content_fingerprint_count: 2,
    },
  )
})

test("intake ontology flags same-publisher same-day multilingual items for review only", () => {
  const graph = projectIntakeOntology([
    {
      key: "english-release",
      title: "Doosan Robotics Launches AI Palletizing at Automate 2026",
      source_urls: ["https://www.doosanrobotics.com/en/about/promotion/news/palletizing"],
      source_published_at: "2026-06-22",
      review_status: "unreviewed",
      discovery: [{ language: "en" }],
    },
    {
      key: "korean-release",
      title: "두산로보틱스, AI 팔레타이징 솔루션 공개",
      source_urls: ["https://www.doosanrobotics.com/kr/about/promotion/news/팔레타이징"],
      source_published_at: "2026-06-22",
      review_status: "unreviewed",
      discovery: [{ language: "ko" }],
    },
    {
      key: "same-language-release",
      title: "Another same-day announcement",
      source_urls: ["https://www.doosanrobotics.com/en/about/promotion/news/other"],
      source_published_at: "2026-06-22",
      review_status: "unreviewed",
      discovery: [{ language: "en" }],
    },
    {
      key: "next-day-release",
      title: "Different release",
      source_urls: ["https://www.doosanrobotics.com/kr/about/promotion/news/other"],
      source_published_at: "2026-06-23",
      review_status: "unreviewed",
      discovery: [{ language: "ko" }],
    },
  ])
  const relation = graph.relations.find(
    (item) => item.type === "samePublisherDayCrossLanguageCandidate",
  )
  assert.deepEqual(relation, {
    from: "candidate:english-release",
    type: "samePublisherDayCrossLanguageCandidate",
    to: "candidate:korean-release",
    basis: "doosanrobotics.com|2026-06-22",
    decision: "review_required",
  })
  assert.deepEqual(relatedCandidateKeys(graph, "english-release"), ["korean-release"])
  assert.equal(
    graph.relations.some((item) => item.to === "candidate:next-day-release"),
    false,
  )
  assert.equal(
    graph.relations.some(
      (item) =>
        item.type === "samePublisherDayCrossLanguageCandidate" &&
        [item.from, item.to].includes("candidate:english-release") &&
        [item.from, item.to].includes("candidate:same-language-release"),
    ),
    false,
  )
})

test("a validated same-event source alias resolves the multilingual review lead", () => {
  const koreanUrl = "https://www.doosanrobotics.com/kr/about/promotion/news/ceo-appointment"
  const englishUrl = "https://www.doosanrobotics.com/en/about/promotion/news/ceo-appointment"
  const graph = projectIntakeOntology(
    [
      {
        key: "korean-release",
        title: "두산로보틱스 신임 CEO 선임",
        source_urls: [koreanUrl],
        source_published_at: "2026-10-01",
        discovery: [{ language: "ko" }],
      },
      {
        key: "english-release",
        title: "Doosan Robotics Appoints New CEO",
        source_urls: [englishUrl],
        source_published_at: "2026-10-01",
        discovery: [{ language: "en" }],
      },
    ],
    {
      sameEventAliases: new Map([
        [
          "https://www.doosanrobotics.com/kr/about/promotion/news/ceo-appointment",
          { candidate_key: "english-release", resolution_run: "reviewed-source-alt-v1" },
        ],
      ]),
    },
  )
  assert.deepEqual(
    graph.relations.find((item) => item.type === "samePublisherDayCrossLanguageCandidate"),
    {
      from: "candidate:english-release",
      type: "samePublisherDayCrossLanguageCandidate",
      to: "candidate:korean-release",
      basis: "doosanrobotics.com|2026-10-01",
      decision: "same_event_source_resolution",
      resolution_run: "reviewed-source-alt-v1",
      resolved_source_url: "https://www.doosanrobotics.com/kr/about/promotion/news/ceo-appointment",
    },
  )
  assert.equal(
    graph.relations.some((item) => item.decision === "review_required"),
    false,
  )
})

test("a shared verified approval resolves a cross-language same-day review signal", () => {
  const approved = (key, language, url) => {
    const item = candidate(key, url, {
      event_id: "cd6214ef65043caa",
      review_status: "verified",
      source_published_at: "2026-06-22",
      discovery: [{ language }],
    })
    item.title = `${key} announcement`
    item.article_content_sha256 = `${key === "english-release" ? "a" : "b"}`.repeat(64)
    item.article_parse_id = `${key}-parse`
    item.approval = {
      approved_run: "bilingual-article-v1",
      article_sha256: "c".repeat(64),
      source_version_id: item.article_source_version_id,
      parse_id: item.article_parse_id,
      article_content_sha256: item.article_content_sha256,
    }
    return item
  }
  const graph = projectIntakeOntology([
    approved("english-release", "en", "https://www.doosanrobotics.com/en/palletizing"),
    approved("korean-release", "ko", "https://www.doosanrobotics.com/kr/palletizing"),
  ])
  assert.deepEqual(
    graph.relations.find((item) => item.type === "samePublisherDayCrossLanguageCandidate"),
    {
      from: "candidate:english-release",
      type: "samePublisherDayCrossLanguageCandidate",
      to: "candidate:korean-release",
      basis: "doosanrobotics.com|2026-06-22",
      decision: "same_approved_event",
    },
  )
  assert.equal(
    graph.relations.some((item) => item.decision === "review_required"),
    false,
  )
})

test("a shared event ID without the same exact approval remains a review lead", () => {
  const approved = (key, language, url) => {
    const item = candidate(key, url, {
      event_id: "cd6214ef65043caa",
      review_status: "verified",
      source_published_at: "2026-06-22",
      discovery: [{ language }],
    })
    item.title = `${key} announcement`
    item.article_content_sha256 = `${key === "english-release" ? "a" : "b"}`.repeat(64)
    item.article_parse_id = `${key}-parse`
    item.approval = {
      approved_run: "bilingual-article-v1",
      article_sha256: `${key === "english-release" ? "c" : "d"}`.repeat(64),
      source_version_id: item.article_source_version_id,
      parse_id: item.article_parse_id,
      article_content_sha256: item.article_content_sha256,
    }
    return item
  }
  const graph = projectIntakeOntology([
    approved("english-release", "en", "https://www.doosanrobotics.com/en/palletizing"),
    approved("korean-release", "ko", "https://www.doosanrobotics.com/kr/palletizing"),
  ])
  assert.equal(
    graph.relations.find((item) => item.type === "samePublisherDayCrossLanguageCandidate").decision,
    "review_required",
  )
})

test("same extracted content on different publication days is still flagged for review", () => {
  const graph = projectIntakeOntology([
    candidate("first", "https://example.org/one"),
    candidate("second", "https://example.org/two", { source_published_at: "2026-09-30" }),
  ])
  assert.deepEqual(relatedCandidateKeys(graph, "first"), ["second"])
  assert.deepEqual(
    graph.relations.filter((relation) => relation.type === "sameExtractedContentCandidate"),
    [
      {
        from: "candidate:first",
        type: "sameExtractedContentCandidate",
        to: "candidate:second",
        basis: "b".repeat(64),
        decision: "review_required",
      },
    ],
  )
})

test("matching title and day suggests review even when the extracted bodies differ", () => {
  const graph = projectIntakeOntology([
    candidate("first", "https://example.org/one"),
    candidate("second", "https://example.org/two", { article_content_sha256: "c".repeat(64) }),
  ])
  assert.deepEqual(relatedCandidateKeys(graph, "first"), ["second"])
  assert.equal(
    graph.relations.filter((relation) => relation.type === "sameTitleDayCandidate").length,
    1,
  )
  assert.equal(
    graph.relations.filter((relation) => relation.type === "sameExtractedContentCandidate").length,
    0,
  )
  assert.equal(graph.relations.filter((relation) => relation.type === "linkedEvent").length, 0)
})

test("publication rejects two event IDs with one title and original day", () => {
  const item = (id, title, day) => ({ id, title, review: { published_at: day } })
  assert.throws(
    () =>
      validateIdentities([
        { items: [item("event-one", "Example, 발표", "2026-09-29")] },
        { items: [item("event-two", "Example 발표", "2026-09-29")] },
      ]),
    /matching title and original day assigned to different published events/,
  )
  assert.doesNotThrow(() =>
    validateIdentities([
      { items: [item("event-one", "Example 발표", "2026-09-29")] },
      { items: [item("event-two", "Example 발표", "2026-09-30")] },
    ]),
  )
})
