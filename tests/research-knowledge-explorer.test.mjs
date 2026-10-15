import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { knowledgeFixture, addKnowledgeArticle } from "./fixtures/research-knowledge-fixtures.mjs"
import { ontologyKnowledgeIndex } from "../scripts/research/ontology-knowledge.mjs"
import {
  loadApprovedOntologyInput,
  projectEvidenceOntology,
} from "../scripts/research/ontology.mjs"
import { approvedArticle } from "../scripts/research/publish-adapter.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"
import { noteText } from "../scripts/garden.mjs"
import { exploreKnowledge } from "../scripts/research/knowledge-explorer.mjs"
import {
  renderKnowledgeExplorerHTML,
  renderKnowledgeExplorerMarkdown,
} from "../scripts/research/knowledge-explorer-view.mjs"

function pin(f, index, graph = f.graph) {
  atomicWrite(f.root, "explorer/graph.json", graph)
  atomicWrite(f.root, "explorer/index.json", index)
  return {
    index_file: "explorer/index.json",
    index_sha256: sha256(fs.readFileSync(path.join(f.root, "explorer/index.json"))),
    graph_file: "explorer/graph.json",
    graph_sha256: sha256(fs.readFileSync(path.join(f.root, "explorer/graph.json"))),
  }
}
async function setup(t) {
  const f = await knowledgeFixture(t)
  const index = ontologyKnowledgeIndex(f.root, f.graph, {
    vault: f.vault,
    knowledgeSelections: f.selections,
  })
  return { ...f, index, p: pin(f, index) }
}
function identityReview(f, inputs) {
  return {
    schema: "research-company-identity-review/v1",
    reviewer: "Fixture reviewer",
    reviewed_at: "2026-09-28",
    companies: inputs.map((input, i) => ({
      company_id: i ? "peer-manufacturer" : "hd-hyundai-robotics",
      label: i ? "Peer manufacturer" : "HD현대로보틱스",
      kind: "company",
      assignments: [
        {
          run: input.run,
          event_id: input.article.event_id,
          approval_files_sha256: sha256(JSON.stringify(input.file_hashes)),
          entity_label: "Mechanism",
          source_names: ["Mechanism"],
          claim_ids: input.draft.draft.lead[0].claim_ids,
          as_of: input.article.article_review.published_at,
          reviewed_at: "2026-09-28",
          identity_checked: true,
          kind_checked: true,
          reason:
            "Fixture-only explicit company assignment over source-quoted identity; no production identity is created.",
        },
      ],
    })),
  }
}
function pinCompanyReview(f, review) {
  atomicWrite(f.root, "explorer/companies.json", review)
  return {
    company_review_file: "explorer/companies.json",
    company_review_sha256: sha256(fs.readFileSync(path.join(f.root, "explorer/companies.json"))),
  }
}
function numericInput(f, { run, literal, period = "2027" }) {
  addKnowledgeArticle(f, {
    run,
    url: `https://fixture.example/${run}`,
    text: `Mechanism plans ${literal} robot cells in ${period} under standard throughput.`,
    publishedAt: "2026-09-25",
  })
  const read = (name) => JSON.parse(fs.readFileSync(path.join(f.root, `runs/${run}/${name}`)))
  const { claims } = read("reviewed-claims.json")
  claims[0].effective_period = period
  claims[0].numbers = [{ literal, unit: "cells", condition: "standard throughput" }]
  const draft = read("draft.json"),
    review = read("editorial-review.json"),
    docs = read("documents.json"),
    parses = read("parses.json")
  const checkedClaims = recordFactReview(
    claims.map(({ review, ...claim }) => claim),
    claims.map((claim) => ({
      claim_id: claim.claim_id,
      status: "verified",
      reason: "Read the source's exact numeric literal, period and condition.",
      source_read: true,
      entailment_checked: true,
      identity_checked: true,
      numbers_checked: true,
      time_checked: true,
    })),
    { reviewer: "Fixture reviewer", reviewed_at: "2026-09-26" },
    parses,
  )
  atomicWrite(f.root, `runs/${run}/reviewed-claims.json`, { claims: checkedClaims })
  atomicWrite(
    f.root,
    `runs/${run}/approved-article.json`,
    approvedArticle(draft, checkedClaims, docs, review, parses),
  )
  return loadApprovedOntologyInput(f.root, run, { vault: f.vault })
}

