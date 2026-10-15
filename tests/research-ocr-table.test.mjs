import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import sharp from "sharp"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { atomicCreate } from "../scripts/research/run-state.mjs"
import { loadStoredSourceRun } from "../scripts/research/parser.mjs"
import { buildArchiveClosure } from "../scripts/research/archive-closure.mjs"
import {
  prepareOCRTableView,
  createOCRTableView,
  loadOCRTableDependencies,
} from "../scripts/research/ocr-table.mjs"
import {
  ocrEvidenceRequirements,
  recordFactReview,
  assertVerifiedClaim,
} from "../scripts/research/claims.mjs"

// Isolated synthetic source and review. These are not operating-source approvals.
async function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ocr-table-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const body = await sharp({
    create: { width: 300, height: 180, channels: 3, background: "white" },
  })
    .png()
    .toBuffer()
  const url = "https://example.test/synthetic-table.png",
    source = sourceId(url),
    hash = sha256(body)
  const document = {
    source_id: source,
    source_version_id: `${source}:${hash}`,
    body_sha256: hash,
    body_path: `documents/${source}/${hash}/body.bin`,
    original_url: url,
    mime_type: "image/png",
    fetch_status: "captured",
    observed_at: "2026-10-08T00:00:00Z",
  }
  const parseId = sha256("synthetic-original"),
    block = (n, text, bbox) => ({
      block_id: `${parseId}:block-${n}`,
      kind: "paragraph",
      text,
      locator: {
        type: "image",
        method: "ocr",
        coordinate_space: "source-pixels",
        bbox,
        confidence: 0.95,
        text_hash: sha256(text),
      },
    })
  const parent = {
    schema_version: "source-parse/v1",
    source_id: source,
    source_version_id: document.source_version_id,
    parse_id: parseId,
    parser: { id: "synthetic-ocr", version: "1" },
    status: "partial",
    title: "Synthetic table",
    language: "en",
    dates: { published_at: null, observed_at: document.observed_at },
    links: [],
    attachments: [],
    quality: {
      source_format: "raster-image",
      source_width: 300,
      source_height: 180,
      missing_pages: [],
    },
    blocks: [
      block(1, "Unit: units", [100, 5, 200, 20]),
      block(2, "Company", [5, 30, 80, 45]),
      block(3, "A", [5, 60, 80, 75]),
      block(4, "1O", [120, 60, 160, 75]),
      block(5, "B", [5, 90, 80, 105]),
      block(6, "20", [120, 90, 160, 105]),
      block(7, "Unselected original footnote", [10, 140, 200, 160]),
    ],
  }
  atomicCreate(root, document.body_path, body)
  const parentRef = atomicCreate(root, `parses/${parseId}/parse.json`, parent)
  atomicCreate(root, "runs/source/documents.json", [document])
  atomicCreate(root, "runs/source/parses.json", [parent])
  const cell = (cell_id, text, bbox, ids = []) => ({
    cell_id,
    text,
    bbox,
    block_ids: ids.map((n) => `${parseId}:block-${n}`),
    visual_checked: true,
    layout_checked: true,
    numbers_checked: true,
    reason: "Synthetic source cell explicitly transcribed",
  })
  const review = {
    schema: "research-ocr-table-review/v1",
    source_parse: parentRef,
    reviewer: "Synthetic reviewer",
    reviewed_at: "2026-10-09",
    tables: [
      {
        table_id: "synthetic",
        contexts: [cell("unit", "Unit: units", [100, 5, 200, 20], [1])],
        headers: [
          cell("company", "Company", [0, 25, 100, 50], [2]),
          cell("amount", "Amount", [100, 25, 200, 50]),
        ],
        rows: [
          [cell("a", "A", [0, 55, 100, 80], [3]), cell("a-amount", "10", [100, 55, 200, 80], [4])],
          [
            cell("b", "B", [0, 85, 100, 110], [5]),
            cell("b-amount", "20", [100, 85, 200, 110], [6]),
          ],
        ],
      },
    ],
  }
  return {
    root,
    parent,
    document,
    review,
    run: "table",
    options: { root, parent, review, run: "table" },
  }
}

