import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { canonicalURL } from "../garden.mjs"
import { registry } from "./discovery.mjs"
import { assertURL } from "./fetch.mjs"
import { sha256 } from "./contracts.mjs"
import {
  DEFAULT_ROOT,
  atomicCreate,
  atomicWrite,
  safePath,
  withGardenOperationLock,
} from "./run-state.mjs"
import { sourceRecipe } from "./source-recipes.mjs"
import { validateDailyRoutes } from "./daily-plan.mjs"

const channelsFile = "data/research-source-channels.json"
const configFiles = [
  channelsFile,
  "data/research-watchlist.json",
  "data/research-acquisition.json",
  "data/research-source-recipes.json",
  "data/research-daily-routes.json",
]
const safeId = (id) => typeof id === "string" && /^[a-zA-Z0-9_-]+$/.test(id)

function publicURL(raw) {
  const url = assertURL(raw)
  if (
    !url.hostname.includes(".") ||
    /(?:^|\.)(?:localhost|local|internal|test)$/.test(url.hostname)
  )
    throw Error("Public source hostname required")
  if (
    [...url.searchParams.keys()].some((key) =>
      /^(?:api[-_]?key|token|secret|password|access[-_]?token|authorization)$/i.test(key),
    )
  )
    throw Error("Credential query must not be stored in public source configuration")
  return url
}

export function validateSourceCatalog(catalog, routes, recipes) {
  if (
    catalog?.schema !== "research-source-catalog/v1" ||
    !Array.isArray(catalog.entries) ||
    !catalog.entries.length
  )
    throw Error("Invalid source catalog")
  const ids = new Set(),
    channelIds = new Set(),
    known = new Set(routes.map((route) => route.channel_id))
  for (const entry of catalog.entries) {
    if (
      !safeId(entry.id) ||
      !safeId(entry.channel_id) ||
      ids.has(entry.id) ||
      channelIds.has(entry.channel_id) ||
      typeof entry.name !== "string" ||
      !entry.name.trim() ||
      !["listing", "entrypoint", "documentation"].includes(entry.role) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.checked_on || "") ||
      typeof entry.observation !== "string" ||
      !entry.observation.trim() ||
      typeof entry.acquisition_notes !== "string" ||
      !entry.acquisition_notes.trim() ||
      !Array.isArray(entry.remaining_checks) ||
      !entry.remaining_checks.length ||
      entry.remaining_checks.some((check) => !safeId(check)) ||
      !Array.isArray(entry.related_channel_ids) ||
      entry.related_channel_ids.some((id) => !known.has(id)) ||
      !Array.isArray(entry.evidence_urls) ||
      !entry.evidence_urls.length
    )
      throw Error("Invalid source catalog entry: " + entry.id)
    ids.add(entry.id)
    channelIds.add(entry.channel_id)
    publicURL(entry.url)
    entry.evidence_urls.forEach(publicURL)
    const recipe = sourceRecipe(entry.source_recipe, recipes)
    if (
      recipe.onboarding?.collection_enabled !== false ||
      recipe.onboarding?.status !== "registered"
    )
      throw Error("Catalog registration requires an inactive registration recipe")
    if (entry.suggested_recipe) sourceRecipe(entry.suggested_recipe, recipes)
    // Validate the same contract as the actual collection registry, not a second schema.
    registry({ channels: [routeFromEntry(entry)] }, {}, {}, recipes)
  }
  return catalog
}

function routeFromEntry(entry) {
  return {
    id: entry.channel_id,
    name: entry.name,
    url: entry.url,
    kind: entry.kind,
    language: entry.language,
    region: entry.region,
    axis: entry.axis,
    sectors: entry.sectors,
    source_recipe: entry.source_recipe,
    catalog_ids: [entry.id],
    onboarding: {
      status: "registered",
      collection_enabled: false,
      checked_on: entry.checked_on,
      role: entry.role,
      observation: entry.observation,
      acquisition_notes: entry.acquisition_notes,
      related_channel_ids: entry.related_channel_ids,
      suggested_recipe: entry.suggested_recipe || null,
      evidence_urls: entry.evidence_urls,
      remaining_checks: entry.remaining_checks,
    },
  }
}

