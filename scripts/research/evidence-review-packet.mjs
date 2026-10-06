import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { assessEvidenceCheckpoint } from "./evidence-assessment.mjs"
import { assessWindowEvidenceCheckpoint } from "./window-evidence-assessment.mjs"
import { validateEvidence, recordFactReview, assertVerifiedClaim } from "./claims.mjs"
import { loadStoredSourceRun } from "./parser.mjs"
import { atomicCreate, readJSON, safePath } from "./run-state.mjs"

const normalized = (text) =>
  text.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US")
function titleOnlySubject(claim, parses) {
  const subject = normalized(claim.subject)
  const escaped = subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(
    (/^[a-z0-9]/.test(subject) ? "(^|[^\\p{L}\\p{N}])" : "") +
      escaped +
      (/[a-z0-9]$/.test(subject) ? "(?=$|[^\\p{L}\\p{N}])" : ""),
    "u",
  )
  const relevant = parses.filter((p) => claim.evidence.some((e) => e.parse_id === p.parse_id))
  const titles = relevant.filter((p) => pattern.test(normalized(p.title || "")))
  if (
    !titles.length ||
    relevant.some((p) =>
      p.blocks.some(
        (b) => normalized(b.text) !== normalized(p.title || "") && pattern.test(normalized(b.text)),
      ),
    )
  )
    return null
  return {
    reason: "subject_only_in_title",
    subject: claim.subject,
    parse_ids: titles.map((p) => p.parse_id),
  }
}
const needsResolution = (row) =>
  row.model_assessment.requires_attention || Boolean(row.identity_attention)

export function isProcessedRun(root, run) {
  const base = `runs/${run}/`
  return Boolean(
    readJSON(root, base + "source-processing-input.json") ||
    readJSON(root, base + "fact-review-packet.json") ||
    readJSON(root, base + "processing/state.json") ||
    readJSON(root, base + "claims.json")?.source_processing,
  )
}

// Use the same assessment validator without a generation-capable provider.
// Source review must remain possible without starting a model or editing its
// immutable output, and cannot manufacture a missing assessment checkpoint.
export async function loadBoundAssessment(root, run, claims, documents, parses) {
  const base = `runs/${run}/`
  const input = readJSON(root, base + "evidence-assessment/input.json")
  const record = readJSON(root, base + "evidence-assessment/assessment.json")
  const ledger = readJSON(root, base + "model-policy/evidence_compare/budget.json")
  if (!input || !record || !ledger) throw Error("Completed bound evidence assessment required")
  const { sha256: seal, ...payload } = ledger
  if (seal !== sha256(JSON.stringify(payload))) throw Error("Assessment role ledger changed")
  const provider = {
    executionPolicy: ledger.binding,
    structured: async () => {
      throw Error("Missing assessment checkpoint; compare evidence first")
    },
  }
  const assess =
    input.schema === "research-window-evidence-assessment-input/v1"
      ? assessWindowEvidenceCheckpoint
      : assessEvidenceCheckpoint
  const result = await assess(root, run, provider, claims, documents, parses, {
    claimsPerBatch: input.claims_per_batch,
    responseProtocol: input.response_protocol || "verbatim-quote/v1",
    readOnly: true,
    reuseRun: input.reuse_run,
  })
  if (result.generated_batches !== 0) throw Error("Assessment reader cannot generate results")
  return result.record
}

export function factReviewPacket(run, input, extracted, documents, parses, assessment) {
  return {
    schema: "research-fact-review-packet/v1",
    run,
    source_run: input.source_run,
    input_sha256: sha256(JSON.stringify(input)),
    claims_sha256: sha256(JSON.stringify(extracted.claims)),
    documents_sha256: sha256(JSON.stringify(documents)),
    parses_sha256: sha256(JSON.stringify(parses)),
    assessment: {
      run: input.assessment_run,
      record_sha256: sha256(JSON.stringify(assessment)),
      input_sha256: assessment.input_sha256,
    },
    sources: parses.map((parse) => ({
      ...parse,
      original_url: documents.find(
        (document) => document.source_version_id === parse.source_version_id,
      ).original_url,
    })),
    claims: extracted.claims.map((claim) => {
      const attention = titleOnlySubject(claim, parses)
      return {
        claim,
        structural: validateEvidence(claim, parses),
        model_assessment: assessment.assessments.find((row) => row.claim_id === claim.claim_id),
        ...(attention ? { identity_attention: attention } : {}),
      }
    }),
    requires_explicit_review: true,
    public_approved: false,
  }
}

