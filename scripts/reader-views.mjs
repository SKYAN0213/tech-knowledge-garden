import { articleCard, articlePreview, sectorTabs, moreNewsButton } from "./reader-cards.mjs"
import { sections } from "./garden.mjs"
import { markdownProseText } from "./explanations.mjs"
import { topArticles } from "./editorial.mjs"
import {
  esc,
  plain,
  publisher,
  briefPath,
  topicPath,
  githubIssue,
  GITHUB,
  reviewText,
} from "./briefings.mjs"
import { stanceLabel } from "./trends.mjs"
import { THEMES } from "./themes.mjs"
import { SECTORS, sectorGroups } from "./sectors.mjs"
import { articleDateLabel } from "./article-review.mjs"
import { groupNewsDates, newsArticleDates, newsToday } from "../web/news-chronology.mjs"

const link = (url, label, attrs = "") => `<a href="${esc(url)}" ${attrs}>${esc(label)}</a>`
const dateLabel = (date) => date.replaceAll("-", ".")
const announcementDate = (a) =>
  a.review?.published_at
    ? `<small class="announcement-date">${articleDateLabel(a.review)} <time datetime="${esc(a.review.published_at)}">${dateLabel(a.review.published_at)}</time></small>`
    : ""
export const publicationLinks = (i, href, base) =>
  `<div class="publication-links">${link(href(briefPath(i.key)), "브리핑 읽기 →")} ${link(githubIssue(i.key), "GitHub 정리")}</div>`

export function primaryNavigation(href, kind, mapPath) {
  const entries = [
    [
      "index",
      "브리핑",
      kind === "home" || ["briefing-hub", "briefing-issue", "briefing-topic"].includes(kind),
    ],
    ["News/index", "뉴스", ["news", "news-index"].includes(kind)],
    ["Knowledge/index", "지식", ["knowledge", "knowledge-hub"].includes(kind)],
    ["Companies/index", "기업", kind === "companies"],
    ["Briefings/weekly", "기간별 소식", kind === "briefing-weekly"],
    [mapPath, "연결 지도", kind === "map-page"],
  ]
  return `<nav class="rail-nav" aria-label="주요 메뉴">${entries.map(([path, label, selected]) => link(href(path), label, selected ? 'aria-current="page"' : "")).join("")}</nav>`
}

const distinctArticles = (items) =>
  [
    ...new Map(
      items.filter((article) => article?.id).map((article) => [article.id, article]),
    ).values(),
  ].filter((article) => article.review?.review_status === "verified")
const newestArticle = (a, b) =>
  String(b.review.published_at).localeCompare(String(a.review.published_at)) ||
  a.id.localeCompare(b.id)

