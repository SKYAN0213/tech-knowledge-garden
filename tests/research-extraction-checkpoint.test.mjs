import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { extractClaims } from "../scripts/research/claims.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { loadCompletedExtraction } from "../scripts/research/extraction-checkpoint.mjs"
import { atomicWrite, readJSON, RunState } from "../scripts/research/run-state.mjs"
import { processSourceRun } from "../scripts/research/source-processing.mjs"
import { buildArchiveClosure } from "../scripts/research/archive-closure.mjs"

// Controlled protocol fixtures; production evidence is checked separately with
// stored Ollama request/response records, without substituting this provider.
async function fixture(t, { split = false, empty = false } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cli-extraction-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const run = "cli",
    text = "Example plans to ship units in 2027.",
    source_id = sourceId("https://example.org/announcement"),
    body_sha256 = sha256(text),
    parse_id = sha256("checkpoint-parse")
  const doc = {
    source_id,
    source_version_id: `${source_id}:${body_sha256}`,
    original_url: "https://example.org/announcement",
    final_url: "https://example.org/announcement",
    body_sha256,
    body_path: `documents/${source_id}/${body_sha256}/body.bin`,
    fetch_status: "captured",
    observed_at: "2026-10-07T00:00:00Z",
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id,
    source_version_id: doc.source_version_id,
    parse_id,
    title: "Shipment plan",
    status: "extracted",
    dates: { published_at: "2026-10-06", observed_at: doc.observed_at },
    blocks: Array.from({ length: split ? 2 : 1 }, (_, i) => ({
      block_id: `${parse_id}:b${i}`,
      text,
      locator: { text_hash: body_sha256 },
    })),
    quality: { missing_pages: [] },
  }
  atomicWrite(root, doc.body_path, text)
  atomicWrite(root, `parses/${parse_id}/parse.json`, parse)
  atomicWrite(root, `runs/${run}/documents.json`, [doc])
  atomicWrite(root, `runs/${run}/parses.json`, [parse])
  const provider = {
    async structured(input) {
      const doc = JSON.parse(input.messages[1].content)[0],
        block = doc.blocks[0]
      const output = {
        claims: empty
          ? []
          : [
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
      const request = {
        model: input.model,
        think: input.think,
        messages: input.messages,
        format: input.schema,
        stream: false,
        options: { num_ctx: input.num_ctx, num_predict: input.num_predict, temperature: 0 },
        keep_alive: "5m",
      }
      const response_content = JSON.stringify(output)
      return {
        output,
        artifacts: {
          request,
          request_sha256: sha256(JSON.stringify(request)),
          response_content,
          response_content_sha256: sha256(response_content),
          done: true,
          done_reason: "stop",
        },
        provenance: {
          model: input.model,
          digest: "e".repeat(64),
          runtime: "controlled-fixture",
          think: input.think,
          num_ctx: input.num_ctx,
          num_predict: input.num_predict,
          temperature: 0,
          prompt_sha256: sha256(JSON.stringify(input.messages)),
          schema_sha256: sha256(JSON.stringify(input.schema)),
        },
      }
    },
  }
  const state = new RunState(root, run, { command: "extract" })
  await state.stage("claims", { parses: [parse_id] }, () =>
    extractClaims(provider, [parse], {
      candidate_key: `source-${source_id}`,
      model: "fixture:27b",
      think: false,
      ...(split ? { max_blocks_per_batch: 1 } : {}),
      checkpoint: (id, request, action) => state.stage("claims-batch-" + id, { request }, action),
    }),
  )
  return { root, run, documents: [doc], parses: [parse], state: state.state }
}

for (const options of [{}, { split: true }, { empty: true }])
  test(`completed CLI extraction is reusable with ${JSON.stringify(options)} and no provider call`, async (t) => {
    const f = await fixture(t, options)
    const expected = fs.readFileSync(path.join(f.root, "runs/cli/claims.json"))
    assert.deepEqual(loadCompletedExtraction(f.root, f.run, f.documents, f.parses), expected)
    assert.deepEqual(fs.readFileSync(path.join(f.root, "runs/cli/claims.json")), expected)
  })

test("a completed historical prompt is reused without requiring today's prompt or schema descriptions", async (t) => {
  const f = await fixture(t),
    base = "runs/cli/",
    state = readJSON(f.root, base + "state.json")
  const claims = readJSON(f.root, base + "claims.json")
  const oldBatch = claims.provenance.extraction_plan.batches[0]
  const oldName = "claims-batch-" + oldBatch.batch_id
  const result = readJSON(f.root, base + oldName + ".json")
  const request = result.artifacts.request
  request.messages[0].content = "Historical extraction prompt: return only source-backed facts."
  request.format.properties.claims.description = "Historical schema description."
  result.artifacts.request_sha256 = sha256(JSON.stringify(request))
  result.provenance.prompt_sha256 = sha256(JSON.stringify(request.messages))
  result.provenance.schema_sha256 = sha256(JSON.stringify(request.format))
  const internal = {
    schema: request.format,
    messages: request.messages,
    num_ctx: request.options.num_ctx,
    num_predict: request.options.num_predict,
  }
  const batch = {
    ...oldBatch,
    batch_id: "001-" + sha256(JSON.stringify(internal)).slice(0, 16),
    input_chars:
      request.messages.reduce((n, message) => n + message.content.length, 0) +
      JSON.stringify(request.format).length,
  }
  const name = "claims-batch-" + batch.batch_id,
    oldProvenance = claims.provenance
  claims.model_artifacts = result.artifacts
  claims.provenance = {
    ...result.provenance,
    block_map_sha256: oldProvenance.block_map_sha256,
    extraction_budget: oldProvenance.extraction_budget,
    extraction_plan: { ...oldProvenance.extraction_plan, batches: [batch] },
  }
  state.stages[name] = {
    ...state.stages[oldName],
    result_path: base + name + ".json",
    result_hash: sha256(JSON.stringify(result)),
  }
  delete state.stages[oldName]
  state.stages.claims.result_hash = sha256(JSON.stringify(claims))
  atomicWrite(f.root, base + name + ".json", result)
  atomicWrite(f.root, base + "claims.json", claims)
  atomicWrite(f.root, base + "state.json", state)
  const expected = fs.readFileSync(path.join(f.root, base + "claims.json"))
  assert.deepEqual(loadCompletedExtraction(f.root, f.run, f.documents, f.parses), expected)
})

test("CLI reuse refuses partial batches, altered results and inherited verification", async (t) => {
  for (const mutation of ["running", "missing", "altered", "reviewed", "response", "context"])
    await t.test(mutation, async (t) => {
      const f = await fixture(t, { split: true }),
        base = "runs/cli/"
      const state = readJSON(f.root, base + "state.json")
      const batch = Object.keys(state.stages).find((key) => key.startsWith("claims-batch-"))
      const resultPath = state.stages[batch].result_path
      if (mutation === "running") state.stages[batch].status = "running"
      if (mutation === "missing") fs.unlinkSync(path.join(f.root, resultPath))
      if (mutation === "altered") {
        const result = readJSON(f.root, resultPath)
        result.output.claims[0].subject = "Someone else"
        atomicWrite(f.root, resultPath, result)
      }
      if (mutation === "reviewed") {
        const claims = readJSON(f.root, base + "claims.json")
        claims.claims[0].review.status = "verified"
        atomicWrite(f.root, base + "claims.json", claims)
        state.stages.claims.result_hash = sha256(JSON.stringify(claims))
      }
      if (mutation === "response" || mutation === "context") {
        const result = readJSON(f.root, resultPath)
        if (mutation === "response") result.artifacts.response_content = '{"claims":[]}'
        else {
          const context = JSON.parse(result.artifacts.request.messages[1].content)
          context[0].blocks[0].text = "A different source announcement"
          result.artifacts.request.messages[1].content = JSON.stringify(context)
          result.artifacts.request_sha256 = sha256(JSON.stringify(result.artifacts.request))
          result.provenance.prompt_sha256 = sha256(
            JSON.stringify(result.artifacts.request.messages),
          )
        }
        atomicWrite(f.root, resultPath, result)
        state.stages[batch].result_hash = sha256(JSON.stringify(result))
      }
      atomicWrite(f.root, base + "state.json", state)
      assert.throws(() => loadCompletedExtraction(f.root, f.run, f.documents, f.parses))
    })
})

test("CLI reuse rejects missing source budgets instead of reconstructing defaults", async (t) => {
  const f = await fixture(t),
    base = "runs/cli/"
  const claims = readJSON(f.root, base + "claims.json"),
    state = readJSON(f.root, base + "state.json")
  delete claims.provenance.extraction_budget
  state.stages.claims.result_hash = sha256(JSON.stringify(claims))
  atomicWrite(f.root, base + "claims.json", claims)
  atomicWrite(f.root, base + "state.json", state)
  assert.throws(() => loadCompletedExtraction(f.root, f.run, f.documents, f.parses), /budget/)
})

test("source processing reuses completed CLI facts, resumes assessment and closes archive dependencies", async (t) => {
  const f = await fixture(t),
    before = fs.readFileSync(path.join(f.root, "runs/cli/claims.json"))
  atomicWrite(f.root, "runs/source/documents.json", f.documents)
  atomicWrite(f.root, "runs/source/parses.json", f.parses)
  const settings = { model: "fixture:27b", think: false, num_ctx: 16384, num_predict: 4096 }
  const policy = {
    schema: "model-execution-policy/v1",
    roles: {
      fact_extract: { ...settings, model: "different:8b", num_predict: 2048, facts_per_batch: 12 },
      evidence_compare: settings,
      article_write: settings,
    },
  }
  const policyFile = path.join(f.root, "policy.json")
  fs.writeFileSync(policyFile, JSON.stringify(policy))
  const calls = [],
    provider = {
      async metadata(model) {
        return {
          model,
          digest: "e".repeat(64),
          runtime: "fixture",
          capabilities: ["completion"],
          thinking: { values: [false] },
        }
      },
      async structured(request) {
        calls.push(this.executionPolicy.role)
        assert.equal(this.executionPolicy.role, "evidence_compare")
        const input = JSON.parse(request.messages[1].content)
        return {
          output: {
            assessments: input.claims.map((claim) => ({
              claim_id: claim.claim_id,
              verdict: "supported",
              checks: Object.fromEntries(
                ["meaning", "identity", "numbers", "time", "attribution"].map((key) => [
                  key,
                  "supported",
                ]),
              ),
              explanation: "The source explicitly describes a future shipment plan.",
              evidence: [
                { evidence_ref: input.sources[0].blocks[0].evidence_refs[0].evidence_ref },
              ],
            })),
          },
          provenance: { model: request.model, digest: "e".repeat(64), runtime: "fixture" },
        }
      },
    }
  const options = {
    root: f.root,
    run: "processed",
    sourceRun: "source",
    extractionRun: "cli",
    policyFile,
    provider,
  }
  assert.equal((await processSourceRun(options)).status, "fact_review")
  assert.equal((await processSourceRun(options)).status, "fact_review")
  assert.deepEqual(calls, ["evidence_compare"])
  assert.equal(readJSON(f.root, "runs/processed/reviewed-claims.json"), null)
  assert.equal(readJSON(f.root, "runs/processed/draft.json"), null)
  assert.equal(readJSON(f.root, "runs/processed/claims.json").claims[0].review.status, "unreviewed")
  assert.deepEqual(fs.readFileSync(path.join(f.root, "runs/cli/claims.json")), before)
  const closure = buildArchiveClosure(f.root, "archive", "processed")
  assert.ok(closure.bound_runs.includes("cli"))
  assert.ok(closure.files.some((file) => file.path.includes("/claims-batch-")))
})
