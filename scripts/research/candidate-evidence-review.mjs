import fs from "node:fs"
import path from "node:path"
import { canonicalURL } from "../garden.mjs"
import { articleContentFingerprint, loadStoredSourceRun } from "./parser.mjs"
import { sha256 } from "./contracts.mjs"
import { safePath } from "./run-state.mjs"

const canonicalSources = (values) => {
  const urls = new Set()
  for (const value of Array.isArray(values) ? values : []) {
    try {
      urls.add(canonicalURL(value))
    } catch {
      // Invalid URLs cannot provide exact-source evidence.
    }
  }
  return urls
}

function approvedSameEventAlternative(root, candidate, attempt, stored) {
  if (
    !candidate.event_id ||
    candidate.approval?.approved_run !== attempt?.attempt_id ||
    attempt?.source_role !== "official_alternative" ||
    typeof attempt.source_url !== "string"
  )
    return null

  const runDirectory = path.join(root, "runs")
  if (!fs.existsSync(runDirectory)) return null
  const originalURLs = canonicalSources(candidate.source_urls)
  const alternativeURL = (() => {
    try {
      return canonicalURL(attempt.source_url)
    } catch {
      return null
    }
  })()
  if (!alternativeURL || originalURLs.has(alternativeURL)) return null

  for (const entry of fs.readdirSync(runDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-zA-Z0-9_-]+$/.test(entry.name)) continue
    const approvalPath = `runs/${entry.name}/candidate-approval.json`
    let approvalBytes
    let approval
    try {
      approvalBytes = fs.readFileSync(safePath(root, approvalPath))
      approval = JSON.parse(approvalBytes.toString("utf8"))
    } catch {
      continue
    }
    const alternative = approval?.source_alternative
    if (
      approval?.schema !== "research-candidate-approval/v1" ||
      approval.candidate_key !== candidate.key ||
      approval.event_id !== candidate.event_id ||
      approval.approved_run !== attempt.attempt_id ||
      approval.candidate_published !== false ||
      approval.source_version_id !== attempt.article_source_version_id ||
      approval.parse_id !== attempt.article_parse_id ||
      approval.article_content_sha256 !== attempt.article_content_sha256 ||
      alternative?.decision !== "same_event" ||
      alternative.source_version_id !== attempt.article_source_version_id ||
      alternative.parse_id !== attempt.article_parse_id ||
      alternative.content_sha256 !== attempt.article_content_sha256
    )
      continue

    let originalURL
    let approvedAlternativeURL
    try {
      originalURL = canonicalURL(alternative.original_url)
      approvedAlternativeURL = canonicalURL(alternative.alternative_url)
    } catch {
      continue
    }
    if (!originalURLs.has(originalURL) || approvedAlternativeURL !== alternativeURL) continue

    const resolutionPath = `runs/${alternative.run_id}/candidate-source-alternative.json`
    const reviewPath = `runs/${alternative.run_id}/candidate-source-alternative-review.json`
    try {
      const resolutionBytes = fs.readFileSync(safePath(root, resolutionPath))
      const reviewBytes = fs.readFileSync(safePath(root, reviewPath))
      const resolution = JSON.parse(resolutionBytes.toString("utf8"))
      const review = JSON.parse(reviewBytes.toString("utf8"))
      const resolvedOriginalURL = canonicalURL(resolution.original_source?.url)
      const resolvedAlternativeURL = canonicalURL(resolution.alternative_source?.url)
      if (
        sha256(resolutionBytes) !== alternative.receipt_sha256 ||
        sha256(reviewBytes) !== resolution.inputs?.review_sha256 ||
        resolution.schema !== "research-candidate-source-alternative-resolution/v1" ||
        resolution.candidate_key !== candidate.key ||
        resolution.decision !== "same_event" ||
        resolution.inputs?.source_run_id !== attempt.attempt_id ||
        resolution.inputs?.source_run_identity_sha256 !== sha256(JSON.stringify(stored.identity)) ||
        resolution.alternative_source?.source_version_id !== attempt.article_source_version_id ||
        resolution.alternative_source?.parse_id !== attempt.article_parse_id ||
        resolution.alternative_source?.content_sha256 !== attempt.article_content_sha256 ||
        resolvedOriginalURL !== originalURL ||
        resolvedAlternativeURL !== alternativeURL ||
        review?.schema !== "research-candidate-source-alternative-review/v1" ||
        review.candidate_key !== candidate.key ||
        review.decision !== "same_event" ||
        canonicalURL(review.original_url) !== originalURL ||
        canonicalURL(review.alternative_url) !== alternativeURL
      )
        continue
      return { url: approvedAlternativeURL, approval_path: approvalPath }
    } catch {
      continue
    }
  }
  return null
}

