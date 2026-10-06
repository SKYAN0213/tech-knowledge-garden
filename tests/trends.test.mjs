import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import RSSParser from "rss-parser"
import { fromHtml } from "hast-util-from-html"
import { visit } from "unist-util-visit"
import { loadTrends, trendSnapshot, currentTrendSnapshot } from "../scripts/trends.mjs"
import { noteText, editions, extractArticles, feeds } from "../scripts/garden.mjs"
import {
  briefingLibrary,
  topicMarkdown,
  topicAsOf,
  feedDescription,
  githubIssue,
  digestPath,
  githubMarkdown,
} from "../scripts/briefings.mjs"
import { newsView, briefingHub } from "../scripts/reader-views.mjs"
const fixture = (t) => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "trend-test-"))
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }))
  const put = (p, meta) => {
    fs.mkdirSync(path.dirname(path.join(vault, p)), { recursive: true })
    fs.writeFileSync(path.join(vault, p), noteText(meta, "Review"))
  }
  const item = (id) => ({ id, title: id, summary: id, urls: ["https://example.org/" + id] })
  const issues = [
    { key: "Editions/2026-09-01", date: "2026-09-01", items: [item("event-a")] },
    { key: "Editions/2026-09-08", date: "2026-09-08", items: [item("event-a"), item("event-b")] },
    { key: "Editions/2026-09-09_0800", date: "2026-09-09", items: [item("event-c")] },
    { key: "Editions/2026-09-09_1600", date: "2026-09-09", items: [item("event-d")] },
  ]
  const topic = {
    schema_version: "tech-trend/v1",
    id: "systems",
    title: "운영 변화",
    question: "무엇이 달라졌나?",
    thesis: "LATER THESIS",
    watch_for: "다음 운영 결과",
    disconfirming: "운영 결과 악화",
    reviewed: "2026-09-09",
    knowledge_notes: [],
    lessons: [],
  }
  const signal = (id, event_id, stance = "support") => ({
    id,
    event_id,
    topic_id: "systems",
    stance,
    change: "관측 " + id,
    meaning: "의미 " + id,
    limit: "제공 범위 한정",
    next_check: "독립 재현",
  })
  const reviews = issues.map((i, j) => ({
    schema_version: "tech-signals/v1",
    edition: i.key,
    date: i.date,
    reviewed: "2026-09-09",
    review_basis: "saved-coverage",
    observations: [signal("s" + j, i.items.at(-1).id, j === 2 ? "challenge" : "support")],
  }))
  const save = () => {
    put("TrendTopics/systems.md", topic)
    reviews.forEach((r, j) => put("Signals/" + j + ".md", r))
  }
  save()
  return { vault, put, issues, topic, reviews, save, signal }
}
test("Repeated source coverage does not inflate unique-event totals or move old events into a new window", (t) => {
  const f = fixture(t)
  f.reviews[1].observations.push(f.signal("repeat-a", "event-a"))
  f.save()
  const snap = trendSnapshot(loadTrends(f.vault, f.issues), f.issues[2].key).topics[0]
  assert.equal(snap.events, 3)
  assert.equal(snap.recent, 2)
  assert.equal(snap.previous, 1)
  assert.equal(snap.history.length, 4)
})
test("Earlier issues, including morning snapshots, exclude later events and lessons", (t) => {
  const f = fixture(t)
  f.topic.lessons = [
    {
      id: "lesson",
      claim: "LATER LESSON",
      limit: "範囲",
      reviewed: "2026-09-09",
      signal_ids: ["s0", "s2"],
    },
  ]
  f.save()
  const data = loadTrends(f.vault, f.issues)
  const early = trendSnapshot(data, f.issues[1].key).topics[0]
  assert.equal(early.events, 2)
  assert.equal(early.lessons.length, 0)
  assert.doesNotMatch(
    topicMarkdown(early, "2026-09-08"),
    /LATER THESIS|LATER LESSON|event-c|event-d/,
  )
  assert.equal(trendSnapshot(data, f.issues[2].key).topics[0].events, 3)
  assert.equal(trendSnapshot(data, f.issues[3].key).topics[0].events, 4)
})
test("current knowledge re-review does not change historical edition judgments", (t) => {
  const f = fixture(t)
  f.topic.reviewed = "2026-09-27"
  f.topic.thesis = "NEW SOURCE-REVIEWED CURRENT JUDGMENT"
  f.save()
  const data = loadTrends(f.vault, f.issues)
  const old = trendSnapshot(data, f.issues[1].key)
  assert.doesNotMatch(topicMarkdown(old.topics[0], old.date), /NEW SOURCE-REVIEWED/)
  const current = currentTrendSnapshot(data)
  assert.equal(current.date, "2026-09-27")
  assert.match(topicMarkdown(current.topics[0], current.date), /NEW SOURCE-REVIEWED/)
  assert.equal(current.topics[0].events, trendSnapshot(data, f.issues.at(-1).key).topics[0].events)
})
test("re-reviewing one topic does not advance an unrelated topic page date", (t) => {
  const f = fixture(t)
  f.topic.reviewed = "2026-09-27"
  f.put("TrendTopics/unchanged.md", { ...f.topic, id: "unchanged", reviewed: "2026-09-09" })
  f.reviews[0].observations.push({ ...f.signal("untouched", "event-a"), topic_id: "unchanged" })
  f.save()
  const current = currentTrendSnapshot(loadTrends(f.vault, f.issues))
  assert.equal(current.date, "2026-09-27")
  assert.equal(
    topicAsOf(
      current.topics.find((t) => t.id === "systems"),
      f.issues.at(-1).date,
    ),
    "2026-09-27",
  )
  assert.equal(
    topicAsOf(
      current.topics.find((t) => t.id === "unchanged"),
      f.issues.at(-1).date,
    ),
    "2026-09-09",
  )
})
test("briefing hub shows current reviewed topic text while retaining the latest edition date", (t) => {
  const f = fixture(t)
  f.topic.reviewed = "2026-09-27"
  f.topic.reader_format = "source-events/v1"
  f.topic.thesis = "CURRENT REVIEWED SOURCE SUMMARY"
  f.save()
  const data = loadTrends(f.vault, f.issues)
  const latest = {
    ...f.issues.at(-1),
    snapshot: trendSnapshot(data, f.issues.at(-1).key),
    original: { meta: {} },
    lead: "Latest briefing",
  }
  const current = currentTrendSnapshot(data)
  const html = briefingHub(
    { latest, issues: [latest], current },
    (p) => "/" + p,
    "https://example.org",
  )
  assert.match(html, /CURRENT REVIEWED SOURCE SUMMARY/)
  assert.match(html, /09-27 갱신/)
  assert.match(html, /datetime="2026-09-09"/)
  assert.equal(latest.snapshot.date, "2026-09-09")
  assert.doesNotMatch(html, /0개 판단 원칙/)
})
test("source-event topic pages show reviewed events once and hide private follow-up and empty sections", () => {
  const article = {
    title: "Verified article",
    summary: "Actual source fact: 1.5~1.9.",
    urls: ["https://example.org/original"],
    review: { review_status: "verified", published_at: "2026-09-21" },
  }
  const signal = {
    id: "same-event",
    event_id: "abc",
    issue: "Editions/2026/09/2026-09-22_0800_Tech_AI_Briefing",
    article,
    order: 1,
    meaning: "PRIVATE INTERPRETATION",
    limit: "PRIVATE LIMIT",
    next_check: "PRIVATE NEXT",
  }
  const topic = {
    id: "topic",
    reader_format: "source-events/v1",
    reviewed: "2026-09-27",
    thesis: "Reviewed factual summary.",
    knowledge_notes: [],
    latest: signal,
    history: [
      signal,
      { ...signal, order: 2 },
      {
        ...signal,
        event_id: "unchecked",
        article: { ...article, review: { review_status: "unreviewed" } },
      },
    ],
  }
  const output = topicMarkdown(topic, "2026-09-27")
  assert.equal(output.match(/Actual source fact:/g).length, 1)
  assert.match(output, /1\.5\\~1\.9/)
  assert.match(output, /2026-09-21/)
  assert.match(output, /https:\/\/example.org\/original/)
  assert.doesNotMatch(output, /PRIVATE|다음 확인|재사용할 원칙|관련 개념|확인하는 중/)
})
test("Missing review is unknown; an explicit empty review is a reviewed zero", (t) => {
  const f = fixture(t)
  fs.unlinkSync(path.join(f.vault, "Signals/3.md"))
  assert.throws(() => loadTrends(f.vault, f.issues), /latest issue needs/)
  const missing = trendSnapshot(
    loadTrends(f.vault, f.issues, { requireLatest: false }),
    f.issues.at(-1).key,
  )
  assert.equal(missing.review, null)
  assert.equal(missing.coverage.reviewed, 2)
  f.reviews[3].observations = []
  f.save()
  const empty = trendSnapshot(loadTrends(f.vault, f.issues), f.issues.at(-1).key)
  assert.ok(empty.review)
  assert.equal(empty.today.length, 0)
  assert.equal(empty.coverage.reviewed, 3)
})
test("Observations require an actual source event in that exact issue", (t) => {
  const f = fixture(t)
  f.reviews[0].observations[0].event_id = "event-d"
  f.save()
  assert.throws(() => loadTrends(f.vault, f.issues), /source event/)
})
test("Repeated observation IDs and same-issue event-topic duplicates are rejected", (t) => {
  const f = fixture(t)
  f.reviews[0].observations.push(f.signal("new-id", "event-a"))
  f.save()
  assert.throws(() => loadTrends(f.vault, f.issues), /duplicate observation/)
  f.reviews[0].observations.pop()
  f.reviews[1].observations[0].id = "s0"
  f.save()
  assert.throws(() => loadTrends(f.vault, f.issues), /duplicate observation/)
})
test("Lessons need multiple distinct events and dates, belonging to the topic and reviewed first", (t) => {
  const f = fixture(t)
  f.topic.lessons = [
    {
      id: "lesson",
      claim: "Claim",
      limit: "Limit",
      reviewed: "2026-09-09",
      signal_ids: ["s2", "s3"],
    },
  ]
  f.save()
  assert.throws(() => loadTrends(f.vault, f.issues), /two distinct events and dates/)
  f.topic.lessons[0].signal_ids = ["s0", "s2"]
  f.save()
  assert.equal(loadTrends(f.vault, f.issues).topics[0].lessons.length, 1)
  f.topic.lessons[0].reviewed = "2026-09-08"
  f.save()
  assert.throws(() => loadTrends(f.vault, f.issues), /reviewed evidence/)
})
test("Retrospective provenance and opposing evidence survive the public topic projection", (t) => {
  const f = fixture(t)
  const topic = trendSnapshot(loadTrends(f.vault, f.issues), f.issues.at(-1).key).topics[0]
  const md = topicMarkdown(topic, "2026-09-09")
  assert.match(md, /기존 수록 기사 재정리/)
  assert.match(md, /2026-09-09 검토/)
  assert.match(md, /반대·제약/)
  assert.match(md, /https:\/\/example.org\/event-c/)
})
test("Review dates and topic IDs cannot silently widen the source contract", (t) => {
  const f = fixture(t)
  f.reviews[0].reviewed = "2026-02-30"
  f.save()
  assert.throws(() => loadTrends(f.vault, f.issues), /provenance/)
  f.reviews[0].reviewed = "2026-09-09"
  f.reviews[0].observations[0].topic_id = "general-keyword"
  f.save()
  assert.throws(() => loadTrends(f.vault, f.issues), /source event/)
})
test("Real daily RSS retains stable permalinks and carries originals, reviewed changes and GitHub summaries", async () => {
  const all = editions("vault"),
    lib = briefingLibrary("vault", all, new Map(all.map((i) => [i.slug, extractArticles(i)])))
  const feed = await new RSSParser().parseString(fs.readFileSync("vault/briefing.xml", "utf8"))
  assert.equal(feed.items[0].guid, feed.items[0].link)
  assert.ok(
    feed.items[0].guid.endsWith(
      "/" + lib.latest.key.replace(/^Editions\//, "Briefings/").toLowerCase(),
    ),
  )
  assert.ok(feed.items[0].content.includes(githubIssue(lib.latest.key)))
  const sourceHrefs = new Set()
  visit(fromHtml(feed.items[0].content, { fragment: true }), "element", (node) => {
    if (node.tagName === "a") sourceHrefs.add(node.properties.href)
  })
  for (const a of lib.latest.items)
    for (const url of a.urls) assert.ok(sourceHrefs.has(url), `Missing original href: ${url}`)
  if (lib.latest.original.meta.article_reviews) {
    assert.doesNotMatch(feed.items[0].content, /다음 확인|트렌드 기록 미정리|수록 없음/)
    for (const a of lib.latest.items) assert.ok(feed.items[0].content.includes(a.summary))
  } else if (lib.latest.snapshot.today.length) assert.match(feed.items[0].content, /다음 확인/)
  assert.ok(lib.latest.snapshot.topics.length > 0)
  for (const issue of lib.issues)
    assert.doesNotMatch(fs.readFileSync(digestPath(issue.key), "utf8"), /\[\[/)
})
test("RSS original query parameters survive safe HTML escaping as exact navigable hrefs", () => {
  const original = "https://example.org/news/?mode=V&mng_no=67870&GotoPage=1"
  const html = feedDescription(
    {
      key: "Editions/2026/10/2026-10-07_0800_Tech_AI_Briefing",
      lead: "Test",
      snapshot: { review: null },
      items: [
        {
          id: "source-event",
          title: "Source announcement",
          summary: "Reviewed facts",
          urls: [original],
        },
      ],
    },
    "https://example.org",
  )
  assert.ok(html.includes("mode=V&amp;mng_no=67870&amp;GotoPage=1"))
  const hrefs = []
  visit(fromHtml(html, { fragment: true }), "element", (node) => {
    if (node.tagName === "a") hrefs.push(node.properties.href)
  })
  assert.equal(hrefs.filter((href) => href === original).length, 1)
  assert.equal(hrefs.includes(original.replaceAll("&", "&amp;")), false)
})
test("Feed summaries escape editorial HTML rather than executing it in readers", () => {
  const i = {
    key: "Editions/test",
    lead: "<script>bad()</script>",
    items: [],
    snapshot: { review: null },
  }
  assert.doesNotMatch(feedDescription(i, "https://example.org"), /<script>/)
  assert.match(feedDescription(i, "https://example.org"), /&lt;script&gt;/)
})
test("News view shows readable summaries and original links with no graph widget", () => {
  const a = {
    id: "a",
    title: "Headline",
    summary: "Summary",
    desk: "News",
    urls: ["https://openai.com/example"],
    edition: { meta: { date: "2026-09-13" } },
  }
  const html = newsView([a], { key: "Editions/test", date: "2026-09-13" }, (p) => "/" + p)
  assert.doesNotMatch(html, /data-connections|home-map|canvas/)
  assert.match(html, /Summary/)
  assert.match(html, /OpenAI/)
  assert.match(html, /https:\/\/openai.com\/example/)
})

test("GitHub exports retain fact and analysis labels from Obsidian callouts", () => {
  const md = githubMarkdown(
    "> [!note] Facts\n> Fact.\n\n> [!abstract] Analysis\n> Inference.",
    "https://example.org",
  )
  assert.match(md, /> \*\*Facts\*\*/)
  assert.match(md, /> \*\*Analysis\*\*/)
  assert.doesNotMatch(md, /\[!/)
})
