import fs from "node:fs"
import { assertSchema, sha256 } from "./contracts.mjs"
import { assertVerifiedClaim } from "./claims.mjs"
import { assertReviewDate } from "./dates.mjs"
import { loadStoredSourceRun } from "./parser.mjs"
import { assertProcessedFactReview } from "./evidence-review-packet.mjs"
import { atomicCreate, readJSON, safePath } from "./run-state.mjs"

export const COMPLETENESS_ASPECTS = [
  "fact",
  "numbers",
  "comparison_conditions",
  "availability",
  "plan_execution",
  "attribution",
]
const text = { type: "string", minLength: 1, pattern: "\\S" }
const hash = { type: "string", pattern: "^[a-f0-9]{64}$" }
const object = (properties, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  required,
  properties,
})
const aspects = {
  type: "array",
  minItems: 1,
  uniqueItems: true,
  items: { type: "string", enum: COMPLETENESS_ASPECTS },
}

export const completenessReviewSchema = object({
  schema: { type: "string", enum: ["research-editorial-completeness-review/v1"] },
  input_sha256: hash,
  reviewer: text,
  reviewed_at: text,
  source_read: { type: "boolean", enum: [true] },
  all_relevant_facts_checked: { type: "boolean", enum: [true] },
  fact_decisions: {
    type: "array",
    minItems: 1,
    items: object({
      claim_id: text,
      important: { type: "boolean" },
      reason: text,
      required_aspects: aspects,
    }),
  },
})

export const completenessCoverageSchema = object({
  schema: { type: "string", enum: ["research-editorial-completeness-coverage/v1"] },
  context_sha256: hash,
  draft_id: hash,
  draft_sha256: hash,
  reviewer: text,
  reviewed_at: text,
  source_read: { type: "boolean", enum: [true] },
  final_prose_read: { type: "boolean", enum: [true] },
  coverage: {
    type: "array",
    minItems: 1,
    items: object({
      claim_id: text,
      reason: text,
      meaning_checked: { type: "boolean", enum: [true] },
      preserved_aspects: aspects,
      locations: {
        type: "array",
        minItems: 1,
        items: object({ location: text, text_sha256: hash }),
      },
    }),
  },
})

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const validRun = (run) => {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(run || "")) throw Error("Exact completeness run required")
}

function sourceInput(claims, documents, parses) {
  if (!Array.isArray(claims) || !Array.isArray(documents) || !Array.isArray(parses))
    throw Error("Exact reviewed facts, original documents and parses required")
  const verified = claims.filter((claim) => claim.review?.status === "verified")
  if (!verified.length || new Set(claims.map((claim) => claim.claim_id)).size !== claims.length)
    throw Error("Distinct verified facts required for completeness review")
  const sourceScope = parses.map((parse) => {
    const originals = documents.filter(
      (document) =>
        document.source_id === parse.source_id &&
        document.source_version_id === parse.source_version_id,
    )
    if (
      originals.length !== 1 ||
      !["extracted", "partial"].includes(parse.status) ||
      !parse.blocks.length ||
      parse.blocks.some((block) => block.locator?.text_hash !== sha256(block.text))
    )
      throw Error("Completeness source range differs from the original parse")
    return {
      source_id: parse.source_id,
      source_version_id: parse.source_version_id,
      parse_id: parse.parse_id,
      original_url: originals[0].original_url,
      blocks: parse.blocks.map((block) => ({
        block_id: block.block_id,
        text_sha256: sha256(block.text),
      })),
    }
  })
  if (!sourceScope.length || new Set(sourceScope.map((row) => row.parse_id)).size !== parses.length)
    throw Error("Distinct original source ranges required")
  verified.forEach((claim) => assertVerifiedClaim(claim, parses))
  return {
    schema: "research-editorial-completeness-input/v1",
    claims_sha256: sha256(JSON.stringify(claims)),
    documents_sha256: sha256(JSON.stringify(documents)),
    parses_sha256: sha256(JSON.stringify(parses)),
    verified_claim_ids: verified.map((claim) => claim.claim_id),
    source_scope: sourceScope,
  }
}

// Derive only necessary preservation checks from an already verified fact.
// This does not decide that a fact is important or that a sentence conveys it.
function factAspects(claim) {
  return [
    "fact",
    ...(claim.numbers?.length ? ["numbers"] : []),
    ...(claim.effective_period || claim.numbers?.some((number) => number.condition)
      ? ["comparison_conditions"]
      : []),
    ...(claim.event_state ? ["plan_execution"] : []),
    ...(["attributed_fact", "company_claim", "forecast", "analysis"].includes(claim.claim_kind)
      ? ["attribution"]
      : []),
  ]
}