function verifyAttempt(root, candidate, attempt, loadedRuns) {
  if (
    attempt?.key !== candidate.key ||
    typeof attempt.attempt_id !== "string" ||
    !/^[a-zA-Z0-9_-]+$/.test(attempt.attempt_id)
  )
    return {
      attempt_id: attempt?.attempt_id || null,
      verification_status: "invalid_attempt_identity",
    }

  try {
    let stored = loadedRuns.get(attempt.attempt_id)
    if (!stored) {
      stored = loadStoredSourceRun(root, attempt.attempt_id, { allowUnacquired: true })
      loadedRuns.set(attempt.attempt_id, stored)
    }
    const candidateURLs = canonicalSources([
      ...(candidate.source_urls || []),
      ...(candidate.alternate_sources || []).map((source) => source.url),
    ])
    const approvedAlternative = approvedSameEventAlternative(root, candidate, attempt, stored)
    if (approvedAlternative) candidateURLs.add(approvedAlternative.url)
    const documents = stored.documents.filter((document) => {
      try {
        return (
          attempt.article_source_version_id === document.source_version_id &&
          candidateURLs.has(canonicalURL(document.original_url))
        )
      } catch {
        return false
      }
    })
    const parses = stored.parses.filter(
      (parse) =>
        parse.source_version_id === attempt.article_source_version_id &&
        parse.parse_id === attempt.article_parse_id,
    )
    if (documents.length !== 1 || parses.length !== 1)
      return {
        attempt_id: attempt.attempt_id,
        verification_status: "stored_source_or_parse_not_unique",
        source_run_sha256: sha256(JSON.stringify(stored.identity)),
      }

    const contentSha256 = articleContentFingerprint(parses[0])
    if (contentSha256 !== attempt.article_content_sha256)
      return {
        attempt_id: attempt.attempt_id,
        verification_status: "stored_content_fingerprint_mismatch",
        source_run_sha256: sha256(JSON.stringify(stored.identity)),
      }

    const sameSourceVersion =
      candidate.article_source_version_id === attempt.article_source_version_id
    const sameParse = candidate.article_parse_id === attempt.article_parse_id
    const sameCurrentContent =
      Boolean(candidate.article_content_sha256) &&
      candidate.article_content_sha256 === attempt.article_content_sha256
    const approvedAlternativeMatches = Boolean(approvedAlternative)
    const verificationStatus =
      approvedAlternativeMatches || (sameSourceVersion && sameParse && sameCurrentContent)
        ? "candidate_exact_source_and_parse"
        : sameSourceVersion && sameCurrentContent
          ? "same_source_version_different_parse"
          : sameSourceVersion
            ? "current_source_version_content_changed"
            : sameCurrentContent
              ? "prior_source_version_same_article_content"
              : "prior_source_version_article_content_changed"
    return {
      attempt_id: attempt.attempt_id,
      original_url: documents[0].original_url,
      source_role: attempt.source_role || "original",
      identity_basis: approvedAlternativeMatches
        ? "approved_same_event_alternative"
        : "candidate_source_url",
      fetch_status: documents[0].fetch_status,
      source_version_id: documents[0].source_version_id,
      parse_id: parses[0].parse_id,
      article_content_sha256: contentSha256,
      candidate_source_version_id: candidate.article_source_version_id || null,
      candidate_parse_id: candidate.article_parse_id || null,
      candidate_article_content_sha256: candidate.article_content_sha256 || null,
      source_run_sha256: sha256(JSON.stringify(stored.identity)),
      verification_status: verificationStatus,
    }
  } catch (error) {
    return {
      attempt_id: attempt.attempt_id,
      verification_status: "stored_attempt_invalid",
      error: String(error?.message || error),
    }
  }
}

