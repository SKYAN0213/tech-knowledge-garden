import fs from "node:fs"
import { canonicalURL } from "../garden.mjs"
import { sha256 } from "./contracts.mjs"
import { assertURL } from "./fetch.mjs"
import { parseDocument } from "./parser.mjs"
import { safePath } from "./run-state.mjs"
import { fetchWithPolicy } from "./source-policy.mjs"
import { validDay } from "./list-scan.mjs"

export function formHTMLPageRequest(channel, page, { since, until }) {
  const profile = channel.api_profile
  if (
    profile?.id !== "post-html-fragment-pages-v1" ||
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(profile.page_size) ||
    profile.page_size < 1 ||
    profile.page_size > 500 ||
    !Number.isInteger(profile.max_pages) ||
    profile.max_pages < 1 ||
    profile.max_pages > 100 ||
    !validDay(since) ||
    !validDay(until) ||
    since >= until ||
    !profile.form_fields ||
    typeof profile.form_fields !== "object" ||
    Array.isArray(profile.form_fields)
  )
    throw Error("Invalid POST HTML fragment page profile or scan window")
  const url = assertURL(profile.endpoint, channel.allowed_hosts)
  if (url.search || url.hash) throw Error("POST HTML endpoint must not include query or fragment")
  const fields = new URLSearchParams()
  const names = Object.keys(profile.form_fields)
  if (
    !names.includes(profile.page_field) ||
    !names.includes(profile.page_size_field) ||
    names.length > 40
  )
    throw Error("POST HTML profile must bind page and size fields")
  for (const [name, raw] of Object.entries(profile.form_fields)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) || typeof raw !== "string")
      throw Error("POST HTML form fields must have bounded names and string values")
    let value = raw.replace(/\{(since|until|page|page_size)\}/g, (_match, key) => {
      const values = { since, until, page: String(page), page_size: String(profile.page_size) }
      return values[key]
    })
    if (/[{}]/.test(value)) throw Error("POST HTML form value has an unsupported template")
    fields.append(name, value)
  }
  const form = fields.toString()
  if (!form.length || Buffer.byteLength(form) > 4096)
    throw Error("POST HTML form exceeds the bounded request size")
  for (const [name, value] of fields) url.searchParams.append(name, value)
  return { url: url.toString(), form }
}

