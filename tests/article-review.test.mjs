import test from "node:test"
import assert from "node:assert/strict"
import { articleReview } from "../scripts/article-review.mjs"
const record = {
  title: "Revised title",
  event_id: "1234567890abcdef",
  review_status: "verified",
  published_at: "2026-09-11",
  reviewed_at: "2026-09-13",
  concept_ids: ["kv-cache"],
}
const issue = (r) => ({ meta: { article_reviews: [r] } })
test("explicit event ID survives source and title edits; private notes do not escape", () => {
  const result = articleReview(
    issue({ ...record, reason: "private review" }),
    record.title,
    "aaaaaaaaaaaaaaaa",
  )
  assert.equal(result.event_id, record.event_id)
  assert.equal(result.reason, undefined)
})
test("legacy article is not silently verified", () =>
  assert.equal(articleReview({ meta: {} }, "old", "aaaaaaaaaaaaaaaa").review_status, "unreviewed"))
test("invalid review evidence fails closed", () => {
  for (const change of [
    { published_at: "2026-02-30" },
    { reviewed_at: "2026-09-10" },
    { review_status: "unreviewed" },
    { concept_ids: ["kv-cache", "kv-cache"] },
  ])
    assert.throws(() =>
      articleReview(issue({ ...record, ...change }), record.title, "aaaaaaaaaaaaaaaa"),
    )
})
import { excludedEventIds, assertPublicArticles } from "../scripts/article-review.mjs"
test("excluded content blocks generation until removed from every public appearance", () => {
  const ids = excludedEventIds([{ meta: { excluded_events: [record.event_id] } }])
  assert.throws(() => assertPublicArticles([{ id: record.event_id }], ids), /privately archived/)
  assert.throws(() =>
    assertPublicArticles(
      [{ id: "aaaaaaaaaaaaaaaa", review: { review_status: "excluded" } }],
      new Set(),
    ),
  )
  assert.doesNotThrow(() => assertPublicArticles([], ids))
  assert.throws(() => excludedEventIds([{ meta: { excluded_events: ["../escape"] } }]))
})
