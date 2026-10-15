import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256 } from "../scripts/research/contracts.mjs"
import { parsePDFChunks, mergePDFChunks } from "../scripts/research/pdf-chunks.mjs"
import { storeParseArtifact, parseDocument } from "../scripts/research/parser.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pdf-chunks-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const doc = {
    source_id: "source",
    source_version_id: "version",
    body_sha256: sha256("source"),
    observed_at: "2026-10-09T00:00:00Z",
  }
  const worker = sha256(fs.readFileSync("integrations/research-worker/worker.py"))
  const options = { pdf_chunk_pages: 2, max_pages: 10, timeout_ms: 10000 }
  const calls = [],
    parts = []
  const parsePart = async (settings, timeout) => {
    assert.ok(timeout > 0 && timeout <= 10000)
    assert.ok(!Object.hasOwn(settings, "pdf_chunk_pages"))
    const [start, requested] = settings.pdf_page_range,
      end = Math.min(5, requested)
    calls.push(start)
    const id = sha256(JSON.stringify([settings, doc.source_version_id]))
    const parse = {
      schema_version: "source-parse/v1",
      source_id: doc.source_id,
      source_version_id: doc.source_version_id,
      parse_id: id,
      parser: { id: "pymupdf", version: "test", adapter_sha256: worker },
      status: "partial",
      title: "Report",
      language: "en",
      links: [],
      attachments: [],
      dates: { published_at: "2026-10-01", observed_at: doc.observed_at },
      page_count: 5,
      quality: {
        required_fields_present: false,
        missing_pages: [],
        reviewed: false,
        page_range: [start, end],
        unparsed_pages: [1, 2, 3, 4, 5].filter((p) => p < start || p > end),
      },
      blocks: Array.from({ length: end - start + 1 }, (_, i) => {
        const text = `Report original page ${start + i}`
        return {
          block_id: `${id}:block-${i + 1}`,
          kind: "paragraph",
          text,
          locator: { type: "pdf", page: start + i, bbox: [0, 0, 100, 20], text_hash: sha256(text) },
        }
      }),
    }
    storeParseArtifact(root, parse)
    parts.push(parse)
    return parse
  }
  return {
    root,
    doc,
    options,
    calls,
    parts,
    parsePart,
    hooks: { parsePart, storeParse: (parse) => storeParseArtifact(root, parse) },
  }
}

test("interrupted PDF resumes missing windows and completed replay invokes no worker", async (t) => {
  const f = fixture(t)
  await assert.rejects(
    () =>
      parsePDFChunks(f.root, f.doc, f.options, {
        ...f.hooks,
        parsePart: (settings, budget) => {
          if (settings.pdf_page_range[0] === 3) throw Error("Synthetic interruption")
          return f.parsePart(settings, budget)
        },
      }),
    /Synthetic interruption/,
  )
  assert.deepEqual(f.calls, [1])
  const result = await parsePDFChunks(f.root, f.doc, f.options, f.hooks)
  assert.deepEqual(f.calls, [1, 3, 5])
  assert.equal(result.status, "extracted")
  assert.deepEqual(
    result.blocks.map((b) => b.locator.page),
    [1, 2, 3, 4, 5],
  )
  assert.equal(result.quality.chunk_count, 3)
  const reread = await parsePDFChunks(f.root, f.doc, f.options, {
    ...f.hooks,
    parsePart: () => {
      throw Error("Completed PDF must not run again")
    },
  })
  assert.deepEqual(reread, result)
  const newObservation = await parsePDFChunks(
    f.root,
    { ...f.doc, observed_at: "2026-10-09T01:00:00Z" },
    f.options,
    f.hooks,
  )
  assert.equal(newObservation.parse_id, result.parse_id)
  assert.equal(newObservation.dates.observed_at, "2026-10-09T01:00:00Z")
})

test("budget expiration preserves native progress instead of returning an incomplete approval", async (t) => {
  const f = fixture(t)
  let now = 0
  await assert.rejects(
    () =>
      parsePDFChunks(f.root, f.doc, f.options, {
        ...f.hooks,
        clock: () => now,
        parsePart: async (...args) => {
          const part = await f.parsePart(...args)
          now = 10001
          return part
        },
      }),
    /time budget.*preserved/,
  )
  assert.deepEqual(f.calls, [1])
  await parsePDFChunks(f.root, f.doc, f.options, f.hooks)
  assert.deepEqual(f.calls, [1, 3, 5])
})

