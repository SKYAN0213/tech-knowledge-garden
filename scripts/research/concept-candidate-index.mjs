import { sha256 } from "./contracts.mjs"

export const CONCEPT_CANDIDATE_INDEX_SCHEMA = "semantic-concept-candidate-index/v1"
export const CONCEPT_CANDIDATE_EVALUATION_SCHEMA = "semantic-concept-retrieval-evaluation/v3"
export const CONCEPT_CANDIDATE_SELECTION_SCHEMA = "semantic-concept-candidate-selection/v1"
export const CONCEPT_RETRIEVAL_VERSION = "hybrid-lexical-qwen-rrf/v2"
export const DEFAULT_CONCEPT_EMBEDDING_MODEL = "qwen3-embedding:8b"
export const DEFAULT_CONCEPT_CANDIDATE_LIMIT = 12
export const DEFAULT_MINIMUM_MEDIAN_CONCEPT_PAYLOAD_REDUCTION = 0.6
export const DEFAULT_RRF_K = 60
export const CONCEPT_TOKENIZER_VERSION = "unicode-hangul-ngram/v1"

const hashPattern = /^[a-f0-9]{64}$/
const conceptIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const nonempty = (value) => typeof value === "string" && !!value.trim()
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

function exactName(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenize(value) {
  const tokens = new Set()
  for (const word of normalize(value).match(/[\p{L}\p{N}]+/gu) || []) {
    if (word.length > 1) tokens.add(word)
    if (/\p{Script=Hangul}/u.test(word)) {
      const chars = [...word]
      for (let size of [2, 3])
        for (let offset = 0; offset + size <= chars.length; offset++)
          tokens.add("#" + chars.slice(offset, offset + size).join(""))
    }
  }
  return [...tokens]
}

function normalizedVector(vector, dimensions) {
  if (
    !Array.isArray(vector) ||
    vector.length < 2 ||
    (dimensions !== undefined && vector.length !== dimensions) ||
    vector.some((value) => !Number.isFinite(value))
  )
    throw Error("Finite, dimension-consistent concept embedding required")
  const norm = Math.hypot(...vector)
  if (!Number.isFinite(norm) || norm === 0) throw Error("Non-zero concept embedding required")
  return vector.map((value) => value / norm)
}

export function conceptCandidateProfile(concept) {
  const fields = [
    concept.title,
    concept.label,
    ...(concept.aliases || []),
    ...(concept.keywords || []),
    concept.definition,
    concept.reason,
    concept.kind,
  ].filter(nonempty)
  return [...new Set(fields.map((value) => value.trim()))].join("\n")
}

export function buildConceptCandidateIndex(
  concepts,
  {
    concept_registry_sha256,
    embedding_model = DEFAULT_CONCEPT_EMBEDDING_MODEL,
    embedding_digest,
    retrieval_policy_sha256,
    embeddings,
    tokenizer_version = CONCEPT_TOKENIZER_VERSION,
    retrieval_version = CONCEPT_RETRIEVAL_VERSION,
  },
) {
  if (
    !Array.isArray(concepts) ||
    !concepts.length ||
    !hashPattern.test(concept_registry_sha256 || "") ||
    !nonempty(embedding_model) ||
    !hashPattern.test(embedding_digest || "") ||
    !hashPattern.test(retrieval_policy_sha256 || "") ||
    !Array.isArray(embeddings) ||
    embeddings.length !== concepts.length ||
    tokenizer_version !== CONCEPT_TOKENIZER_VERSION ||
    retrieval_version !== CONCEPT_RETRIEVAL_VERSION
  )
    throw Error("Exact reviewed concepts, pinned embedding and retrieval versions required")
  const dimensions = embeddings[0]?.length,
    ids = new Set(),
    documents = concepts.map((concept, index) => {
      if (!conceptIdPattern.test(concept.concept_id || "") || ids.has(concept.concept_id))
        throw Error("Distinct reviewed concept IDs required for retrieval index")
      if (!nonempty(concept.label) || !nonempty(concept.definition))
        throw Error("Reviewed concept label and definition required for retrieval index")
      ids.add(concept.concept_id)
      const profile = conceptCandidateProfile(concept)
      if (!profile) throw Error("Non-empty reviewed concept profile required")
      return {
        concept_id: concept.concept_id,
        profile_sha256: sha256(profile),
        tokens: tokenize(profile),
        exact_names: [
          ...new Set(
            [concept.title, concept.label, ...(concept.aliases || [])]
              .filter(nonempty)
              .map((value) => exactName(value))
              .filter(Boolean),
          ),
        ],
        embedding: normalizedVector(embeddings[index], dimensions),
      }
    })
  const body = {
    schema: CONCEPT_CANDIDATE_INDEX_SCHEMA,
    retrieval_version,
    tokenizer_version,
    concept_registry_sha256,
    embedding_model,
    embedding_digest,
    retrieval_policy_sha256,
    embedding_dimensions: dimensions,
    concept_count: documents.length,
    documents,
  }
  return { ...body, index_sha256: sha256(JSON.stringify(body)) }
}

export function assertConceptCandidateIndex(
  index,
  {
    concept_registry_sha256,
    embedding_model,
    embedding_digest,
    embedding_dimensions,
    retrieval_policy_sha256,
  } = {},
) {
  if (
    !index ||
    index.schema !== CONCEPT_CANDIDATE_INDEX_SCHEMA ||
    index.retrieval_version !== CONCEPT_RETRIEVAL_VERSION ||
    index.tokenizer_version !== CONCEPT_TOKENIZER_VERSION ||
    !hashPattern.test(index.concept_registry_sha256 || "") ||
    (concept_registry_sha256 && index.concept_registry_sha256 !== concept_registry_sha256) ||
    !nonempty(index.embedding_model) ||
    (embedding_model && index.embedding_model !== embedding_model) ||
    !hashPattern.test(index.embedding_digest || "") ||
    !hashPattern.test(index.retrieval_policy_sha256 || "") ||
    (embedding_digest && index.embedding_digest !== embedding_digest) ||
    (retrieval_policy_sha256 && index.retrieval_policy_sha256 !== retrieval_policy_sha256) ||
    !Number.isInteger(index.embedding_dimensions) ||
    index.embedding_dimensions < 2 ||
    (embedding_dimensions !== undefined && index.embedding_dimensions !== embedding_dimensions) ||
    !Number.isSafeInteger(index.concept_count) ||
    index.concept_count < 1 ||
    index.concept_count !== index.documents?.length ||
    !Array.isArray(index.documents) ||
    !hashPattern.test(index.index_sha256 || "")
  )
    throw Error("Semantic concept candidate index identity changed")
  const { index_sha256, ...body } = index
  if (index_sha256 !== sha256(JSON.stringify(body)))
    throw Error("Semantic concept candidate index checksum mismatch")
  const ids = new Set()
  for (const document of index.documents) {
    if (
      !conceptIdPattern.test(document.concept_id || "") ||
      ids.has(document.concept_id) ||
      !hashPattern.test(document.profile_sha256 || "") ||
      !Array.isArray(document.tokens) ||
      document.tokens.some((token) => !nonempty(token)) ||
      new Set(document.tokens).size !== document.tokens.length ||
      !Array.isArray(document.exact_names) ||
      !document.exact_names.length ||
      new Set(document.exact_names).size !== document.exact_names.length ||
      document.exact_names.some((name) => !nonempty(name) || exactName(name) !== name)
    )
      throw Error("Invalid or duplicate semantic concept index document")
    normalizedVector(document.embedding, index.embedding_dimensions)
    if (Math.abs(Math.hypot(...document.embedding) - 1) > 1e-10)
      throw Error("Normalized semantic concept index embedding required")
    ids.add(document.concept_id)
  }
  return index
}

function containsExactName(query, name) {
  const normalizedQuery = exactName(query),
    normalizedName = exactName(name)
  if (!normalizedQuery || !normalizedName) return false
  if (/[\p{Script=Latin}\p{N}]/u.test(normalizedName)) {
    const escaped = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    // Korean particles attach to Latin names without whitespace. Preserve
    // those occurrences while still excluding longer Latin words.
    const boundary = "[^\\p{L}\\p{N}]|\\p{Script=Hangul}"
    return new RegExp(`(?:^|${boundary})${escaped}(?=$|${boundary})`, "u").test(normalizedQuery)
  }
  return normalizedQuery.includes(normalizedName)
}

function lexicalScores(query, index) {
  const terms = tokenize(query),
    count = index.documents.length,
    docTerms = index.documents.map((document) => new Set(document.tokens)),
    averageLength = docTerms.reduce((sum, items) => sum + items.size, 0) / Math.max(count, 1),
    documentFrequency = new Map(),
    scores = new Map()
  for (const row of docTerms)
    for (const term of row) documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1)
  for (const [docIndex, document] of index.documents.entries()) {
    let score = 0
    for (const term of terms) {
      if (!docTerms[docIndex].has(term)) continue
      const df = documentFrequency.get(term) || 0,
        idf = Math.log(1 + (count - df + 0.5) / (df + 0.5)),
        tf = 1,
        length = docTerms[docIndex].size,
        k1 = 1.2,
        b = 0.75
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (length / averageLength || 0))))
    }
    if (score > 0) scores.set(document.concept_id, score)
  }
  return [...scores].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en"))
}

