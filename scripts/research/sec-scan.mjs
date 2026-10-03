import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { secLinks } from "./api.mjs"
import { assertURL } from "./fetch.mjs"
import { collectWindowDetails, validDay } from "./list-scan.mjs"
import { parseDocument } from "./parser.mjs"
import { safePath } from "./run-state.mjs"
import { fetchWithPolicy } from "./source-policy.mjs"

const PROFILE_ID = "sec-submissions-json-v1"

export function validateSECRoute(channel) {
  const profile = channel.api_profile
  if (
    profile?.id !== PROFILE_ID ||
    !/^\d{1,10}$/.test(String(profile.cik)) ||
    !Array.isArray(profile.forms) ||
    !profile.forms.length ||
    profile.forms.some((form) => typeof form !== "string" || !/^[0-9A-Z/-]{1,12}$/.test(form)) ||
    new Set(profile.forms).size !== profile.forms.length ||
    !Number.isInteger(profile.max_submissions) ||
    profile.max_submissions < 1 ||
    profile.max_submissions > 1100 ||
    !Number.isInteger(profile.max_details) ||
    profile.max_details < 1 ||
    profile.max_details > 100 ||
    [profile.company_filing_article_profile_id, profile.filing_shell_article_profile_id].some(
      (id) => id !== undefined && (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{2,80}$/.test(id)),
    )
  )
    throw Error("Invalid SEC submissions route profile")
  const endpoint = assertURL(channel.url, channel.allowed_hosts)
  if (
    endpoint.hostname !== "data.sec.gov" ||
    endpoint.pathname !== `/submissions/CIK${String(profile.cik).padStart(10, "0")}.json` ||
    endpoint.search ||
    endpoint.hash ||
    !channel.allowed_hosts.includes("www.sec.gov") ||
    !channel.item_pattern
  )
    throw Error("Unexpected SEC submissions endpoint or archive policy")
  return profile
}

export function parseSECSubmissions(payload, channel, { since, until }) {
  const profile = validateSECRoute(channel)
  if (!validDay(since) || !validDay(until) || since >= until)
    throw Error("List scan requires an increasing [since, until) day window")
  const recent = payload?.filings?.recent
  if (
    String(payload?.cik).replace(/^0+/, "") !== String(profile.cik).replace(/^0+/, "") ||
    !payload?.name ||
    !recent ||
    !Array.isArray(recent.accessionNumber) ||
    recent.accessionNumber.length === 0 ||
    recent.accessionNumber.length > profile.max_submissions
  )
    throw Error("SEC submissions response identity or bounded filing list is invalid")
  const keys = ["filingDate", "form", "primaryDocument"]
  if (keys.some((key) => !Array.isArray(recent[key]) || recent[key].length !== recent.accessionNumber.length))
    throw Error("SEC submissions parallel columns mismatch")
  if (recent.accessionNumber.length > profile.max_submissions)
    throw Error("SEC submissions list exceeds its configured bound")
  let previousDay = null
  const seen = new Set()
  for (let index = 0; index < recent.accessionNumber.length; index++) {
    const day = recent.filingDate[index]
    if (
      !validDay(day) ||
      (previousDay && day > previousDay) ||
      seen.has(recent.accessionNumber[index]) ||
      !/^\d{10}-\d{2}-\d{6}$/.test(recent.accessionNumber[index])
    )
      throw Error("SEC submissions dates are invalid, unordered or duplicated")
    previousDay = day
    seen.add(recent.accessionNumber[index])
  }
  if (recent.filingDate.at(-1) >= since)
    throw Error("SEC recent submissions do not reach the beginning of the requested window")
  const forms = new Set(profile.forms)
  const indexes = recent.filingDate
    .map((day, index) => index)
    .filter((index) => forms.has(recent.form[index]))
    .filter((index) => recent.filingDate[index] >= since && recent.filingDate[index] < until)
  const subset = {
    ...payload,
    filings: {
      recent: Object.fromEntries(
        ["accessionNumber", "filingDate", "form", "primaryDocument"].map((key) => [
          key,
          indexes.map((index) => recent[key][index]),
        ]),
      ),
    },
  }
  const links = secLinks(subset, profile.cik)
  const items = links.map((link, n) => {
      const index = indexes[n]
      const url = assertURL(link.url, channel.allowed_hosts)
      if (
        url.hostname !== "www.sec.gov" ||
        !new RegExp(channel.item_pattern).test(url.toString())
      )
        throw Error("SEC filing document is outside the registered archive path")
      return {
        ...link,
        form: recent.form[index],
        profile_id: PROFILE_ID,
        json_pointer: `/filings/recent/${index}`,
        listed_date_text: link.published_at,
      }
    })
  if (items.length > profile.max_details) throw Error("SEC filing detail budget exceeded")
  return { items, scanned_items: recent.accessionNumber.length }
}

