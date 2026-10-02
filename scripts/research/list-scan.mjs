import fs from "node:fs"
import { canonicalURL } from "../garden.mjs"
import { sha256, sourceId } from "./contracts.mjs"
import { candidatesFromLinks } from "./discovery.mjs"
import { assertURL } from "./fetch.mjs"
import { articleContentFingerprint, assertStoredEvidence, parseDocument } from "./parser.mjs"
import { parseResearchDate } from "./dates.mjs"
import { readJSON, safePath } from "./run-state.mjs"
import { fetchWithPolicy } from "./source-policy.mjs"

const singlePageConfigHash = (channel) => sha256(JSON.stringify(channel))
const routeFetchOptions = (channel) => ({
  allowed_hosts: channel.allowed_hosts,
  request_interval_ms: channel.request_interval_ms,
})

export function loadReusableSinglePageListing(
  root,
  runId,
  channel,
  window,
  { now = Date.now(), maxAgeMs = 15 * 60 * 1000 } = {},
) {
  const prefix = `runs/${runId}/`
  const summary = readJSON(root, prefix + "list-scan.json")
  const documents = readJSON(root, prefix + "documents.json")
  const parses = readJSON(root, prefix + "parses.json")
  if (
    summary?.status !== "window_scanned" ||
    summary.channel_id !== channel.channel_id ||
    summary.pagination !== "single-page" ||
    summary.window?.until_exclusive !== window.since ||
    summary.channel_config_sha256 !== singlePageConfigHash(channel) ||
    !Array.isArray(documents) ||
    !Array.isArray(parses)
  )
    throw Error("Reusable listing must come from the adjacent completed single-page window")
  const observedAt = Date.parse(summary.observed_at || "")
  if (!Number.isFinite(observedAt) || observedAt > now || now - observedAt > maxAgeMs)
    throw Error("Reusable listing observation is outside the freshness window")
  const document = documents.find(
    (item) =>
      item.original_url === channel.url &&
      item.source_version_id === summary.listing_source_version_id,
  )
  const parsed = parses.find(
    (item) =>
      item.source_version_id === document?.source_version_id &&
      item.parse_id === summary.listing_parse_id,
  )
  if (!document || !parsed) throw Error("Reusable listing source and parse evidence are missing")
  assertStoredEvidence(root, [document], [parsed])
  return { document, parse: parsed, source_run: runId }
}

export function validDay(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + "T00:00:00Z")) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value
  )
}

function comparableTitle(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/[\u200b-\u200d\ufeff]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
}

function detailTitleConfirmsTruncatedListingPrefix(detailTitle, listedTitle) {
  const listed = comparableTitle(listedTitle)
  const suffix = /(?:…|\.\.\.)$/u.exec(listed)
  if (!suffix) return false
  const prefix = listed.slice(0, -suffix[0].length).trim()
  return prefix.length >= 24 && comparableTitle(detailTitle).startsWith(prefix)
}

