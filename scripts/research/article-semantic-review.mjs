import fs from "node:fs"
import crypto from "node:crypto"
import path from "node:path"
import { parseNote, sections, walk, canonicalURL } from "../garden.mjs"
import { articleSearchText } from "../knowledge.mjs"
import { markdownProseText } from "../explanations.mjs"
import { assertSchema, sha256 } from "./contracts.mjs"
import { assertVerifiedClaim } from "./claims.mjs"
import { assertReviewDate } from "./dates.mjs"
import {
  assertSemanticRetrievalSourceReview,
  semanticRetrievalReviewSchema,
} from "./article-concept-review.mjs"
import { conceptRegistry } from "./knowledge-links.mjs"
import { loadApprovedOntologyInput } from "./ontology.mjs"
import { approvedArticleMatchesRenderedContent } from "./preview.mjs"
import { lookupArchiveLocations } from "./archive-locations.mjs"
import { resolveRolePolicy } from "./model-policy.mjs"
import { createReasoningTask, readReasoningTask } from "./reasoning-tasks.mjs"
import { readOperationGate } from "./operation-policy.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"
import { Ollama, localOllamaURL } from "./ollama.mjs"
import {
  recordSemanticObservation,
  readSemanticObservations,
  summarizeSemanticObservations,
  startSemanticStageTimer,
} from "./semantic-review-metrics.mjs"
import {
  CONCEPT_CANDIDATE_INDEX_SCHEMA,
  CONCEPT_RETRIEVAL_VERSION,
  DEFAULT_CONCEPT_CANDIDATE_LIMIT,
  DEFAULT_CONCEPT_EMBEDDING_MODEL,
  DEFAULT_MINIMUM_MEDIAN_CONCEPT_PAYLOAD_REDUCTION,
  assertConceptCandidateEvaluation,
  assertConceptCandidateIndex,
  buildConceptCandidateIndex,
  conceptCandidateGoldSha256,
  conceptCandidateProfile,
  evaluateConceptCandidateRecall,
  rankConceptCandidates,
} from "./concept-candidate-index.mjs"
import {
  ARTICLE_SEMANTIC_INDEX_SCHEMA,
  ARTICLE_SEMANTIC_REVIEW_SCHEMA,
  articleRelationRoles,
  articlePublicFingerprint,
  assertArticleSemanticReviewIndex,
} from "../../web/article-semantic-index.mjs"

const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema",
    "event_id",
    "outcome",
    "review_reason",
    "links",
    "relation_candidates",
    "concept_candidates",
    "keyword_candidates",
  ],
  properties: {
    schema: { type: "string", enum: ["article-semantic-proposal/v2"] },
    event_id: { type: "string", pattern: "^[a-f0-9]{16}$" },
    outcome: { type: "string", enum: ["reviewed_links", "reviewed_none"] },
    review_reason: { type: "string", minLength: 10, maxLength: 1000 },
    links: {
      type: "array",
      maxItems: 32,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["concept_id", "role", "reason", "evidence_claim_ids"],
        properties: {
          concept_id: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
          role: { type: "string", enum: articleRelationRoles },
          reason: { type: "string", minLength: 10, maxLength: 1000 },
          evidence_claim_ids: {
            type: "array",
            minItems: 1,
            maxItems: 12,
            items: { type: "string", minLength: 1, maxLength: 160 },
          },
        },
      },
    },
    relation_candidates: {
      type: "array",
      maxItems: 32,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["concept_id", "role", "reason", "evidence_claim_ids"],
        properties: {
          concept_id: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
          role: { type: "string", enum: articleRelationRoles },
          reason: { type: "string", minLength: 10, maxLength: 1000 },
          evidence_claim_ids: {
            type: "array",
            minItems: 1,
            maxItems: 12,
            items: { type: "string", minLength: 1, maxLength: 160 },
          },
        },
      },
    },
    concept_candidates: {
      type: "array",
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "reason", "evidence_claim_ids"],
        properties: {
          label: { type: "string", minLength: 2, maxLength: 160 },
          reason: { type: "string", minLength: 10, maxLength: 1000 },
          evidence_claim_ids: {
            type: "array",
            minItems: 1,
            maxItems: 12,
            items: { type: "string", minLength: 1, maxLength: 160 },
          },
        },
      },
    },
    keyword_candidates: {
      type: "array",
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["keyword", "reason", "evidence_claim_ids"],
        properties: {
          keyword: { type: "string", minLength: 2, maxLength: 100 },
          reason: { type: "string", minLength: 10, maxLength: 500 },
          evidence_claim_ids: {
            type: "array",
            minItems: 1,
            maxItems: 12,
            items: { type: "string", minLength: 1, maxLength: 160 },
          },
        },
      },
    },
  },
}

const validId = (value) => /^[A-Za-z0-9_-]{1,100}$/.test(value || "")
const validEvent = (value) => /^[a-f0-9]{16}$/.test(value || "")
const nonempty = (value) => typeof value === "string" && value.trim().length > 0
const base = (workflowId) => {
  if (!validId(workflowId)) throw Error("Safe semantic review workflow ID required")
  return `runs/${workflowId}/article-semantic-review/`
}
const reference = (root, file) => ({
  path: file,
  sha256: sha256(fs.readFileSync(safePath(root, file))),
})
const checked = (root, ref) => {
  if (!ref || !/^[a-f0-9]{64}$/.test(ref.sha256 || ""))
    throw Error("Exact semantic review artifact reference required")
  const bytes = fs.readFileSync(safePath(root, ref.path))
  if (sha256(bytes) !== ref.sha256) throw Error("Semantic review artifact SHA changed")
  return JSON.parse(bytes)
}
const updateGate = (repo, gateReader) => {
  const gate = gateReader(repo, { executor: "codex" })
  if (gate.regular_execution_allowed !== true)
    throw Error("Semantic article analysis is waiting for the Codex development-completion gate")
  return gate
}

let semanticMetricsImplementation
function semanticMetricsContext({
  root,
  repo,
  policyFile,
  workflowId,
  concepts,
  inventorySha,
  retrievalPolicySha,
}) {
  if (!semanticMetricsImplementation) {
    const files = [
      "article-semantic-review.mjs",
      "semantic-review-metrics.mjs",
      "article-concept-review.mjs",
      "concept-candidate-index.mjs",
      "reasoning-tasks.mjs",
      "ollama.mjs",
      "ontology.mjs",
      "knowledge-links.mjs",
      "contracts.mjs",
      "dates.mjs",
      "run-state.mjs",
      "../explanations.mjs",
    ].map((file) => ({
      path: path.posix.join("scripts/research", file),
      sha256: sha256(fs.readFileSync(new URL(file, import.meta.url))),
    }))
    const bytes =
      JSON.stringify({ schema: "semantic-metrics-implementation/v1", files }, null, 2) + "\n"
    semanticMetricsImplementation = { bytes, sha256: sha256(bytes) }
  }
  const implementation = semanticMetricsImplementation
  const relative = `semantic-review-metrics/implementations/${implementation.sha256}.json`
  const file = safePath(root, relative)
  if (fs.existsSync(file)) {
    if (sha256(fs.readFileSync(file)) !== implementation.sha256)
      throw Error("Semantic metrics implementation manifest changed")
  } else atomicCreate(root, relative, implementation.bytes)
  const provenance = {
    workflow_id: workflowId,
    implementation_sha256: implementation.sha256,
    concept_registry_sha256: concepts.sha256,
    policy_sha256: sha256(
      fs.readFileSync(policyFile || path.join(repo, "data/research-model-policy-codex.json")),
    ),
    inventory_sha256: inventorySha || null,
    retrieval_policy_sha256: retrievalPolicySha || readSemanticRetrievalPolicy(repo).sha256,
  }
  return (stage, status, measurements = {}, details = {}) =>
    recordSemanticObservation({
      root,
      provenance: { ...provenance, ...details },
      stage,
      status,
      ...measurements,
    })
}
function semanticTaskProvenance(row, prepared) {
  return {
    event_id: row.event_id,
    approved_run: row.approved_run,
    task_id: prepared?.task_id || row.task_id,
    request_sha256: prepared?.request_sha256 || row.request_sha256,
    semantic_input_sha256: row.semantic_input_sha256,
    article_public_sha256: row.article_public_sha256,
    approval_files_sha256: row.approval_files_sha256,
  }
}

function reasoningRequestIdentity({ run, role, binding, input }) {
  const body = { schema: "research-reasoning-request/v1", run, role, binding, input },
    serialized = JSON.stringify(body)
  if (Buffer.byteLength(serialized) > 2 * 1048576)
    throw Error("Reasoning input/output exceeds two MiB")
  const request_sha256 = sha256(serialized)
  return { task_id: "reasoning-" + request_sha256, request_sha256 }
}

function loadPublishedSemanticIndex(repo) {
  const file = path.join(repo, "data/article-semantic-review-index.json")
  if (!fs.existsSync(file)) return { file, index: null, reviews: new Map() }
  const index = assertArticleSemanticReviewIndex(JSON.parse(fs.readFileSync(file, "utf8")))
  return { file, index, reviews: new Map(index.reviews.map((review) => [review.event_id, review])) }
}

function publicArticleInventory(vault) {
  const files = walk(path.join(vault, "News")).filter((file) => file.endsWith(".md"))
  const rows = files.flatMap((file) => {
    const bytes = fs.readFileSync(file),
      note = parseNote(bytes.toString("utf8")),
      meta = note.meta
    if (meta.type !== "news" || meta.review_status === "excluded") return []
    if (!validEvent(meta.event_id)) throw Error("Public news article needs its stable event ID")
    const sourceURLs = Array.isArray(meta.sources)
      ? meta.sources
      : meta.source_url
        ? [meta.source_url]
        : []
    const canonicalSourceURLs = [...new Set(sourceURLs.map(canonicalURL))].sort()
    const publicArticle = {
      event_id: meta.event_id,
      title: meta.title,
      published_at: meta.published_at,
      ...(typeof meta.sector === "string" ? { sector: meta.sector } : {}),
      source_urls: canonicalSourceURLs,
      prose: [meta.title, articleSearchText(note.body)].filter(Boolean).join("\n"),
    }
    const fingerprint = sha256(articlePublicFingerprint(publicArticle))
    return [
      {
        ...publicArticle,
        path: path.relative(vault, file).split(path.sep).join("/"),
        article_sha256: sha256(bytes),
        public_sha256: fingerprint,
        review_status: meta.review_status,
        source_urls: canonicalSourceURLs,
      },
    ]
  })
  rows.sort((a, b) => a.event_id.localeCompare(b.event_id, "en"))
  if (new Set(rows.map((row) => row.event_id)).size !== rows.length)
    throw Error("Distinct public semantic review event IDs required")
  return rows
}

function directApprovalInventory(root) {
  const directory = safePath(root, "runs", { materialize: false })
  if (!fs.existsSync(directory)) return new Map()
  const byEvent = new Map()
  for (const entry of fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) throw Error("Symlink in native approval inventory")
    if (!entry.isDirectory() || !/^[A-Za-z0-9_-]{1,160}$/.test(entry.name)) continue
    const relative = `runs/${entry.name}/approved-article.json`
    let article
    try {
      article = readJSON(root, relative)
    } catch (error) {
      if (error.code === "STORAGE_PENDING") continue
      throw error
    }
    if (!validEvent(article?.event_id)) continue
    const rows = byEvent.get(article.event_id) || []
    rows.push({ run: entry.name, article })
    byEvent.set(article.event_id, rows)
  }
  return byEvent
}

function exactPublicMatch(candidate, article) {
  const review = candidate?.article_review
  if (
    candidate?.event_id !== article.event_id ||
    candidate?.title !== article.title ||
    (article.sector !== undefined && candidate?.sector !== article.sector) ||
    review?.review_status !== "verified" ||
    review?.event_id !== article.event_id ||
    review?.published_at !== article.published_at ||
    JSON.stringify([...(candidate.source_urls || [])].map(canonicalURL).sort()) !==
      JSON.stringify(article.source_urls)
  )
    return false
  return approvedArticleMatchesRenderedContent(
    candidate,
    markdownProseText(article.prose),
    // Canonical URL identity was checked above; this rendered helper expects
    // the native approval's original URL spellings.
    new Set(candidate.source_urls),
  )
}

function conceptSnapshot(vault) {
  const concepts = conceptRegistry(vault)
    .map((note) => {
      const relative = note.path + ".md",
        bytes = fs.readFileSync(safePath(vault, relative)),
        definition = sections(note.body, 2)
          .find((section) => section.title === "한 문장 정의")
          ?.body.trim()
      if (!definition || definition === "없음")
        throw Error("Current reviewed concept definition required: " + relative)
      return {
        concept_id: note.meta.concept_id,
        path: relative,
        title: note.meta.title,
        label: note.meta.label,
        aliases: note.meta.aliases || [],
        keywords: note.meta.keywords || [],
        kind: note.meta.map_review.kind,
        reason: note.meta.map_review.reason,
        definition,
        verified_sources: note.meta.verified_sources,
        sha256: sha256(bytes),
      }
    })
    .sort((a, b) => a.concept_id.localeCompare(b.concept_id, "en"))
  if (new Set(concepts.map((concept) => concept.concept_id)).size !== concepts.length)
    throw Error("Distinct reviewed concept identities required")
  return { concepts, sha256: sha256(JSON.stringify(concepts)) }
}

function publicClaimIds(draft) {
  return new Set([
    ...draft.draft.lead.flatMap((row) => row.claim_ids),
    ...draft.draft.explanations.flatMap((section) =>
      section.paragraphs.flatMap((row) => row.claim_ids),
    ),
    ...(draft.draft.analysis?.claim_ids || []),
  ])
}

const candidateRetrievalRoot = "local-ai/semantic-candidate-retrieval/"
const selectionPath = (workflowId, eventId, approvalFilesSha) =>
  `${base(workflowId)}candidate-selections/${eventId}-${approvalFilesSha}.json`
const retrievalIndexPath = (cacheKey) => `${candidateRetrievalRoot}indexes/${cacheKey}.json`
const retrievalEvaluationPath = (indexSha, pilotReviewRefs) =>
  `${candidateRetrievalRoot}evaluations/${indexSha}-${sha256(JSON.stringify(pilotReviewRefs))}.json`
const retrievalQueryPath = (indexSha, querySha) =>
  `${candidateRetrievalRoot}query-vectors/${indexSha}/${querySha}.json`

function optionalAlias(camel, snake, name) {
  if (camel !== undefined && snake !== undefined && JSON.stringify(camel) !== JSON.stringify(snake))
    throw Error("Conflicting semantic review aliases: " + name)
  return camel === undefined ? snake : camel
}

function normalizeEventIds(value) {
  if (value === undefined) return null
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 1000 ||
    value.some((id) => !validEvent(id)) ||
    new Set(value).size !== value.length
  )
    throw Error("event_ids requires 1 to 1000 distinct exact public event IDs")
  return [...value]
}

function normalizeFullRegistryReviewRefs(root, value = []) {
  if (!Array.isArray(value) || value.length > 1000)
    throw Error("full_registry_review_refs requires at most 1000 exact event/artifact references")
  const refs = value.map((ref) => {
    if (
      !ref ||
      Object.keys(ref).sort().join(",") !== "event_id,path,sha256" ||
      !validEvent(ref.event_id)
    )
      throw Error("full_registry_review_refs requires exact event/path/SHA references")
    const [artifact] = normalizePilotReviewRefs(
      root,
      [{ path: ref.path, sha256: ref.sha256 }],
      "full_registry_review_refs",
    )
    return { event_id: ref.event_id, ...artifact }
  })
  if (new Set(refs.map((ref) => `${ref.event_id}:${ref.path}`)).size !== refs.length)
    throw Error("Distinct full_registry_review_refs event/path pairs required")
  return refs.sort(
    (left, right) =>
      left.event_id.localeCompare(right.event_id, "en") ||
      left.path.localeCompare(right.path, "en"),
  )
}

function fullRegistryExpansionContext(root, value = {}) {
  const ids = value.full_registry_event_ids,
    refs = normalizeFullRegistryReviewRefs(root, value.full_registry_review_refs)
  if (
    ids !== undefined &&
    (!Array.isArray(ids) ||
      ids.length > 1000 ||
      ids.some((id) => !validEvent(id)) ||
      new Set(ids).size !== ids.length)
  )
    throw Error("full_registry_event_ids requires at most 1000 distinct exact public event IDs")
  const fullRegistryEventIds = [...(ids || [])].sort()
  if (Array.isArray(value.items)) {
    const publicIds = new Set(value.items.map((row) => row.event_id))
    if (fullRegistryEventIds.some((id) => !publicIds.has(id)))
      throw Error("full_registry_event_ids contains an event outside the frozen public inventory")
  }
  if (Boolean(fullRegistryEventIds.length) !== Boolean(refs.length))
    throw Error("Full registry event IDs and exact review references must be supplied together")
  const declaredIds = new Set(fullRegistryEventIds),
    referencedIds = new Set(refs.map((ref) => ref.event_id))
  if (refs.some((ref) => !declaredIds.has(ref.event_id)))
    throw Error(
      "Full registry review references contain an event outside declared full_registry_event_ids",
    )
  if (fullRegistryEventIds.some((id) => !referencedIds.has(id)))
    throw Error("Full registry review references required for every expanded event")
  for (const ref of refs)
    if (reference(root, ref.path).sha256 !== ref.sha256)
      throw Error("Full registry review artifact SHA changed")
  return { fullRegistryEventIds, fullRegistryReviewRefs: refs }
}

function assertFullRegistrySelectionProvenance(selection, context) {
  const explicit = context.fullRegistryEventIds.includes(selection.event_id)
  if (
    explicit
      ? selection.mode !== "full_registry_fallback" ||
        selection.fallback_reason !== "explicit_full_registry_review" ||
        JSON.stringify(selection.full_registry_review_refs) !==
          JSON.stringify(
            context.fullRegistryReviewRefs.filter((ref) => ref.event_id === selection.event_id),
          )
      : selection.fallback_reason === "explicit_full_registry_review" ||
        Object.hasOwn(selection, "full_registry_review_refs")
  )
    throw Error("Frozen full registry selection differs from its workflow expansion provenance")
  return explicit
}

