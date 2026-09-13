import {
  editorialMarkdown,
  topArticles,
  EDITORIAL_FORMAT,
  validateIdentities,
} from "./editorial.mjs"
import { sectorMarkdown, sectorGroups } from "./sectors.mjs"
import { classificationMarkdown, classificationText } from "./themes.mjs"
import { slugifyFilePath } from "@quartz-community/utils"
import { slug as headingSlug } from "github-slugger"
import { loadTrends, trendSnapshot, stanceLabel } from "./trends.mjs"

export const GITHUB = "https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/"
export const briefPath = (key) => key.replace(/^Editions\//, "Briefings/")
export const topicPath = (id) => "Briefings/Topics/" + id
export const digestPath = (key) => key.replace(/^Editions\//, "digest/") + ".md"
export const githubIssue = (key) => GITHUB + digestPath(key)
export const githubTopic = (id) => GITHUB + "digest/topics/" + id + ".md"
export const siteURL = (base, p) =>
  base.replace(/\/$/, "") +
  "/" +
  (p === "index"
    ? ""
    : slugifyFilePath(p + ".md")
        .split("/")
        .map(encodeURIComponent)
        .join("/"))
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  )
export const plain = (s) =>
  String(s || "")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, p, label) => label || p.split("/").pop())
    .replace(/\[S\d+\]|[*`]/g, "")
    .trim()
export const publisher = (url) => {
  const host = new URL(url).hostname.replace(/^www\./, "")
  for (const [domain, name] of [
    ["openai.com", "OpenAI"],
    ["github.blog", "GitHub"],
    ["nvidia.com", "NVIDIA"],
    ["microsoft.com", "Microsoft"],
    ["google", "Google"],
    ["nature.com", "Nature"],
    ["anthropic.com", "Anthropic"],
    ["arxiv.org", "arXiv"],
  ])
    if (
      host === domain ||
      host.endsWith("." + domain) ||
      (domain === "google" && /(^|\.)google(?:\.com)?$/.test(host))
    )
      return name
  return host
}
const wiki = (p, s) => `[[${p}|${s}]]`
const mdLink = (s, url) => `[${s.replace(/[\[\]]/g, "")}](${url})`
const sourceLinks = (s) =>
  s.article.urls.map((u, i) => mdLink(i ? `원문 ${i + 1}` : publisher(u) + " 원문", u)).join(" · ")
export const reviewText = (r) =>
  !r
    ? "트렌드 기록 미정리"
    : r.review_basis === "saved-coverage"
      ? `기존 수록 기사 재정리 · ${r.reviewed} 검토`
      : `${r.reviewed} 원문 검토`

export function briefingLibrary(vault, all, issueArticles, options) {
  const issues = all.map((i) => ({
    key: i.slug,
    date: String(i.meta.date),
    cutoff: i.meta.coverage_end,
    items: issueArticles.get(i.slug) || [],
    original: i,
    lead:
      plain(i.body.match(/\*\*한 줄 편집:\*\*\s*(.+)/)?.[1]) || `${i.meta.date} IT · AI · 로보틱스`,
    analysis:
      i.meta.schema_version === "tech-ai-magazine/v2"
        ? [...i.body.matchAll(/^# (흐름 읽기|오늘의 적용)\n([\s\S]*?)(?=^# |$(?![\s\S]))/gm)]
            .filter((m) => m[2].trim() !== "없음")
            .map((m) => `## ${m[1]}\n\n${m[2].trim()}`)
            .join("\n\n")
        : "",
  }))
  validateIdentities(issues)
  const trends = loadTrends(vault, issues, options)
  for (const i of issues) i.snapshot = trendSnapshot(trends, i.key)
  return { issues, trends, latest: issues.at(-1), byKey: new Map(issues.map((i) => [i.key, i])) }
}

