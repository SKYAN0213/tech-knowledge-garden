import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { PLAN_FILE, loadPlanProgress } from "../scripts/research/plan-progress.mjs"
import { executeModule, moduleCatalog } from "../scripts/research/module-registry.mjs"
import { atomicWrite, safePath } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { prepareEvaluationSourceReviewPacket } from "../scripts/research/evaluation-review-packet.mjs"
import { source } from "./fixtures/research-event-fixtures.mjs"

const wbsIds = Array.from({ length: 7 }, (_, phase) =>
  Array.from(
    { length: [3, 5].includes(phase) ? 4 : 3 },
    (_, index) => "P" + phase + "-" + String(index + 1).padStart(2, "0"),
  ),
).flat()
const queueRows = [
  "| W-C-SEARCH | 구현 | collection | 완료 | P1-02 | New multilingual path verified |",
  "| W-R-PROGRESS | 구현 | root | 진행 | P5-01 | Finish exact stored-input readback |",
  "| W-U-RELEASE | 사용자결정 | user | 대기 | P5-03,P5-04 | Review exact private preview |",
  "| W-U-QUALITY | 독립검토 | reviewer | 대기 | P0-03 | Submit source-first review |",
  "| W-E-SOURCE | 외부조건 | source | 대기 | P4-03 | Wait for allowed complete evidence |",
  "| W-E-REGULAR | 운영기간 | existing schedule | 대기 | P6-01 | Seven distinct regular runs |",
]
function fixture(t, rows = queueRows) {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "work-progress-")))
  const root = path.join(repo, ".local/research")
  fs.mkdirSync(path.join(repo, "docs"))
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }))
  const write = (work = rows) =>
    fs.writeFileSync(
      path.join(repo, PLAN_FILE),
      [
        "## 현재 진척과 다음 완료 증거",
        "기준일 2026-10-11",
        ...wbsIds.map(
          (id) =>
            "| " +
            id +
            " | " +
            (id === "P6-03" ? "미승격" : id === "P0-02" ? "완료" : "부분") +
            ": Plan acceptance only | Exact next evidence |",
        ),
        ...(work === null
          ? []
          : [
              "### 남은 구현·확인 작업",
              "| 작업 | 분류 | 담당 | 상태 | WBS | 내용 |",
              "|---|---|---|---|---|---|",
              ...work,
            ]),
        "### 최종 통합의 증거와 재사용",
        "## 5. P0",
        "",
      ].join("\n"),
    )
  write()
  return { repo, root, write }
}

test("current work separates implementation and user inputs without promoting WBS acceptance", (t) => {
  const f = fixture(t)
  const result = loadPlanProgress(f.repo)
  assert.equal(result.required, 22)
  assert.equal(result.completed, 1)
  assert.equal(result.partial, 21)
  assert.equal(result.work_queue.scope, "declared_current_work")
  assert.equal(result.work_queue.evidence_verified, false)
  assert.deepEqual(result.work_queue.counts.implementation, {
    total: 2,
    completed: 1,
    in_progress: 1,
    waiting: 0,
  })
  for (const kind of [
    "user_decision",
    "independent_review",
    "external_condition",
    "scheduled_observation",
  ])
    assert.equal(result.work_queue.counts[kind].waiting, 1)
  assert.deepEqual(result.work_queue.rows.find((row) => row.id === "W-U-RELEASE").wbs_ids, [
    "P5-03",
    "P5-04",
  ])
  f.write(null)
  assert.equal(Object.hasOwn(loadPlanProgress(f.repo), "work_queue"), false)
})

test("invalid or duplicate work rows stay invalid while the original WBS labels remain readable", (t) => {
  const f = fixture(t)
  for (const work of [
    [...queueRows, queueRows[0]],
    [queueRows[0].replace("P1-02", "P9-99")],
    [queueRows[0].replace("| 완료 |", "| 추정완료 |")],
    [queueRows[0].replace("| 구현 |", "| 자동승인 |")],
    [queueRows[0].replace("P1-02", "P1-02,P1-02")],
    [],
  ]) {
    f.write(work)
    const result = loadPlanProgress(f.repo)
    assert.equal(result.status, "current_plan_wbs")
    assert.equal(result.completed, 1)
    assert.equal(result.work_queue.status, "invalid_plan_work_queue")
    assert.equal(result.work_queue.counts, null)
    assert.equal(result.work_queue.evidence_verified, false)
    assert.ok(result.work_queue.issues.length)
  }
})

