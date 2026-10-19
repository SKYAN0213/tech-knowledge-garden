import fs from "node:fs"
import { spawnSync } from "node:child_process"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { inspectedAuthoringRelease, inspectAuthoringReleaseInputs } from "./authoring-execution.mjs"
import { assertDeploymentProof, loadVerifiedPublicReadback } from "./public-readback.mjs"
import { assertArticleFreeLegacyPreview } from "./legacy-transition.mjs"
import { publicationContentPaths } from "../publication-state.mjs"

const id = (value) => {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(value || "")) throw Error("Publication operation ID required")
  return value
}
const directory = (run) => `runs/${id(run)}/publication-operation`
const bytes = (root, relative) => fs.readFileSync(safePath(root, relative))
const reference = (root, relative) => ({ path: relative, sha256: sha256(bytes(root, relative)) })
const pinned = (root, ref) => {
  if (!ref || sha256(bytes(root, ref.path)) !== ref.sha256)
    throw Error("Publication operation evidence changed")
  return JSON.parse(bytes(root, ref.path))
}
const gitBytes = (repository, args) => {
  const result = spawnSync("git", args, { cwd: repository, maxBuffer: 16 * 1024 * 1024 })
  if (result.status !== 0) throw Error("Cannot verify publication commit content")
  return result.stdout
}

const issuePaths = (preview) => (preview.editions || []).map((row) => row.path)
const eventIds = (preview) => (preview.consistency?.articles || []).map((row) => row.event_id)
const overlap = (a, b) => a.some((value) => b.includes(value))

export function loadPublicationFallbacks(root) {
  const relative = "publication/fallbacks"
  if (!fs.existsSync(safePath(root, relative))) return []
  return fs.readdirSync(safePath(root, relative)).map((name) => {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) throw Error("Invalid publication fallback receipt")
    const receipt = readJSON(root, relative + "/" + name)
    if (
      receipt?.schema !== "research-publication-fallback/v1" ||
      receipt.status !== "legacy_selected" ||
      receipt.candidate_published !== false ||
      !Array.isArray(receipt.edition_paths) ||
      !receipt.edition_paths.length ||
      !Array.isArray(receipt.native_event_ids) ||
      !receipt.native_event_ids.length ||
      receipt.native_run === receipt.legacy_run ||
      name !== sha256(JSON.stringify([receipt.edition_paths, receipt.native_event_ids])) + ".json"
    )
      throw Error("Invalid publication fallback selection")
    id(receipt.native_run)
    id(receipt.legacy_run)
    const review = pinned(root, receipt.review)
    const request = pinned(root, receipt.native_request)
    pinned(root, request.handoff)
    const native = pinned(root, receipt.native_preview)
    const legacy = pinned(root, receipt.legacy_preview)
    const release = inspectAuthoringReleaseInputs(root, receipt.legacy_release.path)
    const execution = pinned(root, receipt.legacy_execution)
    if (receipt.native_checkpoint) pinned(root, receipt.native_checkpoint)
    for (const failure of receipt.native_failures || []) pinned(root, failure)
    if (
      review.schema !== "research-publication-fallback-review/v1" ||
      !["human", "codex"].includes(review.reviewer_kind) ||
      !review.reviewer?.trim() ||
      !review.reason?.trim() ||
      !Number.isFinite(Date.parse(review.reviewed_at)) ||
      !Number.isFinite(Date.parse(receipt.observed_at)) ||
      Date.parse(review.reviewed_at) > Date.parse(receipt.observed_at) ||
      review.legacy_run !== receipt.legacy_run ||
      request.run_id !== receipt.native_run ||
      receipt.native_request.path !==
        `runs/${receipt.native_run}/publication-delivery/input.json` ||
      JSON.stringify(review.native_request) !== JSON.stringify(receipt.native_request) ||
      JSON.stringify(review.native_preview) !== JSON.stringify(receipt.native_preview) ||
      JSON.stringify(review.legacy_release) !== JSON.stringify(receipt.legacy_release) ||
      JSON.stringify(review.legacy_preview) !== JSON.stringify(receipt.legacy_preview) ||
      release.release_sha256 !== receipt.legacy_release.sha256 ||
      execution.release_sha256 !== receipt.legacy_release.sha256 ||
      execution.drive_verified !== true ||
      execution.counts?.pending !== 0 ||
      execution.counts?.conflict !== 0 ||
      receipt.legacy_preview.path !== `runs/${release.release.preview_run}/preview-manifest.json` ||
      native.candidate_published !== false ||
      JSON.stringify([...issuePaths(native)].sort()) !== JSON.stringify(receipt.edition_paths) ||
      JSON.stringify([...issuePaths(legacy)].sort()) !== JSON.stringify(receipt.edition_paths) ||
      !receipt.native_event_ids.every((value) => eventIds(native).includes(value))
    )
      throw Error("Publication fallback evidence changed")
    return { ...receipt, receipt: reference(root, relative + "/" + name) }
  })
}

