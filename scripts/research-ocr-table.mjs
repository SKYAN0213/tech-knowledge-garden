import fs from "node:fs"
import { parseArgs } from "node:util"
import { createOCRTableView, prepareOCRTableView } from "./research/ocr-table.mjs"
import { loadStoredSourceRun } from "./research/parser.mjs"
import { atomicCreate, readJSON, safePath, withLock, DEFAULT_ROOT } from "./research/run-state.mjs"
import { sha256 } from "./research/contracts.mjs"

const { values: v } = parseArgs({
  strict: true,
  options: {
    root: { type: "string", default: DEFAULT_ROOT },
    run: { type: "string" },
    "source-run": { type: "string" },
    "parse-id": { type: "string" },
    review: { type: "string" },
    "plan-only": { type: "boolean", default: false },
    execute: { type: "boolean", default: false },
  },
})
if (!v.review || [v["plan-only"], v.execute].filter(Boolean).length !== 1)
  throw Error("Explicit --review and --plan-only or --execute required")
const source = loadStoredSourceRun(v.root, v["source-run"])
const parent = source.parses.find((p) => p.parse_id === v["parse-id"])
if (!parent) throw Error("Exact stored raster parse required")
const document = source.documents.find((d) => d.source_version_id === parent.source_version_id)
if (!["image/png", "image/jpeg"].includes(document.mime_type?.split(";")[0]))
  throw Error("Reviewed table requires a stored original PNG/JPEG")
const review = JSON.parse(fs.readFileSync(safePath(v.root, v.review)))
const options = { root: v.root, run: v.run, parent, review }
const plan = prepareOCRTableView(options)
if (!v.execute) {
  console.log(
    JSON.stringify(
      {
        status: "planned",
        parse_id: plan.projected.parse_id,
        tables: plan.projected.blocks.length,
        quality: plan.projected.quality,
        candidate_published: false,
      },
      null,
      2,
    ),
  )
} else {
  await withLock(v.root, `ocr-table-command-${v.run}`, async () => {
    const input = {
      command: "ocr-table",
      source_identity: source.identity,
      parse_id: parent.parse_id,
      review_sha256: sha256(JSON.stringify(review)),
    }
    const outputs = {
      "input.json": input,
      "documents.json": [document],
      "parses.json": [plan.projected],
    }
    for (const [file, value] of Object.entries(outputs)) {
      const existing = readJSON(v.root, `runs/${v.run}/${file}`)
      if (existing && JSON.stringify(existing) !== JSON.stringify(value))
        throw Error("OCR table source input/output changed; use a new run")
    }
    if (
      JSON.stringify(loadStoredSourceRun(v.root, v["source-run"]).identity) !==
      JSON.stringify(source.identity)
    )
      throw Error("Original raster changed before table acceptance")
    const result = await createOCRTableView(options)
    for (const [file, value] of Object.entries(outputs)) {
      const name = `runs/${v.run}/${file}`,
        existing = readJSON(v.root, name)
      if (existing && JSON.stringify(existing) !== JSON.stringify(value))
        throw Error("OCR table output changed")
      if (!existing) atomicCreate(v.root, name, value)
    }
    loadStoredSourceRun(v.root, v.run)
    console.log(
      JSON.stringify(
        {
          status: result.parse.quality.source_document_complete
            ? "reviewed_whole_image"
            : "reviewed_scoped",
          parse_id: result.parse.parse_id,
          tables: result.parse.blocks.length,
          quality: result.parse.quality,
          reused: result.reused,
          candidate_published: false,
          source_requests: 0,
          model_calls: 0,
        },
        null,
        2,
      ),
    )
  })
}
