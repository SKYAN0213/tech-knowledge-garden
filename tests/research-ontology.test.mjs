import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256 } from "../scripts/research/contracts.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import {
  assertEvidenceOntology,
  ontologyConceptArticles,
  ontologyEntityTimeline,
  projectEvidenceOntology,
  traceOntologyClaim,
} from "../scripts/research/ontology.mjs"
import { main } from "../scripts/research-ontology.mjs"
import { atomicCreate } from "../scripts/research/run-state.mjs"

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
