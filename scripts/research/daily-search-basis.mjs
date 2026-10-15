import fs from "node:fs"
import { coverageGrid } from "./discovery.mjs"
import { sha256 } from "./contracts.mjs"
import { readJSON, safePath } from "./run-state.mjs"
import { loadEditorialContext } from "./editorial-context.mjs"
import { buildCollectionReport } from "./collection-report.mjs"
import { parseResearchDate } from "./dates.mjs"
import { sourceGeographyInventory } from "./source-recipes.mjs"
import {
  DAILY_CONFIG,
  dailySources,
  localEditionSnapshot,
  readDailyReceipts,
  verifyDailyReceipts,
} from "./daily-scan.mjs"

// A source frontier has exact native windows, rather than a seven-day daily
// plan. Revalidate its original observations without inventing daily receipts.
export function loadStoredReportSearchBasis(root, reference, { configFile = DAILY_CONFIG } = {}) {
  const bytes = fs.readFileSync(safePath(root, reference?.path))
  if (!/^[a-f0-9]{64}$/.test(reference?.sha256 || "") || sha256(bytes) !== reference.sha256)
    throw Error("Exact stored search collection report SHA-256 required")
  const report = JSON.parse(bytes)
  if (
    report.schema !== "research-collection-report/v1" ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(report.daily_run || "") ||
    report.acquisition_basis?.kind !== "stored-source-frontier" ||
    reference.path !== `daily/runs/${report.daily_run}/collection-reports/${reference.sha256}.json`
  )
    throw Error("Native stored-frontier collection report required for search")
  const rebuilt = buildCollectionReport({ root, runId: report.daily_run })
  if (JSON.stringify(rebuilt) !== JSON.stringify(report))
    throw Error("Stored search collection report differs from native source evidence")
  const frontierPath = `daily/runs/${report.daily_run}/source-frontier-inputs.json`
  const frontierBytes = fs.readFileSync(safePath(root, frontierPath))
  const frontier = JSON.parse(frontierBytes)
  const observations = [...frontier.source_runs, ...frontier.held_sources]
  const latest = observations.reduce((prior, row) => {
    const parsed = parseResearchDate(row.observed_at)
    if (parsed?.precision !== "timestamp")
      throw Error("Original source observation timestamp required")
    return !prior || parsed.instant > prior.instant ? { ...parsed, value: row.observed_at } : prior
  }, null)
  if (!latest) throw Error("Stored search report has no source observation")
  const { activeRoutes } = dailySources(configFile)
  const routes = activeRoutes.map((entry) => {
    const row = report.routes.find((route) => route.channel_id === entry.channel_id)
    return {
      ...entry.route,
      status: !row
        ? "not_attempted"
        : row.status === "collected"
          ? "partial"
          : row.status === "incomplete"
            ? "failed"
            : "incomplete",
    }
  })
  return {
    coverage: coverageGrid(routes),
    reference: {
      schema: "research-daily-search-basis/v1",
      basis_kind: "native-stored-frontier-report",
      daily_run: report.daily_run,
      kst_day: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
        new Date(latest.instant),
      ),
      observation_day_basis: "latest_original_source_observation",
      latest_source_observed_at: latest.value,
      collection_report: { path: reference.path, sha256: reference.sha256 },
      source_frontier: { path: frontierPath, sha256: sha256(frontierBytes) },
      collection_status: report.status,
      coverage_scope: report.acquisition_basis.coverage_scope,
      failure_observations: report.missing,
      held_observations: report.held_observations,
      route_geography: routes.map((route) => ({
        channel_id: route.channel_id,
        ...sourceGeographyInventory(route),
      })),
      source_requests_performed: 0,
      coverage_complete: false,
    },
  }
}

