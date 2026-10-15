import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { samePublicationDate } from "./dates.mjs"
import { readJSON, safePath } from "./run-state.mjs"

// Routing reads the exact files validated by the native approval and source
// comparison. Keep this reader independent of the garden/editor import graph.
export function loadApprovedCandidateIdentity(root, candidate) {
  const identity = candidate.identity
  if (identity?.decision !== "same_approved_event" || root === null) return null
  if (candidate.review_status !== "verified" || candidate.source_revision_alert) return null
  const review = readJSON(root, identity.review_path)
  const target = identity.approved_target
  if (
    !review ||
    review.schema !== "editorial-candidate-identity/v1" ||
    review.decision !== identity.decision ||
    review.approved_run !== target?.run ||
    !/^[A-Za-z0-9_-]+$/.test(target?.run || "") ||
    identity.published_source_run !== target.run ||
    sha256(JSON.stringify(review)) !== identity.review_sha256 ||
    candidate.event_id !== review.published.event_id ||
    review.new_article !== false ||
    review.candidate_published !== false ||
    identity.article_content_sha256 !== candidate.article_content_sha256 ||
    candidate.source_urls?.length !== 1 ||
    candidate.source_urls[0] !== review.candidate.source_url ||
    identity.source_version_id !== review.candidate.source_version_id ||
    identity.parse_id !== review.candidate.parse_id ||
    !samePublicationDate(candidate.source_published_at, review.candidate.published_at) ||
    !/^[A-Za-z0-9_-]+$/.test(identity.resolution_run || "") ||
    !Array.isArray(identity.source_files) ||
    identity.source_files.length < 4
  )
    throw Error("Approved candidate identity review changed")
  const receipt = readJSON(root, `runs/${identity.resolution_run}/candidate-identity.json`)
  if (
    receipt?.schema !== "research-candidate-identity/v1" ||
    receipt.decision !== identity.decision ||
    receipt.candidate_key !== candidate.key ||
    receipt.event_id !== candidate.event_id ||
    receipt.review_path !== identity.review_path ||
    receipt.review_sha256 !== identity.review_sha256 ||
    JSON.stringify(receipt.approved_target) !== JSON.stringify(target) ||
    JSON.stringify(receipt.source_files) !== JSON.stringify(identity.source_files)
  )
    throw Error("Approved candidate identity receipt changed")
  for (const ref of identity.source_files)
    if (sha256(fs.readFileSync(safePath(root, ref.path))) !== ref.sha256)
      throw Error("Approved candidate identity source changed")
  const required = [
    "draft.json",
    "reviewed-claims.json",
    "documents.json",
    "parses.json",
    "editorial-review.json",
    "approved-article.json",
  ]
  if (required.some((file) => !/^[a-f0-9]{64}$/.test(target.files?.[file] || "")))
    throw Error("Complete native approval file binding required")
  for (const [file, hash] of Object.entries(target.files))
    if (sha256(fs.readFileSync(safePath(root, `runs/${target.run}/${file}`))) !== hash)
      throw Error("Approved candidate identity target changed")
  const article = readJSON(root, `runs/${target.run}/approved-article.json`)
  if (
    sha256(JSON.stringify(article)) !== target.article_sha256 ||
    article.event_id !== candidate.event_id ||
    article.title !== review.published.title ||
    article.article_review?.review_status !== "verified" ||
    !samePublicationDate(article.article_review.published_at, review.published.published_at) ||
    !article.source_urls.includes(review.published.source_url)
  )
    throw Error("Approved candidate identity target changed")
  return {
    event_id: candidate.event_id,
    approved_run: target.run,
    published_at: article.article_review.published_at,
  }
}
