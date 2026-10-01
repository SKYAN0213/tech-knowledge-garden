import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { articleContentFingerprint, loadStoredSourceRun } from "../scripts/research/parser.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"
import { buildCandidateEvidenceReviewBatch } from "../scripts/research/candidate-evidence-review.mjs"
import { buildHistoricalSourceReconciliation } from "../scripts/research/historical-source-reconciliation.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "candidate-evidence-review-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const candidates = []
  const attempts = []

  function storedAttempt({ key, url, runId, rawBody, articleText }) {
    const id = sourceId(url)
    const bodySha = sha256(rawBody)
    const sourceVersion = `${id}:${bodySha}`
    const parseId = sha256(`${runId}-parse`)
    const observedAt = "2026-09-30T00:00:00Z"
    const document = {
      source_id: id,
      source_version_id: sourceVersion,
      original_url: url,
      final_url: url,
      body_path: `documents/${id}/${bodySha}/body.bin`,
      body_sha256: bodySha,
      fetch_status: "captured",
      observed_at: observedAt,
    }
    const parse = {
      schema_version: "source-parse/v1",
      source_id: id,
      source_version_id: sourceVersion,
      parse_id: parseId,
      title: `Article ${key}`,
      status: "extracted",
      dates: { published_at: "2026-09-29", observed_at: observedAt },
      blocks: [
        {
          block_id: `${parseId}:b1`,
          text: articleText,
          locator: { text_hash: sha256(articleText) },
        },
      ],
      quality: { missing_pages: [] },
    }
    atomicWrite(root, document.body_path, rawBody)
    atomicWrite(root, `parses/${parseId}/parse.json`, parse)
    atomicWrite(root, `runs/${runId}/documents.json`, [document])
    atomicWrite(root, `runs/${runId}/parses.json`, [parse])
    const attempt = {
      key,
      attempt_id: runId,
      article_source_version_id: sourceVersion,
      article_parse_id: parseId,
      article_content_sha256: articleContentFingerprint(parse),
    }
    attempts.push(attempt)
    return {
      attempt,
      sourceVersion,
      parseId,
      contentSha256: attempt.article_content_sha256,
      bodyPath: document.body_path,
    }
  }

  const exact = storedAttempt({
    key: "exact",
    url: "https://example.org/exact",
    runId: "run-exact",
    rawBody: "<html>Exact source</html>",
    articleText: "Same extracted story",
  })
  const sameContent = storedAttempt({
    key: "same-content",
    url: "https://example.org/same-content",
    runId: "run-same-content",
    rawBody: "<html>Source with changing layout</html>",
    articleText: "Stable extracted story",
  })
  const oldContent = storedAttempt({
    key: "old-content",
    url: "https://example.org/old-content",
    runId: "run-old-content",
    rawBody: "<html>Older content</html>",
    articleText: "Old article text",
  })
  const invalid = storedAttempt({
    key: "invalid",
    url: "https://example.org/invalid",
    runId: "run-invalid",
    rawBody: "<html>Body to corrupt</html>",
    articleText: "Invalid stored attempt",
  })
  fs.writeFileSync(path.join(root, invalid.bodyPath), "tampered original bytes")

  const candidate = (key, url, data, articleText = null) => ({
    key,
    title: `Candidate ${key}`,
    priority: "high",
    next_route: "historical-review",
    source_published_at: "2026-09-29",
    source_urls: [url],
    event_id: null,
    article_source_version_id: data?.sourceVersion || null,
    article_parse_id: data?.parseId || null,
    article_content_sha256: articleText
      ? sha256(
          JSON.stringify({
            title: `Article ${key}`,
            published_at: "2026-09-29",
            blocks: [articleText],
          }),
        )
      : data?.contentSha256 || null,
    source_attempts: data ? [{ ...structuredClone(data.attempt), key }] : [],
  })

  const handoff = {
    schema: "research-editorial-handoff/v1",
    daily_run: "daily-test",
    pending: [
      candidate("exact", "https://example.org/exact", exact),
      candidate("same-content", "https://example.org/same-content", {
        ...sameContent,
        sourceVersion: "different:source-version",
        parseId: "different-parse-id",
      }),
      candidate("same-version-different-parse", "https://example.org/same-content", {
        ...sameContent,
        parseId: "different-parse-id",
      }),
      candidate(
        "old-content",
        "https://example.org/old-content",
        {
          ...oldContent,
          sourceVersion: "current:changed-version",
          parseId: "current-changed-parse",
        },
        "Newly changed article text",
      ),
      candidate("not-observed", "https://example.org/not-observed", null),
      candidate("invalid", "https://example.org/invalid", invalid),
    ],
    observed_resolved: [],
  }
  const reconciliation = {
    schema: "research-drive-approval-reconciliation/v1",
    daily_run: "daily-test",
    candidate_published: false,
    drive_written: false,
    public_verified: false,
    inputs: { handoff_sha256: "a".repeat(64) },
    candidates: handoff.pending.map((row) => ({
      candidate_key: row.key,
      candidate_event_id: row.event_id || null,
      classification: "new_event_identity_review",
      canonical_source_urls: row.source_urls,
    })),
  }
  return { root, handoff, reconciliation, exact, sameContent, oldContent, attempts }
}

