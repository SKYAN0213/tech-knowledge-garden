import fs from "node:fs"
import { parseNote, sections } from "../garden.mjs"
import { sha256 } from "./contracts.mjs"
import { safePath } from "./run-state.mjs"
import { parseResearchDate, assertReviewDate } from "./dates.mjs"
import {
  assertEvidenceOntology,
  createOntologyReader,
  loadApprovedOntologyInput,
  projectEvidenceOntology,
} from "./ontology.mjs"
import { loadHistoricalNoteApproval } from "./note-review.mjs"
import { assertCompanyIdentityReview } from "./knowledge-links.mjs"
import { loadHistoricalKnowledgeConnectionApproval } from "./ontology-knowledge.mjs"
import { slugifyFilePath } from "@quartz-community/utils"
import { schema, file, integer, list, day, validateArguments } from "./modules/contracts.mjs"

const hash = { type: "string", pattern: "^[a-f0-9]{64}$" }
const slug = { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }
const phrase = { type: "string", minLength: 1, maxLength: 1000, pattern: "\\S" }
export const knowledgeExplorerSchema = schema(
  {
    mode: { type: "string", enum: ["search", "concept", "weekly", "companies"] },
    index_file: file("root"),
    index_sha256: hash,
    graph_file: file("root"),
    graph_sha256: hash,
    question: phrase,
    concept_id: slug,
    company_ids: list(slug, 16),
    company_review_file: file("root"),
    company_review_sha256: hash,
    comparison_review_file: file("root"),
    comparison_review_sha256: hash,
    from: day,
    to: day,
    as_of: day,
    themes: list(phrase, 8),
    event_states: list(
      { type: "string", enum: ["planned", "in_progress", "completed", "reported", "unknown"] },
      5,
    ),
    offset: integer(0, 100000),
    limit: integer(1, 100),
    facts_per_group: integer(1, 12),
  },
  ["mode", "index_file", "index_sha256", "graph_file", "graph_sha256"],
)

const normal = (value) =>
  String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
const unique = (values) => [...new Set(values)]
const byDate = (a, b) =>
  (b.occurred_at || b.published_at).localeCompare(a.occurred_at || a.published_at) ||
  a.event_id.localeCompare(b.event_id)
const dayOf = (value) => parseResearchDate(value)?.day
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const nonempty = (value) => typeof value === "string" && !!value.trim()
const exactKeys = (value, keys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).every((k) => keys.includes(k))
const sourceStateLabels = {
  planned: "계획",
  in_progress: "진행",
  completed: "완료",
  reported: "발표",
  unknown: "",
}
export const COMPANY_AXES = {
  product_family: "제품군",
  application: "적용 산업",
  customer: "고객 도입",
  investment_production: "투자·생산",
  financials: "실적",
}
export const CONCEPT_AXES = { method: "방법", application: "적용 조건", validation: "검증 결과" }

function fixedJSON(ctx, fileName, expected, label) {
  const bytes = fs.readFileSync(safePath(ctx.root, fileName))
  if (!/^[a-f0-9]{64}$/.test(expected || "") || sha256(bytes) !== expected)
    throw Error(`${label} SHA-256 mismatch`)
  return JSON.parse(bytes)
}

