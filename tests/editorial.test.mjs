import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import Parser from "rss-parser"
import { extractArticles, refresh, noteText, parseNote } from "../scripts/garden.mjs"
import {
  applyEditorial,
  requireEditorial,
  editorialContext,
  DEEP_KINDS,
} from "../scripts/editorial.mjs"
import { auditRuns } from "../scripts/research-audit.mjs"
import { SECTORS } from "../scripts/sectors.mjs"

// Fictional fixtures only; never copied into the canonical vault.
export function fixture(kind = "기업 전략") {
  const title = "시험 기업, 연구 조직 투자 계획 발표"
  const lead =
    "시험 기업이 9월 14일 국내 연구 조직 투자 계획을 발표했다. 회사는 제품 개발 기간 단축을 목표로 설명했으며 투자금액은 공개하지 않았다."
  const r = {
    title,
    kind,
    region: "국내",
    lead,
    facts: {
      who: "시험 기업",
      when: "9월 14일 발표, 집행 시점 미공개",
      where: "국내",
      what: "투자 계획",
      how: "금액 미공개",
      why: "회사가 밝힌 제품 개발 기간 단축",
    },
    papers: [],
    relations: [],
    topic_ids: ["company-example"],
    analysis_summary: "계획 발표 단계이며 집행 여부는 미확인이다.",
    next_check: "집행 공시",
  }
  if (kind === "논문 해설")
    r.papers = [
      {
        work_id: "example-paper",
        identifiers: ["doi:10.1000/example", "arxiv:2609.12345"],
        access: "전문",
        status: "사전공개",
        evidence_url: "https://example.org/announcement",
      },
    ]
  if (kind === "연구 사업화")
    r.relations = [
      {
        person_id: "example-professor",
        person_name: "시험 교수",
        affiliation: "시험 대학",
        organization: "시험 기업",
        role: "공동창업",
        claim: "대학과 회사가 공동창업자를 명시했다.",
        as_of: "2026-09-14",
        evidence_urls: ["https://example.org/announcement", "https://example.edu/founder"],
      },
    ]
  const meta = {
    schema_version: "tech-ai-magazine/v2",
    date: "2026-09-14",
    coverage_end: "2026-09-14T08:00:00+09:00",
    briefing_format: "sector-five/v1",
    theme_format: "news-themes/v1",
    editorial_format: "six-w/v1",
    headlines: [title],
    article_records: [r],
  }
  const body = `# 커버 스토리\n\n## ${title}\n\n**분야:** AI\n**테마:** 연구·기술\n**보조 테마:** 없음\n**세부 태그:** 새로운 방법\n**기업·기관:** 시험 기업\n\n${lead}\n\n### 집행 여부는 미확인\n\n분석: ${r.analysis_summary} [S1] [S2]\n\n# Source List\n\n- [S1] https://example.org/announcement\n- [S2] https://example.edu/founder\n`
  return {
    meta,
    body,
    slug: "Editions/2026/09/2026-09-14_0800_Tech_AI_Briefing",
    file: "fixture.md",
  }
}
test("new editorial evidence rejects missing facts, abstract-only depth, unsupported founders and duplicate titles", () => {
  for (const kind of DEEP_KINDS)
    assert.equal(extractArticles(fixture(kind))[0].editorial.kind, kind)
  for (const mutate of [
    (i) => delete i.meta.article_records[0].facts.why,
    (i) => (i.meta.article_records[0].lead = "not in article"),
    (i) => (i.meta.headlines = ["invented"]),
    (i) => i.meta.article_records.push(i.meta.article_records[0]),
  ]) {
    const i = fixture()
    mutate(i)
    assert.throws(() => extractArticles(i), /Editorial/)
  }
  const p = fixture("논문 해설")
  p.meta.article_records[0].papers[0].access = "초록"
  assert.throws(() => extractArticles(p), /full text/)
  const f = fixture("연구 사업화")
  f.meta.article_records[0].relations[0].evidence_urls.pop()
  assert.throws(() => extractArticles(f), /founder/)
  const missing = fixture()
  delete missing.meta.editorial_format
  assert.throws(() => requireEditorial(missing), /six-w/)
  const empty = {
    meta: {
      editorial_format: "six-w/v1",
      article_records: [],
      headlines: [],
      deep_skip_reason: "접근 실패",
    },
  }
  assert.deepEqual(applyEditorial(empty, []), [])
  delete empty.meta.deep_skip_reason
  assert.throws(() => applyEditorial(empty, []), /skipped/)
})
test("three deep formats retain the same lead, evidence and topic links in News, briefing, GitHub and RSS", async () => {
  const original = process.cwd()
  for (const kind of DEEP_KINDS) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "garden-editorial-"))
    let xml
    try {
      fs.copyFileSync(
        path.join(original, "quartz.config.yaml"),
        path.join(temp, "quartz.config.yaml"),
      )
      process.chdir(temp)
      const i = fixture(kind),
        a = extractArticles(i)[0]
      const put = (f, meta, body = "") => {
        fs.mkdirSync(path.dirname(f), { recursive: true })
        fs.writeFileSync(f, noteText(meta, body))
      }
      put("vault/" + i.slug + ".md", i.meta, i.body)
      put("vault/TrendTopics/company-example.md", {
        schema_version: "tech-trend/v1",
        id: "company-example",
        title: "시험 기업 전략",
        question: "투자가 집행되는가?",
        thesis: "아직 계획이다",
        watch_for: "집행",
        disconfirming: "계획 철회",
        reviewed: "2026-09-14",
        knowledge_notes: [],
        lessons: [],
      })
      put("vault/Signals/test.md", {
        schema_version: "tech-signals/v1",
        edition: i.slug,
        date: "2026-09-14",
        reviewed: "2026-09-14",
        review_basis: "primary-research",
        observations: [
          {
            id: "example-signal",
            topic_id: "company-example",
            event_id: a.id,
            change: "계획 발표",
            meaning: "분석: 집행 미확인",
            limit: "금액 미공개",
            next_check: "집행 공시",
            stance: "context",
          },
        ],
      })
      refresh()
      const news = parseNote(fs.readFileSync(`vault/News/${a.id}.md`, "utf8"))
      assert.equal(news.meta.kind, kind)
      assert.deepEqual(news.meta.papers, a.editorial.papers)
      assert.deepEqual(news.meta.relations, a.editorial.relations)
      for (const f of [
        "vault/" + i.slug.replace("Editions/", "Briefings/") + ".md",
        i.slug.replace("Editions/", "digest/") + ".md",
      ]) {
        const output = fs.readFileSync(f, "utf8")
        assert.ok(output.includes(a.summary))
        assert.match(output, /오늘의 심층 분석/)
        assert.match(output, /Briefings\/Topics\/company-example/i)
        assert.ok(output.indexOf("주요 소식") < output.indexOf("분야별 브리핑"))
      }
      xml = fs.readFileSync("vault/briefing.xml", "utf8")
      refresh()
      assert.equal(fs.readFileSync("vault/briefing.xml", "utf8"), xml)
      assert.equal(
        editorialContext([{ date: i.meta.date, original: i, items: [a] }]).next_deep_kind,
        DEEP_KINDS[(DEEP_KINDS.indexOf(kind) + 1) % 3],
      )
    } finally {
      process.chdir(original)
      fs.rmSync(temp, { recursive: true })
    }
    const feed = await new Parser().parseString(xml)
    assert.equal(feed.items[0].guid, feed.items[0].link)
    assert.match(feed.items[0].content, /오늘의 심층 분석/)
    assert.match(feed.items[0].content, /example.org\/announcement/)
  }
})
test("only actually verified unique runs count toward the first seven audit", () => {
  const make = (n) => ({
    edition: `Editions/2026/09/${n}`,
    checked_at: "2026-09-14T08:00:00+09:00",
    drive_verified: true,
    deployment_verified: true,
    rss_verified: true,
    github_verified: true,
    deep_kind: "기업 전략",
    reading_minutes: 8,
    coverage: SECTORS.flatMap((sector) =>
      ["기술·제품", "기업·운영"].flatMap((channel) =>
        ["국내", "해외"].map((region) => ({
          sector,
          channel,
          region,
          status: "확인",
          urls: ["https://example.org"],
        })),
      ),
    ),
  })
  assert.equal(auditRuns([]).completed_runs, 0)
  const runs = Array.from({ length: 7 }, (_, i) => make(i))
  assert.ok(auditRuns(runs).first_seven_ready)
  assert.equal(
    auditRuns([...runs, runs[0], { ...make(9), drive_verified: false }]).completed_runs,
    7,
  )
  assert.equal(auditRuns([{ ...make(1), coverage: [] }]).completed_runs, 0)
})

