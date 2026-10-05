import fs from "node:fs"
import path from "node:path"
import { assertSchema, extractionSchema, sha256 } from "./contracts.mjs"
import { assertReviewDate } from "./dates.mjs"
import { loadCompletedExtraction } from "./extraction-checkpoint.mjs"
import { validateEvidence } from "./claims.mjs"
import { assertStoredEvidence, loadStoredSourceRun } from "./parser.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"
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

export const evaluationAdjudicationInputSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema",
    "case_id",
    "candidate_run",
    "reviewer",
    "reviewer_kind",
    "independent_human_review",
    "reviewed_at",
    "gold_fact_coverage",
    "manual_source_enrichment",
    "raw_model_pass",
    "notes",
  ],
  properties: {
    schema: { type: "string", enum: ["evaluation-source-adjudication-input/v1"] },
    case_id: identity,
    candidate_run: identity,
    reviewer: text,
    reviewer_kind: { type: "string", enum: ["human", "codex"] },
    independent_human_review: { type: "boolean" },
    reviewed_at: text,
    gold_fact_coverage: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fact_id", "coverage", "candidate_claim_ids", "reason"],
        properties: {
          fact_id: identity,
          coverage: { type: "string", enum: ["full", "partial", "missing"] },
          candidate_claim_ids: { type: "array", items: identity },
          reason: text,
        },
      },
    },
    manual_source_enrichment: { type: "boolean" },
    raw_model_pass: { type: "boolean" },
    notes: text,
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

// Read genuine model checkpoints through their existing integrity validators.
// A processing input selects that format even when its checkpoint is incomplete;
// never fall back to a legacy state or an editorially corrected claims copy.
function candidateCheckpoint(root, run, documents, parses) {
  const base = `runs/${run}/`
  const processed = fs.existsSync(safePath(root, base + "source-processing-input.json"))
  const statePath = base + (processed ? "processing/state.json" : "state.json")
  const stateBytes = fs.readFileSync(safePath(root, statePath))
  const state = JSON.parse(stateBytes.toString("utf8"))
  const claimsBytes = processed
    ? loadCompletedExtraction(root, run, documents, parses)
    : fs.readFileSync(safePath(root, base + "claims.json"))
  const claimsDocument = JSON.parse(claimsBytes.toString("utf8"))
  const stage = state.stages?.[processed ? "extraction" : "claims"]
  if (
    state.schema !== "research-run/v1" ||
    state.run_id !== run ||
    state.candidate_published !== false ||
    stage?.status !== "complete" ||
    (!processed &&
      (stage.result_path !== base + "claims.json" ||
        stage.result_hash !== sha256(JSON.stringify(claimsDocument)))) ||
    !Array.isArray(claimsDocument.claims) ||
    claimsDocument.claims.length === 0
  )
    throw Error("Completed unpublished source-bound candidate claims run required")
  return { processed, statePath, stateBytes, state, stage, claimsBytes, claimsDocument }
}

