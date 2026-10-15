import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { assertVerifiedClaim } from "./claims.mjs"
import { deepClaimIds } from "./deep-dive.mjs"
import { loadHistoricalApproval } from "./preview.mjs"
import { safePath } from "./run-state.mjs"
import { loadExistingEditorialRevision } from "./existing-editorial-approval.mjs"
import { loadSelectedEventFollowup } from "./event-publication.mjs"

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
export function loadApprovedOntologyInput(root, run, options = {}) {
  if (!validRun(run)) throw Error("Invalid approved run ID")
  const approval = loadHistoricalApproval(root, run, options)
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
    ...readJSONFollowup(root, run, approval.article, options),
    ...(approval.concept_review ? { concept_review: approval.concept_review } : {}),
    file_hashes: approval.files,
    draft: files["draft.json"],
    claims: files["reviewed-claims.json"].claims,
    documents: files["documents.json"],
    parses: files["parses.json"],
  }
}

function readJSONFollowup(root, run, article, options) {
  const relation = loadSelectedEventFollowup(root, run, article, options)
  return relation ? { event_relation: relation } : {}
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
      ...(article.article_review.occurred_at
        ? { occurred_at: article.article_review.occurred_at }
        : {}),
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
      const reviewedLink = input.concept_review?.links.find((link) => link.concept_id === conceptId)
      const reviewedNote =
        reviewedLink &&
        input.concept_review.notes.find(
          (note) => note.path.replace(/\.md$/, "") === reviewedLink.path,
        )
      if (input.concept_review && (!reviewedLink || !reviewedNote))
        throw Error("Ontology specialist assignment evidence missing")
      addEdge(
        articleId,
        "explains",
        id,
        reviewedLink
          ? {
              basis: "reviewed_article_concept_assignment",
              evidence_claim_ids: reviewedLink.evidence.map((e) => e.claim_id),
              note_sha256: reviewedNote.sha256,
              editorial_decision_sha256: input.concept_review.editorial_decision_sha256,
            }
          : {},
      )
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
    ...(inputs.some((input) => input.event_relation)
      ? {
          event_relations: inputs
            .filter((input) => input.event_relation)
            .map((input) => input.event_relation)
            .sort((a, b) => a.current_event_id.localeCompare(b.current_event_id)),
        }
      : {}),
  }
  const graph = { ...body, sha256: sha256(JSON.stringify(body)) }
  assertEvidenceOntology(graph)
  return graph
}

