import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256 } from "../scripts/research/contracts.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import {
  assertEvidenceOntology,
  extendEvidenceOntology,
  ontologyConceptArticles,
  ontologyEntityTimeline,
  projectEvidenceOntology,
  traceOntologyClaim,
  createOntologyReader,
} from "../scripts/research/ontology.mjs"
import {
  ontologyKnowledge,
  ontologyKnowledgeIndex,
  ontologyResearchPaper,
  ontologyResearchPerson,
  ontologyCompany,
  ontologyImpact,
  prepareKnowledgeReviewSelections,
} from "../scripts/research/ontology-knowledge.mjs"
import { main } from "../scripts/research-ontology.mjs"
import { atomicCreate } from "../scripts/research/run-state.mjs"
import { assertCompanyIdentityReview } from "../scripts/research/knowledge-links.mjs"

function approval(run, eventId, { state = "planned", conceptIds = ["reviewed-concept"] } = {}) {
  const text = `${run} source says A Corp ${state === "planned" ? "plans" : "has begun"} product P.`,
    url = `https://example.org/${run}`,
    claimId = `claim-${run}`,
    sourceId = `source-${run}`,
    versionId = `version-${run}`,
    parseId = `parse-${run}`,
    blockId = `${parseId}:block-${run}`
  const evidence = {
    source_id: sourceId,
    source_version_id: versionId,
    parse_id: parseId,
    block_id: blockId,
    quote: text,
    support: "direct",
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id: sourceId,
    source_version_id: versionId,
    parse_id: parseId,
    status: "extracted",
    title: `${run} source`,
    dates: { published_at: "2026-09-20", observed_at: "2026-09-20T08:00:00Z" },
    quality: { missing_pages: [] },
    blocks: [{ block_id: blockId, text, locator: { text_hash: sha256(text) } }],
  }
  const claim = {
    schema: "research-claim/v1",
    claim_id: claimId,
    candidate_key: run,
    event_id: null,
    subject_id: null,
    statement: text,
    claim_kind: "attributed_fact",
    subject: "A Corp",
    event_state: state,
    published_at: "2026-09-20",
    effective_period: state === "planned" ? "2027" : null,
    numbers: [],
    evidence: [evidence],
  }
  const reviewed = recordFactReview(
    [claim],
    [
      {
        claim_id: claimId,
        status: "verified",
        reason: "Source statement checked",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      },
    ],
    { reviewer: "test", reviewed_at: "2026-09-21" },
    [parse],
  )[0]
  return {
    run,
    file_hashes: { "approved-article.json": sha256(run) },
    article: {
      event_id: eventId,
      title: `${run} announcement`,
      source_urls: [url],
      sector: "AI",
      theme: "연구·기술",
      tags: ["연구"],
      entities: ["A Corp"],
      article_review: {
        review_status: "verified",
        published_at: "2026-09-20",
        reviewed_at: "2026-09-21",
        concept_ids: conceptIds,
      },
    },
    draft: {
      draft: {
        lead: [{ claim_ids: [claimId] }],
        explanations: [],
      },
    },
    claims: [
      reviewed,
      {
        claim_id: `unused-${run}`,
        statement: "Unreviewed candidate must not appear",
        subject: "A Corp",
        event_state: "unknown",
        evidence: [evidence],
        review: { status: "deferred" },
      },
    ],
    documents: [
      {
        source_id: sourceId,
        source_version_id: versionId,
        original_url: url,
        final_url: url,
        body_sha256: sha256(text),
        observed_at: "2026-09-20T08:00:00Z",
      },
    ],
    parses: [parse],
  }
}

test("ontology extension accumulates distinct events and refuses changed approvals or unreviewed revisions", () => {
  const first = approval("first", "1111111111111111"),
    second = approval("second", "2222222222222222", { state: "completed" }),
    revision = approval("revision", "1111111111111111")
  const inputs = new Map([first, second, revision].map((input) => [input.run, input]))
  const options = { inputLoader: (_root, run) => inputs.get(run) }
  const previous = projectEvidenceOntology([first])
  const combined = extendEvidenceOntology("unused", previous, ["first", "second"], options)
  assert.deepEqual(combined, projectEvidenceOntology([second, first]))
  assert.deepEqual(extendEvidenceOntology("unused", combined, [], options), combined)
  assert.deepEqual(extendEvidenceOntology("unused", combined, ["second"], options), combined)
  assert.throws(
    () => extendEvidenceOntology("unused", previous, ["revision"], options),
    /explicit revision review/,
  )
  inputs.set("first", { ...first, file_hashes: { changed: "different" } })
  assert.throws(
    () => extendEvidenceOntology("unused", previous, ["second"], options),
    /approval changed/,
  )
  assert.deepEqual(previous, projectEvidenceOntology([first]))
})

test("approved standalone definitions reuse note evidence without inventing article links", (t) => {
  const vault = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-selection-")))
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }))
  const notePath = "Knowledge/Standalone.md"
  const content =
    "---\ntype: knowledge\nentry_type: concept\nschema_version: tech-encyclopedia/v2\nconcept_id: standalone\nlabel: 専門用語\nlast_reviewed: 2026-09-21\nmap_review:\n  decision: include\nverified_sources: [https://example.org/background]\n---\n\n## 한 문장 정의\n원문에 근거한 독립 설명.\n\n## 작동 원리\n없음\n"
  fs.mkdirSync(path.dirname(path.join(vault, notePath)), { recursive: true })
  fs.writeFileSync(path.join(vault, notePath), content)
  const note = {
    path: notePath,
    sha256: sha256(content),
    content,
    evidence: [{ run_id: "background", claim_ids: ["claim-background"] }],
  }
  const input = approval("background", "1111111111111111", { conceptIds: [] })
  const graph = projectEvidenceOntology([input]),
    before = structuredClone(graph)
  const options = {
    vault,
    inputLoader: () => input,
    knowledgeSelections: [{ run: "note-review", path: notePath, sha256: note.sha256 }],
    noteApprovalLoader: () => ({
      approval: { notes: [note] },
      files: { approval_sha256: sha256("receipt") },
    }),
    noteSourceLoader: () => ({ claims: input.claims, parses: input.parses }),
  }
  const index = ontologyKnowledgeIndex("unused", graph, options)
  assert.equal(index.concepts.length, 1)
  assert.deepEqual(index.concepts[0].events, [])
  assert.equal(Object.hasOwn(index.concepts[0].current, "mechanism"), false)
  assert.equal(index.concepts[0].note_approval.run, "note-review")
  assert.equal(
    ontologyKnowledge("unused", graph, "standalone", options).current.definition,
    "원문에 근거한 독립 설명.",
  )
  assert.deepEqual(graph, before)
  assert.equal(index.events.length, 1)
  assert.equal(Object.hasOwn(index.events[0], "concept_ids"), false)
  const impact = ontologyImpact(
    "unused",
    graph,
    { source_version_id: "version-background" },
    options,
  )
  assert.equal(impact.definitions.length, 1)
  assert.equal(impact.related_histories.length, 0)
  assert.deepEqual(impact.unbound_definition_paths, [])
  assert.throws(
    () =>
      prepareKnowledgeReviewSelections(
        "unused",
        [...options.knowledgeSelections, ...options.knowledgeSelections],
        options,
      ),
    /Distinct exact/,
  )
  assert.throws(
    () =>
      prepareKnowledgeReviewSelections(
        "unused",
        [{ ...options.knowledgeSelections[0], path: "Knowledge/Other.md" }],
        options,
      ),
    /applied authority/,
  )
  fs.appendFileSync(path.join(vault, notePath), "changed")
  assert.throws(() => ontologyKnowledgeIndex("unused", graph, options), /applied authority/)
})

