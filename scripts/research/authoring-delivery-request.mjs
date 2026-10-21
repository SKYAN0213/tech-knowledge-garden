import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { sha256 } from "./contracts.mjs"
import {
  atomicCreate,
  atomicWrite,
  readJSON,
  safePath,
  withLock,
  withGardenOperationLock,
} from "./run-state.mjs"
import { loadDailyPublicationSelection } from "./daily-publication-handoff.mjs"
import {
  authoringWriteSession,
  inspectAuthoringReleaseInputs,
  inspectAuthoringExecution,
  loadAuthoringWriteStatus,
  inspectedAuthoringRelease,
} from "./authoring-execution.mjs"
import { deliverAuthoringSession } from "./authoring-delivery.mjs"
import {
  publicationOperationStatus,
  assertPublicationAuthoringInputs,
  assertPublicationFallbackSelection,
  loadPublicationFallbacks,
  publicationFallbackHazards,
} from "./publication-operation.mjs"
import { inspectRemoteDelivery } from "./remote-delivery.mjs"
import { checkedEdition } from "./event-pipeline.mjs"
import { loadShadowHandoffBasis } from "./shadow-collection-basis.mjs"
import { seoulPublicationDay } from "./dates.mjs"
import { loadPreviewPublicationInputs, privatePreview } from "./preview.mjs"

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const validID = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(id)
const hash = (value) => /^[a-f0-9]{64}$/.test(value || "")
const base = (run) => {
  if (!validID(run)) throw Error("Exact publication delivery run required")
  return `runs/${run}/publication-delivery`
}
const bytes = (ctx, relative) => fs.readFileSync(safePath(ctx.root, relative))
const reference = (ctx, relative) => ({ path: relative, sha256: sha256(bytes(ctx, relative)) })
const pinned = (ctx, ref) => {
  if (!ref || !hash(ref.sha256) || sha256(bytes(ctx, ref.path)) !== ref.sha256)
    throw Error("Publication delivery evidence changed")
  return JSON.parse(bytes(ctx, ref.path))
}
const install = (ctx, relative, value) => {
  const data = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value, null, 2) + "\n")
  if (!fs.existsSync(safePath(ctx.root, relative))) atomicCreate(ctx.root, relative, data)
  else if (!bytes(ctx, relative).equals(data)) throw Error("Immutable delivery input changed")
  return reference(ctx, relative)
}
const sameSet = (a, b) =>
  Array.isArray(a) &&
  Array.isArray(b) &&
  new Set(a).size === a.length &&
  new Set(b).size === b.length &&
  same([...a].sort(), [...b].sort())
const requestEvents = (ctx, input) =>
  input.approved_runs.map((run) => readJSON(ctx.root, `runs/${run}/approved-article.json`).event_id)

// This is an attributed capture of the existing scheduler execution, not a
// new schedule or a claim inferred from an edition's nominal 08:00 timestamp.
export function loadScheduledPublicationInputs(ctx, input, selection, { notAfter } = {}) {
  if (selection?.schema !== "research-daily-publication-handoff/v3")
    throw Error("Scheduled delivery requires the exact native event handoff")
  const invocation = pinned(ctx, input.invocation)
  const started = Date.parse(invocation.started_at)
  const end = notAfter === undefined ? Date.now() : Date.parse(notAfter)
  if (
    invocation.schema !== "research-scheduled-invocation/v1" ||
    invocation.kind !== "scheduled" ||
    invocation.schedule_id !== "tech-ai-briefing-08" ||
    !validID(invocation.execution_id) ||
    !invocation.reason?.trim() ||
    !Number.isFinite(started) ||
    !(end >= started) ||
    !hash(invocation.evidence?.sha256) ||
    !bytes(ctx, invocation.evidence.path).length ||
    sha256(bytes(ctx, invocation.evidence.path)) !== invocation.evidence.sha256
  )
    throw Error("Exact attributed 08:00 scheduled invocation capture required")
  const basis = loadShadowHandoffBasis(ctx.root, input.collection_basis)
  const plan = pinned(ctx, basis.plan)
  const summary = pinned(ctx, basis.summary)
  const receipts = pinned(ctx, basis.receipts)
  const { edition, report } = checkedEdition(ctx, selection.edition)
  const matches = (ref, refs) =>
    refs?.some((row) => row.path === ref.path && row.sha256 === ref.sha256)
  if (
    edition.daily_run !== basis.daily_run ||
    report.daily_run !== basis.daily_run ||
    !matches(input.collection_basis, report.evidence) ||
    !matches(basis.acquisition_inputs, report.evidence) ||
    !matches(basis.plan, report.evidence) ||
    !matches(
      { path: `daily/runs/${basis.daily_run}/summary.json`, sha256: basis.summary.sha256 },
      report.evidence,
    ) ||
    plan.kst_day !== seoulPublicationDay(invocation.started_at) ||
    !Number.isFinite(Date.parse(plan.created_at)) ||
    Date.parse(plan.created_at) < started ||
    Date.parse(plan.created_at) > end ||
    receipts.some(
      (row) =>
        !Number.isFinite(Date.parse(row.started_at)) ||
        !Number.isFinite(Date.parse(row.finished_at)) ||
        Date.parse(row.started_at) < started ||
        Date.parse(row.finished_at) < Date.parse(row.started_at) ||
        Date.parse(row.finished_at) > end,
    )
  )
    throw Error("Native handoff must belong to this scheduled collection and frozen basis")
  // The report records the then-live summary path. Its exact bytes are already
  // retained in this handoff basis; a later handoff must not erase this evidence.
  for (const article of selection.approved_runs)
    for (const source of article.source_revisions)
      if (
        !report.materials.some(
          (material) =>
            material.source_version_id === source.source_version_id &&
            material.parse_id === source.parse_id &&
            material.observations.some(
              (observation) =>
                Date.parse(observation.observed_at) >= started &&
                Date.parse(observation.observed_at) <= end,
            ),
        )
      )
        throw Error("Scheduled native article requires exact material observed in this execution")
  return { invocation, basis, plan, summary, receipts, edition, report }
}

