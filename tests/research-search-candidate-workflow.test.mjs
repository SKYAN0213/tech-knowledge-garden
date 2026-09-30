import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { canonicalURL } from "../scripts/garden.mjs"
import { processSearchCandidates } from "../scripts/research/search-candidate-workflow.mjs"
import { saveSourceSelection } from "../scripts/research/source-selection.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { storeParseArtifact } from "../scripts/research/parser.mjs"

function setup(t, urls = ["https://example.org/news/robot-a"]) {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "search-workflow-")))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const root = path.join(workspace, "research")
  const searchRunId = "search-run"
  const candidates = urls.map((url, index) => ({
    key: `source-${sourceId(canonicalURL(url))}`,
    title: `Search result ${index + 1}`,
    source_urls: [url],
    source_published_at: null,
    discovered_at: "2026-09-30T01:00:00Z",
    review_status: "unreviewed",
    discovery: [{ query_slot_id: `slot-${index + 1}`, method: "search" }],
  }))
  atomicWrite(root, `runs/${searchRunId}/search.json`, { candidates })
  return {
    root,
    searchRunId,
    candidates,
    backlogFile: path.join(workspace, "candidate-backlog.json"),
  }
}

function fixtureAdapters(input, { blocked = new Set() } = {}) {
  let fetchCalls = 0
  let parseCalls = 0
  const adapters = {
    fetcher: {},
    fetchSource: async (root, _fetcher, url) => {
      fetchCalls++
      const observedAt = "2026-09-30T02:00:00Z"
      const id = sourceId(url)
      if (blocked.has(url))
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
    },
    parseSource: async (root, document) => {
      parseCalls++
      const body = fs.readFileSync(path.join(input.root, document.body_path), "utf8")
      const parseId = sha256(document.source_version_id + ":parse")
      return storeParseArtifact(root, {
        schema_version: "source-parse/v1",
        source_id: document.source_id,
        source_version_id: document.source_version_id,
        parse_id: parseId,
        title: "Official robotics announcement",
        status: "extracted",
        dates: { published_at: "2026-09-30", observed_at: document.observed_at },
        blocks: [
          {
            block_id: `${parseId}:block-1`,
            text: body,
            locator: { text_hash: sha256(body) },
          },
        ],
        quality: { missing_pages: [] },
      })
    },
  }
  Object.defineProperties(adapters, {
    fetchCalls: { get: () => fetchCalls },
    parseCalls: { get: () => parseCalls },
  })
  return adapters
}

test("one workflow completes collection, exact intake and source selection, then resumes idempotently", async (t) => {
  const input = setup(t)
  const adapters = fixtureAdapters(input)
  const args = {
    root: input.root,
    runId: "workflow-run",
    searchRunId: input.searchRunId,
    candidateKeys: [input.candidates[0].key],
    articleProfiles: [],
    backlogFile: input.backlogFile,
    saveSelection: saveSourceSelection,
    ...adapters,
  }
  const result = await processSearchCandidates(args)
  assert.equal(result.status, "complete")
  assert.equal(result.total, 1)
  assert.equal(result.selected, 1)
  assert.equal(result.not_selected, 0)
  assert.equal(result.candidate_published, false)
  assert.equal(adapters.fetchCalls, 1)
  assert.equal(adapters.parseCalls, 1)

  const receipt = readJSON(input.root, result.receipt)
  assert.equal(receipt.schema, "research-search-candidate-workflow/v1")
  assert.equal(receipt.stages.collection, "complete")
  assert.equal(receipt.stages.intake, "complete")
  assert.equal(receipt.results[0].selection_status, "selected")
  const selected = readJSON(
    input.root,
    `runs/${receipt.results[0].selection_run}/source-selection.json`,
  )
  assert.equal(selected.candidate_key, input.candidates[0].key)
  assert.equal(selected.candidate_published, false)
  assert.equal(
    readJSON(path.dirname(input.backlogFile), path.basename(input.backlogFile)).candidates[0]
      .review_status,
    "unreviewed",
  )

  await processSearchCandidates({
    ...args,
    fetchSource: async () => {
      throw Error("completed fetch stage must be reused")
    },
    parseSource: async () => {
      throw Error("completed parse stage must be reused")
    },
  })
  assert.equal(adapters.fetchCalls, 1)
  assert.equal(adapters.parseCalls, 1)
})

test("one blocked candidate yields a partial workflow while an exact successful neighbor is selected", async (t) => {
  const input = setup(t, ["https://example.org/news/robot-a", "https://example.net/news/robot-b"])
  const blockedURL = input.candidates[1].source_urls[0]
  const adapters = fixtureAdapters(input, { blocked: new Set([blockedURL]) })
  const result = await processSearchCandidates({
    root: input.root,
    runId: "workflow-partial",
    searchRunId: input.searchRunId,
    candidateKeys: input.candidates.map((candidate) => candidate.key),
    articleProfiles: [],
    backlogFile: input.backlogFile,
    saveSelection: saveSourceSelection,
    ...adapters,
  })
  assert.equal(result.status, "partial")
  assert.equal(result.selected, 1)
  assert.equal(result.not_selected, 1)
  assert.equal(result.failed, 1)
  const receipt = readJSON(input.root, result.receipt)
  assert.deepEqual(
    receipt.results.map((row) => [row.collection_status, row.intake_status, row.selection_status]),
    [
      ["source_parsed", "source_verified_unreviewed", "selected"],
      ["fetch_blocked", "failed", undefined],
    ],
  )
  const backlog = readJSON(path.dirname(input.backlogFile), path.basename(input.backlogFile))
  assert.deepEqual(
    backlog.candidates.map((candidate) => candidate.key),
    [input.candidates[0].key],
  )
})

test("workflow refuses changed input under a used run ID before another fetch", async (t) => {
  const input = setup(t, ["https://example.org/news/robot-a", "https://example.net/news/robot-b"])
  const adapters = fixtureAdapters(input)
  const args = {
    root: input.root,
    runId: "workflow-stable",
    searchRunId: input.searchRunId,
    candidateKeys: [input.candidates[0].key],
    articleProfiles: [],
    backlogFile: input.backlogFile,
    saveSelection: saveSourceSelection,
    ...adapters,
  }
  await processSearchCandidates(args)
  await assert.rejects(
    processSearchCandidates({ ...args, candidateKeys: [input.candidates[1].key] }),
    /Workflow input changed/,
  )
  assert.equal(adapters.fetchCalls, 1)
})
