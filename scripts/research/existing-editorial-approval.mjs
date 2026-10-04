import fs from "node:fs"
import { canonicalURL } from "../garden.mjs"
import { sha256 } from "./contracts.mjs"
import { approvedArticle } from "./publish-adapter.mjs"
import { loadStoredSourceRun, articleContentFingerprint } from "./parser.mjs"
import { samePublicationDate, assertReviewDate } from "./dates.mjs"
import { assertProcessedFactReview } from "./evidence-review-packet.mjs"
import { readJSON, safePath } from "./run-state.mjs"

// Attach an already verified private event to a reverified article. This is
// explicit lineage review, never an inference from title or keyword overlap.
export async function verifyExistingEditorialApproval({
  root,
  runId,
  approvedRunId,
  candidate,
  article,
  parses,
  reviewPath,
}) {
  const bytes = fs.readFileSync(safePath(root, reviewPath))
  if (bytes.length > 512 * 1024) throw Error("Existing approval review exceeds bound")
  const review = JSON.parse(bytes)
  const priorRun = review.prior_approved_run
  const priorReceipt = readJSON(root, `runs/${runId}/candidate-approval.json`)
  const alreadyLinked =
    candidate.approval?.approved_run === approvedRunId &&
    candidate.approval?.existing_editorial_approval?.review_sha256 === sha256(bytes) &&
    priorReceipt?.existing_editorial_approval?.review_sha256 === sha256(bytes)
  if (
    review.schema !== "research-existing-editorial-approval-review/v1" ||
    review.candidate_key !== candidate.key ||
    review.event_id !== candidate.event_id ||
    review.event_id !== article.event_id ||
    review.approved_run !== approvedRunId ||
    !/^[A-Za-z0-9_-]+$/.test(priorRun || "") ||
    priorRun === approvedRunId ||
    candidate.editorial_approval_run !== priorRun ||
    candidate.review_status !== "verified" ||
    candidate.identity ||
    candidate.disposition ||
    candidate.source_revision_alert ||
    (candidate.approval && !alreadyLinked) ||
    review.expected_candidate_sha256 !==
      (alreadyLinked
        ? priorReceipt.existing_editorial_approval.candidate_before_sha256
        : sha256(JSON.stringify(candidate))) ||
    review.decision !== "attach_reverified_approval" ||
    !review.reviewer?.trim() ||
    !review.reason?.trim() ||
    [
      "source_read",
      "prior_article_read",
      "article_read",
      "identity_checked",
      "dates_checked",
      "numbers_checked",
    ].some((k) => review[k] !== true) ||
    review.new_article !== false ||
    review.candidate_published !== false
  )
    throw Error("Complete exact existing editorial approval review required")
  const base = `runs/${priorRun}/`
  const oldSource = loadStoredSourceRun(root, priorRun)
  const draft = readJSON(root, base + "draft.json")
  const claims = readJSON(root, base + "reviewed-claims.json")
  const decision = readJSON(root, base + "editorial-review.json")
  const stored = readJSON(root, base + "approved-article.json")
  await assertProcessedFactReview(root, priorRun, claims)
  if (!draft || !claims || !decision || !stored) throw Error("Prior editorial approval incomplete")
  const oldArticle = approvedArticle(
    draft,
    claims.claims,
    oldSource.documents,
    decision,
    oldSource.parses,
  )
  const oldHash = sha256(JSON.stringify(oldArticle))
  if (
    oldHash !== sha256(JSON.stringify(stored)) ||
    oldHash !== review.prior_article_sha256 ||
    sha256(JSON.stringify(article)) !== review.article_sha256 ||
    oldArticle.event_id !== article.event_id ||
    !samePublicationDate(
      oldArticle.article_review.published_at,
      article.article_review.published_at,
    )
  )
    throw Error("Prior approval projection or event changed")
  const urls = (value) => [...new Set(value.source_urls.map(canonicalURL))].sort()
  if (
    JSON.stringify(urls(oldArticle)) !== JSON.stringify(urls(article)) ||
    !urls(article).includes(canonicalURL(candidate.source_urls[0]))
  )
    throw Error("Existing approval source URLs differ")
  for (const document of oldSource.documents) {
    const oldParse = oldSource.parses.find(
      (p) => p.source_version_id === document.source_version_id,
    )
    const newParse = parses.find(
      (p) =>
        urls(article).includes(canonicalURL(document.original_url)) &&
        p.source_id === document.source_id,
    )
    if (
      !oldParse ||
      !newParse ||
      oldParse.title !== newParse.title ||
      JSON.stringify(oldParse.blocks.map((b) => b.text)) !==
        JSON.stringify(newParse.blocks.map((b) => b.text)) ||
      articleContentFingerprint(oldParse) !== articleContentFingerprint(newParse) ||
      !samePublicationDate(oldParse.dates?.published_at, newParse.dates?.published_at)
    )
      throw Error("Existing approval original text or publication date differs")
  }
  assertReviewDate(review.reviewed_at, {
    notBefore: [oldArticle.article_review.reviewed_at, article.article_review.reviewed_at],
  })
  return {
    prior_approved_run: priorRun,
    prior_article_sha256: oldHash,
    prior_artifacts_sha256: Object.fromEntries(
      [
        "draft.json",
        "reviewed-claims.json",
        "editorial-review.json",
        "approved-article.json",
        "documents.json",
        "parses.json",
      ].map((f) => [f, sha256(fs.readFileSync(safePath(root, base + f)))]),
    ),
    candidate_before_sha256: review.expected_candidate_sha256,
    review_path: reviewPath,
    review_sha256: sha256(bytes),
    reviewer: review.reviewer.trim(),
    reviewed_at: review.reviewed_at,
  }
}
