import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { atomicCreate } from "../scripts/research/run-state.mjs"
import { registerArticleImageReview } from "../scripts/research/article-image-review-cache.mjs"
import { registry } from "../scripts/research/discovery.mjs"
import { collectionBasis } from "../scripts/research/scan-basis.mjs"
import {
  verifySourceOnboarding,
  activateSourceOnboarding,
} from "../scripts/research/source-onboarding.mjs"
import { collectWindowDetails } from "../scripts/research/list-scan.mjs"
import { parseStoredRSSFeed, assessBoundedRSSFeed } from "../scripts/research/rss-scan.mjs"
import {
  verifyStoredListScan,
  verifyStoredPartialCandidates,
} from "../scripts/research/scan-evidence.mjs"
import {
  loadStoredSourceRun,
  articleContentFingerprint,
  selectStoredSources,
} from "../scripts/research/parser.mjs"
import {
  prepareArticleImageSource,
  createArticleImageSource,
  loadArticleImageMetadataDependencies,
} from "../scripts/research/article-image-source.mjs"
import {
  validateEvidence,
  planExtractionBatches,
  extractionCandidateKey,
} from "../scripts/research/claims.mjs"
import { buildArchiveClosure } from "../scripts/research/archive-closure.mjs"
import { createOCRTableView } from "../scripts/research/ocr-table.mjs"
import {
  intakeArticleImageCandidate,
  selectIntakenArticleImageCandidate,
  prepareArticleImageIntake,
} from "../scripts/research/article-image-intake.mjs"
import { saveSourceSelection } from "../scripts/research/source-selection.mjs"
import {
  buildEditorialHandoff,
  selectCandidateSource,
} from "../scripts/research/editorial-handoff.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "article-image-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const url = "https://example.test/news/table",
    imageURL = "https://cdn.example.test/table.png"
  const imageBody = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jFmwAAAAASUVORK5CYII=",
    "base64",
  )
  const htmlBody = Buffer.from(
    `<html><head><meta content="2026-10-02T12:00:00+09:00"></head><body><h1>Synthetic stock table</h1><article><img src="${imageURL}"></article></body></html>`,
  )
  const doc = (target, body, mime) => {
    const source_id = sourceId(target),
      hash = sha256(body)
    const d = {
      source_id,
      source_version_id: `${source_id}:${hash}`,
      original_url: target,
      body_sha256: hash,
      body_path: `documents/${source_id}/${hash}/body.bin`,
      mime_type: mime,
      fetch_status: "captured",
      observed_at: "2026-10-03T00:00:00Z",
    }
    atomicCreate(root, d.body_path, body)
    return d
  }
  const article = doc(url, htmlBody, "text/html"),
    image = doc(imageURL, imageBody, "image/png")
  const parseId = sha256("synthetic-header"),
    title = "Synthetic stock table"
  const parent = {
    schema_version: "source-parse/v1",
    source_id: article.source_id,
    source_version_id: article.source_version_id,
    parse_id: parseId,
    parser: { id: "synthetic-html", version: "1" },
    status: "partial",
    title,
    language: "en",
    title_basis: { type: "html", dom_path: "/html/body/h1", text: title, text_hash: sha256(title) },
    title_profile_status: "matched",
    dates: {
      published_at: "2026-10-02",
      observed_at: article.observed_at,
      profile_status: "matched",
      basis: {
        dom_path: "/html/head/meta",
        text: "2026-10-02T12:00:00+09:00",
        attribute: "content",
      },
    },
    blocks: [],
    body_images: [{ url: imageURL, dom_path: "/html/body/article/img", alt: "" }],
    quality: { required_fields_present: false, missing_pages: [] },
  }
  const imgId = sha256("synthetic-image"),
    text = "Company A | 50 units"
  const imageParse = {
    schema_version: "source-parse/v1",
    source_id: image.source_id,
    source_version_id: image.source_version_id,
    parse_id: imgId,
    parser: { id: "synthetic-image", version: "1" },
    status: "partial",
    title,
    language: "en",
    dates: { published_at: null, observed_at: image.observed_at },
    quality: { source_format: "raster-image", missing_pages: [] },
    blocks: [
      {
        block_id: `${imgId}:block-1`,
        kind: "paragraph",
        text,
        locator: {
          type: "image",
          coordinate_space: "source-pixels",
          bbox: [0, 0, 1, 1],
          method: "ocr",
          confidence: 0.99,
          text_hash: sha256(text),
        },
      },
    ],
  }
  for (const [run, d, p] of [
    ["original", article, parent],
    ["image", image, imageParse],
  ]) {
    atomicCreate(root, `parses/${p.parse_id}/parse.json`, p)
    atomicCreate(root, `runs/${run}/documents.json`, [d])
    atomicCreate(root, `runs/${run}/parses.json`, [p])
  }
  return {
    root,
    parent,
    imageParse,
    article,
    image,
    options: { root, run: "joined", sourceRun: "original", parseId, imageRuns: ["image"] },
  }
}

