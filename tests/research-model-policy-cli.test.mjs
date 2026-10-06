import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { main } from "../scripts/research.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { researchSlots, planSearchQueries } from "../scripts/research/search.mjs"
import { Ollama } from "../scripts/research/ollama.mjs"
import { prepareRoleOllama } from "../scripts/research/model-policy.mjs"
import { THEMES } from "../scripts/themes.mjs"
import { SECTORS } from "../scripts/sectors.mjs"
import { noteText } from "../scripts/garden.mjs"
import {
  KNOWLEDGE_DRAFT_HEADINGS,
  writeKnowledgeDraft,
} from "../scripts/research/knowledge-editor.mjs"

const model = "qwen3.8:27b"
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-policy-cli-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const body = "Example plans to ship 50 units in 2027.",
    url = "https://example.org/news/plan"
  const source_id = sourceId(url),
    source_version_id = source_id + ":" + sha256(body),
    parse_id = sha256("policy-cli-parse")
  const document = {
    source_id,
    source_version_id,
    original_url: url,
    final_url: url,
    body_path: "fixture-body.txt",
    body_sha256: sha256(body),
    fetch_status: "captured",
    observed_at: "2026-09-27T00:00:00Z",
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id,
    source_version_id,
    parse_id,
    title: "A future shipment",
    status: "extracted",
    dates: { published_at: "2026-09-26", observed_at: document.observed_at },
    blocks: [{ block_id: parse_id + ":b1", text: body, locator: { text_hash: sha256(body) } }],
    quality: { missing_pages: [] },
  }
  atomicWrite(root, document.body_path, body)
  atomicWrite(root, `parses/${parse_id}/parse.json`, parse)
  atomicWrite(root, "runs/source/documents.json", [document])
  atomicWrite(root, "runs/source/parses.json", [parse])
  const settings = {
    model,
    think: false,
    num_ctx: 16384,
    num_predict: 2048,
    call_timeout_ms: 1000,
    total_timeout_ms: 5000,
  }
  const policy = {
    schema: "model-execution-policy/v1",
    roles: {
      fact_extract: {
        ...settings,
        input_char_budget: 16000,
        facts_per_batch: 2,
        extraction_timeout_ms: 5000,
      },
      article_write: { ...settings, think: "medium" },
      search_plan: { ...settings, think: "medium" },
    },
  }
  const file = path.join(root, "policy.json")
  fs.writeFileSync(file, JSON.stringify(policy))
  return { root, file, policy, parse }
}
function localRuntime(t, respond) {
  const calls = [],
    metadata = { digest: "a".repeat(64), runtime: "fixture-runtime" }
  const fetchImpl = async (url, options = {}) => {
    const endpoint = new URL(url).pathname,
      body = options.body ? JSON.parse(options.body) : null
    calls.push({ endpoint, body })
    if (endpoint === "/api/tags")
      return Response.json({
        models: [model, "fixture:13b"].map((name) => ({ name, digest: metadata.digest })),
      })
    if (endpoint === "/api/version") return Response.json({ version: metadata.runtime })
    if (endpoint === "/api/show")
      return Response.json({
        capabilities: ["completion"],
        thinking: { values: [false, "medium"], default: "medium" },
        details: {},
      })
    if (endpoint === "/api/chat")
      return new Response(
        JSON.stringify({
          done: true,
          done_reason: "stop",
          message: { content: JSON.stringify(respond(body)) },
        }) + "\n",
        { headers: { "content-type": "application/x-ndjson" } },
      )
    throw Error("Unexpected local fixture endpoint")
  }
  t.mock.method(globalThis, "fetch", fetchImpl)
  return { calls, metadata, api: new Ollama({ fetchImpl }) }
}
function factOutput(request) {
  const doc = JSON.parse(request.messages[1].content)[0],
    block = doc.blocks[0]
  return {
    claims: [
      {
        statement: block.text,
        claim_kind: "attributed_fact",
        subject: "Example",
        event_state: "planned",
        published_at: doc.dates.published_at,
        effective_period: "2027",
        numbers: [],
        evidence: [{ block_key: block.block_key, quote: block.text, support: "direct" }],
      },
    ],
  }
}
function args(f, run, extra = []) {
  return [
    "extract",
    "--root",
    f.root,
    "--run",
    run,
    "--source-run",
    "source",
    "--model-policy",
    f.file,
    ...extra,
  ]
}
test("policy CLI rejects non-generating commands before touching a local model", async (t) => {
  const f = fixture(t),
    r = localRuntime(t, () => {
      throw Error("No inference expected")
    })
  for (const command of ["model-info", "collect", "approve", "preview", "review", "archive"])
    await assert.rejects(
      main([command, "--run", "unused", "--model-policy", f.file]),
      /model policy.*only|only.*model policy/i,
    )
  assert.equal(r.calls.length, 0)
})
test("explicit OpenAI policy routes the real extract CLI through Responses without publishing", async (t) => {
  const f = fixture(t)
  f.policy.roles.fact_extract.provider = "openai"
  f.policy.roles.fact_extract.model = "gpt-6-luna"
  fs.writeFileSync(f.file, JSON.stringify(f.policy))

  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = "test-secret-key"
  t.after(() => {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousKey
  })
  const requests = []
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const pathname = new URL(url).pathname
    requests.push({ pathname, options, body: options.body ? JSON.parse(options.body) : null })
    assert.equal(options.headers.authorization, "Bearer test-secret-key")
    if (pathname === "/v1/models/gpt-6-luna")
      return Response.json({ id: "gpt-6-luna", created: 1790812800, owned_by: "openai" })
    if (pathname === "/v1/responses")
      return Response.json({
        id: "resp_cli_fixture",
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: '{"claims":[]}' }],
          },
        ],
        usage: { input_tokens: 20, output_tokens: 2, total_tokens: 22 },
      })
    throw Error(`Unexpected API path ${pathname}`)
  })

  const result = await main(args(f, "openai-extract"))
  assert.equal(result.claims, 0)
  assert.equal(result.candidate_published, false)
  const sent = requests.find((request) => request.pathname === "/v1/responses").body
  assert.equal(sent.model, "gpt-6-luna")
  assert.equal(sent.store, false)
  assert.equal(sent.text.format.type, "json_schema")
  const ledger = readJSON(f.root, "runs/openai-extract/model-policy/fact_extract/budget.json")
  assert.equal(ledger.binding.settings.provider, "openai")
  assert.equal(ledger.attempts[0].result.provenance.usage.total_tokens, 22)
  assert.equal(JSON.stringify(ledger).includes("test-secret-key"), false)
})
test("extraction CLI applies policy false and budgets instead of parser defaults", async (t) => {
  const f = fixture(t),
    r = localRuntime(t, factOutput)
  const result = await main(args(f, "extract-policy"))
  assert.equal(result.claims, 1)
  assert.equal(result.candidate_published, false)
  const sent = r.calls.find((x) => x.endpoint === "/api/chat").body
  assert.equal(sent.think, false)
  assert.deepEqual(sent.options, { num_ctx: 16384, num_predict: 2048, temperature: 0 })
  assert.equal(sent.format.properties.claims.maxItems, 2)
  const ledger = readJSON(f.root, "runs/extract-policy/model-policy/fact_extract/budget.json")
  assert.equal(ledger.binding.role, "fact_extract")
  assert.equal(ledger.attempts[0].status, "complete")
  assert.equal(ledger.binding.settings.input_char_budget, 16000)
  assert.equal(
    readJSON(f.root, "runs/extract-policy/claims.json").claims[0].review.status,
    "unreviewed",
  )
})
test("explicit extraction CLI overrides remain typed and participate in reuse identity", async (t) => {
  const f = fixture(t),
    r = localRuntime(t, factOutput)
  const command = args(f, "override", [
    "--think=medium",
    "--num-predict",
    "4096",
    "--facts-per-batch=3",
  ])
  await main(command)
  const sent = r.calls.find((x) => x.endpoint === "/api/chat").body
  assert.equal(sent.think, "medium")
  assert.equal(sent.options.num_predict, 4096)
  assert.equal(sent.format.properties.claims.maxItems, 3)
  await main(command)
  assert.equal(r.calls.filter((x) => x.endpoint === "/api/chat").length, 1)
  await assert.rejects(main(args(f, "override", ["--think", "false"])), /changed/i)
  assert.equal(r.calls.filter((x) => x.endpoint === "/api/chat").length, 1)
})
test("local resume budget requires a model policy and is limited to extract", async () => {
  await assert.rejects(
    main(["extract", "--run", "resume", "--resume-local-budget-ms", "100"]),
    /requires an explicit --model-policy/i,
  )
  await assert.rejects(
    main(["draft", "--run", "resume", "--resume-local-budget-ms", "100"]),
    /only supported for extract/i,
  )
  await assert.rejects(
    main([
      "extract",
      "--run",
      "resume",
      "--model-policy",
      "missing.json",
      "--resume-local-budget-ms",
      "3600001",
    ]),
    /between 1 and 3600000/i,
  )
})
test("policy or installed runtime changes cannot return an old extraction stage", async (t) => {
  const f = fixture(t),
    r = localRuntime(t, factOutput),
    command = args(f, "fingerprint")
  await main(command)
  await main(command)
  assert.equal(r.calls.filter((x) => x.endpoint === "/api/chat").length, 1)
  f.policy.roles.fact_extract.num_predict = 4096
  fs.writeFileSync(f.file, JSON.stringify(f.policy))
  await assert.rejects(main(command), /changed/i)
  f.policy.roles.fact_extract.num_predict = 2048
  fs.writeFileSync(f.file, JSON.stringify(f.policy))
  r.metadata.runtime = "different-runtime"
  await assert.rejects(main(command), /changed/i)
  assert.equal(r.calls.filter((x) => x.endpoint === "/api/chat").length, 1)
})
test("article CLI uses its own policy and preserves reviewed-source-only drafting", async (t) => {
  const f = fixture(t),
    r = localRuntime(t, (request) =>
      request.format.properties.claims
        ? factOutput(request)
        : {
            title: "Example, 2027년 제품 50개 출하 계획",
            lead: [
              { text: "Example이 제품 출하 계획을 발표했다.", claim_ids: [claimId] },
              { text: "출하는 2027년에 진행할 예정이다.", claim_ids: [claimId] },
            ],
            facts: {
              who: "Example",
              when: "2026-09-26",
              where: null,
              what: "제품 출하 계획",
              how: null,
              why: null,
            },
            sector: SECTORS[0],
            theme: THEMES[0].name,
            tags: [THEMES[0].tags[0]],
            entities: ["Example"],
            explanations: [],
          },
    )
  let claimId
  await main(args(f, "write"))
  const extracted = readJSON(f.root, "runs/write/claims.json")
  claimId = extracted.claims[0].claim_id
  const claims = recordFactReview(
    extracted.claims,
    [
      {
        claim_id: claimId,
        status: "verified",
        reason: "Synthetic fixture source reading",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      },
    ],
    { reviewer: "Fixture reviewer", reviewed_at: "2026-09-27" },
    [f.parse],
  )
  atomicWrite(f.root, "runs/write/reviewed-claims.json", { ...extracted, claims })
  const result = await main(["draft", "--root", f.root, "--run", "write", "--model-policy", f.file])
  assert.equal(result.candidate_published, false)
  const sent = r.calls.filter((x) => x.endpoint === "/api/chat").at(-1).body
  assert.equal(sent.think, "medium")
  assert.equal(sent.options.num_predict, 2048)
  const draft = readJSON(f.root, "runs/write/draft.json")
  assert.equal(draft.provenance.model_policy.role, "article_write")
  assert.equal(draft.public_approved, false)
  assert.ok(!fs.existsSync(path.join(f.root, "runs/write/approved-article.json")))
  atomicWrite(f.root, "correction.json", {
    draft_id: draft.draft_id,
    reviewer: "Fixture editor",
    reason: "Explicit prose correction",
    reviewed_at: "2026-09-27",
    draft: { ...draft.draft, title: "Example, 제품 50개를 2027년에 출하할 계획" },
  })
  await main([
    "correct",
    "--root",
    f.root,
    "--run",
    "write",
    "--review",
    path.join(f.root, "correction.json"),
  ])
  const corrected = fs.readFileSync(path.join(f.root, "runs/write/draft.json"))
  await assert.rejects(
    main(["draft", "--root", f.root, "--run", "write", "--model-policy", f.file]),
    /already corrected/i,
  )
  assert.deepEqual(fs.readFileSync(path.join(f.root, "runs/write/draft.json")), corrected)
  assert.equal(r.calls.filter((x) => x.endpoint === "/api/chat").length, 2)
})
test("search generation binds stage checkpoints to policy even without another inference", async (t) => {
  const f = fixture(t),
    r = localRuntime(t, () => ({
      queries: researchSlots().map((slot, n) => ({
        slot_id: slot.slot_id,
        query: `${{ ko: "국내 기술", en: "Technical sources", ja: "ロボットのニュース", zh: "工业技术投资", de: "Neue Energie und Unternehmen" }[slot.language]} ${n}`,
      })),
    }))
  const scoped = await prepareRoleOllama(r.api, f.policy, "search_plan", {
    root: f.root,
    run: "queries",
  })
  const options = { model, date: "2026-09-27" }
  await planSearchQueries(f.root, "queries", scoped, options)
  await planSearchQueries(f.root, "queries", scoped, options)
  assert.equal(r.calls.filter((x) => x.endpoint === "/api/chat").length, 1)
  // A changed policy wrapper must not be bypassed by a completed generation stage.
  const changed = Object.create(scoped)
  changed.executionPolicy = { ...scoped.executionPolicy, fingerprint: sha256("different settings") }
  await assert.rejects(planSearchQueries(f.root, "queries", changed, options), /input changed/i)
  assert.equal(r.calls.filter((x) => x.endpoint === "/api/chat").length, 1)
})

