import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { execFileSync } from "node:child_process"
import { registry } from "./discovery.mjs"
import { collectionBasis } from "./scan-basis.mjs"
import { storedListScan, verifyStoredListScan } from "./daily-scan.mjs"
import { validateDailyRoutes, kstDay, shiftDay } from "./daily-plan.mjs"
import { mergeCompletedScan } from "./scan-completion.mjs"
import { articleContentFingerprint } from "./parser.mjs"
import { sha256 } from "./contracts.mjs"
import {
  atomicCreate,
  atomicWrite,
  readJSON,
  safePath,
  withGardenOperationLock,
  DEFAULT_ROOT,
} from "./run-state.mjs"

const files = [
  "data/research-source-channels.json",
  "data/research-watchlist.json",
  "data/research-acquisition.json",
  "data/research-source-recipes.json",
  "data/research-daily-routes.json",
]
const safeId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value)
const artifactNames = [
  "list-scan.json",
  "documents.json",
  "parses.json",
  "candidates.json",
  "list-pages.json",
]

function context(options) {
  const repo = path.resolve(options.repo || process.cwd())
  const root = path.resolve(repo, options.root || DEFAULT_ROOT)
  const snapshots = files.map((file) => ({ file, bytes: fs.readFileSync(safePath(repo, file)) }))
  const [channels, watchlist, adapters, recipes, daily] = snapshots.map((s) => JSON.parse(s.bytes))
  const routes = registry(channels, watchlist, adapters, recipes)
  const route = routes.find((r) => r.channel_id === options.channel)
  if (
    !route ||
    !route.onboarding ||
    !["configured", "verified"].includes(route.onboarding.status) ||
    !route.onboarding.collection_enabled
  )
    throw Error("Configured collection route required")
  return {
    repo,
    root,
    snapshots,
    channels,
    daily,
    routes,
    route,
    profiles: adapters.article_profiles || [],
  }
}

function hashes(root, run) {
  return Object.fromEntries(
    artifactNames.map((name) => {
      const file = safePath(root, `runs/${run}/${name}`)
      return [name, fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null]
    }),
  )
}

function stageSnapshot(root, run) {
  const state = readJSON(root, `runs/${run}/state.json`)
  if (state?.schema !== "research-run/v1" || state.run_id !== run || !state.stages)
    throw Error("Stored scan checkpoints required")
  for (const stage of Object.values(state.stages)) {
    if (stage.status !== "complete" || typeof stage.result_path !== "string")
      throw Error("Incomplete scan checkpoint")
    const artifact = readJSON(root, stage.result_path)
    if (sha256(JSON.stringify(artifact)) !== stage.result_hash)
      throw Error("Scan checkpoint hash changed")
  }
  return sha256(JSON.stringify(state.stages))
}

function checkedScan(ctx, run) {
  if (!safeId(run)) throw Error("Valid scan run required")
  const scan = storedListScan(ctx.root, run)
  const window = scan.summary.window
  if (
    !window ||
    window.since >= window.until_exclusive ||
    window.until_exclusive > shiftDay(kstDay(new Date()), 1)
  )
    throw Error("Future or invalid scan window cannot prove onboarding")
  verifyStoredListScan(ctx.root, scan, { channel_id: ctx.route.channel_id, ...window })
  const state = readJSON(ctx.root, `runs/${run}/state.json`)
  const basis = collectionBasis(ctx.route, ctx.profiles, ctx.repo)
  const stage = state?.stages?.["collection-basis"]
  if (
    !stage ||
    stage.result_path !== `runs/${run}/collection-basis.json` ||
    stage.status !== "complete" ||
    stage.input_hash !== sha256(JSON.stringify(basis)) ||
    stage.result_hash !== sha256(JSON.stringify(basis)) ||
    JSON.stringify(readJSON(ctx.root, stage.result_path)) !== JSON.stringify(basis)
  )
    throw Error("Scan collection basis is missing or stale; collect with current code/settings")
  for (const document of [...scan.documents, ...scan.indexDocuments]) {
    if (document.policy_status !== "checked") throw Error("Source policy evidence must be checked")
  }
  for (const candidate of scan.candidates) {
    const parsed = scan.parses.find((p) => p.parse_id === candidate.article_parse_id)
    if (!parsed || candidate.article_content_sha256 !== articleContentFingerprint(parsed))
      throw Error("Candidate content fingerprint changed")
  }
  return { scan, basis, stage_hash: stageSnapshot(ctx.root, run), artifacts: hashes(ctx.root, run) }
}

