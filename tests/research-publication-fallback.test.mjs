// Isolated native-contract tests. Raw fixtures and local selection receipts are
// never evidence of a real remote rollback, publication, or scheduled operation.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { deliveryFixture } from "./fixtures/publication-delivery.mjs"
import { readJSON, safePath } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import {
  compareAuthoringRemote,
  DRIVE_AUTHORING_ROOTS,
} from "../scripts/research/authoring-transfer.mjs"
import {
  reconcileAuthoringExecution,
  loadAuthoringWriteStatus,
} from "../scripts/research/authoring-execution.mjs"
import {
  requestPublicationDelivery,
  executePublicationDelivery,
  selectLegacyPublicationFallback,
  publicationDeliveryStatus,
} from "../scripts/research/authoring-delivery-request.mjs"
import {
  assertPublicationFallbackSelection,
  preparePublicationOperation,
} from "../scripts/research/publication-operation.mjs"
import { deliverAuthoringSession } from "../scripts/research/authoring-delivery.mjs"
import { deliverApprovedPublication } from "../scripts/research/delivery-run.mjs"
import { module as publication } from "../scripts/research/modules/publication.mjs"
import { validateArguments } from "../scripts/research/modules/contracts.mjs"

async function setup(t) {
  const f = await deliveryFixture(t)
  const issue = "Editions/2026/09/2026-09-28_0800_Tech_AI_Briefing.md"
  const nativePath = "runs/reader/preview-manifest.json"
  const native = readJSON(f.root, nativePath)
  const body = "# Approved legacy fixture\n"
  const publicationRepo = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "publication-fallback-")),
  )
  t.after(() => fs.rmSync(publicationRepo, { recursive: true, force: true }))
  for (const [file, content] of [
    [issue, body],
    ["Knowledge/fixture.md", "Approved test content\n"],
  ]) {
    const target = path.join(publicationRepo, "vault", file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
  }
  const guid = "https://fixture.invalid/briefings/2026/09/2026-09-28_0800_Tech_AI_Briefing"
  native.editions = [{ path: issue, sha256: sha256(body) }]
  native.candidate_published = false
  native.consistency.articles[0].appearances = [
    { html: guid + ".html", digest: "digest/2026/09/issue.md" },
  ]
  f.put(nativePath, native)
  const nativePlanPath = "runs/reader/drive-authoring/transfer-plan.json"
  const nativePlan = readJSON(f.root, nativePlanPath)
  nativePlan.preview_sha256 = f.ref(nativePath).sha256
  f.put(nativePlanPath, nativePlan)
  const oldRelease = readJSON(f.root, f.releasePath)
  const nativeHashes = {
    ...oldRelease.input_sha256,
    manifest: nativePlan.preview_sha256,
    plan: f.ref(nativePlanPath).sha256,
  }
  f.releasePath = f.put(
    `runs/reader/drive-authoring/releases/${sha256(JSON.stringify(nativeHashes))}.json`,
    { ...oldRelease, input_sha256: nativeHashes },
  )
  f.deliver = {
    ...f.deliver,
    release_path: f.releasePath,
    release_sha256: f.ref(f.releasePath).sha256,
  }
  const initial = await requestPublicationDelivery(f.ctx, f.request)
  const legacyPath = "runs/legacy-reader/preview-manifest.json"
  const rssPath = "runs/legacy-reader/private/briefing.xml"
  f.put(rssPath, `<rss><item><guid>${guid}</guid></item></rss>`)
  const legacy = {
    ...native,
    run_id: "legacy-reader",
    daily_editorial_handoff: undefined,
    public: [{ path: "briefing.xml", sha256: f.ref(rssPath).sha256 }],
  }
  f.put(legacyPath, legacy)
  const base = "runs/legacy-reader/drive-authoring"
  const plan = {
    schema: "research-authoring-transfer/v1",
    preview_run: "legacy-reader",
    preview_sha256: f.ref(legacyPath).sha256,
    destination_folder_id: "root",
    roots: DRIVE_AUTHORING_ROOTS,
    files: [
      {
        path: issue,
        operation: "update",
        previous_sha256: sha256("old"),
        sha256: sha256(body),
        bytes: Buffer.byteLength(body),
        staged_path: base + "/files/" + issue,
      },
    ],
  }
  f.put(base + "/transfer-plan.json", plan)
  f.put(plan.files[0].staged_path, body)
  const observation = {
    schema: "research-authoring-remote-observation/v1",
    root_folder_id: "root",
    observed_at: new Date(Date.now() - 1000).toISOString(),
    folders: [
      { path: "Editions/2026", id: "year", parent_id: DRIVE_AUTHORING_ROOTS.Editions },
      { path: "Editions/2026/09", id: "month", parent_id: "year" },
    ],
    listings: [
      {
        path: "Editions/2026/09",
        id: "month",
        complete: true,
        files: [
          {
            name: "2026-09-28_0800_Tech_AI_Briefing.md",
            id: "legacy-existing",
            parent_id: "month",
            modified_at: new Date(Date.now() - 3600000).toISOString(),
            sha256: sha256("old"),
          },
        ],
      },
    ],
  }
  const hashes = {
    plan: f.ref(base + "/transfer-plan.json").sha256,
    manifest: plan.preview_sha256,
    review: sha256("test-only legacy review"),
    snapshot: sha256("test-only snapshot"),
    observation: sha256("test-only observation"),
  }
  const release = {
    schema: "research-authoring-release/v1",
    preview_run: "legacy-reader",
    input_sha256: hashes,
    operations: compareAuthoringRemote(plan, observation).operations,
    release_approved: true,
    upload_allowed: true,
  }
  const legacyRelease = f.put(
    base + "/releases/" + sha256(JSON.stringify(hashes)) + ".json",
    release,
  )
  let sequence = 0
  async function refreshLegacy() {
    sequence++
    const observed = new Date().toISOString()
    const row = {
      ...observation,
      observed_at: observed,
      listings: [
        {
          ...observation.listings[0],
          files: [
            { ...observation.listings[0].files[0], modified_at: observed, sha256: sha256(body) },
          ],
        },
      ],
    }
    const raw = f.put(`legacy-captures/${sequence}/raw.md`, body)
    const readback = {
      schema: "research-authoring-readback/v1",
      observed_at: observed,
      files: [
        {
          path: issue,
          file_id: "legacy-existing",
          parent_id: "month",
          mime_type: "text/markdown",
          shared: false,
          modified_at: observed,
          raw_path: raw,
          bytes: Buffer.byteLength(body),
          sha256: sha256(body),
        },
      ],
    }
    return reconcileAuthoringExecution({
      root: f.root,
      releasePath: legacyRelease,
      observationFile: safePath(f.root, f.put(`legacy-captures/${sequence}/observation.json`, row)),
      readbackFile: safePath(f.root, f.put(`legacy-captures/${sequence}/readback.json`, readback)),
    })
  }
  function review(version, extra = {}) {
    const file = f.put(`fallback-review-${version}.json`, {
      schema: "research-publication-fallback-review/v1",
      reviewer_kind: "codex",
      reviewer: "fixture operator",
      reviewed_at: new Date().toISOString(),
      reason: `Test-only explicit recovery review ${version}`,
      native_request: initial.request,
      native_preview: f.ref(nativePath),
      legacy_run: "legacy",
      legacy_release: f.ref(legacyRelease),
      legacy_preview: f.ref(legacyPath),
      ...extra,
    })
    return { run_id: f.request.run_id, review_path: file, review_sha256: f.ref(file).sha256 }
  }
  return {
    ...f,
    issue,
    native,
    legacy,
    legacyPath,
    legacyRelease,
    publicationRepo,
    rssPath,
    initial,
    refreshLegacy,
    review,
  }
}