function normalizePilotReviewRefs(root, value = [], label = "pilot_review_refs") {
  if (!Array.isArray(value) || value.length > 1000)
    throw Error(label + " requires at most 1000 exact artifact references")
  const refs = value.map((ref) => {
    if (
      !ref ||
      Object.keys(ref).sort().join(",") !== "path,sha256" ||
      typeof ref.path !== "string" ||
      !ref.path ||
      /[\\\x00-\x1f\x7f]/.test(ref.path) ||
      ref.path.split("/").some((part) => !part || part === "." || part === "..") ||
      !/^[a-f0-9]{64}$/.test(ref.sha256 || "")
    )
      throw Error(label + " requires exact root-relative path/SHA references")
    safePath(root, ref.path, { materialize: false })
    return { path: ref.path, sha256: ref.sha256 }
  })
  if (new Set(refs.map((ref) => ref.path)).size !== refs.length)
    throw Error(
      label === "pilot_review_refs"
        ? "Distinct pilot source review paths required"
        : "Distinct " + label + " paths required",
    )
  return refs.sort((left, right) => left.path.localeCompare(right.path, "en"))
}

const nativeApprovalFiles = [
  "draft.json",
  "reviewed-claims.json",
  "documents.json",
  "parses.json",
  "editorial-review.json",
  "approved-article.json",
]
const nativeSelectionKeys = [
  "schema",
  "purpose",
  "event_id",
  "article_sha256",
  "article_public_sha256",
  "approved_run",
  "approval_files",
  "approval_files_sha256",
  "candidate_set_sha256",
  "basis",
  "reviewer",
  "reviewed_at",
  "reason",
]
const isHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
const exactObjectKeys = (value, keys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join("\0") === [...keys].sort().join("\0")
const normalizeApprovalSelectionRefs = (root, value = []) =>
  normalizePilotReviewRefs(root, value, "approval_selection_refs")
const normalizeCompletedReviewRefs = (root, value = []) =>
  normalizePilotReviewRefs(root, value, "completed_review_refs")
const approvalSelectionBinding = (row) =>
  row?.approval_selection_sha256 ? { approval_selection_sha256: row.approval_selection_sha256 } : {}

export function nativeApprovalSelectionCandidateSetSha256(candidates) {
  if (
    !Array.isArray(candidates) ||
    !candidates.length ||
    candidates.length > 1000 ||
    candidates.some(
      (row) =>
        !exactObjectKeys(row, ["run", "approval_files_sha256"]) ||
        !/^[A-Za-z0-9_-]{1,160}$/.test(row.run || "") ||
        !isHash(row.approval_files_sha256),
    ) ||
    new Set(candidates.map((row) => row.run)).size !== candidates.length
  )
    throw Error("Distinct exact native approval candidate tuples required")
  return sha256(
    JSON.stringify(
      [...candidates]
        .sort((left, right) => left.run.localeCompare(right.run, "en"))
        .map(({ run, approval_files_sha256 }) => ({ run, approval_files_sha256 })),
    ),
  )
}

function readNativeApprovalFileHashes(root, run) {
  const files = Object.fromEntries(
    nativeApprovalFiles.map((name) => [
      name,
      sha256(fs.readFileSync(safePath(root, `runs/${run}/${name}`))),
    ]),
  )
  const relative = `runs/${run}/article-concept-review.json`,
    file = safePath(root, relative)
  if (fs.existsSync(file)) files["article-concept-review.json"] = sha256(fs.readFileSync(file))
  return files
}

function loadNativeApprovalSelections({ root, vault, articles, approvals, approvalSelectionRefs }) {
  const byEvent = new Map(),
    articlesByEvent = new Map(articles.map((article) => [article.event_id, article]))
  for (const ref of approvalSelectionRefs) {
    let record,
      article,
      pendingReason = "native_input_selection_basis_requires_hydration"
    try {
      record = checked(root, ref)
      if (
        !exactObjectKeys(record, nativeSelectionKeys) ||
        record.schema !== "semantic-native-approval-selection/v1" ||
        record.purpose !== "native_input_selection_only" ||
        !validEvent(record.event_id) ||
        !/^[A-Za-z0-9_-]{1,160}$/.test(record.approved_run || "") ||
        [
          record.article_sha256,
          record.article_public_sha256,
          record.approval_files_sha256,
          record.candidate_set_sha256,
        ].some((value) => !isHash(value)) ||
        !nonempty(record.reviewer) ||
        typeof record.reason !== "string" ||
        record.reason.trim().length < 10 ||
        !exactObjectKeys(record.basis, ["kind", "refs"]) ||
        ![
          "published_native_provenance",
          "validated_native_lineage",
          "explicit_artifact_comparison",
        ].includes(record.basis.kind)
      )
        throw Error("Exact native input selection purpose, identity, reviewer and basis required")
      article = articlesByEvent.get(record.event_id)
      if (
        !article ||
        article.review_status !== "verified" ||
        record.article_sha256 !== article.article_sha256 ||
        record.article_public_sha256 !== article.public_sha256
      )
        throw Error("Native input selection does not match the exact current public article")
      if (byEvent.has(record.event_id))
        throw Error("Only one native input selection per event is allowed")
      const names = [
        ...nativeApprovalFiles,
        ...(Object.hasOwn(record.approval_files || {}, "article-concept-review.json")
          ? ["article-concept-review.json"]
          : []),
      ]
      if (
        !exactObjectKeys(record.approval_files, names) ||
        Object.values(record.approval_files).some((value) => !isHash(value)) ||
        sha256(
          JSON.stringify(
            Object.fromEntries(names.map((name) => [name, record.approval_files[name]])),
          ),
        ) !== record.approval_files_sha256
      )
        throw Error("Exact native approval file map and digest required")
      assertReviewDate(record.reviewed_at, { notBefore: [article.published_at] })
      const basisRefs = normalizePilotReviewRefs(
        root,
        record.basis.refs,
        "approval selection basis refs",
      )
      if (!basisRefs.length) throw Error("Native input selection requires exact basis refs")
      // References bind caller-reviewed evidence bytes. They do not mint a
      // publication/native approval or automatically select a lineage successor.
      for (const basis of basisRefs) {
        const bytes = fs.readFileSync(safePath(root, basis.path))
        if (sha256(bytes) !== basis.sha256) throw Error("Native input selection basis SHA changed")
        if (basis.path.endsWith(".json")) {
          const proof = JSON.parse(bytes)
          if (
            (Object.hasOwn(proof, "event_id") && proof.event_id !== record.event_id) ||
            (Object.hasOwn(proof, "approved_run") && proof.approved_run !== record.approved_run) ||
            (Array.isArray(proof.approved_runs) &&
              !proof.approved_runs.includes(record.approved_run)) ||
            (proof.schema === "research-event-revision/v1" &&
              proof.current?.run !== record.approved_run)
          )
            throw Error("Native input selection basis belongs to another event or run")
        }
      }
      pendingReason = "selected_native_approval_bytes_require_hydration"
      const actualFiles = readNativeApprovalFileHashes(root, record.approved_run)
      if (
        JSON.stringify(actualFiles) !==
        JSON.stringify(Object.fromEntries(names.map((name) => [name, record.approval_files[name]])))
      )
        throw Error("Selected native approval file bytes changed")
      const approval = loadApprovedOntologyInput(root, record.approved_run, { vault })
      assertReviewDate(record.reviewed_at, {
        notBefore: [approval.article.article_review.reviewed_at],
      })
      if (
        !exactPublicMatch(approval.article, article) ||
        JSON.stringify(approval.file_hashes) !== JSON.stringify(actualFiles)
      )
        throw Error(
          "Selected native approval no longer matches the exact public article and file map",
        )
      const candidates = (approvals.get(article.event_id) || []).filter((item) =>
          exactPublicMatch(item.article, article),
        ),
        tuples = []
      pendingReason = "native_input_selection_candidate_set_requires_hydration"
      for (const candidate of candidates) {
        let input
        try {
          input =
            candidate.run === approval.run
              ? approval
              : loadApprovedOntologyInput(root, candidate.run, { vault })
        } catch (error) {
          if (error.code === "STORAGE_PENDING") throw error
          continue
        }
        if (exactPublicMatch(input.article, article))
          tuples.push({
            run: candidate.run,
            approval_files_sha256: sha256(JSON.stringify(input.file_hashes)),
          })
      }
      if (
        !tuples.some((item) => item.run === record.approved_run) ||
        nativeApprovalSelectionCandidateSetSha256(tuples) !== record.candidate_set_sha256
      )
        throw Error("Native input selection candidate set changed")
      byEvent.set(record.event_id, { ref, record, approval })
    } catch (error) {
      if (error.code === "STORAGE_PENDING" && record && article) {
        if (byEvent.has(record.event_id))
          throw Error("Only one native input selection per event is allowed")
        byEvent.set(record.event_id, { ref, record, pending: error.storage_request, pendingReason })
        continue
      }
      const contextual = Error(`Native input selection ${ref.path}: ${error.message}`, {
        cause: error,
      })
      if (error.code === "STORAGE_PENDING") {
        contextual.code = error.code
        contextual.storage_request = error.storage_request
      }
      throw contextual
    }
  }
  return byEvent
}

function pilotSemanticReceipt(root, vault, review, article, approval, concepts) {
  const workflowId = review.semantic_review.workflow_id,
    saved = loadInventory(root, workflowId),
    row = saved?.inventory.items.find((item) => item.event_id === article.event_id),
    ref = normalizePilotReviewRefs(root, [review.semantic_review.receipt])[0],
    existing = checked(root, ref)
  if (
    !row ||
    row.status !== "ready" ||
    ref.path !== receiptPath(workflowId, row) ||
    row.approved_run !== approval.run ||
    row.article_public_sha256 !== article.public_sha256 ||
    row.approval_files_sha256 !== sha256(JSON.stringify(approval.file_hashes)) ||
    row.concept_registry_sha256 !== concepts.sha256
  )
    throw Error("Pilot source review requires its exact completed native semantic receipt")
  const prepared = preparedFor(root, workflowId, row),
    selection = readCandidateSelection(
      root,
      workflowId,
      article,
      row.approval_files_sha256,
      concepts,
    ),
    fullInput = buildArticleSemanticReasoningInput(approval, article, concepts.concepts, selection)
  assertFullRegistrySelectionProvenance(
    selection,
    fullRegistryExpansionContext(root, saved.inventory),
  )
  if (
    !prepared ||
    selection.mode !== "full_registry_fallback" ||
    JSON.stringify([...selection.candidate_ids].sort()) !==
      JSON.stringify(concepts.concepts.map((concept) => concept.concept_id).sort()) ||
    sha256(JSON.stringify(fullInput)) !== row.semantic_input_sha256
  )
    throw Error(
      "Pilot source review requires a completed gpt-6-luna review of the full current registry",
    )
  // The exact receipt must already exist. semanticReceipt only verifies that
  // immutable artifact here; this reader must never turn a raw result into gold.
  const validated = semanticReceipt(root, workflowId, row, article, concepts, prepared, vault)
  if (!validated || JSON.stringify(existing) !== JSON.stringify(validated))
    throw Error("Pilot semantic receipt differs from its completed gpt-6-luna request/result")
  return { receipt: validated, row, receiptRef: ref }
}

function loadPilotSourceReviews({ root, vault, articles, concepts, pilotReviewRefs }) {
  const byEvent = new Map(),
    articlesByEvent = new Map(articles.map((article) => [article.event_id, article]))
  for (const ref of pilotReviewRefs) {
    try {
      const review = checked(root, ref)
      assertSchema(review, semanticRetrievalReviewSchema, "$semantic_retrieval_review")
      const article = articlesByEvent.get(review.event_id)
      if (!article || article.review_status !== "verified" || !nonempty(article.sector))
        throw Error("Pilot source review needs an existing verified public article and stratum")
      const approval = loadApprovedOntologyInput(root, review.approved_run, { vault })
      if (
        !exactPublicMatch(approval.article, article) ||
        approval.article.sector !== article.sector
      )
        throw Error("Pilot source review native approval no longer matches the public article")
      const source = pilotSemanticReceipt(root, vault, review, article, approval, concepts)
      assertSemanticRetrievalSourceReview(review, {
        article,
        approvalFilesSha256: sha256(JSON.stringify(approval.file_hashes)),
        concepts,
        claims: verifiedPublicSemanticClaims(approval),
        receipt: { ...source.receipt, approved_run: source.row.approved_run },
      })
      if (byEvent.has(review.event_id))
        throw Error("Distinct pilot source review event IDs required")
      byEvent.set(review.event_id, { ref, review, source })
    } catch (error) {
      const contextual = Error(`Pilot source review ${ref.path}: ${error.message}`, {
        cause: error,
      })
      if (error.code === "STORAGE_PENDING") {
        contextual.code = error.code
        contextual.storage_request = error.storage_request
      }
      throw contextual
    }
  }
  return byEvent
}

function readSemanticRetrievalPolicy(repo) {
  const file = path.join(repo, "data/research-semantic-retrieval-policy.json"),
    bytes = fs.readFileSync(file),
    policy = JSON.parse(bytes.toString("utf8"))
  if (
    policy.schema !== "semantic-candidate-retrieval-policy/v1" ||
    ![true, false].includes(policy.enabled) ||
    policy.purpose !== "candidate_retrieval_only" ||
    policy.provider !== "local_ollama_embedding" ||
    policy.model !== DEFAULT_CONCEPT_EMBEDDING_MODEL ||
    policy.top_k !== DEFAULT_CONCEPT_CANDIDATE_LIMIT ||
    policy.rrf_k !== 60 ||
    policy.minimum_top_cosine !== 0.15 ||
    policy.minimum_top_lexical_score !== 0.75 ||
    policy.minimum_median_concept_payload_reduction !==
      DEFAULT_MINIMUM_MEDIAN_CONCEPT_PAYLOAD_REDUCTION ||
    policy.uncertain_retrieval !== "full_registry_fallback" ||
    policy.keyword_candidates !== "private_unreviewed_metadata" ||
    policy.pilot?.minimum_articles !== 24 ||
    policy.pilot?.minimum_recall_at_12 !== 0.95 ||
    policy.pilot?.minimum_strata !== 4 ||
    policy.pilot?.minimum_articles_per_stratum !== 2 ||
    policy.pilot?.minimum_challenge_articles !== 8 ||
    JSON.stringify(policy.pilot?.required_challenge_kinds) !==
      JSON.stringify(["ambiguous", "homonym", "reviewed_none"])
  )
    throw Error("Invalid semantic candidate retrieval policy")
  return { policy, sha256: sha256(bytes) }
}

function assertCandidateSelection(
  selection,
  { workflowId, article, approvalFilesSha, concepts, retrievalPolicy },
) {
  const { selection_sha256: digest, ...body } = selection || {},
    conceptIds = new Set(concepts.concepts.map((concept) => concept.concept_id))
  if (
    selection?.schema !== "semantic-article-candidate-selection/v1" ||
    selection.workflow_id !== workflowId ||
    selection.event_id !== article.event_id ||
    selection.article_public_sha256 !== article.public_sha256 ||
    selection.approval_files_sha256 !== approvalFilesSha ||
    selection.concept_registry_sha256 !== concepts.sha256 ||
    selection.total_concepts !== concepts.concepts.length ||
    !/^[a-f0-9]{64}$/.test(selection.query_sha256 || "") ||
    !/^[a-f0-9]{64}$/.test(selection.retrieval_policy_sha256 || "") ||
    !Array.isArray(selection.candidate_ids) ||
    !selection.candidate_ids.length ||
    new Set(selection.candidate_ids).size !== selection.candidate_ids.length ||
    selection.candidate_ids.some((id) => !conceptIds.has(id)) ||
    !["hybrid_top_k", "full_registry_fallback"].includes(selection.mode) ||
    !/^[a-f0-9]{64}$/.test(digest || "") ||
    digest !== sha256(JSON.stringify(body))
  )
    throw Error("Frozen semantic candidate selection identity or checksum changed")
  if (
    retrievalPolicy &&
    (selection.retrieval_policy_sha256 !== retrievalPolicy.sha256 ||
      selection.retrieval_version !== CONCEPT_RETRIEVAL_VERSION ||
      selection.embedding_model !== retrievalPolicy.policy.model)
  )
    throw Error("Frozen semantic candidate retrieval policy or version changed")
  if (
    selection.mode === "full_registry_fallback" &&
    JSON.stringify([...selection.candidate_ids].sort()) !== JSON.stringify([...conceptIds].sort())
  )
    throw Error("Full-registry fallback must retain every current reviewed concept")
  if (
    selection.mode === "hybrid_top_k" &&
    (!/^[a-f0-9]{64}$/.test(selection.index_sha256 || "") ||
      !/^[a-f0-9]{64}$/.test(selection.evaluation_sha256 || "") ||
      !selection.embedding_digest)
  )
    throw Error("Shortlisted semantic review requires a validated retrieval index")
  return selection
}

function readCandidateSelection(
  root,
  workflowId,
  article,
  approvalFilesSha,
  concepts,
  retrievalPolicy,
) {
  const relative = selectionPath(workflowId, article.event_id, approvalFilesSha),
    selection = readJSON(root, relative)
  if (!selection) throw Error("Frozen semantic candidate selection must be prepared first")
  return assertCandidateSelection(selection, {
    workflowId,
    article,
    approvalFilesSha,
    concepts,
    retrievalPolicy,
  })
}

function makeCandidateSelection({
  workflowId,
  article,
  approvalFilesSha,
  concepts,
  querySha,
  retrievalPolicySha,
  ranked = null,
  failure = null,
  explicitFullRegistry = false,
  fullRegistryReviewRefs = [],
}) {
  const reviewRefs = fullRegistryReviewRefs.filter((ref) => ref.event_id === article.event_id)
  if (explicitFullRegistry) {
    if (!reviewRefs.length)
      throw Error("Explicit full registry selection requires exact review references")
    ranked = null
    failure = { reason: "explicit_full_registry_review" }
  }
  const body = {
    schema: "semantic-article-candidate-selection/v1",
    workflow_id: workflowId,
    event_id: article.event_id,
    article_public_sha256: article.public_sha256,
    approval_files_sha256: approvalFilesSha,
    concept_registry_sha256: concepts.sha256,
    query_sha256: querySha,
    retrieval_policy_sha256: retrievalPolicySha,
    retrieval_version: ranked?.retrieval_version || CONCEPT_RETRIEVAL_VERSION,
    index_sha256: ranked?.index_sha256 || null,
    embedding_model: ranked?.embedding_model || DEFAULT_CONCEPT_EMBEDDING_MODEL,
    embedding_digest: ranked?.embedding_digest || null,
    mode: ranked?.mode || "full_registry_fallback",
    fallback_reason:
      failure?.reason ||
      ranked?.fallback_reason ||
      (ranked?.mode === "hybrid_top_k" ? null : "embedding_retrieval_unavailable"),
    failure_stage: failure?.stage || null,
    failure_message: failure?.message?.slice(0, 500) || null,
    total_concepts: concepts.concepts.length,
    exact_match_ids: ranked?.exact_match_ids || [],
    ranked_ids: ranked?.ranked_ids || [],
    shortlisted_ids: ranked?.shortlisted_ids || [],
    candidate_ids: ranked?.candidate_ids || concepts.concepts.map((concept) => concept.concept_id),
    lexical_hit_count: ranked?.lexical_hit_count || 0,
    top_cosine: ranked?.top_cosine ?? null,
    top_lexical_score: ranked?.top_lexical_score || 0,
    rrf_k: ranked?.rrf_k || 60,
    limit: ranked?.limit || DEFAULT_CONCEPT_CANDIDATE_LIMIT,
    evaluation_sha256: ranked?.evaluation_sha256 || null,
    ...(explicitFullRegistry ? { full_registry_review_refs: reviewRefs } : {}),
  }
  return { ...body, selection_sha256: sha256(JSON.stringify(body)) }
}

function cachedCandidateIndex(root, concepts, policy, modelDigest) {
  const key = sha256(
      JSON.stringify({
        schema: CONCEPT_CANDIDATE_INDEX_SCHEMA,
        retrieval_version: CONCEPT_RETRIEVAL_VERSION,
        concept_registry_sha256: concepts.sha256,
        embedding_model: policy.policy.model,
        embedding_digest: modelDigest,
        retrieval_policy_sha256: policy.sha256,
      }),
    ),
    relative = retrievalIndexPath(key),
    prior = readJSON(root, relative)
  if (!prior) return { relative, key, index: null }
  return {
    relative,
    key,
    index: assertConceptCandidateIndex(prior, {
      concept_registry_sha256: concepts.sha256,
      embedding_model: policy.policy.model,
      embedding_digest: modelDigest,
      retrieval_policy_sha256: policy.sha256,
    }),
  }
}

function semanticQueryText(approval, article) {
  const claims = verifiedPublicSemanticClaims(approval)
  return [article.title, ...claims.map((claim) => claim.statement)].join("\n")
}

async function embedInBatches(client, metadata, inputs, expectedDimensions) {
  const vectors = []
  for (let offset = 0; offset < inputs.length; offset += 64) {
    const batch = inputs.slice(offset, offset + 64)
    const page = await client.embed({
      model: metadata.model,
      metadata,
      inputs: batch,
      expected_digest: metadata.digest,
      ...(expectedDimensions === undefined ? {} : { expected_dimensions: expectedDimensions }),
    })
    if (
      page.digest !== metadata.digest ||
      !Number.isInteger(page.dimensions) ||
      page.dimensions < 2 ||
      (expectedDimensions !== undefined && page.dimensions !== expectedDimensions) ||
      !Array.isArray(page.vectors) ||
      page.vectors.length !== batch.length ||
      page.vectors.some(
        (vector) =>
          !Array.isArray(vector) ||
          vector.length !== page.dimensions ||
          vector.some((value) => !Number.isFinite(value)),
      )
    )
      throw Error("Embedding runtime metadata changed during candidate index construction")
    expectedDimensions = page.dimensions
    vectors.push(...page.vectors)
  }
  return vectors
}

function reviewedPilotGold(descriptor, supplementaryReviews = new Map()) {
  const supplementary = supplementaryReviews.get(descriptor.article.event_id)
  if (supplementary) {
    const { review, ref } = supplementary
    if (review.approved_run !== descriptor.approval.run) return null
    return {
      run: descriptor.approval.run,
      event_id: descriptor.article.event_id,
      stratum: descriptor.article.sector,
      article_public_sha256: descriptor.article.public_sha256,
      approval_files_sha256: descriptor.approvalFilesSha,
      concept_review_sha256: ref.sha256,
      query_sha256: descriptor.querySha,
      relevant_concept_ids: review.links.map((link) => link.concept_id).sort(),
      gold_source: "semantic_retrieval_review_v1",
      case_kind: review.case_kind,
      challenge_kind: review.challenge_kind,
    }
  }
  const review = descriptor.approval.concept_review,
    ids = review?.links?.map((link) => link.concept_id) || [],
    articleIds = descriptor.approval.article.article_review?.concept_ids || []
  if (
    review?.schema !== "reviewed-article-concepts/v2" ||
    review.outcome !== "reviewed_links" ||
    !Array.isArray(review.links) ||
    !ids.length ||
    new Set(ids).size !== ids.length ||
    JSON.stringify([...ids].sort()) !== JSON.stringify([...articleIds].sort()) ||
    descriptor.approval.article.sector !== descriptor.article.sector ||
    !validId(descriptor.approval.run) ||
    !nonempty(descriptor.article.sector)
  )
    return null
  return {
    run: descriptor.approval.run,
    event_id: descriptor.article.event_id,
    stratum: descriptor.article.sector,
    article_public_sha256: descriptor.article.public_sha256,
    approval_files_sha256: descriptor.approvalFilesSha,
    concept_review_sha256: sha256(JSON.stringify(review)),
    query_sha256: descriptor.querySha,
    relevant_concept_ids: [...ids].sort(),
    gold_source: "native_reviewed_article_concepts_v2",
    case_kind: "pilot",
    challenge_kind: null,
  }
}

function selectStratifiedPilot(descriptors, supplementaryReviews) {
  const byEvent = new Map()
  for (const descriptor of descriptors) {
    const gold = reviewedPilotGold(descriptor, supplementaryReviews)
    if (!gold) continue
    const rows = byEvent.get(gold.event_id) || []
    rows.push({ descriptor, gold })
    byEvent.set(gold.event_id, rows)
  }
  const byStratum = new Map(),
    challenges = []
  for (const rows of byEvent.values()) {
    if (rows.length !== 1) continue
    const item = rows[0]
    if (item.gold.case_kind === "challenge") {
      challenges.push(item)
      continue
    }
    const group = byStratum.get(item.gold.stratum) || []
    group.push(item)
    byStratum.set(item.gold.stratum, group)
  }
  const strata = [...byStratum]
    .filter(([, rows]) => rows.length >= 2)
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([name, rows]) => [
      name,
      rows.sort((a, b) => a.gold.event_id.localeCompare(b.gold.event_id, "en")),
    ])
  const eligibleArticleCount = [...byStratum.values()].reduce((sum, rows) => sum + rows.length, 0),
    byChallenge = ["ambiguous", "homonym", "reviewed_none"].map((kind) =>
      challenges
        .filter((item) => item.gold.challenge_kind === kind)
        .sort((left, right) => left.gold.event_id.localeCompare(right.gold.event_id, "en")),
    ),
    selectedChallenges = []
  if (byChallenge.every((rows) => rows.length)) {
    for (let depth = 0; selectedChallenges.length < 8; depth++) {
      let added = false
      for (const rows of byChallenge) {
        if (!rows[depth]) continue
        selectedChallenges.push(rows[depth])
        added = true
        if (selectedChallenges.length === 8) break
      }
      if (!added) break
    }
  }
  const challengeSummary = {
    challenge_cases: selectedChallenges.length >= 8 ? selectedChallenges : [],
    eligible_challenge_count: challenges.length,
    eligible_challenge_kinds: byChallenge.filter((rows) => rows.length).length,
  }
  if (strata.length < 4)
    return {
      cases: [],
      eligible_article_count: eligibleArticleCount,
      eligible_strata: strata.length,
      ...challengeSummary,
    }
  const selected = []
  for (let depth = 0; selected.length < 24; depth++) {
    let added = false
    for (const [, rows] of strata) {
      if (rows[depth]) {
        selected.push(rows[depth])
        added = true
        if (selected.length === 24) break
      }
    }
    if (!added) break
  }
  const counts = new Map()
  for (const item of selected)
    counts.set(item.gold.stratum, (counts.get(item.gold.stratum) || 0) + 1)
  return {
    cases:
      selected.length >= 24 && [...counts.values()].filter((count) => count >= 2).length >= 4
        ? selected
        : [],
    eligible_article_count: eligibleArticleCount,
    eligible_strata: strata.length,
    ...challengeSummary,
  }
}

