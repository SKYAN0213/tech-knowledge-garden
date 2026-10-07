import test from "node:test"
import assert from "node:assert/strict"
import { sectorGroups, sectorMarkdown } from "../scripts/sectors.mjs"
import { digestMarkdown, feedDescription } from "../scripts/briefings.mjs"
import { issueView, newsView } from "../scripts/reader-views.mjs"

function fixture() {
  const original = {
    meta: {
      date: "2026-07-10",
      briefing_format: "sector-five/v1",
      briefing_group_format: "related-events/v1",
      article_reviews: [],
      briefing_groups: [],
    },
    body: "",
  }
  const items = Array.from({ length: 11 }, (_, n) => ({
    id: (n + 1).toString(16).padStart(16, "0"),
    title: `검토 기사 ${n}`,
    sector: "소프트웨어·클라우드",
    summary: `발표 사실 ${n}. 조건과 일정 ${n}.`,
    urls: [`https://example.org/announcement/${n}`],
    edition: original,
    review: { review_status: "verified", published_at: "2026-07-09" },
    editorial: {
      kind: "사건 뉴스",
      explanations: [
        {
          heading: `설명 ${n}`,
          paragraphs: [`구체적인 원문 조건 ${n}.`],
          source_urls: [`https://example.org/announcement/${n}`],
        },
      ],
    },
  }))
  original.meta.briefing_groups = [
    {
      id: "client-releases",
      title: "앱·IDE 업데이트",
      sector: items[0].sector,
      event_ids: items.slice(0, 4).map((a) => a.id),
    },
    {
      id: "enterprise-settings",
      title: "기업 관리 설정",
      sector: items[0].sector,
      event_ids: items.slice(4, 6).map((a) => a.id),
    },
    {
      id: "mobile-releases",
      title: "모바일 작업",
      sector: items[0].sector,
      event_ids: items.slice(6, 8).map((a) => a.id),
    },
    {
      id: "tool-releases",
      title: "도구 릴리스",
      sector: items[0].sector,
      event_ids: items.slice(8, 10).map((a) => a.id),
    },
  ]
  return {
    original,
    items,
    date: "2026-07-10",
    key: "Editions/2026/07/2026-07-10_0802_Tech_AI_Briefing",
    lead: "원문 사건",
    snapshot: { review: null },
    analysis: "",
  }
}

test("explicit groups cap briefing entries while retaining all distinct detailed events", () => {
  const i = fixture(),
    before = structuredClone(i)
  const g = sectorGroups(i.original, i.items).find((g) => g.items.length)
  assert.equal(g.items.length, 11)
  assert.equal(g.entries.length, 5)
  assert.deepEqual(
    g.entries.flatMap((e) => e.items.map((a) => a.id)),
    i.items.map((a) => a.id),
  )
  assert.deepEqual(i, before)
  const md = sectorMarkdown(
    i.original,
    i.items,
    (a, { level }) => `${"#".repeat(level)} ${a.title}`,
  )
  assert.match(md, /소프트웨어·클라우드 · 5건/)
  assert.match(md, /#### 앱·IDE 업데이트\n\n##### 검토 기사 0/)
  assert.equal((md.match(/검토 기사 \d+/g) || []).length, 11)
})

test("groups cannot bypass identity, review, sector, entry quota or forty-article bounds", () => {
  for (const change of [
    (i) => delete i.original.meta.briefing_group_format,
    (i) => delete i.original.meta.briefing_format,
    (i) => (i.original.meta.briefing_groups = []),
    (i) => delete i.original.meta.briefing_groups[0].id,
    (i) => (i.original.meta.briefing_groups[0].id = i.original.meta.briefing_groups[1].id),
    (i) => i.original.meta.briefing_groups[0].event_ids.push(i.items[4].id),
    (i) => i.original.meta.briefing_groups[0].event_ids.push("ffffffffffffffff"),
    (i) => (i.original.meta.briefing_groups[0].title = "<script>"),
    (i) => (i.original.meta.briefing_groups[0].reason = "private"),
    (i) => (i.items[0].review.review_status = "unreviewed"),
    (i) => (i.items[0].sector = "AI"),
    (i) => i.items.push({ ...i.items[10] }),
    (i) => i.original.meta.briefing_groups.pop(),
  ]) {
    const i = fixture()
    change(i)
    assert.throws(() => sectorGroups(i.original, i.items))
  }
  const i = fixture()
  delete i.original.meta.briefing_group_format
  delete i.original.meta.briefing_groups
  assert.throws(() => sectorGroups(i.original, i.items), /More than five/)
  const large = fixture()
  large.items.push(...Array(30).fill(large.items[0]))
  assert.throws(() => sectorGroups(large.original, large.items), /forty/)
})

test("web briefing, RSS and GitHub retain every grouped lead, condition, source and detail link", () => {
  const i = fixture(),
    href = (p) => "/" + p,
    base = "https://example.org/garden"
  const web = issueView(i, href, base, "")
  const rss = feedDescription(i, base),
    md = digestMarkdown(i, base)
  for (const a of i.items) {
    for (const output of [web, rss, md]) {
      assert.ok(output.includes(a.summary))
      assert.ok(output.includes(a.urls[0]))
      assert.ok(output.includes(a.id))
      assert.ok(output.includes(a.editorial.explanations[0].paragraphs[0]))
    }
  }
  assert.equal((web.match(/data-news-row/g) || []).length, 11)
  assert.match(rss, /소프트웨어·클라우드 · 5건/)
  assert.match(web, /data-news-day><h2>앱·IDE 업데이트/)
  assert.match(web, /class="briefing-group" data-news-day><h2>앱·IDE 업데이트/)
  assert.equal(web.includes('class="news-day" data-news-day><h2>앱·IDE 업데이트'), false)
  const news = newsView(i.items, i, href)
  assert.equal(news.includes("앱·IDE 업데이트"), false)
  assert.equal((news.match(/data-news-row/g) || []).length, 11)
  assert.equal(web.includes("data-connections"), false)
})
