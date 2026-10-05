import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { canonicalURL, editions } from "../garden.mjs"
import { registry, coverageGrid } from "./discovery.mjs"
import { sha256 } from "./contracts.mjs"
import {
  DEFAULT_ROOT,
  atomicCreate,
  atomicWrite,
  readJSON,
  safePath,
  withLock,
} from "./run-state.mjs"
import {
  DEFAULT_DAILY_RETRY_POLICY,
  coveredFrontier,
  kstDay,
  planDailyWindows,
  validateDailyRoutes,
} from "./daily-plan.mjs"
import {
  mergeCompletedScan,
  mergePartialScan,
  collectedCandidateReceipt,
  sameEventAliasSuppressions,
} from "./scan-completion.mjs"
import { loadSameEventSourceAliases } from "./candidate-source-alternative.mjs"
import { verifyStoredListScan, verifyStoredPartialCandidates } from "./scan-evidence.mjs"
export { verifyStoredListScan } from "./scan-evidence.mjs"

import {
  freezeShadowCollectionInputs,
  freezeShadowHandoffBasis,
  loadShadowCollectionInputs,
} from "./shadow-collection-basis.mjs"

export const DAILY_CONFIG = "data/research-daily-routes.json"
export const DAILY_BACKLOG = ".local/research/candidate-backlog.json"
function requireExplicitBacklog(root, backlogFile) {
  if (backlogFile === undefined && path.resolve(root) !== path.resolve(DEFAULT_ROOT))
    throw Error("A custom research root requires an explicit --backlog path")
  if (backlogFile !== undefined && (typeof backlogFile !== "string" || !backlogFile.trim()))
    throw Error("Explicit backlog path must be non-empty")
  return backlogFile ?? DAILY_BACKLOG
}
const COVERAGE_FILE = "daily/route-coverage.json"
const MAX_PARALLEL_DAILY_ROUTES = 6

export function dailySourcePaths(configFile = DAILY_CONFIG) {
  return [
    configFile,
    "data/research-source-channels.json",
    "data/research-watchlist.json",
    "data/research-acquisition.json",
    "data/research-source-recipes.json",
    "scripts/research/source-recipes.mjs",
    "scripts/garden.mjs",
    "scripts/research-scan.mjs",
    "scripts/research/list-scan-command.mjs",
    "scripts/research-daily.mjs",
    "scripts/research/daily-plan.mjs",
    "scripts/research/daily-scan.mjs",
    "scripts/research/shadow-collection-basis.mjs",
    "scripts/pull-drive.py",
    "scripts/research/editorial-handoff.mjs",
    "scripts/research/contracts.mjs",
    "scripts/research/dates.mjs",
    "scripts/research/discovery.mjs",
    "scripts/research/fetch.mjs",
    "scripts/research/parser.mjs",
    "scripts/research/robots.mjs",
    "scripts/research/run-state.mjs",
    "scripts/research/scan-completion.mjs",
    "scripts/research/scan-evidence.mjs",
    "scripts/research/candidate-source-alternative.mjs",
    "scripts/research/legacy-candidate-approval.mjs",
    "scripts/research/source-policy.mjs",
    "scripts/research/list-scan.mjs",
    "scripts/research/scan-basis.mjs",
    "scripts/research/rss-scan.mjs",
    "scripts/research/monthly-scan.mjs",
    "scripts/research/api-scan.mjs",
    "scripts/research/api.mjs",
    "scripts/research/sec-scan.mjs",
    "scripts/research/wordpress-scan.mjs",
    "scripts/research/ur-scan.mjs",
    "scripts/research/kuka-scan.mjs",
    "scripts/research/abb-scan.mjs",
    "scripts/research/form-html-scan.mjs",
    "integrations/research-worker/worker.py",
  ]
}

const load = (file) => JSON.parse(fs.readFileSync(file, "utf8"))
const sameWindow = (a, b) =>
  a.channel_id === b.channel_id && a.since === b.since && a.until_exclusive === b.until_exclusive
const reconciliationPath = (runId) => `daily/reconciliations/${runId}.json`

export function dailySources(configFile = DAILY_CONFIG) {
  const config = load(configFile)
  const routes = registry(
    load("data/research-source-channels.json"),
    load("data/research-watchlist.json"),
    load("data/research-acquisition.json"),
  )
  const activeRoutes = validateDailyRoutes(config, routes)
  if (!activeRoutes.length) throw Error("No active daily acquisition routes")
  const sourcePaths = dailySourcePaths(configFile)
  return {
    config,
    activeRoutes,
    config_sha256: sha256(
      sourcePaths.map((file) => `${file}:${sha256(fs.readFileSync(file))}`).join("\n"),
    ),
  }
}

export function localEditionSnapshot(vault = "vault") {
  const all = editions(vault)
  const latest = all.at(-1)
  if (!latest?.meta.coverage_end || !Number.isFinite(Date.parse(latest.meta.coverage_end)))
    throw Error("Latest local edition coverage_end required for discovery planning")
  const inventory = all.map((edition) => ({
    path: path.relative(vault, edition.file),
    sha256: sha256(fs.readFileSync(edition.file)),
  }))
  return {
    cutoff: latest.meta.coverage_end,
    edition: latest.slug,
    file_sha256: sha256(fs.readFileSync(latest.file)),
    inventory_sha256: sha256(JSON.stringify(inventory)),
    authority: "local_vault_unreconciled",
  }
}

