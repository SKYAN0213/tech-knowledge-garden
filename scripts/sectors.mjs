export const SECTORS = [
  "AI",
  "소프트웨어·클라우드",
  "사이버보안",
  "반도체·컴퓨팅",
  "로봇·제조",
  "에너지·기후기술",
  "바이오·의료기술",
  "우주·기초과학",
]
export const SECTOR_FORMAT = "sector-five/v1"
export const BRIEFING_GROUP_FORMAT = "related-events/v1"
export const briefingGroupFields = ["id", "title", "sector", "event_ids"]
// Editorial reading groups never change event identity or create knowledge relations.
export function reviewedBriefingGroups(groups, articles) {
  if (!Array.isArray(groups) || !groups.length) throw Error("Explicit briefing groups required")
  const ids = new Set(),
    members = new Set()
  for (const group of groups) {
    if (
      !group ||
      typeof group !== "object" ||
      Array.isArray(group) ||
      Object.keys(group).some((key) => !briefingGroupFields.includes(key)) ||
      typeof group.id !== "string" ||
      group.id.length > 80 ||
      !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(group.id) ||
      ids.has(group.id) ||
      typeof group.title !== "string" ||
      !group.title.trim() ||
      group.title.length > 140 ||
      /[<>\n\r]/.test(group.title) ||
      !SECTORS.includes(group.sector) ||
      !Array.isArray(group.event_ids) ||
      group.event_ids.length < 2
    )
      throw Error("Invalid or duplicate briefing group")
    ids.add(group.id)
    for (const id of group.event_ids) {
      const article = articles.find((a) => a.id === id)
      if (
        !/^[a-f0-9]{16}$/.test(id) ||
        members.has(id) ||
        !article ||
        article.sector !== group.sector ||
        article.review?.review_status !== "verified"
      )
        throw Error("Briefing group requires distinct verified events in the same sector")
      members.add(id)
    }
  }
  return groups
}
export function sectorGroups(issue, articles) {
  const grouped =
    issue?.meta?.briefing_groups !== undefined || issue?.meta?.briefing_group_format !== undefined
  if (
    grouped &&
    (issue.meta.briefing_format !== SECTOR_FORMAT ||
      issue.meta.briefing_group_format !== BRIEFING_GROUP_FORMAT)
  )
    throw Error("Briefing groups require the supported sector and group formats")
  if (issue?.meta?.briefing_format !== SECTOR_FORMAT) return null
  if (articles.length > 40) throw Error("More than forty detailed articles in briefing")
  const definitions = grouped ? reviewedBriefingGroups(issue.meta.briefing_groups, articles) : []
  const groups = SECTORS.map((name) => ({ name, items: articles.filter((a) => a.sector === name) }))
  for (const a of articles) {
    if (!SECTORS.includes(a.sector))
      throw new Error(`Missing or invalid article sector: ${a.title}`)
  }
  for (const g of groups) {
    if (grouped) {
      const seen = new Set()
      g.entries = g.items.flatMap((a) => {
        const definition = definitions.find((group) => group.event_ids.includes(a.id))
        if (!definition) return [{ items: [a] }]
        if (seen.has(definition.id)) return []
        seen.add(definition.id)
        return [
          {
            ...definition,
            items: definition.event_ids.map((id) => articles.find((a) => a.id === id)),
          },
        ]
      })
    }
    if ((g.entries || g.items).length > 5)
      throw new Error(`More than five briefings in sector: ${g.name}`)
    if (new Set(g.items.map((a) => a.id)).size !== g.items.length)
      throw new Error(`Duplicate event in sector: ${g.name}`)
  }
  if (new Set(articles.map((a) => a.id)).size !== articles.length)
    throw new Error("Duplicate event across sectors")
  return groups
}
export function sectorMarkdown(issue, articles, render) {
  const groups = sectorGroups(issue, articles)
  if (!groups) return null
  return `## 분야별 브리핑\n\n${groups
    .filter((g) => !issue.meta.article_reviews || g.items.length)
    .map(
      (g) =>
        `### ${g.name} · ${(g.entries || g.items).length}건\n\n${g.items.length ? (g.entries ? g.entries.map((entry) => (entry.id ? `#### ${entry.title}\n\n${entry.items.map((a) => render(a, { level: 5 })).join("\n\n")}` : render(entry.items[0], { level: 4 }))).join("\n\n") : g.items.map((a) => render(a, { level: 4 })).join("\n\n")) : "수록 없음"}`,
    )
    .join("\n\n")}`
}
