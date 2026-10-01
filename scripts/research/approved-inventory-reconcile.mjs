import { canonicalURL } from "../garden.mjs"
import { sha256 } from "./contracts.mjs"

export const DRIVE_ROOT_ID = "1VKWSC2IYOtOd__3NKEzD-BK34qVqtlAD"
export const DRIVE_ROOTS = [
  ["Editions", "1cTY588ZYBPVNyuB41Tcu7OYyCqAZdSW-"],
  ["Knowledge", "1Ykx3LoF6v8qyFcPQP0D9XKNVoOqM-v0Q"],
  ["Signals", "14SbkTeQ1JMy-5PAoPwhSaFaNjwc8Ncnt"],
  ["TrendTopics", "12JauFgbLZY-HvE8kW_DPFH4mFlclWlAX"],
]
const ROOT_NAMES = DRIVE_ROOTS.map(([name]) => name)

const compareRows = (rows, label) => {
  if (!Array.isArray(rows)) throw Error(`${label} list required`)
  const byPath = new Map()
  for (const row of rows) {
    if (
      typeof row?.path !== "string" ||
      row.path.includes("\\") ||
      row.path.startsWith("/") ||
      row.path.split("/").some((part) => !part || part === "." || part === "..") ||
      !ROOT_NAMES.includes(row.path.split("/")[0]) ||
      !row.path.endsWith(".md")
    )
      throw Error(`Invalid ${label} path`)
    if (byPath.has(row.path)) throw Error(`Duplicate ${label} path: ${row.path}`)
    byPath.set(row.path, row)
  }
  return byPath
}

function verifyDriveReadback(snapshot, readback, readbackSha256) {
  if (
    snapshot?.schema !== "tech-drive-source/v1" ||
    snapshot.complete !== true ||
    snapshot.root_folder_id !== DRIVE_ROOT_ID ||
    JSON.stringify(snapshot.roots) !== JSON.stringify(ROOT_NAMES) ||
    snapshot.readback?.schema !== "tech-drive-connector-readback/v1" ||
    snapshot.readback.receipt_sha256 !== readbackSha256 ||
    snapshot.readback.source_files !== snapshot.files?.length
  )
    throw Error("Complete Drive source snapshot required")
  if (
    readback?.schema !== "tech-drive-connector-readback/v1" ||
    readback.root_folder_id !== DRIVE_ROOT_ID ||
    JSON.stringify(readback.roots) !==
      JSON.stringify(DRIVE_ROOTS.map(([name, id]) => ({ name, id }))) ||
    readback.verified_at !== snapshot.exported_at
  )
    throw Error("Drive readback receipt does not match the source snapshot")

  const folderIds = new Map(DRIVE_ROOTS.map(([name, id]) => [name, id]))
  const folders = [...(readback.folders || [])].sort(
    (a, b) => a.path.split("/").length - b.path.split("/").length,
  )
  for (const folder of folders) {
    const parent = folder.path.split("/").slice(0, -1).join("/")
    if (
      !folder.path ||
      !folder.id ||
      folderIds.has(folder.path) ||
      folder.parent_ids?.length !== 1 ||
      folder.parent_ids[0] !== folderIds.get(parent)
    )
      throw Error("Drive folder parent chain is invalid")
    folderIds.set(folder.path, folder.id)
  }

  const rawFiles = compareRows(readback.files, "Drive readback")
  const sourceFiles = compareRows(snapshot.files, "Drive snapshot")
  if (rawFiles.size !== sourceFiles.size || snapshot.readback.source_files !== rawFiles.size)
    throw Error("Drive snapshot file inventory is incomplete")
  for (const [path, source] of sourceFiles) {
    const raw = rawFiles.get(path)
    const parentPath = path.split("/").slice(0, -1).join("/")
    if (
      !raw ||
      !raw.file_id ||
      raw.parent_ids?.length !== 1 ||
      raw.parent_id !== raw.parent_ids[0] ||
      raw.parent_id !== folderIds.get(parentPath) ||
      !Number.isInteger(raw.size) ||
      raw.size < 0 ||
      typeof raw.modified_time !== "string" ||
      !Number.isFinite(Date.parse(raw.modified_time)) ||
      typeof raw.sha256 !== "string" ||
      source.sha256 !== raw.sha256 ||
      Buffer.byteLength(source.content, "utf8") !== raw.size ||
      sha256(source.content) !== raw.sha256
    )
      throw Error(`Drive snapshot and raw readback disagree: ${path}`)
  }
  return sourceFiles
}

function canonicalSources(values) {
  const urls = new Set()
  for (const value of Array.isArray(values) ? values : []) {
    try {
      urls.add(canonicalURL(value))
    } catch {
      // Invalid candidate URLs remain visible as missing exact-source evidence.
    }
  }
  return urls
}

function verifiedEvent(event) {
  return event?.review_status === "verified" && event.date_review_required !== true
}

