import fs from "node:fs"
import { canonicalURL } from "../garden.mjs"
import { sha256 } from "./contracts.mjs"
import { safePath, readJSON } from "./run-state.mjs"
import { loadStoredSourceRun } from "./parser.mjs"
import { buildCandidateSourceAlternativeResolution } from "./candidate-source-alternative.mjs"

// Preserve the discovery event ID when the reviewed primary source changes.
// Rebuild the pinned relation from stored bytes and claims on every preview resume.
export function loadPreviewSourceAlternatives(root, references, approvals) {
  if (!Array.isArray(references) || references.length > approvals.length)
    throw Error("Bounded approved alternate-source references required")
  const originals = new Map()
  for (const ref of references) {
    if (
      (ref && typeof ref === "object" && !Array.isArray(ref)
        ? Object.keys(ref).sort().join()
        : "") !== "approved_run,event_id,receipt_sha256,resolution_run" ||
      !/^[A-Za-z0-9_-]+$/.test(ref.resolution_run || "") ||
      !/^[a-f0-9]{64}$/.test(ref.receipt_sha256 || "") ||
      originals.has(ref.event_id)
    )
      throw Error("Exact unique alternate-source reference required")
    const matches = approvals.filter(
      (a) => a.run === ref.approved_run && a.article.event_id === ref.event_id,
    )
    if (matches.length !== 1) throw Error("Alternate source is not bound to this approved article")
    const article = matches[0].article
    const base = `runs/${ref.resolution_run}/`
    const bytes = fs.readFileSync(safePath(root, base + "candidate-source-alternative.json"))
    if (sha256(bytes) !== ref.receipt_sha256) throw Error("Pinned alternate-source receipt changed")
    const resolution = JSON.parse(bytes)
    const reviewBytes = fs.readFileSync(
      safePath(root, base + "candidate-source-alternative-review.json"),
    )
    const review = JSON.parse(reviewBytes)
    if (
      resolution.decision !== "same_event" ||
      resolution.inputs?.source_run_id !== ref.approved_run ||
      sha256(reviewBytes) !== resolution.inputs.review_sha256 ||
      resolution.existing_event_approval ||
      !article.source_urls.some((u) => canonicalURL(u) === resolution.alternative_source?.url) ||
      ![
        sha256(review.original_url || "").slice(0, 16),
        sha256(canonicalURL(review.original_url || "")).slice(0, 16),
      ].includes(ref.event_id)
    )
      throw Error("New-event alternate-source identity does not match its approval")
    const stored = loadStoredSourceRun(root, ref.approved_run)
    const reviewed = readJSON(root, `runs/${ref.approved_run}/reviewed-claims.json`)
    const rebuilt = buildCandidateSourceAlternativeResolution({
      candidate: {
        key: resolution.candidate_key,
        source_urls: [resolution.original_source.url],
        source_published_at: resolution.original_source.published_at,
      },
      review,
      sourceRunId: ref.approved_run,
      sourceRunIdentity: stored.identity,
      documents: stored.documents,
      parses: stored.parses,
      reviewedClaims: reviewed?.claims,
      reviewSha256: sha256(reviewBytes),
      backlogSha256: resolution.inputs.backlog_sha256,
      generatedAt: resolution.generated_at,
    })
    if (JSON.stringify(rebuilt) !== JSON.stringify(resolution))
      throw Error("Alternate-source relation no longer matches its source evidence")
    originals.set(ref.event_id, review.original_url)
  }
  return originals
}
