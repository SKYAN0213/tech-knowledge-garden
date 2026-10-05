import fs from "node:fs"
import path from "node:path"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { kstDay, validateDailyRoutes } from "./daily-plan.mjs"
import { registry } from "./discovery.mjs"
import {
  dailySources,
  dailySourcePaths,
  readDailyReceipts,
  validateStoredDailyPlan,
  verifyDailyReceipts,
  supplementalCoverageReceiptForWindow,
} from "./daily-scan.mjs"
import { loadStoredSourceRun } from "./parser.mjs"
import { candidateCheckpoint } from "./evaluation.mjs"
import { loadRoleBudget } from "./model-policy.mjs"
import { loadProcessedSourceResult } from "./processed-source-result.mjs"
import { publicationOperationStatus } from "./publication-operation.mjs"
import { verifyRetrospectiveOutputs } from "./preview.mjs"

export const SHADOW_CRITERIA = [
  "source_review",
  "final_read",
  "important_misses",
  "source_bias",
  "duplicates",
  "korean_quality",
  "processing_time",
]
const id = (value) => {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(value || "")) throw Error("Exact shadow operation ID required")
  return value
}
const base = (run) => `evaluation/shadow/${id(run)}`
const ref = (root, file) => ({ path: file, sha256: sha256(fs.readFileSync(safePath(root, file))) })
function pinned(root, reference, json = true) {
  if (!/^[a-f0-9]{64}$/.test(reference?.sha256 || ""))
    throw Error("Pinned shadow evidence required")
  const bytes = fs.readFileSync(safePath(root, reference.path))
  if (!bytes.length || sha256(bytes) !== reference.sha256) throw Error("Shadow evidence changed")
  return json ? JSON.parse(bytes) : bytes
}

