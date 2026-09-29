import fs from "node:fs"
import path from "node:path"
import { editions, extractArticles, parseNote } from "../garden.mjs"
import { readBacklog, researchWindow } from "../research-window.mjs"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, readJSON, safePath } from "./run-state.mjs"
import { readDailyReceipts, storedListScan, verifyDailyReceipts } from "./daily-scan.mjs"

const sameWindow = (a, b) =>
  a.channel_id === b.channel_id && a.since === b.since && a.until_exclusive === b.until_exclusive

function queueEntry(candidate, observedAttempts) {
  const versionMatches = candidate.article_source_version_id
    ? observedAttempts.some(
        (attempt) => attempt.article_source_version_id === candidate.article_source_version_id,
      )
    : null
  return {
    key: candidate.key,
    title: candidate.title,
    review_status: candidate.review_status,
    priority: candidate.priority,
    source_published_at: candidate.source_published_at || null,
    discovered_at: candidate.discovered_at,
    source_urls: candidate.source_urls,
    event_id: candidate.event_id || null,
    article_source_version_id: candidate.article_source_version_id || null,
    article_parse_id: candidate.article_parse_id || null,
    article_content_sha256: candidate.article_content_sha256 || null,
    source_revision_alert: Boolean(candidate.source_revision_alert),
    publication: candidate.publication,
    possible_publications: candidate.possible_publications || [],
    next_route: candidate.next_route,
    observed_in_run: observedAttempts.length > 0,
    source_attempts: observedAttempts,
    current_source_version_observed_in_run: versionMatches,
  }
}

// This is a private routing artifact, not a model judgment or publication approval.
export function buildEditorialHandoff({
  plan,
  receipts,
  observations,
  backlog,
  issues,
  observedAt,
}) {
  const attemptsByKey = new Map()
  const observationByAttemptKey = new Map(
    observations.map((item) => [`${item.attempt_id}:${item.key}`, item]),
  )
  if (observationByAttemptKey.size !== observations.length)
    throw Error("Stored daily source observations contain duplicate candidate keys")
  for (const receipt of receipts.filter((item) => item.status === "window_scanned"))
    for (const key of receipt.candidate_keys) {
      const observation = observationByAttemptKey.get(`${receipt.attempt_id}:${key}`)
      if (!observation)
        throw Error("Completed daily candidate lacks its stored source observation: " + key)
      if (!attemptsByKey.has(key)) attemptsByKey.set(key, new Set())
      attemptsByKey.get(key).add(observation)
    }
  const backlogKeys = new Set((backlog?.candidates || []).map((candidate) => candidate.key))
  const missing = [...attemptsByKey.keys()].filter((key) => !backlogKeys.has(key))
  if (missing.length)
    throw Error(
      "Completed daily candidates are absent from the current backlog: " + missing.join(", "),
    )
  const verifiedIssues = issues.map((issue) => ({
    ...issue,
    items: issue.items.filter((article) => article.review?.review_status === "verified"),
  }))
  const window = researchWindow(plan.cutoff, observedAt, backlog, verifiedIssues)
  const allLocal = researchWindow(plan.cutoff, observedAt, backlog, issues, {
    includeUnverified: true,
  })
  const localMatches = new Map(
    [...allLocal.pending, ...allLocal.resolved].map((candidate) => [candidate.key, candidate]),
  )
  const entry = (candidate) =>
    queueEntry(
      candidate,
      [...(attemptsByKey.get(candidate.key) || [])].sort((a, b) =>
        a.attempt_id.localeCompare(b.attempt_id),
      ),
    )
  const pending = window.pending.map((candidate) => {
    const local = localMatches.get(candidate.key)
    const unverifiedPossibilities = (local?.possible_publications || []).filter(
      (entry) =>
        !(candidate.possible_publications || []).some(
          (verified) => verified.event_id === entry.event_id,
        ),
    )
    return entry(
      !candidate.publication && local?.publication
        ? {
            ...candidate,
            publication: local.publication,
            next_route: "review-existing-unverified",
          }
        : !candidate.publication &&
            !candidate.possible_publications?.length &&
            unverifiedPossibilities.length
          ? {
              ...candidate,
              possible_publications: unverifiedPossibilities,
              next_route: "review-existing-unverified",
            }
          : candidate,
    )
  })
  const observed_resolved = window.resolved
    .filter((candidate) => attemptsByKey.has(candidate.key))
    .map(entry)
  const incomplete_windows = plan.windows.filter(
    (planned) =>
      !receipts.some(
        (receipt) => receipt.status === "window_scanned" && sameWindow(receipt, planned),
      ),
  )
  return {
    schema: "research-editorial-handoff/v1",
    daily_run: plan.run_id,
    authority: plan.edition?.authority || "local_vault_unreconciled",
    publication_after: window.publication_after,
    observed_at: observedAt,
    completed_windows: plan.windows.length - incomplete_windows.length,
    incomplete_windows,
    counts: {
      pending: pending.length,
      pending_observed_in_run: pending.filter((candidate) => candidate.observed_in_run).length,
      observed_resolved: observed_resolved.length,
      source_revision: pending.filter(
        (candidate) => candidate.next_route === "review-source-revision",
      ).length,
      existing_unverified: pending.filter(
        (candidate) => candidate.next_route === "review-existing-unverified",
      ).length,
      existing_identity: pending.filter(
        (candidate) => candidate.next_route === "review-existing-identity",
      ).length,
      historical_review: pending.filter((candidate) => candidate.next_route === "historical-review")
        .length,
      verify_original_date: pending.filter(
        (candidate) => candidate.next_route === "verify-original-date",
      ).length,
    },
    pending,
    observed_resolved,
    candidate_published: false,
    drive_verified: false,
    public_verified: false,
  }
}

