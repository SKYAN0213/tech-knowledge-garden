import fs from "node:fs"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { performance } from "node:perf_hooks"
import { sha256 } from "./contracts.mjs"
import { writeDraft } from "./editor.mjs"
import { loadBoundDraftCheckpoint } from "./draft-checkpoint.mjs"
import { loadEvaluationSourceScope } from "./evaluation.mjs"
import { validateEvidence } from "./claims.mjs"
import { inspectReaderQuality } from "./reader-quality.mjs"
import { prepareEditorialDraft } from "./editorial-authoring.mjs"
import { loadHistoricalApproval } from "./preview.mjs"
import { validateLocalOllamaURL } from "./ollama.mjs"
import { readJSON, safePath } from "./run-state.mjs"

function startMeasurement() {
  return {
    wall: performance.now(),
    cpu: process.cpuUsage(),
    memory: process.memoryUsage(),
    resources: process.resourceUsage(),
  }
}
function finishMeasurement(before, samples = []) {
  const memory = process.memoryUsage(),
    resources = process.resourceUsage(),
    cpu = process.cpuUsage(before.cpu)
  return {
    wall_ms: performance.now() - before.wall,
    cpu_user_ms: cpu.user / 1000,
    cpu_system_ms: cpu.system / 1000,
    heap_used_before: before.memory.heapUsed,
    heap_used_after: memory.heapUsed,
    heap_used_delta: memory.heapUsed - before.memory.heapUsed,
    rss_before: before.memory.rss,
    rss_after: memory.rss,
    observed_rss_max: Math.max(
      before.memory.rss,
      memory.rss,
      ...samples.map((sample) => sample.rss),
    ),
    process_max_rss_kib_before: before.resources.maxRSS,
    process_max_rss_kib_after: resources.maxRSS,
  }
}

// Exercise the real writer's source/claim validation and request preparation.
// Stop before provider dispatch: this produces neither a draft nor a successful
// model response. Request counts here are measured preparation, not inference.
async function capturePreparation(claims, options) {
  const stop = new Error("Evaluation stops before model dispatch"),
    requests = [],
    samples = []
  const before = startMeasurement()
  const provider = {
    structured: async (request) => {
      const bytes = Buffer.from(JSON.stringify(request))
      requests.push({
        sha256: sha256(bytes),
        bytes: bytes.length,
        claim_ids: claims.map((c) => c.claim_id),
      })
      samples.push(process.memoryUsage())
      throw stop
    },
  }
  try {
    await writeDraft(provider, claims, options)
    throw Error("Cost measurement unexpectedly produced a draft")
  } catch (error) {
    if (error !== stop) throw error
  }
  return { ...finishMeasurement(before, samples), requests }
}