test("explicit input bounds are validated against the policy context rather than CLI defaults", async (t) => {
  const f = fixture(t),
    r = localRuntime(t, factOutput)
  f.policy.roles.fact_extract.num_ctx = 32768
  f.policy.roles.fact_extract.input_char_budget = 50000
  fs.writeFileSync(f.file, JSON.stringify(f.policy))
  await main(args(f, "large-context", ["--input-char-budget", "45000"]))
  const ledger = readJSON(f.root, "runs/large-context/model-policy/fact_extract/budget.json")
  assert.equal(ledger.binding.settings.input_char_budget, 45000)
  assert.equal(r.calls.find((x) => x.endpoint === "/api/chat").body.options.num_ctx, 32768)
})

test("block bounds flow through the policy CLI and pin extraction checkpoint reuse", async (t) => {
  const f = fixture(t),
    r = localRuntime(t, factOutput)
  f.policy.roles.fact_extract.max_blocks_per_batch = 4
  fs.writeFileSync(f.file, JSON.stringify(f.policy))
  await main(args(f, "block-bound", ["--max-blocks-per-batch", "2"]))
  const result = readJSON(f.root, "runs/block-bound/claims.json")
  assert.equal(result.provenance.extraction_budget.max_blocks_per_batch, 2)
  await main(args(f, "block-bound", ["--max-blocks-per-batch", "2"]))
  assert.equal(r.calls.filter((x) => x.endpoint === "/api/chat").length, 1)
  await assert.rejects(main(args(f, "block-bound", ["--max-blocks-per-batch", "3"])), /changed/)
  await assert.rejects(main(args(f, "invalid-bound", ["--max-blocks-per-batch", "0"])), /budget/)
  await assert.rejects(
    main(["collect", "--run", "unused", "--max-blocks-per-batch", "2"]),
    /only supported/,
  )
  assert.equal(r.calls.filter((x) => x.endpoint === "/api/chat").length, 1)
})
test("policy model selection and explicit model overrides are distinct from CLI defaults", async (t) => {
  const f = fixture(t),
    r = localRuntime(t, factOutput)
  f.policy.roles.fact_extract.model = "fixture:13b"
  fs.writeFileSync(f.file, JSON.stringify(f.policy))
  await main(args(f, "policy-model"))
  assert.equal(r.calls.filter((x) => x.endpoint === "/api/chat").at(-1).body.model, "fixture:13b")
  await main(args(f, "explicit-model", ["--model", model]))
  assert.equal(r.calls.filter((x) => x.endpoint === "/api/chat").at(-1).body.model, model)
})
test("knowledge CLI binds its policy and cannot reuse a stage after settings change", async (t) => {
  const f = fixture(t)
  let claimId
  const r = localRuntime(t, (request) =>
    request.format.properties.claims
      ? factOutput(request)
      : {
          sections: KNOWLEDGE_DRAFT_HEADINGS.map((heading, n) => ({
            heading,
            paragraphs:
              n === 0
                ? [{ text: "제품의 향후 출하 시점을 밝힌 계획이다.", claim_ids: [claimId] }]
                : [],
          })),
        },
  )
  await main(args(f, "knowledge-source"))
  const extracted = readJSON(f.root, "runs/knowledge-source/claims.json")
  claimId = extracted.claims[0].claim_id
  const claims = recordFactReview(
    extracted.claims,
    [
      {
        claim_id: claimId,
        status: "verified",
        reason: "Synthetic fixture source reading",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      },
    ],
    { reviewer: "Fixture reviewer", reviewed_at: "2026-09-27" },
    [f.parse],
  )
  atomicWrite(f.root, "runs/knowledge-source/reviewed-claims.json", { ...extracted, claims })
  const vault = path.join(f.root, "vault"),
    relative = "Knowledge/Plan.md"
  const original = noteText(
    {
      title: "Plan",
      type: "knowledge",
      entry_type: "concept",
      schema_version: "tech-encyclopedia/v2",
      concept_id: "plan",
      map_review: { decision: "exclude", reason: "Synthetic fixture" },
    },
    "## 한 문장 정의\n\n기존 설명.\n",
  )
  atomicWrite(vault, relative, original)
  const input = {
    schema: "knowledge-draft-input/v1",
    path: relative,
    previous_sha256: sha256(original),
    evidence: [{ run_id: "knowledge-source", claim_ids: [claimId] }],
  }
  atomicWrite(f.root, "knowledge-input.json", input)
  f.policy.roles.concept_write = { ...f.policy.roles.article_write }
  fs.writeFileSync(f.file, JSON.stringify(f.policy))
  const command = [
    "knowledge-draft",
    "--root",
    f.root,
    "--run",
    "knowledge",
    "--vault",
    vault,
    "--review",
    path.join(f.root, "knowledge-input.json"),
    "--model-policy",
    f.file,
  ]
  await main(command)
  await main(command)
  assert.equal(r.calls.filter((x) => x.endpoint === "/api/chat").length, 2)
  assert.equal(
    readJSON(f.root, "runs/knowledge/knowledge-draft/draft.json").provenance.model_policy.role,
    "concept_write",
  )
  const scoped = await prepareRoleOllama(r.api, f.policy, "concept_write", {
    root: f.root,
    run: "knowledge",
  })
  const changed = Object.create(scoped)
  changed.executionPolicy = {
    ...scoped.executionPolicy,
    fingerprint: sha256("changed knowledge policy"),
  }
  await assert.rejects(
    writeKnowledgeDraft(f.root, "knowledge", input, { vault, ollama: changed, model }),
    /input changed/i,
  )
  assert.equal(fs.readFileSync(path.join(vault, relative), "utf8"), original)
})