// The invocation and comparison are attributed editorial attestations, not
// claims inferred from an edition's nominal 08:00 timestamp or an mtime.
export async function verifyShadowReview({ root, review, repository = process.cwd() }) {
  if (
    review?.schema !== "research-shadow-review/v1" ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(review.run_id || "") ||
    !["human", "codex"].includes(review.reviewer_kind) ||
    !review.reviewer?.trim() ||
    !Number.isFinite(Date.parse(review.reviewed_at)) ||
    review.published_by !== "legacy" ||
    review.candidate_published !== false ||
    review.invocation?.kind !== "scheduled" ||
    review.invocation.schedule_id !== "tech-ai-briefing-08" ||
    !review.invocation.execution_id?.trim() ||
    !review.invocation.reason?.trim() ||
    !Number.isFinite(Date.parse(review.invocation.started_at)) ||
    !Array.isArray(review.candidates) ||
    !review.candidates.length ||
    new Set(review.candidates.map((row) => row.processing_run)).size !== review.candidates.length ||
    !SHADOW_CRITERIA.every(
      (key) =>
        ["accepted", "rejected"].includes(review.comparison?.[key]?.decision) &&
        review.comparison[key].reason?.trim(),
    ) ||
    !Number.isFinite(review.processing_seconds) ||
    review.processing_seconds < 0
  )
    throw Error("Attributed scheduled comparison review required")
  id(review.daily_run)
  id(review.legacy_publication_run)
  pinned(root, review.invocation.evidence, false)
  for (const key of SHADOW_CRITERIA) pinned(root, review.comparison[key].evidence, false)
  const plan = pinned(root, review.plan)
  const collection = pinned(root, review.collection_basis)
  const config = pinned(root, collection.config)
  const handoff = pinned(root, review.handoff)
  const summary = pinned(root, review.summary)
  const preview = pinned(root, review.candidate_preview)
  const editionDay = review.edition?.match(
    /^Editions\/\d{4}\/\d{2}\/(\d{4}-\d{2}-\d{2})_0800_Tech_AI_Briefing\.md$/,
  )?.[1]
  const started = Date.parse(review.invocation.started_at),
    reviewed = Date.parse(review.reviewed_at)
  if (
    !editionDay ||
    editionDay !== plan.kst_day ||
    editionDay !== kstDay(review.invocation.started_at) ||
    !review.edition.startsWith(`Editions/${editionDay.slice(0, 4)}/${editionDay.slice(5, 7)}/`) ||
    reviewed < started ||
    Date.parse(plan.created_at) < started ||
    Date.parse(plan.created_at) > reviewed ||
    review.plan.path !== `daily/runs/${review.daily_run}/plan.json` ||
    collection?.schema !== "research-shadow-collection-basis/v1" ||
    !Array.isArray(collection.active_routes) ||
    !collection.active_routes.length ||
    plan.windows?.some(
      (window) => !collection.active_routes.some((route) => route.channel_id === window.channel_id),
    )
  )
    throw Error("Exact scheduled date and frozen collection basis required")
  validateStoredDailyPlan(plan, {
    runId: review.daily_run,
    config,
    activeRoutes: collection.active_routes,
    configSha: collection.config_sha256,
    edition: plan.edition,
  })
  if (
    !Array.isArray(collection.sources) ||
    !collection.sources.length ||
    sha256(collection.sources.map((row) => `${row.original_path}:${row.sha256}`).join("\n")) !==
      collection.config_sha256
  )
    throw Error("Frozen collection configuration changed")
  for (const row of collection.sources) pinned(root, row, false)
  const sourceJSON = (file) => {
    const rows = collection.sources.filter((row) => row.original_path === file)
    if (rows.length !== 1) throw Error("Exact frozen source registry required")
    return pinned(root, rows[0])
  }
  const routes = validateDailyRoutes(
    config,
    registry(
      sourceJSON("data/research-source-channels.json"),
      sourceJSON("data/research-watchlist.json"),
      sourceJSON("data/research-acquisition.json"),
      sourceJSON("data/research-source-recipes.json"),
    ),
  )
  if (JSON.stringify(routes) !== JSON.stringify(collection.active_routes))
    throw Error("Frozen active routes changed")
  const receipts = readDailyReceipts(root, review.daily_run)
  pinned(root, collection.backlog)
  verifyDailyReceipts(root, plan, receipts, {
    backlogFile: safePath(root, collection.backlog.path),
  })
  const coverageRef = collection.coverage || review.coverage
  const coverage = coverageRef ? pinned(root, coverageRef) : { routes: {} }
  if ((coverageRef?.sha256 || null) !== handoff.inputs?.daily_coverage_sha256)
    throw Error("Exact frozen daily coverage required")
  const supplemental = plan.windows.flatMap((window) => {
    const proof = supplementalCoverageReceiptForWindow(
      root,
      coverage.routes?.[window.channel_id],
      window,
      { backlogFile: safePath(root, collection.backlog.path) },
    )
    return proof ? [{ window, proof }] : []
  })
  if (
    sha256(JSON.stringify(supplemental.map((row) => row.proof))) !==
    handoff.inputs?.supplemental_receipts_sha256
  )
    throw Error("Exact supplemental collection evidence required")
  if (
    summary.schema !== "research-daily-summary/v1" ||
    summary.run_id !== review.daily_run ||
    review.summary.path !== `daily/runs/${review.daily_run}/summary.json` ||
    !["configured_routes_scanned", "partial"].includes(summary.status) ||
    summary.receipts !== receipts.length ||
    !plan.windows?.length ||
    plan.windows.some(
      (window) =>
        !receipts.some(
          (receipt) =>
            receipt.channel_id === window.channel_id &&
            receipt.since === window.since &&
            receipt.until_exclusive === window.until_exclusive &&
            receipt.status === "window_scanned",
        ) && !supplemental.some((row) => row.window === window),
    ) ||
    handoff.schema !== "research-editorial-handoff/v1" ||
    handoff.daily_run !== review.daily_run ||
    !Array.isArray(handoff.incomplete_windows) ||
    handoff.incomplete_windows.length !== 0 ||
    handoff.inputs?.plan_sha256 !== review.plan.sha256 ||
    handoff.inputs?.receipts_sha256 !== sha256(JSON.stringify(receipts)) ||
    handoff.inputs?.backlog_sha256 !== collection.backlog.sha256 ||
    review.handoff.path !==
      `daily/runs/${review.daily_run}/handoffs/${sha256(JSON.stringify(handoff.inputs))}.json` ||
    !Array.isArray(handoff.pending) ||
    preview.schema !== "private-reader-preview/v1" ||
    preview.candidate_published !== false ||
    !Number.isFinite(Date.parse(preview.observed_at)) ||
    Date.parse(preview.observed_at) < started ||
    Date.parse(preview.observed_at) > reviewed ||
    receipts.some(
      (row) =>
        !Number.isFinite(Date.parse(row.finished_at)) ||
        Date.parse(row.finished_at) > reviewed ||
        Date.parse(row.started_at) < started,
    ) ||
    !preview.editions?.some((row) => row.path === review.edition) ||
    review.candidate_preview.path !== `runs/${preview.run_id}/preview-manifest.json`
  )
    throw Error("Completed same-scope collection and unpublished candidate preview required")
  const legacy = publicationOperationStatus({
    root,
    run: review.legacy_publication_run,
    repository,
  })
  if (
    legacy.status !== "public_bytes_verified" ||
    legacy.observation_basis !== "archived_observation"
  )
    throw Error("Archived legacy Drive, deployment and channel readback required")
  const legacyInput = readJSON(
    root,
    `runs/${review.legacy_publication_run}/publication-operation/input.json`,
  )
  const legacyPreview = pinned(root, legacyInput.preview)
  const publicProof = readJSON(
    root,
    `runs/${review.legacy_publication_run}/publication-operation/public.json`,
  )
  const observation = pinned(root, publicProof.readback)
  if (
    !observation.files.every(
      (row) =>
        Number.isFinite(Date.parse(row.observed_at)) &&
        Date.parse(row.observed_at) >= started &&
        Date.parse(row.observed_at) <= reviewed,
    )
  )
    throw Error("Publication observations must belong to this scheduled execution")
  if (
    !legacyPreview.editions.some((row) => row.path === review.edition) ||
    legacy.preview_run === preview.run_id
  )
    throw Error("Distinct legacy and local candidate authoring required")
  const workspace = safePath(root, preview.workspace)
  const vault = safePath(root, preview.workspace + "/vault")
  for (const row of [
    ...preview.editions,
    ...preview.knowledge,
    ...(preview.navigation ? [preview.navigation] : []),
  ])
    pinned(root, { path: preview.workspace + "/vault/" + row.path, sha256: row.sha256 }, false)
  for (const [directory, rows] of [
    ["public", preview.public],
    ["digest", preview.digest],
  ]) {
    if (
      !Array.isArray(rows) ||
      !rows.length ||
      new Set(rows.map((row) => row.path)).size !== rows.length
    )
      throw Error("Complete immutable candidate reader outputs required")
    for (const row of rows)
      pinned(
        root,
        { path: preview.workspace + "/" + directory + "/" + row.path, sha256: row.sha256 },
        false,
      )
  }
  const models = []
  const events = []
  const articles = []
  for (const row of review.candidates) {
    id(row.processing_run)
    if (
      !preview.approved_runs?.includes(row.processing_run) ||
      legacyPreview.approved_runs?.includes(row.processing_run)
    )
      throw Error("Local candidate must remain separate from legacy publication")
    const entries = handoff.pending.filter((entry) => entry.key === row.candidate_key)
    if (entries.length !== 1) throw Error("Exact collected candidate required")
    const entry = entries[0]
    if (entry.source_evidence_state !== "exact" || entry.observed_in_run !== true)
      throw Error("Candidate must have exact source evidence in this collection")
    const completed = await loadProcessedSourceResult(
      root,
      row.processing_run,
      {
        candidate_key: entry.key,
        source_version_id: entry.article_source_version_id,
        parse_id: entry.article_parse_id,
        content_sha256: entry.article_content_sha256,
        source_urls: entry.source_urls,
        event_id: entry.event_id,
      },
      { vault },
    )
    if (completed.status !== "approved")
      throw Error("Source-checked and approved local candidate required")
    const input = readJSON(root, `runs/${row.processing_run}/source-processing-input.json`)
    const extractionRun = input.extraction_run || row.processing_run
    const { documents, parses } = loadStoredSourceRun(root, extractionRun)
    candidateCheckpoint(root, extractionRun, documents, parses)
    const budget = loadRoleBudget(root, extractionRun, "fact_extract")
    if (
      budget.binding.settings.provider !== "ollama" ||
      !budget.attempts.length ||
      budget.attempts.some(
        (attempt) =>
          attempt.status !== "complete" ||
          attempt.result?.provenance?.model !== budget.binding.settings.model ||
          attempt.result?.provenance?.digest !== budget.binding.model_digest,
      )
    )
      throw Error("Complete local model provenance required")
    if (!preview.consistency?.articles?.some((article) => article.event_id === completed.event_id))
      throw Error("Candidate preview lacks its approved event")
    events.push(completed.event_id)
    const article = readJSON(root, `runs/${row.processing_run}/approved-article.json`)
    if (sha256(JSON.stringify(article)) !== completed.article_sha256)
      throw Error("Approved candidate changed")
    articles.push(article)
    models.push({
      processing_run: row.processing_run,
      extraction_run: extractionRun,
      binding: budget.binding,
      source_identity: input.source_identity,
      budget_sha256: ref(root, `runs/${extractionRun}/model-policy/fact_extract/budget.json`)
        .sha256,
      request_fingerprints: budget.attempts.map((attempt) => attempt.request_fingerprint),
      processing_input_sha256: completed.processing_input_sha256,
      article_sha256: completed.article_sha256,
    })
  }
  if (new Set(events).size !== events.length)
    throw Error("Duplicate candidate events in shadow operation")
  const baselineRSS = pinned(root, preview.source_feed || review.rss_baseline, false).toString(
    "utf8",
  )
  await verifyRetrospectiveOutputs(workspace, articles, preview.editions, baselineRSS, {
    newEdition: !!preview.edition_spec,
  })
  const accepted = SHADOW_CRITERIA.every((key) => review.comparison[key].decision === "accepted")
  return {
    schema: "research-shadow-operation/v1",
    run_id: review.run_id,
    day: editionDay,
    edition: review.edition,
    daily_run: review.daily_run,
    execution_id: review.invocation.execution_id,
    reviewed_at: review.reviewed_at,
    status: accepted ? "completed_comparison" : "review_rejected",
    invocation_basis: "attributed_review_with_pinned_execution_evidence",
    published_by: "legacy",
    candidate_validated: true,
    candidate_published: false,
    legacy_publication_run: review.legacy_publication_run,
    legacy_commit: legacy.commit,
    candidate_preview_run: preview.run_id,
    events,
    models,
  }
}

