import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { parseNote, noteText, extractArticles, sourceMap } from "../scripts/garden.mjs"
import {
  existingArticleProjection,
  editionProjection,
} from "../scripts/research/publish-adapter.mjs"

const repo = fileURLToPath(new URL("../", import.meta.url))
const validator = path.join(repo, "scripts/validate_encyclopedia.py")
const classification =
  "**분야:** AI\n**테마:** 연구·기술\n**보조 테마:** 없음\n**세부 태그:** 새로운 방법\n**기업·기관:** 연구진"
const record = (title) => ({
  title,
  kind: "사건 뉴스",
  region: "해외",
  lead: `${title}의 원문 결과를 공개했다.`,
  facts: {
    who: "연구진",
    when: "2026-09-10",
    where: "공식 발표",
    what: "연구 결과 공개",
    how: "연구 수행",
    why: "결과 확인",
  },
  papers: [],
  relations: [],
  topic_ids: [],
  explanations: [],
})

function fixture(date = "2026-09-23") {
  const rows = [
    ["교체할 승인 기사", "a", [1, 2]],
    ["분류와 검토를 보존할 형제 기사", "b", [3]],
  ]
  const existing = {
    file: `vault/Editions/2026/09/${date}_0800_Tech_AI_Briefing.md`,
    meta: {
      title: `${date} 테스트 브리핑`,
      type: "briefing",
      schema_version: "tech-ai-magazine/v2",
      date,
      coverage_start: `${date}T00:00:00+09:00`,
      coverage_end: `${date}T08:00:00+09:00`,
      editorial_format: "six-w/v1",
      briefing_format: "sector-five/v1",
      theme_format: "news-themes/v1",
      headlines: rows.map(([title]) => title),
      article_records: rows.map(([title]) => record(title)),
      article_reviews: rows.map(([title, id]) => ({
        title,
        event_id: id.repeat(16),
        review_status: "verified",
        published_at: "2026-09-10",
        reviewed_at: "2026-10-11",
        concept_ids: [],
      })),
    },
    body:
      "# 뉴스 데스크\n\n" +
      rows
        .map(
          ([title, , markers]) =>
            `## ${title}\n\n${classification}\n\n${record(title).lead} ${markers.map((id) => `[S${id}]`).join(" ")}`,
        )
        .join("\n\n") +
      "\n\n# Source List\n\n" +
      [1, 2, 3].map((id) => `- [S${id}] https://example.org/source-${id}`).join("\n"),
  }
  const [prior, sibling] = extractArticles(existing)
  const replacement = {
    event_id: prior.id,
    title: prior.title,
    source_urls: prior.urls.slice(0, 1),
    sector: "AI",
    theme: "연구·기술",
    tags: ["새로운 방법"],
    entities: ["연구진"],
    record: record(prior.title),
    article_review: { title: prior.title, ...prior.review },
  }
  const preserved = existingArticleProjection(sibling)
  const options = {
    key: `${date}_0800_Tech_AI_Briefing`,
    date,
    coverage_start: existing.meta.coverage_start,
    coverage_end: existing.meta.coverage_end,
    existing,
  }
  const projected = editionProjection([replacement, preserved], options)
  return { existing, sibling, replacement, preserved, options, projected }
}

