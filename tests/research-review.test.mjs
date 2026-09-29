import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256 } from "../scripts/research/contracts.mjs"
import {
  assertVerifiedClaim,
  recordFactReview,
  validateEvidence,
} from "../scripts/research/claims.mjs"
import { archiveManifest } from "../scripts/research/archive.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"
import { coverageGrid } from "../scripts/research/discovery.mjs"
import { fetchWithPolicy } from "../scripts/research/source-policy.mjs"
import {
  parseResearchDate,
  samePublicationDate,
  assertReviewDate,
} from "../scripts/research/dates.mjs"
import { assertStoredEvidence } from "../scripts/research/parser.mjs"

function facts() {
  const text = "Example plans to ship 50 units in 2027."
  const parse = {
    schema_version: "source-parse/v1",
    source_id: "s1",
    source_version_id: "s1:v1",
    parse_id: "p1",
    title: "Plan",
    status: "extracted",
    dates: { published_at: "2026-09-27" },
    blocks: [{ block_id: "p1:b1", text, locator: { text_hash: sha256(text) } }],
    quality: { missing_pages: [] },
  }
  const claim = {
    claim_id: "c1",
    candidate_key: "event",
    statement: text,
    claim_kind: "attributed_fact",
    subject: "Example",
    event_state: "planned",
    published_at: "2026-09-27",
    effective_period: "2027",
    numbers: [{ literal: "50", unit: "units", condition: "in 2027" }],
    evidence: [
      {
        source_id: "s1",
        source_version_id: "s1:v1",
        parse_id: "p1",
        block_id: "p1:b1",
        quote: text,
        support: "direct",
      },
    ],
  }
  claim.review = validateEvidence(claim, [parse])
  const decision = {
    claim_id: "c1",
    status: "verified",
    reason: "Direct source review",
    source_read: true,
    entailment_checked: true,
    identity_checked: true,
    numbers_checked: true,
    time_checked: true,
  }
  return { claim, parse, decision }
}

test("claim corrections cannot bypass the extraction schema", () => {
  const { claim, parse, decision } = facts()
  for (const replacement of [
    { statement: 123 },
    { event_state: "teleported" },
    { subject: "" },
    { numbers: "50" },
  ]) {
    assert.throws(
      () =>
        recordFactReview([claim], [{ ...decision, replacement }], { reviewer: "reviewer" }, [
          parse,
        ]),
      /Invalid|Empty/,
    )
  }
})

test("direct source review can add a model-omitted fact without changing model output", () => {
  const { claim, parse, decision } = facts()
  const addition = {
    claim: {
      candidate_key: "event",
      statement: "Example planned a shipment of 50 units for 2027.",
      claim_kind: "attributed_fact",
      subject: "Example",
      event_state: "planned",
      published_at: "2026-09-27",
      effective_period: "2027",
      numbers: [{ literal: "50", unit: "units", condition: "in 2027" }],
      evidence: claim.evidence,
    },
    decision: {
      reason: "The source explicitly states the shipment plan; the model omitted it.",
      source_read: true,
      entailment_checked: true,
      identity_checked: true,
      numbers_checked: true,
      time_checked: true,
    },
  }
  const reviewed = recordFactReview(
    [claim],
    [decision],
    { reviewer: "direct reviewer", reviewed_at: "2026-09-28", additions: [addition] },
    [parse],
  )
  assert.equal(reviewed.length, 2)
  assert.equal(claim.review.status, "unreviewed")
  assert.equal(reviewed[1].review.origin, "direct_source_addition")
  assert.doesNotThrow(() => assertVerifiedClaim(reviewed[1], [parse]))
  for (const changed of [
    { ...addition, claim: { ...addition.claim, candidate_key: "another-event" } },
    {
      ...addition,
      claim: { ...addition.claim, evidence: [{ ...claim.evidence[0], quote: "unsupported" }] },
    },
    { ...addition, decision: { ...addition.decision, numbers_checked: false } },
  ])
    assert.throws(
      () =>
        recordFactReview(
          [claim],
          [decision],
          { reviewer: "direct reviewer", reviewed_at: "2026-09-28", additions: [changed] },
          [parse],
        ),
      /addition|evidence|review/i,
    )
})

