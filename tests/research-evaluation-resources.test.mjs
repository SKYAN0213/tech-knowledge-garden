import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  modelProcessResourceTree,
  loadedModelResourceSnapshot,
  observeLocalModelResources,
  inspectEvaluationWriterQuality,
} from "../scripts/research/evaluation-cost.mjs"

test("resource process tree isolates listener descendants without adding unrelated workers", () => {
  const result = modelProcessResourceTree(
    "10 1 100 ollama\n11 10 200 runner\n12 11 300 mlx\n13 1 900 other-model",
    [10],
  )
  assert.deepEqual(
    result.processes.map((row) => row.pid),
    [10, 11, 12],
  )
  assert.equal(result.server_rss_bytes, 100 * 1024)
  assert.equal(result.descendant_rss_bytes, 500 * 1024)
  assert.match(result.memory_scope, /shared pages/)
  assert.throws(
    () => modelProcessResourceTree("10 1 100 ollama\n10 1 100 ollama", [10]),
    /Duplicate/,
  )
  assert.throws(() => modelProcessResourceTree("10 1 100 ollama", [99]), /disappeared/)
})

test("idle and missing API memory fields remain unknown instead of zero", () => {
  const idle = loadedModelResourceSnapshot({ models: [] }, "qwen", "digest")
  assert.equal(idle.target_loaded, false)
  assert.equal(idle.size_bytes, null)
  assert.equal(idle.size_vram_bytes, null)
  const loaded = loadedModelResourceSnapshot(
    { models: [{ model: "qwen", digest: "digest" }] },
    "qwen",
    "digest",
  )
  assert.equal(loaded.target_loaded, true)
  assert.equal(loaded.size_vram_bytes, null)
})

test("native API values preserve actual size separately and reject wrong model identity", () => {
  const response = {
    models: [{ name: "qwen", digest: "digest", size: 123, size_vram: 98, context_length: 16384 }],
  }
  const result = loadedModelResourceSnapshot(response, "qwen", "digest")
  assert.equal(result.size_bytes, 123)
  assert.equal(result.size_vram_bytes, 98)
  assert.match(result.memory_scope, /not physical GPU peak/)
  assert.throws(() => loadedModelResourceSnapshot(response, "qwen", "changed"), /digest changed/)
  assert.throws(
    () => loadedModelResourceSnapshot({ models: [{ name: "qwen", size: -1 }] }, "qwen"),
    /Invalid native/,
  )
})

test("resource observation is bounded and preserves a failed single operation", async () => {
  const provider = {
    url: "http://127.0.0.1:11434",
    json: async () => {
      throw Error("unavailable test API")
    },
  }
  const failure = new Error("native operation failed")
  let calls = 0
  await assert.rejects(
    observeLocalModelResources(provider, { model: "qwen", max_samples: 1 }, async () => {
      calls++
      throw failure
    }),
    (error) => {
      assert.equal(error, failure)
      assert.equal(error.resource_observation.operation_status, "failed")
      assert.equal(error.resource_observation.samples.length, 1)
      assert.equal(error.resource_observation.sample_limit_reached, true)
      assert.equal(error.resource_observation.observed.api_unavailable_samples, 1)
      assert.equal(error.resource_observation.observed.api_size_vram_bytes_max, null)
      return true
    },
  )
  assert.equal(calls, 1)
})

test("remote resource providers are refused before the operation runs", async () => {
  let calls = 0
  await assert.rejects(
    observeLocalModelResources(
      { url: "https://example.test", json: async () => ({ models: [] }) },
      { model: "qwen" },
      async () => {
        calls++
      },
    ),
    /local endpoint/,
  )
  assert.equal(calls, 0)
})

test("candidate quality refuses heldout before opening source, gold or model files", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "resource-heldout-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.writeFileSync(
    path.join(root, "selection.json"),
    JSON.stringify({
      schema: "evaluation-source-review-selection/v1",
      cases: [{ case_id: "blind", split: "heldout", source_run: "do-not-open" }],
    }),
  )
  assert.throws(
    () => inspectEvaluationWriterQuality(root, "writer", "selection.json", "blind"),
    /development cases/,
  )
  assert.throws(
    () =>
      inspectEvaluationWriterQuality(root, "writer", path.join(root, "selection.json"), "blind"),
    /root-relative/,
  )
})
