import fs from "node:fs"
import path from "node:path"
import { canonicalURL } from "../garden.mjs"
import { titleDayKey } from "../article-identity.mjs"
import { BACKLOG_PATH } from "../research-window.mjs"
import { sha256 } from "./contracts.mjs"
import { assertReviewDate, parseResearchDate, samePublicationDate } from "./dates.mjs"
import { articleContentFingerprint, loadStoredSourceRun } from "./parser.mjs"
import { approvedArticle } from "./publish-adapter.mjs"
import { atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"
import { verifyExistingEditorialApproval } from "./existing-editorial-approval.mjs"
import { assertProcessedFactReview } from "./evidence-review-packet.mjs"
import { buildCandidateSourceAlternativeResolution } from "./candidate-source-alternative.mjs"

function candidateMatchesEventDate(article, candidateDate, sourceDate) {
  const review = article.article_review
  return (
    samePublicationDate(review.published_at, candidateDate) ||
    (review.date_kind === "source-publication-time" &&
      samePublicationDate(candidateDate, review.source_published_at) &&
      samePublicationDate(review.source_published_at, sourceDate))
  )
}

function verifySameSourceRevision({
  root,
  approvedRunId,
  candidateSourceRunId,
  sourceRevisionReviewPath,
  candidateKey,
  candidate,
  article,
  approvedDocuments,
  approvedParses,
}) {
  const reviewPath = safePath(root, sourceRevisionReviewPath)
  const reviewBytes = fs.readFileSync(reviewPath)
  const review = JSON.parse(reviewBytes.toString("utf8"))
  const currentRun = loadStoredSourceRun(root, candidateSourceRunId)
  const currentCandidates = readJSON(root, `runs/${candidateSourceRunId}/candidates.json`)
  const matches = Array.isArray(currentCandidates)
    ? currentCandidates.filter((item) => item.key === candidateKey)
    : []
  const observation = matches[0]
  if (
    review?.schema !== "research-candidate-approval-source-revision-review/v1" ||
    review.candidate_key !== candidateKey ||
    review.event_id !== article.event_id ||
    review.approved_run !== approvedRunId ||
    review.candidate_source_run !== candidateSourceRunId ||
    typeof review.reviewer !== "string" ||
    !review.reviewer.trim() ||
    review.source_read !== true ||
    review.revision_read !== true ||
    review.title_checked !== true ||
    review.dates_checked !== true ||
    review.numbers_checked !== true ||
    review.new_article !== false ||
    review.candidate_published !== false ||
    typeof review.same_content_reason !== "string" ||
    !review.same_content_reason.trim() ||
    !Array.isArray(review.source_urls) ||
    matches.length !== 1 ||
    !Array.isArray(observation?.source_urls) ||
    observation.source_urls.length !== 1
  )
    throw Error("Complete same-source revision review required")

  const originalURL = canonicalURL(candidate.source_urls?.[0] || "")
  if (
    canonicalURL(observation.source_urls[0]) !== originalURL ||
    observation.article_source_version_id !== candidate.article_source_version_id ||
    observation.article_parse_id !== candidate.article_parse_id ||
    observation.article_content_sha256 !== candidate.article_content_sha256 ||
    !samePublicationDate(observation.source_published_at, candidate.source_published_at)
  )
    throw Error("Current candidate does not match the observed source run")

  const sourceURLs = [...new Set(article.source_urls.map(canonicalURL))].sort()
  const reviewedURLs = [...new Set(review.source_urls.map(canonicalURL))].sort()
  if (
    JSON.stringify(sourceURLs) !== JSON.stringify(reviewedURLs) ||
    !sourceURLs.includes(originalURL)
  )
    throw Error("Revision review must cover the approved article's exact source URLs")

  const sources = sourceURLs.map((url) => {
    const oldDocuments = approvedDocuments.filter((item) => canonicalURL(item.original_url) === url)
    const newDocuments = currentRun.documents.filter(
      (item) => canonicalURL(item.original_url) === url,
    )
    if (oldDocuments.length !== 1 || newDocuments.length !== 1)
      throw Error("Approved and current source runs must contain every cited source")
    const oldDocument = oldDocuments[0]
    const newDocument = newDocuments[0]
    const oldParse = approvedParses.find(
      (item) => item.source_version_id === oldDocument.source_version_id,
    )
    const newParse = currentRun.parses.find(
      (item) => item.source_version_id === newDocument.source_version_id,
    )
    if (
      !oldParse ||
      !newParse ||
      oldParse.status !== "extracted" ||
      newParse.status !== "extracted" ||
      oldParse.title !== newParse.title ||
      articleContentFingerprint(oldParse) !== articleContentFingerprint(newParse) ||
      JSON.stringify(oldParse.blocks.map((block) => block.text)) !==
        JSON.stringify(newParse.blocks.map((block) => block.text)) ||
      (oldParse.dates?.published_at ?? null) !== (newParse.dates?.published_at ?? null) ||
      (url !== originalURL && oldDocument.body_sha256 !== newDocument.body_sha256)
    )
      throw Error("Approved and current cited source content or dates differ")
    return {
      url,
      approved_source_version_id: oldDocument.source_version_id,
      approved_parse_id: oldParse.parse_id,
      approved_body_sha256: oldDocument.body_sha256,
      current_source_version_id: newDocument.source_version_id,
      current_parse_id: newParse.parse_id,
      current_body_sha256: newDocument.body_sha256,
      article_content_sha256: articleContentFingerprint(newParse),
      title: newParse.title,
      published_at: newParse.dates?.published_at || null,
      body_bytes_identical: oldDocument.body_sha256 === newDocument.body_sha256,
    }
  })
  const primary = sources.find((item) => item.url === originalURL)
  if (
    !primary ||
    primary.current_source_version_id !== candidate.article_source_version_id ||
    primary.current_parse_id !== candidate.article_parse_id ||
    primary.article_content_sha256 !== candidate.article_content_sha256 ||
    !samePublicationDate(primary.published_at, candidate.source_published_at) ||
    !candidateMatchesEventDate(article, candidate.source_published_at, primary.published_at)
  )
    throw Error("Reviewed source revision does not match the current candidate and event date")
  assertReviewDate(review.reviewed_at, {
    notBefore: [
      ...currentRun.documents.map((item) => item.observed_at),
      candidate.source_published_at,
    ],
  })
  return {
    observation_run: candidateSourceRunId,
    review_path: sourceRevisionReviewPath,
    review_sha256: sha256(reviewBytes),
    reviewer: review.reviewer.trim(),
    reviewed_at: parseResearchDate(review.reviewed_at)?.day || null,
    sources,
  }
}

// Link an already reviewed private article to its discovery candidate. This
// never creates an edition, changes its cutoff, or marks the article published.
export async function recordCandidateApproval({
  root,
  approvedRoot = root,
  runId,
  approvedRunId,
  candidateKey,
  candidateSourceRunId = null,
  sourceRevisionReviewPath = null,
  sourceAlternativeResolutionRunId = null,
  existingEditorialReviewPath = null,
  backlogFile = BACKLOG_PATH,
  publishedArticles = [],
}) {
  if (
    !/^[a-zA-Z0-9_-]+$/.test(runId || "") ||
    !/^[a-zA-Z0-9_-]+$/.test(approvedRunId || "") ||
    runId === approvedRunId ||
    !/^[a-zA-Z0-9_-]+$/.test(candidateKey || "") ||
    (candidateSourceRunId && !/^[a-zA-Z0-9_-]+$/.test(candidateSourceRunId)) ||
    Boolean(candidateSourceRunId) !== Boolean(sourceRevisionReviewPath) ||
    (candidateSourceRunId && candidateSourceRunId === runId) ||
    (sourceAlternativeResolutionRunId &&
      (!/^[a-zA-Z0-9_-]+$/.test(sourceAlternativeResolutionRunId) ||
        [runId, approvedRunId].includes(sourceAlternativeResolutionRunId))) ||
    !Array.isArray(publishedArticles)
  )
    throw Error("Distinct approval link run, reviewed article run and candidate key required")

  return withLock(approvedRoot, "run-" + approvedRunId, () =>
    linkCandidateApproval({
      root,
      approvedRoot,
      runId,
      approvedRunId,
      candidateKey,
      candidateSourceRunId,
      sourceRevisionReviewPath,
      sourceAlternativeResolutionRunId,
      existingEditorialReviewPath,
      backlogFile,
      publishedArticles,
    }),
  )
}

async function linkCandidateApproval({
  root,
  approvedRoot,
  runId,
  approvedRunId,
  candidateKey,
  candidateSourceRunId,
  sourceRevisionReviewPath,
  sourceAlternativeResolutionRunId,
  existingEditorialReviewPath,
  backlogFile,
  publishedArticles,
}) {
  if (candidateSourceRunId && sourceAlternativeResolutionRunId)
    throw Error("Same-source revision and alternate-source approval are separate review paths")
  if (
    existingEditorialReviewPath &&
    (approvedRoot !== root || candidateSourceRunId || sourceAlternativeResolutionRunId)
  )
    throw Error("Existing editorial linkage requires a separate same-root review path")
  const stored = loadStoredSourceRun(approvedRoot, approvedRunId)
  const { documents, parses } = stored
  const draft = readJSON(approvedRoot, `runs/${approvedRunId}/draft.json`)
  const reviewed = readJSON(approvedRoot, `runs/${approvedRunId}/reviewed-claims.json`)
  const decision = readJSON(approvedRoot, `runs/${approvedRunId}/editorial-review.json`)
  const storedArticle = readJSON(approvedRoot, `runs/${approvedRunId}/approved-article.json`)
  if (!draft || !reviewed || !decision || !storedArticle)
    throw Error("Complete private fact and editorial approval required")
  await assertProcessedFactReview(approvedRoot, approvedRunId, reviewed)
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
      const sourceRevision = candidateSourceRunId
        ? verifySameSourceRevision({
            root,
            approvedRunId,
            candidateSourceRunId,
            sourceRevisionReviewPath,
            candidateKey,
            candidate,
            article,
            approvedDocuments: documents,
            approvedParses: parses,
          })
        : null
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
          (sourceAlternative
            ? item.parse_id === sourceAlternative.parse_id
            : sourceRevision ||
              !candidate.article_parse_id ||
              item.parse_id === candidate.article_parse_id),
      )
      if (!parse || parse.status !== "extracted")
        throw Error("Approved candidate needs its exact extracted parse")
      const contentSha = articleContentFingerprint(parse)
      const alternativeConfirmsEventDate =
        sourceAlternative?.decision === "same_event" &&
        samePublicationDate(sourceAlternative.published_at, article.article_review.published_at)
      if (
        !article.source_urls.some((articleURL) => canonicalURL(articleURL) === sourceUrl) ||
        (!candidateMatchesEventDate(
          article,
          candidate.source_published_at,
          parse.dates?.published_at,
        ) &&
          !alternativeConfirmsEventDate) ||
        (!sourceAlternative &&
          !samePublicationDate(candidate.source_published_at, parse.dates?.published_at)) ||
        (!sourceAlternative &&
          !sourceRevision &&
          candidate.article_source_version_id &&
          candidate.article_source_version_id !== document.source_version_id) ||
        (!sourceAlternative &&
          !sourceRevision &&
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

      const existingEditorial = existingEditorialReviewPath
        ? await verifyExistingEditorialApproval({
            root,
            runId,
            approvedRunId,
            candidate,
            article,
            parses,
            reviewPath: existingEditorialReviewPath,
          })
        : null
      const receipt = {
        schema: "research-candidate-approval/v1",
        candidate_key: candidateKey,
        event_id: article.event_id,
        approved_run: approvedRunId,
        article_sha256: articleHash,
        source_version_id: sourceRevision
          ? candidate.article_source_version_id
          : document.source_version_id,
        parse_id: sourceRevision ? candidate.article_parse_id : parse.parse_id,
        article_content_sha256: contentSha,
        ...(sourceAlternative ? { source_alternative: sourceAlternative } : {}),
        ...(sourceRevision
          ? {
              reviewed_source_version_id: document.source_version_id,
              reviewed_parse_id: parse.parse_id,
              source_revision: sourceRevision,
            }
          : {}),
        ...(existingEditorial ? { existing_editorial_approval: existingEditorial } : {}),
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
      let reboundChanged = false
      if (candidate.approval) {
        const priorBinding = candidate.approval
        const rebound =
          sourceRevision &&
          !sourceAlternative &&
          ["verified", "deferred"].includes(candidate.review_status) &&
          candidate.event_id === article.event_id &&
          priorBinding.approved_run === approvedRunId &&
          priorBinding.article_sha256 === receipt.article_sha256 &&
          !priorBinding.source_alternative_resolution_run
        if (
          existingEditorial?.prior_approval &&
          priorBinding.approved_run === existingEditorial.prior_approved_run
        ) {
          candidate.approval_history = [
            ...(candidate.approval_history || []),
            {
              approval: structuredClone(priorBinding),
              event_id: candidate.event_id,
              review_status: candidate.review_status,
              reviewed_at: candidate.reviewed_at,
              existing_editorial_approval: existingEditorial,
            },
          ]
          candidate.approval = {
            approved_run: approvedRunId,
            article_sha256: receipt.article_sha256,
            source_version_id: receipt.source_version_id,
            parse_id: receipt.parse_id,
            article_content_sha256: contentSha,
            existing_editorial_approval: existingEditorial,
          }
          candidate.reviewed_at = article.article_review.reviewed_at
          backlog.updated_at = new Date().toISOString()
          reboundChanged = true
        } else if (rebound) {
          const binding = {
            approved_run: approvedRunId,
            article_sha256: receipt.article_sha256,
            source_version_id: receipt.source_version_id,
            parse_id: receipt.parse_id,
            article_content_sha256: contentSha,
            reviewed_source_version_id: document.source_version_id,
            reviewed_parse_id: parse.parse_id,
            source_revision: sourceRevision,
          }
          if (JSON.stringify(priorBinding) !== JSON.stringify(binding)) {
            candidate.approval_history = [
              ...(candidate.approval_history || []),
              {
                approval: priorBinding,
                review_status: candidate.review_status,
                source_revision_alert: candidate.source_revision_alert || null,
                reviewed_at: candidate.reviewed_at || null,
              },
            ]
            candidate.approval = binding
            candidate.review_status = "verified"
            candidate.reviewed_at = sourceRevision.reviewed_at
            delete candidate.source_revision_alert
            delete candidate.reason
            backlog.updated_at = new Date().toISOString()
            reboundChanged = true
          }
        }
        if (
          candidate.review_status !== "verified" ||
          candidate.event_id !== article.event_id ||
          JSON.stringify(candidate.approval) !==
            JSON.stringify({
              approved_run: approvedRunId,
              article_sha256: receipt.article_sha256,
              source_version_id: receipt.source_version_id,
              parse_id: receipt.parse_id,
              article_content_sha256: contentSha,
              ...(existingEditorial ? { existing_editorial_approval: existingEditorial } : {}),
              ...(sourceAlternative
                ? {
                    source_url: sourceUrl,
                    source_alternative_resolution_run: sourceAlternative.run_id,
                    source_alternative_resolution_sha256: sourceAlternative.receipt_sha256,
                  }
                : {}),
              ...(sourceRevision
                ? {
                    reviewed_source_version_id: document.source_version_id,
                    reviewed_parse_id: parse.parse_id,
                    source_revision: sourceRevision,
                  }
                : {}),
            })
        )
          throw Error("Candidate has a different editorial approval")
      } else {
        if (
          (!existingEditorial &&
            (!["unreviewed", "deferred"].includes(candidate.review_status) ||
              candidate.event_id)) ||
          candidate.identity ||
          candidate.disposition ||
          candidate.source_revision_alert
        )
          throw Error("Candidate already has another editorial disposition")
        // Legacy candidates may have an exact URL and date but no captured
        // source identity. Backfill only missing values from this approved
        // article's verified source; any existing conflicting value failed
        // the checks above.
        if (!sourceAlternative && !sourceRevision) {
          candidate.article_source_version_id = document.source_version_id
          candidate.article_parse_id = parse.parse_id
          candidate.article_observed_at = document.observed_at
          candidate.article_content_sha256 = contentSha
        }
        if (existingEditorial)
          candidate.approval_history = [
            ...(candidate.approval_history || []),
            {
              legacy_editorial_approval_run: candidate.editorial_approval_run,
              event_id: candidate.event_id,
              review_status: candidate.review_status,
              reviewed_at: candidate.reviewed_at,
              existing_editorial_approval: existingEditorial,
            },
          ]
        candidate.review_status = "verified"
        candidate.event_id = article.event_id
        candidate.reviewed_at = article.article_review.reviewed_at
        candidate.approval = {
          approved_run: approvedRunId,
          article_sha256: receipt.article_sha256,
          source_version_id: receipt.source_version_id,
          parse_id: receipt.parse_id,
          article_content_sha256: contentSha,
          ...(existingEditorial ? { existing_editorial_approval: existingEditorial } : {}),
          ...(sourceAlternative
            ? {
                source_url: sourceUrl,
                source_alternative_resolution_run: sourceAlternative.run_id,
                source_alternative_resolution_sha256: sourceAlternative.receipt_sha256,
              }
            : {}),
          ...(sourceRevision
            ? {
                reviewed_source_version_id: document.source_version_id,
                reviewed_parse_id: parse.parse_id,
                source_revision: sourceRevision,
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
      if (reboundChanged) atomicWrite(backlogRoot, backlogName, backlog)
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
