import fs from "node:fs"
import { assertParse, sha256 } from "./contracts.mjs"
import { assertReviewDate } from "./dates.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const keys = (value, allowed) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => allowed.includes(key))
const id = (value) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value)
const box = (value, width, height) =>
  Array.isArray(value) &&
  value.length === 4 &&
  value.every(Number.isFinite) &&
  value[0] >= 0 &&
  value[1] >= 0 &&
  value[0] < value[2] &&
  value[1] < value[3] &&
  value[2] <= width &&
  value[3] <= height
const union = (boxes) => [
  Math.min(...boxes.map((b) => b[0])),
  Math.min(...boxes.map((b) => b[1])),
  Math.max(...boxes.map((b) => b[2])),
  Math.max(...boxes.map((b) => b[3])),
]
const center = (cell, axis) => (cell.locator.bbox[axis] + cell.locator.bbox[axis + 2]) / 2

// Explicit original-image transcription. Geometry validates the reviewed layout;
// it never assigns cells or corrects OCR by proximity alone.
export function projectOCRTable(parent, review, parser) {
  assertParse(parent)
  if (
    !keys(review, ["schema", "source_parse", "reviewer", "reviewed_at", "tables", "coverage"]) ||
    review.schema !== "research-ocr-table-review/v1" ||
    typeof review.reviewer !== "string" ||
    !review.reviewer.trim() ||
    !["extracted", "partial"].includes(parent.status) ||
    parent.quality?.source_format !== "raster-image" ||
    !Array.isArray(review.tables) ||
    !review.tables.length ||
    review.tables.length > 10
  )
    throw Error("Explicit native raster table review required")
  assertReviewDate(review.reviewed_at, { notBefore: [parent.dates?.observed_at] })
  const width = parent.quality.source_width,
    height = parent.quality.source_height
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1)
    throw Error("Original raster dimensions required")
  const native = new Map(parent.blocks.map((block) => [block.block_id, block]))
  const ids = new Set(),
    used = new Set(),
    tables = new Set()
  let cellCount = 0
  const cell = (entry) => {
    if (
      !keys(entry, [
        "cell_id",
        "text",
        "bbox",
        "block_ids",
        "visual_checked",
        "layout_checked",
        "numbers_checked",
        "reason",
      ]) ||
      !id(entry.cell_id) ||
      ids.has(entry.cell_id) ||
      typeof entry.text !== "string" ||
      (!entry.text.trim() && (entry.text !== "" || entry.block_ids?.length !== 0)) ||
      entry.text.length > 1000 ||
      /[\r\n|]/.test(entry.text) ||
      !box(entry.bbox, width, height) ||
      !Array.isArray(entry.block_ids) ||
      entry.block_ids.length > 12 ||
      new Set(entry.block_ids).size !== entry.block_ids.length ||
      entry.visual_checked !== true ||
      entry.layout_checked !== true ||
      (/\d/u.test(entry.text) && entry.numbers_checked !== true) ||
      typeof entry.reason !== "string" ||
      !entry.reason.trim() ||
      ++cellCount > 5000
    )
      throw Error("Source-bound visually reviewed table cell required")
    ids.add(entry.cell_id)
    const original = entry.block_ids.map((blockId) => {
      const block = native.get(blockId),
        b = block?.locator?.bbox
      if (
        !block ||
        used.has(blockId) ||
        block.locator.type !== "image" ||
        !box(b, width, height) ||
        center({ locator: { bbox: b } }, 0) < entry.bbox[0] ||
        center({ locator: { bbox: b } }, 0) > entry.bbox[2] ||
        center({ locator: { bbox: b } }, 1) < entry.bbox[1] ||
        center({ locator: { bbox: b } }, 1) > entry.bbox[3]
      )
        throw Error("Table cell reuses or misplaces an original OCR block")
      used.add(blockId)
      return { block_id: blockId, text: block.text, locator: structuredClone(block.locator) }
    })
    return {
      cell_id: entry.cell_id,
      text: entry.text,
      locator: {
        type: "image",
        coordinate_space: "source-pixels",
        bbox: [...entry.bbox],
        method: "visual-transcription",
        text_hash: sha256(entry.text),
      },
      original_blocks: original,
      transcription_changed: entry.text !== original.map((b) => b.text).join(" "),
      review_reason: entry.reason,
    }
  }
  const parseId = sha256(JSON.stringify([parent.source_version_id, parser, "local-research/v1"]))
  const blocks = review.tables.map((table, index) => {
    if (
      !keys(table, ["table_id", "contexts", "headers", "rows"]) ||
      !id(table.table_id) ||
      tables.has(table.table_id) ||
      !Array.isArray(table.contexts) ||
      table.contexts.length > 8 ||
      !Array.isArray(table.headers) ||
      table.headers.length < 2 ||
      table.headers.length > 30 ||
      !Array.isArray(table.rows) ||
      !table.rows.length ||
      table.rows.length > 200
    )
      throw Error("Bounded explicit table headers and rows required")
    tables.add(table.table_id)
    const contexts = table.contexts.map(cell),
      headers = table.headers.map(cell)
    for (let i = 1; i < headers.length; i++)
      if (center(headers[i], 0) <= center(headers[i - 1], 0))
        throw Error("Reviewed table column order conflicts with original positions")
    let previousY = Math.max(...headers.map((h) => center(h, 1)))
    const rows = table.rows.map((row) => {
      if (!Array.isArray(row) || row.length !== headers.length)
        throw Error("Every reviewed table row must retain all columns")
      const cells = row.map(cell),
        ys = cells.map((c) => center(c, 1)),
        y = Math.min(...ys)
      if (y <= previousY || Math.max(...ys) - y > 12)
        throw Error("Reviewed table row order conflicts with original positions")
      previousY = Math.max(...ys)
      cells.forEach((c, i) => {
        const left = i ? (center(headers[i - 1], 0) + center(headers[i], 0)) / 2 : 0
        const right =
          i + 1 < headers.length ? (center(headers[i], 0) + center(headers[i + 1], 0)) / 2 : width
        if (center(c, 0) <= left || center(c, 0) >= right)
          throw Error("Reviewed table cell belongs to a different original column")
      })
      return cells
    })
    const all = [...contexts, ...headers, ...rows.flat()]
    const text = [
      ...contexts.map((c) => c.text),
      headers.map((c) => c.text).join(" | "),
      ...rows.map((row) => row.map((c) => c.text).join(" | ")),
    ].join("\n")
    return {
      block_id: `${parseId}:block-${String(index + 1).padStart(4, "0")}`,
      kind: "table",
      text,
      rows: [headers.map((c) => c.text), ...rows.map((row) => row.map((c) => c.text))],
      locator: {
        type: "image",
        coordinate_space: "source-pixels",
        method: "visual-transcription",
        bbox: union(all.map((c) => c.locator.bbox)),
        text_hash: sha256(text),
      },
      cell_evidence: { contexts, headers, rows },
      table_id: table.table_id,
    }
  })
  // Completeness is an explicit review of the entire original frame, including
  // text missed by OCR. Selecting every recognized block alone is insufficient.
  const coverage = review.coverage
  const complete = coverage !== undefined
  if (
    complete &&
    (!keys(coverage, ["scope", "bbox", "full_frame_checked", "no_omitted_content", "reason"]) ||
      coverage.scope !== "whole-image" ||
      !same(coverage.bbox, [0, 0, width, height]) ||
      coverage.full_frame_checked !== true ||
      coverage.no_omitted_content !== true ||
      typeof coverage.reason !== "string" ||
      !coverage.reason.trim() ||
      used.size !== native.size ||
      (parent.quality.missing_pages || []).some((page) => page !== 1) ||
      !parent.title?.trim())
  )
    throw Error("Whole-image review must retain every native block and all visible content")
  return assertParse({
    schema_version: "source-parse/v1",
    source_id: parent.source_id,
    source_version_id: parent.source_version_id,
    parse_id: parseId,
    parser,
    status: complete ? "extracted" : "partial",
    title: parent.title,
    language: parent.language,
    dates: structuredClone(parent.dates),
    blocks,
    links: [],
    attachments: [],
    quality: {
      required_fields_present: complete,
      reviewed: complete,
      missing_pages: complete ? [] : [...(parent.quality.missing_pages || [])],
      source_format: "raster-image",
      source_width: width,
      source_height: height,
      numeric_verification: complete ? "reviewed-whole-image" : "reviewed-cells-only",
      table_structure: complete ? "reviewed-whole-image" : "reviewed-scoped",
      source_document_complete: complete,
      reviewed_cells: cellCount,
      referenced_ocr_blocks: used.size,
      unselected_ocr_blocks: parent.blocks.length - used.size,
      ...(complete
        ? {
            coverage_review: structuredClone(coverage),
            resolved_ocr_review_pages: [...(parent.quality.missing_pages || [])],
          }
        : {}),
    },
  })
}

