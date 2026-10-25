import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { isolatedMCPFixtureParent } from "../integrations/research-mcp/test/storage-fixture.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { recordEditorialCompleteness } from "../scripts/research/editorial-completeness.mjs"
import { selectAuthoringClaims, writeDraft } from "../scripts/research/editor.mjs"
import {
  writeDraftCheckpoint,
  loadDraftCheckpoint,
  loadDraftInput,
} from "../scripts/research/draft-checkpoint.mjs"
import { loadProcessedDraft } from "../scripts/research/processed-draft.mjs"
import { module as writing } from "../scripts/research/modules/writing.mjs"
import { main } from "../scripts/research.mjs"
import { storeParseArtifact, loadStoredSourceRun } from "../scripts/research/parser.mjs"
import { buildArchiveClosure } from "../scripts/research/archive-closure.mjs"
import { packageResearchArchive } from "../scripts/research/archive.mjs"
import { measureFrozenWriterCost } from "../scripts/research/evaluation-cost.mjs"

// Synthetic contract fixtures, never real editorial approval or model results.
function fixture(t, count = 113, importantCount = 22) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(isolatedMCPFixtureParent(process.cwd()), "writing-")),
  )
  fs.mkdirSync(path.join(root, ".storage"))
  fs.writeFileSync(
    path.join(root, ".storage/policy.json"),
    JSON.stringify({ schema: "research-cold-storage/v1", root, enabled: false }),
  )
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const run = "case",
    text =
      "Acme released a service. Acme plans further support with 3 units under fixture conditions.",
    sid = sourceId("https://fixture.example/release"),
    pid = sha256(text)
  const doc = {
    source_id: sid,
    source_version_id: sid + ":" + sha256(text),
    original_url: "https://fixture.example/release",
    observed_at: "2026-10-22T00:00:00Z",
    final_url: "https://fixture.example/release",
    body_sha256: sha256(text),
    body_path: `documents/${sid}/${sha256(text)}/body.bin`,
    fetch_status: "captured",
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id: sid,
    source_version_id: doc.source_version_id,
    parse_id: pid,
    status: "extracted",
    title: "Synthetic release",
    dates: { published_at: "2026-10-21", observed_at: doc.observed_at },
    quality: { missing_pages: [] },
    blocks: [{ block_id: pid + ":b1", text, locator: { text_hash: sha256(text) } }],
  }
  const evidence = {
    source_id: sid,
    source_version_id: doc.source_version_id,
    parse_id: pid,
    block_id: parse.blocks[0].block_id,
    quote: text,
    support: "direct",
  }
  const claims = recordFactReview(
    Array.from({ length: count }, (_, i) => ({
      claim_id: sha256("synthetic-" + i).slice(0, 24),
      candidate_key: "fixture",
      subject: "Acme",
      statement:
        (i ? "Acme plans support. " : "Acme released a service. ") +
        "Synthetic bounded background detail. ".repeat(16),
      claim_kind: "attributed_fact",
      event_state: "reported",
      published_at: "2026-10-21",
      effective_period: null,
      numbers: [{ literal: "3", unit: "units", condition: "under fixture conditions" }],
      evidence: [evidence],
    })),
    Array.from({ length: count }, (_, i) => ({
      claim_id: sha256("synthetic-" + i).slice(0, 24),
      status: "verified",
      reason: "Synthetic source contract only",
      source_read: true,
      entailment_checked: true,
      identity_checked: true,
      numbers_checked: true,
      time_checked: true,
    })),
    { reviewer: "fixture", reviewed_at: "2026-10-23" },
    [parse],
  )
  const input = {
    schema: "research-editorial-completeness-input/v1",
    claims_sha256: sha256(JSON.stringify(claims)),
    documents_sha256: sha256(JSON.stringify([doc])),
    parses_sha256: sha256(JSON.stringify([parse])),
    verified_claim_ids: claims.map((c) => c.claim_id),
    source_scope: [
      {
        source_id: sid,
        source_version_id: doc.source_version_id,
        parse_id: pid,
        original_url: doc.original_url,
        blocks: [{ block_id: parse.blocks[0].block_id, text_sha256: sha256(text) }],
      },
    ],
  }
  const review = {
    schema: "research-editorial-completeness-review/v1",
    input_sha256: sha256(JSON.stringify(input)),
    reviewer: "fixture",
    reviewed_at: "2026-10-24",
    source_read: true,
    all_relevant_facts_checked: true,
    fact_decisions: claims.map((c, i) => ({
      claim_id: c.claim_id,
      important: i < importantCount,
      reason: i < importantCount ? "Synthetic important fact" : "Synthetic optional background",
      required_aspects: [
        "fact",
        "numbers",
        "comparison_conditions",
        "plan_execution",
        "attribution",
      ],
    })),
  }
  const context = recordEditorialCompleteness(review, claims, [doc], [parse])
  const scope = {
    schema: "research-reviewed-important-authoring-scope/v1",
    run_id: run,
    reviewer: "fixture",
    reviewed_at: "2026-10-25",
    reason: "Explicit synthetic editorial scope",
    claims_sha256: input.claims_sha256,
    documents_sha256: input.documents_sha256,
    parses_sha256: input.parses_sha256,
    completeness_context_sha256: context.sha256,
    verified_claim_ids: claims.map((c) => c.claim_id),
    included_claim_ids: claims.slice(0, importantCount).map((c) => c.claim_id),
    excluded_claim_ids: claims.slice(importantCount).map((c) => c.claim_id),
  }
  const policyFile = path.join(root, "policy.json")
  fs.writeFileSync(
    policyFile,
    JSON.stringify({ model: "fixture", num_ctx: 32768, num_predict: 4096 }),
  )
  let calls = 0,
    captured
  const output = {
    title: "Acme 제품 발표",
    lead: [
      { text: "Acme는 새 서비스를 공개했다.", claim_ids: [claims[0].claim_id] },
      { text: "회사는 후속 지원을 계획한다.", claim_ids: [claims[1].claim_id] },
    ],
    facts: {
      who: "Acme",
      when: "2026-10-21",
      where: null,
      what: "서비스 공개",
      how: null,
      why: null,
    },
    sector: "소프트웨어·클라우드",
    theme: "제품·서비스",
    tags: ["신제품"],
    entities: ["Acme"],
    explanations: [],
  }
  const provider = {
    executionPolicy: { settings: { model: "fixture", num_ctx: 32768, num_predict: 4096 } },
    structured: async (request) => {
      calls++
      captured = request
      return { output: structuredClone(output), provenance: { provider: "synthetic-contract" } }
    },
  }
  const options = {
    model: "fixture",
    think: false,
    parses: [parse],
    documents: [doc],
    completenessContext: context,
  }
  atomicWrite(root, doc.body_path, text)
  storeParseArtifact(root, parse)
  atomicWrite(root, "runs/case/documents.json", [doc])
  atomicWrite(root, "runs/case/parses.json", [parse])
  atomicWrite(root, "runs/case/reviewed-claims.json", { claims })
  atomicWrite(root, "runs/case/editorial-completeness/context.json", context)
  return {
    root,
    run,
    claims,
    scope,
    options,
    provider,
    metadata: { model: "fixture", digest: "fixed" },
    policyFile,
    calls: () => calls,
    captured: () => captured,
    write: (extra = {}) =>
      writeDraftCheckpoint(
        root,
        run,
        provider,
        claims,
        { ...options, ...extra },
        { model: "fixture", digest: "fixed" },
      ),
  }
}

