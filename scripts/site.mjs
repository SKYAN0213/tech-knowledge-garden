import fs from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { fromHtml } from "hast-util-from-html"
import { toHtml } from "hast-util-to-html"
import { slugifyFilePath } from "@quartz-community/utils"
import { slug as headingSlug } from "github-slugger"
import { build } from "esbuild"
import YAML from "yaml"
import { walk, parseNote, noteText, editions, extractArticles, sections } from "./garden.mjs"
import { resolveFocus, relatedNews } from "../web/graph-model.mjs"
import { briefingLibrary, publisher } from "./briefings.mjs"
import { newsView, briefingHub, issueView } from "./reader-views.mjs"
import { coverageDate } from "./time.mjs"

export const MAP = "Knowledge Maps/AI Technology Knowledge Map"
const staging = ".local/site-content"
export const slug = (p) => slugifyFilePath(p.replace(/\.md$/, "") + ".md")
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  )
const write = (p, s) => {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, s)
}
export { makeResolver, projectLinks } from "./links.mjs"
import { makeResolver, projectLinks } from "./links.mjs"
export function prepare(vault = "vault", target = staging) {
  const notes = walk(vault)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({
      path: path.relative(vault, f).replace(/\.md$/, ""),
      ...parseNote(fs.readFileSync(f, "utf8")),
    }))
  const selected = notes.filter(
    (n) =>
      n.path === "index" ||
      /^(News|Briefings)\//.test(n.path) ||
      n.meta.entry_type === "concept" ||
      n.path === MAP,
  )
  const allowed = new Set(selected.map((n) => n.path))
  const resolve = makeResolver(notes)
  fs.rmSync(target, { recursive: true, force: true })
  fs.mkdirSync(target, { recursive: true })
  for (const n of selected) {
    let body = n.body
    if (n.path === MAP) body = '# 지식 지도\n\n<div id="knowledge-map"></div>'
    // Convert Obsidian block IDs to explicit HTML IDs so both platforms keep the same target.
    body = body.replace(/\s+\^([\w-]+)\s*$/gm, (_, id) => ` <span id="block-${id}"></span>`)
    body = projectLinks(body, n.path, resolve, allowed).replace(
      /\[\[([^\]|]+)#\^([^\]|]+)(\|[^\]]+)?\]\]/g,
      "[[$1#block-$2$3]]",
    )
    const meta = { ...n.meta, aliases: [], cssclasses: [] }
    if (n.meta.entry_type === "concept")
      meta.title = n.meta.label || n.meta.aliases?.find((a) => /[가-힣]/.test(a)) || n.meta.title
    if (n.path === MAP) meta.title = "연결 지도"
    write(path.join(target, n.path + ".md"), noteText(meta, body))
  }
  write(
    ".local/site-notes.json",
    JSON.stringify(selected.map((n) => ({ path: n.path, slug: slug(n.path), meta: n.meta }))),
  )
  console.log(
    `Projected ${selected.length} reader pages; source editions, archives and folders excluded.`,
  )
}
const find = (node, match) =>
  match(node) ? node : (node.children || []).map((c) => find(c, match)).find(Boolean)
const textContent = (n) =>
  n.type === "text" ? n.value : (n.children || []).map(textContent).join("")
