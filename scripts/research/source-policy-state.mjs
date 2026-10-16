import fs from "node:fs"
import path from "node:path"
import { canonicalURL } from "../garden.mjs"
import { sha256, sourceId } from "./contracts.mjs"
import { sourceAvailability, retryAfterAt } from "./source-retry.mjs"
import { ROBOTS_MAX_AGE_MS } from "./robots.mjs"
import { assertStoredEvidence, hasBlockedPublicationMetadata } from "./parser.mjs"
import { assertURL } from "./fetch.mjs"
import { samePublicationDate } from "./dates.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"

const DAY = ROBOTS_MAX_AGE_MS
const queues = new Map()
const statePath = (url) => `source-policy/index/${sourceId(canonicalURL(url))}.json`
const watchPath = (url) => `source-policy/watches/${sourceId(new URL(url).origin)}.json`

// Same-process updates queue; other processes wait for a live owner. Stale
// locks are preserved for the existing explicit recovery command.
async function locked(root, name, action) {
  const key = `${path.resolve(root)}|${name}`
  const previous = queues.get(key) || Promise.resolve()
  const next = previous
    .catch(() => {})
    .then(async () => {
      const deadline = Date.now() + 20000
      for (;;) {
        try {
          return await withLock(root, name, action)
        } catch (error) {
          if (error.code !== "EEXIST") throw error
          const owner = readJSON(root, `locks/${name}.json`)
          if (owner) {
            try {
              process.kill(owner.pid, 0)
            } catch (cause) {
              if (cause.code === "ESRCH")
                throw Error("Policy state lock is stale; explicit recovery required")
              if (cause.code !== "EPERM") throw cause
            }
          }
          if (Date.now() >= deadline) throw Error("Policy state lock deadline exceeded")
          await new Promise((resolve) => setTimeout(resolve, 25))
        }
      }
    })
  queues.set(key, next)
  try {
    return await next
  } finally {
    if (queues.get(key) === next) queues.delete(key)
  }
}

function evidence(root, document, parsed) {
  if (document?.body_path) {
    const bytes = fs.readFileSync(safePath(root, document.body_path))
    if (sha256(bytes) !== document.body_sha256) throw Error("Policy observation body hash mismatch")
    if (document.source_version_id) assertStoredEvidence(root, [document], parsed ? [parsed] : [])
  }
}

function receipt(root, reference) {
  if (
    !reference?.path?.startsWith("source-policy/observations/") ||
    !/^[a-f0-9]{64}$/.test(reference.sha256 || "")
  )
    throw Error("Exact policy observation reference required")
  const bytes = fs.readFileSync(safePath(root, reference.path))
  if (sha256(bytes) !== reference.sha256) throw Error("Policy observation receipt changed")
  return JSON.parse(bytes)
}

function save(root, record, index) {
  const bytes = JSON.stringify(record, null, 2) + "\n"
  const hash = sha256(bytes)
  const reference = { path: `source-policy/observations/${hash}.json`, sha256: hash }
  if (readJSON(root, reference.path)) receipt(root, reference)
  else atomicCreate(root, reference.path, bytes)
  atomicWrite(root, index, {
    schema: "research-source-policy-index/v1",
    url: record.url,
    reference,
  })
  return { ...record, reference }
}

export function readSourcePolicyState(root, raw, { metadataOnly = false } = {}) {
  const url = canonicalURL(raw)
  const index = readJSON(root, statePath(url))
  if (!index) return null
  const record = receipt(root, index.reference)
  if (
    index.schema !== "research-source-policy-index/v1" ||
    index.url !== url ||
    record.schema !== "research-source-policy-state/v1" ||
    record.url !== url ||
    !["available", "temporary_unavailable", "policy_restricted", "undetermined"].includes(
      record.assessment?.status,
    )
  )
    throw Error("Policy state identity differs")
  if (!metadataOnly) {
    evidence(root, record.document, record.parsed)
    evidence(root, record.access_evidence?.document, record.access_evidence?.parsed)
    evidence(root, record.last_robots_policy?.policy_document)
  }
  return { ...record, reference: index.reference }
}

