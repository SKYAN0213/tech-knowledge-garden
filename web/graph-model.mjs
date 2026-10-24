import { articleRelationRoles as semanticRelationRoles } from "./article-semantic-index.mjs"

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
export const articleRelationRoles = [...semanticRelationRoles, "untyped"]
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
  // Explicit public fields keep future private source/retrieval metadata out of the map.
  const nodes = selected.map((n) => ({
    id: n.id,
    label: n.label,
    title: n.title,
    ...(n.group !== undefined ? { group: n.group } : {}),
    aliases: [...n.aliases],
    slug: n.slug,
    definition: n.definition,
    sources: [...n.sources],
    kind: "concept",
    learningKind: n.mapReview.kind,
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
  const publicArticles = articles.map((article) => {
    if (articleIds.has(article.id)) throw Error("Duplicate article identity")
    articleIds.add(article.id)
    const status = article.semanticReviewStatus
    if (
      status !== undefined &&
      !["reviewed_links", "reviewed_none", "legacy_untyped", "unreviewed"].includes(status)
    )
      throw Error("Invalid article semantic review status")
    const conceptIds =
        status === "unreviewed" ? [] : article.conceptIds === undefined ? [] : article.conceptIds,
      conceptLinks =
        status === "unreviewed"
          ? []
          : article.conceptLinks === undefined
            ? []
            : article.conceptLinks
    if (!Array.isArray(conceptIds) || conceptIds.some((id) => !all.has(id)))
      throw Error("Unknown article concept")
    if (!Array.isArray(conceptLinks)) throw Error("Article concept links must be an array")
    if (status === "reviewed_none" && (conceptIds.length || conceptLinks.length))
      throw Error("Reviewed-empty article cannot retain concept assignments")
    if (status === "reviewed_links" && !conceptLinks.length)
      throw Error("Reviewed-linked article requires semantic concept links")
    const linkedIds = new Set(),
      matches = []
    for (const link of conceptLinks) {
      if (
        !link ||
        !all.has(link.conceptId) ||
        !semanticRelationRoles.includes(link.role) ||
        linkedIds.has(link.conceptId)
      )
        throw Error("Invalid reviewed article concept relation")
      const claims = link.evidenceClaimIds
      if (
        claims !== undefined &&
        (!Array.isArray(claims) ||
          !claims.length ||
          claims.some((id) => typeof id !== "string" || !id.trim()) ||
          new Set(claims).size !== claims.length)
      )
        throw Error("Invalid reviewed article evidence claim references")
      linkedIds.add(link.conceptId)
      // A reviewed relation can target a readable note excluded from the learning map.
      if (!byId.has(link.conceptId)) continue
      matches.push({
        termId: link.conceptId,
        basis: "semantic_review",
        role: link.role,
        ...(claims !== undefined ? { evidenceClaimIds: [...claims] } : {}),
      })
    }
    for (const n of nodes)
      if (conceptIds.includes(n.id) && !linkedIds.has(n.id))
        matches.push({ termId: n.id, basis: "editorial", role: "untyped" })
    return {
      id: article.id,
      title: article.title,
      date: article.date,
      description: article.description,
      slug: article.slug,
      ...(status !== undefined ? { semanticReviewStatus: status } : {}),
      termIds: matches.map((m) => m.termId),
      matches,
    }
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
    schema: "learning-connections/v4",
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
    if (direct) {
      const rank = {
        topic: 10,
        application: 20,
        comparison_evaluation: 30,
        context_background: 40,
        untyped: 50,
      }[direct.role]
      found.push({
        ...article,
        distance: 1,
        via: nodes.get(selectedId).label,
        relationRole: direct.role,
        rank,
      })
    } else {
      const bridge = article.termIds.find((id) => neighbors.has(id))
      if (bridge) found.push({ ...article, distance: 2, via: nodes.get(bridge).label, rank: 60 })
    }
  }
  return found.sort(
    (a, b) =>
      a.rank - b.rank || String(b.date).localeCompare(String(a.date)) || a.id.localeCompare(b.id),
  )
}