export function verifiedDriveEdition(snapshotFile, vault = "vault", { allowStale = false } = {}) {
  const vaultPath = path.resolve(vault)
  if (path.basename(vaultPath) !== "vault")
    throw Error("Drive snapshot verification requires a repository vault directory")
  const repository = path.dirname(vaultPath)
  const script = fileURLToPath(new URL("../pull-drive.py", import.meta.url))
  const args = [
    script,
    "--snapshot",
    path.resolve(snapshotFile),
    "--repository",
    repository,
    "--verify-source-snapshot",
  ]
  if (allowStale) args.push("--allow-stale-snapshot")
  let verified
  try {
    verified = execFileSync("python3", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
  } catch (error) {
    throw Error(
      `Drive snapshot verification failed: ${String(error.stderr || error.message).trim()}`,
    )
  }
  const snapshot = JSON.parse(verified)
  return {
    ...localEditionSnapshot(vault),
    authority: "provided_drive_snapshot_matched",
    snapshot_sha256: snapshot.snapshot_sha256,
    snapshot_file_sha256: snapshot.snapshot_file_sha256,
    exported_at: snapshot.exported_at,
    source_files: snapshot.source_files,
  }
}

export function dailyPlanningBasis(coverage, activeRoutes) {
  return {
    routes: Object.fromEntries(
      activeRoutes.map(({ channel_id }) => {
        const state = coverage.routes[channel_id]
        if (!state) throw Error("Active daily route has no verified coverage basis: " + channel_id)
        return [
          channel_id,
          {
            last_contiguous_until: state.last_contiguous_until,
            unresolved: structuredClone(state.unresolved),
          },
        ]
      }),
    ),
  }
}

export function validateStoredDailyPlan(plan, { runId, config, activeRoutes, configSha, edition }) {
  if (
    plan?.schema !== "research-daily-plan/v1" ||
    plan.run_id !== runId ||
    plan.config_sha256 !== configSha ||
    JSON.stringify(plan.edition) !== JSON.stringify(edition) ||
    !plan.coverage_basis?.routes ||
    plan.coverage_basis_sha256 !== sha256(JSON.stringify(plan.coverage_basis)) ||
    !Number.isFinite(Date.parse(plan.created_at || "")) ||
    kstDay(plan.created_at) !== plan.kst_day
  )
    throw Error("Stored daily plan inputs changed; use a new run after reconciliation")
  const expected = planDailyWindows({
    runId,
    now: plan.created_at,
    cutoff: edition.cutoff,
    cutoffBasis: edition.authority,
    config,
    activeRoutes,
    coverage: plan.coverage_basis,
  })
  for (const key of [
    "schema",
    "run_id",
    "kst_day",
    "cutoff",
    "cutoff_basis",
    "retry_policy",
    "windows",
  ]) {
    if (JSON.stringify(plan[key]) !== JSON.stringify(expected[key]))
      throw Error("Stored daily plan windows differ from the verified planning basis")
  }
  return true
}

export function storedListScan(root, runId) {
  const prefix = `runs/${runId}/`
  const summary = readJSON(root, prefix + "list-scan.json")
  const documents = readJSON(root, prefix + "documents.json")
  const parses = readJSON(root, prefix + "parses.json")
  const candidates = readJSON(root, prefix + "candidates.json")
  const indexDocuments = readJSON(root, prefix + "list-pages.json") || []
  if (
    !summary ||
    !Array.isArray(documents) ||
    !Array.isArray(parses) ||
    !Array.isArray(candidates) ||
    !Array.isArray(indexDocuments)
  )
    throw Error("Daily scan run artifacts are missing or malformed: " + runId)
  return { summary, documents, parses, candidates, indexDocuments }
}

export function repairDailyCoverageState(state) {
  // A scan made during a KST day sees only a snapshot of that day. Earlier
  // local coverage state counted the entire calendar day; repair it from the
  // immutable source-run date before deriving the next frontier.
  state.covered = state.covered.flatMap((span) => {
    if (span.kind !== "daily_scan") return [span]
    const match = /^daily-(\d{4})(\d{2})(\d{2})/.exec(span.source_run || "")
    if (!match) throw Error("Daily coverage interval has no run calendar day")
    const day = `${match[1]}-${match[2]}-${match[3]}`
    const until_exclusive = [span.until_exclusive, day].sort()[0]
    return span.since < until_exclusive ? [{ ...span, until_exclusive }] : []
  })
  state.last_contiguous_until = coveredFrontier(state.anchor_since, state.covered)
  return state
}

function verifySameEventSuppressionRecord(
  root,
  candidates,
  recordedAliases,
  {
    backlogFile = DAILY_BACKLOG,
    sameEventAliases = null,
    asOf = null,
    required = false,
    label = "Receipt",
  } = {},
) {
  if (required && !Array.isArray(recordedAliases))
    throw Error(`${label} is missing its same-event candidate suppression record`)
  if (recordedAliases === undefined) return true
  if (recordedAliases.length === 0 && candidates.length === 0) return true
  const sourceAliases = sameEventAliases || loadSameEventSourceAliases(root, backlogFile)
  const aliases = asOf
    ? new Map(
        [...sourceAliases].filter(([, alias]) => !alias.generated_at || alias.generated_at <= asOf),
      )
    : sourceAliases
  const expectedAliases = sameEventAliasSuppressions(candidates, aliases)
  if (JSON.stringify(recordedAliases) !== JSON.stringify(expectedAliases))
    throw Error(`${label} same-event candidate suppression no longer matches its evidence`)
  return true
}

export function verifyDailyCoverageEvidence(
  root,
  channelId,
  state,
  { backlogFile = DAILY_BACKLOG, sameEventAliases = null } = {},
) {
  for (const span of state.covered) {
    if (span.kind === "verified_supplemental_scan") {
      if (!/^[a-zA-Z0-9_-]+$/.test(span.reconciliation_run || ""))
        throw Error("Supplemental coverage has no valid reconciliation run")
      const receipt = readJSON(root, reconciliationPath(span.reconciliation_run))
      const scan = storedListScan(root, receipt.scan_run)
      const expectedUntil = scan.summary.window
        ? [scan.summary.window.until_exclusive, kstDay(receipt.reconciled_at)].sort()[0]
        : null
      if (
        !["research-supplemental-coverage/v1", "research-supplemental-coverage/v2"].includes(
          receipt?.schema,
        ) ||
        receipt.scan_run !== span.source_run ||
        receipt.channel_id !== channelId ||
        receipt.since !== span.since ||
        receipt.scan_until_exclusive !== scan.summary.window?.until_exclusive ||
        receipt.coverage_until !== span.until_exclusive ||
        receipt.coverage_until !== expectedUntil ||
        receipt.backlog_merge?.status !== "merged" ||
        receipt.candidate_published !== false ||
        JSON.stringify(receipt.candidate_keys) !==
          JSON.stringify(scan.candidates.map((candidate) => candidate.key))
      )
        throw Error("Supplemental coverage receipt does not match its interval")
      verifySameEventSuppressionRecord(
        root,
        scan.candidates,
        receipt.backlog_merge?.same_event_aliases,
        {
          backlogFile,
          sameEventAliases,
          asOf: receipt.reconciled_at,
          required: receipt.schema === "research-supplemental-coverage/v2",
          label: "Supplemental coverage receipt",
        },
      )
      if (
        scan.summary.status !== "window_scanned" ||
        scan.summary.channel_id !== channelId ||
        scan.summary.window?.since !== span.since ||
        scan.summary.window?.until_exclusive < span.until_exclusive
      )
        throw Error("Supplemental coverage disagrees with its completed scan window")
      verifyStoredListScan(root, scan, { channel_id: channelId, ...scan.summary.window })
      continue
    }
    if (span.kind !== "daily_scan") continue
    const scan = storedListScan(root, span.source_run)
    const window = scan.summary.window
    const match = /^daily-(\d{4})(\d{2})(\d{2})/.exec(span.source_run || "")
    const runDay = match && `${match[1]}-${match[2]}-${match[3]}`
    if (
      !window ||
      span.since !== window.since ||
      span.until_exclusive > window.until_exclusive ||
      span.until_exclusive > runDay
    )
      throw Error("Daily coverage interval disagrees with its stored scan window")
    verifyStoredListScan(root, scan, { channel_id: channelId, ...window })
  }
  return true
}

export async function reconcileSupplementalScan({
  root = DEFAULT_ROOT,
  configFile = DAILY_CONFIG,
  scanRun,
  reconciliationRun,
  backlogFile,
  now = new Date().toISOString(),
  merge,
}) {
  backlogFile = requireExplicitBacklog(root, backlogFile)
  if (!/^[a-zA-Z0-9_-]+$/.test(scanRun || "")) throw Error("Valid stored scan run required")
  if (!/^[a-zA-Z0-9_-]+$/.test(reconciliationRun || ""))
    throw Error("Valid reconciliation run required")
  return withLock(root, "daily-acquisition", async () => {
    const sourceAliases = merge ? null : loadSameEventSourceAliases(root, backlogFile)
    const mergeScan =
      merge || ((scan, file) => mergeCompletedScan(scan, file, undefined, sourceAliases))
    const { activeRoutes } = dailySources(configFile)
    const scan = storedListScan(root, scanRun)
    const channelId = scan.summary.channel_id
    const route = activeRoutes.find((item) => item.channel_id === channelId)
    if (!route) throw Error("Supplemental scan must belong to an active daily route")
    if (scan.summary.status !== "window_scanned" || !scan.summary.window)
      throw Error("Only a completed stored scan can supplement daily coverage")
    verifyStoredListScan(root, scan, { channel_id: channelId, ...scan.summary.window })
    const coverage = bootstrapCoverage(root, activeRoutes, readJSON(root, COVERAGE_FILE), {
      backlogFile,
      sameEventAliases: sourceAliases,
    })
    const state = coverage.routes[channelId]
    // A baseline proves source coverage, not candidate ingestion. Only a
    // completed supplemental merge receipt proves this reconciliation ran.
    const existing = state.covered.find(
      (span) => span.source_run === scanRun && span.kind === "verified_supplemental_scan",
    )
    const receiptFile = reconciliationPath(reconciliationRun)
    const previousReceipt = fs.existsSync(safePath(root, receiptFile))
      ? readJSON(root, receiptFile)
      : null
    const reconciledAt = previousReceipt?.reconciled_at || new Date(now).toISOString()
    const day = kstDay(reconciledAt)
    const coverageUntil = [scan.summary.window.until_exclusive, day].sort()[0]
    if (scan.summary.window.since >= coverageUntil)
      throw Error("Stored scan has no elapsed dates to add to daily coverage")
    const expectedReceipt = {
      schema: "research-supplemental-coverage/v2",
      reconciliation_run: reconciliationRun,
      scan_run: scanRun,
      channel_id: channelId,
      since: scan.summary.window.since,
      scan_until_exclusive: scan.summary.window.until_exclusive,
      coverage_until: coverageUntil,
      reconciled_at: reconciledAt,
      candidate_keys: scan.candidates.map((candidate) => candidate.key),
      candidate_published: false,
    }
    if (
      previousReceipt &&
      !["research-supplemental-coverage/v1", "research-supplemental-coverage/v2"].includes(
        previousReceipt.schema,
      )
    )
      throw Error("Reconciliation run already exists with an unsupported receipt version")
    if (
      previousReceipt &&
      Object.entries(expectedReceipt)
        .filter(([key]) => key !== "schema")
        .some(([key, value]) => JSON.stringify(previousReceipt[key]) !== JSON.stringify(value))
    )
      throw Error("Reconciliation run already exists with different evidence")
    if (existing) {
      verifyDailyCoverageEvidence(root, channelId, state, {
        backlogFile,
        sameEventAliases: sourceAliases,
      })
      return { status: "already_reconciled", channel_id: channelId, scan_run: scanRun }
    }
    if (previousReceipt && !fs.existsSync(safePath(root, COVERAGE_FILE)))
      throw Error("Reconciliation receipt exists without daily coverage state")
    const merged = previousReceipt
      ? previousReceipt.backlog_merge
      : await mergeScan(scan, backlogFile)
    if (merged?.status !== "merged") throw Error("Supplemental candidates were not merged")
    if (!Array.isArray(merged.same_event_aliases)) merged.same_event_aliases = []
    if (!previousReceipt)
      atomicCreate(root, receiptFile, { ...expectedReceipt, backlog_merge: merged })
    if (scan.summary.window.since < coverageUntil) {
      state.covered.push({
        since: scan.summary.window.since,
        until_exclusive: coverageUntil,
        source_run: scanRun,
        kind: "verified_supplemental_scan",
        reconciliation_run: reconciliationRun,
      })
      state.unresolved = state.unresolved.flatMap((gap) => {
        if (gap.until_exclusive <= scan.summary.window.since || gap.since >= coverageUntil)
          return [gap]
        return [
          ...(gap.since < scan.summary.window.since
            ? [{ ...gap, until_exclusive: scan.summary.window.since }]
            : []),
          ...(gap.until_exclusive > coverageUntil ? [{ ...gap, since: coverageUntil }] : []),
        ]
      })
      state.last_contiguous_until = coveredFrontier(state.anchor_since, state.covered)
      verifyDailyCoverageEvidence(root, channelId, state, {
        backlogFile,
        sameEventAliases: sourceAliases,
      })
      atomicWrite(root, COVERAGE_FILE, coverage)
    }
    return {
      status: "reconciled",
      channel_id: channelId,
      scan_run: scanRun,
      since: scan.summary.window.since,
      coverage_until: coverageUntil,
      candidates: scan.candidates.length,
      backlog_merge: merged,
      candidate_published: false,
    }
  })
}

export function bootstrapCoverage(
  root,
  activeRoutes,
  previous = null,
  { backlogFile = DAILY_BACKLOG, sameEventAliases = null } = {},
) {
  if (previous && (previous.schema !== "research-daily-coverage/v1" || !previous.routes))
    throw Error("Unsupported daily coverage state")
  const coverage = structuredClone(previous || { schema: "research-daily-coverage/v1", routes: {} })
  for (const entry of activeRoutes) {
    const scan = storedListScan(root, entry.baseline_run)
    const expected = { channel_id: entry.channel_id, ...scan.summary.window }
    verifyStoredListScan(root, scan, expected, { allowLegacyCandidates: true })
    const baseline = {
      since: expected.since,
      until_exclusive: expected.until_exclusive,
      source_run: entry.baseline_run,
      kind: "verified_baseline",
    }
    const current = coverage.routes[entry.channel_id]
    if (current?.baseline_run && current.baseline_run !== entry.baseline_run) {
      const previousScan = storedListScan(root, current.baseline_run)
      const previousWindow = previousScan.summary.window
      verifyStoredListScan(
        root,
        previousScan,
        {
          channel_id: entry.channel_id,
          ...previousWindow,
        },
        { allowLegacyCandidates: true },
      )
      const previousSpans = current.covered.filter(
        (span) => span.kind === "verified_baseline" && span.source_run === current.baseline_run,
      )
      if (
        previousSpans.length !== 1 ||
        previousWindow.since !== expected.since ||
        previousWindow.until_exclusive !== expected.until_exclusive ||
        previousSpans[0].since !== expected.since ||
        previousSpans[0].until_exclusive !== expected.until_exclusive
      )
        throw Error("Daily route baseline changed; reconcile coverage before continuing")
      current.covered = current.covered.map((span) => (span === previousSpans[0] ? baseline : span))
      current.baseline_run = entry.baseline_run
    }
    const state = current || {
      baseline_run: entry.baseline_run,
      anchor_since: expected.since,
      covered: [],
      unresolved: [],
    }
    if (!state.covered.some((span) => span.source_run === entry.baseline_run))
      state.covered.push(baseline)
    state.anchor_since = [state.anchor_since, expected.since].sort()[0]
    const repaired = repairDailyCoverageState(state)
    verifyDailyCoverageEvidence(root, entry.channel_id, repaired, { backlogFile, sameEventAliases })
    coverage.routes[entry.channel_id] = repaired
  }
  return coverage
}

function receiptDirectory(root, runId) {
  return safePath(root, `daily/runs/${runId}/receipts`)
}

export function readDailyReceipts(root, runId) {
  const directory = receiptDirectory(root, runId)
  if (!fs.existsSync(directory)) return []
  return fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const receipt = load(safePath(root, `daily/runs/${runId}/receipts/${file}`))
      if (file !== `${receipt.attempt_id}.json`)
        throw Error("Daily receipt filename and attempt ID disagree")
      return receipt
    })
    .sort(
      (a, b) =>
        a.started_at.localeCompare(b.started_at) ||
        Number(a.attempt_id.match(/_a(\d+)$/)?.[1] || 0) -
          Number(b.attempt_id.match(/_a(\d+)$/)?.[1] || 0),
    )
}

