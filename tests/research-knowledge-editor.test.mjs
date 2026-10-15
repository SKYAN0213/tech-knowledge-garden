import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { noteText } from "../scripts/garden.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import {
  KNOWLEDGE_DRAFT_HEADINGS,
  loadKnowledgeDraftInput,
  knowledgeDraftProblems,
  writeKnowledgeDraft,
  knowledgeDraftMarkdown,
  loadCompletedKnowledgeDraft,
} from "../scripts/research/knowledge-editor.mjs"
import {
  prepareKnowledgeJobs,
  processKnowledgeQueue,
} from "../scripts/research/knowledge-queue.mjs"
import { prepareRoleProvider, loadRoleBudget } from "../scripts/research/model-policy.mjs"
import { main } from "../scripts/research.mjs"
import { submitReasoningResult } from "../scripts/research/reasoning-tasks.mjs"

test("knowledge queue delegates without a failed generation and resumes the same native draft after Codex submits", async (t) => {
  const f = queueFixture(t)
  const policy = JSON.parse(fs.readFileSync(f.options.policyFile))
  policy.roles.concept_write.provider = "codex"
  policy.roles.concept_write.model = "codex"
  atomicWrite(f.root, "policy.json", policy)
  const options = { ...f.options, maxItems: 1, providerFactory: undefined }
  const first = await processKnowledgeQueue(options)
  const waiting = first.results.find((row) => row.status === "waiting_for_reasoning")
  assert.ok(waiting?.reasoning_task)
  assert.equal(first.counts.failed, 0)
  assert.equal(f.calls(), 0)
  const nativeStage = readJSON(f.root, "runs/term-a/knowledge-draft/state.json").stages.draft
  assert.equal(nativeStage.status, "waiting_for_reasoning")
  await submitReasoningResult(f.root, {
    ...waiting.reasoning_task,
    executor: "codex",
    output: f.draft,
  })
  const resumed = await processKnowledgeQueue(options)
  assert.equal(resumed.counts.draft_ready, 1)
  assert.equal(resumed.counts.failed, 0)
  assert.equal(f.calls(), 0)
  assert.equal(loadRoleBudget(f.root, "term-a", "concept_write").attempts.length, 1)
  assert.equal(
    loadCompletedKnowledgeDraft(f.root, "term-a", f.first, { vault: f.vault }).record.provenance
      .executor,
    "codex",
  )
  assert.equal(resumed.approvals_created, false)
  assert.equal(fs.existsSync(path.join(f.vault, f.first.path)), false)
})

function queueFixture(t) {
  const f = fixture(t),
    policyFile = path.join(f.root, "policy.json")
  atomicWrite(
    f.root,
    "policy.json",
    JSON.parse(fs.readFileSync(new URL("../data/research-model-policy.json", import.meta.url))),
  )
  const first = creation(f),
    second = structuredClone(first)
  second.path = "Knowledge/Second.md"
  Object.assign(second.note_metadata, {
    title: "Second",
    label: "두 번째 전문용어",
    concept_id: "second",
    aliases: ["Second Concept"],
  })
  atomicWrite(f.root, "first.json", first)
  atomicWrite(f.root, "second.json", second)
  let prepared = 0
  return {
    ...f,
    first,
    second,
    prepared: () => prepared,
    options: {
      root: f.root,
      vault: f.vault,
      runId: "knowledge-queue",
      policyFile,
      inputFiles: {
        "term-a": path.join(f.root, "first.json"),
        "term-b": path.join(f.root, "second.json"),
      },
      execute: true,
      providerFactory: async ({ root, run, policy, remainingMs }) => {
        prepared++
        assert.ok(remainingMs > 0)
        assert.equal(new URL(policy.runtime.ollama_url).hostname, "127.0.0.1")
        return prepareRoleProvider(f.ollama, policy, "concept_write", { root, run })
      },
    },
  }
}

