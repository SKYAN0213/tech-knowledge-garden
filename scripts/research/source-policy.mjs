import { checkRobots } from "./robots.mjs"
import { sourceId } from "./contracts.mjs"
import { assertURL } from "./fetch.mjs"

export async function fetchWithPolicy(root, fetcher, url, options = {}) {
  assertURL(url)
  let policy
  try {
    policy = await checkRobots(root, fetcher, url)
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
  fetcher.options.interval_ms = Math.max(fetcher.options.interval_ms || 0, policy.delay_ms)
  return { ...(await fetcher.fetch(url, options)), policy_status: "checked", policy }
}