// Reuse stored approvals, never regenerate facts or merge events by similarity.
// The previous graph is a checkpoint, not authority for a changed approval.
export function extendEvidenceOntology(
  root,
  graph,
  incomingRuns,
  {
    vault = "vault",
    inputLoader = loadApprovedOntologyInput,
    revisionLoader = loadExistingEditorialRevision,
  } = {},
) {
  assertEvidenceOntology(graph)
  if (
    !Array.isArray(incomingRuns) ||
    incomingRuns.some((run) => !validRun(run)) ||
    new Set(incomingRuns).size !== incomingRuns.length
  )
    throw Error("Distinct incoming approved runs required")
  const previous = graph.inputs.map((receipt) => {
    const input = inputLoader(root, receipt.run, { vault })
    if (
      input.run !== receipt.run ||
      input.article.event_id !== receipt.event_id ||
      JSON.stringify(input.file_hashes) !== JSON.stringify(receipt.files)
    )
      throw Error("Previous ontology approval changed: " + receipt.run)
    return input
  })
  const history = structuredClone(graph.revision_history || [])
  for (const revision of history) {
    const old = inputLoader(root, revision.previous.run, { vault })
    const current = inputLoader(root, revision.current.run, { vault })
    if (JSON.stringify(revisionLoader(root, old, current)) !== JSON.stringify(revision))
      throw Error("Ontology revision evidence changed")
  }
  const withHistory = (projection, revisions) => {
    if (!revisions.length) return projection
    const { sha256: _hash, ...body } = projection
    body.revision_history = revisions
    return assertEvidenceOntology({ ...body, sha256: sha256(JSON.stringify(body)) })
  }
  if (
    JSON.stringify(withHistory(projectEvidenceOntology(previous), history)) !==
    JSON.stringify(graph)
  )
    throw Error("Previous ontology differs from its current approved inputs")
  const byRun = new Map(previous.map((input) => [input.run, input]))
  const byEvent = new Map(previous.map((input) => [input.article.event_id, input.run]))
  for (const run of incomingRuns) {
    if (byRun.has(run)) continue
    if (history.some((revision) => revision.previous.run === run))
      throw Error("Superseded ontology approval cannot be reactivated")
    const input = inputLoader(root, run, { vault })
    if (input.run !== run) throw Error("Incoming ontology approval run differs")
    if (byEvent.has(input.article.event_id)) {
      const priorRun = byEvent.get(input.article.event_id)
      const revision = revisionLoader(root, byRun.get(priorRun), input)
      if (
        revision.event_id !== input.article.event_id ||
        JSON.stringify(revision.previous) !==
          JSON.stringify({
            run: priorRun,
            event_id: input.article.event_id,
            files: byRun.get(priorRun).file_hashes,
          }) ||
        JSON.stringify(revision.current) !==
          JSON.stringify({
            run,
            event_id: input.article.event_id,
            files: input.file_hashes,
          })
      )
        throw Error("Ontology revision differs from its approved inputs")
      history.push(revision)
      byRun.delete(priorRun)
    }
    byRun.set(run, input)
    byEvent.set(input.article.event_id, run)
  }
  return withHistory(projectEvidenceOntology([...byRun.values()]), history)
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
  if (graph.revision_history !== undefined) {
    if (!Array.isArray(graph.revision_history) || !graph.revision_history.length)
      throw Error("Nonempty ontology revision history required")
    const latest = new Map(),
      superseded = new Set()
    for (const revision of graph.revision_history) {
      const { previous, current, receipt, event_id } = revision
      if (
        !validRun(previous?.run) ||
        !validRun(current?.run) ||
        previous.run === current.run ||
        previous.event_id !== event_id ||
        current.event_id !== event_id ||
        !previous.files ||
        !current.files ||
        !Object.keys(previous.files).length ||
        !Object.keys(current.files).length ||
        typeof receipt?.path !== "string" ||
        !receipt.path ||
        !/^[a-f0-9]{64}$/.test(receipt.sha256 || "") ||
        superseded.has(previous.run) ||
        superseded.has(current.run) ||
        (latest.has(event_id) && latest.get(event_id) !== previous.run)
      )
        throw Error("Invalid or conflicting ontology revision chain")
      superseded.add(previous.run)
      latest.set(event_id, current.run)
    }
    for (const [event, run] of latest)
      if (graph.inputs.find((input) => input.event_id === event)?.run !== run)
        throw Error("Ontology current approval differs from its revision chain")
    if (graph.inputs.some((input) => superseded.has(input.run)))
      throw Error("Superseded approval cannot remain an active ontology input")
  }
  if (
    graph.event_relations !== undefined &&
    (!Array.isArray(graph.event_relations) ||
      !graph.event_relations.length ||
      new Set(graph.event_relations.map((r) => r.current_event_id)).size !==
        graph.event_relations.length ||
      graph.event_relations.some(
        (r) =>
          r.relation !== "followup" ||
          !/^[a-f0-9]{16}$/.test(r.previous_event_id || "") ||
          !/^[a-f0-9]{16}$/.test(r.current_event_id || "") ||
          r.previous_event_id === r.current_event_id ||
          !validRun(r.previous_run) ||
          !validRun(r.current_run) ||
          !graph.inputs.some(
            (input) => input.run === r.current_run && input.event_id === r.current_event_id,
          ) ||
          r.receipt?.path !== `runs/${r.current_run}/event-followup.json` ||
          !/^[a-f0-9]{64}$/.test(r.receipt.sha256 || ""),
      ))
  )
    throw Error("Invalid reviewed event follow-up relations")
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
  return createOntologyReader(graph).traceClaim(claimId, run)
}

