import fs from "node:fs"
import { parseNote, sections } from "../garden.mjs"
import { sha256 } from "./contracts.mjs"
import { publicDeepMetadata, publicPaperMetadata } from "./deep-dive.mjs"
import { safePath, atomicCreate, readJSON, withLock } from "./run-state.mjs"
import { loadHistoricalNoteApproval, loadReviewedNoteSource } from "./note-review.mjs"
import { assertVerifiedClaim } from "./claims.mjs"
import { projectApprovedTrends } from "./ontology-trends.mjs"
import { historicalCanonicalContent } from "./article-concept-review.mjs"
import {
  assertCompanyIdentityReview,
  reconcilePaperVersions,
  reconcilePersonNames,
} from "./knowledge-links.mjs"
import { assertReviewDate } from "./dates.mjs"
import {
  assertEvidenceOntology,
  loadApprovedOntologyInput,
  extendEvidenceOntology,
  projectEvidenceOntology,
  createOntologyReader,
} from "./ontology.mjs"

// A read projection over approved Knowledge notes and explicit article links.
// It is not a second definition store and does not infer a trend from frequency.
export function ontologyKnowledge(root, graph, conceptId, options = {}) {
  if (options.knowledgeSelections?.length) {
    const concept = ontologyKnowledgeIndex(root, graph, options).concepts.find(
      (item) => item.concept_id === conceptId,
    )
    if (!concept) throw Error("Explicit source-backed specialist concept not found")
    return concept
  }
  assertEvidenceOntology(graph)
  if (!graph.revision_history?.length)
    return buildOntologyKnowledge(root, graph, conceptId, options)
  const inputs = new Map()
  const sourceLoader = options.inputLoader || loadApprovedOntologyInput
  const checkedOptions = {
    ...options,
    inputLoader: (sourceRoot, run, sourceOptions) => {
      if (!inputs.has(run)) inputs.set(run, sourceLoader(sourceRoot, run, sourceOptions))
      return inputs.get(run)
    },
  }
  // Standalone reads need the same native revision proof as the whole index.
  extendEvidenceOntology(root, graph, [], checkedOptions)
  return buildOntologyKnowledge(
    root,
    graph,
    conceptId,
    checkedOptions,
    graph.revision_history.map((revision) => inputs.get(revision.previous.run)),
  )
}

function definitionVersion(note, notePath, hash) {
  const blocks = sections(note.body, 2)
  const section = (heading) => {
    const body = blocks.find((block) => block.title === heading)?.body.trim()
    return body && body !== "없음" ? body : undefined
  }
  if (!section("한 문장 정의")) throw Error("Reviewed specialist definition missing")
  return {
    note_path: notePath,
    sha256: hash,
    reviewed_at: note.meta.last_reviewed,
    label: note.meta.label,
    aliases: note.meta.aliases || [],
    definition: section("한 문장 정의"),
    ...(section("작동 원리") ? { mechanism: section("작동 원리") } : {}),
    ...(section("실제 예시") ? { examples: section("실제 예시") } : {}),
    ...(section("혼동하기 쉬운 개념") ? { distinctions: section("혼동하기 쉬운 개념") } : {}),
    source_urls: note.meta.verified_sources,
    ...(note.meta.connections?.length ? { connections: note.meta.connections } : {}),
    ...(note.meta.relations?.length ? { relations: note.meta.relations } : {}),
  }
}

// Reuse native note approvals even when no current article assigns the term.
// Exact selections bind the applied authority bytes; they create no graph node,
// event, article assignment or inferred relationship.
export function prepareKnowledgeReviewSelections(root, selections = [], options = {}) {
  return prepareDefinitionSelections(root, selections, options, true)
}

function prepareDefinitionSelections(root, selections, options, requireApplied) {
  if (
    !Array.isArray(selections) ||
    selections.length > 64 ||
    selections.some(
      (item) =>
        !item ||
        typeof item !== "object" ||
        Array.isArray(item) ||
        Object.keys(item).some((key) => !["run", "path", "sha256"].includes(key)) ||
        !/^[A-Za-z0-9_-]{1,160}$/.test(item.run || "") ||
        !/^Knowledge\/.+\.md$/.test(item.path || "") ||
        !/^[a-f0-9]{64}$/.test(item.sha256 || ""),
    ) ||
    new Set(selections.map((item) => item.path)).size !== selections.length
  )
    throw Error("Distinct exact knowledge note approval selections required")
  const vault = options.vault || "vault",
    approvals = new Map(),
    ids = new Set()
  const loader = options.noteApprovalLoader || loadHistoricalNoteApproval
  return selections.map((selection) => {
    if (!approvals.has(selection.run))
      approvals.set(selection.run, loader(root, selection.run, { vault }))
    const approval = approvals.get(selection.run)
    const approved = approval.approval.notes.find((note) => note.path === selection.path)
    if (
      !approved ||
      approved.sha256 !== selection.sha256 ||
      sha256(approved.content) !== selection.sha256 ||
      (requireApplied &&
        sha256(fs.readFileSync(safePath(vault, selection.path))) !== selection.sha256)
    )
      throw Error("Selected knowledge approval differs from applied authority bytes")
    const note = parseNote(approved.content)
    if (
      note.meta.type !== "knowledge" ||
      note.meta.entry_type !== "concept" ||
      note.meta.schema_version !== "tech-encyclopedia/v2" ||
      note.meta.map_review?.decision !== "include" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(note.meta.concept_id || "") ||
      ids.has(note.meta.concept_id)
    )
      throw Error("Distinct approved specialist definitions required")
    ids.add(note.meta.concept_id)
    return {
      concept_id: note.meta.concept_id,
      version: definitionVersion(note, selection.path, selection.sha256),
      approval: {
        ...selection,
        files: approval.files,
        evidence: approved.evidence,
      },
    }
  })
}

// Review existing authored connections independently of their definitions.
// Endpoint approvals and selected native facts are reused; no note, map node,
// article assignment or definition approval is created by this ledger.
export function evaluateKnowledgeConnectionReview(root, decision, selections, options = {}) {
  const definitions = prepareKnowledgeReviewSelections(root, selections, options)
  return projectKnowledgeConnectionReview(root, decision, definitions, options)
}

