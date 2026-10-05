import { assertSchema, sha256 } from "./contracts.mjs"
import { parseResearchDate, assertReviewDate, seoulPublicationDay } from "./dates.mjs"

const text = { type: "string", minLength: 1 }
const object = (properties) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
})
const trueValue = { type: "boolean", enum: [true] }
const hash = { type: "string", pattern: "^[a-f0-9]{64}$" }
const date = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }
const publicationTimeSchema = object({
  kind: { type: "string", enum: ["source-publication-time"] },
  source_id: text,
  source_version_id: text,
  parse_id: text,
  claim_id: text,
  source_published_at: text,
  timezone: { type: "string", enum: ["Asia/Seoul"] },
})
const updateSchema = object({
  kind: { type: "string", enum: ["dated-update"] },
  source_id: text,
  source_version_id: text,
  parse_id: text,
  block_id: text,
  claim_id: text,
  date_text: text,
  source_published_at: date,
})
const statedEventDateSchema = object({
  kind: { type: "string", enum: ["source-stated-event-date"] },
  source_id: text,
  source_version_id: text,
  parse_id: text,
  block_id: text,
  claim_id: text,
  date_text: text,
  event_context_text: text,
  year_text: text,
  year_context_block_id: text,
})
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

// Only explicit reviewed civil dates are supported. A page's last-modified
// metadata alone is insufficient evidence of a new event.
export function civilDate(value) {
  const iso = parseResearchDate(value)
  if (iso?.precision === "day") return iso.day
  const m = /^(\w+) (\d{1,2}), (\d{4})$/.exec(value)
  if (!m || !months.includes(m[1])) return null
  const day = `${m[3]}-${String(months.indexOf(m[1]) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`
  return parseResearchDate(day)?.day || null
}

function civilDateWithYear(value, yearText) {
  const direct = civilDate(value)
  if (direct) return direct
  const monthDay = /^(\d{1,2}) ([A-Za-z]+)$/.exec(value)
  const dayMonth = /^([A-Za-z]+) (\d{1,2})$/.exec(value)
  const month = monthDay?.[2] || dayMonth?.[1]
  const day = monthDay?.[1] || dayMonth?.[2]
  const year = /\d{4}/.exec(yearText || "")?.[0]
  if (!month || !day || !year) return null
  const monthName = months.findIndex((value) => value.toLowerCase() === month.toLowerCase()) + 1
  if (!monthName) return null
  const result = `${year}-${String(monthName).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`
  return parseResearchDate(result)?.day || null
}

export function eventDateMetadata(review, used, parses, eventClaimIds = null) {
  const eligible = eventClaimIds ? used.filter((c) => eventClaimIds.includes(c.claim_id)) : used
  if (!review.event_date_basis) {
    if (
      !parses.some(
        (p) =>
          eligible.some((c) => c.evidence.some((e) => e.parse_id === p.parse_id)) &&
          parseResearchDate(p.dates?.published_at)?.day === review.published_at,
      )
    )
      throw Error("Article publication date requires its supporting source date")
    return {}
  }
  const b = review.event_date_basis
  if (b?.kind === "source-publication-time") {
    assertSchema(b, publicationTimeSchema)
    const p = parses.find(
      (p) =>
        p.parse_id === b.parse_id &&
        p.source_id === b.source_id &&
        p.source_version_id === b.source_version_id,
    )
    const claim = eligible.find((c) => c.claim_id === b.claim_id)
    const stamp = parseResearchDate(b.source_published_at)
    if (
      !p ||
      !claim ||
      stamp?.precision !== "timestamp" ||
      p.dates?.published_at !== b.source_published_at ||
      p.dates.precision !== "timestamp" ||
      p.dates.profile_status !== "matched" ||
      !p.dates.basis?.dom_path ||
      parseResearchDate(p.dates.basis.text)?.instant !== stamp.instant ||
      parseResearchDate(claim.published_at)?.instant !== stamp.instant ||
      !claim.evidence.some(
        (e) =>
          e.parse_id === p.parse_id &&
          e.source_id === p.source_id &&
          e.source_version_id === p.source_version_id &&
          e.support === "direct",
      ) ||
      seoulPublicationDay(b.source_published_at) !== review.published_at
    ) {
      throw Error(
        "Publication timezone conversion requires the exact used source timestamp and header evidence",
      )
    }
    return { date_kind: "source-publication-time", source_published_at: b.source_published_at }
  }
  if (b?.kind === "source-stated-event-date") {
    assertSchema(b, statedEventDateSchema)
    const p = parses.find(
      (p) =>
        p.parse_id === b.parse_id &&
        p.source_id === b.source_id &&
        p.source_version_id === b.source_version_id,
    )
    const block = p?.blocks.find((block) => block.block_id === b.block_id)
    const yearBlock = p?.blocks.find((block) => block.block_id === b.year_context_block_id)
    const claim = eligible.find((c) => c.claim_id === b.claim_id)
    const eventDate = civilDateWithYear(b.date_text, b.year_text)
    if (
      !p ||
      p.dates?.published_at !== null ||
      !block ||
      !yearBlock ||
      !claim ||
      eventDate !== review.published_at ||
      !block.text.includes(b.date_text) ||
      !block.text.includes(b.event_context_text) ||
      !yearBlock.text.includes(b.year_text) ||
      !claim.evidence.some(
        (e) =>
          e.source_id === b.source_id &&
          e.source_version_id === b.source_version_id &&
          e.parse_id === b.parse_id &&
          e.block_id === b.block_id &&
          e.quote.includes(b.date_text) &&
          e.quote.includes(b.event_context_text) &&
          e.support === "direct",
      )
    )
      throw Error("Source-stated event date requires exact reviewed date and year context")
    return { date_kind: "source-stated-event-date", source_published_at: null }
  }
  assertSchema(b, updateSchema)
  const p = parses.find(
    (p) =>
      p.parse_id === b.parse_id &&
      p.source_id === b.source_id &&
      p.source_version_id === b.source_version_id,
  )
  const block = p?.blocks.find((block) => block.block_id === b.block_id)
  const claim = eligible.find((c) => c.claim_id === b.claim_id)
  if (
    !p ||
    !block ||
    !claim ||
    parseResearchDate(p.dates?.published_at)?.day !== b.source_published_at ||
    parseResearchDate(p.dates?.modified_at)?.day !== review.published_at ||
    p.dates.modified_profile_status !== "matched" ||
    !p.dates.modified_basis?.dom_path ||
    civilDate(b.date_text) !== review.published_at ||
    !p.dates.modified_basis.text?.includes(b.date_text) ||
    !block.text.includes(b.date_text) ||
    claim.effective_period !== review.published_at ||
    !claim.evidence.some(
      (e) =>
        e.parse_id === b.parse_id &&
        e.source_id === b.source_id &&
        e.source_version_id === b.source_version_id &&
        e.block_id === b.block_id &&
        e.quote.includes(b.date_text) &&
        e.support === "direct",
    ) ||
    b.source_published_at >= review.published_at
  )
    throw Error(
      "Dated update requires a used reviewed event claim and explicit source date evidence",
    )
  return { date_kind: "dated-update", source_published_at: b.source_published_at }
}