function cosine(left, right) {
  if (!Array.isArray(left) || left.length !== right.length || left.some((n) => !Number.isFinite(n)))
    throw Error("Query embedding does not match the pinned concept index")
  return left.reduce((sum, value, index) => sum + value * right[index], 0)
}

const goldSources = new Set(["native_reviewed_article_concepts_v2", "semantic_retrieval_review_v1"])
const challengeKinds = ["ambiguous", "homonym", "reviewed_none"]

function caseProvenance(item) {
  return {
    gold_source:
      item.gold_source === undefined ? "native_reviewed_article_concepts_v2" : item.gold_source,
    case_kind: item.case_kind === undefined ? "pilot" : item.case_kind,
    challenge_kind: item.challenge_kind ?? null,
  }
}

function reviewedIds(ids, concepts, { allowEmpty = false } = {}) {
  return (
    Array.isArray(ids) &&
    (allowEmpty || ids.length > 0) &&
    new Set(ids).size === ids.length &&
    ids.every((id) => concepts.has(id)) &&
    JSON.stringify(ids) === JSON.stringify([...ids].sort())
  )
}

function assertCaseGold(item, conceptIds, eventIds) {
  const provenance = caseProvenance(item || {}),
    reviewedNone =
      provenance.case_kind === "challenge" && provenance.challenge_kind === "reviewed_none"
  if (
    !item ||
    !/^[A-Za-z0-9_-]{1,160}$/.test(item.run || "") ||
    !/^[a-f0-9]{16}$/.test(item.event_id || "") ||
    eventIds.has(item.event_id) ||
    !nonempty(item.stratum) ||
    !goldSources.has(provenance.gold_source) ||
    !["pilot", "challenge"].includes(provenance.case_kind) ||
    (provenance.case_kind === "pilot"
      ? provenance.challenge_kind !== null
      : !challengeKinds.includes(provenance.challenge_kind)) ||
    [
      item.article_public_sha256,
      item.approval_files_sha256,
      item.concept_review_sha256,
      item.query_sha256,
    ].some((value) => !hashPattern.test(value || "")) ||
    !reviewedIds(item.relevant_concept_ids, conceptIds, { allowEmpty: reviewedNone }) ||
    (reviewedNone && item.relevant_concept_ids.length !== 0)
  )
    throw Error(
      "Each pilot article needs a distinct event, stratum and confirmed concept link; challenges require reviewed provenance",
    )
  eventIds.add(item.event_id)
  return provenance
}