test("image article joins exact body sources and independent title/date evidence", async (t) => {
  const f = fixture(t),
    before = JSON.stringify(f.imageParse)
  const result = await createArticleImageSource(f.options)
  const stored = loadStoredSourceRun(f.root, "joined"),
    metadata = stored.parses[0]
  assert.equal(result.source_document_complete, false)
  assert.equal(result.candidate_approved, false)
  assert.equal(stored.documents.length, 2)
  assert.equal(metadata.quality.metadata_only, true)
  assert.equal(metadata.status, "partial")
  assert.equal(metadata.blocks[1].text, f.parent.dates.basis.text)
  assert.equal(metadata.dates.published_at, "2026-10-02")
  assert.equal(stored.parses[1].dates.published_at, null)
  assert.equal(JSON.stringify(stored.parses[1]), before)
  assert.equal(loadArticleImageMetadataDependencies(f.root, metadata).length, 1)
  assert.equal(
    extractionCandidateKey(stored.documents, {
      candidateKey: `source-${f.article.source_id}`,
      explicitlyGrouped: true,
    }),
    `source-${f.article.source_id}`,
  )
  const plan = planExtractionBatches(stored.parses)
  assert.equal(plan.batches.length, 1)
  const context = JSON.parse(plan.batches[0].request.messages[1].content)
  assert.deepEqual(
    context.map((p) => p.source_role),
    ["article_metadata", "body_image"],
  )
  assert.equal(context[1].dates.published_at, null)
  assert.equal(context[0].dates.published_at, "2026-10-02")
  assert.deepEqual(plan.batches[0].block_keys, ["d1b1", "d1b2", "d2b1"])
  const closure = buildArchiveClosure(f.root, "proof-only", "joined")
  assert.ok(closure.files.some((e) => e.path === `parses/${f.parent.parse_id}/parse.json`))
  assert.ok(closure.files.some((e) => e.path === f.image.body_path))
})

async function wholeImageFixture(t) {
  const f = fixture(t)
  const original = f.imageParse
  original.quality.source_width = 1
  original.quality.source_height = 1
  const originalPath = `parses/${original.parse_id}/parse.json`
  fs.writeFileSync(path.join(f.root, originalPath), JSON.stringify(original, null, 2) + "\n")
  const cell = (cell_id, text, bbox, block_ids = []) => ({
    cell_id,
    text,
    bbox,
    block_ids,
    visual_checked: true,
    layout_checked: true,
    numbers_checked: true,
    reason: "Synthetic explicit whole-frame cell",
  })
  const review = {
    schema: "research-ocr-table-review/v1",
    source_parse: {
      path: originalPath,
      sha256: sha256(fs.readFileSync(path.join(f.root, originalPath))),
    },
    reviewer: "Synthetic reviewer",
    reviewed_at: "2026-10-09",
    tables: [
      {
        table_id: "full",
        contexts: [
          cell("caption", "Company A 50 units", [0, 0, 1, 0.6], [original.blocks[0].block_id]),
        ],
        headers: [cell("h1", "Name", [0, 0.6, 0.5, 0.8]), cell("h2", "Value", [0.5, 0.6, 1, 0.8])],
        rows: [[cell("r1", "A", [0, 0.8, 0.5, 1]), cell("r2", "50", [0.5, 0.8, 1, 1])]],
      },
    ],
    coverage: {
      scope: "whole-image",
      bbox: [0, 0, 1, 1],
      full_frame_checked: true,
      no_omitted_content: true,
      reason: "Synthetic entire frame explicitly read",
    },
  }
  const { parse } = await createOCRTableView({
    root: f.root,
    run: "full-image",
    parent: original,
    review,
  })
  atomicCreate(f.root, "runs/full-image/documents.json", [f.image])
  atomicCreate(f.root, "runs/full-image/parses.json", [parse])
  const result = await createArticleImageSource({ ...f.options, imageRuns: ["full-image"] })
  return { ...f, result, options: { ...f.options, imageRuns: ["full-image"] } }
}

