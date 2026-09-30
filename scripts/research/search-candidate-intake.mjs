import { canonicalURL } from "../garden.mjs"
import path from "node:path"
import { BACKLOG_PATH } from "../research-window.mjs"
import { articleContentFingerprint, loadStoredSourceRun, selectStoredSources } from "./parser.mjs"
import { parseResearchDate, samePublicationDate } from "./dates.mjs"
import { sourceId, sha256 } from "./contracts.mjs"
import { atomicWrite, readJSON, withLock } from "./run-state.mjs"
import { mergeBacklog } from "./discovery.mjs"

// Hydrate one search result from its exact, byte-verified source capture. It
// creates only an unreviewed private candidate; editorial review and publishing
// remain separate operations.
export async function intakeSearchCandidate({
  root,
  runId,
  searchRunId,
  sourceRunId,
  candidateKey,
  backlogFile = BACKLOG_PATH,
}) {
  for (const id of [runId, searchRunId, sourceRunId])
    if (!/^[a-zA-Z0-9_-]+$/.test(id || "")) throw Error("Valid distinct intake run IDs required")
  if (new Set([runId, searchRunId, sourceRunId]).size !== 3)
    throw Error("Intake, search and source runs must be distinct")
  if (!/^[a-zA-Z0-9_-]+$/.test(candidateKey || "")) throw Error("Exact candidate key required")

  return withLock(root, "run-" + runId, async () => {
    const search = readJSON(root, `runs/${searchRunId}/search.json`)
    if (!search || !Array.isArray(search.candidates))
      throw Error("Stored search candidates required")
    const matches = search.candidates.filter((candidate) => candidate.key === candidateKey)
    if (matches.length !== 1) throw Error("One exact search candidate required")
    const discovered = matches[0]
    if (
      !Array.isArray(discovered.source_urls) ||
      discovered.source_urls.length !== 1 ||
      !Array.isArray(discovered.discovery)
    )
      throw Error("Search candidate needs one original URL and discovery provenance")
    const url = canonicalURL(discovered.source_urls[0])
    if (candidateKey !== `source-${sourceId(url)}`) throw Error("Candidate key does not match URL")

    // A collection run may contain blocked neighbors. Validate their receipts,
    // but only the selected exact URL must be acquired for this intake.
    const stored = loadStoredSourceRun(root, sourceRunId, { allowUnacquired: true })
    const documents = stored.documents.filter(
      (document) => canonicalURL(document.original_url) === url,
    )
    if (documents.length !== 1) throw Error("Source run must contain the exact candidate URL once")
    const document = documents[0]
    if (!["captured", "not_modified"].includes(document.fetch_status))
      throw Error("Exact candidate source was not acquired")
    const parses = stored.parses.filter(
      (parse) => parse.source_version_id === document.source_version_id,
    )
    if (parses.length !== 1 || parses[0].status !== "extracted")
      throw Error("Exact source needs one extracted parse")
    const parse = parses[0]
    if (!parse.title?.trim()) throw Error("Exact source parse needs a usable title")
    const parsedDate = parseResearchDate(parse.dates?.published_at)
    const sourceHash = parsedDate
      ? articleContentFingerprint(parse)
      : sha256(
          JSON.stringify({ title: parse.title, blocks: parse.blocks.map((block) => block.text) }),
        )
    const receiptPath = `runs/${runId}/search-candidate-intake.json`
    const input = {
      search_run: searchRunId,
      search_sha256: sha256(JSON.stringify(search)),
      source_run: stored.identity,
      candidate_key: candidateKey,
      source_url: url,
      source_version_id: document.source_version_id,
      parse_id: parse.parse_id,
      article_content_sha256: sourceHash,
      published_at: parsedDate ? parse.dates.published_at : null,
    }
    if (!parsedDate) {
      const receipt = {
        schema: "research-search-candidate-intake/v1",
        ...input,
        status: "source_date_missing",
        backlog_changed: false,
        candidate_published: false,
      }
      const existing = readJSON(root, receiptPath)
      if (existing && JSON.stringify(existing) !== JSON.stringify(receipt))
        throw Error("Search candidate intake changed; use a new run ID")
      if (!existing) atomicWrite(root, receiptPath, receipt)
      return { status: receipt.status, candidate_key: candidateKey, backlog_changed: false }
    }

    const backlog = readJSON(path.dirname(backlogFile), path.basename(backlogFile))
    const existing = backlog?.candidates?.filter(
      (candidate) =>
        candidate.key === candidateKey ||
        candidate.source_urls?.some((sourceURL) => canonicalURL(sourceURL) === url),
    )
    if (existing?.length > 1) throw Error("Candidate URL already branches across backlog entries")
    if (existing?.[0] && existing[0].review_status !== "unreviewed")
      throw Error("Reviewed candidates require the existing event reconciliation path")
    if (
      existing?.[0]?.source_published_at &&
      !samePublicationDate(existing[0].source_published_at, parse.dates.published_at)
    )
      throw Error("Parsed source date conflicts with existing candidate date")

    const candidate = {
      ...discovered,
      title: parse.title.trim(),
      source_urls: [url],
      source_published_at: parse.dates.published_at,
      review_status: existing?.[0]?.review_status || "unreviewed",
      article_source_version_id: document.source_version_id,
      article_parse_id: parse.parse_id,
      article_observed_at: document.observed_at,
      article_content_sha256: sourceHash,
      discovery: [
        ...discovered.discovery,
        {
          method: "exact-source-intake",
          source_run: sourceRunId,
          source_version_id: document.source_version_id,
          parse_id: parse.parse_id,
          observed_at: document.observed_at,
        },
      ],
    }
    const previous = readJSON(root, receiptPath)
    if (
      previous &&
      JSON.stringify({ ...previous, backlog_sha256: undefined, backlog_changed: undefined }) !==
        JSON.stringify({
          schema: "research-search-candidate-intake/v1",
          ...input,
          title: candidate.title,
          status: "source_verified_unreviewed",
          review_status: existing?.[0]?.review_status || "unreviewed",
          backlog_sha256: undefined,
          backlog_changed: undefined,
          candidate_published: false,
        })
    )
      throw Error("Search candidate intake changed; use a new run ID")
    if (previous) {
      const storedCandidate = existing?.[0]
      if (
        !storedCandidate ||
        storedCandidate.source_published_at !== candidate.source_published_at ||
        storedCandidate.article_source_version_id !== candidate.article_source_version_id ||
        storedCandidate.article_parse_id !== candidate.article_parse_id ||
        storedCandidate.article_content_sha256 !== candidate.article_content_sha256
      )
        throw Error("Backlog candidate no longer matches its intake receipt")
      return {
        status: previous.status,
        candidate_key: candidateKey,
        review_status: previous.review_status,
        backlog_changed: false,
        candidate_published: false,
      }
    }
    const merged = await mergeBacklog(backlogFile, [candidate])
    const receipt = {
      schema: "research-search-candidate-intake/v1",
      ...input,
      title: candidate.title,
      status: "source_verified_unreviewed",
      review_status: existing?.[0]?.review_status || "unreviewed",
      backlog_sha256: merged.sha256,
      backlog_changed: merged.changed,
      candidate_published: false,
    }
    atomicWrite(root, receiptPath, receipt)
    return {
      status: receipt.status,
      candidate_key: candidateKey,
      review_status: receipt.review_status,
      backlog_changed: merged.changed,
      candidate_published: false,
    }
  })
}

