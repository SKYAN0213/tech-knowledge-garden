import fs from "node:fs"
import path from "node:path"
import { parseNote, sections } from "../garden.mjs"
import { sha256 } from "./contracts.mjs"
import { assertVerifiedClaim } from "./claims.mjs"
import { assertReviewDate } from "./dates.mjs"
import {
  conceptRegistry,
  verifiedConceptLinks,
  assertConceptConflicts,
} from "./knowledge-links.mjs"
import { loadReferencedNoteApproval } from "./note-review.mjs"
import { safePath } from "./run-state.mjs"
import { learningKinds } from "../../web/graph-model.mjs"

const checks = ["definition_read", "article_source_read", "relationship_checked", "aliases_checked"]
const exactKeys = (value, allowed) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => allowed.includes(key))

// Assignment evidence is private. The public projection retains only specialist
// IDs; no relation is inferred from entities, aliases or simultaneous appearance.
export function evaluateArticleConceptReview(
  root,
  article,
  draft,
  claims,
  parses,
  decision,
  { vault = "vault", sourceVault = vault } = {},
) {
  const ids = decision.concept_ids ?? []
  const review = decision.concept_review
  if (
    !Array.isArray(ids) ||
    ids.some((id) => typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) ||
    new Set(ids).size !== ids.length
  )
    throw Error("Distinct specialist concept IDs required")
  if (!ids.length && !review) return null
  if (
    !exactKeys(review, ["schema", "assignments"]) ||
    review.schema !== "article-concept-review/v1" ||
    !Array.isArray(review.assignments) ||
    !review.assignments.length ||
    review.assignments.length > 32 ||
    JSON.stringify(review.assignments.map((a) => a?.concept_id)) !== JSON.stringify(ids) ||
    JSON.stringify(article.article_review.concept_ids) !== JSON.stringify(ids)
  )
    throw Error("Explicit article concept assignments required for every selected ID")
  const publicIDs = new Set(
    [
      ...draft.draft.lead,
      ...draft.draft.explanations.flatMap((s) => s.paragraphs),
      ...(draft.draft.analysis ? [draft.draft.analysis] : []),
    ].flatMap((p) => p.claim_ids),
  )
  const publicClaims = claims.filter((c) => publicIDs.has(c.claim_id))
  const registry = conceptRegistry(vault)
  const selected = []
  const proposals = []
  const sourceNotes = []
  for (const assignment of review.assignments) {
    if (
      !exactKeys(assignment, [
        "concept_id",
        "status",
        "reason",
        "reviewer",
        "reviewed_at",
        "evidence",
        "note",
        ...checks,
      ]) ||
      checks.some((key) => assignment[key] !== true) ||
      typeof assignment.reviewer !== "string" ||
      !assignment.reviewer.trim() ||
      typeof assignment.reason !== "string" ||
      assignment.reason.trim().length < 10 ||
      !exactKeys(assignment.note, ["path", "sha256", "approval_run"]) ||
      !/^Knowledge\/.+\.md$/.test(assignment.note.path || "") ||
      /[\\\x00-\x1f\x7f]/.test(assignment.note.path) ||
      assignment.note.path.split("/").some((p) => !p || p === "." || p === "..") ||
      !/^[a-f0-9]{64}$/.test(assignment.note.sha256 || "") ||
      !Array.isArray(assignment.evidence) ||
      !assignment.evidence.length ||
      assignment.evidence.some(
        (e) =>
          !exactKeys(e, ["event_id", "claim_id"]) ||
          e.event_id !== article.event_id ||
          !publicIDs.has(e.claim_id),
      ) ||
      new Set(assignment.evidence.map((e) => e.claim_id)).size !== assignment.evidence.length
    )
      throw Error("Exact reviewed note and public-claim assignment evidence required")
    let content,
      approvalFiles = null
    if (assignment.note.approval_run !== undefined) {
      const approved = loadReferencedNoteApproval(root, assignment.note.approval_run, { vault })
      const note = approved.approval.notes.find((n) => n.path === assignment.note.path)
      if (!note) throw Error("Selected specialist note missing from knowledge approval")
      content = note.content
      approvalFiles = approved.files
      proposals.push(note)
    } else {
      content = fs.readFileSync(safePath(vault, assignment.note.path), "utf8")
      if (
        !registry.some(
          (n) =>
            n.path + ".md" === assignment.note.path && n.meta.concept_id === assignment.concept_id,
        )
      )
        throw Error("Reviewed specialist concept registry entry required")
      // Recheck existing notes too: an alias conflict introduced since the
      // note's review must not attach a different concept to this article.
      proposals.push({ path: assignment.note.path, content, operation: "replace" })
    }
    const note = parseNote(content)
    assertReviewDate(note.meta.last_reviewed)
    assertReviewDate(note.meta.map_review?.reviewed)
    if (
      sha256(content) !== assignment.note.sha256 ||
      note.meta.concept_id !== assignment.concept_id ||
      note.meta.entry_type !== "concept" ||
      note.meta.schema_version !== "tech-encyclopedia/v2" ||
      note.meta.map_review?.decision !== "include" ||
      !learningKinds.includes(note.meta.map_review.kind) ||
      !note.meta.verified_sources?.length ||
      !sections(note.body, 2).some(
        (s) => s.title === "한 문장 정의" && s.body.trim() && s.body.trim() !== "없음",
      )
    )
      throw Error("Specialist definition identity or reviewed note hash changed")
    const evidenceClaims = assignment.evidence.map((e) =>
      publicClaims.find((c) => c.claim_id === e.claim_id),
    )
    for (const claim of evidenceClaims) {
      if (!claim) throw Error("Assignment requires a fact used in public prose")
      assertVerifiedClaim(claim, parses)
    }
    assertReviewDate(assignment.reviewed_at, {
      notBefore: [
        note.meta.last_reviewed,
        note.meta.map_review.reviewed,
        ...evidenceClaims.map((c) => c.review.reviewed_at),
      ],
    })
    assertReviewDate(decision.reviewed_at, { notBefore: [assignment.reviewed_at] })
    selected.push({ path: assignment.note.path.replace(/\.md$/, ""), ...note })
    sourceNotes.push({
      ...assignment.note,
      ...(approvalFiles ? { approval_files: approvalFiles } : {}),
    })
  }
  assertConceptConflicts(vault, proposals)
  const links = verifiedConceptLinks(
    {
      review_status: "verified",
      event_id: article.event_id,
      claim_ids: publicClaims.map((c) => c.claim_id),
    },
    review.assignments,
    selected,
  )
  return {
    schema: "reviewed-article-concepts/v1",
    event_id: article.event_id,
    draft_id: draft.draft_id,
    editorial_decision_sha256: sha256(JSON.stringify(decision)),
    source_vault: path.resolve(sourceVault),
    links,
    notes: sourceNotes,
    candidate_published: false,
  }
}
