import assert from "node:assert/strict"
import test from "node:test"
import { coverageGrid } from "../scripts/research/discovery.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { validateDailySearchCoverage } from "../scripts/research/daily-search-basis.mjs"

test("search gaps come from completed daily receipts, not a summary claim", () => {
  const activeRoutes = [
    {
      channel_id: "ai-ko",
      route: {
        channel_id: "ai-ko",
        sectors: ["AI"],
        region: "국내",
        axis: "기술·제품",
      },
    },
    {
      channel_id: "robot-en",
      route: {
        channel_id: "robot-en",
        sectors: ["로봇·제조"],
        region: "해외",
        axis: "기업·운영",
      },
    },
  ]
  const windows = activeRoutes.map(({ channel_id }) => ({
    channel_id,
    since: "2026-09-22",
    until_exclusive: "2026-09-29",
  }))
  const coverage_basis = { routes: {} }
  const plan = {
    schema: "research-daily-plan/v1",
    run_id: "daily-example",
    windows,
    coverage_basis,
    coverage_basis_sha256: sha256(JSON.stringify(coverage_basis)),
  }
  const receipts = [
    { ...windows[0], status: "window_scanned" },
    { ...windows[1], status: "failed" },
  ]
  const coverage = coverageGrid([
    { ...activeRoutes[0].route, status: "partial" },
    { ...activeRoutes[1].route, status: "failed" },
  ])
  const summary = {
    schema: "research-daily-summary/v1",
    run_id: plan.run_id,
    status: "partial",
    routes: [
      { channel_id: "ai-ko", status: "window_scanned" },
      { channel_id: "robot-en", status: "incomplete" },
    ],
    coverage_grid: coverage,
    receipts: receipts.length,
  }
  assert.deepEqual(validateDailySearchCoverage(plan, summary, receipts, activeRoutes), coverage)
  assert.equal(coverage.filter((cell) => cell.status === "not_attempted").length, 30)
  assert.throws(
    () =>
      validateDailySearchCoverage(
        plan,
        { ...summary, coverage_grid: coverage.map((cell) => ({ ...cell, status: "partial" })) },
        receipts,
        activeRoutes,
      ),
    /coverage does not match/,
  )
  assert.throws(
    () => validateDailySearchCoverage(plan, summary, receipts.slice(0, 1), activeRoutes),
    /intact plan and summary/,
  )
  assert.throws(
    () =>
      validateDailySearchCoverage(
        { ...plan, windows: windows.slice(0, 1) },
        summary,
        receipts,
        activeRoutes,
      ),
    /routes differ/,
  )
})
