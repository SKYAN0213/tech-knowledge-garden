import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { recordCandidateDisposition } from "../scripts/research/candidate-disposition.mjs"
import { mergeBacklog } from "../scripts/research/discovery.mjs"
import { researchWindow } from "../scripts/research-window.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"

function fixture(t) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "research-disposition-")))
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  const root = path.join(base, "local-ai")
  const backlogFile = path.join(base, "candidate-backlog.json")
  const url = "https://example.org/news/background-feature"
  const body = "An evergreen overview of existing equipment."
  const id = sourceId(url)
  const bodyHash = sha256(body)
  const version = `${id}:${bodyHash}`
  const parseId = sha256("background parse")
  const document = {
    source_id: id,
    source_version_id: version,
    original_url: url,
    final_url: url,
    body_path: `documents/${id}/${bodyHash}/body.bin`,
    body_sha256: bodyHash,
    fetch_status: "captured",
    observed_at: "2026-09-28T00:00:00Z",
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id: id,
    source_version_id: version,
    parse_id: parseId,
    status: "extracted",
    title: "Background feature",
    dates: { published_at: "2026-09-02", observed_at: document.observed_at },
    blocks: [{ block_id: `${parseId}:b1`, text: body, locator: { text_hash: sha256(body) } }],
    quality: { missing_pages: [] },
  }
  const candidate = {
    key: `source-${id}`,
    title: parse.title,
    source_urls: [url],
    source_published_at: "2026-09-02",
    discovered_at: "2026-09-28T00:00:00Z",
    review_status: "unreviewed",
    priority: "normal",
    discovery: [{ channel_id: "test", discovered_at: "2026-09-28T00:00:00Z" }],
  }
  const review = {
    schema: "editorial-candidate-disposition/v1",
    reviewed_at: "2026-09-28",
    reviewer: "Direct source review",
    source_id: id,
    source_version_id: version,
    body_sha256: bodyHash,
    parse_id: parseId,
    source_url: url,
    source_published_at: "2026-09-02",
    decision: "background_only_no_news_event",
    source_read: true,
    event_check: {
      new_product_release: false,
      new_customer_installation: false,
      new_contract_or_investment: false,
      new_measured_result: false,
      notes: "No newly dated product, customer, contract or measured result in the stored body.",
    },
    claims_not_promoted: [{ block_id: `${parseId}:b1`, claim: "Existing product description" }],
    public_projection: {
      news: false,
      briefing: false,
      rss: false,
      digest: false,
      keyword_timeline: false,
      map_edge: false,
    },
    original_candidate_preserved: true,
    candidate_published: false,
  }
  atomicWrite(root, document.body_path, body)
  atomicWrite(root, `parses/${parseId}/parse.json`, parse)
  atomicWrite(root, "runs/source/documents.json", [document])
  atomicWrite(root, "runs/source/parses.json", [parse])
  atomicWrite(root, "runs/source/candidates.json", [candidate])
  atomicWrite(root, "review/disposition.json", review)
  return { root, backlogFile, url, document, candidate, review }
}

const apply = (f, changes = {}) =>
  recordCandidateDisposition({
    root: f.root,
    runId: "decision",
    sourceRunId: "source",
    reviewPath: "review/disposition.json",
    backlogFile: f.backlogFile,
    ...changes,
  })

test("source-bound background decision closes only its candidate and survives rediscovery", async (t) => {
  const f = fixture(t)
  const first = await apply(f)
  assert.equal(first.candidate_key, f.candidate.key)
  assert.equal(first.review_status, "rejected")
  assert.equal(first.candidate_published, false)
  const before = fs.readFileSync(f.backlogFile)
  const second = await apply(f)
  assert.equal(second.backlog_sha256, first.backlog_sha256)
  assert.deepEqual(fs.readFileSync(f.backlogFile), before)
  const closed = readJSON(path.dirname(f.backlogFile), path.basename(f.backlogFile)).candidates[0]
  assert.equal(closed.reason, f.review.event_check.notes)
  assert.equal(closed.disposition.source_version_id, f.document.source_version_id)
  assert.equal(closed.disposition.source_run, "source")
  assert.equal(closed.event_id, undefined)
  assert.equal(
    researchWindow(
      "2026-09-27T00:00:00Z",
      "2026-09-28T00:00:00Z",
      {
        schema: "research-candidates/v1",
        candidates: [closed],
      },
      [],
    ).pending.length,
    0,
  )
  await mergeBacklog(f.backlogFile, [f.candidate])
  assert.equal(
    readJSON(path.dirname(f.backlogFile), path.basename(f.backlogFile)).candidates[0].review_status,
    "rejected",
  )
  assert.equal(readJSON(f.root, "runs/source/candidates.json")[0].review_status, "unreviewed")
})

