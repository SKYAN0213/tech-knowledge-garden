import { canonicalURL } from "../garden.mjs"
import { collectWindowDetails, validDay } from "./list-scan.mjs"
import { parseDocument } from "./parser.mjs"
import { assertURL } from "./fetch.mjs"
import { fetchWithPolicy } from "./source-policy.mjs"

function monthKeys(since, until) {
  if (!validDay(since) || !validDay(until) || since >= until)
    throw Error("Calendar archive scan requires an increasing [since, until) day window")
  const result = []
  let year = Number(since.slice(0, 4))
  let month = Number(since.slice(5, 7))
  const last = new Date(until + "T00:00:00Z")
  last.setUTCDate(last.getUTCDate() - 1)
  const lastKey = last.toISOString().slice(0, 7)
  while (`${year}-${String(month).padStart(2, "0")}` <= lastKey) {
    result.push({ year, month, key: `${year}-${String(month).padStart(2, "0")}` })
    if (month === 12) {
      year++
      month = 1
    } else month++
    if (result.length > 3) throw Error("Calendar archive scan window spans too many months")
  }
  return result
}

function archiveURL(channel, { year, month }) {
  const template = channel.listing_profile?.url_template
  if (
    channel.method !== "html-list" ||
    channel.listing_profile?.pagination !== "calendar-month" ||
    !channel.listing_profile?.rule_id ||
    !channel.item_pattern ||
    typeof template !== "string" ||
    !template.includes("{year}") ||
    !template.includes("{month}")
  )
    throw Error("Route needs an explicit calendar-month archive profile")
  const url = template.replaceAll("{year}", String(year)).replaceAll("{month}", String(month))
  if (/[{}]/.test(url)) throw Error("Archive URL template has an unknown placeholder")
  assertURL(url, channel.allowed_hosts)
  return url
}

export function assessCalendarMonthIndex(parse, channel, archiveUrl, month) {
  const profileId = channel.listing_profile?.rule_id
  const profile = parse.link_profiles?.find((entry) => entry.id === profileId)
  const links = (parse.links || []).filter((entry) => entry.profile_id === profileId)
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(
    new Date(`${month.key}-01T00:00:00Z`),
  )
  const marker = (parse.links || []).find(
    (entry) =>
      canonicalURL(entry.url) === canonicalURL(archiveUrl) &&
      entry.text?.includes(monthName) &&
      entry.text?.includes(String(month.year)),
  )
  const result = {
    status: "incomplete",
    reason: null,
    month: month.key,
    profile_id: profileId,
    selected_items: profile?.selected_items || 0,
    matched_links: profile?.matched_links || 0,
    links: [],
  }
  if (
    parse.status !== "extracted" ||
    !parse.quality?.required_fields_present ||
    !parse.title?.includes(monthName) ||
    !parse.title?.includes(String(month.year)) ||
    !marker
  )
    return { ...result, reason: "archive_month_marker_missing" }
  if (
    !profile ||
    profile.truncated ||
    !["matched", "no-match"].includes(profile.status) ||
    profile.selected_items !== profile.matched_links ||
    profile.matched_links !== links.length ||
    profile.selected_items > (channel.listing_profile.max_items_per_month || 500)
  )
    return { ...result, reason: "archive_listing_profile_incomplete" }
  const pattern = new RegExp(channel.item_pattern)
  const urls = new Set()
  for (const link of links) {
    let url
    try {
      url = canonicalURL(link.url)
      assertURL(url, channel.allowed_hosts)
    } catch {
      return { ...result, reason: "archive_article_url_outside_policy" }
    }
    const dateInUrl = new URL(url).pathname.match(/\/([0-9]{4}-[0-9]{2}-[0-9]{2})-/)?.[1]
    if (
      !pattern.test(url) ||
      urls.has(url) ||
      !link.text?.trim() ||
      !validDay(link.published_at) ||
      !link.listed_date_text ||
      !link.published_at.startsWith(month.key + "-") ||
      dateInUrl !== link.published_at
    )
      return { ...result, reason: "archive_article_identity_or_date_invalid" }
    urls.add(url)
  }
  for (const link of parse.links || []) {
    if (link.profile_id || !pattern.test(link.url || "")) continue
    if (!urls.has(canonicalURL(link.url)))
      return { ...result, reason: "archive_unprofiled_article_link" }
  }
  if (links.some((link, index) => index && link.published_at > links[index - 1].published_at))
    return { ...result, reason: "archive_not_newest_first" }
  if (
    (parse.links || []).some((link) =>
      new RegExp(`/${month.year}/${month.month}/(?:page|[0-9]+)/[0-9]+`, "i").test(link.url || ""),
    )
  )
    return { ...result, reason: "archive_has_unhandled_pagination" }
  return { ...result, status: "month_scanned", links }
}

