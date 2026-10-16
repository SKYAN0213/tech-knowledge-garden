import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { assertSchema, sourceGeographySchema, sha256 } from "../scripts/research/contracts.mjs"
import {
  DEFAULT_SOURCE_RECIPES,
  declaredSourceGeography,
  sourceGeographyInventory,
  resolveSourceRecipe,
  sourceRecipe,
} from "../scripts/research/source-recipes.mjs"
import { registry } from "../scripts/research/discovery.mjs"
import { planSourceRegistration } from "../scripts/research/source-registration.mjs"
import { sourceCollectionInventory } from "../scripts/research/collection-report.mjs"

// Explicit fixtures exercise the registration contract, not live country claims.
const declaration = (value, issuer = "issuer") => ({
  value,
  official_evidence: {
    url: `https://${issuer}.example.org/official-material`,
    quote: `Fixture official material explicitly declares ${value}.`,
  },
})
const unknown = {
  publisher_country: null,
  publisher_country_status: "unknown",
  regulatory_jurisdiction: null,
  regulatory_jurisdiction_status: "unknown",
}

function inputs() {
  const channels = {
    channels: [
      {
        id: "fixture-legacy",
        name: "Fixture legacy publisher",
        url: "https://issuer.example.co.kr/news",
        language: "ja",
        region: "해외",
        kind: "industry-press",
        sectors: ["로봇·제조"],
      },
    ],
  }
  const catalog = {
    schema: "research-source-catalog/v1",
    entries: [
      {
        id: "fixture-catalog",
        channel_id: "fixture-new",
        name: "Fixture explicit publisher",
        url: "https://issuer.example.org/news",
        language: "en",
        region: "해외",
        kind: "filing-ir",
        axis: "기업·운영",
        sectors: ["로봇·제조"],
        source_recipe: "registered-route-v1",
        role: "listing",
        checked_on: "2026-10-11",
        observation: "Fixture observation only",
        acquisition_notes: "Fixture registration remains inactive",
        remaining_checks: ["official_original"],
        related_channel_ids: [],
        evidence_urls: ["https://issuer.example.org/official-material"],
      },
    ],
  }
  return {
    channels,
    catalog,
    watchlist: {},
    adapters: {},
    recipes: DEFAULT_SOURCE_RECIPES,
    daily: {
      schema: "research-daily-routes/v1",
      lookback_days: 7,
      max_window_days: 7,
      routes: [{ channel_id: "fixture-legacy", enabled: false, baseline_run: "fixture-baseline" }],
    },
  }
}

test("geography declarations keep independent official evidence and reject incomplete shapes", () => {
  const publisher_country = declaration("Fixture issuing country")
  const regulatory_jurisdiction = declaration("Fixture different jurisdiction", "regulator")
  const value = { publisher_country, regulatory_jurisdiction }
  assert.equal(assertSchema(value, sourceGeographySchema), value)
  assert.deepEqual(declaredSourceGeography(value), value)
  assert.deepEqual(sourceGeographyInventory(value), {
    ...value,
    publisher_country_status: "declared",
    regulatory_jurisdiction_status: "declared",
  })
  assert.deepEqual(sourceGeographyInventory({ publisher_country: null }), unknown)
  assert.deepEqual(sourceGeographyInventory({ regulatory_jurisdiction }), {
    ...unknown,
    regulatory_jurisdiction,
    regulatory_jurisdiction_status: "declared",
  })
  for (const malformed of [
    "Fixture country",
    [],
    { value: "Fixture country" },
    { ...publisher_country, value: " " },
    { ...publisher_country, value: "x".repeat(121) },
    { ...publisher_country, guessed_from: "language" },
    { ...publisher_country, official_evidence: { url: publisher_country.official_evidence.url } },
    {
      ...publisher_country,
      official_evidence: { ...publisher_country.official_evidence, quote: " " },
    },
    {
      ...publisher_country,
      official_evidence: { ...publisher_country.official_evidence, inferred: true },
    },
  ])
    assert.throws(() => declaredSourceGeography({ publisher_country: malformed }))
})

test("geography opt-in schema rejects prototype-named extra fields at every declaration level", () => {
  const publisher_country = declaration("Fixture country")
  for (const key of ["__proto__", "constructor", "prototype"])
    for (const malformed of [
      { publisher_country, [key]: "unexpected" },
      { publisher_country: { ...publisher_country, [key]: "unexpected" } },
      {
        publisher_country: {
          ...publisher_country,
          official_evidence: { ...publisher_country.official_evidence, [key]: "unexpected" },
        },
      },
    ])
      assert.throws(
        () => assertSchema(JSON.parse(JSON.stringify(malformed)), sourceGeographySchema),
        /Unexpected field/,
      )
})

