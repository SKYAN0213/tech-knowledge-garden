import fs from "node:fs"
import path from "node:path"
import { extractArticles, editions } from "../garden.mjs"
import { approvedArticle } from "./publish-adapter.mjs"
import { evaluateArticleConceptReview } from "./article-concept-review.mjs"
import { assertProcessedFactReview } from "./evidence-review-packet.mjs"
import { loadCurrentApproval } from "./preview.mjs"
import { recordArticleApproval } from "./article-approval.mjs"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, readJSON, safePath, RunState, withLock } from "./run-state.mjs"

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const hashJSON = (value) => sha256(JSON.stringify(value))
const names = ["draft.json", "reviewed-claims.json", "documents.json", "parses.json"]

function stripReviewBinding(article) {
  const copy = structuredClone(article)
  delete copy.retrospective_review
  delete copy.historical_addition_review
  if (copy.article_review) delete copy.article_review.reviewed_at
  return copy
}

export function validateExistingBaselineReview(prior, oldDecision, review, draft, reviewed, documents, parses) {
  if (
    review?.status !== "approved" ||
    review.event_id !== prior.article.event_id ||
    review.draft_id !== draft.draft_id ||
    review.published_at !== prior.article.article_review.published_at ||
    review.source_published_at !== oldDecision.source_published_at ||
    review.region !== oldDecision.region ||
    JSON.stringify(review.concept_ids || []) !== JSON.stringify(oldDecision.concept_ids || []) ||
    review.reviewer?.trim() === "" ||
    review.reviewed_at <= oldDecision.reviewed_at ||
    !review.source_read ||
    !review.final_prose_read ||
    !review.title_checked ||
    !review.dates_checked ||
    !review.numbers_checked ||
    !review.analysis_checked ||
    !review.retrospective_review ||
    review.historical_addition_review
  )
    throw Error("Fresh baseline review must preserve the approved event and bind only its current appearance")

  const next = approvedArticle(draft, reviewed.claims, documents, review, parses)
  if (
    !same(stripReviewBinding(next), stripReviewBinding(prior.article)) ||
    next.event_id !== prior.article.event_id ||
    next.article_review.published_at !== prior.article.article_review.published_at ||
    !same(next.source_urls, prior.article.source_urls)
  )
    throw Error("Baseline reapproval changed approved prose, source identity, or original event date")
  return next
}