test("a whole-image body is complete without promoting its independent metadata or candidate", async (t) => {
  const f = await wholeImageFixture(t),
    result = f.result
  assert.equal(result.source_document_complete, true)
  const stored = loadStoredSourceRun(f.root, "joined")
  assert.equal(stored.parses[0].status, "partial")
  assert.equal(stored.parses[0].quality.metadata_only, true)
  assert.equal(stored.parses[1].status, "extracted")
  assert.equal(stored.parses[1].dates.published_at, null)
  assert.equal(result.candidate_approved, false)
  assert.equal(result.candidate_published, false)
  assert.equal(
    (await createArticleImageSource({ ...f.options, imageRuns: ["full-image"] })).reused,
    true,
  )
})

test("whole article fingerprint includes image content and primary selection retains body evidence", async (t) => {
  const f = await wholeImageFixture(t),
    stored = loadStoredSourceRun(f.root, "joined")
  const [metadata, body] = stored.parses,
    fingerprint = articleContentFingerprint(metadata, stored.parses)
  assert.throws(() => articleContentFingerprint(metadata), /Complete linked/)
  const changed = structuredClone(stored.parses)
  changed[1].blocks[0].text += "\nA changed cell"
  assert.notEqual(articleContentFingerprint(changed[0], changed), fingerprint)
  changed[1].quality.source_document_complete = false
  assert.throws(() => articleContentFingerprint(changed[0], changed), /Whole-image/)
  const selected = selectStoredSources(f.root, "joined", [f.article.original_url])
  assert.deepEqual(
    selected.parses.map((p) => p.parse_id),
    [metadata.parse_id, body.parse_id],
  )
  assert.deepEqual(selected.identity.selected_urls, [f.article.original_url, f.image.original_url])
  await saveSourceSelection(f.root, "selection", selected)
  assert.equal(loadStoredSourceRun(f.root, "selection").documents.length, 2)
})

test("native image intake reuses common backlog without search fabrication or duplicate articles", async (t) => {
  const f = await wholeImageFixture(t),
    backlogFile = path.join(f.root, "backlog.json")
  const options = { root: f.root, run: "intake", sourceRun: "joined", backlogFile }
  const first = await intakeArticleImageCandidate(options)
  assert.equal(first.status, "source_verified_unreviewed")
  const before = fs.readFileSync(backlogFile)
  assert.equal((await intakeArticleImageCandidate(options)).reused, true)
  assert.deepEqual(fs.readFileSync(backlogFile), before)
  const selected = selectIntakenArticleImageCandidate({ ...options, intakeRun: "intake" })
  assert.equal(selected.selected.documents.length, 2)
  assert.equal(selected.candidate.review_status, "unreviewed")
  assert.equal(selected.candidate.event_id, undefined)
  assert.equal(selected.candidate.source_published_at, "2026-10-02")
  await createArticleImageSource({ ...f.options, run: "joined2" })
  await intakeArticleImageCandidate({ ...options, run: "intake2", sourceRun: "joined2" })
  assert.equal(JSON.parse(fs.readFileSync(backlogFile)).candidates.length, 1)
  assert.equal(fs.existsSync(path.join(f.root, "runs/intake/search.json")), false)
  const state = JSON.parse(fs.readFileSync(backlogFile))
  state.candidates[0].review_status = "verified"
  state.candidates[0].event_id = "1234567890abcdef"
  fs.writeFileSync(backlogFile, JSON.stringify(state))
  const reviewedBytes = fs.readFileSync(backlogFile)
  assert.equal((await intakeArticleImageCandidate(options)).reused, true)
  assert.deepEqual(fs.readFileSync(backlogFile), reviewedBytes)
  assert.throws(
    () => selectIntakenArticleImageCandidate({ ...options, intakeRun: "intake" }),
    /Exact unreviewed/,
  )
  await assert.rejects(
    () => intakeArticleImageCandidate({ ...options, run: "new-intake" }),
    /existing event reconciliation/,
  )
  state.candidates[0].article_content_sha256 = "0".repeat(64)
  fs.writeFileSync(backlogFile, JSON.stringify(state))
  await assert.rejects(() => intakeArticleImageCandidate(options), /conflicts|changed/)
  assert.throws(
    () => selectIntakenArticleImageCandidate({ ...options, intakeRun: "intake" }),
    /Exact unreviewed/,
  )
})

test("partial body intake fails without creating a candidate", async (t) => {
  const f = fixture(t)
  await createArticleImageSource(f.options)
  assert.throws(() => prepareArticleImageIntake(f.root, "joined"), /whole-article/)
  const backlogFile = path.join(f.root, "backlog.json")
  await assert.rejects(
    () =>
      intakeArticleImageCandidate({
        root: f.root,
        run: "intake",
        sourceRun: "joined",
        backlogFile,
      }),
    /whole-article/,
  )
  assert.equal(fs.existsSync(backlogFile), false)
})

