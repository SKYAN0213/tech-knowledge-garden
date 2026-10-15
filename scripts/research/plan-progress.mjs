import fs from "node:fs"
import path from "node:path"
import { sha256 } from "./contracts.mjs"

export const PLAN_FILE = "docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md"

const workHeading = "### 남은 구현·확인 작업"
const workKinds = {
  구현: "implementation",
  사용자결정: "user_decision",
  독립검토: "independent_review",
  외부조건: "external_condition",
  운영기간: "scheduled_observation",
}
const workStates = { 완료: "complete", 진행: "in_progress", 대기: "waiting" }
const systemHeading = "### 시스템 구축 WBS"
const systemIds = [
  "S1-01", "S1-02", "S2-01", "S2-02",
  "S3-01", "S3-02", "S3-03", "S3-04",
  "S4-01", "S5-01", "S6-01", "S6-02",
]

function systemProgress(section, legacy) {
  const start = section.indexOf(systemHeading)
  if (start < 0) return legacy
  const end = section.indexOf("\n### ", start + systemHeading.length)
  const table = section.slice(start + systemHeading.length, end < 0 ? undefined : end)
  const rows = [], issues = []
  const oldIds = new Set(legacy.rows.map((row) => row.id))
  for (const line of table.split("\n").filter((value) => value.trim().startsWith("|"))) {
    const cells = line.trim().split("|").slice(1, -1).map((cell) => cell.trim())
    if (cells[0] === "WBS" || cells.every((cell) => /^:?-+:?$/.test(cell))) continue
    const [id, title, detail, next, related] = cells
    const label = detail?.match(/^(완료|부분|미완료)\s*:/)?.[1]
    const previousIds = (related || "").split(",").map((value) => value.trim())
    if (
      cells.length !== 5 || !systemIds.includes(id) || !title || !label || !next ||
      previousIds.some((value) => !oldIds.has(value)) ||
      new Set(previousIds).size !== previousIds.length || rows.some((row) => row.id === id)
    ) {
      issues.push({ row: id || null, reason: "invalid_or_duplicate_system_row" })
      continue
    }
    rows.push({
      id, title, status: { 완료: "complete", 부분: "partial", 미완료: "not_started" }[label],
      required: true,
      evidence: detail.replace(/^(?:완료|부분|미완료)\s*:\s*/, "").trim(),
      next, previous_wbs_ids: previousIds,
    })
  }
  const missing = systemIds.filter((id) => !rows.some((row) => row.id === id))
  if (missing.length) issues.push({ reason: "system_rows_missing", ids: missing })
  const valid = !issues.length && rows.length === systemIds.length
  const { work_queue: work, ...operational } = legacy
  return {
    status: valid ? "current_system_wbs" : "invalid_system_wbs",
    completion_scope: "system_construction",
    plan_as_of: legacy.plan_as_of,
    required: valid ? rows.length : 0,
    completed: valid ? rows.filter((row) => row.status === "complete").length : 0,
    partial: valid ? rows.filter((row) => row.status === "partial").length : 0,
    not_started: valid ? rows.filter((row) => row.status === "not_started").length : 0,
    excluded_from_assisted_completion: [],
    completion_exclusions: [
      "article_backlog", "historical_source_recovery", "independent_benchmark",
      "production_release", "scheduled_observation",
    ],
    rows, issues, plan: legacy.plan,
    operational_acceptance: { ...operational, completion_scope: "post_build_operational_acceptance" },
    ...(work ? { work_queue: { ...work, scope: "completed_batches_and_operational_inputs", is_primary_completion_scope: false } } : {}),
  }
}

