import test from "node:test"
import assert from "node:assert/strict"
import {
  coveredFrontier,
  kstDay,
  planDailyWindows,
  shiftDay,
  validateDailyRoutes,
} from "../scripts/research/daily-plan.mjs"

const route = {
  channel_id: "fanuc-en",
  method: "html-list",
  listing_profile: { pagination: "single-page" },
}
const config = {
  schema: "research-daily-routes/v1",
  lookback_days: 7,
  max_window_days: 7,
  routes: [{ channel_id: "fanuc-en", enabled: true, baseline_run: "baseline_1" }],
}

test("daily dates follow the Korean calendar and windows retain the seven-day overlap", () => {
  assert.equal(kstDay("2026-09-28T15:00:00Z"), "2026-09-29")
  assert.equal(shiftDay("2026-09-29", 1), "2026-09-30")
  const activeRoutes = validateDailyRoutes(config, [route])
  const plan = planDailyWindows({
    runId: "daily-20260929",
    now: "2026-09-29T00:00:00Z",
    cutoff: "2026-09-23T08:00:00+09:00",
    config,
    activeRoutes,
    coverage: {
      routes: {
        "fanuc-en": {
          last_contiguous_until: "2026-09-28",
          unresolved: [],
        },
      },
    },
  })
  assert.deepEqual(
    plan.windows.map(({ since, until_exclusive }) => [since, until_exclusive]),
    [
      ["2026-09-21", "2026-09-28"],
      ["2026-09-28", "2026-09-30"],
    ],
  )
  assert.equal(plan.cutoff_basis, "local_vault_unreconciled")
})

test("a missed interval remains in the next plan even when later dates were scanned", () => {
  const activeRoutes = validateDailyRoutes(config, [route])
  const plan = planDailyWindows({
    runId: "daily-20260929",
    now: "2026-09-29T00:00:00Z",
    cutoff: "2026-09-23T08:00:00+09:00",
    config,
    activeRoutes,
    coverage: {
      routes: {
        "fanuc-en": {
          last_contiguous_until: "2026-09-24",
          unresolved: [{ since: "2026-09-18", until_exclusive: "2026-09-21" }],
        },
      },
    },
  })
  assert.equal(plan.windows[0].since, "2026-09-17")
  assert.equal(plan.windows.at(-1).until_exclusive, "2026-09-30")
  assert.equal(
    coveredFrontier("2026-09-01", [
      { since: "2026-09-01", until_exclusive: "2026-09-18" },
      { since: "2026-09-21", until_exclusive: "2026-09-30" },
    ]),
    "2026-09-18",
  )
})

test("unsupported, duplicate and wrong-day routes cannot enter the daily plan", () => {
  assert.throws(
    () => validateDailyRoutes({ ...config, routes: [...config.routes, ...config.routes] }, [route]),
    /duplicate/,
  )
  assert.throws(
    () => validateDailyRoutes(config, [{ ...route, listing_profile: undefined }]),
    /no complete list scanner/,
  )
  assert.throws(
    () =>
      planDailyWindows({
        runId: "daily-20260928",
        now: "2026-09-29T00:00:00Z",
        cutoff: "2026-09-23T08:00:00+09:00",
        config,
        activeRoutes: validateDailyRoutes(config, [route]),
        coverage: null,
      }),
    /must match/,
  )
})

test("calendar archive routes require an explicit complete listing contract", () => {
  const calendarConfig = {
    ...config,
    routes: [{ channel_id: "github-changelog", enabled: true, baseline_run: "archive_baseline" }],
  }
  const calendarRoute = {
    channel_id: "github-changelog",
    method: "html-list",
    item_pattern: "^https://github\\.blog/changelog/",
    allowed_hosts: ["github.blog"],
    listing_profile: {
      pagination: "calendar-month",
      rule_id: "github-changelog-month-v1",
      url_template: "https://github.blog/changelog/{year}/{month}/",
    },
  }
  assert.equal(validateDailyRoutes(calendarConfig, [calendarRoute]).length, 1)
  for (const broken of [
    { ...calendarRoute, item_pattern: undefined },
    { ...calendarRoute, listing_profile: { ...calendarRoute.listing_profile, rule_id: undefined } },
    {
      ...calendarRoute,
      listing_profile: {
        ...calendarRoute.listing_profile,
        url_template: "https://github.blog/changelog/{year}/",
      },
    },
  ]) {
    assert.throws(
      () => validateDailyRoutes(calendarConfig, [broken]),
      /calendar archive route is incomplete/,
    )
  }
})

test("bounded RSS routes need an explicit item, identity, and detail budget contract", () => {
  const rssConfig = {
    ...config,
    routes: [{ channel_id: "official-feed", enabled: true, baseline_run: "feed_baseline" }],
  }
  const rssRoute = {
    channel_id: "official-feed",
    method: "rss",
    item_pattern: "^https://example.com/articles/",
    allowed_hosts: ["example.com"],
    scan_max_details: 20,
    listing_profile: {
      pagination: "bounded-feed",
      rule_id: "official-feed-v1",
      feed_title: "Official Feed",
      max_items: 50,
      guid_is_permalink: true,
    },
  }
  assert.equal(validateDailyRoutes(rssConfig, [rssRoute]).length, 1)
  for (const broken of [
    { ...rssRoute, item_pattern: undefined },
    { ...rssRoute, scan_max_details: undefined },
    { ...rssRoute, listing_profile: { ...rssRoute.listing_profile, feed_title: undefined } },
    { ...rssRoute, listing_profile: { ...rssRoute.listing_profile, max_items: 0 } },
  ])
    assert.throws(() => validateDailyRoutes(rssConfig, [broken]), /bounded RSS route is incomplete/)
  assert.equal(
    validateDailyRoutes(rssConfig, [
      {
        ...rssRoute,
        listing_profile: { ...rssRoute.listing_profile, date_timezone: "Asia/Seoul" },
      },
    ]).length,
    1,
  )
  for (const date_timezone of ["Not/AZone", 7])
    assert.throws(
      () =>
        validateDailyRoutes(rssConfig, [
          { ...rssRoute, listing_profile: { ...rssRoute.listing_profile, date_timezone } },
        ]),
      /publication time zone is invalid/,
    )
  assert.equal(
    validateDailyRoutes(rssConfig, [
      {
        ...rssRoute,
        listing_profile: { ...rssRoute.listing_profile, ignored_categories: ["Media"] },
      },
    ]).length,
    1,
  )
  for (const ignored_categories of [[], ["Media", "Media"], [7]])
    assert.throws(
      () =>
        validateDailyRoutes(rssConfig, [
          { ...rssRoute, listing_profile: { ...rssRoute.listing_profile, ignored_categories } },
        ]),
      /ignored categories are invalid/,
    )
  assert.equal(
    validateDailyRoutes(rssConfig, [
      {
        ...rssRoute,
        listing_profile: { ...rssRoute.listing_profile, required_categories: ["Public"] },
      },
    ]).length,
    1,
  )
  for (const required_categories of [[], ["Public", "Public"], [7]])
    assert.throws(
      () =>
        validateDailyRoutes(rssConfig, [
          { ...rssRoute, listing_profile: { ...rssRoute.listing_profile, required_categories } },
        ]),
      /required categories are invalid/,
    )
})