function loadSnapshot(ctx, p) {
  const stored = fixedJSON(ctx, p.index_file, p.index_sha256, "Knowledge index")
  const index = stored.schema === "research-module-result/v1" ? stored.data : stored
  if (
    stored.schema === "research-module-result/v1" &&
    (stored.module !== "knowledge" || stored.operation !== "index")
  )
    throw Error("A saved native knowledge index is required")
  const graph = assertEvidenceOntology(
    fixedJSON(ctx, p.graph_file, p.graph_sha256, "Knowledge graph"),
  )
  if (
    index?.schema !== "research-ontology-knowledge-index/v1" ||
    index.graph_sha256 !== graph.sha256 ||
    !Array.isArray(index.events) ||
    !Array.isArray(index.concepts)
  )
    throw Error("Knowledge index differs from its pinned approved graph")
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  const eventRuns = new Map(graph.inputs.map((input) => [input.event_id, input.run]))
  const reader = createOntologyReader(graph)
  const seen = new Set()
  const excluded = new Set()
  for (const event of index.events) {
    const node = nodes.get(`event:${event.event_id}`)
    const article = nodes.get(`article:${eventRuns.get(event.event_id)}`)
    if (
      !node ||
      seen.has(event.event_id) ||
      !article ||
      ["title", "published_at", "reviewed_at", "sector", "theme"].some(
        (key) => event[key] !== node[key],
      ) ||
      !same(event.tags, node.tags) ||
      !same(event.source_urls, article.source_urls) ||
      event.article_path !== `news/${event.event_id}` ||
      !Array.isArray(event.facts)
    )
      throw Error("Knowledge event differs from its approved graph")
    seen.add(event.event_id)
    const canonical = safePath(ctx.vault, `News/${event.event_id}.md`)
    if (fs.existsSync(canonical)) {
      const meta = parseNote(fs.readFileSync(canonical, "utf8")).meta
      if (
        ["excluded", "공개 제외"].includes(meta.review_status) ||
        ["excluded", "공개 제외"].includes(meta.article_review?.review_status)
      )
        excluded.add(event.event_id)
    }
    for (const fact of event.facts) {
      const trace = reader.traceClaim(fact.claim_id, article.run)
      if (
        trace.event.id !== node.id ||
        fact.statement !== trace.claim.statement ||
        fact.event_state !== trace.claim.event_state ||
        !same(fact.evidence, trace.evidence) ||
        !same(fact.numbers, trace.claim.numbers) ||
        fact.effective_period !== trace.claim.effective_period
      )
        throw Error("Knowledge fact differs from its reviewed source span")
    }
  }
  const native = new Map()
  function inputFor(eventId) {
    const run = eventRuns.get(eventId)
    if (!run || excluded.has(eventId)) throw Error("An active approved event is required")
    if (!native.has(run)) {
      const input = loadApprovedOntologyInput(ctx.root, run, { vault: ctx.vault })
      const receipt = graph.inputs.find((item) => item.run === run)
      if (!same(input.file_hashes, receipt.files)) throw Error("Knowledge approval bytes changed")
      const projection = projectEvidenceOntology([input])
      if (
        projection.nodes.some((node) => !same(node, nodes.get(node.id))) ||
        projection.edges.some(
          (edge) =>
            !same(
              edge,
              graph.edges.find((item) => item.id === edge.id),
            ),
        )
      )
        throw Error("Knowledge graph differs from its current native approval")
      native.set(run, input)
    }
    return native.get(run)
  }
  function factFor(eventId, claimId) {
    const input = inputFor(eventId)
    const trace = reader.traceClaim(claimId, input.run)
    if (trace.event.id !== `event:${eventId}`)
      throw Error("Selected claim belongs to another event")
    const paragraphs = [
      ...input.draft.draft.lead,
      ...input.draft.draft.explanations.flatMap((section) => section.paragraphs),
    ].filter(
      (item) =>
        item.claim_ids.length === 1 && item.claim_ids[0] === claimId && /[가-힣]/.test(item.text),
    )
    return {
      claim_id: claimId,
      statement: trace.claim.statement,
      ...(paragraphs.length
        ? { display_text: unique(paragraphs.map((item) => item.text)).join(" ") }
        : {}),
      subject: trace.claim.subject,
      claim_kind: trace.claim.claim_kind,
      event_state: trace.claim.event_state,
      state_label: sourceStateLabels[trace.claim.event_state],
      published_at: trace.claim.published_at,
      reviewed_at: trace.claim.reviewed_at,
      effective_period: trace.claim.effective_period,
      numbers: trace.claim.numbers,
      evidence: trace.evidence,
    }
  }
  function eventFor(eventId, claimIds = null) {
    const indexed = index.events.find((item) => item.event_id === eventId)
    if (!indexed) throw Error("Selected event is not in the current knowledge index")
    const input = inputFor(eventId)
    const ids = claimIds || indexed.facts.map((fact) => fact.claim_id)
    const facts = ids.map((id) => factFor(eventId, id))
    const paragraphs = [
      ...input.draft.draft.lead,
      ...input.draft.draft.explanations.flatMap((section) => section.paragraphs),
    ]
      .filter(
        (paragraph) =>
          paragraph.claim_ids.every((id) => ids.includes(id)) && /[가-힣]/.test(paragraph.text),
      )
      .map((paragraph) => ({ text: paragraph.text, claim_ids: paragraph.claim_ids }))
    return {
      event_id: indexed.event_id,
      title: indexed.title,
      published_at: indexed.published_at,
      ...(indexed.occurred_at ? { occurred_at: indexed.occurred_at } : {}),
      reviewed_at: indexed.reviewed_at,
      article_path: indexed.article_path,
      source_urls: unique(facts.flatMap((fact) => fact.evidence.map((item) => item.source_url))),
      sector: indexed.sector,
      theme: indexed.theme,
      tags: [...(indexed.tags || [])],
      facts,
      ...(paragraphs.length
        ? { paragraphs: [...new Map(paragraphs.map((item) => [item.text, item])).values()] }
        : {}),
    }
  }
  for (const concept of index.concepts) {
    if (!Array.isArray(concept.events) || !concept.current?.sha256)
      throw Error("An exact specialist definition and event assignment are required")
    for (const event of concept.events) {
      const run = eventRuns.get(event.event_id)
      const edge = graph.edges.find(
        (item) =>
          item.property === "explains" &&
          item.from === `article:${run}` &&
          item.to === `concept:${concept.concept_id}` &&
          item.basis === "reviewed_article_concept_assignment",
      )
      if (
        !edge ||
        !same([...edge.evidence_claim_ids].sort(), event.facts.map((fact) => fact.claim_id).sort())
      )
        throw Error("Specialist history differs from its explicit reviewed article assignment")
    }
  }
  return { index, graph, nodes, reader, eventRuns, excluded, inputFor, factFor, eventFor }
}

function approvedDefinition(ctx, snapshot, concept) {
  snapshot.definitionCache ||= new Map()
  const key = concept.concept_id + "|" + concept.current.sha256
  if (!snapshot.definitionCache.has(key))
    snapshot.definitionCache.set(key, readApprovedDefinition(ctx, snapshot, concept))
  return structuredClone(snapshot.definitionCache.get(key))
}