// A fallback owns the original issue and events, not a worker ID or code hash.
// Only the already approved legacy bytes may proceed through normal Drive/publish gates.
export function assertPublicationFallbackSelection({
  root,
  run,
  preview,
  releasePath,
  events = [],
}) {
  for (const selected of loadPublicationFallbacks(root)) {
    if (
      run !== selected.native_run &&
      !overlap(issuePaths(preview || {}), selected.edition_paths) &&
      !overlap([...eventIds(preview || {}), ...events], selected.native_event_ids)
    )
      continue
    if (run !== selected.legacy_run)
      throw Error("Legacy fallback owns this issue; native re-entry or a new operation is blocked")
    if (
      !preview ||
      !releasePath ||
      selected.legacy_preview.path !== `runs/${preview.run_id}/preview-manifest.json` ||
      reference(root, selected.legacy_preview.path).sha256 !== selected.legacy_preview.sha256 ||
      selected.legacy_release.path !== releasePath ||
      reference(root, releasePath).sha256 !== selected.legacy_release.sha256
    )
      throw Error("Exact selected legacy preview and release required")
  }
}

export function publicationFallbackHazards(root, preview, legacyRun) {
  const runs = safePath(root, "runs"),
    hazards = []
  if (!fs.existsSync(runs)) return hazards
  for (const run of fs.readdirSync(runs)) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(run)) continue
    const request = readJSON(root, `runs/${run}/publication-delivery/input.json`)
    if (request) {
      const events = request.approved_runs.map(
        (writer) => readJSON(root, `runs/${writer}/approved-article.json`).event_id,
      )
      if (overlap(eventIds(preview), events)) {
        const latest = readJSON(root, `runs/${run}/publication-delivery/latest.json`)
        const state =
          latest &&
          readJSON(
            root,
            `runs/${run}/publication-delivery/executions/${latest.execution_id}/state.json`,
          )
        if (state?.state === "running") {
          try {
            process.kill(state.pid, 0)
            hazards.push({ run_id: run, reason: "native_worker_running" })
          } catch (error) {
            if (error.code !== "ESRCH") throw error
          }
        }
      }
    }
    const input = readJSON(root, directory(run) + "/input.json")
    if (!input) continue
    const candidate = pinned(root, input.preview)
    if (
      !overlap(issuePaths(preview), issuePaths(candidate)) &&
      !overlap(eventIds(preview), eventIds(candidate))
    )
      continue
    const intent = readJSON(root, `runs/${run}/delivery/publish-intent.json`)
    const push = readJSON(root, directory(run) + "/push.json")
    if (intent && !push) hazards.push({ run_id: run, reason: "publication_outcome_unknown" })
    else if (push && run !== legacyRun)
      hazards.push({
        run_id: run,
        reason: "native_publication_committed_requires_rollback_readback",
      })
  }
  return hazards
}

