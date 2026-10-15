import test from "node:test"
import assert from "node:assert/strict"
import { parseNote, extractArticles, sourceMap } from "../scripts/garden.mjs"
import {
  existingArticleProjection,
  editionProjection,
} from "../scripts/research/publish-adapter.mjs"

test("classified partial retrospective retains every preserved sibling source marker when a prior source retires", () => {
  const rows = [
    ["기존 승인 기사", "a", [1, 2, 3, 4, 5, 6, 7, 8, 9]],
    ["저장할 배터리 기사", "b", [10]],
    ["저장할 시범사업 기사", "c", [11]],
    ["저장할 추가 기사", "d", [12, 13]],
    ["저장할 연구 협업 기사", "e", [14, 15, 16]],
  ]
  const record = (title, lead) => ({
    title,
    kind: "사건 뉴스",
    region: "해외",
    lead,
    facts: {
      who: "연구진",
      when: "2026-09-22",
      where: "공개 자료",
      what: "연구 결과 공개",
      how: "연구 수행",
      why: "결과 확인",
    },
    papers: [],
    relations: [],
    topic_ids: [],
    explanations: [],
  })
  const classification =
    "**분야:** AI\n**테마:** 연구·기술\n**보조 테마:** 없음\n**세부 태그:** 새로운 방법\n**기업·기관:** 연구진"
  const existing = {
    file: "vault/Editions/2026/09/2026-09-23_0800_Tech_AI_Briefing.md",
    meta: {
      title: "2026-09-23 브리핑",
      type: "briefing",
      schema_version: "tech-ai-magazine/v2",
      date: "2026-09-23",
      coverage_start: "2026-09-22T08:00:00+09:00",
      coverage_end: "2026-09-23T08:00:00+09:00",
      editorial_format: "six-w/v1",
      briefing_format: "sector-five/v1",
      theme_format: "news-themes/v1",
      headlines: rows.map(([title]) => title),
      article_records: rows.map(([title]) => record(title, `${title}의 원문 내용을 설명한다.`)),
      article_reviews: rows.map(([title, id]) => ({
        title,
        event_id: id.repeat(16),
        review_status: "verified",
        published_at: "2026-09-22",
        reviewed_at: "2026-09-24",
        concept_ids: [],
      })),
    },
    body:
      "# 뉴스 데스크\n\n" +
      rows
        .map(
          ([title, , markers]) =>
            `## ${title}\n\n${classification}\n\n${title}의 원문 내용을 설명한다. ${markers.map((number) => `[S${number}]`).join(" ")}`,
        )
        .join("\n\n") +
      "\n\n# Source List\n\n" +
      Array.from(
        { length: 16 },
        (_, index) => `- [S${index + 1}] https://example.org/source-${index + 1}`,
      ).join("\n"),
  }
  const original = extractArticles(existing),
    siblings = original.slice(1),
    nativeTitle = "재검토한 승인 기사"
  const replacement = {
    event_id: original[0].id,
    title: nativeTitle,
    source_urls: original[0].urls.slice(0, 8), // S9 retires; later articles keep S10 through S16.
    sector: "AI",
    theme: "연구·기술",
    tags: ["새로운 방법"],
    entities: ["연구진"],
    record: record(nativeTitle, "재검토한 승인 기사에 새 원문 내용을 반영했다."),
    article_review: {
      ...existing.meta.article_reviews[0],
      title: nativeTitle,
      reviewed_at: "2026-10-10",
    },
  }
  const projected = editionProjection([replacement, ...siblings.map(existingArticleProjection)], {
    key: "2026-09-23_0800_Tech_AI_Briefing",
    date: existing.meta.date,
    coverage_start: existing.meta.coverage_start,
    coverage_end: existing.meta.coverage_end,
    existing,
  })
  const issue = { ...parseNote(projected.content), file: projected.path },
    after = extractArticles(issue)
  for (const field of ["editorial_format", "briefing_format", "theme_format"])
    assert.equal(issue.meta[field], existing.meta[field])
  for (const prior of siblings) {
    const current = after.find((article) => article.id === prior.id)
    assert.equal(current.body, prior.body)
    assert.deepEqual(current.markers, prior.markers)
    assert.deepEqual(current.sources, prior.sources)
    assert.deepEqual(current.urls, prior.urls)
    assert.deepEqual(current.review, prior.review)
    assert.deepEqual(current.editorial, prior.editorial)
    assert.deepEqual(current.classification, prior.classification)
  }
  assert.equal(sourceMap(issue.body).has("S9"), false)
  assert.equal(sourceMap(issue.body).get("S10"), sourceMap(existing.body).get("S10"))
  assert.equal(sourceMap(issue.body).get("S11"), sourceMap(existing.body).get("S11"))
  assert.equal(sourceMap(issue.body).get("S16"), sourceMap(existing.body).get("S16"))
  assert.equal(issue.meta.source_marker_format, "preserved-retrospective/v1")
  assert.equal(after.find((article) => article.id === replacement.event_id).title, nativeTitle)
})
