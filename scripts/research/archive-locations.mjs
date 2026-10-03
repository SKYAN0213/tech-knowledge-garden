import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { loadStoredSourceRun } from "./parser.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { canonicalURL } from "../garden.mjs"
import { loadApprovedOntologyInput } from "./ontology.mjs"

const validRun = (id) => typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id)
const locationPath = (id) => `archive-staging/${id}/drive-location.json`

// Index verified storage locations only. A lookup never approves, downloads,
// restores or publishes an article, and remains useful when the source cache is absent.
export async function registerArchiveLocation({
  root,
  runId,
  metadataFile,
  remotePackageFile,
  expectedParentId,
  now = new Date().toISOString(),
}) {
  if (!validRun(runId) || !validRun(expectedParentId))
    throw Error("Exact archive run and expected Drive parent required")
  return withLock(root, `archive-location-${runId}`, async () => {
    const metadataBytes = fs.readFileSync(metadataFile)
    const metadata = JSON.parse(metadataBytes)
    const age = Date.parse(now) - Date.parse(metadata.observed_at)
    if (
      metadata.schema !== "research-drive-archive-observation/v1" ||
      typeof metadata.observed_at !== "string" ||
      !/(?:Z|UTC|[+-]\d{2}:\d{2})$/.test(metadata.observed_at) ||
      !Number.isFinite(age) ||
      age < -60000 ||
      age > 600000 ||
      typeof metadata.name !== "string" ||
      !metadata.name.endsWith(".zip") ||
      !validRun(metadata.file_id) ||
      metadata.mime_type !== "application/zip" ||
      metadata.shared !== false ||
      !metadata.parent_ids?.includes(expectedParentId)
    )
      throw Error("Fresh private Drive archive metadata with the expected parent required")
    const receipt = readJSON(root, `archive-staging/${runId}/package-receipt.json`)
    const manifestBytes = fs.readFileSync(safePath(root, `runs/${runId}/archive-manifest.json`))
    const manifest = JSON.parse(manifestBytes)
    if (
      receipt?.schema !== "research-archive-package-receipt/v1" ||
      receipt.run_id !== runId ||
      manifest.schema !== "research-archive/v2" ||
      manifest.run_id !== runId ||
      receipt.manifest_sha256 !== sha256(manifestBytes) ||
      !manifest.bound_runs?.includes(manifest.source_run)
    )
      throw Error("Portable archive receipt and manifest disagree")
    const localPackage = fs.readFileSync(safePath(root, receipt.path))
    const remotePackage = fs.readFileSync(remotePackageFile)
    if (
      sha256(localPackage) !== receipt.sha256 ||
      sha256(remotePackage) !== receipt.sha256 ||
      localPackage.length !== receipt.bytes ||
      remotePackage.length !== receipt.bytes ||
      Number(metadata.size) !== receipt.bytes
    )
      throw Error("Drive raw bytes do not match the original archive package")
    for (const f of manifest.files) {
      const bytes = fs.readFileSync(safePath(root, f.path))
      if (bytes.length !== f.bytes || sha256(bytes) !== f.sha256)
        throw Error("Archive dependency changed: " + f.path)
    }
    const sources = new Map(),
      articles = []
    for (const run of manifest.bound_runs) {
      if (!validRun(run)) throw Error("Invalid bound archive run")
      const base = `runs/${run}/`
      if (readJSON(root, base + "documents.json") || readJSON(root, base + "parses.json")) {
        const stored = loadStoredSourceRun(root, run)
        for (const d of stored.documents) {
          if (!["captured", "not_modified"].includes(d.fetch_status)) continue
          let source = sources.get(d.source_version_id)
          if (!source) {
            source = {
              source_version_id: d.source_version_id,
              url: d.original_url,
              body_sha256: d.body_sha256,
              source_runs: [],
              parse_ids: [],
              event_ids: [],
            }
            sources.set(d.source_version_id, source)
          }
          if (
            source.body_sha256 !== d.body_sha256 ||
            canonicalURL(source.url) !== canonicalURL(d.original_url)
          )
            throw Error("Archive source identity disagrees across bound runs")
          source.source_runs.push(run)
          source.parse_ids.push(
            ...stored.parses
              .filter((p) => p.source_version_id === d.source_version_id)
              .map((p) => p.parse_id),
          )
        }
      }
      const approval = readJSON(root, base + "candidate-approval.json")
      if (approval) {
        if (!manifest.bound_runs.includes(approval.approved_run))
          throw Error("Archive approval points outside the package")
        const article = readJSON(root, `runs/${approval.approved_run}/approved-article.json`)
        if (!article || sha256(JSON.stringify(article)) !== approval.article_sha256)
          throw Error("Archive article does not match its approval")
        if (!validRun(article.event_id) || !Array.isArray(article.source_urls))
          throw Error("Approved archive article requires an event ID and exact source URLs")
        articles.push(article)
      }
      const revision = readJSON(root, base + "source-revision-resolution.json")
      if (revision) {
        const { receipt_sha256, ...body } = revision
        const selectedRun = revision.after?.approval?.approved_run
        if (
          revision.schema !== "research-source-revision-resolution/v1" ||
          sha256(JSON.stringify(body)) !== receipt_sha256 ||
          !manifest.bound_runs.includes(selectedRun)
        )
          throw Error("Archive revision resolution is invalid or points outside the package")
        const selected = loadApprovedOntologyInput(root, selectedRun)
        if (
          sha256(JSON.stringify(selected.article)) !== revision.after.approval.article_sha256 ||
          selected.article.event_id !== revision.event_id
        )
          throw Error("Archive revision does not match its current approval")
        articles.push(selected.article)
      }
    }
    for (const source of sources.values()) {
      source.event_ids = [
        ...new Set(
          articles
            .filter((a) => a.source_urls.some((u) => canonicalURL(u) === canonicalURL(source.url)))
            .map((a) => a.event_id),
        ),
      ].sort()
      source.source_runs = [...new Set(source.source_runs)].sort()
      source.parse_ids = [...new Set(source.parse_ids)].sort()
    }
    const rows = [...sources.values()].sort((a, b) =>
      a.source_version_id.localeCompare(b.source_version_id),
    )
    const record = {
      schema: "research-drive-archive-location/v1",
      archive_run: runId,
      package_sha256: receipt.sha256,
      package_bytes: receipt.bytes,
      manifest_sha256: receipt.manifest_sha256,
      metadata_sha256: sha256(metadataBytes),
      verified_at: metadata.observed_at,
      drive: {
        file_id: metadata.file_id,
        parent_id: expectedParentId,
        name: metadata.name,
        shared: false,
        raw_sha256_verified: true,
      },
      sources: rows,
      sources_sha256: sha256(JSON.stringify(rows)),
      candidate_approved: false,
      candidate_published: false,
    }
    const existing = readJSON(root, locationPath(runId))
    if (existing && JSON.stringify(existing) !== JSON.stringify(record))
      throw Error("Archive location changed; preserve the old record and use a new archive run")
    if (!existing) atomicCreate(root, locationPath(runId), record)
    return { ...record, reused: Boolean(existing) }
  })
}