export function observationMarkdown(s) {
  return `### ${s.change}\n\n${s.meaning}\n\n- 판단: ${stanceLabel(s.stance)}\n- 한계: ${s.limit}\n- 다음 확인: ${s.next_check}\n- 근거: ${wiki("News/" + s.event_id, s.article.title)} · ${sourceLinks(s)}`
}
export function issueTrendsMarkdown(i) {
  const snap = i.snapshot
  if (!snap.review) return ""
  return `## 오늘의 변화\n\n${reviewText(snap.review)}\n\n${snap.today.length ? snap.today.map((s) => `${observationMarkdown(s)}\n- 누적 기록: ${wiki(topicPath(s.topic_id), snap.topics.find((t) => t.id === s.topic_id).title)}`).join("\n\n") : "새로 기록할 트렌드 변화 없음."}`
}
export function topicMarkdown(t, date) {
  const provenance = [
    ...new Set(t.history.filter((s) => s.review_basis === "saved-coverage").map((s) => s.reviewed)),
  ]
  return `${t.question}\n\n${wiki("Briefings/index", "← 브리핑")} · ${mdLink("GitHub 정리", githubTopic(t.id))}\n\n## 현재 판단\n\n${t.reviewed <= date ? t.thesis : t.latest.meaning}\n\n${date}까지 서로 다른 원문 ${t.events}건 · ${t.days}일에 걸쳐 관측. 최근 7일 ${t.recent}건 / 이전 7일 ${t.previous}건. 수집한 기사에 한정한 기록이며 미정리 기간을 포함한다.\n\n## 다음 확인\n\n${t.reviewed <= date ? t.watch_for : t.latest.next_check}\n\n## 판단을 바꿀 조건\n\n${t.reviewed <= date ? t.disconfirming : t.latest.limit}\n\n## 재사용할 원칙\n\n${
    t.lessons.length
      ? t.lessons
          .map(
            (l) =>
              `### ${l.claim}\n\n편집 분석 · ${l.reviewed} 검토\n\n적용 한계: ${l.limit}\n\n근거 기록: ${l.signal_ids
                .map((id) => {
                  const s = t.history.find((s) => s.id === id)
                  return wiki(topicPath(t.id) + "#" + s.id, s.date + " · " + s.change)
                })
                .join(" · ")}`,
          )
          .join("\n\n")
      : "여러 날짜의 근거와 적용 한계를 더 확인하는 중이다."
  }\n\n## 관측 기록\n\n${provenance.length ? `기존 수록 기사 재정리 · ${provenance.join(", ")} 검토. 아래 날짜는 기사 수록일이다.\n\n` : ""}${t.history
    .toReversed()
    .map(
      (s) =>
        `<span id="${s.id}"></span>\n\n### ${s.date} · ${stanceLabel(s.stance)}\n\n**${s.change}**\n\n${s.meaning}\n\n- 한계: ${s.limit}\n- 다음 확인: ${s.next_check}\n- ${wiki("News/" + s.event_id, s.article.title)} · ${sourceLinks(s)} · ${wiki(briefPath(s.issue), "당일 브리핑")}\n- ${reviewText(s)}`,
    )
    .join(
      "\n\n",
    )}\n\n## 관련 개념\n\n${t.knowledge_notes.map((p) => "- " + wiki(p, p.split("/").pop())).join("\n")}`
}