export function readPolicyWatch(root, raw, { metadataOnly = false } = {}) {
  const origin = new URL(raw).origin
  const index = readJSON(root, watchPath(origin))
  if (!index) return null
  const record = receipt(root, index.reference)
  if (
    record.schema !== "research-source-policy-watch/v1" ||
    record.url !== origin ||
    index.url !== origin
  )
    throw Error("Policy watch identity differs")
  if (!metadataOnly) for (const item of record.documents) evidence(root, item.document)
  return { ...record, reference: index.reference }
}

export async function registerPolicyWatch(root, url, documents, { now = Date.now() } = {}) {
  const origin = assertURL(url).origin
  if (
    !Array.isArray(documents) ||
    !documents.length ||
    documents.length > 8 ||
    new Set(documents.map((d) => d.url)).size !== documents.length
  )
    throw Error("Policy watch requires 1..8 unique official document URLs")
  for (const item of documents) {
    assertURL(item.url, item.allowed_hosts || [new URL(origin).hostname])
    if (!["terms", "api"].includes(item.kind))
      throw Error("Policy document kind must be terms or api")
  }
  return locked(root, "policy-watch-" + sourceId(origin), async () => {
    const prior = readPolicyWatch(root, origin)
    const rows = documents.map((item) => {
      const existing = prior?.documents.find(
        (old) => old.url === item.url && old.kind === item.kind,
      )
      return {
        ...item,
        allowed_hosts: item.allowed_hosts || [new URL(origin).hostname],
        document: existing?.document || null,
        approved_version: existing?.approved_version || null,
      }
    })
    return save(
      root,
      {
        schema: "research-source-policy-watch/v1",
        url: origin,
        registered_at: prior?.registered_at || new Date(now).toISOString(),
        previous: prior?.reference || null,
        documents: rows,
        status: "review_required",
        restriction_active: prior?.restriction_active || false,
        next_check_at: new Date(now).toISOString(),
      },
      watchPath(origin),
    )
  })
}

export async function refreshPolicyWatch(root, url, fetchDocument, { now = Date.now() } = {}) {
  const origin = new URL(url).origin
  return locked(root, "policy-watch-" + sourceId(origin), async () => {
    const prior = readPolicyWatch(root, origin)
    if (!prior || Date.parse(prior.next_check_at) > now) return prior
    const documents = []
    let temporary = false,
      unknown = false,
      changed = false
    for (const item of prior.documents) {
      const document = await fetchDocument(item.url, { allowed_hosts: item.allowed_hosts })
      evidence(root, document)
      const assessment = sourceAvailability(document)
      if (assessment.status === "available") {
        if (!document.source_version_id) throw Error("Policy document has no verified version")
        changed ||= item.document?.source_version_id !== document.source_version_id
        documents.push({
          ...item,
          previous_version: item.document?.source_version_id || null,
          document,
          failure: null,
        })
      } else {
        temporary ||= assessment.status === "temporary_unavailable"
        unknown ||= assessment.status !== "temporary_unavailable"
        // A failed observation never replaces the last verified policy text.
        documents.push({ ...item, failure: document })
      }
    }
    const needsReview = documents.some(
      (item) => !item.document || item.document.source_version_id !== item.approved_version,
    )
    const status = unknown
      ? "undetermined"
      : temporary
        ? "temporary_unavailable"
        : needsReview
          ? "review_required"
          : prior.restriction_active
            ? "restricted"
            : "checked"
    const explicitRetry = Math.max(
      0,
      ...documents.map(
        (item) =>
          retryAfterAt(
            item.failure?.retry_after || item.failure?.policy_failure?.retry_after,
            now,
          ) || 0,
      ),
    )
    return save(
      root,
      {
        schema: prior.schema,
        url: origin,
        registered_at: prior.registered_at,
        previous: prior.reference,
        documents,
        status,
        changed,
        restriction_active: prior.restriction_active || false,
        observed_at: new Date(now).toISOString(),
        next_check_at: new Date(
          Math.max(now + (temporary ? 15 * 60000 : DAY), explicitRetry),
        ).toISOString(),
      },
      watchPath(origin),
    )
  })
}

