import { esc, publisher } from "./briefings.mjs"
import { articleDateLabel } from "./article-review.mjs"

const link = (url, label, attrs = "") =>
  `<a href="${esc(url)}"${attrs ? " " + attrs : ""}>${esc(label)}</a>`
const date = (day) => String(day || "").replaceAll("-", ".")
const sourceLinks = (urls) => {
  const items = urls.map((url, index) => {
    const name = publisher(url)
    const repeated = urls.filter((other) => publisher(other) === name).length > 1
    return link(url, name + (repeated ? ` 원문 ${index + 1} ↗` : " 원문 ↗"))
  })
  return `<div class="news-actions">${items.join(" · ")}</div>`
}
const eventsFor = (model, ids) => model.events.filter((event) => ids.includes(event.event_id))
function assertModel(model) {
  if (model?.schema !== "reader-knowledge/v1") throw Error("Public reader knowledge model required")
}
function tags(event, href) {
  const values = [
    ["sector", event.sector],
    ["theme", event.theme],
    ["theme", event.secondary_theme],
    ...event.entities.map((entity) => ["entity", entity]),
  ].filter(([, value]) => value)
  return `<div class="news-labels">${values.map(([key, value]) => link(href("News/index") + "?" + new URLSearchParams({ [key]: value }), "#" + value.replaceAll(" ", ""))).join("")}${event.tags.map((tag) => `<span>#${esc(tag.replaceAll(" ", ""))}</span>`).join("")}</div>`
}
function eventView(event, href, { heading = 3, hidden = false, weekly = false } = {}) {
  const dates = `${articleDateLabel(event)} ${date(event.published_at)}`
  const additionalDate =
    event.source_published_at && event.source_published_at.slice(0, 10) !== event.published_at
      ? ` · 원문 최초 게시 ${date(event.source_published_at.slice(0, 10))}`
      : ""
  return `<article class="reader-explore-event news-row"${weekly ? ` data-weekly-event data-published-day="${esc(event.published_at)}"` : ""}${hidden ? " hidden" : ""}><h${heading}>${link(event.url || href(event.article_path), event.title)}</h${heading}><div class="article-meta"><time datetime="${esc(event.published_at)}">${esc(dates)}</time>${esc(additionalDate)}${event.occurred_at ? ` · 사건 ${esc(date(event.occurred_at))}` : ""}</div>${tags(event, href)}${event.lead ? `<p>${esc(event.lead)}</p>` : ""}${event.explanations.length ? `<details class="reader-explore-detail"><summary>상세 내용</summary>${event.explanations.map((section) => `<section><h${Math.min(heading + 1, 6)}>${esc(section.heading)}</h${Math.min(heading + 1, 6)}>${section.paragraphs.map((text) => `<p>${esc(text)}</p>`).join("")}</section>`).join("")}</details>` : ""}${sourceLinks(event.source_urls)}</article>`
}

export function knowledgeHubView(model, href) {
  assertModel(model)
  const cards = model.terms
    .map((term) => {
      const text = [
        term.label,
        ...term.aliases,
        ...term.keywords,
        term.definition,
        ...term.sections.map((section) => section.text),
      ].join(" ")
      return `<article class="term-card" data-knowledge-term data-search="${esc(text)}"><h2>${link(term.url || href(term.path), term.label)}</h2><p>${esc(term.definition)}</p>${term.event_ids.length ? `<div class="reader-explore-term-event">${link(eventsFor(model, term.event_ids)[0].url, eventsFor(model, term.event_ids)[0].title)}</div>` : ""}</article>`
    })
    .join("")
  const topics = model.topics.length
    ? `<section class="reader-explore-topics"><h2>누적 주제</h2><div class="topic-grid">${model.topics
        .map(
          (topic) =>
            `<article class="topic-card"><h3>${link(topic.url || href(topic.path), topic.title)}</h3>${topic.summary ? `<p>${esc(topic.summary)}</p>` : ""}<ul>${eventsFor(
              model,
              topic.event_ids,
            )
              .slice(0, 3)
              .map(
                (event) =>
                  `<li><time datetime="${esc(event.published_at)}">${date(event.published_at)}</time> ${link(event.url, event.title)}</li>`,
              )
              .join("")}</ul></article>`,
        )
        .join("")}</div></section>`
    : ""
  return `<section class="reader-workspace reader-explore-workspace"><div class="page-heading"><h1>전문용어와 누적 주제</h1></div>${model.terms.length ? `<form class="reader-explore-controls" data-reader-knowledge-search role="search"><label for="knowledge-query">용어·정의에서 찾기</label><input id="knowledge-query" type="search" name="q" placeholder="용어 · 작동 원리 · 적용 조건" autocomplete="off"><span id="knowledge-count" role="status">${model.terms.length}개</span></form><div class="term-grid" id="knowledge-results">${cards}</div><p id="knowledge-empty" hidden>검색 결과 없음</p>` : ""}${topics}</section>`
}

