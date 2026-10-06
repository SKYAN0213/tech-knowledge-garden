import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { buildContextPage, contextHash } from "../scripts/research/context-page.mjs"
import { main } from "../scripts/research-context.mjs"

function fixture() {
  return {
    latest_cutoff: "2026-10-05T20:21:45Z",
    latest_issue: { date: "2026-10-06", articles: [] },
    research_policy: { channels: ["기술·제품", "기업·운영"] },
    source_diversity: { windows: [{ sectors: Array.from({ length: 8 }, (_, i) => i) }] },
    discovery_window: {
      publication_after: "2026-10-05T20:21:45Z",
      backlog_state: "loaded",
      resolved: [],
      pending: Array.from({ length: 43 }, (_, i) => ({
        key: `candidate-${i}`,
        title: `Title ${i}`,
        next_route: i % 2 ? "historical-review" : "review-source-revision",
        source_urls: [`https://example.org/${i}`],
        source_revision_alert: true,
        article_source_version_id: `version-${i}`,
        article_parse_id: `parse-${i}`,
        review_status: "unreviewed",
        approval: { event_id: `event-${i}` },
        discovery: Array.from({ length: 40 }, (_, j) => ({
          discovered_at: String(j),
          parse_id: `list-${j}`,
        })),
        source_revision_resolutions: [{ version: "old" }, { version: "new" }],
      })),
    },
    discovery_sources: { channels: [{ id: "domestic", region: "domestic", axis: "company" }] },
    watchlist: { companies: [], institutions: [], robot_manufacturers: [] },
    known_sources: [],
    known_entities: [],
    recent_classified_events: [],
    trend_topics: [],
    editorial: { next_deep_kind: "paper", article_evidence: [], recent_deep: [] },
  }
}
const pinned = { input: "private-context.json", sha256: "a".repeat(64) }

test("bounded pages cover every candidate exactly once and preserve conflict/identity fields", () => {
  const context = fixture(),
    original = JSON.stringify(context),
    keys = []
  let offset = 0
  do {
    const output = buildContextPage(context, { ...pinned, offset, limit: 20, maxBytes: 6000 })
    assert.ok(Buffer.byteLength(JSON.stringify(output, null, 2) + "\n") <= 6000)
    for (const row of output.page.items) {
      keys.push(row.key)
      assert.equal(row.source_revision_alert, true)
      assert.equal(row.article_parse_id, `parse-${row.key.split("-")[1]}`)
      assert.equal(row.history_summary.discovery.count, 40)
      assert.equal(row.history_summary.discovery.latest.parse_id, "list-39")
      assert.equal(row.history_summary.source_revision_resolutions.count, 2)
      assert.equal(row.detail_required_before_approval, true)
    }
    offset = output.page.next_offset
  } while (offset !== null)
  assert.deepEqual(
    keys,
    context.discovery_window.pending.map((row) => row.key),
  )
  assert.equal(JSON.stringify(context), original)
})

test("exact lookup returns the original record including complete discovery and resolutions", () => {
  const context = fixture()
  assert.deepEqual(buildContextPage(context, { ...pinned, candidate: "candidate-3" }).page.items, [
    context.discovery_window.pending[3],
  ])
  const output = buildContextPage(context, { ...pinned, route: "historical-review" })
  assert.equal(output.page.total, 21)
  assert.ok(output.page.items.every((row) => row.next_route === "historical-review"))
  assert.equal(output.discovery_window.pending_count, 43)
  assert.deepEqual(output.source_diversity, context.source_diversity)
  assert.equal(
    buildContextPage(context, { ...pinned, section: "sources" }).page.items[0].region,
    "domestic",
  )
})

test("invalid cursors, selectors, missing records and oversized items fail without omissions", () => {
  for (const options of [
    { offset: -1 },
    { offset: 44 },
    { limit: 0 },
    { limit: 101 },
    { section: "invented" },
    { route: "invented" },
    { candidate: "missing" },
    { candidate: "candidate-0", offset: 1 },
    { section: "sources", route: "historical-review" },
    { maxBytes: 1000 },
  ])
    assert.throws(() => buildContextPage(fixture(), { ...pinned, ...options }))
  const context = fixture()
  context.discovery_window.pending.push(context.discovery_window.pending[0])
  assert.throws(
    () => buildContextPage(context, { ...pinned, candidate: "candidate-0" }),
    /exactly one/,
  )
})

test("CLI replays pinned bytes and rejects a changed snapshot or unknown flags", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "research-context-"))
  try {
    const input = path.join(dir, "context.json"),
      bytes = JSON.stringify(fixture())
    fs.writeFileSync(input, bytes)
    const hash = contextHash(bytes)
    const page = main(["--input", input, "--sha256", hash, "--limit", "3"])
    assert.equal(page.page.returned, 3)
    assert.equal(page.snapshot.sha256, hash)
    assert.equal(fs.readFileSync(input, "utf8"), bytes)
    assert.throws(() => main(["--input", input, "--offset", "1.5"]), /integer/)
    assert.throws(() => main(["--input", input, "--unknown"]), /Unknown option/)
    fs.writeFileSync(input, bytes + " ")
    assert.throws(() => main(["--input", input, "--sha256", hash]), /SHA-256 mismatch/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
