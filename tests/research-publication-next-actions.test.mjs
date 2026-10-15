import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { deliveryFixture } from "./fixtures/publication-delivery.mjs"
import { PUBLIC_ROOTS, sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON, safePath } from "../scripts/research/run-state.mjs"
import {
  loadPreviewPublicationInputs,
  loadCurrentApproval,
  retrospectiveProjections,
} from "../scripts/research/preview.mjs"
import { editionProjection } from "../scripts/research/publish-adapter.mjs"
import { requestPublicationDelivery } from "../scripts/research/authoring-delivery-request.mjs"
import { loadPublicationNextActions } from "../scripts/research/delivery-status.mjs"
import {
  inspectCompletedAuthoringPreview,
  prepareAuthoringTransfer,
} from "../scripts/research/authoring-transfer.mjs"
import { authorizeAuthoringTransfer } from "../scripts/research/authoring-release.mjs"
import { module as publication } from "../scripts/research/modules/publication.mjs"
import { validateArguments } from "../scripts/research/modules/contracts.mjs"
import { prepareEventPublicationHandoff } from "../scripts/research/daily-publication-handoff.mjs"

// Native evidence/approval/handoff are the existing fixture contract. Only the
// disposable rendering checkpoints below are fixtures, never operational proof.
async function completed(t) {
  const f = await deliveryFixture(t)
  const vault = path.join(f.root, "consumer-vault")
  for (const folder of PUBLIC_ROOTS) fs.mkdirSync(path.join(vault, folder), { recursive: true })
  f.ctx = { ...f.ctx, vault }
  const prior = structuredClone(loadCurrentApproval(f.root, "writer", { vault }).article)
  prior.record.explanations[0].heading = "이전 계약 설명"
  const original = editionProjection([prior], {
    key: "2026-09-27_0800_Tech_AI_Briefing",
    date: "2026-09-27",
    coverage_start: "2026-09-26T08:00:00+09:00",
    coverage_end: "2026-09-27T08:00:00+09:00",
  })
  atomicWrite(vault, original.path, original.content)
  const workflow = "event-workflows/workflow/latest.json"
  const handoff = await prepareEventPublicationHandoff(f.ctx, {
    run_id: "consumer-handoff",
    workflow_path: workflow,
    workflow_sha256: f.ref(workflow).sha256,
  })
  f.request = {
    ...f.request,
    handoff_path: handoff.publication_handoff.path,
    handoff_sha256: handoff.publication_handoff.sha256,
  }
  const run = "consumer-reader"
  let renders = 0
  const renderer = async (root, previewRun) => {
    renders++
    const selected = loadPreviewPublicationInputs(root, run, [], {
      vault,
      publicationHandoff: f.request.handoff_path,
    })
    const projections = retrospectiveProjections(
      vault,
      selected.approvals.map((a) => a.article),
      [],
      [],
      { root },
    )
    const workspace = `runs/${run}/preview-workspace`
    for (const folder of PUBLIC_ROOTS)
      fs.mkdirSync(safePath(root, `${workspace}/vault/${folder}`), { recursive: true })
    for (const p of projections) f.put(`${workspace}/vault/${p.path}`, p.content)
    const output = (dir, rel, content) => {
      f.put(`${workspace}/${dir}/${rel}`, content)
      return { path: rel, sha256: sha256(content) }
    }
    const manifest = {
      schema: "private-reader-preview/v1",
      run_id: run,
      workspace,
      approved_runs: selected.approvedRuns,
      knowledge_runs: selected.knowledgeRuns,
      daily_editorial_handoff: selected.dailySelection,
      observed_at: new Date(Date.now() - 1000).toISOString(),
      editions: projections.map((p) => ({
        path: p.path,
        sha256: sha256(p.content),
        event_ids: p.event_ids,
      })),
      knowledge: [],
      consistency: { articles: selected.approvals.map((a) => ({ event_id: a.article.event_id })) },
      public: [output("public", "news/fixture.html", "Fixture private news")],
      digest: [output("digest", "fixture.md", "Fixture private digest")],
      candidate_published: false,
      drive_verified: false,
      browser_verified: false,
    }
    const stages = {}
    for (const name of [
      "workspace",
      "refresh",
      "knowledge-sync",
      "knowledge-check",
      "validate",
      "build",
      "verify",
      "consistency",
      "outputs",
    ]) {
      const result = name === "outputs" ? manifest : { fixture_only: true }
      const result_path = `runs/${run}/preview/${name}.json`
      f.put(result_path, result)
      stages[name] = {
        status: "complete",
        result_path,
        result_hash: sha256(JSON.stringify(result)),
      }
    }
    f.put(`runs/${run}/preview/state.json`, {
      schema: "research-run/v1",
      run_id: run,
      input_hash: sha256("past generator code"),
      stages,
    })
    f.put(`runs/${run}/preview-manifest.json`, manifest)
  }
  const parameters = {
    ...f.request,
    preview_run_id: run,
  }
  f.status = await requestPublicationDelivery(f.ctx, parameters, { previewRunner: renderer })
  f.previewRun = run
  f.scheduleFile = safePath(
    f.root,
    f.put(
      "schedule.toml",
      'status = "PAUSED"\nrrule = "FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0"\nmodel = "gpt-6-luna"\n',
    ),
  )
  f.next = () =>
    loadPublicationNextActions({
      root: f.root,
      runId: f.request.run_id,
      repository: f.ctx.repo,
      scheduleFile: f.scheduleFile,
    })
  f.inspect = () =>
    inspectCompletedAuthoringPreview({ root: f.root, previewRun: run, repo: f.ctx.repo, vault })
  f.options = { root: f.root, previewRun: run, repo: f.ctx.repo, vault }
  f.renders = () => renders
  return f
}

