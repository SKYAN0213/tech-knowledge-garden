import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { spawnSync } from "node:child_process"
import {
  compareProcessingArtifacts,
  benchmarkArticleProcessing,
  articleBenchmarkModes,
  processingCodeFingerprint,
} from "../scripts/research/operations-benchmark.mjs"
import { fixture, editionFixture } from "./fixtures/research-event-fixtures.mjs"
import { atomicCreate, safePath } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { recordedProcessingProvider, summarizeReplayObservations } from "../scripts/research/processing-replay.mjs"
import { executeModule } from "../scripts/research/module-registry.mjs"
import { prepareEventSelection } from "../scripts/research/event-pipeline.mjs"
import {
  copyFixtureTree,
  instantiateProcessingFixture,
  materializeProcessingCode,
  prepareProcessingFixture,
  verifyProcessingFixtureBindings,
} from "../scripts/research/processing-fixture.mjs"

function output() {
  return {
    artifacts: Array.from({ length: 32 }, (_, i) => ({
      candidate_id: "candidate-" + i,
      writer_run: "writer-" + i,
      action: i ? "write" : "reuse",
      claims: [
        {
          claim_id: "claim-" + i,
          statement: "100 ms under the original condition",
          evidence: [{ source_id: "source-" + i, quote: "exact source" }],
        },
      ],
      draft: {
        draft: { text: "reader prose", claim_ids: ["claim-" + i] },
        completeness_context: { review: { important: true } },
      },
      editorial: { status: "approved", source_read: true, coverage: ["claim-" + i] },
      approval: {
        event_id: "event-" + i,
        record: "reader prose",
        article_review: { status: "approved" },
      },
    })),
  }
}

test("article benchmark v2 compares the current combined mode without changing legacy replay", () => {
  assert.deepEqual(articleBenchmarkModes({ schema: "research-article-processing-benchmark/v1" }), {
    baseline: "separate/v1", candidate: "combined/v1",
  })
  assert.deepEqual(articleBenchmarkModes({
    schema: "research-article-processing-benchmark/v2",
    baseline: { mode: "combined/v1" }, candidate: { mode: "combined/v1" },
  }), { baseline: "combined/v1", candidate: "combined/v1" })
  assert.throws(() => articleBenchmarkModes({
    schema: "research-article-processing-benchmark/v2",
    baseline: { mode: "separate/v1" }, candidate: { mode: "combined/v1" },
  }), /combined/)
  assert.throws(() => articleBenchmarkModes({
    schema: "research-article-processing-benchmark/v2",
    baseline: { mode: "combined/v1" },
    candidate: { mode: "combined/v1", review_repair_mode: "unknown" },
  }), /repair mode/)
  assert.throws(() => articleBenchmarkModes({ schema: "research-article-processing-benchmark/v3" }), /schema/)
})

test("replay maps only recorded positive coverage into explicit preserved decisions", async (t) => {
  const f = fixture(t),
    run = "replay-coverage",
    instance = { root: f.root, repo: f.repo, live: false, imported_replay_oracle: true },
    telemetry = { requests: [], provider_ms: 0 }
  const directory = path.join(f.root, "runs", run)
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, "draft.json"), JSON.stringify({ draft_id: "draft-a" }))
  const original = {
    claim_id: "claim-a",
    reason: "The exact cited fact was previously reviewed",
    meaning_checked: true,
    preserved_aspects: ["fact"],
    locations: [{ location: "lead[0]", text_sha256: "a".repeat(64) }],
  }
  const oracle = {
    exchanges: [],
    articles: [{
      writer_run: run,
      fact_review: { reviewer: "recorded-reviewer", reviewed_at: "2026-10-26" },
      final_draft: { draft_id: "draft-a" },
      editorial_review: { status: "approved", draft_id: "draft-a", reviewer: "recorded-reviewer", reviewed_at: "2026-10-26" },
      coverage_review: { reviewed_at: "2026-10-26", coverage: [original] },
      corrections: [], editorial_attempts: [], coverage_attempts: [],
    }],
  }
  const provider = recordedProcessingProvider(instance, oracle, telemetry)
  const request = {
    messages: [{ role: "system", content: "fixture" }, { role: "user", content: JSON.stringify({ task: "combined_review", kind: "editorial", run_id: run, input_sha256: "b".repeat(64), source_manifest: { sha256: "c".repeat(64) }, part: 1, assigned_claim_ids: ["claim-a"] }) }],
    schema: { type: "object" },
  }
  const result = await provider.structured(request)
  assert.deepEqual(result.output.coverage, [original])
  assert.deepEqual(result.output.coverage_decisions, [{ claim_id: "claim-a", decision: "preserved", reason: null }])
  assert.equal(result.output.editorial_review, null)
  assert.equal(telemetry.requests[0].model_execution, false)
  assert.equal(telemetry.requests[0].task, "combined_review")
  oracle.articles[0].coverage_review.coverage[0].meaning_checked = false
  await assert.rejects(provider.structured(request), /explicit historical coverage judgment/)
  assert.throws(() => recordedProcessingProvider({ ...instance, live: true }, oracle, telemetry), /forbidden/)
})

