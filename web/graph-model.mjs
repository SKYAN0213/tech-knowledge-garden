// The map contains reviewed learning terms. News is attached data, never another node.
export const normalizeTerm = (value) =>
  String(value).normalize("NFC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim()
export function mentions(text, phrase) {
  const haystack = normalizeTerm(text),
    needle = normalizeTerm(phrase)
  if (!needle) return false
  let index = haystack.indexOf(needle)
  while (index !== -1) {
    const before = haystack[index - 1] || "",
      after = haystack[index + needle.length] || ""
    if (
      (!/^[a-z0-9]/.test(needle) || !/[a-z0-9_]/.test(before)) &&
      (!/[a-z0-9]$/.test(needle) || !/[a-z0-9_]/.test(after))
    )
      return true
    index = haystack.indexOf(needle, index + 1)
  }
  return false
}
export const learningKinds = [
  "mechanism",
  "protocol",
  "architecture",
  "model",
  "evaluation",
  "metric",
  "security",
]
export function isLearningTerm(node) {
  const review = node.mapReview
  if (!review) return false
  if (
    !["include", "exclude"].includes(review.decision) ||
    typeof review.reason !== "string" ||
    review.reason.trim().length < 10 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(review.reviewed || "")
  )
    throw Error("Invalid learning-term review: " + node.id)
  if (review.decision === "exclude") return false
  if (
    !learningKinds.includes(review.kind) ||
    !node.definition?.trim() ||
    !node.slug ||
    !node.sources?.length ||
    !node.sources.every((u) => /^https:\/\//.test(u))
  )
    throw Error("Learning term needs a definition, reading page and source review: " + node.id)
  return true
}
export function assembleGraph(concepts, articles, associations = []) {
  const all = new Map(concepts.map((n) => [n.id, n]))
  if (all.size !== concepts.length) throw Error("Duplicate concept identity")
  const selected = concepts.filter(isLearningTerm)
  const nodes = selected.map(({ path, keywords, mapReview, ...n }) => ({
    ...n,
    kind: "concept",
    learningKind: mapReview.kind,
    learningReason: mapReview.reason,
  }))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const termNames = new Map()
  for (const n of nodes)
    for (const name of [n.label, n.title, ...n.aliases]) {
      const key = normalizeTerm(name)
      if (termNames.has(key) && termNames.get(key) !== n.id)
        throw Error("Ambiguous learning term: " + name)
      termNames.set(key, n.id)
    }
  const pairs = new Map()
  for (const a of associations) {
    if (!all.has(a.source) || !all.has(a.target)) throw Error("Unknown association endpoint")
    if (!a.reason?.trim()) throw Error("Association requires a confirmed reason")
    if (a.source === a.target || !byId.has(a.source) || !byId.has(a.target)) continue
    const [source, target] = [a.source, a.target].sort(),
      key = source + "\u0000" + target
    if (!pairs.has(key)) pairs.set(key, { source, target, weight: 2, connections: [] })
    const edge = pairs.get(key)
    if (!edge.connections.some((c) => c.reason === a.reason))
      edge.connections.push({ kind: "confirmed", reason: a.reason, evidence: a.evidence || [] })
  }
  const articleIds = new Set()
  const publicArticles = articles.map(({ text, conceptIds, ...article }) => {
    if (articleIds.has(article.id)) throw Error("Duplicate article identity")
    articleIds.add(article.id)
    if (conceptIds.some((id) => !all.has(id))) throw Error("Unknown article concept")
    const matches = []
    for (const n of nodes) {
      if (conceptIds.includes(n.id)) matches.push({ termId: n.id, basis: "editorial" })
      else {
        const name = [n.label, n.title, ...n.aliases].find((name) => mentions(text, name))
        if (name) matches.push({ termId: n.id, basis: "mention", matched: name })
      }
    }
    return { ...article, termIds: matches.map((m) => m.termId), matches }
  })
  const edges = [...pairs.values()]
    .sort((a, b) =>
      (a.source + "\u0000" + a.target).localeCompare(b.source + "\u0000" + b.target, "en"),
    )
    .map((e, i) => ({ ...e, id: "edge:" + i }))
  for (const n of nodes) {
    n.degree = edges.filter((e) => e.source === n.id || e.target === n.id).length
    n.size = 4 + Math.sqrt(n.degree) * 0.65
  }
  return {
    schema: "learning-connections/v3",
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id, "en")),
    edges,
    articles: publicArticles,
  }
}
export function resolveFocus(data, id) {
  if (!id) return null
  if (data.nodes.some((n) => n.id === id)) return id
  const article = data.articles.find((a) => a.id === id)
  if (article) return article.termIds[0] || null
  if (id.startsWith("keyword:")) {
    const name = normalizeTerm(id.slice(8))
    return (
      data.nodes.find((n) =>
        [n.label, n.title, ...n.aliases].some((a) => normalizeTerm(a) === name),
      )?.id || null
    )
  }
  return null
}
export function relatedNews(data, selectedId) {
  const nodes = new Map(data.nodes.map((n) => [n.id, n]))
  if (!nodes.has(selectedId)) return []
  const neighbors = new Set(
    data.edges
      .filter((e) => e.connections.some((c) => c.kind === "confirmed"))
      .flatMap((e) =>
        e.source === selectedId ? [e.target] : e.target === selectedId ? [e.source] : [],
      ),
  )
  const found = []
  for (const article of data.articles) {
    const direct = article.matches.find((m) => m.termId === selectedId)
    if (direct)
      found.push({
        ...article,
        distance: 1,
        via: nodes.get(selectedId).label,
        rank: direct.basis === "editorial" ? 10 : 20,
      })
    else {
      const bridge = article.termIds.find((id) => neighbors.has(id))
      if (bridge) found.push({ ...article, distance: 2, via: nodes.get(bridge).label, rank: 30 })
    }
  }
  return found.sort(
    (a, b) =>
      a.rank - b.rank || String(b.date).localeCompare(String(a.date)) || a.id.localeCompare(b.id),
  )
}
