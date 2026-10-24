import test from "node:test"
import assert from "node:assert/strict"
import {
  assertConceptCandidateIndex,
  assertConceptCandidateEvaluation,
  buildConceptCandidateIndex,
  conceptCandidateGoldSha256,
  evaluateConceptCandidateRecall,
  rankConceptCandidates,
  validateConceptCandidateEvaluation,
} from "../scripts/research/concept-candidate-index.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"

const dimension = 48
const registrySha = sha256("reviewed concept registry")
const embeddingDigest = "b".repeat(64)
const retrievalPolicySha = sha256("semantic candidate policy")

function fixtureConcepts() {
  return Array.from({ length: 40 }, (_, index) => ({
    concept_id: `concept-${String(index).padStart(2, "0")}`,
    title: `Concept ${index}`,
    label: `Mechanism domain ${index}`,
    aliases:
      index === 13
        ? ["Needle Alias"]
        : index === 20
          ? ["C++"]
          : index === 21
            ? ["C#"]
            : index === 6
              ? ["zero-shot learning"]
              : [],
    keywords: [`reviewed keyword ${index}`],
    kind: "mechanism",
    reason: "기술 독자가 작동 원리를 이해하는 데 필요한 전문 개념이다.",
    definition: `Mechanism ${index} explains how the reviewed system works.`,
  }))
}

function fixtureIndex() {
  const concepts = fixtureConcepts(),
    embeddings = concepts.map((_, index) =>
      Array.from({ length: dimension }, (_, column) => Number(column === index)),
    )
  return buildConceptCandidateIndex(concepts, {
    concept_registry_sha256: registrySha,
    embedding_model: "qwen3-embedding:8b",
    embedding_digest: embeddingDigest,
    retrieval_policy_sha256: retrievalPolicySha,
    embeddings,
  })
}

function pilotCases(
  index,
  {
    query = "mechanism domain 0",
    query_embedding,
    concept_id = "concept-00",
    includeChallenges = true,
  } = {},
) {
  const ranked = rankConceptCandidates({ query, query_embedding, index }),
    signal =
      ranked.exact_match_ids.length > 0 ||
      ranked.top_cosine >= 0.15 ||
      ranked.top_lexical_score >= 0.75,
    payloadIds = (
      signal ? ranked.shortlisted_ids : index.documents.map((row) => row.concept_id)
    ).sort(),
    concepts = fixtureConcepts(),
    payload = concepts
      .filter((concept) => payloadIds.includes(concept.concept_id))
      .sort((a, b) => a.concept_id.localeCompare(b.concept_id, "en"))
  return Array.from({ length: includeChallenges ? 32 : 24 }, (_, row) => {
    const challenge = row >= 24,
      kind = challenge ? ["ambiguous", "homonym", "reviewed_none"][(row - 24) % 3] : null
    return {
      run: `pilot-run-${row}`,
      event_id: row.toString(16).padStart(16, "0"),
      stratum: ["AI", "software", "security", "robotics", "semiconductor", "cloud"][row % 6],
      ...(challenge
        ? {
            gold_source: "semantic_retrieval_review_v1",
            case_kind: "challenge",
            challenge_kind: kind,
          }
        : {}),
      article_public_sha256: sha256(`article-${row}`),
      approval_files_sha256: sha256(`approval-${row}`),
      concept_review_sha256: sha256(`concept-review-${row}`),
      query_sha256: sha256(query),
      query,
      query_embedding,
      full_concept_payload_bytes: Buffer.byteLength(JSON.stringify(concepts)),
      candidate_concept_payload_bytes: Buffer.byteLength(JSON.stringify(payload)),
      payload_candidate_concept_ids: payloadIds,
      relevant_concept_ids: kind === "reviewed_none" ? [] : [concept_id],
    }
  })
}

const queryVector = () => Array.from({ length: dimension }, (_, column) => Number(column === 0))
function rehashEvaluation(evaluation) {
  const { evaluation_sha256, ...body } = evaluation
  return { ...body, evaluation_sha256: sha256(JSON.stringify(body)) }
}

test("candidate index pins registry, tokenizer, retrieval policy, model digest, and vector shape", () => {
  const index = fixtureIndex()
  assert.equal(index.concept_count, 40)
  assert.equal(index.embedding_dimensions, dimension)
  assert.equal(assertConceptCandidateIndex(index), index)
  assert.throws(
    () => assertConceptCandidateIndex(index, { embedding_digest: "c".repeat(64) }),
    /identity changed/,
  )
  const tampered = structuredClone(index)
  tampered.documents[0].tokens.push("unhashed-change")
  assert.throws(() => assertConceptCandidateIndex(tampered), /checksum mismatch/)
})

