import { unified } from "unified"
import remarkParse from "remark-parse"
import { canonicalURL, parseNote } from "../garden.mjs"
import { assertSchema, sha256 } from "./contracts.mjs"
import { assertReviewDate, parseResearchDate } from "./dates.mjs"
import { legacyReviewUnits } from "./legacy-review.mjs"

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
eventSchema.properties.event_split_review = object({
  distinct_event_checked: { type: "boolean", enum: [true] },
  reason: text,
})
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
    minItems: 1,
    maxItems: 40,
    items: eventSchema,
  },
  units: {
    type: "array",
    minItems: 1,
    items: object({
      unit_id: unitID,
      sha256: hash,
      decision: { type: "string", enum: ["replaced", "omitted_empty", "omitted_editorial"] },
      event_ids: { type: "array", items: eventID },
      reason: text,
    }),
  },
})
const markdown = unified().use(remarkParse)
const urlsIn = (content) =>
  [...new Set((content.match(/https?:\/\/[^\s<>\]\)]+/g) || []).map(canonicalURL))].sort()
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

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
  if (
    before.meta.date !== day ||
    packet.target_path !==
      `Editions/${day.slice(0, 4)}/${day.slice(5, 7)}/${packet.target_path.split("/").at(-1)}` ||
    before.meta.timezone !== "Asia/Seoul" ||
    !parseResearchDate(before.meta.coverage_start) ||
    !parseResearchDate(before.meta.coverage_end) ||
    Date.parse(before.meta.coverage_start) >= Date.parse(before.meta.coverage_end)
  )
    throw Error("Legacy transition requires preserved edition identity and cutoffs")
  const allowedMeta = new Set([
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
  if (Object.keys(before.meta).some((k) => !allowedMeta.has(k)))
    throw Error("Legacy transition contains metadata requiring additional review")
  assertReviewDate(packet.reviewed_at, {
    notBefore: [day, ...articles.map((a) => a.article_review?.reviewed_at)],
  })
  const units = legacyReviewUnits(before.body, relativePath)
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
        a.article_review.published_at > day ||
        a.article_review.published_at < before.meta.coverage_start.slice(0, 10),
    )
  )
    throw Error("Legacy transition requires exactly all distinct reviewed source events")
  const byID = new Map(articles.map((a) => [a.event_id, a]))
  const sources = legacySources(before.body, units)
  const anchorsByUnit = new Map()
  for (const event of packet.events) {
    if (!anchorsByUnit.has(event.unit_id)) anchorsByUnit.set(event.unit_id, [])
    anchorsByUnit.get(event.unit_id).push(event)
  }
  for (const [i, unit] of units.entries()) {
    const decision = packet.units[i]
    const content = before.body.slice(unit.body_start, unit.body_end)
    const urls = sources.forContent(content)
    const anchors = anchorsByUnit.get(unit.unit_id) || []
    if (
      unit.depth === 2 &&
      decision.decision === "replaced" &&
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
            !decision.event_ids.some((id) =>
              byID.get(id).source_urls.map(canonicalURL).includes(url),
            ),
        )
      )
        throw Error("Legacy transition must retain every reviewed original source")
    } else {
      if (decision.event_ids.length || urls.length)
        throw Error("Legacy transition cannot omit source-bearing units")
      if (
        decision.decision === "omitted_editorial" &&
        (unit.depth !== 1 || !["흐름 읽기", "바로 써먹을 점"].includes(unit.title))
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
    const inlineSources = unit
      ? sources.forContent(before.body.slice(unit.body_start, unit.body_end))
      : []
    const sourceMarkers = unit
      ? /\[S\d+\]/.test(before.body.slice(unit.body_start, unit.body_end))
      : false
    const assignedSources = [...new Set(event.source_urls.map(canonicalURL))].sort()
    const sourceListReview = event.source_list_review
    if (
      sourceListReview &&
      (inlineSources.length ||
        sourceMarkers ||
        !sourceListReview.reason.trim() ||
        assignedSources.length !== event.source_urls.length ||
        assignedSources.some((url) => !sources.listed.has(url)))
    )
      throw Error("Legacy source-list assignment requires reviewed distinct original list sources")
    if (
      !unit ||
      unit.depth !== 2 ||
      unit.title !== event.previous_title ||
      decision.decision !== "replaced" ||
      !decision.event_ids.includes(event.event_id) ||
      (!sourceListReview && assignedSources.some((url) => !inlineSources.includes(url))) ||
      (event.event_split_review && !event.event_split_review.reason.trim()) ||
      event.source_urls.some(
        (url) =>
          !byID.get(event.event_id).source_urls.map(canonicalURL).includes(canonicalURL(url)),
      )
    )
      throw Error("Legacy transition event must retain its exact title, unit and original sources")
  }
  return packet
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
