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
import {
  verifyExistingEditorialApproval,
  loadExistingEditorialRevision,
} from "./existing-editorial-approval.mjs"
import { assertProcessedFactReview } from "./evidence-review-packet.mjs"
import { buildCandidateSourceAlternativeResolution } from "./candidate-source-alternative.mjs"
import { loadHistoricalApproval } from "./preview.mjs"
import { findApprovalReceipts } from "./approval-receipts.mjs"

function candidateMatchesEventDate(article, candidateDate, sourceDate) {
  const review = article.article_review
  return (
    samePublicationDate(review.published_at, candidateDate) ||
    (review.date_kind === "source-publication-time" &&
      samePublicationDate(candidateDate, review.source_published_at) &&
      samePublicationDate(review.source_published_at, sourceDate))
  )
}

// This is source maintenance of an already published event, never a new article.
// Keep the previous native approval receipt in the portable evidence chain.
export function assertPublishedEventRebind(root, receipt, ancestors = []) {
  const rebind = receipt?.published_event_rebind
  if (!rebind) return null
  const prior = rebind.previous_approval
  if (
    !/^runs\/[A-Za-z0-9_-]+\/candidate-approval\.json$/.test(prior?.path || "") ||
    !/^[a-f0-9]{64}$/.test(prior.sha256 || "") ||
    ancestors.includes(prior.path) ||
    ancestors.length >= 32 ||
    rebind.new_article !== false ||
    rebind.candidate_published !== false ||
    !receipt.source_revision ||
    rebind.publication?.event_id !== receipt.event_id ||
    typeof rebind.publication?.edition !== "string" ||
    !rebind.publication.edition.trim() ||
    !Array.isArray(rebind.published_articles) ||
    !rebind.published_articles.length ||
    rebind.published_articles.some(
      (article) =>
        article.event_id !== receipt.event_id ||
        !samePublicationDate(article.published_at, rebind.publication.published_at) ||
        typeof article.title !== "string" ||
        !article.title.trim() ||
        !Array.isArray(article.source_urls) ||
        !article.source_urls.length,
    )
  )
    throw Error("Complete published same-event rebind evidence required")
  const bytes = fs.readFileSync(safePath(root, prior.path))
  const previous = JSON.parse(bytes)
  const article = readJSON(root, `runs/${receipt.approved_run}/approved-article.json`)
  if (
    sha256(bytes) !== prior.sha256 ||
    previous.schema !== "research-candidate-approval/v1" ||
    previous.candidate_published !== false ||
    previous.candidate_key !== receipt.candidate_key ||
    previous.event_id !== receipt.event_id ||
    previous.approved_run !== receipt.approved_run ||
    previous.article_sha256 !== receipt.article_sha256 ||
    !article ||
    sha256(JSON.stringify(article)) !== receipt.article_sha256 ||
    !samePublicationDate(rebind.publication.published_at, article.article_review.published_at) ||
    rebind.published_articles.some(
      (published) =>
        published.title !== article.title ||
        !published.source_urls.some((url) =>
          article.source_urls.some((source) => canonicalURL(url) === canonicalURL(source)),
        ),
    )
  )
    throw Error("Published rebind prior native approval changed")
  assertPublishedEventRebind(root, previous, [...ancestors, prior.path])
  return prior
}

