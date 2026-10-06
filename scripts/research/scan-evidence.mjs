import fs from "node:fs"
import { canonicalURL } from "../garden.mjs"
import { sourceId, sha256 } from "./contracts.mjs"
import {
  assertStoredEvidence,
  articleContentFingerprint,
  hasBlockedPublicationMetadata,
} from "./parser.mjs"
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
  const provedOverlaps = new Set()
  if (scan.summary.page_overlaps !== undefined) {
    if (!Array.isArray(scan.summary.page_overlaps) || scan.summary.page_overlaps.length > 100)
      throw Error("Invalid archive overlap evidence")
    for (const overlap of scan.summary.page_overlaps) {
      const previousPage = scan.summary.pages?.find((p) => p.page === overlap.previous_page)
      const page = scan.summary.pages?.find((p) => p.page === overlap.page)
      const previous = scan.parses.find((p) => p.parse_id === overlap.previous_parse_id)
      const current = scan.parses.find((p) => p.parse_id === overlap.parse_id)
      const before = (previous?.links || []).filter((l) => l.profile_id === overlap.rule_id)
      const after = (current?.links || []).filter((l) => l.profile_id === overlap.rule_id)
      const count = overlap.urls?.length
      if (
        !Number.isSafeInteger(count) ||
        count < 1 ||
        count > 10 ||
        count >= after.length ||
        overlap.page !== overlap.previous_page + 1 ||
        previousPage?.parse_id !== previous?.parse_id ||
        page?.parse_id !== current?.parse_id ||
        !previous ||
        !current ||
        before.length < count ||
        overlap.urls.some((url, index) => {
          const a = before[before.length - count + index],
            b = after[index]
          return (
            canonicalURL(url) !== canonicalURL(a.url) ||
            canonicalURL(url) !== canonicalURL(b.url) ||
            a.text !== b.text ||
            a.listed_date_text !== b.listed_date_text ||
            a.published_at !== b.published_at
          )
        })
      )
        throw Error("Archive overlap lacks identical adjacent native rows")
      for (const url of overlap.urls)
        provedOverlaps.add(JSON.stringify([overlap.parse_id, canonicalURL(url)]))
    }
  }
  if (scan.summary.date_resolutions !== undefined) {
    if (!Array.isArray(scan.summary.date_resolutions) || scan.summary.date_resolutions.length > 500)
      throw Error("Invalid archive date resolution evidence")
    const seen = new Set(),
      sourceDates = new Map()
    for (const evidence of scan.summary.date_resolutions) {
      const source = scan.documents.find((d) => d.source_version_id === evidence.source_version_id)
      const article = scan.parses.find((p) => p.parse_id === evidence.parse_id)
      const listing = scan.parses.find((p) => p.parse_id === evidence.listing_parse_id)
      const printed = evidence.listed_date_text?.match(/^(\d{2}-\d{2}) ([01]\d|2[0-3]):[0-5]\d$/)
      const day = parseResearchDate(article?.dates?.published_at)?.day
      const resolutionKey = JSON.stringify([evidence.listing_parse_id, canonicalURL(evidence.url)])
      const prior = sourceDates.get(canonicalURL(evidence.url))
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
        seen.has(resolutionKey) ||
        (prior &&
          (!provedOverlaps.has(resolutionKey) ||
            prior.day !== day ||
            prior.parse_id !== evidence.parse_id ||
            prior.source_version_id !== evidence.source_version_id)) ||
        canonicalURL(source.original_url) !== canonicalURL(evidence.url) ||
        article.source_version_id !== source.source_version_id ||
        listing.source_version_id !== evidence.listing_source_version_id ||
        (evidence.access_scope === "metadata-only"
          ? !hasBlockedPublicationMetadata(article)
          : article.status !== "extracted" || !article.quality?.required_fields_present) ||
        (evidence.access_scope !== undefined && evidence.access_scope !== "metadata-only") ||
        day !== evidence.published_at ||
        day.slice(5) !== printed[1]
      )
        throw Error("Archive omitted year lacks exact article and listing evidence")
      seen.add(resolutionKey)
      sourceDates.set(canonicalURL(evidence.url), {
        day,
        parse_id: evidence.parse_id,
        source_version_id: evidence.source_version_id,
      })
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
    if (
      parsed.status !== "extracted" ||
      !parsed.quality?.required_fields_present ||
      !parsed.blocks?.length
    )
      throw Error("Candidate requires a complete readable article")
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
  if (scan.summary.pagination === "path-pages") {
    const pages = scan.summary.pages
    const ruleId = scan.summary.assessment.rule_id
    if (!Array.isArray(pages) || !pages.length || pages.length > 100 || !ruleId)
      throw Error("Partial archive lacks exact page evidence")
    for (const page of pages) {
      const parsedPage = scan.parses.find((p) => p.parse_id === page.parse_id)
      const document = scan.indexDocuments.find(
        (d) =>
          d.source_version_id === parsedPage?.source_version_id &&
          canonicalURL(d.original_url) === canonicalURL(page.url),
      )
      if (
        !document ||
        document.policy_status !== "checked" ||
        parsedPage.status !== "extracted" ||
        !parsedPage.quality?.required_fields_present
      )
        throw Error("Partial archive page lacks original policy-checked evidence")
    }
    const last = pages.at(-1)
    const parsedPage = scan.parses.find((p) => p.parse_id === last.parse_id)
    const ordinary = (parsedPage.links || []).filter((l) => l.profile_id === ruleId)
    const profile = parsedPage.link_profiles?.find((p) => p.id === ruleId)
    const datedBoundary =
      last.status === "window_boundary_reached" &&
      profile?.status === "matched" &&
      !profile.truncated &&
      profile.selected_items === ordinary.length &&
      profile.matched_links === ordinary.length &&
      ordinary.some((link) => {
        const day =
          parseResearchDate(link.published_at)?.day ||
          scan.summary.date_resolutions?.find(
            (r) =>
              r.listing_parse_id === last.parse_id &&
              r.profile_id === ruleId &&
              canonicalURL(r.url) === canonicalURL(link.url),
          )?.published_at
        return day && day < expected.since
      })
    const empty = scan.summary.terminal_empty_page
    const emptyBoundary =
      last.status === "terminal_empty_page" &&
      empty?.parse_id === last.parse_id &&
      profile?.status === "no-match" &&
      !profile.truncated &&
      !ordinary.length &&
      profile.selected_items === 0 &&
      profile.matched_links === 0 &&
      parsedPage.title_profile_status === "matched" &&
      empty.evidence?.matched_text &&
      (parsedPage.blocks || []).some((b) => b.text?.includes(empty.evidence.matched_text))
    if (!datedBoundary && !emptyBoundary)
      throw Error("Partial archive lacks a native dated or explicit empty boundary")
  }
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
      scan.summary.pagination === "path-pages" &&
      !(candidate.discovery || []).some((record) => {
        const parent = scan.parses.find(
          (p) => p.parse_id === record.parse_id && p.source_version_id === record.source_version_id,
        )
        return (
          scan.indexDocuments.some((d) => d.source_version_id === parent?.source_version_id) &&
          parent?.links?.some(
            (link) =>
              link.profile_id === record.profile_id &&
              link.dom_path === record.dom_path &&
              Boolean(link.dom_path) &&
              canonicalURL(link.url) === canonicalURL(document.original_url),
          )
        )
      })
    )
      throw Error("Partial archive candidate lacks its exact listing locator")
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
