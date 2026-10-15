import test from "node:test"
import assert from "node:assert/strict"
import { OpenAIResponses } from "../scripts/research/openai.mjs"
import { schemaForDraft } from "../scripts/research/editor.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"

// These are injected transport fixtures, not real API requests or approvals.
const model = "openai-schema-fixture-v1"
const claimIds = ["fixture-source-claim-1", "fixture-source-claim-2"]
const messages = [{ role: "user", content: "Injected schema contract fixture only." }]

function freeze(value) {
  if (!value || typeof value !== "object") return value
  Object.values(value).forEach(freeze)
  return Object.freeze(value)
}

function transport(output) {
  const calls = []
  const api = new OpenAIResponses({
    apiKey: "fixture-only-no-real-credentials",
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      assert.equal(new URL(url).hostname, "api.openai.com")
      if (new URL(url).pathname === `/v1/models/${model}`)
        return Response.json({ id: model, created: 1, owned_by: "injected-test-fixture" })
      assert.equal(new URL(url).pathname, "/v1/responses")
      return Response.json({
        id: "fixture-response-no-api",
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: JSON.stringify(output) }],
          },
        ],
      })
    },
  })
  return { api, calls }
}

function input(schema) {
  return { model, think: false, messages, schema, num_predict: 512, temperature: 0 }
}

function writerFixture() {
  const schema = schemaForDraft(
    { input: { basis: [{ role: "conditions" }, { role: "results" }] } },
    claimIds,
  )
  const output = {
    title: "작성 전송 계약 fixture",
    lead: [
      { text: "첫 fixture 문장이다.", claim_ids: [claimIds[0]] },
      { text: "둘째 fixture 문장이다.", claim_ids: [claimIds[1]] },
    ],
    facts: { who: "fixture", when: null, where: null, what: "fixture", how: null, why: null },
    sector: "소프트웨어·클라우드",
    theme: "제품·서비스",
    tags: ["신제품"],
    entities: ["fixture"],
    explanations: [
      {
        role: "conditions",
        heading: "fixture 조건",
        paragraphs: [{ text: "추가 fixture 조건이다.", claim_ids: [claimIds[1]] }],
      },
    ],
    analysis: { text: "fixture 비교다.", claim_ids: [...claimIds] },
  }
  return { schema, output }
}

test("actual writer wire schema omits only uniqueItems and binds separate internal/wire hashes", async () => {
  const { schema, output } = writerFixture()
  const original = JSON.stringify(schema)
  const expectedWire = structuredClone(schema)
  for (const sentence of [
    expectedWire.properties.lead.items,
    expectedWire.properties.explanations.items.properties.paragraphs.items,
    expectedWire.properties.analysis,
  ])
    delete sentence.properties.claim_ids.uniqueItems
  freeze(schema)
  const fixture = transport(output)
  const result = await fixture.api.structured(input(schema))
  const post = fixture.calls.find((call) => new URL(call.url).pathname === "/v1/responses")
  const sent = JSON.parse(post.options.body)
  assert.deepEqual(sent.text.format.schema, expectedWire)
  assert.equal(sent.text.format.strict, true)
  assert.equal(sent.store, false)
  assert.deepEqual(sent.text.format.schema.properties.lead.items.properties.claim_ids, {
    type: "array",
    minItems: 1,
    items: { type: "string", minLength: 1, enum: claimIds },
    maxItems: 2,
  })
  assert.equal(sent.text.format.schema.properties.analysis.properties.claim_ids.minItems, 2)
  assert.equal(JSON.stringify(schema), original)
  assert.deepEqual(result.output, output)
  assert.deepEqual(result.artifacts.internal_schema, schema)
  assert.equal(result.artifacts.request_sha256, sha256(post.options.body))
  assert.deepEqual(result.artifacts.request, sent)
  const internalHash = sha256(original)
  const wireHash = sha256(JSON.stringify(sent.text.format.schema))
  assert.notEqual(internalHash, wireHash)
  assert.equal(result.artifacts.internal_schema_sha256, internalHash)
  assert.equal(result.artifacts.wire_schema_sha256, wireHash)
  assert.equal(result.provenance.schema_sha256, internalHash)
  assert.equal(result.provenance.internal_schema_sha256, internalHash)
  assert.equal(result.provenance.wire_schema_sha256, wireHash)
  assert.equal(result.provenance.prompt_sha256, sha256(JSON.stringify(messages)))
  assert.equal(JSON.stringify(result).includes("fixture-only-no-real-credentials"), false)
  assert.equal(fixture.calls.length, 2)
})