test("selected current definitions preserve historical article definition versions", (t) => {
  const f = specialistRevision(),
    vault = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-current-")))
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }))
  const notePath = "Knowledge/Reviewed Concept.md"
  const content =
    "---\ntype: knowledge\nentry_type: concept\nschema_version: tech-encyclopedia/v2\nconcept_id: reviewed-concept\nlabel: 검토된 평가 방법\nlast_reviewed: 2026-09-22\nmap_review:\n  decision: include\nverified_sources: [https://example.org/first]\n---\n\n## 한 문장 정의\n추가로 원문 대조한 최신 정의.\n"
  fs.mkdirSync(path.dirname(path.join(vault, notePath)), { recursive: true })
  fs.writeFileSync(path.join(vault, notePath), content)
  const original = ontologyKnowledgeIndex("unused", f.graph, f.options).concepts[0]
  const options = {
    ...f.options,
    vault,
    knowledgeSelections: [{ run: "latest-note", path: notePath, sha256: sha256(content) }],
    noteApprovalLoader: (root, run) =>
      run === "latest-note"
        ? {
            approval: {
              notes: [{ path: notePath, sha256: sha256(content), content, evidence: [] }],
            },
            files: {},
          }
        : f.options.noteApprovalLoader(root, run),
  }
  const next = ontologyKnowledgeIndex("unused", f.graph, options).concepts[0]
  assert.equal(next.current.definition, "추가로 원문 대조한 최신 정의.")
  assert.deepEqual(next.events, original.events)
  assert.equal(next.definition_versions.length, original.definition_versions.length + 1)
  for (const version of original.definition_versions)
    assert.deepEqual(
      next.definition_versions.find((item) => item.sha256 === version.sha256),
      version,
    )
  assert.equal(next.events[0].definition_sha256, original.current.sha256)
  const other = structuredClone(f.after)
  other.article.event_id = "2222222222222222"
  other.concept_review.links[0].evidence[0].event_id = other.article.event_id
  const combined = projectEvidenceOntology([f.before, other])
  const inputs = new Map([f.before, other].map((input) => [input.run, input]))
  const combinedOptions = { ...options, inputLoader: (_root, run) => inputs.get(run) }
  assert.throws(
    () =>
      ontologyKnowledgeIndex("unused", combined, {
        ...combinedOptions,
        knowledgeSelections: [],
      }),
    /Conflicting latest/,
  )
  const resolved = ontologyKnowledgeIndex("unused", combined, combinedOptions).concepts[0]
  assert.equal(resolved.current.sha256, sha256(content))
  assert.equal(resolved.events.length, 2)
  assert.equal(resolved.definition_versions.length, 3)
  assert.throws(
    () => main(["build", "--snapshot", "test", "--knowledge-reviews", "missing"]),
    /requires knowledge/,
  )
})

test("ontology reader preserves a validated snapshot and isolates returned records", () => {
  const input = approval("snapshot", "1111111111111111", { conceptIds: [] })
  const graph = projectEvidenceOntology([input]),
    reader = createOntologyReader(graph)
  const original = traceOntologyClaim(graph, "claim-snapshot", "snapshot")
  assert.deepEqual(reader.traceClaim("claim-snapshot", "snapshot"), original)
  const timeline = ontologyEntityTimeline(graph, "A Corp")
  assert.deepEqual(reader.entityTimeline("A Corp"), timeline)
  const returned = reader.traceClaim("claim-snapshot")
  returned.claim.statement = "tampered result"
  returned.evidence[0].locator.text_hash = "changed"
  graph.nodes.find((n) => n.type === "Claim").statement = "tampered input"
  assert.deepEqual(reader.traceClaim("claim-snapshot"), original)
  assert.deepEqual(reader.entityTimeline("A Corp"), timeline)
  assert.throws(() => createOntologyReader(graph), /Ontology|ontology/)
  assert.throws(() => reader.traceClaim("missing"), /Claim not found/)
  assert.throws(() => reader.entityTimeline(""), /Exact entity name/)
})

test("occurrence-aware timelines retain publication dates and fall back for legacy approvals", () => {
  const first = approval("occurred-first", "1111111111111111"),
    second = approval("occurred-second", "2222222222222222"),
    legacy = approval("legacy-date", "3333333333333333")
  first.article.article_review.occurred_at = "2026-09-01"
  second.article.article_review.occurred_at = "2026-09-18"
  const inputs = new Map([first, second, legacy].map((input) => [input.run, input]))
  const graph = projectEvidenceOntology([first, second, legacy])
  const index = ontologyKnowledgeIndex("unused", graph, {
    inputLoader: (_root, run) => inputs.get(run),
  })
  assert.deepEqual(
    index.events.map((event) => event.event_id),
    ["3333333333333333", "2222222222222222", "1111111111111111"],
  )
  assert.ok(index.events.every((event) => event.published_at === "2026-09-20"))
  assert.equal(index.events[1].occurred_at, "2026-09-18")
  assert.equal(Object.hasOwn(index.events[0], "occurred_at"), false)
  assert.deepEqual(
    ontologyEntityTimeline(graph, "A Corp").events.map((event) => event.event_id),
    ["1111111111111111", "2222222222222222", "3333333333333333"],
  )
  assert.deepEqual(
    ontologyConceptArticles(graph, "reviewed-concept").articles.map((event) => event.event_id),
    ["3333333333333333", "2222222222222222", "1111111111111111"],
  )
  const legacyGraph = projectEvidenceOntology([legacy])
  assert.deepEqual(
    extendEvidenceOntology("unused", legacyGraph, [], {
      inputLoader: (_root, run) => inputs.get(run),
    }),
    legacyGraph,
  )
})

test("reviewed revisions retain one current event, archived facts and an immutable revision chain", () => {
  const first = approval("first", "1111111111111111", { conceptIds: [] }),
    unrelated = approval("unrelated", "2222222222222222", { conceptIds: [] }),
    revised = approval("revised", "1111111111111111", { state: "completed", conceptIds: [] }),
    next = approval("next", "1111111111111111", { conceptIds: [] })
  const inputs = new Map([first, unrelated, revised, next].map((input) => [input.run, input]))
  const revisions = new Map()
  const proof = (previous, current) => ({
    event_id: current.article.event_id,
    previous: {
      run: previous.run,
      event_id: previous.article.event_id,
      files: previous.file_hashes,
    },
    current: { run: current.run, event_id: current.article.event_id, files: current.file_hashes },
    receipt: { path: `runs/${current.run}/candidate-approval.json`, sha256: sha256(current.run) },
  })
  revisions.set("first:revised", proof(first, revised))
  revisions.set("revised:next", proof(revised, next))
  const options = {
    inputLoader: (_root, run) => inputs.get(run),
    revisionLoader: (_root, old, current) => {
      const value = revisions.get(`${old.run}:${current.run}`)
      if (!value) throw Error("explicit revision review required")
      return value
    },
  }
  const original = projectEvidenceOntology([first, unrelated]),
    bytes = JSON.stringify(original)
  const result = extendEvidenceOntology("unused", original, ["revised"], options)
  assert.equal(JSON.stringify(original), bytes)
  assert.equal(result.nodes.filter((n) => n.type === "Event").length, 2)
  assert.equal(result.inputs.find((i) => i.event_id === first.article.event_id).run, "revised")
  assert(!result.nodes.some((n) => n.run === "first"))
  assert.deepEqual(extendEvidenceOntology("unused", result, ["revised"], options), result)
  const index = ontologyKnowledgeIndex("unused", result, options)
  const event = index.events.find((e) => e.event_id === first.article.event_id)
  assert.equal(index.events.length, 2)
  assert.equal(event.facts[0].event_state, "completed")
  assert.equal(event.previous_versions[0].facts[0].event_state, "planned")
  assert.equal(
    event.previous_versions[0].facts[0].evidence[0].source_url,
    first.article.source_urls[0],
  )
  assert.equal(event.previous_versions[0].article_path, event.article_path)
  assert.equal(index.entity_timelines[0].events.length, 2)
  assert.throws(() => extendEvidenceOntology("unused", result, ["first"], options), /Superseded/)
  const second = extendEvidenceOntology("unused", result, ["next"], options)
  assert.equal(result.revision_history.length, 1)
  assert.equal(second.revision_history.length, 2)
  assert.equal(
    ontologyKnowledgeIndex("unused", second, options).events[0].previous_versions.length,
    2,
  )
  revisions.set("first:revised", {
    ...proof(first, revised),
    receipt: { path: "changed", sha256: sha256("changed") },
  })
  assert.throws(
    () => ontologyKnowledgeIndex("unused", second, options),
    /revision evidence changed/,
  )
})

