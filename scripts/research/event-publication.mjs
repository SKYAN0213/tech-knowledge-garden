import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { loadSelectedEvent } from "./event-pipeline.mjs"
import { nativeResearch } from "./modules/contracts.mjs"
import { loadCurrentApproval } from "./preview.mjs"
import { approvedArticle } from "./publish-adapter.mjs"
import { assertReviewDate, samePublicationDate } from "./dates.mjs"
import { atomicCreate, readJSON, safePath } from "./run-state.mjs"
import { loadEditorialCoverageFile } from "./editorial-completeness.mjs"

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const usedIds = (draft) => [
  ...new Set(
    [
      ...draft.draft.lead,
      ...draft.draft.explanations.flatMap((e) => e.paragraphs),
      ...(draft.draft.analysis ? [draft.draft.analysis] : []),
    ].flatMap((s) => s.claim_ids),
  ),
]
const exactReview = (ctx, file) => {
  const bytes = fs.readFileSync(safePath(ctx.repo, file))
  return { value: JSON.parse(bytes), sha256: sha256(bytes) }
}
function immutable(root, file, value) {
  const prior = readJSON(root, file)
  if (prior && !same(prior, value)) throw Error("Event approval lineage changed")
  return prior
    ? { path: file, sha256: sha256(fs.readFileSync(safePath(root, file))) }
    : atomicCreate(root, file, value)
}

function verifyChanges(previous, current, review) {
  const removedConcepts = (previous.article.article_review.concept_ids || []).filter(
    (id) => !(current.article.article_review.concept_ids || []).includes(id),
  )
  if (
    removedConcepts.some(
      (id) =>
        !review.concept_changes?.some(
          (r) => r.concept_id === id && r.disposition === "removed" && r.reason?.trim(),
        ),
    )
  )
    throw Error("Revision cannot silently remove previously reviewed specialist links")
  const oldUsed = usedIds(previous.draft),
    newUsed = new Set(usedIds(current.draft))
  if (
    !Array.isArray(review.changes) ||
    review.changes.length !== oldUsed.length ||
    new Set(review.changes.map((c) => c.prior_claim_id)).size !== oldUsed.length ||
    review.changes.some((c) => !oldUsed.includes(c.prior_claim_id))
  )
    throw Error("Revision must account for every previously published fact")
  for (const row of review.changes) {
    if (
      !["retained", "corrected", "removed"].includes(row.disposition) ||
      !row.reason?.trim() ||
      !Array.isArray(row.current_claim_ids) ||
      new Set(row.current_claim_ids).size !== row.current_claim_ids.length ||
      row.current_claim_ids.some((id) => !newUsed.has(id)) ||
      (row.disposition === "removed"
        ? row.current_claim_ids.length !== 0
        : !row.current_claim_ids.length)
    )
      throw Error("Exact fact-specific revision decisions required")
    if (row.disposition === "retained") {
      const old = previous.claims.find((c) => c.claim_id === row.prior_claim_id)
      if (
        !row.current_claim_ids.some((id) => {
          const next = current.claims.find((c) => c.claim_id === id)
          return (
            next &&
            ["statement", "event_state", "effective_period", "numbers"].every((key) =>
              same(old[key], next[key]),
            )
          )
        })
      )
        throw Error("Retained fact changed; use an explicit correction decision")
    }
  }
}
function inputFromApproval(ctx, run) {
  const approval = loadCurrentApproval(ctx.root, run, { vault: ctx.vault })
  return {
    ...approval,
    file_hashes: approval.files,
    draft: readJSON(ctx.root, `runs/${run}/draft.json`),
    claims: readJSON(ctx.root, `runs/${run}/reviewed-claims.json`).claims,
  }
}

