import { loadStoredSourceRun } from "./parser.mjs"
import { atomicWrite, readJSON, withLock } from "./run-state.mjs"
import { sha256 } from "./contracts.mjs"

export async function saveSourceSelection(root, runId, selected, context = {}) {
  return withLock(root, "run-" + runId, async () => {
    const manifest = {
      schema: "research-source-selection/v1",
      ...selected.identity,
      ...context,
      candidate_published: false,
    }
    const existing = readJSON(root, `runs/${runId}/source-selection.json`)
    if (existing && sha256(JSON.stringify(existing)) !== sha256(JSON.stringify(manifest)))
      throw Error("Source selection input changed; use a new run")
    if (existing) {
      const current = loadStoredSourceRun(root, runId)
      if (
        current.identity.documents_sha256 !== selected.identity.documents_sha256 ||
        current.identity.parses_sha256 !== selected.identity.parses_sha256
      )
        throw Error("Stored source selection changed after creation")
    }
    atomicWrite(root, `runs/${runId}/documents.json`, selected.documents)
    atomicWrite(root, `runs/${runId}/parses.json`, selected.parses)
    atomicWrite(root, `runs/${runId}/source-selection.json`, manifest)
    return {
      sources: selected.documents.length,
      parses: selected.parses.length,
      candidate_published: false,
    }
  })
}
