import fs from "node:fs"
import path from "node:path"
import RSSParser from "rss-parser"
import { canonicalURL } from "../garden.mjs"
import { SECTORS } from "../sectors.mjs"
import { parseDocument } from "./parser.mjs"
import { assertURL } from "./fetch.mjs"
import { atomicWrite, readJSON, withLock } from "./run-state.mjs"
import { sourceId, sha256 } from "./contracts.mjs"
import { checkRobots } from "./robots.mjs"
import { createRedirectAuthorizer } from "./source-policy.mjs"
import { crossrefLinks, secLinks } from "./api.mjs"
import { resolveSourceRecipe } from "./source-recipes.mjs"

export function mergeUniqueDiscovery(...groups) {
  const seen = new Set()
  const merged = []
  for (const entry of groups.flat()) {
    const fingerprint = JSON.stringify(entry)
    if (seen.has(fingerprint)) continue
    seen.add(fingerprint)
    merged.push(entry)
  }
  return merged
}

function sourceRecordIdentityKeys(candidate) {
  const records = [...(candidate?.discovery || []), ...(candidate?.source_record_aliases || [])]
  return new Set(
    records
      .filter(
        (record) =>
          typeof record.publisher_id === "string" &&
          record.publisher_id.trim() &&
          typeof record.profile_id === "string" &&
          record.profile_id.trim() &&
          typeof record.source_item_id === "string" &&
          record.source_item_id.trim(),
      )
      .map((record) =>
        JSON.stringify([
          record.publisher_id.trim().toLowerCase(),
          record.profile_id.trim(),
          record.source_item_id.trim(),
        ]),
      ),
  )
}

