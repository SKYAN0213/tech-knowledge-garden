import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON, safePath } from "../scripts/research/run-state.mjs"
import {
  withVerifiedInputSession,
  verifiedJSON,
  memoizeVerifiedInput,
  assertVerifiedInputBoundary,
  measureVerifiedInputStage,
} from "../scripts/research/verified-inputs.mjs"
import { editionFixture } from "./fixtures/research-event-fixtures.mjs"
import { checkedPlan } from "../scripts/research/event-pipeline.mjs"

function setup(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "verified-input-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, "input.json")
  fs.writeFileSync(file, '{"value":1}')
  return { root, file, ctx: { root, repo: root } }
}

test("one invocation reuses validated bytes, while a later invocation reads afresh", async (t) => {
  const f = setup(t),
    expected = sha256(fs.readFileSync(f.file))
  const one = await withVerifiedInputSession(f.ctx, () => {
    const a = verifiedJSON(f.file, expected),
      b = verifiedJSON(f.file, expected)
    assert.equal(a, b)
    assert.throws(() => {
      a.value = 2
    }, TypeError)
    return { value: b.value }
  })
  assert.equal(one.validation_statistics.json_reads, 1)
  assert.equal(one.validation_statistics.json_cache_hits, 1)
  const two = await withVerifiedInputSession(f.ctx, () => ({
    value: verifiedJSON(f.file, expected).value,
  }))
  assert.equal(two.validation_statistics.json_reads, 1)
  assert.equal(two.validation_statistics.json_cache_hits, 0)
})

test("stage observations are local control time and do not pretend absent model time is zero", async (t) => {
  const f = setup(t)
  const result = await withVerifiedInputSession(f.ctx, () => {
    assert.equal(
      measureVerifiedInputStage("semantic_candidate_lookup", () => 7),
      7,
    )
    assert.equal(
      measureVerifiedInputStage("semantic_candidate_lookup", () => 8),
      8,
    )
    return {}
  })
  assert.equal(result.validation_statistics.stages.semantic_candidate_lookup.calls, 2)
  assert.ok(result.validation_statistics.stages.semantic_candidate_lookup.elapsed_ms >= 0)
  assert.equal(result.validation_statistics.stages.model_execution, undefined)
  const next = await withVerifiedInputSession(f.ctx, () => ({}))
  assert.deepEqual(next.validation_statistics.stages, {})
})

test("same-size external tampering with restored mtime is rejected at commit", async (t) => {
  const f = setup(t),
    expected = sha256(fs.readFileSync(f.file)),
    stat = fs.statSync(f.file)
  await assert.rejects(
    withVerifiedInputSession(f.ctx, () => {
      verifiedJSON(f.file, expected)
      fs.writeFileSync(f.file, '{"value":2}')
      fs.utimesSync(f.file, stat.atime, stat.mtime)
      assertVerifiedInputBoundary()
    }),
    /changed before commit/,
  )
})

test("mutable progress and writer state are not JSON cache candidates", async (t) => {
  const f = setup(t)
  const result = await withVerifiedInputSession(f.ctx, () => {
    atomicWrite(f.root, "state.json", { stage: 1 })
    assert.equal(readJSON(f.root, "state.json").stage, 1)
    atomicWrite(f.root, "state.json", { stage: 2 })
    assert.equal(readJSON(f.root, "state.json").stage, 2)
    return {}
  })
  assert.equal(result.validation_statistics.json_reads, 0)
})

test("owned mutable writes invalidate dependent memo entries; pinned inputs cannot be rewritten", async (t) => {
  const f = setup(t)
  await withVerifiedInputSession(f.ctx, () => {
    const load = () => memoizeVerifiedInput(f.ctx, "mutable", () => readJSON(f.root, "input.json"))
    assert.equal(load().value, 1)
    atomicWrite(f.root, "input.json", { value: 3 })
    assert.equal(load().value, 3)
    const p = safePath(f.root, "input.json")
    verifiedJSON(p, sha256(fs.readFileSync(p)))
    assert.throws(() => atomicWrite(f.root, "input.json", { value: 4 }), /immutable input/)
  })
})

test("real reviewed plans are validated once per reference and group", async (t) => {
  const f = editionFixture(t)
  const p = await import("../scripts/research/event-pipeline.mjs")
  atomicWrite(f.root, "review.json", f.review)
  const planned = await p.reviewEditionEvents(f.ctx, {
    ...f.parameters,
    review_file: path.relative(f.ctx.repo, path.join(f.root, "review.json")),
  })
  const ref = { path: planned.path, sha256: planned.sha256 }
  const result = await withVerifiedInputSession(f.ctx, () => {
    const a = checkedPlan(f.ctx, ref),
      b = checkedPlan(f.ctx, ref)
    assert.equal(a, b)
    assert.equal(a.events.length, f.review.events.length)
    return {}
  })
  // The plan and its nested edition are each validated once.
  assert.equal(result.validation_statistics.validations, 2)
  assert.equal(result.validation_statistics.validation_cache_hits, 1)
})

test("concurrent sessions never share request roots or validated objects", async (t) => {
  const a = setup(t),
    b = setup(t)
  const results = await Promise.all(
    [a, b].map((f) =>
      withVerifiedInputSession(f.ctx, async () => {
        const first = verifiedJSON(f.file, sha256(fs.readFileSync(f.file)))
        await Promise.resolve()
        return { first, second: verifiedJSON(f.file, sha256(fs.readFileSync(f.file))) }
      }),
    ),
  )
  assert.notEqual(results[0].first, results[1].first)
  assert.equal(results[0].first, results[0].second)
  assert.equal(results[1].validation_statistics.json_reads, 1)
})