function readApprovedDefinition(ctx, snapshot, concept) {
  const current = concept.current
  let approval = concept.note_approval
  if (!approval) {
    const edge = snapshot.graph.edges.find(
      (item) =>
        item.property === "explains" &&
        item.to === `concept:${concept.concept_id}` &&
        item.note_sha256 === current.sha256,
    )
    const run = snapshot.nodes.get(edge?.from)?.run
    const eventId = snapshot.graph.inputs.find((item) => item.run === run)?.event_id
    const input = eventId ? snapshot.inputFor(eventId) : null
    const note = input?.concept_review?.notes.find((item) => item.sha256 === current.sha256)
    if (note?.approval_run)
      approval = {
        run: note.approval_run,
        path: note.path,
        sha256: note.sha256,
        ...(note.approval_files ? { files: note.approval_files } : {}),
      }
    else if (note) {
      const bytes = fs.readFileSync(safePath(ctx.vault, note.path))
      if (sha256(bytes) !== current.sha256)
        throw Error("Current specialist definition bytes changed")
      return definitionView(bytes.toString(), concept, note)
    }
  }
  if (!approval) throw Error("Specialist definition requires its exact native approval")
  const loaded = loadHistoricalNoteApproval(ctx.root, approval.run, { vault: ctx.vault })
  if (approval.files && !same(approval.files, loaded.files))
    throw Error("Definition approval receipt changed")
  const note = loaded.approval.notes.find(
    (item) => item.path === approval.path && item.sha256 === current.sha256,
  )
  const canonical = safePath(ctx.vault, current.note_path)
  const applied = fs.existsSync(canonical)
  if (
    !note ||
    sha256(note.content) !== current.sha256 ||
    (applied ? sha256(fs.readFileSync(canonical)) !== current.sha256 : note.operation !== "create")
  )
    throw Error("Current specialist definition bytes changed")
  return definitionView(note.content, concept, approval, applied)
}

function definitionView(content, concept, approval, applied = true) {
  const note = parseNote(content)
  if (
    note.meta.concept_id !== concept.concept_id ||
    note.meta.map_review?.decision !== "include" ||
    (note.meta.label || note.meta.title) !== concept.current.label ||
    !same(note.meta.aliases || [], concept.current.aliases || [])
  )
    throw Error("A reviewed specialist learning term is required")
  const parts = sections(note.body, 2)
  const part = (heading) => parts.find((item) => item.title === heading)?.body.trim()
  if (!part("한 문장 정의") || part("한 문장 정의") !== concept.current.definition)
    throw Error("Knowledge definition differs from its selected note")
  const fields = {
    scope: "범위",
    components: "핵심 구성 요소",
    mechanism: "작동 원리",
    examples: "실제 예시",
    conditions: "한계와 실패 조건",
    distinctions: "혼동하기 쉬운 개념",
  }
  return {
    concept_id: concept.concept_id,
    label: note.meta.label || note.meta.title,
    aliases: note.meta.aliases || [],
    definition: part("한 문장 정의"),
    ...(applied ? { concept_path: slugifyFilePath(concept.current.note_path) } : {}),
    applied,
    reviewed_at: note.meta.last_reviewed,
    source_urls: note.meta.verified_sources || [],
    ...Object.fromEntries(
      Object.entries(fields)
        .filter(([, heading]) => part(heading) && part(heading) !== "없음")
        .map(([field, heading]) => [field, part(heading)]),
    ),
    note_approval: {
      run: approval.run || approval.approval_run,
      path: concept.current.note_path,
      sha256: concept.current.sha256,
    },
  }
}

function companyViews(ctx, p, snapshot) {
  if (!p.company_review_file) return []
  const review = assertCompanyIdentityReview(
    fixedJSON(ctx, p.company_review_file, p.company_review_sha256, "Company identity review"),
  )
  return review.companies.map((company) => {
    const events = new Map()
    for (const assignment of company.assignments) {
      if (snapshot.excluded.has(assignment.event_id)) continue
      const input = snapshot.inputFor(assignment.event_id)
      if (
        input.run !== assignment.run ||
        sha256(JSON.stringify(input.file_hashes)) !== assignment.approval_files_sha256
      )
        throw Error("Company identity review differs from its exact article approval")
      const reviewedAt = assignment.reviewed_at || review.reviewed_at
      assertReviewDate(reviewedAt, {
        notBefore: [input.article.article_review.reviewed_at, assignment.as_of],
      })
      const facts = assignment.claim_ids.map((id) => snapshot.factFor(assignment.event_id, id))
      const names = [...input.article.entities, ...facts.map((fact) => fact.subject)].map(normal)
      if (
        !names.includes(normal(assignment.entity_label)) ||
        assignment.source_names.some(
          (name) =>
            !facts.some((fact) => fact.evidence.some((item) => exactNameInQuote(item.quote, name))),
        )
      )
        throw Error("Company identity requires its reviewed source name and event mention")
      const existing = events.get(assignment.event_id)
      const ids = unique([
        ...(existing?.facts.map((fact) => fact.claim_id) || []),
        ...assignment.claim_ids,
      ])
      events.set(assignment.event_id, {
        ...snapshot.eventFor(assignment.event_id, ids),
        as_of: assignment.as_of,
        identity_reviewed_at: reviewedAt,
        source_names: unique([...(existing?.source_names || []), ...assignment.source_names]),
      })
    }
    return {
      company_id: company.company_id,
      label: company.label,
      kind: company.kind,
      events: [...events.values()].sort(byDate),
      aliases: unique(
        company.assignments.flatMap((item) => [item.entity_label, ...item.source_names]),
      ),
    }
  })
}

