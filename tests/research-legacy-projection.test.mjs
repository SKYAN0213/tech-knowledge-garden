import test from "node:test"
import assert from "node:assert/strict"
import { parseNote, extractArticles } from "../scripts/garden.mjs"
import {
  existingArticleProjection,
  editionProjection,
} from "../scripts/research/publish-adapter.mjs"
import { editorialContext, requireEditorial } from "../scripts/editorial.mjs"
import { digestMarkdown, feedDescription } from "../scripts/briefings.mjs"

function fixture() {
  const meta = {
    title: "과거 브리핑",
    schema_version: "tech-ai-magazine/v2",
    date: "2026-08-28",
    coverage_start: "2026-08-27T08:00:00+09:00",
    coverage_end: "2026-08-28T08:00:00+09:00",
    article_reviews: [
      {
        title: "기존 첫 기사",
        event_id: "1111111111111111",
        review_status: "unreviewed",
        concept_ids: [],
      },
      {
        title: "미검토 둘째 기사",
        event_id: "2222222222222222",
        review_status: "unreviewed",
        concept_ids: [],
      },
    ],
  }
  const body =
    "# 커버 스토리\n\n## 기존 첫 기사\n\n이전 요약이다. [S1]\n\n### 무엇이 바뀌었나\n\n이전 설명이다.\n\n# 리서치 노트\n\n## 미검토 둘째 기사\n\n**논문:** 원 제목\n\n원문을 아직 재검토하지 않은 본문이다. [S2]\n\n**개념:** [[Knowledge/AI Systems/Agent Evaluation]]\n\n# 흐름 읽기\n\n없음\n\n# 오늘의 적용\n\n없음\n\n# 개념 색인\n\n없음\n\n# Source List\n\n- [S1] https://example.org/report.pdf\n- [S2] https://example.org/other.pdf\n"
  return { meta, body, file: "vault/Editions/2026/08/2026-08-28_0800_Tech_AI_Briefing.md" }
}
function approved(a, title = "원문을 확인한 첫 기사") {
  const lead = "연구기관은 8월 27일 평가 방법을 발표했다. 비공개 문제로 시범 평가를 수행했다."
  return {
    event_id: a.id,
    title,
    source_urls: [a.urls[0], "https://example.org/announcement"],
    sector: "AI",
    theme: "연구·기술",
    tags: ["새로운 방법"],
    entities: ["연구기관"],
    record: {
      title,
      kind: "사건 뉴스",
      region: "해외",
      lead,
      facts: {
        who: "연구기관",
        when: "2026-08-27",
        where: "미기재",
        what: "평가 연구",
        how: "비공개 문제",
        why: "미기재",
      },
      papers: [],
      relations: [],
      topic_ids: [],
      explanations: [
        {
          heading: "평가 방법",
          paragraphs: ["두 참여자가 실행 코드를 승인한다."],
          source_urls: [a.urls[0]],
        },
      ],
    },
    article_review: {
      title,
      event_id: a.id,
      review_status: "verified",
      published_at: "2026-08-27",
      reviewed_at: "2026-09-27",
      concept_ids: [],
    },
  }
}
function project(issue, replacements) {
  return editionProjection(replacements, {
    existing: issue,
    key: "2026-08-28_0800_Tech_AI_Briefing",
    date: issue.meta.date,
    coverage_start: issue.meta.coverage_start,
    coverage_end: issue.meta.coverage_end,
  })
}
test("partial historical conversion preserves unreviewed prose, IDs, dates and source markers", () => {
  const issue = fixture(),
    before = structuredClone(issue),
    old = extractArticles(issue)
  const projection = project(issue, [approved(old[0]), existingArticleProjection(old[1])])
  const next = { ...parseNote(projection.content), file: issue.file },
    articles = extractArticles(next)
  assert.deepEqual(issue, before)
  assert.equal(next.meta.editorial_format, undefined)
  assert.equal(next.meta.theme_format, undefined)
  assert.equal(next.meta.briefing_format, undefined)
  assert.equal(next.meta.article_records.length, 1)
  assert.equal(next.meta.source_count, 3)
  assert.equal(next.meta.coverage_start, issue.meta.coverage_start)
  assert.equal(next.meta.coverage_end, issue.meta.coverage_end)
  const reviewed = articles.find((a) => a.id === old[0].id),
    untouched = articles.find((a) => a.id === old[1].id)
  assert.equal(reviewed.editorial.lead, approved(old[0]).record.lead)
  assert.equal(reviewed.classification.theme, "연구·기술")
  assert.equal(reviewed.review.published_at, "2026-08-27")
  assert.equal(untouched.body, old[1].body)
  assert.deepEqual(untouched.review, old[1].review)
  assert.deepEqual(untouched.urls, old[1].urls)
  assert.deepEqual(untouched.concepts, old[1].concepts)
  assert.equal(untouched.classification, undefined)
  assert.equal(untouched.editorial, undefined)
  assert.equal(untouched.sector, undefined)
  const context = editorialContext([{ date: next.meta.date, original: next, items: articles }])
  assert.equal(context.article_evidence.length, 1)
  assert.equal(context.article_evidence[0].event_id, old[0].id)
  assert.deepEqual(context.recent_deep, [])
})
test("all reviewed legacy events switch to the complete six-w and classification contract", () => {
  const issue = fixture(),
    old = extractArticles(issue)
  const p = project(
    issue,
    old.map((a, n) => approved(a, "검토 기사 " + n)),
  )
  const next = { ...parseNote(p.content), file: issue.file }
  assert.equal(next.meta.editorial_format, "six-w/v1")
  assert.equal(next.meta.theme_format, "news-themes/v1")
  assert.equal(next.meta.briefing_format, "sector-five/v1")
  assert.equal(extractArticles(next).length, 2)
})
function modernFixture() {
  const legacy = fixture()
  const source = project(
    legacy,
    extractArticles(legacy).map((a, n) => approved(a, "검토 기사 " + n)),
  )
  const issue = { ...parseNote(source.content), file: legacy.file }
  const first = issue.meta.article_records[0]
  first.kind = "기업 전략"
  first.topic_ids = ["company-research-strategy"]
  first.analysis_summary = "공식 발표에 명시된 투자 배분을 비교했다."
  first.next_check = "후속 실적 발표의 집행액"
  issue.body = issue.body
    .replace("# 뉴스 데스크", "# 커버 스토리")
    .replace(
      "### 평가 방법",
      "추가로 확인한 계약 조건이다. [S2]\n\n분석: 공식 발표에 명시된 투자 배분을 비교했다. [S1]\n\n### 평가 방법",
    )
  return issue
}
test("modern preservation retains deep analysis, extra prose, desk and citation targets during replacement", () => {
  const issue = modernFixture()
  const old = extractArticles(issue)
  const next = {
    ...parseNote(
      project(issue, [existingArticleProjection(old[0]), approved(old[1], "새로 검토한 둘째 기사")])
        .content,
    ),
    file: issue.file,
  }
  const retained = extractArticles(next).find((a) => a.id === old[0].id)
  assert.equal(retained.desk, old[0].desk)
  assert.deepEqual(retained.urls, old[0].urls)
  assert.deepEqual(retained.review, old[0].review)
  assert.deepEqual(retained.editorial, old[0].editorial)
  assert.deepEqual(retained.classification, old[0].classification)
  // Markers can change when a sibling is replaced; their URL targets cannot.
  const withoutMarkers = (body) => body.replace(/\[S\d+\]/g, "[SOURCE]")
  assert.equal(withoutMarkers(retained.body), withoutMarkers(old[0].body))
  assert(retained.body.includes("추가로 확인한 계약 조건"))
  assert(retained.body.includes("분석:"))
})
test("modern preservation rejects modified prose, record, review, classification, concept and desk", () => {
  const issue = modernFixture()
  const old = extractArticles(issue)
  for (const mutate of [
    (a) => (a.preserved.body += "\n추가 주장"),
    (a) => (a.preserved.desk = "뉴스 데스크"),
    (a) => (a.record.analysis_summary = "다른 판단"),
    (a) => (a.article_review.reviewed_at = "2026-10-07"),
    (a) => a.source_urls.push("https://example.org/unreviewed"),
    (a) => a.tags.push("미검토 태그"),
    (a) => a.concept_paths.push("Knowledge/Unreviewed"),
  ]) {
    const preserved = existingArticleProjection(old[0])
    mutate(preserved)
    assert.throws(() => project(issue, [preserved, existingArticleProjection(old[1])]), /preserv/i)
  }
})
test("approved numeric ranges render as literal prose without Markdown strikethrough", () => {
  const issue = fixture(),
    old = extractArticles(issue),
    first = approved(old[0])
  first.record.lead = "비교 결과는 1.5~1.9배였다."
  first.record.explanations[0].paragraphs = ["지연은 1.7~3.6배로 보고됐다."]
  const projection = project(issue, [first, existingArticleProjection(old[1])])
  const next = { ...parseNote(projection.content), file: issue.file }
  assert(next.body.includes("1.5\\~1.9배"))
  assert(next.body.includes("1.7\\~3.6배"))
  assert.equal(extractArticles(next)[0].editorial.lead, first.record.lead)
  assert.equal(
    next.meta.article_records[0].explanations[0].paragraphs[0],
    "지연은 1.7~3.6배로 보고됐다.",
  )
  const items = extractArticles(next)
  const digest = digestMarkdown(
    {
      date: next.meta.date,
      lead: "연구 발표",
      key: "Editions/2026/08/2026-08-28_0800_Tech_AI_Briefing",
      original: next,
      items,
      analysis: "",
      snapshot: { review: null },
    },
    "https://example.org/garden",
  )
  assert(digest.includes("1.5\\~1.9배"))
  assert(digest.includes("1.7\\~3.6배"))
})