test("geography evidence uses public credential-free URLs and is never inherited or inferred", () => {
  for (const url of [
    "http://issuer.example.org/official-material",
    "https://127.0.0.1/official-material",
    "https://issuer.internal/official-material",
    "https://user:password@issuer.example.org/official-material",
    "https://issuer.example.org/official-material?access_token=fixture-only",
  ])
    assert.throws(() =>
      declaredSourceGeography({
        publisher_country: {
          ...declaration("Fixture country"),
          official_evidence: { url, quote: "Fixture quote" },
        },
      }),
    )
  const route = inputs().channels.channels[0]
  route.country = "unreviewed company country"
  route.headquarters_country = "unreviewed headquarters"
  assert.equal(resolveSourceRecipe(route), route)
  assert.deepEqual(declaredSourceGeography(route), {})
  assert.deepEqual(sourceGeographyInventory(route), unknown)
  assert.throws(
    () =>
      sourceRecipe("fixture", {
        schema: DEFAULT_SOURCE_RECIPES.schema,
        recipes: { fixture: { config: { publisher_country: declaration("Fixture country") } } },
      }),
    /not inherited from a recipe/,
  )
})

test("catalog declarations reach pending channels while reused URLs retain existing declarations", () => {
  const f = inputs()
  const geography = {
    publisher_country: declaration("Fixture issuing country"),
    regulatory_jurisdiction: declaration("Fixture filing jurisdiction", "regulator"),
  }
  Object.assign(f.catalog.entries[0], geography)
  const before = JSON.stringify(f)
  const plan = planSourceRegistration(f)
  assert.equal(JSON.stringify(f), before)
  const pending = plan.next_channels.channels.find((row) => row.id === "fixture-new")
  assert.deepEqual(declaredSourceGeography(pending), geography)
  assert.deepEqual(plan.next_channels.channels[0], f.channels.channels[0])
  assert.equal(pending.onboarding.collection_enabled, false)
  assert.equal(plan.daily_enabled, 0)
  assert.equal(plan.results[0].publisher_country_status, "declared")
  assert.equal(plan.results[0].action, "register_pending")

  const existing = {
    ...pending,
    publisher_country: declaration("Fixture previously reviewed country"),
  }
  f.channels.channels.push(existing)
  const repeated = planSourceRegistration(f)
  assert.equal(repeated.new_routes, 0)
  assert.deepEqual(repeated.next_channels, f.channels)
  assert.equal(repeated.results[0].action, "reuse")
  assert.deepEqual(repeated.results[0].publisher_country, existing.publisher_country)
  assert.deepEqual(
    repeated.results[0].catalog_geography.publisher_country,
    geography.publisher_country,
  )

  delete f.channels.channels[1].publisher_country
  const legacy = planSourceRegistration(f)
  assert.equal(legacy.results[0].publisher_country, null)
  assert.equal(legacy.results[0].publisher_country_status, "unknown")
  assert.equal(Object.hasOwn(legacy.next_channels.channels[1], "publisher_country"), false)
})

test("inventory consumes explicit channel overrides for watch sources without company-country inference", () => {
  const f = inputs()
  f.watchlist.companies = [
    {
      id: "fixture-company",
      name: "Fixture company",
      region: "해외",
      language: "zh",
      sector: "로봇·제조",
      country: "Unreviewed company country",
      headquarters_country: "Unreviewed headquarters country",
      source_urls: ["https://issuer.example.cn/news"],
    },
  ]
  const inventory = () =>
    sourceCollectionInventory({ ...f, acquisition: f.adapters, catalog: f.catalog })
  const initial = inventory()
  assert.deepEqual(sourceGeographyInventory(initial.routes[0]), unknown)
  const watchId = "watch-fixture-company-0"
  const initialWatch = initial.routes.find((row) => row.channel_id === watchId)
  assert.equal(initialWatch.language, "zh")
  assert.equal(initialWatch.publisher_country_status, "unknown")
  const publisher_country = declaration("Fixture official issuing country")
  f.adapters[watchId] = { publisher_country, regulatory_jurisdiction: null }
  const before = JSON.stringify(f)
  const after = inventory()
  const watch = after.routes.find((row) => row.channel_id === watchId)
  assert.deepEqual(watch.publisher_country, publisher_country)
  assert.equal(watch.publisher_country_status, "declared")
  assert.equal(watch.regulatory_jurisdiction, null)
  assert.equal(watch.regulatory_jurisdiction_status, "unknown")
  assert.equal(watch.article_evidence_status, "not_evaluated_in_inventory")
  assert.equal(watch.event_selection_status, "not_evaluated_in_inventory")
  assert.equal(JSON.stringify(f), before)
  assert.deepEqual(
    registry(f.channels, f.watchlist, {}, f.recipes)[0],
    registry(f.channels, f.watchlist, f.adapters, f.recipes)[0],
  )
  f.adapters[watchId] = { publisher_country: { value: "Fixture missing official evidence" } }
  assert.throws(inventory, /official_evidence/)
})

