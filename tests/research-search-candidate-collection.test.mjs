import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { canonicalURL } from "../scripts/garden.mjs"
import { collectSearchCandidates } from "../scripts/research/search-candidate-collection.mjs"
import { intakeSearchCandidateBatch } from "../scripts/research/search-candidate-batch-intake.mjs"
import { selectIntakenSearchCandidate } from "../scripts/research/search-candidate-intake.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { storeParseArtifact } from "../scripts/research/parser.mjs"

function setup(t) {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "search-collect-")))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const root = path.join(workspace, "research")
  const searchRunId = "search-run"
  const candidates = ["https://example.org/news/robot-a", "https://example.net/news/robot-b"].map(
    (url, index) => ({
      key: `source-${sourceId(canonicalURL(url))}`,
      title: `Search result ${index + 1}`,
      source_urls: [url],
      source_published_at: null,
      discovered_at: "2026-09-30T01:00:00Z",
      review_status: "unreviewed",
      discovery: [{ query_slot_id: `slot-${index + 1}`, method: "search" }],
    }),
  )
  atomicWrite(root, `runs/${searchRunId}/search.json`, { candidates })
  return { root, searchRunId, candidates }
}

function fakeCapture(root, url, { blocked = false } = {}) {
  const observedAt = "2026-09-30T02:00:00Z"
  const id = sourceId(url)
  if (blocked)
    return {
      source_id: id,
      original_url: url,
      final_url: null,
      observed_at: observedAt,
      fetch_status: "blocked",
      policy_status: "denied",
    }
  const body = Buffer.from(`Official article text for ${url}`)
  const bodySha = sha256(body)
  const version = `${id}:${bodySha}`
  const bodyPath = `documents/${id}/${bodySha}/body.bin`
  atomicWrite(root, bodyPath, body)
  return {
    schema_version: "source-document/v1",
    source_id: id,
    source_version_id: version,
    original_url: url,
    final_url: url,
    body_sha256: bodySha,
    body_path: bodyPath,
    mime_type: "text/html",
    fetch_status: "captured",
    observed_at: observedAt,
  }
}

test("batch source collection keeps exact candidate identity and allows intake beside a blocked neighbor", async (t) => {
  const input = setup(t)
  let fetches = 0
  let parses = 0
  const result = await collectSearchCandidates({
    root: input.root,
    runId: "collection-run",
    searchRunId: input.searchRunId,
    candidateKeys: input.candidates.map((candidate) => candidate.key),
    articleProfiles: [],
    fetcher: {},
    fetchSource: async (root, _fetcher, url) => {
      fetches++
      return fakeCapture(root, url, { blocked: url.includes("robot-b") })
    },
    parseSource: async (root, document) => {
      parses++
      const text = fs.readFileSync(path.join(input.root, document.body_path), "utf8")
      const parseId = sha256(document.source_version_id + ":parse")
      return storeParseArtifact(root, {
        schema_version: "source-parse/v1",
        source_id: document.source_id,
        source_version_id: document.source_version_id,
        parse_id: parseId,
        title: "Official robotics announcement",
        status: "extracted",
        dates: {
          published_at: "2026-09-30",
          observed_at: document.observed_at,
        },
        blocks: [
          {
            block_id: `${parseId}:block-1`,
            text,
            locator: { text_hash: sha256(text) },
          },
        ],
        quality: { missing_pages: [] },
      })
    },
  })
  assert.equal(result.status, "partial")
  assert.equal(result.source_parsed, 1)
  assert.equal(result.not_acquired, 1)
  assert.equal(result.failed, undefined)
  assert.equal(fetches, 2)
  assert.equal(parses, 1)

  const receipt = readJSON(input.root, result.receipt)
  assert.deepEqual(
    receipt.results.map((row) => row.status),
    ["source_parsed", "fetch_blocked"],
  )
  assert.equal(receipt.candidate_published, false)
  const backlogFile = path.join(path.dirname(input.root), "candidate-backlog.json")
  const intakeManifest = {
    schema: "search-candidate-intake-batch/v1",
    candidates: input.candidates.map((candidate) => ({
      candidate_key: candidate.key,
      source_run: "collection-run",
    })),
  }
  const promoted = await intakeSearchCandidateBatch({
    root: input.root,
    runId: "intake-batch",
    searchRunId: input.searchRunId,
    manifest: intakeManifest,
    backlogFile,
  })
  assert.equal(promoted.status, "partial")
  assert.equal(promoted.failed, 1)
  const selection = selectIntakenSearchCandidate({
    root: input.root,
    intakeRunId: "intake-batch",
    sourceRunId: "collection-run",
    candidateKey: input.candidates[0].key,
    backlogFile,
  })
  assert.equal(selection.candidate.review_status, "unreviewed")
  assert.equal(selection.selected.documents.length, 1)
  assert.equal(selection.selected.documents[0].original_url, input.candidates[0].source_urls[0])
  assert.throws(
    () =>
      selectIntakenSearchCandidate({
        root: input.root,
        intakeRunId: "intake-batch",
        sourceRunId: "collection-run",
        candidateKey: input.candidates[1].key,
        backlogFile,
      }),
    /Successful private search-candidate intake receipt required/,
  )

  await collectSearchCandidates({
    root: input.root,
    runId: "collection-run",
    searchRunId: input.searchRunId,
    candidateKeys: input.candidates.map((candidate) => candidate.key),
    articleProfiles: [],
    fetcher: {},
    fetchSource: async () => {
      fetches++
      throw Error("cached fetch stage should not repeat")
    },
    parseSource: async () => {
      parses++
      throw Error("cached parse stage should not repeat")
    },
  })
  assert.equal(fetches, 2)
  assert.equal(parses, 1)
  const backlog = readJSON(path.dirname(backlogFile), path.basename(backlogFile))
  assert.equal(backlog.candidates.length, 1)
  assert.equal(backlog.candidates[0].key, input.candidates[0].key)
})

test("collection rejects altered and duplicate candidate identities before network access", async (t) => {
  const input = setup(t)
  let calls = 0
  const args = {
    root: input.root,
    runId: "invalid-collection",
    searchRunId: input.searchRunId,
    articleProfiles: [],
    fetchSource: async () => {
      calls++
      throw Error("must not fetch")
    },
  }
  await assert.rejects(
    collectSearchCandidates({
      ...args,
      candidateKeys: [input.candidates[0].key, input.candidates[0].key],
    }),
    /Duplicate candidate keys/,
  )
  await assert.rejects(
    collectSearchCandidates({ ...args, candidateKeys: ["source-00000000000000000000"] }),
    /One exact search candidate required/,
  )
  assert.equal(calls, 0)
})
