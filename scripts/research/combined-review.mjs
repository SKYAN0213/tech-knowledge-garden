import fs from "node:fs"
import path from "node:path"
import { sha256, assertSchema, extractionSchema } from "./contracts.mjs"
import { recordFactReview, validateEvidence } from "./claims.mjs"
import { loadStoredSourceRun } from "./parser.mjs"
import { conceptRegistry } from "./knowledge-links.mjs"
import { rankPreapprovalConceptHints } from "./concept-candidate-index.mjs"
import {
  memoizeVerifiedInput,
  trackVerifiedPath,
  measureVerifiedInputStage,
} from "./verified-inputs.mjs"
import { inspectReaderQuality, assertReaderQuality } from "./reader-quality.mjs"
import { approvedArticle } from "./publish-adapter.mjs"
import { evaluateArticleConceptReview } from "./article-concept-review.mjs"
import { loadCurationSelection } from "./curation.mjs"
import { assertSelectedEventFactScope } from "./event-pipeline.mjs"
import {
  editorialCompletenessInput,
  recordEditorialCompleteness,
  bindEditorialCompleteness,
  inspectEditorialCompleteness,
  assertEditorialCoverage,
  COMPLETENESS_ASPECTS,
  completenessReviewSchema,
  factAspects,
  assertEditorialCoverageRow,
  completenessCoverageSchema,
  draftCoverageLocations,
} from "./editorial-completeness.mjs"
import { prepareRoleProvider, resolveRolePolicy } from "./model-policy.mjs"
import { createModelProvider } from "./model-provider.mjs"
import { nativeResearch } from "./modules/contracts.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, RunState } from "./run-state.mjs"
import { schemaForDraft, draftProblems } from "./editor.mjs"
import { assertReviewDate, parseResearchDate, seoulPublicationDay } from "./dates.mjs"
import { readReasoningTask } from "./reasoning-tasks.mjs"
import { THEMES } from "../themes.mjs"

const text = { type: "string", minLength: 1 }
const object = (properties, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
})
const list = (items, maxItems = 1000) => ({ type: "array", items, maxItems })
const fixed = (value) => ({ type: typeof value, enum: [value] })
const checks = [
  "source_read",
  "entailment_checked",
  "identity_checked",
  "numbers_checked",
  "time_checked",
]
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
function latestReviewTime(values) {
  const parsed = values.map((value) => {
    const date = parseResearchDate(value)
    if (!date) return { value, invalid: true }
    return {
      value,
      ...date,
      review_day: date.precision === "day" ? date.day : seoulPublicationDay(value),
    }
  })
  if (!parsed.length) throw Error("At least one explicit review date required")
  // Return invalid metadata to the existing native validator and targeted
  // repair instead of accidentally hiding it behind a valid later part.
  if (parsed.some((entry) => entry.invalid)) return parsed.find((entry) => entry.invalid).value
  const day = parsed
    .map((entry) => entry.review_day)
    .toSorted()
    .at(-1)
  const latestDay = parsed.filter((entry) => entry.review_day === day)
  // A day-only review has no known instant. Keep that explicit precision if
  // another review on the same Korean day has a timestamp.
  const dayOnly = latestDay.find((entry) => entry.precision === "day")
  return (dayOnly || latestDay.toSorted((a, b) => a.instant - b.instant).at(-1)).value
}
// Existing BRIEFING_QUALITY.md policy: shared fact IDs are a review signal,
// while exact repeated sentences and missing native references remain blocks.
const readerReviewPolicy =
  "A two-to-four-sentence lead summarizes the event; explanations add mechanism, conditions and detail. Shared facts or claim IDs between lead and explanation do not by themselves establish needless repetition. Read whether the explanation adds useful detail; exact repeated sentences remain blocked. Part zero assesses the whole draft and reports all known revision findings together, while coverage rows stay within the assigned claim IDs."
const sourceReferencePolicy =
  " The packet's source_reference_contract defines lossless $source_text and $source_segments values. Resolve them against the exact bound parsed blocks before reviewing or writing, and return ordinary literal strings where the output schema requires them. Match documents and parses by source_version_id, not array position. If tool output is truncated, read smaller ranges until every required source passage is actually visible; SHA and length checks do not establish reading. Never claim source_read for unseen content. Do not treat references as extra evidence or reread preserved earlier model artifacts."
function editorialDecisionSchema(prepared, status = null) {
  const date = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }
  const concept = object({
    schema: fixed("article-concept-review/v2"),
    outcome: { type: "string", enum: ["reviewed_links", "reviewed_none"] },
    reason: { ...text, minLength: 10 },
    reviewer: text,
    reviewed_at: date,
    article_source_read: fixed(true),
    concept_registry_read: fixed(true),
    aliases_checked: fixed(true),
    assignments: list(
      object({
        concept_id: text,
        role: {
          type: "string",
          enum: ["topic", "application", "comparison_evaluation", "context_background"],
        },
        status: fixed("verified"),
        reason: { ...text, minLength: 10 },
        reviewer: text,
        reviewed_at: date,
        evidence: {
          ...list(
            object({ event_id: { type: "string", pattern: "^[a-f0-9]{16}$" }, claim_id: text }),
          ),
          minItems: 1,
        },
        note: object(
          {
            path: { type: "string", pattern: "^Knowledge/.+\\.md$" },
            sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
            approval_run: text,
          },
          ["path", "sha256"],
        ),
        definition_read: fixed(true),
        article_source_read: fixed(true),
        relationship_checked: fixed(true),
        aliases_checked: fixed(true),
      }),
      32,
    ),
  })
  const properties = {
    status: { type: "string", enum: ["approved", "needs_revision"] },
    draft_id: fixed(prepared.packet.draft.draft_id),
    event_id: prepared.packet.expected_event_id
      ? fixed(prepared.packet.expected_event_id)
      : { type: "string", pattern: "^[a-f0-9]{16}$" },
    published_at: date,
    reviewed_at: date,
    region: { type: "string", enum: ["국내", "해외", "국제 공동"] },
    reviewer: text,
    source_read: fixed(true),
    final_prose_read: fixed(true),
    title_checked: fixed(true),
    dates_checked: fixed(true),
    numbers_checked: fixed(true),
    analysis_checked: fixed(true),
    concept_ids: list(text, 32),
    reader_quality_review: {
      type: "object",
      required: ["repetition_checked"],
      properties: { repetition_checked: fixed(true) },
    },
    concept_review: concept,
    reason: text,
  }
  const approval = {
    type: "object",
    required: Object.keys(properties).filter((k) => k !== "reason"),
    properties,
  }
  if (status === "approved") return approval
  const revision = {
    type: "object",
    required: ["status", "draft_id", "reviewer", "reviewed_at"],
    properties: Object.fromEntries(
      ["status", "draft_id", "reviewer", "reviewed_at", "reason"].map((key) => [
        key,
        properties[key],
      ]),
    ),
  }
  if (status === "needs_revision") return revision
  // The transport exposes the standard conditional contract. The native
  // workflow also validates the selected branch explicitly: its small shared
  // JSON validator intentionally does not implement conditional keywords.
  return {
    ...revision,
    if: { properties: { status: fixed("approved") }, required: ["status"] },
    then: { required: approval.required, properties: approval.properties },
  }
}
function invalidEditorialFields(value, schema) {
  return Object.entries(schema.properties)
    .filter(([key, field]) => {
      if (value?.[key] === undefined) return schema.required.includes(key)
      try {
        assertSchema(value[key], field)
        return false
      } catch {
        return true
      }
    })
    .map(([key]) => key)
}
const ref = (root, file) => ({ path: file, sha256: sha256(fs.readFileSync(safePath(root, file))) })
function save(root, file, value) {
  const prior = readJSON(root, file)
  if (prior) {
    if (!same(prior, value)) throw Error("Combined review input changed; use a new run")
    return ref(root, file)
  }
  return atomicCreate(root, file, value)
}

function assertCorrectionReviewTime(
  ctx,
  state,
  stage,
  result,
  value,
  notBefore,
  { boundFirst = false } = {},
) {
  const invalid = (message) => Object.assign(Error(message), { code: "CORRECTION_TIME_INVALID" })
  let finishedAt = state.state.stages[stage]?.finished_at
  if (result.provenance?.task_id) {
    const provenance = result.provenance
    const checked = readReasoningTask(ctx.root, {
      task_id: provenance.task_id,
      request_sha256: provenance.request_sha256,
      limit: 1,
    })
    if (checked.status !== "completed" || checked.result.result_sha256 !== provenance.result_sha256)
      throw Error("Correction model result binding changed")
    const submitted = readJSON(ctx.root, checked.result.path)
    if (!submitted || !same(submitted.output, result.output))
      throw Error("Correction model result content changed")
    finishedAt = submitted.submitted_at
  }
  const completed = parseResearchDate(finishedAt),
    reviewed = parseResearchDate(value)
  if (!completed || completed.precision !== "timestamp")
    throw Error("Exact correction result completion time required")
  const checkBound = () => {
    if (!reviewed) throw invalid("Valid review date with an explicit timestamp offset required")
    if (
      reviewed.precision === "timestamp"
        ? reviewed.instant > completed.instant
        : reviewed.day > seoulPublicationDay(finishedAt)
    )
      throw invalid("Review time follows the recorded model result")
  }
  if (boundFirst) checkBound()
  try {
    assertReviewDate(value, { notBefore })
  } catch (error) {
    throw invalid(error.message)
  }
  if (!boundFirst) checkBound()
}

const repairStageName = (component, ids) =>
  "repair-" + component + "-" + sha256(JSON.stringify(ids)).slice(0, 16)

function assertSavedReviewTime(ctx, source, value, notBefore = []) {
  try {
    const result = readJSON(ctx.root, source.state.directory + source.stage + ".json")
    if (!result) throw Error("Exact review model result required")
    assertCorrectionReviewTime(ctx, source.state, source.stage, result, value, notBefore, {
      boundFirst: true,
    })
  } catch (error) {
    if (error.code !== "CORRECTION_TIME_INVALID") error.code = "REVIEW_TIME_BINDING_INVALID"
    throw error
  }
}
function editorialDisputeSchema(prepared, reviewSHA) {
  return object({
    schema: fixed("research-editorial-review-dispute/v1"),
    input_sha256: fixed(prepared.input_sha256),
    draft_id: fixed(prepared.packet.draft.draft_id),
    editorial_review_sha256: fixed(reviewSHA),
    source_read: fixed(true),
    final_prose_read: fixed(true),
    reason: { ...text, minLength: 20 },
  })
}
function sourceAdditionSchema(prepared) {
  const claim = structuredClone(extractionSchema.properties.claims.items)
  const keys = sourceAdditionCandidateKeys(prepared)
  claim.properties.candidate_key = {
    type: "string",
    pattern: "^[a-zA-Z0-9_-]+$",
    ...(keys.length ? { enum: keys } : {}),
  }
  claim.required.push("candidate_key")
  return object({
    claim,
    decision: object(
      {
        reason: text,
        ...Object.fromEntries(checks.map((k) => [k, { type: "boolean" }])),
        ocr_evidence: { type: "array" },
      },
      ["reason", ...checks],
    ),
  })
}
function sourceAdditionCandidateKeys(prepared) {
  const keys = [...new Set(prepared.packet.claims.map((claim) => claim.candidate_key))]
  return keys.length
    ? keys
    : prepared.packet.empty_extraction
      ? [prepared.packet.empty_extraction.candidate_key]
      : []
}
function claimReplacementSchema() {
  const schema = structuredClone(extractionSchema.properties.claims.items)
  schema.required = []
  return schema
}
function structuralFactValidation(claim, parses) {
  return {
    claim_id: claim.claim_id,
    structural_problems: validateEvidence(claim, parses).problems,
  }
}
function readEditorialDispute(ctx, prepared) {
  const file = prepared.base + "editorial-dispute.json",
    record = readJSON(ctx.root, file)
  if (!record) return null
  const pinned = (r) => {
    if (!r || ref(ctx.root, r.path).sha256 !== r.sha256)
      throw Error("Editorial dispute evidence changed")
    return readJSON(ctx.root, r.path)
  }
  if (
    record.schema !== "research-editorial-dispute-record/v1" ||
    record.input_sha256 !== prepared.input_sha256 ||
    record.draft.path !== `runs/${prepared.run_id}/draft.json` ||
    record.manifest.path !== prepared.manifest.path ||
    record.manifest.sha256 !== prepared.manifest.sha256
  )
    throw Error("Exact source-bound editorial dispute required")
  const draft = pinned(record.draft),
    decision = pinned(record.decision),
    evidence = pinned(record.revision_evidence)
  pinned(record.manifest)
  const review = pinned(evidence.editorial)
  const mapping = evidence.coverage_decision_mapping
  if (mapping !== undefined && !Array.isArray(mapping))
    throw Error("Editorial dispute evidence changed")
  const references = [
    evidence.coverage,
    evidence.response,
    ...evidence.repairs,
    ...(mapping || []).map((row) => row?.response),
    ...(evidence.coverage_reuse ? [evidence.coverage_reuse] : []),
  ]
  for (const r of new Map(
    references.map((reference) => [JSON.stringify(reference), reference]),
  ).values())
    pinned(r)
  if (
    evidence.input_sha256 !== prepared.input_sha256 ||
    !same(evidence.draft, record.draft) ||
    review.status !== "needs_revision" ||
    draft.draft_id !== prepared.packet.draft.draft_id ||
    !same(decision.draft, prepared.packet.draft.draft)
  )
    throw Error("Editorial dispute changed its exact draft or review")
  assertSchema(decision.review_dispute, editorialDisputeSchema(prepared, evidence.editorial.sha256))
  assertReviewDate(decision.reviewed_at, { notBefore: [review.reviewed_at] })
  return { record, reference: ref(ctx.root, file), decision, review }
}

// Every source byte is retained. Retrieval pages are tools' bounded inputs,
// never summaries or an increase of the configured structured-request budget.
export function reviewPacketPages(text, width = 8000) {
  const pages = []
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + width, text.length)
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--
    pages.push({ start, end, text: text.slice(start, end) })
    start = end
  }
  return pages
}

function loadPinnedSelection(root, reference) {
  if (!reference) return null
  if (typeof reference.path !== "string" || !/^[a-f0-9]{64}$/.test(reference.sha256 || ""))
    throw Error("Exact selected event reference required")
  const bytes = fs.readFileSync(safePath(root, reference.path))
  if (sha256(bytes) !== reference.sha256) throw Error("Selected event selection SHA changed")
  return JSON.parse(bytes)
}

// A shared extraction can contain facts for other selected events while this
// event has none. Bind its original candidate and source before allowing the
// model to explicitly review the selected source and propose additions.
function emptyExtractionBinding(
  ctx,
  run,
  extracted,
  selectionRef,
  selectedEvent,
  documents,
  parses,
) {
  const inputPath = `runs/${run}/event-extraction-input.json`
  const input = readJSON(ctx.root, inputPath)
  const provenance = extracted?.provenance
  if (
    !selectedEvent ||
    !selectionRef ||
    provenance?.schema !== "research-event-fact-extraction/v1" ||
    input?.schema !== "research-selected-event-extraction-input/v1" ||
    !same(input, provenance.input) ||
    input.selection_sha256 !== selectionRef.sha256 ||
    !same(input.source_identity, selectedEvent.source_identity) ||
    input.source_identity?.source_run !== selectedEvent.source_run ||
    typeof input.candidate_key !== "string" ||
    !documents.some((document) => input.candidate_key === `source-${document.source_id}`)
  )
    throw Error("Exact empty selected-event extraction binding required")
  const selectedSource = loadStoredSourceRun(ctx.root, selectedEvent.source_run)
  if (
    !same(selectedSource.identity, input.source_identity) ||
    !same(selectedSource.documents, documents) ||
    !same(selectedSource.parses, parses)
  )
    throw Error("Exact empty selected-event extraction binding changed")
  return { candidate_key: input.candidate_key, extraction_input: ref(ctx.root, inputPath) }
}

function trackedConceptRegistry(ctx) {
  return memoizeVerifiedInput(ctx, "combined-review-concept-registry", () => {
    // Track both bytes and directory listings: an added, removed or renamed
    // concept must invalidate the same invocation's cached registry as well.
    function track(directory) {
      if (!trackVerifiedPath(directory) || !fs.existsSync(directory)) return
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name)
        if (entry.isSymbolicLink()) throw Error("Symlink in verified concept registry")
        if (entry.isDirectory()) {
          if (!entry.name.startsWith(".")) track(file)
        } else if (entry.name.endsWith(".md")) trackVerifiedPath(file)
      }
    }
    track(path.join(ctx.vault, "Knowledge"))
    return conceptRegistry(ctx.vault).map(({ path: p, meta }) => ({
      path: p,
      meta,
      source_file: path.join(ctx.vault, p + ".md"),
      source_sha256: sha256(fs.readFileSync(safePath(ctx.vault, p + ".md"))),
    }))
  })
}

