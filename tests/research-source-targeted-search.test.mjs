import assert from "node:assert/strict"
import test from "node:test"
import { researchSlots, queryMatchesLanguage } from "../scripts/research/search.mjs"
import { targetedSourceQueries } from "../scripts/research/source-targeted-search.mjs"

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
