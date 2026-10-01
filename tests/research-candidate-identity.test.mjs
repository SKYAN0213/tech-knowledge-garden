import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { recordCandidateIdentity } from "../scripts/research/candidate-identity.mjs"
import { researchWindow } from "../scripts/research-window.mjs"
import { mergeBacklog } from "../scripts/research/discovery.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { articleContentFingerprint } from "../scripts/research/parser.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"

function storedSource(root, runId, url, text, parseLabel, observedAt = "2026-09-28T00:00:00Z") {
  const id = sourceId(url)
  const bodyHash = sha256(text)
  const parseId = sha256(parseLabel)
  const document = {
    source_id: id,
    source_version_id: `${id}:${bodyHash}`,
    original_url: url,
    final_url: url,
    body_path: `documents/${id}/${bodyHash}/body.bin`,
    body_sha256: bodyHash,
    fetch_status: "captured",
    observed_at: observedAt,
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id: id,
    source_version_id: document.source_version_id,
    parse_id: parseId,
    status: "extracted",
    title: "Official release",
    dates: { published_at: "2026-09-10", observed_at: document.observed_at },
    blocks: [{ block_id: `${parseId}:b1`, text, locator: { text_hash: sha256(text) } }],
    quality: { missing_pages: [] },
  }
  atomicWrite(root, document.body_path, text)
  atomicWrite(root, `parses/${parseId}/parse.json`, parse)
  atomicWrite(root, `runs/${runId}/documents.json`, [document])
  atomicWrite(root, `runs/${runId}/parses.json`, [parse])
  return { document, parse }
}

function fixture(t) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "research-identity-")))
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  const root = path.join(base, "local-ai")
  const backlogFile = path.join(base, "candidate-backlog.json")
  const candidateURL = "https://example.org/de-de/news/robot-launch"
  const publishedURL = "https://example.org/en-gb/news/robot-launch"
  const candidateText = "KUKA stellt den KMF 1500P-CB vor. Ab Dezember 2026 wird geliefert."
  const publishedText = "KUKA introduces the KMF 1500P-CB. Delivery starts December 2026."
  const candidate = storedSource(root, "candidate", candidateURL, candidateText, "candidate")
  const published = storedSource(root, "published", publishedURL, publishedText, "published")
  const eventId = "aaaaaaaaaaaaaaaa"
  const originalCandidate = {
    key: `source-${candidate.document.source_id}`,
    title: "German release",
    source_urls: [candidateURL],
    source_published_at: "2026-09-10",
    discovered_at: "2026-09-28T00:00:00Z",
    review_status: "unreviewed",
    priority: "normal",
    article_source_version_id: candidate.document.source_version_id,
    article_observed_at: candidate.document.observed_at,
  }
  atomicWrite(root, "runs/candidate/candidates.json", [originalCandidate])
  atomicWrite(path.dirname(backlogFile), path.basename(backlogFile), {
    schema: "research-candidates/v1",
    candidates: [originalCandidate],
  })
  const review = {
    schema: "editorial-candidate-identity/v1",
    decision: "same_published_event",
    reviewer: "Direct bilingual source comparison",
    reviewed_at: "2026-09-28",
    candidate: {
      source_url: candidateURL,
      source_id: candidate.document.source_id,
      source_version_id: candidate.document.source_version_id,
      body_sha256: candidate.document.body_sha256,
      parse_id: candidate.parse.parse_id,
      published_at: "2026-09-10",
    },
    published: {
      source_url: publishedURL,
      source_id: published.document.source_id,
      source_version_id: published.document.source_version_id,
      body_sha256: published.document.body_sha256,
      parse_id: published.parse.parse_id,
      published_at: "2026-09-10",
      event_id: eventId,
      title: "KUKA forklift announcement",
    },
    matches: [
      {
        aspect: "identity_marker",
        candidate_block_id: candidate.parse.blocks[0].block_id,
        candidate_excerpt: "KMF 1500P-CB",
        published_block_id: published.parse.blocks[0].block_id,
        published_excerpt: "KMF 1500P-CB",
        conclusion: "The exact product model is the same.",
      },
      {
        aspect: "event_action",
        candidate_block_id: candidate.parse.blocks[0].block_id,
        candidate_excerpt: "Ab Dezember 2026 wird geliefert",
        published_block_id: published.parse.blocks[0].block_id,
        published_excerpt: "Delivery starts December 2026",
        conclusion: "Both sources announce the same planned first delivery month.",
      },
    ],
    same_event_reason: "The product, announcement day and planned delivery match.",
    new_article: false,
    candidate_published: false,
  }
  const publishedArticles = [
    {
      event_id: eventId,
      title: review.published.title,
      published_at: "2026-09-10",
      review_status: "verified",
      source_urls: [publishedURL],
    },
  ]
  atomicWrite(root, "review/identity.json", review)
  return { root, backlogFile, review, publishedArticles, originalCandidate, eventId }
}

