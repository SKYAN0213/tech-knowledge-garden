import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { storedListScan, supplementalCoverageReceiptForWindow } from "./daily-scan.mjs"
import { verifyStoredListScan, verifyStoredPartialCandidates } from "./scan-evidence.mjs"
import {
  readRecoverySource,
  recoveryListingObservedAt,
  verifyFreshRecoveryListing,
} from "./source-run-recovery.mjs"
import { buildCollectionReport, summarizeCollection } from "./collection-report.mjs"
import { collectionRecoveryRequest } from "./collection-resilience.mjs"

const idPattern = /^[A-Za-z0-9_-]{1,100}$/
const hashPattern = /^[a-f0-9]{64}$/
const keyOf = (value) => JSON.stringify([value.channel_id, value.since, value.until_exclusive])
const observationKey = (d) =>
  JSON.stringify([
    d.source_id,
    d.source_version_id,
    d.observed_at,
    d.request_method,
    d.fetch_status,
  ])
const captured = (d) => ["captured", "not_modified"].includes(d.fetch_status)
const kstDay = (timestamp) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(timestamp))

function checked(root, reference) {
  if (!reference || typeof reference.path !== "string" || !hashPattern.test(reference.sha256 || ""))
    throw Error("Exact recovered report evidence required")
  const bytes = fs.readFileSync(safePath(root, reference.path))
  if (sha256(bytes) !== reference.sha256) throw Error("Recovered report evidence changed")
  return JSON.parse(bytes)
}

function reference(root, file) {
  return { path: file, sha256: sha256(fs.readFileSync(safePath(root, file))) }
}

