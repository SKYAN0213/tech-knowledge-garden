const normalize = (text) =>
  String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .trim()
const grammarWords = new Set([
  "최근",
  "최신",
  "요즘",
  "관련",
  "뉴스",
  "소식",
  "자료",
  "내용",
  "근거",
  "대해",
  "대한",
  "대해서",
  "알려줘",
  "알려주세요",
  "알려",
  "설명",
  "설명해줘",
  "정리",
  "정리해줘",
  "어떤",
  "무엇",
  "뭐",
  "어떻게",
  "있나",
  "있나요",
  "있어",
  "있을까",
  "인가",
  "인가요",
  "했나",
  "했나요",
  "했어",
  "됐나",
  "됐나요",
])
export function readerSearchTerms(query) {
  return [
    ...new Set(
      normalize(query)
        .replace(/[?？!！,，:：;；()[\]{}"'“”‘’]/g, " ")
        .split(/\s+/)
        .map((word) =>
          /[가-힣]/.test(word)
            ? word.replace(
                /(?:에서는|에서|으로는|으로|에게|까지|부터|은|는|이|가|을|를|의|와|과|에)$/,
                "",
              )
            : word,
        )
        .filter((word) => word && !grammarWords.has(word)),
    ),
  ]
}

// Lexical retrieval of already published material. Query grammar normalization
// does not merge entities, resolve aliases, or generate an answer.
export function searchReaderEntries(entries, query, { limit = 40, type = "" } = {}) {
  const terms = readerSearchTerms(query)
  if (!terms.length) return []
  return entries
    .filter((row) => !type || row.type === type)
    .map((row) => {
      const facts = (Array.isArray(row.facts) ? row.facts : []).filter(
        (fact) => typeof fact.text === "string",
      )
      const title = normalize(
        [row.title, ...(row.aliases || []), ...(row.keywords || [])].join(" "),
      )
      const text = normalize([title, row.text, ...facts.map((fact) => fact.text)].join(" "))
      const score = terms.every((term) => text.includes(term))
        ? terms.reduce((sum, term) => sum + (title.includes(term) ? 5 : 1), 0)
        : 0
      const matchedFacts = facts.filter((fact) =>
        terms.some((term) => normalize(fact.text).includes(term)),
      )
      return {
        ...row,
        score,
        matched_facts: matchedFacts.length ? matchedFacts.slice(0, 2) : facts.slice(0, 1),
      }
    })
    .filter((row) => row.score)
    .sort((a, b) => b.score - a.score || String(b.date || "").localeCompare(String(a.date || "")))
    .filter((row, index, all) => all.findIndex((other) => other.url === row.url) === index)
    .slice(0, limit)
}

export function readerSearchEvidence(entry) {
  const day = String(entry.date || "").slice(0, 10)
  const dateLabel = day
    ? `${entry.type === "키워드" ? "검토" : ["기업", "누적 주제"].includes(entry.type) ? "최근 기사" : ""} ${day}`.trim()
    : ""
  const facts = entry.matched_facts || []
  // An aggregate's other sources must not appear to support the displayed fact.
  const sourceUrls = [
    ...new Set(
      facts.length ? facts.flatMap((fact) => fact.source_urls || []) : entry.source_urls || [],
    ),
  ].filter((url) => /^https?:\/\//.test(url))
  return { dateLabel, facts, sourceUrls }
}
