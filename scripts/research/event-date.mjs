import { assertSchema, sha256, sourceId } from "./contracts.mjs"
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
// Publishers may retain compact ISO offsets in raw JSON-LD. Only normalize
// that offset for instant comparison; preserve the original header text.
const headerTimestamp = (value) => {
  const iso = parseResearchDate(
    typeof value === "string" ? value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2") : value,
  )
  if (iso?.precision === "timestamp") return iso
  // RFC2822 RSS headers have an explicit offset too. Do not use permissive
  // Date.parse guesses for zone-less dates or publisher abbreviations.
  if (typeof value !== "string" || value.length > 64) return null
  const match =
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) (GMT|[+-]\d{4})$/.exec(value)
  if (!match) return null
  const month = months.findIndex((name) => name.slice(0, 3) === match[3]) + 1
  const offset = match[8] === "GMT" ? "Z" : match[8].slice(0, 3) + ":" + match[8].slice(3)
  const day = `${match[4]}-${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}`
  const stamp = parseResearchDate(`${day}T${match[5]}:${match[6]}:${match[7]}${offset}`)
  if (!stamp) return null
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
    new Date(day + "T00:00:00Z").getUTCDay()
  ]
  return weekday === match[1] ? stamp : null
}
const publicationTimeSchema = object({
  kind: { type: "string", enum: ["source-publication-time"] },
  source_id: text,
  source_version_id: text,
  parse_id: text,
  claim_id: text,
  source_published_at: text,
  timezone: { type: "string", enum: ["Asia/Seoul"] },
})
const publicationDaySchema = object({
  kind: { type: "string", enum: ["source-publication-day"] },
  source_id: text,
  source_version_id: text,
  parse_id: text,
  claim_id: text,
  source_published_at: date,
})
const originalPublicationSchema = object({
  kind: { type: "string", enum: ["source-original-publication-date"] },
  source_id: text,
  source_version_id: text,
  parse_id: text,
  block_id: text,
  claim_id: text,
  notice_text: text,
  page_published_at: text,
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
const reportedEventDateSchema = object({
  kind: { type: "string", enum: ["source-reported-event-date"] },
  source_id: text,
  source_version_id: text,
  parse_id: text,
  block_id: text,
  claim_id: text,
  date_text: text,
  event_context_text: text,
  source_published_at: date,
  occurred_at: date,
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

// An explicit original-publication notice is not an update event. A missing
// year is resolved only in a paired notice whose update date matches the
// publisher header, within that same year. Never infer a previous year.
function originalPublicationDay(notice, pageDate) {
  const datePart = "([A-Za-z]+\\.? \\d{1,2}(?:,? \\d{4})?)"
  const full = new RegExp("^originally published " + datePart + "$", "i").exec(notice)
  const pair = new RegExp(
    "^Updated " + datePart + " \\(originally published " + datePart + "\\)$",
    "i",
  ).exec(notice)
  const expand = (value) =>
    value
      .replace(
        /^[A-Za-z]+\.?/,
        (word) =>
          months.find(
            (name) =>
              name.toLowerCase() === word.toLowerCase().replace(/\.$/, "") ||
              name.slice(0, 3).toLowerCase() === word.toLowerCase().replace(/\.$/, ""),
          ) || word,
      )
      .replace(/ (\d{1,2}) (\d{4})$/, " $1, $2")
  const original = pair?.[2] || full?.[1]
  if (!original) return null
  const explicit = civilDate(expand(original))
  if (explicit) return explicit <= pageDate ? explicit : null
  if (!pair || civilDateWithYear(expand(pair[1]), pageDate.slice(0, 4)) !== pageDate) return null
  const day = civilDateWithYear(expand(original), pageDate.slice(0, 4))
  return day && day <= pageDate ? day : null
}

// Resolve only explicit recent Korean past dates against the source's civil
// publication day. Never use collection/review time or infer a missing year
// across an arbitrary interval.
function reportedKoreanDate(value, published) {
  if (parseResearchDate(published)?.precision !== "day") return null
  const [year, month] = published.split("-").map(Number)
  const previous = new Date(Date.UTC(year, month - 2, 1))
  const lastMonth = /^지난달\s*(\d{1,2})일$/.exec(value)
  const explicitMonth = /^지난\s*(\d{1,2})월\s*(\d{1,2})일$/.exec(value)
  let eventYear, eventMonth, eventDay
  if (lastMonth) {
    eventYear = previous.getUTCFullYear()
    eventMonth = previous.getUTCMonth() + 1
    eventDay = Number(lastMonth[1])
  } else if (explicitMonth) {
    eventMonth = Number(explicitMonth[1])
    eventDay = Number(explicitMonth[2])
    if (eventMonth === month) eventYear = year
    else if (eventMonth === previous.getUTCMonth() + 1) eventYear = previous.getUTCFullYear()
    else return null
  } else return null
  const day = `${eventYear}-${String(eventMonth).padStart(2, "0")}-${String(eventDay).padStart(2, "0")}`
  return parseResearchDate(day)?.day && day <= published ? day : null
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
  if (b?.kind === "source-publication-day") {
    assertSchema(b, publicationDaySchema)
    const p = parses.find(
      (p) =>
        p.parse_id === b.parse_id &&
        p.source_id === b.source_id &&
        p.source_version_id === b.source_version_id,
    )
    const claim = eligible.find((c) => c.claim_id === b.claim_id)
    const basis = p?.dates?.basis
    const locatedHeader =
      basis?.dom_path ||
      (basis?.type === "markdown" &&
        Number.isInteger(basis.line_start) &&
        basis.line_start > 0 &&
        basis.line_end === basis.line_start &&
        basis.text_hash === sha256(basis.text || "") &&
        p.blocks.some(
          (block) =>
            block.text === basis.text &&
            block.locator?.type === "markdown" &&
            block.locator.line_start === basis.line_start &&
            block.locator.line_end === basis.line_end &&
            block.locator.text_hash === basis.text_hash &&
            block.locator.source_text_hash === basis.source_text_hash &&
            /^[a-f0-9]{64}$/.test(basis.source_text_hash || ""),
        ))
    if (
      !p ||
      !claim ||
      p.dates?.profile_status !== "matched" ||
      !locatedHeader ||
      !p.dates.basis?.text ||
      parseResearchDate(p.dates.published_at)?.precision !== "day" ||
      p.dates.published_at !== b.source_published_at ||
      claim.published_at !== b.source_published_at ||
      review.published_at !== b.source_published_at ||
      !claim.evidence.some(
        (e) =>
          e.parse_id === p.parse_id &&
          e.source_id === p.source_id &&
          e.source_version_id === p.source_version_id &&
          e.support === "direct",
      )
    )
      throw Error(
        "Publication day requires an exact used source date and header evidence without timezone conversion",
      )
    return { date_kind: "source-publication-day", source_published_at: b.source_published_at }
  }
  if (b?.kind === "source-original-publication-date") {
    assertSchema(b, originalPublicationSchema)
    const p = parses.find(
      (p) =>
        p.parse_id === b.parse_id &&
        p.source_id === b.source_id &&
        p.source_version_id === b.source_version_id,
    )
    const block = p?.blocks.find((block) => block.block_id === b.block_id)
    const claim = eligible.find((c) => c.claim_id === b.claim_id)
    const pageDate = parseResearchDate(b.page_published_at)?.day
    if (
      !p ||
      !block ||
      !claim ||
      p.dates?.profile_status !== "matched" ||
      p.dates.published_at !== b.page_published_at ||
      !pageDate ||
      block.locator?.text_hash !== sha256(block.text) ||
      !block.text.includes(b.notice_text) ||
      originalPublicationDay(b.notice_text, pageDate) !== review.published_at ||
      !claim.evidence.some(
        (e) =>
          e.source_id === b.source_id &&
          e.source_version_id === b.source_version_id &&
          e.parse_id === b.parse_id &&
          e.block_id === b.block_id &&
          e.support === "direct" &&
          e.quote.includes(b.notice_text) &&
          block.text.includes(e.quote),
      )
    )
      throw Error("Original publication requires an exact used notice and matching publisher date")
    return {
      date_kind: "source-original-publication-date",
      source_published_at: review.published_at,
    }
  }
  if (b?.kind === "source-reported-event-date") {
    assertSchema(b, reportedEventDateSchema)
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
      p.dates?.profile_status !== "matched" ||
      p.dates.published_at !== b.source_published_at ||
      review.published_at !== b.source_published_at ||
      reportedKoreanDate(b.date_text, b.source_published_at) !== b.occurred_at ||
      block.locator?.text_hash !== sha256(block.text) ||
      !block.text.includes(b.date_text) ||
      !block.text.includes(b.event_context_text) ||
      !claim.statement.includes(b.event_context_text) ||
      claim.review?.status !== "verified" ||
      claim.event_state !== "completed" ||
      !claim.evidence.some(
        (e) =>
          e.source_id === b.source_id &&
          e.source_version_id === b.source_version_id &&
          e.parse_id === b.parse_id &&
          e.block_id === b.block_id &&
          e.support === "direct" &&
          block.text.includes(e.quote) &&
          e.quote.includes(b.date_text) &&
          e.quote.includes(b.event_context_text),
      )
    )
      throw Error("Reported event date requires an exact reviewed past date and publication anchor")
    return {
      date_kind: "source-reported-event-date",
      source_published_at: b.source_published_at,
      occurred_at: b.occurred_at,
    }
  }
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
    const basis = p?.dates?.basis
    // The common HTML resolver also records a single publication meta field
    // without a configured selector. Retain its exact candidate, parser
    // identity and head locator; an uncorroborated meta array is insufficient.
    const meta = basis?.sources?.length === 1 ? basis.sources[0] : null
    const singlePublicationMeta =
      p?.parser?.id === "trafilatura" &&
      typeof p.parser.version === "string" &&
      p.parser.version.length > 0 &&
      /^[a-f0-9]{64}$/.test(p.parser.adapter_sha256 || "") &&
      /^[a-f0-9]{64}$/.test(p.parser.config_hash || "") &&
      Array.isArray(p.dates.candidates) &&
      p.dates.candidates.length === 1 &&
      parseResearchDate(p.dates.candidates[0])?.instant === stamp?.instant &&
      meta?.type === "meta" &&
      /^\/html\/head\/meta\[[1-9][0-9]*\]$/.test(meta.dom_path || "") &&
      meta.attribute === "content" &&
      parseResearchDate(meta.text)?.precision === "timestamp" &&
      parseResearchDate(meta.text)?.instant === stamp?.instant
    // Earlier HTML parses retain JSON-LD script index/type/field provenance
    // without a DOM path. Use only their bounded Article datePublished
    // records, all agreeing on the exact instant; never dateModified or an
    // arbitrary WebPage date. Stored parse/source bytes are checked upstream.
    const socialPublicationSource = (source) =>
      typeof source.source_url === "string" &&
      /^https?:\/\//.test(source.source_url) &&
      sourceId(source.source_url) === p.source_id &&
      typeof source.main_entity_url === "string" &&
      typeof source.posting_url === "string" &&
      source.main_entity_url.replace(/\/$/, "") === source.source_url.replace(/\/$/, "") &&
      source.posting_url.replace(/\/$/, "") === source.source_url.replace(/\/$/, "")
    const articlePublicationSource = (source) =>
      source.type === "json-ld" &&
      Number.isInteger(source.script_index) &&
      source.script_index >= 0 &&
      source.script_index < 32 &&
      source.attribute === "datePublished" &&
      Array.isArray(source.node_type) &&
      source.node_type.some(
        (type) =>
          typeof type === "string" &&
          [
            "Article",
            "NewsArticle",
            "TechArticle",
            "BlogPosting",
            "Report",
            "SocialMediaPosting",
          ].includes(type.split("/").at(-1)),
      ) &&
      (!source.node_type.some(
        (type) => typeof type === "string" && type.split("/").at(-1) === "SocialMediaPosting",
      ) ||
        socialPublicationSource(source)) &&
      headerTimestamp(source.text)?.precision === "timestamp" &&
      headerTimestamp(source.text)?.instant === stamp?.instant
    const structuredBasis =
      p?.parser?.id === "trafilatura" &&
      Array.isArray(basis?.sources) &&
      basis.sources.length > 0 &&
      basis.sources.length <= 32 &&
      basis.sources.some(articlePublicationSource) &&
      basis.sources.every(
        (source) =>
          articlePublicationSource(source) ||
          (source.type === "meta" &&
            /^\/html\/head\/meta\[[1-9][0-9]*\]$/.test(source.dom_path || "") &&
            source.attribute === "content" &&
            parseResearchDate(source.text)?.precision === "timestamp" &&
            parseResearchDate(source.text)?.instant === stamp?.instant) ||
          (source.type === "time-itemprop" &&
            /^\/html\/body\/.+\/time(?:\[[1-9][0-9]*\])?$/.test(source.dom_path || "") &&
            source.attribute === "datetime" &&
            parseResearchDate(source.text)?.precision === "timestamp" &&
            parseResearchDate(source.text)?.instant === stamp?.instant),
      )
    const jsonBasis =
      p?.parser?.id === "json-document" &&
      basis?.type === "json" &&
      typeof basis.json_pointer === "string" &&
      /^\/(?:[^~]|~[01])*$/.test(basis.json_pointer) &&
      basis.json_pointer.length <= 1024 &&
      typeof basis.text === "string" &&
      basis.text_hash === sha256(basis.text.trim().replace(/\s+/g, " ")) &&
      p.blocks.some((block) => {
        return (
          block?.locator.type === "json" &&
          !block.locator.record &&
          block.locator.json_pointer === basis.json_pointer &&
          block.locator.field_sha256 === sha256(basis.text) &&
          block.locator.text_hash === sha256(block.text) &&
          block.text === basis.text.trim().replace(/\s+/g, " ")
        )
      }) &&
      // Publication is source metadata, not another event fact. Require its
      // exact root field plus a used, quoted claim from this same source/parse.
      claim?.evidence.some((e) => {
        const block = p.blocks.find((block) => block.block_id === e.block_id)
        return (
          e.parse_id === p.parse_id &&
          e.source_id === p.source_id &&
          e.source_version_id === p.source_version_id &&
          e.support === "direct" &&
          typeof e.quote === "string" &&
          e.quote.trim().length > 0 &&
          block?.locator.type === "json" &&
          block.locator.text_hash === sha256(block.text) &&
          block.text.includes(e.quote)
        )
      })
    if (
      !p ||
      !claim ||
      stamp?.precision !== "timestamp" ||
      p.dates?.published_at !== b.source_published_at ||
      p.dates.precision !== "timestamp" ||
      p.dates.profile_status !== "matched" ||
      (!basis?.dom_path && !jsonBasis && !structuredBasis && !singlePublicationMeta) ||
      (!structuredBasis &&
        !singlePublicationMeta &&
        headerTimestamp(p.dates.basis.text)?.instant !== stamp.instant) ||
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
