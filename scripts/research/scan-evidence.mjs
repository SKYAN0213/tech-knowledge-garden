import fs from "node:fs"
import { canonicalURL } from "../garden.mjs"
import { sourceId, sha256 } from "./contracts.mjs"
import { assertStoredEvidence, articleContentFingerprint } from "./parser.mjs"
import { safePath } from "./run-state.mjs"
import { parseResearchDate } from "./dates.mjs"
import { validateListingSupportRelations } from "./supporting-sources.mjs"

function verifyDocument(root, document) {
  if (
    !["captured", "not_modified"].includes(document.fetch_status) ||
    !/^[a-f0-9]{64}$/.test(document.body_sha256 || "") ||
    document.source_id !== sourceId(document.original_url) ||
    document.source_version_id !== `${document.source_id}:${document.body_sha256}`
  )
    throw Error("Daily scan source document identity is invalid")
  const body = fs.readFileSync(safePath(root, document.body_path))
  if (sha256(body) !== document.body_sha256) throw Error("Daily scan original body hash mismatch")
}

function verifyScanEvidence(root, scan, expected, { allowLegacyCandidates = false } = {}) {
  if (
    scan.summary.channel_id !== expected.channel_id ||
    scan.summary.window?.since !== expected.since ||
    scan.summary.window?.until_exclusive !== expected.until_exclusive ||
    !Array.isArray(scan.documents) ||
    !Array.isArray(scan.parses) ||
    !Array.isArray(scan.candidates) ||
    !Array.isArray(scan.indexDocuments)
  )
    throw Error("Stored scan does not prove the requested route window")
  if (![...scan.indexDocuments, ...scan.documents].length)
    throw Error("A covered route window needs stored listing bytes")
  for (const document of [...scan.indexDocuments, ...scan.documents]) verifyDocument(root, document)
  if (scan.parses.length || scan.documents.length) {
    if (!scan.parses.length || !scan.documents.length)
      throw Error("Stored detail documents and parses must agree")
    assertStoredEvidence(root, scan.documents, scan.parses)
  }
  if (scan.summary.date_resolutions !== undefined) {
    if (!Array.isArray(scan.summary.date_resolutions) || scan.summary.date_resolutions.length > 500)
      throw Error("Invalid archive date resolution evidence")
    const seen = new Set()
    for (const evidence of scan.summary.date_resolutions) {
      const source = scan.documents.find((d) => d.source_version_id === evidence.source_version_id)
      const article = scan.parses.find((p) => p.parse_id === evidence.parse_id)
      const listing = scan.parses.find((p) => p.parse_id === evidence.listing_parse_id)
      const printed = evidence.listed_date_text?.match(/^(\d{2}-\d{2}) ([01]\d|2[0-3]):[0-5]\d$/)
      const day = parseResearchDate(article?.dates?.published_at)?.day
      const link = listing?.links?.find(
        (l) =>
          l.profile_id === evidence.profile_id &&
          canonicalURL(l.url) === canonicalURL(evidence.url) &&
          l.listed_date_text === evidence.listed_date_text,
      )
      if (
        !source ||
        !article ||
        !listing ||
        !link ||
        !printed ||
        !day ||
        seen.has(evidence.url) ||
        canonicalURL(source.original_url) !== canonicalURL(evidence.url) ||
        article.source_version_id !== source.source_version_id ||
        listing.source_version_id !== evidence.listing_source_version_id ||
        article.status !== "extracted" ||
        !article.quality?.required_fields_present ||
        day !== evidence.published_at ||
        day.slice(5) !== printed[1]
      )
        throw Error("Archive omitted year lacks exact article and listing evidence")
      seen.add(evidence.url)
    }
  }
  for (const candidate of scan.candidates) {
    const document = scan.documents.find((item) =>
      candidate.article_source_version_id
        ? item.source_version_id === candidate.article_source_version_id
        : allowLegacyCandidates && candidate.key === "source-" + item.source_id,
    )
    const parsed = scan.parses.find((item) =>
      candidate.article_parse_id
        ? item.parse_id === candidate.article_parse_id
        : allowLegacyCandidates && item.source_version_id === document?.source_version_id,
    )
    if (
      !document ||
      !parsed ||
      !candidate.source_urls?.some(
        (url) => canonicalURL(url) === canonicalURL(document.original_url),
      ) ||
      parseResearchDate(candidate.source_published_at)?.day !==
        parseResearchDate(parsed.dates?.published_at)?.day
    )
      throw Error("Candidate lacks a matching stored detail source, parse and publication day")
    const supportingURLs = candidate.supporting_source_urls || []
    if (
      !Array.isArray(supportingURLs) ||
      supportingURLs.length > 7 ||
      new Set(supportingURLs.map((url) => canonicalURL(url))).size !== supportingURLs.length
    )
      throw Error("Candidate supporting source URLs are invalid")
    const declaredAttachments = new Set(
      (parsed.attachments || []).map((attachment) => canonicalURL(attachment.url)),
    )
    const relations = candidate.supporting_listing_relations || []
    for (const url of validateListingSupportRelations(
      scan.parses,
      document,
      parsed,
      relations,
      supportingURLs,
    ))
      declaredAttachments.add(url)
    if (supportingURLs.some((url) => !declaredAttachments.has(canonicalURL(url))))
      throw Error("Candidate supporting source is not linked by its exact parent parse")
    for (const url of supportingURLs) {
      const supportDocuments = scan.documents.filter(
        (item) => canonicalURL(item.original_url) === canonicalURL(url),
      )
      if (supportDocuments.length !== 1)
        throw Error("Candidate supporting source document is missing")
      const supportParses = scan.parses.filter(
        (item) => item.source_version_id === supportDocuments[0].source_version_id,
      )
      if (
        supportParses.length !== 1 ||
        supportParses[0].status !== "extracted" ||
        !supportParses[0].quality?.required_fields_present ||
        !supportParses[0].blocks?.length
      )
        throw Error("Candidate supporting source lacks a complete stored parse")
      if (
        relations.some((r) => canonicalURL(r.url) === canonicalURL(url)) &&
        parseResearchDate(supportParses[0].dates?.published_at)?.day !==
          parseResearchDate(parsed.dates?.published_at)?.day
      )
        throw Error("Candidate listing support publication day conflicts with the original")
    }
  }
  if (
    scan.summary.candidate_count !== undefined &&
    scan.summary.candidate_count !== scan.candidates.length
  )
    throw Error("Stored scan candidate count changed")
  return true
}