function validate(content) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "classified-source-marker-"))
  try {
    const file = path.join(root, "fixture.md")
    fs.writeFileSync(file, content)
    const result = spawnSync("python3", [validator, "--vault-root", root, "--briefing", file], {
      cwd: repo,
      encoding: "utf8",
    })
    assert.ifError(result.error)
    return { status: result.status, output: result.stdout + result.stderr }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

function rewrite(content, change) {
  const issue = parseNote(content)
  change(issue)
  return noteText(issue.meta, issue.body)
}

test("Python accepts exact classified sibling preservation for all three blocked dates", () => {
  for (const date of ["2026-09-11", "2026-09-20", "2026-09-23"]) {
    const { existing, sibling, projected } = fixture(date)
    const issue = { file: projected.path, ...parseNote(projected.content) }
    const current = extractArticles(issue).find((article) => article.id === sibling.id)
    assert.equal(current.body, sibling.body)
    assert.deepEqual(current.review, sibling.review)
    assert.deepEqual(current.editorial, sibling.editorial)
    assert.deepEqual(current.classification, sibling.classification)
    assert.deepEqual(current.sources, sibling.sources)
    assert.deepEqual(current.markers, ["S3"])
    assert.equal(sourceMap(issue.body).get("S3"), sourceMap(existing.body).get("S3"))
    assert.equal(sourceMap(issue.body).has("S2"), false)
    assert.equal(issue.meta.source_marker_format, "preserved-retrospective/v1")
    const result = validate(projected.content)
    assert.equal(result.status, 0, `${date}: ${result.output}`)
  }
})

test("classified sparse citations require the exact explicit preservation marker", () => {
  const { projected } = fixture()
  for (const value of [undefined, "preserved-retrospective/v2"]) {
    const result = validate(
      rewrite(projected.content, (issue) => {
        if (value === undefined) delete issue.meta.source_marker_format
        else issue.meta.source_marker_format = value
      }),
    )
    assert.notEqual(result.status, 0)
    assert.match(result.output, /source IDs must be consecutive from S1/)
  }
})

test("classified preservation requires complete matching reviews and supported format flags", () => {
  const { projected } = fixture()
  const invalid = [
    (meta) => delete meta.editorial_format,
    (meta) => delete meta.briefing_format,
    (meta) => delete meta.theme_format,
    (meta) => (meta.editorial_format = "six-w/v2"),
    (meta) => (meta.date = "2026-02-30"),
    (meta) => (meta.article_records = []),
    (meta) => (meta.article_reviews = []),
    (meta) => (meta.article_records[1].title = "다른 기사"),
    (meta) => (meta.article_reviews[1].title = meta.article_reviews[0].title),
    (meta) => (meta.article_reviews[1].event_id = meta.article_reviews[0].event_id),
    (meta) => (meta.article_reviews[1].event_id = "unverified-event"),
    (meta) => (meta.article_reviews[1].review_status = "unreviewed"),
    (meta) => delete meta.article_reviews[1].published_at,
    (meta) => (meta.article_reviews[1].reviewed_at = "2026-09-09"),
  ]
  for (const [index, change] of invalid.entries()) {
    const result = validate(rewrite(projected.content, (issue) => change(issue.meta)))
    assert.notEqual(result.status, 0, `invalid metadata ${index}: ${result.output}`)
    assert.match(result.output, /preserved source markers require a partial historical review/)
  }
})

test("classified marker permission retains citation and Source List integrity failures", () => {
  const { projected } = fixture()
  const cases = [
    [
      (issue) => (issue.body = issue.body.replace(/\[S3\]/g, "[S0]")),
      /preserved source IDs must be unique, positive and ordered/,
    ],
    [
      (issue) =>
        (issue.body = issue.body.replace(
          "- [S1] https://example.org/source-1\n- [S3] https://example.org/source-3",
          "- [S3] https://example.org/source-3\n- [S1] https://example.org/source-1",
        )),
      /preserved source IDs must be unique, positive and ordered/,
    ],
    [
      (issue) =>
        (issue.body = issue.body.replace(
          "- [S3] https://example.org/source-3",
          "- [S1] https://example.org/source-3",
        )),
      /preserved source IDs must be unique, positive and ordered/,
    ],
    [
      (issue) =>
        (issue.body = issue.body.replace(
          "- [S3] https://example.org/source-3",
          "- [S3] https://example.org/source-1",
        )),
      /Source List contains duplicate URLs/,
    ],
    [(issue) => (issue.meta.source_count = 3), /source_count does not match Source List entries/],
    [
      (issue) => (issue.body = issue.body.replace("[S3]", "[S4]")),
      /undefined source markers: \[4\]/,
    ],
  ]
  for (const [change, error] of cases) {
    const result = validate(rewrite(projected.content, change))
    assert.notEqual(result.status, 0)
    assert.match(result.output, error)
  }
  const unused = validate(
    rewrite(projected.content, (issue) => {
      issue.meta.source_count += 1
      issue.body += "\n- [S4] https://example.org/source-4\n"
    }),
  )
  assert.notEqual(unused.status, 0)
  assert.match(unused.output, /unused Source List entries: \[4\]/)
})

test("projection still rejects changed preserved prose, sources and classification", () => {
  const { replacement, preserved, options } = fixture()
  for (const change of [
    (article) => (article.preserved.body += " 근거 없는 내용."),
    (article) => (article.source_urls = ["https://example.org/unreviewed"]),
    (article) => (article.theme = "기업 운영"),
  ]) {
    const changed = structuredClone(preserved)
    change(changed)
    assert.throws(
      () => editionProjection([replacement, changed], options),
      /Article preservation must retain exact prose, metadata, sources and desk/,
    )
  }
})
