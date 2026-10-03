import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  buildCandidateSourceAlternativeResolution,
  loadSameEventSourceAliases,
  recordCandidateSourceAlternative,
} from "../scripts/research/candidate-source-alternative.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { intakeCompletedScan, mergeCompletedScan } from "../scripts/research/scan-completion.mjs"
import { storeParseArtifact, loadStoredSourceRun } from "../scripts/research/parser.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"

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

function storedSameEventFixture(t, { approvedTarget = false } = {}) {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "same-event-alias-")))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const root = path.join(workspace, "local-ai")
  const backlogFile = path.join(workspace, "candidate-backlog.json")
  const sourceRunId = "alternate-source"
  const resolutionRun = "same-event-resolution"
  const originalUrl = "https://spectrum.ieee.org/robust-robot-hand"
  const alternativeUrl = "https://bostondynamics.com/blog/robot-hands-for-modern-ai-and-real-work"
  const candidate = {
    key: `source-${sourceId(originalUrl)}`,
    source_urls: [originalUrl],
    source_published_at: "2026-10-01",
    review_status: approvedTarget ? "verified" : "unreviewed",
    ...(approvedTarget
      ? {
          event_id: "a1b2c3d4e5f60718",
          approval: { approved_run: "approved-event", article_sha256: "f".repeat(64) },
        }
      : {}),
  }
  const backlogBytes = Buffer.from(
    JSON.stringify({ schema: "research-candidates/v1", candidates: [candidate] }),
  )
  fs.writeFileSync(backlogFile, backlogBytes)

  const body = "The new Atlas hand has 13 degrees of freedom."
  const body_sha256 = sha256(body)
  const source_id = sourceId(alternativeUrl)
  const source_version_id = `${source_id}:${body_sha256}`
  const parse_id = sha256("same-event-alias-parse")
  const observed_at = "2026-10-01T21:08:06.220Z"
  const document = {
    source_id,
    source_version_id,
    original_url: alternativeUrl,
    final_url: alternativeUrl,
    body_path: `sources/${source_id}/body.txt`,
    body_sha256,
    fetch_status: "captured",
    observed_at,
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id,
    source_version_id,
    parse_id,
    title: "Robot hands for Atlas",
    status: "extracted",
    dates: { published_at: "2026-10-01T13:10:02+00:00", observed_at },
    blocks: [{ block_id: `${parse_id}:b1`, text: body, locator: { text_hash: sha256(body) } }],
    quality: { missing_pages: [] },
  }
  atomicWrite(root, document.body_path, body)
  storeParseArtifact(root, parse)
  atomicWrite(root, `runs/${sourceRunId}/documents.json`, [document])
  atomicWrite(root, `runs/${sourceRunId}/parses.json`, [parse])
  const claim = {
    claim_id: "atlas-hand-dof",
    candidate_key: `source-${source_id}`,
    statement: "The new Atlas hand has 13 degrees of freedom.",
    claim_kind: "attributed_fact",
    subject: "Atlas hand",
    event_state: "completed",
    published_at: "2026-10-01T13:10:02+00:00",
    effective_period: null,
    numbers: [],
    evidence: [
      {
        source_id,
        source_version_id,
        parse_id,
        block_id: `${parse_id}:b1`,
        quote: body,
        support: "direct",
      },
    ],
  }
  const reviewedClaims = recordFactReview(
    [claim],
    [
      {
        claim_id: claim.claim_id,
        status: "verified",
        reason: "Exact source block checked",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      },
    ],
    { reviewer: "Codex source review", reviewed_at: "2026-10-01T21:17:50Z" },
    [parse],
  )
  atomicWrite(root, `runs/${sourceRunId}/reviewed-claims.json`, { claims: reviewedClaims })
  const review = {
    schema: "research-candidate-source-alternative-review/v1",
    candidate_key: candidate.key,
    original_url: originalUrl,
    alternative_url: alternativeUrl,
    decision: "same_event",
    reviewer: "Codex source review",
    reviewed_at: "2026-10-01T21:30:00Z",
    reason: "The official source describes the same Atlas hand announcement.",
    claim_ids: [claim.claim_id],
    new_article: false,
    candidate_published: false,
  }
  const reviewBytes = Buffer.from(JSON.stringify(review, null, 2) + "\n")
  atomicWrite(root, `runs/${resolutionRun}/candidate-source-alternative-review.json`, reviewBytes)
  const stored = loadStoredSourceRun(root, sourceRunId)
  const receipt = buildCandidateSourceAlternativeResolution({
    candidate,
    review,
    sourceRunId,
    sourceRunIdentity: stored.identity,
    documents: stored.documents,
    parses: stored.parses,
    reviewedClaims,
    reviewSha256: sha256(reviewBytes),
    backlogSha256: sha256(backlogBytes),
    generatedAt: "2026-10-01T21:35:00Z",
  })
  atomicWrite(root, `runs/${resolutionRun}/candidate-source-alternative.json`, receipt)
  return { root, backlogFile, candidate, alternativeUrl, receipt, resolutionRun }
}

