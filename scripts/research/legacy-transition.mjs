import { unified } from "unified"
import remarkParse from "remark-parse"
import { canonicalURL, parseNote } from "../garden.mjs"
import { assertSchema, sha256 } from "./contracts.mjs"
import { assertReviewDate, parseResearchDate, seoulPublicationDay } from "./dates.mjs"
import { legacyReviewUnits } from "./legacy-review.mjs"
import { SECTORS, briefingGroupFields, reviewedBriefingGroups } from "../sectors.mjs"

const object = (properties) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
})
const text = { type: "string", minLength: 1 }
const hash = { type: "string", pattern: "^[a-f0-9]{64}$" }
const eventID = { type: "string", pattern: "^[a-f0-9]{16}$" }
const unitID = { type: "string", pattern: "^[a-f0-9]{20}$" }
const eventSchema = object({
  event_id: eventID,
  unit_id: unitID,
  previous_title: text,
  source_urls: { type: "array", minItems: 1, items: text },
})
eventSchema.properties.source_list_review = object({
  source_list_read: { type: "boolean", enum: [true] },
  article_source_read: { type: "boolean", enum: [true] },
  association_checked: { type: "boolean", enum: [true] },
  reason: text,
})
eventSchema.properties.source_list_event_review = object({
  mention_unit_id: unitID,
  mention_sha256: hash,
  original_mention: { type: "string", minLength: 8 },
  original_event_checked: { type: "boolean", enum: [true] },
  reason: text,
})
eventSchema.properties.section_event_review = object({
  sha256: hash,
  original_mention: { type: "string", minLength: 8 },
  original_event_checked: { type: "boolean", enum: [true] },
  reason: text,
})
eventSchema.properties.event_split_review = object({
  distinct_event_checked: { type: "boolean", enum: [true] },
  reason: text,
})
eventSchema.properties.source_alternative_reviews = {
  type: "array",
  minItems: 1,
  items: object({
    original_url: text,
    alternative_url: text,
    alternative_source_read: { type: "boolean", enum: [true] },
    official_source_checked: { type: "boolean", enum: [true] },
    same_event_checked: { type: "boolean", enum: [true] },
    event_date_checked: { type: "boolean", enum: [true] },
    reason: text,
  }),
}
const packetSchema = object({
  schema: { type: "string", enum: ["research-legacy-edition-transition/v1"] },
  reviewer: text,
  reviewed_at: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  original_read: { type: "boolean", enum: [true] },
  source_read: { type: "boolean", enum: [true] },
  duplicate_checked: { type: "boolean", enum: [true] },
  reason: text,
  target_path: {
    type: "string",
    pattern: "^Editions/\\d{4}/\\d{2}/\\d{4}-\\d{2}-\\d{2}_\\d{4}_Tech_AI_Briefing\\.md$",
  },
  target_sha256: hash,
  before_content: { type: "string", minLength: 1, maxLength: 262144 },
  events: {
    type: "array",
    minItems: 0,
    maxItems: 40,
    items: eventSchema,
  },
  units: {
    type: "array",
    minItems: 1,
    items: object({
      unit_id: unitID,
      sha256: hash,
      decision: {
        type: "string",
        enum: ["replaced", "omitted_empty", "omitted_editorial", "omitted_discovery"],
      },
      event_ids: { type: "array", items: eventID },
      reason: text,
    }),
  },
})
packetSchema.properties.no_article_review = object({
  original_content_checked: { type: "boolean", enum: [true] },
  article_sections_checked: { type: "boolean", enum: [true] },
  discovery_routes_checked: { type: "boolean", enum: [true] },
  unsupported_no_news_claims_removed: { type: "boolean", enum: [true] },
  reason: text,
})
packetSchema.properties.briefing_group_review = object({
  grouping_basis_checked: { type: "boolean", enum: [true] },
  article_details_preserved: { type: "boolean", enum: [true] },
  distinct_events_preserved: { type: "boolean", enum: [true] },
  reason: text,
  groups: {
    type: "array",
    minItems: 1,
    maxItems: 20,
    items: object({
      id: { type: "string", pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$" },
      title: { type: "string", minLength: 1, maxLength: 140 },
      sector: { type: "string", enum: SECTORS },
      event_ids: { type: "array", minItems: 2, maxItems: 40, items: eventID },
      source_urls: { type: "array", minItems: 1, items: text },
      reason: text,
    }),
  },
})
export function legacyBriefingGroups(packet, articles) {
  const review = packet?.briefing_group_review
  if (!review) return null
  if (!review.reason.trim()) throw Error("Briefing grouping requires an explicit editorial basis")
  const groups = review.groups.map((group) => {
    const sources = [
      ...new Set(
        group.event_ids
          .flatMap((id) => articles.find((a) => a.event_id === id)?.source_urls || [])
          .map(canonicalURL),
      ),
    ].sort()
    if (
      !group.reason.trim() ||
      JSON.stringify(sources) !== JSON.stringify(group.source_urls.map(canonicalURL).sort())
    )
      throw Error("Briefing group must retain every member's exact approved sources")
    return Object.fromEntries(briefingGroupFields.map((field) => [field, group[field]]))
  })
  return reviewedBriefingGroups(
    groups,
    articles.map((a) => ({ id: a.event_id, sector: a.sector, review: a.article_review })),
  )
}
packetSchema.properties.metadata_review = object({
  metadata_read: { type: "boolean", enum: [true] },
  dispositions: {
    type: "array",
    minItems: 1,
    maxItems: 4,
    items: object({
      field: { type: "string", enum: ["time", "type", "tags", "excluded_items_count"] },
      action: { type: "string", enum: ["preserve", "private_only"] },
      reason: text,
    }),
  },
})
packetSchema.properties.unrecorded_coverage_review = object({
  original_metadata_read: { type: "boolean", enum: [true] },
  original_archive_read: { type: "boolean", enum: [true] },
  edition_identity_checked: { type: "boolean", enum: [true] },
  timezone_checked: { type: "boolean", enum: [true] },
  cutoffs_not_recorded: { type: "boolean", enum: [true] },
  reason: text,
})
packetSchema.properties.source_list_dispositions = {
  type: "array",
  minItems: 1,
  maxItems: 500,
  items: object({
    url: text,
    role: { type: "string", enum: ["discovery", "excluded"] },
    source_role_checked: { type: "boolean", enum: [true] },
    reason: text,
  }),
}
packetSchema.properties.source_list_dispositions.items.properties.exclusion_review = object({
  unit_id: unitID,
  sha256: hash,
  original_statement: { type: "string", minLength: 8 },
  alternative_url: text,
  original_source_checked: { type: "boolean", enum: [true] },
  alternative_source_checked: { type: "boolean", enum: [true] },
  core_facts_unconfirmed: { type: "boolean", enum: [true] },
  reason: text,
})
packetSchema.properties.inline_discovery_dispositions = {
  type: "array",
  minItems: 1,
  maxItems: 40,
  items: object({
    unit_id: unitID,
    sha256: hash,
    url: text,
    role: { type: "string", enum: ["discovery"] },
    source_role_checked: { type: "boolean", enum: [true] },
    article_sources_read: { type: "boolean", enum: [true] },
    association_checked: { type: "boolean", enum: [true] },
    reason: text,
  }),
}
packetSchema.properties.units.items.properties.duplicate_event_review = object({
  original_read: { type: "boolean", enum: [true] },
  source_read: { type: "boolean", enum: [true] },
  same_event_checked: { type: "boolean", enum: [true] },
  dates_checked: { type: "boolean", enum: [true] },
  reason: text,
})
const markdown = unified().use(remarkParse)
const urlsIn = (content) =>
  [...new Set((content.match(/https?:\/\/[^\s<>\]\)]+/g) || []).map(canonicalURL))].sort()
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const baseMetadata = new Set([
  "title",
  "date",
  "timezone",
  "coverage_start",
  "coverage_end",
  "source_count",
  "new_items_count",
  "linked_knowledge_notes",
  "knowledge_notes_created",
  "knowledge_notes_updated",
])
// Historical editions used both heading sets. Resolve only these exact section
// names for review; original text, unit hashes and source identities stay fixed.
const legacySectionTitle = (title) =>
  ({
    "Executive Summary": "한눈에 보기",
    "Major News": "오늘의 핵심 기사",
    "Important Papers": "논문과 연구",
    "Open Source & Tools": "오픈소스와 도구",
    "Industry Analysis": "흐름 읽기",
    "Actionable Insights": "바로 써먹을 점",
  })[title] || title

