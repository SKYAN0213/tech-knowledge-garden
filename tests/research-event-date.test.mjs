import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  civilDate,
  eventDateMetadata,
  assertRetrospectiveReview,
} from "../scripts/research/event-date.mjs"
import { approvedArticle, editionProjection } from "../scripts/research/publish-adapter.mjs"
import { retrospectiveProjections } from "../scripts/research/preview.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { articleReview, articleDateLabel } from "../scripts/article-review.mjs"
import { articleCard } from "../scripts/reader-cards.mjs"
import { parseNote, extractArticles, noteText } from "../scripts/garden.mjs"

function fixture() {
  const text = "As of August 31, 2026, we have rolled out this control worldwide."
  const p = {
    schema_version: "source-parse/v1",
    source_id: "s1",
    source_version_id: "s1:v1",
    parse_id: "p1",
    status: "extracted",
    title: "Control",
    quality: { missing_pages: [] },
    dates: {
      published_at: "2026-06-03",
      modified_at: "2026-08-31",
      modified_profile_status: "matched",
      modified_basis: { dom_path: "/main/p/i", text: "Updated: August 31, 2026" },
    },
    blocks: [{ block_id: "p1:b1", text, locator: { text_hash: sha256(text) } }],
  }
  const claim = {
    claim_id: "c1",
    candidate_key: "event",
    statement: text,
    subject: "Example Co",
    claim_kind: "attributed_fact",
    event_state: "reported",
    published_at: "2026-06-03",
    effective_period: "2026-08-31",
    numbers: [],
    evidence: [
      {
        source_id: "s1",
        source_version_id: "s1:v1",
        parse_id: "p1",
        block_id: "p1:b1",
        quote: text,
        support: "direct",
      },
    ],
  }
  const claims = recordFactReview(
    [claim],
    [
      {
        claim_id: "c1",
        status: "verified",
        reason: "Fixture checked",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      },
    ],
    { reviewer: "test", reviewed_at: "2026-09-27" },
    [p],
  )
  const draft = {
    title: "Example Co, 제어 기능을 세계로 확대",
    lead: [
      {
        text: "Example Co는 8월 31일 업데이트에서 제어 기능을 전 세계에 제공했다고 밝혔다.",
        claim_ids: ["c1"],
      },
      { text: "사이트 운영자는 해당 제어 기능을 사용할 수 있다.", claim_ids: ["c1"] },
    ],
    facts: {
      who: "Example Co",
      when: "2026-08-31",
      where: "전 세계",
      what: "제어 기능 제공",
      how: null,
      why: null,
    },
    sector: "AI",
    theme: "제품·서비스",
    tags: ["신제품"],
    entities: ["Example Co"],
    explanations: [],
  }
  const record = { draft, draft_id: sha256(JSON.stringify(draft)) }
  const review = {
    status: "approved",
    draft_id: record.draft_id,
    reviewer: "test",
    source_read: true,
    final_prose_read: true,
    title_checked: true,
    dates_checked: true,
    numbers_checked: true,
    analysis_checked: true,
    event_id: "1234567890abcdef",
    published_at: "2026-08-31",
    reviewed_at: "2026-09-27",
    region: "해외",
    event_date_basis: {
      kind: "dated-update",
      source_id: "s1",
      source_version_id: "s1:v1",
      parse_id: "p1",
      block_id: "p1:b1",
      claim_id: "c1",
      date_text: "August 31, 2026",
      source_published_at: "2026-06-03",
    },
  }
  return {
    p,
    claims,
    record,
    review,
    documents: [
      { source_id: "s1", source_version_id: "s1:v1", original_url: "https://example.com/update" },
    ],
  }
}

test("source publication timestamps retain UTC evidence and explicitly project the Seoul publication day", () => {
  const s = fixture()
  const timestamp = "2026-07-13T22:04:00Z"
  const text = "We released the package."
  s.p.dates = {
    published_at: timestamp,
    precision: "timestamp",
    profile_status: "matched",
    basis: { dom_path: "/main/relative-time", attribute: "datetime", text: timestamp },
  }
  s.p.blocks[0] = { block_id: "p1:b1", text, locator: { text_hash: sha256(text) } }
  Object.assign(s.claims[0], { statement: text, published_at: timestamp, effective_period: null })
  s.claims[0].evidence[0].quote = text
  const { review: previousReview, ...claim } = s.claims[0]
  s.claims = recordFactReview(
    [claim],
    [
      {
        claim_id: "c1",
        status: "verified",
        reason: "Timestamp fixture reviewed against the changed parse",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      },
    ],
    { reviewer: "test", reviewed_at: "2026-09-27" },
    [s.p],
  )
  s.record.draft.lead = [
    { text: "Example Co는 7월 14일(한국시각) 패키지를 공개했다.", claim_ids: ["c1"] },
    { text: "공식 릴리스에서 공개 사실을 알렸다.", claim_ids: ["c1"] },
  ]
  s.record.draft.facts.when = "2026-07-14 (Asia/Seoul)"
  s.record.draft_id = s.review.draft_id = sha256(JSON.stringify(s.record.draft))
  s.review.published_at = "2026-07-14"
  s.review.event_date_basis = {
    kind: "source-publication-time",
    source_id: "s1",
    source_version_id: "s1:v1",
    parse_id: "p1",
    claim_id: "c1",
    source_published_at: timestamp,
    timezone: "Asia/Seoul",
  }
  const article = approvedArticle(s.record, s.claims, s.documents, s.review, [s.p])
  assert.equal(article.article_review.published_at, "2026-07-14")
  assert.equal(article.article_review.source_published_at, timestamp)
  assert.equal(article.article_review.date_kind, "source-publication-time")
  assert.equal(s.claims[0].published_at, timestamp)
  assert.equal(s.p.dates.published_at, timestamp)
  const publicReview = articleReview(
    { meta: { article_reviews: [article.article_review] } },
    article.title,
    article.event_id,
  )
  assert.equal(publicReview.source_published_at, timestamp)
  assert.throws(() =>
    articleReview(
      { meta: { article_reviews: [{ ...article.article_review, published_at: "2026-07-13" }] } },
      article.title,
      article.event_id,
    ),
  )
  for (const mutate of [
    (r, p) => (r.event_date_basis.source_published_at = "2026-07-13T23:04:00Z"),
    (r, p) => (r.event_date_basis.timezone = "UTC"),
    (r, p) => (r.event_date_basis.claim_id = "unknown"),
    (r, p) => (p.dates.basis.text = "2026-07-13T23:04:00Z"),
    (r, p) => (p.dates.profile_status = "ambiguous"),
    (r, p) => delete p.dates.basis,
    (r, p) => (p.dates.published_at = "2026-07-13"),
  ]) {
    const r = structuredClone(s.review),
      p = structuredClone(s.p)
    mutate(r, p)
    assert.throws(() => eventDateMetadata(r, s.claims, [p]))
  }
})

