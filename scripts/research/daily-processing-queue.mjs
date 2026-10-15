import fs from "node:fs"
import { createApprovalReceiptSnapshot } from "./approval-receipts.mjs"
import path from "node:path"
import { readBacklog } from "../research-window.mjs"
import { sha256 } from "./contracts.mjs"
import { loadShadowHandoffBasis } from "./shadow-collection-basis.mjs"
import {
  loadFrozenDailyProcessingHandoff,
  matchesFrozenDailyCandidate,
  matchesFrozenDailyCandidateSource,
  FROZEN_CANDIDATE_FIELDS,
} from "./frozen-daily-processing-handoff.mjs"
import { processDailyCandidates } from "./daily-processing.mjs"
import { loadCurrentCandidateDisposition } from "./candidate-disposition.mjs"
import {
  loadCurrentCandidateApproval,
  resolveFrozenCandidateApproval,
} from "./candidate-approval.mjs"
import { loadSourceDetailReview, findStoredSourceDetailReviewFiles } from "./source-followups.mjs"
import { assertProcessingRecoveryRequest, processingSourceLockName } from "./processing-reuse.mjs"
import {
  acquireLock,
  atomicCreate,
  atomicWrite,
  readJSON,
  safePath,
  withLock,
} from "./run-state.mjs"

const eligibleRoutes = new Set(["historical-review", "review-publication-time"])
const sourceIdentity = (row) =>
  JSON.stringify([row.article_source_version_id, row.article_parse_id, row.article_content_sha256])
const compare = (a, b) =>
  Number(b.priority === "high") - Number(a.priority === "high") ||
  (b.source_published_at || "").localeCompare(a.source_published_at || "") ||
  (a.discovered_at || "").localeCompare(b.discovered_at || "") ||
  a.key.localeCompare(b.key)

const publisher = (row) => {
  const url = new URL(row.source_urls?.[0])
  if (!["https:", "http:"].includes(url.protocol))
    throw Error("Queue candidates require an HTTP source URL")
  return url.hostname.toLowerCase().replace(/^www\./, "")
}

// Preserve urgent work and chronological order within each source, while a
// high-volume feed cannot consume every slot before other sources are read.
// This is source scheduling, not a verified article classification or quota.
function interleaveSources(rows) {
  const result = []
  for (const urgent of [true, false]) {
    const groups = new Map()
    for (const row of rows.filter((row) => (row.priority === "high") === urgent)) {
      const host = publisher(row)
      if (!groups.has(host)) groups.set(host, [])
      groups.get(host).push(row)
    }
    const queues = [...groups.values()]
    for (let offset = 0; queues.some((group) => offset < group.length); offset++)
      for (const group of queues) if (group[offset]) result.push(group[offset])
  }
  return result
}

