import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { assertURL } from "./fetch.mjs"
import { collectWindowDetails, validDay } from "./list-scan.mjs"
import { parseDocument } from "./parser.mjs"
import { safePath } from "./run-state.mjs"
import { fetchWithPolicy } from "./source-policy.mjs"

const FEED_ID = "cbcceb45d7e74cfe9a4601cee01344df"
const ARCHIVE_PATH = "/global/en/areas/robotics/news-and-media/news-archive"
const API_PATH = "/conf/abbcommon/services/newsbank.json"

export function abbPageURL(channel, page) {
  const profile = channel.api_profile
  if (
    profile?.id !== "abb-newsbank-json-pages-v1" ||
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(profile.page_size) ||
    profile.page_size < 1 ||
    profile.page_size > 100 ||
    !Number.isInteger(profile.max_pages) ||
    profile.max_pages < 1 ||
    profile.max_pages > 100 ||
    !Number.isInteger(profile.max_details) ||
    profile.max_details < 1 ||
    profile.max_details > 100 ||
    profile.feed_id !== FEED_ID ||
    profile.culture_info !== "en"
  )
    throw Error("Invalid ABB Robotics news API profile")
  const archive = assertURL(channel.url, channel.allowed_hosts)
  const url = assertURL(profile.endpoint, channel.allowed_hosts)
  if (
    archive.pathname !== ARCHIVE_PATH ||
    archive.search ||
    url.origin !== archive.origin ||
    url.pathname !== API_PATH ||
    url.search
  )
    throw Error("Unexpected ABB Robotics archive or API endpoint")
  url.searchParams.set("requestType", "getNewsList")
  url.searchParams.set("feedId", profile.feed_id)
  url.searchParams.set("pageNumber", String(page))
  url.searchParams.set("cultureInfo", profile.culture_info)
  url.searchParams.set("pageSize", String(profile.page_size))
  return url.toString()
}

export function parseABBPage(payload, channel, page) {
  const news = payload?.news,
    size = channel.api_profile?.page_size,
    count = news?.count,
    offset = (page - 1) * size
  if (
    !news ||
    !Array.isArray(news.items) ||
    news.page !== page ||
    news.size !== size ||
    !Number.isInteger(count) ||
    count < 0 ||
    news.items.length !== Math.min(size, Math.max(0, count - offset)) ||
    news.hasPrevious !== page > 1 ||
    news.hasNext !== offset + size < count
  )
    throw Error("ABB Robotics page count or cursor is incomplete")
  const pattern = new RegExp(channel.item_pattern)
  const origin = new URL(channel.url).origin
  const items = news.items.map((item, index) => {
    const title = item?.title?.replace(/\s+/g, " ").trim(),
      date = item?.scheduledPublishDate,
      match = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}\.\d{7}Z$/.exec(date || ""),
      day = match?.[1]
    if (
      !Number.isSafeInteger(item?.id) ||
      item.id < 1 ||
      !/^[a-z0-9-]+$/.test(item.newsUrlTitleSlug || "") ||
      !title ||
      !validDay(day) ||
      item.languageCode !== "en" ||
      item.cultureCode !== "en-US" ||
      item.internal !== false
    )
      throw Error("ABB Robotics page item lacks public English identity, title or date")
    const url = `${origin}/global/en/news/${item.id}/${item.newsUrlTitleSlug}`
    assertURL(url, channel.allowed_hosts)
    if (!pattern.test(url)) throw Error("ABB Robotics article URL is outside the route")
    return {
      id: item.id,
      url,
      text: title,
      published_at: day,
      listed_date_text: date,
      profile_id: channel.api_profile.id,
      json_pointer: `/news/items/${index}`,
    }
  })
  return { total: count, items }
}

export async function scanPaginatedABBRoute(
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
  abbPageURL(channel, 1)
  const pages = [],
    indexDocuments = [],
    selected = [],
    seenURLs = new Set(),
    seenIDs = new Set()
  const summary = {
    schema: "research-list-scan/v1",
    channel_id: channel.channel_id,
    listing_url: channel.url,
    api_profile_id: channel.api_profile.id,
    window: { since, until_exclusive: until },
    status: "incomplete",
    reason: null,
    pages,
    candidate_published: false,
  }
  const incomplete = (reason, error) => ({
    summary: { ...summary, reason, ...(error ? { error } : {}) },
    indexDocuments,
    documents: [],
    parses: [],
    candidates: [],
  })
  let expectedTotal = null,
    previousDay = null,
    reachedBoundary = false
  for (let page = 1; page <= channel.api_profile.max_pages; page++) {
    const url = abbPageURL(channel, page)
    let document
    try {
      document = await run.stage("page-" + page, { url }, () =>
        fetchPolicy(root, fetcher, url, { allowed_hosts: channel.allowed_hosts }),
      )
    } catch (error) {
      return incomplete("page_fetch_failed", error.message)
    }
    if (!["captured", "not_modified"].includes(document.fetch_status))
      return incomplete("page_" + document.fetch_status)
    indexDocuments.push(document)
    let parsed
    try {
      if (!/application\/json/i.test(document.mime_type || "")) throw Error("API page is not JSON")
      const body = fs.readFileSync(safePath(root, document.body_path))
      if (sha256(body) !== document.body_sha256) throw Error("ABB Robotics page body hash mismatch")
      parsed = parseABBPage(JSON.parse(body.toString("utf8")), channel, page)
    } catch (error) {
      return incomplete("page_parse_failed", error.message)
    }
    if (expectedTotal === null) expectedTotal = parsed.total
    else if (expectedTotal !== parsed.total) return incomplete("listing_changed_during_scan")
    pages.push({
      page,
      source_version_id: document.source_version_id,
      body_sha256: document.body_sha256,
      items: parsed.items.length,
      first_day: parsed.items[0]?.published_at || null,
      last_day: parsed.items.at(-1)?.published_at || null,
    })
    for (const item of parsed.items) {
      if (
        seenURLs.has(item.url) ||
        seenIDs.has(item.id) ||
        (previousDay && item.published_at > previousDay)
      )
        return incomplete("duplicate_or_unordered_page")
      seenURLs.add(item.url)
      seenIDs.add(item.id)
      previousDay = item.published_at
      if (item.published_at < since) reachedBoundary = true
      if (item.published_at >= since && item.published_at < until)
        selected.push({
          ...item,
          listing_source_version_id: document.source_version_id,
          discovered_at: document.observed_at,
          discovery_method: "json-page",
        })
    }
    if (reachedBoundary || seenURLs.size === expectedTotal) break
  }
  summary.total_elements = expectedTotal
  summary.scanned_items = seenURLs.size
  summary.window_items = selected.length
  summary.reached_older_item = reachedBoundary
  if (!reachedBoundary && seenURLs.size !== expectedTotal) return incomplete("cutoff_not_reached")
  if (selected.length > channel.api_profile.max_details) return incomplete("detail_budget_exceeded")
  const inspected = await collectWindowDetails(
    root,
    run,
    fetcher,
    channel,
    articleProfiles,
    selected,
    { fetchPolicy, parse },
  )
  summary.details = inspected.details
  summary.candidate_count = inspected.candidates.length
  summary.status = inspected.details.every((detail) => detail.status === "source_parsed_unreviewed")
    ? "window_scanned"
    : "incomplete"
  summary.reason = summary.status === "window_scanned" ? null : "detail_incomplete"
  return { summary, indexDocuments, ...inspected }
}