export function validateDailySearchCoverage(plan, summary, receipts, activeRoutes) {
  if (
    plan?.schema !== "research-daily-plan/v1" ||
    summary?.schema !== "research-daily-summary/v1" ||
    plan.run_id !== summary.run_id ||
    !Array.isArray(plan.windows) ||
    !Array.isArray(summary.routes) ||
    summary.receipts !== receipts.length ||
    plan.coverage_basis_sha256 !== sha256(JSON.stringify(plan.coverage_basis))
  )
    throw Error("Daily search basis requires one intact plan and summary")
  const routeIds = activeRoutes.map((entry) => entry.channel_id)
  if (
    new Set(routeIds).size !== routeIds.length ||
    plan.windows.some((window) => !routeIds.includes(window.channel_id)) ||
    routeIds.some((id) => !plan.windows.some((window) => window.channel_id === id))
  )
    throw Error("Daily search basis routes differ from the active acquisition plan")
  const result = activeRoutes.map((entry) => {
    const windows = plan.windows.filter((window) => window.channel_id === entry.channel_id)
    const complete = windows.every((window) =>
      receipts.some(
        (receipt) =>
          receipt.status === "window_scanned" &&
          receipt.channel_id === window.channel_id &&
          receipt.since === window.since &&
          receipt.until_exclusive === window.until_exclusive,
      ),
    )
    return { ...entry.route, status: complete ? "partial" : "failed" }
  })
  const routes = result.map((route) => ({
    channel_id: route.channel_id,
    status: route.status === "partial" ? "window_scanned" : "incomplete",
  }))
  if (
    JSON.stringify(summary.routes.map(({ channel_id, status }) => ({ channel_id, status }))) !==
      JSON.stringify(routes) ||
    JSON.stringify(summary.coverage_grid) !== JSON.stringify(coverageGrid(result)) ||
    summary.status !==
      (result.every((route) => route.status === "partial")
        ? "configured_routes_scanned"
        : "partial")
  )
    throw Error("Daily search basis coverage does not match completed source receipts")
  return summary.coverage_grid
}

export function loadDailySearchBasis(
  root,
  runId,
  { vault = "vault", configFile = DAILY_CONFIG } = {},
) {
  if (!/^[a-zA-Z0-9_-]+$/.test(runId || "")) throw Error("Invalid daily search basis run ID")
  const prefix = `daily/runs/${runId}/`
  if (readJSON(root, prefix + "source-frontier-inputs.json")) {
    const report = buildCollectionReport({ root, runId })
    const digest = sha256(Buffer.from(JSON.stringify(report, null, 2) + "\n"))
    return loadStoredReportSearchBasis(
      root,
      { path: prefix + `collection-reports/${digest}.json`, sha256: digest },
      { configFile },
    )
  }
  const planPath = safePath(root, prefix + "plan.json")
  const summaryPath = safePath(root, prefix + "summary.json")
  const plan = readJSON(root, prefix + "plan.json")
  const summary = readJSON(root, prefix + "summary.json")
  if (plan?.run_id !== runId || summary?.run_id !== runId)
    throw Error("Daily search basis run identity mismatch")
  const local = localEditionSnapshot(vault)
  if (
    plan.edition?.cutoff !== local.cutoff ||
    plan.edition?.edition !== local.edition ||
    (plan.edition?.inventory_sha256 === local.inventory_sha256 &&
      plan.edition?.file_sha256 !== local.file_sha256)
  )
    throw Error("Daily search basis no longer matches the local edition inventory")
  const context =
    plan.edition.inventory_sha256 !== local.inventory_sha256
      ? loadEditorialContext(root, plan, local.inventory_sha256)
      : null
  const receipts = readDailyReceipts(root, runId)
  verifyDailyReceipts(root, plan, receipts)
  const { activeRoutes } = dailySources(configFile)
  const coverage = validateDailySearchCoverage(plan, summary, receipts, activeRoutes)
  return {
    coverage,
    reference: {
      schema: "research-daily-search-basis/v1",
      daily_run: runId,
      kst_day: plan.kst_day,
      authority: context ? context.value.current_edition.authority : plan.edition.authority,
      plan_sha256: sha256(fs.readFileSync(planPath)),
      summary_sha256: sha256(fs.readFileSync(summaryPath)),
      receipts_sha256: sha256(JSON.stringify(receipts)),
      edition_inventory_sha256: local.inventory_sha256,
      ...(context ? { editorial_context: context.reference } : {}),
    },
  }
}
