import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  createArchiveSourceReuse,
  preserveArchiveReuseReceipt,
} from "../scripts/research/list-scan-command.mjs"
import { scanBoundedRSSRoute } from "../scripts/research/rss-scan.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { storeParseArtifact } from "../scripts/research/parser.mjs"
import { verifyStoredListScan } from "../scripts/research/scan-evidence.mjs"

const run = { stage: (_name, _input, operation) => operation() }

async function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "detail-repair-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const channel = {
    channel_id: "official",
    method: "rss",
    language: "en",
    url: "https://example.org/feed",
    allowed_hosts: ["example.org"],
    item_pattern: "^https://example\\.org/articles/[^/?#]+$",
    scan_max_details: 10,
    sectors: ["AI"],
    region: "해외",
    axis: "기술·제품",
    publisher_id: "example.org",
    listing_profile: {
      pagination: "bounded-feed",
      rule_id: "official-v1",
      feed_title: "Official",
      max_items: 20,
      guid_is_permalink: true,
    },
  }
  const profiles = [{ id: "article-v1", url_pattern: channel.item_pattern, options: {} }]
  const window = { since: "2026-09-29", until: "2026-10-06" }
  const basis = {
    route_sha256: sha256(JSON.stringify(channel)),
    dependencies: { fetch: "unchanged", "integrations/research-worker/worker.py": "old-worker" },
    implementation: { parser_sha256: "old-parser" },
    article_profiles_sha256: "old-profile",
  }
  const originalTime = "2026-10-05T20:00:00Z"
  function doc(url, text, observed_at = originalTime) {
    const body = Buffer.from(text),
      body_sha256 = sha256(body),
      source_id = sourceId(url)
    const d = {
      original_url: url,
      final_url: url,
      source_id,
      source_version_id: `${source_id}:${body_sha256}`,
      body_sha256,
      body_path: `documents/${source_id}/${body_sha256}/body.bin`,
      observed_at,
      fetch_status: "captured",
      policy_status: "checked",
      policy: { allowed: true },
    }
    atomicWrite(root, d.body_path, body)
    return d
  }
  const xml = `<rss version="2.0"><channel><title>Official</title><description>Official news</description><link>https://example.org</link>${["one", "two", "older"].map((slug) => `<item><title>Article ${slug}</title><link>https://example.org/articles/${slug}</link><guid>https://example.org/articles/${slug}</guid><pubDate>${slug === "older" ? "Mon, 28 Sep" : "Mon, 05 Oct"} 2026 12:00:00 GMT</pubDate></item>`).join("")}</channel></rss>`
  const listing = doc(channel.url, xml),
    one = doc("https://example.org/articles/one", "Article one body.")
  const parseArticle = async (_root, document) => {
    const slug = document.original_url.split("/").at(-1),
      text = fs.readFileSync(path.join(root, document.body_path), "utf8")
    const parse_id = sha256(JSON.stringify([document.source_version_id, "parser-v1"]))
    return storeParseArtifact(root, {
      schema_version: "source-parse/v1",
      status: "extracted",
      source_id: document.source_id,
      source_version_id: document.source_version_id,
      parse_id,
      title: `Article ${slug}`,
      dates: { published_at: "2026-10-05", observed_at: document.observed_at },
      blocks: [{ block_id: `${parse_id}:block-0001`, text, locator: { text_hash: sha256(text) } }],
      links: [],
      quality: { required_fields_present: true },
    })
  }
  const old = await scanBoundedRSSRoute(root, run, {}, channel, profiles, window, {
    fetchPolicy: async (_r, _f, url) =>
      url === channel.url
        ? listing
        : url === one.original_url
          ? one
          : { fetch_status: "not_found" },
    parseArticle,
  })
  assert.equal(old.summary.reason, "detail_incomplete")
  const input = {
    schema: "research-list-run-input/v2",
    channel_id: channel.channel_id,
    since: window.since,
    until_exclusive: window.until,
    reuse_listing_run: null,
    collection_basis: basis,
  }
  for (const [file, value] of Object.entries({
    "state.json": { input_hash: sha256(JSON.stringify(input)) },
    "collection-basis.json": basis,
    "list-scan.json": old.summary,
    "documents.json": old.documents,
    "parses.json": old.parses,
    "candidates.json": old.candidates,
    "list-pages.json": old.indexDocuments,
  }))
    atomicWrite(root, `runs/old/${file}`, value)
  return { root, channel, profiles, window, basis, old, one, listing, doc, parseArticle }
}

