import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { spawnSync } from "node:child_process"
import { makeResolver, projectLinks } from "../scripts/site.mjs"
import { layoutGraph } from "../web/layout.mjs"
import { buildGraph } from "../scripts/knowledge.mjs"
import RSSParser from "rss-parser"
const notes = [
  {
    path: "Knowledge/AI/MCP",
    meta: { title: "Model Context Protocol", aliases: ["MCP", "모델 연결"] },
  },
  { path: "News/story", meta: { title: "보도" } },
  { path: "Archive/old", meta: { title: "기록" } },
  { path: "Editions/2026/09/issue", meta: { title: "원고" } },
]
test("Reviewed concepts satisfy the publication validator without empty taxonomy placeholders", () => {
  const result = spawnSync(
    "python3",
    ["scripts/validate_encyclopedia.py", "--vault-root", "vault", "--all-knowledge"],
    { encoding: "utf8" },
  )
  assert.equal(result.status, 0, result.stdout + result.stderr)
})
test("Typed concept relationships must include a valid type and source evidence", () => {
  const result = spawnSync("python3", ["-"], {
    encoding: "utf8",
    input: `import sys
from pathlib import Path
sys.path.insert(0, 'scripts')
from validate_encyclopedia import validate_relationships
valid = '- → 활용: [[MCP#한 문장 정의|MCP]] — 외부 도구 연결 규격이다. (해석; [근거](https://modelcontextprotocol.io/specification/2025-11-25/architecture))'
for text, should_fail in [(valid, False), (valid.replace('활용:', '같은 날 보도:'), True), (valid.split(' (해석;')[0], True), ('- 상위: 독립 개념', True)]:
    findings = []
    validate_relationships(text, True, Path('concept.md'), findings)
    assert bool(findings) == should_fail, (text, findings)
`,
  })
  assert.equal(result.status, 0, result.stdout + result.stderr)
})
test("Obsidian aliases, Unicode normalization, relative paths and section/block targets resolve", () => {
  const r = makeResolver(notes)
  for (const target of [
    "MCP",
    "Model Context Protocol",
    "모델 연결".normalize("NFD"),
    "Knowledge/AI/MCP.md",
    "../Knowledge/AI/MCP",
  ])
    assert.equal(r(target, "News/story").note.path, "Knowledge/AI/MCP")
  assert.equal(r("MCP#작동 원리", "News/story").hash, "작동 원리")
  assert.equal(r("MCP#^evidence", "News/story").hash, "^evidence")
  assert.equal(r("#개요", "News/story").note.path, "News/story")
  assert.throws(() => r("missing", "News/story"), /Unresolved/)
})
test("Standard Markdown note links share the Obsidian path and alias resolver", () => {
  const allowed = new Set(["News/story", "Knowledge/AI/MCP"])
  assert.equal(
    projectLinks(
      "[정의](../Knowledge/AI/MCP.md#한-문장-정의)",
      "News/story",
      makeResolver(notes),
      allowed,
    ),
    "[[Knowledge/AI/MCP#한-문장-정의|정의]]",
  )
})
test("Ambiguous aliases fail rather than silently linking to another concept", () => {
  const r = makeResolver([
    ...notes,
    { path: "Knowledge/Other", meta: { title: "다른 것", aliases: ["MCP"] } },
  ])
  assert.throws(() => r("MCP", "News/story"), /Ambiguous/)
})
test("Publication maps source editions to briefings and excludes archive references", () => {
  const allowed = new Set(["News/story", "Knowledge/AI/MCP", "Briefings/2026/09/issue"])
  const out = projectLinks(
    "[[MCP#작동 원리|프로토콜]] [[Archive/old|옛 기록]] [[Editions/2026/09/issue|브리핑]]",
    "News/story",
    makeResolver(notes),
    allowed,
  )
  assert.match(out, /\[\[Knowledge\/AI\/MCP#작동 원리\|프로토콜\]\]/)
  assert.ok(!out.includes("Archive/"))
  assert.ok(out.includes("옛 기록"))
  assert.ok(out.includes("[[Briefings/2026/09/issue|브리핑]]"))
  assert.equal(
    projectLinks("```\n[[unknown]]\n```", "News/story", makeResolver(notes), allowed),
    "```\n[[unknown]]\n```",
  )
})
test("Semantic layout is deterministic, preserves disconnected nodes and prevents label overlaps", () => {
  const graph = buildGraph(),
    first = layoutGraph({
      ...graph,
      nodes: [...graph.nodes, { id: "unconnected", label: "고립 개념", width: 220 }].map(
        ({ x, y, ...n }) => n,
      ),
    })
  const second = layoutGraph({
    ...graph,
    nodes: [...graph.nodes, { id: "unconnected", label: "고립 개념", width: 220 }].map(
      ({ x, y, ...n }) => n,
    ),
  })
  assert.deepEqual(first, second)
  assert.equal(first.length, graph.nodes.length + 1)
  for (const n of first) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y))
  for (let i = 0; i < first.length; i++)
    for (let j = i + 1; j < first.length; j++)
      assert.ok(
        Math.abs(first[i].x - first[j].x) >= (first[i].width + first[j].width) / 2 ||
          Math.abs(first[i].y - first[j].y) >= 58,
        "Overlapping labels",
      )
})
test("Layout responds to relationships instead of sorting nodes into a fixed grid", () => {
  const nodes = Array.from({ length: 8 }, (_, i) => ({ id: String(i), width: 180 }))
  const run = (a, b) => layoutGraph({ nodes, edges: [{ source: a, target: b, type: "uses" }] })
  const a = run("0", "1"),
    b = run("0", "7")
  assert.notDeepEqual(
    a.map((n) => [n.x, n.y]),
    b.map((n) => [n.x, n.y]),
  )
  const distance = (n, i, j) => Math.hypot(n[i].x - n[j].x, n[i].y - n[j].y)
  assert.ok(distance(a, 0, 1) < distance(a, 0, 7))
})
test("All concepts have primary-source evidence and every relation links existing nodes", () => {
  const graph = buildGraph()
  assert.ok(graph.nodes.length >= 23)
  assert.ok(graph.edges.length > 0)
  assert.ok(graph.nodes.every((n) => n.keywords.length >= 3 && n.sources.length > 0))
  const ids = new Set(graph.nodes.map((n) => n.id))
  for (const e of graph.edges)
    assert.ok(ids.has(e.source) && ids.has(e.target) && e.evidence.length && e.reason && e.basis)
})
test("RSS readers decode Korean titles and stable permalinks from encoding-neutral XML", async () => {
  const xml = fs.readFileSync("vault/briefing.xml", "utf8")
  assert.ok(!/[^\x00-\x7f]/.test(xml))
  const feed = await new RSSParser().parseString(xml)
  assert.equal(feed.title, "아침 브리핑")
  assert.equal(feed.items.length, 40)
  assert.match(feed.items[0].title, /아침 브리핑/)
  assert.match(feed.items[0].link, /\/briefings\//)
  assert.equal(feed.items[0].guid, feed.items[0].link)
})

test("Inline code containing wiki syntax stays literal", () => {
  assert.equal(
    projectLinks(
      "`[[unknown]]` and [[MCP]]",
      "News/story",
      makeResolver(notes),
      new Set(["Knowledge/AI/MCP"]),
    ),
    "`[[unknown]]` and [[Knowledge/AI/MCP|Model Context Protocol]]",
  )
})
