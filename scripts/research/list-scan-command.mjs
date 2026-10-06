import fs from "node:fs"
import path from "node:path"
import { SourceFetcher } from "./fetch.mjs"
import { registry } from "./discovery.mjs"
import { collectionBasis } from "./scan-basis.mjs"
import { DEFAULT_ROOT, RunState, atomicWrite, readJSON, withLock } from "./run-state.mjs"
import { loadStoredSourceRun } from "./parser.mjs"
import { assertURL } from "./fetch.mjs"
import { fetchWithPolicy } from "./source-policy.mjs"
import { sha256 } from "./contracts.mjs"
import { verifyStoredPartialCandidates } from "./scan-evidence.mjs"

// Reuse bytes from the same window without advancing their observation
// time or reusing a previous coverage judgment or approval.
export function createArchiveSourceReuse(
  root,
  sourceRun,
  channel,
  basis,
  window,
  { now = Date.now(), fetchPolicy = fetchWithPolicy, detailRepair = false } = {},
) {
  if (!/^[A-Za-z0-9_-]+$/.test(sourceRun || "")) throw Error("Exact archive source run required")
  const previous = readJSON(root, `runs/${sourceRun}/state.json`)
  const summary = readJSON(root, `runs/${sourceRun}/list-scan.json`)
  const old = readJSON(root, `runs/${sourceRun}/collection-basis.json`)
  const earlierReuse = readJSON(root, `runs/${sourceRun}/archive-reuse.json`)
  const earlierRepair = readJSON(root, `runs/${sourceRun}/detail-repair-reuse.json`)
  // The worker only parses saved bytes. A repair runs the current parser again;
  // network policy and route dependencies must still match the original scan.
  const fetchDependencies = (dependencies) =>
    Object.fromEntries(
      Object.entries(dependencies || {}).filter(
        ([file]) => !detailRepair || file !== "integrations/research-worker/worker.py",
      ),
    )
  const input = {
    schema: "research-list-run-input/v2",
    channel_id: summary?.channel_id,
    since: summary?.window?.since,
    until_exclusive: summary?.window?.until_exclusive,
    reuse_listing_run: summary?.listing_reused_from_run || null,
    collection_basis: old,
    ...(earlierReuse ? { reuse_source_run: earlierReuse.source_run?.source_run } : {}),
    ...(earlierRepair ? { repair_source_run: earlierRepair.source_run?.source_run } : {}),
  }
  if (
    !previous ||
    previous.input_hash !== sha256(JSON.stringify(input)) ||
    summary?.channel_id !== channel.channel_id ||
    summary.window.since !== window.since ||
    summary.window.until_exclusive !== window.until ||
    (!detailRepair && summary?.pagination !== "path-pages") ||
    !(
      summary.status === "window_scanned" ||
      (summary.status === "incomplete" &&
        [
          "archive_cutoff_not_reached",
          "detail_budget_exceeded",
          "archive_date_resolution_budget_exceeded",
          "detail_incomplete",
        ].includes(summary.reason))
    ) ||
    JSON.stringify(fetchDependencies(old?.dependencies)) !==
      JSON.stringify(fetchDependencies(basis.dependencies)) ||
    (!detailRepair && old?.implementation?.parser_sha256 !== basis.implementation.parser_sha256) ||
    (!detailRepair && old?.article_profiles_sha256 !== basis.article_profiles_sha256) ||
    (detailRepair &&
      (!/^[a-f0-9]{64}$/.test(old?.route_sha256 || "") || old.route_sha256 !== basis.route_sha256))
  )
    throw Error("Archive reuse requires the same window and unchanged fetch/parser dependencies")
  const stored = loadStoredSourceRun(root, sourceRun)
  if (detailRepair) {
    verifyStoredPartialCandidates(
      root,
      {
        ...stored,
        summary,
        candidates: readJSON(root, `runs/${sourceRun}/candidates.json`),
        indexDocuments: readJSON(root, `runs/${sourceRun}/list-pages.json`) || [],
      },
      {
        channel_id: channel.channel_id,
        since: window.since,
        until_exclusive: window.until,
      },
    )
    stored.identity = {
      ...stored.identity,
      summary_sha256: sha256(JSON.stringify(summary)),
      candidates_sha256: sha256(
        JSON.stringify(readJSON(root, `runs/${sourceRun}/candidates.json`)),
      ),
    }
  }
  const available = new Map(),
    used = new Map()
  for (const doc of stored.documents) {
    if (!["captured", "not_modified"].includes(doc.fetch_status)) continue
    const age = now - Date.parse(doc.observed_at)
    if (
      !Number.isFinite(age) ||
      age < -60000 ||
      (!detailRepair && age > 3600000) ||
      doc.policy_status !== "checked" ||
      doc.policy?.allowed !== true
    )
      throw Error("Archive source reuse needs recent policy-checked observations")
    assertURL(doc.original_url, channel.allowed_hosts)
    assertURL(doc.final_url, channel.allowed_hosts)
    const prior = available.get(doc.original_url)
    if (prior && prior.source_version_id !== doc.source_version_id)
      throw Error("Archive reuse source URL has conflicting versions")
    available.set(doc.original_url, doc)
  }
  return {
    reference: stored.identity,
    ...(detailRepair ? { detailRepair: true } : {}),
    available,
    used,
    fetchPolicy: async (root, fetcher, url, options) => {
      assertURL(url, options.allowed_hosts)
      const doc = available.get(url)
      if (!doc) return fetchPolicy(root, fetcher, url, options)
      used.set(url, { url, source_version_id: doc.source_version_id, observed_at: doc.observed_at })
      return doc
    },
  }
}