test("stored JSON-LD Article publication timestamps support explicit Seoul dates without promoting update metadata", () => {
  const s = fixture()
  const timestamp = "2026-10-05T19:23:58+00:00"
  s.p.parser = { id: "trafilatura" }
  s.p.dates = {
    published_at: timestamp,
    precision: "timestamp",
    profile_status: "matched",
    basis: {
      sources: [
        {
          type: "json-ld",
          script_index: 0,
          node_type: ["Article"],
          attribute: "datePublished",
          text: timestamp,
        },
      ],
    },
  }
  s.claims[0].published_at = timestamp
  s.review.published_at = "2026-10-06"
  s.review.event_date_basis = {
    kind: "source-publication-time",
    source_id: "s1",
    source_version_id: "s1:v1",
    parse_id: "p1",
    claim_id: "c1",
    source_published_at: timestamp,
    timezone: "Asia/Seoul",
  }
  assert.deepEqual(eventDateMetadata(s.review, s.claims, [s.p]), {
    date_kind: "source-publication-time",
    source_published_at: timestamp,
  })
  for (const mutate of [
    (p) => (p.dates.basis.sources[0].attribute = "dateModified"),
    (p) => (p.dates.basis.sources[0].node_type = ["WebPage"]),
    (p) => (p.dates.basis.sources[0].script_index = -1),
    (p) => (p.dates.basis.sources[0].script_index = 32),
    (p) => (p.dates.basis.sources[0].text = "2026-10-05T19:25:35+00:00"),
    (p) => (p.dates.basis.sources = []),
    (p) =>
      p.dates.basis.sources.push({
        ...p.dates.basis.sources[0],
        text: "2026-10-04T19:23:58+00:00",
      }),
    (p) => (p.parser.id = "json-document"),
  ]) {
    const p = structuredClone(s.p)
    mutate(p)
    assert.throws(() => eventDateMetadata(s.review, s.claims, [p]))
  }
})

test("SocialMediaPosting publication timestamps require the reviewed source and current page identity", () => {
  const s = fixture()
  const url = "https://example.com/blog/release"
  const timestamp = "2026-06-30T18:32:50.094Z"
  s.p.source_id = sha256(url).slice(0, 20)
  s.p.parser = { id: "trafilatura" }
  s.p.dates = {
    published_at: timestamp,
    precision: "timestamp",
    profile_status: "matched",
    basis: {
      sources: [
        {
          type: "json-ld",
          script_index: 0,
          node_type: ["SocialMediaPosting"],
          attribute: "datePublished",
          text: timestamp,
          source_url: url,
          main_entity_url: url,
          posting_url: url,
        },
      ],
    },
  }
  s.claims[0].published_at = timestamp
  s.claims[0].evidence[0].source_id = s.p.source_id
  s.review.published_at = "2026-07-01"
  s.review.event_date_basis = {
    kind: "source-publication-time",
    source_id: s.p.source_id,
    source_version_id: s.p.source_version_id,
    parse_id: s.p.parse_id,
    claim_id: s.claims[0].claim_id,
    source_published_at: timestamp,
    timezone: "Asia/Seoul",
  }
  assert.equal(eventDateMetadata(s.review, s.claims, [s.p]).source_published_at, timestamp)
  for (const mutate of [
    (b) => delete b.source_url,
    (b) => delete b.main_entity_url,
    (b) => (b.source_url = "https://other.example/blog/release"),
    (b) => (b.main_entity_url = url + "#comment"),
    (b) => (b.posting_url = url + "#comment"),
    (b) => {
      b.node_type = ["Article", "SocialMediaPosting"]
      b.posting_url = url + "#comment"
    },
    (b) => (b.attribute = "dateModified"),
  ]) {
    const p = structuredClone(s.p)
    mutate(p.dates.basis.sources[0])
    assert.throws(() => eventDateMetadata(s.review, s.claims, [p]))
  }
})

