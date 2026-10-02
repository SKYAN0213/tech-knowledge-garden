import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { parseDocument } from "../scripts/research/parser.mjs"

const channels = JSON.parse(fs.readFileSync("data/research-source-channels.json", "utf8"))
const acquisition = JSON.parse(fs.readFileSync("data/research-acquisition.json", "utf8"))
const channel = channels.channels.find((entry) => entry.id === "aws-whats-new-rss")
const route = acquisition["aws-whats-new-rss"]
const profile = acquisition.article_profiles.find(
  (entry) => entry.id === "aws-whats-new-article-v1",
)

test("AWS What's New shares the bounded RSS collector and exact article profile", () => {
  assert.ok(channel)
  assert.ok(route)
  assert.ok(profile)
  assert.equal(channel.method, "rss")
  assert.equal(channel.url, "https://aws.amazon.com/about-aws/whats-new/recent/feed/")
  assert.equal(route.listing_profile.pagination, "bounded-feed")
  assert.equal(route.listing_profile.feed_title, "Recent Announcements")
  assert.equal(route.allowed_hosts.join(","), "aws.amazon.com")
  assert.ok(route.scan_max_details >= 80)
  assert.equal(profile.options.publication_date_format, "Posted on: %b %d, %Y")
  assert.match(
    "https://aws.amazon.com/about-aws/whats-new/2026/09/example/",
    new RegExp(profile.url_pattern),
  )
  assert.match(
    "https://aws.amazon.com/about-aws/whats-new/2026/9/example/",
    new RegExp(profile.url_pattern),
  )
  assert.match(
    "https://aws.amazon.com/about-aws/whats-new/2026/09/kinesis/service-managed-partition-keys",
    new RegExp(profile.url_pattern),
  )
  assert.doesNotMatch(
    "https://example.com/about-aws/whats-new/2026/09/example/",
    new RegExp(profile.url_pattern),
  )
})

test("AWS article profile keeps the visible posted date and article body together", async (t) => {
  assert.ok(profile)
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-aws-whats-new-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const url = "https://aws.amazon.com/about-aws/whats-new/2026/09/agentcore-runtime/"
  const html = `<html><body><main class="wn-post">
    <h1 class="wn-title">The new AgentCore Runtime is now available in Amazon Bedrock AgentCore</h1>
    <div class="wn-body">Posted on: Sep 18, 2026</div>
    <div class="wn-body"><p>AWS announces the new Runtime.</p><p>It reclaims unused memory throughout a session.</p></div>
  </main><footer><h2>Resources</h2><p>Navigation content must not enter the article.</p></footer></body></html>`
  const bytes = Buffer.from(html)
  const id = sourceId(url)
  const hash = sha256(bytes)
  fs.writeFileSync(path.join(root, "source.html"), bytes)
  const previousPython = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    previousPython || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (previousPython === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = previousPython
  })

  const parsed = await parseDocument(
    root,
    {
      original_url: url,
      final_url: url,
      source_id: id,
      source_version_id: `${id}:${hash}`,
      body_path: "source.html",
      body_sha256: hash,
      observed_at: "2026-10-02T00:00:00Z",
      fetch_status: "captured",
    },
    profile.options,
  )

  assert.equal(parsed.status, "extracted")
  assert.equal(
    parsed.title,
    "The new AgentCore Runtime is now available in Amazon Bedrock AgentCore",
  )
  assert.equal(parsed.dates.published_at, "2026-09-18")
  assert.equal(parsed.blocks.length, 2)
  assert.ok(parsed.blocks.every((block) => !block.text.includes("Navigation content")))
})
