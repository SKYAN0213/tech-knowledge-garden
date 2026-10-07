import fs from "node:fs"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { sha256 } from "./contracts.mjs"
import {
  atomicCreate,
  atomicWrite,
  DEFAULT_ROOT,
  readJSON,
  safePath,
  withGardenOperationLock,
  withLock,
} from "./run-state.mjs"
import {
  preparePublicationOperation,
  publicationOperationStatus,
  recordPublicationDeployment,
  recordPublicationReadback,
} from "./publication-operation.mjs"
import { assertDeploymentProof, verifyPublicReadback } from "./public-readback.mjs"
import { deliverRemoteArtifacts, inspectRemoteDelivery } from "./remote-delivery.mjs"

const GITHUB = "SKYAN0213/tech-knowledge-garden"
const WORKFLOW = "Publish Garden"
const executeFile = promisify(execFile)
export async function runDeliveryCommand(file, args, repository, options = {}) {
  // No shell, arbitrary task runner, automatic workflow dispatch or credentials.
  const result = await executeFile(file, args, {
    cwd: repository,
    timeout: file === "gh" ? 30_000 : 15 * 60_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, ...(options.env || {}) },
  })
  return result.stdout
}

// Reuse the status builder's already-validated native operations instead of
// rereading every authoring/public proof a second time for a progress panel.
export function deliveryCheckpointStatus(root, publicationOperations) {
  const runs = []
  for (const publication of publicationOperations.runs || []) {
    const base = `runs/${publication.run_id}/delivery`
    if (!fs.existsSync(safePath(root, base + "/input.json"))) continue
    try {
      const input = readJSON(root, base + "/input.json"),
        latest = readJSON(root, base + "/latest.json")
      if (
        publication.status === "invalid" ||
        input.schema !== "research-delivery-input/v1" ||
        input.run_id !== publication.run_id ||
        sha256(fs.readFileSync(safePath(root, input.release.path))) !== input.release.sha256 ||
        (latest &&
          (latest.schema !== "research-delivery-checkpoint/v1" ||
            latest.run_id !== input.run_id ||
            latest.input_sha256 !== sha256(JSON.stringify(input)) ||
            (latest.status === "public_bytes_verified" &&
              publication.status !== "public_bytes_verified")))
      )
        throw Error("Invalid delivery checkpoint")
      const remoteDelivery = inspectRemoteDelivery(root, input.run_id)
      runs.push({
        run_id: input.run_id,
        status: latest?.status || "checkpoint_pending",
        next_action: latest?.next_action || null,
        observed_at: latest?.observed_at || null,
        publication_status: publication.status,
        commit: publication.commit,
        new_regular_operation_counted: false,
        remote_delivery: remoteDelivery,
        website_data_verified: remoteDelivery?.website_data_verified === true,
        source_archive_verified: remoteDelivery?.source_archive_verified === true,
      })
    } catch {
      runs.push({
        run_id: publication.run_id,
        status: "invalid",
        publication_status: publication.status,
      })
    }
  }
  return { status: "read_only_delivery_checkpoints", runs }
}