function exactNameInQuote(quote, name) {
  const source = normal(quote),
    needle = normal(name)
  for (let pos = source.indexOf(needle); pos !== -1; pos = source.indexOf(needle, pos + 1))
    if (
      (!/^[a-z0-9_]/.test(needle) || !/[a-z0-9_]/.test(source[pos - 1] || "")) &&
      (!/[a-z0-9_]$/.test(needle) || !/[a-z0-9_]/.test(source[pos + needle.length] || ""))
    )
      return true
  return false
}

function reviewedComparisons(ctx, p, snapshot, companies) {
  if (!p.comparison_review_file) return { company_facets: [], concept_facets: [], comparisons: [] }
  const review = fixedJSON(
    ctx,
    p.comparison_review_file,
    p.comparison_review_sha256,
    "Knowledge comparison review",
  )
  if (
    !exactKeys(review, [
      "schema",
      "index_sha256",
      "graph_sha256",
      "reviewer",
      "reviewed_at",
      "source_read",
      "identity_checked",
      "conditions_checked",
      "company_facets",
      "concept_facets",
      "comparisons",
    ]) ||
    review.schema !== "research-knowledge-explorer-review/v1" ||
    review.index_sha256 !== p.index_sha256 ||
    review.graph_sha256 !== p.graph_sha256 ||
    !nonempty(review.reviewer) ||
    ["source_read", "identity_checked", "conditions_checked"].some((key) => review[key] !== true) ||
    ["company_facets", "concept_facets", "comparisons"].some(
      (key) => !Array.isArray(review[key]) || review[key].length > 300,
    )
  )
    throw Error("An exact source-reviewed knowledge comparison is required")
  assertReviewDate(review.reviewed_at)
  const cell = (ref, type, requireAxis = true) => {
    const idKey = type === "company" ? "company_id" : "concept_id"
    if (
      !exactKeys(ref, [
        idKey,
        "event_id",
        "claim_id",
        "claim_ids",
        "axis",
        "number_index",
        "metric",
        "scope",
        "period",
        "conditions",
      ]) ||
      !nonempty(ref[idKey]) ||
      !nonempty(ref.event_id) ||
      !nonempty(ref.claim_id) ||
      (requireAxis && !Object.hasOwn(type === "company" ? COMPANY_AXES : CONCEPT_AXES, ref.axis))
    )
      throw Error("An explicit reviewed comparison cell is required")
    const owner =
      type === "company"
        ? companies.find((item) => item.company_id === ref.company_id)
        : snapshot.index.concepts.find((item) => item.concept_id === ref.concept_id)
    if (type === "concept" && owner) approvedDefinition(ctx, snapshot, owner)
    const event = owner?.events.find((item) => item.event_id === ref.event_id)
    if (!event || !event.facts.some((fact) => fact.claim_id === ref.claim_id))
      throw Error("Comparison cell is outside its reviewed company or specialist assignment")
    const fact = snapshot.factFor(ref.event_id, ref.claim_id)
    assertReviewDate(review.reviewed_at, { notBefore: [fact.reviewed_at] })
    const claimIds = unique([ref.claim_id, ...(ref.claim_ids || [])])
    if (
      !Array.isArray(ref.claim_ids || []) ||
      claimIds.some((id) => !event.facts.some((item) => item.claim_id === id))
    )
      throw Error("Every comparison prose claim needs the same explicit owner assignment")
    const prose = snapshot.eventFor(ref.event_id, claimIds)
    const base = {
      [idKey]: ref[idKey],
      label: owner.label || owner.current.label,
      axis: ref.axis,
      event_id: ref.event_id,
      title: event.title,
      article_path: `news/${ref.event_id}`,
      published_at: fact.published_at,
      reviewed_at: review.reviewed_at,
      fact,
      ...(claimIds.length > 1 ? { facts: prose.facts } : {}),
      ...(prose.paragraphs?.length
        ? { display_text: prose.paragraphs.map((paragraph) => paragraph.text).join(" ") }
        : {}),
    }
    if (ref.number_index === undefined) return base
    const number = fact.numbers[ref.number_index]
    if (!Number.isSafeInteger(ref.number_index) || ref.number_index < 0 || !number)
      throw Error("Numeric comparison references an unknown exact source number")
    if (
      !nonempty(ref.metric) ||
      !nonempty(ref.scope) ||
      !nonempty(ref.period) ||
      !Array.isArray(ref.conditions) ||
      !ref.conditions.length ||
      ref.conditions.some((item) => !nonempty(item))
    )
      return base
    if (
      ref.conditions.some(
        (condition) =>
          !fact.evidence.some((item) => normal(item.quote).includes(normal(condition))),
      )
    )
      throw Error("Numeric comparison conditions require exact selected source wording")
    return {
      ...base,
      measure: {
        number_index: ref.number_index,
        ...number,
        metric: ref.metric,
        scope: ref.scope,
        period: ref.period,
        conditions: ref.conditions,
      },
    }
  }
  const company_facets = review.company_facets.map((ref) => cell(ref, "company"))
  const concept_facets = review.concept_facets.map((ref) => cell(ref, "concept"))
  const comparisons = review.comparisons.flatMap((group) => {
    if (
      !exactKeys(group, ["id", "label", "kind", "items"]) ||
      !nonempty(group.id) ||
      !nonempty(group.label) ||
      !["company", "concept"].includes(group.kind) ||
      !Array.isArray(group.items) ||
      group.items.length < 2 ||
      group.items.length > 16
    )
      throw Error("A bounded explicitly reviewed comparison group is required")
    const items = group.items.map((ref) => cell(ref, group.kind, false))
    const baseline = items[0].measure
    // No unit conversion, period inference, arithmetic, winner or growth claim.
    // Conditions missing or unequal mean no reader comparison is created.
    if (
      !baseline ||
      items.some(
        (item) =>
          !item.measure ||
          ["unit", "condition", "metric", "scope", "period"].some(
            (key) => normal(item.measure[key]) !== normal(baseline[key]),
          ) ||
          item.fact.event_state !== items[0].fact.event_state ||
          item.fact.claim_kind !== items[0].fact.claim_kind ||
          !same(
            item.measure.conditions.map(normal).sort(),
            baseline.conditions.map(normal).sort(),
          ) ||
          normal(item.fact.effective_period) !== normal(item.measure.period),
      )
    )
      return []
    return [
      {
        id: group.id,
        label: group.label,
        kind: group.kind,
        metric: baseline.metric,
        scope: baseline.scope,
        period: baseline.period,
        conditions: baseline.conditions,
        items,
      },
    ]
  })
  return { company_facets, concept_facets, comparisons }
}

