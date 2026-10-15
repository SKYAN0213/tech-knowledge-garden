import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { module } from "../scripts/research/modules/collection.mjs"
import { validateArguments } from "../scripts/research/modules/contracts.mjs"
import {
  targetedSourceQueries,
  executeTargetedSourceSearch,
} from "../scripts/research/source-targeted-search.mjs"
import {
  executeCandidateFollowups,
  intakeCandidateFollowups,
} from "../scripts/research/source-followups.mjs"
import { researchSlots, discoverSearch } from "../scripts/research/search.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON, RunState } from "../scripts/research/run-state.mjs"
import {
  articleContentFingerprint,
  storeParseArtifact,
  selectStoredSources,
} from "../scripts/research/parser.mjs"
import { saveSourceSelection } from "../scripts/research/source-selection.mjs"
import { mergeBacklog } from "../scripts/research/discovery.mjs"

const repo = path.resolve(import.meta.dirname, "..")
function privateRoot(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "collection-discovery-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const backlogFile = path.join(root, "backlog.json")
  atomicWrite(root, "backlog.json", { schema: "research-candidates/v1", candidates: [] })
  return { repo, root, backlogFile }
}

test("collection discovery contracts bound both native operations and expose no model stage", () => {
  for (const name of ["targeted", "followups"]) {
    assert.equal(module.operations[name].network, true)
    assert.equal(module.operations[name].model, false)
  }
  const ctx = { repo, root: repo },
    input = module.operations.targeted.inputSchema
  validateArguments(
    {
      run_id: "native",
      mode: "plan-only",
      observation_day: "2026-10-11",
      languages: ["zh"],
      max_queries: 1,
    },
    input,
    ctx,
  )
  assert.throws(
    () => validateArguments({ run_id: "native", mode: "execute", max_queries: 9 }, input, ctx),
    /bound/i,
  )
  assert.throws(
    () => validateArguments({ run_id: "native", mode: "execute", fake_coverage: true }, input, ctx),
    /Unknown/,
  )
  assert.throws(
    () =>
      validateArguments(
        {
          run_id: "native",
          mode: "reuse",
          candidate_key: "parent",
          handoff_file: "../escape.json",
        },
        module.operations.followups.inputSchema,
        ctx,
      ),
    /escapes/,
  )
})

test("registered targeted planning excludes opt-out routes and preserves multilingual budget deferral", () => {
  const slots = researchSlots(),
    slot = slots.find((row) => row.region === "해외")
  const routes = ["ko", "en", "ja", "zh", "de"].map((language) => ({
    channel_id: language,
    url: `https://${language}.example.org/news`,
    language,
    sectors: [slot.sector],
    region: slot.region,
    axis: slot.axis,
    kind: "research",
    collection_mode: "discovery",
  }))
  routes.unshift({
    ...routes[0],
    channel_id: "excluded",
    kind: "research",
    collection_mode: "excluded",
  })
  const grid = slots.map((row) => ({ ...row, status: "not_attempted" }))
  const options = {
    languages: ["ko", "en", "ja", "zh", "de"],
    slotIds: [slot.slot_id],
    maxQueries: 3,
  }
  const result = targetedSourceQueries(grid, routes, "2026-10-11", options)
  assert.deepEqual(
    result.queries.map((q) => q.language),
    ["ko", "en", "ja"],
  )
  assert.deepEqual(
    result.deferred.map((q) => q.language),
    ["zh", "de"],
  )
  assert.ok(
    [...result.queries, ...result.deferred].every((q) => q.source_channel_id !== "excluded"),
  )
  assert.deepEqual(
    targetedSourceQueries(grid, [...routes].reverse(), "2026-10-11", options),
    result,
  )
  assert.throws(
    () => targetedSourceQueries(grid, routes, "2026-10-11", { slotIds: ["invented"] }),
    /registered research slots/,
  )
  assert.throws(
    () => targetedSourceQueries(grid.slice(1), routes, "2026-10-11", options),
    /Complete daily/,
  )
})

