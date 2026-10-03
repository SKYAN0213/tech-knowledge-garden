import fs from "node:fs"
import path from "node:path"
import { canonicalURL } from "../garden.mjs"
import { loadStoredSourceRun } from "./parser.mjs"
import { assertVerifiedClaim } from "./claims.mjs"
import { sha256 } from "./contracts.mjs"
import { assertReviewDate } from "./dates.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { BACKLOG_PATH } from "../research-window.mjs"
import { loadLegacyCandidateApproval } from "./legacy-candidate-approval.mjs"

const choices = new Set(["same_event", "different_event", "unresolved"])
const sourceContentFingerprint = (parse) =>
  sha256(
    JSON.stringify({
      title: parse.title.trim(),
      published_at: parse.dates?.published_at || null,
      blocks: parse.blocks.map((block) => block.text),
    }),
  )

function oneCandidate(root, backlog, candidateKey) {
  if (backlog?.schema !== "research-candidates/v1" || !Array.isArray(backlog.candidates))
    throw Error("Research candidate backlog required")
  const matches = backlog.candidates.filter((candidate) => candidate.key === candidateKey)
  if (matches.length !== 1) throw Error("One exact candidate required")
  const [candidate] = matches
  const legacyApproval = loadLegacyCandidateApproval(root, candidate)
  const importedApprovalMatches = candidate.approval?.legacy_publication_receipt_sha256
    ? Boolean(legacyApproval)
    : true
  const reviewedExistingEvent =
    candidate.review_status === "verified" &&
    /^[a-f0-9]{16,64}$/.test(candidate.event_id || "") &&
    typeof candidate.approval?.approved_run === "string" &&
    /^[a-f0-9]{64}$/.test(candidate.approval?.article_sha256 || "") &&
    importedApprovalMatches
  if (
    candidate.source_urls?.length !== 1 ||
    !candidate.source_published_at ||
    (!["unreviewed", "deferred"].includes(candidate.review_status) && !reviewedExistingEvent) ||
    (!reviewedExistingEvent && (candidate.event_id || candidate.approval))
  )
    throw Error(
      "Unresolved candidate or verified approved event with one original URL and date required",
    )
  return { candidate, legacyApproval }
}

export function buildCandidateSourceAlternativeResolution({
  candidate,
  review,
  sourceRunId,
  sourceRunIdentity,
  documents,
  parses,
  reviewedClaims,
  reviewSha256,
  backlogSha256,
  existingEventApproval = null,
  generatedAt = new Date().toISOString(),
}) {
  if (
    review?.schema !== "research-candidate-source-alternative-review/v1" ||
    review.candidate_key !== candidate?.key ||
    !choices.has(review.decision) ||
    review.new_article !== false ||
    review.candidate_published !== false ||
    typeof review.reviewer !== "string" ||
    !review.reviewer.trim() ||
    typeof review.reason !== "string" ||
    !review.reason.trim() ||
    !/^[a-f0-9]{64}$/.test(reviewSha256 || "") ||
    !/^[a-f0-9]{64}$/.test(backlogSha256 || "") ||
    !Array.isArray(documents) ||
    !Array.isArray(parses) ||
    !Array.isArray(reviewedClaims)
  )
    throw Error("Complete private alternate-source identity review required")

  const originalURL = canonicalURL(candidate.source_urls[0])
  const alternateURL = canonicalURL(review.alternative_url)
  if (
    canonicalURL(review.original_url) !== originalURL ||
    alternateURL === originalURL ||
    !candidate.source_published_at
  )
    throw Error("Original candidate URL must remain fixed and alternate URL must be distinct")

  const docs = documents.filter((document) => canonicalURL(document.original_url) === alternateURL)
  if (docs.length !== 1 || !["captured", "not_modified"].includes(docs[0].fetch_status))
    throw Error("One successfully stored alternate source is required")
  const document = docs[0]
  const sourceParses = parses.filter(
    (parse) => parse.source_version_id === document.source_version_id,
  )
  if (sourceParses.length !== 1 || sourceParses[0].status !== "extracted")
    throw Error("One extracted parse for the exact alternate source version is required")
  const parse = sourceParses[0]
  const contentSha = sourceContentFingerprint(parse)

  const claimIds = [...new Set(review.claim_ids || [])]
  if (claimIds.length !== (review.claim_ids || []).length)
    throw Error("Alternate source claim IDs must be unique")
  const verified = new Map(reviewedClaims.map((claim) => [claim.claim_id, claim]))
  if (claimIds.some((claimId) => !verified.has(claimId)))
    throw Error("Identity review must cite claims from this source run")
  const claims = claimIds.map((claimId) => {
    const claim = verified.get(claimId)
    assertVerifiedClaim(claim, parses)
    const evidence = (claim.evidence || []).filter(
      (item) =>
        item.source_version_id === document.source_version_id &&
        item.parse_id === parse.parse_id &&
        item.support === "direct",
    )
    if (!evidence.length)
      throw Error("Cited claim must directly support the exact alternate source parse")
    return {
      claim_id: claim.claim_id,
      statement: claim.statement,
      evidence: evidence.map(({ source_id, source_version_id, parse_id, block_id, quote }) => ({
        source_id,
        source_version_id,
        parse_id,
        block_id,
        quote,
      })),
    }
  })

  if (review.decision === "same_event" && !claims.length)
    throw Error("Same-event resolution requires directly verified source claims")
  if (review.decision !== "unresolved" && !review.reason.trim())
    throw Error("Resolved identity requires an explicit comparison reason")
  assertReviewDate(review.reviewed_at, {
    notBefore: [
      document.observed_at,
      ...claims.map((claim) => verified.get(claim.claim_id).review.reviewed_at),
    ],
  })

  return {
    schema: "research-candidate-source-alternative-resolution/v1",
    generated_at: generatedAt,
    candidate_key: candidate.key,
    original_source: {
      url: originalURL,
      published_at: candidate.source_published_at,
    },
    alternative_source: {
      url: alternateURL,
      source_id: document.source_id,
      source_version_id: document.source_version_id,
      body_sha256: document.body_sha256,
      parse_id: parse.parse_id,
      content_sha256: contentSha,
      parse_status: parse.status,
      published_at: parse.dates?.published_at || null,
      observed_at: document.observed_at,
    },
    decision: review.decision,
    reason: review.reason,
    reviewer: review.reviewer,
    reviewed_at: review.reviewed_at,
    claim_evidence: claims,
    ...(existingEventApproval ? { existing_event_approval: existingEventApproval } : {}),
    inputs: {
      source_run_id: sourceRunId,
      source_run_identity_sha256: sha256(JSON.stringify(sourceRunIdentity)),
      review_sha256: reviewSha256,
      backlog_sha256: backlogSha256,
    },
    candidate_approved: false,
    candidate_published: false,
    backlog_written: false,
    drive_written: false,
    public_verified: false,
  }
}