// A frozen resolved queue keeps its original receipt. Only native, explicitly
// reviewed revisions may supply a newer approval for the same event; no source
// processing, model generation or mutation of the completed queue is needed.
export function resolveFrozenCandidateApproval(
  root,
  frozen,
  current,
  { vault = "vault", withHistory = false, approvalSnapshot } = {},
) {
  if (JSON.stringify(frozen) === JSON.stringify(current))
    return withHistory ? { current, approved_runs: [current.approved_run] } : current
  if (
    frozen?.decision !== "same_approved_event" ||
    current?.decision !== "same_approved_event" ||
    frozen.event_id !== current.event_id ||
    frozen.approved_run === current.approved_run ||
    frozen.candidate_published !== false ||
    current.candidate_published !== false
  )
    throw Error("Queue resolution evidence changed without a native editorial revision")
  const input = (run) => {
    const approval = loadHistoricalApproval(root, run, { vault })
    return {
      run,
      article: approval.article,
      file_hashes: approval.files,
      parses: readJSON(root, `runs/${run}/parses.json`),
    }
  }
  const first = input(frozen.approved_run),
    next = input(current.approved_run)
  if (
    JSON.stringify(first.file_hashes) !== JSON.stringify(frozen.approved_files) ||
    JSON.stringify(next.file_hashes) !== JSON.stringify(current.approved_files) ||
    sha256(JSON.stringify(first.article)) !== frozen.article_sha256 ||
    sha256(JSON.stringify(next.article)) !== current.article_sha256
  )
    throw Error("Frozen or current resolution approval changed")
  const receipt = readJSON(root, frozen.receipt),
    latest = readJSON(root, current.receipt)
  if (
    receipt?.approved_run !== frozen.approved_run ||
    receipt.event_id !== frozen.event_id ||
    receipt.article_sha256 !== frozen.article_sha256 ||
    receipt.candidate_published !== false ||
    receipt.candidate_key !== latest?.candidate_key ||
    latest.approved_run !== current.approved_run ||
    latest.event_id !== current.event_id ||
    latest.candidate_published !== false ||
    latest.article_sha256 !== current.article_sha256
  )
    throw Error("Frozen resolution receipt differs from its native event")
  let cursor = next,
    cursorReceipt = latest
  const visited = new Set(),
    approvedRuns = []
  while (cursor.run !== first.run) {
    if (visited.has(cursor.run) || visited.size >= 32)
      throw Error("Invalid resolved editorial revision chain")
    visited.add(cursor.run)
    approvedRuns.unshift(cursor.run)
    const prior = cursorReceipt.existing_editorial_approval?.prior_approved_run
    if (!prior) throw Error("Queue resolution evidence changed without a native editorial revision")
    const previous = input(prior)
    loadExistingEditorialRevision(root, previous, cursor, { approvalSnapshot })
    cursor = previous
    // The lineage loader locates and verifies each intermediate native receipt.
    if (cursor.run !== first.run) {
      const matches = findApprovalReceipts(
        root,
        { approvedRun: cursor.run, candidateKey: receipt.candidate_key },
        { approvalSnapshot },
      ).map((row) => row.value)
      if (!matches.length || matches.some((r) => JSON.stringify(r) !== JSON.stringify(matches[0])))
        throw Error("Intermediate native editorial revision receipt changed")
      cursorReceipt = matches[0]
    }
  }
  return withHistory ? { current, approved_runs: approvedRuns } : current
}