function packet(ctx, run, kind, curation) {
  const { documents, parses } = loadStoredSourceRun(ctx.root, run)
  const extracted = readJSON(ctx.root, `runs/${run}/claims.json`)
  const reviewed = readJSON(ctx.root, `runs/${run}/reviewed-claims.json`)
  const draft = kind === "editorial" ? readJSON(ctx.root, `runs/${run}/draft.json`) : null
  const selectionRef = readJSON(ctx.root, `runs/${run}/event-selection.json`)
  const selectedEvent = loadPinnedSelection(ctx.root, selectionRef)
  const candidate =
    curation &&
    loadCurationSelection(ctx, curation).selected.find(
      (item) =>
        item.execution.plan.path === selectedEvent?.plan.path &&
        item.execution.group_id === selectedEvent?.group_id,
    )
  if (!extracted || (kind === "editorial" && (!reviewed || !draft)))
    throw Error("Exact native article stage required for combined review")
  const concepts =
    kind === "editorial"
      ? measureVerifiedInputStage("semantic_registry_input", () => trackedConceptRegistry(ctx))
      : []
  const publicClaimIds = draft
    ? new Set(
        [
          ...(draft.draft.lead || []),
          ...(draft.draft.explanations || []).flatMap((section) => section.paragraphs || []),
          ...(draft.draft.analysis ? [draft.draft.analysis] : []),
        ].flatMap((paragraph) => paragraph.claim_ids || []),
      )
    : new Set()
  const conceptHints = draft
    ? measureVerifiedInputStage("semantic_candidate_lookup", () =>
        rankPreapprovalConceptHints({
          query: [
            draft.draft.title,
            ...reviewed.claims
              .filter(
                (claim) =>
                  publicClaimIds.has(claim.claim_id) && claim.review?.status === "verified",
              )
              .map((claim) => claim.statement),
          ]
            .filter((value) => typeof value === "string" && value.trim())
            .join("\n"),
          concepts: concepts.map(({ meta }) => ({
            concept_id: meta.concept_id,
            title: meta.title,
            label: meta.label,
            aliases: meta.aliases || [],
            keywords: meta.keywords || [],
            reason: meta.map_review?.reason,
            kind: meta.map_review?.kind,
          })),
        }),
      )
    : null
  return {
    schema: "research-combined-review-input/v1",
    run_id: run,
    kind,
    model_policy_sha256: sha256(fs.readFileSync(ctx.policy)),
    implementation: Object.fromEntries(
      [
        "combined-review.mjs",
        "concept-candidate-index.mjs",
        "verified-inputs.mjs",
        "claims.mjs",
        "editorial-completeness.mjs",
        "publish-adapter.mjs",
        "reader-quality.mjs",
        "article-concept-review.mjs",
        "knowledge-links.mjs",
        "editor.mjs",
        "model-policy.mjs",
        "event-pipeline.mjs",
        "../themes.mjs",
      ].map((name) => [name, sha256(fs.readFileSync(new URL(name, import.meta.url)))]),
    ),
    documents,
    parses,
    selected_event_reference: selectionRef,
    selected_event: selectedEvent,
    ...(candidate
      ? {
          candidate_id: candidate.candidate_id,
          expected_event_id: candidate.candidate_id.slice(0, 16),
          curation,
        }
      : {}),
    claims: kind === "evidence" ? extracted.claims : reviewed.claims,
    ...(kind === "evidence" && Array.isArray(extracted.claims) && !extracted.claims.length
      ? {
          empty_extraction: emptyExtractionBinding(
            ctx,
            run,
            extracted,
            selectionRef,
            selectedEvent,
            documents,
            parses,
          ),
        }
      : {}),
    ...(draft
      ? {
          draft,
          reader_quality: inspectReaderQuality(draft, reviewed.claims),
          // This is the exact blocker set used by approvedArticle. A separate
          // whitelist lets a reviewer approve prose that native approval can
          // never accept, causing avoidable full-run failures.
          native_draft_problems: draftProblems(
            draft.draft,
            reviewed.claims,
            draft.deep_context,
            draft.completeness_context,
          ),
          completeness: inspectEditorialCompleteness(draft, reviewed.claims),
          concepts,
          concept_candidate_hints: conceptHints,
          editorial_contract: {
            reader_review_policy: readerReviewPolicy,
            important_fact_reference_rule:
              "Every important claim ID must be cited by at least one relevant reader paragraph. A semantically equivalent statement using another claim ID does not satisfy that native reference requirement. A coverage judgment cannot override missing paragraph claim IDs. Fix the draft references through a source-checked writer correction; never mark a missing native reference as an approved false positive.",
            required: [
              "status",
              "draft_id",
              "event_id",
              "published_at",
              "reviewed_at",
              "region",
              "reviewer",
              "source_read",
              "final_prose_read",
              "title_checked",
              "dates_checked",
              "numbers_checked",
              "analysis_checked",
              "concept_ids",
              "reader_quality_review",
              "concept_review",
            ],
            regions: ["국내", "해외", "국제 공동"],
            reader_quality_review: { repetition_checked: "explicit boolean" },
            concept_review: {
              schema: "article-concept-review/v2",
              outcome: "reviewed_links or reviewed_none",
              required: [
                "reason",
                "reviewer",
                "reviewed_at",
                "article_source_read",
                "concept_registry_read",
                "aliases_checked",
                "assignments",
              ],
              assignment_required: [
                "concept_id",
                "role",
                "status",
                "reason",
                "reviewer",
                "reviewed_at",
                "evidence",
                "note",
                "definition_read",
                "article_source_read",
                "relationship_checked",
                "aliases_checked",
              ],
              roles: ["topic", "application", "comparison_evaluation", "context_background"],
              evidence: "exact event_id and public claim_id",
              note: "exact Knowledge/*.md path and sha256; read the whole chosen note",
              empty_result:
                "explicit reviewed_none with source/registry/alias comparison reason; never delete a prior link without a source-backed reason",
            },
          },
        }
      : {}),
  }
}

// The native packet remains the exact input to existing validators. The model
// view carries source text once, and references repeated quotations by their
// original source identity and UTF-16 offsets instead of copying them again.
export function modelReviewPacket(native, nativeSha) {
  const sources = native.parses.flatMap((parse) =>
    parse.blocks.map((block) => ({
      source_id: parse.source_id,
      source_version_id: parse.source_version_id,
      parse_id: parse.parse_id,
      block_id: block.block_id,
      text: block.text,
    })),
  )
  function reference(source, value) {
    if (!source || typeof source.text !== "string" || typeof value !== "string" || !value.length)
      return null
    const start = source.text.indexOf(value),
      end = start + value.length
    if (start < 0) return null
    // JavaScript offsets count UTF-16 code units. Reject a partial surrogate
    // even if a malformed quote happens to match inside a source character.
    if (
      (start > 0 &&
        /[\uDC00-\uDFFF]/.test(source.text[start]) &&
        /[\uD800-\uDBFF]/.test(source.text[start - 1])) ||
      (end < source.text.length &&
        /[\uD800-\uDBFF]/.test(source.text[end - 1]) &&
        /[\uDC00-\uDFFF]/.test(source.text[end]))
    )
      return null
    return {
      $source_text: {
        source_id: source.source_id,
        source_version_id: source.source_version_id,
        parse_id: source.parse_id,
        block_id: source.block_id,
        start_utf16: start,
        end_utf16: end,
        sha256: sha256(value),
      },
    }
  }
  function boundSource(evidence) {
    if (!evidence || typeof evidence !== "object") return null
    return sources.find(
      (source) =>
        source.source_id === evidence.source_id &&
        source.source_version_id === evidence.source_version_id &&
        source.parse_id === evidence.parse_id &&
        source.block_id === evidence.block_id,
    )
  }
  const claims = native.claims.map((claim) => {
    if (!Array.isArray(claim.evidence)) return claim
    const evidence = claim.evidence.map((row) =>
      !row || typeof row !== "object"
        ? row
        : {
            ...row,
            // An invalid quotation stays literal so the reviewer can reject it.
            quote: reference(boundSource(row), row.quote) || row.quote,
          },
    )
    const statement = claim.evidence
      .map((row) => reference(boundSource(row), claim.statement))
      .find(Boolean)
    return { ...claim, statement: statement || claim.statement, evidence }
  })
  const draft = native.draft
    ? Object.fromEntries(Object.entries(native.draft).filter(([key]) => key !== "model_artifacts"))
    : null
  const projected = {
    ...native,
    native_input_sha256: nativeSha,
    source_reference_contract: {
      schema: "research-review-source-references/v1",
      text: "A $source_text value means the exact substring of parses with the matching source_id, source_version_id, parse_id and block_id. Slice its block text using the inclusive start_utf16 and exclusive end_utf16 JavaScript UTF-16 offsets and verify the substring sha256. A $source_segments value is the ordered concatenation of its strings and $source_text values. Resolve these values as literal original text before reviewing; they are not independent evidence. Output schemas still require literal text, including evidence quotes. The complete native input and previous model artifacts remain stored and SHA-bound but are not required model reading.",
    },
    claims,
    ...(draft ? { draft } : {}),
  }
  // Other native fields may contain a whole source block (for example a
  // verbatim quoted passage in a draft). Encode that occurrence losslessly.
  // Only parsed block bodies remain literal, so they are readable once.
  const wholeBlocks = sources.filter(
    (source) => typeof source.text === "string" && source.text.length > 0,
  )
  function project(value, field = "", evidenceSources = []) {
    if (typeof value === "string") {
      // Quotations may only be referenced through their own evidence object.
      // Statements may reference whole blocks from their bound evidence only.
      if (["quote", "primary_quote"].includes(field)) return value
      const candidates = field === "statement" ? evidenceSources : wholeBlocks
      const segments = []
      let cursor = 0
      while (cursor < value.length) {
        let match = null
        for (const source of candidates) {
          if (typeof source.text !== "string" || !source.text.length) continue
          if (
            source.text.length < 32 &&
            field !== "statement" &&
            !(field === "text" && source.text === value)
          )
            continue
          if (source.text.length > value.length - cursor) continue
          const at = value.indexOf(source.text, cursor)
          if (
            at !== -1 &&
            (!match ||
              at < match.at ||
              (at === match.at && source.text.length > match.source.text.length))
          )
            match = { source, at }
        }
        if (!match) break
        if (match.at > cursor) segments.push(value.slice(cursor, match.at))
        segments.push(reference(match.source, match.source.text))
        cursor = match.at + match.source.text.length
      }
      if (!segments.length) return value
      if (cursor < value.length) segments.push(value.slice(cursor))
      return segments.length === 1 ? segments[0] : { $source_segments: segments }
    }
    if (Array.isArray(value)) return value.map((item) => project(item, field, evidenceSources))
    if (value && typeof value === "object") {
      if (Object.hasOwn(value, "$source_text")) return value
      const boundEvidence = Array.isArray(value.evidence)
        ? value.evidence.map(boundSource).filter(Boolean)
        : evidenceSources
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          key === "quote"
            ? reference(boundSource(value), item) || item
            : project(item, key, boundEvidence),
        ]),
      )
    }
    return value
  }
  function mapParse(parse, transform) {
    return Object.fromEntries(
      Object.entries(parse).map(([key, value]) => [
        key,
        key === "blocks"
          ? value.map((block) =>
              Object.fromEntries(
                Object.entries(block).map(([field, item]) => [
                  field,
                  field === "text" ? item : transform(item),
                ]),
              ),
            )
          : transform(value),
      ]),
    )
  }
  const model = Object.fromEntries(
    Object.entries(projected).map(([key, value]) => [
      key,
      key === "parses"
        ? value.map((parse) => mapParse(parse, project))
        : ["native_input_sha256", "source_reference_contract"].includes(key)
          ? value
          : project(value),
    ]),
  )
  function restore(value) {
    if (Array.isArray(value)) return value.map(restore)
    if (!value || typeof value !== "object") return value
    if (Object.hasOwn(value, "$source_text")) {
      const bound = value.$source_text
      const matches = sources.filter((source) =>
        ["source_id", "source_version_id", "parse_id", "block_id"].every(
          (key) => source[key] === bound?.[key],
        ),
      )
      if (
        Object.keys(value).length !== 1 ||
        matches.length !== 1 ||
        !Number.isSafeInteger(bound.start_utf16) ||
        !Number.isSafeInteger(bound.end_utf16) ||
        bound.start_utf16 < 0 ||
        bound.end_utf16 <= bound.start_utf16 ||
        bound.end_utf16 > matches[0].text.length
      )
        throw Error("Invalid combined source reference")
      const text = matches[0].text.slice(bound.start_utf16, bound.end_utf16)
      if (sha256(text) !== bound.sha256) throw Error("Combined source reference hash changed")
      return text
    }
    if (Object.hasOwn(value, "$source_segments")) {
      if (Object.keys(value).length !== 1 || !Array.isArray(value.$source_segments))
        throw Error("Invalid combined source segments")
      const segments = value.$source_segments.map(restore)
      if (segments.some((item) => typeof item !== "string"))
        throw Error("Combined source segments must resolve to text")
      return segments.join("")
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, restore(item)]))
  }
  const restored = Object.fromEntries(
    Object.entries(model)
      .filter(([key]) => !["native_input_sha256", "source_reference_contract"].includes(key))
      .map(([key, value]) => [
        key,
        key === "parses" ? value.map((parse) => mapParse(parse, restore)) : restore(value),
      ]),
  )
  const expected = { ...native, ...(draft ? { draft } : {}) }
  if (!same(restored, expected)) throw Error("Combined model packet is not lossless")
  return model
}

export function prepareCombinedReview(ctx, { run_id, kind, curation }) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(run_id || "") || !["evidence", "editorial"].includes(kind))
    throw Error("Bound combined review stage required")
  const value = packet(ctx, run_id, kind, curation),
    nativeSha = sha256(JSON.stringify(value, null, 2) + "\n"),
    modelPacket = modelReviewPacket(value, nativeSha),
    encoded = JSON.stringify(modelPacket, null, 2) + "\n"
  const input_sha256 = sha256(encoded)
  const base = `runs/${run_id}/review-bundles/${kind}/${input_sha256}/`
  const nativePacket = save(ctx.root, base + "native-packet.json", value)
  if (nativePacket.sha256 !== nativeSha) throw Error("Combined native input changed")
  const packetRef = save(ctx.root, base + "packet.json", modelPacket)
  const pages = reviewPacketPages(encoded).map((page, index) => {
    const file = base + `pages/${String(index).padStart(4, "0")}.txt`
    if (!fs.existsSync(safePath(ctx.root, file))) atomicCreate(ctx.root, file, page.text)
    if (sha256(fs.readFileSync(safePath(ctx.root, file))) !== sha256(page.text))
      throw Error("Combined source page changed")
    return { ...ref(ctx.root, file), start: page.start, end: page.end }
  })
  const manifest = save(ctx.root, base + "manifest.json", {
    schema: "research-review-source-pages/v1",
    input_sha256,
    native_input_sha256: nativeSha,
    packet: packetRef,
    utf16_length: encoded.length,
    pages,
  })
  return {
    run_id,
    kind,
    input_sha256,
    base,
    packet: value,
    native_packet: nativePacket,
    curation,
    manifest,
    manifest_file: safePath(ctx.root, manifest.path),
  }
}

export function assertCombinedReviewSources(ctx, prepared) {
  if (ref(ctx.root, prepared.manifest.path).sha256 !== prepared.manifest.sha256)
    throw Error("Combined source manifest changed")
  const m = readJSON(ctx.root, prepared.manifest.path)
  if (
    !prepared.native_packet ||
    ref(ctx.root, prepared.native_packet.path).sha256 !== prepared.native_packet.sha256 ||
    prepared.native_packet.sha256 !== m.native_input_sha256 ||
    !same(readJSON(ctx.root, prepared.native_packet.path), prepared.packet)
  )
    throw Error("Combined native input changed")
  let joined = "",
    offset = 0
  for (const page of m.pages) {
    const bytes = fs.readFileSync(safePath(ctx.root, page.path))
    if (sha256(bytes) !== page.sha256 || page.start !== offset)
      throw Error("Combined source page hash or sequence changed")
    joined += bytes.toString("utf8")
    offset = page.end
    if (joined.length !== offset) throw Error("Lossless combined source offsets required")
  }
  if (
    offset !== m.utf16_length ||
    sha256(joined) !== prepared.input_sha256 ||
    sha256(fs.readFileSync(safePath(ctx.root, m.packet.path))) !== m.packet.sha256
  )
    throw Error("Complete original combined source packet required")
  for (const concept of prepared.packet.concepts || [])
    if (sha256(fs.readFileSync(concept.source_file)) !== concept.source_sha256)
      throw Error("Concept input changed during combined review")
  if (
    prepared.kind === "editorial" &&
    !same(
      conceptRegistry(ctx.vault)
        .map((concept) => concept.path)
        .sort(),
      prepared.packet.concepts.map((concept) => concept.path).sort(),
    )
  )
    throw Error("Concept registry changed during combined review")
  const current = loadStoredSourceRun(ctx.root, prepared.run_id)
  const currentClaims = readJSON(
    ctx.root,
    `runs/${prepared.run_id}/${prepared.kind === "evidence" ? "claims" : "reviewed-claims"}.json`,
  )
  const currentDraft =
    prepared.kind === "editorial" ? readJSON(ctx.root, `runs/${prepared.run_id}/draft.json`) : null
  const selectionRef = readJSON(ctx.root, `runs/${prepared.run_id}/event-selection.json`)
  if (!same(selectionRef, prepared.packet.selected_event_reference))
    throw Error("Selected event selection reference changed before result application")
  const selectedEvent = loadPinnedSelection(ctx.root, selectionRef)
  if (
    prepared.packet.empty_extraction &&
    !same(
      emptyExtractionBinding(
        ctx,
        prepared.run_id,
        currentClaims,
        selectionRef,
        selectedEvent,
        current.documents,
        current.parses,
      ),
      prepared.packet.empty_extraction,
    )
  )
    throw Error("Empty selected-event extraction binding changed before result application")
  if (
    !same(current.documents, prepared.packet.documents) ||
    !same(current.parses, prepared.packet.parses) ||
    !same(currentClaims?.claims, prepared.packet.claims) ||
    (prepared.kind === "editorial" && !same(currentDraft, prepared.packet.draft)) ||
    !same(selectedEvent, prepared.packet.selected_event) ||
    sha256(fs.readFileSync(ctx.policy)) !== prepared.packet.model_policy_sha256
  )
    throw Error(
      "Original source, article input or review policy changed before combined result application",
    )
  if (prepared.curation) {
    const candidate = loadCurationSelection(ctx, prepared.curation).selected.find(
      (item) =>
        item.execution.plan.path === selectedEvent?.plan.path &&
        item.execution.group_id === selectedEvent?.group_id,
    )
    if (candidate?.candidate_id !== prepared.packet.candidate_id)
      throw Error("Curation selection changed before combined result application")
  }
  for (const [name, hash] of Object.entries(prepared.packet.implementation))
    if (sha256(fs.readFileSync(new URL(name, import.meta.url))) !== hash)
      throw Error("Combined implementation changed during model execution")
}

