import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { PLAN_FILE, loadPlanProgress } from "../scripts/research/plan-progress.mjs"
import { executeModule } from "../scripts/research/module-registry.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"

const systemIds = [
  "S1-01", "S1-02", "S2-01", "S2-02",
  "S3-01", "S3-02", "S3-03", "S3-04",
  "S4-01", "S5-01", "S6-01", "S6-02",
]
const legacyIds = Array.from({ length: 7 }, (_, phase) =>
  Array.from({ length: [3, 5].includes(phase) ? 4 : 3 },
    (_, n) => `P${phase}-${String(n + 1).padStart(2, "0")}`),
).flat()
const systemRow = (id, state = ["S3-04", "S6-02"].includes(id) ? "부분" : "완료") =>
  `| ${id} | System capability | ${state}: Existing implementation evidence | Real module acceptance | P3-01 |`

function document(rows = systemIds.map((id) => systemRow(id))) {
  return [
    "## 현재 진척과 다음 완료 증거", "기준일 2026-10-11",
    ...(rows === null ? [] : [
      "### 시스템 구축 WBS",
      "| WBS | 모듈 | 현재 상태·근거 | 완료 조건 | 이전 WBS |",
      "|---|---|---|---|---|", ...rows,
    ]),
    "### 운영 수용 이력",
    ...legacyIds.map((id) => `| ${id} | ${id === "P6-03" ? "미승격" : id === "P0-02" ? "완료" : "부분"}: Old operational evidence | Later operational acceptance |`),
    "### 남은 구현·확인 작업",
    "| 작업 | 분류 | 담당 | 상태 | WBS | 내용 |",
    "|---|---|---|---|---|---|",
    "| W-D-DONE | 구현 | module owner | 완료 | P3-01 | Reuse completed batch |",
    "| W-U-RELEASE | 사용자결정 | user | 대기 | P5-03 | Production decision only |",
    "### 별도 운영 지표", "미작성26 · 독립0/60 · 정규0/7",
    "## 5. P0", "",
  ].join("\n")
}
function fixture(t) {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "system-wbs-")))
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }))
  fs.mkdirSync(path.join(repo, "docs"))
  const write = (bytes) => fs.writeFileSync(path.join(repo, PLAN_FILE), bytes)
  write(document())
  return { repo, write }
}

test("system construction is the primary denominator while old operating and batch counts remain separate", (t) => {
  const f = fixture(t)
  const before = fs.readFileSync(path.join(f.repo, PLAN_FILE))
  const result = loadPlanProgress(f.repo)
  assert.equal(result.status, "current_system_wbs")
  assert.equal(result.completion_scope, "system_construction")
  assert.equal(result.required, 12)
  assert.equal(result.completed, 10)
  assert.equal(result.partial, 2)
  assert.deepEqual(result.rows.filter((r) => r.status === "partial").map((r) => r.id), ["S3-04", "S6-02"])
  assert.equal(result.operational_acceptance.required, 22)
  assert.equal(result.operational_acceptance.completed, 1)
  assert.equal(result.operational_acceptance.partial, 21)
  assert.deepEqual(result.operational_acceptance.excluded_from_assisted_completion, ["P6-03"])
  assert.equal(result.work_queue.is_primary_completion_scope, false)
  assert.equal(result.work_queue.counts.implementation.total, 1)
  assert.equal(result.work_queue.counts.user_decision.waiting, 1)
  assert.ok(result.completion_exclusions.includes("article_backlog"))
  assert.ok(result.completion_exclusions.includes("scheduled_observation"))
  assert.equal(result.plan.sha256, sha256(before))
  assert.deepEqual(fs.readFileSync(path.join(f.repo, PLAN_FILE)), before)
})

test("complete system labels do not grant operational acceptance or consume unfinished editorial work", (t) => {
  const f = fixture(t)
  f.write(document(systemIds.map((id) => systemRow(id, "완료"))))
  const result = loadPlanProgress(f.repo)
  assert.equal(result.completed, 12)
  assert.equal(result.partial, 0)
  assert.equal(result.operational_acceptance.completed, 1)
  assert.equal(result.operational_acceptance.partial, 21)
  assert.equal(result.work_queue.counts.user_decision.waiting, 1)
  assert.ok(fs.readFileSync(path.join(f.repo, PLAN_FILE), "utf8").includes("독립0/60 · 정규0/7"))
})

test("missing, duplicate, unknown labels or incorrect system references cannot fall back to a completed count", (t) => {
  const f = fixture(t)
  const valid = systemIds.map((id) => systemRow(id))
  for (const rows of [
    valid.slice(1), [...valid, valid[0]],
    valid.map((row) => row.replace("S3-04 |", "S9-99 |")),
    valid.map((row) => row.replace("부분:", "추정완료:")),
    valid.map((row) => row.replace("P3-01 |", "P9-99 |")),
    [],
  ]) {
    f.write(document(rows))
    const result = loadPlanProgress(f.repo)
    assert.equal(result.status, "invalid_system_wbs")
    assert.equal(result.completion_scope, "system_construction")
    assert.equal(result.required, 0)
    assert.equal(result.completed, 0)
    assert.ok(result.issues.length)
    assert.equal(result.operational_acceptance.required, 22)
  }
})

test("native progress reports construction scope without changing facts, reviews, schedule or private state", async (t) => {
  const f = fixture(t)
  const before = fs.readFileSync(path.join(f.repo, PLAN_FILE))
  const result = await executeModule({ repo: f.repo }, "validation", "progress", { plan_file: PLAN_FILE })
  assert.equal(result.schema, "research-plan-progress/v1")
  assert.equal(result.completion_scope, "system_construction")
  assert.equal(result.required, 12)
  assert.equal(result.operational_acceptance.required, 22)
  assert.equal(result.evidence_verified, false)
  assert.equal(result.source_requests, 0)
  assert.equal(result.model_calls, 0)
  assert.deepEqual(fs.readdirSync(f.repo), ["docs"])
  assert.deepEqual(fs.readFileSync(path.join(f.repo, PLAN_FILE)), before)
})

test("historical plans retain their original operational denominator and work queue", (t) => {
  const f = fixture(t)
  f.write(document(null))
  const result = loadPlanProgress(f.repo)
  assert.equal(result.status, "current_plan_wbs")
  assert.equal(result.completion_scope, "operational_acceptance")
  assert.equal(result.required, 22)
  assert.equal(result.work_queue.scope, "declared_current_work")
  assert.equal(Object.hasOwn(result, "operational_acceptance"), false)
})
