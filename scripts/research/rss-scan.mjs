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
  const links = (feed.items || []).map((item, index) => ({
    url: item.link || null,
    text: item.title || null,
    guid: item.guid || null,
    listed_date_text: item.pubDate || null,
    published_at: publicationDay(item.isoDate, timeZone),
    published_timestamp: item.isoDate || null,
    categories: Array.isArray(item.categories) ? item.categories : [],
    profile_id: channel.listing_profile?.rule_id,
    item_index: index,
    discovery_method: "rss",
  }))
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
    dates: { published_at: null, modified_at: null, observed_at: document.observed_at },
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
    let url
    try {
      url = canonicalURL(link.url)
      assertURL(url, channel.allowed_hosts)
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
    if (
      (!ignored && !pattern.test(url)) ||
      urls.has(url) ||
      !link.text?.trim() ||
      !link.guid ||
      guids.has(link.guid) ||
      !link.listed_date_text ||
      !validDay(link.published_at) ||
      !Number.isFinite(Date.parse(link.published_timestamp || "")) ||
      publicationDay(link.published_timestamp, timeZone) !== link.published_at ||
      !guidMatches
    )
      return { ...result, reason: "feed_item_identity_or_date_invalid" }
    urls.add(url)
    guids.add(link.guid)
  }
  if (
    links.some(
      (link, index) => index && link.published_timestamp > links[index - 1].published_timestamp,
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
  if (!older.length)
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
    fetchPolicy(root, fetcher, channel.url, { allowed_hosts: channel.allowed_hosts }),
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
