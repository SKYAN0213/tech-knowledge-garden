import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { assertURL } from "./fetch.mjs"
import { assertStoredEvidence, parseDocument } from "./parser.mjs"
import { atomicWrite, readJSON, safePath } from "./run-state.mjs"
import { fetchWithPolicy } from "./source-policy.mjs"

// Authenticate the old native checkpoints independently of today's selectors.
// Recovery permits a repaired route/parser, but never edits the failed run or
// promotes its coverage, observation time, approval or publication status.
export function readRecoverySource(root, runId) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(runId || "")) throw Error("Exact recovery source run required")
  const prefix = `runs/${runId}/`
  const state = readJSON(root, prefix + "state.json")
  const basis = readJSON(root, prefix + "collection-basis.json")
  if (fs.existsSync(safePath(root, `locks/run-${runId}.json`)))
    throw Error("Recovery source still has a native run owner")
  const declaredInput = readJSON(root, prefix + "collection-input.json")
  const storedSummary = readJSON(root, prefix + "list-scan.json")
  if (storedSummary === null && fs.existsSync(safePath(root, prefix + "list-scan.json", { materialize: false })))
    throw Error("Recovery source summary is malformed")
  const aggregates = Object.fromEntries(
    ["documents.json", "parses.json", "candidates.json"].map((name) => {
      const value = readJSON(root, prefix + name)
      if (
        (value === null && fs.existsSync(safePath(root, prefix + name, { materialize: false }))) ||
        (value !== null && !Array.isArray(value))
      )
        throw Error("Recovery source aggregate array is malformed: " + name)
      return [name, value]
    }),
  )
  const missingAggregate = Object.values(aggregates).some((value) => value === null)
  if (storedSummary && missingAggregate && storedSummary.status !== "incomplete")
    throw Error("Completed recovery source aggregate is missing")
  // An interruption can happen after the incomplete summary and some arrays
  // were saved. Preserve those bytes and reuse only independently hashed native
  // checkpoints; no missing array or coverage is synthesized.
  const checkpointOnly = !storedSummary || missingAggregate
  const summary = storedSummary || (declaredInput && {
    channel_id: declaredInput.channel_id,
    window: { since: declaredInput.since, until_exclusive: declaredInput.until_exclusive },
    status: "incomplete", reason: "checkpoint_recovery",
  })
  const archive = readJSON(root, prefix + "archive-reuse.json")
  const repair = readJSON(root, prefix + "detail-repair-reuse.json")
  const recovery = readJSON(root, prefix + "source-recovery-reuse.json")
  const base = {
    schema: "research-list-run-input/v2",
    channel_id: summary?.channel_id,
    since: summary?.window?.since,
    until_exclusive: summary?.window?.until_exclusive,
    reuse_listing_run: summary?.listing_reused_from_run || null,
    collection_basis: basis,
  }
  const inputs = [undefined, 0, 1, 2, 3].map((limit) => ({
    ...base,
    ...(limit === undefined ? {} : { policy_recheck_limit: limit }),
    ...(archive ? { reuse_source_run: archive.source_run?.source_run } : {}),
    ...(repair ? { repair_source_run: repair.source_run?.source_run } : {}),
    ...(recovery?.source_runs
      ? { recovery_source_runs: recovery.source_runs.map((reference) => reference.source_run) }
      : recovery ? { recovery_source_run: recovery.source_run?.source_run } : {}),
  }))
  // A stale listing may have been requested but explicitly skipped. In that
  // case the summary correctly has no reused run, while the immutable input
  // still names the attempted run. Reconstruct every other field as usual.
  const skippedListingInputs =
    typeof summary?.listing_reuse_skipped === "string" && summary.listing_reuse_skipped.trim() &&
    !summary.listing_reused_from_run &&
    /^[A-Za-z0-9_-]{1,100}$/.test(declaredInput?.reuse_listing_run || "")
      ? inputs.map((value) => ({ ...value, reuse_listing_run: declaredInput.reuse_listing_run }))
      : []
  const input = checkpointOnly
    ? declaredInput
    : [...inputs, ...skippedListingInputs].find((value) => sha256(JSON.stringify(value)) === state?.input_hash)
  if (
    state?.schema !== "research-run/v1" || state.run_id !== runId || !input ||
    sha256(JSON.stringify(input)) !== state.input_hash ||
    input.schema !== "research-list-run-input/v2" || JSON.stringify(input.collection_basis) !== JSON.stringify(basis) ||
    (declaredInput && JSON.stringify(declaredInput) !== JSON.stringify(input)) ||
    basis?.channel_id !== summary?.channel_id ||
    input.channel_id !== summary?.channel_id || input.since !== summary?.window?.since ||
    input.until_exclusive !== summary?.window?.until_exclusive ||
    !["incomplete", "window_scanned"].includes(summary?.status) ||
    (summary.status === "incomplete" && !summary.reason)
  ) throw Error("Recovery source input, status or window changed")

  const pins = [], captured = new Map(), parseStages = new Map()
  const pin = (file) => {
    const value = readJSON(root, file)
    if (value === null) throw Error("Recovery source evidence is missing: " + file)
    pins.push({ path: file, sha256: sha256(fs.readFileSync(safePath(root, file))) })
    return value
  }
  for (const name of ["state.json", "collection-basis.json", ...(checkpointOnly ? ["collection-input.json"] : ["list-scan.json", "documents.json", "parses.json", "candidates.json"])])
    pin(prefix + name)
  if (checkpointOnly && storedSummary &&
      JSON.stringify(pin(prefix + "list-scan.json")) !== JSON.stringify(storedSummary))
    throw Error("Recovery source summary changed")
  if (checkpointOnly)
    for (const [name, value] of Object.entries(aggregates))
      if (value !== null && JSON.stringify(pin(prefix + name)) !== JSON.stringify(value))
        throw Error("Recovery source aggregate changed: " + name)
  for (const name of ["list-pages.json", "archive-reuse.json", "detail-repair-reuse.json", "source-recovery-reuse.json", ...(!checkpointOnly ? ["collection-input.json"] : [])])
    if (readJSON(root, prefix + name)) pin(prefix + name)
  const addDocument = (d) => {
    if (!["captured", "not_modified"].includes(d?.fetch_status)) return
    assertStoredEvidence(root, [d], [])
    const prior = captured.get(d.original_url)
    if (prior && JSON.stringify(prior) !== JSON.stringify(d))
      throw Error("Recovery source observations conflict for one URL")
    captured.set(d.original_url, d)
  }
  for (const [name, stage] of Object.entries(state.stages || {})) {
    if (summary.status === "incomplete" && ["failed", "waiting_for_storage"].includes(stage.status) &&
        /^[A-Za-z0-9_-]+$/.test(name) && /^[a-f0-9]{64}$/.test(stage.input_hash || "") &&
        Number.isFinite(Date.parse(stage.finished_at)) && stage.error) continue
    if (!/^[A-Za-z0-9_-]+$/.test(name) || stage.status !== "complete" || stage.result_path !== prefix + name + ".json")
      throw Error("Recovery requires settled native checkpoints")
    const value = pin(stage.result_path)
    if (sha256(JSON.stringify(value)) !== stage.result_hash)
      throw Error("Recovery checkpoint hash changed")
    addDocument(value)
    if (/^(?:parse-|listing-parse)/.test(name) && value.schema_version === "source-parse/v1")
      parseStages.set(name, { stage, parsed: value })
  }
  const documents = checkpointOnly ? [...captured.values()] : aggregates["documents.json"],
    parses = checkpointOnly ? [...new Map([...parseStages.values()].map(({ parsed }) => [parsed.parse_id, parsed])).values()] : aggregates["parses.json"]
  if (!Array.isArray(documents) || !Array.isArray(parses)) throw Error("Recovery source arrays required")
  if (documents.length) assertStoredEvidence(root, documents, parses)
  else if (parses.length) throw Error("Recovery parse has no original document")
  if (checkpointOnly) {
    for (const document of aggregates["documents.json"] || [])
      if (JSON.stringify(captured.get(document?.original_url)) !== JSON.stringify(document))
        throw Error("Recovery aggregate document differs from native checkpoints")
    const parsedById = new Map(parses.map((parsed) => [parsed.parse_id, parsed]))
    for (const parsed of aggregates["parses.json"] || [])
      if (JSON.stringify(parsedById.get(parsed?.parse_id)) !== JSON.stringify(parsed))
        throw Error("Recovery aggregate parse differs from native checkpoints")
  }
  documents.forEach(addDocument)
  for (const document of captured.values())
    pins.push({ path: document.body_path, sha256: document.body_sha256 })
  for (const parsed of parses) pin(`parses/${parsed.parse_id}/parse.json`)
  return {
    state, basis, summary, input, documents: [...captured.values()], parseStages,
    reference: { source_run: runId, input_sha256: state.input_hash,
      ...(checkpointOnly ? { incomplete_checkpoints: true, coverage_reused: false } : {}),
      evidence: [...new Map(pins.map((p) => [p.path, p])).values()] },
  }
}

