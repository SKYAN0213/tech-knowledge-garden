import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { loadStoredSourceRun, articleContentFingerprint } from "./parser.mjs"
import { loadFactReviewPacket, assertProcessedFactReview } from "./evidence-review-packet.mjs"
import { loadProcessedDraft } from "./processed-draft.mjs"
import { loadCurrentApproval } from "./preview.mjs"
import { draftMarkdown } from "./editor.mjs"
import { readJSON, safePath } from "./run-state.mjs"

// Read completed checkpoints without metadata requests or generation. A model
// being replaced/deleted does not invalidate its reviewed, exact-source work.
export async function loadProcessedSourceResult(root, run, entry) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(run || "")) throw Error("Invalid reused processing run")
  const base = `runs/${run}/`
  const bytes = fs.readFileSync(safePath(root, base + "source-processing-input.json"))
  const input = JSON.parse(bytes)
  if (
    input.schema !== "research-source-processing-input/v1" ||
    input.candidate_key !== entry.candidate_key
  )
    throw Error("Reused processing requires the same exact candidate")
  const { documents, parses } = loadStoredSourceRun(root, run)
  const origin = loadStoredSourceRun(root, input.source_run)
  if (
    input.source_identity.source_run !== input.source_run ||
    input.source_identity.documents_sha256 !== sha256(JSON.stringify(documents)) ||
    input.source_identity.parses_sha256 !== sha256(JSON.stringify(parses)) ||
    origin.identity.documents_sha256 !== input.source_identity.documents_sha256 ||
    origin.identity.parses_sha256 !== input.source_identity.parses_sha256
  )
    throw Error("Reused processing source binding changed")
  const sourceClaims = safePath(root, `runs/${input.source_run}/claims.json`)
  if (
    input.source_extraction_sha256 !==
    (fs.existsSync(sourceClaims) ? sha256(fs.readFileSync(sourceClaims)) : null)
  )
    throw Error("Reused extraction origin changed")
  const source = parses.find(
    (p) => p.parse_id === entry.parse_id && p.source_version_id === entry.source_version_id,
  )
  const document = documents.find((d) => d.source_version_id === entry.source_version_id)
  if (
    !source ||
    !document ||
    articleContentFingerprint(source) !== entry.content_sha256 ||
    !entry.source_urls?.includes(document.original_url)
  )
    throw Error("Reused processing differs from the candidate source version, parse or URL")
  const context = await loadFactReviewPacket(root, run)
  const common = {
    processing_run: run,
    source_run: input.source_run,
    assessment_run: input.assessment_run,
    processing_input_sha256: sha256(bytes),
    model_calls: 0,
    candidate_published: false,
    packet: safePath(root, base + "fact-review-packet.json"),
    ...(readJSON(root, `runs/${input.assessment_run}/quote-review-result.json`)
      ? { quote_review_run: input.assessment_run }
      : {}),
  }
  const reviewed = readJSON(root, base + "reviewed-claims.json")
  const draft = readJSON(root, base + "draft.json")
  const approval = readJSON(root, base + "approved-article.json")
  if (!reviewed) {
    if (draft || approval) throw Error("Reused draft or approval lacks reviewed facts")
    return {
      ...common,
      status: "fact_review",
      claims: context.extracted.claims.length,
      requires_attention: context.packet.claims.filter(
        (row) => row.model_assessment.requires_attention || row.identity_attention,
      ).length,
    }
  }
  await assertProcessedFactReview(root, run, reviewed)
  const verified = reviewed.claims.filter((c) => c.review.status === "verified")
  if (!verified.length) {
    if (draft || approval) throw Error("Reused draft or approval lacks publishable facts")
    return { ...common, status: "reviewed_without_publishable_facts", verified: 0 }
  }
  if (!draft) {
    if (approval) throw Error("Reused approval lacks its exact draft")
    return { ...common, status: "writer_required", verified: verified.length }
  }
  const working = loadProcessedDraft(root, run, reviewed, documents, parses)
  const preview = safePath(root, base + "preview.md")
  if (fs.readFileSync(preview, "utf8") !== draftMarkdown(working, reviewed.claims, documents))
    throw Error("Reused working preview changed")
  if (approval) {
    const current = loadCurrentApproval(root, run)
    if (entry.event_id && current.article.event_id !== entry.event_id)
      throw Error("Reused approval differs from the existing event")
    return {
      ...common,
      status: "approved",
      event_id: current.article.event_id,
      article_sha256: sha256(JSON.stringify(current.article)),
      verified: verified.length,
      preview,
    }
  }
  return {
    ...common,
    status: "editorial_review",
    verified: verified.length,
    problems: working.problems,
    preview,
  }
}
