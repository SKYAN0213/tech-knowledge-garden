import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { recordScheduledEventMaterialLink, verifyScheduledEventMaterialLink } from "../scripts/research/event-material-link.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { storeParseArtifact } from "../scripts/research/parser.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"

const observedAt = "2026-10-03T01:00:00.000Z"
const eventRunId = "schedule-run"
const eventDetailRunId = "event-detail-run"
const materialRunId = "issuer-material-run"
const resolutionRunId = "event-material-resolution"
const eventId = "scheduled-event-20260724"
const eventDetailURL = "https://kind.krx.co.kr/corpgeneral/irschedule.do?irSeq=45182"
const archiveURL = "https://issuer.example/ir/materials"
const materialURL = "https://issuer.example/ir/materials/q2-2026.pdf"

function tempRoot() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "event-material-link-")))
}

function addDocument(root, url, body, mimeType) {
  const bytes = Buffer.from(body)
  const bodySha = sha256(bytes)
  const id = sourceId(url)
  const document = {
    schema_version: "source-document/v1",
    source_id: id,
    original_url: url,
    request_method: "GET",
    final_url: url,
    observed_at: observedAt,
    fetch_status: "captured",
    http_status: 200,
    redirect_chain: [],
    mime_type: mimeType,
    body_sha256: bodySha,
    source_version_id: `${id}:${bodySha}`,
    body_path: `documents/${id}/${bodySha}/body.bin`,
    policy_status: "checked",
    policy: { allowed: true },
  }
  const target = path.join(root, document.body_path)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, bytes)
  return document
}

function addParse(root, document, { title, text, links = [], publishedAt = null, pageCount = null }) {
  const parseId = sha256(`${document.source_version_id}:${title}`)
  const parse = {
    schema_version: "source-parse/v1",
    status: "extracted",
    source_id: document.source_id,
    source_version_id: document.source_version_id,
    parse_id: parseId,
    title,
    dates: { published_at: publishedAt, observed_at: document.observed_at },
    blocks: [
      {
        block_id: `${parseId}:block-000`,
        text,
        locator: { type: "html", text_hash: sha256(text) },
      },
    ],
    links,
    quality: { missing_pages: [] },
    ...(pageCount ? { page_count: pageCount } : {}),
  }
  storeParseArtifact(root, parse)
  return parse
}

function writeRun(root, runId, documents, parses) {
  atomicWrite(root, `runs/${runId}/documents.json`, documents)
  atomicWrite(root, `runs/${runId}/parses.json`, parses)
}

function fixture(root, { materialPublishedAt = null } = {}) {
  const scheduleURL = "https://kind.krx.co.kr/schedule/list?page=13"
  const eventDetailQuote = "회사명 Example Robotics 일자 2026-07-24 시간 16:00"
  const eventTitle = "2026년 2분기 경영실적 발표"
  const materialTitle = "2Q26 Earnings Release"
  const archiveRowQuote = "2026년 2분기 Example Robotics 경영실적"
  const scheduleDoc = addDocument(root, scheduleURL, "schedule index source", "text/html")
  const scheduleParse = addParse(root, scheduleDoc, {
    title: "IR schedule",
    text: `Example Robotics ${eventTitle} - 2026-07-24 16:00`,
  })
  atomicWrite(root, `runs/${eventRunId}/form-html-page-1.json`, scheduleDoc)
  atomicWrite(root, `runs/${eventRunId}/form-html-parse-1.json`, scheduleParse)
  atomicWrite(root, `runs/${eventRunId}/events.json`, {
    schema: "research-scheduled-events/v1",
    candidate_published: false,
    events: [
      {
        event_id: eventId,
        detail_url: eventDetailURL,
        title: eventTitle,
        company: "Example Robotics",
        event_date: "2026-07-24",
        event_date_text: "2026-07-24",
        listing_source_version_id: scheduleDoc.source_version_id,
        listing_body_sha256: scheduleDoc.body_sha256,
        listing_parse_id: scheduleParse.parse_id,
        listing_row_index: 3,
        observed_at: observedAt,
      },
    ],
  })

  const eventDetailDoc = addDocument(root, eventDetailURL, "official event detail source", "text/html")
  const eventDetailParse = addParse(root, eventDetailDoc, {
    title: eventTitle,
    text: eventDetailQuote,
  })
  writeRun(root, eventDetailRunId, [eventDetailDoc], [eventDetailParse])

  const archiveDoc = addDocument(root, archiveURL, archiveRowQuote, "text/html")
  const archiveParse = addParse(root, archiveDoc, {
    title: "Issuer IR archive",
    text: "Investor Relations archive",
    links: [{ url: materialURL, text: "English" }],
  })
  const materialDoc = addDocument(root, materialURL, "%PDF source bytes", "application/pdf")
  const materialParse = addParse(root, materialDoc, {
    title: materialTitle,
    text: materialTitle,
    publishedAt: materialPublishedAt,
    pageCount: 10,
  })
  writeRun(root, materialRunId, [archiveDoc, materialDoc], [archiveParse, materialParse])

  const review = {
    schema: "research-scheduled-event-material-review/v1",
    decision: "supporting_material_for_scheduled_event",
    event_run_id: eventRunId,
    event_id: eventId,
    event_detail_run_id: eventDetailRunId,
    material_run_id: materialRunId,
    material_url: materialURL,
    reviewer: "direct source review",
    reviewed_at: "2026-10-03T01:05:00.000Z",
    reason: "The issuer archive lists the matching quarterly earnings presentation for the scheduled company event.",
    event_detail_quote: eventDetailQuote,
    archive_row_quote: archiveRowQuote,
    archive_link_text: "English",
    material_title_quote: materialTitle,
  }
  atomicWrite(root, `runs/${resolutionRunId}/event-material-link-review.json`, review)
}

test("reviewed event materials retain event and publication dates as separate fields", async () => {
  const root = tempRoot()
  fixture(root)
  try {
    const receipt = await recordScheduledEventMaterialLink({
      root,
      runId: resolutionRunId,
      reviewPath: `runs/${resolutionRunId}/event-material-link-review.json`,
    })
    assert.equal(receipt.schedule_event.event_date, "2026-07-24")
    assert.equal(receipt.schedule_event.published_at, null)
    assert.equal(receipt.supporting_material.title, "2Q26 Earnings Release")
    assert.equal(receipt.supporting_material.published_at, null)
    assert.equal(receipt.publication_date_assigned, false)
    assert.equal(receipt.article_candidate_created, false)
    assert.equal(verifyScheduledEventMaterialLink(root, resolutionRunId).relation_id, receipt.relation_id)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("event material link requires source text for any parsed publication date", async () => {
  const root = tempRoot()
  fixture(root, { materialPublishedAt: "2026-07-24" })
  try {
    await assert.rejects(
      recordScheduledEventMaterialLink({
        root,
        runId: resolutionRunId,
        reviewPath: `runs/${resolutionRunId}/event-material-link-review.json`,
      }),
      /Material publication date quote must occur in the exact stored parse/,
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