function apply(f, overrides = {}) {
  return recordCandidateIdentity({
    root: f.root,
    runId: "identity",
    sourceRunId: "candidate",
    publishedSourceRunId: "published",
    reviewPath: "review/identity.json",
    backlogFile: f.backlogFile,
    publishedArticles: f.publishedArticles,
    ...overrides,
  })
}

test("two exact official source versions link one multilingual candidate to a fixed published event", async (t) => {
  const f = fixture(t)
  const first = await apply(f)
  assert.equal(first.event_id, f.eventId)
  assert.equal(first.candidate_published, false)
  const before = fs.readFileSync(f.backlogFile)
  const second = await apply(f)
  assert.equal(second.backlog_sha256, first.backlog_sha256)
  assert.deepEqual(fs.readFileSync(f.backlogFile), before)
  const linked = readJSON(path.dirname(f.backlogFile), path.basename(f.backlogFile)).candidates[0]
  assert.equal(linked.review_status, "verified")
  assert.equal(linked.event_id, f.eventId)
  assert.equal(linked.identity.review_path, "review/identity.json")
  assert.equal(
    researchWindow(
      "2026-09-09T00:00:00Z",
      "2026-09-28T00:00:00Z",
      {
        schema: "research-candidates/v1",
        candidates: [linked],
      },
      [
        {
          key: "2026-09-11",
          items: [
            {
              id: f.eventId,
              urls: f.publishedArticles[0].source_urls,
              review: { review_status: "verified" },
            },
          ],
        },
      ],
    ).pending.length,
    0,
  )
  await mergeBacklog(f.backlogFile, [f.originalCandidate])
  assert.equal(
    readJSON(path.dirname(f.backlogFile), path.basename(f.backlogFile)).candidates[0].event_id,
    f.eventId,
  )
  assert.equal(readJSON(f.root, "runs/candidate/candidates.json")[0].event_id, undefined)
})