export async function scanCalendarMonthRoute(
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
  const months = monthKeys(since, until)
  const documents = [],
    indexDocuments = [],
    parses = [],
    candidates = [],
    details = [],
    pages = [],
    selected = []
  const summary = {
    schema: "research-list-scan/v1",
    channel_id: channel.channel_id,
    listing_url: channel.url,
    listing_source_version_id: null,
    window: { since, until_exclusive: until },
    pagination: "calendar-month",
    status: "incomplete",
    reason: null,
    pages,
    details,
    candidate_published: false,
  }
  for (const month of months) {
    const url = archiveURL(channel, month)
    const page = { month: month.key, url, status: "incomplete" }
    pages.push(page)
    const document = await run.stage(`listing-fetch-${month.key}`, { channel, url }, () =>
      fetchPolicy(root, fetcher, url, { allowed_hosts: channel.allowed_hosts }),
    )
    page.fetch_status = document.fetch_status
    if (!["captured", "not_modified"].includes(document.fetch_status)) {
      summary.reason = "archive_" + document.fetch_status
      return { summary, indexDocuments, documents, parses, candidates }
    }
    indexDocuments.push(document)
    documents.push(document)
    const parsed = await run.stage(
      `listing-parse-${month.key}`,
      { document, options: channel.parse_options },
      () => parse(root, document, { language: channel.language, ...(channel.parse_options || {}) }),
    )
    parses.push(parsed)
    page.parse_id = parsed.parse_id
    const assessment = assessCalendarMonthIndex(parsed, channel, url, month)
    page.status = assessment.status
    page.reason = assessment.reason
    page.selected_items = assessment.selected_items
    if (assessment.status !== "month_scanned") {
      summary.reason = assessment.reason
      return { summary, indexDocuments, documents, parses, candidates }
    }
    selected.push(
      ...assessment.links
        .filter((link) => link.published_at >= since && link.published_at < until)
        .map((link) => ({
          ...link,
          listing_source_version_id: document.source_version_id,
          listing_parse_id: parsed.parse_id,
          discovered_at: document.observed_at,
        })),
    )
  }
  if (selected.length > (channel.scan_max_details || 25)) {
    summary.reason = "detail_budget_exceeded"
    return { summary, indexDocuments, documents, parses, candidates }
  }
  if (new Set(selected.map((link) => canonicalURL(link.url))).size !== selected.length) {
    summary.reason = "archive_duplicate_across_months"
    return { summary, indexDocuments, documents, parses, candidates }
  }
  const inspected = await collectDetails(root, run, fetcher, channel, articleProfiles, selected, {
    fetchPolicy,
    parse,
  })
  documents.push(...inspected.documents)
  parses.push(...inspected.parses)
  candidates.push(...inspected.candidates)
  details.push(...inspected.details)
  summary.status =
    details.length === selected.length &&
    details.every((detail) => detail.status === "source_parsed_unreviewed")
      ? "window_scanned"
      : "incomplete"
  summary.reason = summary.status === "window_scanned" ? null : "detail_incomplete"
  summary.candidate_count = candidates.length
  return { summary, indexDocuments, documents, parses, candidates }
}