function loadRequest(ctx, run) {
  const input = readJSON(ctx.root, base(run) + "/input.json")
  if (
    input?.schema !== "research-publication-delivery-input/v1" ||
    input.run_id !== run ||
    input.repository !== fs.realpathSync(ctx.repo) ||
    input.vault !== path.resolve(ctx.vault)
  )
    throw Error("Pinned publication delivery request required")
  pinned(ctx, input.handoff)
  const selection = loadDailyPublicationSelection(ctx.root, input.handoff.path, {
    vault: ctx.vault,
  })
  if (
    !same(input.approved_runs, selection.approvedRuns) ||
    !same(input.knowledge_runs, selection.knowledgeRuns || [])
  )
    throw Error("Delivery request differs from native approval selection")
  if (Boolean(input.invocation) !== Boolean(input.collection_basis))
    throw Error("Scheduled invocation and collection basis must be pinned together")
  if (input.invocation) loadScheduledPublicationInputs(ctx, input, selection.selection)
  return input
}

function previewOptions(ctx, p) {
  if (Boolean(p.edition_spec_path) !== Boolean(p.edition_spec_sha256))
    throw Error("Private edition specification requires exact path/SHA together")
  if (!p.preview_run_id) {
    if (p.edition_spec_path) throw Error("Edition specification requires a private preview run")
    return null
  }
  if (!validID(p.preview_run_id) || p.preview_run_id === p.run_id)
    throw Error("Distinct exact private preview run required")
  const edition_spec = p.edition_spec_path
    ? { path: p.edition_spec_path, sha256: p.edition_spec_sha256 }
    : null
  const editionSpec = edition_spec ? pinned(ctx, edition_spec) : null
  if (
    edition_spec &&
    (editionSpec?.schema !== "research-private-edition/v1" ||
      !["private_slice", "historical_backfill"].includes(editionSpec.intent))
  )
    throw Error("Exact native private edition specification required")
  return { edition_spec, editionSpec }
}

function previewInput(ctx, input, previewRun, options) {
  const selected = loadPreviewPublicationInputs(ctx.root, previewRun, [], {
    vault: ctx.vault,
    publicationHandoff: input.handoff.path,
    editionSpec: options.editionSpec,
  })
  return {
    schema: "research-publication-private-preview-input/v1",
    run_id: input.run_id,
    request: reference(ctx, base(input.run_id) + "/input.json"),
    handoff: input.handoff,
    preview_run_id: previewRun,
    approved_runs: input.approved_runs,
    knowledge_runs: input.knowledge_runs,
    approval_basis: {
      articles: selected.approvals.map(({ run, files }) => ({ run_id: run, files })),
      knowledge: selected.knowledge.map(({ run, files }) => ({ run_id: run, files })),
    },
    ...(options.edition_spec ? { edition_spec: options.edition_spec } : {}),
  }
}

function verifyRequestPreview(ctx, input, spec, ref) {
  const manifest = pinned(ctx, ref)
  if (
    ref.path !== `runs/${spec.preview_run_id}/preview-manifest.json` ||
    manifest.schema !== "private-reader-preview/v1" ||
    manifest.run_id !== spec.preview_run_id ||
    manifest.workspace !== `runs/${spec.preview_run_id}/preview-workspace` ||
    manifest.daily_editorial_handoff?.path !== input.handoff.path ||
    manifest.daily_editorial_handoff?.sha256 !== input.handoff.sha256 ||
    !sameSet(manifest.approved_runs, input.approved_runs) ||
    !sameSet(manifest.knowledge_runs, input.knowledge_runs) ||
    !sameSet(
      manifest.consistency?.articles?.map((row) => row.event_id),
      requestEvents(ctx, input),
    ) ||
    manifest.candidate_published !== false ||
    manifest.drive_verified !== false ||
    !same(manifest.edition_spec || null, spec.edition_spec ? pinned(ctx, spec.edition_spec) : null)
  )
    throw Error("Private preview must cover the exact delivery request and native approvals")
  for (const [directory, rows, required] of [
    [
      "vault",
      [
        ...(manifest.editions || []),
        ...(manifest.knowledge || []),
        ...(manifest.navigation ? [manifest.navigation] : []),
      ],
      true,
    ],
    ["public", manifest.public, true],
    ["digest", manifest.digest, true],
  ]) {
    if (
      !Array.isArray(rows) ||
      (required && !rows.length) ||
      new Set(rows.map((row) => row.path)).size !== rows.length
    )
      throw Error("Exact private preview authoring and reader outputs required")
    for (const row of rows) {
      if (
        !hash(row.sha256) ||
        sha256(
          fs.readFileSync(
            safePath(safePath(ctx.root, manifest.workspace) + "/" + directory, row.path),
          ),
        ) !== row.sha256
      )
        throw Error("Private preview output bytes changed")
    }
  }
  return manifest
}