export function applyDailyReceipts(coverage, plan, receipts) {
  const result = structuredClone(coverage)
  for (const receipt of receipts) {
    if (
      !["research-daily-receipt/v1", "research-daily-receipt/v2"].includes(receipt.schema) ||
      receipt.daily_run !== plan.run_id ||
      !["window_scanned", "incomplete", "blocked", "failed"].includes(receipt.status)
    )
      throw Error("Daily receipt does not belong to this plan")
    const window = plan.windows.find((item) => sameWindow(item, receipt))
    if (!window) throw Error("Daily receipt refers to an unplanned route window")
    const state = result.routes[receipt.channel_id]
    if (!state) throw Error("Daily receipt route is not in coverage state")
    if (receipt.status === "window_scanned") {
      const coverageUntil = [receipt.until_exclusive, plan.kst_day].sort()[0]
      if (
        receipt.since < coverageUntil &&
        !state.covered.some((span) => span.source_run === receipt.attempt_id)
      )
        state.covered.push({
          since: receipt.since,
          until_exclusive: coverageUntil,
          source_run: receipt.attempt_id,
          kind: "daily_scan",
        })
      state.unresolved = state.unresolved.filter(
        (gap) => !(gap.since >= receipt.since && gap.until_exclusive <= receipt.until_exclusive),
      )
    } else {
      const gaps = [
        {
          channel_id: receipt.channel_id,
          since: receipt.since,
          until_exclusive: receipt.until_exclusive,
          reason: receipt.reason || receipt.status,
          last_attempt: receipt.attempt_id,
        },
      ].flatMap((gap) => {
        let remaining = [gap]
        for (const span of state.covered.filter((item) =>
          ["daily_scan", "verified_supplemental_scan"].includes(item.kind),
        ))
          remaining = remaining.flatMap((item) => {
            if (item.until_exclusive <= span.since || item.since >= span.until_exclusive)
              return [item]
            return [
              ...(item.since < span.since ? [{ ...item, until_exclusive: span.since }] : []),
              ...(item.until_exclusive > span.until_exclusive
                ? [{ ...item, since: span.until_exclusive }]
                : []),
            ]
          })
        return remaining
      })
      for (const gap of gaps)
        if (!state.unresolved.some((existing) => sameWindow(existing, gap)))
          state.unresolved.push(gap)
    }
    state.last_contiguous_until = coveredFrontier(state.anchor_since, state.covered)
  }
  return result
}