export async function loadFactReviewPacket(root, run) {
  const base = `runs/${run}/`
  const input = readJSON(root, base + "source-processing-input.json")
  if (!input) throw Error("Source processing input required")
  const source = loadStoredSourceRun(root, run)
  const extracted = readJSON(root, base + "claims.json")
  if (
    extracted?.source_processing?.run !== run ||
    extracted.source_processing.input_sha256 !== sha256(JSON.stringify(input))
  )
    throw Error("Processing claim origin changed")
  const assessment = await loadBoundAssessment(
    root,
    input.assessment_run,
    extracted?.claims,
    source.documents,
    source.parses,
  )
  const expected = factReviewPacket(
    run,
    input,
    extracted,
    source.documents,
    source.parses,
    assessment,
  )
  const bytes = fs.readFileSync(safePath(root, base + "fact-review-packet.json"))
  const packet = JSON.parse(bytes)
  const receipt = readJSON(root, base + "fact-review-packet-checkpoint.json")
  if (
    !receipt ||
    receipt.packet_sha256 !== sha256(bytes) ||
    JSON.stringify(packet) !== JSON.stringify(expected)
  )
    throw Error("Fact review packet or source binding changed")
  return { packet, packet_sha256: sha256(bytes), extracted, ...source }
}

function validateAcknowledgment(context, decision) {
  const acknowledgment = decision.model_assessment
  if (
    acknowledgment?.packet_sha256 !== context.packet_sha256 ||
    !Array.isArray(acknowledgment.resolutions) ||
    Object.keys(acknowledgment).some((key) => !["packet_sha256", "resolutions"].includes(key)) ||
    new Set(acknowledgment.resolutions.map((row) => row.claim_id)).size !==
      acknowledgment.resolutions.length
  )
    throw Error("Explicit acknowledgment of the exact fact review packet required")
  for (const resolution of acknowledgment.resolutions) {
    const row = context.packet.claims.find((entry) => entry.claim.claim_id === resolution.claim_id)
    const reviewed = decision.claims?.find((entry) => entry.claim_id === resolution.claim_id)
    if (
      !row ||
      !needsResolution(row) ||
      reviewed?.status !== "verified" ||
      !["corrected", "confirmed"].includes(resolution.outcome) ||
      typeof resolution.reason !== "string" ||
      !resolution.reason.trim() ||
      !Array.isArray(resolution.evidence) ||
      !resolution.evidence.length ||
      Object.keys(resolution).some(
        (key) => !["claim_id", "outcome", "reason", "evidence"].includes(key),
      ) ||
      (resolution.outcome === "corrected" && !Object.keys(reviewed.replacement || {}).length) ||
      (resolution.outcome === "confirmed" && reviewed.replacement)
    )
      throw Error("Concrete source resolution required for a verified assessment concern")
    for (const citation of resolution.evidence) {
      const block = context.parses
        .find((p) => p.parse_id === citation.parse_id)
        ?.blocks.find((b) => b.block_id === citation.block_id)
      if (
        !block ||
        typeof citation.quote !== "string" ||
        !citation.quote.trim() ||
        !block.text.includes(citation.quote) ||
        !row.claim.evidence.some((e) => e.parse_id === citation.parse_id)
      )
        throw Error("Assessment resolution quote must match the exact source")
    }
  }
  for (const row of context.packet.claims) {
    const reviewed = decision.claims?.find((entry) => entry.claim_id === row.claim.claim_id)
    if (
      reviewed?.status === "verified" &&
      needsResolution(row) &&
      !acknowledgment.resolutions.some((entry) => entry.claim_id === row.claim.claim_id)
    )
      throw Error("Resolve each verified assessment concern explicitly")
  }
}

export async function reviewProcessedClaims(root, run, decision) {
  const context = await loadFactReviewPacket(root, run)
  validateAcknowledgment(context, decision)
  const claims = recordFactReview(
    context.extracted.claims,
    decision.claims,
    decision,
    context.parses,
  )
  const envelope = {
    ...context.extracted,
    claims,
    model_assessment_review: {
      schema: "research-assessment-review/v1",
      packet_sha256: context.packet_sha256,
      decision_sha256: sha256(JSON.stringify(decision)),
      input_claims_sha256: context.packet.claims_sha256,
    },
  }
  const base = `runs/${run}/`
  const current = readJSON(root, base + "reviewed-claims.json")
  const priorDecision = readJSON(root, base + "fact-review-decision.json")
  if (current || priorDecision) {
    if (
      JSON.stringify(current) !== JSON.stringify(envelope) ||
      JSON.stringify(priorDecision) !== JSON.stringify(decision)
    )
      throw Error("Processing review changed; preserve it and use a new run")
  } else {
    atomicCreate(root, base + "fact-review-decision.json", decision)
    atomicCreate(root, base + "reviewed-claims.json", envelope)
  }
  return envelope
}

export async function assertProcessedFactReview(root, run, reviewed) {
  if (!isProcessedRun(root, run)) return
  const decision = readJSON(root, `runs/${run}/fact-review-decision.json`)
  if (!decision || !reviewed) throw Error("Complete explicit processing fact review first")
  const current = await reviewProcessedClaims(root, run, decision)
  if (JSON.stringify(current) !== JSON.stringify(reviewed))
    throw Error("Processing fact review changed")
  const source = loadStoredSourceRun(root, run)
  current.claims
    .filter((claim) => claim.review.status === "verified")
    .forEach((claim) => assertVerifiedClaim(claim, source.parses))
}