test("watchlist balances each sector and separates access checks from source review", () => {
  const list = JSON.parse(
    fs.readFileSync(new URL("../data/research-watchlist.json", import.meta.url), "utf8"),
  )
  assert.equal(list.companies.length, 32)
  assert.equal(list.institutions.length, 16)
  for (const sector of SECTORS)
    for (const region of ["국내", "해외"])
      assert.equal(
        list.companies.filter((c) => c.sector === sector && c.region === region).length,
        2,
      )
  for (const region of ["국내", "해외"])
    assert.equal(list.institutions.filter((c) => c.region === region).length, 8)
  for (const c of [...list.companies, ...list.institutions]) {
    assert.ok(c.last_checked_at)
    assert.ok(c.source_urls.every((u) => new URL(u).protocol === "https:"))
    assert.match(c.review_scope, /내용 취재.*아님/)
  }
})

test("paper version identity cannot fork across editions", async () => {
  const { validateIdentities } = await import("../scripts/editorial.mjs")
  const first = extractArticles(fixture("논문 해설"))[0]
  const second = structuredClone(first.editorial)
  second.papers[0].work_id = "different-work"
  second.papers[0].identifiers = ["arxiv:2609.12345v2"]
  assert.throws(
    () => validateIdentities([{ items: [first] }, { items: [{ editorial: second }] }]),
    /different works/,
  )
})

