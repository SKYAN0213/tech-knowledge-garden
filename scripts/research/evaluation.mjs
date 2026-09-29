import fs from "node:fs"
import path from "node:path"
import { assertSchema, extractionSchema, sha256 } from "./contracts.mjs"
import { assertReviewDate } from "./dates.mjs"
import { validateEvidence } from "./claims.mjs"
import { assertStoredEvidence, loadStoredSourceRun } from "./parser.mjs"
import { atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"
import { SECTORS } from "../sectors.mjs"
import { DEEP_KINDS } from "../editorial.mjs"

const text = { type: "string", minLength: 1 }
const identity = { type: "string", pattern: "^[a-zA-Z0-9_-]+$", minLength: 1 }
const explanation = {
  type: "object",
  additionalProperties: false,
  required: ["id", "text", "fact_ids"],
  properties: {
    id: identity,
    text,
    fact_ids: { type: "array", minItems: 1, items: identity },
  },
}
export const evaluationSpecSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema",
    "case_id",
    "origin",
    "split",
    "event_id",
    "sectors",
    "languages",
    "article_kind",
    "document_scope",
    "review",
    "facts",
    "required_explanations",
    "forbidden_transformations",
  ],
  properties: {
    schema: { type: "string", enum: ["evaluation-spec/v1"] },
    case_id: identity,
    supersedes: identity,
    origin: { type: "string", enum: ["actual-source", "synthetic-fixture"] },
    split: { type: "string", enum: ["development", "heldout"] },
    event_id: { type: ["string", "null"], pattern: "^[a-f0-9]{16}$" },
    sectors: { type: "array", minItems: 1, items: { type: "string", enum: SECTORS } },
    languages: { type: "array", minItems: 1, items: text },
    article_kind: { type: "string", enum: ["사건 뉴스", ...DEEP_KINDS] },
    document_scope: { type: "string", enum: ["full_document", "abstract_only", "partial"] },
    review: {
      type: "object",
      additionalProperties: false,
      required: [
        "reviewer",
        "reviewer_kind",
        "reviewed_at",
        "source_read",
        "candidate_output_seen",
        "independent_of_candidate_output",
        "notes",
      ],
      properties: {
        reviewer: text,
        reviewer_kind: { type: "string", enum: ["human", "codex"] },
        reviewed_at: text,
        source_read: { type: "boolean", enum: [true] },
        candidate_output_seen: { type: "boolean" },
        independent_of_candidate_output: { type: "boolean" },
        notes: text,
      },
    },
    facts: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fact_id", "importance", "claim"],
        properties: {
          fact_id: identity,
          importance: { type: "string", enum: ["core", "supporting"] },
          claim: extractionSchema.properties.claims.items,
        },
      },
    },
    required_explanations: { type: "array", items: explanation },
    forbidden_transformations: { type: "array", items: explanation },
  },
}

function unique(values, label) {
  if (new Set(values).size !== values.length) throw Error(`Unique ${label} required`)
}
function assertSpecification(spec, documents, parses) {
  assertSchema(spec, evaluationSpecSchema)
  if (!spec.case_id.trim() || !spec.review.reviewer.trim() || !spec.review.notes.trim())
    throw Error("Nonempty case and review provenance required")
  unique(spec.sectors, "sectors")
  unique(spec.languages, "languages")
  unique(
    spec.facts.map((f) => f.fact_id),
    "fact ids",
  )
  const known = new Set(spec.facts.map((f) => f.fact_id))
  for (const field of ["required_explanations", "forbidden_transformations"]) {
    unique(
      spec[field].map((e) => e.id),
      field,
    )
    for (const item of spec[field]) {
      unique(item.fact_ids, "explanation fact references")
      if (!item.text.trim() || item.fact_ids.some((id) => !known.has(id)))
        throw Error("Explanation must reference known, source-reviewed facts")
    }
  }
  if (spec.review.candidate_output_seen && spec.review.independent_of_candidate_output)
    throw Error("An exposed candidate output cannot be independently reviewed")
  if (
    spec.split === "heldout" &&
    (spec.origin !== "actual-source" ||
      spec.review.candidate_output_seen ||
      !spec.review.independent_of_candidate_output)
  )
    throw Error("Held-out cases require unexposed actual-source review")
  if (spec.article_kind === "논문 해설" && spec.document_scope !== "full_document")
    throw Error("Abstract-only or partial papers cannot be full-paper analysis cases")
  assertReviewDate(spec.review.reviewed_at, {
    notBefore: [
      ...documents.map((d) => d.observed_at),
      ...spec.facts.map((f) => f.claim.published_at),
    ],
  })
  for (const fact of spec.facts) {
    const result = validateEvidence(fact.claim, parses)
    if (!result.structural_pass)
      throw Error(`Invalid source-reviewed fact ${fact.fact_id}: ${result.problems.join(", ")}`)
  }
  return spec
}

