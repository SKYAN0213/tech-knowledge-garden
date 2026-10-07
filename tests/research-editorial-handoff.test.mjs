import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  buildEditorialHandoff,
  selectCandidateSource,
} from "../scripts/research/editorial-handoff.mjs"
import { main } from "../scripts/research.mjs"
import { researchWindow } from "../scripts/research-window.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import {
  dailyScan,
  storedListScan,
  reconcileDailyEdition,
} from "../scripts/research/daily-scan.mjs"
import { articleContentFingerprint, storeParseArtifact } from "../scripts/research/parser.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"

import {
  loadShadowCollectionInputs,
  loadShadowHandoffBasis,
} from "../scripts/research/shadow-collection-basis.mjs"
import { saveShadowCollectionBasis } from "../scripts/research/shadow-operations.mjs"

const candidate = (key, date, more = {}) => ({
  key,
  title: `Article ${key}`,
  source_urls: [`https://example.com/${key}`],
  source_published_at: date,
  discovered_at: "2026-09-29T01:00:00Z",
  review_status: "unreviewed",
  priority: "normal",
  ...more,
})
const plan = {
  run_id: "daily-20260929",
  cutoff: "2026-09-22T23:00:00Z",
  windows: [
    { channel_id: "first", since: "2026-09-22", until_exclusive: "2026-09-29" },
    { channel_id: "failed", since: "2026-09-22", until_exclusive: "2026-09-29" },
  ],
}
const receipts = [
  {
    status: "window_scanned",
    attempt_id: "complete-a1",
    channel_id: "first",
    since: "2026-09-22",
    until_exclusive: "2026-09-29",
    candidate_keys: ["published", "url-only", "revision", "new", "unverified", "rejected"],
  },
  {
    status: "incomplete",
    attempt_id: "failed-a1",
    channel_id: "failed",
    since: "2026-09-22",
    until_exclusive: "2026-09-29",
    candidate_keys: ["old"],
  },
]
const observations = receipts[0].candidate_keys.map((key) => ({
  attempt_id: "complete-a1",
  key,
  article_source_version_id: `source-version-${key}`,
  article_parse_id: `parse-${key}`,
  article_content_sha256: `content-${key}`,
}))
const backlog = {
  candidates: [
    candidate("published", "2026-09-25", { event_id: "published-id" }),
    candidate("url-only", "2026-09-25", {
      source_urls: ["https://example.com/published"],
    }),
    candidate("revision", "2026-09-25", {
      event_id: "published-id",
      source_revision_alert: true,
      review_status: "deferred",
      reason: "Changed original",
      article_source_version_id: "later-source-version",
      article_parse_id: "later-parse",
      article_content_sha256: "later-content",
    }),
    candidate("new", "2026-09-28", {
      article_source_version_id: "source-version-new",
      article_parse_id: "parse-new",
      article_content_sha256: "content-new",
    }),
    candidate("unverified", "2026-09-28"),
    candidate("old", "2026-09-19"),
    candidate("rejected", "2026-09-28", {
      review_status: "rejected",
      reason: "Not a new event",
    }),
  ],
}
const issues = [
  {
    key: "Editions/2026/09/2026-09-25",
    items: [
      {
        id: "published-id",
        urls: ["https://example.com/published"],
        review: { review_status: "verified", published_at: "2026-09-25" },
      },
      {
        id: "local-unverified-id",
        urls: ["https://example.com/unverified"],
        review: { review_status: "unreviewed", published_at: "2026-09-28" },
      },
    ],
  },
]

test("a shared source URL never confirms an event without a reviewed event ID", () => {
  const source = "https://example.com/rolling-announcements"
  const issueInventory = [
    {
      key: "Editions/2026/09/2026-09-24",
      items: [
        { id: "event-one", urls: [source], review: { review_status: "verified" } },
        { id: "event-two", urls: [source], review: { review_status: "verified" } },
      ],
    },
  ]
  const input = {
    candidates: [
      candidate("shared", "2026-09-28", { source_urls: [source] }),
      candidate("identified", "2026-09-28", {
        event_id: "event-two",
        source_urls: [source],
      }),
    ],
  }
  const result = researchWindow(
    "2026-09-22T23:00:00Z",
    "2026-09-29T02:00:00Z",
    input,
    issueInventory,
  )
  assert.equal(result.pending.length, 1)
  assert.equal(result.pending[0].next_route, "review-existing-identity")
  assert.equal(result.pending[0].publication, null)
  assert.deepEqual(
    result.pending[0].possible_publications.map((entry) => entry.event_id),
    ["event-one", "event-two"],
  )
  assert.equal(result.resolved[0].next_route, "already-published")
  assert.equal(result.resolved[0].publication.event_id, "event-two")
  assert.throws(
    () =>
      researchWindow(
        "2026-09-22T23:00:00Z",
        "2026-09-29T02:00:00Z",
        {
          candidates: [
            candidate("conflict", "2026-09-28", {
              event_id: "event-two",
              source_urls: ["https://example.com/only-event-one"],
            }),
          ],
        },
        [
          {
            key: "Editions/2026/09/2026-09-24",
            items: [
              {
                id: "event-one",
                urls: ["https://example.com/only-event-one"],
                review: { review_status: "verified" },
              },
              { id: "event-two", urls: [source], review: { review_status: "verified" } },
            ],
          },
        ],
      ),
    /Candidate combines different published events: conflict/,
  )
})