// Only an explicitly reviewed historical cleanup may publish without articles.
export function assertPublicationAuthoringInputs(manifest, release) {
  const authoring = [
    ...(manifest.editions || []),
    ...(manifest.knowledge || []),
    ...(manifest.navigation ? [manifest.navigation] : []),
  ]
  if (!authoring.length) throw Error("Approved reader authoring inputs required")
  if (manifest.consistency?.articles?.length) return authoring
  if (release.kind !== "retrospective") throw Error("Approved reader authoring inputs required")
  assertArticleFreeLegacyPreview(manifest)
  return authoring
}
function binding(root, run) {
  const input = readJSON(root, directory(run) + "/input.json")
  if (input?.schema !== "research-publication-operation-input/v1" || input.run_id !== run)
    throw Error("Pinned publication operation required")
  const release = pinned(root, input.release)
  pinned(root, input.preview)
  const execution = pinned(root, input.execution)
  const current = inspectedAuthoringRelease(root, input.release.path)
  if (
    release.preview_run !== input.preview_run ||
    current.release_sha256 !== input.release.sha256 ||
    execution.release_sha256 !== input.release.sha256 ||
    !execution.drive_verified ||
    current.execution.counts.pending ||
    current.execution.counts.conflict
  )
    throw Error("Publication operation differs from verified authoring")
  return { input, release, current }
}

export function assertPublicationDeploymentCommit({ root, run, repository, commit }) {
  repository = fs.realpathSync(repository)
  const { input } = binding(root, run)
  const push = readJSON(root, directory(run) + "/push.json")
  if (!push || !/^[a-f0-9]{40}$/.test(commit || ""))
    throw Error("Confirmed publication commit and exact deployment commit required")
  if (commit === push.commit) return commit
  const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", push.commit, commit], {
    cwd: repository,
    encoding: "utf8",
  })
  if (ancestry.error || ancestry.status !== 0)
    throw Error("Deployment commit must descend from the confirmed publication commit")
  const contentDiff = spawnSync(
    "git",
    ["diff", "--name-only", push.commit, commit, "--", ...publicationContentPaths],
    { cwd: repository, encoding: "utf8" },
  )
  if (contentDiff.error || contentDiff.status !== 0)
    throw Error("Cannot verify publication content on the deployment commit")
  if (contentDiff.stdout.trim()) throw Error("Deployment commit changes publication content")
  const preview = pinned(root, input.preview)
  for (const row of [
    ...preview.editions,
    ...preview.knowledge,
    ...(preview.navigation ? [preview.navigation] : []),
  ])
    if (sha256(gitBytes(repository, ["show", `${commit}:vault/${row.path}`])) !== row.sha256)
      throw Error("Deployment commit differs from the approved authoring bytes")
  return commit
}

// An operation connects existing proofs; it never grants editorial approval.
export async function preparePublicationOperation({
  root,
  run,
  releasePath,
  repository = process.cwd(),
  fresh = false,
  now = Date.now(),
}) {
  return withLock(root, "publication-operation-" + id(run), () => {
    const current = inspectedAuthoringRelease(root, releasePath, { fresh, now })
    const previewPath = `runs/${current.release.preview_run}/preview-manifest.json`
    const manifest = readJSON(root, previewPath)
    assertPublicationFallbackSelection({ root, run, preview: manifest, releasePath })
    const authoring = assertPublicationAuthoringInputs(manifest, current.release)
    for (const row of authoring)
      if (sha256(bytes(repository, "vault/" + row.path)) !== row.sha256)
        throw Error("Canonical authoring differs from the approved preview")
    const input = {
      schema: "research-publication-operation-input/v1",
      run_id: run,
      preview_run: current.release.preview_run,
      release: reference(root, releasePath),
      preview: reference(root, previewPath),
      execution: reference(root, current.execution_path),
    }
    const file = directory(run) + "/input.json",
      previous = readJSON(root, file)
    if (previous) {
      binding(root, run)
      // A newer exact readback does not invalidate the original verified proof.
      if (
        previous.release.sha256 !== input.release.sha256 ||
        previous.preview.sha256 !== input.preview.sha256
      )
        throw Error("Publication operation input changed; use a new operation")
      return previous
    }
    atomicCreate(root, file, input)
    return input
  })
}