export async function measureWriterPreparation(claims, documents, parses, options = {}) {
  if (
    !Array.isArray(claims) ||
    !claims.length ||
    !Array.isArray(documents) ||
    !documents.length ||
    !Array.isArray(parses) ||
    !parses.length ||
    claims.some((c) => c.review?.status !== "verified" || !c.evidence?.length)
  )
    throw Error("Fixed verified claims and stored sources required")
  const groups = documents.map((document) => ({
    documents: [document],
    parses: parses.filter((p) => p.source_version_id === document.source_version_id),
    claims: claims.filter((c) =>
      c.evidence.every((e) => e.source_version_id === document.source_version_id),
    ),
  }))
  const originalIds = claims.map((c) => c.claim_id).sort(),
    groupedIds = groups.flatMap((g) => g.claims.map((c) => c.claim_id)).sort()
  if (
    groups.some((g) => !g.claims.length || !g.parses.length) ||
    new Set(originalIds).size !== originalIds.length ||
    JSON.stringify(originalIds) !== JSON.stringify(groupedIds)
  )
    throw Error(
      "Per-source baseline must preserve the exact fixed claim union without cross-source duplication",
    )
  const perSource = []
  for (const group of groups)
    perSource.push(
      await capturePreparation(group.claims, {
        ...options,
        documents: group.documents,
        parses: group.parses,
      }),
    )
  const sourceFirst = await capturePreparation(claims, { ...options, documents, parses })
  const aggregate = (measurements) => ({
    writer_preparations: measurements.reduce((sum, m) => sum + m.requests.length, 0),
    request_bytes: measurements.reduce(
      (sum, m) => sum + m.requests.reduce((n, r) => n + r.bytes, 0),
      0,
    ),
    wall_ms: measurements.reduce((sum, m) => sum + m.wall_ms, 0),
    cpu_user_ms: measurements.reduce((sum, m) => sum + m.cpu_user_ms, 0),
    cpu_system_ms: measurements.reduce((sum, m) => sum + m.cpu_system_ms, 0),
    observed_rss_max: Math.max(...measurements.map((m) => m.observed_rss_max)),
  })
  return {
    schema: "evaluation-writer-preparation-cost/v1",
    measurement: "native-request-preparation-before-provider-dispatch",
    fixed_input: {
      claims_sha256: sha256(JSON.stringify(claims)),
      documents_sha256: sha256(JSON.stringify(documents)),
      parses_sha256: sha256(JSON.stringify(parses)),
      claims: claims.length,
      sources: documents.length,
      exact_claim_union: true,
    },
    per_source: { aggregate: aggregate(perSource), measurements: perSource },
    source_first: { aggregate: aggregate([sourceFirst]), measurements: [sourceFirst] },
    expected_only: {
      per_source_model_calls: groups.length,
      source_first_model_calls: 1,
      possible_extra_articles_for_one_event: Math.max(0, groups.length - 1),
      observed_duplicate_articles: null,
    },
    limitations: [
      "One sequential preparation measurement per path; order and allocator effects are not isolated.",
      "RSS values are process samples and process lifetime high-water marks, not model or GPU memory.",
      "Legacy inference latency, inference memory and duplicate article production were not measured.",
    ],
    model_calls: 0,
    generated_drafts: 0,
    source_requests: 0,
    candidate_published: false,
  }
}

export async function measureFrozenWriterCost(root, writerRun) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(writerRun || ""))
    throw Error("Exact frozen writer run required")
  const base = `runs/${writerRun}/`,
    { documents, parses } = loadEvaluationSourceScope(root, writerRun)
  const claims = readJSON(root, base + "reviewed-claims.json")?.claims
  const input = readJSON(root, base + "model-draft-input.json")
  if (!input) throw Error("Frozen model draft input required for historical comparison")
  const options = {
    model: input.model,
    think: input.think,
    provisional: input.provisional,
    documents,
    parses,
  }
  if (input.deep_context_sha256 !== sha256(JSON.stringify(null)))
    throw Error("Use a representative ordinary article input")
  const preparation = await measureWriterPreparation(claims, documents, parses, options)
  const before = startMeasurement()
  let reuse
  try {
    const result = loadBoundDraftCheckpoint(root, writerRun, claims, options)
    reuse = {
      ...finishMeasurement(before),
      reused: true,
      input_sha256: result.checkpoint.input_sha256,
      output_sha256: result.checkpoint.output_sha256,
      model_calls: 0,
    }
  } catch (error) {
    reuse = { ...finishMeasurement(before), reused: false, reason: error.message, model_calls: 0 }
  }
  const ledger = readJSON(root, base + "model-policy/article_write/budget.json")
  return {
    ...preparation,
    writer_run: writerRun,
    measured_at: new Date().toISOString(),
    reuse,
    historical_source_first: {
      attempts: (ledger?.attempts || []).map((a) => ({
        status: a.status,
        started_at: a.started_at,
        finished_at: a.finished_at || null,
        provenance: a.result?.provenance || null,
      })),
    },
    input_files: Object.fromEntries(
      [
        "documents.json",
        "parses.json",
        "reviewed-claims.json",
        "model-draft-input.json",
        "model-draft-checkpoint.json",
        "model-policy/article_write/budget.json",
      ].map((name) => [base + name, sha256(fs.readFileSync(safePath(root, base + name)))]),
    ),
    f4_model_comparison_complete: false,
  }
}