test("knowledge preserves reviewed deep relationships with dates and exact source traces", () => {
  const input = approval("commercialization", "8888888888888888", { conceptIds: [] })
  input.article.record = { kind: "연구 사업화" }
  const relations = ["Company One", "Company Two"].map((organization) => ({
    person_id: "reviewed-person-1",
    person_name: "Researcher One",
    affiliation: "University One",
    organization,
    role: "공동창업",
    claim: `${organization} founding relationship explicitly reviewed`,
    as_of: "2026-09-20",
    evidence_urls: input.article.source_urls,
    claim_ids: ["claim-commercialization"],
  }))
  // Projection fixture: eligibility/source-role checks belong to the native
  // deep review and approval loaders, not this read-model test.
  input.draft.deep_context = {
    input: {
      kind: "연구 사업화",
      topic_ids: ["reviewed-research-topic"],
      event_claim_ids: ["claim-commercialization"],
      basis: [],
      papers: [],
      relations,
    },
    review: { reviewed_at: "2026-09-21" },
  }
  const graph = projectEvidenceOntology([input])
  const index = ontologyKnowledgeIndex("unused", graph, { inputLoader: () => input })
  assert.equal(index.events[0].kind, "연구 사업화")
  assert.equal(index.events[0].deep.kind, "연구 사업화")
  assert.deepEqual(
    index.research_relationships.map((row) => row.organization),
    ["Company One", "Company Two"],
  )
  for (const row of index.research_relationships) {
    assert.equal(row.as_of, "2026-09-20")
    assert.equal(row.reviewed_at, "2026-09-21")
    assert.equal(row.article_path, "news/8888888888888888")
    assert.deepEqual(row.claim_ids, ["claim-commercialization"])
    assert.equal(row.evidence[0].source_url, input.article.source_urls[0])
  }
  assert.equal(index.concepts.length, 0)
  assert.equal(
    graph.nodes.some((node) => node.type === "Concept"),
    false,
  )
  const ordinary = approval("ordinary", "9999999999999999", { conceptIds: [] })
  const plain = ontologyKnowledgeIndex("unused", projectEvidenceOntology([ordinary]), {
    inputLoader: () => ordinary,
  })
  assert.equal(Object.hasOwn(plain, "research_relationships"), false)
  assert.equal(Object.hasOwn(plain.events[0], "deep"), false)
})

test("ordinary paper references survive knowledge projection without deep analysis or concept nodes", () => {
  const input = approval("paper", "1234567890abcdef", { conceptIds: [] })
  input.article.record = {
    kind: "사건 뉴스",
    papers: [
      {
        work_id: "reviewed-paper",
        identifiers: ["doi:10.1234/reviewed"],
        access: "전문",
        status: null,
        evidence_url: input.article.source_urls[0],
        private_review_reason: "must not enter the reader projection",
      },
    ],
  }
  const graph = projectEvidenceOntology([input])
  const index = ontologyKnowledgeIndex("unused", graph, { inputLoader: () => input })
  assert.deepEqual(index.events[0].papers, [
    {
      work_id: "reviewed-paper",
      identifiers: ["doi:10.1234/reviewed"],
      access: "전문",
      status: null,
      evidence_url: input.article.source_urls[0],
    },
  ])
  assert.equal(Object.hasOwn(index.events[0], "deep"), false)
  assert.equal(index.concepts.length, 0)
  assert.equal(
    graph.nodes.some((node) => node.type === "Concept"),
    false,
  )
  input.article.record.papers = []
  assert.equal(
    Object.hasOwn(
      ontologyKnowledgeIndex("unused", graph, { inputLoader: () => input }).events[0],
      "papers",
    ),
    false,
  )
})

test("reviewed paper versions share one source-backed history without duplicate deep appearances", () => {
  const first = approval("preprint", "1234567890abcdea", { conceptIds: [] }),
    second = approval("publisher", "1234567890abcdeb", { conceptIds: [] })
  const paper = (input, identifiers, access, status) => ({
    work_id: "reviewed-paper",
    identifiers,
    access,
    status,
    evidence_url: input.article.source_urls[0],
    private_reason: "never projected",
  })
  first.article.record = { papers: [paper(first, ["arxiv:2609.12345v1"], "초록", "사전공개")] }
  second.article.record = {
    papers: [paper(second, ["arxiv:2609.12345v2", "doi:10.1234/reviewed"], "전문", null)],
  }
  second.draft.deep_context = {
    input: {
      kind: "논문 해설",
      topic_ids: [],
      event_claim_ids: ["claim-publisher"],
      basis: [],
      papers: second.article.record.papers.map((paper) => ({
        ...structuredClone(paper),
        claim_ids: ["claim-publisher"],
      })),
      relations: [],
    },
    review: { reviewed_at: "2026-09-21" },
  }
  const sources = new Map([first, second].map((input) => [input.run, input])),
    graph = projectEvidenceOntology([first, second]),
    original = JSON.stringify(graph),
    options = { inputLoader: (_root, run) => sources.get(run) },
    index = ontologyKnowledgeIndex("unused", graph, options),
    work = ontologyResearchPaper("unused", graph, "reviewed-paper", options)
  assert.deepEqual(index.research_papers, [work])
  assert.equal(work.events.length, 2)
  assert.deepEqual(work.identifiers, [
    "arxiv:2609.12345v1",
    "arxiv:2609.12345v2",
    "doi:10.1234/reviewed",
  ])
  assert.equal(work.events[0].access, "초록")
  assert.equal(work.events[1].status, null)
  assert.equal(work.events[1].evidence_url, second.article.source_urls[0])
  assert.equal(work.events[1].published_at, "2026-09-20")
  assert.equal(work.events[1].reviewed_at, "2026-09-21")
  assert(!JSON.stringify(work).includes("private_reason"))
  assert.equal(
    graph.nodes.some((node) => node.type === "Concept"),
    false,
  )
  assert.equal(JSON.stringify(graph), original)
  assert.throws(
    () => ontologyResearchPaper("unused", graph, "not-found", options),
    /work not found/,
  )
  assert.throws(() => ontologyResearchPaper("unused", graph, "../paper", options), /Exact reviewed/)
})