export function loadOCRTableDependencies(root, parse) {
  const parser = parse.parser
  if (parser?.id !== "reviewed-raster-table") return []
  if (
    parser.version !== "1" ||
    !/^[a-f0-9]{64}$/.test(parser.adapter_sha256 || "") ||
    !/^parses\/[a-f0-9]{64}\/parse\.json$/.test(parser.parent_parse?.path || "") ||
    !/^runs\/[A-Za-z0-9_-]+\/ocr-table-review\.json$/.test(parser.review?.path || "")
  )
    throw Error("Native OCR table derivation references required")
  const read = (ref) => {
    const bytes = fs.readFileSync(safePath(root, ref.path))
    if (sha256(bytes) !== ref.sha256) throw Error("OCR table original parse or review changed")
    return JSON.parse(bytes)
  }
  const parent = read(parser.parent_parse),
    review = read(parser.review)
  if (
    parent.parser?.id === "reviewed-raster-table" ||
    parser.parent_parse.path !== `parses/${parent.parse_id}/parse.json` ||
    !same(review.source_parse, parser.parent_parse) ||
    parser.config_hash !== sha256(JSON.stringify(review))
  )
    throw Error("OCR table review must bind the exact original raster parse")
  const expected = projectOCRTable(parent, review, parser)
  expected.dates.observed_at = parse.dates?.observed_at
  if (!same(expected, parse)) throw Error("OCR table differs from its native reviewed cells")
  return [parser.parent_parse, parser.review]
}