const runCommand = promisify(execFile)

// ps reports KiB on the supported hosts. Sum of process RSS can count shared
// pages more than once; it is not physical unified-memory or GPU allocation.
export function modelProcessResourceTree(stdout, listenerPids) {
  if (
    !Array.isArray(listenerPids) ||
    !listenerPids.length ||
    listenerPids.length > 16 ||
    listenerPids.some((pid) => !Number.isSafeInteger(pid) || pid <= 0)
  )
    throw Error("Exact listener process IDs required")
  const lines = stdout.trim().split("\n")
  if (lines.length > 4096) throw Error("Process resource snapshot exceeds bound")
  const rows = lines.map((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line)
    if (!match) throw Error("Invalid ps resource row")
    const pid = Number(match[1]),
      ppid = Number(match[2]),
      rss_kib = Number(match[3])
    if (![pid, ppid, rss_kib, rss_kib * 1024].every(Number.isSafeInteger) || pid <= 0)
      throw Error("Invalid ps resource value")
    return { pid, ppid, rss_kib, rss_bytes: rss_kib * 1024, command: match[4] }
  })
  if (new Set(rows.map((row) => row.pid)).size !== rows.length)
    throw Error("Duplicate process resource identity")
  if (listenerPids.some((pid) => !rows.some((row) => row.pid === pid)))
    throw Error("Listener process disappeared before resource observation")
  const selected = new Set(listenerPids)
  let changed = true
  while (changed) {
    changed = false
    for (const row of rows)
      if (selected.has(row.ppid) && !selected.has(row.pid)) {
        selected.add(row.pid)
        changed = true
      }
  }
  const processes = rows
    .filter((row) => selected.has(row.pid))
    .map((row) => ({
      ...row,
      scope: listenerPids.includes(row.pid) ? "server" : "descendant",
    }))
  return {
    status: "observed",
    listener_pids: listenerPids,
    processes,
    server_rss_bytes: processes
      .filter((row) => row.scope === "server")
      .reduce((n, row) => n + row.rss_bytes, 0),
    descendant_rss_bytes: processes
      .filter((row) => row.scope === "descendant")
      .reduce((n, row) => n + row.rss_bytes, 0),
    memory_scope: "Process RSS; shared pages may be counted by multiple processes",
  }
}

export function loadedModelResourceSnapshot(response, model, expectedDigest) {
  if (!Array.isArray(response?.models) || response.models.length > 64)
    throw Error("Bounded native running-model response required")
  const matching = response.models.filter((row) => row.name === model || row.model === model)
  if (matching.length > 1) throw Error("Ambiguous loaded model identity")
  const row = matching[0]
  if (row && expectedDigest && row.digest !== expectedDigest)
    throw Error("Loaded model digest changed")
  for (const key of ["size", "size_vram", "context_length"])
    if (row?.[key] !== undefined && (!Number.isSafeInteger(row[key]) || row[key] < 0))
      throw Error("Invalid native model resource value: " + key)
  return {
    status: "observed",
    endpoint: "/api/ps",
    target_model: model,
    target_loaded: Boolean(row),
    other_loaded_models: response.models.length - matching.length,
    response_sha256: sha256(JSON.stringify(response)),
    target: row ? structuredClone(row) : null,
    size_bytes: row?.size ?? null,
    size_vram_bytes: row?.size_vram ?? null,
    context_length: row?.context_length ?? null,
    memory_scope: "Native API reported size/size_vram; not physical GPU peak memory",
  }
}

