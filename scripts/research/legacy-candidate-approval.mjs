import fs from "node:fs"
import path from "node:path"
import { canonicalURL } from "../garden.mjs"
import { articleContentFingerprint, loadStoredSourceRun } from "./parser.mjs"
import { parseResearchDate, assertReviewDate, samePublicationDate } from "./dates.mjs"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"

const MAX_READBACK_BYTES = 512 * 1024

function readPinnedInput(filePath) {
  const resolved = path.resolve(filePath || "")
  const info = fs.lstatSync(resolved)
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_READBACK_BYTES)
    throw Error("Drive readback must be a bounded regular file")
  const bytes = fs.readFileSync(resolved)
  return { bytes, value: JSON.parse(bytes.toString("utf8")), sha256: sha256(bytes) }
}

function frontmatterValue(markdown, key) {
  const match = markdown.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"))
  return match?.[1]?.replace(/^['"]|['"]$/g, "") || null
}

function frontmatterSection(markdown, key) {
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1]
  if (!frontmatter) return ""
  const lines = frontmatter.split(/\r?\n/)
  const start = lines.findIndex((line) => new RegExp(`^${key}:\\s*$`).test(line))
  if (start < 0) return ""
  const end = lines.findIndex((line, index) => index > start && /^[A-Za-z][\w-]*:\s*/.test(line))
  return lines.slice(start + 1, end < 0 ? lines.length : end).join("\n")
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function editionContainsVerifiedArticle(edition, { title, eventId, publishedAt }) {
  const articleTitle = escapeRegExp(title)
  const records = frontmatterSection(edition, "article_records")
  const reviews = frontmatterSection(edition, "article_reviews")
  return (
    new RegExp(`^\\s{2}- title: ${articleTitle}\\s*$`, "m").test(records) &&
    new RegExp(
      `^\\s{2}- title: ${articleTitle}\\s*\\n\\s{4}event_id: ${escapeRegExp(eventId)}\\s*\\n\\s{4}review_status: verified\\s*\\n\\s{4}published_at: ${escapeRegExp(publishedAt)}\\s*$`,
      "m",
    ).test(reviews)
  )
}

function checkDriveReadback(readback, fileName) {
  if (
    readback?.schema !== "research-drive-publication-readback/v1" ||
    !/^[A-Za-z0-9_-]{10,}$/.test(readback.file_id || "") ||
    readback.url !== `https://drive.google.com/file/d/${readback.file_id}/view?usp=drivesdk` ||
    typeof readback.title !== "string" ||
    !(typeof fileName === "string" ? readback.title === fileName : fileName.test(readback.title)) ||
    readback.mime_type !== "text/markdown" ||
    !Array.isArray(readback.parent_ids) ||
    !readback.parent_ids.length ||
    typeof readback.content !== "string" ||
    !parseResearchDate(readback.updated_at)?.day ||
    !parseResearchDate(readback.retrieved_at)
  )
    throw Error("Drive publication readback metadata is incomplete or inconsistent")
  return readback
}

function oneCandidate(backlog, key) {
  if (backlog?.schema !== "research-candidates/v1" || !Array.isArray(backlog.candidates))
    throw Error("Research candidate backlog required")
  const rows = backlog.candidates.filter((candidate) => candidate.key === key)
  if (rows.length !== 1) throw Error("One exact candidate required")
  return rows[0]
}

export function buildLegacyCandidateApproval({
  candidate,
  approvalRunId,
  articleReadback,
  editionReadback,
  sourceRunId,
  sourceRunIdentity,
  sourceDocument,
  sourceParse,
  articleReadbackSha256,
  editionReadbackSha256,
  review,
  reviewSha256,
  backlogSha256,
  generatedAt = new Date().toISOString(),
}) {
  if (
    candidate?.review_status !== "verified" ||
    !/^[a-f0-9]{16,64}$/.test(candidate.event_id || "") ||
    !/^[a-zA-Z0-9_-]+$/.test(approvalRunId || "") ||
    candidate.source_urls?.length !== 1 ||
    !candidate.source_published_at
  )
    throw Error("Only a verified legacy event without a current approval link can be imported")

  const article = checkDriveReadback(articleReadback, `${candidate.event_id}.md`)
  const edition = checkDriveReadback(
    editionReadback,
    /^\d{4}-\d{2}-\d{2}_0800_Tech_AI_Briefing\.md$/,
  )
  const markdown = article.content
  const articleTitle = frontmatterValue(markdown, "title")
  const eventId = frontmatterValue(markdown, "event_id")
  const reviewStatus = frontmatterValue(markdown, "review_status")
  const publishedAt = frontmatterValue(markdown, "published_at")
  const sourceUrl = frontmatterValue(markdown, "source_url")
  const editionDate = frontmatterValue(edition.content, "date")
  if (
    articleTitle !== candidate.title ||
    eventId !== candidate.event_id ||
    reviewStatus !== "verified" ||
    !samePublicationDate(publishedAt, candidate.source_published_at) ||
    canonicalURL(sourceUrl || "") !== canonicalURL(candidate.source_urls[0]) ||
    !editionContainsVerifiedArticle(edition.content, {
      title: candidate.title,
      eventId: candidate.event_id,
      publishedAt,
    }) ||
    !samePublicationDate(editionDate, edition.title.slice(0, 10))
  )
    throw Error("Drive verified article and edition do not match the existing candidate event")

  if (
    !sourceDocument ||
    canonicalURL(sourceDocument.original_url) !== canonicalURL(candidate.source_urls[0]) ||
    !["captured", "not_modified"].includes(sourceDocument.fetch_status) ||
    !sourceParse ||
    sourceParse.source_version_id !== sourceDocument.source_version_id ||
    sourceParse.status !== "extracted" ||
    !sourceParse.blocks?.length
  )
    throw Error("Original candidate source must be captured and extracted")

  if (
    review?.schema !== "research-legacy-publication-approval-review/v1" ||
    review.candidate_key !== candidate.key ||
    review.event_id !== candidate.event_id ||
    review.article_drive_file_id !== article.file_id ||
    review.edition_drive_file_id !== edition.file_id ||
    review.decision !== "reuse_verified_publication" ||
    typeof review.reviewer !== "string" ||
    !review.reviewer.trim() ||
    review.source_checked !== true ||
    review.article_checked !== true ||
    review.edition_checked !== true ||
    review.identity_checked !== true ||
    review.dates_checked !== true ||
    review.new_article !== false ||
    review.candidate_published !== false ||
    !/^[a-f0-9]{64}$/.test(articleReadbackSha256 || "") ||
    !/^[a-f0-9]{64}$/.test(editionReadbackSha256 || "") ||
    !/^[a-f0-9]{64}$/.test(reviewSha256 || "") ||
    !/^[a-f0-9]{64}$/.test(backlogSha256 || "")
  )
    throw Error("Complete historical-publication review and pinned readbacks are required")

  assertReviewDate(review.reviewed_at, {
    notBefore: [article.updated_at, edition.updated_at, article.retrieved_at, edition.retrieved_at],
  })
  const contentSha = articleContentFingerprint(sourceParse)
  return {
    schema: "research-candidate-approval/v1",
    candidate_key: candidate.key,
    event_id: candidate.event_id,
    approved_run: approvalRunId,
    article_sha256: sha256(Buffer.from(markdown, "utf8")),
    source_version_id: sourceDocument.source_version_id,
    parse_id: sourceParse.parse_id,
    article_content_sha256: contentSha,
    candidate_published: false,
    legacy_publication: {
      schema: "research-legacy-publication-approval/v1",
      published_by: "legacy_drive_verified_article",
      article_drive_file_id: article.file_id,
      article_drive_url: article.url,
      article_title: articleTitle,
      article_updated_at: article.updated_at,
      article_parent_ids: [...article.parent_ids],
      article_readback_sha256: articleReadbackSha256,
      edition_drive_file_id: edition.file_id,
      edition_drive_url: edition.url,
      edition_title: edition.title,
      edition_updated_at: edition.updated_at,
      edition_parent_ids: [...edition.parent_ids],
      edition_readback_sha256: editionReadbackSha256,
      article_review_status: reviewStatus,
      article_published_at: publishedAt,
      source_url: canonicalURL(sourceUrl),
      source_run_id: sourceRunId,
      source_run_identity_sha256: sha256(JSON.stringify(sourceRunIdentity)),
      source_version_id: sourceDocument.source_version_id,
      source_body_sha256: sourceDocument.body_sha256,
      source_parse_id: sourceParse.parse_id,
      source_content_sha256: contentSha,
      review_sha256: reviewSha256,
      reviewer: review.reviewer.trim(),
      reviewed_at: parseResearchDate(review.reviewed_at)?.day || null,
      backlog_sha256: backlogSha256,
      candidate_published: false,
    },
    generated_at: generatedAt,
  }
}

export function loadLegacyCandidateApproval(root, candidate) {
  const runId = candidate?.approval?.approved_run
  if (!/^[a-zA-Z0-9_-]+$/.test(runId || "")) return null
  const receiptPath = `runs/${runId}/candidate-approval.json`
  const receipt = readJSON(root, receiptPath)
  if (!receipt?.legacy_publication) return null
  const legacy = receipt.legacy_publication
  if (
    receipt.schema !== "research-candidate-approval/v1" ||
    legacy.schema !== "research-legacy-publication-approval/v1" ||
    legacy.published_by !== "legacy_drive_verified_article" ||
    legacy.candidate_published !== false ||
    receipt.candidate_key !== candidate.key ||
    receipt.event_id !== candidate.event_id ||
    receipt.approved_run !== runId ||
    receipt.article_sha256 !== candidate.approval.article_sha256 ||
    candidate.approval.legacy_publication_receipt_sha256 !==
      sha256(fs.readFileSync(safePath(root, receiptPath))) ||
    receipt.source_version_id !== candidate.approval.source_version_id ||
    receipt.parse_id !== candidate.approval.parse_id ||
    receipt.article_content_sha256 !== candidate.approval.article_content_sha256 ||
    legacy.source_version_id !== candidate.article_source_version_id ||
    legacy.source_parse_id !== candidate.article_parse_id ||
    legacy.source_content_sha256 !== candidate.article_content_sha256 ||
    canonicalURL(legacy.source_url) !== canonicalURL(candidate.source_urls?.[0] || "")
  )
    throw Error(`Historical candidate approval receipt does not match ${candidate.key}`)

  const articleReadbackBytes = fs.readFileSync(
    safePath(root, `runs/${runId}/drive-article-readback.json`),
  )
  const editionReadbackBytes = fs.readFileSync(
    safePath(root, `runs/${runId}/drive-edition-readback.json`),
  )
  const reviewBytes = fs.readFileSync(safePath(root, `runs/${runId}/legacy-approval-review.json`))
  const articleReadback = JSON.parse(articleReadbackBytes.toString("utf8"))
  const editionReadback = JSON.parse(editionReadbackBytes.toString("utf8"))
  const review = JSON.parse(reviewBytes.toString("utf8"))
  checkDriveReadback(articleReadback, `${candidate.event_id}.md`)
  checkDriveReadback(editionReadback, /^\d{4}-\d{2}-\d{2}_0800_Tech_AI_Briefing\.md$/)
  if (
    sha256(articleReadbackBytes) !== legacy.article_readback_sha256 ||
    sha256(editionReadbackBytes) !== legacy.edition_readback_sha256 ||
    sha256(reviewBytes) !== legacy.review_sha256 ||
    sha256(Buffer.from(articleReadback.content || "", "utf8")) !== receipt.article_sha256 ||
    articleReadback.file_id !== legacy.article_drive_file_id ||
    editionReadback.file_id !== legacy.edition_drive_file_id ||
    frontmatterValue(articleReadback.content, "event_id") !== candidate.event_id ||
    frontmatterValue(articleReadback.content, "title") !== candidate.title ||
    frontmatterValue(articleReadback.content, "review_status") !== "verified" ||
    !samePublicationDate(
      frontmatterValue(articleReadback.content, "published_at"),
      candidate.source_published_at,
    ) ||
    canonicalURL(frontmatterValue(articleReadback.content, "source_url") || "") !==
      canonicalURL(candidate.source_urls?.[0] || "") ||
    !editionContainsVerifiedArticle(editionReadback.content || "", {
      title: candidate.title,
      eventId: candidate.event_id,
      publishedAt: frontmatterValue(articleReadback.content, "published_at"),
    }) ||
    review?.schema !== "research-legacy-publication-approval-review/v1" ||
    review.candidate_key !== candidate.key ||
    review.event_id !== candidate.event_id ||
    review.article_drive_file_id !== articleReadback.file_id ||
    review.edition_drive_file_id !== editionReadback.file_id ||
    review.decision !== "reuse_verified_publication" ||
    review.source_checked !== true ||
    review.article_checked !== true ||
    review.edition_checked !== true ||
    review.identity_checked !== true ||
    review.dates_checked !== true ||
    review.new_article !== false ||
    review.candidate_published !== false
  )
    throw Error(`Historical Drive publication proof changed for ${candidate.key}`)

  const stored = loadStoredSourceRun(root, legacy.source_run_id)
  const documents = stored.documents.filter(
    (item) => canonicalURL(item.original_url) === canonicalURL(legacy.source_url),
  )
  if (
    sha256(JSON.stringify(stored.identity)) !== legacy.source_run_identity_sha256 ||
    documents.length !== 1 ||
    documents[0].source_version_id !== legacy.source_version_id ||
    documents[0].body_sha256 !== legacy.source_body_sha256
  )
    throw Error(`Historical approval source run changed for ${candidate.key}`)
  const parses = stored.parses.filter((item) => item.source_version_id === legacy.source_version_id)
  if (
    parses.length !== 1 ||
    parses[0].parse_id !== legacy.source_parse_id ||
    articleContentFingerprint(parses[0]) !== legacy.source_content_sha256
  )
    throw Error(`Historical approval source parse changed for ${candidate.key}`)
  return {
    run_id: runId,
    receipt_sha256: sha256(fs.readFileSync(safePath(root, receiptPath))),
    article_sha256: receipt.article_sha256,
  }
}

export async function importLegacyCandidateApproval({
  root,
  runId,
  sourceRunId,
  candidateKey,
  articleReadbackPath,
  editionReadbackPath,
  reviewPath,
  backlogFile,
}) {
  if (
    !/^[a-zA-Z0-9_-]+$/.test(runId || "") ||
    !/^[a-zA-Z0-9_-]+$/.test(sourceRunId || "") ||
    runId === sourceRunId ||
    !/^[a-zA-Z0-9_-]+$/.test(candidateKey || "") ||
    !reviewPath ||
    !articleReadbackPath ||
    !editionReadbackPath
  )
    throw Error("Legacy approval requires distinct run IDs, exact readbacks and review")

  const articleInput = readPinnedInput(articleReadbackPath)
  const editionInput = readPinnedInput(editionReadbackPath)
  const reviewInput = readPinnedInput(reviewPath)
  const stored = loadStoredSourceRun(root, sourceRunId)
  const candidateBacklog = JSON.parse(fs.readFileSync(path.resolve(backlogFile), "utf8"))
  const initialCandidate = oneCandidate(candidateBacklog, candidateKey)
  const document = stored.documents.filter(
    (item) =>
      canonicalURL(item.original_url) === canonicalURL(initialCandidate.source_urls?.[0] || ""),
  )
  if (document.length !== 1)
    throw Error("Source run must contain exactly the candidate original URL")
  const sourceDocument = document[0]
  const parses = stored.parses.filter(
    (item) => item.source_version_id === sourceDocument.source_version_id,
  )
  if (parses.length !== 1) throw Error("Source run must contain one parse for the original URL")

  return withLock(root, `run-${runId}`, async () => {
    const backlogRoot = path.dirname(backlogFile)
    const backlogName = path.basename(backlogFile)
    return withLock(backlogRoot, "candidate-backlog", async () => {
      const backlogBytes = fs.readFileSync(path.resolve(backlogFile))
      const backlog = JSON.parse(backlogBytes.toString("utf8"))
      const candidate = oneCandidate(backlog, candidateKey)
      const approval = buildLegacyCandidateApproval({
        candidate,
        approvalRunId: runId,
        articleReadback: articleInput.value,
        editionReadback: editionInput.value,
        sourceRunId,
        sourceRunIdentity: stored.identity,
        sourceDocument,
        sourceParse: parses[0],
        articleReadbackSha256: articleInput.sha256,
        editionReadbackSha256: editionInput.sha256,
        review: reviewInput.value,
        reviewSha256: reviewInput.sha256,
        backlogSha256:
          readJSON(root, `runs/${runId}/candidate-approval.json`)?.legacy_publication
            ?.backlog_sha256 || sha256(backlogBytes),
        generatedAt: readJSON(root, `runs/${runId}/candidate-approval.json`)?.generated_at,
      })
      const existingReceipt = readJSON(root, `runs/${runId}/candidate-approval.json`)
      if (existingReceipt && JSON.stringify(existingReceipt) !== JSON.stringify(approval))
        throw Error("Legacy approval input changed; use a new run ID")
      const proof = approval.legacy_publication
      if (
        (candidate.article_source_version_id &&
          candidate.article_source_version_id !== proof.source_version_id) ||
        (candidate.article_parse_id && candidate.article_parse_id !== proof.source_parse_id) ||
        (candidate.article_content_sha256 &&
          candidate.article_content_sha256 !== proof.source_content_sha256)
      )
        throw Error("Candidate has conflicting source identity; manual reconciliation is required")

      const receiptPath = `runs/${runId}/candidate-approval.json`
      const articleStoredPath = `runs/${runId}/drive-article-readback.json`
      const editionStoredPath = `runs/${runId}/drive-edition-readback.json`
      const reviewStoredPath = `runs/${runId}/legacy-approval-review.json`
      for (const [storedPath, bytes] of [
        [articleStoredPath, articleInput.bytes],
        [editionStoredPath, editionInput.bytes],
        [reviewStoredPath, reviewInput.bytes],
      ]) {
        const current = fs.existsSync(safePath(root, storedPath))
          ? fs.readFileSync(safePath(root, storedPath))
          : null
        if (current && !current.equals(bytes)) throw Error("Pinned legacy approval input changed")
        if (!current) atomicCreate(root, storedPath, bytes)
      }
      const receiptWrite = existingReceipt ? null : atomicCreate(root, receiptPath, approval)
      const receiptSha256 =
        receiptWrite?.sha256 || sha256(fs.readFileSync(safePath(root, receiptPath)))
      const nextApproval = {
        approved_run: runId,
        article_sha256: approval.article_sha256,
        source_version_id: approval.source_version_id,
        parse_id: approval.parse_id,
        article_content_sha256: approval.article_content_sha256,
        legacy_publication_receipt_sha256: receiptSha256,
      }
      if (candidate.approval && JSON.stringify(candidate.approval) !== JSON.stringify(nextApproval))
        throw Error("Candidate already has a different approval link")
      const alreadyLinked = JSON.stringify(candidate.approval) === JSON.stringify(nextApproval)
      const sourceIdentityMatches =
        candidate.article_source_version_id === proof.source_version_id &&
        candidate.article_parse_id === proof.source_parse_id &&
        candidate.article_content_sha256 === proof.source_content_sha256
      if (alreadyLinked && sourceIdentityMatches)
        return {
          candidate_key: candidate.key,
          event_id: candidate.event_id,
          approved_run: runId,
          receipt_path: safePath(root, receiptPath),
          source_content_sha256: proof.source_content_sha256,
          drive_article_file_id: proof.article_drive_file_id,
          drive_edition_file_id: proof.edition_drive_file_id,
          candidate_published: false,
          reused: true,
        }
      candidate.article_source_version_id = proof.source_version_id
      candidate.article_parse_id = proof.source_parse_id
      candidate.article_observed_at = sourceDocument.observed_at
      candidate.article_content_sha256 = proof.source_content_sha256
      candidate.approval = nextApproval
      backlog.updated_at = new Date().toISOString()
      atomicWrite(backlogRoot, backlogName, backlog)
      return {
        candidate_key: candidate.key,
        event_id: candidate.event_id,
        approved_run: runId,
        receipt_path: safePath(root, receiptPath),
        source_content_sha256: proof.source_content_sha256,
        drive_article_file_id: proof.article_drive_file_id,
        drive_edition_file_id: proof.edition_drive_file_id,
        candidate_published: false,
        reused: false,
      }
    })
  })
}
