import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { validDay } from "./list-scan.mjs"
import { readJSON, safePath } from "./run-state.mjs"

const exactId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value)
const windowKey = (row) => JSON.stringify([row.channel_id, row.since, row.until_exclusive])
const attemptId = (run, window, number) =>
  `${run}_${window.channel_id}_${window.since.replaceAll("-", "")}_${window.until_exclusive.replaceAll("-", "")}_a${number}`

function inspectProcess(pid) {
  try {
    process.kill(pid, 0)
    return "alive"
  } catch (error) {
    if (error.code === "ESRCH") return "missing_handle"
    if (error.code === "EPERM") return "unobservable"
    throw error
  }
}

function acquisitionOwner(root, processState) {
  try {
    const lock = readJSON(root, "locks/daily-acquisition.json")
    if (!lock) return { state: "not_locked", bound_run: null }
    if (
      !Number.isSafeInteger(lock.pid) ||
      lock.pid < 1 ||
      !Number.isFinite(Date.parse(lock.started_at || "")) ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(lock.owner || "")
    )
      throw Error("Invalid acquisition owner")
    // The existing lock does not bind a run ID. Never attach its process to
    // the newest plan: a different run or a preflight can own this lock.
    return {
      state: processState(lock.pid),
      pid: lock.pid,
      started_at: lock.started_at,
      bound_run: null,
    }
  } catch (error) {
    if (error.code === "ENOENT") return { state: "not_locked", bound_run: null }
    return { state: "unobservable", bound_run: null, reason: error.message }
  }
}

