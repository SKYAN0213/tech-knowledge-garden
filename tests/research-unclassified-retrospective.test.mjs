import test from "node:test"
import assert from "node:assert/strict"
import { parseNote, extractArticles, sourceMap } from "../scripts/garden.mjs"
import {
  existingArticleProjection,
  editionProjection,
} from "../scripts/research/publish-adapter.mjs"

const record = (title, lead) => ({
  title,
  kind: "사건 뉴스",
  region: "해외",
  lead,
  facts: {
    who: "연구진",
    when: "2026-09-07",
    where: "공개 자료",
    what: "연구 결과 공개",
    how: "연구 수행",
    why: "성능 확인",
  },
  papers: [],
  relations: [],
  topic_ids: [],
  explanations: [],
})

test("partial six-w retrospective preserves an unclassified sibling, format absence and exact source markers", () => {
  for (const status of ["verified", "unreviewed"]) {
    const oldTitle = "기존 발표",
      siblingTitle = "기존 연구 결과",
      newTitle = "검토한 새 발표",
      siblingLead = "기존 원문에 기록된 연구 결과를 설명한다.",
      existing = {
        file: "vault/Editions/2026/09/2026-09-08_0801_Tech_AI_Briefing.md",
        meta: {
          title: "2026-09-08 브리핑",
          type: "briefing",
          schema_version: "tech-ai-magazine/v2",
          date: "2026-09-08",
          coverage_start: "2026-09-07T08:01:13+09:00",
          coverage_end: "2026-09-08T08:01:15+09:00",
          editorial_format: "six-w/v1",
          headlines: [oldTitle, siblingTitle],
          article_records: [
            record(oldTitle, "기존 발표 내용을 설명한다."),
            record(siblingTitle, siblingLead),
          ],
          article_reviews: [
            {
              title: oldTitle,
              event_id: "a".repeat(16),
              review_status: "verified",
              published_at: "2026-09-07",
              reviewed_at: "2026-09-20",
              concept_ids: [],
            },
            {
              title: siblingTitle,
              event_id: "b".repeat(16),
              review_status: status,
              published_at: "2026-09-07",
              reviewed_at: "2026-09-20",
              concept_ids: [],
            },
          ],
        },
        body: `# 커버 스토리\n\n## ${oldTitle}\n\n기존 발표 내용을 설명한다. [S1]\n\n# 뉴스 데스크\n\n## ${siblingTitle}\n\n${siblingLead} [S2]\n\n# Source List\n\n- [S1] https://example.org/old-source\n- [S2] https://www.nature.com/articles/retained-source`,
      }
    const sibling = extractArticles(existing).find((article) => article.title === siblingTitle)
    assert.equal(Object.hasOwn(sibling, "classification"), false)
    const preserved = existingArticleProjection(sibling)
    const replacement = {
      event_id: "a".repeat(16),
      title: newTitle,
      source_urls: ["https://example.org/new-reviewed-source"],
      sector: "AI",
      theme: "연구·기술",
      tags: ["새로운 방법"],
      entities: ["연구진"],
      record: record(newTitle, "새 원문을 확인한 발표 내용을 설명한다."),
      article_review: {
        title: newTitle,
        event_id: "a".repeat(16),
        review_status: "verified",
        published_at: "2026-09-07",
        reviewed_at: "2026-10-10",
        concept_ids: [],
      },
    }
    const options = {
      key: "2026-09-08_0801_Tech_AI_Briefing",
      date: existing.meta.date,
      coverage_start: existing.meta.coverage_start,
      coverage_end: existing.meta.coverage_end,
      existing,
    }
    const projection = editionProjection([replacement, preserved], options)
    const projected = { ...parseNote(projection.content), file: projection.path }
    assert.equal(projected.meta.editorial_format, existing.meta.editorial_format)
    assert.equal(Object.hasOwn(projected.meta, "briefing_format"), false)
    assert.equal(Object.hasOwn(projected.meta, "theme_format"), false)
    const articles = extractArticles(projected),
      after = articles.find((article) => article.id === sibling.id),
      updated = articles.find((article) => article.id === replacement.event_id)
    assert.equal(after.body, sibling.body)
    assert.equal(after.title, sibling.title)
    assert.equal(after.desk, sibling.desk)
    assert.deepEqual(after.editorial, sibling.editorial)
    assert.deepEqual(after.review, sibling.review)
    assert.deepEqual(after.urls, sibling.urls)
    assert.deepEqual(after.markers, ["S2"])
    assert.equal(Object.hasOwn(after, "classification"), false)
    assert.equal(Object.hasOwn(preserved, "theme"), false)
    assert.equal(Object.hasOwn(preserved, "tags"), false)
    assert.equal(updated.classification.theme, replacement.theme)
    assert.deepEqual(updated.classification.event_tags, replacement.tags)
    assert.deepEqual(updated.markers, ["S3"])
    assert.deepEqual([...sourceMap(projected.body).keys()], ["S2", "S3"])
    assert.equal(projected.meta.source_marker_format, "preserved-retrospective/v1")
    for (const tamper of [
      { title: "임의 변경" },
      { source_urls: ["https://example.org/changed-sibling-source"] },
      { article_review: { ...preserved.article_review, reviewed_at: "2026-10-10" } },
      { record: { ...preserved.record, lead: "수정한 기존 원고." } },
      { theme: "연구·기술", tags: ["새로운 방법"] },
      { preserved: { ...preserved.preserved, body: "수정한 기존 본문. [S2]" } },
    ])
      assert.throws(
        () => editionProjection([replacement, { ...preserved, ...tamper }], options),
        /retain exact prose, metadata, sources and desk/,
      )
  }
})