function parts(prepared) {
  const ids =
    prepared.kind === "evidence"
      ? prepared.packet.claims.map((c) => c.claim_id)
      : prepared.packet.completeness?.important_claim_ids || []
  if (!ids.length) {
    if (prepared.kind === "evidence" && prepared.packet.empty_extraction) return [[]]
    throw Error("Nonempty explicit combined review scope required")
  }
  return Array.from({ length: Math.ceil(ids.length / 12) }, (_, i) =>
    ids.slice(i * 12, i * 12 + 12),
  )
}

// A prior per-fact judgment may be reused only within the same article and
// exact source, fact, policy, implementation, and completeness contract. The
// whole-draft editorial judgment is always requested again after a revision.
function coverageReuseBinding(packet) {
  const {
    draft_id,
    draft,
    previous_draft_id,
    correction_review,
    correction_input_sha256,
    ...stableDraft
  } = packet.draft
  return {
    schema: packet.schema,
    run_id: packet.run_id,
    kind: packet.kind,
    model_policy_sha256: packet.model_policy_sha256,
    implementation: packet.implementation,
    documents: packet.documents,
    parses: packet.parses,
    selected_event_reference: packet.selected_event_reference,
    selected_event: packet.selected_event,
    candidate_id: packet.candidate_id,
    expected_event_id: packet.expected_event_id,
    curation: packet.curation,
    claims: packet.claims,
    concepts: packet.concepts,
    editorial_contract: packet.editorial_contract,
    draft: stableDraft,
    completeness_context_sha256: packet.completeness?.context_sha256,
    important_claim_ids: packet.completeness?.important_claim_ids,
  }
}

function coverageClaimContext(draft, claimId) {
  // The lead and metadata can qualify any explanation. A changed section may
  // affect every claim in that section, even if a cited paragraph is unchanged.
  const { explanations, analysis, ...global } = draft
  return {
    global,
    sections: explanations.flatMap((section, index) =>
      section.paragraphs.some((paragraph) => paragraph.claim_ids.includes(claimId))
        ? [{ index, section }]
        : [],
    ),
    analysis: analysis?.claim_ids?.includes(claimId) ? analysis : null,
    locations: draftCoverageLocations(draft).filter((item) => item.claim_ids.includes(claimId)),
  }
}

function checkedReviewReference(root, reference, message) {
  if (
    !reference?.path ||
    !reference.sha256 ||
    ref(root, reference.path).sha256 !== reference.sha256
  )
    throw Error(message)
  return readJSON(root, reference.path)
}

function readBoundPriorReview(ctx, runId, inputSHA) {
  if (!/^[a-f0-9]{64}$/.test(inputSHA || "")) throw Error("Invalid prior coverage input SHA")
  const base = `runs/${runId}/review-bundles/editorial/${inputSHA}/`
  const manifestReference = ref(ctx.root, base + "manifest.json")
  const manifest = readJSON(ctx.root, manifestReference.path)
  const nativeReference = ref(ctx.root, base + "native-packet.json")
  const packet = readJSON(ctx.root, nativeReference.path)
  if (
    manifest.schema !== "research-review-source-pages/v1" ||
    manifest.input_sha256 !== inputSHA ||
    manifest.native_input_sha256 !== nativeReference.sha256 ||
    manifest.packet?.path !== base + "packet.json" ||
    manifest.packet.sha256 !== inputSHA ||
    packet.run_id !== runId ||
    packet.kind !== "editorial"
  )
    throw Error("Prior coverage manifest binding changed")
  checkedReviewReference(ctx.root, manifest.packet, "Prior coverage packet changed")
  let joined = "",
    offset = 0
  for (const page of manifest.pages) {
    const bytes = fs.readFileSync(safePath(ctx.root, page.path))
    if (sha256(bytes) !== page.sha256 || page.start !== offset)
      throw Error("Prior coverage source page changed")
    joined += bytes.toString("utf8")
    offset = page.end
    if (joined.length !== offset) throw Error("Prior coverage source offsets changed")
  }
  if (offset !== manifest.utf16_length || sha256(joined) !== inputSHA)
    throw Error("Prior coverage source packet changed")
  return { base, manifest, manifestReference, nativeReference, packet }
}

function reusableEditorialCoverage(ctx, prepared) {
  const previousDraft = prepared.packet.draft.previous_draft_id
  if (!previousDraft || previousDraft === prepared.packet.draft.draft_id) return null
  const directory = `runs/${prepared.run_id}/review-bundles/editorial/`
  const absolute = safePath(ctx.root, directory)
  if (!fs.existsSync(absolute)) return null
  const candidates = []
  for (const name of fs.readdirSync(absolute).sort()) {
    if (!/^[a-f0-9]{64}$/.test(name) || name === prepared.input_sha256) continue
    const base = directory + name + "/"
    const packet = readJSON(ctx.root, base + "native-packet.json")
    const application = readJSON(ctx.root, base + "application.json")
    // A dispute has a separate resolved judgment; do not revive its original.
    if (!packet || !application || readJSON(ctx.root, base + "editorial-dispute.json")) continue
    if (
      packet.draft?.draft_id !== previousDraft ||
      !same(coverageReuseBinding(packet), coverageReuseBinding(prepared.packet))
    )
      continue
    candidates.push({ name, base, application })
  }
  // Ambiguous prior applications are not evidence of which review was used.
  if (candidates.length !== 1) return null
  const candidate = candidates[0],
    prior = readBoundPriorReview(ctx, prepared.run_id, candidate.name)
  const applicationReference = ref(ctx.root, candidate.base + "application.json")
  const app = candidate.application
  if (
    app.schema !== "research-review-bundle-application/v1" ||
    !same(app.manifest, prior.manifestReference)
  )
    throw Error("Prior coverage application binding changed")
  checkedReviewReference(ctx.root, app.response, "Prior combined response changed")
  checkedReviewReference(ctx.root, app.editorial, "Prior editorial decision changed")
  const coverage = checkedReviewReference(ctx.root, app.coverage, "Prior coverage decision changed")
  if (
    coverage.draft_id !== previousDraft ||
    coverage.draft_sha256 !== sha256(JSON.stringify(prior.packet.draft.draft))
  )
    throw Error("Prior coverage draft binding changed")
  const origins = new Map([[candidate.name, prior]])
  const modelResults = new Map()
  const rows = []
  for (const id of prepared.packet.completeness.important_claim_ids) {
    if (
      !same(
        coverageClaimContext(prior.packet.draft.draft, id),
        coverageClaimContext(prepared.packet.draft.draft, id),
      )
    )
      continue
    const mappings = (app.coverage_decision_mapping || []).filter((row) => row.claim_id === id)
    const coverageRows = coverage.coverage.filter((row) => row.claim_id === id)
    if (
      mappings.length !== 1 ||
      coverageRows.length !== 1 ||
      mappings[0].decision !== "preserved" ||
      mappings[0].reason !== null
    )
      continue
    const mapping = mappings[0],
      resultPath = mapping.response?.path || ""
    const match = /^runs\/(bundle-[a-f0-9]{40})\/(part-(\d+))\.json$/.exec(resultPath)
    // Individually repaired coverage can be re-reviewed until its own exact
    // source-row provenance is available; never assume the repaired judgment.
    if (!match || Number(match[3]) !== mapping.part) continue
    let cached = modelResults.get(resultPath)
    if (!cached) {
      const result = checkedReviewReference(
        ctx.root,
        mapping.response,
        "Prior coverage model result changed",
      )
      const modelState = readJSON(ctx.root, `runs/${match[1]}/state.json`)
      const stage = modelState?.stages?.[match[2]]
      if (
        stage?.status !== "complete" ||
        stage.result_path !== resultPath ||
        stage.result_hash !== sha256(JSON.stringify(result))
      )
        throw Error("Prior coverage model checkpoint changed")
      const output = result.output
      let origin = origins.get(output?.input_sha256)
      if (!origin) {
        origin = readBoundPriorReview(ctx, prepared.run_id, output?.input_sha256)
        origins.set(output.input_sha256, origin)
      }
      if (
        output.schema !== "research-editorial-review-bundle/v1" ||
        output.read_manifest_sha256 !== origin.manifestReference.sha256 ||
        output.part !== Number(match[3]) ||
        output.source_read !== true ||
        output.all_relevant_facts_checked !== true
      )
        throw Error("Prior coverage model binding changed")
      const timeSource = {
        state: { directory: `runs/${match[1]}/`, state: modelState },
        stage: match[2],
      }
      let validTime = true
      try {
        assertSavedReviewTime(ctx, timeSource, output.coverage_reviewed_at, [
          prepared.packet.draft.completeness_context.review.reviewed_at,
        ])
      } catch (error) {
        if (error.code !== "CORRECTION_TIME_INVALID") throw error
        validTime = false
      }
      cached = { output, origin, timeSource, validTime, response: mapping.response }
      modelResults.set(resultPath, cached)
    }
    if (!same(cached.response, mapping.response) || cached.output.reviewer !== mapping.reviewer)
      throw Error("Prior coverage model attribution changed")
    const { output, origin, timeSource, validTime } = cached
    if (!validTime) continue
    if (
      !same(coverageReuseBinding(origin.packet), coverageReuseBinding(prepared.packet)) ||
      !same(
        coverageClaimContext(origin.packet.draft.draft, id),
        coverageClaimContext(prepared.packet.draft.draft, id),
      )
    )
      continue
    const decisions = (output.coverage_decisions || []).filter((row) => row.claim_id === id)
    const originalRows = (output.coverage || []).filter((row) => row.claim_id === id)
    if (
      decisions.length !== 1 ||
      originalRows.length !== 1 ||
      decisions[0].decision !== "preserved" ||
      decisions[0].reason !== null ||
      !same(originalRows[0], coverageRows[0])
    )
      continue
    try {
      assertEditorialCoverageRow(origin.packet.draft, originalRows[0])
      assertEditorialCoverageRow(prepared.packet.draft, originalRows[0])
    } catch {
      continue
    }
    rows.push({
      claim_id: id,
      coverage: originalRows[0],
      decision: decisions[0],
      part: mapping.part,
      reviewer: mapping.reviewer,
      reviewed_at: output.coverage_reviewed_at,
      response: mapping.response,
      origin_manifest: origin.manifestReference,
      origin_native_packet: origin.nativeReference,
      context_sha256: sha256(JSON.stringify(coverageClaimContext(prepared.packet.draft.draft, id))),
      timeSource,
    })
  }
  if (!rows.length) return null
  return {
    previous_application: applicationReference,
    previous_manifest: prior.manifestReference,
    rows,
  }
}