function previewPreparationStatus(ctx, input) {
  const directory = base(input.run_id) + "/private-preview"
  const spec = readJSON(ctx.root, directory + "/input.json")
  if (!spec) return { status: "preview_required", manifest: null }
  if (
    spec.schema !== "research-publication-private-preview-input/v1" ||
    spec.run_id !== input.run_id ||
    !same(spec.request, reference(ctx, base(input.run_id) + "/input.json")) ||
    !same(spec.handoff, input.handoff)
  )
    throw Error("Private preview request binding changed")
  const state = readJSON(ctx.root, directory + "/state.json")
  if (state && state.input_sha256 !== sha256(bytes(ctx, directory + "/input.json")))
    throw Error("Private preview preparation checkpoint changed")
  const result = readJSON(ctx.root, directory + "/result.json")
  let manifest = null
  if (result) {
    if (
      result.schema !== "research-publication-private-preview/v1" ||
      !same(result.input, reference(ctx, directory + "/input.json")) ||
      !same(result.request, spec.request)
    )
      throw Error("Private preview preparation result changed")
    manifest = verifyRequestPreview(ctx, input, spec, result.preview)
  }
  return {
    status: manifest
      ? "ready_for_explicit_review"
      : state?.status === "failed"
        ? "preview_failed"
        : "preview_pending",
    input: reference(ctx, directory + "/input.json"),
    preview_run_id: spec.preview_run_id,
    approval_basis: spec.approval_basis,
    manifest: result?.preview || null,
    ...(state?.status === "failed" ? { failure: state.error } : {}),
    ...(manifest
      ? {
          exact_outputs_verified: true,
          outputs: {
            editions: manifest.editions.length,
            knowledge_notes: manifest.knowledge.length,
            public_files: manifest.public.length,
            digest_files: manifest.digest.length,
          },
        }
      : {}),
    release_approved: false,
    candidate_published: false,
    drive_verified: false,
    public_verified: false,
    next_action:
      "Read the pinned private outputs; supply a separately approved release or an explicit fallback review with the existing approved legacy release/preview and fresh raw Drive proof",
  }
}

async function prepareRequestPreview(ctx, input, p, options, previewRunner) {
  const directory = base(input.run_id) + "/private-preview"
  const spec = previewInput(ctx, input, p.preview_run_id, options)
  const previous = readJSON(ctx.root, directory + "/input.json")
  if (previous && !same(previous, spec)) throw Error("Pinned private preview selection changed")
  const manifestPath = `runs/${p.preview_run_id}/preview-manifest.json`
  if (!previous && readJSON(ctx.root, manifestPath))
    throw Error("Private preview run already belongs to another preparation")
  const inputRef = install(ctx, directory + "/input.json", spec)
  if (readJSON(ctx.root, directory + "/result.json")) {
    previewPreparationStatus(ctx, input)
    return { reused: true }
  }
  const state = {
    input_sha256: inputRef.sha256,
    status: "running",
    started_at: new Date().toISOString(),
  }
  atomicWrite(ctx.root, directory + "/state.json", state)
  try {
    // An interrupted binding can reuse the completed exact native manifest.
    if (!readJSON(ctx.root, manifestPath))
      await previewRunner(ctx.root, p.preview_run_id, [], {
        repo: ctx.repo,
        vault: ctx.vault,
        publicationHandoff: input.handoff.path,
        editionSpec: options.editionSpec,
      })
    if (!same(spec, previewInput(ctx, loadRequest(ctx, input.run_id), p.preview_run_id, options)))
      throw Error("Native preview authority changed during preparation")
    const preview = reference(ctx, manifestPath)
    verifyRequestPreview(ctx, input, spec, preview)
    install(ctx, directory + "/result.json", {
      schema: "research-publication-private-preview/v1",
      input: inputRef,
      request: spec.request,
      preview,
      candidate_published: false,
      drive_verified: false,
      public_verified: false,
      approval_granted: false,
    })
    atomicWrite(ctx.root, directory + "/state.json", {
      ...state,
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    return { reused: false }
  } catch (error) {
    atomicWrite(ctx.root, directory + "/state.json", {
      ...state,
      status: "failed",
      failed_at: new Date().toISOString(),
      error: error.message,
    })
    throw error
  }
}

// This request conveys approval references. It grants no release or remote success.
export async function requestPublicationDelivery(ctx, p, { previewRunner = privatePreview } = {}) {
  const preview = previewOptions(ctx, p)
  const directory = base(p.run_id)
  const handoff = { path: p.handoff_path, sha256: p.handoff_sha256 }
  pinned(ctx, handoff)
  const selection = loadDailyPublicationSelection(ctx.root, handoff.path, { vault: ctx.vault })
  const scheduleKeys = [
    "invocation_path",
    "invocation_sha256",
    "collection_basis_path",
    "collection_basis_sha256",
  ]
  if (scheduleKeys.some((key) => p[key] !== undefined) && scheduleKeys.some((key) => !p[key]))
    throw Error("Both scheduled invocation and frozen collection basis require exact path/SHA")
  const input = {
    schema: "research-publication-delivery-input/v1",
    run_id: p.run_id,
    repository: fs.realpathSync(ctx.repo),
    vault: path.resolve(ctx.vault),
    handoff,
    approved_runs: selection.approvedRuns,
    knowledge_runs: selection.knowledgeRuns || [],
    ...(p.invocation_path
      ? {
          invocation: { path: p.invocation_path, sha256: p.invocation_sha256 },
          collection_basis: { path: p.collection_basis_path, sha256: p.collection_basis_sha256 },
        }
      : {}),
  }
  if (input.invocation) loadScheduledPublicationInputs(ctx, input, selection.selection)
  return withLock(ctx.root, "publication-delivery-request-" + p.run_id, () =>
    withGardenOperationLock(ctx.root, async () => {
      const previous = readJSON(ctx.root, directory + "/input.json")
      if (previous && !same(previous, input))
        throw Error("Delivery selection changed; use a new run")
      if (!previous)
        assertPublicationFallbackSelection({
          root: ctx.root,
          run: p.run_id,
          events: requestEvents(ctx, input),
        })
      install(ctx, directory + "/input.json", input)
      const prepared = preview
        ? await prepareRequestPreview(ctx, input, p, preview, previewRunner)
        : null
      return {
        ...publicationDeliveryStatus(ctx, p),
        reused: Boolean(previous),
        ...(prepared ? { preview_reused: prepared.reused } : {}),
      }
    }),
  )
}

function loadBinding(ctx, input, releaseRef) {
  pinned(ctx, releaseRef)
  const local = inspectAuthoringReleaseInputs(ctx.root, releaseRef.path)
  const previewPath = `runs/${local.release.preview_run}/preview-manifest.json`
  const preview = readJSON(ctx.root, previewPath)
  const requiredEvents = input.approved_runs.map(
    (run) => readJSON(ctx.root, `runs/${run}/approved-article.json`).event_id,
  )
  if (
    local.release_sha256 !== releaseRef.sha256 ||
    preview?.schema !== "private-reader-preview/v1" ||
    preview.run_id !== local.release.preview_run ||
    preview.daily_editorial_handoff?.path !== input.handoff.path ||
    preview.daily_editorial_handoff?.sha256 !== input.handoff.sha256 ||
    !sameSet(preview.approved_runs, input.approved_runs) ||
    !Array.isArray(preview.knowledge_runs) ||
    !input.knowledge_runs.every((run) => preview.knowledge_runs.includes(run)) ||
    !sameSet(
      preview.consistency?.articles?.map((a) => a.event_id),
      requiredEvents,
    ) ||
    !sameSet(local.release.reviewed_event_ids, requiredEvents)
  )
    throw Error("Approved release must cover the exact handoff and required knowledge")
  const binding = {
    schema: "research-publication-delivery-binding/v1",
    request_sha256: sha256(JSON.stringify(input)),
    release: releaseRef,
    preview: reference(ctx, previewPath),
  }
  const previous = readJSON(ctx.root, base(input.run_id) + "/binding.json")
  if (previous && !same(previous, binding)) throw Error("Pinned delivery release changed")
  return binding
}

const alive = (pid) => {
  if (!Number.isSafeInteger(pid) || pid < 1) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error.code !== "ESRCH") throw error
    return false
  }
}
function executionBase(run, execution) {
  if (!validID(execution)) throw Error("Exact delivery execution ID required")
  return base(run) + "/executions/" + execution
}

