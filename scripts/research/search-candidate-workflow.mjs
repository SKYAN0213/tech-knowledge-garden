import { atomicWrite, readJSON, withLock } from "./run-state.mjs"
import { sha256 } from "./contracts.mjs"
import { collectSearchCandidates } from "./search-candidate-collection.mjs"
import { intakeSearchCandidateBatch } from "./search-candidate-batch-intake.mjs"
import { selectIntakenSearchCandidate } from "./search-candidate-intake.mjs"

function validId(value, label) {
  if (!/^[a-zA-Z0-9_-]+$/.test(value || "")) throw Error(`Valid ${label} required`)
}

export async function processSearchCandidates({
  root,
  runId,
  searchRunId,
  candidateKeys,
  articleProfiles,
  backlogFile,
  fetcher,
  fetchSource,
  parseSource,
  saveSelection,
}) {
  validId(runId, "workflow run ID")
  validId(searchRunId, "search run ID")
  if (runId === searchRunId) throw Error("Workflow and search runs must be distinct")
  if (typeof saveSelection !== "function") throw Error("Source selection writer is required")
  if (!Array.isArray(candidateKeys) || !candidateKeys.length || candidateKeys.length > 12)
    throw Error("Workflow requires one to twelve exact candidate keys")
  if (!Array.isArray(articleProfiles)) throw Error("Article profiles are required")
  if (new Set(candidateKeys).size !== candidateKeys.length)
    throw Error("Duplicate candidate keys in workflow")
  const search = readJSON(root, `runs/${searchRunId}/search.json`)
  if (!search || !Array.isArray(search.candidates)) throw Error("Stored search candidates required")
  const missing = candidateKeys.filter(
    (key) => search.candidates.filter((candidate) => candidate.key === key).length !== 1,
  )
  if (missing.length) throw Error("Workflow requires exact candidates from the search run")

  const collectionRunId = `${runId}-collect`
  const intakeRunId = `${runId}-intake`
  if ([collectionRunId, intakeRunId].includes(searchRunId))
    throw Error("Derived workflow run IDs conflict with the search run")
  const input = {
    schema: "research-search-candidate-workflow-input/v1",
    search_run: searchRunId,
    search_sha256: sha256(JSON.stringify(search)),
    candidate_keys: candidateKeys,
    article_profiles_sha256: sha256(JSON.stringify(articleProfiles)),
  }
  const inputSha = sha256(JSON.stringify(input))
  const receiptPath = `runs/${runId}/search-candidate-workflow.json`

  return withLock(root, "search-candidate-workflow-" + runId, async () => {
    const previous = readJSON(root, receiptPath)
    if (previous && previous.input_sha256 !== inputSha)
      throw Error("Workflow input changed; use a new run ID")
    const results = new Map(
      (previous?.results || []).map((result) => [result.candidate_key, result]),
    )
    const persist = (status, stages = {}) => {
      const ordered = candidateKeys.map(
        (key) => results.get(key) || { candidate_key: key, status: "pending" },
      )
      const selected = ordered.filter((result) => result.selection_status === "selected").length
      const failed = ordered.filter((result) => result.status === "failed").length
      const value = {
        run_id: runId,
        ...input,
        schema: "research-search-candidate-workflow/v1",
        input_sha256: inputSha,
        status,
        stages,
        total: ordered.length,
        selected,
        not_selected: ordered.length - selected,
        failed,
        candidate_published: false,
        results: ordered,
      }
      atomicWrite(root, receiptPath, value)
      return value
    }

    persist("running", { collection: "pending", intake: "pending", selection: "pending" })
    const collection = await collectSearchCandidates({
      root,
      runId: collectionRunId,
      searchRunId,
      candidateKeys,
      articleProfiles,
      fetcher,
      fetchSource,
      parseSource,
    })
    const collectionReceipt = readJSON(root, collection.receipt)
    const intakeManifest = {
      schema: "search-candidate-intake-batch/v1",
      candidates: candidateKeys.map((candidateKey) => ({
        candidate_key: candidateKey,
        source_run: collectionRunId,
      })),
    }
    persist("running", {
      collection: collection.status,
      intake: "pending",
      selection: "pending",
    })
    const intake = await intakeSearchCandidateBatch({
      root,
      runId: intakeRunId,
      searchRunId,
      manifest: intakeManifest,
      backlogFile,
    })
    const intakeReceipt = readJSON(root, intake.receipt)
    const intakeResults = new Map(
      intakeReceipt.results.map((result) => [result.candidate_key, result]),
    )
    const collectionResults = new Map(
      collectionReceipt.results.map((result) => [result.candidate_key, result]),
    )
    for (const key of candidateKeys) {
      const collected = collectionResults.get(key)
      const intaken = intakeResults.get(key)
      const row = {
        candidate_key: key,
        collection_status: collected?.status || "missing",
        intake_status: intaken?.status || "missing",
        collection_run: collectionRunId,
        intake_run: intakeRunId,
      }
      if (intaken?.status === "source_verified_unreviewed") {
        const selectionRunId = `${runId}-select-${sha256(key).slice(0, 12)}`
        try {
          const { candidate, selected } = selectIntakenSearchCandidate({
            root,
            intakeRunId,
            sourceRunId: collectionRunId,
            candidateKey: key,
            backlogFile,
          })
          const selectionResult = await saveSelection(root, selectionRunId, selected, {
            candidate_key: candidate.key,
            candidate_source_version_id: candidate.article_source_version_id,
            candidate_parse_id: candidate.article_parse_id,
            collection_run: collectionRunId,
            intake_run: intakeRunId,
            selection_basis: "search_candidate_workflow",
          })
          Object.assign(row, {
            selection_status: "selected",
            selection_run: selectionRunId,
            selection: selectionResult,
          })
        } catch (error) {
          Object.assign(row, {
            status: "failed",
            selection_status: "failed",
            selection_run: selectionRunId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      } else if (intaken?.status === "failed") {
        Object.assign(row, { status: "failed", error: intaken.error })
      }
      results.set(key, row)
      persist("running", {
        collection: collection.status,
        intake: intake.status,
        selection: "running",
      })
    }
    const complete = candidateKeys.every((key) => results.get(key)?.selection_status === "selected")
    const final = persist(complete ? "complete" : "partial", {
      collection: collection.status,
      intake: intake.status,
      selection: complete ? "complete" : "partial",
    })
    return {
      status: final.status,
      total: final.total,
      selected: final.selected,
      not_selected: final.not_selected,
      failed: final.failed,
      candidate_published: false,
      receipt: receiptPath,
      collection_run: collectionRunId,
      intake_run: intakeRunId,
    }
  })
}