test("numeric issue references with Korean particles remain literal prose across publication channels", () => {
  const issue = fixture()
  const old = extractArticles(issue)
  const first = approved(old[0])
  first.record.lead = "기관은 8월 27일 PR #32672를 병합했다. 리뷰 동작을 복구했다."
  first.record.explanations[0].paragraphs = ["PR #32672는 정책과 테스트를 함께 복구했다."]
  const projection = project(issue, [first, existingArticleProjection(old[1])])
  const next = { ...parseNote(projection.content), file: issue.file }
  const items = extractArticles(next)
  assert(next.body.includes("PR \\#32672는"))
  assert.equal(items[0].editorial.lead, first.record.lead)
  assert.deepEqual(
    items[0].editorial.explanations[0].paragraphs,
    first.record.explanations[0].paragraphs,
  )
  const value = {
    date: next.meta.date,
    key: "Editions/2026/08/2026-08-28_0800_Tech_AI_Briefing",
    original: next,
    items,
    lead: first.record.lead,
    analysis: "",
    snapshot: { review: null },
  }
  assert(digestMarkdown(value, "https://example.org/garden").includes("PR \\#32672는"))
  assert(feedDescription(value, "https://example.org/garden").includes("PR #32672는"))
})
test("partial source replacement removes obsolete sources without renumbering untouched citations", () => {
  const issue = fixture(),
    old = extractArticles(issue),
    replacement = approved(old[0])
  replacement.source_urls = ["https://example.org/reviewed-v1"]
  replacement.record.explanations[0].source_urls = [...replacement.source_urls]
  const next = parseNote(project(issue, [replacement, existingArticleProjection(old[1])]).content)
  assert.equal(next.meta.source_count, 2)
  assert.equal(next.meta.source_marker_format, "preserved-retrospective/v1")
  assert(!next.body.includes("https://example.org/report.pdf"))
  assert(next.body.includes("- [S2] https://example.org/other.pdf"))
  assert(next.body.includes("- [S3] https://example.org/reviewed-v1"))
  assert.equal(extractArticles({ ...next, file: issue.file })[1].body, old[1].body)
})
test("partial source replacement preserves sources still cited by retained cumulative sections", () => {
  const issue = fixture()
  issue.body = issue.body.replace(
    "# 흐름 읽기\n\n없음",
    "# 흐름 읽기\n\n기존 자료의 기록이다. [S1]",
  )
  const old = extractArticles(issue),
    replacement = approved(old[0])
  replacement.source_urls = ["https://example.org/reviewed-v1"]
  replacement.record.explanations[0].source_urls = [...replacement.source_urls]
  const next = parseNote(project(issue, [replacement, existingArticleProjection(old[1])]).content)
  assert.equal(next.meta.source_count, 3)
  assert(next.body.includes("기존 자료의 기록이다. [S1]"))
  assert(next.body.includes("- [S1] https://example.org/report.pdf"))
  assert(next.body.includes("- [S2] https://example.org/other.pdf"))
})
test("mixed historical RSS and GitHub retain approved details, dates and original links", () => {
  const issue = fixture(),
    old = extractArticles(issue),
    p = project(issue, [approved(old[0]), existingArticleProjection(old[1])])
  const next = { ...parseNote(p.content), file: issue.file },
    items = extractArticles(next)
  const i = {
    date: next.meta.date,
    lead: "연구 발표",
    key: "Editions/2026/08/2026-08-28_0800_Tech_AI_Briefing",
    original: next,
    items,
    analysis: "",
    snapshot: { review: null },
  }
  for (const content of [
    digestMarkdown(i, "https://example.org/garden"),
    feedDescription(i, "https://example.org/garden"),
  ]) {
    assert(content.includes(approved(old[0]).record.lead))
    assert(content.includes("두 참여자가 실행 코드를 승인한다."))
    assert(content.includes("2026-08-27"))
    assert(content.includes("https://example.org/report.pdf"))
    assert(content.includes("https://example.org/other.pdf"))
    assert(content.includes("1111111111111111"))
    assert(content.includes("2222222222222222"))
  }
})
test("historical preservation rejects altered body, sources, review, title and desk", () => {
  for (const mutate of [
    (p) => (p.legacy.body += "추가 주장"),
    (p) => p.source_urls.push("https://example.org/invented"),
    (p) => (p.article_review.review_status = "verified"),
    (p) => (p.title = "임의 수정"),
    (p) => (p.legacy.desk = "뉴스 데스크"),
  ]) {
    const issue = fixture(),
      old = extractArticles(issue),
      preserved = existingArticleProjection(old[1])
    mutate(preserved)
    assert.throws(() => project(issue, [approved(old[0]), preserved]), /preserv/i)
  }
})
test("partial records cannot approve unreviewed articles or accept missing and duplicate records", () => {
  const issue = fixture(),
    old = extractArticles(issue),
    p = project(issue, [approved(old[0]), existingArticleProjection(old[1])])
  for (const mutate of [
    (n) =>
      (n.meta.article_reviews.find((r) => r.event_id === old[0].id).review_status = "unreviewed"),
    (n) => (n.meta.article_records[0].title = "없는 기사"),
    (n) => n.meta.article_records.push(structuredClone(n.meta.article_records[0])),
    (n) => delete n.meta.article_records[0].facts.why,
    (n) => (n.meta.article_records[0].explanations[0].paragraphs[0] = "출처 본문에 없는 문장"),
  ]) {
    const next = { ...parseNote(p.content), file: issue.file }
    mutate(next)
    assert.throws(() => extractArticles(next), /Editorial/)
  }
})
test("new editions cannot use a partial historical format", () => {
  const issue = fixture(),
    old = extractArticles(issue),
    p = project(issue, [approved(old[0]), existingArticleProjection(old[1])])
  const next = { ...parseNote(p.content), file: issue.file }
  next.meta.date = "2026-09-14"
  assert.throws(() => requireEditorial(next), /six-w/)
  delete next.meta.article_records
  const a = old[1]
  a.edition.meta.date = "2026-09-14"
  assert.throws(() => existingArticleProjection(a), /historical/i)
})
