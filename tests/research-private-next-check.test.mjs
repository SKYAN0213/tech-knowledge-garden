import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { extractArticles, parseNote } from "../scripts/garden.mjs"
import { editorialMeta } from "../scripts/editorial.mjs"
import { assertSchema } from "../scripts/research/contracts.mjs"
import { schemaForDraft } from "../scripts/research/editor.mjs"
import {
  editionProjection,
  existingArticleProjection,
} from "../scripts/research/publish-adapter.mjs"

// Fictional authoring fixtures only; no native approvals or research gold.
const ids = ["a".repeat(16), "b".repeat(16)]
const privateText = "  PRIVATE_FOLLOWUP_42\u00a0확인\r\n다음 줄\n  "
function fixture({
  key = "2026-09-08_0801_Tech_AI_Briefing",
  checks = [privateText, "PRIVATE_SIBLING_87"],
} = {}) {
  const records = ["기존 발표", "기존 연구"].map((title, i) => ({
    title,
    kind: "사건 뉴스",
    region: "해외",
    lead: `연구진은 공개 자료에서 ${i + 1}번 연구 결과를 설명했다.`,
    facts: {
      who: "연구진",
      when: "2026-09-07",
      where: "공개 자료",
      what: "연구 발표",
      how: "연구 수행",
      why: "미기재",
    },
    papers: [],
    relations: [],
    topic_ids: [],
    explanations: [],
    ...(checks[i] !== undefined ? { next_check: checks[i] } : {}),
  }))
  const existing = {
    file: `vault/Editions/2026/09/${key}.md`,
    meta: {
      title: "합성 브리핑",
      type: "briefing",
      schema_version: "tech-ai-magazine/v2",
      date: "2026-09-08",
      timezone: "Asia/Seoul",
      coverage_start: "2026-09-07T08:01:00+09:00",
      coverage_end: "2026-09-08T08:01:00+09:00",
      editorial_format: "six-w/v1",
      briefing_format: "sector-five/v1",
      theme_format: "news-themes/v1",
      headlines: records.map((r) => r.title),
      new_items_count: 2,
      source_count: 2,
      article_records: records,
      article_reviews: records.map((r, i) => ({
        title: r.title,
        event_id: ids[i],
        review_status: "verified",
        published_at: "2026-09-07",
        reviewed_at: "2026-09-20",
        concept_ids: [],
      })),
    },
    body:
      "# 뉴스 데스크\n\n" +
      records
        .map(
          (r, i) =>
            `## ${r.title}\n\n**분야:** AI\n**테마:** 연구·기술\n**보조 테마:** 없음\n**세부 태그:** 새로운 방법\n**기업·기관:** 연구진\n\n${r.lead} [S${i + 1}]`,
        )
        .join("\n\n") +
      "\n\n# Source List\n\n- [S1] https://example.org/study-a\n- [S2] https://example.org/study-b\n",
  }
  return {
    existing,
    options: {
      key,
      date: existing.meta.date,
      coverage_start: existing.meta.coverage_start,
      coverage_end: existing.meta.coverage_end,
      existing,
    },
    articles: extractArticles(existing),
  }
}
function modified(article) {
  const result = existingArticleProjection(article)
  delete result.preserved
  delete result.record.next_check
  result.title += " 재검토"
  result.record.title = result.title
  result.article_review.title = result.title
  result.record.lead = "재검토한 원문에서 공개된 연구 조건을 설명한다."
  return result
}
const project = (articles, options) => {
  const result = editionProjection(articles, options)
  return { ...result, issue: { file: result.path, ...parseNote(result.content) } }
}
const recordFor = (projection, id) =>
  extractArticles(projection.issue).find((a) => a.id === id).editorial

test("partial retrospective preserves exact next_check by event across a title change and retains its sibling", () => {
  for (const value of [privateText, ""]) {
    const f = fixture({ checks: [value, "PRIVATE_SIBLING_87"] })
    const changed = modified(f.articles[0]),
      sibling = existingArticleProjection(f.articles[1])
    const before = structuredClone({ changed, sibling, existing: f.existing })
    const result = project([sibling, changed], f.options)
    assert.equal(Object.hasOwn(recordFor(result, ids[0]), "next_check"), true)
    assert.equal(recordFor(result, ids[0]).next_check, value)
    assert.equal(recordFor(result, ids[0]).lead, changed.record.lead)
    assert.deepEqual(recordFor(result, ids[1]), f.articles[1].editorial)
    assert.deepEqual({ changed, sibling, existing: f.existing }, before)
  }
})

test("a full replacement of an existing edition preserves each article's own private next_check", () => {
  const f = fixture(),
    result = project(f.articles.map(modified), f.options)
  ids.forEach((id, i) =>
    assert.equal(recordFor(result, id).next_check, f.articles[i].editorial.next_check),
  )
})