export function assessSinglePageIndex(parse, channel, since, until) {
  if (!validDay(since) || !validDay(until) || since >= until)
    throw Error("List scan requires an increasing [since, until) day window")
  const profileId = channel.listing_profile?.rule_id
  if (
    channel.method !== "html-list" ||
    channel.listing_profile?.pagination !== "single-page" ||
    !profileId ||
    !channel.item_pattern
  )
    throw Error("Route needs an explicit single-page dated listing profile")
  const profile = parse.link_profiles?.find((item) => item.id === profileId)
  const links = (parse.links || []).filter((link) => link.profile_id === profileId)
  const ignoredRuleIds = channel.listing_profile?.ignored_rule_ids || []
  const result = {
    status: "incomplete",
    reason: null,
    profile_id: profileId,
    selected_items: profile?.selected_items || 0,
    matched_links: profile?.matched_links || 0,
    window_items: 0,
    older_items: 0,
    later_items: 0,
    links: [],
  }
  if (parse.status !== "extracted" || !parse.quality?.required_fields_present)
    return { ...result, reason: "listing_parse_incomplete" }
  if (
    !profile ||
    profile.status !== "matched" ||
    profile.truncated ||
    !profile.selected_items ||
    profile.selected_items !== profile.matched_links ||
    profile.matched_links !== links.length
  )
    return { ...result, reason: "listing_profile_incomplete" }
  if (
    channel.listing_profile.title_match_policy !== undefined &&
    channel.listing_profile.title_match_policy !== "exact" &&
    channel.listing_profile.title_match_policy !== "truncated_prefix"
  )
    return { ...result, reason: "listing_title_match_policy_invalid" }
  if (
    !Array.isArray(ignoredRuleIds) ||
    new Set(ignoredRuleIds).size !== ignoredRuleIds.length ||
    ignoredRuleIds.includes(profileId)
  )
    return { ...result, reason: "listing_ignored_profile_invalid" }
  const ignoredLinks = []
  for (const id of ignoredRuleIds) {
    const ignoredProfile = parse.link_profiles?.find((item) => item.id === id)
    const profiled = (parse.links || []).filter((link) => link.profile_id === id)
    if (
      !ignoredProfile ||
      !["matched", "no-match"].includes(ignoredProfile.status) ||
      ignoredProfile.truncated ||
      ignoredProfile.selected_items !== ignoredProfile.matched_links ||
      ignoredProfile.matched_links !== profiled.length ||
      (ignoredProfile.status === "no-match" && profiled.length)
    )
      return { ...result, reason: "listing_ignored_profile_incomplete" }
    ignoredLinks.push(...profiled)
  }
  if (channel.listing_profile.require_complete_count) {
    const count = parse.listing_page_summary
    if (
      count?.status !== "matched" ||
      count.page !== 1 ||
      count.pages !== 1 ||
      count.total !== links.length
    )
      return { ...result, reason: "listing_count_or_pages_incomplete" }
    result.listing_total = count.total
    result.listing_page = count.page
    result.listing_pages = count.pages
  }
  const pattern = new RegExp(channel.item_pattern)
  const urls = new Set()
  for (const link of [...links, ...ignoredLinks]) {
    let url
    try {
      url = canonicalURL(link.url)
      assertURL(url, channel.allowed_hosts)
    } catch {
      return { ...result, reason: "listing_url_outside_policy" }
    }
    if (
      !pattern.test(url) ||
      urls.has(url) ||
      !link.text?.trim() ||
      !validDay(link.published_at) ||
      !link.listed_date_text
    )
      return { ...result, reason: "listing_item_missing_identity_or_date" }
    urls.add(url)
  }
  for (const link of parse.links || []) {
    if (link.profile_id || !pattern.test(link.url || "")) continue
    if (!urls.has(canonicalURL(link.url))) return { ...result, reason: "unprofiled_article_link" }
  }
  if (links.some((link, index) => index && link.published_at > links[index - 1].published_at))
    return { ...result, reason: "listing_not_newest_first" }
  const older = links.filter((link) => link.published_at < since)
  const later = links.filter((link) => link.published_at >= until)
  const selected = links.filter((link) => link.published_at >= since && link.published_at < until)
  if (!older.length)
    return {
      ...result,
      window_items: selected.length,
      later_items: later.length,
      reason: "cutoff_not_reached",
    }
  if (selected.length > (channel.scan_max_details || 25))
    return {
      ...result,
      window_items: selected.length,
      older_items: older.length,
      later_items: later.length,
      reason: "detail_budget_exceeded",
    }
  return {
    ...result,
    status: "window_covered",
    reason: null,
    window_items: selected.length,
    older_items: older.length,
    later_items: later.length,
    links: selected,
  }
}