export function createRecoverySourceReuse(root, runId, channel, basis, window, {
  fetchPolicy = fetchWithPolicy, parse = parseDocument, now = Date.now(),
} = {}) {
  const ids = Array.isArray(runId) ? runId : [runId]
  if (!ids.length || ids.length > 21 || new Set(ids).size !== ids.length)
    throw Error("Distinct bounded recovery source runs required")
  const sources = ids.map((id) => readRecoverySource(root, id))
  for (const previous of sources)
    if (previous.summary.channel_id !== channel.channel_id ||
        previous.summary.window?.since !== window.since || previous.summary.window?.until_exclusive !== window.until)
      throw Error("Recovery source must prove the same route and window")
  const available = new Map(), used = new Map(), reusedParses = new Set()
  for (const document of sources.flatMap((source) => source.documents)) {
    if (document.policy_status !== "checked" || document.policy?.allowed !== true) continue
    const observed = Date.parse(document.observed_at)
    if (!Number.isFinite(observed) || observed > now + 60000) throw Error("Invalid recovery observation time")
    // A changed route can stop using an old host; never extend today's allowlist.
    if (![document.original_url, document.final_url].every((url) => channel.allowed_hosts.includes(new URL(url).hostname))) continue
    assertURL(document.original_url, channel.allowed_hosts)
    assertURL(document.final_url, channel.allowed_hosts)
    const prior = available.get(document.original_url)
    if (prior) {
      const previousObserved = Date.parse(prior.observed_at)
      if (observed === previousObserved && prior.source_version_id !== document.source_version_id)
        throw Error("Conflicting recovery source versions share an observation time")
      if (observed <= previousObserved) continue
    }
    available.set(document.original_url, document)
  }
  const fetch = async (r, fetcher, url, options) => {
    assertURL(url, channel.allowed_hosts)
    const document = available.get(url)
    if (!document) return fetchPolicy(r, fetcher, url, options)
    used.set(url, { url, source_version_id: document.source_version_id, observed_at: document.observed_at })
    return document
  }
  fetch.hasStoredSource = (url) => available.has(url)
  const reparse = async (r, document, options) => {
    const inputHash = sha256(JSON.stringify({ document, options }))
    const matchingSource = sources.find((source) =>
      source.basis.implementation?.parser_sha256 === basis.implementation?.parser_sha256 &&
      source.basis.dependencies?.["integrations/research-worker/worker.py"] === basis.dependencies?.["integrations/research-worker/worker.py"] &&
      [...source.parseStages.values()].some(({ stage, parsed }) =>
        stage.input_hash === inputHash && parsed.source_version_id === document.source_version_id &&
        ["extracted", "partial", "blocked"].includes(parsed.status)),
    )
    const cached = matchingSource && [...matchingSource.parseStages.values()].find(({ stage, parsed }) =>
      stage.input_hash === inputHash && parsed.source_version_id === document.source_version_id &&
      ["extracted", "partial", "blocked"].includes(parsed.status))
    if (cached) {
      assertStoredEvidence(root, [document], [cached.parsed])
      reusedParses.add(cached.parsed.parse_id)
      return cached.parsed
    }
    return parse(r, document, options)
  }
  const reference = Array.isArray(runId)
    ? { schema: "research-source-recovery-input-set/v1", source_runs: sources.map((source) => source.reference) }
    : sources[0].reference
  return { reference, available, used, reusedParses, fetchPolicy: fetch, parse: reparse }
}

