import test from "node:test"
import assert from "node:assert/strict"
import { hasUnrecordedHistoricalCoverage } from "../scripts/historical-coverage.mjs"

const reviewedHistorical = () => ({
  schema_version: "tech-ai-magazine/v2",
  editorial_format: "six-w/v1",
  date: "2026-07-11",
  timezone: "Asia/Seoul",
  coverage_start: null,
  coverage_end: null,
  new_items_count: 1,
  source_count: 1,
  headlines: ["Reviewed historical event"],
  article_records: [{ title: "Reviewed historical event" }],
  article_reviews: [
    {
      title: "Reviewed historical event",
      event_id: "1234567890abcdef",
      review_status: "verified",
      published_at: "2026-07-10",
      reviewed_at: "2026-10-10",
    },
  ],
})

test("explicit historical null cutoffs survive an omitted marker without supplying timestamps", () => {
  const meta = reviewedHistorical()
  const before = JSON.stringify(meta)
  assert.equal(hasUnrecordedHistoricalCoverage(meta), true)
  assert.equal(JSON.stringify(meta), before)
  for (const change of [
    (m) => {
      m.date = "2026-09-14"
    },
    (m) => {
      m.editorial_format = undefined
    },
    (m) => {
      m.coverage_start = "2026-07-10T00:00:00Z"
    },
    (m) => {
      m.article_reviews[0].review_status = "unreviewed"
    },
    (m) => {
      m.article_reviews[0].published_at = "2026-07-12"
    },
    (m) => {
      m.article_reviews[0].reviewed_at = "2026-07-10"
    },
    (m) => {
      m.article_records = []
    },
    (m) => {
      m.new_items_count = 0
    },
  ]) {
    const changed = structuredClone(meta)
    change(changed)
    if (changed.coverage_start !== null)
      assert.equal(hasUnrecordedHistoricalCoverage(changed), false)
    else assert.throws(() => hasUnrecordedHistoricalCoverage(changed), /complete verified/)
  }
  assert.equal(hasUnrecordedHistoricalCoverage({ coverage_end: null }), false)
  assert.equal(hasUnrecordedHistoricalCoverage({ date: "2026-07-11" }), false)
  assert.throws(
    () => hasUnrecordedHistoricalCoverage({ ...meta, historical_coverage: "other" }),
    /complete verified/,
  )
})

test("only an explicit empty historical record with matching zero counts keeps unknown coverage", () => {
  const meta = {
    ...reviewedHistorical(),
    historical_coverage: "unrecorded/v1",
    new_items_count: 0,
    source_count: 0,
    headlines: [],
    article_records: [],
    article_reviews: [],
  }
  const before = JSON.stringify(meta)
  assert.equal(hasUnrecordedHistoricalCoverage(meta), true)
  assert.equal(JSON.stringify(meta), before)
  for (const change of [
    (m) => {
      delete m.historical_coverage
    },
    (m) => {
      m.source_count = 1
    },
    (m) => {
      m.headlines = ["Unreviewed headline"]
    },
    (m) => {
      m.new_items_count = 1
    },
    (m) => {
      m.date = "2026-09-14"
    },
    (m) => {
      m.coverage_end = "2026-07-11T08:00:00Z"
    },
    (m) => {
      delete m.coverage_start
    },
  ]) {
    const changed = structuredClone(meta)
    change(changed)
    assert.throws(() => hasUnrecordedHistoricalCoverage(changed), /complete verified/)
  }
})