// Approvals remain the native prose/fact/concept authority. This wrapper only
// binds them to reviewed event actions and preserves stable event identity.
export async function approveSelectedEvent(ctx, p) {
  const reference = readJSON(ctx.root, `runs/${p.run_id}/event-selection.json`)
  if (!reference)
    return nativeResearch(ctx, "approve", p, {
      run_id: "run",
      review_file: "review",
      coverage_review_file: "coverage-review",
    })
  const selection = loadSelectedEvent(
    ctx,
    { run_id: p.run_id, selection_path: reference.path, selection_sha256: reference.sha256 },
    { requireProcessed: true },
  )
  const review = exactReview(ctx, p.review_file).value
  const draft = readJSON(ctx.root, `runs/${p.run_id}/draft.json`)
  const source = readJSON(ctx.root, `runs/${p.run_id}/documents.json`)
  const parses = readJSON(ctx.root, `runs/${p.run_id}/parses.json`)
  const claims = readJSON(ctx.root, `runs/${p.run_id}/reviewed-claims.json`).claims
  if (p.coverage_review_file) {
    const coverage = loadEditorialCoverageFile(
      safePath(ctx.repo, p.coverage_review_file),
      draft,
      claims,
      { documents: source, parses },
    )
    if (review.completeness_review && !same(review.completeness_review, coverage))
      throw Error("Editorial review and separate important fact coverage differ")
    review.completeness_review = coverage
  }
  const proposed = approvedArticle(draft, claims, source, review, parses)
  const action = selection.action || "write"
  let revision = null
  if (["update", "correction"].includes(action)) {
    if (!p.revision_file)
      throw Error("Existing event revision requires a fact-specific lineage review")
    const previous = inputFromApproval(ctx, selection.existing_event.run_id)
    const current = { article: proposed, draft, claims }
    const decision = exactReview(ctx, p.revision_file)
    const r = decision.value
    if (
      r.schema !== "research-event-revision-review/v1" ||
      r.action !== action ||
      r.prior_run !== previous.run ||
      r.current_run !== p.run_id ||
      r.event_id !== previous.article.event_id ||
      r.event_id !== proposed.event_id ||
      r.selection_sha256 !== reference.sha256 ||
      r.prior_article_sha256 !== sha256(JSON.stringify(previous.article)) ||
      r.draft_id !== draft.draft_id ||
      !r.reviewer?.trim() ||
      !r.reason?.trim() ||
      [
        "source_read",
        "prior_article_read",
        "final_prose_read",
        "identity_checked",
        "dates_checked",
        "numbers_checked",
      ].some((key) => r[key] !== true) ||
      !samePublicationDate(
        proposed.article_review.published_at,
        previous.article.article_review.published_at,
      )
    )
      throw Error("Revision must preserve the native event ID and original publication date")
    assertReviewDate(r.reviewed_at, {
      notBefore: [previous.article.article_review.reviewed_at, proposed.article_review.reviewed_at],
    })
    verifyChanges(previous, current, r)
    const reviewRef = immutable(ctx.root, `runs/${p.run_id}/event-revision-review.json`, r)
    revision = {
      schema: "research-event-revision/v1",
      event_id: proposed.event_id,
      action,
      previous: { run: previous.run, event_id: proposed.event_id, files: previous.files },
      review: reviewRef,
      input_review_sha256: decision.sha256,
      selection: reference,
    }
  } else if (selection.existing_event?.event_id === proposed.event_id) {
    throw Error("A follow-up action requires a new event ID; use update for the same event")
  }
  const prior = readJSON(ctx.root, `runs/${p.run_id}/approved-article.json`)
  const result = prior
    ? { status: "approved", reused: true, candidate_published: false }
    : await nativeResearch(ctx, "approve", p, {
        run_id: "run",
        review_file: "review",
        coverage_review_file: "coverage-review",
      })
  const current = inputFromApproval(ctx, p.run_id)
  if (!same(current.article, proposed))
    throw Error("Selected event differs from its final native approval")
  if (revision) {
    const record = {
      ...revision,
      current: { run: current.run, event_id: current.article.event_id, files: current.files },
    }
    immutable(ctx.root, `runs/${p.run_id}/event-revision.json`, record)
  } else if (selection.existing_event) {
    immutable(ctx.root, `runs/${p.run_id}/event-followup.json`, {
      schema: "research-event-followup/v1",
      previous: selection.existing_event,
      current: {
        run: p.run_id,
        event_id: current.article.event_id,
        article_sha256: sha256(JSON.stringify(current.article)),
      },
      selection: reference,
    })
  }
  return {
    ...result,
    event_id: current.article.event_id,
    action,
    published_at: current.article.article_review.published_at,
    article_url: `news/${current.article.event_id}`,
    rss_guid_preserved: Boolean(revision),
    ...(revision ? { revision: `runs/${p.run_id}/event-revision.json` } : {}),
  }
}