test("unverified local articles are not publication evidence in a research window", () => {
  const result = researchWindow(
    "2026-09-22T23:00:00Z",
    "2026-09-29T02:00:00Z",
    { candidates: [candidate("unverified-source", "2026-09-28")] },
    [
      {
        key: "Editions/2026/09/2026-09-28",
        items: [
          {
            id: "unverified-event",
            urls: ["https://example.com/unverified-source"],
            review: { review_status: "unreviewed" },
          },
        ],
      },
    ],
  )
  assert.equal(result.pending[0].next_route, "review-publication-time")
  assert.deepEqual(result.pending[0].possible_publications, [])
})

test("daily handoff connects matching source content without declaring a shared event", () => {
  const shared = "a".repeat(64)
  const input = {
    candidates: [
      candidate("first", "2026-09-28", {
        article_content_sha256: shared,
        event_id: "abcdef0123456789",
        review_status: "verified",
      }),
      candidate("second", "2026-09-29", { article_content_sha256: shared }),
    ],
  }
  const handoff = buildEditorialHandoff({
    plan: { ...plan, windows: [plan.windows[0]] },
    receipts: [{ ...receipts[0], candidate_keys: ["first", "second"] }],
    observations: [
      { attempt_id: "complete-a1", key: "first", article_content_sha256: shared },
      { attempt_id: "complete-a1", key: "second", article_content_sha256: shared },
    ],
    backlog: input,
    issues: [],
    observedAt: "2026-09-29T02:00:00Z",
  })
  const second = handoff.pending.find((entry) => entry.key === "second")
  assert.deepEqual(second.related_candidates, ["first"])
  assert.equal(second.next_route, "review-related-candidate")
  assert.equal(second.event_id, null)
  assert.equal(
    handoff.intake_ontology.relations.find(
      (relation) => relation.type === "sameExtractedContentCandidate",
    ).decision,
    "review_required",
  )
})

test("editorial handoff routes only exact published identities and keeps failed attempts out of today's observations", () => {
  const handoff = buildEditorialHandoff({
    plan,
    receipts,
    observations,
    backlog,
    issues,
    observedAt: "2026-09-29T02:00:00Z",
  })
  assert.equal(handoff.authority, "local_vault_unreconciled")
  assert.equal(handoff.completed_windows, 1)
  assert.equal(handoff.incomplete_windows[0].channel_id, "failed")
  assert.equal(handoff.counts.pending, 5)
  assert.equal(handoff.counts.pending_observed_in_run, 4)
  assert.equal(handoff.counts.observed_resolved, 2)
  assert.equal(handoff.counts.source_revision, 1)
  assert.equal(handoff.counts.existing_unverified, 1)
  assert.equal(handoff.counts.existing_identity, 1)
  assert.equal(handoff.counts.historical_review, 1)
  assert.equal(handoff.counts.review_publication_time, 1)
  assert.equal(handoff.counts.approved_unpublished, 0)
  const byKey = new Map(
    [...handoff.pending, ...handoff.observed_resolved].map((item) => [item.key, item]),
  )
  assert.equal(byKey.get("published").next_route, "already-published")
  assert.equal(byKey.get("url-only").next_route, "review-existing-identity")
  assert.equal(byKey.get("url-only").publication, null)
  assert.equal(byKey.get("url-only").possible_publications[0].event_id, "published-id")
  assert.equal(byKey.get("revision").next_route, "review-source-revision")
  assert.equal(byKey.get("revision").publication.event_id, "published-id")
  assert.equal(byKey.get("revision").current_source_version_observed_in_run, false)
  assert.equal(byKey.get("revision").source_evidence_state, "changed")
  assert.equal(byKey.get("new").next_route, "review-publication-time")
  assert.equal(byKey.get("new").publication, null)
  assert.equal(byKey.get("unverified").next_route, "review-existing-unverified")
  assert.equal(byKey.get("unverified").publication, null)
  assert.equal(byKey.get("unverified").possible_publications[0].event_id, "local-unverified-id")
  assert.equal(byKey.get("old").next_route, "historical-review")
  assert.equal(byKey.get("old").observed_in_run, false)
  assert.equal(byKey.get("old").source_evidence_state, "not_observed")
  assert.deepEqual(byKey.get("old").source_attempts, [])
  assert.deepEqual(byKey.get("new").source_attempts, [
    observations.find((item) => item.key === "new"),
  ])
  assert.equal(byKey.get("new").current_source_version_observed_in_run, true)
  assert.equal(byKey.get("new").source_evidence_state, "exact")
  assert.deepEqual(
    handoff.review_workstreams.map((group) => [group.route, group.candidate_keys]),
    [
      ["review-source-revision", ["revision"]],
      ["review-existing-identity", ["url-only"]],
      ["review-existing-unverified", ["unverified"]],
      ["review-publication-time", ["new"]],
      ["historical-review", ["old"]],
    ],
  )
  assert.equal(
    handoff.review_workstreams.find((group) => group.route === "review-publication-time")
      .exact_source_available,
    1,
  )
  assert.equal(byKey.get("rejected").next_route, "closed")
  assert.equal(handoff.candidate_published, false)
})

