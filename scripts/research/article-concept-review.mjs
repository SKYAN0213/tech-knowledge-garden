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
  assertPreservedConceptIdentities,
} from "./knowledge-links.mjs"
import {
  loadReferencedNoteApproval,
  loadHistoricalNoteApproval,
} from "./note-review.mjs"
import { safePath, readJSON } from "./run-state.mjs"
import { learningKinds } from "../../web/graph-model.mjs"

const checks = ["definition_read", "article_source_read", "relationship_checked", "aliases_checked"]
const exactKeys = (value, allowed) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => allowed.includes(key))

export function historicalCanonicalContent(
  root,
  note,
  vault,
  { noteApprovalLoader = loadHistoricalNoteApproval } = {},
) {
  const current = fs.readFileSync(safePath(vault, note.path), "utf8")
  if (sha256(current) === note.sha256) return current
  const runs = safePath(root, "runs")
  if (!fs.existsSync(runs)) return current
  for (const entry of fs.readdirSync(runs, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[A-Za-z0-9_-]{1,160}$/.test(entry.name)) continue
    const stored = readJSON(root, `runs/${entry.name}/approved-notes.json`)
    const candidate = stored?.notes?.find(
      (n) =>
        n.path === note.path &&
        n.previous_sha256 === note.sha256 &&
        typeof n.before_content === "string" &&
        sha256(n.before_content) === note.sha256,
    )
    if (!candidate) continue
    // A matching hash alone is insufficient. Validate the native replacement,
    // its preserved before/after bytes and all source reviews before reuse.
    const approved = noteApprovalLoader(root, entry.name, { vault })
    return approved.approval.notes.find((n) => n.path === note.path).before_content
  }
  // No preserved native authority: retain the existing hash-change rejection.
  return current
}

function approvedCurrentReplacement(root, path, expectedSha, current, approvedNotes, vault) {
  const replacements = []
  for (const candidate of approvedNotes) {
    const offered = candidate.approval?.notes?.find(
      (note) =>
        note.path === path &&
        note.sha256 === expectedSha &&
        note.previous_sha256 === sha256(current) &&
        note.before_content === current &&
        note.operation !== "create",
    )
    if (!offered) continue
    const verified = loadReferencedNoteApproval(root, candidate.run, { vault })
    if (sha256(JSON.stringify(verified)) !== sha256(JSON.stringify(candidate)))
      throw Error("Approved specialist note receipt changed")
    const note = verified.approval.notes.find((entry) => entry.path === path)
    if (note && note.content === offered.content) replacements.push(note)
  }
  if (replacements.length > 1)
    throw Error("Distinct approved specialist note replacement required")
  return replacements[0]?.content ?? null
}

// Assignment evidence is private. The public projection retains only specialist
// IDs; no relation is inferred from entities, aliases or simultaneous appearance.
export function evaluateArticleConceptReview(
  root,
  article,
  draft,
  claims,
  parses,
  decision,
  { vault = "vault", sourceVault = vault, historical = false, approvedNotes = [] } = {},
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
  const registry =
    !historical || review.assignments.some((a) => a.note?.approval_run === undefined)
      ? conceptRegistry(vault)
      : []
  const selected = []
  const proposals = new Map()
  const propose = (note) => {
    const previous = proposals.get(note.path)
    if (previous && previous.content !== note.content)
      throw Error("Conflicting approved concept note proposals")
    proposals.set(note.path, note)
  }
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
      let approved
      try {
        approved = historical
          ? loadHistoricalNoteApproval(root, assignment.note.approval_run, { vault })
          : loadReferencedNoteApproval(root, assignment.note.approval_run, { vault })
      } catch (error) {
        if (historical) throw error
        try {
          const snapshot = loadHistoricalNoteApproval(root, assignment.note.approval_run, { vault })
          const referenced = snapshot.approval.notes.find((n) => n.path === assignment.note.path)
          const current = fs.readFileSync(safePath(vault, assignment.note.path), "utf8")
          const replacement = approvedCurrentReplacement(
            root,
            assignment.note.path,
            assignment.note.sha256,
            current,
            approvedNotes,
            vault,
          )
          if (!referenced || referenced.content !== replacement) throw error
          approved = snapshot
        } catch {
          throw error
        }
      }
      const note = approved.approval.notes.find((n) => n.path === assignment.note.path)
      if (!note) throw Error("Selected specialist note missing from knowledge approval")
      content = note.content
      approvalFiles = approved.files
      // A reviewed note may connect to a sibling created in the same exact
      // approval. Validate that approved concept set, while assigning only the
      // explicitly selected IDs to this article. The full approval hash remains
      // pinned in approval_files; unapproved notes cannot supply a target.
      for (const sibling of approved.approval.notes)
        if (sibling.path.startsWith("Knowledge/")) propose(sibling)
    } else {
      content = historical
        ? historicalCanonicalContent(root, assignment.note, vault)
        : fs.readFileSync(safePath(vault, assignment.note.path), "utf8")
      if (!historical && sha256(content) !== assignment.note.sha256) {
        content =
          approvedCurrentReplacement(
            root,
            assignment.note.path,
            assignment.note.sha256,
            content,
            approvedNotes,
            vault,
          ) || content
      }
      if (
        !registry.some(
          (n) =>
            n.path + ".md" === assignment.note.path && n.meta.concept_id === assignment.concept_id,
        )
      )
        throw Error("Reviewed specialist concept registry entry required")
      // Recheck existing notes too: an alias conflict introduced since the
      // note's review must not attach a different concept to this article.
      propose({ path: assignment.note.path, content, operation: "replace" })
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
  if (historical) assertPreservedConceptIdentities([...proposals.values()])
  else assertConceptConflicts(vault, [...proposals.values()])
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
