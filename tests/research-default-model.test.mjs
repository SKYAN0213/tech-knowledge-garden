import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256 } from "../scripts/research/contracts.mjs"
import { extractClaims } from "../scripts/research/claims.mjs"
import { writeDraft } from "../scripts/research/editor.mjs"
import { localizeQueries, searchQueries, planSearchQueries } from "../scripts/research/search.mjs"

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
