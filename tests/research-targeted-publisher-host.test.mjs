import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { registry, coverageGrid } from "../scripts/research/discovery.mjs"
import { targetedSourceQueries } from "../scripts/research/source-targeted-search.mjs"

test("registered publisher metadata targets Google articles instead of the RSS transport", () => {
  const config = (name) => JSON.parse(fs.readFileSync(new URL(`../data/research-${name}.json`, import.meta.url)))
  const routes = registry(config("source-channels"), config("watchlist"), config("acquisition"), config("source-recipes"))
  const route = routes.find((row) => row.channel_id === "google-cloud-threat-intelligence")
  assert.equal(new URL(route.url).hostname, "feeds.feedburner.com")
  assert.equal(route.publisher_id, "cloud.google.com")
  assert.ok(route.allowed_hosts.includes("cloud.google.com"))
  const coverage = coverageGrid([{ ...route, status: "failed" }])
  const queries = targetedSourceQueries(coverage, [route], "2026-10-11", { slotIds: ["2-1-0"] }).queries
  assert.equal(queries.length, 1)
  assert.match(queries[0].query, /^site:cloud\.google\.com /)
  assert.equal(queries[0].source_type, "company")
  assert.equal(queries[0].source_url, "https://cloud.google.com/")
  assert.equal(queries[0].source_listing_url, route.url)
  assert.equal(queries[0].source_channel_id, route.channel_id)
})

test("failed RSS routes share publisher search scope only for explicitly allowed host metadata", () => {
  const common = { sectors: ["AI"], region: "해외", axis: "기술·제품", language: "en", kind: "company", method: "rss", status: "failed" }
  const routes = [
    { ...common, channel_id: "feed-a", url: "https://transport-a.example/feed", publisher_id: "publisher.example", allowed_hosts: ["transport-a.example", "publisher.example"] },
    { ...common, channel_id: "feed-b", url: "https://transport-b.example/feed", publisher_id: "publisher.example", allowed_hosts: ["transport-b.example", "publisher.example"] },
    { ...common, channel_id: "out-of-scope", url: "https://original.example/feed", publisher_id: "unrelated.example", allowed_hosts: ["original.example"] },
    { ...common, channel_id: "entity-id", url: "https://entity.example/feed", publisher_id: "company-id", allowed_hosts: ["entity.example", "company-id"] },
  ]
  const coverage = coverageGrid([{ ...common, channel_id: "healthy", url: "https://healthy.example/news", status: "partial" }, ...routes])
  const before = structuredClone(routes)
  const { queries } = targetedSourceQueries(coverage, routes, "2026-10-11", { slotIds: ["0-1-0"] })
  assert.equal(queries.length, 3)
  const query = queries.find((row) => row.query.startsWith("site:publisher.example "))
  assert.ok(query)
  assert.deepEqual(query.recovery_route_ids.sort(), ["feed-a", "feed-b"])
  assert.ok(queries.some((row) => row.query.startsWith("site:original.example ")))
  assert.ok(queries.some((row) => row.query.startsWith("site:entity.example ")))
  assert.ok(queries.every((row) => row.coverage_status === "partial"))
  assert.deepEqual(routes, before)
})
