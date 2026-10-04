import fs from "node:fs"
import { sha256, assertSchema, extractionSchema } from "./contracts.mjs"
import {
  extractClaims,
  extractionCandidateKey,
  extractionBudget,
  validateEvidence,
} from "./claims.mjs"
import { loadStoredSourceRun, assertStoredEvidence } from "./parser.mjs"
import { prepareRoleProvider, resolveRolePolicy } from "./model-policy.mjs"
import { Ollama, localOllamaURL } from "./ollama.mjs"
import { assessEvidenceCheckpoint } from "./evidence-assessment.mjs"
import {
  factReviewPacket,
  loadBoundAssessment,
  loadFactReviewPacket,
  reviewProcessedClaims,
  assertProcessedFactReview,
} from "./evidence-review-packet.mjs"
import { writeDraftCheckpoint, loadBoundDraftCheckpoint } from "./draft-checkpoint.mjs"
import { draftMarkdown } from "./editor.mjs"
import { loadProcessedDraft } from "./processed-draft.mjs"
import { loadCurrentApproval } from "./preview.mjs"
import { atomicCreate, readJSON, safePath, RunState, withLock } from "./run-state.mjs"

function createOnce(root, relative, value) {
  const current = readJSON(root, relative)
  if (current) {
    if (JSON.stringify(current) !== JSON.stringify(value))
      throw Error("Processing artifact changed: " + relative)
    return
  }
  atomicCreate(root, relative, value)
}

function candidatesFromExtraction(extracted, candidateKey, parses) {
  if (
    !extracted?.provenance ||
    !Array.isArray(extracted.claims) ||
    !extracted.claims.length ||
    extracted.development_fixture
  )
    throw Error("Real extracted candidates and provenance required")
  const fields = Object.keys(extractionSchema.properties.claims.items.properties)
  const ids = new Set()
  const claims = extracted.claims.map((claim) => {
    assertSchema(
      { claims: [Object.fromEntries(fields.map((key) => [key, claim[key]]))] },
      extractionSchema,
    )
    if (
      claim.candidate_key !== candidateKey ||
      claim.claim_id !==
        sha256(JSON.stringify([candidateKey, claim.statement, claim.evidence])).slice(0, 24) ||
      ids.has(claim.claim_id)
    )
      throw Error("Original extraction identity required before source processing")
    ids.add(claim.claim_id)
    // Retain structurally failing candidates for review; never drop an error or
    // inherit an earlier verification when reusing extraction instead of tokens.
    return { ...claim, event_id: null, review: validateEvidence(claim, parses) }
  })
  return { ...extracted, claims, requires_fact_review: true }
}