function projectKnowledgeConnectionReview(root, decision, definitions, options) {
  const nonempty = (value) => typeof value === "string" && !!value.trim()
  const exact = (value, keys) =>
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => keys.includes(key))
  if (
    !exact(decision, [
      "schema",
      "reviewer",
      "reviewed_at",
      "reason",
      "source_read",
      "definitions_read",
      "relationships_checked",
      "cooccurrence_rejected",
      "connections",
    ]) ||
    decision.schema !== "research-knowledge-connection-review/v1" ||
    !nonempty(decision.reviewer) ||
    !nonempty(decision.reason) ||
    ["source_read", "definitions_read", "relationships_checked", "cooccurrence_rejected"].some(
      (key) => decision[key] !== true,
    ) ||
    !Array.isArray(decision.connections) ||
    !decision.connections.length ||
    decision.connections.length > 64
  )
    throw Error("Explicit source and specialist connection review required")
  assertReviewDate(decision.reviewed_at)
  const concepts = new Map(definitions.map((definition) => [definition.concept_id, definition]))
  const sources = new Map(),
    seen = new Set()
  const sourceLoader = options.reviewedSourceLoader || loadReviewedNoteSource
  const connections = decision.connections.map((review) => {
    if (
      !exact(review, [
        "from",
        "target",
        "field",
        "type",
        "source_sha256",
        "target_sha256",
        "reason",
        "evidence",
      ]) ||
      !["relations", "connections"].includes(review.field) ||
      !nonempty(review.reason) ||
      review.reason.trim().length < 10 ||
      !Array.isArray(review.evidence) ||
      !review.evidence.length ||
      review.evidence.length > 40
    )
      throw Error("Exact existing connection and selected fact references required")
    const from = concepts.get(review.from),
      target = concepts.get(review.target)
    if (
      !from ||
      !target ||
      from === target ||
      from.version.sha256 !== review.source_sha256 ||
      target.version.sha256 !== review.target_sha256
    )
      throw Error("Connection endpoints differ from current approved specialist definitions")
    const candidates = (from.version[review.field] || []).filter(
      (edge) => edge.target === review.target && edge.type === review.type,
    )
    const identity = [review.from, review.field, review.target, review.type || ""].join("|")
    if (candidates.length !== 1 || seen.has(identity))
      throw Error("Distinct exact authored connections required")
    seen.add(identity)
    const edge = candidates[0]
    const approvedFacts = new Set(
      [from, target]
        .flatMap((definition) => definition.approval.evidence)
        .flatMap((ref) => ref.claim_ids.map((id) => `${ref.run_id}|${id}`)),
    )
    const selected = new Set(),
      urls = new Set()
    const endpointURLs = new Set([...from.version.source_urls, ...target.version.source_urls])
    const facts = review.evidence.flatMap((ref) => {
      if (
        !exact(ref, ["run_id", "claim_ids"]) ||
        !/^[A-Za-z0-9_-]{1,160}$/.test(ref.run_id || "") ||
        !Array.isArray(ref.claim_ids) ||
        !ref.claim_ids.length ||
        ref.claim_ids.length > 200
      )
        throw Error("Exact native connection facts required")
      if (!sources.has(ref.run_id)) sources.set(ref.run_id, sourceLoader(root, ref.run_id))
      const source = sources.get(ref.run_id)
      return ref.claim_ids.map((id) => {
        const key = `${ref.run_id}|${id}`
        if (!approvedFacts.has(key) || selected.has(key))
          throw Error("Connection fact is not a distinct endpoint approval dependency")
        selected.add(key)
        const claim = source.claims.find((item) => item.claim_id === id)
        if (!claim) throw Error("Connection references an unknown reviewed fact")
        assertVerifiedClaim(claim, source.parses)
        const evidence = claim.evidence.map((item) => {
          const doc = source.documents.find(
            (document) => document.source_version_id === item.source_version_id,
          )
          if (!doc || !endpointURLs.has(doc.original_url))
            throw Error("Connection fact must use an endpoint's reviewed source URL")
          urls.add(doc.original_url)
          return { ...item, source_url: doc.original_url, body_sha256: doc.body_sha256 }
        })
        assertReviewDate(decision.reviewed_at, {
          notBefore: [
            from.version.reviewed_at,
            target.version.reviewed_at,
            claim.review.reviewed_at,
            ...source.documents.map((doc) => doc.observed_at),
          ],
        })
        return {
          run: ref.run_id,
          claim_id: id,
          statement: claim.statement,
          published_at: claim.published_at,
          reviewed_at: claim.review.reviewed_at,
          event_state: claim.event_state,
          effective_period: claim.effective_period,
          numbers: claim.numbers,
          evidence,
        }
      })
    })
    if ((edge.evidence || []).some((url) => !urls.has(url)))
      throw Error("Every authored connection source requires selected reviewed evidence")
    return {
      from: review.from,
      target: review.target,
      field: review.field,
      ...edge,
      reviewed_at: decision.reviewed_at,
      review_reason: review.reason,
      source_definition: from.approval,
      target_definition: target.approval,
      facts,
    }
  })
  return {
    schema: "research-approved-knowledge-connections/v1",
    reviewer: decision.reviewer,
    reviewed_at: decision.reviewed_at,
    review_sha256: sha256(JSON.stringify(decision)),
    connections,
    source_files: [...sources.values()].map(({ run, files }) => ({ run, files })),
    definitions_reapproved: false,
    candidate_published: false,
  }
}

export async function approveKnowledgeConnections(root, run, decision, selections, options = {}) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(run || "")) throw Error("Safe connection review run required")
  return withLock(root, "connection-review-" + run, async () => {
    const input = { decision, knowledge_selections: selections }
    const inputFile = `runs/${run}/connection-review.json`,
      outputFile = `runs/${run}/approved-connections.json`
    const previous = readJSON(root, inputFile)
    if (previous && JSON.stringify(previous) !== JSON.stringify(input))
      throw Error("Connection review input changed; preserve it and use a new run")
    const approval = evaluateKnowledgeConnectionReview(root, decision, selections, options)
    const saved = readJSON(root, outputFile)
    if (saved && JSON.stringify(saved) !== JSON.stringify(approval))
      throw Error("Saved connection approval differs from current evidence")
    if (!previous) atomicCreate(root, inputFile, input)
    if (!saved) atomicCreate(root, outputFile, approval)
    return { run, approval, reused: !!saved, receipt: outputFile }
  })
}

