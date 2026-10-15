import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { PLAN_FILE, loadPlanProgress } from "../scripts/research/plan-progress.mjs"
import { moduleCatalog, executeModule } from "../scripts/research/module-registry.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"

const ids = Array.from({ length: 7 }, (_, phase) =>
  Array.from(
    { length: [3, 5].includes(phase) ? 4 : 3 },
    (_, index) => `P${phase}-${String(index + 1).padStart(2, "0")}`,
  ),
).flat()
const document = (rows) =>
  `## 현재 진척과 다음 완료 증거\n기준일 2026-10-11\n${rows.join("\n")}\n## 5. P0\n`
const row = (id) =>
  `| ${id} | ${id === "P6-03" ? "미승격" : id === "P0-02" ? "완료" : id === "P6-01" ? "미완료" : "부분"}: 실제 구현과 운영 수용은 별도 | 다음 실제 입력 |`

function fixture(t) {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "plan-progress-")))
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }))
  fs.mkdirSync(path.join(repo, "docs"))
  const write = (text) => fs.writeFileSync(path.join(repo, PLAN_FILE), text)
  return { repo, write }
}

test("plan progress preserves all acceptance labels and excludes unpromoted autonomous release", (t) => {
  const f = fixture(t)
  const bytes = document(ids.map(row))
  f.write(bytes)
  const result = loadPlanProgress(f.repo)
  assert.equal(result.status, "current_plan_wbs")
  assert.equal(result.required, 22)
  assert.equal(result.completed, 1)
  assert.equal(result.partial, 20)
  assert.equal(result.not_started, 1)
  assert.equal(result.rows.length, 23)
  assert.equal(result.plan_as_of, "2026-10-11")
  assert.deepEqual(result.excluded_from_assisted_completion, ["P6-03"])
  assert.deepEqual(result.plan, {
    path: PLAN_FILE,
    sha256: sha256(bytes),
    bytes: Buffer.byteLength(bytes),
  })
})

test("missing, duplicate or unrecognised WBS rows are invalid rather than complete", (t) => {
  const f = fixture(t)
  assert.equal(loadPlanProgress(f.repo).status, "missing")
  f.write("old plan without current section")
  assert.equal(loadPlanProgress(f.repo).status, "unreadable")
  for (const rows of [
    ids.slice(1).map(row),
    [...ids.slice(1), "P0-02"].map(row),
    ids.map((id) => (id === "P0-01" ? "| P0-01 | 통과 | 없음 |" : row(id))),
  ]) {
    f.write(document(rows))
    const result = loadPlanProgress(f.repo)
    assert.equal(result.status, "invalid_plan_rows")
    assert.equal(result.required, 0)
    assert.equal(result.completed, 0)
  }
})

test("independent progress operation reads the pinned plan without a private root or evidence attestation", async (t) => {
  const f = fixture(t)
  const before = document(ids.map(row))
  f.write(before)
  const ctx = { repo: f.repo }
  const operation = moduleCatalog(["validation"]).modules[0].operations.find(
    (entry) => entry.id === "progress",
  )
  assert.equal(operation.readOnly, true)
  assert.equal(operation.model, false)
  assert.equal(operation.network, false)
  const result = await executeModule(ctx, "validation", "progress", { plan_file: PLAN_FILE })
  assert.equal(result.schema, "research-plan-progress/v1")
  assert.equal(result.completion_scope, "operational_acceptance")
  assert.equal(result.evidence_verified, false)
  assert.equal(result.source_requests, 0)
  assert.equal(result.model_calls, 0)
  assert.equal(fs.readFileSync(path.join(f.repo, PLAN_FILE), "utf8"), before)
  assert.deepEqual(fs.readdirSync(f.repo), ["docs"])
  await assert.rejects(
    () => executeModule(ctx, "validation", "progress", { plan_file: "docs/unrelated.md" }),
    /enum|pattern|value/i,
  )
  f.write(before.replace("P0-02 | 완료:", "P0-02 | 부분:"))
  const changed = await executeModule(ctx, "validation", "progress", { plan_file: PLAN_FILE })
  assert.notEqual(changed.plan.sha256, result.plan.sha256)
  assert.equal(changed.completed, 0)
})