function outputSchema(p, ids, index) {
  const header = {
    schema: fixed(
      p.kind === "evidence"
        ? "research-evidence-review-bundle/v1"
        : "research-editorial-review-bundle/v1",
    ),
    input_sha256: fixed(p.input_sha256),
    read_manifest_sha256: fixed(p.manifest.sha256),
    part: fixed(index),
    reviewer: text,
    reviewed_at: text,
    source_read: fixed(true),
    all_relevant_facts_checked: fixed(true),
  }
  if (p.kind === "evidence") {
    const decision = {
      claim_id: { type: "string", enum: ids },
      status: { type: "string", enum: ["verified", "deferred", "rejected"] },
      reason: text,
      ...Object.fromEntries(checks.map((k) => [k, { type: "boolean" }])),
      replacement: claimReplacementSchema(),
      ocr_evidence: { type: "array" },
    }
    return object({
      ...header,
      importance_reviewed_at: text,
      fact_review: object({
        claims: list(object(decision, ["claim_id", "status", "reason", ...checks]), 12),
        additions: list(
          index === 0 ? sourceAdditionSchema(p) : { type: "object" },
          index === 0 ? 20 : 0,
        ),
      }),
      important_facts: list(
        object({
          claim_ref: {
            type: "string",
            enum: [
              ...ids,
              ...(index === 0 ? Array.from({ length: 20 }, (_, i) => "addition:" + i) : []),
            ],
          },
          important: { type: "boolean" },
          reason: text,
          required_aspects: {
            ...list({ type: "string", enum: COMPLETENESS_ASPECTS }, COMPLETENESS_ASPECTS.length),
            minItems: 1,
            uniqueItems: true,
          },
        }),
        32,
      ),
    })
  }
  return object({
    ...header,
    coverage_reviewed_at: text,
    editorial_review: index === 0 ? editorialDecisionSchema(p) : { type: "null" },
    coverage: list(
      object({
        claim_id: ids.length ? { type: "string", enum: ids } : { type: "string" },
        reason: text,
        meaning_checked: fixed(true),
        preserved_aspects: list({ type: "string", enum: COMPLETENESS_ASPECTS }),
        locations: list(
          object({ location: text, text_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" } }),
        ),
      }),
      ids.length ? 12 : 0,
    ),
    coverage_decisions: list(
      object({
        claim_id: ids.length ? { type: "string", enum: ids } : { type: "string" },
        decision: { type: "string", enum: ["preserved", "needs_revision"] },
        reason: { type: ["string", "null"], minLength: 1 },
      }),
      ids.length ? 12 : 0,
    ),
  })
}

function projectFacts(prepared, outputs) {
  const p = prepared.packet,
    decisions = outputs.flatMap((o) => o.fact_review.claims)
  const additionRefs = outputs.flatMap((o) =>
    o.fact_review.additions.map((_, i) => o.addition_refs?.[i] || "addition:" + i),
  )
  const additions = outputs.flatMap((o) => o.fact_review.additions)
  const reviewer = outputs[0].reviewer
  if (outputs.some((o) => o.reviewer !== reviewer))
    throw Error("Consistent explicit reviewer required")
  const reviewed_at = latestReviewTime(outputs.map((o) => o.reviewed_at))
  const fact = { reviewer, reviewed_at, claims: decisions, additions }
  const claims = recordFactReview(p.claims, decisions, fact, p.parses)
  if (p.selected_event) assertSelectedEventFactScope(p.selected_event, claims)
  const mappings = new Map(p.claims.map((c, i) => [c.claim_id, claims[i]]))
  additions.forEach((_, i) => mappings.set(additionRefs[i], claims[p.claims.length + i]))
  return { fact, claims, mappings }
}
function projectImportance(prepared, outputs, { claims, mappings }) {
  const p = prepared.packet,
    important = outputs.flatMap((o) => o.important_facts)
  if (new Set(important.map((o) => o.claim_ref)).size !== important.length)
    throw Error("One explicit importance decision per verified fact required")
  const complete = {
    schema: "research-editorial-completeness-review/v1",
    input_sha256: sha256(JSON.stringify(editorialCompletenessInput(claims, p.documents, p.parses))),
    reviewer: outputs[0].reviewer,
    reviewed_at: latestReviewTime(outputs.map((o) => o.importance_reviewed_at)),
    source_read: true,
    all_relevant_facts_checked: true,
    fact_decisions: important.map(({ claim_ref, ...d }) => {
      const c = mappings.get(claim_ref)
      if (!c || c.review.status !== "verified")
        throw Error("Importance decision refers to an unverified fact")
      return { claim_id: c.claim_id, ...d }
    }),
  }
  // The old validator checks all facts, numbers, conditions and timestamps.
  recordEditorialCompleteness(complete, claims, p.documents, p.parses)
  return complete
}
export function projectCombinedEvidence(prepared, outputs) {
  const projected = projectFacts(prepared, outputs)
  return {
    ...projected,
    completeness: projectImportance(prepared, outputs, projected),
    mapping: [...projected.mappings].map(([claim_ref, c]) => ({ claim_ref, claim_id: c.claim_id })),
  }
}

// A bounded follow-up has its own exact request and durable result. Valid
// portions of the original response remain untouched and are never re-approved
// by program-generated defaults.
async function repairComponent(
  ctx,
  prepared,
  state,
  model,
  settings,
  component,
  ids,
  schema,
  original,
  error,
  supporting = {},
  admissionSchema = schema,
) {
  const input = {
    task: "combined_review_repair",
    component,
    run_id: prepared.run_id,
    input_sha256: prepared.input_sha256,
    source_manifest: { file: prepared.manifest_file, sha256: prepared.manifest.sha256 },
    assigned_claim_ids: ids,
    original_response: original,
    validation_error: error.message,
    ...supporting,
  }
  const request = {
    model: settings.model,
    messages: [
      {
        role: "system",
        content:
          "Independently read the bound full source manifest and relevant exact facts/prose. Repair only the named missing or invalid decisions. Valid decisions are retained separately. Supply explicit source-backed judgments; do not assume approval or invent evidence. Return the exact repair schema." +
          sourceReferencePolicy,
      },
      { role: "user", content: JSON.stringify(input) },
    ],
    schema,
  }
  if (JSON.stringify(request).length > 20000) {
    const saved = save(
      ctx.root,
      prepared.base + "repair-input-" + sha256(JSON.stringify(input)) + ".json",
      input,
    )
    request.messages[1].content = JSON.stringify({
      task: input.task,
      component,
      run_id: prepared.run_id,
      input_sha256: prepared.input_sha256,
      source_manifest: input.source_manifest,
      assigned_claim_ids: ids,
      validation_error: error.message,
      repair_input_file: safePath(ctx.root, saved.path),
      repair_input_sha256: saved.sha256,
      original_response_file: safePath(ctx.root, saved.path),
      original_response_sha256: saved.sha256,
    })
  }
  const stage = repairStageName(component, ids)
  const result = await state.stage(stage, request, () => model.structured(request))
  assertSchema(result.output, admissionSchema)
  save(ctx.root, prepared.base + "repair-results/" + stage + ".json", {
    component,
    assigned_claim_ids: ids,
    input_sha256: prepared.input_sha256,
    request_sha256: sha256(JSON.stringify(request)),
    result: ref(ctx.root, state.directory + stage + ".json"),
    raw_response_preserved: true,
  })
  return result.output
}

// A model may identify the same bound reviewer as either the model name or
// the model name plus its reasoning setting across independently submitted
// parts. Preserve those raw responses and ask for an explicit attribution-only
// reconciliation; never re-run or synthesize any fact or importance decision.
async function reconcileEvidenceReviewers(
  ctx,
  prepared,
  state,
  model,
  settings,
  outputs,
  response,
) {
  const reviewer = outputs[0].reviewer
  const mismatched = outputs.flatMap((output, part) =>
    output.reviewer === reviewer ? [] : [{ part, original_reviewer: output.reviewer }],
  )
  if (!mismatched.length) return null
  const allowed = new Set([settings.model, `${settings.model} (${String(settings.think)})`])
  const normalized = (value) =>
    value
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[-_\s]+/g, " ")
      .trim()
  const acceptedLabel = (value) =>
    allowed.has(value) ||
    (settings.provider === "codex" &&
      typeof value === "string" &&
      normalized(value) === `codex ${normalized(settings.model)} (independent evidence reviewer)`)
  if (outputs.some((output) => !acceptedLabel(output.reviewer)))
    throw Error("Reviewer identity could not be reconciled to the bound model")
  const ids = mismatched.map((row) => row.part)
  const schema = object({
    schema: fixed("research-reviewer-reconciliation/v1"),
    input_sha256: fixed(prepared.input_sha256),
    read_manifest_sha256: fixed(prepared.manifest.sha256),
    reviewer: fixed(reviewer),
    reconciled_parts: {
      ...list(
        object({ part: { type: "integer", enum: ids }, original_reviewer: text }),
        ids.length,
      ),
      minItems: ids.length,
    },
    same_bound_model: { type: "boolean" },
    reason: { ...text, minLength: 10 },
  })
  const partRefs = outputs.map((_, part) =>
    ref(ctx.root, state.directory + "part-" + part + ".json"),
  )
  const input = {
    task: "combined_review_reviewer_reconciliation",
    run_id: prepared.run_id,
    input_sha256: prepared.input_sha256,
    source_manifest: { file: prepared.manifest_file, sha256: prepared.manifest.sha256 },
    model_binding: { model: settings.model, think: settings.think },
    reference_reviewer: reviewer,
    mismatched_parts: ids,
    original_response: { file: safePath(ctx.root, response.path), sha256: response.sha256 },
    part_responses: outputs.map((output, part) => ({
      part,
      reviewer: output.reviewer,
      result: { file: safePath(ctx.root, partRefs[part].path), sha256: partRefs[part].sha256 },
    })),
    valid_decisions_retained: true,
  }
  const request = {
    model: settings.model,
    messages: [
      {
        role: "system",
        content:
          "Check only the explicitly declared reviewer labels and the exact bound part responses. Decide whether the labels identify the same configured model and reasoning setting. If identity cannot be established, return same_bound_model false. Do not reconsider, replace or approve any fact, importance or editorial decision. Preserve each original label and part in the reconciliation.",
      },
      { role: "user", content: JSON.stringify(input) },
    ],
    schema,
  }
  if (JSON.stringify(request).length > 20000) {
    const reference = save(
      ctx.root,
      prepared.base + "reviewer-reconciliation-input-" + sha256(JSON.stringify(input)) + ".json",
      input,
    )
    request.messages[1].content = JSON.stringify({
      task: input.task,
      run_id: input.run_id,
      input_sha256: input.input_sha256,
      source_manifest: input.source_manifest,
      model_binding: input.model_binding,
      reference_reviewer: input.reference_reviewer,
      mismatched_parts: input.mismatched_parts,
      original_response: input.original_response,
      reconciliation_input_file: safePath(ctx.root, reference.path),
      reconciliation_input_sha256: reference.sha256,
      valid_decisions_retained: true,
    })
  }
  if (JSON.stringify(request).length > 20000)
    throw Error("Reviewer reconciliation exceeds the structured request limit")
  const stage = "reviewer-reconciliation-" + sha256(JSON.stringify(mismatched)).slice(0, 16)
  const result = await state.stage(stage, request, () => model.structured(request))
  assertSchema(result.output, schema)
  if (
    ref(ctx.root, response.path).sha256 !== response.sha256 ||
    partRefs.some((reference) => ref(ctx.root, reference.path).sha256 !== reference.sha256)
  )
    throw Error("Reviewer reconciliation source responses changed")
  assertCombinedReviewSources(ctx, prepared)
  const rows = result.output.reconciled_parts
  const receipt = save(ctx.root, prepared.base + "repair-results/" + stage + ".json", {
    component: "reviewer-reconciliation",
    input_sha256: prepared.input_sha256,
    original_reviewers: outputs.map((output, part) => ({ part, reviewer: output.reviewer })),
    reconciled_parts: rows,
    reviewer,
    same_bound_model: result.output.same_bound_model,
    result: ref(ctx.root, state.directory + stage + ".json"),
    raw_response_preserved: true,
    factual_decisions_changed: false,
  })
  if (
    !result.output.same_bound_model ||
    rows.length !== mismatched.length ||
    new Set(rows.map((row) => row.part)).size !== mismatched.length ||
    mismatched.some(
      (expected) =>
        !rows.some(
          (row) =>
            row.part === expected.part && row.original_reviewer === expected.original_reviewer,
        ),
    )
  )
    throw Error("Reviewer identity could not be reconciled to the bound model")
  for (const { part } of mismatched) outputs[part] = { ...outputs[part], reviewer }
  return receipt
}

function importanceProblems(prepared, projected, outputs) {
  const rows = outputs.flatMap((o) => o.important_facts || []),
    bad = [],
    valid = []
  const rowSchema = completenessReviewSchema.properties.fact_decisions.items
  for (const [claim_ref, c] of projected.mappings) {
    if (c.review.status !== "verified") continue
    const found = rows.filter((r) => r.claim_ref === claim_ref)
    try {
      if (found.length !== 1) throw Error("One explicit importance decision required")
      const { claim_ref: _, ...d } = found[0]
      assertSchema({ claim_id: c.claim_id, ...d }, rowSchema)
      if (d.important && factAspects(c).some((a) => !d.required_aspects.includes(a)))
        throw Error("Missing required preservation aspects")
      valid.push(found[0])
    } catch {
      bad.push(claim_ref)
    }
  }
  const unknown = [
    ...new Set(
      rows
        .filter((row) => projected.mappings.get(row.claim_ref)?.review.status !== "verified")
        .map((row) => row.claim_ref),
    ),
  ]
  return { bad, valid, unknown }
}

async function preflightDraft(ctx, prepared, curation, options) {
  const file = `runs/${prepared.run_id}/draft-preflight/latest.json`
  for (;;) {
    const findings = [
      ...prepared.packet.reader_quality.findings.filter((row) => row.severity === "block"),
      ...prepared.packet.native_draft_problems
        .filter(
          (code) =>
            !prepared.packet.reader_quality.findings.some(
              (row) => row.code === code && row.severity === "block",
            ),
        )
        .map((code) => ({ code, severity: "block" })),
    ]
    const prior = readJSON(ctx.root, file)
    if (!findings.length) {
      if (prior?.status !== "clear" || prior.draft_id !== prepared.packet.draft.draft_id)
        atomicWrite(ctx.root, file, {
          schema: "research-native-draft-preflight/v1",
          status: "clear",
          draft_id: prepared.packet.draft.draft_id,
          input_sha256: prepared.input_sha256,
          structural_blocks: 0,
        })
      return prepared
    }
    const findings_sha256 = sha256(JSON.stringify(findings))
    const sameAttempt =
      prior?.status === "requested" &&
      prior.draft_id === prepared.packet.draft.draft_id &&
      prior.findings_sha256 === findings_sha256
    const attempt = sameAttempt
      ? prior.attempt
      : prior?.status === "requested"
        ? prior.attempt + 1
        : 1
    if (attempt > 2) {
      const error = Error(
        "Native draft preflight remains blocked after two writer corrections: " +
          JSON.stringify(findings),
      )
      error.code = "DRAFT_PREFLIGHT_EXHAUSTED"
      throw error
    }
    if (!sameAttempt)
      atomicWrite(ctx.root, file, {
        schema: "research-native-draft-preflight/v1",
        status: "requested",
        draft_id: prepared.packet.draft.draft_id,
        input_sha256: prepared.input_sha256,
        findings_sha256,
        attempt,
        findings,
      })
    const before = ref(ctx.root, `runs/${prepared.run_id}/draft.json`)
    let previousFailure = null
    if (sameAttempt && prior.previous_failure) {
      previousFailure = prior.previous_failure
      if (ref(ctx.root, previousFailure.path).sha256 !== previousFailure.sha256)
        throw Error("Native draft preflight failure evidence changed")
      const observed = readJSON(ctx.root, previousFailure.path)
      if (
        observed?.schema !== "research-native-draft-preflight-unchanged/v1" ||
        observed.outcome !== "unchanged_draft" ||
        observed.input_sha256 !== prepared.input_sha256 ||
        observed.draft_id !== prepared.packet.draft.draft_id ||
        observed.findings_sha256 !== findings_sha256 ||
        observed.attempt + 1 !== attempt ||
        !same(observed.draft, before) ||
        ref(ctx.root, observed.correction_decision.path).sha256 !==
          observed.correction_decision.sha256
      )
        throw Error("Exact unchanged preflight failure evidence required")
    }
    const structuralValidation = {
      schema: "research-native-draft-preflight-findings/v1",
      draft_id: prepared.packet.draft.draft_id,
      findings,
      findings_sha256,
      attempt,
      ...(previousFailure ? { previous_failure: previousFailure } : {}),
      native_metadata_contract: {
        themes: THEMES,
        entities:
          "Each entity must retain a verified claim's subject or an exact name occurring in its evidence quote. Read that evidence and choose the faithful original name; a translation/abbreviation absent there cannot be cleared by an editorial approval flag. Preserve correct reader prose and existing fact references when only metadata needs correction.",
      },
      contract:
        "These are native structural blocks, not semantic approval decisions. Read the original source before attaching a missing important fact ID. If prose already conveys it, preserve the prose and cite its verified ID. Preserve unaffected paragraphs and their existing references. Korean reader prose is required; retain proper names, exact quantities and conditions. Native reader text forbids angle brackets and embedded newlines: express a supported inequality faithfully in Korean words, for example p값 0.001 미만, retaining its value and comparison direction. Do not invent importance, evidence or approval." +
        (previousFailure
          ? " The previous source-bound correction left the draft unchanged. Read the previous failure and its correction decision, then actually correct the stated structural findings; an unchanged draft does not satisfy them."
          : ""),
    }
    await runCombinedDraftCorrection(
      ctx,
      {
        run_id: prepared.run_id,
        structural_validation: structuralValidation,
      },
      { ...options, preparedInput: prepared },
    )
    if (ref(ctx.root, `runs/${prepared.run_id}/draft.json`).sha256 === before.sha256) {
      const correctionRun =
        "bundle-fix-" +
        sha256(JSON.stringify([prepared.input_sha256, structuralValidation, undefined])).slice(
          0,
          40,
        )
      const marker = save(
        ctx.root,
        `runs/${prepared.run_id}/draft-preflight/unchanged-${sha256(
          JSON.stringify([prepared.input_sha256, findings_sha256, attempt]),
        )}.json`,
        {
          schema: "research-native-draft-preflight-unchanged/v1",
          outcome: "unchanged_draft",
          input_sha256: prepared.input_sha256,
          draft_id: prepared.packet.draft.draft_id,
          draft: before,
          findings_sha256,
          attempt,
          correction_decision: ref(ctx.root, `runs/${correctionRun}/correction-decision.json`),
        },
      )
      if (attempt >= 2) {
        const error = Error(
          "Native draft preflight remains blocked after two unchanged corrections",
        )
        error.code = "DRAFT_PREFLIGHT_EXHAUSTED"
        throw error
      }
      atomicWrite(ctx.root, file, {
        schema: "research-native-draft-preflight/v1",
        status: "requested",
        draft_id: prepared.packet.draft.draft_id,
        input_sha256: prepared.input_sha256,
        findings_sha256,
        attempt: attempt + 1,
        findings,
        previous_failure: marker,
      })
      continue
    }
    prepared = prepareCombinedReview(ctx, { run_id: prepared.run_id, kind: "editorial", curation })
  }
}

export async function runCombinedReview(
  ctx,
  { run_id, kind, curation },
  { baseProvider, executionWindow } = {},
) {
  let prepared = prepareCombinedReview(ctx, { run_id, kind, curation })
  if (kind === "editorial")
    prepared = await preflightDraft(ctx, prepared, curation, { baseProvider, executionWindow })
  const policy = JSON.parse(fs.readFileSync(ctx.policy)),
    settings = resolveRolePolicy(policy, "evidence_compare")
  const modelRun =
    "bundle-" + sha256(JSON.stringify([run_id, kind, prepared.input_sha256])).slice(0, 40)
  const base =
    baseProvider ||
    createModelProvider(policy, "evidence_compare", { root: ctx.root, run: modelRun })
  const model = await prepareRoleProvider(base, policy, "evidence_compare", {
    root: ctx.root,
    run: modelRun,
    executionWindow,
  })
  const state = new RunState(ctx.root, modelRun, {
    kind,
    input_sha256: prepared.input_sha256,
    manifest: prepared.manifest,
  })
  const dispute = kind === "editorial" ? readEditorialDispute(ctx, prepared) : null
  const assertDisputeIntegrity = () => {
    if (!dispute) return
    const current = readEditorialDispute(ctx, prepared)
    if (
      !current ||
      !same(current.reference, dispute.reference) ||
      !same(current.record, dispute.record) ||
      !same(current.review, dispute.review) ||
      !same(current.decision, dispute.decision)
    )
      throw Error("Editorial dispute evidence changed")
  }
  const reviewBase = dispute
    ? prepared.base + "resolutions/" + dispute.reference.sha256 + "/"
    : prepared.base
  const reviewPrepared = { ...prepared, base: reviewBase }
  const reviewState = dispute
    ? new RunState(
        ctx.root,
        "bundle-reassess-" + sha256(JSON.stringify([modelRun, dispute.reference])).slice(0, 40),
        { input_sha256: prepared.input_sha256, dispute: dispute.reference },
      )
    : state
  const priorReusePlan =
    kind === "editorial" ? readJSON(ctx.root, reviewBase + "coverage-reuse.json") : null
  const reuse =
    kind === "editorial" && !dispute && priorReusePlan?.judgments?.length !== 0
      ? reusableEditorialCoverage(ctx, prepared)
      : null
  const reuseValue = (value) => ({
    schema: "research-editorial-coverage-reuse/v1",
    input_sha256: prepared.input_sha256,
    draft_id: prepared.packet.draft.draft_id,
    previous_application: value?.previous_application || null,
    previous_manifest: value?.previous_manifest || null,
    judgments: (value?.rows || []).map(({ timeSource, ...row }) => row),
    editorial_approval_reused: false,
  })
  // Freeze even an empty selection. A later process must not switch request
  // scopes after a prior review appears while the current job was suspended.
  const reusePlan =
    kind === "editorial"
      ? save(ctx.root, reviewBase + "coverage-reuse.json", reuseValue(reuse))
      : null
  const reuseReceipt = reuse ? reusePlan : null
  const assertReuseIntegrity = () => {
    if (!reuse) return
    const current = reusableEditorialCoverage(ctx, prepared)
    if (
      !current ||
      !same(reuseValue(current), reuseValue(reuse)) ||
      !same(
        checkedReviewReference(ctx.root, reuseReceipt, "Coverage reuse receipt changed"),
        reuseValue(reuse),
      )
    )
      throw Error("Reused coverage evidence changed before application")
  }
  const reusedIds = new Set(reuse?.rows.map((row) => row.claim_id) || [])
  const allScopes = parts(prepared)
  const pendingIds =
    kind === "editorial" && reuse
      ? prepared.packet.completeness.important_claim_ids.filter((id) => !reusedIds.has(id))
      : null
  const requestScopes = pendingIds
    ? pendingIds.length
      ? Array.from({ length: Math.ceil(pendingIds.length / 12) }, (_, i) =>
          pendingIds.slice(i * 12, i * 12 + 12),
        )
      : [[]]
    : allScopes
  const outputs = [],
    timeSources = [],
    coverageDecisionSources = [],
    scopes = requestScopes
  for (let i = 0; i < scopes.length; i++) {
    const schema = outputSchema(prepared, scopes[i], i)
    // Transport advertises the complete native addition contract. Validate
    // each addition independently below so a local provider's malformed
    // addition cannot force healthy original fact decisions to run again.
    const admissionSchema = structuredClone(schema)
    if (kind === "evidence") {
      admissionSchema.properties.fact_review.properties.additions.items = { type: "object" }
      // Preserve well-formed rows while isolating invalid claim decisions for
      // the same exact native validator and a bounded source-backed repair.
      admissionSchema.properties.fact_review.properties.claims.items = { type: "object" }
      admissionSchema.properties.important_facts.items = { type: "object" }
    } else {
      // Preserve good individual decisions if a sibling is missing or invalid.
      // Their exact native schema and assigned claim IDs are checked below.
      admissionSchema.properties.coverage_decisions.items = { type: "object" }
      admissionSchema.required = admissionSchema.required.filter(
        (field) => field !== "coverage_decisions",
      )
    }
    const request = {
      model: settings.model,
      messages: [
        {
          role: "system",
          content:
            "You are the independent Korean source and editorial reviewer. Read the complete immutable source-page manifest and every page using tools before deciding. Never approve from metadata alone. Verify all numbers, units, dates, comparison/availability conditions, plans versus completed actions, attribution, and important facts. Do not invent approvals. Reuse only exact unchanged source observations. Each request belongs only to its bound run, source, title and draft; never carry a finding or reason from another article. Return the exact schema. Evidence parts review every assigned original claim, may correct/reject it, and explicitly rate importance for each resulting VERIFIED claim. Only facts supported within selected_event.sources[].block_ids may be verified or added; defer or reject unrelated facts. Read the whole source to preserve context and conditions without widening that event scope. Only part zero may add up to twenty directly sourced missing facts, referenced as addition:0 etc. Additions use an existing native candidate_key and full source/version/parse/block/quote evidence, never block_key. Their decision contains reason and explicit review checks, never status. The native validator computes claim IDs; do not copy claim_id/schema/review into an addition. Editorial part zero supplies the existing native editorial approval decision including reader quality and a source-backed specialist concept review; other parts use null. All parts explicitly review assigned important facts against exact reader paragraph locations and hashes. If prose needs revision, return needs_revision in editorial_review; do not claim approval. The writer and reviewer are separate executions. Model policy and limits remain unchanged." +
            sourceReferencePolicy +
            (kind === "editorial"
              ? " Concept candidate hints are unreviewed search priorities only. Compare the entire supplied current concept registry and aliases before deciding, including for reviewed_none; never infer or approve a relationship from a hint. Read the complete selected concept note and cite the verified public claim as required. For every assigned important claim, give one explicit coverage_decisions entry: preserved with reason null only when its required source-backed meaning and conditions are actually present, otherwise needs_revision with the exact missing or incorrect detail and reader location in reason. A citation or a true meaning_checked flag alone does not establish preservation. A needs_revision decision includes every concrete required change and affected fact or prose location; never disguise an omission as preserved. " +
                readerReviewPolicy +
                (reuse
                  ? " Unassigned claim coverage has separately bound unchanged prior evidence. Do not issue coverage judgments for unassigned claims; part zero must still independently evaluate the entire current draft and explicitly approve it or report all current revision findings."
                  : "")
              : ""),
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "combined_review",
            kind,
            run_id,
            input_sha256: prepared.input_sha256,
            source_manifest: {
              file: prepared.manifest_file,
              sha256: prepared.manifest.sha256,
              packet_file: safePath(
                ctx.root,
                readJSON(ctx.root, prepared.manifest.path).packet.path,
              ),
            },
            assigned_claim_ids: scopes[i],
            ...(kind === "evidence" && prepared.packet.empty_extraction
              ? {
                  empty_extraction: {
                    candidate_key: prepared.packet.empty_extraction.candidate_key,
                    contract:
                      "No extracted claim belongs to this selected event. Review the exact selected source and explicitly add only directly supported, in-scope facts with this candidate key. If none can be verified, return no additions; the article remains unapproved.",
                  },
                }
              : {}),
            part: i,
            parts: scopes.length,
            important_aspects: COMPLETENESS_ASPECTS,
            native_fact_validation:
              kind === "evidence"
                ? prepared.packet.claims
                    .filter((c) => scopes[i].includes(c.claim_id))
                    .map((c) => structuralFactValidation(c, prepared.packet.parses))
                : undefined,
            importance_minimums:
              kind === "evidence"
                ? prepared.packet.claims
                    .filter((c) => scopes[i].includes(c.claim_id))
                    .map((c) => ({ claim_ref: c.claim_id, minimum_when_important: factAspects(c) }))
                : undefined,
            importance_contract:
              kind === "evidence"
                ? "Every important fact includes fact. Every nonempty event_state (including reported) requires plan_execution. Quantities require numbers; effective_period or a numeric condition requires comparison_conditions. Attributed_fact/company_claim/forecast/analysis require attribution. Use the resulting corrected/additional fact fields; these are native minimum checks, not automatic importance judgments."
                : undefined,
            ...(kind === "evidence"
              ? {
                  native_fact_decision_schemas: {
                    claims: schema.properties.fact_review.properties.claims.items,
                    additions: schema.properties.fact_review.properties.additions.items,
                    importance: schema.properties.important_facts.items,
                  },
                }
              : {}),
            ...(kind === "editorial"
              ? {
                  native_coverage_binding: {
                    context_sha256: prepared.packet.completeness.context_sha256,
                    draft_id: prepared.packet.draft.draft_id,
                    draft_sha256: prepared.packet.completeness.draft_sha256,
                  },
                  native_coverage_decision_schema: schema.properties.coverage_decisions,
                }
              : {}),
          }),
        },
      ],
      // Keep complete desired decision contracts in the prompt while the
      // owned transport preserves malformed individual rows for exact repair.
      // Header, input/source binding, and other components remain validated.
      schema: admissionSchema,
    }
    if (JSON.stringify(request).length > 20000)
      throw Error("Combined request admission exceeds 20000 characters")
    const result = await state.stage("part-" + i, request, () => model.structured(request))
    let output = result.output
    const timeSource = {
      importance_reviewed_at: { state, stage: "part-" + i },
      coverage_reviewed_at: { state, stage: "part-" + i },
      editorial_review: { state, stage: "part-" + i },
    }
    try {
      assertSchema(output, admissionSchema)
      if (kind === "editorial" && i === 0)
        assertSchema(
          output.editorial_review,
          editorialDecisionSchema(prepared, output.editorial_review.status),
        )
    } catch (error) {
      // Keep the valid component of a partial response. Header identity is
      // mandatory even for a repair; a wrong input SHA never authorizes writes.
      for (const field of [
        "schema",
        "input_sha256",
        "read_manifest_sha256",
        "part",
        "reviewer",
        "reviewed_at",
        "source_read",
        "all_relevant_facts_checked",
      ])
        assertSchema(output?.[field], schema.properties[field])
      const components =
        kind === "evidence"
          ? ["fact_review", "important_facts", "importance_reviewed_at"]
          : ["editorial_review", "coverage", "coverage_reviewed_at", "coverage_decisions"]
      for (const component of components) {
        const selectedSchema =
          component === "editorial_review" && i === 0
            ? editorialDecisionSchema(prepared, output[component]?.status)
            : admissionSchema.properties[component]
        try {
          assertSchema(output[component], selectedSchema)
        } catch (componentError) {
          const fields =
            component === "editorial_review" && i === 0
              ? invalidEditorialFields(output[component], selectedSchema)
              : []
          const componentSchema = fields.length
            ? object(Object.fromEntries(fields.map((key) => [key, selectedSchema.properties[key]])))
            : selectedSchema
          const repaired = await repairComponent(
            ctx,
            prepared,
            state,
            model,
            settings,
            component + "-part-" + i,
            scopes[i],
            object({ [component]: componentSchema }),
            output[component] ?? null,
            componentError,
            fields.length
              ? {
                  invalid_editorial_fields: fields,
                  valid_fields_retained: true,
                  native_contract:
                    "Return only the named missing/invalid fields. Existing valid judgments and coverage are retained. Each check is an explicit model declaration that the check was performed, not a program-generated approval.",
                }
              : {},
          )
          output = fields.length
            ? { ...output, [component]: { ...output[component], ...repaired[component] } }
            : { ...output, ...repaired }
          if (
            component in timeSource &&
            (component !== "editorial_review" || !fields.length || fields.includes("reviewed_at"))
          )
            timeSource[component] = {
              state,
              stage: repairStageName(component + "-part-" + i, scopes[i]),
            }
        }
      }
      assertSchema(output, admissionSchema)
      if (kind === "editorial" && i === 0)
        assertSchema(
          output.editorial_review,
          editorialDecisionSchema(prepared, output.editorial_review.status),
        )
    }
    if (kind === "evidence" && !scopes[i].length && output.fact_review.claims.length) {
      const repaired = await repairComponent(
        ctx,
        prepared,
        state,
        model,
        settings,
        `empty-evidence-claims-part-${i}`,
        [],
        object({ claims: list({ type: "object" }, 0) }),
        output.fact_review.claims,
        Error("No original claims were assigned to this selected event"),
        {
          original_result: ref(ctx.root, state.directory + `part-${i}.json`),
          valid_decisions_retained: true,
          native_contract:
            "Return an empty claims array for the empty original claim scope. Keep the separately supplied source additions and importance judgments unchanged; do not create or approve any fact.",
        },
      )
      // The shared schema validator treats maxItems: 0 as unspecified.
      if (!Array.isArray(repaired.claims) || repaired.claims.length)
        throw Error("Unassigned fact decisions remain outside the empty scope")
      output = { ...output, fact_review: { ...output.fact_review, claims: repaired.claims } }
    }
    if (
      kind === "editorial" &&
      scopes[i].length === 0 &&
      (output.coverage.length || (output.coverage_decisions || []).length)
    ) {
      // The shared validator historically treats maxItems: 0 as unspecified.
      // Do not discard unassigned model judgments or let them reach approval.
      const repaired = await repairComponent(
        ctx,
        reviewPrepared,
        reviewState,
        model,
        settings,
        "empty-coverage-scope-part-" + i,
        [],
        object({
          coverage: list({ type: "object" }, 0),
          coverage_decisions: list({ type: "object" }, 0),
        }),
        { coverage: output.coverage, coverage_decisions: output.coverage_decisions || [] },
        Error("No individual coverage judgments were assigned"),
        {
          native_contract:
            "The assigned claim scope is empty. Return empty coverage and coverage_decisions arrays only. Retain the already-issued whole-draft editorial decision and do not create or alter any approval.",
        },
      )
      if (
        !Array.isArray(repaired.coverage) ||
        repaired.coverage.length ||
        !Array.isArray(repaired.coverage_decisions) ||
        repaired.coverage_decisions.length
      )
        throw Error("Unassigned coverage remains outside the empty scope")
      output = {
        ...output,
        coverage: repaired.coverage,
        coverage_decisions: repaired.coverage_decisions,
      }
    }
    if (dispute && i === 0) {
      const repaired = await repairComponent(
        ctx,
        reviewPrepared,
        reviewState,
        model,
        settings,
        "editorial-dispute-" + dispute.reference.sha256.slice(0, 16),
        [],
        object({ editorial_review: editorialDecisionSchema(prepared) }),
        dispute.review,
        Error("Independent writer disputes this exact editorial finding"),
        {
          writer_dispute: dispute.reference,
          dispute_decision: dispute.record.decision,
          native_contract:
            "Read the exact writer dispute, original review and full bound source. Reassess only the disputed editorial decision; retain valid fact and paragraph-coverage judgments. The writer dispute is not approval. If the finding belongs to another article or is unsupported, explicitly correct it and provide all native approval checks after reading this draft. If revision remains necessary, state only concrete source-backed changes for this article. Do not require cosmetic edits to invalidate a mistaken review.",
        },
      )
      output = { ...output, editorial_review: repaired.editorial_review }
      timeSource.editorial_review = {
        state: reviewState,
        stage: repairStageName("editorial-dispute-" + dispute.reference.sha256.slice(0, 16), []),
      }
      const selectedSchema = editorialDecisionSchema(prepared, output.editorial_review?.status)
      const fields = invalidEditorialFields(output.editorial_review, selectedSchema)
      if (fields.length) {
        const patch = await repairComponent(
          ctx,
          reviewPrepared,
          reviewState,
          model,
          settings,
          "editorial-dispute-fields",
          [],
          object({
            editorial_review: object(
              Object.fromEntries(fields.map((k) => [k, selectedSchema.properties[k]])),
            ),
          }),
          output.editorial_review,
          Error("Explicit reassessment is missing native editorial fields"),
          { invalid_editorial_fields: fields, valid_fields_retained: true },
        )
        output.editorial_review = { ...output.editorial_review, ...patch.editorial_review }
        if (fields.includes("reviewed_at"))
          timeSource.editorial_review = {
            state: reviewState,
            stage: repairStageName("editorial-dispute-fields", []),
          }
      }
      assertSchema(output.editorial_review, selectedSchema)
    }
    const partDecisionSources = new Map()
    if (kind === "editorial" && (i > 0 || output.editorial_review.status === "approved")) {
      const expected = scopes[i],
        rowSchema = schema.properties.coverage_decisions.items,
        original = Array.isArray(output.coverage_decisions) ? output.coverage_decisions : []
      if (
        original.some(
          (row) => typeof row?.claim_id !== "string" || !expected.includes(row.claim_id),
        )
      )
        throw Error("Coverage decision escaped its assigned claim scope or is unbound")
      const kept = new Map()
      const accept = (rows, ids, origin) => {
        if (rows.some((row) => typeof row?.claim_id !== "string" || !ids.includes(row.claim_id)))
          throw Error("Coverage decision repair escaped its assigned claim scope or is unbound")
        for (const id of ids) {
          const matches = rows.filter((row) => row?.claim_id === id)
          if (matches.length !== 1) continue
          try {
            assertSchema(matches[0], rowSchema)
            if (
              matches[0].decision === "needs_revision" &&
              (typeof matches[0].reason !== "string" || !matches[0].reason.trim())
            )
              throw Error("An explicit coverage finding is required")
            kept.set(id, matches[0])
            partDecisionSources.set(id, origin)
          } catch {
            // An invalid individual decision is repaired without discarding siblings.
          }
        }
      }
      accept(original, expected, { state, stage: "part-" + i })
      let pending = expected.filter((id) => !kept.has(id))
      for (let attempt = 0; pending.length && attempt < 2; attempt++) {
        const assigned = [...pending],
          repairRow = structuredClone(rowSchema)
        repairRow.properties.claim_id = { type: "string", enum: assigned }
        const component = attempt
          ? "coverage-decisions-followup-" + i
          : "coverage-decisions-part-" + i
        const repaired = await repairComponent(
          ctx,
          reviewPrepared,
          reviewState,
          model,
          settings,
          component,
          assigned,
          object({ coverage_decisions: list(repairRow, assigned.length) }),
          original.filter((row) => assigned.includes(row?.claim_id)),
          Error("Every assigned important claim needs one explicit preservation decision"),
          {
            native_contract:
              "Return only the assigned missing or invalid claim decisions. Explicitly choose preserved with reason null or needs_revision with its concrete source-backed reason, from the exact source and draft. All other model decisions are retained; do not invent approval or change the source scope.",
          },
        )
        accept(repaired.coverage_decisions, assigned, {
          state: reviewState,
          stage: repairStageName(component, assigned),
        })
        pending = expected.filter((id) => !kept.has(id))
      }
      if (pending.length)
        throw Error("Explicit coverage decisions remain incomplete: " + pending.join(","))
      output = { ...output, coverage_decisions: expected.map((id) => kept.get(id)) }
    } else if (kind === "editorial" && i === 0 && !dispute) {
      // An overall revision is not an approval, but it need not discard an
      // independently valid positive row from the same response. Map only
      // original, uniquely scoped decisions and native-valid coverage rows;
      // malformed or negative rows remain solely in the preserved response.
      const expected = scopes[i],
        raw = result.output
      const decisions = Array.isArray(raw.coverage_decisions) ? raw.coverage_decisions : []
      const coverage = Array.isArray(raw.coverage) ? raw.coverage : []
      const currentDecisions = Array.isArray(output.coverage_decisions)
        ? output.coverage_decisions
        : []
      const currentCoverage = Array.isArray(output.coverage) ? output.coverage : []
      const scoped = [...decisions, ...coverage, ...currentDecisions, ...currentCoverage].every(
        (row) => typeof row?.claim_id === "string" && expected.includes(row.claim_id),
      )
      let timeValid = scoped && raw.coverage_reviewed_at === output.coverage_reviewed_at
      if (timeValid) {
        try {
          assertSavedReviewTime(ctx, { state, stage: "part-" + i }, raw.coverage_reviewed_at, [
            prepared.packet.draft.completeness_context.review.reviewed_at,
          ])
        } catch (error) {
          if (error.code !== "CORRECTION_TIME_INVALID") throw error
          timeValid = false
        }
      }
      if (timeValid)
        for (const id of expected) {
          const judgment = decisions.filter((row) => row.claim_id === id)
          const finalJudgment = currentDecisions.filter((row) => row.claim_id === id)
          const rows = coverage.filter((row) => row.claim_id === id)
          const finalRows = currentCoverage.filter((row) => row.claim_id === id)
          if (
            judgment.length !== 1 ||
            finalJudgment.length !== 1 ||
            rows.length !== 1 ||
            finalRows.length !== 1 ||
            !same(judgment[0], finalJudgment[0]) ||
            !same(rows[0], finalRows[0]) ||
            judgment[0].decision !== "preserved" ||
            judgment[0].reason !== null
          )
            continue
          try {
            assertSchema(judgment[0], schema.properties.coverage_decisions.items)
            assertEditorialCoverageRow(prepared.packet.draft, rows[0])
            partDecisionSources.set(id, { state, stage: "part-" + i })
          } catch {
            // Unvalidated rows are kept in the raw response, never mapped.
          }
        }
    }
    outputs.push(output)
    timeSources.push(timeSource)
    coverageDecisionSources.push(partDecisionSources)
    if (kind === "editorial" && i === 0 && output.editorial_review.status !== "approved") break
  }
  assertCombinedReviewSources(ctx, prepared)
  assertReuseIntegrity()
  assertDisputeIntegrity()
  const response = save(ctx.root, reviewBase + "response.json", {
    outputs,
    ...(reuseReceipt ? { coverage_reuse: reuseReceipt } : {}),
    ...(dispute
      ? {
          writer_dispute: dispute.reference,
          original_response: readJSON(ctx.root, dispute.record.revision_evidence.path).response,
        }
      : {}),
  })
  const repoRelative = (r) => path.relative(ctx.repo, safePath(ctx.root, r.path))
  const repairRefs = () =>
    [...new Set([prepared.base, reviewBase])].flatMap((base) =>
      fs.existsSync(safePath(ctx.root, base + "repair-results"))
        ? fs
            .readdirSync(safePath(ctx.root, base + "repair-results"))
            .sort()
            .map((name) => ref(ctx.root, base + "repair-results/" + name))
        : [],
    )
  if (kind === "evidence") {
    if (
      outputs.some((output) =>
        output.important_facts.some((row) => typeof row?.claim_ref !== "string"),
      )
    )
      throw Error("Importance decision is unbound to a claim")
    const reviewerReconciliation = await reconcileEvidenceReviewers(
      ctx,
      prepared,
      state,
      model,
      settings,
      outputs,
      response,
    )
    for (let part = 0; part < outputs.length; part++) {
      const output = outputs[part]
      let timeSourceStage = `part-${part}`
      if (prepared.packet.empty_extraction && !scopes[part].length) {
        try {
          assertSavedReviewTime(ctx, { state, stage: timeSourceStage }, output.reviewed_at)
        } catch (error) {
          if (error.code === "REVIEW_TIME_BINDING_INVALID") throw error
          const component = `empty-evidence-review-time-${part}`
          const corrected = await repairComponent(
            ctx,
            prepared,
            state,
            model,
            settings,
            component,
            [],
            object({ reviewed_at: text }),
            { reviewed_at: output.reviewed_at },
            error,
            {
              original_result: ref(ctx.root, state.directory + `part-${part}.json`),
              valid_decisions_retained: true,
              native_contract:
                "Supply only the actual review date or timestamp for the exact preserved source review. Do not change facts or approve an article.",
            },
          )
          timeSourceStage = repairStageName(component, [])
          assertSavedReviewTime(ctx, { state, stage: timeSourceStage }, corrected.reviewed_at)
          output.reviewed_at = corrected.reviewed_at
        }
      }
      for (let attempt = 0; ; attempt++) {
        const decisions = output.fact_review.claims
        if (decisions.some((d) => !scopes[part].includes(d.claim_id)))
          throw Error("Fact decision escaped its assigned scope")
        const timeSourceResult = readJSON(ctx.root, state.directory + timeSourceStage + ".json")
        if (!timeSourceResult) throw Error("Exact fact review model result required")
        let timeError = null
        try {
          assertCorrectionReviewTime(
            ctx,
            state,
            timeSourceStage,
            timeSourceResult,
            output.reviewed_at,
            [],
          )
        } catch (error) {
          if (error.code !== "CORRECTION_TIME_INVALID") throw error
          timeError = error
        }
        const observedErrors = scopes[part].flatMap((id) => {
          const original = prepared.packet.claims.find((c) => c.claim_id === id),
            rows = decisions.filter((d) => d.claim_id === id),
            proposed = { ...original, ...rows[0]?.replacement }
          try {
            if (timeError) throw timeError
            assertSchema(
              rows[0],
              outputSchema(prepared, [id], part).properties.fact_review.properties.claims.items,
            )
            const checked = recordFactReview([original], rows, output, prepared.packet.parses)
            if (prepared.packet.selected_event)
              assertSelectedEventFactScope(prepared.packet.selected_event, checked)
            return []
          } catch (error) {
            let structural_problems
            try {
              structural_problems = validateEvidence(proposed, prepared.packet.parses).problems
            } catch (structuralError) {
              structural_problems = [structuralError.message]
            }
            return [
              {
                claim_id: id,
                native_error: error.message,
                structural_problems,
                missing_verified_checks:
                  rows[0]?.status === "verified"
                    ? checks.filter((key) => rows[0][key] !== true)
                    : [],
              },
            ]
          }
        })
        // A failure can be time-dependent: a future model timestamp may become
        // valid while a later repair waits for its own response. Persist the
        // first exact scope before dispatch so re-entry cannot skip a requested
        // or completed explicit repair merely because the clock advanced.
        const triggerPath =
          prepared.base + `repair-triggers/fact-decisions-part-${part}-${attempt}.json`
        let trigger = readJSON(ctx.root, triggerPath)
        if (!trigger && !observedErrors.length) break
        const partResult = ref(ctx.root, state.directory + `part-${part}.json`)
        const beforeOutput = sha256(JSON.stringify(output))
        if (trigger) {
          if (
            trigger.schema !== "research-fact-repair-trigger/v1" ||
            trigger.input_sha256 !== prepared.input_sha256 ||
            trigger.part !== part ||
            trigger.attempt !== attempt ||
            trigger.before_output_sha256 !== beforeOutput ||
            !same(trigger.response, response) ||
            !same(trigger.part_result, partResult) ||
            !Array.isArray(trigger.errors) ||
            !trigger.errors.length ||
            new Set(trigger.errors.map((row) => row.claim_id)).size !== trigger.errors.length ||
            trigger.errors.some((row) => !scopes[part].includes(row.claim_id))
          )
            throw Error("Fact repair trigger binding changed")
        } else {
          if (attempt < 2) {
            trigger = {
              schema: "research-fact-repair-trigger/v1",
              input_sha256: prepared.input_sha256,
              part,
              attempt,
              before_output_sha256: beforeOutput,
              response,
              part_result: partResult,
              errors: observedErrors,
            }
            save(ctx.root, triggerPath, trigger)
          }
        }
        const errors = trigger?.errors || observedErrors
        if (attempt >= 2) {
          const error = Error(
            "Native fact decisions remain invalid after two targeted repairs: " +
              JSON.stringify(errors),
          )
          error.code = "FACT_DECISIONS_REPAIR_EXHAUSTED"
          throw error
        }
        const invalid = errors.map((row) => row.claim_id)
        const schema = object({
          claims: {
            ...outputSchema(prepared, invalid, part).properties.fact_review.properties.claims,
            minItems: invalid.length,
            maxItems: invalid.length,
          },
          reviewed_at: text,
        })
        const component = "fact-decisions-part-" + part + (attempt ? "-followup-" + attempt : "")
        const repaired = await repairComponent(
          ctx,
          prepared,
          state,
          model,
          settings,
          component,
          invalid,
          schema,
          decisions.filter((d) => invalid.includes(d.claim_id)),
          Error("Native source/claim review validation failed"),
          {
            native_fact_errors: errors,
            replacement_fields: Object.keys(claimReplacementSchema().properties),
            valid_decisions_retained: true,
            contract:
              "Return exactly one explicit decision for each assigned original claim ID. Only those decisions may change. Read the original source and correct only its unsupported statement, event state or evidence using the allowed replacement fields, or explicitly defer/reject it with reasons. A completed selection/announcement and planned future delivery are distinct; never promote the planned action to completion. Native checks are structural feedback, not semantic approval. Do not invent claim IDs or use automatic defaults.",
          },
        )
        if (repaired.claims.some((row) => !invalid.includes(row.claim_id)))
          throw Error("Fact repair escaped its assigned scope")
        output.fact_review = {
          ...output.fact_review,
          claims: [...decisions.filter((d) => !invalid.includes(d.claim_id)), ...repaired.claims],
        }
        output.reviewed_at = repaired.reviewed_at
        timeSourceStage = "repair-" + component + "-" + sha256(JSON.stringify(invalid)).slice(0, 16)
      }
    }
    const originalDecisions = outputs.flatMap((o) => o.fact_review.claims)
    const originalOnly = recordFactReview(
      prepared.packet.claims,
      originalDecisions,
      {
        reviewer: outputs[0].reviewer,
        reviewed_at: latestReviewTime(outputs.map((o) => o.reviewed_at)),
      },
      prepared.packet.parses,
    )
    const knownIds = new Set(originalOnly.map((c) => c.claim_id))
    const additions = outputs[0].fact_review.additions,
      resolved = new Map(),
      omitted = new Set(),
      additionErrors = new Map()
    const checkAddition = (addition, reviewed_at) => {
      assertSchema(addition, sourceAdditionSchema(prepared))
      const checked = recordFactReview(
        prepared.packet.claims,
        originalDecisions,
        {
          reviewer: outputs[0].reviewer,
          reviewed_at,
          additions: [addition],
        },
        prepared.packet.parses,
      ).at(-1)
      if (prepared.packet.selected_event)
        assertSelectedEventFactScope(prepared.packet.selected_event, [checked])
      if (knownIds.has(checked.claim_id)) throw Error("Duplicate source addition")
      knownIds.add(checked.claim_id)
    }
    const originalDate = latestReviewTime(outputs.map((o) => o.reviewed_at))
    additions.forEach((addition, index) => {
      try {
        checkAddition(addition, originalDate)
        resolved.set(index, addition)
      } catch (error) {
        additionErrors.set(index, error.message)
      }
    })
    let pendingAdditions = [...additionErrors.keys()]
    for (let attempt = 0; pendingAdditions.length && attempt < 2; attempt++) {
      const schema = object({
        decisions: list(
          object(
            {
              index: { type: "integer", enum: pendingAdditions },
              disposition: { type: "string", enum: ["replace", "omit"] },
              reason: text,
              addition: sourceAdditionSchema(prepared),
            },
            ["index", "disposition", "reason"],
          ),
          20,
        ),
        reviewed_at: text,
      })
      const partialSchema = structuredClone(schema)
      partialSchema.properties.decisions.items.properties.addition = { type: "object" }
      const additionComponent = attempt
        ? "source-additions-followup-" + attempt
        : "source-additions"
      const additionIds = pendingAdditions.map((i) => "addition:" + i)
      const repaired = await repairComponent(
        ctx,
        prepared,
        state,
        model,
        settings,
        additionComponent,
        additionIds,
        schema,
        pendingAdditions.map((index) => ({ index, addition: additions[index] })),
        Error(
          "Native addition/source-scope or duplicate validation failed; replace with a valid directly sourced fact or explicitly omit that addition",
        ),
        {
          native_addition_errors: pendingAdditions.map((index) => ({
            index,
            error: additionErrors.get(index),
          })),
          native_addition_contract: {
            allowed_candidate_keys: sourceAdditionCandidateKeys(prepared),
            claim_fields: ["candidate_key", ...extractionSchema.properties.claims.items.required],
            decision_fields: ["reason", ...checks, "ocr_evidence"],
            native_claim_ids_computed: true,
          },
          valid_additions_retained: [...resolved.keys()],
        },
        partialSchema,
      )
      const additionSource = { state, stage: repairStageName(additionComponent, additionIds) }
      let additionReviewedAt = repaired.reviewed_at
      try {
        assertSavedReviewTime(ctx, additionSource, additionReviewedAt)
      } catch (error) {
        if (error.code === "REVIEW_TIME_BINDING_INVALID") throw error
        const component = "source-additions-review-time-" + attempt
        const corrected = await repairComponent(
          ctx,
          prepared,
          state,
          model,
          settings,
          component,
          [],
          object({ reviewed_at: text }),
          {
            reviewed_at: additionReviewedAt,
            decisions_sha256: sha256(JSON.stringify(repaired.decisions)),
          },
          error,
          {
            original_result: ref(ctx.root, state.directory + additionSource.stage + ".json"),
            valid_decisions_retained: true,
            native_contract:
              "Supply only the actual review date or timestamp for the exact preserved addition decisions. Do not change factual decisions or approve an article.",
          },
        )
        additionReviewedAt = corrected.reviewed_at
        assertSavedReviewTime(
          ctx,
          { state, stage: repairStageName(component, []) },
          additionReviewedAt,
        )
      }
      for (const index of pendingAdditions) {
        const rows = repaired.decisions.filter((d) => d.index === index)
        try {
          if (rows.length !== 1) throw Error("One explicit disposition for this addition required")
          const decision = rows[0]
          if (decision.disposition === "omit") omitted.add(index)
          else {
            checkAddition(decision.addition, additionReviewedAt)
            resolved.set(index, decision.addition)
          }
          additionErrors.delete(index)
        } catch (error) {
          additionErrors.set(index, error.message)
          if (rows.length === 1 && rows[0].addition) additions[index] = rows[0].addition
        }
      }
      outputs[0].reviewed_at = additionReviewedAt
      pendingAdditions = pendingAdditions.filter((i) => !resolved.has(i) && !omitted.has(i))
    }
    if (pendingAdditions.length) {
      const error = Error(
        "Explicit source addition repair remains invalid: " +
          JSON.stringify(
            pendingAdditions.map((index) => ({ index, error: additionErrors.get(index) })),
          ),
      )
      error.code = "SOURCE_ADDITIONS_REPAIR_EXHAUSTED"
      throw error
    }
    outputs[0].fact_review.additions = additions.flatMap((_, i) =>
      resolved.has(i) ? [resolved.get(i)] : [],
    )
    outputs[0].addition_refs = additions.flatMap((_, i) =>
      resolved.has(i) ? ["addition:" + i] : [],
    )
    const omittedRefs = new Set([...omitted].map((index) => "addition:" + index))
    for (const output of outputs)
      output.important_facts = output.important_facts.filter((d) => !omittedRefs.has(d.claim_ref))
    const projected = projectFacts(prepared, outputs)
    if (
      prepared.packet.empty_extraction &&
      !projected.claims.some((claim) => claim.review?.status === "verified")
    ) {
      const error = Error("No source-backed verified fact for the empty selected-event extraction")
      error.code = "SOURCE_REVIEW_EMPTY"
      throw error
    }
    const fact = save(ctx.root, prepared.base + "fact-review.json", projected.fact)
    if (!readJSON(ctx.root, `runs/${run_id}/reviewed-claims.json`))
      await nativeResearch(
        ctx,
        "review",
        { run_id, review_file: repoRelative(fact) },
        { run_id: "run", review_file: "review" },
      )
    const current = readJSON(ctx.root, `runs/${run_id}/reviewed-claims.json`)
    if (!same(current.claims, projected.claims))
      throw Error("Native fact projection differs from explicit bundle")
    const projectBoundImportance = () => {
      outputs.forEach((output, i) =>
        assertSavedReviewTime(
          ctx,
          timeSources[i].importance_reviewed_at,
          output.importance_reviewed_at,
        ),
      )
      return projectImportance(prepared, outputs, projected)
    }
    let completeness
    try {
      completeness = projectBoundImportance()
    } catch (error) {
      if (error.code === "REVIEW_TIME_BINDING_INVALID") throw error
      const { bad, valid, unknown } = importanceProblems(prepared, projected, outputs)
      if (unknown.length) {
        const omitted = await repairComponent(
          ctx,
          prepared,
          state,
          model,
          settings,
          "importance-references",
          unknown,
          object({ omit_claim_refs: list({ type: "string", enum: unknown }), reason: text }),
          outputs.flatMap((o) => o.important_facts).filter((d) => unknown.includes(d.claim_ref)),
          Error(
            "Importance references facts that were not verified or not added; explicitly omit only these invalid references",
          ),
        )
        if (
          omitted.omit_claim_refs.length !== unknown.length ||
          new Set(omitted.omit_claim_refs).size !== unknown.length
        )
          throw Error("Every invalid importance reference requires an explicit disposition")
        for (const output of outputs)
          output.important_facts = output.important_facts.filter(
            (d) => !omitted.omit_claim_refs.includes(d.claim_ref),
          )
        try {
          completeness = projectBoundImportance()
        } catch (currentError) {
          if (currentError.code === "REVIEW_TIME_BINDING_INVALID") throw currentError
          error = currentError
        }
      }
      if (!completeness && /Review (?:date|time)|Valid review date/.test(error.message)) {
        const repaired = await repairComponent(
          ctx,
          prepared,
          state,
          model,
          settings,
          "importance-review-time",
          [],
          object({ importance_reviewed_at: text }),
          { importance_reviewed_at: outputs.map((o) => o.importance_reviewed_at) },
          error,
        )
        const repairedTimeSource = {
          state,
          stage: repairStageName("importance-review-time", []),
        }
        assertSavedReviewTime(ctx, repairedTimeSource, repaired.importance_reviewed_at, [
          ...projected.claims
            .filter((claim) => claim.review?.status === "verified")
            .flatMap((claim) => [claim.published_at, claim.review.reviewed_at]),
          ...prepared.packet.documents.map((document) => document.observed_at),
          ...prepared.packet.parses.map((parse) => parse.dates?.observed_at),
        ])
        for (const [i, output] of outputs.entries()) {
          output.importance_reviewed_at = repaired.importance_reviewed_at
          timeSources[i].importance_reviewed_at = repairedTimeSource
        }
        try {
          completeness = projectBoundImportance()
        } catch (currentError) {
          if (
            currentError.code === "REVIEW_TIME_BINDING_INVALID" ||
            /Review (?:date|time)|Valid review date/.test(currentError.message)
          )
            throw currentError
          // Correcting the review time can expose an independent invalid fact
          // decision. Keep the time receipt and continue with the exact
          // importance rows already identified above, rather than dropping
          // the article or asking for all decisions again.
          error = currentError
        }
      }
      if (!completeness) {
        const ids = bad.length
          ? bad
          : [...projected.mappings]
              .filter(([, c]) => c.review.status === "verified")
              .map(([id]) => id)
        let pendingIds = ids,
          retained = bad.length ? valid : [],
          previous = outputs.flatMap((o) => o.important_facts)
        for (let attempt = 0; attempt < 2; attempt++) {
          const schema = object({
            important_facts: list(
              outputSchema(prepared, pendingIds, 0).properties.important_facts.items,
            ),
            importance_reviewed_at: text,
          })
          const requirements = pendingIds.map((claim_ref) => {
            const c = projected.mappings.get(claim_ref)
            return {
              claim_ref,
              resulting_claim_id: c.claim_id,
              statement: c.statement,
              claim_kind: c.claim_kind,
              event_state: c.event_state,
              minimum_when_important: factAspects(c),
              fact_reviewed_at: c.review.reviewed_at,
            }
          })
          const repaired = await repairComponent(
            ctx,
            prepared,
            state,
            model,
            settings,
            attempt ? "important_facts-followup" : "important_facts",
            pendingIds,
            schema,
            previous.filter((d) => pendingIds.includes(d.claim_ref)),
            error,
            {
              native_requirements: requirements,
              verified_claims: {
                file: safePath(ctx.root, `runs/${run_id}/reviewed-claims.json`),
                sha256: ref(ctx.root, `runs/${run_id}/reviewed-claims.json`).sha256,
              },
              original_valid_decisions_preserved: true,
            },
          )
          if (repaired.important_facts.some((d) => !pendingIds.includes(d.claim_ref)))
            throw Error("Importance repair escaped its exact scope")
          const merged = {
            ...outputs[0],
            importance_reviewed_at: repaired.importance_reviewed_at,
            important_facts: [...retained, ...repaired.important_facts],
          }
          try {
            assertSavedReviewTime(
              ctx,
              {
                state,
                stage: repairStageName(
                  attempt ? "important_facts-followup" : "important_facts",
                  pendingIds,
                ),
              },
              repaired.importance_reviewed_at,
            )
            completeness = projectImportance(prepared, [merged], projected)
            break
          } catch (nextError) {
            if (nextError.code === "REVIEW_TIME_BINDING_INVALID") throw nextError
            if (attempt) throw nextError
            error = nextError
            const next = importanceProblems(prepared, projected, [merged])
            if (!next.bad.length) throw nextError
            pendingIds = next.bad
            retained = next.valid
            previous = merged.important_facts
          }
        }
      }
    }
    const complete = save(ctx.root, prepared.base + "completeness-review.json", completeness)
    await bindEditorialCompleteness(ctx.root, run_id, safePath(ctx.root, complete.path))
    save(ctx.root, prepared.base + "application.json", {
      schema: "research-review-bundle-application/v1",
      response,
      manifest: prepared.manifest,
      fact,
      completeness: complete,
      mapping: [...projected.mappings].map(([claim_ref, c]) => ({
        claim_ref,
        claim_id: c.claim_id,
      })),
      native_validators: true,
      repairs: repairRefs(),
      ...(reviewerReconciliation ? { reviewer_reconciliation: reviewerReconciliation } : {}),
      factual_decisions_generated: false,
    })
    return {
      fact_review_file: repoRelative(fact),
      completeness_review_file: repoRelative(complete),
      response,
    }
  }
  let editorial = outputs[0].editorial_review
  const coverage = {
    schema: "research-editorial-completeness-coverage/v1",
    context_sha256: prepared.packet.completeness.context_sha256,
    draft_id: prepared.packet.draft.draft_id,
    draft_sha256: prepared.packet.completeness.draft_sha256,
    reviewer: outputs[0].reviewer,
    reviewed_at: latestReviewTime([
      ...outputs.map((o) => o.coverage_reviewed_at),
      ...(reuse?.rows.map((row) => row.reviewed_at) || []),
    ]),
    source_read: true,
    final_prose_read: true,
    coverage: [
      ...outputs.flatMap((o) => o.coverage),
      ...(reuse?.rows.map((row) => row.coverage) || []),
    ],
  }
  let coverageTimeSources = outputs.map((output, i) => ({
    ...timeSources[i].coverage_reviewed_at,
    value: output.coverage_reviewed_at,
  }))
  if (reuse) {
    const seen = new Set()
    for (const row of reuse.rows) {
      const key = JSON.stringify([
        row.timeSource.state.directory,
        row.timeSource.stage,
        row.reviewed_at,
      ])
      if (seen.has(key)) continue
      seen.add(key)
      coverageTimeSources.push({ ...row.timeSource, value: row.reviewed_at })
    }
  }
  const assertCoverageTimes = () =>
    coverageTimeSources.forEach((source) => assertSavedReviewTime(ctx, source, source.value))
  const coverageDecisionMapping = outputs
    .flatMap((output, part) =>
      (Array.isArray(output.coverage_decisions) ? output.coverage_decisions : []).flatMap(
        (decision) => {
          const origin = coverageDecisionSources[part].get(decision?.claim_id)
          if (!origin) return []
          return [
            {
              part,
              reviewer: output.reviewer,
              ...decision,
              response: ref(ctx.root, origin.state.directory + origin.stage + ".json"),
            },
          ]
        },
      ),
    )
    .concat(
      (reuse?.rows || []).map((row) => ({
        part: row.part,
        reviewer: row.reviewer,
        ...row.decision,
        response: row.response,
        reused: true,
        origin_manifest: row.origin_manifest,
        previous_application: reuse.previous_application,
        context_sha256: row.context_sha256,
      })),
    )
  const explicitFindings = coverageDecisionMapping.filter(
    (decision) => decision.decision === "needs_revision",
  )
  if (editorial.status === "approved" && explicitFindings.length) {
    const dates = []
    const findingOrigins = new Map()
    for (const finding of explicitFindings) {
      const origin = coverageDecisionSources[finding.part].get(finding.claim_id)
      findingOrigins.set(origin.state.directory + origin.stage, { part: finding.part, origin })
    }
    for (const { part, origin } of findingOrigins.values()) {
      let value = outputs[part].reviewed_at,
        source = origin,
        lastError
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          assertSavedReviewTime(ctx, source, value, [
            prepared.packet.draft.completeness_context.review.reviewed_at,
          ])
          lastError = null
          break
        } catch (error) {
          if (error.code !== "CORRECTION_TIME_INVALID" || attempt === 2) throw error
          lastError = error
          const originSuffix =
            origin.stage === "part-" + part ? "" : "-" + sha256(origin.stage).slice(0, 8)
          const component = "coverage-finding-date-" + part + originSuffix + "-" + attempt
          const fixedDate = await repairComponent(
            ctx,
            reviewPrepared,
            reviewState,
            model,
            settings,
            component,
            [],
            object({ reviewed_at: text }),
            { reviewed_at: value },
            error,
            {
              retained_decisions_sha256: sha256(JSON.stringify(outputs[part].coverage_decisions)),
              native_contract:
                "Supply only the actual review date. Preserve the explicit per-claim decisions and all source findings; do not issue an approval.",
            },
          )
          value = fixedDate.reviewed_at
          source = { state: reviewState, stage: repairStageName(component, []) }
        }
      }
      if (lastError) throw lastError
      dates.push(value)
    }
    const latest = latestReviewTime(dates),
      parsed = parseResearchDate(latest),
      reviewed_at = parsed?.precision === "day" ? parsed.day : seoulPublicationDay(latest)
    if (!reviewed_at) throw Error("Exact review date required for a coverage finding")
    editorial = {
      status: "needs_revision",
      draft_id: prepared.packet.draft.draft_id,
      reviewer: outputs[0].reviewer,
      reviewed_at,
      reason: explicitFindings
        .map((finding) => `[${finding.claim_id}] ${finding.reason}`)
        .join("\n"),
    }
    assertSchema(editorial, editorialDecisionSchema(prepared, "needs_revision"))
  }
  const revisionFindings = async (review, component) => {
    if (review.status !== "needs_revision" || review.reason?.trim()) return review
    const repaired = await repairComponent(
      ctx,
      reviewPrepared,
      reviewState,
      model,
      settings,
      component,
      [],
      object({ status: { type: "string", enum: ["approved", "needs_revision"] }, reason: text }),
      { editorial_review: review, coverage: coverage.coverage },
      Error("A revision decision requires its explicit concrete source/prose findings"),
      {
        native_contract:
          "Retain valid coverage and fact judgments. State all required changes and exact affected facts/prose in editorial_review.reason. If the prior revision status was incorrect, explicitly correct that decision and supply every existing native approval check; the program never supplies approval.",
      },
    )
    return { ...review, ...repaired }
  }
  const assertApprovalCoverageDecisions = () => {
    if (editorial.status !== "approved") return
    for (const id of prepared.packet.completeness.important_claim_ids) {
      const decisions = coverageDecisionMapping.filter((row) => row.claim_id === id)
      if (decisions.length !== 1 || decisions[0].decision !== "preserved")
        throw Error("Explicit positive coverage decisions are required before editorial approval")
    }
  }
  editorial = await revisionFindings(editorial, "editorial-revision-findings")
  assertApprovalCoverageDecisions()
  if (editorial.status === "approved") {
    try {
      assertCoverageTimes()
      assertEditorialCoverage(prepared.packet.draft, prepared.packet.claims, coverage, {
        documents: prepared.packet.documents,
        parses: prepared.packet.parses,
      })
    } catch (error) {
      if (error.code === "REVIEW_TIME_BINDING_INVALID") throw error
      const ids = prepared.packet.completeness.important_claim_ids
      const valid = [],
        invalid = []
      for (const id of ids) {
        const rows = coverage.coverage.filter((r) => r.claim_id === id)
        try {
          if (rows.length !== 1) throw Error("One coverage decision required")
          assertEditorialCoverageRow(prepared.packet.draft, rows[0])
          valid.push(rows[0])
        } catch {
          invalid.push(id)
        }
      }
      const kept = new Map(valid.map((row) => [row.claim_id, row]))
      let pending = invalid,
        previous = coverage.coverage,
        lastError = error
      for (let attempt = 0; pending.length && attempt < 2; attempt++) {
        const rowSchema = structuredClone(completenessCoverageSchema.properties.coverage.items)
        rowSchema.properties.claim_id = { type: "string", enum: pending }
        const coverageComponent = attempt ? "coverage-followup-" + attempt : "coverage"
        const assigned = [...pending]
        const repaired = await repairComponent(
          ctx,
          reviewPrepared,
          reviewState,
          model,
          settings,
          coverageComponent,
          pending,
          object({
            coverage: list(rowSchema, pending.length),
            revision_required: { type: "boolean" },
            reason: text,
            reviewed_at: text,
          }),
          previous.filter((row) => pending.includes(row.claim_id)),
          lastError,
          {
            coverage_requirements: pending.map((claim_id) => {
              const template = prepared.packet.completeness.coverage_template.coverage.find(
                (row) => row.claim_id === claim_id,
              )
              return {
                claim_id,
                required_aspects: template.preserved_aspects,
                allowed_reader_locations: template.locations,
              }
            }),
            native_contract:
              "Return one explicit decision for every assigned ID when revision_required is false. Valid decisions outside this scope are retained. Each important ID must already belong to a cited paragraph; a semantically equivalent claim with a different ID cannot override this reference rule. If reader prose or references must change, explicitly request revision instead of asserting a false positive.",
          },
        )
        if (repaired.coverage.some((row) => !pending.includes(row.claim_id)))
          throw Error("Coverage repair escaped exact scope")
        if (repaired.revision_required) {
          editorial = { ...editorial, status: "needs_revision", reason: repaired.reason }
          break
        }
        for (const id of pending) {
          const rows = repaired.coverage.filter((row) => row.claim_id === id)
          try {
            if (rows.length !== 1)
              throw Error("Exactly one explicit assigned coverage decision required")
            assertEditorialCoverageRow(prepared.packet.draft, rows[0])
            kept.set(id, rows[0])
          } catch (validationError) {
            lastError = validationError
          }
        }
        pending = ids.filter((id) => !kept.has(id))
        previous = repaired.coverage
        coverage.coverage = ids.filter((id) => kept.has(id)).map((id) => kept.get(id))
        coverage.reviewed_at = repaired.reviewed_at
        coverageTimeSources = [
          {
            state: reviewState,
            stage: repairStageName(coverageComponent, assigned),
            value: repaired.reviewed_at,
          },
        ]
      }
      if (editorial.status === "approved") {
        if (pending.length)
          throw Error(
            "Explicit coverage repair remains incomplete for assigned IDs: " + pending.join(","),
          )
        // Dates are metadata. Retain every valid semantic judgment when only
        // the review timestamp is invalid, rather than reviewing them again.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            assertCoverageTimes()
            assertReviewDate(coverage.reviewed_at, {
              notBefore: [prepared.packet.draft.completeness_context.review.reviewed_at],
            })
            break
          } catch (dateError) {
            if (dateError.code === "REVIEW_TIME_BINDING_INVALID") throw dateError
            const fixedDate = await repairComponent(
              ctx,
              reviewPrepared,
              reviewState,
              model,
              settings,
              "coverage-date-" + attempt,
              [],
              object({ reviewed_at: text }),
              { reviewed_at: coverage.reviewed_at },
              dateError,
              {
                retained_coverage_sha256: sha256(JSON.stringify(coverage.coverage)),
                not_before: prepared.packet.draft.completeness_context.review.reviewed_at,
              },
            )
            coverage.reviewed_at = fixedDate.reviewed_at
            coverageTimeSources = [
              {
                state: reviewState,
                stage: repairStageName("coverage-date-" + attempt, []),
                value: fixedDate.reviewed_at,
              },
            ]
          }
        }
        assertCoverageTimes()
        assertEditorialCoverage(prepared.packet.draft, prepared.packet.claims, coverage, {
          documents: prepared.packet.documents,
          parses: prepared.packet.parses,
        })
      }
    }
  }
  if (editorial.status === "approved") {
    let editorialTimeSource = timeSources[0].editorial_review
    const validate = (review) => {
      assertSchema(review, editorialDecisionSchema(prepared, review.status))
      assertSavedReviewTime(ctx, editorialTimeSource, review.reviewed_at, [coverage.reviewed_at])
      const bound = { ...review, completeness_review: coverage }
      const article = approvedArticle(
        prepared.packet.draft,
        prepared.packet.claims,
        prepared.packet.documents,
        bound,
        prepared.packet.parses,
      )
      assertReaderQuality(prepared.packet.reader_quality, bound)
      evaluateArticleConceptReview(
        ctx.root,
        article,
        prepared.packet.draft,
        prepared.packet.claims,
        prepared.packet.parses,
        bound,
        { vault: ctx.vault },
      )
    }
    try {
      validate(editorial)
    } catch (error) {
      if (error.code === "REVIEW_TIME_BINDING_INVALID") throw error
      if (error.code === "CORRECTION_TIME_INVALID") {
        let dateError = error,
          repairedDate = false
        for (let attempt = 0; attempt < 2; attempt++) {
          const component = "editorial-review-date-" + attempt
          const fixedDate = await repairComponent(
            ctx,
            reviewPrepared,
            reviewState,
            model,
            settings,
            component,
            [],
            object({ reviewed_at: editorialDecisionSchema(prepared).properties.reviewed_at }),
            { reviewed_at: editorial.reviewed_at },
            dateError,
            {
              retained_editorial_sha256: sha256(JSON.stringify(editorial)),
              retained_coverage_sha256: sha256(JSON.stringify(coverage)),
              native_contract:
                "Supply only the actual editorial review date. Retain all existing explicit editorial and coverage judgments; do not issue a new approval.",
            },
          )
          const source = { state: reviewState, stage: repairStageName(component, []) }
          try {
            assertSavedReviewTime(ctx, source, fixedDate.reviewed_at, [coverage.reviewed_at])
            editorial = { ...editorial, reviewed_at: fixedDate.reviewed_at }
            editorialTimeSource = source
            repairedDate = true
            break
          } catch (nextError) {
            if (nextError.code !== "CORRECTION_TIME_INVALID") throw nextError
            dateError = nextError
          }
        }
        if (!repairedDate) throw dateError
        try {
          validate(editorial)
          error = null
        } catch (nextError) {
          if (nextError.code === "REVIEW_TIME_BINDING_INVALID") throw nextError
          error = nextError
        }
      }
      if (error) {
        const repair = await repairComponent(
          ctx,
          reviewPrepared,
          reviewState,
          model,
          settings,
          "editorial_review",
          [],
          object({ editorial_review: editorialDecisionSchema(prepared) }),
          editorial,
          error,
          {
            native_editorial_contract: prepared.packet.editorial_contract,
            exact_draft_id: prepared.packet.draft.draft_id,
            retained_coverage_sha256: sha256(JSON.stringify(coverage)),
            native_contract:
              "Retain valid fact and coverage judgments. Supply every explicit native editorial check and the exact event/draft metadata defined by this schema. A prose approval reason does not replace any required check field.",
          },
        )
        editorial = await revisionFindings(
          { ...editorial, ...repair.editorial_review },
          "editorial-revision-findings-after-native",
        )
        if (!["approved", "needs_revision"].includes(editorial.status))
          throw Error("Explicit editorial decision required")
        editorialTimeSource = { state: reviewState, stage: repairStageName("editorial_review", []) }
        if (editorial.status === "approved") validate(editorial)
      }
    }
  }
  assertApprovalCoverageDecisions()
  assertCombinedReviewSources(ctx, prepared)
  assertReuseIntegrity()
  assertDisputeIntegrity()
  const ed = save(ctx.root, reviewBase + "editorial-review.json", editorial)
  const cov = save(ctx.root, reviewBase + "coverage-review.json", coverage)
  const revisionEvidence =
    editorial.status === "needs_revision"
      ? save(ctx.root, reviewBase + "revision-evidence.json", {
          schema: "research-editorial-revision-evidence/v1",
          input_sha256: prepared.input_sha256,
          draft: ref(ctx.root, `runs/${run_id}/draft.json`),
          editorial: ed,
          coverage: cov,
          response,
          coverage_decision_mapping: coverageDecisionMapping,
          ...(reuseReceipt ? { coverage_reuse: reuseReceipt } : {}),
          repairs: repairRefs(),
        })
      : null
  save(ctx.root, reviewBase + "application.json", {
    schema: "research-review-bundle-application/v1",
    response,
    manifest: prepared.manifest,
    editorial: ed,
    coverage: cov,
    coverage_decision_mapping: coverageDecisionMapping,
    ...(reuseReceipt ? { coverage_reuse: reuseReceipt } : {}),
    native_validators: editorial.status === "approved",
    repairs: repairRefs(),
    ...(dispute ? { writer_dispute: dispute.reference } : {}),
    factual_decisions_generated: false,
  })
  return {
    editorial_review_file: repoRelative(ed),
    coverage_review_file: repoRelative(cov),
    needs_revision: editorial.status !== "approved",
    ...(revisionEvidence ? { revision_evidence: revisionEvidence } : {}),
    response,
  }
}

