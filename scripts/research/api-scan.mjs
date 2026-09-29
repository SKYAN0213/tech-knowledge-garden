import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { assertURL } from "./fetch.mjs"
import { collectWindowDetails, validDay } from "./list-scan.mjs"
import { parseDocument } from "./parser.mjs"
import { safePath } from "./run-state.mjs"
import { fetchWithPolicy } from "./source-policy.mjs"

export function hdPageURL(channel, page) {
  const profile = channel.api_profile
  if (
    profile?.id !== "hd-press-json-pages-v1" ||
    !Number.isInteger(page) ||
    page < 0 ||
    !Number.isInteger(profile.page_size) ||
    profile.page_size < 1 ||
    profile.page_size > 100 ||
    !Number.isInteger(profile.max_pages) ||
    profile.max_pages < 1 ||
    profile.max_pages > 100 ||
    !Number.isInteger(profile.max_details) ||
    profile.max_details < 1 ||
    profile.max_details > 100
  )
    throw Error("Invalid HD Robotics API route profile")
  const url = assertURL(profile.endpoint, channel.allowed_hosts)
  if (url.pathname !== "/api/v1/company/page" || url.search)
    throw Error("Unexpected HD Robotics API endpoint")
  for (const [key, value] of Object.entries(profile.query || {})) {
    if (!["compIntrSubTypeCd", "bdSeq"].includes(key) || !/^\d+$/.test(value))
      throw Error("Unexpected HD Robotics API query")
    url.searchParams.set(key, value)
  }
  if (
    url.searchParams.get("compIntrSubTypeCd") !== "90010001" ||
    url.searchParams.get("bdSeq") !== "51"
  )
    throw Error("HD Robotics press-release filter changed")
  url.searchParams.set("page", String(page))
  url.searchParams.set("size", String(profile.page_size))
  return url.toString()
}

export function parseHDPage(payload, channel, page) {
  const profile = channel.api_profile
  const data = payload?.data
  if (
    payload?.resCd !== 1 ||
    !data ||
    !Array.isArray(data.content) ||
    data.number !== page ||
    data.size !== profile.page_size ||
    !Number.isInteger(data.totalElements) ||
    data.totalElements < 0 ||
    !Number.isInteger(data.totalPages) ||
    data.totalPages < 0 ||
    !Number.isInteger(data.numberOfElements) ||
    data.numberOfElements !== data.content.length ||
    data.content.length > profile.page_size ||
    data.empty !== (data.content.length === 0) ||
    (data.totalElements === 0) !== (data.totalPages === 0) ||
    (data.totalElements > 0 && (page >= data.totalPages || !data.content.length)) ||
    data.first !== (page === 0) ||
    data.last !== (page === data.totalPages - 1 || data.totalPages === 0)
  )
    throw Error("HD Robotics page metadata is incomplete or inconsistent")
  const origin = new URL(channel.url).origin
  const items = data.content.map((item, index) => {
    const title = item?.bdContent?.bdcTitle?.replace(/\s+/g, " ").trim()
    const day = item?.bdContent?.bdcRegDtShort
    if (
      !Number.isSafeInteger(item?.bdcSeq) ||
      item.bdcSeq < 1 ||
      !title ||
      !validDay(day) ||
      item.compIntrSubTypeCd !== profile.query.compIntrSubTypeCd
    )
      throw Error("HD Robotics page item lacks title, date, type or identity")
    const url = `${origin}/company/news/${item.bdcSeq}`
    assertURL(url, channel.allowed_hosts)
    return {
      url,
      text: title,
      published_at: day,
      listed_date_text: day,
      profile_id: profile.id,
      json_pointer: `/data/content/${index}`,
      external_url: item.compIntrLink?.trim() || null,
    }
  })
  return { total_elements: data.totalElements, total_pages: data.totalPages, items }
}

export async function scanPaginatedHDRoute(
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
  hdPageURL(channel, 0)
  const pages = [],
    indexDocuments = [],
    selected = [],
    seen = new Set()
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
  const empty = { summary, indexDocuments, documents: [], parses: [], candidates: [] }
  let expectedTotal = null,
    expectedPages = null,
    previousDay = null,
    scannedCount = 0
  for (let page = 0; page < channel.api_profile.max_pages; page++) {
    const url = hdPageURL(channel, page)
    let document
    try {
      document = await run.stage("page-" + page, { url }, () =>
        fetchPolicy(root, fetcher, url, { allowed_hosts: channel.allowed_hosts }),
      )
    } catch (error) {
      return {
        ...empty,
        summary: { ...summary, reason: "page_fetch_failed", error: error.message },
      }
    }
    if (!["captured", "not_modified"].includes(document.fetch_status))
      return { ...empty, summary: { ...summary, reason: "page_" + document.fetch_status } }
    indexDocuments.push(document)
    let parsed
    try {
      if (!/application\/json/i.test(document.mime_type || "")) throw Error("API page is not JSON")
      const body = fs.readFileSync(safePath(root, document.body_path))
      if (sha256(body) !== document.body_sha256) throw Error("API page body hash mismatch")
      parsed = parseHDPage(JSON.parse(body.toString("utf8")), channel, page)
    } catch (error) {
      return {
        ...empty,
        summary: { ...summary, reason: "page_parse_failed", error: error.message },
      }
    }
    if (expectedTotal === null) {
      expectedTotal = parsed.total_elements
      expectedPages = parsed.total_pages
      if (expectedPages > channel.api_profile.max_pages)
        return { ...empty, summary: { ...summary, reason: "page_budget_exceeded" } }
    } else if (expectedTotal !== parsed.total_elements || expectedPages !== parsed.total_pages)
      return { ...empty, summary: { ...summary, reason: "listing_changed_during_scan" } }
    pages.push({
      page,
      source_version_id: document.source_version_id,
      body_sha256: document.body_sha256,
      items: parsed.items.length,
      first_day: parsed.items[0]?.published_at || null,
      last_day: parsed.items.at(-1)?.published_at || null,
    })
    for (const item of parsed.items) {
      if (seen.has(item.url) || (previousDay && item.published_at > previousDay))
        return { ...empty, summary: { ...summary, reason: "duplicate_or_unordered_page" } }
      seen.add(item.url)
      previousDay = item.published_at
      scannedCount++
      if (item.published_at >= since && item.published_at < until)
        selected.push({
          ...item,
          listing_source_version_id: document.source_version_id,
          discovered_at: document.observed_at,
          discovery_method: "json-page",
        })
    }
    if (page + 1 === expectedPages) break
  }
  summary.total_elements = expectedTotal
  summary.total_pages = expectedPages
  summary.scanned_items = scannedCount
  summary.window_items = selected.length
  if (pages.length !== expectedPages || scannedCount !== expectedTotal)
    return { ...empty, summary: { ...summary, reason: "pagination_incomplete" } }
  if (selected.length > channel.api_profile.max_details)
    return { ...empty, summary: { ...summary, reason: "detail_budget_exceeded" } }
  if (selected.some((item) => item.external_url))
    return { ...empty, summary: { ...summary, reason: "external_detail_unhandled" } }
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
