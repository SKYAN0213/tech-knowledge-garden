import fs from "node:fs"
import { canonicalURL } from "../garden.mjs"
import { sha256 } from "./contracts.mjs"
import { approvedArticle } from "./publish-adapter.mjs"
import { loadStoredSourceRun, articleContentFingerprint } from "./parser.mjs"
import { samePublicationDate, assertReviewDate } from "./dates.mjs"
import { assertProcessedFactReview } from "./evidence-review-packet.mjs"
import { readJSON, safePath } from "./run-state.mjs"
import { loadCurrentCandidateApproval, verifyPinnedSourceRevision } from "./candidate-approval.mjs"
import { findApprovalReceipts } from "./approval-receipts.mjs"
import { loadSelectedEventRevision } from "./event-publication.mjs"

function assertSameEditorialEvent(oldArticle, article, oldParses, parses) {
  const urls = (value) => [...new Set(value.source_urls.map(canonicalURL))].sort()
  if (
    oldArticle.event_id !== article.event_id ||
    !samePublicationDate(
      oldArticle.article_review.published_at,
      article.article_review.published_at,
    ) ||
    JSON.stringify(urls(oldArticle)) !== JSON.stringify(urls(article)) ||
    oldParses.length !== parses.length
  )
    throw Error("Existing approval event, original date or source URLs differ")
  for (const oldParse of oldParses) {
    const matches = parses.filter((p) => p.source_id === oldParse.source_id)
    const next = matches[0]
    const oldDate = oldParse.dates?.published_at ?? null
    const nextDate = next?.dates?.published_at ?? null
    if (
      matches.length !== 1 ||
      oldParse.title !== next.title ||
      JSON.stringify(oldParse.blocks.map((b) => b.text)) !==
        JSON.stringify(next.blocks.map((b) => b.text)) ||
      articleContentFingerprint(oldParse) !== articleContentFingerprint(next) ||
      !((oldDate === null && nextDate === null) || samePublicationDate(oldDate, nextDate))
    )
      throw Error("Existing approval original text or publication date differs")
  }
}

