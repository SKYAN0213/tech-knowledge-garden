import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { sourceFailureRetry } from "./source-retry.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"

const LIMIT = 3
const HOUR = 3600000
const routePath = (id) => {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id || "")) throw Error("Exact collection channel required")
  return `collection-health/routes/${id}.json`
}
const checksum = (value) => ({ ...value, checksum_sha256: sha256(JSON.stringify(value)) })

// This request belongs to one immutable report (and optionally one round).
// It is exposed in that owner's checkpoint, never enqueued globally.
export function collectionRecoveryRequest(report, reference, { round_id } = {}) {
  if (!(report.routes || []).some((r) => r.windows?.some((w) => w.status === "incomplete")))
    return null
  if (
    report.schema !== "research-collection-report/v1" ||
    !reference?.path ||
    !/^[a-f0-9]{64}$/.test(reference.sha256 || "")
  )
    throw Error("Exact collection recovery report required")
  return {
    module: "collection",
    operation: "recover",
    owner: { daily_run: report.daily_run, ...(round_id ? { round_id } : {}) },
    parameters: {
      run_id:
        "recovery-" +
        sha256(JSON.stringify([reference.path, reference.sha256, round_id || null])).slice(0, 40),
      mode: "execute",
      report_path: reference.path,
      report_sha256: reference.sha256,
      max_routes: 2,
      time_budget_ms: 300000,
      reconcile_coverage: true,
    },
  }
}

// Waiting for work or a human decision is not a failed HTTP request. Keep the
// original native status, while exposing an actionable, deduplicated queue.
export function collectionOutcome(result, error = null) {
  const summary = result?.summary || {},
    details = summary.details || []
  const pending = [
    ...new Map(
      details
        .filter((d) => !["source_parsed_unreviewed", "public_access_excluded"].includes(d.status))
        .map((d) => [JSON.stringify([d.url, d.status]), { url: d.url, status: d.status }]),
    ).values(),
  ]
  const deferred = pending.filter((d) => d.status === "deferred_by_budget").length
  const documents = [
    ...(result?.indexDocuments || []),
    ...(result?.documents || []),
    ...(result?.unavailable_sources || []),
  ]
  const nextChecks = documents
    .map((d) => Date.parse(d.availability?.next_check_at || ""))
    .filter(Number.isFinite)
  const nextCheck = nextChecks.length ? new Date(Math.max(...nextChecks)).toISOString() : null
  const base = { pending, deferred_details: deferred, next_check_at: nextCheck }
  const outcome = (kind, action, failure = false) => ({
    ...base,
    kind,
    next_action: action,
    failure,
  })
  if (error?.code === "STORAGE_PENDING") return outcome("storage_wait", "hydrate_same_job")
  if (error?.code === "COLLECTION_SOURCE_WAIT")
    return outcome("source_wait", "wait_for_source_probe")
  if (summary.status === "window_scanned") return outcome("complete", "reuse_completed")
  if (deferred || summary.next_listing_page)
    return {
      ...outcome("budget_pending", deferred ? "continue_details" : "continue_listing"),
      continuable: true,
    }
  if (/rate_limited|timeout|deadline/u.test(summary.reason || ""))
    return outcome("temporary_failure", "retry_after_cooldown", true)
  const failedDocuments = documents.filter(
    (d) => !["captured", "not_modified"].includes(d.fetch_status),
  )
  const retry = failedDocuments.map((d) => sourceFailureRetry(d))
  if (
    /blocked|denied|restricted|not_found/u.test(summary.reason || "") ||
    retry.some((r) => r.state === "awaiting_new_observation")
  )
    return outcome("access_restricted", "recheck_access_policy", true)
  if (retry.length && retry.every((r) => r.state === "retryable"))
    return outcome("temporary_failure", "retry_after_cooldown", true)
  if (
    error &&
    sourceFailureRetry({ fetch_status: "failed", error: error.message }).state === "retryable"
  )
    return outcome("temporary_failure", "retry_after_cooldown", true)
  if (
    summary.error &&
    sourceFailureRetry({ fetch_status: "failed", error: summary.error }).state === "retryable"
  )
    return outcome("temporary_failure", "retry_after_cooldown", true)
  if (summary.reason === "detail_incomplete" && pending.length)
    return outcome("source_review_required", "review_or_repair_exact_sources")
  if (/cutoff_not_reached|detail_budget_exceeded/u.test(summary.reason || ""))
    return outcome("range_incomplete", "repair_bounded_listing_range", true)
  return outcome("parser_or_request_error", "repair_saved_source", true)
}

