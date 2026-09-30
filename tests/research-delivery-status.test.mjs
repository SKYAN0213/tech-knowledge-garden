import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  buildIntakeOntologyAudit,
  buildSourceInventory,
  loadTargetedSearchRuns,
} from "../scripts/research/delivery-status.mjs"

test("source inventory keeps registered-only routes visible and marks daily scope separately", () => {
  const inventory = buildSourceInventory({
    knownRoutes: [
      {
        id: "inactive-unclassified",
        name: "Pending source",
        sectors: ["AI"],
        region: "국내",
        kind: "미분류",
      },
      {
        channel_id: "registered-channel-only",
        name: "Legacy source",
        sectors: ["AI"],
        region: "해외",
        kind: "research",
      },
      {
        id: "active-company",
        name: "Active source",
        sectors: ["AI"],
        region: "해외",
        kind: "company",
        verification: "verified",
        method: "rss",
      },
    ],
    activeRoutes: [{ channel_id: "active-company", enabled: true, baseline_run: "baseline-run" }],
  })

  assert.equal(inventory.length, 3)
  assert.equal(inventory[0].id, "active-company")
  assert.equal(inventory[0].daily_enabled, true)
  assert.equal(inventory[0].baseline_run, "baseline-run")
  assert.equal(inventory[1].id, "registered-channel-only")
  assert.equal(inventory[1].daily_enabled, false)
  assert.equal(inventory[1].development_status, "registered_only")
  assert.equal(inventory[2].id, "inactive-unclassified")
})

test("delivery status reports ontology review links from the candidate ledger without modifying it", (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "research-delivery-status-"))
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }))
  const candidatePath = path.join(repo, ".local/research/candidate-backlog.json")
  fs.mkdirSync(path.dirname(candidatePath), { recursive: true })
  const ledger = {
    schema: "research-candidates/v1",
    candidates: [
      {
        key: "source-one",
        title: "Example robotics announcement",
        source_urls: ["https://example.org/story?utm_source=rss"],
        source_published_at: "2026-09-29",
        review_status: "unreviewed",
        article_source_version_id: `source-one:${"a".repeat(64)}`,
        article_content_sha256: "b".repeat(64),
      },
      {
        key: "source-two",
        title: "Example robotics announcement",
        source_urls: ["https://example.org/story#details"],
        source_published_at: "2026-09-29",
        review_status: "verified",
        event_id: "0123456789abcdef",
        article_source_version_id: `source-two:${"c".repeat(64)}`,
        article_content_sha256: "b".repeat(64),
      },
    ],
  }
  fs.writeFileSync(candidatePath, JSON.stringify(ledger))
  const before = fs.readFileSync(candidatePath)

  const result = buildIntakeOntologyAudit(repo)

  assert.equal(result.status, "read_only_projection")
  assert.equal(result.candidate_count, 2)
  assert.deepEqual(result.ontology.node_counts, {
    Candidate: 2,
    Event: 1,
    Source: 1,
    SourceVersion: 2,
  })
  assert.equal(result.ontology.review_required_count, 3)
  assert.deepEqual(
    result.ontology.review_relations.map((relation) => relation.type),
    ["sameExtractedContentCandidate", "sameTitleDayCandidate", "sharedCanonicalSourceCandidate"],
  )
  assert.deepEqual(fs.readFileSync(candidatePath), before)
})

test("delivery status maps targeted search receipts back to source registrations", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "research-targeted-search-status-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const run = path.join(root, "runs/target-run")
  fs.mkdirSync(run, { recursive: true })
  fs.writeFileSync(
    path.join(run, "targeted-queries.json"),
    JSON.stringify({
      schema: "research-source-targeted-plan/v1",
      run_id: "target-run",
      daily_basis: { daily_run: "daily-run" },
      unresolved_slots: ["4-0-1"],
      candidate_published: false,
      queries: [
        {
          slot_id: "target-0-0-0-0",
          source_channel_id: "registered-source",
          source_url: "https://example.org/news",
        },
      ],
    }),
  )
  fs.writeFileSync(
    path.join(run, "search.json"),
    JSON.stringify({
      records: [
        {
          slot_id: "target-0-0-0-0",
          status: "partial",
          result_count: 7,
          candidate_count: 4,
          failures: [["engine-one", "CAPTCHA"]],
        },
        {
          slot_id: "target-0-0-0-1",
          status: "failed",
          error: "No usable search results; engines reported failures",
        },
      ],
      candidates: [
        { key: "one", source_urls: ["https://example.org/a?utm_source=rss"] },
        { key: "one-copy", source_urls: ["https://example.org/a#article"] },
        { key: "two", source_urls: ["https://example.org/b"] },
      ],
    }),
  )

  const [result] = loadTargetedSearchRuns(root)

  assert.equal(result.summary.run_id, "target-run")
  assert.equal(result.summary.planned_queries, 1)
  assert.equal(result.summary.recorded_queries, 2)
  assert.deepEqual(result.summary.query_statuses, { failed: 1, partial: 1 })
  assert.equal(result.summary.queries_with_candidates, 1)
  assert.equal(result.summary.failed_queries, 1)
  assert.equal(result.summary.engine_failures, 1)
  assert.equal(result.summary.candidates, 3)
  assert.equal(result.summary.unique_candidate_urls, 2)
  assert.equal(result.summary.duplicate_candidate_rows, 1)
  assert.equal(result.summary.candidates_missing_canonical_url, 0)
  assert.equal(result.summary.failed_queries_without_engine_details, 1)
  assert.equal(result.records[0].source_channel_id, "registered-source")
  assert.equal(result.records[0].engine_failure_count, 1)
})