test("hybrid retrieval retains every exact alias and uses full registry until the pilot passes", () => {
  const index = fixtureIndex(),
    selection = rankConceptCandidates({
      query: "Needle Alias",
      query_embedding: Array.from({ length: dimension }, (_, column) => Number(column === 0)),
      index,
      limit: 2,
      allow_shortlist: true,
    })
  assert.equal(selection.mode, "full_registry_fallback")
  assert.equal(selection.fallback_reason, "24_article_retrieval_pilot_not_passed")
  assert.equal(selection.candidate_ids.length, 40)
  assert.ok(selection.shortlisted_ids.includes("concept-13"))
  assert.ok(selection.exact_match_ids.includes("concept-13"))
})

test("a stratified 24-article pilot enables a bounded shortlist only when recall clears 95 percent", () => {
  const index = fixtureIndex(),
    queryEmbedding = Array.from({ length: dimension }, (_, column) => Number(column === 0)),
    cases = pilotCases(index, { query_embedding: queryEmbedding }),
    evaluation = evaluateConceptCandidateRecall(index, cases)
  assert.equal(evaluation.sample_count, 24)
  assert.equal(evaluation.recall_at_12, 1)
  assert.equal(evaluation.challenge_sample_count, 8)
  assert.equal(evaluation.confirmed_link_count, 30)
  assert.equal(
    evaluation.median_concept_payload_reduction,
    1 - cases[0].candidate_concept_payload_bytes / cases[0].full_concept_payload_bytes,
  )
  assert.ok(evaluation.median_concept_payload_reduction >= 0.6)
  assert.equal(validateConceptCandidateEvaluation(evaluation, index), true)
  assert.equal(assertConceptCandidateEvaluation(evaluation, index), evaluation)
  const selection = rankConceptCandidates({
    query: "mechanism domain 0",
    query_embedding: queryEmbedding,
    index,
    evaluation,
    allow_shortlist: true,
  })
  assert.equal(selection.mode, "hybrid_top_k")
  assert.ok(selection.candidate_ids.length <= 12)
  assert.ok(selection.candidate_ids.includes("concept-00"))
  const invalidated = structuredClone(evaluation)
  invalidated.recall_at_12 = 0.94
  invalidated.passed = false
  const { evaluation_sha256, ...body } = invalidated
  invalidated.evaluation_sha256 = sha256(JSON.stringify(body))
  assert.equal(validateConceptCandidateEvaluation(invalidated, index), false)
})

test("a valid but low-recall pilot is recorded and never enables a shortlist", () => {
  const index = fixtureIndex(),
    queryEmbedding = Array.from({ length: dimension }, (_, column) => Number(column === 0)),
    evaluation = evaluateConceptCandidateRecall(
      index,
      pilotCases(index, {
        query: "unrelated phrase",
        query_embedding: queryEmbedding,
        concept_id: "concept-13",
      }),
    )
  assert.equal(evaluation.recall_at_12, 0)
  assert.equal(evaluation.passed, false)
  assert.equal(assertConceptCandidateEvaluation(evaluation, index), evaluation)
  assert.equal(validateConceptCandidateEvaluation(evaluation, index), false)
  const selection = rankConceptCandidates({
    query: "unrelated phrase",
    query_embedding: queryEmbedding,
    index,
    evaluation,
    allow_shortlist: true,
  })
  assert.equal(selection.mode, "full_registry_fallback")
  assert.equal(selection.fallback_reason, "24_article_retrieval_pilot_not_passed")
})

test("a valid pilot below the 60 percent median concept-payload target stays full registry", () => {
  const index = fixtureIndex(),
    queryEmbedding = Array.from({ length: dimension }, (_, column) => Number(column === 0)),
    cases = pilotCases(index, { query_embedding: queryEmbedding }).map((item) => ({
      ...item,
      candidate_concept_payload_bytes: Math.ceil(item.full_concept_payload_bytes / 2),
    })),
    evaluation = evaluateConceptCandidateRecall(index, cases)
  assert.equal(evaluation.recall_at_12, 1)
  assert.ok(evaluation.median_concept_payload_reduction <= 0.5)
  assert.equal(evaluation.passed, false)
  assert.equal(validateConceptCandidateEvaluation(evaluation, index), false)
  const selection = rankConceptCandidates({
    query: "mechanism domain 0",
    query_embedding: queryEmbedding,
    index,
    evaluation,
    allow_shortlist: true,
  })
  assert.equal(selection.mode, "full_registry_fallback")
})

