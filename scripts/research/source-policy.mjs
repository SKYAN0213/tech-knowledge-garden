import { checkRobots } from "./robots.mjs"
import { sourceId } from "./contracts.mjs"
import { assertURL } from "./fetch.mjs"

export function createRedirectAuthorizer(root, fetcher, allowedHosts) {
  return async ({ to }) => {
    try {
      assertURL(to, allowedHosts)
    } catch (error) {
      return { allowed: false, policy_status: "denied", error: error.message }
    }
    try {
      const policy = await checkRobots(root, fetcher, to, { allowed_hosts: allowedHosts })
      return {
        allowed: policy.allowed,
        delay_ms: policy.delay_ms,
        policy_status: policy.allowed ? "allowed" : "denied",
        policy_source_id: policy.policy_source_id,
        policy_source_version_id: policy.policy_source_version_id,
        policy_observed_at: policy.policy_observed_at,
        matched_rule: policy.matched_rule,
      }
    } catch (error) {
      return { allowed: false, policy_status: "failed", error: error.message }
    }
  }
}

export async function fetchWithPolicy(root, fetcher, url, options = {}) {
  const allowed_hosts = options.allowed_hosts || [new URL(url).hostname]
  assertURL(url, allowed_hosts)
  let policy
  try {
    policy = await checkRobots(root, fetcher, url, { allowed_hosts })
  } catch (error) {
    return {
      source_id: sourceId(url),
      source_version_id: null,
      original_url: url,
      final_url: null,
      observed_at: new Date().toISOString(),
      fetch_status: "blocked",
      policy_status: "failed",
      error: error.message,
    }
  }
  if (!policy.allowed)
    return {
      source_id: sourceId(url),
      source_version_id: null,
      original_url: url,
      final_url: null,
      observed_at: new Date().toISOString(),
      fetch_status: "blocked",
      policy_status: "denied",
      policy,
    }
  const requestInterval = options.request_interval_ms ?? fetcher.options?.interval_ms ?? 0
  if (!Number.isSafeInteger(requestInterval) || requestInterval < 0 || requestInterval > 60000)
    throw Error("Source request interval must be an integer between 0 and 60000 ms")
  const document = await fetcher.fetch(url, {
    ...options,
    allowed_hosts,
    interval_ms: Math.max(requestInterval, policy.delay_ms),
    authorize_redirect: createRedirectAuthorizer(root, fetcher, allowed_hosts),
  })
  const redirectStatuses = (document.redirect_chain || []).map((item) => item.policy_status)
  const redirectStatus = redirectStatuses.includes("failed")
    ? "failed"
    : redirectStatuses.includes("denied")
      ? "denied"
      : "checked"
  return {
    ...document,
    policy_status: redirectStatus,
    policy,
  }
}