export async function recordSourcePolicy(
  root,
  raw,
  document,
  {
    parsed = null,
    allowed_hosts,
    request_interval_ms,
    method,
    form,
    watch = null,
    now = Date.now(),
    seeded = false,
  } = {},
) {
  const url = canonicalURL(raw)
  const clean = { ...document }
  delete clean.availability
  if (clean.original_url && canonicalURL(clean.original_url) !== url)
    throw Error("Policy observation source URL differs")
  evidence(root, clean, parsed)
  evidence(root, clean.policy?.policy_document)
  return locked(root, "source-policy-" + sourceId(url), async () => {
    const prior = readSourcePolicyState(root, url)
    if (prior && Date.parse(clean.observed_at || "") < Date.parse(prior.document.observed_at || ""))
      return prior
    const observationHash = sha256(
      JSON.stringify({ document: clean, parsed, watch: watch?.reference || null }),
    )
    if (prior?.observation_sha256 === observationHash && !prior.recheck_requested) return prior
    const policy = clean.policy || null
    const lastPolicy = policy || prior?.last_robots_policy || null
    const oldPolicy = prior?.last_robots_policy
    const contentChanged = Boolean(
      oldPolicy && policy && oldPolicy.policy_source_version_id !== policy.policy_source_version_id,
    )
    const scopeChanged = Boolean(
      oldPolicy &&
      policy &&
      (oldPolicy.allowed !== policy.allowed || oldPolicy.delay_ms !== policy.delay_ms),
    )
    const relaxed = Boolean(oldPolicy?.allowed === false && policy?.allowed === true)
    let assessment = sourceAvailability(clean, parsed)
    const policyReviewRequired =
      relaxed ||
      Boolean(prior?.assessment.policy_review_required) ||
      watch?.status === "review_required"
    let reviewRequired =
      policyReviewRequired || Boolean(prior?.assessment.requires_review && !prior.recheck_requested)
    const knownPublicRestriction =
      prior?.public_access_restricted || assessment.reason === "public_access_restricted"
    const oldAccess = prior?.access_evidence?.parsed
    const publicParse =
      parsed?.status === "extracted" &&
      parsed.quality?.required_fields_present &&
      parsed.blocks?.length
    const publicIdentityMatched =
      !oldAccess ||
      (publicParse &&
        oldAccess.title?.normalize("NFKC").replace(/\s/g, "") ===
          parsed.title?.normalize("NFKC").replace(/\s/g, "") &&
        samePublicationDate(oldAccess.dates?.published_at, parsed.dates?.published_at))
    if (knownPublicRestriction && publicParse && !publicIdentityMatched) {
      assessment = { status: "undetermined", reason: "public_access_identity_changed" }
      reviewRequired = true
    }
    if (knownPublicRestriction && assessment.status === "available" && !parsed)
      reviewRequired = true
    if (watch && watch.status !== "checked") {
      assessment = {
        status: watch.restriction_active
          ? "policy_restricted"
          : watch.status === "temporary_unavailable"
            ? "temporary_unavailable"
            : "undetermined",
        reason: watch.restriction_active
          ? "reviewed_policy_restriction"
          : "policy_document_requires_review",
      }
      reviewRequired ||= watch.status === "review_required"
    }
    // Explicit source re-investigation still has to produce a valid public parse.
    if (
      (prior?.recheck_requested || prior?.investigation_pending) &&
      publicParse &&
      publicIdentityMatched &&
      !policyReviewRequired
    )
      reviewRequired = false
    if (reviewRequired && assessment.status === "available")
      assessment = {
        status: "undetermined",
        reason: relaxed
          ? "robots_permission_relaxed_requires_review"
          : "public_access_recheck_requires_review",
      }
    if (relaxed && assessment.status === "undetermined")
      assessment.reason = "robots_permission_relaxed_requires_review"
    const failures =
      assessment.status === "available" ? 0 : (prior?.assessment.consecutive_failures || 0) + 1
    const interval =
      assessment.status === "temporary_unavailable"
        ? Math.min(DAY, 15 * 60000 * 2 ** Math.min(failures - 1, 7))
        : assessment.status === "policy_restricted"
          ? 7 * DAY
          : DAY
    const retry = retryAfterAt(clean.policy_failure?.retry_after || clean.retry_after, now) || 0
    const record = {
      schema: "research-source-policy-state/v1",
      url,
      previous: prior?.reference || null,
      observation_sha256: observationHash,
      decision_at: new Date(now).toISOString(),
      seeded,
      document: clean,
      parsed,
      last_robots_policy: lastPolicy,
      access_evidence:
        assessment.reason === "public_access_restricted" && hasBlockedPublicationMetadata(parsed)
          ? { document: clean, parsed }
          : prior?.access_evidence || null,
      recheck_requested: false,
      investigation_pending: Boolean(
        (prior?.recheck_requested || prior?.investigation_pending) && !parsed,
      ),
      public_access_restricted: knownPublicRestriction && !(publicParse && publicIdentityMatched),
      watch: watch?.reference || prior?.watch || null,
      request: {
        allowed_hosts: allowed_hosts || prior?.request.allowed_hosts || [new URL(url).hostname],
        request_interval_ms: request_interval_ms ?? prior?.request.request_interval_ms ?? 1000,
        method: method || clean.request_method || prior?.request.method || "GET",
        ...(form !== undefined
          ? { form }
          : prior?.request.form !== undefined
            ? { form: prior.request.form }
            : {}),
      },
      policy_change: {
        baseline_known: Boolean(oldPolicy),
        content_changed: contentChanged,
        scope_changed: scopeChanged,
        previous_version: oldPolicy?.policy_source_version_id || null,
        current_version: policy?.policy_source_version_id || null,
      },
      assessment: {
        ...assessment,
        permanence: "undetermined",
        requires_review: reviewRequired,
        policy_review_required: policyReviewRequired,
        consecutive_failures: failures,
        retry_after_at: retry ? new Date(retry).toISOString() : null,
        next_check_at:
          assessment.status === "available"
            ? null
            : new Date(Math.max(seeded ? now : now + interval, retry)).toISOString(),
      },
    }
    return save(root, record, statePath(url))
  })
}