function queryPlan(p, snapshot, companies) {
  const question = normal(p.question)
  const asOf =
    p.as_of || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date())
  let from = p.from,
    to = p.to
  const explicitDates = [...question.matchAll(/20\d{2}-\d{2}-\d{2}/g)].map((item) => item[0])
  if (!from && explicitDates[0]) from = explicitDates[0]
  if (!to && explicitDates[1]) to = explicitDates[1]
  if ((p.mode === "weekly" || /최근|이번 주|지난 7일|일주일/.test(question)) && !from) {
    to ||= asOf
    from = new Date(Date.parse(to + "T00:00:00Z") - 6 * 86400000).toISOString().slice(0, 10)
  }
  for (const value of [asOf, from, to].filter(Boolean))
    if (!parseResearchDate(value)) throw Error("A real calendar date is required")
  if (from && to && from > to) throw Error("Knowledge query date range is reversed")
  const conceptIds = p.concept_id
    ? [p.concept_id]
    : snapshot.index.concepts
        .filter((concept) =>
          [concept.concept_id, concept.current.label, ...(concept.current.aliases || [])].some(
            (name) => name && exactNameInQuote(question, name),
          ),
        )
        .map((concept) => concept.concept_id)
  const companyIds =
    p.company_ids ||
    companies
      .filter((company) =>
        [company.company_id, company.label, ...company.aliases].some((name) =>
          exactNameInQuote(question, name),
        ),
      )
      .map((company) => company.company_id)
  if (conceptIds.some((id) => !snapshot.index.concepts.some((item) => item.concept_id === id)))
    throw Error("Reviewed specialist concept not found")
  if (companyIds.some((id) => !companies.some((item) => item.company_id === id)))
    throw Error("Exact reviewed company identity not found")
  const stop = new Set([
    "최근",
    "이번",
    "지난",
    "주",
    "7일",
    "일주일",
    "업체",
    "기업",
    "회사",
    "관련",
    "뉴스",
    "소식",
    "발표",
    "발표를",
    "정리",
    "모아줘",
    "모아",
    "알려줘",
    "조사",
    "보여줘",
    "기사",
    "나온",
    "내용",
    "대한",
    "대해서",
    "어떻게",
    "차이",
    "비교",
    "알려",
    "줘",
  ])
  const terms = unique(
    question
      .replace(/20\d{2}-\d{2}-\d{2}/g, " ")
      .split(/[^\p{L}\p{N}._+-]+/u)
      .filter((word) => word.length > 1 && !stop.has(word))
      .map((word) =>
        word.replace(
          /(?<=[가-힣]{2})(?:에서|으로|까지|부터|은|는|이|가|의|을|를|와|과|에|도)$/u,
          "",
        ),
      )
      .filter((word) => !stop.has(word)),
  )
  return {
    question: p.question || null,
    as_of: asOf,
    from,
    to,
    concept_ids: conceptIds,
    company_ids: companyIds,
    themes: p.themes || [],
    event_states: p.event_states || [],
    terms,
  }
}

function inRange(event, query) {
  const day = dayOf(event.occurred_at || event.published_at)
  return (
    (!query.from || day >= query.from) &&
    (!query.to || day <= query.to) &&
    (!query.themes.length || query.themes.includes(event.theme)) &&
    (!query.event_states.length ||
      event.facts.some((fact) => query.event_states.includes(fact.event_state)))
  )
}