export function companiesView(model, href, selected = "") {
  assertModel(model)
  const selection = selected || ""
  const visible = model.companies.filter((company) => !selection || selection === company.label)
  const options = model.companies
    .map(
      (company) =>
        `<option value="${esc(company.label)}"${selection === company.label ? " selected" : ""}>${esc(company.label)}</option>`,
    )
    .join("")
  const sections = model.companies
    .map(
      (company) =>
        `<section class="company" data-company-section data-company="${esc(company.label)}"${selection && selection !== company.label ? " hidden" : ""}><h2>${esc(company.label)}</h2><div class="reader-explore-timeline">${eventsFor(
          model,
          company.event_ids,
        )
          .map((event) => eventView(event, href))
          .join("")}</div></section>`,
    )
    .join("")
  return `<section class="reader-workspace reader-explore-workspace"><div class="page-heading"><h1>기업별 소식</h1></div>${model.companies.length ? `<form class="reader-explore-controls"><label for="company-select">기업</label><select id="company-select" name="company"><option value=""${!selection ? " selected" : ""}>전체</option>${options}</select><span id="company-count" role="status">${visible.length}곳</span></form>${sections}<p id="company-empty"${visible.length ? " hidden" : ""}>검색 결과 없음</p>` : ""}</section>`
}

export function weeklyView(model, href, { from, to } = {}) {
  assertModel(model)
  const period = model.periods[0] || { from: "", to: "" }
  const start = from ?? period.from,
    end = to ?? period.to
  const within = (event) =>
    (!start || event.published_at >= start) && (!end || event.published_at <= end)
  const groups = new Map()
  for (const event of model.events) {
    const key = event.sector || "뉴스"
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(event)
  }
  const count = model.events.filter(within).length
  const periods = `<label class="weekly-presets" for="weekly-period">주간 선택<select id="weekly-period"><option value="">직접 선택</option>${model.periods.map((item) => `<option value="${esc(item.from + "/" + item.to)}"${item.from === start && item.to === end ? " selected" : ""}>${date(item.from)} – ${date(item.to)}</option>`).join("")}</select></label>`
  return `<section class="reader-workspace reader-explore-workspace"><div class="page-heading"><h1>기간별 소식</h1></div>${model.events.length ? `<form class="reader-explore-controls weekly-controls">${periods}<label for="weekly-from">발표 시작일<input id="weekly-from" name="from" type="date" value="${esc(start)}"></label><label for="weekly-to">발표 종료일<input id="weekly-to" name="to" type="date" value="${esc(end)}"></label><span id="weekly-count" role="status">${count}건</span></form>${[...groups].map(([sector, events]) => `<section class="weekly-group" data-weekly-group${events.some(within) ? "" : " hidden"}><h2>${esc(sector)}</h2>${events.map((event) => eventView(event, href, { weekly: true, hidden: !within(event) })).join("")}</section>`).join("")}<p id="weekly-empty"${count ? " hidden" : ""}>검색 결과 없음</p>` : ""}</section>`
}

export function termView(model, href, conceptId, { renderedBody } = {}) {
  assertModel(model)
  const term = model.terms.find((item) => item.concept_id === conceptId)
  if (!term) return ""
  const events = eventsFor(model, term.event_ids)
  const body =
    renderedBody !== undefined
      ? renderedBody
      : `<section class="reader-explore-definition"><h1>${esc(term.label)}</h1><p class="definition">${esc(term.definition)}</p>${term.sections.map((section) => `<section><h2>${esc(section.heading)}</h2><p>${esc(section.text)}</p></section>`).join("")}${sourceLinks(term.source_urls)}</section>`
  const relations =
    renderedBody === undefined && term.relations.length
      ? `<section class="reader-explore-relations"><h2>관련 개념</h2><ul>${term.relations.map((relation) => `<li>${link(relation.url || href(relation.path), relation.label)} — ${esc(relation.reason)}</li>`).join("")}</ul></section>`
      : ""
  const history = events.length
    ? `<section class="reader-explore-history"><h2>관련 사건</h2>${events.map((event) => eventView(event, href)).join("")}</section>`
    : ""
  return `<section class="reader-workspace reader-explore-workspace">${body}${relations}${history}</section>`
}