test("knowledge queue resumes bounded native drafts with no repeated model access and no authority writes", async (t) => {
  const f = queueFixture(t)
  const first = await processKnowledgeQueue({ ...f.options, maxItems: 1 })
  assert.deepEqual(first.counts, { pending: 1, running: 0, draft_ready: 1, failed: 0 })
  assert.equal(first.status, "yielded")
  const bytes = fs.readFileSync(path.join(f.root, "runs/term-a/knowledge-draft.json"))
  const second = await processKnowledgeQueue({ ...f.options, maxItems: 1 })
  assert.equal(second.status, "review_pending")
  assert.equal(second.counts.draft_ready, 2)
  assert.equal(f.calls(), 2)
  assert.equal(f.prepared(), 2)
  assert.deepEqual(fs.readFileSync(path.join(f.root, "runs/term-a/knowledge-draft.json")), bytes)
  for (const run of ["term-a", "term-b"]) {
    assert.equal(loadRoleBudget(f.root, run, "concept_write").attempts.length, 1)
    assert.ok(
      loadCompletedKnowledgeDraft(f.root, run, run === "term-a" ? f.first : f.second, {
        vault: f.vault,
      }),
    )
  }
  const resumed = await processKnowledgeQueue({
    ...f.options,
    maxItems: 0,
    providerFactory: () => {
      throw Error("Completed drafts must not consult a model")
    },
  })
  assert.deepEqual(resumed, second)
  const cached = await processKnowledgeQueue({
    ...f.options,
    runId: "new-cache-reader",
    maxItems: 0,
    providerFactory: () => {
      throw Error("Model is offline")
    },
  })
  assert.ok(cached.results.every((row) => row.generation_reused))
  assert.equal(cached.approvals_created, false)
  assert.equal(cached.candidate_published, false)
  assert.equal(fs.existsSync(path.join(f.vault, f.first.path)), false)
  assert.equal(fs.existsSync(path.join(f.vault, f.second.path)), false)
  assert.equal(fs.readFileSync(path.join(f.vault, f.input.path), "utf8"), f.original)
})

test("knowledge queue validates every selection and cross-job aliases before inference", async (t) => {
  const f = queueFixture(t)
  const bad = structuredClone(f.second)
  bad.note_metadata.aliases = f.first.note_metadata.aliases
  atomicWrite(f.root, "second.json", bad)
  assert.throws(
    () => prepareKnowledgeJobs(f.root, f.options.inputFiles, { vault: f.vault }),
    /alias|collision|conflict/i,
  )
  await assert.rejects(processKnowledgeQueue(f.options))
  assert.equal(f.calls(), 0)
  assert.equal(f.prepared(), 0)
  assert.equal(
    fs.existsSync(path.join(f.root, "runs/knowledge-queue/knowledge-queue/input.json")),
    false,
  )
})

test("knowledge queue preserves failure and proceeds with independent terms without automatic retries", async (t) => {
  const f = queueFixture(t)
  let failed = 0
  const providerFactory = async (args) => {
    if (args.run === "term-a") {
      failed++
      throw Error("Private provider failure")
    }
    return f.options.providerFactory(args)
  }
  const result = await processKnowledgeQueue({ ...f.options, providerFactory })
  assert.equal(result.status, "partial")
  assert.equal(result.counts.failed, 1)
  assert.equal(result.counts.draft_ready, 1)
  assert.equal(result.results[0].automatic_retry, false)
  await processKnowledgeQueue({ ...f.options, providerFactory })
  assert.equal(failed, 1)
  assert.equal(f.calls(), 1)
})

test("knowledge queue preserves interrupted native generation and expires its shared time budget", async (t) => {
  const f = queueFixture(t)
  atomicWrite(f.root, "runs/term-a/knowledge-draft/state.json", {
    stages: { draft: { status: "running" } },
  })
  const result = await processKnowledgeQueue(f.options)
  assert.equal(result.counts.failed, 1)
  assert.equal(result.counts.draft_ready, 1)
  assert.equal(f.calls(), 1)
  assert.ok(result.results[0].error.includes("explicit review"))
  const g = queueFixture(t)
  let tick = 0
  const expired = await processKnowledgeQueue({
    ...g.options,
    timeBudgetMs: 1,
    clock: () => tick++,
  })
  assert.equal(expired.counts.pending, 2)
  assert.equal(g.prepared(), 0)
  assert.equal(g.calls(), 0)
})

