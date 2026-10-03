import fs from "node:fs"
import path from "node:path"
import { SourceFetcher } from "./fetch.mjs"
import { registry } from "./discovery.mjs"
import { collectionBasis } from "./scan-basis.mjs"
import { DEFAULT_ROOT, RunState, atomicWrite, withLock } from "./run-state.mjs"
import {
  validDay,
  loadReusableSinglePageListing,
  scanPathPagesRoute,
  scanSinglePageRoute,
} from "./list-scan.mjs"
import { scanCalendarMonthRoute } from "./monthly-scan.mjs"
import { scanBoundedRSSRoute } from "./rss-scan.mjs"
import { scanPaginatedHDRoute } from "./api-scan.mjs"
import { scanWordPressPostsRoute } from "./wordpress-scan.mjs"
import { scanSECSubmissionsRoute } from "./sec-scan.mjs"
import { scanPaginatedKUKARoute } from "./kuka-scan.mjs"
import { scanPaginatedABBRoute } from "./abb-scan.mjs"
import { scanPaginatedURRoute } from "./ur-scan.mjs"
import { scanFormHTMLRoute } from "./form-html-scan.mjs"
import { intakeCompletedScan, intakePartialScan } from "./scan-completion.mjs"

// Used by the compatibility CLI, standalone collection CLI and daily runner.
// Only acquisition code/settings bind collection checkpoints.
export async function executeListScan(v) {
  if (
    !/^[A-Za-z0-9_-]+$/.test(v.run || "") ||
    v.channel?.length !== 1 ||
    !validDay(v.since) ||
    !validDay(v.until) ||
    v.since >= v.until ||
    v.url?.length
  )
    throw Error("scan-list requires one --channel and a [--since, --until) day window")
  const root = v.root
  if (v["merge-backlog"] && path.resolve(root) !== path.resolve(DEFAULT_ROOT))
    throw Error(
      "A custom research root cannot use --merge-backlog; use daily collection with explicit --backlog",
    )
  const acquisition = JSON.parse(fs.readFileSync("data/research-acquisition.json"))
  const routes = registry(
    JSON.parse(fs.readFileSync("data/research-source-channels.json")),
    JSON.parse(fs.readFileSync("data/research-watchlist.json")),
    acquisition,
  )
  const channel = routes.find((route) => route.channel_id === v.channel[0])
  if (!channel) throw Error("Unknown channel: " + v.channel[0])
  if (channel.onboarding && channel.onboarding.collection_enabled !== true)
    throw Error("Source registration is pending collection configuration: " + channel.channel_id)
  const profiles = acquisition.article_profiles || []
  const basis = collectionBasis(channel, profiles)
  return withLock(root, "run-" + v.run, async () => {
    const run = new RunState(root, v.run, {
      schema: "research-list-run-input/v2",
      channel_id: channel.channel_id,
      since: v.since,
      until_exclusive: v.until,
      reuse_listing_run: v["reuse-listing-run"] || null,
      collection_basis: basis,
    })
    const fetcher = new SourceFetcher(root)
    await run.stage("collection-basis", basis, async () => basis)
    const scanner =
      channel.api_profile?.id === "wordpress-rest-posts-json-v1"
        ? scanWordPressPostsRoute
        : channel.api_profile?.id === "sec-submissions-json-v1"
          ? scanSECSubmissionsRoute
          : channel.api_profile?.id === "ur-news-center-json-pages-v1"
            ? scanPaginatedURRoute
            : ["hd-press-json-pages-v1", "hd-disclosure-json-pages-v1"].includes(
                  channel.api_profile?.id,
                )
              ? scanPaginatedHDRoute
              : channel.api_profile?.id === "kuka-news-form-pages-v1"
                ? scanPaginatedKUKARoute
                : channel.api_profile?.id === "abb-newsbank-json-pages-v1"
                  ? scanPaginatedABBRoute
                  : channel.api_profile?.id === "post-html-fragment-pages-v1"
                    ? scanFormHTMLRoute
                    : channel.api_profile
                      ? null
                      : channel.listing_profile?.pagination === "calendar-month"
                        ? scanCalendarMonthRoute
                        : channel.method === "rss" &&
                            channel.listing_profile?.pagination === "bounded-feed"
                          ? scanBoundedRSSRoute
                          : channel.method === "html-list" &&
                              channel.listing_profile?.pagination === "path-pages"
                            ? scanPathPagesRoute
                            : channel.method === "html-list" &&
                                channel.listing_profile?.pagination === "single-page"
                              ? scanSinglePageRoute
                              : null
    if (!scanner) throw Error("Unknown or unsupported listing route: " + channel.channel_id)
    if (v["reuse-listing-run"] && scanner !== scanSinglePageRoute)
      throw Error("--reuse-listing-run is only supported for single-page HTML routes")
    let listingEvidence = null,
      listingReuseError = null
    if (v["reuse-listing-run"]) {
      try {
        listingEvidence = loadReusableSinglePageListing(root, v["reuse-listing-run"], channel, {
          since: v.since,
          until_exclusive: v.until,
        })
      } catch (error) {
        listingReuseError = error.message
      }
    }
    let result = await scanner(
      root,
      run,
      fetcher,
      channel,
      profiles,
      {
        since: v.since,
        until: v.until,
      },
      { listingEvidence, listingReuseError },
    )
    const archive = channel.listing_profile?.fallback_archive
    if (
      channel.method === "rss" &&
      result.summary?.reason === "feed_cutoff_not_reached" &&
      archive
    ) {
      const archiveChannel = {
        ...channel,
        method: "html-list",
        url: archive.url_template.replace("{page}", "1"),
        parse_options: archive.parse_options,
        listing_profile: {
          pagination: archive.pagination,
          url_template: archive.url_template,
          max_pages: archive.max_pages,
          rule_id: archive.rule_id,
          excluded_categories: archive.excluded_categories || [],
          require_title_match: true,
        },
      }
      const fallback = await scanPathPagesRoute(root, run, fetcher, archiveChannel, profiles, {
        since: v.since,
        until: v.until,
      })
      fallback.summary.fallback = {
        source: "bounded-feed",
        reason: result.summary.reason,
        archive_status: fallback.summary.status,
        archive_reason: fallback.summary.reason,
      }
      result = {
        ...fallback,
        indexDocuments: [...(result.indexDocuments || []), ...(fallback.indexDocuments || [])],
        documents: [...result.documents, ...fallback.documents],
        parses: [...result.parses, ...fallback.parses],
        candidates: fallback.candidates,
      }
    }
    atomicWrite(root, `runs/${v.run}/list-scan.json`, result.summary)
    if (result.indexDocuments)
      atomicWrite(root, `runs/${v.run}/list-pages.json`, result.indexDocuments)
    atomicWrite(root, `runs/${v.run}/documents.json`, result.documents)
    atomicWrite(root, `runs/${v.run}/parses.json`, result.parses)
    atomicWrite(root, `runs/${v.run}/candidates.json`, result.candidates)
    if (result.events)
      atomicWrite(root, `runs/${v.run}/events.json`, {
        schema: "research-scheduled-events/v1",
        events: result.events,
        candidate_published: false,
      })
    const backlogMerge = v["merge-backlog"]
      ? result.summary.status === "incomplete" &&
        result.summary.reason === "detail_incomplete" &&
        result.candidates.length
        ? await intakePartialScan({
            root,
            result,
            runId: v.run,
            backlogFile: ".local/research/candidate-backlog.json",
          })
        : await intakeCompletedScan({
            root,
            result,
            backlogFile: ".local/research/candidate-backlog.json",
          })
      : null
    return {
      channel_id: channel.channel_id,
      status: result.summary.status,
      reason: result.summary.reason,
      candidates: result.candidates.length,
      ...(result.events ? { events: result.events.length } : {}),
      ...(backlogMerge ? { backlog_merge: backlogMerge } : {}),
      candidate_published: false,
    }
  })
}
