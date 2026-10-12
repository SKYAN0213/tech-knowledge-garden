import { parseResearchDate, seoulPublicationDay } from "./dates.mjs"

// event_date remains the exact source publication value. occurred_at is an
// optional, separately reviewed calendar day; these helpers never grant review.
export function assertSignalDateMetadata(signal, { articles = [] } = {}) {
  if (signal.occurred_at === undefined) return null
  const occurred = parseResearchDate(signal.occurred_at),
    published = parseResearchDate(signal.event_date)
  if (
    occurred?.precision !== "day" ||
    !published ||
    occurred.day > (seoulPublicationDay(signal.event_date) || published.day) ||
    (signal.source_published_at !== undefined && signal.source_published_at !== signal.event_date)
  )
    throw Error(
      "Signal occurred_at needs an actual calendar day and unchanged source publication date",
    )
  for (const article of articles) {
    const review = article?.article_review || article?.review || article,
      eventId = article?.event_id || article?.id || review?.event_id
    if (
      eventId === signal.event_id &&
      review?.occurred_at !== undefined &&
      review.occurred_at !== signal.occurred_at
    )
      throw Error("Signal occurred_at conflicts with the native article event date")
  }
  return signal.occurred_at
}

// Callers supply facts already checked against their stored parses or ontology.
// Explicit event bindings prevent evidence from another event authorizing a day.
export function assertSignalOccurredAt(signal, { facts = [], articles = [] } = {}) {
  const occurred = assertSignalDateMetadata(signal, { articles })
  if (occurred === null) return null
  if (
    !facts.some(
      ({ event_id, claim }) =>
        event_id === signal.event_id &&
        (!claim.event_id || claim.event_id === signal.event_id) &&
        (claim.review?.status || claim.review_status) === "verified" &&
        ["reported", "completed", "in_progress"].includes(claim.event_state) &&
        claim.published_at === signal.event_date &&
        claim.effective_period === occurred,
    )
  )
    throw Error("Signal occurred_at needs an exact verified effective_period from the same event")
  return occurred
}

export function signalHistoryDate(signal, { publishedAt, fallback } = {}) {
  if (signal.occurred_at !== undefined) return signal.occurred_at
  const published =
    publishedAt ||
    signal.published_at ||
    signal.event_date ||
    signal.source_published_at ||
    fallback
  return seoulPublicationDay(published) || published
}
