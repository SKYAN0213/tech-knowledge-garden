import fs from "node:fs"
import { canonicalURL } from "../garden.mjs"
import { sha256 } from "./contracts.mjs"
import { assertStoredEvidence, loadStoredSourceRun } from "./parser.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"

const isoDateTime = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value))

function exactRunId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]+$/.test(value)
}

function parseText(parse) {
  return [parse?.title || "", ...(parse?.blocks || []).map((block) => block.text || "")].join("\n")
}

function containsExactText(parse, quote, label) {
  if (typeof quote !== "string" || !quote.trim() || !parseText(parse).includes(quote))
    throw Error(`${label} quote must occur in the exact stored parse`)
}

function loadScheduledEvent(root, runId, eventId) {
  const eventsPath = `runs/${runId}/events.json`
  const eventsBytes = fs.readFileSync(safePath(root, eventsPath))
  const eventFile = JSON.parse(eventsBytes.toString("utf8"))
  if (
    eventFile.schema !== "research-scheduled-events/v1" ||
    eventFile.candidate_published !== false ||
    !Array.isArray(eventFile.events)
  )
    throw Error("Stored unpublished scheduled-event inventory required")
  const matches = eventFile.events.filter((event) => event.event_id === eventId)
  if (matches.length !== 1) throw Error("One exact scheduled event is required")
  const [event] = matches
  const directory = safePath(root, `runs/${runId}`)
  const pageFiles = fs.readdirSync(directory).filter((name) => /^form-html-page-\d+\.json$/.test(name))
  const pages = pageFiles
    .map((name) => ({ name, document: readJSON(root, `runs/${runId}/${name}`) }))
    .filter(({ document }) => document?.source_version_id === event.listing_source_version_id)
  if (pages.length !== 1) throw Error("Scheduled event listing page identity is missing or ambiguous")
  const [{ name: pageName, document: listingDocument }] = pages
  const pageIndex = pageName.match(/^form-html-page-(\d+)\.json$/)[1]
  const listingParse = readJSON(root, `runs/${runId}/form-html-parse-${pageIndex}.json`)
  if (
    listingParse?.parse_id !== event.listing_parse_id ||
    listingParse?.source_version_id !== event.listing_source_version_id
  )
    throw Error("Scheduled event does not reference its exact stored page parse")
  assertStoredEvidence(root, [listingDocument], [listingParse])
  if (
    event.listing_body_sha256 !== listingDocument.body_sha256 ||
    !parseText(listingParse).includes(`${event.company} ${event.title}`)
  )
    throw Error("Scheduled event listing row does not match its stored page evidence")
  return {
    eventFile,
    eventFileSha256: sha256(eventsBytes),
    event,
    listingDocument,
    listingParse,
  }
}