test("explicit fallback preserves native failures and exact legacy identity without repeating a mutation", async (t) => {
  const f = await setup(t)
  await assert.rejects(
    executePublicationDelivery(f.ctx, { ...f.deliver, wait_ms: 20 }),
    /outcome unknown/,
  )
  const failurePath = "runs/delivery/publication-delivery/executions/attempt/state.json"
  const failure = f.ref(failurePath)
  await f.refreshLegacy()
  const blocked = await selectLegacyPublicationFallback(f.ctx, f.review("unknown-authoring"))
  assert.equal(blocked.status, "fallback_blocked")
  assert.ok(blocked.blockers.some((row) => row.reason === "unresolved_authoring_write"))
  assert.equal(fs.existsSync(safePath(f.root, "publication/fallbacks")), false)
  const reconciled = await executePublicationDelivery(f.ctx, {
    ...f.deliver,
    execution_id: "reconcile",
    ...f.capture("captures/reconciled.json", true),
  })
  assert.equal(reconciled.native.recovered_intents.length, 1)
  assert.equal(reconciled.native.created_intents.length, 0)
  await f.refreshLegacy()
  const files = [
    failurePath,
    f.legacyPath,
    f.legacyRelease,
    f.rssPath,
    "runs/writer/approved-article.json",
  ]
  const before = files.map((file) => f.ref(file))
  const parameters = f.review("reconciled")
  const selected = await selectLegacyPublicationFallback(f.ctx, parameters)
  assert.equal(selected.status, "legacy_selected")
  assert.deepEqual(selected.native_failures, [failure])
  assert.equal(selected.operational_rollback_verified, false)
  assert.equal(selected.publication_performed, false)
  assert.equal((await selectLegacyPublicationFallback(f.ctx, parameters)).reused, true)
  assert.deepEqual(
    files.map((file) => f.ref(file)),
    before,
  )
  assert.equal(publicationDeliveryStatus(f.ctx, f.request).fallback.native_reentry_allowed, false)
  await assert.rejects(
    executePublicationDelivery(f.ctx, { ...f.deliver, execution_id: "new-code-new-execution" }),
    /fallback owns this issue/,
  )
  await assert.rejects(
    requestPublicationDelivery(f.ctx, { ...f.request, run_id: "new-fingerprint-new-request" }),
    /fallback owns this issue/,
  )
  assert.equal(
    fs.existsSync(
      safePath(f.root, "runs/new-fingerprint-new-request/publication-delivery/input.json"),
    ),
    false,
  )
  assert.throws(
    () =>
      assertPublicationFallbackSelection({
        root: f.root,
        run: "new-issue-alias",
        preview: {
          editions: [{ path: "Editions/2026/09/other.md" }],
          consistency: f.native.consistency,
        },
      }),
    /fallback owns this issue/,
  )
  await assert.rejects(
    preparePublicationOperation({
      root: f.root,
      run: "native-alias",
      releasePath: f.releasePath,
      repository: f.ctx.repo,
    }),
    /fallback owns this issue/,
  )
  let commands = 0
  await assert.rejects(
    deliverAuthoringSession({
      root: f.root,
      run: "native-alias",
      releasePath: f.releasePath,
      repository: f.ctx.repo,
    }),
    /fallback owns this issue/,
  )
  await assert.rejects(
    deliverApprovedPublication({
      root: f.root,
      run: "native-alias",
      releasePath: f.releasePath,
      repository: f.ctx.repo,
      execute: async () => {
        commands++
        return ""
      },
    }),
    /fallback owns this issue/,
  )
  assert.equal(commands, 0)
  const legacyInput = await preparePublicationOperation({
    root: f.root,
    run: "legacy",
    releasePath: f.legacyRelease,
    repository: f.publicationRepo,
  })
  assert.equal(legacyInput.preview.sha256, f.ref(f.legacyPath).sha256)
  assert.equal(fs.existsSync(safePath(f.root, "runs/legacy/delivery/publish-intent.json")), false)
  assert.equal(loadAuthoringWriteStatus(f.root).unresolved, 0)
  assert.deepEqual(
    files.map((file) => f.ref(file)),
    before,
  )
})