function validateEvaluationSources({
  root,
  vault,
  articles,
  approvals,
  concepts,
  index,
  retrievalPolicy,
  evaluation,
  supplementaryReviews,
}) {
  const articlesByEvent = new Map(articles.map((article) => [article.event_id, article])),
    conceptById = new Map(concepts.concepts.map((concept) => [concept.concept_id, concept])),
    fullConceptPayloadBytes = Buffer.byteLength(JSON.stringify(concepts.concepts))
  for (const row of [...evaluation.cases, ...(evaluation.challenge_cases || [])]) {
    const article = articlesByEvent.get(row.event_id),
      candidate = approvals.get(row.event_id)?.find((item) => item.run === row.run)
    if (!article || !candidate) throw Error("Semantic retrieval pilot source approval is missing")
    const approval = loadApprovedOntologyInput(root, row.run, { vault })
    if (!exactPublicMatch(approval.article, article))
      throw Error("Semantic retrieval pilot no longer matches its public article")
    const descriptor = {
        article,
        approval,
        approvalFilesSha: sha256(JSON.stringify(approval.file_hashes)),
        query: semanticQueryText(approval, article),
      },
      gold = reviewedPilotGold(
        { ...descriptor, querySha: sha256(descriptor.query) },
        supplementaryReviews,
      )
    const cachedVector = readJSON(root, retrievalQueryPath(index.index_sha256, row.query_sha256)),
      { vector_sha256: vectorSha, ...vectorBody } = cachedVector || {},
      queryVector = cachedVector?.vector
    if (
      !gold ||
      gold.stratum !== row.stratum ||
      gold.article_public_sha256 !== row.article_public_sha256 ||
      gold.approval_files_sha256 !== row.approval_files_sha256 ||
      gold.concept_review_sha256 !== row.concept_review_sha256 ||
      gold.query_sha256 !== row.query_sha256 ||
      gold.gold_source !== (row.gold_source || "native_reviewed_article_concepts_v2") ||
      gold.case_kind !== (row.case_kind || "pilot") ||
      gold.challenge_kind !== (row.challenge_kind ?? null) ||
      JSON.stringify([...gold.relevant_concept_ids].sort()) !==
        JSON.stringify(row.relevant_concept_ids) ||
      conceptCandidateGoldSha256({ ...row, relevant_concept_ids: gold.relevant_concept_ids }) !==
        row.gold_sha256 ||
      cachedVector?.schema !== "semantic-candidate-query-vector/v1" ||
      cachedVector.index_sha256 !== index.index_sha256 ||
      cachedVector.query_sha256 !== row.query_sha256 ||
      cachedVector.embedding_digest !== index.embedding_digest ||
      vectorSha !== sha256(JSON.stringify(queryVector)) ||
      (row.query_embedding_sha256 !== undefined && row.query_embedding_sha256 !== vectorSha) ||
      !Array.isArray(queryVector) ||
      queryVector.length !== index.embedding_dimensions ||
      vectorBody.schema !== cachedVector.schema
    )
      throw Error("Semantic retrieval pilot source facts or reviewed links changed")
    const ranked = rankConceptCandidates({
        query: descriptor.query,
        query_embedding: queryVector,
        index,
        limit: retrievalPolicy.policy.top_k,
        rrf_k: retrievalPolicy.policy.rrf_k,
        minimum_top_cosine: retrievalPolicy.policy.minimum_top_cosine,
        minimum_top_lexical_score: retrievalPolicy.policy.minimum_top_lexical_score,
        allow_shortlist: true,
      }),
      signalAvailable =
        ranked.exact_match_ids.length > 0 ||
        ranked.top_cosine >= retrievalPolicy.policy.minimum_top_cosine ||
        ranked.top_lexical_score >= retrievalPolicy.policy.minimum_top_lexical_score,
      expectedPayloadIds = [
        ...new Set(
          signalAvailable
            ? ranked.shortlisted_ids
            : concepts.concepts.map((concept) => concept.concept_id),
        ),
      ].sort(),
      expectedTop12 = ranked.ranked_ids.slice(0, DEFAULT_CONCEPT_CANDIDATE_LIMIT).sort(),
      candidateConcepts = row.payload_candidate_concept_ids.map((id) => conceptById.get(id))
    if (
      JSON.stringify(row.candidate_concept_ids) !== JSON.stringify(expectedTop12) ||
      JSON.stringify(row.payload_candidate_concept_ids) !== JSON.stringify(expectedPayloadIds) ||
      row.full_concept_payload_bytes !== fullConceptPayloadBytes ||
      row.candidate_concept_payload_bytes !== Buffer.byteLength(JSON.stringify(candidateConcepts))
    )
      throw Error("Semantic retrieval pilot candidate or payload measurement changed")
  }
}

function validateFrozenCandidateRetrieval(selection, approval, article, context) {
  const { root, concepts, retrievalPolicy, pilotReviewRefs, cache } = context,
    query = semanticQueryText(approval, article)
  if (selection.query_sha256 !== sha256(query))
    throw Error("Frozen semantic candidate query differs from the verified public article")
  if (assertFullRegistrySelectionProvenance(selection, context)) {
    const expected = makeCandidateSelection({
      workflowId: selection.workflow_id,
      article,
      approvalFilesSha: selection.approval_files_sha256,
      concepts,
      querySha: sha256(query),
      retrievalPolicySha: retrievalPolicy.sha256,
      explicitFullRegistry: true,
      fullRegistryReviewRefs: context.fullRegistryReviewRefs,
    })
    if (expected.selection_sha256 !== selection.selection_sha256)
      throw Error("Frozen explicit full registry selection identity changed")
    return
  }
  if (selection.mode !== "hybrid_top_k") return
  const evaluationKey = JSON.stringify([selection.index_sha256, selection.evaluation_sha256])
  let artifacts = cache.get(evaluationKey)
  if (!artifacts) {
    const index = cachedCandidateIndex(
        root,
        concepts,
        retrievalPolicy,
        selection.embedding_digest,
      ).index,
      evaluation = readJSON(root, retrievalEvaluationPath(selection.index_sha256, pilotReviewRefs))
    if (
      !index ||
      index.index_sha256 !== selection.index_sha256 ||
      !evaluation ||
      evaluation.evaluation_sha256 !== selection.evaluation_sha256
    )
      throw Error("Frozen semantic shortlist requires its exact retrieval index and evaluation")
    assertConceptCandidateEvaluation(evaluation, index)
    validateEvaluationSources({ ...context, index, evaluation })
    artifacts = { index, evaluation }
    cache.set(evaluationKey, artifacts)
  }
  const { index, evaluation } = artifacts,
    cached = readJSON(root, retrievalQueryPath(index.index_sha256, selection.query_sha256))
  if (
    cached?.schema !== "semantic-candidate-query-vector/v1" ||
    cached.index_sha256 !== index.index_sha256 ||
    cached.query_sha256 !== selection.query_sha256 ||
    cached.embedding_digest !== index.embedding_digest ||
    !Array.isArray(cached.vector) ||
    cached.vector.length !== index.embedding_dimensions ||
    cached.vector_sha256 !== sha256(JSON.stringify(cached.vector))
  )
    throw Error("Frozen semantic shortlist query vector identity or checksum changed")
  const ranked = rankConceptCandidates({
      query,
      query_embedding: cached.vector,
      index,
      limit: retrievalPolicy.policy.top_k,
      rrf_k: retrievalPolicy.policy.rrf_k,
      minimum_top_cosine: retrievalPolicy.policy.minimum_top_cosine,
      minimum_top_lexical_score: retrievalPolicy.policy.minimum_top_lexical_score,
      evaluation,
      allow_shortlist: true,
    }),
    expected = makeCandidateSelection({
      workflowId: selection.workflow_id,
      article,
      approvalFilesSha: selection.approval_files_sha256,
      concepts,
      querySha: selection.query_sha256,
      retrievalPolicySha: retrievalPolicy.sha256,
      ranked,
    })
  if (expected.selection_sha256 !== selection.selection_sha256)
    throw Error("Frozen semantic shortlist differs from the source-validated retrieval artifacts")
}

