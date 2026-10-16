import fs from "node:fs"
import { checkRobots, policyNow } from "./robots.mjs"
import { sourceId, sha256 } from "./contracts.mjs"
import { assertURL, validatePDFBudget } from "./fetch.mjs"
import { acquireLock, atomicWrite, safePath } from "./run-state.mjs"
import { parseDocument } from "./parser.mjs"
import {
  readSourcePolicyState,
  readPolicyWatch,
  refreshPolicyWatch,
  recordSourcePolicy,
  policyDeferredDocument,
  listSourcePolicyChecks,
  listPolicyWatches,
} from "./source-policy-state.mjs"
import { readAccessExclusion } from "./source-access.mjs"

// Import only existing, hash-bound observations. Seeding is not a new website
// observation and never alters access exclusions or route activation.
export async function seedSourcePolicyChecks(
  root,
  { repo = process.cwd(), now = Date.now() } = {},
) {
  const seeded = []
  const { loadRouteAudit, routeAuditInputs } = await import("./source-route-audit.mjs")
  const { routes } = routeAuditInputs(repo)
  const directory = safePath(root, "source-access/index")
  for (const file of fs.existsSync(directory)
    ? fs.readdirSync(directory).filter((f) => /^[a-f0-9]{20}\.json$/.test(f))
    : []) {
    const index = JSON.parse(fs.readFileSync(safePath(root, "source-access/index/" + file)))
    if (index.status !== "excluded" || readSourcePolicyState(root, index.url)) continue
    const proof = readAccessExclusion(root, index.reference)
    const route = routes.find((item) => item.channel_id === proof.channel_id)
    const state = await recordSourcePolicy(root, proof.url, proof.document, {
      parsed: proof.parse,
      allowed_hosts: route?.allowed_hosts,
      request_interval_ms: route?.request_interval_ms,
      now,
      seeded: true,
    })
    seeded.push({ url: state.url, basis: index.reference, reference: state.reference })
  }
  const latestFile = safePath(root, "source-route-reviews/latest.json")
  if (fs.existsSync(latestFile)) {
    const latest = JSON.parse(fs.readFileSync(latestFile))
    const bytes = fs.readFileSync(safePath(root, latest.path))
    if (sha256(bytes) !== latest.sha256) throw Error("Stored route disposition review changed")
    const review = JSON.parse(bytes)
    const audits = new Map()
    for (const row of review.routes.filter(
      (item) => item.mode === "excluded" && item.reason_code === "policy_denied",
    )) {
      if (readSourcePolicyState(root, row.url)) continue
      const reference = row.audit_reference || review.audit
      const match = /^runs\/([A-Za-z0-9_-]+)\/route-audit\/report\.json$/.exec(
        reference?.path || "",
      )
      if (!match) throw Error("Policy exclusion has no exact native audit")
      if (!audits.has(match[1])) audits.set(match[1], loadRouteAudit(root, match[1]))
      const loaded = audits.get(match[1])
      if (loaded.reference.sha256 !== reference.sha256)
        throw Error("Policy exclusion audit changed")
      const observed = loaded.report.routes.find(
        (item) => item.channel_id === row.channel_id && item.url === row.url,
      )
      if (observed?.document?.policy_status !== "denied")
        throw Error("Stored exclusion does not prove a policy prohibition")
      const document = structuredClone(observed.document)
      const [id, hash] = (document.policy?.policy_source_version_id || "").split(":")
      if (!/^[a-f0-9]{20}$/.test(id || "") || !/^[a-f0-9]{64}$/.test(hash || ""))
        throw Error("Policy exclusion has no verified robots version")
      const policyDocument = JSON.parse(
        fs.readFileSync(safePath(root, `documents/${id}/${hash}/document.json`)),
      )
      document.policy.policy_document = {
        ...policyDocument,
        observed_at: document.policy.policy_observed_at || policyDocument.observed_at,
      }
      const { robotsPolicy } = await import("./robots.mjs")
      const body = fs.readFileSync(safePath(root, policyDocument.body_path))
      if (
        sha256(body) !== hash ||
        robotsPolicy(body.toString("utf8"), "TechKnowledgeGarden/1.0", row.url).allowed
      )
        throw Error("Stored policy exclusion lacks matching disallow bytes")
      const route = routes.find((item) => item.channel_id === row.channel_id)
      const state = await recordSourcePolicy(root, row.url, document, {
        allowed_hosts: route?.allowed_hosts,
        request_interval_ms: route?.request_interval_ms,
        now,
        seeded: true,
      })
      seeded.push({ url: state.url, basis: reference, reference: state.reference })
    }
  }
  return { status: "seeded_existing_evidence", seeded, website_requests: 0 }
}