export async function importEvaluationCandidate(root, runId, caseId, candidateRun) {
  if (!/^[a-zA-Z0-9_-]+$/.test(runId || "")) throw Error("Invalid evaluation import run id")
  if (!/^[a-zA-Z0-9_-]+$/.test(candidateRun || "")) throw Error("Invalid candidate run id")
  return withLock(root, `evaluation-import-${caseId}`, async () => {
    const evaluationCase = loadEvaluationCase(root, caseId)
    const stored = loadStoredSourceRun(root, candidateRun)
    if (
      stored.identity.documents_sha256 !== evaluationCase.manifest.documents_sha256 ||
      stored.identity.parses_sha256 !== evaluationCase.manifest.parses_sha256
    )
      throw Error("Candidate source snapshot does not match the frozen evaluation case")

    const checkpoint = candidateCheckpoint(root, candidateRun, stored.documents, stored.parses)
    const claims = checkpoint.claimsDocument
    const budget = readJSON(root, `runs/${candidateRun}/model-policy/fact_extract/budget.json`)
    if (
      !["model-budget/v1", "model-budget/v2"].includes(budget?.schema) ||
      budget.binding?.role !== "fact_extract" ||
      typeof budget.binding.settings?.model !== "string" ||
      !Array.isArray(budget.attempts) ||
      budget.attempts.length === 0 ||
      budget.attempts.some(
        (attempt) =>
          attempt.status !== "complete" ||
          attempt.result?.provenance?.model !== budget.binding.settings.model ||
          (checkpoint.processed &&
            attempt.result?.provenance?.digest !== budget.binding.model_digest) ||
          !Number.isFinite(attempt.result?.provenance?.wall_ms) ||
          attempt.result.provenance.wall_ms < 0,
      )
    )
      throw Error("Complete fact-extraction model provenance required")

    const sourceDirectory = safePath(root, `runs/${candidateRun}`)
    const files = []
    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name)
        const metadata = fs.lstatSync(absolute)
        if (metadata.isSymbolicLink()) throw Error("Symlinks are not allowed in candidate run")
        if (metadata.isDirectory()) {
          walk(absolute)
          continue
        }
        if (!metadata.isFile()) throw Error("Unsupported file in candidate run")
        const relative = path.relative(sourceDirectory, absolute)
        if (relative.startsWith("..") || path.isAbsolute(relative))
          throw Error("Candidate run path escaped its root")
        files.push({
          relative,
          bytes: fs.readFileSync(safePath(root, `runs/${candidateRun}/${relative}`)),
        })
      }
    }
    walk(sourceDirectory)
    files.sort((a, b) => a.relative.localeCompare(b.relative))
    const fileRecords = []
    for (const file of files) {
      const relative = `runs/${candidateRun}/${file.relative}`
      const existingPath = safePath(evaluationCase.root, relative)
      if (fs.existsSync(existingPath)) {
        const existing = fs.readFileSync(existingPath)
        if (!existing.equals(file.bytes)) throw Error("Imported candidate run file changed")
      } else {
        atomicCreate(evaluationCase.root, relative, file.bytes)
      }
      fileRecords.push({
        path: file.relative,
        sha256: sha256(file.bytes),
        bytes: file.bytes.length,
      })
    }

    const copied = loadStoredSourceRun(evaluationCase.root, candidateRun)
    if (
      copied.identity.documents_sha256 !== evaluationCase.manifest.documents_sha256 ||
      copied.identity.parses_sha256 !== evaluationCase.manifest.parses_sha256
    )
      throw Error("Imported candidate source snapshot does not match the frozen evaluation case")
    const receipt = {
      schema: "evaluation-candidate-import/v1",
      run_id: runId,
      case_id: caseId,
      candidate_run: candidateRun,
      case_status: evaluationCase.manifest.status,
      case_split: evaluationCase.manifest.split,
      ...(checkpoint.processed ? { candidate_checkpoint: "source-processing-extraction/v1" } : {}),
      model: budget.binding.settings.model,
      provider: budget.binding.settings.provider ?? "ollama",
      source_documents_sha256: stored.identity.documents_sha256,
      source_parses_sha256: stored.identity.parses_sha256,
      candidate_run_sha256: sha256(JSON.stringify(fileRecords)),
      file_count: fileRecords.length,
      bytes_copied: fileRecords.reduce((total, file) => total + file.bytes, 0),
      claim_count: claims.claims.length,
      model_batch_count: budget.attempts.length,
      model_wall_ms: budget.attempts.reduce(
        (total, attempt) => total + attempt.result.provenance.wall_ms,
        0,
      ),
      candidate_published: false,
    }
    const relativeReceipt = `runs/${runId}/evaluation-candidate-${caseId}.json`
    const previous = readJSON(root, relativeReceipt)
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(receipt))
        throw Error("Evaluation candidate import inputs changed; use a new run id")
      return { ...receipt, idempotent: true }
    }
    atomicCreate(root, relativeReceipt, receipt)
    return { ...receipt, idempotent: false }
  })
}

