import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256 } from "../scripts/research/contracts.mjs"
import { extractClaims } from "../scripts/research/claims.mjs"
import { writeDraft } from "../scripts/research/editor.mjs"
import { localizeQueries, searchQueries, planSearchQueries } from "../scripts/research/search.mjs"

test("writer receives exact source days, explicit KST instants and no observation-date fallback", async () => {
  const cases = [
    [
      "2026-07-07T21:06:12Z",
      { source_day: "2026-07-07", precision: "timestamp", seoul_day: "2026-07-08" },
    ],
    [
      "2026-07-08T06:06:12+09:00",
      { source_day: "2026-07-08", precision: "timestamp", seoul_day: "2026-07-08" },
    ],
    [
      "2026-07-08T23:30:00-07:00",
      { source_day: "2026-07-08", precision: "timestamp", seoul_day: "2026-07-09" },
    ],
    ["2026-07-07", { source_day: "2026-07-07", precision: "day", seoul_day: null }],
    [null, null],
    [undefined, null],
    ["2026-07-07T21:06:12", null],
    ["2026-02-30", null],
  ]
  const stopped = Error("Inspect request without inference")
  let request
  const claims = cases.map(([published_at], index) => ({
    claim_id: "c" + index,
    subject: "기업",
    statement: "기업은 2026-08-01부터 제품을 제공할 계획이라고 발표했다.",
    published_at,
    observed_at: "2026-10-06T00:00:00Z",
    effective_period: "2026-08-01",
    review: { status: "verified" },
  }))
  await assert.rejects(
    writeDraft(
      {
        structured: async (input) => {
          request = input
          throw stopped
        },
      },
      [...claims, { ...claims[0], claim_id: "deferred", review: { status: "deferred" } }],
    ),
    (error) => error === stopped,
  )
  const input = JSON.parse(request.messages[1].content)
  assert.equal(input.claims.length, cases.length)
  input.claims.forEach((claim, index) => {
    assert.deepEqual(claim.publication_date, cases[index][1])
    assert.equal(claim.published_at, cases[index][0])
    assert.equal(claim.effective_period, "2026-08-01")
    assert.equal("observed_at" in claim, false)
  })
  assert.match(request.messages[0].content, /facts\.when에만/)
  assert.match(request.messages[0].content, /수집일·검토일로 발표일을 채우지 않는다/)
})

test("direct inference and planning use the installed MLX default and preserve explicit model overrides", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "default-model-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const text = "An official source describes a new product."
  const parse = {
    schema_version: "source-parse/v1",
    source_id: "source",
    source_version_id: "source:v1",
    parse_id: "parse",
    status: "extracted",
    title: "Product announcement",
    dates: { published_at: "2026-10-01", observed_at: "2026-10-04T00:00:00Z" },
    blocks: [{ block_id: "parse:b1", text, locator: { text_hash: sha256(text) } }],
    quality: { missing_pages: [] },
  }
  const calls = [
    (provider, options) => extractClaims(provider, [parse], options),
    (provider, options) =>
      writeDraft(provider, [{ claim_id: "c1", review: { status: "verified" } }], options),
    (provider, options) =>
      localizeQueries(provider, [{ slot_id: "one", language: "ko", query: "robot news" }], options),
    (provider, options) => searchQueries(provider, { date: "2026-10-04", ...options }),
    (provider, options) =>
      planSearchQueries(root, "plan", provider, { date: "2026-10-04", ...options }),
  ]
  for (const options of [{}, { model: "explicit-local-model" }]) {
    const expected = options.model ?? "qwen3.8:27b-mlx"
    for (const call of calls) {
      const stopped = Error("Stop before inference or metadata access")
      const requested = []
      const provider = {
        structured: async (request) => {
          requested.push(request.model)
          throw stopped
        },
        metadata: async (model) => {
          requested.push(model)
          throw stopped
        },
      }
      await assert.rejects(call(provider, options), (error) => error === stopped)
      assert.deepEqual(requested, [expected])
    }
  }
  const policy = JSON.parse(
    fs.readFileSync(new URL("../data/research-model-policy.json", import.meta.url)),
  )
  assert.ok(Object.values(policy.roles).every((role) => role.model === "qwen3.8:27b-mlx"))
})
