import assert from "node:assert/strict"
import test from "node:test"
import { researchSlots, queryMatchesLanguage } from "../scripts/research/search.mjs"
import { targetedSourceQueries } from "../scripts/research/source-targeted-search.mjs"
import { coverageGrid } from "../scripts/research/discovery.mjs"

test("incomplete coverage and additive sectors remain searchable with unattempted cells first", () => {
  const failed = {
    channel_id: "incomplete-ko",
    sectors: ["AI"],
    coverage_sectors: ["소프트웨어·클라우드"],
    region: "국내",
    axis: "기술·제품",
    status: "incomplete",
    language: "ko",
    url: "https://example.org/news",
    kind: "research",
  }
  const pending = {
    channel_id: "pending-en",
    sectors: ["바이오·의료기술"],
    region: "해외",
    axis: "기업·운영",
    status: "not_attempted",
    language: "en",
    url: "https://example.net/news",
    kind: "company",
  }
  const coverage = coverageGrid([failed, pending])
  const before = JSON.stringify(coverage)
  const result = targetedSourceQueries(coverage, [failed, pending], "2026-10-10")
  assert.equal(result.queries.length, 3)
  assert.equal(result.queries[0].source_channel_id, pending.channel_id)
  assert.equal(result.queries[0].coverage_status, "not_attempted")
  assert.ok(result.queries.slice(1).every((q) => q.coverage_status === "incomplete"))
  assert.ok(
    result.queries.some(
      (q) => q.sector === "소프트웨어·클라우드" && q.source_channel_id === failed.channel_id,
    ),
  )
  assert.equal(JSON.stringify(coverage), before)
  assert.ok(result.queries.every((q) => queryMatchesLanguage(q.query, q.language)))
})

test("unattempted daily cells receive distinct registered-source searches without claiming articles", () => {
  const coverage = researchSlots().map((slot) => ({ ...slot, status: "partial" }))
  coverage.find((cell) => cell.slot_id === "0-0-0").status = "not_attempted"
  coverage.find((cell) => cell.slot_id === "2-1-1").status = "failed"
  const routes = [
    {
      channel_id: "kaist",
      url: "https://news.kaist.ac.kr/",
      sectors: ["AI"],
      region: "국내",
      axis: "기술·제품",
      language: "ko",
      kind: "research",
    },
    {
      channel_id: "etnews",
      url: "https://www.etnews.com/",
      sectors: ["AI"],
      region: "국내",
      axis: "기술·제품",
      language: "ko",
      kind: "industry-press",
    },
    {
      channel_id: "palo-alto",
      url: "https://investors.paloaltonetworks.com/",
      sectors: ["사이버보안"],
      region: "해외",
      axis: "기업·운영",
      language: "en",
      watch_groups: ["companies"],
    },
    {
      channel_id: "stanford",
      url: "https://otl.stanford.edu/",
      sectors: ["사이버보안"],
      region: "해외",
      axis: "기업·운영",
      language: "en",
      watch_groups: ["institutions"],
    },
    {
      channel_id: "crowdstrike",
      url: "https://ir.crowdstrike.com/",
      sectors: ["사이버보안"],
      region: "해외",
      axis: "기업·운영",
      language: "en",
      watch_groups: ["companies"],
    },
  ]
  const result = targetedSourceQueries(coverage, routes, "2026-09-29")
  assert.equal(result.queries.length, 4)
  assert.deepEqual(result.unresolved, [])
  assert.deepEqual(
    result.queries
      .filter((query) => query.slot_id.startsWith("target-0-0-0-"))
      .map((q) => q.source_type),
    ["institution", "press"],
  )
  assert.deepEqual(
    result.queries
      .filter((query) => query.slot_id.startsWith("target-2-1-1-"))
      .map((q) => q.source_type),
    ["company", "company"],
  )
  assert.ok(result.queries.every((query) => queryMatchesLanguage(query.query, query.language)))
  assert.ok(
    result.queries.every(
      (query) => query.scope === "registered-source" && query.query.includes("site:"),
    ),
  )
  assert.deepEqual(targetedSourceQueries(coverage, [...routes].reverse(), "2026-09-29"), result)
  assert.deepEqual(targetedSourceQueries(coverage, [], "2026-09-29").unresolved, ["0-0-0", "2-1-1"])
  assert.throws(
    () => targetedSourceQueries(coverage.slice(1), routes, "2026-09-29"),
    /Complete daily coverage/,
  )
})