test("paper identifier conflicts across ordinary and deep articles fail before a knowledge index is returned", () => {
  for (const identifiers of [
    ["doi:10.1234/REVIEWED", "doi:10.1234/reviewed"],
    ["arxiv:2609.12345v1", "arxiv:2609.12345v2"],
  ]) {
    const first = approval("first-paper", "1234567890abcdea", { conceptIds: [] }),
      second = approval("second-paper", "1234567890abcdeb", { conceptIds: [] })
    first.article.record = {
      papers: [
        {
          work_id: "first-work",
          identifiers: [identifiers[0]],
          access: "전문",
          status: null,
          evidence_url: first.article.source_urls[0],
        },
      ],
    }
    second.draft.deep_context = {
      input: {
        kind: "논문 해설",
        topic_ids: [],
        event_claim_ids: ["claim-second-paper"],
        basis: [],
        papers: [
          {
            ...first.article.record.papers[0],
            work_id: "second-work",
            claim_ids: ["claim-second-paper"],
            identifiers: [identifiers[1]],
            evidence_url: second.article.source_urls[0],
          },
        ],
        relations: [],
      },
      review: { reviewed_at: "2026-09-21" },
    }
    const sources = new Map([first, second].map((input) => [input.run, input])),
      graph = projectEvidenceOntology([first, second]),
      bytes = JSON.stringify(graph)
    assert.throws(
      () =>
        ontologyKnowledgeIndex("unused", graph, { inputLoader: (_root, run) => sources.get(run) }),
      /Paper version identity conflict/,
    )
    assert.equal(JSON.stringify(graph), bytes)
  }
  assert.throws(() => main(["paper", "--snapshot", "fixture"]), /--work-id only/)
  assert.throws(
    () => main(["trace", "--snapshot", "fixture", "--work-id", "paper"]),
    /requires paper/,
  )
})

test("a reviewed paper correction updates current history and retains the old identity only in archived versions", () => {
  const previous = approval("old-paper", "1234567890abcdea", { conceptIds: [] }),
    current = approval("corrected-paper", "1234567890abcdea", { conceptIds: [] }),
    other = approval("other-paper", "1234567890abcdeb", { conceptIds: [] })
  for (const input of [previous, current, other])
    input.article.record = {
      papers: [
        {
          work_id: input === previous ? "mistaken-work" : "reviewed-paper",
          identifiers: ["doi:10.1234/reviewed"],
          access: "전문",
          status: null,
          evidence_url: input.article.source_urls[0],
        },
      ],
    }
  const sources = new Map([previous, current, other].map((input) => [input.run, input]))
  const options = {
    inputLoader: (_root, run) => sources.get(run),
    revisionLoader: (_root, old, replacement) => ({
      event_id: replacement.article.event_id,
      previous: { run: old.run, event_id: old.article.event_id, files: old.file_hashes },
      current: {
        run: replacement.run,
        event_id: replacement.article.event_id,
        files: replacement.file_hashes,
      },
      receipt: {
        path: "runs/corrected-paper/candidate-approval.json",
        sha256: sha256("corrected-paper"),
      },
    }),
  }
  const base = projectEvidenceOntology([previous, other]),
    bytes = JSON.stringify(base),
    graph = extendEvidenceOntology("unused", base, [current.run], options),
    index = ontologyKnowledgeIndex("unused", graph, options)
  assert.equal(index.research_papers.length, 1)
  assert.equal(index.research_papers[0].work_id, "reviewed-paper")
  assert.equal(index.research_papers[0].events.length, 2)
  assert.equal(
    index.events.find((event) => event.event_id === previous.article.event_id).previous_versions[0]
      .papers[0].work_id,
    "mistaken-work",
  )
  assert.equal(JSON.stringify(base), bytes)
})

test("research person histories preserve dated affiliations and keep namesakes as separate explicit IDs", () => {
  const inputs = ["earlier", "later", "namesake"].map((run, index) =>
    approval(run, String(index + 1).repeat(16), { conceptIds: [] }),
  )
  inputs.forEach((input, index) => {
    input.draft.deep_context = {
      input: {
        kind: "연구 사업화",
        topic_ids: [],
        event_claim_ids: ["claim-" + input.run],
        basis: [],
        papers: [],
        relations: [
          {
            person_id: index === 2 ? "professor-kim-second" : "professor-kim-first",
            person_name: "Professor Kim",
            affiliation: index === 0 ? "Earlier University" : "Later University",
            organization: "Reviewed Company",
            role: "기술자문",
            claim: "Explicitly reviewed advisory role",
            as_of: index === 0 ? "2026-09-19" : "2026-09-20",
            evidence_urls: input.article.source_urls,
            claim_ids: ["claim-" + input.run],
            private_reason: "must not enter the projection",
          },
        ],
      },
      review: { reviewed_at: "2026-09-21" },
    }
  })
  const sources = new Map(inputs.map((input) => [input.run, input])),
    graph = projectEvidenceOntology(inputs),
    bytes = JSON.stringify(graph),
    options = { inputLoader: (_root, run) => sources.get(run) },
    index = ontologyKnowledgeIndex("unused", graph, options),
    person = ontologyResearchPerson("unused", graph, "professor-kim-first", options)
  assert.equal(index.research_people.length, 2)
  assert.equal(person.relationships.length, 2)
  assert.deepEqual(
    person.relationships.map((relation) => relation.affiliation),
    ["Later University", "Earlier University"],
  )
  assert.deepEqual(
    person.relationships.map((relation) => relation.as_of),
    ["2026-09-20", "2026-09-19"],
  )
  assert.equal(person.relationships[0].reviewed_at, "2026-09-21")
  assert.equal(person.relationships[0].role, "기술자문")
  assert.equal(person.relationships[0].evidence[0].source_url, inputs[1].article.source_urls[0])
  assert.equal(
    index.research_people.find((item) => item.person_id === "professor-kim-second").relationships
      .length,
    1,
  )
  assert(!JSON.stringify(index.research_people).includes("private_reason"))
  assert.equal(JSON.stringify(graph), bytes)
  assert.throws(
    () => ontologyResearchPerson("unused", graph, "not-found", options),
    /person not found/,
  )
  assert.throws(() => main(["person", "--snapshot", "fixture"]), /--person-id only/)
  assert.throws(
    () => main(["paper", "--snapshot", "fixture", "--person-id", "professor"]),
    /requires person/,
  )
})

test("research identity conflicts across articles require review instead of silently merging people", () => {
  const first = approval("first-person", "1111111111111111", { conceptIds: [] }),
    second = approval("second-person", "2222222222222222", { conceptIds: [] })
  for (const input of [first, second])
    input.draft.deep_context = {
      input: {
        kind: "연구 사업화",
        topic_ids: [],
        event_claim_ids: ["claim-" + input.run],
        basis: [],
        papers: [],
        relations: [
          {
            person_id: "same-reviewed-id",
            person_name: input.run === first.run ? "Professor Kim" : "Professor Lee",
            affiliation: "University",
            organization: "Company",
            role: "기술자문",
            claim: "Reviewed role",
            as_of: "2026-09-20",
            evidence_urls: input.article.source_urls,
            claim_ids: ["claim-" + input.run],
          },
        ],
      },
      review: { reviewed_at: "2026-09-21" },
    }
  const sources = new Map([first, second].map((input) => [input.run, input])),
    graph = projectEvidenceOntology([first, second]),
    bytes = JSON.stringify(graph)
  assert.throws(
    () =>
      ontologyKnowledgeIndex("unused", graph, { inputLoader: (_root, run) => sources.get(run) }),
    /Person identity conflict/,
  )
  assert.equal(JSON.stringify(graph), bytes)
  const ordinary = approval("no-people", "3333333333333333", { conceptIds: [] })
  assert.equal(
    Object.hasOwn(
      ontologyKnowledgeIndex("unused", projectEvidenceOntology([ordinary]), {
        inputLoader: () => ordinary,
      }),
      "research_people",
    ),
    false,
  )
})

