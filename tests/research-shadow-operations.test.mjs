import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256 } from "../scripts/research/contracts.mjs"
import {
  auditShadowOperations,
  recordShadowOperation,
  summarizeShadowOperations,
  verifyShadowReview,
  SHADOW_CRITERIA,
} from "../scripts/research/shadow-operations.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "shadow-operations-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const put = (file, value) => {
    const bytes = JSON.stringify(value)
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), bytes)
    return { path: file, sha256: sha256(bytes) }
  }
  return { root, put }
}

test("arbitrary JSON, incomplete receipts and symlinks are visible rejections, never completed operations", async (t) => {
  const f = fixture(t)
  assert.equal((await auditShadowOperations(f.root)).completed_runs, 0)
  f.put("evaluation/shadow/attempt.json", { status: "success" })
  f.put("evaluation/shadow/incomplete/receipt.json", {
    run_id: "incomplete",
    status: "completed_comparison",
  })
  fs.symlinkSync(
    path.join(f.root, "evaluation/shadow/incomplete"),
    path.join(f.root, "evaluation/shadow/link"),
  )
  const result = await auditShadowOperations(f.root)
  assert.equal(result.completed_runs, 0)
  assert.equal(result.rejected.length, 3)
  assert.equal(result.status, "integrity_review_required")
  assert.equal(result.operational_promotion_verified, false)
})

test("verified operation summaries count unique dates, editions and executions and exclude rejected reviews", () => {
  // This is a pure grouping fixture, not fabricated operation evidence.
  const row = (run, day, edition, execution, status = "completed_comparison") => ({
    run_id: run,
    day,
    edition,
    execution_id: execution,
    status,
    reviewed_at: "2026-10-06T01:00:00Z",
  })
  const result = summarizeShadowOperations([
    row("a", "2026-10-06", "issue1", "execution1"),
    row("b", "2026-10-06", "issue2", "execution2"),
    row("c", "2026-10-07", "issue1", "execution3"),
    row("d", "2026-10-08", "issue3", "execution1"),
    row("e", "2026-10-09", "issue4", "execution4"),
    row("f", "2026-10-10", "issue5", "execution5", "review_rejected"),
  ])
  assert.deepEqual(result.counted_runs, ["a", "e"])
  assert.deepEqual(result.duplicate_runs, ["b", "c", "d"])
  assert.equal(result.completed_runs, 2)
  assert.equal(result.target_runs, 7)
})

test("a nominal 08:00 edition or manual invocation cannot grant comparison completion", async (t) => {
  const f = fixture(t)
  const review = {
    schema: "research-shadow-review/v1",
    run_id: "attempt",
    daily_run: "daily",
    legacy_publication_run: "legacy",
    reviewer_kind: "codex",
    reviewer: "reviewer",
    reviewed_at: "2026-10-06T02:00:00Z",
    published_by: "legacy",
    candidate_published: false,
    invocation: {
      kind: "manual",
      schedule_id: "tech-ai-briefing-08",
      execution_id: "run",
      started_at: "2026-10-05T23:00:00Z",
      reason: "manual run",
    },
    candidates: [{ processing_run: "local", candidate_key: "source" }],
    comparison: Object.fromEntries(
      SHADOW_CRITERIA.map((key) => [key, { decision: "accepted", reason: "review" }]),
    ),
    processing_seconds: 1,
  }
  const file = f.put("review.json", review)
  await assert.rejects(
    recordShadowOperation({ root: f.root, run: "attempt", reviewPath: file.path }),
    /scheduled comparison/,
  )
  assert.equal(fs.existsSync(path.join(f.root, "evaluation/shadow/attempt/receipt.json")), false)
  review.invocation.kind = "scheduled"
  review.invocation.evidence = f.put("invocation.json", { execution_id: "run" })
  for (const key of SHADOW_CRITERIA) review.comparison[key].evidence = review.invocation.evidence
  fs.writeFileSync(path.join(f.root, "invocation.json"), "changed")
  await assert.rejects(verifyShadowReview({ root: f.root, review }), /evidence changed/)
})

test("comparison receipt audit rechecks pinned review instead of trusting stored completed status", async (t) => {
  const f = fixture(t)
  const reference = f.put("review.json", { schema: "unknown" })
  f.put("evaluation/shadow/attempt/receipt.json", {
    run_id: "attempt",
    status: "completed_comparison",
    review: reference,
  })
  const result = await auditShadowOperations(f.root)
  assert.equal(result.completed_runs, 0)
  assert.match(result.rejected[0].reason, /scheduled comparison/)
})