export function generateDailyHandoff({ root, runId, vault, backlogFile }) {
  const prefix = `daily/runs/${runId}/`
  const plan = readJSON(root, prefix + "plan.json")
  const summary = readJSON(root, prefix + "summary.json")
  if (
    plan?.schema !== "research-daily-plan/v1" ||
    plan.run_id !== runId ||
    summary?.schema !== "research-daily-summary/v1" ||
    summary.run_id !== runId
  )
    throw Error("Stored daily plan and completed scan summary required for editorial handoff")
  const receipts = readDailyReceipts(root, runId)
  verifyDailyReceipts(root, plan, receipts)
  if (summary.receipts !== receipts.length)
    throw Error("Stored daily summary and receipt count disagree")
  const observations = receipts
    .filter((receipt) => receipt.status === "window_scanned")
    .flatMap((receipt) =>
      storedListScan(root, receipt.attempt_id).candidates.map((candidate) => ({
        attempt_id: receipt.attempt_id,
        key: candidate.key,
        article_source_version_id: candidate.article_source_version_id || null,
        article_parse_id: candidate.article_parse_id || null,
        article_content_sha256: candidate.article_content_sha256 || null,
      })),
    )
  const backlog = readBacklog(backlogFile)
  const backlogBytes = fs.existsSync(backlogFile) ? fs.readFileSync(backlogFile) : null
  if (backlogBytes && JSON.stringify(JSON.parse(backlogBytes)) !== JSON.stringify(backlog))
    throw Error("Candidate backlog changed while building the editorial handoff")
  const all = editions(vault)
  if (!all.length) throw Error("Local publication inventory required for editorial handoff")
  const inventory = all.map((edition) => {
    const bytes = fs.readFileSync(edition.file)
    const reread = parseNote(bytes.toString("utf8"))
    if (!reread.meta.date) reread.meta.date = path.basename(edition.file).slice(0, 10)
    if (JSON.stringify(reread) !== JSON.stringify({ meta: edition.meta, body: edition.body }))
      throw Error("Local edition changed while building the editorial handoff: " + edition.slug)
    return { path: path.relative(vault, edition.file), sha256: sha256(bytes) }
  })
  if (!plan.edition?.inventory_sha256)
    throw Error("Stored daily plan lacks an edition inventory pin; plan a new run")
  if (plan.edition.inventory_sha256 !== sha256(JSON.stringify(inventory)))
    throw Error("Local edition inventory changed after daily planning; reconcile with a new run")
  const observedAt = receipts.length
    ? receipts
        .map((receipt) => receipt.finished_at)
        .sort()
        .at(-1)
    : plan.created_at
  const issues = all.map((edition) => ({ key: edition.slug, items: extractArticles(edition) }))
  const handoff = buildEditorialHandoff({
    plan,
    receipts,
    observations,
    backlog,
    issues,
    observedAt,
  })
  const input = {
    plan_sha256: sha256(fs.readFileSync(safePath(root, prefix + "plan.json"))),
    receipts_sha256: sha256(JSON.stringify(receipts)),
    backlog_sha256: backlogBytes ? sha256(backlogBytes) : null,
    edition_inventory_sha256: sha256(JSON.stringify(inventory)),
    issue_projection_sha256: sha256(JSON.stringify(issues)),
    routing_code_sha256: sha256(
      [
        fs.readFileSync(new URL(import.meta.url)),
        fs.readFileSync(new URL("../research-window.mjs", import.meta.url)),
      ]
        .map((bytes) => sha256(bytes))
        .join("\n"),
    ),
  }
  handoff.inputs = input
  const inputHash = sha256(JSON.stringify(input))
  const handoffPath = `${prefix}handoffs/${inputHash}.json`
  const previous = readJSON(root, handoffPath)
  if (previous && JSON.stringify(previous) !== JSON.stringify(handoff))
    throw Error("Editorial handoff inputs changed without a new snapshot identity")
  if (!previous) atomicCreate(root, handoffPath, handoff)
  return {
    path: handoffPath,
    ...handoff.counts,
    incomplete_windows: handoff.incomplete_windows.length,
  }
}