test("the same replacement reused across editions inherits only each edition's own value and absence", () => {
  const first = fixture(),
    second = fixture({
      key: "2026-09-08_0901_Tech_AI_Briefing",
      checks: ["PRIVATE_OTHER_EDITION_21", undefined],
    })
  const changed = modified(first.articles[0]),
    sibling = existingArticleProjection(first.articles[1])
  const one = project([changed, sibling], first.options)
  assert.equal(recordFor(one, ids[0]).next_check, privateText)
  const two = project([changed, modified(second.articles[1])], second.options)
  assert.equal(recordFor(two, ids[0]).next_check, "PRIVATE_OTHER_EDITION_21")
  assert.equal(Object.hasOwn(recordFor(two, ids[1]), "next_check"), false)
  assert.equal(Object.hasOwn(changed.record, "next_check"), false)
})

test("another event's private next_check and stale public analysis are not borrowed", () => {
  const f = fixture({ checks: [undefined, "PRIVATE_SIBLING_87"] })
  const result = project(
    [modified(f.articles[0]), existingArticleProjection(f.articles[1])],
    f.options,
  )
  assert.equal(Object.hasOwn(recordFor(result, ids[0]), "next_check"), false)
  const withCheck = fixture()
  withCheck.existing.meta.article_records[0].analysis_summary = "이전 공개 분석"
  // The private carry is narrow; the new record controls public fields.
  const changed = modified(withCheck.articles[0])
  delete changed.record.analysis_summary
  const projected = project(
    [changed, existingArticleProjection(withCheck.articles[1])],
    withCheck.options,
  )
  assert.equal(Object.hasOwn(recordFor(projected, ids[0]), "analysis_summary"), false)
})

test("private next_check cannot be borrowed from an existing edition with a different target path", () => {
  const f = fixture()
  assert.throws(
    () =>
      project(f.articles.map(modified), { ...f.options, key: "2026-09-08_0901_Tech_AI_Briefing" }),
    /next_check.*edition|edition.*next_check/i,
  )
})

test("an injected private replacement value cannot override or borrow another event's next_check", () => {
  for (const checks of [
    [privateText, "PRIVATE_SIBLING_87"],
    [undefined, "PRIVATE_SIBLING_87"],
  ]) {
    const f = fixture({ checks }),
      changed = modified(f.articles[0])
    changed.record.next_check = "PRIVATE_SIBLING_87"
    assert.throws(
      () => project([changed, existingArticleProjection(f.articles[1])], f.options),
      /next_check/i,
    )
  }
})

test("a new edition without a source appearance does not gain old private metadata", () => {
  const f = fixture(),
    { existing, ...options } = f.options
  const result = project(f.articles.map(modified), options)
  ids.forEach((id) => assert.equal(Object.hasOwn(recordFor(result, id), "next_check"), false))
})

test("private next_check survives authoring serialization but stays out of generated News frontmatter and body", (t) => {
  const f = fixture(),
    result = project([modified(f.articles[0]), existingArticleProjection(f.articles[1])], f.options)
  assert.equal(recordFor(result, ids[0]).next_check, privateText)
  for (const a of extractArticles(result.issue))
    assert.equal(Object.hasOwn(editorialMeta(a), "next_check"), false)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "private-next-check-")),
    vault = path.join(root, "vault")
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = path.join(vault, result.path)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, result.content)
  fs.writeFileSync(
    path.join(root, "quartz.config.yaml"),
    "configuration:\n  baseUrl: example.org\n",
  )
  // refresh also emits project-relative digest/catalog files. Keep its cwd
  // inside this fixture, in addition to isolating the vault and TMPDIR.
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { refresh } from ${JSON.stringify(new URL("../scripts/garden.mjs", import.meta.url).href)}; refresh(process.argv[1])`,
      vault,
    ],
    { cwd: root, stdio: "pipe" },
  )
  for (const id of ids) {
    const bytes = fs.readFileSync(path.join(vault, "News", id + ".md"), "utf8")
    assert.equal(Object.hasOwn(parseNote(bytes).meta, "next_check"), false)
    assert.equal(bytes.includes("PRIVATE_"), false)
  }
})

test("private follow-up instructions remain unsupported as a hidden public draft key", () => {
  const draft = {
    title: "합성 원고",
    lead: [
      { text: "연구팀이 연구를 공개했다.", claim_ids: ["a".repeat(24)] },
      { text: "실험 조건을 공개 자료에서 설명했다.", claim_ids: ["b".repeat(24)] },
    ],
    facts: { who: "연구팀", when: null, where: null, what: "연구 공개", how: null, why: null },
    sector: "AI",
    theme: "연구·기술",
    tags: ["새로운 방법"],
    entities: [],
    explanations: [],
  }
  assert.doesNotThrow(() => assertSchema(draft, schemaForDraft()))
  assert.throws(() => assertSchema({ ...draft, next_check: privateText }, schemaForDraft()))
})