function assertReview(review, input, claims, documents = [], parses = []) {
  assertSchema(review, completenessReviewSchema)
  if (review.input_sha256 !== sha256(JSON.stringify(input)))
    throw Error("Completeness review must identify the exact reviewed facts and source range")
  const verified = claims.filter((claim) => claim.review?.status === "verified")
  const decisions = review.fact_decisions
  if (
    decisions.length !== verified.length ||
    new Set(decisions.map((decision) => decision.claim_id)).size !== decisions.length ||
    verified.some((claim) => !decisions.some((decision) => decision.claim_id === claim.claim_id)) ||
    !decisions.some((decision) => decision.important === true)
  )
    throw Error("Review each verified fact explicitly and identify at least one important fact")
  for (const decision of decisions) {
    const claim = verified.find((item) => item.claim_id === decision.claim_id)
    if (
      decision.important &&
      factAspects(claim).some((aspect) => !decision.required_aspects.includes(aspect))
    )
      throw Error(
        "Important fact review must preserve its numbers, conditions, state and attribution",
      )
  }
  assertReviewDate(review.reviewed_at, {
    notBefore: [
      ...verified.flatMap((claim) => [claim.published_at, claim.review.reviewed_at]),
      ...documents.map((document) => document.observed_at),
      ...parses.map((parse) => parse.dates?.observed_at),
    ],
  })
  return review
}

export function recordEditorialCompleteness(review, claims, documents, parses) {
  const input = sourceInput(claims, documents, parses)
  assertReview(review, input, claims, documents, parses)
  const value = {
    schema: "research-editorial-completeness-context/v1",
    input,
    review: structuredClone(review),
    candidate_published: false,
  }
  return { ...value, sha256: sha256(JSON.stringify(value)) }
}

export function assertCompletenessContext(context, claims, { documents, parses } = {}) {
  if (!context || context.schema !== "research-editorial-completeness-context/v1")
    throw Error("Exact reviewed completeness context required")
  const { sha256: seal, ...value } = context
  if (
    seal !== sha256(JSON.stringify(value)) ||
    context.candidate_published !== false ||
    context.input?.schema !== "research-editorial-completeness-input/v1" ||
    context.input.claims_sha256 !== sha256(JSON.stringify(claims)) ||
    !same(
      context.input.verified_claim_ids,
      claims.filter((claim) => claim.review?.status === "verified").map((claim) => claim.claim_id),
    )
  )
    throw Error("Completeness context or reviewed facts changed")
  if (documents !== undefined || parses !== undefined) {
    if (!same(sourceInput(claims, documents, parses), context.input))
      throw Error("Completeness original documents or source range changed")
  }
  assertReview(context.review, context.input, claims, documents, parses)
  return context
}

export async function prepareEditorialCompleteness(ctx, { run_id }) {
  validRun(run_id)
  const { documents, parses } = loadStoredSourceRun(ctx.root, run_id)
  const reviewed = readJSON(ctx.root, `runs/${run_id}/reviewed-claims.json`)
  if (!reviewed) throw Error("Fact review must complete before important fact review")
  await assertProcessedFactReview(ctx.root, run_id, reviewed)
  const input = sourceInput(reviewed.claims, documents, parses)
  return {
    schema: "research-editorial-completeness-packet/v1",
    run_id,
    input,
    input_sha256: sha256(JSON.stringify(input)),
    sources: parses.map((parse) => ({
      ...input.source_scope.find((row) => row.parse_id === parse.parse_id),
      title: parse.title || null,
      blocks: parse.blocks.map((block) => ({
        block_id: block.block_id,
        text: block.text,
        locator: block.locator,
      })),
    })),
    verified_facts: reviewed.claims.filter((claim) => claim.review.status === "verified"),
    review_template: {
      schema: "research-editorial-completeness-review/v1",
      input_sha256: sha256(JSON.stringify(input)),
      reviewer: "",
      reviewed_at: "",
      source_read: false,
      all_relevant_facts_checked: false,
      fact_decisions: reviewed.claims
        .filter((claim) => claim.review.status === "verified")
        .map((claim) => ({
          claim_id: claim.claim_id,
          important: false,
          reason: "",
          required_aspects: factAspects(claim),
        })),
    },
    model_calls: 0,
    approval_changed: false,
    candidate_published: false,
  }
}

// Called under the native writing run lock. Store only the explicit review and
// source identities, not another copy of original bodies or approved articles.
export async function bindEditorialCompleteness(root, run, reviewFile) {
  validRun(run)
  const existing = readJSON(root, `runs/${run}/editorial-completeness/context.json`)
  if (!reviewFile && !existing) return null
  const { documents, parses } = loadStoredSourceRun(root, run)
  const reviewed = readJSON(root, `runs/${run}/reviewed-claims.json`)
  if (!reviewed) throw Error("Verified facts required before completeness binding")
  await assertProcessedFactReview(root, run, reviewed)
  const context = reviewFile
    ? recordEditorialCompleteness(
        JSON.parse(fs.readFileSync(reviewFile, "utf8")),
        reviewed.claims,
        documents,
        parses,
      )
    : assertCompletenessContext(existing, reviewed.claims, { documents, parses })
  if (existing && !same(existing, context))
    throw Error("Completeness review changed; preserve the draft and use a new writing run")
  if (!existing) {
    if (
      readJSON(root, `runs/${run}/model-draft-input.json`) ||
      readJSON(root, `runs/${run}/draft.json`)
    )
      throw Error(
        "Existing draft generation cannot receive a new completeness review; use a new writing run",
      )
    atomicCreate(root, `runs/${run}/editorial-completeness/context.json`, context)
  }
  return context
}