const sectionSchema = object({
  section: { type: "string", enum: ["흐름 읽기", "오늘의 적용", "개념 색인"] },
  // Removing unsupported historical ancillary copy is currently the only
  // operation. New factual prose needs its own claim-backed authoring contract.
  content: { type: "string", enum: ["없음"] },
  reason: text,
})
const appearanceSchema = object({
  path: {
    type: "string",
    pattern: "^Editions/\\d{4}/\\d{2}/\\d{4}-\\d{2}-\\d{2}_\\d{4}_Tech_AI_Briefing\\.md$",
  },
  sha256: hash,
  before_content: text,
  previous_title: text,
  previous_published_at: { type: ["string", "null"] },
  sections: { type: "array", maxItems: 3, items: sectionSchema },
})
const retrospectiveSchema = object({
  schema_version: { type: "string", enum: ["retrospective-article-review/v1"] },
  event_id: { type: "string", pattern: "^[a-f0-9]{16}$" },
  reviewer: text,
  reviewed_at: date,
  reason: text,
  source_read: trueValue,
  date_change_checked: trueValue,
  ancillary_copy_read: trueValue,
  appearances: { type: "array", minItems: 1, items: appearanceSchema },
})
const historicalAdditionSchema = object({
  schema_version: { type: "string", enum: ["historical-addition-review/v1"] },
  event_id: { type: "string", pattern: "^[a-f0-9]{16}$" },
  reviewer: text,
  reviewed_at: date,
  reason: text,
  source_read: trueValue,
  duplicate_checked: trueValue,
  calendar_window_checked: trueValue,
  target_path: {
    type: "string",
    pattern: "^Editions/\\d{4}/\\d{2}/\\d{4}-\\d{2}-\\d{2}_\\d{4}_Tech_AI_Briefing\\.md$",
  },
  target_sha256: hash,
})

export function assertHistoricalAdditionReview(packet, review) {
  assertSchema(packet, historicalAdditionSchema)
  if (
    packet.event_id !== review.event_id ||
    packet.reviewer !== review.reviewer ||
    packet.reviewed_at !== review.reviewed_at
  )
    throw Error("Historical addition review must belong to the exact approved article")
  assertReviewDate(packet.reviewed_at, { notBefore: [review.published_at] })
  return packet
}

export function assertRetrospectiveReview(packet, review) {
  assertSchema(packet, retrospectiveSchema)
  if (
    packet.event_id !== review.event_id ||
    packet.reviewer !== review.reviewer ||
    packet.reviewed_at !== review.reviewed_at
  )
    throw Error("Retrospective review must belong to this exact editorial review")
  assertReviewDate(packet.reviewed_at, { notBefore: [review.published_at] })
  if (new Set(packet.appearances.map((a) => a.path)).size !== packet.appearances.length)
    throw Error("Unique retrospective appearances required")
  for (const a of packet.appearances) {
    if (
      sha256(a.before_content) !== a.sha256 ||
      (a.previous_published_at !== null &&
        parseResearchDate(a.previous_published_at)?.precision !== "day")
    )
      throw Error("Retrospective original bytes and previous date must be valid")
    if (new Set(a.sections.map((s) => s.section)).size !== a.sections.length)
      throw Error("Unique reviewed ancillary sections required")
  }
  return packet
}

export function assertRetrospectiveAppearance(article, original, relativePath, bytes) {
  const packet = article.retrospective_review
  if (!packet) {
    if (
      !original.review?.published_at ||
      original.review.published_at !== article.article_review.published_at
    )
      throw Error("Retrospective must preserve the original event publication date")
    return {}
  }
  assertRetrospectiveReview(packet, {
    event_id: article.event_id,
    reviewer: packet.reviewer,
    reviewed_at: article.article_review.reviewed_at,
    published_at: article.article_review.published_at,
  })
  const a = packet.appearances.find((a) => a.path === relativePath)
  if (
    !a ||
    a.previous_title !== original.title ||
    a.previous_published_at !== (original.review?.published_at || null) ||
    a.sha256 !== sha256(bytes) ||
    a.before_content !== bytes.toString("utf8")
  )
    throw Error("Retrospective review does not match the current original appearance")
  return Object.fromEntries(a.sections.map((s) => [s.section, s.content]))
}