test("matching head metadata may corroborate an Article JSON-LD publication time", () => {
  const s = fixture(),
    timestamp = "2026-07-16T11:00:00+00:00"
  s.p.parser = { id: "trafilatura" }
  s.p.dates = {
    published_at: timestamp,
    precision: "timestamp",
    profile_status: "matched",
    basis: {
      sources: [
        { type: "meta", dom_path: "/html/head/meta[13]", attribute: "content", text: timestamp },
        {
          type: "json-ld",
          script_index: 0,
          node_type: ["BlogPosting"],
          attribute: "datePublished",
          text: timestamp,
        },
      ],
    },
  }
  s.claims[0].published_at = timestamp
  s.review.published_at = "2026-07-16"
  s.review.event_date_basis = {
    kind: "source-publication-time",
    source_id: "s1",
    source_version_id: "s1:v1",
    parse_id: "p1",
    claim_id: "c1",
    source_published_at: timestamp,
    timezone: "Asia/Seoul",
  }
  assert.deepEqual(eventDateMetadata(s.review, s.claims, [s.p]), {
    date_kind: "source-publication-time",
    source_published_at: timestamp,
  })
  for (const mutate of [
    (p) => p.dates.basis.sources.pop(),
    (p) => (p.dates.basis.sources[0].text = "2026-07-23T09:43:51+00:00"),
    (p) => (p.dates.basis.sources[0].dom_path = "/html/body/meta[13]"),
    (p) => (p.dates.basis.sources[0].attribute = "datetime"),
    (p) => (p.dates.basis.sources[1].attribute = "dateModified"),
    (p) => (p.dates.basis.sources[1].node_type = ["WebPage"]),
  ]) {
    const p = structuredClone(s.p)
    mutate(p)
    assert.throws(() => eventDateMetadata(s.review, s.claims, [p]))
  }
})

test("a single recorded publication meta candidate preserves its exact timestamp", () => {
  const s = fixture(),
    timestamp = "2026-07-06T08:58:13-08:00"
  s.p.parser = {
    id: "trafilatura",
    version: "2.2.0",
    adapter_sha256: "a".repeat(64),
    config_hash: "b".repeat(64),
  }
  s.p.dates = {
    published_at: timestamp,
    precision: "timestamp",
    profile_status: "matched",
    candidates: [timestamp],
    basis: {
      sources: [
        { type: "meta", dom_path: "/html/head/meta[20]", attribute: "content", text: timestamp },
      ],
    },
  }
  s.claims[0].published_at = timestamp
  s.review.published_at = "2026-07-07"
  s.review.event_date_basis = {
    kind: "source-publication-time",
    source_id: "s1",
    source_version_id: "s1:v1",
    parse_id: "p1",
    claim_id: "c1",
    source_published_at: timestamp,
    timezone: "Asia/Seoul",
  }
  assert.deepEqual(eventDateMetadata(s.review, s.claims, [s.p]), {
    date_kind: "source-publication-time",
    source_published_at: timestamp,
  })
  for (const mutate of [
    (p) => delete p.dates.candidates,
    (p) => (p.dates.candidates = []),
    (p) => p.dates.candidates.push("2026-07-06T10:24:34-08:00"),
    (p) => (p.dates.candidates[0] = "2026-07-06T10:24:34-08:00"),
    (p) => (p.dates.basis.sources[0].dom_path = "/html/body/meta[20]"),
    (p) => (p.dates.basis.sources[0].attribute = "datetime"),
    (p) => (p.dates.basis.sources[0].text = "2026-07-06T10:24:34-08:00"),
    (p) => p.dates.basis.sources.push({ ...p.dates.basis.sources[0] }),
    (p) => delete p.parser.adapter_sha256,
    (p) => (p.parser.config_hash = "not-a-hash"),
    (p) => (p.parser.id = "json-document"),
  ]) {
    const p = structuredClone(s.p)
    mutate(p)
    assert.throws(() => eventDateMetadata(s.review, s.claims, [p]))
  }
})

test("JSON publication time requires an exact reviewed root field, not a record or observation date", () => {
  const s = fixture()
  const timestamp = "2026-07-13T22:04:00Z"
  s.p.parser = { id: "json-document" }
  s.p.dates = {
    published_at: timestamp,
    precision: "timestamp",
    profile_status: "matched",
    basis: {
      type: "json",
      json_pointer: "/published_at",
      text: timestamp,
      text_hash: sha256(timestamp),
    },
  }
  s.p.blocks = [
    {
      block_id: "p1:b1",
      text: timestamp,
      locator: {
        type: "json",
        json_pointer: "/published_at",
        field_sha256: sha256(timestamp),
        text_hash: sha256(timestamp),
      },
    },
  ]
  s.claims[0].published_at = timestamp
  s.claims[0].evidence[0].quote = timestamp
  s.review.published_at = "2026-07-14"
  s.review.event_date_basis = {
    kind: "source-publication-time",
    source_id: "s1",
    source_version_id: "s1:v1",
    parse_id: "p1",
    claim_id: "c1",
    source_published_at: timestamp,
    timezone: "Asia/Seoul",
  }
  assert.deepEqual(eventDateMetadata(s.review, s.claims, [s.p]), {
    date_kind: "source-publication-time",
    source_published_at: timestamp,
  })
  for (const mutate of [
    (p) => (p.dates.basis.json_pointer = "/other_date"),
    (p) => (p.dates.basis.json_pointer = "/invalid~escape"),
    (p) => (p.dates.basis.text_hash = "0".repeat(64)),
    (p) => (p.blocks[0].locator.field_sha256 = "0".repeat(64)),
    (p) => (p.blocks[0].locator.record = { id: "commit" }),
    (p) => (p.parser.id = "html"),
    (p) => (p.blocks[0].locator.json_pointer = "/observed_at"),
    (p) => (p.blocks[0].text = "Another date"),
  ]) {
    const p = structuredClone(s.p)
    mutate(p)
    assert.throws(() => eventDateMetadata(s.review, s.claims, [p]), /exact used source timestamp/)
  }
  const claims = structuredClone(s.claims)
  claims[0].evidence[0].quote = "Another value"
  assert.throws(() => eventDateMetadata(s.review, claims, [s.p]), /exact used source timestamp/)
  assert.throws(
    () => eventDateMetadata(s.review, s.claims, [s.p], ["other-claim"]),
    /exact used source timestamp/,
  )
})