// Aggregate only case metadata and source snapshot hashes for the private delivery dashboard.
// Multiple specification revisions over identical source bytes count as one evaluation example.
export function auditEvaluationCases(root, targets = { development: 40, heldout: 20 }) {
  const fixtureRoot = path.join(root, "evaluation", "fixtures")
  const caseIds = fs.existsSync(fixtureRoot)
    ? fs
        .readdirSync(fixtureRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : []
  const cases = []
  const invalid = []
  for (const caseId of caseIds) {
    try {
      const { manifest, specification, documents, parses } = loadEvaluationCase(root, caseId)
      cases.push({ manifest, specification, documents, parses })
    } catch (error) {
      invalid.push({ case_id: caseId, error: String(error.message || error) })
    }
  }

  const actual = cases.filter(({ specification }) => specification.origin === "actual-source")
  const groups = new Map()
  for (const item of actual) {
    const { manifest, specification } = item
    const snapshot = `${manifest.documents_sha256}:${manifest.parses_sha256}`
    const group = groups.get(snapshot) || { split: new Set(), cases: [] }
    group.split.add(specification.split)
    group.cases.push(item)
    groups.set(snapshot, group)
  }
  const conflictingSnapshots = [...groups.values()].filter((group) => group.split.size > 1).length
  const uniqueActual = [...groups.values()].filter((group) => group.split.size === 1)
  const splitCounts = Object.fromEntries(
    ["development", "heldout"].map((split) => [
      split,
      uniqueActual.filter((group) => group.split.has(split)).length,
    ]),
  )
  const countDimension = (selector) => {
    const values = uniqueActual.flatMap((group) => selector(group.cases[0].specification))
    return Object.fromEntries(
      [...new Set(values)]
        .sort()
        .map((value) => [value, values.filter((item) => item === value).length]),
    )
  }
  const sourceDocuments = new Map()
  for (const group of uniqueActual) {
    for (const document of group.cases[0].documents) {
      const key = `${document.source_version_id}:${document.body_sha256}`
      sourceDocuments.set(key, document)
    }
  }
  const caseDimension = (selector) => {
    const values = uniqueActual.flatMap((group) => selector(group.cases[0]))
    return Object.fromEntries(
      [...new Set(values)]
        .sort()
        .map((value) => [value, values.filter((item) => item === value).length]),
    )
  }
  const mediaType = (document) => {
    const mime = String(document.mime_type || "")
      .split(";")[0]
      .trim()
      .toLowerCase()
    if (mime === "application/pdf") return "pdf"
    if (mime === "text/html" || mime === "application/xhtml+xml") return "html"
    return mime || "unknown"
  }
  const hasKind = (kind) => (item) =>
    item.parses.some((parse) => parse.blocks.some((block) => block.kind === kind))
  const hasOcr = (item) =>
    item.parses.some(
      (parse) => Array.isArray(parse.quality?.ocr_pages) && parse.quality.ocr_pages.length > 0,
    )
  const allTargetCounts = Object.fromEntries(
    ["development", "heldout"].map((split) => [split, targets[split]]),
  )
  return {
    status:
      invalid.length || conflictingSnapshots ? "integrity_review_required" : "read_only_audit",
    target_cases: allTargetCounts,
    registered_case_revisions: cases.length,
    actual_source_case_revisions: actual.length,
    synthetic_case_revisions: cases.length - actual.length,
    unique_actual_source_snapshots: uniqueActual.length,
    unique_actual_by_split: splitCounts,
    progress_by_split: Object.fromEntries(
      Object.entries(splitCounts).map(([split, count]) => [
        split,
        { count, target: targets[split], remaining: Math.max(0, targets[split] - count) },
      ]),
    ),
    reviewer_kinds: Object.fromEntries(
      ["human", "codex"].map((kind) => [
        kind,
        uniqueActual.filter((group) => group.cases[0].specification.review.reviewer_kind === kind)
          .length,
      ]),
    ),
    independent_human_gold: uniqueActual.filter(
      (group) =>
        group.split.has("development") && group.cases[0].manifest.status === "independent_gold",
    ).length,
    heldout_independent_human: uniqueActual.filter(
      (group) =>
        group.split.has("heldout") && group.cases[0].manifest.status === "independent_gold",
    ).length,
    dimensions: {
      languages: countDimension((spec) => spec.languages),
      sectors: countDimension((spec) => spec.sectors),
      article_kinds: countDimension((spec) => [spec.article_kind]),
      document_scopes: countDimension((spec) => [spec.document_scope]),
      unique_documents_by_media_type: Object.fromEntries(
        [...new Set([...sourceDocuments.values()].map(mediaType))]
          .sort()
          .map((value) => [
            value,
            [...sourceDocuments.values()].filter((document) => mediaType(document) === value)
              .length,
          ]),
      ),
      parser_engines: caseDimension((item) => [
        ...new Set(item.parses.map((parse) => parse.parser?.id || "unknown")),
      ]),
      cases_with_tables: uniqueActual.filter((group) => hasKind("table")(group.cases[0])).length,
      cases_with_headings: uniqueActual.filter((group) => hasKind("heading")(group.cases[0]))
        .length,
      cases_with_ocr_pages: uniqueActual.filter((group) => hasOcr(group.cases[0])).length,
      pdf_cases: uniqueActual.filter((group) =>
        group.cases[0].documents.some((document) => mediaType(document) === "pdf"),
      ).length,
    },
    duplicate_source_snapshot_revisions:
      actual.length -
      new Set(
        actual.map(({ manifest }) => `${manifest.documents_sha256}:${manifest.parses_sha256}`),
      ).size,
    conflicting_split_snapshots: conflictingSnapshots,
    invalid_cases: invalid,
    candidate_published: false,
    public_verified: false,
  }
}

function countBy(values) {
  return Object.fromEntries(
    [...new Set(values)]
      .sort()
      .map((value) => [value, values.filter((item) => item === value).length]),
  )
}

export async function saveEvaluationAdjudication(root, runId, caseId, candidateRun, input) {
  if (!/^[a-zA-Z0-9_-]+$/.test(runId || "")) throw Error("Invalid evaluation review run id")
  if (!/^[a-zA-Z0-9_-]+$/.test(candidateRun || "")) throw Error("Invalid candidate run id")
  if (caseId !== input?.case_id || candidateRun !== input?.candidate_run)
    throw Error("Review case and candidate run must match the command inputs")
  assertSchema(input, evaluationAdjudicationInputSchema)
  if (input.independent_human_review && input.reviewer_kind !== "human")
    throw Error("Independent human adjudication requires a human reviewer")

  return withLock(root, `evaluation-adjudication-${runId}`, async () => {
    const evaluationCase = loadEvaluationCase(root, caseId)
    const { manifest, specification, documents, parses } = evaluationCase
    const fixtureRoot = evaluationCase.root
    const relativeRun = `runs/${candidateRun}`
    const checkpoint = candidateCheckpoint(fixtureRoot, candidateRun, documents, parses)
    const runStateBytes = checkpoint.stateBytes
    const claimsBytes = checkpoint.claimsBytes
    const claims = checkpoint.claimsDocument.claims

    const expectedFactIds = specification.facts.map((fact) => fact.fact_id).sort()
    const reviewedFactIds = input.gold_fact_coverage.map((fact) => fact.fact_id).sort()
    if (
      new Set(reviewedFactIds).size !== reviewedFactIds.length ||
      JSON.stringify(expectedFactIds) !== JSON.stringify(reviewedFactIds)
    )
      throw Error("Adjudication must cover each frozen gold fact exactly once")
    const claimsById = new Map(claims.map((claim) => [claim.claim_id, claim]))
    if (claimsById.size !== claims.length || claims.some((claim) => !claim.claim_id))
      throw Error("Candidate claim ids must be unique and present")
    for (const fact of input.gold_fact_coverage) {
      if (new Set(fact.candidate_claim_ids).size !== fact.candidate_claim_ids.length)
        throw Error(`Duplicate candidate claim mapping for gold fact ${fact.fact_id}`)
      if (fact.candidate_claim_ids.some((id) => !claimsById.has(id)))
        throw Error(`Unknown candidate claim mapped to gold fact ${fact.fact_id}`)
      if (fact.coverage === "missing" && fact.candidate_claim_ids.length !== 0)
        throw Error(`Missing gold fact ${fact.fact_id} cannot map candidate claims`)
      if (fact.coverage !== "missing" && fact.candidate_claim_ids.length === 0)
        throw Error(`Covered gold fact ${fact.fact_id} requires a candidate claim`)
    }

    const structuralResults = claims.map((claim) => ({
      claim,
      result: validateEvidence(claim, parses),
    }))
    const structuralFailureCodes = countBy(
      structuralResults.flatMap(({ result }) => result.problems),
    )
    const semanticCoverage = {
      full: input.gold_fact_coverage.filter((fact) => fact.coverage === "full").length,
      partial: input.gold_fact_coverage.filter((fact) => fact.coverage === "partial").length,
      missing: input.gold_fact_coverage.filter((fact) => fact.coverage === "missing").length,
    }
    if (
      input.raw_model_pass &&
      (structuralResults.some(({ result }) => !result.structural_pass) ||
        semanticCoverage.partial > 0 ||
        semanticCoverage.missing > 0)
    )
      throw Error("Raw model pass requires structurally supported claims and full gold coverage")

    const budgetPath = `${relativeRun}/model-policy/fact_extract/budget.json`
    const budgetBytes = fs.readFileSync(safePath(fixtureRoot, budgetPath))
    const budget = JSON.parse(budgetBytes.toString("utf8"))
    if (
      !["model-budget/v1", "model-budget/v2"].includes(budget.schema) ||
      budget.binding?.role !== "fact_extract" ||
      !Array.isArray(budget.attempts) ||
      budget.attempts.length === 0 ||
      budget.attempts.some(
        (attempt) =>
          attempt.status !== "complete" ||
          attempt.result?.provenance?.model !== budget.binding.settings?.model ||
          attempt.result?.provenance?.digest !== budget.binding.model_digest ||
          !Number.isFinite(attempt.result?.provenance?.wall_ms),
      )
    )
      throw Error("Complete model provenance for every extraction batch required")
    const modelWallTimes = budget.attempts.map((attempt) => attempt.result.provenance.wall_ms)
    const startedAt = Date.parse(checkpoint.stage.started_at)
    const finishedAt = Date.parse(checkpoint.stage.finished_at)
    if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt < startedAt)
      throw Error("Valid candidate extraction timestamps required")
    assertReviewDate(input.reviewed_at, {
      notBefore: [checkpoint.stage.finished_at],
    })

    const inputSha256 = sha256(JSON.stringify(input))
    const receipt = {
      schema: "evaluation-source-adjudication/v1",
      run_id: runId,
      case_id: caseId,
      case_status: manifest.status,
      case_split: manifest.split,
      candidate_run: candidateRun,
      ...(checkpoint.processed ? { candidate_checkpoint: "source-processing-extraction/v1" } : {}),
      reviewer: input.reviewer,
      reviewer_kind: input.reviewer_kind,
      independent_human_review: input.independent_human_review,
      reviewed_at: input.reviewed_at,
      candidate_claim_count: claims.length,
      structural_pass_count: structuralResults.filter(({ result }) => result.structural_pass)
        .length,
      structural_failure_codes: structuralFailureCodes,
      gold_fact_coverage: input.gold_fact_coverage,
      semantic_coverage: semanticCoverage,
      manual_source_enrichment: input.manual_source_enrichment,
      raw_model_pass: input.raw_model_pass,
      public_approved: false,
      provenance: {
        model: budget.binding.settings.model,
        digest: budget.binding.model_digest,
        runtime: budget.binding.runtime,
        settings: budget.binding.settings,
        policy_sha256: budget.binding.policy_sha256,
        batch_count: modelWallTimes.length,
        batch_wall_ms: modelWallTimes,
        total_model_wall_ms: modelWallTimes.reduce((total, duration) => total + duration, 0),
        run_elapsed_ms: finishedAt - startedAt,
      },
      inputs: {
        input_sha256: inputSha256,
        fixture_manifest_sha256: sha256(JSON.stringify(manifest)),
        gold_sha256: manifest.gold_sha256,
        candidate_run_state_sha256: sha256(runStateBytes),
        candidate_claims_sha256: sha256(claimsBytes),
        model_budget_sha256: sha256(budgetBytes),
      },
      notes: input.notes,
    }
    const output = `evaluation/runs/${runId}/source-review.json`
    const existing = readJSON(root, output)
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(receipt))
        throw Error("Evaluation adjudication output exists with different evidence")
      return {
        path: output,
        sha256: sha256(fs.readFileSync(safePath(root, output))),
        idempotent: true,
        candidate_claim_count: receipt.candidate_claim_count,
        structural_pass_count: receipt.structural_pass_count,
        semantic_coverage: receipt.semantic_coverage,
        public_approved: false,
      }
    }
    const saved = atomicCreate(root, output, receipt)
    return {
      path: output,
      sha256: saved.sha256,
      idempotent: false,
      candidate_claim_count: receipt.candidate_claim_count,
      structural_pass_count: receipt.structural_pass_count,
      semantic_coverage: receipt.semantic_coverage,
      public_approved: false,
    }
  })
}