test("source-selection candidates can link across differing publication dates with cited event-day evidence", async (t) => {
  const f = fixture(t)
  const candidate = storedSource(
    f.root,
    "candidate",
    f.review.candidate.source_url,
    "Six Samsung affiliates said they committed USD 1 billion to Helix on September 10.",
    "candidate-later-publication",
  )
  candidate.parse.dates.published_at = "2026-09-11"
  atomicWrite(f.root, `parses/${candidate.parse.parse_id}/parse.json`, candidate.parse)
  atomicWrite(f.root, "runs/candidate/parses.json", [candidate.parse])
  const published = storedSource(
    f.root,
    "published",
    "https://example.org/en/news/helix-investment",
    "Samsung today announced a combined USD 1 billion commitment to Helix.",
    "published-helix",
  )
  published.parse.dates.published_at = "2026-09-10"
  atomicWrite(f.root, `parses/${published.parse.parse_id}/parse.json`, published.parse)
  atomicWrite(f.root, "runs/published/parses.json", [published.parse])
  f.review.published = {
    source_url: published.document.original_url,
    source_id: published.document.source_id,
    source_version_id: published.document.source_version_id,
    body_sha256: published.document.body_sha256,
    parse_id: published.parse.parse_id,
    published_at: "2026-09-10",
    event_id: f.eventId,
    title: "Samsung’s Helix investment",
  }
  f.publishedArticles = [
    {
      event_id: f.eventId,
      title: f.review.published.title,
      published_at: "2026-09-10",
      review_status: "verified",
      source_urls: [published.document.original_url],
    },
  ]
  const selection = {
    schema: "research-source-selection/v1",
    source_run: { source_run: "candidate" },
    selected_urls: [f.review.candidate.source_url],
    candidate_key: f.originalCandidate.key,
    candidate_source_version_id: candidate.document.source_version_id,
    candidate_parse_id: candidate.parse.parse_id,
    selection_basis: "exact_search_intake",
  }
  atomicWrite(f.root, "runs/selection/documents.json", [candidate.document])
  atomicWrite(f.root, "runs/selection/parses.json", [candidate.parse])
  atomicWrite(f.root, "runs/selection/source-selection.json", selection)
  const row = {
    ...f.originalCandidate,
    source_published_at: "2026-09-11",
    article_source_version_id: candidate.document.source_version_id,
  }
  atomicWrite(path.dirname(f.backlogFile), path.basename(f.backlogFile), {
    schema: "research-candidates/v1",
    candidates: [row],
  })
  const review = structuredClone(f.review)
  review.candidate = {
    ...review.candidate,
    source_version_id: candidate.document.source_version_id,
    body_sha256: candidate.document.body_sha256,
    parse_id: candidate.parse.parse_id,
    published_at: "2026-09-11",
  }
  review.event_date = "2026-09-10"
  review.matches = [
    {
      aspect: "identity_marker",
      candidate_block_id: candidate.parse.blocks[0].block_id,
      candidate_excerpt: "USD 1 billion to Helix",
      published_block_id: published.parse.blocks[0].block_id,
      published_excerpt: "USD 1 billion commitment to Helix",
      conclusion: "The amount and investment target match.",
    },
    {
      aspect: "event_action",
      candidate_block_id: candidate.parse.blocks[0].block_id,
      candidate_excerpt: "Six Samsung affiliates said they committed",
      published_block_id: published.parse.blocks[0].block_id,
      published_excerpt: "Samsung today announced a combined USD 1 billion commitment",
      conclusion: "Both sources describe the same six-company investment commitment.",
    },
  ]
  review.matches.push({
    aspect: "event_date",
    candidate_block_id: candidate.parse.blocks[0].block_id,
    candidate_excerpt: "on September 10",
    published_block_id: published.parse.blocks[0].block_id,
    published_excerpt: "today announced",
    conclusion:
      "The later article states that the already announced event occurred on September 10.",
  })
  review.reviewed_at = "2026-09-28"
  atomicWrite(f.root, "review/identity.json", review)
  const linked = await apply(f, {
    runId: "cross-date-identity",
    sourceRunId: "candidate",
    candidateRunId: "selection",
  })
  assert.equal(linked.event_id, f.eventId)
  assert.equal(linked.candidate_published, false)
  const resumed = await apply(f, {
    runId: "cross-date-identity",
    sourceRunId: "candidate",
    candidateRunId: "selection",
  })
  assert.equal(resumed.backlog_sha256, linked.backlog_sha256)
  const backlog = readJSON(path.dirname(f.backlogFile), path.basename(f.backlogFile))
  assert.equal(backlog.candidates[0].identity.publication_dates_match, false)
  assert.equal(backlog.candidates[0].identity.event_date, "2026-09-10")
})

test("different publication dates cannot link without cited event-day evidence", async (t) => {
  const f = fixture(t)
  const candidate = storedSource(
    f.root,
    "candidate",
    f.review.candidate.source_url,
    "A new announcement with the same product identifier.",
    "candidate-different-day",
  )
  candidate.parse.dates.published_at = "2026-09-11"
  atomicWrite(f.root, `parses/${candidate.parse.parse_id}/parse.json`, candidate.parse)
  atomicWrite(f.root, "runs/candidate/documents.json", [candidate.document])
  atomicWrite(f.root, "runs/candidate/parses.json", [candidate.parse])
  const row = {
    ...f.originalCandidate,
    source_published_at: "2026-09-11",
    article_source_version_id: candidate.document.source_version_id,
  }
  atomicWrite(f.root, "runs/candidate/candidates.json", [row])
  atomicWrite(path.dirname(f.backlogFile), path.basename(f.backlogFile), {
    schema: "research-candidates/v1",
    candidates: [row],
  })
  const review = structuredClone(f.review)
  review.candidate = {
    ...review.candidate,
    source_version_id: candidate.document.source_version_id,
    body_sha256: candidate.document.body_sha256,
    parse_id: candidate.parse.parse_id,
    published_at: "2026-09-11",
  }
  review.candidate.published_at = "2026-09-11"
  review.event_date = undefined
  atomicWrite(f.root, "review/identity.json", review)
  await assert.rejects(
    apply(f, { runId: "cross-date-without-event-date" }),
    /Different publication dates require a directly evidenced event date/,
  )
})