test("detail repair rechecks stored originals, requests only the missing article and keeps original coverage time", async (t) => {
  const f = await fixture(t),
    requested = []
  const originals = fs.readFileSync(path.join(f.root, "runs/old/documents.json"))
  const reuse = createArchiveSourceReuse(
    f.root,
    "old",
    f.channel,
    {
      ...f.basis,
      dependencies: {
        ...f.basis.dependencies,
        "integrations/research-worker/worker.py": "new-worker",
      },
      implementation: { parser_sha256: "new-parser" },
      article_profiles_sha256: "new-profile",
    },
    f.window,
    {
      detailRepair: true,
      now: Date.parse("2026-10-06T03:00:00Z"),
      fetchPolicy: async (_r, _f, url) => {
        requested.push(url)
        return f.doc(url, "Article two body.", "2026-10-06T03:00:00Z")
      },
    },
  )
  const result = await scanBoundedRSSRoute(f.root, run, {}, f.channel, f.profiles, f.window, {
    fetchPolicy: reuse.fetchPolicy,
    parseArticle: f.parseArticle,
  })
  assert.deepEqual(requested, ["https://example.org/articles/two"])
  assert.equal(result.summary.status, "window_scanned")
  assert.equal(result.summary.observed_at, f.listing.observed_at)
  assert.equal(result.candidates.length, 2)
  assert.equal(new Set(result.candidates.map((c) => c.key)).size, 2)
  assert.equal(
    result.candidates.find((c) => c.article_source_version_id === f.one.source_version_id)
      .article_observed_at,
    f.one.observed_at,
  )
  verifyStoredListScan(f.root, result, {
    channel_id: f.channel.channel_id,
    since: f.window.since,
    until_exclusive: f.window.until,
  })
  const receipt = preserveArchiveReuseReceipt(f.root, "repair", reuse)
  assert.equal(receipt.schema, "research-detail-repair-source-reuse/v1")
  assert.equal(receipt.fresh_listing_observation, false)
  assert.equal(receipt.coverage_reused, false)
  assert.equal(receipt.parses_recomputed, true)
  assert.equal(receipt.reused_sources.length, 2)
  assert.deepEqual(fs.readFileSync(path.join(f.root, "runs/old/documents.json")), originals)
  reuse.used.clear()
  assert.deepEqual(preserveArchiveReuseReceipt(f.root, "repair", reuse), receipt)
})

test("a failed repair stays incomplete and does not discard successful source evidence", async (t) => {
  const f = await fixture(t)
  const reuse = createArchiveSourceReuse(f.root, "old", f.channel, f.basis, f.window, {
    detailRepair: true,
    now: Date.parse("2026-10-06T03:00:00Z"),
    fetchPolicy: async () => ({ fetch_status: "not_found" }),
  })
  const result = await scanBoundedRSSRoute(f.root, run, {}, f.channel, f.profiles, f.window, {
    fetchPolicy: reuse.fetchPolicy,
    parseArticle: f.parseArticle,
  })
  assert.equal(result.summary.status, "incomplete")
  assert.equal(result.summary.reason, "detail_incomplete")
  assert.equal(result.candidates.length, 1)
  assert.equal(result.summary.details[1].fetch_status, "not_found")
})

test("repair refuses changed policy, route, window, missing candidate provenance and tampered bytes", async (t) => {
  const f = await fixture(t),
    options = { detailRepair: true, now: Date.parse("2026-10-06T03:00:00Z") }
  for (const basis of [
    { ...f.basis, route_sha256: sha256("different") },
    { ...f.basis, dependencies: { fetch: "different" } },
    { ...f.basis, route_sha256: undefined },
  ])
    assert.throws(
      () => createArchiveSourceReuse(f.root, "old", f.channel, basis, f.window, options),
      /same window/,
    )
  assert.throws(
    () =>
      createArchiveSourceReuse(
        f.root,
        "old",
        f.channel,
        f.basis,
        { ...f.window, until: "2026-10-07" },
        options,
      ),
    /same window/,
  )
  const candidatesFile = path.join(f.root, "runs/old/candidates.json"),
    candidates = fs.readFileSync(candidatesFile)
  atomicWrite(f.root, "runs/old/candidates.json", [
    { ...f.old.candidates[0], article_source_version_id: "different" },
  ])
  assert.throws(
    () => createArchiveSourceReuse(f.root, "old", f.channel, f.basis, f.window, options),
    /matching stored/,
  )
  fs.writeFileSync(candidatesFile, candidates)
  fs.appendFileSync(path.join(f.root, f.one.body_path), "tampered")
  assert.throws(
    () => createArchiveSourceReuse(f.root, "old", f.channel, f.basis, f.window, options),
    /body hash mismatch/,
  )
})
