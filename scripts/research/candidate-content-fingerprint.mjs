import fs from "node:fs"
import path from "node:path"
import { canonicalURL } from "../garden.mjs"
import { samePublicationDate } from "./dates.mjs"
import { articleContentFingerprint, loadStoredSourceRun } from "./parser.mjs"
import { sha256 } from "./contracts.mjs"
import { safePath } from "./run-state.mjs"

const fingerprintPattern = /^[a-f0-9]{64}$/
const runPattern = /^[a-zA-Z0-9_-]+$/
const sourceUrls = (candidate) =>
  [...new Set((candidate.source_urls || []).map((url) => canonicalURL(url)))].sort()

function candidateURLIndex(candidates) {
  const byURL = new Map()
  for (const candidate of candidates) {
    if (!candidate.key || !Array.isArray(candidate.source_urls))
      throw Error("Candidate keys and source URLs required")
    for (const url of sourceUrls(candidate)) {
      const rows = byURL.get(url) || []
      rows.push(candidate)
      byURL.set(url, rows)
    }
  }
  return byURL
}

function runDirectories(root) {
  if (!fs.existsSync(path.resolve(root))) return []
  const directory = safePath(root, "runs")
  if (!fs.existsSync(directory)) return []
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && runPattern.test(entry.name))
    .map((entry) => entry.name)
    .sort()
}

export function candidateSourceInventoryFingerprint({ root, candidates }) {
  if (!root || !Array.isArray(candidates))
    throw Error("Source inventory fingerprint requires a root and candidates")
  const pending = candidates.filter((candidate) => !candidate.article_content_sha256)
  const byURL = candidateURLIndex(pending)
  const matchedRuns = []
  for (const sourceRun of runDirectories(root)) {
    let documentsBytes
    let documents
    try {
      documentsBytes = fs.readFileSync(safePath(root, `runs/${sourceRun}/documents.json`))
      documents = JSON.parse(documentsBytes.toString("utf8"))
    } catch {
      continue
    }
    if (!Array.isArray(documents)) continue
    const matches = documents
      .map((document) => {
        try {
          const url = canonicalURL(document.original_url)
          return byURL.has(url)
            ? {
                url,
                source_version_id: document.source_version_id || null,
                body_sha256: document.body_sha256 || null,
                fetch_status: document.fetch_status || null,
              }
            : null
        } catch {
          return null
        }
      })
      .filter(Boolean)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    if (!matches.length) continue
    let parsesSha256 = null
    try {
      parsesSha256 = sha256(fs.readFileSync(safePath(root, `runs/${sourceRun}/parses.json`)))
    } catch {}
    matchedRuns.push({
      source_run: sourceRun,
      documents_sha256: sha256(documentsBytes),
      parses_sha256: parsesSha256,
      matches,
    })
  }
  return sha256(JSON.stringify(matchedRuns))
}

