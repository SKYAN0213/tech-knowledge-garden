import fs from "node:fs"
import { loadApprovedOntologyInput } from "./ontology.mjs"
import { loadStoredSourceRun } from "./parser.mjs"
import { assertProcessedFactReview } from "./evidence-review-packet.mjs"
import { recordFactReview, assertVerifiedClaim } from "./claims.mjs"
import { correctDraft } from "./editor.mjs"
import { assertReviewDate, parseResearchDate, seoulPublicationDay } from "./dates.mjs"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, readJSON, withLock, RunState } from "./run-state.mjs"

const validRun = (id) => /^[A-Za-z0-9_-]+$/.test(id || "")
const checks = [
  "source_read",
  "claims_read",
  "prose_read",
  "identity_checked",
  "dates_checked",
  "numbers_checked",
]
const blockContent = (parse) => parse.blocks.map(({ block_id, ...block }) => block)
const createOnce = (root, relative, value) => {
  const old = readJSON(root, relative)
  if (old && JSON.stringify(old) !== JSON.stringify(value)) throw Error("Revision artifact changed")
  if (!old) atomicCreate(root, relative, value)
}

// A new, explicitly reviewed fact/draft checkpoint for unchanged source bytes.
// Model outputs, the prior approval and the live candidate remain untouched.
// Editorial approval and candidate revision resolution are separate operations.
export async function preparePublicationTimeRevision({
  root,
  runId,
  priorRunId,
  sourceRunId,
  reviewPath,
}) {
  if (
    ![runId, priorRunId, sourceRunId].every(validRun) ||
    new Set([runId, priorRunId, sourceRunId]).size !== 3
  )
    throw Error("Distinct revision, prior approval and source run required")
  const review = readJSON(root, reviewPath)
  if (
    review?.schema !== "research-publication-time-revision-review/v1" ||
    !review.reviewer?.trim() ||
    !review.reason?.trim() ||
    checks.some((key) => review[key] !== true) ||
    review.new_article !== false ||
    review.candidate_published !== false
  )
    throw Error("Explicit source, fact and prose review required")
  return withLock(root, "run-" + runId, async () => {
    const prior = loadApprovedOntologyInput(root, priorRunId)
    await assertProcessedFactReview(
      root,
      priorRunId,
      readJSON(root, `runs/${priorRunId}/reviewed-claims.json`),
    )
    if (
      prior.draft.deep_context ||
      prior.article.article_review.date_kind === "source-publication-time"
    )
      throw Error("Publication precision revision requires an ordinary day-only approval")
    if (
      review.event_id !== prior.article.event_id ||
      review.prior_article_sha256 !== sha256(JSON.stringify(prior.article))
    )
      throw Error("Revision must pin the prior event and approved article")
    const source = loadStoredSourceRun(root, sourceRunId)
    const parsed = source.parses.find((p) => p.parse_id === review.parse_id)
    const original = prior.parses.find((p) => p.source_version_id === parsed?.source_version_id)
    const oldDocument = prior.documents.find(
      (d) => d.source_version_id === original?.source_version_id,
    )
    const document = source.documents.find((d) => d.source_version_id === parsed?.source_version_id)
    if (
      !parsed ||
      !original ||
      !document ||
      !oldDocument ||
      parsed.status !== "extracted" ||
      oldDocument.original_url !== document.original_url ||
      oldDocument.body_sha256 !== document.body_sha256 ||
      parsed.title !== original.title ||
      parsed.language !== original.language ||
      JSON.stringify(blockContent(parsed)) !== JSON.stringify(blockContent(original))
    )
      throw Error("Precision revision requires the same original bytes, title and source blocks")
    const stamp = parsed.dates?.published_at
    if (
      parseResearchDate(original.dates?.published_at)?.precision !== "day" ||
      parseResearchDate(stamp)?.precision !== "timestamp" ||
      parsed.dates.profile_status !== "matched" ||
      parseResearchDate(stamp).day !== original.dates.published_at ||
      seoulPublicationDay(stamp) !== prior.article.article_review.published_at
    )
      throw Error("Precision revision cannot infer a time or change the approved event day")
    assertReviewDate(review.reviewed_at, { notBefore: [stamp, document.observed_at] })
    const parses = [
      ...prior.parses,
      ...source.parses.filter((p) => !prior.parses.some((old) => old.parse_id === p.parse_id)),
    ]
    const documents = [
      ...prior.documents,
      ...source.documents.filter(
        (d) => !prior.documents.some((old) => old.source_version_id === d.source_version_id),
      ),
    ]
    const decisions = prior.claims.map((claim) => {
      assertVerifiedClaim(claim, prior.parses)
      const evidence = claim.evidence.map((e) => {
        if (e.parse_id !== original.parse_id) return e
        const index = original.blocks.findIndex((b) => b.block_id === e.block_id)
        if (index < 0) throw Error("Prior fact block missing")
        return { ...e, parse_id: parsed.parse_id, block_id: parsed.blocks[index].block_id }
      })
      const changed = evidence.some((e, index) => e.parse_id !== claim.evidence[index].parse_id)
      return {
        claim_id: claim.claim_id,
        status: "verified",
        reason: review.reason,
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
        ...(changed
          ? { replacement: { evidence, ...(claim.published_at ? { published_at: stamp } : {}) } }
          : {}),
      }
    })
    const claims = recordFactReview(prior.claims, decisions, review, parses)
    const mapping = new Map(prior.claims.map((c, index) => [c.claim_id, claims[index].claim_id]))
    const draft = structuredClone(prior.draft.draft)
    for (const sentence of [...draft.lead, ...draft.explanations.flatMap((e) => e.paragraphs)])
      sentence.claim_ids = sentence.claim_ids.map((id) => mapping.get(id) || id)
    const corrected = correctDraft(prior.draft, draft, claims, {
      draft_id: prior.draft.draft_id,
      reviewer: review.reviewer,
      reviewed_at: review.reviewed_at,
      reason: review.reason,
    })
    if (corrected.problems.length)
      throw Error("Revised draft has unresolved facts: " + corrected.problems.join(", "))
    const used = new Set(
      [...draft.lead, ...draft.explanations.flatMap((e) => e.paragraphs)].flatMap(
        (s) => s.claim_ids,
      ),
    )
    const datedClaim = claims.find(
      (c) =>
        used.has(c.claim_id) &&
        c.published_at === stamp &&
        c.evidence.some((e) => e.parse_id === parsed.parse_id),
    )
    if (!datedClaim) throw Error("A used, reviewed fact must carry the precise source time")
    const input = {
      schema: "research-publication-time-revision/v1",
      prior_run: priorRunId,
      prior_files: prior.file_hashes,
      source_identity: source.identity,
      review_sha256: sha256(JSON.stringify(review)),
      implementation_sha256: sha256(fs.readFileSync(new URL(import.meta.url))),
      source_published_at: stamp,
      candidate_published: false,
      model_calls: 0,
    }
    const run = new RunState(root, runId, input)
    return run.stage("prepare-publication-time-revision", input, () => {
      for (const [name, value] of Object.entries({
        "documents.json": documents,
        "parses.json": parses,
        "claims.json": {
          schema: "research-approved-facts-reuse/v1",
          claims: prior.claims,
          prior_run: priorRunId,
          prior_files: prior.file_hashes,
          requires_fact_review: true,
        },
        "reviewed-claims.json": { claims, publication_time_revision: input },
        "fact-review-decision.json": { ...review, claims: decisions },
        "draft.json": corrected,
        "publication-time-revision.json": input,
        "publication-time-revision-review.json": review,
      }))
        createOnce(root, `runs/${runId}/${name}`, value)
      const previous = readJSON(root, `runs/${priorRunId}/editorial-review.json`)
      const template = {
        ...previous,
        draft_id: corrected.draft_id,
        reviewed_at: seoulPublicationDay(review.reviewed_at) || review.reviewed_at,
        event_date_basis: {
          kind: "source-publication-time",
          source_id: parsed.source_id,
          source_version_id: parsed.source_version_id,
          parse_id: parsed.parse_id,
          claim_id: datedClaim.claim_id,
          source_published_at: stamp,
          timezone: "Asia/Seoul",
        },
      }
      delete template.retrospective_review
      delete template.historical_addition_review
      // A template cannot inherit assertions that this new draft was approved.
      template.status = "pending"
      template.reader_quality_review = { repetition_checked: false }
      for (const key of [
        "source_read",
        "final_prose_read",
        "title_checked",
        "dates_checked",
        "numbers_checked",
        "analysis_checked",
      ])
        template[key] = false
      createOnce(root, `runs/${runId}/editorial-review-template.json`, template)
      return {
        status: "editorial_review",
        event_id: prior.article.event_id,
        draft_id: corrected.draft_id,
        claims: claims.length,
        source_published_at: stamp,
        model_calls: 0,
        prior_approval_preserved: true,
        candidate_published: false,
      }
    })
  })
}
