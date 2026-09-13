import { SECTORS, SECTOR_FORMAT } from "./sectors.mjs"

export const THEME_FORMAT = "news-themes/v1"
// The last published issue predates adoption. Historical editions remain unchanged.
export const THEME_REQUIRED_FROM = "2026-09-14"
export const THEMES = [
  {
    id: "research",
    name: "연구·기술",
    tags: ["새로운 방법", "성능 개선", "비용 절감", "실증·재현"],
  },
  {
    id: "products",
    name: "제품·서비스",
    tags: ["신제품", "기능 추가", "가격 변경", "서비스 종료"],
  },
  { id: "business", name: "사업·고객", tags: ["고객 도입", "수주·계약", "시장 진출", "사업 철수"] },
  {
    id: "financials",
    name: "실적·재무",
    tags: ["매출", "수익성", "현금흐름", "부채", "실적 전망"],
  },
  {
    id: "capital",
    name: "투자·기업거래",
    tags: ["투자 유치", "지분 투자", "인수합병", "사업 매각"],
  },
  {
    id: "people",
    name: "인력·조직",
    tags: ["채용 확대", "인력 감축", "핵심 인재 이동", "조직 개편", "경영진 교체"],
  },
  {
    id: "supply",
    name: "생산·공급망",
    tags: ["설비 투자", "증설", "양산", "공급 부족", "조달 변경"],
  },
  {
    id: "ecosystem",
    name: "표준·생태계",
    tags: ["기술 제휴", "표준 채택", "호환성", "오픈소스", "라이선스"],
  },
  {
    id: "policy",
    name: "정책·규제",
    tags: ["인허가", "보조금", "수출 통제", "반독점", "법률 변경"],
  },
  { id: "incidents", name: "위험·사고", tags: ["보안 사고", "서비스 장애", "리콜", "안전 문제"] },
]
const byName = new Map(THEMES.map((t) => [t.name, t]))
const sectorIDs = [
  "ai",
  "software-cloud",
  "cybersecurity",
  "semiconductors-computing",
  "robotics-manufacturing",
  "energy-climate",
  "bio-medical",
  "space-science",
]
const fields = ["분야", "테마", "보조 테마", "세부 태그", "기업·기관"]
export const isClassificationLine = (line) =>
  /^\*\*(?:분야|테마|보조 테마|세부 태그|기업·기관):\*\*/.test(line.trim())
export const articleProse = (body) =>
  body
    .split("\n")
    .filter((line) => !isClassificationLine(line))
    .join("\n")

export function usesThemes(issue) {
  const format = issue.meta.theme_format
  const required = String(issue.meta.date || "") >= THEME_REQUIRED_FROM
  if ((format !== undefined || required) && format !== THEME_FORMAT)
    throw Error(`Missing or invalid theme_format: ${issue.file || issue.slug}`)
  if (format === THEME_FORMAT && issue.meta.briefing_format !== SECTOR_FORMAT)
    throw Error("Themed editions require sector-five/v1")
  return format === THEME_FORMAT
}

export function classifyArticle(body, title) {
  const values = Object.fromEntries(
    fields.map((field) => {
      const matches = [
        ...body.matchAll(new RegExp(`^\\*\\*${field}:\\*\\*[ \\t]*([^\\r\\n]*)\\r?$`, "gm")),
      ]
      if (matches.length !== 1 || !matches[0][1].trim())
        throw Error(`Missing or repeated classification ${field}: ${title}`)
      return [field, matches[0][1].trim().normalize("NFC")]
    }),
  )
  const theme = values["테마"],
    secondary_theme = values["보조 테마"] === "없음" ? null : values["보조 테마"]
  if (
    !byName.has(theme) ||
    (secondary_theme && (!byName.has(secondary_theme) || secondary_theme === theme))
  )
    throw Error(`Invalid primary or secondary theme: ${title}`)
  const list = (s) => s.split(",").map((v) => v.trim())
  const event_tags = list(values["세부 태그"])
  const allowed = new Set([
    ...(byName.get(theme)?.tags || []),
    ...(byName.get(secondary_theme)?.tags || []),
  ])
  if (
    event_tags.length > 3 ||
    new Set(event_tags).size !== event_tags.length ||
    event_tags.some((t) => !allowed.has(t))
  )
    throw Error(`Invalid or excessive event tags: ${title}`)
  const entities = values["기업·기관"] === "없음" ? [] : list(values["기업·기관"])
  if (
    new Set(entities).size !== entities.length ||
    entities.some((e) => !e || e === "없음" || /[<>\[\]`]/.test(e))
  )
    throw Error(`Invalid or repeated entities: ${title}`)
  if (!SECTORS.includes(values["분야"])) throw Error(`Invalid article sector: ${title}`)
  return { theme, secondary_theme, event_tags, entities }
}

export function classificationMeta(article) {
  if (!article.classification) return {}
  const c = article.classification
  return {
    theme_format: THEME_FORMAT,
    sector: article.sector,
    ...c,
    tags: [
      "sector/" + sectorIDs[SECTORS.indexOf(article.sector)],
      ...[c.theme, c.secondary_theme].filter(Boolean).map((t) => "theme/" + byName.get(t).id),
      ...c.event_tags.map((t) => "event/" + t.replace(/[ ·]/g, "-")),
    ],
  }
}

export function classificationText(article) {
  const c = article.classification
  return c
    ? [c.theme, c.secondary_theme, ...c.event_tags, ...c.entities].filter(Boolean).join(" · ")
    : ""
}
export function classificationMarkdown(article) {
  const text = classificationText(article)
  // Editorial metadata stays literal in Markdown, including company names.
  return text ? text.replace(/[\\`*_{}\[\]<>#|]/g, "\\$&") + "\n\n" : ""
}

export function classificationHistory(issues) {
  const events = new Map()
  for (const issue of issues)
    for (const a of issue.items) {
      if (a.classification)
        events.set(a.id, {
          event_id: a.id,
          date: issue.date,
          title: a.title,
          sector: a.sector,
          ...a.classification,
          urls: a.urls,
        })
    }
  return {
    known_entities: [...new Set([...events.values()].flatMap((a) => a.entities))].sort((a, b) =>
      a.localeCompare(b, "ko"),
    ),
    recent_classified_events: [...events.values()]
      .sort((a, b) => b.date.localeCompare(a.date) || a.event_id.localeCompare(b.event_id))
      .slice(0, 60),
  }
}