function failureReview(f, { previousImplementation = true } = {}) {
  const file = path.join(f.root, "runs/case/model-draft-input.json"),
    old = JSON.parse(fs.readFileSync(file))
  if (previousImplementation) {
    old.implementation["scripts/research/editor.mjs"] = sha256("previous editor")
    old.implementation["scripts/research/draft-checkpoint.mjs"] = sha256("previous checkpoint")
  }
  fs.writeFileSync(file, JSON.stringify(old, null, 2) + "\n")
  const job = {
    job_id: "failed",
    module: "writing",
    operation: "draft",
    parameters: { run_id: f.run },
    context: { root: f.root },
    policy_sha256: sha256(fs.readFileSync(f.policyFile)),
    implementation: {
      "editor.mjs": old.implementation["scripts/research/editor.mjs"],
      "draft-checkpoint.mjs": old.implementation["scripts/research/draft-checkpoint.mjs"],
    },
  }
  const state = {
    job_id: "failed",
    input_sha256: sha256(JSON.stringify(job)),
    state: "failed",
    error_code: "MODEL_INPUT_BUDGET_EXCEEDED",
    reasoning_task: null,
    finished_at: "2026-10-24T12:00:00Z",
  }
  atomicWrite(f.root, "module-jobs/failed/input.json", job)
  atomicWrite(f.root, "module-jobs/failed/state.json", state)
  const read = (p) => fs.readFileSync(path.join(f.root, p)),
    scopeBytes = Buffer.from(JSON.stringify(f.scope))
  const review = {
    schema: "research-draft-input-migration-review/v1",
    run_id: f.run,
    reviewer: "fixture",
    reviewed_at: "2026-10-25",
    reason: "Synthetic reviewed never-sent failure",
    failed_job_id: "failed",
    old_input_sha256: sha256(read("runs/case/model-draft-input.json")),
    failed_job_input_sha256: sha256(read("module-jobs/failed/input.json")),
    failed_job_state_sha256: sha256(read("module-jobs/failed/state.json")),
    policy_sha256: job.policy_sha256,
    claims_sha256: old.claims_sha256,
    documents_sha256: old.documents_sha256,
    parses_sha256: old.parses_sha256,
    completeness_context_sha256: old.completeness_context_sha256,
    execution_policy_sha256: old.execution_policy_sha256,
    authoring_scope_sha256: sha256(scopeBytes),
  }
  return {
    review,
    scopeBytes,
    original: read("runs/case/model-draft-input.json"),
    jobBytes: read("module-jobs/failed/input.json"),
    stateBytes: read("module-jobs/failed/state.json"),
  }
}