function assertMetadataReview(packet, meta, relativePath) {
  const fields = Object.keys(meta)
    .filter((field) => !baseMetadata.has(field))
    .sort()
  const dispositions = packet.metadata_review?.dispositions || []
  if (
    !same(fields, dispositions.map((d) => d.field).sort()) ||
    dispositions.some(
      (d) =>
        !d.reason.trim() ||
        d.action !== (d.field === "excluded_items_count" ? "private_only" : "preserve"),
    )
  ) {
    throw Error("Legacy metadata requires one explicit disposition for every additional field")
  }
  const key = relativePath.split("/").at(-1)
  if (
    (fields.includes("time") &&
      (!/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(meta.time) ||
        meta.time !== `${key.slice(11, 13)}:${key.slice(13, 15)}`)) ||
    (fields.includes("type") && meta.type !== "briefing") ||
    (fields.includes("tags") &&
      (!Array.isArray(meta.tags) ||
        meta.tags.length > 64 ||
        new Set(meta.tags).size !== meta.tags.length ||
        meta.tags.some(
          (tag) => typeof tag !== "string" || !tag.trim() || tag.trim() !== tag || tag.length > 100,
        ))) ||
    (fields.includes("excluded_items_count") &&
      (!Number.isSafeInteger(meta.excluded_items_count) || meta.excluded_items_count < 0))
  ) {
    throw Error("Legacy metadata values do not match the preserved edition identity and types")
  }
}

