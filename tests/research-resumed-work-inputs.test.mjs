import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { moduleCatalog, executeModule } from "../scripts/research/module-registry.mjs"
import { validateArguments } from "../scripts/research/modules/contracts.mjs"
import { PLAN_FILE } from "../scripts/research/plan-progress.mjs"

const operation = (moduleId, name) =>
  moduleCatalog([moduleId]).modules[0].operations.find((row) => row.id === name)

test("source scans accept explicit zero maintenance without admitting out-of-range retries", () => {
  const scan = operation("collection", "scan")
  const parameters = {
    run_id: "scan-with-no-maintenance",
    channel: "source",
    since: "2026-10-09",
    until: "2026-10-11",
    policy_recheck_limit: 0,
  }
  assert.equal(validateArguments(parameters, scan.inputSchema, {}), parameters)
  assert.equal(
    validateArguments({ ...parameters, policy_recheck_limit: 3 }, scan.inputSchema, {})
      .policy_recheck_limit,
    3,
  )
  for (const value of [-1, 4, 0.5, "0"])
    assert.throws(() =>
      validateArguments({ ...parameters, policy_recheck_limit: value }, scan.inputSchema, {}),
    )
  assert.equal(scan.network, true)
  assert.equal(scan.model, false)
})

test("authority observations remain selected read-only inputs; missing captures never count as verified", async (t) => {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "resumed-wbs-input-")))
  const root = path.join(repo, ".local/research")
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }))
  fs.mkdirSync(path.join(repo, "docs"))
  fs.writeFileSync(path.join(repo, PLAN_FILE), "No completed WBS evidence in this fixture.\n")
  const progress = operation("validation", "progress")
  const delivery = operation("publication", "delivery_status")
  for (const operation of [progress, delivery]) {
    assert.equal(operation.readOnly, true)
    assert.equal(operation.network, false)
    assert.equal(operation.model, false)
    assert.throws(() =>
      validateArguments(
        {
          ...(operation.id === "progress" ? { plan_file: PLAN_FILE } : { run_id: "request" }),
          source_capture_run: "../capture",
        },
        operation.inputSchema,
        { repo, root },
      ),
    )
  }
  const parameters = { plan_file: PLAN_FILE, source_capture_run: "missing-source" }
  await assert.rejects(
    () => executeModule({ repo }, "validation", "progress", parameters),
    /selected private root required/i,
  )
  await assert.rejects(
    () => executeModule({ repo, root, vault: "vault" }, "validation", "progress", parameters),
    /ENOENT/,
  )
  assert.equal(fs.existsSync(root), false)
})

test("stored source frontier reports reject mixed or orphan held inputs before writing", async (t) => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "frontier-report-input-")), "private")
  t.after(() => fs.rmSync(path.dirname(root), { recursive: true, force: true }))
  const report = operation("collection", "report")
  const held = {
    run_id: "previous-failed-source",
    requested_window: { since: "2026-10-08", until_exclusive: "2026-10-11" },
    reason: "Unchanged source policy; original failed window and observation retained",
  }
  const input = {
    run_id: "current-source-frontier",
    source_runs: [{ run_id: "completed-source", policy_recheck_limit: 0 }],
    held_sources: [held],
  }
  assert.equal(validateArguments(input, report.inputSchema, {}), input)
  for (const sources of [[], [{ run_id: "../source" }], [{ run_id: "source", policy_recheck_limit: 4 }]])
    assert.throws(() => validateArguments({ ...input, source_runs: sources }, report.inputSchema, {}))
  assert.equal(report.model, false)
  assert.equal(report.network, false)
  await assert.rejects(
    () => executeModule({ root }, "collection", "report", { run_id: input.run_id, held_sources: [held] }),
    /require explicit stored source runs/,
  )
  await assert.rejects(
    () => executeModule({ root }, "collection", "report", { ...input, supplement_runs: ["daily-supplement"] }),
    /frontier and daily supplemental inputs must remain separate/,
  )
  assert.equal(fs.existsSync(root), false)
})

test("stored reconciliation is an explicit read-only input and never fabricates missing preparation", async (t) => {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "stored-reconcile-input-")))
  const root = path.join(repo, ".local/research")
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }))
  fs.mkdirSync(path.join(repo, "docs"))
  fs.writeFileSync(path.join(repo, PLAN_FILE), "No completed WBS evidence in this fixture.\n")
  for (const selected of [operation("validation", "progress"), operation("publication", "delivery_status")]) {
    assert.equal(selected.readOnly, true)
    assert.equal(selected.network, false)
    assert.equal(selected.model, false)
    assert.throws(() => validateArguments({
      ...(selected.id === "progress" ? { plan_file: PLAN_FILE } : { run_id: "request" }),
      source_reconcile_run: "../reconcile",
    }, selected.inputSchema, { repo, root }))
  }
  const parameters = { plan_file: PLAN_FILE, source_reconcile_run: "missing-reconcile" }
  await assert.rejects(
    () => executeModule({ repo }, "validation", "progress", parameters),
    /selected private root required/i,
  )
  await assert.rejects(
    () => executeModule({ repo, root, vault: "vault" }, "validation", "progress", parameters),
    /ENOENT/,
  )
  assert.equal(fs.existsSync(root), false)
})