export function buildCandidateEvidenceReviewBatch({
  root,
  handoff,
  handoffSha256,
  reconciliation,
  reconciliationSha256,
  generatedAt = new Date().toISOString(),
}) {
  if (
    handoff?.schema !== "research-editorial-handoff/v1" ||
    reconciliation?.schema !== "research-drive-approval-reconciliation/v1" ||
    handoff.daily_run !== reconciliation.daily_run ||
    handoffSha256 !== reconciliation.inputs?.handoff_sha256 ||
    !/^[a-f0-9]{64}$/.test(reconciliationSha256 || "") ||
    reconciliation.candidate_published !== false ||
    reconciliation.drive_written !== false ||
    reconciliation.public_verified !== false ||
    !Array.isArray(reconciliation.candidates)
  )
    throw Error("Pinned reconciliation and matching editorial handoff required")

  const handoffCandidates = new Map(
    [...handoff.pending, ...handoff.observed_resolved].map((candidate) => [
      candidate.key,
      candidate,
    ]),
  )
  if (handoffCandidates.size !== handoff.pending.length + handoff.observed_resolved.length)
    throw Error("Editorial handoff candidate keys must be unique")
  const reconciliationKeys = new Set()
  for (const row of reconciliation.candidates) {
    const candidate = handoffCandidates.get(row.candidate_key)
    const rowURLs = [...canonicalSources(row.canonical_source_urls)].sort()
    const candidateURLs = [...canonicalSources(candidate?.source_urls)].sort()
    if (
      !candidate ||
      reconciliationKeys.has(row.candidate_key) ||
      row.candidate_event_id !== (candidate.event_id || null) ||
      JSON.stringify(rowURLs) !== JSON.stringify(candidateURLs)
    )
      throw Error("Reconciliation candidate identity does not match the pinned handoff")
    reconciliationKeys.add(row.candidate_key)
  }
  if (reconciliationKeys.size !== handoffCandidates.size)
    throw Error("Reconciliation must account for every pinned handoff candidate")

  const loadedRuns = new Map()
  const candidates = reconciliation.candidates
    .filter((row) => row.classification !== "exact_source_and_verified_event")
    .map((row) => {
      const candidate = handoffCandidates.get(row.candidate_key)
      if (!candidate) throw Error("Reconciliation candidate missing from its pinned handoff")
      const sourceAttempts = (candidate.source_attempts || []).map((attempt) =>
        verifyAttempt(root, candidate, attempt, loadedRuns),
      )
      const counts = Object.fromEntries(
        [...new Set(sourceAttempts.map((attempt) => attempt.verification_status))]
          .sort()
          .map((status) => [
            status,
            sourceAttempts.filter((attempt) => attempt.verification_status === status).length,
          ]),
      )
      return {
        candidate_key: candidate.key,
        title: candidate.title,
        priority: candidate.priority || "normal",
        next_route: candidate.next_route || null,
        event_id: candidate.event_id || null,
        source_published_at: candidate.source_published_at || null,
        source_urls: row.canonical_source_urls,
        identity_classification: row.classification,
        source_attempt_count: sourceAttempts.length,
        source_attempt_counts: counts,
        source_attempts: sourceAttempts,
      }
    })

  const sourceAttemptCounts = Object.fromEntries(
    [...new Set(candidates.flatMap((candidate) => Object.keys(candidate.source_attempt_counts)))]
      .sort()
      .map((status) => [
        status,
        candidates.reduce(
          (total, candidate) => total + (candidate.source_attempt_counts[status] || 0),
          0,
        ),
      ]),
  )
  const candidateSourceStates = Object.fromEntries(
    candidates.map((candidate) => [candidate.candidate_key, candidate.source_attempt_counts]),
  )
  const sourceRunHashes = [
    ...new Set(
      candidates.flatMap((candidate) =>
        candidate.source_attempts.map((attempt) => attempt.source_run_sha256).filter(Boolean),
      ),
    ),
  ].sort()
  const evidenceProjectionSha256 = sha256(JSON.stringify(candidates))

  return {
    schema: "research-candidate-source-evidence-review/v1",
    generated_at: generatedAt,
    daily_run: handoff.daily_run,
    candidate_count: candidates.length,
    candidate_source_states: candidateSourceStates,
    source_attempt_count: Object.values(sourceAttemptCounts).reduce((sum, count) => sum + count, 0),
    source_attempt_counts: sourceAttemptCounts,
    candidates,
    inputs: {
      handoff_sha256: handoffSha256,
      reconciliation_sha256: reconciliationSha256,
      source_run_sha256s: sourceRunHashes,
      evidence_projection_sha256: evidenceProjectionSha256,
    },
    candidate_approved: false,
    candidate_published: false,
    drive_written: false,
    public_verified: false,
  }
}
