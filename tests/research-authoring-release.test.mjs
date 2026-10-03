import test from "node:test"
import assert from "node:assert/strict"
import { assertAuthoringReleaseReview } from "../scripts/research/authoring-release.mjs"
import { validResearchCoverage, auditRuns } from "../scripts/research-audit.mjs"
import { SECTORS } from "../scripts/sectors.mjs"
import { PUBLIC_ROOTS, sha256 } from "../scripts/research/contracts.mjs"

function fixture() {
  const now = Date.parse("2026-10-04T00:00:00Z")
  const source_files = PUBLIC_ROOTS.map((root) => ({
    path: root + "/original.md",
    sha256: sha256(root),
  })).sort((a, b) => a.path.localeCompare(b.path))
  return {
    now,
    plan: { preview_sha256: sha256("preview"), destination_folder_id: "root", source_files },
    manifest: {
      observed_at: "2026-10-03T23:59:00Z",
      consistency: { articles: [{ event_id: "event" }] },
      knowledge: [{ path: "Knowledge/reviewed.md" }],
    },
    snapshot: {
      schema: "tech-drive-source/v1",
      complete: true,
      root_folder_id: "root",
      roots: PUBLIC_ROOTS,
      exported_at: "2026-10-04T00:00:00Z",
      files: source_files,
    },
    review: {
      schema: "research-authoring-release-review/v1",
      kind: "retrospective",
      preview_sha256: sha256("preview"),
      reviewer: "editor",
      reviewed_at: "2026-10-04T00:00:00Z",
      event_ids: ["event"],
      note_paths: ["Knowledge/reviewed.md"],
      checks: {
        source_fidelity: "pass",
        detail_preservation: "pass",
        dependent_knowledge: "pass",
        reader_content: "pass",
        reader_interactions: "pass",
      },
    },
  }
}
function coverage() {
  return SECTORS.flatMap((sector) =>
    ["기술·제품", "기업·운영"].flatMap((channel) =>
      ["국내", "해외"].map((region) => ({
        sector,
        channel,
        region,
        status: "확인",
        urls: ["https://example.org/source"],
      })),
    ),
  )
}
test("explicit retrospective review releases only the pinned source baseline", () => {
  const f = fixture(),
    r = assertAuthoringReleaseReview(f)
  assert.equal(r.kind, "retrospective")
  assert.equal(r.new_operational_run, false)
  assert.equal(r.coverage_reviewed, false)
})
test("private new edition cannot pass without every research cell", () => {
  for (const mutate of [
    (f) => {},
    (f) => (f.review.coverage = coverage().slice(1)),
    (f) => {
      f.review.coverage = coverage()
      f.review.coverage[0].status = "미실시"
    },
    (f) => {
      f.review.coverage = coverage()
      f.review.coverage[0].urls = []
    },
    (f) => {
      f.review.coverage = coverage()
      f.review.coverage[0].urls = ["file:///private"]
    },
  ]) {
    const f = fixture()
    f.manifest.edition_spec = { intent: "private_slice" }
    f.review.kind = "daily"
    mutate(f)
    assert.throws(() => assertAuthoringReleaseReview(f))
  }
  const f = fixture()
  f.manifest.edition_spec = { intent: "private_slice" }
  f.review.kind = "daily"
  f.review.coverage = coverage()
  f.review.coverage[0].status = "접근 실패"
  assert.equal(assertAuthoringReleaseReview(f).coverage_reviewed, true)
})
test("missing editorial checks, mismatched events, notes and preview or forged historical time are rejected", () => {
  for (const change of [
    (f) => (f.review.event_ids = []),
    (f) => f.review.event_ids.push("event"),
    (f) => (f.review.note_paths = []),
    (f) => (f.review.preview_sha256 = sha256("other")),
    (f) => (f.review.checks.source_fidelity = "fail"),
    (f) => delete f.review.checks.dependent_knowledge,
    (f) => (f.review.checks.extra = "pass"),
    (f) => (f.review.reviewed_at = "2026-10-03T23:58:00Z"),
    (f) => (f.review.reviewed_at = "2026-10-04T00:01:00Z"),
    (f) => (f.review.coverage = coverage()),
    (f) => (f.review.reviewer = ""),
    (f) => (f.review.bypass = true),
  ]) {
    const f = fixture()
    change(f)
    assert.throws(() => assertAuthoringReleaseReview(f))
  }
})
test("stale, partial and changed Drive snapshots cannot authorize release", () => {
  for (const change of [
    (f) => (f.snapshot.exported_at = "2026-10-03T23:40:00Z"),
    (f) => (f.snapshot.complete = false),
    (f) => (f.snapshot.root_folder_id = "other"),
    (f) => (f.snapshot.files = f.snapshot.files.slice(1)),
    (f) => (f.snapshot.files = [...f.snapshot.files, f.snapshot.files[0]]),
    (f) =>
      (f.snapshot.files = f.snapshot.files.map((r, i) => ({
        ...r,
        sha256: i ? r.sha256 : sha256("remote edit"),
      }))),
    (f) => (f.snapshot.roots = ["Research"]),
  ]) {
    const f = fixture()
    change(f)
    assert.throws(() => assertAuthoringReleaseReview(f))
  }
})
test("coverage helper preserves post-publication audit semantics; release still needs actual investigation", () => {
  const rows = coverage()
  rows[0].status = "미실시"
  rows[0].urls = []
  assert.equal(validResearchCoverage(rows), true)
  assert.equal(validResearchCoverage(rows, { requireAttempt: true }), false)
  const record = {
    edition: "Editions/test.md",
    checked_at: "2026-10-04T00:00:00Z",
    drive_verified: true,
    deployment_verified: true,
    rss_verified: true,
    github_verified: true,
    skip_reason: "No sourced deep analysis",
    reading_minutes: 3,
    coverage: rows,
  }
  assert.equal(auditRuns([record]).completed_runs, 1)
  assert.equal(auditRuns([{ ...record, deployment_verified: false }]).completed_runs, 0)
  assert.equal(auditRuns([record, record]).completed_runs, 1)
})