export function lookupArchiveLocations(root, { sourceVersionId, eventId }) {
  if (
    (!sourceVersionId && !eventId) ||
    (sourceVersionId && !/^[a-f0-9]{20}:(?:render-)?[a-f0-9]{64}$/.test(sourceVersionId)) ||
    (eventId && !validRun(eventId))
  )
    throw Error("Exact source version or event ID required")
  const directory = safePath(root, "archive-staging")
  if (!fs.existsSync(directory)) return []
  const entries = fs.readdirSync(directory, { withFileTypes: true })
  if (entries.length > 2000) throw Error("Archive location scan budget exceeded")
  const matches = []
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw Error("Symlink in archive location register")
    if (!entry.isDirectory() || !validRun(entry.name)) continue
    const record = readJSON(root, locationPath(entry.name))
    if (!record) continue
    if (
      record.schema !== "research-drive-archive-location/v1" ||
      record.archive_run !== entry.name ||
      record.drive?.shared !== false ||
      record.drive?.raw_sha256_verified !== true ||
      !Array.isArray(record.sources) ||
      record.sources_sha256 !== sha256(JSON.stringify(record.sources))
    )
      throw Error("Invalid verified archive location: " + entry.name)
    const sources = record.sources.filter(
      (s) =>
        (!sourceVersionId || s.source_version_id === sourceVersionId) &&
        (!eventId || s.event_ids.includes(eventId)),
    )
    if (sources.length)
      matches.push({
        archive_run: record.archive_run,
        package_sha256: record.package_sha256,
        drive: record.drive,
        sources,
        candidate_published: false,
      })
  }
  return matches.sort((a, b) => a.archive_run.localeCompare(b.archive_run))
}