export async function recordPublicationPush({ root, run, pushPath, repository = process.cwd() }) {
  return withLock(root, "publication-operation-" + id(run), () => {
    const { input, current } = binding(root, run),
      push = readJSON(root, pushPath)
    if (
      push?.schema !== "publication-push-receipt/v1" ||
      push.remote !== "origin" ||
      push.branch !== "main" ||
      !/^[a-f0-9]{40}$/.test(push.local_commit || "") ||
      push.remote_after_sha !== push.local_commit ||
      push.readback_error !== false ||
      typeof push.push_command_error !== "boolean" ||
      push.push_command_error !== (push.status === "remote_confirmed_after_push_error") ||
      (push.status === "remote_already_current" && push.remote_before_sha !== push.local_commit) ||
      !["remote_confirmed", "remote_confirmed_after_push_error", "remote_already_current"].includes(
        push.status,
      ) ||
      !Number.isFinite(Date.parse(push.created_at)) ||
      Date.parse(push.created_at) < Date.parse(pinned(root, input.execution).observed_at) ||
      pushPath !== `publication/push-attempts/${push.attempt_id}.json`
    )
      throw Error("Confirmed push for this authoring execution required")
    const manifest = pinned(root, input.preview)
    for (const row of [
      ...manifest.editions,
      ...manifest.knowledge,
      ...(manifest.navigation ? [manifest.navigation] : []),
    ])
      if (
        sha256(gitBytes(repository, ["show", `${push.local_commit}:vault/${row.path}`])) !==
        row.sha256
      )
        throw Error("Published commit differs from the approved authoring bytes")
    const file = directory(run) + "/push.json",
      previous = readJSON(root, file)
    if (previous) {
      const old = pinned(root, previous.push)
      if (old.local_commit !== push.local_commit)
        throw Error("Operation already owns a different publication commit")
      return previous
    }
    const result = {
      schema: "research-publication-operation-push/v1",
      input_sha256: sha256(JSON.stringify(input)),
      push: reference(root, pushPath),
      commit: push.local_commit,
      drive_observed_at: current.execution.observed_at,
    }
    atomicCreate(root, file, result)
    return result
  })
}

export async function recordPublicationDeployment({
  root,
  run,
  deployment,
  repository = process.cwd(),
}) {
  return withLock(root, "publication-operation-" + id(run), () => {
    binding(root, run)
    const push = readJSON(root, directory(run) + "/push.json")
    if (!push || pinned(root, push.push).local_commit !== push.commit)
      throw Error("Confirmed operation push required")
    const deployedCommit = assertPublicationDeploymentCommit({
      root,
      run,
      repository,
      commit: deployment?.headSha,
    })
    assertDeploymentProof(deployment, deployedCommit)
    const file = directory(run) + "/deployment.json",
      previous = readJSON(root, file)
    if (previous && JSON.stringify(previous) !== JSON.stringify(deployment))
      throw Error("Operation deployment changed")
    if (!previous) atomicCreate(root, file, deployment)
    return deployment
  })
}

