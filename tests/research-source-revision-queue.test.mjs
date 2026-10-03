import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"
import { articleContentFingerprint } from "../scripts/research/parser.mjs"
import {
  projectSourceRevisionQueue,
  loadRevisionSourceEvidence,
} from "../scripts/research/source-revision-queue.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "revision-queue-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const url = "https://example.org/source",
    event = "abcdef0123456789",
    body = "A Corp plans to invest in robot production in 2027."
  function capture(run, text) {
    const id = sourceId(url),
      hash = sha256(text),
      version = id + ":" + hash,
      parseId = sha256(run)
    const document = {
      source_id: id,
      source_version_id: version,
      original_url: url,
      final_url: url,
      fetch_status: "captured",
      body_sha256: hash,
      body_path: `documents/${id}/${hash}/body.bin`,
      observed_at: "2026-10-03T00:00:00Z",
    }
    const parse = {
      schema_version: "source-parse/v1",
      source_id: id,
      source_version_id: version,
      parse_id: parseId,
      status: "extracted",
      title: "A Corp plan",
      dates: { published_at: "2026-10-01", observed_at: document.observed_at },
      quality: { missing_pages: [], required_fields_present: true },
      blocks: [{ block_id: parseId + ":b1", text, locator: { text_hash: sha256(text) } }],
    }
    atomicWrite(root, document.body_path, text)
    atomicWrite(root, `parses/${parseId}/parse.json`, parse)
    atomicWrite(root, `runs/${run}/documents.json`, [document])
    atomicWrite(root, `runs/${run}/parses.json`, [parse])
    return { document, parse, source_run: run }
  }
  const old = capture("approved", body),
    current = capture("current", "A Corp cancelled the investment plan.")
  const evidence = {
    source_id: old.document.source_id,
    source_version_id: old.document.source_version_id,
    parse_id: old.parse.parse_id,
    block_id: old.parse.blocks[0].block_id,
    quote: body,
    support: "direct",
  }
  const claim = {
    claim_id: "plan",
    candidate_key: "candidate",
    subject: "A Corp",
    statement: body,
    claim_kind: "attributed_fact",
    event_state: "planned",
    published_at: "2026-10-01",
    effective_period: "2027",
    numbers: [],
    evidence: [evidence],
  }
  const claims = recordFactReview(
    [claim],
    [
      {
        claim_id: "plan",
        status: "verified",
        reason: "Read original",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      },
    ],
    { reviewer: "test", reviewed_at: "2026-10-03" },
    [old.parse],
  )
  const article = {
    event_id: event,
    title: "A Corp investment plan",
    source_urls: [url],
    sector: "로봇·제조",
    theme: "투자·재무",
    tags: [],
    entities: ["A Corp"],
    article_review: {
      review_status: "verified",
      published_at: "2026-10-01",
      reviewed_at: "2026-10-03",
      concept_ids: ["robot-control"],
    },
  }
  const approved = {
    run: "approved",
    article,
    claims: [...claims, { claim_id: "unused", review: { status: "deferred" } }],
    draft: { draft: { lead: [{ claim_ids: ["plan"] }], explanations: [] } },
    documents: [old.document],
    parses: [old.parse],
    file_hashes: { "approved-article.json": sha256(JSON.stringify(article)) },
  }
  const candidate = {
    key: "candidate",
    event_id: event,
    source_urls: [url],
    review_status: "verified",
    article_source_version_id: current.document.source_version_id,
    article_parse_id: current.parse.parse_id,
    article_content_sha256: articleContentFingerprint(current.parse),
    approval: {
      approved_run: "approved",
      article_sha256: sha256(JSON.stringify(article)),
      source_version_id: old.document.source_version_id,
      parse_id: old.parse.parse_id,
      article_content_sha256: articleContentFingerprint(old.parse),
    },
  }
  const inventory = {
    schema: "research-retrospective-inventory/v1",
    events: [
      {
        event_id: event,
        appearances: [{ path: "Editions/one.md" }, { path: "Editions/two.md" }],
        dependencies: {
          edition_paths: ["Editions/one.md", "Editions/two.md"],
          observations: [{ path: "Signals/one.md", observation_id: "obs1" }],
          topic_paths: ["TrendTopics/one.md"],
          explicit_concept_paths: ["Knowledge/control.md"],
          shared_source_concept_paths: [],
        },
      },
    ],
    concepts: [
      { path: "Knowledge/shared.md", verified_sources: [url] },
      { path: "Knowledge/unrelated.md", verified_sources: ["https://other.org/source"] },
    ],
  }
  return { root, old, current, candidate, approved, inventory }
}

