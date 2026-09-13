import { articleReview, excludedEventIds, assertPublicArticles } from "./article-review.mjs"
import { sourceDiversity } from "./source-diversity.mjs"
import {
  applyEditorial,
  requireEditorial,
  editorialMeta,
  editorialMarkdown,
  editorialContext,
} from "./editorial.mjs"
import { sectorGroups, sectorMarkdown } from "./sectors.mjs"
import { coverageDate } from "./time.mjs"
import {
  usesThemes,
  classifyArticle,
  classificationMeta,
  classificationMarkdown,
  classificationHistory,
  isClassificationLine,
  THEMES,
  THEME_FORMAT,
} from "./themes.mjs"
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import YAML from "yaml"
import { makeResolver } from "./links.mjs"
import { slugifyFilePath } from "@quartz-community/utils"
import {
  briefingLibrary,
  issueTrendsMarkdown,
  topicMarkdown,
  digestMarkdown,
  githubMarkdown,
  digestPath,
  githubIssue,
  githubTopic,
  topicPath,
  feedDescription,
} from "./briefings.mjs"

export const walk = (dir) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((e) => {
          const p = path.join(dir, e.name)
          if (e.isSymbolicLink())
            throw new Error(`Symlink is not supported in the publication vault: ${p}`)
          return e.isDirectory() ? (e.name.startsWith(".") ? [] : walk(p)) : [p]
        })
        .sort()
    : []
export function parseNote(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  return m
    ? { meta: YAML.parse(m[1]) || {}, body: text.slice(m[0].length).trim() }
    : { meta: {}, body: text.trim() }
}
export const noteText = (meta, body) =>
  `---\n${YAML.stringify(meta).trim()}\n---\n\n${body.trim()}\n`