// Freeze only shared collection inputs. This does not start collection or a
// schedule and cannot manufacture any comparison/publication evidence.
export async function saveShadowCollectionBasis({ root, dailyRun, configFile, backlogFile }) {
  id(dailyRun)
  return withLock(root, "shadow-basis-" + dailyRun, () => {
    const prefix = `evaluation/shadow-bases/${dailyRun}`
    const old = readJSON(root, prefix + "/basis.json")
    if (old) {
      pinned(root, old.config)
      pinned(root, old.backlog)
      for (const row of old.sources) pinned(root, row, false)
      if (
        sha256(old.sources.map((row) => `${row.original_path}:${row.sha256}`).join("\n")) !==
        old.config_sha256
      )
        throw Error("Frozen collection configuration changed")
      return ref(root, prefix + "/basis.json")
    }
    const { config, activeRoutes, config_sha256 } = dailySources(configFile)
    const plan = readJSON(root, `daily/runs/${dailyRun}/plan.json`)
    validateStoredDailyPlan(plan, {
      runId: dailyRun,
      config,
      activeRoutes,
      configSha: config_sha256,
      edition: plan?.edition,
    })
    const copy = (from, name) => {
      const bytes = fs.readFileSync(from),
        file = prefix + "/" + name
      if (fs.existsSync(safePath(root, file))) {
        if (!fs.readFileSync(safePath(root, file)).equals(bytes))
          throw Error("Shadow collection input changed")
      } else atomicCreate(root, file, bytes)
      return ref(root, file)
    }
    const sources = dailySourcePaths(configFile).map((file, index) => ({
      original_path: file,
      ...copy(file, `source-inputs/${index}.bin`),
    }))
    const basis = {
      schema: "research-shadow-collection-basis/v1",
      config_sha256,
      sources,
      config: sources.find((row) => row.original_path === configFile),
      backlog: copy(backlogFile, "backlog.json"),
      ...(fs.existsSync(safePath(root, "daily/route-coverage.json"))
        ? { coverage: copy(safePath(root, "daily/route-coverage.json"), "coverage.json") }
        : {}),
      active_routes: activeRoutes,
    }
    atomicCreate(root, prefix + "/basis.json", basis)
    return ref(root, prefix + "/basis.json")
  })
}