test("reviewed table retains original cells, corrections, omitted OCR and partial scope", async (t) => {
  const f = await fixture(t),
    before = JSON.stringify(f.parent)
  const { parse } = await createOCRTableView(f.options),
    table = parse.blocks[0]
  assert.deepEqual(table.rows, [
    ["Company", "Amount"],
    ["A", "10"],
    ["B", "20"],
  ])
  assert.equal(table.cell_evidence.rows[0][1].original_blocks[0].text, "1O")
  assert.equal(table.cell_evidence.rows[0][1].transcription_changed, true)
  assert.deepEqual(table.cell_evidence.headers[1].original_blocks, [])
  assert.equal(table.cell_evidence.headers[1].transcription_changed, true)
  assert.equal(parse.status, "partial")
  assert.equal(parse.dates.published_at, null)
  assert.equal(parse.quality.source_document_complete, false)
  assert.equal(parse.quality.unselected_ocr_blocks, 1)
  assert.equal(parse.quality.reviewed_cells, 7)
  assert.equal(JSON.stringify(f.parent), before)
  assert.equal(loadOCRTableDependencies(f.root, parse).length, 2)
})

test("whole-frame review retains missed cells and resolves the original raster OCR page", async (t) => {
  const f = await fixture(t)
  f.parent.quality.missing_pages = [1]
  const parentFile = `parses/${f.parent.parse_id}/parse.json`
  fs.writeFileSync(path.join(f.root, parentFile), JSON.stringify(f.parent, null, 2) + "\n")
  f.review.source_parse.sha256 = sha256(fs.readFileSync(path.join(f.root, parentFile)))
  f.review.tables[0].contexts.push({
    cell_id: "footnote",
    text: "Unselected original footnote",
    bbox: [10, 140, 200, 160],
    block_ids: [f.parent.blocks[6].block_id],
    visual_checked: true,
    layout_checked: true,
    reason: "Synthetic whole-frame footnote explicitly read",
  })
  f.review.coverage = {
    scope: "whole-image",
    bbox: [0, 0, 300, 180],
    full_frame_checked: true,
    no_omitted_content: true,
    reason: "Synthetic original frame read including the header missed by OCR",
  }
  const { parse } = await createOCRTableView(f.options)
  assert.equal(parse.status, "extracted")
  assert.equal(parse.quality.source_document_complete, true)
  assert.equal(parse.quality.unselected_ocr_blocks, 0)
  assert.deepEqual(parse.quality.missing_pages, [])
  assert.deepEqual(parse.quality.resolved_ocr_review_pages, [1])
  assert.equal(parse.blocks[0].cell_evidence.headers[1].original_blocks.length, 0)
  assert.deepEqual(f.parent.quality.missing_pages, [1])
  loadOCRTableDependencies(f.root, parse)
  for (const mutate of [
    (r) => r.tables[0].contexts.pop(),
    (r) => (r.coverage.bbox = [0, 0, 299, 180]),
    (r) => (r.coverage.no_omitted_content = false),
    (r) => (r.coverage.full_frame_checked = false),
    (r) => (r.coverage.reason = ""),
  ]) {
    const review = structuredClone(f.review)
    mutate(review)
    assert.throws(() => prepareOCRTableView({ ...f.options, review }))
  }
})