test("replay counts observed native request types without inventing applied corrections or coverage reuse", async (t) => {
  const f = fixture(t), run = "counted-writer"
  fs.mkdirSync(path.join(f.root, "runs", run), { recursive: true })
  fs.writeFileSync(path.join(f.root, "runs", run, "draft.json"), JSON.stringify({ draft_id: "draft-a" }))
  const makeRequest = (input) => ({
    messages: [{ role: "system", content: "fixed" }, { role: "user", content: JSON.stringify(input) }],
    schema: { type: "object" },
  })
  const repair = makeRequest({ task: "combined_review_repair", component: "coverage" })
  const correction = makeRequest({ task: "combined_review_correction", run_id: run })
  const extraction = makeRequest([{ document: 1 }])
  const oracle = {
    exchanges: [
      { role: "evidence_compare", request: repair, output: { result: "repaired" } },
      { role: "fact_extract", request: extraction, output: { claims: [] } },
    ],
    articles: [{ writer_run: run, corrections: [{ draft_id: "draft-a", reason: "recorded" }] }],
  }
  const telemetry = { requests: [], provider_ms: 0 }
  const provider = recordedProcessingProvider({ root: f.root, repo: f.root, live: false, imported_replay_oracle: true }, oracle, telemetry)
  await provider.structured.call({ executionPolicy: { role: "evidence_compare" } }, repair)
  await provider.structured.call({ executionPolicy: { role: "article_write" } }, correction)
  await provider.structured.call({ executionPolicy: { role: "fact_extract" } }, extraction)
  assert.deepEqual(telemetry.requests.map((request) => request.task), ["combined_review_repair", "combined_review_correction", null])
  const counts = summarizeReplayObservations(telemetry, [
    { action: "reuse", status: "reused" },
    { action: "write", status: "approved" },
    { action: "write", status: "reused" },
  ])
  assert.equal(counts.successful_replayed_requests, 3)
  assert.deepEqual(counts.requests_by_native_task, { combined_review_repair: 1, combined_review_correction: 1 })
  assert.equal(counts.requests_without_native_task, 1)
  assert.equal(counts.combined_review_repair_requests, 1)
  assert.equal(counts.writer_correction_requests, 1)
  assert.equal(counts.correction_time_repair_requests, 0)
  assert.equal(counts.selected_approved_reuse, 1)
  assert.equal(counts.coverage_decisions_reused, null)
  assert.equal(counts.applied_writer_corrections, null)
  assert.equal(counts.failed_or_unobserved_requests, null)
  assert.equal(summarizeReplayObservations(telemetry, [{ status: "reused" }]).selected_approved_reuse, null)
})

test("historical extraction replay records the one allowed prompt change and rejects ambiguous or different evidence", async (t) => {
  const f = fixture(t)
  fs.mkdirSync(path.join(f.root, ".local"), { recursive: true })
  const oldPrompt = "Read the source. Publication date comes only from dates.published_at, otherwise null. Preserve the source."
  const currentPrompt = oldPrompt.replace(
    "Publication date comes only from dates.published_at, otherwise null.",
    "Publication date comes only from dates.published_at, otherwise null. The publication date is the source document's publication date. Assign an event or announcement date only when its exact source evidence supports it.",
  )
  const schema = { type: "object", properties: { claims: { type: "array" } } }
  const messages = [{ role: "system", content: oldPrompt }, { role: "user", content: '[{"document":1,"blocks":["original"]}]' }]
  const exchange = {
    run: "source-run", role: "fact_extract",
    source: { path: "runs/source-run/model-policy/fact_extract/budget.json", sha256: "a".repeat(64), attempt_id: "attempt" },
    request: { messages, schema }, output: { claims: [{ statement: "recorded" }] },
  }
  const request = { messages: [{ ...messages[0], content: currentPrompt }, messages[1]], schema }
  const telemetry = { requests: [], provider_ms: 0 }
  const instance = { root: f.root, repo: f.root, live: false, imported_replay_oracle: true }
  const oracle = { exchanges: [exchange], articles: [] }
  const provider = recordedProcessingProvider(instance, oracle, telemetry)
  const invoke = (value = request, role = "fact_extract") =>
    provider.structured.call({ executionPolicy: { role } }, value)
  const result = await invoke()
  assert.deepEqual(result.output, exchange.output)
  const receipt = telemetry.requests[0]
  assert.equal(receipt.model_execution, false)
  assert.equal(receipt.current_prompt_validated, false)
  assert.equal(receipt.original_request_sha256, sha256(JSON.stringify(exchange.request)))
  assert.equal(receipt.original_output_sha256, sha256(JSON.stringify(exchange.output)))
  assert.deepEqual(receipt.original_source, exchange.source)
  assert.match(receipt.transformation, /publication.*date/i)
  assert.equal(result.provenance.actual_model_execution, false)
  for (const [changed, role] of [
    [request, "article_write"],
    [{ ...request, messages: [request.messages[0], { ...request.messages[1], content: request.messages[1].content + " " }] }, "fact_extract"],
    [{ ...request, schema: { type: "object" } }, "fact_extract"],
    [{ ...request, messages: [{ ...request.messages[0], content: currentPrompt + " changed" }, request.messages[1]] }, "fact_extract"],
    [{ ...request, messages: [request.messages[0], { ...request.messages[1], role: "assistant" }] }, "fact_extract"],
  ]) await assert.rejects(invoke(changed, role), /No exact recorded model request/)
  oracle.exchanges.push(structuredClone(exchange))
  await assert.rejects(invoke(), /ambiguous.*recorded/i)
})