test("internal writer validation still rejects duplicated and unknown served claim references", async () => {
  for (const [references, error] of [
    [[claimIds[0], claimIds[0]], /Duplicate items/],
    [["fixture-source-claim-typo"], /Invalid enum/],
  ]) {
    const { schema, output } = writerFixture()
    output.lead[0].claim_ids = references
    const original = JSON.stringify(output)
    freeze(schema)
    const fixture = transport(output)
    await assert.rejects(fixture.api.structured(input(schema)), error)
    const sent = JSON.parse(fixture.calls[1].options.body).text.format.schema
    assert.equal(
      Object.hasOwn(sent.properties.lead.items.properties.claim_ids, "uniqueItems"),
      false,
    )
    assert.deepEqual(sent.properties.lead.items.properties.claim_ids.items.enum, claimIds)
    assert.equal(schema.properties.lead.items.properties.claim_ids.uniqueItems, true)
    assert.equal(JSON.stringify(output), original)
  }
})

test("schema maps retain uniqueItems property and definition names plus enum data", async () => {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["uniqueItems", "references"],
    $defs: {
      uniqueItems: {
        type: "array",
        uniqueItems: true,
        minItems: 1,
        maxItems: 2,
        items: { type: "string", enum: ["uniqueItems", "reference"] },
      },
    },
    properties: {
      uniqueItems: { type: "string", enum: ["uniqueItems"] },
      references: { $ref: "#/$defs/uniqueItems" },
    },
  }
  const before = JSON.stringify(schema)
  freeze(schema)
  const fixture = transport({ uniqueItems: "uniqueItems", references: ["reference"] })
  const result = await fixture.api.structured(input(schema))
  const wire = result.artifacts.request.text.format.schema
  assert.deepEqual(wire.properties.uniqueItems, schema.properties.uniqueItems)
  assert.equal(wire.properties.references.$ref, "#/$defs/uniqueItems")
  assert.equal(Object.hasOwn(wire.$defs, "uniqueItems"), true)
  assert.equal(Object.hasOwn(wire.$defs.uniqueItems, "uniqueItems"), false)
  assert.deepEqual(wire.$defs.uniqueItems.items.enum, ["uniqueItems", "reference"])
  assert.equal(wire.$defs.uniqueItems.minItems, 1)
  assert.equal(wire.$defs.uniqueItems.maxItems, 2)
  assert.equal(schema.$defs.uniqueItems.uniqueItems, true)
  assert.equal(JSON.stringify(schema), before)
})

test("generic requests keep their original wire and result shape without projection artifacts", async () => {
  const schema = freeze({
    type: "object",
    additionalProperties: false,
    required: ["uniqueItems"],
    properties: { uniqueItems: { type: "string", enum: ["uniqueItems"] } },
  })
  const fixture = transport({ uniqueItems: "uniqueItems" })
  const result = await fixture.api.structured(input(schema))
  assert.deepEqual(result.artifacts.request.text.format.schema, schema)
  assert.deepEqual(Object.keys(result.artifacts), [
    "request",
    "request_sha256",
    "response_content",
    "response_content_sha256",
    "response_id",
    "response_status",
  ])
  for (const key of ["internal_schema_sha256", "wire_schema_sha256"])
    assert.equal(Object.hasOwn(result.provenance, key), false)
  assert.equal(result.provenance.schema_sha256, sha256(JSON.stringify(schema)))
  assert.equal(result.artifacts.request_sha256, sha256(fixture.calls[1].options.body))
})