test("explicit reviewed scope keeps every important fact, exact IDs and citations; all_verified still fails closed", async (t) => {
  for (const [count, important] of [
    [113, 22],
    [73, 23],
    [58, 27],
  ]) {
    const f = fixture(t, count, important),
      before = JSON.stringify(f.claims)
    await assert.rejects(
      writeDraft(f.provider, f.claims, f.options),
      (e) => e.code === "MODEL_INPUT_BUDGET_EXCEEDED",
    )
    assert.equal(f.calls(), 0)
    const record = await writeDraft(f.provider, f.claims, { ...f.options, authoringScope: f.scope })
    const user = JSON.parse(f.captured().messages[1].content)
    assert.deepEqual(
      user.claims.map((c) => c.claim_id),
      f.scope.included_claim_ids,
    )
    for (const claim of user.claims) {
      const original = f.claims.find((c) => c.claim_id === claim.claim_id)
      for (const key of [
        "subject",
        "statement",
        "claim_kind",
        "event_state",
        "published_at",
        "effective_period",
        "numbers",
      ])
        assert.deepEqual(claim[key], original[key])
    }
    assert.deepEqual(
      f.captured().schema.properties.lead.items.properties.claim_ids.items.enum,
      f.scope.included_claim_ids,
    )
    assert.deepEqual(user.source_context[0].citations[0].claim_ids, f.scope.included_claim_ids)
    assert.equal(user.source_context[0].citations[0].quote, f.options.parses[0].blocks[0].text)
    assert.equal(record.provenance.request_budget.num_ctx, 32768)
    assert.equal(record.provenance.request_budget.output_reserved_tokens, 4096)
    assert.equal(record.public_approved, false)
    assert.equal(JSON.stringify(f.claims), before)
  }
})

test("an explicitly reviewed scope that still exceeds budget never drops another fact", async (t) => {
  const f = fixture(t, 113, 113)
  await assert.rejects(
    writeDraft(f.provider, f.claims, { ...f.options, authoringScope: f.scope }),
    (e) => e.code === "MODEL_INPUT_BUDGET_EXCEEDED",
  )
  assert.equal(f.calls(), 0)
  assert.equal(f.claims.length, 113)
})