test("sources list projects declarations and unknown values without writing registration inputs", (t) => {
  const f = inputs()
  f.catalog.entries[0].regulatory_jurisdiction = declaration("Fixture jurisdiction", "regulator")
  const reused = {
    ...f.catalog.entries[0],
    id: "fixture-reused",
    channel_id: "fixture-legacy",
    url: f.channels.channels[0].url,
    publisher_country: declaration("Fixture proposed issuing country"),
  }
  f.catalog.entries.push(reused)
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "source-geography-")))
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }))
  fs.mkdirSync(path.join(repo, "data"))
  const files = {
    "source-channels": f.channels,
    watchlist: f.watchlist,
    acquisition: f.adapters,
    "source-recipes": f.recipes,
    "daily-routes": f.daily,
    "source-catalog": f.catalog,
  }
  const paths = Object.entries(files).map(([name, value]) => {
    const file = path.join(repo, `data/research-${name}.json`)
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n")
    return file
  })
  const before = paths.map((file) => sha256(fs.readFileSync(file)))
  const cli = spawnSync(
    process.execPath,
    ["scripts/research-sources.mjs", "list", "--repo", repo],
    {
      encoding: "utf8",
    },
  )
  assert.equal(cli.status, 0, cli.stderr)
  const result = JSON.parse(cli.stdout)
  assert.equal(result.status, "read_only")
  const pending = result.results.find((row) => row.catalog_id === "fixture-catalog")
  assert.equal(pending.publisher_country, null)
  assert.equal(pending.publisher_country_status, "unknown")
  assert.deepEqual(pending.regulatory_jurisdiction, f.catalog.entries[0].regulatory_jurisdiction)
  const reuse = result.results.find((row) => row.catalog_id === "fixture-reused")
  assert.equal(reuse.publisher_country, null)
  assert.equal(reuse.publisher_country_status, "unknown")
  assert.deepEqual(reuse.catalog_geography.publisher_country, reused.publisher_country)
  assert.deepEqual(
    paths.map((file) => sha256(fs.readFileSync(file))),
    before,
  )
})

test("empty catalog checks reuse only a verified exact public route declaration without verifying private evidence", (t) => {
  const f = inputs()
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "completed-catalog-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  f.root = root
  const route = f.channels.channels[0]
  const entry = f.catalog.entries[0]
  entry.channel_id = route.id
  entry.url = route.url
  entry.remaining_checks = []
  route.listing_profile = { pagination: "single-page" }
  route.onboarding = {
    status: "verified",
    collection_enabled: true,
    remaining_checks: [],
    verification_receipt: "source-onboarding/fixture-native/verification.json",
  }
  f.daily.routes[0].enabled = true
  const file = path.join(root, route.onboarding.verification_receipt)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  // Listing configuration must not read or attest to private receipt contents.
  // Receipt integrity is exercised by the native activation tests.
  fs.writeFileSync(file, "Private native evidence is outside public configuration lookup.\n")
  const inputBefore = JSON.stringify(f)
  const receiptBefore = fs.readFileSync(file)
  const plan = planSourceRegistration(f)
  assert.equal(plan.results[0].action, "reuse")
  assert.equal(plan.new_routes, 0)
  assert.equal(plan.daily_enabled, 1)
  assert.deepEqual(plan.next_channels, f.channels)
  assert.equal(JSON.stringify(f), inputBefore)
  assert.deepEqual(fs.readFileSync(file), receiptBefore)

  for (const change of [
    (copy) => {
      copy.catalog.entries[0].url = "https://issuer.example.org/different"
    },
    (copy) => {
      copy.catalog.entries[0].channel_id = "fixture-new"
    },
    (copy) => {
      copy.channels.channels[0].onboarding.status = "configured"
    },
    (copy) => {
      copy.daily.routes[0].enabled = false
    },
    (copy) => {
      copy.channels.channels[0].onboarding.remaining_checks = ["official_original"]
    },
    (copy) => {
      copy.channels.channels = []
    },
    (copy) => {
      copy.channels.channels[0].onboarding.verification_receipt = "invalid-reference"
    },
    (copy) => {
      copy.daily.routes[0].baseline_run = "invalid/baseline"
    },
  ]) {
    const copy = structuredClone(f)
    change(copy)
    assert.throws(() => planSourceRegistration(copy), /Invalid source catalog entry/)
  }
  fs.rmSync(file)
  assert.deepEqual(planSourceRegistration(f), plan)
  assert.equal(
    fs.existsSync(file),
    false,
    "configuration lookup does not recreate private evidence",
  )
})