export async function collectWindowDetails(
  root,
  run,
  fetcher,
  channel,
  articleProfiles,
  links,
  { fetchPolicy = fetchWithPolicy, parse = parseDocument } = {},
) {
  const rssTitlePolicy = channel.listing_profile?.rss_title_policy || "must_match"
  if (!new Set(["must_match", "source_title_authoritative"]).has(rssTitlePolicy))
    throw Error("Invalid RSS title policy")
  const documents = [],
    parses = [],
    candidates = [],
    details = []
  for (const link of links) {
    const id = sourceId(link.url)
    const detail = { url: link.url, listed_at: link.published_at, status: "incomplete" }
    details.push(detail)
    let supportingSources = []
    try {
      const document = await run.stage("detail-" + id, { url: link.url }, () =>
        fetchPolicy(root, fetcher, link.url, routeFetchOptions(channel)),
      )
      detail.fetch_status = document.fetch_status
      if (!["captured", "not_modified"].includes(document.fetch_status)) {
        detail.status = "fetch_failed"
        continue
      }
      documents.push(document)
      detail.source_version_id = document.source_version_id
      const profiles = articleProfiles.filter((profile) =>
        new RegExp(profile.url_pattern).test(document.final_url),
      )
      if (profiles.length !== 1) {
        detail.status = "article_profile_missing_or_ambiguous"
        continue
      }
      const options = profiles[0].options
      const parseOptions =
        options.publication_date_from_listing === true
          ? {
              ...options,
              listing_published_at: link.published_at,
              listing_date_text: link.listed_date_text,
              listing_source_url: channel.url,
              listing_source_version_id: link.listing_source_version_id,
            }
          : options
      const parsed = await run.stage("parse-" + id, { document, options: parseOptions }, () =>
        parse(root, document, parseOptions),
      )
      parses.push(parsed)
      detail.parse_id = parsed.parse_id
      detail.article_profile_id = profiles[0].id
      detail.source_published_at = parsed.dates?.published_at || null
      if (
        parsed.status !== "extracted" ||
        !parsed.quality?.required_fields_present ||
        !parsed.blocks?.length
      ) {
        detail.status = "article_parse_incomplete"
        continue
      }
      const exactTitleMatch = comparableTitle(parsed.title) === comparableTitle(link.text)
      const truncatedTitleMatch =
        !exactTitleMatch &&
        channel.listing_profile?.title_match_policy === "truncated_prefix" &&
        detailTitleConfirmsTruncatedListingPrefix(parsed.title, link.text)
      const titleMatches = exactTitleMatch || truncatedTitleMatch
      if (
        (channel.method === "rss" || channel.listing_profile?.require_title_match) &&
        !titleMatches &&
        rssTitlePolicy !== "source_title_authoritative"
      ) {
        detail.status = "title_conflict"
        continue
      }
      if (!titleMatches) {
        detail.listed_title = link.text
        detail.source_title = parsed.title
        detail.title_relation = "rss_variant_source_title_authoritative"
      } else if (truncatedTitleMatch) {
        detail.listed_title = link.text
        detail.source_title = parsed.title
        detail.title_relation = "official_listing_truncated_detail_title_authoritative"
      }
      const articleDate = parseResearchDate(parsed.dates?.published_at)
      const listingDate = parseResearchDate(link.published_at)
      if (!articleDate || !listingDate || articleDate.day !== listingDate.day) {
        detail.status = "date_conflict"
        continue
      }
      supportingSources = []
      const supportRules = profiles[0].supporting_documents || []
      if (
        !Array.isArray(supportRules) ||
        supportRules.length > 7 ||
        new Set(supportRules.map((rule) => rule?.id)).size !== supportRules.length
      ) {
        detail.status = "supporting_document_policy_invalid"
        continue
      }
      let supportingDocumentFailed = false
      for (const rule of supportRules) {
        if (
          !rule ||
          typeof rule.id !== "string" ||
          !/^[a-zA-Z0-9_-]+$/.test(rule.id) ||
          typeof rule.url_pattern !== "string" ||
          !rule.url_pattern.length ||
          rule.url_pattern.length > 512 ||
          !rule.url_pattern.startsWith("^") ||
          !rule.url_pattern.endsWith("$")
        ) {
          detail.status = "supporting_document_policy_invalid"
          supportingDocumentFailed = true
          break
        }
        let pattern
        try {
          pattern = new RegExp(rule.url_pattern)
        } catch {
          detail.status = "supporting_document_policy_invalid"
          supportingDocumentFailed = true
          break
        }
        const matches = (parsed.attachments || [])
          .filter((attachment) => pattern.test(attachment.url || ""))
          .map((attachment) => canonicalURL(attachment.url))
        if (matches.length !== 1 || supportingSources.some((source) => source.url === matches[0])) {
          detail.status = "supporting_document_missing_or_ambiguous"
          supportingDocumentFailed = true
          break
        }
        const url = matches[0]
        const fallbackSources = rule.fallback_sources || []
        if (
          !Array.isArray(fallbackSources) ||
          fallbackSources.length > 3 ||
          fallbackSources.some(
            (source) =>
              !source ||
              typeof source.url !== "string" ||
              typeof source.evidence_url !== "string" ||
              typeof source.evidence_match !== "string" ||
              !source.url.trim() ||
              !source.evidence_url.trim() ||
              !source.evidence_match.trim() ||
              source.evidence_match.length > 256,
          ) ||
          new Set(fallbackSources.map((source) => source.url)).size !== fallbackSources.length ||
          fallbackSources.some((source) => source.url === url)
        ) {
          detail.status = "supporting_document_policy_invalid"
          supportingDocumentFailed = true
          break
        }
        for (const source of fallbackSources) {
          try {
            assertURL(source.url, channel.allowed_hosts)
            assertURL(source.evidence_url, channel.allowed_hosts)
          } catch {
            detail.status = "supporting_document_outside_source_policy"
            supportingDocumentFailed = true
            break
          }
        }
        if (supportingDocumentFailed) break
        try {
          assertURL(url, channel.allowed_hosts)
        } catch {
          detail.status = "supporting_document_outside_source_policy"
          supportingDocumentFailed = true
          break
        }
        const attempts = []
        let acceptedSupport = null
        let supportingFailure = "supporting_document_fetch_failed"
        for (const source of [
          { url, attachment_url: url },
          ...fallbackSources.map((fallback) => ({ ...fallback, attachment_url: url })),
        ]) {
          const attempt = {
            url: source.url,
          }
          if (source.evidence_url) {
            const evidenceId = sourceId(source.evidence_url)
            const evidence = await run.stage(
              "supporting-evidence-" + evidenceId,
              { url: source.evidence_url },
              () =>
                fetchPolicy(root, fetcher, source.evidence_url, {
                  allowed_hosts: channel.allowed_hosts,
                  request_interval_ms: channel.request_interval_ms,
                }),
            )
            attempt.evidence_url = source.evidence_url
            attempt.evidence_status = evidence.fetch_status
            if (!["captured", "not_modified"].includes(evidence.fetch_status)) {
              attempt.status = "evidence_fetch_failed"
              attempts.push(attempt)
              continue
            }
            const evidenceBody = fs.readFileSync(safePath(root, evidence.body_path))
            if (sha256(evidenceBody) !== evidence.body_sha256)
              throw Error("Supporting document evidence hash mismatch")
            if (!evidenceBody.toString("utf8").includes(source.evidence_match)) {
              attempt.status = "evidence_mismatch"
              attempts.push(attempt)
              continue
            }
            attempt.evidence_source_version_id = evidence.source_version_id
            attempt.evidence_body_sha256 = evidence.body_sha256
            if (
              !documents.some(
                (document) => document.source_version_id === evidence.source_version_id,
              )
            )
              documents.push(evidence)
          }

          const attachmentId = sourceId(source.url)
          const attachment = await run.stage(
            "supporting-document-" + attachmentId,
            { url: source.url },
            () =>
              fetchPolicy(root, fetcher, source.url, routeFetchOptions(channel)),
          )
          attempt.status = attachment.fetch_status
          attempts.push(attempt)
          if (!["captured", "not_modified"].includes(attachment.fetch_status)) continue

          const attachmentProfiles = articleProfiles.filter((profile) =>
            new RegExp(profile.url_pattern).test(attachment.final_url),
          )
          if (attachmentProfiles.length !== 1) {
            attempt.status = "profile_missing_or_ambiguous"
            supportingFailure = "supporting_document_profile_missing_or_ambiguous"
            continue
          }
          documents.push(attachment)
          const attachmentParse = await run.stage(
            "parse-supporting-document-" + attachmentId,
            { document: attachment, options: attachmentProfiles[0].options },
            () => parse(root, attachment, attachmentProfiles[0].options),
          )
          parses.push(attachmentParse)
          if (
            attachmentParse.status !== "extracted" ||
            !attachmentParse.quality?.required_fields_present ||
            !attachmentParse.blocks?.length
          ) {
            attempt.status = "parse_incomplete"
            supportingFailure = "supporting_document_parse_incomplete"
            continue
          }
          acceptedSupport = {
            id: rule.id,
            attachment_url: url,
            url: source.url,
            status: attachment.fetch_status,
            ...(source.evidence_url ? { evidence_url: source.evidence_url } : {}),
            ...(attempt.evidence_source_version_id
              ? { evidence_source_version_id: attempt.evidence_source_version_id }
              : {}),
            ...(attempt.evidence_body_sha256
              ? { evidence_body_sha256: attempt.evidence_body_sha256 }
              : {}),
            attempts,
            source_version_id: attachment.source_version_id,
            parse_id: attachmentParse.parse_id,
            article_profile_id: attachmentProfiles[0].id,
          }
          break
        }
        if (!acceptedSupport) {
          detail.status = supportingFailure
          detail.supporting_documents = [
            ...supportingSources,
            {
              id: rule.id,
              attachment_url: url,
              status: supportingFailure,
              attempts,
            },
          ]
          supportingDocumentFailed = true
          break
        }
        supportingSources.push(acceptedSupport)
      }
      if (supportingDocumentFailed) {
        detail.supporting_documents ||= supportingSources
        continue
      }
      detail.supporting_documents = supportingSources
      const found = candidatesFromLinks(
        [link],
        {
          ...channel,
          method: link.discovery_method || channel.method,
          source_version_id: link.listing_source_version_id,
          parse_id: link.listing_parse_id,
        },
        link.discovered_at,
      )
      if (found.length !== 1) {
        detail.status = "candidate_rejected"
        continue
      }
      candidates.push({
        ...found[0],
        ...(exactTitleMatch ? {} : { title: parsed.title }),
        article_source_version_id: document.source_version_id,
        article_parse_id: parsed.parse_id,
        article_observed_at: document.observed_at,
        article_content_sha256: articleContentFingerprint(parsed),
        ...(supportingSources.length
          ? { supporting_source_urls: supportingSources.map((source) => source.url) }
          : {}),
      })
      detail.status = "source_parsed_unreviewed"
    } catch (error) {
      detail.status = "failed"
      detail.error = error.message
      if (supportingSources.length) detail.supporting_documents = supportingSources
    }
  }
  return { documents, parses, candidates, details }
}