export const canonicalURL = (raw) => {
  const u = new URL(raw)
  if (!["https:", "http:"].includes(u.protocol)) throw new Error(`Invalid source URL ${raw}`)
  u.hash = ""
  for (const k of [...u.searchParams.keys()])
    if (/^(utm_|fbclid|gclid)/.test(k)) u.searchParams.delete(k)
  u.searchParams.sort()
  return u.toString().replace(/\/$/, "")
}
const digest = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16)
const unique = (a) => [...new Set(a)]
const wiki = (target, label) => `[[${target}|${label}]]`
const strip = (s) =>
  s
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a.split("/").pop())
    .replace(/\[S\d+\]/g, "")
    .replace(/[*`]/g, "")
    .trim()
export const escapeXML = (s) =>
  String(s).replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c],
  )
const write = (f, t) => {
  fs.mkdirSync(path.dirname(f), { recursive: true })
  if (!fs.existsSync(f) || fs.readFileSync(f, "utf8") !== t) fs.writeFileSync(f, t)
}
export function sections(body, level = 1) {
  const matches = [...body.matchAll(new RegExp(`^${"#".repeat(level)} (.+)$`, "gm"))]
  return matches.map((m, i) => ({
    title: m[1],
    body: body.slice(m.index + m[0].length, matches[i + 1]?.index ?? body.length).trim(),
  }))
}
export function sourceMap(body) {
  const sources = sections(body).find((s) => s.title === "Source List")?.body || ""
  return new Map(
    [...sources.matchAll(/\[S(\d+)\][^\n]*?(https?:\/\/[^\s<>\)]+)/g)].map((m) => [
      "S" + m[1],
      m[2],
    ]),
  )
}
const wikiTargets = (text) =>
  unique([...text.matchAll(/\[\[([^\]|#]+)(?:[^\]]*)\]\]/g)].map((m) => m[1]))
const noteFiles = (root) => walk(root).filter((f) => f.endsWith(".md"))
export function editions(vault) {
  return noteFiles(path.join(vault, "Editions"))
    .map((f) => {
      const n = parseNote(fs.readFileSync(f, "utf8"))
      if (!n.meta.date) n.meta.date = path.basename(f).slice(0, 10)
      return { file: f, slug: path.relative(vault, f).replace(/\.md$/, ""), ...n }
    })
    .sort(
      (a, b) =>
        String(a.meta.date).localeCompare(String(b.meta.date)) ||
        path.basename(a.file).localeCompare(path.basename(b.file)),
    )
}
export function extractArticles(edition) {
  if (edition.meta.schema_version !== "tech-ai-magazine/v2") return []
  const themed = usesThemes(edition)
  const sources = sourceMap(edition.body)
  const articles = sections(edition.body)
    .filter((s) => ["커버 스토리", "뉴스 데스크", "리서치 노트", "도구 상자"].includes(s.title))
    .flatMap((desk) =>
      sections(desk.body, 2).map((part) => {
        const markers = unique([...part.body.matchAll(/\[(S\d+)\]/g)].map((m) => m[1]))
        if (!markers.length || markers.some((m) => !sources.has(m)))
          throw new Error(`Unresolved article sources: ${edition.file}: ${part.title}`)
        const urls = unique(markers.map((m) => sources.get(m)))
        // The original announcement identifies an event. Follow-up editions reuse the same note.
        const review = articleReview(edition, strip(part.title), digest(canonicalURL(urls[0])))
        const id = review.event_id
        const concepts = wikiTargets(part.body).filter((p) => p.startsWith("Knowledge/"))
        const classification = themed ? classifyArticle(part.body, part.title) : undefined
        const leadLines = part.body
          .split("\n")
          .map((l) => l.replace(/^>\s?/, "").trim())
          .filter(
            (l) =>
              l &&
              !isClassificationLine(l) &&
              !/^\[!|^#{1,6} |^\*\*(?:개념|근거|공식 변경|프로젝트:|논문:)|^\[\[/.test(l),
          )
        const summary = strip(leadLines[0] || part.title)
          .replace(/^[^:：]{1,20}[:：]\s*/, "")
          .slice(0, 240)
        return {
          id,
          review,
          title: strip(part.title),
          body: part.body,
          summary,
          desk: desk.title,
          sector: part.body.match(/^\*\*분야:\*\*\s*(.+)$/m)?.[1]?.trim(),
          ...(classification ? { classification } : {}),
          urls,
          markers,
          sources: Object.fromEntries(markers.map((m) => [m, sources.get(m)])),
          concepts,
          edition,
        }
      }),
    )
  sectorGroups(edition, articles)
  return applyEditorial(edition, articles)
}
export function refresh(vault = "vault") {
  vault = path.resolve(vault)
  const all = editions(vault)
  if (!all.length) throw new Error("No editions found. Migrate or author an edition first.")
  const excluded = excludedEventIds(all)
  const articles = new Map(),
    issueArticles = new Map()
  for (const issue of all) {
    const current = extractArticles(issue)
    assertPublicArticles(current, excluded)
    issueArticles.set(issue.slug, current)
    for (const item of current) {
      const prev = articles.get(item.id)
      articles.set(item.id, {
        ...item,
        first_seen: prev?.first_seen || String(issue.meta.date),
        appearances: unique([...(prev?.appearances || []), issue.slug]),
      })
    }
  }
  const library = briefingLibrary(vault, all, issueArticles)
  const base =
    "https://" +
    YAML.parse(fs.readFileSync("quartz.config.yaml", "utf8")).configuration.baseUrl.replace(
      /\/$/,
      "",
    )
  const generated = []
  const emit = (slug, meta, body) => {
    const f = path.join(vault, slug + ".md")
    write(
      f,
      noteText(
        {
          ...meta,
          cssclasses: unique([...(meta.cssclasses || []), "garden-generated"]),
          generated_by: "tech-knowledge-garden",
        },
        `# ${meta.title}\n\n${body}`,
      ),
    )
    generated.push(slug)
  }
  for (const id of excluded)
    emit(
      `News/${id}`,
      { title: "비공개 기사", type: "withdrawn", event_id: id, review_status: "excluded" },
      "",
    )
  const briefSlug = (issue) => issue.slug.replace(/^Editions\//, "Briefings/")
  for (const item of articles.values()) {
    const issue = item.edition,
      last = String(issue.meta.date)
    emit(
      `News/${item.id}`,
      {
        title: item.title,
        type: "news",
        schema_version: "tech-news/v1",
        date: last,
        created: item.first_seen,
        updated: last,
        ...item.review,
        event_id: item.id,
        source_url: item.urls[0],
        sources: item.urls,
        concepts: item.concepts,
        description: item.summary,
        ...classificationMeta(item),
        ...editorialMeta(item),
      },
      `${
        item.editorial
          ? item.body
              .split("\n")
              .filter((l) => !isClassificationLine(l))
              .join("\n") +
            "\n\n" +
            item.editorial.topic_ids
              .map((id) => wiki("Briefings/Topics/" + id, "누적 기록"))
              .join(" · ")
          : item.body
      }\n\n${item.concepts.length ? "## 이어 읽기\n\n" + item.concepts.map((c) => "- " + wiki(c, path.basename(c))).join("\n") + "\n\n" : ""}## 이 소식을 다룬 브리핑\n\n${item.appearances.map((s) => "- " + wiki(s.replace(/^Editions\//, "Briefings/"), path.basename(s).slice(0, 10) + " 브리핑")).join("\n")}\n\n## 출처\n\n${Object.entries(
        item.sources,
      )
        .map(([k, v]) => `- [${k}] ${v}`)
        .join("\n")}`,
    )
  }
  for (const issue of all) {
    const items = issueArticles.get(issue.slug),
      date = String(issue.meta.date || path.basename(issue.file).slice(0, 10))
    const line = issue.body.match(/\*\*한 줄 편집:\*\*\s*(.+)/)?.[1]
    const heading = line ? strip(line) : `${date} IT · AI · 로보틱스`
    const model = library.byKey.get(issue.slug)
    let body =
      (line && !issue.meta.editorial_format ? `> ${heading}\n\n` : "") +
      (issue.meta.editorial_format ? "" : issueTrendsMarkdown(model)) +
      "\n\n"
    body =
      editorialMarkdown(
        model,
        "top",
        (a) => `### ${wiki("News/" + a.id, a.title)}\n\n${a.summary}`,
      ) + body
    body +=
      sectorMarkdown(
        issue,
        items,
        (a) => `#### ${wiki("News/" + a.id, a.title)}\n\n${classificationMarkdown(a)}${a.summary}`,
      ) ??
      (items.length
        ? `## 헤드라인\n\n${items.map((a) => `### ${wiki("News/" + a.id, a.title)}\n\n${a.summary}`).join("\n\n")}`
        : "")
    if (issue.meta.editorial_format)
      body +=
        "\n\n" +
        editorialMarkdown(
          model,
          "deep",
          (a) =>
            `### ${wiki("News/" + a.id, a.title)}\n\n${a.editorial.analysis_summary}\n\n${a.editorial.topic_ids.map((id) => wiki("Briefings/Topics/" + id, "누적 기록")).join(" · ")}`,
        )
    if (issue.meta.editorial_format && !issue.meta.article_reviews)
      body += issueTrendsMarkdown(model)
    if (issue.meta.schema_version === "tech-ai-magazine/v2") {
      for (const sec of sections(issue.body).filter(
        (s) => ["흐름 읽기", "오늘의 적용"].includes(s.title) && s.body !== "없음",
      ))
        body += `\n\n## ${sec.title}\n\n${sec.body}`
      const sources = sections(issue.body).find((s) => s.title === "Source List")?.body
      if (sources) body += `\n\n## 출처\n\n${sources}`
      if (!items.length) body = "새로 확인한 소식 없음.\n\n" + body
    } else {
      body += issue.body.replace(/^# (.+)$/gm, "## $1").replace(/ {2,}$/gm, "<br>")
    }
    emit(
      briefSlug(issue),
      {
        title: `${date} · 아침 브리핑`,
        type: "briefing-index",
        date,
        created: date,
        modified: date,
        description: heading,
        coverage_start: issue.meta.coverage_start,
        coverage_end: issue.meta.coverage_end,
        item_count: items.length,
        edition: issue.slug,
        github_url: githubIssue(issue.slug),
      },
      body,
    )
    write(digestPath(issue.slug), digestMarkdown(model, base))
  }
  for (const t of library.latest.snapshot.topics) {
    const body = topicMarkdown(t, library.latest.date)
    emit(
      topicPath(t.id),
      {
        title: t.title,
        type: "briefing-topic",
        topic_id: t.id,
        date: library.latest.date,
        description: t.thesis,
        github_url: githubTopic(t.id),
      },
      body,
    )
    write(
      "digest/topics/" + t.id + ".md",
      githubMarkdown("# " + t.title + "\n\n" + body, base) + "\n",
    )
  }
  write(
    "digest/README.md",
    `# 아침 브리핑\n\n[웹 브리핑](${base}/briefings/index) · [RSS](${base}/briefing.xml)\n\n## 누적 주제\n\n${library.latest.snapshot.topics.map((t) => `- [${t.title}](topics/${t.id}.md) — 원문 ${t.events}건 · ${t.lessons.length}개 원칙`).join("\n")}\n\n## 날짜별 브리핑\n\n${library.issues
      .toReversed()
      .map(
        (i) =>
          `- [${i.date} · ${path.basename(i.key).slice(11, 15)}](${digestPath(i.key).replace(/^digest\//, "")}) — ${i.lead}`,
      )
      .join("\n")}\n`,
  )
  const latest = all.at(-1),
    date = String(latest.meta.date),
    latestItems = issueArticles.get(latest.slug)
  const concepts = noteFiles(path.join(vault, "Knowledge"))
    .map((f) => ({ file: f, ...parseNote(fs.readFileSync(f, "utf8")) }))
    .filter((n) => n.meta.entry_type === "concept")
  const weeks = new Map()
  for (const issue of all) {
    const d = new Date(String(issue.meta.date) + "T12:00:00Z")
    if (isNaN(d)) continue
    const day = d.getUTCDay()
    d.setUTCDate(d.getUTCDate() - ((day + 6) % 7))
    const week = d.toISOString().slice(0, 10)
    if (!weeks.has(week)) weeks.set(week, [])
    weeks.get(week).push(issue)
  }
  for (const [week, issues] of weeks) {
    const grouped = new Map()
    for (const issue of issues)
      for (const a of issueArticles.get(issue.slug))
        for (const c of a.concepts) {
          if (!grouped.has(c)) grouped.set(c, new Map())
          grouped.get(c).set(a.id, a)
        }
    const body = `${wiki("Trends/index", "← 주간 흐름")}\n\n이 주에 수집한 원고에서 **서로 다른 원문 발표별**로 연결된 개념을 모았습니다. 기사 수는 이 매체의 수집 범위를 나타내며 시장 점유율이나 산업 전체의 성장률을 뜻하지 않습니다. 이전 형식의 원고는 기사 단위 집계에 포함되지 않습니다.\n\n## 개념별 관측\n\n${
      [...grouped]
        .sort((a, b) => b[1].size - a[1].size)
        .map(
          ([c, items]) =>
            `### ${wiki(c, path.basename(c))} · ${items.size}건\n\n${[...items.values()].map((a) => "- " + wiki("News/" + a.id, a.title)).join("\n")}`,
        )
        .join("\n\n") || "이 주는 개별 기사 분리 이전의 기록입니다. 아래 브리핑 원문을 참고하세요."
    }\n\n## 이번 주 브리핑\n\n${issues
      .toReversed()
      .map((i) => "- " + wiki(briefSlug(i), String(i.meta.date)))
      .join("\n")}`
    emit(
      "Trends/" + week,
      {
        title: `${week} 주간 관측`,
        type: "trend",
        date: week,
        created: week,
        modified: String(issues.at(-1).meta.date),
      },
      body,
    )
  }
  emit(
    "Trends/index",
    { title: "주간 흐름", type: "index", date },
    `매일의 소식을 개념별로 연결해 변화가 쌓이는 방향을 살펴봅니다.\n\n${[...weeks.keys()]
      .reverse()
      .map((w) => "- " + wiki("Trends/" + w, w + " 주간 관측"))
      .join("\n")}`,
  )
  emit(
    "Briefings/index",
    { title: "브리핑", type: "index", date },
    `## 누적 주제\n\n${library.latest.snapshot.topics.map((t) => `- ${wiki(topicPath(t.id), t.title)} · ${t.events}건 · 원칙 ${t.lessons.length}개`).join("\n")}\n\n## 날짜별 브리핑\n\n${all
      .toReversed()
      .map(
        (i) =>
          "- " +
          wiki(
            briefSlug(i),
            String(i.meta.date) +
              " · " +
              (i.meta.time || path.basename(i.file).slice(11, 15)) +
              " 브리핑",
          ),
      )
      .join("\n")}`,
  )
  emit(
    "News/index",
    { title: "뉴스", type: "index", date },
    `${[...articles.values()]
      .reverse()
      .map((a) => "- " + wiki("News/" + a.id, a.title) + " · " + String(a.edition.meta.date))
      .join("\n")}`,
  )
  emit(
    "index",
    { title: "뉴스", type: "home", date, description: latestItems.map((a) => a.title).join(" · ") },
    `## ${date.replaceAll("-", ".")}\n\n${latestItems.map((a) => `### ${wiki("News/" + a.id, a.title)}\n\n${a.summary}\n\n${a.concepts.map((c) => wiki(c, path.basename(c))).join(" · ")}`).join("\n\n---\n\n")}\n\n${wiki(briefSlug(latest), "브리핑 읽기 →")}\n\n## 최근 뉴스\n\n${[
      ...articles.values(),
    ]
      .reverse()
      .filter((a) => !latestItems.some((x) => x.id === a.id))
      .slice(0, 15)
      .map((a) => `- ${wiki("News/" + a.id, a.title)} · ${a.edition.meta.date}`)
      .join("\n")}\n\n${wiki("News/index", "뉴스 전체 →")}`,
  )
  fs.mkdirSync("data", { recursive: true })
  write(
    "data/catalog.json",
    JSON.stringify(
      {
        latest_cutoff: latest.meta.coverage_end,
        edition_count: all.length,
        news_count: articles.size,
        concept_count: concepts.length,
        known_sources: unique(
          all.flatMap((i) =>
            [...i.body.matchAll(/https?:\/\/[^\s<>\)\]]+/g)].map((m) => {
              try {
                return canonicalURL(m[0])
              } catch {
                return m[0]
              }
            }),
          ),
        ).sort(),
        generated,
      },
      null,
      2,
    ) + "\n",
  )
  // Only remove stale files that carry our marker, never authored content.
  for (const folder of ["News", "Briefings", "Trends"])
    for (const f of noteFiles(path.join(vault, folder))) {
      const n = parseNote(fs.readFileSync(f, "utf8"))
      const slug = path.relative(vault, f).replace(/\.md$/, "")
      if (n.meta.generated_by === "tech-knowledge-garden" && !generated.includes(slug))
        fs.unlinkSync(f)
    }
  feeds(vault, vault)
  console.log(
    `Refreshed ${all.length} briefings, ${articles.size} event notes, ${concepts.length} concepts.`,
  )
  return { all, articles, concepts }
}

export function validate(vault = "vault") {
  const files = noteFiles(vault),
    slugs = new Set(files.map((f) => path.relative(vault, f).replace(/\.md$/, ""))),
    errors = []
  const resolveLink = makeResolver(
    files.map((f) => ({
      path: path.relative(vault, f).replace(/\.md$/, ""),
      ...parseNote(fs.readFileSync(f, "utf8")),
    })),
  )
  for (const f of files) {
    const { meta, body } = parseNote(fs.readFileSync(f, "utf8"))
    for (const key of ["publish", "draft", "unlisted", "password"])
      if (key in meta) errors.push(`${f}: ${key} is unsupported; this is a wholly public vault`)
    for (const target of wikiTargets(body))
      try {
        resolveLink(target, path.relative(vault, f).replace(/\.md$/, ""))
      } catch (e) {
        errors.push(`${f}: ${e.message}`)
      }
    if (/(?:sk-proj-|ghp_)[a-zA-Z0-9]{20,}/.test(body)) errors.push(`${f}: credential-like text`)
  }
  const all = editions(vault),
    dates = []
  try {
    briefingLibrary(vault, all, new Map(all.map((i) => [i.slug, extractArticles(i)])))
  } catch (e) {
    errors.push(e.message)
  }
  for (const issue of all) {
    try {
      requireEditorial(issue)
    } catch (e) {
      errors.push(e.message)
    }
    if (!issue.meta.coverage_end && issue.meta.schema_version === "tech-ai-magazine/v2")
      errors.push(`${issue.file}: missing cutoff`)
    else if (issue.meta.coverage_end && isNaN(Date.parse(issue.meta.coverage_end)))
      errors.push(`${issue.file}: invalid cutoff`)
    dates.push(issue.meta.coverage_end)
  }
  if (!all.at(-1)?.meta.coverage_end)
    errors.push(
      "Latest edition must have a verified coverage_end; a filename is not a research cutoff.",
    )
  const result = spawnSync(
    "python3",
    ["scripts/validate_encyclopedia.py", "--vault-root", path.resolve(vault), "--all-knowledge"],
    { encoding: "utf8" },
  )
  if (result.status !== 0) errors.push(result.stdout + result.stderr)
  // Original pre-v2 issues are retained as historical records, not silently upgraded.
  for (const issue of all.filter((i) => i.meta.schema_version === "tech-ai-magazine/v2")) {
    const r = spawnSync(
      "python3",
      [
        "scripts/validate_encyclopedia.py",
        "--vault-root",
        path.resolve(vault),
        "--briefing",
        path.resolve(issue.file),
      ],
      { encoding: "utf8" },
    )
    if (r.status !== 0) errors.push(r.stdout + r.stderr)
  }
  if (errors.length) throw new Error(errors.join("\n"))
  console.log(
    `PASS: ${files.length} notes; internal links, ${all.filter((i) => i.meta.schema_version === "tech-ai-magazine/v2").length} magazine v2 editions, encyclopedia and source references.`,
  )
}
export function feeds(vault = "vault", output = "public") {
  const original = editions(vault)
  const library = briefingLibrary(
    vault,
    original,
    new Map(original.map((i) => [i.slug, extractArticles(i)])),
  )
  const all = original.toReversed().filter((i) => i.meta.coverage_end)
  const config = YAML.parse(fs.readFileSync("quartz.config.yaml", "utf8"))
  const base = "https://" + config.configuration.baseUrl.replace(/\/$/, "")
  const items = all
    .slice(0, 40)
    .map((i) => {
      const url =
        base +
        "/" +
        slugifyFilePath(i.slug.replace(/^Editions\//, "Briefings/") + ".md")
          .split("/")
          .map(encodeURIComponent)
          .join("/")
      const title =
        String(i.meta.date) +
        " 아침 브리핑" +
        (i.body.includes("**한 줄 편집:**") ? " · " + library.byKey.get(i.slug).lead : "")
      return `<item><title>${escapeXML(title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><pubDate>${coverageDate(i.meta.coverage_end).toUTCString()}</pubDate><description>${escapeXML(feedDescription(library.byKey.get(i.slug), base))}</description></item>`
    })
    .join("\n")
  write(
    path.join(output, "briefing.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><atom:link href="${base}/briefing.xml" rel="self" type="application/rss+xml"/><title>아침 브리핑</title><link>${base}/briefings/index</link><description>IT, AI, 로보틱스의 변화와 연결된 지식</description><language>ko-kr</language>${items}</channel></rss>\n`.replace(
      /[^\x00-\x7F]/gu,
      (c) => `&#${c.codePointAt(0)};`,
    ),
  )
  console.log("Wrote daily-only RSS: " + path.join(output, "briefing.xml"))
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const command = process.argv[2]
    if (command === "refresh") refresh()
    else if (command === "validate") validate()
    else if (command === "feeds") feeds()
    else if (command === "context") {
      const c = JSON.parse(fs.readFileSync("data/catalog.json", "utf8"))
      const all = editions("vault")
      const library = briefingLibrary(
        "vault",
        all,
        new Map(all.map((i) => [i.slug, extractArticles(i)])),
        { requireLatest: false },
      )
      console.log(
        JSON.stringify(
          {
            latest_cutoff: c.latest_cutoff,
            known_source_count: c.known_sources.length,
            known_sources: c.known_sources,
            ...classificationHistory(library.issues),
            editorial: editorialContext(library.issues),
            watchlist: JSON.parse(
              fs.readFileSync(new URL("../data/research-watchlist.json", import.meta.url), "utf8"),
            ),
            discovery_sources: JSON.parse(
              fs.readFileSync(
                new URL("../data/research-source-channels.json", import.meta.url),
                "utf8",
              ),
            ),
            source_diversity: sourceDiversity(all, extractArticles, library.latest.date),
            research_policy: {
              theme_format: THEME_FORMAT,
              channels: ["기술·제품", "기업·운영"],
              themes: THEMES,
              workflow: "docs/NEWS_THEMES.md",
            },
            latest_issue: {
              edition: library.latest.key,
              date: library.latest.date,
              trend_review_exists: Boolean(library.latest.snapshot.review),
              articles: library.latest.items.map((a) => ({
                event_id: a.id,
                title: a.title,
                urls: a.urls,
                sector: a.sector,
                ...classificationMeta(a),
              })),
            },
            trend_topics: library.latest.snapshot.topics.map((t) => ({
              id: t.id,
              title: t.title,
              thesis: t.thesis,
              watch_for: t.watch_for,
              disconfirming: t.disconfirming,
              latest_observations: t.history.slice(-3).map((s) => ({
                id: s.id,
                date: s.date,
                change: s.change,
                next_check: s.next_check,
              })),
              lessons: t.lessons,
            })),
          },
          null,
          2,
        ),
      )
    } else throw new Error("Usage: node scripts/garden.mjs refresh|validate|feeds|context")
  } catch (e) {
    console.error(e.message)
    process.exitCode = 1
  }
}
