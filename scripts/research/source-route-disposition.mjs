import fs from "node:fs"
import { randomUUID } from "node:crypto"
import { canonicalURL } from "../garden.mjs"
import { robotsPolicy } from "./robots.mjs"
import { sha256 } from "./contracts.mjs"
import { DEFAULT_ROOT, atomicCreate, atomicWrite, readJSON, safePath, withGardenOperationLock } from "./run-state.mjs"
import { loadRouteAudit, routeAuditInputs } from "./source-route-audit.mjs"

export function validateRouteDispositions(rows, audit, routes, activeIds) {
  if (!Array.isArray(rows) || rows.length !== audit.routes.length || new Set(rows.map((row) => row.channel_id)).size !== rows.length)
    throw Error("Each audited route needs exactly one disposition")
  for (const row of rows) {
    const observed = audit.routes.find((entry) => entry.channel_id === row.channel_id)
    const route = routes.find((entry) => entry.channel_id === row.channel_id)
    if (!observed || !route || canonicalURL(row.url) !== canonicalURL(observed.url) || canonicalURL(row.url) !== canonicalURL(route.url) || !["automatic", "discovery", "excluded"].includes(row.mode) || !["listing", "entrypoint", "documentation"].includes(row.role) || typeof row.reason !== "string" || !row.reason.trim())
      throw Error("Invalid route disposition or changed route identity")
    if (activeIds.has(row.channel_id) && row.mode !== "automatic")
      throw Error("Disable an active daily route explicitly before changing its scope")
    if (row.mode === "excluded" && row.reason_code === "policy_denied" && observed.document?.policy_status !== "denied")
      throw Error("A failed robots request is not a confirmed collection prohibition")
    if (row.mode === "excluded" && row.reason_code !== "policy_denied") {
      if (row.reason_code !== "replaced" || !row.replacement_channel_id || !routes.some((entry) => entry.channel_id === row.replacement_channel_id))
        throw Error("Route exclusion needs a confirmed policy or an exact replacement")
      const replacement = routes.find((entry) => entry.channel_id === row.replacement_channel_id)
      if (canonicalURL(observed.document?.final_url || row.url) !== canonicalURL(replacement.url) && !(observed.parse?.links || []).some((link) => canonicalURL(link.url) === canonicalURL(replacement.url)))
        throw Error("Replacement lacks an official redirect or source link")
    }
  }
  return rows
}

export async function applyRouteDispositions({ runId, decisionsFile, root = DEFAULT_ROOT, repo = process.cwd(), apply = false } = {}) {
  const loaded = loadRouteAudit(root, runId)
  const inputs = routeAuditInputs(repo)
  const decisionsBytes = fs.readFileSync(decisionsFile)
  const rows = validateRouteDispositions(JSON.parse(decisionsBytes), loaded.report, inputs.routes, new Set(inputs.daily.routes.filter((entry) => entry.enabled).map((entry) => entry.channel_id)))
  for (const row of rows.filter((entry) => entry.reason_code === "policy_denied" && entry.mode === "excluded")) {
    const observed = loaded.report.routes.find((entry) => entry.channel_id === row.channel_id)
    const policy = observed.document.policy
    const [id, hash] = (policy?.policy_source_version_id || "").split(":")
    const bytes = fs.readFileSync(safePath(root, `documents/${id}/${hash}/body.bin`))
    if (sha256(bytes) !== hash || robotsPolicy(bytes.toString("utf8"), "TechKnowledgeGarden/1.0", row.url).allowed)
      throw Error("Route exclusion lacks exact disallow bytes")
  }
  const counts = Object.fromEntries(["automatic", "discovery", "excluded"].map((mode) => [mode, rows.filter((row) => row.mode === mode).length]))
  if (!apply) return { status: "dry_run", counts }
  return withGardenOperationLock(root, async () => {
    const acquisition = inputs.snapshots.find((snapshot) => snapshot.file === "data/research-acquisition.json")
    if (sha256(fs.readFileSync(safePath(repo, acquisition.file))) !== acquisition.sha256)
      throw Error("Acquisition config changed during disposition review")
    const next = structuredClone(acquisition.value)
    for (const row of rows) next[row.channel_id] = { ...(next[row.channel_id] || {}), collection_mode: row.mode }
    let previous
    const latest = readJSON(root, "source-route-reviews/latest.json")
    if (latest) {
      const bytes = fs.readFileSync(safePath(root, latest.path))
      if (sha256(bytes) !== latest.sha256) throw Error("Previous route review changed")
      previous = JSON.parse(bytes)
    }
    const merged = new Map((previous?.routes || []).map((row) => [row.channel_id, { ...row, audit_reference: row.audit_reference || previous.audit }]))
    for (const row of rows) merged.set(row.channel_id, { ...row, audit_reference: loaded.reference })
    const reviewedRoutes = inputs.routes.filter((route) => merged.has(route.channel_id)).map((route) => merged.get(route.channel_id))
    const mergedCounts = Object.fromEntries(["automatic", "discovery", "excluded"].map((mode) => [mode, reviewedRoutes.filter((row) => row.mode === mode).length]))
    const reviewId = randomUUID()
    const dir = `source-route-reviews/${reviewId}`
    atomicCreate(root, `${dir}/acquisition-before.json`, fs.readFileSync(safePath(repo, acquisition.file)))
    const review = { schema: "research-route-disposition-review/v1", reviewed_at: new Date().toISOString(), audit: loaded.reference, previous_review: latest || null, decisions_sha256: sha256(decisionsBytes), routes: reviewedRoutes, counts: mergedCounts, candidate_approved: false, candidate_published: false }
    const reference = atomicCreate(root, `${dir}/review.json`, review)
    atomicWrite(repo, acquisition.file, next)
    atomicWrite(root, "source-route-reviews/latest.json", reference)
    return { status: "applied", counts: mergedCounts, reviewed_routes: reviewedRoutes.length, review: reference, backup: `${dir}/acquisition-before.json` }
  })
}