export async function readLocalModelResourceSnapshot(
  provider,
  { model, expected_digest, timeout_ms = 5000 } = {},
) {
  if (
    !model ||
    typeof provider?.json !== "function" ||
    !Number.isInteger(timeout_ms) ||
    timeout_ms < 1 ||
    timeout_ms > 20000
  )
    throw Error("Local model resource provider and bounded timeout required")
  const endpoint = validateLocalOllamaURL(provider.url)
  const parsed = new URL(endpoint)
  const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80))
  const started = performance.now(),
    observed_at = new Date().toISOString()
  let api, processes
  try {
    api = loadedModelResourceSnapshot(
      await provider.json("/api/ps", undefined, { timeout_ms }),
      model,
      expected_digest,
    )
  } catch (error) {
    api = {
      status: "unavailable",
      endpoint: "/api/ps",
      error: error.message,
      target_loaded: null,
      size_bytes: null,
      size_vram_bytes: null,
    }
  }
  try {
    if (!["darwin", "linux"].includes(process.platform))
      throw Error("Process resource observation unsupported on this platform")
    const commandOptions = { timeout: Math.min(timeout_ms, 2000), maxBuffer: 1048576 }
    const listeners = await runCommand(
      "lsof",
      ["-nP", "-iTCP:" + port, "-sTCP:LISTEN", "-Fpc"],
      commandOptions,
    )
    const listenerPids = [
      ...new Set([...listeners.stdout.matchAll(/^p(\d+)$/gm)].map((match) => Number(match[1]))),
    ]
    const snapshot = await runCommand("ps", ["-Ao", "pid=,ppid=,rss=,comm="], commandOptions)
    processes = modelProcessResourceTree(snapshot.stdout, listenerPids)
  } catch (error) {
    processes = {
      status: "unavailable",
      error: error.message,
      processes: [],
      server_rss_bytes: null,
      descendant_rss_bytes: null,
    }
  }
  const attributable =
    api.target_loaded === true &&
    api.other_loaded_models === 0 &&
    processes.status === "observed" &&
    processes.processes.some((row) => row.scope === "descendant")
  return {
    observed_at,
    wall_ms: performance.now() - started,
    client: process.memoryUsage(),
    api,
    processes,
    target_model_process_rss_bytes: attributable ? processes.descendant_rss_bytes : null,
    process_attribution: attributable
      ? "Descendants of the local server while only the target model is reported loaded"
      : "No exact per-model process attribution; server and descendants reported separately",
  }
}

export async function observeLocalModelResources(provider, options, operation) {
  const { interval_ms = 1000, max_samples = 600 } = options || {}
  if (
    typeof operation !== "function" ||
    !Number.isInteger(interval_ms) ||
    interval_ms < 100 ||
    interval_ms > 60000 ||
    !Number.isInteger(max_samples) ||
    max_samples < 1 ||
    max_samples > 3600
  )
    throw Error("Bounded model resource observation required")
  const before = startMeasurement(),
    started_at = new Date().toISOString(),
    samples = []
  let timer,
    pending,
    stopped = false,
    sample_limit_reached = false
  const sample = async () => {
    if (samples.length >= max_samples) {
      sample_limit_reached = true
      return
    }
    samples.push(await readLocalModelResourceSnapshot(provider, options))
  }
  const schedule = () => {
    if (stopped || samples.length >= max_samples) return
    timer = setTimeout(() => {
      pending = sample().finally(() => {
        pending = null
        schedule()
      })
    }, interval_ms)
  }
  await sample()
  schedule()
  let result, failure
  try {
    result = await operation()
  } catch (error) {
    failure = error
  } finally {
    stopped = true
    clearTimeout(timer)
    if (pending) await pending
    await sample()
  }
  const max = (values) =>
    values.filter(Number.isFinite).length ? Math.max(...values.filter(Number.isFinite)) : null
  const resources = {
    schema: "evaluation-model-resource-observation/v1",
    started_at,
    finished_at: new Date().toISOString(),
    interval_ms,
    max_samples,
    sample_limit_reached,
    operation_status: failure ? "failed" : "complete",
    samples,
    client: finishMeasurement(
      before,
      samples.map((sample) => sample.client),
    ),
    observed: {
      client_rss_bytes_max: max(samples.map((sample) => sample.client.rss)),
      server_rss_bytes_max: max(samples.map((sample) => sample.processes.server_rss_bytes)),
      descendant_rss_bytes_max: max(samples.map((sample) => sample.processes.descendant_rss_bytes)),
      target_model_process_rss_bytes_max: max(
        samples.map((sample) => sample.target_model_process_rss_bytes),
      ),
      api_size_bytes_max: max(samples.map((sample) => sample.api.size_bytes)),
      api_size_vram_bytes_max: max(samples.map((sample) => sample.api.size_vram_bytes)),
      loaded_samples: samples.filter((sample) => sample.api.target_loaded === true).length,
      api_unavailable_samples: samples.filter((sample) => sample.api.status !== "observed").length,
      process_unavailable_samples: samples.filter(
        (sample) => sample.processes.status !== "observed",
      ).length,
    },
    limitations: [
      "Sampled maxima are observations, not a guarantee of the physical peak.",
      "Mac unified memory, process RSS and API size_vram overlap and must not be added.",
      "A sole loaded model permits server-descendant attribution, not isolation of model weights from runtime overhead.",
      "Observation commands and API requests add overhead included in client measurements.",
    ],
  }
  if (failure) {
    failure.resource_observation = resources
    throw failure
  }
  return { result, resources }
}