function exactStorageRequestHydrated(ctx, request) {
  if (
    request?.schema !== "research-storage-download-request/v1" ||
    typeof request.root !== "string" ||
    !path.isAbsolute(request.root) ||
    !Array.isArray(request.requests) ||
    !request.requests.length ||
    request.request_count !== request.requests.length
  )
    return false
  try {
    const localRoot = fs.realpathSync(path.resolve(ctx.repo, ".local"))
    const storageRoot = fs.realpathSync(request.root)
    const relativeRoot = path.relative(localRoot, storageRoot)
    if (
      relativeRoot === ".." ||
      relativeRoot.startsWith(".." + path.sep) ||
      path.isAbsolute(relativeRoot)
    )
      return false
    return request.requests.every((row) => {
      if (
        typeof row.path !== "string" ||
        path.isAbsolute(row.path) ||
        !/^[a-f0-9]{64}$/.test(row.sha256 || "") ||
        !Number.isSafeInteger(row.bytes) ||
        row.bytes < 0
      )
        return false
      const file = fs.readFileSync(safePath(storageRoot, row.path))
      return file.length === row.bytes && sha256(file) === row.sha256
    })
  } catch {
    return false
  }
}

function loadExecution(ctx, input, execution) {
  const directory = executionBase(input.run_id, execution)
  const spec = readJSON(ctx.root, directory + "/input.json")
  const state = readJSON(ctx.root, directory + "/state.json")
  if (
    spec?.schema !== "research-publication-delivery-execution-input/v1" ||
    spec.execution_id !== execution ||
    spec.run_id !== input.run_id ||
    spec.request_sha256 !== sha256(JSON.stringify(input)) ||
    spec.binding_sha256 !==
      sha256(JSON.stringify(readJSON(ctx.root, base(input.run_id) + "/binding.json"))) ||
    !state ||
    state.input_sha256 !== sha256(JSON.stringify(spec)) ||
    !["running", "waiting_for_storage", "completed", "failed"].includes(state.state)
  )
    throw Error("Delivery execution checkpoint changed")
  return { directory, spec, state }
}

