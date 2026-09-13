import test from "node:test"
import assert from "node:assert/strict"
import { extractArticles } from "../scripts/garden.mjs"
import { sectorMarkdown, SECTORS } from "../scripts/sectors.mjs"
const issue = (sectors) => ({
  file: "fixture.md",
  meta: { schema_version: "tech-ai-magazine/v2", briefing_format: "sector-five/v1" },
  body:
    "# 뉴스 데스크\n\n" +
    sectors
      .map((s, i) => `## 소식 ${i}\n\n**분야:** ${s}\n\n**핵심:** 실제 변화 ${i}. [S${i + 1}]`)
      .join("\n\n") +
    "\n\n# Source List\n\n" +
    sectors.map((_, i) => `- [S${i + 1}] https://example.org/${i}`).join("\n"),
})
test("Eight sector output preserves summaries, order, and empty coverage without inventing news", () => {
  const i = issue([SECTORS[4], SECTORS[0]])
  const articles = extractArticles(i)
  assert.equal(articles[0].summary, "실제 변화 0.")
  const md = sectorMarkdown(i, articles, (a) => a.title)
  assert.ok(md.indexOf("AI · 1건") < md.indexOf("로봇·제조 · 1건"))
  assert.equal((md.match(/수록 없음/g) || []).length, 6)
})
test("Sector editions reject missing labels, over quota, and duplicated events; history stays readable", () => {
  assert.throws(() => extractArticles(issue(["잘못된 분야"])), /invalid article sector/)
  assert.throws(() => extractArticles(issue(Array(6).fill("AI"))), /More than five/)
  const duplicate = issue(["AI", "로봇·제조"])
  duplicate.body = duplicate.body.replace("https://example.org/1", "https://example.org/0")
  assert.throws(() => extractArticles(duplicate), /Duplicate event/)
  const old = issue(["미분류"])
  delete old.meta.briefing_format
  assert.equal(extractArticles(old).length, 1)
  assert.equal(
    sectorMarkdown(old, extractArticles(old), () => ""),
    null,
  )
})