test("standalone completed intake suppresses reviewed same-event sources and preserves backlog bytes on resume", async (t) => {
  const fixture = storedSameEventFixture(t)
  const before = fs.readFileSync(fixture.backlogFile)
  const result = {
    summary: { status: "window_scanned" },
    candidates: [
      {
        key: "source-" + sourceId(fixture.alternativeUrl),
        title: "Official alternate source for the same announcement",
        source_urls: [fixture.alternativeUrl],
        source_published_at: "2026-10-01",
        discovered_at: "2026-10-04T00:00:00Z",
        review_status: "unreviewed",
        discovery: [],
      },
    ],
  }
  const options = { root: fixture.root, result, backlogFile: fixture.backlogFile }
  const first = await intakeCompletedScan(options)
  assert.equal(first.changed, false)
  assert.equal(first.same_event_aliases[0].target_candidate_key, fixture.candidate.key)
  assert.deepEqual(fs.readFileSync(fixture.backlogFile), before)
  const repeated = await intakeCompletedScan(options)
  assert.equal(repeated.changed, false)
  assert.deepEqual(fs.readFileSync(fixture.backlogFile), before)
  fs.appendFileSync(
    path.join(
      fixture.root,
      "runs",
      fixture.resolutionRun,
      "candidate-source-alternative-review.json",
    ),
    "tampered",
  )
  await assert.rejects(intakeCompletedScan(options), /source review changed/)
  assert.deepEqual(fs.readFileSync(fixture.backlogFile), before)
})

test("same-event source aliases are rebuilt from the pinned candidate and source evidence", (t) => {
  const fixture = storedSameEventFixture(t)
  const aliases = loadSameEventSourceAliases(fixture.root, fixture.backlogFile)
  assert.deepEqual(aliases.get(fixture.alternativeUrl), {
    candidate_key: fixture.candidate.key,
    resolution_run: fixture.resolutionRun,
    generated_at: fixture.receipt.generated_at,
  })
  assert.equal(
    loadSameEventSourceAliases(fixture.root, fixture.backlogFile, {
      asOf: "2026-09-30T00:00:00.000Z",
    }).has(fixture.alternativeUrl),
    false,
  )
  assert.equal(
    loadSameEventSourceAliases(fixture.root, fixture.backlogFile, {
      asOf: fixture.receipt.generated_at,
    }).has(fixture.alternativeUrl),
    true,
  )

  const reviewPath = path.join(
    fixture.root,
    "runs",
    fixture.resolutionRun,
    "candidate-source-alternative-review.json",
  )
  fs.appendFileSync(reviewPath, "tamper")
  assert.throws(
    () => loadSameEventSourceAliases(fixture.root, fixture.backlogFile),
    /source review changed/,
  )
})

test("verified approved events accept additional exact same-event source aliases", async (t) => {
  const fixture = storedSameEventFixture(t, { approvedTarget: true })
  const reviewPath = path.join(
    fixture.root,
    "runs",
    fixture.resolutionRun,
    "candidate-source-alternative-review.json",
  )
  const result = await recordCandidateSourceAlternative({
    root: fixture.root,
    runId: fixture.resolutionRun,
    sourceRunId: "alternate-source",
    candidateKey: fixture.candidate.key,
    reviewPath,
    backlogFile: fixture.backlogFile,
  })
  assert.equal(result.reused, true)
  assert.equal(result.candidate_key, fixture.candidate.key)
  assert.equal(result.candidate_approved, false)
  assert.equal(result.candidate_published, false)
  const aliases = loadSameEventSourceAliases(fixture.root, fixture.backlogFile)
  assert.deepEqual(aliases.get(fixture.alternativeUrl), {
    candidate_key: fixture.candidate.key,
    resolution_run: fixture.resolutionRun,
    generated_at: fixture.receipt.generated_at,
  })
})

test("completed scans suppress only exact, reviewed same-event alternative URLs", async (t) => {
  const fixture = storedSameEventFixture(t)
  const aliases = loadSameEventSourceAliases(fixture.root, fixture.backlogFile)
  const scanCandidate = {
    key: `source-${sourceId(fixture.alternativeUrl)}`,
    title: "Robot Hands for Modern AI and Real Work",
    source_urls: [fixture.alternativeUrl],
  }
  let mergedCandidates
  const result = await mergeCompletedScan(
    { summary: { status: "window_scanned" }, candidates: [scanCandidate] },
    fixture.backlogFile,
    async (_file, candidates) => {
      mergedCandidates = candidates
      return { changed: false }
    },
    aliases,
  )
  assert.deepEqual(mergedCandidates, [])
  assert.deepEqual(result.same_event_aliases, [
    {
      candidate_key: scanCandidate.key,
      candidate_url: fixture.alternativeUrl,
      target_candidate_key: fixture.candidate.key,
      resolution_run: fixture.resolutionRun,
    },
  ])
})