export function supplementalCoverageReceiptForWindow(
  root,
  state,
  window,
  { backlogFile = DAILY_BACKLOG, sameEventAliases = null } = {},
) {
  for (const span of state?.covered || []) {
    if (
      span.kind !== "verified_supplemental_scan" ||
      span.since !== window.since ||
      span.until_exclusive > window.until_exclusive
    )
      continue
    if (!/^[a-zA-Z0-9_-]+$/.test(span.reconciliation_run || ""))
      throw Error("Supplemental coverage has no valid reconciliation run")
    const receipt = readJSON(root, reconciliationPath(span.reconciliation_run))
    const scan = storedListScan(root, receipt.scan_run)
    const expectedUntil = scan.summary.window
      ? [scan.summary.window.until_exclusive, kstDay(receipt.reconciled_at)].sort()[0]
      : null
    if (
      !["research-supplemental-coverage/v1", "research-supplemental-coverage/v2"].includes(
        receipt?.schema,
      ) ||
      receipt.reconciliation_run !== span.reconciliation_run ||
      receipt.channel_id !== window.channel_id ||
      receipt.since !== window.since ||
      receipt.scan_until_exclusive !== scan.summary.window?.until_exclusive ||
      receipt.coverage_until !== span.until_exclusive ||
      receipt.coverage_until !== expectedUntil ||
      receipt.backlog_merge?.status !== "merged" ||
      receipt.candidate_published !== false ||
      JSON.stringify(receipt.candidate_keys) !==
        JSON.stringify(scan.candidates.map((candidate) => candidate.key)) ||
      scan.summary.status !== "window_scanned" ||
      scan.summary.channel_id !== window.channel_id ||
      scan.summary.window?.since !== window.since
    )
      throw Error("Supplemental coverage receipt does not match its completed scan window")
    verifySameEventSuppressionRecord(
      root,
      scan.candidates,
      receipt.backlog_merge?.same_event_aliases,
      {
        backlogFile,
        sameEventAliases,
        asOf: receipt.reconciled_at,
        required: receipt.schema === "research-supplemental-coverage/v2",
        label: "Supplemental coverage receipt",
      },
    )
    verifyStoredListScan(root, scan, { channel_id: window.channel_id, ...scan.summary.window })
    // Validate the stored scan against its own bounds before checking reuse.
    // A valid older scan must not block a wider window or confirm its new days.
    if (receipt.scan_until_exclusive === window.until_exclusive) return receipt
  }
  return null
}