async function ensureCandidateSelections({
  root,
  vault,
  repo,
  workflowId,
  concepts,
  embeddingClient,
  pilotReviewRefs = [],
  approvalSelectionRefs = [],
  fullRegistryEventIds = [],
  fullRegistryReviewRefs = [],
  policyFile,
}) {
  const articles = publicArticleInventory(vault),
    approvals = directApprovalInventory(root),
    retrievalPolicy = readSemanticRetrievalPolicy(repo),
    supplementaryReviews = loadPilotSourceReviews({
      root,
      vault,
      articles,
      concepts,
      pilotReviewRefs,
    }),
    nativeChoices = loadNativeApprovalSelections({
      root,
      vault,
      articles,
      approvals,
      approvalSelectionRefs,
    }),
    descriptors = []
  for (const article of articles) {
    if (article.review_status !== "verified") continue
    const choice = nativeChoices.get(article.event_id)
    if (choice?.pending) continue
    for (const candidate of approvals.get(article.event_id) || []) {
      if (choice && candidate.run !== choice.record.approved_run) continue
      if (!exactPublicMatch(candidate.article, article)) continue
      let approval
      try {
        approval = loadApprovedOntologyInput(root, candidate.run, { vault })
      } catch {
        // buildInventory retains this article's exact storage wait or integrity
        // diagnostic. One unavailable article must not discard all other work.
        continue
      }
      if (!exactPublicMatch(approval.article, article)) continue
      const approvalFilesSha = sha256(JSON.stringify(approval.file_hashes))
      if (choice && approvalFilesSha !== choice.record.approval_files_sha256)
        throw Error("Selected native approval changed during candidate preparation")
      const relative = selectionPath(workflowId, article.event_id, approvalFilesSha),
        existing = readJSON(root, relative)
      if (existing) {
        assertCandidateSelection(existing, {
          workflowId,
          article,
          approvalFilesSha,
          concepts,
        })
        assertFullRegistrySelectionProvenance(existing, {
          fullRegistryEventIds,
          fullRegistryReviewRefs,
        })
        continue
      }
      const query = semanticQueryText(approval, article)
      descriptors.push({
        article,
        approval,
        approvalFilesSha,
        relative,
        query,
        querySha: sha256(query),
      })
    }
  }
  if (!descriptors.length)
    return {
      prepared: 0,
      reused: true,
      retrieval_policy_sha256: retrievalPolicy.sha256,
    }

  const observe = semanticMetricsContext({
      root,
      repo,
      policyFile,
      workflowId,
      concepts,
      retrievalPolicySha: retrievalPolicy.sha256,
    }),
    operationId = crypto.randomUUID(),
    client = embeddingClient || new Ollama({ url: localOllamaURL() })
  if (retrievalPolicy.policy.enabled !== true) {
    for (const descriptor of descriptors) {
      const selection = makeCandidateSelection({
        workflowId,
        article: descriptor.article,
        approvalFilesSha: descriptor.approvalFilesSha,
        concepts,
        querySha: descriptor.querySha,
        retrievalPolicySha: retrievalPolicy.sha256,
        failure: { reason: "embedding_retrieval_disabled" },
        explicitFullRegistry: fullRegistryEventIds.includes(descriptor.article.event_id),
        fullRegistryReviewRefs,
      })
      atomicCreate(root, descriptor.relative, selection)
    }
    return { prepared: descriptors.length, mode: "full_registry_fallback" }
  }

  const stopIndex = startSemanticStageTimer()
  let metadata
  try {
    metadata = await client.metadata(retrievalPolicy.policy.model)
    if (
      metadata.model !== retrievalPolicy.policy.model ||
      !metadata.capabilities?.includes("embedding") ||
      !/^[a-f0-9]{64}$/.test(metadata.digest || "")
    )
      throw Error("Pinned Qwen embedding model metadata/capability required")
  } catch (error) {
    observe("concept_index", "failure", stopIndex(), { operation_id: operationId })
    for (const descriptor of descriptors) {
      const selection = makeCandidateSelection({
        workflowId,
        article: descriptor.article,
        approvalFilesSha: descriptor.approvalFilesSha,
        concepts,
        querySha: descriptor.querySha,
        retrievalPolicySha: retrievalPolicy.sha256,
        failure: {
          stage: "embedding_metadata",
          reason: "embedding_model_unavailable",
          message: error.message,
        },
        explicitFullRegistry: fullRegistryEventIds.includes(descriptor.article.event_id),
        fullRegistryReviewRefs,
      })
      atomicCreate(root, descriptor.relative, selection)
    }
    return {
      prepared: descriptors.length,
      mode: "full_registry_fallback",
      failure_stage: "embedding_metadata",
      failure: error.message,
    }
  }

  const indexCache = cachedCandidateIndex(root, concepts, retrievalPolicy, metadata.digest)
  let index = indexCache.index
  if (!index) {
    const profiles = concepts.concepts.map(conceptCandidateProfile)
    let vectors
    try {
      vectors = await embedInBatches(client, metadata, profiles)
    } catch (error) {
      observe(
        "concept_index",
        "failure",
        {
          ...stopIndex(),
          temperature: "cold",
          cache: { kind: "concept_index", hit: false },
          input_bytes: Buffer.byteLength(JSON.stringify(profiles)),
        },
        { operation_id: operationId, embedding_digest: metadata.digest },
      )
      for (const descriptor of descriptors) {
        const selection = makeCandidateSelection({
          workflowId,
          article: descriptor.article,
          approvalFilesSha: descriptor.approvalFilesSha,
          concepts,
          querySha: descriptor.querySha,
          retrievalPolicySha: retrievalPolicy.sha256,
          failure: {
            stage: "concept_index_embedding",
            reason: "concept_index_embedding_failed",
            message: error.message,
          },
          explicitFullRegistry: fullRegistryEventIds.includes(descriptor.article.event_id),
          fullRegistryReviewRefs,
        })
        atomicCreate(root, descriptor.relative, selection)
      }
      return {
        prepared: descriptors.length,
        mode: "full_registry_fallback",
        failure_stage: "concept_index_embedding",
        failure: error.message,
      }
    }
    index = buildConceptCandidateIndex(concepts.concepts, {
      concept_registry_sha256: concepts.sha256,
      embedding_model: metadata.model,
      embedding_digest: metadata.digest,
      retrieval_policy_sha256: retrievalPolicy.sha256,
      embeddings: vectors,
    })
    if (readJSON(root, indexCache.relative))
      throw Error("Semantic concept retrieval index appeared during immutable creation")
    atomicCreate(root, indexCache.relative, index)
  }
  observe(
    "concept_index",
    "completed",
    {
      ...stopIndex(),
      temperature: indexCache.index ? "warm" : "cold",
      cache: { kind: "concept_index", hit: Boolean(indexCache.index) },
      input_bytes: indexCache.index
        ? 0
        : Buffer.byteLength(JSON.stringify(concepts.concepts.map(conceptCandidateProfile))),
    },
    {
      operation_id: operationId,
      embedding_digest: metadata.digest,
      index_sha256: index.index_sha256,
    },
  )
  const evaluationRelative = retrievalEvaluationPath(index.index_sha256, pilotReviewRefs)
  let evaluation = readJSON(root, evaluationRelative)
  if (evaluation) {
    assertConceptCandidateEvaluation(evaluation, index)
    validateEvaluationSources({
      root,
      vault,
      articles,
      approvals,
      concepts,
      index,
      retrievalPolicy,
      evaluation,
      supplementaryReviews,
    })
  }

  const stopQueryCache = startSemanticStageTimer(),
    queryVectors = new Map(),
    missingBySha = new Map()
  for (const descriptor of descriptors) {
    const cacheRelative = retrievalQueryPath(index.index_sha256, descriptor.querySha),
      cached = readJSON(root, cacheRelative)
    if (!cached) {
      if (!missingBySha.has(descriptor.querySha)) missingBySha.set(descriptor.querySha, descriptor)
      continue
    }
    const { vector_sha256: vectorSha, ...vectorBody } = cached
    if (
      cached.schema !== "semantic-candidate-query-vector/v1" ||
      cached.index_sha256 !== index.index_sha256 ||
      cached.query_sha256 !== descriptor.querySha ||
      cached.embedding_digest !== metadata.digest ||
      vectorSha !== sha256(JSON.stringify(cached.vector)) ||
      !Array.isArray(cached.vector) ||
      cached.vector.length !== index.embedding_dimensions ||
      vectorBody.schema !== cached.schema
    )
      throw Error("Cached semantic query vector identity/checksum changed")
    queryVectors.set(descriptor.querySha, cached.vector)
  }
  if (queryVectors.size) {
    observe(
      "query_embedding",
      "completed",
      {
        ...stopQueryCache(),
        temperature: "warm",
        cache: { kind: "query_embedding", hit: true },
        input_bytes: 0,
      },
      {
        operation_id: operationId + "-query-cache",
        embedding_digest: metadata.digest,
        index_sha256: index.index_sha256,
      },
    )
  }
  const missing = [...missingBySha.values()]
  for (let offset = 0; offset < missing.length; offset += 64) {
    const page = missing.slice(offset, offset + 64),
      queryInputs = page.map((descriptor) => descriptor.query),
      stopQuery = startSemanticStageTimer(),
      queryProvenance = {
        operation_id: operationId + "-query-" + offset,
        embedding_digest: metadata.digest,
        index_sha256: index.index_sha256,
      },
      queryMeasurement = {
        temperature: "cold",
        cache: { kind: "query_embedding", hit: false },
        input_bytes: Buffer.byteLength(JSON.stringify(queryInputs)),
      }
    let vectors
    try {
      vectors = await embedInBatches(client, metadata, queryInputs, index.embedding_dimensions)
    } catch (error) {
      observe(
        "query_embedding",
        "failure",
        { ...queryMeasurement, ...stopQuery() },
        queryProvenance,
      )
      const failedQueries = new Set(page.map((descriptor) => descriptor.querySha))
      for (const descriptor of descriptors.filter((item) => failedQueries.has(item.querySha))) {
        const selection = makeCandidateSelection({
          workflowId,
          article: descriptor.article,
          approvalFilesSha: descriptor.approvalFilesSha,
          concepts,
          querySha: descriptor.querySha,
          retrievalPolicySha: retrievalPolicy.sha256,
          failure: {
            stage: "query_embedding",
            reason: "query_embedding_failed",
            message: error.message,
          },
          explicitFullRegistry: fullRegistryEventIds.includes(descriptor.article.event_id),
          fullRegistryReviewRefs,
        })
        atomicCreate(root, descriptor.relative, selection)
      }
      continue
    }
    observe(
      "query_embedding",
      "completed",
      { ...queryMeasurement, ...stopQuery() },
      queryProvenance,
    )
    for (const [indexInPage, descriptor] of page.entries()) {
      const vector = vectors[indexInPage],
        cacheRelative = retrievalQueryPath(index.index_sha256, descriptor.querySha),
        cache = {
          schema: "semantic-candidate-query-vector/v1",
          index_sha256: index.index_sha256,
          query_sha256: descriptor.querySha,
          embedding_digest: metadata.digest,
          vector,
        }
      atomicCreate(root, cacheRelative, {
        ...cache,
        vector_sha256: sha256(JSON.stringify(vector)),
      })
      queryVectors.set(descriptor.querySha, vector)
    }
  }
  let pilot = {
    cases: [],
    challenge_cases: [],
    eligible_article_count: 0,
    eligible_strata: 0,
    eligible_challenge_count: 0,
    eligible_challenge_kinds: 0,
  }
  if (!evaluation) {
    pilot = selectStratifiedPilot(descriptors, supplementaryReviews)
    const conceptById = new Map(concepts.concepts.map((concept) => [concept.concept_id, concept])),
      fullConceptPayloadBytes = Buffer.byteLength(JSON.stringify(concepts.concepts))
    const cases = [...pilot.cases, ...pilot.challenge_cases]
      .filter((item) => queryVectors.has(item.gold.query_sha256))
      .map(({ descriptor, gold }) => {
        const query_embedding = queryVectors.get(gold.query_sha256),
          ranked = rankConceptCandidates({
            query: descriptor.query,
            query_embedding,
            index,
            limit: retrievalPolicy.policy.top_k,
            rrf_k: retrievalPolicy.policy.rrf_k,
            minimum_top_cosine: retrievalPolicy.policy.minimum_top_cosine,
            minimum_top_lexical_score: retrievalPolicy.policy.minimum_top_lexical_score,
            allow_shortlist: true,
          }),
          signalAvailable =
            ranked.exact_match_ids.length > 0 ||
            ranked.top_cosine >= retrievalPolicy.policy.minimum_top_cosine ||
            ranked.top_lexical_score >= retrievalPolicy.policy.minimum_top_lexical_score,
          candidateIds = (
            signalAvailable
              ? ranked.shortlisted_ids
              : concepts.concepts.map((concept) => concept.concept_id)
          ).sort(),
          candidateConcepts = candidateIds.map((id) => conceptById.get(id))
        return {
          ...gold,
          query: descriptor.query,
          query_embedding,
          query_embedding_sha256: sha256(JSON.stringify(query_embedding)),
          payload_candidate_concept_ids: candidateIds,
          full_concept_payload_bytes: fullConceptPayloadBytes,
          candidate_concept_payload_bytes: Buffer.byteLength(JSON.stringify(candidateConcepts)),
        }
      })
    if (
      cases.filter((row) => row.case_kind === "pilot").length >=
        retrievalPolicy.policy.pilot.minimum_articles &&
      cases.filter((row) => row.case_kind === "challenge").length >= 8
    ) {
      try {
        const pilotEvaluation = evaluateConceptCandidateRecall(index, cases)
        assertConceptCandidateEvaluation(pilotEvaluation, index)
        validateEvaluationSources({
          root,
          vault,
          articles,
          approvals,
          concepts,
          index,
          retrievalPolicy,
          evaluation: pilotEvaluation,
          supplementaryReviews,
        })
        if (readJSON(root, evaluationRelative))
          throw Error("Semantic retrieval evaluation appeared during immutable creation")
        atomicCreate(root, evaluationRelative, pilotEvaluation)
        evaluation = pilotEvaluation
      } catch (error) {
        // A malformed or source-inconsistent pilot must never enable a shortlist.
        if (error.code === "EEXIST")
          throw Error("Concurrent semantic retrieval evaluation writer requires readback")
        throw error
      }
    }
  }
  const selectionCounts = { hybrid_top_k: 0, full_registry_fallback: 0 }
  for (const descriptor of descriptors) {
    const existing = readJSON(root, descriptor.relative)
    if (existing) {
      assertCandidateSelection(existing, {
        workflowId,
        article: descriptor.article,
        approvalFilesSha: descriptor.approvalFilesSha,
        concepts,
      })
      selectionCounts[existing.mode] += 1
      continue
    }
    const vector = queryVectors.get(descriptor.querySha)
    if (!vector) throw Error("Semantic candidate query vector was not stored")
    const ranked = rankConceptCandidates({
      query: descriptor.query,
      query_embedding: vector,
      index,
      limit: retrievalPolicy.policy.top_k,
      rrf_k: retrievalPolicy.policy.rrf_k,
      minimum_top_cosine: retrievalPolicy.policy.minimum_top_cosine,
      minimum_top_lexical_score: retrievalPolicy.policy.minimum_top_lexical_score,
      evaluation,
      allow_shortlist: true,
    })
    const selection = makeCandidateSelection({
      workflowId,
      article: descriptor.article,
      approvalFilesSha: descriptor.approvalFilesSha,
      concepts,
      querySha: descriptor.querySha,
      retrievalPolicySha: retrievalPolicy.sha256,
      ranked,
      explicitFullRegistry: fullRegistryEventIds.includes(descriptor.article.event_id),
      fullRegistryReviewRefs,
    })
    atomicCreate(root, descriptor.relative, selection)
    selectionCounts[selection.mode] += 1
  }
  const mode =
    selectionCounts.hybrid_top_k && selectionCounts.full_registry_fallback
      ? "mixed"
      : selectionCounts.hybrid_top_k
        ? "hybrid_top_k"
        : "full_registry_fallback"
  return {
    prepared: descriptors.length,
    mode,
    selections: selectionCounts,
    index_sha256: index.index_sha256,
    evaluation_sha256: evaluation?.evaluation_sha256 || null,
    pilot: evaluation
      ? {
          status: evaluation.passed ? "passed" : "failed_candidate_threshold",
          sample_count: evaluation.sample_count,
          challenge_sample_count: evaluation.challenge_sample_count,
          recall_at_12: evaluation.recall_at_12,
          median_concept_payload_reduction: evaluation.median_concept_payload_reduction,
          strata: evaluation.strata,
        }
      : {
          status:
            pilot.cases.length < 24
              ? "waiting_for_24_native_reviewed_articles"
              : "waiting_for_8_native_reviewed_challenges",
          eligible_article_count: pilot.eligible_article_count,
          eligible_strata: pilot.eligible_strata,
          eligible_challenge_count: pilot.eligible_challenge_count,
          eligible_challenge_kinds: pilot.eligible_challenge_kinds,
        },
    retrieval_policy_sha256: retrievalPolicy.sha256,
  }
}

function verifiedPublicSemanticClaims(approval) {
  const publicIds = publicClaimIds(approval.draft),
    claims = approval.claims
      .filter((claim) => publicIds.has(claim.claim_id))
      .sort((a, b) => a.claim_id.localeCompare(b.claim_id, "en"))
      .map((claim) => {
        if (claim.review?.status !== "verified")
          throw Error("Only verified facts used in public article prose may be analyzed")
        assertVerifiedClaim(claim, approval.parses)
        const evidence = claim.evidence.map((item) => {
          const document = approval.documents.find(
              (row) =>
                row.source_id === item.source_id &&
                row.source_version_id === item.source_version_id,
            ),
            parse = approval.parses.find((row) => row.parse_id === item.parse_id),
            block = parse?.blocks.find((row) => row.block_id === item.block_id)
          if (!document || !parse || !block || !block.text.includes(item.quote))
            throw Error("Exact public claim source block required")
          return {
            source_url: document.original_url,
            source_version_id: document.source_version_id,
            parse_id: parse.parse_id,
            block_id: block.block_id,
            block_sha256: sha256(block.text),
            exact_verified_quote: item.quote,
            source_block: block.text,
          }
        })
        return {
          claim_id: claim.claim_id,
          statement: claim.statement,
          claim_kind: claim.claim_kind,
          event_state: claim.event_state,
          review_reason: claim.review.reason,
          evidence,
        }
      })
  if (
    !claims.length ||
    claims.length !== publicIds.size ||
    new Set(claims.map((claim) => claim.claim_id)).size !== claims.length
  )
    throw Error(
      "Public article needs every distinct source-verified public claim for semantic review",
    )
  return claims
}