export function buildCandidateContentFingerprintEvidence({
  root,
  runId,
  candidates,
  backlogSha256,
  generatedAt = new Date().toISOString(),
}) {
  if (
    !root ||
    !runPattern.test(runId || "") ||
    !fingerprintPattern.test(backlogSha256 || "") ||
    !Array.isArray(candidates) ||
    !Number.isFinite(Date.parse(generatedAt))
  )
    throw Error("Private run, candidate inventory, backlog hash and timestamp required")

  const pending = candidates.filter((candidate) => !candidate.article_content_sha256)
  const sourceInventorySha256 = candidateSourceInventoryFingerprint({ root, candidates })
  const byURL = candidateURLIndex(pending)
  const observations = new Map(pending.map((candidate) => [candidate.key, new Map()]))
  const loadedRuns = new Map()
  const directories = runDirectories(root)

  for (const sourceRun of directories) {
    let documents
    try {
      documents = JSON.parse(
        fs.readFileSync(safePath(root, `runs/${sourceRun}/documents.json`), "utf8"),
      )
    } catch {
      continue
    }
    if (!Array.isArray(documents)) continue
    const matches = []
    for (const document of documents) {
      let url
      try {
        url = canonicalURL(document.original_url)
      } catch {
        continue
      }
      const candidatesForURL = byURL.get(url) || []
      if (!candidatesForURL.length) continue
      matches.push({ document, url, candidates: candidatesForURL })
    }
    if (!matches.length) continue

    let stored
    try {
      stored = loadStoredSourceRun(root, sourceRun, { allowUnacquired: true })
    } catch {
      continue
    }
    loadedRuns.set(sourceRun, stored)
    for (const { document, url, candidates: candidatesForURL } of matches) {
      if (!["captured", "not_modified"].includes(document.fetch_status)) continue
      const parses = stored.parses.filter(
        (parse) =>
          parse.source_version_id === document.source_version_id && parse.status === "extracted",
      )
      for (const candidate of candidatesForURL) {
        for (const parse of parses) {
          if (!samePublicationDate(candidate.source_published_at, parse.dates?.published_at))
            continue
          const contentSha = articleContentFingerprint(parse)
          const observation = {
            source_run: sourceRun,
            source_run_sha256: sha256(JSON.stringify(stored.identity)),
            source_url: url,
            source_version_id: document.source_version_id,
            source_body_sha256: document.body_sha256,
            parse_id: parse.parse_id,
            published_at: parse.dates?.published_at || null,
            content_sha256: contentSha,
          }
          observations
            .get(candidate.key)
            .set(`${sourceRun}|${document.source_version_id}|${parse.parse_id}`, observation)
        }
      }
    }
  }

  const rows = pending.map((candidate) => {
    const evidence = [...observations.get(candidate.key).values()].sort((a, b) =>
      `${a.source_run}|${a.source_version_id}|${a.parse_id}`.localeCompare(
        `${b.source_run}|${b.source_version_id}|${b.parse_id}`,
      ),
    )
    const fingerprints = [...new Set(evidence.map((item) => item.content_sha256))].sort()
    return {
      candidate_key: candidate.key,
      candidate_source_urls: sourceUrls(candidate),
      candidate_published_at: candidate.source_published_at || null,
      status:
        fingerprints.length === 1
          ? "unique_fingerprint"
          : fingerprints.length > 1
            ? "ambiguous_fingerprint"
            : "no_matching_source_parse",
      content_sha256: fingerprints.length === 1 ? fingerprints[0] : null,
      observations: evidence,
    }
  })
  const statusCounts = Object.fromEntries(
    [...new Set(rows.map((row) => row.status))]
      .sort()
      .map((status) => [status, rows.filter((row) => row.status === status).length]),
  )
  return {
    schema: "research-candidate-content-fingerprint-evidence/v1",
    run_id: runId,
    generated_at: generatedAt,
    backlog_sha256: backlogSha256,
    source_inventory_sha256: sourceInventorySha256,
    candidate_count: rows.length,
    status_counts: statusCounts,
    candidates: rows,
    candidate_published: false,
    drive_written: false,
    public_verified: false,
  }
}

function validateObservation(root, candidate, expectedFingerprint, observation, loadedRuns) {
  if (
    !runPattern.test(observation.source_run || "") ||
    !fingerprintPattern.test(observation.source_body_sha256 || "") ||
    !fingerprintPattern.test(observation.source_run_sha256 || "") ||
    !fingerprintPattern.test(observation.content_sha256 || "") ||
    observation.content_sha256 !== expectedFingerprint ||
    !candidate.source_urls.some((url) => canonicalURL(url) === observation.source_url) ||
    !samePublicationDate(candidate.source_published_at, observation.published_at)
  )
    throw Error("Candidate source fingerprint identity is invalid")

  let stored = loadedRuns.get(observation.source_run)
  if (!stored) {
    stored = loadStoredSourceRun(root, observation.source_run, { allowUnacquired: true })
    loadedRuns.set(observation.source_run, stored)
  }
  if (sha256(JSON.stringify(stored.identity)) !== observation.source_run_sha256)
    throw Error("Candidate source fingerprint run identity changed")
  const documents = stored.documents.filter(
    (document) =>
      document.source_version_id === observation.source_version_id &&
      document.body_sha256 === observation.source_body_sha256 &&
      ["captured", "not_modified"].includes(document.fetch_status) &&
      canonicalURL(document.original_url) === observation.source_url,
  )
  const parses = stored.parses.filter(
    (parse) =>
      parse.source_version_id === observation.source_version_id &&
      parse.parse_id === observation.parse_id &&
      parse.status === "extracted",
  )
  if (
    documents.length !== 1 ||
    parses.length !== 1 ||
    !samePublicationDate(candidate.source_published_at, parses[0].dates?.published_at) ||
    articleContentFingerprint(parses[0]) !== expectedFingerprint
  )
    throw Error("Candidate source fingerprint no longer matches stored original and parse")
}