function hasSupplementalResultForWindow(root, state, window, options) {
  return supplementalCoverageReceiptForWindow(root, state, window, options) !== null
}

function attemptId(plan, window, attempt) {
  return `${plan.run_id}_${window.channel_id}_${window.since.replaceAll("-", "")}_${window.until_exclusive.replaceAll("-", "")}_a${attempt}`
}

export function dailyRetryQueue(
  root,
  plan,
  receipts,
  coverage = readJSON(root, COVERAGE_FILE),
  options,
) {
  const policy = plan.retry_policy || DEFAULT_DAILY_RETRY_POLICY
  return plan.windows.flatMap((window) => {
    const attempts = receipts.filter((receipt) => sameWindow(receipt, window))
    if (!attempts.length || attempts.some((receipt) => receipt.status === "window_scanned"))
      return []
    if (
      hasSupplementalResultForWindow(root, coverage?.routes?.[window.channel_id], window, options)
    )
      return []
    const last = attempts.at(-1)
    const state =
      last.status === "blocked" && policy.blocked_requires_new_observation
        ? "awaiting_new_observation"
        : attempts.length >= policy.max_attempts_per_window
          ? "exhausted"
          : "retryable"
    return [
      {
        channel_id: window.channel_id,
        since: window.since,
        until_exclusive: window.until_exclusive,
        state,
        attempts: attempts.length,
        attempts_remaining:
          state === "retryable" ? policy.max_attempts_per_window - attempts.length : 0,
        last_attempt_id: last.attempt_id,
        reason: last.reason || last.status,
      },
    ]
  })
}

