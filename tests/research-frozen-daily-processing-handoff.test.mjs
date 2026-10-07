import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"
import { loadFrozenDailyProcessingHandoff } from "../scripts/research/frozen-daily-processing-handoff.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "frozen-facts-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const candidate = {
    key: "one",
    title: "Original announcement",
    review_status: "unreviewed",
    source_urls: ["https://example.org/article"],
    source_published_at: "2026-10-01",
    article_source_version_id: "original-version",
    article_parse_id: "original-parse",
    article_content_sha256: "a".repeat(64),
  }
  const handoff = {
    schema: "research-editorial-handoff/v1",
    daily_run: "daily",
    pending: [
      {
        ...candidate,
        event_id: null,
        source_evidence_state: "exact",
        next_route: "historical-review",
      },
    ],
  }
  const backlogFile = path.join(root, "backlog.json")
  const writeBacklog = (rows) =>
    atomicWrite(root, "backlog.json", { schema: "research-candidates/v1", candidates: rows })
  writeBacklog([candidate])
  atomicWrite(root, "handoff.json", handoff)
  const basis = {
    daily_run: "daily",
    handoff: {
      path: "handoff.json",
      sha256: sha256(fs.readFileSync(path.join(root, "handoff.json"))),
    },
  }
  atomicWrite(root, "basis.json", basis)
  // Dependency-controlled unit fixture. The real smoke uses the native frozen
  // acquisition validator, including its archived config and receipt hashes.
  const loader = (_, ref) => {
    assert.equal(ref.path, "basis.json")
    assert.equal(ref.sha256, sha256(fs.readFileSync(path.join(root, "basis.json"))))
    return basis
  }
  const load = () =>
    loadFrozenDailyProcessingHandoff(
      root,
      {
        dailyRunId: "daily",
        collectionBasis: "basis.json",
        candidateKeys: ["one"],
        backlogFile,
      },
      loader,
    )
  return { root, candidate, handoff, basis, writeBacklog, load }
}

test("unchanged exact candidate reuses pinned bytes despite unrelated backlog changes", (t) => {
  const f = fixture(t)
  f.writeBacklog([f.candidate, { key: "other", review_status: "verified", event_id: "published" }])
  const result = f.load()
  assert.equal(result.path, "handoff.json")
  assert.equal(result.collection_basis.path, "basis.json")
  assert.equal(result.value.pending[0].source_published_at, "2026-10-01")
})

test("changed source, title, date, approval, URL or duplicate key prevents reuse", (t) => {
  const f = fixture(t)
  for (const change of [
    { title: "Corrected title" },
    { source_published_at: "2026-10-02" },
    { review_status: "verified" },
    { event_id: "existing-event" },
    { source_urls: ["https://example.org/revision"] },
    { article_source_version_id: "new-version" },
    { article_parse_id: "new-parse" },
    { article_content_sha256: "b".repeat(64) },
  ]) {
    f.writeBacklog([{ ...f.candidate, ...change }])
    assert.throws(f.load, /candidate changed/)
  }
  f.writeBacklog([f.candidate, f.candidate])
  assert.throws(f.load, /candidate changed/)
})

test("missing candidate, wrong daily run and changed handoff bytes are rejected", (t) => {
  const f = fixture(t)
  f.writeBacklog([])
  assert.throws(f.load, /candidate changed/)
  f.writeBacklog([f.candidate])
  f.basis.daily_run = "other"
  assert.throws(f.load, /another daily run/)
  f.basis.daily_run = "daily"
  atomicWrite(f.root, "handoff.json", { ...f.handoff, observed_at: "changed" })
  assert.throws(f.load, /handoff changed/)
})

test("identity, approved routing and missing exact evidence never enter frozen fact extraction", (t) => {
  const f = fixture(t)
  for (const change of [
    { next_route: "review-related-candidate" },
    { next_route: "approved-historical" },
    { source_evidence_state: "missing" },
    { review_status: "deferred" },
  ]) {
    const row = { ...f.handoff.pending[0], ...change }
    atomicWrite(f.root, "handoff.json", { ...f.handoff, pending: [row] })
    f.basis.handoff.sha256 = sha256(fs.readFileSync(path.join(f.root, "handoff.json")))
    assert.throws(f.load, /candidate changed/)
  }
})