async function defaultResume(ctx, run, window) {
  const output = execFileSync(
    process.execPath,
    [
      "scripts/research-scan.mjs",
      "scan-list",
      "--root",
      ctx.root,
      "--run",
      run,
      "--channel",
      ctx.route.channel_id,
      "--since",
      window.since,
      "--until",
      window.until_exclusive,
    ],
    { cwd: ctx.repo, encoding: "utf8", timeout: 60000, maxBuffer: 1024 * 1024 },
  )
  if (JSON.parse(output).status !== "window_scanned")
    throw Error("Resume did not complete the source window")
}

export async function verifySourceOnboarding(options, { resume = defaultResume } = {}) {
  const initial = context(options)
  return withGardenOperationLock(initial.root, async () => {
    const ctx = context(options)
    if (options.baselineRun === options.emptyRun)
      throw Error("Separate normal and empty scan runs required")
    const normal = checkedScan(ctx, options.baselineRun),
      empty = checkedScan(ctx, options.emptyRun)
    if (!normal.scan.candidates.length || empty.scan.candidates.length)
      throw Error("Normal candidates and a completed empty window required")
    const relative = `source-onboarding/${crypto.randomUUID()}`
    for (const [run, proof] of [
      [options.baselineRun, normal],
      [options.emptyRun, empty],
    ]) {
      await resume(ctx, run, proof.scan.summary.window)
      const again = checkedScan(ctx, run)
      if (
        proof.stage_hash !== again.stage_hash ||
        JSON.stringify(proof.artifacts) !== JSON.stringify(again.artifacts)
      )
        throw Error("Resume replaced checkpoints or scan artifacts")
    }
    const scratch = safePath(ctx.root, `${relative}/candidate-backlog.json`)
    await mergeCompletedScan(normal.scan, scratch)
    const first = sha256(fs.readFileSync(scratch))
    await mergeCompletedScan(normal.scan, scratch)
    await mergeCompletedScan(empty.scan, scratch)
    if (sha256(fs.readFileSync(scratch)) !== first)
      throw Error("Repeated/empty scan merge changed candidate identity")
    const receipt = {
      schema: "research-source-onboarding/v1",
      channel_id: ctx.route.channel_id,
      verified_at: new Date().toISOString(),
      collection_basis: normal.basis,
      baseline: {
        run_id: options.baselineRun,
        window: normal.scan.summary.window,
        artifacts: normal.artifacts,
        stage_hash: normal.stage_hash,
      },
      empty: {
        run_id: options.emptyRun,
        window: empty.scan.summary.window,
        artifacts: empty.artifacts,
        stage_hash: empty.stage_hash,
      },
      duplicate_check: {
        path: `${relative}/candidate-backlog.json`,
        sha256: first,
        count: normal.scan.candidates.length,
      },
      checkpoints_reused: true,
      daily_activated: false,
      candidate_approved: false,
      candidate_published: false,
    }
    atomicCreate(ctx.root, `${relative}/verification.json`, receipt)
    return { ...receipt, receipt: `${relative}/verification.json` }
  })
}