test("revision queue follows verified source facts and explicit event/concept/history dependencies", (t) => {
  const f = fixture(t),
    sources = loadRevisionSourceEvidence(f.root, [f.candidate])
  const q = projectSourceRevisionQueue({
    candidates: [f.candidate],
    inventory: f.inventory,
    approvals: new Map([["approved", f.approved]]),
    currentSources: sources,
  })
  assert.equal(q.entries[0].reason, "content_changed")
  assert.equal(q.entries[0].source_evidence_state, "verified_stored_source")
  assert.deepEqual(
    q.entries[0].affected_claims.map((c) => c.claim_id),
    ["plan"],
  )
  assert.equal(q.entries[0].historical_appearances.length, 2)
  assert.deepEqual(q.entries[0].dependencies.shared_source_concept_paths, ["Knowledge/shared.md"])
  assert.deepEqual(q.entries[0].dependencies.explicit_concept_ids, ["robot-control"])
  assert.equal(q.candidate_approved, false)
  assert.equal(q.candidate_published, false)
})

test("revision queue reports missing current evidence and refuses a changed approval", (t) => {
  const f = fixture(t),
    args = {
      candidates: [f.candidate],
      inventory: f.inventory,
      approvals: new Map([["approved", f.approved]]),
      currentSources: new Map(),
    }
  const q = projectSourceRevisionQueue(args)
  assert.equal(q.entries[0].comparison_incomplete, true)
  assert.equal(q.entries[0].source_evidence_state, "missing_current_source_evidence")
  f.approved.article.title = "Changed approval"
  assert.throws(() => projectSourceRevisionQueue(args), /approval or event changed/)
})

test("revision evidence remains available to multiple candidates citing the same source", (t) => {
  const f = fixture(t)
  const second = { ...f.candidate, key: "second-candidate" }
  const sources = loadRevisionSourceEvidence(f.root, [f.candidate, second])
  assert.equal(sources.size, 2)
  assert.equal(sources.get(f.candidate.key).parse.parse_id, sources.get(second.key).parse.parse_id)
})

test("related observations without a decision require review; explicit reviewed aliases do not", (t) => {
  const f = fixture(t)
  const candidate = {
    ...f.candidate,
    article_source_version_id: f.old.document.source_version_id,
    article_parse_id: f.old.parse.parse_id,
    article_content_sha256: articleContentFingerprint(f.old.parse),
    related_source_observations: [{ source_url: "https://example.org/translated" }],
  }
  const args = {
    candidates: [candidate],
    inventory: f.inventory,
    approvals: new Map([["approved", f.approved]]),
    currentSources: loadRevisionSourceEvidence(f.root, [candidate]),
  }
  assert.equal(projectSourceRevisionQueue(args).counts.pending, 1)
  candidate.related_source_observations[0].decision = "reviewed_publisher_record_alias"
  assert.equal(projectSourceRevisionQueue(args).counts.pending, 0)
})

test("revision source evidence rejects changed bytes and immutable parse content", (t) => {
  const f = fixture(t)
  fs.appendFileSync(path.join(f.root, f.current.document.body_path), " changed")
  assert.throws(() => loadRevisionSourceEvidence(f.root, [f.candidate]), /body hash mismatch/)
  atomicWrite(f.root, f.current.document.body_path, f.current.parse.blocks[0].text)
  const parsed = structuredClone(f.current.parse)
  parsed.blocks[0].text = "tampered"
  parsed.blocks[0].locator.text_hash = sha256(parsed.blocks[0].text)
  atomicWrite(f.root, `runs/current/parses.json`, [parsed])
  assert.throws(() => loadRevisionSourceEvidence(f.root, [f.candidate]), /Stored parse differs/)
})
