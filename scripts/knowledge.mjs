import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { walk, parseNote, sections, noteText } from "./garden.mjs"
import { slugifyFilePath } from "@quartz-community/utils"
const slug = (p) => slugifyFilePath(p + ".md")
import { layoutGraph, edgeLabels } from "../web/layout.mjs"
export function buildGraph(vault = "vault") {
  const notes = walk(path.join(vault, "Knowledge"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({
      path: path.relative(vault, f).replace(/\.md$/, ""),
      ...parseNote(fs.readFileSync(f, "utf8")),
    }))
    .filter((n) => n.meta.entry_type === "concept")
  const nodes = notes.map((n) => {
    const m = n.meta
    if (!m.concept_id || !m.label || !m.keywords?.length || !m.verified_sources?.length)
      throw Error("Missing concept evidence/identity " + n.path)
    return {
      id: m.concept_id,
      slug: slug(n.path),
      title: m.title,
      label: m.label,
      group: m.group,
      keywords: m.keywords,
      aliases: m.aliases || [],
      definition: sections(n.body, 2)
        .find((s) => s.title === "한 문장 정의")
        ?.body.replace(/\[[^\]]+\]\(https?:[^)]+\)/g, "")
        .replace(/^[ ·]+|[ ·]+$/g, "")
        .replace(/[ ·]+$/g, "")
        .trim(),
      sources: m.verified_sources,
      width: Math.max(180, m.label.length * 15 + 36),
    }
  })
  const ids = new Set(nodes.map((n) => n.id)),
    edges = [],
    seen = new Set()
  for (const n of notes)
    for (const r of n.meta.relations || []) {
      const key = [n.meta.concept_id, r.target, r.type].join("|")
      if (
        !ids.has(r.target) ||
        r.target === n.meta.concept_id ||
        seen.has(key) ||
        !edgeLabels[r.type] ||
        !r.reason ||
        !r.evidence?.length ||
        !["source", "inference"].includes(r.basis)
      )
        throw Error("Invalid relation " + key)
      for (const u of r.evidence)
        if (!/^https:\/\//.test(u) || !n.meta.verified_sources.includes(u))
          throw Error("Unreviewed relation evidence " + key)
      seen.add(key)
      edges.push({ source: n.meta.concept_id, ...r })
    }
  edges.sort((a, b) => (a.source + a.target + a.type).localeCompare(b.source + b.target + b.type))
  return {
    schema: "knowledge-graph/v1",
    reviewed: notes
      .map((n) => String(n.meta.last_reviewed || n.meta.updated))
      .sort()
      .at(-1),
    nodes: layoutGraph({ nodes, edges }),
    edges,
  }
}
export function syncKnowledgeMap(vault = "vault") {
  const graph = buildGraph(vault),
    lookup = new Map(graph.nodes.map((n) => [n.id, n]))
  const paths = new Map(
    walk(path.join(vault, "Knowledge"))
      .filter((f) => f.endsWith(".md"))
      .map((f) => {
        const n = parseNote(fs.readFileSync(f, "utf8"))
        return [n.meta.concept_id, path.relative(vault, f).replace(/\.md$/, "")]
      }),
  )
  const link = (id) => `[[${paths.get(id)}|${lookup.get(id).label}]]`
  const file = path.join(vault, "Knowledge Maps/AI Technology Knowledge Map.md"),
    old = parseNote(fs.readFileSync(file, "utf8"))
  const body = `# AI Technology Knowledge Map\n\n## 개념\n\n${graph.nodes.map((n) => "- " + link(n.id)).join("\n")}\n\n## 연결 관계\n\n| 출발 | 관계 | 도착 | 연결 이유와 근거 |\n|---|---|---|---|\n${graph.edges.map((e) => `| ${link(e.source)} | ${edgeLabels[e.type]} | ${link(e.target)} | ${e.reason} (${e.basis === "inference" ? "해석" : "원문"}; ${e.evidence.map((u) => `[근거](${u})`).join(" · ")}) |`).join("\n")}\n`
  fs.writeFileSync(
    file,
    noteText({ ...old.meta, updated: graph.reviewed, last_reviewed: graph.reviewed }, body),
  )
  console.log(`Synchronized Obsidian map with ${graph.edges.length} semantic relationships.`)
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "sync") {
    syncKnowledgeMap()
  } else {
    const graph = buildGraph()
    fs.writeFileSync("public/knowledge-graph.json", JSON.stringify(graph))
    console.log(
      `Knowledge graph: ${graph.nodes.length} concepts, ${graph.edges.length} evidenced relations.`,
    )
  }
}
