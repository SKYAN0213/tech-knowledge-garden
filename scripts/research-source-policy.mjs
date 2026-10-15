import { parseArgs } from "node:util"
import { pathToFileURL } from "node:url"
import { SourceFetcher } from "./research/fetch.mjs"
import {
  fetchWithPolicy,
  recheckSourcePolicy,
  recheckDueSourcePolicies,
  seedSourcePolicyChecks,
} from "./research/source-policy.mjs"
import {
  listSourcePolicyChecks,
  listPolicyWatches,
  readSourcePolicyState,
  registerPolicyWatch,
  reviewSourcePolicy,
} from "./research/source-policy-state.mjs"
import { reopenAccessExclusion } from "./research/source-access.mjs"
import { DEFAULT_ROOT, readJSON } from "./research/run-state.mjs"
import { canonicalURL } from "./garden.mjs"
import { sourceId } from "./research/contracts.mjs"

export async function main(args = process.argv.slice(2), { fetcher: suppliedFetcher } = {}) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      root: { type: "string", default: DEFAULT_ROOT },
      repo: { type: "string", default: process.cwd() },
      url: { type: "string" },
      document: { type: "string", multiple: true },
      host: { type: "string", multiple: true },
      kind: { type: "string", default: "terms" },
      expected: { type: "string" },
      decision: { type: "string" },
      reviewer: { type: "string" },
      reason: { type: "string" },
      due: { type: "boolean", default: false },
      apply: { type: "boolean", default: false },
      limit: { type: "string", default: "3" },
    },
  })
  const [command = "list"] = positionals
  if (positionals.length > 1 || !["list", "watch", "recheck", "review", "seed"].includes(command))
    throw Error(
      "Usage: research-source-policy.mjs list [--due]; watch --url URL --document OFFICIAL_URL [--kind terms|api] --apply; recheck [--url URL] --apply; review --url URL --expected SHA --decision allow|restrict --reviewer NAME --reason TEXT --apply; seed --apply",
    )
  if (command === "list")
    return {
      status: "read_only",
      checks: listSourcePolicyChecks(values.root, { dueOnly: values.due }),
      watches: listPolicyWatches(values.root).map((watch) => ({
        url: watch.url,
        status: watch.status,
        next_check_at: watch.next_check_at,
        reference: watch.reference,
        documents: watch.documents.map((item) => ({
          url: item.url,
          kind: item.kind,
          version: item.document?.source_version_id || null,
          approved_version: item.approved_version,
          failure: item.failure?.fetch_status || null,
        })),
      })),
    }
  if (!values.apply) throw Error("Policy changes and website rechecks require --apply")
  if (command === "seed") return seedSourcePolicyChecks(values.root, { repo: values.repo })
  if (["watch", "review"].includes(command) && !values.url) throw Error("Exact --url required")
  if (command === "review") {
    const state = await reviewSourcePolicy(values.root, values.url, values)
    // A successful native public parse and an exact policy review may reopen
    // an old member-item index. A terms/robots review alone cannot do so.
    if (
      values.decision === "allow" &&
      state.parsed?.status === "extracted" &&
      state.parsed.quality?.required_fields_present &&
      state.parsed.blocks?.length &&
      readJSON(values.root, `source-access/index/${sourceId(canonicalURL(values.url))}.json`)
    )
      await reopenAccessExclusion(values.root, values.url)
    const current = readSourcePolicyState(values.root, values.url)
    return {
      status: "reviewed",
      url: state.url,
      assessment: current.assessment,
      reference: current.reference,
    }
  }
  const limit = Number(values.limit)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20)
    throw Error("Recheck limit must be 1..20")
  const fetcher =
    suppliedFetcher ||
    new SourceFetcher(values.root, { attempts: 1, interval_ms: 1000, timeout_ms: 12000 })
  if (command === "watch") {
    if (!values.document?.length) throw Error("Official policy --document URLs required")
    await registerPolicyWatch(
      values.root,
      values.url,
      values.document.map((url) => ({
        url,
        kind: values.kind,
        ...(values.host?.length ? { allowed_hosts: values.host } : {}),
      })),
    )
  }
  if (values.url) {
    if (command === "recheck")
      return recheckSourcePolicy(values.root, fetcher, values.url, { repo: values.repo })
    const state = readSourcePolicyState(values.root, values.url)
    const result = await fetchWithPolicy(values.root, fetcher, values.url, {
      ...state?.request,
      policy_probe: true,
      policy_only: true,
    })
    return {
      status: result.request_performed ? "observed" : "policy_checked_or_deferred",
      url: values.url,
      assessment: readSourcePolicyState(values.root, values.url)?.assessment,
      reference: readSourcePolicyState(values.root, values.url)?.reference,
    }
  }
  return recheckDueSourcePolicies(values.root, fetcher, {
    maxChecks: limit,
    repo: values.repo,
    timeBudgetMs: 30000,
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await main(), null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
