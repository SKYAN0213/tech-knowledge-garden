import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { registry, discoverChannel } from "../scripts/research/discovery.mjs"
import { validateDailyRoutes } from "../scripts/research/daily-plan.mjs"
import { buildSourceInventory } from "../scripts/research/delivery-status.mjs"
import {
  DEFAULT_SOURCE_RECIPES,
  mergeSourceOptions,
  sourceRecipe,
} from "../scripts/research/source-recipes.mjs"
import {
  loadSourceRegistration,
  planSourceRegistration,
  registerSourceCatalog,
} from "../scripts/research/source-registration.mjs"
const load = (file) => JSON.parse(fs.readFileSync(file, "utf8"))
const recipes = DEFAULT_SOURCE_RECIPES

function fixture(t) {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "source-registration-")))
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }))
  fs.mkdirSync(path.join(repo, "data"))
  for (const file of [
    "research-source-channels",
    "research-watchlist",
    "research-acquisition",
    "research-source-recipes",
    "research-daily-routes",
    "research-source-catalog",
  ])
    fs.copyFileSync(`data/${file}.json`, path.join(repo, `data/${file}.json`))
  const file = path.join(repo, "data/research-source-channels.json"),
    channels = load(file)
  const active = new Set(
    load(path.join(repo, "data/research-daily-routes.json"))
      .routes.filter((r) => r.enabled)
      .map((r) => r.channel_id),
  )
  channels.channels = channels.channels.filter(
    (route) => !route.id.startsWith("catalog-") || active.has(route.id),
  )
  fs.writeFileSync(file, JSON.stringify(channels, null, 2) + "\n")
  return repo
}

test("researched routes and newly confirmed endpoints preserve every active collection option", () => {
  const before = loadSourceRegistration()
  for (let i = 1; i <= 65; i++)
    assert.ok(before.catalog.entries.some((entry) => entry.id === `X${String(i).padStart(2, "0")}`))
  assert.equal(
    new Set(before.catalog.entries.map((entry) => entry.id)).size,
    before.catalog.entries.length,
  )
  assert.equal(before.plan.selected, before.catalog.entries.length)
  assert.equal(
    before.plan.daily_enabled,
    load("data/research-daily-routes.json").routes.filter((r) => r.enabled).length,
  )
  const plan = before.plan
  const again = planSourceRegistration({
    catalog: before.catalog,
    channels: plan.next_channels,
    watchlist: load("data/research-watchlist.json"),
    adapters: load("data/research-acquisition.json"),
    recipes,
    daily: load("data/research-daily-routes.json"),
  })
  assert.equal(again.new_routes, 0)
  assert.equal(again.reused, before.catalog.entries.length)
  assert.equal(again.registered_after, plan.registered_after)
  assert.deepEqual(again.next_channels, plan.next_channels)
})

test("recipes inherit nested rules and replace arrays, rejecting cycles and unsafe identity overrides", () => {
  assert.deepEqual(
    mergeSourceOptions({ rule: { a: 1, hosts: ["a"] } }, { rule: { b: 2, hosts: ["b"] } }),
    { rule: { a: 1, b: 2, hosts: ["b"] } },
  )
  assert.equal(sourceRecipe("mit-news-rss-v1").method, "rss")
  assert.throws(() => sourceRecipe("missing"), /Unknown/)
  assert.throws(
    () =>
      sourceRecipe("a", {
        schema: recipes.schema,
        recipes: {
          a: { extends: "b", config: {} },
          b: { extends: "a", config: {} },
        },
      }),
    /Cyclic/,
  )
  assert.throws(
    () =>
      sourceRecipe("a", {
        schema: recipes.schema,
        recipes: { a: { config: { url: "https://example.com" } } },
      }),
    /identity/,
  )
  assert.throws(
    () => mergeSourceOptions({}, JSON.parse('{"__proto__":{"polluted":true}}')),
    /Unsafe/,
  )
  assert.equal({}.polluted, undefined)
})

test("two MIT feeds retain their complete previously deployed options while sharing one recipe", () => {
  const routes = registry(
    load("data/research-source-channels.json"),
    load("data/research-watchlist.json"),
    load("data/research-acquisition.json"),
  )
  for (const [id, rule, title, scope] of [
    [
      "mit-ai-research",
      "mit-ai-rss-v1",
      "MIT News - Artificial intelligence",
      "Official MIT AI topic feed; selected dated full originals and an older feed item are required for window completion. Topic labels are not publication approval.",
    ],
    [
      "mit-robotics",
      "mit-robotics-rss-v1",
      "MIT News - Robotics",
      "Official MIT Robotics topic feed; selected dated full originals and an older feed item are required for window completion.",
    ],
  ]) {
    const route = routes.find((item) => item.channel_id === id)
    assert.equal(route.source_recipe, "mit-news-rss-v1")
    assert.equal(route.method, "rss")
    assert.equal(route.publisher_id, "news.mit.edu")
    assert.equal(route.item_pattern, "^https://news\\.mit\\.edu/20\\d\\d/[^/?#]+/?$")
    assert.deepEqual(route.allowed_hosts, ["news.mit.edu"])
    assert.equal(route.scan_max_details, 20)
    assert.deepEqual(route.listing_profile, {
      pagination: "bounded-feed",
      max_items: 50,
      guid_is_permalink: true,
      rule_id: rule,
      feed_title: title,
      scope,
    })
  }
  const shared = registry(
    {
      channels: ["one", "two"].map((id) => ({
        id,
        name: id,
        url: `https://example.com/${id}`,
        source_recipe: "bounded-rss-v1",
        language: "en",
        sectors: ["AI"],
      })),
    },
    {},
  )
  assert.ok(
    shared.every(
      (route) => route.method === "rss" && route.listing_profile.pagination === "bounded-feed",
    ),
  )
})