test("localization CLI applies search policy while retaining field and manufacturer coverage", async (t) => {
  const f = fixture(t)
  const native = {
    ko: "국내 기술",
    en: "Technical sources",
    ja: "ロボットのニュース",
    zh: "工业技术投资",
    de: "Neue Energie und Unternehmen",
  }
  const source = {
    schema: "research-search-plan/v1",
    queries: researchSlots().map((slot, n) => ({
      ...slot,
      query: `${slot.language === "ja" ? "robotics translation pending" : native[slot.language]} ${n}`,
    })),
  }
  atomicWrite(f.root, "source-queries.json", source)
  const r = localRuntime(t, (request) => {
    const input = JSON.parse(request.messages[1].content)
    assert.equal(input.target_language, "ja")
    return {
      queries: input.queries.map((q, n) => ({ slot_id: q.slot_id, query: native.ja + " " + n })),
    }
  })
  const result = await main([
    "localize-queries",
    "--root",
    f.root,
    "--run",
    "localized",
    "--query",
    path.join(f.root, "source-queries.json"),
    "--date",
    "2026-09-27",
    "--model-policy",
    f.file,
  ])
  assert.equal(result.queries, 62)
  assert.equal(result.candidate_published, false)
  const sent = r.calls.find((x) => x.endpoint === "/api/chat").body
  assert.equal(sent.think, "medium")
  const output = readJSON(f.root, "runs/localized/queries.json")
  assert.equal(output.queries.filter((x) => x.scope === "manufacturer").length, 30)
  assert.equal(output.queries.filter((x) => x.scope !== "manufacturer").length, 32)
  assert.equal(
    readJSON(f.root, "runs/localized/model-policy/search_plan/budget.json").attempts.length,
    1,
  )
})