function attachAssessment(document, state) {
  return {
    ...document,
    availability: { ...state.assessment, observation: state.reference },
    request_performed: document.request_performed ?? true,
  }
}

async function watchDocuments(root, fetcher, url, now) {
  return refreshPolicyWatch(
    root,
    url,
    async (target, options) => {
      // Watched documents use the same robots and redirect checks. They do not
      // recursively consult their own terms watch or run maintenance.
      let policy
      try {
        policy = await checkRobots(root, fetcher, target, options)
      } catch (error) {
        return {
          original_url: target,
          observed_at: new Date(now).toISOString(),
          fetch_status: "blocked",
          policy_status: "failed",
          error: error.message,
          policy_failure: error.policy_document,
        }
      }
      if (!policy.allowed)
        return {
          original_url: target,
          observed_at: new Date(now).toISOString(),
          fetch_status: "blocked",
          policy_status: "denied",
          policy,
        }
      const document = await fetcher.fetch(target, {
        ...options,
        interval_ms: Math.max(fetcher.options?.interval_ms || 0, policy.delay_ms),
        authorize_redirect: createRedirectAuthorizer(root, fetcher, options.allowed_hosts, {
          policyDocument: true,
        }),
      })
      return {
        ...document,
        policy,
        policy_status: document.redirect_chain?.some((hop) => hop.policy_status !== "allowed")
          ? "failed"
          : "checked",
      }
    },
    { now },
  )
}

export async function recheckSourcePolicy(root, fetcher, url, { repo = process.cwd() } = {}) {
  const now = policyNow(fetcher)
  const current = readSourcePolicyState(root, url)
  const accessProbe = current?.public_access_restricted === true
  const policyOnly =
    !accessProbe &&
    (current?.last_robots_policy?.allowed === false ||
      current?.assessment.requires_review ||
      current?.assessment.reason === "reviewed_policy_restriction")
  const result = await fetchWithPolicy(root, fetcher, url, {
    ...current?.request,
    policy_probe: true,
    policy_only: Boolean(policyOnly),
  })
  let parseError = null
  if (accessProbe && ["captured", "not_modified"].includes(result.fetch_status)) {
    const file = safePath(repo, "data/research-acquisition.json")
    const profiles = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)).article_profiles : []
    const matching = (profiles || []).filter((profile) =>
      new RegExp(profile.url_pattern).test(result.final_url),
    )
    if (matching.length === 1 && matching[0].options?.publication_date_from_listing !== true) {
      let parsed
      try {
        parsed = await parseDocument(root, result, matching[0].options)
      } catch (error) {
        parseError = error.message
      }
      if (parsed)
        await recordSourcePolicy(root, url, result, {
          parsed,
          ...current.request,
          now,
          watch: readPolicyWatch(root, url),
        })
    } else parseError = "Public access recheck requires one native independent article profile"
  }
  const state = readSourcePolicyState(root, url)
  return {
    url: state.url,
    status: state.assessment.status,
    reason: state.assessment.reason,
    reference: state.reference,
    ...(parseError ? { parse_error: parseError } : {}),
    candidate_approved: false,
  }
}