test("verification requires boolean decisions and rechecks the stored evidence", () => {
  const { claim, parse, decision } = facts()
  assert.throws(
    () =>
      recordFactReview([claim], [{ ...decision, source_read: "true" }], { reviewer: "reviewer" }, [
        parse,
      ]),
    /requires source/,
  )
  const altered = structuredClone(claim)
  altered.evidence[0].quote = "An unsupported statement"
  assert.throws(
    () => recordFactReview([altered], [decision], { reviewer: "reviewer" }, [parse]),
    /requires source/,
  )
})

test("verified decisions cannot reuse a saved pass without the source parses", () => {
  const { claim, decision } = facts()
  assert.throws(
    () => recordFactReview([claim], [decision], { reviewer: "reviewer" }),
    /source|parse/i,
  )
})

test("review dates reject impossible dates, future reviews and review before publication", () => {
  const { claim, parse, decision } = facts()
  for (const reviewed_at of [
    "2026-09-31",
    "2026-02-29",
    "2026-09-27T25:00:00Z",
    "2026-09-27T00:00:00",
    "2999-01-01",
    "2026-09-26",
  ])
    assert.throws(
      () => recordFactReview([claim], [decision], { reviewer: "reviewer", reviewed_at }, [parse]),
      /date|time/i,
      reviewed_at,
    )
})

test("claim publication date comes from its own supporting source, never an unrelated parse", () => {
  const { claim, parse } = facts()
  assert.equal(
    validateEvidence({ ...claim, published_at: "2026-09-27-invalid" }, [parse]).structural_pass,
    false,
  )
  const different = { ...parse, dates: { published_at: "2026-09-26" } }
  const unrelated = {
    ...parse,
    source_id: "s2",
    source_version_id: "s2:v1",
    parse_id: "p2",
    blocks: [{ ...parse.blocks[0], block_id: "p2:b1" }],
  }
  assert.equal(validateEvidence(claim, [different, unrelated]).structural_pass, false)
})

test("calendar and timezone checks retain source precision and the review's real instant", () => {
  assert.equal(parseResearchDate("2024-02-29").day, "2024-02-29")
  for (const value of [
    "2023-02-29",
    "2026-04-31",
    "0000-01-01",
    "2026-09-27T24:00:00Z",
    "2026-09-27T00:00:00+00:60",
  ])
    assert.equal(parseResearchDate(value), null, value)
  assert.equal(samePublicationDate("2026-09-27T01:00:00+09:00", "2026-09-26T16:00:00Z"), true)
  assert.equal(samePublicationDate("2026-09-27T00:00:00Z", "2026-09-27"), false)
  assert.equal(samePublicationDate("2026-09-27", "2026-09-27T09:30:00+09:00"), true)
  assert.doesNotThrow(() => assertReviewDate("2026-09-26T16:00:00Z", { notBefore: ["2026-09-27"] }))
  assert.throws(
    () => assertReviewDate("2026-09-27T02:00:00+09:00", { notBefore: ["2026-09-26T18:00:00Z"] }),
    /precedes/,
  )
})

test("source timestamps with minute precision retain their explicit offset", () => {
  const original = "2026-02-05T07:00-05:00"
  assert.deepEqual(parseResearchDate(original), {
    day: "2026-02-05",
    instant: Date.parse("2026-02-05T12:00:00Z"),
    precision: "timestamp",
  })
  assert.equal(samePublicationDate(original, "2026-02-05T12:00:00Z"), true)
  assert.equal(samePublicationDate(original, "2026-02-05T12:00:01Z"), false)
  assert.doesNotThrow(() => assertReviewDate("2026-02-05T12:01Z", { notBefore: [original] }))
  assert.throws(() => assertReviewDate("2026-02-05T11:59Z", { notBefore: [original] }), /precedes/)
  for (const invalid of [
    "2026-02-05T07:00",
    "2026-02-05T24:00Z",
    "2026-02-05T07:60Z",
    "2026-02-05T07:00+24:00",
    "2026-02-05T07:00-05:60",
    "2026-02-05T07:00.5Z",
    "2026-02-30T07:00Z",
    "2026-02-05T07:00:60Z",
  ])
    assert.equal(parseResearchDate(invalid), null, invalid)
})