test("same-source rediscovery links only when source content, title, date and published event agree", async (t) => {
  const f = fixture(t)
  const exactURL = f.review.candidate.source_url
  const text = "KUKA introduces the KMF 1500P-CB. Delivery starts December 2026."
  const candidate = storedSource(f.root, "candidate", exactURL, text, "candidate-exact")
  const published = storedSource(f.root, "published", exactURL, text, "published-exact")
  candidate.parse.title = "KUKA product announcement"
  published.parse.title = candidate.parse.title
  atomicWrite(f.root, `parses/${candidate.parse.parse_id}/parse.json`, candidate.parse)
  atomicWrite(f.root, `parses/${published.parse.parse_id}/parse.json`, published.parse)
  atomicWrite(f.root, "runs/candidate/parses.json", [candidate.parse])
  atomicWrite(f.root, "runs/published/parses.json", [published.parse])

  const row = {
    ...f.originalCandidate,
    key: `source-${candidate.document.source_id}`,
    title: candidate.parse.title,
    source_urls: [exactURL],
    article_source_version_id: candidate.document.source_version_id,
  }
  atomicWrite(f.root, "runs/candidate/candidates.json", [row])
  atomicWrite(path.dirname(f.backlogFile), path.basename(f.backlogFile), {
    schema: "research-candidates/v1",
    candidates: [row],
  })
  const exactReview = {
    schema: "editorial-candidate-identity/v1",
    decision: "same_published_source_revision",
    reviewer: "Direct source and published article comparison",
    reviewed_at: "2026-09-28",
    candidate: {
      source_url: exactURL,
      source_id: candidate.document.source_id,
      source_version_id: candidate.document.source_version_id,
      body_sha256: candidate.document.body_sha256,
      parse_id: candidate.parse.parse_id,
      source_title: candidate.parse.title,
      published_at: "2026-09-10",
    },
    published: {
      source_url: exactURL,
      source_id: published.document.source_id,
      source_version_id: published.document.source_version_id,
      body_sha256: published.document.body_sha256,
      parse_id: published.parse.parse_id,
      source_title: published.parse.title,
      published_at: "2026-09-10",
      event_id: f.eventId,
      title: "Existing Korean article",
    },
    matches: [
      {
        aspect: "identity_marker",
        candidate_block_id: candidate.parse.blocks[0].block_id,
        candidate_excerpt: "KMF 1500P-CB",
        published_block_id: published.parse.blocks[0].block_id,
        published_excerpt: "KMF 1500P-CB",
        conclusion: "Both stored parses preserve the same model identifier.",
      },
      {
        aspect: "event_action",
        candidate_block_id: candidate.parse.blocks[0].block_id,
        candidate_excerpt: "Delivery starts December 2026.",
        published_block_id: published.parse.blocks[0].block_id,
        published_excerpt: "Delivery starts December 2026.",
        conclusion: "Both parses preserve the same planned delivery statement.",
      },
    ],
    same_event_reason:
      "The canonical source URL, extracted content fingerprint, title and announcement day are identical to the evidence for the verified event.",
    new_article: false,
    candidate_published: false,
  }
  f.publishedArticles = [
    {
      event_id: f.eventId,
      title: exactReview.published.title,
      published_at: "2026-09-10",
      review_status: "verified",
      source_urls: [exactURL],
    },
  ]
  atomicWrite(f.root, "review/identity.json", exactReview)
  const linked = await apply(f, { runId: "same-source-identity" })
  assert.equal(linked.event_id, f.eventId)
  assert.equal(linked.candidate_published, false)
  const backlog = readJSON(path.dirname(f.backlogFile), path.basename(f.backlogFile))
  assert.equal(backlog.candidates[0].review_status, "verified")
  assert.equal(backlog.candidates[0].event_id, f.eventId)
  assert.equal(backlog.candidates[0].identity.decision, "same_published_source_revision")

  const changedParse = structuredClone(published.parse)
  changedParse.blocks[0].text = "KUKA introduces a different forklift model."
  changedParse.blocks[0].locator.text_hash = sha256(changedParse.blocks[0].text)
  atomicWrite(f.root, `parses/${published.parse.parse_id}/parse.json`, changedParse)
  atomicWrite(f.root, "runs/published/parses.json", [changedParse])
  await assert.rejects(
    apply(f, { runId: "changed-source-identity" }),
    /identical article content, title and exact source identity/,
  )
  assert.equal(
    readJSON(path.dirname(f.backlogFile), path.basename(f.backlogFile)).candidates[0].event_id,
    f.eventId,
  )
})