test("completed knowledge reader rejects changed selection, source, preview, binding and native output", async (t) => {
  const f = queueFixture(t)
  await processKnowledgeQueue({ ...f.options, maxItems: 1 })
  const load = (input = f.first) =>
    loadCompletedKnowledgeDraft(f.root, "term-a", input, { vault: f.vault })
  const changed = structuredClone(f.first)
  changed.note_metadata.label = "Changed selection"
  assert.throws(() => load(changed), /frozen input/)
  for (const [file, mutate] of [
    ["runs/term-a/knowledge-draft-input.json", (value) => ({ ...value, model: "different-model" })],
    ["runs/term-a/knowledge-draft.json", (value) => ({ ...value, status: "approved" })],
    ["runs/term-a/model-policy/concept_write/budget.json", (value) => ({ ...value, attempts: [] })],
  ]) {
    const full = path.join(f.root, file),
      bytes = fs.readFileSync(full)
    atomicWrite(f.root, file, mutate(JSON.parse(bytes)))
    assert.throws(() => load())
    fs.writeFileSync(full, bytes)
    assert.ok(load())
  }
  const previewFile = path.join(f.root, "runs/term-a/knowledge-preview.md"),
    preview = fs.readFileSync(previewFile)
  fs.writeFileSync(previewFile, "changed preview")
  assert.throws(() => load(), /preview changed/)
  fs.writeFileSync(previewFile, preview)
  fs.writeFileSync(path.join(f.root, f.document.body_path), "different original bytes")
  assert.throws(() => load(), /body hash/)
  assert.equal(f.calls(), 1)
})

test("knowledge queue freezes policy and native output and cannot silently resume a changed checkpoint", async (t) => {
  const f = queueFixture(t)
  const result = await processKnowledgeQueue({ ...f.options, maxItems: 1 })
  const latest = readJSON(f.root, result.receipt)
  latest.results[0].draft.sha256 = sha256("wrong")
  atomicWrite(f.root, result.receipt, latest)
  await assert.rejects(processKnowledgeQueue(f.options), /output changed/)
  atomicWrite(
    f.root,
    result.receipt,
    Object.fromEntries(Object.entries(result).filter(([key]) => key !== "receipt")),
  )
  fs.appendFileSync(f.options.policyFile, "\n")
  await assert.rejects(processKnowledgeQueue(f.options), /input changed/)
  assert.equal(f.calls(), 1)
})

test("knowledge Markdown hides empty optional sections while preserving exact fact source links", (t) => {
  const f = fixture(t)
  const body = knowledgeDraftMarkdown({ draft: f.draft }, f.claims, [f.document])
  assert.ok(body.includes("## 한 문장 정의"))
  assert.ok(body.includes(f.document.original_url))
  assert.ok(!body.includes("없음"))
  for (const heading of KNOWLEDGE_DRAFT_HEADINGS.slice(1))
    assert.ok(!body.includes(`## ${heading}`))
})