test("editorial handoff closes only daily windows backed by reconciled supplemental scans", () => {
  const supplemental = plan.windows[1]
  const handoff = buildEditorialHandoff({
    plan,
    receipts,
    observations,
    backlog,
    issues,
    observedAt: "2026-09-29T02:00:00Z",
    supplementalWindows: [supplemental],
  })
  assert.equal(handoff.completed_windows, 2)
  assert.deepEqual(handoff.incomplete_windows, [])
  assert.deepEqual(handoff.supplemental_windows, [supplemental])
  assert.throws(
    () =>
      buildEditorialHandoff({
        plan,
        receipts,
        observations,
        backlog,
        issues,
        observedAt: "2026-09-29T02:00:00Z",
        supplementalWindows: [{ ...supplemental, until_exclusive: "2026-09-30" }],
      }),
    /uniquely match the stored daily plan/,
  )
})

test("an approved but unpublished candidate is handed to edition assembly without repeating source review", () => {
  const approvedBacklog = structuredClone(backlog)
  const candidate = approvedBacklog.candidates.find((item) => item.key === "new")
  candidate.review_status = "verified"
  candidate.event_id = "abcdef0123456789"
  candidate.approval = {
    approved_run: "private-article",
    article_sha256: "a".repeat(64),
  }
  approvedBacklog.candidates.push({
    ...structuredClone(candidate),
    key: "zz-duplicate-source",
    title: "Same reviewed article from another source candidate",
    source_urls: ["https://example.com/duplicate-source"],
  })
  const handoff = buildEditorialHandoff({
    plan,
    receipts,
    observations,
    backlog: approvedBacklog,
    issues,
    observedAt: "2026-09-29T02:00:00Z",
  })
  const entry = handoff.pending.find((item) => item.key === "new")
  assert.equal(entry.next_route, "approved-unpublished")
  assert.deepEqual(entry.approval, candidate.approval)
  assert.deepEqual(entry.same_approved_event_candidate_keys, ["zz-duplicate-source"])
  assert.equal(
    handoff.pending.filter((item) => item.next_route === "approved-unpublished").length,
    1,
  )
  assert.equal(handoff.counts.approved_unpublished, 1)
  assert.equal(handoff.counts.review_publication_time, 0)
  assert.deepEqual(handoff.review_workstreams[1].candidate_keys, ["new"])
})

test("approved historical events retain approval without entering new edition assembly or source review", () => {
  const stored = structuredClone(backlog)
  const old = stored.candidates.find((item) => item.key === "old")
  old.review_status = "verified"
  old.event_id = "1111111111111111"
  old.approval = { approved_run: "historical-article", article_sha256: "b".repeat(64) }
  stored.candidates.push({ ...structuredClone(old), key: "zz-old-alias" })
  const handoff = buildEditorialHandoff({
    plan,
    receipts,
    observations,
    backlog: stored,
    issues,
    observedAt: "2026-09-29T02:00:00Z",
  })
  const entry = handoff.pending.find((item) => item.key === "old")
  assert.equal(entry.next_route, "approved-historical")
  assert.throws(
    () => selectCandidateSource("unused", handoff, "old"),
    /already has an approved article/,
  )
  assert.deepEqual(entry.approval, old.approval)
  assert.deepEqual(entry.same_approved_event_candidate_keys, ["zz-old-alias"])
  assert.equal(handoff.counts.approved_historical, 1)
  assert.equal(handoff.counts.approved_unpublished, 0)
  assert.equal(handoff.counts.historical_review, 0)
  assert.deepEqual(
    handoff.review_workstreams.find((item) => item.route === "approved-historical").candidate_keys,
    ["old"],
  )
  const window = researchWindow(plan.cutoff, "2026-09-29T02:00:00Z", stored, issues)
  assert.equal(
    window.resolved.find((item) => item.key === "zz-old-alias").next_route,
    "same-approved-event",
  )
  assert.deepEqual(stored.candidates.find((item) => item.key === "old").approval, old.approval)
})

test("approval does not supply an unknown original publication date and KST cutoff remains inclusive", () => {
  const approved = {
    review_status: "verified",
    event_id: "2222222222222222",
    approval: { approved_run: "current-article", article_sha256: "c".repeat(64) },
  }
  const queue = researchWindow(
    "2026-09-22T23:00:00Z",
    "2026-09-29T02:00:00Z",
    {
      schema: "research-candidates/v1",
      candidates: [
        candidate("undated", null, approved),
        candidate("boundary", "2026-09-23", { ...approved, event_id: "3333333333333333" }),
      ],
    },
    [],
  )
  assert.equal(
    queue.pending.find((item) => item.key === "undated").next_route,
    "verify-original-date",
  )
  assert.equal(
    queue.pending.find((item) => item.key === "boundary").next_route,
    "approved-unpublished",
  )
})

