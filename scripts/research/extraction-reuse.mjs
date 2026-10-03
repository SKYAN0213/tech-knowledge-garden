import fs from "node:fs"
import { assertSchema, extractionSchema, sha256 } from "./contracts.mjs"
import { validateEvidence } from "./claims.mjs"
import { loadStoredSourceRun } from "./parser.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"

// Reuse model extraction when adding sources, preserving raw output and requiring
// a new fact review. Never inherit editorial decisions or model invented success.
export async function reuseExtraction(root, runId, sourceRunId) {
  if (
    [runId, sourceRunId].some((id) => !/^[A-Za-z0-9_-]+$/.test(id || "")) ||
    runId === sourceRunId
  )
    throw Error("Distinct valid extraction and destination runs required")
  return withLock(root, "run-" + runId, async () => {
    const source = loadStoredSourceRun(root, sourceRunId)
    const target = loadStoredSourceRun(root, runId)
    const sourceBytes = fs.readFileSync(safePath(root, `runs/${sourceRunId}/claims.json`))
    const extracted = JSON.parse(sourceBytes)
    if (!Array.isArray(extracted.claims) || !extracted.provenance)
      throw Error("Stored extraction and provenance required")
    const fields = Object.keys(extractionSchema.properties.claims.items.properties)
    const keys = new Set()
    const claims = extracted.claims.map((claim) => {
      assertSchema(
        { claims: [Object.fromEntries(fields.map((key) => [key, claim[key]]))] },
        extractionSchema,
      )
      if (
        !/^[A-Za-z0-9_-]+$/.test(claim.candidate_key || "") ||
        claim.claim_id !==
          sha256(JSON.stringify([claim.candidate_key, claim.statement, claim.evidence])).slice(
            0,
            24,
          ) ||
        keys.has(claim.claim_id)
      )
        throw Error("Original extraction claim identity required")
      keys.add(claim.claim_id)
      for (const evidence of claim.evidence) {
        const original = source.parses.find((p) => p.parse_id === evidence.parse_id)
        const current = target.parses.find((p) => p.parse_id === evidence.parse_id)
        const originalDocument = source.documents.find(
          (d) => d.source_version_id === evidence.source_version_id,
        )
        const currentDocument = target.documents.find(
          (d) => d.source_version_id === evidence.source_version_id,
        )
        if (
          !original ||
          !current ||
          !originalDocument ||
          !currentDocument ||
          JSON.stringify(original) !== JSON.stringify(current) ||
          originalDocument.original_url !== currentDocument.original_url ||
          originalDocument.body_sha256 !== currentDocument.body_sha256
        )
          throw Error(
            "Extraction reuse requires the exact stored source and parse in the destination",
          )
      }
      const review = validateEvidence(claim, target.parses)
      if (!review.structural_pass)
        throw Error("Extraction evidence failed: " + review.problems.join(", "))
      return { ...claim, event_id: null, review }
    })
    const receipt = {
      schema: "research-extraction-reuse/v1",
      source_run: sourceRunId,
      source_claims_sha256: sha256(sourceBytes),
      source_identity_sha256: sha256(JSON.stringify(source.identity)),
      destination_identity_sha256: sha256(JSON.stringify(target.identity)),
      claim_ids: claims.map((c) => c.claim_id),
      fact_review_required: true,
      candidate_published: false,
    }
    const output = { ...extracted, claims, extraction_reuse: receipt }
    const base = `runs/${runId}/`
    const previous = readJSON(root, base + "claims.json")
    const previousReceipt = readJSON(root, base + "extraction-reuse.json")
    if (previous || previousReceipt) {
      if (
        JSON.stringify(previous) !== JSON.stringify(output) ||
        JSON.stringify(previousReceipt) !== JSON.stringify(receipt)
      )
        throw Error("Extraction reuse checkpoint differs; preserve it and use a new run")
      return {
        claims: claims.length,
        reused: true,
        fact_review_required: true,
        candidate_published: false,
      }
    }
    if (
      readJSON(root, base + "reviewed-claims.json") ||
      readJSON(root, base + "approved-article.json")
    )
      throw Error("Destination already contains a review; use a new run")
    atomicCreate(root, base + "claims.json", output)
    atomicCreate(root, base + "extraction-reuse.json", receipt)
    return {
      claims: claims.length,
      reused: false,
      fact_review_required: true,
      candidate_published: false,
    }
  })
}
