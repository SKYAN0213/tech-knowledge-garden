import fs from "node:fs"
import path from "node:path"
import { registry } from "./discovery.mjs"
import { collectionArticleProfiles, collectionBasis, collectionRoute } from "./scan-basis.mjs"
import { executeListScan } from "./list-scan-command.mjs"
import { readRecoverySource } from "./source-run-recovery.mjs"
import { freezeStoredSourceFrontier, saveCollectionReport } from "./collection-report.mjs"
import { verifyStoredListScan, verifyStoredPartialCandidates } from "./scan-evidence.mjs"
import { storedListScan, verifiedDailyScan, reconcileSupplementalScan } from "./daily-scan.mjs"
import { sha256 } from "./contracts.mjs"
import { atomicWrite, readJSON, safePath, withLock, withGardenOperationLock } from "./run-state.mjs"
import {
  collectionOutcome,
  collectionSourceDecision,
  recordCollectionOutcome,
} from "./collection-resilience.mjs"

const keyOf = (row) => JSON.stringify([row.channel_id, row.since, row.until_exclusive])
const actionFor = (reason) =>
  reason === "detail_incomplete"
    ? "repair_details"
    : reason === "detail_budget_exceeded"
      ? "continue_details"
      : reason === "feed_cutoff_not_reached"
        ? "archive_fallback"
        : reason === "archive_duplicate_across_pages"
          ? "repair_pagination"
          : "recheck_listing"

// The first plan authenticates every referenced source. Later slices compare
// its small immutable checkpoint files; only the selected source is hydrated
// and byte-verified by the native recovery scanner. Publication/report gates
// still perform their existing complete checks.
function recoveryMetadata(root, runId, reference) {
  if (reference?.source_run !== runId) throw Error("Recovery metadata run changed")
  const pins = new Map(reference.evidence.map((p) => [p.path, p.sha256]))
  const load = (name) => {
    const file = `runs/${runId}/${name}.json`,
      expected = pins.get(file)
    if (!expected) throw Error("Recovery metadata pin is missing")
    const bytes = fs.readFileSync(safePath(root, file))
    if (sha256(bytes) !== expected) throw Error("Recovery metadata changed")
    return JSON.parse(bytes)
  }
  const state = load("state"),
    basis = load("collection-basis"),
    summary = load("list-scan")
  if (
    state.run_id !== runId ||
    state.input_hash !== reference.input_sha256 ||
    basis.channel_id !== summary.channel_id
  )
    throw Error("Recovery metadata identity differs")
  const input = pins.has(`runs/${runId}/collection-input.json`) ? load("collection-input") : {}
  return { state, basis, summary, input, reference }
}