export async function scanFormHTMLRoute(
  root,
  run,
  fetcher,
  channel,
  _articleProfiles,
  { since, until },
  { fetchPolicy = fetchWithPolicy, parse = parseDocument } = {},
) {
  const profile = channel.api_profile
  formHTMLPageRequest(channel, 1, { since, until })
  const ruleId = profile.listing_link_rule_id
  const rule = profile.parser_options?.listing_link_rules?.find((entry) => entry.id === ruleId)
  if (
    profile.parser_options?.format !== "html-fragment" ||
    profile.parser_options.publication_date_policy !== "not_applicable" ||
    !rule ||
    rule.date_kind !== "event_date" ||
    !profile.item_identity_pattern ||
    !channel.item_pattern
  )
    throw Error("POST HTML schedule profile must define an event-date listing rule")

  const summary = {
    schema: "research-list-scan/v1",
    channel_id: channel.channel_id,
    listing_url: channel.url,
    api_profile_id: profile.id,
    record_type: "scheduled-ir-events",
    window: { since, until_exclusive: until },
    status: "incomplete",
    reason: null,
    pages: [],
    candidate_published: false,
  }
  const indexDocuments = [], parses = [], scanned = [], selected = [], seen = new Set()
  let previousDay = null,
    reachedBoundary = false,
    exhausted = false,
    failure = null

  for (let page = 1; page <= profile.max_pages; page++) {
    const request = formHTMLPageRequest(channel, page, { since, until })
    let document
    try {
      document = await run.stage(`form-html-page-${page}`, request, () =>
        fetchPolicy(root, fetcher, request.url, {
          allowed_hosts: channel.allowed_hosts,
          method: "POST",
          form: request.form,
        }),
      )
    } catch (error) {
      failure = { reason: "page_fetch_failed", error: error.message }
      break
    }
    if (!["captured", "not_modified"].includes(document.fetch_status)) {
      failure = { reason: `page_${document.fetch_status}` }
      break
    }
    indexDocuments.push(document)

    let parsed
    try {
      if (!/text\/html|application\/xhtml\+xml/i.test(document.mime_type || ""))
        throw Error("POST HTML page is not HTML")
      parsed = await run.stage(`form-html-parse-${page}`, { document, options: profile.parser_options }, () =>
        parse(root, document, profile.parser_options),
      )
      const body = fs.readFileSync(safePath(root, document.body_path))
      if (sha256(body) !== document.body_sha256) throw Error("POST HTML page body hash mismatch")
      if (parsed.status !== "extracted" || !parsed.quality?.required_fields_present)
        throw Error("POST HTML page fragment did not parse completely")
      parses.push(parsed)
    } catch (error) {
      failure = { reason: "page_parse_failed", error: error.message }
      break
    }

    const rows = (parsed.links || []).filter((entry) => entry.profile_id === ruleId)
    if (rows.length > profile.page_size || !rows.length) {
      failure = { reason: rows.length ? "page_size_exceeded" : "page_has_no_profiled_rows" }
      break
    }
    const pageItems = []
    for (const [index, row] of rows.entries()) {
      let url
      try {
        url = canonicalURL(row.url)
        assertURL(url, channel.allowed_hosts)
      } catch {
        failure = { reason: "item_url_outside_policy" }
        break
      }
      const day = row.event_date
      if (
        !new RegExp(channel.item_pattern).test(url) ||
        !row.text?.trim() ||
        !validDay(day) ||
        !row.listed_date_text
      ) {
        failure = { reason: "item_identity_or_event_date_missing" }
        break
      }
      const identity = new RegExp(profile.item_identity_pattern).exec(url)?.[0]
      if (!identity || seen.has(identity) || (previousDay && day > previousDay)) {
        failure = { reason: "duplicate_or_unordered_event" }
        break
      }
      seen.add(identity)
      previousDay = day
      const item = {
        event_id: sha256(`${channel.channel_id}\n${identity}`).slice(0, 24),
        detail_url: url,
        title: row.text,
        company: row.categories?.[0] || null,
        event_date: day,
        event_date_text: row.listed_date_text,
        listing_source_version_id: document.source_version_id,
        listing_body_sha256: document.body_sha256,
        listing_parse_id: parsed.parse_id,
        listing_row_index: index,
        observed_at: document.observed_at,
      }
      pageItems.push(item)
      scanned.push(item)
      if (day < since) reachedBoundary = true
      if (day >= since && day < until) selected.push(item)
    }
    if (failure) break
    summary.pages.push({
      page,
      source_version_id: document.source_version_id,
      body_sha256: document.body_sha256,
      parse_id: parsed.parse_id,
      items: pageItems.length,
      first_day: pageItems[0]?.event_date || null,
      last_day: pageItems.at(-1)?.event_date || null,
    })
    if (reachedBoundary || rows.length < profile.page_size) {
      exhausted = true
      break
    }
  }

  summary.scanned_items = scanned.length
  summary.window_items = selected.length
  summary.reached_older_item = reachedBoundary
  summary.exhausted_page = exhausted
  summary.event_count = selected.length
  if (failure) {
    summary.reason = failure.reason
    summary.error = failure.error
  } else if (!exhausted) {
    summary.reason = "page_budget_exhausted"
  } else {
    summary.status = "event_window_scanned"
  }
  return {
    summary,
    indexDocuments,
    documents: [],
    parses,
    candidates: [],
    events: summary.status === "event_window_scanned" ? selected : [],
  }
}
