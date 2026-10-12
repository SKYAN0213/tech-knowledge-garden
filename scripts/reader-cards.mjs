import { esc, publisher } from "./briefings.mjs"
import { explanationHTML } from "./explanations.mjs"
import { hasDeepAnalysis } from "./editorial.mjs"
import { articleDateLabel } from "./article-review.mjs"
export const sourceLinkLabel = (url, index, sources) => {
  const name = publisher(url)
  const repeated = sources.filter((source) => publisher(source) === name).length > 1
  return `${name} 원문${repeated ? ` ${index + 1}` : ""} ↗`
}
export function articleTags(a, href, { limit } = {}) {
  const c = a.classification || {}
  const entries = [
    ["sector", a.sector],
    ["theme", c.theme],
    ["theme", c.secondary_theme],
    ...(c.entities || []).map((v) => ["entity", v]),
  ].filter(([, v]) => v)
  const labels = [
    ...entries.map(
      ([key, v]) =>
        `<a href="${esc(href("News/index") + "?" + new URLSearchParams({ [key]: v }))}">#${esc(v.replaceAll(" ", ""))}</a>`,
    ),
    ...(c.event_tags || []).map((v) => `<span>#${esc(v.replaceAll(" ", ""))}</span>`),
    ...(a.conceptLinks || []).map(
      (k) => `<a href="${esc(href(k.path))}">#${esc(k.label.replaceAll(" ", ""))}</a>`,
    ),
  ]
  const visible = Number.isSafeInteger(limit) && limit > 0 ? labels.slice(0, limit) : labels
  return visible.length ? `<div class="news-labels">${visible.join("")}</div>` : ""
}

// A bounded editorial preview links to the complete article. It never replaces
// the news/filter rows or truncates a source sentence into a different claim.
export function articlePreview(a, href, { featured = false, compact = false } = {}) {
  const kind = featured ? " home-story-featured" : compact ? " home-story-compact" : ""
  return `<article class="home-story${kind}" data-home-story="${esc(a.id)}"><h3 class="home-story-title"><a href="${esc(href("News/" + a.id))}">${esc(a.title)}</a></h3>${a.review?.published_at ? `<time class="home-story-date" datetime="${esc(a.review.published_at)}">${articleDateLabel(a.review)} ${esc(a.review.published_at.slice(0, 10).replaceAll("-", "."))}</time>` : ""}${articleTags(a, href, { limit: compact ? 2 : 4 })}${a.summary && !compact ? `<p class="home-story-summary">${esc(a.summary)}</p>` : ""}<div class="home-story-links">${(a.urls || []).map((url, index) => `<a href="${esc(url)}">${esc(sourceLinkLabel(url, index, a.urls))}</a>`).join("")}</div></article>`
}
export function articleCard(a, href, expanded = false) {
  const c = a.classification || {}
  const data = {
    sector: a.sector || "",
    themes: [c.theme, c.secondary_theme].filter(Boolean),
    tags: c.event_tags || [],
    entities: c.entities || [],
    deep: hasDeepAnalysis(a),
  }
  return `<article class="news-row" data-news-row data-classification="${esc(JSON.stringify(data))}"><h3><a href="${esc(href("News/" + a.id))}">${esc(a.title)}</a></h3>${a.review?.published_at ? `<time datetime="${a.review.published_at}">${articleDateLabel(a.review)} ${a.review.published_at.replaceAll("-", ".")}</time>` : ""}${articleTags(a, href)}<p>${esc(a.summary)}</p>${expanded ? explanationHTML(a) : ""}<div class="news-actions">${a.urls.map((u, i) => `<a href="${esc(u)}">${esc(sourceLinkLabel(u, i, a.urls))}</a>`).join("")}</div></article>`
}
export function sectorTabs(articles, href) {
  const sectors = [...new Set(articles.map((a) => a.sector).filter(Boolean))]
  const deep = articles.some(hasDeepAnalysis)
  if (!sectors.length && !deep) return ""
  return `<nav class="sector-tabs" aria-label="기사 분야"><a href="${esc(href)}" data-sector-tab="" aria-current="page">전체</a>${sectors.map((s) => `<a href="${esc(href + "?" + new URLSearchParams({ sector: s }))}" data-sector-tab="${esc(s)}">${esc(s)}</a>`).join("")}${deep ? `<a href="${esc(href + "?kind=deep")}" data-deep-tab>심층 분석</a>` : ""}</nav>`
}
