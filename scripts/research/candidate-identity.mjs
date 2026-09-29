import path from "node:path"
import { canonicalURL } from "../garden.mjs"
import { BACKLOG_PATH } from "../research-window.mjs"
import { sourceId, sha256 } from "./contracts.mjs"
import { assertReviewDate, samePublicationDate } from "./dates.mjs"
import { articleContentFingerprint, selectStoredSources } from "./parser.mjs"
import { atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"

const REQUIRED_ASPECTS = ["identity_marker", "event_action"]

function checkedSource(root, runId, evidence) {
  const selected = selectStoredSources(root, runId, [evidence?.source_url])
  const [document] = selected.documents
  const [parse] = selected.parses
  if (
    document.source_id !== sourceId(evidence.source_url) ||
    evidence.source_id !== document.source_id ||
    evidence.source_version_id !== document.source_version_id ||
    evidence.body_sha256 !== document.body_sha256 ||
    evidence.parse_id !== parse.parse_id ||
    parse.status !== "extracted" ||
    !samePublicationDate(evidence.published_at, parse.dates?.published_at)
  )
    throw Error("Identity review does not match stored source, parse and original publication date")
  return { document, parse }
}

function citedText(parse, blockId, excerpt) {
  const block = parse.blocks.find((item) => item.block_id === blockId)
  return (
    block &&
    typeof excerpt === "string" &&
    excerpt.trim().length >= 8 &&
    block.text.includes(excerpt)
  )
}

// An explicit source-bound link between two language editions of one already
// published event. URL or company-name similarity alone is never an identity.
export async function recordCandidateIdentity({
  root,
  runId,
  sourceRunId,
  publishedSourceRunId,
  candidateRunId = sourceRunId,
  reviewPath,
  backlogFile = BACKLOG_PATH,
  publishedArticles,
}) {
  if (
    !/^[a-zA-Z0-9_-]+$/.test(runId || "") ||
    [sourceRunId, publishedSourceRunId, candidateRunId].includes(runId) ||
    !reviewPath ||
    !Array.isArray(publishedArticles)
  )
    throw Error("Distinct identity run, both stored sources and publication inventory required")
  const review = readJSON(root, reviewPath)
  if (
    review?.schema !== "editorial-candidate-identity/v1" ||
    review.decision !== "same_published_event" ||
    review.new_article !== false ||
    review.candidate_published !== false ||
    typeof review.reviewer !== "string" ||
    !review.reviewer.trim() ||
    typeof review.same_event_reason !== "string" ||
    !review.same_event_reason.trim() ||
    !Array.isArray(review.matches) ||
    review.matches.length < REQUIRED_ASPECTS.length ||
    !REQUIRED_ASPECTS.every((aspect) => review.matches.some((match) => match.aspect === aspect)) ||
    new Set(review.matches.map((match) => match.aspect)).size !== review.matches.length
  )
    throw Error("Complete private same-event review required")

  const candidate = checkedSource(root, sourceRunId, review.candidate)
  const published = checkedSource(root, publishedSourceRunId, review.published)
  if (
    !samePublicationDate(review.candidate.published_at, review.published.published_at) ||
    !/^[a-f0-9]{16,64}$/.test(review.published.event_id || "")
  )
    throw Error("Same-event sources require the same original announcement day and fixed event ID")
  assertReviewDate(review.reviewed_at, {
    notBefore: [
      candidate.document.observed_at,
      published.document.observed_at,
      review.candidate.published_at,
    ],
  })
  if (
    review.matches.some(
      (match) =>
        !citedText(candidate.parse, match.candidate_block_id, match.candidate_excerpt) ||
        !citedText(published.parse, match.published_block_id, match.published_excerpt) ||
        typeof match.conclusion !== "string" ||
        !match.conclusion.trim(),
    )
  )
    throw Error("Same-event comparison must cite exact text in both stored originals")

  const target = publishedArticles.filter(
    (article) =>
      article.event_id === review.published.event_id &&
      article.source_urls?.some(
        (url) => canonicalURL(url) === canonicalURL(review.published.source_url),
      ),
  )
  if (
    !target.some(
      (article) =>
        article.review_status === "verified" &&
        article.title === review.published.title &&
        samePublicationDate(article.published_at, review.published.published_at),
    ) ||
    publishedArticles.some(
      (article) =>
        article.source_urls?.some((url) =>
          [review.candidate.source_url, review.published.source_url].some(
            (source) => canonicalURL(url) === canonicalURL(source),
          ),
        ) && article.event_id !== review.published.event_id,
    )
  )
    throw Error(
      "Fixed event, original URL, title and publication date need an existing verified article",
    )
  if (canonicalURL(review.candidate.source_url) === canonicalURL(review.published.source_url))
    throw Error("An identical source URL already resolves without a multilingual identity review")

  const discovery =
    candidateRunId === sourceRunId
      ? candidate
      : selectStoredSources(root, candidateRunId, [review.candidate.source_url])
  const discoveryDocument = discovery.document || discovery.documents[0]
  if (discoveryDocument.source_version_id !== candidate.document.source_version_id)
    throw Error("Discovery candidate and identity review use different source versions")
  const candidates = readJSON(root, `runs/${candidateRunId}/candidates.json`)
  const sourceURL = canonicalURL(review.candidate.source_url)
  const matches = candidates?.filter((item) =>
    item.source_urls?.some((url) => canonicalURL(url) === sourceURL),
  )
  if (
    matches?.length !== 1 ||
    matches[0].key !== `source-${candidate.document.source_id}` ||
    matches[0].review_status !== "unreviewed" ||
    matches[0].source_urls.length !== 1 ||
    !samePublicationDate(matches[0].source_published_at, review.candidate.published_at)
  )
    throw Error("One matching, dated, unreviewed discovery candidate required")
  const sourceCandidate = matches[0]
  const articleContentSha = articleContentFingerprint(candidate.parse)
  const reviewHash = sha256(JSON.stringify(review))
  const receiptPath = `runs/${runId}/candidate-identity.json`
  const receipt = {
    schema: "research-candidate-identity/v1",
    candidate_key: sourceCandidate.key,
    event_id: review.published.event_id,
    candidate_run: candidateRunId,
    source_run: sourceRunId,
    published_source_run: publishedSourceRunId,
    candidate_source_version_id: candidate.document.source_version_id,
    candidate_parse_id: candidate.parse.parse_id,
    published_source_version_id: published.document.source_version_id,
    published_parse_id: published.parse.parse_id,
    review_path: reviewPath,
    review_sha256: reviewHash,
    candidate_published: false,
  }
  return withLock(root, "run-" + runId, async () => {
    const previous = readJSON(root, receiptPath)
    if (previous && JSON.stringify(previous) !== JSON.stringify(receipt))
      throw Error("Identity run input changed; use a new run ID")
    const backlogRoot = path.dirname(backlogFile)
    const backlogName = path.basename(backlogFile)
    const result = await withLock(backlogRoot, "candidate-backlog", async () => {
      const backlog = readJSON(backlogRoot, backlogName)
      if (backlog?.schema !== "research-candidates/v1" || !Array.isArray(backlog.candidates))
        throw Error("Existing discovery backlog required")
      const found = backlog.candidates.filter(
        (item) =>
          item.key === sourceCandidate.key ||
          item.source_urls?.some((url) => canonicalURL(url) === sourceURL),
      )
      if (found.length !== 1 || found[0].key !== sourceCandidate.key)
        throw Error("Candidate identity changed; manual reconciliation required")
      const old = found[0]
      if (
        old.source_urls?.length !== 1 ||
        canonicalURL(old.source_urls[0]) !== sourceURL ||
        (old.article_content_sha256 && old.article_content_sha256 !== articleContentSha) ||
        (!old.article_content_sha256 &&
          old.article_source_version_id &&
          old.article_source_version_id !== candidate.document.source_version_id)
      )
        throw Error("Cannot link a candidate with newer observed article content")
      if (old.identity) {
        if (
          old.review_status !== "verified" ||
          old.event_id !== receipt.event_id ||
          old.identity.review_sha256 !== reviewHash
        )
          throw Error("Existing same-event identity has different evidence")
        return { candidate_key: old.key, backlog_sha256: sha256(JSON.stringify(backlog)) }
      }
      const revisionOfSameEvent =
        old.event_id === receipt.event_id &&
        old.review_status === "deferred" &&
        old.source_revision_alert &&
        old.identity_history?.length &&
        !old.identity
      if (
        (old.event_id && !revisionOfSameEvent) ||
        !["unreviewed", "deferred"].includes(old.review_status)
      )
        throw Error("Cannot replace an existing candidate event or editorial disposition")
      old.review_status = "verified"
      old.event_id = receipt.event_id
      old.reviewed_at = review.reviewed_at
      old.article_source_version_id = candidate.document.source_version_id
      old.article_parse_id = candidate.parse.parse_id
      old.article_observed_at = candidate.document.observed_at
      old.article_content_sha256 = articleContentSha
      old.identity = {
        decision: review.decision,
        candidate_run: candidateRunId,
        source_run: sourceRunId,
        published_source_run: publishedSourceRunId,
        source_version_id: candidate.document.source_version_id,
        article_content_sha256: articleContentSha,
        parse_id: candidate.parse.parse_id,
        review_path: reviewPath,
        review_sha256: reviewHash,
      }
      delete old.reason
      delete old.source_revision_alert
      backlog.updated_at = new Date().toISOString()
      atomicWrite(backlogRoot, backlogName, backlog)
      return { candidate_key: old.key, backlog_sha256: sha256(JSON.stringify(backlog)) }
    })
    if (!previous) atomicWrite(root, receiptPath, receipt)
    return {
      ...result,
      event_id: receipt.event_id,
      review_status: "verified",
      receipt: safePath(root, receiptPath),
      candidate_published: false,
    }
  })
}