export function homeView(articles, library, href, base, { knowledge = [], topics } = {}) {
  const latest = library.latest
  const current = library.current || latest?.snapshot || {}
  const selected = latest
    ? distinctArticles(topArticles({ ...latest, original: latest.original || { meta: {} } }))
    : []
  const currentItems = distinctArticles(latest?.items || [])
  const highlights = selected.length ? selected.slice(0, 5) : currentItems.slice(0, 5)
  const seen = new Set(highlights.map((article) => article.id))
  const recent = distinctArticles(articles).sort(newestArticle)
  const sectorSections = SECTORS.flatMap((sector) => {
    const items = recent
      .filter((article) => article.sector === sector && !seen.has(article.id))
      .slice(0, 2)
    if (!items.length) return []
    items.forEach((article) => seen.add(article.id))
    const url = href("News/index") + "?" + new URLSearchParams({ sector })
    return [{ sector, url, items }]
  })
  const involvedTerms = new Set(
    currentItems.flatMap((article) => article.review?.concept_ids || []),
  )
  const terms = knowledge
    .filter(
      (note) =>
        note?.path &&
        note.meta?.entry_type === "concept" &&
        note.meta.map_review?.decision === "include" &&
        note.meta.verified_sources?.length,
    )
    .map((note) => ({
      ...note,
      definition: note.body
        ? plain(
            markdownProseText(
              sections(note.body, 2)
                .find((section) => section.title === "한 문장 정의")
                ?.body.split("\n\n")[0] || "",
            ).replace(/\[[^\]]+\]\(https?:[^)]+\)/g, ""),
          ).replace(/[\s·]+$/, "")
        : "",
    }))
    .sort(
      (a, b) =>
        Number(involvedTerms.has(b.meta.concept_id)) -
          Number(involvedTerms.has(a.meta.concept_id)) ||
        String(b.meta.last_reviewed || "").localeCompare(String(a.meta.last_reviewed || "")) ||
        a.path.localeCompare(b.path),
    )
    .slice(0, 4)
  const topicItems = (topics || current.topics || [])
    .filter(
      (topic) =>
        topic?.id &&
        topic.title &&
        topic.history?.some((signal) => signal.article?.review?.review_status === "verified"),
    )
    .map((topic) => ({
      topic,
      newest: topic.history
        .filter((signal) => signal.article?.review?.review_status === "verified")
        .sort((a, b) =>
          String(b.article.review.published_at).localeCompare(
            String(a.article.review.published_at),
          ),
        )[0],
    }))
    .sort(
      (a, b) =>
        String(b.newest.article.review.published_at).localeCompare(
          String(a.newest.article.review.published_at),
        ) || a.topic.id.localeCompare(b.topic.id),
    )
    .slice(0, 5)
  const previous = (library.issues || [])
    .filter(
      (issue) =>
        issue.key !== latest?.key &&
        issue.items?.some((article) => article.review?.review_status === "verified"),
    )
    .toReversed()
    .slice(0, 3)
  const heading = `<div class="home-heading"><div><p class="home-date">${latest?.date ? `<time datetime="${esc(latest.date)}">${dateLabel(latest.date)}</time>` : ""}</p><h1>아침 브리핑</h1></div><div class="home-heading-links">${latest ? link(href(briefPath(latest.key)), "브리핑 전문 →") : ""}</div></div>`
  const top = highlights.length
    ? `<section class="home-highlights" aria-labelledby="home-highlights-heading"><div class="home-section-heading"><h2 id="home-highlights-heading">주요 소식</h2>${link(href("News/index"), "전체 뉴스 →")}</div>${highlights.map((article, index) => articlePreview(article, href, { featured: index === 0 })).join("")}</section>`
    : ""
  const sectors = sectorSections.length
    ? `<section class="home-sectors" aria-labelledby="home-sectors-heading"><div class="home-section-heading"><h2 id="home-sectors-heading">분야별 최근 소식</h2>${link(href("News/index"), "뉴스 전체 →")}</div><div class="home-sector-grid">${sectorSections.map(({ sector, url, items }) => `<section class="home-sector"><h3 class="home-sector-label">${link(url, sector + " →")}</h3>${items.map((article) => articlePreview(article, href, { compact: true })).join("")}</section>`).join("")}</div></section>`
    : ""
  const termsView = terms.length
    ? `<section class="home-knowledge" aria-labelledby="home-knowledge-heading"><div class="home-section-heading"><h2 id="home-knowledge-heading">뉴스 속 전문용어</h2>${link(href("Knowledge/index"), "지식 →")}</div><div class="home-term-list">${terms.map((note) => `<article class="home-term"><h3>${link(href(note.path), note.meta.label || note.meta.title)}</h3>${note.definition ? `<p>${esc(note.definition)}</p>` : ""}</article>`).join("")}</div></section>`
    : ""
  const topicsView = topicItems.length
    ? `<section class="home-topics" aria-labelledby="home-topics-heading"><div class="home-section-heading"><h2 id="home-topics-heading">누적 주제</h2>${link(href("index") + "#ongoing-topics", "전체 →")}</div><ul class="home-topic-list">${topicItems.map(({ topic, newest }) => `<li><time datetime="${esc(newest.article.review.published_at)}">${dateLabel(newest.article.review.published_at).slice(5)}</time>${link(href(topicPath(topic.id)), topic.title)}</li>`).join("")}</ul></section>`
    : ""
  const previousView = previous.length
    ? `<section class="home-previous" aria-labelledby="home-previous-heading"><div class="home-section-heading"><h2 id="home-previous-heading">지난 브리핑</h2>${link(href("index") + "#briefing-archive", "모두 →")}</div><ul>${previous.map((issue) => `<li><time datetime="${esc(issue.date)}">${dateLabel(issue.date)}</time>${link(href(briefPath(issue.key)), issue.lead)}</li>`).join("")}</ul></section>`
    : ""
  return `${heading}<div class="home-layout"><div class="home-main">${top}${sectors}</div><aside class="home-sidebar" aria-label="지식과 누적 기록">${termsView}${topicsView}${previousView}</aside></div>`
}

export function briefingOverview(articles, library, href, base, options = {}) {
  return homeView(articles, library, href, base, options) + briefingRecords(library, href)
}