export function policyDeferredDocument(state, { now = Date.now(), watch } = {}) {
  return {
    source_id: sourceId(state.url),
    source_version_id: null,
    original_url: state.url,
    final_url: null,
    observed_at: state.document.observed_at || state.decision_at,
    fetch_status: "blocked",
    policy_status: state.last_robots_policy?.allowed === false ? "denied" : "failed",
    error: "Source check deferred: " + state.assessment.reason,
    request_performed: false,
    decision_at: new Date(now).toISOString(),
    availability: {
      ...state.assessment,
      observation: state.reference,
      ...(watch ? { watch: watch.reference } : {}),
    },
  }
}

export function listSourcePolicyChecks(root, { now = Date.now(), dueOnly = false, metadataOnly = false } = {}) {
  const directory = safePath(root, "source-policy/index")
  if (!fs.existsSync(directory)) return []
  return fs
    .readdirSync(directory)
    .filter((file) => /^[a-f0-9]{20}\.json$/.test(file))
    .map((file) => {
      const index = readJSON(root, "source-policy/index/" + file)
      const state = readSourcePolicyState(root, index.url, { metadataOnly })
      return {
        url: state.url,
        ...state.assessment,
        due: Boolean(
          state.assessment.next_check_at && Date.parse(state.assessment.next_check_at) <= now,
        ),
        reference: state.reference,
        request: state.request,
      }
    })
    .filter((row) => !dueOnly || row.due)
    .sort(
      (a, b) =>
        (a.next_check_at || "").localeCompare(b.next_check_at || "") || a.url.localeCompare(b.url),
    )
}

export function listPolicyWatches(root, { metadataOnly = false } = {}) {
  const directory = safePath(root, "source-policy/watches")
  if (!fs.existsSync(directory)) return []
  return fs
    .readdirSync(directory)
    .filter((file) => /^[a-f0-9]{20}\.json$/.test(file))
    .map((file) => {
      const index = readJSON(root, "source-policy/watches/" + file)
      return readPolicyWatch(root, index.url, { metadataOnly })
    })
}

