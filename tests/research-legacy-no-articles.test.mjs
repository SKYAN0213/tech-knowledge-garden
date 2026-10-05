import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { noteText, parseNote, extractArticles } from "../scripts/garden.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { legacyReviewUnits } from "../scripts/research/legacy-review.mjs"
import { assertLegacyTransition } from "../scripts/research/legacy-transition.mjs"
import { retrospectiveProjections } from "../scripts/research/preview.mjs"
import { editionProjection } from "../scripts/research/publish-adapter.mjs"

function fixture(t, change = () => {}) {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-no-articles-"))
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }))
  fs.mkdirSync(path.join(vault, "Knowledge"))
  const key = "2026-07-13_0802_Tech_AI_Briefing"
  const relative = `Editions/2026/07/${key}.md`
  const value = {
    meta: {
      title: "Tech & AI Briefing - 08:02",
      date: "2026-07-13",
      time: "08:02",
      timezone: "Asia/Seoul",
      type: "briefing",
      coverage_start: "2026-07-13T00:02:09+09:00",
      coverage_end: "2026-07-13T08:02:28+09:00",
      source_count: 1,
      new_items_count: 0,
      linked_knowledge_notes: [],
    },
    body: "# 한눈에 보기\n\n공식 발표가 없었다는 근거 없는 옛 판단.\n\n# 오늘의 핵심 기사\n\n없음\n\n# 논문과 연구\n\n없음\n\n# 오픈소스와 도구\n\n없음\n\n# 흐름 읽기\n\n주말이라 새 발표가 드물다는 추론.\n\n# 바로 써먹을 점\n\n없음\n\n# Source List\n\n- https://example.org/news/rss.xml\n",
  }
  change(value)
  const content = noteText(value.meta, value.body)
  fs.mkdirSync(path.dirname(path.join(vault, relative)), { recursive: true })
  fs.writeFileSync(path.join(vault, relative), content)
  const existing = { ...parseNote(content), file: path.join(vault, relative) }
  const packet = {
    schema: "research-legacy-edition-transition/v1",
    reviewer: "source and editorial reviewer",
    reviewed_at: "2026-10-05",
    original_read: true,
    source_read: true,
    duplicate_checked: true,
    reason:
      "Read the original sections; remove unsupported editorial claims without asserting absence of news.",
    target_path: relative,
    target_sha256: sha256(content),
    before_content: content,
    events: [],
    no_article_review: {
      original_content_checked: true,
      article_sections_checked: true,
      discovery_routes_checked: true,
      unsupported_no_news_claims_removed: true,
      reason: "The original has no articles or cited event evidence.",
    },
    metadata_review: {
      metadata_read: true,
      dispositions: ["time", "type"].map((field) => ({
        field,
        action: "preserve",
        reason: "Preserve original identity.",
      })),
    },
    units: legacyReviewUnits(existing.body, relative).map((unit) => ({
      unit_id: unit.unit_id,
      sha256: unit.sha256,
      event_ids: [],
      reason: "Read original unit and retain it privately.",
      decision:
        unit.title === "Source List"
          ? "omitted_discovery"
          : ["한눈에 보기", "흐름 읽기"].includes(unit.title)
            ? "omitted_editorial"
            : "omitted_empty",
    })),
    source_list_dispositions: [
      {
        url: "https://example.org/news/rss.xml",
        role: "discovery",
        source_role_checked: true,
        reason: "A live discovery route is not evidence of historical absence.",
      },
    ],
  }
  return { vault, relative, existing, packet, key }
}

test("reviewed article-free legacy projection removes unsupported prose and discovery routes, preserving identity", (t) => {
  const f = fixture(t)
  const [projection] = retrospectiveProjections(f.vault, [], [], [f.packet])
  const next = parseNote(projection.content)
  assert.equal(next.meta.schema_version, "tech-ai-magazine/v2")
  assert.equal(next.meta.source_count, 0)
  assert.equal(next.meta.new_items_count, 0)
  assert.deepEqual(next.meta.article_records, [])
  assert.deepEqual(next.meta.article_reviews, [])
  assert.deepEqual(next.meta.headlines, [])
  assert.equal(extractArticles({ ...next, file: f.existing.file }).length, 0)
  for (const field of ["date", "time", "coverage_start", "coverage_end"])
    assert.equal(next.meta[field], f.existing.meta[field])
  for (const phrase of [
    "근거 없는",
    "주말",
    "https://example.org",
    "no_article_review",
    "unsupported_no_news",
  ])
    assert(!projection.content.includes(phrase))
  assert.equal(fs.readFileSync(f.existing.file, "utf8"), f.packet.before_content)
  assert(!projection.content.includes("undefined"))
  const generatedVault = path.join(f.vault, "generated")
  const generated = path.join(generatedVault, f.relative)
  fs.mkdirSync(path.dirname(generated), { recursive: true })
  fs.mkdirSync(path.join(generatedVault, "Knowledge"))
  fs.writeFileSync(generated, projection.content)
  const check = spawnSync(
    process.env.RESEARCH_PYTHON || ".local/research/local-ai/runtime/venv/bin/python",
    ["scripts/validate_encyclopedia.py", "--vault-root", generatedVault, "--briefing", generated],
    { encoding: "utf8" },
  )
  assert.equal(check.status, 0, check.stdout + check.stderr)
})

test("article-free transition rejects missing review, partial units and discovery omissions", (t) => {
  const f = fixture(t)
  for (const change of [
    (p) => delete p.no_article_review,
    (p) => (p.no_article_review.article_sections_checked = false),
    (p) => (p.no_article_review.reason = " "),
    (p) => p.units.pop(),
    (p) => delete p.source_list_dispositions,
    (p) => (p.source_list_dispositions[0].url = "https://example.org/unrelated"),
  ]) {
    const packet = structuredClone(f.packet)
    change(packet)
    assert.throws(() => assertLegacyTransition(packet, [], f.existing, f.relative))
  }
})

test("article-free review cannot remove articles, inline event sources, positive counts or linked knowledge", (t) => {
  for (const change of [
    (v) =>
      (v.body = v.body.replace("# 논문과 연구\n\n없음", "# 논문과 연구\n\n## 연구 발표\n\n내용")),
    (v) =>
      (v.body = v.body.replace("# 흐름 읽기\n\n", "# 흐름 읽기\n\nhttps://example.org/report\n\n")),
    (v) => (v.meta.new_items_count = 1),
    (v) => (v.meta.linked_knowledge_notes = ["[[Knowledge/Term]]"]),
    (v) =>
      (v.body = v.body.replace(
        "# 오픈소스와 도구\n\n없음",
        "# 오픈소스와 도구\n\n출처 없는 실제 기사 본문.",
      )),
  ]) {
    const f = fixture(t, change)
    assert.throws(() => assertLegacyTransition(f.packet, [], f.existing, f.relative))
  }
})

test("ordinary projection and retrospective still require approved events without explicit legacy review", (t) => {
  const f = fixture(t)
  assert.throws(() => retrospectiveProjections(f.vault, []), /approved events/)
  assert.throws(
    () =>
      editionProjection([], {
        key: f.key,
        date: f.existing.meta.date,
        coverage_start: f.existing.meta.coverage_start,
        coverage_end: f.existing.meta.coverage_end,
        existing: f.existing,
      }),
    /approved articles/,
  )
})