export function conceptCandidateGoldSha256(item) {
  const relevant_concept_ids = [...new Set(item.relevant_concept_ids || [])].sort()
  return sha256(
    JSON.stringify({
      schema: "source-reviewed-semantic-retrieval-gold/v2",
      ...caseProvenance(item),
      run: item.run,
      event_id: item.event_id,
      article_public_sha256: item.article_public_sha256,
      approval_files_sha256: item.approval_files_sha256,
      concept_review_sha256: item.concept_review_sha256,
      query_sha256: item.query_sha256,
      query_embedding_sha256: item.query_embedding_sha256,
      relevant_concept_ids,
    }),
  )
}

function evaluationSummary(cases, challengeCases) {
  const rows = [...cases, ...challengeCases],
    strata = new Map(),
    kinds = new Set(challengeCases.map((row) => row.challenge_kind))
  for (const item of cases) strata.set(item.stratum, (strata.get(item.stratum) || 0) + 1)
  const confirmed = rows.reduce((sum, item) => sum + item.relevant_concept_ids.length, 0),
    recalled = rows.reduce(
      (sum, item) => sum + item.relevant_concept_ids.length - item.missed_concept_ids.length,
      0,
    ),
    recall = confirmed ? recalled / confirmed : 0,
    reduction = median(rows.map((item) => item.concept_payload_reduction)),
    stratified = strata.size >= 4 && [...strata.values()].every((count) => count >= 2)
  return {
    confirmed_link_count: confirmed,
    recalled_link_count: recalled,
    recall_at_12: recall,
    median_concept_payload_reduction: reduction,
    strata: [...strata]
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([name, count]) => ({ name, count })),
    passed:
      cases.length >= 24 &&
      stratified &&
      challengeCases.length >= 8 &&
      challengeKinds.every((kind) => kinds.has(kind)) &&
      recall >= 0.95 &&
      reduction >= DEFAULT_MINIMUM_MEDIAN_CONCEPT_PAYLOAD_REDUCTION,
  }
}

