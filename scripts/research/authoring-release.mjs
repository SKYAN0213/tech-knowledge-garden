import fs from "node:fs"
import path from "node:path"
import { PUBLIC_ROOTS, sha256 } from "./contracts.mjs"
import { verifiedDriveEdition } from "./daily-scan.mjs"
import { privatePreview } from "./preview.mjs"
import {
  authoringDelta,
  authoringInventory,
  compareAuthoringRemote,
} from "./authoring-transfer.mjs"
import { validResearchCoverage } from "../research-audit.mjs"
import {
  atomicCreate,
  readJSON,
  safePath,
  withGardenOperationLock,
  withLock,
} from "./run-state.mjs"

const REVIEW_CHECKS = [
  "source_fidelity",
  "detail_preservation",
  "dependent_knowledge",
  "reader_content",
  "reader_interactions",
]
const sameSet = (a, b) =>
  Array.isArray(a) &&
  Array.isArray(b) &&
  new Set(a).size === a.length &&
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())

// This is an explicit editorial decision, separate from collection or build success.
export function assertAuthoringReleaseReview({
  plan,
  manifest,
  snapshot,
  review,
  now = Date.now(),
}) {
  const expected = [
    "schema",
    "kind",
    "preview_sha256",
    "reviewer",
    "reviewed_at",
    "event_ids",
    "note_paths",
    "checks",
    ...(manifest.edition_spec ? ["coverage"] : []),
  ]
  if (
    review?.schema !== "research-authoring-release-review/v1" ||
    Object.keys(review).some((k) => !expected.includes(k)) ||
    typeof review.reviewer !== "string" ||
    !review.reviewer.trim() ||
    !Number.isFinite(Date.parse(review.reviewed_at)) ||
    Date.parse(review.reviewed_at) > now ||
    !Number.isFinite(Date.parse(manifest.observed_at)) ||
    Date.parse(review.reviewed_at) < Date.parse(manifest.observed_at) ||
    review.preview_sha256 !== plan.preview_sha256 ||
    !sameSet(
      review.event_ids,
      manifest.consistency.articles.map((row) => row.event_id),
    ) ||
    !sameSet(
      review.note_paths,
      [...manifest.knowledge, ...(manifest.navigation ? [manifest.navigation] : [])].map(
        (row) => row.path,
      ),
    ) ||
    !review.checks ||
    Object.keys(review.checks).length !== REVIEW_CHECKS.length ||
    !REVIEW_CHECKS.every((key) => review.checks[key] === "pass")
  )
    throw Error("Explicit complete editorial release review required")
  if (manifest.edition_spec) {
    if (
      review.kind !== "daily" ||
      !validResearchCoverage(review.coverage, { requireAttempt: true })
    )
      throw Error("Daily release requires all 32 research cells with investigation evidence")
    if (
      review.coverage.some((row) =>
        row.urls.some((url) => {
          try {
            return !["https:", "http:"].includes(new URL(url).protocol)
          } catch {
            return true
          }
        }),
      )
    )
      throw Error("Research coverage needs source URLs")
  } else if (review.kind !== "retrospective" || "coverage" in review) {
    throw Error("Retrospective release cannot create a new operational run")
  }
  if (
    snapshot?.schema !== "tech-drive-source/v1" ||
    snapshot.complete !== true ||
    snapshot.root_folder_id !== plan.destination_folder_id ||
    JSON.stringify(snapshot.roots) !== JSON.stringify(PUBLIC_ROOTS) ||
    !Number.isFinite(Date.parse(snapshot.exported_at)) ||
    Math.abs(now - Date.parse(snapshot.exported_at)) > 600000
  )
    throw Error("Fresh complete Drive authoring snapshot required")
  const current = snapshot.files
    .map((row) => ({ path: row.path, sha256: row.sha256 }))
    .sort((a, b) => a.path.localeCompare(b.path))
  if (
    !sameSet(
      current.map((row) => row.path),
      plan.source_files.map((row) => row.path),
    ) ||
    JSON.stringify(current) !== JSON.stringify(plan.source_files)
  )
    throw Error("Drive baseline differs from the pinned authoring transfer source")
  return {
    kind: review.kind,
    reviewed_event_ids: review.event_ids,
    coverage_reviewed: review.kind === "daily",
    new_operational_run: review.kind === "daily",
  }
}

