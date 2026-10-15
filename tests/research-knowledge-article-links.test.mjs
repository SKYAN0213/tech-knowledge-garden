import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { knowledgeFixture, addKnowledgeArticle } from "./fixtures/research-knowledge-fixtures.mjs"
import { noteText } from "../scripts/garden.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"
import { approveNoteReview } from "../scripts/research/note-review.mjs"
import {
  projectEvidenceOntology,
  loadApprovedOntologyInput,
} from "../scripts/research/ontology.mjs"
import { syncKnowledgeWorkflow } from "../scripts/research/knowledge-workflow.mjs"
import { executeModule } from "../scripts/research/module-registry.mjs"

const read = (f, file) => JSON.parse(fs.readFileSync(path.join(f.root, file)))
const ref = (f, file) => ({ path: file, sha256: sha256(fs.readFileSync(path.join(f.root, file))) })
function basis(f, graph = f.graph) {
  const file = `graphs/${graph.sha256}.json`
  atomicWrite(f.root, file, graph)
  atomicWrite(f.root, "basis.json", {
    schema: "research-event-workflow/v1",
    ontology: ref(f, file),
  })
}
function links(f, inputs, file = "article-links.json") {
  atomicWrite(f.root, file, {
    schema: "research-knowledge-article-links/v1",
    basis: ref(f, "basis.json"),
    articles: inputs.map((input) => ({
      run: input.run,
      event_id: input.article.event_id,
      files: input.file_hashes,
    })),
  })
  return file
}
const sync = (f, extra = {}) =>
  syncKnowledgeWorkflow({
    root: f.root,
    vault: f.vault,
    workflowId: "article-links",
    basisFile: "basis.json",
    maxItems: 256,
    ...extra,
  })
async function signal(f, inputs) {
  const file = "Signals/linked.md"
  atomicWrite(
    f.vault,
    "Editions/linked.md",
    noteText(
      {
        title: "linked",
        type: "briefing",
        scheduled_at: "2026-09-25T08:00:00+09:00",
        article_reviews: inputs.map((input) => ({ event_id: input.article.event_id })),
      },
      "Fixture issue.",
    ),
  )
  const content = noteText(
    {
      schema_version: "tech-signals/v1",
      type: "trend-observations",
      edition: "Editions/linked",
      date: "2026-09-25",
      reviewed: "2026-09-27",
      review_basis: "primary-research",
      observations: [],
    },
    "Reviewed fixture ledger.",
  )
  atomicWrite(f.vault, file, content)
  await approveNoteReview(
    f.root,
    "signal",
    {
      schema: "knowledge-note-review/v2",
      reviewer: "Fixture reviewer",
      reviewed_at: "2026-09-27",
      reason: "Read both exact source-backed fixture events.",
      source_read: true,
      final_prose_read: true,
      aliases_checked: true,
      connections_checked: true,
      histories_checked: true,
      notes: [
        {
          path: file,
          operation: "replace",
          previous_sha256: sha256(content),
          content,
          evidence: inputs.map((input) => ({
            run_id: input.run,
            claim_ids: [input.run === "source" ? "unassigned" : input.run + "-fact"],
          })),
        },
      ],
    },
    { vault: f.vault },
  )
}

test("native article links unblock only the affected signal and persist without another collection", async (t) => {
  const f = await knowledgeFixture(t)
  const additional = addKnowledgeArticle(f)
  const source = loadApprovedOntologyInput(f.root, "source", { vault: f.vault })
  basis(f)
  await signal(f, [source, additional])
  const first = await sync(f)
  assert.equal(
    first.tasks.find((row) => row.kind === "signal").reason,
    "current_article_approvals_missing",
  )
  const untouched = first.tasks.filter((row) => row.kind !== "signal")
  const sourceBytes = fs.readFileSync(path.join(f.root, "basis.json"))
  const canonical = fs.readFileSync(path.join(f.vault, "Signals/linked.md"))
  const second = await executeModule(f.ctx, "knowledge", "sync", {
    workflow_id: "article-links",
    article_links_file: links(f, [additional]),
    max_items: 256,
  })
  assert.equal(second.processed_items, 1)
  assert.equal(second.tasks.find((row) => row.kind === "signal").status, "ready")
  assert.deepEqual(
    second.tasks.filter((row) => row.kind !== "signal"),
    untouched,
  )
  assert.equal(read(f, second.ontology.path).inputs.length, 2)
  const input = read(f, second.input.path)
  assert.equal(input.article_links[0].run, additional.run)
  assert.deepEqual(input.article_links[0].files, additional.file_hashes)
  const resumed = await sync(f)
  assert.equal(resumed.reused, true)
  assert.equal(resumed.processed_items, 0)
  assert.deepEqual(fs.readFileSync(path.join(f.root, "basis.json")), sourceBytes)
  assert.deepEqual(fs.readFileSync(path.join(f.vault, "Signals/linked.md")), canonical)
  assert.equal(second.approvals_created, false)
  assert.equal(second.model_calls, 0)
  assert.equal(second.source_requests, 0)
})

