import fs from "node:fs"
import path from "node:path"
import { canonicalURL } from "../garden.mjs"
import { titleDayKey } from "../article-identity.mjs"
import { BACKLOG_PATH } from "../research-window.mjs"
import { sha256 } from "./contracts.mjs"
import { parseResearchDate, samePublicationDate } from "./dates.mjs"
import { articleContentFingerprint, loadStoredSourceRun } from "./parser.mjs"
import { approvedArticle } from "./publish-adapter.mjs"
import { atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"
import { buildCandidateSourceAlternativeResolution } from "./candidate-source-alternative.mjs"

// Link an already reviewed private article to its discovery candidate. This
// never creates an edition, changes its cutoff, or marks the article published.
export async function recordCandidateApproval({
  root,
  runId,
  approvedRunId,
  candidateKey,
  sourceAlternativeResolutionRunId = null,
  backlogFile = BACKLOG_PATH,
  publishedArticles = [],
}) {
  if (
    !/^[a-zA-Z0-9_-]+$/.test(runId || "") ||
    !/^[a-zA-Z0-9_-]+$/.test(approvedRunId || "") ||
    runId === approvedRunId ||
    !/^[a-zA-Z0-9_-]+$/.test(candidateKey || "") ||
    (sourceAlternativeResolutionRunId &&
      (!/^[a-zA-Z0-9_-]+$/.test(sourceAlternativeResolutionRunId) ||
        [runId, approvedRunId].includes(sourceAlternativeResolutionRunId))) ||
    !Array.isArray(publishedArticles)
  )
    throw Error("Distinct approval link run, reviewed article run and candidate key required")

  return withLock(root, "run-" + approvedRunId, () =>
    linkCandidateApproval({
      root,
      runId,
      approvedRunId,
      candidateKey,
      sourceAlternativeResolutionRunId,
      backlogFile,
      publishedArticles,
    }),
  )
}

async function linkCandidateApproval({
  root,
  runId,
  approvedRunId,
  candidateKey,
  sourceAlternativeResolutionRunId,
  backlogFile,
  publishedArticles,
}) {
  const stored = loadStoredSourceRun(root, approvedRunId)
  const { documents, parses } = stored
  const draft = readJSON(root, `runs/${approvedRunId}/draft.json`)
  const reviewed = readJSON(root, `runs/${approvedRunId}/reviewed-claims.json`)
  const decision = readJSON(root, `runs/${approvedRunId}/editorial-review.json`)
  const storedArticle = readJSON(root, `runs/${approvedRunId}/approved-article.json`)
  if (!draft || !reviewed || !decision || !storedArticle)
    throw Error("Complete private fact and editorial approval required")
  const article = approvedArticle(draft, reviewed.claims, documents, decision, parses)
  if (sha256(JSON.stringify(article)) !== sha256(JSON.stringify(storedArticle)))
    throw Error("Stored approved article differs from its reviewed source and draft")
  if (article.article_review?.review_status !== "verified")
    throw Error("Only verified articles can close a discovery candidate")

  const receiptPath = `runs/${runId}/candidate-approval.json`
  return withLock(root, "run-" + runId, async () => {
    const backlogRoot = path.dirname(backlogFile)
    const backlogName = path.basename(backlogFile)
    return withLock(backlogRoot, "candidate-backlog", async () => {
      const backlogBytes = fs.readFileSync(path.resolve(backlogFile))
      const backlog = JSON.parse(backlogBytes.toString("utf8"))
      if (backlog?.schema !== "research-candidates/v1" || !Array.isArray(backlog.candidates))
        throw Error("Existing candidate backlog required")
      const matches = backlog.candidates.filter((item) => item.key === candidateKey)
      if (matches.length !== 1) throw Error("One exact discovery candidate required")
      const candidate = matches[0]
      if (candidate.source_urls?.length !== 1 || !candidate.source_published_at)
        throw Error("Dated candidate with one original URL required")
      const originalUrl = canonicalURL(candidate.source_urls[0])
      let sourceUrl = originalUrl
      let sourceAlternative = null
      if (sourceAlternativeResolutionRunId) {
        const resolutionPath = `runs/${sourceAlternativeResolutionRunId}/candidate-source-alternative.json`
        const reviewPath = `runs/${sourceAlternativeResolutionRunId}/candidate-source-alternative-review.json`
        const resolutionBytes = fs.readFileSync(safePath(root, resolutionPath))
        const resolution = JSON.parse(resolutionBytes.toString("utf8"))
        const reviewBytes = fs.readFileSync(safePath(root, reviewPath))
        const alternateReview = JSON.parse(reviewBytes.toString("utf8"))
        const priorApproval = readJSON(root, receiptPath)
        const resolutionSha256 = sha256(resolutionBytes)
        const alreadyLinked =
          candidate.review_status === "verified" &&
          candidate.event_id === article.event_id &&
          candidate.approval?.approved_run === approvedRunId &&
          candidate.approval?.source_alternative_resolution_run ===
            sourceAlternativeResolutionRunId &&
          candidate.approval?.source_alternative_resolution_sha256 === resolutionSha256 &&
          priorApproval?.candidate_key === candidateKey &&
          priorApproval?.event_id === article.event_id &&
          priorApproval?.source_alternative?.receipt_sha256 === resolutionSha256
        const reviewedClaims = reviewed.claims
        const replayed = buildCandidateSourceAlternativeResolution({
          candidate,
          review: alternateReview,
          sourceRunId: approvedRunId,
          sourceRunIdentity: stored.identity,
          documents,
          parses,
          reviewedClaims,
          reviewSha256: sha256(reviewBytes),
          backlogSha256: alreadyLinked ? resolution.inputs?.backlog_sha256 : sha256(backlogBytes),
          generatedAt: resolution.generated_at,
        })
        if (
          sha256(reviewBytes) !== resolution.inputs?.review_sha256 ||
          (!alreadyLinked && sha256(backlogBytes) !== resolution.inputs?.backlog_sha256) ||
          JSON.stringify(replayed) !== JSON.stringify(resolution) ||
          resolution.decision !== "same_event" ||
          resolution.candidate_key !== candidateKey ||
          resolution.original_source?.url !== originalUrl ||
          resolution.inputs?.source_run_id !== approvedRunId
        )
          throw Error(
            "Same-event alternate-source resolution does not match this candidate approval",
          )
        sourceUrl = canonicalURL(resolution.alternative_source.url)
        sourceAlternative = {
          run_id: sourceAlternativeResolutionRunId,
          receipt_sha256: resolutionSha256,
          original_url: originalUrl,
          alternative_url: sourceUrl,
          decision: resolution.decision,
          published_at: parseResearchDate(resolution.alternative_source.published_at)?.day || null,
          source_version_id: resolution.alternative_source.source_version_id,
          parse_id: resolution.alternative_source.parse_id,
          content_sha256: resolution.alternative_source.content_sha256,
        }
      }
      const matchedDocuments = documents.filter(
        (document) => canonicalURL(document.original_url) === sourceUrl,
      )
      if (matchedDocuments.length !== 1)
        throw Error("Approved run lacks the exact candidate or reviewed alternate source")
      const document = matchedDocuments[0]
      const parse = parses.find(
        (item) =>
          item.source_version_id === document.source_version_id &&
          (!sourceAlternative || item.parse_id === sourceAlternative.parse_id),
      )
      if (!parse || parse.status !== "extracted")
        throw Error("Approved candidate needs its exact extracted parse")
      const contentSha = articleContentFingerprint(parse)
      const alternativeConfirmsEventDate =
        sourceAlternative?.decision === "same_event" &&
        samePublicationDate(sourceAlternative.published_at, article.article_review.published_at)
      if (
        !article.source_urls.some((articleURL) => canonicalURL(articleURL) === sourceUrl) ||
        (!samePublicationDate(candidate.source_published_at, article.article_review.published_at) &&
          !alternativeConfirmsEventDate) ||
        (!sourceAlternative &&
          candidate.article_source_version_id &&
          candidate.article_source_version_id !== document.source_version_id) ||
        (!sourceAlternative &&
          candidate.article_parse_id &&
          candidate.article_parse_id !== parse.parse_id) ||
        (!sourceAlternative &&
          candidate.article_content_sha256 &&
          candidate.article_content_sha256 !== contentSha)
      )
        throw Error("Candidate and approved article differ in URL, date or source version")
      if (
        publishedArticles.some((existing) =>
          existing.source_urls?.some((existingURL) =>
            [originalUrl, sourceUrl].includes(canonicalURL(existingURL)),
          ),
        )
      )
        throw Error("Candidate source already appears in an edition")
      const candidateTitleDay = titleDayKey(candidate.title, candidate.source_published_at)
      if (
        candidateTitleDay &&
        publishedArticles.some(
          (existing) =>
            existing.event_id !== article.event_id &&
            titleDayKey(existing.title, existing.published_at) === candidateTitleDay,
        )
      )
        throw Error("Published article has the same title and original day; review event identity")

      const articleHash = sha256(JSON.stringify(article))
      for (const other of backlog.candidates.filter((item) => item.key !== candidateKey)) {
        const sameExtractedContent =
          candidate.article_content_sha256 &&
          other.article_content_sha256 === candidate.article_content_sha256 &&
          samePublicationDate(other.source_published_at, candidate.source_published_at)
        const sameTitleDay =
          candidateTitleDay &&
          titleDayKey(other.title, other.source_published_at) === candidateTitleDay
        if (
          (sameExtractedContent || sameTitleDay) &&
          other.event_id &&
          other.event_id !== article.event_id
        )
          throw Error(
            "Matching source content or title/day belongs to another event; review identity",
          )
        if (other.event_id === article.event_id) {
          if (
            other.approval?.approved_run !== approvedRunId ||
            other.approval?.article_sha256 !== articleHash ||
            ![...other.source_urls, ...(other.alternate_sources || []).map((source) => source.url)]
              .filter(Boolean)
              .some((sourceURL) =>
                article.source_urls.some(
                  (articleURL) => canonicalURL(articleURL) === canonicalURL(sourceURL),
                ),
              )
          )
            throw Error("Event belongs to another candidate approval; review identity")
        }
      }

      const receipt = {
        schema: "research-candidate-approval/v1",
        candidate_key: candidateKey,
        event_id: article.event_id,
        approved_run: approvedRunId,
        article_sha256: articleHash,
        source_version_id: document.source_version_id,
        parse_id: parse.parse_id,
        article_content_sha256: contentSha,
        ...(sourceAlternative ? { source_alternative: sourceAlternative } : {}),
        candidate_published: false,
      }
      const previous = readJSON(root, receiptPath)
      const previousWithoutAlternativeDate = previous ? structuredClone(previous) : null
      const receiptWithoutAlternativeDate = structuredClone(receipt)
      if (previousWithoutAlternativeDate?.source_alternative)
        delete previousWithoutAlternativeDate.source_alternative.published_at
      if (receiptWithoutAlternativeDate.source_alternative)
        delete receiptWithoutAlternativeDate.source_alternative.published_at
      if (
        previous &&
        JSON.stringify(previous) !== JSON.stringify(receipt) &&
        JSON.stringify(previousWithoutAlternativeDate) !==
          JSON.stringify(receiptWithoutAlternativeDate)
      )
        throw Error("Candidate approval link changed; use a new run ID")
      if (candidate.approval) {
        if (
          candidate.review_status !== "verified" ||
          candidate.event_id !== article.event_id ||
          JSON.stringify(candidate.approval) !==
            JSON.stringify({
              approved_run: approvedRunId,
              article_sha256: receipt.article_sha256,
              source_version_id: document.source_version_id,
              parse_id: parse.parse_id,
              article_content_sha256: contentSha,
              ...(sourceAlternative
                ? {
                    source_url: sourceUrl,
                    source_alternative_resolution_run: sourceAlternative.run_id,
                    source_alternative_resolution_sha256: sourceAlternative.receipt_sha256,
                  }
                : {}),
            })
        )
          throw Error("Candidate has a different editorial approval")
      } else {
        if (
          !["unreviewed", "deferred"].includes(candidate.review_status) ||
          candidate.event_id ||
          candidate.identity ||
          candidate.disposition ||
          candidate.source_revision_alert
        )
          throw Error("Candidate already has another editorial disposition")
        // Legacy candidates may have an exact URL and date but no captured
        // source identity. Backfill only missing values from this approved
        // article's verified source; any existing conflicting value failed
        // the checks above.
        if (!sourceAlternative) {
          candidate.article_source_version_id = document.source_version_id
          candidate.article_parse_id = parse.parse_id
          candidate.article_observed_at = document.observed_at
          candidate.article_content_sha256 = contentSha
        }
        candidate.review_status = "verified"
        candidate.event_id = article.event_id
        candidate.reviewed_at = article.article_review.reviewed_at
        candidate.approval = {
          approved_run: approvedRunId,
          article_sha256: receipt.article_sha256,
          source_version_id: document.source_version_id,
          parse_id: parse.parse_id,
          article_content_sha256: contentSha,
          ...(sourceAlternative
            ? {
                source_url: sourceUrl,
                source_alternative_resolution_run: sourceAlternative.run_id,
                source_alternative_resolution_sha256: sourceAlternative.receipt_sha256,
              }
            : {}),
        }
        if (sourceAlternative) {
          candidate.alternate_sources = [
            ...(candidate.alternate_sources || []).filter(
              (source) => canonicalURL(source.url) !== sourceUrl,
            ),
            {
              url: sourceUrl,
              relationship: "same_event_official_alternative",
              resolution_run: sourceAlternative.run_id,
              resolution_sha256: sourceAlternative.receipt_sha256,
              source_version_id: document.source_version_id,
              parse_id: parse.parse_id,
              article_content_sha256: contentSha,
              observed_at: document.observed_at,
            },
          ]
          candidate.source_attempts = [
            ...(candidate.source_attempts || []).filter(
              (attempt) =>
                attempt.attempt_id !== approvedRunId ||
                canonicalURL(attempt.source_url || originalUrl) !== sourceUrl,
            ),
            {
              key: candidate.key,
              attempt_id: approvedRunId,
              source_url: sourceUrl,
              source_role: "official_alternative",
              article_source_version_id: document.source_version_id,
              article_parse_id: parse.parse_id,
              article_content_sha256: contentSha,
            },
          ]
        }
        delete candidate.reason
        backlog.updated_at = new Date().toISOString()
        atomicWrite(backlogRoot, backlogName, backlog)
      }
      if (!previous) atomicWrite(root, receiptPath, receipt)
      return {
        candidate_key: candidateKey,
        event_id: article.event_id,
        review_status: "verified",
        backlog_sha256: sha256(JSON.stringify(backlog)),
        receipt: safePath(root, receiptPath),
        candidate_published: false,
      }
    })
  })
}