export function verifyStoredListScan(root, scan, expected, options) {
  if (scan?.summary?.status !== "window_scanned")
    throw Error("Stored scan does not prove the requested route window")
  return verifyScanEvidence(root, scan, expected, options)
}

// Positive article evidence can be used while the route window stays incomplete.
// No image OCR or failed detail becomes a candidate through this path.
export function verifyStoredPartialCandidates(root, scan, expected) {
  if (
    scan?.summary?.status !== "incomplete" ||
    scan.summary.reason !== "detail_incomplete" ||
    scan.summary.assessment?.status !== "window_covered" ||
    !scan.candidates?.length ||
    !Array.isArray(scan.summary.details) ||
    new Set(scan.candidates.map((c) => c.key)).size !== scan.candidates.length
  )
    throw Error("Partial candidate intake requires a covered listing and incomplete details")
  verifyScanEvidence(root, scan, expected)
  const listing = [...scan.documents, ...scan.indexDocuments].find(
    (d) => d.source_version_id === scan.summary.listing_source_version_id,
  )
  if (!listing || listing.policy_status !== "checked")
    throw Error("Partial candidate listing policy evidence is missing")
  for (const candidate of scan.candidates) {
    const document = scan.documents.find(
      (d) => d.source_version_id === candidate.article_source_version_id,
    )
    const parsed = scan.parses.find((p) => p.parse_id === candidate.article_parse_id)
    const detail = scan.summary.details.filter(
      (d) =>
        d.status === "source_parsed_unreviewed" &&
        d.source_version_id === candidate.article_source_version_id &&
        d.parse_id === candidate.article_parse_id &&
        canonicalURL(d.url) === canonicalURL(document.original_url),
    )
    const day = parseResearchDate(candidate.source_published_at)?.day
    if (
      document.policy_status !== "checked" ||
      parsed.source_version_id !== document.source_version_id ||
      parsed.status !== "extracted" ||
      !parsed.quality?.required_fields_present ||
      !parsed.blocks?.length ||
      candidate.article_content_sha256 !== articleContentFingerprint(parsed) ||
      detail.length !== 1 ||
      !day ||
      day < expected.since ||
      day >= expected.until_exclusive
    )
      throw Error("Partial candidate lacks exact complete article evidence")
  }
  return true
}