test("native image intake enters daily handoff without inventing coverage or current publication", async (t) => {
  const f = await wholeImageFixture(t),
    backlogFile = path.join(f.root, "backlog.json")
  await intakeArticleImageCandidate({
    root: f.root,
    run: "intake",
    sourceRun: "joined",
    backlogFile,
  })
  const backlog = JSON.parse(fs.readFileSync(backlogFile)),
    candidate = backlog.candidates[0]
  const args = {
    plan: {
      run_id: "daily",
      cutoff: "2026-10-08T00:00:00Z",
      windows: [{ channel_id: "missing", since: "2026-10-01", until_exclusive: "2026-10-08" }],
    },
    receipts: [],
    observations: [],
    backlog,
    issues: [],
    observedAt: "2026-10-09T00:00:00Z",
    approvalRoot: f.root,
    backlogFile,
    articleImageIntakes: ["intake"],
  }
  const handoff = buildEditorialHandoff(args)
  assert.equal(handoff.completed_windows, 0)
  assert.equal(handoff.incomplete_windows.length, 1)
  assert.equal(handoff.pending[0].next_route, "historical-review")
  assert.equal(handoff.pending[0].source_published_at, "2026-10-02")
  assert.equal(handoff.pending[0].source_evidence_state, "exact")
  assert.equal(selectCandidateSource(f.root, handoff, candidate.key).selected.documents.length, 2)
  assert.throws(
    () => buildEditorialHandoff({ ...args, articleImageIntakes: ["intake", "intake"] }),
    /Explicit native/,
  )
  const receiptFile = path.join(f.root, "runs/intake/article-image-intake.json"),
    receipt = JSON.parse(fs.readFileSync(receiptFile))
  receipt.input.candidate.article_content_sha256 = "0".repeat(64)
  fs.writeFileSync(receiptFile, JSON.stringify(receipt))
  assert.throws(() => selectCandidateSource(f.root, handoff, candidate.key), /receipt changed/)
  assert.throws(() => buildEditorialHandoff(args), /Exact unreviewed/)
})

test("replay reuses exact files and source groups retain current binding", async (t) => {
  const f = fixture(t)
  await createArticleImageSource(f.options)
  const file = path.join(f.root, "runs/joined/parses.json"),
    before = fs.readFileSync(file)
  assert.equal((await createArticleImageSource(f.options)).reused, true)
  assert.deepEqual(fs.readFileSync(file), before)
  const bindingFile = path.join(f.root, "runs/joined/article-image-source.json"),
    binding = JSON.parse(fs.readFileSync(bindingFile))
  binding.assets[0].dom_path = "/html/body/unrelated/img"
  fs.writeFileSync(bindingFile, JSON.stringify(binding))
  assert.throws(() => loadStoredSourceRun(f.root, "joined"), /changed/)
})

test("metadata repetition preserves body windows within block budgets", async (t) => {
  const f = fixture(t)
  await createArticleImageSource(f.options)
  const { parses } = loadStoredSourceRun(f.root, "joined")
  const image = parses[1],
    second = structuredClone(image.blocks[0])
  second.block_id = `${image.parse_id}:block-2`
  second.text = "Company B | 20 units"
  second.locator.text_hash = sha256(second.text)
  image.blocks.push(second)
  const plan = planExtractionBatches(parses, { max_blocks_per_batch: 3 })
  assert.equal(plan.batches.length, 2)
  assert.deepEqual(
    plan.batches.map((b) => b.block_keys),
    [
      ["d1b1", "d1b2", "d2b1"],
      ["d1b1", "d1b2", "d2b2"],
    ],
  )
  assert.throws(
    () => planExtractionBatches(parses, { max_blocks_per_batch: 2 }),
    /metadata and one body/,
  )
})

test("unrelated image, missing/extra image and inherited image date fail before output", async (t) => {
  for (const mutate of [
    (f) => (f.options.imageRuns = []),
    (f) => (f.options.imageRuns = ["image", "image"]),
    (f) => (f.image.original_url = "https://cdn.example.test/unrelated.png"),
    (f) => (f.imageParse.dates.published_at = "2026-10-02"),
    (f) => (f.imageParse.quality.source_format = "pdf"),
  ]) {
    const f = fixture(t)
    mutate(f)
    // Synchronize only synthetic fixture metadata; native byte checks still apply.
    fs.writeFileSync(path.join(f.root, "runs/image/documents.json"), JSON.stringify([f.image]))
    fs.writeFileSync(path.join(f.root, "runs/image/parses.json"), JSON.stringify([f.imageParse]))
    fs.writeFileSync(
      path.join(f.root, `parses/${f.imageParse.parse_id}/parse.json`),
      JSON.stringify(f.imageParse),
    )
    await assert.rejects(() => createArticleImageSource(f.options))
    assert.equal(fs.existsSync(path.join(f.root, "runs/joined")), false)
  }
})

