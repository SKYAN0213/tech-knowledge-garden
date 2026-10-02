import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { assertURL } from "./fetch.mjs"
import { collectWindowDetails, validDay } from "./list-scan.mjs"
import { safePath } from "./run-state.mjs"
import { fetchWithPolicy } from "./source-policy.mjs"

const PROFILE_ID = "wordpress-rest-posts-json-v1"

export function wordpressPageURL(channel, page, { since, until }) {
  const profile = channel.api_profile
  if (
    profile?.id !== PROFILE_ID ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > profile.max_pages ||
    !Number.isInteger(profile.page_size) ||
    profile.page_size < 1 ||
    profile.page_size > 100 ||
    !Number.isInteger(profile.max_pages) ||
    profile.max_pages < 1 ||
    profile.max_pages > 100 ||
    !Number.isInteger(profile.max_details) ||
    profile.max_details < 1 ||
    profile.max_details > 100 ||
    !validDay(since) ||
    !validDay(until) ||
    since >= until
  )
    throw Error("Invalid WordPress REST posts route profile or date window")
  const url = assertURL(profile.endpoint, channel.allowed_hosts)
  if (!/^\/wp-json\/wp\/v2\/[a-z0-9-]+$/.test(url.pathname) || url.search || url.hash)
    throw Error("Unexpected WordPress REST posts endpoint")
  url.searchParams.set("after", `${since}T00:00:00`)
  url.searchParams.set("before", `${until}T00:00:00`)
  url.searchParams.set("orderby", "date")
  url.searchParams.set("order", "desc")
  url.searchParams.set("per_page", String(profile.page_size))
  url.searchParams.set("page", String(page))
  url.searchParams.set("_fields", "id,date,date_gmt,link,title,status,type,slug")
  return url.toString()
}

function titleText(value) {
  if (typeof value !== "string") return ""
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_match, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_match, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(?:amp|#0*38);/gi, "&")
    .replace(/&(?:quot|#0*34);/gi, '"')
    .replace(/&(?:apos|#0*39);/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function parseWordPressPage(payload, channel, page, window) {
  if (!Array.isArray(payload) || payload.length > channel.api_profile.page_size)
    throw Error("WordPress REST page is not a bounded post array")
  const origin = new URL(channel.url).origin
  let previousDate = null
  const items = payload.map((item, index) => {
    const title = titleText(item?.title?.rendered)
    const day = item?.date?.slice(0, 10)
    const detail = typeof item?.link === "string" ? item.link : ""
    if (
      !Number.isSafeInteger(item?.id) ||
      item.id < 1 ||
      item.status !== "publish" ||
      !title ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(item.date || "") ||
      !validDay(day) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(item.date_gmt || "") ||
      item.type !== new URL(channel.api_profile.endpoint).pathname.split("/").at(-1) ||
      typeof item.slug !== "string" ||
      !item.slug ||
      !detail
    )
      throw Error("WordPress REST post lacks a published identity, title, date or permalink")
    if (previousDate && day > previousDate)
      throw Error("WordPress REST posts are not ordered newest first")
    previousDate = day
    const url = assertURL(detail, channel.allowed_hosts)
    if (
      url.origin !== origin ||
      url.search ||
      url.hash ||
      !new RegExp(channel.item_pattern).test(url.toString())
    )
      throw Error("WordPress REST permalink is outside the channel article policy")
    return {
      url: url.toString(),
      text: title,
      published_at: day,
      listed_date_text: item.date,
      profile_id: PROFILE_ID,
      json_pointer: `/${index}`,
      post_id: item.id,
    }
  })
  for (let i = 1; i < items.length; i++)
    if (items[i - 1].published_at < items[i].published_at)
      throw Error("WordPress REST page date order changed")
  return {
    items,
    page_complete: payload.length < channel.api_profile.page_size,
    window,
  }
}

export async function scanWordPressPostsRoute(
  root,
  run,
  fetcher,
  channel,
  articleProfiles,
  { since, until },
  { fetchPolicy = fetchWithPolicy, parse = undefined } = {},
) {
  if (!validDay(since) || !validDay(until) || since >= until)
    throw Error("List scan requires an increasing [since, until) day window")
  wordpressPageURL(channel, 1, { since, until })
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
  let previousDay = null,
    scannedCount = 0,
    terminalPage = false
  for (let page = 1; page <= channel.api_profile.max_pages; page++) {
    const url = wordpressPageURL(channel, page, { since, until })
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
      if (!/application\/json/i.test(document.mime_type || ""))
        throw Error("WordPress API page is not JSON")
      const body = fs.readFileSync(safePath(root, document.body_path))
      if (sha256(body) !== document.body_sha256)
        throw Error("WordPress API page body hash mismatch")
      parsed = parseWordPressPage(JSON.parse(body.toString("utf8")), channel, page, {
        since,
        until_exclusive: until,
      })
    } catch (error) {
      return {
        ...empty,
        summary: { ...summary, reason: "page_parse_failed", error: error.message },
      }
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
    if (parsed.page_complete) {
      terminalPage = true
      break
    }
  }
  summary.scanned_items = scannedCount
  summary.window_items = selected.length
  summary.pages_complete = terminalPage
  if (!terminalPage) return { ...empty, summary: { ...summary, reason: "page_budget_exceeded" } }
  if (selected.length > channel.api_profile.max_details)
    return { ...empty, summary: { ...summary, reason: "detail_budget_exceeded" } }
  const inspected = await collectWindowDetails(
    root,
    run,
    fetcher,
    channel,
    articleProfiles,
    selected,
    {
      fetchPolicy,
      ...(parse ? { parse } : {}),
    },
  )
  summary.details = inspected.details
  summary.candidate_count = inspected.candidates.length
  summary.status = inspected.details.every((detail) => detail.status === "source_parsed_unreviewed")
    ? "window_scanned"
    : "incomplete"
  summary.reason = summary.status === "window_scanned" ? null : "detail_incomplete"
  return { summary, indexDocuments, ...inspected }
}