test("original publication notices preserve the first date without inferring a new update event", () => {
  const s = fixture()
  const notice = "Updated Aug. 5 (originally published July 1)"
  s.p.dates = { published_at: "2026-08-05T13:00:47+00:00", profile_status: "matched" }
  s.p.blocks = [{ block_id: "p1:b1", text: notice, locator: { text_hash: sha256(notice) } }]
  const c = structuredClone(s.claims[0])
  c.evidence = [
    {
      source_id: "s1",
      source_version_id: "s1:v1",
      parse_id: "p1",
      block_id: "p1:b1",
      quote: notice,
      support: "direct",
    },
  ]
  const basis = {
    kind: "source-original-publication-date",
    source_id: "s1",
    source_version_id: "s1:v1",
    parse_id: "p1",
    block_id: "p1:b1",
    claim_id: "c1",
    notice_text: notice,
    page_published_at: s.p.dates.published_at,
  }
  const review = { ...s.review, published_at: "2026-07-01", event_date_basis: basis }
  const expected = { date_kind: basis.kind, source_published_at: "2026-07-01" }
  assert.deepEqual(eventDateMetadata(review, [c], [s.p]), expected)
  const publicReview = articleReview(
    {
      meta: {
        article_reviews: [
          {
            title: "Original",
            event_id: s.review.event_id,
            review_status: "verified",
            concept_ids: [],
            published_at: "2026-07-01",
            reviewed_at: "2026-09-27",
            ...expected,
          },
        ],
      },
    },
    "Original",
    s.review.event_id,
  )
  assert.equal(publicReview.published_at, "2026-07-01")
  assert.equal(articleDateLabel(publicReview), "원문 게시")
  const mutations = [
    (r) => {
      r.published_at = "2026-08-05"
    },
    (r) => {
      r.event_date_basis.page_published_at = "2026-08-06T13:00:47+00:00"
    },
    (r, p) => {
      p.blocks[0].locator.text_hash = sha256("changed")
    },
    (r, p, c) => {
      c.evidence[0].quote = "Originally published July 1"
    },
    (r, p, c) => {
      c.evidence[0].support = "context"
    },
    (r, p) => {
      p.dates.profile_status = "unmatched"
    },
  ]
  for (const mutate of mutations) {
    const r = structuredClone(review),
      p = structuredClone(s.p),
      claim = structuredClone(c)
    mutate(r, p, claim)
    assert.throws(() => eventDateMetadata(r, [claim], [p]), /Original publication/)
  }
  assert.throws(() => eventDateMetadata(review, [c], [s.p], []), /Original publication/)
  for (const bad of [
    "originally published July 1",
    "Updated July 5 (originally published July 1)",
    "Updated Aug. 5 (originally published December 1)",
  ]) {
    const r = structuredClone(review),
      p = structuredClone(s.p),
      claim = structuredClone(c)
    r.event_date_basis.notice_text = bad
    p.blocks[0] = { block_id: "p1:b1", text: bad, locator: { text_hash: sha256(bad) } }
    claim.evidence[0].quote = bad
    assert.throws(() => eventDateMetadata(r, [claim], [p]), /Original publication/)
  }
  const explicit = "Originally published July 1, 2025"
  const r = structuredClone(review),
    p = structuredClone(s.p),
    claim = structuredClone(c)
  r.event_date_basis.notice_text = explicit
  r.published_at = "2025-07-01"
  p.blocks[0] = { block_id: "p1:b1", text: explicit, locator: { text_hash: sha256(explicit) } }
  claim.evidence[0].quote = explicit
  assert.equal(eventDateMetadata(r, [claim], [p]).source_published_at, "2025-07-01")
})

test("dated update preserves source publication and requires the visible event's explicit date", () => {
  const s = fixture()
  const a = approvedArticle(s.record, s.claims, s.documents, s.review, [s.p])
  assert.equal(a.article_review.published_at, "2026-08-31")
  assert.equal(a.article_review.source_published_at, "2026-06-03")
  assert.equal(a.article_review.date_kind, "dated-update")
  assert.equal(s.claims[0].published_at, "2026-06-03")
  assert.equal(a.event_date_basis, undefined)
  const plain = structuredClone(s.review)
  delete plain.event_date_basis
  assert.throws(
    () => approvedArticle(s.record, s.claims, s.documents, plain, [s.p]),
    /supporting source date/,
  )
  plain.published_at = "2026-06-03"
  assert.deepEqual(eventDateMetadata(plain, s.claims, [s.p]), {})
})