test("explicit visually empty columns remain empty and cannot erase recognized source text", async (t) => {
  const f = await fixture(t)
  const empty = (id, y1, y2) => ({ cell_id: id, text: "", bbox: [200, y1, 300, y2], block_ids: [], visual_checked: true, layout_checked: true, reason: "Synthetic original grid has a visibly empty third column" })
  f.review.tables[0].headers.push(empty("empty-header", 25, 50))
  f.review.tables[0].rows[0].push(empty("empty-a", 55, 80))
  f.review.tables[0].rows[1].push(empty("empty-b", 85, 110))
  const { parse } = await createOCRTableView(f.options)
  assert.deepEqual(parse.blocks[0].rows, [["Company", "Amount", ""], ["A", "10", ""], ["B", "20", ""]])
  assert.equal(parse.quality.source_document_complete, false)
  loadOCRTableDependencies(f.root, parse)
  for (const mutate of [
    (r) => { r.tables[0].rows[0][1].text = "" },
    (r) => { r.tables[0].headers[2].text = " " },
    (r) => { r.tables[0].headers[2].visual_checked = false },
  ]) {
    const review = structuredClone(f.review)
    mutate(review)
    assert.throws(() => prepareOCRTableView({ ...f.options, review }), /visually reviewed/)
  }
})

test("missing cells, swapped rows/columns and reused original blocks are rejected", async (t) => {
  const f = await fixture(t)
  for (const mutate of [
    (r) => r.tables[0].rows[0].pop(),
    (r) => r.tables[0].headers.reverse(),
    (r) => r.tables[0].rows.reverse(),
    (r) => r.tables[0].rows[0].reverse(),
    (r) => (r.tables[0].rows[1][1].block_ids = r.tables[0].rows[0][1].block_ids),
    (r) => (r.tables[0].rows[0][1].bbox = [200, 55, 300, 80]),
    (r) => (r.tables[0].headers[1].bbox = [100, 25, 301, 50]),
    (r) => (r.tables[0].rows[0][1].visual_checked = false),
    (r) => (r.tables[0].rows[0][1].numbers_checked = false),
    (r) => (r.tables[0].rows[0][1].text = "10 | 20"),
    (r) => (r.reviewed_at = "2026-10-07"),
  ]) {
    const review = structuredClone(f.review)
    mutate(review)
    assert.throws(() => prepareOCRTableView({ ...f.options, review }))
  }
  assert.equal(fs.existsSync(path.join(f.root, "runs/table")), false)
})

test("replay preserves immutable bytes and conflicting destinations have no partial write", async (t) => {
  const f = await fixture(t),
    first = await createOCRTableView(f.options)
  const file = path.join(f.root, `parses/${first.parse.parse_id}/parse.json`)
  const before = fs.readFileSync(file)
  assert.equal((await createOCRTableView(f.options)).reused, true)
  assert.deepEqual(fs.readFileSync(file), before)
  const other = await fixture(t),
    planned = prepareOCRTableView(other.options)
  atomicCreate(other.root, `parses/${planned.projected.parse_id}/parse.json`, { collision: true })
  await assert.rejects(() => createOCRTableView(other.options), /collision/)
  assert.equal(fs.existsSync(path.join(other.root, "runs/table/ocr-table-review.json")), false)
})

test("changed original/review and invented derived cells fail native evidence replay", async (t) => {
  for (const target of ["original", "review", "derived"]) {
    const f = await fixture(t),
      { parse } = await createOCRTableView(f.options)
    let file
    if (target === "original") file = f.review.source_parse.path
    else if (target === "review") file = parse.parser.review.path
    else file = `parses/${parse.parse_id}/parse.json`
    if (target !== "derived") fs.appendFileSync(path.join(f.root, file), " ")
    else {
      parse.blocks[0].text += "\nInvented result"
      parse.blocks[0].locator.text_hash = sha256(parse.blocks[0].text)
      fs.writeFileSync(path.join(f.root, file), JSON.stringify(parse))
    }
    assert.throws(() => loadOCRTableDependencies(f.root, parse), /changed|differs/)
  }
})