test("completed historical input keeps its implementation and generation after a code update", async (t) => {
  const f = fixture(t, 3, 2),
    first = await f.write()
  const input = readJSON(f.root, "runs/case/model-draft-input.json")
  const checkpoint = readJSON(f.root, "runs/case/model-draft-checkpoint.json")
  input.implementation["scripts/research/editor.mjs"] = sha256("synthetic previous implementation")
  const originalOutput = fs.readFileSync(path.join(f.root, checkpoint.output_path))
  checkpoint.input_sha256 = sha256(JSON.stringify(input))
  checkpoint.output_path = "runs/case/drafts/model-" + checkpoint.input_sha256 + ".json"
  atomicWrite(f.root, "runs/case/model-draft-input.json", input)
  atomicWrite(f.root, checkpoint.output_path, originalOutput)
  atomicWrite(f.root, "runs/case/model-draft-checkpoint.json", checkpoint)
  const historicalBytes = fs.readFileSync(path.join(f.root, "runs/case/model-draft-input.json"))
  assert.equal((await f.write()).reused, true)
  assert.equal(f.calls(), 1)
  assert.deepEqual(loadDraftCheckpoint(f.root, f.run, f.claims, f.options).record, first.record)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/case/model-draft-input.json")),
    historicalBytes,
  )
})

test("scope rejects missing important IDs, added optional IDs, stale sources and context", (t) => {
  const f = fixture(t, 3, 2)
  for (const scope of [
    { ...f.scope, included_claim_ids: f.scope.included_claim_ids.slice(1) },
    { ...f.scope, included_claim_ids: f.scope.verified_claim_ids },
    { ...f.scope, excluded_claim_ids: [] },
    { ...f.scope, claims_sha256: sha256("changed") },
    { ...f.scope, parses_sha256: sha256("changed") },
    { ...f.scope, completeness_context_sha256: sha256("changed") },
  ])
    assert.throws(
      () => selectAuthoringClaims(f.claims, { ...f.options, authoringScope: scope }),
      /Authoring scope/,
    )
  assert.throws(
    () =>
      selectAuthoringClaims(f.claims, {
        ...f.options,
        completenessContext: null,
        authoringScope: f.scope,
      }),
    /completed source review/,
  )
  assert.equal(selectAuthoringClaims(f.claims, f.options).length, 3)
})

test("never-sent explicit migration preserves old bytes and failed attempt; restart and completed history reuse", async (t) => {
  const f = fixture(t)
  await assert.rejects(f.write(), (e) => e.code === "MODEL_INPUT_BUDGET_EXCEEDED")
  const b = failureReview(f),
    extra = {
      authoringScope: f.scope,
      authoringScopeBytes: b.scopeBytes,
      draftInputMigration: b.review,
      modelPolicyFile: f.policyFile,
    }
  await assert.rejects(f.write({ authoringScope: f.scope }), /input changed/)
  const provider = f.provider.structured
  f.provider.structured = async () => {
    throw Error("Synthetic interruption after migration")
  }
  await assert.rejects(f.write(extra), /Synthetic interruption/)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/case/model-draft-input.json")),
    b.original,
  )
  assert.deepEqual(fs.readFileSync(path.join(f.root, "module-jobs/failed/input.json")), b.jobBytes)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "module-jobs/failed/state.json")),
    b.stateBytes,
  )
  const migration = readJSON(f.root, "runs/case/model-draft-input-migration.json")
  assert.ok(migration.input.path.startsWith("runs/case/draft-inputs/"))
  assert.equal(loadDraftInput(f.root, f.run).authoring_scope_sha256, sha256(b.scopeBytes))
  f.provider.structured = provider
  const first = await f.write(extra)
  atomicWrite(f.root, "runs/case/draft.json", first.record)
  assert.equal((await f.write(extra)).reused, true)
  assert.equal(f.calls(), 1)
  assert.deepEqual(loadDraftCheckpoint(f.root, f.run, f.claims, f.options).record, first.record)
  assert.deepEqual(
    loadProcessedDraft(f.root, f.run, { claims: f.claims }, f.options.documents, f.options.parses),
    first.record,
  )
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/case/model-draft-input.json")),
    b.original,
  )
  await assert.rejects(measureFrozenWriterCost(f.root, f.run), /no per-source cost baseline/)
  const closure = buildArchiveClosure(f.root, "portable", f.run)
  const archived = new Set(closure.files.map((file) => file.path))
  for (const relative of [
    "runs/case/model-draft-input.json",
    "runs/case/model-draft-input-migration.json",
    "runs/case/editorial-completeness/context.json",
    migration.input.path,
    migration.review_file.path,
    migration.authoring_scope.path,
    ...migration.failure.map((ref) => ref.path),
    f.options.documents[0].body_path,
    `parses/${f.options.parses[0].parse_id}/parse.json`,
  ])
    assert.ok(archived.has(relative), "Portable closure missing " + relative)
  atomicWrite(f.root, "runs/portable/archive-manifest.json", closure)
  const archive = packageResearchArchive(f.root, "portable")
  const restored = path.join(f.root, "restored")
  const result = spawnSync(
    "python3",
    [
      "scripts/research/package-archive.py",
      "--root",
      f.root,
      "--package",
      archive.path,
      "--restore-to",
      "restored",
      "--expected-sha256",
      archive.sha256,
    ],
    { encoding: "utf8" },
  )
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(loadStoredSourceRun(restored, f.run).documents, f.options.documents)
  assert.deepEqual(loadDraftCheckpoint(restored, f.run, f.claims, f.options).record, first.record)
})