test("source-cited question retrieval keeps source dates and native IDs without model calls or writes", async (t) => {
  const f = await setup(t)
  const before = fs.readFileSync(path.join(f.root, "runs/source/approved-article.json"))
  const result = exploreKnowledge(f.ctx, {
    ...f.p,
    mode: "search",
    question: "배포 계획을 모아줘",
    from: "2026-09-25",
    to: "2026-09-25",
    limit: 1,
  })
  assert.equal(result.reader.items.length, 1)
  const item = result.reader.items[0]
  assert.equal(item.published_at, "2026-09-25")
  assert.equal(item.facts[0].published_at, "2026-09-25")
  assert.equal(item.article_path, `news/${item.event_id}`)
  assert.equal(
    item.facts[0].evidence[0].quote,
    "The source mechanism reuses the target during a planned deployment.",
  )
  assert.match(item.facts[0].evidence[0].block_id, /:b1$/)
  assert.equal(result.model_calls, 0)
  assert.equal(result.canonical_writes, false)
  assert.deepEqual(fs.readFileSync(path.join(f.root, "runs/source/approved-article.json")), before)
  const html = renderKnowledgeExplorerHTML(result),
    markdown = renderKnowledgeExplorerMarkdown(result)
  assert.match(html, /<details class="source-quotes">/)
  assert.match(html, /#AI/)
  assert.match(markdown, /fixture.example\/mechanism/)
  assert.equal(html.includes("index_sha256"), false)
  assert.equal(html.includes("model_calls"), false)
})

test("fixed index, graph and source bytes must still match before answering", async (t) => {
  const f = await setup(t)
  const p = { ...f.p, mode: "search", question: "배포" }
  assert.throws(
    () => exploreKnowledge(f.ctx, { ...p, index_sha256: "0".repeat(64) }),
    /SHA-256 mismatch/,
  )
  assert.throws(
    () => exploreKnowledge(f.ctx, { ...p, graph_sha256: "0".repeat(64) }),
    /SHA-256 mismatch/,
  )
  fs.appendFileSync(path.join(f.root, "documents/body.bin"), " Changed source bytes.")
  assert.throws(() => exploreKnowledge(f.ctx, p), /changed|mismatch|bytes/i)
})

test("specialist learning uses the native definition and hides empty mechanism and map sections", async (t) => {
  const f = await setup(t)
  const result = exploreKnowledge(f.ctx, { ...f.p, mode: "concept", concept_id: "source-concept" })
  assert.equal(result.reader.definition.definition, "원문에서 설명한 작동 원리.")
  assert.equal(result.reader.definition.note_approval.run, "notes")
  assert.equal(result.reader.events.length, 0)
  const html = renderKnowledgeExplorerHTML(result)
  assert.match(html, /knowledge\/source-concept/)
  assert.equal(html.includes('id="mechanism"'), false)
  assert.equal(html.includes("관련 사건"), false)
  assert.equal(html.includes("knowledge-map"), false)
  fs.appendFileSync(
    path.join(f.vault, "Knowledge/source-concept.md"),
    "\nChanged authority bytes.\n",
  )
  assert.throws(
    () => exploreKnowledge(f.ctx, { ...f.p, mode: "concept", concept_id: "source-concept" }),
    /definition bytes changed/,
  )
})

test("co-occurrence cannot manufacture a specialist event assignment", async (t) => {
  const f = await setup(t)
  f.index.concepts[0].events = [f.index.events[0]]
  const p = pin(f, f.index)
  assert.throws(
    () =>
      exploreKnowledge(f.ctx, {
        ...p,
        mode: "concept",
        concept_id: f.index.concepts[0].concept_id,
      }),
    /explicit reviewed article assignment/,
  )
})

test("weekly accumulation removes an identical repeated lead but retains both source event references", async (t) => {
  const f = await setup(t)
  const second = addKnowledgeArticle(f, { run: "followup", publishedAt: "2026-09-26" })
  const graph = projectEvidenceOntology([
    loadApprovedOntologyInput(f.root, "source", { vault: f.vault }),
    second,
  ])
  const index = ontologyKnowledgeIndex(f.root, graph, { vault: f.vault })
  const p = pin(f, index, graph)
  const result = exploreKnowledge(f.ctx, {
    ...p,
    mode: "weekly",
    from: "2026-09-25",
    to: "2026-09-26",
  })
  assert.equal(result.reader.groups.length, 1)
  assert.equal(result.reader.groups[0].facts.length, 1)
  assert.equal(result.reader.groups[0].facts[0].events.length, 2)
  assert.equal(result.reader.groups[0].facts[0].evidence.length, 2)
  const md = renderKnowledgeExplorerMarkdown(result)
  assert.equal(
    md.split("The source mechanism reuses the target during a planned deployment.").length,
    3,
    "two exact source quotes",
  )
  assert.equal(
    md.split(result.reader.groups[0].facts[0].display_text).length,
    2,
    "one native approved Korean reading paragraph",
  )
  assert.equal(md.includes("성장"), false)
  assert.equal(md.includes("진전했다"), false)
})

test("publicly excluded facts disappear from search and weekly results", async (t) => {
  const f = await setup(t)
  const event = f.index.events[0]
  atomicWrite(
    f.vault,
    `News/${event.event_id}.md`,
    noteText({ title: event.title, review_status: "excluded" }, ""),
  )
  const search = exploreKnowledge(f.ctx, { ...f.p, mode: "search", question: "배포" })
  const weekly = exploreKnowledge(f.ctx, {
    ...f.p,
    mode: "weekly",
    from: "2026-09-25",
    to: "2026-09-26",
  })
  assert.deepEqual(search.reader.items, [])
  assert.deepEqual(weekly.reader.groups, [])
  assert.equal(renderKnowledgeExplorerHTML(search).includes(event.title), false)
})

test("reviewed company facets include HD Hyundai Robotics and keep company identities separate", async (t) => {
  const f = await setup(t)
  const source = loadApprovedOntologyInput(f.root, "source", { vault: f.vault })
  const review = identityReview(f, [source])
  const identity = pinCompanyReview(f, review)
  const comparison = {
    schema: "research-knowledge-explorer-review/v1",
    index_sha256: f.p.index_sha256,
    graph_sha256: f.p.graph_sha256,
    reviewer: "Fixture reviewer",
    reviewed_at: "2026-09-28",
    source_read: true,
    identity_checked: true,
    conditions_checked: true,
    company_facets: [
      {
        company_id: "hd-hyundai-robotics",
        event_id: source.article.event_id,
        claim_id: "unassigned",
        axis: "investment_production",
      },
    ],
    concept_facets: [],
    comparisons: [],
  }
  atomicWrite(f.root, "explorer/comparison.json", comparison)
  const p = {
    ...f.p,
    ...identity,
    mode: "companies",
    company_ids: ["hd-hyundai-robotics"],
    comparison_review_file: "explorer/comparison.json",
    comparison_review_sha256: sha256(
      fs.readFileSync(path.join(f.root, "explorer/comparison.json")),
    ),
  }
  const result = exploreKnowledge(f.ctx, p)
  assert.equal(result.reader.companies[0].label, "HD현대로보틱스")
  assert.equal(result.reader.companies[0].axes[0].label, "투자·생산")
  assert.equal(result.reader.companies[0].axes[0].items[0].fact.event_state, "planned")
  assert.match(renderKnowledgeExplorerHTML(result), /투자·생산/)
  assert.equal(result.reader.comparisons, undefined)
  assert.throws(
    () => exploreKnowledge(f.ctx, { ...p, company_ids: ["same-name-other-company"] }),
    /reviewed company identity not found/,
  )
  review.companies[0].assignments[0].source_names = ["Mech"]
  const badIdentity = pinCompanyReview(f, review)
  assert.throws(
    () => exploreKnowledge(f.ctx, { ...p, ...badIdentity }),
    /source name and event mention/,
  )
})

test("numeric comparisons only expose exact source values under equal metric, period, unit, scope and conditions", async (t) => {
  const f = await setup(t)
  const inputs = [
    numericInput(f, { run: "manufacturer-a", literal: "10" }),
    numericInput(f, { run: "manufacturer-b", literal: "20" }),
  ]
  const graph = projectEvidenceOntology(inputs),
    index = ontologyKnowledgeIndex(f.root, graph, { vault: f.vault })
  const p = pin(f, index, graph),
    identity = pinCompanyReview(f, identityReview(f, inputs))
  const items = inputs.map((input, i) => ({
    company_id: i ? "peer-manufacturer" : "hd-hyundai-robotics",
    event_id: input.article.event_id,
    claim_id: input.claims[0].claim_id,
    number_index: 0,
    metric: "robot cells",
    scope: "robot cells",
    period: "2027",
    conditions: ["standard throughput"],
  }))
  const review = {
    schema: "research-knowledge-explorer-review/v1",
    index_sha256: p.index_sha256,
    graph_sha256: p.graph_sha256,
    reviewer: "Fixture reviewer",
    reviewed_at: "2026-09-28",
    source_read: true,
    identity_checked: true,
    conditions_checked: true,
    company_facets: [],
    concept_facets: [],
    comparisons: [{ id: "cells", label: "2027년 로봇 셀 계획", kind: "company", items }],
  }
  function query() {
    atomicWrite(f.root, "explorer/comparison.json", review)
    return exploreKnowledge(f.ctx, {
      ...p,
      ...identity,
      mode: "companies",
      comparison_review_file: "explorer/comparison.json",
      comparison_review_sha256: sha256(
        fs.readFileSync(path.join(f.root, "explorer/comparison.json")),
      ),
    })
  }
  const sameConditions = query()
  assert.deepEqual(
    sameConditions.reader.comparisons[0].items.map((item) => item.measure.literal),
    ["10", "20"],
  )
  assert.equal(JSON.stringify(sameConditions.reader.comparisons).includes("growth"), false)
  assert.match(renderKnowledgeExplorerHTML(sameConditions), /<th scope="col">robot cells<\/th>/)
  review.comparisons[0].items[1].period = "2028"
  const differentPeriod = query()
  assert.equal(differentPeriod.reader.comparisons, undefined)
  assert.equal(renderKnowledgeExplorerHTML(differentPeriod).includes("2027년 로봇 셀 계획"), false)
})

test("question dates, bounded pagination and unsafe markup remain under explicit read contracts", async (t) => {
  const f = await setup(t)
  assert.throws(
    () => exploreKnowledge(f.ctx, { ...f.p, mode: "search" }),
    /question or explicit filters/,
  )
  assert.throws(
    () => exploreKnowledge(f.ctx, { ...f.p, mode: "search", question: "배포", from: "2026-02-31" }),
    /real calendar date/,
  )
  assert.throws(
    () => exploreKnowledge(f.ctx, { ...f.p, mode: "search", question: "배포", limit: 101 }),
    /bound exceeded/,
  )
  const result = exploreKnowledge(f.ctx, {
    ...f.p,
    mode: "search",
    question: "<script>alert(1)</script> 배포",
    limit: 1,
  })
  const html = renderKnowledgeExplorerHTML(result)
  assert.equal(html.includes("<script>"), false)
  assert.match(html, /&lt;script&gt;/)
  assert.match(html, /name="viewport"/)
  assert.match(html, /:focus-visible/)
})

test("manufacturer baseline offers explicit identity review candidates without automatic assignments", async (t) => {
  const f = await setup(t)
  atomicWrite(f.ctx.repo, "data/research-watchlist.json", {
    robot_manufacturers: [{ id: "hd-robotics", name: "HD현대로보틱스", aliases: ["Mechanism"] }],
  })
  const result = exploreKnowledge(f.ctx, { ...f.p, mode: "companies" })
  assert.deepEqual(result.reader.companies, [])
  assert.equal(result.company_review_candidates.watchlist[0].label, "HD현대로보틱스")
  assert.equal(result.company_review_candidates.candidates.length, 1)
  assert.equal(result.company_review_candidates.candidates[0].status, "identity_review_required")
  assert.deepEqual(result.company_review_candidates.review_template.companies, [])
  assert.equal(result.company_review_candidates.identities_created, false)
  assert.equal(renderKnowledgeExplorerHTML(result).includes("identity_review_required"), false)
  assert.equal(renderKnowledgeExplorerHTML(result).includes('<nav class="reading-tabs"'), false)
})

test("reader sentences reuse only exact approved prose whose claim IDs are selected", async (t) => {
  const f = await setup(t)
  const result = exploreKnowledge(f.ctx, { ...f.p, mode: "search", question: "배포" })
  const event = result.reader.items[0]
  const approved = JSON.parse(fs.readFileSync(path.join(f.root, "runs/source/draft.json"))).draft
  assert.ok(event.paragraphs.length)
  for (const paragraph of event.paragraphs) {
    assert.ok(
      [...approved.lead, ...approved.explanations.flatMap((section) => section.paragraphs)].some(
        (item) => JSON.stringify(item) === JSON.stringify(paragraph),
      ),
    )
    assert.ok(paragraph.claim_ids.every((id) => event.facts.some((fact) => fact.claim_id === id)))
  }
  assert.ok(renderKnowledgeExplorerHTML(result).includes(approved.lead[0].text))
})

test("keyword question filters recheck current specialist note bytes before selecting articles", async (t) => {
  const f = await setup(t)
  const p = { ...f.p, mode: "search", question: "source-concept 관련 기사" }
  assert.deepEqual(exploreKnowledge(f.ctx, p).query.concept_ids, ["source-concept"])
  fs.appendFileSync(
    path.join(f.vault, "Knowledge/source-concept.md"),
    "\nChanged current definition.\n",
  )
  assert.throws(() => exploreKnowledge(f.ctx, p), /definition bytes changed/)
})