test("candidate evidence batch verifies stored source versions and separates content drift", (t) => {
  const input = fixture(t)
  const batch = buildCandidateEvidenceReviewBatch({
    ...input,
    handoffSha256: "a".repeat(64),
    reconciliationSha256: "b".repeat(64),
  })
  const byKey = Object.fromEntries(
    batch.candidates.map((candidate) => [candidate.candidate_key, candidate]),
  )

  assert.equal(
    byKey.exact.source_attempts[0].verification_status,
    "candidate_exact_source_and_parse",
  )
  assert.equal(
    byKey["same-content"].source_attempts[0].verification_status,
    "prior_source_version_same_article_content",
  )
  assert.equal(
    byKey["same-version-different-parse"].source_attempts[0].verification_status,
    "same_source_version_different_parse",
  )
  assert.equal(
    byKey["old-content"].source_attempts[0].verification_status,
    "prior_source_version_article_content_changed",
  )
  assert.equal(byKey["not-observed"].source_attempt_count, 0)
  assert.equal(byKey.invalid.source_attempts[0].verification_status, "stored_attempt_invalid")
  assert.equal(batch.candidate_count, 6)
  assert.equal(batch.source_attempt_counts.candidate_exact_source_and_parse, 1)
  assert.equal(batch.source_attempt_counts.prior_source_version_same_article_content, 1)
  assert.equal(batch.candidate_approved, false)
  assert.equal(batch.candidate_published, false)
  assert.equal(batch.drive_written, false)
  assert.equal(batch.public_verified, false)
})

test("candidate evidence batch rejects source URLs changed in the reconciliation receipt", (t) => {
  const input = fixture(t)
  input.reconciliation.candidates[0].canonical_source_urls = ["https://example.org/other-story"]
  assert.throws(
    () =>
      buildCandidateEvidenceReviewBatch({
        ...input,
        handoffSha256: "a".repeat(64),
        reconciliationSha256: "b".repeat(64),
      }),
    /does not match the pinned handoff/,
  )
})

test("approved alternate URLs remain visible to source-attempt and historical reviews", (t) => {
  const input = fixture(t)
  const exact = input.handoff.pending.find((candidate) => candidate.key === "exact")
  exact.alternate_sources = [{ url: "https://example.org/exact" }]
  exact.source_urls = ["https://example.org/original-release"]
  exact.source_attempts[0].source_role = "official_alternative"
  input.reconciliation.candidates.find(
    (row) => row.candidate_key === "exact",
  ).canonical_source_urls = exact.source_urls

  const batch = buildCandidateEvidenceReviewBatch({
    ...input,
    handoffSha256: "a".repeat(64),
    reconciliationSha256: "b".repeat(64),
  })
  const reviewed = batch.candidates.find((candidate) => candidate.candidate_key === "exact")
  assert.equal(reviewed.source_attempts[0].verification_status, "candidate_exact_source_and_parse")
  assert.equal(reviewed.source_attempts[0].source_role, "official_alternative")

  const historical = buildHistoricalSourceReconciliation({
    ...input,
    handoffSha256: "a".repeat(64),
    reconciliationSha256: "b".repeat(64),
    reviewBatch: batch,
    reviewBatchSha256: "c".repeat(64),
    reconcilerSha256: "d".repeat(64),
  })
  const historicalCandidate = historical.candidates.find(
    (candidate) => candidate.candidate_key === "exact",
  )
  assert.deepEqual(historicalCandidate.source_urls, ["https://example.org/original-release"])
  assert.deepEqual(historicalCandidate.alternate_source_urls, ["https://example.org/exact"])
  assert.equal(historicalCandidate.historical_source_version_count, 1)
})