// Compare an immutable wire request with independently recorded API samples.
// API agreement is an observation, never proof that the entire window served.
export function inspectModelContextObservation(record, resources) {
  const request = record.model_artifacts?.request
  const requested = request?.options?.num_ctx
  if (
    !Number.isInteger(requested) ||
    requested < 4096 ||
    requested > 32768 ||
    request.model !== record.provenance?.model ||
    requested !== record.provenance.num_ctx ||
    record.model_artifacts.request_sha256 !== sha256(JSON.stringify(request)) ||
    resources?.schema !== "evaluation-model-resource-observation/v1" ||
    !Array.isArray(resources.samples) ||
    resources.samples.length > 3600
  )
    throw Error("Exact native request and bounded resource samples required")
  const observations = []
  for (const [index, sample] of resources.samples.entries()) {
    const api = sample.api
    if (api?.status !== "observed" || api.target_loaded !== true) continue
    if (
      api.target_model !== request.model ||
      api.target?.digest !== record.provenance.digest ||
      !record.provenance.digest
    )
      throw Error("Context observation model identity changed")
    if (api.context_length == null) continue
    if (!Number.isSafeInteger(api.context_length) || api.context_length <= 0)
      throw Error("Invalid observed model context")
    observations.push({
      sample_index: index,
      context_length: api.context_length,
      api_response_sha256: api.response_sha256,
    })
  }
  const contexts = [...new Set(observations.map((sample) => sample.context_length))]
  const mismatch = contexts.some((context) => context !== requested)
  return {
    schema: "evaluation-model-context-observation/v1",
    request_sha256: record.model_artifacts.request_sha256,
    resources_sha256: sha256(JSON.stringify(resources)),
    model: request.model,
    model_digest: record.provenance.digest,
    requested_num_ctx: requested,
    observed_context_lengths: contexts,
    observations,
    status: mismatch ? "mismatch" : contexts.length ? "observed_match" : "unobserved",
    full_context_window_verified: false,
    adapter_request_preserved: true,
    model_calls: 0,
    limitation:
      "API context_length describes a reported loaded model; it does not verify the request's entire usable context window.",
  }
}

