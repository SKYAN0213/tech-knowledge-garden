import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import {
  freezeShadowCollectionInputs,
  freezeShadowHandoffBasis,
  loadShadowCollectionInputs,
  loadShadowHandoffBasis,
} from "../scripts/research/shadow-collection-basis.mjs"
import { saveShadowCollectionBasis } from "../scripts/research/shadow-operations.mjs"

async function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "shadow-basis-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const dailyRun = "daily-20261006-test"
  const configFile = path.join(root, "routes.json")
  fs.writeFileSync(configFile, JSON.stringify({ routes: [] }))
  const activeRoutes = [{ channel_id: "test" }]
  const plan = {
    run_id: dailyRun,
    config_sha256: sha256(`${configFile}:${sha256(fs.readFileSync(configFile))}`),
  }
  atomicWrite(root, `daily/runs/${dailyRun}/plan.json`, plan)
  const options = { root, plan, configFile, activeRoutes, sourcePaths: [configFile] }
  const inputs = await freezeShadowCollectionInputs(options)
  const backlogFile = path.join(root, "backlog.json")
  fs.writeFileSync(backlogFile, JSON.stringify({ candidates: [] }))
  const receipts = [{ daily_run: dailyRun, status: "window_scanned" }]
  const handoffInputs = {
    plan_sha256: sha256(fs.readFileSync(path.join(root, `daily/runs/${dailyRun}/plan.json`))),
    receipts_sha256: sha256(JSON.stringify(receipts)),
    backlog_sha256: sha256(fs.readFileSync(backlogFile)),
    daily_coverage_sha256: null,
  }
  const handoffPath = `daily/runs/${dailyRun}/handoffs/${sha256(JSON.stringify(handoffInputs))}.json`
  atomicWrite(root, handoffPath, {
    schema: "research-editorial-handoff/v1",
    daily_run: dailyRun,
    inputs: handoffInputs,
  })
  atomicWrite(root, `daily/runs/${dailyRun}/summary.json`, {
    schema: "research-daily-summary/v1",
    run_id: dailyRun,
    receipts: receipts.length,
  })
  return { root, dailyRun, inputs, options, backlogFile, handoffPath, receipts }
}

test("source configuration changes cannot replace acquisition inputs or bind a different plan", async (t) => {
  const f = await fixture(t)
  const before = fs.readFileSync(path.join(f.root, f.inputs.path))
  fs.writeFileSync(f.options.configFile, "changed current configuration")
  assert.deepEqual(await freezeShadowCollectionInputs(f.options), f.inputs)
  assert.deepEqual(fs.readFileSync(path.join(f.root, f.inputs.path)), before)
  assert.equal(
    loadShadowCollectionInputs(f.root, f.dailyRun).value.config_sha256,
    f.options.plan.config_sha256,
  )
  await assert.rejects(
    () =>
      freezeShadowCollectionInputs({ ...f.options, plan: { ...f.options.plan, injected: true } }),
    /Exact stored acquisition plan/,
  )
})

test("unfrozen inputs changed after planning are rejected before a snapshot is completed", async (t) => {
  const f = await fixture(t)
  const run = "daily-20261006-changed"
  const plan = { ...f.options.plan, run_id: run }
  atomicWrite(f.root, `daily/runs/${run}/plan.json`, plan)
  fs.writeFileSync(f.options.configFile, "changed")
  await assert.rejects(
    () => freezeShadowCollectionInputs({ ...f.options, plan }),
    /changed before collection/,
  )
  assert.equal(loadShadowCollectionInputs(f.root, run), null)
})

test("the frozen handoff remains usable after mutable summary and backlog change", async (t) => {
  const f = await fixture(t)
  const ref = await freezeShadowHandoffBasis(f)
  const old = loadShadowHandoffBasis(f.root, ref)
  fs.writeFileSync(f.backlogFile, "new candidate approval state")
  atomicWrite(f.root, `daily/runs/${f.dailyRun}/summary.json`, { receipts: 999 })
  assert.deepEqual(await freezeShadowHandoffBasis(f), ref)
  assert.deepEqual(await saveShadowCollectionBasis(f), ref)
  assert.deepEqual(loadShadowHandoffBasis(f.root, ref), old)
  assert.equal(readJSON(f.root, old.receipts.path).length, 1)
  assert.equal(readJSON(f.root, old.summary.path).receipts, 1)
})

test("changed backlog, receipts or missing original acquisition inputs cannot complete a handoff basis", async (t) => {
  const f = await fixture(t)
  fs.writeFileSync(f.backlogFile, "changed")
  await assert.rejects(() => freezeShadowHandoffBasis(f), /input changed before capture/)
  assert.equal(readJSON(f.root, `daily/runs/${f.dailyRun}/shadow-basis.json`), null)
  await assert.rejects(
    () => freezeShadowHandoffBasis({ ...f, receipts: [] }),
    /Exact collection receipts/,
  )
  fs.renameSync(
    path.join(f.root, `evaluation/shadow-inputs/${f.dailyRun}`),
    path.join(f.root, "inputs-away"),
  )
  await assert.rejects(
    () => freezeShadowHandoffBasis(f),
    /Original acquisition input snapshot is missing/,
  )
})

test("tampered frozen input and handoff aliases are rejected despite a recomputed outer hash", async (t) => {
  const f = await fixture(t)
  const ref = await freezeShadowHandoffBasis(f)
  const basis = loadShadowHandoffBasis(f.root, ref)
  const file = path.join(f.root, ref.path)
  fs.writeFileSync(file, JSON.stringify({ ...basis, config_sha256: "0".repeat(64) }))
  assert.throws(
    () => loadShadowHandoffBasis(f.root, { ...ref, sha256: sha256(fs.readFileSync(file)) }),
    /differs from frozen acquisition/,
  )
  fs.writeFileSync(file, JSON.stringify(basis))
  fs.writeFileSync(path.join(f.root, basis.config.path), "changed frozen source")
  assert.throws(
    () => loadShadowHandoffBasis(f.root, { ...ref, sha256: sha256(fs.readFileSync(file)) }),
    /Frozen collection evidence changed/,
  )
})

test("a plan-only historical basis is never promoted to an automatic post-collection basis", async (t) => {
  const f = await fixture(t)
  atomicWrite(f.root, `evaluation/shadow-bases/${f.dailyRun}/basis.json`, {
    schema: "research-shadow-collection-basis/v1",
  })
  await assert.rejects(
    () => saveShadowCollectionBasis({ root: f.root, dailyRun: f.dailyRun }),
    /Automatic acquisition and handoff snapshot required/,
  )
})

test("an explicit different configuration cannot resolve or regenerate an existing basis", async (t) => {
  const f = await fixture(t)
  await freezeShadowHandoffBasis(f)
  await assert.rejects(
    () => saveShadowCollectionBasis({ ...f, configFile: "different-config.json" }),
    /differs from original acquisition inputs/,
  )
  await assert.rejects(
    () =>
      saveShadowCollectionBasis({
        root: f.root,
        dailyRun: f.dailyRun,
        configFile: "different-config.json",
      }),
    /differs from original acquisition inputs/,
  )
})
