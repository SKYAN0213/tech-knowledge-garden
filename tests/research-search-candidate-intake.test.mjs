import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  intakeSearchCandidate,
  selectIntakenSearchCandidate,
} from "../scripts/research/search-candidate-intake.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { storeParseArtifact } from "../scripts/research/parser.mjs"
import { intakeSearchCandidateBatch } from "../scripts/research/search-candidate-batch-intake.mjs"
import { main as researchMain } from "../scripts/research.mjs"

function addBatchCandidate(
  input,
  { number = 2, publishedAt = "2026-09-29", includeSource = true } = {},
) {
  const url = `https://example.org/news/robot-${number}`
  const key = `source-${sourceId(url)}`
  const observedAt = "2026-09-30T01:00:00Z"
  const candidate = {
    key,
    title: `Search result ${number}`,
    source_urls: [url],
    source_published_at: null,
    discovered_at: observedAt,
    review_status: "unreviewed",
    discovery: [{ query_slot_id: `slot-${number}`, method: "search" }],
  }
  const search = readJSON(input.root, `runs/${input.searchRunId}/search.json`)
  if (!search.candidates.some((existing) => existing.key === key)) search.candidates.push(candidate)
  atomicWrite(input.root, `runs/${input.searchRunId}/search.json`, search)
  const sourceRun = `source-run-${number}`
  if (includeSource) {
    const body = Buffer.from(`Source body for candidate ${number}.`)
    const bodySha = sha256(body)
    const version = `${sourceId(url)}:${bodySha}`
    const doc = {
      schema_version: "source-document/v1",
      source_id: sourceId(url),
      source_version_id: version,
      original_url: url,
      final_url: url,
      body_path: `documents/${sourceId(url)}/${bodySha}/body.bin`,
      body_sha256: bodySha,
      fetch_status: "captured",
      observed_at: observedAt,
    }
    atomicWrite(input.root, doc.body_path, body)
    const parseId = sha256(version + ":parse")
    const parse = storeParseArtifact(input.root, {
      schema_version: "source-parse/v1",
      source_id: doc.source_id,
      source_version_id: version,
      parse_id: parseId,
      title: `Robotics source ${number}`,
      status: "extracted",
      dates: { published_at: publishedAt, observed_at: observedAt },
      blocks: [
        {
          block_id: `${parseId}:block-1`,
          text: body.toString(),
          locator: { text_hash: sha256(body.toString()) },
        },
      ],
      quality: { missing_pages: [] },
    })
    atomicWrite(input.root, `runs/${sourceRun}/documents.json`, [doc])
    atomicWrite(input.root, `runs/${sourceRun}/parses.json`, [parse])
  }
  return { candidate_key: key, source_run: sourceRun }
}

function setup(t, { publishedAt = "2026-09-30", sourceUrl } = {}) {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "search-intake-")))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const root = path.join(workspace, "research")
  const backlogFile = path.join(workspace, "candidate-backlog.json")
  const searchRunId = "search-run"
  const sourceRunId = "source-run"
  const runId = "intake-run"
  const url = "https://example.org/news/robot"
  const storedURL = sourceUrl || url
  const key = `source-${sourceId(url)}`
  const body = Buffer.from("A robotics company demonstrated a new actuator.")
  const bodySha = sha256(body)
  const version = `${sourceId(storedURL)}:${bodySha}`
  const observedAt = "2026-09-30T01:00:00Z"
  const doc = {
    schema_version: "source-document/v1",
    source_id: sourceId(storedURL),
    source_version_id: version,
    original_url: storedURL,
    final_url: storedURL,
    body_path: `documents/${sourceId(storedURL)}/${bodySha}/body.bin`,
    body_sha256: bodySha,
    fetch_status: "captured",
    observed_at: observedAt,
  }
  atomicWrite(root, doc.body_path, body)
  const parseId = sha256(version + ":parse")
  const parse = storeParseArtifact(root, {
    schema_version: "source-parse/v1",
    source_id: doc.source_id,
    source_version_id: version,
    parse_id: parseId,
    title: "Robotics company demonstrates actuator",
    status: "extracted",
    dates: { published_at: publishedAt, observed_at: observedAt },
    blocks: [
      {
        block_id: `${parseId}:block-1`,
        text: body.toString(),
        locator: { text_hash: sha256(body.toString()) },
      },
    ],
    quality: { missing_pages: [] },
  })
  atomicWrite(root, `runs/${sourceRunId}/documents.json`, [doc])
  atomicWrite(root, `runs/${sourceRunId}/parses.json`, [parse])
  const candidate = {
    key,
    title: "Search result title",
    source_urls: [url],
    source_published_at: null,
    discovered_at: observedAt,
    review_status: "unreviewed",
    discovery: [{ query_slot_id: "slot-1", method: "search" }],
  }
  atomicWrite(root, `runs/${searchRunId}/search.json`, {
    records: [{ slot_id: "slot-1", status: "partial" }],
    candidates: [candidate],
  })
  return { root, backlogFile, searchRunId, sourceRunId, runId, key, url, candidate }
}