export async function runCombinedDraftCorrection(
  ctx,
  { run_id, review_file, structural_validation, revision_evidence, curation },
  { baseProvider, executionWindow, preparedInput } = {},
) {
  const prepared =
    preparedInput || prepareCombinedReview(ctx, { run_id, kind: "editorial", curation })
  if (prepared.run_id !== run_id || prepared.kind !== "editorial")
    throw Error("Exact correction input required")
  if (Boolean(review_file) === Boolean(structural_validation))
    throw Error("Exactly one native validation finding or explicit editorial revision required")
  const review = review_file ? JSON.parse(fs.readFileSync(safePath(ctx.repo, review_file))) : null
  if (review?.status === "approved") throw Error("A correction needs an explicit revision finding")
  const assertRevisionEvidence = () => {
    if (!review) return
    if (
      !revision_evidence ||
      ref(ctx.root, revision_evidence.path).sha256 !== revision_evidence.sha256
    )
      throw Error("Exact editorial revision evidence required")
    const evidence = readJSON(ctx.root, revision_evidence.path)
    const mapping = evidence.coverage_decision_mapping
    const extraRefs = [
      ...(Array.isArray(mapping) ? mapping.map((row) => row?.response) : []),
      ...(evidence.coverage_reuse ? [evidence.coverage_reuse] : []),
    ]
    const references = [
      ...new Map(
        [evidence.coverage, evidence.response, ...evidence.repairs, ...extraRefs].map((r) => [
          JSON.stringify(r),
          r,
        ]),
      ).values(),
    ]
    if (
      evidence.schema !== "research-editorial-revision-evidence/v1" ||
      evidence.input_sha256 !== prepared.input_sha256 ||
      (mapping !== undefined && !Array.isArray(mapping)) ||
      safePath(ctx.root, evidence.draft.path) !== safePath(ctx.root, `runs/${run_id}/draft.json`) ||
      ref(ctx.root, evidence.draft.path).sha256 !== evidence.draft.sha256 ||
      safePath(ctx.root, evidence.editorial.path) !== safePath(ctx.repo, review_file) ||
      ref(ctx.root, evidence.editorial.path).sha256 !== evidence.editorial.sha256 ||
      references.some((r) => !r?.path || !r.sha256 || ref(ctx.root, r.path).sha256 !== r.sha256)
    )
      throw Error("Editorial revision evidence input or findings changed")
  }
  if (review) assertRevisionEvidence()
  else if (revision_evidence)
    throw Error("Structural preflight cannot import an editorial revision")
  const policy = JSON.parse(fs.readFileSync(ctx.policy)),
    settings = resolveRolePolicy(policy, "article_write")
  const run =
    "bundle-fix-" +
    sha256(
      JSON.stringify([prepared.input_sha256, review || structural_validation, revision_evidence]),
    ).slice(0, 40)
  const provider =
    baseProvider || createModelProvider(policy, "article_write", { root: ctx.root, run })
  const model = await prepareRoleProvider(provider, policy, "article_write", {
    root: ctx.root,
    run,
    executionWindow,
  })
  const input = {
    task: "combined_review_correction",
    run_id,
    input_sha256: prepared.input_sha256,
    source_manifest: { file: prepared.manifest_file, sha256: prepared.manifest.sha256 },
    ...(review
      ? {
          review,
          revision_evidence: {
            file: safePath(ctx.root, revision_evidence.path),
            sha256: revision_evidence.sha256,
          },
        }
      : { structural_validation }),
  }
  const state = new RunState(ctx.root, run, input)
  const request = {
    model: settings.model,
    messages: [
      {
        role: "system",
        content:
          "Read the exact source manifest and original draft, then fix the explicit independent review findings or listed native structural blocks. When revision_evidence is present, verify its SHA and read its exact editorial, coverage, raw response and repair references. Use the final editorial/coverage decisions and explicit repairs for current findings. Earlier raw responses preserve provenance and do not reopen resolved findings. Do not infer a finding from needs_revision alone. Preserve every important fact, source attribution, units, conditions, dates and plan/completion distinctions. Preserve unaffected paragraphs and their claim IDs verbatim; do not rewrite the whole article to fix a local problem. If a native important ID is missing but its fact is already expressed, verify the source and add the correct ID to that paragraph without deleting other valid references. Check all frozen important-fact preservation requirements before returning. Return a complete replacement draft and an explicit correction reason. This is writing, not editorial approval. " +
          readerReviewPolicy +
          sourceReferencePolicy +
          " If a revision finding belongs to another article or contradicts the bound source and no substantive prose correction is warranted, retain the draft exactly and return review_dispute with concrete source/prose reasons. This asks an independent reviewer to reassess the disputed decision; it never approves the article. Do not make cosmetic edits merely to bypass a mistaken finding. Structural preflight findings cannot use this branch.",
      },
      { role: "user", content: JSON.stringify(input) },
    ],
    schema: object(
      {
        reviewer: text,
        reviewed_at: text,
        reason: text,
        draft: schemaForDraft(
          prepared.packet.draft.deep_context,
          prepared.packet.claims
            .filter((c) => c.review.status === "verified")
            .map((c) => c.claim_id),
        ),
        ...(review
          ? {
              review_dispute: editorialDisputeSchema(
                prepared,
                ref(ctx.root, path.relative(ctx.root, safePath(ctx.repo, review_file))).sha256,
              ),
            }
          : {}),
      },
      ["reviewer", "reviewed_at", "reason", "draft"],
    ),
  }
  if (JSON.stringify(request).length > 20000) {
    const stored = save(ctx.root, `runs/${run}/correction-input.json`, input)
    request.messages[1].content = JSON.stringify({
      task: input.task,
      run_id,
      input_sha256: prepared.input_sha256,
      source_manifest: input.source_manifest,
      correction_input_file: safePath(ctx.root, stored.path),
      correction_input_sha256: stored.sha256,
    })
    request.messages[0].content +=
      " Read the complete correction_input_file and verify its exact SHA before writing. Its bound findings and original source are not truncated."
  }
  const result = await state.stage("correction", request, () => model.structured(request))
  assertSchema(result.output, request.schema)
  assertCombinedReviewSources(ctx, prepared)
  assertRevisionEvidence()
  let timeSource = { stage: "correction", result }
  let output = result.output
  if (output.review_dispute && !same(output.draft, prepared.packet.draft.draft)) {
    // Both intentions were explicitly supplied, but they are mutually
    // exclusive native contracts. Only the model may choose which to keep.
    const original = save(ctx.root, `runs/${run}/correction-original-decision.json`, output)
    const originalSHA = sha256(JSON.stringify(output))
    const schema = object({
      action: { type: "string", enum: ["keep_correction", "keep_dispute"] },
      original_decision_sha256: fixed(originalSHA),
      reviewer: text,
      reviewed_at: text,
      source_read: fixed(true),
      final_prose_read: fixed(true),
      reason: text,
    })
    let resolved = false,
      lastError = Error("An editorial dispute must preserve the exact current draft")
    for (let attempt = 0; attempt < 2; attempt++) {
      const resolutionInput = {
        task: "combined_review_correction_resolution",
        run_id,
        input_sha256: prepared.input_sha256,
        source_manifest: input.source_manifest,
        original_decision: { file: safePath(ctx.root, original.path), sha256: original.sha256 },
        original_decision_sha256: originalSHA,
        revision_evidence: input.revision_evidence,
        validation_error: lastError.message,
        contract:
          "Read the current bound source, original draft, revision findings and your mixed response. Choose explicitly: keep_correction retains the already-written corrected draft verbatim, drops its dispute and requests the usual fresh independent review; keep_dispute abandons all proposed changes, retains the entire original native draft verbatim and keeps the already-written source-bound dispute. Neither option approves prose or changes the findings automatically. Do not add or rewrite prose here. If valid corrections and an unrelated finding coexist, they can be handled in separate native review cycles. The program never selects the branch for you.",
      }
      const resolutionRequest = {
        model: settings.model,
        schema,
        messages: [
          {
            role: "system",
            content:
              "Resolve only the explicit incompatible correction/dispute intentions against their exact source binding. Return an independent explicit choice and reason; never manufacture approval or modify source evidence." +
              sourceReferencePolicy,
          },
          { role: "user", content: JSON.stringify(resolutionInput) },
        ],
      }
      const resolvedResult = await state.stage(
        "correction-resolution-" + attempt,
        resolutionRequest,
        () => model.structured(resolutionRequest),
      )
      try {
        assertSchema(resolvedResult.output, schema)
        const choice = resolvedResult.output
        const { review_dispute, ...correction } = output
        output =
          choice.action === "keep_correction"
            ? correction
            : {
                ...output,
                draft: prepared.packet.draft.draft,
              }
        output = {
          ...output,
          reviewer: choice.reviewer,
          reviewed_at: choice.reviewed_at,
          reason: choice.reason,
        }
        timeSource = { stage: "correction-resolution-" + attempt, result: resolvedResult }
        assertSchema(output, request.schema)
        save(ctx.root, `runs/${run}/correction-resolution.json`, {
          schema: "research-writing-contract-resolution/v1",
          original,
          original_decision_sha256: originalSHA,
          input_sha256: prepared.input_sha256,
          explicit_model_choice: choice,
          resolution_result: ref(
            ctx.root,
            state.directory + "correction-resolution-" + attempt + ".json",
          ),
          selected_output_sha256: sha256(JSON.stringify(output)),
          program_generated_judgments: false,
        })
        resolved = true
        break
      } catch (error) {
        lastError = error
      }
    }
    if (!resolved) {
      const error = Error(
        "Explicit correction/dispute resolution remains invalid: " + lastError.message,
      )
      error.code = "CORRECTION_RESOLUTION_EXHAUSTED"
      throw error
    }
    assertCombinedReviewSources(ctx, prepared)
  }
  // Validate before freezing the native decision. A model can return a future
  // or otherwise invalid review time while its actual correction is sound.
  // Record the first observed failure so that resuming after the clock has
  // advanced cannot silently legitimize that earlier timestamp.
  const timeMarkerPath = `runs/${run}/correction-time-repair-required.json`
  const correctionResult = ref(ctx.root, state.directory + "correction.json")
  const timeSourceResult = ref(ctx.root, state.directory + timeSource.stage + ".json")
  const timeBounds = [
    ...prepared.packet.claims.map((claim) => claim.review?.reviewed_at),
    ...(review ? [review.reviewed_at] : []),
  ]
  const outputFingerprint = sha256(JSON.stringify(output))
  let timeMarker = readJSON(ctx.root, timeMarkerPath)
  if (!timeMarker) {
    try {
      assertCorrectionReviewTime(
        ctx,
        state,
        timeSource.stage,
        timeSource.result,
        output.reviewed_at,
        timeBounds,
      )
    } catch (error) {
      if (error.code !== "CORRECTION_TIME_INVALID") throw error
      const selected = save(ctx.root, `runs/${run}/correction-time-original-output.json`, output)
      timeMarker = {
        schema: "research-correction-time-repair-required/v1",
        input_sha256: prepared.input_sha256,
        original_output_sha256: outputFingerprint,
        original_output: selected,
        correction_result: correctionResult,
        time_source_result: timeSourceResult,
        invalid_reviewed_at: output.reviewed_at,
        validation_error: error.message,
        observed_at: new Date().toISOString(),
      }
      save(ctx.root, timeMarkerPath, timeMarker)
    }
  }
  if (timeMarker) {
    if (
      timeMarker.schema !== "research-correction-time-repair-required/v1" ||
      timeMarker.input_sha256 !== prepared.input_sha256 ||
      timeMarker.original_output_sha256 !== outputFingerprint ||
      !same(timeMarker.correction_result, correctionResult) ||
      !same(timeMarker.time_source_result, timeSourceResult) ||
      timeMarker.invalid_reviewed_at !== output.reviewed_at ||
      timeMarker.original_output?.path !== `runs/${run}/correction-time-original-output.json` ||
      ref(ctx.root, timeMarker.original_output.path).sha256 !== timeMarker.original_output.sha256
    )
      throw Error("Correction time repair binding changed")
    try {
      assertCorrectionReviewTime(
        ctx,
        state,
        timeSource.stage,
        timeSource.result,
        output.reviewed_at,
        timeBounds,
      )
    } catch (error) {
      if (error.code !== "CORRECTION_TIME_INVALID") throw error
    }
    const timeSchema = object({
      schema: fixed("research-correction-time-repair/v1"),
      input_sha256: fixed(prepared.input_sha256),
      original_output_sha256: fixed(outputFingerprint),
      reviewed_at: text,
      reviewer: text,
      reason: text,
    })
    let repaired = false,
      timeError = Error(timeMarker.validation_error)
    for (let attempt = 0; attempt < 2; attempt++) {
      const timeInput = {
        task: "combined_review_correction_time_repair",
        run_id,
        input_sha256: prepared.input_sha256,
        source_manifest: input.source_manifest,
        original_output: {
          file: safePath(ctx.root, timeMarker.original_output.path),
          sha256: timeMarker.original_output.sha256,
        },
        original_output_sha256: outputFingerprint,
        invalid_reviewed_at: timeMarker.invalid_reviewed_at,
        validation_error: timeError.message,
        attempt,
        ...(attempt
          ? {
              previous_repair: {
                file: safePath(
                  ctx.root,
                  state.directory + "correction-time-repair-" + (attempt - 1) + ".json",
                ),
                sha256: ref(
                  ctx.root,
                  state.directory + "correction-time-repair-" + (attempt - 1) + ".json",
                ).sha256,
              },
            }
          : {}),
      }
      const timeRequest = {
        model: settings.model,
        messages: [
          {
            role: "system",
            content:
              "Check the exact source-bound correction and explicitly supply only its valid actual review time, reviewer and reason. Use a real date or timestamp that is not in the future and is not before the reviewed facts. If previous_repair is present, read and verify it and correct only its stated error. Do not rewrite the draft, change factual judgments, or approve the article.",
          },
          { role: "user", content: JSON.stringify(timeInput) },
        ],
        schema: timeSchema,
      }
      const timeResult = await state.stage("correction-time-repair-" + attempt, timeRequest, () =>
        model.structured(timeRequest),
      )
      try {
        assertSchema(timeResult.output, timeSchema)
      } catch (error) {
        timeError = error
        continue
      }
      try {
        assertCorrectionReviewTime(
          ctx,
          state,
          "correction-time-repair-" + attempt,
          timeResult,
          timeResult.output.reviewed_at,
          timeBounds,
        )
      } catch (error) {
        if (error.code !== "CORRECTION_TIME_INVALID") throw error
        timeError = error
        continue
      }
      assertCombinedReviewSources(ctx, prepared)
      output = { ...output, reviewed_at: timeResult.output.reviewed_at }
      save(ctx.root, `runs/${run}/correction-time-repair-receipt.json`, {
        schema: "research-correction-time-repair-receipt/v1",
        input_sha256: prepared.input_sha256,
        original_output: timeMarker.original_output,
        original_output_sha256: outputFingerprint,
        repair_result: ref(
          ctx.root,
          state.directory + "correction-time-repair-" + attempt + ".json",
        ),
        reviewed_at: timeResult.output.reviewed_at,
        reviewer: timeResult.output.reviewer,
        reason: timeResult.output.reason,
        draft_or_factual_decisions_changed: false,
      })
      repaired = true
      break
    }
    if (!repaired) {
      const error = Error("Explicit correction time repair remains invalid: " + timeError.message)
      error.code = "CORRECTION_TIME_REPAIR_EXHAUSTED"
      throw error
    }
  }
  assertCombinedReviewSources(ctx, prepared)
  assertRevisionEvidence()
  const decision = save(ctx.root, `runs/${run}/correction-decision.json`, {
    draft_id: prepared.packet.draft.draft_id,
    ...output,
  })
  if (output.review_dispute) {
    if (!review || !same(output.draft, prepared.packet.draft.draft))
      throw Error("An editorial dispute must preserve the exact current draft")
    assertReviewDate(output.reviewed_at, { notBefore: [review.reviewed_at] })
    const record = {
      schema: "research-editorial-dispute-record/v1",
      input_sha256: prepared.input_sha256,
      draft: ref(ctx.root, `runs/${run_id}/draft.json`),
      manifest: prepared.manifest,
      decision,
      revision_evidence,
    }
    const file = prepared.base + "editorial-dispute.json",
      prior = readJSON(ctx.root, file)
    if (prior && !same(prior, record)) {
      const error = Error(
        "Editorial dispute reassessment exhausted for this exact draft; preserve both decisions",
      )
      error.code = "EDITORIAL_DISPUTE_EXHAUSTED"
      throw error
    }
    const dispute = save(ctx.root, file, record)
    readEditorialDispute(ctx, prepared)
    return {
      status: "review_disputed",
      dispute,
      draft_id: prepared.packet.draft.draft_id,
      draft_changed: false,
      candidate_published: false,
    }
  }
  return nativeResearch(
    ctx,
    "correct",
    { run_id, review_file: path.relative(ctx.repo, safePath(ctx.root, decision.path)) },
    { run_id: "run", review_file: "review" },
  )
}
