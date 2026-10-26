import fs from "node:fs"
import { canonicalURL } from "../garden.mjs"
import { sha256, sourceId } from "./contracts.mjs"
import { registry } from "./discovery.mjs"
import { sourceGeographyInventory } from "./source-recipes.mjs"
import {
  readDailyReceipts,
  storedListScan,
  verifyDailyReceipts,
  supplementalCoverageReceiptForWindow,
} from "./daily-scan.mjs"
import { assertStoredEvidence } from "./parser.mjs"
import { verifyStoredListScan, verifyStoredPartialCandidates } from "./scan-evidence.mjs"
import { listScanPolicyRecheckOptions } from "./list-scan-command.mjs"
import { parseResearchDate } from "./dates.mjs"
import { loadShadowCollectionInputs, loadShadowHandoffBasis } from "./shadow-collection-basis.mjs"
import { DEFAULT_ROOT, atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { collectionRecoveryRequest } from "./collection-resilience.mjs"

export function sourceCollectionInventory({
  channels,
  watchlist,
  acquisition,
  recipes,
  daily,
  catalog,
  review,
}) {
  const routes = registry(channels, watchlist, acquisition, recipes)
  const enabled = new Set(daily.routes.filter((row) => row.enabled).map((row) => row.channel_id))
  if ([...enabled].some((id) => !routes.some((row) => row.channel_id === id)))
    throw Error("Enabled collection route is absent from the registry")
  return {
    registered_routes: routes.length,
    channel_entries: channels.channels.length,
    active_daily_routes: enabled.size,
    catalog_entries: catalog.entries.length,
    counts_overlap: true,
    route_reviewed_at: review?.reviewed_at || null,
    evidence_scope: "route_registration_and_access_observations",
    disposition_counts: Object.fromEntries(
      ["automatic", "discovery", "excluded", "unreviewed"].map((mode) => [
        mode,
        routes.filter(
          (row) =>
            (row.collection_mode || (enabled.has(row.channel_id) ? "automatic" : "unreviewed")) ===
            mode,
        ).length,
      ]),
    ),
    routes: routes.map((row) => {
      const observed = review?.routes?.find((entry) => entry.channel_id === row.channel_id) || null
      const observedUrlMatches = Boolean(
        observed &&
        typeof observed.url === "string" &&
        canonicalURL(observed.url) === canonicalURL(row.url),
      )
      return {
        channel_id: row.channel_id,
        name: row.name,
        url: row.url,
        method: row.method,
        region: row.region,
        ...sourceGeographyInventory(row),
        language: row.language,
        axis: row.axis,
        kind: row.kind || null,
        sectors: row.sectors,
        coverage_sectors: row.coverage_sectors || row.sectors,
        entity_ids: row.entity_ids,
        watch_groups: row.watch_groups,
        registered_route_ids: row.registered_route_ids,
        daily_enabled: enabled.has(row.channel_id),
        onboarding_status: row.onboarding?.status || null,
        remaining_checks: row.onboarding?.remaining_checks || [],
        access_resolution: row.onboarding?.access_resolution || null,
        collection_configuration_present: Boolean(row.listing_profile || row.api_profile),
        collection_mode:
          row.collection_mode || (enabled.has(row.channel_id) ? "automatic" : "unreviewed"),
        phase: enabled.has(row.channel_id)
          ? "active"
          : row.collection_mode === "excluded"
            ? "excluded"
            : row.collection_mode === "discovery"
              ? "discovery_only"
              : row.onboarding?.collection_enabled || row.listing_profile || row.api_profile
                ? "validation_pending"
                : "configuration_pending",
        access_observation: observed
          ? {
              status: observed.observed_status || observed.availability || "not_observed",
              reviewed_at: review.reviewed_at || null,
              role: observed.role || null,
              url_matches_current: observedUrlMatches,
              audit_reference: observed.audit_reference || null,
            }
          : null,
        article_evidence_status: "not_evaluated_in_inventory",
        event_selection_status: "not_evaluated_in_inventory",
        review: observed,
      }
    }),
  }
}

const keyOf = (row) => JSON.stringify([row.channel_id, row.since, row.until_exclusive])
const captured = (document) => ["captured", "not_modified"].includes(document.fetch_status)
const ref = (root, file) => ({ path: file, sha256: sha256(fs.readFileSync(safePath(root, file))) })
const exactRun = (id) => /^[A-Za-z0-9_-]{1,100}$/.test(id || "")
const frontierPath = (id) => `daily/runs/${id}/source-frontier-inputs.json`

function checkedWindow(window) {
  if (
    parseResearchDate(window?.since)?.precision !== "day" ||
    parseResearchDate(window?.until_exclusive)?.precision !== "day" ||
    window.since >= window.until_exclusive
  )
    throw Error("Exact stored source window required")
  return window
}

function sourceFrontierObservation(root, declaration, held = false) {
  const id = declaration?.run_id
  if (!exactRun(id)) throw Error("Exact stored source run required")
  const prefix = `runs/${id}/`,
    scan = storedListScan(root, id)
  const state = readJSON(root, prefix + "state.json")
  const basis = readJSON(root, prefix + "collection-basis.json")
  const archive = readJSON(root, prefix + "archive-reuse.json")
  const repair = readJSON(root, prefix + "detail-repair-reuse.json")
  const recovery = readJSON(root, prefix + "source-recovery-reuse.json")
  const input = {
    schema: "research-list-run-input/v2",
    channel_id: scan.summary.channel_id,
    since: scan.summary.window?.since,
    until_exclusive: scan.summary.window?.until_exclusive,
    reuse_listing_run: scan.summary.listing_reused_from_run || null,
    collection_basis: basis,
    ...listScanPolicyRecheckOptions(declaration.policy_recheck_limit),
    ...(archive ? { reuse_source_run: archive.source_run?.source_run } : {}),
    ...(repair ? { repair_source_run: repair.source_run?.source_run } : {}),
    ...(recovery ? { recovery_source_run: recovery.source_run?.source_run } : {}),
  }
  const window = { channel_id: scan.summary.channel_id, ...checkedWindow(scan.summary.window) }
  if (
    scan.summary.schema !== "research-list-scan/v1" ||
    !["window_scanned", "incomplete"].includes(scan.summary.status) ||
    (held && scan.summary.status !== "incomplete") ||
    (scan.summary.status === "incomplete" && !scan.summary.reason) ||
    state?.schema !== "research-run/v1" ||
    state.run_id !== id ||
    state.input_hash !== sha256(JSON.stringify(input)) ||
    basis?.channel_id !== window.channel_id ||
    (scan.summary.channel_config_sha256 &&
      scan.summary.channel_config_sha256 !== basis.route_sha256) ||
    !Number.isFinite(Date.parse(state.started_at)) ||
    !state.stages?.["collection-basis"] ||
    !Object.keys(state.stages).length
  )
    throw Error("Stored frontier source input, status or window changed")
  const pins = [],
    observations = []
  const addDocument = (value) => {
    if (!value || typeof value !== "object") return
    if (
      typeof value.source_id === "string" &&
      typeof value.original_url === "string" &&
      typeof value.fetch_status === "string" &&
      Number.isFinite(Date.parse(value.observed_at))
    ) {
      if (value.source_id !== sourceId(value.original_url))
        throw Error("Stored frontier source observation identity changed")
      observations.push(value)
      if (captured(value)) {
        assertStoredEvidence(root, [value], [])
        pins.push(ref(root, value.body_path))
      }
      const policy = value.availability?.observation
      if (policy) {
        const pinned = ref(root, policy.path)
        if (
          !/^source-policy\/observations\/[a-f0-9]{64}\.json$/.test(policy.path) ||
          pinned.sha256 !== policy.sha256
        )
          throw Error("Stored frontier policy observation changed")
        pins.push(pinned)
      }
    } else if (Array.isArray(value)) value.forEach(addDocument)
    else Object.values(value).forEach(addDocument)
  }
  for (const [name, stage] of Object.entries(state.stages)) {
    if (
      !/^[A-Za-z0-9_-]+$/.test(name) ||
      stage.status !== "complete" ||
      stage.result_path !== prefix + name + ".json" ||
      !Number.isFinite(Date.parse(stage.finished_at)) ||
      sha256(JSON.stringify(readJSON(root, stage.result_path))) !== stage.result_hash
    )
      throw Error("Stored frontier needs settled native checkpoints")
    pins.push(ref(root, stage.result_path))
    addDocument(readJSON(root, stage.result_path))
  }
  for (const file of [
    "state.json",
    "collection-basis.json",
    "collection-input.json",
    "list-scan.json",
    "documents.json",
    "parses.json",
    "candidates.json",
    "list-pages.json",
    "archive-reuse.json",
    "detail-repair-reuse.json",
    "source-recovery-reuse.json",
  ])
    if (fs.existsSync(safePath(root, prefix + file))) pins.push(ref(root, prefix + file))
  if (scan.documents.length || scan.parses.length)
    assertStoredEvidence(root, scan.documents, scan.parses)
  for (const document of [...scan.documents, ...scan.indexDocuments]) addDocument(document)
  for (const parsed of scan.parses) pins.push(ref(root, `parses/${parsed.parse_id}/parse.json`))
  if (scan.summary.status === "window_scanned") verifyStoredListScan(root, scan, window)
  else if (scan.candidates.length) verifyStoredPartialCandidates(root, scan, window)
  const listing = scan.summary.listing_source_version_id
    ? observations.filter(
        (document) => document.source_version_id === scan.summary.listing_source_version_id,
      )
    : scan.indexDocuments.length
      ? scan.indexDocuments
      : observations.filter(
          (document) =>
            document.original_url === scan.summary.listing_url ||
            (scan.summary.pages || []).some(
              (page) =>
                page.source_version_id === document.source_version_id ||
                page.url === document.original_url,
            ),
        )
  const summaryObserved = scan.summary.observed_at
  const listingObservations = [
    ...new Map(
      listing.map((document) => [
        JSON.stringify([document.source_version_id, document.original_url, document.observed_at]),
        {
          source_version_id: document.source_version_id || null,
          url: document.original_url,
          observed_at: document.observed_at,
        },
      ]),
    ).values(),
  ]
  if (
    !listingObservations.length ||
    (summaryObserved !== undefined &&
      !listingObservations.some((document) => document.observed_at === summaryObserved))
  )
    throw Error("Stored frontier listing observation is absent from native checkpoints: " + id)
  const finishedAt = Object.values(state.stages)
    .map((s) => s.finished_at)
    .sort()
    .at(-1)
  const requested = held ? checkedWindow(declaration.requested_window) : null
  if (
    held &&
    (requested.since !== window.since ||
      requested.until_exclusive < window.until_exclusive ||
      !declaration.reason)
  )
    throw Error("Held frontier must preserve its original failed window and explicit resume scope")
  return {
    declaration,
    input,
    input_sha256: state.input_hash,
    window,
    status: scan.summary.status,
    reason: scan.summary.reason || null,
    observed_at: summaryObserved ?? listingObservations[0].observed_at,
    observation_basis: summaryObserved === undefined ? "native_listing_pages" : "native_summary",
    listing_observations: listingObservations,
    started_at: state.started_at,
    finished_at: finishedAt,
    ...(held
      ? { requested_window: requested, hold_reason: declaration.reason, newly_executed: false }
      : {}),
    evidence: [...new Map(pins.map((pin) => [pin.path, pin])).values()],
  }
}

function storedFrontierRegistry() {
  const files = [
    "data/research-daily-routes.json",
    "data/research-source-channels.json",
    "data/research-watchlist.json",
    "data/research-acquisition.json",
    "data/research-source-recipes.json",
  ]
  const [daily, channels, watchlist, acquisition, recipes] = files.map((file) =>
    JSON.parse(fs.readFileSync(file)),
  )
  const routes = registry(channels, watchlist, acquisition, recipes)
  const activeIds = daily.routes
    .filter((r) => r.enabled)
    .map((r) => r.channel_id)
    .sort()
  if (
    new Set(activeIds).size !== activeIds.length ||
    activeIds.some((id) => !routes.some((r) => r.channel_id === id))
  )
    throw Error("Stored frontier registry is invalid")
  return {
    active_route_ids: activeIds,
    evidence: files.map((file) => ({ path: file, sha256: sha256(fs.readFileSync(file)) })),
  }
}

// Independent stored windows retain their native input and observation times.
// They do not become seven-day daily-plan receipts or new source requests.
export async function freezeStoredSourceFrontier({
  root = DEFAULT_ROOT,
  runId,
  sourceRuns,
  heldSources = [],
}) {
  if (
    !exactRun(runId) ||
    !Array.isArray(sourceRuns) ||
    !sourceRuns.length ||
    !Array.isArray(heldSources)
  )
    throw Error("Exact stored source frontier inputs required")
  return withLock(root, "stored-frontier-" + runId, () => {
    if (loadShadowCollectionInputs(root, runId))
      throw Error("Daily plan and stored frontier inputs cannot share a run")
    const path = frontierPath(runId),
      existing = readJSON(root, path)
    if (existing) {
      if (
        JSON.stringify(existing.source_runs.map((row) => row.declaration)) !==
          JSON.stringify(sourceRuns) ||
        JSON.stringify(existing.held_sources.map((row) => row.declaration)) !==
          JSON.stringify(heldSources)
      )
        throw Error("Stored frontier input changed; use a new run ID")
      buildStoredFrontierReport(root, runId, [])
      return { ...ref(root, path), reused: true }
    }
    const registration = storedFrontierRegistry()
    const source_runs = sourceRuns.map((row) => sourceFrontierObservation(root, row))
    const held_sources = heldSources.map((row) => sourceFrontierObservation(root, row, true))
    const all = [...source_runs, ...held_sources]
    if (
      new Set(all.map((r) => r.declaration.run_id)).size !== all.length ||
      new Set(all.map((r) => keyOf(r.window))).size !== all.length ||
      all.some((r) => !registration.active_route_ids.includes(r.window.channel_id))
    )
      throw Error("Stored frontier needs unique native windows on registered active routes")
    const result = atomicCreate(root, path, {
      schema: "research-stored-source-frontier/v1",
      run_id: runId,
      frozen_at: new Date().toISOString(),
      registration,
      source_runs,
      held_sources,
      source_requests_performed: 0,
      candidate_approved: false,
      candidate_published: false,
    })
    return { ...result, reused: false }
  })
}

function buildStoredFrontierReport(root, runId, supplementalRuns) {
  if (loadShadowCollectionInputs(root, runId))
    throw Error("Daily plan and stored frontier inputs cannot share a run")
  if (supplementalRuns.length)
    throw Error("Stored frontier supplemental inputs must be frozen separately")
  const path = frontierPath(runId),
    input = readJSON(root, path)
  if (
    input?.schema !== "research-stored-source-frontier/v1" ||
    input.run_id !== runId ||
    JSON.stringify(input.registration) !== JSON.stringify(storedFrontierRegistry())
  )
    throw Error("Frozen stored frontier registration changed")
  const sources = input.source_runs.map((row) => {
    const checked = sourceFrontierObservation(root, row.declaration)
    if (JSON.stringify(checked) !== JSON.stringify(row))
      throw Error("Frozen frontier source evidence changed")
    return checked
  })
  const held = input.held_sources.map((row) => {
    const checked = sourceFrontierObservation(root, row.declaration, true)
    if (JSON.stringify(checked) !== JSON.stringify(row))
      throw Error("Frozen held source evidence changed")
    return checked
  })
  const all = [...sources, ...held]
  const unrepresented = input.registration.active_route_ids.filter(
    (id) => !all.some((row) => row.window.channel_id === id),
  )
  const report = summarizeCollection({
    plan: { run_id: runId, windows: all.map((row) => row.window) },
    receipts: all.map((row) => ({
      ...row.window,
      attempt_id: row.declaration.run_id,
      status: row.status,
      reason: row.reason,
      started_at: row.newly_executed === false ? null : row.started_at,
      finished_at: row.newly_executed === false ? null : row.finished_at,
      ...(row.newly_executed === false
        ? {}
        : { timing_ms: { total: Date.parse(row.finished_at) - Date.parse(row.started_at) } }),
    })),
    scans: all.map((row) => ({
      ...storedListScan(root, row.declaration.run_id),
      run_id: row.declaration.run_id,
      channel_id: row.window.channel_id,
    })),
    sizeOf: (file) => fs.statSync(safePath(root, file)).size,
  })
  for (const material of report.materials)
    material.parse_sha256 = ref(root, material.parse_path).sha256
  report.missing.push(
    ...all
      .filter((row) => row.status === "incomplete")
      .map((row) => ({
        scan_run: row.declaration.run_id,
        channel_id: row.window.channel_id,
        window: row.window,
        status: "incomplete",
        reason: row.reason,
        observed_at: row.observed_at,
        held: row.newly_executed === false,
      })),
  )
  return {
    ...report,
    status: unrepresented.length ? "partial" : report.status,
    acquisition_basis: {
      kind: "stored-source-frontier",
      total_active_routes: input.registration.active_route_ids.length,
      newly_executed_routes: new Set(sources.map((row) => row.window.channel_id)).size,
      newly_executed_windows: sources.length,
      successful_new_windows: sources.filter((row) => row.status === "window_scanned").length,
      failed_new_windows: sources.filter((row) => row.status === "incomplete").length,
      held_route_observations: held.length,
      unrepresented_active_routes: unrepresented,
      timing_scope: "native checkpoint elapsed; CLI and reconciliation overhead excluded",
      coverage_scope: "exact stored windows; current-day observations remain snapshots",
      report_source_requests_performed: 0,
    },
    held_observations: held.map(({ evidence, input: _sourceInput, ...row }) => row),
    evidence: [
      ...new Map(
        [ref(root, path), ...all.flatMap((row) => row.evidence)].map((pin) => [pin.path, pin]),
      ).values(),
    ],
  }
}

// This is a projection of native collection artifacts, not another source store.
// An unchanged source/parse is listed once; all route/window observations remain.
export function summarizeCollection({
  plan,
  receipts,
  scans,
  sizeOf,
  supplemental = [],
  reusedWindows = [],
}) {
  const windows = plan.windows.map((window) => {
    const attempts = receipts.filter((row) => keyOf(row) === keyOf(window))
    const reused = reusedWindows.find((row) => keyOf(row.window) === keyOf(window))
    const successful = attempts.some((row) => row.status === "window_scanned") || Boolean(reused)
    return {
      ...window,
      status: successful ? "window_scanned" : attempts.length ? "incomplete" : "pending",
      attempts: attempts.map((row) => ({
        run_id: row.attempt_id,
        status: row.status,
        reason: row.reason || null,
      })),
      ...(reused ? { reused_coverage: reused } : {}),
    }
  })
  const routes = [...new Set(windows.map((row) => row.channel_id))].map((channel_id) => {
    const owned = windows.filter((row) => row.channel_id === channel_id)
    return {
      channel_id,
      status: owned.every((row) => row.status === "window_scanned")
        ? "collected"
        : owned.some((row) => row.status === "incomplete")
          ? "incomplete"
          : "pending",
      windows: owned,
    }
  })
  const starts = receipts.map((row) => Date.parse(row.started_at)).filter(Number.isFinite)
  const finishes = receipts.map((row) => Date.parse(row.finished_at)).filter(Number.isFinite)
  const materials = new Map(),
    observations = new Map(),
    bodies = new Map(),
    missing = [],
    pendingDetails = new Map()
  for (const scan of [...scans, ...supplemental]) {
    const listingVersions = new Set(scan.indexDocuments.map((row) => row.source_version_id))
    for (const document of [...scan.indexDocuments, ...scan.documents]) {
      const observationKey = JSON.stringify([
        document.source_id,
        document.source_version_id,
        document.observed_at,
        document.request_method,
        document.fetch_status,
      ])
      if (!observations.has(observationKey)) observations.set(observationKey, document)
      if (!captured(document)) continue
      if (!bodies.has(document.body_path))
        bodies.set(document.body_path, sizeOf(document.body_path))
      const matching = scan.parses.filter(
        (row) => row.source_version_id === document.source_version_id,
      )
      for (const parsed of matching) {
        const id = sha256(JSON.stringify([document.source_version_id, parsed.parse_id]))
        const role = listingVersions.has(document.source_version_id)
          ? "listing"
          : scan.candidates.some(
                (row) =>
                  row.article_source_version_id === document.source_version_id &&
                  row.article_parse_id === parsed.parse_id,
              )
            ? "article_candidate"
            : "source_material"
        let material = materials.get(id)
        if (!material) {
          material = {
            id,
            source_id: document.source_id,
            source_version_id: document.source_version_id,
            parse_id: parsed.parse_id,
            url: document.original_url,
            title: parsed.title,
            published_at: parsed.dates?.published_at || null,
            modified_at: parsed.dates?.modified_at || null,
            parse_status: parsed.status,
            block_count: parsed.blocks?.length || 0,
            body_path: document.body_path,
            body_sha256: document.body_sha256,
            parse_path: `parses/${parsed.parse_id}/parse.json`,
            roles: [],
            observations: [],
          }
          materials.set(id, material)
        }
        if (!material.roles.includes(role)) material.roles.push(role)
        const observation = {
          scan_run: scan.run_id,
          channel_id: scan.channel_id || null,
          observed_at: document.observed_at,
          role,
          ...(scan.linked_from ? { linked_from: scan.linked_from } : {}),
        }
        if (
          !material.observations.some((row) => JSON.stringify(row) === JSON.stringify(observation))
        )
          material.observations.push(observation)
      }
    }
    for (const detail of scan.summary?.details || []) {
      const window =
        scan.summary?.window || plan.windows.find((w) => w.channel_id === scan.channel_id)
      const key = JSON.stringify([
        scan.channel_id,
        window?.since,
        window?.until_exclusive,
        detail.url,
      ])
      if (["source_parsed_unreviewed", "public_access_excluded"].includes(detail.status))
        pendingDetails.delete(key)
      else
        pendingDetails.set(key, {
          scan_run: scan.run_id,
          channel_id: scan.channel_id,
          since: window?.since || null,
          until_exclusive: window?.until_exclusive || null,
          url: detail.url,
          status: detail.status,
          kind:
            detail.status === "deferred_by_budget"
              ? "budget_pending"
              : /image|conflict|profile|parse/u.test(detail.status)
                ? "source_review_required"
                : "fetch_failure",
        })
      if (!["source_parsed_unreviewed", "public_access_excluded"].includes(detail.status))
        missing.push({
          scan_run: scan.run_id,
          channel_id: scan.channel_id,
          url: detail.url,
          status: detail.status,
          fetched: detail.fetched ?? null,
        })
    }
  }
  const pendingItems = [...pendingDetails.values()].filter(
    (row) =>
      !windows.some(
        (w) =>
          w.channel_id === row.channel_id &&
          w.status === "window_scanned" &&
          (!row.since || (w.since === row.since && w.until_exclusive === row.until_exclusive)),
      ),
  )
  const pendingCount = (kind) =>
    new Set(pendingItems.filter((r) => !kind || r.kind === kind).map((r) => r.url)).size
  const heldSources = windows.flatMap((window) => {
    if (window.status === "window_scanned") return []
    const last = receipts.filter((r) => keyOf(r) === keyOf(window)).at(-1)
    return last?.source_wait
      ? [
          {
            channel_id: window.channel_id,
            since: window.since,
            until_exclusive: window.until_exclusive,
            ...last.source_wait,
          },
        ]
      : []
  })
  const inRun = [...observations.values()].filter(
    (row) =>
      starts.length &&
      finishes.length &&
      Date.parse(row.observed_at) >= Math.min(...starts) &&
      Date.parse(row.observed_at) <= Math.max(...finishes),
  )
  const timings = receipts.filter((row) => row.timing_ms)
  const sum = (key) => timings.reduce((total, row) => total + (row.timing_ms[key] ?? 0), 0)
  return {
    schema: "research-collection-report/v1",
    daily_run: plan.run_id,
    status: routes.every((row) => row.status === "collected") ? "collected" : "partial",
    counts: {
      planned_routes: routes.length,
      collected_routes: routes.filter((r) => r.status === "collected").length,
      incomplete_routes: routes.filter((r) => r.status === "incomplete").length,
      pending_routes: routes.filter((r) => r.status === "pending").length,
      planned_windows: windows.length,
      collected_windows: windows.filter((r) => r.status === "window_scanned").length,
      reused_windows: reusedWindows.length,
      incomplete_windows: windows.filter((r) => r.status === "incomplete").length,
      pending_windows: windows.filter((r) => r.status === "pending").length,
      materials: materials.size,
      article_source_parses: [...materials.values()].filter((r) =>
        r.roles.includes("article_candidate"),
      ).length,
      unique_raw_bodies: bodies.size,
      recorded_document_observations: observations.size,
      recorded_in_run_document_observations: inRun.length,
      pending_detail_urls: pendingCount(),
      budget_pending_urls: pendingCount("budget_pending"),
      review_pending_urls: pendingCount("source_review_required"),
      held_source_routes: new Set(heldSources.map((r) => r.channel_id)).size,
    },
    timing: {
      wall_clock_ms:
        starts.length && finishes.length ? Math.max(...finishes) - Math.min(...starts) : null,
      summed_worker_elapsed_ms: sum("total"),
      measured_receipts: timings.length,
      phases: {
        scan_ms: sum("scan"),
        verify_ms: sum("verify"),
        backlog_merge_ms: sum("backlog_merge"),
      },
      by_route: routes
        .map((row) => ({
          channel_id: row.channel_id,
          total_ms: timings
            .filter((r) => r.channel_id === row.channel_id)
            .reduce((total, r) => total + r.timing_ms.total, 0),
        }))
        .sort((a, b) => b.total_ms - a.total_ms),
    },
    resources: {
      referenced_raw_body_bytes: [...bodies.values()].reduce((a, b) => a + b, 0),
      captured_response_body_bytes: inRun
        .filter((r) => r.fetch_status === "captured")
        .reduce((total, r) => total + sizeOf(r.body_path), 0),
      network_wire_bytes: null,
      incremental_disk_bytes: null,
      full_run_peak_rss_bytes: null,
      llm_calls: 0,
      scope: "collection_and_parsing_only",
    },
    routes,
    materials: [...materials.values()].sort((a, b) => a.id.localeCompare(b.id)),
    missing,
    pending_items: pendingItems,
    held_sources: heldSources,
    candidate_approved: false,
    candidate_published: false,
  }
}

export function buildCollectionReport({ root = DEFAULT_ROOT, runId, supplementalRuns = [] }) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(runId || "")) throw Error("Exact daily run ID required")
  if (readJSON(root, frontierPath(runId)))
    return buildStoredFrontierReport(root, runId, supplementalRuns)
  const input = loadShadowCollectionInputs(root, runId)
  if (!input) throw Error("Frozen collection inputs required")
  const plan = readJSON(root, input.value.plan.path)
  const summary = readJSON(root, `daily/runs/${runId}/summary.json`)
  const receipts = readDailyReceipts(root, runId)
  if (!summary || summary.run_id !== runId || summary.receipts !== receipts.length)
    throw Error("Collection must settle before building a source-material report")
  const pointer = readJSON(root, `daily/runs/${runId}/shadow-basis.json`)
  if (!pointer?.basis) throw Error("Settled collection handoff snapshot required")
  const basis = loadShadowHandoffBasis(root, pointer.basis)
  if (
    basis.daily_run !== runId ||
    basis.acquisition_inputs.sha256 !== input.sha256 ||
    ref(root, `daily/runs/${runId}/summary.json`).sha256 !== basis.summary.sha256 ||
    JSON.stringify(readJSON(root, basis.receipts.path)) !== JSON.stringify(receipts)
  )
    throw Error("Collection report differs from its frozen handoff")
  verifyDailyReceipts(root, plan, receipts, { backlogFile: safePath(root, basis.backlog.path) })
  const pins = [
    ref(root, input.path),
    ref(root, input.value.plan.path),
    ref(root, `daily/runs/${runId}/summary.json`),
    pointer.basis,
    basis.coverage,
  ]
  const scans = []
  const reusedWindows = []
  const coverage = readJSON(root, basis.coverage.path)
  for (const window of plan.windows) {
    if (receipts.some((row) => keyOf(row) === keyOf(window) && row.status === "window_scanned"))
      continue
    const prior = supplementalCoverageReceiptForWindow(
      root,
      coverage.routes[window.channel_id],
      window,
      { backlogFile: safePath(root, basis.backlog.path) },
    )
    if (!prior) continue
    reusedWindows.push({
      window,
      source_run: prior.scan_run,
      reconciliation_run: prior.reconciliation_run,
    })
    pins.push(ref(root, `daily/reconciliations/${prior.reconciliation_run}.json`))
    const scan = storedListScan(root, prior.scan_run)
    for (const file of [
      "list-scan.json",
      "documents.json",
      "parses.json",
      "candidates.json",
      "list-pages.json",
    ])
      if (fs.existsSync(safePath(root, `runs/${prior.scan_run}/${file}`)))
        pins.push(ref(root, `runs/${prior.scan_run}/${file}`))
    scans.push({ ...scan, run_id: prior.scan_run, channel_id: window.channel_id })
  }
  for (const receipt of receipts) {
    pins.push(ref(root, `daily/runs/${runId}/receipts/${receipt.attempt_id}.json`))
    if (!fs.existsSync(safePath(root, `runs/${receipt.attempt_id}/list-scan.json`))) {
      if (receipt.status === "window_scanned" || receipt.candidate_keys?.length)
        throw Error("Collected receipt lacks native source artifacts")
      continue
    }
    const scan = storedListScan(root, receipt.attempt_id)
    if (scan.documents.length || scan.parses.length)
      assertStoredEvidence(root, scan.documents, scan.parses)
    for (const file of [
      "list-scan.json",
      "documents.json",
      "parses.json",
      "candidates.json",
      "list-pages.json",
    ])
      if (fs.existsSync(safePath(root, `runs/${receipt.attempt_id}/${file}`)))
        pins.push(ref(root, `runs/${receipt.attempt_id}/${file}`))
    scans.push({ ...scan, run_id: receipt.attempt_id, channel_id: receipt.channel_id })
  }
  const supplemental = supplementalRuns.map((id) => {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id || ""))
      throw Error("Exact supplemental source run required")
    const documents = readJSON(root, `runs/${id}/documents.json`),
      parses = readJSON(root, `runs/${id}/parses.json`)
    assertStoredEvidence(root, documents, parses)
    const linkedFrom = scans.flatMap((scan) =>
      scan.parses.flatMap((parsed) =>
        (parsed.links || [])
          .filter((link) =>
            documents.some((doc) => canonicalURL(doc.original_url) === canonicalURL(link.url)),
          )
          .map((link) => ({
            scan_run: scan.run_id,
            listing_parse_id: parsed.parse_id,
            url: link.url,
            listed_at: link.published_at || null,
          })),
      ),
    )
    if (
      !linkedFrom.length ||
      documents.some(
        (doc) =>
          !linkedFrom.some((link) => canonicalURL(link.url) === canonicalURL(doc.original_url)),
      )
    )
      throw Error("Supplemental material must be linked by this round's stored source")
    for (const file of ["documents.json", "parses.json"]) pins.push(ref(root, `runs/${id}/${file}`))
    return {
      run_id: id,
      documents,
      parses,
      indexDocuments: [],
      candidates: [],
      linked_from: linkedFrom,
    }
  })
  const report = summarizeCollection({
    plan,
    receipts,
    scans,
    supplemental,
    reusedWindows,
    sizeOf: (file) => fs.statSync(safePath(root, file)).size,
  })
  for (const material of report.materials)
    material.parse_sha256 = ref(root, material.parse_path).sha256
  return { ...report, evidence: pins }
}