function search(snapshot, query, companies, p) {
  const conceptEvents = new Set(
    query.concept_ids.flatMap((id) =>
      snapshot.index.concepts
        .find((item) => item.concept_id === id)
        .events.map((event) => event.event_id),
    ),
  )
  const companyEvents = new Set(
    query.company_ids.flatMap((id) =>
      companies.find((item) => item.company_id === id).events.map((event) => event.event_id),
    ),
  )
  const ranked = snapshot.index.events
    .filter(
      (event) =>
        !snapshot.excluded.has(event.event_id) &&
        inRange(event, query) &&
        (!query.concept_ids.length || conceptEvents.has(event.event_id)) &&
        (!query.company_ids.length || companyEvents.has(event.event_id)),
    )
    .map((event) => {
      const title = normal(event.title + " " + event.theme + " " + event.tags.join(" "))
      const matching = event.facts.filter(
        (fact) =>
          !query.terms.length ||
          query.terms.some((term) => normal(fact.statement + " " + fact.subject).includes(term)),
      )
      const score = query.terms.reduce(
        (sum, term) =>
          sum +
          (title.includes(term) ? 3 : 0) +
          (event.facts.some((fact) => normal(fact.statement).includes(term)) ? 1 : 0),
        0,
      )
      return { event, score, matching }
    })
    .filter(
      (row) =>
        !query.terms.length ||
        row.score > 0 ||
        query.concept_ids.length ||
        query.company_ids.length,
    )
    .sort((a, b) => b.score - a.score || byDate(a.event, b.event))
  const offset = p.offset || 0,
    limit = p.limit || 20
  const items = ranked.slice(offset, offset + limit).map(({ event, matching }) => {
    const facts = matching.length ? matching : event.facts
    const result = snapshot.eventFor(
      event.event_id,
      facts.slice(0, 4).map((fact) => fact.claim_id),
    )
    return { ...result, other_facts: event.facts.length - result.facts.length }
  })
  return {
    items,
    page: {
      offset,
      limit,
      total: ranked.length,
      next_offset: offset + items.length < ranked.length ? offset + items.length : null,
    },
  }
}

function conceptReader(ctx, p, snapshot, query, comparisons) {
  if (!p.concept_id) throw Error("Concept mode requires an exact concept_id")
  const concept = snapshot.index.concepts.find((item) => item.concept_id === p.concept_id)
  const definition = approvedDefinition(ctx, snapshot, concept)
  const events = concept.events
    .filter((event) => !snapshot.excluded.has(event.event_id) && inRange(event, query))
    .sort(byDate)
    .slice(p.offset || 0, (p.offset || 0) + (p.limit || 20))
    .map((event) =>
      snapshot.eventFor(
        event.event_id,
        event.facts.map((fact) => fact.claim_id),
      ),
    )
  const approvals = new Map()
  const neighbors = (snapshot.index.knowledge_connections || [])
    .filter(
      (connection) =>
        connection.from === concept.concept_id || connection.target === concept.concept_id,
    )
    .map((connection) => {
      const id = connection.from === concept.concept_id ? connection.target : connection.from
      const neighbor = snapshot.index.concepts.find((item) => item.concept_id === id)
      if (!neighbor) return null
      const reviewRun = connection.approval_run || snapshot.index.knowledge_connection_review?.run
      if (!reviewRun) throw Error("A knowledge connection requires its exact native review")
      if (!approvals.has(reviewRun))
        approvals.set(
          reviewRun,
          loadHistoricalKnowledgeConnectionApproval(ctx.root, reviewRun, { vault: ctx.vault }),
        )
      const receipt = approvals.get(reviewRun)
      const expected =
        snapshot.index.knowledge_connection_reviews?.find((item) => item.run === reviewRun) ||
        snapshot.index.knowledge_connection_review
      const { approval_run, ...reviewed } = connection
      if (
        !expected ||
        !same(expected.files, receipt.files) ||
        !receipt.approval.connections.some((item) => same(item, reviewed)) ||
        connection.source_definition.sha256 !==
          snapshot.index.concepts.find((item) => item.concept_id === connection.from)?.current
            .sha256 ||
        connection.target_definition.sha256 !==
          snapshot.index.concepts.find((item) => item.concept_id === connection.target)?.current
            .sha256
      )
        throw Error("Knowledge connection differs from its selected definition or approval")
      const view = approvedDefinition(ctx, snapshot, neighbor)
      return {
        concept_id: id,
        label: view.label,
        concept_path: view.concept_path,
        reason: connection.reason,
      }
    })
    .filter(Boolean)
  return {
    title: definition.label,
    definition,
    events,
    ...(neighbors.length ? { related: neighbors } : {}),
    ...(comparisons.concept_facets.some((item) => item.concept_id === p.concept_id)
      ? {
          learning: comparisons.concept_facets.filter((item) => item.concept_id === p.concept_id),
        }
      : {}),
    ...(comparisons.comparisons.some(
      (item) =>
        item.kind === "concept" && item.items.some((cell) => cell.concept_id === p.concept_id),
    )
      ? {
          comparisons: comparisons.comparisons.filter(
            (item) =>
              item.kind === "concept" &&
              item.items.some((cell) => cell.concept_id === p.concept_id),
          ),
        }
      : {}),
  }
}

