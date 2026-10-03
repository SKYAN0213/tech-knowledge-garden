// This key only finds a potential duplicate. Matching titles and days do not
// establish event identity without an original-source review.
export function titleDayKey(title, publishedAt) {
  if (typeof title !== "string" || typeof publishedAt !== "string") return null
  const day = publishedAt.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const normalized = title
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, "")
  return normalized ? `${day}:${normalized}` : null
}

// A changed binding is a private review lead, never a new event or a correction.
export function approvalSourceChange(candidate) {
  const approval = candidate.approval
  if (!approval || approval.source_alternative_resolution_run) return null
  const current = candidate.article_source_version_id
  if (!current || !approval.source_version_id) return null
  const reason =
    current.split(":")[0] !== approval.source_version_id.split(":")[0]
      ? "source_identity_conflict"
      : candidate.article_content_sha256 &&
          approval.article_content_sha256 &&
          candidate.article_content_sha256 !== approval.article_content_sha256
        ? "content_changed"
        : current !== approval.source_version_id
          ? "same_source_new_version"
          : candidate.article_parse_id && candidate.article_parse_id !== approval.parse_id
            ? "same_source_new_parse"
            : null
  return reason
    ? {
        reason,
        reviewed_source_version_id: approval.source_version_id,
        current_source_version_id: current,
        reviewed_parse_id: approval.parse_id,
        current_parse_id: candidate.article_parse_id || null,
        reviewed_content_sha256: approval.article_content_sha256 || null,
        current_content_sha256: candidate.article_content_sha256 || null,
      }
    : null
}