export function publicationDeliveryStatus(ctx, { run_id }) {
  const directory = base(run_id)
  if (!readJSON(ctx.root, directory + "/input.json"))
    return { run_id, status: "request_pending", drive_verified: false, public_verified: false }
  const input = loadRequest(ctx, run_id)
  const binding = readJSON(ctx.root, directory + "/binding.json")
  if (binding && !same(loadBinding(ctx, input, binding.release), binding))
    throw Error("Delivery binding changed")
  const latest = readJSON(ctx.root, directory + "/latest.json")
  const execution = latest ? loadExecution(ctx, input, latest.execution_id) : null
  if (execution && latest.input_sha256 !== sha256(JSON.stringify(execution.spec)))
    throw Error("Latest delivery execution changed")
  const state = execution?.state
  if (state?.result) pinned(ctx, state.result)
  const pending = state?.pending_event ? pinned(ctx, state.pending_event) : null
  let authoring = null
  if (binding) {
    // Existing verifier distinguishes complete, pending/conflicting and unknown writes.
    const writer = loadAuthoringWriteStatus(ctx.root)
    if (writer.status === "invalid") throw Error(writer.reason)
    const proof = inspectAuthoringExecution(ctx.root, binding.release.path)
    authoring = {
      status: writer.unresolved
        ? "write_outcome_unknown"
        : proof.execution?.status || "readback_required",
      drive_verified: !writer.unresolved && proof.execution?.drive_verified === true,
      execution: proof.execution_path ? reference(ctx, proof.execution_path) : null,
      counts: proof.execution?.counts || null,
      ...(writer.unresolved ? { writes: writer } : {}),
    }
  }
  const publication = fs.existsSync(
    safePath(ctx.root, `runs/${run_id}/publication-operation/input.json`),
  )
    ? publicationOperationStatus({ root: ctx.root, run: run_id, repository: ctx.repo })
    : null
  const remote = inspectRemoteDelivery(ctx.root, run_id)
  const running = state?.state === "running" && alive(state.pid)
  const fallback = loadPublicationFallbacks(ctx.root).find((row) => row.native_run === run_id)
  return {
    run_id,
    status: running
      ? pending
        ? "connector_input_required"
        : "running"
      : state?.state === "running"
        ? "interrupted"
        : publication?.status || state?.native_status || "release_required",
    request: reference(ctx, directory + "/input.json"),
    handoff: input.handoff,
    ...(input.invocation
      ? { invocation: input.invocation, collection_basis: input.collection_basis }
      : {}),
    approved_runs: input.approved_runs,
    knowledge_runs: input.knowledge_runs,
    private_preview: previewPreparationStatus(ctx, input),
    binding: binding ? reference(ctx, directory + "/binding.json") : null,
    execution: state
      ? { execution_id: latest.execution_id, ...state, worker_alive: running }
      : null,
    pending_request: running ? pending : null,
    interrupted_request: !running && pending ? pending : null,
    authoring,
    publication,
    remote_delivery: remote,
    drive_verified: Boolean(publication || authoring?.drive_verified),
    public_verified: publication?.status === "public_bytes_verified",
    website_data_verified: remote?.website_data_verified === true,
    source_archive_verified: remote?.source_archive_verified === true,
    remote_current_verified: false,
    new_regular_operation_counted: false,
    ...(fallback
      ? {
          fallback: {
            status: fallback.status,
            legacy_run: fallback.legacy_run,
            receipt: fallback.receipt,
            native_reentry_allowed: false,
          },
        }
      : {}),
  }
}