export async function requestSourcePolicyRecheck(root, url, { now = Date.now() } = {}) {
  return locked(root, "source-policy-" + sourceId(canonicalURL(url)), async () => {
    const prior = readSourcePolicyState(root, url)
    if (!prior) return null
    const { reference, ...record } = prior
    return save(
      root,
      {
        ...record,
        previous: reference,
        recheck_requested: true,
        investigation_pending: true,
        assessment: { ...record.assessment, next_check_at: new Date(now).toISOString() },
      },
      statePath(url),
    )
  })
}

export async function reviewSourcePolicy(
  root,
  url,
  { expected, decision, reviewer, reason, now = Date.now() } = {},
) {
  if (!["allow", "restrict"].includes(decision) || !reviewer?.trim() || !reason?.trim())
    throw Error("Policy review needs allow/restrict, reviewer and evidence-based reason")
  return locked(root, "source-policy-" + sourceId(canonicalURL(url)), async () => {
    const prior = readSourcePolicyState(root, url)
    if (!prior || prior.reference.sha256 !== expected)
      throw Error("Policy review observation changed")
    const policy = prior.last_robots_policy
    if (decision === "restrict" && !watchForRestriction(root, url) && policy?.allowed !== false)
      throw Error(
        "Policy restriction needs an explicit robots prohibition or a watched official policy document",
      )
    if (
      decision === "allow" &&
      (!policy?.allowed ||
        Date.parse(policy.policy_observed_at || "") > now ||
        now - Date.parse(policy.policy_observed_at || "") > DAY ||
        !Number.isFinite(Date.parse(policy.policy_observed_at || "")) ||
        prior.document.policy_status === "failed")
    )
      throw Error("Resumption requires a fresh successfully checked robots policy")
    if (decision === "allow" && prior.public_access_restricted)
      throw Error(
        "Resumption requires a verified public article parse; reopen for investigation first",
      )
    const watch = readPolicyWatch(root, url)
    if (watch) {
      if (prior.watch?.sha256 !== watch.reference.sha256)
        throw Error("Watched policy changed after source observation")
      if (
        watch.documents.some(
          (item) =>
            !item.document ||
            item.failure ||
            now - Date.parse(item.document.observed_at) > DAY ||
            !Number.isFinite(Date.parse(item.document.observed_at)),
        )
      )
        throw Error("Policy review needs fresh verified policy documents")
      await locked(root, "policy-watch-" + sourceId(new URL(url).origin), async () => {
        if (readPolicyWatch(root, url).reference.sha256 !== watch.reference.sha256)
          throw Error("Watched policy changed during review")
        const { reference, ...record } = watch
        save(
          root,
          {
            ...record,
            previous: reference,
            status: decision === "allow" ? "checked" : "restricted",
            restriction_active: decision === "restrict",
            documents: record.documents.map((item) => ({
              ...item,
              approved_version: item.document.source_version_id,
            })),
            review: {
              reviewer,
              reason,
              decision,
              observed_at: new Date(now).toISOString(),
              source_observation: prior.reference,
            },
          },
          watchPath(url),
        )
      })
    }
    const { reference, ...record } = prior
    return save(
      root,
      {
        ...record,
        previous: reference,
        review: {
          reviewer,
          reason,
          decision,
          observed_at: new Date(now).toISOString(),
          source_observation: reference,
        },
        assessment: {
          ...record.assessment,
          status: decision === "allow" ? "available" : "policy_restricted",
          reason: decision === "allow" ? "resumption_reviewed" : "reviewed_policy_restriction",
          requires_review: false,
          policy_review_required: false,
          next_check_at: decision === "allow" ? null : new Date(now + 7 * DAY).toISOString(),
        },
      },
      statePath(url),
    )
  })
}

function watchForRestriction(root, url) {
  return readPolicyWatch(root, url)?.documents.some((item) => item.document)
}