// Common Markdown, with ordinary HTTPS links, renders independently of Obsidian.
export function githubMarkdown(markdown, base) {
  return markdown
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, p, label) => {
      const [file, hash] = p.split("#")
      return mdLink(
        label || file.split("/").pop(),
        siteURL(base, file) + (hash ? "#" + headingSlug(hash) : ""),
      )
    })
    .replace(/^> \[![^\]]+\]([^\n]*)\n/gm, (_, label) =>
      label.trim() ? `> **${label.trim()}**\n` : ">\n",
    )
    .replace(/<span id="([^"]+)"><\/span>/g, '<a id="$1"></a>')
}
export function digestMarkdown(i, base) {
  let body = `# ${i.date} 아침 브리핑\n\n${i.lead}\n\n${mdLink("웹 브리핑", siteURL(base, briefPath(i.key)))} · ${mdLink("브리핑 모음", GITHUB + "digest/README.md")} · ${mdLink("RSS", base + "/briefing.xml")}\n\n`
  body += editorialMarkdown(
    i,
    "top",
    (a) => `### ${mdLink(a.title, siteURL(base, "News/" + a.id))}\n\n${a.summary}`,
  )
  if (i.snapshot.review && !i.original?.meta?.editorial_format)
    body += issueTrendsMarkdown(i) + "\n\n"
  body +=
    sectorMarkdown(
      i.original,
      i.items,
      (a) =>
        `#### ${mdLink(a.title, siteURL(base, "News/" + a.id))}\n\n${classificationMarkdown(a)}${a.summary}\n\n${a.urls.map((u) => mdLink(publisher(u) + " 원문", u)).join(" · ")}`,
    ) ??
    (i.items.length
      ? `## 헤드라인과 원문\n\n${i.items.map((a) => `### ${mdLink(a.title, siteURL(base, "News/" + a.id))}\n\n${a.summary}\n\n${a.urls.map((u) => mdLink(publisher(u) + " 원문", u)).join(" · ")}`).join("\n\n")}\n\n`
      : mdLink("당일 브리핑 전문", siteURL(base, briefPath(i.key))) + "\n\n")
  if (sectorGroups(i.original, i.items)) body += "\n\n"
  body += editorialMarkdown(
    i,
    "deep",
    (a) =>
      `### ${mdLink(a.title, siteURL(base, "News/" + a.id))}\n\n${a.editorial.analysis_summary}\n\n${a.editorial.topic_ids.map((id) => mdLink("누적 기록", siteURL(base, topicPath(id)))).join(" · ")}`,
  )
  if (i.original?.meta?.editorial_format) body += issueTrendsMarkdown(i) + "\n\n"
  const sources = new Map(
    [...i.original.body.matchAll(/\[(S\d+)\][^\n]*?(https?:\/\/[^\s<>\)]+)/g)].map((m) => [
      m[1],
      m[2],
    ]),
  )
  body += i.analysis.replace(/\[(S\d+)\]/g, (m, key) =>
    sources.has(key) ? mdLink(key, sources.get(key)) : m,
  )
  return githubMarkdown(body, base).trim() + "\n"
}
export function feedDescription(i, base) {
  const link = (url, label) => `<a href="${esc(url)}">${esc(label)}</a>`
  const snap = i.snapshot
  let html = `<p>${esc(i.lead)}</p><p>${link(siteURL(base, briefPath(i.key)), "웹 브리핑")} · ${link(githubIssue(i.key), "GitHub 정리")}</p>`
  if (i.original?.meta?.editorial_format === EDITORIAL_FORMAT)
    html += `<h2>주요 소식</h2>${topArticles(i)
      .map(
        (a) => `<h3>${link(siteURL(base, "News/" + a.id), a.title)}</h3><p>${esc(a.summary)}</p>`,
      )
      .join("")}`
  if (snap.review && !i.original?.meta?.editorial_format)
    html += `<h2>오늘의 변화</h2><p>${esc(reviewText(snap.review))}</p>${snap.today.length ? snap.today.map((s) => `<h3>${esc(s.change)}</h3><p>${esc(s.meaning)}</p><p>한계: ${esc(s.limit)}</p><p>다음 확인: ${esc(s.next_check)}</p><p>${link(siteURL(base, topicPath(s.topic_id)), "누적 기록")} · ${s.article.urls.map((u) => link(u, publisher(u) + " 원문")).join(" · ")}</p>`).join("") : "<p>새로 기록할 트렌드 변화 없음.</p>"}`
  const groups = sectorGroups(i.original, i.items)
  if (groups) {
    html += `<h2>분야별 브리핑</h2>${groups.map((g) => `<h3>${esc(g.name)} · ${g.items.length}건</h3>${g.items.length ? g.items.map((a) => `<h4>${link(siteURL(base, "News/" + a.id), a.title)}</h4>${a.classification ? `<p>${esc(classificationText(a))}</p>` : ""}<p>${esc(a.summary)}</p><p>${a.urls.map((u) => link(u, publisher(u) + " 원문")).join(" · ")}</p>`).join("") : "<p>수록 없음</p>"}`).join("")}`
  } else if (i.items.length)
    html += `<h2>헤드라인</h2>${i.items.map((a) => `<h3>${link(siteURL(base, "News/" + a.id), a.title)}</h3><p>${esc(a.summary)}</p><p>${a.urls.map((u) => link(u, publisher(u) + " 원문")).join(" · ")}</p>`).join("")}`
  for (const a of i.items.filter((a) => a.editorial && a.editorial.kind !== "사건 뉴스"))
    html += `<h2>오늘의 심층 분석</h2><h3>${link(siteURL(base, "News/" + a.id), a.title)}</h3><p>${esc(a.editorial.analysis_summary)}</p><p>${a.editorial.topic_ids.map((id) => link(siteURL(base, topicPath(id)), "누적 기록")).join(" · ")}</p>`
  return html
}
