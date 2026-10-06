import fs from "node:fs"
import { archiveManifest, packageResearchArchive } from "./archive.mjs"
import { loadStoredSourceRun } from "./parser.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { sha256 } from "./contracts.mjs"
import { loadApprovedOntologyInput } from "./ontology.mjs"
import { loadCurrentApproval } from "./preview.mjs"
import { loadReferencedNoteApproval } from "./note-review.mjs"
import { planConceptAuthority } from "./concept-archive.mjs"
import { assertProcessingExtractionOrigin } from "./extraction-checkpoint.mjs"
import { loadEmptyExtractionResult } from "./empty-extraction-review.mjs"

const validRun = (id) => typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id)

// Follow explicit evidence references only. This is a portable research snapshot,
// not a backup of caches, credentials, the live backlog, or publication state.
export function buildArchiveClosure(
  root,
  runId,
  sourceRunId,
  relatedRuns = [],
  { vault = "vault", authorityWrites = [] } = {},
) {
  if (
    !validRun(runId) ||
    !validRun(sourceRunId) ||
    runId === sourceRunId ||
    !Array.isArray(relatedRuns) ||
    relatedRuns.length > 16 ||
    relatedRuns.some((id) => !validRun(id) || id === runId) ||
    new Set([sourceRunId, ...relatedRuns]).size !== relatedRuns.length + 1
  )
    throw Error("Distinct valid archive, source and related run IDs required")
  const files = new Map(),
    runs = new Map(),
    visiting = new Set(),
    edges = [],
    parseIds = new Set(),
    authorities = [],
    authorityPlans = new Map()
  const add = (file) => {
    const previous = files.get(file.path)
    if (previous && JSON.stringify(previous) !== JSON.stringify(file))
      throw Error("Archive dependencies disagree on a file: " + file.path)
    files.set(file.path, file)
  }
  const pinFile = (relative) => {
    const bytes = fs.readFileSync(safePath(root, relative))
    return {
      path: relative,
      bytes: bytes.length,
      sha256: sha256(bytes),
      drive_root: "Research",
      public: false,
    }
  }
  const visit = (id) => {
    if (!validRun(id) || id === runId) throw Error("Invalid archive dependency run")
    if (visiting.has(id)) throw Error("Cyclic archive dependency: " + [...visiting, id].join(" → "))
    if (runs.has(id)) return
    if (runs.size + visiting.size >= 32) throw Error("Archive dependency budget exceeded")
    visiting.add(id)
    const base = `runs/${id}/`
    const doc = readJSON(root, base + "documents.json")
    const parses = readJSON(root, base + "parses.json")
    // An acquisition ancestor may include blocked attempts alongside selected
    // captured sources. Preserve those observations without making them evidence.
    const stored = doc || parses ? loadStoredSourceRun(root, id, { allowUnacquired: true }) : null
    const manifest = archiveManifest(root, id)
    const dependencies = []
    const reference = (target, kind, check) => {
      if (!validRun(target)) throw Error("Invalid dependency reference: " + kind)
      check?.()
      // A definition may use facts from several articles that all select that
      // same approved definition. Its fact source or note approval can therefore
      // point back to an ancestor already being packaged. Check the exact bound
      // bytes above and retain the edge; do not recurse into that ancestor twice.
      // Other source/approval dependency cycles remain invalid.
      const reviewedDefinitionBackEdge =
        visiting.has(target) && ["knowledge_fact_source", "concept_note_approval"].includes(kind)
      // A note's separately reviewed facts may select the exact bytes from
      // the article assigning that note. The selection hash check above still
      // runs. Close only this explicit article -> approved note -> fact chain;
      // an ordinary source-selection cycle remains invalid.
      const definitionSelectionBackEdge =
        visiting.has(target) &&
        kind === "source_selection" &&
        edges.some(
          (articleNote) =>
            articleNote.from === target &&
            articleNote.kind === "concept_note_approval" &&
            edges.some(
              (noteFact) =>
                noteFact.from === articleNote.to &&
                noteFact.to === id &&
                noteFact.kind === "knowledge_fact_source",
            ),
        )
      const emptyReviewBackEdge =
        visiting.has(target) &&
        ["empty_extraction_review", "empty_extraction_source"].includes(kind) &&
        edges.some(
          (edge) =>
            edge.from === target &&
            edge.to === id &&
            edge.kind ===
              (kind === "empty_extraction_review"
                ? "empty_extraction_source"
                : "empty_extraction_review"),
        )
      if (!reviewedDefinitionBackEdge && !definitionSelectionBackEdge && !emptyReviewBackEdge)
        dependencies.push(target)
      edges.push({ from: id, to: target, kind })
    }
    for (const document of stored?.documents || []) {
      if (document.capture_method !== "manual-readable-tool") continue
      // Stored evidence validation above has already checked the exact tool,
      // manifest, blocked observation and normalized source bytes. Follow the
      // importing run as well, so its proof remains within the portable scope.
      const captureRun = document.capture_provenance.evidence_paths[0].split("/")[1]
      if (captureRun === id) continue
      reference(captureRun, "readable_capture", () => {
        const imported = loadStoredSourceRun(root, captureRun, { allowUnacquired: true })
        const matches = imported.documents.filter(
          (candidate) => candidate.source_version_id === document.source_version_id,
        )
        if (matches.length !== 1 || JSON.stringify(matches[0]) !== JSON.stringify(document))
          throw Error("Readable capture dependency changed")
      })
    }
    const bundle = readJSON(root, base + "source-bundle.json")
    if (bundle) {
      if (
        bundle.schema !== "research-source-bundle/v1" ||
        !Array.isArray(bundle.source_runs) ||
        bundle.source_runs.length < 2 ||
        bundle.source_runs.length > 8 ||
        bundle.documents_sha256 !== stored?.identity.documents_sha256 ||
        bundle.parses_sha256 !== stored?.identity.parses_sha256
      )
        throw Error("Invalid stored source bundle")
      for (const identity of bundle.source_runs)
        reference(identity.source_run, "source_bundle", () => {
          if (
            JSON.stringify(loadStoredSourceRun(root, identity.source_run).identity) !==
            JSON.stringify(identity)
          )
            throw Error("Source bundle dependency changed")
        })
    }
    const selection = readJSON(root, base + "source-selection.json")
    if (selection) {
      if (
        selection.schema !== "research-source-selection/v1" ||
        selection.documents_sha256 !== stored?.identity.documents_sha256 ||
        selection.parses_sha256 !== stored?.identity.parses_sha256
      )
        throw Error("Invalid source selection")
      reference(selection.source_run?.source_run, "source_selection", () => {
        if (
          JSON.stringify(
            loadStoredSourceRun(root, selection.source_run.source_run, { allowUnacquired: true })
              .identity,
          ) !== JSON.stringify(selection.source_run)
        )
          throw Error("Source selection dependency changed")
      })
    }
    const processing = readJSON(root, base + "source-processing-input.json")
    const emptyReference = readJSON(root, base + "empty-extraction-review-reference.json")
    if (emptyReference) {
      const result = loadEmptyExtractionResult(root, id)
      reference(result.review_run, "empty_extraction_review")
      if (result.recovery) reference(result.recovery.run, "empty_extraction_recovery")
    }
    const emptyReview = readJSON(root, base + "empty-extraction-review-input.json")
    if (emptyReview) {
      const source = emptyReview.binding?.processing_run
      reference(source, "empty_extraction_source", () => {
        if (loadEmptyExtractionResult(root, source).review_run !== id)
          throw Error("Empty extraction review archive binding changed")
      })
    }
    if (processing) {
      if (
        processing.schema !== "research-source-processing-input/v1" ||
        processing.source_identity?.source_run !== processing.source_run ||
        processing.source_identity.documents_sha256 !== stored?.identity.documents_sha256 ||
        processing.source_identity.parses_sha256 !== stored?.identity.parses_sha256
      )
        throw Error("Processing archive source binding changed")
      reference(processing.source_run, "processing_source", () => {
        if (
          JSON.stringify(loadStoredSourceRun(root, processing.source_run).identity) !==
          JSON.stringify(processing.source_identity)
        )
          throw Error("Processing source dependency changed")
      })
      assertProcessingExtractionOrigin(root, processing, stored.documents, stored.parses)
      if (processing.extraction_run) reference(processing.extraction_run, "processing_extraction")
      if (processing.assessment_run !== id)
        reference(processing.assessment_run, "processing_assessment")
      if (processing.assessment_reuse_run)
        reference(processing.assessment_reuse_run, "processing_assessment_reuse")
      if (processing.draft_run !== id && readJSON(root, base + "draft-generation-reference.json"))
        reference(processing.draft_run, "processing_draft")
    }
    const quoteReview = readJSON(root, base + "quote-review-input.json")
    const windowInput = readJSON(root, base + "evidence-assessment/input.json")
    if (windowInput?.reuse_run) reference(windowInput.reuse_run, "window_assessment_reuse")
    if (quoteReview) {
      reference(quoteReview.source_run, "assessment_quote_review", () => {
        const parent = `runs/${quoteReview.source_run}/`
        const originalInput = readJSON(root, parent + "evidence-assessment/input.json")
        const ownInput = readJSON(root, base + "evidence-assessment/input.json")
        const identity = loadStoredSourceRun(root, quoteReview.source_run).identity
        if (
          quoteReview.schema !== "research-reviewed-assessment-input/v1" ||
          !originalInput ||
          quoteReview.original_input_sha256 !== sha256(JSON.stringify(originalInput)) ||
          JSON.stringify(ownInput) !== JSON.stringify(originalInput) ||
          quoteReview.review?.source_run !== quoteReview.source_run ||
          quoteReview.review?.input_sha256 !== quoteReview.original_input_sha256 ||
          quoteReview.ledger_sha256 !==
            sha256(
              fs.readFileSync(safePath(root, parent + "model-policy/evidence_compare/budget.json")),
            ) ||
          identity.documents_sha256 !== stored?.identity.documents_sha256 ||
          identity.parses_sha256 !== stored?.identity.parses_sha256 ||
          !Array.isArray(quoteReview.original_responses) ||
          !quoteReview.original_responses.length ||
          quoteReview.original_responses.length > 216 ||
          quoteReview.original_responses.some((response, index) => {
            const expected = parent + `evidence-assessment/batch-${index + 1}.json`
            const file = safePath(root, expected)
            return (
              response.path !== expected ||
              (response.sha256 === null
                ? fs.existsSync(file)
                : !fs.existsSync(file) || response.sha256 !== sha256(fs.readFileSync(file)))
            )
          })
        )
          throw Error("Quote review dependency changed")
      })
    }
    const reuse = readJSON(root, base + "extraction-reuse.json")
    if (reuse) {
      if (reuse.schema !== "research-extraction-reuse/v1")
        throw Error("Invalid extraction reuse receipt")
      reference(reuse.source_run, "extraction_reuse", () => {
        if (
          sha256(fs.readFileSync(safePath(root, `runs/${reuse.source_run}/claims.json`))) !==
            reuse.source_claims_sha256 ||
          sha256(JSON.stringify(loadStoredSourceRun(root, reuse.source_run).identity)) !==
            reuse.source_identity_sha256 ||
          sha256(JSON.stringify(stored?.identity)) !== reuse.destination_identity_sha256
        )
          throw Error("Extraction reuse dependency changed")
      })
    }
    const approval = readJSON(root, base + "candidate-approval.json")
    if (approval) {
      if (approval.schema !== "research-candidate-approval/v1")
        throw Error("Invalid candidate approval")
      reference(approval.approved_run, "approved_article", () => {
        const article = readJSON(root, `runs/${approval.approved_run}/approved-article.json`)
        if (!article || sha256(JSON.stringify(article)) !== approval.article_sha256)
          throw Error("Candidate approval article changed")
      })
      const lineage = approval.existing_editorial_approval
      if (lineage) {
        const reviewed = pinFile(lineage.review_path)
        if (reviewed.sha256 !== lineage.review_sha256)
          throw Error("Existing editorial approval review changed")
        add(reviewed)
        const reviewRun = lineage.review_path.match(/^runs\/([A-Za-z0-9_-]+)\/.+$/)?.[1]
        if (!reviewRun) throw Error("Existing editorial approval review needs a bound run")
        if (reviewRun !== id) reference(reviewRun, "editorial_lineage_review")
        reference(lineage.prior_approved_run, "prior_editorial_approval", () => {
          const prior = loadCurrentApproval(root, lineage.prior_approved_run, { vault })
          if (
            prior.article.event_id !== approval.event_id ||
            sha256(JSON.stringify(prior.article)) !== lineage.prior_article_sha256 ||
            Object.entries(lineage.prior_artifacts_sha256).some(
              ([name, hash]) =>
                pinFile(`runs/${lineage.prior_approved_run}/${name}`).sha256 !== hash,
            )
          )
            throw Error("Prior editorial approval dependency changed")
        })
      }
      if (approval.source_alternative)
        reference(approval.source_alternative.run_id, "source_alternative", () => {
          if (
            sha256(
              fs.readFileSync(
                safePath(
                  root,
                  `runs/${approval.source_alternative.run_id}/candidate-source-alternative.json`,
                ),
              ),
            ) !== approval.source_alternative.receipt_sha256
          )
            throw Error("Candidate source alternative changed")
        })
    }
    const alternative = readJSON(root, base + "candidate-source-alternative.json")
    if (alternative) {
      if (alternative.schema !== "research-candidate-source-alternative-resolution/v1")
        throw Error("Invalid source alternative")
      reference(alternative.inputs?.source_run_id, "alternative_evidence", () => {
        if (
          sha256(
            JSON.stringify(loadStoredSourceRun(root, alternative.inputs.source_run_id).identity),
          ) !== alternative.inputs.source_run_identity_sha256
        )
          throw Error("Alternative source dependency changed")
      })
    }
    const revision = readJSON(root, base + "source-revision-resolution.json")
    if (revision) {
      const { receipt_sha256, ...body } = revision
      if (
        revision.schema !== "research-source-revision-resolution/v1" ||
        sha256(JSON.stringify(body)) !== receipt_sha256 ||
        sha256(JSON.stringify(revision.before)) !== revision.before_candidate_sha256 ||
        sha256(JSON.stringify(revision.after)) !== revision.after_candidate_sha256 ||
        revision.after.event_id !== revision.before.event_id ||
        !Array.isArray(revision.approved_inputs) ||
        !revision.approved_inputs.length
      )
        throw Error("Invalid source revision resolution dependency")
      const reviewFile = pinFile(revision.review_path)
      if (reviewFile.sha256 !== revision.review_sha256)
        throw Error("Source revision review dependency changed")
      add(reviewFile)
      const review = readJSON(root, revision.review_path)
      reference(review.current_source_run, "revision_observation", () => {
        if (
          sha256(JSON.stringify(loadStoredSourceRun(root, review.current_source_run).identity)) !==
          revision.current_source_identity_sha256
        )
          throw Error("Source revision observation dependency changed")
      })
      for (const input of revision.approved_inputs)
        reference(input.run, "revision_approval", () => {
          if (
            JSON.stringify(loadApprovedOntologyInput(root, input.run, { vault }).file_hashes) !==
            JSON.stringify(input.files)
          )
            throw Error("Source revision approval dependency changed")
        })
      for (const prior of revision.before.source_revision_resolutions || [])
        reference(prior.run_id, "prior_revision_resolution", () => {
          const saved = readJSON(root, `runs/${prior.run_id}/source-revision-resolution.json`)
          if (!saved || saved.review_sha256 !== prior.review_sha256)
            throw Error("Prior revision resolution dependency changed")
        })
    }
    const factRevision = readJSON(root, base + "source-revision-fact-review.json")
    if (factRevision) {
      reference(factRevision.prior_approved_run, "prior_fact_review", () => {
        if (
          JSON.stringify(
            loadApprovedOntologyInput(root, factRevision.prior_approved_run, { vault }).file_hashes,
          ) !== JSON.stringify(factRevision.prior_files)
        )
          throw Error("Prior fact review dependency changed")
      })
      if (factRevision.current_source_run)
        reference(factRevision.current_source_run, "fact_revision_source")
    }
    const concepts = readJSON(root, base + "article-concept-review.json")
    if (concepts || readJSON(root, base + "editorial-review.json")?.concept_review) {
      const current = loadCurrentApproval(root, id, { vault })
      if (!current.concept_review) throw Error("Concept assignment archive receipt missing")
      const planned = planConceptAuthority(vault, runId)
      if (!authorityPlans.has(planned.run)) {
        if (runs.size + visiting.size + authorityPlans.size >= 32)
          throw Error("Archive dependency budget exceeded")
        authorityPlans.set(planned.run, planned)
        authorityWrites.push(...planned.writes)
        for (const file of planned.files) add(file)
      }
      authorities.push({
        approved_run: id,
        run: planned.run,
        relative_vault: planned.relative_vault,
      })
      edges.push({ from: id, to: planned.run, kind: "concept_authority" })
      for (const note of current.concept_review.notes)
        if (note.approval_run)
          reference(note.approval_run, "concept_note_approval", () => {
            if (
              JSON.stringify(
                loadReferencedNoteApproval(root, note.approval_run, { vault }).files,
              ) !== JSON.stringify(note.approval_files)
            )
              throw Error("Concept note approval dependency changed")
          })
    }
    const notes = readJSON(root, base + "approved-notes.json")
    if (notes) {
      const current = loadReferencedNoteApproval(root, id, { vault })
      for (const input of current.approval.source_files)
        reference(input.run, "knowledge_fact_source", () => {
          for (const [name, hash] of Object.entries(input.files))
            if (pinFile(`runs/${input.run}/${name}`).sha256 !== hash)
              throw Error("Knowledge fact source dependency changed")
        })
    }
    for (const target of dependencies) visit(target)
    for (const file of manifest.files) add(file)
    for (const parsed of stored?.parses || []) {
      parseIds.add(parsed.parse_id)
      add(pinFile(`parses/${parsed.parse_id}/parse.json`))
    }
    runs.set(id, { run_id: id, source_identity: stored?.identity || null })
    visiting.delete(id)
  }
  visit(sourceRunId)
  for (const id of relatedRuns) {
    const approval = readJSON(root, `runs/${id}/candidate-approval.json`)
    if (approval?.approved_run !== sourceRunId)
      throw Error("Related run must approve the selected source article")
    visit(id)
  }
  for (const planned of authorityPlans.values()) {
    if (runs.has(planned.run))
      throw Error("Concept authority run conflicts with a source dependency")
    runs.set(planned.run, { run_id: planned.run, source_identity: null })
  }
  if (runs.size > 32) throw Error("Archive dependency budget exceeded")
  const entries = [...files.values()].sort((a, b) => a.path.localeCompare(b.path))
  if (entries.length > 2000 || entries.reduce((sum, f) => sum + f.bytes, 0) > 256 * 1024 ** 2)
    throw Error("Archive file or byte budget exceeded")
  return {
    schema: "research-archive/v2",
    run_id: runId,
    source_run: sourceRunId,
    bound_runs: [...runs.keys()].sort(),
    parse_ids: [...parseIds].sort(),
    dependencies: edges.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ...(authorities.length
      ? {
          concept_authorities: authorities.sort((a, b) =>
            a.approved_run.localeCompare(b.approved_run),
          ),
        }
      : {}),
    files: entries,
    drive_verified: false,
    candidate_published: false,
  }
}