test("progress reads actual independent-review counts and rejects a changed source packet", async (t) => {
  const f = fixture(t)
  const stored = source(f.root, "review-one", "source-one")
  const selectionPath = "evaluation/review-selections/current.json"
  atomicWrite(f.root, selectionPath, {
    schema: "evaluation-source-review-selection/v1",
    provenance: { prepared_by: "synthetic-test", input_files: [] },
    cases: [
      {
        case_id: "review-one",
        split: "development",
        source_run: stored.origin,
        source_scope: {
          source_version_ids: [stored.document.source_version_id],
          parse_ids: [stored.parsed.parse_id],
        },
        coverage_tags: ["planned-versus-completed"],
        prior_use: "development",
      },
    ],
  })
  const packet = await prepareEvaluationSourceReviewPacket(f.root, "review-packet", selectionPath)
  const paths = [
    packet.packet,
    stored.document.body_path,
    "parses/" + stored.parsed.parse_id + "/parse.json",
  ]
  const before = paths.map((file) => sha256(fs.readFileSync(safePath(f.root, file))))
  const args = { plan_file: PLAN_FILE, evaluation_packet_run: "review-packet" }
  const result = await executeModule(f, "validation", "progress", args)
  assert.equal(result.stored_evaluation.status, "waiting_for_independent_reviews")
  assert.equal(result.stored_evaluation.packet_sha256, packet.sha256)
  assert.equal(result.stored_evaluation.prepared_cases, 1)
  assert.equal(result.stored_evaluation.submitted_independent_gold, 0)
  assert.equal(result.stored_evaluation.remaining_independent_gold, 1)
  assert.deepEqual(result.stored_evaluation.remaining_by_split, { development: 1, heldout: 0 })
  assert.equal(result.stored_evaluation.model_quality_evaluated, false)
  assert.equal(result.stored_evaluation.operational_acceptance_granted, false)
  assert.equal(result.stored_evaluation.source_payload_disclosed, false)
  assert.equal(result.completed, 1)
  assert.deepEqual(
    paths.map((file) => sha256(fs.readFileSync(safePath(f.root, file)))),
    before,
  )
  fs.appendFileSync(safePath(f.root, selectionPath), " ")
  await assert.rejects(() => executeModule(f, "validation", "progress", args), /selection changed/i)
})

test("optional stored review input distinguishes missing from corrupt and never creates its root", async (t) => {
  const f = fixture(t)
  const params = { plan_file: PLAN_FILE, evaluation_packet_run: "missing-packet" }
  const catalog = moduleCatalog(["validation"]).modules[0].operations.find(
    (row) => row.id === "progress",
  )
  assert.equal(catalog.readOnly, true)
  assert.equal(catalog.model, false)
  assert.equal(catalog.network, false)
  for (const name of ["evaluation_packet_run", "publication_run_id"])
    assert.equal(catalog.inputSchema.properties[name].type, "string")
  const result = await executeModule(f, "validation", "progress", params)
  assert.equal(result.stored_evaluation.status, "not_prepared")
  assert.equal(result.stored_evaluation.prepared_cases, null)
  assert.equal(result.stored_evaluation.submitted_independent_gold, null)
  assert.equal(result.stored_evaluation.remaining_independent_gold, null)
  assert.equal(fs.existsSync(f.root), false)
  await assert.rejects(
    () => executeModule({ repo: f.repo }, "validation", "progress", params),
    /selected private root required/i,
  )
  atomicWrite(f.root, "runs/missing-packet/evaluation-review/packet.json", "null\n")
  await assert.rejects(
    () => executeModule(f, "validation", "progress", params),
    /source reference packet required/i,
  )
})