export async function processSourceRun({
  root,
  run,
  sourceRun,
  policyFile = "data/research-model-policy.json",
  assessmentRun,
  draftRun,
  evidenceThink,
  reviewFile,
  provider,
  candidateKey: requestedCandidateKey,
}) {
  if (
    [run, sourceRun, assessmentRun ?? run, draftRun ?? run].some(
      (id) => !/^[A-Za-z0-9_-]{1,160}$/.test(id || ""),
    ) ||
    run === sourceRun
  )
    throw Error("Distinct source and processing runs required")
  return withLock(root, "run-" + run, async () => {
    const { documents, parses, identity } = loadStoredSourceRun(root, sourceRun)
    const sourceExtractionPath = safePath(root, `runs/${sourceRun}/claims.json`)
    const sourceExtractionBytes = fs.existsSync(sourceExtractionPath)
      ? fs.readFileSync(sourceExtractionPath)
      : null
    const sourceExtraction = sourceExtractionBytes ? JSON.parse(sourceExtractionBytes) : null
    if (sourceExtraction?.development_fixture)
      throw Error("Development fixtures cannot enter source processing")
    const sourceManifest =
      readJSON(root, `runs/${sourceRun}/source-bundle.json`) ||
      readJSON(root, `runs/${sourceRun}/source-selection.json`)
    const candidateKey = extractionCandidateKey(documents, {
      candidateKey: requestedCandidateKey ?? sourceExtraction?.claims?.[0]?.candidate_key,
      explicitlyGrouped: Boolean(
        sourceManifest &&
        sourceManifest.documents_sha256 === identity.documents_sha256 &&
        sourceManifest.parses_sha256 === identity.parses_sha256,
      ),
    })
    const policy = JSON.parse(fs.readFileSync(policyFile, "utf8"))
    for (const role of ["fact_extract", "evidence_compare", "article_write"])
      if (resolveRolePolicy(policy, role).provider !== "ollama")
        throw Error("Source processing requires local Ollama roles")
    const overrides = evidenceThink === undefined ? {} : { think: evidenceThink }
    resolveRolePolicy(policy, "evidence_compare", overrides)
    const baseProvider =
      provider ||
      new Ollama({
        url:
          process.env.TECH_KNOWLEDGE_OLLAMA_URL ?? policy.runtime?.ollama_url ?? localOllamaURL(),
      })
    const input = {
      schema: "research-source-processing-input/v1",
      source_run: sourceRun,
      source_identity: identity,
      source_extraction_sha256: sourceExtractionBytes ? sha256(sourceExtractionBytes) : null,
      candidate_key: candidateKey,
      assessment_run: assessmentRun ?? run,
      draft_run: draftRun ?? run,
      policy_sha256: sha256(JSON.stringify(policy)),
      evidence_overrides: overrides,
      implementation: Object.fromEntries(
        [
          "source-processing.mjs",
          "evidence-review-packet.mjs",
          "processed-draft.mjs",
          "claims.mjs",
          "evidence-assessment.mjs",
          "source-context.mjs",
          "draft-checkpoint.mjs",
          "editor.mjs",
          "model-policy.mjs",
          "parser.mjs",
          "contracts.mjs",
        ].map((file) => [file, sha256(fs.readFileSync(new URL(file, import.meta.url)))]),
      ),
    }
    const base = `runs/${run}/`
    if (
      !readJSON(root, base + "source-processing-input.json") &&
      ["claims.json", "reviewed-claims.json", "draft.json", "approved-article.json"].some((file) =>
        fs.existsSync(safePath(root, base + file)),
      )
    )
      throw Error("Existing run is not source processing; preserve it and use a new run")
    createOnce(root, base + "source-processing-input.json", input)
    createOnce(root, base + "documents.json", documents)
    createOnce(root, base + "parses.json", parses)
    const state = new RunState(root, run, input, { scope: "processing" })
    const extracted = await state.stage(
      "extraction",
      { source_sha256: input.source_extraction_sha256 },
      async () => {
        if (sourceExtraction)
          return candidatesFromExtraction(sourceExtraction, candidateKey, parses)
        const scoped = await prepareRoleProvider(baseProvider, policy, "fact_extract", {
          root,
          run,
        })
        const settings = scoped.executionPolicy.settings
        const budgets = extractionBudget(
          Object.fromEntries(
            [
              "num_ctx",
              "num_predict",
              "input_char_budget",
              "facts_per_batch",
              "call_timeout_ms",
              "extraction_timeout_ms",
            ]
              .map((key) => [key, settings[key]])
              .filter(([, value]) => value !== undefined),
          ),
        )
        return extractClaims(scoped, parses, {
          ...budgets,
          model: settings.model,
          think: settings.think,
          candidate_key: candidateKey,
          extraction_scope: settings.extraction_scope ?? "full_source",
          checkpoint: (id, request, action) =>
            state.stage("extraction-batch-" + id, request, action),
        })
      },
    )
    const workingExtraction = {
      ...extracted,
      source_processing: { run, input_sha256: sha256(JSON.stringify(input)) },
    }
    createOnce(root, base + "claims.json", workingExtraction)
    // Check exact source bytes even on a successful stage resume.
    assertStoredEvidence(root, documents, parses)
    // Reuse validates the completed source-bound response before touching any
    // installed model. Historical ledgers retain their original policy/cost.
    const reusedAssessment = assessmentRun
      ? await loadBoundAssessment(root, assessmentRun, extracted.claims, documents, parses)
      : null
    const scoped = assessmentRun
      ? null
      : await prepareRoleProvider(baseProvider, policy, "evidence_compare", {
          root,
          run: input.assessment_run,
          overrides,
        })
    const assessmentBinding = assessmentRun
      ? readJSON(root, `runs/${assessmentRun}/model-policy/evidence_compare/budget.json`).binding
      : scoped.executionPolicy
    const assessment = await state.stage(
      "assessment",
      { claims_sha256: sha256(JSON.stringify(extracted.claims)), binding: assessmentBinding },
      async () => {
        if (assessmentRun) return reusedAssessment
        return (
          await assessEvidenceCheckpoint(root, run, scoped, extracted.claims, documents, parses)
        ).record
      },
    )
    const currentAssessment = await loadBoundAssessment(
      root,
      input.assessment_run,
      extracted.claims,
      documents,
      parses,
    )
    if (JSON.stringify(assessment) !== JSON.stringify(currentAssessment))
      throw Error("Processing assessment changed")
    const packet = factReviewPacket(run, input, workingExtraction, documents, parses, assessment)
    createOnce(root, base + "fact-review-packet.json", packet)
    createOnce(root, base + "fact-review-packet-checkpoint.json", {
      packet_sha256: sha256(fs.readFileSync(safePath(root, base + "fact-review-packet.json"))),
    })
    const context = await loadFactReviewPacket(root, run)
    createOnce(root, base + "fact-review-template.json", {
      reviewer: "",
      reviewed_at: null,
      claims: extracted.claims.map((claim) => ({
        claim_id: claim.claim_id,
        status: null,
        reason: "",
        source_read: false,
        entailment_checked: false,
        identity_checked: false,
        numbers_checked: false,
        time_checked: false,
      })),
      model_assessment: { packet_sha256: context.packet_sha256, resolutions: [] },
    })
    if (reviewFile)
      await reviewProcessedClaims(root, run, JSON.parse(fs.readFileSync(reviewFile, "utf8")))
    const reviewed = readJSON(root, base + "reviewed-claims.json")
    if (!reviewed)
      return {
        status: "fact_review",
        claims: extracted.claims.length,
        requires_attention: packet.claims.filter(
          (row) => row.model_assessment.requires_attention || row.identity_attention,
        ).length,
        packet: safePath(root, base + "fact-review-packet.json"),
        review_template: safePath(root, base + "fact-review-template.json"),
        candidate_published: false,
      }
    await assertProcessedFactReview(root, run, reviewed)
    const verified = reviewed.claims.filter((claim) => claim.review.status === "verified")
    if (!verified.length)
      return {
        status: "reviewed_without_publishable_facts",
        verified: 0,
        candidate_published: false,
      }
    if (readJSON(root, base + "draft.json")) {
      const working = loadProcessedDraft(root, run, reviewed, documents, parses)
      if (readJSON(root, base + "approved-article.json")) {
        const approved = loadCurrentApproval(root, run)
        return {
          status: "approved",
          event_id: approved.article.event_id,
          candidate_published: false,
        }
      }
      const preview = draftMarkdown(working, reviewed.claims, documents)
      if (fs.readFileSync(safePath(root, base + "preview.md"), "utf8") !== preview)
        throw Error("Processing working preview changed")
      return {
        status: "editorial_review",
        verified: verified.length,
        draft_reused: true,
        problems: working.problems,
        preview: safePath(root, base + "preview.md"),
        public_approved: false,
        candidate_published: false,
      }
    }
    const writer = draftRun
      ? null
      : await prepareRoleProvider(baseProvider, policy, "article_write", {
          root,
          run: input.draft_run,
        })
    const generated = draftRun
      ? loadBoundDraftCheckpoint(root, draftRun, reviewed.claims, { parses, documents })
      : await writeDraftCheckpoint(
          root,
          input.draft_run,
          writer,
          reviewed.claims,
          {
            model: writer.executionPolicy.settings.model,
            think: writer.executionPolicy.settings.think,
            parses,
            documents,
          },
          await writer.metadata(writer.executionPolicy.settings.model),
        )
    const generation = readJSON(root, `runs/${input.draft_run}/model-draft-checkpoint.json`)
    createOnce(root, base + "draft-generation-reference.json", {
      run: input.draft_run,
      input_sha256: generation.input_sha256,
      output_sha256: generation.output_sha256,
    })
    createOnce(root, base + "draft.json", generated.record)
    const preview = draftMarkdown(generated.record, reviewed.claims, documents)
    const previewPath = base + "preview.md"
    if (fs.existsSync(safePath(root, previewPath))) {
      if (fs.readFileSync(safePath(root, previewPath), "utf8") !== preview)
        throw Error("Processing preview changed")
    } else atomicCreate(root, previewPath, preview)
    return {
      status: "editorial_review",
      verified: verified.length,
      draft_reused: generated.reused,
      problems: generated.record.problems,
      preview: safePath(root, previewPath),
      public_approved: false,
      candidate_published: false,
    }
  })
}