const traverse = (n, fn) => {
  fn(n)
  for (const c of n.children || []) traverse(c, fn)
}
export async function finish(output = "public", input = staging) {
  const conf = YAML.parse(fs.readFileSync("quartz.config.yaml", "utf8")).configuration
  const base = "https://" + conf.baseUrl.replace(/\/$/, "")
  const prefix = new URL(base).pathname.replace(/\/$/, "")
  const href = (p) => prefix + "/" + (p === "index" ? "" : slug(p))
  const notes = JSON.parse(fs.readFileSync(".local/site-notes.json"))
  const allIssues = editions("vault")
  const issueArticles = new Map(allIssues.map((i) => [i.slug, extractArticles(i)]))
  const library = briefingLibrary("vault", allIssues, issueArticles)
  const newsArticles = [
    ...new Map([...issueArticles.values()].flat().map((a) => [a.id, a])).values(),
  ]
  const knowledge = notes.filter((n) => n.meta.entry_type === "concept")
  const graph = JSON.parse(fs.readFileSync(path.join(output, "knowledge-graph.json")))
  const learningTerms = new Set(graph.nodes.map((n) => n.id))
  const bySlug = new Map(notes.map((n) => [n.slug, n]))
  const rows = []
  const assets = createHash("sha256")
    .update(
      walk("web")
        .sort()
        .map((f) => fs.readFileSync(f, "utf8"))
        .join(""),
    )
    .update(fs.readFileSync("package-lock.json"))
    .digest("hex")
    .slice(0, 12)
  const embed = (focus = "", className = "article-connections") =>
    `<section class="${className}"><h2><a href="${href(MAP)}${focus ? "?focus=" + encodeURIComponent(focus) : ""}">연결 지도</a></h2><div class="connections compact" data-connections data-mode="compact" data-focus="${esc(focus)}"><p class="graph-loading">연결 지도를 불러오는 중…</p></div></section>`
  const shell = (title, body, kind = "article", description = "") =>
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="alternate" type="application/rss+xml" title="아침 브리핑" href="${base}/briefing.xml"><link rel="stylesheet" href="${prefix}/reader.css?v=${assets}"><script type="module" src="${prefix}/reader.js?v=${assets}"></script></head><body data-base="${prefix}" data-assets="${assets}" class="page-${kind}"><a class="skip" href="#main">본문으로</a><header class="site-header"><nav aria-label="주요 메뉴"><a href="${href("index")}" ${["home", "news", "news-index"].includes(kind) ? 'aria-current="page"' : ""}>뉴스</a><a href="${href("Briefings/index")}" ${kind.startsWith("briefing-") ? 'aria-current="page"' : ""}>브리핑</a><a href="${href(MAP)}" ${kind === "map-page" ? 'aria-current="page"' : ""}>연결 지도</a></nav><div class="utilities"><button id="search-open" aria-label="검색">검색</button><a href="${prefix}/rss">RSS</a></div></header><main id="main" class="${kind}">${body}</main><dialog id="search-dialog"><form method="dialog"><button aria-label="검색 닫기">닫기</button></form><label for="site-search">검색</label><input id="site-search" type="search" placeholder="뉴스 · 브리핑 · 키워드" autocomplete="off"><div id="search-results" aria-live="polite"></div></dialog></body></html>`
  for (const n of notes) {
    const file = path.join(output, n.slug + ".html")
    const tree = fromHtml(fs.readFileSync(file, "utf8"))
    const article = find(tree, (x) => x.tagName === "article")
    if (!article) throw Error("Missing article " + file)
    // Keep Quartz's Obsidian rendering, discard its folder-oriented application chrome.
    traverse(article, (node) => {
      if (node.tagName === "a") {
        const props = node.properties || {},
          link = String(props.href || "")
        if (props.className?.includes("internal") || /^(\.\.?\/|#)/.test(link)) {
          const u = new URL(link, base + "/" + n.slug)
          props.href = u.pathname + u.search + u.hash
        }
      }
      if (node.children)
        node.children = node.children.filter(
          (c) =>
            !(
              c.tagName === "a" &&
              (c.properties?.className?.includes("anchor") ||
                (/^h[1-6]$/.test(node.tagName || "") && !textContent(c).trim()))
            ),
        )
    })
    // Generated notes carry an H1 for Obsidian. All web pages receive exactly one reading title.
    traverse(article, (node) => {
      if (n.meta.type === "news" && node.tagName === "h3") node.tagName = "h2"
      if (node.children)
        node.children = node.children.flatMap((c) =>
          c.tagName !== "h1"
            ? [c]
            : c.properties?.id
              ? [
                  {
                    type: "element",
                    tagName: "span",
                    properties: { id: c.properties.id },
                    children: [],
                  },
                ]
              : [],
        )
    })
    const meta = parseNote(fs.readFileSync(path.join(input, n.path + ".md"), "utf8")).meta
    const issue = library.byKey.get(n.meta.edition)
    if (issue && issue.original.meta.schema_version === "tech-ai-magazine/v2") {
      // The compact overview and disclosure below use exactly the same reviewed observations.
      const children = (
        find(article, (x) => x.properties?.className?.includes("markdown-rendered")) || article
      ).children
      const firstQuote = children.findIndex((c) => c.tagName === "blockquote")
      const firstHeading = children.findIndex((c) => c.tagName === "h2")
      if (firstQuote >= 0 && (firstHeading < 0 || firstQuote < firstHeading))
        children.splice(firstQuote, 1)
      const changes = children.findIndex(
        (c) => c.tagName === "h2" && textContent(c) === "오늘의 변화",
      )
      if (changes >= 0) {
        let end = changes + 1
        while (end < children.length && children[end].tagName !== "h2") end++
        children.splice(changes, end - changes)
      }
      const headlines = children.findIndex(
        (c) => c.tagName === "h2" && textContent(c) === "헤드라인",
      )
      if (headlines >= 0 && issue.snapshot.review) {
        let end = headlines + 1
        while (end < children.length && children[end].tagName !== "h2") end++
        const section = children.splice(headlines, end - headlines)
        children.splice(headlines, 0, {
          type: "element",
          tagName: "details",
          properties: { className: ["headline-details"] },
          children: [
            {
              type: "element",
              tagName: "summary",
              properties: { id: section[0].properties?.id },
              children: [{ type: "text", value: `헤드라인 ${issue.items.length}건 읽기` }],
            },
            ...section.slice(1),
          ],
        })
      }
    }
    let body = toHtml(article)
    const type =
      n.path === "Briefings/index"
        ? "briefing-hub"
        : n.path === "News/index"
          ? "news-index"
          : n.meta.type || "article"
    const isConcept = n.meta.entry_type === "concept"
    const focus = resolveFocus(graph, isConcept ? n.meta.concept_id : "news:" + n.meta.event_id)
    const date = n.meta.coverage_end
      ? coverageDate(n.meta.coverage_end)
          .toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })
          .slice(0, 16)
      : n.meta.date || n.meta.updated || ""
    const links =
      isConcept && focus
        ? `<a href="${href(MAP)}?focus=${encodeURIComponent(focus)}">연결 지도</a>`
        : ""
    if (n.path === MAP)
      body = `<section id="knowledge-map" class="connections" data-connections data-mode="full" aria-label="전문 용어 연결 지도"><p class="graph-loading">연결 지도를 불러오는 중…</p></section><noscript><ul>${knowledge
        .filter((k) => learningTerms.has(k.meta.concept_id))
        .map((k) => `<li><a href="${href(k.path)}">${esc(k.meta.label || k.meta.title)}</a></li>`)
        .join("")}</ul></noscript>`
    body = `${n.path === "index" ? "" : `<div class="article-meta">${esc(date)}${links ? " · " + links : ""}</div><h1>${esc(meta.title)}</h1>`}${body}`
    if (isConcept) {
      const matchingArticles = new Set(
        focus
          ? relatedNews(graph, focus)
              .filter((a) => a.distance === 1)
              .map((a) => a.slug)
          : [],
      )
      const related = notes
        .filter(
          (x) =>
            x.meta.type === "news" &&
            (matchingArticles.has(x.slug) || (x.meta.concepts || []).includes(n.path)),
        )
        .sort((a, b) => String(b.meta.date).localeCompare(String(a.meta.date)))
        .slice(0, 8)
      if (related.length)
        body += `<section class="related-news"><h2>관련 뉴스</h2>${related.map((x) => `<p><time>${esc(x.meta.date)}</time><a href="${href(x.path)}">${esc(x.meta.title)}</a></p>`).join("")}</section>`
    }
    if (n.path === "index" || n.path === "News/index")
      body = newsView(newsArticles, library.latest, href)
    else if (n.path === "Briefings/index") body = briefingHub(library, href, prefix)
    else if (issue) body = issueView(issue, href, prefix, toHtml(article))
    else if (type === "news")
      body = `<div class="article-meta"><a href="${href("index")}">← 뉴스</a> · <time>${esc(date)}</time> · ${esc(publisher(n.meta.source_url))}</div><h1>${esc(meta.title)}</h1><div class="article-source-links">${n.meta.sources.map((u, j) => `<a href="${esc(u)}">${esc(publisher(u))} 원문${j ? " " + (j + 1) : ""} ↗</a>`).join("")}</div>${toHtml(article)}`
    else if (isConcept && focus) body += embed(focus)
    const html = shell(
      meta.title,
      body,
      n.path === MAP ? "map-page" : isConcept ? "knowledge" : type,
      meta.description || "",
    )
    write(file, html)
    rows.push({
      slug: n.slug,
      url: href(n.path),
      title: meta.title,
      type: isConcept ? "지식" : ["news", "news-index", "home"].includes(type) ? "뉴스" : "브리핑",
      date,
      keywords: n.meta.keywords || [],
      aliases: n.meta.aliases || [],
      ...(n.meta.theme_format
        ? {
            sector: n.meta.sector,
            theme: n.meta.theme,
            secondary_theme: n.meta.secondary_theme,
            event_tags: n.meta.event_tags,
            entities: n.meta.entities,
          }
        : {}),
      text: textContent(fromHtml(body, { fragment: true })).slice(0, 16000),
    })
  }
  const issues = editions("vault")
    .toReversed()
    .filter((i) => i.meta.coverage_end)
    .slice(0, 10)
  write(
    path.join(output, "rss.html"),
    shell(
      "브리핑 RSS",
      `<h1>브리핑 RSS</h1><label for="feed-url">구독 주소</label><div class="feed-url"><input id="feed-url" readonly value="${base}/briefing.xml"><button id="copy-feed">주소 복사</button></div><p id="copy-status" role="status"></p><p><a data-router-ignore="true" href="${base}/briefing.xml">XML 피드 열기</a> · <a download="briefing.xml" href="${prefix}/briefing.xml">다운로드</a></p><h2>최근 브리핑</h2><ul>${issues.map((i) => `<li><a href="${href(i.slug.replace(/^Editions\//, "Briefings/"))}">${esc(i.meta.date)} 아침 브리핑</a></li>`).join("")}</ul>`,
      "rss-page",
    ),
  )
  write(
    path.join(output, "404.html"),
    shell(
      "페이지를 찾을 수 없습니다",
      `<h1>페이지를 찾을 수 없습니다</h1><a href="${href("index")}">뉴스</a>`,
    ),
  )
  const keep = new Set([...notes.map((n) => n.slug + ".html"), "rss.html", "404.html"])
  for (const f of walk(output).filter((f) => f.endsWith(".html")))
    if (!keep.has(path.relative(output, f))) fs.unlinkSync(f)
  write(path.join(output, "reader-index.json"), JSON.stringify(rows))
  // Search data is limited to the same reader projection, not raw vault content.
  write(
    path.join(output, "static/contentIndex.json"),
    JSON.stringify(Object.fromEntries(rows.map((r) => [r.slug, r]))),
  )
  fs.copyFileSync("web/reader.css", path.join(output, "reader.css"))
  await build({
    entryPoints: ["web/reader.mjs"],
    bundle: true,
    format: "esm",
    outdir: output,
    splitting: true,
    chunkNames: "chunks/[name]-[hash]",
    minify: true,
  })
  await build({
    entryPoints: ["web/layout.worker.mjs"],
    bundle: true,
    format: "esm",
    outfile: path.join(output, "map-layout.worker.js"),
    minify: true,
  })
  console.log(`Rendered ${notes.length} information-first pages.`)
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "prepare") prepare()
  else if (process.argv[2] === "finish") await finish()
  else throw Error("Use prepare|finish")
}