export function verifyDailyReceipts(
  root,
  plan,
  receipts,
  {
    loadStored = storedListScan,
    verify = verifyStoredListScan,
    sameEventAliases = null,
    backlogFile = DAILY_BACKLOG,
  } = {},
) {
  const seen = new Set()
  for (const receipt of receipts) {
    const window = plan.windows.find((item) => sameWindow(item, receipt))
    const attemptNumber = Number(receipt.attempt_id?.match(/_a([1-9]\d*)$/)?.[1])
    if (
      !["research-daily-receipt/v1", "research-daily-receipt/v2"].includes(receipt.schema) ||
      receipt.daily_run !== plan.run_id ||
      !window ||
      !Number.isSafeInteger(attemptNumber) ||
      receipt.attempt_id !== attemptId(plan, window, attemptNumber) ||
      seen.has(receipt.attempt_id)
    )
      throw Error("Daily receipt identity does not match the stored plan")
    seen.add(receipt.attempt_id)
    if (receipt.backlog_merge?.status === "merged_partial" && receipt.status !== "incomplete")
      throw Error("Partial candidate intake cannot complete or hide a failed window")
    if (!collectedCandidateReceipt(receipt)) continue
    const partial = receipt.status !== "window_scanned"
    const stored = loadStored(root, receipt.attempt_id)
    if (partial) verifyStoredPartialCandidates(root, stored, window)
    else verify(root, stored, window)
    if (
      receipt.scan_evidence?.list_scan_run !== receipt.attempt_id ||
      receipt.scan_evidence?.listing_source_version_id !==
        (stored.summary.listing_source_version_id || null) ||
      receipt.scan_evidence?.index_documents !== (stored.indexDocuments?.length || 0) ||
      receipt.scan_evidence?.documents !== (stored.documents?.length || 0) ||
      receipt.scan_evidence?.parses !== (stored.parses?.length || 0) ||
      JSON.stringify(receipt.candidate_keys) !==
        JSON.stringify(stored.candidates.map((candidate) => candidate.key)) ||
      receipt.backlog_merge?.status !== (partial ? "merged_partial" : "merged") ||
      (partial &&
        (receipt.schema !== "research-daily-receipt/v2" || receipt.reason !== "detail_incomplete"))
    )
      throw Error("Daily receipt no longer matches its collected stored scan")
    verifySameEventSuppressionRecord(
      root,
      stored.candidates,
      receipt.backlog_merge.same_event_aliases,
      {
        backlogFile,
        sameEventAliases,
        asOf: receipt.finished_at,
        required: receipt.schema === "research-daily-receipt/v2",
        label: "Daily receipt",
      },
    )
  }
  return true
}