test("ambiguous title/date and missing DOM relation are rejected", (t) => {
  for (const mutate of [
    (f) => (f.parent.title_basis.text = "Other title"),
    (f) => (f.parent.dates.basis.text = "2026-10-04T12:00:00+09:00"),
    (f) => (f.parent.dates.profile_status = "conflict"),
    (f) => delete f.parent.body_images[0].dom_path,
  ]) {
    const f = fixture(t)
    mutate(f)
    fs.writeFileSync(path.join(f.root, "runs/original/parses.json"), JSON.stringify([f.parent]))
    fs.writeFileSync(
      path.join(f.root, `parses/${f.parent.parse_id}/parse.json`),
      JSON.stringify(f.parent),
    )
    assert.throws(() => prepareArticleImageSource(f.options), /Matched image-only/)
  }
})

test("altered metadata blocks cannot become evidence by updating both stored copies", async (t) => {
  const f = fixture(t)
  await createArticleImageSource(f.options)
  const stored = loadStoredSourceRun(f.root, "joined"),
    metadata = stored.parses[0]
  metadata.blocks[0].text = "Invented company strategy"
  metadata.blocks[0].locator.text_hash = sha256(metadata.blocks[0].text)
  fs.writeFileSync(
    path.join(f.root, `parses/${metadata.parse_id}/parse.json`),
    JSON.stringify(metadata),
  )
  fs.writeFileSync(path.join(f.root, "runs/joined/parses.json"), JSON.stringify(stored.parses))
  assert.throws(() => loadStoredSourceRun(f.root, "joined"), /metadata differs/)
})

test("destination conflicts do not leave new parses or metadata runs", async (t) => {
  const f = fixture(t),
    planned = prepareArticleImageSource(f.options)
  atomicCreate(f.root, "runs/joined/source-bundle.json", { conflicting: true })
  await assert.rejects(() => createArticleImageSource(f.options), /destination changed/)
  assert.equal(fs.existsSync(path.join(f.root, "runs/joined-meta")), false)
  assert.equal(fs.existsSync(path.join(f.root, `parses/${planned.parses[0].parse_id}`)), false)
})

test("an image fact needs cited page metadata before using the page publication date", async (t) => {
  const f = fixture(t)
  await createArticleImageSource(f.options)
  const { parses } = loadStoredSourceRun(f.root, "joined"),
    [metadata, image] = parses
  const claim = {
    statement: "Company A has 50 units.",
    subject: "Company A",
    claim_kind: "attributed_fact",
    event_state: "reported",
    published_at: "2026-10-02",
    numbers: [{ literal: "50", unit: "units", condition: "Company A" }],
    evidence: [
      {
        source_id: image.source_id,
        source_version_id: image.source_version_id,
        parse_id: image.parse_id,
        block_id: image.blocks[0].block_id,
        quote: image.blocks[0].text,
        support: "direct",
      },
    ],
  }
  assert.ok(validateEvidence(claim, parses).problems.includes("publication_date_requires_review"))
  claim.evidence.push({
    source_id: metadata.source_id,
    source_version_id: metadata.source_version_id,
    parse_id: metadata.parse_id,
    block_id: metadata.blocks[1].block_id,
    quote: metadata.blocks[1].text,
    support: "direct",
  })
  assert.equal(validateEvidence(claim, parses).structural_pass, true)
  assert.equal(image.dates.published_at, null)
})