export function inspectEvaluationWriterQuality(root, run, selectionFile, caseId) {
  if (
    !/^[A-Za-z0-9_-]{1,100}$/.test(run || "") ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(caseId || "") ||
    typeof selectionFile !== "string" ||
    path.isAbsolute(selectionFile)
  )
    throw Error("Exact development case, writer run and root-relative selection required")
  const selectionBytes = fs.readFileSync(safePath(root, selectionFile))
  const selection = JSON.parse(selectionBytes),
    entry = selection.cases?.find((c) => c.case_id === caseId)
  if (
    selection.schema !== "evaluation-source-review-selection/v1" ||
    entry?.split !== "development"
  )
    throw Error("Writer candidate inspection is limited to explicit development cases")
  const source = loadEvaluationSourceScope(root, entry.source_run, entry.source_scope)
  const reviewed = readJSON(root, "runs/" + entry.source_run + "/reviewed-claims.json")
  const checkpoint = readJSON(root, "runs/" + run + "/model-draft-checkpoint.json")
  const input = readJSON(root, "runs/" + run + "/model-draft-input.json")
  if (!checkpoint && !input)
    return inspectEditorialCandidate(
      root,
      run,
      selectionFile,
      caseId,
      entry,
      source,
      selectionBytes,
    )
  if (!Array.isArray(reviewed?.claims) || !checkpoint || !input)
    throw Error("Source-reviewed claims and native writer checkpoint required")
  const outputBytes = fs.readFileSync(safePath(root, checkpoint.output_path))
  if (sha256(outputBytes) !== checkpoint.output_sha256) throw Error("Native writer output changed")
  const record = JSON.parse(outputBytes)
  const claims = reviewed.claims.filter((claim) => record.claim_ids.includes(claim.claim_id))
  const versions = new Set(
    claims.flatMap((claim) => claim.evidence.map((e) => e.source_version_id)),
  )
  const documents = source.documents.filter((document) => versions.has(document.source_version_id))
  const parses = source.parses.filter((parse) => versions.has(parse.source_version_id))
  const native = loadBoundDraftCheckpoint(root, run, claims, {
    model: input.model,
    think: input.think,
    provisional: input.provisional,
    deepContext: record.deep_context || null,
    documents,
    parses,
  })
  const sourceChecks = claims.map((claim) => ({
    claim_id: claim.claim_id,
    stored_review: {
      status: claim.review?.status ?? "unrecorded",
      reviewed_at: claim.review?.reviewed_at ?? null,
      reviewer: claim.review?.reviewer ?? null,
      claim_sha256: claim.review?.claim_sha256 ?? null,
      source_parses_sha256: claim.review?.source_parses_sha256 ?? null,
    },
    // A structural recheck is deliberately unreviewed. It neither replaces the
    // stored fact review nor supplies an independent semantic quality judgment.
    structural_check: validateEvidence(claim, parses),
  }))
  const used = new Set(
    [
      ...record.draft.lead,
      ...record.draft.explanations.flatMap((e) => e.paragraphs),
      ...(record.draft.analysis ? [record.draft.analysis] : []),
    ].flatMap((paragraph) => paragraph.claim_ids),
  )
  const readerQuality = inspectReaderQuality(record, claims)
  const resources = readJSON(root, "runs/" + run + "/evaluation-cost/resources.json")
  return {
    schema: "evaluation-writer-candidate-quality/v2",
    case_id: caseId,
    case_split: "development",
    writer_run: run,
    source_run: entry.source_run,
    selection_file: selectionFile,
    selection_sha256: sha256(selectionBytes),
    checkpoint: native.checkpoint,
    source_documents_sha256: input.documents_sha256,
    source_parses_sha256: input.parses_sha256,
    claims_sha256: input.claims_sha256,
    source_checks: sourceChecks,
    draft_problems: record.problems,
    reader_quality: readerQuality,
    ...(resources ? { model_context: inspectModelContextObservation(record, resources) } : {}),
    native_authoring_blocked: record.problems.length > 0 || readerQuality.blocked,
    supplied_claims: claims.length,
    referenced_claim_ids: [...used],
    unknown_referenced_claim_ids: [...used].filter((id) => !claims.some((c) => c.claim_id === id)),
    unreferenced_supplied_claim_ids: claims
      .filter((c) => !used.has(c.claim_id))
      .map((c) => c.claim_id),
    review_kind: "automated_structural_candidate",
    semantic_review_status: "explicit_source_review_required",
    independent_human_review: false,
    independent_gold: false,
    public_approved: false,
    model_provenance: record.provenance,
    new_model_calls: 0,
  }
}

