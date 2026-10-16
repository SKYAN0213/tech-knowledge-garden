import fs from "node:fs"
import path from "node:path"
import { registry } from "./discovery.mjs"
import { collectionArticleProfiles, collectionBasis, collectionRoute } from "./scan-basis.mjs"
import { executeListScan } from "./list-scan-command.mjs"
import { readRecoverySource } from "./source-run-recovery.mjs"
import { freezeStoredSourceFrontier, saveCollectionReport } from "./collection-report.mjs"
import { verifyStoredListScan, verifyStoredPartialCandidates } from "./scan-evidence.mjs"
import { storedListScan } from "./daily-scan.mjs"
import { sha256 } from "./contracts.mjs"
import { atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"

const keyOf = (row) => JSON.stringify([row.channel_id, row.since, row.until_exclusive])
const actionFor = (reason) => reason === "detail_incomplete" ? "repair_details" :
  reason === "detail_budget_exceeded" ? "continue_details" :
  reason === "feed_cutoff_not_reached" ? "archive_fallback" :
  reason === "archive_duplicate_across_pages" ? "repair_pagination" : "recheck_listing"

export async function recoverCollection({
  repo = process.cwd(), root, runId, mode, reportPath, reportSha256,
  channels, sourceRuns, maxRoutes = 10, maxAttempts, timeBudgetMs = 600000,
  retryIncomplete = false,
  scan = async (parameters) => { await executeListScan(parameters); return storedListScan(parameters.root, parameters.run) },
  publishReport = false,
}) {
  if (!/^[A-Za-z0-9_-]{1,70}$/.test(runId || "") || !["plan-only", "execute", "resume"].includes(mode) ||
      !Number.isSafeInteger(maxRoutes) || maxRoutes < 1 || maxRoutes > 250 ||
      !Number.isSafeInteger(timeBudgetMs) || timeBudgetMs < 1 || timeBudgetMs > 3600000 ||
      (channels !== undefined && (!Array.isArray(channels) || new Set(channels).size !== channels.length)))
    throw Error("Bounded collection recovery inputs required")
  const prefix = `collection-recovery/${runId}/`
  return withLock(root, "collection-recovery-" + runId, async () => {
    const existing = readJSON(root, prefix + "plan.json")
    channels ??= existing?.channels || []
    sourceRuns ??= existing?.source_runs || {}
    if (!sourceRuns || typeof sourceRuns !== "object" || Array.isArray(sourceRuns) ||
        Object.entries(sourceRuns).some(([channel, run]) => !/^[A-Za-z0-9_-]{1,100}$/.test(channel) || !/^[A-Za-z0-9_-]{1,100}$/.test(run)))
      throw Error("Exact checkpoint source overrides required")
    maxAttempts ??= existing?.max_attempts_per_route || 3
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10)
      throw Error("Recovery attempts must be within 1..10")
    reportPath ||= existing?.report.path
    reportSha256 ||= existing?.report.sha256
    if (!/^[a-f0-9]{64}$/.test(reportSha256 || "")) throw Error("Exact collection report SHA required")
    const bytes = fs.readFileSync(safePath(root, reportPath))
    if (sha256(bytes) !== reportSha256) throw Error("Collection recovery report changed")
    const report = JSON.parse(bytes)
    if (report.schema !== "research-collection-report/v1" || !Array.isArray(report.routes) || !Array.isArray(report.evidence))
      throw Error("Stored collection report required")
    const acquisition = JSON.parse(fs.readFileSync(path.join(repo, "data/research-acquisition.json")))
    const config = (name) => JSON.parse(fs.readFileSync(path.join(repo, `data/research-${name}.json`)))
    const routes = registry(config("source-channels"), config("watchlist"), acquisition, config("source-recipes"))
    const targets = report.routes.flatMap((route) => route.windows.filter((window) =>
      window.status === "incomplete" && (!channels.length || channels.includes(route.channel_id)),
    ).map((window) => {
      const attempt = window.attempts.at(-1), reportRun = attempt.run_id
      const original = readRecoverySource(root, reportRun)
      const pin = report.evidence.find((p) => p.path === `runs/${reportRun}/list-scan.json`)
      if (!pin || pin.sha256 !== sha256(fs.readFileSync(safePath(root, pin.path))) ||
          original.summary.channel_id !== route.channel_id || original.summary.window.since !== window.since ||
          original.summary.window.until_exclusive !== window.until_exclusive)
        throw Error("Recovery target differs from the frozen report")
      for (const proof of original.reference.evidence) {
        const expected = report.evidence.find((p) => p.path === proof.path)
        if (!expected || expected.sha256 !== proof.sha256) throw Error("Recovery source evidence differs from the report")
      }
      const sourceRun = sourceRuns[route.channel_id] || reportRun
      const source = sourceRun === reportRun ? original : readRecoverySource(root, sourceRun)
      if (source.summary.channel_id !== route.channel_id || source.summary.window.since !== window.since || source.summary.window.until_exclusive !== window.until_exclusive)
        throw Error("Checkpoint override must retain the exact report route and window")
      const registered = routes.find((r) => r.channel_id === route.channel_id)
      if (!registered || registered.collection_mode !== "automatic" || (registered.onboarding && !registered.onboarding.collection_enabled))
        throw Error("Recovery cannot enable an inactive source")
      const channel = collectionRoute(registered)
      return {
        channel_id: route.channel_id, since: window.since, until_exclusive: window.until_exclusive,
        source_run: sourceRun, source_policy_recheck_limit: source.input.policy_recheck_limit,
        ...(sourceRun !== reportRun ? { report_source_run: reportRun, report_source_reference: original.reference } : {}),
        source_reference: source.reference, reason: source.summary.reason, action: actionFor(source.summary.reason),
        current_basis: collectionBasis(channel, collectionArticleProfiles(channel, acquisition.article_profiles), repo),
      }
    }))
    if (channels.some((id) => !targets.some((r) => r.channel_id === id)))
      throw Error("Recovery only accepts incomplete report routes")
    if (Object.keys(sourceRuns).some((id) => !targets.some((r) => r.channel_id === id)))
      throw Error("Checkpoint overrides only apply to incomplete recovery targets")
    const input = {
      schema: "research-collection-recovery-plan/v1", run_id: runId,
      report: { path: reportPath, sha256: reportSha256 }, channels, source_runs: sourceRuns, max_attempts_per_route: maxAttempts,
      implementation_sha256: sha256(fs.readFileSync(new URL(import.meta.url))), targets,
    }
    if (existing && JSON.stringify(existing) !== JSON.stringify(input))
      throw Error("Recovery plan changed; create a new recovery run")
    if (mode === "resume" && !existing) throw Error("Resume requires a stored recovery plan")
    if (!existing) atomicWrite(root, prefix + "plan.json", input)
    const state = readJSON(root, prefix + "state.json") || { schema: "research-collection-recovery-state/v1", plan_sha256: sha256(JSON.stringify(input)), attempts: [] }
    if (state.plan_sha256 !== sha256(JSON.stringify(input))) throw Error("Recovery state belongs to a different plan")
    if (mode === "plan-only") return { ...input, status: "planned", candidate_approved: false, candidate_published: false }
    const started = performance.now(), executed = []
    for (const [index, target] of targets.entries()) {
      if (executed.length >= maxRoutes || performance.now() - started >= timeBudgetMs) break
      const attempts = state.attempts.filter((a) => a.window_key === keyOf(target)), last = attempts.at(-1)
      if (last?.status === "window_scanned") {
        verifyStoredListScan(root, storedListScan(root, last.run_id), target)
        continue
      }
      if (last && last.status !== "running" && (!last.continuable && !retryIncomplete || attempts.length >= maxAttempts)) continue
      const attempt = last?.status === "running" ? last : {
        window_key: keyOf(target), run_id: `${runId}_r${index + 1}_a${attempts.length + 1}`,
        source_run: last?.run_id || target.source_run, status: "running",
      }
      if (last !== attempt) state.attempts.push(attempt)
      atomicWrite(root, prefix + "state.json", state)
      try {
        const result = await scan({
          root, run: attempt.run_id, channel: [target.channel_id], since: target.since, until: target.until_exclusive,
          "recovery-source-run": attempt.source_run, "policy-recheck-limit": 0,
        })
        if (result.summary.status === "window_scanned") verifyStoredListScan(root, result, target)
        else if (result.candidates.length) verifyStoredPartialCandidates(root, result, target)
        const deferred = (result.summary.details || []).filter((d) => d.status === "deferred_by_budget").length
        Object.assign(attempt, {
          status: result.summary.status, reason: result.summary.reason, candidate_count: result.candidates.length,
          deferred_details: deferred, continuable: deferred > 0,
          finished_at: new Date().toISOString(),
        })
        delete attempt.error
      } catch (error) {
        // The native scan retains its settled stages for an explicit resume.
        attempt.error = { message: error.message, code: error.code || null,
          ...(error.storage_request ? { storage_request: error.storage_request } : {}) }
        atomicWrite(root, prefix + "state.json", state)
        executed.push({ ...attempt })
        continue
      }
      executed.push({ ...attempt })
      atomicWrite(root, prefix + "state.json", state)
    }
    let updatedReport = null, reportWait = null
    const settled = state.attempts.filter((a) => ["window_scanned", "incomplete"].includes(a.status))
    const reportable = settled.filter((a) => {
      const native = readJSON(root, `runs/${a.run_id}/state.json`)
      return native && Object.values(native.stages || {}).every((stage) => stage.status === "complete")
    })
    if (publishReport && reportable.length) {
      try {
      const oldRuns = report.routes.flatMap((r) => r.windows.flatMap((w) => w.attempts.map((a) => a.run_id)))
      // A frontier has one native observation per window. Keep the immutable
      // original report and recovery history, and project the latest attempt
      // for a repaired window into the new frontier rather than duplicating it.
      const latest = new Map()
      for (const id of oldRuns) {
        const source = readRecoverySource(root, id)
        latest.set(keyOf({ channel_id: source.summary.channel_id, ...source.summary.window }), id)
      }
      for (const attempt of reportable)
        latest.set(attempt.window_key, attempt.run_id)
      const runs = [...latest.values()]
      const sourceRuns = runs.map((id) => {
        const source = readRecoverySource(root, id)
        return { run_id: id, ...(source.input.policy_recheck_limit === undefined ? {} : { policy_recheck_limit: source.input.policy_recheck_limit }) }
      })
      const id = `${runId}_report_${sha256(JSON.stringify(sourceRuns)).slice(0, 10)}`
      await freezeStoredSourceFrontier({ root, runId: id, sourceRuns })
      updatedReport = await saveCollectionReport({ root, runId: id })
      } catch (error) {
        if (error.code !== "STORAGE_PENDING") throw error
        reportWait = { status: "waiting_for_storage", storage_request: error.storage_request }
      }
    }
    const completed = targets.filter((target) => state.attempts.some((a) => a.window_key === keyOf(target) && a.status === "window_scanned")).length
    const result = {
      schema: "research-collection-recovery-result/v1", run_id: runId,
      status: completed === targets.length ? "complete" : "partial", counts: { planned: targets.length, completed, remaining: targets.length - completed, executed: executed.length },
      attempts: state.attempts, report: updatedReport,
      base_report: input.report,
      report_sources: targets.flatMap((target) => {
        const last = reportable.filter((a) => a.window_key === keyOf(target)).at(-1)
        return last ? [{ run_id: last.run_id, policy_recheck_limit: 0 }] : []
      }),
      ...(reportWait ? { report_wait: reportWait } : {}),
      unreported_attempts: settled.filter((a) => !reportable.includes(a)).map((a) => ({ run_id: a.run_id, reason: "unsettled_native_checkpoints" })),
      candidate_approved: false, candidate_published: false,
    }
    atomicWrite(root, prefix + "result.json", result)
    return result
  })
}