test("an existing private rejection gains a content fingerprint without losing its decision", async (t) => {
  const f = fixture(t)
  await apply(f)
  const directory = path.dirname(f.backlogFile)
  const name = path.basename(f.backlogFile)
  const legacy = readJSON(directory, name)
  const originalReviewHash = legacy.candidates[0].disposition.review_sha256
  delete legacy.candidates[0].article_content_sha256
  delete legacy.candidates[0].disposition.article_content_sha256
  atomicWrite(directory, name, legacy)
  await apply(f)
  const enriched = readJSON(directory, name).candidates[0]
  assert.match(enriched.article_content_sha256, /^[a-f0-9]{64}$/)
  assert.equal(enriched.disposition.article_content_sha256, enriched.article_content_sha256)
  assert.equal(enriched.disposition.review_sha256, originalReviewHash)
  assert.equal(enriched.review_status, "rejected")
  const bytes = fs.readFileSync(f.backlogFile)
  await apply(f)
  assert.deepEqual(fs.readFileSync(f.backlogFile), bytes)
})

test("a later HTML wrapper change with identical article content keeps the rejection closed", async (t) => {
  const f = fixture(t)
  await apply(f)
  const directory = path.dirname(f.backlogFile)
  const name = path.basename(f.backlogFile)
  const closed = readJSON(directory, name).candidates[0]
  const wrapperVersion = `${f.document.source_id}:${sha256("later wrapper bytes")}`
  await mergeBacklog(f.backlogFile, [
    {
      ...f.candidate,
      discovered_at: "2026-09-29T00:00:00Z",
      article_source_version_id: wrapperVersion,
      article_observed_at: "2026-09-29T00:00:00Z",
      article_content_sha256: closed.article_content_sha256,
    },
  ])
  const observed = readJSON(directory, name).candidates[0]
  assert.equal(observed.review_status, "rejected")
  assert.equal(observed.article_source_version_id, wrapperVersion)
  assert.equal(observed.disposition.source_version_id, f.document.source_version_id)
  const bytes = fs.readFileSync(f.backlogFile)
  await apply(f)
  assert.deepEqual(fs.readFileSync(f.backlogFile), bytes)
})

test("discovery and reviewed reparse may use different parse IDs for identical source bytes", async (t) => {
  const f = fixture(t)
  const discoveryParse = structuredClone(readJSON(f.root, "runs/source/parses.json")[0])
  discoveryParse.parse_id = sha256("earlier parse without quoted passage")
  discoveryParse.blocks[0].block_id = `${discoveryParse.parse_id}:b1`
  atomicWrite(f.root, `parses/${discoveryParse.parse_id}/parse.json`, discoveryParse)
  atomicWrite(
    f.root,
    "runs/discovery/documents.json",
    readJSON(f.root, "runs/source/documents.json"),
  )
  atomicWrite(f.root, "runs/discovery/parses.json", [discoveryParse])
  atomicWrite(f.root, "runs/discovery/candidates.json", [f.candidate])
  fs.rmSync(path.join(f.root, "runs/source/candidates.json"))
  const result = await apply(f, { candidateRunId: "discovery" })
  assert.equal(result.review_status, "rejected")
  const closed = readJSON(path.dirname(f.backlogFile), path.basename(f.backlogFile)).candidates[0]
  assert.equal(closed.disposition.candidate_run, "discovery")
  assert.equal(closed.disposition.parse_id, f.review.parse_id)
})

test("a candidate discovered from different article bytes cannot inherit the old reading decision", async (t) => {
  const f = fixture(t)
  const body = "The article was later rewritten."
  const document = {
    ...f.document,
    body_sha256: sha256(body),
    source_version_id: `${f.document.source_id}:${sha256(body)}`,
    body_path: `documents/${f.document.source_id}/${sha256(body)}/body.bin`,
  }
  const parse = structuredClone(readJSON(f.root, "runs/source/parses.json")[0])
  parse.source_version_id = document.source_version_id
  parse.parse_id = sha256("later revised parse")
  parse.blocks = [
    { block_id: `${parse.parse_id}:b1`, text: body, locator: { text_hash: sha256(body) } },
  ]
  atomicWrite(f.root, document.body_path, body)
  atomicWrite(f.root, `parses/${parse.parse_id}/parse.json`, parse)
  atomicWrite(f.root, "runs/discovery/documents.json", [document])
  atomicWrite(f.root, "runs/discovery/parses.json", [parse])
  atomicWrite(f.root, "runs/discovery/candidates.json", [f.candidate])
  await assert.rejects(apply(f, { candidateRunId: "discovery" }), /different source versions/)
  assert.equal(fs.existsSync(f.backlogFile), false)
})