function eventInsideCoverage(article, meta, day) {
  if (meta.historical_coverage === "unrecorded/v1")
    return (
      parseResearchDate(article.article_review?.published_at)?.precision === "day" &&
      article.article_review.published_at <= day
    )
  const review = article.article_review
  if (review?.date_kind === "source-publication-time") {
    const source = parseResearchDate(review.source_published_at)
    return (
      source?.precision === "timestamp" &&
      seoulPublicationDay(review.source_published_at) === review.published_at &&
      source.instant > parseResearchDate(meta.coverage_start).instant &&
      source.instant <= parseResearchDate(meta.coverage_end).instant
    )
  }
  return review?.published_at <= day && review?.published_at >= meta.coverage_start.slice(0, 10)
}

// Metadata eligibility is not source review or publication approval. Inventory
// uses the same checks as transition so missing historical cutoffs surface early.
export function legacyTransitionReadiness(meta, relativePath) {
  const day = relativePath.split("/").at(-1).slice(0, 10)
  const issues = []
  if (meta.date !== day) issues.push("date")
  if (
    relativePath !==
    `Editions/${day.slice(0, 4)}/${day.slice(5, 7)}/${relativePath.split("/").at(-1)}`
  )
    issues.push("path")
  if (meta.timezone !== "Asia/Seoul") issues.push("timezone")
  const start = parseResearchDate(meta.coverage_start)
  const end = parseResearchDate(meta.coverage_end)
  if (!start) issues.push("coverage_start")
  if (!end) issues.push("coverage_end")
  if (start && end && start.instant >= end.instant) issues.push("coverage_order")
  return {
    status: issues.length ? "metadata_recovery_required" : "metadata_ready",
    issues,
    ...(Object.keys(meta).some((field) => !baseMetadata.has(field))
      ? {
          metadata_review_fields: Object.keys(meta).filter((field) => !baseMetadata.has(field)),
        }
      : {}),
  }
}

