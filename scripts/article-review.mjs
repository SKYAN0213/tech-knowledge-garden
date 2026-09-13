// Public review metadata contains no private review notes or reasoning.
export function articleReview(edition, title, fallbackId) {
  const records = edition.meta.article_reviews
  if (records === undefined)
    return { event_id: fallbackId, review_status: "unreviewed", concept_ids: [] }
  if (!Array.isArray(records)) throw Error("article_reviews must be an array")
  const matches = records.filter((r) => r.title === title)
  if (matches.length !== 1) throw Error("Each article needs exactly one review record: " + title)
  const r = matches[0]
  if (!/^[a-f0-9]{16}$/.test(r.event_id)) throw Error("Invalid stable event ID")
  if (!["unreviewed", "verified", "excluded"].includes(r.review_status))
    throw Error("Invalid review status")
  const day = (s) =>
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
  if (
    r.review_status === "verified" &&
    (!day(r.published_at) || !day(r.reviewed_at) || r.reviewed_at < r.published_at)
  )
    throw Error("Verified article needs valid publication and review dates")
  if (
    !Array.isArray(r.concept_ids) ||
    r.concept_ids.some((id) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) ||
    new Set(r.concept_ids).size !== r.concept_ids.length
  )
    throw Error("Invalid concept IDs")
  if (r.review_status !== "verified" && r.concept_ids.length)
    throw Error("Only verified articles may add concept evidence")
  return {
    event_id: r.event_id,
    review_status: r.review_status,
    concept_ids: r.concept_ids,
    ...(r.published_at ? { published_at: r.published_at } : {}),
    ...(r.reviewed_at ? { reviewed_at: r.reviewed_at } : {}),
  }
}

export function excludedEventIds(editions) {
  const ids = new Set()
  for (const edition of editions) {
    const values = edition.meta.excluded_events || []
    if (!Array.isArray(values)) throw Error("excluded_events must be an ID array")
    for (const id of values) {
      if (!/^[a-f0-9]{16}$/.test(id)) throw Error("Invalid excluded event ID")
      ids.add(id)
    }
  }
  return ids
}
export function assertPublicArticles(articles, excluded) {
  for (const a of articles) {
    if (excluded.has(a.id) || a.review?.review_status === "excluded")
      throw Error(
        "Excluded article must be privately archived and removed from all public editions: " + a.id,
      )
  }
}
