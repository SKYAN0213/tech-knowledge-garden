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
  const dailyScope = recovery?.source_run?.daily_article_reuse
  let dailyArticleReuseVerified = false
  if (dailyScope && storedSummary) {
    const pinnedJSON = (reference) => {
      if (!reference?.path || !/^[a-f0-9]{64}$/.test(reference.sha256 || ""))
        throw Error("Daily article reuse evidence is missing")
      const bytes = fs.readFileSync(safePath(root, reference.path))
      if (sha256(bytes) !== reference.sha256) throw Error("Daily article reuse evidence changed")
      return JSON.parse(bytes)
    }
    const recoveryPath = prefix + "source-recovery-reuse.json"
    if (typeof input.channel_id !== "string" || typeof input.since !== "string" ||
        typeof input.until_exclusive !== "string") throw Error("Daily article reuse window is missing")
    const suffix = `_${input.channel_id}_${input.since.replaceAll("-", "")}_${input.until_exclusive.replaceAll("-", "")}_a`
    if (dailyScope.schema !== "research-daily-article-reuse/v1" ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(dailyScope.daily_run || "") ||
        dailyScope.target_run !== runId || dailyScope.channel_id !== input.channel_id ||
        !runId.startsWith(dailyScope.daily_run + suffix) ||
        !/^[1-9][0-9]*$/.test(runId.slice((dailyScope.daily_run + suffix).length)) ||
        dailyScope.source_run !== input.recovery_source_run ||
        dailyScope.target_window?.since !== input.since ||
        dailyScope.target_window?.until_exclusive !== input.until_exclusive ||
        dailyScope.listing_reused !== false || dailyScope.coverage_reused !== false ||
        dailyScope.max_age_ms !== 3600000 ||
        dailyScope.plan?.path !== `daily/runs/${dailyScope.daily_run}/plan.json` ||
        dailyScope.source_receipt?.path !== `daily/runs/${dailyScope.daily_run}/receipts/${dailyScope.source_run}.json` ||
        summary.source_recovery?.source_run !== dailyScope.source_run ||
        summary.source_recovery?.coverage_reused !== false ||
        summary.source_recovery?.reference?.path !== recoveryPath ||
        summary.source_recovery?.reference?.sha256 !== sha256(fs.readFileSync(safePath(root, recoveryPath))))
      throw Error("Daily article reuse binding changed")
    const plan = pinnedJSON(dailyScope.plan), receipt = pinnedJSON(dailyScope.source_receipt)
    const originalSummary = fs.readFileSync(safePath(root, `runs/${dailyScope.source_run}/list-scan.json`))
    const sourceSummary = JSON.parse(originalSummary)
    const end = Date.parse(`${input.until_exclusive}T00:00:00+09:00`)
    const started = Date.parse(state.started_at)
    const hasWindow = (since, until) => Array.isArray(plan.windows) && plan.windows.some((row) =>
      row.channel_id === input.channel_id && row.since === since && row.until_exclusive === until)
    if (plan.run_id !== dailyScope.daily_run || receipt.schema !== "research-daily-receipt/v2" ||
        receipt.daily_run !== dailyScope.daily_run ||
        receipt.attempt_id !== dailyScope.source_run || receipt.channel_id !== input.channel_id ||
        receipt.since !== sourceSummary.window?.since || receipt.until_exclusive !== sourceSummary.window?.until_exclusive ||
        (receipt.since === input.since && receipt.until_exclusive === input.until_exclusive) ||
        !["window_scanned", "incomplete"].includes(receipt.status) || receipt.status !== sourceSummary.status ||
        receipt.scan_evidence?.list_scan_run !== dailyScope.source_run ||
        receipt.scan_evidence?.summary_sha256 !== sha256(originalSummary) ||
        !hasWindow(input.since, input.until_exclusive) || !hasWindow(receipt.since, receipt.until_exclusive) ||
        !Number.isFinite(end) || !Number.isFinite(started) || started < end)
      throw Error("Daily article reuse plan or observation changed")
    const originals = new Map((sourceSummary.date_resolutions || []).map((row) => [row.url, row.source_version_id]))
    if (!Array.isArray(recovery.reused_sources) || recovery.reused_sources.some((row) => {
      const observed = Date.parse(row.observed_at)
      return originals.get(row.url) !== row.source_version_id || !Number.isFinite(observed) ||
        observed < end || observed > started + 60000 || started - observed > dailyScope.max_age_ms
    })) throw Error("Daily article reuse observation changed")
    dailyArticleReuseVerified = true
  }
  return {
    state, basis, summary, input, documents: [...captured.values()], parseStages,
    ...(dailyArticleReuseVerified ? { daily_article_reuse_verified: true } : {}),
    reference: { source_run: runId, input_sha256: state.input_hash,
      ...(checkpointOnly ? { incomplete_checkpoints: true, coverage_reused: false } : {}),
      evidence: [...new Map(pins.map((p) => [p.path, p])).values()] },
  }
}

