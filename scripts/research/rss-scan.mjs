import fs from "node:fs"
import { createRequire } from "node:module"
import RSSParser from "rss-parser"
import { canonicalURL } from "../garden.mjs"
import { sha256 } from "./contracts.mjs"
import { assertURL } from "./fetch.mjs"
import { collectWindowDetails, validDay } from "./list-scan.mjs"
import { parseDocument, storeParseArtifact } from "./parser.mjs"
import { safePath } from "./run-state.mjs"
import { fetchWithPolicy } from "./source-policy.mjs"

const require = createRequire(import.meta.url)
const parserVersion = require("rss-parser/package.json").version
const adapterSha = sha256(fs.readFileSync(new URL(import.meta.url)))

function publicationDay(timestamp, timeZone = "UTC") {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return null
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function shiftDay(day, amount) {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function businessDaysInclusive(start, end) {
  let count = 0
  for (let day = start; day <= end; day = shiftDay(day, 1)) {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
    if (weekday !== 0 && weekday !== 6) count += 1
  }
  return count
}

function publicationTimeZone(channel) {
  const timeZone = channel.listing_profile?.date_timezone ?? "UTC"
  if (typeof timeZone !== "string") throw Error("Invalid RSS publication time zone")
  try {
    new Intl.DateTimeFormat("en-US", { timeZone })
  } catch {
    throw Error("Invalid RSS publication time zone")
  }
  return timeZone
}

function localizedRSSInstant(pubDate, format, timeZone) {
  if (format !== "korean-local-ampm-v1") return null
  if (timeZone !== "Asia/Seoul") throw Error("Korean RSS dates require Asia/Seoul")
  const match = /^(\d{4}-\d{2}-\d{2})\s+(오전|오후)\s+(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(
    pubDate?.trim() || "",
  )
  if (!match || !validDay(match[1])) return null
  const [, day, meridiem, rawHour, minute, second] = match
  let hour = Number(rawHour)
  if (!Number.isInteger(hour) || hour > 23) return null
  if (hour <= 12) {
    if (hour === 12) hour = 0
    if (meridiem === "오후") hour += 12
  } else if (meridiem !== "오후") {
    return null
  }
  const localHour = String(hour).padStart(2, "0")
  const instant = new Date(`${day}T${localHour}:${minute}:${second}+09:00`)
  return Number.isFinite(instant.getTime()) ? instant.toISOString() : null
}

function calendarDayRSSDate(pubDate, format) {
  if (format !== "weekday-mdy-day-v1") return null
  const match = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/(20\d\d) - (?:[01]\d|2[0-3]):[0-5]\d$/.exec(
    pubDate?.trim() || "",
  )
  if (!match) return null
  const [, weekday, month, day, year] = match
  const published_at = `${year}-${month}-${day}`
  if (!validDay(published_at)) return null
  const weekdayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
    new Date(`${published_at}T00:00:00Z`).getUTCDay()
  ]
  return weekdayName === weekday ? published_at : null
}

function absoluteRSSURL(value, baseURL) {
  if (typeof value !== "string" || !value.trim()) return null
  try {
    return new URL(value.trim(), baseURL).toString()
  } catch {
    return value.trim()
  }
}

function feedCategories(channel, option) {
  const categories = channel.listing_profile?.[option]
  if (categories === undefined) return []
  if (
    !Array.isArray(categories) ||
    !categories.length ||
    categories.length > 20 ||
    categories.some((category) => typeof category !== "string" || !category.trim()) ||
    new Set(categories).size !== categories.length
  )
    throw Error(`Invalid RSS ${option}`)
  return categories
}

export async function parseStoredRSSFeed(
  root,
  document,
  channel,
  { parser = new RSSParser() } = {},
) {
  if (!["captured", "not_modified"].includes(document.fetch_status))
    throw Error("RSS feed needs captured source bytes")
  const raw = fs.readFileSync(safePath(root, document.body_path))
  if (sha256(raw) !== document.body_sha256) throw Error("RSS feed original body hash mismatch")
  const feed = await parser.parseString(raw.toString("utf8"))
  const timeZone = publicationTimeZone(channel)
  const ignoredCategories = feedCategories(channel, "ignored_categories")
  const requiredCategories = feedCategories(channel, "required_categories")
  const settings = {
    rule_id: channel.listing_profile?.rule_id,
    feed_title: channel.listing_profile?.feed_title,
    item_pattern: channel.item_pattern,
    guid_is_permalink: channel.listing_profile?.guid_is_permalink,
    date_timezone: channel.listing_profile?.date_timezone,
    pub_date_format: channel.listing_profile?.pub_date_format,
    pub_date_precision: channel.listing_profile?.pub_date_precision,
    ...(channel.listing_profile?.retention_business_days === undefined
      ? {}
      : { retention_business_days: channel.listing_profile.retention_business_days }),
    ignored_categories: ignoredCategories,
    ...(channel.listing_profile?.required_categories === undefined
      ? {}
      : { required_categories: requiredCategories }),
  }
  const parserIdentity = {
    id: "rss-parser",
    version: parserVersion,
    config_hash: sha256(JSON.stringify(settings)),
    adapter_sha256: adapterSha,
  }
  const parse_id = sha256(
    JSON.stringify([document.source_version_id, parserIdentity, "local-research/v1"]),
  )
  const links = (feed.items || []).map((item, index) => {
    const published_timestamp =
      item.isoDate ||
      localizedRSSInstant(
        item.pubDate,
        channel.listing_profile?.pub_date_format,
        timeZone,
      )
    const listed_date_text = item.pubDate?.trim() || null
    const calendar_day = calendarDayRSSDate(
      item.pubDate,
      channel.listing_profile?.pub_date_format,
    )
    return {
      url: absoluteRSSURL(item.link, document.final_url || document.original_url),
      text: item.title?.trim() || null,
      guid: channel.listing_profile?.guid_is_permalink
        ? absoluteRSSURL(item.guid, document.final_url || document.original_url)
        : item.guid?.trim() || null,
      listed_date_text,
      published_at: calendar_day || publicationDay(published_timestamp, timeZone),
      published_timestamp,
      published_date_precision: calendar_day ? "day" : published_timestamp ? "instant" : null,
      categories: Array.isArray(item.categories) ? item.categories : [],
      profile_id: channel.listing_profile?.rule_id,
      item_index: index,
      discovery_method: "rss",
    }
  })
  const blocks = links.map((link, index) => {
    const text = [link.text || "", link.listed_date_text || "", link.url || ""].join(" | ")
    return {
      block_id: `${parse_id}:block-${String(index + 1).padStart(4, "0")}`,
      kind: "paragraph",
      text,
      locator: { type: "rss", item_index: index, text_hash: sha256(text) },
    }
  })
  const parse = {
    schema_version: "source-parse/v1",
    status: feed.title && blocks.length ? "extracted" : "partial",
    title: feed.title || null,
    language: channel.language,
    source_id: document.source_id,
    source_version_id: document.source_version_id,
    parse_id,
    parser: parserIdentity,
    dates: {
      published_at: null,
      modified_at: null,
      observed_at: document.observed_at,
      feed_updated_at: feed.lastBuildDate || feed.pubDate || null,
    },
    blocks,
    links,
    link_profiles: [
      {
        id: channel.listing_profile?.rule_id,
        status: links.length ? "matched" : "no-match",
        selected_items: links.length,
        matched_links: links.length,
        truncated: false,
      },
    ],
    attachments: [],
    quality: {
      required_fields_present: Boolean(feed.title && blocks.length),
      missing_pages: [],
      reviewed: false,
    },
  }
  return storeParseArtifact(root, parse)
}

export function assessBoundedRSSFeed(parse, channel, since, until) {
  if (!validDay(since) || !validDay(until) || since >= until)
    throw Error("RSS scan requires an increasing [since, until) day window")
  if (
    channel.method !== "rss" ||
    channel.listing_profile?.pagination !== "bounded-feed" ||
    !channel.listing_profile?.rule_id ||
    !channel.listing_profile?.feed_title ||
    !channel.item_pattern
  )
    throw Error("RSS route needs a bounded feed profile")
  const links = parse.links || []
  const result = {
    status: "incomplete",
    reason: null,
    feed_items: links.length,
    window_items: 0,
    older_items: 0,
    later_items: 0,
    links: [],
  }
  if (
    parse.status !== "extracted" ||
    !parse.quality?.required_fields_present ||
    parse.title !== channel.listing_profile.feed_title ||
    !links.length ||
    links.length > (channel.listing_profile.max_items || 100)
  )
    return { ...result, reason: "feed_identity_or_size_invalid" }
  const pattern = new RegExp(channel.item_pattern)
  const timeZone = publicationTimeZone(channel)
  const ignoredCategories = feedCategories(channel, "ignored_categories")
  const requiredCategories = feedCategories(channel, "required_categories")
  const urls = new Set(),
    guids = new Set()
  for (const link of links) {
    const afterWindow = validDay(link.published_at) && link.published_at >= until
    let url
    try {
      url = canonicalURL(link.url)
      // Later items are retained and validated but never fetched by this
      // window. Their publisher must not invalidate an earlier collection.
      assertURL(url, afterWindow ? undefined : channel.allowed_hosts)
    } catch {
      return { ...result, reason: "feed_article_url_outside_policy" }
    }
    let guidMatches = true
    if (channel.listing_profile.guid_is_permalink) {
      try {
        guidMatches = canonicalURL(link.guid) === url
      } catch {
        guidMatches = false
      }
    }
    if (
      (ignoredCategories.length || requiredCategories.length) &&
      (!Array.isArray(link.categories) ||
        !link.categories.length ||
        link.categories.some((category) => typeof category !== "string" || !category.trim()))
    )
      return { ...result, reason: "feed_item_category_missing" }
    const ignored = link.categories?.some((category) => ignoredCategories.includes(category))
    const required = link.categories?.some((category) => requiredCategories.includes(category))
    if (requiredCategories.length && ignored && required)
      return { ...result, reason: "feed_item_category_conflict" }
    if (requiredCategories.length && !ignored && !required)
      return { ...result, reason: "feed_item_category_unexpected" }
    const hasCalendarDayOnly =
      channel.listing_profile?.pub_date_precision === "day" &&
      link.published_date_precision === "day" &&
      link.published_timestamp === null &&
      calendarDayRSSDate(link.listed_date_text, channel.listing_profile?.pub_date_format) ===
        link.published_at
    if (
      !link.text?.trim() ||
      !link.listed_date_text ||
      !validDay(link.published_at) ||
      (!hasCalendarDayOnly &&
        (!Number.isFinite(Date.parse(link.published_timestamp || "")) ||
          publicationDay(link.published_timestamp, timeZone) !== link.published_at))
    )
      return { ...result, reason: "feed_item_identity_or_date_invalid" }
    // Historical archives often retain duplicate media mirrors and legacy URL shapes.
    // They can establish the older cutoff, but must not become candidates for this window.
    if (link.published_at >= since) {
      if (
        (!ignored && !afterWindow && !pattern.test(url)) ||
        urls.has(url) ||
        !link.guid ||
        guids.has(link.guid) ||
        !guidMatches
      )
        return { ...result, reason: "feed_item_identity_or_date_invalid" }
      urls.add(url)
      guids.add(link.guid)
    }
  }
  if (
    links.some(
      (link, index) => index && link.published_at > links[index - 1].published_at,
    )
  )
    return { ...result, reason: "feed_not_newest_first" }
  const older = links.filter((link) => link.published_at < since)
  const later = links.filter((link) => link.published_at >= until)
  const datedWindow = links.filter(
    (link) => link.published_at >= since && link.published_at < until,
  )
  const selected = datedWindow.filter(
    (link) => !link.categories?.some((category) => ignoredCategories.includes(category)),
  )
  result.ignored_in_window = datedWindow.length - selected.length
  const retentionDays = channel.listing_profile?.retention_business_days
  const feedUpdatedDay = publicationDay(parse.dates?.feed_updated_at, timeZone)
  const retentionCoversWindow =
    Number.isInteger(retentionDays) &&
    retentionDays >= 1 &&
    retentionDays <= 10 &&
    feedUpdatedDay !== null &&
    until <= shiftDay(feedUpdatedDay, 1) &&
    businessDaysInclusive(since, feedUpdatedDay) <= retentionDays
  if (!older.length && !retentionCoversWindow)
    return {
      ...result,
      reason: "feed_cutoff_not_reached",
      window_items: selected.length,
      later_items: later.length,
    }
  if (selected.length > (channel.scan_max_details || 25))
    return {
      ...result,
      reason: "detail_budget_exceeded",
      window_items: selected.length,
      older_items: older.length,
      later_items: later.length,
    }
  return {
    ...result,
    status: "window_covered",
    reason: null,
    window_items: selected.length,
    older_items: older.length,
    retention_covered: retentionCoversWindow,
    later_items: later.length,
    links: selected,
  }
}

export async function scanBoundedRSSRoute(
  root,
  run,
  fetcher,
  channel,
  articleProfiles,
  { since, until },
  {
    fetchPolicy = fetchWithPolicy,
    parseFeed = parseStoredRSSFeed,
    parseArticle = parseDocument,
    collectDetails = collectWindowDetails,
  } = {},
) {
  if (!validDay(since) || !validDay(until) || since >= until)
    throw Error("RSS scan requires an increasing [since, until) day window")
  const listing = await run.stage("listing-fetch", { channel }, () =>
    fetchPolicy(root, fetcher, channel.url, {
      allowed_hosts: channel.allowed_hosts,
      request_interval_ms: channel.request_interval_ms,
    }),
  )
  const summary = {
    schema: "research-list-scan/v1",
    channel_id: channel.channel_id,
    listing_url: channel.url,
    listing_source_version_id: listing.source_version_id || null,
    observed_at: listing.observed_at,
    window: { since, until_exclusive: until },
    pagination: "bounded-feed",
    status: "incomplete",
    reason: null,
    assessment: null,
    details: [],
    candidate_published: false,
  }
  const indexDocuments = [],
    documents = [],
    parses = [],
    candidates = []
  if (!["captured", "not_modified"].includes(listing.fetch_status))
    return {
      summary: { ...summary, reason: "listing_" + listing.fetch_status },
      indexDocuments,
      documents,
      parses,
      candidates,
    }
  indexDocuments.push(listing)
  documents.push(listing)
  let parsed
  try {
    parsed = await run.stage("listing-parse", { listing, profile: channel.listing_profile }, () =>
      parseFeed(root, listing, channel),
    )
  } catch (error) {
    return {
      summary: { ...summary, reason: "listing_parse_failed", error: error.message },
      indexDocuments,
      documents,
      parses,
      candidates,
    }
  }
  parses.push(parsed)
  summary.listing_parse_id = parsed.parse_id
  const assessment = assessBoundedRSSFeed(parsed, channel, since, until)
  summary.assessment = { ...assessment, links: undefined }
  if (assessment.status !== "window_covered")
    return {
      summary: { ...summary, reason: assessment.reason },
      indexDocuments,
      documents,
      parses,
      candidates,
    }
  const inspected = await collectDetails(
    root,
    run,
    fetcher,
    channel,
    articleProfiles,
    assessment.links.map((link) => ({
      ...link,
      listing_source_version_id: listing.source_version_id,
      listing_parse_id: parsed.parse_id,
      discovered_at: listing.observed_at,
    })),
    { fetchPolicy, parse: parseArticle },
  )
  documents.push(...inspected.documents)
  parses.push(...inspected.parses)
  candidates.push(...inspected.candidates)
  summary.details = inspected.details
  summary.status =
    inspected.details.length === assessment.window_items &&
    inspected.details.every((detail) => detail.status === "source_parsed_unreviewed")
      ? "window_scanned"
      : "incomplete"
  summary.reason = summary.status === "window_scanned" ? null : "detail_incomplete"
  summary.candidate_count = candidates.length
  return { summary, indexDocuments, documents, parses, candidates }
}
