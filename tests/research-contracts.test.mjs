import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import {
  CANDIDATE_STATES,
  CANDIDATE_TRANSITIONS,
  FETCH_STATES,
  PARSE_STATES,
  assertSchema,
  extractionSchema,
  sha256,
} from "../scripts/research/contracts.mjs"
import { CLAIM_REVIEW_STATES } from "../scripts/research/claims.mjs"
import { ARTICLE_REVIEW_STATES } from "../scripts/article-review.mjs"
import { validateEvidence } from "../scripts/research/claims.mjs"

const fixture = JSON.parse(fs.readFileSync("tests/fixtures/editorial-contract-v1.json", "utf8"))

test("design-document claim example is the current model extraction schema", () => {
  const document = fs.readFileSync("docs/LOCAL_AI_NEWS_SYSTEM.md", "utf8")
  const section = document.slice(document.indexOf("### 5.3 내부 주장 레코드"))
  const block = section.match(/```json\n([\s\S]*?)\n```/)
  assert.ok(block, "claim example exists")
  const claim = JSON.parse(block[1])
  assertSchema({ claims: [claim] }, extractionSchema)
  assert.deepEqual(
    Object.keys(claim).sort(),
    Object.keys(extractionSchema.properties.claims.items.properties).sort(),
  )
  const quote = claim.evidence[0].quote
  const parse = {
    schema_version: "source-parse/v1",
    status: "extracted",
    source_id: "fixture-source",
    source_version_id: "fixture-version",
    parse_id: "fixture-parse",
    title: "시험 기업 발표",
    dates: { published_at: claim.published_at },
    quality: { missing_pages: [] },
    blocks: [
      {
        block_id: "fixture-parse:paragraph-004",
        text: quote,
        locator: { text_hash: sha256(quote) },
      },
    ],
  }
  assert.equal(validateEvidence(claim, [parse]).structural_pass, true)
})

test("cross-layer status fixture matches runtime contracts without collapsing review states", () => {
  assert.deepEqual(fixture.statuses.fetch, FETCH_STATES)
  assert.deepEqual(fixture.statuses.parse, PARSE_STATES)
  assert.deepEqual(fixture.statuses.candidate, CANDIDATE_STATES)
  assert.deepEqual(fixture.statuses.claim_review, CLAIM_REVIEW_STATES)
  assert.deepEqual(fixture.statuses.article_review, ARTICLE_REVIEW_STATES)
  assert.deepEqual(Object.keys(CANDIDATE_TRANSITIONS), CANDIDATE_STATES)
  for (const state of CANDIDATE_STATES)
    for (const next of CANDIDATE_TRANSITIONS[state]) assert.ok(CANDIDATE_STATES.includes(next))
  assert.notDeepEqual(CLAIM_REVIEW_STATES, ARTICLE_REVIEW_STATES)
})