// Freeze source-first expectations without invoking a model or changing authoring files.
// Codex direct reading is kept separate from attested independent human review.
export async function saveEvaluationCase(root, runId, sourceRun, spec) {
  if (!/^[a-zA-Z0-9_-]+$/.test(runId || "")) throw Error("Invalid evaluation import run id")
  assertSchema(spec, evaluationSpecSchema)
  return withLock(root, "evaluation-case-" + spec.case_id, async () => {
    const stored = loadStoredSourceRun(root, sourceRun)
    assertSpecification(spec, stored.documents, stored.parses)
    if (spec.supersedes) {
      const previous = loadEvaluationCase(root, spec.supersedes)
      if (
        spec.supersedes === spec.case_id ||
        previous.manifest.documents_sha256 !== stored.identity.documents_sha256 ||
        previous.manifest.parses_sha256 !== stored.identity.parses_sha256
      )
        throw Error("Superseded case must be a different case using the same exact source snapshot")
    }
    const specification_sha256 = sha256(JSON.stringify(spec))
    const directory = `evaluation/fixtures/${spec.case_id}`
    const goldPath = `evaluation/gold/${spec.case_id}.json`
    const caseRoot = safePath(root, directory)
    const existing = readJSON(root, `${directory}/manifest.json`)
    if (existing) {
      if (
        existing.specification_sha256 !== specification_sha256 ||
        existing.documents_sha256 !== stored.identity.documents_sha256 ||
        existing.parses_sha256 !== stored.identity.parses_sha256
      )
        throw Error("Evaluation case input changed; use a new case id")
      loadEvaluationCase(root, spec.case_id)
    } else {
      for (const doc of stored.documents)
        atomicWrite(caseRoot, doc.body_path, fs.readFileSync(safePath(root, doc.body_path)))
      for (const parse of stored.parses)
        atomicWrite(caseRoot, `parses/${parse.parse_id}/parse.json`, parse)
      atomicWrite(caseRoot, "runs/source/documents.json", stored.documents)
      atomicWrite(caseRoot, "runs/source/parses.json", stored.parses)
      const status =
        spec.origin === "synthetic-fixture"
          ? "synthetic"
          : spec.review.reviewer_kind === "human" &&
              spec.review.independent_of_candidate_output &&
              !spec.review.candidate_output_seen
            ? "independent_gold"
            : "source_reviewed_candidate"
      const gold = { schema: "evaluation-gold/v1", status, specification: spec }
      const incompleteGold = readJSON(root, goldPath)
      if (incompleteGold && sha256(JSON.stringify(incompleteGold)) !== sha256(JSON.stringify(gold)))
        throw Error("Incomplete evaluation case input changed; use a new case id")
      atomicWrite(root, goldPath, gold)
      atomicWrite(root, `${directory}/manifest.json`, {
        schema: "evaluation-fixture/v1",
        case_id: spec.case_id,
        source_run: sourceRun,
        specification_sha256,
        documents_sha256: stored.identity.documents_sha256,
        parses_sha256: stored.identity.parses_sha256,
        gold_sha256: sha256(JSON.stringify(gold)),
        gold_path: goldPath,
        status,
        split: spec.split,
        origin: spec.origin,
        source_count: stored.documents.length,
        fact_count: spec.facts.length,
        created_at: new Date().toISOString(),
        candidate_published: false,
      })
    }
    const { manifest } = loadEvaluationCase(root, spec.case_id)
    const receipt = {
      case_id: spec.case_id,
      status: manifest.status,
      specification_sha256,
      source_count: manifest.source_count,
      fact_count: manifest.fact_count,
      model_evaluated: false,
      candidate_published: false,
    }
    atomicWrite(root, `runs/${runId}/evaluation-case-${spec.case_id}.json`, receipt)
    return receipt
  })
}

export function loadEvaluationCase(root, caseId) {
  if (typeof caseId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(caseId))
    throw Error("Invalid evaluation case id")
  const directory = `evaluation/fixtures/${caseId}`
  const manifest = readJSON(root, `${directory}/manifest.json`)
  const gold = readJSON(root, `evaluation/gold/${caseId}.json`)
  if (
    !manifest ||
    manifest.schema !== "evaluation-fixture/v1" ||
    manifest.case_id !== caseId ||
    manifest.gold_path !== `evaluation/gold/${caseId}.json` ||
    !gold ||
    sha256(JSON.stringify(gold)) !== manifest.gold_sha256
  )
    throw Error("Evaluation case manifest/gold mismatch")
  const caseRoot = safePath(root, directory)
  const { documents, parses, identity } = loadStoredSourceRun(caseRoot, "source")
  if (
    identity.documents_sha256 !== manifest.documents_sha256 ||
    identity.parses_sha256 !== manifest.parses_sha256
  )
    throw Error("Evaluation source snapshot changed")
  const { status, specification: spec } = gold
  assertSpecification(spec, documents, parses)
  if (sha256(JSON.stringify(spec)) !== manifest.specification_sha256 || status !== manifest.status)
    throw Error("Evaluation expectations changed")
  assertStoredEvidence(caseRoot, documents, parses)
  return { manifest, specification: spec, documents, parses, root: path.resolve(caseRoot) }
}