test("editorial handoff carries stored alternative-source attempts alongside today's observations", () => {
  const stored = structuredClone(backlog)
  const historical = {
    key: "new",
    attempt_id: "approved-alternative-source",
    source_url: "https://example.org/official-alternative",
    source_role: "official_alternative",
    article_source_version_id: "alternate-version",
    article_parse_id: "alternate-parse",
    article_content_sha256: "alternate-content",
  }
  stored.candidates.find((item) => item.key === "new").source_attempts = [historical]
  const handoff = buildEditorialHandoff({
    plan,
    receipts,
    observations,
    backlog: stored,
    issues,
    observedAt: "2026-09-29T02:00:00Z",
  })
  const routed = handoff.pending.find((item) => item.key === "new")
  assert.deepEqual(routed.source_attempts[0], historical)
  assert.equal(routed.source_attempts[1].attempt_id, "complete-a1")
  assert.equal(routed.observed_in_run, true)
})

test("editorial handoff refuses a completed candidate missing from the current backlog", () => {
  assert.throws(
    () =>
      buildEditorialHandoff({
        plan,
        receipts,
        observations,
        backlog: { candidates: backlog.candidates.filter((item) => item.key !== "new") },
        issues,
        observedAt: "2026-09-29T02:00:00Z",
      }),
    /absent from the current backlog: new/,
  )
})

test("editorial handoff routes a bilingual source record to its existing candidate", () => {
  const itemId = "cac278d8-4c5a-4f25-8c58-8759bd18b671"
  const englishUrl = "https://www.kuka.com/en-us/company/press/news/fsw"
  const identity = {
    publisher_id: "kuka",
    profile_id: "kuka-news-form-pages-v1",
    source_item_id: itemId,
  }
  const target = candidate("german-approved", "2026-09-24", {
    review_status: "verified",
    event_id: "496ab0bfbcdb42a4",
    source_record_aliases: [{ ...identity, source_url: englishUrl }],
    discovery: [
      { ...identity, language: "de" },
      { ...identity, language: "en" },
    ],
  })
  const receipt = {
    status: "window_scanned",
    attempt_id: "kuka-english-a1",
    channel_id: "kuka-news-en",
    since: "2026-09-20",
    until_exclusive: "2026-09-25",
    candidate_keys: ["kuka-english-candidate"],
  }
  const handoff = buildEditorialHandoff({
    plan: { ...plan, cutoff: "2026-09-24T23:00:00Z", windows: [plan.windows[0]] },
    receipts: [receipt],
    observations: [
      {
        attempt_id: receipt.attempt_id,
        key: "kuka-english-candidate",
        source_urls: [englishUrl],
        source_records: [{ ...identity, language: "en" }],
        article_source_version_id: "english-source-version",
        article_parse_id: "english-parse",
        article_content_sha256: "english-content",
      },
    ],
    backlog: { candidates: [target] },
    issues: [
      {
        key: "2026-09-24",
        items: [
          {
            id: target.event_id,
            urls: ["https://www.kuka.com/de-de/company/press/news/fsw"],
            review: { review_status: "verified", published_at: "2026-09-24" },
          },
        ],
      },
    ],
    observedAt: "2026-10-02T00:00:00Z",
  })

  assert.deepEqual(handoff.source_record_aliases, [
    {
      candidate_key: "kuka-english-candidate",
      candidate_url: englishUrl,
      target_candidate_key: "german-approved",
      ...identity,
      observed_in_current_run: true,
    },
  ])
  assert.equal(
    handoff.pending.some((entry) => entry.key === "kuka-english-candidate"),
    false,
  )
  assert.equal(
    handoff.observed_resolved.some((entry) => entry.key === "german-approved"),
    true,
  )
})

test("editorial handoff preserves verified same-event aliases without requiring a duplicate backlog row", () => {
  const aliasReceipt = {
    ...receipts[0],
    candidate_keys: ["official-alternative"],
    backlog_merge: {
      status: "merged",
      same_event_aliases: [
        {
          candidate_key: "official-alternative",
          candidate_url: "https://example.org/official-alternative",
          target_candidate_key: "published",
          resolution_run: "same-event-review",
        },
      ],
    },
  }
  const handoff = buildEditorialHandoff({
    plan: { ...plan, windows: [plan.windows[0]] },
    receipts: [aliasReceipt],
    observations: [
      {
        attempt_id: aliasReceipt.attempt_id,
        key: "official-alternative",
        article_source_version_id: "alternative-version",
        article_parse_id: "alternative-parse",
        article_content_sha256: "alternative-content",
      },
    ],
    backlog,
    issues,
    observedAt: "2026-09-29T02:00:00Z",
  })

  assert.deepEqual(handoff.same_event_sources, [
    {
      candidate_key: "official-alternative",
      candidate_url: "https://example.org/official-alternative",
      target_candidate_key: "published",
      resolution_run: "same-event-review",
      attempt_id: aliasReceipt.attempt_id,
      article_source_version_id: "alternative-version",
      article_parse_id: "alternative-parse",
      article_content_sha256: "alternative-content",
    },
  ])
  assert.equal(handoff.candidate_published, false)
})