test("pending documentation/list registrations perform no discovery request and cannot enter daily routes", async () => {
  const loaded = loadSourceRegistration({ ids: ["X20"] })
  const routes = registry(
    loaded.plan.next_channels,
    load("data/research-watchlist.json"),
    load("data/research-acquisition.json"),
  )
  const item = loaded.plan.results[0],
    route = routes.find((entry) => entry.channel_id === item.channel_id)
  assert.equal(route.onboarding.role, "documentation")
  const fetcher = { fetch: () => assert.fail("unverified source fetched"), options: {} }
  assert.equal((await discoverChannel("unused", fetcher, route)).status, "registration_pending")
  assert.throws(
    () =>
      validateDailyRoutes(
        {
          schema: "research-daily-routes/v1",
          lookback_days: 7,
          max_window_days: 7,
          routes: [{ channel_id: route.channel_id, enabled: true, baseline_run: "unverified" }],
        },
        routes,
      ),
    /not verified/,
  )
  const inventory = buildSourceInventory({ knownRoutes: [route], activeRoutes: [] })
  assert.equal(inventory[0].development_status, "registration_pending")
  assert.equal(inventory[0].source_recipe, "registered-route-v1")
  assert.ok(inventory[0].onboarding.remaining_checks.includes("collection_endpoint"))
})

test("CLI dry run does not write; apply saves an exact backup and a second apply is a no-op", async (t) => {
  const repo = fixture(t),
    file = path.join(repo, "data/research-source-channels.json")
  const before = fs.readFileSync(file)
  const cli = spawnSync(
    process.execPath,
    ["scripts/research-sources.mjs", "register", "--repo", repo, "--id", "X04"],
    { encoding: "utf8" },
  )
  assert.equal(cli.status, 0, cli.stderr)
  assert.equal(JSON.parse(cli.stdout).status, "dry_run")
  assert.deepEqual(fs.readFileSync(file), before)
  assert.equal(fs.existsSync(path.join(repo, ".local")), false)
  const applied = spawnSync(
    process.execPath,
    ["scripts/research-sources.mjs", "register", "--repo", repo, "--id", "X04", "--apply"],
    { encoding: "utf8" },
  )
  assert.equal(applied.status, 0, applied.stderr)
  const receipt = JSON.parse(applied.stdout)
  assert.equal(receipt.new_routes, 1)
  assert.equal(
    receipt.daily_enabled,
    load(path.join(repo, "data/research-daily-routes.json")).routes.filter((r) => r.enabled).length,
  )
  assert.deepEqual(fs.readFileSync(receipt.backup), before)
  assert.equal(load(receipt.receipt).daily_activation_changed, false)
  const after = fs.readFileSync(file)
  assert.equal((await registerSourceCatalog({ repo, ids: ["X04"] })).status, "unchanged")
  assert.deepEqual(fs.readFileSync(file), after)
})

test("unsafe URL, credential, unknown selection and ID conflict are rejected before mutation", async (t) => {
  const repo = fixture(t),
    input = "data/custom.json",
    file = path.join(repo, "data/research-source-channels.json")
  const before = fs.readFileSync(file),
    catalog = load(path.join(repo, "data/research-source-catalog.json"))
  for (const url of [
    "http://127.0.0.1/",
    "https://localhost/",
    "https://example.com/?api_key=private",
    "file:///tmp/source",
  ]) {
    const altered = structuredClone(catalog)
    altered.entries = [altered.entries[3]]
    altered.entries[0].url = url
    fs.writeFileSync(path.join(repo, input), JSON.stringify(altered))
    await assert.rejects(
      registerSourceCatalog({ repo, input }),
      /URL|IP|hostname|Credential|Invalid/,
    )
    assert.deepEqual(fs.readFileSync(file), before)
  }
  assert.throws(() => loadSourceRegistration({ repo, ids: ["unknown"] }), /selection/)
  const conflict = structuredClone(catalog)
  conflict.entries = [conflict.entries[3]]
  conflict.entries[0].channel_id = "mit-robotics"
  fs.writeFileSync(path.join(repo, input), JSON.stringify(conflict))
  await assert.rejects(registerSourceCatalog({ repo, input }), /another URL/)
  assert.deepEqual(fs.readFileSync(file), before)
})