function weeklyReader(ctx, snapshot, query, companies, p) {
  const companyEvents = new Set(
    companies
      .filter((company) => query.company_ids.includes(company.company_id))
      .flatMap((company) => company.events.map((event) => event.event_id)),
  )
  const selected = snapshot.index.events.filter(
    (event) =>
      !snapshot.excluded.has(event.event_id) &&
      inRange(event, query) &&
      (!query.company_ids.length || companyEvents.has(event.event_id)) &&
      (!query.concept_ids.length ||
        query.concept_ids.some((id) =>
          snapshot.index.concepts
            .find((concept) => concept.concept_id === id)
            .events.some((item) => item.event_id === event.event_id),
        )),
  )
  const selectedIds = new Set(selected.map((event) => event.event_id))
  const groups = []
  const covered = new Set()
  const factKey = (fact) =>
    JSON.stringify([normal(fact.statement), fact.event_state, fact.effective_period, fact.numbers])
  const factsForEvents = (events) => {
    const facts = new Map()
    for (const event of events) {
      const read = snapshot.eventFor(event.event_id)
      for (const fact of read.facts) {
        const key = factKey(fact),
          row = facts.get(key)
        const reference = {
          event_id: read.event_id,
          title: read.title,
          article_path: read.article_path,
          published_at: fact.published_at,
          reviewed_at: fact.reviewed_at,
        }
        if (row) {
          row.events.push(reference)
          row.evidence = [
            ...new Map(
              [...row.evidence, ...fact.evidence].map((item) => [JSON.stringify(item), item]),
            ).values(),
          ]
        } else facts.set(key, { ...fact, events: [reference] })
      }
    }
    return [...facts.values()]
  }
  for (const topic of snapshot.index.trend_topics || []) {
    const observations = (topic.history || []).filter((item) => selectedIds.has(item.event_id))
    if (!observations.length) continue
    const approval = loadHistoricalNoteApproval(ctx.root, topic.note_approval.run, {
      vault: ctx.vault,
    })
    const note = approval.approval.notes.find((item) => item.path === topic.note_approval.path)
    const canonical = note && safePath(ctx.vault, note.path)
    const applied = canonical && fs.existsSync(canonical)
    if (
      !same(approval.files, topic.note_approval.files) ||
      !note ||
      note.sha256 !== topic.note_approval.sha256 ||
      (applied
        ? sha256(fs.readFileSync(canonical)) !== note.sha256
        : note.operation !== "create") ||
      parseNote(note.content).meta.title !== topic.title
    )
      throw Error("Weekly topic differs from its current approved note")
    const events = unique(observations.map((item) => item.event_id)).map((id) =>
      selected.find((event) => event.event_id === id),
    )
    for (const event of events)
      if (!note.evidence.some((ref) => ref.run_id === snapshot.eventRuns.get(event.event_id)))
        throw Error("Weekly topic event lacks its explicit reviewed source assignment")
    events.forEach((event) => covered.add(event.event_id))
    groups.push({
      id: `topic:${topic.topic_id}`,
      title: topic.title,
      ...(applied ? { topic_path: topic.topic_path } : {}),
      facts: factsForEvents(events),
    })
  }
  for (const concept of snapshot.index.concepts) {
    if (query.concept_ids.length && !query.concept_ids.includes(concept.concept_id)) continue
    const events = concept.events.filter(
      (event) => selectedIds.has(event.event_id) && !covered.has(event.event_id),
    )
    if (!events.length) continue
    const definition = approvedDefinition(ctx, snapshot, concept)
    events.forEach((event) => covered.add(event.event_id))
    groups.push({
      id: `concept:${concept.concept_id}`,
      title: concept.current.label,
      concept_path: definition.concept_path,
      facts: factsForEvents(events),
    })
  }
  for (const theme of unique(
    selected.filter((event) => !covered.has(event.event_id)).map((event) => event.theme),
  )) {
    const events = selected.filter((event) => event.theme === theme && !covered.has(event.event_id))
    groups.push({ id: `theme:${theme}`, title: theme, facts: factsForEvents(events) })
  }
  const offset = p.offset || 0,
    limit = p.limit || 20
  const boundedGroups = groups.map((group) => {
    const facts = group.facts.slice(0, p.facts_per_group || 4)
    const visible = new Set(facts.flatMap((fact) => fact.events.map((event) => event.event_id)))
    const additionalArticles = [
      ...new Map(
        group.facts
          .flatMap((fact) => fact.events)
          .filter((event) => !visible.has(event.event_id))
          .map((event) => [event.event_id, event]),
      ).values(),
    ]
    return {
      ...group,
      facts,
      ...(additionalArticles.length ? { additional_articles: additionalArticles } : {}),
    }
  })
  return {
    title: `${query.from}–${query.to || query.as_of}`,
    period: { from: query.from, to: query.to || query.as_of },
    groups: boundedGroups.slice(offset, offset + limit),
    page: {
      offset,
      limit,
      total: groups.length,
      next_offset: offset + limit < groups.length ? offset + limit : null,
    },
  }
}

function companiesReader(companies, query, comparisons, p) {
  if (!companies.length)
    throw Error("Company mode requires a fixed reviewed company identity selection")
  const selected = companies
    .filter(
      (company) => !query.company_ids.length || query.company_ids.includes(company.company_id),
    )
    .map((company) => {
      const events = company.events.filter((event) => inRange(event, query)).slice(0, p.limit || 20)
      const eventIds = new Set(events.map((event) => event.event_id))
      const facets = comparisons.company_facets.filter(
        (item) => item.company_id === company.company_id && eventIds.has(item.event_id),
      )
      return {
        company_id: company.company_id,
        label: company.label,
        kind: company.kind,
        events,
        ...(facets.length
          ? {
              axes: Object.entries(COMPANY_AXES).flatMap(([id, label]) => {
                const items = facets.filter((facet) => facet.axis === id)
                return items.length ? [{ id, label, items }] : []
              }),
            }
          : {}),
      }
    })
    .filter((company) => company.events.length)
  const comparisonsFor = comparisons.comparisons.filter(
    (group) =>
      group.kind === "company" &&
      group.items.every((cell) =>
        selected.some(
          (company) =>
            company.company_id === cell.company_id &&
            company.events.some((event) => event.event_id === cell.event_id),
        ),
      ),
  )
  return {
    title: p.question || selected.map((company) => company.label).join(" · ") || "기업 동향",
    companies: selected,
    ...(comparisonsFor.length ? { comparisons: comparisonsFor } : {}),
  }
}