// Called only with the exact original, never editions()'s inferred routing date.
// A reviewed unknown interval preserves nulls instead of inventing timestamps.
export function legacyTransitionMetadata(packet, meta, relativePath) {
  const readiness = legacyTransitionReadiness(meta, relativePath)
  if (!packet.unrecorded_coverage_review) {
    if (readiness.issues.length)
      throw Error("Legacy transition requires preserved edition identity and cutoffs")
    return meta
  }
  const review = packet.unrecorded_coverage_review
  const day = relativePath.split("/").at(-1).slice(0, 10)
  if (
    !review.reason.trim() ||
    ![
      "original_metadata_read",
      "original_archive_read",
      "edition_identity_checked",
      "timezone_checked",
      "cutoffs_not_recorded",
    ].every((field) => review[field] === true) ||
    parseResearchDate(day)?.precision !== "day" ||
    day >= "2026-09-14" ||
    !readiness.issues.includes("coverage_start") ||
    !readiness.issues.includes("coverage_end") ||
    Object.hasOwn(meta, "coverage_start") ||
    Object.hasOwn(meta, "coverage_end") ||
    (Object.hasOwn(meta, "date") && meta.date !== day) ||
    (Object.hasOwn(meta, "timezone") && meta.timezone !== "Asia/Seoul") ||
    readiness.issues.some(
      (field) => !["date", "timezone", "coverage_start", "coverage_end"].includes(field),
    )
  )
    throw Error("Unrecorded coverage review cannot replace known, invalid or current cutoffs")
  return {
    ...meta,
    date: day,
    timezone: "Asia/Seoul",
    coverage_start: null,
    coverage_end: null,
    historical_coverage: "unrecorded/v1",
  }
}

// Resolve explicit original citations only. Ambiguous or dangling markers must
// never silently become source-free prose eligible for manual reassignment.
function legacySources(body, units) {
  const list = units
    .filter((unit) => unit.depth === 1 && unit.title === "Source List")
    .map((unit) => body.slice(unit.body_start, unit.body_end))
    .join("\n")
  const markers = new Map()
  for (const line of list.split("\n")) {
    const ids = [...line.matchAll(/\[(S\d+)\]/g)].map((match) => match[1])
    if (!ids.length) continue
    const urls = urlsIn(line)
    if (ids.length !== 1 || urls.length !== 1 || markers.has(ids[0]))
      throw Error("Legacy source markers require one unique original list entry")
    markers.set(ids[0], urls[0])
  }
  return {
    listed: new Set(urlsIn(list)),
    forContent(content) {
      const cited = [...content.matchAll(/\[(S\d+)\]/g)].map((match) => {
        const url = markers.get(match[1])
        if (!url) throw Error("Legacy source marker has no original list entry")
        return url
      })
      return [...new Set([...urlsIn(content), ...cited])].sort()
    },
  }
}