// Runs at most once per new collection fetcher. Due checks also work when a
// route is no longer in the daily list; stored permission never enables it.
export async function recheckDueSourcePolicies(
  root,
  fetcher,
  { maxChecks = 3, timeBudgetMs = 6000, repo = process.cwd() } = {},
) {
  if (
    !Number.isSafeInteger(maxChecks) ||
    maxChecks < 0 ||
    maxChecks > 20 ||
    !Number.isSafeInteger(timeBudgetMs) ||
    timeBudgetMs < 1 ||
    timeBudgetMs > 60000
  )
    throw Error("Policy maintenance needs 0..20 checks and a bounded time budget")
  // Disabled maintenance must not enumerate unrelated cold policy payloads.
  // The requested URL still passes its normal policy check in fetchWithPolicy.
  if (maxChecks === 0) return { status: "disabled", checks: [] }
  const now = policyNow(fetcher)
  let release
  try {
    release = acquireLock(root, "source-policy-maintenance")
  } catch (error) {
    if (error.code !== "EEXIST") throw error
    return { status: "deferred_to_owner", checks: [] }
  }
  try {
    const queue = listSourcePolicyChecks(root, { now, dueOnly: true, metadataOnly: true })
    for (const watch of listPolicyWatches(root, { metadataOnly: true }))
      if (
        Date.parse(watch.next_check_at) <= now &&
        !queue.some((row) => new URL(row.url).origin === watch.url)
      )
        queue.push({
          url: watch.url,
          request: { allowed_hosts: [new URL(watch.url).hostname], request_interval_ms: 1000 },
        })
    const checks = [],
      started = Date.now()
    for (const item of queue) {
      if (checks.length >= maxChecks || Date.now() - started >= timeBudgetMs) break
      try {
        checks.push(await recheckSourcePolicy(root, fetcher, item.url, { repo }))
      } catch (error) {
        if (error.code !== "STORAGE_PENDING") throw error
        checks.push({ url: item.url, status: "waiting_for_storage", storage_request: error.storage_request })
      }
    }
    const report = {
      schema: "research-source-policy-maintenance/v1",
      observed_at: new Date(now).toISOString(),
      status: "checked",
      due: queue.length,
      remaining: queue.length - checks.length,
      checks,
    }
    atomicWrite(root, "source-policy/maintenance-latest.json", report)
    return report
  } finally {
    release()
  }
}

export function createRedirectAuthorizer(
  root,
  fetcher,
  allowedHosts,
  { policyDocument = false } = {},
) {
  return async ({ to }) => {
    try {
      assertURL(to, allowedHosts)
    } catch (error) {
      return { allowed: false, policy_status: "denied", error: error.message }
    }
    try {
      const policy = await checkRobots(root, fetcher, to, { allowed_hosts: allowedHosts })
      let state = null
      if (!policyDocument) {
        const previous = readSourcePolicyState(root, to)
        const now = policyNow(fetcher)
        const watch = await watchDocuments(root, fetcher, to, now)
        if (
          !policy.allowed ||
          previous?.last_robots_policy?.allowed === false ||
          previous?.assessment.requires_review ||
          (watch && watch.status !== "checked")
        )
          state = await recordSourcePolicy(
            root,
            to,
            {
              source_id: sourceId(to),
              original_url: to,
              observed_at: policy.policy_observed_at || new Date(now).toISOString(),
              fetch_status: "blocked",
              policy_status: policy.allowed ? "checked" : "denied",
              policy,
              request_performed: false,
            },
            { allowed_hosts: allowedHosts, watch, now },
          )
      }
      const held = state && state.assessment.status !== "available"
      return {
        allowed: policy.allowed && !held,
        delay_ms: policy.delay_ms,
        policy_status: !policy.allowed ? "denied" : held ? "failed" : "allowed",
        policy_source_id: policy.policy_source_id,
        policy_source_version_id: policy.policy_source_version_id,
        policy_observed_at: policy.policy_observed_at,
        matched_rule: policy.matched_rule,
        ...(state ? { availability: { ...state.assessment, observation: state.reference } } : {}),
      }
    } catch (error) {
      return {
        allowed: false,
        policy_status: "failed",
        error: error.message,
        ...(error.policy_document
          ? { policy_failure: { stage: "redirect-robots", ...error.policy_document } }
          : {}),
      }
    }
  }
}

