import test from "node:test"
import assert from "node:assert/strict"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { validateEvidence, recordFactReview } from "../scripts/research/claims.mjs"

function fixture(quotes, overrides = {}) {
  const source_id = sourceId("https://example.org/source/consistency")
  const parse_id = sha256(JSON.stringify(quotes))
  const parse = {
    schema_version: "source-parse/v1",
    source_id,
    source_version_id: source_id + ":" + sha256(quotes.join("\n")),
    parse_id,
    status: "extracted",
    title: "Source statement",
    dates: { published_at: "2026-09-26", observed_at: "2026-09-27T00:00:00Z" },
    blocks: quotes.map((text, i) => ({
      block_id: parse_id + ":b" + i,
      text,
      locator: { text_hash: sha256(text) },
    })),
    quality: { missing_pages: [] },
  }
  const claim = {
    claim_id: "fixture-claim",
    candidate_key: "source-" + source_id,
    statement: "Example shipped 50 units to Asia.",
    claim_kind: "attributed_fact",
    subject: "Example",
    event_state: "completed",
    published_at: "2026-09-26",
    effective_period: null,
    numbers: [],
    evidence: parse.blocks.map((b) => ({
      source_id,
      source_version_id: parse.source_version_id,
      parse_id,
      block_id: b.block_id,
      quote: b.text,
      support: "direct",
    })),
    ...overrides,
  }
  return { parse, claim }
}
function verify({ parse, claim }) {
  return recordFactReview(
    [claim],
    [
      {
        claim_id: claim.claim_id,
        status: "verified",
        reason: "Fixture source review",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      },
    ],
    { reviewer: "fixture reviewer", reviewed_at: "2026-09-28T00:00:00Z" },
    [parse],
  )
}

test("a quantity cannot combine one quotation's number with another quotation's condition", () => {
  const f = fixture(["Example shipped 50 units to Europe.", "Example shipped 75 units to Asia."], {
    numbers: [{ literal: "50", unit: "units", condition: "Asia" }],
  })
  assert.equal(validateEvidence(f.claim, [f.parse]).structural_pass, false)
  assert.throws(() => verify(f), /numeric and temporal review/)
  const corrected = {
    ...f,
    claim: { ...f.claim, numbers: [{ literal: "50", unit: "units", condition: "Europe" }] },
  }
  assert.equal(verify(corrected)[0].review.status, "verified")
})

test("numbers cannot be matched inside a different magnitude or a written number inside another word", () => {
  for (const [quote, literal] of [
    ["Delivered 150 units.", "50"],
    ["Raised $100000.", "$100"],
    ["Latency was 50.5 ms.", "50"],
    ["Used 1,000 units.", "1"],
    ["Increased leads 15x.", "5x"],
    ["Teams often train startups.", "ten"],
  ]) {
    const f = fixture([quote], { numbers: [{ literal, unit: "", condition: "" }] })
    assert.ok(
      validateEvidence(f.claim, [f.parse]).problems.includes("number_not_in_evidence"),
      quote,
    )
  }
  for (const [quote, literal] of [
    ["Delivered 50 units.", "50"],
    ["Raised $100 million.", "$100"],
    ["Latency was 50.5 ms.", "50.5"],
    ["Used 1,000 units.", "1,000"],
    ["Increased leads 5x.", "5x"],
    ["Selected up to ten startups.", "ten"],
  ]) {
    const f = fixture([quote], { numbers: [{ literal, unit: "", condition: "" }] })
    assert.equal(validateEvidence(f.claim, [f.parse]).structural_pass, true, quote)
  }
})

test("explicit future and conditional actions cannot be completed even when quotes contain past results", () => {
  for (const statement of [
    "The program will run in 2027.",
    "The program is scheduled to run in 2027.",
    "Outstanding companies may also be considered for investment from the fund.",
  ]) {
    const f = fixture(
      [
        "The program running from January 11 through March 8, 2027.",
        "The fund completed an earlier investment.",
      ],
      { statement },
    )
    assert.ok(validateEvidence(f.claim, [f.parse]).problems.includes("plan_promoted_to_completion"))
    assert.throws(() => verify(f), /numeric and temporal review/)
    assert.equal(
      verify({ ...f, claim: { ...f.claim, event_state: "planned" } })[0].review.status,
      "verified",
    )
  }
  const announcement = fixture(
    ["Example announced today that it will open applications next year."],
    {
      statement: "Example announced today that it will open applications next year.",
    },
  )
  // The completed action is the announcement; its future contents are not delivery.
  assert.equal(validateEvidence(announcement.claim, [announcement.parse]).structural_pass, true)
  const unsupportedReport = fixture(["Example will ship 50 units next year."], {
    statement: "Example reported shipment of 50 units.",
  })
  assert.ok(
    validateEvidence(unsupportedReport.claim, [unsupportedReport.parse]).problems.includes(
      "plan_promoted_to_completion",
    ),
  )
})
