import fs from "node:fs"
import path from "node:path"
import { unified } from "unified"
import remarkParse from "remark-parse"
import { parseNote } from "../garden.mjs"
import { assertSchema, sha256 } from "./contracts.mjs"
import { assertReviewDate, parseResearchDate } from "./dates.mjs"
import { atomicCreate, safePath, RunState } from "./run-state.mjs"

const markdown = unified().use(remarkParse)
const text = (node) => node.value || (node.children || []).map(text).join("")
const folder = "retrospective/empty-record-reviews"
const sections = [
  "한눈에 보기",
  "오늘의 핵심 기사",
  "논문과 연구",
  "오픈소스와 도구",
  "흐름 읽기",
  "바로 써먹을 점",
  "Source List",
]
const object = (properties) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
})
const hash = { type: "string", pattern: "^[a-f0-9]{64}$" }
const unitSchema = object({
  unit_id: { type: "string", pattern: "^[a-f0-9]{20}$" },
  sha256: hash,
})
const recordSchema = object({
  path: {
    type: "string",
    pattern: "^Editions/\\d{4}/\\d{2}/\\d{4}-\\d{2}-\\d{2}_\\d{4}_Tech_AI_Briefing\\.md$",
  },
  sha256: hash,
  before_content: { type: "string", minLength: 1, maxLength: 65536 },
  units: { type: "array", minItems: 1, items: unitSchema },
  reason: { type: "string", minLength: 1, maxLength: 2000 },
})
const schema = object({
  schema: { type: "string", enum: ["research-empty-legacy-review/v1"] },
  reviewer: { type: "string", minLength: 1 },
  reviewed_at: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  authoring_read: { type: "boolean", enum: [true] },
  decision: { type: "string", enum: ["empty_record"] },
  records: { type: "array", minItems: 1, maxItems: 100, items: recordSchema },
})

// Offsets and IDs are shared with the inventory, including legacy prose before
// the first heading. Neither a heading nor a shared URL implies a news event.
export function legacyReviewUnits(body, relative, sourcesForContent = () => []) {
  const headings = markdown.parse(body).children.filter((node) => node.type === "heading")
  const starts = [
    { offset: 0, title: null, depth: 0 },
    ...headings.map((node) => ({
      offset: node.position.start.offset,
      title: text(node),
      depth: node.depth,
    })),
  ]
  return starts.flatMap((heading, i) => {
    const end = starts[i + 1]?.offset ?? body.length
    const content = body.slice(heading.offset, end)
    if (!content.trim()) return []
    const id = sha256(JSON.stringify([relative, heading.offset])).slice(0, 20)
    return [
      {
        unit_id: id,
        title: heading.title,
        depth: heading.depth,
        body_start: heading.offset,
        body_end: end,
        sha256: sha256(content),
        source_ids: sourcesForContent(content, id),
      },
    ]
  })
}

function emptyDocument(content, relative) {
  const note = parseNote(content)
  if (note.meta.schema_version || note.meta.article_records || note.meta.article_reviews)
    throw Error("Empty-record review requires pre-v2 authoring")
  for (const key of ["source_count", "new_items_count"])
    if (Object.hasOwn(note.meta, key) && note.meta[key] !== 0)
      throw Error("Empty-record metadata cannot report news or sources")
  for (const key of [
    "linked_knowledge_notes",
    "knowledge_notes_created",
    "knowledge_notes_updated",
  ])
    if (Object.hasOwn(note.meta, key) && (!Array.isArray(note.meta[key]) || note.meta[key].length))
      throw Error("Empty record cannot carry knowledge references")
  // Any other metadata may hold a source or a claim. Do not discard it under
  // an empty-body decision merely because the usual counters are zero.
  const allowed = [
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
  ]
  if (Object.keys(note.meta).some((key) => !allowed.includes(key)))
    throw Error("Empty-record metadata requires separate review")
  const editionDay = path.basename(relative).slice(0, 10)
  if (!relative.startsWith(`Editions/${editionDay.slice(0, 4)}/${editionDay.slice(5, 7)}/`))
    throw Error("Empty-record folder must match its preserved date")
  if (note.meta.date && note.meta.date !== editionDay)
    throw Error("Empty-record date must match its preserved path")
  if (
    Object.hasOwn(note.meta, "title") &&
    ![`${editionDay} Tech & AI Briefing`, `${editionDay} Tech & AI 브리핑`].includes(
      note.meta.title,
    )
  )
    throw Error("Legacy title requires separate source review")
  for (const key of ["coverage_start", "coverage_end"])
    if (
      Object.hasOwn(note.meta, key) &&
      parseResearchDate(note.meta[key])?.precision !== "timestamp"
    )
      throw Error("Empty-record coverage must preserve valid timestamps")
  if (
    note.meta.coverage_start &&
    note.meta.coverage_end &&
    Date.parse(note.meta.coverage_start) >= Date.parse(note.meta.coverage_end)
  )
    throw Error("Empty-record coverage interval is invalid")
  const nodes = markdown.parse(note.body).children
  let cursor = 0
  const emptyParagraph = (node) =>
    node?.type === "paragraph" &&
    node.children.length === 1 &&
    node.children[0].type === "text" &&
    node.children[0].value === "없음"
  for (const name of sections) {
    const heading = nodes[cursor++]
    if (heading?.type !== "heading" || heading.depth !== 1 || text(heading) !== name)
      throw Error("Empty record must retain every original template section")
    const body = nodes[cursor++]
    if (emptyParagraph(body)) continue
    if (
      name !== "한눈에 보기" ||
      body?.type !== "list" ||
      body.ordered ||
      body.children.length !== 3
    )
      throw Error("Legacy record contains prose requiring source review")
    for (let i = 0; i < body.children.length; i++) {
      const children = body.children[i].children
      if (
        children.length !== 1 ||
        children[0].type !== "paragraph" ||
        children[0].children.length !== 1 ||
        children[0].children[0].type !== "text" ||
        text(children[0]) !== `${sections[i + 1]}: 없음`
      )
        throw Error("Legacy overview contains a claim requiring source review")
    }
  }
  if (cursor !== nodes.length) throw Error("Legacy record has additional unreviewed content")
  return note
}