export function loadKnowledgeConnectionApproval(root, run, options = {}) {
  return readConnectionApproval(root, run, options, false)
}

// Historical receipts retain exact native definition and source proof. The
// workflow separately checks each endpoint against today's authority bytes,
// so one unrelated definition change does not invalidate every old connection.
export function loadHistoricalKnowledgeConnectionApproval(root, run, options = {}) {
  return readConnectionApproval(root, run, options, true)
}

function readConnectionApproval(root, run, options, historical) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(run || "")) throw Error("Safe connection review run required")
  const inputBytes = fs.readFileSync(safePath(root, `runs/${run}/connection-review.json`))
  const outputBytes = fs.readFileSync(safePath(root, `runs/${run}/approved-connections.json`))
  const input = JSON.parse(inputBytes),
    stored = JSON.parse(outputBytes)
  const definitions = prepareDefinitionSelections(
    root,
    input.knowledge_selections,
    options,
    !historical,
  )
  const approval = projectKnowledgeConnectionReview(root, input.decision, definitions, options)
  if (JSON.stringify(stored) !== JSON.stringify(approval))
    throw Error("Saved connection approval differs from current evidence")
  return {
    run,
    approval,
    files: { review_sha256: sha256(inputBytes), approval_sha256: sha256(outputBytes) },
  }
}

