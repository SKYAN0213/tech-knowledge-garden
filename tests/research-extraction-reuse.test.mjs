import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { main } from "../scripts/research.mjs"
import { reuseExtraction } from "../scripts/research/extraction-reuse.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import {
  storeParseArtifact,
  retainParse,
  assertStoredEvidence,
} from "../scripts/research/parser.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "extraction-reuse-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const url = "https://example.org/news/one",
    text = "Company announced a robot control product."
  const id = sourceId(url),
    hash = sha256(text),
    parseId = sha256("parse")
  const doc = {
    original_url: url,
    final_url: url,
    source_id: id,
    source_version_id: `${id}:${hash}`,
    body_sha256: hash,
    body_path: `documents/${id}/${hash}/body.bin`,
    fetch_status: "captured",
    observed_at: "2026-10-04T00:00:00Z",
  }
  atomicWrite(root, doc.body_path, text)
  const parse = {
    schema_version: "source-parse/v1",
    source_id: id,
    source_version_id: doc.source_version_id,
    parse_id: parseId,
    title: "Product",
    status: "extracted",
    dates: { published_at: "2026-10-03" },
    blocks: [{ block_id: parseId + ":b1", text, locator: { text_hash: hash } }],
    quality: { missing_pages: [] },
  }
  storeParseArtifact(root, parse)
  const claim = {
    candidate_key: "source-" + id,
    statement: text,
    claim_kind: "fact",
    subject: "Company",
    event_state: "reported",
    published_at: "2026-10-03",
    effective_period: null,
    numbers: [],
    evidence: [
      {
        source_id: id,
        source_version_id: doc.source_version_id,
        parse_id: parseId,
        block_id: parseId + ":b1",
        quote: text,
        support: "direct",
      },
    ],
    review: { status: "verified" },
    event_id: "old-event",
  }
  claim.claim_id = sha256(
    JSON.stringify([claim.candidate_key, claim.statement, claim.evidence]),
  ).slice(0, 24)
  for (const run of ["source", "bundle"]) {
    atomicWrite(root, `runs/${run}/documents.json`, [doc])
    atomicWrite(root, `runs/${run}/parses.json`, [parse])
  }
  const extraction = { claims: [claim], provenance: { model: "controlled-fixture" } }
  atomicWrite(root, "runs/source/claims.json", extraction)
  return { root, claim, parse, extraction }
}

test("CLI reuse preserves extraction provenance and exact sources while requiring fresh review without a model call", async (t) => {
  const { root, claim } = fixture(t)
  assert.equal(
    (await main(["reuse-extraction", "--root", root, "--run", "bundle", "--source-run", "source"]))
      .reused,
    false,
  )
  const result = readJSON(root, "runs/bundle/claims.json")
  assert.equal(result.claims[0].claim_id, claim.claim_id)
  assert.equal(result.claims[0].review.status, "unreviewed")
  assert.equal(result.claims[0].event_id, null)
  assert.equal(result.provenance.model, "controlled-fixture")
  assert.equal(
    result.extraction_reuse.source_claims_sha256,
    sha256(fs.readFileSync(path.join(root, "runs/source/claims.json"))),
  )
  const before = fs.readFileSync(path.join(root, "runs/bundle/claims.json"))
  assert.equal((await reuseExtraction(root, "bundle", "source")).reused, true)
  assert.deepEqual(fs.readFileSync(path.join(root, "runs/bundle/claims.json")), before)
  assert.equal(fs.existsSync(path.join(root, "runs/bundle/reviewed-claims.json")), false)
})

test("reuse rejects different source parses, changed extraction and partial checkpoints before overwriting", async (t) => {
  const { root, parse, extraction } = fixture(t)
  atomicWrite(root, "runs/bundle/parses.json", [])
  await assert.rejects(() => reuseExtraction(root, "bundle", "source"))
  assert.equal(fs.existsSync(path.join(root, "runs/bundle/claims.json")), false)
  atomicWrite(root, "runs/bundle/parses.json", [parse])
  await reuseExtraction(root, "bundle", "source")
  const before = fs.readFileSync(path.join(root, "runs/bundle/claims.json"))
  extraction.provenance.model = "changed"
  atomicWrite(root, "runs/source/claims.json", extraction)
  await assert.rejects(() => reuseExtraction(root, "bundle", "source"), /checkpoint differs/)
  assert.deepEqual(fs.readFileSync(path.join(root, "runs/bundle/claims.json")), before)
  fs.unlinkSync(path.join(root, "runs/bundle/extraction-reuse.json"))
  await assert.rejects(() => reuseExtraction(root, "bundle", "source"), /checkpoint differs/)
})

test("reuse refuses stale claim identifiers, invalid quotations and pre-existing destination reviews", async (t) => {
  const { root, extraction } = fixture(t)
  extraction.claims[0].statement = "changed statement"
  atomicWrite(root, "runs/source/claims.json", extraction)
  await assert.rejects(() => reuseExtraction(root, "bundle", "source"), /claim identity/)
  const c = extraction.claims[0]
  c.evidence[0].quote = "Not in this source"
  c.claim_id = sha256(JSON.stringify([c.candidate_key, c.statement, c.evidence])).slice(0, 24)
  atomicWrite(root, "runs/source/claims.json", extraction)
  await assert.rejects(() => reuseExtraction(root, "bundle", "source"), /evidence failed/)
  c.evidence[0].quote = c.statement = "Company announced a robot control product."
  c.claim_id = sha256(JSON.stringify([c.candidate_key, c.statement, c.evidence])).slice(0, 24)
  atomicWrite(root, "runs/source/claims.json", extraction)
  atomicWrite(root, "runs/bundle/reviewed-claims.json", {})
  await assert.rejects(() => reuseExtraction(root, "bundle", "source"), /already contains a review/)
})