test("a pinned same-event approval validates an official alternative absent from the old handoff", (t) => {
  const input = fixture(t)
  const candidate = input.handoff.pending.find((item) => item.key === "exact")
  const originalURL = "https://example.org/original-release"
  candidate.source_urls = [originalURL]
  candidate.event_id = "0123456789abcdef"
  candidate.approval = {
    approved_run: input.exact.attempt.attempt_id,
    source_alternative_resolution_run: "approved-alt-resolution",
  }
  candidate.source_attempts[0].source_role = "official_alternative"
  candidate.source_attempts[0].source_url = "https://example.org/exact"
  const reconciliationRow = input.reconciliation.candidates.find(
    (row) => row.candidate_key === candidate.key,
  )
  reconciliationRow.candidate_event_id = candidate.event_id
  reconciliationRow.canonical_source_urls = [originalURL]

  const stored = loadStoredSourceRun(input.root, input.exact.attempt.attempt_id)
  const review = {
    schema: "research-candidate-source-alternative-review/v1",
    candidate_key: candidate.key,
    original_url: originalURL,
    alternative_url: "https://example.org/exact",
    decision: "same_event",
  }
  const reviewBytes = Buffer.from(JSON.stringify(review))
  const reviewPath = "runs/approved-alt-resolution/candidate-source-alternative-review.json"
  atomicWrite(input.root, reviewPath, reviewBytes)
  const resolution = {
    schema: "research-candidate-source-alternative-resolution/v1",
    candidate_key: candidate.key,
    original_source: { url: originalURL },
    alternative_source: {
      url: "https://example.org/exact",
      source_version_id: input.exact.sourceVersion,
      parse_id: input.exact.parseId,
      content_sha256: input.exact.contentSha256,
    },
    decision: "same_event",
    inputs: {
      source_run_id: input.exact.attempt.attempt_id,
      source_run_identity_sha256: sha256(JSON.stringify(stored.identity)),
      review_sha256: sha256(reviewBytes),
    },
  }
  const resolutionBytes = Buffer.from(JSON.stringify(resolution))
  const resolutionPath = "runs/approved-alt-resolution/candidate-source-alternative.json"
  atomicWrite(input.root, resolutionPath, resolutionBytes)
  const resolutionSha = sha256(resolutionBytes)
  candidate.approval.source_alternative_resolution_sha256 = resolutionSha
  const approval = {
    schema: "research-candidate-approval/v1",
    candidate_key: candidate.key,
    event_id: candidate.event_id,
    approved_run: input.exact.attempt.attempt_id,
    source_version_id: input.exact.sourceVersion,
    parse_id: input.exact.parseId,
    article_content_sha256: input.exact.contentSha256,
    source_alternative: {
      run_id: "approved-alt-resolution",
      receipt_sha256: resolutionSha,
      original_url: originalURL,
      alternative_url: "https://example.org/exact",
      decision: "same_event",
      source_version_id: input.exact.sourceVersion,
      parse_id: input.exact.parseId,
      content_sha256: input.exact.contentSha256,
    },
    candidate_published: false,
  }
  atomicWrite(input.root, "runs/candidate-link/candidate-approval.json", approval)

  const batch = buildCandidateEvidenceReviewBatch({
    ...input,
    handoffSha256: "a".repeat(64),
    reconciliationSha256: "b".repeat(64),
  })
  const reviewed = batch.candidates.find((item) => item.candidate_key === candidate.key)
  assert.equal(reviewed.source_attempts[0].verification_status, "candidate_exact_source_and_parse")
  assert.equal(reviewed.source_attempts[0].identity_basis, "approved_same_event_alternative")
  assert.equal(reviewed.source_attempts[0].original_url, "https://example.org/exact")
})