// Native ontology extension uses this receipt only for exact selected revisions.
export function loadSelectedEventRevision(root, previous, current, { vault = "vault" } = {}) {
  const file = `runs/${current.run}/event-revision.json`,
    receipt = readJSON(root, file)
  if (!receipt) return null
  const bytes = fs.readFileSync(safePath(root, receipt.review.path))
  if (sha256(bytes) !== receipt.review.sha256) throw Error("Selected event revision review changed")
  const review = JSON.parse(bytes)
  const ctx = { root, vault, historical: true }
  const selection = loadSelectedEvent(
    ctx,
    {
      run_id: current.run,
      selection_path: receipt.selection.path,
      selection_sha256: receipt.selection.sha256,
    },
    { requireProcessed: true },
  )
  if (
    receipt.schema !== "research-event-revision/v1" ||
    receipt.event_id !== previous.article.event_id ||
    receipt.event_id !== current.article.event_id ||
    review.action !== receipt.action ||
    !["update", "correction"].includes(receipt.action) ||
    selection.action !== receipt.action ||
    selection.existing_event.run_id !== previous.run ||
    selection.existing_event.article_sha256 !== sha256(JSON.stringify(previous.article)) ||
    review.prior_run !== previous.run ||
    review.current_run !== current.run ||
    review.event_id !== receipt.event_id ||
    review.draft_id !== current.draft.draft_id ||
    review.selection_sha256 !== receipt.selection.sha256 ||
    review.prior_article_sha256 !== sha256(JSON.stringify(previous.article)) ||
    !same(receipt.previous, {
      run: previous.run,
      event_id: receipt.event_id,
      files: previous.file_hashes,
    }) ||
    !same(receipt.current, {
      run: current.run,
      event_id: receipt.event_id,
      files: current.file_hashes,
    }) ||
    !samePublicationDate(
      previous.article.article_review.published_at,
      current.article.article_review.published_at,
    )
  )
    throw Error("Selected event revision differs from native approved artifacts")
  verifyChanges(previous, current, review)
  if (
    !review.reviewer?.trim() ||
    !review.reason?.trim() ||
    [
      "source_read",
      "prior_article_read",
      "final_prose_read",
      "identity_checked",
      "dates_checked",
      "numbers_checked",
    ].some((key) => review[key] !== true)
  )
    throw Error("Stored event revision requires the original explicit review checks")
  assertReviewDate(review.reviewed_at, {
    notBefore: [
      previous.article.article_review.reviewed_at,
      current.article.article_review.reviewed_at,
    ],
  })
  return {
    event_id: receipt.event_id,
    previous: receipt.previous,
    current: receipt.current,
    receipt: { path: file, sha256: sha256(fs.readFileSync(safePath(root, file))) },
  }
}

export function loadSelectedEventFollowup(root, run, article, { vault = "vault" } = {}) {
  const file = `runs/${run}/event-followup.json`,
    receipt = readJSON(root, file)
  if (!receipt) return null
  const selection = loadSelectedEvent(
    { root, vault, historical: true },
    {
      run_id: run,
      selection_path: receipt.selection.path,
      selection_sha256: receipt.selection.sha256,
    },
    { requireProcessed: true },
  )
  if (
    receipt.schema !== "research-event-followup/v1" ||
    selection.action !== "write" ||
    !same(receipt.previous, selection.existing_event) ||
    receipt.current.run !== run ||
    receipt.current.event_id !== article.event_id ||
    receipt.previous.event_id === article.event_id ||
    receipt.current.article_sha256 !== sha256(JSON.stringify(article))
  )
    throw Error("Follow-up differs from the exact reviewed event relation")
  return {
    relation: "followup",
    previous_event_id: receipt.previous.event_id,
    current_event_id: article.event_id,
    previous_run: receipt.previous.run_id,
    current_run: run,
    receipt: { path: file, sha256: sha256(fs.readFileSync(safePath(root, file))) },
  }
}