export function newsView(
  articles,
  latest,
  href,
  {
    expanded = false,
    recentItems = [],
    briefingEntries = null,
    dateGrouping = "rolling",
    today = newsToday(),
  } = {},
) {
  const groups = new Map()
  const dates = new Map()
  if (dateGrouping === "rolling") {
    for (const group of groupNewsDates(
      articles.map((article) => ({ ...newsArticleDates(article), id: article.id, article })),
      { today },
    )) {
      groups.set(
        group.key,
        group.items.map(({ article }) => article),
      )
      dates.set(group.key, group)
    }
  } else {
    for (const a of [...articles].sort((a, b) =>
      String(b.edition.meta.date).localeCompare(String(a.edition.meta.date)),
    )) {
      const date = String(a.edition.meta.date)
      if (!groups.has(date)) groups.set(date, [])
      groups.get(date).push(a)
    }
  }
  if (recentItems.length) groups.set("지난 7일 주요 발표", recentItems)
  articles = [...articles, ...recentItems]
  const entities = [...new Set(articles.flatMap((a) => a.classification?.entities || []))].sort(
    (a, b) => a.localeCompare(b, "ko"),
  )
  const select = (id, label, values) =>
    `<label>${label}<select id="news-${id}"><option value="">전체</option>${values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}</select></label>`
  const filters = articles.some((a) => a.classification)
    ? `<div class="news-filters">${select("sector", "분야", SECTORS)}${select(
        "theme",
        "테마",
        THEMES.map((t) => t.name),
      )}${select("entity", "기업·기관", entities)}<button type="button" id="news-reset">초기화</button></div>`
    : ""
  const row = (a) => articleCard(a, href, expanded)
  const rows = (items, date) =>
    briefingEntries && date === String(latest.date)
      ? briefingEntries
          .map((entry) =>
            entry.id
              ? `<section class="briefing-group" data-news-day><h2>${esc(entry.title)}</h2><div>${entry.items.map(row).join("")}</div></section>`
              : row(entry.items[0]),
          )
          .join("")
      : items.map(row).join("")
  const heading = (key) => {
    const group = dates.get(key)
    if (group)
      return group.date
        ? `<time datetime="${esc(group.date)}">${dateLabel(group.date)}</time><span class="news-date-basis">${group.label}</span>`
        : ""
    return /^\d{4}-/.test(key) ? `<time datetime="${esc(key)}">${dateLabel(key)}</time>` : esc(key)
  }
  return `<div class="page-heading"><h1>뉴스</h1><a href="${href(briefPath(latest.key))}">${esc(latest.date)} 브리핑 →</a></div>${sectorTabs(articles, href("News/index"))}<details class="article-filters"><summary>검색·필터</summary><div class="news-tools"><label for="news-query">뉴스에서 찾기</label><input id="news-query" type="search" placeholder="제목 · 요약 · 출처 · 태그" autocomplete="off"><span id="news-count" role="status">${articles.length}건</span></div>${filters}<select id="news-kind" aria-label="기사 종류" hidden><option value="">전체</option><option value="deep">심층 분석</option></select></details><div class="news-stream"${dateGrouping === "rolling" ? ` id="news-stream" data-news-stream="rolling" data-news-today="${esc(today)}"` : ""}>${[...groups].map(([key, items]) => `<section class="news-day" data-news-day${dates.has(key) ? ` data-date-basis="${dates.get(key).basis}"` : ""}>${heading(key) ? `<h2>${heading(key)}</h2>` : ""}<div>${rows(items, key)}</div></section>`).join("")}</div>${dateGrouping === "rolling" ? moreNewsButton("news-more", "news-stream") : ""}<p id="news-empty" hidden>검색 결과 없음</p>`
}
function changeRows(i, href, detailed = false) {
  if (!i.snapshot.review || !i.snapshot.today?.length) return ""
  return `<ol class="change-list">${i.snapshot.today.map((s) => `<li><div class="change-topic">${link(href(topicPath(s.topic_id)), i.snapshot.topics.find((t) => t.id === s.topic_id).title)}${s.stance !== "support" ? " · " + stanceLabel(s.stance) : ""}</div><h3>${esc(s.change)}</h3><p>${esc(s.meaning)}</p>${detailed ? `<details class="evidence-detail"><summary>근거 · 한계 · 다음 확인</summary><p>${link(href("News/" + s.event_id), s.article.title)}</p><p>${s.article.urls.map((u) => link(u, publisher(u) + " 원문 ↗")).join(" · ")}</p><dl><dt>한계</dt><dd>${esc(s.limit)}</dd><dt>다음 확인</dt><dd>${esc(s.next_check)}</dd></dl></details>` : ""}</li>`).join("")}</ol>`
}
function briefingRecords(library, href) {
  const snap = library.current || library.latest?.snapshot || { topics: [] }
  const topics = (snap.topics || []).filter(
    (topic) => topic.latest && typeof topic.thesis === "string" && Array.isArray(topic.lessons),
  )
  const months = new Map()
  for (const row of (library.issues || []).toReversed()) {
    const month = row.date.slice(0, 7)
    if (!months.has(month)) months.set(month, [])
    months.get(month).push(row)
  }
  return `${topics.length ? `<section id="ongoing-topics"><div class="section-heading"><h2>누적 주제</h2></div><div class="topic-grid">${topics.map((t) => `<article class="topic-card"><div class="topic-stats"><time>${(t.reader_format === "source-events/v1" ? t.reviewed : t.latest.date).slice(5)} 갱신</time></div><h3>${link(href(topicPath(t.id)), t.title)}</h3><p>${esc(t.reviewed <= snap.date ? t.thesis : t.latest.meaning)}</p><div class="topic-footer"><span>누적 ${t.events}건${t.lessons.length ? ` · 원칙 ${t.lessons.length}개` : ""}</span>${link(href(topicPath(t.id)), "기록 읽기 →")}</div></article>`).join("")}</div></section>` : `<span id="ongoing-topics"></span>`}${
    months.size
      ? `<section id="briefing-archive"><h2>지난 브리핑</h2>${[...months]
          .map(
            ([month, issues], idx) =>
              `<details class="issue-month" ${idx === 0 ? "open" : ""}><summary>${month.replace("-", ".")} <span>${issues.length}회</span></summary><ol>${issues
                .map(
                  (row) =>
                    `<li><time>${row.date.slice(5)}${
                      library.issues.filter((x) => x.date === row.date).length > 1
                        ? " · " +
                          row.key
                            .split("/")
                            .pop()
                            .slice(11, 15)
                            .replace(/(\d{2})(\d{2})/, "$1:$2")
                        : ""
                    }</time>${link(href(briefPath(row.key)), row.lead)}</li>`,
                )
                .join("")}</ol></details>`,
          )
          .join("")}</section>`
      : `<span id="briefing-archive"></span>`
  }`
}

