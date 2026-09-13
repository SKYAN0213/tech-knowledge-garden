import { test } from "node:test"
import assert from "node:assert/strict"
import { sourceDiversity } from "../scripts/source-diversity.mjs"
const issue = (date, articles, schema = "tech-ai-magazine/v2") => ({
  meta: { date, schema_version: schema },
  articles,
})
const article = (id, host = "example.com") => ({ id, urls: ["https://" + host + "/news/" + id] })

test("reprints do not increase counts or move an old event into a recent window", () => {
  const report = sourceDiversity(
    [
      issue("2026-08-01", [article("old")]),
      issue("2026-09-13", [article("old"), article("new", "www.example.com")]),
      issue("2026-09-14", [article("new"), article("later")]),
      issue("2026-09-13", [article("legacy")], "legacy"),
    ],
    (i) => i.articles,
    "2026-09-13",
  )
  assert.equal(report.legacy_editions_not_counted, 1)
  assert.deepEqual(report.windows[0].domains, [{ domain: "example.com", events: 1 }])
})

test("concentration is a diagnostic only above the sample threshold", () => {
  const make = (n) =>
    sourceDiversity(
      [
        issue(
          "2026-09-13",
          Array.from({ length: n }, (_, i) => article(String(i))),
        ),
      ],
      (i) => i.articles,
      "2026-09-13",
    ).windows[0]
  assert.equal(make(9).additional_discovery_recommended, false)
  assert.equal(make(10).additional_discovery_recommended, true)
  assert.equal(make(10).events, 10)
  assert.equal(make(0).largest_source_percent, null)
})

test("excluded records do not contribute; invalid links are visible as unknown", () => {
  const r = sourceDiversity(
    [
      issue("2026-09-13", [
        { ...article("excluded"), review: { review_status: "excluded" } },
        { id: "broken", urls: [] },
      ]),
    ],
    (i) => i.articles,
    "2026-09-13",
  )
  assert.deepEqual(r.windows[0].domains, [{ domain: "unknown", events: 1 }])
})