// Read a native approval made outside this queue without generating a model
// response or granting new approval. Rebuild alternate-source identity too.
export async function loadCurrentCandidateApproval(
  root,
  candidate,
  { vault = "vault", approvalSnapshot } = {},
) {
  if (candidate?.review_status !== "verified" || !candidate.approval) return null
  if (candidate.source_revision_alert || candidate.disposition || candidate.identity) return null
  const binding = candidate.approval
  const approvedRun = binding.approved_run
  if (!/^[A-Za-z0-9_-]+$/.test(approvedRun || "") || candidate.source_urls?.length !== 1)
    throw Error("Complete native candidate approval binding required")
  const approval = loadHistoricalApproval(root, approvedRun, { vault })
  if (
    candidate.event_id !== approval.article.event_id ||
    binding.article_sha256 !== sha256(JSON.stringify(approval.article))
  )
    throw Error("Native candidate approval differs from its current article or binding")
  const stored = loadStoredSourceRun(root, approvedRun)
  const reviewed = readJSON(root, `runs/${approvedRun}/reviewed-claims.json`)
  await assertProcessedFactReview(root, approvedRun, reviewed)
  const receipts = findApprovalReceipts(
    root,
    { approvedRun, candidateKey: candidate.key },
    { approvalSnapshot },
  ).filter(
    ({ value }) =>
      value?.candidate_key === candidate.key &&
      value.approved_run === approvedRun &&
      value.event_id === candidate.event_id &&
      value.article_sha256 === binding.article_sha256 &&
      value.source_version_id === binding.source_version_id &&
      value.parse_id === binding.parse_id,
  )
  if (
    !receipts.length ||
    receipts.some(({ value }) => JSON.stringify(value) !== JSON.stringify(receipts[0].value))
  )
    throw Error("One consistent native candidate approval receipt required")
  const { file, value: receipt } = receipts[0]
  assertPublishedEventRebind(root, receipt)
  const article = approval.article
  if (
    receipt.schema !== "research-candidate-approval/v1" ||
    receipt.candidate_published !== false ||
    candidate.event_id !== article.event_id ||
    receipt.event_id !== article.event_id ||
    binding.article_sha256 !== sha256(JSON.stringify(article)) ||
    receipt.article_sha256 !== binding.article_sha256 ||
    receipt.source_version_id !== binding.source_version_id ||
    receipt.parse_id !== binding.parse_id ||
    receipt.article_content_sha256 !== binding.article_content_sha256
  )
    throw Error("Native candidate approval differs from its current article or binding")
  const originalURL = canonicalURL(candidate.source_urls[0])
  let sourceURL = originalURL
  if (binding.source_alternative_resolution_run) {
    const run = binding.source_alternative_resolution_run
    if (!/^[A-Za-z0-9_-]+$/.test(run)) throw Error("Safe alternate-source approval run required")
    const resolutionPath = `runs/${run}/candidate-source-alternative.json`
    const resolution = readJSON(root, resolutionPath)
    const reviewBytes = fs.readFileSync(
      safePath(root, `runs/${run}/candidate-source-alternative-review.json`),
    )
    const hash = sha256(fs.readFileSync(safePath(root, resolutionPath)))
    const rebuilt = buildCandidateSourceAlternativeResolution({
      candidate,
      review: JSON.parse(reviewBytes),
      sourceRunId: approvedRun,
      sourceRunIdentity: stored.identity,
      documents: stored.documents,
      parses: stored.parses,
      reviewedClaims: reviewed.claims,
      reviewSha256: sha256(reviewBytes),
      backlogSha256: resolution?.inputs?.backlog_sha256,
      generatedAt: resolution?.generated_at,
    })
    sourceURL = canonicalURL(resolution.alternative_source.url)
    const alternate = receipt.source_alternative
    if (
      JSON.stringify(rebuilt) !== JSON.stringify(resolution) ||
      resolution.decision !== "same_event" ||
      binding.source_alternative_resolution_sha256 !== hash ||
      alternate?.receipt_sha256 !== hash ||
      alternate.run_id !== run ||
      alternate.decision !== "same_event" ||
      alternate.original_url !== originalURL ||
      alternate.alternative_url !== sourceURL ||
      binding.source_url !== sourceURL ||
      alternate.source_version_id !== binding.source_version_id ||
      alternate.parse_id !== binding.parse_id ||
      alternate.content_sha256 !== binding.article_content_sha256 ||
      (Object.hasOwn(alternate, "published_at") &&
        alternate.published_at !==
          (parseResearchDate(resolution.alternative_source.published_at)?.day || null)) ||
      !samePublicationDate(
        resolution.alternative_source.published_at,
        article.article_review.published_at,
      )
    )
      throw Error("Native alternate-source approval evidence changed")
  } else if (
    receipt.source_alternative ||
    binding.source_url ||
    binding.source_alternative_resolution_sha256
  ) {
    throw Error("Native alternate-source approval binding is incomplete")
  }
  if (binding.source_revision) {
    verifyPinnedSourceRevision({
      root,
      approvedRunId: approvedRun,
      candidateKey: candidate.key,
      candidate,
      sourceRevision: binding.source_revision,
    })
    if (JSON.stringify(receipt.source_revision) !== JSON.stringify(binding.source_revision))
      throw Error("Native candidate source revision receipt changed")
  } else if (receipt.source_revision)
    throw Error("Native candidate source revision binding is incomplete")
  const documents = stored.documents.filter(
    (document) => canonicalURL(document.original_url) === sourceURL,
  )
  const version = receipt.reviewed_source_version_id || receipt.source_version_id
  const parseId = receipt.reviewed_parse_id || receipt.parse_id
  const parse = stored.parses.find(
    (value) => value.source_version_id === version && value.parse_id === parseId,
  )
  if (
    documents.length !== 1 ||
    documents[0].source_version_id !== version ||
    !parse ||
    articleContentFingerprint(parse, stored.parses) !== binding.article_content_sha256 ||
    !article.source_urls.some((url) => canonicalURL(url) === sourceURL) ||
    (!binding.source_alternative_resolution_run &&
      (candidate.article_source_version_id !== receipt.source_version_id ||
        candidate.article_parse_id !== receipt.parse_id ||
        candidate.article_content_sha256 !== binding.article_content_sha256 ||
        !candidateMatchesEventDate(
          article,
          candidate.source_published_at,
          parse.dates?.published_at,
        )))
  )
    throw Error("Native approved candidate source, date or parse changed")
  return {
    decision: "same_approved_event",
    approved_run: approvedRun,
    event_id: article.event_id,
    receipt: file,
    article_sha256: binding.article_sha256,
    approved_files: approval.files,
    candidate_published: false,
  }
}