// Read-projection fixture. Native revision and note approvals are validated in
// research-candidate-approval/research-notes; these values are never intake data.
function specialistRevision() {
  const notePath = "Knowledge/Reviewed Concept.md"
  const content = (definition, example = "") =>
    "---\nconcept_id: reviewed-concept\nlabel: 검토된 평가 방법\naliases: [Reviewed Method]\nlast_reviewed: 2026-09-21\nmap_review:\n  decision: include\nverified_sources: [https://example.org/first]\n---\n\n## 한 문장 정의\n" +
    definition +
    "\n\n## 실제 예시\n" +
    example +
    "\n"
  const notes = new Map([
    ["before-note", content("이전에 원문을 검토한 정의다.", "이전 사건의 검증된 예시다.")],
    ["after-note", content("명시적으로 수정 승인한 정의다.", "현재 사건의 검증된 예시다.")],
  ])
  const before = approval("first", "1111111111111111")
  const after = { ...structuredClone(before), run: "revised" }
  after.file_hashes = { "approved-article.json": sha256("revised") }
  const assign = (input, noteRun) => {
    input.concept_review = {
      editorial_decision_sha256: sha256(noteRun),
      links: [
        {
          concept_id: "reviewed-concept",
          path: notePath.replace(/\.md$/, ""),
          evidence: [{ claim_id: "claim-first", event_id: input.article.event_id }],
        },
      ],
      notes: [{ path: notePath, sha256: sha256(notes.get(noteRun)), approval_run: noteRun }],
    }
  }
  assign(before, "before-note")
  assign(after, "after-note")
  const inputs = new Map([before, after].map((input) => [input.run, input]))
  const calls = []
  const proof = {
    event_id: after.article.event_id,
    previous: { run: before.run, event_id: before.article.event_id, files: before.file_hashes },
    current: { run: after.run, event_id: after.article.event_id, files: after.file_hashes },
    receipt: { path: "runs/reviewed-revision/candidate-approval.json", sha256: sha256("review") },
  }
  const options = {
    inputLoader: (_root, run) => {
      calls.push(run)
      return inputs.get(run)
    },
    revisionLoader: () => proof,
    noteApprovalLoader: (_root, run) => ({
      approval: { notes: [{ path: notePath, content: notes.get(run) }] },
    }),
  }
  const graph = extendEvidenceOntology(
    "unused",
    projectEvidenceOntology([before]),
    [after.run],
    options,
  )
  calls.length = 0
  return { before, after, inputs, calls, proof, options, graph, notes }
}

function impactFixture() {
  const f = specialistRevision()
  const background = approval("background", "9999999999999999", { conceptIds: [] })
  const noteSources = new Map([...f.inputs, [background.run, background]])
  const baseLoader = f.options.noteApprovalLoader
  f.options.noteApprovalLoader = (root, run) => {
    if (run === "signal-review")
      return {
        approval: {
          notes: [
            {
              path: "Signals/review.md",
              sha256: sha256("signal"),
              evidence: [{ run_id: "revised", claim_ids: ["claim-first"] }],
            },
          ],
        },
      }
    const value = baseLoader(root, run)
    for (const note of value.approval.notes) {
      note.sha256 = sha256(note.content)
      note.evidence = [{ run_id: "background", claim_ids: ["claim-background"] }]
    }
    return value
  }
  f.options.noteSourceLoader = (_root, run) => noteSources.get(run)
  return { ...f, background, noteSources }
}

test("impact traces definition background separately from related article evidence", () => {
  const f = impactFixture(),
    before = JSON.stringify(f.graph)
  const result = ontologyImpact(
    "unused",
    f.graph,
    { source_version_id: "version-background" },
    f.options,
  )
  assert.equal(result.articles.length, 0)
  assert.equal(result.related_histories.length, 0)
  assert.equal(result.definitions.length, 1)
  assert.equal(result.definitions[0].dependencies[0].run, "background")
  assert.equal(result.definitions[0].dependencies[0].claim_id, "claim-background")
  assert.equal(result.definitions[0].note_sha256, sha256(f.notes.get("after-note")))
  assert.equal(result.read_only, true)
  assert.equal(result.approvals_created, false)
  assert.equal(JSON.stringify(f.graph), before)
  assert.deepEqual(f.calls.sort(), ["first", "revised"], "each article approval loads once")
})

test("dependency impact reads all bound versions while public definition conflicts remain blocked", () => {
  const f = impactFixture(),
    other = structuredClone(f.before)
  other.run = "other-event"
  other.article.event_id = "2222222222222222"
  other.file_hashes = { "approved-article.json": sha256("other-event") }
  other.concept_review.links[0].evidence[0].event_id = other.article.event_id
  f.inputs.set(other.run, other)
  const graph = projectEvidenceOntology([f.after, other])
  assert.throws(
    () => ontologyKnowledgeIndex("unused", graph, f.options),
    /Conflicting latest specialist definitions/,
  )
  const result = ontologyImpact(
    "unused",
    graph,
    { source_version_id: "version-background" },
    f.options,
  )
  assert.equal(result.definitions.length, 2)
  assert.equal(new Set(result.definitions.map((definition) => definition.note_sha256)).size, 2)
  assert.equal(result.scope.current_definitions, 1)
  assert.equal(result.approvals_created, false)
  const eventImpact = ontologyImpact(
    "unused",
    graph,
    { event_id: f.after.article.event_id },
    f.options,
  )
  assert.equal(eventImpact.articles.length, 1)
  assert.equal(eventImpact.related_histories.length, 1)
})

test("impact current source/claim queries exclude archived article duplicates and co-occurrence", () => {
  const f = impactFixture()
  for (const query of [
    { source_version_id: "version-first" },
    { event_id: "1111111111111111" },
    { claim_id: "claim-first", run: "revised" },
  ]) {
    const result = ontologyImpact("unused", f.graph, query, f.options)
    assert.equal(result.articles.length, 1)
    assert.equal(result.articles[0].run, "revised")
    assert.equal(result.related_histories.length, 1)
    assert.equal(result.definitions.length, 0, "shared mentions are not definition evidence")
  }
  const archived = ontologyImpact(
    "unused",
    f.graph,
    { claim_id: "claim-first", run: "first" },
    f.options,
  )
  assert.equal(archived.articles.length, 0)
  assert.equal(archived.related_histories.length, 0)
})

test("impact includes only explicitly requested signal/topic approval versions", () => {
  const f = impactFixture()
  const result = ontologyImpact(
    "unused",
    f.graph,
    { source_version_id: "version-first" },
    {
      ...f.options,
      noteReviewRuns: ["signal-review"],
    },
  )
  assert.equal(result.additional_note_versions.length, 1)
  assert.equal(result.additional_note_versions[0].note_path, "Signals/review.md")
  assert.deepEqual(result.scope.explicit_additional_note_runs, ["signal-review"])
  assert.equal(
    ontologyImpact("unused", f.graph, { source_version_id: "version-first" }, f.options)
      .additional_note_versions.length,
    0,
  )
  assert.throws(
    () =>
      ontologyImpact(
        "unused",
        f.graph,
        { source_version_id: "version-first" },
        {
          ...f.options,
          noteReviewRuns: ["after-note"],
        },
      ),
    /Signals or TrendTopics/,
  )
})