function classifyCandidate(candidate, eventById, eventIdsByURL) {
  const urls = canonicalSources(candidate.source_urls)
  const urlMatches = new Set([...urls].flatMap((url) => eventIdsByURL.get(url) || []))
  const idMatch = candidate.event_id ? eventById.get(candidate.event_id) : null
  const exactSameEventUrl =
    idMatch && [...urls].some((url) => eventIdsByURL.get(url)?.has(idMatch.event_id))

  let classification
  if (urlMatches.size > 1) classification = "source_url_matches_multiple_events"
  else if (idMatch && exactSameEventUrl) {
    classification = verifiedEvent(idMatch)
      ? "exact_source_and_verified_event"
      : "exact_source_but_event_review_incomplete"
  } else if (idMatch) classification = "event_id_source_url_conflict"
  else if (urlMatches.size === 1) classification = "exact_source_existing_event_id_unconfirmed"
  else classification = urls.size ? "new_event_identity_review" : "source_url_missing_review"

  return {
    candidate_key: candidate.key,
    candidate_event_id: candidate.event_id || null,
    candidate_review_status: candidate.review_status || "unreviewed",
    next_route: candidate.next_route || null,
    observed_in_run: candidate.observed_in_run === true,
    canonical_source_urls: [...urls].sort(),
    matched_event_ids: [...urlMatches].sort(),
    event_id_match_status: idMatch
      ? verifiedEvent(idMatch)
        ? "verified"
        : "review_required"
      : "none",
    classification,
    automatic_merge: false,
    automatic_approval: false,
  }
}

export function buildApprovedInventoryReconciliation({
  handoff,
  inventory,
  driveSnapshot,
  driveReadback,
  driveReadbackSha256,
  generatedAt = new Date().toISOString(),
  maximumPlanAgeMs = 10 * 60 * 1000,
}) {
  const sourceFiles = verifyDriveReadback(driveSnapshot, driveReadback, driveReadbackSha256)
  if (inventory?.schema !== "research-retrospective-inventory/v1")
    throw Error("Retrospective authoring inventory required")
  const inventoryHashes = inventory.hashes || {}
  if (
    Object.keys(inventoryHashes).length !== sourceFiles.size ||
    [...sourceFiles].some(([filePath, row]) => inventoryHashes[filePath] !== row.sha256)
  )
    throw Error("Current authoring inventory does not match the Drive raw-byte snapshot")
  if (
    handoff?.schema !== "research-editorial-handoff/v1" ||
    !handoff.daily_run ||
    !Array.isArray(handoff.pending) ||
    !Array.isArray(handoff.observed_resolved) ||
    handoff.candidate_published !== false ||
    handoff.drive_verified !== false ||
    handoff.public_verified !== false
  )
    throw Error("Unpublished editorial handoff required")

  const events = inventory.events || []
  const eventById = new Map()
  const eventIdsByURL = new Map()
  for (const event of events) {
    if (!event?.event_id || eventById.has(event.event_id))
      throw Error("Authoring inventory has duplicate or invalid event IDs")
    eventById.set(event.event_id, event)
    for (const url of canonicalSources((event.appearances || []).flatMap((a) => a.source_urls))) {
      if (!eventIdsByURL.has(url)) eventIdsByURL.set(url, new Set())
      eventIdsByURL.get(url).add(event.event_id)
    }
  }

  const candidates = [...handoff.pending, ...handoff.observed_resolved]
  const keys = new Set()
  const rows = candidates.map((candidate) => {
    if (!candidate?.key || keys.has(candidate.key))
      throw Error("Editorial handoff contains duplicate or invalid candidate keys")
    keys.add(candidate.key)
    return classifyCandidate(candidate, eventById, eventIdsByURL)
  })

  const keysByURL = new Map()
  for (const row of rows) {
    for (const url of row.canonical_source_urls) {
      if (!keysByURL.has(url)) keysByURL.set(url, [])
      keysByURL.get(url).push(row.candidate_key)
    }
  }
  const duplicateSourceGroups = [...keysByURL]
    .filter(([, candidateKeys]) => candidateKeys.length > 1)
    .map(([url, candidateKeys]) => {
      const grouped = rows.filter((row) => candidateKeys.includes(row.candidate_key))
      return {
        canonical_url: url,
        candidate_keys: [...candidateKeys].sort(),
        event_ids: [
          ...new Set(grouped.map((row) => row.candidate_event_id).filter(Boolean)),
        ].sort(),
        classification: "same_source_requires_event_identity_review",
        automatic_merge: false,
      }
    })
    .sort((a, b) => a.canonical_url.localeCompare(b.canonical_url))

  const counts = Object.fromEntries(
    [...new Set(rows.map((row) => row.classification))]
      .sort()
      .map((key) => [key, rows.filter((row) => row.classification === key).length]),
  )
  const observedAt = Date.parse(generatedAt)
  const snapshotAt = Date.parse(driveSnapshot.exported_at)
  if (!Number.isFinite(observedAt) || !Number.isFinite(snapshotAt) || observedAt < snapshotAt)
    throw Error("Reconciliation timestamp predates the Drive source snapshot")

  return {
    schema: "research-drive-approval-reconciliation/v1",
    generated_at: generatedAt,
    daily_run: handoff.daily_run,
    handoff_authority: handoff.authority,
    drive_snapshot: {
      root_folder_id: driveSnapshot.root_folder_id,
      exported_at: driveSnapshot.exported_at,
      file_count: sourceFiles.size,
      snapshot_sha256: driveSnapshot.snapshot_sha256 || null,
      readback_sha256: driveReadbackSha256,
      age_ms: observedAt - snapshotAt,
      fresh_for_new_plan: observedAt - snapshotAt <= maximumPlanAgeMs,
      matches_current_authoring_inventory: true,
    },
    authoring_inventory: {
      observed_at: inventory.observed_at,
      event_count: events.length,
      verified_event_count: events.filter(verifiedEvent).length,
      review_required_event_count: events.filter((event) => !verifiedEvent(event)).length,
      hash_count: Object.keys(inventoryHashes).length,
    },
    candidate_count: rows.length,
    classification_counts: counts,
    duplicate_source_groups: duplicateSourceGroups,
    candidates: rows,
    candidate_published: false,
    drive_written: false,
    public_verified: false,
  }
}