test("targeted execution consumes native checkpoints, keeps engine failure distinct and resumes without requests", async (t) => {
  const options = {
    ...privateRoot(t),
    runId: "target",
    mode: "execute",
    day: "2026-10-11",
    languages: ["en"],
    maxQueries: 3,
  }
  let requests = 0
  const runSearch = async ({ run_id, query_path }) => {
    const plan = JSON.parse(fs.readFileSync(query_path)),
      { queries } = plan
    const state = new RunState(
      options.root,
      run_id,
      {
        queries_sha256: sha256(JSON.stringify(queries)),
        daily_basis_sha256: null,
        module_sha256: plan.search_sha256,
        service: plan.service,
      },
      { scope: "search" },
    )
    await discoverSearch(
      options.root,
      run_id,
      {
        search: async (query) => {
          const n = requests++
          return {
            links:
              n === 2
                ? [
                    {
                      url: new URL("/2026/10/11/announcement", query.source_url).href,
                      text: "Official announcement",
                    },
                  ]
                : [],
            failures: n === 0 ? [["engine", "timeout"]] : [],
            engines: n ? ["fixture"] : [],
            engine_count: n ? 1 : 0,
          }
        },
      },
      queries,
      { state },
    )
  }
  const result = await executeTargetedSourceSearch({ ...options, runSearch })
  assert.equal(requests, 3)
  assert.equal(result.status, "partial")
  assert.deepEqual(
    result.observations.map((r) => r.status),
    ["provider_failed", "provider_empty", "discovered"],
  )
  assert.equal(result.observations[0].checked_at, null)
  assert.ok(result.observations[0].attempted_at)
  assert.equal(result.coverage_complete, false)
  assert.equal(result.source_body_confirmed, false)
  assert.equal(result.candidate_count, 1)
  assert.equal(
    readJSON(options.root, "runs/target/targeted-queries.json").basis_kind,
    "registry-only",
  )
  const bytes = fs.readFileSync(options.backlogFile)
  const again = await executeTargetedSourceSearch({
    ...options,
    mode: "resume",
    runSearch: () => {
      throw Error("unexpected request")
    },
  })
  assert.equal(again.reused, true)
  assert.deepEqual(fs.readFileSync(options.backlogFile), bytes)
  const source = readJSON(options.root, "runs/target/search.json")
  source.candidates[0].title = "invented"
  atomicWrite(options.root, "runs/target/search.json", source)
  await assert.rejects(
    executeTargetedSourceSearch({ ...options, mode: "resume", runSearch }),
    /differ from native/,
  )
  assert.deepEqual(fs.readFileSync(options.backlogFile), bytes)
})

test("interrupted targeted run retains failed observation and rejects changed input without retry", async (t) => {
  const options = {
    ...privateRoot(t),
    runId: "interrupted",
    mode: "plan-only",
    day: "2026-10-11",
    maxQueries: 1,
    languages: ["zh"],
  }
  await executeTargetedSourceSearch(options)
  const query = readJSON(options.root, "runs/interrupted/targeted-queries.json").queries[0]
  const state = new RunState(options.root, options.runId, { fixture: true }, { scope: "search" })
  await assert.rejects(
    state.stage(`query-${query.slot_id}`, query, () => {
      throw Error("policy unchanged")
    }),
  )
  let requests = 0
  const resumed = await executeTargetedSourceSearch({
    ...options,
    mode: "resume",
    runSearch: () => {
      requests++
    },
  })
  assert.equal(requests, 0)
  assert.equal(resumed.status, "interrupted")
  assert.match(resumed.resume_condition, /Do not automatically retry/)
  await assert.rejects(
    executeTargetedSourceSearch({ ...options, mode: "execute", languages: ["en"] }),
    /inputs changed/,
  )
})