test("historical writer replay permits only the pinned whole-prompt pair with exact request evidence", async (t) => {
  const f = fixture(t)
  fs.mkdirSync(path.join(f.root, ".local"), { recursive: true })
  const editor = fs.readFileSync(new URL("../scripts/research/editor.mjs", import.meta.url), "utf8")
  const start = editor.indexOf('content:\n          "당신은 한국어 기술 뉴스 편집자다.')
  const end = editor.indexOf('role: "user"', start)
  assert.ok(start >= 0 && end > start)
  const literals = [...editor.slice(start, end).matchAll(/"(?:[^"\\]|\\.)*"/g)].map((m) => JSON.parse(m[0]))
  const currentPrompt = literals.slice(0, 7).join("")
  const currentDateClause = " publication_date는 원문 게시일이며 기업 발표일이나 사건 발생일로 추정하지 않는다. 원문 게시일을 리드에 쓸 때는 그 자료가 게시·보도된 날짜로 귀속하고 facts.when에만 넣고 리드에서 생략하지 않는다. 사건 날짜는 검토된 원문 근거가 있을 때만 해당 사건에 귀속해 쓰며, 근거가 없으면 미상으로 둔다. precision이 timestamp이면 원문 게시 시각의 seoul_day를 사용하고 한국시간임을 밝힌다."
  const oldDateClause = " publication_date가 있는 사실의 발표를 전달할 때는 알려진 발표일을 리드 문장에도 자연스럽게 적는다. facts.when에만 넣고 리드에서 생략하지 않는다. precision이 timestamp이면 seoul_day를 사용하고 한국시간임을 밝힌다."
  assert.ok(currentPrompt.includes(currentDateClause))
  const oldPrompt = currentPrompt.replace(currentDateClause, oldDateClause)
  const oldSHA = "f74222b5517a2fc6b792253fcf24e934a05b8d557d199a9059077f5c3a73cbb6"
  const currentSHA = "21b11ec67daa04fc8a0fb51ce38d172536e55d6619b72bd034cc7febca0e936a"
  assert.equal(sha256(oldPrompt), oldSHA)
  assert.equal(sha256(currentPrompt), currentSHA)
  const schema = { type: "object", properties: { article: { type: "string" } } }
  const user = { role: "user", content: '{"claims":[{"statement":"exact source-backed fact"}]}' }
  const exchange = {
    run: "writer-run", role: "article_write",
    source: { path: "runs/writer-run/model-policy/article_write/budget.json", sha256: "b".repeat(64), attempt_id: "attempt" },
    request: { messages: [{ role: "system", content: oldPrompt }, user], schema },
    output: { article: "unchanged historical response" },
  }
  const request = { messages: [{ role: "system", content: currentPrompt }, user], schema }
  const instance = { root: f.root, repo: f.root, live: false, imported_replay_oracle: true }
  const telemetry = { requests: [], provider_ms: 0 }
  const oracle = { exchanges: [exchange], articles: [] }
  const provider = recordedProcessingProvider(instance, oracle, telemetry)
  const invoke = (value = request, role = "article_write") =>
    provider.structured.call({ executionPolicy: { role } }, value)
  const result = await invoke()
  assert.deepEqual(result.output, exchange.output)
  const receipt = telemetry.requests[0]
  assert.equal(receipt.original_system_prompt_sha256, oldSHA)
  assert.equal(receipt.current_system_prompt_sha256, currentSHA)
  assert.equal(receipt.original_request_sha256, sha256(JSON.stringify(exchange.request)))
  assert.equal(receipt.request_sha256, sha256(JSON.stringify(request)))
  assert.equal(receipt.original_output_sha256, sha256(JSON.stringify(exchange.output)))
  assert.deepEqual(receipt.original_source, exchange.source)
  assert.match(receipt.transformation, /publication.*date/i)
  assert.equal(receipt.current_prompt_validated, false)
  assert.equal(receipt.model_execution, false)
  assert.equal(result.provenance.actual_model_execution, false)
  for (const [changed, role] of [
    [request, "fact_extract"],
    [{ ...request, messages: [request.messages[0], { ...user, content: user.content + " " }] }, "article_write"],
    [{ ...request, schema: { type: "object" } }, "article_write"],
    [{ ...request, messages: [{ ...request.messages[0], content: currentPrompt + " " }, user] }, "article_write"],
    [{ ...request, messages: [request.messages[0], { ...user, role: "assistant" }] }, "article_write"],
  ]) await assert.rejects(invoke(changed, role), /No exact recorded model request/)
  const changedOracle = { ...oracle, exchanges: [{ ...exchange, request: {
    ...exchange.request, messages: [{ ...exchange.request.messages[0], content: oldPrompt + " " }, user],
  } }] }
  await assert.rejects(recordedProcessingProvider(instance, changedOracle, { requests: [], provider_ms: 0 })
    .structured.call({ executionPolicy: { role: "article_write" } }, request), /No exact recorded model request/)
  oracle.exchanges.push(structuredClone(exchange))
  await assert.rejects(invoke(), /ambiguous.*recorded/i)
})