// A cheap, read-only progress view. Receipt identities and pinned planning
// bytes are checked here; raw source/approval validation remains in the daily
// scanner and full delivery status, and is not promoted from these counters.
export function loadDailyAcquisitionStatus(
  root,
  { runId = null, processState = inspectProcess } = {},
) {
  if (runId !== null && !exactId(runId)) throw Error("Exact daily run ID required")
  const result = {
    schema: "research-daily-acquisition-status/v1",
    observed_at: new Date().toISOString(),
    acquisition_owner: acquisitionOwner(root, processState),
    source_evidence_verified: false,
    candidate_approved: false,
    candidate_published: false,
    drive_verified: false,
    public_verified: false,
  }
  try {
    if (runId === null) {
      const directory = safePath(root, "daily/runs")
      if (!fs.existsSync(directory)) return { ...result, status: "missing_plan", run_id: null }
      const plans = fs
        .readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && exactId(entry.name))
        .map((entry) => ({
          id: entry.name,
          file: safePath(root, `daily/runs/${entry.name}/plan.json`),
        }))
        .filter((entry) => fs.existsSync(entry.file))
        .sort(
          (a, b) =>
            fs.statSync(b.file).mtimeMs - fs.statSync(a.file).mtimeMs || b.id.localeCompare(a.id),
        )
      runId = plans[0]?.id || null
    }
    if (!runId) return { ...result, status: "missing_plan", run_id: null }
    const base = `daily/runs/${runId}/`
    const plan = readJSON(root, base + "plan.json")
    if (!plan) return { ...result, status: "missing_plan", run_id: runId }
    if (
      plan.schema !== "research-daily-plan/v1" ||
      plan.run_id !== runId ||
      !/^[a-f0-9]{64}$/.test(plan.config_sha256 || "") ||
      !Number.isFinite(Date.parse(plan.created_at || "")) ||
      !Array.isArray(plan.windows) ||
      !plan.windows.length ||
      plan.windows.some(
        (row) =>
          !exactId(row.channel_id) ||
          !validDay(row.since) ||
          !validDay(row.until_exclusive) ||
          row.since >= row.until_exclusive,
      ) ||
      new Set(plan.windows.map(windowKey)).size !== plan.windows.length
    )
      throw Error("Stored acquisition plan identity is invalid")
    const inputs = readJSON(root, `evaluation/shadow-inputs/${runId}/inputs.json`)
    if (
      inputs &&
      (inputs.schema !== "research-shadow-collection-inputs/v1" ||
        inputs.daily_run !== runId ||
        inputs.config_sha256 !== plan.config_sha256 ||
        inputs.plan?.path !== base + "plan.json" ||
        inputs.plan.sha256 !== sha256(fs.readFileSync(safePath(root, base + "plan.json"))))
    )
      throw Error("Acquisition plan differs from its frozen input")
    const directory = safePath(root, base + "receipts")
    const names = fs.existsSync(directory)
      ? fs.readdirSync(directory).filter((name) => name.endsWith(".json"))
      : []
    const receipts = names.map((name) => ({ name, row: readJSON(root, base + "receipts/" + name) }))
    const seen = new Set(),
      windows = new Map(plan.windows.map((row) => [windowKey(row), []]))
    for (const { name, row } of receipts) {
      const number = Number(row?.attempt_id?.match(/_a([1-9]\d*)$/)?.[1])
      if (
        !["research-daily-receipt/v1", "research-daily-receipt/v2"].includes(row?.schema) ||
        row.daily_run !== runId ||
        !windows.has(windowKey(row)) ||
        !Number.isSafeInteger(number) ||
        row.attempt_id !== attemptId(runId, row, number) ||
        name !== row.attempt_id + ".json" ||
        seen.has(row.attempt_id) ||
        !["window_scanned", "incomplete", "blocked"].includes(row.status) ||
        !Number.isFinite(Date.parse(row.started_at || "")) ||
        !Number.isFinite(Date.parse(row.finished_at || "")) ||
        row.started_at > row.finished_at
      )
        throw Error("Acquisition receipt identity differs from its plan")
      seen.add(row.attempt_id)
      windows.get(windowKey(row)).push(row)
    }
    const routes = [...new Set(plan.windows.map((row) => row.channel_id))].map((channel_id) => {
      const rows = plan.windows.filter((row) => row.channel_id === channel_id)
      let scanned = 0,
        incomplete = 0,
        pending = 0
      for (const row of rows) {
        const attempts = windows.get(windowKey(row))
        if (attempts.some((attempt) => attempt.status === "window_scanned")) scanned++
        else if (attempts.length) incomplete++
        else pending++
      }
      return {
        channel_id,
        planned_windows: rows.length,
        observed_scanned_windows: scanned,
        observed_incomplete_windows: incomplete,
        pending_windows: pending,
      }
    })
    const sum = (key) => routes.reduce((total, row) => total + row[key], 0)
    const checkpointDirectory = safePath(root, "runs")
    const checkpoints = []
    if (fs.existsSync(checkpointDirectory)) {
      const prefixes = plan.windows.map((row) => attemptId(runId, row, 1).slice(0, -1))
      for (const entry of fs.readdirSync(checkpointDirectory, { withFileTypes: true })) {
        if (!entry.isDirectory() || !exactId(entry.name)) continue
        const prefix = prefixes.find((value) => entry.name.startsWith(value))
        if (!prefix || !/^[1-9]\d*$/.test(entry.name.slice(prefix.length))) continue
        const state = readJSON(root, `runs/${entry.name}/state.json`)
        if (!state) continue
        if (
          state.schema !== "research-run/v1" ||
          state.run_id !== entry.name ||
          !/^[a-f0-9]{64}$/.test(state.input_hash || "") ||
          !state.stages ||
          typeof state.stages !== "object" ||
          Array.isArray(state.stages) ||
          Object.values(state.stages).some(
            (stage) => !["running", "complete", "failed"].includes(stage?.status),
          )
        )
          throw Error("Acquisition checkpoint identity is invalid")
        checkpoints.push({
          attempt_id: entry.name,
          recorded_complete_stages: Object.values(state.stages).filter(
            (stage) => stage.status === "complete",
          ).length,
          recorded_failed_stages: Object.values(state.stages).filter(
            (stage) => stage.status === "failed",
          ).length,
          recorded_running_stages: Object.entries(state.stages)
            .filter(([, stage]) => stage.status === "running")
            .map(([stage, row]) => ({ stage, started_at: row.started_at || null })),
        })
      }
    }
    const summary = readJSON(root, base + "summary.json")
    if (summary && (summary.schema !== "research-daily-summary/v1" || summary.run_id !== runId))
      throw Error("Acquisition summary identity differs from its plan")
    return {
      ...result,
      status: "receipt_progress_observation",
      run_id: runId,
      created_at: plan.created_at,
      config_sha256: plan.config_sha256,
      collection_inputs_frozen: Boolean(inputs),
      recorded_summary: summary
        ? {
            status: summary.status,
            receipts: summary.receipts,
            matches_observed_receipt_count: summary.receipts === receipts.length,
          }
        : null,
      planned_routes: routes.length,
      planned_windows: plan.windows.length,
      observed_receipts: receipts.length,
      observed_scanned_windows: sum("observed_scanned_windows"),
      observed_incomplete_windows: sum("observed_incomplete_windows"),
      pending_windows: sum("pending_windows"),
      latest_receipt_at:
        receipts
          .map(({ row }) => row.finished_at)
          .sort()
          .at(-1) || null,
      routes,
      // A recorded running stage may belong to an interrupted process. This
      // is a checkpoint observation, not a verified live worker handle.
      checkpoints,
    }
  } catch (error) {
    return {
      ...result,
      status: "evidence_invalid",
      run_id: runId,
      reason: error.message,
      observed_scanned_windows: null,
      pending_windows: null,
    }
  }
}