test("editorial handoff hides an already-resolved backlog alias from pending review", () => {
  const handoff = buildEditorialHandoff({
    plan,
    receipts,
    observations,
    backlog,
    issues,
    observedAt: "2026-09-29T02:00:00Z",
    sameEventAliases: new Map([
      [
        "https://example.com/new",
        { candidate_key: "published", resolution_run: "same-event-review" },
      ],
    ]),
  })

  assert.equal(
    handoff.pending.some((item) => item.key === "new"),
    false,
  )
  assert.equal(handoff.counts.same_event_source_aliases, 1)
  assert.deepEqual(
    handoff.same_event_sources.find((item) => item.candidate_key === "new"),
    {
      candidate_key: "new",
      candidate_url: "https://example.com/new",
      target_candidate_key: "published",
      resolution_run: "same-event-review",
      observed_in_current_run: false,
    },
  )
  assert.equal(
    backlog.candidates.some((item) => item.key === "new"),
    true,
  )
})

function storedEmptyScan(root, runId, window) {
  const url = "https://example.com/official-feed"
  const body = Buffer.from("<rss><channel /></rss>")
  const bodySha = sha256(body)
  const source = sourceId(url)
  const bodyPath = `sources/${runId}.xml`
  atomicWrite(root, bodyPath, body)
  const scan = {
    summary: {
      status: "window_scanned",
      channel_id: window.channel_id,
      window: { since: window.since, until_exclusive: window.until_exclusive },
      candidate_count: 0,
    },
    indexDocuments: [
      {
        original_url: url,
        source_id: source,
        source_version_id: `${source}:${bodySha}`,
        fetch_status: "captured",
        body_path: bodyPath,
        body_sha256: bodySha,
      },
    ],
    documents: [],
    parses: [],
    candidates: [],
  }
  for (const [file, value] of Object.entries({
    "list-scan.json": scan.summary,
    "list-pages.json": scan.indexDocuments,
    "documents.json": scan.documents,
    "parses.json": scan.parses,
    "candidates.json": scan.candidates,
  }))
    atomicWrite(root, `runs/${runId}/${file}`, value)
  return storedListScan(root, runId)
}

function storedArticleScan(root, runId, window, { withSupportingSources = false } = {}) {
  const originalURL = "https://example.com/chip?mode=V&id=1"
  const candidateURL = "https://example.com/chip?id=1&mode=V"
  const body = "A dated official chip announcement"
  const id = sourceId(originalURL)
  const bodySha = sha256(body)
  const version = `${id}:${bodySha}`
  const bodyPath = `sources/${id}/${bodySha}.html`
  atomicWrite(root, bodyPath, body)
  const document = {
    original_url: originalURL,
    final_url: originalURL,
    source_id: id,
    source_version_id: version,
    fetch_status: "captured",
    body_path: bodyPath,
    body_sha256: bodySha,
    observed_at: "2026-09-29T01:00:00Z",
  }
  const parseId = sha256(version + ":article")
  const supportingURLs = withSupportingSources
    ? ["https://example.com/vision.pdf", "https://example.com/performance.pdf"]
    : []
  const parse = storeParseArtifact(root, {
    schema_version: "source-parse/v1",
    status: "extracted",
    title: "Official chip announcement",
    source_id: id,
    source_version_id: version,
    parse_id: parseId,
    dates: { published_at: "2026-09-27", observed_at: document.observed_at },
    blocks: [
      {
        block_id: parseId + ":b1",
        text: body,
        locator: { text_hash: sha256(body) },
      },
    ],
    quality: { required_fields_present: true, missing_pages: [] },
    attachments: supportingURLs.map((url) => ({ url, role: "unreviewed" })),
  })
  const supportingDocuments = supportingURLs.map((url, index) => {
    const supportingBody = `Supporting report ${index + 1}`
    const supportingHash = sha256(supportingBody)
    const supportingId = sourceId(url)
    const supportingVersion = `${supportingId}:${supportingHash}`
    const supportingPath = `sources/${supportingId}/${supportingHash}.pdf`
    atomicWrite(root, supportingPath, supportingBody)
    const supportingParseId = sha256(supportingVersion + ":report")
    const supportingParse = storeParseArtifact(root, {
      schema_version: "source-parse/v1",
      status: "extracted",
      title: `Supporting report ${index + 1}`,
      source_id: supportingId,
      source_version_id: supportingVersion,
      parse_id: supportingParseId,
      dates: { published_at: null, observed_at: document.observed_at },
      blocks: [
        {
          block_id: supportingParseId + ":b1",
          text: supportingBody,
          locator: { text_hash: supportingHash },
        },
      ],
      quality: { required_fields_present: true, missing_pages: [] },
    })
    return {
      document: {
        original_url: url,
        final_url: url,
        source_id: supportingId,
        source_version_id: supportingVersion,
        fetch_status: "captured",
        body_path: supportingPath,
        body_sha256: supportingHash,
        observed_at: document.observed_at,
      },
      parse: supportingParse,
    }
  })
  const candidate = {
    key: "source-" + sourceId(candidateURL),
    title: parse.title,
    source_urls: [candidateURL],
    source_published_at: parse.dates.published_at,
    discovered_at: document.observed_at,
    priority: "normal",
    review_status: "unreviewed",
    article_source_version_id: version,
    article_parse_id: parseId,
    article_content_sha256: articleContentFingerprint(parse),
    ...(supportingURLs.length ? { supporting_source_urls: supportingURLs } : {}),
  }
  const scan = {
    summary: {
      status: "window_scanned",
      channel_id: window.channel_id,
      window: { since: window.since, until_exclusive: window.until_exclusive },
      candidate_count: 1,
    },
    indexDocuments: [document],
    documents: [document, ...supportingDocuments.map((item) => item.document)],
    parses: [parse, ...supportingDocuments.map((item) => item.parse)],
    candidates: [candidate],
  }
  for (const [file, value] of Object.entries({
    "list-scan.json": scan.summary,
    "list-pages.json": scan.indexDocuments,
    "documents.json": scan.documents,
    "parses.json": scan.parses,
    "candidates.json": scan.candidates,
  }))
    atomicWrite(root, `runs/${runId}/${file}`, value)
  return storedListScan(root, runId)
}