function activationPlan(ctx, relative) {
  if (
    typeof relative !== "string" ||
    !/^source-onboarding\/[a-f0-9-]{36}\/verification\.json$/.test(relative)
  )
    throw Error("Private onboarding verification receipt required")
  const receipt = readJSON(ctx.root, relative)
  if (
    receipt?.schema !== "research-source-onboarding/v1" ||
    receipt.channel_id !== ctx.route.channel_id ||
    !receipt.checkpoints_reused
  )
    throw Error("Onboarding receipt does not match channel")
  for (const proof of [receipt.baseline, receipt.empty]) {
    const actual = checkedScan(ctx, proof?.run_id)
    if (
      actual.stage_hash !== proof.stage_hash ||
      JSON.stringify(actual.artifacts) !== JSON.stringify(proof.artifacts) ||
      JSON.stringify(actual.basis) !== JSON.stringify(receipt.collection_basis)
    )
      throw Error("Onboarding scan evidence changed")
  }
  const normal = checkedScan(ctx, receipt.baseline.run_id),
    empty = checkedScan(ctx, receipt.empty.run_id)
  if (!normal.scan.candidates.length || empty.scan.candidates.length)
    throw Error("Onboarding normal/empty evidence invalid")
  const scratch = readJSON(ctx.root, receipt.duplicate_check.path)
  if (
    !scratch ||
    sha256(fs.readFileSync(safePath(ctx.root, receipt.duplicate_check.path))) !==
      receipt.duplicate_check.sha256 ||
    scratch.candidates.length !== normal.scan.candidates.length ||
    receipt.duplicate_check.count !== normal.scan.candidates.length ||
    JSON.stringify(scratch.candidates.map((c) => c.key).sort()) !==
      JSON.stringify(normal.scan.candidates.map((c) => c.key).sort())
  )
    throw Error("Onboarding duplicate evidence changed")
  const channels = structuredClone(ctx.channels),
    daily = structuredClone(ctx.daily)
  const channel = channels.channels.find((c) => c.id === ctx.route.channel_id)
  if (!channel) throw Error("Onboarding applies only to registered source channels")
  channel.onboarding = {
    ...channel.onboarding,
    status: "verified",
    remaining_checks: [],
    verification_receipt: relative,
  }
  const existing = daily.routes.find((r) => r.channel_id === channel.id)
  if (existing && existing.baseline_run !== receipt.baseline.run_id)
    throw Error("Existing baseline requires separate coverage reconciliation")
  if (existing) existing.enabled = true
  else
    daily.routes.push({
      channel_id: channel.id,
      enabled: true,
      baseline_run: receipt.baseline.run_id,
    })
  const routes = ctx.routes.map((r) =>
    r.channel_id === channel.id ? { ...r, onboarding: channel.onboarding } : r,
  )
  const active = validateDailyRoutes(daily, routes)
  return { channels, daily, active, baseline_run: receipt.baseline.run_id }
}

export async function activateSourceOnboarding(options) {
  const initial = context(options)
  return withGardenOperationLock(initial.root, async () => {
    const ctx = context(options),
      plan = activationPlan(ctx, options.receipt)
    const beforeActive = validateDailyRoutes(ctx.daily, ctx.routes).length
    const report = {
      channel_id: options.channel,
      baseline_run: plan.baseline_run,
      daily_before: beforeActive,
      daily_after: plan.active.length,
      candidate_approved: false,
      candidate_published: false,
    }
    if (!options.apply) return { ...report, status: "dry_run" }
    const changes = [
      [files[0], plan.channels],
      [files[4], plan.daily],
    ].map(([file, value]) => ({
      file,
      value,
      before: ctx.snapshots.find((s) => s.file === file).bytes,
      after: Buffer.from(JSON.stringify(value, null, 2) + "\n"),
    }))
    if (changes.every((c) => c.before.equals(c.after))) return { ...report, status: "unchanged" }
    const relative = `source-onboarding/${crypto.randomUUID()}`
    const evidence = {
      ...report,
      verification_receipt: options.receipt,
      changes: changes.map((c) => ({
        file: c.file,
        before_sha256: sha256(c.before),
        after_sha256: sha256(c.after),
      })),
    }
    for (const snapshot of ctx.snapshots)
      if (sha256(fs.readFileSync(safePath(ctx.repo, snapshot.file))) !== sha256(snapshot.bytes))
        throw Error("Source configuration changed before activation")
    for (const c of changes)
      atomicCreate(ctx.root, `${relative}/${path.basename(c.file)}.before`, c.before)
    atomicCreate(ctx.root, `${relative}/prepared.json`, evidence)
    // Source verification precedes the daily entry. A partial write leaves a
    // verified but inactive route, with both original files preserved.
    for (const c of changes) {
      if (sha256(fs.readFileSync(safePath(ctx.repo, c.file))) !== sha256(c.before))
        throw Error("Activation file changed; inspect prepared receipt: " + relative)
      atomicWrite(ctx.repo, c.file, c.value)
    }
    for (const c of changes)
      if (sha256(fs.readFileSync(safePath(ctx.repo, c.file))) !== sha256(c.after))
        throw Error("Activation readback mismatch; inspect prepared receipt: " + relative)
    atomicCreate(ctx.root, `${relative}/applied.json`, evidence)
    return { ...report, status: "applied", receipt: `${relative}/applied.json` }
  })
}