async function registeredCollectionFixture(t) {
  const f = await wholeImageFixture(t)
  const registration = await registerArticleImageReview({ root: f.root, sourceRun: "joined" })
  const observed_at = "2026-10-10T00:00:00Z"
  const article = {
    ...f.article,
    final_url: f.article.original_url,
    policy_status: "checked",
    observed_at,
  }
  const image = {
    ...f.image,
    final_url: f.image.original_url,
    policy_status: "checked",
    observed_at,
  }
  const parent = { ...structuredClone(f.parent), dates: { ...f.parent.dates, observed_at } }
  const channel = {
    channel_id: "synthetic-image-rss",
    method: "rss",
    url: "https://example.test/feed",
    language: "en",
    region: "해외",
    axis: "기술·제품",
    sectors: ["로봇·제조"],
    kind: "industry-press",
    allowed_hosts: ["example.test", "cdn.example.test"],
    item_pattern: "^https://example\\.test/news/.+$",
    listing_profile: {
      pagination: "bounded-feed",
      rule_id: "synthetic-image-feed",
      feed_title: "Synthetic image feed",
    },
  }
  const listingBytes = Buffer.from(
    `<rss version="2.0"><channel><title>Synthetic image feed</title><item><title>${parent.title}</title><link>${article.original_url}</link><guid>${article.original_url}</guid><pubDate>Fri, 02 Oct 2026 12:00:00 GMT</pubDate></item><item><title>Older source</title><link>https://example.test/news/old</link><guid>https://example.test/news/old</guid><pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>`,
  )
  const listingHash = sha256(listingBytes),
    listingId = sourceId(channel.url)
  const listing = {
    ...article,
    source_id: listingId,
    source_version_id: `${listingId}:${listingHash}`,
    original_url: channel.url,
    final_url: channel.url,
    body_sha256: listingHash,
    body_path: `documents/${listingId}/${listingHash}/body.bin`,
    mime_type: "application/rss+xml",
  }
  atomicCreate(f.root, listing.body_path, listingBytes)
  const listingParse = await parseStoredRSSFeed(f.root, listing, channel)
  const profiles = [
    {
      id: "article",
      url_pattern: "^https://example\\.test/news/table$",
      options: {
        body_images: {
          max_images: 1,
          url_pattern: "^https://cdn\\.example\\.test/table\\.png$",
          parse_options: { ocr: true },
        },
      },
    },
  ]
  const links = [
    {
      url: article.original_url,
      text: parent.title,
      published_at: parent.dates.published_at,
      discovered_at: observed_at,
    },
  ]
  let ocrCalls = 0
  const collect = (overrides = {}) =>
    collectWindowDetails(
      f.root,
      { stage: overrides.stage || (async (_name, _input, fn) => fn()) },
      {},
      channel,
      profiles,
      links,
      {
        fetchPolicy: async (_root, _fetcher, url) =>
          url === article.original_url ? article : image,
        parse: async (_root, document) => {
          if (document.source_id === article.source_id) return parent
          ocrCalls += 1
          return {
            ...f.imageParse,
            source_version_id: document.source_version_id,
            dates: { ...f.imageParse.dates, observed_at: document.observed_at },
          }
        },
        ...overrides,
      },
    )
  const scan = (result) => ({
    ...result,
    documents: [listing, ...result.documents],
    parses: [listingParse, ...result.parses],
    indexDocuments: [listing],
    summary: {
      schema: "research-list-scan/v1",
      channel_id: channel.channel_id,
      status: "window_scanned",
      listing_source_version_id: listing.source_version_id,
      pagination: "bounded-feed",
      assessment: assessBoundedRSSFeed(listingParse, channel, "2026-10-02", "2026-10-03"),
      window: { since: "2026-10-02", until_exclusive: "2026-10-03" },
      details: result.details,
      candidate_count: result.candidates.length,
    },
  })
  const window = {
    channel_id: channel.channel_id,
    since: "2026-10-02",
    until_exclusive: "2026-10-03",
  }
  return {
    ...f,
    registration,
    article,
    image,
    parent,
    channel,
    collect,
    scan,
    window,
    ocrCalls: () => ocrCalls,
  }
}

test("registered whole-image review survives restart and later observations without OCR or promotion", async (t) => {
  const f = await registeredCollectionFixture(t)
  assert.equal(
    (await registerArticleImageReview({ root: f.root, sourceRun: "joined" })).reused,
    true,
  )
  // A parser upgrade does not change the exact raw bytes and confirmed DOM.
  f.parent.parse_id = sha256("new-parser-same-original")
  f.parent.parser = { id: "new-synthetic-parser", version: "2" }
  f.parent.title_basis.excluded = []
  const result = await f.collect()
  assert.equal(f.ocrCalls(), 0)
  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].review_status, "unreviewed")
  assert.equal(result.candidates[0].event_id, undefined)
  assert.equal(result.details[0].status, "source_parsed_unreviewed")
  assert.deepEqual(result.details[0].article_image_review, f.registration.reference)
  assert.equal(result.parses[0].parser.id, "article-image-metadata")
  assert.equal(result.parses[0].status, "partial")
  assert.deepEqual(
    result.parses[0].blocks.map((block) => block.kind),
    ["heading", "metadata"],
  )
  assert.equal(result.parses[1].quality.source_document_complete, true)
  assert.equal(result.parses[1].dates.observed_at, f.image.observed_at)
  assert.equal(
    loadStoredSourceRun(f.root, "joined").parses[1].dates.observed_at,
    f.imageParse.dates.observed_at,
  )
  assert.equal(verifyStoredListScan(f.root, f.scan(result), f.window), true)
  const partial = f.scan(result)
  partial.summary.status = "incomplete"
  partial.summary.reason = "detail_incomplete"
  assert.equal(verifyStoredPartialCandidates(f.root, partial, f.window), true)
  atomicCreate(f.root, "runs/later/documents.json", result.documents)
  atomicCreate(f.root, "runs/later/parses.json", result.parses)
  const selected = selectStoredSources(f.root, "later", [f.article.original_url])
  assert.equal(selected.documents.length, 2)
  assert.deepEqual(selected.identity.selected_urls, [f.article.original_url, f.image.original_url])
  assert.equal(
    articleContentFingerprint(selected.parses[0], selected.parses),
    result.candidates[0].article_content_sha256,
  )
})