test("an older review cannot close a candidate awaiting review of changed article bytes", async (t) => {
  const f = fixture(t)
  atomicWrite(path.dirname(f.backlogFile), path.basename(f.backlogFile), {
    schema: "research-candidates/v1",
    candidates: [
      {
        ...f.candidate,
        review_status: "deferred",
        reason: "원문 판본 변경 재검토 필요",
        article_source_version_id: `${f.document.source_id}:${sha256("new article bytes")}`,
      },
    ],
  })
  const before = fs.readFileSync(f.backlogFile)
  await assert.rejects(apply(f), /newer observed article version/)
  assert.deepEqual(fs.readFileSync(f.backlogFile), before)
})

test("a fresh direct review closes a revised candidate without erasing its earlier disposition", async (t) => {
  const f = fixture(t)
  await apply(f)
  const body = "The revised feature still describes existing equipment."
  const document = {
    ...f.document,
    body_sha256: sha256(body),
    source_version_id: `${f.document.source_id}:${sha256(body)}`,
    body_path: `documents/${f.document.source_id}/${sha256(body)}/body.bin`,
    observed_at: "2026-09-28T01:00:00Z",
  }
  const parse = structuredClone(readJSON(f.root, "runs/source/parses.json")[0])
  parse.source_version_id = document.source_version_id
  parse.parse_id = sha256("review of revised feature")
  parse.dates.observed_at = document.observed_at
  parse.blocks = [
    { block_id: `${parse.parse_id}:b1`, text: body, locator: { text_hash: sha256(body) } },
  ]
  atomicWrite(f.root, document.body_path, body)
  atomicWrite(f.root, `parses/${parse.parse_id}/parse.json`, parse)
  atomicWrite(f.root, "runs/revised/documents.json", [document])
  atomicWrite(f.root, "runs/revised/parses.json", [parse])
  const candidate = {
    ...f.candidate,
    discovered_at: document.observed_at,
    article_source_version_id: document.source_version_id,
    article_parse_id: parse.parse_id,
    article_observed_at: document.observed_at,
  }
  atomicWrite(f.root, "runs/revised/candidates.json", [candidate])
  await mergeBacklog(f.backlogFile, [candidate])
  assert.equal(
    readJSON(path.dirname(f.backlogFile), path.basename(f.backlogFile)).candidates[0].review_status,
    "deferred",
  )
  const review = {
    ...f.review,
    source_version_id: document.source_version_id,
    body_sha256: document.body_sha256,
    parse_id: parse.parse_id,
    claims_not_promoted: [{ block_id: `${parse.parse_id}:b1`, claim: "Existing equipment" }],
  }
  atomicWrite(f.root, "review/revised-disposition.json", review)
  await recordCandidateDisposition({
    root: f.root,
    runId: "revised-decision",
    sourceRunId: "revised",
    reviewPath: "review/revised-disposition.json",
    backlogFile: f.backlogFile,
  })
  const closed = readJSON(path.dirname(f.backlogFile), path.basename(f.backlogFile)).candidates[0]
  assert.equal(closed.review_status, "rejected")
  assert.equal(closed.article_source_version_id, document.source_version_id)
  assert.equal(closed.source_revision_alert, undefined)
  assert.equal(closed.disposition_history.length, 1)
  assert.equal(closed.disposition_history[0].source_version_id, f.document.source_version_id)
})

test("disposition refuses changed evidence, an invented block, a published URL and a verified candidate", async (t) => {
  const f = fixture(t)
  await assert.rejects(apply(f, { runId: "source" }), /distinct disposition run ID/)
  const original = fs.readFileSync(path.join(f.root, f.document.body_path))
  fs.writeFileSync(path.join(f.root, f.document.body_path), "Changed body")
  await assert.rejects(apply(f), /body hash mismatch/)
  fs.writeFileSync(path.join(f.root, f.document.body_path), original)
  assert.equal(fs.existsSync(f.backlogFile), false)

  f.review.claims_not_promoted[0].block_id = "invented:block"
  atomicWrite(f.root, "review/disposition.json", f.review)
  await assert.rejects(apply(f), /block/)
  f.review.claims_not_promoted[0].block_id = `${readJSON(f.root, "runs/source/parses.json")[0].parse_id}:b1`
  atomicWrite(f.root, "review/disposition.json", f.review)
  await assert.rejects(apply(f, { publishedURLs: [f.url] }), /already appears/)
  assert.equal(fs.existsSync(f.backlogFile), false)

  atomicWrite(path.dirname(f.backlogFile), path.basename(f.backlogFile), {
    schema: "research-candidates/v1",
    candidates: [{ ...f.candidate, review_status: "verified", event_id: "published-event" }],
  })
  const before = fs.readFileSync(f.backlogFile)
  await assert.rejects(apply(f), /verified candidate/)
  assert.deepEqual(fs.readFileSync(f.backlogFile), before)
})
