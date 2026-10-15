import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { inspectManualCapture, readableCaptureBody } from "../scripts/research/archive.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { eventDateMetadata } from "../scripts/research/event-date.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "undated-readable-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const url = "https://example.org/index/new-models/"
  const transcript = Buffer.from(
    `New models (${url})\nciteturn1view0 [wordlim: 200] Total lines: 3\nL0: # New models\nL1: We are introducing two new models.\nL2: September 29 Update: a separate later update.\n`,
  )
  const source = {
    name: "models", original_url: url, final_url: url,
    observed_at: "2026-10-11T00:00:00Z", http_status: null,
    mime_type: "text/markdown", body_path: "models.md",
    readable: {
      provider: "web.run", source_reference: "turn1view0", first_line: 0, last_line: 2,
      transcript_path: "models.txt", transcript_sha256: sha256(transcript),
    },
    parse_options: { markdown_title_line: 1, publication_date_policy: "not-observed" },
  }
  const body = readableCaptureBody(transcript.toString(), source)
  Object.assign(source, { body_sha256: sha256(body), body_bytes: body.length })
  const manifest = { schema: "manual-readable-capture/v1", article_review_status: "unreviewed", sources: [source] }
  const blocked = [{ original_url: url, source_id: sourceId(url), fetch_status: "blocked", http_status: 403, policy_status: "checked", policy: { allowed: true } }]
  const manifestPath = "captures/models/manifest.json"
  atomicWrite(root, manifestPath, manifest)
  atomicWrite(root, "captures/models/models.md", body)
  atomicWrite(root, "captures/models/models.txt", transcript)
  atomicWrite(root, "runs/blocked/documents.json", blocked)
  return { root, source, manifest, manifestPath, blocked, body }
}

test("explicit undated readable capture preserves later update text without borrowing its date", (t) => {
  const f = fixture(t)
  const input = inspectManualCapture(f.root, f.manifestPath, "blocked")
  assert.deepEqual(input.entries[0].body, f.body)
  assert.deepEqual(input.entries[0].source.parse_options, f.source.parse_options)
  assert.equal(input.entries[0].source.http_status, null)
  assert.equal(input.entries[0].source.observed_at, f.source.observed_at)
  assert.equal(input.identity.blocked_documents_sha256, sha256(fs.readFileSync(path.join(f.root, "runs/blocked/documents.json"))))
})

test("undated imports reject implicit dates, conflicting selectors, other URLs and publishers", (t) => {
  const f = fixture(t)
  for (const parse_options of [
    {}, { markdown_title_line: 1 },
    { ...f.source.parse_options, publication_date_policy: "infer" },
    { ...f.source.parse_options, markdown_publication_date_line: 3 },
    { ...f.source.parse_options, publication_date_format: "%B %d" },
    { ...f.source.parse_options, publication_date_pattern: "September 29" },
    { ...f.source.parse_options, listing_published_at: "2026-09-22" },
    { ...f.source.parse_options, markdown_title_line: 4 },
  ]) {
    atomicWrite(f.root, f.manifestPath, { ...f.manifest, sources: [{ ...f.source, parse_options }] })
    assert.throws(() => inspectManualCapture(f.root, f.manifestPath, "blocked"), /explicit date parse options/)
  }
  for (const change of [
    { original_url: "https://example.org/index/other-event/" },
    { final_url: "https://other-publisher.example/index/new-models/" },
  ]) {
    atomicWrite(f.root, f.manifestPath, { ...f.manifest, sources: [{ ...f.source, ...change }] })
    assert.throws(() => inspectManualCapture(f.root, f.manifestPath, "blocked"), /Matching policy-allowed|another origin/)
  }
  atomicWrite(f.root, f.manifestPath, f.manifest)
  atomicWrite(f.root, "runs/blocked/documents.json", [{ ...f.blocked[0], policy: { allowed: false } }])
  assert.throws(() => inspectManualCapture(f.root, f.manifestPath, "blocked"), /policy-allowed/)
})

test("undated source alone cannot approve an event date; exact used feed date remains required", () => {
  const body = {
    parse_id: "primary-parse", source_id: "primary", source_version_id: "primary:body",
    dates: { published_at: null }, blocks: [{ block_id: "body", text: "New models", locator: { text_hash: sha256("New models") } }],
  }
  const feed = {
    parse_id: "rss-parse", source_id: "rss", source_version_id: "rss:exact-bytes",
    dates: { published_at: "2026-09-22", modified_at: "2026-09-29", profile_status: "matched", basis: { dom_path: "/rss/channel/item[45]/pubDate", text: "Tue, 22 Sep 2026 18:00:00 GMT" } },
    blocks: [],
  }
  const claim = {
    claim_id: "announcement", published_at: "2026-09-22",
    evidence: [{ source_id: body.source_id, source_version_id: body.source_version_id, parse_id: body.parse_id, block_id: "body", support: "direct" }],
  }
  const review = { published_at: "2026-09-22" }
  assert.throws(() => eventDateMetadata(review, [claim], [body]), /supporting source date/)
  const basis = { kind: "source-publication-day", source_id: feed.source_id, source_version_id: feed.source_version_id, parse_id: feed.parse_id, claim_id: claim.claim_id, source_published_at: "2026-09-22" }
  const direct = { source_id: feed.source_id, source_version_id: feed.source_version_id, parse_id: feed.parse_id, block_id: "rss-date", support: "direct" }
  claim.evidence.push(direct)
  const explicit = { ...review, event_date_basis: basis }
  assert.deepEqual(eventDateMetadata(explicit, [claim], [body, feed]), { date_kind: "source-publication-day", source_published_at: "2026-09-22" })
  assert.equal(body.dates.published_at, null)
  for (const mutate of [
    (s) => { s.review.event_date_basis.source_version_id = "rss:other-item" },
    (s) => { s.review.event_date_basis.source_id = "other-publisher" },
    (s) => { s.review.published_at = "2026-09-29"; s.review.event_date_basis.source_published_at = "2026-09-29" },
    (s) => { s.claim.evidence.pop() },
    (s) => { s.feed.dates.profile_status = "not-configured" },
  ]) {
    const s = structuredClone({ review: explicit, claim, feed })
    mutate(s)
    assert.throws(() => eventDateMetadata(s.review, [s.claim], [body, s.feed]), /exact used source date/)
  }
})

