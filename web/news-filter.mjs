const normalize = (text) =>
  String(text || "")
    .normalize("NFC")
    .toLocaleLowerCase("en-US")
    .trim()

// Conjunction across dimensions; either reviewed theme may satisfy the theme filter.
export function matchesNews(article, { query = "", sector = "", theme = "", entity = "" } = {}) {
  const exact = (a, b) => normalize(a) === normalize(b)
  if (sector && !exact(article.sector, sector)) return false
  if (theme && !(article.themes || []).some((t) => exact(t, theme))) return false
  if (entity && !(article.entities || []).some((e) => exact(e, entity))) return false
  const text = normalize(
    [
      article.text,
      article.sector,
      ...(article.themes || []),
      ...(article.tags || []),
      ...(article.entities || []),
    ].join(" "),
  )
  return normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => text.includes(term))
}