test("stored evidence checks original bytes, version identity and the immutable parse copy", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "review-source-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const url = "https://example.com/announcement",
    id = sha256(url).slice(0, 20),
    body = Buffer.from("Original announcement")
  const { parse } = facts()
  const parsed = {
    ...parse,
    source_id: id,
    source_version_id: id + ":" + sha256(body),
    parse_id: sha256("parse"),
  }
  parsed.blocks = [{ ...parse.blocks[0], block_id: parsed.parse_id + ":b1" }]
  const document = {
    source_id: id,
    source_version_id: parsed.source_version_id,
    original_url: url,
    fetch_status: "captured",
    observed_at: "2026-09-27T00:00:00Z",
    body_path: "body.bin",
    body_sha256: sha256(body),
  }
  atomicWrite(root, "body.bin", body)
  atomicWrite(root, `parses/${parsed.parse_id}/parse.json`, parsed)
  assert.doesNotThrow(() => assertStoredEvidence(root, [document], [parsed]))
  assert.doesNotThrow(() =>
    assertStoredEvidence(root, [document, { fetch_status: "failed" }], [parsed]),
  )
  assert.throws(
    () =>
      assertStoredEvidence(
        root,
        [document],
        [{ ...parsed, dates: { published_at: "2026-09-26" } }],
      ),
    /differs/,
  )
  assert.throws(
    () =>
      assertStoredEvidence(
        root,
        [{ ...document, original_url: "https://example.com/fake" }],
        [parsed],
      ),
    /version\/hash/,
  )
  atomicWrite(root, "body.bin", "Corrupt original")
  assert.throws(() => assertStoredEvidence(root, [document], [parsed]), /body hash/)
})

test("a deferred fact remains private and duplicate decisions are refused", () => {
  const { claim, parse, decision } = facts()
  const reviewed = recordFactReview(
    [claim],
    [{ claim_id: "c1", status: "deferred", reason: "Need original appendix" }],
    { reviewer: "reviewer" },
    [parse],
  )
  assert.equal(reviewed[0].review.status, "deferred")
  assert.throws(
    () =>
      recordFactReview(
        [claim],
        [decision, { ...decision, status: "rejected" }],
        { reviewer: "reviewer" },
        [parse],
      ),
    /Unique/,
  )
  assert.throws(
    () =>
      recordFactReview(
        [claim],
        [decision, { ...decision, claim_id: "other" }],
        { reviewer: "reviewer" },
        [parse],
      ),
    /match/,
  )
})

test("a repeated research archive never includes its previous manifest", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "research-manifest-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  atomicWrite(root, "runs/sample/claims.json", { claims: [] })
  const first = archiveManifest(root, "sample")
  atomicWrite(root, "runs/sample/archive-manifest.json", first)
  const second = archiveManifest(root, "sample")
  assert.deepEqual(second.files, first.files)
  for (const item of second.files)
    assert.equal(sha256(fs.readFileSync(path.join(root, item.path))), item.sha256)
})

test("failed research routes are not classified as partial content coverage", () => {
  const route = {
    channel_id: "failed-1",
    sectors: ["로봇·제조"],
    region: "국내",
    axis: "기업·운영",
    status: "failed",
  }
  const one = coverageGrid([route]).find(
    (c) => c.sector === "로봇·제조" && c.region === "국내" && c.axis === "기업·운영",
  )
  assert.equal(one.status, "failed")
  const mixed = coverageGrid([route, { ...route, channel_id: "usable-1", status: "partial" }]).find(
    (c) => c.sector === "로봇·제조" && c.region === "국내" && c.axis === "기업·운영",
  )
  assert.equal(mixed.status, "partial")
  assert.deepEqual(mixed.failed_route_ids, ["failed-1"])
  assert.equal(mixed.usable_route_count, 1)
})

test("direct acquisition refuses forbidden or corrupt robots policy without fetching the article", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "research-policy-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const robots = "User-agent: *\nDisallow: /private\n"
  atomicWrite(root, "robots.txt", robots)
  const calls = []
  const fetcher = {
    options: {},
    fetch: async (url) => {
      calls.push(url)
      return { fetch_status: "captured", body_path: "robots.txt", body_sha256: sha256(robots) }
    },
  }
  const denied = await fetchWithPolicy(root, fetcher, "https://example.com/private/article")
  assert.equal(denied.policy_status, "denied")
  assert.deepEqual(calls, ["https://example.com/robots.txt"])
  const corrupt = {
    options: {},
    fetch: async (url) => {
      calls.push(url)
      return { fetch_status: "captured", body_path: "robots.txt", body_sha256: "wrong" }
    },
  }
  const failed = await fetchWithPolicy(root, corrupt, "https://example.com/public/article")
  assert.equal(failed.policy_status, "failed")
  assert.equal(failed.fetch_status, "blocked")
  assert.match(failed.error, /hash mismatch/)
  assert.equal(calls.filter((url) => url.includes("article")).length, 0)
})