test("direct knowledge writing uses MLX by default and preserves explicit overrides", async (t) => {
  const f = fixture(t)
  for (const model of [undefined, "explicit-local-model"]) {
    const requested = []
    const stopped = Error("Stop before model metadata access")
    await assert.rejects(
      writeKnowledgeDraft(f.root, "model-check", f.input, {
        vault: f.vault,
        ...(model ? { model } : {}),
        ollama: {
          metadata: async (value) => {
            requested.push(value)
            throw stopped
          },
        },
      }),
      (error) => error === stopped,
    )
    assert.deepEqual(requested, [model ?? "qwen3.8:27b-mlx"])
  }
})

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-editor-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const vault = path.join(root, "vault"),
    url = "https://example.org/model",
    body = "A pretrained model forecasts unseen series."
  const source_id = sourceId(url),
    source_version_id = source_id + ":" + sha256(body),
    parse_id = sha256("parse")
  const document = {
    source_id,
    source_version_id,
    original_url: url,
    body_path: "body.html",
    body_sha256: sha256(body),
    fetch_status: "captured",
    observed_at: "2026-09-26T00:00:00Z",
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id,
    source_version_id,
    parse_id,
    title: "Model",
    status: "extracted",
    dates: { published_at: "2026-09-25", observed_at: document.observed_at },
    blocks: [{ block_id: parse_id + ":b1", text: body, locator: { text_hash: sha256(body) } }],
    quality: { missing_pages: [] },
  }
  const claim = {
    claim_id: "fact-one",
    statement: body,
    claim_kind: "fact",
    subject: "A model",
    event_state: "completed",
    published_at: "2026-09-25",
    effective_period: null,
    numbers: [],
    evidence: [
      {
        source_id,
        source_version_id,
        parse_id,
        block_id: parse.blocks[0].block_id,
        quote: body,
        support: "direct",
      },
    ],
  }
  const claims = recordFactReview(
    [claim],
    [
      {
        claim_id: claim.claim_id,
        status: "verified",
        reason: "Synthetic source reading",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      },
    ],
    { reviewer: "Fixture reviewer", reviewed_at: "2026-09-26" },
    [parse],
  )
  const original = noteText(
    {
      title: "Model",
      type: "knowledge",
      entry_type: "concept",
      schema_version: "tech-encyclopedia/v2",
      concept_id: "model",
      map_review: { decision: "exclude", reason: "Synthetic fixture" },
    },
    "## 한 문장 정의\n\n기존 설명.\n",
  )
  atomicWrite(vault, "Knowledge/Model.md", original)
  atomicWrite(root, document.body_path, body)
  atomicWrite(root, `parses/${parse_id}/parse.json`, parse)
  atomicWrite(root, "runs/source/documents.json", [document])
  atomicWrite(root, "runs/source/parses.json", [parse])
  atomicWrite(root, "runs/source/reviewed-claims.json", { claims })
  const input = {
    schema: "knowledge-draft-input/v1",
    path: "Knowledge/Model.md",
    previous_sha256: sha256(original),
    evidence: [{ run_id: "source", claim_ids: [claim.claim_id] }],
  }
  const draft = {
    sections: KNOWLEDGE_DRAFT_HEADINGS.map((heading, i) => ({
      heading,
      paragraphs:
        i === 0
          ? [
              {
                text: "사전학습으로 새로운 시계열을 예측하는 모델이다.",
                claim_ids: [claim.claim_id],
              },
            ]
          : [],
    })),
  }
  let calls = 0
  const metadata = {
    model: "qwen3.8:27b-mlx",
    digest: sha256("model-v1"),
    runtime: "fixture",
    capabilities: ["completion"],
    thinking: { values: [false] },
  }
  const ollama = {
    metadata: async () => metadata,
    structured: async (request) => {
      calls++
      assert.equal(request.think, false)
      assert.equal(request.num_ctx, 16384)
      assert.ok(request.messages[1].content.includes(body))
      const fact = JSON.parse(request.messages[1].content).claims[0]
      assert.equal(fact.evidence[0].source_title, "Model")
      assert.equal(fact.evidence[0].source_url, url)
      assert.ok(request.messages[0].content.includes("하나의 구현만 설명"))
      return {
        output: draft,
        provenance: { ...metadata, model: request.model },
        artifacts: { response_content: JSON.stringify(draft) },
      }
    },
  }
  return {
    root,
    vault,
    input,
    draft,
    claims,
    original,
    document,
    metadata,
    ollama,
    calls: () => calls,
  }
}

function creation(f) {
  return {
    ...f.input,
    schema: "knowledge-draft-input/v2",
    operation: "create",
    path: "Knowledge/Forecasting.md",
    previous_sha256: null,
    note_metadata: {
      title: "Forecasting",
      type: "knowledge",
      entry_type: "concept",
      schema_version: "tech-encyclopedia/v2",
      status: "evergreen",
      domain: "AI Systems",
      group: "AI",
      concept_id: "forecasting",
      label: "예측 모델",
      created: "2026-09-27",
      updated: "2026-09-27",
      last_reviewed: "2026-09-27",
      aliases: ["Forecasting Model"],
      keywords: ["예측"],
      parent_concepts: [],
      related_concepts: [],
      tags: [],
      verified_sources: [f.document.original_url],
      connections: [],
      relations: [],
      map_review: {
        decision: "include",
        kind: "model",
        reason: "사전학습으로 새로운 시계열을 예측하는 모델 원리를 설명한다",
        reviewed: "2026-09-27",
      },
    },
  }
}