export function assertConceptCandidateEvaluation(evaluation, index) {
  assertConceptCandidateIndex(index)
  const expectedKeys = [
      "schema",
      "gold_source",
      "retrieval_version",
      "concept_registry_sha256",
      "index_sha256",
      "embedding_model",
      "embedding_digest",
      "retrieval_policy_sha256",
      "top_k",
      "sample_count",
      "challenge_sample_count",
      "confirmed_link_count",
      "recalled_link_count",
      "recall_at_12",
      "median_concept_payload_reduction",
      "strata",
      "cases",
      "challenge_cases",
      "passed",
      "evaluation_sha256",
    ],
    expectedCaseKeys = [
      "run",
      "event_id",
      "stratum",
      "gold_source",
      "case_kind",
      "challenge_kind",
      "article_public_sha256",
      "approval_files_sha256",
      "concept_review_sha256",
      "query_sha256",
      "query_embedding_sha256",
      "gold_sha256",
      "relevant_concept_ids",
      "candidate_concept_ids",
      "missed_concept_ids",
      "payload_candidate_concept_ids",
      "full_concept_payload_bytes",
      "candidate_concept_payload_bytes",
      "concept_payload_reduction",
    ]
  if (
    !evaluation ||
    Object.keys(evaluation).sort().join("\0") !== expectedKeys.sort().join("\0") ||
    evaluation.schema !== CONCEPT_CANDIDATE_EVALUATION_SCHEMA ||
    evaluation.gold_source !== "source_bound_semantic_reviews_v1" ||
    evaluation.retrieval_version !== index.retrieval_version ||
    evaluation.concept_registry_sha256 !== index.concept_registry_sha256 ||
    evaluation.index_sha256 !== index.index_sha256 ||
    evaluation.embedding_model !== index.embedding_model ||
    evaluation.embedding_digest !== index.embedding_digest ||
    evaluation.retrieval_policy_sha256 !== index.retrieval_policy_sha256 ||
    evaluation.top_k !== DEFAULT_CONCEPT_CANDIDATE_LIMIT ||
    !Array.isArray(evaluation.cases) ||
    evaluation.sample_count !== evaluation.cases.length ||
    evaluation.sample_count < 24 ||
    !Array.isArray(evaluation.challenge_cases) ||
    evaluation.challenge_sample_count !== evaluation.challenge_cases.length ||
    !hashPattern.test(evaluation.evaluation_sha256 || "")
  )
    throw Error("Semantic candidate evaluation identity or shape changed")
  const eventIds = new Set(),
    conceptIds = new Set(index.documents.map((document) => document.concept_id))
  for (const [kind, rows] of [
    ["pilot", evaluation.cases],
    ["challenge", evaluation.challenge_cases],
  ]) {
    for (const item of rows) {
      if (
        !item ||
        Object.keys(item).sort().join("\0") !== expectedCaseKeys.sort().join("\0") ||
        item.case_kind !== kind ||
        !hashPattern.test(item.query_embedding_sha256 || "") ||
        !hashPattern.test(item.gold_sha256 || "") ||
        !Array.isArray(item.missed_concept_ids) ||
        !reviewedIds(item.payload_candidate_concept_ids, conceptIds) ||
        !reviewedIds(item.candidate_concept_ids, conceptIds) ||
        item.candidate_concept_ids.length !==
          Math.min(DEFAULT_CONCEPT_CANDIDATE_LIMIT, index.concept_count) ||
        item.candidate_concept_ids.some((id) => !item.payload_candidate_concept_ids.includes(id)) ||
        !Number.isSafeInteger(item.full_concept_payload_bytes) ||
        item.full_concept_payload_bytes < 1 ||
        !Number.isSafeInteger(item.candidate_concept_payload_bytes) ||
        item.candidate_concept_payload_bytes < 1 ||
        item.candidate_concept_payload_bytes > item.full_concept_payload_bytes ||
        (item.payload_candidate_concept_ids.length === index.concept_count &&
          item.candidate_concept_payload_bytes !== item.full_concept_payload_bytes) ||
        item.concept_payload_reduction !==
          1 - item.candidate_concept_payload_bytes / item.full_concept_payload_bytes
      )
        throw Error("Semantic candidate evaluation case is not source-bound or well formed")
      assertCaseGold(item, conceptIds, eventIds)
      const missed = item.relevant_concept_ids
        .filter((id) => !item.candidate_concept_ids.includes(id))
        .sort()
      if (
        item.gold_sha256 !== conceptCandidateGoldSha256(item) ||
        JSON.stringify(item.missed_concept_ids) !== JSON.stringify(missed)
      )
        throw Error("Semantic candidate evaluation gold or recall record changed")
    }
  }
  const summary = evaluationSummary(evaluation.cases, evaluation.challenge_cases)
  if (
    summary.strata.length < 4 ||
    summary.strata.some((row) => row.count < 2) ||
    Object.keys(summary).some(
      (key) => JSON.stringify(evaluation[key]) !== JSON.stringify(summary[key]),
    )
  )
    throw Error("Semantic candidate evaluation counters or strata changed")
  const { evaluation_sha256, ...body } = evaluation
  if (evaluation_sha256 !== sha256(JSON.stringify(body)))
    throw Error("Semantic candidate evaluation checksum mismatch")
  return evaluation
}