export function readCollectionHealth(root, channelId) {
  const stored = readJSON(root, routePath(channelId))
  if (!stored) return null
  const { checksum_sha256, ...value } = stored
  if (
    value.schema !== "research-collection-health/v1" ||
    value.channel_id !== channelId ||
    checksum_sha256 !== sha256(JSON.stringify(value))
  )
    throw Error("Collection health state changed")
  return value
}

export function collectionSourceDecision(root, channelId, basis, { now = Date.now() } = {}) {
  const health = readCollectionHealth(root, channelId)
  if (!health) return { allowed: true, reason: "not_observed" }
  if (health.basis_sha256 !== sha256(JSON.stringify(basis)))
    return { allowed: true, reason: "collection_configuration_changed", health }
  if (!["cooling_down", "retry_wait"].includes(health.state))
    return { allowed: true, reason: health.state, health }
  return {
    allowed: Date.parse(health.next_check_at) <= now,
    reason: Date.parse(health.next_check_at) <= now ? "bounded_probe_due" : "source_cooling_down",
    next_check_at: health.next_check_at,
    next_action: health.next_action,
    health,
  }
}

// A journal makes an interrupted observation/index update safe to retry. The
// source evidence is immutable; duplicate reads never increase the streak or
// emit another notification. No external message is sent by this module.
export async function recordCollectionOutcome(
  root,
  { channel_id, run_id, basis, result, error = null, evidence = null, now = Date.now() },
) {
  routePath(channel_id)
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(run_id || "") || !Number.isFinite(now))
    throw Error("Exact collection observation required")
  const assessment = collectionOutcome(result, error)
  if (["storage_wait", "source_wait"].includes(assessment.kind))
    return { assessment, notification: null }
  if (
    !evidence ||
    evidence.path !== `runs/${run_id}/list-scan.json` ||
    !/^[a-f0-9]{64}$/.test(evidence.sha256 || "")
  )
    throw Error("Exact native collection summary evidence required")
  const bytes = fs.readFileSync(safePath(root, evidence.path))
  if (
    sha256(bytes) !== evidence.sha256 ||
    JSON.stringify(JSON.parse(bytes)) !== JSON.stringify(result?.summary) ||
    result.summary.channel_id !== channel_id ||
    result.summary.schema !== "research-list-scan/v1"
  )
    throw Error("Collection outcome differs from its native evidence")
  const binding = {
    channel_id,
    run_id,
    basis_sha256: sha256(JSON.stringify(basis)),
    evidence,
    outcome_sha256: sha256(
      JSON.stringify([result?.summary || null, error?.message || null, error?.code || null]),
    ),
  }
  const id = sha256(JSON.stringify(binding)),
    relative = `collection-health/observations/${id}.json`
  return withLock(root, "collection-health-" + channel_id, async () => {
    const prior = readCollectionHealth(root, channel_id)
    const saved = readJSON(root, relative)
    if (saved) {
      const { checksum_sha256, ...body } = saved
      if (
        checksum_sha256 !== sha256(JSON.stringify(body)) ||
        JSON.stringify(body.binding) !== JSON.stringify(binding)
      )
        throw Error("Collection health observation changed")
      if ((prior?.sequence || 0) === body.before_sequence)
        atomicWrite(root, routePath(channel_id), checksum(body.after))
      else if ((prior?.sequence || 0) < body.after.sequence)
        throw Error("Collection health journal gap")
      return {
        assessment: body.assessment,
        health: readCollectionHealth(root, channel_id),
        notification: null,
        reused: true,
      }
    }
    const previous = prior?.basis_sha256 === binding.basis_sha256 ? prior : null
    const fingerprint = assessment.failure
      ? sha256(
          JSON.stringify([
            assessment.kind,
            result?.summary?.reason || error?.code || "unknown",
            result?.summary?.error || error?.message || null,
          ]),
        )
      : null
    const failures = assessment.failure
      ? previous?.failure_fingerprint === fingerprint
        ? previous.consecutive_failures + 1
        : 1
      : assessment.kind === "complete"
        ? 0
        : previous?.consecutive_failures || 0
    const cooling = assessment.failure && failures >= LIMIT
    const retryWait =
      assessment.failure &&
      (assessment.kind === "temporary_failure" || Date.parse(assessment.next_check_at || "") > now)
    const backoff =
      assessment.kind === "access_restricted"
        ? 24 * HOUR
        : Math.min(24 * HOUR, 900000 * 2 ** Math.min(failures - 1, 7))
    const next = {
      schema: "research-collection-health/v1",
      channel_id,
      sequence: (prior?.sequence || 0) + 1,
      basis_sha256: binding.basis_sha256,
      state: cooling
        ? "cooling_down"
        : retryWait
          ? "retry_wait"
          : assessment.kind === "complete"
            ? "healthy"
            : assessment.failure
              ? "degraded"
              : ["cooling_down", "retry_wait"].includes(previous?.state)
                ? previous.state
                : "pending",
      kind: assessment.kind,
      consecutive_failures: failures,
      failure_fingerprint:
        fingerprint ||
        (assessment.kind === "complete" ? null : previous?.failure_fingerprint || null),
      first_failed_at: assessment.failure
        ? previous?.failure_fingerprint === fingerprint
          ? previous.first_failed_at
          : new Date(now).toISOString()
        : assessment.kind === "complete"
          ? null
          : previous?.first_failed_at || null,
      last_observed_at: new Date(now).toISOString(),
      last_run_id: run_id,
      next_action: assessment.next_action,
      next_check_at:
        cooling || retryWait
          ? new Date(
              Math.max(now + backoff, Date.parse(assessment.next_check_at || "") || 0),
            ).toISOString()
          : ["cooling_down", "retry_wait"].includes(previous?.state) &&
              assessment.kind !== "complete"
            ? previous.next_check_at
            : assessment.next_check_at,
      pending_items: assessment.pending.length,
      deferred_details: assessment.deferred_details,
      latest_observation: { path: relative, id },
    }
    const transition =
      assessment.kind === "complete" && previous && previous.state !== "healthy"
        ? "recovered"
        : cooling && previous?.state !== "cooling_down"
          ? "suspended"
          : assessment.failure && previous?.failure_fingerprint !== fingerprint
            ? "new_failure"
            : !assessment.failure &&
                assessment.kind !== "complete" &&
                previous?.kind !== assessment.kind
              ? "new_pending"
              : null
    const notification = transition
      ? {
          channel_id,
          transition,
          kind: assessment.kind,
          consecutive_failures: failures,
          next_check_at: next.next_check_at,
          next_action: next.next_action,
          observation: { path: relative, id },
        }
      : null
    next.last_notification = notification || prior?.last_notification || null
    const journal = {
      schema: "research-collection-health-observation/v1",
      binding,
      assessment,
      before_sequence: prior?.sequence || 0,
      after: next,
      notification,
    }
    atomicCreate(root, relative, checksum(journal))
    atomicWrite(root, routePath(channel_id), checksum(next))
    return { assessment, health: next, notification, reused: false }
  })
}