test("v2 knowledge creation keeps selected metadata outside the model and never writes an authority placeholder", async (t) => {
  const f = fixture(t),
    input = creation(f),
    options = { vault: f.vault, ollama: f.ollama }
  const context = loadKnowledgeDraftInput(f.root, input, options)
  assert.equal(context.original_sha256, null)
  await writeKnowledgeDraft(f.root, "create-draft", input, options)
  const record = readJSON(f.root, "runs/create-draft/knowledge-draft.json")
  assert.equal(record.schema, "knowledge-draft/v2")
  assert.equal(record.operation, "create")
  assert.equal(record.previous_sha256, null)
  assert.deepEqual(record.note_metadata, input.note_metadata)
  assert.equal(fs.existsSync(path.join(f.vault, input.path)), false)
  await writeKnowledgeDraft(f.root, "create-draft", input, options)
  assert.equal(f.calls(), 1)
  atomicWrite(f.vault, input.path, "another writer")
  await assert.rejects(
    writeKnowledgeDraft(f.root, "create-draft", input, options),
    /already exists/,
  )
  assert.equal(fs.readFileSync(path.join(f.vault, input.path), "utf8"), "another writer")
  assert.equal(f.calls(), 1)
})

test("v2 creation refuses missing operation/null, private metadata, backdating, aliases and unselected sources before inference", (t) => {
  const f = fixture(t),
    input = creation(f),
    options = { vault: f.vault }
  for (const change of [
    (d) => {
      delete d.operation
    },
    (d) => {
      delete d.previous_sha256
    },
    (d) => {
      d.previous_sha256 = f.input.previous_sha256
    },
    (d) => {
      d.operation = "replace"
    },
    (d) => {
      d.path = "Knowledge/Forecasting#fragment.md"
    },
    (d) => {
      d.note_metadata.private_notes = "private"
    },
    (d) => {
      d.note_metadata.created = "2026-08-27"
    },
    (d) => {
      d.note_metadata.aliases = ["Model"]
    },
    (d) => {
      d.note_metadata.verified_sources = ["https://example.org/not-selected"]
    },
    (d) => {
      d.note_metadata.last_reviewed = "2026-09-25"
      d.note_metadata.created = "2026-09-25"
      d.note_metadata.updated = "2026-09-25"
      d.note_metadata.map_review.reviewed = "2026-09-25"
    },
  ]) {
    const copy = structuredClone(input)
    change(copy)
    assert.throws(() => loadKnowledgeDraftInput(f.root, copy, options))
  }
  fs.symlinkSync(path.join(f.root, "missing"), path.join(f.vault, input.path))
  assert.throws(() => loadKnowledgeDraftInput(f.root, input, options), /Symlink/)
  assert.equal(f.calls(), 0)
})

test("v2 replacement retains the actual prior hash and rejects creation metadata", async (t) => {
  const f = fixture(t),
    input = { ...f.input, schema: "knowledge-draft-input/v2", operation: "replace" },
    options = { vault: f.vault, ollama: f.ollama }
  await writeKnowledgeDraft(f.root, "replace-draft", input, options)
  const record = readJSON(f.root, "runs/replace-draft/knowledge-draft.json")
  assert.equal(record.operation, "replace")
  assert.equal(record.previous_sha256, sha256(f.original))
  assert.equal(Object.hasOwn(record, "note_metadata"), false)
  assert.throws(() =>
    loadKnowledgeDraftInput(
      f.root,
      { ...input, note_metadata: creation(f).note_metadata },
      options,
    ),
  )
})

test("knowledge drafting uses verified evidence, preserves excluded canonical notes and resumes without inference", async (t) => {
  const f = fixture(t),
    options = { vault: f.vault, ollama: f.ollama }
  const result = await writeKnowledgeDraft(f.root, "draft", f.input, options)
  assert.equal(result.status, "editorial_review")
  assert.equal(result.candidate_published, false)
  assert.deepEqual(result.problems, [])
  assert.equal(fs.readFileSync(path.join(f.vault, f.input.path), "utf8"), f.original)
  assert.ok(
    fs
      .readFileSync(path.join(f.root, "runs/draft/knowledge-preview.md"), "utf8")
      .includes("[원문](https://example.org/model)"),
  )
  const bytes = fs.readFileSync(path.join(f.root, "runs/draft/knowledge-draft.json"))
  await writeKnowledgeDraft(f.root, "draft", f.input, options)
  assert.equal(f.calls(), 1)
  assert.deepEqual(fs.readFileSync(path.join(f.root, "runs/draft/knowledge-draft.json")), bytes)
})

