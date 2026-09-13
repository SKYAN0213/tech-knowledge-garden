import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { fromHtml } from "hast-util-from-html"
import RSSParser from "rss-parser"
import { walk } from "./garden.mjs"
import { relatedNews } from "../web/graph-model.mjs"
export const collect = (node, pred, acc = []) => {
  if (pred(node)) acc.push(node)
  for (const c of node.children || []) collect(c, pred, acc)
  return acc
}
export async function verifySite(
  root = "public",
  base = "https://skyan0213.github.io/tech-knowledge-garden/",
) {
  const errors = [],
    files = walk(root),
    trees = new Map(),
    prefix = new URL(base).pathname.replace(/\/$/, "")
  const html = files.filter((f) => f.endsWith(".html"))
  for (const f of html) trees.set(path.resolve(f), fromHtml(fs.readFileSync(f, "utf8")))
  const resolve = (url, from) => {
    let u
    try {
      u = new URL(url, base + path.relative(root, from).replace(/\.html$/, ""))
    } catch {
      return null
    }
    if (u.origin !== new URL(base).origin) return null
    const relative = decodeURIComponent(u.pathname).slice(prefix.length).replace(/^\//, "")
    if (!u.pathname.startsWith(prefix + "/") && u.pathname !== prefix) {
      errors.push("Outside website: " + url)
      return null
    }
    const p = path.resolve(root, relative)
    if (!p.startsWith(path.resolve(root) + path.sep) && p !== path.resolve(root)) {
      errors.push("Path escape: " + url)
      return null
    }
    const file = [p, p + ".html", path.join(p, "index.html")].find(
      (f) => fs.existsSync(f) && fs.statSync(f).isFile(),
    )
    if (!file) {
      errors.push(`${from}: missing ${url}`)
      return null
    }
    if (u.hash && trees.has(file)) {
      const fragment = decodeURIComponent(u.hash.slice(1))
      const ids = new Set(
        collect(trees.get(file), (n) => n.properties?.id).map((n) => n.properties.id),
      )
      if (!ids.has(fragment)) errors.push(`${from}: missing fragment ${url}`)
    }
    return file
  }
  for (const [f, tree] of trees) {
    const ids = collect(tree, (n) => n.properties?.id).map((n) => n.properties.id)
    if (new Set(ids).size !== ids.length) errors.push(f + ": duplicate HTML IDs")
    for (const n of collect(tree, (n) => n.properties?.href || n.properties?.src)) {
      const url = String(n.properties.href || n.properties.src)
      if (
        !/^(mailto:|tel:|data:|https?:\/\/[^/]+)/.test(url) ||
        url.startsWith(new URL(base).origin)
      )
        resolve(url, f)
    }
    if (
      !collect(
        tree,
        (n) =>
          n.tagName === "link" &&
          n.properties?.rel?.includes("alternate") &&
          n.properties.type === "application/rss+xml",
      ).length
    )
      errors.push(f + ": RSS discovery missing")
  }
  const index = JSON.parse(fs.readFileSync(path.join(root, "reader-index.json")))
  for (const row of index) {
    resolve(row.url, path.join(root, "index.html"))
    if (!row.title || /^(archive|editions|trends)\//i.test(row.slug))
      errors.push("Invalid search entry " + row.slug)
  }
  const graph = JSON.parse(fs.readFileSync(path.join(root, "knowledge-graph.json")))
  const ids = new Set(graph.nodes.map((n) => n.id)),
    articleIds = new Set(graph.articles.map((n) => n.id)),
    pairs = new Set()
  if (graph.schema !== "news-connections/v2" || ids.size !== graph.nodes.length)
    errors.push("Invalid connection graph identity")
  for (const n of graph.nodes) {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) errors.push("Invalid node position " + n.id)
    if (n.slug) resolve(base + n.slug, path.join(root, "index.html"))
    else if (
      n.kind !== "keyword" ||
      !n.conceptIds.length ||
      !n.conceptIds.every((id) => ids.has(id))
    )
      errors.push("Keyword has no concept provenance " + n.id)
    for (const article of relatedNews(graph, n.id))
      if (!articleIds.has(article.id) || article.distance > 2)
        errors.push("Unrelated news destination " + n.id)
  }
  for (const article of graph.articles) resolve(base + article.slug, path.join(root, "index.html"))
  for (const e of graph.edges) {
    const pair = [e.source, e.target].sort().join("|")
    if (
      !ids.has(e.source) ||
      !ids.has(e.target) ||
      e.source === e.target ||
      pairs.has(pair) ||
      !e.connections?.every((c) => c.reason)
    )
      errors.push("Invalid undirected connection " + e.id)
    pairs.add(pair)
  }
  for (const match of fs
    .readFileSync(path.join(root, "reader.js"), "utf8")
    .matchAll(/import\(["']([^"']+)["']\)/g))
    resolve(match[1], path.join(root, "reader.js"))
  resolve(base + "map-layout.worker.js", path.join(root, "index.html"))
  const rss = fs.readFileSync(path.join(root, "briefing.xml"), "utf8"),
    feed = await new RSSParser().parseString(rss)
  if (!feed.title.includes("브리핑") || feed.items.length === 0)
    errors.push("RSS Korean/content invalid")
  for (const i of feed.items) {
    resolve(i.link, path.join(root, "index.html"))
    if (!i.guid || !i.pubDate || Number.isNaN(Date.parse(i.pubDate)))
      errors.push("Invalid RSS item " + i.title)
  }
  if (/[^\x00-\x7f]/.test(rss))
    errors.push("RSS must be encoding-independent ASCII with numeric entities")
  if (files.some((f) => /\/(?:archive|editions|trends|automation|\.obsidian|\.local)\//i.test(f)))
    errors.push("Excluded material emitted")
  const homepage = fs.readFileSync(path.join(root, "index.html"), "utf8")
  if (!homepage.includes("data-connections")) errors.push("Home connection map missing")
  if (
    /오늘의 변화를 읽고|TECH KNOWLEDGE GARDEN|읽고, 연결하고|축적된 지식|class="explorer"|generated_by:/.test(
      homepage,
    )
  )
    errors.push("UI bookkeeping leaked")
  if (errors.length) throw Error(errors.join("\n"))
  return {
    html: html.length,
    search: index.length,
    concepts: graph.counts.concepts,
    news: graph.counts.news,
    keywords: graph.counts.keywords,
    nodes: graph.nodes.length,
    relations: graph.edges.length,
    rss: feed.items.length,
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log("PASS", await verifySite())
  } catch (e) {
    console.error(e.message)
    process.exitCode = 1
  }
}