// Read a saved result once by its exact file hash, then page its structured rows.
// This does not reload approvals, generate a graph or advance review status.
export function readOntologyKnowledgePage(
  root,
  file,
  expectedHash,
  { section = "concepts", offset = 0, limit = 20 } = {},
) {
  const bytes = fs.readFileSync(safePath(root, file))
  if (!/^[a-f0-9]{64}$/.test(expectedHash || "") || sha256(bytes) !== expectedHash)
    throw Error("Knowledge result SHA-256 mismatch")
  const saved = JSON.parse(bytes),
    envelope = saved?.schema === "research-module-result/v1",
    index = envelope ? saved.data : saved
  if (
    envelope &&
    (saved.module !== "knowledge" ||
      saved.operation !== "index" ||
      !/^[a-f0-9]{64}$/.test(saved.input_sha256 || ""))
  )
    throw Error("A saved knowledge index module result required")
  const sections = [
    "concepts",
    "events",
    "trend_topics",
    "knowledge_connections",
    "entity_timelines",
    "company_timelines",
    "research_papers",
    "research_people",
    "research_relationships",
  ]
  if (
    index?.schema !== "research-ontology-knowledge-index/v1" ||
    !/^[a-f0-9]{64}$/.test(index.graph_sha256 || "") ||
    !Array.isArray(index.concepts) ||
    !Array.isArray(index.events) ||
    sections.some((key) => index[key] !== undefined && !Array.isArray(index[key])) ||
    !sections.includes(section) ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw Error("A saved knowledge index and bounded section page required")
  const rows = index[section] || []
  if (offset > rows.length) throw Error("Knowledge page offset exceeds its section")
  const items = rows.slice(offset, offset + limit),
    next = offset + items.length
  return {
    schema: "research-ontology-knowledge-page/v1",
    snapshot: {
      input: file,
      sha256: expectedHash,
      graph_sha256: index.graph_sha256,
      ...(envelope
        ? { input_sha256: saved.input_sha256, module: "knowledge", operation: "index" }
        : {}),
    },
    page: {
      section,
      offset,
      total: rows.length,
      returned: items.length,
      next_offset: next < rows.length ? next : null,
      items,
    },
    read_only: true,
    approvals_created: false,
  }
}

// Exact evidence dependencies for private correction triage. This reports
// affected approved versions; it never rewrites, excludes or approves content.
export function ontologyImpact(root, graph, query, options = {}) {
  const selectors = ["source_version_id", "claim_id", "event_id"]
  if (
    !query ||
    Object.keys(query).some((key) => ![...selectors, "run"].includes(key)) ||
    selectors.filter((key) => query[key] !== undefined).length !== 1 ||
    selectors.some(
      (key) =>
        query[key] !== undefined &&
        (typeof query[key] !== "string" || !query[key].trim() || query[key].length > 512),
    ) ||
    (query.event_id && !/^[a-f0-9]{16,64}$/.test(query.event_id)) ||
    (query.claim_id ? !/^[A-Za-z0-9_-]+$/.test(query.run || "") : query.run !== undefined)
  )
    throw Error("One exact source version, event, or claim with its reviewed run required")
  const noteRuns = options.noteReviewRuns || []
  if (
    !Array.isArray(noteRuns) ||
    noteRuns.length > 64 ||
    new Set(noteRuns).size !== noteRuns.length ||
    noteRuns.some((run) => typeof run !== "string" || !/^[A-Za-z0-9_-]+$/.test(run))
  )
    throw Error("Distinct explicit signal/topic approval runs required")
  const inputs = new Map(),
    notes = new Map(),
    sources = new Map()
  const sourceLoader = options.inputLoader || loadApprovedOntologyInput
  const noteLoader = options.noteApprovalLoader || loadHistoricalNoteApproval
  const evidenceLoader = options.noteSourceLoader || loadReviewedNoteSource
  const checkedOptions = {
    ...options,
    inputLoader: (sourceRoot, run, sourceOptions) => {
      if (!inputs.has(run)) inputs.set(run, sourceLoader(sourceRoot, run, sourceOptions))
      return inputs.get(run)
    },
    noteApprovalLoader: (sourceRoot, run, sourceOptions) => {
      if (!notes.has(run)) notes.set(run, noteLoader(sourceRoot, run, sourceOptions))
      return notes.get(run)
    },
  }
  // Impact reports exact dependencies of every actively bound version. It does
  // not select a latest public definition: an unrelated same-day definition
  // conflict must not prevent source corrections from being identified.
  assertEvidenceOntology(graph)
  extendEvidenceOntology(root, graph, [], checkedOptions)
  const reader = createOntologyReader(graph)
  const activeInputs = graph.inputs.map((ref) => inputs.get(ref.run))
  const eventFacts = (input) =>
    graph.nodes
      .filter((node) => node.type === "Claim" && node.run === input.run)
      .map((claim) => ({
        claim_id: claim.claim_id,
        evidence: reader.traceClaim(claim.claim_id, input.run).evidence,
      }))
  const concepts = new Map()
  const addDefinition = (conceptId, version, noteApproval) => {
    const key = JSON.stringify([conceptId, version.note_path, version.sha256])
    if (!concepts.has(key))
      concepts.set(key, {
        concept_id: conceptId,
        current: version,
        events: [],
        ...(noteApproval ? { note_approval: noteApproval } : {}),
      })
    return concepts.get(key)
  }
  for (const input of activeInputs) {
    for (const link of input.concept_review?.links || []) {
      const ref = input.concept_review.notes.find(
        (note) => note.path.replace(/\.md$/, "") === link.path,
      )
      if (!ref) throw Error("Impact specialist assignment has no exact definition version")
      const content = ref.approval_run
        ? checkedOptions
            .noteApprovalLoader(root, ref.approval_run, options)
            .approval.notes.find((note) => note.path === ref.path)?.content
        : historicalCanonicalContent(root, ref, options.vault || "vault", checkedOptions)
      if (typeof content !== "string" || sha256(content) !== ref.sha256)
        throw Error("Impact definition version changed")
      const note = parseNote(content)
      if (note.meta.concept_id !== link.concept_id || note.meta.map_review?.decision !== "include")
        throw Error("Reviewed specialist definition required")
      const concept = addDefinition(link.concept_id, definitionVersion(note, ref.path, ref.sha256))
      concept.events.push({
        event_id: input.article.event_id,
        facts: link.evidence.map(({ claim_id }) => ({
          claim_id,
          evidence: reader.traceClaim(claim_id, input.run).evidence,
        })),
      })
    }
  }
  for (const selected of prepareKnowledgeReviewSelections(
    root,
    options.knowledgeSelections,
    checkedOptions,
  ))
    addDefinition(selected.concept_id, selected.version, selected.approval)
  const index = {
    events: activeInputs.map((input) => ({
      event_id: input.article.event_id,
      title: input.article.title,
      article_path: `news/${input.article.event_id}`,
      facts: eventFacts(input),
    })),
    concepts: [...concepts.values()],
  }
  const eventForRun = (run) => inputs.get(run)?.article.event_id
  const matches = (run, claimId, eventId, evidence) =>
    query.source_version_id
      ? evidence.some((ref) => ref.source_version_id === query.source_version_id)
      : query.claim_id
        ? run === query.run && claimId === query.claim_id
        : eventId === query.event_id
  const articleRun = new Map(graph.inputs.map((ref) => [eventForRun(ref.run), ref.run]))
  const articles = index.events.flatMap((event) => {
    const run = articleRun.get(event.event_id)
    const facts = event.facts.filter((fact) =>
      matches(run, fact.claim_id, event.event_id, fact.evidence),
    )
    return facts.length
      ? [
          {
            run,
            event_id: event.event_id,
            title: event.title,
            article_path: event.article_path,
            claim_ids: facts.map((fact) => fact.claim_id),
          },
        ]
      : []
  })
  const relatedHistories = index.concepts.flatMap((concept) =>
    concept.events.flatMap((event) => {
      const run = articleRun.get(event.event_id)
      const facts = event.facts.filter((fact) =>
        matches(run, fact.claim_id, event.event_id, fact.evidence),
      )
      return facts.length
        ? [
            {
              concept_id: concept.concept_id,
              note_path: concept.current.note_path,
              event_id: event.event_id,
              run,
              claim_ids: facts.map((fact) => fact.claim_id),
            },
          ]
        : []
    }),
  )
  const noteDependencies = (note) =>
    note.evidence.flatMap((ref) => {
      if (!sources.has(ref.run_id)) sources.set(ref.run_id, evidenceLoader(root, ref.run_id))
      const source = sources.get(ref.run_id)
      return ref.claim_ids.flatMap((id) => {
        const claim = source.claims.find((item) => item.claim_id === id)
        if (!claim) throw Error("Note impact references an unknown reviewed fact")
        assertVerifiedClaim(claim, source.parses)
        const eventId = eventForRun(ref.run_id)
        if (!matches(ref.run_id, id, eventId, claim.evidence)) return []
        return [
          {
            run: ref.run_id,
            claim_id: id,
            ...(eventId ? { event_id: eventId } : {}),
            evidence: claim.evidence.map((evidence) => ({
              source_version_id: evidence.source_version_id,
              parse_id: evidence.parse_id,
              block_id: evidence.block_id,
            })),
          },
        ]
      })
    })
  const definitions = [],
    unboundDefinitions = []
  for (const concept of index.concepts) {
    const refs = activeInputs
      .flatMap((input) => input.concept_review?.notes || [])
      .filter(
        (ref) => ref.path === concept.current.note_path && ref.sha256 === concept.current.sha256,
      )
    const runIds = [
      ...new Set([
        ...refs.map((ref) => ref.approval_run).filter(Boolean),
        ...(concept.note_approval ? [concept.note_approval.run] : []),
      ]),
    ]
    if (!runIds.length) {
      // Canonical definitions without a native fact receipt are not guessed
      // from their URLs, aliases, mentions or related article assignments.
      unboundDefinitions.push(concept.current.note_path)
      continue
    }
    const approvals = runIds.map((run) => checkedOptions.noteApprovalLoader(root, run, options))
    const note = approvals[0].approval.notes.find((row) => row.path === concept.current.note_path)
    if (
      !note ||
      note.sha256 !== concept.current.sha256 ||
      approvals.some((approval) => {
        const other = approval.approval.notes.find((row) => row.path === note.path)
        return (
          !other ||
          other.sha256 !== note.sha256 ||
          JSON.stringify(other.evidence) !== JSON.stringify(note.evidence)
        )
      })
    )
      throw Error("Conflicting current definition evidence")
    const dependencies = noteDependencies(note)
    if (dependencies.length)
      definitions.push({
        concept_id: concept.concept_id,
        note_path: note.path,
        note_sha256: note.sha256,
        approval_runs: runIds,
        dependencies,
      })
  }
  const additionalNotes = []
  for (const run of noteRuns) {
    const approval = checkedOptions.noteApprovalLoader(root, run, options)
    const selected = approval.approval.notes.filter((note) =>
      /^(Signals|TrendTopics)\//.test(note.path),
    )
    if (!selected.length) throw Error("Additional impact approvals require Signals or TrendTopics")
    for (const note of selected) {
      const dependencies = noteDependencies(note)
      if (dependencies.length)
        additionalNotes.push({
          approval_run: run,
          note_path: note.path,
          note_sha256: note.sha256,
          dependencies,
        })
    }
  }
  const connectionApproval = options.connectionReviewRun
    ? loadKnowledgeConnectionApproval(root, options.connectionReviewRun, checkedOptions)
    : null
  const affectedConnections = connectionApproval?.approval.connections.flatMap((connection) => {
    const facts = connection.facts.filter((fact) =>
      matches(fact.run, fact.claim_id, eventForRun(fact.run), fact.evidence),
    )
    return facts.length ? [{ ...connection, facts, approval_run: connectionApproval.run }] : []
  })
  return {
    schema: "research-ontology-impact/v1",
    graph_sha256: graph.sha256,
    query,
    scope: {
      current_articles: index.events.length,
      current_definitions: new Set(index.concepts.map((concept) => concept.concept_id)).size,
      explicit_additional_note_runs: noteRuns,
      ...(connectionApproval ? { explicit_connection_review_runs: [connectionApproval.run] } : {}),
    },
    articles,
    definitions,
    related_histories: relatedHistories,
    additional_note_versions: additionalNotes,
    ...(connectionApproval ? { knowledge_connections: affectedConnections } : {}),
    unbound_definition_paths: unboundDefinitions,
    read_only: true,
    approvals_created: false,
    candidate_published: false,
  }
}

function buildOntologyKnowledge(
  root,
  graph,
  conceptId,
  {
    vault = "vault",
    inputLoader = loadApprovedOntologyInput,
    noteApprovalLoader = loadHistoricalNoteApproval,
  } = {},
  previousInputs = [],
  selectedDefinition = null,
  reader = createOntologyReader(graph),
) {
  assertEvidenceOntology(graph)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(conceptId || ""))
    throw Error("Exact specialist concept ID required")
  const edges = graph.edges.filter(
    (edge) =>
      edge.property === "explains" &&
      edge.to === `concept:${conceptId}` &&
      edge.basis === "reviewed_article_concept_assignment",
  )
  if (!edges.length) throw Error("Explicit source-backed specialist concept not found")
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  const versions = new Map(),
    events = []
  for (const edge of edges) {
    if (edge.basis !== "reviewed_article_concept_assignment" || !edge.evidence_claim_ids?.length)
      throw Error("Explicit source-backed specialist assignment required")
    const run = nodes.get(edge.from)?.run
    const receipt = graph.inputs.find((input) => input.run === run)
    const input = inputLoader(root, run, { vault })
    if (!receipt || JSON.stringify(input.file_hashes) !== JSON.stringify(receipt.files))
      throw Error("Knowledge article approval changed")
    const projection = projectEvidenceOntology([input])
    if (
      projection.nodes.some(
        (node) => JSON.stringify(nodes.get(node.id)) !== JSON.stringify(node),
      ) ||
      projection.edges.some(
        (relation) =>
          JSON.stringify(graph.edges.find((item) => item.id === relation.id)) !==
          JSON.stringify(relation),
      )
    )
      throw Error("Knowledge graph differs from its approved inputs")
    const link = input.concept_review?.links.find((item) => item.concept_id === conceptId)
    const ref = input.concept_review?.notes.find(
      (note) => note.path.replace(/\.md$/, "") === link?.path,
    )
    if (
      !link ||
      !ref ||
      edge.note_sha256 !== ref.sha256 ||
      edge.editorial_decision_sha256 !== input.concept_review.editorial_decision_sha256 ||
      JSON.stringify(edge.evidence_claim_ids) !==
        JSON.stringify(link.evidence.map((item) => item.claim_id))
    )
      throw Error("Knowledge assignment differs from its approved evidence")
    const content = ref.approval_run
      ? noteApprovalLoader(root, ref.approval_run, { vault }).approval.notes.find(
          (note) => note.path === ref.path,
        )?.content
      : historicalCanonicalContent(root, ref, vault, { noteApprovalLoader })
    if (typeof content !== "string" || sha256(content) !== ref.sha256)
      throw Error("Knowledge definition changed")
    const note = parseNote(content)
    if (note.meta.concept_id !== conceptId || note.meta.map_review?.decision !== "include")
      throw Error("Reviewed specialist definition required")
    const version = definitionVersion(note, ref.path, ref.sha256)
    if (
      versions.has(ref.sha256) &&
      JSON.stringify(versions.get(ref.sha256)) !== JSON.stringify(version)
    )
      throw Error("Conflicting specialist definition version")
    versions.set(ref.sha256, version)
    const eventEdge = graph.edges.find(
      (item) => item.from === edge.from && item.property === "describes",
    )
    const event = nodes.get(eventEdge?.to)
    if (!event || event.id !== `event:${input.article.event_id}`)
      throw Error("Knowledge event differs from its approved article")
    const facts = edge.evidence_claim_ids.map((claimId) => {
      const trace = reader.traceClaim(claimId, run)
      const approvedClaim = input.claims.find((claim) => claim.claim_id === claimId)
      if (
        trace.event.id !== event.id ||
        !approvedClaim ||
        trace.claim.statement !== approvedClaim.statement ||
        trace.claim.event_state !== approvedClaim.event_state ||
        JSON.stringify(trace.evidence.map((item) => item.quote).sort()) !==
          JSON.stringify(approvedClaim.evidence.map((item) => item.quote).sort())
      )
        throw Error("Knowledge fact differs from its approved evidence")
      return {
        claim_id: claimId,
        statement: trace.claim.statement,
        event_state: trace.claim.event_state,
        published_at: trace.claim.published_at,
        effective_period: trace.claim.effective_period,
        reviewed_at: trace.claim.reviewed_at,
        evidence: trace.evidence,
      }
    })
    events.push({
      event_id: input.article.event_id,
      title: event.title,
      published_at: event.published_at,
      ...(event.occurred_at ? { occurred_at: event.occurred_at } : {}),
      reviewed_at: event.reviewed_at,
      article_path: `news/${input.article.event_id}`,
      source_urls: input.article.source_urls,
      definition_sha256: ref.sha256,
      facts,
    })
  }
  const definitions = [...versions.values()].sort(
    (a, b) => b.reviewed_at.localeCompare(a.reviewed_at) || a.sha256.localeCompare(b.sha256),
  )
  if (
    !selectedDefinition &&
    definitions.length > 1 &&
    definitions[0].reviewed_at === definitions[1].reviewed_at
  )
    throw Error("Conflicting latest specialist definitions require review")
  const previousEvents = new Map()
  for (const input of previousInputs) {
    if (!input.concept_review?.links.some((link) => link.concept_id === conceptId)) continue
    const previous = buildOntologyKnowledge(root, projectEvidenceOntology([input]), conceptId, {
      vault,
      inputLoader,
      noteApprovalLoader,
    })
    for (const version of previous.definition_versions) {
      const saved = versions.get(version.sha256)
      if (saved && JSON.stringify(saved) !== JSON.stringify(version))
        throw Error("Conflicting specialist definition version")
      versions.set(version.sha256, version)
    }
    for (const event of previous.events) {
      const versions = previousEvents.get(event.event_id) || []
      versions.push(event)
      previousEvents.set(event.event_id, versions)
    }
  }
  const current = selectedDefinition?.version || definitions[0]
  return {
    schema: "research-ontology-knowledge/v1",
    concept_id: conceptId,
    current,
    definition_versions: [
      current,
      ...[...versions.values()]
        .filter((version) => version.sha256 !== current.sha256)
        .sort(
          (a, b) => b.reviewed_at.localeCompare(a.reviewed_at) || a.sha256.localeCompare(b.sha256),
        ),
    ],
    events: events
      .map((event) => ({
        ...event,
        ...(previousEvents.has(event.event_id)
          ? { previous_versions: previousEvents.get(event.event_id) }
          : {}),
      }))
      .sort(
        (a, b) =>
          (b.occurred_at || b.published_at).localeCompare(a.occurred_at || a.published_at) ||
          a.event_id.localeCompare(b.event_id),
      ),
  }
}

