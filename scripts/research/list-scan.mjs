import { canonicalURL } from "../garden.mjs"
import { sourceId } from "./contracts.mjs"
import { candidatesFromLinks } from "./discovery.mjs"
import { assertURL } from "./fetch.mjs"
import { articleContentFingerprint, parseDocument } from "./parser.mjs"
import { fetchWithPolicy } from "./source-policy.mjs"

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
  const documents = [],
    parses = [],
    candidates = [],
    details = []
  for (const link of links) {
    const id = sourceId(link.url)
    const detail = { url: link.url, listed_at: link.published_at, status: "incomplete" }
    details.push(detail)
    try {
      const document = await run.stage("detail-" + id, { url: link.url }, () =>
        fetchPolicy(root, fetcher, link.url, { allowed_hosts: channel.allowed_hosts }),
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
      const parsed = await run.stage("parse-" + id, { document, options }, () =>
        parse(root, document, options),
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
      if (
        (channel.method === "rss" || channel.listing_profile?.require_title_match) &&
        comparableTitle(parsed.title) !== comparableTitle(link.text)
      ) {
        detail.status = "title_conflict"
        continue
      }
      if (parsed.dates?.published_at !== link.published_at) {
        detail.status = "date_conflict"
        continue
      }
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
        article_source_version_id: document.source_version_id,
        article_parse_id: parsed.parse_id,
        article_observed_at: document.observed_at,
        article_content_sha256: articleContentFingerprint(parsed),
      })
      detail.status = "source_parsed_unreviewed"
    } catch (error) {
      detail.status = "failed"
      detail.error = error.message
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
  { fetchPolicy = fetchWithPolicy, parse = parseDocument } = {},
) {
  if (!validDay(since) || !validDay(until) || since >= until)
    throw Error("List scan requires an increasing [since, until) day window")
  const documents = [],
    parses = [],
    candidates = [],
    details = []
  const listing = await run.stage("listing-fetch", { channel }, () =>
    fetchPolicy(root, fetcher, channel.url, { allowed_hosts: channel.allowed_hosts }),
  )
  const summary = {
    schema: "research-list-scan/v1",
    channel_id: channel.channel_id,
    listing_url: channel.url,
    listing_source_version_id: listing.source_version_id || null,
    observed_at: listing.observed_at,
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
    listParse = await run.stage("listing-parse", { listing, options: channel.parse_options }, () =>
      parse(root, listing, { language: channel.language, ...(channel.parse_options || {}) }),
    )
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