export async function scanSinglePageRoute(
  root,
  run,
  fetcher,
  channel,
  articleProfiles,
  { since, until },
  {
    fetchPolicy = fetchWithPolicy,
    parse = parseDocument,
    listingEvidence = null,
    listingReuseError = null,
  } = {},
) {
  if (!validDay(since) || !validDay(until) || since >= until)
    throw Error("List scan requires an increasing [since, until) day window")
  const documents = [],
    parses = [],
    candidates = [],
    details = []
  const listing =
    listingEvidence?.document ||
    (await run.stage("listing-fetch", { channel }, () =>
      fetchPolicy(root, fetcher, channel.url, routeFetchOptions(channel)),
    ))
  const summary = {
    schema: "research-list-scan/v1",
    channel_id: channel.channel_id,
    listing_url: channel.url,
    listing_source_version_id: listing.source_version_id || null,
    observed_at: listing.observed_at,
    channel_config_sha256: singlePageConfigHash(channel),
    ...(listingEvidence?.source_run ? { listing_reused_from_run: listingEvidence.source_run } : {}),
    ...(listingReuseError ? { listing_reuse_skipped: listingReuseError } : {}),
    window: { since, until_exclusive: until },
    pagination: channel.listing_profile?.pagination || null,
    status: "incomplete",
    reason: null,
    assessment: null,
    details,
    candidate_published: false,
  }
  if (!["captured", "not_modified"].includes(listing.fetch_status))
    return {
      summary: { ...summary, reason: "listing_" + listing.fetch_status },
      documents,
      parses,
      candidates,
    }
  documents.push(listing)
  let listParse
  try {
    listParse =
      listingEvidence?.parse ||
      (await run.stage("listing-parse", { listing, options: channel.parse_options }, () =>
        parse(root, listing, { language: channel.language, ...(channel.parse_options || {}) }),
      ))
  } catch (error) {
    return {
      summary: { ...summary, reason: "listing_parse_failed", error: error.message },
      documents,
      parses,
      candidates,
    }
  }
  parses.push(listParse)
  summary.listing_parse_id = listParse.parse_id
  const assessment = assessSinglePageIndex(listParse, channel, since, until)
  summary.assessment = { ...assessment, links: undefined }
  if (assessment.status !== "window_covered")
    return { summary: { ...summary, reason: assessment.reason }, documents, parses, candidates }

  const inspected = await collectWindowDetails(
    root,
    run,
    fetcher,
    channel,
    articleProfiles,
    assessment.links.map((link) => ({
      ...link,
      listing_source_version_id: listing.source_version_id,
      listing_parse_id: listParse.parse_id,
      discovered_at: listing.observed_at,
    })),
    { fetchPolicy, parse },
  )
  documents.push(...inspected.documents)
  parses.push(...inspected.parses)
  candidates.push(...inspected.candidates)
  details.push(...inspected.details)
  summary.status =
    details.every((detail) => detail.status === "source_parsed_unreviewed") &&
    details.length === assessment.window_items
      ? "window_scanned"
      : "incomplete"
  summary.reason = summary.status === "window_scanned" ? null : "detail_incomplete"
  summary.candidate_count = candidates.length
  return { summary, documents, parses, candidates }
}

