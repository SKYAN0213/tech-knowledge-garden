import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  candidateParseRecovery,
  recoverCandidateParse,
} from "../scripts/research/candidate-parse-recovery.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { articleContentFingerprint } from "../scripts/research/parser.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"

function fixture() {
  const url = "https://example.org/news/1",
    source_id = sourceId(url),
    body = "<div>Launch transfer began.<br>Installation planned.</div>"
  const hash = sha256(body),
    source_version_id = `${source_id}:${hash}`
  const doc = {
    source_id,
    source_version_id,
    original_url: url,
    final_url: url,
    body_sha256: hash,
    body_path: `documents/${source_id}/${hash}/body.bin`,
    fetch_status: "captured",
    observed_at: "2026-10-06T00:00:00Z",
  }
  const makeParse = (label, text) => {
    const parse_id = sha256(label)
    return {
      schema_version: "source-parse/v1",
      source_id,
      source_version_id,
      parse_id,
      title: "Launch transfer began",
      status: "extracted",
      dates: { published_at: "2026-10-06", observed_at: doc.observed_at },
      blocks: [{ block_id: `${parse_id}:b1`, text, locator: { text_hash: sha256(text) } }],
      quality: { missing_pages: [] },
    }
  }
  const old = makeParse("old", "Launch transfer began"),
    next = makeParse("new", "Launch transfer began. Installation planned.")
  const stored = (run, parse) => ({
    documents: [doc],
    parses: [parse],
    identity: {
      source_run: run,
      documents_sha256: sha256(JSON.stringify([doc])),
      parses_sha256: sha256(JSON.stringify([parse])),
    },
  })
  const candidate = {
    key: `source-${source_id}`,
    title: old.title,
    source_urls: [url],
    source_published_at: "2026-10-06",
    discovered_at: doc.observed_at,
    review_status: "unreviewed",
    article_source_version_id: source_version_id,
    article_parse_id: old.parse_id,
    article_content_sha256: articleContentFingerprint(old),
    article_observed_at: doc.observed_at,
  }
  return { candidate, original: stored("original", old), recovered: stored("reparsed", next), body }
}

test("recovers detailed parse without approving or replacing the raw source", () => {
  const f = fixture(),
    input = candidateParseRecovery(f.candidate, f.original, f.recovered)
  assert.equal(input.candidate_before.article_parse_id, f.original.parses[0].parse_id)
  assert.equal(input.recovered_fields.article_parse_id, f.recovered.parses[0].parse_id)
  assert.equal(
    input.recovered_fields.article_source_version_id,
    f.candidate.article_source_version_id,
  )
})

test("refuses an editorial decision, revision alert and mismatched old binding", () => {
  const f = fixture()
  for (const change of [
    { review_status: "verified" },
    { event_id: "a".repeat(16) },
    { approval: {} },
    { source_revision_alert: {} },
  ])
    assert.throws(
      () => candidateParseRecovery({ ...f.candidate, ...change }, f.original, f.recovered),
      /Unreviewed/,
    )
  assert.throws(
    () =>
      candidateParseRecovery(
        { ...f.candidate, article_content_sha256: sha256("wrong") },
        f.original,
        f.recovered,
      ),
    /exact raw/,
  )
})

test("refuses another source version, changed title/date and incomplete or ambiguous parses", () => {
  const f = fixture()
  for (const change of [
    { title: "Different event" },
    { dates: { published_at: "2026-10-07" } },
    { blocks: [] },
    { quality: { missing_pages: [2] } },
    { quality: { required_fields_present: false } },
  ]) {
    const r = structuredClone(f.recovered)
    Object.assign(r.parses[0], change)
    assert.throws(() => candidateParseRecovery(f.candidate, f.original, r))
  }
  const changed = structuredClone(f.recovered)
  changed.documents[0].body_sha256 = sha256("new response")
  assert.throws(() => candidateParseRecovery(f.candidate, f.original, changed), /exact raw/)
  assert.throws(
    () =>
      candidateParseRecovery(f.candidate, f.original, {
        ...f.recovered,
        parses: [f.original.parses[0], f.recovered.parses[0]],
      }),
    /One complete/,
  )
})

test("actual stored-byte recovery preserves neighbors, resumes, and rejects receipt/source tampering", async (t) => {
  const f = fixture(),
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "parse-recovery-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const raw = path.join(root, f.original.documents[0].body_path)
  fs.mkdirSync(path.dirname(raw), { recursive: true })
  fs.writeFileSync(raw, f.body)
  for (const s of [f.original, f.recovered]) {
    atomicWrite(root, `runs/${s.identity.source_run}/documents.json`, s.documents)
    atomicWrite(root, `runs/${s.identity.source_run}/parses.json`, s.parses)
    atomicWrite(root, `parses/${s.parses[0].parse_id}/parse.json`, s.parses[0])
  }
  const neighbor = {
    key: "other",
    source_urls: ["https://example.org/other"],
    review_status: "verified",
    event_id: "b".repeat(16),
  }
  atomicWrite(root, "backlog.json", {
    schema: "research-candidates/v1",
    candidates: [f.candidate, neighbor],
  })
  const args = {
    root,
    runId: "recovery",
    sourceRunId: "original",
    reparseRunId: "reparsed",
    candidateKey: f.candidate.key,
    backlogFile: path.join(root, "backlog.json"),
  }
  const result = await recoverCandidateParse(args)
  assert.equal(result.reused, false)
  assert.equal(result.model_calls, 0)
  assert.equal(result.candidate_approved, false)
  const after = JSON.parse(fs.readFileSync(args.backlogFile))
  assert.deepEqual(after.candidates[1], neighbor)
  assert.equal(after.candidates[0].review_status, "unreviewed")
  assert.equal(after.candidates[0].key, f.candidate.key)
  assert.equal((await recoverCandidateParse(args)).reused, true)
  const changedObservation = structuredClone(after)
  changedObservation.candidates[0].article_observed_at = "2026-10-06T01:00:00Z"
  atomicWrite(root, "backlog.json", changedObservation)
  await assert.rejects(recoverCandidateParse(args), /Recorded parse recovery/)
  atomicWrite(root, "backlog.json", after)
  const receipt = `runs/recovery/candidate-parse-recovery.json`
  const originalReceipt = JSON.parse(fs.readFileSync(path.join(root, receipt)))
  atomicWrite(root, receipt, { ...originalReceipt, candidate_approved: true })
  await assert.rejects(recoverCandidateParse(args), /Recorded parse recovery/)
  atomicWrite(root, receipt, originalReceipt)
  fs.writeFileSync(raw, "changed bytes")
  await assert.rejects(recoverCandidateParse(args), /body hash/)
})