test("whole-image candidates pass onboarding with their own body among unrelated source parses", async (t) => {
  const f = await registeredCollectionFixture(t)
  const repo = path.join(f.root, "onboarding-repo")
  fs.mkdirSync(path.join(repo, "data"), { recursive: true })
  const read = (name) => JSON.parse(fs.readFileSync(`data/research-${name}.json`))
  const channels = read("source-channels"),
    watchlist = read("watchlist"),
    acquisition = read("acquisition"),
    recipes = read("source-recipes")
  channels.channels.push({
    ...f.channel,
    id: f.channel.channel_id,
    name: "Synthetic image feed",
    onboarding: { status: "configured", collection_enabled: true },
  })
  for (const [name, value] of [
    ["source-channels", channels],
    ["watchlist", watchlist],
    ["acquisition", acquisition],
    ["source-recipes", recipes],
    ["daily-routes", read("daily-routes")],
  ])
    fs.writeFileSync(path.join(repo, `data/research-${name}.json`), JSON.stringify(value))
  for (const name of ["scripts", "integrations"])
    fs.symlinkSync(path.resolve(name), path.join(repo, name))
  const route = registry(channels, watchlist, acquisition, recipes).find(
    (r) => r.channel_id === f.channel.channel_id,
  )
  const basis = collectionBasis(route, acquisition.article_profiles, repo)
  const normal = f.scan(await f.collect())
  const empty = {
    ...normal,
    documents: [normal.indexDocuments[0]],
    parses: [normal.parses[0]],
    candidates: [],
    summary: {
      ...normal.summary,
      candidate_count: 0,
      details: [],
      window: { since: "2026-10-03", until_exclusive: "2026-10-04" },
    },
  }
  for (const [run, scan] of [
    ["onboard-normal", normal],
    ["onboard-empty", empty],
  ]) {
    for (const [name, value] of [
      ["documents", scan.documents],
      ["parses", scan.parses],
      ["candidates", scan.candidates],
      ["list-pages", scan.indexDocuments],
      ["list-scan", scan.summary],
      ["collection-basis", basis],
    ])
      atomicCreate(f.root, `runs/${run}/${name}.json`, value)
    atomicCreate(f.root, `runs/${run}/state.json`, {
      schema: "research-run/v1",
      run_id: run,
      stages: {
        "collection-basis": {
          status: "complete",
          input_hash: sha256(JSON.stringify(basis)),
          result_hash: sha256(JSON.stringify(basis)),
          result_path: `runs/${run}/collection-basis.json`,
        },
      },
    })
  }
  const options = {
    repo,
    root: f.root,
    channel: route.channel_id,
    baselineRun: "onboard-normal",
    emptyRun: "onboard-empty",
  }
  const proof = await verifySourceOnboarding(options, { resume: async () => {} })
  assert.equal(proof.duplicate_check.count, 1)
  assert.equal(f.ocrCalls(), 0)
  const reviewFile = path.join(f.root, f.registration.reference.path)
  fs.appendFileSync(reviewFile, " ")
  await assert.rejects(
    activateSourceOnboarding({ ...options, receipt: proof.receipt, apply: true }),
    /review changed/,
  )
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(repo, "data/research-daily-routes.json"))).routes.some(
      (r) => r.channel_id === route.channel_id,
    ),
    false,
  )
})