export function draftCoverageLocations(draft) {
  return [
    ...draft.lead.map((sentence, index) => ({ ...sentence, location: `lead[${index}]` })),
    ...draft.explanations.flatMap((explanation, index) =>
      explanation.paragraphs.map((paragraph, paragraphIndex) => ({
        ...paragraph,
        location: `explanations[${index}].paragraphs[${paragraphIndex}]`,
      })),
    ),
    ...(draft.analysis ? [{ ...draft.analysis, location: "analysis" }] : []),
  ]
}

export function inspectEditorialCompleteness(record, claims) {
  const context = record.completeness_context
  if (!context) return null
  assertCompletenessContext(context, claims)
  const paragraphs = draftCoverageLocations(record.draft)
  const important = context.review.fact_decisions.filter((decision) => decision.important)
  const findings = important
    .filter(
      (decision) =>
        !paragraphs.some((paragraph) => paragraph.claim_ids.includes(decision.claim_id)),
    )
    .map((decision) => ({
      code: "important_fact_missing",
      severity: "block",
      locations: ["lead", "explanations"],
      claim_ids: [decision.claim_id],
      required_aspects: decision.required_aspects,
    }))
  return {
    schema: "research-editorial-completeness-inspection/v1",
    context_sha256: context.sha256,
    draft_id: record.draft_id,
    draft_sha256: sha256(JSON.stringify(record.draft)),
    important_claim_ids: important.map((decision) => decision.claim_id),
    findings,
    blocked: findings.length > 0,
    requires_source_coverage_review: true,
    coverage_template: {
      schema: "research-editorial-completeness-coverage/v1",
      context_sha256: context.sha256,
      draft_id: record.draft_id,
      draft_sha256: sha256(JSON.stringify(record.draft)),
      reviewer: "",
      reviewed_at: "",
      source_read: false,
      final_prose_read: false,
      coverage: important.map((decision) => ({
        claim_id: decision.claim_id,
        reason: "",
        meaning_checked: false,
        preserved_aspects: decision.required_aspects,
        locations: paragraphs
          .filter((paragraph) => paragraph.claim_ids.includes(decision.claim_id))
          .map((paragraph) => ({
            location: paragraph.location,
            text_sha256: sha256(paragraph.text),
          })),
      })),
    },
    candidate_published: false,
  }
}

export function assertEditorialCoverage(record, claims, decision, { documents, parses } = {}) {
  if (!record.completeness_context) {
    if (decision !== undefined && decision !== null)
      throw Error("Coverage decision requires a frozen important fact review")
    return null
  }
  assertCompletenessContext(record.completeness_context, claims, { documents, parses })
  const report = inspectEditorialCompleteness(record, claims)
  if (report.blocked) throw Error("Important fact missing from reader prose")
  assertSchema(decision, completenessCoverageSchema)
  if (
    decision.context_sha256 !== report.context_sha256 ||
    decision.draft_id !== record.draft_id ||
    decision.draft_sha256 !== report.draft_sha256 ||
    decision.coverage.length !== report.important_claim_ids.length ||
    new Set(decision.coverage.map((row) => row.claim_id)).size !== decision.coverage.length ||
    report.important_claim_ids.some((id) => !decision.coverage.some((row) => row.claim_id === id))
  )
    throw Error("Coverage review must identify this exact draft and every important fact")
  const paragraphs = draftCoverageLocations(record.draft)
  for (const row of decision.coverage) {
    const requirement = record.completeness_context.review.fact_decisions.find(
      (item) => item.claim_id === row.claim_id,
    )
    if (requirement.required_aspects.some((aspect) => !row.preserved_aspects.includes(aspect)))
      throw Error("Explicit coverage review of conditions, numbers, state and attribution required")
    const seen = new Set()
    for (const location of row.locations) {
      const paragraph = paragraphs.find((item) => item.location === location.location)
      if (
        !paragraph ||
        !paragraph.claim_ids.includes(row.claim_id) ||
        location.text_sha256 !== sha256(paragraph.text) ||
        seen.has(location.location)
      )
        throw Error("Important fact coverage must cite exact reader paragraphs and their facts")
      seen.add(location.location)
    }
  }
  assertReviewDate(decision.reviewed_at, {
    notBefore: [record.completeness_context.review.reviewed_at],
  })
  return { ...report, coverage_review_sha256: sha256(JSON.stringify(decision)) }
}

export function loadEditorialCoverageFile(file, record, claims, options = {}) {
  const decision = JSON.parse(fs.readFileSync(file, "utf8"))
  assertEditorialCoverage(record, claims, decision, options)
  return decision
}
