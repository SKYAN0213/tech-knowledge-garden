import fs from "node:fs"
import { coverageGrid } from "./discovery.mjs"
import { sha256 } from "./contracts.mjs"
import { readJSON, safePath } from "./run-state.mjs"
import { loadEditorialContext } from "./editorial-context.mjs"
import {
  DAILY_CONFIG,
  dailySources,
  localEditionSnapshot,
  readDailyReceipts,
  verifyDailyReceipts,
} from "./daily-scan.mjs"

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