export function buildArticleSemanticReasoningInput(
  approval,
  article,
  concepts,
  candidateSelection = null,
) {
  const claims = verifiedPublicSemanticClaims(approval),
    byId = new Map(concepts.map((concept) => [concept.concept_id, concept])),
    candidateIds =
      candidateSelection?.candidate_ids || concepts.map((concept) => concept.concept_id)
  if (
    new Set(candidateIds).size !== candidateIds.length ||
    candidateIds.some((id) => !byId.has(id))
  )
    throw Error("Semantic candidate selection must reference distinct reviewed concepts")
  const selectedConcepts = candidateIds.map((id) => byId.get(id))
  const context = {
    article: {
      event_id: article.event_id,
      title: article.title,
      published_at: article.published_at,
      source_urls: article.source_urls,
      prose: article.prose,
    },
    verified_public_claims: claims,
    reviewed_concept_registry: selectedConcepts,
    candidate_retrieval: candidateSelection
      ? {
          retrieval_version: candidateSelection.retrieval_version,
          index_sha256: candidateSelection.index_sha256,
          mode: candidateSelection.mode,
          fallback_reason: candidateSelection.fallback_reason,
          total_concepts: candidateSelection.total_concepts,
          candidate_count: candidateSelection.candidate_ids.length,
          exact_match_ids: candidateSelection.exact_match_ids,
          evaluation_sha256: candidateSelection.evaluation_sha256,
          ...(candidateSelection.full_registry_review_refs?.length
            ? { full_registry_review_refs: candidateSelection.full_registry_review_refs }
            : {}),
        }
      : {
          retrieval_version: "full-registry/v1",
          mode: "full_registry_fallback",
          fallback_reason: "candidate_selection_not_supplied",
          total_concepts: concepts.length,
          candidate_count: concepts.length,
          exact_match_ids: [],
          evaluation_sha256: null,
        },
  }
  const prompt = [
    "Review this exact already-published article against every supplied reviewed specialist concept and its definition, aliases, keywords, and sources.",
    "Find all well-supported article-to-concept relations; do not optimize for a link count.",
    "Use topic for the article's main technical subject, application for a technology used in the event, comparison_evaluation for an explicit comparison or evaluation, and context_background for a source-supported contextual connection.",
    "A confirmed link must cite one or more supplied verified_public_claims that are actually used in the public article and whose exact source blocks support the relationship. A shared company, product, keyword, or mere mention is insufficient.",
    "Put plausible but indirect or insufficiently supported relations in relation_candidates; never promote those candidates to links.",
    "Suggest a new term only in concept_candidates. Do not create or alter concept definitions or approvals.",
    "The supplied concepts are either the entire registry or a shortlist produced by a validated 24-article retrieval pilot. Review every supplied concept. If retrieval mode is full_registry_fallback, the full reviewed registry is present. Never infer a relation from a keyword alone.",
    "If no relation is supported, return outcome reviewed_none and links []. Distinguish absence of a relation from uncertainty, and explain the result briefly.",
    "Also return keyword_candidates as a separate private list of useful article search terms grounded in the verified public claims. Each keyword must cite evidence_claim_ids. These are not concept links, aliases, nodes, tags, or approvals and must not be promoted automatically.",
    "Return only the requested JSON. This is a semantic relation review, not a fact, editorial, article, or release approval.",
  ].join(" ")
  return { prompt, schema: outputSchema, context }
}

function semanticInputFor(root, vault, article, run, concepts, workflowId, retrievalContext) {
  const approval = loadApprovedOntologyInput(root, run, { vault })
  if (!exactPublicMatch(approval.article, article))
    throw Error("Native approval no longer matches the public article")
  const approvalFilesSha = sha256(JSON.stringify(approval.file_hashes)),
    choice = retrievalContext?.nativeChoices?.get(article.event_id)
  if (
    choice &&
    (run !== choice.record.approved_run || approvalFilesSha !== choice.record.approval_files_sha256)
  )
    throw Error("Selected native approval changed during semantic input verification")
  const candidateSelection = readCandidateSelection(
      root,
      workflowId,
      article,
      approvalFilesSha,
      concepts,
      retrievalContext?.retrievalPolicy,
    ),
    input = buildArticleSemanticReasoningInput(
      approval,
      article,
      concepts.concepts,
      candidateSelection,
    )
  if (retrievalContext)
    validateFrozenCandidateRetrieval(candidateSelection, approval, article, retrievalContext)
  return {
    approval,
    input,
    sha256: sha256(JSON.stringify(input)),
    approval_files_sha256: approvalFilesSha,
    candidate_selection_sha256: candidateSelection.selection_sha256,
  }
}

function indexReviewForReceipt(workflowId, row, receipt, receiptFileSha256) {
  return {
    event_id: row.event_id,
    status: receipt.status,
    reviewed_at: receipt.reviewed_at,
    workflow_id: workflowId,
    approved_run: row.approved_run,
    semantic_input_sha256: row.semantic_input_sha256,
    executor: receipt.executor,
    model: receipt.model,
    task_id: receipt.task_id,
    request_sha256: receipt.request_sha256,
    result_sha256: receipt.result_sha256,
    receipt_sha256: receiptFileSha256,
    article_public_sha256: row.article_public_sha256,
    approval_files_sha256: row.approval_files_sha256,
    concept_registry_sha256: row.concept_registry_sha256,
    policy_sha256: row.policy_sha256,
    links: receipt.links,
  }
}

// Explicit completed receipts are ordinary private results, never pilot gold.
// Validate their original row in place: unrelated current articles must not
// require rebuilding the old workflow's complete inventory.
function loadCompletedReviewSources({
  root,
  vault,
  workflowId,
  completedReviewRefs,
  articlesByEvent,
  concepts,
  policySha256,
  retrievalContext,
}) {
  const byEvent = new Map(),
    inventories = new Map(),
    expansions = new Map(),
    contexts = new Map()
  for (const ref of completedReviewRefs) {
    const receipt = checked(root, ref)
    if (
      receipt?.schema !== ARTICLE_SEMANTIC_REVIEW_SCHEMA ||
      !validEvent(receipt.event_id) ||
      !validId(receipt.workflow_id) ||
      receipt.workflow_id === workflowId ||
      receipt.executor !== "codex" ||
      receipt.model !== "gpt-6-luna" ||
      !["reviewed_links", "reviewed_none"].includes(receipt.status)
    )
      throw Error("Exact completed private Codex gpt-6-luna semantic receipt required")
    if (byEvent.has(receipt.event_id))
      throw Error("Distinct completed review event IDs required; conflicting refs are not selected")
    const article = articlesByEvent.get(receipt.event_id)
    if (!article) throw Error("Completed review event is outside the current public inventory")
    const origin = receipt.workflow_id
    if (!inventories.has(origin)) inventories.set(origin, loadInventory(root, origin))
    const saved = inventories.get(origin)?.inventory,
      row = saved?.items.find((item) => item.event_id === receipt.event_id)
    if (
      !row ||
      row.status !== "ready" ||
      ref.path !== receiptPath(origin, row) ||
      row.approval_files_sha256 !== sha256(JSON.stringify(row.approval_files))
    )
      throw Error("Completed review requires its exact original frozen inventory row")
    const prepared = preparedFor(root, origin, row)
    if (!prepared) throw Error("Completed review requires its original prepared reasoning task")
    const selection = readJSON(
        root,
        selectionPath(origin, row.event_id, row.approval_files_sha256),
      ),
      { selection_sha256: selectionSha, ...selectionBody } = selection || {}
    if (
      selection?.schema !== "semantic-article-candidate-selection/v1" ||
      selection.workflow_id !== origin ||
      selection.event_id !== row.event_id ||
      selection.article_public_sha256 !== row.article_public_sha256 ||
      selection.approval_files_sha256 !== row.approval_files_sha256 ||
      selection.concept_registry_sha256 !== row.concept_registry_sha256 ||
      selection.retrieval_policy_sha256 !== saved.retrieval_policy_sha256 ||
      !["hybrid_top_k", "full_registry_fallback"].includes(selection.mode) ||
      selectionSha !== row.candidate_selection_sha256 ||
      selectionSha !== sha256(JSON.stringify(selectionBody))
    )
      throw Error("Completed review candidate selection differs from its original frozen row")
    if (!expansions.has(origin)) expansions.set(origin, fullRegistryExpansionContext(root, saved))
    assertFullRegistrySelectionProvenance(selection, expansions.get(origin))
    const { page, request } = readFullReasoningRequest(root, prepared)
    if (page.status !== "completed")
      throw Error("Completed review requires its whole completed native reasoning result")
    assertSemanticRequestBinding(request, row, prepared)
    if (
      request.run !==
        `semantic-${origin}-${row.event_id}-${row.semantic_input_sha256.slice(0, 12)}` +
          (prepared.attempt_number ? `-retry-${prepared.attempt_number}` : "") ||
      JSON.stringify(selection.candidate_ids) !==
        JSON.stringify(
          request.input.context.reviewed_concept_registry.map((concept) => concept.concept_id),
        ) ||
      JSON.stringify(request.input.context.candidate_retrieval) !==
        JSON.stringify({
          retrieval_version: selection.retrieval_version,
          index_sha256: selection.index_sha256,
          mode: selection.mode,
          fallback_reason: selection.fallback_reason,
          total_concepts: selection.total_concepts,
          candidate_count: selection.candidate_ids.length,
          exact_match_ids: selection.exact_match_ids,
          evaluation_sha256: selection.evaluation_sha256,
          ...(selection.full_registry_review_refs?.length
            ? { full_registry_review_refs: selection.full_registry_review_refs }
            : {}),
        })
    )
      throw Error(
        "Completed review request differs from its original workflow or candidate selection",
      )
    const result = exactSemanticResult(root, row, prepared, page),
      suppliedConcepts = new Map(
        request.input.context.reviewed_concept_registry.map((concept) => [
          concept.concept_id,
          concept,
        ]),
      ),
      links = result.output.links.map((link) => {
        const concept = suppliedConcepts.get(link.concept_id)
        if (!concept) throw Error("Completed review links require their original supplied concepts")
        return {
          concept_id: link.concept_id,
          role: link.role,
          reason: link.reason,
          evidence_claim_ids: link.evidence_claim_ids,
          concept_path: concept.path,
          concept_sha256: concept.sha256,
        }
      })
    assertReceipt(root, origin, row, receipt, prepared)
    if (
      request.input.context.article.event_id !== row.event_id ||
      result.output.event_id !== row.event_id ||
      receipt.result_sha256 !== result.result_sha256 ||
      receipt.reviewed_at !== result.submitted_at ||
      receipt.status !== result.output.outcome ||
      receipt.review_reason !== result.output.review_reason ||
      JSON.stringify(receipt.output) !== JSON.stringify(result.output) ||
      JSON.stringify(receipt.links) !== JSON.stringify(links) ||
      JSON.stringify(receipt.relation_candidates) !==
        JSON.stringify(result.output.relation_candidates) ||
      JSON.stringify(receipt.concept_candidates) !==
        JSON.stringify(result.output.concept_candidates)
    )
      throw Error("Completed semantic receipt differs from its whole native request/result")
    // Changed current inputs invalidate only this reference's reuse. Its native
    // task/result/receipt identity is still checked before treating it as stale.
    const currentFiles = readNativeApprovalFileHashes(root, row.approved_run),
      applicable =
        article.review_status === "verified" &&
        article.article_sha256 === row.article_sha256 &&
        article.public_sha256 === row.article_public_sha256 &&
        sha256(JSON.stringify(currentFiles)) === row.approval_files_sha256 &&
        concepts.sha256 === row.concept_registry_sha256 &&
        policySha256 === row.policy_sha256 &&
        retrievalContext.retrievalPolicy.sha256 === saved.retrieval_policy_sha256
    const source = { receipt, row, receiptRef: ref, applicable: false }
    byEvent.set(row.event_id, source)
    if (!applicable) continue
    const approval = loadApprovedOntologyInput(root, row.approved_run, { vault })
    if (!exactPublicMatch(approval.article, article))
      throw Error("Completed review native approval no longer matches its exact public article")
    if (row.approval_selection_sha256 !== undefined) {
      const choices = normalizeApprovalSelectionRefs(
        root,
        saved.approval_selection_refs || [],
      ).filter((choice) => choice.sha256 === row.approval_selection_sha256)
      if (choices.length !== 1)
        throw Error("Completed review original native selection marker has no exact frozen ref")
      const choice = loadNativeApprovalSelections({
        root,
        vault,
        articles: [article],
        approvals: retrievalContext.approvals,
        approvalSelectionRefs: choices,
      }).get(row.event_id)
      if (choice?.pending) {
        const error = Error("Completed review original selection requires exact stored evidence")
        error.code = "STORAGE_PENDING"
        error.storage_request = choice.pending
        throw error
      }
      if (!choice || choice.record.approved_run !== row.approved_run)
        throw Error("Completed review original native selection binding changed")
    }
    if (!contexts.has(origin)) {
      const pilotReviewRefs = normalizePilotReviewRefs(root, saved.pilot_review_refs || [])
      contexts.set(origin, {
        ...retrievalContext,
        ...expansions.get(origin),
        pilotReviewRefs,
        supplementaryReviews: loadPilotSourceReviews({
          root,
          vault,
          articles: retrievalContext.articles,
          concepts,
          pilotReviewRefs,
        }),
        cache: new Map(),
      })
    }
    const originalSelection = readCandidateSelection(
      root,
      origin,
      article,
      row.approval_files_sha256,
      concepts,
      retrievalContext.retrievalPolicy,
    )
    validateFrozenCandidateRetrieval(originalSelection, approval, article, contexts.get(origin))
    const input = buildArticleSemanticReasoningInput(
      approval,
      article,
      concepts.concepts,
      originalSelection,
    )
    if (JSON.stringify(input) !== JSON.stringify(request.input))
      throw Error("Completed review differs from its rebuilt whole source-bound reasoning input")
    const validated = semanticReceipt(root, origin, row, article, concepts, prepared, vault, {
      requireExisting: true,
    })
    if (
      !validated ||
      JSON.stringify(validated) !== JSON.stringify(receipt) ||
      reference(root, ref.path).sha256 !== ref.sha256
    )
      throw Error("Completed review receipt changed during exact native revalidation")
    source.applicable = true
  }
  return byEvent
}

function reusableCompletedSourceReceipt(row, resolved, source, supplementary) {
  if (!source?.applicable) return null
  const prior = source.row,
    receipt = source.receipt
  if (
    row.article_sha256 !== prior.article_sha256 ||
    row.article_public_sha256 !== prior.article_public_sha256 ||
    row.approved_run !== prior.approved_run ||
    row.approval_files_sha256 !== prior.approval_files_sha256 ||
    row.concept_registry_sha256 !== prior.concept_registry_sha256 ||
    row.policy_sha256 !== prior.policy_sha256 ||
    row.semantic_input_sha256 !== prior.semantic_input_sha256
  )
    return null
  if (
    supplementary &&
    resolved.input.context.candidate_retrieval.mode === "full_registry_fallback" &&
    supplementary.source.row.semantic_input_sha256 === row.semantic_input_sha256 &&
    !reusablePilotSourceReceipt(row, resolved, supplementary)
  )
    return null
  return {
    ...row,
    status: receipt.status,
    task_id: receipt.task_id,
    request_sha256: receipt.request_sha256,
    candidate_selection_sha256: receipt.candidate_selection_sha256,
    current_candidate_selection_sha256: row.candidate_selection_sha256,
    reuse_basis: "completed_private_receipt_same_full_input",
    reused_from_workflow_id: receipt.workflow_id,
    reused_receipt_ref: source.receiptRef,
    reused_receipt_review: indexReviewForReceipt(
      receipt.workflow_id,
      prior,
      receipt,
      source.receiptRef.sha256,
    ),
  }
}

function reusablePilotSourceReceipt(row, resolved, supplementary) {
  if (!supplementary) return null
  const { source, review } = supplementary,
    prior = source.row,
    receipt = source.receipt,
    linkIdentity = (links) =>
      JSON.stringify(
        links
          .map((link) => ({
            concept_id: link.concept_id,
            role: link.role,
            evidence_claim_ids: [...link.evidence_claim_ids].sort(),
          }))
          .sort((left, right) => left.concept_id.localeCompare(right.concept_id, "en")),
      )
  if (
    resolved.input.context.candidate_retrieval.mode !== "full_registry_fallback" ||
    row.article_sha256 !== prior.article_sha256 ||
    row.article_public_sha256 !== prior.article_public_sha256 ||
    row.approved_run !== prior.approved_run ||
    row.approval_files_sha256 !== prior.approval_files_sha256 ||
    row.concept_registry_sha256 !== prior.concept_registry_sha256 ||
    row.policy_sha256 !== prior.policy_sha256 ||
    row.semantic_input_sha256 !== prior.semantic_input_sha256 ||
    receipt.schema !== ARTICLE_SEMANTIC_REVIEW_SCHEMA ||
    receipt.executor !== "codex" ||
    receipt.model !== "gpt-6-luna" ||
    review.outcome !== receipt.status ||
    linkIdentity(review.links) !== linkIdentity(receipt.links)
  )
    return null
  return {
    ...row,
    status: receipt.status,
    task_id: receipt.task_id,
    request_sha256: receipt.request_sha256,
    candidate_selection_sha256: receipt.candidate_selection_sha256,
    current_candidate_selection_sha256: row.candidate_selection_sha256,
    reuse_basis: "pilot_source_receipt_same_full_input",
    reused_from_workflow_id: receipt.workflow_id,
    reused_receipt_ref: source.receiptRef,
    reused_receipt_review: indexReviewForReceipt(
      receipt.workflow_id,
      prior,
      receipt,
      source.receiptRef.sha256,
    ),
  }
}