export function verifySameSourceRevision({
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
    // Publication-time corrections retain both old and precise parses. Follow
    // the reviewed binding rather than the array's historical first entry.
    const primary = url === originalURL
    const approvedParseId =
      primary && candidate.approval?.approved_run === approvedRunId
        ? candidate.approval.reviewed_parse_id || candidate.approval.parse_id
        : null
    const oldMatches = approvedParses.filter(
      (item) =>
        item.source_version_id === oldDocument.source_version_id &&
        (!approvedParseId || item.parse_id === approvedParseId),
    )
    const newMatches = currentRun.parses.filter(
      (item) =>
        item.source_version_id === newDocument.source_version_id &&
        (!primary || item.parse_id === observation.article_parse_id),
    )
    if (oldMatches.length !== 1 || newMatches.length !== 1)
      throw Error("Same-source review requires an exact unambiguous approved and current parse")
    const oldParse = oldMatches[0]
    const newParse = newMatches[0]
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

// Re-read both stored sources and the explicit review on resume/publication.
// A pinned receipt is not a substitute for unchanged source evidence.
export function verifyPinnedSourceRevision({
  root,
  approvedRunId,
  candidateKey,
  candidate,
  sourceRevision,
}) {
  const stored = loadStoredSourceRun(root, approvedRunId)
  const verified = verifySameSourceRevision({
    root,
    approvedRunId,
    candidateKey,
    candidate,
    candidateSourceRunId: sourceRevision.observation_run,
    sourceRevisionReviewPath: sourceRevision.review_path,
    article: readJSON(root, `runs/${approvedRunId}/approved-article.json`),
    approvedDocuments: stored.documents,
    approvedParses: stored.parses,
  })
  if (JSON.stringify(verified) !== JSON.stringify(sourceRevision))
    throw Error("Pinned source revision review or evidence changed")
  return verified
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
  if (existingEditorialReviewPath && (approvedRoot !== root || sourceAlternativeResolutionRunId))
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
            : sourceRevision
              ? item.parse_id ===
                sourceRevision.sources.find((s) => s.url === sourceUrl)?.approved_parse_id
              : !candidate.article_parse_id || item.parse_id === candidate.article_parse_id),
      )
      if (!parse) throw Error("Approved candidate needs its exact complete article source")
      const contentSha = articleContentFingerprint(parse, parses)
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
      const publishedMatches = publishedArticles.filter((existing) =>
        existing.source_urls?.some((existingURL) =>
          [originalUrl, sourceUrl].includes(canonicalURL(existingURL)),
        ),
      )
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
      let publishedEventRebind = null
      if (publishedMatches.length && existingEditorial) {
        // A published article may receive reviewed specialist links without
        // changing its text, event, classification, sources or publication date.
        // Other editorial revisions still require the retrospective workflow.
        const priorBinding = existingEditorial.prior_approval
        const priorArticle = readJSON(
          root,
          `runs/${existingEditorial.prior_approved_run}/approved-article.json`,
        )
        const prose = (value) => {
          const { reviewed_at, concept_ids, ...review } = value.article_review
          return { ...value, article_review: review }
        }
        const concepts = readJSON(root, `runs/${approvedRunId}/article-concept-review.json`)
        const priorConcepts = readJSON(
          root,
          `runs/${existingEditorial.prior_approved_run}/article-concept-review.json`,
        )
        const definitionChanged = concepts?.notes?.some((note) => {
          const previous = priorConcepts?.notes?.find((old) => old.path === note.path)
          return (
            note.approval_run &&
            previous &&
            (previous.sha256 !== note.sha256 || previous.approval_run !== note.approval_run)
          )
        })
        if (
          sourceRevision ||
          sourceAlternative ||
          !priorBinding ||
          priorBinding.approved_run !== existingEditorial.prior_approved_run ||
          candidate.event_id !== article.event_id ||
          !concepts?.links?.length ||
          (JSON.stringify(priorArticle.article_review.concept_ids) ===
            JSON.stringify(article.article_review.concept_ids) &&
            !definitionChanged) ||
          JSON.stringify(prose(priorArticle)) !== JSON.stringify(prose(article)) ||
          publishedMatches.some(
            (existing) =>
              existing.event_id !== article.event_id ||
              existing.title !== article.title ||
              !existing.edition?.trim() ||
              !samePublicationDate(existing.published_at, article.article_review.published_at),
          )
        )
          throw Error("Candidate source already appears in an edition")
        const prior = await loadCurrentCandidateApproval(
          root,
          {
            ...candidate,
            approval: priorBinding,
            article_source_version_id: priorBinding.source_version_id,
            article_parse_id: priorBinding.parse_id,
            article_content_sha256: priorBinding.article_content_sha256,
          },
          { vault: priorConcepts?.source_vault || concepts.source_vault },
        )
        if (!prior) throw Error("Published specialist linkage requires a native prior approval")
        loadHistoricalApproval(root, approvedRunId, { vault: concepts.source_vault })
      } else if (publishedMatches.length) {
        const binding = candidate.approval
        // Publication is normally derived by researchWindow from the vault,
        // rather than persisted in the private candidate backlog.
        const publication = candidate.publication || {
          event_id: article.event_id,
          edition: publishedMatches[0].edition,
          published_at: publishedMatches[0].published_at,
        }
        if (
          !sourceRevision ||
          sourceAlternative ||
          existingEditorialReviewPath ||
          path.resolve(root) !== path.resolve(approvedRoot) ||
          !binding ||
          binding.approved_run !== approvedRunId ||
          binding.article_sha256 !== sha256(JSON.stringify(article)) ||
          candidate.event_id !== article.event_id ||
          publication.event_id !== article.event_id ||
          !publication.edition?.trim() ||
          !samePublicationDate(publication.published_at, article.article_review.published_at) ||
          publishedMatches.some(
            (existing) =>
              existing.event_id !== article.event_id ||
              existing.title !== article.title ||
              !samePublicationDate(existing.published_at, article.article_review.published_at),
          )
        )
          throw Error("Candidate source already appears in an edition")
        const historicalCandidate = {
          ...candidate,
          review_status: "verified",
          article_source_version_id: binding.source_version_id,
          article_parse_id: binding.parse_id,
          article_content_sha256: binding.article_content_sha256,
        }
        // The fresh explicit source review resolves this alert. It cannot
        // erase a disposition or an identity decision from the old approval.
        delete historicalCandidate.source_revision_alert
        const prior = await loadCurrentCandidateApproval(approvedRoot, historicalCandidate)
        if (!prior) throw Error("Published source rebind requires a native prior approval")
        const observations = publishedMatches.map((existing) => ({
          event_id: existing.event_id,
          title: existing.title,
          published_at: existing.published_at,
          source_urls: [...existing.source_urls],
          ...(existing.edition ? { edition: existing.edition } : {}),
        }))
        const previous = readJSON(root, receiptPath)
        if (previous?.published_event_rebind) {
          assertPublishedEventRebind(root, previous)
          publishedEventRebind = previous.published_event_rebind
          if (
            JSON.stringify(publishedEventRebind.publication) !== JSON.stringify(publication) ||
            JSON.stringify(publishedEventRebind.published_articles) !== JSON.stringify(observations)
          )
            throw Error("Published rebind observations changed; use a new run")
        } else
          publishedEventRebind = {
            previous_approval: {
              path: prior.receipt,
              sha256: sha256(fs.readFileSync(safePath(approvedRoot, prior.receipt))),
            },
            publication: structuredClone(publication),
            published_articles: observations,
            new_article: false,
            candidate_published: false,
          }
      }
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
        ...(publishedEventRebind ? { published_event_rebind: publishedEventRebind } : {}),
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
          !existingEditorial &&
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
            ...(sourceRevision
              ? {
                  reviewed_source_version_id: document.source_version_id,
                  reviewed_parse_id: parse.parse_id,
                  source_revision: sourceRevision,
                }
              : {}),
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