export function prepareOCRTableView({ root, run, parent, review }) {
  if (!id(run)) throw Error("Safe OCR table run required")
  const parentRef = {
    path: `parses/${parent.parse_id}/parse.json`,
    sha256: sha256(fs.readFileSync(safePath(root, `parses/${parent.parse_id}/parse.json`))),
  }
  if (!same(review.source_parse, parentRef)) throw Error("Review original parse binding changed")
  const savedParent = readJSON(root, parentRef.path)
  if (!same(savedParent, parent))
    throw Error("Reviewed original raster differs from its canonical parse")
  const reviewRef = {
    path: `runs/${run}/ocr-table-review.json`,
    sha256: sha256(JSON.stringify(review, null, 2) + "\n"),
  }
  const parser = {
    id: "reviewed-raster-table",
    version: "1",
    config_hash: sha256(JSON.stringify(review)),
    adapter_sha256: sha256(fs.readFileSync(new URL(import.meta.url))),
    parent_parse: parentRef,
    review: reviewRef,
  }
  return { projected: projectOCRTable(parent, review, parser), reviewRef }
}

export async function createOCRTableView(options) {
  const { root, run, review } = options
  if (!id(run)) throw Error("Safe OCR table run required")
  return withLock(root, "run-" + run, () => {
    const { projected, reviewRef } = prepareOCRTableView(options)
    const existing = readJSON(root, reviewRef.path)
    if (existing && !same(existing, review)) throw Error("OCR table review changed; use a new run")
    if (existing && sha256(fs.readFileSync(safePath(root, reviewRef.path))) !== reviewRef.sha256)
      throw Error("OCR table review bytes changed")
    const file = `parses/${projected.parse_id}/parse.json`,
      old = readJSON(root, file)
    if (old && !same(old, projected)) throw Error("Reviewed OCR table parse collision")
    if (!existing) atomicCreate(root, reviewRef.path, review)
    if (!old) atomicCreate(root, file, projected)
    loadOCRTableDependencies(root, projected)
    return { parse: projected, reused: Boolean(existing && old) }
  })
}