// Rebuild same-event relations from their original source, review and target
// candidate before allowing a later scan to suppress a duplicate candidate.
// A summary field or URL similarity alone is not sufficient to redirect intake.
export function loadSameEventSourceAliases(root, backlogFile, { asOf = null } = {}) {
  const backlogBytes = fs.readFileSync(backlogFile)
  const backlog = JSON.parse(backlogBytes.toString("utf8"))
  if (backlog?.schema !== "research-candidates/v1" || !Array.isArray(backlog.candidates))
    throw Error("Research candidate backlog required for same-event source aliases")
  const runsDirectory = safePath(root, "runs")
  if (!fs.existsSync(runsDirectory)) return new Map()
  const aliases = new Map()
  for (const entry of fs.readdirSync(runsDirectory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw Error("Symlinks are not allowed in same-event source index")
    if (!entry.isDirectory()) continue
    const runId = entry.name
    const receiptPath = `runs/${runId}/candidate-source-alternative.json`
    const receipt = readJSON(root, receiptPath)
    if (!receipt || receipt.decision !== "same_event") continue
    if (
      receipt.schema !== "research-candidate-source-alternative-resolution/v1" ||
      receipt.candidate_approved !== false ||
      receipt.candidate_published !== false ||
      receipt.backlog_written !== false ||
      receipt.drive_written !== false ||
      receipt.public_verified !== false ||
      receipt.inputs?.source_run_id === undefined ||
      receipt.generated_at === undefined
    )
      throw Error(`Invalid same-event source resolution: ${runId}`)
    if (asOf && receipt.generated_at > asOf) continue

    const targets = backlog.candidates.filter(
      (candidate) => candidate.key === receipt.candidate_key,
    )
    if (targets.length !== 1)
      throw Error(`Same-event target candidate is missing or ambiguous: ${runId}`)
    const [candidate] = targets
    const legacyApproval = loadLegacyCandidateApproval(root, candidate)
    if (
      candidate.source_urls?.length !== 1 ||
      canonicalURL(candidate.source_urls[0]) !== canonicalURL(receipt.original_source?.url) ||
      candidate.source_published_at !== receipt.original_source?.published_at
    )
      throw Error(`Same-event target candidate identity changed: ${runId}`)

    const sourceRunId = receipt.inputs.source_run_id
    const reviewBytes = findPinnedAlternativeReview(
      root,
      runId,
      sourceRunId,
      receipt.inputs.review_sha256,
    )
    if (!reviewBytes) throw Error(`Same-event source review changed: ${runId}`)
    const review = JSON.parse(reviewBytes.toString("utf8"))
    const stored = loadStoredSourceRun(root, sourceRunId)
    const reviewed = readJSON(root, `runs/${sourceRunId}/reviewed-claims.json`)
    if (!Array.isArray(reviewed?.claims))
      throw Error(`Same-event source review claims are missing: ${runId}`)
    const rebuilt = buildCandidateSourceAlternativeResolution({
      candidate,
      review,
      sourceRunId,
      sourceRunIdentity: stored.identity,
      documents: stored.documents,
      parses: stored.parses,
      reviewedClaims: reviewed.claims,
      existingEventApproval: legacyApproval,
      reviewSha256: sha256(reviewBytes),
      backlogSha256: receipt.inputs.backlog_sha256,
      generatedAt: receipt.generated_at,
    })
    if (JSON.stringify(rebuilt) !== JSON.stringify(receipt))
      throw Error(`Same-event source resolution no longer matches its evidence: ${runId}`)

    const alternativeURL = canonicalURL(receipt.alternative_source.url)
    const previous = aliases.get(alternativeURL)
    if (previous && previous.candidate_key !== candidate.key)
      throw Error(`Same-event source maps to multiple candidates: ${alternativeURL}`)
    aliases.set(alternativeURL, {
      candidate_key: candidate.key,
      resolution_run: runId,
      generated_at: receipt.generated_at,
    })
  }
  return aliases
}

function findPinnedAlternativeReview(root, resolutionRunId, sourceRunId, expectedSha256) {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 || "")) return null
  const matches = []
  for (const runId of new Set([resolutionRunId, sourceRunId])) {
    const directory = safePath(root, `runs/${runId}`)
    if (!fs.existsSync(directory)) continue
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.startsWith("candidate-source-alternative-review")) continue
      const bytes = fs.readFileSync(safePath(root, `runs/${runId}/${entry.name}`))
      if (sha256(bytes) === expectedSha256) matches.push(bytes)
    }
  }
  if (!matches.length) return null
  if (matches.some((bytes) => !bytes.equals(matches[0]))) return null
  return matches[0]
}