export async function recoverCollection({
  repo = process.cwd(),
  root,
  runId,
  mode,
  reportPath,
  reportSha256,
  channels,
  sourceRuns,
  maxRoutes = 10,
  maxAttempts,
  timeBudgetMs = 600000,
  retryIncomplete = false,
  scan = async (parameters) => {
    const execution = await executeListScan(parameters)
    return {
      ...storedListScan(parameters.root, parameters.run),
      collection_notification: execution.notification,
    }
  },
  publishReport = false,
  reconcileCoverage,
  backlogFile,
}) {
  if (
    !/^[A-Za-z0-9_-]{1,70}$/.test(runId || "") ||
    !["plan-only", "execute", "resume"].includes(mode) ||
    !Number.isSafeInteger(maxRoutes) ||
    maxRoutes < 1 ||
    maxRoutes > 250 ||
    !Number.isSafeInteger(timeBudgetMs) ||
    timeBudgetMs < 1 ||
    timeBudgetMs > 3600000 ||
    (channels !== undefined &&
      (!Array.isArray(channels) || new Set(channels).size !== channels.length))
  )
    throw Error("Bounded collection recovery inputs required")
  const prefix = `collection-recovery/${runId}/`
  return withLock(root, "collection-recovery-" + runId, async () => {
    const existing = readJSON(root, prefix + "plan.json")
    reconcileCoverage ??= existing?.reconcile_coverage || false
    backlogFile ??= existing?.backlog_file
    if (reconcileCoverage && (typeof backlogFile !== "string" || !backlogFile.trim()))
      throw Error("Coverage reconciliation requires an explicit backlog")
    channels ??= existing?.channels || []
    sourceRuns ??= existing?.source_runs || {}
    if (
      !sourceRuns ||
      typeof sourceRuns !== "object" ||
      Array.isArray(sourceRuns) ||
      Object.entries(sourceRuns).some(
        ([channel, run]) =>
          !/^[A-Za-z0-9_-]{1,100}$/.test(channel) || !/^[A-Za-z0-9_-]{1,100}$/.test(run),
      )
    )
      throw Error("Exact checkpoint source overrides required")
    maxAttempts ??= existing?.max_attempts_per_route || 3
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10)
      throw Error("Recovery attempts must be within 1..10")
    reportPath ||= existing?.report.path
    reportSha256 ||= existing?.report.sha256
    if (!/^[a-f0-9]{64}$/.test(reportSha256 || ""))
      throw Error("Exact collection report SHA required")
    const bytes = fs.readFileSync(safePath(root, reportPath))
    if (sha256(bytes) !== reportSha256) throw Error("Collection recovery report changed")
    const report = JSON.parse(bytes)
    if (
      report.schema !== "research-collection-report/v1" ||
      !Array.isArray(report.routes) ||
      !Array.isArray(report.evidence)
    )
      throw Error("Stored collection report required")
    const reportPins = new Map(report.evidence.map((pin) => [pin.path, pin]))
    const bases = new Map()
    const acquisition = JSON.parse(
      fs.readFileSync(path.join(repo, "data/research-acquisition.json")),
    )
    const config = (name) =>
      JSON.parse(fs.readFileSync(path.join(repo, `data/research-${name}.json`)))
    const routes = registry(
      config("source-channels"),
      config("watchlist"),
      acquisition,
      config("source-recipes"),
    )
    const targets = report.routes.flatMap((route) =>
      route.windows
        .filter(
          (window) =>
            window.status === "incomplete" &&
            (!channels.length || channels.includes(route.channel_id)),
        )
        .map((window) => {
          const attempt = window.attempts.at(-1),
            reportRun = attempt.run_id
          const saved = existing?.targets.find(
            (t) => keyOf(t) === keyOf({ channel_id: route.channel_id, ...window }),
          )
          const original = saved
            ? recoveryMetadata(
                root,
                reportRun,
                saved.report_source_reference || saved.source_reference,
              )
            : readRecoverySource(root, reportRun)
          const pin = reportPins.get(`runs/${reportRun}/list-scan.json`)
          if (
            !pin ||
            pin.sha256 !== sha256(fs.readFileSync(safePath(root, pin.path))) ||
            original.summary.channel_id !== route.channel_id ||
            original.summary.window.since !== window.since ||
            original.summary.window.until_exclusive !== window.until_exclusive
          )
            throw Error("Recovery target differs from the frozen report")
          for (const proof of original.reference.evidence) {
            const expected = reportPins.get(proof.path)
            if (!expected || expected.sha256 !== proof.sha256)
              throw Error("Recovery source evidence differs from the report")
          }
          const sourceRun = sourceRuns[route.channel_id] || reportRun
          const source =
            sourceRun === reportRun
              ? original
              : saved
                ? recoveryMetadata(root, sourceRun, saved.source_reference)
                : readRecoverySource(root, sourceRun)
          if (
            source.summary.channel_id !== route.channel_id ||
            source.summary.window.since !== window.since ||
            source.summary.window.until_exclusive !== window.until_exclusive
          )
            throw Error("Checkpoint override must retain the exact report route and window")
          const registered = routes.find((r) => r.channel_id === route.channel_id)
          if (
            !registered ||
            registered.collection_mode !== "automatic" ||
            (registered.onboarding && !registered.onboarding.collection_enabled)
          )
            throw Error("Recovery cannot enable an inactive source")
          const channel = collectionRoute(registered)
          if (!bases.has(route.channel_id))
            bases.set(
              route.channel_id,
              collectionBasis(
                channel,
                collectionArticleProfiles(channel, acquisition.article_profiles),
                repo,
              ),
            )
          return {
            channel_id: route.channel_id,
            since: window.since,
            until_exclusive: window.until_exclusive,
            source_run: sourceRun,
            source_policy_recheck_limit: source.input.policy_recheck_limit,
            ...(sourceRun !== reportRun
              ? { report_source_run: reportRun, report_source_reference: original.reference }
              : {}),
            source_reference: source.reference,
            reason: source.summary.reason,
            action: actionFor(source.summary.reason),
            current_basis: bases.get(route.channel_id),
          }
        }),
    )
    if (channels.some((id) => !targets.some((r) => r.channel_id === id)))
      throw Error("Recovery only accepts incomplete report routes")
    if (Object.keys(sourceRuns).some((id) => !targets.some((r) => r.channel_id === id)))
      throw Error("Checkpoint overrides only apply to incomplete recovery targets")
    const input = {
      schema: "research-collection-recovery-plan/v1",
      run_id: runId,
      report: { path: reportPath, sha256: reportSha256 },
      channels,
      source_runs: sourceRuns,
      max_attempts_per_route: maxAttempts,
      ...(reconcileCoverage ? { reconcile_coverage: true, backlog_file: backlogFile } : {}),
      implementation_sha256: sha256(fs.readFileSync(new URL(import.meta.url))),
      targets,
    }
    if (existing && JSON.stringify(existing) !== JSON.stringify(input))
      throw Error("Recovery plan changed; create a new recovery run")
    if (mode === "resume" && !existing) throw Error("Resume requires a stored recovery plan")
    if (!existing) atomicWrite(root, prefix + "plan.json", input)
    const state = readJSON(root, prefix + "state.json") || {
      schema: "research-collection-recovery-state/v1",
      plan_sha256: sha256(JSON.stringify(input)),
      attempts: [],
    }
    if (state.plan_sha256 !== sha256(JSON.stringify(input)))
      throw Error("Recovery state belongs to a different plan")
    if (mode === "plan-only")
      return { ...input, status: "planned", candidate_approved: false, candidate_published: false }
    const started = performance.now(),
      executed = [],
      waitingSources = [],
      notifications = []
    const reconcile = async (attempt) => {
      if (!reconcileCoverage || attempt.coverage_reconciliation) return
      try {
        attempt.coverage_reconciliation = await withGardenOperationLock(root, () =>
          reconcileSupplementalScan({
            root,
            scanRun: attempt.run_id,
            backlogFile,
            reconciliationRun: runId + "_coverage_" + sha256(attempt.window_key).slice(0, 12),
          }),
        )
        delete attempt.coverage_error
      } catch (error) {
        attempt.coverage_error = {
          message: error.message,
          code: error.code || null,
          ...(error.storage_request ? { storage_request: error.storage_request } : {}),
        }
      }
      atomicWrite(root, prefix + "state.json", state)
    }
    for (const [index, target] of targets.entries()) {
      if (executed.length >= maxRoutes || performance.now() - started >= timeBudgetMs) break
      const attempts = state.attempts.filter((a) => a.window_key === keyOf(target)),
        last = attempts.at(-1)
      if (last?.status === "window_scanned") {
        verifiedDailyScan(root, last.run_id, target)
        await reconcile(last)
        continue
      }
      const failureAttempts = attempts.filter(
        (a) => a.status !== "running" && !a.continuable,
      ).length
      if (
        last &&
        last.status !== "running" &&
        ((!last.continuable && !retryIncomplete) || failureAttempts >= maxAttempts)
      )
        continue
      const decision = collectionSourceDecision(root, target.channel_id, target.current_basis)
      if (!decision.allowed) {
        waitingSources.push({
          channel_id: target.channel_id,
          since: target.since,
          until_exclusive: target.until_exclusive,
          next_check_at: decision.next_check_at,
          next_action: decision.next_action,
        })
        continue
      }
      const attempt =
        last?.status === "running"
          ? last
          : {
              window_key: keyOf(target),
              run_id: `${runId}_r${index + 1}_a${attempts.length + 1}`,
              source_run: last?.run_id || target.source_run,
              status: "running",
            }
      if (last !== attempt) state.attempts.push(attempt)
      atomicWrite(root, prefix + "state.json", state)
      try {
        const result = await scan({
          root,
          run: attempt.run_id,
          channel: [target.channel_id],
          since: target.since,
          until: target.until_exclusive,
          "recovery-source-run": attempt.source_run,
          "policy-recheck-limit": 0,
        })
        if (result.summary.status === "window_scanned")
          verifiedDailyScan(root, attempt.run_id, target)
        else if (result.candidates.length) verifyStoredPartialCandidates(root, result, target)
        const assessment = collectionOutcome(result)
        const health = await recordCollectionOutcome(root, {
          channel_id: target.channel_id,
          run_id: attempt.run_id,
          basis: target.current_basis,
          result,
          evidence: {
            path: `runs/${attempt.run_id}/list-scan.json`,
            sha256: sha256(
              fs.readFileSync(safePath(root, `runs/${attempt.run_id}/list-scan.json`)),
            ),
          },
        })
        const notification = health.notification || result.collection_notification
        if (notification) notifications.push(notification)
        Object.assign(attempt, {
          status: result.summary.status,
          reason: result.summary.reason,
          candidate_count: result.candidates.length,
          deferred_details: assessment.deferred_details,
          continuable: assessment.continuable === true,
          classification: assessment.kind,
          next_action: assessment.next_action,
          finished_at: new Date().toISOString(),
        })
        delete attempt.error
        if (attempt.status === "window_scanned") await reconcile(attempt)
      } catch (error) {
        // The native scan retains its settled stages for an explicit resume.
        attempt.error = {
          message: error.message,
          code: error.code || null,
          ...(error.storage_request ? { storage_request: error.storage_request } : {}),
          ...(error.source_wait ? { source_wait: error.source_wait } : {}),
        }
        atomicWrite(root, prefix + "state.json", state)
        executed.push({ ...attempt })
        continue
      }
      executed.push({ ...attempt })
      atomicWrite(root, prefix + "state.json", state)
    }
    let updatedReport = null,
      reportWait = null
    const settled = state.attempts.filter((a) =>
      ["window_scanned", "incomplete"].includes(a.status),
    )
    const reportable = settled.filter((a) => {
      const native = readJSON(root, `runs/${a.run_id}/state.json`)
      return (
        native && Object.values(native.stages || {}).every((stage) => stage.status === "complete")
      )
    })
    if (publishReport && reportable.length) {
      try {
        const oldRuns = report.routes.flatMap((r) =>
          r.windows.flatMap((w) => w.attempts.map((a) => a.run_id)),
        )
        // A frontier has one native observation per window. Keep the immutable
        // original report and recovery history, and project the latest attempt
        // for a repaired window into the new frontier rather than duplicating it.
        const latest = new Map()
        for (const id of oldRuns) {
          const source = readRecoverySource(root, id)
          latest.set(keyOf({ channel_id: source.summary.channel_id, ...source.summary.window }), id)
        }
        for (const attempt of reportable) latest.set(attempt.window_key, attempt.run_id)
        const runs = [...latest.values()]
        const sourceRuns = runs.map((id) => {
          const source = readRecoverySource(root, id)
          return {
            run_id: id,
            ...(source.input.policy_recheck_limit === undefined
              ? {}
              : { policy_recheck_limit: source.input.policy_recheck_limit }),
          }
        })
        const id = `${runId}_report_${sha256(JSON.stringify(sourceRuns)).slice(0, 10)}`
        await freezeStoredSourceFrontier({ root, runId: id, sourceRuns })
        updatedReport = await saveCollectionReport({ root, runId: id })
      } catch (error) {
        if (error.code !== "STORAGE_PENDING") throw error
        reportWait = { status: "waiting_for_storage", storage_request: error.storage_request }
      }
    }
    const completed = targets.filter((target) =>
      state.attempts.some((a) => a.window_key === keyOf(target) && a.status === "window_scanned"),
    ).length
    const coveragePending = reconcileCoverage
      ? state.attempts.filter((a) => a.status === "window_scanned" && !a.coverage_reconciliation)
          .length
      : 0
    const continuable = targets.filter((target) => {
      const last = state.attempts.filter((a) => a.window_key === keyOf(target)).at(-1)
      if (waitingSources.some((s) => keyOf(s) === keyOf(target))) return false
      return !last || last.continuable || (last.status === "running" && !last.error)
    })
    const coverageRunnable =
      reconcileCoverage &&
      state.attempts.some(
        (a) => a.status === "window_scanned" && !a.coverage_reconciliation && !a.coverage_error,
      )
    const result = {
      schema: "research-collection-recovery-result/v1",
      run_id: runId,
      status: completed === targets.length && !coveragePending ? "complete" : "partial",
      counts: {
        planned: targets.length,
        completed,
        remaining: targets.length - completed,
        executed: executed.length,
        coverage_pending: coveragePending,
      },
      attempts: state.attempts,
      report: updatedReport,
      waiting_sources: waitingSources,
      notifications,
      next_actions:
        continuable.length || coverageRunnable
          ? [
              {
                module: "collection",
                operation: "recover",
                parameters: {
                  run_id: runId,
                  mode: "resume",
                  max_routes: maxRoutes,
                  time_budget_ms: timeBudgetMs,
                },
              },
            ]
          : [],
      required_actions: state.attempts.flatMap((attempt) => {
        const last = state.attempts.filter((a) => a.window_key === attempt.window_key).at(-1)
        if (last !== attempt) return []
        if (attempt.error || attempt.coverage_error)
          return [
            {
              run_id: attempt.run_id,
              kind:
                (attempt.error || attempt.coverage_error).code === "STORAGE_PENDING"
                  ? "storage_wait"
                  : "inspect_saved_error",
              error: attempt.error || attempt.coverage_error,
            },
          ]
        return attempt.status !== "window_scanned" && !attempt.continuable
          ? [
              {
                run_id: attempt.run_id,
                kind: attempt.classification,
                next_action: attempt.next_action,
              },
            ]
          : []
      }),
      failure_attempts: state.attempts.filter(
        (a) => !["running", "window_scanned"].includes(a.status) && !a.continuable,
      ).length,
      continuation_batches: state.attempts.filter((a) => a.continuable).length,
      base_report: input.report,
      report_sources: targets.flatMap((target) => {
        const last = reportable.filter((a) => a.window_key === keyOf(target)).at(-1)
        return last ? [{ run_id: last.run_id, policy_recheck_limit: 0 }] : []
      }),
      ...(reportWait ? { report_wait: reportWait } : {}),
      unreported_attempts: settled
        .filter((a) => !reportable.includes(a))
        .map((a) => ({ run_id: a.run_id, reason: "unsettled_native_checkpoints" })),
      candidate_approved: false,
      candidate_published: false,
    }
    atomicWrite(root, prefix + "result.json", result)
    return result
  })
}