test("knowledge source selection rejects paths, duplicate evidence, stale authoring and corrupt real bytes before inference", async (t) => {
  const f = fixture(t),
    options = { vault: f.vault, ollama: f.ollama }
  for (const patch of [
    { path: "Knowledge/../Knowledge/Model.md" },
    { path: "Knowledge\\Model.md" },
    { previous_sha256: sha256("stale") },
    { evidence: [f.input.evidence[0], f.input.evidence[0]] },
    { evidence: [{ run_id: "../source", claim_ids: ["fact-one"] }] },
    { evidence: [{ run_id: "source", claim_ids: ["missing"] }] },
  ])
    assert.throws(() => loadKnowledgeDraftInput(f.root, { ...f.input, ...patch }, options))
  fs.writeFileSync(path.join(f.root, f.document.body_path), "changed bytes")
  await assert.rejects(writeKnowledgeDraft(f.root, "draft", f.input, options), /body hash/)
  assert.equal(f.calls(), 0)
})

test("knowledge prose rejects missing definitions, reordered headings, foreign facts, internal IDs and operational copy", (t) => {
  const f = fixture(t)
  const cases = [
    [(d) => d.sections.reverse(), "knowledge_sections_must_be_ordered_and_unique"],
    [(d) => (d.sections[0].paragraphs = []), "one_standalone_definition_required"],
    [
      (d) => (d.sections[0].paragraphs[0].claim_ids = ["other"]),
      "unknown_or_duplicate_knowledge_fact",
    ],
    [
      (d) => (d.sections[0].paragraphs[0].text = "fact-one을 참조한다."),
      "internal_fact_identity_in_knowledge_prose",
    ],
    [
      (d) => (d.sections[0].paragraphs[0].text = "분석할 수 없으므로 자료가 필요하다."),
      "operational_copy_in_knowledge_prose",
    ],
    [
      (d) => (d.sections[0].paragraphs[0].text = "<script>설명</script>"),
      "plain_korean_knowledge_prose_required",
    ],
  ]
  for (const [change, problem] of cases) {
    const draft = structuredClone(f.draft)
    change(draft)
    assert.ok(knowledgeDraftProblems(draft, f.claims).includes(problem))
  }
  assert.ok(
    knowledgeDraftProblems(
      f.draft,
      f.claims.map((c) => ({ ...c, review: { status: "unreviewed" } })),
    ).includes("knowledge_fact_needs_review"),
  )
})

test("knowledge checkpoints reject model changes and altered saved raw output", async (t) => {
  const f = fixture(t),
    options = { vault: f.vault, ollama: f.ollama }
  await writeKnowledgeDraft(f.root, "draft", f.input, options)
  f.metadata.digest = sha256("model-v2")
  await assert.rejects(writeKnowledgeDraft(f.root, "draft", f.input, options), /input changed/)
  f.metadata.digest = sha256("model-v1")
  const file = path.join(f.root, "runs/draft/knowledge-draft.json"),
    before = fs.readFileSync(file)
  const altered = JSON.parse(before)
  altered.draft.sections[0].paragraphs[0].text = "바꾼 설명."
  fs.writeFileSync(file, JSON.stringify(altered))
  await assert.rejects(writeKnowledgeDraft(f.root, "draft", f.input, options), /differs/)
  fs.writeFileSync(file, before)
  await writeKnowledgeDraft(f.root, "draft", f.input, options)
  assert.equal(f.calls(), 1)
})

test("fact review changes invalidate a completed knowledge draft rather than silently reusing it", async (t) => {
  const f = fixture(t),
    options = { vault: f.vault, ollama: f.ollama }
  await writeKnowledgeDraft(f.root, "draft", f.input, options)
  const record = readJSON(f.root, "runs/source/reviewed-claims.json")
  record.claims[0].review.reason = "Changed review input"
  atomicWrite(f.root, "runs/source/reviewed-claims.json", record)
  await assert.rejects(writeKnowledgeDraft(f.root, "draft", f.input, options), /input changed/)
  assert.equal(f.calls(), 1)
})

test("knowledge CLI requires an explicit source input instead of inventing a draft", async () => {
  await assert.rejects(main(["knowledge-draft", "--run", "missing-review"]), /input JSON/)
})