function followupFixture(t) {
  const options = privateRoot(t)
  const urls = [1, 2, 3].map((n) => `https://supplier.example.org/announcement-${n}`)
  const text = "Customer deployment and supplier report and research study"
  function stored(url, body, name, date, links = []) {
    const id = sourceId(url),
      hash = sha256(body),
      parseId = sha256(name)
    const document = {
      source_id: id,
      source_version_id: `${id}:${hash}`,
      original_url: url,
      final_url: url,
      body_sha256: hash,
      body_path: `sources/${name}.html`,
      fetch_status: "captured",
      observed_at: "2026-10-08T00:00:00Z",
    }
    atomicWrite(options.root, document.body_path, body)
    const parse = storeParseArtifact(options.root, {
      schema_version: "source-parse/v1",
      source_id: id,
      source_version_id: document.source_version_id,
      parse_id: parseId,
      title: name,
      status: "extracted",
      dates: { published_at: date },
      quality: { required_fields_present: true, missing_pages: [] },
      blocks: [
        {
          block_id: `${parseId}:b1`,
          text: body,
          locator: { dom_path: "/html/body/article/p[1]", text_hash: hash },
        },
      ],
      links,
    })
    return { document, parse }
  }
  const parent = stored(
    "https://customer.example.org/update",
    text,
    "parent",
    "2026-10-07",
    urls.map((url, n) => ({
      url,
      text: ["deployment", "supplier report", "research study"][n],
      dom_path: `/html/body/article/p[1]/a[${n + 1}]`,
    })),
  )
  const targets = urls.map((url, n) =>
    stored(url, `Actual supplier announcement ${n}`, `target${n}`, "2026-10-05"),
  )
  atomicWrite(options.root, "runs/parent/documents.json", [parent.document])
  atomicWrite(options.root, "runs/parent/parses.json", [parent.parse])
  atomicWrite(
    options.root,
    "runs/stored-targets/documents.json",
    targets.map((r) => r.document),
  )
  atomicWrite(
    options.root,
    "runs/stored-targets/parses.json",
    targets.map((r) => r.parse),
  )
  atomicWrite(options.root, "backlog.json", {
    schema: "research-candidates/v1",
    candidates: [
      {
        key: "customer",
        source_urls: [parent.document.original_url],
        article_source_version_id: parent.document.source_version_id,
        article_parse_id: parent.parse.parse_id,
        article_content_sha256: articleContentFingerprint(parent.parse),
        title: "Customer",
        discovered_at: parent.document.observed_at,
        review_status: "unreviewed",
        priority: "normal",
        discovery: [],
      },
    ],
  })
  return {
    ...options,
    runId: "followup",
    parentSourceRun: "parent",
    candidateKey: "customer",
    urls,
  }
}

test("native follow-up reuse bounds intake, consumes exact stored selection and keeps own date and review gate", async (t) => {
  const options = followupFixture(t)
  let calls = 0
  const runNative = async (command, input) => {
    calls++
    assert.equal(command, "select-source")
    return saveSourceSelection(
      options.root,
      input.run_id,
      selectStoredSources(options.root, input.source_run, input.urls),
    )
  }
  const result = await executeCandidateFollowups({
    ...options,
    mode: "reuse",
    sourceRun: "stored-targets",
    limit: 1,
    runNative,
  })
  assert.equal(calls, 1)
  assert.equal(result.status, "source-ready-for-review")
  assert.equal(result.readable_source_count, 1)
  assert.equal(result.publication_approved, false)
  const rows = readJSON(options.root, "backlog.json").candidates
  assert.equal(rows.length, 2)
  const target = rows.find((r) => r.key !== "customer")
  assert.equal(target.source_published_at, "2026-10-05")
  assert.equal(target.review_status, "unreviewed")
  assert.equal(target.event_id, undefined)
  const bytes = fs.readFileSync(options.backlogFile)
  const again = await executeCandidateFollowups({
    ...options,
    mode: "reuse",
    sourceRun: "stored-targets",
    limit: 1,
    runNative,
  })
  assert.equal(again.reused, true)
  assert.equal(calls, 1)
  assert.deepEqual(fs.readFileSync(options.backlogFile), bytes)
  await assert.rejects(
    executeCandidateFollowups({
      ...options,
      mode: "reuse",
      sourceRun: "stored-targets",
      limit: 2,
      runNative,
    }),
    /inputs changed/,
  )
  assert.deepEqual(fs.readFileSync(options.backlogFile), bytes)
})

