import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { writeDraftCheckpoint } from "../scripts/research/draft-checkpoint.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "model-draft-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const claims = [
    {
      claim_id: "c1",
      subject: "기업",
      statement: "기업은 제품 출시 계획을 발표했다.",
      evidence: [],
      review: { status: "verified" },
    },
  ]
  const output = {
    title: "기업의 제품 출시 계획",
    sector: "로봇·제조",
    theme: "제품·서비스",
    tags: ["신제품"],
    entities: ["기업"],
    facts: { who: "기업", when: null, where: null, what: "제품 출시 계획", how: null, why: null },
    lead: [
      { text: "기업은 제품 출시 계획을 발표했다.", claim_ids: ["c1"] },
      { text: "출시는 계획으로 제시했다.", claim_ids: ["c1"] },
    ],
    explanations: [],
  }
  let calls = 0
  const provider = {
    executionPolicy: { model: "fixture", think: false },
    structured: async () => {
      calls++
      return { output: structuredClone(output) }
    },
  }
  const metadata = { model: "fixture", digest: "pinned" }
  const options = {
    model: "fixture",
    think: false,
    documents: [{ source_version_id: "source:v1" }],
    parses: [],
    deepContext: null,
  }
  return {
    root,
    claims,
    provider,
    metadata,
    options,
    calls: () => calls,
    run: (opts = options, facts = claims, meta = metadata) =>
      writeDraftCheckpoint(root, "case", provider, facts, opts, meta),
  }
}

test("identical reviewed input reuses one generation; changed sources, review, model or policy cannot overwrite it", async (t) => {
  const f = fixture(t),
    first = await f.run()
  assert.equal(first.reused, false)
  atomicWrite(f.root, "runs/case/draft.json", first.record)
  const bytes = fs.readFileSync(path.join(f.root, "runs/case/model-draft-checkpoint.json"))
  const second = await f.run()
  assert.equal(second.reused, true)
  assert.deepEqual(second.record, first.record)
  assert.equal(f.calls(), 1)
  await assert.rejects(f.run(f.options, [{ ...f.claims[0], statement: "変更" }]), /input changed/)
  await assert.rejects(
    f.run({ ...f.options, documents: [{ source_version_id: "source:v2" }] }),
    /input changed/,
  )
  await assert.rejects(f.run({ ...f.options, parses: [{ parse_id: "new" }] }), /input changed/)
  await assert.rejects(f.run({ ...f.options, provisional: true }), /input changed/)
  await assert.rejects(f.run({ ...f.options, deepContext: { input: {} } }), /input changed/)
  await assert.rejects(
    f.run(f.options, f.claims, { ...f.metadata, digest: "new" }),
    /input changed/,
  )
  f.provider.executionPolicy.think = true
  await assert.rejects(f.run(), /input changed/)
  assert.equal(f.calls(), 1)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/case/model-draft-checkpoint.json")),
    bytes,
  )
  assert.equal(first.record.public_approved, false)
})

test("legacy drafts and changed checkpoint bytes are rejected before another generation", async (t) => {
  const f = fixture(t)
  atomicWrite(f.root, "runs/case/draft.json", { legacy: true })
  await assert.rejects(f.run(), /no generation checkpoint/)
  assert.equal(f.calls(), 0)
  fs.unlinkSync(path.join(f.root, "runs/case/draft.json"))
  const first = await f.run()
  atomicWrite(f.root, "runs/case/draft.json", { ...first.record, status: "changed" })
  await assert.rejects(f.run(), /Working draft differs/)
  fs.unlinkSync(path.join(f.root, "runs/case/draft.json"))
  const receipt = JSON.parse(
    fs.readFileSync(path.join(f.root, "runs/case/model-draft-checkpoint.json")),
  )
  fs.appendFileSync(path.join(f.root, receipt.output_path), " ")
  await assert.rejects(f.run(), /bytes changed/)
  assert.equal(f.calls(), 1)
})

test("failed generation can retry the same frozen input, while orphaned output is preserved", async (t) => {
  const f = fixture(t),
    normal = f.provider.structured
  f.provider.structured = async () => {
    throw Error("provider unavailable")
  }
  await assert.rejects(f.run(), /provider unavailable/)
  assert.ok(fs.existsSync(path.join(f.root, "runs/case/model-draft-input.json")))
  assert.equal(fs.existsSync(path.join(f.root, "runs/case/model-draft-checkpoint.json")), false)
  f.provider.structured = normal
  await f.run()
  assert.equal(f.calls(), 1)
  fs.unlinkSync(path.join(f.root, "runs/case/model-draft-checkpoint.json"))
  await assert.rejects(f.run(), /Unfinished model draft/)
  assert.equal(f.calls(), 1)
})