test("daily execution creates a private handoff and resume leaves it unchanged", async (t) => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-handoff-")))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const root = path.join(directory, "research")
  const vault = path.join(directory, "vault")
  const configFile = path.join(directory, "daily-routes.json")
  const backlogFile = path.join(directory, "candidate-backlog.json")
  fs.mkdirSync(path.join(vault, "Editions"), { recursive: true })
  fs.writeFileSync(
    path.join(vault, "Editions", "2026-09-29.md"),
    "---\ndate: 2026-09-29\ncoverage_end: 2026-09-28T23:00:00Z\n---\n\n# Source List\n",
  )
  fs.writeFileSync(
    configFile,
    JSON.stringify({
      schema: "research-daily-routes/v1",
      lookback_days: 7,
      max_window_days: 7,
      routes: [{ channel_id: "fanuc-en", enabled: true, baseline_run: "baseline" }],
    }),
  )
  storedEmptyScan(root, "baseline", {
    channel_id: "fanuc-en",
    since: "2026-09-22",
    until_exclusive: "2026-09-29",
  })
  const calls = []
  const options = {
    runId: "daily-20260929-integration",
    root,
    vault,
    configFile,
    backlogFile,
    now: "2026-09-29T01:00:00Z",
    scan: async (window, id) => {
      const collectingRun = id.startsWith("daily-20260929-drive")
        ? "daily-20260929-drive"
        : options.runId
      const inputs = loadShadowCollectionInputs(root, collectingRun)
      assert.ok(inputs, "acquisition inputs must be frozen before the first request")
      assert.equal(readJSON(root, `daily/runs/${collectingRun}/shadow-basis.json`), null)
      calls.push(id)
      return storedEmptyScan(root, id, window)
    },
    merge: async () => ({ status: "merged", changed: false }),
  }
  const first = await dailyScan({ ...options, mode: "execute" })
  assert.equal(first.status, "configured_routes_scanned")
  assert.equal(first.editorial_handoff.pending, 0)
  const handoffPath = first.editorial_handoff.path
  const handoff = readJSON(root, handoffPath)
  assert.equal(handoff.authority, "local_vault_unreconciled")
  assert.equal(handoff.completed_windows, 2)
  assert.equal(handoff.candidate_published, false)
  const basis = loadShadowHandoffBasis(root, first.shadow_collection_basis)
  assert.equal(basis.phase, "handoff")
  assert.equal(basis.backlog, null, "absence is pinned without fabricating a backlog")
  assert.equal(basis.handoff.sha256, sha256(fs.readFileSync(path.join(root, handoffPath))))
  assert.equal(basis.candidate_published, false)
  assert.equal(basis.comparison_completed, false)
  assert.deepEqual(
    await saveShadowCollectionBasis({ root, dailyRun: options.runId }),
    first.shadow_collection_basis,
  )
  const beforeBasis = fs.readFileSync(path.join(root, first.shadow_collection_basis.path))
  const before = fs.readFileSync(path.join(root, handoffPath))
  const second = await dailyScan({ ...options, mode: "resume" })
  assert.equal(second.editorial_handoff.path, handoffPath)
  assert.deepEqual(fs.readFileSync(path.join(root, handoffPath)), before)
  assert.equal(calls.length, 2)
  assert.deepEqual(second.shadow_collection_basis, first.shadow_collection_basis)
  fs.writeFileSync(
    backlogFile,
    JSON.stringify({ schema: "research-candidates/v1", candidates: [] }),
  )
  const updated = await dailyScan({ ...options, mode: "handoff" })
  assert.notEqual(updated.path, handoffPath)
  assert.notEqual(updated.shadow_collection_basis.path, first.shadow_collection_basis.path)
  assert.equal(
    loadShadowHandoffBasis(root, updated.shadow_collection_basis).backlog.sha256,
    sha256(fs.readFileSync(backlogFile)),
  )
  assert.deepEqual(
    fs.readFileSync(path.join(root, first.shadow_collection_basis.path)),
    beforeBasis,
  )
  assert.deepEqual(loadShadowHandoffBasis(root, first.shadow_collection_basis), basis)
  assert.equal(calls.length, 2, "handoff regeneration cannot request sources again")

  // A genuinely older run can regenerate its handoff, but today's code cannot
  // manufacture the original acquisition snapshot for a comparison.
  fs.renameSync(
    path.join(root, `evaluation/shadow-inputs/${options.runId}`),
    path.join(root, "original-inputs-away"),
  )
  const legacy = await dailyScan({ ...options, mode: "handoff" })
  assert.equal(legacy.shadow_collection_basis, null)
  assert.equal(legacy.shadow_basis_status, "missing_original_collection_inputs")
  fs.renameSync(
    path.join(root, "original-inputs-away"),
    path.join(root, `evaluation/shadow-inputs/${options.runId}`),
  )

  const sourceFiles = {}
  for (const name of ["Knowledge", "Signals", "TrendTopics"]) {
    const file = path.join(vault, name, "sample.md")
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, `# ${name}\n`)
    sourceFiles[`${name}/sample.md`] = fs.readFileSync(file, "utf8")
  }
  sourceFiles["Editions/2026-09-29.md"] = fs.readFileSync(
    path.join(vault, "Editions/2026-09-29.md"),
    "utf8",
  )
  const snapshotFile = path.join(directory, "drive-snapshot.json")
  fs.writeFileSync(
    snapshotFile,
    JSON.stringify({
      schema: "tech-drive-source/v1",
      root_folder_id: "1VKWSC2IYOtOd__3NKEzD-BK34qVqtlAD",
      roots: ["Editions", "Knowledge", "Signals", "TrendTopics"],
      complete: true,
      exported_at: new Date().toISOString(),
      files: Object.entries(sourceFiles).map(([file, content]) => ({
        path: file,
        content,
        sha256: sha256(content),
      })),
    }),
  )
  const driveRun = "daily-20260929-drive"
  const driveOptions = {
    ...options,
    runId: driveRun,
    driveSnapshotFile: snapshotFile,
  }
  await dailyScan({ ...driveOptions, mode: "plan-only" })
  const drivePlan = readJSON(root, `daily/runs/${driveRun}/plan.json`)
  assert.equal(drivePlan.cutoff_basis, "provided_drive_snapshot_matched")
  assert.equal(drivePlan.edition.source_files, 4)
  const driveResult = await dailyScan({ ...driveOptions, mode: "execute" })
  const driveHandoff = readJSON(root, driveResult.editorial_handoff.path)
  assert.equal(driveHandoff.authority, "provided_drive_snapshot_matched")
  assert.equal(driveHandoff.drive_verified, false)
  assert.equal(driveHandoff.public_verified, false)
  const originalHandoff = fs.readFileSync(path.join(root, driveResult.editorial_handoff.path))
  fs.writeFileSync(
    path.join(vault, "Editions", "2026-09-27.md"),
    "---\ndate: 2026-09-27\ncoverage_end: 2026-09-26T23:00:00Z\n---\n",
  )
  await assert.rejects(
    () => dailyScan({ ...options, runId: driveRun, mode: "handoff" }),
    /Local edition inventory changed after daily planning/,
  )
  assert.deepEqual(
    fs.readFileSync(path.join(root, driveResult.editorial_handoff.path)),
    originalHandoff,
  )
  const originalPlan = fs.readFileSync(path.join(root, `daily/runs/${driveRun}/plan.json`))
  const context = await reconcileDailyEdition({ root, runId: driveRun, vault })
  const reconciled = await dailyScan({ ...options, runId: driveRun, mode: "handoff" })
  const reconciledHandoff = readJSON(root, reconciled.path)
  assert.equal(reconciledHandoff.authority, "local_vault_unreconciled")
  assert.equal(reconciledHandoff.drive_verified, false)
  assert.deepEqual(reconciledHandoff.inputs.editorial_context, {
    path: context.path,
    sha256: context.sha256,
  })
  assert.notEqual(reconciled.path, driveResult.editorial_handoff.path)
  assert.deepEqual(
    fs.readFileSync(path.join(root, `daily/runs/${driveRun}/plan.json`)),
    originalPlan,
  )
  assert.deepEqual(
    fs.readFileSync(path.join(root, driveResult.editorial_handoff.path)),
    originalHandoff,
  )
  loadShadowHandoffBasis(root, reconciled.shadow_collection_basis)
  const callsBefore = calls.length
  const reused = await reconcileDailyEdition({ root, runId: driveRun, vault })
  assert.equal(reused.reused, true)
  assert.equal(calls.length, callsBefore, "editorial reconciliation makes no source requests")
  fs.appendFileSync(path.join(vault, "Editions/2026-09-29.md"), "\nCorrected source-backed text.\n")
  await reconcileDailyEdition({ root, runId: driveRun, vault })
  loadShadowHandoffBasis(root, reconciled.shadow_collection_basis)
  assert.notEqual(
    (await dailyScan({ ...options, runId: driveRun, mode: "handoff" })).path,
    reconciled.path,
  )
})