// Direct editorial authoring has its own native approval, not a model checkpoint
// or extraction trial. Bind only explicit development inputs and keep it out of
// independent gold/model-quality totals.
function inspectEditorialCandidate(
  root,
  run,
  selectionFile,
  caseId,
  entry,
  source,
  selectionBytes,
) {
  const base = "runs/" + run + "/",
    editorialInputBytes = fs.readFileSync(safePath(root, base + "editorial-authoring-input.json")),
    editorialInput = JSON.parse(editorialInputBytes),
    record = readJSON(root, base + "draft.json"),
    claims = readJSON(root, base + "reviewed-claims.json")?.claims,
    documents = readJSON(root, base + "documents.json"),
    parses = readJSON(root, base + "parses.json"),
    sourceClaims = readJSON(root, "runs/" + entry.source_run + "/reviewed-claims.json")?.claims
  if (
    record?.provenance?.provider !== "gpt-editorial" ||
    record.provenance.local_model_generated !== false ||
    JSON.stringify(claims) !== JSON.stringify(sourceClaims) ||
    JSON.stringify(documents) !== JSON.stringify(source.documents) ||
    JSON.stringify(parses) !== JSON.stringify(source.parses)
  )
    throw Error("Editorial candidate must reuse the exact selected source and reviewed facts")
  const prepared = prepareEditorialDraft(editorialInput, claims, parses, {
    deepContext: record.deep_context || null,
    documents,
  })
  if (JSON.stringify(prepared) !== JSON.stringify(record))
    throw Error("Native editorial authoring input changed")
  const approval = loadHistoricalApproval(root, run)
  for (const [name, expected] of Object.entries(approval.files))
    if (sha256(fs.readFileSync(safePath(root, base + name))) !== expected)
      throw Error("Editorial candidate approval changed during inspection")
  const readerQuality = inspectReaderQuality(record, claims, {
    publishedAt: approval.article.article_review.published_at,
  })
  const used = [
    ...new Set(
      [
        ...record.draft.lead,
        ...record.draft.explanations.flatMap((explanation) => explanation.paragraphs),
        ...(record.draft.analysis ? [record.draft.analysis] : []),
      ].flatMap((paragraph) => paragraph.claim_ids),
    ),
  ]
  return {
    schema: "evaluation-editorial-candidate-quality/v1",
    case_id: caseId,
    case_split: "development",
    candidate_scope: "development-only",
    writer_run: run,
    source_run: entry.source_run,
    selection_file: selectionFile,
    selection_sha256: sha256(selectionBytes),
    source_documents_sha256: source.identity.documents_sha256,
    source_parses_sha256: source.identity.parses_sha256,
    claims_sha256: sha256(JSON.stringify(claims)),
    editorial_input_sha256: sha256(editorialInputBytes),
    approved_file_hashes: approval.files,
    event_id: approval.article.event_id,
    published_at: approval.article.article_review.published_at,
    reviewed_by: record.provenance.author,
    native_article_approved: true,
    checkpoint: null,
    reader_quality: readerQuality,
    native_authoring_blocked: readerQuality.blocked,
    supplied_claims: claims.length,
    referenced_claim_ids: used,
    unknown_referenced_claim_ids: used.filter(
      (id) => !claims.some((claim) => claim.claim_id === id),
    ),
    unreferenced_supplied_claim_ids: claims
      .filter((claim) => !used.includes(claim.claim_id))
      .map((claim) => claim.claim_id),
    review_kind: "source_reviewed_editorial_candidate",
    semantic_review_status: "editorial_reviewed_development_candidate",
    independent_human_review: false,
    independent_gold: false,
    public_approved: false,
    model_provenance: record.provenance,
    new_model_calls: 0,
  }
}
