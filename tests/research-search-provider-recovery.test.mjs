import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { SearxSearch, discoverSearch } from "../scripts/research/search.mjs"
import { executeTargetedSourceSearch } from "../scripts/research/source-targeted-search.mjs"
import { RunState } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"

const query = {
  slot_id: "recovery-zh",
  query: "site:example.com 机器人 技术研究 2026",
  language: "zh",
  sector: "로봇·제조",
  region: "해외",
  axis: "기술·제품",
  scope: "registered-source",
  source_channel_id: "example-route",
  source_url: "https://example.com/news/",
}
const response = (results = [], failures = []) => ({
  ok: true,
  status: 200,
  json: async () => ({ results, unresponsive_engines: failures }),
})
function temporaryRoot(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "search-recovery-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

test("native five-language queries use one explicit Yahoo request with the original language and month", async () => {
  for (const language of ["ko", "en", "ja", "zh", "de"]) {
    const requests = []
    const client = new SearxSearch({
      url: "http://127.0.0.1:8888",
      fetchImpl: async (url, options) => {
        requests.push({ url: new URL(url), options })
        return response([{ url: "https://example.com/article", title: "Public result", engines: ["yahoo"] }])
      },
    })
    const result = await client.search({ ...query, language })
    assert.equal(requests.length, 1)
    assert.equal(requests[0].url.searchParams.get("q"), "!yahoo " + query.query)
    assert.equal(requests[0].url.searchParams.get("language"), language)
    assert.equal(requests[0].url.searchParams.get("time_range"), "month")
    assert.equal(requests[0].options.redirect, "error")
    assert.deepEqual(result.primary_engines, ["yahoo"])
    assert.deepEqual(result.supplemental_engines, [])
    assert.equal(result.provider_requests[0].source_dates_verified, false)
    assert.equal(result.provider_requests[0].status, "observed")
  }
})

test("public provider denial is a failed checkpoint with its request, never empty or automatically retried", async (t) => {
  const root = temporaryRoot(t)
  let calls = 0
  const client = new SearxSearch({
    url: "http://127.0.0.1:8888",
    fetchImpl: async () => { calls++; return response([], [["yahoo", "access denied"]]) },
  })
  const result = await discoverSearch(root, "failed", client, [query], {
    state: new RunState(root, "failed", { query }, { scope: "search" }),
  })
  assert.equal(calls, 1)
  assert.equal(result.records[0].status, "failed")
  assert.equal(result.records[0].provider_requests[0].status, "failed")
  assert.deepEqual(result.records[0].failures, [["yahoo", "access denied"]])
  assert.equal(result.candidates.length, 0)
  const state = JSON.parse(fs.readFileSync(path.join(root, "runs/failed/search/state.json")))
  assert.equal(state.stages["query-recovery-zh"].status, "failed")
})

test("HTTP and malformed service responses retain provider provenance without a fallback or retry", async (t) => {
  const root = temporaryRoot(t)
  for (const [id, serviceResponse] of [
    ["http", { ok: false, status: 403 }],
    ["invalid", { ok: true, status: 200, json: async () => ({ results: null }) }],
  ]) {
    let calls = 0
    const client = new SearxSearch({ url: "http://127.0.0.1:8888", fetchImpl: async () => { calls++; return serviceResponse } })
    const result = await discoverSearch(root, id, client, [query])
    assert.equal(calls, 1)
    assert.equal(result.records[0].status, "failed")
    assert.deepEqual(result.records[0].primary_engines, ["yahoo"])
    assert.equal(result.records[0].provider_requests[0].http_status, serviceResponse.status)
    assert.equal(result.candidates.length, 0)
  }
})

test("normal empty response and registered-host filtering retain unknown source dates and unreviewed candidates", async (t) => {
  const root = temporaryRoot(t)
  const client = (results) => new SearxSearch({ url: "http://127.0.0.1:8888", fetchImpl: async () => response(results) })
  const empty = await discoverSearch(root, "empty", client([]), [query])
  assert.equal(empty.records[0].status, "partial")
  assert.equal(empty.records[0].provider_requests[0].status, "observed")
  assert.deepEqual(empty.records[0].failures, [])
  const found = await discoverSearch(root, "found", client([
    { title: "Same registered host", url: "https://example.com/news/article", engines: ["yahoo"] },
    { title: "Other host", url: "https://other.example/news/article", engines: ["yahoo"] },
  ]), [query])
  assert.equal(found.records[0].result_count, 2)
  assert.equal(found.records[0].candidate_count, 1)
  assert.equal(found.candidates[0].review_status, "unreviewed")
  assert.equal(found.candidates[0].source_published_at, null)
})

test("targeted execution consumes provider provenance from immutable native checkpoints and reuses without requesting again", async (t) => {
  const root = temporaryRoot(t)
  const repo = fs.realpathSync(new URL("..", import.meta.url))
  let calls = 0
  const client = new SearxSearch({
    url: "http://127.0.0.1:8888",
    fetchImpl: async () => { calls++; return response([]) },
  })
  const options = {
    repo, root, runId: "targeted", mode: "execute", day: "2026-10-11",
    languages: ["zh"], slotIds: ["4-1-0"], maxQueries: 1,
    runSearch: async ({ run_id, query_path }) => {
      const plan = JSON.parse(fs.readFileSync(query_path))
      const state = new RunState(root, run_id, {
        queries_sha256: sha256(JSON.stringify(plan.queries)),
        daily_basis_sha256: null,
        module_sha256: plan.search_sha256,
        service: plan.service,
      }, { scope: "search" })
      await discoverSearch(root, run_id, client, plan.queries, { state })
    },
  }
  const first = await executeTargetedSourceSearch(options)
  assert.equal(first.observations[0].status, "provider_empty")
  assert.deepEqual(first.observations[0].primary_engines, ["yahoo"])
  assert.equal(first.observations[0].provider_requests[0].language, "zh")
  assert.equal(first.coverage_complete, false)
  assert.equal(first.candidate_published, false)
  const second = await executeTargetedSourceSearch({ ...options, mode: "resume" })
  assert.equal(second.reused, true)
  assert.equal(calls, 1)
})