export function buildScheduledEventMaterialResolution({
  review,
  reviewSha256,
  eventRunId,
  eventRun,
  eventDetailRunId,
  eventDetailRun,
  materialRunId,
  materialRun,
  generatedAt,
}) {
  if (
    review?.schema !== "research-scheduled-event-material-review/v1" ||
    review.decision !== "supporting_material_for_scheduled_event" ||
    review.event_run_id !== eventRunId ||
    review.event_detail_run_id !== eventDetailRunId ||
    review.material_run_id !== materialRunId ||
    !exactRunId(eventRunId) ||
    !exactRunId(eventDetailRunId) ||
    !exactRunId(materialRunId) ||
    !/^[a-f0-9]{64}$/.test(reviewSha256 || "") ||
    typeof review.event_id !== "string" ||
    typeof review.material_url !== "string" ||
    typeof review.reviewer !== "string" ||
    !review.reviewer.trim() ||
    typeof review.reason !== "string" ||
    !review.reason.trim() ||
    !isoDateTime(review.reviewed_at) ||
    !isoDateTime(generatedAt)
  )
    throw Error("A complete reviewed scheduled-event/material relation is required")

  const scheduled = loadScheduledEvent(
    eventRun.root,
    eventRunId,
    review.event_id,
  )
  const { event } = scheduled
  if (
    eventDetailRun.documents.filter(
      (document) => canonicalURL(document.original_url) === canonicalURL(event.detail_url),
    ).length !== 1
  )
    throw Error("Event detail must be captured at the exact scheduled-event URL")
  const eventDetailDocument = eventDetailRun.documents.find(
    (document) => canonicalURL(document.original_url) === canonicalURL(event.detail_url),
  )
  const eventDetailParses = eventDetailRun.parses.filter(
    (parse) => parse.source_version_id === eventDetailDocument.source_version_id,
  )
  if (eventDetailParses.length !== 1 || eventDetailParses[0].status !== "extracted")
    throw Error("One extracted parse of the exact event detail is required")
  const eventDetailParse = eventDetailParses[0]
  containsExactText(eventDetailParse, review.event_detail_quote, "Event detail")
  if (
    !parseText(eventDetailParse).includes(event.company) ||
    !review.event_detail_quote.includes(event.event_date)
  )
    throw Error("Event detail quote must identify the company and scheduled event date")
  if (eventDetailParse.dates?.published_at)
    throw Error("Scheduled event dates must not become article publication dates")

  const materialURL = canonicalURL(review.material_url)
  const materialDocuments = materialRun.documents.filter(
    (document) => canonicalURL(document.original_url) === materialURL,
  )
  if (materialDocuments.length !== 1) throw Error("One exact official material document is required")
  const materialDocument = materialDocuments[0]
  const materialParses = materialRun.parses.filter(
    (parse) => parse.source_version_id === materialDocument.source_version_id,
  )
  if (materialParses.length !== 1 || materialParses[0].status !== "extracted")
    throw Error("One extracted parse of the exact material document is required")
  const materialParse = materialParses[0]
  containsExactText(materialParse, review.material_title_quote, "Material title")
  if (materialParse.dates?.published_at) {
    const publicationDateQuote = review.material_publication_date_quote
    containsExactText(materialParse, publicationDateQuote, "Material publication date")
    if (!publicationDateQuote.includes(materialParse.dates.published_at))
      throw Error("Material publication date quote must contain the parsed date")
  }

  const archiveMatches = materialRun.documents
    .map((document) => ({
      document,
      parse: materialRun.parses.find((parse) => parse.source_version_id === document.source_version_id),
    }))
    .filter(({ document, parse }) =>
      parse?.links?.some((link) => canonicalURL(link.url) === materialURL),
    )
  if (archiveMatches.length !== 1)
    throw Error("Official IR archive must link to the exact material URL")
  const [{ document: archiveDocument, parse: archiveParse }] = archiveMatches
  const rawArchive = fs.readFileSync(safePath(materialRun.root, archiveDocument.body_path), "utf8")
  if (!rawArchive.includes(review.archive_row_quote))
    throw Error("IR archive row quote is not present in original source bytes")
  const archiveLink = archiveParse.links.filter((link) => canonicalURL(link.url) === materialURL)
  if (
    archiveLink.length !== 1 ||
    archiveLink[0].text !== review.archive_link_text
  )
    throw Error("IR archive link text does not match the reviewed material")

  return {
    schema: "research-scheduled-event-material-resolution/v1",
    decision: "supporting_material_for_scheduled_event",
    relation_id: sha256(
      JSON.stringify({
        event_id: event.event_id,
        event_detail_source_version_id: eventDetailDocument.source_version_id,
        material_source_version_id: materialDocument.source_version_id,
        relation: "scheduled_event_material",
      }),
    ).slice(0, 24),
    schedule_event: {
      event_id: event.event_id,
      company: event.company,
      title: event.title,
      event_date: event.event_date,
      detail_url: event.detail_url,
      listing_row_index: event.listing_row_index,
      listing_source_version_id: event.listing_source_version_id,
      listing_parse_id: event.listing_parse_id,
      listing_body_sha256: event.listing_body_sha256,
      event_detail_source_version_id: eventDetailDocument.source_version_id,
      event_detail_body_sha256: eventDetailDocument.body_sha256,
      event_detail_parse_id: eventDetailParse.parse_id,
      event_detail_title: eventDetailParse.title,
      published_at: eventDetailParse.dates?.published_at || null,
    },
    supporting_material: {
      relation: "scheduled_event_material",
      url: materialDocument.original_url,
      title: materialParse.title,
      published_at: materialParse.dates?.published_at || null,
      publication_date_basis: materialParse.dates?.basis || null,
      source_version_id: materialDocument.source_version_id,
      body_sha256: materialDocument.body_sha256,
      parse_id: materialParse.parse_id,
      page_count: materialParse.page_count || null,
      archive_url: archiveDocument.original_url,
      archive_source_version_id: archiveDocument.source_version_id,
      archive_body_sha256: archiveDocument.body_sha256,
      archive_parse_id: archiveParse.parse_id,
      archive_link_text: archiveLink[0].text,
    },
    review: {
      reviewer: review.reviewer,
      reviewed_at: review.reviewed_at,
      reason: review.reason,
      event_detail_quote: review.event_detail_quote,
      archive_row_quote: review.archive_row_quote,
      archive_link_text: review.archive_link_text,
      material_title_quote: review.material_title_quote,
      ...(review.material_publication_date_quote
        ? { material_publication_date_quote: review.material_publication_date_quote }
        : {}),
    },
    inputs: {
      event_run_id: eventRunId,
      event_inventory_sha256: scheduled.eventFileSha256,
      event_listing_run_id: eventRunId,
      event_listing_source_version_id: event.listing_source_version_id,
      event_listing_parse_id: event.listing_parse_id,
      event_detail_run_id: eventDetailRunId,
      event_detail_documents_sha256: eventDetailRun.identity.documents_sha256,
      event_detail_parses_sha256: eventDetailRun.identity.parses_sha256,
      material_run_id: materialRunId,
      material_documents_sha256: materialRun.identity.documents_sha256,
      material_parses_sha256: materialRun.identity.parses_sha256,
      review_sha256: reviewSha256,
    },
    publication_date_assigned: false,
    article_candidate_created: false,
    candidate_published: false,
    drive_written: false,
    public_verified: false,
    generated_at: generatedAt,
  }
}