test("changed cached bytes and wrong page/source coverage fail before reuse", async (t) => {
  const f = fixture(t)
  await parsePDFChunks(f.root, f.doc, f.options, f.hooks)
  const file = path.join(f.root, `parses/${f.parts[0].parse_id}/parse.json`)
  fs.appendFileSync(file, " ")
  await assert.rejects(() => parsePDFChunks(f.root, f.doc, f.options, f.hooks), /bytes changed/)
  const other = fixture(t)
  await assert.rejects(
    () =>
      parsePDFChunks(other.root, other.doc, other.options, {
        ...other.hooks,
        parsePart: async (...args) => {
          const part = await other.parsePart(...args)
          part.source_id = "other"
          return part
        },
      }),
    /source\/page coverage/,
  )
})

test("merge retains missing OCR pages and rejects gaps or conflicting metadata", async (t) => {
  const f = fixture(t)
  await parsePDFChunks(f.root, f.doc, f.options, f.hooks)
  const refs = f.parts.map((p) => ({
    path: `parses/${p.parse_id}/parse.json`,
    sha256: sha256(JSON.stringify(p)),
  }))
  const metadata = { implementation: "test", worker: "test" }
  const parts = structuredClone(f.parts)
  parts[1].quality.missing_pages = [3]
  parts[1].quality.ocr_unavailable = "korean-model-not-installed"
  const partial = mergePDFChunks(f.doc, f.options, parts, refs, metadata)
  assert.equal(partial.status, "partial")
  assert.deepEqual(partial.quality.missing_pages, [3])
  assert.throws(
    () => mergePDFChunks(f.doc, f.options, [parts[0], parts[2]], [refs[0], refs[2]], metadata),
    /gaps/,
  )
  parts[1].title = "Other report"
  assert.throws(() => mergePDFChunks(f.doc, f.options, parts, refs, metadata), /conflict/)
})

test("chunk merge keeps original OCR review positions and never verifies numeric tokens", async (t) => {
  const f = fixture(t)
  await parsePDFChunks(f.root, f.doc, f.options, f.hooks)
  const parts = structuredClone(f.parts)
  const locator = {
    ...parts[1].blocks[0].locator,
    method: "ocr",
    confidence: 0.8,
  }
  parts[1].blocks[0].locator = locator
  parts[1].quality.ocr_pages = [3]
  parts[1].quality.ocr_model = "synthetic-model"
  parts[1].quality.ocr_review_blocks = [
    {
      locator,
      reasons: ["low-confidence", "numeric-review"],
      numeric_tokens: ["3"],
    },
  ]
  const refs = parts.map((p) => ({
    path: `parses/${p.parse_id}/parse.json`,
    sha256: sha256(JSON.stringify(p)),
  }))
  const result = mergePDFChunks(f.doc, f.options, parts, refs, {
    implementation: "test",
    worker: "test",
  })
  assert.equal(result.status, "partial")
  assert.deepEqual(result.quality.missing_pages, [3])
  assert.deepEqual(result.quality.ocr_review_blocks, parts[1].quality.ocr_review_blocks)
  assert.equal(result.quality.numeric_verification, "unreviewed")
  assert.equal(result.quality.table_structure, "unreviewed")
  assert.equal(result.quality.reviewed, false)
  assert.equal(result.quality.ocr_review_blocks[0].locator.page, 3)
})

test("unsafe chunk budgets and non-PDF input are rejected", async (t) => {
  const f = fixture(t)
  for (const changes of [
    { pdf_chunk_pages: 0 },
    { pdf_chunk_pages: 41 },
    { max_pages: 1001 },
    { timeout_ms: 120001 },
    { pdf_page_range: [1, 2] },
  ])
    await assert.rejects(
      () => parsePDFChunks(f.root, f.doc, { ...f.options, ...changes }, f.hooks),
      /Bounded/,
    )
  fs.writeFileSync(path.join(f.root, "body.html"), "<html></html>")
  await assert.rejects(
    () =>
      parseDocument(
        f.root,
        {
          ...f.doc,
          fetch_status: "captured",
          body_path: "body.html",
          body_sha256: sha256("<html></html>"),
        },
        f.options,
      ),
    /original PDF/,
  )
})