export function projectVerifiedCandidateContentFingerprints({ root, candidates, backlogSha256 }) {
  const runs = runDirectories(root)
  const candidateByKey = new Map(candidates.map((candidate) => [candidate.key, candidate]))
  const pendingCandidates = candidates.filter((candidate) => !candidate.article_content_sha256)
  const evidenceByCandidate = new Map(
    pendingCandidates.map((candidate) => [candidate.key, new Map()]),
  )
  const loadedRuns = new Map()
  let receiptCount = 0
  let staleReceiptCount = 0
  let invalidReceiptCount = 0
  for (const runId of runs) {
    const receiptPath = `runs/${runId}/candidate-content-fingerprint-evidence.json`
    if (!fs.existsSync(safePath(root, receiptPath))) continue
    try {
      const receipt = JSON.parse(fs.readFileSync(safePath(root, receiptPath), "utf8"))
      if (
        receipt.schema !== "research-candidate-content-fingerprint-evidence/v1" ||
        receipt.run_id !== runId ||
        !fingerprintPattern.test(receipt.backlog_sha256 || "") ||
        (receipt.source_inventory_sha256 !== undefined &&
          !fingerprintPattern.test(receipt.source_inventory_sha256)) ||
        receipt.candidate_published !== false ||
        receipt.drive_written !== false ||
        receipt.public_verified !== false ||
        !Array.isArray(receipt.candidates) ||
        receipt.candidate_count !== receipt.candidates.length
      )
        throw Error("Invalid candidate fingerprint evidence receipt")
      if (receipt.backlog_sha256 !== backlogSha256) {
        staleReceiptCount++
        continue
      }
      const stagedObservations = new Map()
      const rowKeys = new Set()
      for (const row of receipt.candidates) {
        const candidate = candidateByKey.get(row.candidate_key)
        if (!candidate || rowKeys.has(row.candidate_key))
          throw Error("Candidate fingerprint evidence key is missing or duplicated")
        rowKeys.add(row.candidate_key)
        if (
          candidate.article_content_sha256 ||
          !Array.isArray(row.observations) ||
          JSON.stringify(row.candidate_source_urls) !== JSON.stringify(sourceUrls(candidate)) ||
          !samePublicationDate(row.candidate_published_at, candidate.source_published_at)
        )
          throw Error("Candidate fingerprint evidence no longer matches candidate ledger")
        const rowFingerprints = new Set()
        for (const observation of row.observations) {
          validateObservation(root, candidate, observation.content_sha256, observation, loadedRuns)
          rowFingerprints.add(observation.content_sha256)
          const observations = stagedObservations.get(candidate.key) || new Map()
          const observationKey = `${observation.source_run}|${observation.source_version_id}|${observation.parse_id}`
          const previous = observations.get(observationKey)
          if (previous && previous.content_sha256 !== observation.content_sha256)
            throw Error("Candidate fingerprint evidence conflicts for one parse identity")
          observations.set(observationKey, observation)
          stagedObservations.set(candidate.key, observations)
        }
        const expectedStatus =
          rowFingerprints.size === 0
            ? "no_matching_source_parse"
            : rowFingerprints.size === 1
              ? "unique_fingerprint"
              : "ambiguous_fingerprint"
        if (
          row.status !== expectedStatus ||
          (expectedStatus === "unique_fingerprint"
            ? row.content_sha256 !== [...rowFingerprints][0]
            : row.content_sha256 !== null)
        )
          throw Error("Candidate fingerprint evidence status does not match its observations")
      }
      if (
        rowKeys.size !== pendingCandidates.length ||
        pendingCandidates.some((candidate) => !rowKeys.has(candidate.key))
      )
        throw Error("Candidate fingerprint receipt does not cover the current pending inventory")
      for (const [key, observations] of stagedObservations) {
        const accumulated = evidenceByCandidate.get(key)
        for (const [observationKey, observation] of observations) {
          const previous = accumulated.get(observationKey)
          if (previous && previous.content_sha256 !== observation.content_sha256)
            throw Error("Candidate fingerprint receipts conflict for one parse identity")
        }
      }
      for (const [key, observations] of stagedObservations)
        for (const [observationKey, observation] of observations)
          evidenceByCandidate.get(key).set(observationKey, observation)
      receiptCount++
    } catch {
      invalidReceiptCount++
    }
  }
  const recovered = new Map()
  for (const [key, observations] of evidenceByCandidate) {
    const fingerprints = new Set([...observations.values()].map((item) => item.content_sha256))
    if (fingerprints.size === 1) recovered.set(key, [...fingerprints][0])
  }
  const projectedCandidates = candidates.map((candidate) =>
    recovered.has(candidate.key)
      ? {
          ...candidate,
          article_content_sha256: recovered.get(candidate.key),
          content_fingerprint_basis: "verified_stored_source_receipt",
        }
      : candidate,
  )
  return {
    candidates: projectedCandidates,
    receipt_count: receiptCount,
    recovered_candidate_count: recovered.size,
    stale_receipt_count: staleReceiptCount,
    invalid_receipt_count: invalidReceiptCount,
  }
}
