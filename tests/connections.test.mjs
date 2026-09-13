import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { assembleGraph, mentions, relatedNews } from "../web/graph-model.mjs"
import { layoutGraph } from "../web/layout.mjs"
import { readKnowledge, buildGraph, articleSearchText } from "../scripts/knowledge.mjs"
import { noteText } from "../scripts/garden.mjs"
const concept = (id, keywords = [id]) => ({
  id,
  label: id,
  title: id,
  keywords,
  aliases: [],
  sources: ["https://example.org/" + id],
})
const article = (id, conceptIds, text = "", date = "2026-09-13") => ({
  id: "news:" + id,
  title: id,
  date,
  slug: "news/" + id,
  description: id,
  conceptIds,
  text,
})
test("Confirmed association needs a known target and reason, without direction or citation type", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "garden-connections-"))
  try {
    fs.mkdirSync(path.join(dir, "Knowledge"))
    const write = (id, connections = []) =>
      fs.writeFileSync(
        path.join(dir, "Knowledge", id + ".md"),
        noteText(
          {
            entry_type: "concept",
            concept_id: id,
            label: id,
            title: id,
            keywords: [id],
            verified_sources: ["https://example.org/" + id],
            connections,
          },
          "# " + id + "\n\n## 한 문장 정의\n\n정의",
        ),
      )
    write("a", [{ target: "b", reason: "같은 업무에 함께 쓰는 기술이다." }])
    write("b")
    assert.equal(readKnowledge(dir).associations.length, 1)
    write("a", [{ target: "missing", reason: "연관 관계" }])
    assert.throws(() => readKnowledge(dir), /Invalid confirmed connection/)
    write("a", [{ target: "b", reason: "" }])
    assert.throws(() => readKnowledge(dir), /Invalid confirmed connection/)
  } finally {
    fs.rmSync(dir, { recursive: true })
  }
})
test("Association deduplication is undirected and does not add unrelated peers", () => {
  const data = assembleGraph(
    [concept("a"), concept("b"), concept("c")],
    [],
    [
      { source: "a", target: "b", reason: "확인된 연결" },
      { source: "b", target: "a", reason: "확인된 연결" },
    ],
  )
  assert.equal(data.edges.length, 1)
  assert.deepEqual([data.edges[0].source, data.edges[0].target], ["a", "b"])
  assert.equal(data.edges[0].connections.length, 1)
  assert.throws(
    () => assembleGraph([concept("a")], [], [{ source: "a", target: "absent", reason: "확인" }]),
    /Unknown association/,
  )
})
test("Keyword mentions respect Unicode, case, Latin word boundaries and real article prose", () => {
  assert.ok(mentions("JSON-RPC 서버의 도구 호출", "json-rpc"))
  assert.ok(mentions("도구 호출을 지원", "도구 호출".normalize("NFD")))
  assert.ok(!mentions("chair users try MCPServer", "AI"))
  assert.ok(!mentions("MCPServer", "MCP"))
  const text = articleSearchText(
    "# 도구\n[[index|← 헤드라인]] · 도구 상자\n본문에서 승인을 요구한다.\n**근거:** [S1]\n## 출처\n- https://example.org/근거",
  )
  assert.ok(mentions(text, "승인"))
  assert.ok(!mentions(text, "근거"))
  assert.ok(!mentions(text, "도구"))
})
test("Canonical names do not become duplicate keyword nodes and normalized memberships merge", () => {
  const data = assembleGraph(
    [concept("MCP", ["MCP", "도구"]), concept("agents", ["도구".normalize("NFD")])],
    [],
  )
  assert.equal(data.nodes.filter((n) => n.kind === "keyword").length, 1)
  assert.equal(data.nodes.find((n) => n.kind === "keyword").conceptIds.length, 2)
  assert.ok(data.edges.every((e) => e.source !== e.target))
})
test("Selecting a node returns linked news, ranks editorial connections first and stops at two hops", () => {
  const data = assembleGraph(
    [concept("a", ["shared"]), concept("b"), concept("c")],
    [
      article("direct", ["a"], "", "2026-09-01"),
      article("related", ["b"], "", "2026-09-02"),
      article("keyword", [], "shared", "2026-09-13"),
      article("too-far", ["c"]),
    ],
    [
      { source: "a", target: "b", reason: "확인된 관계" },
      { source: "b", target: "c", reason: "다른 관계" },
    ],
  )
  const news = relatedNews(data, "a")
  assert.deepEqual(
    news.map((n) => n.id),
    ["news:direct", "news:related", "news:keyword"],
  )
  assert.equal(news[1].via, "b")
  assert.equal(news[2].via, "shared")
  assert.equal(relatedNews(data, "news:direct")[0].id, "news:direct")
  assert.deepEqual(relatedNews(data, "unknown"), [])
})
test("Published nodes have real concept or article provenance and associated headlines remain intact", () => {
  const data = buildGraph(),
    concepts = new Map(data.nodes.filter((n) => n.kind === "concept").map((n) => [n.id, n]))
  assert.equal(data.nodes.filter((n) => n.kind === "news").length, data.articles.length)
  assert.ok(
    data.nodes
      .filter((n) => n.kind === "keyword")
      .every((n) =>
        n.conceptIds.some((id) =>
          concepts
            .get(id)
            .keywords.some(
              (w) => w.normalize("NFC").toLowerCase() === n.label.normalize("NFC").toLowerCase(),
            ),
        ),
      ),
  )
  assert.equal(relatedNews(data, "agents")[0].id, "news:b32e9b8471353987")
  assert.ok(
    relatedNews(data, "mcp")
      .slice(0, 3)
      .some((n) => n.id === "news:b32e9b8471353987"),
  )
})
test("Empty and isolated graph layouts remain finite without introducing synthetic links", () => {
  assert.deepEqual(layoutGraph({ nodes: [], edges: [] }), [])
  const input = { nodes: [concept("only")], edges: [] },
    out = layoutGraph(input)
  assert.equal(out.length, 1)
  assert.ok(Number.isFinite(out[0].x) && Number.isFinite(out[0].y))
  assert.deepEqual(input.edges, [])
})
