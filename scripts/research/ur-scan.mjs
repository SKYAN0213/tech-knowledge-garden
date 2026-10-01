import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { assertURL } from "./fetch.mjs"
import { collectWindowDetails, validDay } from "./list-scan.mjs"
import { safePath } from "./run-state.mjs"
import { fetchWithPolicy } from "./source-policy.mjs"

const PROFILE_ID = "ur-news-center-json-pages-v1"
const LIST_PATH = "/news-and-media/news-center/"

export function urPageURL(channel, page) {
  const profile = channel.api_profile
  if (
    profile?.id !== PROFILE_ID ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > profile.max_pages ||
    !Number.isInteger(profile.max_pages) ||
    profile.max_pages < 1 ||
    profile.max_pages > 100 ||
    !Number.isInteger(profile.max_details) ||
    profile.max_details < 1 ||
    profile.max_details > 100 ||
    profile.page_parameter !== "page" ||
    profile.json_parameter !== "asjson" ||
    profile.json_value !== "1"
  )
    throw Error("Invalid Universal Robots News Center API profile")
  const listing = assertURL(channel.url, channel.allowed_hosts)
  if (listing.pathname !== LIST_PATH || listing.search || listing.hash)
    throw Error("Unexpected Universal Robots News Center URL")
  const url = new URL(listing)
  if (page > 1) url.searchParams.set(profile.page_parameter, String(page))
  url.searchParams.set(profile.json_parameter, profile.json_value)
  return url.toString()
}

export function parseURPage(payload, channel, page) {
  const components =
      payload?.content?.body?.rootComponent?.body ||
      payload?.getPageData?.content?.body?.rootComponent?.body,
    componentIndex = Array.isArray(components)
      ? components.findIndex((component) => component?.componentName === "card-overview")
      : -1,
    overview = componentIndex >= 0 ? components[componentIndex] : null,
    result = overview?.result,
    paging = result?.paging,
    { page_size: expectedSize } = channel.api_profile || {}
  if (
    !Array.isArray(result?.items) ||
    !Number.isInteger(expectedSize) ||
    expectedSize < 1 ||
    expectedSize > 100 ||
    paging?.currentPage !== page ||
    paging?.pageSize !== expectedSize ||
    !Number.isInteger(paging?.totalItems) ||
    paging.totalItems < 0 ||
    !Number.isInteger(paging?.numberOfPages) ||
    paging.numberOfPages !== Math.ceil(paging.totalItems / expectedSize) ||
    result.items.length !==
      Math.min(expectedSize, Math.max(0, paging.totalItems - (page - 1) * expectedSize))
  )
    throw Error("Universal Robots page count or cursor is incomplete")

  const pattern = new RegExp(channel.item_pattern)
  const origin = new URL(channel.url).origin
  const items = result.items.map((item, index) => {
    const title = String(item?.title || "")
        .replace(/\s+/g, " ")
        .trim(),
      day = item?.date,
      url = new URL(item?.link?.href || "", origin).toString()
    assertURL(url, channel.allowed_hosts)
    if (
      typeof item?.id !== "string" ||
      !item.id.trim() ||
      !title ||
      !validDay(day) ||
      !pattern.test(url)
    )
      throw Error("Universal Robots page item lacks public identity, title, date or article URL")
    return {
      id: item.id,
      url,
      text: title,
      published_at: day,
      listed_date_text: item.publishedAt || day,
      profile_id: PROFILE_ID,
      json_pointer: `/content/body/rootComponent/body/${componentIndex}/result/items/${index}`,
    }
  })
  return {
    total: paging.totalItems,
    page_count: paging.numberOfPages,
    page_size: paging.pageSize,
    items,
  }
}

export async function scanPaginatedURRoute(
  root,
  run,
  fetcher,
  channel,
  articleProfiles,
  { since, until },
  {
    fetchPolicy = fetchWithPolicy,
    parse = (body) => JSON.parse(body),
    collectDetails = collectWindowDetails,
  } = {},
) {
  if (!validDay(since) || !validDay(until) || since >= until)
    throw Error("List scan requires an increasing [since, until) day window")
  urPageURL(channel, 1)
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
    expectedPageCount = null,
    pageSize = null,
    previousDay = null,
    reachedBoundary = false

  for (let page = 1; page <= channel.api_profile.max_pages; page++) {
    const url = urPageURL(channel, page)
    let document
    try {
      document = await run.stage(`page-${page}`, { url }, () =>
        fetchPolicy(root, fetcher, url, { allowed_hosts: channel.allowed_hosts }),
      )
    } catch (error) {
      return incomplete("page_fetch_failed", error.message)
    }
    if (!["captured", "not_modified"].includes(document.fetch_status))
      return incomplete("page_" + document.fetch_status)
    indexDocuments.push(document)
    let parsed, payload
    try {
      if (!/application\/json/i.test(document.mime_type || ""))
        throw Error("Universal Robots API page is not JSON")
      const body = fs.readFileSync(safePath(root, document.body_path))
      if (sha256(body) !== document.body_sha256)
        throw Error("Universal Robots page body hash mismatch")
      payload = parse(body.toString("utf8"))
      parsed = parseURPage(payload, channel, page)
    } catch (error) {
      return incomplete("page_parse_failed", error.message)
    }
    if (expectedTotal === null) {
      expectedTotal = parsed.total
      expectedPageCount = parsed.page_count
      pageSize = parsed.page_size
    } else if (
      parsed.total !== expectedTotal ||
      parsed.page_count !== expectedPageCount ||
      parsed.page_size !== pageSize
    ) {
      return incomplete("listing_changed_during_scan")
    }
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
  summary.page_count = expectedPageCount
  summary.page_size = pageSize
  summary.window_items = selected.length
  summary.reached_older_item = reachedBoundary
  if (!reachedBoundary && seenURLs.size !== expectedTotal) return incomplete("cutoff_not_reached")
  if (selected.length > channel.api_profile.max_details) return incomplete("detail_budget_exceeded")
  const inspected = await collectDetails(root, run, fetcher, channel, articleProfiles, selected, {
    fetchPolicy,
  })
  summary.details = inspected.details
  summary.candidate_count = inspected.candidates.length
  summary.status = inspected.details.every((detail) => detail.status === "source_parsed_unreviewed")
    ? "window_scanned"
    : "incomplete"
  summary.reason = summary.status === "window_scanned" ? null : "detail_incomplete"
  return { summary, indexDocuments, ...inspected }
}
