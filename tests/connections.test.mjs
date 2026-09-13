import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  assembleGraph,
  mentions,
  relatedNews,
  resolveFocus,
  isLearningTerm,
} from "../web/graph-model.mjs"
import { layoutGraph } from "../web/layout.mjs"
import { readKnowledge, buildGraph, articleSearchText } from "../scripts/knowledge.mjs"
import { noteText } from "../scripts/garden.mjs"
const concept = (id, keywords = [id]) => ({
  id,
  label: id,
  title: id,
  keywords,
  aliases: [],
  slug: "knowledge/" + id,
  definition: id + "의 기술적 작동 원리를 설명한다.",
  mapReview: {
    decision: "include",
    kind: "mechanism",
    reason: "원리를 별도로 배워야 이해할 수 있는 전문 용어다.",
    reviewed: "2026-09-13",
  },
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
test("Common keywords and headlines never create nodes or news associations, regardless of frequency", () => {
  const a = concept("MCP", ["MCP", "도구", "책임", "가격", "상태", "허용"])
  const data = assembleGraph(
    [a],
    Array.from({ length: 50 }, (_, i) => article(String(i), [], "도구 책임 가격 상태 허용")),
  )
  assert.deepEqual(
    data.nodes.map((n) => n.id),
    ["MCP"],
  )
  assert.ok(data.nodes.every((n) => n.kind === "concept" && !("keywords" in n)))
  assert.equal(data.edges.length, 0)
  assert.ok(data.articles.every((a) => a.termIds.length === 0))
  assert.deepEqual(relatedNews(data, "MCP"), [])
})
test("Unreviewed and explicitly excluded notes stay readable but cannot be map nodes", () => {
  const broad = {
    ...concept("general"),
    mapReview: {
      decision: "exclude",
      reason: "일반적인 운영 범주이므로 구체적인 기술 용어를 우선한다.",
      reviewed: "2026-09-13",
    },
  }
  const pending = { ...concept("unreviewed"), mapReview: undefined }
  assert.ok(!isLearningTerm(pending))
  assert.ok(!isLearningTerm(broad))
  const data = assembleGraph(
    [concept("a"), broad, pending, concept("c")],
    [article("broad", ["general"])],
    [
      { source: "a", target: "general", reason: "확인된 관계" },
      { source: "general", target: "c", reason: "다른 확인된 관계" },
    ],
  )
  assert.deepEqual(
    data.nodes.map((n) => n.id),
    ["a", "c"],
  )
  assert.equal(
    data.edges.length,
    0,
    "Removing a broad category must not manufacture links between its neighbors",
  )
  assert.equal(
    data.articles.length,
    1,
    "News must not be deleted when its old broad category is excluded",
  )
  assert.deepEqual(data.articles[0].termIds, [])
})
test("An included learning term requires a meaningful review, definition, page and sources", () => {
  const n = concept("valid")
  for (const patch of [
    { definition: "" },
    { slug: "" },
    { sources: [] },
    { sources: ["invalid"] },
    { mapReview: { ...n.mapReview, reason: "어렵다" } },
    { mapReview: { ...n.mapReview, kind: "general" } },
    { mapReview: { ...n.mapReview, reviewed: "yesterday" } },
    { mapReview: { ...n.mapReview, decision: "automatic" } },
  ])
    assert.throws(() => assembleGraph([{ ...n, ...patch }], []), /learning-term|Learning term/)
})
test("Reviewed aliases attach articles without creating duplicate keyword nodes", () => {
  const n = {
    ...concept("kv-cache", ["메모리", "속도"]),
    label: "KV 캐시",
    title: "KV Cache",
    aliases: ["key-value cache"],
  }
  const data = assembleGraph(
    [n],
    [
      article("english", [], "Distributed KV cache routing"),
      article("korean", [], "KV 캐시를 재사용한다.".normalize("NFD")),
      article("general", [], "메모리 속도 개선"),
      article("fragment", [], "KV CacheServer"),
    ],
  )
  assert.equal(data.nodes.length, 1)
  assert.deepEqual(
    data.articles.map((a) => a.termIds),
    [["kv-cache"], ["kv-cache"], [], []],
  )
  assert.ok(
    data.articles
      .slice(0, 2)
      .every((a) => a.matches[0].basis === "mention" && a.matches[0].matched),
  )
  assert.throws(
    () => assembleGraph([n, { ...concept("other"), aliases: ["kv cache"] }], []),
    /Ambiguous learning term/,
  )
})
test("Related news ranks explicit assignments, then approved-name mentions, then one confirmed neighboring term", () => {
  const data = assembleGraph(
    [concept("a", ["shared"]), concept("b"), concept("c")],
    [
      article("direct", ["a"], "", "2026-09-01"),
      article("related", ["b"], "", "2026-09-13"),
      article("mention", [], "a", "2026-09-02"),
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
    ["news:direct", "news:mention", "news:related"],
  )
  assert.equal(news[2].via, "b")
  assert.equal(news[2].distance, 2)
  assert.deepEqual(relatedNews(data, "news:direct"), [])
  assert.deepEqual(relatedNews(data, "unknown"), [])
})
test("Legacy article and specialized keyword links resolve to a reviewed term, while generic focus is cleared", () => {
  const data = assembleGraph(
    [{ ...concept("kv-cache"), label: "KV 캐시", aliases: ["KV cache"] }],
    [article("sample", ["kv-cache"]), article("without", [])],
  )
  assert.equal(resolveFocus(data, "kv-cache"), "kv-cache")
  assert.equal(resolveFocus(data, "news:sample"), "kv-cache")
  assert.equal(resolveFocus(data, "keyword:KV CACHE"), "kv-cache")
  assert.equal(resolveFocus(data, "keyword:KV 캐시".normalize("NFD")), "kv-cache")
  for (const id of [null, "", "keyword:책임", "unknown", "news:without"])
    assert.equal(resolveFocus(data, id), null)
})
test("Published map contains reviewed terms with definitions, and genuine article mentions connect newly explained terms", () => {
  const data = buildGraph(),
    knowledge = readKnowledge()
  assert.equal(data.schema, "learning-connections/v3")
  assert.deepEqual(
    new Set(data.nodes.map((n) => n.id)),
    new Set(knowledge.nodes.filter(isLearningTerm).map((n) => n.id)),
  )
  assert.ok(
    data.nodes.every(
      (n) => n.kind === "concept" && n.definition && n.slug && n.learningReason && n.sources.length,
    ),
  )
  assert.ok(data.nodes.every((n) => !/^(keyword|news):/.test(n.id)))
  assert.ok(!data.nodes.some((n) => ["책임", "상태", "가격", "허용", "근거"].includes(n.label)))
  for (const [term, articleId] of [
    ["kv-cache", "19af374b78b369cd"],
    ["oidc", "322b7c88af36f3ac"],
    ["zero-shot", "09a390c59d8969e0"],
    ["latency-percentiles", "46fcf5bb7b99520f"],
  ])
    assert.ok(data.articles.find((a) => a.id === "news:" + articleId).termIds.includes(term), term)
  assert.equal(relatedNews(data, "agents")[0].id, "news:b32e9b8471353987")
  assert.ok(
    relatedNews(data, "mcp")
      .slice(0, 3)
      .some((n) => n.id === "news:b32e9b8471353987"),
  )
  assert.equal(data.counts.news, data.articles.length)
  assert.equal(data.counts.linkedNews, data.articles.filter((a) => a.termIds.length).length)
})
test("Empty and isolated graph layouts remain finite without introducing synthetic links", () => {
  assert.deepEqual(layoutGraph({ nodes: [], edges: [] }), [])
  const input = { nodes: [concept("only")], edges: [] },
    out = layoutGraph(input)
  assert.equal(out.length, 1)
  assert.ok(Number.isFinite(out[0].x) && Number.isFinite(out[0].y))
  assert.deepEqual(input.edges, [])
})