// Cache only the hash-verified immutable report within one module invocation.
// Source bodies/parses still undergo their native byte checks on every read.
export function createCollectionMaterialReader({ root = DEFAULT_ROOT, reportPath, reportSha256 }) {
  const bytes = fs.readFileSync(safePath(root, reportPath))
  if (!/^[a-f0-9]{64}$/.test(reportSha256 || "") || sha256(bytes) !== reportSha256)
    throw Error("Exact collection report SHA-256 required")
  const report = JSON.parse(bytes)
  if (report.schema !== "research-collection-report/v1" || !Array.isArray(report.materials))
    throw Error("Stored collection report is invalid")
  const materials = new Map(report.materials.map((row) => [row.id, row]))
  if (materials.size !== report.materials.length) throw Error("Duplicate collection material ID")
  return (materialId) => {
    const material = materials.get(materialId)
    if (!material) throw Error("Exact material ID is absent from this collection report")
    const parsedBytes = fs.readFileSync(safePath(root, material.parse_path))
    const body = fs.readFileSync(safePath(root, material.body_path))
    const parsed = JSON.parse(parsedBytes)
    if (
      sha256(parsedBytes) !== material.parse_sha256 ||
      sha256(body) !== material.body_sha256 ||
      parsed.source_id !== material.source_id ||
      parsed.source_version_id !== material.source_version_id ||
      parsed.parse_id !== material.parse_id
    )
      throw Error("Collection material source or parse changed")
    return { daily_run: report.daily_run, material, blocks: parsed.blocks, links: parsed.links }
  }
}

export function readCollectionMaterial(options) {
  return createCollectionMaterialReader(options)(options.materialId)
}

export async function saveCollectionReport(options) {
  const root = options.root || DEFAULT_ROOT
  return withLock(root, "daily-acquisition", () => {
    const report = buildCollectionReport(options)
    const bytes = Buffer.from(JSON.stringify(report, null, 2) + "\n")
    const file = `daily/runs/${options.runId}/collection-reports/${sha256(bytes)}.json`
    if (!fs.existsSync(safePath(root, file))) atomicCreate(root, file, bytes)
    else if (!fs.readFileSync(safePath(root, file)).equals(bytes))
      throw Error("Collection report bytes changed")
    return {
      path: file,
      sha256: sha256(bytes),
      status: report.status,
      counts: report.counts,
      timing: report.timing,
      resources: report.resources,
      recovery_request: collectionRecoveryRequest(report, { path: file, sha256: sha256(bytes) }),
    }
  })
}
