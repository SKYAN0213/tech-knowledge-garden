import fs from "node:fs"
import { canonicalURL } from "../garden.mjs"
import { sha256 } from "./contracts.mjs"
import { assertURL } from "./fetch.mjs"
import { collectWindowDetails, validDay } from "./list-scan.mjs"
import { parseDocument } from "./parser.mjs"
import { safePath } from "./run-state.mjs"
import { fetchWithPolicy } from "./source-policy.mjs"

const months = new Map(
  [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
  ].map((name, index) => [name, index + 1]),
)
const englishMonths = new Map(
  [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ].map((name, index) => [name, index + 1]),
)

export function kukaPublicationDay(value, locale = "de-DE") {
  const match =
    locale === "de-DE"
      ? /^(\d{1,2})\. ([A-Za-zÄÖÜäöüß]+) (\d{4})$/.exec(value || "")
      : locale === "en-US"
        ? /^(\d{1,2}) ([A-Z][a-z]+) (\d{4})$/.exec(value || "")
        : null
  const month = (locale === "de-DE" ? months : englishMonths).get(match?.[2])
  if (!month) return null
  const day = `${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`
  return validDay(day) ? day : null
}

function kukaListingDay(row, locale) {
  const dateISO = row?.dateISO,
    apiMatch =
      typeof dateISO === "string"
        ? /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$/.exec(
            dateISO,
          )
        : null,
    apiDay = apiMatch && validDay(apiMatch[1]) ? apiMatch[1] : null,
    labelMatch =
      locale === "en-US"
        ? /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/.exec(row?.date || "")
        : null,
    labelMonth = englishMonths.get(labelMatch?.[1]),
    labelDay = labelMatch
      ? `${labelMatch[3]}-${String(labelMonth || 0).padStart(2, "0")}-${String(labelMatch[2]).padStart(2, "0")}`
      : kukaPublicationDay(row?.date, locale)
  if (apiDay && labelDay && apiDay === labelDay) return apiDay
  if (!dateISO) return labelDay
  return null
}

export function kukaPageRequest(channel, offset) {
  const profile = channel.api_profile
  if (
    profile?.id !== "kuka-news-form-pages-v1" ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(profile.page_size) ||
    profile.page_size < 1 ||
    profile.page_size > 100 ||
    !Number.isInteger(profile.max_pages) ||
    profile.max_pages < 1 ||
    profile.max_pages > 100 ||
    !Number.isInteger(profile.max_details) ||
    profile.max_details < 1 ||
    profile.max_details > 100 ||
    !["de-DE", "en-US"].includes(profile.sc_lang) ||
    !/^[A-F0-9]{32}$/.test(profile.context_id || "") ||
    !/^[A-F0-9]{32}$/.test(profile.captions_facet_id || "")
  )
    throw Error("Invalid KUKA news form profile")
  const url = assertURL(profile.endpoint, channel.allowed_hosts)
  if (url.pathname !== "/api/news/GetPublications" || url.search)
    throw Error("Unexpected KUKA news endpoint")
  const form = new URLSearchParams({
    contextid: profile.context_id,
    takeCaptionsFromFacetId: profile.captions_facet_id,
    searchterm: "",
    datestart: "",
    dateend: "",
    offset: String(offset),
    count: String(profile.page_size),
  })
  url.searchParams.set("sc_lang", profile.sc_lang)
  for (const [name, value] of form) url.searchParams.set(name, value)
  return { url: url.toString(), form: form.toString() }
}

export function parseKUKAPage(payload, channel, offset) {
  const pageSize = channel.api_profile?.page_size,
    total = payload?.count,
    rows = payload?.items
  if (
    !Number.isInteger(total) ||
    total < 0 ||
    !Array.isArray(rows) ||
    !Array.isArray(payload.facets) ||
    rows.length !== Math.min(pageSize, Math.max(0, total - offset))
  )
    throw Error("KUKA page count or items are incomplete")
  const pattern = new RegExp(channel.item_pattern),
    seenIds = new Set()
  const items = rows.map((row, index) => {
    const title = row?.headline?.replace(/\s+/g, " ").trim(),
      day = kukaListingDay(row, channel.api_profile.sc_lang),
      sourceItemId = row?.itemId
    let url
    try {
      url = canonicalURL(row.href)
      assertURL(url, channel.allowed_hosts)
    } catch {
      throw Error("KUKA page item has an invalid article URL")
    }
    if (
      !pattern.test(url) ||
      !title ||
      !day ||
      (sourceItemId !== undefined &&
        (typeof sourceItemId !== "string" || sourceItemId.length < 1 || sourceItemId.length > 128)) ||
      (sourceItemId && seenIds.has(sourceItemId))
    )
      throw Error("KUKA page item lacks a locale-matched URL, title or publication date")
    if (sourceItemId) seenIds.add(sourceItemId)
    return {
      url,
      text: title,
      published_at: day,
      listed_date_text: row.date,
      profile_id: channel.api_profile.id,
      ...(sourceItemId ? { source_item_id: sourceItemId } : {}),
      json_pointer: `/items/${index}`,
    }
  })
  return { total, items }
}

export async function scanPaginatedKUKARoute(
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
  kukaPageRequest(channel, 0)
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
  for (let page = 0; page < channel.api_profile.max_pages; page++) {
    const offset = page * channel.api_profile.page_size,
      request = kukaPageRequest(channel, offset)
    let document
    try {
      document = await run.stage("page-" + offset, request, () =>
        fetchPolicy(root, fetcher, request.url, {
          allowed_hosts: channel.allowed_hosts,
          method: "POST",
          form: request.form,
        }),
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
      if (sha256(body) !== document.body_sha256) throw Error("KUKA page body hash mismatch")
      parsed = parseKUKAPage(JSON.parse(body.toString("utf8")), channel, offset)
    } catch (error) {
      return incomplete("page_parse_failed", error.message)
    }
    if (expectedTotal === null) expectedTotal = parsed.total
    else if (expectedTotal !== parsed.total) return incomplete("listing_changed_during_scan")
    pages.push({
      offset,
      source_version_id: document.source_version_id,
      body_sha256: document.body_sha256,
      items: parsed.items.length,
      first_day: parsed.items[0]?.published_at || null,
      last_day: parsed.items.at(-1)?.published_at || null,
    })
    for (const item of parsed.items) {
      if (seen.has(item.url) || (previousDay && item.published_at > previousDay))
        return incomplete("duplicate_or_unordered_page")
      seen.add(item.url)
      previousDay = item.published_at
      if (item.published_at < since) reachedBoundary = true
      if (item.published_at >= since && item.published_at < until)
        selected.push({
          ...item,
          listing_source_version_id: document.source_version_id,
          discovered_at: document.observed_at,
          discovery_method: "form-json-page",
        })
    }
    if (reachedBoundary || offset + parsed.items.length === expectedTotal) break
  }
  summary.total_elements = expectedTotal
  summary.scanned_items = seen.size
  summary.window_items = selected.length
  summary.reached_older_item = reachedBoundary
  if (!reachedBoundary && seen.size !== expectedTotal) return incomplete("cutoff_not_reached")
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
