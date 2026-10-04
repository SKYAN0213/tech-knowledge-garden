import fs from "node:fs"
import { archiveManifest, packageResearchArchive } from "./archive.mjs"
import { loadStoredSourceRun } from "./parser.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { sha256 } from "./contracts.mjs"
import { loadApprovedOntologyInput } from "./ontology.mjs"
import { loadCurrentApproval } from "./preview.mjs"
import { loadReferencedNoteApproval } from "./note-review.mjs"
import { planConceptAuthority } from "./concept-archive.mjs"

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
    if (visiting.has(id)) throw Error("Cyclic archive dependency")
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
      // A knowledge definition can use facts from the article which selects it.
      // The current run already carries those exact source files; this factual
      // dependency does not recurse through publication or model generation.
      if (!(kind === "knowledge_fact_source" && visiting.has(target))) dependencies.push(target)
      edges.push({ from: id, to: target, kind })
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