function buildInventory(
  root,
  vault,
  {
    repo = path.resolve(vault, ".."),
    policyFile = path.join(repo, "data/research-model-policy-codex.json"),
    workflowId,
    pilotReviewRefs = [],
    approvalSelectionRefs = [],
    completedReviewRefs = [],
    fullRegistryEventIds = [],
    fullRegistryReviewRefs = [],
  } = {},
  derived = {},
) {
  const articles = publicArticleInventory(vault),
    concepts = conceptSnapshot(vault),
    approvals = directApprovalInventory(root),
    policyBytes = fs.readFileSync(policyFile),
    settings = resolveRolePolicy(JSON.parse(policyBytes.toString("utf8")), "evidence_compare"),
    priorIndex = loadPublishedSemanticIndex(repo),
    retrievalPolicy = readSemanticRetrievalPolicy(repo),
    expansion = fullRegistryExpansionContext(root, {
      full_registry_event_ids: fullRegistryEventIds,
      full_registry_review_refs: fullRegistryReviewRefs,
      items: articles,
    }),
    items = []
  derived.articlesByEvent = new Map(articles.map((article) => [article.event_id, article]))
  // Re-read all supplementary artifacts on every status/resume/export path.
  // The exact refs are part of the inventory fingerprint, never an approval.
  const supplementaryReviews = loadPilotSourceReviews({
      root,
      vault,
      articles,
      concepts,
      pilotReviewRefs,
    }),
    nativeChoices = loadNativeApprovalSelections({
      root,
      vault,
      articles,
      approvals,
      approvalSelectionRefs,
    }),
    retrievalContext = {
      root,
      vault,
      articles,
      approvals,
      concepts,
      retrievalPolicy,
      pilotReviewRefs,
      supplementaryReviews,
      nativeChoices,
      ...expansion,
      cache: new Map(),
    }
  derived.retrievalContext = retrievalContext
  if (settings.provider !== "codex" || settings.model !== "gpt-6-luna")
    throw Error(
      "Article semantic review requires the configured Codex gpt-6-luna evidence_compare role",
    )
  const completedSources = loadCompletedReviewSources({
    root,
    vault,
    workflowId,
    completedReviewRefs,
    articlesByEvent: derived.articlesByEvent,
    concepts,
    policySha256: sha256(policyBytes),
    retrievalContext,
  })
  for (const article of articles) {
    if (article.review_status !== "verified") {
      items.push({
        event_id: article.event_id,
        article_path: article.path,
        article_sha256: article.article_sha256,
        article_public_sha256: article.public_sha256,
        status: "blocked",
        reason: "public_article_not_verified",
      })
      continue
    }
    const choice = nativeChoices.get(article.event_id),
      choiceBinding = choice ? { approval_selection_sha256: choice.ref.sha256 } : {}
    if (choice?.pending) {
      items.push({
        event_id: article.event_id,
        article_path: article.path,
        article_sha256: article.article_sha256,
        article_public_sha256: article.public_sha256,
        approved_run: choice.record.approved_run,
        ...choiceBinding,
        status: "waiting_for_storage",
        reason: choice.pendingReason,
        storage_requests: [choice.pending],
      })
      continue
    }
    const candidates = (approvals.get(article.event_id) || [])
      .filter(({ article: candidate }) => exactPublicMatch(candidate, article))
      .filter((candidate) => !choice || candidate.run === choice.record.approved_run)
      .sort((a, b) => a.run.localeCompare(b.run, "en"))
    const valid = [],
      storageErrors = [],
      invalidErrors = []
    for (const candidate of candidates) {
      try {
        const resolved = semanticInputFor(
          root,
          vault,
          article,
          candidate.run,
          concepts,
          workflowId,
          retrievalContext,
        )
        valid.push({ ...candidate, ...resolved })
      } catch (error) {
        if (error.code === "STORAGE_PENDING") storageErrors.push(error.storage_request)
        else invalidErrors.push({ run: candidate.run, reason: error.message })
      }
    }
    const identities = new Set(
      valid.map((row) => JSON.stringify([row.sha256, row.approval_files_sha256])),
    )
    if (identities.size > 1) {
      items.push({
        event_id: article.event_id,
        article_path: article.path,
        article_sha256: article.article_sha256,
        article_public_sha256: article.public_sha256,
        status: "blocked",
        reason: "multiple_native_approvals_match_public_article_with_different_evidence",
        candidate_runs: valid.map((row) => row.run),
      })
      continue
    }
    if (valid.length) {
      const selected = valid[0]
      const run = `semantic-${workflowId}-${article.event_id}-${selected.sha256.slice(0, 12)}`,
        binding = {
          settings,
          policy_sha256: sha256(policyBytes),
          approval_run: selected.run,
          approval_files_sha256: selected.approval_files_sha256,
          concept_registry_sha256: concepts.sha256,
          candidate_selection_sha256: selected.candidate_selection_sha256,
          ...choiceBinding,
        },
        requestIdentity = reasoningRequestIdentity({
          run,
          role: "evidence_compare",
          binding,
          input: selected.input,
        }),
        row = {
          event_id: article.event_id,
          article_path: article.path,
          article_sha256: article.article_sha256,
          article_public_sha256: article.public_sha256,
          status: "ready",
          approved_run: selected.run,
          approval_files: selected.approval.file_hashes,
          approval_files_sha256: selected.approval_files_sha256,
          concept_registry_sha256: concepts.sha256,
          candidate_selection_sha256: selected.candidate_selection_sha256,
          semantic_input_sha256: selected.sha256,
          policy_sha256: sha256(policyBytes),
          task_id: requestIdentity.task_id,
          request_sha256: requestIdentity.request_sha256,
          ...choiceBinding,
        },
        prior = priorIndex.reviews.get(article.event_id),
        reusedPilot = reusablePilotSourceReceipt(
          row,
          selected,
          supplementaryReviews.get(row.event_id),
        )
      // An explicit same-input source receipt stays authoritative for this
      // inventory even after export makes that original receipt public.
      if (reusedPilot) {
        items.push(reusedPilot)
        continue
      }
      const reusedCompleted = reusableCompletedSourceReceipt(
        row,
        selected,
        completedSources.get(row.event_id),
        supplementaryReviews.get(row.event_id),
      )
      if (reusedCompleted) {
        items.push(reusedCompleted)
        continue
      }
      if (
        prior &&
        prior.workflow_id !== workflowId &&
        prior.approved_run === row.approved_run &&
        prior.semantic_input_sha256 === row.semantic_input_sha256 &&
        prior.article_public_sha256 === row.article_public_sha256 &&
        prior.approval_files_sha256 === row.approval_files_sha256 &&
        prior.concept_registry_sha256 === row.concept_registry_sha256 &&
        prior.policy_sha256 === row.policy_sha256
      ) {
        const priorSelection = readCandidateSelection(
            root,
            prior.workflow_id,
            article,
            row.approval_files_sha256,
            concepts,
          ),
          priorRow = {
            ...row,
            status: "ready",
            candidate_selection_sha256: priorSelection.selection_sha256,
            task_id: prior.task_id,
            request_sha256: prior.request_sha256,
          },
          originalPrepared = readJSON(
            root,
            `${base(prior.workflow_id)}prepared/${article.event_id}.json`,
          ),
          existingReceipt = readJSON(root, receiptPath(prior.workflow_id, priorRow))
        delete priorRow.approval_selection_sha256
        Object.assign(priorRow, approvalSelectionBinding(originalPrepared))
        if (!originalPrepared || !existingReceipt)
          throw Error("Published semantic review has no exact local reasoning receipt")
        const prepared = preparedFor(root, prior.workflow_id, priorRow),
          receiptBytes = fs.readFileSync(safePath(root, receiptPath(prior.workflow_id, priorRow)))
        if (sha256(receiptBytes) !== prior.receipt_sha256)
          throw Error("Published semantic review receipt SHA no longer matches its record")
        const validated = semanticReceipt(
          root,
          prior.workflow_id,
          priorRow,
          article,
          concepts,
          prepared,
          vault,
        )
        if (
          validated.status !== prior.status ||
          validated.task_id !== prior.task_id ||
          validated.request_sha256 !== prior.request_sha256 ||
          validated.result_sha256 !== prior.result_sha256 ||
          JSON.stringify(validated.links) !== JSON.stringify(prior.links)
        )
          throw Error("Published semantic review differs from its exact local reasoning receipt")
        items.push({ ...row, status: prior.status, reused_index_review: prior })
      } else items.push(row)
      continue
    }
    let archives = []
    try {
      archives = lookupArchiveLocations(root, { eventId: article.event_id })
    } catch (error) {
      invalidErrors.push({ reason: error.message })
    }
    const hasStorageWait = storageErrors.length || archives.length
    items.push({
      event_id: article.event_id,
      article_path: article.path,
      article_sha256: article.article_sha256,
      article_public_sha256: article.public_sha256,
      status: hasStorageWait ? "waiting_for_storage" : "blocked",
      reason: hasStorageWait
        ? "exact_native_approval_bytes_require_hydration"
        : candidates.length
          ? "matching_native_approval_failed_integrity_validation"
          : "exact_native_approval_not_found",
      ...(archives.length
        ? {
            archives: archives.map((row) => ({
              archive_run: row.archive_run,
              drive_file_id: row.drive.file_id,
              package_sha256: row.package_sha256,
              sources: row.sources,
            })),
          }
        : {}),
      ...(storageErrors.length ? { storage_requests: storageErrors } : {}),
      ...(invalidErrors.length ? { diagnostics: invalidErrors } : {}),
    })
  }
  const body = {
    schema: "research-article-semantic-review-inventory/v2",
    vault: fs.realpathSync(vault),
    public_article_count: articles.length,
    public_articles_sha256: sha256(
      JSON.stringify(
        articles.map((row) => ({
          event_id: row.event_id,
          path: row.path,
          article_sha256: row.article_sha256,
          article_public_sha256: row.public_sha256,
        })),
      ),
    ),
    concept_registry_sha256: concepts.sha256,
    policy_sha256: sha256(policyBytes),
    retrieval_policy_sha256: retrievalPolicy.sha256,
    retrieval_version: CONCEPT_RETRIEVAL_VERSION,
    ...(pilotReviewRefs.length ? { pilot_review_refs: pilotReviewRefs } : {}),
    ...(approvalSelectionRefs.length ? { approval_selection_refs: approvalSelectionRefs } : {}),
    ...(completedReviewRefs.length ? { completed_review_refs: completedReviewRefs } : {}),
    ...(expansion.fullRegistryEventIds.length
      ? {
          full_registry_event_ids: expansion.fullRegistryEventIds,
          full_registry_review_refs: expansion.fullRegistryReviewRefs,
        }
      : {}),
    items,
  }
  return { ...body, inventory_sha256: sha256(JSON.stringify(body)) }
}

function loadInventory(root, workflowId) {
  const pointer = readJSON(root, base(workflowId) + "latest.json")
  if (!pointer) return null
  if (
    pointer.schema !== "research-article-semantic-review-pointer/v1" ||
    pointer.workflow_id !== workflowId ||
    !pointer.inventory
  )
    throw Error("Semantic review workflow pointer is invalid")
  const inventory = checked(root, pointer.inventory)
  const { inventory_sha256, ...body } = inventory
  if (
    inventory.schema !== "research-article-semantic-review-inventory/v2" ||
    inventory.inventory_sha256 !== sha256(JSON.stringify(body)) ||
    !Array.isArray(inventory.items) ||
    inventory.items.length !== inventory.public_article_count ||
    new Set(inventory.items.map((row) => row.event_id)).size !== inventory.items.length ||
    inventory.items.some(
      (row) =>
        !validEvent(row.event_id) ||
        ![
          "ready",
          "waiting_for_reasoning",
          "reviewed_links",
          "reviewed_none",
          "waiting_for_storage",
          "blocked",
        ].includes(row.status),
    )
  )
    throw Error("Semantic review inventory integrity mismatch")
  return { pointer, inventory }
}

function assertSameInventory(root, vault, workflowId, saved, repo, policyFile, derived = {}) {
  const current = buildInventory(
    root,
    vault,
    {
      repo,
      policyFile,
      workflowId,
      pilotReviewRefs: normalizePilotReviewRefs(root, saved.pilot_review_refs || []),
      approvalSelectionRefs: normalizeApprovalSelectionRefs(
        root,
        saved.approval_selection_refs || [],
      ),
      completedReviewRefs: normalizeCompletedReviewRefs(root, saved.completed_review_refs || []),
      fullRegistryEventIds: saved.full_registry_event_ids,
      fullRegistryReviewRefs: saved.full_registry_review_refs,
    },
    derived,
  )
  if (current.inventory_sha256 !== saved.inventory_sha256)
    throw Error(
      "Semantic review inputs changed; preserve this workflow and start a new workflow ID",
    )
  return current
}

function indexPage(rows, offset, limit) {
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw Error("Bounded semantic review page required")
  return {
    items: rows.slice(offset, offset + limit),
    next_offset: offset + limit < rows.length ? offset + limit : null,
  }
}

function counts(root, workflowId, inventory) {
  const result = {
    total: inventory.items.length,
    ready: 0,
    waiting_for_reasoning: 0,
    result_ready: 0,
    reviewed_links: 0,
    reviewed_none: 0,
    waiting_for_storage: 0,
    blocked: 0,
  }
  for (const row of inventory.items) {
    if (row.status !== "ready") {
      result[row.status] = (result[row.status] || 0) + 1
      continue
    }
    const receipt = readJSON(root, receiptPath(workflowId, row))
    if (receipt) {
      result[receipt.status] = (result[receipt.status] || 0) + 1
      continue
    }
    const prepared = preparedFor(root, workflowId, row)
    if (!prepared) {
      result.ready += 1
      continue
    }
    const pending = readReasoningTask(root, {
      task_id: prepared.task_id,
      request_sha256: prepared.request_sha256,
      offset: 0,
      limit: 1,
    })
    result[pending.status === "reasoning_pending" ? "waiting_for_reasoning" : "result_ready"] += 1
  }
  return result
}

