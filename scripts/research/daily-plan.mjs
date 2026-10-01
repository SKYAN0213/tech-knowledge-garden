import { validDay } from "./list-scan.mjs"

const supportedApis = new Set([
  "hd-press-json-pages-v1",
  "hd-disclosure-json-pages-v1",
  "kuka-news-form-pages-v1",
  "abb-newsbank-json-pages-v1",
  "ur-news-center-json-pages-v1",
])

export const DEFAULT_DAILY_RETRY_POLICY = Object.freeze({
  max_attempts_per_window: 2,
  blocked_requires_new_observation: true,
})

export function shiftDay(day, amount) {
  if (!validDay(day) || !Number.isInteger(amount))
    throw Error("Valid day and integer shift required")
  const value = new Date(day + "T00:00:00Z")
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}

export function kstDay(instant) {
  const date = new Date(instant)
  if (!Number.isFinite(date.getTime())) throw Error("Valid instant required")
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .filter((part) => ["year", "month", "day"].includes(part.type))
      .map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function validateDailyRoutes(config, routes) {
  if (
    config?.schema !== "research-daily-routes/v1" ||
    !Number.isInteger(config.lookback_days) ||
    config.lookback_days < 1 ||
    config.lookback_days > 30 ||
    !Number.isInteger(config.max_window_days) ||
    config.max_window_days < 1 ||
    config.max_window_days > 31 ||
    !Array.isArray(config.routes) ||
    !config.routes.length
  )
    throw Error("Invalid daily route configuration")
  const byId = new Map(routes.map((route) => [route.channel_id, route]))
  const seen = new Set()
  return config.routes
    .filter((entry) => {
      if (
        !entry ||
        typeof entry.channel_id !== "string" ||
        typeof entry.enabled !== "boolean" ||
        !/^[a-zA-Z0-9_-]+$/.test(entry.baseline_run || "") ||
        seen.has(entry.channel_id)
      )
        throw Error("Invalid or duplicate daily route entry")
      seen.add(entry.channel_id)
      return entry.enabled
    })
    .map((entry) => {
      const route = byId.get(entry.channel_id)
      if (!route) throw Error("Daily route is absent from registry: " + entry.channel_id)
      if (
        !supportedApis.has(route.api_profile?.id) &&
        !(
          route.method === "html-list" &&
          ["single-page", "calendar-month"].includes(route.listing_profile?.pagination)
        ) &&
        !(route.method === "rss" && route.listing_profile?.pagination === "bounded-feed")
      )
        throw Error("Daily route has no complete list scanner: " + entry.channel_id)
      if (
        route.method === "rss" &&
        (!route.listing_profile?.rule_id ||
          !route.listing_profile?.feed_title ||
          !Number.isInteger(route.listing_profile?.max_items) ||
          route.listing_profile.max_items < 1 ||
          typeof route.listing_profile?.guid_is_permalink !== "boolean" ||
          !route.item_pattern ||
          !route.allowed_hosts?.length ||
          !Number.isInteger(route.scan_max_details) ||
          route.scan_max_details < 1)
      )
        throw Error("Daily bounded RSS route is incomplete: " + entry.channel_id)
      if (route.method === "rss" && route.listing_profile?.date_timezone !== undefined) {
        const timeZone = route.listing_profile.date_timezone
        if (typeof timeZone !== "string")
          throw Error("Daily RSS publication time zone is invalid: " + entry.channel_id)
        try {
          new Intl.DateTimeFormat("en-US", { timeZone })
        } catch {
          throw Error("Daily RSS publication time zone is invalid: " + entry.channel_id)
        }
      }
      const fallback = route.listing_profile?.fallback_archive
      if (fallback !== undefined) {
        let fallbackURL
        try {
          fallbackURL = new URL(fallback.url_template.replace("{page}", "1"))
        } catch {
          throw Error("Daily fallback archive URL is invalid: " + entry.channel_id)
        }
        const listingRules = fallback.parse_options?.listing_link_rules
        if (
          route.method !== "rss" ||
          fallback.pagination !== "path-pages" ||
          (fallback.url_template.match(/\{page\}/g) || []).length !== 1 ||
          !Number.isInteger(fallback.max_pages) ||
          fallback.max_pages < 1 ||
          fallback.max_pages > 100 ||
          !fallback.rule_id ||
          !route.allowed_hosts?.includes(fallbackURL.hostname) ||
          !route.item_pattern ||
          !Array.isArray(fallback.excluded_categories) ||
          !fallback.excluded_categories.length ||
          !Array.isArray(listingRules) ||
          !listingRules.some((rule) => rule.id === fallback.rule_id && rule.category_xpath)
        )
          throw Error("Daily fallback archive profile is incomplete: " + entry.channel_id)
      }
      for (const option of ["ignored_categories", "required_categories"]) {
        if (route.method !== "rss" || route.listing_profile?.[option] === undefined) continue
        const categories = route.listing_profile[option]
        if (
          !Array.isArray(categories) ||
          !categories.length ||
          categories.length > 20 ||
          categories.some((category) => typeof category !== "string" || !category.trim()) ||
          new Set(categories).size !== categories.length
        )
          throw Error(`Daily RSS ${option.replace("_", " ")} are invalid: ` + entry.channel_id)
      }
      if (
        route.listing_profile?.pagination === "calendar-month" &&
        (!route.listing_profile.rule_id ||
          !route.listing_profile.url_template?.includes("{year}") ||
          !route.listing_profile.url_template?.includes("{month}") ||
          !route.item_pattern ||
          !route.allowed_hosts?.length)
      )
        throw Error("Daily calendar archive route is incomplete: " + entry.channel_id)
      return { ...entry, route }
    })
}

export function coveredFrontier(anchor, intervals) {
  if (!validDay(anchor)) throw Error("Coverage anchor day required")
  let cursor = anchor
  for (const span of [...intervals].sort((a, b) => a.since.localeCompare(b.since))) {
    if (
      !validDay(span.since) ||
      !validDay(span.until_exclusive) ||
      span.since >= span.until_exclusive
    )
      throw Error("Invalid confirmed coverage interval")
    if (span.since > cursor) break
    if (span.until_exclusive > cursor) cursor = span.until_exclusive
  }
  return cursor
}

export function planDailyWindows({
  runId,
  now,
  cutoff,
  cutoffBasis = "local_vault_unreconciled",
  config,
  activeRoutes,
  coverage,
}) {
  if (!/^[a-zA-Z0-9_-]+$/.test(runId || "")) throw Error("Invalid daily run ID")
  const day = kstDay(now)
  if (!new RegExp(`^daily-${day.replaceAll("-", "")}(?:-[a-zA-Z0-9_-]+)?$`).test(runId))
    throw Error("Daily run ID must match the Asia/Seoul execution day")
  const cutoffDay = kstDay(cutoff)
  const until = shiftDay(day, 1)
  const recentSince = shiftDay(day, -config.lookback_days)
  const windows = []
  for (const { channel_id, baseline_run } of activeRoutes) {
    const state = coverage?.routes?.[channel_id]
    const candidates = [recentSince]
    if (state?.last_contiguous_until)
      candidates.push(shiftDay(state.last_contiguous_until, -config.lookback_days))
    else candidates.push(shiftDay(cutoffDay, -config.lookback_days))
    for (const gap of state?.unresolved || []) candidates.push(gap.since)
    let since = candidates.sort()[0]
    if (since >= until) throw Error("Daily route window ends before its start")
    while (since < until) {
      const end = [shiftDay(since, config.max_window_days), until].sort()[0]
      windows.push({ channel_id, baseline_run, since, until_exclusive: end })
      since = end
    }
  }
  return {
    schema: "research-daily-plan/v1",
    run_id: runId,
    kst_day: day,
    cutoff,
    cutoff_basis: cutoffBasis,
    retry_policy: DEFAULT_DAILY_RETRY_POLICY,
    windows,
  }
}