// This chooses a previously approved path; it grants no approval, restores no
// remote bytes and never turns an unresolved mutation into permission to retry.
export async function selectLegacyPublicationFallback(ctx, p, { now = Date.now } = {}) {
  const input = loadRequest(ctx, p.run_id)
  const reviewRef = { path: p.review_path, sha256: p.review_sha256 }
  const review = pinned(ctx, reviewRef)
  const nativeRef = reference(ctx, base(p.run_id) + "/input.json")
  if (
    review.schema !== "research-publication-fallback-review/v1" ||
    !["human", "codex"].includes(review.reviewer_kind) ||
    !review.reviewer?.trim() ||
    !review.reason?.trim() ||
    !Number.isFinite(Date.parse(review.reviewed_at)) ||
    Date.parse(review.reviewed_at) > now() ||
    !same(review.native_request, nativeRef) ||
    (review.legacy_run && (!validID(review.legacy_run) || review.legacy_run === p.run_id))
  )
    throw Error("Attributed exact legacy fallback review required")
  const missing = []
  if (!review.native_preview) missing.push({ reason: "native_private_preview_required" })
  if (!review.legacy_run || !review.legacy_release || !review.legacy_preview)
    missing.push({ reason: "approved_legacy_path_required" })
  if (missing.length)
    return withLock(ctx.root, "publication-delivery-execute-" + p.run_id, () =>
      withGardenOperationLock(ctx.root, () => {
        loadRequest(ctx, p.run_id)
        pinned(ctx, reviewRef)
        const value = {
          schema: "research-publication-fallback/v1",
          status: "fallback_blocked",
          native_run: p.run_id,
          review: reviewRef,
          native_request: nativeRef,
          native_handoff: input.handoff,
          legacy_run: null,
          legacy_release: null,
          legacy_preview: null,
          legacy_execution: null,
          native_status: publicationDeliveryStatus(ctx, { run_id: p.run_id }).status,
          blockers: missing,
          observed_at: new Date(now()).toISOString(),
          approval_granted: false,
          candidate_published: false,
          publication_performed: false,
          operational_rollback_verified: false,
          new_regular_operation_counted: false,
        }
        const relative = base(p.run_id) + "/fallback-attempts/" + reviewRef.sha256 + ".json"
        const prior = readJSON(ctx.root, relative)
        if (prior) return { ...prior, receipt: reference(ctx, relative), reused: true }
        return { ...value, receipt: install(ctx, relative, value), reused: false }
      }),
    )
  const native = pinned(ctx, review.native_preview)
  const legacy = pinned(ctx, review.legacy_preview)
  const local = inspectAuthoringReleaseInputs(ctx.root, review.legacy_release.path)
  const editionPaths = [...(native.editions || []).map((row) => row.path)].sort()
  const events = [...requestEvents(ctx, input)].sort()
  if (
    native.schema !== "private-reader-preview/v1" ||
    native.candidate_published !== false ||
    review.native_preview.path !== `runs/${native.run_id}/preview-manifest.json` ||
    !sameSet(native.approved_runs, input.approved_runs) ||
    native.daily_editorial_handoff?.path !== input.handoff.path ||
    native.daily_editorial_handoff?.sha256 !== input.handoff.sha256 ||
    !Array.isArray(native.knowledge_runs) ||
    !input.knowledge_runs.every((run) => native.knowledge_runs.includes(run)) ||
    !events.every((event) =>
      (native.consistency?.articles || []).some((row) => row.event_id === event),
    ) ||
    legacy.schema !== "private-reader-preview/v1" ||
    legacy.run_id === native.run_id ||
    legacy.run_id !== local.release.preview_run ||
    review.legacy_preview.path !== `runs/${local.release.preview_run}/preview-manifest.json` ||
    local.release_sha256 !== review.legacy_release.sha256 ||
    !editionPaths.length ||
    new Set(editionPaths).size !== editionPaths.length ||
    editionPaths.some((name) => !/^Editions\/\d{4}\/\d{2}\/[^/]+\.md$/.test(name)) ||
    !sameSet(
      editionPaths,
      (legacy.editions || []).map((row) => row.path),
    )
  )
    throw Error("Exact same-issue private native and approved legacy preview/release required")
  assertPublicationAuthoringInputs(legacy, local.release)
  return withLock(ctx.root, "publication-delivery-execute-" + p.run_id, () =>
    withGardenOperationLock(ctx.root, () => {
      // Revalidate after obtaining the same locks as the native mutation path.
      loadRequest(ctx, p.run_id)
      for (const ref of [
        reviewRef,
        nativeRef,
        review.native_preview,
        review.legacy_preview,
        review.legacy_release,
      ])
        pinned(ctx, ref)
      const previous = loadPublicationFallbacks(ctx.root).filter(
        (row) =>
          row.native_run === p.run_id ||
          row.edition_paths.some((name) => editionPaths.includes(name)) ||
          row.native_event_ids.some((event) => events.includes(event)),
      )
      if (previous.length) {
        if (previous.length !== 1 || !same(previous[0].review, reviewRef))
          throw Error("Issue already has an explicit legacy fallback selection")
        return { ...previous[0], reused: true, new_regular_operation_counted: false }
      }
      const status = publicationDeliveryStatus(ctx, { run_id: p.run_id })
      const writer = loadAuthoringWriteStatus(ctx.root)
      if (writer.status === "invalid") throw Error(writer.reason)
      const blockers = publicationFallbackHazards(ctx.root, native, review.legacy_run)
      const legacyOperation = readJSON(
        ctx.root,
        `runs/${review.legacy_run}/publication-operation/input.json`,
      )
      if (
        legacyOperation &&
        (!same(legacyOperation.release, review.legacy_release) ||
          !same(legacyOperation.preview, review.legacy_preview))
      )
        blockers.push({ reason: "legacy_operation_binding_mismatch" })
      if (status.execution?.worker_alive) blockers.push({ reason: "native_worker_running" })
      if (writer.unresolved)
        blockers.push({
          reason: "unresolved_authoring_write",
          writes: writer.entries.filter((row) => !row.resolved),
        })
      if (
        status.remote_delivery?.intent_id &&
        status.remote_delivery.status !== "remote_delivery_complete"
      )
        blockers.push({
          reason: "unresolved_remote_write",
          intent_id: status.remote_delivery.intent_id,
        })
      let proof
      try {
        proof = inspectedAuthoringRelease(ctx.root, review.legacy_release.path, {
          fresh: true,
          now: now(),
        })
      } catch (error) {
        blockers.push({ reason: "legacy_fresh_drive_readback_required", detail: error.message })
      }
      const nativeObserved = Date.parse(
        status.execution?.completed_at ||
          status.execution?.failed_at ||
          status.execution?.started_at ||
          "",
      )
      if (
        proof &&
        Number.isFinite(nativeObserved) &&
        Date.parse(proof.execution.observed_at) < nativeObserved
      )
        blockers.push({ reason: "legacy_readback_predates_native_execution" })
      const latest = readJSON(ctx.root, base(p.run_id) + "/latest.json")
      const checkpoint = latest
        ? reference(ctx, executionBase(p.run_id, latest.execution_id) + "/state.json")
        : null
      const executionsPath = base(p.run_id) + "/executions"
      const failures = fs.existsSync(safePath(ctx.root, executionsPath))
        ? fs
            .readdirSync(safePath(ctx.root, executionsPath))
            .sort()
            .flatMap((execution) => {
              const row = loadExecution(ctx, input, execution)
              return row.state.state === "failed"
                ? [reference(ctx, row.directory + "/state.json")]
                : []
            })
        : []
      const value = {
        schema: "research-publication-fallback/v1",
        status: blockers.length ? "fallback_blocked" : "legacy_selected",
        native_run: p.run_id,
        legacy_run: review.legacy_run,
        review: reviewRef,
        native_request: nativeRef,
        native_handoff: input.handoff,
        native_preview: review.native_preview,
        legacy_preview: review.legacy_preview,
        legacy_release: review.legacy_release,
        legacy_execution: proof ? reference(ctx, proof.execution_path) : null,
        native_checkpoint: checkpoint,
        native_failures: failures,
        native_status: status.status,
        edition_paths: editionPaths,
        native_event_ids: events,
        observed_at: new Date(now()).toISOString(),
        blockers,
        candidate_published: false,
        publication_performed: false,
        operational_rollback_verified: false,
        new_regular_operation_counted: false,
      }
      const attemptPath = base(p.run_id) + "/fallback-attempts/" + reviewRef.sha256 + ".json"
      const priorAttempt = readJSON(ctx.root, attemptPath)
      if (priorAttempt) {
        if (priorAttempt.status !== value.status || !same(priorAttempt.blockers, value.blockers))
          throw Error("Fallback conditions changed; submit a new explicit review")
        return { ...priorAttempt, receipt: reference(ctx, attemptPath), reused: true }
      }
      if (blockers.length)
        return { ...value, receipt: install(ctx, attemptPath, value), reused: false }
      const selectedPath =
        "publication/fallbacks/" + sha256(JSON.stringify([editionPaths, events])) + ".json"
      const receipt = install(ctx, selectedPath, value)
      install(ctx, attemptPath, value)
      return { ...value, receipt, reused: false }
    }),
  )
}