test("processing fixture rejects a changed oracle before creating a replay instance", (t) => {
  const f = fixture(t), oracle = path.join(f.root, "oracle.json")
  fs.writeFileSync(oracle, '{"exchanges":[]}\n')
  const oracleSHA = sha256(fs.readFileSync(oracle))
  const manifestFile = path.join(f.root, "fixture-oracle.json")
  fs.writeFileSync(manifestFile, JSON.stringify({ oracle: { path: oracle, sha256: oracleSHA } }))
  const manifest = { path: manifestFile, sha256: sha256(fs.readFileSync(manifestFile)) }
  fs.writeFileSync(oracle, '{"exchanges":["changed"]}\n')
  const destination = path.join(f.root, "private-oracle-case")
  assert.throws(() => instantiateProcessingFixture(manifest, destination), /oracle changed/i)
  assert.equal(fs.existsSync(destination), false)
})

test("fixture preparation preserves a selected prior approval only for its exact reuse event", (t) => {
  const f = fixture(t), sourceRepo = path.join(f.root, "source-repo"),
    sourceRoot = path.join(f.root, "source-root"), vault = path.join(f.root, "authority-vault")
  for (const directory of [sourceRepo, sourceRoot, vault]) fs.mkdirSync(directory)
  const backlogFile = path.join(f.root, "backlog.json")
  fs.writeFileSync(backlogFile, '{"candidates":[]}\n')
  const approval = atomicCreate(sourceRoot, "runs/prior-writer/approved-article.json", { approved: true })
  const makeSelection = (name, priorWriter) => {
    const plan = atomicCreate(sourceRoot, `event-plans/${name}/plan.json`, {
      run_id: name, events: [{ group_id: "reused-group", action: "reuse", identity: {}, sources: [], prior: { run_id: priorWriter } }],
    })
    const evaluation = atomicCreate(sourceRoot, `curation/evaluations/${name}.json`, { reviewed: true })
    const pool = atomicCreate(sourceRoot, `curation/pools/${name}.json`, {
      context: { backlog: backlogFile }, history: { files: [], backlog_sha256: sha256(fs.readFileSync(backlogFile)) },
    })
    return atomicCreate(sourceRoot, `curation/selections/${name}.json`, { pool, selected: [{
      candidate_id: "prior-candidate", action: "reuse", origin_plan: plan, evaluation,
      execution: { plan, group_id: "reused-group" },
    }] })
  }
  const args = { sourceRepo, sourceRoot, authorityVault: vault, reviewDirectory: f.root,
    articleRuns: [{ candidate_id: "prior-candidate", action: "reuse", writer_run: "prior-writer" }] }
  const result = prepareProcessingFixture({ ...args, selection: makeSelection("good", "prior-writer"),
    destination: path.join(f.root, "prepared-good") })
  const manifest = JSON.parse(fs.readFileSync(result.path))
  assert.equal(manifest.preserved_reuse, 1)
  assert.equal(manifest.fresh_articles, 0)
  assert.equal(sha256(fs.readFileSync(path.join(manifest.seed, ".local/research/local-ai", approval.path))), approval.sha256)
  assert.equal(sha256(fs.readFileSync(path.join(sourceRoot, approval.path))), approval.sha256)
  const instance = instantiateProcessingFixture({ path: result.path, sha256: result.sha256 },
    path.join(f.root, "reuse-instance"), { live: true, executionRepo: sourceRepo })
  const reset = JSON.parse(fs.readFileSync(path.join(instance.repo, instance.writer_reset.path)))
  assert.equal(reset.preserved_reused_approvals, 1)
  assert.equal(sha256(fs.readFileSync(path.join(instance.root, approval.path))), approval.sha256)
  const seedRoot = path.join(manifest.seed, ".local/research/local-ai")
  const selectedPath = path.join(seedRoot, manifest.selection.path)
  const selected = JSON.parse(fs.readFileSync(selectedPath)), planRef = selected.selected[0].execution.plan
  const planPath = path.join(seedRoot, planRef.path), changedPlan = JSON.parse(fs.readFileSync(planPath))
  changedPlan.events[0].prior.run_id = "different-writer"
  fs.writeFileSync(planPath, JSON.stringify(changedPlan))
  planRef.sha256 = sha256(fs.readFileSync(planPath))
  selected.selected[0].origin_plan.sha256 = planRef.sha256
  fs.writeFileSync(selectedPath, JSON.stringify(selected))
  manifest.selection.sha256 = sha256(fs.readFileSync(selectedPath))
  for (const entry of manifest.files) {
    if (entry.path === planRef.path) entry.sha256 = planRef.sha256
    if (entry.path === manifest.selection.path) entry.sha256 = manifest.selection.sha256
  }
  const changedManifest = path.join(f.root, "changed-reuse-manifest.json")
  fs.writeFileSync(changedManifest, JSON.stringify(manifest))
  assert.throws(() => instantiateProcessingFixture({ path: changedManifest, sha256: sha256(fs.readFileSync(changedManifest)) },
    path.join(f.root, "wrong-reuse-instance"), { live: true, executionRepo: sourceRepo }), /reuse.*prior writer/i)
  assert.throws(() => prepareProcessingFixture({ ...args, selection: makeSelection("wrong", "different-writer"),
    destination: path.join(f.root, "prepared-wrong") }), /reuse.*prior writer/i)
  const stale = makeSelection("stale", "prior-writer")
  fs.writeFileSync(path.join(sourceRoot, "event-plans/stale/plan.json"), "{}\n")
  assert.throws(() => prepareProcessingFixture({ ...args, selection: stale,
    destination: path.join(f.root, "prepared-stale") }), /reuse plan changed/i)
})