test("a never-sent failure may explicitly select reviewed scope without a code-version change", async (t) => {
  const f = fixture(t)
  await assert.rejects(f.write(), (e) => e.code === "MODEL_INPUT_BUDGET_EXCEEDED")
  const b = failureReview(f, { previousImplementation: false })
  await f.write({
    authoringScope: f.scope,
    draftInputMigration: b.review,
    modelPolicyFile: f.policyFile,
  })
  assert.equal(f.calls(), 1)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/case/model-draft-input.json")),
    b.original,
  )
})

test("executed, pending, approved and changed bindings cannot migrate", async (t) => {
  for (const artifact of [
    "model-policy/article_write/budget.json",
    "draft.json",
    "approved-article.json",
    "drafts/orphan.json",
  ]) {
    const f = fixture(t)
    await assert.rejects(f.write(), (e) => e.code === "MODEL_INPUT_BUDGET_EXCEEDED")
    const b = failureReview(f)
    atomicWrite(f.root, "runs/case/" + artifact, { synthetic: true })
    await assert.rejects(
      f.write({
        authoringScope: f.scope,
        draftInputMigration: b.review,
        modelPolicyFile: f.policyFile,
      }),
      /cannot migrate/,
    )
    assert.equal(f.calls(), 0)
  }
  const f = fixture(t)
  await assert.rejects(f.write(), (e) => e.code === "MODEL_INPUT_BUDGET_EXCEEDED")
  const b = failureReview(f)
  for (const key of [
    "old_input_sha256",
    "failed_job_state_sha256",
    "claims_sha256",
    "policy_sha256",
    "authoring_scope_sha256",
  ])
    await assert.rejects(
      f.write({
        authoringScope: f.scope,
        draftInputMigration: { ...b.review, [key]: sha256("changed") },
        modelPolicyFile: f.policyFile,
      }),
      /differs|changed|permits/,
    )
  atomicWrite(f.root, "reasoning-tasks/reasoning-" + sha256("pending") + "/request.json", {
    run: f.run,
    role: "article_write",
  })
  await assert.rejects(
    f.write({
      authoringScope: f.scope,
      draftInputMigration: b.review,
      modelPolicyFile: f.policyFile,
    }),
    /reasoning request cannot migrate/,
  )
})

test("module and direct CLI require explicit file/SHA pairs before provider dispatch", async (t) => {
  const f = fixture(t, 3, 2),
    file = path.join(f.root, "scope.json")
  fs.writeFileSync(file, JSON.stringify(f.scope))
  for (const key of [
    "authoring_scope_file",
    "authoring_scope_sha256",
    "draft_input_migration_file",
    "draft_input_migration_sha256",
  ])
    assert.ok(writing.operations.draft.inputSchema.properties[key])
  await assert.rejects(
    main(["draft", "--root", f.root, "--authoring-scope", file]),
    /file and exact SHA/,
  )
  await assert.rejects(
    main([
      "draft",
      "--root",
      f.root,
      "--authoring-scope",
      file,
      "--authoring-scope-sha256",
      sha256("wrong"),
    ]),
    /file bytes changed/,
  )
})