export async function prepareArticleSemanticReviews({
  root,
  vault = "vault",
  repo,
  policyFile,
  workflowId,
  offset = 0,
  limit = 20,
  gateReader = readOperationGate,
  embeddingClient,
  eventIds,
  event_ids,
  pilotReviewRefs,
  pilot_review_refs,
  approvalSelectionRefs,
  approval_selection_refs,
  completedReviewRefs,
  completed_review_refs,
  fullRegistryEventIds,
  full_registry_event_ids,
  fullRegistryReviewRefs,
  full_registry_review_refs,
}) {
  updateGate(repo, gateReader)
  const directory = base(workflowId),
    selectedEventIds = normalizeEventIds(optionalAlias(eventIds, event_ids, "event_ids")),
    requestedPilotRefs = optionalAlias(pilotReviewRefs, pilot_review_refs, "pilot_review_refs"),
    requestedApprovalRefs = optionalAlias(
      approvalSelectionRefs,
      approval_selection_refs,
      "approval_selection_refs",
    ),
    requestedCompletedRefs = optionalAlias(
      completedReviewRefs,
      completed_review_refs,
      "completed_review_refs",
    ),
    requestedFullRegistryIds = optionalAlias(
      fullRegistryEventIds,
      full_registry_event_ids,
      "full_registry_event_ids",
    ),
    requestedFullRegistryRefs = optionalAlias(
      fullRegistryReviewRefs,
      full_registry_review_refs,
      "full_registry_review_refs",
    )
  return withLock(root, "article-semantic-" + workflowId, async () => {
    updateGate(repo, gateReader)
    const prior = loadInventory(root, workflowId),
      frozenPilotRefs = normalizePilotReviewRefs(root, prior?.inventory.pilot_review_refs || []),
      refs =
        requestedPilotRefs === undefined
          ? frozenPilotRefs
          : normalizePilotReviewRefs(root, requestedPilotRefs),
      frozenApprovalRefs = normalizeApprovalSelectionRefs(
        root,
        prior?.inventory.approval_selection_refs || [],
      ),
      approvalRefs =
        requestedApprovalRefs === undefined
          ? frozenApprovalRefs
          : normalizeApprovalSelectionRefs(root, requestedApprovalRefs),
      frozenCompletedRefs = normalizeCompletedReviewRefs(
        root,
        prior?.inventory.completed_review_refs || [],
      ),
      completedRefs =
        requestedCompletedRefs === undefined
          ? frozenCompletedRefs
          : normalizeCompletedReviewRefs(root, requestedCompletedRefs),
      frozenExpansion = fullRegistryExpansionContext(root, prior?.inventory),
      expansion = fullRegistryExpansionContext(root, {
        full_registry_event_ids:
          requestedFullRegistryIds === undefined
            ? frozenExpansion.fullRegistryEventIds
            : requestedFullRegistryIds,
        full_registry_review_refs:
          requestedFullRegistryRefs === undefined
            ? frozenExpansion.fullRegistryReviewRefs
            : requestedFullRegistryRefs,
      })
    if (prior && JSON.stringify(expansion) !== JSON.stringify(frozenExpansion))
      throw Error(
        "Full registry expansion changed after freeze; preserve this workflow and start a new workflow ID",
      )
    if (prior && JSON.stringify(completedRefs) !== JSON.stringify(frozenCompletedRefs))
      throw Error(
        "Completed review refs changed after freeze; preserve this workflow and start a new workflow ID",
      )
    if (prior && JSON.stringify(approvalRefs) !== JSON.stringify(frozenApprovalRefs))
      throw Error(
        "Native input selection refs changed after freeze; preserve this workflow and start a new workflow ID",
      )
    if (prior && JSON.stringify(refs) !== JSON.stringify(frozenPilotRefs))
      throw Error(
        "Pilot source review refs changed after freeze; preserve this workflow and start a new workflow ID",
      )
    if (selectedEventIds || expansion.fullRegistryEventIds.length) {
      const publicIds = new Set(publicArticleInventory(vault).map((article) => article.event_id))
      if (selectedEventIds?.some((id) => !publicIds.has(id)))
        throw Error("event_ids contains an event outside the complete public article inventory")
      if (expansion.fullRegistryEventIds.some((id) => !publicIds.has(id)))
        throw Error(
          "full_registry_event_ids contains an event outside the complete public article inventory",
        )
    }
    let candidate_retrieval = { reused: true }
    if (!prior) {
      candidate_retrieval = await ensureCandidateSelections({
        root,
        vault,
        repo,
        workflowId,
        concepts: conceptSnapshot(vault),
        embeddingClient,
        pilotReviewRefs: refs,
        approvalSelectionRefs: approvalRefs,
        ...expansion,
        policyFile,
      })
    }
    const derived = {},
      current = buildInventory(
        root,
        vault,
        {
          repo,
          policyFile,
          workflowId,
          pilotReviewRefs: refs,
          approvalSelectionRefs: approvalRefs,
          completedReviewRefs: completedRefs,
          ...expansion,
        },
        derived,
      )
    if (prior && prior.inventory.inventory_sha256 !== current.inventory_sha256)
      throw Error(
        "Semantic review inputs changed; preserve this workflow and start a new workflow ID",
      )
    if (!prior) {
      const file = directory + `inventory-${current.inventory_sha256}.json`
      atomicCreate(root, file, current)
      const inventoryRef = reference(root, file)
      atomicWrite(root, directory + "latest.json", {
        schema: "research-article-semantic-review-pointer/v1",
        workflow_id: workflowId,
        inventory: inventoryRef,
        updated_at: new Date().toISOString(),
      })
    }
    const policyBytes = fs.readFileSync(policyFile),
      policy = JSON.parse(policyBytes.toString("utf8")),
      settings = resolveRolePolicy(policy, "evidence_compare")
    if (settings.provider !== "codex" || settings.model !== "gpt-6-luna")
      throw Error(
        "Article semantic review requires the configured Codex gpt-6-luna evidence_compare role",
      )
    const selectedSet = selectedEventIds ? new Set(selectedEventIds) : null,
      selected = current.items.filter(
        (row) => row.status === "ready" && (!selectedSet || selectedSet.has(row.event_id)),
      ),
      page = indexPage(selected, offset, limit),
      tasks = []
    const concepts = conceptSnapshot(vault),
      observe = semanticMetricsContext({
        root,
        repo,
        policyFile,
        workflowId,
        concepts,
        inventorySha: current.inventory_sha256,
        retrievalPolicySha: current.retrieval_policy_sha256,
      }),
      operationId = crypto.randomUUID()
    if (current.items.some((row) => row.status === "waiting_for_storage"))
      observe("storage_wait", "pending")
    for (const row of page.items) {
      const preparedPath = directory + `prepared/${row.event_id}.json`,
        previous = readJSON(root, preparedPath)
      let prepared,
        inputBytes = null
      if (previous) {
        prepared = preparedFor(root, workflowId, row)
        readReasoningTask(root, {
          task_id: prepared.task_id,
          request_sha256: prepared.request_sha256,
          offset: 0,
          limit: 1,
        })
      } else {
        const article = derived.articlesByEvent.get(row.event_id)
        if (!article || article.article_sha256 !== row.article_sha256)
          throw Error("Public article changed after semantic inventory")
        const resolved = semanticInputFor(
          root,
          vault,
          article,
          row.approved_run,
          concepts,
          workflowId,
          derived.retrievalContext,
        )
        if (
          resolved.sha256 !== row.semantic_input_sha256 ||
          resolved.approval_files_sha256 !== row.approval_files_sha256 ||
          resolved.candidate_selection_sha256 !== row.candidate_selection_sha256
        )
          throw Error("Native article approval changed after semantic inventory")
        inputBytes = Buffer.byteLength(JSON.stringify(resolved.input))
        const request = createReasoningTask(root, {
          run: `semantic-${workflowId}-${row.event_id}-${row.semantic_input_sha256.slice(0, 12)}`,
          role: "evidence_compare",
          binding: {
            settings,
            policy_sha256: sha256(policyBytes),
            approval_run: row.approved_run,
            approval_files_sha256: row.approval_files_sha256,
            concept_registry_sha256: row.concept_registry_sha256,
            candidate_selection_sha256: row.candidate_selection_sha256,
            ...approvalSelectionBinding(row),
          },
          input: resolved.input,
        })
        if (request.task_id !== row.task_id || request.request_sha256 !== row.request_sha256)
          throw Error("Created reasoning request differs from the frozen semantic inventory")
        prepared = {
          schema: "research-article-semantic-review-prepared/v2",
          workflow_id: workflowId,
          event_id: row.event_id,
          approved_run: row.approved_run,
          semantic_input_sha256: row.semantic_input_sha256,
          candidate_selection_sha256: row.candidate_selection_sha256,
          task_id: request.task_id,
          request_sha256: request.request_sha256,
          requested_model: settings.model,
          requested_thinking: settings.think,
          ...approvalSelectionBinding(row),
        }
        atomicCreate(root, preparedPath, prepared)
      }
      const article = derived.articlesByEvent.get(row.event_id),
        selection = readCandidateSelection(
          root,
          workflowId,
          article,
          row.approval_files_sha256,
          concepts,
        ),
        byId = new Map(concepts.concepts.map((concept) => [concept.concept_id, concept])),
        provenance = semanticTaskProvenance(row, prepared)
      observe(
        "candidate_selection",
        "completed",
        {
          temperature: prior ? "warm" : "cold",
          cache: { kind: "candidate_selection", hit: Boolean(prior) },
          fallback: {
            used: selection.mode === "full_registry_fallback",
            reason: selection.mode === "full_registry_fallback" ? selection.fallback_reason : null,
          },
          input_bytes: inputBytes,
          full_concept_bytes: Buffer.byteLength(JSON.stringify(concepts.concepts)),
          selected_concept_bytes: Buffer.byteLength(
            JSON.stringify(selection.candidate_ids.map((id) => byId.get(id))),
          ),
        },
        {
          ...provenance,
          operation_id: operationId,
          index_sha256: selection.index_sha256,
          embedding_digest: selection.embedding_digest,
        },
      )
      if (!previous) {
        const task = readReasoningTask(root, {
          task_id: prepared.task_id,
          request_sha256: prepared.request_sha256,
          offset: 0,
          limit: 1,
        })
        if (task.status === "reasoning_pending")
          observe("luna", "pending", { input_bytes: inputBytes }, provenance)
        observe("semantic_task", "pending", { input_bytes: inputBytes }, provenance)
      }
      tasks.push({ event_id: row.event_id, ...prepared })
    }
    const latest = loadInventory(root, workflowId)
    return {
      workflow_id: workflowId,
      inventory_sha256: latest.inventory.inventory_sha256,
      status_counts: counts(root, workflowId, latest.inventory),
      prepared: tasks.length,
      tasks,
      ...(selectedEventIds
        ? { selected_event_ids: selectedEventIds, selected_ready_count: selected.length }
        : {}),
      ...(expansion.fullRegistryEventIds.length
        ? {
            full_registry_event_ids: expansion.fullRegistryEventIds,
            full_registry_review_refs: expansion.fullRegistryReviewRefs,
          }
        : {}),
      next_offset: page.next_offset,
      candidate_retrieval,
      candidate_published: false,
    }
  })
}

function validateProposal(output, approval, article, concepts, candidateSelection) {
  assertSchema(output, outputSchema, "$semantic_review_output")
  if (output.event_id !== article.event_id)
    throw Error("Semantic result belongs to another article")
  if (
    (output.outcome === "reviewed_none" && output.links.length) ||
    (output.outcome === "reviewed_links" && !output.links.length)
  )
    throw Error("Reviewed relation outcome and link set disagree")
  const ids = new Set(concepts.concepts.map((concept) => concept.concept_id)),
    selectedIds = new Set(candidateSelection.candidate_ids),
    claims = new Map(approval.claims.map((claim) => [claim.claim_id, claim])),
    publicIds = publicClaimIds(approval.draft),
    links = new Set()
  const verifyEvidence = (claimIds, required) => {
    if (required && !claimIds.length)
      throw Error("Confirmed semantic relation requires article claim evidence")
    if (new Set(claimIds).size !== claimIds.length)
      throw Error("Distinct relation evidence claims required")
    for (const claimId of claimIds) {
      const claim = claims.get(claimId)
      if (!claim || !publicIds.has(claimId) || claim.review?.status !== "verified")
        throw Error("Semantic relation cites a claim not verified in public prose")
      assertVerifiedClaim(claim, approval.parses)
    }
  }
  for (const link of output.links) {
    if (
      !ids.has(link.concept_id) ||
      !selectedIds.has(link.concept_id) ||
      links.has(link.concept_id)
    )
      throw Error("Semantic relation must select a distinct existing concept")
    links.add(link.concept_id)
    verifyEvidence(link.evidence_claim_ids, true)
  }
  for (const candidate of output.relation_candidates) {
    if (
      !ids.has(candidate.concept_id) ||
      !selectedIds.has(candidate.concept_id) ||
      links.has(candidate.concept_id)
    )
      throw Error("Indirect relation candidate must be distinct and use an existing concept")
    links.add(candidate.concept_id)
    verifyEvidence(candidate.evidence_claim_ids, true)
  }
  for (const candidate of output.concept_candidates)
    verifyEvidence(candidate.evidence_claim_ids, true)
  const keywords = new Set()
  for (const candidate of output.keyword_candidates) {
    const key = candidate.keyword.normalize("NFKC").toLocaleLowerCase("en").trim()
    if (keywords.has(key)) throw Error("Article keyword candidate must be distinct")
    keywords.add(key)
    verifyEvidence(candidate.evidence_claim_ids, true)
  }
  return output
}

function receiptPath(workflowId, row) {
  return base(workflowId) + `receipts/${row.event_id}-${row.semantic_input_sha256}.json`
}

function readFullReasoningRequest(root, prepared) {
  let offset = 0
  const chunks = []
  while (true) {
    const page = readReasoningTask(root, {
      task_id: prepared.task_id,
      request_sha256: prepared.request_sha256,
      offset,
      limit: 64000,
    })
    if (
      page.offset !== offset ||
      page.task_id !== prepared.task_id ||
      page.request_sha256 !== prepared.request_sha256 ||
      page.requested_model !== prepared.requested_model ||
      page.requested_thinking !== prepared.requested_thinking
    )
      throw Error("Reasoning request page binding changed")
    chunks.push(page.chunk)
    if (page.next_offset === null) return { page, request: JSON.parse(chunks.join("")) }
    if (page.next_offset <= offset) throw Error("Reasoning request pagination did not advance")
    offset = page.next_offset
  }
}

function assertSemanticRequestBinding(request, row, prepared) {
  if (
    request.role !== "evidence_compare" ||
    request.binding?.settings?.provider !== "codex" ||
    request.binding?.settings?.model !== prepared.requested_model ||
    prepared.requested_model !== "gpt-6-luna" ||
    request.binding?.settings?.think !== prepared.requested_thinking ||
    request.binding?.policy_sha256 !== row.policy_sha256 ||
    request.binding?.approval_run !== row.approved_run ||
    request.binding?.approval_files_sha256 !== row.approval_files_sha256 ||
    request.binding?.concept_registry_sha256 !== row.concept_registry_sha256 ||
    request.binding?.candidate_selection_sha256 !== row.candidate_selection_sha256 ||
    request.binding?.approval_selection_sha256 !== row.approval_selection_sha256 ||
    sha256(JSON.stringify(request.input)) !== row.semantic_input_sha256 ||
    JSON.stringify(request.input.schema) !== JSON.stringify(outputSchema)
  )
    throw Error("Reasoning request no longer matches the frozen semantic article and policy")
}

function exactSemanticResult(root, row, prepared, readback) {
  const result = readJSON(root, `reasoning-tasks/${prepared.task_id}/result.json`)
  if (
    !result ||
    result.executor !== "codex" ||
    result.model !== "gpt-6-luna" ||
    result.attribution !== "caller_declared" ||
    result.public_approved !== false ||
    result.task_id !== prepared.task_id ||
    result.request_sha256 !== prepared.request_sha256 ||
    readback.result?.result_sha256 !== result.result_sha256
  )
    throw Error("Exact Codex gpt-6-luna reasoning result required")
  return result
}

function semanticReceipt(
  root,
  workflowId,
  row,
  article,
  concepts,
  prepared,
  vault,
  { requireExisting = false } = {},
) {
  const file = receiptPath(workflowId, row),
    existing = readJSON(root, file)
  if (requireExisting && !existing)
    throw Error("Completed review requires its existing immutable semantic receipt")
  const { page: readback, request } = readFullReasoningRequest(root, prepared)
  if (readback.status !== "completed") return null
  assertSemanticRequestBinding(request, row, prepared)
  const result = exactSemanticResult(root, row, prepared, readback)
  const approval = loadApprovedOntologyInput(root, row.approved_run, { vault }),
    candidateSelection = readCandidateSelection(
      root,
      workflowId,
      article,
      row.approval_files_sha256,
      concepts,
    ),
    output = validateProposal(result.output, approval, article, concepts, candidateSelection),
    conceptById = new Map(concepts.concepts.map((concept) => [concept.concept_id, concept])),
    links = output.links.map((link) => {
      const concept = conceptById.get(link.concept_id)
      return {
        concept_id: link.concept_id,
        role: link.role,
        reason: link.reason,
        evidence_claim_ids: link.evidence_claim_ids,
        concept_path: concept.path,
        concept_sha256: concept.sha256,
      }
    })
  if (existing) {
    const { receipt_sha256, ...body } = existing
    if (
      receipt_sha256 !== sha256(JSON.stringify(body)) ||
      existing.schema !== ARTICLE_SEMANTIC_REVIEW_SCHEMA ||
      existing.event_id !== row.event_id ||
      existing.semantic_input_sha256 !== row.semantic_input_sha256 ||
      existing.task_id !== prepared.task_id ||
      existing.request_sha256 !== prepared.request_sha256 ||
      existing.result_sha256 !== result.result_sha256 ||
      existing.status !== output.outcome ||
      JSON.stringify(existing.links) !== JSON.stringify(links) ||
      JSON.stringify(existing.output) !== JSON.stringify(output) ||
      existing.workflow_id !== workflowId ||
      existing.reviewed_at !== result.submitted_at ||
      existing.executor !== result.executor ||
      existing.model !== result.model ||
      existing.article_public_sha256 !== row.article_public_sha256 ||
      existing.approval_files_sha256 !== row.approval_files_sha256 ||
      existing.concept_registry_sha256 !== row.concept_registry_sha256 ||
      existing.candidate_selection_sha256 !== row.candidate_selection_sha256
    )
      throw Error("Semantic review receipt differs from its exact reasoning result")
    return existing
  }
  const receipt = {
    schema: ARTICLE_SEMANTIC_REVIEW_SCHEMA,
    workflow_id: workflowId,
    event_id: row.event_id,
    status: output.outcome,
    reviewed_at: result.submitted_at,
    review_reason: output.review_reason,
    semantic_input_sha256: row.semantic_input_sha256,
    article_public_sha256: row.article_public_sha256,
    approval_files_sha256: row.approval_files_sha256,
    concept_registry_sha256: row.concept_registry_sha256,
    candidate_selection_sha256: row.candidate_selection_sha256,
    task_id: prepared.task_id,
    request_sha256: prepared.request_sha256,
    result_sha256: result.result_sha256,
    executor: result.executor,
    model: result.model,
    links,
    relation_candidates: output.relation_candidates,
    concept_candidates: output.concept_candidates,
    output,
  }
  const complete = {
    ...receipt,
    receipt_sha256: sha256(JSON.stringify(receipt)),
  }
  atomicCreate(root, file, complete)
  return complete
}

function assertReceipt(root, workflowId, row, receipt, prepared) {
  if (!receipt) return null
  const { receipt_sha256, ...body } = receipt
  if (
    receipt_sha256 !== sha256(JSON.stringify(body)) ||
    receipt.schema !== ARTICLE_SEMANTIC_REVIEW_SCHEMA ||
    receipt.workflow_id !== workflowId ||
    receipt.event_id !== row.event_id ||
    receipt.semantic_input_sha256 !== row.semantic_input_sha256 ||
    receipt.article_public_sha256 !== row.article_public_sha256 ||
    receipt.approval_files_sha256 !== row.approval_files_sha256 ||
    receipt.concept_registry_sha256 !== row.concept_registry_sha256 ||
    receipt.candidate_selection_sha256 !== row.candidate_selection_sha256 ||
    receipt.task_id !== prepared.task_id ||
    receipt.request_sha256 !== prepared.request_sha256 ||
    !["reviewed_links", "reviewed_none"].includes(receipt.status)
  )
    throw Error("Semantic review receipt binding changed")
  return receipt
}

function preparedFor(root, workflowId, row) {
  const prepared = readJSON(root, `${base(workflowId)}prepared/${row.event_id}.json`)
  if (!prepared) return null
  if (
    prepared.schema !== "research-article-semantic-review-prepared/v2" ||
    prepared.workflow_id !== workflowId ||
    prepared.event_id !== row.event_id ||
    prepared.approved_run !== row.approved_run ||
    prepared.semantic_input_sha256 !== row.semantic_input_sha256 ||
    prepared.candidate_selection_sha256 !== row.candidate_selection_sha256 ||
    prepared.approval_selection_sha256 !== row.approval_selection_sha256 ||
    prepared.requested_model !== "gpt-6-luna" ||
    !/^reasoning-[a-f0-9]{64}$/.test(prepared.task_id || "") ||
    !/^[a-f0-9]{64}$/.test(prepared.request_sha256 || "")
  )
    throw Error("Prepared semantic reasoning task does not match the frozen article")
  const retryRelative = `${base(workflowId)}retry-attempts/${row.event_id}`,
    retryDirectory = safePath(root, retryRelative, { materialize: false })
  let active = prepared
  if (fs.existsSync(retryDirectory)) {
    const entries = fs.readdirSync(retryDirectory, { withFileTypes: true })
    if (entries.some((entry) => entry.isSymbolicLink() || !entry.isFile()))
      throw Error("Unexpected semantic retry artifact")
    const files = entries.map((entry) => entry.name).sort((a, b) => a.localeCompare(b, "en"))
    if (files.some((name) => !/^attempt-[0-9]{4}\.json$/.test(name)))
      throw Error("Unexpected semantic retry artifact")
    if (files.length) {
      const original = readFullReasoningRequest(root, prepared).request
      for (let index = 0; index < files.length; index++) {
        const attemptNumber = index + 1,
          relative = `${retryRelative}/${files[index]}`,
          retry = readJSON(root, relative),
          { retry_sha256: retrySha, ...retryBody } = retry || {},
          expectedName = `attempt-${String(attemptNumber).padStart(4, "0")}.json`
        if (
          files[index] !== expectedName ||
          retrySha !== sha256(JSON.stringify(retryBody)) ||
          retry.schema !== "research-article-semantic-review-retry/v1" ||
          retry.workflow_id !== workflowId ||
          retry.event_id !== row.event_id ||
          retry.attempt_number !== attemptNumber ||
          retry.original_task_id !== prepared.task_id ||
          retry.original_request_sha256 !== prepared.request_sha256 ||
          retry.prior_task_id !== active.task_id ||
          retry.prior_request_sha256 !== active.request_sha256 ||
          !/^reasoning-[a-f0-9]{64}$/.test(retry.task_id || "") ||
          !/^[a-f0-9]{64}$/.test(retry.request_sha256 || "")
        )
          throw Error("Semantic retry chain does not match its immutable predecessor")
        const next = {
            ...prepared,
            task_id: retry.task_id,
            request_sha256: retry.request_sha256,
            attempt_number: attemptNumber,
          },
          { page, request } = readFullReasoningRequest(root, next)
        if (
          page.task_id !== retry.task_id ||
          request.run !== `${original.run}-retry-${attemptNumber}` ||
          request.role !== original.role ||
          JSON.stringify(request.binding) !== JSON.stringify(original.binding) ||
          JSON.stringify(request.input) !== JSON.stringify(original.input) ||
          retry.requested_model !== next.requested_model ||
          retry.requested_thinking !== next.requested_thinking
        )
          throw Error("Semantic retry changed the frozen article, policy, or model request")
        active = next
      }
    }
  }
  const rowMatchesOriginal =
      row.task_id === prepared.task_id && row.request_sha256 === prepared.request_sha256,
    rowMatchesActive =
      row.task_id === active.task_id && row.request_sha256 === active.request_sha256
  if (!rowMatchesOriginal && !rowMatchesActive)
    throw Error("Prepared semantic reasoning task does not match the frozen article")
  return active
}

