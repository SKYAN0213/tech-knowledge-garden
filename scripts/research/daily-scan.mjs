import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { canonicalURL, editions } from "../garden.mjs"
import { registry, coverageGrid } from "./discovery.mjs"
import { sourceId, sha256 } from "./contracts.mjs"
import { assertStoredEvidence } from "./parser.mjs"
import {
  DEFAULT_ROOT,
  atomicCreate,
  atomicWrite,
  readJSON,
  safePath,
  withLock,
} from "./run-state.mjs"
import { coveredFrontier, kstDay, planDailyWindows, validateDailyRoutes } from "./daily-plan.mjs"
import { mergeCompletedScan } from "./scan-completion.mjs"

export const DAILY_CONFIG = "data/research-daily-routes.json"
export const DAILY_BACKLOG = ".local/research/candidate-backlog.json"
const COVERAGE_FILE = "daily/route-coverage.json"

const load = (file) => JSON.parse(fs.readFileSync(file, "utf8"))
const sameWindow = (a, b) =>
  a.channel_id === b.channel_id && a.since === b.since && a.until_exclusive === b.until_exclusive

export function dailySources(configFile = DAILY_CONFIG) {
  const config = load(configFile)
  const routes = registry(
    load("data/research-source-channels.json"),
    load("data/research-watchlist.json"),
    load("data/research-acquisition.json"),
  )
  const activeRoutes = validateDailyRoutes(config, routes)
  if (!activeRoutes.length) throw Error("No active daily acquisition routes")
  const sourcePaths = [
    configFile,
    "data/research-source-channels.json",
    "data/research-watchlist.json",
    "data/research-acquisition.json",
    "scripts/garden.mjs",
    "scripts/research.mjs",
    "scripts/research-daily.mjs",
    "scripts/research/daily-plan.mjs",
    "scripts/research/daily-scan.mjs",
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
    "scripts/research/source-policy.mjs",
    "scripts/research/list-scan.mjs",
    "scripts/research/rss-scan.mjs",
    "scripts/research/monthly-scan.mjs",
    "scripts/research/api-scan.mjs",
    "scripts/research/kuka-scan.mjs",
    "scripts/research/abb-scan.mjs",
    "integrations/research-worker/worker.py",
  ]
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
  for (const key of ["schema", "run_id", "kst_day", "cutoff", "cutoff_basis", "windows"]) {
    if (JSON.stringify(plan[key]) !== JSON.stringify(expected[key]))
      throw Error("Stored daily plan windows differ from the verified planning basis")
  }
  return true
}