// Generated read model over the existing approval graph and Knowledge notes.
// Each approved input is loaded once per build; this is never a definition store
// or an assertion that the number of articles measures technology growth.
export function ontologyKnowledgeIndex(root, graph, options = {}) {
  const inputs = new Map()
  const noteApprovals = new Map(),
    readers = new WeakMap()
  const readerFor = (sourceGraph) => {
    if (!readers.has(sourceGraph)) readers.set(sourceGraph, createOntologyReader(sourceGraph))
    return readers.get(sourceGraph)
  }
  const noteLoader = options.noteApprovalLoader || loadHistoricalNoteApproval
  const noteApprovalLoader = (sourceRoot, run, sourceOptions) => {
    if (!noteApprovals.has(run)) noteApprovals.set(run, noteLoader(sourceRoot, run, sourceOptions))
    return noteApprovals.get(run)
  }
  const sourceLoader = options.inputLoader || loadApprovedOntologyInput
  const inputLoader = (sourceRoot, run, sourceOptions) => {
    if (!inputs.has(run)) inputs.set(run, sourceLoader(sourceRoot, run, sourceOptions))
    return inputs.get(run)
  }
  const checkedOptions = { ...options, inputLoader, noteApprovalLoader }
  const selectedDefinitions = prepareKnowledgeReviewSelections(
    root,
    options.knowledgeSelections,
    checkedOptions,
  )
  extendEvidenceOntology(root, graph, [], checkedOptions)
  // Lineage verification also loads archived inputs. Only current inputs belong
  // in search, counts, related articles and relationship/timeline projections.
  const activeInputs = graph.inputs.map((receipt) => inputs.get(receipt.run))
  const companyTimelines = options.companyReview
    ? reviewedCompanyTimelines(graph, activeInputs, options.companyReview, readerFor(graph))
    : []
  // Reuse the native paper identifier guard across articles. A paper's reviewed
  // work ID groups appearances; matching titles never establish that identity.
  const paperAppearances = activeInputs.flatMap((input) => {
    const papers = [
      ...(input.article.record?.papers || []),
      ...(input.draft.deep_context?.input.papers || []),
    ]
    return papers.map((paper) => ({ input, paper }))
  })
  reconcilePaperVersions(paperAppearances.map(({ paper }) => paper))
  const researchPapers = new Map()
  for (const { input, paper } of paperAppearances) {
    let work = researchPapers.get(paper.work_id)
    if (!work) {
      work = { work_id: paper.work_id, identifiers: [], events: [] }
      researchPapers.set(paper.work_id, work)
    }
    for (const identifier of paper.identifiers)
      if (!work.identifiers.includes(identifier)) work.identifiers.push(identifier)
    const appearance = {
      event_id: input.article.event_id,
      article_path: `news/${input.article.event_id}`,
      published_at: input.article.article_review.published_at,
      reviewed_at: input.article.article_review.reviewed_at,
      ...publicPaperMetadata([paper])[0],
    }
    const existing = work.events.find((event) => event.event_id === appearance.event_id)
    if (existing && JSON.stringify(existing) !== JSON.stringify(appearance))
      throw Error("Conflicting paper metadata in one approved event")
    if (!existing) work.events.push(appearance)
  }
  for (const work of researchPapers.values()) {
    work.identifiers.sort()
    work.events.sort(
      (a, b) =>
        b.published_at.localeCompare(a.published_at) || a.event_id.localeCompare(b.event_id),
    )
  }
  const ids = [
    ...new Set(
      graph.edges
        .filter(
          (edge) =>
            edge.property === "explains" && edge.basis === "reviewed_article_concept_assignment",
        )
        .map((edge) => edge.to.slice("concept:".length)),
    ),
  ].sort()
  const names = [
    ...new Set(
      graph.nodes.filter((node) => node.type === "EntityMention").map((node) => node.label),
    ),
  ].sort()
  // Relationships come from explicitly reviewed deep context, never matching
  // people by name or treating co-occurrence as a founding relationship.
  const researchRelationships = activeInputs.flatMap((input) => {
    const context = input.draft.deep_context
    if (!context) return []
    const metadata = publicDeepMetadata(context.input)
    return context.input.relations.map((relation, index) => ({
      ...metadata.relations[index],
      event_id: input.article.event_id,
      article_path: `news/${input.article.event_id}`,
      reviewed_at: context.review.reviewed_at,
      claim_ids: [...relation.claim_ids],
      evidence: relation.claim_ids.flatMap(
        (id) => readerFor(graph).traceClaim(id, input.run).evidence,
      ),
    }))
  })
  const researchPeople = reconcilePersonNames(researchRelationships)
    .map((person) => ({
      ...person,
      relationships: researchRelationships
        .filter((relation) => relation.person_id === person.person_id)
        .sort(
          (a, b) =>
            b.as_of.localeCompare(a.as_of) ||
            a.event_id.localeCompare(b.event_id) ||
            a.role.localeCompare(b.role),
        ),
    }))
    .sort((a, b) => a.person_id.localeCompare(b.person_id))
  const eventView = (input, sourceGraph) => ({
    event_id: input.article.event_id,
    title: input.article.title,
    published_at: input.article.article_review.published_at,
    ...(input.article.article_review.occurred_at
      ? { occurred_at: input.article.article_review.occurred_at }
      : {}),
    reviewed_at: input.article.article_review.reviewed_at,
    sector: input.article.sector,
    theme: input.article.theme,
    tags: input.article.tags,
    article_path: `news/${input.article.event_id}`,
    source_urls: input.article.source_urls,
    ...(input.article.record?.kind ? { kind: input.article.record.kind } : {}),
    ...(input.article.record?.papers?.length
      ? { papers: publicPaperMetadata(input.article.record.papers) }
      : {}),
    ...(input.draft.deep_context
      ? { deep: publicDeepMetadata(input.draft.deep_context.input) }
      : {}),
    ...(input.article.article_review.concept_ids?.length
      ? { concept_ids: input.article.article_review.concept_ids }
      : {}),
    facts: sourceGraph.nodes
      .filter((node) => node.type === "Claim" && node.run === input.run)
      .map((claim) => ({
        claim_id: claim.claim_id,
        statement: claim.statement,
        subject: claim.subject,
        event_state: claim.event_state,
        effective_period: claim.effective_period,
        numbers: claim.numbers,
        reviewed_at: claim.reviewed_at,
        evidence: readerFor(sourceGraph).traceClaim(claim.claim_id, claim.run).evidence,
      })),
  })
  const concepts = ids.map((id) =>
    buildOntologyKnowledge(
      root,
      graph,
      id,
      checkedOptions,
      (graph.revision_history || []).map((revision) => inputs.get(revision.previous.run)),
      selectedDefinitions.find((definition) => definition.concept_id === id),
      readerFor(graph),
    ),
  )
  for (const selected of selectedDefinitions) {
    const existing = concepts.find((item) => item.concept_id === selected.concept_id)
    if (existing) {
      const sameVersion = existing.definition_versions.find(
        (version) => version.sha256 === selected.version.sha256,
      )
      if (sameVersion && JSON.stringify(sameVersion) !== JSON.stringify(selected.version))
        throw Error("Selected specialist definition differs from its reviewed version")
      existing.current = selected.version
      existing.definition_versions = [
        selected.version,
        ...existing.definition_versions.filter(
          (version) => version.sha256 !== selected.version.sha256,
        ),
      ]
      existing.note_approval = selected.approval
    } else {
      concepts.push({
        schema: "research-ontology-knowledge/v1",
        concept_id: selected.concept_id,
        current: selected.version,
        definition_versions: [selected.version],
        events: [],
        note_approval: selected.approval,
      })
    }
  }
  concepts.sort((a, b) => a.concept_id.localeCompare(b.concept_id))
  const connectionApproval = options.connectionReviewRun
    ? loadKnowledgeConnectionApproval(root, options.connectionReviewRun, checkedOptions)
    : null
  for (const connection of connectionApproval?.approval.connections || []) {
    for (const endpoint of [connection.source_definition, connection.target_definition]) {
      if (
        !concepts.some(
          (concept) =>
            concept.current.note_path === endpoint.path &&
            concept.current.sha256 === endpoint.sha256,
        )
      )
        throw Error("Reviewed connection endpoints must be selected in the current knowledge index")
    }
  }
  const trendTopics = options.trendReviewRuns?.length
    ? projectApprovedTrends(
        root,
        graph,
        activeInputs,
        concepts,
        options.trendReviewRuns,
        checkedOptions,
      )
    : []
  return {
    schema: "research-ontology-knowledge-index/v1",
    graph_sha256: graph.sha256,
    events: activeInputs
      .map((input) => {
        const previous = (graph.revision_history || [])
          .filter((revision) => revision.event_id === input.article.event_id)
          .map((revision) => {
            const old = inputs.get(revision.previous.run)
            return eventView(old, projectEvidenceOntology([old]))
          })
        return {
          ...eventView(input, graph),
          ...(previous.length ? { previous_versions: previous } : {}),
        }
      })
      .sort(
        (a, b) =>
          (b.occurred_at || b.published_at).localeCompare(a.occurred_at || a.published_at) ||
          a.event_id.localeCompare(b.event_id),
      ),
    concepts,
    ...(connectionApproval
      ? {
          knowledge_connections: connectionApproval.approval.connections,
          knowledge_connection_review: {
            run: connectionApproval.run,
            files: connectionApproval.files,
          },
        }
      : {}),
    ...(trendTopics.length ? { trend_topics: trendTopics } : {}),
    entity_timelines: names.map((name) => readerFor(graph).entityTimeline(name)),
    ...(companyTimelines.length ? { company_timelines: companyTimelines } : {}),
    ...(researchPapers.size
      ? {
          research_papers: [...researchPapers.values()].sort((a, b) =>
            a.work_id.localeCompare(b.work_id),
          ),
        }
      : {}),
    ...(researchPeople.length ? { research_people: researchPeople } : {}),
    ...(researchRelationships.length
      ? {
          research_relationships: researchRelationships.sort(
            (a, b) =>
              b.as_of.localeCompare(a.as_of) ||
              a.person_id.localeCompare(b.person_id) ||
              a.role.localeCompare(b.role) ||
              a.event_id.localeCompare(b.event_id),
          ),
        }
      : {}),
  }
}