test("legacy Python source contract accepts factual six-w cover headings", async () => {
  const { spawnSync } = await import("node:child_process")
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "garden-sixw-contract-"))
  try {
    const i = fixture()
    Object.assign(i.meta, {
      title: "검증용 기사",
      type: "briefing",
      timezone: "Asia/Seoul",
      coverage_start: "2026-09-13T08:00:00+09:00",
      source_count: 2,
      new_items_count: 1,
      linked_knowledge_notes: [],
      knowledge_notes_created: [],
      knowledge_notes_updated: [],
    })
    i.body =
      "# 이번 호 표지\n\n> [!abstract] 검증용\n> **한 줄 편집:** 시험 발표\n\n# 차례\n\n시험\n\n" +
      i.body.replace(
        "# Source List",
        ["뉴스 데스크", "리서치 노트", "도구 상자", "흐름 읽기", "오늘의 적용", "개념 색인"]
          .map((t) => `# ${t}\n\n없음\n\n`)
          .join("") + "# Source List",
      )
    const file = path.join(dir, "issue.md")
    fs.writeFileSync(file, noteText(i.meta, i.body))
    fs.mkdirSync(path.join(dir, "Knowledge"))
    const result = spawnSync(
      "python3",
      ["scripts/validate_encyclopedia.py", "--vault-root", dir, "--briefing", file],
      { encoding: "utf8" },
    )
    assert.equal(result.status, 0, result.stdout + result.stderr)
  } finally {
    fs.rmSync(dir, { recursive: true })
  }
})

test("a repeated URL is not independent founder confirmation", () => {
  const i = fixture("연구 사업화")
  const r = i.meta.article_records[0].relations[0]
  r.evidence_urls = [r.evidence_urls[0], r.evidence_urls[0]]
  assert.throws(() => extractArticles(i), /founder/)
})