function verifyDocument(root, document) {
  if (
    !["captured", "not_modified"].includes(document.fetch_status) ||
    !/^[a-f0-9]{64}$/.test(document.body_sha256 || "") ||
    document.source_id !== sourceId(document.original_url) ||
    document.source_version_id !== `${document.source_id}:${document.body_sha256}`
  )
    throw Error("Daily scan source document identity is invalid")
  const body = fs.readFileSync(safePath(root, document.body_path))
  if (sha256(body) !== document.body_sha256) throw Error("Daily scan original body hash mismatch")
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

export function verifyStoredListScan(root, scan, expected, { allowLegacyCandidates = false } = {}) {
  if (
    scan.summary.status !== "window_scanned" ||
    scan.summary.channel_id !== expected.channel_id ||
    scan.summary.window?.since !== expected.since ||
    scan.summary.window?.until_exclusive !== expected.until_exclusive ||
    !Array.isArray(scan.documents) ||
    !Array.isArray(scan.parses) ||
    !Array.isArray(scan.candidates) ||
    !Array.isArray(scan.indexDocuments)
  )
    throw Error("Stored scan does not prove the requested route window")
  if (![...scan.indexDocuments, ...scan.documents].length)
    throw Error("A covered route window needs stored listing bytes")
  for (const document of [...scan.indexDocuments, ...scan.documents]) verifyDocument(root, document)
  if (scan.parses.length || scan.documents.length) {
    if (!scan.parses.length || !scan.documents.length)
      throw Error("Stored detail documents and parses must agree")
    assertStoredEvidence(root, scan.documents, scan.parses)
  }
  for (const candidate of scan.candidates) {
    const document = scan.documents.find((item) =>
      candidate.article_source_version_id
        ? item.source_version_id === candidate.article_source_version_id
        : allowLegacyCandidates && candidate.key === "source-" + item.source_id,
    )
    const parsed = scan.parses.find((item) =>
      candidate.article_parse_id
        ? item.parse_id === candidate.article_parse_id
        : allowLegacyCandidates && item.source_version_id === document?.source_version_id,
    )
    if (
      !document ||
      !parsed ||
      !candidate.source_urls?.some(
        (url) => canonicalURL(url) === canonicalURL(document.original_url),
      ) ||
      candidate.source_published_at !== parsed.dates?.published_at
    )
      throw Error("Candidate lacks a matching stored detail source, parse and publication day")
  }
  if (
    scan.summary.candidate_count !== undefined &&
    scan.summary.candidate_count !== scan.candidates.length
  )
    throw Error("Stored scan candidate count changed")
  return true
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

export function verifyDailyCoverageEvidence(root, channelId, state) {
  for (const span of state.covered) {
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

export function bootstrapCoverage(root, activeRoutes, previous = null) {
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
    verifyDailyCoverageEvidence(root, entry.channel_id, repaired)
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
      receipt.schema !== "research-daily-receipt/v1" ||
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
    } else if (!state.unresolved.some((gap) => sameWindow(gap, receipt)))
      state.unresolved.push({
        since: receipt.since,
        until_exclusive: receipt.until_exclusive,
        reason: receipt.reason || receipt.status,
        last_attempt: receipt.attempt_id,
      })
    state.last_contiguous_until = coveredFrontier(state.anchor_since, state.covered)
  }
  return result
}

function attemptId(plan, window, attempt) {
  return `${plan.run_id}_${window.channel_id}_${window.since.replaceAll("-", "")}_${window.until_exclusive.replaceAll("-", "")}_a${attempt}`
}

export function verifyDailyReceipts(
  root,
  plan,
  receipts,
  { loadStored = storedListScan, verify = verifyStoredListScan } = {},
) {
  const seen = new Set()
  for (const receipt of receipts) {
    const window = plan.windows.find((item) => sameWindow(item, receipt))
    const attemptNumber = Number(receipt.attempt_id?.match(/_a([1-9]\d*)$/)?.[1])
    if (
      receipt.schema !== "research-daily-receipt/v1" ||
      receipt.daily_run !== plan.run_id ||
      !window ||
      !Number.isSafeInteger(attemptNumber) ||
      receipt.attempt_id !== attemptId(plan, window, attemptNumber) ||
      seen.has(receipt.attempt_id)
    )
      throw Error("Daily receipt identity does not match the stored plan")
    seen.add(receipt.attempt_id)
    if (receipt.status !== "window_scanned") continue
    const stored = loadStored(root, receipt.attempt_id)
    verify(root, stored, window)
    if (
      receipt.scan_evidence?.list_scan_run !== receipt.attempt_id ||
      receipt.scan_evidence?.listing_source_version_id !==
        (stored.summary.listing_source_version_id || null) ||
      receipt.scan_evidence?.index_documents !== (stored.indexDocuments?.length || 0) ||
      receipt.scan_evidence?.documents !== (stored.documents?.length || 0) ||
      receipt.scan_evidence?.parses !== (stored.parses?.length || 0) ||
      JSON.stringify(receipt.candidate_keys) !==
        JSON.stringify(stored.candidates.map((candidate) => candidate.key)) ||
      receipt.backlog_merge?.status !== "merged"
    )
      throw Error("Daily receipt no longer matches its completed stored scan")
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
}) {
  const receipts = readDailyReceipts(root, plan.run_id)
  verifyDailyReceipts(root, plan, receipts, { loadStored, verify })
  let current = applyDailyReceipts(coverage, plan, receipts)
  atomicWrite(root, COVERAGE_FILE, current)
  for (const window of plan.windows) {
    if (
      receipts.some((receipt) => sameWindow(receipt, window) && receipt.status === "window_scanned")
    )
      continue
    const attempt = receipts.filter((receipt) => sameWindow(receipt, window)).length + 1
    const id = attemptId(plan, window, attempt)
    const started_at = new Date().toISOString()
    let status = "failed",
      reason = null,
      candidates = [],
      mergeResult = null,
      scanEvidence = null
    try {
      const result = await scan(window, id)
      scanEvidence = {
        list_scan_run: id,
        listing_source_version_id: result.summary.listing_source_version_id || null,
        index_documents: result.indexDocuments?.length || 0,
        documents: result.documents?.length || 0,
        parses: result.parses?.length || 0,
      }
      if (result.summary.status === "window_scanned") {
        verify(root, result, window)
        mergeResult = await merge(result, backlogFile)
        if (mergeResult.status !== "merged")
          throw Error("Completed route candidates were not merged")
        status = "window_scanned"
        candidates = result.candidates.map((candidate) => candidate.key)
      } else {
        status = result.summary.reason?.includes("blocked") ? "blocked" : "incomplete"
        reason = result.summary.reason || "window_incomplete"
        candidates = result.candidates.map((candidate) => candidate.key)
      }
    } catch (error) {
      reason = error.message
    }
    const receipt = {
      schema: "research-daily-receipt/v1",
      daily_run: plan.run_id,
      attempt_id: id,
      channel_id: window.channel_id,
      since: window.since,
      until_exclusive: window.until_exclusive,
      started_at,
      finished_at: new Date().toISOString(),
      status,
      reason,
      candidate_keys: candidates,
      ...(scanEvidence ? { scan_evidence: scanEvidence } : {}),
      ...(mergeResult ? { backlog_merge: mergeResult } : {}),
      candidate_published: false,
    }
    atomicCreate(root, `daily/runs/${plan.run_id}/receipts/${id}.json`, receipt)
    receipts.push(receipt)
    current = applyDailyReceipts(coverage, plan, receipts)
    atomicWrite(root, COVERAGE_FILE, current)
  }
  const routeResults = activeRoutes.map(({ route }) => {
    const windows = plan.windows.filter((item) => item.channel_id === route.channel_id)
    const complete = windows.every((window) =>
      receipts.some(
        (receipt) => sameWindow(receipt, window) && receipt.status === "window_scanned",
      ),
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
    candidate_published: false,
    drive_verified: false,
    public_verified: false,
  }
  atomicWrite(root, `daily/runs/${plan.run_id}/summary.json`, summary)
  return summary
}

export async function dailyScan({
  runId,
  mode,
  root = DEFAULT_ROOT,
  configFile = DAILY_CONFIG,
  vault = "vault",
  driveSnapshotFile,
  backlogFile = DAILY_BACKLOG,
  now = new Date().toISOString(),
  scan,
  verify,
  merge,
}) {
  if (!/^[a-zA-Z0-9_-]+$/.test(runId || "")) throw Error("Invalid daily run ID")
  if (!["plan-only", "execute", "resume", "handoff"].includes(mode))
    throw Error("Daily scan mode required")
  if (mode === "handoff" && driveSnapshotFile)
    throw Error("Drive snapshot belongs to planning and execution, not stored handoff regeneration")
  return withLock(root, "daily-acquisition", async () => {
    if (mode === "handoff") {
      const { generateDailyHandoff } = await import("./editorial-handoff.mjs")
      return generateDailyHandoff({ root, runId, vault, backlogFile })
    }
    const { config, activeRoutes, config_sha256 } = dailySources(configFile)
    const storedPlan = readJSON(root, `daily/runs/${runId}/plan.json`)
    const edition = driveSnapshotFile
      ? verifiedDriveEdition(driveSnapshotFile, vault, { allowStale: Boolean(storedPlan) })
      : localEditionSnapshot(vault)
    const coverage = bootstrapCoverage(root, activeRoutes, readJSON(root, COVERAGE_FILE))
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
    const actualScan =
      scan ||
      (async (window, attempt) => {
        const { main } = await import("../research.mjs")
        await main([
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
        ])
        return storedListScan(root, attempt)
      })
    const summary = await executeDailyPlan({
      root,
      plan,
      coverage,
      activeRoutes,
      backlogFile,
      scan: actualScan,
      verify,
      merge,
    })
    const { generateDailyHandoff } = await import("./editorial-handoff.mjs")
    const handoff = generateDailyHandoff({ root, runId, vault, backlogFile })
    return { ...summary, editorial_handoff: handoff }
  })
}