export function briefingHub(library, href, base) {
  const i = library.latest
  return `<div class="page-heading"><h1>브리핑</h1><div>${link(GITHUB + "digest/README.md", "GitHub 모음")}</div></div><section class="issue-feature"><div class="issue-date"><time datetime="${i.date}">${dateLabel(i.date)}</time><span>아침 브리핑</span><small>뉴스 ${i.items.length}건</small></div><div><h2 class="issue-lead">${esc(i.lead)}</h2>${
    i.original.meta.editorial_format
      ? `<ol class="change-list">${topArticles(i)
          .map(
            (a) =>
              `<li><h3>${link(href("News/" + a.id), a.title)}</h3>${announcementDate(a)}<p>${esc(a.summary)}</p></li>`,
          )
          .join("")}</ol>`
      : changeRows(i, href)
  }${publicationLinks(i, href, base)}</div></section>${briefingRecords(library, href)}`
}
export function issueView(i, href, base, renderedArticle) {
  if (i.original.meta.article_reviews) {
    const heading = `<div class="article-meta">${link(href("Briefings/index"), "← 브리핑")} · <time>${esc(i.date)}</time></div><h1>${esc(i.date)} 아침 브리핑</h1><div class="publication-links">${link(githubIssue(i.key), "GitHub 정리")}</div>`
    if (!i.items.length && !i.recentItems?.length) return heading
    const highlights = topArticles(i)
    const top = highlights.length
      ? `<section class="issue-highlights"><h2>주요 소식</h2><ul>${highlights.map((a) => `<li>${link(href("News/" + a.id), a.title)} ${announcementDate(a)}</li>`).join("")}</ul></section>`
      : ""
    const briefingEntries = i.original.meta.briefing_groups
      ? sectorGroups(i.original, i.items).flatMap((g) => g.entries)
      : null
    const stream = newsView(i.items, i, href, {
      expanded: true,
      dateGrouping: "briefing",
      recentItems: i.recentItems || [],
      briefingEntries,
    })
      .replace(/^<div class="page-heading">[\s\S]*?<\/a><\/div>/, "")
      .replace(
        /<nav class="sector-tabs"[\s\S]*?<\/nav>/,
        sectorTabs([...i.items, ...(i.recentItems || [])], href(briefPath(i.key))),
      )
    return heading + top + stream
  }
  return `<div class="article-meta">${link(href("Briefings/index"), "← 브리핑")} · <time>${esc(i.date)}</time> · 뉴스 ${i.items.length}건</div><h1>${esc(i.date)} 아침 브리핑</h1><p class="reading-lead">${esc(i.lead)}</p><div class="publication-links">${link(githubIssue(i.key), "GitHub 정리")}</div>${i.snapshot.review && !i.original.meta.editorial_format ? `<section class="daily-changes"><h2 id="오늘의-변화">오늘의 변화</h2>${changeRows(i, href, true)}<p class="provenance">${esc(reviewText(i.snapshot.review))}</p></section>` : ""}${renderedArticle}`
}
