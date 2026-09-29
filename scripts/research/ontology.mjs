import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { assertVerifiedClaim } from "./claims.mjs"
import { deepClaimIds } from "./deep-dive.mjs"
import { loadCurrentApproval } from "./preview.mjs"
import { safePath } from "./run-state.mjs"

export const ONTOLOGY = {
  schema: "research-evidence-ontology/v1",
  classes: [
    "Article",
    "Event",
    "Claim",
    "EntityMention",
    "Concept",
    "EvidenceBlock",
    "Parse",
    "SourceVersion",
  ],
  properties: {
    describes: ["Article", "Event"],
    supportedBy: ["Event", "Claim"],
    involves: ["Event", "EntityMention"],
    hasSubject: ["Claim", "EntityMention"],
    explains: ["Article", "Concept"],
    evidencedBy: ["Claim", "EvidenceBlock"],
    locatedIn: ["EvidenceBlock", "Parse"],
    parsedFrom: ["Parse", "SourceVersion"],
  },
}

const validRun = (run) => typeof run === "string" && /^[a-zA-Z0-9_-]+$/.test(run)
const normalName = (name) =>
  name.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim()
const byId = (left, right) => left.id.localeCompare(right.id, "en")
const unique = (values) => [...new Set(values)]

function referencedClaims(draft) {
  const publicIds = unique([
    ...draft.draft.lead.flatMap((sentence) => sentence.claim_ids),
    ...draft.draft.explanations.flatMap((section) =>
      section.paragraphs.flatMap((paragraph) => paragraph.claim_ids),
    ),
    ...(draft.draft.analysis?.claim_ids || []),
  ])
  const allIds = unique([
    ...publicIds,
    ...(draft.deep_context ? deepClaimIds(draft.deep_context.input) : []),
  ])
  return { allIds, publicIds: new Set(publicIds) }
}

// The approval loader checks raw bytes, exact draft approval, source parses and
// fact-review fingerprints. Recheck file hashes after reading for projection.
export function loadApprovedOntologyInput(root, run) {
  if (!validRun(run)) throw Error("Invalid approved run ID")
  const approval = loadCurrentApproval(root, run)
  const files = Object.fromEntries(
    Object.entries(approval.files).map(([name, expected]) => {
      const bytes = fs.readFileSync(safePath(root, `runs/${run}/${name}`))
      if (sha256(bytes) !== expected) throw Error("Approved input changed during ontology load")
      return [name, JSON.parse(bytes)]
    }),
  )
  return {
    run,
    article: approval.article,
    file_hashes: approval.files,
    draft: files["draft.json"],
    claims: files["reviewed-claims.json"].claims,
    documents: files["documents.json"],
    parses: files["parses.json"],
  }
}