function workflowState(root, workflowId, inventory) {
  const result = {
    total: inventory.items.length,
    ready: 0,
    waiting_for_reasoning: 0,
    result_ready: 0,
    reviewed_links: 0,
    reviewed_none: 0,
    waiting_for_storage: 0,
    blocked: 0,
  }
  for (const row of inventory.items) {
    if (row.status !== "ready") {
      result[row.status] = (result[row.status] || 0) + 1
      continue
    }
    const prepared = preparedFor(root, workflowId, row)
    if (!prepared) {
      result.ready += 1
      continue
    }
    const receipt = readJSON(root, receiptPath(workflowId, row))
    if (receipt) {
      assertReceipt(root, workflowId, row, receipt, prepared)
      result[receipt.status] += 1
      continue
    }
    const pending = readReasoningTask(root, {
      task_id: prepared.task_id,
      request_sha256: prepared.request_sha256,
      offset: 0,
      limit: 1,
    })
    if (pending.status === "reasoning_pending") result.waiting_for_reasoning += 1
    else result.result_ready += 1
  }
  return result
}

function completedItemReceiptRef(root, workflowId, row) {
  if (row.reused_receipt_ref) return row.reused_receipt_ref
  const prior = row.reused_index_review
  return reference(root, receiptPath(prior?.workflow_id || workflowId, prior || row))
}

export function articleSemanticReviewStatus({
  root,
  vault = "vault",
  repo = path.resolve(vault, ".."),
  policyFile = path.join(repo, "data/research-model-policy-codex.json"),
  workflowId,
  offset = 0,
  limit = 100,
}) {
  const saved = loadInventory(root, workflowId)
  if (!saved)
    return {
      workflow_id: workflowId,
      status: "not_started",
      items: [],
      next_offset: null,
      metrics: summarizeSemanticObservations(
        readSemanticObservations({ root, workflow_id: workflowId }),
      ),
    }
  const current = assertSameInventory(root, vault, workflowId, saved.inventory, repo, policyFile),
    page = indexPage(current.items, offset, limit),
    items = page.items.map((row) => {
      if (row.status !== "ready")
        return ["reviewed_links", "reviewed_none"].includes(row.status)
          ? { ...row, receipt_ref: completedItemReceiptRef(root, workflowId, row) }
          : row
      const prepared = preparedFor(root, workflowId, row)
      if (!prepared) return row
      const receipt = readJSON(root, receiptPath(workflowId, row))
      if (receipt) {
        assertReceipt(root, workflowId, row, receipt, prepared)
        return {
          event_id: row.event_id,
          status: receipt.status,
          task_id: prepared.task_id,
          receipt_ref: completedItemReceiptRef(root, workflowId, row),
        }
      }
      const reasoning = readReasoningTask(root, {
        task_id: prepared.task_id,
        request_sha256: prepared.request_sha256,
        offset: 0,
        limit: 1,
      })
      return {
        event_id: row.event_id,
        status: reasoning.status === "completed" ? "result_ready" : reasoning.status,
        task_id: prepared.task_id,
        request_sha256: prepared.request_sha256,
      }
    }),
    statusCounts = workflowState(root, workflowId, current),
    pending =
      items.find((row) =>
        ["ready", "result_ready", "reasoning_pending", "waiting_for_reasoning"].includes(
          row.status,
        ),
      ) || items.find((row) => !["reviewed_links", "reviewed_none"].includes(row.status))
  let nextAction
  if (pending?.status === "ready")
    nextAction = {
      module: "knowledge",
      operation: "semantic_prepare",
      parameters: { workflow_id: workflowId, event_ids: [pending.event_id], limit: 20 },
    }
  else if (pending?.status === "result_ready")
    nextAction = {
      module: "knowledge",
      operation: "semantic_resume",
      parameters: {
        workflow_id: workflowId,
        offset: current.items
          .filter((row) => row.status === "ready")
          .findIndex((row) => row.event_id === pending.event_id),
        limit: 20,
      },
    }
  else if (["reasoning_pending", "waiting_for_reasoning"].includes(pending?.status))
    nextAction = {
      action: "read_exact_reasoning_task",
      task_id: pending.task_id,
      request_sha256: pending.request_sha256,
    }
  else if (pending && page.next_offset === null)
    nextAction = {
      action:
        pending.status === "waiting_for_storage"
          ? "hydrate_exact_native_evidence_then_new_workflow"
          : "review_exact_native_approval_binding",
      ...pending,
    }
  else
    nextAction =
      statusCounts.reviewed_links + statusCounts.reviewed_none === statusCounts.total
        ? {
            module: "knowledge",
            operation: "semantic_export",
            parameters: { workflow_id: workflowId },
          }
        : {
            module: "knowledge",
            operation: "semantic_status",
            parameters: { workflow_id: workflowId, offset: page.next_offset ?? 0, limit },
          }
  return {
    workflow_id: workflowId,
    inventory_sha256: current.inventory_sha256,
    status_counts: statusCounts,
    items,
    next_offset: page.next_offset,
    next_action: nextAction,
    metrics: summarizeSemanticObservations(
      readSemanticObservations({ root, workflow_id: workflowId }),
    ),
  }
}

const retryableProposalErrors = new Set([
  "Semantic result belongs to another article",
  "Reviewed relation outcome and link set disagree",
  "Semantic relation must select a distinct existing concept",
  "Indirect relation candidate must be distinct and use an existing concept",
  "Semantic relation cites a claim not verified in public prose",
  "Distinct relation evidence claims required",
])

export async function retryInvalidArticleSemanticReview({
  root,
  vault = "vault",
  repo,
  policyFile = path.join(repo, "data/research-model-policy-codex.json"),
  workflowId,
  eventId,
  gateReader = readOperationGate,
}) {
  updateGate(repo, gateReader)
  return withLock(root, "article-semantic-" + workflowId, async () => {
    updateGate(repo, gateReader)
    const saved = loadInventory(root, workflowId)
    if (!saved) throw Error("Semantic review inventory must be prepared first")
    const derived = {},
      inventory = assertSameInventory(
        root,
        vault,
        workflowId,
        saved.inventory,
        repo,
        policyFile,
        derived,
      ),
      row = inventory.items.find((item) => item.event_id === eventId)
    if (!row || row.status !== "ready")
      throw Error("Semantic retry requires a ready article in the frozen inventory")
    const originalPrepared = readJSON(root, `${base(workflowId)}prepared/${eventId}.json`),
      prepared = preparedFor(root, workflowId, row)
    if (!originalPrepared || !prepared)
      throw Error("Semantic retry requires the article's exact prepared reasoning task")
    const existingReceipt = readJSON(root, receiptPath(workflowId, row))
    if (existingReceipt) {
      assertReceipt(root, workflowId, row, existingReceipt, prepared)
      return {
        workflow_id: workflowId,
        event_id: eventId,
        status: existingReceipt.status,
        task_id: prepared.task_id,
        retried: false,
      }
    }
    const { page, request } = readFullReasoningRequest(root, prepared)
    if (page.status !== "completed")
      return {
        workflow_id: workflowId,
        event_id: eventId,
        status: "waiting_for_reasoning",
        task_id: prepared.task_id,
        request_sha256: prepared.request_sha256,
        retried: false,
      }
    assertSemanticRequestBinding(request, row, prepared)
    const result = exactSemanticResult(root, row, prepared, page),
      article = derived.articlesByEvent.get(eventId),
      concepts = conceptSnapshot(vault)
    if (
      !article ||
      article.article_sha256 !== row.article_sha256 ||
      concepts.sha256 !== row.concept_registry_sha256
    )
      throw Error("Semantic retry inputs changed after the frozen inventory")
    const approval = loadApprovedOntologyInput(root, row.approved_run, { vault }),
      candidateSelection = readCandidateSelection(
        root,
        workflowId,
        article,
        row.approval_files_sha256,
        concepts,
      )
    let failureMessage
    try {
      validateProposal(result.output, approval, article, concepts, candidateSelection)
    } catch (error) {
      if (!retryableProposalErrors.has(error.message))
        throw Error("Immutable semantic result is not safely retryable: " + error.message)
      failureMessage = error.message
    }
    if (!failureMessage)
      return {
        workflow_id: workflowId,
        event_id: eventId,
        status: "result_ready",
        task_id: prepared.task_id,
        request_sha256: prepared.request_sha256,
        retried: false,
      }
    const attemptNumber = (prepared.attempt_number || 0) + 1
    if (attemptNumber > 3)
      throw Error("Semantic retry limit reached; preserve all attempts for manual diagnosis")
    const originalRequest = readFullReasoningRequest(root, originalPrepared).request,
      retryRequest = createReasoningTask(root, {
        run: `${originalRequest.run}-retry-${attemptNumber}`,
        role: originalRequest.role,
        binding: originalRequest.binding,
        input: originalRequest.input,
      })
    if (
      retryRequest.role !== originalRequest.role ||
      JSON.stringify(retryRequest.binding) !== JSON.stringify(originalRequest.binding) ||
      JSON.stringify(retryRequest.input) !== JSON.stringify(originalRequest.input)
    )
      throw Error("New semantic task does not preserve the original request binding")
    const retryBody = {
        schema: "research-article-semantic-review-retry/v1",
        workflow_id: workflowId,
        event_id: eventId,
        attempt_number: attemptNumber,
        original_task_id: originalPrepared.task_id,
        original_request_sha256: originalPrepared.request_sha256,
        prior_task_id: prepared.task_id,
        prior_request_sha256: prepared.request_sha256,
        task_id: retryRequest.task_id,
        request_sha256: retryRequest.request_sha256,
        requested_model: prepared.requested_model,
        requested_thinking: prepared.requested_thinking,
        failure_message: failureMessage,
        recorded_at: new Date().toISOString(),
      },
      retry = {
        ...retryBody,
        retry_sha256: sha256(JSON.stringify(retryBody)),
      }
    atomicCreate(
      root,
      `${base(workflowId)}retry-attempts/${eventId}/attempt-${String(attemptNumber).padStart(4, "0")}.json`,
      retry,
    )
    const observe = semanticMetricsContext({
        root,
        repo,
        policyFile,
        workflowId,
        concepts: conceptSnapshot(vault),
        inventorySha: inventory.inventory_sha256,
        retrievalPolicySha: inventory.retrieval_policy_sha256,
      }),
      retryProvenance = semanticTaskProvenance(row, retryRequest),
      inputBytes = Buffer.byteLength(JSON.stringify(originalRequest.input))
    observe("semantic_task", "failure", {}, semanticTaskProvenance(row, prepared))
    observe("luna", "pending", { input_bytes: inputBytes }, retryProvenance)
    observe("semantic_task", "pending", { input_bytes: inputBytes }, retryProvenance)
    return {
      workflow_id: workflowId,
      event_id: eventId,
      status: "waiting_for_reasoning",
      attempt_number: attemptNumber,
      previous_task_id: prepared.task_id,
      task_id: retryRequest.task_id,
      request_sha256: retryRequest.request_sha256,
      requested_model: prepared.requested_model,
      requested_thinking: prepared.requested_thinking,
      failure_message: failureMessage,
      retried: true,
    }
  })
}

export async function resumeArticleSemanticReviews({
  root,
  vault = "vault",
  repo,
  policyFile = path.join(repo, "data/research-model-policy-codex.json"),
  workflowId,
  offset = 0,
  limit = 20,
  gateReader = readOperationGate,
}) {
  updateGate(repo, gateReader)
  return withLock(root, "article-semantic-" + workflowId, async () => {
    updateGate(repo, gateReader)
    const saved = loadInventory(root, workflowId)
    if (!saved) throw Error("Semantic review inventory must be prepared first")
    const derived = {},
      inventory = assertSameInventory(
        root,
        vault,
        workflowId,
        saved.inventory,
        repo,
        policyFile,
        derived,
      ),
      ready = inventory.items.filter((row) => row.status === "ready"),
      page = indexPage(ready, offset, limit),
      concepts = conceptSnapshot(vault),
      completed = []
    const observe = semanticMetricsContext({
      root,
      repo,
      policyFile,
      workflowId,
      concepts,
      inventorySha: inventory.inventory_sha256,
      retrievalPolicySha: inventory.retrieval_policy_sha256,
    })
    for (const row of page.items) {
      const prepared = preparedFor(root, workflowId, row)
      if (!prepared) continue
      const article = derived.articlesByEvent.get(row.event_id)
      if (!article || article.article_sha256 !== row.article_sha256)
        throw Error("Public article changed after semantic inventory")
      const previousReceipt = readJSON(root, receiptPath(workflowId, row))
      let receipt
      try {
        receipt = semanticReceipt(root, workflowId, row, article, concepts, prepared, vault)
      } catch (error) {
        observe("semantic_task", "failure", {}, semanticTaskProvenance(row, prepared))
        throw error
      }
      if (receipt && !previousReceipt) {
        const provenance = {
          ...semanticTaskProvenance(row, prepared),
          result_sha256: receipt.result_sha256,
          model: receipt.model,
          executor: receipt.executor,
        }
        observe("luna", "completed", {}, provenance)
        observe("semantic_task", "completed", {}, provenance)
      }
      if (receipt)
        completed.push({
          event_id: row.event_id,
          status: receipt.status,
          receipt_ref: completedItemReceiptRef(root, workflowId, row),
        })
    }
    const latest = loadInventory(root, workflowId)
    return {
      workflow_id: workflowId,
      inventory_sha256: latest.inventory.inventory_sha256,
      status_counts: workflowState(root, workflowId, latest.inventory),
      completed,
      next_offset: page.next_offset,
      candidate_published: false,
    }
  })
}

export async function exportArticleSemanticReviewIndex({
  root,
  vault = "vault",
  repo,
  policyFile = path.join(repo, "data/research-model-policy-codex.json"),
  workflowId,
  gateReader = readOperationGate,
}) {
  updateGate(repo, gateReader)
  return withLock(root, "article-semantic-" + workflowId, async () => {
    updateGate(repo, gateReader)
    const saved = loadInventory(root, workflowId)
    if (!saved) throw Error("Semantic review inventory must be prepared first")
    const derived = {},
      inventory = assertSameInventory(
        root,
        vault,
        workflowId,
        saved.inventory,
        repo,
        policyFile,
        derived,
      )
    if (
      inventory.items.some(
        (row) => !["ready", "reviewed_links", "reviewed_none"].includes(row.status),
      )
    )
      throw Error("Complete every article's exact native approval/storage review before export")
    const concepts = conceptSnapshot(vault),
      reviews = []
    for (const row of inventory.items) {
      if (row.reused_index_review || row.reused_receipt_review) {
        reviews.push(row.reused_index_review || row.reused_receipt_review)
        continue
      }
      const prepared = preparedFor(root, workflowId, row)
      if (!prepared) throw Error("Every public article needs a completed semantic review")
      const article = derived.articlesByEvent.get(row.event_id)
      if (!article || article.article_sha256 !== row.article_sha256)
        throw Error("Public article changed after semantic inventory")
      const receipt = semanticReceipt(root, workflowId, row, article, concepts, prepared, vault)
      if (!receipt) throw Error("Semantic reasoning is still waiting for the exact Codex result")
      const conceptById = new Map(
          concepts.concepts.map((concept) => [concept.concept_id, concept]),
        ),
        links = receipt.links.map((link) => {
          const concept = conceptById.get(link.concept_id)
          if (
            !concept ||
            concept.path !== link.concept_path ||
            concept.sha256 !== link.concept_sha256
          )
            throw Error("Current reviewed concept bytes differ from the semantic receipt")
          return link
        })
      reviews.push(
        indexReviewForReceipt(
          workflowId,
          row,
          { ...receipt, links },
          sha256(fs.readFileSync(safePath(root, receiptPath(workflowId, row)))),
        ),
      )
    }
    const index = assertArticleSemanticReviewIndex({
        schema: ARTICLE_SEMANTIC_INDEX_SCHEMA,
        reviews: reviews.sort((a, b) => a.event_id.localeCompare(b.event_id, "en")),
      }),
      bytes = JSON.stringify(index, null, 2) + "\n",
      relative = "data/article-semantic-review-index.json",
      target = safePath(repo, relative),
      digest = sha256(bytes),
      exportPath = `${base(workflowId)}exports/${digest}.json`
    return withLock(root, "article-semantic-index", async () => {
      let before = null
      if (fs.existsSync(target)) {
        before = fs.readFileSync(target)
        assertArticleSemanticReviewIndex(JSON.parse(before.toString("utf8")))
      }
      if (!readJSON(root, exportPath)) atomicCreate(root, exportPath, bytes)
      else if (sha256(fs.readFileSync(safePath(root, exportPath))) !== digest)
        throw Error("Semantic index export snapshot changed")
      if (before && sha256(before) !== digest) {
        const archivePath = `${base(workflowId)}exports/prior-${sha256(before)}.json`
        if (!readJSON(root, archivePath)) atomicCreate(root, archivePath, before)
        atomicWrite(repo, relative, bytes)
      } else if (!before) atomicCreate(repo, relative, bytes)
      const readback = fs.readFileSync(target)
      if (sha256(readback) !== digest) throw Error("Semantic review index write readback mismatch")
      return {
        workflow_id: workflowId,
        path: relative,
        sha256: digest,
        articles: index.reviews.length,
        status_counts: workflowState(root, workflowId, inventory),
        candidate_published: false,
      }
    })
  })
}