export async function recordPublicationReadback({
  root,
  run,
  readbackRun,
  repository = process.cwd(),
}) {
  return withLock(root, "publication-operation-" + id(run), () => {
    const { input } = binding(root, run),
      push = readJSON(root, directory(run) + "/push.json")
    const deployment = readJSON(root, directory(run) + "/deployment.json")
    if (!push || pinned(root, push.push).local_commit !== push.commit)
      throw Error("Confirmed operation push required")
    const deploymentCommit = assertPublicationDeploymentCommit({
      root,
      run,
      repository,
      commit: deployment?.headSha,
    })
    assertDeploymentProof(deployment, deploymentCommit)
    const proof = loadVerifiedPublicReadback({
      root,
      run: readbackRun,
      previewRun: input.preview_run,
      repository,
      commit: deploymentCommit,
    })
    if (proof.actions_url !== deployment.url)
      throw Error("Operation and readback deployment differ")
    const result = {
      schema: "research-publication-operation-readback/v1",
      commit: deploymentCommit,
      input_sha256: sha256(JSON.stringify(input)),
      deployment_sha256: sha256(JSON.stringify(deployment)),
      readback: reference(root, proof.path),
      readback_run: readbackRun,
      status: "public_bytes_verified",
      new_regular_operation_counted: false,
      browser_verified: false,
      website_data_verified: false,
    }
    const file = directory(run) + "/public.json",
      previous = readJSON(root, file)
    if (previous && JSON.stringify(previous) !== JSON.stringify(result))
      throw Error("Operation public proof changed")
    if (!previous) atomicCreate(root, file, result)
    return result
  })
}

export function publicationOperationStatus({ root, run, repository = process.cwd() }) {
  const { input } = binding(root, run),
    base = directory(run)
  const push = readJSON(root, base + "/push.json"),
    deployment = readJSON(root, base + "/deployment.json"),
    publicProof = readJSON(root, base + "/public.json")
  let status = "drive_verified"
  let observationBasis = null
  if (push) {
    if (
      push.input_sha256 !== sha256(JSON.stringify(input)) ||
      pinned(root, push.push).local_commit !== push.commit
    )
      throw Error("Stored operation push changed")
    status = "remote_confirmed"
  }
  const deploymentCommit = deployment?.headSha || null
  if (deployment) {
    assertPublicationDeploymentCommit({ root, run, repository, commit: deploymentCommit })
    assertDeploymentProof(deployment, deploymentCommit)
    status = "deployment_verified"
  }
  if (publicProof) {
    if (
      publicProof.input_sha256 !== sha256(JSON.stringify(input)) ||
      publicProof.deployment_sha256 !== sha256(JSON.stringify(deployment)) ||
      publicProof.commit !== deploymentCommit
    )
      throw Error("Stored operation publication changed")
    const rb = loadVerifiedPublicReadback({
      root,
      run: publicProof.readback_run,
      previewRun: input.preview_run,
      repository,
      commit: deploymentCommit,
      historical: fs.existsSync(
        safePath(root, `runs/${publicProof.readback_run}/public-readback/archive.json`),
      ),
    })
    pinned(root, publicProof.readback)
    if (rb.actions_url !== deployment.url) throw Error("Stored operation deployment differs")
    status = "public_bytes_verified"
    observationBasis = fs.existsSync(
      safePath(root, `runs/${publicProof.readback_run}/public-readback/archive.json`),
    )
      ? "archived_observation"
      : "current_local_artifacts"
  }
  return {
    run_id: run,
    status,
    preview_run: input.preview_run,
    commit: push?.commit || null,
    deployment_commit: deploymentCommit,
    observation_basis: observationBasis,
    new_regular_operation_counted: false,
    browser_verified: false,
    website_data_verified: false,
    remote_current_verified: false,
  }
}

export function loadPublicationOperations(root, repository = process.cwd()) {
  const runs = safePath(root, "runs")
  if (!fs.existsSync(runs)) return { status: "missing", runs: [] }
  return {
    status: "read_only_publication_operations",
    runs: fs
      .readdirSync(runs, { withFileTypes: true })
      .filter(
        (e) =>
          e.isDirectory() &&
          fs.existsSync(safePath(root, `runs/${e.name}/publication-operation/input.json`)),
      )
      .map((e) => {
        try {
          return publicationOperationStatus({ root, run: e.name, repository })
        } catch (error) {
          return { run_id: e.name, status: "invalid", reason: error.message }
        }
      }),
  }
}