export function preserveArchiveReuseReceipt(root, runId, reuse) {
  const relative = `runs/${runId}/${reuse.detailRepair ? "detail-repair-reuse" : "archive-reuse"}.json`
  const existing = readJSON(root, relative)
  if (existing && JSON.stringify(existing.source_run) !== JSON.stringify(reuse.reference))
    throw Error("Archive reuse receipt source changed")
  const sources = new Map((existing?.reused_sources || []).map((item) => [item.url, item]))
  for (const item of sources.values()) {
    const doc = reuse.available.get(item.url)
    if (
      !doc ||
      doc.source_version_id !== item.source_version_id ||
      doc.observed_at !== item.observed_at
    )
      throw Error("Archive reuse receipt observation is invalid")
  }
  for (const [url, item] of reuse.used) {
    if (sources.has(url) && JSON.stringify(sources.get(url)) !== JSON.stringify(item))
      throw Error("Archive reused observation changed")
    sources.set(url, item)
  }
  const receipt = {
    schema: reuse.detailRepair
      ? "research-detail-repair-source-reuse/v1"
      : "research-archive-source-reuse/v1",
    source_run: reuse.reference,
    reused_sources: [...sources.values()],
    observation_times_preserved: true,
    coverage_reused: false,
    candidate_approved: false,
    candidate_published: false,
    ...(reuse.detailRepair
      ? {
          coverage_scope: "original_listing_observation",
          fresh_listing_observation: false,
          parses_recomputed: true,
        }
      : {}),
  }
  if (!existing || JSON.stringify(existing) !== JSON.stringify(receipt))
    atomicWrite(root, relative, receipt)
  return receipt
}
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
  if (
    v["reuse-source-run"] &&
    (v["reuse-source-run"] === v.run ||
      v["reuse-listing-run"] ||
      channel.method !== "rss" ||
      !channel.listing_profile?.fallback_archive)
  )
    throw Error("--reuse-source-run requires a distinct RSS archive source run")
  if (
    v["repair-source-run"] &&
    (v["repair-source-run"] === v.run ||
      v["reuse-source-run"] ||
      v["reuse-listing-run"] ||
      !["bounded-feed", "single-page", "path-pages", "calendar-month"].includes(
        channel.listing_profile?.pagination,
      ))
  )
    throw Error(
      "--repair-source-run requires a distinct supported listing scan without other reuse modes",
    )
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
      ...(v["reuse-source-run"] ? { reuse_source_run: v["reuse-source-run"] } : {}),
      ...(v["repair-source-run"] ? { repair_source_run: v["repair-source-run"] } : {}),
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
    const repair = v["repair-source-run"]
      ? createArchiveSourceReuse(
          root,
          v["repair-source-run"],
          channel,
          basis,
          { since: v.since, until: v.until },
          { now: Date.parse(run.state.started_at), detailRepair: true },
        )
      : null
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
      {
        listingEvidence,
        listingReuseError,
        ...(repair ? { fetchPolicy: repair.fetchPolicy } : {}),
      },
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
          ...(archive.rss_title_policy ? { rss_title_policy: archive.rss_title_policy } : {}),
          ...(archive.article_date_resolution
            ? {
                article_date_resolution: archive.article_date_resolution,
                max_date_resolution_details: archive.max_date_resolution_details,
              }
            : {}),
          require_title_match: true,
        },
      }
      const reuse = v["reuse-source-run"]
        ? createArchiveSourceReuse(
            root,
            v["reuse-source-run"],
            channel,
            basis,
            {
              since: v.since,
              until: v.until,
            },
            { now: Date.parse(run.state.started_at) },
          )
        : null
      const fallback = await scanPathPagesRoute(
        root,
        run,
        fetcher,
        archiveChannel,
        profiles,
        { since: v.since, until: v.until },
        reuse || repair ? { fetchPolicy: (reuse || repair).fetchPolicy } : {},
      )
      if (reuse) preserveArchiveReuseReceipt(root, v.run, reuse)
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
    if (repair) {
      preserveArchiveReuseReceipt(root, v.run, repair)
      result.summary.detail_repair = {
        source_run: v["repair-source-run"],
        coverage_scope: "original_listing_observation",
        fresh_listing_observation: false,
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
      ...(result.summary.detail_repair ? { detail_repair: result.summary.detail_repair } : {}),
      ...(result.events ? { events: result.events.length } : {}),
      ...(backlogMerge ? { backlog_merge: backlogMerge } : {}),
      candidate_published: false,
    }
  })
}