function pathPageURL(channel, page) {
  const profile = channel.listing_profile
  const template = profile?.url_template
  if (
    channel.method !== "html-list" ||
    profile?.pagination !== "path-pages" ||
    typeof template !== "string" ||
    (template.match(/\{page\}/g) || []).length !== 1 ||
    !Number.isInteger(profile.max_pages) ||
    profile.max_pages < 1 ||
    profile.max_pages > 100 ||
    !profile.rule_id ||
    !channel.item_pattern
  )
    throw Error("Route needs an explicit bounded path-pages listing profile")
  const url = template.replace("{page}", String(page))
  if (/[{}]/.test(url)) throw Error("Archive URL template has an unknown placeholder")
  assertURL(url, channel.allowed_hosts)
  return url
}

export function assessPathPage(parse, channel) {
  const profileId = channel.listing_profile?.rule_id
  const profile = parse.link_profiles?.find((entry) => entry.id === profileId)
  const links = (parse.links || []).filter((entry) => entry.profile_id === profileId)
  const result = { status: "incomplete", reason: null, links }
  if (parse.status !== "extracted" || !parse.quality?.required_fields_present)
    return { ...result, reason: "archive_listing_parse_incomplete" }
  if (
    !profile ||
    profile.status !== "matched" ||
    profile.truncated ||
    profile.selected_items < 1 ||
    profile.selected_items !== profile.matched_links ||
    profile.matched_links !== links.length
  )
    return { ...result, reason: "archive_listing_profile_incomplete" }

  const pattern = new RegExp(channel.item_pattern)
  const seen = new Set()
  for (const link of links) {
    let url
    try {
      url = canonicalURL(link.url)
      assertURL(url, channel.allowed_hosts)
    } catch {
      return { ...result, reason: "archive_article_url_outside_policy" }
    }
    if (
      !pattern.test(url) ||
      seen.has(url) ||
      !link.text?.trim() ||
      !validDay(link.published_at) ||
      !link.listed_date_text
    )
      return { ...result, reason: "archive_article_identity_or_date_invalid" }
    seen.add(url)
  }
  if (links.some((link, index) => index && link.published_at > links[index - 1].published_at))
    return { ...result, reason: "archive_not_newest_first" }
  const excluded = channel.listing_profile.excluded_categories || []
  if (
    !Array.isArray(excluded) ||
    new Set(excluded).size !== excluded.length ||
    excluded.some((category) => typeof category !== "string" || !category.trim())
  )
    return { ...result, reason: "archive_excluded_categories_invalid" }
  if (excluded.length && links.some((link) => !Array.isArray(link.categories)))
    return { ...result, reason: "archive_categories_missing" }
  return {
    status: "page_scanned",
    reason: null,
    links,
    selected_items: links.length,
    first_date: links[0]?.published_at || null,
    last_date: links.at(-1)?.published_at || null,
  }
}