test("identity review rejects an unproven pair or a different published event", async (t) => {
  const f = fixture(t)
  const changed = structuredClone(f.review)
  changed.matches[0].published_excerpt = "another product"
  atomicWrite(f.root, "review/identity.json", changed)
  await assert.rejects(apply(f), /cite exact text/)
  atomicWrite(f.root, "review/identity.json", f.review)
  await assert.rejects(
    apply(f, { publishedArticles: [{ ...f.publishedArticles[0], event_id: "bbbbbbbbbbbbbbbb" }] }),
    /Fixed event/,
  )
  assert.equal(
    readJSON(path.dirname(f.backlogFile), path.basename(f.backlogFile)).candidates[0].review_status,
    "unreviewed",
  )
})

test("identity review cannot overrule newer candidate content or an existing rejection", async (t) => {
  const f = fixture(t)
  const dir = path.dirname(f.backlogFile)
  const name = path.basename(f.backlogFile)
  const backlog = readJSON(dir, name)
  backlog.candidates[0].article_content_sha256 = sha256("new article text")
  atomicWrite(dir, name, backlog)
  await assert.rejects(apply(f), /newer observed article content/)
  delete backlog.candidates[0].article_content_sha256
  backlog.candidates[0].review_status = "rejected"
  backlog.candidates[0].reason = "Previously rejected on separate evidence"
  atomicWrite(dir, name, backlog)
  await assert.rejects(apply(f), /Cannot replace an existing candidate event/)
})

test("new article content reopens a linked locale and an exact new review can relink it", async (t) => {
  const f = fixture(t)
  await apply(f)
  const dir = path.dirname(f.backlogFile)
  const name = path.basename(f.backlogFile)
  const linked = readJSON(dir, name).candidates[0]
  const wrapperOnly = {
    ...f.originalCandidate,
    discovered_at: "2026-09-28T01:00:00Z",
    article_observed_at: "2026-09-28T01:00:00Z",
    article_source_version_id: `${sourceId(f.review.candidate.source_url)}:${sha256("new wrapper")}`,
    article_content_sha256: linked.article_content_sha256,
  }
  await mergeBacklog(f.backlogFile, [wrapperOnly])
  assert.equal(readJSON(dir, name).candidates[0].review_status, "verified")
  assert.equal(readJSON(dir, name).candidates[0].source_revision_alert, undefined)

  const updatedText =
    "KUKA stellt den KMF 1500P-CB vor. Ab Dezember 2026 wird geliefert. Further details."
  const updated = storedSource(
    f.root,
    "candidate-v2",
    f.review.candidate.source_url,
    updatedText,
    "candidate-v2",
    "2026-09-28T02:00:00Z",
  )
  const fresh = {
    ...f.originalCandidate,
    discovered_at: "2026-09-28T02:00:00Z",
    article_observed_at: updated.document.observed_at,
    article_source_version_id: updated.document.source_version_id,
    article_parse_id: updated.parse.parse_id,
    article_content_sha256: articleContentFingerprint(updated.parse),
  }
  atomicWrite(f.root, "runs/candidate-v2/candidates.json", [fresh])
  await mergeBacklog(f.backlogFile, [fresh])
  const waiting = readJSON(dir, name).candidates[0]
  assert.equal(waiting.review_status, "deferred")
  assert.equal(waiting.event_id, f.eventId)
  assert.equal(waiting.identity, undefined)
  assert.equal(waiting.identity_history.length, 1)
  assert.equal(waiting.source_revision_alert.change_basis, "content")
  const window = researchWindow(
    "2026-09-09T00:00:00Z",
    "2026-09-28T03:00:00Z",
    readJSON(dir, name),
    [
      {
        key: "2026-09-11",
        items: [
          {
            id: f.eventId,
            urls: f.publishedArticles[0].source_urls,
            review: { review_status: "verified" },
          },
        ],
      },
    ],
  )
  assert.equal(window.pending[0].next_route, "review-source-revision")
  assert.equal(window.resolved.length, 0)

  const review = structuredClone(f.review)
  Object.assign(review.candidate, {
    source_version_id: updated.document.source_version_id,
    body_sha256: updated.document.body_sha256,
    parse_id: updated.parse.parse_id,
  })
  for (const match of review.matches) match.candidate_block_id = updated.parse.blocks[0].block_id
  atomicWrite(f.root, "review/identity-v2.json", review)
  const repeated = await apply(f, {
    runId: "identity-v2",
    sourceRunId: "candidate-v2",
    candidateRunId: "candidate-v2",
    reviewPath: "review/identity-v2.json",
  })
  assert.equal(repeated.event_id, f.eventId)
  const relinked = readJSON(dir, name).candidates[0]
  assert.equal(relinked.review_status, "verified")
  assert.equal(relinked.source_revision_alert, undefined)
  assert.equal(relinked.identity_history.length, 1)
})