test("private fixture resets only SHA-bound writer files and verifies their native regeneration", async (t) => {
  const f = editionFixture(t), planned = await executeModule(f.ctx, "classification", "review", f.parameters)
  const plan = { path: planned.path, sha256: planned.sha256 }, group = "order"
  const writer = "event-" + sha256(JSON.stringify([plan, group])).slice(0, 36)
  await prepareEventSelection(f.ctx, { run_id: writer, plan_path: plan.path, plan_sha256: plan.sha256, group_id: group })
  const pool = atomicCreate(f.root, "fixture-pool.json", { context: {} })
  const selection = atomicCreate(f.root, "fixture-selection.json", { pool,
    selected: [{ candidate_id: "test-candidate", action: "write", execution: { plan, group_id: group } }] })
  atomicCreate(f.root, "runs/other-approved/approved-article.json", { untouched: true })
  const temporary = fs.mkdtempSync(path.join(path.dirname(f.root), "processing-fixture-test-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const seed = path.join(temporary, "seed"), seedRoot = path.join(seed, ".local/research/local-ai")
  fs.mkdirSync(path.dirname(seedRoot), { recursive: true })
  copyFixtureTree(f.root, seedRoot)
  fs.unlinkSync(path.join(seedRoot, ".storage/policy.json"))
  fs.mkdirSync(path.join(seed, "vault"))
  const files = []
  const inventory = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) inventory(file)
      else files.push({ path: path.relative(seedRoot, file), sha256: sha256(fs.readFileSync(file)) })
    }
  }
  inventory(seedRoot)
  const original = { schema: "research-processing-fixture/v1", seed, files, selection,
    original_pool: pool, fresh_articles: 1, preserved_reuse: 0,
    articles: [{ candidate_id: "test-candidate", writer_run: writer, action: "write" }] }
  const manifestFile = path.join(temporary, "manifest.json")
  fs.writeFileSync(manifestFile, JSON.stringify(original))
  const fixtureRef = { path: manifestFile, sha256: sha256(fs.readFileSync(manifestFile)) }
  const code = path.join(temporary, "code")
  fs.mkdirSync(code)
  const instance = instantiateProcessingFixture(fixtureRef, path.join(temporary, "live-case"), { live: true, executionRepo: code })
  const reset = JSON.parse(fs.readFileSync(path.join(instance.repo, instance.writer_reset.path)))
  const resetPlan = JSON.parse(fs.readFileSync(path.join(instance.repo, reset.plan.path)))
  assert.equal(reset.removed_files, 5)
  assert.equal(fs.existsSync(path.join(instance.root, "runs", writer)), false)
  assert.equal(fs.existsSync(path.join(instance.root, "event-selections", writer)), false)
  for (const entry of resetPlan.expected[0].files)
    assert.equal(sha256(fs.readFileSync(path.join(instance.repo, entry.backup_path))), entry.sha256)
  assert.ok(fs.existsSync(path.join(seedRoot, "runs", writer, "event-selection.json")))
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(instance.root, "runs/other-approved/approved-article.json"))), { untouched: true })
  await prepareEventSelection({ ...f.ctx, root: instance.root },
    { run_id: writer, plan_path: plan.path, plan_sha256: plan.sha256, group_id: group }, { requireUnbound: true })
  const verified = verifyProcessingFixtureBindings(instance, { candidate_ids: ["test-candidate"] })
  assert.equal(verified.verified_count, 1)
  assert.equal(verified.verified[0].binding_sha256.length, 5)
  fs.writeFileSync(path.join(instance.root, "runs", writer, "event-selection.json"), "{}\n")
  assert.throws(() => verifyProcessingFixtureBindings(instance), /Regenerated writer binding/)

  const alias = "event-plans/shared/selections/other.json"
  atomicCreate(seedRoot, alias, { writer_run: writer, selection: { path: resetPlan.expected[0].files[2].path } })
  original.files.push({ path: alias, sha256: sha256(fs.readFileSync(path.join(seedRoot, alias))) })
  fs.writeFileSync(manifestFile, JSON.stringify(original))
  const sharedRef = { path: manifestFile, sha256: sha256(fs.readFileSync(manifestFile)) }
  assert.throws(() => instantiateProcessingFixture(sharedRef, path.join(temporary, "shared-case"), { live: true, executionRepo: code }), /shared with another article/)
  assert.ok(fs.existsSync(path.join(seedRoot, "runs", writer, "event-selection.json")))
})