export async function recordCandidateSourceAlternative({
  root,
  runId,
  sourceRunId,
  candidateKey,
  reviewPath,
  backlogFile = BACKLOG_PATH,
}) {
  if (
    !/^[a-zA-Z0-9_-]+$/.test(runId || "") ||
    !/^[a-zA-Z0-9_-]+$/.test(sourceRunId || "") ||
    runId === sourceRunId ||
    !/^[a-zA-Z0-9_-]+$/.test(candidateKey || "") ||
    !reviewPath
  )
    throw Error("Distinct resolution run, source run, candidate key and review are required")

  return withLock(root, `run-${runId}`, async () => {
    const backlogBytes = fs.readFileSync(backlogFile)
    const backlog = JSON.parse(backlogBytes.toString("utf8"))
    const { candidate, legacyApproval } = oneCandidate(root, backlog, candidateKey)
    const reviewBytes = fs.readFileSync(reviewPath)
    const review = JSON.parse(reviewBytes.toString("utf8"))
    const stored = loadStoredSourceRun(root, sourceRunId)
    const reviewed = readJSON(root, `runs/${sourceRunId}/reviewed-claims.json`)
    if (!reviewed || !Array.isArray(reviewed.claims))
      throw Error("Source run must contain reviewed claims")
    const relative = `runs/${runId}/candidate-source-alternative.json`
    const reviewRelative = `runs/${runId}/candidate-source-alternative-review.json`
    const existing = readJSON(root, relative)
    const storedReviewBytes = fs.lstatSync(safePath(root, reviewRelative), {
      throwIfNoEntry: false,
    })
      ? fs.readFileSync(safePath(root, reviewRelative))
      : null
    if (storedReviewBytes && sha256(storedReviewBytes) !== sha256(reviewBytes))
      throw Error("Alternate-source review input changed; use a new run ID")
    const receipt = buildCandidateSourceAlternativeResolution({
      candidate,
      review,
      sourceRunId,
      sourceRunIdentity: stored.identity,
      documents: stored.documents,
      parses: stored.parses,
      reviewedClaims: reviewed.claims,
      existingEventApproval: legacyApproval,
      reviewSha256: sha256(reviewBytes),
      backlogSha256: sha256(backlogBytes),
      generatedAt: existing?.generated_at,
    })
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(receipt))
        throw Error("Alternate-source resolution changed; use a new run ID")
      if (!storedReviewBytes) atomicCreate(root, reviewRelative, reviewBytes)
      return { ...existing, path: safePath(root, relative), reused: true }
    }
    if (!storedReviewBytes) atomicCreate(root, reviewRelative, reviewBytes)
    const written = atomicCreate(root, relative, receipt)
    return { ...receipt, path: written.path, sha256: written.sha256, reused: false }
  })
}
