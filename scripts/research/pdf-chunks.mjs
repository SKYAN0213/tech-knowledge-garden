import fs from "node:fs"
import { assertParse, sha256 } from "./contracts.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const unique = (values) => [...new Set(values)].sort((a, b) => a - b)

// Saved page windows are parse checkpoints, never complete source approvals.
// Failed windows are not stored. A later explicit reparse starts at the first
// missing window; changed source/settings/implementation have a different key.
export async function parsePDFChunks(
  root,
  document,
  options,
  { parsePart, storeParse, clock = Date.now },
) {
  const size = options.pdf_chunk_pages,
    maximum = options.max_pages ?? 200
  const budget = options.timeout_ms ?? 120000
  if (
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > 40 ||
    !Number.isSafeInteger(maximum) ||
    maximum < 1 ||
    maximum > 1000 ||
    !Number.isSafeInteger(budget) ||
    budget < 1 ||
    budget > 120000 ||
    Object.hasOwn(options, "pdf_page_range")
  )
    throw Error("Bounded PDF chunk size/page limit/time budget required")
  const settings = { ...options }
  delete settings.pdf_chunk_pages
  const implementation = sha256(fs.readFileSync(new URL(import.meta.url)))
  const worker = sha256(
    fs.readFileSync(new URL("../../integrations/research-worker/worker.py", import.meta.url)),
  )
  const binding = {
    source_id: document.source_id,
    source_version_id: document.source_version_id,
    body_sha256: document.body_sha256,
    settings: options,
    implementation,
    worker,
  }
  const key = sha256(JSON.stringify(binding))
  return withLock(root, "pdf-chunks-" + key.slice(0, 32), async () => {
    const started = clock(),
      parts = [],
      references = []
    let pages = null,
      outputBytes = 0
    for (let start = 1; pages === null || start <= pages; start += size) {
      const range = [start, start + size - 1]
      const file = `pdf-chunks/${key}/${start}.json`
      let receipt = readJSON(root, file),
        parse
      if (receipt) {
        if (
          receipt.schema !== "research-pdf-chunk/v1" ||
          !equal(receipt.binding, binding) ||
          !equal(receipt.requested_range, range) ||
          !/^parses\/[a-f0-9]{64}\/parse\.json$/.test(receipt.parse?.path || "")
        )
          throw Error("PDF chunk checkpoint identity changed")
        const bytes = fs.readFileSync(safePath(root, receipt.parse.path))
        if (sha256(bytes) !== receipt.parse.sha256) throw Error("PDF chunk bytes changed")
        parse = JSON.parse(bytes)
      } else {
        const remaining = budget - (clock() - started)
        if (remaining <= 0)
          throw Error("PDF chunk time budget exceeded; completed windows preserved")
        parse = await parsePart({ ...settings, pdf_page_range: range }, remaining)
        if (parse.status === "blocked") return parse
      }
      assertParse(parse)
      if (
        parse.source_id !== document.source_id ||
        parse.source_version_id !== document.source_version_id ||
        parse.parser?.adapter_sha256 !== worker ||
        !Number.isSafeInteger(parse.page_count) ||
        parse.page_count < 1 ||
        parse.page_count > maximum ||
        (pages !== null && parse.page_count !== pages) ||
        !equal(parse.quality?.page_range, [start, Math.min(range[1], parse.page_count)]) ||
        !equal(
          parse.quality?.unparsed_pages,
          Array.from({ length: parse.page_count }, (_, i) => i + 1).filter(
            (p) => p < start || p > range[1],
          ),
        ) ||
        parse.blocks.some(
          (block) =>
            block.locator?.type !== "pdf" ||
            block.locator.page < start ||
            block.locator.page > Math.min(range[1], parse.page_count),
        )
      )
        throw Error("PDF chunk source/page coverage differs from its native result")
      pages = parse.page_count
      if (!receipt) {
        const parsePath = `parses/${parse.parse_id}/parse.json`
        receipt = {
          schema: "research-pdf-chunk/v1",
          binding,
          requested_range: range,
          parse: { path: parsePath, sha256: sha256(fs.readFileSync(safePath(root, parsePath))) },
        }
        atomicCreate(root, file, receipt)
      }
      parts.push(parse)
      references.push(receipt.parse)
      outputBytes += Buffer.byteLength(JSON.stringify(parse))
      if (outputBytes > 20 * 1024 ** 2)
        throw Error("PDF chunk aggregate output too large; completed windows preserved")
    }
    const merged = mergePDFChunks(document, options, parts, references, { implementation, worker })
    return storeParse(merged)
  })
}