test("a daily candidate selects its exact stored source without rediscovery or publication", async (t) => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-candidate-")))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const root = path.join(directory, "research")
  const vault = path.join(directory, "vault")
  const backlogFile = path.join(directory, "candidate-backlog.json")
  const configFile = path.join(directory, "routes.json")
  fs.mkdirSync(path.join(vault, "Editions"), { recursive: true })
  fs.writeFileSync(
    path.join(vault, "Editions", "2026-09-29.md"),
    "---\ndate: 2026-09-29\ncoverage_end: 2026-09-28T23:00:00Z\n---\n\n# Sources\n",
  )
  fs.writeFileSync(
    configFile,
    JSON.stringify({
      schema: "research-daily-routes/v1",
      lookback_days: 7,
      max_window_days: 7,
      routes: [{ channel_id: "fanuc-en", enabled: true, baseline_run: "baseline" }],
    }),
  )
  storedEmptyScan(root, "baseline", {
    channel_id: "fanuc-en",
    since: "2026-09-22",
    until_exclusive: "2026-09-29",
  })
  let requests = 0
  const daily = await dailyScan({
    runId: "daily-20260929-candidate",
    mode: "execute",
    root,
    vault,
    configFile,
    backlogFile,
    now: "2026-09-29T01:00:00Z",
    scan: async (window, id) => {
      requests++
      return window.since === "2026-09-22"
        ? storedArticleScan(root, id, window, { withSupportingSources: true })
        : storedEmptyScan(root, id, window)
    },
    merge: async (scan) => {
      if (scan.candidates.length)
        fs.writeFileSync(
          backlogFile,
          JSON.stringify({ schema: "research-candidates/v1", candidates: scan.candidates }),
        )
      return { status: "merged", changed: Boolean(scan.candidates.length) }
    },
  })
  assert.equal(daily.status, "configured_routes_scanned")
  const handoff = readJSON(root, daily.editorial_handoff.path)
  const key = handoff.pending[0].key
  assert.equal(handoff.pending[0].source_evidence_state, "exact")
  const collection = loadShadowHandoffBasis(root, daily.shadow_collection_basis)
  assert.equal(collection.backlog.sha256, handoff.inputs.backlog_sha256)
  const frozenBacklog = readJSON(root, collection.backlog.path)
  assert.equal(frozenBacklog.candidates[0].key, key)
  assert.equal(frozenBacklog.candidates[0].article_parse_id, handoff.pending[0].article_parse_id)
  const args = [
    "select-candidate",
    "--root",
    root,
    "--run",
    "selected-candidate",
    "--daily-run",
    "daily-20260929-candidate",
    "--candidate-key",
    key,
    "--vault",
    vault,
    "--backlog",
    backlogFile,
  ]
  const result = await main(args)
  assert.equal(result.candidate_key, key)
  assert.equal(result.sources, 3)
  assert.equal(result.candidate_published, false)
  const selected = readJSON(root, "runs/selected-candidate/source-selection.json")
  assert.equal(selected.candidate_key, key)
  assert.equal(selected.selected_urls[0], "https://example.com/chip?mode=V&id=1")
  assert.deepEqual(selected.selected_urls.slice(1), [
    "https://example.com/vision.pdf",
    "https://example.com/performance.pdf",
  ])
  assert.equal(selected.daily_run, "daily-20260929-candidate")
  assert.equal(selected.candidate_published, false)
  const before = fs.readFileSync(path.join(root, "runs/selected-candidate/source-selection.json"))
  assert.deepEqual(await main(args), result)
  assert.deepEqual(
    fs.readFileSync(path.join(root, "runs/selected-candidate/source-selection.json")),
    before,
  )
  const resumed = await dailyScan({
    runId: "daily-20260929-candidate",
    mode: "resume",
    root,
    vault,
    configFile,
    backlogFile,
    now: "2026-09-29T01:00:00Z",
    scan: async () => {
      throw Error("No source requests allowed on this resume")
    },
    merge: async () => {
      throw Error("No second backlog merge allowed")
    },
  })
  assert.deepEqual(resumed.shadow_collection_basis, daily.shadow_collection_basis)
  assert.equal(requests, 2)
  fs.writeFileSync(
    backlogFile,
    JSON.stringify({ schema: "research-candidates/v1", candidates: [] }),
  )
  await assert.rejects(() => main(args), /absent from the current backlog/)
  assert.deepEqual(
    fs.readFileSync(path.join(root, "runs/selected-candidate/source-selection.json")),
    before,
  )
})