// Selection is a processing order, never an assessment of newsworthiness or
// permission to publish. Only exact source identity avoids duplicate work.
export function planDailyProcessingQueue(handoff, limit = 40, currentCandidates) {
  if (
    handoff?.schema !== "research-editorial-handoff/v1" ||
    !Array.isArray(handoff.pending) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 500 ||
    handoff.pending.some((row) => typeof row.key !== "string" || !row.key.trim()) ||
    new Set(handoff.pending.map((row) => row.key)).size !== handoff.pending.length
  )
    throw Error("Unique daily candidates and a queue limit from 1 to 500 required")
  const selected = [],
    routes = new Map(),
    eligible = [],
    owners = new Map()
  const ordered = [...handoff.pending].sort(compare)
  for (const row of ordered) {
    if (
      row.review_status !== "unreviewed" ||
      row.event_id ||
      !eligibleRoutes.has(row.next_route) ||
      row.source_revision_alert
    ) {
      routes.set(row.key, {
        candidate_key: row.key,
        status: "review_required",
        next_route: row.next_route,
      })
      continue
    }
    if (
      row.source_evidence_state !== "exact" ||
      !row.article_source_version_id ||
      !row.article_parse_id ||
      !/^[a-f0-9]{64}$/.test(row.article_content_sha256 || "")
    ) {
      routes.set(row.key, {
        candidate_key: row.key,
        status: "source_required",
        next_route: row.next_route,
      })
      continue
    }
    const reviewedCandidate = currentCandidates?.find((candidate) => candidate.key === row.key)
    const approvedSource =
      reviewedCandidate?.review_status === "verified" &&
      reviewedCandidate.event_id &&
      matchesFrozenDailyCandidateSource(row, currentCandidates)
    if (
      currentCandidates &&
      !matchesFrozenDailyCandidate(row, currentCandidates) &&
      !approvedSource
    ) {
      routes.set(row.key, {
        candidate_key: row.key,
        status: "candidate_changed",
        next_route: row.next_route,
      })
      continue
    }
    const identity = sourceIdentity(row)
    if (owners.has(identity)) {
      routes.set(row.key, {
        candidate_key: row.key,
        status: "same_source",
        primary_candidate_key: owners.get(identity),
      })
    } else {
      owners.set(identity, row.key)
      eligible.push(row)
    }
  }
  const balanced = interleaveSources(eligible)
  const hosts = new Map()
  for (const [index, row] of balanced.entries()) {
    const host = publisher(row)
    if (!hosts.has(host)) hosts.set(host, { source_host: host, eligible: 0, selected: 0 })
    const group = hosts.get(host)
    group.eligible++
    if (index < limit) {
      selected.push(row.key)
      group.selected++
    } else routes.set(row.key, { candidate_key: row.key, status: "next_queue" })
  }
  return {
    candidate_keys: selected,
    routed: ordered.filter((row) => routes.has(row.key)).map((row) => routes.get(row.key)),
    selection_summary: {
      strategy: "priority-source-round-robin/v1",
      eligible_sources: hosts.size,
      selected_sources: [...hosts.values()].filter((host) => host.selected).length,
      sources: [...hosts.values()],
      verified_coverage: false,
    },
  }
}