function declaredWorkQueue(section, wbsIds) {
  const start = section.indexOf(workHeading)
  if (start < 0) return null
  const end = section.indexOf("\n### ", start + workHeading.length)
  const table = section.slice(start + workHeading.length, end < 0 ? undefined : end)
  const rows = [],
    issues = []
  for (const line of table.split("\n").filter((value) => value.trim().startsWith("|"))) {
    const cells = line
      .trim()
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim())
    if (cells[0] === "작업" || cells.every((cell) => /^:?-+:?$/.test(cell))) continue
    const [id, kind, owner, state, related, next] = cells
    const relatedIds = (related || "").split(",").map((value) => value.trim())
    if (
      cells.length !== 6 ||
      !/^W-[A-Z0-9-]{1,40}$/.test(id || "") ||
      !Object.hasOwn(workKinds, kind || "") ||
      !Object.hasOwn(workStates, state || "") ||
      !owner ||
      !next ||
      !relatedIds.length ||
      new Set(relatedIds).size !== relatedIds.length ||
      relatedIds.some((value) => !wbsIds.has(value)) ||
      rows.some((row) => row.id === id)
    ) {
      issues.push({ row: id || null, reason: "invalid_or_duplicate_work_row" })
      continue
    }
    rows.push({
      id,
      kind: workKinds[kind],
      owner,
      status: workStates[state],
      wbs_ids: relatedIds,
      next,
    })
  }
  if (!rows.length || issues.length)
    return {
      status: "invalid_plan_work_queue",
      scope: "declared_current_work",
      evidence_verified: false,
      rows,
      counts: null,
      issues: issues.length ? issues : [{ row: null, reason: "work_rows_missing" }],
    }
  return {
    status: "declared_plan_work_queue",
    scope: "declared_current_work",
    evidence_verified: false,
    rows,
    counts: Object.fromEntries(
      Object.values(workKinds).map((kind) => {
        const selected = rows.filter((row) => row.kind === kind)
        return [
          kind,
          {
            total: selected.length,
            completed: selected.filter((row) => row.status === "complete").length,
            in_progress: selected.filter((row) => row.status === "in_progress").length,
            waiting: selected.filter((row) => row.status === "waiting").length,
          },
        ]
      }),
    ),
    issues: [],
  }
}

// The plan records acceptance labels. Reading it does not attest source,
// editorial, independent-human, or remote-delivery evidence.
export function loadPlanProgress(repo) {
  const file = path.join(repo, PLAN_FILE)
  if (!fs.existsSync(file))
    return { status: "missing", required: 0, completed: 0, rows: [], plan: null }
  const bytes = fs.readFileSync(file)
  const document = bytes.toString("utf8")
  const plan = { path: PLAN_FILE, sha256: sha256(bytes), bytes: bytes.length }
  const sectionStart = document.indexOf("## 현재 진척과 다음 완료 증거")
  const sectionEnd = document.indexOf("## 5. P0", sectionStart)
  if (sectionStart < 0 || sectionEnd < 0)
    return { status: "unreadable", required: 0, completed: 0, rows: [], plan }
  const rows = document
    .slice(sectionStart, sectionEnd)
    .split("\n")
    .flatMap((line) => {
      const match = line.match(/^\|\s*(P[0-6]-\d{2})\s*\|\s*([^|]+)\|\s*([^|]+)\|/)
      if (!match) return []
      const [, id, detail, next] = match
      const label = detail.match(/^\s*(완료|부분|미완료|미승격)\s*:/)?.[1]
      if (!label) return []
      const status = {
        완료: "complete",
        부분: "partial",
        미완료: "not_started",
        미승격: "not_promoted",
      }[label]
      return [
        {
          id,
          status,
          required: status !== "not_promoted",
          evidence: detail.replace(/^\s*(?:완료|부분|미완료|미승격)\s*:\s*/, "").trim(),
          next: next.trim(),
        },
      ]
    })
  const expectedIds = Array.from({ length: 7 }, (_, phase) =>
    Array.from(
      { length: [3, 5].includes(phase) ? 4 : 3 },
      (_, index) => `P${phase}-${String(index + 1).padStart(2, "0")}`,
    ),
  ).flat()
  const valid =
    rows.length === expectedIds.length &&
    expectedIds.every((id) => rows.filter((row) => row.id === id).length === 1)
  if (!valid) return { status: "invalid_plan_rows", required: 0, completed: 0, rows, plan }
  const requiredRows = rows.filter((row) => row.required)
  const work = declaredWorkQueue(document.slice(sectionStart, sectionEnd), new Set(expectedIds))
  const legacy = {
    status: "current_plan_wbs",
    completion_scope: "operational_acceptance",
    plan_as_of: document.match(/기준일[:：]?\s*(\d{4}-\d{2}-\d{2})/)?.[1] || null,
    required: requiredRows.length,
    completed: requiredRows.filter((row) => row.status === "complete").length,
    partial: requiredRows.filter((row) => row.status === "partial").length,
    not_started: requiredRows.filter((row) => row.status === "not_started").length,
    excluded_from_assisted_completion: rows.filter((row) => !row.required).map((row) => row.id),
    rows,
    plan,
    ...(work ? { work_queue: work } : {}),
  }
  return systemProgress(document.slice(sectionStart, sectionEnd), legacy)
}
