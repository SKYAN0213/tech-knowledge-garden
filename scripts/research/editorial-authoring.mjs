import { sha256 } from "./contracts.mjs"
import { assertVerifiedClaim } from "./claims.mjs"
import { assertReviewDate } from "./dates.mjs"
import {
  assertDraftReferences,
  assertLeadRepetition,
  draftFingerprint,
  draftProblems,
} from "./editor.mjs"
import { assertDeepDiveContext } from "./deep-dive.mjs"
import { assertCompletenessContext } from "./editorial-completeness.mjs"

// GPT/human editorial authoring is a distinct, source-bound path. It never
// manufactures a model generation checkpoint or grants editorial approval.
export function prepareEditorialDraft(
  input,
  claims,
  parses,
  { deepContext = null, documents = [], completenessContext = null } = {},
) {
  const fields = ["reviewer", "reviewed_at", "reason", "source_read", "final_prose_read", "draft"]
  if (
    !input ||
    Object.keys(input).some((key) => !fields.includes(key)) ||
    !input.reviewer?.trim() ||
    !input.reason?.trim() ||
    input.source_read !== true ||
    input.final_prose_read !== true
  )
    throw Error("Explicit source and final prose review required for editorial authoring")
  if (!Array.isArray(claims) || !Array.isArray(parses))
    throw Error("Exact reviewed facts and source parses required")
  const usable = claims.filter((claim) => claim.review?.status === "verified")
  if (!usable.length || new Set(usable.map((claim) => claim.claim_id)).size !== usable.length)
    throw Error("Distinct verified source facts required")
  for (const claim of usable) assertVerifiedClaim(claim, parses)
  if (completenessContext)
    assertCompletenessContext(completenessContext, claims, { documents, parses })
  if (deepContext) assertDeepDiveContext(deepContext, usable, parses, documents)
  assertReviewDate(input.reviewed_at, {
    notBefore: [
      ...usable.map((claim) => claim.review.reviewed_at),
      ...parses.map((p) => p.dates?.observed_at),
      ...(deepContext ? [deepContext.review.reviewed_at] : []),
    ],
  })
  assertDraftReferences(
    input.draft,
    usable.map((claim) => claim.claim_id),
    deepContext,
  )
  assertLeadRepetition(input.draft)
  const problems = draftProblems(
    input.draft,
    completenessContext ? claims : usable,
    deepContext,
    completenessContext,
  )
  if (problems.length) throw Error("Editorial draft needs correction: " + problems.join(", "))
  const draft = structuredClone(input.draft)
  return {
    schema: "research-draft/v1",
    draft_id: draftFingerprint(draft, deepContext),
    draft,
    ...(deepContext ? { deep_context: structuredClone(deepContext) } : {}),
    ...(completenessContext ? { completeness_context: structuredClone(completenessContext) } : {}),
    claim_ids: usable.map((claim) => claim.claim_id),
    provenance: {
      provider: "gpt-editorial",
      author: input.reviewer,
      authored_at: input.reviewed_at,
      reason: input.reason,
      input_sha256: sha256(JSON.stringify(input)),
      claims_sha256: sha256(JSON.stringify(claims)),
      parses_sha256: sha256(JSON.stringify(parses)),
      ...(completenessContext ? { completeness_context_sha256: completenessContext.sha256 } : {}),
      local_model_generated: false,
    },
    status: "editorial_review",
    problems,
    public_approved: false,
  }
}
