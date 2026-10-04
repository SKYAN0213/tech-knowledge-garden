import fs from "node:fs"
import path from "node:path"
import { walk, parseNote, sections } from "../garden.mjs"
import { learningKinds } from "../../web/graph-model.mjs"
import { edgeLabels } from "../../web/layout.mjs"
import { assertReviewDate } from "./dates.mjs"
import { safePath } from "./run-state.mjs"
import { paperKey } from "../paper-identifiers.mjs"

export { paperKey }

const nonempty = (value) => typeof value === "string" && !!value.trim()
const exactName = (value) => value.normalize("NFKC").toLowerCase().trim()
export const CONCEPT_NOTE_HEADINGS = [
  "한 문장 정의",
  "용어 카드",
  "범위",
  "왜 중요한가",
  "핵심 구성 요소",
  "작동 원리",
  "실제 예시",
  "한계와 실패 조건",
  "혼동하기 쉬운 개념",
  "관련 개념",
  "최근 변화",
  "출처",
]

export function assertNewConceptMetadata(meta, { reviewDay, sourceURLs }) {
  const required = [
    "title",
    "type",
    "entry_type",
    "schema_version",
    "status",
    "domain",
    "group",
    "concept_id",
    "label",
    "created",
    "updated",
    "last_reviewed",
    "aliases",
    "keywords",
    "parent_concepts",
    "related_concepts",
    "tags",
    "verified_sources",
    "map_review",
  ]
  const allowed = [...required, "relations", "connections"]
  if (
    !meta ||
    typeof meta !== "object" ||
    Array.isArray(meta) ||
    Object.keys(meta).some((key) => !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(meta, key)) ||
    ["title", "label", "domain", "group"].some((key) => !nonempty(meta[key])) ||
    ["title", "label", "domain", "group"].some((key) => /[\[\]|<>\x00-\x1f\x7f]/.test(meta[key])) ||
    meta.type !== "knowledge" ||
    meta.entry_type !== "concept" ||
    meta.schema_version !== "tech-encyclopedia/v2" ||
    meta.status !== "evergreen" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(meta.concept_id || "") ||
    ["created", "updated", "last_reviewed"].some((key) => meta[key] !== reviewDay)
  )
    throw Error("Explicit new specialist concept identity and current metadata required")
  assertReviewDate(reviewDay)
  for (const key of [
    "aliases",
    "keywords",
    "parent_concepts",
    "related_concepts",
    "tags",
    "verified_sources",
  ]) {
    const values = meta[key]
    if (
      !Array.isArray(values) ||
      values.some((v) => !nonempty(v)) ||
      new Set(values.map(exactName)).size !== values.length
    )
      throw Error("Distinct explicit concept metadata array required: " + key)
  }
  if (
    !meta.keywords.length ||
    !meta.verified_sources.length ||
    meta.verified_sources.some((url) => !/^https:\/\//.test(url) || !sourceURLs.has(url))
  )
    throw Error("New concept needs selected reviewed source URLs and keywords")
  const map = meta.map_review
  if (
    !map ||
    Object.keys(map).some((key) => !["decision", "kind", "reason", "reviewed"].includes(key)) ||
    !["include", "exclude"].includes(map.decision) ||
    !learningKinds.includes(map.kind) ||
    !nonempty(map.reason) ||
    map.reason.trim().length < 10 ||
    map.reviewed !== reviewDay
  )
    throw Error("Explicit specialist learning-value review required")
  assertConceptConnections(meta, sourceURLs)
}

export function assertConceptConnections(meta, sourceURLs) {
  for (const key of ["relations", "connections"]) {
    const edges = meta[key] || []
    if (!Array.isArray(edges)) throw Error("Explicit concept connection array required")
    const seen = new Set()
    for (const edge of edges) {
      const typed = key === "relations",
        identity = edge?.target + "|" + (typed ? edge?.type : "")
      if (
        !edge ||
        Object.keys(edge).some(
          (k) =>
            !(
              typed
                ? ["target", "type", "reason", "evidence", "basis"]
                : ["target", "reason", "evidence"]
            ).includes(k),
        ) ||
        !nonempty(edge.target) ||
        edge.target === meta.concept_id ||
        !nonempty(edge.reason) ||
        seen.has(identity) ||
        (typed &&
          (!Object.hasOwn(edgeLabels, edge.type) ||
            !["source", "inference"].includes(edge.basis) ||
            !edge.evidence?.length)) ||
        (edge.evidence !== undefined &&
          (!Array.isArray(edge.evidence) ||
            edge.evidence.some((u) => !sourceURLs.has(u) || !meta.verified_sources.includes(u))))
      )
        throw Error("Source-bound concept connections required")
      seen.add(identity)
    }
  }
}

export function assertNewConceptBody(note) {
  const parts = sections(note.body, 2)
  if (
    JSON.stringify(sections(note.body, 1).map((s) => s.title)) !==
      JSON.stringify([note.meta.title]) ||
    JSON.stringify(parts.map((s) => s.title)) !== JSON.stringify(CONCEPT_NOTE_HEADINGS) ||
    parts.some((s) => !s.body.trim()) ||
    !/[가-힣]/.test(parts[0]?.body || "") ||
    parts[0]?.body === "없음" ||
    !parts.find((s) => s.title === "범위")?.body.includes("**포함:**") ||
    !parts.find((s) => s.title === "범위")?.body.includes("**포함하지 않음:**")
  )
    throw Error("Complete canonical concept headings, definition and scope required")
  const sourceSection = parts.find((s) => s.title === "출처").body
  const links = new Set([...sourceSection.matchAll(/https:\/\/[^\s<>\)\]]+/g)].map((m) => m[0]))
  if (
    !note.meta.verified_sources.every((u) => links.has(u)) ||
    [...links].some((u) => !note.meta.verified_sources.includes(u))
  )
    throw Error("New concept source section must retain its reviewed sources")
  if (
    /<(?:script|iframe)\b|근거가 부족|분석.*생략|검증.*실패|수집.*실패|새 소식 없음|분석할 수 없/i.test(
      note.body,
    )
  )
    throw Error("Operational copy or unsafe markup in new concept prose")
}

