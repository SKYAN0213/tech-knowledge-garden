import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { toHtml } from "hast-util-to-html"
import { slugifyFilePath } from "@quartz-community/utils"
import { publisher, esc } from "../briefings.mjs"
import { COMPANY_AXES, CONCEPT_AXES } from "./knowledge-explorer.mjs"

const defaultBase = "https://skyan0213.github.io/tech-knowledge-garden"
const unique = (values) => [...new Set(values)]
const parser = unified().use(remarkParse).use(remarkRehype)
const labels = {
  scope: "범위",
  components: "구성 요소",
  mechanism: "작동 원리",
  examples: "실제 예시",
  conditions: "적용 조건",
  distinctions: "관련 개념과의 차이",
}
const validateResult = (result) => {
  if (result?.schema !== "research-knowledge-explorer/v1" || !result.reader || !result.read_only)
    throw Error("A native read-only knowledge explorer result is required")
}
const baseURL = (options) => {
  const base = options.baseURL || defaultBase
  if (!/^https?:\/\//.test(base)) throw Error("A public HTTP base URL is required")
  return base.replace(/\/$/, "")
}
const route = (path, base) => {
  if (/^https?:\/\//.test(path || "")) return path
  if (typeof path !== "string" || !path || path.includes("..") || /^[a-z]+:/i.test(path))
    return null
  return base + "/" + slugifyFilePath(path.replace(/\.md$/, "") + ".md")
}
const a = (href, title) => (href ? `<a href="${esc(href)}">${esc(title)}</a>` : esc(title))
const mdLink = (href, title) =>
  href
    ? `[${String(title).replace(/[\[\]\\]/g, "\\$&")}](${href.replace(/[()\s]/g, (char) => encodeURIComponent(char))})`
    : title
const date = (value) => (value ? String(value).slice(0, 10).replaceAll("-", ".") : "")
function prose(markdown, base) {
  const source = String(markdown || "").replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_, path, label) => mdLink(route(path, base), label || path.split("/").at(-1)),
  )
  const tree = parser.runSync(parser.parse(source))
  function clean(node) {
    if (node.tagName === "a") {
      const href = String(node.properties?.href || "")
      if (!/^https?:\/\//.test(href) && !/^#[A-Za-z0-9_-]+$/.test(href)) delete node.properties.href
    }
    if (node.tagName === "img") {
      node.tagName = "span"
      node.properties = {}
      node.children = []
    }
    for (const child of node.children || []) clean(child)
  }
  clean(tree)
  return toHtml(tree)
}
function metaHTML(event) {
  return `<div class="article-meta"><time datetime="${esc(event.published_at)}">발표 ${date(event.published_at)}</time>${event.reviewed_at ? ` · 검토 ${date(event.reviewed_at)}` : ""}${event.occurred_at ? ` · 사건 ${date(event.occurred_at)}` : ""}</div>`
}
function tagsHTML(event) {
  const tags = unique([event.sector, event.theme, ...(event.tags || [])].filter(Boolean))
  return tags.length
    ? `<div class="news-labels">${tags.map((tag) => `<span>#${esc(tag.replaceAll(" ", ""))}</span>`).join("")}</div>`
    : ""
}
function evidenceHTML(facts) {
  const evidence = [
    ...new Map(
      facts
        .flatMap((fact) => fact.evidence)
        .map((item) => [item.source_url + "|" + item.quote, item]),
    ).values(),
  ]
  if (!evidence.length) return ""
  return `<details class="source-quotes"><summary>원문 인용</summary>${evidence
    .map(
      (item) =>
        `<blockquote><p>${esc(item.quote)}</p><cite>${a(/^https?:\/\//.test(item.source_url) ? item.source_url : null, publisher(item.source_url))}</cite></blockquote>`,
    )
    .join("")}</details>`
}
function sourceLinksHTML(facts) {
  const urls = unique(facts.flatMap((fact) => fact.evidence.map((item) => item.source_url)))
  return `<div class="news-actions">${urls.map((url) => a(/^https?:\/\//.test(url) ? url : null, publisher(url) + " 원문 ↗")).join(" · ")}</div>`
}
function readerParagraphs(event) {
  const paragraphs = event.paragraphs || []
  const covered = new Set(paragraphs.flatMap((paragraph) => paragraph.claim_ids))
  return [
    ...paragraphs.map((paragraph) => paragraph.text),
    ...event.facts
      .filter((fact) => !covered.has(fact.claim_id))
      .map((fact) => fact.display_text || fact.statement),
  ]
}
function eventHTML(event, base, level = 2) {
  const paragraphs = readerParagraphs(event)
  return `<article class="news-row"><h${level}>${a(route(event.article_path, base), event.title)}</h${level}>${metaHTML(event)}${tagsHTML(event)}${paragraphs.map((text) => `<p>${esc(text)}</p>`).join("")}${sourceLinksHTML(event.facts)}${evidenceHTML(event.facts)}</article>`
}
function comparisonHTML(group, base) {
  return `<section class="comparison"><h2>${esc(group.label)}</h2><p class="article-meta">${esc(group.period)} · ${esc(group.scope)} · ${esc(group.conditions.join(" · "))}</p><div class="table-scroll" tabindex="0" role="region" aria-label="${esc(group.label)}"><table><thead><tr><th scope="col">대상</th><th scope="col">${esc(group.metric)}</th><th scope="col">발표일</th><th scope="col">근거</th></tr></thead><tbody>${group.items
    .map(
      (item) =>
        `<tr><th scope="row">${esc(item.label)}</th><td>${esc(item.measure.literal)} ${esc(item.measure.unit)}</td><td>${date(item.published_at)}</td><td>${a(route(item.article_path, base), item.title)}</td></tr>`,
    )
    .join("")}</tbody></table></div>${evidenceHTML(group.items.map((item) => item.fact))}</section>`
}

export function renderKnowledgeExplorerHTML(result, options = {}) {
  validateResult(result)
  const base = baseURL(options),
    r = result.reader
  let body = ""
  if (result.mode === "search")
    body = (r.items || []).map((event) => eventHTML(event, base)).join("")
  else if (result.mode === "concept") {
    const def = r.definition
    const navigation = [
      ["definition", "정의"],
      ...Object.entries(labels)
        .filter(([key]) => def[key])
        .map(([key, title]) => [key, title]),
      ...(r.events?.length ? [["events", "관련 사건"]] : []),
    ]
    body = `<nav class="reading-tabs" aria-label="용어 내용">${navigation.map(([id, title]) => `<a href="#${id}">${title}</a>`).join("")}</nav><section id="definition"><div class="definition">${prose(def.definition, base)}</div><p class="article-meta">검토 ${date(def.reviewed_at)}${def.concept_path ? ` · ${a(route(def.concept_path, base), "용어 페이지")}` : ""}</p></section>`
    body += Object.entries(labels)
      .filter(([key]) => def[key])
      .map(
        ([key, title]) =>
          `<section id="${key}"><h2>${title}</h2>${prose(def[key], base)}</section>`,
      )
      .join("")
    if (r.learning?.length)
      body += `<section><h2>방법과 검증</h2>${r.learning.map((cell) => `<h3>${CONCEPT_AXES[cell.axis]}</h3><p>${esc(cell.display_text || cell.fact.display_text || cell.fact.statement)}</p>${metaHTML(cell)}${sourceLinksHTML(cell.facts || [cell.fact])}`).join("")}</section>`
    body += (r.comparisons || []).map((group) => comparisonHTML(group, base)).join("")
    if (r.related?.length)
      body += `<section><h2>관련 개념</h2><ul>${r.related.map((item) => `<li>${a(route(item.concept_path, base), item.label)} — ${esc(item.reason)}</li>`).join("")}</ul></section>`
    if (r.events?.length)
      body += `<section id="events"><h2>관련 사건</h2>${r.events.map((event) => eventHTML(event, base, 3)).join("")}</section>`
  } else if (result.mode === "weekly") {
    body = (r.groups || [])
      .map(
        (group) =>
          `<section class="weekly-group"><h2>${a(route(group.topic_path || group.concept_path, base), group.title)}</h2>${(group.observations || []).map((item) => `<p class="observation">${a(route(item.article_path, base), item.change)}</p>`).join("")}${group.facts.map((fact) => `<article class="weekly-fact"><p>${esc(fact.display_text || fact.statement)}</p><div class="article-meta">${fact.events.map((event) => `${date(event.published_at)} · ${a(route(event.article_path, base), event.title)}`).join("<br>")}</div>${sourceLinksHTML([fact])}${evidenceHTML([fact])}</article>`).join("")}${(group.additional_articles || []).length ? `<ul class="additional-articles">${group.additional_articles.map((event) => `<li>${a(route(event.article_path, base), event.title)}</li>`).join("")}</ul>` : ""}</section>`,
      )
      .join("")
  } else {
    body = r.companies?.length
      ? `<nav class="reading-tabs" aria-label="로봇 제조사">${r.companies.map((company) => `<a href="#${esc(company.company_id)}">${esc(company.label)}</a>`).join("")}</nav>`
      : ""
    body += (r.comparisons || []).map((group) => comparisonHTML(group, base)).join("")
    body += (r.companies || [])
      .map((company) => {
        const assigned = new Set(
          (company.axes || []).flatMap((axis) => axis.items.map((item) => item.event_id)),
        )
        return `<section id="${esc(company.company_id)}" class="company"><h2>${esc(company.label)}</h2>${(company.axes || []).map((axis) => `<section><h3>${esc(axis.label)}</h3>${axis.items.map((cell) => `<article><p>${esc(cell.display_text || cell.fact.display_text || cell.fact.statement)}</p>${metaHTML(cell)}<p>${a(route(cell.article_path, base), cell.title)}</p>${sourceLinksHTML(cell.facts || [cell.fact])}${evidenceHTML(cell.facts || [cell.fact])}</article>`).join("")}</section>`).join("")}${company.events
          .filter((event) => !assigned.has(event.event_id))
          .map((event) => eventHTML(event, base, 3))
          .join("")}</section>`
      })
      .join("")
  }
  const content = `<main id="content" class="knowledge-explorer"><h1>${esc(r.title)}</h1>${body}</main>`
  if (options.fullDocument === false) return content
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(r.title)} · Tech Knowledge</title><style>${knowledgeExplorerCSS}</style></head><body><a class="skip" href="#content">본문으로 이동</a>${content}</body></html>`
}

const evidenceMD = (facts) => {
  const evidence = [
    ...new Map(
      facts
        .flatMap((fact) => fact.evidence)
        .map((item) => [item.source_url + "|" + item.quote, item]),
    ).values(),
  ]
  return evidence
    .map(
      (item) =>
        `> ${item.quote.replaceAll("\n", "\n> ")}\n>\n> ${mdLink(item.source_url, publisher(item.source_url) + " 원문")}`,
    )
    .join("\n\n")
}
function eventMD(event, base, level = 2) {
  const meta = `발표 ${date(event.published_at)}${event.reviewed_at ? ` · 검토 ${date(event.reviewed_at)}` : ""}${event.occurred_at ? ` · 사건 ${date(event.occurred_at)}` : ""}`
  return `${"#".repeat(level)} ${mdLink(route(event.article_path, base), event.title)}\n\n${meta}\n\n${unique(
    [event.sector, event.theme, ...(event.tags || [])].filter(Boolean),
  )
    .map((tag) => "#" + tag.replaceAll(" ", ""))
    .join(" ")}\n\n${readerParagraphs(event).join("\n\n")}\n\n${evidenceMD(event.facts)}`
}
function comparisonMD(group, base) {
  const cell = (value) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ")
  return `## ${group.label}\n\n${group.period} · ${group.scope} · ${group.conditions.join(" · ")}\n\n| 대상 | ${cell(group.metric)} | 발표일 | 근거 |\n| --- | --- | --- | --- |\n${group.items.map((item) => `| ${cell(item.label)} | ${cell(item.measure.literal)} ${cell(item.measure.unit)} | ${date(item.published_at)} | ${cell(mdLink(route(item.article_path, base), item.title))} |`).join("\n")}\n\n${evidenceMD(group.items.map((item) => item.fact))}`
}
export function renderKnowledgeExplorerMarkdown(result, options = {}) {
  validateResult(result)
  const base = baseURL(options),
    r = result.reader
  const parts = [`# ${r.title}`]
  if (result.mode === "search") parts.push(...(r.items || []).map((event) => eventMD(event, base)))
  else if (result.mode === "concept") {
    parts.push(
      r.definition.definition,
      `검토 ${date(r.definition.reviewed_at)}${r.definition.concept_path ? ` · ${mdLink(route(r.definition.concept_path, base), "용어 페이지")}` : ""}`,
    )
    for (const [key, title] of Object.entries(labels))
      if (r.definition[key]) parts.push(`## ${title}\n\n${r.definition[key]}`)
    if (r.related?.length)
      parts.push(
        `## 관련 개념\n\n${r.related.map((item) => `- ${mdLink(route(item.concept_path, base), item.label)} — ${item.reason}`).join("\n")}`,
      )
    if (r.learning?.length)
      parts.push(
        `## 방법과 검증\n\n${r.learning.map((item) => `### ${CONCEPT_AXES[item.axis]}\n\n${item.display_text || item.fact.display_text || item.fact.statement}\n\n${mdLink(route(item.article_path, base), item.title)}\n\n${evidenceMD(item.facts || [item.fact])}`).join("\n\n")}`,
      )
    parts.push(...(r.comparisons || []).map((group) => comparisonMD(group, base)))
    if (r.events?.length)
      parts.push(`## 관련 사건`, ...r.events.map((event) => eventMD(event, base, 3)))
  } else if (result.mode === "weekly") {
    for (const group of r.groups || [])
      parts.push(
        `## ${mdLink(route(group.topic_path || group.concept_path, base), group.title)}\n\n${(group.observations || []).map((item) => mdLink(route(item.article_path, base), item.change)).join("\n\n")}\n\n${group.facts.map((fact) => `${fact.display_text || fact.statement}\n\n${fact.events.map((event) => `${date(event.published_at)} · ${mdLink(route(event.article_path, base), event.title)}`).join("\n")}\n\n${evidenceMD([fact])}`).join("\n\n")}${group.additional_articles?.length ? `\n\n${group.additional_articles.map((event) => `- ${mdLink(route(event.article_path, base), event.title)}`).join("\n")}` : ""}`,
      )
  } else {
    parts.push(...(r.comparisons || []).map((group) => comparisonMD(group, base)))
    for (const company of r.companies || []) {
      parts.push(`## ${company.label}`)
      const assigned = new Set(
        (company.axes || []).flatMap((axis) => axis.items.map((item) => item.event_id)),
      )
      for (const axis of company.axes || [])
        parts.push(
          `### ${COMPANY_AXES[axis.id]}\n\n${axis.items.map((item) => `${item.display_text || item.fact.display_text || item.fact.statement}\n\n발표 ${date(item.published_at)} · 검토 ${date(item.reviewed_at)} · ${mdLink(route(item.article_path, base), item.title)}\n\n${evidenceMD(item.facts || [item.fact])}`).join("\n\n")}`,
        )
      parts.push(
        ...company.events
          .filter((event) => !assigned.has(event.event_id))
          .map((event) => eventMD(event, base, 3)),
      )
    }
  }
  return parts.filter(Boolean).join("\n\n").trim() + "\n"
}

export const knowledgeExplorerCSS = `
:root{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;color:#202522;background:#fff;line-height:1.8;font-synthesis:none}
*{box-sizing:border-box}body{margin:0}main{max-width:900px;margin:auto;padding:44px 28px 100px}h1,h2,h3{line-height:1.45;word-break:keep-all;overflow-wrap:anywhere}h1{font-size:clamp(1.7rem,3vw,2.25rem);letter-spacing:-.045em;margin:12px 0 36px}h2{font-size:1.3rem;margin:38px 0 14px}h3{font-size:1.1rem;margin:22px 0 12px}p{margin:12px 0 20px;word-break:keep-all;overflow-wrap:anywhere}a{color:#246854;text-decoration:none;overflow-wrap:anywhere}a:hover{text-decoration:underline;text-underline-offset:4px}a:focus-visible,summary:focus-visible,.table-scroll:focus-visible{outline:2px solid #246854;outline-offset:4px}article{padding:14px 0 28px;border-bottom:1px solid #e5e9e6}.article-meta{font-size:13px;color:#58655e;margin:8px 0}.news-labels{display:flex;flex-wrap:wrap;gap:6px;margin:13px 0}.news-labels span{font-size:12px;background:#f3f6f4;border:1px solid #e1e7e3;border-radius:4px;padding:2px 8px;color:#3f5b4b}.news-actions{font-size:13px;margin:12px 0}.reading-tabs{display:flex;gap:8px;overflow-x:auto;padding:0 0 14px;margin-bottom:28px;scroll-margin-top:12px}.reading-tabs a{white-space:nowrap;border-bottom:1px solid #bfcfc5;padding:8px 10px;min-height:44px}.definition{border-left:3px solid #246854;padding-left:20px;font-size:1.12rem}.source-quotes{margin:14px 0}.source-quotes summary{cursor:pointer;color:#58655e;font-size:13px;min-height:32px}blockquote{margin:14px 0;padding:0 0 0 18px;border-left:2px solid #dce5df;color:#56605a;font-size:14px}blockquote p{white-space:pre-wrap;word-break:normal}cite{font-style:normal;font-size:12px}.table-scroll{overflow:auto;border:1px solid #e5e9e6}table{border-collapse:collapse;width:100%;min-width:580px;font-size:14px}th,td{text-align:left;padding:12px 14px;border-bottom:1px solid #e5e9e6;vertical-align:top}th{font-weight:600;background:#f6f8f6}.company,.weekly-group{margin-top:40px;scroll-margin-top:20px}.observation{font-weight:600}.skip{position:absolute;left:-9999px}.skip:focus{left:12px;top:12px;background:#fff;padding:10px;z-index:2}@media(max-width:600px){main{padding:24px 18px 70px}.definition{padding-left:14px}.news-row p{font-size:15px}.reading-tabs{margin-bottom:20px}.company{margin-top:30px}}`
