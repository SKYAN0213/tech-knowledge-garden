import { esc, publisher } from "./briefings.mjs"
export function articleTags(a, href) {
  const c = a.classification || {}
  const entries = [
    ["sector", a.sector],
    ["theme", c.theme],
    ["theme", c.secondary_theme],
    ...(c.entities || []).map((v) => ["entity", v]),
  ].filter(([, v]) => v)
  return `<div class="news-labels">${entries.map(([key, v]) => `<a href="${esc(href("News/index") + "?" + new URLSearchParams({ [key]: v }))}">#${esc(v.replaceAll(" ", ""))}</a>`).join("")}${(c.event_tags || []).map((v) => `<span>#${esc(v.replaceAll(" ", ""))}</span>`).join("")}</div>`
}
export function articleCard(a, href) {
  const c = a.classification || {}
  const data = {
    sector: a.sector || "",
    themes: [c.theme, c.secondary_theme].filter(Boolean),
    tags: c.event_tags || [],
    entities: c.entities || [],
    deep: !!a.editorial && a.editorial.kind !== "사건 뉴스",
  }
  return `<article class="news-row" data-news-row data-classification="${esc(JSON.stringify(data))}"><h3><a href="${esc(href("News/" + a.id))}">${esc(a.title)}</a></h3>${a.review?.published_at ? `<time datetime="${a.review.published_at}">발표 ${a.review.published_at.replaceAll("-", ".")}</time>` : ""}${articleTags(a, href)}<p>${esc(a.summary)}</p><div class="news-actions">${a.urls.map((u) => `<a href="${esc(u)}">${esc(publisher(u))} 원문 ↗</a>`).join("")}</div></article>`
}
export function sectorTabs(articles, href) {
  const sectors = [...new Set(articles.map((a) => a.sector).filter(Boolean))]
  const deep = articles.some((a) => a.editorial && a.editorial.kind !== "사건 뉴스")
  if (!sectors.length && !deep) return ""
  return `<nav class="sector-tabs" aria-label="기사 분야"><a href="${esc(href)}" data-sector-tab="" aria-current="page">전체</a>${sectors.map((s) => `<a href="${esc(href + "?" + new URLSearchParams({ sector: s }))}" data-sector-tab="${esc(s)}">${esc(s)}</a>`).join("")}${deep ? `<a href="${esc(href + "?kind=deep")}" data-deep-tab>심층 분석</a>` : ""}</nav>`
}