export function planSourceRegistration({
  catalog,
  channels,
  watchlist,
  adapters,
  recipes,
  daily,
  ids = [],
}) {
  const routes = registry(channels, watchlist, adapters, recipes)
  validateSourceCatalog(catalog, routes, recipes)
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !catalog.entries.some((entry) => entry.id === id))
  )
    throw Error("Unknown or duplicate catalog selection")
  const next = structuredClone(channels),
    result = [],
    byURL = new Map()
  for (const route of routes) {
    const key = canonicalURL(route.url)
    if (!byURL.has(key)) byURL.set(key, [])
    byURL.get(key).push(route)
  }
  const byId = new Map(routes.map((route) => [route.channel_id, route]))
  for (const entry of catalog.entries.filter((entry) => !ids.length || ids.includes(entry.id))) {
    const matches = byURL.get(canonicalURL(entry.url)) || []
    if (matches.length > 1) throw Error("Ambiguous registered URL for " + entry.id)
    const collision = byId.get(entry.channel_id)
    if (collision && canonicalURL(collision.url) !== canonicalURL(entry.url))
      throw Error("Registered channel ID belongs to another URL: " + entry.channel_id)
    if (matches.length) {
      result.push({
        catalog_id: entry.id,
        channel_id: matches[0].channel_id,
        action: "reuse",
        url: entry.url,
      })
      continue
    }
    const route = routeFromEntry(entry)
    next.channels.push(route)
    byURL.set(canonicalURL(entry.url), [{ ...route, channel_id: route.id }])
    byId.set(route.id, { ...route, channel_id: route.id })
    result.push({
      catalog_id: entry.id,
      channel_id: route.id,
      action: "register_pending",
      url: route.url,
    })
  }
  const after = registry(next, watchlist, adapters, recipes)
  for (const entry of result.filter((item) => item.action === "register_pending")) {
    const route = after.find((item) => item.channel_id === entry.channel_id)
    if (route.onboarding?.collection_enabled !== false || route.onboarding?.status !== "registered")
      throw Error("Acquisition override activated an unverified registration: " + entry.channel_id)
  }
  const beforeActive = validateDailyRoutes(daily, routes)
  const afterActive = validateDailyRoutes(daily, after)
  if (JSON.stringify(beforeActive) !== JSON.stringify(afterActive))
    throw Error("Registration changed active collection routes")
  return {
    schema: "research-source-registration-plan/v1",
    selected: result.length,
    registered_before: routes.length,
    registered_after: after.length,
    new_routes: result.filter((entry) => entry.action === "register_pending").length,
    reused: result.filter((entry) => entry.action === "reuse").length,
    daily_enabled: afterActive.length,
    results: result,
    next_channels: next,
  }
}

export function loadSourceRegistration({
  repo = process.cwd(),
  input = "data/research-source-catalog.json",
  ids = [],
} = {}) {
  const base = path.resolve(repo)
  const snapshots = configFiles.map((file) => ({
    file,
    bytes: fs.readFileSync(safePath(base, file)),
  }))
  const values = snapshots.map(({ bytes }) => JSON.parse(bytes))
  const catalogFile = path.resolve(base, input),
    catalogBytes = fs.readFileSync(catalogFile)
  const catalog = JSON.parse(catalogBytes)
  const plan = planSourceRegistration({
    catalog,
    channels: values[0],
    watchlist: values[1],
    adapters: values[2],
    recipes: values[3],
    daily: values[4],
    ids,
  })
  return { plan, snapshots, catalogFile, catalogBytes, catalog, recipes: values[3] }
}

export async function registerSourceCatalog(options = {}) {
  const repo = path.resolve(options.repo || process.cwd())
  const root = path.resolve(repo, options.root || DEFAULT_ROOT)
  return withGardenOperationLock(root, async () => {
    const loaded = loadSourceRegistration({ ...options, repo })
    const { next_channels, ...report } = loaded.plan
    if (!report.new_routes) return { ...report, status: "unchanged", backup: null }
    const relative = `source-registrations/${crypto.randomUUID()}`
    const before = loaded.snapshots[0].bytes
    atomicCreate(root, relative + "/channels-before.json", before)
    for (const snapshot of loaded.snapshots)
      if (sha256(fs.readFileSync(safePath(repo, snapshot.file))) !== sha256(snapshot.bytes))
        throw Error("Source configuration changed during registration: " + snapshot.file)
    if (sha256(fs.readFileSync(loaded.catalogFile)) !== sha256(loaded.catalogBytes))
      throw Error("Source catalog changed during registration")
    const receipt = {
      ...report,
      status: "registered_pending",
      registered_at: new Date().toISOString(),
      catalog_sha256: sha256(loaded.catalogBytes),
      channels_before_sha256: sha256(before),
      channels_after_sha256: sha256(JSON.stringify(next_channels, null, 2) + "\n"),
      backup: relative + "/channels-before.json",
      candidate_published: false,
      daily_activation_changed: false,
    }
    // Save a prepared receipt first; a later write failure is distinguishable from an applied registration.
    atomicCreate(root, relative + "/prepared.json", receipt)
    atomicWrite(repo, channelsFile, next_channels)
    atomicCreate(root, relative + "/applied.json", receipt)
    return {
      ...receipt,
      receipt: path.resolve(root, relative + "/applied.json"),
      backup: path.resolve(root, receipt.backup),
    }
  })
}
