// Source days retain their published calendar date. Review timestamps use KST
// for day comparisons and their real instant for timestamp comparisons.
const kstDay = (value) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(value))

export function parseResearchDate(value) {
  if (typeof value !== "string") return null
  const match =
    /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2}))?$/.exec(
      value,
    )
  if (!match || Number(match[1].slice(0, 4)) < 1) return null
  const day = match[1]
  const midnight = Date.parse(day + "T00:00:00Z")
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== day)
    return null
  if (match[2] !== undefined) {
    if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return null
    if (match[5] !== "Z" && (Number(match[5].slice(1, 3)) > 23 || Number(match[5].slice(4)) > 59))
      return null
  }
  const instant = match[2] === undefined ? midnight : Date.parse(value)
  return Number.isFinite(instant)
    ? { day, instant, precision: match[2] === undefined ? "day" : "timestamp" }
    : null
}

export function samePublicationDate(claimDate, sourceDate) {
  const claim = parseResearchDate(claimDate),
    source = parseResearchDate(sourceDate)
  if (!claim || !source) return false
  if (claim.precision === "timestamp")
    return source.precision === "timestamp" && claim.instant === source.instant
  return claim.day === source.day
}

// Translate only an explicit instant. Day-only dates have no recoverable zone.
export function seoulPublicationDay(value) {
  const parsed = parseResearchDate(value)
  return parsed?.precision === "timestamp" ? kstDay(parsed.instant) : null
}

export function assertReviewDate(value, { notBefore = [] } = {}) {
  const review = parseResearchDate(value)
  if (!review) throw Error("Valid review date with an explicit timestamp offset required")
  const now = Date.now(),
    reviewDay = review.precision === "day" ? review.day : kstDay(review.instant)
  if (review.precision === "day" ? review.day > kstDay(now) : review.instant > now)
    throw Error("Review date cannot be in the future")
  for (const bound of notBefore.filter((v) => v !== null && v !== undefined)) {
    const before = parseResearchDate(bound)
    if (!before) throw Error("Invalid source date or observation timestamp")
    if (review.precision === "timestamp" && before.precision === "timestamp") {
      if (review.instant < before.instant) throw Error("Review time precedes source observation")
    } else if (reviewDay < (before.precision === "day" ? before.day : kstDay(before.instant)))
      throw Error("Review date precedes source publication or observation")
  }
  return review
}