export async function scanPathPagesRoute(
  root,
  run,
  fetcher,
  channel,
  articleProfiles,
  { since, until },
  {
    fetchPolicy = fetchWithPolicy,
    parse = parseDocument,
    collectDetails = collectWindowDetails,
  } = {},
) {
  if (!validDay(since) || !validDay(until) || since >= until)
    throw Error("Path-pages scan requires an increasing [since, until) day window")
  const documents = [],
    indexDocuments = [],
    parses = [],
    candidates = [],
    pages = [],
    selected = [],
    seenURLs = new Set()
  const excludedCategories = new Set(
    (channel.listing_profile.excluded_categories || []).map((value) =>
      value.normalize("NFC").trim().toLocaleUpperCase("en-US"),
    ),
  )
  const summary = {
    schema: "research-list-scan/v1",
    channel_id: channel.channel_id,
    listing_url: channel.listing_profile.url_template,
    window: { since, until_exclusive: until },
    pagination: "path-pages",
    status: "incomplete",
    reason: null,
    pages,
    details: [],
    candidate_published: false,
  }
  let previousDate = null,
    reachedBoundary = false
  for (let pageNumber = 1; pageNumber <= channel.listing_profile.max_pages; pageNumber++) {
    const url = pathPageURL(channel, pageNumber)
    const page = { page: pageNumber, url, status: "incomplete" }
    pages.push(page)
    const document = await run.stage(`listing-fetch-page-${pageNumber}`, { channel, url }, () =>
      fetchPolicy(root, fetcher, url, routeFetchOptions(channel)),
    )
    page.fetch_status = document.fetch_status
    if (!["captured", "not_modified"].includes(document.fetch_status)) {
      summary.reason = "archive_listing_" + document.fetch_status
      return { summary, indexDocuments, documents, parses, candidates }
    }
    indexDocuments.push(document)
    documents.push(document)
    const parsed = await run.stage(
      `listing-parse-page-${pageNumber}`,
      { document, options: channel.parse_options },
      () => parse(root, document, { language: channel.language, ...(channel.parse_options || {}) }),
    )
    parses.push(parsed)
    page.parse_id = parsed.parse_id
    const assessment = assessPathPage(parsed, channel)
    page.status = assessment.status
    page.reason = assessment.reason
    page.selected_items = assessment.selected_items || 0
    if (assessment.status !== "page_scanned") {
      summary.reason = assessment.reason
      return { summary, indexDocuments, documents, parses, candidates }
    }
    const links = assessment.links
    if (previousDate && links[0]?.published_at > previousDate) {
      page.reason = "archive_not_newest_first_across_pages"
      summary.reason = page.reason
      return { summary, indexDocuments, documents, parses, candidates }
    }
    for (const link of links) {
      const urlKey = canonicalURL(link.url)
      if (seenURLs.has(urlKey)) {
        page.reason = "archive_duplicate_across_pages"
        summary.reason = page.reason
        return { summary, indexDocuments, documents, parses, candidates }
      }
      seenURLs.add(urlKey)
      const excluded = (link.categories || []).some((category) =>
        excludedCategories.has(category.normalize("NFC").trim().toLocaleUpperCase("en-US")),
      )
      if (link.published_at >= since && link.published_at < until && !excluded)
        selected.push({
          ...link,
          listing_source_version_id: document.source_version_id,
          listing_parse_id: parsed.parse_id,
          discovered_at: document.observed_at,
        })
      if (link.published_at < since) reachedBoundary = true
    }
    previousDate = links.at(-1)?.published_at || previousDate
    if (reachedBoundary) {
      page.status = "window_boundary_reached"
      break
    }
  }
  if (!reachedBoundary) {
    summary.reason = "archive_cutoff_not_reached"
    return { summary, indexDocuments, documents, parses, candidates }
  }
  if (selected.length > (channel.scan_max_details || 25)) {
    summary.reason = "detail_budget_exceeded"
    return { summary, indexDocuments, documents, parses, candidates }
  }
  const inspected = await collectDetails(root, run, fetcher, channel, articleProfiles, selected, {
    fetchPolicy,
    parse,
  })
  documents.push(...inspected.documents)
  parses.push(...inspected.parses)
  candidates.push(...inspected.candidates)
  summary.details = inspected.details
  summary.candidate_count = candidates.length
  summary.status =
    inspected.details.length === selected.length &&
    inspected.details.every((detail) => detail.status === "source_parsed_unreviewed")
      ? "window_scanned"
      : "incomplete"
  summary.reason = summary.status === "window_scanned" ? null : "detail_incomplete"
  return { summary, indexDocuments, documents, parses, candidates }
}
