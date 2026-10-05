import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { loadStoredSourceRun } from "./parser.mjs"
import { readJSON, safePath } from "./run-state.mjs"

// Only a completed extraction is reusable. Later assessment failure does not
// erase it, and neither a reviewed claim copy nor an arbitrary JSON file seals it.
export function loadCompletedExtraction(root, run, documents, parses) {
  const source = loadStoredSourceRun(root, run)
  if (
    JSON.stringify(source.documents) !== JSON.stringify(documents) ||
    JSON.stringify(source.parses) !== JSON.stringify(parses)
  )
    throw Error("Reused extraction requires the exact selected documents and parses")
  const base = `runs/${run}/`
  const input = readJSON(root, base + "source-processing-input.json")
  const state = readJSON(root, base + "processing/state.json")
  const stage = state?.stages?.extraction
  const result = readJSON(root, base + "processing/extraction.json")
  const extracted = readJSON(root, base + "claims.json")
  if (
    input?.schema !== "research-source-processing-input/v1" ||
    state?.run_id !== run ||
    state?.input_hash !== sha256(JSON.stringify(input)) ||
    stage?.status !== "complete" ||
    stage.result_path !== base + "processing/extraction.json" ||
    !result ||
    stage.result_hash !== sha256(JSON.stringify(result)) ||
    extracted?.source_processing?.run !== run ||
    extracted.source_processing.input_sha256 !== sha256(JSON.stringify(input)) ||
    JSON.stringify(extracted) !==
      JSON.stringify({
        ...result,
        source_processing: { run, input_sha256: sha256(JSON.stringify(input)) },
      })
  )
    throw Error("Completed source-bound extraction checkpoint required for reuse")
  return fs.readFileSync(safePath(root, base + "claims.json"))
}

export function assertProcessingExtractionOrigin(root, input, documents, parses) {
  const file = safePath(root, `runs/${input.source_run}/claims.json`)
  const bytes = input.extraction_run
    ? loadCompletedExtraction(root, input.extraction_run, documents, parses)
    : fs.existsSync(file)
      ? fs.readFileSync(file)
      : null
  if (input.source_extraction_sha256 !== (bytes ? sha256(bytes) : null))
    throw Error("Reused extraction origin changed")
}