// Connector responses are pinned acquisition references, never success booleans.
export async function submitPublicationDeliveryReceipt(ctx, p) {
  const input = loadRequest(ctx, p.run_id)
  const execution = loadExecution(ctx, input, p.execution_id)
  if (!hash(p.event_id)) throw Error("Exact connector event ID required")
  const eventPath = execution.directory + "/events/" + p.event_id + ".json"
  const event = pinned(ctx, reference(ctx, eventPath))
  const acquisition = { path: p.acquisition_path, sha256: p.acquisition_sha256 }
  pinned(ctx, acquisition)
  const response = {
    schema: "research-publication-delivery-connector-receipt/v1",
    event: reference(ctx, eventPath),
    acquisition,
  }
  const responsePath = execution.directory + "/receipts/" + p.event_id + ".json"
  return withLock(ctx.root, "publication-delivery-receipt-" + p.event_id, () => {
    const existing = readJSON(ctx.root, responsePath)
    const current = loadExecution(ctx, input, p.execution_id)
    if (existing && !same(existing, response)) throw Error("Connector response changed")
    if (
      !existing &&
      (event.type !== "connector_capture_required" ||
        event.execution_id !== p.execution_id ||
        event.run_id !== p.run_id ||
        current.state.state !== "running" ||
        !alive(current.state.pid) ||
        !same(current.state.pending_event, response.event) ||
        Date.parse(event.expires_at) < Date.now())
    )
      throw Error("A live matching connector capture request is required")
    const ref = install(ctx, responsePath, response)
    return {
      status: "receipt_submitted",
      receipt: ref,
      reused: Boolean(existing),
      drive_verified: false,
      public_verified: false,
      next_action: "Read delivery status after the native raw-byte verifier consumes this receipt",
    }
  })
}