test("exact parsed source hydrates a search candidate as unreviewed without publishing it", async (t) => {
  const input = setup(t)
  const result = await intakeSearchCandidate({
    ...input,
    candidateKey: input.key,
  })
  assert.equal(result.status, "source_verified_unreviewed")
  assert.equal(result.review_status, "unreviewed")
  assert.equal(result.candidate_published, false)
  const backlog = readJSON(path.dirname(input.backlogFile), path.basename(input.backlogFile))
  assert.equal(backlog.candidates.length, 1)
  assert.equal(backlog.candidates[0].source_published_at, "2026-09-30")
  assert.equal(backlog.candidates[0].title, "Robotics company demonstrates actuator")
  assert.equal(backlog.candidates[0].event_id, undefined)
  assert.equal(backlog.candidates[0].approval, undefined)
  assert.equal(backlog.candidates[0].discovery[0].query_slot_id, "slot-1")
  assert.equal(
    readJSON(input.root, `runs/${input.runId}/search-candidate-intake.json`).candidate_published,
    false,
  )
  const before = fs.readFileSync(input.backlogFile)
  await intakeSearchCandidate({ ...input, candidateKey: input.key })
  assert.deepEqual(fs.readFileSync(input.backlogFile), before)
})

test("missing source date records non-promotion and leaves the candidate backlog untouched", async (t) => {
  const input = setup(t, { publishedAt: null })
  const before = fs.existsSync(input.backlogFile) ? fs.readFileSync(input.backlogFile) : null
  const result = await intakeSearchCandidate({ ...input, candidateKey: input.key })
  assert.equal(result.status, "source_date_missing")
  assert.equal(result.backlog_changed, false)
  assert.equal(fs.existsSync(input.backlogFile), false)
  const receipt = readJSON(input.root, `runs/${input.runId}/search-candidate-intake.json`)
  assert.equal(receipt.published_at, null)
  assert.equal(receipt.candidate_published, false)
  assert.equal(before, null)
})

test("intake rejects a source run that only contains a related URL", async (t) => {
  const input = setup(t, { sourceUrl: "https://example.org/news/other" })
  await assert.rejects(
    intakeSearchCandidate({ ...input, candidateKey: input.key }),
    /exact candidate URL once/,
  )
  assert.equal(fs.existsSync(input.backlogFile), false)
})

test("intake leaves an already reviewed candidate for event reconciliation", async (t) => {
  const input = setup(t)
  atomicWrite(path.dirname(input.backlogFile), path.basename(input.backlogFile), {
    schema: "research-candidates/v1",
    candidates: [
      {
        ...input.candidate,
        source_published_at: "2026-09-30",
        review_status: "verified",
        event_id: "event-1",
      },
    ],
  })
  const before = fs.readFileSync(input.backlogFile)
  await assert.rejects(
    intakeSearchCandidate({ ...input, candidateKey: input.key }),
    /event reconciliation path/,
  )
  assert.deepEqual(fs.readFileSync(input.backlogFile), before)
})

test("only an unchanged, source-verified search candidate can enter exact source selection", async (t) => {
  const input = setup(t)
  await intakeSearchCandidate({ ...input, candidateKey: input.key })
  const selection = selectIntakenSearchCandidate({
    root: input.root,
    intakeRunId: input.runId,
    sourceRunId: input.sourceRunId,
    candidateKey: input.key,
    backlogFile: input.backlogFile,
  })
  assert.equal(selection.candidate.review_status, "unreviewed")
  assert.equal(selection.candidate.event_id, undefined)
  assert.equal(selection.selected.documents.length, 1)
  assert.equal(selection.selected.parses.length, 1)
  assert.equal(selection.selected.documents[0].original_url, input.url)
  assert.equal(selection.selected.parses[0].parse_id, selection.candidate.article_parse_id)
})