test("next actions separate explicit decisions, private preparation and real external evidence without writes", async (t) => {
  const f = await completed(t)
  const requestBefore = fs.readFileSync(safePath(f.root, f.status.request.path)),
    previewBefore = fs.readFileSync(safePath(f.root, f.status.private_preview.manifest.path))
  const next = f.next()
  assert.equal(next.request_status, "release_required")
  assert.equal(next.private_preview_status, "ready_for_explicit_review")
  assert.deepEqual(next.preview, f.status.private_preview.manifest)
  assert.ok(
    next.user_decisions.some(
      (x) => x.reason === "resume_existing_08_schedule" && x.schedule.status === "PAUSED",
    ),
  )
  const release = next.user_decisions.find(
    (x) => x.reason === "native_release_explicit_review_required",
  )
  assert.equal(release.preview_sha256, f.status.private_preview.manifest.sha256)
  assert.equal(release.required, false)
  assert.ok(
    next.external_requirements.some(
      (x) => x.reason === "fresh_complete_drive_inputs_required" && x.maximum_age_ms === 600000,
    ),
  )
  assert.ok(
    next.external_requirements.some(
      (x) => x.reason === "approved_legacy_path_required" && x.do_not_republish_existing_legacy,
    ),
  )
  assert.ok(
    next.external_requirements.some(
      (x) =>
        x.reason === "new_scheduled_complete_collection_required" &&
        x.current_request_cannot_be_relabelled,
    ),
  )
  assert.deepEqual(next.development_gaps, [])
  assert.deepEqual(next.failures, [])
  assert.equal(next.approval_granted, false)
  assert.equal(next.new_regular_operation_counted, false)
  assert.equal(fs.existsSync(safePath(f.root, `runs/${f.previewRun}/drive-authoring`)), false)
  assert.ok(requestBefore.equals(fs.readFileSync(safePath(f.root, f.status.request.path))))
  assert.ok(
    previewBefore.equals(fs.readFileSync(safePath(f.root, f.status.private_preview.manifest.path))),
  )
  validateArguments(
    { run_id: f.request.run_id },
    publication.operations.delivery_status.inputSchema,
    f.ctx,
  )
  assert.throws(
    () =>
      validateArguments(
        { run_id: f.request.run_id, schedule_file: f.scheduleFile },
        publication.operations.delivery_status.inputSchema,
        f.ctx,
      ),
    /Unknown module field/,
  )
  assert.equal(publication.operations.delivery_status.readOnly, true)
  assert.equal(publication.operations.delivery_status.network, false)
  assert.equal(f.renders(), 1)
})

test("completed preview is consumed by prepare and release without renderer or generation checkpoint changes", async (t) => {
  const f = await completed(t)
  const statePath = `runs/${f.previewRun}/preview/state.json`,
    before = fs.readFileSync(safePath(f.root, statePath))
  const proof = f.inspect()
  assert.equal(proof.renderer_reexecuted, false)
  assert.equal(proof.generation.input_hash, sha256("past generator code"))
  assert.notEqual(proof.consumer.implementation_sha256, proof.generation.input_hash)
  const prepared = await prepareAuthoringTransfer(f.options)
  assert.equal(prepared.files, 1)
  assert.equal(prepared.preview_consumption.renderer_reexecuted, false)
  const planBefore = fs.readFileSync(safePath(f.root, prepared.plan_path))
  const reused = await prepareAuthoringTransfer(f.options)
  assert.equal(reused.changed, false)
  assert.ok(planBefore.equals(fs.readFileSync(safePath(f.root, prepared.plan_path))))
  // No human release is fabricated. Reaching the missing review proves release
  // consumed the completed preview instead of entering its old renderer path.
  await assert.rejects(
    authorizeAuthoringTransfer({
      ...f.options,
      reviewFile: path.join(f.root, "missing-review.json"),
      snapshotFile: path.join(f.root, "missing-snapshot.json"),
      observationFile: path.join(f.root, "missing-observation.json"),
    }),
    /ENOENT.*missing-review/,
  )
  assert.ok(before.equals(fs.readFileSync(safePath(f.root, statePath))))
  assert.equal(f.renders(), 1)
})

test("completed output tampering, stale approval and partial checkpoints cannot masquerade as completed reuse", async (t) => {
  const f = await completed(t)
  const manifest = readJSON(f.root, f.status.private_preview.manifest.path),
    output = `${manifest.workspace}/public/${manifest.public[0].path}`
  const before = fs.readFileSync(safePath(f.root, output))
  f.put(output, "tampered")
  assert.throws(f.inspect, /output bytes changed/)
  await assert.rejects(prepareAuthoringTransfer(f.options), /output bytes changed/)
  f.put(output, before)
  const approvalPath = "runs/writer/approved-article.json",
    approvalBytes = fs.readFileSync(safePath(f.root, approvalPath))
  const article = JSON.parse(approvalBytes)
  article.title = "Unreviewed title"
  f.put(approvalPath, article)
  assert.throws(f.inspect)
  f.put(approvalPath, approvalBytes)
  const state = readJSON(f.root, `runs/${f.previewRun}/preview/state.json`)
  state.stages.outputs.status = "failed"
  f.put(`runs/${f.previewRun}/preview/state.json`, state)
  assert.equal(f.inspect(), null)
  await assert.rejects(prepareAuthoringTransfer(f.options), /Run input changed/)
  assert.equal(f.renders(), 1)
})