export function projectEvidenceOntology(inputs) {
  if (!Array.isArray(inputs) || !inputs.length) throw Error("At least one approved run required")
  const nodes = new Map(),
    edges = new Map(),
    events = new Set(),
    runs = new Set(),
    receipts = []
  const addNode = (node) => {
    const previous = nodes.get(node.id)
    if (previous && JSON.stringify(previous) !== JSON.stringify(node))
      throw Error("Ontology node identity conflict: " + node.id)
    nodes.set(node.id, node)
  }
  const addEdge = (from, property, to, detail = {}) => {
    const edge = { from, property, to, ...detail }
    const id = `edge:${sha256(JSON.stringify(edge)).slice(0, 24)}`
    edges.set(id, { id, ...edge })
  }

  for (const input of [...inputs].sort((a, b) => a.run.localeCompare(b.run, "en"))) {
    const { run, article, draft, claims, documents, parses, file_hashes } = input
    if (!validRun(run) || runs.has(run)) throw Error("Distinct valid approved run IDs required")
    runs.add(run)
    if (!article?.event_id || events.has(article.event_id))
      throw Error("Distinct approved event IDs required; select one approved revision")
    events.add(article.event_id)
    if (article.article_review?.review_status !== "verified")
      throw Error("Ontology input requires an approved article")
    if (!file_hashes || !Object.keys(file_hashes).length)
      throw Error("Ontology input requires validated approval file hashes")
    receipts.push({ run, event_id: article.event_id, files: file_hashes })

    const eventId = `event:${article.event_id}`,
      articleId = `article:${run}`
    addNode({
      id: eventId,
      type: "Event",
      title: article.title,
      published_at: article.article_review.published_at,
      reviewed_at: article.article_review.reviewed_at,
      sector: article.sector,
      theme: article.theme,
      tags: article.tags,
    })
    addNode({
      id: articleId,
      type: "Article",
      run,
      title: article.title,
      source_urls: article.source_urls,
    })
    addEdge(articleId, "describes", eventId)

    const entityIds = new Map()
    for (const label of article.entities || []) {
      if (typeof label !== "string" || !normalName(label)) throw Error("Invalid reviewed entity")
      const key = normalName(label),
        entityId = `entity-mention:${article.event_id}:${sha256(key).slice(0, 16)}`
      if (entityIds.has(key) && entityIds.get(key).label !== label)
        throw Error("Conflicting entity spellings in one event")
      entityIds.set(key, { id: entityId, label })
      addNode({ id: entityId, type: "EntityMention", label, identity_scope: "event" })
      addEdge(eventId, "involves", entityId)
    }
    for (const conceptId of article.article_review.concept_ids || []) {
      if (typeof conceptId !== "string" || !conceptId.trim())
        throw Error("Invalid reviewed concept ID")
      const id = `concept:${conceptId}`
      addNode({ id, type: "Concept", concept_id: conceptId, basis: "explicit_article_review" })
      addEdge(articleId, "explains", id)
    }

    const { allIds, publicIds } = referencedClaims(draft),
      claimsById = new Map(claims.map((claim) => [claim.claim_id, claim])),
      documentsByVersion = new Map(documents.map((doc) => [doc.source_version_id, doc])),
      parsesById = new Map(parses.map((parse) => [parse.parse_id, parse]))
    if (!allIds.length) throw Error("Approved article has no referenced facts")
    for (const claimId of allIds) {
      const claim = claimsById.get(claimId)
      if (!claim || claim.review?.status !== "verified")
        throw Error("Ontology only accepts referenced verified claims: " + claimId)
      assertVerifiedClaim(claim, parses)
      if (!Array.isArray(claim.evidence) || !claim.evidence.length)
        throw Error("Verified claim lacks source evidence")
      const id = `claim:${run}:${claimId}`
      addNode({
        id,
        type: "Claim",
        run,
        claim_id: claimId,
        statement: claim.statement,
        claim_kind: claim.claim_kind,
        subject: claim.subject,
        event_state: claim.event_state,
        published_at: claim.published_at,
        effective_period: claim.effective_period,
        numbers: claim.numbers,
        review_status: "verified",
        reviewed_at: claim.review.reviewed_at,
      })
      addEdge(eventId, "supportedBy", id, {
        usage: publicIds.has(claimId) ? "article_text" : "reviewed_deep_context",
      })
      const subjectEntity = entityIds.get(normalName(claim.subject))
      if (subjectEntity) addEdge(id, "hasSubject", subjectEntity.id)

      for (const evidence of claim.evidence) {
        const parse = parsesById.get(evidence.parse_id),
          doc = documentsByVersion.get(evidence.source_version_id),
          block = parse?.blocks.find((item) => item.block_id === evidence.block_id)
        if (
          !parse ||
          !doc ||
          !block ||
          parse.source_version_id !== evidence.source_version_id ||
          doc.source_id !== evidence.source_id ||
          parse.source_id !== evidence.source_id ||
          evidence.support !== "direct" ||
          !block.text
            .normalize("NFKC")
            .replace(/\s+/g, " ")
            .includes(evidence.quote.normalize("NFKC").replace(/\s+/g, " "))
        )
          throw Error("Ontology evidence must resolve to a direct stored source block")
        const sourceId = `source-version:${run}:${doc.source_version_id}`,
          parseId = `parse:${run}:${parse.parse_id}`,
          blockId = `evidence-block:${run}:${parse.parse_id}:${block.block_id}`
        addNode({
          id: sourceId,
          type: "SourceVersion",
          source_id: doc.source_id,
          source_version_id: doc.source_version_id,
          original_url: doc.original_url,
          final_url: doc.final_url,
          body_sha256: doc.body_sha256,
          observed_at: doc.observed_at,
        })
        addNode({
          id: parseId,
          type: "Parse",
          parse_id: parse.parse_id,
          status: parse.status,
          source_version_id: parse.source_version_id,
        })
        addNode({
          id: blockId,
          type: "EvidenceBlock",
          block_id: block.block_id,
          text_sha256: block.locator.text_hash,
          locator: block.locator,
        })
        addEdge(id, "evidencedBy", blockId, { quote: evidence.quote, support: "direct" })
        addEdge(blockId, "locatedIn", parseId)
        addEdge(parseId, "parsedFrom", sourceId)
      }
    }
  }

  const body = {
    schema: ONTOLOGY.schema,
    ontology: ONTOLOGY,
    inputs: receipts,
    nodes: [...nodes.values()].sort(byId),
    edges: [...edges.values()].sort(byId),
  }
  const graph = { ...body, sha256: sha256(JSON.stringify(body)) }
  assertEvidenceOntology(graph)
  return graph
}