// Compare changed concepts with every canonical concept, including map exclusions
// and other newly created concepts in this approval or preview batch.
export function assertConceptConflicts(vault, proposals) {
  if (proposals.some((n) => n.operation === "create" && /[\[\]|#]/.test(n.path)))
    throw Error("New concept path cannot contain wiki delimiters")
  const changed = new Map(
    proposals.filter((n) => n.path.startsWith("Knowledge/")).map((n) => [n.path, n]),
  )
  const concepts = walk(path.join(vault, "Knowledge"))
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const relative = path.relative(vault, file).split(path.sep).join("/")
      const meta = parseNote(
        changed.get(relative)?.content || fs.readFileSync(safePath(vault, relative), "utf8"),
      ).meta
      return { path: relative, meta }
    })
    .filter((n) => n.meta.entry_type === "concept")
  for (const n of changed.values()) {
    if (!concepts.some((c) => c.path === n.path))
      concepts.push({ path: n.path, meta: parseNote(n.content).meta })
  }
  for (const concept of concepts.filter((n) => changed.has(n.path))) {
    const names = new Set(
      [
        path.basename(concept.path, ".md"),
        concept.meta.title,
        concept.meta.label,
        ...(concept.meta.aliases || []),
      ]
        .filter(nonempty)
        .map(exactName),
    )
    for (const other of concepts.filter((n) => n.path !== concept.path)) {
      if (
        other.meta.concept_id === concept.meta.concept_id ||
        [
          path.basename(other.path, ".md"),
          other.meta.title,
          other.meta.label,
          ...(other.meta.aliases || []),
        ]
          .filter(nonempty)
          .some((s) => names.has(exactName(s)))
      )
        throw Error("Concept identity or exact alias conflicts with another canonical note")
    }
    for (const edge of [...(concept.meta.relations || []), ...(concept.meta.connections || [])])
      if (!concepts.some((c) => c.meta.concept_id === edge.target))
        throw Error("Unknown concept connection target")
  }
}

export function conceptRegistry(vault) {
  return walk(path.join(vault, "Knowledge"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({
      path: path.relative(vault, f).replace(/\.md$/, ""),
      ...parseNote(fs.readFileSync(f, "utf8")),
    }))
    .filter(
      (n) =>
        n.meta.concept_id &&
        n.meta.map_review?.decision === "include" &&
        [
          "mechanism",
          "method",
          "architecture",
          "protocol",
          "metric",
          "security",
          "evaluation",
          "model",
        ].includes(n.meta.map_review?.kind) &&
        n.meta.verified_sources?.length,
    )
}
export function verifiedConceptLinks(article, assignments, concepts) {
  if (article.review_status !== "verified") return []
  return assignments.map((a) => {
    const concept = concepts.find((c) => c.meta.concept_id === a.concept_id)
    if (
      !concept ||
      a.status !== "verified" ||
      !a.reason?.trim() ||
      !a.evidence?.length ||
      !a.reviewer ||
      !a.reviewed_at
    )
      throw Error("Reviewed specialist concept assignment required")
    if (
      a.evidence.some(
        (e) => e.event_id !== article.event_id || !article.claim_ids.includes(e.claim_id),
      )
    )
      throw Error("Concept assignment references another event")
    return {
      concept_id: a.concept_id,
      path: concept.path,
      reason: a.reason,
      evidence: a.evidence,
      reviewed_at: a.reviewed_at,
    }
  })
}
export function correctionImpact(
  { claims = [], articles = [], concepts = [], histories = [] },
  invalidSourceVersions,
) {
  const invalid = new Set(invalidSourceVersions)
  const claim_ids = new Set(
    claims
      .filter((c) => c.evidence.some((e) => invalid.has(e.source_version_id)))
      .map((c) => c.claim_id),
  )
  const event_ids = new Set(
    articles.filter((a) => a.claim_ids.some((id) => claim_ids.has(id))).map((a) => a.event_id),
  )
  const concept_ids = new Set(
    concepts
      .filter((c) =>
        c.evidence?.some((e) => claim_ids.has(e.claim_id) || event_ids.has(e.event_id)),
      )
      .map((c) => c.concept_id),
  )
  const history_ids = histories
    .filter((h) => event_ids.has(h.event_id) || h.claim_ids?.some((id) => claim_ids.has(id)))
    .map((h) => h.id)
  return {
    claim_ids: [...claim_ids],
    event_ids: [...event_ids],
    concept_ids: [...concept_ids],
    history_ids,
    action: "re_review",
    public_mutation_performed: false,
  }
}
export function reconcilePaperVersions(papers) {
  const works = new Map()
  for (const p of papers) {
    for (const identifier of p.identifiers) {
      const key = paperKey(identifier)
      if (works.has(key) && works.get(key) !== p.work_id)
        throw Error("Paper version identity conflict")
      works.set(key, p.work_id)
    }
  }
  return [...works.entries()]
}
export function assertPersonIdentity(person, existing) {
  if (!person.person_id || !person.name || !person.affiliation || !person.evidence_urls?.length)
    throw Error("Explicit person identity and affiliation evidence required")
  const prior = existing.find((p) => p.person_id === person.person_id)
  if (
    prior &&
    (prior.name !== person.name ||
      (prior.affiliation !== person.affiliation && !person.reconciliation?.evidence_urls?.length))
  )
    throw Error("Person identity conflict requires evidence-based reconciliation")
  // Similar names and coauthorship never automatically create a founder relation.
  return person
}