export function registry(channels, watchlist, adapters = {}, recipes) {
  const methods = new Set(["html-list", "rss", "crossref", "sec"])
  const languages = new Set(["ko", "en", "ja", "zh", "de"])
  const sourceKinds = new Set([
    "company",
    "filing-ir",
    "research",
    "commercialization",
    "industry-press",
    "industry-body",
    "regulator",
  ])
  const validate = (c) => {
    if (
      !/^[a-zA-Z0-9_-]+$/.test(c.channel_id) ||
      !languages.has(c.language) ||
      !methods.has(c.method) ||
      !["국내", "해외"].includes(c.region) ||
      !["기술·제품", "기업·운영"].includes(c.axis) ||
      (c.kind && !sourceKinds.has(c.kind)) ||
      (c.onboarding !== undefined &&
        (!c.onboarding ||
          !["registered", "configured", "verified"].includes(c.onboarding.status) ||
          typeof c.onboarding.collection_enabled !== "boolean" ||
          (c.onboarding.status === "registered" && c.onboarding.collection_enabled) ||
          (c.onboarding.status === "verified" && !c.onboarding.collection_enabled))) ||
      (c.request_interval_ms !== undefined &&
        (!Number.isSafeInteger(c.request_interval_ms) ||
          c.request_interval_ms < 0 ||
          c.request_interval_ms > 60000)) ||
      !Array.isArray(c.sectors) ||
      !c.sectors.length ||
      c.sectors.some((s) => !SECTORS.includes(s)) ||
      (c.coverage_sectors !== undefined &&
        (!Array.isArray(c.coverage_sectors) ||
          !c.coverage_sectors.length ||
          c.coverage_sectors.some((s) => !SECTORS.includes(s))))
    )
      throw Error("Invalid source route contract")
    assertURL(c.url, c.allowed_hosts)
    return c
  }
  const result = channels.channels.map((source) => {
    const c = resolveSourceRecipe(source, recipes)
    return validate({
      ...c,
      channel_id: c.id,
      publisher_id: new URL(c.url).hostname.replace(/^www\./, ""),
      seed_urls: [c.url],
      method: c.method || "html-list",
      region: c.region || (c.language === "ko" ? "국내" : "해외"),
      axis: c.axis || (c.kind === "filing-ir" ? "기업·운영" : "기술·제품"),
      verification: "unverified",
      entity_ids: [],
      watch_groups: [],
      registered_route_ids: [],
    })
  })
  for (const group of ["companies", "institutions", "robot_manufacturers"])
    for (const c of watchlist[group] || []) {
      if (!/^[a-zA-Z0-9_-]+$/.test(c.id)) throw Error("Invalid watch route identity")
      const descriptors = c.source_routes || []
      if (
        !Array.isArray(descriptors) ||
        new Set(descriptors.map((d) => d.route_id)).size !== descriptors.length ||
        new Set(descriptors.map((d) => canonicalURL(d.url))).size !== descriptors.length
      )
        throw Error("Ambiguous source route descriptors")
      for (const d of descriptors) {
        if (
          !/^[a-zA-Z0-9_-]+$/.test(d.route_id) ||
          !(c.source_urls || []).some((u) => canonicalURL(u) === canonicalURL(d.url))
        )
          throw Error("Source route descriptor must belong to source_urls")
        validate({
          ...d,
          channel_id: d.route_id,
          region: c.region,
          sectors: c.sector ? [c.sector] : c.sectors || ["로봇·제조"],
        })
      }
      for (const [n, url] of (c.source_urls || []).entries()) {
        const descriptor = descriptors.find((d) => canonicalURL(d.url) === canonicalURL(url))
        const existing = result.find((r) => canonicalURL(r.url) === canonicalURL(url))
        const metadata = descriptor
          ? {
              language: descriptor.language,
              axis: descriptor.axis,
              kind: descriptor.kind,
              method: descriptor.method,
              allowed_hosts: descriptor.allowed_hosts,
              api_profile: descriptor.api_profile,
              item_pattern: descriptor.item_pattern,
              region: c.region,
            }
          : c.source_kind
            ? { kind: c.source_kind }
            : {}
        if (existing) {
          if (descriptor) Object.assign(existing, metadata)
          existing.entity_ids = [...new Set([...existing.entity_ids, c.id])]
          existing.watch_groups = [...new Set([...existing.watch_groups, group])]
          if (descriptor)
            existing.registered_route_ids = [
              ...new Set([...existing.registered_route_ids, descriptor.route_id]),
            ]
          continue
        }
        result.push(
          validate({
            // Keep established positional IDs; new described routes have stable identities
            // even when the company already belongs to another watch group.
            channel_id: descriptor ? `route-${descriptor.route_id}` : `watch-${c.id}-${n}`,
            publisher_id: c.id,
            name: c.name,
            url,
            seed_urls: [url],
            method: "html-list",
            language: c.language || (c.region === "국내" ? "ko" : "en"),
            region: c.region,
            axis: "기업·운영",
            sectors: c.sector ? [c.sector] : c.sectors || ["로봇·제조"],
            verification: "unverified",
            entity_ids: [c.id],
            watch_groups: [group],
            registered_route_ids: descriptor ? [descriptor.route_id] : [],
            ...metadata,
          }),
        )
      }
    }
  if (new Set(result.map((r) => r.channel_id)).size !== result.length)
    throw Error("Duplicate source route identities")
  return result.map((c) =>
    validate({ ...c, ...resolveSourceRecipe(adapters[c.channel_id] || {}, recipes) }),
  )
}
export function coverageGrid(routes) {
  return SECTORS.flatMap((sector) =>
    ["국내", "해외"].flatMap((region) =>
      ["기술·제품", "기업·운영"].map((axis) => {
        const attempts = routes.filter(
          (r) =>
            [...new Set([...(r.sectors || []), ...(r.coverage_sectors || [])])].includes(sector) &&
            r.region === region &&
            r.axis === axis,
        )
        const usable = attempts.filter((r) => r.status === "partial")
        return {
          sector,
          region,
          axis,
          status: !attempts.length ? "not_attempted" : usable.length ? "partial" : "failed",
          route_ids: attempts.map((r) => r.channel_id),
          failed_route_ids: attempts.filter((r) => r.status !== "partial").map((r) => r.channel_id),
          usable_route_count: usable.length,
        }
      }),
    ),
  )
}
export function candidatesFromLinks(links, channel, now) {
  const seen = new Set(),
    result = []
  const pattern = channel.item_pattern
    ? new RegExp(channel.item_pattern)
    : /(?:\/20\d\d\/[^/]+|\/(?:news|press|article|release|notice)(?:s|-releases)?\/[^/]+(?:\/[^/]+)?|\.pdf(?:$|\?))/i
  for (const l of links) {
    if (!l.text?.trim() || l.text.length < 8) continue
    let url
    try {
      url = canonicalURL(l.url)
      assertURL(url)
    } catch {
      continue
    }
    const parsedURL = new URL(url)
    const queryIdentity = channel.listing_profile?.article_identity_query_parameter
    const articleOnIndexPath =
      Boolean(channel.item_pattern) &&
      typeof queryIdentity === "string" &&
      Boolean(parsedURL.searchParams.get(queryIdentity))
    if (
      seen.has(url) ||
      canonicalURL(channel.url) === url ||
      /\/(?:index\.html?|topics?|categories|tag)\/?$/i.test(url) ||
      (!articleOnIndexPath &&
        /\/(?:news-center|newsroom|press-room|press-releases?|news|publications)\/?$/i.test(
          parsedURL.pathname,
        )) ||
      !pattern.test(url)
    )
      continue
    if (channel.allowed_hosts && !channel.allowed_hosts.includes(new URL(url).hostname)) continue
    seen.add(url)
    result.push({
      key: "source-" + sourceId(url),
      title: l.text.slice(0, 400),
      source_urls: [url],
      source_published_at: l.published_at || null,
      discovered_at: now,
      review_status: "unreviewed",
      priority: "normal",
      discovery: [
        {
          channel_id: channel.channel_id,
          publisher_id: channel.publisher_id,
          method: channel.method,
          language: channel.language,
          discovered_at: now,
          ...(channel.source_version_id ? { source_version_id: channel.source_version_id } : {}),
          ...(channel.parse_id ? { parse_id: channel.parse_id } : {}),
          ...(l.dom_path ? { dom_path: l.dom_path } : {}),
          ...(l.json_pointer ? { json_pointer: l.json_pointer } : {}),
          ...(typeof l.source_item_id === "string" ? { source_item_id: l.source_item_id } : {}),
          ...(l.profile_id ? { profile_id: l.profile_id } : {}),
          ...(l.article_profile_id ? { article_profile_id: l.article_profile_id } : {}),
          ...(l.event_date_requires_review === true ? { event_date_requires_review: true } : {}),
          ...(typeof l.primary_filing_url === "string"
            ? { primary_filing_url: l.primary_filing_url }
            : {}),
          ...(typeof l.primary_filing_source_version_id === "string"
            ? { primary_filing_source_version_id: l.primary_filing_source_version_id }
            : {}),
          ...(channel.search_scope ? { search_scope: channel.search_scope } : {}),
          ...(channel.search_entity_id ? { search_entity_id: channel.search_entity_id } : {}),
          ...(channel.query_slot_id ? { query_slot_id: channel.query_slot_id } : {}),
          ...(channel.target_source_channel_id
            ? { target_source_channel_id: channel.target_source_channel_id }
            : {}),
          ...(channel.target_source_url ? { target_source_url: channel.target_source_url } : {}),
          ...(channel.target_source_type ? { target_source_type: channel.target_source_type } : {}),
          ...(l.text ? { result_title: l.text.slice(0, 400) } : {}),
        },
      ],
      sectors: channel.sectors,
      region: channel.region,
      axis: channel.axis,
    })
  }
  return result.slice(0, channel.max_items || 25)
}
export async function discoverChannel(root, fetcher, channel) {
  const now = new Date().toISOString(),
    record = {
      channel_id: channel.channel_id,
      sectors: channel.sectors,
      region: channel.region,
      axis: channel.axis,
      checked_at: now,
      status: "failed",
      candidates: [],
    }
  if (channel.onboarding && channel.onboarding.collection_enabled !== true)
    return { ...record, status: "registration_pending" }
  try {
    const allowed_hosts = channel.allowed_hosts || [new URL(channel.url).hostname]
    const policy = await checkRobots(root, fetcher, channel.url, { allowed_hosts })
    if (!policy.allowed) return { ...record, status: "policy_blocked" }
    fetcher.options.interval_ms = Math.max(fetcher.options.interval_ms, policy.delay_ms)
    const document = await fetcher.fetch(channel.url, {
      allowed_hosts,
      authorize_redirect: createRedirectAuthorizer(root, fetcher, allowed_hosts),
    })
    record.fetch_status = document.fetch_status
    record.final_url = document.final_url
    if (document.redirect_chain?.some((hop) => hop.policy_status !== "allowed"))
      record.policy_status = document.redirect_chain.find(
        (hop) => hop.policy_status !== "allowed",
      )?.policy_status
    if (!["captured", "not_modified"].includes(document.fetch_status))
      return { ...record, status: document.fetch_status }
    let links
    if (channel.method === "crossref" || channel.method === "sec") {
      const data = JSON.parse(fs.readFileSync(path.resolve(root, document.body_path), "utf8"))
      links = channel.method === "crossref" ? crossrefLinks(data) : secLinks(data, channel.cik)
    } else if (channel.method === "rss" || /(?:rss|atom|xml)/i.test(document.mime_type)) {
      const xml = fs.readFileSync(path.resolve(root, document.body_path), "utf8")
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error("RSS external entities prohibited")
      const feed = await new RSSParser().parseString(xml)
      links = feed.items
        .map((i) => ({ url: i.link, text: i.title, published_at: i.isoDate || null }))
        .filter((i) => i.url)
    } else {
      const parse = await parseDocument(root, document, {
        language: channel.language,
        ...(channel.parse_options || {}),
      })
      if (["blocked", "unsupported", "failed"].includes(parse.status))
        return { ...record, status: parse.status }
      links = parse.links || []
      record.parse_id = parse.parse_id
      record.link_profiles = parse.link_profiles || []
    }
    const candidates = candidatesFromLinks(
      links,
      { ...channel, parse_id: record.parse_id, source_version_id: document.source_version_id },
      now,
    )
    // A read of one page does not establish full pagination/search coverage.
    return {
      ...record,
      status: "partial",
      source_version_id: document.source_version_id,
      candidates,
      discovered_count: candidates.length,
    }
  } catch (e) {
    return { ...record, error: e.message }
  }
}
export async function mergeBacklog(file, candidates) {
  const root = path.dirname(file),
    relative = path.basename(file)
  return withLock(root, "candidate-backlog", async () => {
    const existing = readJSON(root, relative)
    const current = existing || { schema: "research-candidates/v1", candidates: [] }
    if (current.schema !== "research-candidates/v1" || !Array.isArray(current.candidates))
      throw Error("Unsupported existing backlog")
    let changed = !existing
    for (const c of candidates) {
      if (
        c.article_source_version_id &&
        (!/^[a-f0-9]{20}:[a-f0-9]{64}$/.test(c.article_source_version_id) ||
          !Number.isFinite(Date.parse(c.article_observed_at || c.discovered_at)))
      )
        throw Error("Article source version and observation timestamp required")
      if (
        c.article_content_sha256 &&
        (!c.article_source_version_id || !/^[a-f0-9]{64}$/.test(c.article_content_sha256))
      )
        throw Error("Article content fingerprint requires a captured source version")
      const normalized = c.source_urls.map(canonicalURL)
      const incomingRecordKeys = sourceRecordIdentityKeys(c)
      const matches = current.candidates.filter((old) => {
        if (
          old.key === c.key ||
          old.source_urls.some((url) => normalized.includes(canonicalURL(url)))
        )
          return true
        const existingRecordKeys = sourceRecordIdentityKeys(old)
        return [...incomingRecordKeys].some((key) => existingRecordKeys.has(key))
      })
      if (matches.length > 1) throw Error("Discovery combines existing candidates")
      const old = matches[0]
      if (old) {
        const before = JSON.stringify(old)
        const existingRecordKeys = sourceRecordIdentityKeys(old)
        const matchedSourceRecordKeys = new Set(
          [...incomingRecordKeys].filter((key) => existingRecordKeys.has(key)),
        )
        if (
          old.review_status === "unreviewed" &&
          c.article_source_version_id &&
          c.article_parse_id &&
          c.article_content_sha256 &&
          typeof c.title === "string" &&
          c.title.trim() &&
          old.title !== c.title
        )
          old.title = c.title
        old.discovery = mergeUniqueDiscovery(old.discovery || [], c.discovery || [])
        if (
          old.key !== c.key &&
          !old.source_urls.some((url) => normalized.includes(canonicalURL(url)))
        ) {
          const matchedRecords = (c.discovery || [])
            .filter((record) => {
              const identity = sourceRecordIdentityKeys({ discovery: [record] })
              return [...identity].some((key) => matchedSourceRecordKeys.has(key))
            })
            .map((record) => ({
              publisher_id: record.publisher_id,
              profile_id: record.profile_id,
              source_item_id: record.source_item_id,
              source_url: normalized[0],
              discovered_at: record.discovered_at || c.discovered_at,
            }))
          old.source_record_aliases = mergeUniqueDiscovery(
            old.source_record_aliases || [],
            matchedRecords,
          )
        }
        const latestDiscovery = [old.last_discovered_at, old.discovered_at, c.discovered_at]
          .filter(Boolean)
          .sort()
          .at(-1)
        if (old.last_discovered_at || latestDiscovery !== old.discovered_at)
          old.last_discovered_at = latestDiscovery
        // A listing page version cannot invalidate an editorial decision.
        // Compare parsed detail content, or conservatively use source/parse
        // versions when the older decision has no comparable fingerprint.
        if (c.article_source_version_id) {
          const observedAt = c.article_observed_at || c.discovered_at
          const previousObservedAt = old.article_observed_at || old.discovered_at
          const observedMs = Date.parse(observedAt)
          const previousMs = previousObservedAt ? Date.parse(previousObservedAt) : null
          if (previousObservedAt && !Number.isFinite(previousMs))
            throw Error("Existing article observation timestamp is invalid")
          const previousVersion =
            old.article_source_version_id || old.disposition?.source_version_id
          const previousContent =
            old.article_content_sha256 || old.disposition?.article_content_sha256
          const reviewedVersion =
            old.disposition?.source_version_id || old.identity?.source_version_id || previousVersion
          const reviewedContent =
            old.disposition?.article_content_sha256 ||
            old.identity?.article_content_sha256 ||
            previousContent
          const reviewedParse =
            old.disposition?.parse_id || old.identity?.parse_id || old.article_parse_id
          const comparableContent = Boolean(previousContent && c.article_content_sha256)
          if (
            previousObservedAt &&
            observedMs === previousMs &&
            ((comparableContent && previousContent !== c.article_content_sha256) ||
              (previousVersion !== c.article_source_version_id && !comparableContent))
          )
            throw Error("Conflicting article versions at the same observation time")
          if (!previousObservedAt || observedMs >= previousMs) {
            const contentCompared = Boolean(reviewedContent && c.article_content_sha256)
            const changeBasis = contentCompared
              ? reviewedContent !== c.article_content_sha256
                ? "content"
                : null
              : reviewedVersion !== c.article_source_version_id
                ? "raw_source"
                : reviewedParse && c.article_parse_id && reviewedParse !== c.article_parse_id
                  ? "parse_version"
                  : null
            if (
              changeBasis &&
              (old.review_status === "rejected" ||
                (old.review_status === "verified" && old.identity))
            ) {
              if (old.review_status === "rejected") {
                old.disposition_history = [
                  ...(old.disposition_history || []),
                  {
                    review_status: "rejected",
                    ...(old.disposition || {}),
                    reason: old.reason,
                    reviewed_at: old.reviewed_at || null,
                  },
                ]
                delete old.disposition
              } else {
                old.identity_history = [
                  ...(old.identity_history || []),
                  {
                    review_status: "verified",
                    ...old.identity,
                    reviewed_at: old.reviewed_at || null,
                  },
                ]
                delete old.identity
              }
              old.review_status = "deferred"
              old.reason = {
                content: "기사 내용 변경 재검토 필요",
                raw_source: "원문 판본 변경 재검토 필요",
                parse_version: "파싱 판본 변경 재검토 필요",
              }[changeBasis]
              old.source_revision_alert = {
                change_basis: changeBasis,
                previous_source_version_id: previousVersion || null,
                current_source_version_id: c.article_source_version_id,
                previous_content_sha256: reviewedContent || null,
                current_content_sha256: c.article_content_sha256 || null,
                detected_at: observedAt,
              }
            } else if (
              old.review_status === "deferred" &&
              old.source_revision_alert &&
              (previousVersion !== c.article_source_version_id ||
                previousContent !== c.article_content_sha256)
            ) {
              old.source_revision_alert.current_source_version_id = c.article_source_version_id
              old.source_revision_alert.current_content_sha256 = c.article_content_sha256 || null
              old.source_revision_alert.detected_at = observedAt
            }
            old.article_source_version_id = c.article_source_version_id
            old.article_observed_at = observedAt
            if (c.article_parse_id) old.article_parse_id = c.article_parse_id
            if (c.article_content_sha256) old.article_content_sha256 = c.article_content_sha256
            else if (previousVersion !== c.article_source_version_id)
              delete old.article_content_sha256
          }
        }
        // Preserve a reviewed title, fixed event ID and original discovery time.
        if (JSON.stringify(old) !== before) changed = true
      } else {
        current.candidates.push(c)
        changed = true
      }
    }
    if (changed) {
      current.updated_at = new Date().toISOString()
      atomicWrite(root, relative, current)
    }
    return {
      candidates: current.candidates.length,
      sha256: sha256(JSON.stringify(current)),
      changed,
    }
  })
}
