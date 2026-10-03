import { loadStoredSourceRun, selectStoredSources } from "./parser.mjs"
import { atomicWrite, readJSON, withLock } from "./run-state.mjs"
import { sha256 } from "./contracts.mjs"

export async function saveSourceSelection(root, runId, selected, context = {}) {
  const identity = selected?.identity
  if (
    typeof identity?.source_run !== "object" ||
    !identity.source_run ||
    identity.source_run.source_run === runId ||
    Object.keys(context).some((key) => key === "schema" || Object.hasOwn(identity, key))
  )
    throw Error("Exact source selection origin and unmodified identity required")
  const expected = selectStoredSources(root, identity.source_run.source_run, identity.selected_urls)
  if (
    ["identity", "documents", "parses"].some(
      (key) => sha256(JSON.stringify(selected[key])) !== sha256(JSON.stringify(expected[key])),
    )
  )
    throw Error("Source selection differs from its exact stored origin")
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