export function preserveRecoverySourceReuse(root, runId, reuse) {
  const relative = `runs/${runId}/source-recovery-reuse.json`
  const existing = readJSON(root, relative)
  const multi = Array.isArray(reuse.reference.source_runs)
  if (existing && JSON.stringify(multi ? existing.source_runs : existing.source_run) !==
      JSON.stringify(multi ? reuse.reference.source_runs : reuse.reference))
    throw Error("Recovery reuse source changed")
  const sources = new Map((existing?.reused_sources || []).map((d) => [d.url, d]))
  for (const [url, source] of sources) {
    const original = reuse.available.get(url)
    if (original?.source_version_id !== source.source_version_id || original.observed_at !== source.observed_at)
      throw Error("Recovery reused observation changed")
  }
  for (const [url, source] of reuse.used) sources.set(url, source)
  const receipt = {
    schema: multi ? "research-source-recovery-reuse/v2" : "research-source-recovery-reuse/v1",
    ...(multi ? { source_runs: reuse.reference.source_runs } : { source_run: reuse.reference }),
    reused_sources: [...sources.values()], reused_parse_ids: [...new Set([...(existing?.reused_parse_ids || []), ...reuse.reusedParses])].sort(),
    observation_times_preserved: true, coverage_reused: false,
    candidate_approved: false, candidate_published: false,
  }
  atomicWrite(root, relative, receipt)
  return { path: relative, sha256: sha256(fs.readFileSync(safePath(root, relative))) }
}