export async function approveExistingBaseline({
  root,
  vault,
  priorRun,
  run,
  reviewer,
  reason,
  reviewedAt,
}) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(run || "") || run === priorRun)
    throw Error("A distinct safe new approval run is required")
  if (!reviewer?.trim() || !reason?.trim()) throw Error("Baseline reviewer and reason required")

  return withLock(root, "run-" + run, async () => {
    const prior = loadCurrentApproval(root, priorRun, { vault })
    const base = `runs/${priorRun}/`
    const sourceFiles = Object.fromEntries(
      [...names, "editorial-review.json"].map((name) => {
        const bytes = fs.readFileSync(safePath(root, base + name))
        return [name, { bytes, value: JSON.parse(bytes), sha256: sha256(bytes) }]
      }),
    )
    const draft = sourceFiles["draft.json"].value
    const reviewed = sourceFiles["reviewed-claims.json"].value
    const documents = sourceFiles["documents.json"].value
    const parses = sourceFiles["parses.json"].value
    const oldDecision = sourceFiles["editorial-review.json"].value
    await assertProcessedFactReview(root, priorRun, reviewed)

    const oldQualityDirectory = safePath(root, `${base}editorial-quality`)
    const oldQualityFile = fs.existsSync(oldQualityDirectory)
      ? fs.readdirSync(oldQualityDirectory)
          .filter((name) => name.startsWith(draft.draft_id + "-") && name.endsWith(".json"))
          .map((name) => `${base}editorial-quality/${name}`)
          .map((relative) => ({ relative, bytes: fs.readFileSync(safePath(root, relative)) }))
          .find(({ bytes }) => {
            const value = JSON.parse(bytes)
            return (
              value.schema === "research-reader-quality/v1" &&
              value.draft_id === draft.draft_id &&
              value.draft_sha256 === draft.draft_id &&
              value.editorial_decision_sha256 === hashJSON(sourceFiles["editorial-review.json"].value) &&
              value.blocked === false &&
              value.candidate_published === false
            )
          })
      : null
    if (!oldQualityFile)
      throw Error("Exact prior reader-quality approval receipt is required for unchanged-prose reuse")
    const oldQuality = JSON.parse(oldQualityFile.bytes)

    const appearances = editions(vault).flatMap((edition) => {
      const relative = path.relative(vault, edition.file).split(path.sep).join("/")
      const previous = extractArticles(edition).find((entry) => entry.id === prior.article.event_id)
      if (!previous) return []
      const bytes = fs.readFileSync(safePath(vault, relative))
      return [{ path: relative, bytes, previous }]
    })
    if (
      !appearances.length ||
      appearances.some(
        (item) =>
          item.previous.title !== prior.article.title,
      )
    )
      throw Error("Current Drive edition does not contain the approved event identity")

    const review = {
      ...oldDecision,
      reviewed_at: reviewedAt,
      reason,
      reviewer,
      source_read: true,
      final_prose_read: true,
      title_checked: true,
      dates_checked: true,
      numbers_checked: true,
      analysis_checked: true,
      retrospective_review: {
        schema_version: "retrospective-article-review/v1",
        event_id: prior.article.event_id,
        reviewer,
        reviewed_at: reviewedAt,
        reason,
        source_read: true,
        date_change_checked: true,
        ancillary_copy_read: true,
        appearances: appearances.map(({ path: appearancePath, bytes, previous }) => ({
          path: appearancePath,
          sha256: sha256(bytes),
          before_content: bytes.toString("utf8"),
          previous_title: previous.title,
          previous_published_at: previous.review?.published_at || null,
          sections: [],
        })),
      },
    }
    delete review.historical_addition_review
    const article = validateExistingBaselineReview(prior, oldDecision, review, draft, reviewed, documents, parses)
    const input = {
      schema: "research-existing-baseline-approval-input/v1",
      prior_run: priorRun,
      prior_approval_files: prior.files,
      new_run: run,
      event_id: article.event_id,
      appearances: appearances.map(({ path: appearancePath, bytes }) => ({
        path: appearancePath,
        sha256: sha256(bytes),
      })),
      review_sha256: hashJSON(review),
      fact_review_reused: true,
      source_claims_sha256: hashJSON(reviewed.claims),
      draft_sha256: hashJSON(draft),
      documents_sha256: sourceFiles["documents.json"].sha256,
      parses_sha256: sourceFiles["parses.json"].sha256,
      prior_quality_receipt: { path: oldQualityFile.relative, sha256: sha256(oldQualityFile.bytes) },
      candidate_published: false,
      model_calls: 0,
    }
    const state = new RunState(root, run, input)
    return state.stage("approve-existing-baseline", input, async () => {
      for (const name of names) atomicCreate(root, `runs/${run}/${name}`, sourceFiles[name].bytes)
      if (readJSON(root, `runs/${run}/editorial-review.json`) || readJSON(root, `runs/${run}/approved-article.json`))
        throw Error("New run already contains an editorial approval")

      const conceptReceipt = review.concept_review
        ? evaluateArticleConceptReview(root, article, draft, reviewed.claims, parses, review, { vault })
        : null
      if (conceptReceipt)
        atomicCreate(root, `runs/${run}/article-concept-review.json`, conceptReceipt)
      atomicCreate(
        root,
        `runs/${run}/editorial-quality/${draft.draft_id}-${oldQuality.implementation_sha256}.json`,
        oldQualityFile.bytes,
      )
      atomicCreate(root, `runs/${run}/reader-quality-reuse.json`, {
        schema: "research-reader-quality-reuse/v1",
        prior_run: priorRun,
        prior_receipt: input.prior_quality_receipt,
        new_review_sha256: hashJSON(review),
        draft_sha256: draft.draft_id,
        prose_changed: false,
        candidate_published: false,
      })
      const approval = recordArticleApproval(root, run, review, article)
      if (approval.status !== "approved" || approval.reused)
        throw Error("New baseline approval was not created as a native immutable approval")
      atomicCreate(root, `runs/${run}/existing-baseline-approval.json`, {
        ...input,
        source_file_sha256: Object.fromEntries(
          Object.entries(sourceFiles).map(([name, item]) => [name, item.sha256]),
        ),
        status: "approved",
      })

      const readback = loadCurrentApproval(root, run, { vault })
      if (
        readback.article.event_id !== prior.article.event_id ||
        !same(stripReviewBinding(readback.article), stripReviewBinding(prior.article)) ||
        !same(readback.article.retrospective_review, review.retrospective_review) ||
        !same(readJSON(root, `runs/${run}/reviewed-claims.json`).claims, reviewed.claims) ||
        !same(readJSON(root, `runs/${run}/draft.json`), draft) ||
        !same(readJSON(root, `runs/${run}/documents.json`), documents) ||
        !same(readJSON(root, `runs/${run}/parses.json`), parses)
      )
        throw Error("New native approval readback does not preserve the reviewed source and prose")
      return {
        schema: "research-existing-baseline-approval/v1",
        prior_run: priorRun,
        new_run: run,
        event_id: article.event_id,
        approval_files: readback.files,
        source_claims_sha256: hashJSON(reviewed.claims),
        draft_sha256: hashJSON(draft),
        documents_sha256: hashJSON(documents),
        parses_sha256: hashJSON(parses),
        appearances: input.appearances,
        candidate_published: false,
        model_calls: 0,
        status: "approved_readback_verified",
      }
    })
  })
}