// Dependencies are internal to tests; module callers cannot supply commands or transports.
export async function executePublicationDelivery(
  ctx,
  p,
  {
    now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    deliveryOptions = {},
    authoringWriter = authoringWriteSession,
  } = {},
) {
  const input = loadRequest(ctx, p.run_id)
  const waitMs = p.wait_ms ?? 300000
  if (!Number.isSafeInteger(waitMs) || waitMs < 1 || waitMs > 600000)
    throw Error("Connector wait must be bounded to 1..600000 ms")
  if (!["authoring", "publication"].includes(p.stage))
    throw Error("Explicit delivery stage required")
  if (
    p.stage === "authoring" &&
    (!p.acquisition_path ||
      p.source_snapshot_path ||
      p.source_readback_path ||
      p.retry_publish ||
      p.actions_run ||
      p.deployment_commit ||
      p.remote_plan_path ||
      p.remote_acquisition_path ||
      p.resume_remote_intent)
  )
    throw Error(
      "Authoring stage accepts only connector capture or explicit update/create-intent resumption",
    )
  if (
    p.connector_call_not_dispatched === true &&
    (p.stage !== "authoring" || !p.resume_intent || !p.acquisition_path)
  )
    throw Error("Create-intent resumption requires an exact authoring intent and fresh acquisition")
  if (p.stage === "publication" && (p.acquisition_path || p.resume_intent))
    throw Error("Publication stage requires an already verified authoring execution")
  if (Boolean(p.source_snapshot_path) !== Boolean(p.source_readback_path))
    throw Error("Exact source snapshot and readback must be supplied together")
  const release = { path: p.release_path, sha256: p.release_sha256 }
  const binding = loadBinding(ctx, input, release)
  const captures = {}
  for (const key of [
    "acquisition",
    "source_snapshot",
    "source_readback",
    "remote_plan",
    "remote_acquisition",
  ]) {
    if (Boolean(p[key + "_path"]) !== Boolean(p[key + "_sha256"]))
      throw Error("Both path and SHA required for " + key)
    if (p[key + "_path"]) {
      captures[key] = { path: p[key + "_path"], sha256: p[key + "_sha256"] }
      pinned(ctx, captures[key])
    }
  }
  const directory = executionBase(p.run_id, p.execution_id)
  const spec = {
    schema: "research-publication-delivery-execution-input/v1",
    run_id: p.run_id,
    execution_id: p.execution_id,
    request_sha256: sha256(JSON.stringify(input)),
    binding_sha256: sha256(JSON.stringify(binding)),
    stage: p.stage,
    wait_ms: waitMs,
    captures,
    ...(p.resume_intent ? { resume_intent: p.resume_intent } : {}),
    ...(p.connector_call_not_dispatched === true ? { connector_call_not_dispatched: true } : {}),
    ...(p.retry_publish ? { retry_publish: true } : {}),
    ...(p.actions_run ? { actions_run: p.actions_run } : {}),
    ...(p.deployment_commit ? { deployment_commit: p.deployment_commit } : {}),
    ...(p.resume_remote_intent ? { resume_remote_intent: p.resume_remote_intent } : {}),
  }
  return withLock(ctx.root, "publication-delivery-execute-" + p.run_id, async () => {
    assertPublicationFallbackSelection({
      root: ctx.root,
      run: p.run_id,
      events: requestEvents(ctx, input),
    })
    const previous = readJSON(ctx.root, directory + "/input.json")
    if (previous && !same(previous, spec))
      throw Error("Delivery execution input changed; use a new ID")
    let state
    if (previous) {
      const prior = loadExecution(ctx, input, p.execution_id)
      if (prior.state.state === "completed") {
        publicationDeliveryStatus(ctx, { run_id: p.run_id })
        return { ...pinned(ctx, prior.state.result), reused: true }
      }
      if (
        prior.state.state !== "waiting_for_storage" ||
        prior.state.pending_event ||
        !exactStorageRequestHydrated(ctx, prior.state.storage_request)
      )
        throw Error(
          "Interrupted or failed delivery needs a new explicit execution ID and native reconciliation",
        )
      state = {
        ...prior.state,
        state: "running",
        pid: process.pid,
        resumed_at: new Date(now()).toISOString(),
        storage_recoveries: [
          ...(prior.state.storage_recoveries || []),
          { request: prior.state.storage_request, hydrated_at: new Date(now()).toISOString() },
        ],
      }
      delete state.storage_request
      atomicWrite(ctx.root, directory + "/state.json", state)
    } else {
      install(ctx, base(p.run_id) + "/binding.json", binding)
      install(ctx, directory + "/input.json", spec)
      state = {
        input_sha256: sha256(JSON.stringify(spec)),
        state: "running",
        pid: process.pid,
        started_at: new Date(now()).toISOString(),
        pending_event: null,
      }
      atomicWrite(ctx.root, directory + "/state.json", state)
      atomicWrite(ctx.root, base(p.run_id) + "/latest.json", {
        execution_id: p.execution_id,
        input_sha256: state.input_sha256,
      })
    }
    const save = () => atomicWrite(ctx.root, directory + "/state.json", state)
    let lastIntent = null
    const emit = (event) => {
      if (["write_intent", "remote_write_intent", "remote_write_batch_intent"].includes(event.type))
        lastIntent = event
    }
    const nextCapture = async () => {
      if (!lastIntent) throw Error("Native connector intent required before receipt")
      const nativeDeadline = Date.parse(lastIntent.expires_at || lastIntent.valid_until || "")
      const deadline = Math.min(
        now() + waitMs,
        Number.isFinite(nativeDeadline) ? nativeDeadline : Infinity,
      )
      const event = {
        type: "connector_capture_required",
        run_id: p.run_id,
        execution_id: p.execution_id,
        event_id: sha256(crypto.randomUUID()),
        native_intent: lastIntent,
        expires_at: new Date(deadline).toISOString(),
      }
      state.pending_event = install(ctx, directory + "/events/" + event.event_id + ".json", event)
      save()
      while (state.state === "running" && now() < deadline) {
        const response = readJSON(ctx.root, directory + "/receipts/" + event.event_id + ".json")
        if (response) {
          if (!same(response.event, state.pending_event))
            throw Error("Connector event binding changed")
          pinned(ctx, response.acquisition)
          state.pending_event = null
          save()
          return safePath(ctx.root, response.acquisition.path)
        }
        await sleep(Math.min(100, Math.max(1, deadline - now())))
      }
      throw Error("Connector capture timed out; native write intent remains unresolved")
    }
    try {
      const native =
        p.stage === "authoring"
          ? await authoringWriter({
              root: ctx.root,
              releasePath: release.path,
              acquisitionFile: safePath(ctx.root, captures.acquisition.path),
              nextCapture,
              emit,
              waitMs,
              now,
              resumeIntent: p.resume_intent || null,
              connectorCallNotDispatched: p.connector_call_not_dispatched === true,
            })
          : await deliverAuthoringSession({
              ...deliveryOptions,
              root: ctx.root,
              sourceRoot: ctx.root,
              run: p.run_id,
              releasePath: release.path,
              repository: ctx.repo,
              snapshotFile: captures.source_snapshot
                ? safePath(ctx.root, captures.source_snapshot.path)
                : undefined,
              readbackFile: captures.source_readback
                ? safePath(ctx.root, captures.source_readback.path)
                : undefined,
              retryPublish: p.retry_publish === true,
              actionsRun: p.actions_run,
              deploymentCommit: p.deployment_commit,
              waitSeconds: 0,
              waitMs,
              now,
              emit,
              remotePlanFile: captures.remote_plan
                ? safePath(ctx.root, captures.remote_plan.path)
                : undefined,
              remoteAcquisitionFile: captures.remote_acquisition
                ? safePath(ctx.root, captures.remote_acquisition.path)
                : undefined,
              nextRemoteCapture: nextCapture,
              remoteEmit: emit,
              connectorWaitMs: waitMs,
              resumeRemoteIntent: p.resume_remote_intent || null,
            })
      state.state = "completed"
      state.native_status = native.status
      state.completed_at = new Date(now()).toISOString()
      state.pending_event = null
      state.result = install(ctx, directory + "/result.json", {
        run_id: p.run_id,
        execution_id: p.execution_id,
        stage: p.stage,
        status: native.status,
        native,
        reused: false,
        new_regular_operation_counted: false,
      })
      save()
      return pinned(ctx, state.result)
    } catch (error) {
      if (
        error?.code === "STORAGE_PENDING" &&
        error.storage_request &&
        !lastIntent &&
        !state.pending_event
      ) {
        state.state = "waiting_for_storage"
        state.native_status = "storage_pending"
        state.storage_request = error.storage_request
        state.storage_waiting_at = new Date(now()).toISOString()
      } else {
        state.state = "failed"
        state.native_status = "recovery_required"
        state.failed_at = new Date(now()).toISOString()
      }
      save()
      throw error
    }
  })
}
