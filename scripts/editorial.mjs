// Editorial evidence is author-reviewed metadata, never graph-matching prose.
export const EDITORIAL_FORMAT = "six-w/v1"
export const DEEP_KINDS = ["기업 전략", "논문 해설", "연구 사업화"]
const text = (s) => typeof s === "string" && s.trim().length > 0
const fail = (s) => {
  throw Error("Editorial: " + s)
}
export function requireEditorial(issue) {
  if (String(issue.meta.date) >= "2026-09-14" && issue.meta.editorial_format !== EDITORIAL_FORMAT)
    fail("new editions require editorial_format: six-w/v1")
}
export function applyEditorial(issue, articles) {
  if (issue.meta.editorial_format === undefined) return articles
  if (issue.meta.editorial_format !== EDITORIAL_FORMAT) fail("unknown editorial_format")
  const records = issue.meta.article_records
  if (!Array.isArray(records) || records.length !== articles.length)
    fail("article_records must match articles")
  const titles = new Set(),
    works = new Set()
  for (const a of articles) {
    const matches = records.filter((r) => r.title === a.title)
    if (matches.length !== 1 || titles.has(a.title))
      fail("unique matching title required: " + a.title)
    titles.add(a.title)
    const r = matches[0]
    if (!["사건 뉴스", ...DEEP_KINDS].includes(r.kind)) fail("invalid article kind")
    if (!["국내", "해외", "국제 공동"].includes(r.region)) fail("invalid region")
    for (const k of ["who", "when", "where", "what", "how", "why"])
      if (!text(r.facts?.[k])) fail("missing six-w fact: " + k)
    if (!text(r.lead) || r.lead.length > 900 || /[<>\n]/.test(r.lead)) fail("invalid lead")
    if (!a.body.includes(r.lead)) fail("lead must occur verbatim in article prose")
    if (/^(?:### (?:무엇이 바뀌었나|왜 중요한가)|\*\*(?:핵심|의미|확인할 점):)/m.test(a.body))
      fail("replace generic news prompts with factual prose")
    if (!Array.isArray(r.papers) || !Array.isArray(r.relations) || !Array.isArray(r.topic_ids))
      fail("papers, relations and topic_ids require explicit arrays")
    for (const p of r.papers) {
      if (!text(p.work_id) || !/^[a-z0-9-]+$/.test(p.work_id) || works.has(p.work_id))
        fail("duplicate or invalid paper work_id")
      works.add(p.work_id)
      if (
        !Array.isArray(p.identifiers) ||
        !p.identifiers.length ||
        p.identifiers.some((v) => !/^(doi:10\.\S+|arxiv:\d{4}\.\d{4,5}(v\d+)?)$/i.test(v))
      )
        fail("invalid paper identifiers")
      if (!["초록", "전문"].includes(p.access) || !["사전공개", "동료심사"].includes(p.status))
        fail("paper access/status required")
      if (!a.urls.includes(p.evidence_url)) fail("paper evidence must be an article source")
    }
    if (r.kind === "논문 해설" && (!r.papers.length || r.papers.some((p) => p.access !== "전문")))
      fail("deep paper analysis requires full text")
    for (const rel of r.relations) {
      if (!["공동저자", "기술자문", "기술이전", "공동창업", "창업", "소속"].includes(rel.role))
        fail("invalid relationship role")
      for (const k of ["person_id", "person_name", "affiliation", "organization", "claim", "as_of"])
        if (!text(rel[k])) fail("relationship missing " + k)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rel.as_of) || rel.as_of > String(issue.meta.date))
        fail("invalid relationship date")
      if (
        !Array.isArray(rel.evidence_urls) ||
        !rel.evidence_urls.length ||
        rel.evidence_urls.some((u) => !a.urls.includes(u))
      )
        fail("relationship evidence missing")
      if (["창업", "공동창업"].includes(rel.role) && rel.evidence_urls.length < 2)
        fail("founder needs university and company evidence")
    }
    if (
      r.kind === "연구 사업화" &&
      !r.relations.some((r) => ["창업", "공동창업", "기술이전"].includes(r.role))
    )
      fail("commercialization requires verified relationship")
    if (r.kind !== "사건 뉴스") {
      if (
        !text(r.analysis_summary) ||
        !text(r.next_check) ||
        !r.topic_ids.length ||
        !/분석/.test(a.body)
      )
        fail("deep analysis needs summary, next check, topic and labeled analysis")
    }
    if (r.topic_ids.some((id) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))) fail("invalid topic id")
    a.editorial = r
    a.summary = r.lead
  }
  const deep = articles.filter((a) => a.editorial.kind !== "사건 뉴스")
  if (deep.length > 1) fail("maximum one deep analysis")
  if (!deep.length && !text(issue.meta.deep_skip_reason))
    fail("record why deep analysis was skipped")
  const headlines = issue.meta.headlines
  if (
    !Array.isArray(headlines) ||
    new Set(headlines).size !== headlines.length ||
    headlines.some((t) => !titles.has(t)) ||
    headlines.length < Math.min(3, articles.length) ||
    headlines.length > Math.min(5, articles.length)
  )
    fail("choose 3-5 real headlines, or all when fewer")
  return articles
}
export const editorialMeta = (a) =>
  a.editorial ? { editorial_format: EDITORIAL_FORMAT, ...a.editorial, title: a.title } : {}
export const topArticles = (i) =>
  (i.original.meta.headlines || []).map((t) => i.items.find((a) => a.title === t)).filter(Boolean)
export function editorialMarkdown(i, position, render) {
  if (i.original.meta.editorial_format !== EDITORIAL_FORMAT) return ""
  const articles =
    position === "top" ? topArticles(i) : i.items.filter((a) => a.editorial?.kind !== "사건 뉴스")
  if (!articles.length) return ""
  return (
    `## ${position === "top" ? "주요 소식" : "오늘의 심층 분석"}\n\n` +
    articles.map(render).join("\n\n") +
    "\n\n"
  )
}
export function editorialContext(issues) {
  const editions = issues.filter((i) => i.original.meta.editorial_format === EDITORIAL_FORMAT)
  const deep = editions.flatMap((i) =>
    i.items
      .filter((a) => a.editorial?.kind !== "사건 뉴스")
      .map((a) => ({ date: i.date, event_id: a.id, ...a.editorial })),
  )
  const last = deep.at(-1)
  return {
    next_deep_kind: DEEP_KINDS[(DEEP_KINDS.indexOf(last?.kind) + 1) % 3],
    recent_deep: deep.slice(-30),
    article_evidence: editions.flatMap((i) =>
      i.items.map((a) => ({ date: i.date, event_id: a.id, ...a.editorial })),
    ),
  }
}

export function validateIdentities(issues) {
  const papers = new Map(),
    people = new Map()
  for (const i of issues)
    for (const a of i.items) {
      for (const p of a.editorial?.papers || [])
        for (const raw of p.identifiers) {
          const key = raw.toLowerCase().replace(/^(arxiv:.*)v\d+$/, "$1")
          if (papers.has(key) && papers.get(key) !== p.work_id)
            fail("paper identifier assigned to different works: " + raw)
          papers.set(key, p.work_id)
        }
      for (const r of a.editorial?.relations || []) {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.person_id)) fail("invalid person_id")
        if (people.has(r.person_id) && people.get(r.person_id) !== r.person_name)
          fail("person identity needs explicit name reconciliation")
        people.set(r.person_id, r.person_name)
      }
    }
}