export function assertEmptyLegacyReview(packet) {
  assertSchema(packet, schema)
  if (new Set(packet.records.map((record) => record.path)).size !== packet.records.length)
    throw Error("Empty-record review requires distinct original paths")
  for (const record of packet.records) {
    if (sha256(record.before_content) !== record.sha256)
      throw Error("Empty-record original byte hash mismatch")
    const note = emptyDocument(record.before_content, record.path)
    assertReviewDate(packet.reviewed_at, { notBefore: [path.basename(record.path).slice(0, 10)] })
    const expected = legacyReviewUnits(note.body, record.path).map(({ unit_id, sha256 }) => ({
      unit_id,
      sha256,
    }))
    if (JSON.stringify(record.units) !== JSON.stringify(expected))
      throw Error("Empty-record review must cover every original unit exactly")
  }
  return packet
}

export function loadEmptyLegacyReviews(root) {
  if (!root) return []
  const directory = safePath(root, folder)
  if (!fs.existsSync(directory)) return []
  const files = fs.readdirSync(directory).sort()
  return files.map((name) => {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) throw Error("Unexpected private legacy review file")
    const file = safePath(root, `${folder}/${name}`)
    if (!fs.lstatSync(file).isFile() || fs.statSync(file).size > 8 * 1024 ** 2)
      throw Error("Invalid private legacy review file")
    const bytes = fs.readFileSync(file)
    const packet = assertEmptyLegacyReview(JSON.parse(bytes))
    if (name !== `${sha256(JSON.stringify(packet))}.json`)
      throw Error("Private legacy review content hash mismatch")
    return { packet, path: `${folder}/${name}`, sha256: sha256(bytes) }
  })
}

export async function saveEmptyLegacyReview(root, runId, vault, packet) {
  assertEmptyLegacyReview(packet)
  const base = path.resolve(vault)
  if (path.resolve(root) === base || path.resolve(root).startsWith(base + path.sep))
    throw Error("Legacy reviews must stay outside the authoring vault")
  const currentReviews = loadEmptyLegacyReviews(root)
  const id = sha256(JSON.stringify(packet))
  const relative = `${folder}/${id}.json`
  const originals = {}
  for (const record of packet.records) {
    const file = safePath(base, record.path)
    if (!fs.lstatSync(file).isFile()) throw Error("Legacy source must be a regular file")
    const bytes = fs.readFileSync(file)
    if (sha256(bytes) !== record.sha256 || bytes.toString("utf8") !== record.before_content)
      throw Error("Empty-record review does not match current authoring bytes")
    if (
      currentReviews.some(
        (review) =>
          review.path !== relative &&
          review.packet.records.some(
            (prior) => prior.path === record.path && prior.sha256 === record.sha256,
          ),
      )
    )
      throw Error("Original empty record already has a private review")
    originals[record.path] = record.sha256
  }
  const state = new RunState(
    root,
    runId,
    {
      schema: packet.schema,
      packet_sha256: id,
      vault: fs.realpathSync(base),
      originals,
      implementation_sha256: sha256(
        fs.readFileSync(new URL("./legacy-review.mjs", import.meta.url)),
      ),
    },
    { scope: "retrospective" },
  )
  const result = await state.stage("empty-record-review", originals, () => ({
    schema: "research-empty-legacy-review-receipt/v1",
    review: relative,
    review_sha256: id,
    records: packet.records.length,
    units: packet.records.reduce((n, record) => n + record.units.length, 0),
    decision: "empty_record",
    verified_events: 0,
    authoring_mutated: false,
    source_research_completed: false,
    drive_verified: false,
    published: false,
  }))
  if (result.review !== relative || result.review_sha256 !== id)
    throw Error("Saved empty-record receipt differs from current review")
  if (!fs.existsSync(safePath(root, relative))) atomicCreate(root, relative, packet)
  return result
}
