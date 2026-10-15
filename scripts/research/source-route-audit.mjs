import fs from "node:fs"
import { registry } from "./discovery.mjs"
import { SourceFetcher } from "./fetch.mjs"
import { fetchWithPolicy } from "./source-policy.mjs"
import { parseDocument } from "./parser.mjs"
import { parseStoredRSSFeed } from "./rss-scan.mjs"
import { sha256 } from "./contracts.mjs"
import { DEFAULT_ROOT, RunState, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"

const configNames = ["source-channels", "watchlist", "acquisition", "source-recipes", "daily-routes", "source-catalog"]

export function routeAuditInputs(repo = process.cwd()) {
  const snapshots = configNames.map((name) => {
    const file = `data/research-${name}.json`
    const bytes = fs.readFileSync(safePath(repo, file))
    return { file, sha256: sha256(bytes), value: JSON.parse(bytes) }
  })
  const [channels, watchlist, acquisition, recipes, daily, catalog] = snapshots.map((row) => row.value)
  const routes = registry(channels, watchlist, acquisition, recipes)
  return { snapshots, routes, daily, catalog }
}

// A probe is an explicit onboarding observation. It neither bypasses robots
// nor enables a registered route for unattended collection.
export async function auditSourceRoutes({ runId, root = DEFAULT_ROOT, repo = process.cwd(), channels = [], concurrency = 6 } = {}, dependencies = {}) {
  if (!/^[A-Za-z0-9_-]+$/.test(runId || "") || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 6)
    throw Error("Route audit requires an exact run and 1..6 workers")
  const { snapshots, routes, daily, catalog } = routeAuditInputs(repo)
  if (!Array.isArray(channels) || new Set(channels).size !== channels.length || channels.some((id) => !routes.some((route) => route.channel_id === id)))
    throw Error("Unknown or duplicate route audit selection")
  const selected = channels.length ? routes.filter((route) => channels.includes(route.channel_id)) : routes
  const enabled = new Set(daily.routes.filter((row) => row.enabled).map((row) => row.channel_id))
  const input = { schema: "research-route-audit-input/v1", implementation_sha256: sha256(fs.readFileSync(new URL("./source-route-audit.mjs", import.meta.url))), configs: snapshots.map(({ file, sha256 }) => ({ file, sha256 })), routes: selected, concurrency }
  return withLock(root, "route-audit-" + runId, async () => {
    const run = new RunState(root, runId, input, { scope: "route-audit" })
    atomicWrite(root, `${run.directory}input.json`, input)
    const fetcher = dependencies.fetcher || new SourceFetcher(root, { attempts: 1, timeout_ms: 12000, interval_ms: 1000, html_bytes: 6 * 1024 ** 2 })
    const fetchPolicy = dependencies.fetchPolicy || fetchWithPolicy
    const parse = dependencies.parse || parseDocument
    const parseFeed = dependencies.parseFeed || parseStoredRSSFeed
    const rows = new Map()
    // All addresses on a host share one serial queue and robots cache.
    const hosts = new Map()
    for (const route of selected) {
      const host = new URL(route.url).hostname
      if (!hosts.has(host)) hosts.set(host, [])
      hosts.get(host).push(route)
    }
    const groups = [...hosts.values()]
    let next = 0
    const checkpoint = () => {
      const report = { schema: "research-route-audit/v1", run_id: runId, observed_at: run.state.started_at, selected_routes: selected.length, examined_routes: rows.size, status: rows.size === selected.length ? "observed" : "in_progress", routes: selected.filter((route) => rows.has(route.channel_id)).map((route) => rows.get(route.channel_id)), candidate_approved: false, candidate_published: false }
      atomicWrite(root, `${run.directory}report.json`, report)
      return report
    }
    async function observe(route) {
      const result = await run.stage("route-" + route.channel_id, { route }, async () => {
        const start = Date.now()
        const row = { channel_id: route.channel_id, url: route.url, daily_enabled: enabled.has(route.channel_id), catalog_role: catalog.entries.find((entry) => entry.url === route.url)?.role || null, status: "failed", document: null, parse: null }
        try {
          const document = await fetchPolicy(root, fetcher, route.url, { allowed_hosts: route.allowed_hosts || [new URL(route.url).hostname], request_interval_ms: route.request_interval_ms })
          row.document = document
          row.status = document.policy_status === "denied" ? "policy_denied" : document.fetch_status
          if (["captured", "not_modified"].includes(document.fetch_status)) {
            try {
              row.parse = route.method === "rss" && route.listing_profile?.pagination === "bounded-feed"
                ? await parseFeed(root, document, route)
                : await parse(root, document, { language: route.language })
              row.status = row.parse.status === "blocked" ? "access_restricted" : "accessible"
            } catch (error) {
              row.status = "parse_requires_configuration"
              row.parse_error = error.message
            }
          }
        } catch (error) {
          row.error = error.message
        }
        row.duration_ms = Date.now() - start
        return row
      })
      rows.set(route.channel_id, result)
      checkpoint()
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, groups.length) }, async () => {
      while (next < groups.length) {
        const group = groups[next++]
        for (const route of group) await observe(route)
      }
    }))
    return checkpoint()
  })
}

export function loadRouteAudit(root, runId) {
  if (!/^[A-Za-z0-9_-]+$/.test(runId || "")) throw Error("Exact route audit run required")
  const relative = `runs/${runId}/route-audit/report.json`
  const report = readJSON(root, relative)
  const state = readJSON(root, `runs/${runId}/route-audit/state.json`)
  const input = readJSON(root, `runs/${runId}/route-audit/input.json`)
  if (!report || !state || !input || state.input_hash !== sha256(JSON.stringify(input)) || report.selected_routes !== input.routes.length)
    throw Error("Route audit input or checkpoint is missing")
  for (const row of report.routes) {
    const stage = state.stages["route-" + row.channel_id]
    const exact = stage && readJSON(root, stage.result_path)
    if (stage?.status !== "complete" || sha256(JSON.stringify(exact)) !== stage.result_hash || JSON.stringify(exact) !== JSON.stringify(row))
      throw Error("Route audit observation changed")
    if (row.document?.body_path && sha256(fs.readFileSync(safePath(root, row.document.body_path))) !== row.document.body_sha256)
      throw Error("Route audit source bytes changed")
  }
  return { report, reference: { path: relative, sha256: sha256(fs.readFileSync(safePath(root, relative))) } }
}