export async function archiveClosure(root, runId, sourceRunId, relatedRuns = [], options = {}) {
  return withLock(root, "run-" + runId, async () => {
    const authorityWrites = []
    const manifest = buildArchiveClosure(root, runId, sourceRunId, relatedRuns, {
      ...options,
      authorityWrites,
    })
    const file = `runs/${runId}/archive-manifest.json`
    const previous = readJSON(root, file)
    if (previous && JSON.stringify(previous) !== JSON.stringify(manifest))
      throw Error("Archive closure inputs changed; preserve the package and use a new run ID")
    for (const write of authorityWrites) {
      if (
        write.path.endsWith("/concept-authority.json") &&
        fs.existsSync(safePath(root, write.path.slice(0, -"/concept-authority.json".length))) &&
        !fs.existsSync(safePath(root, write.path))
      )
        throw Error("Concept authority run already exists without archive ownership")
      const existing = fs.existsSync(safePath(root, write.path))
        ? fs.readFileSync(safePath(root, write.path))
        : null
      if (existing && sha256(existing) !== sha256(write.content))
        throw Error("Archived concept authority bytes changed")
      if (!existing) atomicCreate(root, write.path, write.content)
    }
    if (!previous) atomicCreate(root, file, manifest)
    const receipt = packageResearchArchive(root, runId)
    const receiptFile = `archive-staging/${runId}/package-receipt.json`
    const oldReceipt = readJSON(root, receiptFile)
    if (oldReceipt && JSON.stringify(oldReceipt) !== JSON.stringify(receipt))
      throw Error("Archive closure package changed")
    if (!oldReceipt) atomicCreate(root, receiptFile, receipt)
    return {
      files: manifest.files.length,
      bound_runs: manifest.bound_runs,
      parse_count: manifest.parse_ids.length,
      package: receipt,
      reused: !!previous,
      drive_verified: false,
    }
  })
}