export function validateConceptCandidateEvaluation(evaluation, index) {
  try {
    return assertConceptCandidateEvaluation(evaluation, index).passed
  } catch {
    return false
  }
}

export function evaluateConceptCandidateRecall(index, cases) {
  assertConceptCandidateIndex(index)
  if (
    !Array.isArray(cases) ||
    cases.filter((item) => caseProvenance(item || {}).case_kind === "pilot").length < 24
  )
    throw Error("At least 24 reviewed, stratified articles are required for retrieval evaluation")
  const eventIds = new Set(),
    conceptIds = new Set(index.documents.map((document) => document.concept_id)),
    pilotRows = [],
    challengeRows = []
  for (const item of cases) {
    const provenance = assertCaseGold(item, conceptIds, eventIds)
    if (!nonempty(item.query) || item.query_sha256 !== sha256(item.query))
      throw Error("Pilot query SHA must match the exact article query")
    normalizedVector(item.query_embedding, index.embedding_dimensions)
    const ranked = rankConceptCandidates({
        query: item.query,
        query_embedding: item.query_embedding,
        index,
      }),
      candidates = ranked.ranked_ids.slice(0, DEFAULT_CONCEPT_CANDIDATE_LIMIT).sort(),
      signal =
        ranked.exact_match_ids.length > 0 ||
        ranked.top_cosine >= 0.15 ||
        ranked.top_lexical_score >= 0.75,
      payloadIds = (
        signal ? ranked.shortlisted_ids : index.documents.map((document) => document.concept_id)
      ).sort()
    if (
      !reviewedIds(item.payload_candidate_concept_ids, conceptIds) ||
      JSON.stringify(item.payload_candidate_concept_ids) !== JSON.stringify(payloadIds) ||
      !Number.isSafeInteger(item.full_concept_payload_bytes) ||
      item.full_concept_payload_bytes < 1 ||
      !Number.isSafeInteger(item.candidate_concept_payload_bytes) ||
      item.candidate_concept_payload_bytes < 1 ||
      item.candidate_concept_payload_bytes > item.full_concept_payload_bytes ||
      (payloadIds.length === index.concept_count &&
        item.candidate_concept_payload_bytes !== item.full_concept_payload_bytes)
    )
      throw Error(
        "Pilot payload must measure the actual ranked candidates or full registry fallback",
      )
    const row = {
      run: item.run,
      event_id: item.event_id,
      stratum: item.stratum,
      ...provenance,
      article_public_sha256: item.article_public_sha256,
      approval_files_sha256: item.approval_files_sha256,
      concept_review_sha256: item.concept_review_sha256,
      query_sha256: item.query_sha256,
      query_embedding_sha256: sha256(JSON.stringify(item.query_embedding)),
      relevant_concept_ids: [...item.relevant_concept_ids],
      candidate_concept_ids: candidates,
      missed_concept_ids: item.relevant_concept_ids.filter((id) => !candidates.includes(id)).sort(),
      payload_candidate_concept_ids: [...payloadIds],
      full_concept_payload_bytes: item.full_concept_payload_bytes,
      candidate_concept_payload_bytes: item.candidate_concept_payload_bytes,
      concept_payload_reduction:
        1 - item.candidate_concept_payload_bytes / item.full_concept_payload_bytes,
    }
    row.gold_sha256 = conceptCandidateGoldSha256(row)
    ;(provenance.case_kind === "pilot" ? pilotRows : challengeRows).push(row)
  }
  const summary = evaluationSummary(pilotRows, challengeRows)
  if (summary.strata.length < 4 || summary.strata.some((row) => row.count < 2))
    throw Error("Pilot articles must cover at least four strata with two articles each")
  const body = {
    schema: CONCEPT_CANDIDATE_EVALUATION_SCHEMA,
    gold_source: "source_bound_semantic_reviews_v1",
    retrieval_version: index.retrieval_version,
    concept_registry_sha256: index.concept_registry_sha256,
    index_sha256: index.index_sha256,
    embedding_model: index.embedding_model,
    embedding_digest: index.embedding_digest,
    retrieval_policy_sha256: index.retrieval_policy_sha256,
    top_k: DEFAULT_CONCEPT_CANDIDATE_LIMIT,
    sample_count: pilotRows.length,
    challenge_sample_count: challengeRows.length,
    ...summary,
    cases: pilotRows,
    challenge_cases: challengeRows,
  }
  return { ...body, evaluation_sha256: sha256(JSON.stringify(body)) }
}