export function selectIntakenSearchCandidate({
  root,
  intakeRunId,
  sourceRunId,
  candidateKey,
  backlogFile = BACKLOG_PATH,
}) {
  for (const id of [intakeRunId, sourceRunId])
    if (!/^[a-zA-Z0-9_-]+$/.test(id || "")) throw Error("Valid intake and source run IDs required")
  if (intakeRunId === sourceRunId) throw Error("Intake and source runs must be distinct")
  if (!/^[a-zA-Z0-9_-]+$/.test(candidateKey || "")) throw Error("Exact candidate key required")

  let receipt = readJSON(root, `runs/${intakeRunId}/search-candidate-intake.json`)
  if (!receipt) {
    const batch = readJSON(root, `runs/${intakeRunId}/search-candidate-intake-batch.json`)
    const item = batch?.results?.find((result) => result.candidate_key === candidateKey)
    if (
      batch?.schema === "research-search-candidate-intake-batch/v1" &&
      item?.status === "source_verified_unreviewed" &&
      item.candidate_published === false
    ) {
      const itemRunId = `${intakeRunId}-${sha256(candidateKey).slice(0, 12)}`
      receipt = readJSON(root, `runs/${itemRunId}/search-candidate-intake.json`)
      if (
        receipt?.search_run !== batch.search_run ||
        receipt?.source_run?.source_run !== item.source_run
      )
        throw Error("Batch intake item receipt does not match its batch checkpoint")
    }
  }
  if (
    receipt?.schema !== "research-search-candidate-intake/v1" ||
    receipt.status !== "source_verified_unreviewed" ||
    receipt.candidate_key !== candidateKey ||
    receipt.candidate_published !== false
  )
    throw Error("Successful private search-candidate intake receipt required")
  const backlog = readJSON(path.dirname(backlogFile), path.basename(backlogFile))
  if (backlog?.schema !== "research-candidates/v1" || !Array.isArray(backlog.candidates))
    throw Error("Existing candidate backlog required")
  const candidates = backlog.candidates.filter((candidate) => candidate.key === candidateKey)
  if (candidates.length !== 1) throw Error("One exact intaken candidate required")
  const candidate = candidates[0]
  if (
    !Array.isArray(candidate.source_urls) ||
    candidate.source_urls.length !== 1 ||
    candidate.review_status !== "unreviewed" ||
    candidate.event_id ||
    candidate.approval ||
    candidate.disposition ||
    candidate.identity ||
    candidate.source_revision_alert ||
    canonicalURL(candidate.source_urls?.[0] || "") !== receipt.source_url ||
    candidate.source_published_at !== receipt.published_at ||
    candidate.article_source_version_id !== receipt.source_version_id ||
    candidate.article_parse_id !== receipt.parse_id ||
    candidate.article_content_sha256 !== receipt.article_content_sha256
  )
    throw Error("Candidate no longer matches its unreviewed intake evidence")

  const sourceRun = loadStoredSourceRun(root, sourceRunId, { allowUnacquired: true })
  const exactDocuments = sourceRun.documents.filter(
    (document) => canonicalURL(document.original_url) === receipt.source_url,
  )
  if (exactDocuments.length !== 1) throw Error("Source run must contain the exact source once")
  const selected = selectStoredSources(root, sourceRunId, [exactDocuments[0].original_url])
  const [document] = selected.documents
  const [parse] = selected.parses
  if (
    document.source_version_id !== receipt.source_version_id ||
    parse.parse_id !== receipt.parse_id ||
    articleContentFingerprint(parse) !== receipt.article_content_sha256
  )
    throw Error("Selected source differs from the exact intaken evidence")
  return { candidate, selected }
}