test("blocked follow-up remains access review with no repeated request or inherited publication date", async (t) => {
  const options = followupFixture(t)
  let requests = 0
  const runNative = async (command, input) => {
    requests++
    assert.equal(command, "collect")
    atomicWrite(options.root, `runs/${input.run_id}/documents.json`, [
      {
        original_url: input.urls[0],
        fetch_status: "blocked",
        source_policy: { reason: "robots", next_check: "2026-10-17" },
      },
    ])
    atomicWrite(options.root, `runs/${input.run_id}/parses.json`, [])
  }
  const result = await executeCandidateFollowups({
    ...options,
    mode: "collect",
    limit: 1,
    runNative,
  })
  assert.equal(result.status, "partial")
  assert.equal(result.sources[0].next_route, "source-access-review")
  assert.equal(result.sources[0].source_version_id, null)
  assert.equal(result.publication_approved, false)
  const again = await executeCandidateFollowups({
    ...options,
    mode: "collect",
    limit: 1,
    runNative,
  })
  assert.equal(again.reused, true)
  assert.equal(requests, 1)
  const target = readJSON(options.root, "backlog.json").candidates.find((r) => r.key !== "customer")
  assert.equal(target.source_published_at, null)
  assert.equal(target.article_parse_id, undefined)
  const untouched = fs.readFileSync(options.backlogFile)
  await assert.rejects(
    intakeCandidateFollowups({
      ...options,
      targetURLs: ["https://supplier.example.org/invented"],
      limit: 1,
    }),
    /body links/,
  )
  assert.deepEqual(fs.readFileSync(options.backlogFile), untouched)
})

test("first unreviewed stored source may precede discovery while simultaneous captured versions still conflict", async (t) => {
  const options = privateRoot(t),
    id = sourceId("https://supplier.example.org/report")
  const discovered = {
    key: "lead",
    source_urls: ["https://supplier.example.org/report"],
    title: "Link title",
    discovered_at: "2026-10-11T00:00:00Z",
    review_status: "unreviewed",
    priority: "normal",
    discovery: [],
  }
  await mergeBacklog(options.backlogFile, [discovered])
  const captured = {
    ...discovered,
    title: "Actual title",
    discovered_at: "2026-10-08T00:00:00Z",
    article_observed_at: "2026-10-08T00:00:00Z",
    article_source_version_id: `${id}:${sha256("actual raw")}`,
    article_parse_id: sha256("actual parse"),
    article_content_sha256: sha256("actual content"),
    source_published_at: "2026-10-05",
  }
  await mergeBacklog(options.backlogFile, [captured])
  assert.equal(
    readJSON(options.root, "backlog.json").candidates[0].article_source_version_id,
    captured.article_source_version_id,
  )
  const bytes = fs.readFileSync(options.backlogFile)
  await assert.rejects(
    mergeBacklog(options.backlogFile, [
      {
        ...captured,
        article_source_version_id: `${id}:${sha256("other raw")}`,
        article_content_sha256: sha256("other content"),
      },
    ]),
    /Conflicting article versions/,
  )
  assert.deepEqual(fs.readFileSync(options.backlogFile), bytes)
})

test("first source exception rejects any existing approval disposition or identity object", async (t) => {
  const options = privateRoot(t)
  for (const field of ["approval", "disposition", "identity"]) {
    const url = `https://supplier.example.org/${field}`
    const candidate = {
      key: field,
      source_urls: [url],
      title: "Prior review",
      discovered_at: "2026-10-08T00:00:00Z",
      review_status: "unreviewed",
      priority: "normal",
      discovery: [],
      [field]: { legacy_review: true },
    }
    await mergeBacklog(options.backlogFile, [candidate])
    const bytes = fs.readFileSync(options.backlogFile)
    await assert.rejects(
      mergeBacklog(options.backlogFile, [
        {
          ...candidate,
          article_source_version_id: `${sourceId(url)}:${sha256("raw")}`,
          article_parse_id: sha256("parse"),
          article_content_sha256: sha256("content"),
        },
      ]),
      /Conflicting article versions/,
    )
    assert.deepEqual(fs.readFileSync(options.backlogFile), bytes)
  }
})
