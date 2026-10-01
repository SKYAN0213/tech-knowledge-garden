import crypto from "node:crypto"
import { canonicalURL } from "../garden.mjs"

export const CONTRACT_VERSION = "local-research/v1"
export const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex")
// Preserve prepare-drive.py's original URL identifier, including its stored spelling.
export const sourceId = (url) => sha256(url).slice(0, 20)
export const sourceVersionId = (id, hash) => `${id}:${hash}`
export const parseId = (version, parser) =>
  sha256(JSON.stringify([version, parser, CONTRACT_VERSION]))
export const PUBLIC_ROOTS = ["Editions", "Knowledge", "Signals", "TrendTopics"]
export const FETCH_STATES = [
  "captured",
  "not_modified",
  "blocked",
  "not_found",
  "rate_limited",
  "too_large",
  "failed",
]
export const PARSE_STATES = ["extracted", "partial", "blocked", "unsupported", "failed"]
export const CANDIDATE_STATES = [
  "discovered",
  "acquired",
  "parsed",
  "fact_review",
  "editorial_review",
  "approved",
  "deferred",
  "rejected",
]
export const CANDIDATE_TRANSITIONS = {
  discovered: ["acquired", "deferred", "rejected"],
  acquired: ["parsed", "deferred", "rejected"],
  parsed: ["fact_review", "deferred", "rejected"],
  fact_review: ["editorial_review", "deferred", "rejected"],
  editorial_review: ["approved", "fact_review", "deferred", "rejected"],
  approved: ["fact_review", "rejected"],
  deferred: ["discovered", "acquired", "parsed", "fact_review", "rejected"],
  rejected: [],
}
export function assertTransition(from, to) {
  if (!CANDIDATE_TRANSITIONS[from]?.includes(to))
    throw Error(`Invalid candidate transition: ${from} -> ${to}`)
}
export function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw Error(`Required text: ${label}`)
  return value
}
export function assertSchema(value, schema, at = "$", root = schema) {
  if (schema.$ref) {
    let ref = root
    for (const part of schema.$ref.replace(/^#\//, "").split("/")) ref = ref?.[part]
    if (!ref) throw Error(`Unknown schema reference: ${schema.$ref}`)
    return assertSchema(value, ref, at, root)
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type]
  if (
    schema.type &&
    !types.some((type) =>
      type === "null"
        ? value === null
        : type === "array"
          ? Array.isArray(value)
          : type === "integer"
            ? Number.isInteger(value)
            : type === "object"
              ? value !== null && typeof value === "object" && !Array.isArray(value)
              : typeof value === type,
    )
  )
    throw Error(`Invalid type at ${at}`)
  if (schema.enum && !schema.enum.some((v) => v === value)) throw Error(`Invalid enum at ${at}`)
  if (value === null) return value
  if (typeof value === "string") {
    if (schema.minLength && value.length < schema.minLength) throw Error(`Empty text at ${at}`)
    if (schema.maxLength && value.length > schema.maxLength) throw Error(`Text too long at ${at}`)
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      throw Error(`Invalid pattern at ${at}`)
  }
  if (Array.isArray(value)) {
    if (schema.minItems && value.length < schema.minItems) throw Error(`Missing items at ${at}`)
    if (schema.maxItems && value.length > schema.maxItems) throw Error(`Too many items at ${at}`)
    value.forEach((v, i) => assertSchema(v, schema.items || {}, `${at}[${i}]`, root))
  } else if (typeof value === "object") {
    for (const k of schema.required || [])
      if (!(k in value)) throw Error(`Missing field at ${at}.${k}`)
    for (const [k, v] of Object.entries(value)) {
      if (schema.additionalProperties === false && !(k in (schema.properties || {})))
        throw Error(`Unexpected field at ${at}.${k}`)
      if (schema.properties?.[k]) assertSchema(v, schema.properties[k], `${at}.${k}`, root)
    }
  }
  return value
}
export function assertParse(parse) {
  if (parse.schema_version !== "source-parse/v1" || !PARSE_STATES.includes(parse.status))
    throw Error("Invalid parse contract")
  for (const key of ["source_id", "source_version_id", "parse_id"]) requireText(parse[key], key)
  const ids = new Set()
  if (!Array.isArray(parse.blocks)) throw Error("Parse blocks required")
  for (const b of parse.blocks) {
    requireText(b.block_id, "block_id")
    requireText(b.text, "block text")
    if (ids.has(b.block_id) || !b.block_id.startsWith(parse.parse_id + ":"))
      throw Error("Invalid block identity")
    if (b.locator?.text_hash !== sha256(b.text)) throw Error("Block text hash mismatch")
    ids.add(b.block_id)
  }
  if (
    parse.status === "extracted" &&
    (!parse.title || !parse.blocks.length || parse.quality?.missing_pages?.length)
  )
    throw Error("Incomplete extracted document")
  return parse
}
export const evidenceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["source_id", "source_version_id", "parse_id", "block_id", "quote", "support"],
  properties: Object.fromEntries(
    ["source_id", "source_version_id", "parse_id", "block_id", "quote", "support"].map((k) => [
      k,
      k === "support"
        ? { type: "string", enum: ["direct", "partial", "contradicted"] }
        : { type: "string", minLength: 1 },
    ]),
  ),
}
export const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["claims"],
  properties: {
    claims: {
      type: "array",
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "statement",
          "claim_kind",
          "subject",
          "event_state",
          "published_at",
          "effective_period",
          "numbers",
          "evidence",
        ],
        properties: {
          statement: { type: "string", minLength: 1, maxLength: 1500 },
          claim_kind: { type: "string", enum: ["fact", "attributed_fact", "analysis"] },
          subject: { type: "string", minLength: 1 },
          event_state: {
            type: "string",
            enum: ["planned", "in_progress", "completed", "reported", "unknown"],
          },
          published_at: { type: ["string", "null"] },
          effective_period: { type: ["string", "null"] },
          numbers: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["literal", "unit", "condition"],
              properties: {
                literal: { type: "string", minLength: 1 },
                unit: { type: "string" },
                condition: { type: "string" },
              },
            },
          },
          evidence: { type: "array", minItems: 1, items: evidenceSchema },
        },
      },
    },
  },
}