test("fixture tree copies exact files with independent writes and refuses an existing destination", (t) => {
  const f = fixture(t),
    source = path.join(f.root, "fixture-source"),
    destination = path.join(f.root, "fixture-copy")
  fs.mkdirSync(path.join(source, "nested"), { recursive: true })
  fs.writeFileSync(path.join(source, ".hidden"), "source bytes\n")
  fs.writeFileSync(path.join(source, "nested", "document.json"), '{"value":42}\n')
  copyFixtureTree(source, destination)
  assert.equal(fs.readFileSync(path.join(destination, ".hidden"), "utf8"), "source bytes\n")
  fs.writeFileSync(path.join(destination, "nested", "document.json"), "changed copy\n")
  assert.equal(
    fs.readFileSync(path.join(source, "nested", "document.json"), "utf8"),
    '{"value":42}\n',
  )
  assert.throws(() => copyFixtureTree(source, destination), /fresh destination/)
})

test("fixture tree rejects source symlinks before creating a destination", (t) => {
  const f = fixture(t),
    source = path.join(f.root, "fixture-source"),
    destination = path.join(f.root, "fixture-copy")
  fs.mkdirSync(source)
  fs.writeFileSync(path.join(source, "document"), "original")
  fs.symlinkSync("document", path.join(source, "alias"))
  assert.throws(() => copyFixtureTree(source, destination), /symlinks/)
  assert.equal(fs.existsSync(destination), false)
  assert.equal(fs.readFileSync(path.join(source, "document"), "utf8"), "original")
})

test("fixture tree refuses a broken destination symlink", (t) => {
  const f = fixture(t),
    source = path.join(f.root, "fixture-source"),
    destination = path.join(f.root, "fixture-copy")
  fs.mkdirSync(source)
  fs.writeFileSync(path.join(source, "document"), "original")
  fs.symlinkSync("absent-target", destination)
  assert.throws(() => copyFixtureTree(source, destination), /fresh destination/)
  assert.equal(fs.lstatSync(destination).isSymbolicLink(), true)
  assert.equal(fs.existsSync(path.join(f.root, "absent-target")), false)
})