// Reuse a completed native lineage decision when updating the private graph.
// A later approval alone is never permission to replace the same event.
export function loadExistingEditorialRevision(root, previous, current, { approvalSnapshot } = {}) {
  const selectedRevision = loadSelectedEventRevision(root, previous, current)
  if (selectedRevision) return selectedRevision
  if (!fs.existsSync(safePath(root, "runs")))
    throw Error("Ontology replacement requires a native explicit revision review")
  const matches = findApprovalReceipts(
    root,
    { approvedRun: current.run, priorApprovedRun: previous.run },
    { approvalSnapshot },
  ).map(({ file, value }) => ({ file, receipt: value }))
  if (!matches.length)
    throw Error("Ontology replacement requires a native explicit revision review")
  if (matches.some(({ receipt }) => JSON.stringify(receipt) !== JSON.stringify(matches[0].receipt)))
    throw Error("Conflicting native editorial revision receipts")
  const { file, receipt } = matches[0]
  const lineage = receipt.existing_editorial_approval
  const bytes = fs.readFileSync(safePath(root, lineage.review_path))
  if (bytes.length > 512 * 1024 || sha256(bytes) !== lineage.review_sha256)
    throw Error("Editorial revision review changed")
  const review = JSON.parse(bytes)
  if (
    receipt.schema !== "research-candidate-approval/v1" ||
    receipt.candidate_published !== false ||
    receipt.event_id !== current.article.event_id ||
    receipt.article_sha256 !== sha256(JSON.stringify(current.article)) ||
    lineage.prior_article_sha256 !== sha256(JSON.stringify(previous.article)) ||
    review.schema !== "research-existing-editorial-approval-review/v1" ||
    review.decision !== "attach_reverified_approval" ||
    review.candidate_key !== receipt.candidate_key ||
    review.event_id !== receipt.event_id ||
    review.prior_approved_run !== previous.run ||
    review.approved_run !== current.run ||
    review.prior_article_sha256 !== lineage.prior_article_sha256 ||
    review.article_sha256 !== receipt.article_sha256 ||
    review.expected_candidate_sha256 !== lineage.candidate_before_sha256 ||
    !review.reviewer?.trim() ||
    !review.reason?.trim() ||
    review.reviewer.trim() !== lineage.reviewer ||
    review.reviewed_at !== lineage.reviewed_at ||
    [
      "source_read",
      "prior_article_read",
      "article_read",
      "identity_checked",
      "dates_checked",
      "numbers_checked",
    ].some((k) => review[k] !== true) ||
    review.new_article !== false ||
    review.candidate_published !== false ||
    [
      "draft.json",
      "reviewed-claims.json",
      "editorial-review.json",
      "approved-article.json",
      "documents.json",
      "parses.json",
    ].some((name) => lineage.prior_artifacts_sha256?.[name] !== previous.file_hashes[name])
  )
    throw Error("Native editorial revision differs from its approved inputs")
  assertSameEditorialEvent(previous.article, current.article, previous.parses, current.parses)
  const priorBinding = lineage.prior_approval
  if (priorBinding?.source_revision) {
    const observation = readJSON(
      root,
      `runs/${priorBinding.source_revision.observation_run}/candidates.json`,
    )?.find((c) => c.key === receipt.candidate_key)
    if (!observation) throw Error("Editorial revision original source observation missing")
    verifyPinnedSourceRevision({
      root,
      approvedRunId: previous.run,
      candidateKey: receipt.candidate_key,
      candidate: { ...observation, approval: priorBinding },
      sourceRevision: priorBinding.source_revision,
    })
  }
  assertReviewDate(review.reviewed_at, {
    notBefore: [
      previous.article.article_review.reviewed_at,
      current.article.article_review.reviewed_at,
    ],
  })
  return {
    event_id: receipt.event_id,
    previous: { run: previous.run, event_id: receipt.event_id, files: previous.file_hashes },
    current: { run: current.run, event_id: receipt.event_id, files: current.file_hashes },
    receipt: { path: file, sha256: sha256(fs.readFileSync(safePath(root, file))) },
  }
}

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
  const priorBinding = alreadyLinked
    ? priorReceipt.existing_editorial_approval.prior_approval || null
    : candidate.approval || null
  const priorCandidateRun = priorBinding?.approved_run || candidate.editorial_approval_run
  if (
    review.schema !== "research-existing-editorial-approval-review/v1" ||
    review.candidate_key !== candidate.key ||
    review.event_id !== candidate.event_id ||
    review.event_id !== article.event_id ||
    review.approved_run !== approvedRunId ||
    !/^[A-Za-z0-9_-]+$/.test(priorRun || "") ||
    priorRun === approvedRunId ||
    priorCandidateRun !== priorRun ||
    candidate.review_status !== "verified" ||
    candidate.identity ||
    candidate.disposition ||
    candidate.source_revision_alert ||
    priorBinding?.source_alternative_resolution_run ||
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
  if (priorBinding?.source_revision) {
    const checked = await loadCurrentCandidateApproval(root, {
      ...candidate,
      approval: priorBinding,
    })
    if (!checked || checked.approved_run !== priorRun || checked.article_sha256 !== oldHash)
      throw Error("Prior source revision lacks its native candidate approval")
  }
  if (
    priorBinding &&
    (priorBinding.article_sha256 !== oldHash ||
      priorBinding.source_version_id !== candidate.article_source_version_id ||
      priorBinding.parse_id !== candidate.article_parse_id ||
      priorBinding.article_content_sha256 !== candidate.article_content_sha256 ||
      !oldSource.parses.some(
        (p) =>
          p.parse_id === (priorBinding.reviewed_parse_id || priorBinding.parse_id) &&
          p.source_version_id ===
            (priorBinding.reviewed_source_version_id || priorBinding.source_version_id) &&
          articleContentFingerprint(p) === priorBinding.article_content_sha256,
      ))
  )
    throw Error("Prior candidate approval differs from its verified source and article")
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
  assertSameEditorialEvent(oldArticle, article, oldSource.parses, parses)
  assertReviewDate(review.reviewed_at, {
    notBefore: [oldArticle.article_review.reviewed_at, article.article_review.reviewed_at],
  })
  return {
    prior_approved_run: priorRun,
    ...(priorBinding ? { prior_approval: structuredClone(priorBinding) } : {}),
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