// Every original unit must have an explicit disposition. This prevents the
// pre-v2 extractor's empty article list from authorizing a partial replacement.
export function assertLegacyTransition(packet, articles, existing, relativePath) {
  assertSchema(packet, packetSchema)
  if (
    !packet.reviewer.trim() ||
    !packet.reason.trim() ||
    packet.units.some((unit) => !unit.reason.trim())
  )
    throw Error("Legacy transition requires named review and explicit reasons")
  if (packet.target_path !== relativePath || sha256(packet.before_content) !== packet.target_sha256)
    throw Error("Legacy transition source path/hash mismatch")
  const before = parseNote(packet.before_content)
  if (
    !existing ||
    !same(existing.meta, before.meta) ||
    existing.body !== before.body ||
    before.meta.schema_version === "tech-ai-magazine/v2"
  )
    throw Error("Legacy transition requires the exact pre-v2 original")
  const day = packet.target_path.split("/").at(-1).slice(0, 10)
  const metadata = legacyTransitionMetadata(packet, before.meta, packet.target_path)
  if (packet.unrecorded_coverage_review && !articles.length)
    throw Error("Unrecorded coverage transition requires verified source events")
  assertMetadataReview(packet, before.meta, relativePath)
  assertReviewDate(packet.reviewed_at, {
    notBefore: [day, ...articles.map((a) => a.article_review?.reviewed_at)],
  })
  const units = legacyReviewUnits(before.body, relativePath)
  const noArticles = packet.events.length === 0
  if (
    noArticles
      ? !packet.no_article_review?.reason.trim() ||
        articles.length !== 0 ||
        before.meta.new_items_count !== 0 ||
        ["linked_knowledge_notes", "knowledge_notes_created", "knowledge_notes_updated"].some(
          (field) =>
            before.meta[field] !== undefined &&
            (!Array.isArray(before.meta[field]) || before.meta[field].length !== 0),
        ) ||
        units.some((unit) => unit.depth !== 1) ||
        !same(
          units.map((unit) => legacySectionTitle(unit.title)),
          [
            "한눈에 보기",
            "오늘의 핵심 기사",
            "논문과 연구",
            "오픈소스와 도구",
            "흐름 읽기",
            "바로 써먹을 점",
            "Source List",
          ],
        )
      : packet.no_article_review !== undefined
  )
    throw Error(
      "Article-free legacy transition requires explicit review of the original empty article sections",
    )
  if (
    !same(
      packet.units.map((u) => [u.unit_id, u.sha256]),
      units.map((u) => [u.unit_id, u.sha256]),
    )
  )
    throw Error("Legacy transition must review every original unit in order")
  const ids = packet.events.map((e) => e.event_id)
  if (
    new Set(ids).size !== ids.length ||
    !same([...ids].sort(), articles.map((a) => a.event_id).sort()) ||
    articles.some(
      (a) =>
        a.legacy ||
        !a.record ||
        a.article_review?.review_status !== "verified" ||
        a.retrospective_review ||
        a.historical_addition_review ||
        !eventInsideCoverage(a, metadata, day),
    )
  )
    throw Error("Legacy transition requires exactly all distinct reviewed source events")
  const byID = new Map(articles.map((a) => [a.event_id, a]))
  legacyBriefingGroups(packet, articles)
  const sources = legacySources(before.body, units)
  const assigned = new Set(packet.events.flatMap((event) => event.source_urls.map(canonicalURL)))
  const approved = new Set(articles.flatMap((article) => article.source_urls.map(canonicalURL)))
  const inline = new Set(
    units
      .filter((unit) => !(unit.depth === 1 && unit.title === "Source List"))
      .flatMap((unit) => sources.forContent(before.body.slice(unit.body_start, unit.body_end))),
  )
  const discovery = new Set()
  const excluded = new Set()
  for (const row of packet.source_list_dispositions || []) {
    const url = canonicalURL(row.url)
    if (
      !row.reason.trim() ||
      !sources.listed.has(url) ||
      assigned.has(url) ||
      approved.has(url) ||
      inline.has(url) ||
      discovery.has(url) ||
      excluded.has(url)
    ) {
      throw Error(
        "Legacy discovery disposition must name an unused original list route, never cited article evidence",
      )
    }
    if (row.role === "excluded") {
      const review = row.exclusion_review
      const unit = units.find((u) => u.unit_id === review?.unit_id)
      const alternative = review ? canonicalURL(review.alternative_url) : ""
      if (
        !review ||
        !unit ||
        unit.depth !== 2 ||
        review.sha256 !== unit.sha256 ||
        !review.original_statement.trim() ||
        !before.body.slice(unit.body_start, unit.body_end).includes(review.original_statement) ||
        !/^https?:\/\//.test(alternative) ||
        alternative === url ||
        !review.reason.trim()
      )
        throw Error(
          "Legacy source exclusion requires an exact original article statement and checked alternative",
        )
      excluded.add(url)
    } else {
      if (row.exclusion_review)
        throw Error("Legacy discovery disposition cannot carry an article exclusion")
      discovery.add(url)
    }
  }
  // Retain original citation identity privately. A reviewed official alternative
  // may support that event, but must actually be cited by its approved article.
  // These mappings never make the unavailable original into acquired evidence.
  const alternativesByEvent = new Map()
  for (const event of packet.events) {
    const assigned = new Set(event.source_urls.map(canonicalURL))
    const approved = new Set(byID.get(event.event_id).source_urls.map(canonicalURL))
    const alternatives = new Map()
    for (const review of event.source_alternative_reviews || []) {
      const original = canonicalURL(review.original_url)
      const alternative = canonicalURL(review.alternative_url)
      if (
        !/^https?:\/\//.test(original) ||
        !/^https?:\/\//.test(alternative) ||
        !review.reason.trim() ||
        !assigned.has(original) ||
        original === alternative ||
        approved.has(original) ||
        !approved.has(alternative) ||
        alternatives.has(original)
      )
        throw Error(
          "Legacy alternative requires a distinct cited official source for its original event",
        )
      alternatives.set(original, alternative)
    }
    alternativesByEvent.set(event.event_id, alternatives)
  }
  const retainsSource = (id, url) => {
    const original = canonicalURL(url)
    const approved = byID.get(id).source_urls.map(canonicalURL)
    return (
      approved.includes(original) || approved.includes(alternativesByEvent.get(id)?.get(original))
    )
  }
  const anchorsByUnit = new Map()
  for (const event of packet.events) {
    if (!anchorsByUnit.has(event.unit_id)) anchorsByUnit.set(event.unit_id, [])
    anchorsByUnit.get(event.unit_id).push(event)
  }
  const inlineDiscovery = new Map()
  for (const row of packet.inline_discovery_dispositions || []) {
    const unit = units.find((u) => u.unit_id === row.unit_id)
    const url = canonicalURL(row.url)
    const anchors = anchorsByUnit.get(row.unit_id) || []
    const route = new URL(url)
    const prefix = route.pathname.replace(/\/$/, "") + "/"
    if (
      !unit ||
      unit.depth !== 2 ||
      row.sha256 !== unit.sha256 ||
      !row.reason.trim() ||
      !anchors.length ||
      !sources.forContent(before.body.slice(unit.body_start, unit.body_end)).includes(url) ||
      assigned.has(url) ||
      approved.has(url) ||
      route.search ||
      route.hash ||
      inlineDiscovery.get(row.unit_id)?.has(url) ||
      anchors.some((event) => !event.source_list_review) ||
      !anchors.some((event) =>
        event.source_urls.some((source) => {
          const original = new URL(source)
          return original.origin === route.origin && original.pathname.startsWith(prefix)
        }),
      )
    )
      throw Error(
        "Inline discovery requires an exact reviewed article unit and original same-project permalinks",
      )
    if (!inlineDiscovery.has(row.unit_id)) inlineDiscovery.set(row.unit_id, new Set())
    inlineDiscovery.get(row.unit_id).add(url)
  }
  const eventSourcesForUnit = (unit) =>
    sources
      .forContent(before.body.slice(unit.body_start, unit.body_end))
      .filter((url) => !inlineDiscovery.get(unit.unit_id)?.has(url))
  for (const [i, unit] of units.entries()) {
    const decision = packet.units[i]
    const content = before.body.slice(unit.body_start, unit.body_end)
    const urls = eventSourcesForUnit(unit)
    const anchors = anchorsByUnit.get(unit.unit_id) || []
    const duplicate = decision.duplicate_event_review
    if (
      duplicate &&
      (unit.depth !== 2 ||
        decision.decision !== "replaced" ||
        anchors.length ||
        decision.event_ids.length !== 1 ||
        !packet.events.some((event) => event.event_id === decision.event_ids[0]) ||
        !duplicate.reason.trim())
    )
      throw Error("Legacy duplicate review requires one separately anchored source event")
    if (
      (unit.depth === 2 || anchors.some((event) => event.section_event_review)) &&
      decision.decision === "replaced" &&
      !duplicate &&
      !same(anchors.map((event) => event.event_id).sort(), [...decision.event_ids].sort())
    )
      throw Error("Legacy article disposition must match its exact event anchors")
    if (anchors.length > 1 && anchors.some((event) => !event.event_split_review?.reason.trim()))
      throw Error("Legacy article split requires explicit distinct-event review for every event")
    if (
      anchors.length &&
      !anchors.some((event) => event.source_list_review) &&
      !same(
        urls,
        [...new Set(anchors.flatMap((event) => event.source_urls.map(canonicalURL)))].sort(),
      )
    )
      throw Error(
        "Legacy transition event must retain its exact title, unit and original sources (source union)",
      )
    if (
      new Set(decision.event_ids).size !== decision.event_ids.length ||
      decision.event_ids.some((id) => !byID.has(id))
    )
      throw Error("Legacy transition unit references an unknown or repeated event")
    if (decision.decision === "replaced") {
      if (
        !decision.event_ids.length ||
        urls.some(
          (url) =>
            !(
              unit.depth === 1 &&
              unit.title === "Source List" &&
              (discovery.has(url) || excluded.has(url))
            ) &&
            !decision.event_ids.some((id) =>
              packet.events.some(
                (event) =>
                  event.event_id === id &&
                  event.source_urls.map(canonicalURL).includes(url) &&
                  retainsSource(id, url),
              ),
            ),
        )
      )
        throw Error("Legacy transition must retain every reviewed original source")
    } else {
      if (decision.decision === "omitted_discovery") {
        if (
          !noArticles ||
          unit.depth !== 1 ||
          unit.title !== "Source List" ||
          decision.event_ids.length ||
          urls.some((url) => !discovery.has(url)) ||
          sources.listed.size !== discovery.size
        )
          throw Error("Article-free discovery omission requires every original route disposition")
        continue
      }
      if (decision.event_ids.length || urls.length)
        throw Error("Legacy transition cannot omit source-bearing units")
      if (
        decision.decision === "omitted_editorial" &&
        (unit.depth !== 1 ||
          !["흐름 읽기", "바로 써먹을 점", ...(noArticles ? ["한눈에 보기"] : [])].includes(
            legacySectionTitle(unit.title),
          ))
      )
        throw Error("Legacy transition editorial omission is limited to ancillary sections")
      if (decision.decision === "omitted_empty") {
        const nodes = markdown.parse(content).children.filter((n) => n.type !== "heading")
        if (
          nodes.length &&
          !(
            nodes.length === 1 &&
            nodes[0].type === "paragraph" &&
            nodes[0].children.length === 1 &&
            nodes[0].children[0].type === "text" &&
            nodes[0].children[0].value.trim() === "없음"
          )
        )
          throw Error("Legacy transition empty decision contains original prose")
      }
    }
  }
  for (const event of packet.events) {
    const index = units.findIndex((u) => u.unit_id === event.unit_id),
      unit = units[index]
    const decision = packet.units[index]
    const inlineSources = unit ? eventSourcesForUnit(unit) : []
    const sourceMarkers = unit
      ? /\[S\d+\]/.test(before.body.slice(unit.body_start, unit.body_end))
      : false
    const assignedSources = [...new Set(event.source_urls.map(canonicalURL))].sort()
    const sourceListReview = event.source_list_review
    const listEventReview = event.source_list_event_review
    const listAnchor = unit?.depth === 1 && unit.title === "Source List"
    const sectionReview = event.section_event_review
    const sectionAnchor = Boolean(sectionReview)
    if (
      sectionAnchor &&
      (!unit ||
        unit.depth !== 1 ||
        unit.title !== "오픈소스와 도구" ||
        sectionReview.sha256 !== unit.sha256 ||
        !sectionReview.original_mention.trim() ||
        !before.body
          .slice(unit.body_start, unit.body_end)
          .includes(sectionReview.original_mention) ||
        !sectionReview.reason.trim() ||
        !inlineSources.length ||
        !inlineSources.some((url) => assignedSources.includes(url)) ||
        listEventReview)
    )
      throw Error(
        "Legacy section event requires its exact original tool mention, hash and inline source",
      )
    if (listEventReview || listAnchor) {
      const mention = units.find((u) => u.unit_id === listEventReview?.mention_unit_id)
      const mentionDecision = packet.units.find((u) => u.unit_id === mention?.unit_id)
      if (
        !listAnchor ||
        !sourceListReview ||
        !listEventReview ||
        !mention ||
        mention.depth !== 1 ||
        mention.title !== "한눈에 보기" ||
        listEventReview.mention_sha256 !== mention.sha256 ||
        !listEventReview.original_mention.trim() ||
        !before.body
          .slice(mention.body_start, mention.body_end)
          .includes(listEventReview.original_mention) ||
        mentionDecision.decision !== "replaced" ||
        !mentionDecision.event_ids.includes(event.event_id) ||
        !listEventReview.reason.trim()
      )
        throw Error("Legacy list-only event requires its exact reviewed original cover mention")
    }
    if (
      sourceListReview &&
      ((!listAnchor &&
        inlineSources.length &&
        (assignedSources.length <= inlineSources.length ||
          inlineSources.some((url) => !assignedSources.includes(url)))) ||
        sourceMarkers ||
        !sourceListReview.reason.trim() ||
        assignedSources.length !== event.source_urls.length ||
        assignedSources.some((url) => !sources.listed.has(url)))
    )
      throw Error("Legacy source-list assignment requires reviewed distinct original list sources")
    if (
      !unit ||
      (unit.depth !== 2 && !listAnchor && !sectionAnchor) ||
      unit.title !== event.previous_title ||
      decision.decision !== "replaced" ||
      !decision.event_ids.includes(event.event_id) ||
      (!sourceListReview && assignedSources.some((url) => !inlineSources.includes(url))) ||
      (event.event_split_review && !event.event_split_review.reason.trim()) ||
      event.source_urls.some((url) => !retainsSource(event.event_id, url))
    )
      throw Error("Legacy transition event must retain its exact title, unit and original sources")
  }
  return packet
}