test("an altered same-event resolution cannot validate an alternative source attempt", (t) => {
  const input = fixture(t)
  const candidate = input.handoff.pending.find((item) => item.key === "exact")
  candidate.source_urls = ["https://example.org/original-release"]
  candidate.event_id = "0123456789abcdef"
  candidate.approval = {
    approved_run: input.exact.attempt.attempt_id,
    source_alternative_resolution_run: "altered-alt-resolution",
    source_alternative_resolution_sha256: "a".repeat(64),
  }
  candidate.source_attempts[0].source_role = "official_alternative"
  candidate.source_attempts[0].source_url = "https://example.org/exact"
  const reconciliationRow = input.reconciliation.candidates.find(
    (row) => row.candidate_key === candidate.key,
  )
  reconciliationRow.candidate_event_id = candidate.event_id
  reconciliationRow.canonical_source_urls = [candidate.source_urls[0]]
  const approval = {
    schema: "research-candidate-approval/v1",
    candidate_key: candidate.key,
    event_id: candidate.event_id,
    approved_run: input.exact.attempt.attempt_id,
    source_version_id: input.exact.sourceVersion,
    parse_id: input.exact.parseId,
    article_content_sha256: input.exact.contentSha256,
    source_alternative: {
      run_id: "altered-alt-resolution",
      receipt_sha256: "a".repeat(64),
      original_url: candidate.source_urls[0],
      alternative_url: "https://example.org/exact",
      decision: "same_event",
      source_version_id: input.exact.sourceVersion,
      parse_id: input.exact.parseId,
      content_sha256: input.exact.contentSha256,
    },
    candidate_published: false,
  }
  atomicWrite(input.root, "runs/candidate-link/candidate-approval.json", approval)

  const batch = buildCandidateEvidenceReviewBatch({
    ...input,
    handoffSha256: "a".repeat(64),
    reconciliationSha256: "b".repeat(64),
  })
  const reviewed = batch.candidates.find((item) => item.candidate_key === candidate.key)
  assert.equal(reviewed.source_attempts[0].verification_status, "stored_source_or_parse_not_unique")
})

test("historical source reconciliation verifies exact URLs and deduplicates repeated run references", (t) => {
  const input = fixture(t)
  const batch = buildCandidateEvidenceReviewBatch({
    ...input,
    handoffSha256: "a".repeat(64),
    reconciliationSha256: "b".repeat(64),
  })
  const exactDocument = JSON.parse(
    fs.readFileSync(path.join(input.root, "runs/run-exact/documents.json"), "utf8"),
  )
  const exactParse = JSON.parse(
    fs.readFileSync(path.join(input.root, "runs/run-exact/parses.json"), "utf8"),
  )
  atomicWrite(input.root, "runs/run-exact-retry/documents.json", [
    ...exactDocument,
    {
      original_url: "https://example.org/not-observed",
      fetch_status: "blocked",
    },
  ])
  atomicWrite(input.root, "runs/run-exact-retry/parses.json", exactParse)
  atomicWrite(input.root, "runs/run-reparse/documents.json", [
    ...exactDocument,
    { original_url: "https://example.org/not-observed", fetch_status: "blocked" },
  ])
  atomicWrite(input.root, "runs/run-reparse/parses.json", exactParse)
  atomicWrite(input.root, "runs/run-reparse/state.json", {
    schema: "research-run/v1",
    run_id: "run-reparse",
    stages: { "parse-source": { status: "complete" } },
  })

  const receipt = buildHistoricalSourceReconciliation({
    ...input,
    handoffSha256: "a".repeat(64),
    reconciliationSha256: "b".repeat(64),
    reviewBatch: batch,
    reviewBatchSha256: "c".repeat(64),
    reconcilerSha256: "d".repeat(64),
  })
  const byKey = Object.fromEntries(
    receipt.candidates.map((candidate) => [candidate.candidate_key, candidate]),
  )

  assert.equal(receipt.schema, "research-historical-source-reconciliation/v1")
  assert.equal(byKey.exact.status, "historical_source_and_parse_found")
  assert.equal(byKey.exact.historical_source_version_count, 1)
  assert.equal(byKey.exact.historical_parse_count, 1)
  assert.deepEqual(byKey.exact.historical_sources[0].parses[0].observed_run_ids, [
    "run-exact",
    "run-exact-retry",
    "run-reparse",
  ])
  assert.equal(byKey["not-observed"].status, "exact_url_attempt_without_captured_source")
  assert.equal(byKey["not-observed"].exact_url_attempt_count, 1)
  assert.deepEqual(
    byKey["not-observed"].exact_url_attempts.map((attempt) => attempt.run_id),
    ["run-exact-retry"],
  )
  assert.equal(receipt.run_validation_failure_count, 1)
  assert.equal(receipt.candidate_approved, false)
  assert.equal(receipt.candidate_published, false)
  assert.equal(receipt.drive_written, false)
  assert.equal(receipt.public_verified, false)
  assert.equal("blocks" in byKey.exact.historical_sources[0].parses[0], false)
})
