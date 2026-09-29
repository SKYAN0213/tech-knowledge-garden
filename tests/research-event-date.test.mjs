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
import { articleReview } from "../scripts/article-review.mjs"
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
    /Dated update/,
  )
})
