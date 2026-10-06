// Retry eligibility describes acquisition work, never article approval.
export function sourceFailureRetry(document, parsed) {
  if (!document) return { state: "requires_repair", kind: "missing_source_evidence" }
  if (["denied", "failed"].includes(document.policy_status))
    return { state: "awaiting_new_observation", kind: "source_policy" }
  if (parsed?.status === "blocked")
    return { state: "awaiting_new_observation", kind: "access_restricted" }
  if (
    ["blocked", "not_found"].includes(document.fetch_status) ||
    [401, 403, 404, 410].includes(document.http_status)
  )
    return { state: "awaiting_new_observation", kind: "access_or_availability" }
  if (document.fetch_status === "too_large")
    return { state: "requires_repair", kind: "source_size_budget" }
  if (
    document.fetch_status === "rate_limited" ||
    [408, 429, 500, 502, 503, 504].includes(document.http_status)
  )
    return { state: "retryable", kind: "transient_response" }
  // SourceFetcher historically stores error.message rather than error.code.
  // Match its known temporary transport failures; unknown errors stay visible.
  if (
    document.fetch_status === "failed" &&
    (["Fetch deadline exceeded", "PDF body deadline exceeded"].includes(document.error) ||
      /\b(?:EAI_AGAIN|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH)\b/.test(
        document.error || "",
      ))
  )
    return { state: "retryable", kind: "transient_transport" }
  return { state: "requires_repair", kind: "parse_identity_or_request" }
}

export function combineRetryFailures(failures) {
  if (!failures.length) return { state: "retryable", kind: "unclassified_legacy_failure" }
  const counts = Object.fromEntries(
    [...new Set(failures.map((f) => f.kind))]
      .sort()
      .map((kind) => [kind, failures.filter((f) => f.kind === kind).length]),
  )
  const retryable = failures.filter((f) => f.state === "retryable").length
  const deferred = failures.filter((f) => f.state === "awaiting_new_observation").length
  const repair = failures.filter((f) => f.state === "requires_repair").length
  // A whole-window replay cannot repair an identity conflict or an access wall.
  // Mixed failures require a targeted repair instead of replaying permanent ones.
  return {
    state:
      repair || (retryable && deferred)
        ? "requires_repair"
        : deferred
          ? "awaiting_new_observation"
          : "retryable",
    kind:
      repair || (retryable && deferred)
        ? "targeted_repair_required"
        : deferred
          ? "new_observation_required"
          : "transient_failure",
    failures: failures.length,
    retryable_failures: retryable,
    deferred_failures: deferred,
    repair_failures: repair,
    failure_kind_counts: counts,
  }
}