test("retained parse versions reuse existing claims without replacing their evidence or review", async (t) => {
  const { root, parse, claim } = fixture(t)
  const revised = structuredClone(parse)
  revised.parse_id = sha256("improved-parser")
  revised.title = "Product with improved metadata"
  revised.blocks[0].block_id = revised.parse_id + ":b1"
  storeParseArtifact(root, revised)
  const originals = fs.readFileSync(path.join(root, "runs/source/parses.json"))
  const parses = [structuredClone(parse)]
  retainParse(parses, revised)
  retainParse(parses, structuredClone(revised))
  assert.equal(parses.length, 2)
  assert.deepEqual(parses[0], parse)
  const collision = structuredClone(revised)
  collision.title = "Changed under the same identity"
  assert.throws(() => retainParse(parses, collision), /identity collision/)
  atomicWrite(root, "runs/bundle/parses.json", parses)
  assertStoredEvidence(root, readJSON(root, "runs/bundle/documents.json"), parses)
  await reuseExtraction(root, "bundle", "source")
  const reused = readJSON(root, "runs/bundle/claims.json").claims[0]
  assert.equal(reused.claim_id, claim.claim_id)
  assert.equal(reused.evidence[0].parse_id, parse.parse_id)
  assert.equal(reused.review.status, "unreviewed")
  assert.deepEqual(fs.readFileSync(path.join(root, "runs/source/parses.json")), originals)
})

test("explicit reuse retains unsupported quotations for correction without inheriting approval", async (t) => {
  const { root, extraction, parse } = fixture(t)
  const claim = extraction.claims[0]
  claim.evidence[0].quote = "Company announced ... product."
  claim.claim_id = sha256(
    JSON.stringify([claim.candidate_key, claim.statement, claim.evidence]),
  ).slice(0, 24)
  atomicWrite(root, "runs/source/claims.json", extraction)
  const sourceBytes = fs.readFileSync(path.join(root, "runs/source/claims.json"))
  await assert.rejects(() => reuseExtraction(root, "bundle", "source"), /evidence failed/)
  const args = [
    "reuse-extraction",
    "--root",
    root,
    "--run",
    "bundle",
    "--source-run",
    "source",
    "--retain-unsupported-claims",
  ]
  assert.equal((await main(args)).reused, false)
  const result = readJSON(root, "runs/bundle/claims.json")
  assert.equal(result.claims[0].review.status, "unreviewed")
  assert.equal(result.claims[0].review.structural_pass, false)
  assert.deepEqual(result.claims[0].review.problems, ["quote_not_in_block"])
  assert.deepEqual(result.claims[0].evidence, claim.evidence)
  assert.equal(result.claims[0].event_id, null)
  assert.deepEqual(result.extraction_reuse.unsupported_claim_ids, [claim.claim_id])
  const decision = {
    claim_id: claim.claim_id,
    status: "verified",
    reason: "Read the exact source block",
    source_read: true,
    entailment_checked: true,
    identity_checked: true,
    numbers_checked: true,
    time_checked: true,
  }
  const review = { reviewer: "Source reviewer", reviewed_at: "2026-10-04" }
  assert.throws(
    () => recordFactReview(result.claims, [decision], review, [parse]),
    /Verified claim requires/,
  )
  const corrected = recordFactReview(
    result.claims,
    [
      {
        ...decision,
        replacement: {
          evidence: [{ ...claim.evidence[0], quote: parse.blocks[0].text }],
        },
      },
    ],
    review,
    [parse],
  )
  assert.equal(corrected[0].review.status, "verified")
  assert.equal(corrected[0].previous_claim_id, claim.claim_id)
  assert.equal((await main(args)).reused, true)
  assert.deepEqual(fs.readFileSync(path.join(root, "runs/source/claims.json")), sourceBytes)
  assert.equal(fs.existsSync(path.join(root, "runs/bundle/approved-article.json")), false)
})

test("retaining unsupported claims cannot bypass source block identity or unrelated CLI commands", async (t) => {
  const { root, extraction } = fixture(t)
  const claim = extraction.claims[0]
  claim.evidence[0].block_id += "-missing"
  claim.claim_id = sha256(
    JSON.stringify([claim.candidate_key, claim.statement, claim.evidence]),
  ).slice(0, 24)
  atomicWrite(root, "runs/source/claims.json", extraction)
  await assert.rejects(
    () => reuseExtraction(root, "bundle", "source", { retainUnsupportedClaims: true }),
    /evidence_identity_mismatch/,
  )
  assert.equal(fs.existsSync(path.join(root, "runs/bundle/claims.json")), false)
  await assert.rejects(
    () =>
      main([
        "collect",
        "--root",
        root,
        "--run",
        "invalid-retention",
        "--retain-unsupported-claims",
      ]),
    /only supported for reuse-extraction/,
  )
  assert.equal(fs.existsSync(path.join(root, "runs/invalid-retention")), false)
})

test("parse retention rejects incompatible CLI options before creating any run", async (t) => {
  const { root } = fixture(t)
  for (const args of [
    ["collect", "--url", "https://example.org/news/one"],
    ["reparse"],
    ["reparse", "--source-run", "source", "--url", "https://example.org/news/one"],
  ]) {
    await assert.rejects(
      () =>
        main([...args, "--root", root, "--run", "invalid-retention", "--retain-previous-parses"]),
      /requires reparse --source-run without --url/,
    )
    assert.equal(fs.existsSync(path.join(root, "runs/invalid-retention")), false)
  }
})