test("impact refuses changed note facts and source approval lineage", () => {
  const f = impactFixture()
  f.background.claims[0].review.status = "unreviewed"
  assert.throws(
    () => ontologyImpact("unused", f.graph, { source_version_id: "version-background" }, f.options),
    /verified|Verified|review/,
  )
  const other = impactFixture()
  other.before.file_hashes = { tampered: "changed" }
  other.options.revisionLoader = () => ({
    ...other.proof,
    previous: { ...other.proof.previous, files: other.before.file_hashes },
  })
  assert.throws(
    () =>
      ontologyImpact("unused", other.graph, { source_version_id: "version-first" }, other.options),
    /changed/,
  )
})

test("impact requires exact selectors and claim provenance rather than broad labels", () => {
  for (const query of [
    {},
    { claim_id: "claim-first" },
    { source_version_id: "version-first", run: "first" },
    { event_id: "A Corp" },
    { source_version_id: "version-first", event_id: "1111111111111111" },
    { entity: "A Corp" },
  ])
    assert.throws(() => ontologyImpact("unused", {}, query), /exact/)
  assert.throws(
    () => main(["trace", "--snapshot", "fixture", "--source-version-id", "version-first"]),
    /require impact/,
  )
})

test("specialist revisions retain approved definitions and fact traces without duplicate current events", () => {
  const f = specialistRevision()
  const index = ontologyKnowledgeIndex("unused", f.graph, f.options)
  assert.equal(index.events.length, 1)
  assert.equal(index.entity_timelines[0].events.length, 1)
  assert.equal(index.concepts.length, 1)
  const view = index.concepts[0]
  assert.equal(view.current.definition, "명시적으로 수정 승인한 정의다.")
  assert.equal(view.current.examples, "현재 사건의 검증된 예시다.")
  assert.equal(view.definition_versions.length, 2)
  assert.equal(view.definition_versions[0].sha256, view.current.sha256)
  assert.equal(view.definition_versions[1].definition, "이전에 원문을 검토한 정의다.")
  assert.equal(view.events.length, 1)
  assert.equal(view.events[0].previous_versions.length, 1)
  assert.equal(
    view.events[0].previous_versions[0].definition_sha256,
    view.definition_versions[1].sha256,
  )
  assert.equal(view.events[0].previous_versions[0].published_at, view.events[0].published_at)
  assert.equal(
    view.events[0].previous_versions[0].facts[0].evidence[0].source_url,
    "https://example.org/first",
  )
  assert.deepEqual(
    f.calls.sort(),
    ["first", "revised"],
    "current and historical approvals load once",
  )
  assert.deepEqual(ontologyKnowledge("unused", f.graph, "reviewed-concept", f.options), view)
})

test("standalone specialist history rejects changed native lineage and archived definitions", () => {
  const f = specialistRevision()
  assert.throws(
    () =>
      ontologyKnowledge("unused", f.graph, "reviewed-concept", {
        ...f.options,
        revisionLoader: () => ({
          ...f.proof,
          receipt: { path: "changed", sha256: sha256("changed") },
        }),
      }),
    /revision evidence changed/,
  )
  f.notes.set("before-note", f.notes.get("before-note") + "tampered")
  assert.throws(
    () => ontologyKnowledge("unused", f.graph, "reviewed-concept", f.options),
    /definition changed/,
  )
})

test("removed concept assignments do not reappear from archived specialist history", () => {
  const f = specialistRevision()
  f.after.concept_review = null
  const graph = extendEvidenceOntology(
    "unused",
    projectEvidenceOntology([f.before]),
    [f.after.run],
    f.options,
  )
  const index = ontologyKnowledgeIndex("unused", graph, f.options)
  assert.equal(index.events.length, 1)
  assert.equal(index.events[0].previous_versions.length, 1)
  assert.equal(index.concepts.length, 0)
  assert.throws(
    () => ontologyKnowledge("unused", graph, "reviewed-concept", f.options),
    /concept not found/,
  )
})

test("specialist knowledge combines reviewed definitions with exact dated facts without invented sections", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ontology-knowledge-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const notePath = "Knowledge/Reviewed Concept.md"
  const content =
    "---\nconcept_id: reviewed-concept\nlabel: 검토된 평가 방법\naliases: [Reviewed Method]\nlast_reviewed: 2026-09-21\nmap_review:\n  decision: include\nverified_sources: [https://example.org/first]\n---\n\n## 한 문장 정의\n원문을 근거로 정의한 평가 방법이다.\n\n## 작동 원리\n검증한 조건에서 시험한다.\n\n## 혼동하기 쉬운 개념\n없음\n"
  fs.mkdirSync(path.join(root, "Knowledge"))
  fs.writeFileSync(path.join(root, notePath), content)
  const first = approval("first", "1111111111111111")
  first.concept_review = {
    editorial_decision_sha256: sha256("review"),
    links: [
      {
        concept_id: "reviewed-concept",
        path: notePath.replace(/\.md$/, ""),
        evidence: [{ claim_id: "claim-first", event_id: first.article.event_id }],
      },
    ],
    notes: [{ path: notePath, sha256: sha256(content) }],
  }
  const graph = projectEvidenceOntology([first]),
    options = { vault: root, inputLoader: () => first }
  const view = ontologyKnowledge("unused", graph, "reviewed-concept", options)
  assert.equal(view.current.definition, "원문을 근거로 정의한 평가 방법이다.")
  assert.equal(view.current.mechanism, "검증한 조건에서 시험한다.")
  assert.equal(Object.hasOwn(view.current, "distinctions"), false)
  assert.equal(Object.hasOwn(view, "analysis"), false)
  assert.equal(view.events[0].published_at, "2026-09-20")
  assert.equal(view.events[0].reviewed_at, "2026-09-21")
  assert.equal(view.events[0].facts[0].event_state, "planned")
  assert.equal(view.events[0].facts[0].evidence[0].source_url, "https://example.org/first")
  const older = approval("older", "4444444444444444", {
    conceptIds: ["reviewed-concept", "unreviewed-keyword"],
  })
  const inputs = new Map([first, older].map((input) => [input.run, input]))
  const calls = []
  const combined = projectEvidenceOntology([first, older])
  const index = ontologyKnowledgeIndex("unused", combined, {
    vault: root,
    inputLoader: (_root, run) => {
      calls.push(run)
      return inputs.get(run)
    },
  })
  assert.equal(index.graph_sha256, combined.sha256)
  assert.equal(index.events.length, 2)
  assert.ok(
    index.events.every(
      (event) => event.facts.length === 1 && event.facts[0].event_state === "planned",
    ),
  )
  assert.deepEqual(
    index.concepts.map((concept) => concept.concept_id),
    ["reviewed-concept"],
  )
  assert.equal(
    index.concepts[0].events.length,
    1,
    "older unreviewed concept assignment is not a learning source",
  )
  assert.equal(
    index.entity_timelines[0].events.length,
    2,
    "approved company events remain distinct",
  )
  assert.equal(index.entity_timelines[0].events[0].reviewed_at, "2026-09-21")
  assert.equal(index.entity_timelines[0].events[0].article_path, "news/1111111111111111")
  assert.equal(
    index.entity_timelines[0].events[0].claims[0].evidence[0].source_url,
    "https://example.org/first",
  )
  assert.deepEqual(calls.sort(), ["first", "older"], "each native approval is loaded only once")
  const actual = inputs.get("older")
  inputs.set("older", { ...actual, file_hashes: { changed: "different" } })
  assert.throws(
    () =>
      ontologyKnowledgeIndex("unused", combined, {
        vault: root,
        inputLoader: (_root, run) => inputs.get(run),
      }),
    /approval changed/,
  )
  inputs.set("older", actual)
  assert.throws(() => ontologyKnowledge("unused", graph, "a-corp", options), /concept not found/)
  fs.appendFileSync(path.join(root, notePath), "changed")
  assert.throws(
    () => ontologyKnowledge("unused", graph, "reviewed-concept", options),
    /definition changed/,
  )
  fs.writeFileSync(path.join(root, notePath), content)
  const old = first.file_hashes
  first.file_hashes = { changed: "different" }
  assert.throws(
    () => ontologyKnowledge("unused", graph, "reviewed-concept", options),
    /approval changed/,
  )
  first.file_hashes = old
  const legacy = approval("legacy", "3333333333333333")
  assert.throws(
    () =>
      ontologyKnowledge("unused", projectEvidenceOntology([legacy]), "reviewed-concept", {
        vault: root,
        inputLoader: () => legacy,
      }),
    /Explicit source-backed/,
  )
})