test("source-stated event dates stay separate from unavailable page publication metadata", () => {
  const s = fixture()
  s.p.dates.published_at = null
  s.p.blocks = [
    {
      block_id: "p1:b1",
      text: "A direct integration was announced on 12 September during IBC.",
      locator: {
        text_hash: sha256("A direct integration was announced on 12 September during IBC."),
      },
    },
    {
      block_id: "p1:b2",
      text: "IBC2026 closed on Monday.",
      locator: { text_hash: sha256("IBC2026 closed on Monday.") },
    },
  ]
  const claim = {
    ...structuredClone(s.claims[0]),
    statement: "A direct integration was announced on 12 September during IBC.",
    published_at: null,
    effective_period: null,
    evidence: [
      {
        source_id: "s1",
        source_version_id: "s1:v1",
        parse_id: "p1",
        block_id: "p1:b1",
        quote: "A direct integration was announced on 12 September during IBC.",
        support: "direct",
      },
    ],
  }
  delete claim.review
  s.claims = recordFactReview(
    [claim],
    [
      {
        claim_id: "c1",
        status: "verified",
        reason: "Exact source date and event context checked",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      },
    ],
    { reviewer: "test", reviewed_at: "2026-09-27" },
    [s.p],
  )
  s.record.draft.lead = [
    { text: "Reuters는 9월 12일 IBC에서 직접 통합을 발표했다.", claim_ids: ["c1"] },
    { text: "이 행사는 IBC2026에서 소개됐다.", claim_ids: ["c1"] },
  ]
  s.record.draft_id = sha256(JSON.stringify(s.record.draft))
  s.review.draft_id = s.record.draft_id
  s.review.published_at = "2026-09-12"
  s.review.event_date_basis = {
    kind: "source-stated-event-date",
    source_id: "s1",
    source_version_id: "s1:v1",
    parse_id: "p1",
    block_id: "p1:b1",
    claim_id: "c1",
    date_text: "12 September",
    event_context_text: "during IBC",
    year_text: "IBC2026",
    year_context_block_id: "p1:b2",
  }
  const article = approvedArticle(s.record, s.claims, s.documents, s.review, [s.p])
  assert.equal(article.article_review.published_at, "2026-09-12")
  assert.equal(article.article_review.source_published_at, null)
  assert.equal(article.article_review.date_kind, "source-stated-event-date")
  const publicReview = articleReview(
    { meta: { article_reviews: [article.article_review] } },
    article.title,
    article.event_id,
  )
  const card = articleCard(
    {
      id: article.event_id,
      title: article.title,
      summary: article.record.lead,
      urls: article.source_urls,
      review: publicReview,
    },
    (path) => "/" + path,
  )
  assert.match(card, /발표 2026\.09\.12/)
  assert.equal(publicReview.source_published_at, null)

  const invalid = structuredClone(s.review)
  invalid.event_date_basis.year_text = "IBC2025"
  assert.throws(() => eventDateMetadata(invalid, s.claims, [s.p]), /Source-stated event date/)
  const falseYear = structuredClone(s.p)
  falseYear.blocks[1].text = "IBC2025 closed on Monday."
  assert.throws(
    () => eventDateMetadata(s.review, s.claims, [falseYear]),
    /Source-stated event date/,
  )
})

test("modification metadata, unrelated dates, missing quotes and unused event claims cannot establish an update", () => {
  const s = fixture()
  const mutations = [
    (r, p, c) => {
      p.dates.modified_profile_status = "not-configured"
    },
    (r, p, c) => {
      delete p.dates.modified_basis
    },
    (r, p, c) => {
      p.dates.modified_at = "2026-08-30"
    },
    (r, p, c) => {
      r.event_date_basis.date_text = "June 3, 2026"
    },
    (r, p, c) => {
      r.event_date_basis.source_published_at = "2026-06-04"
    },
    (r, p, c) => {
      c[0].effective_period = null
    },
    (r, p, c) => {
      c[0].evidence[0].quote = "worldwide"
    },
    (r, p, c) => {
      c[0].evidence[0].support = "partial"
    },
    (r, p, c) => {
      r.event_date_basis.block_id = "p1:other"
    },
  ]
  for (const mutate of mutations) {
    const r = structuredClone(s.review),
      p = structuredClone(s.p),
      c = structuredClone(s.claims)
    mutate(r, p, c)
    assert.throws(() => eventDateMetadata(r, c, [p]), /Dated update/)
  }
  assert.throws(() => eventDateMetadata(s.review, [], [s.p]), /Dated update/)
  assert.throws(() => eventDateMetadata(s.review, s.claims, [s.p], ["other"]), /Dated update/)
})

test("explicit civil dates do not accept ambiguous or impossible calendars", () => {
  assert.equal(civilDate("August 31, 2026"), "2026-08-31")
  assert.equal(civilDate("2026-08-31"), "2026-08-31")
  for (const value of [
    "September 31, 2026",
    "Aug 31, 2026",
    "08/31/26",
    "tomorrow",
    "2026-08-31T00:00:00Z",
    "February 29, 2026",
  ])
    assert.equal(civilDate(value), null)
})

function packet(article, entries) {
  return {
    schema_version: "retrospective-article-review/v1",
    event_id: article.event_id,
    reviewer: "test",
    reviewed_at: "2026-09-27",
    reason: "Missing historical event date reviewed against the primary source",
    source_read: true,
    date_change_checked: true,
    ancillary_copy_read: true,
    appearances: entries,
  }
}