test("CLI plans without writes, executes a native source and replays without modification", async (t) => {
  const f = await fixture(t)
  atomicCreate(f.root, "table-review.json", f.review)
  const invoke = (mode) =>
    spawnSync(
      process.execPath,
      [
        "scripts/research-ocr-table.mjs",
        "--root",
        f.root,
        "--run",
        f.run,
        "--source-run",
        "source",
        "--parse-id",
        f.parent.parse_id,
        "--review",
        "table-review.json",
        mode,
      ],
      { encoding: "utf8" },
    )
  const plan = invoke("--plan-only")
  assert.equal(plan.status, 0, plan.stderr)
  assert.equal(JSON.parse(plan.stdout).status, "planned")
  assert.equal(fs.existsSync(path.join(f.root, "runs/table")), false)
  const first = invoke("--execute")
  assert.equal(first.status, 0, first.stderr)
  assert.equal(JSON.parse(first.stdout).candidate_published, false)
  const stored = loadStoredSourceRun(f.root, f.run)
  assert.equal(stored.parses[0].status, "partial")
  assert.deepEqual(stored.documents, [f.document])
  const before = fs.readFileSync(path.join(f.root, "runs/table/parses.json"))
  const replay = invoke("--execute")
  assert.equal(replay.status, 0, replay.stderr)
  assert.equal(JSON.parse(replay.stdout).reused, true)
  assert.deepEqual(fs.readFileSync(path.join(f.root, "runs/table/parses.json")), before)
  const closure = buildArchiveClosure(f.root, "dependency-check", f.run)
  assert.ok(closure.files.some((entry) => entry.path === f.review.source_parse.path))
  assert.ok(closure.files.some((entry) => entry.path === stored.parses[0].parser.review.path))
  assert.ok(closure.files.some((entry) => entry.path === f.document.body_path))
})

test("CLI source conflicts are preflighted before table artifacts are created", async (t) => {
  const f = await fixture(t)
  atomicCreate(f.root, "table-review.json", f.review)
  atomicCreate(f.root, "runs/table/documents.json", [{ unrelated: true }])
  const result = spawnSync(
    process.execPath,
    [
      "scripts/research-ocr-table.mjs",
      "--root",
      f.root,
      "--run",
      f.run,
      "--source-run",
      "source",
      "--parse-id",
      f.parent.parse_id,
      "--review",
      "table-review.json",
      "--execute",
    ],
    { encoding: "utf8" },
  )
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /source input\/output changed/)
  assert.equal(fs.existsSync(path.join(f.root, "runs/table/ocr-table-review.json")), false)
})

test("table quantities reach existing fact checks with units/conditions and visual proof", async (t) => {
  const f = await fixture(t),
    { parse } = await createOCRTableView(f.options)
  const claim = {
    claim_id: "synthetic-table-fact",
    candidate_key: "synthetic",
    statement: "A has 10 units.",
    claim_kind: "attributed_fact",
    subject: "A",
    event_state: "reported",
    published_at: null,
    effective_period: null,
    numbers: [{ literal: "10", unit: "units", condition: "A" }],
    evidence: [
      {
        source_id: parse.source_id,
        source_version_id: parse.source_version_id,
        parse_id: parse.parse_id,
        block_id: parse.blocks[0].block_id,
        quote: parse.blocks[0].text,
        support: "direct",
      },
    ],
  }
  const decision = {
    claim_id: claim.claim_id,
    status: "verified",
    reason: "Synthetic original compared",
    source_read: true,
    entailment_checked: true,
    identity_checked: true,
    numbers_checked: true,
    time_checked: true,
  }
  const review = { reviewer: "Synthetic reviewer", reviewed_at: "2026-10-09" }
  assert.throws(() => recordFactReview([claim], [decision], review, [parse]), /OCR fact requires/)
  decision.ocr_evidence = ocrEvidenceRequirements(claim, [parse]).map((row) => ({
    evidence_ref: row.evidence_ref,
    visual_checked: true,
    layout_checked: true,
    numbers_checked: true,
    reason: "Synthetic unit/header/row checked",
  }))
  const [verified] = recordFactReview([claim], [decision], review, [parse])
  assert.equal(assertVerifiedClaim(verified, [parse]), verified)
  assert.equal(parse.status, "partial")
})