export function ontologyEntityTimeline(graph, name) {
  return createOntologyReader(graph).entityTimeline(name)
}

// One bounded read owns an immutable, validated snapshot and provenance indexes.
// No global cache or validation bypass: a new reader checks a changed graph, and
// neither caller mutation nor editing a returned trace can alter this snapshot.
export function createOntologyReader(graph) {
  const snapshot = assertEvidenceOntology(structuredClone(graph))
  const nodes = new Map(snapshot.nodes.map((node) => [node.id, node]))
  const outgoing = new Map(),
    incoming = new Map(),
    claimsById = new Map(),
    entities = new Map()
  const append = (map, key, value) => {
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(value)
  }
  for (const edge of snapshot.edges) {
    append(outgoing, edge.from + "|" + edge.property, edge)
    append(incoming, edge.to + "|" + edge.property, edge)
  }
  for (const node of snapshot.nodes) {
    if (node.type === "Claim") append(claimsById, node.claim_id, node)
    if (node.type === "EntityMention") append(entities, normalName(node.label), node.id)
  }
  const out = (id, property) => outgoing.get(id + "|" + property) || []
  const into = (id, property) => incoming.get(id + "|" + property) || []
  const trace = (claimId, run) => {
    const matches = (claimsById.get(claimId) || []).filter((node) => !run || node.run === run)
    if (matches.length !== 1)
      throw Error(matches.length ? "Claim ID needs an explicit run" : "Claim not found")
    const claim = matches[0],
      event = nodes.get(into(claim.id, "supportedBy")[0].from)
    const article = nodes.get(into(event.id, "describes")[0].from)
    const evidence = out(claim.id, "evidencedBy").map((edge) => {
      const block = nodes.get(edge.to),
        parse = nodes.get(out(block.id, "locatedIn")[0].to)
      const source = nodes.get(out(parse.id, "parsedFrom")[0].to)
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
  return Object.freeze({
    traceClaim: (claimId, run = null) => structuredClone(trace(claimId, run)),
    entityTimeline: (name) => {
      if (typeof name !== "string" || !normalName(name)) throw Error("Exact entity name required")
      const events = (entities.get(normalName(name)) || [])
        .flatMap((id) => into(id, "involves"))
        .map((edge) => {
          const event = nodes.get(edge.from),
            article = nodes.get(into(event.id, "describes")[0].from)
          const claims = out(event.id, "supportedBy").map((item) => nodes.get(item.to))
          return {
            event_id: event.id.slice("event:".length),
            published_at: event.published_at,
            ...(event.occurred_at ? { occurred_at: event.occurred_at } : {}),
            reviewed_at: event.reviewed_at,
            article_path: `news/${event.id.slice("event:".length)}`,
            title: event.title,
            states_in_verified_claims: unique(claims.map((claim) => claim.event_state)).sort(),
            source_urls: article.source_urls,
            claims: claims.map((claim) => ({
              claim_id: claim.claim_id,
              statement: claim.statement,
              claim_kind: claim.claim_kind,
              event_state: claim.event_state,
              effective_period: claim.effective_period,
              reviewed_at: claim.reviewed_at,
              evidence: trace(claim.claim_id, claim.run).evidence,
            })),
          }
        })
        .sort(
          (a, b) =>
            (a.occurred_at || a.published_at).localeCompare(b.occurred_at || b.published_at) ||
            a.event_id.localeCompare(b.event_id),
        )
      return structuredClone({
        entity_label: name,
        identity_scope: "exact_editorial_label_only",
        events,
      })
    },
  })
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
        ...(event.occurred_at ? { occurred_at: event.occurred_at } : {}),
        title: article.title,
        source_urls: article.source_urls,
      }
    })
    .sort(
      (a, b) =>
        (b.occurred_at || b.published_at).localeCompare(a.occurred_at || a.published_at) ||
        a.event_id.localeCompare(b.event_id),
    )
  return { concept_id: conceptId, association_basis: "explicit_article_review", articles }
}