test("missing retrospective dates require exact original bytes for every appearance; private decisions never enter the edition", (t) => {
  const vault = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "event-date-")))
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }))
  const s = fixture(),
    a = approvedArticle(s.record, s.claims, s.documents, s.review, [s.p])
  const entries = []
  for (const day of ["2026-09-01", "2026-09-02"]) {
    const projection = editionProjection([a], {
      key: `${day}_0800_Tech_AI_Briefing`,
      date: day,
      coverage_start: `${day}T00:00:00Z`,
      coverage_end: `${day}T01:00:00Z`,
    })
    const n = parseNote(projection.content)
    n.meta.article_reviews[0] = {
      title: a.title,
      event_id: a.event_id,
      review_status: "unreviewed",
      concept_ids: [],
    }
    n.body = n.body.replace("# 흐름 읽기\n\n없음", "# 흐름 읽기\n\n이전의 근거 없는 해석")
    const before = noteText(n.meta, n.body),
      file = path.join(vault, projection.path)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, before)
    entries.push({
      path: projection.path,
      sha256: sha256(before),
      before_content: before,
      previous_title: a.title,
      previous_published_at: null,
      sections: [
        {
          section: "흐름 읽기",
          content: "없음",
          reason: "Unsupported interpretation read and omitted",
        },
      ],
    })
  }
  assert.throws(() => retrospectiveProjections(vault, [a]), /original event publication date/)
  s.review.retrospective_review = packet(a, entries)
  const corrected = approvedArticle(s.record, s.claims, s.documents, s.review, [s.p])
  const outputs = retrospectiveProjections(vault, [corrected])
  assert.equal(outputs.length, 2)
  for (const output of outputs) {
    const parsed = parseNote(output.content),
      original = entries.find((e) => e.path === output.path)
    parsed.file = path.join(vault, output.path)
    assert.equal(extractArticles(parsed)[0].id, a.event_id)
    assert.equal(extractArticles(parsed)[0].review.published_at, "2026-08-31")
    assert.equal(parsed.meta.date, output.path.split("/").at(-1).slice(0, 10))
    for (const privateText of [
      "retrospective_review",
      "before_content",
      "Unsupported interpretation",
      "이전의 근거 없는 해석",
    ])
      assert.equal(output.content.includes(privateText), false)
    assert.equal(fs.readFileSync(path.join(vault, output.path), "utf8"), original.before_content)
  }
  const missing = structuredClone(corrected)
  missing.retrospective_review.appearances.pop()
  assert.throws(() => retrospectiveProjections(vault, [missing]), /current original appearance/)
  const surplus = structuredClone(corrected)
  surplus.retrospective_review.appearances.push({
    ...entries[0],
    path: "Editions/2026/09/2026-09-03_0800_Tech_AI_Briefing.md",
  })
  assert.throws(() => retrospectiveProjections(vault, [surplus]), /every original appearance/)
  const future = structuredClone(corrected)
  future.article_review.published_at = "2026-09-03"
  assert.throws(() => retrospectiveProjections(vault, [future]), /original edition day/)
  fs.appendFileSync(path.join(vault, entries[0].path), "\nOriginal changed\n")
  assert.throws(() => retrospectiveProjections(vault, [corrected]), /current original appearance/)
})

test("retrospective date approvals reject invalid originals and unrelated reviewer identity", () => {
  const s = fixture(),
    a = approvedArticle(s.record, s.claims, s.documents, s.review, [s.p])
  const original = "Original source edition\n"
  const p = packet(a, [
    {
      path: "Editions/2026/09/2026-09-01_0800_Tech_AI_Briefing.md",
      sha256: sha256(original),
      before_content: original,
      previous_title: "Original title",
      previous_published_at: null,
      sections: [],
    },
  ])
  assert.doesNotThrow(() => assertRetrospectiveReview(p, s.review))
  for (const mutate of [
    (p) => {
      p.reviewer = "unrelated"
    },
    (p) => {
      p.appearances[0].before_content += "changed"
    },
    (p) => {
      p.appearances[0].previous_published_at = "2026-09-31"
    },
    (p) => {
      p.appearances[0].sections = [{ section: "뉴스 데스크", content: "없음", reason: "Drop news" }]
    },
    (p) => {
      p.appearances[0].sections = [
        { section: "흐름 읽기", content: "New unreviewed claim", reason: "Insert prose" },
      ]
    },
  ]) {
    const next = structuredClone(p)
    mutate(next)
    assert.throws(() => assertRetrospectiveReview(next, s.review))
  }
})

test("reader metadata and cards distinguish updates without disclosing review notes", () => {
  const s = fixture(),
    a = approvedArticle(s.record, s.claims, s.documents, s.review, [s.p])
  const review = articleReview(
    { meta: { article_reviews: [{ ...a.article_review, private_notes: "secret" }] } },
    a.title,
    a.event_id,
  )
  assert.equal(review.date_kind, "dated-update")
  assert.equal(review.private_notes, undefined)
  const card = articleCard(
    { id: a.event_id, title: a.title, summary: a.record.lead, urls: a.source_urls, review },
    (p) => "/" + p,
  )
  assert.match(card, /업데이트 2026\.08\.31/)
  assert.doesNotMatch(card, /발표 2026\.08\.31/)
  const invalid = { ...a.article_review, source_published_at: "2026-09-31" }
  assert.throws(
    () => articleReview({ meta: { article_reviews: [invalid] } }, a.title, a.event_id),
    /Event date metadata/,
  )
})

function reportedFixture(
  published = "2026-10-07",
  dateText = "지난달 30일",
  occurred = "2026-09-30",
) {
  const s = fixture()
  const quote = `위원회는 ${dateText} 서울에서 자문회의를 열고 산업 분류를 검토했다.`
  s.p.dates = { published_at: published, profile_status: "matched", precision: "day" }
  s.p.blocks[0] = { ...s.p.blocks[0], text: quote, locator: { text_hash: sha256(quote) } }
  s.claims[0] = {
    ...s.claims[0],
    statement: "위원회는 자문회의를 열고 산업 분류를 검토했다.",
    published_at: published,
    event_state: "completed",
    effective_period: null,
    evidence: [{ ...s.claims[0].evidence[0], quote }],
  }
  s.claims = recordFactReview(
    s.claims,
    [
      {
        ...s.claims[0].review.checks,
        status: "verified",
        reason: "Reviewed meeting date and publication anchor",
      },
    ],
    { reviewer: "test", reviewed_at: "2026-10-09" },
    [s.p],
  )
  s.record.draft.lead = [
    { text: `위원회는 ${occurred} 서울에서 자문회의를 열었다.`, claim_ids: ["c1"] },
    { text: "회의에서는 산업 분류를 검토했다.", claim_ids: ["c1"] },
  ]
  s.record.draft.facts = {
    who: "위원회",
    when: occurred,
    where: "서울",
    what: "자문회의 개최",
    how: null,
    why: null,
  }
  s.record.draft_id = sha256(JSON.stringify(s.record.draft))
  s.review = {
    ...s.review,
    draft_id: s.record.draft_id,
    published_at: published,
    reviewed_at: "2026-10-09",
    event_date_basis: {
      kind: "source-reported-event-date",
      source_id: "s1",
      source_version_id: "s1:v1",
      parse_id: "p1",
      block_id: "p1:b1",
      claim_id: "c1",
      date_text: dateText,
      event_context_text: "자문회의",
      source_published_at: published,
      occurred_at: occurred,
    },
  }
  return s
}

