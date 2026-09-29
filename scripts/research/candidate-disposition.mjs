import path from "node:path"
import { canonicalURL } from "../garden.mjs"
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
  if (!reviewPath || !Array.isArray(publishedURLs) || !Array.isArray(publishedContent))
    throw Error("Private review and publication inventory required")
  const review = readJSON(root, reviewPath)
  if (
    review?.schema !== "editorial-candidate-disposition/v1" ||
    review.decision !== "background_only_no_news_event" ||
    review.source_read !== true ||
    review.original_candidate_preserved !== true ||
    review.candidate_published !== false ||
    typeof review.reviewer !== "string" ||
    !review.reviewer.trim() ||
    !CHECKS.every((key) => review.event_check?.[key] === false) ||
    typeof review.event_check?.notes !== "string" ||
    !review.event_check.notes.trim() ||
    !PUBLIC_CHANNELS.every((key) => review.public_projection?.[key] === false)
  )
    throw Error("Complete, private background-only review required")
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
        !blockIds.has(claim.block_id) || typeof claim.claim !== "string" || !claim.claim.trim(),
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
  const candidate = matches[0]
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