export async function recordShadowOperation({ root, run, reviewPath, repository = process.cwd() }) {
  id(run)
  return withLock(root, "shadow-operation-" + run, async () => {
    const reference = ref(root, reviewPath)
    const review = pinned(root, reference)
    if (review.run_id !== run) throw Error("Shadow review run differs")
    const verified = await verifyShadowReview({ root, review, repository })
    const file = base(run) + "/receipt.json"
    const result = { ...verified, review: reference }
    const saved = readJSON(root, file)
    if (saved && JSON.stringify(saved) !== JSON.stringify(result))
      throw Error("Shadow operation changed; use a new run")
    if (!saved) atomicCreate(root, file, result)
    return result
  })
}

export function summarizeShadowOperations(runs, rejected = []) {
  const days = new Set(),
    editions = new Set(),
    executions = new Set()
  const counted = [],
    duplicates = []
  for (const row of [...runs].sort(
    (a, b) => a.reviewed_at.localeCompare(b.reviewed_at) || a.run_id.localeCompare(b.run_id),
  )) {
    if (row.status !== "completed_comparison") continue
    if (days.has(row.day) || editions.has(row.edition) || executions.has(row.execution_id)) {
      duplicates.push(row.run_id)
      continue
    }
    days.add(row.day)
    editions.add(row.edition)
    executions.add(row.execution_id)
    counted.push(row.run_id)
  }
  return {
    status: rejected.length ? "integrity_review_required" : "read_only_shadow_operations",
    completed_runs: counted.length,
    target_runs: 7,
    counted_runs: counted,
    duplicate_runs: duplicates,
    rejected,
    runs,
    candidate_published: false,
    operational_promotion_verified: false,
  }
}

export async function auditShadowOperations(root, repository = process.cwd()) {
  const directory = safePath(root, "evaluation/shadow")
  if (!fs.existsSync(directory)) return summarizeShadowOperations([])
  const runs = [],
    rejected = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    try {
      if (!entry.isDirectory()) throw Error("Only immutable operation directories are accepted")
      const receipt = readJSON(root, base(entry.name) + "/receipt.json")
      if (!receipt || receipt.run_id !== entry.name)
        throw Error("Exact completed shadow receipt required")
      const verified = await verifyShadowReview({
        root,
        review: pinned(root, receipt.review),
        repository,
      })
      if (JSON.stringify({ ...verified, review: receipt.review }) !== JSON.stringify(receipt))
        throw Error("Shadow receipt differs from verified evidence")
      runs.push(verified)
    } catch (error) {
      rejected.push({ path: path.join("evaluation/shadow", entry.name), reason: error.message })
    }
  }
  return summarizeShadowOperations(runs, rejected)
}