test("batch intake records each result and resumes failed items without duplicating completed candidates", async (t) => {
  const input = setup(t)
  const second = addBatchCandidate(input, { includeSource: false })
  const manifest = {
    schema: "search-candidate-intake-batch/v1",
    candidates: [{ candidate_key: input.key, source_run: input.sourceRunId }, second],
  }
  const first = await intakeSearchCandidateBatch({
    root: input.root,
    runId: "batch-run",
    searchRunId: input.searchRunId,
    manifest,
    backlogFile: input.backlogFile,
  })
  assert.equal(first.status, "partial")
  assert.equal(first.processed, 2)
  assert.equal(first.failed, 1)
  const firstReceipt = readJSON(input.root, first.receipt)
  assert.equal(firstReceipt.results[0].backlog_changed, true)
  let backlog = readJSON(path.dirname(input.backlogFile), path.basename(input.backlogFile))
  assert.deepEqual(
    backlog.candidates.map((candidate) => candidate.key),
    [input.key],
  )

  const restored = addBatchCandidate(input, { includeSource: true })
  assert.equal(restored.candidate_key, second.candidate_key)
  const resumed = await intakeSearchCandidateBatch({
    root: input.root,
    runId: "batch-run",
    searchRunId: input.searchRunId,
    manifest,
    backlogFile: input.backlogFile,
  })
  assert.equal(resumed.status, "complete")
  assert.equal(resumed.failed, 0)
  backlog = readJSON(path.dirname(input.backlogFile), path.basename(input.backlogFile))
  assert.equal(backlog.candidates.length, 2)
  assert.equal(new Set(backlog.candidates.map((candidate) => candidate.key)).size, 2)
  const receipt = readJSON(input.root, resumed.receipt)
  assert.equal(receipt.results[0].backlog_changed, false)
  assert.equal(receipt.results[1].status, "source_verified_unreviewed")
  assert.ok(receipt.results.every((result) => result.candidate_published === false))
  const before = fs.readFileSync(input.backlogFile)
  await intakeSearchCandidateBatch({
    root: input.root,
    runId: "batch-run",
    searchRunId: input.searchRunId,
    manifest,
    backlogFile: input.backlogFile,
  })
  assert.deepEqual(fs.readFileSync(input.backlogFile), before)
})

test("batch intake rejects duplicate candidate keys before promotion", async (t) => {
  const input = setup(t)
  const manifest = {
    schema: "search-candidate-intake-batch/v1",
    candidates: [
      { candidate_key: input.key, source_run: input.sourceRunId },
      { candidate_key: input.key, source_run: input.sourceRunId },
    ],
  }
  await assert.rejects(
    intakeSearchCandidateBatch({
      root: input.root,
      runId: "batch-invalid",
      searchRunId: input.searchRunId,
      manifest,
      backlogFile: input.backlogFile,
    }),
    /Duplicate candidate_key/,
  )
  assert.equal(fs.existsSync(input.backlogFile), false)
})

test("a batch run ID cannot be reused with a changed source manifest", async (t) => {
  const input = setup(t)
  const manifest = {
    schema: "search-candidate-intake-batch/v1",
    candidates: [{ candidate_key: input.key, source_run: input.sourceRunId }],
  }
  const args = {
    root: input.root,
    runId: "batch-stable",
    searchRunId: input.searchRunId,
    manifest,
    backlogFile: input.backlogFile,
  }
  await intakeSearchCandidateBatch(args)
  const before = fs.readFileSync(input.backlogFile)
  await assert.rejects(
    intakeSearchCandidateBatch({
      ...args,
      manifest: {
        ...manifest,
        candidates: [{ candidate_key: input.key, source_run: "different-source-run" }],
      },
    }),
    /Batch manifest changed/,
  )
  assert.deepEqual(fs.readFileSync(input.backlogFile), before)
})

test("research CLI accepts a private batch manifest and preserves candidate publication guard", async (t) => {
  const input = setup(t)
  const manifest = {
    schema: "search-candidate-intake-batch/v1",
    candidates: [{ candidate_key: input.key, source_run: input.sourceRunId }],
  }
  atomicWrite(input.root, "manifests/intake.json", manifest)
  const result = await researchMain([
    "intake-search-batch",
    "--run",
    "batch-cli",
    "--candidate-run",
    input.searchRunId,
    "--batch-manifest",
    "manifests/intake.json",
    "--root",
    input.root,
    "--backlog",
    input.backlogFile,
  ])
  assert.deepEqual(
    {
      status: result.status,
      failed: result.failed,
      candidate_published: result.candidate_published,
    },
    { status: "complete", failed: 0, candidate_published: false },
  )
})