export async function executeDailyPlan({
  root,
  plan,
  coverage,
  activeRoutes,
  backlogFile = DAILY_BACKLOG,
  scan,
  loadStored = storedListScan,
  verify = verifyStoredListScan,
  merge = mergeCompletedScan,
  sameEventAliases = null,
}) {
  const receipts = readDailyReceipts(root, plan.run_id)
  verifyDailyReceipts(root, plan, receipts, {
    loadStored,
    verify,
    sameEventAliases,
    backlogFile,
  })
  for (const { channel_id } of activeRoutes) {
    const state = coverage.routes[channel_id]
    if (state)
      verifyDailyCoverageEvidence(root, channel_id, state, { backlogFile, sameEventAliases })
  }
  let current = applyDailyReceipts(coverage, plan, receipts)
  const retryPolicy = plan.retry_policy || DEFAULT_DAILY_RETRY_POLICY
  atomicWrite(root, COVERAGE_FILE, current)
  const pendingRoutes = [...Map.groupBy(plan.windows, (window) => window.channel_id).values()]
  let commitQueue = Promise.resolve()
  let stopped = false
  const scanWindow = async (window, priorAttempts) => {
    const attempt = priorAttempts.length + 1
    const id = attemptId(plan, window, attempt)
    const started_at = new Date().toISOString()
    const attemptStarted = performance.now()
    let status = "failed",
      reason = null,
      candidates = [],
      scanEvidence = null,
      result = null,
      scan_ms = 0,
      verify_ms = null,
      partialVerified = false
    try {
      const scanStarted = performance.now()
      const predecessor = plan.windows.find(
        (candidate) =>
          candidate.channel_id === window.channel_id && candidate.until_exclusive === window.since,
      )
      const reusableReceipt = predecessor
        ? receipts.find(
            (receipt) => sameWindow(receipt, predecessor) && receipt.status === "window_scanned",
          )
        : null
      result = await scan(window, id, reusableReceipt?.attempt_id || null)
      scan_ms = Math.round(performance.now() - scanStarted)
      scanEvidence = {
        list_scan_run: id,
        listing_source_version_id: result.summary.listing_source_version_id || null,
        index_documents: result.indexDocuments?.length || 0,
        documents: result.documents?.length || 0,
        parses: result.parses?.length || 0,
      }
      if (result.summary.status === "window_scanned") {
        const verifyStarted = performance.now()
        try {
          await verify(root, result, window)
        } finally {
          verify_ms = Math.round(performance.now() - verifyStarted)
        }
      } else {
        status =
          result.summary.status === "blocked" || result.summary.reason?.includes("blocked")
            ? "blocked"
            : "incomplete"
        reason = result.summary.reason || "window_incomplete"
        candidates = result.candidates.map((candidate) => candidate.key)
        if (result.summary.reason === "detail_incomplete" && candidates.length) {
          const verifyStarted = performance.now()
          try {
            verifyStoredPartialCandidates(root, result, window)
            partialVerified = true
          } finally {
            verify_ms = Math.round(performance.now() - verifyStarted)
          }
        }
      }
    } catch (error) {
      if (scanEvidence === null && scan_ms === 0)
        scan_ms = Math.round(performance.now() - attemptStarted)
      reason = error.message
    }
    return {
      window,
      id,
      started_at,
      attemptStarted,
      status,
      reason,
      candidates,
      result,
      scanEvidence,
      scan_ms,
      verify_ms,
      backlog_merge_ms: null,
      mergeResult: null,
      partialVerified,
    }
  }
  const commitOutcome = async (outcome) => {
    const { window, id, started_at, result, scanEvidence } = outcome
    if (result?.summary.status === "window_scanned" && outcome.reason === null) {
      const mergeStarted = performance.now()
      try {
        outcome.mergeResult = await merge(result, backlogFile)
        if (outcome.mergeResult.status !== "merged")
          throw Error("Completed route candidates were not merged")
        if (!Array.isArray(outcome.mergeResult.same_event_aliases))
          outcome.mergeResult.same_event_aliases = []
        outcome.status = "window_scanned"
        outcome.candidates = result.candidates.map((candidate) => candidate.key)
      } catch (error) {
        outcome.reason = error.message
        outcome.status = "failed"
      } finally {
        outcome.backlog_merge_ms = Math.round(performance.now() - mergeStarted)
      }
    }
    if (outcome.partialVerified) {
      const mergeStarted = performance.now()
      try {
        outcome.mergeResult = await mergePartialScan(
          root,
          result,
          backlogFile,
          undefined,
          sameEventAliases || new Map(),
        )
      } catch (error) {
        outcome.reason = error.message
        outcome.status = "failed"
      } finally {
        outcome.backlog_merge_ms = Math.round(performance.now() - mergeStarted)
      }
    }
    const receipt = {
      schema: "research-daily-receipt/v2",
      daily_run: plan.run_id,
      attempt_id: id,
      channel_id: window.channel_id,
      since: window.since,
      until_exclusive: window.until_exclusive,
      started_at,
      finished_at: new Date().toISOString(),
      timing_ms: {
        scan: outcome.scan_ms,
        verify: outcome.verify_ms,
        backlog_merge: outcome.backlog_merge_ms,
        total: outcome.scan_ms + (outcome.verify_ms ?? 0) + (outcome.backlog_merge_ms ?? 0),
      },
      status: outcome.status,
      reason: outcome.reason,
      candidate_keys: outcome.candidates,
      ...(scanEvidence ? { scan_evidence: scanEvidence } : {}),
      ...(outcome.mergeResult ? { backlog_merge: outcome.mergeResult } : {}),
      candidate_published: false,
    }
    atomicCreate(root, `daily/runs/${plan.run_id}/receipts/${id}.json`, receipt)
    receipts.push(receipt)
    current = applyDailyReceipts(coverage, plan, receipts)
    atomicWrite(root, COVERAGE_FILE, current)
  }
  const runRoute = async (windows) => {
    for (const window of windows) {
      if (stopped) return
      const priorAttempts = receipts.filter((receipt) => sameWindow(receipt, window))
      const lastAttempt = priorAttempts.at(-1)
      if (
        priorAttempts.some((receipt) => receipt.status === "window_scanned") ||
        hasSupplementalResultForWindow(root, coverage.routes[window.channel_id], window, {
          backlogFile,
          sameEventAliases,
        }) ||
        priorAttempts.length >= retryPolicy.max_attempts_per_window ||
        (lastAttempt?.status === "blocked" && retryPolicy.blocked_requires_new_observation)
      )
        continue
      const outcome = await scanWindow(window, priorAttempts)
      // Commit completed scans immediately, one at a time. The next window of
      // this route starts only after its verified receipt and backlog exist.
      const committed = commitQueue.then(() => commitOutcome(outcome))
      // The worker propagates this error; keep the shared queue drainable.
      commitQueue = committed.catch(() => {})
      await committed
    }
  }
  const workers = Array.from(
    { length: Math.min(MAX_PARALLEL_DAILY_ROUTES, pendingRoutes.length) },
    async () => {
      try {
        while (!stopped && pendingRoutes.length) await runRoute(pendingRoutes.shift())
      } catch (error) {
        stopped = true
        throw error
      }
    },
  )
  // Drain live scans even if a route's stored evidence fails validation.
  // The caller must not release its operation lock while workers still write.
  const results = await Promise.allSettled(workers)
  const failed = results.find((result) => result.status === "rejected")
  if (failed) throw failed.reason

  const routeResults = activeRoutes.map(({ route }) => {
    const windows = plan.windows.filter((item) => item.channel_id === route.channel_id)
    const complete = windows.every(
      (window) =>
        receipts.some(
          (receipt) => sameWindow(receipt, window) && receipt.status === "window_scanned",
        ) ||
        hasSupplementalResultForWindow(root, coverage.routes[window.channel_id], window, {
          backlogFile,
          sameEventAliases,
        }),
    )
    return { ...route, status: complete ? "partial" : "failed" }
  })
  const summary = {
    schema: "research-daily-summary/v1",
    run_id: plan.run_id,
    status: routeResults.every((route) => route.status === "partial")
      ? "configured_routes_scanned"
      : "partial",
    routes: routeResults.map((route) => ({
      channel_id: route.channel_id,
      status: route.status === "partial" ? "window_scanned" : "incomplete",
      last_contiguous_until: current.routes[route.channel_id].last_contiguous_until,
    })),
    coverage_grid: coverageGrid(routeResults),
    receipts: receipts.length,
    retry_policy: retryPolicy,
    execution: {
      max_parallel_routes: MAX_PARALLEL_DAILY_ROUTES,
      scheduling: "rolling-route-pool",
      route_windows_serialized: true,
      candidate_merges_serialized: true,
    },
    retry_queue: dailyRetryQueue(root, plan, receipts, current, {
      backlogFile,
      sameEventAliases,
    }),
    timing: summarizeDailyTiming(receipts, activeRoutes),
    candidate_published: false,
    drive_verified: false,
    public_verified: false,
  }
  atomicWrite(root, `daily/runs/${plan.run_id}/summary.json`, summary)
  return summary
}

function summarizeDailyTiming(receipts, activeRoutes) {
  for (const receipt of receipts) {
    if (receipt.timing_ms === undefined) continue
    if (
      !receipt.timing_ms ||
      ["scan", "verify", "backlog_merge", "total"].some((key) => {
        const value = receipt.timing_ms[key]
        return value !== null && (!Number.isSafeInteger(value) || value < 0)
      }) ||
      !Number.isSafeInteger(receipt.timing_ms.scan) ||
      !Number.isSafeInteger(receipt.timing_ms.total)
    )
      throw Error("Daily receipt has invalid phase timing")
  }
  const measured = receipts.filter(
    (receipt) =>
      receipt.timing_ms &&
      ["scan", "verify", "backlog_merge", "total"].every(
        (key) =>
          receipt.timing_ms[key] === null ||
          (Number.isSafeInteger(receipt.timing_ms[key]) && receipt.timing_ms[key] >= 0),
      ),
  )
  const sum = (key) => measured.reduce((total, receipt) => total + (receipt.timing_ms[key] ?? 0), 0)
  const timestamp = (value) => {
    const parsed = Date.parse(value || "")
    return Number.isFinite(parsed) ? parsed : null
  }
  const starts = receipts.map((receipt) => timestamp(receipt.started_at)).filter(Number.isFinite)
  const finishes = receipts.map((receipt) => timestamp(receipt.finished_at)).filter(Number.isFinite)
  return {
    unit: "ms",
    receipt_elapsed_ms: sum("total"),
    wall_clock_ms:
      starts.length && finishes.length
        ? Math.max(0, Math.max(...finishes) - Math.min(...starts))
        : null,
    measured_receipts: measured.length,
    unmeasured_receipts: receipts.length - measured.length,
    phases: {
      scan_ms: sum("scan"),
      verify_ms: sum("verify"),
      backlog_merge_ms: sum("backlog_merge"),
    },
    by_route: Object.fromEntries(
      activeRoutes.map(({ route }) => {
        const routeReceipts = measured.filter((receipt) => receipt.channel_id === route.channel_id)
        return [
          route.channel_id,
          {
            attempts: receipts.filter((receipt) => receipt.channel_id === route.channel_id).length,
            measured_attempts: routeReceipts.length,
            total_ms: routeReceipts.reduce((total, receipt) => total + receipt.timing_ms.total, 0),
          },
        ]
      }),
    ),
  }
}