test("uncertain retrieval and undersized pilot remain full-registry fallbacks", () => {
  const index = fixtureIndex()
  const noVector = rankConceptCandidates({
    query: "unmatched phrase",
    index,
    allow_shortlist: true,
  })
  assert.equal(noVector.mode, "full_registry_fallback")
  assert.equal(noVector.fallback_reason, "query_embedding_missing")
  assert.equal(noVector.candidate_ids.length, 40)
  assert.throws(
    () => evaluateConceptCandidateRecall(index, []),
    /At least 24 reviewed, stratified articles/,
  )
  const malformed = pilotCases(index, {
    query_embedding: Array.from({ length: dimension }, (_, column) => Number(column === 0)),
  })
  delete malformed[0].approval_files_sha256
  assert.throws(
    () => evaluateConceptCandidateRecall(index, malformed),
    /distinct event, stratum and confirmed concept link/,
  )
})

test("exact official names and aliases preserve punctuation and every match beyond top 12", () => {
  const index = fixtureIndex(),
    evaluation = evaluateConceptCandidateRecall(
      index,
      pilotCases(index, { query_embedding: queryVector() }),
    )
  for (const [query, expected] of [
    ["zero-shot learning", "concept-06"],
    ["C++", "concept-20"],
    ["C#", "concept-21"],
    ["zero-shot learning을 적용했다", "concept-06"],
    ["C++를 사용한다", "concept-20"],
  ]) {
    const ranked = rankConceptCandidates({
      query,
      index,
      query_embedding: queryVector(),
      evaluation,
      allow_shortlist: true,
    })
    assert.deepEqual(ranked.exact_match_ids, [expected])
    assert.ok(ranked.candidate_ids.includes(expected))
    assert.equal(ranked.mode, "hybrid_top_k")
  }
  assert.deepEqual(rankConceptCandidates({ query: "Needle Aliases", index }).exact_match_ids, [])
  const names = Array.from({ length: 20 }, (_, i) => `Concept ${i}`).join(", "),
    ranked = rankConceptCandidates({
      query: names,
      index,
      query_embedding: queryVector(),
      evaluation,
      allow_shortlist: true,
    })
  assert.equal(ranked.mode, "hybrid_top_k")
  assert.equal(ranked.exact_match_ids.length, 20)
  for (const id of ranked.exact_match_ids) assert.ok(ranked.candidate_ids.includes(id))
  assert.ok(ranked.candidate_ids.length >= 20)
})

test("Hangul ngrams rank a spaced reviewed concept from an unspaced article query", () => {
  const concepts = fixtureConcepts()
  concepts[30].label = "벡터 검색"
  const index = buildConceptCandidateIndex(concepts, {
      concept_registry_sha256: sha256(JSON.stringify(concepts)),
      embedding_digest: embeddingDigest,
      retrieval_policy_sha256: retrievalPolicySha,
      embeddings: concepts.map((_, i) =>
        Array.from({ length: dimension }, (_, col) => Number(col === i)),
      ),
    }),
    ranked = rankConceptCandidates({
      query: "벡터검색을 적용한 시스템",
      query_embedding: queryVector(),
      index,
    })
  assert.ok(ranked.lexical_hit_count > 0)
  assert.ok(ranked.ranked_ids.slice(0, 12).includes("concept-30"))
  assert.ok(!ranked.exact_match_ids.includes("concept-30"))
})

test("a pilot without eight distinct reviewed challenge cases never enables a shortlist", () => {
  const index = fixtureIndex(),
    cases = pilotCases(index, { query_embedding: queryVector() }),
    noChallenges = evaluateConceptCandidateRecall(index, cases.slice(0, 24))
  assert.equal(noChallenges.sample_count, 24)
  assert.equal(noChallenges.challenge_sample_count, 0)
  assert.equal(noChallenges.passed, false)
  assert.equal(assertConceptCandidateEvaluation(noChallenges, index), noChallenges)
  assert.equal(validateConceptCandidateEvaluation(noChallenges, index), false)
  const biased = cases.map((item) =>
    item.case_kind === "challenge"
      ? { ...item, challenge_kind: "ambiguous", relevant_concept_ids: ["concept-00"] }
      : item,
  )
  assert.equal(evaluateConceptCandidateRecall(index, biased).passed, false)
  const duplicate = structuredClone(cases)
  duplicate[24].event_id = duplicate[0].event_id
  assert.throws(() => evaluateConceptCandidateRecall(index, duplicate), /distinct event/)
  const emptyPilot = structuredClone(cases)
  emptyPilot[0].relevant_concept_ids = []
  assert.throws(() => evaluateConceptCandidateRecall(index, emptyPilot), /confirmed concept link/)
})