// Reuse the full original-unit review when an article-free legacy cleanup is delivered.
export function assertArticleFreeLegacyPreview(manifest) {
  const reviews = manifest.legacy_reviews
  if (
    !Array.isArray(manifest.consistency?.articles) ||
    manifest.consistency.articles.length ||
    !Array.isArray(manifest.editions) ||
    !manifest.editions.length ||
    !Array.isArray(reviews) ||
    !reviews.length ||
    (manifest.knowledge || []).length ||
    manifest.navigation ||
    manifest.edition_spec ||
    reviews.length !== manifest.editions.length ||
    new Set(reviews.map((review) => review.target_path)).size !== reviews.length ||
    reviews.some(
      (review) =>
        !review.no_article_review ||
        review.events?.length !== 0 ||
        !manifest.editions.some((edition) => edition.path === review.target_path),
    )
  )
    throw Error("Reviewed article-free legacy preview required")
  for (const review of reviews)
    assertLegacyTransition(review, [], parseNote(review.before_content), review.target_path)
}

export function legacyTransitionBatch(value) {
  assertSchema(
    value,
    object({
      schema: { type: "string", enum: ["research-legacy-transition-batch/v1"] },
      reviews: { type: "array", minItems: 1, items: packetSchema },
    }),
  )
  if (new Set(value.reviews.map((p) => p.target_path)).size !== value.reviews.length)
    throw Error("Legacy transition editions must be unique")
  return value.reviews
}