// Project only independently verified new scans over a hash-bound daily report.
// Receipt-only failures remain untouched; the original report is never edited.
export async function saveRecoveredDailyReport({
  root,
  runId,
  reportRunId = runId,
  baseReport,
  attempts,
  expectedPlanSha,
  expectedStateSha,
  frozenEvidence,
}) {
  if (
    !idPattern.test(runId || "") ||
    !idPattern.test(reportRunId || "") ||
    !Array.isArray(attempts)
  )
    throw Error("Exact recovered daily report inputs required")
  return withLock(root, "daily-acquisition", async () => {
    const base = checked(root, baseReport)
    if (
      base.schema !== "research-collection-report/v1" ||
      !idPattern.test(base.daily_run || "") ||
      !Array.isArray(base.routes) ||
      !Array.isArray(base.evidence) ||
      !Array.isArray(base.materials) ||
      !Array.isArray(base.pending_items) ||
      !Array.isArray(base.held_sources) ||
      !Array.isArray(base.missing) ||
      base.candidate_approved !== false ||
      base.candidate_published !== false ||
      !Number.isSafeInteger(base.counts?.reused_windows) ||
      base.counts.reused_windows < 0 ||
      !Number.isSafeInteger(base.resources?.referenced_raw_body_bytes) ||
      base.resources.referenced_raw_body_bytes < 0
    )
      throw Error("A complete frozen daily report is required")
    if (
      baseReport.path !==
      `daily/runs/${base.daily_run}/collection-reports/${baseReport.sha256}.json`
    )
      throw Error("Native immutable base collection report required")
    const planPath = `collection-recovery/${runId}/plan.json`
    const statePath = `collection-recovery/${runId}/state.json`
    const planBytes = fs.readFileSync(safePath(root, planPath))
    const frozen = frozenEvidence ? checked(root, frozenEvidence) : null
    const stateBytes = frozen
      ? Buffer.from(JSON.stringify(frozen.source_state, null, 2) + "\n")
      : fs.readFileSync(safePath(root, statePath))
    if (
      (expectedPlanSha && sha256(planBytes) !== expectedPlanSha) ||
      (expectedStateSha && sha256(stateBytes) !== expectedStateSha) ||
      (frozen &&
        (frozen.schema !== "research-recovered-daily-evidence/v1" ||
          frozen.source_recovery_run !== runId ||
          frozen.report_run !== reportRunId ||
          JSON.stringify(frozen.base_report) !== JSON.stringify(baseReport) ||
          frozen.source_state_sha256 !== sha256(stateBytes)))
    )
      throw Error("Recovered report plan or state SHA changed")
    const plan = JSON.parse(planBytes),
      state = JSON.parse(stateBytes)
    if (sha256(JSON.stringify(state, null, 2) + "\n") !== sha256(stateBytes))
      throw Error("Recovered report state is not in its native saved format")
    if (
      plan?.schema !== "research-collection-recovery-plan/v1" ||
      plan.run_id !== runId ||
      JSON.stringify(plan.report) !== JSON.stringify(baseReport) ||
      !Array.isArray(plan.targets) ||
      state?.schema !== "research-collection-recovery-state/v1" ||
      state.plan_sha256 !== sha256(JSON.stringify(plan)) ||
      !Array.isArray(state.attempts) ||
      attempts.some(
        (attempt) =>
          !state.attempts.some((saved) => JSON.stringify(saved) === JSON.stringify(attempt)),
      )
    )
      throw Error("Recovered report must retain its owning plan and saved attempts")
    const planRef = { path: planPath, sha256: sha256(planBytes) },
      stateSha = sha256(stateBytes)
    const pins = new Map()
    for (const pin of base.evidence) {
      if (pins.has(pin.path) && pins.get(pin.path).sha256 !== pin.sha256)
        throw Error("Conflicting frozen report evidence")
      pins.set(pin.path, pin)
    }
    const windows = base.routes.flatMap((route) =>
      route.windows.map((window) => ({
        route,
        window,
        key: keyOf({ channel_id: route.channel_id, ...window }),
      })),
    )
    if (
      new Set(windows.map((row) => row.key)).size !== windows.length ||
      base.counts?.planned_routes !== base.routes.length ||
      base.counts?.planned_windows !== windows.length ||
      base.counts.collected_windows !==
        windows.filter((row) => row.window.status === "window_scanned").length ||
      base.counts.incomplete_windows !==
        windows.filter((row) => row.window.status === "incomplete").length ||
      base.counts.pending_windows !==
        windows.filter((row) => row.window.status === "pending").length
    )
      throw Error("Frozen daily report window counts changed")

    // These metadata files were already pinned and checked by the original
    // report. Reuse them to compare identities without restoring old raw bodies.
    const bodies = new Set(),
      observations = new Set(),
      boundary = [baseReport, planRef]
    for (const pin of pins.values()) {
      if (!/^runs\/[^/]+\/(documents|list-pages)\.json$/.test(pin.path)) continue
      const docs = checked(root, pin)
      boundary.push(pin)
      if (!Array.isArray(docs)) throw Error("Frozen report document metadata is invalid")
      for (const doc of docs) {
        observations.add(observationKey(doc))
        if (captured(doc)) bodies.add(doc.body_path)
      }
    }
    if (
      bodies.size !== base.counts.unique_raw_bodies ||
      observations.size !== base.counts.recorded_document_observations
    )
      throw Error("Frozen report observation inventory differs")
    const history = base.recovery ? base.recovery.history || [base.recovery.evidence] : []
    if (
      !Array.isArray(history) ||
      history.length > 100 ||
      (base.recovery &&
        (!history.length ||
          JSON.stringify(history.at(-1)) !== JSON.stringify(base.recovery.evidence) ||
          !base.recovery.base_report ||
          !hashPattern.test(base.recovery.base_report.sha256 || "") ||
          pins.get(base.recovery.base_report?.path)?.sha256 !== base.recovery.base_report?.sha256))
    )
      throw Error("Recovered report history is invalid")
    const historicalAttempts = new Map()
    for (const evidence of history) {
      if (pins.get(evidence.path)?.sha256 !== evidence.sha256)
        throw Error("Recovered report history is not pinned")
      const snapshot = checked(root, evidence)
      boundary.push(evidence)
      if (
        snapshot.schema !== "research-recovered-daily-evidence/v1" ||
        !Array.isArray(snapshot.recovered) ||
        !snapshot.base_report ||
        !hashPattern.test(snapshot.base_report.sha256 || "") ||
        pins.get(snapshot.base_report?.path)?.sha256 !== snapshot.base_report?.sha256 ||
        !snapshot.recovery_plan ||
        !hashPattern.test(snapshot.recovery_plan.sha256 || "") ||
        pins.get(snapshot.recovery_plan.path)?.sha256 !== snapshot.recovery_plan.sha256
      )
        throw Error("Recovered report lineage changed")
      const priorPlan = checked(root, snapshot.recovery_plan)
      const savedState = snapshot.source_state
      if (
        priorPlan.schema !== "research-collection-recovery-plan/v1" ||
        JSON.stringify(priorPlan.report) !== JSON.stringify(snapshot.base_report) ||
        savedState?.schema !== "research-collection-recovery-state/v1" ||
        savedState.plan_sha256 !== sha256(JSON.stringify(priorPlan)) ||
        sha256(JSON.stringify(savedState, null, 2) + "\n") !== snapshot.source_state_sha256 ||
        !Array.isArray(snapshot.report_attempts) ||
        snapshot.report_attempts.some(
          (attempt) =>
            !savedState.attempts?.some(
              (saved) => JSON.stringify(saved) === JSON.stringify(attempt),
            ),
        )
      )
        throw Error("Recovered report historical state changed")
      boundary.push(snapshot.recovery_plan)
      for (const item of snapshot.recovered) {
        const key = JSON.stringify([item.window_key, item.run_id])
        if (
          historicalAttempts.has(key) &&
          JSON.stringify(historicalAttempts.get(key)) !== JSON.stringify(item)
        )
          throw Error("Recovered report attempt history conflicts")
        historicalAttempts.set(key, item)
      }
    }
    const starts = [],
      finishes = []
    for (const { route, window } of windows)
      for (const attempt of window.attempts || []) {
        if (!idPattern.test(attempt.run_id || ""))
          throw Error("Frozen daily receipt identity changed")
        const path = `daily/runs/${base.daily_run}/receipts/${attempt.run_id}.json`
        const receiptPin = pins.get(path)
        if (!receiptPin) {
          const prior = historicalAttempts.get(
            JSON.stringify([keyOf({ channel_id: route.channel_id, ...window }), attempt.run_id]),
          )
          if (
            !prior ||
            attempt.status !== (prior.status || "window_scanned") ||
            (attempt.reason || null) !== (prior.reason || null) ||
            (attempt.status === "window_scanned" &&
              attempt.coverage_until !== prior.coverage_until) ||
            !pins.has(`runs/${attempt.run_id}/state.json`)
          )
            throw Error("Recovered report attempt is not backed by its original evidence")
          boundary.push(pins.get(`runs/${attempt.run_id}/state.json`))
          continue
        }
        const receipt = checked(root, receiptPin)
        boundary.push(receiptPin)
        if (
          !["research-daily-receipt/v1", "research-daily-receipt/v2"].includes(receipt.schema) ||
          receipt.daily_run !== base.daily_run ||
          receipt.attempt_id !== attempt.run_id ||
          receipt.channel_id !== route.channel_id ||
          receipt.since !== window.since ||
          receipt.until_exclusive !== window.until_exclusive ||
          receipt.status !== attempt.status ||
          (receipt.reason || null) !== (attempt.reason || null) ||
          receipt.candidate_published !== false
        )
          throw Error("Frozen daily receipt differs from the report")
        if (Number.isFinite(Date.parse(receipt.started_at)))
          starts.push(Date.parse(receipt.started_at))
        if (Number.isFinite(Date.parse(receipt.finished_at)))
          finishes.push(Date.parse(receipt.finished_at))
      }
    if (!starts.length || !finishes.length)
      throw Error("Frozen daily observation bounds are missing")
    const first = Math.min(...starts),
      last = Math.max(...finishes)
    const latestSaved = new Map()
    for (const attempt of state.attempts) latestSaved.set(attempt.window_key, attempt)
    const unreported = [...latestSaved.values()].filter(
      (attempt) =>
        !["window_scanned", "incomplete"].includes(attempt.status) ||
        !attempts.some((item) => JSON.stringify(item) === JSON.stringify(attempt)),
    )
    if (unreported.length)
      throw Error(
        "Recovery attempts require their source materials to be reconciled: " +
          unreported.map((attempt) => attempt.run_id).join(", "),
      )
    const latest = new Map()
    for (const attempt of attempts)
      if (["window_scanned", "incomplete"].includes(attempt.status))
        latest.set(attempt.window_key, attempt)
    if (!latest.size) throw Error("A verified recovered scan is required for the daily report")
    const recovered = [],
      scans = [],
      addedPins = []
    for (const [key, attempt] of latest) {
      const row = windows.find((item) => item.key === key)
      if (
        !row ||
        row.window.status === "window_scanned" ||
        row.window.reused_coverage ||
        !idPattern.test(attempt.run_id || "") ||
        row.window.attempts?.some((prior) => prior.run_id === attempt.run_id)
      )
        throw Error("Recovered scan must match an incomplete original window")
      const source = readRecoverySource(root, attempt.run_id)
      const target = {
        channel_id: row.route.channel_id,
        since: row.window.since,
        until_exclusive: row.window.until_exclusive,
      }
      if (
        keyOf({ channel_id: source.summary.channel_id, ...source.summary.window }) !== key ||
        source.summary.status !== attempt.status ||
        !Number.isFinite(Date.parse(source.state.started_at))
      )
        throw Error("Recovered scan input or window changed")
      const planned = plan.targets.find((item) => keyOf(item) === key)
      const actualSources =
        source.input.recovery_source_runs ||
        (source.input.recovery_source_run ? [source.input.recovery_source_run] : [])
      const expectedSources =
        attempt.source_runs?.length > 1 ? attempt.source_runs : [attempt.source_run]
      const earlier = state.attempts
        .slice(
          0,
          state.attempts.findIndex((saved) => saved.run_id === attempt.run_id),
        )
        .filter((saved) => saved.window_key === key)
        .map((saved) => saved.run_id)
      const allowedSources = new Set(
        [
          ...(planned?.source_runs || []),
          planned?.source_run,
          ...earlier,
          ...(row.window.attempts || []).map((saved) => saved.run_id),
        ].filter(Boolean),
      )
      const scan = storedListScan(root, attempt.run_id)
      if (attempt.refresh_after_partial_run) {
        if (
          !planned ||
          !allowedSources.has(attempt.refresh_after_partial_run) ||
          actualSources.length
        )
          throw Error("Refreshed scan is not bound to its planned partial source")
        verifyFreshRecoveryListing(source, scan, target)
      } else if (
        !planned ||
        !actualSources.length ||
        JSON.stringify(actualSources) !== JSON.stringify(expectedSources) ||
        actualSources.some((id) => !allowedSources.has(id))
      )
        throw Error("Recovered scan is not bound to its planned source history")
      if (attempt.status === "incomplete") {
        verifyStoredPartialCandidates(root, scan, target)
        if (attempt.coverage_reconciliation)
          throw Error("An incomplete scan cannot claim coverage reconciliation")
        recovered.push({
          window_key: key,
          run_id: attempt.run_id,
          status: "incomplete",
          reason: scan.summary.reason || null,
          full_window: false,
        })
        scans.push({ ...scan, run_id: attempt.run_id, channel_id: target.channel_id })
        addedPins.push(...source.reference.evidence)
        continue
      }
      verifyStoredListScan(root, scan, target)
      let coverageUntil = [
        target.until_exclusive,
        kstDay(source.state.started_at),
        kstDay(recoveryListingObservedAt(source, scan)),
      ].sort()[0]
      let reconciliation = null
      if (attempt.coverage_reconciliation) {
        if (
          plan.reconcile_coverage !== true ||
          typeof plan.backlog_file !== "string" ||
          !plan.backlog_file
        )
          throw Error("Recovered coverage must retain its reconciliation plan")
        const priorCompleted = state.attempts
          .slice(
            0,
            state.attempts.findIndex((item) => item.run_id === attempt.run_id),
          )
          .some((item) => item.window_key === key && item.status === "window_scanned")
        const name =
          `${runId}_coverage_${sha256(key).slice(0, 12)}` +
          (priorCompleted ? "_" + sha256(attempt.run_id).slice(0, 8) : "")
        if (
          attempt.coverage_reconciliation.reconciliation_run &&
          attempt.coverage_reconciliation.reconciliation_run !== name
        )
          throw Error("Recovered coverage reconciliation identity changed")
        const path = `daily/reconciliations/${name}.json`
        const receipt = readJSON(root, path)
        if (
          receipt?.schema !== "research-supplemental-coverage/v2" ||
          receipt.reconciliation_run !== name ||
          receipt.scan_run !== attempt.run_id ||
          receipt.channel_id !== target.channel_id ||
          receipt.since !== target.since ||
          receipt.scan_until_exclusive !== target.until_exclusive ||
          receipt.coverage_until !== attempt.coverage_reconciliation.coverage_until ||
          receipt.coverage_until > kstDay(source.state.started_at) ||
          receipt.coverage_until > kstDay(recoveryListingObservedAt(source, scan)) ||
          receipt.candidate_published !== false
        )
          throw Error("Recovered coverage reconciliation changed")
        const verified = supplementalCoverageReceiptForWindow(
          root,
          {
            covered: [
              {
                kind: "verified_supplemental_scan",
                since: target.since,
                until_exclusive: receipt.coverage_until,
                reconciliation_run: name,
              },
            ],
          },
          target,
          { backlogFile: plan.backlog_file },
        )
        if (!verified || verified.scan_run !== attempt.run_id)
          throw Error("Recovered coverage reconciliation does not match its native scan")
        coverageUntil = receipt.coverage_until
        reconciliation = reference(root, path)
        addedPins.push(reconciliation)
      }
      if (
        typeof coverageUntil !== "string" ||
        coverageUntil < target.since ||
        coverageUntil > target.until_exclusive
      )
        throw Error("Recovered coverage exceeds the original window")
      const full = coverageUntil === target.until_exclusive
      recovered.push({
        window_key: key,
        run_id: attempt.run_id,
        coverage_until: coverageUntil,
        full_window: full,
        ...(reconciliation ? { reconciliation } : {}),
      })
      scans.push({ ...scan, run_id: attempt.run_id, channel_id: target.channel_id })
      addedPins.push(...source.reference.evidence)
    }
    const result = structuredClone(base)
    let addedBytes = 0
    for (const scan of scans)
      for (const doc of [...scan.indexDocuments, ...scan.documents]) {
        const key = observationKey(doc)
        if (!observations.has(key)) {
          const at = Date.parse(doc.observed_at)
          if (!Number.isFinite(at) || (at >= first && at <= last))
            throw Error(
              "Recovered observations within the original daily interval need explicit reconciliation",
            )
          observations.add(key)
        }
        if (captured(doc) && !bodies.has(doc.body_path)) {
          bodies.add(doc.body_path)
          addedBytes += fs.statSync(safePath(root, doc.body_path)).size
        }
      }
    const overlay = summarizeCollection({
      plan: {
        run_id: runId,
        windows: recovered.map((item) => {
          const row = windows.find((value) => value.key === item.window_key)
          return {
            channel_id: row.route.channel_id,
            since: row.window.since,
            until_exclusive: row.window.until_exclusive,
          }
        }),
      },
      receipts: [],
      scans,
      sizeOf: (file) => fs.statSync(safePath(root, file)).size,
    })
    const materials = new Map(result.materials.map((material) => [material.id, material]))
    for (const material of overlay.materials) {
      material.parse_sha256 = reference(root, material.parse_path).sha256
      const prior = materials.get(material.id)
      if (!prior) materials.set(material.id, material)
      else {
        for (const key of [
          "source_id",
          "source_version_id",
          "parse_id",
          "url",
          "title",
          "published_at",
          "modified_at",
          "parse_status",
          "block_count",
          "body_path",
          "body_sha256",
          "parse_path",
          "parse_sha256",
        ])
          if (prior[key] !== material[key]) throw Error("Recovered material identity changed")
        for (const role of material.roles) if (!prior.roles.includes(role)) prior.roles.push(role)
        for (const observation of material.observations)
          if (
            !prior.observations.some(
              (value) => JSON.stringify(value) === JSON.stringify(observation),
            )
          )
            prior.observations.push(observation)
      }
    }
    result.materials = [...materials.values()].sort((a, b) => a.id.localeCompare(b.id))
    for (const item of recovered) {
      const row = result.routes
        .flatMap((route) => route.windows.map((window) => ({ route, window })))
        .find(
          ({ route, window }) =>
            keyOf({ channel_id: route.channel_id, ...window }) === item.window_key,
        )
      row.window.attempts.push({
        run_id: item.run_id,
        status: item.status || "window_scanned",
        reason: item.reason || null,
        ...(item.status === "incomplete" ? {} : { coverage_until: item.coverage_until }),
      })
      if (item.status === "incomplete") {
        delete row.window.recovered_coverage
        continue
      }
      row.window.recovered_coverage = {
        run_id: item.run_id,
        until_exclusive: item.coverage_until,
        full_window: item.full_window,
        ...(item.reconciliation ? { reconciliation: item.reconciliation } : {}),
      }
      if (item.full_window) row.window.status = "window_scanned"
    }
    for (const route of result.routes)
      route.status = route.windows.every((window) => window.status === "window_scanned")
        ? "collected"
        : route.windows.some((window) => window.status === "incomplete")
          ? "incomplete"
          : "pending"
    const fullyRecovered = new Set(
      recovered.filter((item) => item.full_window).map((item) => item.window_key),
    )
    const detailKey = (item) =>
      JSON.stringify([item.channel_id, item.since, item.until_exclusive, item.url])
    const touchedDetails = new Set(
      scans.flatMap((scan) =>
        (scan.summary.details || []).map((detail) =>
          detailKey({ channel_id: scan.channel_id, ...scan.summary.window, url: detail.url }),
        ),
      ),
    )
    result.pending_items = [
      ...result.pending_items.filter(
        (item) => !fullyRecovered.has(keyOf(item)) && !touchedDetails.has(detailKey(item)),
      ),
      ...overlay.pending_items.filter((item) => !fullyRecovered.has(keyOf(item))),
    ]
    result.held_sources = result.held_sources.filter((item) => !fullyRecovered.has(keyOf(item)))
    result.missing.push(...overlay.missing)
    const allWindows = result.routes.flatMap((route) => route.windows)
    Object.assign(result.counts, {
      collected_routes: result.routes.filter((route) => route.status === "collected").length,
      incomplete_routes: result.routes.filter((route) => route.status === "incomplete").length,
      pending_routes: result.routes.filter((route) => route.status === "pending").length,
      collected_windows: allWindows.filter((window) => window.status === "window_scanned").length,
      incomplete_windows: allWindows.filter((window) => window.status === "incomplete").length,
      pending_windows: allWindows.filter((window) => window.status === "pending").length,
      reused_windows: base.counts.reused_windows + fullyRecovered.size,
      materials: result.materials.length,
      article_source_parses: result.materials.filter((material) =>
        material.roles.includes("article_candidate"),
      ).length,
      unique_raw_bodies: bodies.size,
      recorded_document_observations: observations.size,
      pending_detail_urls: new Set(result.pending_items.map((item) => item.url)).size,
      budget_pending_urls: new Set(
        result.pending_items
          .filter((item) => item.kind === "budget_pending")
          .map((item) => item.url),
      ).size,
      review_pending_urls: new Set(
        result.pending_items
          .filter((item) => item.kind === "source_review_required")
          .map((item) => item.url),
      ).size,
      held_source_routes: new Set(result.held_sources.map((item) => item.channel_id)).size,
    })
    result.resources.referenced_raw_body_bytes += addedBytes
    result.status = result.routes.every((route) => route.status === "collected")
      ? "collected"
      : "partial"
    for (const pin of [...boundary, ...addedPins]) {
      const bytes = fs.readFileSync(safePath(root, pin.path))
      if (sha256(bytes) !== pin.sha256)
        throw Error("Recovered report evidence changed before saving")
    }
    if (!frozen && reference(root, statePath).sha256 !== stateSha)
      throw Error("Recovered report attempt state changed before saving")
    const snapshot = {
      schema: "research-recovered-daily-evidence/v1",
      base_report: baseReport,
      source_recovery_run: runId,
      report_run: reportRunId,
      recovery_plan: planRef,
      source_state_sha256: stateSha,
      source_state: state,
      report_attempts: attempts,
      recovered,
    }
    const snapshotPath = `collection-recovery/${reportRunId}/report-evidence/${sha256(JSON.stringify(snapshot))}.json`
    if (
      frozen &&
      (snapshotPath !== frozenEvidence.path ||
        sha256(JSON.stringify(snapshot, null, 2) + "\n") !== frozenEvidence.sha256)
    )
      throw Error("Recovered report snapshot no longer reproduces its evidence")
    if (!frozen && !readJSON(root, snapshotPath)) atomicCreate(root, snapshotPath, snapshot)
    if (JSON.stringify(readJSON(root, snapshotPath)) !== JSON.stringify(snapshot))
      throw Error("Recovered daily snapshot changed")
    const snapshotReference = reference(root, snapshotPath)
    result.recovery = {
      base_report: baseReport,
      source_recovery_run: runId,
      report_run: reportRunId,
      evidence: snapshotReference,
      history: [...history, snapshotReference],
      recovered_windows: recovered,
    }
    const evidence = new Map()
    for (const pin of [
      ...base.evidence,
      baseReport,
      planRef,
      ...addedPins,
      result.recovery.evidence,
    ]) {
      if (evidence.has(pin.path) && evidence.get(pin.path).sha256 !== pin.sha256)
        throw Error("Conflicting recovered report evidence")
      evidence.set(pin.path, pin)
    }
    result.evidence = [...evidence.values()]
    const bytes = Buffer.from(JSON.stringify(result, null, 2) + "\n")
    const file = `daily/runs/${base.daily_run}/collection-reports/${sha256(bytes)}.json`
    if (frozen && !readJSON(root, file)) throw Error("Recovered report is missing")
    if (!frozen && !readJSON(root, file)) atomicCreate(root, file, bytes)
    if (!fs.readFileSync(safePath(root, file)).equals(bytes))
      throw Error("Recovered report bytes changed")
    return {
      path: file,
      sha256: sha256(bytes),
      status: result.status,
      counts: result.counts,
      timing: result.timing,
      resources: result.resources,
      recovered_windows: recovered,
      recovery_request: collectionRecoveryRequest(result, { path: file, sha256: sha256(bytes) }),
    }
  })
}