test("reviewed Korean occurrence dates preserve article publication and reader identity", () => {
  const s = reportedFixture()
  const article = approvedArticle(s.record, s.claims, s.documents, s.review, [s.p])
  assert.equal(article.event_id, s.review.event_id)
  assert.equal(article.article_review.published_at, "2026-10-07")
  assert.equal(article.article_review.occurred_at, "2026-09-30")
  const review = articleReview(
    { meta: { article_reviews: [article.article_review] } },
    article.title,
  )
  assert.equal(review.occurred_at, "2026-09-30")
  const card = articleCard(
    {
      id: article.event_id,
      title: article.title,
      summary: article.record.lead,
      urls: article.source_urls,
      review,
    },
    (p) => "/" + p,
  )
  assert.match(card, /원문 게시 2026\.10\.07/)
  assert.doesNotMatch(card, /발표 2026\.10\.07/)
  for (const [pub, text, date] of [
    ["2026-01-07", "지난달 30일", "2025-12-30"],
    ["2026-10-05", "지난 9월 30일", "2026-09-30"],
    ["2026-10-05", "지난 10월 3일", "2026-10-03"],
    ["2024-03-02", "지난달 29일", "2024-02-29"],
  ]) {
    const sample = reportedFixture(pub, text, date)
    assert.equal(eventDateMetadata(sample.review, sample.claims, [sample.p]).occurred_at, date)
  }
})

test("occurrence dates reject unknown anchors, unrelated claims and impossible or future dates", () => {
  const mutations = [
    (s) => {
      s.review.event_date_basis.source_published_at = "2026-10-08"
    },
    (s) => {
      s.review.published_at = "2026-09-30"
    },
    (s) => {
      s.p.dates.profile_status = "not-configured"
    },
    (s) => {
      s.claims[0].event_state = "planned"
    },
    (s) => {
      s.claims[0].review.status = "unreviewed"
    },
    (s) => {
      s.review.event_date_basis.claim_id = "another-claim"
    },
    (s) => {
      s.review.event_date_basis.event_context_text = "다른 행사"
    },
    (s) => {
      s.p.blocks[0].locator.text_hash = "changed"
    },
    (s) => {
      s.claims[0].evidence[0].quote = "지난달 30일 자문회의에 없던 인용"
    },
  ]
  for (const mutate of mutations) {
    const s = reportedFixture()
    mutate(s)
    assert.throws(() => eventDateMetadata(s.review, s.claims, [s.p]), /Reported event date/)
  }
  for (const [pub, text, date] of [
    ["2026-03-02", "지난달 29일", "2026-02-29"],
    ["2026-10-05", "지난달 31일", "2026-09-31"],
    ["2026-10-05", "지난 10월 30일", "2026-10-30"],
    ["2026-10-05", "지난 8월 30일", "2026-08-30"],
    ["2026-10-05", "오는 10월 30일", "2026-10-30"],
  ]) {
    const s = reportedFixture(pub, text, date)
    assert.throws(() => eventDateMetadata(s.review, s.claims, [s.p]), /Reported event date/)
  }
  const s = reportedFixture()
  assert.throws(() => eventDateMetadata(s.review, s.claims, [s.p], []), /Reported event date/)
  const article = approvedArticle(s.record, s.claims, s.documents, s.review, [s.p])
  for (const patch of [
    { occurred_at: "2026-10-30" },
    { occurred_at: "2026-09-31" },
    { date_kind: "source-publication-time" },
    { source_published_at: "2026-10-08" },
  ])
    assert.throws(
      () =>
        articleReview(
          { meta: { article_reviews: [{ ...article.article_review, ...patch }] } },
          article.title,
        ),
      /Event date metadata/,
    )
})

test("JSON publication metadata dates a used body claim without generating a date-only fact", () => {
  const s = fixture(),
    timestamp = "2026-06-29T23:27:32Z"
  const header = {
    block_id: "p1:date",
    text: timestamp,
    locator: {
      type: "json",
      json_pointer: "/published_at",
      field_sha256: sha256(timestamp),
      text_hash: sha256(timestamp),
    },
  }
  const body = s.p.blocks[0]
  body.locator = {
    type: "json",
    json_pointer: "/body",
    field_sha256: sha256(body.text),
    text_hash: sha256(body.text),
  }
  s.p.blocks.unshift(header)
  s.p.parser = { id: "json-document" }
  s.p.dates = {
    published_at: timestamp,
    precision: "timestamp",
    profile_status: "matched",
    basis: {
      type: "json",
      json_pointer: "/published_at",
      text: timestamp,
      text_hash: sha256(timestamp),
    },
  }
  s.claims[0].published_at = timestamp
  s.review.published_at = "2026-06-30"
  s.review.event_date_basis = {
    kind: "source-publication-time",
    source_id: "s1",
    source_version_id: "s1:v1",
    parse_id: "p1",
    claim_id: "c1",
    source_published_at: timestamp,
    timezone: "Asia/Seoul",
  }
  assert.deepEqual(eventDateMetadata(s.review, s.claims, [s.p]), {
    date_kind: "source-publication-time",
    source_published_at: timestamp,
  })
  for (const mutate of [
    (p, c) => {
      p.blocks.shift()
    },
    (p, c) => {
      p.blocks[0].locator.record = { id: "other-release" }
    },
    (p, c) => {
      p.blocks[0].locator.field_sha256 = "0".repeat(64)
    },
    (p, c) => {
      p.dates.basis.json_pointer = "/updated_at"
    },
    (p, c) => {
      c[0].evidence[0].source_version_id = "s1:other-version"
    },
    (p, c) => {
      c[0].evidence[0].quote = "Unrelated evidence"
    },
    (p, c) => {
      c[0].published_at = "2026-06-30T23:27:32Z"
    },
  ]) {
    const p = structuredClone(s.p),
      c = structuredClone(s.claims)
    mutate(p, c)
    assert.throws(() => eventDateMetadata(s.review, c, [p]), /exact used source timestamp/)
  }
})