test("pilot requires matching article query SHA and actually used finite query embeddings", () => {
  const index = fixtureIndex(),
    cases = pilotCases(index, { query_embedding: queryVector() })
  for (const vector of [undefined, [], [0, 0], [1, NaN]]) {
    const invalid = structuredClone(cases)
    invalid[0].query_embedding = vector
    assert.throws(() => evaluateConceptCandidateRecall(index, invalid), /embedding/)
  }
  const invalidQuery = structuredClone(cases)
  invalidQuery[0].query_sha256 = sha256("a different article")
  assert.throws(() => evaluateConceptCandidateRecall(index, invalidQuery), /query SHA/)
  const evaluation = evaluateConceptCandidateRecall(index, cases)
  assert.equal(evaluation.cases[0].query_embedding_sha256, sha256(JSON.stringify(queryVector())))
  assert.equal(evaluation.cases[0].gold_source, "native_reviewed_article_concepts_v2")
  const changedKind = { ...evaluation.cases[0], gold_source: "semantic_retrieval_review_v1" }
  assert.notEqual(conceptCandidateGoldSha256(changedKind), evaluation.cases[0].gold_sha256)
})

test("strict top12 receipts reject widened candidates and payloads that omit actual candidates", () => {
  const index = fixtureIndex(),
    cases = pilotCases(index, { query_embedding: queryVector() }),
    evaluation = evaluateConceptCandidateRecall(index, cases)
  const widened = structuredClone(evaluation)
  widened.cases[0].candidate_concept_ids = index.documents.map((row) => row.concept_id)
  assert.throws(
    () => assertConceptCandidateEvaluation(rehashEvaluation(widened), index),
    /well formed/,
  )
  const omitted = structuredClone(cases)
  omitted[0].payload_candidate_concept_ids = ["concept-00"]
  assert.throws(() => evaluateConceptCandidateRecall(index, omitted), /actual ranked candidates/)
  const weak = pilotCases(index, {
    query: "unrelated unknown wording",
    query_embedding: Array(dimension).fill(-1),
  })
  assert.equal(evaluateConceptCandidateRecall(index, weak).median_concept_payload_reduction, 0)
  weak[0].candidate_concept_payload_bytes = 1
  assert.throws(() => evaluateConceptCandidateRecall(index, weak), /full registry fallback/)
})

test("changed retrieval parameters, low signal, and unusable query vectors keep full registry", () => {
  const index = fixtureIndex(),
    evaluation = evaluateConceptCandidateRecall(
      index,
      pilotCases(index, { query_embedding: queryVector() }),
    ),
    base = {
      index,
      evaluation,
      allow_shortlist: true,
      query: "mechanism domain 0",
      query_embedding: queryVector(),
    }
  for (const changed of [{ limit: 2 }, { rrf_k: 20 }, { minimum_top_cosine: 0.01 }]) {
    const selected = rankConceptCandidates({ ...base, ...changed })
    assert.equal(selected.mode, "full_registry_fallback")
    assert.equal(selected.fallback_reason, "retrieval_parameters_changed")
    assert.equal(selected.candidate_ids.length, 40)
  }
  const low = rankConceptCandidates({
    ...base,
    query: "unrelated unknown wording",
    query_embedding: Array(dimension).fill(-1),
  })
  assert.equal(low.fallback_reason, "low_retrieval_signal")
  for (const query_embedding of [[0, 0], [1, NaN], Array(dimension).fill(0)]) {
    const selected = rankConceptCandidates({ ...base, query_embedding })
    assert.equal(selected.fallback_reason, "query_embedding_invalid")
    assert.equal(selected.candidate_ids.length, 40)
  }
  const legacy = { ...evaluation, schema: "semantic-concept-retrieval-evaluation/v2" }
  assert.equal(
    rankConceptCandidates({ ...base, evaluation: rehashEvaluation(legacy) }).mode,
    "full_registry_fallback",
  )
})

test("cached index rejects changed model, registry, dimensions, and rehashed non-unit vectors", () => {
  const index = fixtureIndex()
  for (const expected of [
    { concept_registry_sha256: sha256("other registry") },
    { embedding_model: "other:embedding" },
    { embedding_dimensions: dimension + 1 },
    { retrieval_policy_sha256: sha256("other policy") },
  ])
    assert.throws(() => assertConceptCandidateIndex(index, expected), /identity changed/)
  const corrupted = structuredClone(index)
  corrupted.documents[0].embedding[0] = 2
  const { index_sha256, ...body } = corrupted
  assert.throws(
    () => assertConceptCandidateIndex({ ...body, index_sha256: sha256(JSON.stringify(body)) }),
    /Normalized/,
  )
  const invalidated = buildConceptCandidateIndex(fixtureConcepts(), {
    concept_registry_sha256: registrySha,
    embedding_digest: "c".repeat(64),
    retrieval_policy_sha256: retrievalPolicySha,
    embeddings: index.documents.map((document) => document.embedding),
  })
  assert.notEqual(invalidated.index_sha256, index.index_sha256)
})
