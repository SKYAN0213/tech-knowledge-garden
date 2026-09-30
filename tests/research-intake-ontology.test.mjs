import test from "node:test"
import assert from "node:assert/strict"
import {
  projectIntakeOntology,
  relatedCandidateKeys,
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

test("same content on different publication days remains a separate review candidate", () => {
  const graph = projectIntakeOntology([
    candidate("first", "https://example.org/one"),
    candidate("second", "https://example.org/two", { source_published_at: "2026-09-30" }),
  ])
  assert.deepEqual(relatedCandidateKeys(graph, "first"), [])
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
