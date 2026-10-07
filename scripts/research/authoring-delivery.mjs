import fs from "node:fs"
import path from "node:path"
import { sha256, PUBLIC_ROOTS } from "./contracts.mjs"
import {
  atomicCreate,
  atomicWrite,
  readJSON,
  safePath,
  withLock,
  withGardenOperationLock,
} from "./run-state.mjs"
import { authoringWriteSession, inspectedAuthoringRelease } from "./authoring-execution.mjs"
import { importVerifiedAuthoring } from "./authoring-import.mjs"
import { deliverApprovedPublication } from "./delivery-run.mjs"

export async function deliverAuthoringSession({
  root,
  sourceRoot,
  run,
  releasePath,
  repository = process.cwd(),
  acquisitionFile,
  snapshotFile,
  readbackFile,
  nextCapture,
  nextSnapshot,
  emit = () => {},
  resumeIntent = null,
  waitMs = 300000,
  statusOnly = false,
  now = Date.now,
  ...deliveryOptions
}) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(run || ""))
    throw Error("Exact authoring delivery run required")
  if (!Number.isSafeInteger(waitMs) || waitMs < 1 || waitMs > 600000)
    throw Error("Bounded connector wait required")
  repository = fs.realpathSync(repository)
  root = path.resolve(repository, root)
  const base = `runs/${run}/authoring-delivery`
  const previous = readJSON(root, base + "/input.json")
  sourceRoot = path.resolve(repository, sourceRoot || previous?.source_root || root)
  releasePath ||= previous?.release.path
  if (!releasePath) throw Error("Approved authoring release required")
  const input = {
    schema: "research-authoring-delivery-input/v1",
    run_id: run,
    source_root: sourceRoot,
    repository,
    release: {
      path: releasePath,
      sha256: sha256(fs.readFileSync(safePath(sourceRoot, releasePath))),
    },
  }
  if (previous && JSON.stringify(input) !== JSON.stringify(previous))
    throw Error("Authoring delivery input changed; use a new run")
  const options = { root, run, releasePath, repository, now, ...deliveryOptions }
  if (statusOnly) {
    const latest = readJSON(root, base + "/latest.json")
    if (latest && latest.input_sha256 !== sha256(JSON.stringify(input)))
      throw Error("Authoring delivery checkpoint changed")
    return fs.existsSync(safePath(root, `runs/${run}/publication-operation/input.json`))
      ? deliverApprovedPublication({ ...options, statusOnly: true })
      : {
          run_id: run,
          status: latest?.status || "authoring_pending",
          status_only: true,
          publication: null,
          new_regular_operation_counted: false,
        }
  }
  return withLock(root, "authoring-delivery-" + run, async () => {
    const checkpoint = (status, details = {}) => {
      const value = {
        schema: "research-authoring-delivery-checkpoint/v1",
        run_id: run,
        input_sha256: sha256(JSON.stringify(input)),
        observed_at: new Date(now()).toISOString(),
        status,
        new_regular_operation_counted: false,
        ...details,
      }
      atomicWrite(root, base + "/latest.json", value)
      emit({ type: "authoring_delivery_stage", ...value })
      return value
    }
    if (!previous) atomicCreate(root, base + "/input.json", input)
    if (fs.existsSync(safePath(root, `runs/${run}/publication-operation/input.json`))) {
      // The existing native operation already binds canonical authoring proof.
      // Never overwrite an older edition just to repeat its completed delivery.
      const result = await deliverApprovedPublication(options)
      checkpoint(result.status, { canonical_import_reused: true })
      return result
    }
    let writer
    try {
      if (acquisitionFile) {
        if (typeof nextCapture !== "function")
          throw Error("Post-write connector input callback required")
        const action = () =>
          authoringWriteSession({
            root: sourceRoot,
            releasePath,
            acquisitionFile,
            nextCapture,
            emit,
            now,
            waitMs,
            resumeIntent,
          })
        checkpoint("authoring_readback")
        writer = await (sourceRoot === root ? action() : withGardenOperationLock(root, action))
        if (writer.status !== "verified_complete")
          return checkpoint("authoring_recovery_required", { writer_status: writer.status })
      } else {
        const current = inspectedAuthoringRelease(sourceRoot, releasePath, {
          fresh: true,
          now: now(),
        })
        writer = { status: "verified_complete", observed_at: current.execution.observed_at }
      }
    } catch (error) {
      checkpoint("authoring_recovery_required")
      throw error
    }
    if (!snapshotFile || !readbackFile) {
      const prior = readJSON(root, `runs/${run}/authoring-import/input.json`)
      if (prior) {
        snapshotFile = safePath(root, `runs/${run}/authoring-import/source-snapshot.json`)
        readbackFile = safePath(root, `runs/${run}/authoring-import/source-readback.json`)
      } else {
        checkpoint("source_snapshot_required")
        emit({
          type: "source_snapshot_required",
          after: writer.observed_at,
          root_folder_id: "1VKWSC2IYOtOd__3NKEzD-BK34qVqtlAD",
          roots: PUBLIC_ROOTS,
        })
        if (typeof nextSnapshot !== "function") return checkpoint("source_snapshot_required")
        let timer
        try {
          const files = await Promise.race([
            Promise.resolve().then(nextSnapshot),
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(Error("Source snapshot input timed out")), waitMs)
            }),
          ])
          snapshotFile = files.snapshot_file
          readbackFile = files.readback_file
        } finally {
          clearTimeout(timer)
        }
      }
    }
    checkpoint("importing_canonical")
    const imported = await importVerifiedAuthoring({
      root,
      sourceRoot,
      run,
      releasePath,
      repository,
      snapshotFile,
      readbackFile,
      now,
      ...(deliveryOptions.execute ? { execute: deliveryOptions.execute } : {}),
    })
    checkpoint("canonical_verified", {
      import_receipt: `runs/${run}/authoring-import/receipt.json`,
      approved_files: imported.approved_files,
    })
    const delivered = await deliverApprovedPublication(options)
    checkpoint(delivered.status)
    return {
      ...delivered,
      canonical_import: { status: imported.status, reused: imported.reused, files: imported.files },
    }
  })
}