export function assertEvidenceOntology(graph) {
  if (
    !graph ||
    graph.schema !== ONTOLOGY.schema ||
    JSON.stringify(graph.ontology) !== JSON.stringify(ONTOLOGY)
  )
    throw Error("Unsupported evidence ontology schema")
  const { sha256: expected, ...body } = graph
  if (sha256(JSON.stringify(body)) !== expected) throw Error("Ontology snapshot hash mismatch")
  if (
    !Array.isArray(graph.inputs) ||
    !graph.inputs.length ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges)
  )
    throw Error("Incomplete ontology snapshot")
  const nodes = new Map()
  for (const node of graph.nodes) {
    if (!node?.id || nodes.has(node.id) || !ONTOLOGY.classes.includes(node.type))
      throw Error("Invalid or duplicate ontology node")
    if (
      node.type === "Claim" &&
      (node.review_status !== "verified" ||
        !["planned", "in_progress", "completed", "reported", "unknown"].includes(node.event_state))
    )
      throw Error("Ontology contains an unverified or invalid claim")
    nodes.set(node.id, node)
  }
  const edgeIds = new Set(),
    incoming = new Map(),
    outgoing = new Map()
  for (const edge of graph.edges) {
    const signature = ONTOLOGY.properties[edge.property]
    const { id, ...contents } = edge
    if (
      !edge?.id ||
      edgeIds.has(edge.id) ||
      edge.id !== `edge:${sha256(JSON.stringify(contents)).slice(0, 24)}` ||
      !signature ||
      nodes.get(edge.from)?.type !== signature[0] ||
      nodes.get(edge.to)?.type !== signature[1]
    )
      throw Error("Ontology relation violates its domain or range")
    edgeIds.add(edge.id)
    const inKey = `${edge.to}|${edge.property}`,
      outKey = `${edge.from}|${edge.property}`
    incoming.set(inKey, (incoming.get(inKey) || 0) + 1)
    outgoing.set(outKey, (outgoing.get(outKey) || 0) + 1)
    if (edge.property === "evidencedBy") {
      if (edge.support !== "direct" || !edge.quote?.trim())
        throw Error("Ontology claim evidence must be direct")
    }
  }
  const inCount = (id, property) => incoming.get(`${id}|${property}`) || 0,
    outCount = (id, property) => outgoing.get(`${id}|${property}`) || 0
  for (const node of graph.nodes) {
    if (
      (node.type === "Article" && outCount(node.id, "describes") !== 1) ||
      (node.type === "Event" &&
        (inCount(node.id, "describes") !== 1 || !outCount(node.id, "supportedBy"))) ||
      (node.type === "Claim" &&
        (inCount(node.id, "supportedBy") !== 1 || !outCount(node.id, "evidencedBy"))) ||
      (node.type === "EvidenceBlock" && outCount(node.id, "locatedIn") !== 1) ||
      (node.type === "Parse" && outCount(node.id, "parsedFrom") !== 1) ||
      (node.type === "SourceVersion" && !inCount(node.id, "parsedFrom"))
    )
      throw Error("Ontology provenance chain is incomplete or ambiguous")
  }
  return graph
}