function companyReviewCandidates(ctx, snapshot, p) {
  const catalogFile = safePath(ctx.repo, "data/research-watchlist.json")
  const watchlist = fs.existsSync(catalogFile)
    ? JSON.parse(fs.readFileSync(catalogFile)).robot_manufacturers || []
    : []
  const candidates = []
  for (const company of watchlist) {
    const names = unique([company.name, ...(company.aliases || [])])
    const matching = snapshot.index.events
      .filter(
        (event) =>
          !snapshot.excluded.has(event.event_id) &&
          names.some((name) =>
            exactNameInQuote(
              event.title + " " + event.facts.map((fact) => fact.subject).join(" "),
              name,
            ),
          ),
      )
      .slice(0, p.limit || 20)
    for (const event of matching) {
      const input = snapshot.inputFor(event.event_id)
      const facts = event.facts.map((fact) => snapshot.factFor(event.event_id, fact.claim_id))
      const sourceNames = names.filter((name) =>
        facts.some((fact) => fact.evidence.some((item) => exactNameInQuote(item.quote, name))),
      )
      if (!sourceNames.length) continue
      const entityLabels = unique([
        ...input.article.entities,
        ...facts.map((fact) => fact.subject),
      ]).filter((name) => names.some((alias) => normal(name) === normal(alias)))
      candidates.push({
        watchlist_id: company.id,
        watchlist_label: company.name,
        status: "identity_review_required",
        run: input.run,
        event_id: event.event_id,
        title: event.title,
        published_at: event.published_at,
        article_path: event.article_path,
        approval_files_sha256: sha256(JSON.stringify(input.file_hashes)),
        entity_labels: entityLabels,
        source_names: sourceNames,
        facts,
      })
    }
  }
  return {
    schema: "research-company-explorer-candidates/v1",
    watchlist: watchlist.map((company) => ({ id: company.id, label: company.name })),
    candidates,
    review_template: {
      schema: "research-company-identity-review/v1",
      reviewer: null,
      reviewed_at: null,
      companies: [],
    },
    identities_created: false,
  }
}

// Read projections reuse native IDs, source spans and authored note approvals.
// There is no new knowledge store, model inference, retrieval embedding or write.
export function exploreKnowledge(ctx, parameters) {
  const p = validateArguments(parameters, knowledgeExplorerSchema, ctx)
  for (const prefix of ["company_review", "comparison_review"])
    if (!!p[`${prefix}_file`] !== !!p[`${prefix}_sha256`])
      throw Error(`${prefix} requires its file and SHA-256 together`)
  if (p.mode === "search" && !p.question && !p.concept_id && !p.company_ids && !p.from && !p.themes)
    throw Error("Search requires a question or explicit filters")
  const snapshot = loadSnapshot(ctx, p)
  const companies = companyViews(ctx, p, snapshot)
  if (p.company_ids && !companies.length)
    throw Error("Company filters require explicit reviewed company identities")
  const query = queryPlan(p, snapshot, companies)
  for (const id of query.concept_ids)
    approvedDefinition(
      ctx,
      snapshot,
      snapshot.index.concepts.find((concept) => concept.concept_id === id),
    )
  const comparisons = reviewedComparisons(ctx, p, snapshot, companies)
  let reader
  let reviewCandidates
  if (p.mode === "concept") reader = conceptReader(ctx, p, snapshot, query, comparisons)
  else if (p.mode === "weekly") reader = weeklyReader(ctx, snapshot, query, companies, p)
  else if (p.mode === "companies") {
    if (companies.length) reader = companiesReader(companies, query, comparisons, p)
    else {
      reviewCandidates = companyReviewCandidates(ctx, snapshot, p)
      reader = { title: "로봇 제조사", companies: [] }
    }
  } else reader = { title: p.question || "관련 기사", ...search(snapshot, query, companies, p) }
  return {
    schema: "research-knowledge-explorer/v1",
    mode: p.mode,
    snapshot: {
      index: { path: p.index_file, sha256: p.index_sha256 },
      graph: { path: p.graph_file, sha256: p.graph_sha256 },
      ...(p.company_review_file
        ? { company_review: { path: p.company_review_file, sha256: p.company_review_sha256 } }
        : {}),
      ...(p.comparison_review_file
        ? {
            comparison_review: {
              path: p.comparison_review_file,
              sha256: p.comparison_review_sha256,
            },
          }
        : {}),
    },
    query,
    reader,
    ...(reviewCandidates ? { company_review_candidates: reviewCandidates } : {}),
    read_only: true,
    approvals_created: false,
    model_calls: 0,
    source_requests: 0,
    canonical_writes: false,
  }
}