test("day-only source publication preserves exact civil dates without inferred timezone", () => {
  const s = fixture()
  s.p.dates.profile_status = "matched"
  s.p.dates.basis = { dom_path: "/main/div[1]", text: "[Submitted on 3 Jun 2026]" }
  s.review.published_at = "2026-06-03"
  s.review.event_date_basis = {
    kind: "source-publication-day",
    source_id: "s1",
    source_version_id: "s1:v1",
    parse_id: "p1",
    claim_id: "c1",
    source_published_at: "2026-06-03",
  }
  assert.deepEqual(eventDateMetadata(s.review, s.claims, [s.p]), {
    date_kind: "source-publication-day",
    source_published_at: "2026-06-03",
  })
  const published = {
    title: "date-only",
    event_id: "1234567890abcdef",
    review_status: "verified",
    published_at: "2026-06-03",
    reviewed_at: "2026-09-27",
    concept_ids: [],
    ...eventDateMetadata(s.review, s.claims, [s.p]),
  }
  assert.equal(
    articleReview({ meta: { article_reviews: [published] } }, "date-only").source_published_at,
    "2026-06-03",
  )
  for (const mutate of [
    (x) => (x.review.event_date_basis.source_published_at = "2026-06-04"),
    (x) => (x.review.event_date_basis.source_published_at = "2026-06-03T00:00:00Z"),
    (x) => (x.review.event_date_basis.timezone = "Asia/Seoul"),
    (x) => (x.p.dates.profile_status = "not-configured"),
    (x) => (x.p.dates.basis.text = ""),
    (x) => (x.claims[0].published_at = "2026-06-04"),
    (x) => (x.claims[0].evidence[0].source_version_id = "wrong-version"),
    (x) => (x.review.event_date_basis.claim_id = "not-used"),
  ]) {
    const changed = structuredClone(s)
    mutate(changed)
    assert.throws(() => eventDateMetadata(changed.review, changed.claims, [changed.p]))
  }
})

test("stored JSON-LD compact offsets and matching publication time elements retain one instant", () => {
  const s = fixture()
  const timestamp = "2026-06-24T09:00:48-04:00"
  s.p.parser = { id: "trafilatura" }
  s.p.dates = {
    published_at: timestamp,
    precision: "timestamp",
    profile_status: "matched",
    basis: {
      sources: [
        {
          type: "json-ld",
          script_index: 0,
          node_type: ["NewsArticle"],
          attribute: "datePublished",
          text: "2026-06-24T09:00:48-0400",
        },
        {
          type: "time-itemprop",
          dom_path: "/html/body/main/header/p/time",
          attribute: "datetime",
          text: "2026-06-24T13:00:48Z",
        },
      ],
    },
  }
  s.claims[0].published_at = timestamp
  s.review.published_at = "2026-06-24"
  s.review.event_date_basis = {
    kind: "source-publication-time",
    source_id: "s1",
    source_version_id: "s1:v1",
    parse_id: "p1",
    claim_id: "c1",
    source_published_at: timestamp,
    timezone: "Asia/Seoul",
  }
  assert.equal(eventDateMetadata(s.review, s.claims, [s.p]).source_published_at, timestamp)
  for (const mutate of [
    (p) => (p.dates.basis.sources[0].text = "2026-06-24T09:00:48-0500"),
    (p) => (p.dates.basis.sources[0].attribute = "dateModified"),
    (p) => (p.dates.basis.sources[1].text = "2026-06-24T13:00:49Z"),
    (p) => (p.dates.basis.sources[1].attribute = "dateModified"),
    (p) => (p.dates.basis.sources[1].dom_path = "/html/body/footer/div"),
    (p) => p.dates.basis.sources.shift(),
  ]) {
    const p = structuredClone(s.p)
    mutate(p)
    assert.throws(() => eventDateMetadata(s.review, s.claims, [p]), /exact used source timestamp/)
  }
})

test("day-only Markdown publication requires its exact source line and block hashes", () => {
  const s = fixture()
  const text = "June 3, 2026"
  const locator = {
    type: "markdown",
    line_start: 3,
    line_end: 3,
    text_hash: sha256(text),
    source_text_hash: sha256(text + "\n"),
  }
  s.p.blocks.push({ block_id: "date-header", kind: "paragraph", text, locator })
  s.p.dates.profile_status = "matched"
  s.p.dates.basis = { ...locator, text }
  s.review.published_at = "2026-06-03"
  s.review.event_date_basis = {
    kind: "source-publication-day",
    source_id: "s1",
    source_version_id: "s1:v1",
    parse_id: "p1",
    claim_id: "c1",
    source_published_at: "2026-06-03",
  }
  assert.equal(eventDateMetadata(s.review, s.claims, [s.p]).source_published_at, "2026-06-03")
  for (const mutate of [
    (p) => (p.dates.basis.line_start = 2),
    (p) => (p.dates.basis.line_end = 4),
    (p) => (p.dates.basis.text_hash = "0".repeat(64)),
    (p) => (p.dates.basis.source_text_hash = "0".repeat(64)),
    (p) => (p.blocks.at(-1).text = "June 4, 2026"),
    (p) => p.blocks.pop(),
  ]) {
    const p = structuredClone(s.p)
    mutate(p)
    assert.throws(() => eventDateMetadata(s.review, s.claims, [p]), /exact used source date/)
  }
})