const related = (graph, from, property) =>
  graph.edges.filter((edge) => edge.from === from && edge.property === property)

export function traceOntologyClaim(graph, claimId, run = null) {
  assertEvidenceOntology(graph)
  const matches = graph.nodes.filter(
    (node) => node.type === "Claim" && node.claim_id === claimId && (!run || node.run === run),
  )
  if (matches.length !== 1)
    throw Error(matches.length ? "Claim ID needs an explicit run" : "Claim not found")
  const claim = matches[0],
    nodes = new Map(graph.nodes.map((node) => [node.id, node])),
    eventEdge = graph.edges.find((edge) => edge.property === "supportedBy" && edge.to === claim.id),
    event = nodes.get(eventEdge.from),
    articleEdge = graph.edges.find((edge) => edge.property === "describes" && edge.to === event.id),
    article = nodes.get(articleEdge.from)
  const evidence = related(graph, claim.id, "evidencedBy").map((edge) => {
    const block = nodes.get(edge.to),
      parse = nodes.get(related(graph, block.id, "locatedIn")[0].to),
      source = nodes.get(related(graph, parse.id, "parsedFrom")[0].to)
    return {
      quote: edge.quote,
      source_url: source.original_url,
      source_version_id: source.source_version_id,
      source_sha256: source.body_sha256,
      parse_id: parse.parse_id,
      block_id: block.block_id,
      locator: block.locator,
    }
  })
  return { claim, event, article, evidence }
}

export function ontologyEntityTimeline(graph, name) {
  assertEvidenceOntology(graph)
  if (typeof name !== "string" || !normalName(name)) throw Error("Exact entity name required")
  const nodes = new Map(graph.nodes.map((node) => [node.id, node])),
    entityIds = new Set(
      graph.nodes
        .filter(
          (node) => node.type === "EntityMention" && normalName(node.label) === normalName(name),
        )
        .map((node) => node.id),
    )
  const events = graph.edges
    .filter((edge) => edge.property === "involves" && entityIds.has(edge.to))
    .map((edge) => {
      const event = nodes.get(edge.from),
        article = nodes.get(
          graph.edges.find((item) => item.property === "describes" && item.to === event.id).from,
        ),
        claims = related(graph, event.id, "supportedBy").map((item) => nodes.get(item.to))
      return {
        event_id: event.id.slice("event:".length),
        published_at: event.published_at,
        title: event.title,
        states_in_verified_claims: unique(claims.map((claim) => claim.event_state)).sort(),
        source_urls: article.source_urls,
        claims: claims.map((claim) => ({
          claim_id: claim.claim_id,
          statement: claim.statement,
          claim_kind: claim.claim_kind,
          event_state: claim.event_state,
          effective_period: claim.effective_period,
        })),
      }
    })
    .sort(
      (a, b) =>
        a.published_at.localeCompare(b.published_at) || a.event_id.localeCompare(b.event_id),
    )
  return { entity_label: name, identity_scope: "exact_editorial_label_only", events }
}

export function ontologyConceptArticles(graph, conceptId) {
  assertEvidenceOntology(graph)
  if (typeof conceptId !== "string" || !conceptId.trim()) throw Error("Concept ID required")
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  const articles = graph.edges
    .filter((edge) => edge.property === "explains" && edge.to === `concept:${conceptId}`)
    .map((edge) => {
      const article = nodes.get(edge.from),
        event = nodes.get(related(graph, article.id, "describes")[0].to)
      return {
        event_id: event.id.slice("event:".length),
        published_at: event.published_at,
        title: article.title,
        source_urls: article.source_urls,
      }
    })
    .sort(
      (a, b) =>
        b.published_at.localeCompare(a.published_at) || a.event_id.localeCompare(b.event_id),
    )
  return { concept_id: conceptId, association_basis: "explicit_article_review", articles }
}
