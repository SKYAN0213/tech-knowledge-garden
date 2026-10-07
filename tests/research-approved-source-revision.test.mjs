import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { mergeBacklog } from "../scripts/research/discovery.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { researchWindow } from "../scripts/research-window.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "approved-revision-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const url = "https://example.org/news/de/article"
  const version = (body, source = url) => sourceId(source) + ":" + sha256(body)
  const candidate = {
    key: "source-" + sourceId(url),
    title: "Approved event",
    source_urls: [url],
    source_published_at: "2026-10-01",
    discovered_at: "2026-10-01T00:00:00Z",
    article_observed_at: "2026-10-01T00:00:00Z",
    review_status: "verified",
    priority: "normal",
    event_id: "abcdef0123456789",
    article_source_version_id: version("raw-v1"),
    article_parse_id: sha256("parse-v1"),
    article_content_sha256: sha256("content-v1"),
    approval: {
      approved_run: "approved",
      article_sha256: sha256("article"),
      source_version_id: version("raw-v1"),
      parse_id: sha256("parse-v1"),
      article_content_sha256: sha256("content-v1"),
    },
    discovery: [
      { publisher_id: "example.org", profile_id: "cms", source_item_id: "one", language: "de" },
    ],
  }
  const file = path.join(root, "candidate-backlog.json")
  fs.writeFileSync(
    file,
    JSON.stringify({ schema: "research-candidates/v1", candidates: [candidate] }),
  )
  const incoming = (body, content = "content-v1", source = url) => ({
    ...candidate,
    key: "source-" + sourceId(source),
    source_urls: [source],
    review_status: "unreviewed",
    approval: undefined,
    event_id: undefined,
    article_observed_at: "2026-10-02T00:00:00Z",
    discovered_at: "2026-10-02T00:00:00Z",
    article_source_version_id: version(body, source),
    article_parse_id: sha256("parse-" + body),
    article_content_sha256: sha256(content),
  })
  const read = () => JSON.parse(fs.readFileSync(file)).candidates[0]
  return { file, candidate, incoming, read }
}

test("approved content revision reopens review while preserving the approved article and event", async (t) => {
  const f = fixture(t)
  await mergeBacklog(f.file, [f.incoming("wrapper-v2")])
  assert.equal(f.read().review_status, "verified")
  await mergeBacklog(f.file, [
    { ...f.incoming("raw-v3", "content-v3"), article_observed_at: "2026-10-03T00:00:00Z" },
  ])
  const changed = f.read()
  assert.equal(changed.review_status, "deferred")
  assert.equal(changed.source_revision_alert.change_basis, "content")
  assert.deepEqual(changed.approval, f.candidate.approval)
  assert.equal(changed.event_id, f.candidate.event_id)
  assert.equal(
    changed.source_revision_alert.reviewed_source_version_id,
    f.candidate.approval.source_version_id,
  )
  assert.equal(
    researchWindow("2026-10-01T00:00:00Z", "2026-10-04T00:00:00Z", { candidates: [changed] }, [])
      .pending[0].next_route,
    "review-source-revision",
  )
  const bytes = fs.readFileSync(f.file)
  await mergeBacklog(f.file, [
    { ...f.incoming("raw-v3", "content-v3"), article_observed_at: "2026-10-03T00:00:00Z" },
  ])
  assert.deepEqual(fs.readFileSync(f.file), bytes)
})

test("same CMS translation does not replace an approved primary source", async (t) => {
  const f = fixture(t),
    translated = f.incoming(
      "translated-raw",
      "translated-content",
      "https://example.org/news/en/article",
    )
  translated.discovery = [
    { publisher_id: "example.org", profile_id: "cms", source_item_id: "one", language: "en" },
  ]
  await mergeBacklog(f.file, [translated])
  const changed = f.read()
  assert.equal(changed.article_source_version_id, f.candidate.article_source_version_id)
  assert.equal(changed.article_content_sha256, f.candidate.article_content_sha256)
  assert.equal(changed.review_status, "verified")
  assert.equal(
    changed.related_source_observations[0].article_source_version_id,
    translated.article_source_version_id,
  )
  const bytes = fs.readFileSync(f.file)
  await mergeBacklog(f.file, [translated])
  assert.deepEqual(fs.readFileSync(f.file), bytes)
})

test("rediscovering the exact reviewed translation does not reopen review but a changed parse does", async (t) => {
  const f = fixture(t)
  const incoming = f.incoming(
    "translated-raw",
    "translated-content",
    "https://example.org/news/en/article",
  )
  await mergeBacklog(f.file, [incoming])
  const reviewed = f.read()
  Object.assign(reviewed.related_source_observations[0], {
    decision: "reviewed_publisher_record_alias",
    resolution_run: "related-review",
  })
  fs.writeFileSync(
    f.file,
    JSON.stringify({ schema: "research-candidates/v1", candidates: [reviewed] }),
  )
  await mergeBacklog(f.file, [
    {
      ...incoming,
      discovered_at: "2026-10-03T00:00:00Z",
      article_observed_at: "2026-10-03T00:00:00Z",
    },
  ])
  assert.equal(f.read().related_source_observations.length, 1)
  assert.equal(f.read().related_source_observations[0].decision, "reviewed_publisher_record_alias")
  assert.equal(f.read().last_discovered_at, "2026-10-03T00:00:00Z")
  assert.deepEqual(f.read().approval, f.candidate.approval)
  await mergeBacklog(f.file, [
    {
      ...incoming,
      article_parse_id: sha256("new-parser"),
      article_observed_at: "2026-10-04T00:00:00Z",
    },
  ])
  assert.equal(f.read().related_source_observations.length, 2)
  assert.equal(f.read().related_source_observations[1].decision, "review_required")
  assert.equal(f.read().related_source_observations[0].decision, "reviewed_publisher_record_alias")
})