// An ended-window refresh must observe its listings after the window closed.
// Do not certify unseen days with a reused listing or cached article response.
export function recoveryListingObservedAt(source, scan) {
  const listing = [
    ...(scan.indexDocuments || []),
    ...(scan.documents || []).filter((document) =>
      document.source_version_id === scan.summary.listing_source_version_id),
  ]
  if (!listing.length || listing.some((document) => !Number.isFinite(Date.parse(document.observed_at))))
    throw Error("Recovered scan has no valid listing observation")
  return Math.min(...listing.map((document) => Date.parse(document.observed_at)))
}

export function verifyFreshRecoveryListing(source, scan, target) {
  const end = Date.parse(`${target.until_exclusive}T00:00:00+09:00`)
  if (!Number.isFinite(end) || Date.parse(source.state.started_at) < end ||
      (source.input.recovery_source_run && !source.daily_article_reuse_verified) || source.input.recovery_source_runs ||
      source.input.reuse_listing_run || source.input.reuse_source_run || source.input.repair_source_run ||
      source.summary.listing_reused_from_run)
    throw Error("A finished-window refresh requires a new non-reused listing scan")
  if (recoveryListingObservedAt(source, scan) < end)
    throw Error("A finished-window refresh requires newly observed listing evidence")
  return true
}

// A daily plan may revisit the same article while covering different historical
// windows. Only the article bytes can be reused; each target still fetches and
// verifies its own listing and proves its own coverage.
function dailyArticleReuseScope(root, previous, channel, basis, window, targetRun, now) {
  const suffix = `_${channel.channel_id}_${window.since.replaceAll("-", "")}_${window.until.replaceAll("-", "")}_a`
  const index = typeof targetRun === "string" ? targetRun.lastIndexOf(suffix) : -1
  if (index < 1 || !/^[1-9][0-9]*$/.test(targetRun.slice(index + suffix.length)))
    throw Error("Daily article reuse requires a bound target attempt")
  const dailyRun = targetRun.slice(0, index)
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(dailyRun)) throw Error("Invalid daily reuse run")
  const planPath = `daily/runs/${dailyRun}/plan.json`
  const receiptPath = `daily/runs/${dailyRun}/receipts/${previous.state.run_id}.json`
  const planBytes = fs.readFileSync(safePath(root, planPath))
  const receiptBytes = fs.readFileSync(safePath(root, receiptPath))
  const plan = JSON.parse(planBytes), receipt = JSON.parse(receiptBytes)
  const sourceWindow = previous.summary.window
  const hasWindow = (since, until) => Array.isArray(plan.windows) && plan.windows.some((row) =>
    row.channel_id === channel.channel_id && row.since === since && row.until_exclusive === until)
  const summaryPath = `runs/${previous.state.run_id}/list-scan.json`
  if (plan.run_id !== dailyRun || receipt.schema !== "research-daily-receipt/v2" ||
      receipt.daily_run !== dailyRun || receipt.attempt_id !== previous.state.run_id ||
      receipt.channel_id !== channel.channel_id || receipt.since !== sourceWindow?.since ||
      receipt.until_exclusive !== sourceWindow?.until_exclusive ||
      !["window_scanned", "incomplete"].includes(receipt.status) ||
      receipt.status !== previous.summary.status ||
      receipt.scan_evidence?.list_scan_run !== previous.state.run_id ||
      receipt.scan_evidence?.summary_sha256 !== sha256(fs.readFileSync(safePath(root, summaryPath))) ||
      !hasWindow(receipt.since, receipt.until_exclusive) || !hasWindow(window.since, window.until))
    throw Error("Daily article reuse requires a pinned receipt and plan")
  if (JSON.stringify(previous.basis) !== JSON.stringify(basis))
    throw Error("Daily article reuse requires an unchanged collection basis")
  const end = Date.parse(`${window.until}T00:00:00+09:00`)
  if (!Number.isFinite(end) || now < end)
    throw Error("Daily article reuse requires a closed target window")
  return {
    schema: "research-daily-article-reuse/v1", daily_run: dailyRun,
    target_run: targetRun, channel_id: channel.channel_id,
    target_window: { since: window.since, until_exclusive: window.until },
    source_run: previous.state.run_id,
    plan: { path: planPath, sha256: sha256(planBytes) },
    source_receipt: { path: receiptPath, sha256: sha256(receiptBytes) },
    listing_reused: false, coverage_reused: false, max_age_ms: 3600000,
  }
}