export function mergePDFChunks(document, options, parts, references, { implementation, worker }) {
  const pages = parts[0]?.page_count
  if (!Number.isSafeInteger(pages) || parts.length !== references.length)
    throw Error("Complete native PDF chunk inventory required")
  let next = 1
  for (const part of parts) {
    const range = part.quality?.page_range
    if (
      !range ||
      range[0] !== next ||
      range[1] < range[0] ||
      range[1] > pages ||
      part.page_count !== pages
    )
      throw Error("PDF chunk inventory has gaps or overlaps")
    next = range[1] + 1
  }
  if (next !== pages + 1) throw Error("PDF chunks do not cover the complete document")
  const titles = [...new Set(parts.map((p) => p.title).filter(Boolean))]
  const dated = parts.filter((p) => p.dates?.published_at)
  if (
    titles.length > 1 ||
    new Set(dated.map((p) => p.dates.published_at)).size > 1 ||
    new Set(parts.map((p) => p.parser.version)).size !== 1
  )
    throw Error("PDF chunk title/date/library versions conflict")
  const titlePart = parts.find((p) => p.title_basis) || parts.find((p) => p.title)
  const blocks = parts.flatMap((p) => p.blocks.map((block) => ({ ...block })))
  const ocrReview = parts.flatMap((p) => p.quality.ocr_review_blocks || [])
  const missing = unique([
    ...parts.flatMap((p) => p.quality.missing_pages || []),
    ...ocrReview
      .filter((item) => item.reasons.includes("low-confidence"))
      .map((item) => item.locator.page),
  ])
  const issues = parts.flatMap((p) => p.quality.table_context_issues || [])
  const unavailable = [...new Set(parts.map((p) => p.quality.ocr_unavailable).filter(Boolean))]
  const models = [...new Set(parts.map((p) => p.quality.ocr_model).filter(Boolean))]
  if (models.length > 1) throw Error("PDF chunks have conflicting OCR models")
  const parser = {
    id: "pdf-page-chunks",
    version: "1",
    library_version: parts[0].parser.version,
    config_hash: sha256(JSON.stringify(options)),
    adapter_sha256: implementation,
    worker_sha256: worker,
    chunks: references,
  }
  const parseId = sha256(JSON.stringify([document.source_version_id, parser, "local-research/v1"]))
  for (const [i, block] of blocks.entries())
    block.block_id = `${parseId}:block-${String(i + 1).padStart(4, "0")}`
  const complete =
    titles.length === 1 &&
    blocks.length > 0 &&
    !missing.length &&
    !issues.length &&
    !unavailable.length
  return assertParse({
    schema_version: "source-parse/v1",
    source_id: document.source_id,
    source_version_id: document.source_version_id,
    parse_id: parseId,
    parser,
    status: complete ? "extracted" : "partial",
    title: titles[0] || null,
    title_basis: titlePart?.title_basis || null,
    language: parts[0].language,
    dates: { ...(dated[0]?.dates || parts[0].dates), observed_at: document.observed_at },
    blocks,
    links: [],
    attachments: [],
    page_count: pages,
    quality: {
      required_fields_present: complete,
      missing_pages: missing,
      reviewed: false,
      chunk_count: parts.length,
      ocr_pages: unique(parts.flatMap((p) => p.quality.ocr_pages || [])),
      ...(options.pdf_table_context
        ? {
            table_context_issues: issues,
            scoped_table_count: blocks.filter((b) => b.context_fragments).length,
          }
        : {}),
      ...(models.length ? { ocr_model: models[0] } : {}),
      ...(parts.some((p) => p.quality.ocr_pages?.length)
        ? {
            ocr_review_blocks: ocrReview,
            numeric_verification: "unreviewed",
            table_structure: "unreviewed",
          }
        : {}),
      ...(unavailable.length ? { ocr_unavailable: unavailable.join(",") } : {}),
      ...(parts.some((p) => p.quality.profile_accepted_sparse_pages?.length)
        ? {
            profile_accepted_sparse_pages: unique(
              parts.flatMap((p) => p.quality.profile_accepted_sparse_pages || []),
            ),
          }
        : {}),
    },
  })
}