test("article links reject stale hashes, source-only inputs and unreviewed replacements without advancing the checkpoint", async (t) => {
  const f = await knowledgeFixture(t)
  basis(f)
  const original = await sync(f)
  const pointer = fs.readFileSync(
    path.join(f.root, "runs/article-links/knowledge-linking/latest.json"),
  )
  const extra = addKnowledgeArticle(f)
  const file = links(f, [extra])
  const packet = read(f, file)
  packet.articles[0].files["approved-article.json"] = sha256("wrong native bytes")
  atomicWrite(f.root, file, packet)
  await assert.rejects(sync(f, { articleLinksFile: file }), /exact native approval/)
  links(f, [extra])
  fs.unlinkSync(path.join(f.root, "runs/additional/approved-article.json"))
  await assert.rejects(sync(f, { articleLinksFile: file }), /ENOENT/)
  const replacement = addKnowledgeArticle(f, { run: "replacement", url: f.doc.original_url })
  links(f, [replacement])
  await assert.rejects(sync(f, { articleLinksFile: file }), /explicit revision review/)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/article-links/knowledge-linking/latest.json")),
    pointer,
  )
  assert.equal(original.approvals_created, false)
})

test("article links survive a new native basis and their packet is immutable across later syncs", async (t) => {
  const f = await knowledgeFixture(t)
  const extra = addKnowledgeArticle(f)
  basis(f)
  const file = links(f, [extra])
  const first = await sync(f, { articleLinksFile: file })
  const newer = addKnowledgeArticle(f, {
    run: "basis-addition",
    url: "https://fixture.example/third",
  })
  const source = loadApprovedOntologyInput(f.root, "source", { vault: f.vault })
  basis(f, projectEvidenceOntology([source, newer]))
  const next = await sync(f)
  assert.equal(read(f, next.ontology.path).inputs.length, 3)
  assert.equal(next.processed_items, 0)
  const state = read(f, next.input.path)
  assert.equal(state.article_links[0].run, extra.run)
  assert.equal(
    state.article_link_packets[0].sha256,
    read(f, first.input.path).article_link_packets[0].sha256,
  )
  const pointer = fs.readFileSync(
    path.join(f.root, "runs/article-links/knowledge-linking/latest.json"),
  )
  const packet = read(f, file)
  packet.articles[0].event_id = "0".repeat(16)
  atomicWrite(f.root, file, packet)
  await assert.rejects(sync(f), /artifact SHA changed/)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/article-links/knowledge-linking/latest.json")),
    pointer,
  )
})

test("changing a Signal edition during sync preserves the previous installed checkpoint", async (t) => {
  const f = await knowledgeFixture(t)
  const extra = addKnowledgeArticle(f)
  const source = loadApprovedOntologyInput(f.root, "source", { vault: f.vault })
  basis(f)
  await signal(f, [source, extra])
  await sync(f)
  const pointerPath = path.join(f.root, "runs/article-links/knowledge-linking/latest.json")
  const pointer = fs.readFileSync(pointerPath)
  const file = links(f, [extra])
  await assert.rejects(
    sync(f, {
      articleLinksFile: file,
      afterCheckpoint: () =>
        atomicWrite(
          f.vault,
          "Editions/linked.md",
          noteText(
            {
              title: "linked",
              type: "briefing",
              scheduled_at: "2026-09-25T08:00:00+09:00",
              article_reviews: [{ event_id: source.article.event_id }],
            },
            "The edition inventory changed while its Signal was audited.",
          ),
        ),
    }),
    /Signal edition changed during knowledge sync/,
  )
  assert.deepEqual(fs.readFileSync(pointerPath), pointer)
  const resumed = await sync(f, { articleLinksFile: file })
  const row = resumed.tasks.find((task) => task.kind === "signal")
  assert.equal(row.status, "ready")
  assert.deepEqual(row.event_ids, [source.article.event_id])
  assert.equal(resumed.processed_items, 1)
})
