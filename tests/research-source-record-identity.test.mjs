import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { mergeBacklog } from "../scripts/research/discovery.mjs"

test("same publisher, profile and CMS record merge bilingual discovery without changing approval", async (t) => {
  const workspace = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "source-record-identity-")),
  )
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const backlogFile = path.join(workspace, "candidate-backlog.json")
  const target = {
    key: "source-german-original",
    title: "Deutscher Originaltitel",
    source_urls: ["https://www.kuka.com/de-de/news/fsw"],
    source_published_at: "2026-09-24",
    discovered_at: "2026-09-28T00:00:00.000Z",
    review_status: "verified",
    event_id: "496ab0bfbcdb42a4",
    approval: { approved_run: "approved-run", article_sha256: "a".repeat(64) },
    discovery: [
      {
        publisher_id: "kuka",
        profile_id: "kuka-news-form-pages-v1",
        source_item_id: "record-123",
        language: "de",
      },
    ],
  }
  fs.writeFileSync(
    backlogFile,
    JSON.stringify({ schema: "research-candidates/v1", candidates: [target] }),
  )
  const english = {
    key: "source-english-translation",
    title: "English translated title",
    source_urls: ["https://www.kuka.com/en-us/news/fsw"],
    source_published_at: "2026-09-24",
    discovered_at: "2026-10-02T00:00:00.000Z",
    review_status: "unreviewed",
    discovery: [
      {
        publisher_id: "KUKA",
        profile_id: "kuka-news-form-pages-v1",
        source_item_id: "record-123",
        language: "en",
        discovered_at: "2026-10-02T00:00:00.000Z",
      },
    ],
  }

  const first = await mergeBacklog(backlogFile, [english])
  const stored = JSON.parse(fs.readFileSync(backlogFile, "utf8"))
  assert.equal(first.changed, true)
  assert.equal(stored.candidates.length, 1)
  assert.equal(stored.candidates[0].review_status, "verified")
  assert.equal(stored.candidates[0].event_id, target.event_id)
  assert.deepEqual(stored.candidates[0].source_urls, target.source_urls)
  assert.equal(stored.candidates[0].source_record_aliases.length, 1)
  assert.equal(
    stored.candidates[0].source_record_aliases[0].source_url,
    "https://www.kuka.com/en-us/news/fsw",
  )

  const second = await mergeBacklog(backlogFile, [english])
  assert.equal(second.changed, false)
})

test("source record IDs are scoped by publisher and listing profile", async (t) => {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "source-record-scope-")))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const backlogFile = path.join(workspace, "candidate-backlog.json")
  fs.writeFileSync(
    backlogFile,
    JSON.stringify({
      schema: "research-candidates/v1",
      candidates: [
        {
          key: "existing",
          title: "Existing",
          source_urls: ["https://example.com/a"],
          source_published_at: "2026-09-24",
          discovered_at: "2026-09-28T00:00:00.000Z",
          review_status: "unreviewed",
          discovery: [{ publisher_id: "kuka", profile_id: "profile-a", source_item_id: "123" }],
        },
      ],
    }),
  )
  await mergeBacklog(backlogFile, [
    {
      key: "different-profile",
      title: "Different record namespace",
      source_urls: ["https://other.example.com/a"],
      source_published_at: "2026-09-24",
      discovered_at: "2026-10-02T00:00:00.000Z",
      review_status: "unreviewed",
      discovery: [{ publisher_id: "kuka", profile_id: "profile-b", source_item_id: "123" }],
    },
  ])
  const stored = JSON.parse(fs.readFileSync(backlogFile, "utf8"))
  assert.equal(stored.candidates.length, 2)
})