test("RFC2822 publisher header retains time and requires the exact Seoul publication day", () => {
  const stamp = "2026-09-22T18:00:00Z"
  const header = "Tue, 22 Sep 2026 18:00:00 GMT"
  const feed = {
    parse_id: "rss-time-parse", source_id: "rss", source_version_id: "rss:exact-bytes",
    dates: { published_at: stamp, precision: "timestamp", profile_status: "matched", basis: { dom_path: "/rss/channel/item[45]/pubDate", text: header } },
    blocks: [],
  }
  const claim = { claim_id: "announcement", published_at: stamp, evidence: [{ source_id: feed.source_id, source_version_id: feed.source_version_id, parse_id: feed.parse_id, block_id: "rss-date", support: "direct" }] }
  const review = { published_at: "2026-09-23", event_date_basis: { kind: "source-publication-time", source_id: feed.source_id, source_version_id: feed.source_version_id, parse_id: feed.parse_id, claim_id: claim.claim_id, source_published_at: stamp, timezone: "Asia/Seoul" } }
  assert.deepEqual(eventDateMetadata(review, [claim], [feed]), { date_kind: "source-publication-time", source_published_at: stamp })
  const withOffset = structuredClone(feed)
  withOffset.dates.basis.text = "Wed, 23 Sep 2026 03:00:00 +0900"
  assert.deepEqual(eventDateMetadata(review, [claim], [withOffset]), { date_kind: "source-publication-time", source_published_at: stamp })
  const iso = structuredClone(feed)
  iso.dates.basis.text = stamp
  assert.deepEqual(eventDateMetadata(review, [claim], [iso]), { date_kind: "source-publication-time", source_published_at: stamp })
  for (const mutate of [
    (s) => { s.review.published_at = "2026-09-22" },
    (s) => { s.feed.dates.basis.text = "Tue, 22 Sep 2026 17:00:00 GMT" },
    (s) => { s.feed.dates.basis.text = "Mon, 22 Sep 2026 18:00:00 GMT" },
    (s) => { s.feed.dates.basis.text = "Tue, 22 Sep 2026 18:00:00" },
    (s) => { s.feed.dates.basis.text = "Tue, 22 Sep 2026 18:00:00 EST" },
    (s) => { s.feed.dates.basis.text = "Tue, 31 Sep 2026 18:00:00 GMT" },
    (s) => { s.feed.dates.basis.text = "Tue, 22 Sep 2026 18:00:60 GMT" },
    (s) => { s.feed.dates.basis.text = "Tue, 22 Sep 2026 18:00:00 +2460" },
    (s) => { s.review.event_date_basis.source_version_id = "rss:other-item" },
    (s) => { s.claim.evidence[0].source_id = "other-publisher" },
    (s) => { s.feed.dates.precision = "day" },
  ]) {
    const s = structuredClone({ review, claim, feed })
    mutate(s)
    assert.throws(() => eventDateMetadata(s.review, [s.claim], [s.feed]), /exact used source timestamp/)
  }
})

test("publication-time evidence rejects a day-only ISO header and retains zoned timestamps", () => {
  const stamp = "2026-09-22T00:00:00Z"
  const feed = {
    parse_id: "rss-midnight-parse", source_id: "rss", source_version_id: "rss:exact-bytes",
    dates: { published_at: stamp, precision: "timestamp", profile_status: "matched", basis: { dom_path: "/rss/channel/item[45]/pubDate", text: "2026-09-22" } },
    blocks: [],
  }
  const claim = { claim_id: "announcement", published_at: stamp, evidence: [{ source_id: feed.source_id, source_version_id: feed.source_version_id, parse_id: feed.parse_id, block_id: "rss-date", support: "direct" }] }
  const review = { published_at: "2026-09-22", event_date_basis: { kind: "source-publication-time", source_id: feed.source_id, source_version_id: feed.source_version_id, parse_id: feed.parse_id, claim_id: claim.claim_id, source_published_at: stamp, timezone: "Asia/Seoul" } }
  assert.throws(() => eventDateMetadata(review, [claim], [feed]), /exact used source timestamp/)
  for (const header of [stamp, "2026-09-22T09:00:00+09:00", "2026-09-22T09:00:00+0900"]) {
    const exact = structuredClone(feed)
    exact.dates.basis.text = header
    assert.deepEqual(eventDateMetadata(review, [claim], [exact]), { date_kind: "source-publication-time", source_published_at: stamp })
  }
})