export async function authorizeAuthoringTransfer({
  root,
  previewRun,
  reviewFile,
  snapshotFile,
  observationFile,
  vault = "vault",
  repo = process.cwd(),
}) {
  if (!/^[A-Za-z0-9_-]+$/.test(previewRun || "")) throw Error("Invalid preview run")
  return withGardenOperationLock(root, () =>
    withLock(root, "run-" + previewRun, async () => {
      const manifestPath = `runs/${previewRun}/preview-manifest.json`
      const initial = readJSON(root, manifestPath)
      if (initial?.run_id !== previewRun) throw Error("Existing verified preview required")
      await privatePreview(
        root,
        previewRun,
        initial.daily_editorial_handoff ? [] : initial.approved_runs,
        {
          repo,
          vault,
          publicationHandoff: initial.daily_editorial_handoff?.path || null,
          knowledgeRuns: initial.knowledge_runs,
          editionSpec: initial.edition_spec || null,
          legacyReviews: initial.legacy_reviews || [],
          sourceAlternatives: initial.source_alternatives || [],
        },
      )
      const planPath = `runs/${previewRun}/drive-authoring/transfer-plan.json`
      const paths = {
        plan: safePath(root, planPath),
        manifest: safePath(root, manifestPath),
        review: path.resolve(reviewFile),
        snapshot: path.resolve(snapshotFile),
        observation: path.resolve(observationFile),
      }
      const bytes = Object.fromEntries(
        Object.entries(paths).map(([key, file]) => [key, fs.readFileSync(file)]),
      )
      const values = Object.fromEntries(
        Object.entries(bytes).map(([key, b]) => [key, JSON.parse(b)]),
      )
      if (
        values.plan.schema !== "research-authoring-transfer/v1" ||
        values.plan.preview_run !== previewRun ||
        values.plan.preview_sha256 !== sha256(bytes.manifest)
      )
        throw Error("Transfer preview changed")
      const delta = authoringDelta(
        values.manifest,
        authoringInventory(path.resolve(repo, vault)),
        authoringInventory(path.join(safePath(root, values.manifest.workspace), "vault")),
      )
      const expectedFiles = delta.map((row) => ({
        ...row,
        staged_path: `runs/${previewRun}/drive-authoring/files/${row.path}`,
      }))
      if (JSON.stringify(expectedFiles) !== JSON.stringify(values.plan.files))
        throw Error("Transfer contains undeclared or missing changes")
      for (const row of values.plan.files) {
        const staged = fs.readFileSync(safePath(root, row.staged_path))
        if (staged.length !== row.bytes || sha256(staged) !== row.sha256)
          throw Error("Staged authoring bytes changed")
      }
      const decision = assertAuthoringReleaseReview(values)
      // The existing full-snapshot validator also verifies all content hashes and local bytes.
      const drive = verifiedDriveEdition(paths.snapshot, path.resolve(repo, vault))
      const comparison = compareAuthoringRemote(values.plan, values.observation)
      const hashes = Object.fromEntries(Object.entries(bytes).map(([key, b]) => [key, sha256(b)]))
      for (const [key, file] of Object.entries(paths))
        if (sha256(fs.readFileSync(file)) !== hashes[key])
          throw Error("Release inputs changed during verification")
      const result = {
        schema: "research-authoring-release/v1",
        preview_run: previewRun,
        input_sha256: hashes,
        reviewer: values.review.reviewer,
        reviewed_at: values.review.reviewed_at,
        ...decision,
        drive,
        operations: comparison.operations,
        release_approved: true,
        upload_allowed: true,
        drive_written: false,
        candidate_published: false,
        public_deployment_verified: false,
      }
      const relative = `runs/${previewRun}/drive-authoring/releases/${sha256(JSON.stringify(hashes))}.json`
      const prior = readJSON(root, relative)
      if (prior && JSON.stringify(prior) !== JSON.stringify(result))
        throw Error("Release receipt changed")
      if (!prior) atomicCreate(root, relative, result)
      return { ...result, receipt: relative }
    }),
  )
}