export async function fetchWithPolicy(root, fetcher, url, options = {}) {
  if (options.fetch_budget !== undefined) validatePDFBudget(options.fetch_budget)
  const allowed_hosts = options.allowed_hosts || [new URL(url).hostname]
  assertURL(url, allowed_hosts)
  const now = policyNow(fetcher)
  if (!options.policy_probe && !fetcher.policyMaintenanceStarted) {
    fetcher.policyMaintenanceStarted = true
    fetcher.policyMaintenanceReport = await recheckDueSourcePolicies(root, fetcher, {
      maxChecks: fetcher.options?.policy_recheck_limit ?? 3,
    })
  }
  const previous = readSourcePolicyState(root, url)
  if (previous && Date.parse(previous.assessment.retry_after_at || "") > now)
    return policyDeferredDocument(previous, { now })
  if (
    !options.policy_probe &&
    previous &&
    previous.assessment.status !== "available" &&
    !previous.recheck_requested &&
    Date.parse(previous.assessment.next_check_at) > now
  )
    return policyDeferredDocument(previous, { now })
  if (options.policy_probe) {
    const origin = new URL(url).origin
    fetcher.robotsCache?.delete(origin)
    fetcher.robotsCacheTimes?.delete(origin)
  }
  const watch = await watchDocuments(root, fetcher, url, now)
  const observe = async (document) =>
    attachAssessment(
      document,
      await recordSourcePolicy(root, url, document, {
        allowed_hosts,
        request_interval_ms: options.request_interval_ms,
        method: options.method,
        form: options.form,
        watch,
        now: policyNow(fetcher),
      }),
    )
  let policy
  try {
    policy = await checkRobots(root, fetcher, url, { allowed_hosts })
  } catch (error) {
    if (error.code === "STORAGE_PENDING") throw error
    const fetchStatus = error?.fetch_status === "rate_limited" ? "rate_limited" : "blocked"
    return observe({
      source_id: sourceId(url),
      source_version_id: null,
      original_url: url,
      final_url: null,
      observed_at: error.policy_document?.observed_at || new Date(policyNow(fetcher)).toISOString(),
      request_performed: false,
      fetch_status: fetchStatus,
      policy_status: "failed",
      error: error.message,
      ...(error.policy_document
        ? { policy_failure: { stage: "robots", ...error.policy_document } }
        : {}),
    })
  }
  if (!policy.allowed)
    return observe({
      source_id: sourceId(url),
      source_version_id: null,
      original_url: url,
      final_url: null,
      observed_at: policy.policy_observed_at || new Date(policyNow(fetcher)).toISOString(),
      request_performed: false,
      fetch_status: "blocked",
      policy_status: "denied",
      policy,
    })
  const relaxed = previous?.last_robots_policy?.allowed === false && policy.allowed
  if (
    options.policy_only ||
    (watch?.status && watch.status !== "checked") ||
    (!options.policy_probe &&
      (previous?.assessment.policy_review_required ||
        relaxed ||
        (!previous?.recheck_requested && previous?.assessment.requires_review)))
  ) {
    const state = await recordSourcePolicy(
      root,
      url,
      {
        source_id: sourceId(url),
        original_url: url,
        observed_at: policy.policy_observed_at || new Date(now).toISOString(),
        fetch_status: "blocked",
        policy_status: "checked",
        policy,
        request_performed: false,
      },
      {
        allowed_hosts,
        request_interval_ms: options.request_interval_ms,
        method: options.method,
        form: options.form,
        watch,
        now: policyNow(fetcher),
      },
    )
    return policyDeferredDocument(state, { now, watch })
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
  const redirectFailure = document.redirect_chain?.find((item) => item.policy_status === "failed")
  return observe({
    ...document,
    policy_status: redirectStatus,
    policy,
    ...(redirectFailure?.policy_failure
      ? { policy_failure: redirectFailure.policy_failure }
      : redirectFailure?.availability
        ? {
            policy_failure: {
              stage: "redirect-policy",
              availability: redirectFailure.availability,
            },
          }
        : {}),
  })
}