function storedWorkflow(t, blocked = 2) {
  const f = fixture(t)
  f.write(document(ids.map(row)))
  const root = path.join(f.repo, ".local", "research")
  const workflow = "progress-fixture"
  const base = `runs/${workflow}/knowledge-linking/`
  fs.mkdirSync(path.join(root, base), { recursive: true })
  const save = (file, value) => {
    const bytes = JSON.stringify(value)
    fs.writeFileSync(path.join(root, file), bytes)
    return { path: file, sha256: sha256(bytes) }
  }
  const input = { workflow_id: workflow }
  const index = save(base + "index.json", { schema: "progress-test-index/v1", events: [] })
  const state = {
    schema: "research-knowledge-linking/v1",
    workflow_id: workflow,
    status: "review_pending",
    input: save(base + "input.json", input),
    input_sha256: sha256(JSON.stringify(input)),
    counts: { ready: 1, pending: 0, review_pending: 0, blocked },
    tasks: [
      { id: "ready-note", kind: "definition", status: "ready" },
      ...Array.from({ length: blocked }, (_, n) => ({
        id: `missing-note-${n}`,
        kind: "signal",
        status: "blocked",
        reason: "current_article_approvals_missing",
        event_ids: [`event-${n}`],
      })),
    ],
    index,
    native_errors: [],
    projection_error: null,
  }
  const checkpoint = save(base + "checkpoint.json", state)
  save(base + "latest.json", {
    schema: "research-knowledge-linking-pointer/v1",
    workflow_id: workflow,
    checkpoint,
  })
  return { ...f, root, workflow, base, state, checkpoint, index }
}

test("stored progress separates plan acceptance from a bounded checkpoint queue without writes", async (t) => {
  const f = storedWorkflow(t, 25)
  const before = fs
    .readdirSync(path.join(f.root, f.base))
    .map((file) => [file, sha256(fs.readFileSync(path.join(f.root, f.base, file)))])
  const result = await executeModule(f, "validation", "progress", {
    plan_file: PLAN_FILE,
    workflow_id: f.workflow,
  })
  assert.equal(result.required, 22)
  assert.equal(result.completed, 1)
  assert.equal(result.evidence_verified, false)
  assert.equal(result.stored_workflow.scope, "last_installed_checkpoint")
  assert.deepEqual(result.stored_workflow.checkpoint, f.checkpoint)
  assert.deepEqual(result.stored_workflow.index, f.index)
  assert.deepEqual(result.stored_workflow.counts, f.state.counts)
  assert.equal(result.stored_workflow.blocked_tasks.total, 25)
  assert.equal(result.stored_workflow.blocked_tasks.returned, 20)
  assert.equal(result.stored_workflow.blocked_tasks.next_offset, 20)
  assert.equal(result.stored_workflow.current_canonical_checked, false)
  assert.equal(result.stored_workflow.semantic_review_performed, false)
  assert.deepEqual(result.stored_workflow.next_read.parameters, {
    workflow_id: f.workflow,
    status: "blocked",
    offset: 20,
    limit: 20,
  })
  const after = fs
    .readdirSync(path.join(f.root, f.base))
    .map((file) => [file, sha256(fs.readFileSync(path.join(f.root, f.base, file)))])
  assert.deepEqual(after, before)
  assert.equal(result.source_requests, 0)
  assert.equal(result.model_calls, 0)
})

test("stored progress rejects changed checkpoint or index instead of reporting success", async (t) => {
  const f = storedWorkflow(t)
  const args = { plan_file: PLAN_FILE, workflow_id: f.workflow }
  fs.appendFileSync(path.join(f.root, f.checkpoint.path), " ")
  await assert.rejects(() => executeModule(f, "validation", "progress", args), /changed|hash/i)
  fs.writeFileSync(path.join(f.root, f.checkpoint.path), JSON.stringify(f.state))
  fs.appendFileSync(path.join(f.root, f.index.path), " ")
  await assert.rejects(() => executeModule(f, "validation", "progress", args), /changed|hash/i)
  assert.equal(fs.readFileSync(path.join(f.root, f.index.path), "utf8").endsWith(" "), true)
})

test("stored progress keeps an unstarted workflow unknown and does not create its root", async (t) => {
  const f = fixture(t)
  f.write(document(ids.map(row)))
  const root = path.join(f.repo, ".local", "not-created")
  const result = await executeModule({ ...f, root }, "validation", "progress", {
    plan_file: PLAN_FILE,
    workflow_id: "not-started",
  })
  assert.equal(result.stored_workflow.status, "not_started")
  assert.equal(result.stored_workflow.counts, null)
  assert.equal(result.stored_workflow.checkpoint, null)
  assert.equal(result.stored_workflow.blocked_tasks.total, 0)
  assert.equal(result.completed, 1)
  assert.equal(fs.existsSync(root), false)
})