export function rankConceptCandidates({
  query,
  query_embedding,
  index,
  limit = DEFAULT_CONCEPT_CANDIDATE_LIMIT,
  rrf_k = DEFAULT_RRF_K,
  minimum_top_cosine = 0.15,
  minimum_top_lexical_score = 0.75,
  evaluation,
  allow_shortlist = false,
}) {
  assertConceptCandidateIndex(index)
  if (
    !nonempty(query) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 64 ||
    !Number.isInteger(rrf_k) ||
    rrf_k < 1 ||
    rrf_k > 1000 ||
    !Number.isFinite(minimum_top_cosine) ||
    minimum_top_cosine < -1 ||
    minimum_top_cosine > 1 ||
    !Number.isFinite(minimum_top_lexical_score) ||
    minimum_top_lexical_score < 0
  )
    throw Error("Bounded exact article query and retrieval limits required")
  let vector = null,
    vectorFailure = "query_embedding_missing"
  if (query_embedding !== undefined && query_embedding !== null) {
    try {
      vector = normalizedVector(query_embedding, index.embedding_dimensions)
    } catch {
      vectorFailure = "query_embedding_invalid"
    }
  }
  const lexical = lexicalScores(query, index),
    vectorScores = vector
      ? index.documents
          .map((document) => [document.concept_id, cosine(vector, document.embedding)])
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en"))
      : [],
    exact_match_ids = index.documents
      .filter((document) => document.exact_names.some((name) => containsExactName(query, name)))
      .map((document) => document.concept_id)
      .sort((a, b) => a.localeCompare(b, "en")),
    fused = new Map(),
    addRanks = (rows) =>
      rows.forEach(([id], rank) => fused.set(id, (fused.get(id) || 0) + 1 / (rrf_k + rank + 1)))
  addRanks(lexical)
  addRanks(vectorScores)
  for (const id of exact_match_ids) fused.set(id, (fused.get(id) || 0) + 1 / rrf_k)
  const ranked_ids = [...fused]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en"))
      .map(([id]) => id),
    top_cosine = vectorScores[0]?.[1] ?? null,
    top_lexical_score = lexical[0]?.[1] ?? 0,
    retrieval_signal =
      exact_match_ids.length > 0 ||
      top_cosine >= minimum_top_cosine ||
      top_lexical_score >= minimum_top_lexical_score,
    validated = validateConceptCandidateEvaluation(evaluation, index),
    policyMatches =
      limit === DEFAULT_CONCEPT_CANDIDATE_LIMIT &&
      rrf_k === DEFAULT_RRF_K &&
      minimum_top_cosine === 0.15 &&
      minimum_top_lexical_score === 0.75,
    uncertain = !vector || !validated || !retrieval_signal || !policyMatches,
    fallback_reason = !vector
      ? vectorFailure
      : !validated
        ? "24_article_retrieval_pilot_not_passed"
        : !policyMatches
          ? "retrieval_parameters_changed"
          : !retrieval_signal
            ? "low_retrieval_signal"
            : null,
    shortlisted = [...new Set([...exact_match_ids, ...ranked_ids.slice(0, limit)])]
  return {
    schema: CONCEPT_CANDIDATE_SELECTION_SCHEMA,
    retrieval_version: index.retrieval_version,
    index_sha256: index.index_sha256,
    concept_registry_sha256: index.concept_registry_sha256,
    embedding_model: index.embedding_model,
    embedding_digest: index.embedding_digest,
    mode: allow_shortlist && !uncertain ? "hybrid_top_k" : "full_registry_fallback",
    fallback_reason:
      allow_shortlist && !uncertain ? null : fallback_reason || "shortlist_not_enabled",
    total_concepts: index.concept_count,
    exact_match_ids,
    ranked_ids,
    shortlisted_ids: shortlisted,
    candidate_ids:
      allow_shortlist && !uncertain
        ? shortlisted
        : index.documents.map((document) => document.concept_id),
    lexical_hit_count: lexical.length,
    top_cosine,
    top_lexical_score,
    rrf_k,
    limit,
    evaluation_sha256: validated ? evaluation.evaluation_sha256 : null,
  }
}
