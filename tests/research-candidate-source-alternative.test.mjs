import test from "node:test"
import assert from "node:assert/strict"
import { buildCandidateSourceAlternativeResolution } from "../scripts/research/candidate-source-alternative.mjs"

const candidate = {
  key: "candidate-1",
  source_urls: ["https://reuters.com/original-release/"],
  source_published_at: "2026-09-12",
  review_status: "deferred",
}
const parse = {
  status: "extracted",
  title: "Reuters and CuttingRoom integration",
  dates: { published_at: null, observed_at: "2026-10-01T00:00:00.000Z" },
  blocks: [{ text: "Announced on 12 September was a direct integration." }],
  parse_id: "parse-1",
  source_version_id: "source-1:body-1",
}
const document = {
  original_url: "https://reutersagency.com/alternate-story",
  source_id: "source-1",
  source_version_id: "source-1:body-1",
  body_sha256: "a".repeat(64),
  fetch_status: "captured",
  observed_at: "2026-10-01T00:00:00.000Z",
}
const review = {
  schema: "research-candidate-source-alternative-review/v1",
  candidate_key: candidate.key,
  original_url: candidate.source_urls[0],
  alternative_url: document.original_url,
  decision: "same_event",
  reviewer: "Codex direct source review",
  reviewed_at: "2026-10-01",
  reason: "The official source names the same integration and announcement date.",
  claim_ids: [],
  new_article: false,
  candidate_published: false,
}
const validHashes = { reviewSha256: "b".repeat(64), backlogSha256: "c".repeat(64) }

function input(overrides = {}) {
  return {
    candidate,
    review,
    sourceRunId: "source-run-1",
    sourceRunIdentity: { documents_sha256: "d".repeat(64), parses_sha256: "e".repeat(64) },
    documents: [document],
    parses: [parse],
    reviewedClaims: [],
    ...validHashes,
    ...overrides,
  }
}

test("same-event alternative source requires verified source claims", () => {
  assert.throws(
    () => buildCandidateSourceAlternativeResolution(input()),
    /Same-event resolution requires directly verified source claims/,
  )
})

test("alternative-source review cannot rewrite the candidate original URL", () => {
  assert.throws(
    () =>
      buildCandidateSourceAlternativeResolution(
        input({ review: { ...review, original_url: document.original_url } }),
      ),
    /Original candidate URL must remain fixed/,
  )
})

test("alternative source must be captured at its exact URL", () => {
  assert.throws(
    () => buildCandidateSourceAlternativeResolution(input({ documents: [] })),
    /One successfully stored alternate source is required/,
  )
})

test("resolution decisions cannot be used as candidate approval or publication", () => {
  assert.throws(
    () =>
      buildCandidateSourceAlternativeResolution(
        input({ review: { ...review, decision: "same_event", candidate_published: true } }),
      ),
    /Complete private alternate-source identity review required/,
  )
})
