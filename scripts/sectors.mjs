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
export function sectorGroups(issue, articles) {
  if (issue?.meta?.briefing_format !== SECTOR_FORMAT) return null
  const groups = SECTORS.map((name) => ({ name, items: articles.filter((a) => a.sector === name) }))
  for (const a of articles) {
    if (!SECTORS.includes(a.sector))
      throw new Error(`Missing or invalid article sector: ${a.title}`)
  }
  for (const g of groups) {
    if (g.items.length > 5) throw new Error(`More than five briefings in sector: ${g.name}`)
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
        `### ${g.name} · ${g.items.length}건\n\n${g.items.length ? g.items.map(render).join("\n\n") : "수록 없음"}`,
    )
    .join("\n\n")}`
}
