import { sha256 } from "./contracts.mjs"
import { atomicWrite } from "./run-state.mjs"

export function shadowRecord({
  edition_key,
  run_id,
  actual_started_at,
  candidate_review,
  legacy_publication,
  coverage,
  evaluation,
}) {
  if (!edition_key || !run_id || !Number.isFinite(Date.parse(actual_started_at)))
    throw Error("Actual shadow run identity required")
  if (
    legacy_publication?.published_by !== "legacy" ||
    !legacy_publication.live_verified ||
    !legacy_publication.drive_verified ||
    !legacy_publication.github_verified
  )
    throw Error("Existing publication evidence required for a completed comparison")
  if (coverage.length !== 32 || coverage.some((c) => c.status === "not_attempted"))
    throw Error("All research dimensions must be attempted")
  const validated =
    candidate_review?.approved === true &&
    candidate_review?.source_reviewed === true &&
    candidate_review?.prose_reviewed === true &&
    evaluation?.critical_errors === 0 &&
    evaluation?.quality_score >= 9 &&
    evaluation?.lowest_dimension_score >= 1
  return {
    schema: "local-ai-shadow/v1",
    edition_key,
    run_id,
    actual_started_at,
    completed_at: new Date().toISOString(),
    published_by: "legacy",
    candidate_published: false,
    candidate_validated: validated,
    candidate_review,
    legacy_publication,
    coverage,
    evaluation,
    evidence_sha256: sha256(
      JSON.stringify([candidate_review, legacy_publication, coverage, evaluation]),
    ),
  }
}
export function promotionAudit(records, gates) {
  const valid = records.filter(
    (r) =>
      r.schema === "local-ai-shadow/v1" &&
      r.published_by === "legacy" &&
      r.candidate_published === false &&
      r.candidate_validated,
  )
  const editions = [...new Set(valid.map((r) => r.edition_key))]
  const failures = []
  if (editions.length < 7) failures.push("seven_distinct_successful_shadow_editions_required")
  for (const [name, pass] of Object.entries(gates)) if (pass !== true) failures.push(name)
  if (
    !gates.development_evaluation ||
    !gates.held_out_evaluation ||
    !gates.source_review_policy ||
    !gates.drive_auth ||
    !gates.recovery_verified
  )
    failures.push("all_promotion_gates_required")
  return {
    schema: "local-ai-promotion/v1",
    completed_comparisons: editions.length,
    assisted_transition_allowed: failures.length === 0,
    unattended_publication_allowed: false,
    failures: [...new Set(failures)],
  }
}
export function saveShadow(root, record) {
  return atomicWrite(root, `evaluation/shadow/${record.run_id}.json`, record)
}
