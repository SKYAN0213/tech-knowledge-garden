import { parseResearchDate } from "./research/dates.mjs"

// Missing historical cutoffs remain unknown. This marker is never a new daily
// research window, a feed timestamp, or permission to publish unreviewed prose.
export function hasUnrecordedHistoricalCoverage(meta) {
  if (meta.historical_coverage === undefined) return false
  const date = parseResearchDate(meta.date)
  const reviews = meta.article_reviews
  const records = meta.article_records
  if (
    meta.historical_coverage !== "unrecorded/v1" ||
    meta.schema_version !== "tech-ai-magazine/v2" ||
    meta.editorial_format !== "six-w/v1" ||
    date?.precision !== "day" ||
    meta.date >= "2026-09-14" ||
    meta.timezone !== "Asia/Seoul" ||
    meta.coverage_start !== null ||
    meta.coverage_end !== null ||
    !Array.isArray(reviews) ||
    !Array.isArray(records) ||
    !records.length ||
    records.length !== reviews.length ||
    meta.new_items_count !== records.length ||
    new Set(reviews.map((r) => r.event_id)).size !== reviews.length ||
    reviews.some(
      (r) =>
        r.review_status !== "verified" ||
        !/^[a-f0-9]{16}$/.test(r.event_id) ||
        parseResearchDate(r.published_at)?.precision !== "day" ||
        r.published_at > meta.date ||
        parseResearchDate(r.reviewed_at)?.precision !== "day" ||
        r.reviewed_at < meta.date ||
        records.filter((record) => record.title === r.title).length !== 1,
    )
  )
    throw Error("Unrecorded historical coverage requires a complete verified pre-September edition")
  return true
}
