import { articleCard, sectorTabs } from "./reader-cards.mjs"
import { topArticles } from "./editorial.mjs"
import {
  esc,
  publisher,
  briefPath,
  topicPath,
  githubIssue,
  GITHUB,
  reviewText,
} from "./briefings.mjs"
import { stanceLabel } from "./trends.mjs"
import { THEMES } from "./themes.mjs"
import { SECTORS } from "./sectors.mjs"

const link = (url, label, attrs = "") => `<a href="${esc(url)}" ${attrs}>${esc(label)}</a>`
const dateLabel = (date) => date.replaceAll("-", ".")
export const publicationLinks = (i, href, base) =>
  `<div class="publication-links">${link(href(briefPath(i.key)), "브리핑 읽기 →")} ${link(githubIssue(i.key), "GitHub 정리")} ${link(base + "/rss", "RSS 구독")}</div>`

export function newsView(articles, latest, href) {
  const groups = new Map()
  for (const a of [...articles].sort((a, b) =>
    String(b.edition.meta.date).localeCompare(String(a.edition.meta.date)),
  )) {
    const date = String(a.edition.meta.date)
    if (!groups.has(date)) groups.set(date, [])
    groups.get(date).push(a)
  }
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
  const row = (a) => articleCard(a, href)
  return `<div class="page-heading"><h1>뉴스</h1><a href="${href(briefPath(latest.key))}">${esc(latest.date)} 브리핑 →</a></div>${sectorTabs(articles, href("News/index"))}<details class="article-filters"><summary>검색·필터</summary><div class="news-tools"><label for="news-query">뉴스에서 찾기</label><input id="news-query" type="search" placeholder="제목 · 요약 · 출처 · 태그" autocomplete="off"><span id="news-count" role="status">${articles.length}건</span></div>${filters}<select id="news-kind" aria-label="기사 종류" hidden><option value="">전체</option><option value="deep">심층 분석</option></select></details><div class="news-stream">${[...groups].map(([date, items]) => `<section class="news-day" data-news-day><h2><time datetime="${date}">${dateLabel(date)}</time></h2><div>${items.map(row).join("")}</div></section>`).join("")}</div><p id="news-empty" hidden>검색 결과 없음</p>`
}
function changeRows(i, href, detailed = false) {
  if (!i.snapshot.review)
    return `<p class="muted">트렌드 기록 미정리 · ${link(href(briefPath(i.key)), "당일 브리핑")}</p>`
  if (!i.snapshot.today.length) return "<p>새로 기록할 트렌드 변화 없음.</p>"
  return `<ol class="change-list">${i.snapshot.today.map((s) => `<li><div class="change-topic">${link(href(topicPath(s.topic_id)), i.snapshot.topics.find((t) => t.id === s.topic_id).title)}${s.stance !== "support" ? " · " + stanceLabel(s.stance) : ""}</div><h3>${esc(s.change)}</h3><p>${esc(s.meaning)}</p>${detailed ? `<details class="evidence-detail"><summary>근거 · 한계 · 다음 확인</summary><p>${link(href("News/" + s.event_id), s.article.title)}</p><p>${s.article.urls.map((u) => link(u, publisher(u) + " 원문 ↗")).join(" · ")}</p><dl><dt>한계</dt><dd>${esc(s.limit)}</dd><dt>다음 확인</dt><dd>${esc(s.next_check)}</dd></dl></details>` : ""}</li>`).join("")}</ol>`
}
export function briefingHub(library, href, base) {
  const i = library.latest,
    snap = i.snapshot
  const months = new Map()
  for (const row of library.issues.toReversed()) {
    const month = row.date.slice(0, 7)
    if (!months.has(month)) months.set(month, [])
    months.get(month).push(row)
  }
  return `<div class="page-heading"><h1>브리핑</h1><div>${link(base + "/rss", "RSS 구독")} · ${link(GITHUB + "digest/README.md", "GitHub 모음")}</div></div><section class="issue-feature"><div class="issue-date"><time datetime="${i.date}">${dateLabel(i.date)}</time><span>아침 브리핑</span><small>뉴스 ${i.items.length}건</small></div><div><h2 class="issue-lead">${esc(i.lead)}</h2>${
    i.original.meta.editorial_format
      ? `<ol class="change-list">${topArticles(i)
          .map(
            (a) =>
              `<li><h3>${link(href("News/" + a.id), a.title)}</h3><p>${esc(a.summary)}</p></li>`,
          )
          .join("")}</ol>`
      : changeRows(i, href)
  }${publicationLinks(i, href, base)}</div></section><section id="ongoing-topics"><div class="section-heading"><h2>누적 주제</h2><span>${snap.topics.reduce((n, t) => n + t.lessons.length, 0)}개 판단 원칙</span></div><div class="topic-grid">${snap.topics.map((t) => `<article class="topic-card"><div class="topic-stats"><time>${t.latest.date.slice(5)} 갱신</time><span>${t.recent}건 / ${t.previous}건</span></div><h3>${link(href(topicPath(t.id)), t.title)}</h3><p>${esc(t.reviewed <= i.date ? t.thesis : t.latest.meaning)}</p><div class="topic-footer"><span>${t.days}일 · 누적 ${t.events}건${t.lessons.length ? ` · 원칙 ${t.lessons.length}개` : ""}</span>${link(href(topicPath(t.id)), "기록 읽기 →")}</div></article>`).join("") || "<p>아직 정리된 주제 없음</p>"}</div></section><section id="briefing-archive"><h2>지난 브리핑</h2>${[
    ...months,
  ]
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
}
export function issueView(i, href, base, renderedArticle) {
  if (i.original.meta.article_reviews) {
    const heading = `<div class="article-meta">${link(href("Briefings/index"), "← 브리핑")} · <time>${esc(i.date)}</time></div><h1>${esc(i.date)} 아침 브리핑</h1><div class="publication-links">${link(githubIssue(i.key), "GitHub 정리")} ${link(base + "/rss", "RSS 구독")}</div>`
    const highlights = topArticles(i)
    const top = highlights.length
      ? `<section class="issue-highlights"><h2>주요 소식</h2><ul>${highlights.map((a) => `<li>${link(href("News/" + a.id), a.title)}</li>`).join("")}</ul></section>`
      : ""
    const stream = newsView(i.items, i, href)
      .replace(/^<div class="page-heading">[\s\S]*?<\/a><\/div>/, "")
      .replace(
        /<nav class="sector-tabs"[\s\S]*?<\/nav>/,
        sectorTabs(i.items, href(briefPath(i.key))),
      )
    return heading + top + stream
  }
  return `<div class="article-meta">${link(href("Briefings/index"), "← 브리핑")} · <time>${esc(i.date)}</time> · 뉴스 ${i.items.length}건</div><h1>${esc(i.date)} 아침 브리핑</h1><p class="reading-lead">${esc(i.lead)}</p><div class="publication-links">${link(githubIssue(i.key), "GitHub 정리")} ${link(base + "/rss", "RSS 구독")}</div>${i.snapshot.review && !i.original.meta.editorial_format ? `<section class="daily-changes"><h2 id="오늘의-변화">오늘의 변화</h2>${changeRows(i, href, true)}<p class="provenance">${esc(reviewText(i.snapshot.review))}</p></section>` : ""}${renderedArticle}`
}
