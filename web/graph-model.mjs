// An edge means association, never causation or a required citation direction.
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
    const firstLatin = /^[a-z0-9]/.test(needle),
      lastLatin = /[a-z0-9]$/.test(needle)
    if ((!firstLatin || !/[a-z0-9_]/.test(before)) && (!lastLatin || !/[a-z0-9_]/.test(after)))
      return true
    index = haystack.indexOf(needle, index + 1)
  }
  return false
}
export function assembleGraph(concepts, articles, associations = []) {
  const nodes = concepts.map((n) => ({ ...n, kind: "concept", conceptIds: [n.id] })),
    byId = new Map(nodes.map((n) => [n.id, n]))
  if (byId.size !== nodes.length) throw Error("Duplicate concept identity")
  const aliases = new Map()
  for (const n of nodes)
    for (const a of [n.label, n.title, ...(n.aliases || [])]) {
      const key = normalizeTerm(a)
      if (aliases.has(key) && aliases.get(key) !== n.id) aliases.set(key, null)
      else if (!aliases.has(key)) aliases.set(key, n.id)
    }
  const pairs = new Map(),
    keywords = new Map()
  const connect = (a, b, kind, reason, weight = 1, evidence = []) => {
    if (a === b) return
    if (!byId.has(a) || !byId.has(b)) throw Error("Unknown association endpoint: " + a + " / " + b)
    if (!reason?.trim()) throw Error("Association requires a confirmed reason")
    const [source, target] = [a, b].sort(),
      key = source + "\u0000" + target
    if (!pairs.has(key)) pairs.set(key, { source, target, weight: 0, connections: [] })
    const edge = pairs.get(key)
    if (!edge.connections.some((c) => c.kind === kind && c.reason === reason)) {
      edge.connections.push({ kind, reason, evidence })
      edge.weight = Math.min(5, edge.weight + weight)
    }
  }
  for (const n of concepts)
    for (const word of n.keywords) {
      const key = normalizeTerm(word)
      if (!key) continue
      const id = aliases.get(key) || "keyword:" + key
      if (!byId.has(id)) {
        const keyword = {
          id,
          label: word,
          title: word,
          kind: "keyword",
          keywords: [word],
          aliases: [],
          conceptIds: [],
          sources: [],
        }
        nodes.push(keyword)
        byId.set(id, keyword)
      }
      const node = byId.get(id)
      if (!node.conceptIds.includes(n.id)) node.conceptIds.push(n.id)
      if (!keywords.has(key)) keywords.set(key, { id, word })
      connect(n.id, id, "concept-keyword", n.label + "의 키워드: " + word, 0.7)
    }
  for (const a of associations)
    connect(a.source, a.target, "confirmed", a.reason, 2, a.evidence || [])
  const publicArticles = articles.map(({ text, ...article }) => article)
  for (const article of articles) {
    if (byId.has(article.id)) throw Error("Duplicate article identity")
    for (const id of article.conceptIds)
      if (!byId.has(id) || byId.get(id).kind !== "concept")
        throw Error("Unknown article concept " + id)
    const node = {
      id: article.id,
      kind: "news",
      slug: article.slug,
      label: article.title,
      title: article.title,
      date: article.date,
      keywords: [],
      aliases: [],
      conceptIds: article.conceptIds,
    }
    nodes.push(node)
    byId.set(node.id, node)
    for (const id of article.conceptIds)
      connect(node.id, id, "article-concept", byId.get(id).label, 1.7)
    for (const { id, word } of keywords.values())
      if (mentions(article.text, word)) connect(node.id, id, "article-keyword", word, 0.65)
  }
  const edges = [...pairs.values()]
    .sort((a, b) =>
      (a.source + "\u0000" + a.target).localeCompare(b.source + "\u0000" + b.target, "en"),
    )
    .map((e, i) => ({ ...e, id: "edge:" + i }))
  for (const n of nodes) {
    n.degree = edges.filter((e) => e.source === n.id || e.target === n.id).length
    n.size = n.kind === "concept" ? 4 + Math.sqrt(n.degree) * 0.55 : n.kind === "news" ? 2.5 : 1.8
  }
  return {
    schema: "news-connections/v2",
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id, "en")),
    edges,
    articles: publicArticles,
  }
}
// Related stories are reachable in at most two documented association steps.
// The intermediate label is returned so a shared keyword never masquerades as a direct editorial link.
export function relatedNews(data, selectedId) {
  const nodes = new Map(data.nodes.map((n) => [n.id, n])),
    articles = new Map(data.articles.map((n) => [n.id, n])),
    adjacency = new Map(data.nodes.map((n) => [n.id, []]))
  if (!nodes.has(selectedId)) return []
  for (const edge of data.edges) {
    adjacency.get(edge.source).push({ id: edge.target, edge })
    adjacency.get(edge.target).push({ id: edge.source, edge })
  }
  const found = new Map(),
    hasKind = (edge, kind) => edge.connections.some((c) => c.kind === kind)
  const add = (id, distance, via, rank) => {
    if (articles.has(id) && (!found.has(id) || found.get(id).rank > rank))
      found.set(id, { ...articles.get(id), distance, via, rank })
  }
  add(selectedId, 0, "", 0)
  for (const neighbor of adjacency.get(selectedId)) {
    add(
      neighbor.id,
      1,
      nodes.get(selectedId).label,
      hasKind(neighbor.edge, "article-concept") ? 10 : 20,
    )
    const bridge = nodes.get(neighbor.id)
    if (bridge.kind === "news") continue
    for (const target of adjacency.get(neighbor.id)) {
      let rank = bridge.kind === "concept" ? 35 : 55
      if (hasKind(neighbor.edge, "article-concept") && hasKind(target.edge, "article-concept"))
        rank = 25
      if (bridge.kind === "keyword") rank += Math.log2(adjacency.get(neighbor.id).length + 1)
      add(target.id, 2, bridge.label, rank)
    }
  }
  return [...found.values()].sort(
    (a, b) =>
      a.rank - b.rank || String(b.date).localeCompare(String(a.date)) || a.id.localeCompare(b.id),
  )
}
