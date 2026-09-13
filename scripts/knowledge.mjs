import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { walk, parseNote, sections, noteText } from "./garden.mjs"
import { slugifyFilePath } from "@quartz-community/utils"
import { layoutGraph, edgeLabels } from "../web/layout.mjs"
import { assembleGraph } from "../web/graph-model.mjs"
const slug = (p) => slugifyFilePath(p + ".md")
export function readKnowledge(vault = "vault") {
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
      path: n.path,
      slug: slug(n.path),
      title: m.title,
      label: m.label,
      group: m.group,
      keywords: m.keywords,
      aliases: m.aliases || [],
      definition: sections(n.body, 2)
        .find((s) => s.title === "한 문장 정의")
        ?.body.replace(/\[[^\]]+\]\(https?:[^)]+\)/g, "")
        .replace(/[\s·]+$/, "")
        .trim(),
      sources: m.verified_sources,
    }
  })
  const ids = new Set(nodes.map((n) => n.id)),
    associations = [],
    seen = new Set()
  if (ids.size !== nodes.length) throw Error("Duplicate concept identity")
  for (const n of notes) {
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
      associations.push({
        source: n.meta.concept_id,
        target: r.target,
        reason: r.reason,
        evidence: r.evidence,
      })
    }
    for (const c of n.meta.connections || []) {
      if (
        !ids.has(c.target) ||
        c.target === n.meta.concept_id ||
        typeof c.reason !== "string" ||
        !c.reason.trim()
      )
        throw Error("Invalid confirmed connection " + n.meta.concept_id)
      if (
        c.evidence &&
        (!Array.isArray(c.evidence) || c.evidence.some((u) => !/^https:\/\//.test(u)))
      )
        throw Error("Invalid connection evidence")
      associations.push({
        source: n.meta.concept_id,
        target: c.target,
        reason: c.reason,
        evidence: c.evidence || [],
      })
    }
  }
  return {
    nodes,
    associations,
    reviewed: notes
      .map((n) => String(n.meta.last_reviewed || n.meta.updated))
      .sort()
      .at(-1),
  }
}
export function articleSearchText(body) {
  return body
    .split(/^## (?:이어 읽기|이 소식을 다룬 브리핑|출처)/m)[0]
    .replace(/^\[\[index\|.*$/gm, "")
    .replace(/^#{1,6} .*$/gm, "")
    .replace(/^\*\*근거:\*\*.*$/gm, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[S\d+\]/g, "")
}
export function buildGraph(vault = "vault") {
  const knowledge = readKnowledge(vault),
    pathToId = new Map(knowledge.nodes.map((n) => [n.path, n.id]))
  const articles = walk(path.join(vault, "News"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ file: f, ...parseNote(fs.readFileSync(f, "utf8")) }))
    .filter((n) => n.meta.type === "news")
    .map((n) => {
      const m = n.meta,
        text = articleSearchText(n.body)
      return {
        id: "news:" + m.event_id,
        title: m.title,
        date: m.date,
        description: m.description || "",
        slug: slug(path.relative(vault, n.file).replace(/\.md$/, "")),
        conceptIds: (m.concepts || []).map((p) => {
          if (!pathToId.has(p)) throw Error("Unresolved article concept: " + p)
          return pathToId.get(p)
        }),
        text: m.title + "\n" + (m.description || "") + "\n" + text,
      }
    })
  const graph = assembleGraph(knowledge.nodes, articles, knowledge.associations)
  graph.nodes = layoutGraph(graph)
  return {
    ...graph,
    reviewed: knowledge.reviewed,
    engine: "sigma-webgl-forceatlas2",
    counts: {
      concepts: knowledge.nodes.length,
      news: articles.length,
      keywords: graph.nodes.filter((n) => n.kind === "keyword").length,
      associations: graph.edges.length,
    },
  }
}
export function syncKnowledgeMap(vault = "vault") {
  const graph = readKnowledge(vault),
    lookup = new Map(graph.nodes.map((n) => [n.id, n]))
  const link = (id) => `[[${lookup.get(id).path}|${lookup.get(id).label}]]`
  const file = path.join(vault, "Knowledge Maps/AI Technology Knowledge Map.md"),
    old = parseNote(fs.readFileSync(file, "utf8"))
  const pairs = new Map()
  for (const a of graph.associations) {
    const key = [a.source, a.target].sort().join("|")
    if (!pairs.has(key)) pairs.set(key, a)
  }
  const body = `# AI Technology Knowledge Map\n\n## 개념\n\n${graph.nodes.map((n) => "- " + link(n.id)).join("\n")}\n\n## 연결 관계\n\n| 개념 | 연결된 개념 | 연결 이유 |\n|---|---|---|\n${[...pairs.values()].map((e) => `| ${link(e.source)} | ${link(e.target)} | ${e.reason}${e.evidence.length ? " " + e.evidence.map((u) => `[근거](${u})`).join(" · ") : ""} |`).join("\n")}\n`
  fs.writeFileSync(
    file,
    noteText({ ...old.meta, updated: graph.reviewed, last_reviewed: graph.reviewed }, body),
  )
  console.log(`Synchronized Obsidian map with ${pairs.size} confirmed associations.`)
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "sync") syncKnowledgeMap()
  else {
    const graph = buildGraph()
    if (process.argv[2] !== "check")
      fs.writeFileSync("public/knowledge-graph.json", JSON.stringify(graph))
    console.log("PASS: news connection graph", graph.counts)
  }
}