// Reuse the frozen collection and native single-candidate processor. Each
// completed child can continue with process-daily --from-processing; no new
// fact/editorial approval or publication mechanism is introduced here.
export async function processDailyQueue({
  root,
  runId,
  dailyRunId,
  collectionBasis,
  policyFile = "data/research-model-policy.json",
  backlogFile = ".local/research/candidate-backlog.json",
  vault = "vault",
  limit = 40,
  maxItems = 4,
  timeBudgetMs = 1_800_000,
  processingRecoveries,
  sourceReviewFiles,
  execute = false,
  readOnly = false,
  clock = Date.now,
  basisLoader = loadShadowHandoffBasis,
  candidateLoader = loadFrozenDailyProcessingHandoff,
  processor = processDailyCandidates,
}) {
  if (
    !/^[A-Za-z0-9_-]{1,70}$/.test(runId || "") ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(dailyRunId || "") ||
    runId === dailyRunId ||
    typeof collectionBasis !== "string" ||
    !collectionBasis ||
    !Number.isSafeInteger(maxItems) ||
    maxItems < 1 ||
    maxItems > 500 ||
    !Number.isSafeInteger(timeBudgetMs) ||
    timeBudgetMs < 1 ||
    timeBudgetMs > 3_600_000
  )
    throw Error("Distinct queue/daily IDs, frozen collection and bounded execution required")
  if (readOnly && execute) throw Error("Read-only queue cannot process sources")
  root = path.resolve(root)
  backlogFile = path.resolve(backlogFile)
  return withLock(root, "daily-queue-" + runId, async () => {
    const base = `runs/${runId}/`
    const basisBytes = fs.readFileSync(safePath(root, collectionBasis))
    const basisReference = { path: collectionBasis, sha256: sha256(basisBytes) }
    const basis = basisLoader(root, basisReference)
    if (basis.daily_run !== dailyRunId) throw Error("Queue collection belongs to another daily run")
    const handoffBytes = fs.readFileSync(safePath(root, basis.handoff.path))
    if (sha256(handoffBytes) !== basis.handoff.sha256) throw Error("Queue handoff changed")
    const handoff = JSON.parse(handoffBytes)
    if (handoff.daily_run !== dailyRunId) throw Error("Queue handoff belongs to another daily run")
    const previousInput = readJSON(root, base + "daily-queue-input.json")
    if (readOnly && !previousInput) throw Error("Read-only queue requires a frozen input")
    let candidateBasis
    if (previousInput) {
      candidateBasis = previousInput.candidate_basis
      if (
        !candidateBasis ||
        sha256(fs.readFileSync(safePath(root, candidateBasis.path))) !== candidateBasis.sha256
      )
        throw Error("Queue candidate selection basis changed")
    } else {
      candidateBasis = await withLock(path.dirname(backlogFile), "candidate-backlog", () => {
        const backlog = readBacklog(backlogFile)
        if (!Array.isArray(backlog?.candidates)) throw Error("Existing candidate backlog required")
        const keys = new Set(handoff.pending.map((row) => row.key))
        const snapshot = {
          schema: "research-queue-candidate-basis/v1",
          candidates: backlog.candidates
            .filter((row) => keys.has(row.key))
            .map((row) =>
              Object.fromEntries(
                FROZEN_CANDIDATE_FIELDS.map((field) => [field, row[field] ?? null]),
              ),
            ),
        }
        const file = base + "queue-candidate-basis.json"
        const oldBasis = readJSON(root, file)
        if (oldBasis && JSON.stringify(oldBasis) !== JSON.stringify(snapshot))
          throw Error("Interrupted queue candidate basis changed; use a new run")
        if (!oldBasis) atomicCreate(root, file, snapshot)
        return { path: file, sha256: sha256(fs.readFileSync(safePath(root, file))) }
      })
    }
    const candidates = readJSON(root, candidateBasis.path)
    if (
      candidates?.schema !== "research-queue-candidate-basis/v1" ||
      !Array.isArray(candidates.candidates)
    )
      throw Error("Frozen queue candidate basis required")
    const selection = planDailyProcessingQueue(handoff, limit, candidates.candidates)
    processingRecoveries = processingRecoveries ?? previousInput?.processing_recoveries ?? {}
    if (
      !processingRecoveries ||
      typeof processingRecoveries !== "object" ||
      Array.isArray(processingRecoveries) ||
      Object.keys(processingRecoveries).some((key) => !selection.candidate_keys.includes(key))
    )
      throw Error("Recoveries must name selected queue candidates")
    for (const request of Object.values(processingRecoveries))
      assertProcessingRecoveryRequest(request)
    sourceReviewFiles =
      sourceReviewFiles ??
      previousInput?.source_review_files ??
      (previousInput
        ? {}
        : findStoredSourceDetailReviewFiles({
            root,
            handoffFile: safePath(root, basis.handoff.path),
            candidateKeys: selection.candidate_keys,
          }))
    if (
      !sourceReviewFiles ||
      typeof sourceReviewFiles !== "object" ||
      Array.isArray(sourceReviewFiles) ||
      Object.keys(sourceReviewFiles).some((key) => !selection.candidate_keys.includes(key))
    )
      throw Error("Source reviews must name selected queue candidates")
    const sourceReviews = Object.fromEntries(
      Object.entries(sourceReviewFiles).map(([key, reviewPath]) => [
        key,
        loadSourceDetailReview({
          root,
          handoffFile: safePath(root, basis.handoff.path),
          candidateKey: key,
          reviewPath,
        }),
      ]),
    )
    const input = {
      ...(Object.keys(sourceReviewFiles).length
        ? { source_review_files: sourceReviewFiles, source_reviews: sourceReviews }
        : {}),
      ...(Object.keys(processingRecoveries).length
        ? { processing_recoveries: processingRecoveries }
        : {}),
      schema: "research-daily-processing-queue-input/v1",
      run_id: runId,
      daily_run: dailyRunId,
      collection_basis: basisReference,
      handoff: basis.handoff,
      policy_sha256: sha256(fs.readFileSync(policyFile)),
      backlog_file: backlogFile,
      candidate_basis: candidateBasis,
      vault: path.resolve(vault),
      limit,
      ...selection,
      implementation_sha256: sha256(fs.readFileSync(new URL(import.meta.url))),
      processor_sha256: sha256(fs.readFileSync(new URL("./daily-processing.mjs", import.meta.url))),
      candidate_reader_sha256: sha256(
        fs.readFileSync(new URL("./frozen-daily-processing-handoff.mjs", import.meta.url)),
      ),
      disposition_reader_sha256: sha256(
        fs.readFileSync(new URL("./candidate-disposition.mjs", import.meta.url)),
      ),
      approval_reader_sha256: sha256(
        fs.readFileSync(new URL("./candidate-approval.mjs", import.meta.url)),
      ),
      source_review_reader_sha256: sha256(
        fs.readFileSync(new URL("./source-followups.mjs", import.meta.url)),
      ),
    }
    if (readOnly) {
      // Reading completed work keeps the original implementation provenance.
      // Every source, policy, selection and native outcome still has to match.
      for (const field of [
        "implementation_sha256",
        "processor_sha256",
        "candidate_reader_sha256",
        "disposition_reader_sha256",
        "approval_reader_sha256",
        "source_review_reader_sha256",
      ]) {
        if (!/^[a-f0-9]{64}$/.test(previousInput[field] || ""))
          throw Error("Read-only queue requires preserved implementation hashes")
        input[field] = previousInput[field]
      }
    }
    if (previousInput && JSON.stringify(previousInput) !== JSON.stringify(input))
      throw Error("Queue inputs changed; preserve checkpoints and use a new run")
    if (!previousInput) atomicCreate(root, base + "daily-queue-input.json", input)
    const inputHash = sha256(JSON.stringify(input))
    const old = readJSON(root, base + "daily-queue.json")
    if (
      readOnly &&
      (!old || old.status === "running" || old.results?.some((row) => row.status === "running"))
    )
      throw Error("Read-only queue requires a stopped native checkpoint")
    if (
      old &&
      (old.schema !== "research-daily-processing-queue/v1" ||
        old.run_id !== runId ||
        old.input_sha256 !== inputHash ||
        !Array.isArray(old.results) ||
        JSON.stringify(old.results.map((row) => row.candidate_key)) !==
          JSON.stringify(input.candidate_keys) ||
        old.results.some(
          (row) =>
            !["pending", "running", "processed", "failed", "resolved", "source_review"].includes(
              row.status,
            ),
        ))
    )
      throw Error("Queue checkpoint differs from its frozen input")
    const rows = new Map((old?.results || []).map((row) => [row.candidate_key, row]))
    const approvalSnapshot = createApprovalReceiptSnapshot(root)
    const childId = (key) => `${runId}-${sha256(key).slice(0, 12)}`
    const outcomePath = (key) => base + `queue-outcomes/${sha256(key)}.json`
    const resolvedCandidate = (key) =>
      withLock(path.dirname(backlogFile), "candidate-backlog", () => {
        const current = readBacklog(backlogFile)?.candidates?.filter((row) => row.key === key)
        const frozen = handoff.pending.find((row) => row.key === key)
        if (current?.length !== 1 || !matchesFrozenDailyCandidateSource(frozen, current))
          return null
        return (
          loadCurrentCandidateDisposition(root, current[0]) ||
          loadCurrentCandidateApproval(root, current[0], { vault, approvalSnapshot })
        )
      })
    for (const key of input.candidate_keys) {
      const row = rows.get(key)
      const outcome = readJSON(root, outcomePath(key))
      if (outcome) {
        if (
          outcome.input_sha256 !== inputHash ||
          outcome.row.candidate_key !== key ||
          outcome.row.processing_run !== childId(key) ||
          !["processed", "failed", "resolved", "source_review"].includes(outcome.row.status) ||
          (row &&
            ["processed", "failed", "resolved", "source_review"].includes(row.status) &&
            JSON.stringify(row) !== JSON.stringify(outcome.row)) ||
          (outcome.native_receipt &&
            sha256(fs.readFileSync(safePath(root, outcome.native_receipt.path))) !==
              outcome.native_receipt.sha256)
        )
          throw Error("Queue completed outcome or native receipt changed")
        if (outcome.row.status === "resolved")
          resolveFrozenCandidateApproval(
            root,
            outcome.row.resolution,
            await resolvedCandidate(key),
            { vault, approvalSnapshot },
          )
        if (
          outcome.row.status === "source_review" &&
          JSON.stringify(outcome.row.source_review) !== JSON.stringify(sourceReviews[key])
        )
          throw Error("Queue source review evidence changed")
        rows.set(key, outcome.row)
      } else if (row && ["processed", "failed", "resolved", "source_review"].includes(row.status)) {
        throw Error("Queue completed checkpoint lacks its immutable outcome")
      }
    }
    const persist = (status) => {
      if (status !== "running") approvalSnapshot.assertCurrent()
      const results = input.candidate_keys.map(
        (key) =>
          rows.get(key) || {
            candidate_key: key,
            status: "pending",
            processing_run: childId(key),
          },
      )
      const counts = Object.fromEntries(
        ["pending", "running", "processed", "failed"].map((s) => [
          s,
          results.filter((r) => r.status === s).length,
        ]),
      )
      const resolvedCount = results.filter((row) => row.status === "resolved").length
      if (resolvedCount) counts.resolved = resolvedCount
      const sourceReviewCount = results.filter((row) => row.status === "source_review").length
      if (sourceReviewCount) counts.source_review = sourceReviewCount
      const receipt = {
        schema: "research-daily-processing-queue/v1",
        run_id: runId,
        daily_run: dailyRunId,
        input_sha256: inputHash,
        status,
        total: results.length,
        counts,
        results,
        routed: selection.routed,
        selection_summary: selection.selection_summary,
        next_candidate_key:
          results.find((r) => ["pending", "running"].includes(r.status))?.candidate_key || null,
        public_approved: false,
        candidate_published: false,
      }
      if (readOnly) {
        if (JSON.stringify(old) !== JSON.stringify(receipt))
          throw Error("Read-only queue checkpoint summary changed")
      } else atomicWrite(root, base + "daily-queue.json", receipt)
      return { ...receipt, receipt: base + "daily-queue.json" }
    }
    if (!execute) return persist(old?.status || "planned")
    const started = clock()
    // Reconcile all cheap native decisions before bounding expensive source
    // processing. A later approved row must not wait behind an earlier model.
    for (const key of input.candidate_keys) {
      const prior = rows.get(key)
      if (["processed", "failed", "resolved", "source_review"].includes(prior?.status)) continue
      if (sourceReviews[key]) {
        const current = await withLock(
          path.dirname(backlogFile),
          "candidate-backlog",
          () => readBacklog(backlogFile)?.candidates,
        )
        if (
          !matchesFrozenDailyCandidate(
            handoff.pending.find((row) => row.key === key),
            current,
          )
        )
          throw Error("Source review candidate changed after queue selection")
        const row = {
          candidate_key: key,
          status: "source_review",
          processing_run: childId(key),
          source_review: sourceReviews[key],
          model_calls: 0,
          candidate_published: false,
        }
        atomicCreate(root, outcomePath(key), {
          input_sha256: inputHash,
          row,
          native_receipt: { path: sourceReviews[key].receipt, sha256: sourceReviews[key].sha256 },
        })
        rows.set(key, row)
        persist("running")
        continue
      }
      const resolution = await resolvedCandidate(key)
      if (resolution) {
        const nativeReceipt = {
          path: resolution.receipt,
          sha256: sha256(fs.readFileSync(safePath(root, resolution.receipt))),
        }
        const row = {
          candidate_key: key,
          status: "resolved",
          processing_run: childId(key),
          resolution,
          model_calls: 0,
          candidate_published: false,
        }
        atomicCreate(root, outcomePath(key), {
          input_sha256: inputHash,
          row,
          native_receipt: nativeReceipt,
        })
        rows.set(key, row)
        persist("running")
        continue
      }
    }
    let attempted = 0
    for (const key of input.candidate_keys) {
      const prior = rows.get(key)
      if (["processed", "failed", "resolved", "source_review"].includes(prior?.status)) continue
      // Yield between complete candidates. The native processor separately
      // bounds individual calls; a soft queue budget never discards a response.
      if (attempted >= maxItems || clock() - started >= timeBudgetMs) break
      const processingRun = childId(key)
      rows.set(key, { candidate_key: key, status: "running", processing_run: processingRun })
      persist("running")
      let nativeReceipt = null
      let releaseSource
      const source = handoff.pending.find((row) => row.key === key)
      const sourceLock = processingSourceLockName(source, input.policy_sha256)
      try {
        releaseSource = acquireLock(root, sourceLock)
      } catch (error) {
        if (error.code !== "EEXIST") throw error
        let owner, ownerError
        try {
          owner = readJSON(root, `locks/${sourceLock}.json`)
        } catch {
          ownerError = "Source lock owner record is unreadable"
        }
        let observation = "missing_handle"
        if (Number.isSafeInteger(owner?.pid) && owner.pid > 0) {
          try {
            process.kill(owner.pid, 0)
            observation = "alive"
          } catch (probe) {
            if (probe.code === "EPERM") observation = "unobservable"
            else if (probe.code !== "ESRCH") throw probe
          }
        }
        rows.set(key, {
          candidate_key: key,
          status: "pending",
          processing_run: processingRun,
          source_wait: {
            lock: sourceLock,
            pid: owner?.pid,
            owner: owner?.owner,
            process_observation: observation,
            recovery_required: observation === "missing_handle",
            ...(ownerError ? { owner_error: ownerError } : {}),
            model_calls: 0,
          },
        })
        persist("running")
        continue
      }
      // A source waiting on another owner has not consumed an execution slot.
      attempted++
      try {
        const checkedHandoff = await withLock(root, "daily-acquisition", () =>
          withLock(path.dirname(backlogFile), "candidate-backlog", () =>
            candidateLoader(root, {
              dailyRunId,
              collectionBasis,
              candidateKeys: [key],
              backlogFile,
            }),
          ),
        )
        if (
          checkedHandoff.path !== basis.handoff.path ||
          sha256(fs.readFileSync(safePath(root, checkedHandoff.path))) !== basis.handoff.sha256
        )
          throw Error("Candidate no longer matches the frozen queue handoff")
        const result = await processor({
          root,
          runId: processingRun,
          dailyRunId,
          candidateKeys: [key],
          policyFile,
          vault,
          backlogFile,
          execute: true,
          reuseCompleted: true,
          processingRecoveries: processingRecoveries[key]
            ? { [key]: processingRecoveries[key] }
            : {},
          handoffLoader: async () => checkedHandoff,
        })
        const child = result.results?.[0]
        if (
          result.schema !== "research-daily-processing/v1" ||
          result.run_id !== processingRun ||
          result.daily_run !== dailyRunId ||
          result.total !== 1 ||
          result.results.length !== 1 ||
          child?.candidate_key !== key ||
          ["pending", "ready", "running"].includes(child.status) ||
          result.candidate_published !== false ||
          result.public_approved !== false
        )
          throw Error("Native candidate processing did not reach a private review checkpoint")
        nativeReceipt = {
          path: result.receipt,
          sha256: sha256(fs.readFileSync(safePath(root, result.receipt))),
        }
        rows.set(key, {
          candidate_key: key,
          status: child.status === "failed" ? "failed" : "processed",
          processing_run: processingRun,
          processing_status: child.status,
          receipt: result.receipt,
          result: child,
          ...(child.status === "failed" ? { error: child.error, automatic_retry: false } : {}),
        })
      } catch (error) {
        rows.set(key, {
          candidate_key: key,
          status: "failed",
          processing_run: processingRun,
          error: error instanceof Error ? error.message : String(error),
          automatic_retry: false,
        })
      } finally {
        releaseSource()
      }
      atomicCreate(root, outcomePath(key), {
        input_sha256: inputHash,
        row: rows.get(key),
        native_receipt: nativeReceipt,
      })
      persist("running")
    }
    const unfinished = input.candidate_keys.some(
      (key) =>
        !["processed", "failed", "resolved", "source_review"].includes(rows.get(key)?.status),
    )
    return persist(
      unfinished
        ? "yielded"
        : [...rows.values()].some((r) => r.status === "failed")
          ? "partial"
          : [...rows.values()].some((r) => r.status === "source_review")
            ? "source_review_pending"
            : input.candidate_keys.length &&
                input.candidate_keys.every((key) => rows.get(key)?.status === "resolved")
              ? "resolved"
              : "review_pending",
    )
  })
}