export function collectionHealthInventory(root) {
  const directory = safePath(root, "collection-health/routes", { materialize: false })
  const routes = fs.existsSync(directory)
    ? fs
        .readdirSync(directory)
        .filter((f) => /^[A-Za-z0-9_-]+\.json$/.test(f))
        .sort()
        .map((f) => readCollectionHealth(root, f.slice(0, -5)))
    : []
  return {
    schema: "research-collection-health-inventory/v1",
    routes,
    cooling_down: routes.filter((r) => r.state === "cooling_down").length,
    alerts: routes.flatMap((r) => (r.last_notification ? [r.last_notification] : [])),
    notification_delivery: "deduplicated_local_events",
  }
}

export function checkedSourceWait(root, receipt) {
  const wait = receipt.source_wait
  if (
    !wait ||
    wait.request_performed !== false ||
    !/^collection-health\/observations\/[a-f0-9]{64}\.json$/.test(wait.observation?.path || "")
  )
    throw Error("Exact source wait observation required")
  const bytes = fs.readFileSync(safePath(root, wait.observation.path))
  if (sha256(bytes) !== wait.observation.sha256) throw Error("Source wait observation changed")
  const { checksum_sha256, ...value } = JSON.parse(bytes)
  if (
    checksum_sha256 !== sha256(JSON.stringify(value)) ||
    value.binding.channel_id !== receipt.channel_id ||
    !["cooling_down", "retry_wait"].includes(value.after.state) ||
    value.after.next_check_at !== wait.next_check_at
  )
    throw Error("Source wait differs from the recorded circuit")
  return wait
}