export async function recordScheduledEventMaterialLink({ root, runId, reviewPath }) {
  if (!exactRunId(runId) || !reviewPath)
    throw Error("Resolution run ID and private review file are required")
  return withLock(root, `run-${runId}`, async () => {
    const reviewBytes = fs.readFileSync(safePath(root, reviewPath))
    const review = JSON.parse(reviewBytes.toString("utf8"))
    const eventRunId = review.event_run_id
    const eventDetailRunId = review.event_detail_run_id
    const materialRunId = review.material_run_id
    if ([eventRunId, eventDetailRunId, materialRunId].includes(runId))
      throw Error("Resolution run must differ from all source runs")
    const eventDetailRun = { ...loadStoredSourceRun(root, eventDetailRunId), root }
    const materialRun = { ...loadStoredSourceRun(root, materialRunId), root }
    const relative = `runs/${runId}/scheduled-event-material-link.json`
    const reviewRelative = `runs/${runId}/scheduled-event-material-link-review.json`
    const existing = readJSON(root, relative)
    const storedReview = fs.existsSync(safePath(root, reviewRelative))
      ? fs.readFileSync(safePath(root, reviewRelative))
      : null
    if (storedReview && sha256(storedReview) !== sha256(reviewBytes))
      throw Error("Event/material review input changed; use a new run ID")
    const receipt = buildScheduledEventMaterialResolution({
      review,
      reviewSha256: sha256(reviewBytes),
      eventRunId,
      eventRun: { root },
      eventDetailRunId,
      eventDetailRun,
      materialRunId,
      materialRun,
      generatedAt: existing?.generated_at || new Date().toISOString(),
    })
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(receipt))
        throw Error("Event/material relation inputs changed; use a new run ID")
      if (!storedReview) atomicCreate(root, reviewRelative, reviewBytes)
      return { ...existing, path: safePath(root, relative), reused: true }
    }
    if (!storedReview) atomicCreate(root, reviewRelative, reviewBytes)
    const written = atomicCreate(root, relative, receipt)
    return { ...receipt, path: written.path, sha256: written.sha256, reused: false }
  })
}

export function verifyScheduledEventMaterialLink(root, runId) {
  const relative = `runs/${runId}/scheduled-event-material-link.json`
  const receipt = readJSON(root, relative)
  if (receipt?.schema !== "research-scheduled-event-material-resolution/v1")
    throw Error("Stored event/material resolution required")
  const reviewRelative = `runs/${runId}/scheduled-event-material-link-review.json`
  const reviewBytes = fs.readFileSync(safePath(root, reviewRelative))
  const review = JSON.parse(reviewBytes.toString("utf8"))
  const eventDetailRun = { ...loadStoredSourceRun(root, review.event_detail_run_id), root }
  const materialRun = { ...loadStoredSourceRun(root, review.material_run_id), root }
  const rebuilt = buildScheduledEventMaterialResolution({
    review,
    reviewSha256: sha256(reviewBytes),
    eventRunId: review.event_run_id,
    eventRun: { root },
    eventDetailRunId: review.event_detail_run_id,
    eventDetailRun,
    materialRunId: review.material_run_id,
    materialRun,
    generatedAt: receipt.generated_at,
  })
  if (JSON.stringify(rebuilt) !== JSON.stringify(receipt))
    throw Error("Event/material resolution no longer matches its source evidence")
  return receipt
}
