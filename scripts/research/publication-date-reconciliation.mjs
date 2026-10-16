import { parseResearchDate } from "./dates.mjs"

// Chronology can use an explicitly parsed header while an image-only body
// waits for OCR/review. This never makes the body readable or a candidate.
export function hasImagePublicationMetadata(article) {
  return Boolean(article?.status === "partial" && article.quality?.required_fields_present === false &&
    article.title_profile_status === "matched" && article.title?.trim() &&
    article.dates?.profile_status === "matched" && article.dates.basis?.dom_path && article.dates.basis?.text &&
    parseResearchDate(article.dates.published_at) && article.blocks?.length === 0 &&
    Array.isArray(article.body_images) && article.body_images.length > 0 && article.body_images.length <= 7)
}

// A feed can list a release later than its original publication. Only opt-in
// routes with an independently selected, explicit article header may reconcile
// that case. A forward date, missing header or either date outside this window
// remains a conflict. No guessed timezone or one-day tolerance is applied.
export function reconcilePublicationDay(link, article, window, policy) {
  if (policy !== "explicit-original-within-window" ||
      article?.dates?.profile_status !== "matched" || !article.dates.basis?.dom_path || !article.dates.basis?.text)
    return null
  const listed = parseResearchDate(link.published_at)?.day
  const original = parseResearchDate(article.dates.published_at)?.day
  if (!listed || !original || original >= listed ||
      !window || original < window.since || listed >= window.until ||
      !link.listing_source_version_id || !link.listing_parse_id)
    return null
  return {
    rule: policy, listed_at: listed, source_published_at: original,
    listing_source_version_id: link.listing_source_version_id, listing_parse_id: link.listing_parse_id,
    source_version_id: article.source_version_id, parse_id: article.parse_id,
    source_date_basis: article.dates.basis,
  }
}