export async function scanSECSubmissionsRoute(
  root,
  run,
  fetcher,
  channel,
  articleProfiles,
  { since, until },
  { fetchPolicy = fetchWithPolicy, parse = undefined } = {},
) {
  validateSECRoute(channel)
  const summary = {
    schema: "research-list-scan/v1",
    channel_id: channel.channel_id,
    listing_url: channel.url,
    api_profile_id: PROFILE_ID,
    window: { since, until_exclusive: until },
    status: "incomplete",
    reason: null,
    candidate_published: false,
  }
  const empty = { summary, indexDocuments: [], documents: [], parses: [], candidates: [] }
  if (!validDay(since) || !validDay(until) || since >= until)
    throw Error("List scan requires an increasing [since, until) day window")
  let document
  try {
    document = await run.stage("submissions", { url: channel.url }, () =>
      fetchPolicy(root, fetcher, channel.url, { allowed_hosts: channel.allowed_hosts }),
    )
  } catch (error) {
    return { ...empty, summary: { ...summary, reason: "submissions_fetch_failed", error: error.message } }
  }
  if (!["captured", "not_modified"].includes(document.fetch_status))
    return { ...empty, summary: { ...summary, reason: "submissions_" + document.fetch_status } }
  let parsed
  try {
    if (!/application\/json/i.test(document.mime_type || "")) throw Error("SEC submissions is not JSON")
    const body = fs.readFileSync(safePath(root, document.body_path))
    if (sha256(body) !== document.body_sha256) throw Error("SEC submissions body hash mismatch")
    parsed = parseSECSubmissions(JSON.parse(body.toString("utf8")), channel, { since, until })
  } catch (error) {
    return {
      ...empty,
      indexDocuments: [document],
      summary: { ...summary, reason: "submissions_parse_failed", error: error.message },
    }
  }
  summary.listing_source_version_id = document.source_version_id
  summary.scanned_items = parsed.scanned_items
  summary.window_items = parsed.items.length
  const preflightDocuments = [],
    preflightParses = [],
    preflightDetails = [],
    preflightIssues = [],
    selected = []
  for (const item of parsed.items) {
    if (item.form !== "8-K") {
      selected.push({
        ...item,
        article_profile_id:
          channel.api_profile.company_filing_article_profile_id || "sec-company-filing-en-v1",
        listing_title_authoritative: true,
      })
      continue
    }
    let filingDocument
    const stageIndex = item.json_pointer.slice("/filings/recent/".length)
    try {
      filingDocument = await run.stage("filing-shell-" + stageIndex, { url: item.url }, () =>
        fetchPolicy(root, fetcher, item.url, { allowed_hosts: channel.allowed_hosts }),
      )
      if (!["captured", "not_modified"].includes(filingDocument.fetch_status)) {
        const reason = "filing_shell_" + filingDocument.fetch_status
        preflightIssues.push(reason)
        preflightDetails.push({
          url: item.url,
          listed_at: item.published_at,
          status: reason,
          fetch_status: filingDocument.fetch_status,
        })
        continue
      }
      const filingParse = await run.stage(
        "filing-shell-parse-" + stageIndex,
        { document: filingDocument, options: { language: "en" } },
        () => (parse || parseDocument)(root, filingDocument, { language: "en" }),
      )
      const anchors = new Map()
      for (const link of filingParse.links || []) {
        if (!/press release/i.test(link.text || "")) continue
        const url = assertURL(link.url, channel.allowed_hosts).toString()
        const filingPath = new URL(item.url).pathname.replace(/\/[^/]+$/, "")
        if (!url.startsWith(`https://www.sec.gov${filingPath}/`)) continue
        anchors.set(url, [...(anchors.get(url) || []), link.text.trim()])
      }
      if (anchors.size !== 1) {
        if (anchors.size) {
          const reason = "press_release_exhibit_ambiguous"
          preflightIssues.push(reason)
          preflightDetails.push({
            url: item.url,
            listed_at: item.published_at,
            status: reason,
            source_version_id: filingDocument.source_version_id,
            parse_id: filingParse.parse_id,
          })
          continue
        }
        selected.push({
          ...item,
          text: `${channel.name || channel.publisher_id}: Form ${item.form} filed ${item.published_at}`,
          article_profile_id:
            channel.api_profile.filing_shell_article_profile_id ||
            "sec-tesla-filing-shell-en-v1",
          listing_title_authoritative: true,
          primary_filing_url: item.url,
          primary_filing_source_version_id: filingDocument.source_version_id,
        })
        continue
      }
      preflightDocuments.push(filingDocument)
      preflightParses.push(filingParse)
      const [url, texts] = [...anchors.entries()][0]
      selected.push({
        ...item,
        url,
        text: [...new Set(texts)].join(" "),
        article_profile_id:
          channel.api_profile.company_filing_article_profile_id || "sec-company-filing-en-v1",
        primary_filing_url: item.url,
        primary_filing_source_version_id: filingDocument.source_version_id,
      })
    } catch (error) {
      const reason = "filing_shell_parse_failed"
      preflightIssues.push(reason)
      preflightDetails.push({
        url: item.url,
        listed_at: item.published_at,
        status: reason,
        error: error.message,
      })
    }
  }
  const inspected = await collectWindowDetails(
    root,
    run,
    fetcher,
    channel,
    articleProfiles,
    selected.map((item) => ({
      ...item,
      listing_source_version_id: document.source_version_id,
      discovered_at: document.observed_at,
      discovery_method: "sec-submissions-json",
    })),
    { fetchPolicy, ...(parse ? { parse } : {}) },
  )
  summary.details = [...preflightDetails, ...inspected.details]
  summary.candidate_count = inspected.candidates.length
  summary.status = !preflightIssues.length && inspected.details.every((detail) => detail.status === "source_parsed_unreviewed")
    ? "window_scanned"
    : "incomplete"
  summary.reason = summary.status === "window_scanned" ? null : preflightIssues[0] || "detail_incomplete"
  return {
    summary,
    indexDocuments: [document],
    ...inspected,
    documents: [...preflightDocuments, ...inspected.documents],
    parses: [...preflightParses, ...inspected.parses],
  }
}