test("fixture tree preserves the requested free-space reserve before a possible full copy", (t) => {
  const f = fixture(t),
    source = path.join(f.root, "fixture-source"),
    destination = path.join(f.root, "fixture-copy")
  fs.mkdirSync(source)
  fs.writeFileSync(path.join(source, "document"), "original")
  assert.throws(
    () => copyFixtureTree(source, destination, { reserveBytes: Number.MAX_SAFE_INTEGER }),
    /insufficient.*space/i,
  )
  assert.equal(fs.existsSync(destination), false)
  assert.equal(fs.readFileSync(path.join(source, "document"), "utf8"), "original")
})
test("processing comparison detects claim, source, prose, importance, approval, action and duplicate regressions", () => {
  const a = output()
  assert.equal(compareProcessingArtifacts(a, structuredClone(a)).equivalent, true)
  const mutations = [
    (b) => {
      b.artifacts[0].draft.provenance = { changed: true }
    },
    (b) => {
      b.artifacts[0].claims[0].statement = "100 seconds"
    },
    (b) => {
      b.artifacts[0].claims[0].evidence[0].quote = "different"
    },
    (b) => {
      b.artifacts[0].draft.draft.text = "changed"
    },
    (b) => {
      b.artifacts[0].draft.completeness_context.review.important = false
    },
    (b) => {
      b.artifacts[0].editorial.coverage = []
    },
    (b) => {
      b.artifacts[0].approval.article_review.status = "pending"
    },
    (b) => {
      b.artifacts[0].action = "write"
    },
  ]
  for (const mutate of mutations) {
    const b = structuredClone(a)
    mutate(b)
    assert.equal(compareProcessingArtifacts(a, b).equivalent, false)
  }
  const duplicate = structuredClone(a)
  duplicate.artifacts[1] = duplicate.artifacts[0]
  assert.throws(() => compareProcessingArtifacts(a, duplicate), /32 distinct/)
})

test("isolated cases contain exact executable bytes at their native cwd and reject configuration drift", (t) => {
  const f = fixture(t),
    source = path.join(f.root, "frozen-code"),
    destination = path.join(f.root, "private-case")
  fs.mkdirSync(path.join(source, "scripts/research"), { recursive: true })
  fs.mkdirSync(path.join(source, "data"))
  fs.mkdirSync(destination)
  fs.writeFileSync(
    path.join(source, "scripts/research/draft-checkpoint.mjs"),
    "export const frozen = true\n",
  )
  fs.writeFileSync(path.join(source, "data/research-model-policy-codex.json"), '{"fixed":true}')
  assert.equal(
    fs.existsSync(path.join(destination, "scripts/research/draft-checkpoint.mjs")),
    false,
  )
  const receipt = materializeProcessingCode(source, destination)
  assert.equal(receipt.files.length, 2)
  assert.equal(receipt.installed_production_runtime, false)
  assert.deepEqual(
    fs.readFileSync(path.join(destination, "scripts/research/draft-checkpoint.mjs")),
    fs.readFileSync(path.join(source, "scripts/research/draft-checkpoint.mjs")),
  )
  const config = path.join(destination, "data/research-model-policy-codex.json")
  fs.chmodSync(config, 0o644)
  fs.writeFileSync(config, '{"fixed":false}')
  assert.throws(() => materializeProcessingCode(source, destination), /differs from frozen code/)
  assert.equal(fs.readFileSync(config, "utf8"), '{"fixed":false}')
})
test("benchmark rejects a changed manifest before creating cases or executing a provider", async (t) => {
  const f = fixture(t),
    r = atomicCreate(f.root, "benchmark.json", {
      schema: "research-article-processing-benchmark/v1",
    })
  const relative = (await import("node:path")).default.relative(f.ctx.repo, f.root + "/" + r.path)
  await assert.rejects(
    benchmarkArticleProcessing(f.ctx, { path: relative, sha256: "0".repeat(64) }),
    /input SHA/,
  )
})

test("incremental benchmark checks the real production workspace writer before copying data", async (t) => {
  const f = fixture(t), code = path.join(f.root, "code"), guard = path.join(f.root, "production")
  fs.mkdirSync(code)
  fs.mkdirSync(path.join(guard, ".local/research/local-ai/locks"), { recursive: true })
  fs.writeFileSync(path.join(guard, ".local/research/local-ai/locks/module-worker-active.json"),
    JSON.stringify({ pid: process.pid }))
  const fixtureFile = path.join(f.root, "fixed-fixture.json")
  fs.writeFileSync(fixtureFile, JSON.stringify({ fresh_articles: 31, preserved_reuse: 1,
    articles: Array.from({ length: 32 }, (_, i) => ({ candidate_id: "candidate-" + i })) }))
  const descriptor = { ...processingCodeFingerprint(code), mode: "combined/v1" }
  const value = { schema: "research-article-processing-benchmark/v2",
    fixture: { path: fixtureFile, sha256: sha256(fs.readFileSync(fixtureFile)) },
    baseline: descriptor, candidate: descriptor, guard_workspace: fs.realpathSync(guard),
    destination: path.join(f.root, "fresh-output") }
  const ref = atomicCreate(f.root, "v2-input.json", value)
  const relative = path.relative(f.ctx.repo, safePath(f.root, ref.path))
  await assert.rejects(benchmarkArticleProcessing(f.ctx, { path: relative, sha256: ref.sha256 }),
    /Active workspace worker lock/)
  assert.equal(fs.existsSync(value.destination), false)
})