// Connect existing verified stages; this controller never approves a candidate,
// edits authoring, or counts a retrospective delivery as a regular operation.
export async function deliverApprovedPublication({
  root = DEFAULT_ROOT,
  run,
  releasePath,
  repository = process.cwd(),
  statusOnly = false,
  retryPublish = false,
  actionsRun,
  waitSeconds = 0,
  execute = runDeliveryCommand,
  fetchImpl = fetch,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  emit = () => {},
  remotePlanFile,
  remoteAcquisitionFile,
  nextRemoteCapture,
  remoteEmit = () => {},
  resumeRemoteIntent = null,
  connectorWaitMs = 300000,
}) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(run || "")) throw Error("Exact delivery run ID required")
  if (!Number.isInteger(waitSeconds) || waitSeconds < 0 || waitSeconds > 60)
    throw Error("Delivery wait must be an integer from 0 to 60 seconds")
  if (actionsRun && !/^\d+$/.test(actionsRun)) throw Error("Exact Actions run ID required")
  repository = fs.realpathSync(repository)
  root = path.resolve(repository, root)
  const base = `runs/${run}/delivery`,
    operation = `runs/${run}/publication-operation`
  const options = { root, run, repository }
  const existing = readJSON(root, operation + "/input.json")
  releasePath ||= existing?.release.path
  if (!releasePath) throw Error("Approved, Drive-verified authoring release required")
  const input = {
    schema: "research-delivery-input/v1",
    run_id: run,
    repository,
    release: { path: releasePath, sha256: sha256(fs.readFileSync(safePath(root, releasePath))) },
    readback_run: run.slice(0, 72) + "-delivery-" + sha256(run).slice(0, 12),
  }
  function checkInput() {
    const previous = readJSON(root, base + "/input.json")
    if (previous && JSON.stringify(previous) !== JSON.stringify(input))
      throw Error("Delivery input changed; preserve this run and use a new operation")
    if (
      existing &&
      (existing.release.path !== releasePath || existing.release.sha256 !== input.release.sha256)
    )
      throw Error("Delivery release differs from the publication operation")
  }
  checkInput()
  if (statusOnly) {
    if (retryPublish || actionsRun || waitSeconds) throw Error("Status is read-only")
    const publication = publicationOperationStatus(options)
    return {
      ...publication,
      delivery: readJSON(root, base + "/latest.json"),
      remote_delivery: inspectRemoteDelivery(root, run),
      status_only: true,
    }
  }

  return withLock(root, "delivery-" + run, async () => {
    checkInput()
    if (!existing)
      await withGardenOperationLock(root, () =>
        preparePublicationOperation({
          ...options,
          releasePath,
          fresh: true,
          now: now(),
        }),
      )
    const bound = readJSON(root, operation + "/input.json")
    if (bound.release.path !== input.release.path || bound.release.sha256 !== input.release.sha256)
      throw Error("Delivery input differs from the pinned publication release")
    if (!readJSON(root, base + "/input.json")) atomicCreate(root, base + "/input.json", input)
    const reused = [],
      performed = []
    function checkpoint(status, publication, extra = {}) {
      const value = {
        schema: "research-delivery-checkpoint/v1",
        run_id: run,
        input_sha256: sha256(JSON.stringify(input)),
        observed_at: new Date(now()).toISOString(),
        status,
        publication,
        reused: [...reused],
        performed: [...performed],
        new_regular_operation_counted: false,
        website_data_verified: false,
        source_archive_verified: false,
        ...extra,
      }
      atomicWrite(root, base + "/latest.json", value)
      emit(value)
      return value
    }
    let publication = publicationOperationStatus(options)
    const finish = async () => {
      const remote =
        remotePlanFile || readJSON(root, `runs/${run}/remote-delivery/input.json`)
          ? await deliverRemoteArtifacts({
              root,
              run,
              repository,
              publication,
              planFile: remotePlanFile,
              acquisitionFile: remoteAcquisitionFile,
              nextCapture: nextRemoteCapture,
              emit: remoteEmit,
              execute,
              resumeIntent: resumeRemoteIntent,
              waitMs: connectorWaitMs,
              now,
            })
          : null
      return checkpoint("public_bytes_verified", publication, {
        remote_delivery: remote,
        website_data_verified: remote?.website_data_verified === true,
        source_archive_verified: remote?.source_archive_verified === true,
        next_action:
          remote?.status === "remote_delivery_complete"
            ? null
            : "Continue Research/WebsiteData remote delivery through exact raw-byte receipts",
      })
    }
    if (publication.status === "public_bytes_verified") {
      reused.push("publication", "deployment", "public_readback")
      return finish()
    }
    if (publication.status === "drive_verified") {
      if (root !== path.resolve(repository, DEFAULT_ROOT))
        throw Error("Publishing requires the canonical repository runtime root")
      const intent = readJSON(root, base + "/publish-intent.json")
      if (intent && !retryPublish)
        return checkpoint("publication_recovery_required", publication, {
          next_action: "Reconcile Git and push receipts before explicitly retrying publication",
        })
      if (!intent)
        atomicCreate(root, base + "/publish-intent.json", {
          input_sha256: sha256(JSON.stringify(input)),
          created_at: new Date(now()).toISOString(),
        })
      checkpoint("publishing", publication)
      let failed = false
      try {
        await execute(
          process.execPath,
          ["scripts/publish.mjs", "--operation", run, "--release", releasePath],
          repository,
        )
        performed.push("publication")
      } catch {
        // A lost response may follow a successful push. Only native receipts can
        // settle the result; do not issue the mutation again to find out.
        failed = true
      }
      publication = publicationOperationStatus(options)
      if (publication.status === "drive_verified")
        return checkpoint("publication_recovery_required", publication, {
          command_failed: failed,
          next_action: "Inspect the saved publish intent, Git state and native push receipts",
        })
    } else reused.push("publication")

    const deadline = now() + waitSeconds * 1000
    let deployment = readJSON(root, operation + "/deployment.json")
    if (deployment) reused.push("deployment")
    while (!deployment) {
      try {
        let selection = readJSON(root, base + "/actions-selection.json")
        if (
          selection &&
          (selection.commit !== publication.commit ||
            (actionsRun && selection.actions_run !== actionsRun))
        )
          throw Error("Pinned deployment selection changed")
        if (!selection) {
          let selected = actionsRun
          if (!selected) {
            const runs = JSON.parse(
              await execute(
                "gh",
                [
                  "run",
                  "list",
                  "--repo",
                  GITHUB,
                  "--workflow",
                  WORKFLOW,
                  "--commit",
                  publication.commit,
                  "--json",
                  "databaseId,headSha,workflowName",
                  "--limit",
                  "100",
                ],
                repository,
              ),
            )
            if (
              !Array.isArray(runs) ||
              runs.some((r) => r.headSha !== publication.commit || r.workflowName !== WORKFLOW)
            )
              throw Error("Unexpected deployment discovery result")
            if (runs.length > 1)
              return checkpoint("deployment_selection_required", publication, {
                actions_runs: runs.map((r) => String(r.databaseId)),
                next_action: "Select the exact Actions run with --actions-run",
              })
            selected = runs.length ? String(runs[0].databaseId) : null
          }
          if (selected) selection = { commit: publication.commit, actions_run: selected }
        }
        if (selection) {
          if (!/^\d+$/.test(selection.actions_run)) throw Error("Invalid deployment identity")
          const observation = JSON.parse(
            await execute(
              "gh",
              [
                "run",
                "view",
                selection.actions_run,
                "--repo",
                GITHUB,
                "--json",
                "status,conclusion,headSha,jobs,url,workflowName",
              ],
              repository,
            ),
          )
          if (
            observation.headSha !== publication.commit ||
            observation.workflowName !== WORKFLOW ||
            observation.url !== `https://github.com/${GITHUB}/actions/runs/${selection.actions_run}`
          )
            throw Error("Deployment identity differs from this publication")
          if (!readJSON(root, base + "/actions-selection.json"))
            atomicCreate(root, base + "/actions-selection.json", selection)
          if (observation.status === "completed") {
            if (observation.conclusion !== "success")
              return checkpoint("deployment_failed", publication, {
                actions_run: selection.actions_run,
                conclusion: observation.conclusion,
                next_action: "Inspect the failed workflow; no automatic rerun or replacement",
              })
            const { workflowName, ...proof } = observation
            assertDeploymentProof(proof, publication.commit)
            deployment = await withGardenOperationLock(root, () =>
              recordPublicationDeployment({ ...options, deployment: proof }),
            )
            performed.push("deployment")
            break
          }
          if (
            !["queued", "in_progress", "requested", "waiting", "pending"].includes(
              observation.status,
            )
          )
            throw Error("Unrecognized deployment state")
        }
      } catch (error) {
        if (
          /selection changed|identity differs|Unexpected|Invalid|Unrecognized|exact commit/.test(
            error.message,
          )
        )
          throw error
        // Do not expose command stderr, tokens, signed URLs or source bodies.
        return checkpoint("deployment_observation_failed", publication, {
          next_action: "Check GitHub availability and resume the same delivery run",
        })
      }
      const pending = checkpoint("waiting_deployment", publication, {
        next_action: "Resume this delivery run; no new build or push",
      })
      if (now() >= deadline) return pending
      await sleep(Math.min(10_000, Math.max(1, deadline - now())))
    }

    publication = publicationOperationStatus(options)
    checkpoint("checking_public_bytes", publication)
    try {
      await withGardenOperationLock(root, async () => {
        await verifyPublicReadback({
          root,
          run: input.readback_run,
          previewRun: publication.preview_run,
          repository,
          commit: publication.commit,
          deployment,
          fetchImpl,
        })
        await recordPublicationReadback({ ...options, readbackRun: input.readback_run })
      })
    } catch {
      return checkpoint("public_readback_failed", publication, {
        next_action:
          "Inspect native public-readback evidence and resume only after resolving the failure",
      })
    }
    performed.push("public_readback")
    publication = publicationOperationStatus(options)
    return finish()
  })
}