test("approved facts become a deterministic typed graph with exact evidence and time states", () => {
  const first = approval("first", "1111111111111111"),
    second = approval("second", "2222222222222222", {
      state: "completed",
      conceptIds: [],
    })
  const graph = projectEvidenceOntology([second, first])
  assert.deepEqual(graph, projectEvidenceOntology([first, second]))
  assert.equal(assertEvidenceOntology(graph), graph)
  assert.equal(graph.nodes.filter((node) => node.type === "Claim").length, 2)
  assert.equal(graph.nodes.filter((node) => node.type === "EntityMention").length, 2)
  assert.equal(
    graph.nodes.some((node) => node.statement?.includes("Unreviewed candidate")),
    false,
  )
  assert.equal(graph.edges.filter((edge) => edge.property === "explains").length, 1)
  const trace = traceOntologyClaim(graph, "claim-first")
  assert.equal(trace.claim.event_state, "planned")
  assert.equal(trace.evidence[0].quote, first.claims[0].evidence[0].quote)
  assert.equal(trace.evidence[0].source_url, first.documents[0].original_url)
  assert.equal(trace.evidence[0].source_sha256, first.documents[0].body_sha256)
  assert.deepEqual(
    ontologyEntityTimeline(graph, "a corp").events.map((item) => item.states_in_verified_claims),
    [["planned"], ["completed"]],
  )
  assert.equal(ontologyEntityTimeline(graph, "a corp").events[0].claims[0].effective_period, "2027")
  assert.equal(ontologyEntityTimeline(graph, "a corp").identity_scope, "exact_editorial_label_only")
  assert.deepEqual(
    ontologyConceptArticles(graph, "reviewed-concept").articles.map((item) => item.event_id),
    ["1111111111111111"],
  )
})

test("unverified, ungrounded and duplicate event inputs fail closed", () => {
  const input = approval("first", "1111111111111111")
  input.claims[0].review.status = "deferred"
  assert.throws(() => projectEvidenceOntology([input]), /verified claims/)
  input.claims[0].review.status = "verified"
  input.claims[0].evidence[0].quote = "not in the stored source"
  assert.throws(() => projectEvidenceOntology([input]), /Verified claim requires|Reviewed fact/)
  input.claims[0].evidence[0].quote = input.parses[0].blocks[0].text
  assert.throws(
    () => projectEvidenceOntology([input, approval("second", "1111111111111111")]),
    /Distinct approved event IDs/,
  )
})

test("snapshot validation rejects hash changes and invalid relation types", () => {
  const graph = projectEvidenceOntology([approval("first", "1111111111111111")])
  const edited = structuredClone(graph)
  edited.nodes.find((node) => node.type === "Claim").event_state = "completed"
  assert.throws(() => assertEvidenceOntology(edited), /hash mismatch/)
  const invalid = structuredClone(graph)
  invalid.edges.find((edge) => edge.property === "evidencedBy").property = "describes"
  const { sha256: _old, ...body } = invalid
  invalid.sha256 = sha256(JSON.stringify(body))
  assert.throws(() => assertEvidenceOntology(invalid), /domain or range/)
  const detached = structuredClone(graph)
  detached.edges = detached.edges.filter((edge) => edge.property !== "locatedIn")
  const { sha256: _previous, ...detachedBody } = detached
  detached.sha256 = sha256(JSON.stringify(detachedBody))
  assert.throws(() => assertEvidenceOntology(detached), /provenance chain/)
})

test("CLI validates trend selections and keeps them out of unrelated commands", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ontology-trend-cli-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  atomicCreate(
    root,
    "ontology/pilot/graph.json",
    projectEvidenceOntology([approval("first", "1111111111111111")]),
  )
  const file = path.join(root, "trends.json")
  const args = ["--root", root, "--snapshot", "pilot", "--trend-reviews", file]
  fs.writeFileSync(file, "[]")
  // An empty selection never substitutes for the native article approval.
  assert.throws(() => main(["knowledge-index", ...args]), /ENOENT/)
  for (const command of ["build", "extend", "knowledge", "trace", "timeline", "company"])
    assert.throws(() => main([command, ...args]), /requires knowledge-index or impact/)
  for (const invalid of [{}, ["same", "same"], ["../outside"], Array(65).fill("run")]) {
    fs.writeFileSync(file, JSON.stringify(invalid))
    assert.throws(() => main(["knowledge-index", ...args]), /Distinct native trend approval/)
  }
  fs.writeFileSync(file, '["missing-native-approval"]')
  assert.throws(() => main(["knowledge-index", ...args]), /ENOENT/)
})

test("CLI reads private snapshots and refuses absent approvals or replacement", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "research-ontology-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const graph = projectEvidenceOntology([approval("first", "1111111111111111")])
  atomicCreate(root, "ontology/pilot/graph.json", graph)
  const timeline = main(["timeline", "--root", root, "--snapshot", "pilot", "--entity", "A Corp"])
  assert.equal(timeline.events.length, 1)
  assert.equal(
    main(["trace", "--root", root, "--snapshot", "pilot", "--claim-id", "claim-first"]).evidence[0]
      .source_url,
    "https://example.org/first",
  )
  assert.equal(
    main(["concept", "--root", root, "--snapshot", "pilot", "--concept-id", "reviewed-concept"])
      .articles.length,
    1,
  )
  assert.throws(
    () => main(["build", "--root", root, "--snapshot", "pilot", "--approved-run", "first"]),
    /already exists/,
  )
  assert.throws(
    () => main(["build", "--root", root, "--snapshot", "new", "--approved-run", "first"]),
    /ENOENT/,
  )
  assert.equal(fs.existsSync(path.join(root, "ontology", "new", "graph.json")), false)
})

function companyReview(inputs, companies) {
  return {
    schema: "research-company-identity-review/v1",
    reviewer: "test",
    reviewed_at: "2026-09-21",
    companies: companies.map(({ id, label, kind = "company", assignments }) => ({
      company_id: id,
      label,
      kind,
      assignments: assignments.map(
        ({ index, entity_label = "A Corp", source_names = ["A Corp"] }) => ({
          run: inputs[index].run,
          event_id: inputs[index].article.event_id,
          approval_files_sha256: sha256(JSON.stringify(inputs[index].file_hashes)),
          entity_label,
          source_names,
          claim_ids: [inputs[index].claims[0].claim_id],
          as_of: "2026-09-20",
          identity_checked: true,
          kind_checked: true,
          reason: "Reviewed exact source name and the scoped editorial translation.",
        }),
      ),
    })),
  }
}