test("article benchmark launches its native worker from a path containing spaces and URL characters", async (t) => {
  const f = fixture(t),
    copied = path.join(f.root, "runtime with # spaces"),
    workspace = path.join(f.root, "workspace with spaces"),
    code = path.join(f.root, "candidate with spaces"),
    seed = path.join(f.root, "seed"),
    destination = path.join(f.root, "benchmark output");
  fs.mkdirSync(copied);
  materializeProcessingCode(f.ctx.repo, copied);
  const worker = path.join(copied, "scripts/research/processing-replay.mjs"),
    invalidConfig = path.join(f.root, "invalid-config.json");
  fs.writeFileSync(
    invalidConfig,
    JSON.stringify({ mode: "invalid", instance: {} }),
  );
  const direct = spawnSync(process.execPath, [worker, invalidConfig], {
    encoding: "utf8",
  });
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /Explicit replay mode required/);

  fs.mkdirSync(path.join(code, "scripts/research/modules"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(code, "scripts/research/module-runtime.mjs"),
    'throw Error("spaced native worker reached candidate code"); export const moduleContext = null\n',
  );
  fs.writeFileSync(
    path.join(code, "scripts/research/curation-workflow.mjs"),
    "export const advanceCuration = null\n",
  );
  fs.writeFileSync(
    path.join(code, "scripts/research/modules/contracts.mjs"),
    "export const nativeResearch = null\n",
  );
  // This test isolates subprocess path handling; writer-reset behavior is
  // exercised independently with a genuine native event fixture.
  const fixtureModule = path.join(copied, "scripts/research/processing-fixture.mjs")
  fs.chmodSync(fixtureModule, 0o644)
  fs.writeFileSync(fixtureModule, `import fs from "node:fs"; import path from "node:path";
export function instantiateProcessingFixture(_fixture, repo) {
  const root = path.join(repo, ".local/research/local-ai"); fs.mkdirSync(root, { recursive: true });
  return { repo, root, live: false };
}
export function verifyProcessingFixtureBindings() { throw Error("not reached"); }
`)
  const {
    processingCodeFingerprint,
    benchmarkArticleProcessing: runBenchmark,
  } = await import(
    pathToFileURL(
      path.join(copied, "scripts/research/operations-benchmark.mjs"),
    ).href
  );
  const candidate = processingCodeFingerprint(code);
  const seedRoot = path.join(seed, ".local/research/local-ai");
  fs.mkdirSync(seedRoot, { recursive: true });
  fs.mkdirSync(path.join(seed, "vault"));
  fs.writeFileSync(path.join(seedRoot, "pool.json"), "{}\n");
  fs.writeFileSync(path.join(seedRoot, "selection.json"), '{"pool":{}}\n');
  const oracle = path.join(f.root, "oracle.json");
  fs.writeFileSync(oracle, "{}\n");
  const manifest = path.join(f.root, "fixture.json");
  fs.writeFileSync(
    manifest,
    JSON.stringify({
      seed,
      files: [],
      fresh_articles: 31,
      preserved_reuse: 1,
      articles: Array.from({ length: 32 }, (_, i) => ({
        action: i ? "write" : "reuse",
        writer_run: "writer-" + i,
      })),
      original_pool: { path: "pool.json" },
      selection: { path: "selection.json" },
      oracle: { path: oracle, sha256: sha256(fs.readFileSync(oracle)) },
    }),
  );
  fs.mkdirSync(workspace);
  const input = path.join(workspace, "benchmark.json");
  fs.writeFileSync(
    input,
    JSON.stringify({
      schema: "research-article-processing-benchmark/v1",
      fixture: { path: manifest, sha256: sha256(fs.readFileSync(manifest)) },
      baseline: candidate,
      candidate,
      destination,
    }),
  );
  await assert.rejects(
    runBenchmark(
      { repo: workspace },
      { path: "benchmark.json", sha256: sha256(fs.readFileSync(input)) },
    ),
    /Native article replay failed/,
  );
  const log = fs.readFileSync(
    path.join(destination, "pair-1-baseline.log"),
    "utf8",
  );
  assert.match(log, /spaced native worker reached candidate code/);
});