test("missing preparation, stale legacy evidence and unknown publication cannot authorize fallback", async (t) => {
  const f = await setup(t)
  const missing = await selectLegacyPublicationFallback(
    f.ctx,
    f.review("missing", {
      native_preview: null,
      legacy_run: null,
      legacy_release: null,
      legacy_preview: null,
    }),
  )
  assert.equal(missing.status, "fallback_blocked")
  assert.deepEqual(
    missing.blockers.map((row) => row.reason),
    ["native_private_preview_required", "approved_legacy_path_required"],
  )
  await f.refreshLegacy()
  const stale = await selectLegacyPublicationFallback(f.ctx, f.review("stale"), {
    now: () => Date.now() + 600001,
  })
  assert.equal(stale.status, "fallback_blocked")
  assert.ok(stale.blockers.some((row) => row.reason === "legacy_fresh_drive_readback_required"))
  await executePublicationDelivery(f.ctx, {
    ...f.deliver,
    execution_id: "already-applied",
    ...f.capture("captures/already-applied.json", true),
  })
  await preparePublicationOperation({
    root: f.root,
    run: "delivery",
    releasePath: f.releasePath,
    repository: f.publicationRepo,
  })
  f.put("runs/delivery/delivery/publish-intent.json", {
    input_sha256: sha256("test-only lost publisher response"),
    created_at: new Date().toISOString(),
  })
  await f.refreshLegacy()
  const unknown = await selectLegacyPublicationFallback(f.ctx, f.review("unknown-publisher"))
  assert.equal(unknown.status, "fallback_blocked")
  assert.ok(unknown.blockers.some((row) => row.reason === "publication_outcome_unknown"))
  assert.equal(fs.existsSync(safePath(f.root, "publication/fallbacks")), false)
  const invalid = f.review("wrong-pin")
  await assert.rejects(
    selectLegacyPublicationFallback(f.ctx, { ...invalid, review_sha256: "0".repeat(64) }),
    /evidence changed/,
  )
  assert.equal(publication.operations.fallback.network, false)
  assert.deepEqual(
    validateArguments(invalid, publication.operations.fallback.inputSchema, f.ctx),
    invalid,
  )
  assert.throws(() =>
    validateArguments(
      { ...invalid, approve: true },
      publication.operations.fallback.inputSchema,
      f.ctx,
    ),
  )
  assert.equal(publicationDeliveryStatus(f.ctx, f.request).public_verified, false)
})

test("known native Drive conflict can select only a subsequently verified exact legacy path", async (t) => {
  const f = await setup(t)
  const result = await executePublicationDelivery(f.ctx, {
    ...f.deliver,
    ...f.capture("captures/conflict.json", true, "unapproved native target edit"),
  })
  assert.equal(result.status, "conflict")
  assert.equal(loadAuthoringWriteStatus(f.root).unresolved, 0)
  const noRaw = await selectLegacyPublicationFallback(f.ctx, f.review("conflict-no-readback"))
  assert.equal(noRaw.status, "fallback_blocked")
  await f.refreshLegacy()
  const selected = await selectLegacyPublicationFallback(
    f.ctx,
    f.review("conflict-legacy-readback"),
  )
  assert.equal(selected.status, "legacy_selected")
  assert.equal(publicationDeliveryStatus(f.ctx, f.request).authoring.status, "conflict")
  assert.equal(selected.operational_rollback_verified, false)
})
