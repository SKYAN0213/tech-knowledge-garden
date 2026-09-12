import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import YAML from "yaml"
import { slugifyFilePath } from "@quartz-community/utils"

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
const escapeXML = (s) =>
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
  const sources = sourceMap(edition.body)
  return sections(edition.body)
    .filter((s) => ["커버 스토리", "뉴스 데스크", "리서치 노트", "도구 상자"].includes(s.title))
    .flatMap((desk) =>
      sections(desk.body, 2).map((part) => {
        const markers = unique([...part.body.matchAll(/\[(S\d+)\]/g)].map((m) => m[1]))
        if (!markers.length || markers.some((m) => !sources.has(m)))
          throw new Error(`Unresolved article sources: ${edition.file}: ${part.title}`)
        const urls = unique(markers.map((m) => sources.get(m)))
        // The original announcement identifies an event. Follow-up editions reuse the same note.
        const id = digest(canonicalURL(urls[0]))
        const concepts = wikiTargets(part.body).filter((p) => p.startsWith("Knowledge/"))
        const leadLines = part.body
          .split("\n")
          .map((l) => l.replace(/^>\s?/, "").trim())
          .filter((l) => l && !/^\[!|^#{1,6} |^\*\*(?:개념|근거|공식 변경)|^\[\[/.test(l))
        const summary = strip(leadLines[0] || part.title)
          .replace(/^[^:：]{1,20}[:：]\s*/, "")
          .slice(0, 240)
        return {
          id,
          title: part.title,
          body: part.body,
          summary,
          desk: desk.title,
          urls,
          markers,
          sources: Object.fromEntries(markers.map((m) => [m, sources.get(m)])),
          concepts,
          edition,
        }
      }),
    )
}
export function refresh(vault = "vault") {
  vault = path.resolve(vault)
  const all = editions(vault)
  if (!all.length) throw new Error("No editions found. Migrate or author an edition first.")
  const articles = new Map(),
    issueArticles = new Map()
  for (const issue of all) {
    const current = extractArticles(issue)
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
  const generated = []
  const emit = (slug, meta, body) => {
    const f = path.join(vault, slug + ".md")
    write(f, noteText({ ...meta, generated_by: "tech-knowledge-garden" }, body))
    generated.push(slug)
  }
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
        event_id: item.id,
        source_url: item.urls[0],
        sources: item.urls,
        concepts: item.concepts,
        description: item.summary,
      },
      `${wiki("index", "← 오늘의 헤드라인")} · ${item.desk} · 처음 수록 ${item.first_seen}\n\n${item.body}\n\n## 이어 읽기\n\n${item.concepts.map((c) => "- " + wiki(c, path.basename(c))).join("\n") || "연결된 개념 없음"}\n\n## 이 소식을 다룬 브리핑\n\n${item.appearances.map((s) => "- " + wiki(s.replace(/^Editions\//, "Briefings/"), path.basename(s).slice(0, 10) + " 브리핑")).join("\n")}\n\n## 출처\n\n${Object.entries(
        item.sources,
      )
        .map(([k, v]) => `- [${k}] ${v}`)
        .join(
          "\n",
        )}\n\n기사는 기존 취재 원고에서 옮겼습니다. 원문 게시 시각과 취재 시각은 해당 ${wiki(issue.slug, "매거진 원고")}에서 확인할 수 있습니다.`,
    )
  }
  for (const issue of all) {
    const items = issueArticles.get(issue.slug),
      date = String(issue.meta.date || path.basename(issue.file).slice(0, 10))
    const line = issue.body.match(/\*\*한 줄 편집:\*\*\s*(.+)/)?.[1]
    const heading = line
      ? strip(line)
      : items.length
        ? "오늘의 핵심 소식과 연결된 개념을 읽습니다."
        : "이전 형식의 브리핑 원문을 보관했습니다."
    let body = `${wiki("index", "← 홈")} · ${wiki("Briefings/index", "브리핑 전체")} · ${wiki("Trends/index", "주간 흐름")}\n\n> ${heading}\n\n## 헤드라인\n\n`
    body += items.length
      ? items
          .map(
            (a, i) =>
              `### ${String(i + 1).padStart(2, "0")} · ${wiki("News/" + a.id, a.title)}\n\n${a.summary}\n\n${a.concepts.map((c) => wiki(c, path.basename(c))).join(" · ")}`,
          )
          .join("\n\n")
      : issue.meta.new_items_count === 0
        ? "새로 확인한 소식 없음. 취재 범위와 점검 기록은 아래 매거진 원문에서 확인합니다."
        : "이 시기의 원고는 이전 형식으로 작성되었습니다. 전체 내용과 출처는 아래 매거진 원문에서 읽을 수 있습니다."
    const flow = sections(issue.body).find((s) => s.title === "흐름 읽기")?.body
    if (flow && flow !== "없음")
      body += `\n\n## 오늘의 흐름\n\n${flow}\n\n${sections(issue.body).find((s) => s.title === "Source List")?.body || ""}`
    body += `\n\n## 매거진 원문\n\n${wiki(issue.slug, "전체 원고 · 적용 아이디어 · 취재 출처")}\n\n취재 구간: ${issue.meta.coverage_start || "원문 참조"} → ${issue.meta.coverage_end || "원문 참조"}`
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
      },
      body,
    )
  }
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
    { title: "브리핑 보관함", type: "index", date },
    `${all.length}개의 취재 원고가 날짜순으로 연결되어 있습니다.\n\n${all
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
    { title: "소식 상세", type: "index", date },
    `${articles.size}개의 원문 발표를 기사로 연결했습니다. 같은 원문을 다룬 후속 브리핑은 한 기사에 함께 연결됩니다.\n\n${[
      ...articles.values(),
    ]
      .reverse()
      .map((a) => "- " + wiki("News/" + a.id, a.title) + " · " + String(a.edition.meta.date))
      .join("\n")}`,
  )
  emit(
    "index",
    {
      title: "기술의 다음 장",
      type: "home",
      cssclasses: ["garden-home"],
      date,
      description: "IT · AI · 로보틱스. 오늘의 변화를 읽고, 내일의 지식으로 연결합니다.",
    },
    `<div class="masthead-label">TECH KNOWLEDGE GARDEN · IT / AI / ROBOTICS</div>\n\n<div class="garden-deck">오늘의 변화를 읽고,<br>내일의 지식으로 연결합니다.</div>\n\n${wiki("Briefings/index", "브리핑 보관함")} · ${wiki("Knowledge/00 Tech Encyclopedia Index", "개념 사전")} · ${wiki("Trends/index", "주간 흐름")} · ${wiki("Knowledge Maps/AI Technology Knowledge Map", "지식 지도")} · [RSS 구독](./briefing.xml)\n\n---\n\n## ${date.replaceAll("-", ".")} · 최신 브리핑\n\n${latestItems.length ? latestItems.map((a, i) => `### ${String(i + 1).padStart(2, "0")}\n\n#### ${wiki("News/" + a.id, a.title)}\n\n${a.summary}\n\n${a.concepts.map((c) => wiki(c, path.basename(c))).join(" · ")}`).join("\n\n---\n\n") : "새 항목이 없는 회차입니다. 취재 기록은 오늘의 브리핑에서 확인합니다."}\n\n${wiki(briefSlug(latest), "브리핑 전체 읽기 →")}\n\n---\n\n## 축적된 지식\n\n**${all.length}회** 브리핑 · **${articles.size}개** 사건 · **${concepts.length}개** 개념\n\n${wiki("Knowledge/00 Tech Encyclopedia Index", "개념 사전 펼치기 →")}\n\n## 최근 브리핑\n\n${all
      .slice(-6)
      .reverse()
      .map((i) => "- " + wiki(briefSlug(i), String(i.meta.date) + " 아침 브리핑"))
      .join(
        "\n",
      )}\n\n## 읽고, 연결하고, 공유하기\n\n이곳의 기사와 개념 노트는 하나의 Obsidian vault에서 이어집니다. 기사에서 원문을 확인하고, 연결된 개념과 주간 기록으로 생각을 넓혀보세요.\n\n${wiki("About", "이 공간 소개 · 읽는 방법")}`,
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
  for (const f of files) {
    const { meta, body } = parseNote(fs.readFileSync(f, "utf8"))
    for (const key of ["publish", "draft", "unlisted", "password"])
      if (key in meta) errors.push(`${f}: ${key} is unsupported; this is a wholly public vault`)
    for (const target of wikiTargets(body))
      if (!slugs.has(target.replace(/\.md$/, "")))
        errors.push(`${f}: unresolved wikilink ${target}`)
    if (/(?:sk-proj-|ghp_)[a-zA-Z0-9]{20,}/.test(body)) errors.push(`${f}: credential-like text`)
  }
  const all = editions(vault),
    dates = []
  for (const issue of all) {
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
  const all = editions(vault)
    .toReversed()
    .filter((i) => i.meta.coverage_end)
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
      return `<item><title>${escapeXML(String(i.meta.date) + " 아침 브리핑")}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><pubDate>${new Date(i.meta.coverage_end).toUTCString()}</pubDate><description>${escapeXML(i.body.match(/\*\*한 줄 편집:\*\*\s*(.+)/)?.[1] || "IT · AI · 로보틱스 브리핑")}</description></item>`
    })
    .join("\n")
  write(
    path.join(output, "briefing.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>기술의 다음 장 · 아침 브리핑</title><link>${base}</link><description>IT, AI, 로보틱스의 변화와 연결된 지식</description><language>ko-kr</language>${items}</channel></rss>\n`,
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
      console.log(
        JSON.stringify(
          {
            latest_cutoff: c.latest_cutoff,
            known_source_count: c.known_sources.length,
            known_sources: c.known_sources,
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
