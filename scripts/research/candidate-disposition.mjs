import path from "node:path"
import { canonicalURL } from "../garden.mjs"
import { SECTORS } from "../sectors.mjs"
import { BACKLOG_PATH } from "../research-window.mjs"
import { sourceId, sha256 } from "./contracts.mjs"
import { assertReviewDate, samePublicationDate } from "./dates.mjs"
import { articleContentFingerprint, selectStoredSources } from "./parser.mjs"
import { atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"

const CHECKS = [
  "new_product_release",
  "new_customer_installation",
  "new_contract_or_investment",
  "new_measured_result",
]
const PUBLIC_CHANNELS = ["news", "briefing", "rss", "digest", "keyword_timeline", "map_edge"]

// This is an editorial, private disposition of one already captured source.
// It cannot infer that the source lacks an event; a reviewer must supply that
// conclusion with an exact source version and a written reading record.
function readDispositionEvidence({
  root,
  sourceRunId,
  candidateRunId = sourceRunId,
  reviewPath,
  publishedURLs = [],
  publishedContent = [],
}) {
  if (!reviewPath || !Array.isArray(publishedURLs) || !Array.isArray(publishedContent))
    throw Error("Private review and publication inventory required")
  const review = readJSON(root, reviewPath)
  if (
    review?.schema !== "editorial-candidate-disposition/v1" ||
    ![
      "background_only_no_news_event",
      "insufficient_standalone_news",
      "outside_editorial_scope",
    ].includes(review.decision) ||
    review.source_read !== true ||
    review.original_candidate_preserved !== true ||
    review.candidate_published !== false ||
    typeof review.reviewer !== "string" ||
    !review.reviewer.trim() ||
    !CHECKS.every((key) =>
      review.decision === "outside_editorial_scope"
        ? typeof review.event_check?.[key] === "boolean"
        : review.event_check?.[key] === false,
    ) ||
    typeof review.event_check?.notes !== "string" ||
    !review.event_check.notes.trim() ||
    !PUBLIC_CHANNELS.every((key) => review.public_projection?.[key] === false)
  )
    throw Error("Complete, private candidate disposition review required")
  if (
    review.decision === "insufficient_standalone_news" &&
    (review.caption_read !== true ||
      review.standalone_details_checked !== true ||
      review.observed_event_preserved !== true ||
      !review.claims_not_promoted?.length)
  )
    throw Error(
      "Caption-only disposition requires preserved observations and explicit detail review",
    )
  if (
    review.decision === "outside_editorial_scope" &&
    (review.observed_event_preserved !== true ||
      review.scope_review?.full_text_read !== true ||
      review.scope_review?.technical_and_corporate_axes_checked !== true ||
      typeof review.scope_review?.article_focus !== "string" ||
      !review.scope_review.article_focus.trim() ||
      typeof review.scope_review?.notes !== "string" ||
      !review.scope_review.notes.trim() ||
      !Array.isArray(review.scope_review?.sectors_checked) ||
      review.scope_review.sectors_checked.length !== SECTORS.length ||
      new Set(review.scope_review.sectors_checked).size !== SECTORS.length ||
      !SECTORS.every((sector) => review.scope_review.sectors_checked.includes(sector)) ||
      !review.claims_not_promoted?.length)
  )
    throw Error(
      "Outside-scope disposition requires full-text review of all existing sectors and preserved events",
    )
  const selected = selectStoredSources(root, sourceRunId, [review.source_url])
  const [document] = selected.documents
  const [parse] = selected.parses
  const articleContentSha = articleContentFingerprint(parse)
  if (
    review.source_id !== sourceId(review.source_url) ||
    review.source_id !== document.source_id ||
    review.source_version_id !== document.source_version_id ||
    review.body_sha256 !== document.body_sha256 ||
    review.parse_id !== parse.parse_id ||
    parse.status !== "extracted" ||
    !samePublicationDate(review.source_published_at, parse.dates?.published_at)
  )
    throw Error("Disposition does not match the stored source, parse and publication date")
  assertReviewDate(review.reviewed_at, {
    notBefore: [document.observed_at, review.source_published_at],
  })
  const blockIds = new Set(parse.blocks.map((block) => block.block_id))
  if (
    !Array.isArray(review.claims_not_promoted) ||
    review.claims_not_promoted.some(
      (claim) =>
        !blockIds.has(claim.block_id) ||
        typeof claim.claim !== "string" ||
        !claim.claim.trim() ||
        (["insufficient_standalone_news", "outside_editorial_scope"].includes(review.decision) &&
          (typeof claim.quote !== "string" ||
            claim.quote.trim().length < 8 ||
            !parse.blocks
              .find((block) => block.block_id === claim.block_id)
              .text.includes(claim.quote))),
    )
  )
    throw Error("Disposition cites a missing source block")

  const url = canonicalURL(review.source_url)
  if (
    publishedURLs.some((published) => canonicalURL(published) === url) ||
    publishedContent.some((body) => body.includes(review.source_url))
  )
    throw Error("Candidate already appears in a published or existing edition")
  const candidateSource =
    candidateRunId === sourceRunId
      ? selected
      : selectStoredSources(root, candidateRunId, [review.source_url])
  if (candidateSource.documents[0].source_version_id !== document.source_version_id)
    throw Error("Discovery candidate and review use different source versions")
  const sourceCandidates = readJSON(root, `runs/${candidateRunId}/candidates.json`)
  const matches = sourceCandidates?.filter((candidate) =>
    candidate.source_urls?.some((source) => canonicalURL(source) === url),
  )
  if (
    matches?.length !== 1 ||
    matches[0].key !== `source-${document.source_id}` ||
    matches[0].review_status !== "unreviewed" ||
    matches[0].source_urls.length !== 1 ||
    !samePublicationDate(matches[0].source_published_at, review.source_published_at)
  )
    throw Error("One matching, dated, unreviewed discovery candidate required")
  return { review, candidate: matches[0], document, parse, articleContentSha }
}

// Reuse the native source/quote/date checks when a queue encounters a decision
// made after its input was frozen. A status label alone cannot skip processing.
export function loadCurrentCandidateDisposition(root, candidate) {
  const disposition = candidate?.disposition
  if (candidate?.review_status !== "rejected" || !disposition?.resolution_run) return null
  if (
    candidate.event_id ||
    candidate.source_revision_alert ||
    !/^[A-Za-z0-9_-]+$/.test(disposition.resolution_run)
  )
    throw Error("Candidate disposition identity changed")
  const { review, document, parse, articleContentSha } = readDispositionEvidence({
    root,
    sourceRunId: disposition.source_run,
    candidateRunId: disposition.candidate_run,
    reviewPath: disposition.review_path,
  })
  const receiptPath = `runs/${disposition.resolution_run}/candidate-disposition.json`
  const receipt = readJSON(root, receiptPath)
  if (
    receipt?.schema !== "research-candidate-disposition/v1" ||
    receipt.candidate_key !== candidate.key ||
    receipt.candidate_run !== disposition.candidate_run ||
    receipt.source_run !== disposition.source_run ||
    receipt.source_version_id !== document.source_version_id ||
    receipt.parse_id !== parse.parse_id ||
    receipt.review_path !== disposition.review_path ||
    receipt.review_sha256 !== disposition.review_sha256 ||
    receipt.review_status !== "rejected" ||
    receipt.candidate_published !== false ||
    sha256(JSON.stringify(review)) !== disposition.review_sha256 ||
    disposition.decision !== review.decision ||
    disposition.source_version_id !== document.source_version_id ||
    disposition.parse_id !== parse.parse_id ||
    disposition.article_content_sha256 !== articleContentSha ||
    candidate.article_content_sha256 !== articleContentSha ||
    candidate.source_urls?.length !== 1 ||
    candidate.source_urls[0] !== review.source_url ||
    !samePublicationDate(candidate.source_published_at, review.source_published_at)
  )
    throw Error("Current candidate disposition differs from native evidence")
  return {
    decision: review.decision,
    receipt: receiptPath,
    source_version_id: document.source_version_id,
    parse_id: parse.parse_id,
    article_content_sha256: articleContentSha,
  }
}

export async function recordCandidateDisposition({
  root,
  runId,
  sourceRunId,
  candidateRunId = sourceRunId,
  reviewPath,
  backlogFile = BACKLOG_PATH,
  publishedURLs = [],
  publishedContent = [],
}) {
  if (!/^[a-zA-Z0-9_-]+$/.test(runId || "") || runId === sourceRunId || runId === candidateRunId)
    throw Error("A distinct disposition run ID is required")
  const { review, candidate, document, parse, articleContentSha } = readDispositionEvidence({
    root,
    sourceRunId,
    candidateRunId,
    reviewPath,
    publishedURLs,
    publishedContent,
  })
  const url = canonicalURL(review.source_url)
  const reviewHash = sha256(JSON.stringify(review))
  const receiptPath = `runs/${runId}/candidate-disposition.json`
  const receipt = {
    schema: "research-candidate-disposition/v1",
    candidate_key: candidate.key,
    candidate_run: candidateRunId,
    source_run: sourceRunId,
    source_version_id: document.source_version_id,
    parse_id: parse.parse_id,
    review_path: reviewPath,
    review_sha256: reviewHash,
    review_status: "rejected",
    candidate_published: false,
  }
  return withLock(root, "run-" + runId, async () => {
    const previous = readJSON(root, receiptPath)
    if (previous && JSON.stringify(previous) !== JSON.stringify(receipt))
      throw Error("Disposition run input changed; use a new run ID")
    const backlogRoot = path.dirname(backlogFile)
    const backlogName = path.basename(backlogFile)
    const result = await withLock(backlogRoot, "candidate-backlog", async () => {
      const backlog = readJSON(backlogRoot, backlogName) || {
        schema: "research-candidates/v1",
        candidates: [],
      }
      if (backlog.schema !== "research-candidates/v1" || !Array.isArray(backlog.candidates))
        throw Error("Unsupported existing backlog")
      const found = backlog.candidates.filter(
        (old) =>
          old.key === candidate.key ||
          old.source_urls?.some((source) => canonicalURL(source) === url),
      )
      if (found.length > 1) throw Error("Disposition matches multiple existing candidates")
      const old = found[0]
      if (old) {
        if (
          old.key !== candidate.key ||
          old.source_urls?.length !== 1 ||
          canonicalURL(old.source_urls[0]) !== url
        )
          throw Error("Candidate identity changed; manual reconciliation required")
        if (
          (old.article_content_sha256 && old.article_content_sha256 !== articleContentSha) ||
          (!old.article_content_sha256 &&
            old.article_source_version_id &&
            old.article_source_version_id !== document.source_version_id)
        )
          throw Error("Cannot close a candidate with a newer observed article version")
        if (old.event_id || old.review_status === "verified")
          throw Error("Cannot reject a verified candidate or fixed event")
        if (old.review_status === "rejected") {
          if (old.disposition?.review_sha256 !== reviewHash)
            throw Error("Existing rejection has different evidence")
          // Older private decisions predate the content fingerprint. Enrich
          // their evidence without changing the editorial outcome or receipt.
          if (!old.article_content_sha256 || !old.disposition.article_content_sha256) {
            old.article_content_sha256 = articleContentSha
            old.disposition.article_content_sha256 = articleContentSha
            backlog.updated_at = new Date().toISOString()
            atomicWrite(backlogRoot, backlogName, backlog)
          }
          return { candidate_key: old.key, backlog_sha256: sha256(JSON.stringify(backlog)) }
        }
        if (!["unreviewed", "deferred"].includes(old.review_status))
          throw Error("Candidate state cannot be rejected")
      }
      const closed = {
        ...(old || candidate),
        review_status: "rejected",
        reason: review.event_check.notes,
        reviewed_at: review.reviewed_at,
        article_source_version_id: old?.article_source_version_id || document.source_version_id,
        article_parse_id: old?.article_parse_id || parse.parse_id,
        article_observed_at: old?.article_observed_at || document.observed_at,
        article_content_sha256: articleContentSha,
        disposition: {
          decision: review.decision,
          resolution_run: runId,
          candidate_run: candidateRunId,
          source_run: sourceRunId,
          source_version_id: document.source_version_id,
          article_content_sha256: articleContentSha,
          parse_id: parse.parse_id,
          review_path: reviewPath,
          review_sha256: reviewHash,
        },
      }
      delete closed.source_revision_alert
      if (old) {
        delete old.source_revision_alert
        Object.assign(old, closed)
      } else backlog.candidates.push(closed)
      backlog.updated_at = new Date().toISOString()
      atomicWrite(backlogRoot, backlogName, backlog)
      return { candidate_key: candidate.key, backlog_sha256: sha256(JSON.stringify(backlog)) }
    })
    if (!previous) atomicWrite(root, receiptPath, receipt)
    return {
      ...result,
      review_status: "rejected",
      receipt: safePath(root, receiptPath),
      candidate_published: false,
    }
  })
}