test("changed image bytes, HTML bytes or image position cannot reuse a prior review", async (t) => {
  const f = await registeredCollectionFixture(t)
  const original = structuredClone(f.image)
  f.image.body_sha256 = sha256("changed-image")
  f.image.source_version_id = `${f.image.source_id}:${f.image.body_sha256}`
  assert.equal((await f.collect()).candidates.length, 0)
  assert.equal(f.ocrCalls(), 1)
  Object.assign(f.image, original)
  f.article.body_sha256 = sha256("changed-html")
  f.article.source_version_id = `${f.article.source_id}:${f.article.body_sha256}`
  assert.equal((await f.collect()).candidates.length, 0)
  assert.equal(f.ocrCalls(), 2)
  Object.assign(f.article, {
    body_sha256: f.parent.source_version_id.split(":")[1],
    source_version_id: f.parent.source_version_id,
  })
  f.parent.body_images[0].dom_path = "/html/body/other/img"
  assert.equal((await f.collect()).candidates.length, 0)
  assert.equal(f.ocrCalls(), 3)
  f.parent.body_images[0].dom_path = f.parent.title_basis.dom_path.replace("/h1", "/article/img")
  f.parent.title_basis.excluded = [{ dom_path: "/html/body/h1/span", text: "Changed prefix" }]
  const excluded = await f.collect()
  assert.equal(excluded.candidates.length, 0)
  assert.equal(excluded.details[0].status, "article_image_review_invalid")
  assert.equal(f.ocrCalls(), 3)
})

test("tampered native review fails closed and retains captured images without invoking OCR", async (t) => {
  const f = await registeredCollectionFixture(t)
  const reviewPath = path.join(f.root, "runs/full-image/ocr-table-review.json")
  const review = JSON.parse(fs.readFileSync(reviewPath))
  review.tables[0].rows[0][1].text = "5000"
  fs.writeFileSync(reviewPath, JSON.stringify(review))
  const result = await f.collect()
  assert.equal(result.candidates.length, 0)
  assert.equal(result.documents.length, 2)
  assert.equal(f.ocrCalls(), 0)
  assert.equal(result.details[0].status, "article_image_review_invalid")
  assert.match(result.details[0].error, /review changed/)
})

test("review reference, selected source or candidate fingerprint changes invalidate scan acceptance", async (t) => {
  const f = await registeredCollectionFixture(t)
  const result = await f.collect()
  for (const change of [
    (scan) => {
      scan.candidates[0].article_image_review.sha256 = "0".repeat(64)
    },
    (scan) => {
      scan.candidates[0].article_content_sha256 = "0".repeat(64)
    },
    (scan) => {
      scan.candidates[0].supporting_source_urls = []
    },
    (scan) => {
      scan.summary.details[0].article_image_review.sha256 = "0".repeat(64)
    },
  ]) {
    const scan = structuredClone(f.scan(result))
    change(scan)
    assert.throws(() => verifyStoredListScan(f.root, scan, f.window), /review|binding|observations/)
  }
})

test("altered resumed review stages cannot replace the validated native cells", async (t) => {
  const f = await registeredCollectionFixture(t)
  const result = await f.collect({
    stage: async (name, _input, fn) => {
      const value = await fn()
      if (name.startsWith("review-body-image-")) value.blocks[0].text = "Corrupted resumed stage"
      return value
    },
  })
  assert.equal(result.candidates.length, 0)
  assert.equal(result.documents.length, 2)
  assert.equal(result.details[0].status, "article_image_body_parse_failed")
  assert.match(result.details[0].body_images[0].error, /differs from its verified native cells/)
  assert.equal(f.ocrCalls(), 0)
})

test("scoped or partial image bodies cannot enter the persistent review registry", async (t) => {
  const f = fixture(t)
  await createArticleImageSource(f.options)
  await assert.rejects(
    registerArticleImageReview({ root: f.root, sourceRun: "joined" }),
    /complete native/,
  )
  assert.equal(fs.existsSync(path.join(f.root, "article-image-reviews")), false)
})

test("CLI plans without writes and executes the shared native input", (t) => {
  const f = fixture(t),
    invoke = (mode) =>
      spawnSync(
        process.execPath,
        [
          "scripts/research-article-images.mjs",
          "--root",
          f.root,
          "--run",
          "joined",
          "--source-run",
          "original",
          "--parse-id",
          f.parent.parse_id,
          "--image-run",
          "image",
          mode,
        ],
        { encoding: "utf8" },
      )
  const plan = invoke("--plan-only")
  assert.equal(plan.status, 0, plan.stderr)
  assert.equal(JSON.parse(plan.stdout).status, "planned")
  assert.equal(fs.existsSync(path.join(f.root, "runs/joined")), false)
  const result = invoke("--execute")
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).source_requests, 0)
  assert.equal(loadStoredSourceRun(f.root, "joined").parses.length, 2)
})