test("company history groups only reviewed event aliases and keeps brands separate", () => {
  const first = approval("company-first", "1111111111111111", { conceptIds: [] })
  const second = approval("company-second", "2222222222222222", { conceptIds: [] })
  const unreviewed = approval("company-third", "3333333333333333", { conceptIds: [] })
  second.article.entities = ["A사", "product P"]
  const inputs = [first, second, unreviewed]
  const graph = projectEvidenceOntology(inputs),
    bytes = JSON.stringify(graph)
  const options = {
    inputLoader: (_root, run) => inputs.find((input) => input.run === run),
    companyReview: companyReview(inputs, [
      {
        id: "a-company",
        label: "A Corp",
        assignments: [{ index: 0 }, { index: 1, entity_label: "A사" }],
      },
      {
        id: "p-brand",
        label: "P",
        kind: "brand",
        assignments: [{ index: 1, entity_label: "product P", source_names: ["product P"] }],
      },
    ]),
  }
  const index = ontologyKnowledgeIndex("unused", graph, options)
  assert.equal(index.events.length, 3)
  assert.equal(index.company_timelines.length, 2)
  const company = ontologyCompany("unused", graph, "a-company", options)
  assert.deepEqual(
    company.events.map((event) => event.event_id),
    ["1111111111111111", "2222222222222222"],
  )
  assert.equal(company.events[1].identity_assignments[0].entity_label, "A사")
  assert.equal(company.events[1].identity_assignments[0].as_of, "2026-09-20")
  assert.equal(company.events[1].identity_assignments[0].reviewed_at, "2026-09-21")
  assert.equal(company.events[1].facts.length, 1)
  assert.equal(company.events[1].facts[0].claim_id, second.claims[0].claim_id)
  assert.equal(company.events[1].facts[0].statement, second.claims[0].statement)
  assert.equal(company.events[1].facts[0].claim_kind, "attributed_fact")
  assert.equal(company.events[1].facts[0].event_state, "planned")
  assert.equal(company.events[1].facts[0].effective_period, "2027")
  assert.equal(
    company.events[1].facts[0].evidence[0].source_url,
    "https://example.org/company-second",
  )
  assert.equal(
    company.events.some((event) => event.event_id === unreviewed.article.event_id),
    false,
  )
  assert.equal(
    company.events[1].identity_assignments[0].evidence[0].source_url,
    "https://example.org/company-second",
  )
  assert.equal(index.company_timelines[1].kind, "brand")
  assert.equal(index.company_timelines[1].events.length, 1)
  assert.equal(JSON.stringify(index.company_timelines).includes("reason"), false)
  assert.equal(JSON.stringify(index.company_timelines).includes("approval_files_sha256"), false)
  assert.equal(JSON.stringify(graph), bytes, "identity read model never rewrites graph")
  assert.equal(
    Object.hasOwn(
      ontologyKnowledgeIndex("unused", graph, { inputLoader: options.inputLoader }),
      "company_timelines",
    ),
    false,
  )
  assert.throws(() => ontologyCompany("unused", graph, "a-company"), /explicit identity review/)
  assert.throws(() => ontologyCompany("unused", graph, "missing", options), /not found/)
})

test("company assignments preserve their review dates when the company ledger expands", () => {
  const input = approval("company-first", "1111111111111111", { conceptIds: [] })
  const graph = projectEvidenceOntology([input])
  const review = companyReview(
    [input],
    [{ id: "a-company", label: "A Corp", assignments: [{ index: 0 }] }],
  )
  review.reviewed_at = "2026-09-22"
  review.companies[0].assignments[0].reviewed_at = "2026-09-21"
  const read = () =>
    ontologyKnowledgeIndex("unused", graph, { inputLoader: () => input, companyReview: review })
  assert.equal(
    read().company_timelines[0].events[0].identity_assignments[0].reviewed_at,
    "2026-09-21",
  )
  review.companies[0].assignments[0].reviewed_at = "2026-09-23"
  assert.throws(read, /cannot follow its review/)
  review.companies[0].assignments[0].reviewed_at = "2026-09-19"
  assert.throws(read, /cannot follow its review/)
  review.companies[0].assignments[0].reviewed_at = "2026-09-20"
  assert.throws(read, /predates article review/)
  review.companies[0].assignments[0].reviewed_at = ""
  assert.throws(read, /review|date/i)
})

test("company identity refuses stale approvals, unrelated mentions and source-name substrings", () => {
  const first = approval("company-current", "1111111111111111", { conceptIds: [] })
  const graph = projectEvidenceOntology([first])
  const original = companyReview(
    [first],
    [{ id: "a-company", label: "A Corp", assignments: [{ index: 0 }] }],
  )
  const read = (review) =>
    ontologyKnowledgeIndex("unused", graph, { inputLoader: () => first, companyReview: review })
  const bad = (change, pattern) => {
    const review = structuredClone(original)
    change(review.companies[0].assignments[0], review)
    assert.throws(() => read(review), pattern)
  }
  bad((assignment) => {
    assignment.approval_files_sha256 = "0".repeat(64)
  }, /current approved article/)
  bad((assignment) => {
    assignment.run = "older-revision"
  }, /current approved article/)
  bad((assignment) => {
    assignment.event_id = "2222222222222222"
  }, /current approved article/)
  bad((assignment) => {
    assignment.entity_label = "Group parent"
  }, /no reviewed mention/)
  bad((assignment) => {
    assignment.source_names = ["Cor"]
  }, /missing from selected approved evidence/)
  // A word present in the source is not enough when the explicit reviewed mention is absent.
  bad((assignment) => {
    assignment.source_names = ["A Corp Holdings"]
  }, /missing from selected approved evidence/)
  bad((assignment) => {
    assignment.claim_ids = ["unused-company-current"]
  }, /not found/)
  bad((_assignment, review) => {
    review.reviewed_at = "2026-09-20"
  }, /predates article review/)
  assert.equal(read(original).company_timelines.length, 1)
})

test("company identity distinguishes namesakes and validates kinds and per-event ambiguity", () => {
  const inputs = [
    approval("company-one", "1111111111111111", { conceptIds: [] }),
    approval("company-two", "2222222222222222", { conceptIds: [] }),
  ]
  const graph = projectEvidenceOntology(inputs)
  const review = companyReview(inputs, [
    { id: "first-company", label: "A Corp", assignments: [{ index: 0 }] },
    { id: "second-company", label: "A Corp", assignments: [{ index: 1 }] },
  ])
  const index = ontologyKnowledgeIndex("unused", graph, {
    inputLoader: (_root, run) => inputs.find((input) => input.run === run),
    companyReview: review,
  })
  assert.equal(index.company_timelines.length, 2, "equal names do not merge distinct IDs")
  const duplicate = structuredClone(review)
  duplicate.companies[1].assignments = duplicate.companies[0].assignments
  assert.throws(() => assertCompanyIdentityReview(duplicate), /more than once/)
  const invalid = structuredClone(review)
  invalid.companies[0].kind = "product"
  assert.throws(() => assertCompanyIdentityReview(invalid), /explicit company ID, kind/)
  invalid.companies[0].kind = "division"
  assert.equal(assertCompanyIdentityReview(invalid), invalid)
  invalid.companies[0].assignments[0].kind_checked = false
  assert.throws(() => assertCompanyIdentityReview(invalid), /reviewed company assignment/)
  assert.throws(
    () => main(["knowledge-index", "--snapshot", "test", "--company-id", "a-company"]),
    /requires company/,
  )
  assert.throws(
    () => main(["timeline", "--snapshot", "test", "--company-review", "review.json"]),
    /requires company or knowledge-index/,
  )
  assert.throws(
    () => main(["company", "--snapshot", "test", "--company-id", "a-company"]),
    /requires --company-id and --company-review/,
  )
})