function reviewedCompanyTimelines(graph, inputs, review, reader = createOntologyReader(graph)) {
  assertCompanyIdentityReview(review)
  const normalize = (value) => value.normalize("NFKC").replace(/\s+/g, " ").toLowerCase().trim()
  return review.companies
    .map((company) => {
      const events = new Map()
      for (const assignment of company.assignments) {
        const input = inputs.find((item) => item.run === assignment.run)
        if (
          !input ||
          input.article.event_id !== assignment.event_id ||
          sha256(JSON.stringify(input.file_hashes)) !== assignment.approval_files_sha256
        )
          throw Error("Company identity review differs from current approved article")
        const reviewedAt = Object.hasOwn(assignment, "reviewed_at")
          ? assignment.reviewed_at
          : review.reviewed_at
        if (reviewedAt < input.article.article_review.reviewed_at)
          throw Error("Company identity review predates article review")
        const traces = assignment.claim_ids.map((id) => reader.traceClaim(id, input.run))
        const mentions = [
          ...(input.article.entities || []),
          ...traces.map((trace) => trace.claim.subject),
        ]
        if (!mentions.some((name) => normalize(name) === normalize(assignment.entity_label)))
          throw Error("Company identity assignment has no reviewed mention in its event")
        if (
          assignment.source_names.some(
            (name) =>
              !traces.some((trace) =>
                trace.evidence.some((item) => {
                  const quote = normalize(item.quote),
                    needle = normalize(name)
                  for (
                    let pos = quote.indexOf(needle);
                    pos !== -1;
                    pos = quote.indexOf(needle, pos + 1)
                  ) {
                    if (
                      (!/^[a-z0-9_]/.test(needle) || !/[a-z0-9_]/.test(quote[pos - 1] || "")) &&
                      (!/[a-z0-9_]$/.test(needle) ||
                        !/[a-z0-9_]/.test(quote[pos + needle.length] || ""))
                    )
                      return true
                  }
                  return false
                }),
              ),
          )
        )
          throw Error("Company source name missing from selected approved evidence")
        const event = graph.nodes.find((node) => node.id === `event:${assignment.event_id}`)
        let row = events.get(assignment.event_id)
        if (!row) {
          row = {
            event_id: assignment.event_id,
            title: event.title,
            published_at: event.published_at,
            ...(event.occurred_at ? { occurred_at: event.occurred_at } : {}),
            reviewed_at: event.reviewed_at,
            article_path: `news/${assignment.event_id}`,
            source_urls: input.article.source_urls,
            identity_assignments: [],
            facts: [],
          }
          events.set(assignment.event_id, row)
        }
        row.identity_assignments.push({
          entity_label: assignment.entity_label,
          source_names: [...assignment.source_names],
          as_of: assignment.as_of,
          reviewed_at: reviewedAt,
          claim_ids: [...assignment.claim_ids],
          evidence: traces.flatMap((trace) => trace.evidence),
        })
        for (const { claim, evidence } of traces)
          if (!row.facts.some((fact) => fact.claim_id === claim.claim_id))
            row.facts.push({
              claim_id: claim.claim_id,
              statement: claim.statement,
              subject: claim.subject,
              claim_kind: claim.claim_kind,
              event_state: claim.event_state,
              published_at: claim.published_at,
              effective_period: claim.effective_period,
              numbers: structuredClone(claim.numbers),
              reviewed_at: claim.reviewed_at,
              evidence,
            })
      }
      for (const event of events.values()) {
        event.identity_assignments.sort((a, b) => a.entity_label.localeCompare(b.entity_label))
        event.facts.sort((a, b) => a.claim_id.localeCompare(b.claim_id))
      }
      return {
        company_id: company.company_id,
        label: company.label,
        kind: company.kind,
        identity_scope: "reviewed_event_assignments_only",
        events: [...events.values()].sort(
          (a, b) =>
            (b.occurred_at || b.published_at).localeCompare(a.occurred_at || a.published_at) ||
            a.event_id.localeCompare(b.event_id),
        ),
      }
    })
    .sort((a, b) => a.company_id.localeCompare(b.company_id))
}

export function ontologyCompany(root, graph, companyId, options = {}) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(companyId || ""))
    throw Error("Exact reviewed company ID required")
  if (!options.companyReview) throw Error("Company query requires explicit identity review")
  const company = ontologyKnowledgeIndex(root, graph, options).company_timelines?.find(
    (item) => item.company_id === companyId,
  )
  if (!company) throw Error("Reviewed company not found")
  return company
}

export function ontologyResearchPaper(root, graph, workId, options = {}) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(workId || ""))
    throw Error("Exact reviewed paper work ID required")
  const work = ontologyKnowledgeIndex(root, graph, options).research_papers?.find(
    (paper) => paper.work_id === workId,
  )
  if (!work) throw Error("Reviewed paper work not found")
  return work
}

export function ontologyResearchPerson(root, graph, personId, options = {}) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(personId || ""))
    throw Error("Exact reviewed person ID required")
  const person = ontologyKnowledgeIndex(root, graph, options).research_people?.find(
    (item) => item.person_id === personId,
  )
  if (!person) throw Error("Reviewed person not found")
  return person
}