export function createRecoverySourceReuse(root, runId, channel, basis, window, {
  fetchPolicy = fetchWithPolicy, parse = parseDocument, now = Date.now(), dailyTargetRun = null,
} = {}) {
  if (!Number.isFinite(now)) throw Error("Invalid recovery observation time")
  const ids = Array.isArray(runId) ? runId : [runId]
  if (!ids.length || ids.length > 21 || new Set(ids).size !== ids.length)
    throw Error("Distinct bounded recovery source runs required")
  const sources = ids.map((id) => readRecoverySource(root, id))
  let dailyScope = null
  for (const previous of sources) {
    if (previous.summary.channel_id !== channel.channel_id)
      throw Error("Recovery source must prove the same route and window")
    if (previous.summary.window?.since !== window.since || previous.summary.window?.until_exclusive !== window.until) {
      if (!dailyTargetRun || sources.length !== 1)
        throw Error("Recovery source must prove the same route and window")
      dailyScope = dailyArticleReuseScope(root, previous, channel, basis, window, dailyTargetRun, now)
    }
  }
  const listingURLs = dailyScope ? new Set([
    channel.url, sources[0].summary.listing_url,
    ...(sources[0].summary.pages || []).map((row) => row.url),
  ].filter(Boolean)) : null
  const template = dailyScope && channel.listing_profile?.fallback_archive?.url_template
  const listingPattern = typeof template === "string" && template.includes("{page}")
    ? new RegExp("^" + template.split("{page}")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[0-9]+") + "$") : null
  const dailyArticles = dailyScope ? new Map((sources[0].summary.date_resolutions || [])
    .filter((row) => !listingURLs.has(row.url) && !listingPattern?.test(row.url))
    .map((row) => [row.url, row.source_version_id])) : null
  const windowEnd = dailyScope ? Date.parse(`${window.until}T00:00:00+09:00`) : null
  const available = new Map(), used = new Map(), reusedParses = new Set()
  for (const document of sources.flatMap((source) => source.documents)) {
    if (document.policy_status !== "checked" || document.policy?.allowed !== true) continue
    const observed = Date.parse(document.observed_at)
    if (!Number.isFinite(observed) || observed > now + 60000) throw Error("Invalid recovery observation time")
    if (dailyScope && (dailyArticles.get(document.original_url) !== document.source_version_id ||
        observed < windowEnd || now - observed > dailyScope.max_age_ms)) continue
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
    : { ...sources[0].reference, ...(dailyScope ? { daily_article_reuse: dailyScope } : {}) }
  const dailyParseStages = dailyScope ? new Map([...sources[0].parseStages.values()].map(({ stage, parsed }) =>
    [`${stage.input_hash}:${parsed.source_version_id}`, parsed.parse_id])) : null
  return { reference, available, used, reusedParses, fetchPolicy: fetch, parse: reparse,
    ...(dailyScope ? { dailyParseStages } : {}) }
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
  // A resumed RunState may return completed checkpoints without invoking the
  // reuse callbacks again. Preserve their exact authenticated provenance too.
  if (reuse.reference.daily_article_reuse) {
    const prefix = `runs/${runId}/`, state = readJSON(root, prefix + "state.json")
    for (const [name, stage] of Object.entries(state?.stages || {})) {
      if (stage.status !== "complete" || !/^(?:detail-|parse-)/.test(name)) continue
      if (stage.result_path !== prefix + name + ".json") throw Error("Daily reuse checkpoint path changed")
      const value = readJSON(root, stage.result_path)
      if (!value || sha256(JSON.stringify(value)) !== stage.result_hash)
        throw Error("Daily reuse checkpoint changed")
      if (name.startsWith("detail-")) {
        const original = reuse.available.get(value.original_url)
        if (original && JSON.stringify(original) === JSON.stringify(value))
          sources.set(value.original_url, { url: value.original_url,
            source_version_id: value.source_version_id, observed_at: value.observed_at })
      } else if (reuse.dailyParseStages?.get(`${stage.input_hash}:${value.source_version_id}`) === value.parse_id)
        reuse.reusedParses.add(value.parse_id)
    }
  }
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
