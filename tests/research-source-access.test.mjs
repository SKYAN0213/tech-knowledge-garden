import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { storeParseArtifact } from "../scripts/research/parser.mjs"
import { collectWindowDetails } from "../scripts/research/list-scan.mjs"
import { rememberAccessExclusion, matchingAccessExclusion, reopenAccessExclusion, verifyAccessExclusionDetail } from "../scripts/research/source-access.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "source-access-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const url = "https://publisher.example/news/123"
  const body = Buffer.from('<h1>Robot actuator test</h1><time>2026-10-01</time><p>Members only</p>')
  const hash = sha256(body), id = sourceId(url)
  const document = { source_id: id, source_version_id: `${id}:${hash}`, original_url: url, final_url: url, body_sha256: hash, body_path: `documents/${id}/${hash}/body.bin`, observed_at: "2026-10-02T00:00:00Z", fetch_status: "captured", policy_status: "checked" }
  fs.mkdirSync(path.dirname(path.join(root, document.body_path)), { recursive: true })
  fs.writeFileSync(path.join(root, document.body_path), body)
  const parsed = { schema_version: "source-parse/v1", source_id: id, source_version_id: document.source_version_id, parse_id: sha256("blocked parse"), status: "blocked", title: "Robot actuator test", title_profile_status: "matched", blocks: [], dates: { published_at: "2026-10-01", access_scope: "metadata-only", profile_status: "matched", basis: { dom_path: "/html/body/time", text: "2026-10-01" }, observed_at: document.observed_at }, quality: { reason: "authentication-page", required_fields_present: false } }
  storeParseArtifact(root, parsed)
  const channel = { channel_id: "publisher", access_policy: "public-only" }
  const link = { url, text: parsed.title, published_at: "2026-10-01", listing_source_version_id: "listing:v1", listing_parse_id: "listing-parse" }
  return { root, url, body, document, parsed, channel, link }
}

test("a verified member item is not requested again and retains its original observation", async (t) => {
  const f = fixture(t)
  await rememberAccessExclusion(f.root, f.channel, f.link, f.document, f.parsed, "first-round")
  const result = await collectWindowDetails(f.root, { id: "second-round", stage: (_name, _input, action) => action() }, {}, f.channel, [], [f.link], { fetchPolicy: () => { throw Error("must not request known member item") } })
  assert.equal(result.details[0].status, "public_access_excluded")
  assert.equal(result.details[0].request_performed, false)
  assert.equal(result.documents[0].observed_at, f.document.observed_at)
  assert.equal(result.parses[0].blocks.length, 0)
  assert.deepEqual(result.candidates, [])
  const scan = { summary: { access_scope: "public-only" }, documents: result.documents, candidates: [], parses: [...result.parses, { parse_id: "listing-parse", source_version_id: "listing:v1", links: [f.link] }] }
  assert.equal(verifyAccessExclusionDetail(f.root, result.details[0], scan), true)
  assert.throws(() => verifyAccessExclusionDetail(f.root, result.details[0], { ...scan, summary: {} }), /public-only scope/)
  assert.throws(() => verifyAccessExclusionDetail(f.root, result.details[0], { ...scan, candidates: [{ source_urls: [f.url] }] }), /public-only scope/)
})

test("changed identities and explicit reopening trigger fresh investigation", async (t) => {
  const f = fixture(t)
  await rememberAccessExclusion(f.root, f.channel, f.link, f.document, f.parsed, "first-round")
  assert.equal(matchingAccessExclusion(f.root, f.channel, { ...f.link, text: "Corrected story" }), null)
  assert.equal(matchingAccessExclusion(f.root, f.channel, { ...f.link, published_at: "2026-10-02" }), null)
  assert.equal(matchingAccessExclusion(f.root, { ...f.channel, access_policy: undefined }, f.link), null)
  await reopenAccessExclusion(f.root, f.url)
  assert.equal(matchingAccessExclusion(f.root, f.channel, f.link), null)
  assert.equal(fs.readFileSync(path.join(f.root, f.document.body_path)).toString(), f.body.toString())
})

test("parser failures, missing header evidence and tampered bytes are never access exemptions", async (t) => {
  const f = fixture(t)
  assert.equal(await rememberAccessExclusion(f.root, f.channel, f.link, f.document, { ...f.parsed, quality: { required_fields_present: false, reason: "date-conflict" } }, "first-round"), null)
  assert.equal(await rememberAccessExclusion(f.root, f.channel, f.link, f.document, { ...f.parsed, dates: {} }, "first-round"), null)
  await rememberAccessExclusion(f.root, f.channel, f.link, f.document, f.parsed, "first-round")
  fs.writeFileSync(path.join(f.root, f.document.body_path), "tampered")
  assert.throws(() => matchingAccessExclusion(f.root, f.channel, f.link), /body hash mismatch/)
})

test("yearless archive lookup reuses metadata without assigning a new date", async (t) => {
  const f = fixture(t)
  await rememberAccessExclusion(f.root, f.channel, f.link, f.document, f.parsed, "first-round")
  const link = { ...f.link, published_at: null, listed_date_text: "10-01 13:00" }
  assert.equal(matchingAccessExclusion(f.root, f.channel, link).proof.parse.dates.published_at, "2026-10-01")
  assert.equal(matchingAccessExclusion(f.root, f.channel, { ...link, listed_date_text: "10-02 13:00" }), null)
})