export async function verifyRecoveredDailyReport({
  root,
  reference: reportReference,
  seen = new Set(),
}) {
  if (seen.has(reportReference.path) || seen.size >= 100)
    throw Error("Recovered report lineage is cyclic or too deep")
  seen.add(reportReference.path)
  const report = checked(root, reportReference)
  const recovery = report.recovery
  if (
    !recovery?.evidence ||
    !recovery.base_report ||
    !idPattern.test(recovery.source_recovery_run || "") ||
    !idPattern.test(recovery.report_run || "")
  )
    throw Error("Exact recovered report lineage required")
  const base = checked(root, recovery.base_report)
  if (base.recovery) {
    await verifyRecoveredDailyReport({ root, reference: recovery.base_report, seen })
  } else {
    if (
      recovery.base_report.path !==
      `daily/runs/${base.daily_run}/collection-reports/${recovery.base_report.sha256}.json`
    )
      throw Error("Native immutable base collection report required")
    const supplementalIds = new Set(
      base.materials.flatMap((material) =>
        material.observations
          .filter((observation) => observation.linked_from)
          .map((observation) => observation.scan_run),
      ),
    )
    const supplementalRuns = base.evidence
      .filter(
        (ref) =>
          /^runs\/[^/]+\/documents\.json$/.test(ref.path) &&
          supplementalIds.has(ref.path.split("/")[1]),
      )
      .map((ref) => ref.path.split("/")[1])
    const rebuilt = buildCollectionReport({ root, runId: base.daily_run, supplementalRuns })
    if (sha256(JSON.stringify(rebuilt)) !== sha256(JSON.stringify(base)))
      throw Error("Recovered base is not the settled native collection report")
  }
  const snapshot = checked(root, recovery.evidence)
  const result = await saveRecoveredDailyReport({
    root,
    runId: recovery.source_recovery_run,
    reportRunId: recovery.report_run,
    baseReport: recovery.base_report,
    attempts: snapshot.report_attempts,
    frozenEvidence: recovery.evidence,
  })
  if (result.path !== reportReference.path || result.sha256 !== reportReference.sha256)
    throw Error("Recovered report is not the verified native projection")
  return result
}