export function createDailySourceScanner({ root, activeRoutes, runResearch }) {
  if (typeof runResearch !== "function") throw Error("Daily source runner is required")
  return async (window, attempt, reuseListingRun) => {
    const args = [
      "scan-list",
      "--root",
      root,
      "--run",
      attempt,
      "--channel",
      window.channel_id,
      "--since",
      window.since,
      "--until",
      window.until_exclusive,
    ]
    const route = activeRoutes.find((item) => item.route.channel_id === window.channel_id)?.route
    if (
      reuseListingRun &&
      route?.method === "html-list" &&
      route.listing_profile?.pagination === "single-page"
    )
      args.push("--reuse-listing-run", reuseListingRun)
    await runResearch(args)
    return storedListScan(root, attempt)
  }
}

export async function dailyScan({
  runId,
  mode,
  root = DEFAULT_ROOT,
  configFile = DAILY_CONFIG,
  vault = "vault",
  driveSnapshotFile,
  backlogFile,
  now = new Date().toISOString(),
  scan,
  verify,
  merge,
}) {
  backlogFile = requireExplicitBacklog(root, backlogFile)
  if (!/^[a-zA-Z0-9_-]+$/.test(runId || "")) throw Error("Invalid daily run ID")
  if (!["plan-only", "execute", "resume", "handoff"].includes(mode))
    throw Error("Daily scan mode required")
  if (mode === "handoff" && driveSnapshotFile)
    throw Error("Drive snapshot belongs to planning and execution, not stored handoff regeneration")
  return withLock(root, "daily-acquisition", async () => {
    if (mode === "handoff") {
      const { generateDailyHandoff } = await import("./editorial-handoff.mjs")
      const handoff = generateDailyHandoff({ root, runId, vault, backlogFile })
      if (!loadShadowCollectionInputs(root, runId))
        return {
          ...handoff,
          shadow_collection_basis: null,
          shadow_basis_status: "missing_original_collection_inputs",
        }
      const basis = await freezeShadowHandoffBasis({
        root,
        dailyRun: runId,
        handoffPath: handoff.path,
        backlogFile,
        receipts: readDailyReceipts(root, runId),
      })
      return { ...handoff, shadow_collection_basis: basis, shadow_basis_status: "frozen" }
    }
    const { config, activeRoutes, config_sha256 } = dailySources(configFile)
    const storedPlan = readJSON(root, `daily/runs/${runId}/plan.json`)
    const edition = driveSnapshotFile
      ? verifiedDriveEdition(driveSnapshotFile, vault, { allowStale: Boolean(storedPlan) })
      : localEditionSnapshot(vault)
    const coverage = bootstrapCoverage(root, activeRoutes, readJSON(root, COVERAGE_FILE), {
      backlogFile,
    })
    const planPath = `daily/runs/${runId}/plan.json`
    let plan = storedPlan
    if (!plan) {
      if (mode === "resume") throw Error("No stored daily plan to resume")
      const coverage_basis = dailyPlanningBasis(coverage, activeRoutes)
      plan = {
        ...planDailyWindows({
          runId,
          now,
          cutoff: edition.cutoff,
          cutoffBasis: edition.authority,
          config,
          activeRoutes,
          coverage: coverage_basis,
        }),
        created_at: new Date(now).toISOString(),
        config_sha256,
        edition,
        coverage_basis,
        coverage_basis_sha256: sha256(JSON.stringify(coverage_basis)),
      }
      atomicCreate(root, planPath, plan)
    } else
      validateStoredDailyPlan(plan, {
        runId,
        config,
        activeRoutes,
        configSha: config_sha256,
        edition,
      })
    if (mode === "plan-only")
      return { run_id: runId, status: "planned", windows: plan.windows.length, plan_path: planPath }
    await freezeShadowCollectionInputs({
      root,
      plan,
      activeRoutes,
      sourcePaths: dailySourcePaths(configFile),
      configFile,
    })
    const sourceAliases = merge ? null : loadSameEventSourceAliases(root, backlogFile)
    const mergeScan =
      merge || ((scan, file) => mergeCompletedScan(scan, file, undefined, sourceAliases))
    const actualScan =
      scan ||
      createDailySourceScanner({
        root,
        activeRoutes,
        runResearch: async (args) => {
          const { main } = await import("../research-scan.mjs")
          await main(args)
        },
      })
    const summary = await executeDailyPlan({
      root,
      plan,
      coverage,
      activeRoutes,
      backlogFile,
      scan: actualScan,
      verify,
      merge: mergeScan,
      sameEventAliases: sourceAliases,
    })
    const { generateDailyHandoff } = await import("./editorial-handoff.mjs")
    const handoff = generateDailyHandoff({ root, runId, vault, backlogFile })
    const basis = await freezeShadowHandoffBasis({
      root,
      dailyRun: runId,
      handoffPath: handoff.path,
      backlogFile,
      receipts: readDailyReceipts(root, runId),
    })
    return {
      ...summary,
      editorial_handoff: handoff,
      shadow_collection_basis: basis,
      shadow_basis_status: "frozen",
    }
  })
}
